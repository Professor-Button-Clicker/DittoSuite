# FEC v4.5.888.111 vs SherlockMail — Feature Gap Analysis

> **Produced by**: REA reverse-engineering analysis of `FEC.Core.dll` (3.5 MB, 1,070 types, 8,749 methods)
> **Date**: 2026-10-17
> **Method**: Exhaustive enumeration of all managed types via `inspect_analysis_view` (11 pages, offsets 0–1070, `exhausted: true`)

---

## Executive Summary

FEC (Forensic Email Collector) by Metaspike is a mature .NET forensic email tool with **1,070 types** and **8,749 methods** in its core engine alone. SherlockMail currently implements the essential collection-and-export pipeline but is missing **35 significant features** that FEC offers. The gaps fall into 7 categories: Forensic Integrity, Protocol & Provider Coverage, Cloud & Drive Collection, Export & Containerization, Search & Filtering, Automation & Operations, and Security & Cryptography.

---

## Category 1: Forensic Integrity & Timestamping

### Gap 1 — RFC 3161 Trusted Timestamping
| | FEC | SherlockMail |
|---|---|---|
| **What** | External RFC 3161 TSA server integration | Internal SHA-256 hash-based timestamps |
| **Evidence** | `Metaspike.FEC.Core.Timestamping.TimestampClient` (10 methods): `GetTimestampForFile`, `ValidateTimestampServer`, `PrepareTimestampRequestAndResponseForHash` |  `TimestampService.createTimestamp()` generates local hash-only tokens |
| **Impact** | FEC timestamps are **legally trusted** — signed by an independent TSA with a certificate chain traceable to a root CA. SherlockMail's timestamps are self-signed and carry no third-party trust. |

**FEC types involved:**
- `TimestampClient` — 10 methods (async: GetTimestampForFile, ValidateTimestampServer)
- `TimestampVerificationClient` — 12 methods (ValidateTimestampForFile, VerifyTimestamp)
- `TimestampingSettings` — 11 methods, 4 fields
- `TimestampPackage` — 12 methods, 6 fields
- `TimestampValidationPackage` — 8 methods, 5 fields
- `TimestampValidationResult` — 25 methods, 10 fields

---

### Gap 2 — Multi-Algorithm Hashing
| | FEC | SherlockMail |
|---|---|---|
| **What** | SHA-256, MD5, SHA-1, SHA-384 simultaneously | SHA-256 only |
| **Evidence** | `Metaspike.FEC.Core.Hash.HashManager` (7 methods), 5 hash algorithm types, 12+ specialized hash result types (MimeHashResult, MsgHashResult, DriveAttachmentHashResult, etc.) | `crypto.createHash('sha256')` throughout |
| **Impact** | Courts and eDiscovery platforms often require MD5 + SHA-1 + SHA-256 triple-hashing for cross-platform verification. SherlockMail can only prove integrity via one algorithm. |

---

### Gap 3 — Folder Snapshot Capture
| | FEC | SherlockMail |
|---|---|---|
| **What** | Time-stamped folder-state snapshots before/after collection | Folder list saved but not time-stamped snapshots |
| **Evidence** | `AcquisitionSession.CaptureSnapshotsOfFolders`, `CaptureFolderListIfNecessary` | `saveFolders()` stores folder list at collection time |
| **Impact** | FEC can prove what folders existed at acquisition start vs. end, detecting server-side changes during collection. |

---

## Category 2: Protocol & Provider Coverage

### Gap 4 — Yahoo OAuth
| | FEC | SherlockMail |
|---|---|---|
| **What** | Native Yahoo OAuth 2.0 connector | IMAP/POP3 with app password only |
| **Evidence** | `Metaspike.FEC.Core.OAUTH.Yahoo.YahooOauthConnector` (26 methods), `YahooToken`, `YahooTokenInfo`, `YahooOauthResponse` | Yahoo provider listed with IMAP preset only |
| **Impact** | Yahoo has deprecated app passwords for most accounts. OAuth is now required for reliable collection. |

