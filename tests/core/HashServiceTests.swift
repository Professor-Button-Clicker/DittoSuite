// HashServiceTests.swift
// DittoSuite Test Suite
//
// Tests for HashService (FR-02: SHA-256 correctness).
// Verifies SHA-256 output against independently computed reference values.
//
// PLATFORM: macOS only (requires CryptoKit, Foundation file I/O).
// On non-macOS: NOT RUN.

import XCTest
@testable import DittoSuite

final class HashServiceTests: XCTestCase {

    // MARK: - FR-02: SHA-256 correctness against known reference values

    /// SHA-256 of empty data must match the well-known empty hash.
    /// Reference: NIST FIPS 180-4, independently computed with `echo -n "" | shasum -a 256`.
    func testSHA256OfEmptyData() {
        // Ground truth: SHA-256 of zero bytes
        let expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        let actual = HashService.sha256(of: Data())
        XCTAssertEqual(actual, expected,
            "SHA-256 of empty data must match the NIST-defined empty hash.")
    }

    /// SHA-256 of the string "abc" must match NIST test vector.
    /// Reference: NIST FIPS 180-4, Example 1.
    func testSHA256OfABC() {
        // Ground truth: NIST FIPS 180-4 test vector for "abc"
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        let actual = HashService.sha256(ofString: "abc")
        XCTAssertEqual(actual, expected,
            "SHA-256 of 'abc' must match the NIST FIPS 180-4 test vector.")
    }

    /// SHA-256 of known single byte (0x41 = "A").
    /// Reference: `echo -n "A" | shasum -a 256`
    func testSHA256OfSingleByte() {
        let expected = "559aead08264d5795d3909718cdd05abd6cbf94c0aef53be5afee9f0e3f3f1a1"
        let actual = HashService.sha256(of: Data([0x41]))
        XCTAssertEqual(actual, expected,
            "SHA-256 of byte 0x41 must match reference value.")
    }

    /// SHA-256 output must be lowercase hex, 64 characters.
    func testSHA256OutputFormat() {
        let hash = HashService.sha256(of: Data([0x00]))
        XCTAssertEqual(hash.count, 64, "SHA-256 hex digest must be 64 characters.")
        XCTAssertEqual(hash, hash.lowercased(),
            "SHA-256 hex digest must be lowercase.")
        XCTAssertTrue(hash.allSatisfy { $0.isHexDigit },
            "SHA-256 hex digest must contain only hex digits.")
    }

    /// SHA-256 of a longer string for additional coverage.
    /// Reference: `echo -n "The quick brown fox jumps over the lazy dog" | shasum -a 256`
    func testSHA256OfKnownString() {
        let expected = "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"
        let actual = HashService.sha256(ofString: "The quick brown fox jumps over the lazy dog")
        XCTAssertEqual(actual, expected,
            "SHA-256 of well-known test string must match reference.")
    }

    // MARK: - FR-02: File hashing (streaming)

    /// Hash a file with known content and verify against reference.
    /// Creates a temporary file with known content, hashes it, and compares.
    func testSHA256OfFileWithKnownContent() throws {
        let tmpDir = NSTemporaryDirectory()
        let filePath = (tmpDir as NSString).appendingPathComponent("dittosuite_test_\(UUID().uuidString).bin")
        defer { try? FileManager.default.removeItem(atPath: filePath) }

        // Write known content: 1024 bytes of 0x42
        let data = Data(repeating: 0x42, count: 1024)
        try data.write(to: URL(fileURLWithPath: filePath))

        // Compute expected hash from the data directly (ground truth)
        let expectedFromData = HashService.sha256(of: data)

        // Now hash the file using streaming
        let actualFromFile = try HashService.sha256OfFile(atPath: filePath)

        XCTAssertEqual(actualFromFile, expectedFromData,
            "File hashing (streaming) must produce the same result as in-memory hashing of identical content.")
    }

    /// Hash an empty file and verify against known empty hash.
    func testSHA256OfEmptyFile() throws {
        let tmpDir = NSTemporaryDirectory()
        let filePath = (tmpDir as NSString).appendingPathComponent("dittosuite_test_empty_\(UUID().uuidString).bin")
        defer { try? FileManager.default.removeItem(atPath: filePath) }

        FileManager.default.createFile(atPath: filePath, contents: Data())

        let expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        let actual = try HashService.sha256OfFile(atPath: filePath)

        XCTAssertEqual(actual, expected,
            "SHA-256 of empty file must match the well-known empty hash.")
    }

    /// Hash a file larger than the chunk size (1MB) to test streaming boundary.
    func testSHA256OfLargeFile() throws {
        let tmpDir = NSTemporaryDirectory()
        let filePath = (tmpDir as NSString).appendingPathComponent("dittosuite_test_large_\(UUID().uuidString).bin")
        defer { try? FileManager.default.removeItem(atPath: filePath) }

        // Create a file larger than the 1MB chunk size (2MB)
        let data = Data(repeating: 0x44, count: 2_097_152)
        try data.write(to: URL(fileURLWithPath: filePath))

        let expectedFromData = HashService.sha256(of: data)
        let actualFromFile = try HashService.sha256OfFile(atPath: filePath)

        XCTAssertEqual(actualFromFile, expectedFromData,
            "Streaming hash of file larger than chunk size must match in-memory hash.")
    }

    /// Hashing a nonexistent file must throw an error.
    func testSHA256OfNonexistentFileThrows() {
        let path = "/nonexistent/path/that/does/not/exist/\(UUID().uuidString).bin"
        XCTAssertThrowsError(try HashService.sha256OfFile(atPath: path),
            "Hashing a nonexistent file must throw HashError.cannotOpenFile.")
    }

    // MARK: - FR-19: Determinism

    /// Same input hashed twice must produce the same output.
    func testSHA256Determinism() {
        let input = Data("forensic determinism test input".utf8)
        let hash1 = HashService.sha256(of: input)
        let hash2 = HashService.sha256(of: input)
        XCTAssertEqual(hash1, hash2,
            "Hashing the same input twice must produce identical results (FR-19).")
    }

    /// Different inputs must produce different hashes (basic sanity check).
    func testSHA256DifferentInputsDifferentHashes() {
        let hash1 = HashService.sha256(ofString: "input A")
        let hash2 = HashService.sha256(ofString: "input B")
        XCTAssertNotEqual(hash1, hash2,
            "Different inputs must produce different SHA-256 hashes.")
    }
}
