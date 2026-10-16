import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() {
  if (!db) {
    const dbPath = join(__dirname, '..', '..', 'data', 'fmc.sqlite');
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrate();
}

function migrate() {
  const cols = (table) => {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(rows.map(r => r.name));
  };
  const addCol = (table, col, type) => {
    if (!cols(table).has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  };
  addCol('acquisitions', 'folders_json', 'TEXT');
}

function rowToObj(row, columns) {
  if (!row) return null;
  if (!Array.isArray(row)) return row;
  const obj = {};
  for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
  return obj;
}

function computeAuditHash(entry, prevHash) {
  const data = `${prevHash || ''}|${entry.timestamp}|${entry.event_type}|${entry.description}|${JSON.stringify(entry.details)}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function addAuditEntry(projectId, eventType, description, details, examiner, acquisitionId) {
  const d = getDb();
  const prev = d.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  const prevHash = prev?.hash || null;
  const timestamp = new Date().toISOString();
  const entry = { timestamp, event_type: eventType, description, details: JSON.stringify(details || {}) };
  const hash = computeAuditHash(entry, prevHash);

  d.prepare(`INSERT INTO audit_log (project_id, acquisition_id, timestamp, event_type, description, details, hash, examiner, prev_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    projectId, acquisitionId || null, timestamp, eventType, description, entry.details, hash, examiner || null, prevHash
  );
  return hash;
}

export function createProject({ name, targetEmail, providerType, caseName, caseId, examinerName, agency, evidenceId, custodianName, legalAuthority, legalScope, config }) {
  const d = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const projectConfig = { ...(config || {}), custodianName: custodianName || null, evidenceId: evidenceId || null };
  d.prepare(`INSERT INTO projects (id, name, target_email, provider_type, case_name, case_id, examiner_name, agency, legal_authority, legal_scope, status, created_at, updated_at, config)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)`).run(
    id, name, targetEmail, providerType, caseName || null, caseId || null,
    examinerName || null, evidenceId || agency || null, legalAuthority || null, legalScope || null, now, now, JSON.stringify(projectConfig)
  );
  addAuditEntry(id, 'PROJECT_CREATED', `Project created for ${targetEmail}`, {
    targetEmail, providerType, caseId, evidenceId, custodianName
  }, examinerName);
  return { id, name, targetEmail, providerType, status: 'created', createdAt: now };
}

export function getProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
}

export function getProject(id) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function updateProjectStatus(id, status) {
  const now = new Date().toISOString();
  getDb().prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
}

export function deleteProject(id) {
  const d = getDb();
  d.prepare('DELETE FROM drive_links WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE project_id = ?)').run(id);
  d.prepare('DELETE FROM messages WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM folders WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM acquisitions WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM search_queries WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM export_records WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM qc_results WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM differential_ids WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM audit_log WHERE project_id = ?').run(id);
  d.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function saveFolders(projectId, folders) {
  const d = getDb();
  const stmt = d.prepare(`INSERT OR REPLACE INTO folders (id, project_id, path, name, delimiter, flags, total_messages, unseen_messages, parent_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const f of folders) {
    stmt.run(f.id || uuidv4(), projectId, f.path, f.name, f.delimiter || '/', JSON.stringify(f.flags || []),
      f.totalMessages || 0, f.unseenMessages || 0, f.parentPath || null);
  }
}

export function getFolders(projectId) {
  return getDb().prepare('SELECT * FROM folders WHERE project_id = ? ORDER BY path').all(projectId);
}

export function createAcquisition(projectId, foldersJson) {
  const d = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO acquisitions (id, project_id, status, started_at, folders_json) VALUES (?, ?, 'running', ?, ?)`).run(
    id, projectId, now, JSON.stringify(foldersJson || [])
  );
  addAuditEntry(projectId, 'ACQUISITION_STARTED', 'Email acquisition started', { acquisitionId: id, folders: foldersJson });
  return id;
}

export function saveMessage(msg) {
  const d = getDb();
  const id = msg.id || uuidv4();
  d.prepare(`INSERT OR REPLACE INTO messages (id, acquisition_id, project_id, uid, service_id, folder, subject, from_address, to_addresses, cc_addresses, bcc_addresses, date, message_id, in_reply_to, size, flags, has_attachments, attachment_count, content_type, hash_md5, hash_sha256, hash_sha512, eml_path, acquired_at, headers_json, is_encrypted, is_signed, body_text, body_html)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, msg.acquisitionId, msg.projectId, msg.uid || null, msg.serviceId || null,
    msg.folder, msg.subject, msg.fromAddress, JSON.stringify(msg.toAddresses || []),
    JSON.stringify(msg.ccAddresses || []), JSON.stringify(msg.bccAddresses || []),
    msg.date, msg.messageId || null, msg.inReplyTo || null, msg.size || 0,
    JSON.stringify(msg.flags || []), msg.hasAttachments ? 1 : 0, msg.attachmentCount || 0,
    msg.contentType || 'text/plain', msg.hashMd5 || null, msg.hashSha256 || null,
    msg.hashSha512 || null, msg.emlPath || null, new Date().toISOString(),
    JSON.stringify(msg.headers || {}), msg.isEncrypted ? 1 : 0, msg.isSigned ? 1 : 0,
    msg.bodyText || null, msg.bodyHtml || null
  );
  return id;
}

export function getMessages(projectId, { folder, limit, offset, search } = {}) {
  const d = getDb();
  let sql = 'SELECT * FROM messages WHERE project_id = ?';
  const params = [projectId];
  if (folder) { sql += ' AND folder = ?'; params.push(folder); }
  if (search) {
    sql += ' AND (subject LIKE ? OR from_address LIKE ? OR body_text LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ' ORDER BY date DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }
  if (offset) { sql += ' OFFSET ?'; params.push(offset); }
  return d.prepare(sql).all(...params);
}

export function getMessageCount(projectId) {
  return getDb().prepare('SELECT COUNT(*) as count FROM messages WHERE project_id = ?').get(projectId)?.count || 0;
}

export function saveSearchQuery(projectId, queryType, queryText, criteriaJson) {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO search_queries (id, project_id, query_type, query_text, criteria_json, executed_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, projectId, queryType, queryText, JSON.stringify(criteriaJson || {}), new Date().toISOString());
  return id;
}

export function getSearchQueries(projectId) {
  return getDb().prepare('SELECT * FROM search_queries WHERE project_id = ? ORDER BY executed_at DESC').all(projectId);
}

export function saveExportRecord(projectId, format, outputDir, messageCount, totalBytes, hashSha256) {
  const d = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO export_records (id, project_id, format, output_dir, started_at, completed_at, message_count, total_bytes, status, hash_sha256)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`).run(
    id, projectId, format, outputDir, now, now, messageCount, totalBytes, hashSha256
  );
  addAuditEntry(projectId, 'EXPORT_COMPLETED', `Exported ${messageCount} messages to ${format.toUpperCase()}`, {
    format, outputDir, messageCount, totalBytes, hashSha256
  });
  return id;
}

export function getExportRecords(projectId) {
  return getDb().prepare('SELECT * FROM export_records WHERE project_id = ? ORDER BY started_at DESC').all(projectId);
}

export function getAuditLog(projectId) {
  return getDb().prepare('SELECT * FROM audit_log WHERE project_id = ? ORDER BY id ASC').all(projectId);
}

export function getFullAuditLog() {
  return getDb().prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
}

export function getMessage(id) {
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

export function getAllProjectMessages(projectId) {
  return getDb().prepare('SELECT * FROM messages WHERE project_id = ? ORDER BY date DESC').all(projectId);
}

export function updateAcquisition(id, data) {
  const d = getDb();
  const sets = [];
  const vals = [];
  if (data.status) { sets.push('status = ?'); vals.push(data.status); }
  if (data.totalMessages != null) { sets.push('total_messages = ?'); vals.push(data.totalMessages); }
  if (data.acquiredMessages != null) { sets.push('acquired_messages = ?'); vals.push(data.acquiredMessages); }
  if (data.failedMessages != null) { sets.push('failed_messages = ?'); vals.push(data.failedMessages); }
  if (data.totalBytes != null) { sets.push('total_bytes = ?'); vals.push(data.totalBytes); }
  if (data.protocolLog) { sets.push('protocol_log = ?'); vals.push(JSON.stringify(data.protocolLog)); }
  if (data.status === 'completed' || data.status === 'failed') {
    sets.push('completed_at = ?'); vals.push(new Date().toISOString());
  }
  if (sets.length) {
    vals.push(id);
    d.prepare(`UPDATE acquisitions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
}

export function getAcquisitions(projectId) {
  return getDb().prepare('SELECT * FROM acquisitions WHERE project_id = ? ORDER BY started_at DESC').all(projectId);
}

export function saveAttachment(att) {
  const d = getDb();
  d.prepare(`INSERT OR REPLACE INTO attachments (id, message_id, filename, content_type, size, hash_md5, hash_sha256, disposition, content_id, is_inline, local_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    att.id, att.messageId, att.filename, att.contentType, att.size,
    att.hashMd5, att.hashSha256, att.disposition, att.contentId,
    att.isInline ? 1 : 0, att.localPath || null
  );
}

export function getAttachments(messageId) {
  return getDb().prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);
}

export function saveDriveLink(link) {
  const d = getDb();
  d.prepare(`INSERT OR REPLACE INTO drive_links (id, project_id, message_id, provider, url, file_id, status, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    link.id, link.projectId, link.messageId, link.provider, link.url, link.fileId || null, link.status || 'detected', new Date().toISOString()
  );
}

export function getDriveLinks(projectId) {
  return getDb().prepare('SELECT * FROM drive_links WHERE project_id = ? ORDER BY detected_at DESC').all(projectId);
}

export function saveTimestampRecord(projectId, type, targetHash, timestampData) {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO timestamp_records (id, project_id, type, target_hash, timestamp_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, projectId, type, targetHash, JSON.stringify(timestampData), new Date().toISOString());
  return id;
}

export function getTimestampRecords(projectId) {
  return getDb().prepare('SELECT * FROM timestamp_records WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
}

export function saveInlineSearch(projectId, query, resultCount, elapsedMs) {
  const d = getDb();
  const id = uuidv4();
  d.prepare(`INSERT INTO inline_searches (id, project_id, query, result_count, elapsed_ms, executed_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, projectId, query, resultCount, elapsedMs, new Date().toISOString());
  return id;
}

export function getInlineSearches(projectId) {
  return getDb().prepare('SELECT * FROM inline_searches WHERE project_id = ? ORDER BY executed_at DESC').all(projectId);
}

export function saveQcResult(projectId, results) {
  const d = getDb();
  const now = new Date().toISOString();
  d.prepare(`INSERT INTO qc_results (project_id, started_at, completed_at, status, results_json) VALUES (?, ?, ?, ?, ?)`).run(
    projectId, now, now, results.overallStatus, JSON.stringify(results)
  );
}

export function getQcResults(projectId) {
  return getDb().prepare('SELECT * FROM qc_results WHERE project_id = ? ORDER BY completed_at DESC').all(projectId);
}

export function getDifferentialIds(projectId) {
  return getDb().prepare('SELECT * FROM differential_ids WHERE project_id = ?').all(projectId);
}

export function saveDifferentialId(projectId, serviceId, folder, sourceProjectId) {
  const d = getDb();
  d.prepare(`INSERT OR REPLACE INTO differential_ids (project_id, service_id, folder, source_project_id) VALUES (?, ?, ?, ?)`).run(
    projectId, serviceId, folder, sourceProjectId || null
  );
}

export function updateExportRecord(id, data) {
  const d = getDb();
  const sets = [];
  const vals = [];
  if (data.status) { sets.push('status = ?'); vals.push(data.status); }
  if (data.outputDir) { sets.push('output_dir = ?'); vals.push(data.outputDir); }
  if (data.totalBytes != null) { sets.push('total_bytes = ?'); vals.push(data.totalBytes); }
  if (data.detailsJson) { sets.push('details_json = ?'); vals.push(JSON.stringify(data.detailsJson)); }
  if (data.status === 'completed') { sets.push('completed_at = ?'); vals.push(new Date().toISOString()); }
  if (sets.length) {
    vals.push(id);
    d.prepare(`UPDATE export_records SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
}

export function getStats() {
  const d = getDb();
  const totalBytes = d.prepare('SELECT COALESCE(SUM(size), 0) as total FROM messages').get().total;
  return {
    projects: d.prepare('SELECT COUNT(*) as count FROM projects').get().count,
    messages: d.prepare('SELECT COUNT(*) as count FROM messages').get().count,
    acquisitions: d.prepare('SELECT COUNT(*) as count FROM acquisitions').get().count,
    exports: d.prepare('SELECT COUNT(*) as count FROM export_records').get().count,
    auditEntries: d.prepare('SELECT COUNT(*) as count FROM audit_log').get().count,
    totalBytes,
  };
}