---

### Gap 5 — Enterprise App (App-Only) Authentication
| | FEC | SherlockMail |
|---|---|---|
| **What** | Microsoft 365 app-only (service principal) auth for unattended access | Delegated user OAuth only |
| **Evidence** | `Metaspike.FEC.Core.OAUTH.EnterpriseAppCredentials` (30 methods) — app-only auth with client certificates | `microsoft-oauth.js` uses authorization code flow only |
| **Impact** | Cannot collect from Microsoft 365 mailboxes without the user interactively signing in. Enterprise/forensic collections need app-only auth with admin consent for unattended bulk collection. |

---

### Gap 6 — Exchange-Specific Advanced Features
| | FEC | SherlockMail |
|---|---|---|
| **What** | Recoverable Items (litigation hold), Public Folders, Archive mailbox, Inbox Rules export, Exchange version auto-detection | Basic EWS message collection |
| **Evidence** | EWS client (`EditorConfiguration`, 45 methods): `AddEwsArchiveFolders`, `AddEwsRecoverableFolders`, `AddEwsPublicFolders`, `GetInboxRules`, `AutoDetectExchangeVersion` | `ews-handler.js` — basic folder/message operations |
| **Impact** | Recoverable Items contains deleted/purged items under litigation hold — critical for forensic investigations. Public Folders and Archive Mailboxes are separate data stores often overlooked. |

---

### Gap 7 — Google Takeout / Local Vault Import
| | FEC | SherlockMail |
|---|---|---|
| **What** | Import from Google Takeout MBOX exports and local PST/MBOX/EML files | No local import |
| **Evidence** | `Metaspike.FEC.Core.Settings.TakeoutServerSettings` (20 methods, 7 fields), `LocalVaultServerSettings` (31 methods, 11 fields) | No import functionality |
| **Impact** | Cannot process previously exported data, offline archives, or Google Takeout exports. Limits use in scenarios where live server access isn't available. |

---

### Gap 8 — Remote Auth / Token Import
| | FEC | SherlockMail |
|---|---|---|
| **What** | Import OAuth tokens from other sessions or machines | Each session must authenticate independently |
| **Evidence** | `Metaspike.FEC.Core.RemoteAuth.TokenImporter` (8 methods), `ImportedTokenInfo` (11 methods), `CustomTokenType` (4 values) | OAuth flow per session |
| **Impact** | In field operations, authentication may happen on one machine and collection on another. Token import enables this workflow. |

---

### Gap 9 — Azure Sovereign Cloud Support
| | FEC | SherlockMail |
|---|---|---|
| **What** | Azure Global, China, US Government, Germany, US DoD, custom | Hard-coded to global Azure/Graph endpoints |
| **Evidence** | `Metaspike.FEC.Core.Azure.AzureCloudConfiguration` (14 methods), `AzureCloudEnvironment` (6 values) | `microsoft-oauth.js` uses `login.microsoftonline.com` / `graph.microsoft.com` |
| **Impact** | Cannot collect from US Government (.us), China (21Vianet), or other sovereign Microsoft 365 environments. |

---

## Category 3: Cloud & Drive Collection

### Gap 10 — Google Drive Direct Collection
| | FEC | SherlockMail |
|---|---|---|
| **What** | Full Google Drive acquisition with items, revisions, shared drives, folder hierarchy | Link detection only |
| **Evidence** | Gmail client (78 methods): `AddSharedDrives`, `DownloadDriveItems`, `GetStorageQuotaReport`; `GoogleDriveItemInfo` (42 methods), `GoogleDriveRevisionInfo` (21 methods); `DriveAcquisitionMode` (9 values!) | `CloudAttachmentService.scanMessages()` detects links but doesn't download |
| **Impact** | Modern investigations require cloud storage collection. FEC collects entire Drive contents with full revision history. SherlockMail only identifies that links exist. |

