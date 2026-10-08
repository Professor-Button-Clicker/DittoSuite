# Integration Profile: ditto and hdiutil (macOS System Binaries)

**Date:** 2026-10-08
**Author:** Planner Agent
**Purpose:** Upstream tool characterization for DittoSuite forensic collection wrapper

---

## 1. TOOL OVERVIEW

### 1.1 ditto (/usr/bin/ditto)

**What it is:** macOS system utility for copying files and directories while preserving metadata. It is the Apple-recommended tool for copying file hierarchies with resource forks, extended attributes, ACLs, and HFS metadata. It replaces `cp` for forensic-quality copies on macOS.

**Interface:** Command-line, invoked as a subprocess.

**Primary invocation pattern for DittoSuite:**
```
/usr/bin/ditto [options] <source_path> <destination_path>
```

**Key flags (DOCUMENTED -- from Apple man page via ss64.com, unix.com, manpagez.com):**

| Flag | Purpose | Default |
|------|---------|---------|
| `--rsrc` | Preserve resource forks and HFS metadata | ON (since 10.4) |
| `--norsrc` | Skip resource forks/HFS metadata; implies `--noextattr --noacl` unless overridden | OFF |
| `--extattr` | Preserve extended attributes | ON (since 10.5) |
| `--noextattr` | Skip extended attributes | OFF |
| `--qtn` | Preserve quarantine information | ON (since 10.5) |
| `--noqtn` | Skip quarantine information | OFF |
| `--acl` | Preserve ACLs | ON (since 10.5) |
| `--noacl` | Skip ACLs | OFF |
| `--nocache` | Bypass Unified Buffer Cache for reads/writes | OFF |
| `-V` | Print one line per file/symlink/device to stderr | OFF |
| `-X` | Do not descend into directories on different device IDs | OFF |
| `--keepParent` | Embed source directory name (archive mode); for copies, avoids merge behavior | OFF |
| `--bom <bom>` | Copy only items listed in BOM file | N/A |
| `--hfsCompression` | Compress content on HFS+ (10.6+) | OFF |
| `--preserveHFSCompression` | Keep existing HFS+ compression | ON |
| `--persistRootless` | Keep SF_RESTRICTED flag and com.apple.rootless xattr | -- |

**Version identification:** ditto does not have its own version number. The version is tied to the macOS version and build. Record the macOS version (`sw_vers -productVersion`), build (`sw_vers -buildVersion`), and SHA-256 of `/usr/bin/ditto`.

### 1.2 hdiutil (/usr/bin/hdiutil)

**What it is:** macOS system utility for creating, manipulating, attaching, detaching, and verifying disk images including sparsebundles. It is the standard tool for programmatic disk image management.

**DEPRECATION NOTICE:** In macOS 27.0 (Golden Gate), hdiutil is deprecated. Apple directs users to `diskutil image` for all disk image operations. hdiutil continues to function; removal date is not announced. See Section 8 for macOS 27 strategy.

**Interface:** Command-line with subcommands, invoked as a subprocess.

**Key subcommands for DittoSuite:**

| Subcommand | Purpose |
|------------|---------|
| `create` | Create a new disk image (sparsebundle) |
| `attach` | Attach and mount a disk image |
| `detach` | Detach (eject) a mounted disk image |
| `verify` | Verify an image's checksum |
| `info` | Report on attached images |
| `compact` | Remove unused bands from sparsebundle |

**Key flags for `create` (DOCUMENTED -- from Xcode man page mirror at keith.github.io):**

| Flag | Purpose |
|------|---------|
| `-type SPARSEBUNDLE` | Create a sparsebundle (directory of band files) |
| `-fs APFS` | APFS filesystem (default since macOS 11.0) |
| `-fs JHFS+` | Journaled HFS+ filesystem |
| `-size <n>g` | Maximum virtual size |
| `-volname <name>` | Volume name |
| `-imagekey sparse-band-size=<sectors>` | Band size in 512-byte sectors (default 16384 = 8MB) |
| `-plist` | Machine-readable plist output |
| `-ov` | Overwrite existing image |
| `-encryption AES-256` | Encrypt with AES-256 |
| `-stdinpass` | Read passphrase from stdin |

