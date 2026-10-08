// WorkflowCoordinator.swift
// DittoSuite — Forensic Collection Tool
//
// Orchestrates the multi-step collection workflow.
// WHY: The coordinator is the single point of control for all workflow
// transitions. UI views call coordinator methods; the coordinator calls
// adapters and core services. Views never directly invoke subprocess
// commands or touch evidence.

import SwiftUI
import Foundation

// MARK: - WorkflowCoordinator

@MainActor
final class WorkflowCoordinator: ObservableObject {
    // MARK: - Published state

    @Published var state = CollectionState()
    @Published var currentOperation: String?
    @Published var currentProgress: Double = 0
    @Published var totalProgress: Double = 0
    @Published var filesProcessed: Int = 0
    @Published var currentSourceIndex: Int = 0
    @Published var liveErrors: [String] = []
    @Published var phaseComplete: Bool = false
    @Published var elapsedTimeString: String = "0:00"
    @Published var auditLogFailure: Bool = false

    // MARK: - Internal state

    private var auditLog: AuditLog?
    private let dittoAdapter = DittoAdapter()
    private let hdiutilAdapter = HdiutilAdapter()
    private var startTime: Date?
    private var elapsedTimer: Timer?

    // MARK: - Safe audit logging helpers

    // WHY: Every audit log write must be checked. A silent failure (try?)
    // could produce a session with an incomplete or empty audit log,
    // violating FR-04 and the chain-of-custody requirement (FR-05).
    // These helpers set a persistent flag so the report and UI reflect it.

    private func safeLog(eventType: AuditEventType, details: [String: String]) {
        guard let log = auditLog else { return }
        do {
            try log.log(eventType: eventType, details: details)
        } catch {
            auditLogFailure = true
            liveErrors.append("AUDIT LOG FAILURE [\(eventType.rawValue)]: \(error)")
        }
    }

    private func safeLogError(path: String?, reason: String, context: String) {
        guard let log = auditLog else { return }
        do {
            try log.logError(path: path, reason: reason, context: context)
        } catch {
            auditLogFailure = true
            liveErrors.append("AUDIT LOG FAILURE [error/\(context)]: \(error)")
        }
    }

    private func safeLogWarning(message: String, context: String) {
        guard let log = auditLog else { return }
        do {
            try log.logWarning(message: message, context: context)
        } catch {
            auditLogFailure = true
            liveErrors.append("AUDIT LOG FAILURE [warning/\(context)]: \(error)")
        }
    }

    // MARK: - Session start

    func startSession() {
        do {
            try dittoAdapter.initialize()
            try hdiutilAdapter.initialize()
        } catch {
            liveErrors.append("Initialization failed: \(error)")
        }
    }

    // MARK: - Step 1: Case Setup

    func completeCaseSetup(caseInfo: CaseInfo) {
        state.caseInfo = caseInfo
        _ = state.advanceTo(.bundleSetup)

        Task {
            safeLog(eventType: .caseSetup, details: [
                "examinerName": caseInfo.examinerName,
                "caseID": caseInfo.caseID,
                "evidenceID": caseInfo.evidenceID,
                "deviceDescription": caseInfo.deviceDescription,
                "legalAuthorityType": caseInfo.legalAuthorityType.rawValue,
                "legalAuthorityReference": caseInfo.legalAuthorityReference,
                "scopeNotes": caseInfo.scopeNotes,
                "utcTimeSource": caseInfo.utcTimeSource,
            ])
        }
    }

    // MARK: - Step 2: Bundle Setup

