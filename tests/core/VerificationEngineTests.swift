// VerificationEngineTests.swift
// DittoSuite Test Suite
//
// Tests for VerificationEngine (FR-03: independent verification,
// FR-20: source change detection, FR-32: hdiutil verify skip).
//
// PLATFORM: macOS only (requires lstat, Foundation file I/O, CryptoKit).
// On non-macOS: NOT RUN.

import XCTest
@testable import DittoSuite

final class VerificationEngineTests: XCTestCase {

    private var sourceDir: String!
    private var destDir: String!
    private var auditLogPath: String!

    override func setUpWithError() throws {
        let tmpDir = NSTemporaryDirectory()
        let testID = UUID().uuidString

        sourceDir = (tmpDir as NSString).appendingPathComponent("dittosuite_ve_source_\(testID)")
        destDir = (tmpDir as NSString).appendingPathComponent("dittosuite_ve_dest_\(testID)")
        auditLogPath = (tmpDir as NSString).appendingPathComponent("dittosuite_ve_audit_\(testID).jsonl")

        try FileManager.default.createDirectory(atPath: sourceDir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(atPath: destDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: sourceDir)
        try? FileManager.default.removeItem(atPath: destDir)
        try? FileManager.default.removeItem(atPath: auditLogPath)
    }

    // MARK: - FR-03: Independent verification catches corrupt copy

    /// Verification must detect when a destination file is corrupted
    /// even if the copy tool reported success.
    func testVerificationDetectsCorruptDestination() async throws {
        // Create source
        let srcFile = (sourceDir as NSString).appendingPathComponent("important.txt")
        try "original content".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Build source manifest
        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)

        // Create "copy" (simulate ditto), then corrupt it
        let destFile = (destDir as NSString).appendingPathComponent("important.txt")
        try "original content".write(toFile: destFile, atomically: true, encoding: .utf8)
        // Now corrupt the destination
        try "CORRUPTED content".write(toFile: destFile, atomically: true, encoding: .utf8)

        let auditLog = try AuditLog(path: auditLogPath)

        let report = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        XCTAssertEqual(report.overallVerdict, .fail,
            "Verification must detect corrupted destination file (FR-03).")
    }

    /// Verification must detect when a destination file is missing.
    func testVerificationDetectsMissingDestination() async throws {
        // Create source with two files
        try "file one".write(toFile: (sourceDir as NSString).appendingPathComponent("a.txt"),
                             atomically: true, encoding: .utf8)
        try "file two".write(toFile: (sourceDir as NSString).appendingPathComponent("b.txt"),
                             atomically: true, encoding: .utf8)

        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)

        // Only copy one file to destination (simulating partial copy)
        try "file one".write(toFile: (destDir as NSString).appendingPathComponent("a.txt"),
                             atomically: true, encoding: .utf8)

        let auditLog = try AuditLog(path: auditLogPath)

        let report = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        XCTAssertEqual(report.overallVerdict, .fail,
            "Verification must detect missing destination file.")

        XCTAssertTrue(report.comparisonResult.missingInDestination.contains("b.txt"),
            "Missing file must be listed in missingInDestination.")
    }

    /// Verification must PASS when source and destination are identical.
    func testVerificationPassesForIdenticalCopy() async throws {
        let content = "identical content for testing"
        try content.write(toFile: (sourceDir as NSString).appendingPathComponent("same.txt"),
                          atomically: true, encoding: .utf8)
        try content.write(toFile: (destDir as NSString).appendingPathComponent("same.txt"),
                          atomically: true, encoding: .utf8)

        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)
        let auditLog = try AuditLog(path: auditLogPath)

        let report = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        XCTAssertEqual(report.overallVerdict, .pass,
            "Identical source and destination must produce PASS.")
    }

    // MARK: - FR-20: Source change detection

    /// Files that change during collection must be detected.
    func testSourceChangeDuringCollectionDetected() async throws {
        // Create source file
        let srcFile = (sourceDir as NSString).appendingPathComponent("changing.txt")
        try "original".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Build source manifest (captures pre-collection state)
        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)

        // Simulate source change during collection
        Thread.sleep(forTimeInterval: 1.1)  // Ensure mtime changes
        try "modified during collection".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Create destination with the original content
        try "original".write(toFile: (destDir as NSString).appendingPathComponent("changing.txt"),
                             atomically: true, encoding: .utf8)

        let auditLog = try AuditLog(path: auditLogPath)

        let report = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        XCTAssertFalse(report.sourceChanges.isEmpty,
            "Source changes during collection must be detected (FR-20).")

        let changingFileChanges = report.sourceChanges.filter {
            $0.relativePath.contains("changing.txt")
        }
        XCTAssertFalse(changingFileChanges.isEmpty,
            "The specific changed file must be identified.")
    }

    // MARK: - FR-32: hdiutil verify skipped for writable sparsebundles

    /// VerificationEngine must skip hdiutil verify for writable sparsebundles
    /// with a documented reason.
    func testHdiutilVerifySkippedWithDocumentedReason() async throws {
        try "test".write(toFile: (sourceDir as NSString).appendingPathComponent("f.txt"),
                         atomically: true, encoding: .utf8)
        try "test".write(toFile: (destDir as NSString).appendingPathComponent("f.txt"),
                         atomically: true, encoding: .utf8)

        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)
        let auditLog = try AuditLog(path: auditLogPath)

        let report = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        XCTAssertTrue(report.hdiutilVerifySkipped,
            "hdiutil verify must be skipped for writable sparsebundles (FR-32).")
        XCTAssertNotNil(report.hdiutilVerifySkipReason,
            "Skip reason must be documented.")
        XCTAssertTrue(report.hdiutilVerifySkipReason?.contains("does not reliably cover") ?? false,
            "Skip reason must explain that hdiutil verify doesn't cover writable sparsebundles.")
    }

    // MARK: - Audit log entries

    /// Verification must log verificationStarted and verificationCompleted.
    func testVerificationLogsAuditEntries() async throws {
        try "test".write(toFile: (sourceDir as NSString).appendingPathComponent("f.txt"),
                         atomically: true, encoding: .utf8)
        try "test".write(toFile: (destDir as NSString).appendingPathComponent("f.txt"),
                         atomically: true, encoding: .utf8)

        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)
        let auditLog = try AuditLog(path: auditLogPath)

        _ = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        let content = try String(contentsOfFile: auditLogPath, encoding: .utf8)

        XCTAssertTrue(content.contains("verificationStarted"),
            "Audit log must contain verificationStarted entry.")
        XCTAssertTrue(content.contains("verificationCompleted"),
            "Audit log must contain verificationCompleted entry.")
    }

    // MARK: - Truncated file detection

    /// A file truncated to a shorter length must be detected.
    func testTruncatedFileDetected() async throws {
        let originalContent = String(repeating: "A", count: 1000)
        try originalContent.write(
            toFile: (sourceDir as NSString).appendingPathComponent("large.txt"),
            atomically: true, encoding: .utf8
        )

        let sourceManifest = try ManifestBuilder.buildManifest(rootPath: sourceDir)

        // Truncated copy
        let truncatedContent = String(repeating: "A", count: 500)
        try truncatedContent.write(
            toFile: (destDir as NSString).appendingPathComponent("large.txt"),
            atomically: true, encoding: .utf8
        )

        let auditLog = try AuditLog(path: auditLogPath)

        let report = try await VerificationEngine.verify(
            sourceManifests: [sourceDir: sourceManifest],
            destinationRoot: destDir,
            auditLog: auditLog
        )

        XCTAssertEqual(report.overallVerdict, .fail,
            "Truncated destination file must cause FAIL.")
    }
}
