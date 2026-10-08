## THE CORE PRINCIPLE: WRAP, DON'T HIDE, DON'T REPLACE

When you build on an existing tool, three rules govern every design decision.

1. **Wrap.** Call the established tool to do the evidence-touching work, using its documented interface. Don't reimplement a copier, a filesystem parser, or a mail store reader unless you must. The upstream tool's track record, community scrutiny, and published behavior carry weight in court. Your reimplementation has none.
2. **Don't hide.** Streamlining the workflow must never hide what happened. The exact command run, the upstream tool's version, its raw output, its exit code, and every warning must be captured, preserved, and visible in the report. "User friendly" means fewer steps for the examiner, not less information for the court.
3. **Don't replace the trusted result with your own.** Where your tool adds value (a hash manifest, a summary, an analysis), it is clearly labeled as the *wrapper's* output and kept separate from the *upstream tool's* output.

---

## WHAT "COURT-DEFENSIBLE" MEANS FOR AN INTEGRATION TOOL

### 1. Evidence integrity

* **Never modify the source.** Where the upstream tool could touch the source (indexing, compaction, atime updates, lock files, cache writes), the design either prevents it or documents it as a known effect.
* **Hash everything.** Use SHA-256 minimum, with SHA-512 acceptable. MD5 and SHA-1 may be recorded alongside for legacy compatibility but never as the only integrity check.
* **Verify independently.** Don't trust the upstream tool's own success message as the sole proof. After a copy or acquisition, the wrapper re-reads and compares source and output with its own hashing.
* **No silent skips.** Unreadable files, permission denials (for example macOS TCC / Full Disk Access gaps), truncated reads, and upstream warnings are logged with paths and reasons, and the collection is labeled partial when it is.

### 2. Chain of custody and auditability

Each run produces an append-only, tamper-evident audit log: tool name, version, git commit, build hash, operator, host, OS version, UTC start and end with time source, arguments, legal authority reference, input and output identifiers, all hashes, and the full upstream-tool invocation record (see section 5).

### 3. Repeatability and reproducibility

* Same input gives same output, apart from documented nondeterministic fields.
* Builds and dependencies are pinned and tagged. The validated binary is the one used in casework.
* Where the data source is remote (an API), the live data can change, so the **raw responses are preserved and hashed**. Reproducibility then means re-processing the preserved responses.

### 4. Validation and known error rates

* Test against known ground truth (NIST CFReDS-style datasets or synthetic data where every artifact is known).
* Record expected vs. actual, pass/fail criteria, and limitations. *Daubert*-style scrutiny asks about testing, error rates, standards, peer review, and acceptance.

### 5. Upstream-tool controls (specific to wrappers)

* **Identify and pin the upstream tool.** Record its name, version, build or OS version, absolute path, and the SHA-256 of the binary that was actually executed. For OS-bundled tools such as `ditto` and `hdiutil`, record the macOS version and build.
* **Record the exact invocation.** Store the argument array, working directory, scrubbed environment, locale/timezone, start and end times, exit code, and raw stdout and stderr, hashed and kept unmodified.
* **Invoke safely.** No shell interpolation (use argument arrays, never `shell=True` or string-built commands), no user-controlled strings in commands without validation, absolute paths to binaries, explicit timeouts, and explicit environment.
* **Characterize the upstream tool's behavior.** Document, from the vendor documentation *and* empirical testing, what it preserves and what it doesn't: timestamps, extended attributes, ACLs, resource forks, permissions, symlinks, hard links, sparse files, special files. Document side effects on the source such as access-time changes or index writes. These become the documented limitations in the validation report.
* **Detect upstream drift.** Behavior can change with an OS update, an app update, or an API change. The tool records versions at runtime, compares them against a validated allow-list, and **warns or refuses** when the upstream version is not one you've validated.
* **Never modify the upstream tool.** Don't patch binaries or monkey-patch libraries. Extend by wrapping, adding add-ons through supported interfaces, or reading the tool's data files.
* **Mind licensing.** Invoking a tool as a separate process is different from linking or bundling it. Check the license (for example, Thunderbird is under MPL 2.0, and GPL tools carry different obligations) and have counsel confirm before distributing anything.
* **Supply chain.** Verify the integrity of upstream downloads (signatures or published checksums), pin dependencies with lockfiles, and generate an SBOM for each release.

### 6. Integration-specific legal and data-handling issues (verify with counsel)

| Area | What it means for the tool |
| - | - |
| **Authorization and scope** | Require the operator to record the legal authority (warrant, consent, order, policy) and scope before collection, and embed it in the audit log. |
| **Targeted vs. full collection** | A targeted logical collection is not a forensic image. The report must say exactly what was and was not collected, and the selection criteria. |
| **Live-system collection** | Collecting from a running system alters system state and risks volatile data loss. Support documenting the order of volatility and the operator's decisions. |
| **Third-party APIs** | Honor the API's terms of service, authentication requirements, and rate limits. Credentials are handled via a secrets store, never logged or hard-coded. Provider-held content may require specific legal process (for example SCA/ECPA in the US). Flag these modes for counsel. |
| **Data egress** | Evidence must not leave the controlled environment unintentionally: no telemetry, no cloud calls, no update checks during evidence processing unless explicitly specified and documented. |
| **Privileged / personal / protected data** | Support access controls, minimization, and filter-team workflows for privileged material, plus privacy regimes such as GDPR and HIPAA. |
| **Access controls and encryption** | No bypassing outside explicit authorization. Anything touching encrypted volumes, credentials, or keychains needs explicit authorization handling in the spec. |
| **Rules of evidence** | Output should support authentication (FRE 901), self-authentication through certified process (FRE 902(13)/(14)), and best-evidence considerations (FRE 1001-1004). Expert testimony faces FRE 702 and *Daubert*/*Frye*. Non-US readers should map to local equivalents. |

### 7. Standards to design and test against

Confirm current versions: ISO/IEC 27037, 27041, 27042, 27043; ISO/IEC 17025 and 17020; NIST SP 800-86; NIST CFTT methodologies and CFReDS datasets; SWGDE best-practice documents; ACPO/NPCC principles (UK); your jurisdiction's rules and your lab's SOPs.
