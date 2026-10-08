// SourceSelectionView.swift
// DittoSuite — Forensic Collection Tool
//
// Step 3: File/folder selection for collection.
// WHY: The examiner must explicitly select what to collect. This is a
// targeted logical collection, not a forensic image. The selection list
// is recorded in the audit log and included in the report.

import SwiftUI
import UniformTypeIdentifiers

struct SourceSelectionView: View {
    @EnvironmentObject var coordinator: WorkflowCoordinator

    @State private var selectedSources: [SourceSelection] = []
    @State private var overlapWarning: String?
    @State private var showOverlapAlert = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Source Selection")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Select the files and folders to collect. " +
                     "Only the items you select will be collected. " +
                     "This is a targeted logical collection.")
                    .foregroundColor(.secondary)

                Divider()

                // Add source buttons
                HStack(spacing: 12) {
                    Button("Add Files...") {
                        addFiles()
                    }
                    Button("Add Folder...") {
                        addFolder()
                    }
                }

                // Selected sources list
                GroupBox("Selected Sources (\(selectedSources.count))") {
                    if selectedSources.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "folder.badge.plus")
                                .font(.system(size: 40))
                                .foregroundColor(.secondary)
                            Text("No sources selected")
                                .foregroundColor(.secondary)
                            Text("Use the buttons above to add files or folders.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(32)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(selectedSources) { source in
                                SourceRow(
                                    source: source,
                                    onRemove: { removeSource(source) }
                                )
                                Divider()
                            }
                        }
                    }
                }

                // Summary
                if !selectedSources.isEmpty {
                    GroupBox("Summary") {
                        VStack(alignment: .leading, spacing: 8) {
                            let totalSize = selectedSources.reduce(UInt64(0)) { $0 + $1.estimatedSize }
                            let totalFiles = selectedSources.reduce(0) { $0 + $1.estimatedFileCount }
                            let sizeGB = Double(totalSize) / 1_073_741_824

                            HStack {
                                Text("Total Sources:")
                                Spacer()
                                Text("\(selectedSources.count)")
                            }
                            HStack {
                                Text("Estimated Files:")
                                Spacer()
                                Text("\(totalFiles)")
                            }
                            HStack {
                                Text("Estimated Size:")
                                Spacer()
                                Text(String(format: "%.2f GB", sizeGB))
                            }
                        }
                        .padding(.vertical, 8)
                    }
                }

                // Navigation
                HStack {
                    Button("Back") {
                        coordinator.goBack()
                    }
                    Spacer()
                    Button("Continue to Pre-flight") {
                        proceedToNextStep()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(selectedSources.isEmpty)
                }
            }
            .padding(24)
        }
        .alert("Overlapping Sources", isPresented: $showOverlapAlert) {
            Button("OK") {}
        } message: {
            Text(overlapWarning ?? "")
        }
    }

    // MARK: - Actions

    private func addFiles() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        panel.message = "Select files to collect"

        if panel.runModal() == .OK {
            for url in panel.urls {
                addSource(path: url.path, isDirectory: false)
            }
        }
    }

    private func addFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.message = "Select folders to collect"

        if panel.runModal() == .OK {
            for url in panel.urls {
                addSource(path: url.path, isDirectory: true)
            }
        }
    }

    private func addSource(path: String, isDirectory: Bool) {
        // WHY: Check for duplicates and overlaps before adding.
        // Duplicate paths waste time; overlapping paths (parent + child)
        // result in duplicate files.
        for existing in selectedSources {
            if existing.path == path {
                return  // Already selected
            }
            let existingP = existing.path.hasSuffix("/") ? existing.path : existing.path + "/"
            let newP = path.hasSuffix("/") ? path : path + "/"
            if newP.hasPrefix(existingP) {
                overlapWarning = "\(path) is already contained within \(existing.path)."
                showOverlapAlert = true
                return
            }
            if existingP.hasPrefix(newP) {
                overlapWarning = "\(existing.path) is contained within \(path). " +
                    "The child path will be removed."
                showOverlapAlert = true
                // Remove the child, add the parent
                selectedSources.removeAll { $0.path == existing.path }
            }
        }

        // Estimate size and file count
        let (estimatedSize, estimatedCount) = estimateSource(path: path)

        let source = SourceSelection(
            id: UUID(),
            path: path,
            estimatedSize: estimatedSize,
            estimatedFileCount: estimatedCount,
            isDirectory: isDirectory
        )

        selectedSources.append(source)
    }

    private func removeSource(_ source: SourceSelection) {
        selectedSources.removeAll { $0.id == source.id }
    }

    private func estimateSource(path: String) -> (UInt64, Int) {
        let fm = FileManager.default

        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: path, isDirectory: &isDir) else {
            return (0, 0)
        }

        if !isDir.boolValue {
            // Single file
            let attrs = try? fm.attributesOfItem(atPath: path)
            let size = attrs?[.size] as? UInt64 ?? 0
            return (size, 1)
        }

        // Directory: enumerate to estimate
        var totalSize: UInt64 = 0
        var fileCount = 0

        if let enumerator = fm.enumerator(atPath: path) {
            while let item = enumerator.nextObject() as? String {
                let fullPath = (path as NSString).appendingPathComponent(item)
                if let attrs = try? fm.attributesOfItem(atPath: fullPath) {
                    if let type = attrs[.type] as? FileAttributeType, type == .typeRegular {
                        totalSize += attrs[.size] as? UInt64 ?? 0
                        fileCount += 1
                    }
                }
            }
        }

        return (totalSize, fileCount)
    }

    private func proceedToNextStep() {
        coordinator.completeSourceSelection(sources: selectedSources)
    }
}

// MARK: - Source row

struct SourceRow: View {
    let source: SourceSelection
    let onRemove: () -> Void

    var body: some View {
        HStack {
            Image(systemName: source.isDirectory ? "folder.fill" : "doc.fill")
                .foregroundColor(.accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(source.path)
                    .lineLimit(1)
                    .truncationMode(.middle)

                let sizeStr: String = {
                    let mb = Double(source.estimatedSize) / 1_048_576
                    if mb > 1024 {
                        return String(format: "%.2f GB", mb / 1024)
                    }
                    return String(format: "%.1f MB", mb)
                }()
                Text("\(source.estimatedFileCount) files, \(sizeStr)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
    }
}
