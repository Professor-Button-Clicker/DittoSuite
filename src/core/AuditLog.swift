// AuditLog.swift
// DittoSuite — Forensic Collection Tool
//
// Append-only, hash-chained, tamper-evident log.
// WHY: FR-05 -- the audit log provides a complete, verifiable record of
// every action taken during the collection session. Hash chaining makes
// any modification or deletion detectable. This is critical for
// chain-of-custody documentation.

import Foundation

// MARK: - Event types

/// All possible audit event types in a collection session.
/// WHY: A fixed enum of event types ensures consistent categorization
/// across sessions and prevents ad-hoc event naming that could be
/// inconsistent or confusing in court testimony.
enum AuditEventType: String, Codable, Sendable {
    case sessionStart
    case caseSetup
    case bundleCreated
    case bundleReused
    case sourceSelected
    case preflightCompleted
    case sourceManifestBuilt
    case collectionStarted
    case dittoInvocation
    case collectionCompleted
    case collectionCancelled
    case verificationStarted
    case verificationCompleted
    case bundleDetached
    case reportGenerated
    case sessionEnd
    case error
    case warning
}

// MARK: - Audit log entry

/// A single entry in the tamper-evident audit log.
/// WHY: Each entry is hash-chained to the previous one. Modifying or deleting
/// any entry breaks the chain, making tampering detectable (FR-05).
struct AuditLogEntry: Codable, Sendable {
    let sequenceNumber: UInt64
    let timestamp: Date                     // UTC
    let eventType: AuditEventType
    let details: [String: String]           // key-value details
    let previousEntryHash: String           // SHA-256 of previous entry's JSON ("" for first)
    var entryHash: String                   // SHA-256 of this entry with entryHash=""
}

// MARK: - Audit log writer

/// Append-only, hash-chained audit log.
/// WHY: The log is opened in append-only mode. We never overwrite or delete entries.
/// The hash chain is maintained by including the previous entry's hash in each new entry.
final class AuditLog: @unchecked Sendable {
    private let logFileURL: URL
    private var sequenceNumber: UInt64 = 0
    private var lastEntryHash: String = ""
    private let lock = NSLock()
    private let encoder: JSONEncoder
    private let dateFormatter: ISO8601DateFormatter

