// InvocationRecord.swift
// DittoSuite — Forensic Collection Tool
//
// Structured record of every subprocess invocation.
// Every call to /usr/bin/ditto or /usr/bin/hdiutil produces one of these.
// Nothing is discarded: raw stdout/stderr are captured and hashed.

import Foundation

// MARK: - InvocationRecord

/// A complete, immutable record of a single subprocess invocation.
/// WHY: Courts require proof of exactly what was executed, when, with what arguments,
/// and what the tool produced. This record is the single source of truth for each
/// invocation of an upstream tool.
struct InvocationRecord: Codable, Identifiable, Sendable {
    let id: UUID                          // unique invocation ID
    let toolPath: String                  // absolute path, e.g. "/usr/bin/ditto"
    let toolSHA256: String                // SHA-256 of the binary at toolPath
    let macOSVersion: String              // e.g. "14.5"
    let macOSBuild: String                // e.g. "23F79"
    let arguments: [String]               // full argument array (no shell expansion)
    let workingDirectory: String          // absolute path
    let environment: [String: String]     // scrubbed environment used
    let locale: String                    // LC_ALL / LANG value
    let timezone: String                  // TZ value (always "UTC")
    let startTimeUTC: Date                // start time in UTC
    let endTimeUTC: Date                  // end time in UTC
    let durationSeconds: Double           // wall-clock duration
    let exitCode: Int32                   // process exit code
    let rawStdout: Data                   // complete raw stdout bytes
    let rawStdoutSHA256: String           // SHA-256 of rawStdout
    let rawStderr: Data                   // complete raw stderr bytes
    let rawStderrSHA256: String           // SHA-256 of rawStderr
    let timedOut: Bool                    // whether the process was killed by timeout
    let wasCancelled: Bool                // whether the user cancelled
}

// MARK: - Per-file error extracted from stderr

/// A structured error extracted from ditto/hdiutil stderr output.
/// WHY: Per-file errors must be individually tracked so the report can list exactly
/// which files were and were not collected, with the reason for each failure.
struct PerFileError: Codable, Sendable {
    let path: String
    let errorType: PerFileErrorType
    let rawMessage: String
}

enum PerFileErrorType: String, Codable, Sendable {
    case operationNotPermitted   // TCC / SIP denial
    case permissionDenied        // POSIX permission
    case noSuchFileOrDirectory   // source disappeared
    case other
}

// MARK: - System info helpers

/// Reads macOS version and build from sw_vers.
/// WHY: The exact OS version is recorded per invocation because tool behavior
/// can change between OS builds (even within the same major version).
enum SystemInfo {
    /// Returns (productVersion, buildVersion) e.g. ("14.5", "23F79").
    /// Throws if sw_vers cannot be executed.
    static func macOSVersionAndBuild() throws -> (version: String, build: String) {
        let version = try runSwVers(flag: "-productVersion")
        let build = try runSwVers(flag: "-buildVersion")
        return (version, build)
    }

    private static func runSwVers(flag: String) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/sw_vers")
        process.arguments = [flag]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        // WHY: Argument array invocation -- never shell string.
        try process.run()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            throw InvocationError.swVersFailure(exitCode: process.terminationStatus)
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let result = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !result.isEmpty else {
            throw InvocationError.swVersEmptyOutput
        }
        return result
    }
}

// MARK: - Errors

enum InvocationError: Error, CustomStringConvertible {
    case binaryNotFound(path: String)
    case binaryNotExecutable(path: String)
    case binaryIsSymlinkToUnexpected(path: String, target: String)
    case swVersFailure(exitCode: Int32)
    case swVersEmptyOutput
    case processLaunchFailed(path: String, underlying: Error)
    case timeout(path: String, arguments: [String], durationSeconds: Double)
    case pathContainsNullByte(path: String)
    case pathNotAbsolute(path: String)

    var description: String {
        switch self {
        case .binaryNotFound(let path):
            return "Binary not found at path: \(path)"
        case .binaryNotExecutable(let path):
            return "Binary not executable at path: \(path)"
        case .binaryIsSymlinkToUnexpected(let path, let target):
            return "Binary at \(path) is a symlink to unexpected location: \(target)"
        case .swVersFailure(let code):
            return "sw_vers failed with exit code \(code)"
        case .swVersEmptyOutput:
            return "sw_vers returned empty output"
        case .processLaunchFailed(let path, let underlying):
            return "Failed to launch \(path): \(underlying.localizedDescription)"
        case .timeout(let path, let args, let duration):
            return "Process \(path) timed out after \(duration)s with args: \(args)"
        case .pathContainsNullByte(let path):
            return "Path contains null byte: \(path)"
        case .pathNotAbsolute(let path):
            return "Path is not absolute: \(path)"
        }
    }
}
