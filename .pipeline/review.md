# Forensic Review: DittoSuite Collection Tool

**Reviewer**: Forensic QA Reviewer (automated)
**Date**: 2026-10-08
**Scope**: Full code review of all 21 source files, 11 test files, pipeline documentation, and forensic requirements
**Platform**: Code review only (Windows host; no compilation or execution)

---

## VERDICT: BLOCK

Two block-level findings prevent this from advancing to human validation in its current state. Both relate to core forensic guarantees: audit trail completeness and output fidelity.

---

## BLOCK-LEVEL FINDINGS

### B-1. SILENT FAILURE: Audit log writes silently swallowed throughout WorkflowCoordinator

**File**: src/ui/WorkflowCoordinator.swift
**Lines**: 59, 158, 184, 225, 245, 272, 326, 402, 410, 428, 523, 528, 549, 561, 569, 588, 601

Every audit log write in the WorkflowCoordinator uses try?, meaning any I/O failure (full disk, broken file handle, permission error) is silently discarded. A collection session could complete from the examiner perspective while the audit log is incomplete or empty. No warning is shown. No flag is set on the report.

This violates:
- **FR-04** (No silent skips): unreadable files, permission denials, and warnings must be logged
- **forensic-requirements.md section 1**: every warning must be captured, preserved, and visible
- **forensic-requirements.md section 2**: the audit log is the chain-of-custody record

By contrast, VerificationEngine.swift lines 63 and 143 use try (propagating errors), showing the correct pattern exists but was not applied consistently.

**Fix required**: Replace try? with try and propagate audit log write failures as blocking errors, or set a persistent error flag that the report includes and the UI displays prominently.

### B-2. FIDELITY CLAIM: generatePDF() writes plain text, not PDF

**File**: src/core/ReportGenerator.swift
**Lines**: 309-314

The method generatePDF() writes UTF-8 text data to the output path. The file produced is not a PDF. It contains no PDF header, no structure, no fonts, no pages. The comment at lines 309-310 acknowledges this is a placeholder but the method name, return type, and UI export button present it as functional PDF generation. Challenged under FRE 901.

**Fix required**: Either implement actual PDF generation or rename to generateTextReport() and change the file extension.

---

## NEEDS-WORK FINDINGS

### N-1. SOURCE INTEGRITY: Timestamp nanosecond precision lost

**File**: src/core/ManifestBuilder.swift, Lines 261-263

Only tv_sec is used; tv_nsec is discarded. APFS supports nanosecond timestamps. Two files modified within the same second but at different nanosecond offsets appear identical. Affects source change detection (FR-20). Not documented in knownLimitations.

**Fix**: Include tv_nsec in Date construction. Document limitation if sub-second precision cannot be guaranteed.

### N-2. INVOCATION SAFETY: HdiutilAdapter missing symlink check on binary

**File**: src/adapters/HdiutilAdapter.swift, Lines 98-109

DittoAdapter (lines 77-89) checks whether /usr/bin/ditto is a symlink to an unexpected location. HdiutilAdapter does NOT check /usr/bin/hdiutil. Same threat model.

**Fix**: Add symlink validation to HdiutilAdapter.initialize().

### N-3. AUDIT LOG: Not using O_APPEND semantics

**File**: src/core/AuditLog.swift, Lines 139-144

seekToEndOfFile() followed by write() is not atomic at the kernel level. True O_APPEND guarantees atomic append. NSLock protects in-process only.

**Fix**: Open with O_APPEND or document single-process constraint.

### N-4. VERIFICATION: Combined manifest hash is weak

**File**: src/core/VerificationEngine.swift, Line 96

Combined source manifest hash computed over paths only, not content. Individual per-source hashes are correct. The combined hash logged at line 150 is misleading.

**Fix**: Hash full entry data for combined manifest, or hash concatenation of individual manifest hashes.

### N-5. FR-28 INCOMPLETE: Bundle reuse not enforced

**File**: src/ui/BundleSetupView.swift, Lines 203-219

Reuse mode sets bundlePath directly (line 213) without verification. FR-28: reuse without verify = blocked. UI shows warning text but does not enforce.

**Fix**: Implement bundle reuse verification or disable the option.

### N-6. WORKFLOW STATE: goBack() bypasses state machine and is unaudited

**File**: src/ui/WorkflowCoordinator.swift, Lines 622-628

goBack() directly mutates state.currentStep, bypassing advanceTo(). Allows backward navigation after evidence-touching steps without audit logging. CollectionState comment says workflow can only move forward.

**Fix**: Restrict to pre-collection steps or audit every backward navigation.

### N-7. BAND COUNT: Normal counts logged as warnings

**File**: src/ui/WorkflowCoordinator.swift, Lines 528-533

Band count always logged with eventType .warning regardless of value. Pollutes audit log.

**Fix**: Use .warning only when count exceeds threshold.

### N-8. VERSION FALLBACK: macOS version silently defaults to unknown

**File**: src/ui/WorkflowCoordinator.swift, Lines 652-656

OS version detection failure silently defaults to unknown.

**Fix**: Log the error and flag it in the report.

---

## RESIDUAL RISKS AND LIMITATIONS

1. hdiutil verify does NOT work on writable sparsebundles. Independent manifest comparison is sole integrity check. Correctly documented. Human examiner must confirm acceptability.
2. Targeted logical collection, not forensic image. Correctly labeled with 9 known limitations.
3. atime modification by manifest building. Reading files for hashing updates access times.
4. ditto Unicode normalization (NFC/NFD) must be empirically validated (NOT RUN).
5. Single-process assumption for audit log integrity.

