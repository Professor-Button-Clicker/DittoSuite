// ManifestComparer.swift
// DittoSuite — Forensic Collection Tool
//
// Compares source and destination manifests to produce a PASS/FAIL verdict.
// WHY: Independent verification is required (FR-03). We do not trust ditto's
// exit code or success message alone. This comparer re-derives the verdict
// from our own manifest data.

import Foundation

// MARK: - Verdict

enum Verdict: String, Codable, Sendable {
    case pass = "PASS"
    case fail = "FAIL"
}

// MARK: - Diff severity

enum DiffSeverity: String, Codable, Sendable {
    case informational
    case warning
}

// MARK: - Per-file comparison result

/// Result of comparing one file between source and destination manifests.
struct FileComparisonResult: Codable, Sendable {
    let relativePath: String
    let sha256Match: Bool
    let sizeMatch: Bool
    let pathPresent: Bool
    let verdict: Verdict                   // PASS only if all checks pass
}

// MARK: - Metadata difference

/// A metadata field that differs between source and destination.
/// WHY: Metadata differences are reported separately (FR-27) and do NOT
/// cause an overall FAIL. They are informational for the examiner.
struct MetadataDiff: Codable, Sendable {
    let relativePath: String
    let field: String           // e.g., "modificationTime", "permissions"
    let sourceValue: String
    let destinationValue: String
    let severity: DiffSeverity
}

// MARK: - Comparison result

/// The complete result of comparing two manifests.
struct ComparisonResult: Codable, Sendable {
    let overallVerdict: Verdict            // PASS only if every check passes
    let totalFileCountMatch: Bool
    let totalSizeMatch: Bool
    let perFileResults: [FileComparisonResult]
    let missingInDestination: [String]     // relative paths present in source but not dest
    let extraInDestination: [String]       // relative paths present in dest but not source
    let metadataDifferences: [MetadataDiff]
    let sourceManifestHash: String
    let destinationManifestHash: String
}

// MARK: - ManifestComparer

/// Compares a source manifest against a destination manifest.
/// WHY: This is the independent verification engine (FR-03, FR-24, FR-25, FR-26).
/// It does not trust ditto's output -- it builds its own verdict from the
/// manifests that ManifestBuilder independently constructed.
enum ManifestComparer {

