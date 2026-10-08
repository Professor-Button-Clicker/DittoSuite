# DittoSuite

A native macOS app (Swift/SwiftUI) for **targeted logical collection** of user-selected files and folders into forensic sparsebundles using Apple's `ditto` and `hdiutil`.

> **This is a targeted logical collection tool, NOT a forensic imaging tool.**
> Only items selected by the examiner are collected.

## Requirements

- macOS 14.0+ (Sonoma or later)
- Xcode 15.0+ / Swift 5.9+
- Full Disk Access (for collecting from protected paths)

## Build

```bash
# Clone and build
git clone https://github.com/YOUR_USERNAME/DittoSuite.git
cd DittoSuite
swift build

# Run
swift run DittoSuite

# Or open in Xcode
open Package.swift
```

## Workflow

DittoSuite walks the examiner through a 9-step GUI workflow:

1. **Case Setup** -- examiner name, case/evidence ID, legal authority
2. **Bundle Setup** -- create a new APFS sparsebundle (or reuse existing)
3. **Source Selection** -- file/folder picker with size estimates
4. **Pre-flight Checks** -- macOS version, FDA status, free space, binary hashes
5. **Source Manifest** -- read-only walk with per-file SHA-256 (ground truth)
6. **Collection** -- `ditto` copy with full invocation recording
7. **Verification** -- independent manifest comparison (not trusting ditto's exit code)
8. **Close-out** -- band count check, clean detach, session end
9. **Results & Report** -- export text report, JSON report, and audit log

## Architecture

```
src/
  adapters/       Thin wrappers around /usr/bin/ditto and /usr/bin/hdiutil
  core/           Hashing, manifests, verification, audit log, reports, preflight
  ui/             SwiftUI views and workflow coordinator
tests/
  adapters/       Adapter unit tests
  core/           Core service unit tests
  integration/    End-to-end and upstream characterization tests
  fixtures/       Synthetic test data generator
```

## Forensic Design Principles

- **Wrap, Don't Hide, Don't Replace**: upstream tools (`ditto`, `hdiutil`) are called via subprocess with argument arrays (never shell), and every invocation is fully recorded
- **Independent Verification**: source and destination manifests are built by DittoSuite's own code and compared independently of `ditto`'s success reporting
- **Tamper-Evident Audit Log**: append-only, hash-chained JSON Lines log (O_APPEND semantics) stored inside the sparsebundle
- **No Silent Failures**: every error is logged, surfaced in the UI, and included in the report
- **No Network Access**: zero networking imports, scrubbed environment variables, no telemetry

## Compliance

32-item compliance matrix covering ISO 27037, NIST SP 800-86, SWGDE best practices, and FRE 901. See [`.pipeline/review.md`](.pipeline/review.md) for the full matrix and review status.

## Validation Status

This tool has passed automated code review but has **not been compiled, executed, or validated on macOS**. Before use in any legal proceeding:

1. Compile and run the full test suite on macOS 14.0+
2. Execute the 15 upstream characterization tests
3. Complete the empirical validation plan
4. Obtain independent forensic examiner sign-off

**Do not use on real evidence without completing human validation.**

## Known Limitations

1. `ditto` does not preserve directory hard links
2. Extended attribute preservation may be incomplete for system-protected xattrs
3. Source file access times may change during collection (reading for hashing)
4. `hdiutil verify` does not reliably cover writable sparsebundles
5. Unicode filename normalization (NFC/NFD) must be empirically validated
6. `hdiutil` is deprecated in macOS 27 (Golden Gate); still functional

See [`src/core/ReportGenerator.swift`](src/core/ReportGenerator.swift) for the complete list included in every report.

## License

All rights reserved. This tool is provided for forensic examination purposes only.
