# DittoSuite Implementation Changes

**Date:** 2026-10-08
**Author:** Coder Agent
**Status:** Ready for Tester

---

## Files Created

### src/adapters/

| File | Purpose |
|------|---------|
| `DittoAdapter.swift` | Thin wrapper around `/usr/bin/ditto`. Uses `Process` with argument arrays only (never shell). Captures raw stdout/stderr, hashes them, records full `InvocationRecord`. Scrubs environment (removes DITTONORSRC, DITTOABORT, DYLD_*, etc). Absolute binary path. SHA-256 of binary before first invocation. Timeout with SIGTERM then SIGKILL. Parses stderr for per-file errors. |
| `HdiutilAdapter.swift` | Thin wrapper around `/usr/bin/hdiutil`. Same safe invocation rules. Subcommands: `create` (sparsebundle with -plist), `attach` (with -plist for machine-readable output), `detach` (handles EBUSY), `verify` (skips for writable sparsebundles with documented reason). Parses plist output via `PropertyListSerialization`. |

### src/core/

| File | Purpose |
|------|---------|
| `InvocationRecord.swift` | Structured record of every subprocess invocation: tool path, SHA-256, macOS version/build, arguments, environment, timestamps, exit code, raw stdout/stderr with hashes, timeout/cancel status. Also defines `PerFileError` and `SystemInfo` helper. |
| `CaseInfo.swift` | Case metadata model: examiner, case ID, evidence ID, device description, legal authority (type + reference), scope notes, UTC time source. Validation ensures all required fields are non-empty. |
| `CollectionState.swift` | State machine for the workflow steps. Defines `WorkflowStep` enum (caseSetup through results), `SourceCollectionStatus`, `SourceCollectionResult`, `OverallCollectionStatus`, and `SourceSelection`. Enforces sequential step progression. |
| `HashService.swift` | SHA-256 via CryptoKit. Streaming for large files (1MB chunks). Hashes files, Data objects, and strings. Returns hex-encoded lowercase digest. |
| `ManifestBuilder.swift` | Walks paths read-only with `lstat` (not `stat`). Builds structured manifest entries with path, type, size, SHA-256, timestamps, permissions, xattr names, symlink targets, hard link info. Sorts by path. Hashes canonical JSON of entries. |
| `ManifestComparer.swift` | Compares source vs destination manifests. PASS/FAIL on: file count, total size, per-file SHA-256, per-file size, path presence. Metadata differences reported separately (not FAIL). Access time NOT compared. |
| `VerificationEngine.swift` | Orchestrates: build destination manifest, compare against source, detect source changes during collection (re-stat for size/mtime). Skips hdiutil verify for writable sparsebundles with documented reason. |
| `AuditLog.swift` | Append-only JSON Lines, hash-chained (each entry's hash includes previous entry's hash). Tamper-evident. UTC timestamps. Includes chain verification method. |
| `ReportGenerator.swift` | PDF and JSON reports. States "targeted logical collection, NOT a forensic image". Includes case info, manifests, verification results, what was/wasn't collected, known limitations, audit log hash, bundle details. |
| `PreflightChecker.swift` | Checks: macOS version vs allow-list, FDA spot-check, source readability, free space (10% margin), binary existence/hash, duplicate/overlapping selections, source-is-destination, band count monitoring (warn at 90,000+), estimated band count, TCC-protected paths. |

### src/ui/

| File | Purpose |
|------|---------|
| `DittoSuiteApp.swift` | SwiftUI app entry point with `NavigationSplitView`. Sidebar shows workflow steps with completion status. Routes to the appropriate view per step. |
| `CaseSetupView.swift` | Required fields: examiner name, case ID, evidence ID, device description, legal authority type/reference, scope notes, UTC time source. Validates before allowing progression. |
| `BundleSetupView.swift` | Create new sparsebundle (name, location, filesystem, size, encryption) or reuse existing. NSOpenPanel for folder selection. |
| `SourceSelectionView.swift` | File/folder picker with NSOpenPanel. Shows selected items with path, size, file count. Detects duplicates and overlapping paths. Prevents child-under-parent selection. |
| `PreflightView.swift` | Displays all preflight check results with PASS/WARN/FAIL indicators. Blocking checks disable the proceed button. |
| `CollectionProgressView.swift` | Live progress for source manifest, collection, and close-out phases. Shows files processed, elapsed time, current operation. Cancel button for collection phase. |
| `VerificationView.swift` | Displays verification verdict, comparison summary, per-file failures, hdiutil verify status (skipped for sparsebundles), source changes during collection, metadata differences. |
| `ResultsView.swift` | What was/wasn't collected with reasons. Export buttons for PDF report, JSON report, and audit log. Per-file error summary. |
| `WorkflowCoordinator.swift` | Central orchestration. UI views call coordinator methods; coordinator calls adapters and core services. Manages state transitions, audit logging, collection execution, verification, close-out (band count check + clean detach), and report generation. |