---

## NOT RUN TESTS (REQUIRED BEFORE CASEWORK)

- **68 of 157 runtime tests**: NOT RUN (Windows platform). Must execute on macOS 14.0+ with FDA.
- **15 of 15 upstream characterization tests**: NOT RUN. Must produce documented findings.
- **No compilation** has been attempted.
- **No code signing** or notarization verification.
- **Wrapper-vs-manual equivalence**: NOT RUN.

---

## UPSTREAM VERSIONS TO VALIDATE

| Component | How to identify | Where recorded |
|-----------|----------------|----------------|
| macOS version | sw_vers -productVersion | InvocationRecord.macOSVersion |
| macOS build | sw_vers -buildVersion | InvocationRecord.macOSBuild |
| ditto SHA-256 | shasum -a 256 /usr/bin/ditto | DittoAdapter.binarySHA256 |
| hdiutil SHA-256 | shasum -a 256 /usr/bin/hdiutil | HdiutilAdapter.binarySHA256 |
| DittoSuite version | ReportGenerator.version | Report header |
| Swift runtime | swift --version | NOT recorded (gap) |
| Xcode version | xcodebuild -version | NOT recorded (gap) |

---

## COMPLIANCE MATRIX

| FR | Status | Notes |
|----|--------|-------|
| FR-01 | PARTIAL | lstat OK; file reads update atime |
| FR-02 | PASS | CryptoKit, NIST vectors |
| FR-03 | PASS | Independent ManifestComparer |
| FR-04 | FAIL | try? on audit writes. See B-1 |
| FR-05 | PARTIAL | Hash chain OK; not O_APPEND. See N-3 |
| FR-06 | PASS | TZ=UTC |
| FR-07 | PASS | Binary SHA-256 recorded |
| FR-08 | PASS | 20-field InvocationRecord |
| FR-09 | PASS | Argument arrays, path validation |
| FR-10 | PASS | Allowlist-based environment |
| FR-11 | NOT RUN | 15 characterization tests |
| FR-12 | PASS | Timeouts per spec |
| FR-13 | PASS | PARTIAL status with errors |
| FR-14 | PASS | 5 required fields |
| FR-15 | PASS | NOT a forensic image |
| FR-16 | PASS | No networking imports |
| FR-17 | PASS | Scrubbed environment |
| FR-18 | PASS | Validated allow-list |
| FR-19 | PASS | Stored with SHA-256 |
| FR-20 | PARTIAL | Seconds-only precision. See N-1 |
| FR-21 | PASS | Full invocation record |
| FR-22 | PASS | Exit code checked |
| FR-23 | PARTIAL | See N-7 |
| FR-24 | PASS | Spot-check in preflight |
| FR-25 | PASS | Per-file SHA-256 |
| FR-26 | PASS | Total and per-file size |
| FR-27 | PASS | Informational diffs |
| FR-28 | FAIL | Not enforced. See N-5 |
| FR-29 | PASS | 10 percent margin |
| FR-30 | PASS | CANCELLED with audit |
| FR-31 | PASS | SHA-256 in InvocationRecord |
| FR-32 | PASS | Documented reason |

---

## SECURITY NOTES

- Path validation: null byte and relative path rejection in both adapters
- Shell injection: argument arrays throughout, no shell interpolation
- Fixture filenames include shell metacharacters for testing
- Binary paths: absolute
- Symlink on binary: checked for ditto, NOT for hdiutil (see N-2)
- Upstream output parsing: string matching (read-only, safe)
- Plist parsing: Apple PropertyListSerialization

## DATA EGRESS AND CREDENTIAL HANDLING

- No network imports in any source file
- No URLSession, URLRequest, or networking framework usage
- CFNETWORK_* environment variables scrubbed
- No telemetry, update checks, or cloud calls
- Credentials excluded from scrubbed environment
- Hostname recorded in audit log (appropriate for forensic documentation)

## LEGAL AND LICENSING

- Wraps system binaries via subprocess (Process API), not linking/bundling
- Legal authority type and reference required (FR-14)
- No upstream binaries redistributed
- No third-party dependencies beyond Apple frameworks
- **Flag for counsel**: tool creates writable sparsebundles on the evidence system

---

## SUMMARY OF REQUIRED FIXES

| ID | Severity | File | Fix |
|----|----------|------|-----|
| B-1 | BLOCK | src/ui/WorkflowCoordinator.swift | Replace try? on audit writes with error propagation |
| B-2 | BLOCK | src/core/ReportGenerator.swift | Implement real PDF or rename to text report |
| N-1 | NEEDS WORK | src/core/ManifestBuilder.swift | Include tv_nsec in timestamps |
| N-2 | NEEDS WORK | src/adapters/HdiutilAdapter.swift | Add symlink check |
| N-3 | NEEDS WORK | src/core/AuditLog.swift | Use O_APPEND or document constraint |
| N-4 | NEEDS WORK | src/core/VerificationEngine.swift | Hash full entry data for combined manifest |
| N-5 | NEEDS WORK | src/ui/BundleSetupView.swift | Implement or disable bundle reuse |
| N-6 | NEEDS WORK | src/ui/WorkflowCoordinator.swift | Restrict or audit goBack() |
| N-7 | NEEDS WORK | src/ui/WorkflowCoordinator.swift | Fix band count event type |
| N-8 | NEEDS WORK | src/ui/WorkflowCoordinator.swift | Flag OS version detection failure |
