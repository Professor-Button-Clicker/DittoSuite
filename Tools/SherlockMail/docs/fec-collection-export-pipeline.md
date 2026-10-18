# FEC Collection & Export Pipeline — Complete Reverse Engineering Report

## Analysis Method
REA-based static analysis + binary string extraction of FEC v4.5.888 (Metaspike Forensic Email Collector), .NET 10, x86_64/x86 assemblies. Primary targets:

| Assembly | Types | Methods | Arch | Obfuscated |
|---|---|---|---|---|
| `FEC.Core.dll` | 1,070 | 8,749 | x86_64 | **Yes** — custom obfuscator |
| `EwsCoreLib.dll` | 892 | 7,416 | x86 | **No** — Microsoft EWS fork |
| `FEC.dll` | 494 | — | — | Partially (UI layer) |

Total supporting libraries: **48 DLLs** in `C:\Program Files\FEC\Forensic Email Collector\`

---

## 1. Obfuscation & String Encryption Architecture

### 1.1 Method Name Obfuscation

FEC uses a **custom obfuscator** (not a known commercial product — no Dotfuscator, ConfuserEx, or SmartAssembly signatures detected). The obfuscator replaces internal method names with a systematic `Verb+Adjective+Noun` pattern:

| Prefix | Count | Example |
|---|---|---|
| `Apply*` | 735 | `ApplyAlphabeticDecryptor`, `ApplyBasicDecryptor` |
| `Plan*` | 666 | `PlanAccessibleDecryptor`, `PlanActiveDecryptor` |
| `Implement*` | 643 | `ImplementCommonDecryptor`, `ImplementFlexibleDecryptor` |
| `Set*` | 91 | (mix of real setters + obfuscated) |
| `Assign*` | 48 | `AssignFilteredEncryptor` |
| `Close*` | 44 | |
| `Lock*` | 40 | `LockConnectedEncryptor` |
| `Allocate*` | 40 | `AllocateAdaptableEncryptor` |
| `Execute*` | 39 | |
| `Connect*` | 30 | `ConnectAutomatedDecryptor` |
| `Release*` | 30 | `ReleaseIdentifiableDecryptor` |
| `Synchronize*` | 17 | `SynchronizeSeparatedDecryptor` |
| `Manage*` | 12 | |

**Total obfuscated methods: ~2,500+**

However, **64 real (non-obfuscated) method names survive** — these are the public API surface, interface implementations, and key pipeline operations that reveal the real architecture.

### 1.2 Field/Variable Name Obfuscation

Fields follow the same pattern with underscores and prefixes:
- `_AdaptableDecryptor`, `_AdjustableDecryptor`, `_AutomatedDecryptorCnt`
- `m_ActiveDecryptorDescr`, `m_CommonDecryptor`, `m_DecryptorCollectionMap`
- `_encryptedCertificatePassword`, `_EncryptorProfilerContent`

### 1.3 Custom String Encryption (AES)

**All server hostnames, configuration strings, and sensitive constants are encrypted at rest.** No plaintext IMAP/POP server addresses exist in any encoding (UTF-8 or UTF-16LE) across any DLL.

**Evidence — Encryption infrastructure:**
```
Core APIs:
  EncryptString / DecryptString / TryDecryptString  — general string encrypt/decrypt
  EncryptCredential / DecryptCredential              — credential-specific encryption
  CreateEncryptor / CreateDecryptor                  — factory methods

Crypto primitives:
  AesCryptoServiceProvider                           — AES symmetric encryption
  CipherMode                                         — block cipher mode selection
  encryptionKey / decryptionKey                      — key material
  inputCiphertext                                    — encrypted input buffer

REA detection:
  "Custom string decryptor" signature matched        — DecryptString/DecryptResource pattern
  "Strong name" signature matched                    — assembly is signed