**Key flags for `attach` (DOCUMENTED):**

| Flag | Purpose |
|------|---------|
| `-mountpoint <path>` | Specify mount point (single volume only) |
| `-nobrowse` | Do not show in Finder |
| `-plist` | Machine-readable plist output |
| `-readonly` | Attach read-only |
| `-readwrite` | Attach read-write |
| `-noverify` | Skip verification on attach |
| `-noautofsck` | Skip auto filesystem check |
| `-owners on` | Honor on-disk ownership |

**Key flags for `detach` (DOCUMENTED):**

| Flag | Purpose |
|------|---------|
| `-force` | Force detach even with open files |

**Key flags for `verify` (DOCUMENTED):**

| Flag | Purpose |
|------|---------|
| `-plist` | Machine-readable output |

**Machine-readable output:** Both `create` and `attach` support `-plist` which produces XML plist output. For `attach`, the output includes a `system-entities` array with `dev-entry` and `mount-point` keys (MUST-TEST-EMPIRICALLY for exact key names and structure on each supported version).

**Version identification:** hdiutil does not expose its own version. Record macOS version, build, and SHA-256 of `/usr/bin/hdiutil`.

---

## 2. METADATA PRESERVATION (ditto)

Each item below is classified as DOCUMENTED (with source citation) or MUST-TEST-EMPIRICALLY.

### 2.1 Items with documentation

| Item | Status | Notes | Source |
|------|--------|-------|--------|
| **File mode (permissions)** | DOCUMENTED | "Copied items keep their mode" | unix.com man page |
| **Access time** | DOCUMENTED | "access time, modification time" preserved | unix.com man page, manpagez.com section 8 |
| **Modification time** | DOCUMENTED | "access time, modification time" preserved | unix.com man page |
| **Owner** | DOCUMENTED | "owner, and group" preserved | unix.com man page |
| **Group** | DOCUMENTED | "owner, and group" preserved | unix.com man page |
| **setuid/setgid** | DOCUMENTED | "preserved only when running as superuser" | unix.com man page |
| **Resource forks** | DOCUMENTED | Via `--rsrc` (default ON since 10.4) | ss64.com, unix.com man page |
| **Extended attributes** | DOCUMENTED | Via `--extattr` (default ON since 10.5) | ss64.com, unix.com man page |
| **ACLs** | DOCUMENTED | Via `--acl` (default ON since 10.5) | ss64.com, unix.com man page |
| **Quarantine flags** | DOCUMENTED | Via `--qtn` (default ON since 10.5) | ss64.com man page |
| **Symlinks (traversal)** | DOCUMENTED | "Symlinks passed as arguments are followed; symlinks found during traversal are copied as links" | unix.com man page |
| **File hard links** | DOCUMENTED | "File hard links are preserved" | unix.com man page |
| **Directory hard links** | DOCUMENTED | "directory hard links are not" preserved | unix.com man page |
| **Exit code** | DOCUMENTED | "Returns 0 if everything was copied; otherwise non-zero" | unix.com man page |
| **Skipped types** | DOCUMENTED | "Pipes, sockets, and files named .nfs* or .afpDeleted* are skipped" | unix.com man page |

### 2.2 Items that MUST-TEST-EMPIRICALLY

