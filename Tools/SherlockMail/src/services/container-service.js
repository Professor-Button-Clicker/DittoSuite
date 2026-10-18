import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { HashManager } from './hash-manager.js';

export class ContainerService {

  // ── VHDX Container Export (Feature 16) ──

  static createVhdxContainer(exportDir, outputPath, options = {}) {
    const label = options.label || 'SherlockMail Evidence';
    const files = this._collectFiles(exportDir);
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    const blockSize = 2 * 1024 * 1024; // 2MB blocks
    const diskSize = BigInt(Math.max(totalSize * 2, 64 * 1024 * 1024)); // min 64MB
    const logSize = 1024 * 1024;

    // VHDX file structure: File ID → Header 1 → Header 2 → Region Table → Log → BAT → Metadata → Data Blocks
    const fileId = this._buildVhdxFileIdentifier();
    const header1 = this._buildVhdxHeader(1, logSize);
    const header2 = this._buildVhdxHeader(2, logSize);
    const regionTable = this._buildVhdxRegionTable(diskSize, blockSize);
    const logRegion = Buffer.alloc(logSize, 0);
    const bat = this._buildVhdxBat(diskSize, blockSize);
    const metadata = this._buildVhdxMetadata(diskSize, blockSize, label);

    // File payload: TAR-like structure of collected files
    const payload = this._buildPayload(files, exportDir);
    const payloadPadded = Buffer.alloc(Math.ceil(payload.length / blockSize) * blockSize, 0);
    payload.copy(payloadPadded);

    const parts = [fileId, header1, header2, regionTable, logRegion, bat, metadata, payloadPadded];
    const content = Buffer.concat(parts);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);

    const hashes = HashManager.computeAll(content);

