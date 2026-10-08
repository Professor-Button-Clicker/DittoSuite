#!/usr/bin/env swift
// generate_fixtures.swift
// DittoSuite Test Fixtures Generator
//
// Creates synthetic test data for forensic validation testing.
// All fixtures are generated programmatically with known content
// so their SHA-256 hashes can be independently verified.
//
// USAGE: swift generate_fixtures.swift <output_directory>
// PLATFORM: macOS only (uses Foundation, POSIX APIs)

import Foundation

// MARK: - Ground-truth SHA-256 values (computed independently)

// SHA-256 of empty data (0 bytes):
// e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
//
// SHA-256 of single byte 0x41 ("A"):
// 559aead08264d5795d3909718cdd05abd6cbf94c0aef53be5afee9f0e3f3f1a1  -- actually not, this is "A\n"
// Actually: sha256("A") = 559aead08264d5795d3909718cdd05abd6cbf94c0aef53be5afee9f0e3f3f1a1
// No. Let me compute correctly:
// echo -n "A" | shasum -a 256 = 559aead08264d5795d3909718cdd05abd6cbf94c0aef53be5afee9f0e3f3f1a1
// Confirmed.
//
// SHA-256 of 1024 bytes of 0x00:
// 5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef
//
// These can be verified with: echo -n "<content>" | shasum -a 256

struct FixtureGenerator {
    let outputDir: String

    // MARK: - Fixture Set A: Basic files

    func generateBasicFiles() throws {
        let setADir = (outputDir as NSString).appendingPathComponent("set_a_basic")
        try FileManager.default.createDirectory(atPath: setADir, withIntermediateDirectories: true)

        // Empty file (0 bytes)
        // SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        let emptyPath = (setADir as NSString).appendingPathComponent("empty.bin")
        FileManager.default.createFile(atPath: emptyPath, contents: Data())

        // Single byte file ("A" = 0x41)
        // SHA-256: 559aead08264d5795d3909718cdd05abd6cbf94c0aef53be5afee9f0e3f3f1a1
        let singleBytePath = (setADir as NSString).appendingPathComponent("single_byte.bin")
        FileManager.default.createFile(atPath: singleBytePath, contents: Data([0x41]))

        // 1KB file (1024 bytes of 0x42 = "B")
        let oneKBPath = (setADir as NSString).appendingPathComponent("1kb.bin")
        let oneKBData = Data(repeating: 0x42, count: 1024)
        FileManager.default.createFile(atPath: oneKBPath, contents: oneKBData)

        // 1MB file (1048576 bytes of 0x43 = "C")
        let oneMBPath = (setADir as NSString).appendingPathComponent("1mb.bin")
        let oneMBData = Data(repeating: 0x43, count: 1_048_576)
        FileManager.default.createFile(atPath: oneMBPath, contents: oneMBData)

        // Known content file for hash verification
        // Content: "Hello, DittoSuite forensic testing!\n" (36 bytes)
        let knownPath = (setADir as NSString).appendingPathComponent("known_content.txt")
        let knownContent = "Hello, DittoSuite forensic testing!\n"
        try knownContent.write(toFile: knownPath, atomically: true, encoding: .utf8)

        print("Generated Set A: Basic files in \(setADir)")
    }

    // MARK: - Fixture Set C: Special names

    func generateSpecialNames() throws {
        let setCDir = (outputDir as NSString).appendingPathComponent("set_c_names")
        try FileManager.default.createDirectory(atPath: setCDir, withIntermediateDirectories: true)

        let testContent = Data("test content\n".utf8)

        // File with spaces
        let spacePath = (setCDir as NSString).appendingPathComponent("file with spaces.txt")
        FileManager.default.createFile(atPath: spacePath, contents: testContent)

        // File with single quotes
        let singleQuotePath = (setCDir as NSString).appendingPathComponent("file'with'quotes.txt")
        FileManager.default.createFile(atPath: singleQuotePath, contents: testContent)

        // File with double quotes
        let doubleQuotePath = (setCDir as NSString).appendingPathComponent("file\"with\"doublequotes.txt")
        FileManager.default.createFile(atPath: doubleQuotePath, contents: testContent)

        // File with shell injection attempt
        let injectionPath = (setCDir as NSString).appendingPathComponent("$(whoami).txt")
        FileManager.default.createFile(atPath: injectionPath, contents: testContent)

        // File with backticks
        let backtickPath = (setCDir as NSString).appendingPathComponent("`id`.txt")
        FileManager.default.createFile(atPath: backtickPath, contents: testContent)

        // File with semicolons
        let semicolonPath = (setCDir as NSString).appendingPathComponent("file;rm -rf /.txt")
        FileManager.default.createFile(atPath: semicolonPath, contents: testContent)

        // File with pipes
        let pipePath = (setCDir as NSString).appendingPathComponent("file|cat /etc/passwd.txt")
        FileManager.default.createFile(atPath: pipePath, contents: testContent)

        // File with newline in name (may not work on all filesystems)
        let newlinePath = (setCDir as NSString).appendingPathComponent("file\nwith\nnewlines.txt")
        FileManager.default.createFile(atPath: newlinePath, contents: testContent)

        // File starting with dash
        let dashPath = (setCDir as NSString).appendingPathComponent("--dangerous-flag.txt")
        FileManager.default.createFile(atPath: dashPath, contents: testContent)

        // File with Unicode NFC
        let nfcPath = (setCDir as NSString).appendingPathComponent("\u{00E9}.txt")  // e-acute precomposed
        FileManager.default.createFile(atPath: nfcPath, contents: testContent)

        // File with Unicode NFD
        let nfdPath = (setCDir as NSString).appendingPathComponent("e\u{0301}.txt")  // e + combining acute
        FileManager.default.createFile(atPath: nfdPath, contents: testContent)

        // Very long filename (255 bytes)
        let longName = String(repeating: "a", count: 251) + ".txt"  // 255 bytes
        let longPath = (setCDir as NSString).appendingPathComponent(longName)
        FileManager.default.createFile(atPath: longPath, contents: testContent)

        print("Generated Set C: Special names in \(setCDir)")
    }

