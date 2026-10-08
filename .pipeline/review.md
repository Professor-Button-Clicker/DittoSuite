# Forensic Re-Review: DittoSuite Collection Tool (Final)

**Reviewer**: Forensic QA Reviewer (automated)
**Date**: 2026-10-08
**Scope**: Final re-review after N-1-R regression fix (commit e893d53)
**Platform**: Code review only (Windows host; no compilation or execution)
**Prior reviews**: Initial review (10 findings: 2 BLOCK, 8 NEEDS WORK) -> post-fix review (1 NEEDS WORK: N-1-R) -> this review

---

## VERDICT: SHIP-TO-HUMAN-VALIDATION

All 10 original findings and the N-1-R regression are resolved. No BLOCK or NEEDS WORK items remain. The tool is ready for a qualified forensic examiner's independent validation on macOS, including compilation, test execution, and empirical characterization of upstream tool behavior. This verdict does NOT mean "approved for casework."

---

## FIX VERIFICATION SUMMARY

| ID | Original Severity | Status | Notes |
|----|-------------------|--------|-------|
| B-1 | BLOCK | FIXED | Audit log writes no longer silently swallowed; safeLog helpers with persistent auditLogFailure flag |
| B-2 | BLOCK | FIXED | generatePDF() renamed to generateTextReport(); no false fidelity claim |
| N-1 | NEEDS WORK | FIXED | Nanosecond timestamps in ManifestBuilder (all three: mtime, atime, birthtime) |
| N-1-R | NEEDS WORK (regression) | FIXED | VerificationEngine.swift line 202 now includes tv_nsec, matching ManifestBuilder precision |
| N-2 | NEEDS WORK | FIXED | Symlink check added to HdiutilAdapter |
| N-3 | NEEDS WORK | FIXED | O_APPEND used for audit log writes |
| N-4 | NEEDS WORK | FIXED | Combined manifest hash uses per-source manifest hashes |
| N-5 | NEEDS WORK | FIXED | Bundle reuse blocked |
| N-6 | NEEDS WORK | FIXED | goBack() restricted to pre-evidence steps |
| N-7 | NEEDS WORK | FIXED | Band count warning conditional on threshold |
| N-8 | NEEDS WORK | FIXED | macOS version detection failure logged and surfaced |

---

## COMPLIANCE MATRIX

| FR | Status | Notes |
|----|--------|-------|
| FR-01 | PARTIAL | lstat OK; file reads update atime (documented limitation) |
| FR-02 | PASS | CryptoKit SHA-256, NIST vectors |
| FR-03 | PASS | Independent ManifestComparer |
| FR-04 | PASS | safeLog helpers with persistent auditLogFailure flag |
| FR-05 | PASS | O_APPEND semantics with short-write detection |
| FR-06 | PASS | TZ=UTC |
| FR-07 | PASS | Binary SHA-256 recorded |
| FR-08 | PASS | 20-field InvocationRecord |
| FR-09 | PASS | Argument arrays, path validation |
| FR-10 | PASS | Allowlist-based environment |
| FR-11 | NOT RUN | 15 characterization tests require macOS execution |
| FR-12 | PASS | Timeouts per spec |
| FR-13 | PASS | PARTIAL status with errors |
| FR-14 | PASS | 5 required fields |
| FR-15 | PASS | NOT a forensic image (correctly labeled) |
| FR-16 | PASS | No networking imports |
| FR-17 | PASS | Scrubbed environment |
| FR-18 | PASS | Validated allow-list |
| FR-19 | PASS | Stored with SHA-256 |
| FR-20 | PASS | Nanosecond timestamps consistent in ManifestBuilder and VerificationEngine |
| FR-21 | PASS | Full invocation record |
| FR-22 | PASS | Exit code checked |
| FR-23 | PASS | Band count warnings conditional on threshold |
| FR-24 | PASS | Spot-check in preflight |
| FR-25 | PASS | Per-file SHA-256 |
| FR-26 | PASS | Total and per-file size |
| FR-27 | PASS | Informational diffs |
| FR-28 | PASS | Bundle reuse blocked until verification implemented |
| FR-29 | PASS | 10 percent margin |
| FR-30 | PASS | CANCELLED with audit |
| FR-31 | PASS | SHA-256 in InvocationRecord |
| FR-32 | PASS | Documented reason |

---

## RESIDUAL RISKS AND LIMITATIONS

1. hdiutil verify does NOT work on writable sparsebundles. Independent manifest comparison is sole integrity check. Correctly documented. Human examiner must confirm acceptability.
2. Targeted logical collection, not forensic image. Correctly labeled with 9 known limitations.
3. atime modification by manifest building. Reading files for hashing updates access times. Documented.
4. ditto Unicode normalization (NFC/NFD) must be empirically validated (NOT RUN).
5. Single-process assumption for audit log integrity (O_APPEND protects at OS level; NSLock protects in-process ordering).
6. auditLogFailure flag is recorded in sessionEnd audit entry and displayed in UI, but is NOT included in exported text/JSON reports. Examiner sees it during collection; counsel reviewing only the exported report must also review the raw audit log.
7. ReportGenerator.swift line 52 class-level doc comment still says "Generates PDF and JSON reports" (cosmetic code comment; no user-facing impact).
8. Four remaining try? calls in WorkflowCoordinator.swift (lines 528, 684, 685, 701) are in non-audit informational paths. Values default to visibly incomplete strings ("unknown", "N/A"). Not forensically critical.

---

## NOT RUN TESTS (REQUIRED BEFORE CASEWORK)

- **68 of 157 runtime tests**: NOT RUN (Windows platform). Must execute on macOS 14.0+ with Full Disk Access.
- **15 of 15 upstream characterization tests**: NOT RUN. Must produce documented findings.
- **No compilation** has been attempted.
- **No code signing** or notarization verification.
- **Wrapper-vs-manual equivalence**: NOT RUN.
- **No test coverage for the 11 fixes** (10 original + N-1-R) has been executed. All fix verification is by code review only.

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

## SECURITY NOTES

- Path validation: null byte and relative path rejection in both adapters
- Shell injection: argument arrays throughout, no shell interpolation
- Fixture filenames include shell metacharacters for testing
- Binary paths: absolute
- Symlink on binary: checked for both ditto and hdiutil
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
