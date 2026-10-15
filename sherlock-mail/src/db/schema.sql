-- SherlockMail Forensic Email Collector - Database Schema
-- Mirrors and extends the capabilities found in Metaspike FEC

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_email TEXT NOT NULL,
  provider_type TEXT NOT NULL, -- imap, pop3, ews, graph, gmail_api
  case_name TEXT,
  case_id TEXT,
  examiner_name TEXT,
  agency TEXT,
  legal_authority TEXT,
  legal_scope TEXT,
  status TEXT DEFAULT 'created', -- created, collecting, completed, exported, error
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  config TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  delimiter TEXT DEFAULT '/',
  flags TEXT DEFAULT '[]',
  total_messages INTEGER DEFAULT 0,
  unseen_messages INTEGER DEFAULT 0,
  parent_path TEXT,
  selected_for_collection INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  acquisition_id TEXT REFERENCES acquisitions(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  uid INTEGER,
  service_id TEXT,
  folder TEXT,
  subject TEXT,
  from_address TEXT,
  to_addresses TEXT,
  cc_addresses TEXT,
  bcc_addresses TEXT,
  date TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  size INTEGER,
  flags TEXT,
  has_attachments INTEGER DEFAULT 0,
  attachment_count INTEGER DEFAULT 0,
  content_type TEXT,
  hash_md5 TEXT,
  hash_sha256 TEXT,
  hash_sha512 TEXT,
  eml_path TEXT,
  acquired_at TEXT DEFAULT (datetime('now')),
  headers_json TEXT,
  is_encrypted INTEGER DEFAULT 0,
  is_signed INTEGER DEFAULT 0,
  body_text TEXT,
  body_html TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  filename TEXT,
  content_type TEXT,
  size INTEGER,
  hash_md5 TEXT,
  hash_sha256 TEXT,
  disposition TEXT,
  content_id TEXT,
  is_inline INTEGER DEFAULT 0,
  local_path TEXT
);

CREATE TABLE IF NOT EXISTS acquisitions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed, paused
  started_at TEXT,
  completed_at TEXT,
  total_messages INTEGER DEFAULT 0,
  acquired_messages INTEGER DEFAULT 0,
  failed_messages INTEGER DEFAULT 0,
  skipped_messages INTEGER DEFAULT 0,
  total_bytes INTEGER DEFAULT 0,
  error_log TEXT,
  protocol_log TEXT,
  folders_json TEXT
);

CREATE TABLE IF NOT EXISTS search_queries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  query_type TEXT NOT NULL, -- in_place, in_line, date_range, keyword, sender, recipient, has_attachment
  query_text TEXT,
  criteria_json TEXT, -- structured search criteria
  result_count INTEGER DEFAULT 0,
  executed_at TEXT DEFAULT (datetime('now')),
  applied_to_collection INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS export_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  format TEXT NOT NULL, -- pst, eml, msg, mbox, mime
  output_dir TEXT,
  started_at TEXT,
  completed_at TEXT,
  message_count INTEGER DEFAULT 0,
  total_bytes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  hash_sha256 TEXT,
  details_json TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id),
  acquisition_id TEXT REFERENCES acquisitions(id),
  timestamp TEXT DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  description TEXT,
  details TEXT,
  hash TEXT,
  examiner TEXT,
  prev_hash TEXT
);

CREATE TABLE IF NOT EXISTS qc_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  started_at TEXT,
  completed_at TEXT,
  status TEXT,
  results_json TEXT
);

CREATE TABLE IF NOT EXISTS differential_ids (
  project_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  folder TEXT NOT NULL,
  source_project_id TEXT,
  PRIMARY KEY (project_id, service_id, folder)
);

CREATE TABLE IF NOT EXISTS drive_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  message_id TEXT REFERENCES messages(id),
  provider TEXT,
  url TEXT,
  file_id TEXT,
  status TEXT DEFAULT 'detected',
  detected_at TEXT DEFAULT (datetime('now')),
  downloaded_at TEXT,
  local_path TEXT,
  file_size INTEGER,
  hash_sha256 TEXT
);

CREATE TABLE IF NOT EXISTS timestamp_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  timestamp_data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inline_searches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  query TEXT NOT NULL,
  result_count INTEGER DEFAULT 0,
  elapsed_ms INTEGER DEFAULT 0,
  executed_at TEXT DEFAULT (datetime('now'))
);
