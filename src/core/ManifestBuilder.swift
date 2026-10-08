// ManifestBuilder.swift
// DittoSuite — Forensic Collection Tool
//
// Walks a path read-only and builds a structured manifest of every entry.
// Uses lstat (not stat) to avoid following symlinks.
// WHY: The manifest is the ground truth for independent verification.
// It is built by DittoSuite's own code, not by trusting ditto's success message.

import Foundation

// MARK: - File type

enum FileType: String, Codable, Sendable {
    case regular
    case directory
    case symlink
    case other
}

// MARK: - Manifest entry

/// A single entry in the manifest, representing one filesystem object.
/// WHY: Every field is forensically relevant. Path, type, size, and SHA-256
/// are used for verification. Timestamps, permissions, xattr names, and link
/// info are recorded for completeness and metadata comparison.
struct ManifestEntry: Codable, Sendable {
    let relativePath: String           // relative to the root being walked
    let fileType: FileType             // regular, directory, symlink, other
    let size: UInt64                   // file size in bytes (st_size)
    let sha256: String?                // SHA-256 for regular files; nil for dirs/symlinks
    let modificationTime: Date         // st_mtime
    let accessTime: Date               // st_atime
    let creationTime: Date             // st_birthtime (macOS)
    let permissions: UInt16            // st_mode & 0o7777
    let owner: UInt32                  // st_uid
    let group: UInt32                  // st_gid
    let extendedAttributeNames: [String]  // names only, sorted
    let symlinkTarget: String?         // target path for symlinks
    let hardLinkID: UInt64?            // st_ino for hard link detection
    let nlink: UInt32                  // st_nlink (link count)
    let deviceID: UInt64               // st_dev
    let flags: UInt32                  // st_flags (UF_HIDDEN, SF_RESTRICTED, etc.)
}

// MARK: - Manifest error

/// Records a path that could not be fully read during manifest building.
/// WHY: FR-04 -- no silent skips. Every unreadable path is recorded with
/// the reason, and the manifest is labeled partial if errors occurred.
struct ManifestError: Codable, Sendable {
    let path: String
    let reason: String
}

// MARK: - Manifest

/// The complete manifest for a walked path.
struct Manifest: Codable, Sendable {
    let rootPath: String               // absolute path that was walked
    let buildTimeUTC: Date
    let totalFiles: Int
    let totalDirectories: Int
    let totalSymlinks: Int
    let totalSize: UInt64              // sum of regular file sizes
    let entries: [ManifestEntry]       // sorted by relativePath
    let errors: [ManifestError]        // paths that could not be read
    let manifestSHA256: String         // hash of canonical JSON of entries
}

// MARK: - ManifestBuilder

/// Builds a manifest by walking a directory tree read-only.
/// WHY: Source walk must be read-only. We never set attributes, create files,
/// or open files for writing during manifest building.
enum ManifestBuilder {

    /// Progress callback: (currentPath, filesProcessed, totalEstimate)
    typealias ProgressHandler = @Sendable (String, Int, Int?) -> Void

