# Forensic Requirements for Digital Evidence Tools

> This document governs all evidence-touching operations in DittoSuite and any wrapper tool in this repository. Every design decision, feature, and implementation must comply with these requirements. This is a living document aligned with U.S. federal court admissibility standards, DFIR best practices, and international forensic standards.

---

## 1. THE CORE PRINCIPLE: WRAP, DON'T HIDE, DON'T REPLACE

When you build on an existing tool, three rules govern every design decision.

1. **Wrap.** Call the established tool to do the evidence-touching work, using its documented interface. Don't reimplement a copier, a filesystem parser, or a mail store reader unless you must. The upstream tool's track record, community scrutiny, and published behavior carry weight in court. Your reimplementation has none.
2. **Don't hide.** Streamlining the workflow must never hide what happened. The exact command run, the upstream tool's version, its raw output, its exit code, and every warning must be captured, preserved, and visible in the report. "User friendly" means fewer steps for the examiner, not less information for the court.
3. **Don't replace the trusted result with your own.** Where your tool adds value (a hash manifest, a summary, an analysis), it is clearly labeled as the *wrapper's* output and kept separate from the *upstream tool's* output.

---

## 2. EVIDENCE INTEGRITY

### 2.1 Source preservation

* **Never modify the source.** Where the upstream tool could touch the source (indexing, compaction, atime updates, lock files, cache writes), the design either prevents it or documents it as a known effect.
* **Isolate the source.** For local media, use hardware or verified software write-blockers during acquisition. For remote sources (IMAP, APIs), use read-only connections and document that the protocol does not alter server-side state unless explicitly noted (e.g., IMAP `\Seen` flag behavior must be documented).
* **Preserve before interpretation.** The examiner's first job is to protect sources before normal use changes them. Collection takes priority over analysis.

### 2.2 Hashing

* **Hash everything.** Use SHA-256 as the minimum integrity check. SHA-512 is acceptable as a primary or supplementary hash.
* **Legacy compatibility.** MD5 and SHA-1 may be recorded alongside SHA-256 for tool compatibility and legacy cross-referencing, but never as the sole integrity check. MD5 has known collisions (2004) and SHA-1 was broken for adversarial use (SHAttered, 2017).
* **Hash at every stage.** Record hashes at:
  - Initial acquisition/collection
  - Every custody transfer
  - Working-copy creation
  - Every tool processing step
  - Exhibit preparation for court
* **Mismatch handling.** A hash mismatch is a chain-of-custody break. It must be immediately documented and explained. Recalculating and substituting a new hash without disclosure is a serious failure. Analysis performed after an undisclosed mismatch is suspect and may be inadmissible.

### 2.3 Independent verification

* **Don't trust the upstream tool's own success message as the sole proof.** After a copy or acquisition, the wrapper re-reads and compares source and output with its own hashing.
* **Hashing shows the data reviewed matches the data collected.** It does not prove authenticity or admissibility on its own; it is one element of the authentication foundation.

### 2.4 No silent skips

* Unreadable files, permission denials (e.g., macOS TCC / Full Disk Access gaps), truncated reads, upstream warnings, and connection failures are logged with paths, timestamps, and reasons.
* The collection is labeled **partial** when it is, with a clear accounting of what was and was not collected and the selection criteria.
* Flag gaps early: wiped devices, closed retention windows, platforms that don't export message content, encryption barriers, rolled logs, deleted accounts, and media failure.

---

## 3. CHAIN OF CUSTODY AND AUDITABILITY

### 3.1 Definition

Chain of custody is a documented, chronological record of every person and organization who collected, transferred, accessed, analyzed, or stored an evidence item, with timestamps, cryptographic hashes, and the purpose of each event. It tracks evidence from acquisition through safeguarding, analysis, and presentation (NIST SP 800-86).

### 3.2 Audit log requirements

Each run produces an **append-only, tamper-evident audit log** containing:

| Field | Description |
|---|---|
| **Tool identification** | Tool name, version, git commit hash, build hash |
| **Operator** | Examiner name, ID, and qualifications |
| **Environment** | Hostname, OS version, UTC start and end times with time source |
| **Legal authority** | Warrant, consent, order, or policy reference and scope |
| **Arguments** | Full invocation arguments and configuration |
| **Input identifiers** | Source system, account, device, or media identifier |
| **Output identifiers** | Output file paths, format, and location |
| **Hash values** | All computed hashes (SHA-256 minimum) at acquisition and verification |
| **Upstream tool record** | Name, version, binary hash, invocation, exit code, stdout, stderr |
| **Transfer history** | Every custody transfer with date, time, parties, method, and purpose |
| **Storage location** | Where evidence is stored at each stage |
| **Exceptions** | Any errors, warnings, skips, mismatches, or anomalies |

### 3.3 Append-only integrity

* Existing entries are **never modified or overwritten**.
* Errors are corrected with a new dated entry that references the prior error and is signed by the correcting custodian.
* Electronic evidence management systems are acceptable if they provide append-only entries, authenticated transfers, and cryptographic log integrity.

### 3.4 Transfer documentation

Every custody transfer records:
- Unique evidence identifier
- Date and time (UTC)
- Releasing party (name, signature)
- Receiving party (name, signature)
- Method of transfer
- Purpose of transfer
- Hash verification before and after
- Condition of evidence and any seal status

### 3.5 Separate analytical log

Actions performed during examination are recorded in an analytical log that complements but does not replace the custody record. This includes: search terms used, filters applied, tools and versions, settings, and the method used to find each artifact (keyword search, hash comparison, timeline filter, manual review).

---

## 4. REPEATABILITY AND REPRODUCIBILITY

* **Same input gives same output**, apart from documented nondeterministic fields.
* **Repeatable:** The same operator, equipment, and lab produce the same result.
* **Reproducible:** Different equipment, labs, and operators produce the same result.
* Builds and dependencies are pinned and tagged. The validated binary is the one used in casework.
* Where the data source is remote (an API), the live data can change, so the **raw responses are preserved and hashed**. Reproducibility then means re-processing the preserved responses.
* Tools and techniques must be scientifically valid, proven accurate through empirical testing.

---

## 5. VALIDATION AND KNOWN ERROR RATES

* Test against known ground truth (NIST CFReDS-style datasets or synthetic data where every artifact is known).
* Record expected vs. actual, pass/fail criteria, and limitations.
* *Daubert*-style scrutiny asks about: testing, error rates, controlling standards, peer review, and general acceptance.
* Document the tool's known limitations: what it preserves, what it doesn't, and what artifacts it cannot recover.

---

## 6. UPSTREAM-TOOL CONTROLS (SPECIFIC TO WRAPPERS)

* **Identify and pin the upstream tool.** Record its name, version, build or OS version, absolute path, and the SHA-256 of the binary that was actually executed. For OS-bundled tools, record the OS version and build.
* **Record the exact invocation.** Store the argument array, working directory, scrubbed environment, locale/timezone, start and end times, exit code, and raw stdout and stderr, hashed and kept unmodified.
* **Invoke safely.** No shell interpolation (use argument arrays, never `shell=True` or string-built commands), no user-controlled strings in commands without validation, absolute paths to binaries, explicit timeouts, and explicit environment.
* **Characterize the upstream tool's behavior.** Document, from vendor documentation *and* empirical testing, what it preserves and what it doesn't: timestamps, extended attributes, ACLs, resource forks, permissions, symlinks, hard links, sparse files, special files. Document side effects on the source such as access-time changes or index writes.
* **Detect upstream drift.** Behavior can change with an OS update, an app update, or an API change. The tool records versions at runtime, compares them against a validated allow-list, and **warns or refuses** when the upstream version is not validated.
* **Never modify the upstream tool.** Don't patch binaries or monkey-patch libraries. Extend by wrapping, adding add-ons through supported interfaces, or reading the tool's data files.
* **Supply chain.** Verify the integrity of upstream downloads (signatures or published checksums), pin dependencies with lockfiles, and generate an SBOM for each release.

