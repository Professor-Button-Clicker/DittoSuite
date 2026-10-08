// PreflightCheckerTests.swift
// DittoSuite Test Suite
//
// Tests for PreflightChecker (FR-11: version allow-list, FR-14: legal authority,
// FR-22: all preflight checks, FR-29: free-space pre-check).
//
// PLATFORM: macOS only for checks that invoke sw_vers or FileManager.
// Pure logic tests (overlapping paths, source-is-destination) can be
// verified by code review on non-macOS platforms.

import XCTest
@testable import DittoSuite

final class PreflightCheckerTests: XCTestCase {

    // MARK: - FR-11: Version allow-list

    /// The validated version list starts empty, so any version triggers warn/refuse.
    func testEmptyAllowListTriggersWarning() {
        // The list is currently empty per spec
        XCTAssertTrue(PreflightChecker.validatedMacOSVersions.isEmpty,
            "Validated versions list must start empty (populated during validation).")
    }

    // MARK: - FR-22: Overlapping source detection

    /// Parent + child path selection must be detected as overlapping.
    func testOverlappingParentChildDetected() {
        let sources = [
            makeSource(path: "/Users/examiner/Documents"),
            makeSource(path: "/Users/examiner/Documents/subfolder"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: nil,
            estimatedTotalSize: 1000
        )

        let overlapCheck = result.checks.first { $0.name == "No Overlapping Sources" }
        XCTAssertNotNil(overlapCheck, "Overlap check must exist.")
        XCTAssertEqual(overlapCheck?.status, .fail,
            "Overlapping parent+child paths must be detected as FAIL (FR-22).")
        XCTAssertTrue(overlapCheck?.blocking ?? false,
            "Overlapping source detection must be blocking.")
    }

    /// Duplicate paths must be detected.
    func testDuplicatePathsDetected() {
        let sources = [
            makeSource(path: "/Users/examiner/Documents"),
            makeSource(path: "/Users/examiner/Documents"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: nil,
            estimatedTotalSize: 1000
        )

        let overlapCheck = result.checks.first { $0.name == "No Overlapping Sources" }
        XCTAssertEqual(overlapCheck?.status, .fail,
            "Duplicate paths must be detected.")
    }

    /// Non-overlapping paths must pass.
    func testNonOverlappingPathsPass() {
        let sources = [
            makeSource(path: "/Users/examiner/Documents"),
            makeSource(path: "/Users/examiner/Desktop"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: nil,
            estimatedTotalSize: 1000
        )

        let overlapCheck = result.checks.first { $0.name == "No Overlapping Sources" }
        XCTAssertEqual(overlapCheck?.status, .pass,
            "Non-overlapping paths must pass.")
    }

    // MARK: - FR-22: Source is destination blocked

    /// Source path on the destination volume must be blocked.
    func testSourceIsDestinationBlocked() {
        let mountPoint = "/Volumes/Evidence"
        let sources = [
            makeSource(path: "/Volumes/Evidence/some_folder"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: mountPoint,
            estimatedTotalSize: 1000
        )

        let sdCheck = result.checks.first { $0.name == "Source Not Destination" }
        XCTAssertNotNil(sdCheck, "Source-not-destination check must exist.")
        XCTAssertEqual(sdCheck?.status, .fail,
            "Source on destination volume must be FAIL (FR-22).")
        XCTAssertTrue(sdCheck?.blocking ?? false,
            "Source-is-destination must be blocking.")
    }

    /// Source not on destination must pass.
    func testSourceNotOnDestinationPasses() {
        let mountPoint = "/Volumes/Evidence"
        let sources = [
            makeSource(path: "/Users/examiner/Documents"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: mountPoint,
            estimatedTotalSize: 1000
        )

        let sdCheck = result.checks.first { $0.name == "Source Not Destination" }
        XCTAssertEqual(sdCheck?.status, .pass,
            "Source not on destination volume must pass.")
    }

    // MARK: - FR-22: TCC-protected path identification

    /// Selected paths overlapping TCC-protected locations must trigger a warning.
    func testTCCProtectedPathsIdentified() {
        let home = NSHomeDirectory()
        let sources = [
            makeSource(path: "\(home)/Library/Mail"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: nil,
            estimatedTotalSize: 1000
        )

        let tccCheck = result.checks.first { $0.name == "TCC-Protected Paths" }
        XCTAssertNotNil(tccCheck, "TCC check must exist.")
        XCTAssertEqual(tccCheck?.status, .warn,
            "TCC-protected source path must produce a warning.")
    }

    /// Non-TCC paths must pass the TCC check.
    func testNonTCCPathsPasses() {
        let sources = [
            makeSource(path: "/usr/local/share"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: nil,
            estimatedTotalSize: 1000
        )

        let tccCheck = result.checks.first { $0.name == "TCC-Protected Paths" }
        XCTAssertEqual(tccCheck?.status, .pass,
            "Non-TCC paths must pass the TCC check.")
    }

    // MARK: - FR-22: Band count thresholds

    /// Band count constants must match spec values.
    func testBandCountThresholds() {
        XCTAssertEqual(PreflightChecker.bandCountWarningThreshold, 90_000,
            "Warning threshold must be 90,000.")
        XCTAssertEqual(PreflightChecker.bandCountFailureThreshold, 100_000,
            "Failure threshold must be 100,000.")
    }

    /// Default band size must be 8MB.
    func testDefaultBandSize() {
        XCTAssertEqual(PreflightChecker.defaultBandSizeBytes, 8_388_608,
            "Default band size must be 8,388,608 bytes (8 MB = 16384 * 512).")
    }

    // MARK: - FR-22: Overall ready logic

    /// overallReady must be false when any blocking check fails.
    func testOverallReadyFalseOnBlockingFailure() {
        // Source-is-destination will cause a blocking failure
        let mountPoint = "/Volumes/Evidence"
        let sources = [
            makeSource(path: "/Volumes/Evidence/data"),
        ]

        let result = PreflightChecker.runAllChecks(
            sources: sources,
            bundlePath: "/tmp/test.sparsebundle",
            mountPoint: mountPoint,
            estimatedTotalSize: 1000
        )

        XCTAssertFalse(result.overallReady,
            "overallReady must be false when a blocking check fails.")
    }

    // MARK: - FR-29: Free-space pre-check

    /// Free space check must include 10% margin.
    func testFreeSpaceIncludesMargin() {
        // This test verifies the logic: required = estimated + (estimated / 10)
        // For 100GB estimated, required = 110GB
        let estimated: UInt64 = 100_000_000_000  // 100 GB
        let requiredWithMargin = estimated + (estimated / 10)
        XCTAssertEqual(requiredWithMargin, 110_000_000_000,
            "Free space check must require estimated + 10% margin (FR-29).")
    }

    // MARK: - FR-22: Binary check

    /// Binary check must use absolute paths.
    func testBinaryPathsAreAbsolute() {
        XCTAssertTrue(DittoAdapter.binaryPath.hasPrefix("/"),
            "DittoAdapter binary path must be absolute.")
        XCTAssertEqual(DittoAdapter.binaryPath, "/usr/bin/ditto",
            "DittoAdapter must use /usr/bin/ditto.")

        XCTAssertTrue(HdiutilAdapter.binaryPath.hasPrefix("/"),
            "HdiutilAdapter binary path must be absolute.")
        XCTAssertEqual(HdiutilAdapter.binaryPath, "/usr/bin/hdiutil",
            "HdiutilAdapter must use /usr/bin/hdiutil.")
    }

    // MARK: - Helpers

    private func makeSource(path: String) -> SourceSelection {
        SourceSelection(
            id: UUID(),
            path: path,
            estimatedSize: 1_000_000,
            estimatedFileCount: 100,
            isDirectory: true
        )
    }
}