```

### 1.4 Encrypted Data at Rest

| What | Property | Purpose |
|---|---|---|
| Server profiles | All hostnames in `ServerProfileCreator` | Encrypted via `DecryptString` — no plaintext IMAP/SMTP servers |
| OAuth client IDs | `EncryptedCustomGmailApiClientId` | Gmail API credentials |
| OAuth secrets | `EncryptedCustomGmailApiClientSecret` | Gmail API secrets |
| AOL OAuth | `EncryptedCustomAolClientId` / `EncryptedCustomAolClientSecret` | AOL API credentials |
| Yahoo OAuth | `EncryptedCustomYahooClientId` / `EncryptedCustomYahooClientSecret` | Yahoo API credentials |
| User passwords | `EncryptedPassword` | Stored credentials |
| License keys | `EncryptedLicenseKey` | License protection |
| Certificate passwords | `_encryptedCertificatePassword` | PFX/PKCS12 passwords |
| MIME subfolder | `EncryptedMIMESubfoldername` | Output path protection |

### 1.5 What's NOT Obfuscated

- **EwsCoreLib.dll** (892 types, 7,416 methods) — entirely unobfuscated. This is FEC's custom fork of the Microsoft EWS Managed API, retaining all original type/method names.
- **Public interface methods** in FEC.Core.dll — `Start`, `CancelAcquisition`, `ReadCollection`, all `Export*` methods
- **Property names** — `AcquisitionSettings`, `DbManager`, `OutputHandler`, etc.
- **Enum values** — `DriveAcquisitionMode`, `DriveItemType`, etc.

---

## 2. The Collection Pipeline

### 2.1 Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AcquisitionSession.Start()                       │
│                    (Central Orchestrator — 100 methods)               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  MailClient   │    │  DbManager   │    │  OutputHandler       │   │
│  │  (Download)   │───▶│  (Persist)   │───▶│  (Containerize)      │   │
│  └──────────────┘    └──────────────┘    └──────────────────────┘   │
│         │                    │                       │               │
│         ▼                    ▼                       ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Protocol      │    │ SQLCipher    │    │ ContainerPacker      │   │
│  │ Adapters:     │    │ (encrypted   │    │ PostAcqPstPacker     │   │
│  │ • EWS         │    │  SQLite DB)  │    │ HashManager          │   │
│  │ • Graph API   │    │              │    │ TimestampClient      │   │
│  │ • Gmail API   │    │ 143 methods  │    │ VhdxSession          │   │
│  │ • IMAP/Rebex  │    │              │    │ LogFolderCompressor  │   │
│  │ • POP3/Rebex  │    │              │    │                      │   │
│  │ • Takeout     │    │              │    │                      │   │
│  │ • Vault       │    │              │    │                      │   │
│  └──────────────┘    └──────────────┘    └──────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Cloud Attachment Sub-Pipeline                                │    │
│  │  CloudAttachmentStager → CloudAttachmentPackager              │    │
│  │  (OneDrive, SharePoint, Google Drive)                         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Forensic Integrity                                           │    │
│  │  HashManager → TimestampClient (RFC 3161) → VhdxSession       │    │
│  └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 AcquisitionSession — Central Orchestrator

**Type:** `Metaspike.FEC.Core.Acquisition.AcquisitionSession`
**Size:** 100 methods, 31+ fields

**Key non-obfuscated methods (pipeline control):**

| Method | Role |
|---|---|
| `Start` | Launches the entire collection pipeline |
| `CancelAcquisition` | Graceful cancellation |
| `StopAcquisitionIfRunning` | Force stop |
| `ReadCollection` | Resume/read existing collection |
| `AcquireMetadataForMissingItems` | Fill metadata gaps post-collection |
| `ResetLoggersAndStatus` | Pipeline reset |
| `Dispose` | Cleanup |

**Export methods (post-collection reports):**

| Method | Output |
|---|---|
| `ExportRevisionReport` | Cloud file revision history |
| `ExportListOfProcessedMessages` | All collected emails |
| `ExportMetadataReportForRemainingItems` | Items not yet processed |
| `ExportListOfSkippedEwsItemsIfNecessary` | EWS items that were skipped |
| `ExportListOfDriveAttachmentsIfNecessary` | Cloud attachments collected |
| `ExportListOfDirectDriveItemsIfNecessary` | Direct Drive items |
| `ExportListOfDirectDriveRevisionsIfNecessary` | Direct Drive revision history |
| `ExportListOfExcludedDriveAttachmentsIfNecessary` | Excluded cloud attachments |
| `ExportListOfGoogleDriveAttachmentRevisionsIfNecessary` | Google Drive revision detail |
| `ExportListOfOneDriveAttachmentRevisionsIfNecessary` | OneDrive revision detail |

**Pipeline state properties:**

| Property | Type | Meaning |
|---|---|---|
| `MimeContainerized` | bool | MIME output packaging complete |
| `MsgContainerized` | bool | MSG output packaging complete |
| `PstContainerized` | bool | PST output packaging complete |
| `DirectDriveContainerized` | bool | Direct Drive packaging complete |
| `DriveAttachmentsStaged` | bool | Cloud attachments downloaded to staging |
| `DriveAttachmentsPackaged` | bool | Cloud attachments packaged into containers |
| `ErrorsEncountered` | bool | Any errors during collection |
| `IsResumed` | bool | Resuming a prior collection |
| `MaxSearchResultCount` | int | Search result cap |

**Other key properties:**

| Property | Purpose |
|---|---|
| `AcquisitionSettings` | Collection configuration |
| `AcquisitionStatus` | Current pipeline state |
| `DbManager` | Database manager reference |
| `GmailLabels` | Gmail label list for collection |
| `HealthMonitor` | Pipeline health tracking |
| `LoggedInUser` | Authenticated user identity |
| `OutputHandler` | Output pipeline reference |
| `ProjectSettings` | Project-level settings |
| `SelectedOutputDelimiterDelimiterType` | Filename delimiter choice |
| `SelectedDirectDriveItems` | User-selected Drive items |
| `DisplayInfo` | UI display state |

**Logging:**

| Method | Purpose |
|---|---|
| `WriteToAcquisitionLog` | Main acquisition log |
| `WriteToExceptionLog` | Error/exception log |

---

## 3. Email Download Mechanics

### 3.1 MailClient

**Type:** `Metaspike.FEC.Core.Mail.MailClient`

MailClient is the protocol-agnostic download layer. Due to obfuscation, most internal method names are replaced, but the public API and key properties survive:

**Connection protocols (7 total):**

| Protocol | Library/DLL | Notes |
|---|---|---|
| EWS (Exchange Web Services) | `EwsCoreLib.dll` (custom fork) | Exchange 2007–2016 + Office 365 |
| Microsoft Graph API | `Microsoft.Graph.dll` (42.7 MB) | Modern O365/Exchange Online |
| Gmail API | `Google.Apis.Gmail.v1.dll` | Gmail direct API |
| IMAP | `Rebex.Imap.dll` | 30+ providers via presets |
| POP3 | `Rebex.Pop3.dll` | Legacy providers |
| Google Takeout | Built-in | Google data export |
| Google Vault | Built-in | Legal hold/eDiscovery |

**Batch processing properties:**
- `MaxItemsPerBatch` — items per download batch (throttling)
- `MaxErrorWaitTimeInMinutes` — backoff on errors
- `RetryCount` — retry attempts (via Polly resilience library)

### 3.2 EWS Internals (from EwsCoreLib.dll — UNOBFUSCATED)

The EWS library is FEC's most detailed protocol implementation, with full visibility because it's unobfuscated:

**ExchangeService — Primary API class:**

| Method | Overloads | Purpose |
|---|---|---|
| `FindItems` | 15 | Search for emails by folder, query, or view |
| `FindFolders` | 5 | Enumerate mailbox folders |
| `BindToFolder` / `BindToFolders` | — | Load folder properties |
| `LoadPropertiesForItems` | — | Batch-load item properties |
| `CreateItems` / `UpdateItems` | — | Item manipulation |
| `CopyItems` / `MoveItems` | — | Item organization |
| `ArchiveItems` | — | Archive operations |
| `FindAppointments` | — | Calendar item search |
| `SendItem` | — | Send capability |
| `DeleteFolder` / `EmptyFolder` | — | Folder management |
| `MarkAllItemsAsRead` | — | Bulk read status |

**ExchangeService properties:**

| Property | Purpose |
|---|---|
| `ImpersonatedUserId` | EWS impersonation for admin collection |
| `Url` | EWS endpoint URL |
| `Credentials` | Authentication credentials |
| `TimeZone` | Server timezone |
| `TargetServerVersion` | Exchange version targeting |
| `FileAttachmentContentHandler` | Custom attachment download handler |

**Item/EmailMessage properties (email metadata captured):**

| Property | Forensic Value |
|---|---|
| `MimeContent` / `MimeContentUTF8` | Raw MIME source |
| `DateTimeCreated` | Item creation timestamp |
| `DateTimeReceived` | Server receive timestamp |
| `DateTimeSent` | Send timestamp |
| `LastModifiedTime` | Last modification |
| `From` | Sender |
| `DisplayCc` / `DisplayTo` | Recipients |
| `Subject` | Subject line |
| `Body` | Message body |
| `InternetMessageHeaders` | Full email headers |
| `Attachments` | Attachment collection |
| `HasAttachments` | Attachment flag |
| `Categories` | User categories |
| `ConversationId` | Conversation threading |
| `Importance` | Priority level |
| `IsAssociated` | Hidden/associated item flag |
| `IsDraft` / `IsFromMe` | Draft/sent status |
| `ItemClass` | Item type (IPM.Note, etc.) |
| `ParentFolderId` | Containing folder |
| `ExtendedProperties` | MAPI extended properties |
| `Flag` | Follow-up flag |

### 3.3 Attachment Types (3 types)

**FileAttachment** — traditional binary attachment:
- `Content` — raw bytes
- `ContentType` — MIME type
- `FileName` — filename
- `Size` — byte count

**ItemAttachment** — embedded email (email-as-attachment):
- `Item` — the embedded item
- Recursive — can contain its own attachments

**ReferenceAttachment** — modern/cloud attachment (OneDrive/SharePoint):
- `AttachLongPathName` — full cloud path
- `ProviderType` — cloud provider identifier
- `ProviderEndpointUrl` — API endpoint
- `AttachmentPreviewUrl` / `AttachmentThumbnailUrl` — preview URLs
- `PermissionType` — sharing permission level
- `AttachmentIsFolder` — folder reference flag

**AttachmentCollection** — container with all three types, loaded via:
- `LoadAttachmentProperties` — batch-load attachment metadata
- `SaveAttachmentContent` — download attachment content

### 3.4 Folder Enumeration

**MailboxFolderLister** — enumerates all mailbox folders for collection.

FEC recognizes **20 well-known folder names** (from binary string extraction):
Inbox, SentItems, DeletedItems, Drafts, Outbox, JunkEmail, Archive, Calendar, Contacts, Tasks, Notes, Journal, MsgFolderRoot, RecoverableItemsDeletions, RecoverableItemsPurges, RecoverableItemsRoot, SearchFolders, Root, PublicFoldersRoot, ConversationHistory

---

## 4. Persistence Layer

### 4.1 DbManager

**Type:** `Metaspike.FEC.Core.Persistence.DbManager`
**Size:** 143 methods

**Database technology:** SQLite via `Microsoft.Data.Sqlite.dll` with **SQLCipher encryption** via `SQLitePCLRaw.provider.e_sqlcipher.dll` — all local database files are encrypted at rest.

**Key non-obfuscated methods:**

| Method | Purpose |
|---|---|
| `PersistProjectSettingsInDb` | Save project configuration |
| `PersistFolderList` | Save enumerated folder structure |
| `PersistDirectOneDriveItems` | Save OneDrive item metadata |
| `PersistGoogleDriveInfoList` | Save Google Drive metadata |
| `PersistOneDriveInfoList` | Save OneDrive metadata list |
| `GetDbStatus` | Database health check |
| `GetAcquisitionSummary` | Collection statistics |
| `RetrieveAllGraphTokens` | Retrieve cached Graph API tokens |
| `ClearPermanentErrorFlags` | Reset error state for retry |
| `Dispose` | Close database connection |

**Property:** `DatabasePath` — path to the SQLCipher database file.

### 4.2 What Gets Persisted

Based on the method names and pipeline integration:
1. **Project settings** — complete collection configuration
2. **Folder trees** — mailbox folder structure
3. **Email metadata** — message headers, dates, sizes, folder locations
4. **Cloud drive items** — OneDrive and Google Drive file metadata
5. **Graph API tokens** — OAuth token cache for resumable collection
6. **Error states** — permanent error flags per item (clearable for retry)
7. **Acquisition summary** — running collection statistics

---

## 5. Output & Export Pipeline

### 5.1 Container Formats

FEC produces output in **4 container formats**, tracked by per-format completion flags:

| Format | Packer Class | Completion Flag | Library |
|---|---|---|---|
| MIME/EML | `ContainerPacker` | `MimeContainerized` | Aspose.Email (8.8 MB) |
| MSG | `ContainerPacker` | `MsgContainerized` | Aspose.Email |
| PST | `PostAcquisitionPstPacker` | `PstContainerized` | Aspose.Email |
| VHDX | `VhdxSession` | — | Built-in |

### 5.2 ContainerPacker

**Type:** `Metaspike.FEC.Core.Packaging.ContainerPacker`

Primary method: `ContainerizeOutput` — packages collected emails into final containers.

Sub-operations:
- `ContainerizeMimeOutput` — package as individual EML files
- `ContainerizeMsgOutput` — package as individual MSG files
- `ContainerizeDirectDrive` / `ContainerizeDirectDriveOutput` — package Drive items
- `ContainerizeItems` — generic item packaging

### 5.3 PostAcquisitionPstPacker

**Type:** `Metaspike.FEC.Core.Packaging.PostAcquisitionPstPacker`

Method: `PackOutputToPst` — consolidates all collected emails into a single PST archive file after collection completes.

### 5.4 Cloud Attachment Packaging (3-Stage Sub-Pipeline)

```
Stage 1: FETCH          Stage 2: STAGE           Stage 3: PACKAGE
─────────────────       ─────────────────        ─────────────────
FetchCloudAttachments → CloudAttachmentStager  → CloudAttachmentPackager
FetchDriveAttachments   StageCloudAttachments    PackageCloudAttachments
FetchOneDriveAttach.    StagePostAcquisition     PackageMimeOutput
                        (staging folders:         PackageMsgOutput
                         MIME staging,            (package folders:
                         MSG staging)              MIME package,
                        ✓ DriveAttachmentsStaged   MSG package)
                                                 ✓ DriveAttachmentsPackaged
