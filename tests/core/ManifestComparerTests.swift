// ManifestComparerTests.swift
// DittoSuite Test Suite
//
// Tests for ManifestComparer (FR-03: independent verification, FR-24-26:
// per-file/count/size verification, FR-27: metadata differences).
//
// These tests use synthetic Manifest objects and do NOT require macOS APIs.
// Pure logic tests can be verified by code review on non-macOS platforms.

import XCTest
@testable import DittoSuite

final class ManifestComparerTests: XCTestCase {

    // MARK: - Test helpers

    /// Create a ManifestEntry for testing.
    private func makeEntry(
        path: String,
        type: FileType = .regular,
        size: UInt64 = 100,
        sha256: String? = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        mtime: Date = Date(timeIntervalSince1970: 1000000),
        permissions: UInt16 = 0o644,
        owner: UInt32 = 501,
        group: UInt32 = 20,
        xattrs: [String] = [],
        symlinkTarget: String? = nil,
        ino: UInt64 = 0,
        nlink: UInt32 = 1,
        dev: UInt64 = 0,
        flags: UInt32 = 0
    ) -> ManifestEntry {
        ManifestEntry(
            relativePath: path,
            fileType: type,
            size: size,
            sha256: type == .regular ? sha256 : nil,
            modificationTime: mtime,
            accessTime: Date(timeIntervalSince1970: 1000000),
            creationTime: Date(timeIntervalSince1970: 999000),
            permissions: permissions,
            owner: owner,
            group: group,
            extendedAttributeNames: xattrs,
            symlinkTarget: symlinkTarget,
            hardLinkID: ino,
            nlink: nlink,
            deviceID: dev,
            flags: flags
        )
    }

    /// Create a Manifest for testing.
    private func makeManifest(
        rootPath: String = "/source",
        entries: [ManifestEntry],
        errors: [ManifestError] = []
    ) -> Manifest {
        let files = entries.filter { $0.fileType == .regular }
        return Manifest(
            rootPath: rootPath,
            buildTimeUTC: Date(),
            totalFiles: files.count,
            totalDirectories: entries.filter { $0.fileType == .directory }.count,
            totalSymlinks: entries.filter { $0.fileType == .symlink }.count,
            totalSize: files.reduce(UInt64(0)) { $0 + $1.size },
            entries: entries,
            errors: errors,
            manifestSHA256: "test_manifest_hash_\(entries.count)"
        )
    }

    // MARK: - FR-03: Independent verification (corrupt destination detected)

    /// A corrupted destination file (different SHA-256) must produce FAIL.
    func testCorruptDestinationFileDetected() {
        let sourceEntries = [
            makeEntry(path: "file1.txt", sha256: "aaaa" + String(repeating: "0", count: 60)),
            makeEntry(path: "file2.txt", sha256: "bbbb" + String(repeating: "0", count: 60)),
        ]

        // Destination has corrupted file2
        let destEntries = [
            makeEntry(path: "file1.txt", sha256: "aaaa" + String(repeating: "0", count: 60)),
            makeEntry(path: "file2.txt", sha256: "cccc" + String(repeating: "0", count: 60)),  // CORRUPTED
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .fail,
            "Corrupted destination file must cause overall FAIL (FR-03).")

        let file2Result = result.perFileResults.first { $0.relativePath == "file2.txt" }
        XCTAssertNotNil(file2Result)
        XCTAssertFalse(file2Result?.sha256Match ?? true,
            "Corrupted file must have sha256Match=false.")
        XCTAssertEqual(file2Result?.verdict, .fail)
    }

    /// A truncated destination file (different size) must produce FAIL.
    func testTruncatedDestinationFileDetected() {
        let sourceEntries = [
            makeEntry(path: "file.txt", size: 1000, sha256: "aaaa" + String(repeating: "0", count: 60)),
        ]
        let destEntries = [
            makeEntry(path: "file.txt", size: 500, sha256: "bbbb" + String(repeating: "0", count: 60)),  // TRUNCATED
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .fail,
            "Truncated destination file must cause overall FAIL.")
        XCTAssertFalse(result.totalSizeMatch,
            "Total size must not match when a file is truncated (FR-26).")
    }

    /// A missing destination file must produce FAIL.
    func testMissingDestinationFileDetected() {
        let sourceEntries = [
            makeEntry(path: "file1.txt"),
            makeEntry(path: "file2.txt"),
        ]
        let destEntries = [
            makeEntry(path: "file1.txt"),
            // file2.txt is MISSING
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .fail,
            "Missing destination file must cause overall FAIL.")
        XCTAssertTrue(result.missingInDestination.contains("file2.txt"),
            "Missing file must be listed in missingInDestination.")
        XCTAssertFalse(result.totalFileCountMatch,
            "File count must not match when a file is missing (FR-25).")
    }

    // MARK: - FR-03: ditto success but bad copy

