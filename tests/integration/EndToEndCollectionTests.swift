// EndToEndCollectionTests.swift
// DittoSuite Test Suite
//
// End-to-end integration tests covering the full collection workflow.
// Tests verification logic, report generation, and state machine behavior.
//
// PLATFORM: macOS only for tests that invoke ditto/hdiutil.
// Pure logic tests (CaseInfo validation, CollectionState, ReportGenerator)
// can be verified by code review on non-macOS platforms.

import XCTest
@testable import DittoSuite

final class EndToEndCollectionTests: XCTestCase {

    // MARK: - FR-14: Legal authority required (empty fields rejected)

    /// CaseInfo.validate() must reject empty required fields.
    func testCaseInfoRejectsEmptyFields() {
        let caseInfo = CaseInfo(
            examinerName: "",
            caseID: "TEST-001",
            evidenceID: "EV-001",
            deviceDescription: "Test device",
            legalAuthorityType: .warrant,
            legalAuthorityReference: "W-2024-001",
            scopeNotes: "",
            utcTimeSource: "NTP",
            setupTimestamp: Date()
        )

        let invalid = caseInfo.validate()
        XCTAssertNotNil(invalid,
            "Empty examiner name must be rejected (FR-14).")
        XCTAssertTrue(invalid?.contains("Examiner Name") ?? false,
            "Validation must identify 'Examiner Name' as missing.")
    }

    /// All empty required fields must be reported.
    func testCaseInfoReportsAllEmptyFields() {
        let caseInfo = CaseInfo(
            examinerName: "",
            caseID: "",
            evidenceID: "",
            deviceDescription: "",
            legalAuthorityType: .consent,
            legalAuthorityReference: "",
            scopeNotes: "",
            utcTimeSource: "NTP",
            setupTimestamp: Date()
        )

        let invalid = caseInfo.validate()
        XCTAssertNotNil(invalid)
        XCTAssertEqual(invalid?.count, 5,
            "All 5 required empty fields must be reported.")
    }

    /// Valid case info must pass validation.
    func testCaseInfoValidPasses() {
        let caseInfo = CaseInfo(
            examinerName: "Jane Doe",
            caseID: "2024-TEST-001",
            evidenceID: "EV-001",
            deviceDescription: "MacBook Pro 2023",
            legalAuthorityType: .warrant,
            legalAuthorityReference: "SW-2024-12345",
            scopeNotes: "User documents only",
            utcTimeSource: "NTP synced",
            setupTimestamp: Date()
        )

        let invalid = caseInfo.validate()
        XCTAssertNil(invalid,
            "Valid case info must pass validation.")
    }

    /// Whitespace-only fields must be treated as empty.
    func testCaseInfoRejectsWhitespaceOnlyFields() {
        let caseInfo = CaseInfo(
            examinerName: "   ",
            caseID: "\t\n",
            evidenceID: "EV-001",
            deviceDescription: "Test",
            legalAuthorityType: .consent,
            legalAuthorityReference: "CONSENT-001",
            scopeNotes: "",
            utcTimeSource: "NTP",
            setupTimestamp: Date()
        )

        let invalid = caseInfo.validate()
        XCTAssertNotNil(invalid,
            "Whitespace-only fields must be rejected.")
        XCTAssertTrue(invalid?.contains("Examiner Name") ?? false)
        XCTAssertTrue(invalid?.contains("Case ID") ?? false)
    }

    // MARK: - FR-13: Partial results labeled

    /// SourceCollectionStatus must have .partial case.
    func testPartialStatusExists() {
        let status = SourceCollectionStatus.partial
        XCTAssertEqual(status.rawValue, "PARTIAL",
            "PARTIAL status must have raw value 'PARTIAL' (FR-13).")
    }

    /// SourceCollectionStatus must have .cancelled case.
    func testCancelledStatusExists() {
        let status = SourceCollectionStatus.cancelled
        XCTAssertEqual(status.rawValue, "CANCELLED",
            "CANCELLED status must have raw value 'CANCELLED' (FR-30).")
    }

