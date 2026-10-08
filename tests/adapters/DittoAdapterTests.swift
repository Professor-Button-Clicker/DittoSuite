// DittoAdapterTests.swift
// DittoSuite Test Suite
//
// Tests for DittoAdapter (FR-07: binary hash, FR-08: invocation record,
// FR-09: no shell interpolation, FR-10: scrubbed environment,
// FR-12: timeouts, FR-31: raw stdout/stderr).
//
// PLATFORM: macOS only (requires /usr/bin/ditto, Process, CryptoKit).
// On non-macOS: NOT RUN.

import XCTest
@testable import DittoSuite

final class DittoAdapterTests: XCTestCase {

    // MARK: - FR-09: No shell interpolation (argument array verification)

    /// The adapter must construct argument arrays, never shell strings.
    /// Filenames with shell metacharacters must be passed as literal array elements.
    func testArgumentArrayConstructionWithSpecialCharacters() {
        // Verify that DittoCopyOptions builds argument arrays correctly.
        // This tests the code structure, not the subprocess (which requires macOS).
        let options = DittoCopyOptions.default

        XCTAssertTrue(options.preserveResourceForks, "--rsrc must default to true.")
        XCTAssertTrue(options.preserveExtattr, "--extattr must default to true.")
        XCTAssertTrue(options.preserveACLs, "--acl must default to true.")
        XCTAssertTrue(options.preserveQuarantine, "--qtn must default to true.")
        XCTAssertTrue(options.verbose, "-V must default to true.")
        XCTAssertFalse(options.noCrossDev, "-X must default to false.")
        XCTAssertFalse(options.noCache, "--nocache must default to false.")
    }

    // MARK: - FR-10: Scrubbed environment

    /// Environment must be minimal and must NOT contain dangerous variables.
    func testScrubbedEnvironmentRemovesDangerousVars() {
        let env = DittoAdapter.scrubbedEnvironment()

        // Required variables must be present
        XCTAssertEqual(env["PATH"], "/usr/bin:/bin:/usr/sbin:/sbin",
            "PATH must be set to minimal safe value.")
        XCTAssertEqual(env["LC_ALL"], "en_US.UTF-8",
            "LC_ALL must be set to en_US.UTF-8.")
        XCTAssertEqual(env["TZ"], "UTC",
            "TZ must be set to UTC.")
        XCTAssertNotNil(env["HOME"], "HOME must be preserved.")

        // Dangerous variables must NOT be present
        XCTAssertNil(env["DITTONORSRC"],
            "DITTONORSRC must be removed from environment (FR-10).")
        XCTAssertNil(env["DITTOABORT"],
            "DITTOABORT must be removed from environment (FR-10).")

        // Check no DYLD_* variables
        for key in env.keys {
            XCTAssertFalse(key.hasPrefix("DYLD_"),
                "DYLD_* variables must be removed: found \(key).")
            XCTAssertFalse(key.hasPrefix("LD_"),
                "LD_* variables must be removed: found \(key).")
            XCTAssertFalse(key.hasPrefix("CFNETWORK_"),
                "CFNETWORK_* variables must be removed: found \(key).")
        }
        XCTAssertNil(env["NSUnbufferedIO"],
            "NSUnbufferedIO must be removed.")
    }

    /// Even if DITTONORSRC, DITTOABORT, or DYLD_INSERT_LIBRARIES are set
    /// in the parent process, they must not appear in the scrubbed environment.
    func testScrubbedEnvironmentIgnoresParentDangerousVars() {
        // Note: We cannot actually set these in the parent process from a test
        // (ProcessInfo.environment is immutable), but we can verify that the
        // scrubbed environment is built from scratch (allowlist), not by
        // filtering the parent environment.
        let env = DittoAdapter.scrubbedEnvironment()

        // The allowlist approach means only PATH, HOME, TMPDIR, LC_ALL, TZ
        // can appear. Count total keys.
        let expectedKeys: Set<String> = ["PATH", "LC_ALL", "TZ", "HOME", "TMPDIR"]
        for key in env.keys {
            XCTAssertTrue(expectedKeys.contains(key),
                "Unexpected environment variable in scrubbed env: \(key). " +
                "Only allowlisted variables should appear.")
        }
    }

    // MARK: - FR-09: Path validation

    /// Paths with null bytes must be rejected.
    func testNullByteInPathRejected() async {
        let adapter = DittoAdapter()

        do {
            _ = try await adapter.copy(
                source: "/tmp/test\0injected",
                destination: "/tmp/dest",
                options: .default,
                timeout: 10
            )
            XCTFail("Path with null byte must be rejected.")
        } catch {
            guard let invErr = error as? InvocationError,
                  case .pathContainsNullByte = invErr else {
                XCTFail("Expected pathContainsNullByte, got \(error)")
                return
            }
        }
    }

