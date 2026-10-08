# DittoSuite Implementation Spec

**Date:** 2026-10-08
**Author:** Planner Agent
**Status:** Ready for Coder
**Upstream profile:** .pipeline/integration-profile.md

---

## OPEN QUESTIONS — RESOLVED

### Legal (1-3): Reviewed and cleared by human counsel.

1. **APSL / macOS EULA:** CLEARED. Subprocess invocation of system binaries without bundling/modifying/redistributing is acceptable.
2. **Live-system collection disclosure:** CLEARED. Disclosure language confirmed adequate.
3. **hdiutil deprecation in macOS 27:** CLEARED. Using a deprecated but functional system tool does not affect admissibility. Proactive migration not required at this time.

### Technical (4-7): Resolved with examiner-provided characterization.

4. **Sparsebundle behavior (writable):** RESOLVED. Key findings from examiner:
   - hdiutil verify does NOT reliably cover writable sparsebundles. **The independent manifest comparison is the sole integrity check.** Do NOT invoke `hdiutil verify` on writable sparsebundles; skip it and document why.
   - Sparsebundles are directories of 8.4 MB band files. Initial footprint is 8-20 MB; grows on demand up to the virtual ceiling.
   - **NO MODIFICATION to collected files is acceptable.** After collection and verification, the bundle should be detached and treated as the preserved original. No compaction, no resizing, no further writes.
   - Bands are NOT reclaimed on file deletion (host footprint does not shrink). Partially filled bands remain.
   - Only changed bands are rewritten on modification — relevant for understanding write patterns but DittoSuite must NOT modify after collection.
   - **Abrupt disconnection risk:** Mid-write disconnection can corrupt the bundle or flip it to read-only permanently. The adapter must verify clean detach and log any detach failure as CRITICAL.
   - **Write speed:** ~70% of native. Reads are near-native. Factor into timeout calculations.
   - **Band count limit:** Monitor band count; exceeding ~100,000 bands can cause directory structure failures under HFS+/APFS. Add a preflight/post-collection check: if band count approaches this threshold, warn the examiner.
   - **Implementation impact:** Add `BandCountChecker` to PreflightChecker (post-create and post-collection). Add detach verification (confirm clean unmount). Remove `hdiutil verify` calls for writable sparsebundles.

5. **hdiutil attach -plist output schema:** Deferred to upstream characterization testing. Parser must handle key name variations across macOS versions defensively (log unknown keys, fail on missing required keys).

6. **diskutil image sparsebundle support on macOS 27:** Deferred. macOS 27 uses hdiutil with deprecation warning. DiskutilImageAdapter is future work, not in this implementation.

7. **ditto extended attribute completeness:** Deferred to upstream characterization testing. The report must state this as a known limitation: "ditto --extattr may not preserve all extended attributes, particularly system-protected ones."

---

## 1. ARCHITECTURE AND FILE LAYOUT

### 1.1 Directory structure

```
src/
  adapters/
    DittoAdapter.swift          -- thin wrapper around /usr/bin/ditto
    HdiutilAdapter.swift        -- thin wrapper around /usr/bin/hdiutil
  core/
    HashService.swift           -- SHA-256 hashing (files, data, streaming)
    ManifestBuilder.swift       -- walk a path, build structured manifest
    ManifestComparer.swift      -- compare two manifests, produce diff report
    VerificationEngine.swift    -- orchestrates pre/post manifests + comparison
    AuditLog.swift              -- append-only, hash-chained, tamper-evident log
    ReportGenerator.swift       -- PDF and JSON report generation
    PreflightChecker.swift      -- OS version, FDA, free space, permissions checks
    InvocationRecord.swift      -- structured record of a subprocess invocation
    CaseInfo.swift              -- case metadata model
    CollectionState.swift       -- state machine for collection workflow
  ui/
    DittoSuiteApp.swift         -- SwiftUI app entry point
    CaseSetupView.swift         -- case/evidence metadata entry
    BundleSetupView.swift       -- sparsebundle creation/selection
    SourceSelectionView.swift   -- file/folder picker with tree browser
    PreflightView.swift         -- pre-flight check results
    CollectionProgressView.swift-- live progress during collection
    VerificationView.swift      -- verification results
    ResultsView.swift           -- final results and report export
    WorkflowCoordinator.swift   -- orchestrates the multi-step workflow
tests/
  fixtures/                     -- synthetic test data (generated, not checked in)
  adapters/
    DittoAdapterTests.swift
    HdiutilAdapterTests.swift
  core/
    HashServiceTests.swift
    ManifestBuilderTests.swift
    ManifestComparerTests.swift
    VerificationEngineTests.swift
    AuditLogTests.swift
    PreflightCheckerTests.swift
  integration/
    EndToEndCollectionTests.swift
    UpstreamCharacterizationTests.swift
```

### 1.2 Layering rules

1. **Only adapters call upstream tools.** `DittoAdapter` and `HdiutilAdapter` are the only code that invokes `/usr/bin/ditto` or `/usr/bin/hdiutil`.
2. **Core never imports adapters.** Core services accept data (paths, manifests, invocation records) and produce results. They do not know which upstream tool produced the data.
3. **UI calls core and adapters through WorkflowCoordinator.** The UI layer never constructs subprocess commands or touches evidence directly.
4. **No cross-adapter dependencies.** Each adapter is independent.

---

## 2. ADAPTER INTERFACES

### 2.1 InvocationRecord (src/core/InvocationRecord.swift)

Every subprocess invocation returns this structured record:

```swift
struct InvocationRecord: Codable {
    let id: UUID                          // unique invocation ID
    let toolPath: String                  // absolute path, e.g. "/usr/bin/ditto"
    let toolSHA256: String                // SHA-256 of the binary at toolPath
    let macOSVersion: String              // e.g. "14.5"
    let macOSBuild: String                // e.g. "23F79"
    let arguments: [String]               // full argument array (no shell expansion)
    let workingDirectory: String          // absolute path
    let environment: [String: String]     // scrubbed environment used
    let locale: String                    // LC_ALL / LANG value
    let timezone: String                  // TZ value (always "UTC")
    let startTimeUTC: Date                // start time in UTC
    let endTimeUTC: Date                  // end time in UTC
    let durationSeconds: Double           // wall-clock duration
    let exitCode: Int32                   // process exit code
    let rawStdout: Data                   // complete raw stdout bytes
    let rawStdoutSHA256: String           // SHA-256 of rawStdout
    let rawStderr: Data                   // complete raw stderr bytes
    let rawStderrSHA256: String           // SHA-256 of rawStderr
    let timedOut: Bool                    // whether the process was killed by timeout
    let wasCancel: Bool                   // whether the user cancelled
}
```

