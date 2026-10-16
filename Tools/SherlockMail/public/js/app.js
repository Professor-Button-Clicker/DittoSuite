let currentProject = null;
let currentFolder = null;
let currentTab = 'projects';

// Wizard state
let wizStep = 1;
let wizConnection = {};
let wizFolders = [];
let wizSelectedFolders = [];
let wizCollectionId = null;
let wizProgressTimer = null;
let wizOutputDir = '';

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadSystemInfo();
  loadProjects();
  initTheme();
  wizBindFormatListeners();
});

// --- Theme ---
function initTheme() {
  try {
    const saved = localStorage.getItem('sherlock-theme');
    if (saved === 'light') applyTheme('light');
    else applyTheme('dark');
  } catch { applyTheme('dark'); }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem('sherlock-theme', next); } catch {}
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  const label = document.getElementById('theme-label');
  if (darkIcon && lightIcon && label) {
    darkIcon.style.display = theme === 'light' ? 'none' : 'block';
    lightIcon.style.display = theme === 'light' ? 'block' : 'none';
    label.textContent = theme === 'light' ? 'Light' : 'Dark';
  }
}

// --- API ---
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// --- Navigation ---
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  // Hide all panel views
  document.querySelectorAll('.panel-view').forEach(p => p.classList.remove('visible'));

  // Handle message-list-panel (always-present flex container) vs panel-view overlays
  const msgPanel = document.getElementById('view-messages');
  const panelViews = ['new-project', 'search', 'audit', 'collect', 'export', 'forensics', 'guide'];

  if (panelViews.includes(tab)) {
    const target = document.getElementById(`view-${tab}`);
    if (target) target.classList.add('visible');
  }

  if (tab === 'audit' && currentProject) loadAuditLog();
  if (tab === 'search') document.getElementById('adv-search-input')?.focus();
  if (tab === 'collect' && !currentProject) toast('Select a project first to begin collection');
  if (tab === 'export' && currentProject) loadExportHistory();
  if (tab === 'forensics' && !currentProject) toast('Select a project first');

  updateSidebar();
}

function updateSidebar() {
  const title = document.getElementById('sidebar-title');
  if ((currentTab === 'messages' || currentTab === 'projects') && currentProject) {
    title.textContent = 'Folders';
    loadFolders();
  } else {
    title.textContent = 'Projects';
    loadProjects();
  }
}

// --- Forensics Sub-tabs ---
function switchForensicsTab(subtab) {
  document.querySelectorAll('#forensics-sub-tabs .sub-tab').forEach(t => t.classList.toggle('active', t.dataset.subtab === subtab));
  ['qc', 'cloud', 'timestamps', 'integrity', 'timeline', 'relationships'].forEach(s => {
    const el = document.getElementById(`forensics-${s}`);
    if (el) el.classList.toggle('active', s === subtab);
  });
}

// --- System Info ---
async function loadSystemInfo() {
  try {
    const info = await api('/stats');
    const projEl = document.getElementById('status-projects');
    const msgEl = document.getElementById('status-messages');
    const sizeEl = document.getElementById('status-size');
    const nodeEl = document.getElementById('status-node');
    if (projEl) projEl.textContent = `Projects: ${info.totalProjects || 0}`;
    if (msgEl) msgEl.textContent = `Messages: ${info.totalMessages || 0}`;
    if (sizeEl) sizeEl.textContent = `Size: ${formatBytes(info.totalSize || 0)}`;
    if (nodeEl) nodeEl.textContent = `Node ${info.nodeVersion || ''}`;
  } catch {}
}

// --- Projects ---
async function loadProjects() {
  try {
    const projects = await api('/projects');
    const container = document.getElementById('sidebar-content');

    if (projects.length === 0) {
      container.innerHTML = `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
          <p>No projects yet.</p>
          <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="switchTab('new-project')">Create First Project</button>
        </div>`;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="project-item ${currentProject?.id === p.id ? 'active' : ''}" onclick="selectProject('${p.id}')">
        <div class="project-name">${esc(p.name)}</div>
        <div class="project-email">${esc(p.target_email)}</div>
        <span class="project-status status-${p.status}">${p.status.toUpperCase()}</span>
      </div>
    `).join('');
  } catch {}
}

async function selectProject(id) {
  currentProject = await api(`/projects/${id}`);
  currentFolder = null;
  loadProjects();

  switchTab('messages');
  loadFolders();
  loadMessages();

  document.getElementById('message-list-title').textContent = currentProject.name;
  loadSystemInfo();
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its data? This cannot be undone.')) return;
  try {
    await api(`/projects/${id}`, { method: 'DELETE' });
    if (currentProject?.id === id) currentProject = null;
    toast('Project deleted');
    loadProjects();
    loadSystemInfo();
  } catch (err) {
    toast('Delete failed: ' + err.message);
  }
}

// --- Folders ---
async function loadFolders() {
  if (!currentProject) return;
  try {
    const folders = await api(`/projects/${currentProject.id}/folders`);
    const container = document.getElementById('sidebar-content');

    if (folders.length === 0) {
      container.innerHTML = `
        <div class="folder-item active" onclick="selectFolder(null)">
          <span class="folder-icon">&#128193;</span>
          <span>All Messages</span>
          <span class="badge">${currentProject.stats?.messages?.count || 0}</span>
        </div>
        <div style="padding:12px;color:var(--text-muted);font-size:12px">
          No folders enumerated yet. Run a collection to populate folders.
        </div>`;
      return;
    }

    const folderIcons = {
      'INBOX': '&#128229;', 'Sent': '&#128228;', 'Drafts': '&#128221;', 'Trash': '&#128465;',
      'Spam': '&#9888;', 'Junk': '&#9888;', 'Archive': '&#128230;'
    };

    let html = `
      <div class="folder-item ${!currentFolder ? 'active' : ''}" onclick="selectFolder(null)">
        <span class="folder-icon">&#128193;</span>
        <span>All Messages</span>
        <span class="badge">${currentProject.stats?.messages?.count || 0}</span>
      </div>`;

    for (const f of folders) {
      const icon = folderIcons[f.name] || '&#128194;';
      html += `
        <div class="folder-item ${currentFolder === f.path ? 'active' : ''}" onclick="selectFolder('${esc(f.path)}')">
          <span class="folder-icon">${icon}</span>
          <span>${esc(f.name)}</span>
          <span class="badge">${f.total_messages}</span>
        </div>`;
    }

    container.innerHTML = html;
  } catch {}
}

function selectFolder(path) {
  currentFolder = path;
  loadFolders();
  loadMessages();
}

// --- Messages ---
async function loadMessages() {
  if (!currentProject) return;
  const params = new URLSearchParams({ limit: '200' });
  if (currentFolder) params.set('folder', currentFolder);
  try {
    const data = await api(`/projects/${currentProject.id}/messages?${params}`);
    const messages = data.messages || data;

    const list = document.getElementById('message-list');
    document.getElementById('message-count').textContent = `${messages.length} messages`;

    if (messages.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <h3>${currentFolder ? 'No messages in this folder' : 'No messages acquired yet'}</h3>
          <p>Use the <strong>Collect</strong> tab to run the collection wizard.</p>
        </div>`;
      return;
    }

    list.innerHTML = messages.map(m => `
      <div class="message-row" onclick="viewMessage('${m.id}')" data-id="${m.id}">
        <div class="msg-flags">
          ${m.has_attachments ? '<span class="flag-attachment" title="Has attachments">&#128206;</span>' : ''}
          ${m.is_encrypted ? '<span class="flag-encrypted" title="Encrypted">&#128274;</span>' : ''}
          ${m.is_signed ? '<span class="flag-signed" title="Signed">&#10003;</span>' : ''}
        </div>
        <div class="msg-from" title="${esc(m.from_address)}">${esc(extractName(m.from_address))}</div>
        <div class="msg-subject" title="${esc(m.subject)}">${esc(m.subject || '(no subject)')}</div>
        <div class="msg-date">${formatDate(m.date)}</div>
        <div class="msg-size">${formatBytes(m.size)}</div>
      </div>
    `).join('');
  } catch {}
}