    func createBundle(
        path: String,
        volumeName: String,
        filesystem: SparsebundleFilesystem,
        size: String,
        encryption: EncryptionType?
    ) async throws {
        let (record, result) = try await hdiutilAdapter.createSparsebundle(
            path: path,
            volumeName: volumeName,
            filesystem: filesystem,
            size: size,
            bandSize: nil,
            encryption: encryption,
            timeout: HdiutilAdapter.createTimeout
        )

        state.bundlePath = result.imagePath

        // WHY: The audit log is stored inside the sparsebundle alongside
        // the collected evidence, creating a self-contained evidence package.
        let logPath = (result.imagePath as NSString)
            .appendingPathComponent("DittoSuite_AuditLog.jsonl")

        let (attachRecord, attachResult) = try await hdiutilAdapter.attach(
            path: result.imagePath,
            mountPoint: nil,
            readOnly: false,
            noBrowse: true,
            timeout: HdiutilAdapter.attachTimeout
        )

        state.mountPoint = attachResult.mountPoint

        let auditLogPath = (attachResult.mountPoint as NSString)
            .appendingPathComponent("DittoSuite_AuditLog.jsonl")
        let log = try AuditLog(path: auditLogPath)
        self.auditLog = log

        try log.log(eventType: .sessionStart, details: [
            "dittoSuiteVersion": ReportGenerator.version,
            "hostname": ProcessInfo.processInfo.hostName,
        ])

        if let caseInfo = state.caseInfo {
            try log.log(eventType: .caseSetup, details: [
                "examinerName": caseInfo.examinerName,
                "caseID": caseInfo.caseID,
                "evidenceID": caseInfo.evidenceID,
            ])
        }

        try log.log(eventType: .bundleCreated, details: [
            "bundlePath": result.imagePath,
            "volumeName": volumeName,
            "filesystem": filesystem.rawValue,
            "size": size,
            "encrypted": encryption != nil ? "true" : "false",
            "hdiutilExitCode": String(record.exitCode),
            "invocationID": record.id.uuidString,
            "attachInvocationID": attachRecord.id.uuidString,
            "mountPoint": attachResult.mountPoint,
        ])

        await MainActor.run {
            _ = state.advanceTo(.sourceSelection)
        }
    }

    // MARK: - Step 3: Source Selection

    func completeSourceSelection(sources: [SourceSelection]) {
        state.selectedSources = sources

        for source in sources {
            safeLog(eventType: .sourceSelected, details: [
                "path": source.path,
                "isDirectory": String(source.isDirectory),
                "estimatedSize": String(source.estimatedSize),
                "estimatedFileCount": String(source.estimatedFileCount),
            ])
        }

        _ = state.advanceTo(.preflight)
    }

    // MARK: - Step 4: Preflight

    func completePreflight(result: PreflightResult) {
        state.preflightResult = result

        var details: [String: String] = [
            "overallReady": String(result.overallReady),
            "checkCount": String(result.checks.count),
        ]
        let failCount = result.checks.filter { $0.status == .fail }.count
        let warnCount = result.checks.filter { $0.status == .warn }.count
        details["failCount"] = String(failCount)
        details["warnCount"] = String(warnCount)
        safeLog(eventType: .preflightCompleted, details: details)

        _ = state.advanceTo(.sourceManifest)
    }

    // MARK: - Step 5: Source Manifest

    func startSourceManifest() {
        guard !phaseComplete else { return }

        startTime = Date()
        startElapsedTimer()
        filesProcessed = 0
        currentProgress = 0
        totalProgress = Double(state.selectedSources.count)

        Task {
            for (index, source) in state.selectedSources.enumerated() {
                await MainActor.run {
                    currentSourceIndex = index
                    currentOperation = "Building manifest for: \(source.path)"
                }

                do {
                    let manifest = try ManifestBuilder.buildManifest(
                        rootPath: source.path,
                        progress: { path, count, _ in
                            Task { @MainActor in
                                self.currentOperation = "Hashing: \(path)"
                                self.filesProcessed = count
                            }
                        }
                    )

                    await MainActor.run {
                        state.sourceManifests[source.path] = manifest
                        currentProgress = Double(index + 1)
                    }

                    safeLog(eventType: .sourceManifestBuilt, details: [
                        "sourcePath": source.path,
                        "totalFiles": String(manifest.totalFiles),
                        "totalSize": String(manifest.totalSize),
                        "manifestSHA256": manifest.manifestSHA256,
                        "errorCount": String(manifest.errors.count),
                    ])

                    if !manifest.errors.isEmpty {
                        for error in manifest.errors {
                            await MainActor.run {
                                liveErrors.append("\(error.path): \(error.reason)")
                            }
                        }
                    }
                } catch {
                    await MainActor.run {
                        liveErrors.append("Manifest build failed for \(source.path): \(error)")
                    }
                    safeLogError(
                        path: source.path,
                        reason: error.localizedDescription,
                        context: "sourceManifestBuild"
                    )
                }
            }

            await MainActor.run {
                phaseComplete = true
                stopElapsedTimer()
            }
        }
    }

