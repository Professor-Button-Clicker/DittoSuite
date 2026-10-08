// DittoAdapter.swift
// DittoSuite — Forensic Collection Tool
//
// Thin wrapper around /usr/bin/ditto. Uses Process with argument arrays only,
// never shell. Captures raw stdout/stderr, hashes them, records full InvocationRecord.
// WHY: FR-08, FR-09 -- the exact invocation must be recorded, and shell
// interpolation must never occur. This adapter is the ONLY code that calls ditto.

import Foundation

// MARK: - Copy options

/// Options for a ditto copy operation.
/// WHY: Each option is explicitly named so the invocation record unambiguously
/// documents which flags were used. No hidden defaults.
struct DittoCopyOptions: Sendable {
    var preserveResourceForks: Bool = true   // --rsrc
    var preserveExtattr: Bool = true          // --extattr
    var preserveACLs: Bool = true             // --acl
    var preserveQuarantine: Bool = true       // --qtn
    var verbose: Bool = true                  // -V (one line per file to stderr)
    var noCrossDev: Bool = false              // -X
    var noCache: Bool = false                 // --nocache

    static let `default` = DittoCopyOptions()
}

// MARK: - Protocol

protocol DittoAdapterProtocol: Sendable {
    /// Copy source to destination using ditto with full metadata preservation.
    /// Returns the invocation record and any per-file errors parsed from stderr.
    /// Does NOT verify the copy -- that is the VerificationEngine's job.
    func copy(
        source: String,
        destination: String,
        options: DittoCopyOptions,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, [PerFileError])
}

// MARK: - Implementation

/// Production DittoAdapter that wraps /usr/bin/ditto.
final class DittoAdapter: DittoAdapterProtocol, @unchecked Sendable {
    /// Absolute path to the ditto binary.
    /// WHY: Absolute paths prevent PATH manipulation attacks.
    static let binaryPath = "/usr/bin/ditto"

    /// Default timeout for ditto copy operations (1 hour).
    /// WHY: Large sources may take a long time. Write speed is ~70% of native
    /// when writing to a sparsebundle, so timeouts must account for this.
    static let defaultTimeout: TimeInterval = 3600

    /// SHA-256 of the ditto binary, computed at session start.
    private var binarySHA256: String?

    /// Cached macOS version info.
    private var cachedVersion: String?
    private var cachedBuild: String?

    // MARK: - Initialization

    /// Verify the binary exists, is executable, and compute its hash.
    /// WHY: FR-07 -- the binary hash is recorded to detect unexpected changes.
    func initialize() throws {
        let fm = FileManager.default

        // WHY: Check existence first. A missing binary is a fatal error.
        guard fm.fileExists(atPath: Self.binaryPath) else {
            throw InvocationError.binaryNotFound(path: Self.binaryPath)
        }
        guard fm.isExecutableFile(atPath: Self.binaryPath) else {
            throw InvocationError.binaryNotExecutable(path: Self.binaryPath)
        }

        // WHY: Check it's not a symlink to an unexpected location.
        // A symlink to, say, a user-controlled binary would be a security issue.
        let attrs = try fm.attributesOfItem(atPath: Self.binaryPath)
        if let fileType = attrs[.type] as? FileAttributeType,
           fileType == .typeSymbolicLink {
            let target = try fm.destinationOfSymbolicLink(atPath: Self.binaryPath)
            // Allow symlinks within /usr/bin (Apple may symlink between paths)
            if !target.hasPrefix("/usr/") && !target.hasPrefix("/System/") {
                throw InvocationError.binaryIsSymlinkToUnexpected(
                    path: Self.binaryPath, target: target
                )
            }
        }

        // Compute SHA-256
        binarySHA256 = try HashService.sha256OfFile(atPath: Self.binaryPath)

        // Cache OS version
        let (version, build) = try SystemInfo.macOSVersionAndBuild()
        cachedVersion = version
        cachedBuild = build
    }

    // MARK: - Copy

