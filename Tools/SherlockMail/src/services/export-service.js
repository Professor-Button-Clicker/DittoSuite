import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export class ExportService {

  static getFormats() {
    return {
      eml: {
        name: 'EML (RFC 5322)',
        extension: '.eml',
        mimeType: 'message/rfc822',
        description: 'Standard email format. One file per message. Contains full headers, body, and MIME-encoded attachments. The gold standard for forensic preservation because it preserves the raw message exactly as received.',
        forensicValue: 'HIGH',
        preserves: ['Full headers', 'MIME structure', 'Attachments', 'Digital signatures', 'Encoding'],
        limitations: ['One file per message (many files for large collections)', 'No folder structure in filename'],
        usedBy: ['Most email clients', 'Forensic tools', 'eDiscovery platforms'],
      },
      msg: {
        name: 'MSG (Outlook)',
        extension: '.msg',
        mimeType: 'application/vnd.ms-outlook',
        description: 'Microsoft Outlook message format. Binary format based on OLE/COM structured storage (CFB). Contains message properties, body in RTF/HTML/plain, and embedded attachments.',
        forensicValue: 'HIGH',
        preserves: ['Outlook-specific properties', 'Categories/flags', 'Named MAPI properties', 'Attachments', 'RTF body'],
        limitations: ['Microsoft-proprietary format', 'Requires MAPI property knowledge to parse', 'May not preserve all MIME headers'],
        usedBy: ['Microsoft Outlook', 'Exchange', 'Forensic tools'],
      },
      pst: {
        name: 'PST (Personal Storage Table)',
        extension: '.pst',
        mimeType: 'application/vnd.ms-outlook-pst',
        description: 'Microsoft Personal Storage Table. A single container file that stores messages in folder hierarchy. Uses B-tree structure internally. Can be opened directly in Outlook or forensic tools.',
        forensicValue: 'HIGH',
        preserves: ['Folder hierarchy', 'Message properties', 'Attachments', 'Calendar/contacts', 'Deleted items (sometimes)'],
        limitations: ['Proprietary Microsoft format', 'Size limits (50GB recommended)', 'Can become corrupt', 'Not all tools write PST correctly'],
        usedBy: ['Microsoft Outlook', 'Forensic tools', 'eDiscovery platforms'],
      },
      mbox: {
        name: 'MBOX (Unix Mailbox)',
        extension: '.mbox',
        mimeType: 'application/mbox',
        description: 'Unix mailbox format. Concatenates messages separated by "From " lines. Simple, widely supported, but has escaping issues (From-munging). Multiple variants exist (mboxrd, mboxcl, mboxcl2, mboxo).',
        forensicValue: 'MEDIUM',
        preserves: ['Message content', 'Headers', 'MIME structure'],
        limitations: ['From-line escaping modifies content', 'No standard for metadata', 'Single file can be very large', 'Variant differences'],
        usedBy: ['Thunderbird', 'Unix mail tools', 'Google Takeout'],
      },
      mime: {
        name: 'MIME (Raw)',
        extension: '.mime',
        mimeType: 'message/rfc822',
        description: 'Raw MIME content identical to EML but with .mime extension. Some tools differentiate between EML (may have added headers) and MIME (exact server response). Forensically equivalent to EML.',
        forensicValue: 'HIGH',
        preserves: ['Exact server response', 'Full MIME structure', 'All headers', 'Digital signatures'],
        limitations: ['Same as EML - one file per message'],
        usedBy: ['Forensic tools', 'Raw protocol captures'],
      },
      pdf: {
        name: 'PDF Report',
        extension: '.html',
        mimeType: 'text/html',
        description: 'Printable HTML report with full message metadata, headers, body text, and forensic hashes. Open in a browser and print/save as PDF for court-ready documentation.',
        forensicValue: 'MEDIUM',
        preserves: ['Message metadata', 'Body text', 'Hash values', 'Chain of custody reference'],
        limitations: ['HTML source — print to PDF for final output', 'Attachments listed but not embedded'],
        usedBy: ['Court submissions', 'Case documentation', 'Client reports'],
      },
      concordance: {
        name: 'Concordance DAT (Load File)',
        extension: '.dat',
        mimeType: 'text/plain',
        description: 'Concordance-compatible delimited load file for eDiscovery review platforms. Uses standard þ (thorn) delimiter and ð (eth) text qualifier. Includes OPT cross-reference file.',
        forensicValue: 'HIGH',
        preserves: ['All metadata fields', 'Hash values', 'Folder paths', 'Date/time stamps'],
        limitations: ['Body text truncated to 32KB per field', 'Attachments referenced but not inline'],
        usedBy: ['Relativity', 'Concordance', 'Ringtail', 'Summation', 'IPRO'],
      },
    };
  }

  static ensureExportDir(projectId, exportId) {
    const dir = path.join(DATA_DIR, 'exports', projectId, exportId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  static exportToFiles(projectId, exportId, format, messages, folders) {
    const outputDir = this.ensureExportDir(projectId, exportId);
    const files = [];

    switch (format) {
      case 'eml':
        for (const msg of messages) {
          const result = this.generateEml(msg);
          const filePath = path.join(outputDir, result.filename);
          fs.writeFileSync(filePath, result.content, 'utf8');
          files.push({ ...result, path: filePath, relativePath: result.filename });
        }
        break;

      case 'mime':
        for (const msg of messages) {
          const result = this.generateEml(msg);
          result.filename = result.filename.replace('.eml', '.mime');
          const filePath = path.join(outputDir, result.filename);
          fs.writeFileSync(filePath, result.content, 'utf8');
          files.push({ ...result, path: filePath, relativePath: result.filename });
        }
        break;

      case 'msg':
        for (const msg of messages) {
          const result = this.generateMsg(msg);
          const filePath = path.join(outputDir, result.filename);
          fs.writeFileSync(filePath, result.content, 'utf8');
          files.push({ ...result, path: filePath, relativePath: result.filename });
        }
        break;

      case 'mbox': {
        const result = this.generateMbox(messages);
        const filePath = path.join(outputDir, result.filename);
        fs.writeFileSync(filePath, result.content, 'utf8');
        files.push({ ...result, path: filePath, relativePath: result.filename });
        break;
      }

      case 'pst': {
        const maxSizeMB = 2048;
        const results = this.generatePstStructure(messages, folders, maxSizeMB);
        for (const result of (Array.isArray(results) ? results : [results])) {
          const filePath = path.join(outputDir, result.filename);
          fs.writeFileSync(filePath, result.content, 'utf8');
          files.push({ ...result, path: filePath, relativePath: result.filename });
        }
        break;
      }

      case 'pdf': {
        const result = this.generatePdfReport(messages, projectId);
        const filePath = path.join(outputDir, result.filename);
        fs.writeFileSync(filePath, result.content, 'utf8');
        files.push({ ...result, path: filePath, relativePath: result.filename });
        break;
      }

      case 'concordance': {
        const datResult = this.generateConcordanceDat(messages);
        const datPath = path.join(outputDir, datResult.filename);
        fs.writeFileSync(datPath, datResult.content, 'utf8');
        files.push({ ...datResult, path: datPath, relativePath: datResult.filename });

        const optResult = this.generateConcordanceOpt(messages, projectId);
        const optPath = path.join(outputDir, optResult.filename);
        fs.writeFileSync(optPath, optResult.content, 'utf8');
        files.push({ ...optResult, path: optPath, relativePath: optResult.filename });
        break;
      }
    }

    const manifest = this.generateHashManifest(files);
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return { files, manifest, outputDir };
  }

  static generateEml(message) {
    const from = message.from_address || message.fromAddress || '';
    const to = parseJsonField(message.to_addresses || message.toAddresses, []);
    const cc = parseJsonField(message.cc_addresses || message.ccAddresses, []);
    const subject = message.subject || '(no subject)';
    const date = message.date || new Date().toISOString();
    const msgId = message.message_id || message.messageId || `<${uuidv4()}@sherlock-mail.local>`;
    const sha256 = message.hash_sha256 || message.hashSha256 || '';
    const bodyText = message.body_text || message.bodyText || '';
    const bodyHtml = message.body_html || message.bodyHtml || '';
    const contentType = message.content_type || message.contentType || 'text/plain; charset=utf-8';
    const acquired = message.acquired_at || new Date().toISOString();

    const headers = [
      `From: ${from}`,
      `To: ${Array.isArray(to) ? to.join(', ') : to}`,
      cc.length ? `Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}` : null,
      `Subject: ${subject}`,
      `Date: ${new Date(date).toUTCString()}`,
      `Message-ID: ${msgId}`,
      message.in_reply_to || message.inReplyTo ? `In-Reply-To: ${message.in_reply_to || message.inReplyTo}` : null,
      `MIME-Version: 1.0`,
    ].filter(Boolean);

    let body;
    if (bodyHtml && bodyText) {
      const boundary = `----=_Part_${uuidv4().substring(0, 8)}`;
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      headers.push(`X-SherlockMail-Hash-SHA256: ${sha256}`);
      headers.push(`X-SherlockMail-Acquired: ${acquired}`);
      body = [
        `--${boundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        bodyText,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        bodyHtml,
        ``,
        `--${boundary}--`,
      ].join('\r\n');
    } else {
      headers.push(`Content-Type: ${contentType}`);
      headers.push(`X-SherlockMail-Hash-SHA256: ${sha256}`);
      headers.push(`X-SherlockMail-Acquired: ${acquired}`);
      body = bodyText || bodyHtml || '';
    }

    const eml = headers.join('\r\n') + '\r\n\r\n' + body + '\r\n';

    return {
      content: eml,
      filename: `${sanitizeFilename(subject)}_${sha256?.substring(0, 8) || 'unknown'}.eml`,
      hash: crypto.createHash('sha256').update(eml).digest('hex'),
      size: Buffer.byteLength(eml),
    };
  }

  static generateMsg(message) {
    const from = message.from_address || message.fromAddress || '';
    const to = parseJsonField(message.to_addresses || message.toAddresses, []);
    const subject = message.subject || '(no subject)';

    const properties = {
      '0037': { name: 'PidTagSubjectW', type: 'PT_UNICODE', value: subject },
      '0042': { name: 'PidTagSentRepresentingName', type: 'PT_UNICODE', value: from },
      '0E04': { name: 'PidTagDisplayTo', type: 'PT_UNICODE', value: Array.isArray(to) ? to.join('; ') : to },
      '0E06': { name: 'PidTagMessageDeliveryTime', type: 'PT_SYSTIME', value: message.date },
      '0E07': { name: 'PidTagMessageFlags', type: 'PT_LONG', value: 1 },
      '0E08': { name: 'PidTagMessageSize', type: 'PT_LONG', value: message.size || 0 },
      '1000': { name: 'PidTagBody', type: 'PT_UNICODE', value: message.body_text || message.bodyText || '' },
      '1009': { name: 'PidTagRtfCompressed', type: 'PT_BINARY', value: '[compressed RTF]' },
      '1035': { name: 'PidTagInternetMessageId', type: 'PT_UNICODE', value: message.message_id || message.messageId || '' },
    };

    const content = JSON.stringify({
      format: 'MSG (OLE/CFB Structured Storage)',
      version: '2.0',
      properties,
      attachmentCount: message.attachment_count || message.attachmentCount || 0,
      hashes: {
        md5: message.hash_md5 || message.hashMd5,
        sha256: message.hash_sha256 || message.hashSha256,
        sha512: message.hash_sha512 || message.hashSha512,
      },
    }, null, 2);

    const sha256 = message.hash_sha256 || message.hashSha256 || '';

    return {
      content,
      filename: `${sanitizeFilename(subject)}_${sha256?.substring(0, 8) || 'unknown'}.msg.json`,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content),
    };
  }

  static generateMbox(messages) {
    const lines = [];

    for (const msg of messages) {
      const from = (msg.from_address || msg.fromAddress || 'unknown@example.com').replace(/.*</, '').replace(/>.*/, '');
      const date = new Date(msg.date).toUTCString();

      lines.push(`From ${from} ${date}`);

      const to = parseJsonField(msg.to_addresses || msg.toAddresses, []);

      const headers = [
        `From: ${msg.from_address || msg.fromAddress || ''}`,
        `To: ${Array.isArray(to) ? to.join(', ') : (to || '')}`,
        `Subject: ${msg.subject || ''}`,
        `Date: ${msg.date || ''}`,
        `Message-ID: ${msg.message_id || msg.messageId || `<${uuidv4()}@sherlock-mail.local>`}`,
        `Content-Type: text/plain; charset=utf-8`,
      ];

      lines.push(headers.join('\r\n'));
      lines.push('');

      const body = (msg.body_text || msg.bodyText || '').replace(/^From /gm, '>From ');
      lines.push(body);
      lines.push('');
    }

    const content = lines.join('\n');
    return {
      content,
      filename: `collection_${new Date().toISOString().replace(/[:.]/g, '-')}.mbox`,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content),
      messageCount: messages.length,
    };
  }

  static generatePstStructure(messages, folders, maxSizeMB = 2048) {
    const folderMap = {};
    for (const msg of messages) {
      const folder = msg.folder || 'Inbox';
      if (!folderMap[folder]) folderMap[folder] = [];
      folderMap[folder].push({
        subject: msg.subject,
        from: msg.from_address || msg.fromAddress,
        date: msg.date,
        size: msg.size,
        hashSha256: msg.hash_sha256 || msg.hashSha256,
        messageId: msg.message_id || msg.messageId,
      });
    }

    const estimatedSize = messages.reduce((s, m) => s + (m.size || 1000), 0);
    const maxBytes = maxSizeMB * 1024 * 1024;
    const splitCount = Math.max(1, Math.ceil(estimatedSize / maxBytes));

    if (splitCount <= 1) {
      const structure = {
        format: 'PST (Personal Storage Table)',
        version: '23 (Unicode, Outlook 2003+)',
        encryption: 'compressible (NDB_CRYPT_PERMUTE)',
        splitInfo: { part: 1, total: 1, maxSizeMB },
        nodeDatabase: { header: { magic: '!BDN', version: 23, clientVersion: 19 } },
        messageTrees: folderMap,
        totalMessages: messages.length,
        totalFolders: Object.keys(folderMap).length,
      };
      const content = JSON.stringify(structure, null, 2);
      return {
        content,
        filename: `collection_${new Date().toISOString().replace(/[:.]/g, '-')}.pst.json`,
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        size: Buffer.byteLength(content),
        messageCount: messages.length,
      };
    }

    const parts = [];
    const msgsPerPart = Math.ceil(messages.length / splitCount);
    for (let p = 0; p < splitCount; p++) {
      const slice = messages.slice(p * msgsPerPart, (p + 1) * msgsPerPart);
      const partFolderMap = {};
      for (const msg of slice) {
        const folder = msg.folder || 'Inbox';
        if (!partFolderMap[folder]) partFolderMap[folder] = [];
        partFolderMap[folder].push({
          subject: msg.subject,
          from: msg.from_address || msg.fromAddress,
          date: msg.date,
          size: msg.size,
          hashSha256: msg.hash_sha256 || msg.hashSha256,
        });
      }

      const structure = {
        format: 'PST (Personal Storage Table)',
        version: '23 (Unicode, Outlook 2003+)',
        encryption: 'compressible (NDB_CRYPT_PERMUTE)',
        splitInfo: { part: p + 1, total: splitCount, maxSizeMB },
        nodeDatabase: { header: { magic: '!BDN', version: 23, clientVersion: 19 } },
        messageTrees: partFolderMap,
        totalMessages: slice.length,
        totalFolders: Object.keys(partFolderMap).length,
      };
      const content = JSON.stringify(structure, null, 2);
      parts.push({
        content,
        filename: `collection_part${p + 1}of${splitCount}_${new Date().toISOString().replace(/[:.]/g, '-')}.pst.json`,
        hash: crypto.createHash('sha256').update(content).digest('hex'),
        size: Buffer.byteLength(content),
        messageCount: slice.length,
      });
    }
    return parts;
  }

  static generatePdfReport(messages, projectId) {
    const now = new Date().toISOString();
    const rows = messages.map((msg, i) => {
      const from = msg.from_address || msg.fromAddress || '';
      const to = parseJsonField(msg.to_addresses || msg.toAddresses, []);
      const cc = parseJsonField(msg.cc_addresses || msg.ccAddresses, []);
      const subject = msg.subject || '(no subject)';
      const date = msg.date ? new Date(msg.date).toLocaleString() : 'Unknown';
      const body = (msg.body_text || msg.bodyText || '').substring(0, 8000);
      const sha256 = msg.hash_sha256 || msg.hashSha256 || 'N/A';

      return `<div class="msg" style="page-break-inside:avoid;border:1px solid #ccc;padding:16px;margin-bottom:16px;border-radius:4px">
        <h3 style="margin:0 0 8px">#${i + 1}: ${escHtml(subject)}</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <tr><td style="width:80px;font-weight:bold;padding:2px 8px">From:</td><td>${escHtml(from)}</td></tr>
          <tr><td style="font-weight:bold;padding:2px 8px">To:</td><td>${escHtml(Array.isArray(to) ? to.join(', ') : to)}</td></tr>
          ${cc.length ? `<tr><td style="font-weight:bold;padding:2px 8px">Cc:</td><td>${escHtml(Array.isArray(cc) ? cc.join(', ') : cc)}</td></tr>` : ''}
          <tr><td style="font-weight:bold;padding:2px 8px">Date:</td><td>${escHtml(date)}</td></tr>
          <tr><td style="font-weight:bold;padding:2px 8px">SHA-256:</td><td style="font-family:monospace;font-size:11px">${escHtml(sha256)}</td></tr>
          <tr><td style="font-weight:bold;padding:2px 8px">Folder:</td><td>${escHtml(msg.folder || '')}</td></tr>
        </table>
        ${body ? `<div style="margin-top:12px;padding:12px;background:#f5f5f5;border-radius:4px;font-size:13px;white-space:pre-wrap;max-height:400px;overflow:auto">${escHtml(body)}</div>` : ''}
      </div>`;
    }).join('\n');

    const content = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SherlockMail Forensic Export — ${escHtml(projectId)}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px;color:#222}
h1{border-bottom:2px solid #1a56db;padding-bottom:8px}
.meta{font-size:13px;color:#666;margin-bottom:24px}
@media print{.msg{page-break-inside:avoid}}</style></head>
<body>
<h1>SherlockMail Forensic Email Report</h1>
<div class="meta">
  <div>Project: ${escHtml(projectId)} | Generated: ${now} | Messages: ${messages.length}</div>
  <div>Tool: SherlockMail v0.9.0 | Hash Algorithm: SHA-256</div>
</div>
${rows}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #ccc;font-size:12px;color:#999">
  Generated by SherlockMail v0.9.0 — FEC-grade forensic email collection tool<br>
  This report is intended for print-to-PDF. Hash values above can be independently verified against the collection database.
</div>
</body></html>`;

    return {
      content,
      filename: `report_${new Date().toISOString().replace(/[:.]/g, '-')}.html`,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content),
      messageCount: messages.length,
    };
  }

  static generateConcordanceDat(messages) {
    const D = 'þ'; // þ (thorn) — Concordance field delimiter
    const Q = 'ð'; // ð (eth) — Concordance text qualifier

    const fields = [
      'DOCID', 'BATES_BEGIN', 'BATES_END', 'BATES_ATTACH_BEGIN', 'BATES_ATTACH_END',
      'CUSTODIAN', 'FROM', 'TO', 'CC', 'BCC', 'SUBJECT', 'DATESENT', 'TIMESENT',
      'DATERCVD', 'TIMERCVD', 'FOLDER', 'HASATTACHMENTS', 'ATTACHCOUNT',
      'MESSAGESIZE', 'MESSAGEID', 'CONVERSATIONINDEX', 'PARENTID',
      'HASHMD5', 'HASHSHA256', 'BODYTEXT',
    ];

    const header = fields.map(f => `${Q}${f}${Q}`).join(D);
    const batesPrefix = 'SM-';
    const padLen = 7;

    const rows = messages.map((msg, idx) => {
      const batesNum = String(idx + 1).padStart(padLen, '0');
      const batesBegin = `${batesPrefix}${batesNum}`;
      const batesEnd = batesBegin;
      const attCount = msg.attachment_count || msg.attachmentCount || 0;
      const batesAttEnd = attCount > 0 ? `${batesPrefix}${String(idx + 1 + attCount).padStart(padLen, '0')}` : '';

      const from = msg.from_address || msg.fromAddress || '';
      const to = parseJsonField(msg.to_addresses || msg.toAddresses, []).join('; ');
      const cc = parseJsonField(msg.cc_addresses || msg.ccAddresses, []).join('; ');
      const bcc = parseJsonField(msg.bcc_addresses || msg.bccAddresses, []).join('; ');
      const subject = msg.subject || '';
      const d = msg.date ? new Date(msg.date) : null;
      const dateSent = d ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : '';
      const timeSent = d ? d.toTimeString().substring(0, 8) : '';
      const dateRcvd = msg.acquired_at ? new Date(msg.acquired_at).toLocaleDateString('en-US') : '';
      const timeRcvd = msg.acquired_at ? new Date(msg.acquired_at).toTimeString().substring(0, 8) : '';
      const folder = msg.folder || '';
      const hasAtt = msg.has_attachments || msg.hasAttachments ? 'TRUE' : 'FALSE';
      const size = msg.size || 0;
      const msgId = msg.message_id || msg.messageId || '';
      const convIdx = msg.in_reply_to || '';
      const parentId = msg.in_reply_to || '';
      const md5 = msg.hash_md5 || msg.hashMd5 || '';
      const sha256 = msg.hash_sha256 || msg.hashSha256 || '';
      const body = (msg.body_text || msg.bodyText || '').substring(0, 32000).replace(/[\r\n]+/g, ' ');

      const vals = [msg.id, batesBegin, batesEnd, batesBegin, batesAttEnd || batesEnd,
        msg.custodian || '', from, to, cc, bcc, subject, dateSent, timeSent,
        dateRcvd, timeRcvd, folder, hasAtt, attCount, size, msgId, convIdx, parentId,
        md5, sha256, body];
      return vals.map(v => `${Q}${String(v ?? '').replace(/ð/g, '')}${Q}`).join(D);
    });

    const content = [header, ...rows].join('\r\n') + '\r\n';
    return {
      content,
      filename: `loadfile_${new Date().toISOString().replace(/[:.]/g, '-')}.dat`,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content),
      messageCount: messages.length,
    };
  }

  static generateConcordanceOpt(messages, projectId) {
    const lines = messages.map((msg, i) => {
      const docId = msg.id || `DOC_${i + 1}`;
      const volume = projectId.substring(0, 8);
      const imgPath = '';
      return `${docId},${volume},${imgPath},Y,,,${i + 1}`;
    });

    const content = lines.join('\r\n') + '\r\n';
    return {
      content,
      filename: `loadfile_${new Date().toISOString().replace(/[:.]/g, '-')}.opt`,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content),
    };
  }

  static generateHashManifest(exportedFiles) {
    const manifest = {
      generated: new Date().toISOString(),
      tool: 'SherlockMail v0.9.0',
      algorithm: 'SHA-256',
      fileCount: exportedFiles.length,
      totalBytes: exportedFiles.reduce((sum, f) => sum + f.size, 0),
      files: exportedFiles.map(f => ({
        filename: f.filename || f.relativePath,
        format: (f.filename || '').split('.').pop(),
        size: f.size,
        sha256: f.hash,
      })),
      manifestHash: null,
    };

    const preHash = JSON.stringify(manifest, null, 2);
    manifest.manifestHash = crypto.createHash('sha256').update(preHash).digest('hex');

    return manifest;
  }

  static verifyExport(exportDir) {
    const manifestPath = path.join(exportDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { valid: false, error: 'Manifest not found' };

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const results = [];

    for (const fileEntry of manifest.files) {
      const filePath = path.join(exportDir, fileEntry.filename);
      if (!fs.existsSync(filePath)) {
        results.push({ filename: fileEntry.filename, status: 'missing' });
        continue;
      }
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      results.push({
        filename: fileEntry.filename,
        expectedHash: fileEntry.sha256,
        computedHash: hash,
        status: hash === fileEntry.sha256 ? 'verified' : 'mismatch',
        size: content.length,
      });
    }

    return {
      valid: results.every(r => r.status === 'verified'),
      totalFiles: results.length,
      verified: results.filter(r => r.status === 'verified').length,
      failed: results.filter(r => r.status !== 'verified').length,
      details: results,
    };
  }

  static listExportFiles(projectId) {
    const exportsDir = path.join(DATA_DIR, 'exports', projectId);
    if (!fs.existsSync(exportsDir)) return [];

    const exports = [];
    for (const exportId of fs.readdirSync(exportsDir)) {
      const dir = path.join(exportsDir, exportId);
      if (!fs.statSync(dir).isDirectory()) continue;

      const files = fs.readdirSync(dir).map(f => ({
        filename: f,
        size: fs.statSync(path.join(dir, f)).size,
        path: path.join(dir, f),
      }));

      exports.push({ exportId, files, directory: dir });
    }
    return exports;
  }
}

function sanitizeFilename(name) {
  return (name || 'untitled')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 60);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseJsonField(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return [value]; }
  }
  return fallback;
}
