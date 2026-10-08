// ResultsView.swift
// DittoSuite — Forensic Collection Tool
//
// Step 9: Final results display and report export.
// WHY: FR-23 -- the report must clearly state what was and was not collected,
// with reasons for any failures or skips.

import SwiftUI

struct ResultsView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    @State private var exportMessage: String?
    @State private var showExportMessage = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Collection Results")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Review the collection results and export reports.")
                    .foregroundColor(.secondary)

                Divider()

                // Overall status
                GroupBox {
                    HStack {
                        statusIcon
                        VStack(alignment: .leading) {
                            Text("Collection Status: \(coordinator.state.overallStatus.rawValue)")
                                .font(.title2)
                                .fontWeight(.bold)
                            if let report = coordinator.state.verificationReport {
                                Text("Verification: \(report.overallVerdict.rawValue)")
                                    .foregroundColor(report.overallVerdict == .pass ? .green : .red)
                            }
                        }
                    }
                    .padding(8)
                }

                // What WAS collected
                GroupBox("What Was Collected") {
                    VStack(alignment: .leading, spacing: 8) {
                        let complete = coordinator.state.collectionResults.filter {
                            $0.status == .complete
                        }
                        if complete.isEmpty {
                            Text("No sources were completely collected.")
                                .foregroundColor(.secondary)
                        } else {
                            ForEach(Array(complete.enumerated()), id: \.offset) { _, result in
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.green)
                                    Text(result.sourcePath)
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                    Spacer()
                                    Text("\(result.filesAttempted) files")
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                // What was NOT collected (FR-23)
                GroupBox("What Was Not Collected") {
                    VStack(alignment: .leading, spacing: 8) {
                        let incomplete = coordinator.state.collectionResults.filter {
                            $0.status != .complete
                        }
                        if incomplete.isEmpty {
                            Text("All selected sources were completely collected.")
                                .foregroundColor(.green)
                        } else {
                            ForEach(Array(incomplete.enumerated()), id: \.offset) { _, result in
                                HStack(alignment: .top) {
                                    Image(systemName: statusIconName(for: result.status))
                                        .foregroundColor(statusColor(for: result.status))
                                    VStack(alignment: .leading) {
                                        Text(result.sourcePath)
                                            .lineLimit(1)
                                            .truncationMode(.middle)
                                        Text("Status: \(result.status.rawValue)")
                                            .font(.caption)
                                        if let reason = result.failureReason {
                                            Text("Reason: \(reason)")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                        if !result.perFileErrors.isEmpty {
                                            Text("\(result.perFileErrors.count) per-file error(s)")
                                                .font(.caption)
                                                .foregroundColor(.orange)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                // Per-file errors summary
                let allErrors = coordinator.state.collectionResults.flatMap { $0.perFileErrors }
                if !allErrors.isEmpty {
                    GroupBox("Per-file Errors (\(allErrors.count))") {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(allErrors.prefix(50).enumerated()), id: \.offset) { _, error in
                                HStack(alignment: .top) {
                                    Text(error.errorType.rawValue)
                                        .font(.caption2)
                                        .foregroundColor(.white)
                                        .padding(.horizontal, 4)
                                        .padding(.vertical, 1)
                                        .background(errorTypeColor(error.errorType))
                                        .cornerRadius(3)
                                    Text(error.path)
                                        .font(.caption)
                                        .lineLimit(1)
                                }
                            }
                            if allErrors.count > 50 {
                                Text("... and \(allErrors.count - 50) more errors")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Divider()

                // Export buttons
                GroupBox("Export Reports") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Export the collection report and audit log for your records.")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        HStack(spacing: 12) {
                            Button("Export Text Report") {
                                exportTextReport()
                            }
                            .buttonStyle(.borderedProminent)

                            Button("Export JSON Report") {
                                exportJSON()
                            }
                            .buttonStyle(.bordered)

                            Button("Export Audit Log") {
                                exportAuditLog()
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
            .padding(24)
        }
        .alert("Export", isPresented: $showExportMessage) {
            Button("OK") {}
        } message: {
            Text(exportMessage ?? "")
        }
    }

    // MARK: - Export actions

    private func exportTextReport() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = "DittoSuite_Report.txt"

        if panel.runModal() == .OK, let url = panel.url {
            Task {
                do {
                    let hash = try await coordinator.exportTextReport(to: url.path)
                    await MainActor.run {
                        exportMessage = "Text report exported.\nSHA-256: \(hash)"
                        showExportMessage = true
                    }
                } catch {
                    await MainActor.run {
                        exportMessage = "Export failed: \(error.localizedDescription)"
                        showExportMessage = true
                    }
                }
            }
        }
    }

    private func exportJSON() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "DittoSuite_Report.json"

        if panel.runModal() == .OK, let url = panel.url {
            Task {
                do {
                    let hash = try await coordinator.exportJSONReport(to: url.path)
                    await MainActor.run {
                        exportMessage = "JSON report exported.\nSHA-256: \(hash)"
                        showExportMessage = true
                    }
                } catch {
                    await MainActor.run {
                        exportMessage = "Export failed: \(error.localizedDescription)"
                        showExportMessage = true
                    }
                }
            }
        }
    }

    private func exportAuditLog() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "DittoSuite_AuditLog.jsonl"

        if panel.runModal() == .OK, let url = panel.url {
            Task {
                do {
                    try await coordinator.exportAuditLog(to: url.path)
                    await MainActor.run {
                        exportMessage = "Audit log exported to \(url.path)"
                        showExportMessage = true
                    }
                } catch {
                    await MainActor.run {
                        exportMessage = "Export failed: \(error.localizedDescription)"
                        showExportMessage = true
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private var statusIcon: some View {
        switch coordinator.state.overallStatus {
        case .complete:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.green)
        case .partial:
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundColor(.orange)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.red)
        case .cancelled:
            Image(systemName: "stop.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.orange)
        case .inProgress:
            Image(systemName: "circle.fill")
                .font(.system(size: 48))
                .foregroundColor(.blue)
        }
    }

    private func statusIconName(for status: SourceCollectionStatus) -> String {
        switch status {
        case .complete: return "checkmark.circle.fill"
        case .partial: return "exclamationmark.triangle.fill"
        case .failed: return "xmark.circle.fill"
        case .cancelled: return "stop.circle.fill"
        case .skipped: return "minus.circle.fill"
        case .pending, .inProgress: return "circle.fill"
        }
    }

    private func statusColor(for status: SourceCollectionStatus) -> Color {
        switch status {
        case .complete: return .green
        case .partial: return .orange
        case .failed: return .red
        case .cancelled: return .orange
        case .skipped: return .secondary
        case .pending, .inProgress: return .blue
        }
    }

    private func errorTypeColor(_ type: PerFileErrorType) -> Color {
        switch type {
        case .operationNotPermitted: return .red
        case .permissionDenied: return .orange
        case .noSuchFileOrDirectory: return .purple
        case .other: return .secondary
        }
    }
}
