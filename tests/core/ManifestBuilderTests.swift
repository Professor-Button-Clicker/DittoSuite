// ManifestBuilderTests.swift
// DittoSuite Test Suite
//
// Tests for ManifestBuilder (FR-01: source immutability, FR-04: no silent skips,
// FR-19: determinism, FR-24: per-file SHA-256).
//
// PLATFORM: macOS only (requires lstat, FileManager, POSIX APIs).
// On non-macOS: NOT RUN.

import XCTest
@testable import DittoSuite

final class ManifestBuilderTests: XCTestCase {

    private var testDir: String!

    override func setUpWithError() throws {
        let tmpDir = NSTemporaryDirectory()
        testDir = (tmpDir as NSString).appendingPathComponent("dittosuite_manifest_test_\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: testDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: testDir)
    }

    // MARK: - FR-01: Source immutability (read-only access)

    /// ManifestBuilder must use lstat (not stat) and never write to the source.
    /// Verification: build a manifest, then verify no new files were created in the source.
    func testManifestBuildDoesNotModifySource() throws {
        // Create a simple test directory with known file
        let testFile = (testDir as NSString).appendingPathComponent("immutable_test.txt")
        try "test content".write(toFile: testFile, atomically: true, encoding: .utf8)

        // Record source state before manifest build
        var preStatBuf = stat()
        lstat(testDir, &preStatBuf)
        let preMtime = preStatBuf.st_mtimespec

        // Small delay to ensure timestamp change would be detectable
        Thread.sleep(forTimeInterval: 1.1)

        // Build manifest (should be read-only)
        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        // Verify the manifest was built
        XCTAssertFalse(manifest.entries.isEmpty, "Manifest should contain entries.")

        // Verify source directory mtime was not changed
        var postStatBuf = stat()
        lstat(testDir, &postStatBuf)
        let postMtime = postStatBuf.st_mtimespec

        XCTAssertEqual(preMtime.tv_sec, postMtime.tv_sec,
            "Source directory mtime must not change during manifest building (FR-01).")

        // Verify no extra files were created in the source directory
        let contentsAfter = try FileManager.default.contentsOfDirectory(atPath: testDir)
        XCTAssertEqual(contentsAfter.count, 1,
            "No extra files should be created in the source during manifest building.")
    }

    // MARK: - FR-01: lstat usage (symlinks not followed)

    /// ManifestBuilder must use lstat, recording symlinks as symlinks
    /// instead of following them and recording the target.
    func testSymlinksRecordedAsSymlinks() throws {
        let targetFile = (testDir as NSString).appendingPathComponent("target.txt")
        try "target content".write(toFile: targetFile, atomically: true, encoding: .utf8)

        let symlinkFile = (testDir as NSString).appendingPathComponent("link.txt")
        try FileManager.default.createSymbolicLink(atPath: symlinkFile, withDestinationPath: "target.txt")

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        let symlinkEntry = manifest.entries.first { $0.relativePath.hasSuffix("link.txt") }
        XCTAssertNotNil(symlinkEntry, "Symlink entry should exist in manifest.")
        XCTAssertEqual(symlinkEntry?.fileType, .symlink,
            "Symlink must be recorded as .symlink, not as .regular (proves lstat is used).")
        XCTAssertEqual(symlinkEntry?.symlinkTarget, "target.txt",
            "Symlink target must be recorded.")
        XCTAssertNil(symlinkEntry?.sha256,
            "Symlinks must not have a SHA-256 hash.")
    }

    // MARK: - FR-04: No silent skips (permission denied recorded)

    /// When a file cannot be read (permission denied), it must appear in
    /// manifest.errors, not be silently skipped.
    func testPermissionDeniedRecordedInErrors() throws {
        let readableFile = (testDir as NSString).appendingPathComponent("readable.txt")
        try "readable".write(toFile: readableFile, atomically: true, encoding: .utf8)

        let deniedFile = (testDir as NSString).appendingPathComponent("denied.txt")
        try "denied".write(toFile: deniedFile, atomically: true, encoding: .utf8)
        chmod(deniedFile, 0o000)
        defer { chmod(deniedFile, 0o644) }  // restore for cleanup

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        // The denied file should appear in errors, not be silently missing
        let hasErrorForDenied = manifest.errors.contains { $0.path.contains("denied.txt") }
        XCTAssertTrue(hasErrorForDenied,
            "Permission-denied file must appear in manifest.errors (FR-04: no silent skips).")

        // The readable file should still be in entries
        let hasReadable = manifest.entries.contains { $0.relativePath.contains("readable.txt") }
        XCTAssertTrue(hasReadable,
            "Readable files must still be collected even when other files fail.")
    }

    // MARK: - FR-24: Per-file SHA-256

    /// Each regular file must have a SHA-256 hash in the manifest.
    func testRegularFilesHaveHashes() throws {
        let file1 = (testDir as NSString).appendingPathComponent("file1.txt")
        try "content one".write(toFile: file1, atomically: true, encoding: .utf8)

        let file2 = (testDir as NSString).appendingPathComponent("file2.txt")
        try "content two".write(toFile: file2, atomically: true, encoding: .utf8)

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        let regularEntries = manifest.entries.filter { $0.fileType == .regular }
        XCTAssertEqual(regularEntries.count, 2, "Should have 2 regular files.")

        for entry in regularEntries {
            XCTAssertNotNil(entry.sha256,
                "Regular file '\(entry.relativePath)' must have a SHA-256 hash (FR-24).")
            XCTAssertEqual(entry.sha256?.count, 64,
                "SHA-256 hash must be 64 hex characters.")
        }
    }

    /// SHA-256 in manifest must match independently computed hash.
    func testManifestHashMatchesIndependentHash() throws {
        let knownContent = "Hello, DittoSuite forensic testing!\n"
        let filePath = (testDir as NSString).appendingPathComponent("known.txt")
        try knownContent.write(toFile: filePath, atomically: true, encoding: .utf8)

        // Compute reference hash independently
        let referenceHash = HashService.sha256(of: Data(knownContent.utf8))

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)
        let entry = manifest.entries.first { $0.relativePath.hasSuffix("known.txt") }

        XCTAssertNotNil(entry)
        XCTAssertEqual(entry?.sha256, referenceHash,
            "Manifest SHA-256 must match independently computed reference hash (FR-02).")
    }