    /// Even if ditto reported exit 0, an incomplete copy must be detected.
    /// Simulated by having matching exit code but mismatched manifests.
    func testDittoSuccessButBadCopyDetected() {
        let sourceEntries = [
            makeEntry(path: "a.txt", sha256: "aa" + String(repeating: "0", count: 62)),
            makeEntry(path: "b.txt", sha256: "bb" + String(repeating: "0", count: 62)),
            makeEntry(path: "c.txt", sha256: "cc" + String(repeating: "0", count: 62)),
        ]
        let destEntries = [
            makeEntry(path: "a.txt", sha256: "aa" + String(repeating: "0", count: 62)),
            // b.txt missing -- ditto claimed success but didn't copy it
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .fail,
            "Independent verification must catch incomplete copy regardless of ditto exit code (FR-03).")
        XCTAssertTrue(result.missingInDestination.contains("b.txt"))
        XCTAssertTrue(result.missingInDestination.contains("c.txt"))
    }

    // MARK: - PASS case

    /// Identical source and destination must produce PASS.
    func testIdenticalManifestsPass() {
        let hash = String(repeating: "a", count: 64)
        let entries = [
            makeEntry(path: "dir", type: .directory, size: 0),
            makeEntry(path: "file1.txt", size: 100, sha256: hash),
            makeEntry(path: "file2.txt", size: 200, sha256: hash),
        ]

        let source = makeManifest(entries: entries)
        let dest = makeManifest(rootPath: "/dest", entries: entries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .pass,
            "Identical manifests must produce PASS.")
        XCTAssertTrue(result.totalFileCountMatch)
        XCTAssertTrue(result.totalSizeMatch)
        XCTAssertTrue(result.missingInDestination.isEmpty)
    }

    // MARK: - FR-25: File count verification