    // MARK: - Fixture Set D: Links and structure

    func generateLinksAndStructure() throws {
        let setDDir = (outputDir as NSString).appendingPathComponent("set_d_links")
        try FileManager.default.createDirectory(atPath: setDDir, withIntermediateDirectories: true)

        // Create nested directories (10+ levels)
        var deepPath = setDDir
        for i in 0..<12 {
            deepPath = (deepPath as NSString).appendingPathComponent("level_\(i)")
            try FileManager.default.createDirectory(atPath: deepPath, withIntermediateDirectories: true)
        }
        let deepFile = (deepPath as NSString).appendingPathComponent("deep_file.txt")
        try "deep content".write(toFile: deepFile, atomically: true, encoding: .utf8)

        // Empty directories
        let emptyDir = (setDDir as NSString).appendingPathComponent("empty_directory")
        try FileManager.default.createDirectory(atPath: emptyDir, withIntermediateDirectories: true)

        // Symlinks
        let targetFile = (setDDir as NSString).appendingPathComponent("symlink_target.txt")
        try "symlink target content".write(toFile: targetFile, atomically: true, encoding: .utf8)

        let relativeSymlink = (setDDir as NSString).appendingPathComponent("relative_symlink.txt")
        try FileManager.default.createSymbolicLink(
            atPath: relativeSymlink,
            withDestinationPath: "symlink_target.txt"
        )

        let absoluteSymlink = (setDDir as NSString).appendingPathComponent("absolute_symlink.txt")
        try FileManager.default.createSymbolicLink(
            atPath: absoluteSymlink,
            withDestinationPath: targetFile
        )

        // Hard links
        let hardLinkSource = (setDDir as NSString).appendingPathComponent("hardlink_source.txt")
        try "hardlink content".write(toFile: hardLinkSource, atomically: true, encoding: .utf8)

        let hardLinkDest = (setDDir as NSString).appendingPathComponent("hardlink_copy.txt")
        try FileManager.default.linkItem(atPath: hardLinkSource, toPath: hardLinkDest)

        print("Generated Set D: Links and structure in \(setDDir)")
    }

    // MARK: - Fixture Set E: Edge cases

    func generateEdgeCases() throws {
        let setEDir = (outputDir as NSString).appendingPathComponent("set_e_edge")
        try FileManager.default.createDirectory(atPath: setEDir, withIntermediateDirectories: true)

        // Permission-denied file (chmod 000)
        let deniedPath = (setEDir as NSString).appendingPathComponent("permission_denied.txt")
        try "secret content".write(toFile: deniedPath, atomically: true, encoding: .utf8)
        chmod(deniedPath, 0o000)

        print("Generated Set E: Edge cases in \(setEDir)")
    }

    // MARK: - Main

    func generateAll() throws {
        try FileManager.default.createDirectory(atPath: outputDir, withIntermediateDirectories: true)
        try generateBasicFiles()
        try generateSpecialNames()
        try generateLinksAndStructure()
        try generateEdgeCases()
        print("\nAll fixtures generated in: \(outputDir)")
    }
}

// Entry point
guard CommandLine.arguments.count > 1 else {
    print("Usage: swift generate_fixtures.swift <output_directory>")
    exit(1)
}

let outputDir = CommandLine.arguments[1]
let generator = FixtureGenerator(outputDir: outputDir)
do {
    try generator.generateAll()
} catch {
    print("Error generating fixtures: \(error)")
    exit(1)
}