    func copy(
        source: String,
        destination: String,
        options: DittoCopyOptions,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, [PerFileError]) {
        // Ensure initialized
        if binarySHA256 == nil {
            try initialize()
        }

        // WHY: Path validation prevents null byte injection and non-absolute paths.
        try validatePath(source, label: "source")
        try validatePath(destination, label: "destination")

        // WHY: Build argument array programmatically. NEVER string interpolation.
        var arguments: [String] = []

        // Metadata preservation flags
        if options.preserveResourceForks { arguments.append("--rsrc") }
        if options.preserveExtattr { arguments.append("--extattr") }
        if options.preserveACLs { arguments.append("--acl") }
        if options.preserveQuarantine { arguments.append("--qtn") }
        if options.verbose { arguments.append("-V") }
        if options.noCrossDev { arguments.append("-X") }
        if options.noCache { arguments.append("--nocache") }

        // WHY: Source and destination are appended as separate array elements.
        // This is the core defense against shell injection (FR-09).
        arguments.append(source)
        arguments.append(destination)

        // Build scrubbed environment
        let environment = Self.scrubbedEnvironment()

        // Record start time
        let startTime = Date()

        // WHY: Use Process with argument array. Never /bin/sh -c.
        let process = Process()
        process.executableURL = URL(fileURLWithPath: Self.binaryPath)
        process.arguments = arguments
        process.environment = environment
        process.currentDirectoryURL = URL(fileURLWithPath: "/")

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        // WHY: Read pipe data before waitUntilExit to avoid deadlock.
        // If the pipe buffer fills, the child process blocks, and waitUntilExit
        // blocks the parent -- classic deadlock.
        var stdoutData = Data()
        var stderrData = Data()
        var timedOut = false
        var wasCancelled = false

        // Set up timeout
        // WHY: FR-12 -- explicit timeouts prevent runaway processes.
        // On timeout: SIGTERM, wait 5s, then SIGKILL.
        let timeoutTask = Task {
            try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
            if process.isRunning {
                timedOut = true
                // WHY: SIGTERM allows graceful cleanup. SIGKILL is the fallback.
                process.terminate()  // SIGTERM
                try await Task.sleep(nanoseconds: 5_000_000_000)  // 5 seconds
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

        // WHY: Read stdout and stderr completely before waiting for exit.
        stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()

        process.waitUntilExit()
        timeoutTask.cancel()

        let endTime = Date()

        // Build invocation record (FR-08, FR-31)
        let record = InvocationRecord(
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
            wasCancelled: wasCancelled
        )

        // Parse per-file errors from stderr
        let perFileErrors = Self.parseStderrErrors(stderrData)

        return (record, perFileErrors)
    }

    // MARK: - Environment scrubbing

    /// Build a minimal, scrubbed environment for subprocess execution.
    /// WHY: FR-10 -- environment variables like DITTONORSRC and DITTOABORT
    /// can silently change ditto's behavior. DYLD_* variables can inject
    /// code into the process. We remove all of these.
    static func scrubbedEnvironment() -> [String: String] {
        var env: [String: String] = [
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
            "LC_ALL": "en_US.UTF-8",
            "TZ": "UTC",
        ]

        // Preserve HOME and TMPDIR from the current process
        if let home = ProcessInfo.processInfo.environment["HOME"] {
            env["HOME"] = home
        }
        if let tmpdir = ProcessInfo.processInfo.environment["TMPDIR"] {
            env["TMPDIR"] = tmpdir
        }

        // WHY: Explicitly do NOT include:
        // - DITTONORSRC (would disable resource fork/extattr/ACL preservation)
        // - DITTOABORT (would cause abort() on errors instead of continuing)
        // - DYLD_* (could inject malicious code)
        // - LD_* (same injection risk)
        // - CFNETWORK_* (not needed; no network operations)
        // - NSUnbufferedIO (could affect I/O behavior)

        return env
    }

    // MARK: - Stderr parsing

    /// Parse ditto stderr for per-file error lines.
    /// WHY: ditto continues past per-file errors and reports them on stderr.
    /// We must capture each one individually so the report can list exactly
    /// which files failed and why.
    static func parseStderrErrors(_ data: Data) -> [PerFileError] {
        guard let stderr = String(data: data, encoding: .utf8) else { return [] }

        var errors: [PerFileError] = []
        let lines = stderr.split(separator: "\n", omittingEmptySubsequences: true)

        for line in lines {
            let lineStr = String(line)

            if lineStr.contains("Operation not permitted") {
                let path = extractPath(from: lineStr)
                errors.append(PerFileError(
                    path: path,
                    errorType: .operationNotPermitted,
                    rawMessage: lineStr
                ))
            } else if lineStr.contains("Permission denied") {
                let path = extractPath(from: lineStr)
                errors.append(PerFileError(
                    path: path,
                    errorType: .permissionDenied,
                    rawMessage: lineStr
                ))
            } else if lineStr.contains("No such file or directory") {
                let path = extractPath(from: lineStr)
                errors.append(PerFileError(
                    path: path,
                    errorType: .noSuchFileOrDirectory,
                    rawMessage: lineStr
                ))
            }
        }

        return errors
    }

    /// Best-effort extraction of the file path from a ditto error line.
    private static func extractPath(from line: String) -> String {
        // ditto error lines typically look like:
        // ditto: /path/to/file: Operation not permitted
        // We extract the path between "ditto: " and the last ": "
        if line.hasPrefix("ditto: ") {
            let afterPrefix = String(line.dropFirst("ditto: ".count))
            if let range = afterPrefix.range(of: ": ", options: .backwards) {
                return String(afterPrefix[..<range.lowerBound])
            }
            return afterPrefix
        }
        return line
    }

    // MARK: - Path validation

    /// Validate a path for forensic safety.
    /// WHY: Null bytes can truncate paths at the C level. Non-absolute paths
    /// are ambiguous. Both are rejected.
    private func validatePath(_ path: String, label: String) throws {
        guard !path.contains("\0") else {
            throw InvocationError.pathContainsNullByte(path: path)
        }
        guard path.hasPrefix("/") else {
            throw InvocationError.pathNotAbsolute(path: path)
        }
    }
}