    /// Create or open an audit log at the given path.
    /// - Parameter path: Absolute path to the JSON Lines audit log file.
    init(path: String) throws {
        self.logFileURL = URL(fileURLWithPath: path)

        self.encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        self.dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        // WHY: Create the file if it doesn't exist, but never truncate.
        // Append-only semantics are critical for tamper evidence.
        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: path) {
            let directory = logFileURL.deletingLastPathComponent().path
            try fileManager.createDirectory(
                atPath: directory,
                withIntermediateDirectories: true
            )
            fileManager.createFile(atPath: path, contents: nil)
        } else {
            // Resume from existing log: find last sequence number and hash
            try resumeFromExisting()
        }
    }

    /// Append an event to the audit log.
    /// - Parameters:
    ///   - eventType: The type of event.
    ///   - details: Key-value pairs with event-specific details.
    /// - Returns: The sequence number of the appended entry.
    @discardableResult
    func log(
        eventType: AuditEventType,
        details: [String: String]
    ) throws -> UInt64 {
        lock.lock()
        defer { lock.unlock() }

        sequenceNumber += 1

        // Build entry with empty hash first
        var entry = AuditLogEntry(
            sequenceNumber: sequenceNumber,
            timestamp: Date(),
            eventType: eventType,
            details: details,
            previousEntryHash: lastEntryHash,
            entryHash: ""
        )

        // WHY: Compute entryHash over the entry with entryHash set to "".
        // This allows verification: recompute the hash the same way and compare.
        let jsonForHashing = try encoder.encode(entry)
        entry.entryHash = HashService.sha256(of: jsonForHashing)

        // Encode the final entry (with hash filled in)
        let finalJSON = try encoder.encode(entry)

        // WHY: Write as a JSON Line (one JSON object per line).
        // Append a newline to ensure each entry is on its own line.
        guard var lineData = String(data: finalJSON, encoding: .utf8) else {
            throw AuditLogError.encodingFailed
        }
        lineData.append("\n")

        guard let lineBytes = lineData.data(using: .utf8) else {
            throw AuditLogError.encodingFailed
        }

        // WHY: O_WRONLY|O_APPEND provides kernel-level atomic append.
        // NSLock guards in-process ordering; O_APPEND guarantees each
        // write is appended atomically at the OS level.
        let fd = open(logFileURL.path, O_WRONLY | O_APPEND)
        guard fd >= 0 else {
            throw AuditLogError.fileNotWritable(path: logFileURL.path)
        }
        defer { Darwin.close(fd) }
        let written = lineBytes.withUnsafeBytes { ptr in
            Darwin.write(fd, ptr.baseAddress!, ptr.count)
        }
        guard written == lineBytes.count else {
            throw AuditLogError.fileNotWritable(path: logFileURL.path)
        }

        lastEntryHash = entry.entryHash
        return sequenceNumber
    }

    /// Convenience: log an error with path and reason.
    func logError(path: String?, reason: String, context: String) throws {
        var details: [String: String] = [
            "reason": reason,
            "context": context
        ]
        if let path = path {
            details["path"] = path
        }
        try log(eventType: .error, details: details)
    }

    /// Convenience: log a warning.
    func logWarning(message: String, context: String) throws {
        try log(eventType: .warning, details: [
            "message": message,
            "context": context
        ])
    }

    /// Get the path to the log file.
    var filePath: String {
        logFileURL.path
    }

    /// Compute SHA-256 of the complete audit log file.
    /// WHY: The audit log hash is included in the final report, allowing
    /// future verification that the log has not been modified.
    func computeLogHash() throws -> String {
        return try HashService.sha256OfFile(atPath: logFileURL.path)
    }

    // MARK: - Verification

    /// Verify the hash chain integrity of the audit log.
    /// Returns nil if valid, or a description of the first broken link.
    /// WHY: This allows detecting any modification or deletion of log entries.
    static func verifyChain(atPath path: String) throws -> String? {
        let content = try String(contentsOfFile: path, encoding: .utf8)
        let lines = content.split(separator: "\n", omittingEmptySubsequences: true)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        var previousHash = ""

        for (index, line) in lines.enumerated() {
            guard let lineData = line.data(using: .utf8) else {
                return "Line \(index + 1): cannot decode as UTF-8"
            }

            var entry: AuditLogEntry
            do {
                entry = try decoder.decode(AuditLogEntry.self, from: lineData)
            } catch {
                return "Line \(index + 1): JSON decode failed: \(error)"
            }

            // Check previousEntryHash
            if entry.previousEntryHash != previousHash {
                return "Line \(index + 1): previousEntryHash mismatch. " +
                    "Expected \(previousHash), got \(entry.previousEntryHash)"
            }

            // Recompute entryHash
            let storedHash = entry.entryHash
            entry.entryHash = ""
            let jsonForHashing = try encoder.encode(entry)
            let computedHash = HashService.sha256(of: jsonForHashing)

            if computedHash != storedHash {
                return "Line \(index + 1): entryHash mismatch. " +
                    "Computed \(computedHash), stored \(storedHash)"
            }

            previousHash = storedHash
        }

        return nil  // Chain is valid
    }

    // MARK: - Private

    /// Resume sequence numbers and last hash from an existing log file.
    private func resumeFromExisting() throws {
        let content = try String(contentsOf: logFileURL, encoding: .utf8)
        let lines = content.split(separator: "\n", omittingEmptySubsequences: true)
        guard let lastLine = lines.last,
              let lastData = lastLine.data(using: .utf8) else {
            return  // Empty file, start fresh
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let lastEntry = try decoder.decode(AuditLogEntry.self, from: lastData)
        self.sequenceNumber = lastEntry.sequenceNumber
        self.lastEntryHash = lastEntry.entryHash
    }
}

// MARK: - Errors

enum AuditLogError: Error, CustomStringConvertible {
    case encodingFailed
    case fileNotWritable(path: String)

    var description: String {
        switch self {
        case .encodingFailed:
            return "Failed to encode audit log entry"
        case .fileNotWritable(let path):
            return "Audit log file not writable: \(path)"
        }
    }
}