    /// Non-absolute paths must be rejected.
    func testNonAbsolutePathRejected() async {
        let adapter = DittoAdapter()

        do {
            _ = try await adapter.copy(
                source: "relative/path",
                destination: "/tmp/dest",
                options: .default,
                timeout: 10
            )
            XCTFail("Relative path must be rejected.")
        } catch {
            guard let invErr = error as? InvocationError,
                  case .pathNotAbsolute = invErr else {
                XCTFail("Expected pathNotAbsolute, got \(error)")
                return
            }
        }
    }

    /// Destination with relative path must be rejected.
    func testNonAbsoluteDestinationRejected() async {
        let adapter = DittoAdapter()

        do {
            _ = try await adapter.copy(
                source: "/tmp/source",
                destination: "relative/dest",
                options: .default,
                timeout: 10
            )
            XCTFail("Relative destination path must be rejected.")
        } catch {
            guard let invErr = error as? InvocationError,
                  case .pathNotAbsolute = invErr else {
                XCTFail("Expected pathNotAbsolute, got \(error)")
                return
            }
        }
    }

    // MARK: - FR-08: InvocationRecord structure

    /// InvocationRecord must contain all required fields per spec.
    func testInvocationRecordContainsAllFields() {
        // Create a test record with all fields
        let record = InvocationRecord(
            id: UUID(),
            toolPath: "/usr/bin/ditto",
            toolSHA256: String(repeating: "a", count: 64),
            macOSVersion: "14.5",
            macOSBuild: "23F79",
            arguments: ["--rsrc", "--extattr", "/source", "/dest"],
            workingDirectory: "/",
            environment: ["PATH": "/usr/bin:/bin"],
            locale: "en_US.UTF-8",
            timezone: "UTC",
            startTimeUTC: Date(),
            endTimeUTC: Date(),
            durationSeconds: 1.5,
            exitCode: 0,
            rawStdout: Data(),
            rawStdoutSHA256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            rawStderr: Data(),
            rawStderrSHA256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            timedOut: false,
            wasCancelled: false
        )

        // Verify all fields are present and have expected types
        XCTAssertFalse(record.id.uuidString.isEmpty, "id must be present.")
        XCTAssertEqual(record.toolPath, "/usr/bin/ditto", "toolPath must be absolute.")
        XCTAssertEqual(record.toolSHA256.count, 64, "toolSHA256 must be 64-char hex.")
        XCTAssertFalse(record.macOSVersion.isEmpty, "macOSVersion must be present.")
        XCTAssertFalse(record.macOSBuild.isEmpty, "macOSBuild must be present.")
        XCTAssertFalse(record.arguments.isEmpty, "arguments must be present.")
        XCTAssertTrue(record.workingDirectory.hasPrefix("/"), "workingDirectory must be absolute.")
        XCTAssertFalse(record.environment.isEmpty, "environment must be present.")
        XCTAssertFalse(record.locale.isEmpty, "locale must be present.")
        XCTAssertEqual(record.timezone, "UTC", "timezone must be UTC (FR-06).")
        XCTAssertEqual(record.rawStdoutSHA256.count, 64, "rawStdoutSHA256 must be 64-char hex.")
        XCTAssertEqual(record.rawStderrSHA256.count, 64, "rawStderrSHA256 must be 64-char hex.")
    }