async function viewMessage(msgId) {
  try {
    const data = await api(`/projects/${currentProject.id}/messages/${msgId}`);
    const viewer = document.getElementById('message-viewer');

    document.querySelectorAll('.message-row').forEach(r => r.classList.toggle('active', r.dataset.id === msgId));

    let attachmentsHtml = '';
    if (data.attachments?.length) {
      attachmentsHtml = `
        <div class="msg-attachments">
          <h4>Attachments (${data.attachments.length})</h4>
          ${data.attachments.map(a => `
            <div class="attachment-item">
              <span>&#128206;</span>
              <span class="att-name">${esc(a.filename)}</span>
              <span class="att-hash" title="SHA-256">${a.hash_sha256?.substring(0, 16)}...</span>
              <span class="att-size">${formatBytes(a.size)}</span>
            </div>
          `).join('')}
        </div>`;
    }

    viewer.innerHTML = `
      <div class="msg-viewer-header">
        <div class="msg-viewer-subject">${esc(data.subject || '(no subject)')}</div>
        <div class="msg-header-row"><span class="msg-header-label">From:</span><span class="msg-header-value">${esc(data.from_address)}</span></div>
        <div class="msg-header-row"><span class="msg-header-label">To:</span><span class="msg-header-value">${esc(data.to_addresses)}</span></div>
        ${data.cc_addresses ? `<div class="msg-header-row"><span class="msg-header-label">Cc:</span><span class="msg-header-value">${esc(data.cc_addresses)}</span></div>` : ''}
        <div class="msg-header-row"><span class="msg-header-label">Date:</span><span class="msg-header-value">${data.date ? new Date(data.date).toLocaleString() : 'Unknown'}</span></div>
        <div class="msg-header-row"><span class="msg-header-label">Message-ID:</span><span class="msg-header-value" style="font-family:var(--font-mono);font-size:12px">${esc(data.message_id)}</span></div>
      </div>
      <div class="msg-forensic-bar">
        <div class="hash-item"><span class="hash-label">MD5:</span><span class="hash-value">${data.hash_md5 || 'N/A'}</span></div>
        <div class="hash-item"><span class="hash-label">SHA-256:</span><span class="hash-value">${data.hash_sha256 || 'N/A'}</span></div>
      </div>
      ${attachmentsHtml}
      <div class="msg-viewer-body">
        <p style="color:var(--text-muted);font-size:12px">EML preserved at: <code>${esc(data.eml_path || 'Not available')}</code></p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:4px">Folder: <code>${esc(data.folder)}</code> | UID: ${data.uid} | Flags: ${esc(data.flags)}</p>
      </div>
    `;
    viewer.classList.add('visible');
  } catch (err) {
    toast('Failed to load message: ' + err.message);
  }
}

// --- Create Project ---
async function createProject(e) {
  e.preventDefault();
  const project = {
    name: document.getElementById('proj-name').value,
    targetEmail: document.getElementById('proj-email').value,
    providerType: document.getElementById('proj-provider').value,
    caseId: document.getElementById('proj-case-id').value,
    evidenceId: document.getElementById('proj-evidence-id').value,
    custodianName: document.getElementById('proj-custodian').value,
    examinerName: document.getElementById('proj-examiner').value
  };

  try {
    const result = await api('/projects', { method: 'POST', body: project });
    toast(`Project "${project.name}" created`);
    document.getElementById('new-project-form').reset();
    document.getElementById('provider-result').innerHTML = '';
    await selectProject(result.id);
    loadSystemInfo();
  } catch (err) {
    toast('Failed to create project: ' + err.message);
  }
}

async function detectEmailProvider() {
  const email = document.getElementById('proj-email').value;
  if (!email) return;
  const el = document.getElementById('provider-result');
  el.innerHTML = '<span style="color:var(--text-muted)">Detecting provider...</span>';

  try {
    const result = await api(`/providers/detect?email=${encodeURIComponent(email)}`);

    if (result.provider) {
      const rec = result.recommended;
      document.getElementById('proj-provider').value = rec?.protocol || 'imap';
      const preset = rec?.preset || {};
      el.innerHTML = `
        <div class="provider-result">
          <div class="provider-name">${esc(result.provider.name)}</div>
          <div class="provider-detail">Recommended: ${rec?.protocol || 'imap'} | OAuth: ${result.provider.oauthRequired ? 'Required' : 'Optional'}</div>
          ${result.provider.notes ? `<div class="provider-detail">${esc(result.provider.notes)}</div>` : ''}
          ${preset.host ? `<div class="provider-detail">IMAP: ${preset.host}:${preset.port || 993}</div>` : ''}
        </div>`;
    } else {
      el.innerHTML = '<span style="color:var(--danger)">Could not detect provider</span>';
    }
  } catch {
    el.innerHTML = '<span style="color:var(--danger)">Detection failed</span>';
  }
}

// --- Search ---
async function globalSearch() {
  const query = document.getElementById('global-search').value;
  const type = document.getElementById('search-type').value;
  if (!query || !currentProject) {
    toast('Enter a search term and select a project first');
    return;
  }

  switchTab('search');
  document.getElementById('adv-search-input').value = query;

  if (type === 'inline') {
    const results = await api(`/projects/${currentProject.id}/inline-search`, { method: 'POST', body: { query } });
    renderInlineSearchResults(results, query);
  } else {
    const results = await api(`/projects/${currentProject.id}/search`, { method: 'POST', body: { criteria: { keyword: query }, queryType: 'keyword' } });
    renderServerSearchResults(results, query);
  }
}

function buildAdvancedQuery() {
  let parts = [];
  const base = document.getElementById('adv-search-input').value.trim();
  if (base) parts.push(base);

  const from = document.getElementById('adv-from').value.trim();
  if (from) parts.push(`from:${from}`);

  const to = document.getElementById('adv-to').value.trim();
  if (to) parts.push(`to:${to}`);

  const subject = document.getElementById('adv-subject').value.trim();
  if (subject) parts.push(subject.includes(' ') ? `subject:"${subject}"` : `subject:${subject}`);

  const dateFrom = document.getElementById('adv-date-from').value;
  const dateTo = document.getElementById('adv-date-to').value;
  if (dateFrom && dateTo) {
    parts.push(`sent:[${dateFrom.replace(/-/g, '/')} TO ${dateTo.replace(/-/g, '/')}]`);
  } else if (dateFrom) {
    parts.push(`sent:[${dateFrom.replace(/-/g, '/')} TO 2099/12/31]`);
  } else if (dateTo) {
    parts.push(`sent:[2000/01/01 TO ${dateTo.replace(/-/g, '/')}]`);
  }

  const hasAttachments = document.getElementById('adv-has-attachments').checked;
  if (hasAttachments) parts.push('attachmentcount:[1 TO 9999]');

  const minSize = parseInt(document.getElementById('adv-min-size').value);
  if (minSize > 0) parts.push(`size:[${minSize * 1024} TO 999999999]`);

  return parts.join(' ');
}

function clearAdvancedSearch() {
  document.getElementById('adv-search-input').value = '';
  document.getElementById('adv-from').value = '';
  document.getElementById('adv-to').value = '';
  document.getElementById('adv-subject').value = '';
  document.getElementById('adv-date-from').value = '';
  document.getElementById('adv-date-to').value = '';
  document.getElementById('adv-min-size').value = '';
  document.getElementById('adv-has-attachments').checked = false;
  document.getElementById('adv-encrypted').checked = false;
  document.getElementById('search-results').innerHTML = '';
}

function insertBoolOp(op) {
  const input = document.getElementById('adv-search-input');
  const pos = input.selectionStart || input.value.length;
  const before = input.value.substring(0, pos);
  const after = input.value.substring(pos);
  input.value = `${before} ${op} ${after}`;
  input.focus();
  input.setSelectionRange(pos + op.length + 2, pos + op.length + 2);
}

async function runAdvancedSearch() {
  if (!currentProject) { toast('Select a project first'); return; }

  const query = buildAdvancedQuery();
  if (!query) { toast('Enter search criteria'); return; }

  try {
    const results = await api(`/projects/${currentProject.id}/inline-search`, { method: 'POST', body: { query } });
    const encrypted = document.getElementById('adv-encrypted').checked;
    if (encrypted && results.results) {
      results.results = results.results.filter(m => m.is_encrypted || m.is_signed);
      results.stats.matched = results.results.length;
    }
    renderInlineSearchResults(results, query);
  } catch (err) {
    toast('Search failed: ' + err.message);
  }
}

function renderInlineSearchResults(data, query) {
  const container = document.getElementById('search-results');
  const results = data.results || [];

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state" style="height:200px"><h3>No results for "${esc(query)}"</h3></div>`;
    return;
  }

  const statsHtml = data.stats ? `
    <div style="display:flex;gap:16px;margin-bottom:12px;font-size:12px;color:var(--text-muted)">
      <span>Matched: <strong style="color:var(--accent)">${data.stats.matched}</strong> of ${data.stats.total}</span>
      <span>Elapsed: ${data.stats.elapsed}ms</span>
    </div>` : '';

  container.innerHTML = `
    <div class="message-list-header">Found ${results.length} results for "${esc(query)}"</div>
    ${statsHtml}
    ${results.map(m => `
      <div class="message-row" onclick="viewMessage('${m.id}')" data-id="${m.id}">
        <div class="msg-flags">${m.has_attachments ? '&#128206;' : ''}</div>
        <div class="msg-from">${esc(extractName(m.from_address))}</div>
        <div class="msg-subject">${esc(m.subject || '(no subject)')}</div>
        <div class="msg-date">${formatDate(m.date)}</div>
        <div class="msg-size">${formatBytes(m.size)}</div>
      </div>
    `).join('')}`;
}

