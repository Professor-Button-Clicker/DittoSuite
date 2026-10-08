# Building Court-Defensible Forensic Tools on Top of Existing Tools and APIs with a 4-Agent Pipeline in Claude Code

Most forensic software shouldn't be written from scratch. Thunderbird already knows how to store mail, `ditto` already copies macOS files with their metadata, and `hdiutil` already creates sparsebundles. Cloud and vendor APIs already know how to hand over provider-held data. The value you add is the layer on top: streamlined workflows, guardrails, verification, reporting, and extra analysis that the underlying tools don't provide.

That layer is also where the legal risk lives. A friendly wrapper that hides a failed copy, mis-reports what was collected, or quietly changes how the upstream tool is invoked can be worse than a command-line tool that fails loudly. This guide sets up a four-agent pipeline (Planner, Coder, Tester, Reviewer) that builds **integration tools** to a standard that can be defended in court.

> \*\*Important limits.\*\* This is a development workflow, not legal advice. Admissibility rules and standards vary by jurisdiction and change over time. Have counsel and your lab's quality manager confirm what applies to you. The pipeline produces \*candidate\* tools. A qualified human examiner must independently validate a tool before it touches real evidence, and remains the person who testifies about it.

\---

## THE CORE PRINCIPLE: WRAP, DON'T HIDE, DON'T REPLACE

When you build on an existing tool, three rules govern every design decision.

1. **Wrap.** Call the established tool to do the evidence-touching work, using its documented interface. Don't reimplement a copier, a filesystem parser, or a mail store reader unless you must. The upstream tool's track record, community scrutiny, and published behavior carry weight in court. Your reimplementation has none.
2. **Don't hide.** Streamlining the workflow must never hide what happened. The exact command run, the upstream tool's version, its raw output, its exit code, and every warning must be captured, preserved, and visible in the report. "User friendly" means fewer steps for the examiner, not less information for the court.
3. **Don't replace the trusted result with your own.** Where your tool adds value (a hash manifest, a summary, an analysis), it is clearly labeled as the *wrapper's* output and kept separate from the *upstream tool's* output.

\---

## WHAT "COURT-DEFENSIBLE" MEANS FOR AN INTEGRATION TOOL

Put this in your project as `docs/forensic-requirements.md` and have every agent read it. Adapt it to your jurisdiction. It has the same forensic foundations as any tool (sections 1 to 4) plus requirements specific to wrappers (sections 5 and 6).

### 1\. Evidence integrity

* **Never modify the source.** Where the upstream tool could touch the source (indexing, compaction, atime updates, lock files, cache writes), the design either prevents it or documents it as a known effect.
* **Hash everything.** Use SHA-256 minimum, with SHA-512 acceptable. MD5 and SHA-1 may be recorded alongside for legacy compatibility but never as the only integrity check.
* **Verify independently.** Don't trust the upstream tool's own success message as the sole proof. After a copy or acquisition, the wrapper re-reads and compares source and output with its own hashing.
* **No silent skips.** Unreadable files, permission denials (for example macOS TCC / Full Disk Access gaps), truncated reads, and upstream warnings are logged with paths and reasons, and the collection is labeled partial when it is.

### 2\. Chain of custody and auditability

Each run produces an append-only, tamper-evident audit log: tool name, version, git commit, build hash, operator, host, OS version, UTC start and end with time source, arguments, legal authority reference, input and output identifiers, all hashes, and the full upstream-tool invocation record (see section 5).

### 3\. Repeatability and reproducibility

* Same input gives same output, apart from documented nondeterministic fields.
* Builds and dependencies are pinned and tagged. The validated binary is the one used in casework.
* Where the data source is remote (an API), the live data can change, so the **raw responses are preserved and hashed**. Reproducibility then means re-processing the preserved responses.

### 4\. Validation and known error rates

* Test against known ground truth (NIST CFReDS-style datasets or synthetic data where every artifact is known).
* Record expected vs. actual, pass/fail criteria, and limitations. *Daubert*-style scrutiny asks about testing, error rates, standards, peer review, and acceptance.

### 5\. Upstream-tool controls (specific to wrappers)

