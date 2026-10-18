import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class ReportService {

  // ── History Report Export (Feature 18) ──

  static generateHistoryReport(project, auditLog, acquisitions, exports, options = {}) {
    const now = new Date().toISOString();
    const sep = '='.repeat(72);
    const thin = '-'.repeat(72);

    let report = `${sep}\n`;
    report += `SHERLOCKMAIL FORENSIC HISTORY REPORT\n`;
    report += `${sep}\n\n`;
    report += `Project:       ${project.name}\n`;
    report += `Case ID:       ${project.case_id || project.caseId || 'N/A'}\n`;
    report += `Case Name:     ${project.case_name || project.caseName || 'N/A'}\n`;
    report += `Examiner:      ${project.examiner_name || project.examinerName || 'N/A'}\n`;
    report += `Target:        ${project.target_email || project.targetEmail}\n`;
    report += `Provider:      ${project.provider_type || project.providerType}\n`;
    report += `Created:       ${project.created_at || project.createdAt}\n`;
    report += `Report Date:   ${now}\n`;
    report += `Tool:          SherlockMail v0.9.0\n\n`;

    // Acquisition History
    report += `${sep}\nACQUISITION HISTORY\n${thin}\n\n`;
    if (acquisitions.length === 0) {
      report += `No acquisitions recorded.\n\n`;
    } else {
      for (let i = 0; i < acquisitions.length; i++) {
        const acq = acquisitions[i];
        report += `[Acquisition ${i + 1}] ${acq.id}\n`;
        report += `  Status:     ${acq.status}\n`;
        report += `  Started:    ${acq.started_at || 'N/A'}\n`;
        report += `  Completed:  ${acq.completed_at || 'N/A'}\n`;
        report += `  Messages:   ${acq.acquired_messages || 0} / ${acq.total_messages || 0}\n`;
        report += `  Failed:     ${acq.failed_messages || 0}\n`;
        report += `  Skipped:    ${acq.skipped_messages || 0}\n`;
        report += `  Bytes:      ${acq.total_bytes || 0}\n\n`;
      }
    }

    // Export History
    report += `${sep}\nEXPORT HISTORY\n${thin}\n\n`;
    if (exports.length === 0) {
      report += `No exports recorded.\n\n`;
    } else {
      for (let i = 0; i < exports.length; i++) {
        const exp = exports[i];
        report += `[Export ${i + 1}] ${exp.id}\n`;
        report += `  Format:     ${exp.format}\n`;
        report += `  Status:     ${exp.status}\n`;
        report += `  Messages:   ${exp.message_count || 0}\n`;
        report += `  Bytes:      ${exp.total_bytes || 0}\n`;
        report += `  Output:     ${exp.output_dir || 'N/A'}\n`;
        report += `  SHA-256:    ${exp.hash_sha256 || 'N/A'}\n\n`;
      }
    }

    // Full Audit Trail
    report += `${sep}\nAUDIT TRAIL (${auditLog.length} entries)\n${thin}\n\n`;
    for (const entry of auditLog) {
      report += `[${entry.timestamp}] ${entry.event_type}\n`;
      report += `  ${entry.description}\n`;
      report += `  Hash: ${entry.hash}\n`;
      if (entry.examiner) report += `  Examiner: ${entry.examiner}\n`;
      report += `\n`;
    }

    report += `${sep}\n`;
    report += `END OF HISTORY REPORT\n`;
    const reportHash = crypto.createHash('sha256').update(report).digest('hex');
    report += `Report SHA-256: ${reportHash}\n`;
    report += `${sep}\n`;

    return {
      content: report,
      filename: `history_report_${project.id.substring(0, 8)}_${now.replace(/[:.]/g, '-')}.txt`,
      hash: reportHash,
      size: Buffer.byteLength(report),
      auditEntries: auditLog.length,
      acquisitions: acquisitions.length,
      exports: exports.length,
    };
  }

  // ── Revision Report Export (Feature 19) ──

  static generateRevisionReport(project, driveItems, revisions, options = {}) {
    const now = new Date().toISOString();
    const sep = '='.repeat(72);
    const thin = '-'.repeat(72);

    let report = `${sep}\n`;
    report += `SHERLOCKMAIL CLOUD FILE REVISION REPORT\n`;
    report += `${sep}\n\n`;
    report += `Project:       ${project.name}\n`;
    report += `Target:        ${project.target_email || project.targetEmail}\n`;
    report += `Report Date:   ${now}\n`;
    report += `Tool:          SherlockMail v0.9.0\n\n`;

    report += `Total Files Tracked: ${driveItems.length}\n`;
    report += `Total Revisions:     ${revisions.length}\n\n`;

    const itemMap = new Map();
    for (const item of driveItems) itemMap.set(item.id, item);

    const revsByItem = new Map();
    for (const rev of revisions) {
      const itemId = rev.drive_item_id || rev.driveItemId;
      if (!revsByItem.has(itemId)) revsByItem.set(itemId, []);
      revsByItem.get(itemId).push(rev);
    }

    report += `${sep}\nFILE REVISIONS\n${thin}\n\n`;
    for (const [itemId, itemRevs] of revsByItem) {
      const item = itemMap.get(itemId);
      report += `File: ${item?.name || itemId}\n`;
      report += `  Provider:  ${item?.provider || 'unknown'}\n`;
      report += `  Path:      ${item?.path || 'N/A'}\n`;
      report += `  Revisions: ${itemRevs.length}\n\n`;

      for (let i = 0; i < itemRevs.length; i++) {
        const rev = itemRevs[i];
        report += `  [Rev ${i + 1}] ${rev.revision_id || rev.revisionId || 'N/A'}\n`;
        report += `    Modified:  ${rev.modified_time || rev.modifiedTime || 'N/A'}\n`;
        report += `    Modifier:  ${rev.modifier || 'N/A'}\n`;
        report += `    Size:      ${rev.size || 0} bytes\n`;
        report += `    SHA-256:   ${rev.hash_sha256 || rev.hashSha256 || 'N/A'}\n\n`;
      }
    }

    report += `${sep}\n`;
    const reportHash = crypto.createHash('sha256').update(report).digest('hex');
    report += `Report SHA-256: ${reportHash}\n`;
    report += `${sep}\n`;

    return {
      content: report,
      filename: `revision_report_${project.id.substring(0, 8)}_${now.replace(/[:.]/g, '-')}.txt`,
      hash: reportHash,
      size: Buffer.byteLength(report),
      fileCount: driveItems.length,
      revisionCount: revisions.length,
    };
  }

  // ── Log Compression (Feature 20) ──

  static async compressLogs(projectId, logsDir, outputPath) {
    const files = [];
    if (fs.existsSync(logsDir)) {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.log') || entry.name.endsWith('.txt') || entry.name.endsWith('.json')) {
            files.push(full);
          }
        }
      };
      walk(logsDir);
    }

    if (files.length === 0) return { compressed: false, reason: 'No log files found' };

    // Build a simple ZIP-like archive (stored, no compression for forensic integrity)
    const parts = [];
    const entries = [];
    let offset = 0;

    for (const filePath of files) {
      const relPath = path.relative(logsDir, filePath);
      const content = fs.readFileSync(filePath);
      const crc = this._crc32(content);

      // Local file header
      const nameBytes = Buffer.from(relPath, 'utf8');
      const header = Buffer.alloc(30 + nameBytes.length);
      header.writeUInt32LE(0x04034B50, 0); // PK\x03\x04
      header.writeUInt16LE(20, 4); // version needed
      header.writeUInt16LE(0, 6); // flags
      header.writeUInt16LE(0, 8); // stored (no compression)
      header.writeUInt16LE(0, 10); // mod time
      header.writeUInt16LE(0, 12); // mod date
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(content.length, 18); // compressed size
      header.writeUInt32LE(content.length, 22); // uncompressed size
      header.writeUInt16LE(nameBytes.length, 26);
      nameBytes.copy(header, 30);

      entries.push({ offset, name: nameBytes, crc, size: content.length });
      parts.push(header, content);
      offset += header.length + content.length;
    }

    // Central directory
    const cdStart = offset;
    for (const entry of entries) {
      const cd = Buffer.alloc(46 + entry.name.length);
      cd.writeUInt32LE(0x02014B50, 0); // PK\x01\x02
      cd.writeUInt16LE(20, 4); // version made by
      cd.writeUInt16LE(20, 6); // version needed
      cd.writeUInt16LE(0, 8); // flags
      cd.writeUInt16LE(0, 10); // stored
      cd.writeUInt32LE(entry.crc, 16);
      cd.writeUInt32LE(entry.size, 20);
      cd.writeUInt32LE(entry.size, 24);
      cd.writeUInt16LE(entry.name.length, 28);
      cd.writeUInt32LE(entry.offset, 42);
      entry.name.copy(cd, 46);
      parts.push(cd);
      offset += cd.length;
    }

    // End of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054B50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(offset - cdStart, 12);
    eocd.writeUInt32LE(cdStart, 16);
    parts.push(eocd);

    const archive = Buffer.concat(parts);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, archive);

    return {
      compressed: true,
      outputPath,
      size: archive.length,
      fileCount: files.length,
      hash: crypto.createHash('sha256').update(archive).digest('hex'),
      format: 'ZIP (stored, no compression)',
    };
  }

  static _crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
}