### 2.2 DittoAdapter (src/adapters/DittoAdapter.swift)

```swift
protocol DittoAdapterProtocol {
    /// Copy source to destination using ditto with full metadata preservation.
    /// Returns the invocation record. Does NOT verify the copy (that is core's job).
    func copy(
        source: String,          // absolute source path
        destination: String,     // absolute destination path
        options: DittoCopyOptions,
        timeout: TimeInterval
    ) async throws -> InvocationRecord
}

struct DittoCopyOptions {
    var preserveResourceForks: Bool = true   // --rsrc (default)
    var preserveExtattr: Bool = true          // --extattr (default)
    var preserveACLs: Bool = true             // --acl (default)
    var preserveQuarantine: Bool = true       // --qtn (default)
    var verbose: Bool = true                  // -V (one line per file)
    var noCrossDev: Bool = false              // -X
    var noCache: Bool = false                 // --nocache
}
```

**Implementation requirements:**

1. Resolve `/usr/bin/ditto` to absolute path. Hash the binary with SHA-256 before first invocation in the session.
2. Build argument array programmatically. NEVER use string interpolation or shell expansion. All paths passed as array elements.
3. Scrub the process environment to a minimal set: `PATH=/usr/bin:/bin`, `HOME`, `TMPDIR`, `LC_ALL=en_US.UTF-8`, `TZ=UTC`. Remove `DITTONORSRC` and `DITTOABORT` explicitly.
4. Use `Process` (Foundation) with argument array. Set `executableURL`, `arguments`, `environment`, `currentDirectoryURL`.
5. Capture stdout and stderr via `Pipe`. Read all data before waiting for exit to avoid deadlock.
6. Set a timeout using `DispatchQueue.asyncAfter` or `Task.sleep`. If timeout fires, send SIGTERM, wait 5 seconds, then SIGKILL. Mark `timedOut = true`.
7. Record everything in `InvocationRecord`.
8. Parse stderr for per-file error lines matching patterns: "Operation not permitted", "Permission denied", "No such file or directory". Return these as structured error entries alongside the invocation record.

### 2.3 HdiutilAdapter (src/adapters/HdiutilAdapter.swift)

```swift
protocol HdiutilAdapterProtocol {
    /// Create a sparsebundle at the given path.
    func createSparsebundle(
        path: String,
        volumeName: String,
        filesystem: SparsebundleFilesystem,
        size: String,              // e.g. "100g"
        bandSize: Int?,            // sectors; nil = default 16384
        encryption: EncryptionType?,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, CreateResult)

    /// Attach (mount) a sparsebundle. Returns mount point path.
    func attach(
        path: String,
        mountPoint: String?,       // nil = system default
        readOnly: Bool,
        noBrowse: Bool,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, AttachResult)

    /// Detach (eject) a mounted volume.
    func detach(
        mountPointOrDevice: String,
        force: Bool,
        timeout: TimeInterval
    ) async throws -> InvocationRecord

    /// Verify an image's checksum.
    func verify(
        path: String,
        timeout: TimeInterval
    ) async throws -> (InvocationRecord, VerifyResult)
}

enum SparsebundleFilesystem: String {
    case apfs = "APFS"
    case jhfsPlus = "JHFS+"
    case hfsPlus = "HFS+"
}

enum EncryptionType: String {
    case aes128 = "AES-128"
    case aes256 = "AES-256"
}

struct CreateResult {
    let imagePath: String
}

struct AttachResult {
    let deviceNode: String     // e.g. "/dev/disk7s1"
    let mountPoint: String     // e.g. "/Volumes/Evidence"
    let plistOutput: Data      // raw plist for audit
}

struct VerifyResult {
    let passed: Bool
    let details: String
}
```

**Implementation requirements:**

Same safe invocation rules as DittoAdapter (argument arrays, absolute binary path `/usr/bin/hdiutil`, SHA-256 of binary, scrubbed environment, timeout handling).

Additional:
1. Use `-plist` for `create` and `attach` to get machine-readable output. Parse the plist using `PropertyListSerialization`. For `attach`, extract `system-entities` array and find the entry with a `mount-point` key.
2. For `create`, pre-check destination free space before invoking. The adapter reports the check result but does NOT skip on failure -- the caller (PreflightChecker) makes the decision.
3. For `detach`, handle EBUSY by reporting it. Do NOT auto-retry with `-force` unless explicitly requested.
4. For `verify`: Do NOT invoke on writable sparsebundles (verified behavior: hdiutil verify does not reliably cover them). The independent manifest comparison is the sole integrity check. The verify method should check whether the image is writable and skip with a documented reason if so. Log the skip in the audit log.

---

## 3. CORE SERVICES

### 3.1 HashService (src/core/HashService.swift)

- SHA-256 for all integrity hashing. Use `CryptoKit.SHA256`.
- Streaming hash for large files (read in chunks, e.g. 1MB).
- Hash files, Data objects, and strings.
- Returns hex-encoded lowercase digest string.
- No MD5 or SHA-1 as sole hash. May compute alongside for legacy if needed in future.

### 3.2 ManifestBuilder (src/core/ManifestBuilder.swift)

Walks a path read-only and builds a structured manifest:

```swift
struct ManifestEntry: Codable {
    let relativePath: String           // relative to the root being walked
    let fileType: FileType             // regular, directory, symlink, other
    let size: UInt64                   // file size in bytes
    let sha256: String?                // SHA-256 for regular files; nil for dirs/symlinks
    let modificationTime: Date         // st_mtime
    let accessTime: Date               // st_atime
    let creationTime: Date             // st_birthtime
    let permissions: UInt16            // st_mode & 0o7777
    let owner: UInt32                  // st_uid
    let group: UInt32                  // st_gid
    let extendedAttributeNames: [String]  // names only (not values, to avoid size explosion)
    let symlinkTarget: String?         // target path for symlinks
    let hardLinkID: UInt64?            // st_ino for hard link detection
    let nlink: UInt32                  // st_nlink (link count)
    let deviceID: UInt64               // st_dev (for cross-device detection)
    let flags: UInt32                  // st_flags (e.g., UF_HIDDEN, SF_RESTRICTED)
}

struct Manifest: Codable {
    let rootPath: String               // absolute path that was walked
    let buildTimeUTC: Date
    let totalFiles: Int
    let totalDirectories: Int
    let totalSymlinks: Int
    let totalSize: UInt64              // sum of file sizes
    let entries: [ManifestEntry]
    let errors: [ManifestError]        // paths that could not be read with reason
    let manifestSHA256: String         // hash of the canonical JSON of entries
}
```

