// CaseInfo.swift
// DittoSuite — Forensic Collection Tool
//
// Case metadata model. All fields required before collection can proceed.
// WHY: Legal defensibility requires documented authority and chain-of-custody
// metadata captured before any evidence-touching operation begins.

import Foundation

// MARK: - Legal authority types

/// The type of legal authority under which the collection is conducted.
/// WHY: The legal basis must be recorded in the audit log before collection
/// and included in the final report. Different authority types may impose
/// different scope limitations.
enum LegalAuthorityType: String, Codable, CaseIterable, Sendable {
    case warrant = "Warrant"
    case consent = "Consent"
    case courtOrder = "Court Order"
    case administrativeOrder = "Administrative Order"
    case policyInternal = "Policy / Internal"
    case other = "Other"
}

// MARK: - CaseInfo

/// All metadata about the case, examiner, and legal authority.
/// Captured in Step 1 (CaseSetupView) before any evidence operations.
struct CaseInfo: Codable, Sendable {
    /// Name of the examiner performing the collection.
    let examinerName: String

    /// Case identifier (agency case number, matter number, etc.).
    let caseID: String

    /// Evidence identifier (unique label for this piece of evidence).
    let evidenceID: String

    /// Description of the device being collected from.
    let deviceDescription: String

    /// Type of legal authority for this collection.
    let legalAuthorityType: LegalAuthorityType

    /// Reference to the specific legal authority (warrant number, consent form ID, etc.).
    let legalAuthorityReference: String

    /// Scope notes describing what is authorized to be collected.
    /// May be empty if scope is documented elsewhere.
    let scopeNotes: String

    /// UTC time source description (auto-filled with NTP status; examiner can add notes).
    let utcTimeSource: String

    /// Timestamp when the case setup was completed (UTC).
    let setupTimestamp: Date

    // MARK: - Validation

    /// Returns nil if valid, or a list of field names that are invalid (empty).
    /// WHY: All required fields must be non-empty before collection. This prevents
    /// generating reports with missing chain-of-custody information.
    func validate() -> [String]? {
        var missing: [String] = []
        if examinerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            missing.append("Examiner Name")
        }
        if caseID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            missing.append("Case ID")
        }
        if evidenceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            missing.append("Evidence ID")
        }
        if deviceDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            missing.append("Device Description")
        }
        if legalAuthorityReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            missing.append("Legal Authority Reference")
        }
        return missing.isEmpty ? nil : missing
    }
}
