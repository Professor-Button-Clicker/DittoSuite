// VerificationEngine.swift
// DittoSuite — Forensic Collection Tool
//
// Orchestrates the full verification flow: build source manifest, build
// destination manifest, compare, detect source changes during collection.
// WHY: FR-03 -- verification must be independent of ditto's own success
// reporting. We build our own manifests and compare them ourselves.

import Foundation

// MARK: - Source change detection

/// A source file whose size or mtime changed during collection.
/// WHY: FR-20 -- source modifications during collection must be detected
/// and reported. The pre-collection manifest may not match the file's
/// current state if it was modified during the copy.
struct SourceChange: Codable, Sendable {
    let relativePath: String
    let field: String           // "size" or "modificationTime"
    let preCollectionValue: String
    let currentValue: String
}

// MARK: - Verification report

/// The complete verification report for a collection session.
struct VerificationReport: Codable, Sendable {
    let comparisonResult: ComparisonResult
    let sourceChanges: [SourceChange]       // files that changed during collection
    let hdiutilVerifySkipped: Bool          // true for writable sparsebundles
    let hdiutilVerifySkipReason: String?    // reason for skipping
    let overallVerdict: Verdict
    let verificationTimeUTC: Date
}

// MARK: - VerificationEngine

/// Orchestrates the full verification flow.
/// WHY: This engine ties together manifest building, comparison, and source
/// change detection into a single, auditable verification process.
enum VerificationEngine {

    /// Run the full post-collection verification.
    ///
    /// Steps:
    /// 1. Build destination manifest from mounted sparsebundle contents.
    /// 2. Compare source manifest (pre-built) against destination manifest.
    /// 3. Skip hdiutil verify for writable sparsebundles (documented behavior).
    /// 4. Detect source changes during collection (re-stat, not full re-hash).
    ///
    /// - Parameters:
    ///   - sourceManifests: Pre-collection manifests keyed by source path.
    ///   - destinationRoot: Path to the mounted sparsebundle contents.
    ///   - auditLog: The audit log for recording verification events.
    ///   - progress: Optional progress callback.
    /// - Returns: A VerificationReport.
    static func verify(
        sourceManifests: [String: Manifest],
        destinationRoot: String,
        auditLog: AuditLog,
        progress: ManifestBuilder.ProgressHandler? = nil
    ) async throws -> VerificationReport {
        try auditLog.log(eventType: .verificationStarted, details: [
            "destinationRoot": destinationRoot,
            "sourceCount": String(sourceManifests.count)
        ])

        // Step 1: Build destination manifest
        let destManifest = try ManifestBuilder.buildManifest(
            rootPath: destinationRoot,
            progress: progress
        )

        // Step 2: Build a combined source manifest for comparison
        // WHY: Each source was independently manifested pre-collection.
        // We combine them into one comparison against the destination.
        var allSourceEntries: [ManifestEntry] = []
        var allSourceErrors: [ManifestError] = []

        for (_, manifest) in sourceManifests.sorted(by: { $0.key < $1.key }) {
            allSourceEntries.append(contentsOf: manifest.entries)
            allSourceErrors.append(contentsOf: manifest.errors)
        }

        // Build a synthetic combined source manifest
        let combinedSourceManifest = Manifest(
            rootPath: "(combined)",
            buildTimeUTC: sourceManifests.values.map { $0.buildTimeUTC }.min() ?? Date(),
            totalFiles: allSourceEntries.filter { $0.fileType == .regular }.count,
            totalDirectories: allSourceEntries.filter { $0.fileType == .directory }.count,
            totalSymlinks: allSourceEntries.filter { $0.fileType == .symlink }.count,
            totalSize: allSourceEntries.filter { $0.fileType == .regular }
                .reduce(UInt64(0)) { $0 + $1.size },
            entries: allSourceEntries.sorted { $0.relativePath < $1.relativePath },
            errors: allSourceErrors,
            manifestSHA256: HashService.sha256(ofString: sourceManifests.sorted(by: { $0.key < $1.key }).map { $0.value.manifestSHA256 }.joined(separator: ":"))
        )

        // Step 3: Compare
        let comparisonResult = ManifestComparer.compare(
            source: combinedSourceManifest,
            destination: destManifest
        )

        // Step 4: Skip hdiutil verify for writable sparsebundles
        // WHY: hdiutil verify does NOT reliably cover writable sparsebundles.
        // The independent manifest comparison is the sole integrity check.
        // This is a resolved technical decision, not a shortcut.
        let hdiutilVerifySkipped = true
        let hdiutilVerifySkipReason = "hdiutil verify does not reliably cover writable " +
            "sparsebundles. The independent manifest comparison (source vs. destination " +
            "SHA-256 per file) is the sole integrity check."

        // Step 5: Detect source changes during collection
        // WHY: FR-20 -- re-stat source files (size and mtime only, not full re-hash)
        // to detect files that changed while ditto was copying.
        var sourceChanges: [SourceChange] = []
        for (sourcePath, manifest) in sourceManifests {
            let changes = detectSourceChanges(
                sourcePath: sourcePath,
                manifest: manifest
            )
            sourceChanges.append(contentsOf: changes)
        }

        // Overall verdict
        // WHY: The overall verdict is FAIL if the manifest comparison failed,
        // regardless of whether source changes were detected. Source changes
        // are informational flags, not automatic failures, because the
        // pre-collection manifest already captured the file state.
        let overallVerdict = comparisonResult.overallVerdict

        let report = VerificationReport(
            comparisonResult: comparisonResult,
            sourceChanges: sourceChanges,
            hdiutilVerifySkipped: hdiutilVerifySkipped,
            hdiutilVerifySkipReason: hdiutilVerifySkipReason,
            overallVerdict: overallVerdict,
            verificationTimeUTC: Date()
        )

        // Log verification completion
        try auditLog.log(eventType: .verificationCompleted, details: [
            "overallVerdict": overallVerdict.rawValue,
            "fileCountMatch": String(comparisonResult.totalFileCountMatch),
            "sizeMatch": String(comparisonResult.totalSizeMatch),
            "missingCount": String(comparisonResult.missingInDestination.count),
            "sourceChangesDetected": String(sourceChanges.count),
            "hdiutilVerifySkipped": String(hdiutilVerifySkipped),
            "sourceManifestHash": combinedSourceManifest.manifestSHA256,
            "destinationManifestHash": destManifest.manifestSHA256
        ])

        return report
    }