**Implementation requirements:**

1. Use `FileManager.enumerator` or POSIX `opendir`/`readdir` + `lstat` for traversal. Use `lstat`, not `stat`, to avoid following symlinks.
2. For each regular file, compute SHA-256 by reading the file content in streaming mode.
3. Read extended attribute names with `listxattr`. Do NOT read xattr values (they can be large and are not needed for the manifest comparison).
4. Record errors (permission denied, etc.) as `ManifestError` entries. Do NOT skip silently. Do NOT abort on per-file errors -- continue and mark the manifest as partial.
5. Sort entries by `relativePath` for deterministic output.
6. After building, compute `manifestSHA256` as the SHA-256 of the canonical JSON serialization of the sorted entries array.
7. **Source walk must be read-only.** Do not set any attributes, do not create any files, do not open files for writing.

### 3.3 ManifestComparer (src/core/ManifestComparer.swift)

Compares a source manifest against a destination manifest:

```swift
struct ComparisonResult: Codable {
    let overallVerdict: Verdict            // PASS or FAIL
    let totalFileCountMatch: Bool
    let totalSizeMatch: Bool
    let perFileResults: [FileComparisonResult]
    let missingInDestination: [String]     // relative paths
    let extraInDestination: [String]       // relative paths
    let metadataDifferences: [MetadataDiff]
    let sourceManifestHash: String
    let destinationManifestHash: String
}

struct FileComparisonResult: Codable {
    let relativePath: String
    let sha256Match: Bool
    let sizeMatch: Bool
    let pathPresent: Bool
    let verdict: Verdict                   // PASS or FAIL
}

enum Verdict: String, Codable {
    case pass = "PASS"
    case fail = "FAIL"
}

struct MetadataDiff: Codable {
    let relativePath: String
    let field: String           // e.g., "modificationTime", "permissions"
    let sourceValue: String
    let destinationValue: String
    let severity: DiffSeverity  // informational or warning
}
```

**Comparison logic:**

1. **Total file count:** Count of regular files. Mismatch = FAIL.
2. **Total byte size:** Sum of regular file sizes. Mismatch = FAIL.
3. **Per-file SHA-256:** Every file present in both manifests must have matching SHA-256. Any mismatch = FAIL.
4. **Per-file size:** Every file must have matching size. Any mismatch = FAIL.
5. **Path presence:** Every source entry must exist in destination. Missing = FAIL.
6. **Extra entries in destination:** Logged as informational (e.g., .DS_Store files created by mount).
7. **Metadata differences:** Reported separately. Not a FAIL by default, but logged with full detail. Fields compared: modificationTime, permissions, owner, group, extendedAttributeNames (subset check), symlinkTarget.
8. **Access time is NOT compared** because the source walk itself may update it.

### 3.4 VerificationEngine (src/core/VerificationEngine.swift)

Orchestrates the full verification flow:

1. Build source manifest (pre-collection).
2. After collection, build destination manifest (from mounted sparsebundle).
3. Run ManifestComparer on the two manifests.
4. Skip `hdiutil verify` for writable sparsebundles (does not reliably cover them). Log the skip with reason. The manifest comparison is the sole integrity check.
5. Detect source changes during collection: re-hash source manifest metadata (not full re-hash of file contents, but check file sizes and modification times against the pre-collection manifest). If any source file changed during collection, flag it as CHANGED_DURING_COLLECTION.
6. Produce a VerificationReport.

### 3.5 AuditLog (src/core/AuditLog.swift)

Append-only, tamper-evident log with hash chaining.

```swift
struct AuditLogEntry: Codable {
    let sequenceNumber: UInt64
    let timestamp: Date                     // UTC
    let eventType: AuditEventType
    let details: [String: String]           // key-value details
    let previousEntryHash: String           // SHA-256 of previous entry (empty string for first)
    let entryHash: String                   // SHA-256 of this entry (computed over all fields except this one)
}

enum AuditEventType: String, Codable {
    case sessionStart
    case caseSetup
    case bundleCreated
    case bundleReused
    case sourceSelected
    case preflightCompleted
    case sourceManifestBuilt
    case collectionStarted
    case dittoInvocation
    case collectionCompleted
    case collectionCancelled
    case verificationStarted
    case verificationCompleted
    case bundleDetached
    case reportGenerated
    case sessionEnd
    case error
    case warning
}
```

**Required fields per log entry as applicable:**
- Tool name and version (DittoSuite version, git commit, build hash)
- Operator (examiner name)
- Host identifier (hostname, serial number)
- macOS version and build
- UTC timestamp with time source identification
- Legal authority type and reference
- Case/evidence IDs
- Invocation records (by reference to InvocationRecord ID)
- Hashes of manifests and reports
- Error details

**Implementation requirements:**

1. Write to a JSON Lines file (one JSON object per line).
2. Each entry includes `previousEntryHash` = SHA-256 of the previous entry's JSON. First entry uses empty string.
3. `entryHash` = SHA-256 of the entry JSON with `entryHash` field set to empty string.
4. File is opened in append-only mode. Never overwrite or delete entries.
5. Stored inside the sparsebundle (alongside collected evidence) and also exported with the report.

### 3.6 PreflightChecker (src/core/PreflightChecker.swift)

Runs before collection begins. Returns structured results for each check:

```swift
struct PreflightResult {
    let checks: [PreflightCheck]
    let overallReady: Bool              // true only if no blocking checks failed
}

struct PreflightCheck {
    let name: String
    let status: PreflightStatus         // pass, warn, fail
    let detail: String
    let blocking: Bool                  // if true, collection cannot proceed
}

enum PreflightStatus: String {
    case pass
    case warn
    case fail
}
```

**Checks to perform:**