**FEC types involved (Drive):**
- `DriveAcquisitionMode` — 9 acquisition modes
- `GoogleDriveItemInfo` — 42 methods
- `GoogleDriveRevisionInfo` — 21 methods
- `GoogleDriveFolderInfo`, `GoogleDriveAttachmentInfo` (35 methods)
- `DirectGoogleDriveItemInfo`, `DirectDriveRevisionInfo`
- `DirectDriveTreePopulator`, `DirectDriveTreeNode`
- `RevisionToMessageMapper` — links drive revisions to email messages
- `DriveRevisionDateDeterminationInfo`

---

### Gap 11 — OneDrive Direct Collection
| | FEC | SherlockMail |
|---|---|---|
| **What** | Full OneDrive acquisition with revisions | No OneDrive collection |
| **Evidence** | Graph client (72 methods): `AddOneDrives`, `ListRevisionsForDriveItems`, `DownloadDriveItems`; `OneDriveItemInfo` (44 methods), `OneDriveRevisionInfo` | Cloud link detection only |
| **Impact** | OneDrive for Business is tightly integrated with Microsoft 365. Cannot collect files shared via OneDrive links. |

---

### Gap 12 — SharePoint Collection
| | FEC | SherlockMail |
|---|---|---|
| **What** | SharePoint site enumeration and document collection | SharePoint link detection only |
| **Evidence** | Graph client: `AddSharePoint`, `AddDrivesOfSharePointSite`, `GetListOfSharePointSites`; `SharePointPlaceholderFolderInfo` | SharePoint regex in `CloudAttachmentService` |
| **Impact** | Cannot collect documents from SharePoint sites referenced in emails. |

---

### Gap 13 — Google Calendar Collection
| | FEC | SherlockMail |
|---|---|---|
| **What** | Calendar event collection | No calendar support |
| **Evidence** | Gmail client: `GetGoogleCalendars`, `BatchDownloadCalendarItems`, `AddCalendarSearchResultsToResultsPackage`; `GoogleCalendarInfo`, `GoogleCalendarEventInfo` | Not implemented |
| **Impact** | Calendar events may contain critical evidence (meeting invites, scheduling, etc.) that can't be collected. |

---

### Gap 14 — Contact Folder Collection
| | FEC | SherlockMail |
|---|---|---|
| **What** | Contact collection from Exchange/Graph | No contact support |
| **Evidence** | Graph client: `AddContactFolders`, `ListItemsInContactFolder`; `GraphContactFolder`, `ContactMetadataInfo` (41 methods, 19 fields) | Not implemented |
| **Impact** | Contact lists are relevant evidence showing relationships between parties. |

---

### Gap 15 — Cloud Attachment Download Pipeline
| | FEC | SherlockMail |
|---|---|---|
| **What** | Full staging, download, and packaging of cloud attachments | Link scanning only |
| **Evidence** | `CloudAttachmentStager` (16 methods): `StageCloudAttachments`, `StageCloudAttachmentsAutomatically`, `StageCloudAttachmentsPostAcquisition`; `CloudAttachmentPackager` (11 methods); `CloudAttachmentArchivePackage` | `CloudAttachmentService.scanMessages()` returns links without downloading |
| **Impact** | Detected cloud links become dead references. FEC downloads and preserves the actual files with hash verification. |

---

## Category 4: Export & Containerization

### Gap 16 — VHDX Container Export
| | FEC | SherlockMail |
|---|---|---|
| **What** | Package exports into forensic VHDX containers | No container support |
| **Evidence** | `Metaspike.FEC.Core.Container.ContainerPacker` (27 methods): `ContainerizeMimeOutput`, `ContainerizeMsgOutput`, `ContainerizeDirectDriveOutput`, `CreateAndPopulateNativeVhdx`, `CreateAndPopulateDirectVhdx`, `HashContainer`; `VhdxHelperClient` (9 methods), `VhdxSession` (7 methods); `ContainerCreationMode` (4 values) | Not implemented |
| **Impact** | VHDX containers are the forensic gold standard — a single mountable image that preserves the exact file system state with tamper evidence via container-level hashing. Required by many forensic workflows. |

