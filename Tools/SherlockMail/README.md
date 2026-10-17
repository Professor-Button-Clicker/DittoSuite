# SherlockMail

Forensic email collection desktop application for digital forensic and incident response (DFIR) investigations. Supports 7 email protocols with full chain-of-custody tracking, hash verification, and standards-compliant evidence handling.

## Prerequisites

SherlockMail requires **Node.js** and **Electron** to run. The install script handles both automatically.

- **Node.js** (v18 or later) - JavaScript runtime
- **Electron** - Installed automatically by `npm install` as a project dependency

You do **not** need to install Electron separately. Running the install script or `npm install` will download and configure Electron along with all other dependencies.

## Installation

### Windows (Recommended)

1. Download or clone this repository
2. Double-click **`install.bat`**
   - This will check for Node.js and install it via winget if missing
   - It then runs `npm install` to download Electron and all dependencies
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
| **Electron** | Desktop application framework (runs the app window) |
| **Express** | Local web server for the application UI |
| **googleapis** | Google API client for Gmail collection |
| **imapflow** | IMAP protocol support |
| **mailparser** | Email parsing and header analysis |
| **electron-builder** | Build tool for creating distributable installers |

All dependencies install into the `node_modules/` folder within the project directory.

## Supported Email Protocols

| Protocol | Providers |
|----------|-----------|
| IMAP | Yahoo, AOL, Outlook, any IMAP server |
| POP3 | Legacy mailboxes |
| EWS | Microsoft Exchange on-premises |
| Microsoft Graph API | Microsoft 365, Outlook.com |
| Gmail API | Google Workspace, Gmail |
| Zoho API | Zoho Mail |
| JMAP | Fastmail, JMAP-compatible servers |

## Features

- **Multi-Profile Collection** - Multiple collection profiles per provider with automatic fallback
- **11-Point QC Verification** - Automated quality control checks on collected evidence
- **8 Export Formats** - EML, MBOX, MSG, PST, MIME, PDF Report, Concordance DAT, XML
- **Chain of Custody** - Full audit trail with SHA-256 hash chain (NIST SP 800-86)
- **Bates Numbering** - Automatic Bates stamping in SM-0000001 format
- **RFC 3161 Timestamps** - Structured trusted timestamps for evidence integrity
- **Email Threading** - Conversation reconstruction and duplicate detection
- **Header Analysis** - Full email header forensic analysis

## DFIR Standards Compliance

SherlockMail is designed to align with the following standards:

- **ISO/IEC 27037:2012** - Identification, collection, acquisition, preservation of digital evidence
- **NIST SP 800-86** - Guide to Integrating Forensic Techniques into Incident Response
- **SWGDE 18-F-002-2.0 (2025)** - Best Practices for Digital Evidence Collection
- **ACPO Good Practice Guide v5 (2012)** - Four Principles for Digital Evidence
- **EDRM Collection Standards** - Repeatable processes with documented risks
- **FRE 901/902** - Federal Rules of Evidence authentication requirements

## Building a Distributable Installer

To create a standalone installer that does **not** require end users to install Node.js or Electron:

```bash
npm run build:win     # Windows (.exe installer)
npm run build:mac     # macOS (.dmg)
npm run build:linux   # Linux (.AppImage)
```

Built installers are placed in the `release/` directory. These are fully self-contained and bundle Electron internally.

## License

Proprietary - For authorized forensic use only.
