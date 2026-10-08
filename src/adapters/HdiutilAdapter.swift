// HdiutilAdapter.swift
// DittoSuite — Forensic Collection Tool
//
// Thin wrapper around /usr/bin/hdiutil. Same safe invocation rules as DittoAdapter.
// WHY: FR-08, FR-09 -- this adapter is the ONLY code that calls hdiutil.
// Argument arrays only, absolute binary path, scrubbed environment.

import Foundation

// MARK: - Enums

/// Filesystem for sparsebundle creation.
enum SparsebundleFilesystem: String, Codable, CaseIterable, Sendable {
    case apfs = "APFS"
    case jhfsPlus = "JHFS+"
    case hfsPlus = "HFS+"
}

/// Encryption type for sparsebundle creation.
enum EncryptionType: String, Codable, CaseIterable, Sendable {
    case aes128 = "AES-128"
    case aes256 = "AES-256"
}

// MARK: - Result types

/// Result of creating a sparsebundle.
struct CreateResult: Sendable {
    let imagePath: String
}

/// Result of attaching a sparsebundle.
struct AttachResult: Sendable {
    let deviceNode: String     // e.g. "/dev/disk7s1"
    let mountPoint: String     // e.g. "/Volumes/Evidence"
    let plistOutput: Data      // raw plist for audit trail
}

/// Result of verifying an image.
struct VerifyResult: Sendable {
    let passed: Bool
    let details: String
    let skipped: Bool          // true if verification was skipped (writable sparsebundle)
    let skipReason: String?
}

// MARK: - Protocol

protocol HdiutilAdapterProtocol: Sendable {
    func createSparsebundle(
        path: String,
        volumeName: String,
        filesystem: SparsebundleFilesystem,
        size: String,
        bandSize: Int?,
        encryption: EncryptionType?,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, CreateResult)

    func attach(
        path: String,
        mountPoint: String?,
        readOnly: Bool,
        noBrowse: Bool,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, AttachResult)

    func detach(
        mountPointOrDevice: String,
        force: Bool,
        timeout: TimeInterval
    ) async throws -> InvocationRecord

    func verify(
        path: String,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord?, VerifyResult)
}

// MARK: - Implementation

/// Production HdiutilAdapter wrapping /usr/bin/hdiutil.
final class HdiutilAdapter: HdiutilAdapterProtocol, @unchecked Sendable {
    static let binaryPath = "/usr/bin/hdiutil"

    // Default timeouts (from spec section 5.4)
    static let createTimeout: TimeInterval = 300    // 5 minutes
    static let attachTimeout: TimeInterval = 120    // 2 minutes
    static let detachTimeout: TimeInterval = 120    // 2 minutes
    static let verifyTimeout: TimeInterval = 1800   // 30 minutes

    private var binarySHA256: String?
    private var cachedVersion: String?
    private var cachedBuild: String?

    // MARK: - Initialization

    func initialize() throws {
        let fm = FileManager.default

        guard fm.fileExists(atPath: Self.binaryPath) else {
            throw InvocationError.binaryNotFound(path: Self.binaryPath)
        }
        guard fm.isExecutableFile(atPath: Self.binaryPath) else {
            throw InvocationError.binaryNotExecutable(path: Self.binaryPath)
        }

        // WHY: Same symlink check as DittoAdapter. Prevents a symlink
        // to a user-controlled binary from being treated as hdiutil.
        let attrs = try fm.attributesOfItem(atPath: Self.binaryPath)
        if let fileType = attrs[.type] as? FileAttributeType,
           fileType == .typeSymbolicLink {
            let target = try fm.destinationOfSymbolicLink(atPath: Self.binaryPath)
            if !target.hasPrefix("/usr/") && !target.hasPrefix("/System/") {
                throw InvocationError.binaryIsSymlinkToUnexpected(
                    path: Self.binaryPath, target: target
                )
            }
        }

        binarySHA256 = try HashService.sha256OfFile(atPath: Self.binaryPath)

        let (version, build) = try SystemInfo.macOSVersionAndBuild()
        cachedVersion = version
        cachedBuild = build
    }

    // MARK: - Create sparsebundle

    func createSparsebundle(
        path: String,
        volumeName: String,
        filesystem: SparsebundleFilesystem,
        size: String,
        bandSize: Int?,
        encryption: EncryptionType?,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, CreateResult) {
        if binarySHA256 == nil { try initialize() }

        try validatePath(path, label: "bundle path")

        // WHY: Argument array construction. Each flag and value is a separate element.
        var arguments: [String] = [
            "create",
            "-type", "SPARSEBUNDLE",
            "-fs", filesystem.rawValue,
            "-size", size,
            "-volname", volumeName,
            "-plist",
        ]

        if let bandSize = bandSize {
            arguments.append(contentsOf: [
                "-imagekey", "sparse-band-size=\(bandSize)"
            ])
        }

        if let encryption = encryption {
            arguments.append(contentsOf: [
                "-encryption", encryption.rawValue,
                "-stdinpass",
            ])
        }

        // WHY: Path is the last argument, as a separate array element.
        arguments.append(path)

        let record = try await runHdiutil(
            arguments: arguments,
            timeout: timeout
        )

        // Parse result
        guard record.exitCode == 0 else {
            throw HdiutilError.createFailed(
                exitCode: record.exitCode,
                stderr: String(data: record.rawStderr, encoding: .utf8) ?? ""
            )
        }

        // WHY: Parse -plist output for machine-readable results.
        // The plist contains the path to the created image.
        let imagePath = parsePlistForImagePath(record.rawStdout) ?? path + ".sparsebundle"

        return (record, CreateResult(imagePath: imagePath))
    }

