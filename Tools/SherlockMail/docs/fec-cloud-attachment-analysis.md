# FEC Cloud Attachment Collection Architecture

## Analysis Method
Reverse-engineered from .NET binary string/symbol extraction of FEC.Core.dll, FEC.dll, EwsCoreLib.dll, and reference to Microsoft.Graph.dll and Google.Apis.Drive.v3.dll at `C:\Program Files\FEC\Forensic Email Collector\`.

> **See also**: [fec-cloud-attachment-rea-analysis.md](fec-cloud-attachment-rea-analysis.md) — deeper REA decompilation analysis with method bodies, type hierarchies, and the full `DriveAcquisitionMode` enum (8 modes), `ReferenceAttachment` field details, and date-scoped revision collection logic.

---

## Overview

FEC (Forensic Email Collector by Metaspike) handles cloud-linked files through a **multi-stage pipeline** with two distinct collection modes:

1. **Cloud Attachment Collection** — files linked inside emails (OneDrive/SharePoint/Google Drive URLs)
2. **Direct Drive Collection** — standalone collection of entire cloud storage contents

Both modes support **revision/version history** capture and produce **self-contained forensic output** (MIME/MSG/PST containers with cloud files embedded).

---

## 1. Exchange/O365: Reference Attachments

### Detection
In Exchange/O365, "modern attachments" are stored as **Reference Attachments** — a native EWS attachment type where the attachment metadata contains a URL instead of binary content.

Key EWS types (from `EwsCoreLib.dll`):
- `AddReferenceAttachment` — EWS method to create reference attachments
- `FileAttachment` / `ItemAttachment` / `ReferenceAttachment` — three distinct attachment types
- `AttachmentCollection` — loads all attachment types including references
- `isInline` — flag distinguishing inline images from regular attachments
- `contentId` — Content-ID for inline reference resolution

### Resolution Flow
1. During email collection, FEC enumerates attachments via EWS
2. Reference attachments contain a `driveattachmenturl` (OneDrive/SharePoint sharing URL)
3. FEC resolves the sharing URL via Microsoft Graph API's `/shares/` endpoint
4. The sharing URL is encoded using Microsoft's `u!` base64 scheme:
   - `SharedDriveItemItemRequestBuilder` — Graph SDK builder for `/shares/{encoded-url}/driveItem`
   - `InvalidSharingLink` — error handling for unresolvable links
5. The resolved `DriveItem` provides the actual file download URL

### Microsoft Graph API Integration
Libraries: `Microsoft.Graph.dll`, `Microsoft.Graph.Core.dll`

Key request builders:
- `DriveItemRequestBuilder` / `DriveItemItemRequestBuilder` — fetch drive items
- `DriveItemVersionCollectionResponse` — version history
- `DriveItemVersionItemRequestBuilder` — specific version download
- `SharedDriveItemItemRequestBuilder` — resolve sharing links
- `BaseGraphServiceClient` — authenticated Graph client

Authentication:
- `Microsoft.Identity.Client.dll` (MSAL) for OAuth2
- `AcquireTokenInteractive` / `AcquireTokenSilent` — interactive and cached token flows
- `AcquireDummyTokenForEwsOneDriveAttachmentsIfNecessary` — fallback when EWS auth alone can't access OneDrive
- Scopes: `EwsScope`, `GraphDefaultScope`, `ImapScope`

### OneDrive/SharePoint Enumeration
- `AddOneDrives` / `AddOneDrivesUnderFolderName` — enumerate user's OneDrive
- `AddDrivesOfSharePointSite` / `GetListOfSharePointSites` — enumerate SharePoint sites
- `AddSharedDrives` / `GetSharedDrives` — shared drives
- `OneDriveQuery` — search/filter within OneDrive

---

## 2. Google: Gmail + Drive Links

### Detection
For Gmail, FEC parses email bodies to find Google Drive links (there is no native "reference attachment" type in Gmail/IMAP).

Key components:
- `GmailOauthConnector` — OAuth connection to Gmail
- `ConnectToGMailViaOauth` / `ConnectToGMailViaDelegation` — two auth modes
- `EncryptedCustomGmailApiClientId` / `EncryptedCustomGmailApiClientSecret` — stored OAuth credentials
- `AddGmailSearchResultsToResultsPackage` — search-based collection

### Google Drive API Integration
Library: `Google.Apis.Drive.v3.dll`

Download strategies:
- **Binary files**: Direct download via Drive API `files.get` with `alt=media`
- **Native Google formats** (Docs/Sheets/Slides): Export via `files.export()` with selected MIME type
  - `FetchDriveAttachmentFromExportLink` — downloads via export link
  - `ExportLinks` / `SelectedExportLink` — available export formats for native docs
  - `GetDriveItemTypeFromMimeTypeAndFileName` — determines file type
- **Shortcuts**: Resolved via shortcut metadata
  - `ShortcutTargetId` — the actual file ID the shortcut points to
  - `ShortcutTargetMimeType` — the target file's MIME type
  - `ShortcutTargetResourceKey` — resource key for access

### Google Drive Folder Collection
- `GoogleDriveFolderInfo` — folder metadata
- `GoogleDriveItemInfo` — item metadata
- `googleDrives` — enumeration of available drives
- `DirectGoogleDriveItemInfo` — items collected directly from Drive (not via email links)

---

## 3. The Cloud Attachment Pipeline

### Stage 1: Fetch
- `FetchCloudAttachments` — master toggle for cloud attachment collection
- `FetchDriveAttachments` — fetch from any drive type
- `FetchOneDriveAttachments` — OneDrive-specific fetch
- `driveAttachmentCollectorClient` — API client for downloading

Each attachment gets metadata:
- `driveattachmentid` — unique ID
- `driveattachmentserviceid` — service-specific ID
- `driveattachmenturl` — original sharing/link URL
- `DriveAttachmentNumber` — sequential number in collection

### Stage 2: Stage (CloudAttachmentStager)
Namespace: `Metaspike.FEC.Core.CloudAttachment`

- `CloudAttachmentStager` — downloads cloud files to local staging area
- `StageCloudAttachments` / `StageCloudAttachmentsAutomatically` — manual or auto staging
- `StageCloudAttachmentsPostAcquisition` — stage after email collection completes
- Staging folders:
  - `CloudAttachmentMIMEStagingFolderName` — staging area for MIME output
  - `CloudAttachmentMSGStagingFolderName` — staging area for MSG output
- `DriveAttachmentsStaged` — completion flag
- `StageDriveAttachmentsError` — error handling

### Stage 3: Package (CloudAttachmentPackager)
- `CloudAttachmentPackager` — repackages downloaded files into email containers
- `PackageCloudAttachments` — master packaging operation
- `PackageMimeOutputWithCloudAttachments` — insert into MIME files
- `PackageMsgOutputWithCloudAttachments` — insert into MSG files
- Package folders:
  - `CloudAttachmentMIMEPackageFolderName`
  - `CloudAttachmentMSGPackageFolderName`
- `CloudAttachmentPackage` / `CloudAttachmentArchivePackage` — package metadata
- `DriveAttachmentsPackaged` — completion flag

### Stage 4: Containerize
- `ContainerizeOutput` / `ContainerizeOutputIfNeeded` — final container creation
- `ContainerizeMimeOutput` — package as MIME container
- `ContainerizeMsgOutput` — package as MSG container
- `ContainerizeDirectDrive` / `ContainerizeDirectDriveOutput` — container for direct drive items
- `ContainerizeItems` — generic item containerization
- Output flags: `MimeContainerized`, `MsgContainerized`, `PstContainerized`, `DirectDriveContainerized`

---

## 4. Revision/Version History Collection

FEC can capture **all revisions** of cloud files:

### Settings
- `IncludeCloudAttachmentRevisions` — enable revision collection for email-linked files
- `IncludeDirectDriveRevisions` — enable revision collection for direct drive items
- `IncludeDirectCloudStorageRevisions` — broader toggle
- `FetchDriveRevisions` — master fetch toggle
- `SkipLastDriveRevision` — optimization to skip current version if already downloaded
- `FetchOnlyLatestDirectDriveRevisionBeforeTargetDate` — forensic option: get version as of specific date
- `AcquireAllRevisionsIfNoneFoundBeforeParentDate` — fallback when no revision matches date

### Per-Provider Revision Tracking
- `_googleDriveAttachmentRevisionStatusResultsBag` — Google Drive attachment revisions
- `_oneDriveAttachmentRevisionStatusResultsBag` — OneDrive attachment revisions
- `_directGoogleDriveRevisionStatusResultsBag` — Direct Google Drive revisions
- `_directOneDriveRevisionStatusResultsBag` — Direct OneDrive revisions

### Revision Metadata
- `DriveRevisionDateDeterminationInfo` / `DriveRevisionDateDeterminationPackage` — when each revision was created
- `CaptureDirectDriveRevisionInformation` / `CaptureDriveAttachmentRevisionInformation` — metadata capture
- `ListRevisionsForDriveItems` — enumerate all versions

### Download
- `DownloadDriveRevision` — download a specific revision
- `DownloadDirectDriveRevisionsIfNeeded` / `DownloadDriveAttachmentRevisionsIfNeeded` — conditional download
- `GetNotYetDownloadedGoogleDriveAttachmentRevisions` / `GetNotYetDownloadedOneDriveAttachmentRevisions` — resumable

---

## 5. Direct Drive Collection

Independent from email collection — collects entire cloud storage:

### Tree Enumeration
- `DirectDriveItemLister` — lists all items in a drive
- `DirectDriveTreePopulator` / `DirectDriveTreeNode` — builds folder tree structure
- `DirectDriveQuery` — search/filter items
- `childrenDriveItems` — child items under a folder
- `GetDirectDriveItems` — fetch selected items

### UI Components (FEC.dll)
- `DriveExplorerView` / `DriveExplorerViewModel` — file browser UI
- `DirectDriveViewModel` — direct drive item display
- `AdvancedDriveOptionsView` / `AdvancedDriveOptionsViewModel` — configuration
- `AdvancedOneDriveOptionsView` / `AdvancedOneDriveOptionsViewModel` — OneDrive-specific options
- `ClearDriveSelectionCommand` — reset selection
- `SelectedDirectDriveItems` — user's selection
- `UseFlatFolderStructureForDirectDrive` — output structure option

### Download & Processing
- `DownloadDirectDriveItems` / `DownloadDirectDriveItemsFromFoldersIfNecessary`
- `DownloadDriveItem` — single item download
- `SaveDownloadedDriveItem` / `SaveOneDriveContentStreamToDisk` — persist to disk
- `ProcessDownloadedDriveItem` — post-download processing
- `DriveItemDownloadEventArgs` — progress events

### Persistence & Export
- `PersistDirectDriveItems` / `PersistDirectOneDriveItems` — save to database
- `PersistGoogleDriveInfoList` / `PersistOneDriveInfoList` — metadata persistence
- `DirectDriveItemExportMap` / `DirectDriveRevisionExportMap` — export mapping
- `DirectDriveItemHashResult` / `DirectDriveRevisionHashResult` — forensic hashing
- `ExportListOfDirectDriveItems` / `ExportListOfDirectDriveRevisions` — export lists

### Error Tracking
- `DirectDriveItemsWithPermanentErrors` — items that failed permanently
- `DirectDriveItemsWithoutMetadata` — items missing metadata
- `DirectDriveItemsWithoutRevisionInfo` — items where revision fetch failed
- `DriveAttachmentsWithPermanentErrors` — failed attachment downloads
- `_remainingDirectDriveItems` / `_totalDirectDriveItems` — progress counters

---

## 6. Google Vault Integration

FEC also supports collecting from Google Vault exports:
- `LocalVault` / `LocalVaultItemInfo` — local vault data
- `VaultExportDirectory` — path to vault export
- `IncludeVaultDriveAttachmentsHelpMessage` — toggle for vault drive attachments
- `PopulateDriveErrorsFromVault` — error correlation

---

## 7. Additional Libraries

| DLL | Purpose |
|-----|---------|
| `Aspose.Email.dll` | Email parsing, MIME/MSG/PST creation |
| `MimeKitLite.dll` | MIME parsing fallback |
| `Rebex.Imap.dll` / `Rebex.Pop3.dll` | IMAP/POP3 for non-Graph connections |
| `Microsoft.Identity.Client.dll` | MSAL OAuth2 tokens |
| `Google.Apis.Auth.dll` | Google OAuth2 |
| `Google.Apis.Gmail.v1.dll` | Gmail API |
| `Google.Apis.Drive.v3.dll` | Google Drive API |
| `Google.Apis.Admin.Directory.directory_v1.dll` | Google Workspace admin |
| `Google.Apis.Calendar.v3.dll` | Google Calendar collection |
| `Microsoft.Graph.dll` | Microsoft Graph API |
| `Polly.dll` / `Polly.Core.dll` | Retry/resilience policies |
| `NLog.dll` | Logging |
| `Microsoft.Data.Sqlite.dll` | Local database |
| `Lucene.Net.dll` | Full-text search indexing |

---

## Key Takeaways for SherlockMail Implementation

1. **Reference Attachments are first-class in EWS** — use the EWS managed API or Graph API to detect them; they have a `providerType` and `attachmentUrl` you can resolve.

2. **Graph `/shares/` endpoint** is essential — encode sharing URLs with base64url (`u!` prefix) to resolve them to `DriveItem` objects you can download.

3. **Google native formats need export** — Docs/Sheets/Slides don't have downloadable binary content; use `files.export()` with the appropriate MIME type (DOCX, XLSX, PPTX, PDF).

4. **Google Drive shortcuts** are pointers, not files — resolve `shortcutDetails.targetId` and `shortcutDetails.targetMimeType` to get the actual file.

5. **Revision history is valuable for forensics** — both Graph and Google Drive API support listing and downloading previous versions.

6. **Stage → Package → Containerize** keeps the pipeline clean — download files separately, then inject them into email containers, then produce final output.

7. **Separate OAuth scopes needed** — EWS/IMAP access doesn't grant OneDrive access; you need separate Graph or Drive API tokens with appropriate scopes.

8. **Error tracking per-item** — FEC tracks permanent errors, missing metadata, and missing revision info separately for comprehensive reporting.