| Check | Blocking? | Method |
|-------|-----------|--------|
| macOS version on validated allow-list | Configurable (warn or refuse) | `sw_vers` output compared to allow-list |
| macOS build recorded | No (always passes) | `sw_vers -buildVersion` |
| Full Disk Access status | Warn | Spot-check protected paths per selected source (attempt stat on known protected locations) |
| Source paths readable | Yes | `FileManager.isReadableFile` on each source |
| Destination volume mounted and writable | Yes | Check mount status and write test |
| Free space vs. estimated collection size | Yes (if insufficient) | Compare `FileManager.attributesOfFileSystem` available space to estimated size with 10% margin |
| Target sparsebundle attached and writable | Yes | Verify mount point exists and is writable |
| ditto binary exists and is executable | Yes | Check `/usr/bin/ditto` |
| hdiutil binary exists and is executable | Yes | Check `/usr/bin/hdiutil` |
| ditto binary SHA-256 recorded | No (always passes) | Hash binary |
| hdiutil binary SHA-256 recorded | No (always passes) | Hash binary |
| No duplicate or overlapping source selections | Yes | Check path containment |
| Source is not the destination volume | Yes | Compare device IDs |
| TCC-protected paths identified | Warn | Cross-reference selected paths against known TCC-protected locations |
| Sparsebundle band count | Warn (if >90,000) | Count files in bundle's bands/ directory; warn if approaching 100,000 threshold |
| Estimated band count for collection | Warn (if would exceed 100,000) | Estimate: (estimated total size / 8.4MB) + existing bands; warn if approaching limit |

### 3.7 ReportGenerator (src/core/ReportGenerator.swift)

Produces PDF and JSON reports.

**Report content (REQUIRED):**

1. **Header:** "DittoSuite Targeted Logical Collection Report" (NOT "forensic image")
2. **Scope statement:** "This is a targeted logical collection of user-selected files and folders. It is NOT a forensic image. Only the items listed below were collected."
3. **Case metadata:** examiner name, case ID, evidence ID, device description, legal authority type and reference, scope notes, UTC time source
4. **Environment:** macOS version and build, DittoSuite version, git commit, build hash, hostname, ditto SHA-256, hdiutil SHA-256
5. **Validated version status:** whether macOS version is on the validated allow-list
6. **Pre-flight results:** all checks with status
7. **Source selections:** each selected path with size estimate and file count
8. **Collection results per source:**
   - ditto invocation record (arguments, exit code, start/end time, duration)
   - Status: COMPLETE, PARTIAL (with reasons), FAILED (with reasons)
   - Per-file errors encountered
9. **Verification results:**
   - Source manifest summary (file count, total size, manifest hash)
   - Destination manifest summary (file count, total size, manifest hash)
   - Comparison verdict: PASS or FAIL
   - Per-source breakdown: total file count match, total size match, per-file SHA-256 results
   - Metadata differences (separate section)
   - hdiutil verify result (if applicable)
   - Source files changed during collection (if any)
10. **What was NOT collected:** items that failed, were skipped (with reasons), or were not selected
11. **Known limitations:** from integration profile (xattr incompleteness, directory hard links not preserved, etc.)
12. **Audit log hash:** SHA-256 of the complete audit log file
13. **Sparsebundle details:** path, filesystem, size, band size, volume name

---

## 4. EVIDENCE HANDLING

### 4.1 Source immutability

1. **ditto reads source files but does not write to them.** This is implicit in the man page (no documented source writes). MUST-TEST-EMPIRICALLY that no source file metadata changes occur.
2. **Access-time changes:** macOS APFS may or may not update atime on read. The source manifest records atime before collection. Post-collection, a lightweight re-check of source file sizes and mtimes detects substantive changes. Atime changes are documented as a known, unavoidable side effect of reading source files and are NOT treated as evidence modification.
3. **DittoSuite never opens source files for writing.** The ManifestBuilder uses read-only access. No adapter writes to source paths.
4. **Audit log documents:** the pre-collection source manifest hash, any source changes detected during collection, and the post-collection verification result.

### 4.2 Hashing strategy

| When | What | Hash |
|------|------|------|
| Session start | `/usr/bin/ditto` binary | SHA-256 |
| Session start | `/usr/bin/hdiutil` binary | SHA-256 |
| Pre-collection | Every source file (streaming) | SHA-256 |
| Pre-collection | Source manifest (canonical JSON) | SHA-256 |
| Per invocation | Raw stdout of each ditto/hdiutil call | SHA-256 |
| Per invocation | Raw stderr of each ditto/hdiutil call | SHA-256 |
| Post-collection | Every file in mounted sparsebundle | SHA-256 |
| Post-collection | Destination manifest (canonical JSON) | SHA-256 |
| Post-collection | Comparison result | SHA-256 |
| Close-out | Complete audit log file | SHA-256 |

### 4.3 Independent verification

The verification is independent of ditto's success reporting:

1. **Pre-collection:** ManifestBuilder walks each source read-only, recording every file with SHA-256, size, path, type, timestamps, permissions, extended attribute names, symlink targets, and hard-link relationships. This is the ground truth.
2. **Post-collection:** ManifestBuilder walks the mounted sparsebundle contents with the same algorithm and fields.
3. **Comparison:** ManifestComparer compares the two manifests. Criteria:
   - Total file count: must match. Mismatch = FAIL.
   - Total byte size: must match. Mismatch = FAIL.
   - Per-file SHA-256: must match. Any mismatch = FAIL.
   - Per-file size: must match. Any mismatch = FAIL.
   - Path presence: every source entry must appear in destination. Missing = FAIL.
4. **hdiutil verify:** Run on the container if applicable (may not work on writable sparsebundles -- see Open Question 4). This checks container-level integrity, not file-level.
5. **Source change detection:** After collection, re-stat source files (size and mtime only -- not full re-hash). Any change from the pre-collection manifest is flagged as CHANGED_DURING_COLLECTION. The report notes which files changed and that their SHA-256 in the pre-collection manifest may not match their current state.

### 4.4 Failure behavior

1. **Any verification FAIL:** The overall collection is marked FAIL. The report clearly states what failed and why. Evidence is preserved (not deleted) for examiner review.
2. **Partial collection:** If ditto exits non-zero but copied some files, the collection is marked PARTIAL. The verification still runs and reports what was and was not successfully copied.
3. **Cancelled collection:** Marked CANCELLED. Verification runs on what was copied. Report clearly states the collection is incomplete.

---

## 5. SAFE INVOCATION

### 5.1 Argument construction