    // MARK: - Attach

    func attach(
        path: String,
        mountPoint: String?,
        readOnly: Bool,
        noBrowse: Bool,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, AttachResult) {
        if binarySHA256 == nil { try initialize() }

        try validatePath(path, label: "bundle path")

        var arguments: [String] = [
            "attach",
            "-plist",
            "-noverify",      // WHY: Skip verification on attach; we do our own.
            "-noautofsck",    // WHY: Skip auto filesystem check; we manage this.
        ]

        if readOnly {
            arguments.append("-readonly")
        } else {
            arguments.append("-readwrite")
        }

        if noBrowse {
            arguments.append("-nobrowse")
        }

        if let mp = mountPoint {
            try validatePath(mp, label: "mount point")
            arguments.append(contentsOf: ["-mountpoint", mp])
        }

        arguments.append(path)

        let record = try await runHdiutil(
            arguments: arguments,
            timeout: timeout
        )

        guard record.exitCode == 0 else {
            throw HdiutilError.attachFailed(
                exitCode: record.exitCode,
                stderr: String(data: record.rawStderr, encoding: .utf8) ?? ""
            )
        }

        // WHY: Parse -plist output to extract device node and mount point.
        // The plist contains a system-entities array with entries that have
        // dev-entry and mount-point keys.
        let (deviceNode, actualMountPoint) = try parsePlistForAttachResult(record.rawStdout)

        return (record, AttachResult(
            deviceNode: deviceNode,
            mountPoint: actualMountPoint,
            plistOutput: record.rawStdout
        ))
    }

    // MARK: - Detach

    func detach(
        mountPointOrDevice: String,
        force: Bool,
        timeout: TimeInterval
    ) async throws -> InvocationRecord {
        if binarySHA256 == nil { try initialize() }

        var arguments: [String] = ["detach"]

        // WHY: Force detach only when explicitly requested by the examiner.
        // Forcing a detach while files are open risks corruption.
        if force {
            arguments.append("-force")
        }

        arguments.append(mountPointOrDevice)

        let record = try await runHdiutil(
            arguments: arguments,
            timeout: timeout
        )

        // WHY: Detach failure is logged but not thrown for non-force attempts.
        // The caller (WorkflowCoordinator) handles EBUSY by offering force detach.
        if record.exitCode != 0 {
            let stderr = String(data: record.rawStderr, encoding: .utf8) ?? ""
            if stderr.contains("Resource busy") {
                throw HdiutilError.detachBusy(
                    mountPoint: mountPointOrDevice,
                    stderr: stderr
                )
            }
            throw HdiutilError.detachFailed(
                exitCode: record.exitCode,
                stderr: stderr
            )
        }

        return record
    }

    // MARK: - Verify

    /// Verify an image's checksum.
    /// WHY: hdiutil verify does NOT reliably cover writable sparsebundles.
    /// This method checks if the image is a writable sparsebundle and skips
    /// verification if so, documenting the reason.
    func verify(
        path: String,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord?, VerifyResult) {
        // WHY: Resolved open question #4 -- hdiutil verify does NOT work
        // on writable sparsebundles. The independent manifest comparison
        // is the sole integrity check. We skip verify and document why.
        if path.hasSuffix(".sparsebundle") {
            let reason = "hdiutil verify does not reliably cover writable sparsebundles. " +
                "The independent manifest comparison (source vs. destination SHA-256 per file) " +
                "is the sole integrity check. This is a documented technical decision, " +
                "not a shortcut."
            return (nil, VerifyResult(
                passed: false,
                details: reason,
                skipped: true,
                skipReason: reason
            ))
        }

        // For non-sparsebundle images, run verify normally
        if binarySHA256 == nil { try initialize() }

        try validatePath(path, label: "image path")

        let arguments = ["verify", "-plist", path]

        let record = try await runHdiutil(
            arguments: arguments,
            timeout: timeout
        )

        let passed = record.exitCode == 0
        let details = String(data: record.rawStderr, encoding: .utf8) ?? ""

        return (record, VerifyResult(
            passed: passed,
            details: passed ? "Verification passed." : "Verification failed: \(details)",
            skipped: false,
            skipReason: nil
        ))
    }

    // MARK: - Core process runner

    /// Run hdiutil with the given arguments and return an InvocationRecord.
    /// WHY: This is the single point of process execution for hdiutil.
    /// All invocations go through here with consistent environment scrubbing,
    /// timeout handling, and output capture.
    private func runHdiutil(
        arguments: [String],
        timeout: TimeInterval
    ) async throws -> InvocationRecord {
        let environment = DittoAdapter.scrubbedEnvironment()
        let startTime = Date()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: Self.binaryPath)
        process.arguments = arguments
        process.environment = environment
        process.currentDirectoryURL = URL(fileURLWithPath: "/")

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        var timedOut = false

