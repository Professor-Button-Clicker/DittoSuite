// VerificationView.swift
// DittoSuite — Forensic Collection Tool
//
// Step 7: Display post-collection verification results.
// WHY: FR-03, FR-24 -- the examiner must see the verification verdict
// with full per-file detail before the session can be closed out.

import SwiftUI

struct VerificationView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    @State private var isRunning = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Verification Results")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Comparing source manifest against destination manifest " +
                     "for independent verification.")
                    .foregroundColor(.secondary)

                Divider()

                if isRunning {
                    ProgressView("Running verification...")
                        .padding(20)
                } else if let report = coordinator.state.verificationReport {
                    // Overall verdict
                    GroupBox {
                        HStack {
                            Image(systemName: report.overallVerdict == .pass
                                  ? "checkmark.seal.fill" : "xmark.seal.fill")
                                .font(.system(size: 48))
                                .foregroundColor(report.overallVerdict == .pass ? .green : .red)

                            VStack(alignment: .leading) {
                                Text("Overall Verdict: \(report.overallVerdict.rawValue)")
                                    .font(.title2)
                                    .fontWeight(.bold)

                                if report.overallVerdict == .fail {
                                    Text("One or more verification checks failed. " +
                                         "See details below.")
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                        .padding(8)
                    }

                    // Comparison summary
                    GroupBox("Comparison Summary") {
                        VStack(alignment: .leading, spacing: 8) {
                            verdictRow("File Count Match",
                                       passed: report.comparisonResult.totalFileCountMatch)
                            verdictRow("Total Size Match",
                                       passed: report.comparisonResult.totalSizeMatch)
                            verdictRow("Missing in Destination",
                                       passed: report.comparisonResult.missingInDestination.isEmpty,
                                       detail: report.comparisonResult.missingInDestination.isEmpty
                                       ? "None" : "\(report.comparisonResult.missingInDestination.count) files")

                            Divider()

                            HStack {
                                Text("Source Manifest Hash:")
                                    .font(.caption)
                                Spacer()
                                Text(report.comparisonResult.sourceManifestHash)
                                    .font(.caption.monospaced())
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            HStack {
                                Text("Destination Manifest Hash:")
                                    .font(.caption)
                                Spacer()
                                Text(report.comparisonResult.destinationManifestHash)
                                    .font(.caption.monospaced())
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                        }
                        .padding(.vertical, 8)
                    }

                    // Per-file failures (if any)
                    let failures = report.comparisonResult.perFileResults.filter { $0.verdict == .fail }
                    if !failures.isEmpty {
                        GroupBox("Failed Verifications (\(failures.count))") {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(Array(failures.prefix(100).enumerated()), id: \.offset) { _, result in
                                    HStack {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.red)
                                            .font(.caption)
                                        Text(result.relativePath)
                                            .font(.caption)
                                            .lineLimit(1)
                                        Spacer()
                                        if !result.pathPresent {
                                            Text("MISSING")
                                                .font(.caption2)
                                                .foregroundColor(.red)
                                        } else if !result.sha256Match {
                                            Text("HASH MISMATCH")
                                                .font(.caption2)
                                                .foregroundColor(.red)
                                        } else if !result.sizeMatch {
                                            Text("SIZE MISMATCH")
                                                .font(.caption2)
                                                .foregroundColor(.red)
                                        }
                                    }
                                }
                                if failures.count > 100 {
                                    Text("... and \(failures.count - 100) more failures")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }

                    // hdiutil verify status
                    if report.hdiutilVerifySkipped {
                        GroupBox("hdiutil verify") {
                            HStack {
                                Image(systemName: "info.circle.fill")
                                    .foregroundColor(.blue)
                                VStack(alignment: .leading) {
                                    Text("SKIPPED")
                                        .fontWeight(.bold)
                                    Text(report.hdiutilVerifySkipReason ?? "")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }

                    // Source changes during collection
                    if !report.sourceChanges.isEmpty {
                        GroupBox("Source Changes During Collection (\(report.sourceChanges.count))") {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("These source files changed while collection was in progress.")
                                    .font(.caption)
                                    .foregroundColor(.orange)

                                ForEach(Array(report.sourceChanges.enumerated()), id: \.offset) { _, change in
                                    HStack {
                                        Image(systemName: "exclamationmark.triangle.fill")
                                            .foregroundColor(.orange)
                                            .font(.caption)
                                        Text("\(change.relativePath): \(change.field)")
                                            .font(.caption)
                                        Spacer()
                                        Text("\(change.preCollectionValue) -> \(change.currentValue)")
                                            .font(.caption.monospaced())
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }

                    // Metadata differences
                    if !report.comparisonResult.metadataDifferences.isEmpty {
                        GroupBox("Metadata Differences (Informational)") {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("These metadata differences do not affect the verification verdict.")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                ForEach(Array(report.comparisonResult.metadataDifferences.prefix(50).enumerated()),
                                        id: \.offset) { _, diff in
                                    HStack {
                                        Text("\(diff.relativePath) [\(diff.field)]")
                                            .font(.caption)
                                            .lineLimit(1)
                                        Spacer()
                                        Text("\(diff.sourceValue) vs \(diff.destinationValue)")
                                            .font(.caption.monospaced())
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                // Navigation
                HStack {
                    Spacer()
                    Button("Continue to Close-out") {
                        coordinator.completeVerification()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isRunning)
                }
            }
            .padding(24)
        }
        .onAppear {
            startVerification()
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func verdictRow(_ label: String, passed: Bool, detail: String? = nil) -> some View {
        HStack {
            Image(systemName: passed ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(passed ? .green : .red)
            Text(label)
            Spacer()
            if let detail = detail {
                Text(detail)
                    .foregroundColor(.secondary)
            } else {
                Text(passed ? "PASS" : "FAIL")
                    .fontWeight(.bold)
                    .foregroundColor(passed ? .green : .red)
            }
        }
    }

    private func startVerification() {
        isRunning = true
        Task {
            await coordinator.runVerification()
            await MainActor.run {
                isRunning = false
            }
        }
    }
}