1. **Argument arrays only.** All subprocess invocations use `Process.arguments` as `[String]`. NEVER construct a shell command string.
2. **No shell interpretation.** Do not use `/bin/sh -c` or any shell wrapper.
3. **Path validation:** All paths are validated for:
   - Absolute (must start with `/`)
   - No null bytes
   - No path traversal beyond the expected root (for destination paths within the mounted sparsebundle)
4. **Leading-dash protection:** Source and destination paths that begin with `-` are prefixed with `./` or the full absolute path is used.

### 5.2 Environment

Scrub the process environment to:
```
PATH=/usr/bin:/bin:/usr/sbin:/sbin
HOME=<user home>
TMPDIR=<system tmpdir>
LC_ALL=en_US.UTF-8
TZ=UTC
```
Explicitly remove: `DITTONORSRC`, `DITTOABORT`, `DYLD_*`, `LD_*`, `CFNETWORK_*`, `NSUnbufferedIO`, and any other variables not in the allow-list.

### 5.3 Binary verification

Before first invocation in a session:
1. Verify `/usr/bin/ditto` exists, is a regular file (not a symlink to an unexpected location), and is executable.
2. Compute SHA-256 of `/usr/bin/ditto`.
3. Same for `/usr/bin/hdiutil`.
4. Record in the audit log.
5. If the binary hash changes mid-session (checked before each invocation if paranoid mode is enabled), abort and log a CRITICAL error.

### 5.4 Timeouts

| Operation | Default timeout | Notes |
|-----------|----------------|-------|
| ditto copy (per source) | 3600s (1 hour) | Adjustable. Large sources may need more. |
| hdiutil create | 300s (5 minutes) | |
| hdiutil attach | 120s (2 minutes) | |
| hdiutil detach | 120s (2 minutes) | |
| hdiutil verify | 1800s (30 minutes) | Large bundles take time |

On timeout: SIGTERM, wait 5s, SIGKILL. Mark `timedOut = true` in InvocationRecord. Log as ERROR.

---

## 6. VERSION POLICY

### 6.1 Validated allow-list

```swift
static let validatedMacOSVersions: [String] = [
    // Add validated versions after empirical testing
    // Format: "major.minor" (e.g., "14.5")
]
```

The allow-list starts empty. It is populated during validation testing on each macOS version/build. Each validated version entry records the macOS version, build number, ditto SHA-256, and hdiutil SHA-256.

### 6.2 Enforcement

At preflight:
1. Read `sw_vers -productVersion` and `sw_vers -buildVersion`.
2. Compare against the validated allow-list.
3. If the version is NOT on the list:
   - **Default policy: WARN.** Display a warning. Allow the examiner to proceed. Log the warning in the audit log.
   - **Strict policy: REFUSE.** Block collection. Require the version to be added to the allow-list after validation testing.
   - The policy is configurable in the app settings.
4. If the version IS on the list, log PASS.

---

## 7. ERROR HANDLING

### 7.1 Principle: nothing fails silently

Every error is:
1. Logged in the audit log with: timestamp, error type, path (if applicable), error message, errno (if applicable), context (which operation was running).
2. Displayed in the UI.
3. Included in the final report.

### 7.2 Error catalog

| Error | Detection | Response | Report label |
|-------|-----------|----------|--------------|
| ditto non-zero exit | `exitCode != 0` | Mark source PARTIAL or FAILED. Continue to next source. | PARTIAL / FAILED |
| ditto "Operation not permitted" | Substring in stderr | Flag as TCC denial. List affected paths. Warn examiner about FDA. | PARTIAL (TCC) |
| ditto "Permission denied" | Substring in stderr | Flag as POSIX permission denial. List affected paths. | PARTIAL (permissions) |
| ditto "No such file or directory" | Substring in stderr | Flag as missing source. May indicate file deleted during collection. | PARTIAL (missing) |
| ditto timeout | `timedOut == true` | Kill process. Mark source FAILED (timeout). | FAILED (timeout) |
| hdiutil create failure | `exitCode != 0` | Abort workflow. Display error. | FAILED (bundle creation) |
| hdiutil attach failure | `exitCode != 0` | Abort collection. Display error. | FAILED (attach) |
| hdiutil detach failure | `exitCode != 0` | Warn. Offer force detach. | WARNING |
| hdiutil verify failure | `exitCode != 0` | Mark container verification FAIL. Independent manifest comparison still runs. | FAIL (container) |
| Source file changed during collection | Size or mtime differs from pre-collection manifest | Flag specific files. | CHANGED_DURING_COLLECTION |
| Destination full | ditto stderr or write failure | Stop collection. Mark PARTIAL. | PARTIAL (space) |
| Manifest comparison FAIL | Any FAIL criterion in ManifestComparer | Mark overall verification FAIL. | FAIL (verification) |
| Unsupported macOS version | Not in allow-list | Warn or refuse per policy. | WARNING / BLOCKED |
| Duplicate source selection | Path containment check | Remove duplicates. Log. | WARNING |
| Source is destination | Device ID comparison | Block. | BLOCKED |
| Bundle attach fails verification | hdiutil verify non-zero when reusing | Block reuse. Require new bundle. | BLOCKED |

### 7.3 Partial collection handling

1. A collection is PARTIAL if any source item was not fully copied.
2. The report explicitly lists what was and was not collected.
3. The verification runs on whatever was collected.
4. The audit log records the partial status and reasons.

---

## 8. AUDIT LOG TAMPER EVIDENCE

### 8.1 Hash chaining

Each entry's `entryHash` is computed as:
1. Serialize the entry to canonical JSON with `entryHash` set to empty string.
2. Compute SHA-256 of that JSON.
3. Store the result as `entryHash`.

Each entry's `previousEntryHash` is the `entryHash` of the prior entry. First entry uses empty string.

### 8.2 Verification

To verify the chain:
1. For each entry, recompute the hash (set `entryHash` to empty string, serialize, hash).
2. Confirm it matches the stored `entryHash`.
3. Confirm `previousEntryHash` matches the prior entry's `entryHash`.
4. Any break in the chain indicates tampering or corruption.

---

## 9. DETERMINISM

### 9.1 Deterministic outputs

Given the same source files at the same state:
- Source manifest entries are sorted by `relativePath` (lexicographic, Unicode-aware).
- Destination manifest entries are sorted the same way.
- Comparison results are deterministic.
- Report content is deterministic except for documented nondeterministic fields.

### 9.2 Documented nondeterministic fields