    // MARK: - Step 6: Collection

    func startCollection() {
        guard !phaseComplete else { return }

        startTime = Date()
        startElapsedTimer()
        filesProcessed = 0
        currentProgress = 0
        totalProgress = Double(state.selectedSources.count)
        state.collectionResults = []

        safeLog(eventType: .collectionStarted, details: [
            "sourceCount": String(state.selectedSources.count),
        ])

        Task {
            guard let mountPoint = state.mountPoint else {
                await MainActor.run {
                    liveErrors.append("No mount point available. Bundle may not be attached.")
                    phaseComplete = true
                }
                return
            }

            for (index, source) in state.selectedSources.enumerated() {
                if state.isCancelled {
                    let result = SourceCollectionResult(
                        sourcePath: source.path,
                        status: .cancelled,
                        invocationRecord: nil,
                        perFileErrors: [],
                        failureReason: "Collection cancelled by examiner",
                        filesAttempted: 0,
                        startTime: nil,
                        endTime: nil
                    )
                    await MainActor.run {
                        state.collectionResults.append(result)
                    }
                    continue
                }

                await MainActor.run {
                    currentSourceIndex = index
                    currentOperation = "Copying: \(source.path)"
                }

                let sourceName = (source.path as NSString).lastPathComponent
                let destPath = (mountPoint as NSString).appendingPathComponent(sourceName)

                let collectStart = Date()

                do {
                    // WHY: Sequential execution per source. ditto runs one at a time
                    // to avoid resource contention and ensure clean error tracking.
                    let (record, perFileErrors) = try await dittoAdapter.copy(
                        source: source.path,
                        destination: destPath,
                        options: .default,
                        timeout: DittoAdapter.defaultTimeout
                    )

                    safeLog(eventType: .dittoInvocation, details: [
                        "sourcePath": source.path,
                        "destinationPath": destPath,
                        "exitCode": String(record.exitCode),
                        "duration": String(format: "%.1f", record.durationSeconds),
                        "timedOut": String(record.timedOut),
                        "invocationID": record.id.uuidString,
                        "stdoutSHA256": record.rawStdoutSHA256,
                        "stderrSHA256": record.rawStderrSHA256,
                        "perFileErrorCount": String(perFileErrors.count),
                    ])

                    let status: SourceCollectionStatus
                    let failureReason: String?

                    if record.timedOut {
                        status = .failed
                        failureReason = "Timed out after \(record.durationSeconds)s"
                    } else if record.wasCancelled {
                        status = .cancelled
                        failureReason = "Cancelled by examiner"
                    } else if record.exitCode != 0 && perFileErrors.isEmpty {
                        status = .failed
                        failureReason = "ditto exited with code \(record.exitCode)"
                    } else if record.exitCode != 0 {
                        // WHY: FR-13 -- partial results are explicitly labeled.
                        status = .partial
                        failureReason = "\(perFileErrors.count) file(s) could not be copied"
                    } else {
                        status = .complete
                        failureReason = nil
                    }

                    for error in perFileErrors {
                        await MainActor.run {
                            liveErrors.append("\(error.errorType.rawValue): \(error.path)")
                        }
                    }

                    let result = SourceCollectionResult(
                        sourcePath: source.path,
                        status: status,
                        invocationRecord: record,
                        perFileErrors: perFileErrors,
                        failureReason: failureReason,
                        filesAttempted: source.estimatedFileCount,
                        startTime: collectStart,
                        endTime: Date()
                    )

                    await MainActor.run {
                        state.collectionResults.append(result)
                        currentProgress = Double(index + 1)
                    }
                } catch {
                    let result = SourceCollectionResult(
                        sourcePath: source.path,
                        status: .failed,
                        invocationRecord: nil,
                        perFileErrors: [],
                        failureReason: error.localizedDescription,
                        filesAttempted: 0,
                        startTime: collectStart,
                        endTime: Date()
                    )

                    await MainActor.run {
                        state.collectionResults.append(result)
                        currentProgress = Double(index + 1)
                        liveErrors.append("Collection failed for \(source.path): \(error)")
                    }

                    safeLogError(
                        path: source.path,
                        reason: error.localizedDescription,
                        context: "dittoCollection"
                    )
                }
            }

            safeLog(eventType: .collectionCompleted, details: [
                "sourcesComplete": String(state.collectionResults.filter { $0.status == .complete }.count),
                "sourcesPartial": String(state.collectionResults.filter { $0.status == .partial }.count),
                "sourcesFailed": String(state.collectionResults.filter { $0.status == .failed }.count),
                "sourcesCancelled": String(state.collectionResults.filter { $0.status == .cancelled }.count),
            ])

            await MainActor.run {
                phaseComplete = true
                stopElapsedTimer()
            }
        }
    }