---

### Gap 17 — PST Writer (Post-Acquisition Packing)
| | FEC | SherlockMail |
|---|---|---|
| **What** | Create PST files from collected messages post-acquisition | PST format listed but no writer |
| **Evidence** | `PostAcquisitionPstPacker` (16 methods): `ContainerizeItems`, `PackOutputToPst`, `HashPsts`; `IPstWriter` (5 methods); `PstWriterFactory`, `PstTemplateToNameConverter` | PST in `getFormats()` but no `PST.write()` or similar |
| **Impact** | Cannot produce PST files for Outlook-based review or handoff to clients who use Outlook. |

---

### Gap 18 — History Report Export
| | FEC | SherlockMail |
|---|---|---|
| **What** | Exportable acquisition history report | Audit log with no export format |
| **Evidence** | `HistoryReportExporter` (15 methods): `ExportHistoryReport`; `AcquisitionDisplayInfo` (40 methods) | `getFullAuditLog()` returns data but no formatted report |
| **Impact** | Cannot produce a standalone, shareable report of what was collected, when, and by whom. |

---

### Gap 19 — Revision Report Export
| | FEC | SherlockMail |
|---|---|---|
| **What** | Export report of drive item revision history | No revision tracking |
| **Evidence** | `AcquisitionSession.ExportRevisionReport` | Not implemented |
| **Impact** | Cannot document version history of cloud documents. |

---

### Gap 20 — Log Folder Compression
| | FEC | SherlockMail |
|---|---|---|
| **What** | Compress protocol/debug logs into archives | Raw logs only |
| **Evidence** | `LogFolderCompressor`: `CompressLogFolder`, `TryAddItemToArchive` | No log compression |
| **Impact** | Large collections produce substantial log files. Compression preserves them without storage overhead. |

---

## Category 5: Search & Filtering

### Gap 21 — Pre-Acquisition Server-Side Search
| | FEC | SherlockMail |
|---|---|---|
| **What** | Search on the server BEFORE downloading, for targeted collection | Post-collection search only |
| **Evidence** | `PreAcquisitionSearcher` (11 methods): `GetTopSearchResults`; Provider-specific: `ImapSearchQuery`, `EwsSearchQuery`, `GmailSearchQuery`, `GraphSearchQuery`; 14 IMAP search term types (Bcc, Body, Cc, From, FullText, Header, InternalDate, SentDate, Subject, To, Unread); `SearchQueryFactory`, `QueryInterpreter`, `InterpretedSearchPackage` (30 methods) | `InlineSearchEngine.search()` filters already-downloaded messages |
| **Impact** | Without server-side search, must download ALL messages first, then filter. Wastes bandwidth, time, and collects data outside scope — a legal concern in targeted collections. |

**FEC search types:**
- `ImapAndSearchTerm`, `ImapOrSearchTerm`
- `ImapBccSearchTerm`, `ImapBodySearchTerm`, `ImapCcSearchTerm`
- `ImapFromSearchTerm`, `ImapFullTextSearchTerm`, `ImapHeaderSearchTerm`
- `ImapInternalDateSearchTerm`, `ImapMessageSetSearchTerm`
- `ImapSentDateSearchTerm`, `ImapSubjectSearchTerm`
- `ImapToSearchTerm`, `ImapUnreadSearchTerm`
- `LuceneSearchQuery`, `PlainTextSearchQuery`

---

