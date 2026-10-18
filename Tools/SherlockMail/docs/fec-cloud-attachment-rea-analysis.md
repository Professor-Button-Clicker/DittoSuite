# FEC Cloud Attachment & Google Drive Collection — REA Deep Analysis

## Analysis Method
REA-based static analysis of FEC v4.5.888 (Metaspike Forensic Email Collector) — .NET 10, assemblies: `FEC.Core.dll` (1070 types, 8749 methods), `FEC.dll` (494 types), `EwsCoreLib.dll` (892 types). Decompiled with REA's managed .NET inspection tools for method bodies, call graphs, and type hierarchies.

---

## 1. Architecture Overview

FEC separates cloud attachment collection into two distinct subsystems controlled by two settings interfaces:

- **`ICloudAttachmentCollectorSettings`** — for cloud attachments linked FROM emails (modern/reference attachments)
  - `FetchCloudAttachments` — master toggle
  - `IncludeCloudAttachmentRevisions` — fetch revision history
  - `FetchOnlyLatestRevisionBeforeParentWasSent` — date-scoped: only the revision active when the email was sent
  - `IsFolderAcquisitionSupported` — whether Drive folder traversal is enabled

- **`IDirectCloudStorageCollectorSettings`** — for direct cloud storage enumeration (not linked from emails)
  - `IncludeDirectCloudStorage` — master toggle
  - `IncludeDirectCloudStorageRevisions` — revision history for direct items

## 2. Drive Acquisition Modes (`DriveAcquisitionMode` enum)

FEC defines **8 distinct acquisition modes**:

| Mode | Description |
|---|---|
| `Attachments` | Google Drive files referenced in Gmail messages |
| `Revisions` | Revision history of Google Drive attachments |
| `Direct` | Direct Google Drive storage enumeration (not linked from emails) |
| `DirectRevisions` | Revision history of direct Google Drive items |
| `OneDriveAttachments` | OneDrive/SharePoint "modern attachments" from Exchange/Outlook |
| `OneDriveAttachmentRevisions` | Revision history of OneDrive modern attachments |
| `DirectOneDrive` | Direct OneDrive storage enumeration |
| `DirectOneDriveRevisions` | Revision history of direct OneDrive items |

## 3. Google Drive Link Collection (Gmail)

### Detection
FEC scans Gmail messages for Google Drive sharing links. The `GoogleDriveAttachmentInfo` type tracks:
- `ExtractedResourceKey` — the Drive resource key parsed from the sharing URL
- `AcquiredResourceKey` — the key used for API acquisition
- `ShortcutTargetId` / `ShortcutTargetMimeType` / `ShortcutTargetResourceKey` — resolves Google Drive shortcuts to their actual targets
- `SelectedExportLink` — for Google Workspace native files (Docs, Sheets, Slides) that need export conversion
- `ParentSentDate` — used for date-scoped revision fetching
- `Permissions` / `Owners` — captures sharing/ownership metadata

### Collection Pipeline (from `GmailDownloadPackage` async methods)
1. `GetSharedDrives` → `AddSharedDrives` — enumerate shared drives
2. `GetDriveRootFolder` → `PopulateDriveFolderList` — build folder tree
3. `ListItemsInDriveFolder` → `GetChildrenForDriveFolder` — recursive folder traversal
4. `GetSearchResultsFromDrive` — Drive search API queries
5. `PopulateDriveItemMetadata` — enrich items with full metadata
6. `ListRevisionsForDriveItems` — enumerate revision history
7. `DownloadDriveItems` → uses `FetchDriveAttachmentFromExportLink` for Google Workspace files or `DownloadDriveAttachment` / `DownloadDriveItem` for binary files

### DirectDriveItemLister (`Metaspike.FEC.Core.Mail.Gmail.DirectDriveItemLister`)
- `GetDirectDriveItems` — lists all items in the user's Drive directly (not from email references)
- Uses `DirectDriveTreePopulator` to build folder hierarchy
- `DirectDriveTreeNode` for tree structure

### Supported File Types (`DriveItemType` enum — 22 types)
Folder, GoogleDoc, GoogleSheet, GoogleSlide, Pdf, Image, Video, Audio, Text, GoogleForm, Shortcut, GoogleSite, Jamboard, GoogleMyMaps, GoogleDrawing, GooglePhoto, GoogleAppsScript, Archive, Word, Excel, Powerpoint, Email, Unknown

### APIs
`Google.Apis.Drive.v3.dll` (Google Drive API v3), `Google.Apis.Gmail.v1.dll` (Gmail API v1)

## 4. OneDrive/SharePoint Modern Attachment Collection (Exchange/Graph)

### Detection via EWS
The `EwsCoreLib.dll` contains `ReferenceAttachment` (extends `Attachment`), which is Microsoft's implementation of "modern attachments" — cloud-hosted files referenced in emails rather than attached as binary. Key fields:
- `AttachLongPathName` — the full OneDrive/SharePoint path to the file
- `ProviderType` — identifies the cloud storage provider
- `ProviderEndpointUrl` — the provider's API endpoint
- `AttachmentThumbnailUrl` / `AttachmentPreviewUrl` — preview URLs
- `PermissionType` — sharing permission level
- `AttachmentIsFolder` — whether the reference is a folder

FEC reads these from the EWS XML response via `TryReadElementFromXml` / `TryReadElementFromXmlToPatch`.

### Detection via Graph API
`GraphItemInfo` in FEC.Core handles items from Microsoft Graph, with Graph-specific token handling via `Metaspike.FEC.Core.OAUTH.Graph.TokenProvider` / `GraphToken`.