| Item | Why | Test approach |
|------|-----|---------------|
| **Creation time (birthtime)** | Not mentioned in any man page version found | Compare `stat -f "%B"` source vs. copy |
| **Extended attribute completeness** | Apple DTS states `--extattr` "has never captured all xattrs" -- some protected xattrs silently dropped (forums/thread/761587) | Set known xattrs, copy, compare with `xattr -l` |
| **com.apple.quarantine specifics** | `--qtn` documented, but exact preservation of quarantine flag bytes untested | Set quarantine via xattr, copy, compare bytes |
| **com.apple.rootless** | Protected; ditto returns "Operation not permitted" on datavault directories (forums/thread/761587) | Test on non-protected path with SF_RESTRICTED |
| **Unicode filename normalization (NFC/NFD)** | Not mentioned in man page; macOS filesystems may normalize | Create files with NFC and NFD names, copy, compare byte-level filenames |
| **Sparse files** | Not mentioned in man page | Create sparse file, copy, compare allocated blocks and data |
| **Very large files (>4GB, >8GB)** | `--segmentLargeFiles` exists for CPIO, but direct copy behavior undocumented for large files | Copy files of various sizes, verify integrity |
| **Files with special characters** | Spaces, quotes, newlines, null bytes in names | Create fixtures, copy, verify |
| **Leading-dash filenames** | Could be misinterpreted as flags | Create `--test` file, copy |
| **Timestamps on APFS vs. HFS+** | APFS supports nanosecond timestamps; preservation fidelity undocumented | Compare nanosecond-precision timestamps |
| **Access-time changes on source** | Whether reading source files updates atime | Check source atime before and after ditto run |
| **Behavior with noatime mounts** | APFS default mount options affect atime | Test with default and custom mount options |
| **Per-file error continuation** | Man page says "ditto tries to continue past [errors]" but behavior with partial permission denial is not specified in detail | Deny permission on one file in a tree, verify rest copied and error logged |
| **Behavior when destination fills** | Not documented | Fill destination during copy, check exit code and stderr |
| **HFS+ compression preservation on APFS** | `--preserveHFSCompression` default behavior on APFS destination | Copy HFS+-compressed file to APFS volume |
| **Concurrent modification handling** | Whether ditto detects files changed during copy | Modify source file during copy, check result |
| **Behavior with xattr size limits** | Whether large xattrs are silently truncated | Set large xattr, copy, compare |

---

## 3. METADATA PRESERVATION (hdiutil sparsebundle)

### 3.1 Documented behavior

| Item | Status | Source |
|------|--------|--------|
| **Sparsebundle band structure** | DOCUMENTED | Default 8MB bands (16384 sectors x 512 bytes); configurable via `sparse-band-size` | keith.github.io man page |
| **Maximum size** | DOCUMENTED | "just under 8 exabytes" | keith.github.io man page |
| **Default filesystem** | DOCUMENTED | APFS since macOS 11.0 | keith.github.io man page |
| **verify checks blocks** | DOCUMENTED | "Checks an image's checksum against the value stored in it. Covers only read-only or compressed images" | keith.github.io man page |
| **Ownership behavior** | DOCUMENTED | "Unknown HFS+ filesystems on external devices and images mount with owners ignored by default" | keith.github.io man page |
| **-shadow preserves base** | DOCUMENTED | "leaves the original unmodified" | keith.github.io man page |

### 3.2 Items that MUST-TEST-EMPIRICALLY

| Item | Why | Test approach |
|------|-----|---------------|
| **`verify` on sparsebundle** | Man page says "Covers only read-only or compressed images" -- may not apply to writable sparsebundles | Run verify on a writable sparsebundle, check exit code |
| **APFS free-space reporting accuracy** | Known bug: empty bundles misreport free space (eclecticlight.co, 2020) | Create bundle, check reported vs. usable space |
| **`compact` effectiveness on APFS** | Documented for HFS+; behavior on APFS less clear | Delete files, compact, measure size change |
| **`attach -plist` output schema** | Key names not fully documented in available man page text | Run and inspect actual plist output |
| **`create -plist` output schema** | Not documented in available man page text | Run and inspect actual plist output |
| **Exit codes** | Man page does not enumerate specific exit codes | Test success and failure cases, record exit codes |
| **`detach` with open files** | Behavior without `-force` when files are open | Open a file, attempt detach |
| **APFS sparsebundle on network storage** | Known issues creating APFS sparsebundles on SMB shares | Test on local vs. network volumes |
| **Timestamp fidelity inside sparsebundle** | Whether APFS volume in sparsebundle preserves all timestamp fields | Write files with known timestamps, verify |

