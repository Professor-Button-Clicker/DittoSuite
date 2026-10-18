# FEC Email Collection Capabilities — Complete Provider & Protocol Analysis

## Analysis Method
REA-based .NET decompilation + binary string extraction of FEC v4.5.888 (Metaspike Forensic Email Collector).
Assemblies analyzed: `FEC.Core.dll` (1070 types, 8749 methods), `FEC.dll` (494 types, WPF UI), `EwsCoreLib.dll` (892 types).
All 48 library DLLs inventoried.

---

## 1. Connection Protocols (7 Modes)

FEC supports **7 distinct connection types**, each with its own settings class and UI ViewModel:

| Protocol | Settings Type | UI ViewModel | Library |
|---|---|---|---|
| **EWS** (Exchange Web Services) | `EwsServerSettings` | `Office365EwsViewModel`, `CustomEwsViewModel` | `EwsCoreLib.dll` (892 types, custom fork of Microsoft's EWS managed API) |
| **Microsoft Graph API** | `GraphServerSettings` | `GraphApiViewModel` | `Microsoft.Graph.dll` (42.7MB), `Microsoft.Graph.Core.dll` |
| **Gmail API** | `GmailApiServerSettings` | `GmailApiViewModel` | `Google.Apis.Gmail.v1.dll`, `Google.Apis.Drive.v3.dll`, `Google.Apis.Calendar.v3.dll` |
| **IMAP** | `ImapServerSettings` | `PresetImapViewModel`, `CustomImapViewModel` | `Rebex.Imap.dll` |
| **POP3** | `PopServerSettings` | `CustomPopViewModel` | `Rebex.Pop3.dll` |
| **Google Takeout** (local import) | `TakeoutServerSettings` | `TakeoutViewModel` | `Aspose.Email.dll` (MBOX parser) |
| **Google Vault** (local import) | `LocalVaultServerSettings` | `LocalVaultViewModel` | Direct file processing |

### Protocol Capabilities Matrix

| Capability | EWS | Graph | Gmail API | IMAP | POP3 | Takeout | Vault |
|---|---|---|---|---|---|---|---|
| Email collection | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Folder structure | Yes | Yes | Yes (labels) | Yes | No | Yes (labels) | Yes |
| Cloud attachments | Yes | Yes | Yes | No | No | No | Yes |
| Calendar | No | No | Yes | No | No | No | No |
| Contacts | No | Yes | No | No | No | No | No |
| Direct Drive | No | Yes (OneDrive/SharePoint) | Yes (Google Drive) | No | No | No | Yes |
| Server-side search | Yes | Yes | Yes | Yes (limited) | No | No | No |
| Revision history | Yes (OneDrive) | Yes (OneDrive) | Yes (Drive) | No | No | No | Yes |
| Differential/incremental | Yes | Yes | Yes | Yes | No | No | No |
| Impersonation/delegation | Yes | Yes (app-only) | Yes (delegation) | No | No | No | No |

---

## 2. Pre-Built Server Profiles (39 Presets)

`ServerProfileCreator` contains **39 factory methods** that create pre-configured connection profiles for specific providers. FEC encrypts the actual IMAP hostnames, ports, and SSL settings at rest.

### Microsoft / Exchange Profiles (3)

| Method | Provider | Protocol |
|---|---|---|
| `CreateOffice365EwsProfile` | Microsoft 365 / Office 365 | EWS |
| `CreateHotmailImapProfile` | Hotmail / Outlook.com | IMAP (preset) |
| `CreateCustomEwsProfile` | Any Exchange Server (on-premises) | EWS |

### Google Profiles (2)

| Method | Provider | Protocol |
|---|---|---|
| `CreateGmailImapProfile` | Gmail (consumer/Workspace) | IMAP (preset) |
| *(GmailApiViewModel)* | Gmail / Google Workspace | Gmail API (native) |

### Yahoo / AOL (2)

| Method | Provider | Protocol |
|---|---|---|
| `CreateYahooImapProfile` | Yahoo Mail | IMAP (preset) |
| `CreateAolImapProfile` | AOL Mail | IMAP (preset) |

### Cloud/Webmail Providers (8)

| Method | Provider | Protocol |
|---|---|---|
| `CreateiCloudImapProfile` | Apple iCloud Mail | IMAP |
| `CreateZohoImapProfile` | Zoho Mail | IMAP |
| `CreateProtonMailImapProfile` | ProtonMail (via Bridge) | IMAP |
| `CreateFastmailImapProfile` | Fastmail | IMAP |
| `CreateYandexImapProfile` | Yandex Mail | IMAP |
| `CreateGmxImapProfile` | GMX Mail | IMAP |
| `CreateMailcomImapProfile` | Mail.com | IMAP |
| `CreateGandiImapProfile` | Gandi Mail | IMAP |

### US ISP/Telecom Providers (10)

| Method | Provider | Protocol |
|---|---|---|
| `CreateAttImapProfile` | AT&T Mail | IMAP |
| `CreateComcastImapProfile` | Comcast / Xfinity | IMAP |
| `CreateCharterImapProfile` | Charter / Spectrum | IMAP |
| `CreateCenturyLinkImapProfile` | CenturyLink | IMAP |
| `CreateTwcImapProfile` | Time Warner Cable | IMAP |
| `CreateBrightHouseImapProfile` | Bright House Networks | IMAP |
| `CreateHughesImapProfile` | HughesNet | IMAP |
| `CreateTdsImapProfile` | TDS Telecom | IMAP |
| `CreateEarthLinkImapProfile` | EarthLink | IMAP |
| `CreateNetSolImapProfile` | Network Solutions | IMAP |

### Hosting/Business Providers (4)

| Method | Provider | Protocol |
|---|---|---|
| `CreateGoDaddyImapProfile` | GoDaddy Workspace Email | IMAP |
| `CreateRackspaceImapProfile` | Rackspace Email | IMAP |
| `CreateWorkMailUse1Profile` | Amazon WorkMail (us-east-1) | IMAP |
| `CreateWorkMailUsw2Profile` | Amazon WorkMail (us-west-2) | IMAP |
| `CreateDreamHostImapProfile` | DreamHost | IMAP |

### European Providers (3)

| Method | Provider | Protocol |
|---|---|---|
| `CreateOrangeFrImapProfile` | Orange (France) | IMAP |
| `CreateZiggoImapProfile` | Ziggo (Netherlands) | IMAP |
| `CreateA1ImapProfile` | A1 Telekom (Austria) | IMAP |

### Generic/Custom (5)

| Method | Provider | Protocol |
|---|---|---|
| `CreateCustomImapProfile` | Any IMAP server | IMAP |
| `CreateCustomPopProfile` | Any POP3 server | POP3 |
| `CreateCustomEwsProfile` | Any Exchange server | EWS |
| `CreateLocalVaultProfile` | Google Vault export (local) | File import |
| `CreateTakeoutProfile` | Google Takeout export (local) | File import |

### Domain-Based Auto-Detection

`ConvertDomainToProfile` — FEC can automatically detect the correct server profile from an email domain. When a user enters an email address, FEC matches the domain against its known provider database and selects the optimal preset.

---

## 3. Authentication Architecture

### Authentication Modes (per Settings Type)

Each settings type has a `ServerAuthenticationMode` property (enum). Based on the fields across all settings:

| Auth Mode | Protocol | Description |
|---|---|---|
| **Basic Auth** (username/password) | IMAP, POP3, EWS | Traditional credentials |
| **OAuth 2.0** (interactive) | Gmail API, Graph, IMAP (M365/Gmail) | Browser-based consent flow |
| **OAuth 2.0** (service account) | Gmail API | `ServiceAccountEmail` + `PrivateKey` for delegation |
| **App-Only** (client credentials) | Graph, EWS | `UseAppOnlyAuthentication` with `EnterpriseClientId`, `EnterpriseClientSecret`, `EnterpriseTenantId` |
| **Certificate Auth** (Entra ID) | Graph, EWS, IMAP | `EntraCert` + `EntraCertPassword` |
| **App Password** | IMAP | `RequiresAppPassword` (for MFA-enabled accounts) |
| **Impersonation** | EWS | `UseImpersonation` (admin collects on behalf of user) |
| **Delegation** | Gmail API | `UseDelegation` (Google Workspace admin access) |
| **Remote Auth** | All | `RemoteAuth` namespace — FEC Remote companion app for mobile auth flows |
| **Custom Token** | All | `CustomTokenInputViewModel` for manually providing tokens |

### OAuth Connectors

| Connector | Provider |
|---|---|
| `GmailOauthConnector` | Google (Gmail API + Drive + Calendar) |
| `YahooOauthConnector` | Yahoo Mail |
| `Graph.TokenProvider` / `GraphToken` | Microsoft Graph |
| `Microsoft.Identity.Client` (MSAL) | Microsoft (EWS + Graph) with `AcquireTokenInteractive` / `AcquireTokenSilent` |

### Azure Cloud Environments

`GraphServerSettings.AzureCloudEnvironment` — supports multiple Azure sovereign clouds:
- Azure Commercial (Global)
- Azure Government (GCC/GCC High)
- Azure China (21Vianet)

---

## 4. Exchange/EWS Protocol Depth

`EwsCoreLib.dll` is a **892-type custom fork** of Microsoft's EWS Managed API targeting .NET 10. This is remarkably deep Exchange support.

### Supported Exchange Versions

| Version | Constant |
|---|---|
| Exchange 2007 | `Exchange2007` |
| Exchange 2007 SP1 | `Exchange2007_SP1` |
| Exchange 2010 | `Exchange2010` |
| Exchange 2010 SP1 | `Exchange2010_SP1` |
| Exchange 2010 SP2 | `Exchange2010_SP2` |
| Exchange 2013 | `Exchange2013` |
| Exchange 2013 SP1 | `Exchange2013_SP1` |
| Exchange 2015 (Exchange Online) | `Exchange2015` |
| Exchange 2016 | `Exchange2016` |

### Well-Known Folder Coverage (20 folders)

FEC enumerates ALL standard Exchange folders:

| Folder | Purpose |
|---|---|
| `Inbox` | Incoming email |
| `SentItems` | Sent messages |
| `Drafts` | Draft messages |
| `DeletedItems` | Deleted messages (trash) |
| `JunkEmail` | Spam/junk |
| `Outbox` | Queued for sending |
| `Archive` | Archive mailbox |
| `Calendar` | Calendar items |
| `Contacts` | Contact entries |
| `Tasks` | Task items |
| `Journal` | Journal entries |
| `Notes` | Sticky notes |
| `ConversationHistory` | Conversation logs |
| `MsgFolderRoot` | Root of the message store |
| `Root` | Absolute mailbox root |
| `SearchFolders` | Saved search folders |
| `RecoverableItemsDeletions` | Soft-deleted items |
| `RecoverableItemsPurges` | Hard-deleted items (purge) |
| `RecoverableItemsRoot` | Recoverable items root |
| `RecoverableItemsVersions` | Previous item versions |

### EWS Item Types

Full collection of Exchange item types:
- `AppointmentItem` — calendar events
- `Contact` / `DirectoryContact` / `PersonalContact` — contacts
- `PostItem` — public folder posts
- `MeetingRequest` / `MeetingResponse` / `MeetingCancellation` / `AcceptMeetingInvitationMessage` — meeting workflow
- `ApprovalRequest` / `ApprovalRequestData` — approval workflow
- File/Item/Reference attachments
- `ConversationAction` — conversation threading

### Attachment Types

| Type | Description |
|---|---|
| `FileAttachment` | Binary file attached to email |
| `ItemAttachment` | Embedded email (message-in-message) |
| `ReferenceAttachment` | Cloud-hosted "modern attachment" (OneDrive/SharePoint) |

### AutoDiscover

Full Autodiscover support for automatic EWS URL discovery:
- `AutodiscoverRequest` / `AutodiscoverResponse` — resolve EWS endpoint from email domain
- `AutodiscoverServiceRequestR` — handles version-specific responses

---

## 5. IMAP Protocol Capabilities

### IMAP Client (`Rebex.Imap.dll`)

| Feature | Evidence |
|---|---|
| **SSL/TLS modes** | `ServerSslMode` property with multiple options |
| **Port configuration** | Configurable port (default 993 SSL, 143 non-SSL) |
| **IMAP ID extension** | `UseImapId` — sends client identification |
| **UID-only extension** | `UseUidOnlyExtension` — persistent message identifiers |
| **Certificate validation** | `AllowAllSslCertificates` — bypass certificate errors |
| **OAuth support** | `OAuthSupported` flag for modern auth IMAP |
| **App passwords** | `RequiresAppPassword` for MFA-enabled providers |

### IMAP Search (13 search term types)

FEC has a comprehensive IMAP search implementation:

| Search Term | Description |
|---|---|
| `ImapFromSearchTerm` | From address matching |
| `ImapToSearchTerm` | To address matching |
| `ImapCcSearchTerm` | CC address matching |
| `ImapBccSearchTerm` | BCC address matching |
| `ImapSubjectSearchTerm` | Subject line matching |
| `ImapBodySearchTerm` | Body text matching |
| `ImapFullTextSearchTerm` | Full-text search |
| `ImapHeaderSearchTerm` | Custom header matching |
| `ImapSentDateSearchTerm` | Date sent filtering |
| `ImapInternalDateSearchTerm` | Server internal date filtering |
| `ImapMessageSetSearchTerm` | Message set (UID range) filtering |
| `ImapUnreadSearchTerm` | Unread/unseen messages |
| `ImapAndSearchTerm` / `ImapOrSearchTerm` | Logical combinators |

---

## 6. Search Architecture (5 Engines)

FEC has a **unified query interpreter** that translates queries across multiple search backends:

| Engine | Class | Used For |
|---|---|---|
| **EWS Search** | `EwsSearchQuery` | Exchange server-side search (AQS syntax) |
| **Gmail Search** | `GmailSearchQuery` | Gmail API server-side search (Gmail operators) |
| **Graph Search** | `GraphSearchQuery` | Microsoft Graph `$search` / `$filter` |
| **IMAP Search** | `ImapSearchQuery` | IMAP SEARCH command (RFC 3501) |
| **Lucene Search** | `LuceneSearchQuery` | Local full-text index search (post-acquisition) |

`QueryInterpreter` — translates between search syntaxes, allowing a single query to work across protocols.

### Pre-Acquisition Search

`PreAcquisitionSearcher` — runs server-side searches BEFORE downloading to scope the collection. This is critical for forensic investigations where only specific emails are legally authorized for collection.

### In-Place Search (UI Views)

| View | Provider |
|---|---|
| `GmailInPlaceSearchView` | Google Gmail |
| `GoogleCalendarInPlaceSearchView` | Google Calendar |
| `GoogleDriveInPlaceSearchView` | Google Drive |
| `MicrosoftEmailInPlaceSearchView` | Microsoft 365 email |
| `MicrosoftOneDriveInPlaceSearchView` | OneDrive/SharePoint |

### Inline (Post-Collection) Search

`InlineSearchEngine` with `Lucene.Net` — builds a local full-text search index of collected emails using Lucene.NET. Supports complex queries across collected data.

---

## 7. Output Formats & Forensic Features

### Output Formats

| Format | Component | Description |
|---|---|---|
| **MIME/EML** | `CloudAttachmentPackager` | Individual email files in RFC 822 format |
| **MSG** | `CloudAttachmentPackager` | Outlook-native message format |
| **PST** | `PostAcquisitionPstPacker` | Outlook data file (post-collection packaging) |
| **VHDX** | `VhdxHelperClient` / `VhdxSession` | Virtual hard disk container (forensic evidence container) |
| **Compressed logs** | `LogFolderCompressor` | Compressed acquisition logs |

### Forensic Integrity

| Feature | Component | Description |
|---|---|---|
| **Hashing** | `HashManager` / `Hash.Result` | Cryptographic hashing of all collected items |
| **Timestamping** | `TimestampClient` | RFC 3161 trusted timestamps |
| **Timestamp verification** | `TimestampVerificationClient` | Verify timestamp integrity |
| **S/MIME** | `SMIME` namespace | S/MIME signature verification |
| **Metadata export maps** | `MetadataExportMaps` | 8 export maps for different collection types |
| **History reporting** | `HistoryReportExporter` | Audit trail of collection actions |

### Differential/Incremental Collection

`Differential` namespace — FEC can perform incremental collections that only download new or changed items since the last collection, critical for ongoing investigations.

---

## 8. Additional Data Sources

### Google Calendar
- `IncludeCalendar` (GmailApiServerSettings property)
- `Google.Apis.Calendar.v3.dll` — full Calendar API integration
- `GoogleCalendarInPlaceSearchView` — calendar-specific search UI

### Microsoft Contacts
- `AcquireContacts` (GraphServerSettings property)
- Collected via Microsoft Graph API

### Google Workspace Admin
- `Google.Apis.Admin.Directory.directory_v1.dll` — user/group enumeration for Workspace domains

### Google Vault Integration
- Full import of Google Vault exports:
  - `VaultExportDirectory` — path to vault export
  - `MetadataCsvPath` — vault metadata
  - `DriveDataFolder` / `DriveDataFolderIsCompressed` — Drive data from vault
  - `DriveLinksCsvPath` / `DriveErrorsCsvPath` — link/error correlation
  - `DriveMetadataXmlPath` — Drive metadata XML

### Google Takeout Integration
- Import from Google Takeout MBOX exports:
  - `TakeoutDirectory` — path to Takeout archive
  - `MboxFolder` — specific MBOX folder
  - `PopulatePathsFromGmailLabels` — reconstruct folder paths from Gmail labels
  - `DuplicatePathsForEachGmailLabel` — handle multi-label messages

---

## 9. Infrastructure & Resilience

### Network Libraries

| Library | Purpose |
|---|---|
| `Rebex.Networking.dll` (1.4MB) | TLS/SSL, proxy, SOCKS, certificate handling |
| `Rebex.Common.dll` (1.25MB) | Shared networking infrastructure |
| `Polly.dll` + `Polly.Core.dll` + `Polly.RateLimiting.dll` | Retry policies, circuit breakers, rate limiting |

### Connectivity Testing

`ConnectivityTester` — dedicated connectivity testing before starting collection, plus `PortTester` in the UI.

### Email Parsing

| Library | Purpose |
|---|---|
| `Aspose.Email.dll` (8.8MB) | Full email parsing: MIME, MSG, PST, MBOX, EML, TNEF, ICS |
| `MimeKitLite.dll` (922KB) | MIME parsing fallback / lightweight parser |
| `Rebex.Mail.dll` (404KB) | Mail message handling |

### Monitoring & Notifications

- `AcquisitionStatusEmailSender` (SMTP) — sends collection status emails during long-running acquisitions
- `Health` / `Progress` / `Status` — real-time health monitoring and progress tracking
- `Insights` — post-acquisition insights and analysis
- `NotificationEmailSettingsViewModel` — configurable notification emails

### Credential Management

- `CredentialManager` namespace — secure credential storage
- `EntraCertHandler` — Microsoft Entra ID certificate handling
- `AddCertificates` — client certificate management
- `AppOnlyCredentials` — app-only auth credential management

### Remote Authentication

- `RemoteAuth` — FEC Remote companion app integration
- `RemoteAuthViewModel` / `CustomTokenInputViewModel` — allows authentication on a mobile device and sending the token to FEC

---

## 10. Summary: Why FEC Is Industry-Leading

### Breadth

| Metric | Count |
|---|---|
| Connection protocols | 7 (EWS, Graph, Gmail API, IMAP, POP3, Takeout, Vault) |
| Pre-built server profiles | 39 providers |
| Exchange versions | 9 (2007 through 2016/Online) |
| Well-known folders | 20 (including Recoverable Items) |
| IMAP search terms | 13 types |
| Search engines | 5 (EWS, Gmail, Graph, IMAP, Lucene) |
| Authentication modes | 10+ (Basic, OAuth interactive, OAuth service account, App-only, Certificate, App password, Impersonation, Delegation, Remote auth, Custom token) |
| Output formats | 5 (EML, MSG, PST, VHDX, compressed) |
| Cloud storage modes | 8 (Attachments/Direct x Google/OneDrive x Current/Revisions) |
| Google Drive file types | 22 |
| Library DLLs | 48 |

### Depth

1. **Forensic-grade integrity** — cryptographic hashing, RFC 3161 timestamps, timestamp verification, S/MIME, audit trails
2. **Recoverable items** — collects soft-deleted, purged, and versioned items from Exchange dumpsters that most tools miss
3. **Date-scoped revision collection** — captures the exact file version active when an email was sent, not just the latest
4. **Pre-acquisition server-side search** — scope before download for legal compliance
5. **Differential collection** — incremental updates without re-downloading everything
6. **Multi-mailbox** — impersonation/delegation for bulk admin collection across an organization
7. **Cloud attachment resolution** — resolves modern OneDrive/SharePoint/Google Drive references to download the actual files
8. **Resilience** — Polly retry/circuit-breaker policies, rate limiting, health monitoring, email notifications for long-running jobs
9. **Domain auto-detection** — `ConvertDomainToProfile` maps email domains to optimal server profiles
10. **VHDX forensic containers** — native Windows forensic evidence containers

### What SherlockMail Should Prioritize

Based on this analysis, the highest-impact capabilities for SherlockMail to match FEC:

1. **Graph API + EWS dual support** — Graph is the future, EWS covers legacy Exchange
2. **Gmail API (not just IMAP)** — native API gives labels, search, Drive access, calendar
3. **Pre-built IMAP profiles** — the 30+ preset profiles with encrypted hostnames make it trivial for users to connect to any provider
4. **Domain auto-detection** — `ConvertDomainToProfile` is a great UX feature
5. **Server-side search** — pre-acquisition scoping is legally required in many forensic contexts
6. **Cryptographic hashing + timestamps** — non-negotiable for forensic tools
7. **Cloud attachment resolution** — modern attachments are increasingly common
8. **Differential collection** — essential for ongoing investigations
9. **Impersonation/delegation** — enterprise bulk collection
10. **Multiple output formats** — EML + PST at minimum
