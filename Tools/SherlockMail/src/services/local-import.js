import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { simpleParser } from 'mailparser';
import { HashManager } from './hash-manager.js';

export class LocalImportService {

  static async importMbox(filePath, projectId, options = {}) {
    const content = fs.readFileSync(filePath, 'utf8');
    const messages = this._parseMbox(content);
    const results = [];

    for (let i = 0; i < messages.length; i++) {
      try {
        const parsed = await simpleParser(messages[i].raw);
        const hashes = HashManager.computeAll(messages[i].raw);
        results.push({
          id: uuidv4(),
          projectId,
          folder: options.targetFolder || 'Imported/MBOX',
          subject: parsed.subject || '(no subject)',
          fromAddress: parsed.from?.text || '',
          toAddresses: parsed.to?.value?.map(a => a.address) || [],
          ccAddresses: parsed.cc?.value?.map(a => a.address) || [],
          date: parsed.date?.toISOString() || null,
          messageId: parsed.messageId || null,
          inReplyTo: parsed.inReplyTo || null,
          size: Buffer.byteLength(messages[i].raw),
          hasAttachments: (parsed.attachments?.length || 0) > 0,
          attachmentCount: parsed.attachments?.length || 0,
          hashMd5: hashes.md5,
          hashSha1: hashes.sha1,
          hashSha256: hashes.sha256,
          hashSha384: hashes.sha384,
          hashSha512: hashes.sha512,
          bodyText: parsed.text || '',
          bodyHtml: parsed.html || '',
          headers: parsed.headers ? Object.fromEntries(parsed.headers) : {},
          isEncrypted: this._detectEncryption(parsed),
          isSigned: this._detectSignature(parsed),
          source: 'mbox_import',
          sourceFile: path.basename(filePath),
          attachments: (parsed.attachments || []).map(att => ({
            id: uuidv4(),
            filename: att.filename || 'unnamed',
            contentType: att.contentType,
            size: att.size,
            hashSha256: crypto.createHash('sha256').update(att.content).digest('hex'),
            hashMd5: crypto.createHash('md5').update(att.content).digest('hex'),
            content: att.content,
          })),
        });
      } catch (err) {
        results.push({ error: err.message, index: i, source: 'mbox_import' });
      }
    }

    return {
      source: filePath,
      format: 'mbox',
      totalParsed: messages.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      messages: results,
    };
  }

  static async importEmlDirectory(dirPath, projectId, options = {}) {
    const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.eml'));
    const results = [];

    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const raw = fs.readFileSync(filePath);
        const parsed = await simpleParser(raw);
        const hashes = HashManager.computeAll(raw);

        results.push({
          id: uuidv4(),
          projectId,
          folder: options.targetFolder || 'Imported/EML',
          subject: parsed.subject || '(no subject)',
          fromAddress: parsed.from?.text || '',
          toAddresses: parsed.to?.value?.map(a => a.address) || [],
          ccAddresses: parsed.cc?.value?.map(a => a.address) || [],
          date: parsed.date?.toISOString() || null,
          messageId: parsed.messageId || null,
          size: raw.length,
          hasAttachments: (parsed.attachments?.length || 0) > 0,
          attachmentCount: parsed.attachments?.length || 0,
          hashMd5: hashes.md5,
          hashSha1: hashes.sha1,
          hashSha256: hashes.sha256,
          hashSha384: hashes.sha384,
          hashSha512: hashes.sha512,
          bodyText: parsed.text || '',
          bodyHtml: parsed.html || '',
          emlPath: filePath,
          source: 'eml_import',
          sourceFile: file,
        });
      } catch (err) {
        results.push({ error: err.message, file, source: 'eml_import' });
      }
    }

    return {
      source: dirPath,
      format: 'eml',
      totalFiles: files.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      messages: results,
    };
  }

  static async importPst(filePath, projectId, options = {}) {
    const raw = fs.readFileSync(filePath);
    const magic = raw.readUInt32LE(0);
    if (magic !== 0x4E444221) {
      throw new Error('Not a valid PST file (magic number mismatch)');
    }

    const messages = [];
    let offset = 564;

    if (offset < raw.length && raw.readUInt32LE(offset) === 0x54424C46) {
      const tableLen = raw.readUInt32LE(offset + 4);
      offset += 8 + tableLen;
    }

    while (offset + 16 <= raw.length) {
      try {
        if (raw.readUInt32LE(offset) !== 0x4D47534D) break;
        const folderLen = raw.readUInt32LE(offset + 4);
        const emlLen = raw.readUInt32LE(offset + 8);
        offset += 16;
        const folder = raw.subarray(offset, offset + folderLen).toString('utf8');
        offset += folderLen;
        const emlData = raw.subarray(offset, offset + emlLen).toString('utf8');
        offset += emlLen;

        const parsed = await simpleParser(emlData);
        const hashes = HashManager.computeAll(emlData);
        messages.push({
          id: uuidv4(),
          projectId,
          folder: `Imported/PST/${folder}`,
          subject: parsed.subject || '(no subject)',
          fromAddress: parsed.from?.text || '',
          toAddresses: parsed.to?.value?.map(a => a.address) || [],
          date: parsed.date?.toISOString() || null,
          hashMd5: hashes.md5,
          hashSha1: hashes.sha1,
          hashSha256: hashes.sha256,
          hashSha384: hashes.sha384,
          hashSha512: hashes.sha512,
          bodyText: parsed.text || '',
          size: Buffer.byteLength(emlData),
          source: 'pst_import',
          sourceFile: path.basename(filePath),
        });
      } catch { break; }
    }

    return {
      source: filePath,
      format: 'pst',
      totalParsed: messages.length,
      successful: messages.length,
      failed: 0,
      messages,
    };
  }

  static _parseMbox(content) {
    const messages = [];
    const parts = content.split(/^From /gm);
    for (let i = 1; i < parts.length; i++) {
      const firstNewline = parts[i].indexOf('\n');
      const raw = parts[i].substring(firstNewline + 1).replace(/^>From /gm, 'From ');
      if (raw.trim()) messages.push({ raw });
    }
    return messages;
  }

  static _detectEncryption(parsed) {
    const ct = parsed.contentType?.value || '';
    return ct.includes('pkcs7-mime') || ct.includes('x-pkcs7-mime') || ct.includes('encrypted');
  }

  static _detectSignature(parsed) {
    const ct = parsed.contentType?.value || '';
    return ct.includes('pkcs7-signature') || ct.includes('x-pkcs7-signature') || ct.includes('signed');
  }

  static getSupportedFormats() {
    return {
      mbox: { extensions: ['.mbox', '.mbx'], description: 'Unix MBOX mailbox (Google Takeout, Thunderbird export)', method: 'importMbox' },
      eml: { extensions: ['.eml'], description: 'RFC 5322 email messages (individual files or directory)', method: 'importEmlDirectory' },
      pst: { extensions: ['.pst'], description: 'Microsoft PST containers (SherlockMail format)', method: 'importPst' },
    };
  }
}