---

## 4. SIDE EFFECTS ON SOURCE AND ENVIRONMENT

### 4.1 ditto source side effects

| Side effect | Status | Notes |
|-------------|--------|-------|
| **Access-time update on source files** | MUST-TEST-EMPIRICALLY | macOS APFS may or may not update atime on read depending on mount options. Ruby bug #16791 documents that "atime may not be updated unless strictatime is set" on macOS Catalina+. ditto reads file contents, so if atime is updated, ditto will cause it. |
| **No writes to source** | DOCUMENTED (implicit) | Man page describes only destination behavior. ditto does not document any source writes. |
| **Unified Buffer Cache effects** | DOCUMENTED | `--nocache` bypasses UBC. Without it, reads populate the cache, which is a memory side effect. |
| **Spotlight indexing** | MUST-TEST-EMPIRICALLY | Reading files may trigger Spotlight re-indexing or mdworker activity on the source volume. |

### 4.2 hdiutil side effects

| Side effect | Status | Notes |
|-------------|--------|-------|
| **attach stores verification attribute** | DOCUMENTED | "After a successful verify on a writable image, attach stores an attribute so the image isn't verified again unless its timestamp changes" (keith.github.io man page) |
| **compact modifies the bundle** | DOCUMENTED | Removes unused bands. "Power loss during compaction could damage" sparse images (keith.github.io man page) |
| **Filesystem journal writes** | MUST-TEST-EMPIRICALLY | Attaching read-write likely creates journal entries |
| **Disk Arbitration notifications** | MUST-TEST-EMPIRICALLY | Mounting volumes sends system notifications |

---

## 5. PERMISSIONS AND PREREQUISITES

### 5.1 Full Disk Access (TCC / Privacy Permissions)

**CRITICAL FOR FORENSIC USE.**

- macOS Transparency, Consent, and Control (TCC) restricts access to protected locations (Desktop, Documents, Downloads, Photos, Mail, Safari data, etc.) per-application.
- The **parent application** must have Full Disk Access, not just Terminal or the shell. If DittoSuite runs ditto as a subprocess, DittoSuite itself needs Full Disk Access. (Source: developer.apple.com/forums/thread/761436)
- ditto reports TCC denials as "Operation not permitted" (EPERM) per file on stderr. It continues past these errors, resulting in a partial copy with non-zero exit code. (Source: developer.apple.com/forums/thread/761436)
- **No API exists to check FDA status.** Apple DTS confirms there is no API to query whether an app has Full Disk Access. (Source: developer.apple.com/forums/thread/841091)
- **Recommended detection:** Spot-check known protected paths at preflight time by attempting to list or stat files within them. If the check fails with EPERM, warn the user to grant Full Disk Access. (Source: Apple DTS recommendation in forums/thread/841091)
- **macOS 27 caveat:** The previous TCC.db probe method (reading `~/Library/Application Support/com.apple.TCC/TCC.db`) now fails even when FDA is granted. Do not use it. (Source: developer.apple.com/forums/thread/841091)

### 5.2 Other permissions

| Requirement | Notes |
|-------------|-------|
| **Removable volume access** | May require user approval in macOS 13+ |
| **Root for setuid/setgid** | ditto preserves setuid/setgid only as superuser |
| **Ownership on mounted volumes** | hdiutil attach with `-owners on` may require root or matching UID |
| **Encryption passphrase** | hdiutil create with `-encryption` requires passphrase via `-stdinpass` |

---

## 6. FAILURE MODES AND ERROR SIGNALING

### 6.1 ditto failure modes