    /// Compare two manifests and produce a structured comparison result.
    /// - Parameters:
    ///   - source: The source (pre-collection) manifest.
    ///   - destination: The destination (post-collection) manifest.
    /// - Returns: A ComparisonResult with overall verdict and per-file details.
    static func compare(source: Manifest, destination: Manifest) -> ComparisonResult {
        // Build lookup dictionaries keyed by relativePath
        let sourceByPath = Dictionary(
            source.entries.map { ($0.relativePath, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let destByPath = Dictionary(
            destination.entries.map { ($0.relativePath, $0) },
            uniquingKeysWith: { first, _ in first }
        )

        // WHY: Only regular files are counted for file count and size comparison.
        // Directories and symlinks are structural, not content.
        let sourceFiles = source.entries.filter { $0.fileType == .regular }
        let destFiles = destination.entries.filter { $0.fileType == .regular }

        // Check 1: Total file count (FR-25)
        let totalFileCountMatch = sourceFiles.count == destFiles.count

        // Check 2: Total byte size (FR-26)
        let sourceTotalSize = sourceFiles.reduce(UInt64(0)) { $0 + $1.size }
        let destTotalSize = destFiles.reduce(UInt64(0)) { $0 + $1.size }
        let totalSizeMatch = sourceTotalSize == destTotalSize

        // Check 3 & 4: Per-file SHA-256 and size (FR-24)
        var perFileResults: [FileComparisonResult] = []
        var missingInDestination: [String] = []
        var metadataDiffs: [MetadataDiff] = []

        for sourceEntry in source.entries {
            guard let destEntry = destByPath[sourceEntry.relativePath] else {
                // Check 5: Path presence -- missing in destination = FAIL
                missingInDestination.append(sourceEntry.relativePath)
                perFileResults.append(FileComparisonResult(
                    relativePath: sourceEntry.relativePath,
                    sha256Match: false,
                    sizeMatch: false,
                    pathPresent: false,
                    verdict: .fail
                ))
                continue
            }

            var sha256Match = true
            var sizeMatch = true

            // Only compare SHA-256 and size for regular files
            if sourceEntry.fileType == .regular {
                sha256Match = sourceEntry.sha256 == destEntry.sha256
                sizeMatch = sourceEntry.size == destEntry.size
            }

            let verdict: Verdict = (sha256Match && sizeMatch) ? .pass : .fail

            perFileResults.append(FileComparisonResult(
                relativePath: sourceEntry.relativePath,
                sha256Match: sha256Match,
                sizeMatch: sizeMatch,
                pathPresent: true,
                verdict: verdict
            ))

            // Metadata comparison (informational, not FAIL)
            // WHY: FR-27 -- metadata differences are reported separately.
            // Access time is NOT compared because the source walk itself may update it.
            compareMetadata(
                source: sourceEntry,
                destination: destEntry,
                diffs: &metadataDiffs
            )
        }

        // Check 6: Extra entries in destination (informational)
        // WHY: Extra files (e.g., .DS_Store from mount) are logged but do not
        // cause a FAIL. They are informational for the examiner.
        let sourcePathSet = Set(source.entries.map { $0.relativePath })
        let extraInDestination = destination.entries
            .filter { !sourcePathSet.contains($0.relativePath) }
            .map { $0.relativePath }
            .sorted()

        // Overall verdict: FAIL if any critical check fails
        let anyFileFailed = perFileResults.contains { $0.verdict == .fail }
        let overallVerdict: Verdict =
            (totalFileCountMatch && totalSizeMatch && !anyFileFailed && missingInDestination.isEmpty)
            ? .pass : .fail

        return ComparisonResult(
            overallVerdict: overallVerdict,
            totalFileCountMatch: totalFileCountMatch,
            totalSizeMatch: totalSizeMatch,
            perFileResults: perFileResults.sorted { $0.relativePath < $1.relativePath },
            missingInDestination: missingInDestination.sorted(),
            extraInDestination: extraInDestination,
            metadataDifferences: metadataDiffs.sorted { $0.relativePath < $1.relativePath },
            sourceManifestHash: source.manifestSHA256,
            destinationManifestHash: destination.manifestSHA256
        )
    }

    // MARK: - Metadata comparison

    /// Compare metadata fields between source and destination entries.
    /// WHY: Access time is NOT compared (FR-27 note) because reading the source
    /// files during manifest building may update atime.
    private static func compareMetadata(
        source: ManifestEntry,
        destination: ManifestEntry,
        diffs: inout [MetadataDiff]
    ) {
        // Modification time
        if source.modificationTime != destination.modificationTime {
            diffs.append(MetadataDiff(
                relativePath: source.relativePath,
                field: "modificationTime",
                sourceValue: iso8601String(source.modificationTime),
                destinationValue: iso8601String(destination.modificationTime),
                severity: .warning
            ))
        }

        // Permissions
        if source.permissions != destination.permissions {
            diffs.append(MetadataDiff(
                relativePath: source.relativePath,
                field: "permissions",
                sourceValue: String(format: "%04o", source.permissions),
                destinationValue: String(format: "%04o", destination.permissions),
                severity: .warning
            ))
        }

        // Owner
        if source.owner != destination.owner {
            diffs.append(MetadataDiff(
                relativePath: source.relativePath,
                field: "owner",
                sourceValue: String(source.owner),
                destinationValue: String(destination.owner),
                severity: .warning
            ))
        }

        // Group
        if source.group != destination.group {
            diffs.append(MetadataDiff(
                relativePath: source.relativePath,
                field: "group",
                sourceValue: String(source.group),
                destinationValue: String(destination.group),
                severity: .warning
            ))
        }

        // Extended attribute names (subset check)
        let sourceXattrs = Set(source.extendedAttributeNames)
        let destXattrs = Set(destination.extendedAttributeNames)
        if sourceXattrs != destXattrs {
            let missing = sourceXattrs.subtracting(destXattrs)
            let extra = destXattrs.subtracting(sourceXattrs)
            var detail = ""
            if !missing.isEmpty { detail += "missing: \(missing.sorted().joined(separator: ", "))" }
            if !extra.isEmpty {
                if !detail.isEmpty { detail += "; " }
                detail += "extra: \(extra.sorted().joined(separator: ", "))"
            }
            diffs.append(MetadataDiff(
                relativePath: source.relativePath,
                field: "extendedAttributeNames",
                sourceValue: source.extendedAttributeNames.joined(separator: ", "),
                destinationValue: destination.extendedAttributeNames.joined(separator: ", "),
                severity: .informational
            ))
        }

        // Symlink target
        if source.symlinkTarget != destination.symlinkTarget {
            diffs.append(MetadataDiff(
                relativePath: source.relativePath,
                field: "symlinkTarget",
                sourceValue: source.symlinkTarget ?? "(none)",
                destinationValue: destination.symlinkTarget ?? "(none)",
                severity: .warning
            ))
        }
    }

    // MARK: - Helpers

    private static func iso8601String(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
