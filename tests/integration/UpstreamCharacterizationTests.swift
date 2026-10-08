// UpstreamCharacterizationTests.swift
// DittoSuite Test Suite
//
// Upstream characterization tests for ditto and hdiutil.
// These tests record what the upstream tools actually do, rather than
// asserting what they should do. Results become documented findings.
//
// ALL TESTS REQUIRE macOS. On non-macOS: NOT RUN.
// Each test creates synthetic fixtures, runs the upstream tool, and
// records the observed behavior.

import XCTest
@testable import DittoSuite

final class UpstreamCharacterizationTests: XCTestCase {

    private var fixtureDir: String!
    private var destDir: String!

    override func setUpWithError() throws {
        let tmpDir = NSTemporaryDirectory()
        let testID = UUID().uuidString
        fixtureDir = (tmpDir as NSString).appendingPathComponent("dittosuite_char_src_\(testID)")
        destDir = (tmpDir as NSString).appendingPathComponent("dittosuite_char_dst_\(testID)")

        try FileManager.default.createDirectory(atPath: fixtureDir, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(atPath: destDir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: fixtureDir)
        try? FileManager.default.removeItem(atPath: destDir)
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Timestamp preservation (creation time / birthtime)

    /// Record whether ditto preserves creation time (st_birthtime).
    /// Not mentioned in any man page. Behavior must be empirically observed.
    func testDittoCreationTimePreservation() throws {
        let srcFile = (fixtureDir as NSString).appendingPathComponent("birthtime_test.txt")
        try "birthtime test content".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Record source birthtime
        var srcStat = stat()
        lstat(srcFile, &srcStat)
        let srcBirthtime = srcStat.st_birthtimespec

        // Run ditto
        let dstFile = (destDir as NSString).appendingPathComponent("birthtime_test.txt")
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: srcFile,
            destination: dstFile,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0, "ditto must succeed for characterization.")

        // Record destination birthtime
        var dstStat = stat()
        lstat(dstFile, &dstStat)
        let dstBirthtime = dstStat.st_birthtimespec

        // FINDING: Record actual behavior
        let preserved = (srcBirthtime.tv_sec == dstBirthtime.tv_sec)
        if preserved {
            // FINDING: ditto preserves creation time (birthtime)
            print("UPSTREAM FINDING: ditto PRESERVES creation time (birthtime)")
        } else {
            // FINDING: ditto does NOT preserve creation time (birthtime)
            print("UPSTREAM FINDING: ditto does NOT preserve creation time (birthtime)")
            print("  Source:      \(srcBirthtime.tv_sec)")
            print("  Destination: \(dstBirthtime.tv_sec)")
        }
        // Record the finding -- do not assert, this is characterization
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Access-time changes on source

    /// Record whether running ditto updates source file access times.
    func testDittoSourceAtimeChange() throws {
        let srcFile = (fixtureDir as NSString).appendingPathComponent("atime_test.txt")
        try "atime test content".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Record source atime
        var srcStatBefore = stat()
        lstat(srcFile, &srcStatBefore)
        let atimeBefore = srcStatBefore.st_atimespec

        // Wait to ensure time difference is detectable
        Thread.sleep(forTimeInterval: 2.0)

        // Run ditto
        let dstFile = (destDir as NSString).appendingPathComponent("atime_test.txt")
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: srcFile,
            destination: dstFile,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Record source atime after ditto
        var srcStatAfter = stat()
        lstat(srcFile, &srcStatAfter)
        let atimeAfter = srcStatAfter.st_atimespec

        // FINDING: Record actual behavior
        let atimeChanged = (atimeBefore.tv_sec != atimeAfter.tv_sec)
        if atimeChanged {
            print("UPSTREAM FINDING: ditto CHANGES source atime")
            print("  Before: \(atimeBefore.tv_sec)")
            print("  After:  \(atimeAfter.tv_sec)")
        } else {
            print("UPSTREAM FINDING: ditto does NOT change source atime")
            print("  (May depend on mount options / APFS strictatime setting)")
        }
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Extended attribute preservation

    /// Record which extended attributes ditto preserves.
    func testDittoExtendedAttributePreservation() throws {
        let srcFile = (fixtureDir as NSString).appendingPathComponent("xattr_test.txt")
        try "xattr test content".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Set known extended attributes
        let testXattrs: [(String, String)] = [
            ("user.dittosuite.test", "test_value_1"),
            ("com.apple.metadata:kMDItemComment", "test comment"),
        ]

        for (name, value) in testXattrs {
            let data = Data(value.utf8)
            data.withUnsafeBytes { bytes in
                setxattr(srcFile, name, bytes.baseAddress, data.count, 0, 0)
            }
        }

        // Run ditto
        let dstFile = (destDir as NSString).appendingPathComponent("xattr_test.txt")
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: srcFile,
            destination: dstFile,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Check which xattrs are present on destination
        for (name, _) in testXattrs {
            let size = getxattr(dstFile, name, nil, 0, 0, 0)
            if size > 0 {
                print("UPSTREAM FINDING: ditto PRESERVES xattr '\(name)'")
            } else {
                print("UPSTREAM FINDING: ditto does NOT preserve xattr '\(name)'")
            }
        }
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Unicode NFC/NFD handling

    /// Record how ditto handles Unicode NFC vs NFD filenames.
    func testDittoUnicodeNFCNFD() throws {
        // Create file with NFC name (precomposed e-acute)
        let nfcName = "\u{00E9}.txt"  // precomposed
        let nfcPath = (fixtureDir as NSString).appendingPathComponent(nfcName)
        try "nfc content".write(toFile: nfcPath, atomically: true, encoding: .utf8)

        // Create file with NFD name (decomposed: e + combining acute)
        let nfdName = "e\u{0301}_nfd.txt"  // decomposed
        let nfdPath = (fixtureDir as NSString).appendingPathComponent(nfdName)
        try "nfd content".write(toFile: nfdPath, atomically: true, encoding: .utf8)

        // Run ditto on the directory
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: fixtureDir,
            destination: destDir,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Check destination filenames
        let destContents = try FileManager.default.contentsOfDirectory(atPath: destDir)
        print("UPSTREAM FINDING: Unicode filenames in destination: \(destContents)")

        for name in destContents {
            let bytes = Array(name.utf8)
            print("  '\(name)' = \(bytes.map { String(format: "%02x", $0) }.joined(separator: " "))")
        }
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Symlink handling

    /// Record how ditto handles symlinks during traversal.
    func testDittoSymlinkHandling() throws {
        let targetFile = (fixtureDir as NSString).appendingPathComponent("symlink_target.txt")
        try "symlink target".write(toFile: targetFile, atomically: true, encoding: .utf8)

        // Relative symlink
        let relLink = (fixtureDir as NSString).appendingPathComponent("relative_link.txt")
        try FileManager.default.createSymbolicLink(atPath: relLink, withDestinationPath: "symlink_target.txt")

        // Absolute symlink
        let absLink = (fixtureDir as NSString).appendingPathComponent("absolute_link.txt")
        try FileManager.default.createSymbolicLink(atPath: absLink, withDestinationPath: targetFile)

        // Run ditto
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: fixtureDir,
            destination: destDir,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Check destination
        let fm = FileManager.default
        let relLinkDest = (destDir as NSString).appendingPathComponent("relative_link.txt")
        let absLinkDest = (destDir as NSString).appendingPathComponent("absolute_link.txt")

        // Check if they are symlinks
        var relStatBuf = stat()
        lstat(relLinkDest, &relStatBuf)
        let relIsSymlink = (relStatBuf.st_mode & S_IFMT) == S_IFLNK

        var absStatBuf = stat()
        lstat(absLinkDest, &absStatBuf)
        let absIsSymlink = (absStatBuf.st_mode & S_IFMT) == S_IFLNK

        print("UPSTREAM FINDING: Relative symlink copied as symlink: \(relIsSymlink)")
        if relIsSymlink {
            let target = try fm.destinationOfSymbolicLink(atPath: relLinkDest)
            print("  Target: \(target)")
        }
        print("UPSTREAM FINDING: Absolute symlink copied as symlink: \(absIsSymlink)")
        if absIsSymlink {
            let target = try fm.destinationOfSymbolicLink(atPath: absLinkDest)
            print("  Target: \(target)")
        }
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Hard link preservation

    /// Record whether ditto preserves hard link identity.
    func testDittoHardLinkPreservation() throws {
        let srcFile1 = (fixtureDir as NSString).appendingPathComponent("hardlink_a.txt")
        try "hardlink content".write(toFile: srcFile1, atomically: true, encoding: .utf8)

        let srcFile2 = (fixtureDir as NSString).appendingPathComponent("hardlink_b.txt")
        try FileManager.default.linkItem(atPath: srcFile1, toPath: srcFile2)

        // Verify they share inode in source
        var stat1 = stat()
        lstat(srcFile1, &stat1)
        var stat2 = stat()
        lstat(srcFile2, &stat2)
        XCTAssertEqual(stat1.st_ino, stat2.st_ino, "Source hard links must share inode.")

        // Run ditto
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: fixtureDir,
            destination: destDir,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Check destination
        let dstFile1 = (destDir as NSString).appendingPathComponent("hardlink_a.txt")
        let dstFile2 = (destDir as NSString).appendingPathComponent("hardlink_b.txt")

        var dstat1 = stat()
        lstat(dstFile1, &dstat1)
        var dstat2 = stat()
        lstat(dstFile2, &dstat2)

        let preserved = (dstat1.st_ino == dstat2.st_ino)
        print("UPSTREAM FINDING: ditto preserves hard link identity: \(preserved)")
        print("  Source inode: \(stat1.st_ino)")
        print("  Dest inode A: \(dstat1.st_ino)")
        print("  Dest inode B: \(dstat2.st_ino)")
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Sparse file handling

    /// Record whether ditto preserves sparse file structure.
    func testDittoSparseFileHandling() throws {
        let srcFile = (fixtureDir as NSString).appendingPathComponent("sparse_test.dat")

        // Create a sparse file using truncate
        let fd = open(srcFile, O_WRONLY | O_CREAT | O_TRUNC, 0o644)
        guard fd >= 0 else {
            XCTFail("Could not create sparse file")
            return
        }
        // Set file size to 10MB but only write at the end
        ftruncate(fd, 10_000_000)
        let data = "end of sparse file"
        data.withCString { ptr in
            lseek(fd, 9_999_950, SEEK_SET)
            _ = write(fd, ptr, strlen(ptr))
        }
        close(fd)

        // Check source allocated blocks
        var srcStat = stat()
        lstat(srcFile, &srcStat)
        let srcBlocks = srcStat.st_blocks

        // Run ditto
        let dstFile = (destDir as NSString).appendingPathComponent("sparse_test.dat")
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: srcFile,
            destination: dstFile,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Check destination
        var dstStat = stat()
        lstat(dstFile, &dstStat)
        let dstBlocks = dstStat.st_blocks

        print("UPSTREAM FINDING: Sparse file handling:")
        print("  Source apparent size:   \(srcStat.st_size)")
        print("  Source allocated blocks: \(srcBlocks)")
        print("  Dest apparent size:     \(dstStat.st_size)")
        print("  Dest allocated blocks:  \(dstBlocks)")

        let sparsenessPreserved = (dstBlocks <= srcBlocks * 2)  // some overhead ok
        print("  Sparseness preserved: \(sparsenessPreserved)")
    }

    // MARK: - MUST-TEST-EMPIRICALLY: ditto exit code on partial failure

    /// Record ditto's exit code when one file has permission denied.
    func testDittoExitCodeOnPartialFailure() throws {
        let goodFile = (fixtureDir as NSString).appendingPathComponent("accessible.txt")
        try "accessible content".write(toFile: goodFile, atomically: true, encoding: .utf8)

        let badFile = (fixtureDir as NSString).appendingPathComponent("denied.txt")
        try "denied content".write(toFile: badFile, atomically: true, encoding: .utf8)
        chmod(badFile, 0o000)
        defer { chmod(badFile, 0o644) }

        let adapter = DittoAdapter()
        let (record, errors) = try await adapter.copy(
            source: fixtureDir,
            destination: destDir,
            options: .default,
            timeout: 60
        )

        print("UPSTREAM FINDING: ditto exit code on partial permission denial: \(record.exitCode)")
        print("  Stderr errors parsed: \(errors.count)")
        for err in errors {
            print("  - \(err.errorType.rawValue): \(err.path)")
        }

        // Check what was copied despite the error
        let destGood = (destDir as NSString).appendingPathComponent("accessible.txt")
        let goodCopied = FileManager.default.fileExists(atPath: destGood)
        print("  Accessible file copied: \(goodCopied)")
    }

    // MARK: - MUST-TEST-EMPIRICALLY: hdiutil verify on writable sparsebundle

    /// Record what happens when hdiutil verify is run on a writable sparsebundle.
    func testHdiutilVerifyOnWritableSparsebundle() throws {
        // Create a sparsebundle
        let bundlePath = (fixtureDir as NSString).appendingPathComponent("verify_test.sparsebundle")
        let hdiutil = HdiutilAdapter()

        let (createRecord, createResult) = try await hdiutil.createSparsebundle(
            path: bundlePath,
            volumeName: "VerifyTest",
            filesystem: .apfs,
            size: "100m",
            bandSize: nil,
            encryption: nil,
            timeout: 60
        )

        XCTAssertEqual(createRecord.exitCode, 0, "Bundle creation must succeed.")

        // Now test what our adapter does (should skip for .sparsebundle)
        let (record, result) = try await hdiutil.verify(
            path: createResult.imagePath,
            timeout: 60
        )

        print("UPSTREAM FINDING: hdiutil verify on writable sparsebundle:")
        print("  Skipped by adapter: \(result.skipped)")
        print("  Skip reason: \(result.skipReason ?? "N/A")")
        if let record = record {
            print("  Exit code: \(record.exitCode)")
        } else {
            print("  No invocation (skipped)")
        }
    }

    // MARK: - MUST-TEST-EMPIRICALLY: hdiutil attach -plist output schema

    /// Record the structure of hdiutil attach -plist output.
    func testHdiutilAttachPlistSchema() throws {
        let bundlePath = (fixtureDir as NSString).appendingPathComponent("plist_test.sparsebundle")
        let hdiutil = HdiutilAdapter()

        let (_, createResult) = try await hdiutil.createSparsebundle(
            path: bundlePath,
            volumeName: "PlistTest",
            filesystem: .apfs,
            size: "100m",
            bandSize: nil,
            encryption: nil,
            timeout: 60
        )

        let (attachRecord, attachResult) = try await hdiutil.attach(
            path: createResult.imagePath,
            mountPoint: nil,
            readOnly: false,
            noBrowse: true,
            timeout: 60
        )

        XCTAssertEqual(attachRecord.exitCode, 0)

        print("UPSTREAM FINDING: hdiutil attach -plist output schema:")
        print("  Device node: \(attachResult.deviceNode)")
        print("  Mount point: \(attachResult.mountPoint)")
        print("  Plist size: \(attachResult.plistOutput.count) bytes")

        // Parse and dump the plist structure
        if let plist = try? PropertyListSerialization.propertyList(
            from: attachResult.plistOutput, format: nil) as? [String: Any] {
            print("  Top-level keys: \(plist.keys.sorted())")
            if let entities = plist["system-entities"] as? [[String: Any]] {
                for (i, entity) in entities.enumerated() {
                    print("  Entity \(i) keys: \(entity.keys.sorted())")
                }
            }
        }

        // Clean up: detach
        try await hdiutil.detach(
            mountPointOrDevice: attachResult.mountPoint,
            force: false,
            timeout: 60
        )
    }

    // MARK: - MUST-TEST-EMPIRICALLY: ACL preservation

    /// Record whether ditto preserves ACLs on APFS.
    func testDittoACLPreservation() throws {
        let srcFile = (fixtureDir as NSString).appendingPathComponent("acl_test.txt")
        try "acl test content".write(toFile: srcFile, atomically: true, encoding: .utf8)

        // Set an ACL (requires macOS)
        // chmod +a "everyone deny delete" <file>
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/chmod")
        process.arguments = ["+a", "everyone deny delete", srcFile]
        try process.run()
        process.waitUntilExit()

        // Run ditto
        let dstFile = (destDir as NSString).appendingPathComponent("acl_test.txt")
        let adapter = DittoAdapter()
        let (record, _) = try await adapter.copy(
            source: srcFile,
            destination: dstFile,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        // Check ACL on destination
        let checkProcess = Process()
        checkProcess.executableURL = URL(fileURLWithPath: "/bin/ls")
        checkProcess.arguments = ["-le", dstFile]
        let pipe = Pipe()
        checkProcess.standardOutput = pipe
        try checkProcess.run()
        checkProcess.waitUntilExit()

        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        print("UPSTREAM FINDING: ACL preservation:")
        print("  Destination ACL listing: \(output)")
    }

    // MARK: - MUST-TEST-EMPIRICALLY: Timestamps on APFS vs HFS+

    /// Record timestamp fidelity (nanosecond precision).
    func testDittoTimestampFidelity() throws {
        let srcFile = (fixtureDir as NSString).appendingPathComponent("timestamp_test.txt")
        try "timestamp test".write(toFile: srcFile, atomically: true, encoding: .utf8)

        var srcStat = stat()
        lstat(srcFile, &srcStat)

        let adapter = DittoAdapter()
        let dstFile = (destDir as NSString).appendingPathComponent("timestamp_test.txt")
        let (record, _) = try await adapter.copy(
            source: srcFile,
            destination: dstFile,
            options: .default,
            timeout: 60
        )

        XCTAssertEqual(record.exitCode, 0)

        var dstStat = stat()
        lstat(dstFile, &dstStat)

        print("UPSTREAM FINDING: Timestamp fidelity:")
        print("  Source mtime: \(srcStat.st_mtimespec.tv_sec).\(srcStat.st_mtimespec.tv_nsec)")
        print("  Dest mtime:   \(dstStat.st_mtimespec.tv_sec).\(dstStat.st_mtimespec.tv_nsec)")
        print("  Source atime: \(srcStat.st_atimespec.tv_sec).\(srcStat.st_atimespec.tv_nsec)")
        print("  Dest atime:   \(dstStat.st_atimespec.tv_sec).\(dstStat.st_atimespec.tv_nsec)")
        print("  Source birth: \(srcStat.st_birthtimespec.tv_sec).\(srcStat.st_birthtimespec.tv_nsec)")
        print("  Dest birth:   \(dstStat.st_birthtimespec.tv_sec).\(dstStat.st_birthtimespec.tv_nsec)")

        let mtimeSecMatch = (srcStat.st_mtimespec.tv_sec == dstStat.st_mtimespec.tv_sec)
        let mtimeNsMatch = (srcStat.st_mtimespec.tv_nsec == dstStat.st_mtimespec.tv_nsec)
        print("  Mtime seconds match: \(mtimeSecMatch)")
        print("  Mtime nanoseconds match: \(mtimeNsMatch)")
    }

    // MARK: - MUST-TEST-EMPIRICALLY: hdiutil exit codes

    /// Record hdiutil exit codes for success and failure cases.
    func testHdiutilExitCodes() throws {
        // Success case (create)
        let bundlePath = (fixtureDir as NSString).appendingPathComponent("exitcode_test.sparsebundle")
        let hdiutil = HdiutilAdapter()

        let (createRecord, _) = try await hdiutil.createSparsebundle(
            path: bundlePath,
            volumeName: "ExitCodeTest",
            filesystem: .apfs,
            size: "50m",
            bandSize: nil,
            encryption: nil,
            timeout: 60
        )

        print("UPSTREAM FINDING: hdiutil exit codes:")
        print("  create (success): \(createRecord.exitCode)")

        // Failure case: create on existing path without -ov
        do {
            let (dupRecord, _) = try await hdiutil.createSparsebundle(
                path: bundlePath,
                volumeName: "DuplicateTest",
                filesystem: .apfs,
                size: "50m",
                bandSize: nil,
                encryption: nil,
                timeout: 60
            )
            print("  create (duplicate): \(dupRecord.exitCode)")
        } catch let error as HdiutilError {
            print("  create (duplicate): threw \(error)")
        }
    }
}
