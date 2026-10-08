// PreflightChecker.swift
// DittoSuite — Forensic Collection Tool
//
// Runs all pre-collection checks before evidence operations begin.
// WHY: FR-22 -- preflight checks prevent common failure modes (insufficient
// space, missing binaries, overlapping selections, etc.) before any
// evidence-touching operation occurs. Discovering these problems mid-collection
// wastes time and complicates the audit trail.

import Foundation

// MARK: - Preflight status

enum PreflightStatus: String, Codable, Sendable {
    case pass
    case warn
    case fail
}

// MARK: - Preflight check result

/// Result of a single preflight check.
struct PreflightCheck: Codable, Sendable {
    let name: String
    let status: PreflightStatus
    let detail: String
    let blocking: Bool              // if true, collection cannot proceed
}

// MARK: - Overall preflight result

/// Combined result of all preflight checks.
struct PreflightResult: Codable, Sendable {
    let checks: [PreflightCheck]
    let overallReady: Bool          // true only if no blocking checks failed
}

// MARK: - Version policy

/// How to handle unvalidated macOS versions.
enum VersionPolicy: String, Codable, Sendable {
    case warn       // allow with warning (default)
    case refuse     // block collection
}

// MARK: - PreflightChecker

/// Runs all preflight checks before collection begins.
enum PreflightChecker {
    /// Validated macOS versions. Populated after empirical testing.
    /// WHY: FR-11 -- only versions that have been tested and validated
    /// are on the allow-list. Running on an untested version may produce
    /// different behavior from ditto/hdiutil.
    static let validatedMacOSVersions: [String] = [
        // Add validated versions after empirical testing
        // Format: "major.minor" (e.g., "14.5")
    ]

    /// Known TCC-protected paths for spot-checking FDA status.
    /// WHY: There is no API to check Full Disk Access. Spot-checking
    /// known protected paths is Apple DTS's recommended approach.
    static let tccProtectedPaths: [String] = [
        "~/Library/Mail",
        "~/Library/Messages",
        "~/Library/Safari",
        "~/Library/Calendars",
        "~/Library/Reminders",
        "~/Library/Contacts",
        "~/Library/HomeKit",
        "~/Library/Photos",
        "~/Desktop",
        "~/Documents",
        "~/Downloads",
    ]

    /// Band count warning threshold.
    /// WHY: Exceeding ~100,000 bands can cause directory structure failures
    /// under HFS+/APFS. We warn at 90,000 to give the examiner time to respond.
    static let bandCountWarningThreshold: Int = 90_000
    static let bandCountFailureThreshold: Int = 100_000

    /// Default band size in bytes (8.4 MB as documented).
    static let defaultBandSizeBytes: UInt64 = 8_388_608  // 8 MB (16384 * 512)

    // MARK: - Run all checks

    /// Run all preflight checks.
    /// - Parameters:
    ///   - sources: Selected source paths.
    ///   - bundlePath: Path to the sparsebundle (or where it will be created).
    ///   - mountPoint: Mount point of the attached sparsebundle (nil if not yet attached).
    ///   - estimatedTotalSize: Estimated total size of all sources.
    ///   - versionPolicy: How to handle unvalidated macOS versions.
    /// - Returns: A PreflightResult with all check results.
    static func runAllChecks(
        sources: [SourceSelection],
        bundlePath: String,
        mountPoint: String?,
        estimatedTotalSize: UInt64,
        versionPolicy: VersionPolicy = .warn
    ) -> PreflightResult {
        var checks: [PreflightCheck] = []

        // 1. macOS version check
        checks.append(checkMacOSVersion(policy: versionPolicy))

        // 2. macOS build recorded
        checks.append(checkMacOSBuild())

        // 3. FDA spot-check (only for sources that overlap TCC paths)
        checks.append(checkFullDiskAccess(sources: sources))

        // 4. Source paths readable
        checks.append(contentsOf: checkSourcesReadable(sources: sources))

        // 5. ditto binary exists and is executable
        checks.append(checkBinaryExists(path: "/usr/bin/ditto", name: "ditto"))

        // 6. hdiutil binary exists and is executable
        checks.append(checkBinaryExists(path: "/usr/bin/hdiutil", name: "hdiutil"))

        // 7. ditto binary SHA-256 recorded
        checks.append(checkBinaryHash(path: "/usr/bin/ditto", name: "ditto"))

        // 8. hdiutil binary SHA-256 recorded
        checks.append(checkBinaryHash(path: "/usr/bin/hdiutil", name: "hdiutil"))

        // 9. No duplicate or overlapping source selections
        checks.append(checkOverlappingSources(sources: sources))

        // 10. Source is not the destination volume
        if let mp = mountPoint {
            checks.append(checkSourceNotDestination(sources: sources, mountPoint: mp))
        }

        // 11. Free space check
        if let mp = mountPoint {
            checks.append(checkFreeSpace(
                mountPoint: mp,
                estimatedSize: estimatedTotalSize
            ))
        }

        // 12. TCC-protected paths identified
        checks.append(checkTCCProtectedPaths(sources: sources))

        // 13. Band count check (if bundle exists)
        checks.append(checkBandCount(bundlePath: bundlePath))

        // 14. Estimated band count
        checks.append(checkEstimatedBandCount(
            bundlePath: bundlePath,
            estimatedSize: estimatedTotalSize
        ))

        let overallReady = !checks.contains { $0.blocking && $0.status == .fail }

        return PreflightResult(
            checks: checks,
            overallReady: overallReady
        )
    }

