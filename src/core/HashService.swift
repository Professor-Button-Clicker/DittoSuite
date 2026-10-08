// HashService.swift
// DittoSuite — Forensic Collection Tool
//
// SHA-256 hashing via CryptoKit. Streaming for large files.
// WHY: All integrity verification uses SHA-256. A single, centralized hashing
// service ensures consistent algorithm usage and prevents accidental use of
// weaker hashes (MD5, SHA-1) as the sole integrity check.

import Foundation
import CryptoKit

// MARK: - HashService

enum HashService {
    /// Size of chunks for streaming file hashing (1 MB).
    /// WHY: Streaming avoids loading entire large files into memory,
    /// which is critical for multi-gigabyte evidence files.
    private static let chunkSize: Int = 1_048_576  // 1 MB

    // MARK: - File hashing (streaming)

    /// Compute SHA-256 of a file at the given path using streaming reads.
    /// WHY: Evidence files can be very large (tens of GB). Streaming hashing
    /// reads in 1MB chunks to avoid memory exhaustion.
    /// - Parameter path: Absolute path to the file.
    /// - Returns: Lowercase hex-encoded SHA-256 digest.
    /// - Throws: If the file cannot be opened or read.
    static func sha256OfFile(atPath path: String) throws -> String {
        guard let fileHandle = FileHandle(forReadingAtPath: path) else {
            throw HashError.cannotOpenFile(path: path)
        }
        defer {
            // WHY: Always close file handles. Leaking handles on evidence
            // volumes could prevent clean detach.
            try? fileHandle.close()
        }

        var hasher = SHA256()

        while true {
            // WHY: autoreleasepool prevents memory buildup when hashing
            // many files in sequence (each Data chunk is released promptly).
            let data = try autoreleasepool { () -> Data in
                guard let chunk = try fileHandle.read(upToCount: chunkSize) else {
                    return Data()
                }
                return chunk
            }
            if data.isEmpty { break }
            hasher.update(data: data)
        }

        let digest = hasher.finalize()
        return digest.hexString
    }

    // MARK: - Data hashing

    /// Compute SHA-256 of in-memory Data.
    /// - Parameter data: The data to hash.
    /// - Returns: Lowercase hex-encoded SHA-256 digest.
    static func sha256(of data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.hexString
    }

    // MARK: - String hashing

    /// Compute SHA-256 of a UTF-8 string.
    /// - Parameter string: The string to hash.
    /// - Returns: Lowercase hex-encoded SHA-256 digest.
    static func sha256(ofString string: String) -> String {
        let data = Data(string.utf8)
        return sha256(of: data)
    }
}

// MARK: - Digest hex encoding

extension SHA256Digest {
    /// Lowercase hex-encoded string representation.
    var hexString: String {
        self.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Errors

enum HashError: Error, CustomStringConvertible {
    case cannotOpenFile(path: String)

    var description: String {
        switch self {
        case .cannotOpenFile(let path):
            return "Cannot open file for hashing: \(path)"
        }
    }
}