| Failure | Signal | Detection |
|---------|--------|-----------|
| **Permission denied (POSIX)** | Non-zero exit, "Permission denied" on stderr | Parse stderr for "Permission denied" |
| **TCC denial (EPERM)** | Non-zero exit, "Operation not permitted" on stderr | Parse stderr for "Operation not permitted" |
| **Source not found** | Non-zero exit, error on stderr | Check exit code |
| **Destination full** | MUST-TEST-EMPIRICALLY | Test and record behavior |
| **Invalid arguments** | Non-zero exit, usage message | Check exit code |
| **File changed during copy** | MUST-TEST-EMPIRICALLY | Test concurrent modification |
| **DITTOABORT env var** | Calls `abort(3)` on fatal errors if set | Do NOT set this; document it |
| **Partial copy** | ditto continues past errors; exit code non-zero | Always check exit code AND parse stderr for per-file errors |

### 6.2 hdiutil failure modes

| Failure | Signal | Detection |
|---------|--------|-----------|
| **Image already exists** | Non-zero exit (create without -ov) | Check exit code |
| **Insufficient disk space** | Non-zero exit, error on stderr | Check exit code and stderr |
| **Image corrupt / no mountable FS** | Non-zero exit, "no mountable file systems" on stderr | Parse stderr |
| **Volume busy (detach)** | Non-zero exit, EBUSY | Parse stderr for "Resource busy" |
| **Authentication failure** | Non-zero exit, EAUTH | Parse stderr |
| **Device not configured** | ENXIO | Check exit code |
| **Volume locked by another machine** | EAGAIN | Parse stderr |
| **Verify failure** | Non-zero exit | Check exit code |
| **Compact failure / power loss** | Non-zero exit; possible corruption | Check exit code; DO NOT compact during evidence collection |

### 6.3 Stderr parsing caution

Both tools send errors to stderr. All stderr output must be captured raw, hashed, and stored. Parsing for error detection must not modify the captured output. Error categories should be detected by substring matching on the raw bytes.

---

## 7. LICENSING AND INVOCATION

### 7.1 Legal classification

| Tool | Invocation method | Licensing analysis |
|------|------------------|-------------------|
| ditto | Subprocess (Process/NSTask) | Apple system binary shipped with macOS. Not separately licensed for download. Some related source (copyfile) published under APSL 2.0. DittoSuite invokes it as a subprocess on the user's own machine, never copies, bundles, or modifies it. |
| hdiutil | Subprocess (Process/NSTask) | Apple system binary shipped with macOS. Same analysis as ditto. |

### 7.2 OPEN QUESTION FOR COUNSEL

- **Subprocess invocation of Apple system binaries:** Confirm that invoking `/usr/bin/ditto` and `/usr/bin/hdiutil` as subprocesses from a distributed application does not create APSL or macOS EULA obligations. The general understanding is that subprocess invocation of installed system tools does not constitute distribution or modification, but counsel should confirm.
- **macOS EULA:** Apple's macOS EULA restricts some uses. Confirm that a forensic tool invoking system binaries is permitted.

---

## 8. macOS VERSION SUPPORT AND DEPRECATION STRATEGY

### 8.1 Supported macOS versions (validated allow-list)

The following versions must be validated before casework use. This is the initial target list; adjust based on case requirements:

| macOS Version | Version Number | hdiutil Status | Notes |
|---------------|---------------|----------------|-------|
| macOS Sonoma | 14.x | Supported | Current LTS-ish |
| macOS Sequoia | 15.x | Supported | Current |
| macOS Tahoe | 16.x | Supported | Recent |
| macOS Golden Gate | 27.x | Deprecated | hdiutil deprecated; still functional |

### 8.2 hdiutil deprecation in macOS 27

**Key facts (Source: keith.github.io man page, blog.codercops.com, multiple outlets from August 2026):**

- Man page states: "In macOS 27.0, hdiutil is deprecated. Use diskutil image instead for all disk image operations."
- hdiutil continues to function. No removal date announced.
- `diskutil image` provides: attach, create, resize, info, chpass subcommands. Unmounting uses `diskutil unmount`.
- `-puppetstrings` progress flag has no documented `diskutil image` equivalent.
- Sparsebundle support in `diskutil image` is NOT CONFIRMED in available documentation.