### Gap 22 — Lucene-Based Full-Text Indexing
| | FEC | SherlockMail |
|---|---|---|
| **What** | Apache Lucene indexing with custom query parser | In-memory JavaScript string matching |
| **Evidence** | `InlineSearchEngine` (13 methods): `ExtractDocument`, `IsItemResponsive`; `CustomQueryParser` (extends Lucene QueryParser); `MimeEmailExtractorFactory` | `InlineSearchEngine.search()` uses `String.includes()` and regex |
| **Impact** | FEC can search thousands of messages with sub-second response using indexed full-text search. SherlockMail's linear scan degrades rapidly at scale. |

---

### Gap 23 — Differential / Incremental Acquisition
| | FEC | SherlockMail |
|---|---|---|
| **What** | Compare against previous collections, download only new/changed items | DB schema exists but no implementation |
| **Evidence** | `DifferentialItem` (13 methods), `DriveDifferentialItem` (11 methods); methods: `MarkItemsToExcludeForDifferentialAcquisition`, `PersistDifferentialItemList`, `CaptureDiffIdsFromFecProjects`, `GetDifferentialIdsIfNeeded`, `MarkDiffItemsToExclude` | `getDifferentialIds()` / `saveDifferentialId()` in DB but no collection logic uses them |
| **Impact** | Re-collecting an entire mailbox when only a few new messages arrived. Critical for ongoing investigations with periodic collection. |

---

## Category 6: Automation & Operations

### Gap 24 — SMTP Completion Notifications
| | FEC | SherlockMail |
|---|---|---|
| **What** | Email notifications when acquisition completes, fails, or hits a milestone | No notifications |
| **Evidence** | `AcquisitionStatusEmailSender` (9 methods): `SendCompletionEmail`, `SendNotificationEmail`, `SendTestEmail`; `SmtpSettings` (28 methods, 13 fields) | Not implemented |
| **Impact** | Long-running collections (hours/days) provide no notification. Examiner must watch the app. |

---

### Gap 25 — Command-Line Automation
| | FEC | SherlockMail |
|---|---|---|
| **What** | CLI mode for unattended/scripted operations | Electron GUI only |
| **Evidence** | `Metaspike.FEC.Core.Settings.CommandLineOptions` (10 methods) | No CLI interface |
| **Impact** | Cannot automate collections via scripts, schedulers, or CI/CD pipelines. |

---

### Gap 26 — Acquisition Health Monitoring
| | FEC | SherlockMail |
|---|---|---|
| **What** | Real-time health monitoring with disk space detection | No health monitoring |
| **Evidence** | `AcquisitionHealthMonitor` (10 methods, 10 fields); `LowDiskSpaceEventArgs` | Not implemented |
| **Impact** | A collection that fills the disk silently corrupts output. FEC pauses/warns before this happens. |

---

### Gap 27 — Acquisition Insights
| | FEC | SherlockMail |
|---|---|---|
| **What** | Post-acquisition analytics (anomalies, patterns, summary statistics) | No insights |
| **Evidence** | `AcquisitionInsightsExtractor` (13 methods), `AcquisitionInsight` (8 methods), `InsightType` (4 values) | Not implemented |
| **Impact** | Examiner gets raw data with no higher-level analysis of what was collected. |

---

### Gap 28 — Multi-Target Acquisition
| | FEC | SherlockMail |
|---|---|---|
| **What** | Collect from multiple accounts/targets in one session | One target per project/acquisition |
| **Evidence** | `AdditionalTargetProjectCreator`: `CreateAdditionalProjectsIfNecessary`; `AdditionalTargetsLoader` (7 methods) | Single-target collection routes |
| **Impact** | Must manually create separate projects for each custodian's mailbox. |

---

### Gap 29 — Connectivity Testing
| | FEC | SherlockMail |
|---|---|---|
| **What** | Pre-acquisition connection testing | No pre-flight checks |
| **Evidence** | `ConnectivityTester`, `ConnectivityTest` (12 methods), `ConnectivityTestStatus` (5 values) | Not implemented |
| **Impact** | Authentication and network issues only discovered mid-collection, wasting time and potentially producing partial results. |