    // MARK: - Individual checks

    /// Check macOS version against validated allow-list.
    private static func checkMacOSVersion(policy: VersionPolicy) -> PreflightCheck {
        do {
            let (version, _) = try SystemInfo.macOSVersionAndBuild()
            if validatedMacOSVersions.contains(version) {
                return PreflightCheck(
                    name: "macOS Version",
                    status: .pass,
                    detail: "macOS \(version) is on the validated allow-list.",
                    blocking: false
                )
            } else {
                let blocking = (policy == .refuse)
                return PreflightCheck(
                    name: "macOS Version",
                    status: blocking ? .fail : .warn,
                    detail: "macOS \(version) is NOT on the validated allow-list. " +
                        "Tool behavior has not been empirically verified on this version.",
                    blocking: blocking
                )
            }
        } catch {
            return PreflightCheck(
                name: "macOS Version",
                status: .fail,
                detail: "Could not determine macOS version: \(error)",
                blocking: true
            )
        }
    }

    /// Record macOS build (always passes).
    private static func checkMacOSBuild() -> PreflightCheck {
        do {
            let (_, build) = try SystemInfo.macOSVersionAndBuild()
            return PreflightCheck(
                name: "macOS Build",
                status: .pass,
                detail: "Build: \(build)",
                blocking: false
            )
        } catch {
            return PreflightCheck(
                name: "macOS Build",
                status: .warn,
                detail: "Could not determine macOS build: \(error)",
                blocking: false
            )
        }
    }

    /// Spot-check Full Disk Access by testing known protected paths.
    /// WHY: No API exists to check FDA. Apple DTS recommends spot-checking.
    private static func checkFullDiskAccess(sources: [SourceSelection]) -> PreflightCheck {
        let home = NSHomeDirectory()
        let expandedProtected = tccProtectedPaths.map { path -> String in
            if path.hasPrefix("~/") {
                return home + String(path.dropFirst(1))
            }
            return path
        }

        var inaccessible: [String] = []
        let fm = FileManager.default

        for protectedPath in expandedProtected {
            // Only check if one of our sources might need this path
            if fm.fileExists(atPath: protectedPath) {
                if !fm.isReadableFile(atPath: protectedPath) {
                    inaccessible.append(protectedPath)
                }
            }
        }

        if inaccessible.isEmpty {
            return PreflightCheck(
                name: "Full Disk Access",
                status: .pass,
                detail: "Spot-check of known protected paths passed. " +
                    "Note: no API exists to definitively confirm FDA status.",
                blocking: false
            )
        } else {
            return PreflightCheck(
                name: "Full Disk Access",
                status: .warn,
                detail: "Cannot read \(inaccessible.count) protected path(s): " +
                    "\(inaccessible.joined(separator: ", ")). " +
                    "Grant Full Disk Access in System Settings > Privacy & Security.",
                blocking: false  // WHY: Warn, not block. FDA affects specific paths only.
            )
        }
    }

    /// Check that each source path is readable.
    private static func checkSourcesReadable(sources: [SourceSelection]) -> [PreflightCheck] {
        let fm = FileManager.default
        return sources.map { source in
            if fm.isReadableFile(atPath: source.path) {
                return PreflightCheck(
                    name: "Source Readable: \(source.path)",
                    status: .pass,
                    detail: "Source path is readable.",
                    blocking: false
                )
            } else {
                return PreflightCheck(
                    name: "Source Readable: \(source.path)",
                    status: .fail,
                    detail: "Source path is NOT readable: \(source.path)",
                    blocking: true
                )
            }
        }
    }

    /// Check binary exists and is executable.
    private static func checkBinaryExists(path: String, name: String) -> PreflightCheck {
        let fm = FileManager.default
        guard fm.fileExists(atPath: path) else {
            return PreflightCheck(
                name: "\(name) Binary",
                status: .fail,
                detail: "\(name) not found at \(path)",
                blocking: true
            )
        }
        guard fm.isExecutableFile(atPath: path) else {
            return PreflightCheck(
                name: "\(name) Binary",
                status: .fail,
                detail: "\(name) at \(path) is not executable",
                blocking: true
            )
        }
        return PreflightCheck(
            name: "\(name) Binary",
            status: .pass,
            detail: "\(name) found and executable at \(path)",
            blocking: false
        )
    }

