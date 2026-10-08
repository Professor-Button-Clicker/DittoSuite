// ReportGenerator.swift
// DittoSuite — Forensic Collection Tool
//
// Produces PDF and JSON reports for the collection session.
// WHY: FR-15, FR-23 -- the report must clearly state this is a targeted logical
// collection (NOT a forensic image), and must document both what was and was
// not collected, with reasons for any failures or skips.

import Foundation

// MARK: - Report data

/// All data needed to generate the final report.
struct ReportData: Codable, Sendable {
    let caseInfo: CaseInfo
    let environment: EnvironmentInfo
    let preflightResult: PreflightResult
    let sourceSelections: [SourceSelection]
    let collectionResults: [SourceCollectionResult]
    let verificationReport: VerificationReport
    let auditLogHash: String
    let bundleDetails: BundleDetails
    let knownLimitations: [String]
    let generationTimeUTC: Date
}

/// Environment information at collection time.
struct EnvironmentInfo: Codable, Sendable {
    let macOSVersion: String
    let macOSBuild: String
    let dittoSuiteVersion: String
    let gitCommit: String
    let buildHash: String
    let hostname: String
    let dittoSHA256: String
    let hdiutilSHA256: String
    let validatedVersionStatus: String   // "validated" or "NOT validated"
}

/// Sparsebundle details for the report.
struct BundleDetails: Codable, Sendable {
    let path: String
    let filesystem: String
    let virtualSize: String
    let bandSize: String
    let volumeName: String
    let encrypted: Bool
}

// MARK: - ReportGenerator

/// Generates PDF and JSON reports.
/// WHY: The report is the primary deliverable for legal proceedings.
/// Every forensic-sensitive detail must be included.
enum ReportGenerator {

    /// DittoSuite version. Updated with each release.
    static let version = "1.0.0-alpha"

    /// Known limitations documented in the integration profile.
    /// WHY: These are disclosed in every report so opposing counsel cannot
    /// claim the examiner was unaware of tool limitations.
    static let knownLimitations: [String] = [
        "ditto does not preserve directory hard links (documented in man page).",
        "ditto --extattr may not preserve all extended attributes, particularly " +
            "system-protected ones (Apple DTS forums/thread/761587).",
        "Source file access times (atime) may change during collection due to " +
            "reading source files. This depends on mount options and is documented " +
            "as a known, unavoidable side effect.",
        "This is a targeted logical collection, not a forensic image. " +
            "Files not selected by the examiner are not collected.",
        "hdiutil verify does not reliably cover writable sparsebundles. " +
            "The independent manifest comparison is the sole integrity check.",
        "Unicode filename normalization may occur on APFS " +
            "(must be empirically tested per macOS version).",
        "Sparse file sparseness may not be preserved by ditto " +
            "(must be empirically tested).",
        "APFS sparsebundle free-space reporting may be inaccurate on small bundles.",
        "hdiutil is deprecated in macOS 27 (Golden Gate). It remains functional; " +
            "no removal date has been announced.",
    ]

    // MARK: - JSON report

    /// Generate a JSON report.
    /// - Parameters:
    ///   - data: All report data.
    ///   - outputPath: Where to write the JSON file.
    /// - Returns: SHA-256 of the generated report file.
    static func generateJSON(
        data: ReportData,
        outputPath: String
    ) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let jsonData = try encoder.encode(data)

        try jsonData.write(to: URL(fileURLWithPath: outputPath))