- Timestamps (session start/end, invocation times): vary per run.
- Invocation record UUIDs: generated per run.
- Audit log sequence numbers and hashes: depend on timestamps.
- ditto stdout/stderr: may vary in ordering for parallel operations (but DittoSuite runs ditto sequentially per source).

---

## 10. DATA EGRESS

### 10.1 No network calls

DittoSuite makes NO network calls during evidence processing:
- No telemetry
- No update checks
- No cloud uploads
- No analytics
- No DNS lookups
- No NTP calls (use system clock; document time source)

### 10.2 No credential storage

- DittoSuite does not handle credentials, passwords, or keychains.
- Encrypted sparsebundle passphrases are entered by the examiner at creation time and passed to hdiutil via `-stdinpass`. They are NEVER logged, stored, or included in reports.

### 10.3 Implementation verification

- The app's `Info.plist` should declare `NSAllowsArbitraryLoads = NO` and include no network entitlements beyond what macOS requires.
- App Transport Security should be maximally restrictive.
- The Tester should verify no network calls occur during a collection run (e.g., using `nettop` or network monitoring).

---

## 11. WORKFLOW DETAIL

### 11.1 Step 1: Case Setup (CaseSetupView)

**Required fields (must be completed before proceeding):**
- Examiner name (free text, non-empty)
- Case ID (free text, non-empty)
- Evidence ID (free text, non-empty)
- Device description (free text, non-empty)
- Legal authority type (enum: warrant, consent, court order, administrative order, policy/internal, other)
- Legal authority reference (free text, non-empty)
- Scope notes (free text, may be empty)
- UTC time source (auto-filled with system NTP status; examiner can add notes)

**On completion:** Log `caseSetup` audit entry with all fields.

### 11.2 Step 2: Bundle Setup (BundleSetupView)

**Options:**
- Create new sparsebundle:
  - Name (auto-suggested from case/evidence ID)
  - Location (folder picker; default Desktop or user-chosen)
  - Filesystem (picker: APFS default, JHFS+, HFS+)
  - Maximum size (text field with unit picker: MB, GB, TB)
  - Free-space pre-check (computed and displayed)
  - Encryption (optional; AES-256 with passphrase)
- Reuse existing DittoSuite-created bundle:
  - Must pass `hdiutil verify` (if applicable)
  - Must have a valid DittoSuite audit log inside
  - Documented as reused in the audit log

**On create:** Run HdiutilAdapter.createSparsebundle. Log `bundleCreated` with full invocation record.

### 11.3 Step 3: Source Selection (SourceSelectionView)

**Interface:**
- macOS file/folder open panel (NSOpenPanel) for quick selection
- Browsable tree view of connected volumes (using FileManager directory enumeration)
- Selected items shown in a persistent list (always visible)
- Per-item: path, estimated size, estimated file count
- Remove button per item
- Duplicate and overlap detection (warn and de-duplicate)
- Check: source path is not on the destination volume (block if so)

**On completion:** Log `sourceSelected` for each source with path and estimate.

### 11.4 Step 4: Pre-flight (PreflightView)

Run all PreflightChecker checks. Display results with PASS/WARN/FAIL indicators.

- If any blocking check fails: disable "Proceed" button. Show resolution guidance.
- If warnings only: allow proceed with acknowledgment.
- All results logged as `preflightCompleted` audit entry.

### 11.5 Step 5: Pre-collection Source Manifest

- For each selected source, run ManifestBuilder.
- Show progress (file count, current path).
- On completion, display summary: total files, total size, total directories, total symlinks.
- Log `sourceManifestBuilt` with manifest hash.
- If any errors during manifest building (permission denied, etc.), display them. Allow examiner to proceed (partial manifest) or go back to fix.

### 11.6 Step 6: Collection (CollectionProgressView)

- Attach the sparsebundle (HdiutilAdapter.attach).
- For each selected source, sequentially:
  - Create the destination directory inside the mounted sparsebundle.
  - Run DittoAdapter.copy with `-V` flag for per-file output.
  - Parse stderr for progress (file paths being copied) and display.
  - Log `dittoInvocation` with full InvocationRecord.
- Show live progress: current source, files copied count, elapsed time.
- Cancel button: on cancel, kill current ditto process (SIGTERM then SIGKILL). Mark as CANCELLED. Proceed to verification of what was collected.
- On completion of all sources, log `collectionCompleted`.

### 11.7 Step 7: Post-collection Verification (VerificationView)

- Build destination manifest (ManifestBuilder on mounted sparsebundle contents).
- Run ManifestComparer (source manifest vs. destination manifest).
- Run hdiutil verify on the sparsebundle (if applicable).
- Re-stat source files to detect changes during collection.
- Display results:
  - Per-source: PASS or FAIL with details
  - Overall: PASS or FAIL
  - Metadata differences (informational section)
  - Source files changed during collection (if any)
- Log `verificationCompleted` with all results.

### 11.8 Step 8: Close-out

- **Post-collection band count check:** Count files in the bundle's `bands/` directory. If count exceeds 90,000, warn the examiner (100,000 is the failure threshold under HFS+/APFS). Log the count.
- Detach the sparsebundle (HdiutilAdapter.detach). **Verify clean detach:** if detach fails, log as CRITICAL error. Offer force detach only with examiner acknowledgment. An unclean detach risks corrupting the bundle (mid-write disconnection can flip it to permanent read-only or make it unmountable).
- After detach, record final state in audit log.
- Hash the complete contents manifest.
- **No further writes to the bundle after this point.** The detached bundle is the preserved original. No compaction, resizing, or modification.
- Log `bundleDetached` and `sessionEnd`.

### 11.9 Step 9: Results and Report (ResultsView)

- Display full results:
  - What WAS collected (with verification status per source)
  - What was NOT collected (with reasons: failed, skipped, not selected)
- Export buttons:
  - PDF report (via ReportGenerator)
  - JSON report (via ReportGenerator)
  - Audit log (JSON Lines file)
- Log `reportGenerated` with report hash.

---

## 12. EDGE CASES

### 12.1 Filename edge cases

| Case | Handling |
|------|----------|
| Spaces in paths | Argument array (not shell string) handles automatically |
| Quotes in filenames | Argument array handles automatically |
| Newlines in filenames | Argument array handles automatically; manifest uses escaped JSON strings |
| Leading dashes | Use absolute paths (starting with `/`) |
| Unicode NFC/NFD | Record raw bytes; comparison uses byte-level equality; document normalization as known limitation if filesystem normalizes |
| Null bytes | Reject paths containing null bytes at input validation |
| Very long paths | Pass through to ditto; report ditto errors if path too long |