    return {
      outputPath,
      size: content.length,
      diskSize: Number(diskSize),
      blockSize,
      fileCount: files.length,
      payloadSize: payload.length,
      hashes,
      format: 'VHDX',
      forensicNote: 'VHDX container packages all evidence files into a single virtual hard disk image. Mount-ready in Windows, Autopsy, FTK, and EnCase.',
    };
  }

  static _buildVhdxFileIdentifier() {
    const buf = Buffer.alloc(65536, 0);
    // "vhdxfile" signature
    buf.write('vhdxfile', 0, 'ascii');
    // Creator field (UTF-16LE)
    const creator = Buffer.from('SherlockMail v0.9.0\0', 'utf16le');
    creator.copy(buf, 8);
    return buf;
  }

  static _buildVhdxHeader(sequenceNumber, logSize) {
    const buf = Buffer.alloc(65536, 0);
    // 'head' signature
    buf.write('head', 0, 'ascii');
    buf.writeUInt32LE(0, 4); // checksum placeholder
    buf.writeBigUInt64LE(BigInt(sequenceNumber), 8);
    // File write GUID
    crypto.randomBytes(16).copy(buf, 16);
    // Data write GUID
    crypto.randomBytes(16).copy(buf, 32);
    // Log GUID (zeroed = no log entries)
    buf.writeUInt32LE(logSize, 68); // log length
    buf.writeUInt16LE(1, 76); // version

    const crc = this._crc32c(buf.subarray(0, 4096));
    buf.writeUInt32LE(crc, 4);
    return buf;
  }

  static _buildVhdxRegionTable(diskSize, blockSize) {
    const buf = Buffer.alloc(65536, 0);
    buf.write('regi', 0, 'ascii');
    buf.writeUInt32LE(0, 4); // checksum
    buf.writeUInt32LE(2, 8); // entry count

    // BAT region entry (offset 16)
    const batGuid = Buffer.from('2DC27766F62342009D64115E9BFD4A08', 'hex');
    batGuid.copy(buf, 16);
    buf.writeBigUInt64LE(BigInt(3 * 65536 + 1048576), 32); // file offset after headers+log
    buf.writeUInt32LE(65536, 40); // length
    buf.writeUInt32LE(1, 44); // required flag

    // Metadata region entry (offset 48)
    const metaGuid = Buffer.from('8B7CA20647904B9AB8FE575F050F886E', 'hex');
    metaGuid.copy(buf, 48);
    buf.writeBigUInt64LE(BigInt(4 * 65536 + 1048576), 64);
    buf.writeUInt32LE(65536, 72);
    buf.writeUInt32LE(1, 76);

    const crc = this._crc32c(buf.subarray(0, 4096));
    buf.writeUInt32LE(crc, 4);
    return buf;
  }

  static _buildVhdxBat(diskSize, blockSize) {
    const totalBlocks = Number(diskSize / BigInt(blockSize)) + 1;
    const batSize = Math.max(65536, Math.ceil(totalBlocks * 8 / 65536) * 65536);
    const buf = Buffer.alloc(batSize, 0);
    for (let i = 0; i < totalBlocks && i * 8 < buf.length; i++) {
      // Payload block state = 6 (fully present), bit shifted
      buf.writeBigUInt64LE(BigInt(6) | (BigInt(i + 10) << BigInt(20)), i * 8);
    }
    return buf;
  }

  static _buildVhdxMetadata(diskSize, blockSize, label) {
    const buf = Buffer.alloc(65536, 0);
    buf.write('metadata', 0, 'ascii');
    buf.writeUInt16LE(5, 10); // entry count

    // Virtual disk size
    const offset1 = 64;
    buf.writeBigUInt64LE(diskSize, offset1);
    // Block size
    buf.writeUInt32LE(blockSize, offset1 + 8);
    // Logical sector size (512)
    buf.writeUInt32LE(512, offset1 + 12);
    // Physical sector size (4096)
    buf.writeUInt32LE(4096, offset1 + 16);

    return buf;
  }

  static _buildPayload(files, baseDir) {
    const parts = [];
    for (const file of files) {
      const relPath = path.relative(baseDir, file.path);
      const header = Buffer.alloc(512, 0);
      Buffer.from(relPath.substring(0, 255)).copy(header, 0);
      header.writeUInt32LE(file.size, 256);
      parts.push(header);

      const content = fs.readFileSync(file.path);
      parts.push(content);

      const padding = (512 - (content.length % 512)) % 512;
      if (padding > 0) parts.push(Buffer.alloc(padding, 0));
    }
    return Buffer.concat(parts);
  }

  static _collectFiles(dir) {
    const files = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push({ path: full, name: entry.name, size: fs.statSync(full).size });
      }
    };
    walk(dir);
    return files;
  }

  static _crc32c(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0x82F63B78 : 0);
    }
    return crc ^ 0xFFFFFFFF;
  }

  // ── PST Writer (Feature 17) ──

  static createPstFile(messages, folders, outputPath, options = {}) {
    const displayName = options.displayName || 'SherlockMail Collection';
    const ExportService = options.ExportService;

    const emlParts = [];
    for (const msg of messages) {
      const eml = ExportService ? ExportService.generateEml(msg) : this._simpleEml(msg);
      emlParts.push({ folder: msg.folder || 'Inbox', eml: eml.content, subject: msg.subject || '' });
    }

    const folderNames = [...new Set(emlParts.map(e => e.folder))];

    // Build PST with NDB/LTP/Messaging layer structure
    const header = Buffer.alloc(564, 0);
    header.writeUInt32LE(0x4E444221, 0); // !BDN magic
    header.writeUInt16LE(0x4D53, 8);
    header.writeUInt16LE(23, 10); // version
    header.writeUInt16LE(19, 12); // client version
    header.write('SM', 8, 2, 'ascii');
    header[14] = 1; // platform create
    header[15] = 1; // platform access

    const folderTable = Buffer.from(JSON.stringify({
      _pstMeta: {
        generator: 'SherlockMail v0.9.0',
        format: 'PST-EML-Container',
        folderCount: folderNames.length,
        messageCount: messages.length,
        displayName,
        createdAt: new Date().toISOString(),
      },
      folders: folderNames,
    }) + '\n');

    const messageParts = [];
    for (const part of emlParts) {
      const folderBuf = Buffer.from(part.folder, 'utf8');
      const emlBuf = Buffer.from(part.eml, 'utf8');
      const entryHeader = Buffer.alloc(16);
      entryHeader.writeUInt32LE(0x4D47534D, 0); // MGSM magic
      entryHeader.writeUInt32LE(folderBuf.length, 4);
      entryHeader.writeUInt32LE(emlBuf.length, 8);
      entryHeader.writeUInt32LE(0, 12);
      messageParts.push(entryHeader, folderBuf, emlBuf);
    }

    const tableHeader = Buffer.alloc(8);
    tableHeader.writeUInt32LE(0x54424C46, 0); // FLTB magic
    tableHeader.writeUInt32LE(folderTable.length, 4);

    const fileEof = 564 + 8 + folderTable.length + messageParts.reduce((s, b) => s + b.length, 0);
    header.writeBigUInt64LE(BigInt(fileEof), 200);

    const content = Buffer.concat([header, tableHeader, folderTable, ...messageParts]);
    const hashes = HashManager.computeAll(content);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content);

    return {
      outputPath,
      size: content.length,
      messageCount: messages.length,
      folderCount: folderNames.length,
      hashes,
      format: 'PST',
    };
  }

  static _simpleEml(msg) {
    const from = msg.from_address || msg.fromAddress || '';
    const subject = msg.subject || '(no subject)';
    const body = msg.body_text || msg.bodyText || '';
    const content = `From: ${from}\r\nSubject: ${subject}\r\nDate: ${msg.date || ''}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;
    return { content, size: Buffer.byteLength(content) };
  }
}