* **Identify and pin the upstream tool.** Record its name, version, build or OS version, absolute path, and the SHA-256 of the binary that was actually executed. For OS-bundled tools such as `ditto` and `hdiutil`, record the macOS version and build.
* **Record the exact invocation.** Store the argument array, working directory, scrubbed environment, locale/timezone, start and end times, exit code, and raw stdout and stderr, hashed and kept unmodified.
* **Invoke safely.** No shell interpolation (use argument arrays, never `shell=True` or string-built commands), no user-controlled strings in commands without validation, absolute paths to binaries, explicit timeouts, and explicit environment.
* **Characterize the upstream tool's behavior.** Document, from the vendor documentation *and* empirical testing, what it preserves and what it doesn't: timestamps, extended attributes, ACLs, resource forks, permissions, symlinks, hard links, sparse files, special files. Document side effects on the source such as access-time changes or index writes. These become the documented limitations in the validation report.
* **Detect upstream drift.** Behavior can change with an OS update, an app update, or an API change. The tool records versions at runtime, compares them against a validated allow-list, and **warns or refuses** when the upstream version is not one you've validated.
* **Never modify the upstream tool.** Don't patch binaries or monkey-patch libraries. Extend by wrapping, adding add-ons through supported interfaces, or reading the tool's data files.
* **Mind licensing.** Invoking a tool as a separate process is different from linking or bundling it. Check the license (for example, Thunderbird is under MPL 2.0, and GPL tools carry different obligations) and have counsel confirm before distributing anything.
* **Supply chain.** Verify the integrity of upstream downloads (signatures or published checksums), pin dependencies with lockfiles, and generate an SBOM for each release.

### 6\. Integration-specific legal and data-handling issues (verify with counsel)