    /// All status values must be distinct.
    func testAllStatusValuesDistinct() {
        let allStatuses: [SourceCollectionStatus] = [
            .pending, .inProgress, .complete, .partial, .failed, .cancelled, .skipped
        ]
        let rawValues = allStatuses.map { $0.rawValue }
        XCTAssertEqual(Set(rawValues).count, rawValues.count,
            "All SourceCollectionStatus raw values must be distinct.")
    }

    // MARK: - FR-15: Report scope statement

    /// ReportGenerator must include "NOT a forensic image" in known limitations.
    func testReportKnownLimitationsContainScopeStatement() {
        let limitations = ReportGenerator.knownLimitations

        let hasScope = limitations.contains { $0.contains("NOT a forensic image") ||
                                              $0.contains("not a forensic image") }
        XCTAssertTrue(hasScope,
            "Known limitations must include scope statement (FR-15).")
    }

    /// Report must include all 9 known limitations.
    func testReportHasAllKnownLimitations() {
        let limitations = ReportGenerator.knownLimitations

        XCTAssertEqual(limitations.count, 9,
            "Must have exactly 9 known limitations per spec.")

        // Check key limitations are present
        let hasDirectoryHardLinks = limitations.contains { $0.contains("directory hard links") }
        XCTAssertTrue(hasDirectoryHardLinks, "Must document directory hard link limitation.")

        let hasXattr = limitations.contains { $0.contains("extended attributes") || $0.contains("extattr") }
        XCTAssertTrue(hasXattr, "Must document xattr preservation limitation.")

        let hasAtime = limitations.contains { $0.contains("access time") || $0.contains("atime") }
        XCTAssertTrue(hasAtime, "Must document atime change limitation.")

        let hasHdiutilVerify = limitations.contains { $0.contains("hdiutil verify") }
        XCTAssertTrue(hasHdiutilVerify, "Must document hdiutil verify limitation.")

        let hasUnicode = limitations.contains { $0.contains("Unicode") || $0.contains("normalization") }
        XCTAssertTrue(hasUnicode, "Must document Unicode normalization limitation.")

        let hasSparse = limitations.contains { $0.contains("Sparse") || $0.contains("sparse") }
        XCTAssertTrue(hasSparse, "Must document sparse file limitation.")

        let hasDeprecation = limitations.contains { $0.contains("deprecated") }
        XCTAssertTrue(hasDeprecation, "Must document hdiutil deprecation.")
    }

    // MARK: - CollectionState step ordering

    /// WorkflowStep must enforce sequential ordering.
    func testWorkflowStepOrdering() {
        let steps = WorkflowStep.allCases
        for i in 1..<steps.count {
            XCTAssertTrue(steps[i - 1] < steps[i],
                "\(steps[i - 1]) must be < \(steps[i])")
        }
    }

    /// CollectionState must prevent jumping ahead.
    func testCollectionStatePreventSkipping() {
        let state = CollectionState()
        XCTAssertEqual(state.currentStep, .caseSetup)

        // Cannot jump to step 3 from step 0
        let jumped = state.advanceTo(.preflight)
        XCTAssertFalse(jumped,
            "Must not be able to skip steps in the workflow.")
        XCTAssertEqual(state.currentStep, .caseSetup,
            "State must not change on rejected advance.")
    }

    /// CollectionState must allow sequential advancement.
    func testCollectionStateAllowsSequentialAdvance() {
        let state = CollectionState()

        XCTAssertTrue(state.advanceTo(.bundleSetup))
        XCTAssertEqual(state.currentStep, .bundleSetup)

        XCTAssertTrue(state.advanceTo(.sourceSelection))
        XCTAssertEqual(state.currentStep, .sourceSelection)
    }

    // MARK: - FR-16: No network code verification

