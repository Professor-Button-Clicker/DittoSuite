// CaseSetupView.swift
// DittoSuite — Forensic Collection Tool
//
// Step 1: Case metadata entry. All required fields must be completed
// before collection can proceed.
// WHY: FR-14 -- legal authority must be recorded before any evidence
// operations begin. Missing metadata makes the collection legally vulnerable.

import SwiftUI

struct CaseSetupView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    @State private var examinerName = ""
    @State private var caseID = ""
    @State private var evidenceID = ""
    @State private var deviceDescription = ""
    @State private var legalAuthorityType: LegalAuthorityType = .warrant
    @State private var legalAuthorityReference = ""
    @State private var scopeNotes = ""
    @State private var utcTimeSource = "System clock (NTP synchronized)"
    @State private var validationErrors: [String] = []
    @State private var showValidationAlert = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                Text("Case Setup")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Complete all required fields before proceeding. " +
                     "This information will be recorded in the audit log " +
                     "and included in the collection report.")
                    .foregroundColor(.secondary)

                Divider()

                // Examiner information
                GroupBox("Examiner Information") {
                    VStack(alignment: .leading, spacing: 12) {
                        LabeledField(label: "Examiner Name *", text: $examinerName)
                    }
                    .padding(.vertical, 8)
                }

                // Case information
                GroupBox("Case Information") {
                    VStack(alignment: .leading, spacing: 12) {
                        LabeledField(label: "Case ID *", text: $caseID)
                        LabeledField(label: "Evidence ID *", text: $evidenceID)
                        LabeledField(label: "Device Description *", text: $deviceDescription)
                    }
                    .padding(.vertical, 8)
                }

                // Legal authority
                GroupBox("Legal Authority") {
                    VStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Authority Type *")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Picker("", selection: $legalAuthorityType) {
                                ForEach(LegalAuthorityType.allCases, id: \.self) { type in
                                    Text(type.rawValue).tag(type)
                                }
                            }
                            .labelsHidden()
                        }

                        LabeledField(
                            label: "Authority Reference *",
                            text: $legalAuthorityReference,
                            placeholder: "Warrant number, consent form ID, etc."
                        )

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Scope Notes")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            TextEditor(text: $scopeNotes)
                                .frame(height: 80)
                                .border(Color.secondary.opacity(0.3))
                        }
                    }
                    .padding(.vertical, 8)
                }

                // Time source
                GroupBox("Time Source") {
                    VStack(alignment: .leading, spacing: 12) {
                        LabeledField(
                            label: "UTC Time Source",
                            text: $utcTimeSource,
                            placeholder: "System clock (NTP synchronized)"
                        )
                        Text("Auto-filled with system NTP status. Add notes if needed.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 8)
                }

                // Proceed button
                HStack {
                    Spacer()
                    Button("Continue to Bundle Setup") {
                        proceedToNextStep()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
            }
            .padding(24)
        }
        .alert("Missing Required Fields", isPresented: $showValidationAlert) {
            Button("OK") {}
        } message: {
            Text("Please complete: \(validationErrors.joined(separator: ", "))")
        }
    }

    private func proceedToNextStep() {
        let caseInfo = CaseInfo(
            examinerName: examinerName,
            caseID: caseID,
            evidenceID: evidenceID,
            deviceDescription: deviceDescription,
            legalAuthorityType: legalAuthorityType,
            legalAuthorityReference: legalAuthorityReference,
            scopeNotes: scopeNotes,
            utcTimeSource: utcTimeSource,
            setupTimestamp: Date()
        )

        if let errors = caseInfo.validate() {
            validationErrors = errors
            showValidationAlert = true
            return
        }

        coordinator.completeCaseSetup(caseInfo: caseInfo)
    }
}

// MARK: - Labeled text field helper

struct LabeledField: View {
    let label: String
    @Binding var text: String
    var placeholder: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            TextField(placeholder, text: $text)
                .textFieldStyle(.roundedBorder)
        }
    }
}