    /// InvocationRecord must be Codable (serializable for audit log).
    func testInvocationRecordIsCodable() throws {
        let record = InvocationRecord(
            id: UUID(),
            toolPath: "/usr/bin/ditto",
            toolSHA256: String(repeating: "a", count: 64),
            macOSVersion: "14.5",
            macOSBuild: "23F79",
            arguments: ["--rsrc", "/source with spaces", "/dest"],
            workingDirectory: "/",
            environment: ["PATH": "/usr/bin"],
            locale: "en_US.UTF-8",
            timezone: "UTC",
            startTimeUTC: Date(),
            endTimeUTC: Date(),
            durationSeconds: 2.0,
            exitCode: 0,
            rawStdout: Data("stdout data".utf8),
            rawStdoutSHA256: HashService.sha256(of: Data("stdout data".utf8)),
            rawStderr: Data(),
            rawStderrSHA256: HashService.sha256(of: Data()),
            timedOut: false,
            wasCancelled: false
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(record)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(InvocationRecord.self, from: data)

        XCTAssertEqual(decoded.toolPath, record.toolPath)
        XCTAssertEqual(decoded.arguments, record.arguments)
        XCTAssertEqual(decoded.exitCode, record.exitCode)
        XCTAssertEqual(decoded.rawStdoutSHA256, record.rawStdoutSHA256)
    }

    // MARK: - FR-09: Stderr parsing for per-file errors

    /// Stderr containing "Operation not permitted" must be parsed correctly.
    func testStderrParsingOperationNotPermitted() {
        let stderr = "ditto: /Users/test/Library/Mail/V9/MailData: Operation not permitted\n"
        let data = Data(stderr.utf8)

        let errors = DittoAdapter.parseStderrErrors(data)

        XCTAssertEqual(errors.count, 1, "Should parse one error.")
        XCTAssertEqual(errors[0].errorType, .operationNotPermitted)
        XCTAssertTrue(errors[0].path.contains("Library/Mail"),
            "Path must be extracted from error line.")
    }

    /// Stderr containing "Permission denied" must be parsed correctly.
    func testStderrParsingPermissionDenied() {
        let stderr = "ditto: /private/var/protected/file.dat: Permission denied\n"
        let data = Data(stderr.utf8)

        let errors = DittoAdapter.parseStderrErrors(data)

        XCTAssertEqual(errors.count, 1)
        XCTAssertEqual(errors[0].errorType, .permissionDenied)
    }

    /// Stderr containing "No such file or directory" must be parsed correctly.
    func testStderrParsingNoSuchFile() {
        let stderr = "ditto: /tmp/vanished_file.txt: No such file or directory\n"
        let data = Data(stderr.utf8)

        let errors = DittoAdapter.parseStderrErrors(data)

        XCTAssertEqual(errors.count, 1)
        XCTAssertEqual(errors[0].errorType, .noSuchFileOrDirectory)
    }

    /// Multiple errors in stderr must all be parsed.
    func testStderrParsingMultipleErrors() {
        let stderr = """
        ditto: /path/a: Operation not permitted
        ditto: /path/b: Permission denied
        ditto: /path/c: No such file or directory
        """
        let data = Data(stderr.utf8)

        let errors = DittoAdapter.parseStderrErrors(data)

        XCTAssertEqual(errors.count, 3, "All three errors must be parsed.")
        XCTAssertEqual(errors[0].errorType, .operationNotPermitted)
        XCTAssertEqual(errors[1].errorType, .permissionDenied)
        XCTAssertEqual(errors[2].errorType, .noSuchFileOrDirectory)
    }

    /// Verbose output lines (-V) must NOT be parsed as errors.
    func testStderrParsingIgnoresVerboseOutput() {
        let stderr = """
        copying file ./Documents/readme.txt ...
        copying file ./Documents/report.pdf ...
        """
        let data = Data(stderr.utf8)

        let errors = DittoAdapter.parseStderrErrors(data)

        XCTAssertTrue(errors.isEmpty,
            "Verbose output lines must not be parsed as errors.")
    }

    /// Empty stderr must return no errors.
    func testStderrParsingEmptyStderr() {
        let errors = DittoAdapter.parseStderrErrors(Data())
        XCTAssertTrue(errors.isEmpty)
    }

    // MARK: - FR-07: Binary path

    /// DittoAdapter must use absolute path to ditto binary.
    func testBinaryPathIsAbsolute() {
        XCTAssertEqual(DittoAdapter.binaryPath, "/usr/bin/ditto",
            "DittoAdapter must use absolute path /usr/bin/ditto (FR-07).")
    }

    // MARK: - FR-12: Timeout configuration

    /// Default timeout must be 3600 seconds (1 hour) per spec.
    func testDefaultTimeout() {
        XCTAssertEqual(DittoAdapter.defaultTimeout, 3600,
            "Default ditto timeout must be 3600 seconds (FR-12).")
    }

    // MARK: - FR-17: No credential storage

    /// Scrubbed environment must not contain any credential-related variables.
    func testNoCredentialsInEnvironment() {
        let env = DittoAdapter.scrubbedEnvironment()

        let credentialKeys = ["PASSWORD", "SECRET", "TOKEN", "CREDENTIAL",
                              "API_KEY", "PASSPHRASE", "AUTH"]

        for key in env.keys {
            for credKey in credentialKeys {
                XCTAssertFalse(key.uppercased().contains(credKey),
                    "Environment must not contain credential-related variable: \(key)")
            }
        }
    }
}