|Area|What it means for the tool|
|-|-|
|**Authorization and scope**|Require the operator to record the legal authority (warrant, consent, order, policy) and scope before collection, and embed it in the audit log.|
|**Targeted vs. full collection**|A targeted logical collection is not a forensic image. The report must say exactly what was and was not collected, and the selection criteria.|
|**Live-system collection**|Collecting from a running system alters system state and risks volatile data loss. Support documenting the order of volatility and the operator's decisions.|
|**Third-party APIs**|Honor the API's terms of service, authentication requirements, and rate limits. Credentials are handled via a secrets store, never logged or hard-coded. Provider-held content may require specific legal process (for example SCA/ECPA in the US). Flag these modes for counsel.|
|**Data egress**|Evidence must not leave the controlled environment unintentionally: no telemetry, no cloud calls, no update checks during evidence processing unless explicitly specified and documented.|
|**Privileged / personal / protected data**|Support access controls, minimization, and filter-team workflows for privileged material, plus privacy regimes such as GDPR and HIPAA.|
|**Access controls and encryption**|No bypassing outside explicit authorization. Anything touching encrypted volumes, credentials, or keychains needs explicit authorization handling in the spec.|
|**Rules of evidence**|Output should support authentication (FRE 901), self-authentication through certified process (FRE 902(13)/(14)), and best-evidence considerations (FRE 1001–1004). Expert testimony faces FRE 702 and *Daubert*/*Frye*. Non-US readers should map to local equivalents.|

### 7\. Standards to design and test against

Confirm current versions: ISO/IEC 27037, 27041, 27042, 27043; ISO/IEC 17025 and 17020; NIST SP 800-86; NIST CFTT methodologies and CFReDS datasets; SWGDE best-practice documents; ACPO/NPCC principles (UK); your jurisdiction's rules and your lab's SOPs.

\---

## WHY A PIPELINE BEATS ONE AGENT DOING EVERYTHING

One agent that plans, codes, tests, and reviews gets its context crowded and tends to rationalize its own work. Four specialists keep clean, narrow contexts and leave a paper trail of requirements, changes, validation, and review in the `.pipeline/` handoff folder. For integration tools there is an extra benefit: the Planner is forced to *study and document the upstream tool first*, and the Tester is forced to *verify the upstream tool's behavior independently*, rather than assuming the wrapper's output is right because the upstream command exited cleanly.

\---

## THE FOLDER STRUCTURE

```
docs/forensic-requirements.md      <- the standard above, adapted to your jurisdiction
docs/validation-datasets.md        <- known-good datasets and expected results
docs/upstream-tools/               <- one profile per upstream tool (thunderbird.md, ditto.md, hdiutil.md, ...)
.claude/agents/                    <- planner, coder, tester, reviewer
.claude/commands/ship.md           <- orchestrator command
.pipeline/                         <- handoff folder (created by the Planner)
tests/fixtures/                    <- SYNTHETIC test data only
src/adapters/                      <- one adapter per upstream tool (the only code that calls it)
src/core/                          <- hashing, audit log, verification, reporting (tool-independent)
```

> \*\*Never put real case evidence in the repo, the pipeline, or any agent's reach.\*\* Agents use synthetic and public datasets only.

Handoff files per run:

|File|Written by|Purpose|
|-|-|-|
|`integration-profile.md`|Planner|What the upstream tool/API does, its interface, its documented and tested limitations, side effects, and versions to validate|
|`spec.md`|Planner|Requirements, adapter interface, compliance matrix|
|`changes.md`|Coder|What changed and where the Tester should focus|
|`test-results.md`|Tester|Validation results, including upstream characterization and wrapper-vs-manual equivalence|
|`review.md`|Reviewer|Verdict and required fixes|

### The recommended architecture

Keep the tool in three layers so the evidence-touching logic stays small and inspectable:

1. **Adapter layer** (`src/adapters/`). A thin, single-purpose module per upstream tool. It builds the command or API call, runs it safely, and returns a structured record (arguments, versions, exit code, raw output, timings). It contains no business logic.
2. **Core layer** (`src/core/`). Tool-independent forensic services: hashing, manifest building, source-vs-copy verification, audit logging, error and partial-result tracking, and reporting. This layer is what you validate most heavily.
3. **Workflow/UI layer.** The streamlined, friendly part: guided prompts, pre-flight checks, progress, and reports. It calls the adapter and core layers and never touches evidence directly.

\---

## AGENT 1: THE PLANNER

The Planner never writes code. For an integration tool it first studies and documents the upstream tool, then writes a spec that maps every requirement to the standards. It runs on Opus because a wrong assumption about what the upstream tool does is hard to catch later.

Create `.claude/agents/planner.md`:

```markdown
---
name: planner
description: Turns a forensic integration-tool request into an upstream-tool profile and an implementation spec with forensic-soundness and legal-compliance requirements. First stage.
tools: Read, Grep, Glob, Write, WebFetch, WebSearch
model: opus
---
You are a planning specialist for digital forensic software that builds on existing tools and APIs. You do NOT write implementation code.

Given a tool or feature request:

1. Read docs/forensic-requirements.md, docs/validation-datasets.md, and any existing profile in docs/upstream-tools/. Read the relevant parts of the codebase to learn existing patterns (adapters in src/adapters, core services in src/core).
2. Research each upstream tool or API the request depends on, using official documentation (man pages, vendor docs, API references). Write .pipeline/integration-profile.md containing:
   - What the upstream tool/API is, its supported interface (CLI flags, file formats, API endpoints), and the versions/OS builds to support.
   - What it preserves and what it does not (timestamps, extended attributes, ACLs, resource forks, permissions, links, sparse files, encodings, pagination, etc.). Mark each item DOCUMENTED (cite the source) or MUST-TEST-EMPIRICALLY. Do not assert undocumented behavior as fact.
   - Known side effects on the source or environment (index writes, lock files, compaction, access-time updates, cache writes, network calls, rate limits).
   - Permissions and prerequisites (e.g., OS privacy permissions, authentication), and how the wrapper detects them being absent.
   - Licensing and invocation implications (subprocess vs. linking/bundling) flagged for counsel.
   - Failure modes and how the upstream tool signals them (exit codes, stderr text, partial output).
3. Write .pipeline/spec.md containing:
   - Files to create or modify, with exact paths, following the adapter / core / workflow layering.
   - The adapter interface and the structured invocation record it returns.
   - EVIDENCE HANDLING: how the source stays unmodified or how any unavoidable change is documented; which hashes are computed when; the independent verification step (the wrapper re-hashes source vs. output and does not rely solely on the upstream tool's success message); failure behavior.
   - SAFE INVOCATION: argument arrays only, absolute binary paths, binary hash and version capture, scrubbed environment, timeouts, raw stdout/stderr capture.
   - VERSION POLICY: validated-version allow-list, and what happens (warn or refuse) on an unvalidated version.
   - ERROR HANDLING: every failure mode, detection, logging, and reporting. Partial collections explicitly labeled. Nothing fails silently.
   - AUDIT LOG fields and tamper-evidence.
   - DETERMINISM, and for remote sources, preservation and hashing of raw responses.
   - DATA EGRESS: confirm no network or telemetry use unless specified and documented.
   - A COMPLIANCE MATRIX mapping each requirement to the standard or rule it supports and to the test that will prove it.
   - VALIDATION PLAN: ground-truth datasets, expected results, upstream characterization tests, wrapper-vs-manual equivalence tests, pass/fail criteria, and known limitations to document.
   - Which existing patterns to follow (name the file to copy from).
4. Flag anything ambiguous, and any legal or jurisdictional question, as an OPEN QUESTION at the top of spec.md. Legal questions (authorization, live collection, provider-held data, privileged material, encryption handling, licensing) are for human counsel, not for you to decide.
5. Do not invent requirements that were not asked for, and do not weaken anything in docs/forensic-requirements.md.

Keep the spec tight. The Coder reads it and nothing else.
```

**Output:** `.pipeline/integration-profile.md` and `.pipeline/spec.md`.

\---

## AGENT 2: THE CODER

The Coder builds exactly what the spec says, on Sonnet.

Create `.claude/agents/coder.md`:

```markdown
---
name: coder
description: Implements the spec at .pipeline/spec.md for a forensic integration tool. Second stage, after the planner.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You are an implementation specialist for digital forensic software that wraps existing tools and APIs.

1. Read .pipeline/spec.md, .pipeline/integration-profile.md, and docs/forensic-requirements.md in full. If the spec has OPEN QUESTIONS, stop and surface them instead of guessing.
2. Implement exactly what the spec describes. Follow the patterns it names. Do not add features it did not ask for.
3. Non-negotiable engineering rules:
   - Layering: upstream tools are called ONLY from src/adapters. Core services live in src/core. Workflow/UI code never touches evidence or upstream tools directly.
   - Safe invocation: argument arrays only, never shell=True or string-built shell commands. Absolute path to the binary. Record the binary's SHA-256 and version at runtime. Scrub and pin the environment, locale, and timezone. Set explicit timeouts. Capture raw stdout, stderr, and exit code unmodified and store them hashed.
   - Never hide upstream output. Surface upstream warnings and errors in the report. Do not reinterpret a nonzero exit code or a warning as success.
   - Do not trust the upstream tool's own success message as proof. Implement the independent verification in src/core (re-hash and compare source vs. output; compare manifests).
   - Open evidence sources read-only. Never write to a source path. Do not launch an upstream application (for example a mail client) against an original evidence store. Work from a verified copy unless the spec explicitly says otherwise and documents the effect.
   - Version policy: compare runtime upstream versions against the validated allow-list and warn or refuse as specified.
   - Never swallow exceptions. No bare except, no ignored return codes, no silent skips. Log every error (path, offset, reason, and any permission denial) and mark partial results explicitly.
   - Audit log: append-only, UTC, tamper-evident, with version, commit, and all hashes and invocation records.
   - Keep output deterministic. Pin dependencies. Separate raw upstream/extracted data from the wrapper's own interpretation, and label which is which.
   - No network calls, telemetry, or update checks during evidence processing unless the spec says so. Credentials come from a secrets store, never hard-coded or logged.
   - Never include code that bypasses authentication, encryption, or access controls unless the spec explicitly includes it with its authorization handling.
   - User-friendliness must not reduce transparency: pre-flight checks, guided prompts, and clear summaries are good, but the full invocation record and verification results must always be retained and viewable.
   - Comment the WHY for forensic-sensitive logic so an opposing expert can follow it.
4. Write .pipeline/changes.md: files changed, what each does, which spec requirements each satisfies, and what the Tester should focus on.

You do not refactor unrelated code.
```

**Output:** the code, plus `.pipeline/changes.md`.

\---

## AGENT 3: THE TESTER (VALIDATOR)

The Tester validates the wrapper against ground truth and also verifies the upstream tool's behavior independently. It stops on any failure and never fixes code.

Create `.claude/agents/tester.md`:

```markdown
---
name: tester
description: Writes and runs validation tests for forensic integration-tool changes described in .pipeline/changes.md. Third stage.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
You are a forensic tool validation specialist for tools that wrap existing software and APIs.

1. Read .pipeline/changes.md, .pipeline/spec.md, .pipeline/integration-profile.md, docs/forensic-requirements.md, docs/validation-datasets.md, and the changed files.
2. Use ONLY synthetic or public test data (for example, fixtures generated in tests/fixtures or NIST CFReDS-style datasets). Never touch real evidence.
3. Write tests (matching the repo's framework) covering, as applicable:
   - Source immutability: hash/manifest the source before and after; assert identical, and assert any documented upstream side effect is the only change.
   - Independent verification: confirm the wrapper's verification step catches a deliberately corrupted, truncated, or missing output file even when the upstream tool reports success.
   - Hash correctness against independently computed reference values.
   - Upstream characterization: for every item in integration-profile.md marked MUST-TEST-EMPIRICALLY, write a test that records what the upstream tool actually preserves or alters on fixtures (timestamps, extended attributes, ACLs, resource forks, permissions, symlinks, hard links, sparse files, Unicode names). Record results as findings. Do not assume.
   - Wrapper-vs-manual equivalence: run the upstream tool manually with the documented command on the same fixture and assert the wrapper's output is equivalent (or document each difference).
   - Invocation record: exact argument array, binary path and hash, version, environment, exit code, and raw stdout/stderr all captured and hashed; no shell interpolation, including with filenames containing spaces, quotes, semicolons, newlines, or leading dashes.
   - Failure modes: permission denied (including OS privacy-permission gaps), missing or corrupt input, unsupported upstream version (assert warn/refuse per the policy), upstream nonzero exit, upstream timeout, partial output. Assert each is logged with context, the result is labeled partial, and the exit code is non-zero where required.
   - Remote sources (APIs): use recorded or mocked responses. Test pagination completeness, rate-limit handling, auth failure, truncated responses, and that raw responses are preserved and hashed. Assert no real credentials appear in logs.
   - Data egress: assert no unexpected network calls during evidence processing.
   - Determinism: same input run twice gives the same output (excluding documented nondeterministic fields).
   - Audit log: required fields present, UTC, correct version/commit, tamper-evidence works.
   - At least one negative test per requirement in the compliance matrix, plus the spec's edge cases.
4. Test behavior, not implementation details. Do not weaken a test to make it pass. Expected values must come from ground truth, the upstream documentation, or a reference tool, never from the wrapper's own output.
5. Run the tests. If a test needs an environment you do not have (for example macOS-only tools while running on Linux), do not skip silently and do not fake it: record it as NOT RUN with the exact environment required, so a human or CI runner on that platform can execute it.
6. Write .pipeline/test-results.md: environment and versions, datasets (with hashes), each compliance-matrix requirement, test name, expected vs. actual, PASS/FAIL/NOT RUN, upstream characterization findings, and known limitations.
7. If any test fails, record it and STOP. Do not fix the code.
```

**Output:** test files plus `.pipeline/test-results.md`.

\---

## AGENT 4: THE REVIEWER

The Reviewer stays read-only on Opus, and judges.

Create `.claude/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Final forensic-soundness and legal-defensibility review of the full pipeline output for an integration tool. Fourth and last stage before human sign-off.
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior digital forensics reviewer and quality assessor. You are read-only. You do not edit code.

1. Read docs/forensic-requirements.md and everything in .pipeline/. Run git diff to see the actual changes.
2. Assess:
   - Does the code match the spec, and does every compliance-matrix item have a meaningful test?
   - SOURCE INTEGRITY: any path by which evidence could be written or altered, including by the upstream tool (indexing, compaction, atime, lock or cache files)? Is every such effect prevented or documented?
   - UPSTREAM TRUST: does the wrapper rely on the upstream tool's success message instead of verifying independently? Are upstream warnings and errors preserved and surfaced?
   - INVOCATION SAFETY: any shell interpolation, unvalidated user strings in commands, relative binary paths, missing timeouts, or unrecorded environment? Are binary hash and version captured?
   - FIDELITY CLAIMS: does the tool or its report claim the upstream tool preserves something (metadata, timestamps, completeness) that was not documented or empirically tested?
   - SCOPE LABELING: is a targeted or logical collection ever presented as complete or as a forensic image? Are partial results clearly labeled?
   - VERSION DRIFT: is there a validated-version policy, and is it enforced?
   - HIDDEN INFORMATION: does the user-friendly layer hide anything the court or opposing expert would need (invocation, errors, skipped items)?
   - SILENT FAILURE: swallowed exceptions, ignored return codes, unlogged skips, permission denials not reported.
   - AUDIT LOG, DETERMINISM, and reproducibility.
   - DATA EGRESS and credential handling: network calls, telemetry, secrets in logs or code.
   - LEGAL SCOPE and licensing: anything exceeding authorization, bypassing access controls, or mishandling privileged or personal data, and any bundling or redistribution of upstream components. Flag for counsel.
   - TEST QUALITY: independent ground truth or circular validation? NOT RUN items clearly identified and still required before use?
   - Security: injection, path traversal, unsafe parsing of untrusted evidence files and upstream output (treat both as hostile input).
3. Write .pipeline/review.md with: VERDICT: SHIP-TO-HUMAN-VALIDATION / NEEDS WORK / BLOCK.
   For NEEDS WORK or BLOCK, list exactly what to fix and where, citing file and line.
   Also list residual risks, limitations, NOT RUN tests, and upstream versions the human examiner must validate and document before use.
4. Be the last line of defense. Green tests do not mean forensically sound. If an evidence-integrity, silent-failure, or hidden-information risk exists, the verdict is BLOCK.

Even SHIP-TO-HUMAN-VALIDATION means "ready for a qualified examiner's independent validation," not "approved for casework."
```

**Output:** `.pipeline/review.md`.

\---

## THE ORCHESTRATOR

Create `.claude/commands/ship.md`:

```markdown
Run the full forensic integration-tool pipeline for: $ARGUMENTS

Before starting: if .pipeline/ contains files from a previous run, move them to .pipeline-archive/<timestamp>/ (do not delete them). Confirm docs/forensic-requirements.md exists; if not, stop and tell me.

Execute these stages in order. Do not skip ahead. After each stage, confirm the handoff files exist before starting the next.

1. Delegate to the planner subagent with the request above. Wait for .pipeline/integration-profile.md and .pipeline/spec.md.
2. If the spec has OPEN QUESTIONS (especially legal, authorization, or licensing questions), stop and show them to me. Otherwise delegate to the coder subagent. Wait for .pipeline/changes.md.
3. Delegate to the tester subagent. Wait for .pipeline/test-results.md. If any test failed, stop and show me the failures. If any tests are NOT RUN, list them and the environment they need.
4. Delegate to the reviewer subagent. Show me .pipeline/review.md.
5. Report the final verdict. Do not merge anything, tag a release, or run the tool on any real evidence. Leave the branch for human review and independent validation.
```

\---

## WORKED EXAMPLES

### Example 1: Extending Thunderbird

```
/ship build a Thunderbird email collection and analysis tool: read the profile's mail stores (mbox and index files) from a hash-verified working copy, never launching Thunderbird against the original profile, and add keyword/date/participant filtering, attachment extraction with per-file hashes, header analysis, and a report separating raw message data from the tool's analysis
```

Things the Planner should surface in `integration-profile.md` and the spec:

* Thunderbird can modify a profile just by opening it (for example rebuilding indexes or compacting folders). The safe design reads the stored data directly from a verified copy, or documents the effect if the app must be run.
* Which parts of the profile matter (mail folders, indexes, the global search database, account settings), what is raw data, and what is derived.
* Three integration options with different risk: parse the files read-only (lowest risk), automate through supported extension interfaces, or drive the application. The spec should choose one and justify it.
* Message encodings, malformed headers, and large attachments as edge cases for the Tester.
* MPL 2.0 licensing implications for anything bundled or modified, flagged for counsel.

### Example 2: A streamlined macOS targeted-collection tool around `ditto` and sparsebundles

```
/ship build a macOS targeted collection tool that uses ditto to copy user-selected paths into a sparsebundle created with hdiutil, with pre-flight checks (OS version, permissions, free space), a before/after SHA-256 manifest of source and collected files, independent source-vs-copy verification, a hash-chained audit log, and a plain-language report that clearly states this is a logical targeted collection
```

Things the Planner should surface:

* **Document vs. test.** Check `man ditto` and `man hdiutil` for the target macOS versions. Whether `ditto` preserves each metadata type (timestamps, extended attributes, ACLs, resource forks, quarantine flags) is flag- and version-dependent, so those items are MUST-TEST-EMPIRICALLY. The same goes for access-time changes on the source.
* **Independent verification.** `ditto` doesn't produce a hash manifest. The wrapper builds one from the source before copying and compares it with the mounted sparsebundle contents afterward, and also verifies the image container. Any mismatch is a hard failure.
* **Permissions.** Reads blocked by macOS privacy controls (Full Disk Access) must be detected and reported, never skipped.
* **Scope honesty.** This is a targeted logical collection, not a forensic image. The report states what was selected, what was skipped, and why. If run on a live system, the operator's order-of-volatility decisions are logged.
* **Image handling.** Record the sparsebundle's format, filesystem, size settings, and band structure, plus how it was mounted, how it was unmounted, and its final hash or per-file manifest. State which of those artifacts is the preserved original.
* **Platform testing.** The Tester will likely mark the macOS-only tests NOT RUN in a Linux sandbox. Run them on a macOS CI runner or a test Mac and attach the results before the validation is accepted.

\---

## THE COST MODEL

Planner (Opus) and Reviewer (Opus) run once per feature and set and check quality. Coder and Tester (Sonnet) produce most of the tokens against a clear spec. Pricing changes, so check current rates.

\---

## OVERNIGHT USE, AND WHAT MUST STILL HAPPEN BY HAND

**Before bed:** create a branch, run `/ship` with a specific request, and close the laptop.

**In the morning:** read `review.md`, then read `integration-profile.md`, `spec.md`, `changes.md`, and `test-results.md` yourself. You'll be the one explaining the tool under oath. If the verdict is SHIP-TO-HUMAN-VALIDATION, the human work begins:

1. Review the code line by line, especially the adapter and core layers.
2. Run the NOT RUN tests on the required platforms.
3. Validate independently on your own known-good datasets, ideally alongside a second established tool or a manual run of the upstream tool, and compare.
4. Write the formal validation report: scope, method, datasets, results, upstream tool and OS versions covered, known limitations and error rates, and the hash of the validated build. Follow your lab's SOP and ISO/IEC 17025/17020 where applicable.
5. Get a second qualified person to peer-review the validation.
6. Tag and hash the release. Only that build, with only the validated upstream versions, goes into casework.
7. **Re-validate whenever the tool, its dependencies, or an upstream tool or OS version changes.** Upstream updates are the most common way a validated wrapper silently stops being valid.

The pipeline never merges anything, and AI output never replaces examiner validation.

\---

## TIPS

* **Write specific requests.** Name the upstream tool, the exact outputs, the verification you want, and what the report must say about scope.
* **Keep one profile per upstream tool** in `docs/upstream-tools/`. Review them yourself, since they're the backbone of your validation documentation.
* **Run characterization tests on every new upstream version.** Keep them as a regression suite so you notice behavior changes immediately.
* **Keep the adapter thin.** The smaller the code that touches evidence and upstream tools, the easier it is to validate and explain.
* **Show your work in the UI.** Let examiners expand to see the exact command, versions, raw output, and verification results. A friendly interface that hides these will be hard to defend.
* **Treat evidence files and upstream output as hostile input.** Fuzz your parsers.
* **Keep AI out of the evidence path.** Use the pipeline to build the tool. The shipped tool must be deterministic and must not call LLMs or external services while processing evidence. If you later add AI-assisted triage, treat its output as leads only, document it as such, and keep a human responsible for conclusions.
* **Archive, don't delete, `.pipeline/`.** Commit the archive with the release it describes, since it's part of your development and validation record.
* **Pin and record everything:** lockfiles, toolchains, SBOMs, build hashes, validated upstream versions.
* **Use git worktrees** for parallel features.
* **Be prepared to disclose** how the tool was built and validated, including AI-assisted development. The archive and validation report are your answer.

