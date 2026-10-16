# DittoSuite

An interactive macOS CLI tool for **targeted logical collection** of user-selected files and folders into forensic sparsebundles using Apple's `ditto` and `hdiutil`.

> **This is a targeted logical collection tool, NOT a forensic imaging tool.**
> Only items selected by the examiner are collected.

## Requirements

- macOS 14.0+ (Sonoma or later)
- Bash 3.2+ (ships with macOS)
- Full Disk Access (for collecting from protected paths)

## Install

```bash
# Clone
git clone https://github.com/Professor-Button-Clicker/DittoSuite.git
cd DittoSuite

# Make executable
chmod +x dittosuite.sh

# Run
./dittosuite.sh
```

## Usage

```bash
# Start the interactive 9-step workflow
./dittosuite.sh

# Show forensic guide and data integrity principles
./dittosuite.sh --guide

# Show version
./dittosuite.sh --version
```

## Workflow

DittoSuite walks the examiner through a 9-step interactive CLI workflow:

1. **Case Setup** — examiner name, custodian name, case/evidence ID, optional device details and legal authority
2. **Bundle Setup** — create a new APFS sparsebundle with optional AES-256 encryption
3. **Source Selection** — enter paths to files/folders with size estimates
4. **Pre-flight Checks** — macOS version, binary integrity, read access, free space, overlap detection, band count
5. **Source Manifest** — read-only walk with per-file SHA-256 (ground truth)
6. **Collection** — `ditto` copy with `--rsrc --extattr --acl --qtn` and scrubbed environment
7. **Verification** — independent manifest comparison (never trusting ditto's exit code)
8. **Close-out** — band count check, clean detach, session end
9. **Results & Report** — summary of what was/wasn't collected, text report export

## Core Principle

**Source data must NEVER be modified under any circumstances.** Collected data must NEVER be modified in any way. Failure is ALWAYS preferred over any data change. There is no override for this behavior.

## Forensic Design Principles

- **Wrap, Don't Hide, Don't Replace**: upstream tools (`ditto`, `hdiutil`) are called via subprocess with argument arrays (never shell), and every invocation is fully recorded
- **Independent Verification**: source and destination manifests are built independently and compared — `ditto`'s exit code is never trusted as proof of integrity
- **Tamper-Evident Audit Log**: append-only, hash-chained JSON Lines log stored inside the sparsebundle
- **Environment Scrubbing**: `DYLD_*`, `LD_*`, and other dangerous variables are removed before calling system binaries
- **No Silent Failures**: every error is logged with path and reason
- **No Network Access**: zero network calls, no telemetry, no update checks

## Files

```
dittosuite.sh                   Interactive CLI tool (single file)
docs/
  forensic-requirements.md      32-item compliance matrix (ISO 27037, NIST, SWGDE, FRE 901)
  validation-datasets.md        Synthetic test data specifications
  dittosuite-mockup.html        Interactive UI mockup for cross-platform preview
```

## Known Limitations

1. `ditto` does not preserve directory hard links
2. Extended attribute preservation may be incomplete for system-protected xattrs
3. Source file access times may change during collection (reading for hashing)
4. `hdiutil verify` does not reliably cover writable sparsebundles
5. Unicode filename normalization (NFC/NFD) must be empirically validated

## Validation Status

This tool has **not been validated on macOS**. Before use in any legal proceeding:

1. Run the tool on macOS 14.0+ with Full Disk Access
2. Test with synthetic fixtures covering edge cases (Unicode, symlinks, permissions)
3. Complete the empirical validation plan
4. Obtain independent forensic examiner sign-off

**Do not use on real evidence without completing human validation.**

## License

All rights reserved. This tool is provided for forensic examination purposes only.