---

### Gap 30 — Proxy Support
| | FEC | SherlockMail |
|---|---|---|
| **What** | HTTP/SOCKS4/SOCKS5 proxy for all connections | No proxy support |
| **Evidence** | `ProxySettings` (34 methods, 14 fields), `ProxyType` (5 values) | Not implemented |
| **Impact** | Cannot operate in network environments requiring proxy access (corporate, government, air-gapped with gateway). |

---

### Gap 31 — Server Profile Auto-Detection via DNS
| | FEC | SherlockMail |
|---|---|---|
| **What** | Automatic server discovery via MX, SPF, CNAME records | Domain-to-preset lookup table |
| **Evidence** | `ServerProfileCreator` (46 methods): `ConvertDomainToProfile`, `DetectServerProfileViaMxLookup`, `DetectServerProfileViaSpfOrCname`; `DnsAnswer`, `GoogleDnsResponse` | `detectProvider()` matches against known domain list |
| **Impact** | Unknown domains require manual server configuration. FEC discovers the correct server automatically via DNS. |

---

## Category 7: Security & Cryptography

### Gap 32 — S/MIME Decryption
| | FEC | SherlockMail |
|---|---|---|
| **What** | Decrypt S/MIME encrypted emails with imported certificates | Encryption detection only |
| **Evidence** | `AdvancedDecryptor` (17 methods, 6 fields); `DecryptorCache`; `CertificateInfo` (12 methods); `ImportedCertificateInfo` | `checkEncryptionDetection()` flags encrypted messages but cannot decrypt |
| **Impact** | Encrypted emails remain opaque — can be collected but not read, searched, or reviewed. |

---

### Gap 33 — Digital Signature Verification
| | FEC | SherlockMail |
|---|---|---|
| **What** | Verify S/MIME and other digital signatures on emails | No signature verification |
| **Evidence** | `Metaspike.FEC.Core.Crypto.SignatureVerifier` (4 methods); `EntraCertHandler` (6 methods for Entra/Azure AD certificates) | Not implemented |
| **Impact** | Cannot verify message authenticity or detect tampering on signed emails. |

---

### Gap 34 — Credential Manager Integration
| | FEC | SherlockMail |
|---|---|---|
| **What** | Windows Credential Manager for secure credential storage | File-based credential storage |
| **Evidence** | `CredentialManager` (8 methods) | OAuth tokens stored in local JSON files |
| **Impact** | Credentials stored in files can be extracted by malware or unauthorized access. Windows Credential Manager provides OS-level encryption. |

---

### Gap 35 — Custom IMAP Profile Persistence
| | FEC | SherlockMail |
|---|---|---|
| **What** | Save/load/share custom IMAP profiles for unusual servers | Hard-coded presets |
| **Evidence** | `CustomImapProfileXmlReader`, `CustomImapProfileXmlWriter`, `ImapProfilePathGenerator` | `COLLECTION_PROFILES` is a static object |
| **Impact** | Forensic examiners frequently encounter unusual email servers. Cannot save and reuse custom configurations across cases. |

---

## Summary: Priority Matrix