    func cancelCollection() {
        state.isCancelled = true
        // WHY: FR-30 -- cancellation is recorded. Verification still runs
        // on what was copied. The report clearly states CANCELLED.
        safeLog(eventType: .collectionCancelled, details: [
            "cancelledByExaminer": "true",
            "sourcesCompleted": String(state.collectionResults.count),
        ])
    }

    // MARK: - Step 7: Verification

    func runVerification() async {
        guard let mountPoint = state.mountPoint,
              let log = auditLog else {
            return
        }

        do {
            let report = try await VerificationEngine.verify(
                sourceManifests: state.sourceManifests,
                destinationRoot: mountPoint,
                auditLog: log,
                progress: { path, count, _ in
                    Task { @MainActor in
                        self.currentOperation = "Verifying: \(path)"
                        self.filesProcessed = count
                    }
                }
            )

            await MainActor.run {
                state.verificationReport = report

                if state.isCancelled {
                    state.overallStatus = .cancelled
                } else if state.collectionResults.allSatisfy({ $0.status == .complete }) &&
                          report.overallVerdict == .pass {
                    state.overallStatus = .complete
                } else if state.collectionResults.contains(where: { $0.status == .failed }) {
                    state.overallStatus = .failed
                } else {
                    state.overallStatus = .partial
                }
            }
        } catch {
            await MainActor.run {
                liveErrors.append("Verification failed: \(error)")
                state.overallStatus = .failed
            }
            safeLogError(
                path: mountPoint,
                reason: error.localizedDescription,
                context: "verification"
            )
        }
    }

    func completeVerification() {
        _ = state.advanceTo(.closeOut)
        phaseComplete = false
    }

    // MARK: - Step 8: Close-out