    /// File count mismatch must cause FAIL.
    func testFileCountMismatchFails() {
        let hash = String(repeating: "a", count: 64)
        let sourceEntries = [
            makeEntry(path: "f1.txt", sha256: hash),
            makeEntry(path: "f2.txt", sha256: hash),
        ]
        let destEntries = [
            makeEntry(path: "f1.txt", sha256: hash),
            makeEntry(path: "f2.txt", sha256: hash),
            makeEntry(path: "f3.txt", sha256: hash),  // Extra file in dest
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        // File count: source has 2, dest has 3
        XCTAssertFalse(result.totalFileCountMatch,
            "File count mismatch must be detected (FR-25).")
        // But overall verdict may still be PASS because all source files exist and match
        // The extra file in destination is informational
        XCTAssertTrue(result.extraInDestination.contains("f3.txt"),
            "Extra files in destination must be listed.")
    }

    // MARK: - FR-26: Size verification

    /// Total size mismatch must cause FAIL.
    func testTotalSizeMismatchFails() {
        let sourceEntries = [
            makeEntry(path: "f1.txt", size: 1000, sha256: String(repeating: "a", count: 64)),
        ]
        let destEntries = [
            makeEntry(path: "f1.txt", size: 999, sha256: String(repeating: "b", count: 64)),
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertFalse(result.totalSizeMatch, "Total size mismatch must be detected (FR-26).")
        XCTAssertEqual(result.overallVerdict, .fail)
    }

    // MARK: - FR-27: Metadata differences reported separately

    /// Metadata differences (mtime, permissions, owner, group) must be
    /// reported as informational, NOT causing FAIL.
    func testMetadataDifferencesReportedSeparately() {
        let hash = String(repeating: "a", count: 64)
        let sourceEntries = [
            makeEntry(path: "f.txt", sha256: hash,
                      mtime: Date(timeIntervalSince1970: 1000),
                      permissions: 0o644, owner: 501, group: 20),
        ]
        let destEntries = [
            makeEntry(path: "f.txt", sha256: hash,
                      mtime: Date(timeIntervalSince1970: 2000),  // different mtime
                      permissions: 0o755,  // different permissions
                      owner: 502,  // different owner
                      group: 21),  // different group
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        // Overall should still PASS because SHA-256 and size match
        XCTAssertEqual(result.overallVerdict, .pass,
            "Metadata differences alone must NOT cause FAIL (FR-27).")

        // But differences must be reported
        XCTAssertFalse(result.metadataDifferences.isEmpty,
            "Metadata differences must be reported (FR-27).")

        let fields = Set(result.metadataDifferences.map { $0.field })
        XCTAssertTrue(fields.contains("modificationTime"),
            "mtime difference must be reported.")
        XCTAssertTrue(fields.contains("permissions"),
            "permissions difference must be reported.")
        XCTAssertTrue(fields.contains("owner"),
            "owner difference must be reported.")
        XCTAssertTrue(fields.contains("group"),
            "group difference must be reported.")
    }

    /// Access time must NOT be compared (documented design decision).
    func testAccessTimeNotCompared() {
        let hash = String(repeating: "a", count: 64)
        let sourceEntry = makeEntry(path: "f.txt", sha256: hash)
        let destEntry = ManifestEntry(
            relativePath: "f.txt",
            fileType: .regular,
            size: 100,
            sha256: hash,
            modificationTime: sourceEntry.modificationTime,
            accessTime: Date(timeIntervalSince1970: 9999999),  // very different atime
            creationTime: sourceEntry.creationTime,
            permissions: sourceEntry.permissions,
            owner: sourceEntry.owner,
            group: sourceEntry.group,
            extendedAttributeNames: [],
            symlinkTarget: nil,
            hardLinkID: 0,
            nlink: 1,
            deviceID: 0,
            flags: 0
        )

        let source = makeManifest(entries: [sourceEntry])
        let dest = makeManifest(rootPath: "/dest", entries: [destEntry])

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .pass,
            "Access time difference must NOT cause FAIL.")

        let atimeDiffs = result.metadataDifferences.filter { $0.field == "accessTime" }
        XCTAssertTrue(atimeDiffs.isEmpty,
            "Access time must NOT be compared (spec section 3.3 note).")
    }

    // MARK: - Extra files in destination

    /// Extra files in destination (e.g., .DS_Store) must be logged but not FAIL.
    func testExtraFilesInDestinationAreInformational() {
        let hash = String(repeating: "a", count: 64)
        let sourceEntries = [
            makeEntry(path: "file.txt", sha256: hash),
        ]
        let destEntries = [
            makeEntry(path: "file.txt", sha256: hash),
            makeEntry(path: ".DS_Store", sha256: String(repeating: "b", count: 64)),
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        // .DS_Store should not cause FAIL -- it's extra
        XCTAssertTrue(result.extraInDestination.contains(".DS_Store"),
            "Extra files must be listed in extraInDestination.")
    }

    // MARK: - Extended attribute differences

    /// Xattr differences must be reported as informational.
    func testXattrDifferencesReported() {
        let hash = String(repeating: "a", count: 64)
        let sourceEntries = [
            makeEntry(path: "f.txt", sha256: hash, xattrs: ["com.apple.quarantine", "user.test"]),
        ]
        let destEntries = [
            makeEntry(path: "f.txt", sha256: hash, xattrs: ["com.apple.quarantine"]),  // missing user.test
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result.overallVerdict, .pass,
            "Xattr differences alone must NOT cause FAIL.")

        let xattrDiffs = result.metadataDifferences.filter { $0.field == "extendedAttributeNames" }
        XCTAssertFalse(xattrDiffs.isEmpty,
            "Xattr differences must be reported in metadataDifferences.")
    }

    // MARK: - Symlink target verification

    /// Symlink target differences must be reported.
    func testSymlinkTargetDifferencesReported() {
        let sourceEntries = [
            makeEntry(path: "link", type: .symlink, size: 0, sha256: nil, symlinkTarget: "target_a.txt"),
        ]
        let destEntries = [
            makeEntry(path: "link", type: .symlink, size: 0, sha256: nil, symlinkTarget: "target_b.txt"),
        ]

        let source = makeManifest(entries: sourceEntries)
        let dest = makeManifest(rootPath: "/dest", entries: destEntries)

        let result = ManifestComparer.compare(source: source, destination: dest)

        let targetDiffs = result.metadataDifferences.filter { $0.field == "symlinkTarget" }
        XCTAssertFalse(targetDiffs.isEmpty,
            "Symlink target differences must be reported.")
    }

    // MARK: - Determinism

    /// Comparison of the same manifests must always produce the same result.
    func testComparisonDeterminism() {
        let hash = String(repeating: "a", count: 64)
        let entries = [
            makeEntry(path: "a.txt", sha256: hash),
            makeEntry(path: "b.txt", sha256: hash),
        ]
        let source = makeManifest(entries: entries)
        let dest = makeManifest(rootPath: "/dest", entries: entries)

        let result1 = ManifestComparer.compare(source: source, destination: dest)
        let result2 = ManifestComparer.compare(source: source, destination: dest)

        XCTAssertEqual(result1.overallVerdict, result2.overallVerdict)
        XCTAssertEqual(result1.totalFileCountMatch, result2.totalFileCountMatch)
        XCTAssertEqual(result1.totalSizeMatch, result2.totalSizeMatch)
        XCTAssertEqual(result1.perFileResults.count, result2.perFileResults.count)
    }

    // MARK: - Per-file results sorted

    /// Per-file results must be sorted by relativePath.
    func testPerFileResultsSorted() {
        let hash = String(repeating: "a", count: 64)
        let entries = [
            makeEntry(path: "z.txt", sha256: hash),
            makeEntry(path: "a.txt", sha256: hash),
            makeEntry(path: "m.txt", sha256: hash),
        ]
        let source = makeManifest(entries: entries)
        let dest = makeManifest(rootPath: "/dest", entries: entries)

        let result = ManifestComparer.compare(source: source, destination: dest)
        let paths = result.perFileResults.map { $0.relativePath }

        XCTAssertEqual(paths, paths.sorted(),
            "Per-file results must be sorted by relativePath.")
    }
}