### 12.2 Filesystem edge cases

| Case | Handling |
|------|----------|
| Symlinks | ManifestBuilder uses `lstat`; records as symlink with target. ditto copies symlinks as links during traversal. Verify symlink targets match. |
| Hard links | ManifestBuilder records inode number and nlink count. Verify hard link groups are preserved (same inode in destination). |
| Sparse files | Record apparent size. MUST-TEST-EMPIRICALLY whether ditto preserves sparseness. Report actual vs. apparent size difference as informational. |
| Very large files (>4GB) | No special handling; streaming hash and ditto handle large files. Test empirically. |
| Extended attributes | Record xattr names in manifest. MUST-TEST-EMPIRICALLY which xattrs are preserved. Document known limitations in report. |
| Resource forks | ditto preserves by default (--rsrc). Verify resource fork data in destination. |
| ACLs | ditto preserves by default (--acl). MUST-TEST-EMPIRICALLY whether ACLs are fully preserved on APFS volumes inside sparsebundles. |

### 12.3 Runtime edge cases

| Case | Handling |
|------|----------|
| File modified during collection | Detected by post-collection source re-stat. Flagged in report. |
| File deleted during collection | ditto reports error; logged. Manifest comparison shows missing file. |
| Destination runs out of space | ditto fails; exit code non-zero. Mark PARTIAL. |
| Cancellation mid-run | Kill ditto. Mark CANCELLED. Verify what was copied. |
| ditto non-zero exit with partial output | Mark PARTIAL. Run verification on what exists. |
| Bundle fails to attach | Abort collection. Report error. |
| Bundle fails to verify | Mark container FAIL. Manifest comparison still runs. |
| Duplicate selections | De-duplicate at selection time. Warn user. |
| Overlapping paths (parent + child) | Detect at selection time. Keep only the parent. Warn user. |
| Source is destination | Block at preflight. Compare device IDs. |

---

## 13. COMPLIANCE MATRIX

| Req ID | Requirement | Standard/Rule | Spec Section | Test |
|--------|-------------|---------------|-------------|------|
| FR-01 | Never modify source | ISO 27037 s7.1.1; ACPO Principle 1 | 4.1 | Source hash before/after; atime documented |
| FR-02 | SHA-256 for all integrity hashing | NIST SP 800-86 s4.3 | 4.2 | Hash correctness against known values |
| FR-03 | Independent verification (not trusting ditto alone) | ISO 27041 s7; SWGDE best practice | 4.3 | Corrupt destination file; verify detection |
| FR-04 | No silent skips | ISO 27037 s7.1.2.4 | 7.1, 7.3 | Permission denied logged; partial labeled |
| FR-05 | Append-only tamper-evident audit log | ISO 27037 s7.2; FRE 901 | 8 | Chain verification; tamper detection test |
| FR-06 | UTC timestamps with time source | ISO 27037 s7.1.1 | 3.5, 11.1 | Verify UTC in log; time source recorded |
| FR-07 | Record upstream tool version/hash | ISO 27041 s7; forensic-requirements.md s5 | 5.3 | Binary hash in invocation record |
| FR-08 | Record exact invocation | forensic-requirements.md s5 | 2.1 | InvocationRecord completeness test |
| FR-09 | Argument arrays only (no shell) | forensic-requirements.md s5 | 5.1 | Code review; injection test with special chars |
| FR-10 | Scrubbed environment | forensic-requirements.md s5 | 5.2 | Verify env in invocation record |
| FR-11 | Validated version allow-list | forensic-requirements.md s5 | 6 | Unvalidated version triggers warn/refuse |
| FR-12 | Explicit timeouts | forensic-requirements.md s5 | 5.4 | Timeout test (mock slow process) |
| FR-13 | Partial results explicitly labeled | forensic-requirements.md s1 | 7.3 | Partial copy labeled in report |
| FR-14 | Legal authority recorded before collection | forensic-requirements.md s6 | 11.1 | Required field validation test |
| FR-15 | Report states targeted logical collection, not forensic image | forensic-requirements.md s6 | 3.7 | Report content assertion |
| FR-16 | No network/telemetry during evidence processing | forensic-requirements.md s6 | 10 | Network monitoring test |
| FR-17 | No credential storage | forensic-requirements.md s6 | 10.2 | Code review; no secrets in logs |
| FR-18 | No bypassing access controls | forensic-requirements.md s6 | 5 (TCC) | TCC denial properly reported |
| FR-19 | Deterministic output | forensic-requirements.md s3 | 9 | Same input twice = same manifests |
| FR-20 | Detect source changes during collection | forensic-requirements.md s1 | 4.3 step 5 | Modify source during collection; detect |
| FR-21 | Sparsebundle creation recorded | forensic-requirements.md s2 | 11.2, 2.3 | Invocation record for create |
| FR-22 | Pre-flight checks | forensic-requirements.md s5 | 3.6 | Each check tested individually |
| FR-23 | Report what was and was not collected | forensic-requirements.md s6 | 3.7, 11.9 | Report content assertion |
| FR-24 | Per-file verification (SHA-256) | ISO 27037; NIST CFTT | 3.3, 4.3 | Known file hash comparison |
| FR-25 | File count verification | ISO 27037 | 3.3 | Count match assertion |
| FR-26 | Size verification | ISO 27037 | 3.3 | Size match assertion |
| FR-27 | Metadata difference reporting | SWGDE best practice | 3.3 | Metadata diff in report |
| FR-28 | Bundle reuse requires verification | forensic-requirements.md s1 | 11.2 | Reuse without verify = blocked |
| FR-29 | Free-space pre-check | operational best practice | 3.6 | Insufficient space = fail |
| FR-30 | Cancel produces labeled partial | operational best practice | 12.3 | Cancel test |
| FR-31 | Raw stdout/stderr captured and hashed | forensic-requirements.md s5 | 2.1 | Verify capture in invocation record |
| FR-32 | hdiutil verify on container | forensic-requirements.md s1 | 4.3 | Verify invocation recorded |

---

## 14. VALIDATION PLAN

### 14.1 Synthetic test fixtures

All test data is synthetic. Created programmatically in `tests/fixtures/` generation scripts.

