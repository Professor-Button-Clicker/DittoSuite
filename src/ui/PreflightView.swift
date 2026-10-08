// PreflightView.swift
// DittoSuite — Forensic Collection Tool
//
// Step 4: Display preflight check results.
// WHY: FR-22 -- all preflight checks must complete and be displayed
// before evidence operations begin. Blocking checks prevent proceeding.

import SwiftUI

struct PreflightView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    @State private var isRunning = true
    @State private var preflightResult: PreflightResult?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Pre-flight Checks")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Verifying system readiness before collection begins.")
                    .foregroundColor(.secondary)

                Divider()

                if isRunning {
                    ProgressView("Running pre-flight checks...")
                        .padding(20)
                } else if let result = preflightResult {
                    // Overall status
                    GroupBox {
                        HStack {
                            Image(systemName: result.overallReady
                                  ? "checkmark.shield.fill" : "xmark.shield.fill")
                                .font(.title)
                                .foregroundColor(result.overallReady ? .green : .red)

                            VStack(alignment: .leading) {
                                Text(result.overallReady ? "Ready to Proceed" : "Cannot Proceed")
                                    .font(.headline)
                                if !result.overallReady {
                                    Text("One or more blocking checks failed. " +
                                         "Resolve the issues below before continuing.")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    // Individual checks
                    GroupBox("Check Results") {
                        VStack(spacing: 0) {
                            ForEach(Array(result.checks.enumerated()), id: \.offset) { _, check in
                                PreflightCheckRow(check: check)
                                Divider()
                            }
                        }
                    }
                }

                // Navigation
                HStack {
                    Button("Back") {
                        coordinator.goBack()
                    }
                    Spacer()

                    if let result = preflightResult {
                        if result.overallReady {
                            Button("Continue to Collection") {
                                coordinator.completePreflight(result: result)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                        } else {
                            Button("Re-run Checks") {
                                runChecks()
                            }
                            .controlSize(.large)
                        }
                    }
                }
            }
            .padding(24)
        }
        .onAppear {
            runChecks()
        }
    }

    private func runChecks() {
        isRunning = true
        Task {
            let sources = coordinator.state.selectedSources
            let bundlePath = coordinator.state.bundlePath ?? ""
            let mountPoint = coordinator.state.mountPoint
            let totalSize = sources.reduce(UInt64(0)) { $0 + $1.estimatedSize }

            let result = PreflightChecker.runAllChecks(
                sources: sources,
                bundlePath: bundlePath,
                mountPoint: mountPoint,
                estimatedTotalSize: totalSize
            )

            await MainActor.run {
                preflightResult = result
                isRunning = false
            }
        }
    }
}

// MARK: - Check row

struct PreflightCheckRow: View {
    let check: PreflightCheck

    var body: some View {
        HStack(alignment: .top) {
            statusIcon
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(check.name)
                        .fontWeight(.medium)
                    if check.blocking && check.status == .fail {
                        Text("BLOCKING")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.red)
                            .cornerRadius(4)
                    }
                }
                Text(check.detail)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 8)
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch check.status {
        case .pass:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
        case .warn:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
        case .fail:
            Image(systemName: "xmark.circle.fill")
                .foregroundColor(.red)
        }
    }
}