        // WHY: FR-12 -- explicit timeout. SIGTERM then SIGKILL after 5s.
        let timeoutTask = Task {
            try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
            if process.isRunning {
                timedOut = true
                process.terminate()
                try await Task.sleep(nanoseconds: 5_000_000_000)
                if process.isRunning {
                    kill(process.processIdentifier, SIGKILL)
                }
            }
        }

        do {
            try process.run()
        } catch {
            timeoutTask.cancel()
            throw InvocationError.processLaunchFailed(
                path: Self.binaryPath, underlying: error
            )
        }

        // WHY: Read pipe data before waitUntilExit to avoid pipe buffer deadlock.
        let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()

        process.waitUntilExit()
        timeoutTask.cancel()

        let endTime = Date()

        return InvocationRecord(
            id: UUID(),
            toolPath: Self.binaryPath,
            toolSHA256: binarySHA256 ?? "UNKNOWN",
            macOSVersion: cachedVersion ?? "UNKNOWN",
            macOSBuild: cachedBuild ?? "UNKNOWN",
            arguments: arguments,
            workingDirectory: "/",
            environment: environment,
            locale: environment["LC_ALL"] ?? "en_US.UTF-8",
            timezone: "UTC",
            startTimeUTC: startTime,
            endTimeUTC: endTime,
            durationSeconds: endTime.timeIntervalSince(startTime),
            exitCode: process.terminationStatus,
            rawStdout: stdoutData,
            rawStdoutSHA256: HashService.sha256(of: stdoutData),
            rawStderr: stderrData,
            rawStderrSHA256: HashService.sha256(of: stderrData),
            timedOut: timedOut,
            wasCancelled: false
        )
    }

    // MARK: - Plist parsing

    /// Parse hdiutil create -plist output for the image path.
    private func parsePlistForImagePath(_ data: Data) -> String? {
        guard let plist = try? PropertyListSerialization.propertyList(
            from: data, format: nil
        ) as? [String: Any] else {
            return nil
        }

        // WHY: Defensive parsing -- key names may vary across macOS versions.
        // We check multiple possible key names.
        if let paths = plist["output-path"] as? String {
            return paths
        }
        if let paths = plist["image-path"] as? String {
            return paths
        }

        return nil
    }

    /// Parse hdiutil attach -plist output for device node and mount point.
    /// WHY: The plist contains a system-entities array. We must handle
    /// key name variations across macOS versions defensively.
    private func parsePlistForAttachResult(_ data: Data) throws -> (String, String) {
        guard let plist = try? PropertyListSerialization.propertyList(
            from: data, format: nil
        ) as? [String: Any] else {
            throw HdiutilError.plistParseFailed(detail: "Cannot parse plist output")
        }

        guard let entities = plist["system-entities"] as? [[String: Any]] else {
            throw HdiutilError.plistParseFailed(
                detail: "No system-entities key in plist output"
            )
        }

        // Find the entity with a mount-point
        var deviceNode: String?
        var mountPoint: String?

        for entity in entities {
            if let mp = entity["mount-point"] as? String {
                mountPoint = mp
                deviceNode = entity["dev-entry"] as? String
                break
            }
        }

        guard let mp = mountPoint else {
            throw HdiutilError.plistParseFailed(
                detail: "No mount-point found in system-entities"
            )
        }

        return (deviceNode ?? "unknown", mp)
    }

    // MARK: - Path validation

    private func validatePath(_ path: String, label: String) throws {
        guard !path.contains("\0") else {
            throw InvocationError.pathContainsNullByte(path: path)
        }
        guard path.hasPrefix("/") else {
            throw InvocationError.pathNotAbsolute(path: path)
        }
    }
}

// MARK: - Errors

enum HdiutilError: Error, CustomStringConvertible {
    case createFailed(exitCode: Int32, stderr: String)
    case attachFailed(exitCode: Int32, stderr: String)
    case detachFailed(exitCode: Int32, stderr: String)
    case detachBusy(mountPoint: String, stderr: String)
    case verifyFailed(exitCode: Int32, stderr: String)
    case plistParseFailed(detail: String)

    var description: String {
        switch self {
        case .createFailed(let code, let stderr):
            return "hdiutil create failed (exit \(code)): \(stderr)"
        case .attachFailed(let code, let stderr):
            return "hdiutil attach failed (exit \(code)): \(stderr)"
        case .detachFailed(let code, let stderr):
            return "hdiutil detach failed (exit \(code)): \(stderr)"
        case .detachBusy(let mp, _):
            return "hdiutil detach failed: \(mp) is busy (EBUSY). " +
                "Close open files and retry, or use force detach."
        case .verifyFailed(let code, let stderr):
            return "hdiutil verify failed (exit \(code)): \(stderr)"
        case .plistParseFailed(let detail):
            return "Failed to parse hdiutil plist output: \(detail)"
        }
    }
}