        return HashService.sha256(of: jsonData)
    }

    // MARK: - PDF report

    /// Generate a plain-text report.
    /// WHY: Text is universally readable and avoids fidelity claims.
    /// A future version should use NSAttributedString + NSPrintOperation
    /// for native PDF rendering (no third-party dependencies needed).
    /// - Parameters:
    ///   - data: All report data.
    ///   - outputPath: Where to write the text report file.
    /// - Returns: SHA-256 of the generated report file.
    static func generateTextReport(
        data: ReportData,
        outputPath: String
    ) throws -> String {
        var content = ""

        // Header
        content += "DITTOSUITE TARGETED LOGICAL COLLECTION REPORT\n"
        content += "=" .repeated(50) + "\n\n"

        // Scope statement (FR-15)
        // WHY: This statement must appear prominently. It prevents
        // mischaracterization of the collection as a forensic image.
        content += "SCOPE STATEMENT\n"
        content += "-" .repeated(30) + "\n"
        content += "This is a targeted logical collection of user-selected files and folders. "
        content += "It is NOT a forensic image. Only the items listed below were collected.\n\n"

        // Case metadata
        content += "CASE INFORMATION\n"
        content += "-" .repeated(30) + "\n"
        content += "Examiner: \(data.caseInfo.examinerName)\n"
        content += "Case ID: \(data.caseInfo.caseID)\n"
        content += "Evidence ID: \(data.caseInfo.evidenceID)\n"
        content += "Device: \(data.caseInfo.deviceDescription)\n"
        content += "Legal Authority: \(data.caseInfo.legalAuthorityType.rawValue)\n"
        content += "Authority Reference: \(data.caseInfo.legalAuthorityReference)\n"
        content += "Scope Notes: \(data.caseInfo.scopeNotes)\n"
        content += "UTC Time Source: \(data.caseInfo.utcTimeSource)\n"
        content += "Setup Time: \(iso8601(data.caseInfo.setupTimestamp))\n\n"

        // Environment
        content += "ENVIRONMENT\n"
        content += "-" .repeated(30) + "\n"
        content += "macOS Version: \(data.environment.macOSVersion)\n"
        content += "macOS Build: \(data.environment.macOSBuild)\n"
        content += "DittoSuite Version: \(data.environment.dittoSuiteVersion)\n"
        content += "Git Commit: \(data.environment.gitCommit)\n"
        content += "Build Hash: \(data.environment.buildHash)\n"
        content += "Hostname: \(data.environment.hostname)\n"
        content += "ditto SHA-256: \(data.environment.dittoSHA256)\n"
        content += "hdiutil SHA-256: \(data.environment.hdiutilSHA256)\n"
        content += "Validated Version: \(data.environment.validatedVersionStatus)\n\n"

        // Pre-flight results
        content += "PRE-FLIGHT CHECKS\n"
        content += "-" .repeated(30) + "\n"
        for check in data.preflightResult.checks {
            let icon = check.status == .pass ? "[PASS]" :
                       check.status == .warn ? "[WARN]" : "[FAIL]"
            content += "\(icon) \(check.name): \(check.detail)\n"
        }
        content += "\n"

        // Source selections
        content += "SOURCE SELECTIONS\n"
        content += "-" .repeated(30) + "\n"
        for source in data.sourceSelections {
            let sizeGB = Double(source.estimatedSize) / 1_073_741_824
            content += "- \(source.path) (~\(String(format: "%.2f", sizeGB)) GB, "
            content += "~\(source.estimatedFileCount) files)\n"
        }
        content += "\n"

        // Collection results
        content += "COLLECTION RESULTS\n"
        content += "-" .repeated(30) + "\n"
        for result in data.collectionResults {
            content += "Source: \(result.sourcePath)\n"
            content += "  Status: \(result.status.rawValue)\n"
            if let reason = result.failureReason {
                content += "  Reason: \(reason)\n"
            }
            content += "  Files Attempted: \(result.filesAttempted)\n"
            if !result.perFileErrors.isEmpty {
                content += "  Per-file Errors:\n"
                for err in result.perFileErrors {
                    content += "    - \(err.path): \(err.errorType.rawValue) - \(err.rawMessage)\n"
                }
            }
            if let record = result.invocationRecord {
                content += "  ditto Exit Code: \(record.exitCode)\n"
                content += "  Duration: \(String(format: "%.1f", record.durationSeconds))s\n"
                content += "  Arguments: \(record.arguments.joined(separator: " "))\n"
            }
            content += "\n"
        }

        // Verification results
        content += "VERIFICATION RESULTS\n"
        content += "-" .repeated(30) + "\n"
        let vr = data.verificationReport
        content += "Overall Verdict: \(vr.overallVerdict.rawValue)\n"
        content += "File Count Match: \(vr.comparisonResult.totalFileCountMatch)\n"
        content += "Total Size Match: \(vr.comparisonResult.totalSizeMatch)\n"
        content += "Source Manifest Hash: \(vr.comparisonResult.sourceManifestHash)\n"
        content += "Destination Manifest Hash: \(vr.comparisonResult.destinationManifestHash)\n"

        let failedFiles = vr.comparisonResult.perFileResults.filter { $0.verdict == .fail }
        if !failedFiles.isEmpty {
            content += "\nFailed Verifications:\n"
            for file in failedFiles {
                content += "  - \(file.relativePath): SHA-256 match=\(file.sha256Match), "
                content += "size match=\(file.sizeMatch), present=\(file.pathPresent)\n"
            }
        }

        if !vr.comparisonResult.missingInDestination.isEmpty {
            content += "\nMissing in Destination:\n"
            for path in vr.comparisonResult.missingInDestination {
                content += "  - \(path)\n"
            }
        }

        if !vr.comparisonResult.extraInDestination.isEmpty {
            content += "\nExtra in Destination (informational):\n"
            for path in vr.comparisonResult.extraInDestination {
                content += "  - \(path)\n"
            }
        }

        if !vr.comparisonResult.metadataDifferences.isEmpty {
            content += "\nMetadata Differences (informational):\n"
            for diff in vr.comparisonResult.metadataDifferences {
                content += "  - \(diff.relativePath): \(diff.field) "
                content += "source=\(diff.sourceValue) dest=\(diff.destinationValue)\n"
            }
        }

        if vr.hdiutilVerifySkipped {
            content += "\nhdiutil verify: SKIPPED\n"
            content += "  Reason: \(vr.hdiutilVerifySkipReason ?? "N/A")\n"
        }

        if !vr.sourceChanges.isEmpty {
            content += "\nSource Changes During Collection:\n"
            for change in vr.sourceChanges {
                content += "  - \(change.relativePath): \(change.field) "
                content += "was \(change.preCollectionValue), now \(change.currentValue)\n"
            }
        }
        content += "\n"

        // What was NOT collected (FR-23)
        content += "WHAT WAS NOT COLLECTED\n"
        content += "-" .repeated(30) + "\n"
        let incomplete = data.collectionResults.filter {
            $0.status != .complete
        }
        if incomplete.isEmpty {
            content += "All selected sources were completely collected and verified.\n"
        } else {
            for result in incomplete {
                content += "- \(result.sourcePath): \(result.status.rawValue)"
                if let reason = result.failureReason {
                    content += " (\(reason))"
                }
                content += "\n"
            }
        }
        content += "\n"

        // Known limitations
        content += "KNOWN LIMITATIONS\n"
        content += "-" .repeated(30) + "\n"
        for (i, limitation) in data.knownLimitations.enumerated() {
            content += "\(i + 1). \(limitation)\n"
        }
        content += "\n"

        // Bundle details
        content += "SPARSEBUNDLE DETAILS\n"
        content += "-" .repeated(30) + "\n"
        content += "Path: \(data.bundleDetails.path)\n"
        content += "Filesystem: \(data.bundleDetails.filesystem)\n"
        content += "Virtual Size: \(data.bundleDetails.virtualSize)\n"
        content += "Band Size: \(data.bundleDetails.bandSize)\n"
        content += "Volume Name: \(data.bundleDetails.volumeName)\n"
        content += "Encrypted: \(data.bundleDetails.encrypted)\n\n"

        // Audit log hash
        content += "AUDIT LOG\n"
        content += "-" .repeated(30) + "\n"
        content += "Audit Log SHA-256: \(data.auditLogHash)\n\n"

        // Generation timestamp
        content += "REPORT GENERATION\n"
        content += "-" .repeated(30) + "\n"
        content += "Generated: \(iso8601(data.generationTimeUTC))\n"

        let textData = Data(content.utf8)
        try textData.write(to: URL(fileURLWithPath: outputPath))

        return HashService.sha256(of: textData)
    }

    // MARK: - Helpers

    private static func iso8601(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

// MARK: - String repeat helper

private extension String {
    func repeated(_ count: Int) -> String {
        String(repeating: self, count: count)
    }
}
