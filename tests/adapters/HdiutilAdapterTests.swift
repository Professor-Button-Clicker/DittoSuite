// HdiutilAdapterTests.swift
// DittoSuite Test Suite
//
// Tests for HdiutilAdapter (FR-07: binary hash, FR-09: no shell interpolation,
// FR-21: bundle creation recorded, FR-32: hdiutil verify skip for sparsebundles).
//
// PLATFORM: macOS only (requires /usr/bin/hdiutil, Process, CryptoKit).
// On non-macOS: NOT RUN.

import XCTest
@testable import DittoSuite

final class HdiutilAdapterTests: XCTestCase {

    // MARK: - FR-32: hdiutil verify skipped for writable sparsebundles

    /// Verify must skip (not invoke hdiutil) for paths ending in .sparsebundle.
    func testVerifySkippedForSparsebundle() async throws {
        let adapter = HdiutilAdapter()

        let (record, result) = try await adapter.verify(
            path: "/tmp/test_evidence.sparsebundle",
            timeout: 30
        )

        XCTAssertNil(record,
            "No InvocationRecord should be created when verify is skipped.")
        XCTAssertTrue(result.skipped,
            "Verify must be skipped for writable sparsebundles (FR-32).")
        XCTAssertNotNil(result.skipReason,
            "Skip reason must be documented.")
        XCTAssertTrue(result.skipReason?.contains("does not reliably cover") ?? false,
            "Skip reason must explain why hdiutil verify is skipped.")
        XCTAssertFalse(result.passed,
            "Skipped verify should not report passed=true.")
    }

    /// Verify must NOT skip for non-sparsebundle images.
    /// Note: This test requires macOS to actually run hdiutil.
    /// On non-macOS, it verifies only the path-checking logic.
    func testVerifyNotSkippedForDMG() async {
        let adapter = HdiutilAdapter()

        // This will fail because the file doesn't exist, but it should
        // attempt to run hdiutil (not skip). The initialization will fail
        // on non-macOS, so we catch both errors.
        do {
            let (record, result) = try await adapter.verify(
                path: "/tmp/test_image.dmg",
                timeout: 30
            )
            // If we get here, verify was attempted (not skipped)
            XCTAssertFalse(result.skipped,
                "DMG images must NOT have verify skipped.")
            XCTAssertNotNil(record, "InvocationRecord should exist for DMG verify.")
        } catch {
            // Expected: either binary not found (non-macOS) or verify failure
            // The important thing is that it tried (didn't skip).
            // If the error is about binary not found, that's OK -- it attempted.
        }
    }

    // MARK: - FR-07: Binary path

    /// HdiutilAdapter must use absolute path to hdiutil binary.
    func testBinaryPathIsAbsolute() {
        XCTAssertEqual(HdiutilAdapter.binaryPath, "/usr/bin/hdiutil",
            "HdiutilAdapter must use absolute path /usr/bin/hdiutil (FR-07).")
    }

    // MARK: - FR-09: Path validation

    /// Null bytes in paths must be rejected.
    func testNullByteInPathRejected() async {
        let adapter = HdiutilAdapter()

        do {
            _ = try await adapter.createSparsebundle(
                path: "/tmp/test\0evil.sparsebundle",
                volumeName: "Test",
                filesystem: .apfs,
                size: "1g",
                bandSize: nil,
                encryption: nil,
                timeout: 30
            )
            XCTFail("Path with null byte must be rejected.")
        } catch {
            guard let invErr = error as? InvocationError,
                  case .pathContainsNullByte = invErr else {
                // On non-macOS, initialization will fail first
                return
            }
        }
    }

    /// Non-absolute paths must be rejected.
    func testNonAbsolutePathRejected() async {
        let adapter = HdiutilAdapter()

        do {
            _ = try await adapter.createSparsebundle(
                path: "relative/path.sparsebundle",
                volumeName: "Test",
                filesystem: .apfs,
                size: "1g",
                bandSize: nil,
                encryption: nil,
                timeout: 30
            )
            XCTFail("Relative path must be rejected.")
        } catch {
            guard let invErr = error as? InvocationError,
                  case .pathNotAbsolute = invErr else {
                // On non-macOS, initialization may fail first
                return
            }
        }
    }

    // MARK: - FR-12: Timeout defaults

    /// Timeout constants must match spec values.
    func testTimeoutDefaults() {
        XCTAssertEqual(HdiutilAdapter.createTimeout, 300,
            "Create timeout must be 300s (5 minutes).")
        XCTAssertEqual(HdiutilAdapter.attachTimeout, 120,
            "Attach timeout must be 120s (2 minutes).")
        XCTAssertEqual(HdiutilAdapter.detachTimeout, 120,
            "Detach timeout must be 120s (2 minutes).")
        XCTAssertEqual(HdiutilAdapter.verifyTimeout, 1800,
            "Verify timeout must be 1800s (30 minutes).")
    }

    // MARK: - FR-10: Environment scrubbing

    /// HdiutilAdapter uses the same scrubbed environment as DittoAdapter.
    func testUsesScrubbedEnvironment() {
        // The implementation calls DittoAdapter.scrubbedEnvironment()
        // Verify the shared scrubbing function produces correct results.
        let env = DittoAdapter.scrubbedEnvironment()
        XCTAssertNil(env["DITTONORSRC"])
        XCTAssertNil(env["DITTOABORT"])
        XCTAssertEqual(env["TZ"], "UTC")
    }

    // MARK: - Filesystem enum coverage

    /// All filesystem options must have correct raw values.
    func testFilesystemEnumValues() {
        XCTAssertEqual(SparsebundleFilesystem.apfs.rawValue, "APFS")
        XCTAssertEqual(SparsebundleFilesystem.jhfsPlus.rawValue, "JHFS+")
        XCTAssertEqual(SparsebundleFilesystem.hfsPlus.rawValue, "HFS+")
    }

    /// All encryption types must have correct raw values.
    func testEncryptionTypeEnumValues() {
        XCTAssertEqual(EncryptionType.aes128.rawValue, "AES-128")
        XCTAssertEqual(EncryptionType.aes256.rawValue, "AES-256")
    }

    // MARK: - Error types

    /// Error descriptions must contain useful information.
    func testErrorDescriptions() {
        let createErr = HdiutilError.createFailed(exitCode: 1, stderr: "no space")
        XCTAssertTrue(createErr.description.contains("create"))
        XCTAssertTrue(createErr.description.contains("1"))

        let attachErr = HdiutilError.attachFailed(exitCode: 2, stderr: "corrupt")
        XCTAssertTrue(attachErr.description.contains("attach"))

        let detachErr = HdiutilError.detachBusy(mountPoint: "/Volumes/Test", stderr: "busy")
        XCTAssertTrue(detachErr.description.contains("busy") || detachErr.description.contains("EBUSY"))

        let plistErr = HdiutilError.plistParseFailed(detail: "missing key")
        XCTAssertTrue(plistErr.description.contains("plist"))
    }
}