    /// Record binary SHA-256 (always passes).
    private static func checkBinaryHash(path: String, name: String) -> PreflightCheck {
        do {
            let hash = try HashService.sha256OfFile(atPath: path)
            return PreflightCheck(
                name: "\(name) SHA-256",
                status: .pass,
                detail: "SHA-256: \(hash)",
                blocking: false
            )
        } catch {
            return PreflightCheck(
                name: "\(name) SHA-256",
                status: .warn,
                detail: "Could not hash \(name): \(error)",
                blocking: false
            )
        }
    }

    /// Check for duplicate or overlapping source selections.
    /// WHY: Overlapping paths (parent + child) would result in duplicate files
    /// in the collection, wasting space and complicating verification.
    private static func checkOverlappingSources(sources: [SourceSelection]) -> PreflightCheck {
        let paths = sources.map { $0.path }.sorted()
        var overlaps: [(String, String)] = []

        for i in 0..<paths.count {
            for j in (i + 1)..<paths.count {
                let parent = paths[i].hasSuffix("/") ? paths[i] : paths[i] + "/"
                if paths[j].hasPrefix(parent) || paths[i] == paths[j] {
                    overlaps.append((paths[i], paths[j]))
                }
            }
        }

        if overlaps.isEmpty {
            return PreflightCheck(
                name: "No Overlapping Sources",
                status: .pass,
                detail: "No duplicate or overlapping source selections found.",
                blocking: false
            )
        } else {
            let overlapDesc = overlaps.map { "\($0.0) contains \($0.1)" }.joined(separator: "; ")
            return PreflightCheck(
                name: "No Overlapping Sources",
                status: .fail,
                detail: "Overlapping sources detected: \(overlapDesc). Remove the child paths.",
                blocking: true
            )
        }
    }

    /// Check source is not on the destination volume.
    /// WHY: Collecting from the destination to itself is circular and would
    /// produce an ever-growing collection.
    private static func checkSourceNotDestination(
        sources: [SourceSelection],
        mountPoint: String
    ) -> PreflightCheck {
        let mp = mountPoint.hasSuffix("/") ? mountPoint : mountPoint + "/"

        for source in sources {
            let sp = source.path.hasSuffix("/") ? source.path : source.path + "/"
            if sp.hasPrefix(mp) || source.path == mountPoint {
                return PreflightCheck(
                    name: "Source Not Destination",
                    status: .fail,
                    detail: "Source \(source.path) is on the destination volume \(mountPoint).",
                    blocking: true
                )
            }
        }

        return PreflightCheck(
            name: "Source Not Destination",
            status: .pass,
            detail: "No source paths are on the destination volume.",
            blocking: false
        )
    }

    /// Check free space on destination vs estimated collection size.
    /// WHY: Running out of space mid-collection produces a partial result
    /// and wastes examiner time.
    private static func checkFreeSpace(
        mountPoint: String,
        estimatedSize: UInt64
    ) -> PreflightCheck {
        let fm = FileManager.default
        do {
            let attrs = try fm.attributesOfFileSystem(forPath: mountPoint)
            guard let freeSpace = attrs[.systemFreeSize] as? UInt64 else {
                return PreflightCheck(
                    name: "Free Space",
                    status: .warn,
                    detail: "Could not determine free space on \(mountPoint).",
                    blocking: false
                )
            }

            // WHY: 10% margin to account for filesystem overhead and metadata.
            let requiredSpace = estimatedSize + (estimatedSize / 10)

            if freeSpace >= requiredSpace {
                let freeGB = Double(freeSpace) / 1_073_741_824
                let reqGB = Double(requiredSpace) / 1_073_741_824
                return PreflightCheck(
                    name: "Free Space",
                    status: .pass,
                    detail: String(format: "%.1f GB available, %.1f GB required (with 10%% margin).",
                                   freeGB, reqGB),
                    blocking: false
                )
            } else {
                let freeGB = Double(freeSpace) / 1_073_741_824
                let reqGB = Double(requiredSpace) / 1_073_741_824
                return PreflightCheck(
                    name: "Free Space",
                    status: .fail,
                    detail: String(format: "Insufficient space: %.1f GB available, %.1f GB required (with 10%% margin).",
                                   freeGB, reqGB),
                    blocking: true
                )
            }
        } catch {
            return PreflightCheck(
                name: "Free Space",
                status: .warn,
                detail: "Could not check free space on \(mountPoint): \(error)",
                blocking: false
            )
        }
    }