function renderServerSearchResults(data, query) {
  const container = document.getElementById('search-results');
  const results = data.localResults || [];

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state" style="height:200px"><h3>No results for "${esc(query)}"</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="message-list-header">Found ${results.length} results for "${esc(query)}"</div>
    ${results.map(m => `
      <div class="message-row" onclick="viewMessage('${m.id}')" data-id="${m.id}">
        <div class="msg-flags">${m.has_attachments ? '&#128206;' : ''}</div>
        <div class="msg-from">${esc(extractName(m.from_address))}</div>
        <div class="msg-subject">${esc(m.subject || '(no subject)')}</div>
        <div class="msg-date">${formatDate(m.date)}</div>
        <div class="msg-size">${formatBytes(m.size)}</div>
      </div>
    `).join('')}`;
}

// --- Audit Log ---
async function loadAuditLog() {
  if (!currentProject) return;
  try {
    const log = await api(`/projects/${currentProject.id}/audit`);
    const container = document.getElementById('audit-content');

    if (log.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted)">No audit entries yet.</p>';
      return;
    }

    container.innerHTML = `
      <table class="audit-table">
        <thead><tr>
          <th>Timestamp</th><th>Event</th><th>Description</th><th>Hash</th><th>Examiner</th>
        </tr></thead>
        <tbody>
          ${log.map(e => `
            <tr>
              <td style="white-space:nowrap;font-family:var(--font-mono);font-size:11px">${formatTimestamp(e.timestamp)}</td>
              <td><span class="event-badge event-${e.event_type}">${e.event_type}</span></td>
              <td>${esc(e.description)}</td>
              <td style="font-family:var(--font-mono);font-size:10px;color:var(--accent);max-width:120px;overflow:hidden;text-overflow:ellipsis" title="${e.hash}">${e.hash?.substring(0, 16) || 'N/A'}...</td>
              <td>${esc(e.examiner || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch {}
}

async function verifyChain() {
  if (!currentProject) return;
  try {
    const result = await api(`/projects/${currentProject.id}/verify`);
    const el = document.getElementById('chain-status');
    const chain = result.auditLogIntegrity;
    if (chain?.chainVerified?.valid) {
      el.innerHTML = `<span class="verify-pass">Chain integrity verified (${chain.totalEntries} entries)</span>`;
    } else {
      el.innerHTML = `<span class="verify-fail">Chain integrity issue detected</span>`;
    }
  } catch (err) {
    document.getElementById('chain-status').innerHTML = `<span class="verify-fail">Verification failed</span>`;
  }
}

// ============================================================
// EXPORT TAB
// ============================================================

async function runExport() {
  if (!currentProject) { toast('Select a project first'); return; }
  const format = document.getElementById('export-format').value;
  const statusEl = document.getElementById('export-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Exporting...</span>';

  try {
    const result = await api(`/projects/${currentProject.id}/export`, { method: 'POST', body: { format } });
    statusEl.innerHTML = '<span class="verify-pass">Export complete</span>';
    renderExportResult(result);
    loadExportHistory();
    loadSystemInfo();
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Export failed: ${esc(err.message)}</span>`;
  }
}

function renderExportResult(result) {
  const el = document.getElementById('export-results');
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Format</div><div class="stat-value" style="font-size:20px">${result.format?.toUpperCase()}</div></div>
      <div class="stat-card"><div class="stat-label">Messages</div><div class="stat-value">${result.messageCount}</div></div>
      <div class="stat-card"><div class="stat-label">Total Size</div><div class="stat-value" style="font-size:20px">${formatBytes(result.totalBytes)}</div></div>
      <div class="stat-card"><div class="stat-label">Files</div><div class="stat-value">${result.files?.length || 0}</div></div>
    </div>
    ${result.files?.length ? `
      <h3 style="margin-bottom:12px;font-size:14px">Exported Files</h3>
      ${result.files.map(f => `
        <div class="attachment-item">
          <span>&#128196;</span>
          <span class="att-name">${esc(f.filename)}</span>
          <span class="att-hash" title="SHA-256">${f.hash?.substring(0, 16)}...</span>
          <span class="att-size">${formatBytes(f.size)}</span>
        </div>
      `).join('')}
    ` : ''}
    ${result.timestamp ? `
      <div style="margin-top:16px;padding:12px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius)">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">RFC 3161 Timestamp</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${result.timestamp.genTime}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Serial: ${result.timestamp.serialNumber}</div>
      </div>
    ` : ''}
  `;
}

async function loadExportHistory() {
  if (!currentProject) return;
  try {
    const exports = await api(`/projects/${currentProject.id}/exports`);
    const el = document.getElementById('export-history');

    if (exports.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">No exports yet.</p>';
      return;
    }

    el.innerHTML = `
      <h3 style="margin-bottom:12px;font-size:14px">Export History</h3>
      <table class="audit-table">
        <thead><tr><th>Date</th><th>Format</th><th>Messages</th><th>Size</th><th>Hash</th></tr></thead>
        <tbody>
          ${exports.map(e => `
            <tr>
              <td style="font-family:var(--font-mono);font-size:11px">${formatTimestamp(e.created_at)}</td>
              <td><span class="event-badge event-EXPORT_COMPLETED">${(e.format || '').toUpperCase()}</span></td>
              <td>${e.message_count}</td>
              <td style="font-family:var(--font-mono)">${formatBytes(e.total_bytes)}</td>
              <td style="font-family:var(--font-mono);font-size:10px;color:var(--accent)" title="${e.hash_sha256}">${e.hash_sha256?.substring(0, 16)}...</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch {}
}

// ============================================================
// FORENSICS: Quality Control
// ============================================================

async function runQualityControl() {
  if (!currentProject) { toast('Select a project first'); return; }
  const statusEl = document.getElementById('qc-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Running 9-point QC...</span>';

  try {
    const results = await api(`/projects/${currentProject.id}/qc`, { method: 'POST' });
    statusEl.innerHTML = '';
    renderQCResults(results, 'qc-results');
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">QC failed: ${esc(err.message)}</span>`;
  }
}

function renderQCResults(results, containerId) {
  const el = document.getElementById(containerId);
  const checks = results.checks || [];
  const summary = results.summary || {};

  const statusColor = results.overallStatus === 'pass' ? 'var(--success)' : results.overallStatus === 'warning' ? 'var(--warning)' : 'var(--danger)';
  const statusText = results.overallStatus === 'pass' ? 'ALL CHECKS PASSED' : results.overallStatus === 'warning' ? 'PASSED WITH WARNINGS' : 'ISSUES FOUND';

  let html = `
    <div style="margin-bottom:24px">
      <h3 style="margin-bottom:12px">Result: <span style="color:${statusColor};font-weight:700">${statusText}</span></h3>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Passed</div><div class="stat-value" style="color:var(--success)">${summary.passed || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Warnings</div><div class="stat-value" style="color:var(--warning)">${summary.warnings || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value" style="color:var(--danger)">${summary.failed || 0}</div></div>
      </div>
    </div>`;

  for (const check of checks) {
    const cls = check.status === 'pass' ? 'qc-pass' : check.status === 'warning' ? 'qc-warning' : 'qc-fail';
    const icon = check.status === 'pass' ? '&#10003;' : check.status === 'warning' ? '&#9888;' : '&#10007;';
    html += `
      <div class="qc-check ${cls}">
        <div class="qc-icon">${icon}</div>
        <div>
          <div class="qc-name">${esc(check.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(check.message || check.detail || '')}</div>
        </div>
        <div class="qc-detail">${check.status.toUpperCase()}</div>
      </div>`;
  }

  el.innerHTML = html;
}

// ============================================================
// FORENSICS: Cloud Attachments
// ============================================================

async function runCloudScan() {
  if (!currentProject) { toast('Select a project first'); return; }
  const statusEl = document.getElementById('cloud-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Scanning...</span>';

  try {
    const result = await api(`/projects/${currentProject.id}/cloud-scan`, { method: 'POST' });
    statusEl.innerHTML = '<span class="verify-pass">Scan complete</span>';
    renderCloudResults(result);
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Scan failed: ${esc(err.message)}</span>`;
  }
}

function renderCloudResults(result) {
  const el = document.getElementById('cloud-results');
  const links = result.links || [];

  let html = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Links Found</div><div class="stat-value">${result.totalLinks || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Providers</div><div class="stat-value">${result.totalProviders || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Messages with Links</div><div class="stat-value">${result.messagesWithLinks || 0}</div></div>
    </div>`;

  if (result.byProvider && Object.keys(result.byProvider).length > 0) {
    html += '<h3 style="margin:16px 0 12px;font-size:14px">By Provider</h3>';
    for (const [provider, count] of Object.entries(result.byProvider)) {
      html += `
        <div class="qc-check qc-pass" style="border-left:3px solid var(--accent)">
          <div class="qc-name">${esc(provider)}</div>
          <div class="qc-detail">${count} link(s)</div>
        </div>`;
    }
  }

  if (links.length > 0) {
    html += '<h3 style="margin:16px 0 12px;font-size:14px">Detected Links</h3>';
    for (const link of links.slice(0, 50)) {
      html += `
        <div class="attachment-item">
          <span>&#128279;</span>
          <span class="att-name" style="word-break:break-all">${esc(link.url?.substring(0, 80) || '')}</span>
          <span class="att-hash">${esc(link.provider || link.providerLabel || '')}</span>
        </div>`;
    }
  }

  el.innerHTML = html;
}

// ============================================================
// FORENSICS: Timestamps
// ============================================================

async function createTimestamp(type) {
  if (!currentProject) { toast('Select a project first'); return; }
  const statusEl = document.getElementById('ts-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Creating timestamp...</span>';

  try {
    const result = await api(`/projects/${currentProject.id}/timestamp`, { method: 'POST', body: { type } });
    statusEl.innerHTML = '<span class="verify-pass">Timestamp created</span>';
    renderTimestampResult(result);
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Failed: ${esc(err.message)}</span>`;
  }
}

function renderTimestampResult(result) {
  const el = document.getElementById('ts-results');
  const ts = result.timestamp || {};

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Type</div><div class="stat-value" style="font-size:18px">${esc(result.type || '')}</div></div>
      <div class="stat-card"><div class="stat-label">Time</div><div class="stat-value" style="font-size:14px;font-family:var(--font-mono)">${esc(ts.genTime || '')}</div></div>
      <div class="stat-card"><div class="stat-label">Serial Number</div><div class="stat-value" style="font-size:12px;font-family:var(--font-mono)">${esc(ts.serialNumber || '')}</div></div>
    </div>
    <div style="margin-top:16px;padding:16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius)">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Timestamp Details</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.8">
        <div>Hash Algorithm: <strong style="color:var(--accent)">${esc(ts.hashAlgorithm || 'SHA-256')}</strong></div>
        <div>Message Digest: <span style="font-family:var(--font-mono);color:var(--accent);font-size:11px">${esc(result.collectionDigest || result.manifestHash || '')}</span></div>
        <div>Standard: <strong>RFC 3161</strong></div>
      </div>
    </div>`;
}

// ============================================================
// FORENSICS: Evidence Integrity
// ============================================================

async function verifyIntegrity() {
  if (!currentProject) { toast('Select a project first'); return; }
  const statusEl = document.getElementById('integrity-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Verifying...</span>';

  try {
    const result = await api(`/projects/${currentProject.id}/verify`);
    statusEl.innerHTML = '<span class="verify-pass">Verification complete</span>';
    renderIntegrityResults(result);
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Verification failed: ${esc(err.message)}</span>`;
  }
}

function renderIntegrityResults(result) {
  const el = document.getElementById('integrity-results');
  const hv = result.hashVerification || {};
  const chain = result.auditLogIntegrity || {};
  const chainValid = chain.chainVerified?.valid;

  let html = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Messages Verified</div><div class="stat-value">${hv.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Hashes Preserved</div><div class="stat-value" style="color:var(--success)">${hv.preserved || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Audit Entries</div><div class="stat-value">${chain.totalEntries || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Chain Valid</div><div class="stat-value" style="color:${chainValid ? 'var(--success)' : 'var(--danger)'}">${chainValid ? 'YES' : 'NO'}</div></div>
      <div class="stat-card"><div class="stat-label">Exports Verified</div><div class="stat-value">${result.exportIntegrity?.length || 0}</div></div>
      <div class="stat-card"><div class="stat-label">RFC 3161 Timestamps</div><div class="stat-value">${result.timestampRecords || 0}</div></div>
    </div>

    <h3 style="margin:16px 0 12px;font-size:14px">Verification Checks</h3>
    <div class="qc-check ${hv.preserved === hv.total ? 'qc-pass' : 'qc-warning'}">
      <div class="qc-icon">${hv.preserved === hv.total ? '&#10003;' : '&#9888;'}</div>
      <div>
        <div class="qc-name">Message Hash Integrity (${hv.algorithm || 'SHA-256'})</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${hv.preserved}/${hv.total} hashes preserved</div>
      </div>
      <div class="qc-detail">${hv.preserved === hv.total ? 'PASS' : 'WARNING'}</div>
    </div>

    <div class="qc-check ${chainValid ? 'qc-pass' : 'qc-fail'}">
      <div class="qc-icon">${chainValid ? '&#10003;' : '&#10007;'}</div>
      <div>
        <div class="qc-name">Audit Chain Integrity</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${chain.totalEntries} entries verified</div>
      </div>
      <div class="qc-detail">${chainValid ? 'PASS' : 'FAIL'}</div>
    </div>`;

  if (result.exportIntegrity?.length) {
    for (const exp of result.exportIntegrity) {
      const valid = exp.valid !== false;
      html += `
        <div class="qc-check ${valid ? 'qc-pass' : 'qc-fail'}">
          <div class="qc-icon">${valid ? '&#10003;' : '&#10007;'}</div>
          <div>
            <div class="qc-name">Export: ${esc(exp.format?.toUpperCase() || 'Unknown')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${exp.error ? esc(exp.error) : 'Files verified'}</div>
          </div>
          <div class="qc-detail">${valid ? 'PASS' : 'FAIL'}</div>
        </div>`;
    }
  }

  if (result.standards) {
    html += `
      <div style="margin-top:24px;padding:16px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius)">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Compliance Standards</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.8">
          <div>Hash: <strong style="color:var(--text-primary)">${esc(result.standards.hashAlgorithm)}</strong></div>
          <div>Audit: <strong style="color:var(--text-primary)">${esc(result.standards.auditStandard)}</strong></div>
          <div>Legal: <strong style="color:var(--text-primary)">${esc(result.standards.legalStandard)}</strong></div>
          <div>Timestamp: <strong style="color:var(--text-primary)">${esc(result.standards.timestampStandard)}</strong></div>
        </div>
      </div>`;
  }

  el.innerHTML = html;
}

// ============================================================
// FORENSICS: Timeline Analysis
// ============================================================

async function loadTimeline() {
  if (!currentProject) { toast('Select a project first'); return; }
  const statusEl = document.getElementById('timeline-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Loading timeline...</span>';

  try {
    const data = await api(`/projects/${currentProject.id}/analytics/timeline`);
    statusEl.innerHTML = '';
    renderTimeline(data);
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Failed: ${esc(err.message)}</span>`;
  }
}

function renderTimeline(data) {
  const el = document.getElementById('timeline-results');
  const tl = data.timeline || [];
  const range = data.dateRange;

  if (tl.length === 0) {
    el.innerHTML = '<div class="empty-state" style="height:200px"><h3>No dated messages to chart</h3><p>Collect messages first.</p></div>';
    return;
  }

  const maxCount = Math.max(...tl.map(d => d.count));
  const barChart = tl.map(d => {
    const pct = maxCount > 0 ? (d.count / maxCount * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px" title="${d.date}: ${d.count} messages (${formatBytes(d.totalSize)})">
      <span style="min-width:80px;font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${d.date}</span>
      <div style="flex:1;height:18px;background:var(--bg-surface);border-radius:3px;overflow:hidden">
        <div style="height:100%;border-radius:3px;display:flex;align-items:center">
          <div style="height:100%;background:var(--accent);border-radius:3px;width:${pct}%;min-width:${d.count > 0 ? 2 : 0}px"></div>
          ${d.sent > 0 ? `<div style="height:100%;background:var(--success);border-radius:0 3px 3px 0;width:${d.sent / d.count * pct}%;min-width:1px" title="${d.sent} sent"></div>` : ''}
        </div>
      </div>
      <span style="min-width:35px;text-align:right;font-size:12px;font-weight:500;color:var(--text-primary)">${d.count}</span>
    </div>`;
  }).join('');

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxDay = Math.max(...data.dayOfWeekDistribution);
  const dowChart = data.dayOfWeekDistribution.map((count, i) => {
    const pct = maxDay > 0 ? (count / maxDay * 100) : 0;
    return `<div style="text-align:center;flex:1">
      <div style="height:60px;display:flex;align-items:flex-end;justify-content:center">
        <div style="width:24px;background:var(--accent);border-radius:3px 3px 0 0;height:${pct}%;min-height:${count > 0 ? 2 : 0}px"></div>
      </div>
      <div style="font-size:11px;margin-top:4px;color:var(--text-muted)">${dayNames[i]}</div>
      <div style="font-size:10px;color:var(--text-secondary)">${count}</div>
    </div>`;
  }).join('');

  const maxHour = Math.max(...data.hourDistribution);
  const hourChart = data.hourDistribution.map((count, i) => {
    const pct = maxHour > 0 ? (count / maxHour * 100) : 0;
    return `<div style="text-align:center;flex:1;min-width:0">
      <div style="height:50px;display:flex;align-items:flex-end;justify-content:center">
        <div style="width:100%;max-width:16px;background:var(--accent);border-radius:2px 2px 0 0;height:${pct}%;min-height:${count > 0 ? 1 : 0}px"></div>
      </div>
      <div style="font-size:9px;color:var(--text-muted)">${i}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Total Messages</div><div class="stat-value">${data.totalMessages}</div></div>
      <div class="stat-card"><div class="stat-label">Date Range</div><div class="stat-value" style="font-size:14px;font-family:var(--font-mono)">${range ? `${range.from} — ${range.to}` : 'N/A'}</div></div>
      <div class="stat-card"><div class="stat-label">Active Days</div><div class="stat-value">${tl.length}</div></div>
      <div class="stat-card"><div class="stat-label">Avg/Day</div><div class="stat-value">${tl.length > 0 ? (data.totalMessages / tl.length).toFixed(1) : 0}</div></div>
    </div>

    <h3 style="margin:20px 0 12px;font-size:14px">Daily Volume</h3>
    <div style="max-height:400px;overflow-y:auto;padding-right:8px">${barChart}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px">
      <div>
        <h3 style="margin:0 0 12px;font-size:14px">Day of Week</h3>
        <div style="display:flex;gap:4px;padding:8px;background:var(--bg-surface);border-radius:var(--radius)">${dowChart}</div>
      </div>
      <div>
        <h3 style="margin:0 0 12px;font-size:14px">Hour of Day (0-23)</h3>
        <div style="display:flex;gap:1px;padding:8px;background:var(--bg-surface);border-radius:var(--radius)">${hourChart}</div>
      </div>
    </div>
  `;
}

// ============================================================
// FORENSICS: Relationship Analysis
// ============================================================

async function loadRelationships() {
  if (!currentProject) { toast('Select a project first'); return; }
  const statusEl = document.getElementById('relationships-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Analyzing...</span>';

  try {
    const data = await api(`/projects/${currentProject.id}/analytics/relationships`);
    statusEl.innerHTML = '';
    renderRelationships(data);
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Failed: ${esc(err.message)}</span>`;
  }
}

function renderRelationships(data) {
  const el = document.getElementById('relationships-results');
  const contacts = data.contacts || [];
  const pairs = data.pairs || [];

  if (contacts.length === 0) {
    el.innerHTML = '<div class="empty-state" style="height:200px"><h3>No contacts found</h3><p>Collect messages first.</p></div>';
    return;
  }

  const maxMsgs = Math.max(...contacts.slice(0, 20).map(c => c.totalMessages));

  const contactRows = contacts.slice(0, 20).map(c => {
    const pct = maxMsgs > 0 ? (c.totalMessages / maxMsgs * 100) : 0;
    const sentPct = c.totalMessages > 0 ? (c.sent / c.totalMessages * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="min-width:200px;max-width:200px;font-size:12px;font-family:var(--font-mono);color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.address)}">${esc(c.address)}</span>
      <div style="flex:1;height:20px;background:var(--bg-surface);border-radius:3px;overflow:hidden;display:flex">
        <div style="height:100%;background:var(--accent);width:${sentPct * pct / 100}%;min-width:${c.sent > 0 ? 1 : 0}px" title="${c.sent} sent"></div>
        <div style="height:100%;background:var(--success);width:${(100 - sentPct) * pct / 100}%;min-width:${c.received > 0 ? 1 : 0}px" title="${c.received} received"></div>
      </div>
      <span style="min-width:80px;text-align:right;font-size:11px;color:var(--text-muted)">${c.sent}s / ${c.received}r</span>
      <span style="min-width:35px;text-align:right;font-size:12px;font-weight:500;color:var(--text-primary)">${c.totalMessages}</span>
    </div>`;
  }).join('');

  const pairRows = pairs.slice(0, 30).map(p => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.source)}">${esc(p.source)}</td>
      <td style="text-align:center;color:var(--accent)">&#8596;</td>
      <td style="font-family:var(--font-mono);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.target)}">${esc(p.target)}</td>
      <td style="text-align:center;font-weight:600;color:var(--text-primary)">${p.count}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc((p.subjects || []).join(', '))}">${esc((p.subjects || [])[0] || '')}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Unique Contacts</div><div class="stat-value">${data.totalContacts}</div></div>
      <div class="stat-card"><div class="stat-label">Communication Pairs</div><div class="stat-value">${data.totalPairs}</div></div>
      <div class="stat-card"><div class="stat-label">Top Contact</div><div class="stat-value" style="font-size:13px;font-family:var(--font-mono)">${esc(contacts[0]?.address || 'N/A')}</div></div>
      <div class="stat-card"><div class="stat-label">Busiest Pair</div><div class="stat-value">${pairs[0]?.count || 0} msgs</div></div>
    </div>

    <h3 style="margin:20px 0 12px;font-size:14px">Top Contacts</h3>
    <div style="display:flex;gap:8px;margin-bottom:8px;font-size:11px;color:var(--text-muted)">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent)"></span>Sent</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--success)"></span>Received</span>
    </div>
    <div style="max-height:350px;overflow-y:auto">${contactRows}</div>

    <h3 style="margin:24px 0 12px;font-size:14px">Top Communication Pairs</h3>
    <table class="audit-table">
      <thead><tr><th>Contact A</th><th></th><th>Contact B</th><th>Count</th><th>Sample Subject</th></tr></thead>
      <tbody>${pairRows}</tbody>
    </table>
  `;
}

// ============================================================
// WIZARD LOGIC
// ============================================================

function wizGoToStep(step) {
  if (step < 1 || step > 9) return;
  wizStep = step;

  document.querySelectorAll('.wizard-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('completed', s < step);
  });

  document.querySelectorAll('.wizard-content').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`wiz-step-${step}`);
  if (target) target.classList.add('active');

  const backBtn = document.getElementById('wiz-btn-back');
  const nextBtn = document.getElementById('wiz-btn-next');
  backBtn.style.visibility = step === 1 ? 'hidden' : 'visible';

  if (step === 6) {
    nextBtn.style.display = 'none';
    backBtn.style.display = 'none';
  } else if (step === 9) {
    nextBtn.textContent = 'Finish';
    nextBtn.style.display = '';
    backBtn.style.display = '';
  } else {
    nextBtn.textContent = step === 5 ? 'Start Collection' : 'Next';
    nextBtn.style.display = '';
    backBtn.style.display = '';
  }

  document.getElementById('wiz-step-indicator').textContent = `Step ${step} of 9`;

  if (step === 5) wizBuildPreview();
}

function wizNext() {
  if (wizStep === 1) {
    const protocol = document.getElementById('wiz-protocol').value;
    const email = document.getElementById('wiz-email').value;
    if (!email) { toast('Email address is required'); return; }
    if ((protocol === 'imap' || protocol === 'pop3') && !document.getElementById('wiz-host').value) {
      toast('Server host is required for IMAP/POP3'); return;
    }
    wizSaveConnection();
  }

  if (wizStep === 5) {
    wizStartCollection();
    return;
  }

  if (wizStep === 9) {
    toast('Workflow complete');
    wizGoToStep(1);
    wizResetState();
    return;
  }

  wizGoToStep(wizStep + 1);
}

function wizBack() {
  if (wizStep === 7) { wizGoToStep(5); return; }
  wizGoToStep(wizStep - 1);
}

const PROVIDER_MAP = {
  'gmail.com': 'gmail', 'googlemail.com': 'gmail',
  'outlook.com': 'microsoft', 'hotmail.com': 'microsoft', 'live.com': 'microsoft', 'msn.com': 'microsoft',
  'zoho.com': 'zoho', 'zohomail.com': 'zoho', 'zohomail.eu': 'zoho', 'zohomail.in': 'zoho',
  'fastmail.com': 'fastmail', 'fastmail.fm': 'fastmail', 'messagingengine.com': 'fastmail',
  'yahoo.com': 'yahoo', 'ymail.com': 'yahoo', 'rocketmail.com': 'yahoo',
  'aol.com': 'aol', 'aim.com': 'aol',
  'icloud.com': 'icloud', 'me.com': 'icloud', 'mac.com': 'icloud',
  'protonmail.com': 'protonmail', 'proton.me': 'protonmail', 'pm.me': 'protonmail',
  'yandex.com': 'yandex', 'yandex.ru': 'yandex', 'ya.ru': 'yandex',
};

const PROVIDER_PROTOCOLS = {
  gmail:      { best: 'gmail_api', options: ['gmail_api', 'imap', 'pop3'] },
  microsoft:  { best: 'graph',    options: ['graph', 'ews', 'imap', 'pop3'] },
  zoho:       { best: 'zoho_api', options: ['zoho_api', 'imap', 'pop3'] },
  fastmail:   { best: 'jmap',     options: ['jmap', 'imap', 'pop3'] },
  yahoo:      { best: 'imap',     options: ['imap', 'pop3'] },
  aol:        { best: 'imap',     options: ['imap', 'pop3'] },
  icloud:     { best: 'imap',     options: ['imap'] },
  protonmail: { best: 'imap',     options: ['imap'] },
  yandex:     { best: 'imap',     options: ['imap', 'pop3'] },
  other:      { best: 'imap',     options: ['imap', 'pop3', 'ews', 'graph', 'gmail_api', 'zoho_api', 'jmap'] },
};

const PROVIDER_PRESETS = {
  gmail:      { imap: { host: 'imap.gmail.com', port: 993 }, pop3: { host: 'pop.gmail.com', port: 995 } },
  microsoft:  { imap: { host: 'outlook.office365.com', port: 993 }, pop3: { host: 'outlook.office365.com', port: 995 } },
  zoho:       { imap: { host: 'imap.zoho.com', port: 993 }, pop3: { host: 'pop.zoho.com', port: 995 } },
  fastmail:   { imap: { host: 'imap.fastmail.com', port: 993 }, pop3: { host: 'pop.fastmail.com', port: 995 } },
  yahoo:      { imap: { host: 'imap.mail.yahoo.com', port: 993 }, pop3: { host: 'pop.mail.yahoo.com', port: 995 } },
  aol:        { imap: { host: 'imap.aol.com', port: 993 }, pop3: { host: 'pop.aol.com', port: 995 } },
  icloud:     { imap: { host: 'imap.mail.me.com', port: 993 } },
  protonmail: { imap: { host: '127.0.0.1', port: 1143 } },
  yandex:     { imap: { host: 'imap.yandex.com', port: 993 }, pop3: { host: 'pop.yandex.com', port: 995 } },
};

const PROVIDER_NOTES = {
  gmail: 'Gmail API provides the most complete collection with label support and raw MIME download. Requires one-time Google Cloud OAuth setup.',
  microsoft: 'Graph API is the modern replacement for EWS. Free Azure AD app registration. Supports mail, OneDrive, SharePoint.',
  zoho: 'Zoho Mail API provides full REST access. Register at api-console.zoho.com (free). Select your region.',
  fastmail: 'JMAP is an open standard (RFC 8621). Generate an API token in Fastmail Settings > Privacy & Security > API tokens.',
  yahoo: 'No REST API available. Use IMAP with an app-specific password from Yahoo Account Security settings.',
  aol: 'No REST API available. Same infrastructure as Yahoo. Generate app-specific password in AOL settings.',
  icloud: 'No REST API. Requires an app-specific password from appleid.apple.com. POP3 not supported.',
  protonmail: 'Requires Proton Mail Bridge running locally (paid plans only). Bridge runs local IMAP on port 1143.',
  yandex: 'No public REST API. Use IMAP with app password from Yandex account settings.',
  other: 'Enter server details manually. IMAP is the most widely supported protocol for forensic collection.',
};

function wizAutoDetectProvider() {
  const email = document.getElementById('wiz-email').value.trim();
  const providerSelect = document.getElementById('wiz-provider');
  if (!email || !email.includes('@') || providerSelect.value) return;

  const domain = email.split('@')[1].toLowerCase();
  const provider = PROVIDER_MAP[domain] || 'other';
  providerSelect.value = provider;
  wizProviderChanged();
}

function wizProviderChanged() {
  const providerId = document.getElementById('wiz-provider').value || 'other';
  const protocolSelect = document.getElementById('wiz-protocol');
  const noteEl = document.getElementById('wiz-provider-note');

  const config = PROVIDER_PROTOCOLS[providerId] || PROVIDER_PROTOCOLS.other;

  const allOptions = protocolSelect.querySelectorAll('option');
  allOptions.forEach(opt => {
    opt.style.display = config.options.includes(opt.value) ? '' : 'none';
  });

  protocolSelect.value = config.best;

  if (PROVIDER_NOTES[providerId]) {
    noteEl.textContent = PROVIDER_NOTES[providerId];
    noteEl.style.display = '';
  } else {
    noteEl.style.display = 'none';
  }

  const preset = PROVIDER_PRESETS[providerId]?.[config.best];
  if (preset) {
    if (preset.host) document.getElementById('wiz-host').value = preset.host;
    if (preset.port) document.getElementById('wiz-port').value = preset.port;
  }

  wizUpdateProtocolFields();
}

function wizUpdateProtocolFields() {
  const protocol = document.getElementById('wiz-protocol').value;
  const fields = document.getElementById('wiz-protocol-fields');
  const gmailOAuth = document.getElementById('wiz-gmail-oauth');
  const msOAuth = document.getElementById('wiz-microsoft-oauth');
  const zohoOAuth = document.getElementById('wiz-zoho-oauth');
  const fmAuth = document.getElementById('wiz-fastmail-auth');

  const apiProtocols = ['ews', 'graph', 'gmail_api', 'zoho_api', 'jmap'];
  if (apiProtocols.includes(protocol)) {
    fields.style.display = 'none';
  } else {
    fields.style.display = '';
    const providerId = document.getElementById('wiz-provider').value;
    const preset = PROVIDER_PRESETS[providerId]?.[protocol];
    if (preset) {
      if (preset.host) document.getElementById('wiz-host').value = preset.host;
      if (preset.port) document.getElementById('wiz-port').value = preset.port;
    } else {
      const portInput = document.getElementById('wiz-port');
      if (protocol === 'pop3') portInput.value = 995;
      else portInput.value = 993;
    }
  }

  gmailOAuth.style.display = protocol === 'gmail_api' ? '' : 'none';
  msOAuth.style.display = protocol === 'graph' ? '' : 'none';
  zohoOAuth.style.display = protocol === 'zoho_api' ? '' : 'none';
  fmAuth.style.display = protocol === 'jmap' ? '' : 'none';

  if (protocol === 'gmail_api') gmailCheckStatus();
  if (protocol === 'graph') msCheckStatus();
  if (protocol === 'zoho_api') zohoCheckStatus();
  if (protocol === 'jmap') fmCheckStatus();
}

function wizSaveConnection() {
  const protocol = document.getElementById('wiz-protocol').value;
  const authMethod = document.getElementById('wiz-auth-method')?.value || 'password';
  const password = document.getElementById('wiz-password')?.value || '';

  wizConnection = {
    email: document.getElementById('wiz-email').value,
    protocol,
  };

  if (protocol === 'imap' || protocol === 'pop3') {
    wizConnection.host = document.getElementById('wiz-host').value;
    wizConnection.port = parseInt(document.getElementById('wiz-port').value) || 993;
    wizConnection.username = document.getElementById('wiz-username')?.value || undefined;
    wizConnection.tls = document.getElementById('wiz-tls')?.checked !== false;
    if (authMethod === 'app-password') {
      wizConnection.appPassword = password;
    } else {
      wizConnection.password = password;
    }
  }
}

function wizUpdateAuthLabel() {
  const method = document.getElementById('wiz-auth-method').value;
  const label = document.getElementById('wiz-pass-label');
  if (method === 'app-password') label.textContent = 'App-Specific Password';
  else if (method === 'oauth2') label.textContent = 'Access Token';
  else label.textContent = 'Password';
}

async function wizTestConnection() {
  wizSaveConnection();
  const el = document.getElementById('wiz-conn-status');
  el.innerHTML = '<span style="color:var(--accent)">Testing connection...</span>';

  try {
    const result = await api('/connect/test', { method: 'POST', body: { protocol: wizConnection.protocol, config: wizConnection } });
    if (result.success !== false && !result.error) {
      el.innerHTML = `<span class="verify-pass">Connection successful${result.folders ? ` (${result.folders.length} folders)` : ''}</span>`;
    } else {
      el.innerHTML = `<span class="verify-fail">Failed: ${esc(result.error || result.message || 'Unknown error')}</span>`;
    }
  } catch (err) {
    el.innerHTML = `<span class="verify-fail">Error: ${esc(err.message)}</span>`;
  }
}

async function wizDetectProvider() {
  const email = document.getElementById('wiz-email').value;
  if (!email) { toast('Enter an email address first'); return; }

  const el = document.getElementById('wiz-conn-status');
  el.innerHTML = '<span style="color:var(--accent)">Detecting provider...</span>';

  try {
    const result = await api('/detect-provider', { method: 'POST', body: { email } });
    if (result.profile?.imap) {
      document.getElementById('wiz-host').value = result.profile.imap.host || '';
      document.getElementById('wiz-port').value = result.profile.imap.port || 993;
      if (result.profile.requiresAppPassword) {
        document.getElementById('wiz-auth-method').value = 'app-password';
        wizUpdateAuthLabel();
      }
      el.innerHTML = `<span class="verify-pass">Detected: ${esc(result.profile.name)}</span>`;
    } else {
      el.innerHTML = '<span style="color:var(--warning)">Could not auto-detect provider</span>';
    }
  } catch {
    el.innerHTML = '<span class="verify-fail">Detection failed</span>';
  }
}

function wizBindFormatListeners() {
  document.querySelectorAll('input[name="wiz-format"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const pstChecked = document.querySelector('input[name="wiz-format"][value="pst"]')?.checked;
      const pstOpts = document.getElementById('wiz-pst-options');
      if (pstOpts) pstOpts.style.display = pstChecked ? 'block' : 'none';
    });
  });
}

async function wizLoadFolders() {
  wizSaveConnection();
  const el = document.getElementById('wiz-folders-list');
  el.innerHTML = '<div style="padding:20px;color:var(--accent)">Loading folders from server...</div>';

  try {
    const result = await api('/connect/test', { method: 'POST', body: { protocol: wizConnection.protocol, config: wizConnection } });
    const folders = result.folders || [];
    wizFolders = folders;

    if (!folders.length) {
      el.innerHTML = '<div class="empty-state" style="height:150px"><p>No folders found on the server.</p></div>';
      return;
    }

    el.innerHTML = folders.map(f => {
      const name = f.name || f.path || f;
      const path = f.path || f.name || f;
      const messages = f.messages || f.totalMessages || 0;
      return `
        <label class="wiz-folder-item">
          <input type="checkbox" class="wiz-folder-cb" data-path="${esc(path)}" checked>
          <span class="wiz-folder-name">${esc(name)}</span>
          <span class="wiz-folder-count">${messages} messages</span>
        </label>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<div style="padding:20px;color:var(--danger)">Failed to load folders: ${esc(err.message || 'Connection error')}</div>`;
  }
}

function wizSelectAllFolders() { document.querySelectorAll('.wiz-folder-cb').forEach(cb => cb.checked = true); }
function wizDeselectAllFolders() { document.querySelectorAll('.wiz-folder-cb').forEach(cb => cb.checked = false); }

function wizGetSelectedFolders() {
  return Array.from(document.querySelectorAll('.wiz-folder-cb:checked')).map(cb => cb.dataset.path);
}

function wizBuildPreview() {
  wizSelectedFolders = wizGetSelectedFolders();
  const formats = Array.from(document.querySelectorAll('input[name="wiz-format"]:checked')).map(cb => cb.value);
  const driveLinks = document.getElementById('wiz-collect-drive').checked;
  const modernAtt = document.getElementById('wiz-collect-modern').checked;
  const differential = document.getElementById('wiz-differential')?.checked;
  const outputDir = document.getElementById('wiz-output-dir').value || `./output/${currentProject?.id || 'unknown'}`;

  let totalMessages = 0;
  wizSelectedFolders.forEach(path => {
    const folder = wizFolders.find(f => (f.path || f.name || f) === path);
    if (folder) totalMessages += folder.messages || folder.totalMessages || 0;
  });

  const el = document.getElementById('wiz-preview-summary');
  el.innerHTML = `
    <div class="wiz-preview-card">
      <div class="wiz-preview-title">Project</div>
      <div class="wiz-preview-value">${esc(currentProject?.name || 'No project selected')}</div>
      <div class="wiz-preview-sub">${esc(currentProject?.target_email || '')}</div>
    </div>
    <div class="wiz-preview-card">
      <div class="wiz-preview-title">Protocol</div>
      <div class="wiz-preview-value">${(wizConnection.protocol || 'imap').toUpperCase()}</div>
      <div class="wiz-preview-sub">${esc(wizConnection.host || 'API-based')}${wizConnection.port ? ':' + wizConnection.port : ''}</div>
    </div>
    <div class="wiz-preview-card highlight">
      <div class="wiz-preview-title">Estimated Items</div>
      <div class="wiz-preview-value" style="font-size:32px;color:var(--accent)">${totalMessages.toLocaleString()}</div>
      <div class="wiz-preview-sub">${wizSelectedFolders.length} folder(s) selected</div>
    </div>
    <div class="wiz-preview-card">
      <div class="wiz-preview-title">Output Formats</div>
      <div class="wiz-preview-value">${formats.map(f => f.toUpperCase()).join(', ') || 'None'}</div>
      <div class="wiz-preview-sub">${driveLinks ? 'Drive links: ON' : 'Drive links: OFF'} | ${modernAtt ? 'Attachments: ON' : 'Attachments: OFF'}</div>
    </div>
    <div class="wiz-preview-card">
      <div class="wiz-preview-title">Options</div>
      <div class="wiz-preview-value" style="font-size:14px">${differential ? 'Differential (incremental)' : 'Full collection'}</div>
    </div>
    <div class="wiz-preview-card">
      <div class="wiz-preview-title">Output Location</div>
      <div class="wiz-preview-value" style="font-size:13px;font-family:var(--font-mono);word-break:break-all">${esc(outputDir)}</div>
    </div>
  `;
}

async function wizStartCollection() {
  if (!currentProject) { toast('Select a project first'); return; }

  wizSaveConnection();
  wizSelectedFolders = wizGetSelectedFolders();
  wizOutputDir = document.getElementById('wiz-output-dir').value || '';
  const differential = document.getElementById('wiz-differential')?.checked || false;

  wizGoToStep(6);

  try {
    const result = await api(`/projects/${currentProject.id}/collect`, {
      method: 'POST',
      body: {
        folders: wizSelectedFolders.length > 0 ? wizSelectedFolders : undefined,
        config: wizConnection,
        differential,
      }
    });

    document.getElementById('wiz-progress-fill').style.width = '100%';
    document.getElementById('wiz-progress-fill').classList.add('complete');
    document.getElementById('wiz-progress-label').textContent = 'Collection complete!';
    document.getElementById('wiz-progress-stats').innerHTML = `
      <div class="wiz-stat"><span>Acquired</span><strong>${result.messageCount}</strong></div>
      <div class="wiz-stat"><span>Skipped</span><strong>${result.skippedCount || 0}</strong></div>
      <div class="wiz-stat"><span>Size</span><strong>${formatBytes(result.totalBytes)}</strong></div>
    `;

    setTimeout(() => {
      wizShowResults(result);
      wizGoToStep(7);
      loadMessages();
      loadFolders();
      loadSystemInfo();
    }, 1500);
  } catch (err) {
    document.getElementById('wiz-progress-label').innerHTML =
      `<span class="verify-fail">Failed to collect: ${esc(err.message)}</span>`;
  }
}

function wizShowResults(result) {
  const el = document.getElementById('wiz-results-content');

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Messages Acquired</div><div class="stat-value">${result.messageCount}</div></div>
      <div class="stat-card"><div class="stat-label">Skipped</div><div class="stat-value">${result.skippedCount || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Total Size</div><div class="stat-value" style="font-size:20px">${formatBytes(result.totalBytes)}</div></div>
      <div class="stat-card"><div class="stat-label">Differential</div><div class="stat-value" style="font-size:16px">${result.differential ? 'YES' : 'NO'}</div></div>
    </div>
    ${result.timestamp ? `
      <div style="margin-top:16px;padding:12px;background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius)">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">RFC 3161 Timestamp</div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-top:4px">${esc(result.timestamp)}</div>
      </div>
    ` : ''}
  `;

  const srcDir = wizOutputDir || `./output/${currentProject?.id || ''}`;
  const transferSrc = document.getElementById('wiz-transfer-source');
  if (transferSrc) transferSrc.value = srcDir;

  const errEl = document.getElementById('wiz-results-errors');
  errEl.innerHTML = '<p style="color:var(--success);font-weight:600">Collection completed successfully.</p>';
}

async function wizRunQC() {
  if (!currentProject) { toast('No project selected'); return; }
  const statusEl = document.getElementById('wiz-qc-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Running QC checks...</span>';

  try {
    const results = await api(`/projects/${currentProject.id}/qc`, { method: 'POST' });
    statusEl.innerHTML = '';
    renderQCResults(results, 'wiz-qc-results');
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">QC failed: ${esc(err.message || 'Unknown error')}</span>`;
  }
}

async function wizExport() {
  if (!currentProject) { toast('Select a project first'); return; }
  const format = document.getElementById('wiz-export-format').value;
  const statusEl = document.getElementById('wiz-export-status');
  statusEl.innerHTML = '<span style="color:var(--accent)">Exporting...</span>';

  try {
    const result = await api(`/projects/${currentProject.id}/export`, { method: 'POST', body: { format } });
    statusEl.innerHTML = '<span class="verify-pass">Export complete</span>';
    const el = document.getElementById('wiz-export-result');
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-label">Format</div><div class="stat-value" style="font-size:18px">${result.format?.toUpperCase()}</div></div>
        <div class="stat-card"><div class="stat-label">Files</div><div class="stat-value">${result.files?.length || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Size</div><div class="stat-value" style="font-size:18px">${formatBytes(result.totalBytes)}</div></div>
      </div>`;
    loadSystemInfo();
  } catch (err) {
    statusEl.innerHTML = `<span class="verify-fail">Export failed: ${esc(err.message)}</span>`;
  }
}

async function wizTransfer() {
  const dest = document.getElementById('wiz-transfer-dest').value;
  if (!dest) { toast('Enter a destination directory'); return; }

  const statusEl = document.getElementById('wiz-transfer-status');
  statusEl.innerHTML = '<span style="color:var(--warning)">Transfer is a local operation — use OS file copy tools for production transfers.</span>';
}

function wizResetState() {
  wizCollectionId = null;
  wizFolders = [];
  wizSelectedFolders = [];
  wizOutputDir = '';
  if (wizProgressTimer) { clearInterval(wizProgressTimer); wizProgressTimer = null; }
  const fill = document.getElementById('wiz-progress-fill');
  if (fill) { fill.style.width = '0%'; fill.classList.remove('complete'); }
}

// --- Guide ---
function guideScroll(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function guideSearch(query) {
  const resultsDiv = document.getElementById('guide-search-results');
  const container = document.querySelector('.guide-container');
  const sections = container.querySelectorAll('.guide-section');
  const toc = container.querySelector('.guide-toc');

  container.querySelectorAll('.guide-search-highlight').forEach(el => {
    el.replaceWith(el.textContent);
  });
  sections.forEach(s => s.style.display = '');

  if (!query || query.trim().length < 2) {
    resultsDiv.style.display = 'none';
    if (toc) toc.style.display = '';
    return;
  }

  const term = query.trim().toLowerCase();
  const matches = [];

  sections.forEach(sec => {
    const text = sec.textContent.toLowerCase();
    if (text.includes(term)) {
      matches.push(sec);
      sec.style.display = '';
      highlightText(sec, query.trim());
    } else {
      sec.style.display = 'none';
    }
  });

  if (toc) toc.style.display = matches.length < sections.length ? 'none' : '';

  if (matches.length === 0) {
    resultsDiv.innerHTML = `No results for "<strong>${escapeHtml(query)}</strong>"`;
    resultsDiv.style.display = 'block';
  } else {
    resultsDiv.innerHTML = `${matches.length} section${matches.length !== 1 ? 's' : ''} matching "<strong>${escapeHtml(query)}</strong>"`;
    resultsDiv.style.display = 'block';
  }
}

function highlightText(node, term) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  textNodes.forEach(tn => {
    if (regex.test(tn.textContent)) {
      const span = document.createElement('span');
      span.innerHTML = tn.textContent.replace(regex, '<mark class="guide-search-highlight" style="background:#fbbf24;color:#000;padding:0 2px;border-radius:2px">$1</mark>');
      tn.replaceWith(span);
    }
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Utilities ---
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

function extractName(address) {
  if (!address) return '';
  const match = address.match(/^"?(.+?)"?\s*<.+>$/);
  return match ? match[1] : address.split('@')[0];
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// --- Gmail OAuth ---
async function gmailCheckStatus() {
  const el = document.getElementById('gmail-oauth-status');
  try {
    const status = await api('/oauth/google/status');
    if (!status.configured) {
      el.innerHTML = '<span style="color:var(--warning)">Not configured — upload client_secret JSON below</span>';
    } else if (!status.authorized) {
      el.innerHTML = '<span style="color:var(--warning)">Credentials loaded. Click "Authorize with Google" to connect.</span>';
    } else {
      el.innerHTML = '<span class="verify-pass">Authorized with Google</span>';
    }
  } catch {
    el.innerHTML = '<span class="verify-fail">Could not check OAuth status</span>';
  }
}

async function gmailAuthorize() {
  const el = document.getElementById('gmail-oauth-status');
  el.innerHTML = '<span style="color:var(--accent)">Opening Google authorization...</span>';

  try {
    const { url } = await api('/oauth/google/authorize');
    if (!url) { el.innerHTML = '<span class="verify-fail">Upload credentials first</span>'; return; }

    window.open(url, '_blank');
    el.innerHTML = '<span style="color:var(--accent)">Waiting for authorization in browser...</span>';

    const result = await api('/oauth/google/wait');
    if (result.success) {
      el.innerHTML = '<span class="verify-pass">Authorized with Google</span>';
      toast('Google account authorized successfully');
    } else {
      el.innerHTML = `<span class="verify-fail">Authorization failed: ${esc(result.error || 'Unknown')}</span>`;
    }
  } catch (err) {
    el.innerHTML = `<span class="verify-fail">Error: ${esc(err.message)}</span>`;
  }
}

async function gmailRevoke() {
  try {
    await api('/oauth/google/revoke', { method: 'POST' });
    toast('Google access revoked');
    gmailCheckStatus();
  } catch (err) {
    toast('Failed to revoke: ' + err.message);
  }
}

async function gmailUploadCredentials(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);
    await api('/oauth/google/credentials', { method: 'POST', body: json });
    toast('Google credentials uploaded');
    gmailCheckStatus();
  } catch (err) {
    toast('Failed to upload credentials: ' + err.message);
  }
  input.value = '';
}

// --- Microsoft OAuth ---
async function msCheckStatus() {
  const el = document.getElementById('ms-oauth-status');
  try {
    const status = await api('/oauth/microsoft/status');
    if (!status.configured) {
      el.innerHTML = '<span style="color:var(--warning)">Not configured — enter Client ID and Secret below</span>';
    } else if (!status.authorized) {
      el.innerHTML = '<span style="color:var(--warning)">Credentials saved. Click "Authorize with Microsoft" to connect.</span>';
    } else {
      el.innerHTML = '<span class="verify-pass">Authorized with Microsoft</span>';
    }
  } catch {
    el.innerHTML = '<span class="verify-fail">Could not check OAuth status</span>';
  }
}

async function msAuthorize() {
  const el = document.getElementById('ms-oauth-status');
  el.innerHTML = '<span style="color:var(--accent)">Opening Microsoft authorization...</span>';

  try {
    const { url } = await api('/oauth/microsoft/authorize');
    if (!url) { el.innerHTML = '<span class="verify-fail">Save credentials first</span>'; return; }

    window.open(url, '_blank');
    el.innerHTML = '<span style="color:var(--accent)">Waiting for authorization in browser...</span>';

    const result = await api('/oauth/microsoft/wait');
    if (result.success) {
      el.innerHTML = '<span class="verify-pass">Authorized with Microsoft</span>';
      toast('Microsoft account authorized successfully');
    } else {
      el.innerHTML = `<span class="verify-fail">Authorization failed: ${esc(result.error || 'Unknown')}</span>`;
    }
  } catch (err) {
    el.innerHTML = `<span class="verify-fail">Error: ${esc(err.message)}</span>`;
  }
}

async function msRevoke() {
  try {
    await api('/oauth/microsoft/revoke', { method: 'POST' });
    toast('Microsoft access revoked');
    msCheckStatus();
  } catch (err) {
    toast('Failed to revoke: ' + err.message);
  }
}

async function msSaveCredentials() {
  const clientId = document.getElementById('ms-client-id').value.trim();
  const clientSecret = document.getElementById('ms-client-secret').value.trim();
  if (!clientId || !clientSecret) { toast('Enter both Client ID and Client Secret'); return; }

  try {
    await api('/oauth/microsoft/credentials', {
      method: 'POST',
      body: { client_id: clientId, client_secret: clientSecret },
    });
    toast('Microsoft credentials saved');
    msCheckStatus();
  } catch (err) {
    toast('Failed to save credentials: ' + err.message);
  }
}

// --- Zoho OAuth ---
async function zohoCheckStatus() {
  const el = document.getElementById('zoho-oauth-status');
  try {
    const status = await api('/oauth/zoho/status');
    if (!status.configured) {
      el.innerHTML = '<span style="color:var(--warning)">Not configured — enter Client ID and Secret below</span>';
    } else if (!status.authorized) {
      el.innerHTML = '<span style="color:var(--warning)">Credentials saved. Click "Authorize with Zoho" to connect.</span>';
    } else {
      el.innerHTML = '<span class="verify-pass">Authorized with Zoho</span>';
    }
  } catch {
    el.innerHTML = '<span class="verify-fail">Could not check OAuth status</span>';
  }
}

async function zohoAuthorize() {
  const el = document.getElementById('zoho-oauth-status');
  el.innerHTML = '<span style="color:var(--accent)">Opening Zoho authorization...</span>';

  try {
    const { url } = await api('/oauth/zoho/authorize');
    if (!url) { el.innerHTML = '<span class="verify-fail">Save credentials first</span>'; return; }

    window.open(url, '_blank');
    el.innerHTML = '<span style="color:var(--accent)">Waiting for authorization in browser...</span>';

    const result = await api('/oauth/zoho/wait');
    if (result.success) {
      el.innerHTML = '<span class="verify-pass">Authorized with Zoho</span>';
      toast('Zoho account authorized successfully');
    } else {
      el.innerHTML = `<span class="verify-fail">Authorization failed: ${esc(result.error || 'Unknown')}</span>`;
    }
  } catch (err) {
    el.innerHTML = `<span class="verify-fail">Error: ${esc(err.message)}</span>`;
  }
}

async function zohoRevoke() {
  try {
    await api('/oauth/zoho/revoke', { method: 'POST' });
    toast('Zoho access revoked');
    zohoCheckStatus();
  } catch (err) {
    toast('Failed to revoke: ' + err.message);
  }
}

async function zohoSaveCredentials() {
  const clientId = document.getElementById('zoho-client-id').value.trim();
  const clientSecret = document.getElementById('zoho-client-secret').value.trim();
  const region = document.getElementById('zoho-region').value;
  if (!clientId || !clientSecret) { toast('Enter both Client ID and Client Secret'); return; }

  try {
    await api('/oauth/zoho/credentials', {
      method: 'POST',
      body: { client_id: clientId, client_secret: clientSecret, region },
    });
    toast('Zoho credentials saved');
    zohoCheckStatus();
  } catch (err) {
    toast('Failed to save credentials: ' + err.message);
  }
}

// --- Fastmail Auth ---
async function fmCheckStatus() {
  const el = document.getElementById('fm-auth-status');
  try {
    const status = await api('/oauth/fastmail/status');
    if (!status.configured) {
      el.innerHTML = '<span style="color:var(--warning)">No API token configured — enter your token below</span>';
    } else {
      el.innerHTML = `<span class="verify-pass">API token configured (${esc(status.tokenPrefix)})</span>`;
    }
  } catch {
    el.innerHTML = '<span class="verify-fail">Could not check auth status</span>';
  }
}

async function fmSaveToken() {
  const token = document.getElementById('fm-api-token').value.trim();
  if (!token) { toast('Enter your Fastmail API token'); return; }

  try {
    await api('/oauth/fastmail/credentials', {
      method: 'POST',
      body: { api_token: token },
    });
    toast('Fastmail API token saved');
    document.getElementById('fm-api-token').value = '';
    fmCheckStatus();
  } catch (err) {
    toast('Failed to save token: ' + err.message);
  }
}

async function fmRevoke() {
  try {
    await api('/oauth/fastmail/revoke', { method: 'POST' });
    toast('Fastmail token removed');
    fmCheckStatus();
  } catch (err) {
    toast('Failed to remove: ' + err.message);
  }
}