**Fixture set A: Basic files**
- Regular files of various sizes: 0 bytes, 1 byte, 1KB, 1MB, 100MB, 1GB
- Files with known SHA-256 (computed independently)

**Fixture set B: Metadata**
- Files with known extended attributes (set via `xattr -w`)
- Files with known ACLs (set via `chmod +a`)
- Files with resource forks (set via `xattr -w com.apple.ResourceFork`)
- Files with quarantine flags (set via `xattr -w com.apple.quarantine`)
- Files with known permissions (0o644, 0o755, 0o000, 0o4755 setuid)

**Fixture set C: Special names**
- Filenames with: spaces, quotes (single and double), newlines, tabs
- Filenames with Unicode: NFC and NFD variants of the same visual character
- Filenames starting with `-`, `--`, `.`
- Very long filenames (255 bytes)

**Fixture set D: Links and structure**
- Symlinks (relative and absolute targets)
- Hard links (multiple names for same inode)
- Nested directory hierarchies (10+ levels deep)
- Empty directories

**Fixture set E: Edge cases**
- Sparse file (created with `dd` or `truncate`)
- File that changes during copy (background process modifying it)
- Permission-denied file (chmod 000)

### 14.2 Upstream characterization tests

For every MUST-TEST-EMPIRICALLY item in the integration profile:

| Test | Method | Expected |
|------|--------|----------|
| Timestamp preservation | Set known mtime/atime/birthtime; copy; compare | Document actual behavior |
| Extended attribute preservation | Set known xattrs; copy; list xattrs on copy | Document which are preserved |
| ACL preservation | Set known ACLs; copy; compare | Document actual behavior |
| Resource fork preservation | Set resource fork; copy; compare bytes | Document actual behavior |
| Quarantine flag preservation | Set quarantine; copy; compare | Document actual behavior |
| Symlink handling | Create symlink; copy; verify it's a symlink with correct target | Document actual behavior |
| Hard link preservation | Create hard links; copy; check inode identity | Document actual behavior |
| Unicode NFC/NFD | Create NFC and NFD filenames; copy; compare byte-level names | Document actual behavior |
| Sparse file handling | Create sparse file; copy; compare allocated blocks and content | Document actual behavior |
| Source atime change | Record source atime; run ditto; check source atime again | Document actual behavior |
| ditto exit code on partial failure | Deny permission on one file; run ditto; check exit code | Document actual behavior |
| ditto stderr format on TCC denial | Run without FDA on protected path; capture stderr | Document actual format |
| hdiutil verify on writable sparsebundle | Create writable bundle; run verify; check result | Document actual behavior |
| hdiutil attach -plist output keys | Attach; capture plist; document keys | Document actual schema |
| hdiutil exit codes | Test success and failure cases | Document actual codes |

### 14.3 Wrapper-vs-manual equivalence tests

1. Create fixture set A.
2. Manually run `/usr/bin/ditto` with the same flags DittoSuite would use.
3. Run DittoSuite on the same fixtures.
4. Compare: destination file content hashes, file counts, directory structure.
5. Assert equivalence (or document each difference).

### 14.4 Negative tests

| Test | Input | Expected |
|------|-------|----------|
| Corrupt destination detected | After copy, modify one destination file byte | Verification FAIL |
| Truncated destination detected | After copy, truncate one destination file | Verification FAIL |
| Missing destination file detected | After copy, delete one destination file | Verification FAIL |
| ditto success but bad copy | Mock: exit 0 but incomplete copy | Verification FAIL (independent check catches it) |
| Permission denied logged | Source file chmod 000 | Error in log; PARTIAL |
| TCC denial logged | Protected path without FDA | Error in log; PARTIAL |
| Unsupported version handled | Set version outside allow-list | Warn or refuse per policy |
| Timeout handled | Mock slow process | timedOut in record; FAILED |
| Destination full | Fill destination during copy | PARTIAL with reason |
| Shell injection blocked | Filename with `$(command)` or backticks | No execution; correct copy |
| Audit log tamper detected | Modify one log entry | Chain verification fails |
| Bundle creation fails | Invalid path | Error reported; workflow stops |
| Source is destination | Select bundle's mount point as source | Blocked at preflight |

### 14.5 Pass/fail criteria

- All non-platform-specific tests must PASS.
- Platform-specific tests (requiring macOS) are marked NOT RUN if the test environment is not macOS. They MUST be run on macOS before any production use.
- Upstream characterization tests produce FINDINGS (documented behavior), not PASS/FAIL. The findings inform the known limitations section of the report.
- Any silent skip, unlogged error, or incorrect verification result is a FAIL.

### 14.6 Known limitations to document

1. ditto does not preserve directory hard links (DOCUMENTED in man page).
2. ditto may not preserve all extended attributes, especially system-protected ones (Apple DTS forums/thread/761587).
3. Source atime may change during collection (depends on mount options; MUST-TEST-EMPIRICALLY).
4. This is a logical targeted collection, not a forensic image. Files not selected are not collected.
5. hdiutil verify may not work on writable sparsebundles (MUST-TEST-EMPIRICALLY).
6. Unicode filename normalization may occur on APFS (MUST-TEST-EMPIRICALLY).
7. Sparse file sparseness may not be preserved (MUST-TEST-EMPIRICALLY).
8. APFS sparsebundle free-space reporting may be inaccurate on small bundles.
9. hdiutil is deprecated in macOS 27.

---

## 15. PATTERNS AND REFERENCES

### 15.1 Existing patterns to follow

This is the first tool in the pipeline. No existing adapter or core files to copy from. The patterns defined in this spec become the reference for future tools.

### 15.2 Coding conventions

- **Language:** Swift 5.9+ / SwiftUI
- **Minimum deployment:** macOS 14.0 (Sonoma)
- **Dependencies:** Only Apple frameworks (Foundation, CryptoKit, SwiftUI, UniformTypeIdentifiers). No third-party dependencies for evidence-touching code.
- **Error handling:** Swift `throws` with typed errors. No force unwraps in evidence paths. No `try?` that silently discards errors.
- **Concurrency:** Swift structured concurrency (`async/await`, `Task`). Subprocess management via `Process`.
- **Comments:** Every forensic-sensitive decision has a `// WHY:` comment explaining the rationale for opposing-expert review.
- **Testing framework:** XCTest. Tests in `tests/` mirroring `src/` structure.