---

## 7. ACQUISITION AND IMAGING

### 7.1 Write-blocking

* **Hardware write blockers** are the gold standard for local media acquisition. They interpose at the interface level, independent of host software.
* **Software write blockers** (e.g., read-only mounts, `blockdev --setro`) are acceptable only in characterized environments with verified behavior.
* **Document the write blocker:** make, model, serial number, and firmware version. Omitting this invites courtroom challenges.
* NIST CFTT publishes validation test results for write blockers and forensic tools.

### 7.2 Imaging formats

* **Bit-for-bit images** capture every byte, including unallocated space, slack space, and file system metadata.
* Acceptable formats: EWF (E01) with embedded metadata and hashes, raw `dd` with metadata sidecar, AFF/AFF4.
* For email collection (logical acquisition): preserve raw RFC 5322 `.eml` source with per-message hashing.

### 7.3 Remote/API acquisition

* For IMAP and API-based collection, document the protocol behavior, connection parameters, TLS version, and any server-side effects.
* Preserve raw server responses before any parsing or transformation.
* Record timezone, clock assumptions, and any UTC normalization applied.
* Document rate-limiting, pagination, and session handling.

---

## 8. EVIDENCE HANDLING, STORAGE, AND TRANSPORTATION

### 8.1 Physical evidence

* **Sealed storage:** Use tamper-evident bags with unique serial numbers, signed across the seal. Seal breaches must be recorded.
* **Evidence rooms:** Access control with limited keyholders, badge logging, and video surveillance. Per-case access controls preferred over shared storage.
* **Environmental controls:** Protect magnetic media from magnetic fields, humidity, and temperature. Protect optical media from heat and UV. Flash media may need periodic power application for long-term storage.
* **Transport:** Use tamper-evident containers, signed receipts at each handoff, and documentation that allows reconstruction of the route.
* **A broken physical seal is a chain failure even if the hash still verifies.**

### 8.2 Digital evidence storage

* Store evidence in encrypted, access-controlled locations.
* Log every access to stored evidence.
* Maintain backup copies with independent hash verification.
* Retention policies must comply with applicable legal holds and jurisdictional requirements.

---

## 9. U.S. LEGAL FRAMEWORK FOR ADMISSIBILITY

### 9.1 Federal Rules of Evidence

| Rule | Application to digital evidence |
|---|---|
| **FRE 401–402** | Relevance: evidence must make a fact more or less probable |
| **FRE 901(a)** | Authentication: proponent must offer enough evidence to support a finding that the item is what it is claimed to be (prima facie showing) |
| **FRE 901(b)(1)** | Witness with knowledge (custodian, examiner) testifies to the chain |
| **FRE 901(b)(4)** | Distinctive characteristics (hash values, file headers, metadata) authenticate an item |
| **FRE 901(b)(9)** | Evidence that a process or system produces accurate results (write-blockers, forensic imagers) |
| **FRE 902(13)** | Self-authentication: machine-generated records with certification |
| **FRE 902(14)** | Self-authentication: forensic copies verified by hash with qualified person's certification |
| **FRE 702** | Expert testimony: methods must be reliable (Daubert factors) |
| **FRE 801, 803** | Chain of custody proves authenticity, not hearsay exceptions. Machine output is generally not hearsay. Human statements need an exception (803(6) business records, 803(8) public records) |
| **FRE 1001–1004** | Best evidence: printouts and forensic copies that accurately reflect electronic data count as originals |
| **FRE 403** | A poorly documented chain can lead to exclusion as confusing or unfairly prejudicial |

### 9.2 Daubert standard and FRE 702

The *Daubert v. Merrell Dow Pharmaceuticals* (1993) standard, extended by *Kumho Tire v. Carmichael* (1999) to all expert testimony including technical and specialized knowledge, requires the court to evaluate:

