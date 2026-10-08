// BundleSetupView.swift
// DittoSuite — Forensic Collection Tool
//
// Step 2: Create or reuse a sparsebundle for evidence storage.
// WHY: FR-21 -- sparsebundle creation must be recorded in the audit log
// with the full invocation record. Reuse requires verification.

import SwiftUI

struct BundleSetupView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    // Create new bundle
    @State private var bundleName = ""
    @State private var bundleLocation = NSHomeDirectory() + "/Desktop"
    @State private var filesystem: SparsebundleFilesystem = .apfs
    @State private var maxSizeValue = "100"
    @State private var maxSizeUnit = "GB"
    @State private var useEncryption = false
    @State private var encryptionType: EncryptionType = .aes256

    // Mode
    @State private var mode: BundleMode = .createNew

    // Status
    @State private var isCreating = false
    @State private var errorMessage: String?
    @State private var showError = false

    enum BundleMode: String, CaseIterable {
        case createNew = "Create New"
        case reuseExisting = "Reuse Existing"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Bundle Setup")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Create a new sparsebundle or reuse an existing one. " +
                     "The sparsebundle will contain all collected evidence.")
                    .foregroundColor(.secondary)

                Divider()

                // Mode picker
                Picker("Mode", selection: $mode) {
                    ForEach(BundleMode.allCases, id: \.self) { m in
                        Text(m.rawValue).tag(m)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 300)

                if mode == .createNew {
                    createNewSection
                } else {
                    reuseExistingSection
                }

                // Navigation
                HStack {
                    Button("Back") {
                        coordinator.goBack()
                    }
                    Spacer()
                    Button(mode == .createNew ? "Create Bundle" : "Use Bundle") {
                        if mode == .createNew {
                            createBundle()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isCreating)
                }
            }
            .padding(24)
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(errorMessage ?? "Unknown error")
        }
    }

    // MARK: - Create new section

    private var createNewSection: some View {
        GroupBox("New Sparsebundle") {
            VStack(alignment: .leading, spacing: 12) {
                LabeledField(
                    label: "Bundle Name",
                    text: $bundleName,
                    placeholder: autoSuggestedName
                )
                .onAppear {
                    if bundleName.isEmpty {
                        bundleName = autoSuggestedName
                    }
                }

                // Location picker
                VStack(alignment: .leading, spacing: 4) {
                    Text("Location")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    HStack {
                        Text(bundleLocation)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer()
                        Button("Choose...") {
                            chooseLocation()
                        }
                    }
                }

                // Filesystem
                VStack(alignment: .leading, spacing: 4) {
                    Text("Filesystem")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Picker("", selection: $filesystem) {
                        ForEach(SparsebundleFilesystem.allCases, id: \.self) { fs in
                            Text(fs.rawValue).tag(fs)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: 200)
                }

                // Maximum size
                HStack {
                    LabeledField(label: "Maximum Size", text: $maxSizeValue)
                        .frame(maxWidth: 150)
                    Picker("", selection: $maxSizeUnit) {
                        Text("MB").tag("MB")
                        Text("GB").tag("GB")
                        Text("TB").tag("TB")
                    }
                    .labelsHidden()
                    .frame(maxWidth: 80)
                }

                // Encryption
                Toggle("Encrypt (AES-256)", isOn: $useEncryption)

                if isCreating {
                    ProgressView("Creating sparsebundle...")
                }
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Reuse existing section

    private var reuseExistingSection: some View {
        GroupBox("Reuse Existing Sparsebundle") {
            VStack(alignment: .leading, spacing: 12) {
                Text("Select an existing DittoSuite-created sparsebundle. " +
                     "The bundle must have a valid audit log inside.")
                    .foregroundColor(.secondary)

                Button("Choose Sparsebundle...") {
                    chooseExistingBundle()
                }

                // WHY: FR-28 -- reusing a bundle requires verification.
                // A bundle without a valid audit log cannot be reused.
                Text("Note: Reused bundles must pass verification and contain " +
                     "a valid DittoSuite audit log.")
                    .font(.caption)
                    .foregroundColor(.orange)
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Actions

    private var autoSuggestedName: String {
        let caseID = coordinator.state.caseInfo?.caseID ?? "case"
        let evidenceID = coordinator.state.caseInfo?.evidenceID ?? "evidence"
        return "\(caseID)_\(evidenceID)"
            .replacingOccurrences(of: " ", with: "_")
    }

    private func chooseLocation() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Choose where to create the sparsebundle"

        if panel.runModal() == .OK, let url = panel.url {
            bundleLocation = url.path
        }
    }

    private func chooseExistingBundle() {
        // WHY: FR-28 -- bundle reuse requires full verification (audit log
        // chain integrity, manifest consistency) before any new evidence is
        // added. Until verification is implemented, reuse is blocked.
        errorMessage = "Bundle reuse verification is not yet implemented. " +
            "FR-28 requires verifying audit log chain integrity and manifest " +
            "consistency before reuse. Please create a new bundle."
        showError = true
    }

    private func createBundle() {
        isCreating = true

        let sizeString = maxSizeValue.lowercased() + maxSizeUnit.lowercased().prefix(1)
        let name = bundleName.isEmpty ? autoSuggestedName : bundleName
        let fullPath = (bundleLocation as NSString)
            .appendingPathComponent(name + ".sparsebundle")

        Task {
            do {
                try await coordinator.createBundle(
                    path: fullPath,
                    volumeName: name,
                    filesystem: filesystem,
                    size: sizeString,
                    encryption: useEncryption ? encryptionType : nil
                )
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    showError = true
                    isCreating = false
                }
            }
        }
    }
}