    // MARK: - Source change detection

    /// Re-stat source files and detect size or mtime changes since the manifest was built.
    /// WHY: We check size and mtime only (not full re-hash) because re-hashing
    /// the entire source could take hours for large collections and would itself
    /// modify atime. Size and mtime changes indicate substantive modifications.
    private static func detectSourceChanges(
        sourcePath: String,
        manifest: Manifest
    ) -> [SourceChange] {
        var changes: [SourceChange] = []

        for entry in manifest.entries where entry.fileType == .regular {
            let fullPath: String
            if manifest.rootPath.hasSuffix("/") {
                fullPath = manifest.rootPath + entry.relativePath
            } else {
                fullPath = manifest.rootPath + "/" + entry.relativePath
            }

            var currentStat = stat()
            guard lstat(fullPath, &currentStat) == 0 else {
                // File no longer exists -- that is a change
                changes.append(SourceChange(
                    relativePath: entry.relativePath,
                    field: "existence",
                    preCollectionValue: "present",
                    currentValue: "missing"
                ))
                continue
            }

            // Check size
            let currentSize = UInt64(currentStat.st_size)
            if currentSize != entry.size {
                changes.append(SourceChange(
                    relativePath: entry.relativePath,
                    field: "size",
                    preCollectionValue: String(entry.size),
                    currentValue: String(currentSize)
                ))
            }

            // Check mtime
            let currentMtime = Date(
                timeIntervalSince1970: TimeInterval(currentStat.st_mtimespec.tv_sec) + TimeInterval(currentStat.st_mtimespec.tv_nsec) / 1_000_000_000
            )
            if currentMtime != entry.modificationTime {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                changes.append(SourceChange(
                    relativePath: entry.relativePath,
                    field: "modificationTime",
                    preCollectionValue: formatter.string(from: entry.modificationTime),
                    currentValue: formatter.string(from: currentMtime)
                ))
            }
        }

        return changes
    }
}
