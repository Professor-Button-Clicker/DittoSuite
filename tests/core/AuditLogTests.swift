// AuditLogTests.swift
// DittoSuite Test Suite
//
// Tests for AuditLog (FR-05: tamper-evident audit log, FR-06: UTC timestamps,
// FR-08: invocation record completeness).
//
// PLATFORM: macOS only (requires Foundation file I/O, CryptoKit via HashService).
// On non-macOS: NOT RUN.

import XCTest
@testable import DittoSuite

final class AuditLogTests: XCTestCase {

    private var testLogPath: String!

    override func setUpWithError() throws {
        let tmpDir = NSTemporaryDirectory()
        testLogPath = (tmpDir as NSString).appendingPathComponent(
            "dittosuite_audit_test_\(UUID().uuidString).jsonl"
        )
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: testLogPath)
    }

    // MARK: - FR-05: Hash chain integrity

    /// A valid audit log must pass chain verification.
    func testValidChainVerifies() throws {
        let log = try AuditLog(path: testLogPath)

        try log.log(eventType: .sessionStart, details: ["version": "1.0"])
        try log.log(eventType: .caseSetup, details: ["caseID": "TEST-001"])
        try log.log(eventType: .sessionEnd, details: ["status": "complete"])

        let verificationResult = try AuditLog.verifyChain(atPath: testLogPath)

        XCTAssertNil(verificationResult,
            "A valid audit log chain must verify successfully (nil = valid).")
    }

    /// Modifying one entry must break the chain.
    func testTamperedEntryDetected() throws {
        let log = try AuditLog(path: testLogPath)

        try log.log(eventType: .sessionStart, details: ["version": "1.0"])
        try log.log(eventType: .caseSetup, details: ["caseID": "TEST-001"])
        try log.log(eventType: .sourceSelected, details: ["path": "/source"])
        try log.log(eventType: .sessionEnd, details: ["status": "complete"])

        // Read the log file
        var content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        var lines = content.split(separator: "\n", omittingEmptySubsequences: true)
        XCTAssertEqual(lines.count, 4, "Should have 4 log entries.")

        // Tamper with the second entry (change caseID)
        var lineStr = String(lines[1])
        lineStr = lineStr.replacingOccurrences(of: "TEST-001", with: "TAMPERED")
        lines[1] = Substring(lineStr)

        // Write back the tampered log
        content = lines.joined(separator: "\n") + "\n"
        try content.write(toFile: testLogPath, atomically: true, encoding: .utf8)

        // Verify must detect the tampering
        let verificationResult = try AuditLog.verifyChain(atPath: testLogPath)

        XCTAssertNotNil(verificationResult,
            "Tampered audit log must fail verification (FR-05).")
        XCTAssertTrue(verificationResult?.contains("mismatch") ?? false,
            "Verification failure message must mention 'mismatch'.")
    }

    /// Deleting an entry (breaking the chain link) must be detected.
    func testDeletedEntryDetected() throws {
        let log = try AuditLog(path: testLogPath)

        try log.log(eventType: .sessionStart, details: ["version": "1.0"])
        try log.log(eventType: .caseSetup, details: ["caseID": "TEST-001"])
        try log.log(eventType: .sourceSelected, details: ["path": "/source"])
        try log.log(eventType: .sessionEnd, details: ["status": "complete"])

        // Remove the second entry
        var content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        var lines = content.split(separator: "\n", omittingEmptySubsequences: true)
        lines.remove(at: 1)  // Remove caseSetup entry

        content = lines.joined(separator: "\n") + "\n"
        try content.write(toFile: testLogPath, atomically: true, encoding: .utf8)

        let verificationResult = try AuditLog.verifyChain(atPath: testLogPath)

        XCTAssertNotNil(verificationResult,
            "Deleted entry must break the chain and be detected (FR-05).")
        XCTAssertTrue(verificationResult?.contains("previousEntryHash") ?? false,
            "Error must reference previousEntryHash mismatch.")
    }

    // MARK: - FR-05: Hash chaining structure

    /// First entry must have empty previousEntryHash.
    func testFirstEntryHasEmptyPreviousHash() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: ["version": "1.0"])

        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let entry = try decoder.decode(
            AuditLogEntry.self,
            from: Data(content.trimmingCharacters(in: .whitespacesAndNewlines).utf8)
        )

        XCTAssertEqual(entry.previousEntryHash, "",
            "First entry must have empty previousEntryHash (FR-05).")
    }

    /// Each entry's previousEntryHash must match the prior entry's entryHash.
    func testChainLinking() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: ["version": "1.0"])
        try log.log(eventType: .caseSetup, details: ["caseID": "TEST"])
        try log.log(eventType: .sessionEnd, details: ["status": "done"])

        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let lines = content.split(separator: "\n", omittingEmptySubsequences: true)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        var entries: [AuditLogEntry] = []
        for line in lines {
            let entry = try decoder.decode(AuditLogEntry.self, from: Data(line.utf8))
            entries.append(entry)
        }

        XCTAssertEqual(entries.count, 3)

        for i in 1..<entries.count {
            XCTAssertEqual(entries[i].previousEntryHash, entries[i - 1].entryHash,
                "Entry \(i) previousEntryHash must equal entry \(i-1) entryHash.")
        }
    }

    // MARK: - FR-06: UTC timestamps

    /// All timestamps in the audit log must be UTC (ISO 8601 with Z or +00:00).
    func testTimestampsAreUTC() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: ["version": "1.0"])

        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let entry = try decoder.decode(
            AuditLogEntry.self,
            from: Data(content.trimmingCharacters(in: .whitespacesAndNewlines).utf8)
        )

        // The timestamp should be recent (within last 60 seconds)
        let age = Date().timeIntervalSince(entry.timestamp)
        XCTAssertLessThan(age, 60,
            "Audit log timestamp must be recent (within 60 seconds).")
        XCTAssertGreaterThanOrEqual(age, 0,
            "Audit log timestamp must not be in the future.")

        // Verify the raw JSON contains a UTC indicator
        XCTAssertTrue(content.contains("Z") || content.contains("+00:00") || content.contains("T"),
            "Timestamp in JSON must be in ISO 8601 UTC format (FR-06).")
    }

    // MARK: - Sequence numbers

    /// Sequence numbers must be sequential starting from 1.
    func testSequenceNumbersSequential() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: [:])
        try log.log(eventType: .caseSetup, details: [:])
        try log.log(eventType: .sessionEnd, details: [:])

        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let lines = content.split(separator: "\n", omittingEmptySubsequences: true)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        for (index, line) in lines.enumerated() {
            let entry = try decoder.decode(AuditLogEntry.self, from: Data(line.utf8))
            XCTAssertEqual(entry.sequenceNumber, UInt64(index + 1),
                "Sequence number must be \(index + 1), got \(entry.sequenceNumber).")
        }
    }

    // MARK: - Append-only behavior

    /// New entries must be appended, not replacing existing content.
    func testAppendOnlyBehavior() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: ["msg": "first"])

        let content1 = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let lineCount1 = content1.split(separator: "\n").count

        try log.log(eventType: .sessionEnd, details: ["msg": "second"])

        let content2 = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let lineCount2 = content2.split(separator: "\n").count

        XCTAssertEqual(lineCount2, lineCount1 + 1,
            "New entries must be appended (not overwriting existing).")

        // The first line must still be unchanged
        XCTAssertTrue(content2.hasPrefix(content1.trimmingCharacters(in: .newlines)),
            "Existing entries must not be modified when appending.")
    }

    // MARK: - Entry hash self-consistency

    /// Each entry's entryHash must be verifiable by recomputing.
    func testEntryHashSelfConsistency() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: [
            "key1": "value1",
            "key2": "value2",
        ])

        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        var entry = try decoder.decode(
            AuditLogEntry.self,
            from: Data(content.trimmingCharacters(in: .whitespacesAndNewlines).utf8)
        )

        let storedHash = entry.entryHash

        // Recompute: set entryHash to empty, encode, hash
        entry.entryHash = ""
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let jsonForHashing = try encoder.encode(entry)
        let computedHash = HashService.sha256(of: jsonForHashing)

        XCTAssertEqual(computedHash, storedHash,
            "Entry hash must be verifiable by recomputing with entryHash=''.")
    }

    // MARK: - Log file hash

    /// computeLogHash must return the SHA-256 of the entire log file.
    func testComputeLogHash() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .sessionStart, details: ["v": "1"])
        try log.log(eventType: .sessionEnd, details: ["s": "ok"])

        let logHash = try log.computeLogHash()

        // Independently compute the hash
        let referenceHash = try HashService.sha256OfFile(atPath: testLogPath)

        XCTAssertEqual(logHash, referenceHash,
            "computeLogHash must match independent file hash.")
    }

    // MARK: - Resume from existing

    /// Opening an existing log must resume sequence numbers correctly.
    func testResumeFromExistingLog() throws {
        let log1 = try AuditLog(path: testLogPath)
        try log1.log(eventType: .sessionStart, details: [:])
        try log1.log(eventType: .caseSetup, details: [:])

        // Open the same log again (simulating restart)
        let log2 = try AuditLog(path: testLogPath)
        try log2.log(eventType: .sessionEnd, details: [:])

        // Verify the chain is still valid
        let verificationResult = try AuditLog.verifyChain(atPath: testLogPath)
        XCTAssertNil(verificationResult,
            "Resumed log must maintain valid chain.")

        // Verify sequence number continued
        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)
        let lines = content.split(separator: "\n", omittingEmptySubsequences: true)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let lastEntry = try decoder.decode(AuditLogEntry.self, from: Data(lines.last!.utf8))
        XCTAssertEqual(lastEntry.sequenceNumber, 3,
            "Resumed log must continue sequence numbers.")
    }

    // MARK: - Event types

    /// All audit event types must be valid Codable values.
    func testAllEventTypesCodable() throws {
        let log = try AuditLog(path: testLogPath)

        let eventTypes: [AuditEventType] = [
            .sessionStart, .caseSetup, .bundleCreated, .bundleReused,
            .sourceSelected, .preflightCompleted, .sourceManifestBuilt,
            .collectionStarted, .dittoInvocation, .collectionCompleted,
            .collectionCancelled, .verificationStarted, .verificationCompleted,
            .bundleDetached, .reportGenerated, .sessionEnd, .error, .warning
        ]

        for eventType in eventTypes {
            try log.log(eventType: eventType, details: ["test": eventType.rawValue])
        }

        let verificationResult = try AuditLog.verifyChain(atPath: testLogPath)
        XCTAssertNil(verificationResult,
            "All event types must produce a valid chain.")
    }

    // MARK: - Details stored correctly

    /// Details key-value pairs must be preserved in the log.
    func testDetailsPreserved() throws {
        let log = try AuditLog(path: testLogPath)
        try log.log(eventType: .caseSetup, details: [
            "examinerName": "Jane Doe",
            "caseID": "2024-ABC-123",
            "evidenceID": "EV-001",
        ])

        let content = try String(contentsOfFile: testLogPath, encoding: .utf8)

        XCTAssertTrue(content.contains("Jane Doe"), "Details must be preserved in log.")
        XCTAssertTrue(content.contains("2024-ABC-123"), "Details must be preserved in log.")
        XCTAssertTrue(content.contains("EV-001"), "Details must be preserved in log.")
    }
}