```

### 5.5 Forensic Integrity

**HashManager** — cryptographic hashing of all output:
- Computes hashes for every collected item
- Per-item hash results: `DirectDriveItemHashResult`, `DirectDriveRevisionHashResult`
- Used for chain-of-custody verification

**TimestampClient** — RFC 3161 trusted timestamping:
- Contacts an external TSA (Time Stamp Authority)
- Produces RFC 3161 timestamp tokens proving collection time
- `TimestampVerificationClient` — verifies timestamp validity

**VhdxSession** — VHDX forensic container:
- Creates VHDX virtual disk images
- Self-contained forensic containers with all collected data
- Standard format readable by forensic tools

**LogFolderCompressor** — compresses acquisition logs for archival.

### 5.6 Export Metadata Maps

FEC generates detailed metadata exports via 8 dedicated export maps:

| Map | Content |
|---|---|
| `DriveAttachmentExportMap` | Google Drive attachments from emails |
| `DriveRevisionExportMap` | Google Drive attachment revisions |
| `OneDriveAttachmentExportMap` | OneDrive attachments from emails |
| `OneDriveAttachmentRevisionExportMap` | OneDrive attachment revisions |
| `DirectDriveItemExportMap` | Direct Google Drive items |
| `DirectDriveRevisionExportMap` | Direct Google Drive revisions |
| `DirectOneDriveItemExportMap` | Direct OneDrive items |
| `DirectOneDriveRevisionExportMap` | Direct OneDrive revisions |

---

## 6. Search & Filtering

### 6.1 Five Search Engines

| Engine | Protocol | Capability |
|---|---|---|
| EWS AQS | Exchange | Advanced Query Syntax for Exchange search |
| Gmail Operators | Gmail API | Gmail-native search operators |
| Graph `$search`/`$filter` | Microsoft Graph | OData-based search/filter |
| IMAP SEARCH | IMAP | RFC 3501 SEARCH command (13 term types) |
| Lucene.NET | Local | Full-text search index of collected content |

### 6.2 IMAP Search Terms (13 types)

From `PreAcquisitionSearcher` analysis:
SearchTermSubject, SearchTermFrom, SearchTermTo, SearchTermCc, SearchTermBcc, SearchTermBody, SearchTermText, SearchTermMessageId, SearchTermHeader, SearchTermDate, SearchTermSize, SearchTermFlags, SearchTermKeyword

### 6.3 Pre-Acquisition Search

`PreAcquisitionSearcher` — searches before downloading to filter the collection scope. Supports date ranges, keyword filters, sender/recipient filters, and size limits across all protocols.

---

## 7. Server Profiles & Provider Coverage

### 7.1 ServerProfileCreator — 39 Preset Profiles

All server hostnames and ports are encrypted via `DecryptString`. The 39 factory methods in `ServerProfileCreator`:

**Enterprise/Cloud:**
- `CreateOffice365EwsProfile` — Microsoft 365 via EWS
- `CreateCustomEwsProfile` — On-premises Exchange

**Webmail Providers:**
- `CreateHotmailImapProfile` — Outlook.com/Hotmail
- `CreateGmailImapProfile` — Gmail
- `CreateYahooImapProfile` — Yahoo Mail
- `CreateAolImapProfile` — AOL Mail
- `CreateiCloudImapProfile` — Apple iCloud Mail
- `CreateZohoImapProfile` — Zoho Mail
- `CreateProtonMailImapProfile` — ProtonMail (via Bridge)
- `CreateFastmailImapProfile` — Fastmail
- `CreateYandexImapProfile` — Yandex Mail
- `CreateGmxImapProfile` — GMX
- `CreateMailcomImapProfile` — Mail.com
- `CreateEarthLinkImapProfile` — EarthLink

**Hosting/Business:**
- `CreateGoDaddyImapProfile` — GoDaddy
- `CreateRackspaceImapProfile` — Rackspace
- `CreateNetSolImapProfile` — Network Solutions
- `CreateGandiImapProfile` — Gandi
- `CreateDreamHostImapProfile` — DreamHost

**AWS:**
- `CreateWorkMailUse1Profile` — Amazon WorkMail US East
- `CreateWorkMailUsw2Profile` — Amazon WorkMail US West

**US ISP Providers:**
- `CreateAttImapProfile` — AT&T
- `CreateComcastImapProfile` — Comcast/Xfinity
- `CreateCharterImapProfile` — Charter/Spectrum
- `CreateCenturyLinkImapProfile` — CenturyLink
- `CreateTwcImapProfile` — Time Warner Cable
- `CreateBrightHouseImapProfile` — Bright House Networks
- `CreateHughesImapProfile` — HughesNet
- `CreateTdsImapProfile` — TDS Telecom

**European/International ISP:**
- `CreateOrangeFrImapProfile` — Orange France
- `CreateZiggoImapProfile` — Ziggo (Netherlands)
- `CreateA1ImapProfile` — A1 Telekom (Austria)

**Custom/Generic:**
- `CreateCustomImapProfile` — any IMAP server
- `CreateCustomPopProfile` — any POP3 server
- `CreateCustomEwsProfile` — any EWS server

**Google Specialized:**
- `CreateLocalVaultProfile` — Google Vault export
- `CreateTakeoutProfile` — Google Takeout

**Utility:**
- `CreateServerProfiles` — factory for all profiles
- `ConvertDomainToProfile` — auto-detect provider from email domain

### 7.2 Authentication Modes (10+)

| Mode | Usage |
|---|---|
| Basic (username/password) | IMAP, POP3, EWS |
| OAuth 2.0 Interactive | Gmail, Graph, EWS |
| OAuth 2.0 Service Account | Gmail delegation |
| App-Only (Client Credentials) | Graph API |
| Certificate (Entra/Azure AD) | Graph API via `EntraCertBase64`, `ConvertPfxFromPathToBase64` |
| App Passwords | Gmail, Yahoo |
| Impersonation | EWS `ImpersonatedUserId` |
| Delegation | Gmail `ConnectToGMailViaDelegation` |
| Remote Auth | External auth flow |
| Custom Token | Manual token injection |

### 7.3 S/MIME Support

FEC can decrypt S/MIME encrypted emails:
- `DecryptSMime` — toggle for S/MIME decryption
- `DecryptSmimeHelpMessage` — user guidance
- `EncryptedMime` — handling encrypted MIME content

---

## 8. Additional Data Sources

Beyond email, FEC collects:

| Source | Library |
|---|---|
| Calendar items | `Google.Apis.Calendar.v3.dll`, EWS `FindAppointments` |
| Contacts | EWS well-known folder, Google Contacts |
| Google Vault | Built-in vault export processing |
| Google Takeout | Built-in takeout import |
| OneDrive files | Microsoft Graph API |
| SharePoint files | Microsoft Graph API |
| Google Drive files | Google Drive API v3 |

---

## 9. Resilience & Error Handling

### 9.1 Retry/Resilience

- **Polly** (`Polly.dll`, `Polly.Core.dll`) — retry policies with exponential backoff
- `MaxErrorWaitTimeInMinutes` — maximum backoff duration
- `RetryCount` — configurable retry attempts
- `ClearPermanentErrorFlags` — reset for re-collection

### 9.2 Differential/Resumable Collection

- `IsResumed` property on `AcquisitionSession`
- `ReadCollection` — resume from prior state
- Delta queries for OneDrive: `GetItemsFromDriveWithDeltaQuery`
- Per-item error tracking: `DirectDriveItemsWithPermanentErrors`
- Not-yet-downloaded tracking: `GetNotYetDownloadedGoogleDriveAttachmentRevisions`

### 9.3 Health Monitoring

- `HealthMonitor` — pipeline health tracking
- `ErrorsEncountered` — global error flag
- Separate exception log: `WriteToExceptionLog`

---

## 10. Infrastructure Libraries (48 DLLs)

| Library | Size | Purpose |
|---|---|---|
| `Microsoft.Graph.dll` | 42.7 MB | Microsoft Graph API |
| `Aspose.Email.dll` | 8.8 MB | Email parsing, MIME/MSG/PST creation |
| `EwsCoreLib.dll` | — | Custom EWS Managed API fork |
| `Rebex.Imap.dll` | — | IMAP protocol |
| `Rebex.Pop3.dll` | — | POP3 protocol |
| `Rebex.Mime.dll` | — | MIME parsing |
| `Rebex.Net.dll` / `Rebex.Networking.dll` | — | Network layer |
| `Rebex.Security.dll` | — | TLS/crypto |
| `MimeKitLite.dll` | — | MIME parsing (secondary) |
| `Google.Apis.Drive.v3.dll` | — | Google Drive API |
| `Google.Apis.Gmail.v1.dll` | — | Gmail API |
| `Google.Apis.Calendar.v3.dll` | — | Google Calendar |
| `Google.Apis.Admin.Directory.directory_v1.dll` | — | Google Workspace admin |
| `Microsoft.Identity.Client.dll` | — | MSAL OAuth2 |
| `Google.Apis.Auth.dll` | — | Google OAuth2 |
| `Microsoft.Data.Sqlite.dll` | — | SQLite driver |
| `SQLitePCLRaw.provider.e_sqlcipher.dll` | — | SQLCipher encryption |
| `Lucene.Net.dll` + dependencies | — | Full-text search |
| `Polly.dll` / `Polly.Core.dll` | — | Resilience/retry |
| `NLog.dll` | — | Logging framework |

---

## 11. Key Takeaways for SherlockMail

### What FEC Does Well (Capabilities to Match)
1. **39 provider presets** with auto-detection from email domain
2. **7 protocol adapters** covering every major email system
3. **Cloud attachment pipeline** with 3-stage fetch→stage→package flow
4. **8 export metadata maps** for comprehensive reporting
5. **Forensic integrity** via hashing + RFC 3161 timestamping + VHDX containers
6. **Resumable collection** with per-item error tracking and delta queries
7. **S/MIME decryption** for encrypted emails
8. **SQLCipher** for encrypted local database

### What FEC Hides (Protected by Obfuscation)
1. **Server hostnames/ports** — all encrypted via AES (`DecryptString`)
2. **OAuth client secrets** — encrypted at rest for Gmail, AOL, Yahoo
3. **Internal algorithms** — 2,500+ methods renamed to meaningless patterns
4. **Collection logic** — the how of downloading, error recovery, batching
5. **License validation** — encrypted license key mechanism

### What We Can See Despite Obfuscation
1. **Complete pipeline structure** — 64 real method names reveal the full flow
2. **All output formats** — EML, MSG, PST, VHDX clearly identified
3. **EWS protocol details** — unobfuscated EwsCoreLib.dll gives full visibility
4. **Database schema** — DbManager method names reveal what's persisted
5. **Cloud attachment architecture** — Stager/Packager/Containerizer names survive
6. **Search capabilities** — 5 search engines, 13 IMAP search term types
7. **All 39 provider names** — factory method names are preserved

---

*Report generated from REA static analysis + PowerShell binary string extraction, October 2026*
