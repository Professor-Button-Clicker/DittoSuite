// DittoSuiteApp.swift
// DittoSuite — Forensic Collection Tool
//
// SwiftUI app entry point.
// WHY: DittoSuite is a native macOS app. No web views, no Electron, no
// cross-platform frameworks. Native ensures consistent behavior on the
// macOS versions we validate against, and avoids third-party dependencies
// in the evidence-touching code path.

import SwiftUI

// MARK: - App entry point

@main
struct DittoSuiteApp: App {
    @StateObject private var coordinator = WorkflowCoordinator()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(coordinator)
                .frame(minWidth: 900, minHeight: 650)
        }
        .windowStyle(.titleBar)
        .commands {
            // WHY: Remove default menu items that could interfere with
            // evidence operations (e.g., no "New Window" to avoid confusion).
            CommandGroup(replacing: .newItem) {}
        }
    }
}

// MARK: - Main content view

/// Routes to the appropriate view based on the current workflow step.
struct ContentView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    var body: some View {
        NavigationSplitView {
            // Sidebar: workflow steps
            WorkflowSidebar()
        } detail: {
            // Detail: current step view
            currentStepView
        }
    }

    @ViewBuilder
    private var currentStepView: some View {
        switch coordinator.state.currentStep {
        case .caseSetup:
            CaseSetupView()
        case .bundleSetup:
            BundleSetupView()
        case .sourceSelection:
            SourceSelectionView()
        case .preflight:
            PreflightView()
        case .sourceManifest:
            CollectionProgressView(phase: .sourceManifest)
        case .collection:
            CollectionProgressView(phase: .collection)
        case .verification:
            VerificationView()
        case .closeOut:
            CollectionProgressView(phase: .closeOut)
        case .results:
            ResultsView()
        }
    }
}

// MARK: - Workflow sidebar

/// Shows the workflow steps with completion status.
struct WorkflowSidebar: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    var body: some View {
        List {
            ForEach(WorkflowStep.allCases, id: \.rawValue) { step in
                HStack {
                    statusIcon(for: step)
                    Text(step.displayName)
                        .fontWeight(step == coordinator.state.currentStep ? .bold : .regular)
                }
                .foregroundColor(foregroundColor(for: step))
                .listRowBackground(
                    step == coordinator.state.currentStep
                    ? Color.accentColor.opacity(0.1) : Color.clear
                )
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("DittoSuite")
    }

    @ViewBuilder
    private func statusIcon(for step: WorkflowStep) -> some View {
        if step < coordinator.state.currentStep {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
        } else if step == coordinator.state.currentStep {
            Image(systemName: "circle.fill")
                .foregroundColor(.accentColor)
        } else {
            Image(systemName: "circle")
                .foregroundColor(.secondary)
        }
    }

    private func foregroundColor(for step: WorkflowStep) -> Color {
        if step == coordinator.state.currentStep {
            return .primary
        } else if step < coordinator.state.currentStep {
            return .secondary
        } else {
            return .secondary.opacity(0.6)
        }
    }
}