    func startCloseOut() {
        guard !phaseComplete else { return }

        startTime = Date()
        startElapsedTimer()
        currentOperation = "Running close-out checks..."

        Task {
            guard let bundlePath = state.bundlePath,
                  let mountPoint = state.mountPoint else {
                await MainActor.run {
                    phaseComplete = true
                    stopElapsedTimer()
                }
                return
            }

            // WHY: Post-collection band count check. Exceeding ~100,000 bands
            // can cause directory structure failures.
            await MainActor.run {
                currentOperation = "Checking band count..."
            }

            let bandsPath = (bundlePath as NSString).appendingPathComponent("bands")
            let fm = FileManager.default
            if fm.fileExists(atPath: bandsPath) {
                if let bands = try? fm.contentsOfDirectory(atPath: bandsPath) {
                    let count = bands.count
                    if count >= PreflightChecker.bandCountWarningThreshold {
                        await MainActor.run {
                            liveErrors.append("Band count (\(count)) approaching threshold " +
                                              "(\(PreflightChecker.bandCountFailureThreshold)).")
                        }
                        // WHY: N-7 fix -- only emit .warning when threshold
                        // is actually exceeded, not for normal band counts.
                        safeLogWarning(
                            message: "Band count \(count) approaching threshold",
                            context: "closeOut"
                        )
                    }
                }
            }

            // Detach the sparsebundle
            // WHY: Clean detach is critical. Mid-write disconnection can corrupt
            // the bundle or flip it to read-only permanently.
            await MainActor.run {
                currentOperation = "Detaching sparsebundle..."
            }

            do {
                let detachRecord = try await hdiutilAdapter.detach(
                    mountPointOrDevice: mountPoint,
                    force: false,
                    timeout: HdiutilAdapter.detachTimeout
                )

                safeLog(eventType: .bundleDetached, details: [
                    "mountPoint": mountPoint,
                    "exitCode": String(detachRecord.exitCode),
                    "invocationID": detachRecord.id.uuidString,
                    "cleanDetach": "true",
                ])
            } catch {
                // WHY: Detach failure is CRITICAL. Log it prominently.
                await MainActor.run {
                    liveErrors.append("CRITICAL: Detach failed: \(error). " +
                                      "Bundle may be corrupted.")
                }
                safeLogError(
                    path: mountPoint,
                    reason: "Detach failed: \(error)",
                    context: "CRITICAL_detachFailure"
                )
            }

            safeLog(eventType: .sessionEnd, details: [
                "overallStatus": state.overallStatus.rawValue,
                "auditLogFailure": String(auditLogFailure),
            ])

            await MainActor.run {
                currentOperation = "Close-out complete."
                phaseComplete = true
                stopElapsedTimer()
                state.mountPoint = nil
            }
        }
    }

    // MARK: - Step 9: Report export

    func exportTextReport(to path: String) async throws -> String {
        let data = try buildReportData()
        let hash = try ReportGenerator.generateTextReport(data: data, outputPath: path)

        safeLog(eventType: .reportGenerated, details: [
            "format": "text",
            "path": path,
            "reportSHA256": hash,
        ])

        return hash
    }

    func exportJSONReport(to path: String) async throws -> String {
        let data = try buildReportData()
        let hash = try ReportGenerator.generateJSON(data: data, outputPath: path)

        safeLog(eventType: .reportGenerated, details: [
            "format": "JSON",
            "path": path,
            "reportSHA256": hash,
        ])

        return hash
    }

    func exportAuditLog(to path: String) async throws {
        guard let log = auditLog else {
            throw CoordinatorError.noAuditLog
        }

        let fm = FileManager.default
        try fm.copyItem(atPath: log.filePath, toPath: path)
    }

    // MARK: - Navigation

    func goBack() {
        let current = state.currentStep
        // WHY: Backward navigation is only allowed before evidence-touching
        // steps. After sourceManifest begins, going back would violate the
        // sequential workflow guarantee and is not auditable.
        let allowedBackSteps: Set<WorkflowStep> = [
            .bundleSetup, .sourceSelection, .preflight
        ]
        guard allowedBackSteps.contains(current) else {
            return
        }
        if current.rawValue > 0,
           let prev = WorkflowStep(rawValue: current.rawValue - 1) {
            state.currentStep = prev
            phaseComplete = false
        }
    }

    func advanceFromPhase(_ phase: CollectionPhase) {
        phaseComplete = false
        liveErrors = []

        switch phase {
        case .sourceManifest:
            _ = state.advanceTo(.collection)
        case .collection:
            _ = state.advanceTo(.verification)
        case .closeOut:
            _ = state.advanceTo(.results)
        }
    }