### OneDrive Collection Pipeline (from Graph download package)
1. `AddOneDrives` — enumerate user's OneDrive(s)
2. `AddSharePoint` → `AddDrivesOfSharePointSite` → `GetListOfSharePointSites` — enumerate SharePoint sites and their document libraries
3. `GetFoldersOnlyFromDrive` → `GetItemsFromDriveWithDeltaQuery` — uses delta queries for efficient enumeration
4. `ListItemsInDriveFolder` → `PopulateDriveFolderList` → `PopulateDriveItemMetadata`
5. `ListRevisionsForDriveItems` — revision history
6. `DownloadDriveItems` → `SaveOneDriveContentStreamToDisk`
7. `AcquireMetadataForDirectOneDriveItem` — rich metadata fetch
8. `AcquireDummyTokenForEwsOneDriveAttachmentsIfNecessary` — special token handling for EWS-discovered modern attachments

### OneDrive Data Model (`OneDriveAttachmentInfo`)
- `Url` — the sharing link URL from the modern attachment
- `MessageId` — parent email message
- `InvalidSharingLink` — handles broken/expired links
- `ShareToken` — extracted sharing token for API access

### OneDriveItemInfo (Rich Metadata)
- `QuickXorHash`, `Sha256Hash`, `ETag`, `CTag` — integrity hashes
- `FsDateCreated`, `FsDateLastModified`, `FsDateLastAccessed` — filesystem dates
- `CreatedBy`, `LastModifiedBy` — authorship
- `WebUrl`, `Location`, `PhotoInfo` — additional metadata
- `IsDeleted` — tracks deleted items
- `DriveId`, `FolderPath` — structural location

### APIs
`Microsoft.Graph.dll` / `Microsoft.Graph.Core.dll` (Microsoft Graph API), `EwsCoreLib.dll` (Exchange Web Services)

## 5. Revision & Date-Scoped Collection

FEC has sophisticated revision handling:
- `DriveRevisionDateDeterminationInfo` — determines which revision was current when an email was sent
- `RevisionToMessageMapper` — maps revisions back to source messages (DriveAttachmentId → MessageId)
- `DriveAttachmentSettings.FetchOnlyLatestRevisionBeforeParentWasSent` — date-scoped mode: only acquires the revision that was active when the parent email was sent
- `AcquireAllRevisionsIfNoneFoundBeforeParentDate` — fallback: get all revisions if none found before the email date
- `EnableDirectLinkFallbackAcquisition` — fallback to direct link if API fails
- `DetectExtensionFromBinaryContents` — magic-byte file type detection

## 6. Post-Acquisition: Cloud Attachment Packaging

After download, FEC packages cloud attachments to associate them with their parent emails:
- **`CloudAttachmentStager`** — stages downloaded files post-acquisition (`StageCloudAttachmentsPostAcquisition`, `StageCloudAttachmentsAutomatically`)
- **`CloudAttachmentPackager`** — creates `CloudAttachmentPackage` entries linking:
  - `MessageId` — parent email
  - `MimePath` / `MsgPath` — paths to the email in MIME/MSG format
  - `DriveAttachmentNumber` — sequence number
  - `DriveOutputPath` / `DriveRevisionOutputPath` — where the downloaded file was saved
- **`DrivePathPopulator`** — populates output folder structure

## 7. Export Metadata

Separate export maps for each mode (8 maps total):
- `DriveAttachmentExportMap`, `DriveRevisionExportMap`
- `OneDriveAttachmentExportMap`, `OneDriveAttachmentRevisionExportMap`
- `DirectDriveItemExportMap`, `DirectDriveRevisionExportMap`
- `DirectOneDriveItemExportMap`, `DirectOneDriveRevisionExportMap`

## 8. UI Views (from FEC.dll)

FEC provides dedicated UI for cloud storage:
- `GoogleDriveInPlaceSearchView` — search within Google Drive
- `MicrosoftOneDriveInPlaceSearchView` — search within OneDrive
- `AdvancedDriveOptionsView` — Google Drive acquisition settings
- `AdvancedOneDriveOptionsView` — OneDrive acquisition settings
- `DriveExplorerView` — visual Drive browser
- `GmailApiView` / `GraphApiView` — connection profile setup

---

## Key Takeaways for SherlockMail

1. **Reference Attachments are first-class in EWS** — `ReferenceAttachment` extends `Attachment` with `AttachLongPathName`, `ProviderType`, `ProviderEndpointUrl`, and `PermissionType`. Detect them via `TryReadElementFromXml`.

2. **Google Drive links are extracted from email bodies** — FEC parses sharing URLs to get resource keys, then resolves them via Drive API v3. `GoogleDriveAttachmentInfo` tracks `ExtractedResourceKey` and handles shortcuts via `ShortcutTargetId`.

3. **8 acquisition modes** — FEC tracks attachments vs direct, Google vs OneDrive, current vs revisions as 8 separate pipelines with independent export maps.

4. **Date-scoped revision collection** — `FetchOnlyLatestRevisionBeforeParentWasSent` captures the exact file version that was current when the email was sent, using `RevisionToMessageMapper` for correlation.

5. **OneDrive delta queries** — `GetItemsFromDriveWithDeltaQuery` for efficient incremental enumeration of large drives.

6. **22 Google Drive item types** — including native Google formats (Doc, Sheet, Slide, Form, Drawing, MyMaps, AppsScript, Site, Jamboard) that all need export conversion.

7. **Rich forensic metadata for OneDrive** — `QuickXorHash`, `Sha256Hash`, filesystem timestamps, authorship, deletion status.

8. **Dummy token pattern** — `AcquireDummyTokenForEwsOneDriveAttachmentsIfNecessary` handles the gap where EWS auth alone doesn't grant OneDrive access.