    // MARK: - FR-19: Deterministic output

    /// Building a manifest twice on the same input must produce the same
    /// entries in the same order with the same hashes.
    func testManifestDeterminism() throws {
        // Create several files
        for i in 0..<5 {
            let path = (testDir as NSString).appendingPathComponent("det_\(i).txt")
            try "deterministic content \(i)".write(toFile: path, atomically: true, encoding: .utf8)
        }

        let manifest1 = try ManifestBuilder.buildManifest(rootPath: testDir)
        let manifest2 = try ManifestBuilder.buildManifest(rootPath: testDir)

        XCTAssertEqual(manifest1.entries.count, manifest2.entries.count,
            "Two builds of the same source must have the same entry count.")

        for (e1, e2) in zip(manifest1.entries, manifest2.entries) {
            XCTAssertEqual(e1.relativePath, e2.relativePath,
                "Entry paths must be in the same order (sorted).")
            XCTAssertEqual(e1.sha256, e2.sha256,
                "Entry hashes must be identical.")
            XCTAssertEqual(e1.size, e2.size,
                "Entry sizes must be identical.")
        }

        XCTAssertEqual(manifest1.manifestSHA256, manifest2.manifestSHA256,
            "Manifest hash must be identical for the same source (FR-19).")
    }

    /// Entries must be sorted by relativePath.
    func testEntriesSortedByPath() throws {
        // Create files in reverse alphabetical order
        for name in ["zebra.txt", "apple.txt", "mango.txt"] {
            let path = (testDir as NSString).appendingPathComponent(name)
            try "content".write(toFile: path, atomically: true, encoding: .utf8)
        }

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)
        let paths = manifest.entries.map { $0.relativePath }