**Strategy for DittoSuite:**

1. **Primary target: macOS 14-16** using hdiutil (fully supported, not deprecated).
2. **macOS 27: use hdiutil with deprecation warning** in the audit log. The tool functions; deprecation does not mean removal.
3. **Future-proofing:** Design the HdiutilAdapter with a protocol/interface that can be replaced with a DiskutilImageAdapter when Apple finalizes `diskutil image` and its sparsebundle support is confirmed.
4. **Version check:** At runtime, compare macOS version against the validated allow-list. If the version is not on the list, warn (do not refuse by default; make the policy configurable).

### 8.3 OPEN QUESTION

- **macOS 27 hdiutil deprecation:** Will Apple remove hdiutil in a future release? Does `diskutil image create` support sparsebundles? These must be tested on macOS 27 hardware. Until confirmed, the spec targets macOS 14-16 as primary and macOS 27 as functional-but-deprecated.

---

## 9. SPARSEBUNDLE CONTAINER DETAILS

**Structure (DOCUMENTED -- eclecticlight.co, confirmed by multiple sources):**

```
<name>.sparsebundle/
  Info.plist          -- image metadata (size, band size, disk image type)
  Info.bckup          -- backup copy of Info.plist
  token               -- empty file
  bands/              -- directory containing numbered band files
    0, 1, 2, ...      -- band data files, each up to 8MB by default
```

**Band size:** Default 8MB (16384 sectors x 512 bytes). Configurable at creation time via `-imagekey sparse-band-size=<sectors>`. Range: 2048-16777216 sectors (1MB-8GB). (Source: keith.github.io man page)

**Filesystem options (DOCUMENTED):** APFS (default since macOS 11.0), HFS+, JHFS+, HFSX, FAT32, ExFAT, UDF.

**APFS known issues (MUST-TEST-EMPIRICALLY on target versions):**
- Free-space misreporting on small bundles (eclecticlight.co, 2020)
- No shrinking after file deletion without `hdiutil compact`
- Disk Utility cannot resize APFS sparsebundles; must use `hdiutil resize`

---

## 10. ENVIRONMENT VARIABLES

### 10.1 ditto

| Variable | Effect | DittoSuite policy |
|----------|--------|-------------------|
| `DITTONORSRC` | Acts like `--norsrc --noextattr --noacl` | MUST NOT be set. Scrub from environment. |
| `DITTOABORT` | Calls `abort(3)` on fatal errors | MUST NOT be set. Scrub from environment. |

### 10.2 hdiutil

No documented environment variables found that affect behavior in the forensic-relevant modes. However, the environment should be scrubbed to a minimal set regardless.

---

## 11. SOURCES

- ditto man page: https://ss64.com/mac/ditto.html
- ditto man page (unix.com): https://www.unix.com/man-page/OSX/1/ditto/
- ditto man page (manpagez.com section 8): https://manpagez.com/man/8/ditto/
- hdiutil man page (Xcode mirror): https://keith.github.io/xcode-man-pages/hdiutil.1.html
- hdiutil deprecation: https://blog.codercops.com/blog/hdiutil-deprecated-macos-27-diskutil-image-migration
- Sparsebundle details: https://eclecticlight.co/2020/04/27/sparse-bundles-what-they-are-and-how-to-work-around-their-bugs/
- TCC / Full Disk Access: https://developer.apple.com/forums/thread/841091
- ditto Operation not permitted: https://developer.apple.com/forums/thread/761436
- Extended attribute loss: https://developer.apple.com/forums/thread/761587
- APSL licensing: https://en.wikipedia.org/wiki/Apple_Public_Source_License
- macOS atime behavior: https://bugs.ruby-lang.org/projects/ruby-trunk/repository/git/revisions/3c7e764d495ec1ab2498853174f81e975b5be8c8