1. **Testability:** Can the method be and has it been tested?
2. **Peer review and publication:** Has it been subjected to peer review?
3. **Error rate:** What is the known or potential error rate?
4. **Standards:** Are there controlling standards governing the technique?
5. **General acceptance:** Is the method generally accepted in the relevant community?

The **2023 amendment to FRE 702** (effective December 1, 2023) clarified that the proponent must demonstrate by a preponderance of the evidence that expert testimony satisfies the rule's requirements. Courts must treat the factors as admissibility questions (for the judge), not weight questions (for the jury).

### 9.3 Self-authentication certification (FRE 902(14))

Certifications for forensic copies should be signed under penalty of perjury (28 U.S.C. § 1746) and state:
- Signer's qualifications
- Source identification
- Tool and version used
- Date and time of acquisition
- Hash algorithm and value
- Resulting file identification

### 9.4 ESI admissibility sequence (Lorraine v. Markel)

*Lorraine v. Markel American Insurance Co.*, 241 F.R.D. 534 (D. Md. 2007), established a five-step ESI admissibility framework cited by federal circuits and state courts:

1. **Relevance** (FRE 401)
2. **Authenticity** (FRE 901–902) — where chain of custody mainly matters
3. **Hearsay** (FRE 801–807)
4. **Original writing** (FRE 1001–1008)
5. **Unfair prejudice** (FRE 403) — where gaps in the chain can be raised

### 9.5 Civil discovery and preservation

* **FRCP 26 and 34** govern disclosure and production of ESI. The chain effectively starts at the litigation hold.
* **Duty to preserve** attaches when litigation is reasonably anticipated, which may be well before a complaint.
* **FRCP 37(e) (2015 amendment)** applies when lost ESI cannot be restored or replaced:
  - **37(e)(1):** Curative measures no greater than necessary to cure prejudice.
  - **37(e)(2):** Requires intent to deprive. Remedies include adverse inference, presumption, dismissal, or default. Negligence alone is not enough.
* **Litigation hold:** Identifies custodians and systems, suspends auto-deletion, and must be enforced in practice.

### 9.6 Common chain-of-custody failures and consequences

| Failure | Likely response |
|---|---|
| Acquisition without a write-blocker | FRCP 37(e)(1); re-acquire if possible |
| Acquisition hash not recorded | 37(e)(1); verification hash and testimony often suffice |
| Unexplained hash mismatch | 37(e)(1) or (e)(2); possible FRE 403 exclusion |
| Late litigation hold, data overwritten | 37(e)(2) if intent found; adverse inference common |
| Auto-delete not suspended | 37(e)(2) if deliberate |
| Mobile device wiped after seizure | 37(e)(2); adverse inference or default risk |
| Working copy without master-copy log | 37(e)(1); testimony plus hash verification |
| Undocumented transfers | Weight reduction; possible suppression |
| Recalculated hashes after undisclosed mismatch | Severe credibility damage; potential exclusion |

### 9.7 State-specific considerations

* **California:** Evid. Code §§ 1552–1553 presume printouts and digital images accurate unless rebutted.
* **New York:** CPLR 4543 and 4518 govern business records; no formal FRE 902(14) analog.
* **Texas:** Rules 901–902 mirror federal 902(13) and (14).
* **Florida:** Statutes §§ 90.901–90.902 align with federal self-authentication.

---

## 10. INTEGRATION-SPECIFIC LEGAL AND DATA-HANDLING REQUIREMENTS