| Priority | Gap # | Feature | Forensic Impact |
|---|---|---|---|
| **CRITICAL** | 1 | RFC 3161 Trusted Timestamping | Legal admissibility |
| **CRITICAL** | 16 | VHDX Container Export | Forensic standard packaging |
| **CRITICAL** | 21 | Pre-Acquisition Server-Side Search | Scope control / over-collection |
| **CRITICAL** | 32 | S/MIME Decryption | Encrypted evidence access |
| **HIGH** | 2 | Multi-Algorithm Hashing | Cross-platform verification |
| **HIGH** | 5 | Enterprise App-Only Auth | Microsoft 365 bulk collection |
| **HIGH** | 6 | Exchange Advanced Features | Litigation hold / recoverable items |
| **HIGH** | 10 | Google Drive Direct Collection | Cloud evidence preservation |
| **HIGH** | 11 | OneDrive Direct Collection | Cloud evidence preservation |
| **HIGH** | 15 | Cloud Attachment Download | Referenced file preservation |
| **HIGH** | 17 | PST Writer | Outlook-compatible export |
| **HIGH** | 23 | Differential Acquisition | Ongoing investigation efficiency |
| **HIGH** | 33 | Digital Signature Verification | Authenticity verification |
| **MEDIUM** | 3 | Folder Snapshot Capture | Server-side change detection |
| **MEDIUM** | 4 | Yahoo OAuth | Provider coverage |
| **MEDIUM** | 7 | Takeout / Local Import | Offline archive support |
| **MEDIUM** | 9 | Azure Sovereign Clouds | Government collection |
| **MEDIUM** | 12 | SharePoint Collection | Enterprise evidence |
| **MEDIUM** | 13 | Google Calendar | Calendar evidence |
| **MEDIUM** | 14 | Contact Folder Collection | Relationship evidence |
| **MEDIUM** | 18 | History Report Export | Documentation |
| **MEDIUM** | 22 | Lucene Full-Text Indexing | Search performance |
| **MEDIUM** | 24 | SMTP Notifications | Long-running awareness |
| **MEDIUM** | 26 | Health Monitoring | Collection reliability |
| **MEDIUM** | 29 | Connectivity Testing | Pre-flight validation |
| **MEDIUM** | 30 | Proxy Support | Network environment |
| **MEDIUM** | 31 | DNS Auto-Detection | Server discovery |
| **MEDIUM** | 34 | Credential Manager | Credential security |
| **LOW** | 8 | Remote Token Import | Multi-machine workflow |
| **LOW** | 19 | Revision Report | Drive audit trail |
| **LOW** | 20 | Log Compression | Storage efficiency |
| **LOW** | 25 | CLI Automation | Scripted workflows |
| **LOW** | 27 | Acquisition Insights | Post-collection analytics |
| **LOW** | 28 | Multi-Target Acquisition | Batch workflow |
| **LOW** | 35 | Custom IMAP Profiles | Configuration persistence |

---

## REA Evidence References

All findings derived from the following REA evidence artifacts:

| Evidence ID | Description |
|---|---|
| `ev_72d1b67f9f500acbafcdb7bfa636e9abedb85f72a44ba50fa3af34e56974f89f` | FEC.Core.dll managed members (1,070 types, 8,749 methods) |
| `ev_e7336fc0...` through `ev_d40d3608...` | 11 view projection pages (offsets 0–1070, exhausted) |

**Binary analyzed:** `FEC.Core.dll` v4.5.888.111, 3,532,800 bytes, .NET 10, heavily obfuscated (verb+adjective+noun method renaming, namespace names survived)

---

## What SherlockMail Already Does Well

For completeness, SherlockMail currently implements these features that FEC also has:
- **7 protocol handlers**: IMAP, POP3, EWS, Graph, Gmail API, Zoho API, JMAP
- **4 OAuth providers**: Google, Microsoft, Zoho, Fastmail
- **8 export formats**: EML, MSG, PST (metadata), MBOX, MIME, PDF, Concordance DAT, XML
- **30 provider presets** with collection profiles
- **17 QC checks** including attachment completeness, timestamp verification, resumability
- **Inline search** with boolean operators (AND/OR/NOT, field-specific)
- **Cloud attachment link scanning** (Google Drive, Docs, OneDrive, SharePoint, Dropbox, Box)
- **Internal timestamping** (SHA-256 based)
- **Chain-hashed audit log** (SHA-256 linked entries)
- **Retry with backoff** (3 retries, exponential backoff)
- **Per-message error tracking** with folder-level statistics
- **FEC-style export naming** with folder-preserving directory structure