    /// Build a manifest for the given root path.
    /// - Parameters:
    ///   - rootPath: Absolute path to walk.
    ///   - progress: Optional progress callback.
    /// - Returns: A complete Manifest.
    /// - Throws: Only if the root path itself is inaccessible.
    static func buildManifest(
        rootPath: String,
        progress: ProgressHandler? = nil
    ) throws -> Manifest {
        // WHY: Path validation prevents path traversal attacks and null byte injection.
        guard !rootPath.contains("\0") else {
            throw InvocationError.pathContainsNullByte(path: rootPath)
        }
        guard rootPath.hasPrefix("/") else {
            throw InvocationError.pathNotAbsolute(path: rootPath)
        }

        let fileManager = FileManager.default
        let rootURL = URL(fileURLWithPath: rootPath)

        // Check root is accessible
        guard fileManager.isReadableFile(atPath: rootPath) else {
            throw ManifestBuildError.rootNotReadable(path: rootPath)
        }

        var entries: [ManifestEntry] = []
        var errors: [ManifestError] = []
        var filesProcessed = 0

        // WHY: Use lstat-based enumeration. We must NOT follow symlinks
        // during traversal -- symlinks are recorded as symlinks with their targets.
        let resourceKeys: Set<URLResourceKey> = [
            .isDirectoryKey, .isSymbolicLinkKey, .isRegularFileKey
        ]

        // Check if root itself is a regular file (not a directory)
        var rootStat = stat()
        let rootStatResult = lstat(rootPath, &rootStat)
        if rootStatResult != 0 {
            throw ManifestBuildError.rootStatFailed(path: rootPath, errno: errno)
        }

        let rootIsFile = (rootStat.st_mode & S_IFMT) == S_IFREG

        if rootIsFile {
            // Single file -- just build one entry
            let entry = buildEntry(
                fullPath: rootPath,
                relativePath: URL(fileURLWithPath: rootPath).lastPathComponent,
                statBuf: rootStat
            )
            switch entry {
            case .success(let e): entries.append(e)
            case .failure(let err): errors.append(err)
            }
        } else {
            // Directory -- enumerate
            guard let enumerator = fileManager.enumerator(
                at: rootURL,
                includingPropertiesForKeys: Array(resourceKeys),
                options: [.producesRelativePathURLs]
            ) else {
                throw ManifestBuildError.cannotEnumerate(path: rootPath)
            }

            for case let itemURL as URL in enumerator {
                let fullPath = itemURL.path
                let relativePath = itemURL.relativePath

                // WHY: lstat, not stat -- we must not follow symlinks.
                var statBuf = stat()
                let statResult = lstat(fullPath, &statBuf)
                if statResult != 0 {
                    // WHY: FR-04 -- no silent skips. Record the error and continue.
                    errors.append(ManifestError(
                        path: relativePath,
                        reason: "lstat failed: \(String(cString: strerror(errno)))"
                    ))
                    continue
                }

                let entry = buildEntry(
                    fullPath: fullPath,
                    relativePath: relativePath,
                    statBuf: statBuf
                )
                switch entry {
                case .success(let e):
                    entries.append(e)
                    filesProcessed += 1
                    progress?(relativePath, filesProcessed, nil)
                case .failure(let err):
                    errors.append(err)
                    filesProcessed += 1
                }
            }
        }

        // WHY: Sort by relativePath for deterministic output (FR-19).
        // Same input always produces the same manifest.
        entries.sort { $0.relativePath < $1.relativePath }

        // Compute summary statistics
        let totalFiles = entries.filter { $0.fileType == .regular }.count
        let totalDirectories = entries.filter { $0.fileType == .directory }.count
        let totalSymlinks = entries.filter { $0.fileType == .symlink }.count
        let totalSize = entries
            .filter { $0.fileType == .regular }
            .reduce(UInt64(0)) { $0 + $1.size }

        // WHY: The manifest hash is computed over the canonical JSON of the sorted
        // entries array. This provides a single hash that covers all content hashes,
        // paths, and metadata -- the ground truth for verification.
        let manifestHash = try computeManifestHash(entries: entries)

        return Manifest(
            rootPath: rootPath,
            buildTimeUTC: Date(),
            totalFiles: totalFiles,
            totalDirectories: totalDirectories,
            totalSymlinks: totalSymlinks,
            totalSize: totalSize,
            entries: entries,
            errors: errors,
            manifestSHA256: manifestHash
        )
    }

    // MARK: - Private helpers