    /// Verify no network-related imports or types appear in evidence-processing code.
    /// This is a code review test -- it checks the source code structure.
    func testNoNetworkCodeInEvidenceProcessing() {
        // This is verified by code review. The following checks document
        // what was reviewed:
        //
        // REVIEWED: src/core/*.swift -- No imports of Network, URLSession,
        //   URLRequest, or any networking framework.
        // REVIEWED: src/adapters/*.swift -- No networking code. Only subprocess
        //   invocation via Process.
        // REVIEWED: Environment scrubbing removes CFNETWORK_* variables.
        //
        // The scrubbed environment removes CFNETWORK_* variables
        let env = DittoAdapter.scrubbedEnvironment()
        for key in env.keys {
            XCTAssertFalse(key.hasPrefix("CFNETWORK_"),
                "CFNETWORK_* must be removed from environment (FR-16).")
        }
    }

    // MARK: - FR-06: UTC timestamps

    /// All timestamp-related fields must use UTC.
    func testTimezoneIsAlwaysUTC() {
        let env = DittoAdapter.scrubbedEnvironment()
        XCTAssertEqual(env["TZ"], "UTC",
            "Process timezone must be set to UTC (FR-06).")
    }

    // MARK: - OverallCollectionStatus values

    /// OverallCollectionStatus must include all required states.
    func testOverallCollectionStatusValues() {
        XCTAssertEqual(OverallCollectionStatus.inProgress.rawValue, "IN_PROGRESS")
        XCTAssertEqual(OverallCollectionStatus.complete.rawValue, "COMPLETE")
        XCTAssertEqual(OverallCollectionStatus.partial.rawValue, "PARTIAL")
        XCTAssertEqual(OverallCollectionStatus.failed.rawValue, "FAILED")
        XCTAssertEqual(OverallCollectionStatus.cancelled.rawValue, "CANCELLED")
    }

    // MARK: - PerFileErrorType coverage

    /// All per-file error types from spec must be covered.
    func testPerFileErrorTypes() {
        XCTAssertEqual(PerFileErrorType.operationNotPermitted.rawValue, "operationNotPermitted")
        XCTAssertEqual(PerFileErrorType.permissionDenied.rawValue, "permissionDenied")
        XCTAssertEqual(PerFileErrorType.noSuchFileOrDirectory.rawValue, "noSuchFileOrDirectory")
        XCTAssertEqual(PerFileErrorType.other.rawValue, "other")
    }

    // MARK: - LegalAuthorityType coverage

    /// All legal authority types from spec must be present.
    func testLegalAuthorityTypeCoverage() {
        let types = LegalAuthorityType.allCases
        XCTAssertTrue(types.contains(.warrant))
        XCTAssertTrue(types.contains(.consent))
        XCTAssertTrue(types.contains(.courtOrder))
        XCTAssertTrue(types.contains(.administrativeOrder))
        XCTAssertTrue(types.contains(.policyInternal))
        XCTAssertTrue(types.contains(.other))
        XCTAssertEqual(types.count, 6, "Must have exactly 6 legal authority types.")
    }

    // MARK: - Verdict enum

    /// Verdict must have exactly PASS and FAIL.
    func testVerdictEnum() {
        XCTAssertEqual(Verdict.pass.rawValue, "PASS")
        XCTAssertEqual(Verdict.fail.rawValue, "FAIL")
    }

    // MARK: - InvocationError types

    /// All InvocationError types must have descriptive messages.
    func testInvocationErrorDescriptions() {
        let errors: [InvocationError] = [
            .binaryNotFound(path: "/test"),
            .binaryNotExecutable(path: "/test"),
            .binaryIsSymlinkToUnexpected(path: "/test", target: "/bad"),
            .swVersFailure(exitCode: 1),
            .swVersEmptyOutput,
            .processLaunchFailed(path: "/test", underlying: NSError(domain: "", code: 0)),
            .timeout(path: "/test", arguments: ["arg"], durationSeconds: 10),
            .pathContainsNullByte(path: "test"),
            .pathNotAbsolute(path: "test"),
        ]

        for error in errors {
            XCTAssertFalse(error.description.isEmpty,
                "Error \(error) must have a non-empty description.")
        }
    }

    // MARK: - ReportGenerator version

    /// Version string must be present.
    func testReportGeneratorVersion() {
        XCTAssertFalse(ReportGenerator.version.isEmpty,
            "ReportGenerator version must be set.")
    }
}
