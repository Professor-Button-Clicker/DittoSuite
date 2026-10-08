// CollectionProgressView.swift
// DittoSuite — Forensic Collection Tool
//
// Steps 5, 6, 8: Source manifest building, collection progress, and close-out.
// WHY: Live progress feedback is critical for examiner confidence. The cancel
// button allows aborting mid-collection without losing what was already copied.

import SwiftUI

/// The phase of collection-related progress being shown.
enum CollectionPhase {
    case sourceManifest
    case collection
    case closeOut
}

struct CollectionProgressView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    let phase: CollectionPhase

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(phaseTitle)
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text(phaseDescription)
                    .foregroundColor(.secondary)

                Divider()

                // Progress section
                GroupBox(phaseProgressLabel) {
                    VStack(alignment: .leading, spacing: 12) {
                        // Overall progress
                        if coordinator.totalProgress > 0 {
                            ProgressView(value: coordinator.currentProgress,
                                         total: coordinator.totalProgress)
                        } else {
                            ProgressView()
                                .progressViewStyle(.linear)
                        }

                        // Current operation
                        if let currentOp = coordinator.currentOperation {
                            Text(currentOp)
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .lineLimit(2)
                        }

                        // Statistics
                        HStack(spacing: 24) {
                            VStack(alignment: .leading) {
                                Text("Files Processed")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                Text("\(coordinator.filesProcessed)")
                                    .font(.title3)
                                    .fontWeight(.medium)
                            }

                            VStack(alignment: .leading) {
                                Text("Elapsed Time")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                Text(coordinator.elapsedTimeString)
                                    .font(.title3)
                                    .fontWeight(.medium)
                            }

                            if phase == .collection {
                                VStack(alignment: .leading) {
                                    Text("Current Source")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    Text("\(coordinator.currentSourceIndex + 1) of \(coordinator.state.selectedSources.count)")
                                        .font(.title3)
                                        .fontWeight(.medium)
                                }
                            }
                        }
                        .padding(.top, 4)
                    }
                    .padding(.vertical, 8)
                }

                // Errors encountered (live)
                if !coordinator.liveErrors.isEmpty {
                    GroupBox("Errors Encountered") {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(coordinator.liveErrors.enumerated()), id: \.offset) { _, error in
                                HStack(alignment: .top) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundColor(.orange)
                                        .font(.caption)
                                    Text(error)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                // Controls
                HStack {
                    if phase == .collection {
                        // WHY: FR-30 -- cancel produces a labeled partial result.
                        // The cancel button kills the current ditto process,
                        // marks the collection as CANCELLED, and proceeds to
                        // verification of what was already collected.
                        Button("Cancel Collection") {
                            coordinator.cancelCollection()
                        }
                        .foregroundColor(.red)
                    }

                    Spacer()

                    if coordinator.phaseComplete {
                        Button("Continue") {
                            coordinator.advanceFromPhase(phase)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }
                }
            }
            .padding(24)
        }
        .onAppear {
            startPhase()
        }
    }

    // MARK: - Phase-specific labels

    private var phaseTitle: String {
        switch phase {
        case .sourceManifest: return "Building Source Manifest"
        case .collection: return "Collection in Progress"
        case .closeOut: return "Close-out"
        }
    }

    private var phaseDescription: String {
        switch phase {
        case .sourceManifest:
            return "Walking selected sources and computing SHA-256 hashes for every file. " +
                   "This establishes the ground truth for verification."
        case .collection:
            return "Copying selected files to the sparsebundle using ditto. " +
                   "Each file is copied with full metadata preservation."
        case .closeOut:
            return "Checking final band count, detaching the sparsebundle, and " +
                   "recording the final audit log entries."
        }
    }

    private var phaseProgressLabel: String {
        switch phase {
        case .sourceManifest: return "Manifest Progress"
        case .collection: return "Collection Progress"
        case .closeOut: return "Close-out Progress"
        }
    }

    private func startPhase() {
        switch phase {
        case .sourceManifest:
            coordinator.startSourceManifest()
        case .collection:
            coordinator.startCollection()
        case .closeOut:
            coordinator.startCloseOut()
        }
    }
}