| Area | Requirement |
|---|---|
| **Authorization and scope** | Require the operator to record the legal authority (warrant, consent, order, policy) and scope before collection, and embed it in the audit log. |
| **Targeted vs. full collection** | A targeted logical collection is not a forensic image. The report must state exactly what was and was not collected, and the selection criteria. |
| **Live-system collection** | Collecting from a running system alters system state and risks volatile data loss. Support documenting the order of volatility and the operator's decisions. |
| **Third-party APIs** | Honor the API's terms of service, authentication requirements, and rate limits. Credentials are handled via a secrets store, never logged or hard-coded. Provider-held content may require specific legal process (e.g., SCA/ECPA in the US). |
| **Data egress** | Evidence must not leave the controlled environment unintentionally: no telemetry, no cloud calls, no update checks during evidence processing unless explicitly documented. |
| **Privileged / personal / protected data** | Support access controls, minimization, and filter-team workflows for privileged material, plus privacy regimes (GDPR, HIPAA). |
| **Access controls and encryption** | No bypassing outside explicit authorization. Anything touching encrypted volumes, credentials, or keychains needs explicit authorization handling. |
| **Rules of evidence** | Output should support authentication (FRE 901), self-authentication through certified process (FRE 902(13)/(14)), and best-evidence considerations (FRE 1001–1004). Expert testimony faces FRE 702 and *Daubert*/*Frye*. |
| **Anti-forensics awareness** | Document and detect indicators of anti-forensic techniques: encryption, steganography, artifact wiping, timestamp manipulation, and digital trail obfuscation. |

---

## 11. COLLECTION PLANNING AND DOCUMENTATION

### 11.1 Pre-collection planning

* Identify likely sources and agree on a collection plan before touching devices or exporting accounts.
* Document which sources will be preserved, who controls each, the collection method, and which sources are unavailable.
* Choose between forensic (bit-stream) and logical (file-level) collection, between metadata-only exports, full-disk images, targeted collections, or a combination. **Record the rationale for each choice.**
* Prioritize collection by evidence value and volatility (order of volatility).

### 11.2 Sources to preserve

Email collection may involve: endpoint storage, cloud audit records, email headers, collaboration platform exports, mobile backups, removable-media traces, browser downloads, document metadata, account security logs, file-system records, device history, application traces, and backups. No single source should be treated as complete.

### 11.3 Metadata and timestamp handling

* Metadata can include creation and modification times, software versions, file paths, sender and recipient fields, routing headers, access records, sync indicators, export markers, download indicators, and deletion indicators.
* Timestamps can reflect copying, exporting, scanning, timezone settings, cloud behavior, or updates. **Always record which timestamp was used and its source.**
* Compare artifacts across sources and document timezone, clock, and export assumptions explicitly.
* Disclose all transformations: UTC normalization, stripped metadata, re-encoded attachments.

### 11.4 Reporting requirements

Reports must cover:
- Collection method and source condition
- Cryptographic hashes at each stage
- Artifacts reviewed and their significance
- Relevant timestamps with timezone documentation
- Recovered items and their provenance
- Limitations and gaps in the collection
- Alternative explanations where applicable
- Clear distinction between originals, copies, exports, screenshots, synced files, and reconstructed artifacts
- Clear separation of forensic observations from legal conclusions

---

## 12. ACPO/NPCC PRINCIPLES FOR DIGITAL EVIDENCE

The UK Association of Chief Police Officers (ACPO, now NPCC, 2012) principles are widely adopted internationally:

1. **Principle 1:** No action taken by law enforcement agencies, persons employed within those agencies, or their agents should change data that may subsequently be relied upon in court.
2. **Principle 2:** In circumstances where a person finds it necessary to access original data, that person must be competent to do so and be able to give evidence explaining the relevance and the implications of their actions.
3. **Principle 3:** An audit trail or other record of all processes applied to digital evidence should be created and preserved. An independent third party should be able to examine those processes and achieve the same result.
4. **Principle 4:** The person in charge of the investigation has overall responsibility for ensuring that the law and these principles are adhered to.

---

## 13. STANDARDS AND REFERENCES

### 13.1 International standards

| Standard | Scope |
|---|---|
| **ISO/IEC 27037:2012** | Identification, collection, acquisition, and preservation of digital evidence |
| **ISO/IEC 27041:2015** | Assuring suitability and adequacy of incident investigative methods |
| **ISO/IEC 27042:2015** | Analysis and interpretation of digital evidence |
| **ISO/IEC 27043:2015** | Incident investigation principles and processes |
| **ISO/IEC 17025** | Testing and calibration laboratory competence |
| **ISO/IEC 17020** | Inspection body competence |

### 13.2 NIST publications

| Publication | Scope |
|---|---|
| **NIST SP 800-86** | Guide to Integrating Forensic Techniques into Incident Response (four-phase process: Collection, Examination, Analysis, Reporting) |
| **NIST SP 800-101 Rev. 1** | Mobile device forensics |
| **NIST IR 8387** | Cloud forensics |
| **NIST CFTT** | Computer Forensics Tool Testing Program (test methodologies and validation results for forensic software and write blockers) |
| **NIST CFReDS** | Computer Forensic Reference Data Sets (ground-truth test data) |

### 13.3 Professional body guidance

| Source | Scope |
|---|---|
| **SWGDE** | Best practices for computer forensic examination, digital evidence collection, and forensic acquisitions (US) |
| **ENFSI** | Best practice manual for forensic examination of digital technology (EU) |
| **ACPO/NPCC (2012)** | Good Practice Guide for Digital Evidence (UK, four principles) |
| **ASTM E2916** | Forensic terminology and accreditation alignment |
| **Sedona Principles, Third Edition** | ESI discovery proportionality and preservation decisions |

### 13.4 CISA guidance

* **CISA Insights: Chain of Custody and Critical Infrastructure Systems** — Framework with five actionable steps for securing chain of custody for physical and digital assets. Documents that without secure chain-of-custody practices, critical infrastructure systems, assets, and data could be accessed and manipulated by threat actors.

### 13.5 Emerging areas

* **Cloud computing:** ISO/IEC 27037 was not designed for cloud environments. The Cloud Security Alliance (2013) published guidance mapping 27037 to cloud computing.
* **IoT and smart vehicles:** Emerging areas requiring dedicated forensic processes, standards, and tools.
* **Anti-forensics:** Tools and techniques that remove, alter, or obstruct evidence (encryption, steganography, artifact wiping, spoofing, proxy servers). Investigators must document and address these.
* **AI-generated evidence:** Proposed FRE 707 (Advisory Committee draft, August 2025) would apply Rule 702-style reliability standards to machine-generated output offered without an expert. Status pending adoption.

---

## 14. KEY CASE LAW

| Case | Significance |
|---|---|
| **Daubert v. Merrell Dow Pharmaceuticals, 509 U.S. 579 (1993)** | Established judge's gatekeeping role for expert reliability; five-factor test |
| **General Electric Co. v. Joiner, 522 U.S. 136 (1997)** | Abuse-of-discretion standard for admissibility rulings |
| **Kumho Tire Co. v. Carmichael, 526 U.S. 137 (1999)** | Extended Daubert to all expert testimony, including technical and specialized knowledge |
| **Lorraine v. Markel American Insurance Co., 241 F.R.D. 534 (D. Md. 2007)** | Five-step ESI admissibility framework; cited by federal circuits and state courts |

---

## 15. TOOL-SPECIFIC COMPLIANCE CHECKLIST

For DittoSuite and any tool governed by this document:

- [ ] SHA-256 hashing at acquisition, transfer, and verification
- [ ] Append-only audit log with all required fields (Section 3.2)
- [ ] Legal authority and scope recorded before collection begins
- [ ] Upstream tool version, binary hash, and invocation recorded
- [ ] No source modification; read-only connections documented
- [ ] Partial collections labeled with gap accounting
- [ ] Hash mismatches immediately documented and explained
- [ ] Every custody transfer logged with parties, timestamps, and hashes
- [ ] Examiner ID, name, and qualifications recorded
- [ ] Timezone, clock, and transformation assumptions documented
- [ ] Independent hash verification after acquisition
- [ ] No telemetry, cloud calls, or update checks during evidence processing
- [ ] Credentials handled via secrets store, never logged
- [ ] Tool validation against known ground truth documented
- [ ] SBOM and pinned dependencies for each release