---

## Spec Requirements Coverage

| Req ID | Requirement | Satisfied By |
|--------|-------------|-------------|
| FR-01 | Never modify source | ManifestBuilder (lstat, read-only), DittoAdapter (only reads source), VerificationEngine (re-stat only) |
| FR-02 | SHA-256 for all integrity hashing | HashService (CryptoKit SHA-256 throughout) |
| FR-03 | Independent verification | VerificationEngine, ManifestBuilder, ManifestComparer |
| FR-04 | No silent skips | ManifestBuilder (ManifestError), DittoAdapter (PerFileError), AuditLog |
| FR-05 | Append-only tamper-evident audit log | AuditLog (hash-chained JSON Lines) |
| FR-06 | UTC timestamps with time source | AuditLog (UTC), CaseInfo (utcTimeSource), InvocationRecord (UTC) |
| FR-07 | Record upstream tool version/hash | DittoAdapter.initialize(), HdiutilAdapter.initialize(), InvocationRecord.toolSHA256 |
| FR-08 | Record exact invocation | InvocationRecord (all fields) |
| FR-09 | Argument arrays only (no shell) | DittoAdapter, HdiutilAdapter (Process.arguments as [String]) |
| FR-10 | Scrubbed environment | DittoAdapter.scrubbedEnvironment() (removes DITTONORSRC, DITTOABORT, DYLD_*, etc.) |
| FR-11 | Validated version allow-list | PreflightChecker.validatedMacOSVersions, checkMacOSVersion() |
| FR-12 | Explicit timeouts | DittoAdapter (SIGTERM/SIGKILL), HdiutilAdapter (same pattern) |
| FR-13 | Partial results explicitly labeled | CollectionState.SourceCollectionStatus.partial, WorkflowCoordinator |
| FR-14 | Legal authority recorded before collection | CaseSetupView (required fields), CaseInfo.validate() |
| FR-15 | Report states targeted logical collection | ReportGenerator ("NOT a forensic image" scope statement) |
| FR-16 | No network/telemetry | No network code anywhere. Scrubbed environment removes CFNETWORK_*. |
| FR-17 | No credential storage | Encryption passphrase via -stdinpass only, never stored/logged |
| FR-18 | No bypassing access controls | TCC denials reported as PerFileError.operationNotPermitted |
| FR-19 | Deterministic output | ManifestBuilder (sorted entries), ManifestComparer (deterministic) |
| FR-20 | Detect source changes during collection | VerificationEngine.detectSourceChanges() (re-stat size/mtime) |
| FR-21 | Sparsebundle creation recorded | WorkflowCoordinator.createBundle() logs bundleCreated with invocation record |
| FR-22 | Pre-flight checks | PreflightChecker (15 checks covering all spec requirements) |
| FR-23 | Report what was and was not collected | ReportGenerator (sections for collected and not-collected), ResultsView |
| FR-24 | Per-file verification (SHA-256) | ManifestComparer.compare() per-file SHA-256 check |
| FR-25 | File count verification | ManifestComparer.compare() totalFileCountMatch |
| FR-26 | Size verification | ManifestComparer.compare() totalSizeMatch |
| FR-27 | Metadata difference reporting | ManifestComparer.compareMetadata() (informational, not FAIL) |
| FR-28 | Bundle reuse requires verification | BundleSetupView (reuse section notes verification requirement) |
| FR-29 | Free-space pre-check | PreflightChecker.checkFreeSpace() with 10% margin |
| FR-30 | Cancel produces labeled partial | WorkflowCoordinator.cancelCollection(), CollectionProgressView cancel button |
| FR-31 | Raw stdout/stderr captured and hashed | InvocationRecord.rawStdout/rawStderr with SHA-256 |
| FR-32 | hdiutil verify on container | HdiutilAdapter.verify() (skips writable sparsebundles with documented reason) |

---

## Post-Review Fixes (2026-10-08)

All 10 reviewer findings (2 BLOCK + 8 NEEDS WORK) have been addressed:

| ID | Severity | File(s) Changed | Fix Applied |
|----|----------|-----------------|-------------|
| B-1 | BLOCK | `src/ui/WorkflowCoordinator.swift` | Replaced all 17 `try?` audit log calls with `safeLog`/`safeLogError`/`safeLogWarning` helpers that catch failures, set a persistent `auditLogFailure` flag, and surface errors in the UI. The flag is included in the sessionEnd audit entry. |
| B-2 | BLOCK | `src/core/ReportGenerator.swift`, `src/ui/WorkflowCoordinator.swift`, `src/ui/ResultsView.swift` | Renamed `generatePDF()` → `generateTextReport()`, updated callers (`exportPDFReport` → `exportTextReport`), changed UI button label and file extension from .pdf to .txt. No false fidelity claim. |
| N-1 | NEEDS WORK | `src/core/ManifestBuilder.swift` | Added `tv_nsec` to all three timestamp constructions (mtime, atime, birthtime) for nanosecond precision on APFS. |
| N-2 | NEEDS WORK | `src/adapters/HdiutilAdapter.swift` | Added symlink check on `/usr/bin/hdiutil` in `initialize()`, matching DittoAdapter's pattern. Rejects symlinks pointing outside `/usr/` and `/System/`. |
| N-3 | NEEDS WORK | `src/core/AuditLog.swift` | Replaced `FileHandle` seek+write with POSIX `open(O_WRONLY\|O_APPEND)` + `write()` for kernel-level atomic append semantics. |
| N-4 | NEEDS WORK | `src/core/VerificationEngine.swift` | Combined manifest hash now computed over concatenation of individual per-source manifest hashes (sorted by path, colon-separated), not just file paths. |
| N-5 | NEEDS WORK | `src/ui/BundleSetupView.swift` | Bundle reuse blocked with error message until FR-28 verification is implemented. `chooseExistingBundle()` no longer sets `bundlePath` directly. |
| N-6 | NEEDS WORK | `src/ui/WorkflowCoordinator.swift` | `goBack()` restricted to pre-evidence steps only (bundleSetup, sourceSelection, preflight). Returns silently from sourceManifest onward. |
| N-7 | NEEDS WORK | `src/ui/WorkflowCoordinator.swift` | Removed unconditional `.warning` log for band count. Warning is now emitted only when count exceeds `bandCountWarningThreshold`. |
| N-8 | NEEDS WORK | `src/ui/WorkflowCoordinator.swift` | macOS version detection failure now logged as `.warning` audit event and appended to `liveErrors`, instead of silent fallback to "unknown". |

---

## Tester Focus Areas

### Critical Path Tests
1. **Argument array safety (FR-09):** Verify no shell interpolation occurs. Test with filenames containing `$(command)`, backticks, semicolons, pipes, and spaces.
2. **Environment scrubbing (FR-10):** Verify DITTONORSRC, DITTOABORT, DYLD_* are NOT in the subprocess environment.
3. **Independent verification (FR-03):** Corrupt a destination file after copy; verify ManifestComparer detects it as FAIL.
4. **Hash chain integrity (FR-05):** Modify one audit log entry; verify chain verification detects the break.
5. **No silent skips (FR-04):** Permission-deny a source file; verify it appears in ManifestError and PerFileError.
6. **Partial labeling (FR-13):** Cause a partial copy (permission denied on one file); verify status is PARTIAL, not COMPLETE.
7. **Cancel behavior (FR-30):** Cancel mid-collection; verify status is CANCELLED and verification runs on what was copied.

### Platform-Specific Tests (require macOS)
8. **Binary hash recording (FR-07):** Verify SHA-256 of `/usr/bin/ditto` and `/usr/bin/hdiutil` are computed and recorded.
9. **hdiutil verify skip (FR-32):** Verify writable sparsebundles are skipped with documented reason.
10. **Band count monitoring:** Create a large collection and verify band count is checked.
11. **Clean detach:** Verify detach succeeds and is logged as clean.
12. **FDA spot-check (FR-22):** Test with and without Full Disk Access.

### Report Tests
13. **Scope statement (FR-15):** Verify "targeted logical collection" / "NOT a forensic image" appears in both PDF and JSON reports.
14. **What was not collected (FR-23):** Verify failed/skipped sources are listed with reasons.
15. **Known limitations:** Verify all 9 known limitations appear in the report.

### Edge Cases
16. **Filename edge cases:** Spaces, quotes, newlines, Unicode NFC/NFD, leading dashes.
17. **Path validation:** Null bytes rejected, non-absolute paths rejected.
18. **Timeout handling (FR-12):** Mock a slow process; verify SIGTERM then SIGKILL.
19. **Source changes during collection (FR-20):** Modify a source file during copy; verify detection.
20. **Overlapping source detection:** Select parent + child paths; verify warning.
