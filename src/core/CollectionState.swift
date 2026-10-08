// CollectionState.swift
// DittoSuite — Forensic Collection Tool
//
// State machine for the multi-step collection workflow.
// WHY: The workflow must proceed through a strict sequence of steps.
// Skipping steps (e.g., collecting before preflight, or generating a report
// before verification) could produce legally indefensible results.

import Foundation

// MARK: - Workflow steps

/// Each step in the collection workflow, in the required order.
/// The workflow can only move forward (or be cancelled/failed).
enum WorkflowStep: Int, Codable, Comparable, CaseIterable, Sendable {
    case caseSetup = 0
    case bundleSetup = 1
    case sourceSelection = 2
    case preflight = 3
    case sourceManifest = 4
    case collection = 5
    case verification = 6
    case closeOut = 7
    case results = 8

    static func < (lhs: WorkflowStep, rhs: WorkflowStep) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var displayName: String {
        switch self {
        case .caseSetup: return "Case Setup"
        case .bundleSetup: return "Bundle Setup"
        case .sourceSelection: return "Source Selection"
        case .preflight: return "Pre-flight Checks"
        case .sourceManifest: return "Source Manifest"
        case .collection: return "Collection"
        case .verification: return "Verification"
        case .closeOut: return "Close-out"
        case .results: return "Results & Report"
        }
    }
}

// MARK: - Collection status per source

/// Status of collection for an individual source path.
enum SourceCollectionStatus: String, Codable, Sendable {
    case pending = "PENDING"
    case inProgress = "IN_PROGRESS"
    case complete = "COMPLETE"
    case partial = "PARTIAL"
    case failed = "FAILED"
    case cancelled = "CANCELLED"
    case skipped = "SKIPPED"
}

/// Tracks the collection outcome for a single source.
struct SourceCollectionResult: Codable, Sendable {
    let sourcePath: String
    let status: SourceCollectionStatus
    let invocationRecord: InvocationRecord?
    let perFileErrors: [PerFileError]
    let failureReason: String?
    let filesAttempted: Int
    let startTime: Date?
    let endTime: Date?
}

// MARK: - Overall collection state

/// The overall state of the collection session.
/// WHY: The state machine enforces that all prerequisite steps complete
/// before evidence-touching operations begin.
final class CollectionState: ObservableObject, @unchecked Sendable {
    @Published var currentStep: WorkflowStep = .caseSetup
    @Published var caseInfo: CaseInfo?
    @Published var bundlePath: String?
    @Published var mountPoint: String?
    @Published var selectedSources: [SourceSelection] = []
    @Published var preflightResult: PreflightResult?
    @Published var sourceManifests: [String: Manifest] = [:]    // keyed by source path
    @Published var collectionResults: [SourceCollectionResult] = []
    @Published var verificationReport: VerificationReport?
    @Published var overallStatus: OverallCollectionStatus = .inProgress
    @Published var isCancelled: Bool = false

    /// Attempt to advance to the next step. Returns false if prerequisites not met.
    func advanceTo(_ step: WorkflowStep) -> Bool {
        // WHY: Steps must proceed in order. Jumping ahead could skip
        // critical forensic operations like preflight or source manifesting.
        guard step.rawValue == currentStep.rawValue + 1 || step == currentStep else {
            return false
        }
        currentStep = step
        return true
    }
}

// MARK: - Source selection

/// A user-selected source path with size estimate.
struct SourceSelection: Codable, Identifiable, Sendable {
    let id: UUID
    let path: String
    let estimatedSize: UInt64
    let estimatedFileCount: Int
    let isDirectory: Bool
}

// MARK: - Overall status

enum OverallCollectionStatus: String, Codable, Sendable {
    case inProgress = "IN_PROGRESS"
    case complete = "COMPLETE"
    case partial = "PARTIAL"
    case failed = "FAILED"
    case cancelled = "CANCELLED"
}