    // MARK: - Report data building

    private func buildReportData() throws -> ReportData {
        guard let caseInfo = state.caseInfo else {
            throw CoordinatorError.noCaseInfo
        }

        let macOS: (String, String)
        do {
            macOS = try SystemInfo.macOSVersionAndBuild()
        } catch {
            macOS = ("unknown", "unknown")
            // WHY: N-8 fix -- OS version detection failure must be logged
            // and surfaced, not silently defaulted.
            safeLog(eventType: .warning, details: [
                "message": "macOS version detection failed: \(error)",
                "context": "buildReportData",
            ])
            liveErrors.append("WARNING: macOS version detection failed: \(error)")
        }

        let dittoHash = (try? HashService.sha256OfFile(atPath: DittoAdapter.binaryPath)) ?? "unknown"
        let hdiutilHash = (try? HashService.sha256OfFile(atPath: HdiutilAdapter.binaryPath)) ?? "unknown"

        let isValidated = PreflightChecker.validatedMacOSVersions.contains(macOS.0)

        let environment = EnvironmentInfo(
            macOSVersion: macOS.0,
            macOSBuild: macOS.1,
            dittoSuiteVersion: ReportGenerator.version,
            gitCommit: "N/A",
            buildHash: "N/A",
            hostname: ProcessInfo.processInfo.hostName,
            dittoSHA256: dittoHash,
            hdiutilSHA256: hdiutilHash,
            validatedVersionStatus: isValidated ? "validated" : "NOT validated"
        )

        let auditLogHash = (try? auditLog?.computeLogHash()) ?? "N/A"

        let bundleDetails = BundleDetails(
            path: state.bundlePath ?? "N/A",
            filesystem: "APFS",
            virtualSize: "N/A",
            bandSize: "8 MB (default)",
            volumeName: caseInfo.evidenceID,
            encrypted: false
        )

        let verificationReport = state.verificationReport ?? VerificationReport(
            comparisonResult: ComparisonResult(
                overallVerdict: .fail,
                totalFileCountMatch: false,
                totalSizeMatch: false,
                perFileResults: [],
                missingInDestination: [],
                extraInDestination: [],
                metadataDifferences: [],
                sourceManifestHash: "",
                destinationManifestHash: ""
            ),
            sourceChanges: [],
            hdiutilVerifySkipped: true,
            hdiutilVerifySkipReason: "Verification not completed",
            overallVerdict: .fail,
            verificationTimeUTC: Date()
        )

        return ReportData(
            caseInfo: caseInfo,
            environment: environment,
            preflightResult: state.preflightResult ?? PreflightResult(
                checks: [], overallReady: false
            ),
            sourceSelections: state.selectedSources,
            collectionResults: state.collectionResults,
            verificationReport: verificationReport,
            auditLogHash: auditLogHash,
            bundleDetails: bundleDetails,
            knownLimitations: ReportGenerator.knownLimitations,
            generationTimeUTC: Date()
        )
    }

    // MARK: - Timer

    private func startElapsedTimer() {
        elapsedTimer?.invalidate()
        startTime = Date()
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self, let start = self.startTime else { return }
            let elapsed = Date().timeIntervalSince(start)
            let minutes = Int(elapsed) / 60
            let seconds = Int(elapsed) % 60
            Task { @MainActor in
                self.elapsedTimeString = String(format: "%d:%02d", minutes, seconds)
            }
        }
    }

    private func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }
}

// MARK: - Errors

enum CoordinatorError: Error, CustomStringConvertible {
    case noCaseInfo
    case noAuditLog
    case noBundlePath
    case noMountPoint

    var description: String {
        switch self {
        case .noCaseInfo: return "Case information not set"
        case .noAuditLog: return "Audit log not initialized"
        case .noBundlePath: return "Bundle path not set"
        case .noMountPoint: return "Mount point not available"
        }
    }
}
