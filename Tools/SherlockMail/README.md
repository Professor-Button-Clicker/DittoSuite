# SherlockMail

**v0.9.0** | FEC-grade forensic email collection desktop application for digital forensic and incident response (DFIR) investigations.

SherlockMail supports **7 email protocols** across **11 email providers** with multi-profile collection, automatic fallback switching, full chain-of-custody tracking, triple-hash verification (MD5 + SHA-256 + SHA-512), and standards-compliant evidence handling.

## Prerequisites

SherlockMail requires **Node.js** and **Electron** to run. The install script handles both automatically.

- **Node.js** (v18 or later) — JavaScript runtime ([download](https://nodejs.org/))
- **Electron** — Installed automatically by `npm install` as a project dependency

You do **not** need to install Electron separately. Running the install script or `npm install` will download and configure Electron along with all other dependencies.

## Installation

### Windows (Recommended)

1. Download or clone this repository
2. Double-click **`install.bat`**
   - Checks for Node.js and installs it via winget if missing
   - Runs `npm install` to download Electron and all dependencies
   - If Node.js was just installed, close and reopen your terminal, then run `install.bat` again
3. Once setup completes, launch SherlockMail with **`start.bat`** or `npm start`

### Manual Setup (All Platforms)

1. Install [Node.js](https://nodejs.org/) (LTS version recommended)
2. Open a terminal in the SherlockMail directory
3. Run:
   ```bash
   npm install
   ```
   This installs Electron and all dependencies.
4. Launch:
   ```bash
   npm start
   ```

## What Gets Installed

When you run `install.bat` or `npm install`, the following are installed locally to this project (not system-wide):

| Component | Purpose |
|-----------|---------|
| **Electron** | Desktop application framework (renders the app window) |
| **Express** | Local web server powering the application UI |
| **googleapis** | Google API client for Gmail API collection |
| **imapflow** | IMAP protocol handler with EXAMINE (read-only) mode |
| **mailparser** | Email parsing, MIME decoding, and header analysis |
| **uuid** | RFC 4122 UUID generation for evidence identifiers |
| **electron-builder** | Build tool for creating distributable installers |
| **sharp** | Image processing for attachment thumbnails |

All dependencies install into the `node_modules/` folder within the project directory.

## Supported Email Providers (11)

| Provider | Recommended Protocol | Collection Profiles | Auth Methods |
|----------|---------------------|---------------------|--------------|
| **Gmail / Google Workspace** | Gmail API | 4 profiles | OAuth 2.0, App Password |
| **Outlook / Microsoft 365** | Microsoft Graph API | 5 profiles | OAuth 2.0, Basic Auth |
| **Zoho Mail** | Zoho Mail API | 4 profiles | OAuth 2.0, Password |
| **Fastmail** | JMAP (RFC 8621) | 3 profiles | API Token, App Password |
| **Yahoo Mail** | IMAP | 4 profiles | App Password, Password |
| **AOL Mail** | IMAP | 3 profiles | App Password, Password |
| **iCloud Mail** | IMAP | 1 profile | App-Specific Password |
| **ProtonMail** | IMAP via Proton Bridge | 2 profiles | Bridge Password |
| **Yandex Mail** | IMAP | 3 profiles | App Password, Password |
| **Custom / Other** | IMAP | 3 profiles | Password |
| **Exchange On-Premises** | EWS | (via Custom) | Password, OAuth |

Each provider has multiple collection profiles ranked by priority. If the primary profile fails, SherlockMail suggests the next fallback profile automatically.

## Supported Protocols (7)

| Protocol | Description | Write Protection |
|----------|-------------|-----------------|
| **IMAP** | Internet Message Access Protocol — EXAMINE mode (read-only, ISO 27037) | Read-only |
| **POP3** | Post Office Protocol — Inbox only, may trigger deletion on some servers | Warning |
| **EWS** | Exchange Web Services — Full Exchange access including Recoverable Items | Read-only |
| **Microsoft Graph API** | Modern REST API for Microsoft 365 and Exchange Online | Read-only |
| **Gmail API** | Google REST API with label support and raw MIME download | Read-only |
| **Zoho Mail API** | Zoho REST API with regional endpoint auto-detection (US/EU/IN/AU/JP) | Read-only |
| **JMAP** | JSON Meta Application Protocol (RFC 8621) — Modern, efficient, JSON-based | Read-only |

## Export Formats (8)

| Format | Extension | Forensic Value | Use Case |
|--------|-----------|---------------|----------|
| **EML** (RFC 5322) | `.eml` | HIGH | Gold standard — raw message with full headers, MIME structure, attachments |
| **MSG** (Outlook) | `.msg` | HIGH | Microsoft OLE/COM format with Outlook-specific properties |
| **PST** (Personal Storage) | `.pst` | HIGH | Single container with folder hierarchy, opens in Outlook |
| **MBOX** (Unix Mailbox) | `.mbox` | MEDIUM | Concatenated messages, used by Thunderbird and Google Takeout |
| **MIME** (Raw) | `.mime` | HIGH | Exact server response, forensically equivalent to EML |
| **PDF Report** | `.html` | MEDIUM | Printable report with metadata, headers, body, and hashes for court |
| **Concordance DAT** | `.dat` | HIGH | eDiscovery load file (thorn/eth delimiters) with Bates numbering |
| **XML** (Structured) | `.xml` | HIGH | Structured export for case management, XSLT, and database imports |

All exports include a SHA-256 hash manifest for integrity verification.

## Features

### Collection & Acquisition
- **Multi-Profile Collection** — Multiple collection profiles per provider with priority-based automatic fallback
- **9-Step Collection Wizard** — Guided acquisition from provider selection through verification
- **Differential Collection** — Collect only new messages since last acquisition
- **Folder Selection** — Choose specific folders or collect entire mailbox
- **OAuth 2.0 Integration** — Built-in OAuth flows for Google, Microsoft, and Zoho (callback ports: Google=3847, Microsoft=3848, Zoho=3849)

### Forensic Integrity
- **Triple Hashing** — MD5 + SHA-256 + SHA-512 for every collected message (NIST FIPS 180-4)
- **SHA-256 Hash Chain** — Audit log entries linked by SHA-256 hash chain per NIST SP 800-86
- **RFC 3161 Timestamps** — Structured trusted timestamps for evidence timing (internal TSA; use a production TSA for legal binding)
- **Chain of Custody** — Full audit trail with examiner, agency, legal authority, and scope documentation
- **Bates Numbering** — Automatic Bates stamping in SM-0000001 format (Concordance DAT export)
- **Write Protection Verification** — Confirms read-only access per ISO 27037 / ACPO Principle 1

### Analysis & Search
- **Inline Search Engine** — Full-text search across collected messages with query history
- **Email Threading** — Conversation reconstruction via In-Reply-To / References headers
- **Duplicate Detection** — By SHA-256 hash and Message-ID
- **Header Analysis** — Full email header forensic analysis and display
- **Encryption & Signing Detection** — Identifies S/MIME, PGP-encrypted, and signed messages
- **Cloud Attachment Detection** — Identifies Google Drive, OneDrive, and Dropbox links in messages

### Quality Control (11 Checks)

| # | Check | Category |
|---|-------|----------|
| 1 | Collection Completeness | collection |
| 2 | Hash Integrity | integrity |
| 3 | Duplicate Detection | data_quality |
| 4 | Date Consistency | data_quality |
| 5 | Required Fields | data_quality |
| 6 | Folder Coverage | collection |
| 7 | Export Completeness | export |
| 8 | Audit Trail | forensic |
| 9 | Encryption & Signing Detection | security |
| 10 | Write Protection (ISO 27037) | forensic |
| 11 | DFIR Standards Compliance | forensic |

### Application
- **Desktop App** — Electron-based, runs on Windows, macOS, and Linux
- **Dark / Light Theme** — Toggle between dark and light mode
- **Tab-Based Interface** — Projects, Tracker, Collect, QC, Export, Review, and Guide tabs
- **Built-in Guide** — 13-section reference guide covering all features and standards
- **Evidence Integrity Verification** — Re-verify hash integrity of collected evidence at any time

## DFIR Standards Compliance

SherlockMail is designed to align with the following standards:

| Standard | Description |
|----------|-------------|
| **ISO/IEC 27037:2012** | Identification, collection, acquisition, and preservation of digital evidence |
| **NIST SP 800-86** | Guide to Integrating Forensic Techniques into Incident Response |
| **NIST FIPS 180-4** | Secure Hash Standard (SHA-256, SHA-512) |
| **SWGDE 18-F-002-2.0 (2025)** | Best Practices for Digital Evidence Collection |
| **SWGDE 23-F-004-1.1** | Digital Evidence from Cloud Service Providers |
| **ACPO Good Practice Guide v5 (2012)** | Four Principles for Digital Evidence |
| **EDRM Collection Standards** | Repeatable processes with documented risks |
| **FRE 901(b)(9)** | Process or System Producing Accurate Result |
| **FRE 902(14)** | Certified Data from Electronic Process |
| **RFC 3161** | Internet X.509 PKI Time-Stamp Protocol (structure; use production TSA for legal binding) |
| **ETSI EN 319 421/422** | Policy and protocol requirements for trust service providers (reference only) |

> **Important**: SherlockMail's internal timestamps are structured per RFC 3161 but are NOT issued by an accredited Qualified Trust Service Provider (QTSP). For court-admissible timestamps with independent attestation, connect to a production TSA such as DigiCert, Sectigo, GlobalSign, or FreeTSA.

## Database

SherlockMail uses Node.js built-in SQLite (`node:sqlite`, DatabaseSync) with WAL mode. The database schema includes tables for:

- Projects, Folders, Messages, Attachments
- Acquisitions, Search Queries, Export Records
- Audit Log (hash-chained), QC Results
- Differential IDs, Drive Links, Timestamp Records, Inline Searches

All data is stored locally in the `data/` directory within the project.

## Building a Distributable Installer

To create a standalone installer that does **not** require end users to install Node.js or Electron:

```bash
npm run build:win     # Windows (.exe NSIS installer)
npm run build:mac     # macOS (.dmg)
npm run build:linux   # Linux (.AppImage)
```

Built installers are placed in the `release/` directory. These are fully self-contained and bundle Electron internally — end users do not need Node.js or Electron installed.

## Project Structure

```
SherlockMail/
  main.js              # Electron entry point
  server.js            # Express server (also runs standalone on port 3000)
  package.json         # Dependencies and build configuration
  install.bat          # Automated Windows setup script
  start.bat            # One-click Windows launcher
  public/              # Frontend (HTML, CSS, JavaScript)
    index.html         # Single-page application UI
    css/styles.css     # Application styles
    js/app.js          # Frontend application logic
  src/
    api/routes.js      # REST API endpoints
    db/
      database.js      # Database operations
      schema.sql       # SQLite schema
    protocols/         # Email protocol handlers
      imap-handler.js
      pop3-handler.js
      ews-handler.js
      graph-handler.js
      gmail-handler.js
      zoho-handler.js
      jmap-handler.js
    services/          # Core services
      export-service.js
      quality-control.js
      inline-search.js
      timestamp-service.js
      cloud-attachment-service.js
      provider-profiles.js
      google-oauth.js
      microsoft-oauth.js
      zoho-oauth.js
      fastmail-auth.js
  data/                # SQLite database and exports (created at runtime)
  assets/              # Application icon
```

## License

Proprietary — For authorized forensic use only.