        XCTAssertEqual(paths, paths.sorted(),
            "Manifest entries must be sorted by relativePath for determinism.")
    }

    // MARK: - FR-25: File count

    /// totalFiles must count regular files only (not directories or symlinks).
    func testTotalFilesCountsOnlyRegularFiles() throws {
        let file1 = (testDir as NSString).appendingPathComponent("file1.txt")
        try "c1".write(toFile: file1, atomically: true, encoding: .utf8)

        let file2 = (testDir as NSString).appendingPathComponent("file2.txt")
        try "c2".write(toFile: file2, atomically: true, encoding: .utf8)

        let subdir = (testDir as NSString).appendingPathComponent("subdir")
        try FileManager.default.createDirectory(atPath: subdir, withIntermediateDirectories: true)

        let symlink = (testDir as NSString).appendingPathComponent("link")
        try FileManager.default.createSymbolicLink(atPath: symlink, withDestinationPath: "file1.txt")

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        XCTAssertEqual(manifest.totalFiles, 2,
            "totalFiles must count only regular files (FR-25).")
        XCTAssertEqual(manifest.totalDirectories, 1,
            "totalDirectories must count directories.")
        XCTAssertEqual(manifest.totalSymlinks, 1,
            "totalSymlinks must count symlinks.")
    }

    // MARK: - FR-26: Size verification

    /// totalSize must be the sum of regular file sizes only.
    func testTotalSizeIsRegularFileSizesOnly() throws {
        let content1 = Data(repeating: 0x41, count: 100)
        let content2 = Data(repeating: 0x42, count: 200)

        let file1 = (testDir as NSString).appendingPathComponent("100bytes.bin")
        try content1.write(to: URL(fileURLWithPath: file1))

        let file2 = (testDir as NSString).appendingPathComponent("200bytes.bin")
        try content2.write(to: URL(fileURLWithPath: file2))

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        XCTAssertEqual(manifest.totalSize, 300,
            "totalSize must be the sum of regular file sizes (FR-26).")
    }

    // MARK: - Path validation

    /// Paths with null bytes must be rejected.
    func testNullByteInPathRejected() {
        let badPath = "/tmp/test\0injected"
        XCTAssertThrowsError(try ManifestBuilder.buildManifest(rootPath: badPath)) { error in
            guard let invErr = error as? InvocationError,
                  case .pathContainsNullByte = invErr else {
                XCTFail("Expected pathContainsNullByte error, got \(error)")
                return
            }
        }
    }

    /// Non-absolute paths must be rejected.
    func testNonAbsolutePathRejected() {
        let badPath = "relative/path"
        XCTAssertThrowsError(try ManifestBuilder.buildManifest(rootPath: badPath)) { error in
            guard let invErr = error as? InvocationError,
                  case .pathNotAbsolute = invErr else {
                XCTFail("Expected pathNotAbsolute error, got \(error)")
                return
            }
        }
    }

    // MARK: - Hard link detection

    /// Hard links must be recorded with inode and nlink count.
    func testHardLinksRecordedWithInodeAndNlink() throws {
        let source = (testDir as NSString).appendingPathComponent("hardlink_source.txt")
        try "hard link content".write(toFile: source, atomically: true, encoding: .utf8)

        let linked = (testDir as NSString).appendingPathComponent("hardlink_copy.txt")
        try FileManager.default.linkItem(atPath: source, toPath: linked)

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        let sourceEntry = manifest.entries.first { $0.relativePath.hasSuffix("hardlink_source.txt") }
        let linkedEntry = manifest.entries.first { $0.relativePath.hasSuffix("hardlink_copy.txt") }

        XCTAssertNotNil(sourceEntry)
        XCTAssertNotNil(linkedEntry)
        XCTAssertEqual(sourceEntry?.hardLinkID, linkedEntry?.hardLinkID,
            "Hard links must share the same inode (hardLinkID).")
        XCTAssertGreaterThanOrEqual(sourceEntry?.nlink ?? 0, 2,
            "Hard links must have nlink >= 2.")
    }

    // MARK: - Empty directory handling

    /// Empty directories must be included in the manifest.
    func testEmptyDirectoriesIncluded() throws {
        let emptyDir = (testDir as NSString).appendingPathComponent("empty_subdir")
        try FileManager.default.createDirectory(atPath: emptyDir, withIntermediateDirectories: true)

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        let dirEntry = manifest.entries.first { $0.relativePath.hasSuffix("empty_subdir") }
        XCTAssertNotNil(dirEntry, "Empty directories must be included in the manifest.")
        XCTAssertEqual(dirEntry?.fileType, .directory)
        XCTAssertNil(dirEntry?.sha256, "Directories must not have a SHA-256 hash.")
    }

    // MARK: - Special filename handling

    /// Files with special characters in names must be recorded correctly.
    func testSpecialFilenamesRecorded() throws {
        let names = [
            "file with spaces.txt",
            "file'with'quotes.txt",
            "$(whoami).txt",
            "`id`.txt",
            "file;rm.txt",
        ]

        for name in names {
            let path = (testDir as NSString).appendingPathComponent(name)
            try "test".write(toFile: path, atomically: true, encoding: .utf8)
        }

        let manifest = try ManifestBuilder.buildManifest(rootPath: testDir)

        for name in names {
            let found = manifest.entries.contains { $0.relativePath == name }
            XCTAssertTrue(found,
                "File with name '\(name)' must be present in manifest entries.")
        }
    }

    // MARK: - Manifest hash (tamper evidence)

    /// manifestSHA256 must be computed from canonical JSON of entries.
    /// Modifying an entry must change the manifest hash.
    func testManifestHashChangesWhenEntryDiffers() throws {
        let file = (testDir as NSString).appendingPathComponent("hashtest.txt")
        try "content A".write(toFile: file, atomically: true, encoding: .utf8)

        let manifest1 = try ManifestBuilder.buildManifest(rootPath: testDir)

        try "content B".write(toFile: file, atomically: true, encoding: .utf8)

        let manifest2 = try ManifestBuilder.buildManifest(rootPath: testDir)

        XCTAssertNotEqual(manifest1.manifestSHA256, manifest2.manifestSHA256,
            "Changing file content must change the manifest hash.")
    }
}