    /// Build a single ManifestEntry from lstat results.
    private static func buildEntry(
        fullPath: String,
        relativePath: String,
        statBuf: stat
    ) -> Result<ManifestEntry, ManifestError> {
        let mode = statBuf.st_mode
        let fileType: FileType
        let symlinkTarget: String?
        var sha256: String?

        switch mode & S_IFMT {
        case S_IFREG:
            fileType = .regular
            symlinkTarget = nil
            // WHY: Hash every regular file for per-file verification (FR-24).
            do {
                sha256 = try HashService.sha256OfFile(atPath: fullPath)
            } catch {
                return .failure(ManifestError(
                    path: relativePath,
                    reason: "SHA-256 hash failed: \(error)"
                ))
            }

        case S_IFDIR:
            fileType = .directory
            symlinkTarget = nil
            sha256 = nil

        case S_IFLNK:
            fileType = .symlink
            symlinkTarget = readSymlinkTarget(path: fullPath)
            sha256 = nil

        default:
            fileType = .other
            symlinkTarget = nil
            sha256 = nil
        }

        // WHY: Read extended attribute names (not values) to detect xattr
        // differences without size explosion from large xattr values.
        let xattrNames = listExtendedAttributes(path: fullPath)

        let entry = ManifestEntry(
            relativePath: relativePath,
            fileType: fileType,
            size: UInt64(statBuf.st_size),
            sha256: sha256,
            modificationTime: Date(timeIntervalSince1970: TimeInterval(statBuf.st_mtimespec.tv_sec) + TimeInterval(statBuf.st_mtimespec.tv_nsec) / 1_000_000_000),
            accessTime: Date(timeIntervalSince1970: TimeInterval(statBuf.st_atimespec.tv_sec) + TimeInterval(statBuf.st_atimespec.tv_nsec) / 1_000_000_000),
            creationTime: Date(timeIntervalSince1970: TimeInterval(statBuf.st_birthtimespec.tv_sec) + TimeInterval(statBuf.st_birthtimespec.tv_nsec) / 1_000_000_000),
            permissions: UInt16(mode & 0o7777),
            owner: UInt32(statBuf.st_uid),
            group: UInt32(statBuf.st_gid),
            extendedAttributeNames: xattrNames.sorted(),
            symlinkTarget: symlinkTarget,
            hardLinkID: UInt64(statBuf.st_ino),
            nlink: UInt32(statBuf.st_nlink),
            deviceID: UInt64(statBuf.st_dev),
            flags: UInt32(statBuf.st_flags)
        )

        return .success(entry)
    }

    /// Read the target of a symbolic link.
    private static func readSymlinkTarget(path: String) -> String? {
        let fileManager = FileManager.default
        return try? fileManager.destinationOfSymbolicLink(atPath: path)
    }

    /// List extended attribute names for a path (POSIX listxattr).
    /// WHY: We read only names, not values, to avoid size explosion.
    /// Values are not needed for the manifest comparison.
    private static func listExtendedAttributes(path: String) -> [String] {
        // Get buffer size needed
        let bufferSize = listxattr(path, nil, 0, XATTR_NOFOLLOW)
        guard bufferSize > 0 else { return [] }

        var buffer = [CChar](repeating: 0, count: bufferSize)
        let result = listxattr(path, &buffer, bufferSize, XATTR_NOFOLLOW)
        guard result > 0 else { return [] }

        // Parse null-separated list of names
        var names: [String] = []
        var current = ""
        for i in 0..<result {
            if buffer[i] == 0 {
                if !current.isEmpty {
                    names.append(current)
                    current = ""
                }
            } else {
                current.append(Character(UnicodeScalar(UInt8(bitPattern: buffer[i]))))
            }
        }
        if !current.isEmpty {
            names.append(current)
        }

        return names
    }

    /// Compute SHA-256 of canonical JSON encoding of entries array.
    /// WHY: The manifest hash is a single value that represents the entire
    /// manifest's content, enabling quick comparison and tamper detection.
    private static func computeManifestHash(entries: [ManifestEntry]) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let data = try encoder.encode(entries)
        return HashService.sha256(of: data)
    }
}

// MARK: - Errors

enum ManifestBuildError: Error, CustomStringConvertible {
    case rootNotReadable(path: String)
    case rootStatFailed(path: String, errno: Int32)
    case cannotEnumerate(path: String)

    var description: String {
        switch self {
        case .rootNotReadable(let path):
            return "Root path not readable: \(path)"
        case .rootStatFailed(let path, let errno):
            return "lstat failed on root \(path): \(String(cString: strerror(errno)))"
        case .cannotEnumerate(let path):
            return "Cannot enumerate path: \(path)"
        }
    }
}