    /// Identify TCC-protected paths in the selection.
    private static func checkTCCProtectedPaths(sources: [SourceSelection]) -> PreflightCheck {
        let home = NSHomeDirectory()
        let expandedProtected = tccProtectedPaths.map { path -> String in
            if path.hasPrefix("~/") {
                return home + String(path.dropFirst(1))
            }
            return path
        }

        var protectedSources: [String] = []
        for source in sources {
            for protectedPath in expandedProtected {
                let sp = source.path.hasSuffix("/") ? source.path : source.path + "/"
                let pp = protectedPath.hasSuffix("/") ? protectedPath : protectedPath + "/"
                if sp.hasPrefix(pp) || source.path == protectedPath ||
                   pp.hasPrefix(sp) {
                    protectedSources.append("\(source.path) (overlaps \(protectedPath))")
                }
            }
        }

        if protectedSources.isEmpty {
            return PreflightCheck(
                name: "TCC-Protected Paths",
                status: .pass,
                detail: "No selected sources overlap known TCC-protected paths.",
                blocking: false
            )
        } else {
            return PreflightCheck(
                name: "TCC-Protected Paths",
                status: .warn,
                detail: "Selected sources overlap TCC-protected paths: " +
                    "\(protectedSources.joined(separator: "; ")). " +
                    "Ensure Full Disk Access is granted.",
                blocking: false
            )
        }
    }

    /// Check current band count in the sparsebundle.
    /// WHY: Exceeding ~100,000 bands can cause directory structure failures.
    private static func checkBandCount(bundlePath: String) -> PreflightCheck {
        let bandsPath = (bundlePath as NSString).appendingPathComponent("bands")
        let fm = FileManager.default

        guard fm.fileExists(atPath: bandsPath) else {
            return PreflightCheck(
                name: "Band Count",
                status: .pass,
                detail: "Bundle not yet created or bands directory not found.",
                blocking: false
            )
        }

        do {
            let contents = try fm.contentsOfDirectory(atPath: bandsPath)
            let count = contents.count

            if count >= bandCountFailureThreshold {
                return PreflightCheck(
                    name: "Band Count",
                    status: .fail,
                    detail: "Band count (\(count)) exceeds failure threshold (\(bandCountFailureThreshold)). " +
                        "The sparsebundle may become unstable.",
                    blocking: true
                )
            } else if count >= bandCountWarningThreshold {
                return PreflightCheck(
                    name: "Band Count",
                    status: .warn,
                    detail: "Band count (\(count)) approaching threshold (\(bandCountFailureThreshold)). " +
                        "Consider using a larger band size or a new bundle.",
                    blocking: false
                )
            } else {
                return PreflightCheck(
                    name: "Band Count",
                    status: .pass,
                    detail: "Band count: \(count) (threshold: \(bandCountFailureThreshold)).",
                    blocking: false
                )
            }
        } catch {
            return PreflightCheck(
                name: "Band Count",
                status: .warn,
                detail: "Could not count bands: \(error)",
                blocking: false
            )
        }
    }

    /// Estimate final band count after collection.
    /// WHY: Pre-checking prevents the examiner from discovering mid-collection
    /// that the bundle will exceed the band count threshold.
    private static func checkEstimatedBandCount(
        bundlePath: String,
        estimatedSize: UInt64
    ) -> PreflightCheck {
        let bandsPath = (bundlePath as NSString).appendingPathComponent("bands")
        let fm = FileManager.default

        var existingBands = 0
        if fm.fileExists(atPath: bandsPath) {
            existingBands = (try? fm.contentsOfDirectory(atPath: bandsPath).count) ?? 0
        }

        let estimatedNewBands = Int(estimatedSize / defaultBandSizeBytes) + 1
        let estimatedTotal = existingBands + estimatedNewBands

        if estimatedTotal >= bandCountFailureThreshold {
            return PreflightCheck(
                name: "Estimated Band Count",
                status: .warn,
                detail: "Estimated total bands after collection: \(estimatedTotal) " +
                    "(existing: \(existingBands) + estimated new: \(estimatedNewBands)). " +
                    "This exceeds the \(bandCountFailureThreshold) threshold. " +
                    "Consider using a larger band size.",
                blocking: false
            )
        } else if estimatedTotal >= bandCountWarningThreshold {
            return PreflightCheck(
                name: "Estimated Band Count",
                status: .warn,
                detail: "Estimated total bands after collection: \(estimatedTotal). " +
                    "Approaching threshold of \(bandCountFailureThreshold).",
                blocking: false
            )
        } else {
            return PreflightCheck(
                name: "Estimated Band Count",
                status: .pass,
                detail: "Estimated total bands: \(estimatedTotal).",
                blocking: false
            )
        }
    }
}
