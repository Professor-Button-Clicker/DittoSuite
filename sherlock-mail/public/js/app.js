const API = '/api';
let currentPage = 'dashboard';
let currentProject = null;

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    currentPage = item.dataset.page;
    document.getElementById('page-title').textContent = item.textContent.trim();
    renderPage();
  });
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.page === page);
    if (i.dataset.page === page) {
      document.getElementById('page-title').textContent = i.textContent.trim();
    }
  });
  renderPage();
}

async function renderPage() {
  const content = document.getElementById('content');
  try {
    switch (currentPage) {
      case 'dashboard': await renderDashboard(content); break;
      case 'protocols': await renderProtocols(content); break;
      case 'formats': await renderFormats(content); break;
      case 'projects': await renderProjects(content); break;
      case 'connect': await renderConnect(content); break;
      case 'search': await renderSearch(content); break;
      case 'inline': await renderInlineSearch(content); break;
      case 'export': await renderExport(content); break;
      case 'qc': await renderQC(content); break;
      case 'cloud': await renderCloudAttachments(content); break;
      case 'timestamps': await renderTimestamps(content); break;
      case 'audit': await renderAudit(content); break;
      case 'integrity': await renderIntegrity(content); break;
      default: content.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
    }
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
  }
}

// ── Dashboard ──
async function renderDashboard(el) {
  const stats = await api('/stats');
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-label">Projects</div><div class="stat-value">${stats.projects}</div></div>
      <div class="stat-card success"><div class="stat-label">Messages Collected</div><div class="stat-value">${stats.messages}</div></div>
      <div class="stat-card warning"><div class="stat-label">Acquisitions</div><div class="stat-value">${stats.acquisitions}</div></div>
      <div class="stat-card purple"><div class="stat-label">Exports</div><div class="stat-value">${stats.exports}</div></div>
      <div class="stat-card info"><div class="stat-label">Audit Entries</div><div class="stat-value">${stats.auditEntries}</div></div>
    </div>
    <div class="card">
      <div class="card-header"><div><div class="card-title">SherlockMail 2.0 — FEC-Grade Forensic Email Collection</div><div class="card-subtitle">Comprehensive forensic acquisition with inline search, quality control, cloud detection & trusted timestamps</div></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card" style="margin:0"><h4 style="font-size:13px;margin-bottom:8px;color:var(--accent)">1. Create Project & Connect</h4><p style="font-size:12px;color:var(--text-secondary)">Create a case project with legal authority. Connect via IMAP, POP3, EWS, Graph, or Gmail API. Supports differential/incremental collection.</p></div>
        <div class="card" style="margin:0"><h4 style="font-size:13px;margin-bottom:8px;color:var(--success)">2. Query & Collect</h4><p style="font-size:12px;color:var(--text-secondary)">Server-side in-place search (IMAP SEARCH, KQL, $search, Gmail q=) plus client-side inline search with boolean, regex, proximity & fuzzy matching.</p></div>
        <div class="card" style="margin:0"><h4 style="font-size:13px;margin-bottom:8px;color:var(--warning)">3. Export & Timestamp</h4><p style="font-size:12px;color:var(--text-secondary)">Export to EML, MSG, PST (with size-based splitting), MBOX, or MIME. Each export gets an RFC 3161 timestamp and SHA-256 hash manifest.</p></div>
        <div class="card" style="margin:0"><h4 style="font-size:13px;margin-bottom:8px;color:var(--purple)">4. Verify & QC</h4><p style="font-size:12px;color:var(--text-secondary)">Quality control checks (9 categories), cloud attachment detection, evidence integrity verification, and tamper-evident audit chain per NIST SP 800-86.</p></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Quick Actions</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="navigateTo('projects')">Manage Projects</button>
        <button class="btn btn-secondary" onclick="navigateTo('connect')">Connect & Collect</button>
        <button class="btn btn-secondary" onclick="navigateTo('inline')">Inline Search</button>
        <button class="btn btn-secondary" onclick="navigateTo('export')">Export Evidence</button>
        <button class="btn btn-secondary" onclick="navigateTo('qc')">Quality Control</button>
        <button class="btn btn-secondary" onclick="navigateTo('cloud')">Cloud Attachments</button>
        <button class="btn btn-secondary" onclick="navigateTo('timestamps')">Timestamps</button>
        <button class="btn btn-secondary" onclick="navigateTo('integrity')">Verify Integrity</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">v2.0 Capabilities (FEC-Grade)</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:12px">
        <div><div style="color:var(--accent);font-weight:600;margin-bottom:4px">5 Protocols</div><div style="color:var(--text-secondary)">IMAP (real), POP3 (real), EWS, Graph API, Gmail API</div></div>
        <div><div style="color:var(--success);font-weight:600;margin-bottom:4px">Inline Search</div><div style="color:var(--text-secondary)">Boolean, regex, wildcards, proximity, fuzzy, field-specific</div></div>
        <div><div style="color:var(--warning);font-weight:600;margin-bottom:4px">Differential Collection</div><div style="color:var(--text-secondary)">Skip previously collected messages via hash/Message-ID matching</div></div>
        <div><div style="color:var(--purple);font-weight:600;margin-bottom:4px">Cloud Detection</div><div style="color:var(--text-secondary)">Google Drive, OneDrive, SharePoint, Dropbox, Box link scanning</div></div>
        <div><div style="color:var(--info);font-weight:600;margin-bottom:4px">RFC 3161 Timestamps</div><div style="color:var(--text-secondary)">Trusted timestamping for collections and exports</div></div>
        <div><div style="color:var(--danger);font-weight:600;margin-bottom:4px">Quality Control</div><div style="color:var(--text-secondary)">9 automated checks: hashes, duplicates, dates, encryption, coverage</div></div>
      </div>
    </div>`;
}

// ── Protocols ──
async function renderProtocols(el) {
  const protocols = await api('/protocols');
  el.innerHTML = `
    <div class="card"><div class="card-header"><div><div class="card-title">Email Collection Protocols</div><div class="card-subtitle">How SherlockMail connects to different email providers</div></div></div></div>
    <div class="protocol-grid">
      ${Object.entries(protocols).map(([key, p]) => `
        <div class="protocol-card" onclick="showProtocolDetail('${key}')">
          <h3>${p.name}</h3>
          <div class="port">Port: ${typeof p.port === 'object' ? `${p.port.secure} (TLS) / ${p.port.plain || 'N/A'}` : p.port?.secure || 443}</div>
          <p>${p.description}</p>
          ${p.rfc ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${p.rfc}</div>` : ''}
          <div style="margin-top:8px">${(p.forensicNotes || []).slice(0, 2).map(n => `<div class="forensic-note">${n}</div>`).join('')}</div>
          <div style="margin-top:12px"><span class="btn btn-sm btn-secondary">View Details</span></div>
        </div>`).join('')}
    </div>`;
}

async function showProtocolDetail(key) {
  const protocols = await api('/protocols');
  const p = protocols[key];
  const presets = p.presets ? `<h4 style="margin:12px 0 8px;font-size:13px">Provider Presets</h4><table><tr><th>Provider</th><th>Host</th><th>Port</th><th>Notes</th></tr>${Object.entries(p.presets).map(([name, preset]) => `<tr><td>${name}</td><td><code>${preset.host || '-'}</code></td><td>${preset.port || 993}</td><td>${preset.note || '-'}</td></tr>`).join('')}</table>` : '';
  const capabilities = p.capabilities ? `<h4 style="margin:12px 0 8px;font-size:13px">Authentication</h4><ul style="font-size:12px;padding-left:20px;color:var(--text-secondary)">${p.capabilities.authentication.map(a => `<li>${a}</li>`).join('')}</ul><h4 style="margin:12px 0 8px;font-size:13px">Features</h4><ul style="font-size:12px;padding-left:20px;color:var(--text-secondary)">${p.capabilities.features.map(f => `<li>${f}</li>`).join('')}</ul><h4 style="margin:12px 0 8px;font-size:13px">Search Operators</h4><div style="display:flex;flex-wrap:wrap;gap:4px">${p.capabilities.searchOperators.map(o => `<code style="font-size:11px;padding:2px 6px;background:var(--bg-input);border-radius:3px">${o}</code>`).join('')}</div>` : '';
  showModal(`<div class="modal-header"><h3>${p.name}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div><p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${p.description}</p>${p.rfc ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Standard: ${p.rfc}</div>` : ''}<h4 style="margin:12px 0 8px;font-size:13px">Forensic Notes</h4>${(p.forensicNotes || []).map(n => `<div class="forensic-note">${n}</div>`).join('')}${presets}${capabilities}`);
}

// ── Export Formats ──
async function renderFormats(el) {
  const formats = await api('/export/formats');
  el.innerHTML = `
    <div class="card"><div class="card-header"><div><div class="card-title">Export Formats</div><div class="card-subtitle">How collected emails are exported for analysis and court presentation</div></div></div></div>
    ${Object.entries(formats).map(([key, f]) => `
      <div class="format-card">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><h3>${f.name} <span class="ext">${f.extension}</span></h3><div style="font-size:11px;color:var(--text-muted)">${f.mimeType}</div></div>
          <span class="badge-status badge-${f.forensicValue === 'HIGH' ? 'high' : 'medium'}">${f.forensicValue} forensic value</span>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);margin:12px 0">${f.description}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div><div style="font-size:12px;font-weight:600;color:var(--success);margin-bottom:4px">Preserves</div><ul class="preserves-list">${f.preserves.map(p => `<li>${p}</li>`).join('')}</ul></div>
          <div><div style="font-size:12px;font-weight:600;color:var(--warning);margin-bottom:4px">Limitations</div><ul class="limitations-list">${f.limitations.map(l => `<li>${l}</li>`).join('')}</ul></div>
        </div>
        ${f.usedBy ? `<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Used by: ${f.usedBy.join(', ')}</div>` : ''}
      </div>`).join('')}`;
}

// ── Projects ──
async function renderProjects(el) {
  const projects = await api('/projects');
  if (projects.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="icon">&#9733;</div><h3>No Projects Yet</h3><p>Create a forensic email collection project to get started.</p><button class="btn btn-primary" style="margin-top:16px" onclick="showNewProjectModal()">New Project</button></div>`;
    return;
  }
  el.innerHTML = `
    <div class="section-header"><div class="section-title">Projects (${projects.length})</div><button class="btn btn-primary" onclick="showNewProjectModal()">New Project</button></div>
    <div class="table-container"><table>
      <tr><th>Case</th><th>Target</th><th>Protocol</th><th>Status</th><th>Created</th><th>Actions</th></tr>
      ${projects.map(p => `<tr>
        <td><div style="font-weight:500">${esc(p.name)}</div><div style="font-size:11px;color:var(--text-muted)">${esc(p.case_name || '')} ${p.case_id ? `(${esc(p.case_id)})` : ''}</div></td>
        <td>${esc(p.target_email)}</td>
        <td><code style="font-size:11px">${fmtProto(p.provider_type)}</code></td>
        <td><span class="badge-status badge-${p.status}">${p.status}</span></td>
        <td style="font-size:12px;color:var(--text-muted)">${new Date(p.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="viewProject('${p.id}')">View</button>
          <button class="btn btn-sm btn-primary" onclick="startCollection('${p.id}')">Collect</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProjectConfirm('${p.id}', '${esc(p.name)}')">Delete</button>
        </td>
      </tr>`).join('')}
    </table></div>`;
}

function showNewProjectModal() {
  showModal(`
    <div class="modal-header"><h3>New Collection Project</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <form onsubmit="createProject(event)">
      <div class="form-group"><label class="form-label">Project Name</label><input class="form-input" name="name" required placeholder="e.g., Case 2024 Email Preservation"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Target Email</label><input class="form-input" name="targetEmail" type="email" required placeholder="user@example.com"></div>
        <div class="form-group"><label class="form-label">Protocol</label><select class="form-select" name="providerType" required><option value="imap">IMAP</option><option value="pop3">POP3</option><option value="ews">EWS (Exchange)</option><option value="graph">Microsoft Graph</option><option value="gmail_api">Gmail API</option></select></div>
      </div>
      <div class="form-row"><div class="form-group"><label class="form-label">Case Name</label><input class="form-input" name="caseName" placeholder="e.g., State v. Doe"></div><div class="form-group"><label class="form-label">Case ID</label><input class="form-input" name="caseId" placeholder="e.g., 2024-CR-1234"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Examiner Name</label><input class="form-input" name="examinerName" placeholder="e.g., Jane Smith"></div><div class="form-group"><label class="form-label">Agency</label><input class="form-input" name="agency" placeholder="e.g., Digital Forensics Lab"></div></div>
      <div class="form-group"><label class="form-label">Legal Authority</label><input class="form-input" name="legalAuthority" placeholder="e.g., Search Warrant #2024-SW-456"></div>
      <div class="form-group"><label class="form-label">Scope of Authority</label><textarea class="form-textarea" name="legalScope" placeholder="e.g., All email between Jan 1 - Dec 31, 2024"></textarea></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Create Project</button></div>
    </form>`);
}

async function createProject(e) {
  e.preventDefault();
  const f = e.target;
  await api('/projects', { method: 'POST', body: {
    name: f.name.value, targetEmail: f.targetEmail.value, providerType: f.providerType.value,
    caseName: f.caseName.value, caseId: f.caseId.value, examinerName: f.examinerName.value,
    agency: f.agency.value, legalAuthority: f.legalAuthority.value, legalScope: f.legalScope.value,
  }});
  closeModal();
  toast('Project created', 'success');
  renderPage();
}

async function deleteProjectConfirm(id, name) {
  if (confirm(`Delete project "${name}"? This cannot be undone.`)) {
    await api(`/projects/${id}`, { method: 'DELETE' });
    toast('Project deleted', 'info');
    renderPage();
  }
}

async function viewProject(id) {
  currentProject = await api(`/projects/${id}`);
  const messages = await api(`/projects/${id}/messages?limit=20`);
  const folders = await api(`/projects/${id}/folders`);
  const exports = await api(`/projects/${id}/exports`);

  showModal(`
    <div class="modal-header"><h3>${esc(currentProject.name)}</h3><button class="modal-close" onclick="closeModal()">&times;</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div><span style="font-size:11px;color:var(--text-muted)">TARGET:</span> ${esc(currentProject.target_email)}</div>
      <div><span style="font-size:11px;color:var(--text-muted)">PROTOCOL:</span> <code>${fmtProto(currentProject.provider_type)}</code></div>
      <div><span style="font-size:11px;color:var(--text-muted)">CASE:</span> ${esc(currentProject.case_name || 'N/A')} ${currentProject.case_id ? `(${esc(currentProject.case_id)})` : ''}</div>
      <div><span style="font-size:11px;color:var(--text-muted)">STATUS:</span> <span class="badge-status badge-${currentProject.status}">${currentProject.status}</span></div>
      <div><span style="font-size:11px;color:var(--text-muted)">EXAMINER:</span> ${esc(currentProject.examiner_name || 'N/A')}</div>
      <div><span style="font-size:11px;color:var(--text-muted)">AGENCY:</span> ${esc(currentProject.agency || 'N/A')}</div>
    </div>
    ${currentProject.legal_authority ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px"><strong>Legal Authority:</strong> ${esc(currentProject.legal_authority)}</div>` : ''}
    ${currentProject.legal_scope ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px"><strong>Scope:</strong> ${esc(currentProject.legal_scope)}</div>` : ''}

    ${folders.length > 0 ? `<h4 style="font-size:13px;margin-bottom:8px">Folders (${folders.length})</h4><div class="table-container" style="max-height:150px;overflow-y:auto"><table><tr><th>Path</th><th>Messages</th><th>Unseen</th></tr>${folders.map(f => `<tr><td>${esc(f.path)}</td><td>${f.total_messages || 0}</td><td>${f.unseen_messages || 0}</td></tr>`).join('')}</table></div>` : ''}

    <h4 style="font-size:13px;margin:16px 0 8px">Messages (${messages.total})</h4>
    ${messages.messages.length > 0 ? `
      <div class="table-container" style="max-height:250px;overflow-y:auto"><table>
        <tr><th>Subject</th><th>From</th><th>Date</th><th>SHA-256</th></tr>
        ${messages.messages.map(m => `<tr>
          <td>${esc(m.subject || '(no subject)')}</td>
          <td style="font-size:12px">${esc(m.from_address || '')}</td>
          <td style="font-size:12px">${m.date ? new Date(m.date).toLocaleString() : ''}</td>
          <td><span class="hash-value">${(m.hash_sha256 || '').substring(0, 16)}...</span></td>
        </tr>`).join('')}
      </table></div>
    ` : '<div style="font-size:13px;color:var(--text-muted)">No messages collected yet.</div>'}

    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="closeModal();startCollection('${id}')">Collect</button>
      <button class="btn btn-secondary" onclick="closeModal();navigateTo('inline')">Inline Search</button>
      <button class="btn btn-secondary" onclick="closeModal();navigateTo('export')">Export</button>
      <button class="btn btn-secondary" onclick="closeModal();navigateTo('qc')">QC Check</button>
      <button class="btn btn-secondary" onclick="closeModal();navigateTo('integrity')">Verify</button>
    </div>`);
}

// ── Connect & Collect ──
async function renderConnect(el) {
  const projects = await api('/projects');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Connect & Collect</div><div class="card-subtitle">Connect to email servers and collect messages with forensic integrity</div></div></div>
      <div class="form-group">
        <label class="form-label">Select Project</label>
        <select class="form-select" id="collect-project" onchange="onCollectProjectChange()">
          <option value="">-- Select a project --</option>
          ${projects.map(p => `<option value="${p.id}" data-provider="${p.provider_type}" data-email="${p.target_email}">${esc(p.name)} (${fmtProto(p.provider_type)})</option>`).join('')}
        </select>
      </div>
      <div id="collect-config" style="display:none"></div>
    </div>
    <div class="card" id="collect-result" style="display:none">
      <div class="card-header"><div class="card-title">Collection Result</div></div>
      <div id="collect-result-content"></div>
    </div>
    <div class="card" id="protocol-log-section" style="display:none">
      <div class="card-header"><div class="card-title">Protocol Log (Chain of Custody)</div></div>
      <div class="protocol-log" id="protocol-log"></div>
    </div>`;
}

function onCollectProjectChange() {
  const sel = document.getElementById('collect-project');
  const opt = sel.selectedOptions[0];
  if (!opt?.value) {
    document.getElementById('collect-config').style.display = 'none';
    return;
  }
  const provider = opt.dataset.provider;
  const email = opt.dataset.email;
  const container = document.getElementById('collect-config');
  container.style.display = 'block';

  if (provider === 'imap') {
    container.innerHTML = `
      <div style="margin-bottom:12px;font-size:12px;color:var(--info);padding:8px 12px;background:rgba(6,182,212,0.1);border-radius:6px">IMAP: Real connection - enter server credentials to connect and collect.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Host</label><input class="form-input" id="cc-host" placeholder="imap.gmail.com"></div>
        <div class="form-group"><label class="form-label">Port</label><input class="form-input" id="cc-port" type="number" value="993"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Username</label><input class="form-input" id="cc-username" value="${esc(email)}"></div>
        <div class="form-group"><label class="form-label">Password / App Password</label><input class="form-input" id="cc-password" type="password"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span style="font-size:11px;color:var(--text-muted)">Presets:</span>
        <button class="btn btn-sm btn-secondary" onclick="setPreset('imap.gmail.com',993)">Gmail</button>
        <button class="btn btn-sm btn-secondary" onclick="setPreset('outlook.office365.com',993)">Outlook</button>
        <button class="btn btn-sm btn-secondary" onclick="setPreset('imap.mail.yahoo.com',993)">Yahoo</button>
        <button class="btn btn-sm btn-secondary" onclick="setPreset('imap.mail.me.com',993)">iCloud</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Folders (comma-separated)</label><input class="form-input" id="cc-folders" placeholder="INBOX, Sent, Drafts"></div>
        <div class="form-group"><label class="form-label">Limit per folder</label><input class="form-input" id="cc-limit" type="number" value="50"></div>
      </div>
      <div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="cc-differential"> <span>Differential collection (skip already-collected messages)</span></label></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="runCollection('imap')">Connect & Collect</button>
        <button class="btn btn-secondary" onclick="testConnectionOnly()">Test Connection Only</button>
      </div>`;
  } else if (provider === 'pop3') {
    container.innerHTML = `
      <div style="margin-bottom:12px;font-size:12px;color:var(--warning);padding:8px 12px;background:rgba(245,158,11,0.1);border-radius:6px">POP3: Real connection - enter credentials. POP3 only accesses INBOX.</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Host</label><input class="form-input" id="cc-host" placeholder="pop.gmail.com"></div>
        <div class="form-group"><label class="form-label">Port</label><input class="form-input" id="cc-port" type="number" value="995"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Username</label><input class="form-input" id="cc-username" value="${esc(email)}"></div>
        <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="cc-password" type="password"></div>
      </div>
      <div class="form-group"><label class="form-label">Limit</label><input class="form-input" id="cc-limit" type="number" value="50"></div>
      <div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="cc-differential"> <span>Differential collection</span></label></div>
      <button class="btn btn-primary" onclick="runCollection('pop3')">Connect & Collect via POP3</button>`;
  } else {
    const protoName = fmtProto(provider);
    const color = provider === 'ews' ? 'var(--purple)' : provider === 'graph' ? 'var(--accent)' : 'var(--success)';
    container.innerHTML = `
      <div style="margin-bottom:12px;font-size:12px;color:${color};padding:8px 12px;background:${color}15;border-radius:6px">
        ${protoName}: Collection uses the ${protoName} protocol handler with full protocol logging and SHA-256 hashing.
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Folders (comma-separated)</label><input class="form-input" id="cc-folders" value="Inbox, Sent Items"></div>
        <div class="form-group"><label class="form-label">Limit per folder</label><input class="form-input" id="cc-limit" type="number" value="25"></div>
      </div>
      <div style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="cc-differential"> <span>Differential collection (skip already-collected)</span></label></div>
      <button class="btn btn-primary" onclick="runCollection('${provider}')">Collect via ${protoName}</button>`;
  }
}

function setPreset(host, port) {
  const h = document.getElementById('cc-host');
  const p = document.getElementById('cc-port');
  if (h) h.value = host;
  if (p) p.value = port;
}

async function testConnectionOnly() {
  const projectId = document.getElementById('collect-project')?.value;
  if (!projectId) return toast('Select a project', 'error');
  const opt = document.getElementById('collect-project').selectedOptions[0];
  const protocol = opt.dataset.provider;
  const config = buildConfig(protocol);

  try {
    const result = await api('/connect/test', { method: 'POST', body: { protocol, config } });
    document.getElementById('collect-result').style.display = 'block';
    document.getElementById('collect-result-content').innerHTML = `
      <div style="color:var(--success);font-weight:600;margin-bottom:12px">Connection successful</div>
      ${result.folders ? `<h4 style="font-size:13px;margin-bottom:8px">Folders (${result.folders.length})</h4><div class="table-container" style="max-height:200px;overflow-y:auto"><table><tr><th>Path</th><th>Messages</th><th>Unseen</th></tr>${result.folders.map(f => `<tr><td>${esc(f.path || f.name)}</td><td>${f.totalMessages || 0}</td><td>${f.unseenMessages || 0}</td></tr>`).join('')}</table></div>` : ''}`;
    showProtocolLog(result.protocolLog);
    toast('Connection test succeeded', 'success');
  } catch (err) {
    document.getElementById('collect-result').style.display = 'block';
    document.getElementById('collect-result-content').innerHTML = `<div style="color:var(--danger);font-weight:600">Connection failed: ${esc(err.message)}</div>`;
    toast('Connection failed', 'error');
  }
}

async function runCollection(protocol) {
  const projectId = document.getElementById('collect-project')?.value;
  if (!projectId) return toast('Select a project', 'error');
  const config = buildConfig(protocol);
  const foldersInput = document.getElementById('cc-folders')?.value;
  const folders = foldersInput ? foldersInput.split(',').map(f => f.trim()).filter(Boolean) : undefined;
  const limit = parseInt(document.getElementById('cc-limit')?.value) || 50;
  const differential = document.getElementById('cc-differential')?.checked || false;

  document.getElementById('collect-result').style.display = 'block';
  document.getElementById('collect-result-content').innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="spinner"></div><span>Collecting messages via ${fmtProto(protocol)}${differential ? ' (differential)' : ''}...</span></div>`;

  try {
    const result = await api(`/projects/${projectId}/collect`, {
      method: 'POST',
      body: { config, folders, limit, differential },
    });

    document.getElementById('collect-result-content').innerHTML = `
      <div style="color:var(--success);font-weight:600;margin-bottom:12px">Collection completed</div>
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card success" style="margin:0"><div class="stat-label">Acquired</div><div class="stat-value">${result.messageCount}</div></div>
        ${result.differential ? `<div class="stat-card warning" style="margin:0"><div class="stat-label">Skipped (Dup)</div><div class="stat-value">${result.skippedCount || 0}</div></div>` : ''}
        <div class="stat-card info" style="margin:0"><div class="stat-label">Total Size</div><div class="stat-value">${fmtBytes(result.totalBytes || 0)}</div></div>
      </div>
      ${result.timestamp ? `<div style="font-size:12px;color:var(--info);padding:8px 12px;background:rgba(6,182,212,0.1);border-radius:6px;margin-bottom:12px">RFC 3161 timestamp: ${result.timestamp}</div>` : ''}
      <div style="font-size:12px;color:var(--text-muted)">Acquisition ID: <code>${result.acquisitionId}</code></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="navigateTo('export')">Export</button>
        <button class="btn btn-secondary" onclick="navigateTo('inline')">Inline Search</button>
        <button class="btn btn-secondary" onclick="navigateTo('qc')">Run QC</button>
        <button class="btn btn-secondary" onclick="navigateTo('cloud')">Scan Cloud Links</button>
      </div>`;
    showProtocolLog(result.protocolLog);
    toast(`Collected ${result.messageCount} messages`, 'success');
  } catch (err) {
    document.getElementById('collect-result-content').innerHTML = `<div style="color:var(--danger);font-weight:600">Collection failed: ${esc(err.message)}</div>`;
    toast('Collection failed', 'error');
  }
}

async function startCollection(projectId) {
  navigateTo('connect');
  await new Promise(r => setTimeout(r, 100));
  const sel = document.getElementById('collect-project');
  if (sel) { sel.value = projectId; onCollectProjectChange(); }
}

function buildConfig(protocol) {
  const config = {};
  const email = document.getElementById('collect-project')?.selectedOptions[0]?.dataset?.email;
  config.email = email || '';
  if (protocol === 'imap') {
    config.host = document.getElementById('cc-host')?.value;
    config.port = parseInt(document.getElementById('cc-port')?.value) || 993;
    config.username = document.getElementById('cc-username')?.value;
    config.password = document.getElementById('cc-password')?.value;
    config.tls = true;
  } else if (protocol === 'pop3') {
    config.host = document.getElementById('cc-host')?.value;
    config.port = parseInt(document.getElementById('cc-port')?.value) || 995;
    config.username = document.getElementById('cc-username')?.value;
    config.password = document.getElementById('cc-password')?.value;
    config.useTls = true;
  }
  return config;
}

function showProtocolLog(log) {
  if (!log?.length) return;
  document.getElementById('protocol-log-section').style.display = 'block';
  document.getElementById('protocol-log').innerHTML = log.map(entry => {
    const dc = entry.direction === 'CLIENT' ? 'dir-client' : entry.direction.includes('C') ? 'dir-send' : entry.direction.includes('S') ? 'dir-recv' : entry.direction === 'ERROR' ? 'dir-error' : 'dir-debug';
    return `<div class="log-entry"><span class="timestamp">${entry.timestamp.substring(11, 23)}</span> <span class="direction ${dc}">[${entry.direction}]</span> ${esc(typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message))}</div>`;
  }).join('');
}

// ── Search / Query Builder (In-Place) ──
async function renderSearch(el) {
  const projects = await api('/projects');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">In-Place Search (Server-Side)</div><div class="card-subtitle">Search using protocol-native syntax: IMAP SEARCH, KQL, $search, Gmail q=</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="search-project"><option value="">-- Select a project --</option>${projects.map(p => `<option value="${p.id}" data-provider="${p.provider_type}">${esc(p.name)} (${fmtProto(p.provider_type)})</option>`).join('')}</select></div>
      <div class="tabs" id="search-type-tabs">
        <div class="tab active" data-type="keyword">Keyword</div>
        <div class="tab" data-type="date_range">Date Range</div>
        <div class="tab" data-type="sender">Sender/Recipient</div>
        <div class="tab" data-type="has_attachment">Attachments</div>
        <div class="tab" data-type="advanced">Advanced</div>
      </div>
      <div id="search-fields"></div>
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn btn-primary" onclick="executeSearch()">Execute Search</button>
        <button class="btn btn-secondary" onclick="previewQuery()">Preview Query</button>
      </div>
    </div>
    <div class="card" id="search-preview" style="display:none"><div class="card-header"><div class="card-title">Generated Query</div></div><div id="search-preview-content"></div></div>
    <div class="card" id="search-results" style="display:none"><div class="card-header"><div class="card-title">Search Results</div></div><div id="search-results-content"></div></div>
    <div class="card" id="search-log" style="display:none"><div class="card-header"><div class="card-title">Protocol Log</div></div><div class="protocol-log" id="search-protocol-log"></div></div>`;

  document.querySelectorAll('#search-type-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#search-type-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSearchFields(tab.dataset.type);
    });
  });
  renderSearchFields('keyword');
}

function renderSearchFields(type) {
  const c = document.getElementById('search-fields');
  switch (type) {
    case 'keyword': c.innerHTML = `<div class="form-group"><label class="form-label">Keywords</label><input class="form-input" id="sq-keyword" placeholder="Search subject, body, and sender"></div>`; break;
    case 'date_range': c.innerHTML = `<div class="search-builder"><div class="form-group"><label class="form-label">From</label><input class="form-input" id="sq-since" type="date"></div><div class="form-group"><label class="form-label">To</label><input class="form-input" id="sq-before" type="date"></div></div>`; break;
    case 'sender': c.innerHTML = `<div class="search-builder"><div class="form-group"><label class="form-label">From</label><input class="form-input" id="sq-from" placeholder="sender@example.com"></div><div class="form-group"><label class="form-label">To</label><input class="form-input" id="sq-to" placeholder="recipient@example.com"></div></div><div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="sq-subject" placeholder="e.g., contract"></div>`; break;
    case 'has_attachment': c.innerHTML = `<div class="search-builder"><div class="form-group"><label class="form-label">Has Attachments</label><select class="form-select" id="sq-hasAttachment"><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select></div><div class="form-group"><label class="form-label">Filename</label><input class="form-input" id="sq-filename" placeholder=".pdf, .xlsx"></div></div>`; break;
    case 'advanced': c.innerHTML = `<div class="form-group"><label class="form-label">Raw Query</label><textarea class="form-textarea" id="sq-raw" rows="4" placeholder="IMAP: SUBJECT &quot;contract&quot;&#10;EWS KQL: from:john AND subject:report&#10;Graph: $search=contract&#10;Gmail: from:john has:attachment"></textarea></div>`; break;
  }
}

function getCriteria() {
  const c = {};
  for (const f of ['keyword','from','to','subject','since','before','hasAttachment','filename','size','raw']) {
    const el = document.getElementById(`sq-${f}`);
    if (el?.value) c[f] = el.value === 'true' ? true : el.value === 'false' ? false : el.value;
  }
  return c;
}

function previewQuery() {
  const criteria = getCriteria();
  const provider = document.getElementById('search-project')?.selectedOptions[0]?.dataset?.provider || 'imap';
  let query = '';
  switch (provider) {
    case 'imap': { const p = []; if (criteria.keyword) p.push(`OR SUBJECT "${criteria.keyword}" BODY "${criteria.keyword}"`); if (criteria.from) p.push(`FROM "${criteria.from}"`); if (criteria.to) p.push(`TO "${criteria.to}"`); if (criteria.subject) p.push(`SUBJECT "${criteria.subject}"`); if (criteria.since) p.push(`SINCE ${fmtImapDate(criteria.since)}`); if (criteria.before) p.push(`BEFORE ${fmtImapDate(criteria.before)}`); if (criteria.hasAttachment) p.push('HEADER Content-Type multipart/mixed'); query = `IMAP SEARCH ${p.join(' ') || 'ALL'}`; break; }
    case 'ews': { const k = []; if (criteria.keyword) k.push(criteria.keyword); if (criteria.from) k.push(`from:${criteria.from}`); if (criteria.subject) k.push(`subject:"${criteria.subject}"`); if (criteria.hasAttachment) k.push('hasattachment:true'); if (criteria.since) k.push(`received>=${criteria.since}`); if (criteria.before) k.push(`received<=${criteria.before}`); query = `EWS KQL: ${k.join(' AND ') || '*'}`; break; }
    case 'graph': { const g = []; if (criteria.keyword) g.push(`$search="${criteria.keyword}"`); if (criteria.from) g.push(`$filter=from/emailAddress/address eq '${criteria.from}'`); if (criteria.hasAttachment) g.push('$filter=hasAttachments eq true'); if (criteria.since) g.push(`$filter=receivedDateTime ge ${criteria.since}`); query = `Graph: GET /me/messages?${g.join('&') || '$top=50'}`; break; }
    case 'gmail_api': { const q = []; if (criteria.keyword) q.push(criteria.keyword); if (criteria.from) q.push(`from:${criteria.from}`); if (criteria.to) q.push(`to:${criteria.to}`); if (criteria.subject) q.push(`subject:${criteria.subject}`); if (criteria.hasAttachment) q.push('has:attachment'); if (criteria.since) q.push(`after:${criteria.since.replace(/-/g, '/')}`); if (criteria.before) q.push(`before:${criteria.before.replace(/-/g, '/')}`); query = `Gmail: q=${q.join(' ') || ''}`; break; }
  }
  document.getElementById('search-preview').style.display = 'block';
  document.getElementById('search-preview-content').innerHTML = `<div style="font-family:monospace;font-size:13px;padding:12px;background:var(--bg-input);border-radius:6px;word-break:break-all">${esc(query)}</div><div style="margin-top:8px;font-size:12px;color:var(--text-muted)">Protocol: <strong>${fmtProto(provider)}</strong></div>`;
}

async function executeSearch() {
  const projectId = document.getElementById('search-project')?.value;
  if (!projectId) return toast('Select a project', 'error');
  const criteria = getCriteria();
  const activeTab = document.querySelector('#search-type-tabs .tab.active');

  try {
    const result = await api(`/projects/${projectId}/search`, { method: 'POST', body: { criteria, queryType: activeTab?.dataset.type || 'keyword' } });
    document.getElementById('search-results').style.display = 'block';
    let html = `<div class="search-result-bar"><div><strong>${result.localResultCount || 0}</strong> in database${result.resultCount ? ` | <strong>${result.resultCount}</strong> server-side` : ''}</div></div>`;
    if (result.localResults?.length > 0) {
      html += `<div class="table-container" style="max-height:300px;overflow-y:auto"><table><tr><th>Subject</th><th>From</th><th>Date</th><th>Folder</th><th>SHA-256</th></tr>${result.localResults.map(m => `<tr><td>${esc(m.subject || '(no subject)')}</td><td style="font-size:12px">${esc(m.from_address || '')}</td><td style="font-size:12px">${m.date ? new Date(m.date).toLocaleString() : ''}</td><td><code style="font-size:11px">${esc(m.folder || '')}</code></td><td><span class="hash-value">${(m.hash_sha256 || '').substring(0, 16)}...</span></td></tr>`).join('')}</table></div>`;
    }
    document.getElementById('search-results-content').innerHTML = html;
    if (result.protocolLog?.length) {
      document.getElementById('search-log').style.display = 'block';
      document.getElementById('search-protocol-log').innerHTML = result.protocolLog.map(e => `<div class="log-entry"><span class="timestamp">${e.timestamp.substring(11, 23)}</span> <span class="direction ${e.direction.includes('C') ? 'dir-send' : e.direction.includes('S') ? 'dir-recv' : 'dir-debug'}">[${e.direction}]</span> ${esc(e.message)}</div>`).join('');
    }
    toast(`Found ${result.localResultCount || 0} messages`, 'success');
  } catch (err) { toast(`Search failed: ${err.message}`, 'error'); }
}

// ── Inline Search (Client-Side FEC Feature) ──
async function renderInlineSearch(el) {
  const projects = await api('/projects');
  let syntaxHelp = {};
  try { syntaxHelp = await api('/inline-search/syntax'); } catch {}

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Inline Search Engine</div><div class="card-subtitle">Client-side search with boolean, regex, wildcards, proximity, fuzzy matching — FEC-grade</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="inline-project"><option value="">-- Select --</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)} (${p.status})</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Search Query</label><input class="form-input" id="inline-query" placeholder='e.g., from:john AND "wire transfer" NOT draft' style="font-family:monospace"></div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-primary" onclick="runInlineSearch()">Search</button>
        <button class="btn btn-secondary" onclick="document.getElementById('inline-help').style.display=document.getElementById('inline-help').style.display==='none'?'block':'none'">Syntax Help</button>
      </div>
      <div id="inline-help" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
          <div><div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:8px">Operators</div>${Object.entries(syntaxHelp.operators || {}).map(([k,v]) => `<div style="font-size:12px;margin-bottom:4px"><code style="color:var(--info)">${k}</code> <span style="color:var(--text-muted)">— ${v}</span></div>`).join('')}</div>
          <div><div style="font-size:12px;font-weight:600;color:var(--success);margin-bottom:8px">Search Types</div>${Object.entries(syntaxHelp.types || {}).map(([k,v]) => `<div style="font-size:12px;margin-bottom:4px"><code style="color:var(--info)">${k}</code> <span style="color:var(--text-muted)">— ${v}</span></div>`).join('')}</div>
          <div><div style="font-size:12px;font-weight:600;color:var(--warning);margin-bottom:8px">Field Prefixes</div>${Object.entries(syntaxHelp.fields || {}).map(([k,v]) => `<div style="font-size:12px;margin-bottom:4px"><code style="color:var(--info)">${k}</code> <span style="color:var(--text-muted)">— ${v}</span></div>`).join('')}</div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px"><strong>Examples:</strong></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${(syntaxHelp.examples || []).map(ex => `<code style="font-size:11px;padding:4px 8px;background:var(--bg-input);border-radius:4px;cursor:pointer;color:var(--info)" onclick="document.getElementById('inline-query').value=this.textContent">${ex}</code>`).join('')}</div>
      </div>
    </div>
    <div class="card" id="inline-results" style="display:none"><div class="card-header"><div class="card-title">Inline Search Results</div></div><div id="inline-results-content"></div></div>`;
}

async function runInlineSearch() {
  const projectId = document.getElementById('inline-project')?.value;
  if (!projectId) return toast('Select a project', 'error');
  const query = document.getElementById('inline-query')?.value;
  if (!query) return toast('Enter a search query', 'error');

  try {
    const result = await api(`/projects/${projectId}/inline-search`, { method: 'POST', body: { query } });
    document.getElementById('inline-results').style.display = 'block';
    document.getElementById('inline-results-content').innerHTML = `
      <div class="search-result-bar"><div><strong>${result.stats.matched}</strong> of <strong>${result.stats.total}</strong> messages matched in <strong>${result.stats.elapsed}ms</strong></div></div>
      ${result.results.length > 0 ? `<div class="table-container" style="max-height:400px;overflow-y:auto"><table>
        <tr><th>Subject</th><th>From</th><th>Date</th><th>Folder</th><th>Size</th><th>SHA-256</th></tr>
        ${result.results.slice(0, 200).map(m => `<tr>
          <td>${esc(m.subject || '(no subject)')}${m.is_encrypted ? ' <span style="color:var(--warning);font-size:10px">[ENC]</span>' : ''}${m.is_signed ? ' <span style="color:var(--info);font-size:10px">[SIG]</span>' : ''}</td>
          <td style="font-size:12px">${esc(m.from_address || '')}</td>
          <td style="font-size:12px">${m.date ? new Date(m.date).toLocaleString() : ''}</td>
          <td><code style="font-size:11px">${esc(m.folder || '')}</code></td>
          <td style="font-size:12px">${fmtBytes(m.size)}</td>
          <td><span class="hash-value">${(m.hash_sha256 || '').substring(0, 16)}...</span></td>
        </tr>`).join('')}
      </table></div>` : '<div style="color:var(--text-muted);font-size:13px">No messages matched the query.</div>'}`;
    toast(`Inline search: ${result.stats.matched} matches in ${result.stats.elapsed}ms`, 'success');
  } catch (err) { toast(`Search failed: ${err.message}`, 'error'); }
}

// ── Export ──
async function renderExport(el) {
  const projects = await api('/projects');
  const formats = await api('/export/formats');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Export Evidence</div><div class="card-subtitle">Export with hash manifests and RFC 3161 timestamps. PST supports size-based splitting.</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="export-project"><option value="">-- Select --</option>${projects.filter(p => ['completed','exported','collecting'].includes(p.status)).map(p => `<option value="${p.id}">${esc(p.name)} (${p.status})</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Export Format</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
          ${Object.entries(formats).map(([key, f]) => `<label style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px"><input type="radio" name="exportFormat" value="${key}" ${key === 'eml' ? 'checked' : ''}><div><div style="font-weight:500">${f.name}</div><div style="font-size:10px;color:var(--text-muted)">${f.extension} — ${f.forensicValue} value</div></div></label>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary" onclick="runExport()">Export with Hash Verification</button>
    </div>
    <div class="card" id="export-result" style="display:none"><div class="card-header"><div class="card-title">Export Result</div></div><div id="export-result-content"></div></div>`;
}

async function runExport() {
  const projectId = document.getElementById('export-project')?.value;
  if (!projectId) return toast('Select a project', 'error');
  const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'eml';

  document.getElementById('export-result').style.display = 'block';
  document.getElementById('export-result-content').innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="spinner"></div><span>Exporting to ${format.toUpperCase()}...</span></div>`;

  try {
    const result = await api(`/projects/${projectId}/export`, { method: 'POST', body: { format } });
    document.getElementById('export-result-content').innerHTML = `
      <div style="color:var(--success);font-weight:600;margin-bottom:12px">Export completed: ${result.messageCount} messages to ${format.toUpperCase()}</div>
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card success" style="margin:0"><div class="stat-label">Files</div><div class="stat-value">${result.files.length}</div></div>
        <div class="stat-card info" style="margin:0"><div class="stat-label">Total Size</div><div class="stat-value">${fmtBytes(result.totalBytes)}</div></div>
      </div>
      ${result.timestamp ? `<div style="font-size:12px;color:var(--info);padding:8px 12px;background:rgba(6,182,212,0.1);border-radius:6px;margin-bottom:12px">RFC 3161 timestamp applied: ${result.timestamp.genTime}</div>` : ''}
      <h4 style="font-size:13px;margin-bottom:8px">Exported Files</h4>
      <div class="table-container" style="max-height:300px;overflow-y:auto"><table>
        <tr><th>Filename</th><th>Size</th><th>SHA-256</th><th>Download</th></tr>
        ${result.files.map(f => `<tr>
          <td><code style="font-size:11px">${esc(f.filename)}</code></td>
          <td>${fmtBytes(f.size)}</td>
          <td><span class="hash-value">${f.hash}</span></td>
          <td><a href="${f.downloadUrl}" class="btn btn-sm btn-secondary" download>Download</a></td>
        </tr>`).join('')}
      </table></div>
      <h4 style="font-size:13px;margin:16px 0 8px">Hash Manifest</h4>
      <div class="protocol-log"><pre>${esc(JSON.stringify(result.manifest, null, 2))}</pre></div>`;
    toast('Export completed with hash verification & timestamp', 'success');
  } catch (err) {
    document.getElementById('export-result-content').innerHTML = `<div style="color:var(--danger)">Export failed: ${esc(err.message)}</div>`;
    toast(`Export failed: ${err.message}`, 'error');
  }
}

// ── Quality Control ──
async function renderQC(el) {
  const projects = await api('/projects');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Quality Control</div><div class="card-subtitle">Automated checks: completeness, hashes, duplicates, dates, encryption, folder coverage, audit trail</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="qc-project"><option value="">-- Select --</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)} (${p.status})</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="runQC()">Run Quality Control</button>
    </div>
    <div class="card" id="qc-result" style="display:none"><div class="card-header"><div class="card-title">QC Report</div></div><div id="qc-result-content"></div></div>`;
}

async function runQC() {
  const projectId = document.getElementById('qc-project')?.value;
  if (!projectId) return toast('Select a project', 'error');

  document.getElementById('qc-result').style.display = 'block';
  document.getElementById('qc-result-content').innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="spinner"></div><span>Running quality control checks...</span></div>`;

  try {
    const r = await api(`/projects/${projectId}/qc`, { method: 'POST' });
    const statusColor = r.overallStatus === 'pass' ? 'var(--success)' : r.overallStatus === 'warning' ? 'var(--warning)' : 'var(--danger)';

    document.getElementById('qc-result-content').innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="font-size:24px;font-weight:700;color:${statusColor}">${r.overallStatus.toUpperCase()}</div>
        <div style="font-size:13px;color:var(--text-secondary)">${r.summary.passed} passed, ${r.summary.warnings} warnings, ${r.summary.failed} failed (${r.elapsed}ms)</div>
      </div>
      ${r.checks.map(c => {
        const icon = c.status === 'pass' ? '&#10003;' : c.status === 'warning' ? '&#9888;' : '&#10007;';
        const color = c.status === 'pass' ? 'var(--success)' : c.status === 'warning' ? 'var(--warning)' : 'var(--danger)';
        return `<div style="padding:12px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;border-left:3px solid ${color}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:600;font-size:13px"><span style="color:${color}">${icon}</span> ${c.name}</div>
            <span class="badge-status" style="background:${color}20;color:${color}">${c.status.toUpperCase()}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${esc(c.detail || '')}</div>
          ${c.metrics ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${Object.entries(c.metrics).map(([k,v]) => `${k}: ${v}`).join(' | ')}</div>` : ''}
        </div>`;
      }).join('')}
      <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">QC completed at ${r.timestamp}</div>`;
    toast(`QC: ${r.overallStatus.toUpperCase()} — ${r.summary.passed}/${r.summary.total} checks passed`, r.overallStatus === 'pass' ? 'success' : 'info');
  } catch (err) {
    document.getElementById('qc-result-content').innerHTML = `<div style="color:var(--danger)">QC failed: ${esc(err.message)}</div>`;
    toast(`QC failed: ${err.message}`, 'error');
  }
}

// ── Cloud Attachments ──
async function renderCloudAttachments(el) {
  const projects = await api('/projects');
  let providerInfo = {};
  try { providerInfo = await api('/cloud/providers'); } catch {}

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Cloud Attachment Detection</div><div class="card-subtitle">Detect Google Drive, OneDrive, SharePoint, Dropbox, and Box links in collected emails</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="cloud-project"><option value="">-- Select --</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)} (${p.status})</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="runCloudScan()">Scan for Cloud Attachments</button>
    </div>
    <div class="card" id="cloud-result" style="display:none"><div class="card-header"><div class="card-title">Cloud Scan Results</div></div><div id="cloud-result-content"></div></div>
    <div class="card">
      <div class="card-header"><div class="card-title">Cloud Attachment Forensic Guide</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        ${Object.entries(providerInfo).map(([, p]) => `
          <div style="padding:12px;background:var(--bg-input);border-radius:6px">
            <div style="font-weight:600;font-size:13px;margin-bottom:8px">${p.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${p.preservationMethod}</div>
            ${p.forensicConsiderations.map(c => `<div class="forensic-note" style="font-size:11px">${c}</div>`).join('')}
          </div>`).join('')}
      </div>
    </div>`;
}

async function runCloudScan() {
  const projectId = document.getElementById('cloud-project')?.value;
  if (!projectId) return toast('Select a project', 'error');

  document.getElementById('cloud-result').style.display = 'block';
  document.getElementById('cloud-result-content').innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="spinner"></div><span>Scanning messages for cloud links...</span></div>`;

  try {
    const r = await api(`/projects/${projectId}/cloud-scan`, { method: 'POST' });
    document.getElementById('cloud-result-content').innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card ${r.totalLinks > 0 ? 'warning' : 'success'}" style="margin:0"><div class="stat-label">Cloud Links Found</div><div class="stat-value">${r.totalLinks}</div></div>
        <div class="stat-card info" style="margin:0"><div class="stat-label">Providers</div><div class="stat-value">${r.totalProviders}</div></div>
      </div>
      ${r.totalLinks > 0 ? `
        <div style="font-size:12px;color:var(--warning);padding:8px 12px;background:rgba(245,158,11,0.1);border-radius:6px;margin-bottom:12px">${esc(r.forensicNote)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${Object.entries(r.byProvider).filter(([,v]) => v > 0).map(([k,v]) => `<span class="badge-status badge-collecting">${k}: ${v}</span>`).join('')}</div>
        <div class="table-container" style="max-height:300px;overflow-y:auto"><table>
          <tr><th>Provider</th><th>URL</th><th>Message</th><th>From</th></tr>
          ${r.links.slice(0, 50).map(l => `<tr>
            <td><span class="badge-status badge-medium">${l.providerLabel}</span></td>
            <td style="font-size:11px;word-break:break-all;max-width:300px">${esc(l.url)}</td>
            <td style="font-size:12px">${esc(l.messageSubject || '')}</td>
            <td style="font-size:12px">${esc(l.messageFrom || '')}</td>
          </tr>`).join('')}
        </table></div>
      ` : `<div style="color:var(--success);font-size:13px">${esc(r.forensicNote)}</div>`}`;
    toast(`Cloud scan: ${r.totalLinks} links found`, r.totalLinks > 0 ? 'info' : 'success');
  } catch (err) { toast(`Scan failed: ${err.message}`, 'error'); }
}

// ── Timestamps ──
async function renderTimestamps(el) {
  const projects = await api('/projects');
  let info = {};
  try { info = await api('/timestamp/info'); } catch {}

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">RFC 3161 Trusted Timestamps</div><div class="card-subtitle">${info.description || 'Prove evidence existed at a specific time'}</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="ts-project" onchange="loadTimestamps()"><option value="">-- Select --</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)} (${p.status})</option>`).join('')}</select></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="createTimestamp('collection')">Timestamp Collection</button>
        <button class="btn btn-secondary" onclick="createTimestamp('export')">Timestamp Latest Export</button>
      </div>
    </div>
    <div class="card" id="ts-records" style="display:none"><div class="card-header"><div class="card-title">Timestamp Records</div></div><div id="ts-records-content"></div></div>
    <div class="card">
      <div class="card-header"><div class="card-title">Production TSA Servers</div></div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">${esc(info.forensicValue || '')}</div>
      <table><tr><th>Provider</th><th>URL</th><th>Protocol</th></tr>
        ${(info.productionTSAs || []).map(t => `<tr><td>${esc(t.name)}</td><td style="font-family:monospace;font-size:12px">${esc(t.url)}</td><td>${esc(t.protocol)}</td></tr>`).join('')}
      </table>
    </div>`;
}

async function createTimestamp(type) {
  const projectId = document.getElementById('ts-project')?.value;
  if (!projectId) return toast('Select a project', 'error');

  try {
    const r = await api(`/projects/${projectId}/timestamp`, { method: 'POST', body: { type } });
    toast(`Timestamp created: ${r.timestamp.genTime}`, 'success');
    loadTimestamps();
  } catch (err) { toast(`Timestamp failed: ${err.message}`, 'error'); }
}

async function loadTimestamps() {
  const projectId = document.getElementById('ts-project')?.value;
  if (!projectId) return;

  try {
    const records = await api(`/projects/${projectId}/timestamps`);
    if (records.length === 0) { document.getElementById('ts-records').style.display = 'none'; return; }
    document.getElementById('ts-records').style.display = 'block';
    document.getElementById('ts-records-content').innerHTML = `
      <div class="table-container"><table>
        <tr><th>Type</th><th>Time</th><th>Target Hash</th><th>Serial</th></tr>
        ${records.map(r => {
          let tsData; try { tsData = JSON.parse(r.timestamp_data); } catch { tsData = {}; }
          return `<tr>
            <td><span class="badge-status badge-${r.type === 'collection' ? 'completed' : 'exported'}">${r.type}</span></td>
            <td style="font-size:12px">${new Date(r.created_at).toLocaleString()}</td>
            <td><span class="hash-value">${(r.target_hash || '').substring(0, 24)}...</span></td>
            <td style="font-size:11px;font-family:monospace">${(tsData.serialNumber || '').substring(0, 16)}...</td>
          </tr>`;
        }).join('')}
      </table></div>`;
  } catch {}
}

// ── Audit Log ──
async function renderAudit(el) {
  const auditLog = await api('/audit');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Chain of Custody Audit Log</div><div class="card-subtitle">Append-only, tamper-evident log per NIST SP 800-86 and FRE 901/902</div></div></div>
      ${auditLog.length === 0 ? `<div class="empty-state"><h3>No Audit Entries</h3><p>Entries are created automatically during collection, search, export, QC, and verification.</p></div>` : `
        <div style="margin-bottom:12px;font-size:12px;color:var(--info);padding:8px 12px;background:rgba(6,182,212,0.1);border-radius:6px">
          ${auditLog.length} entries | SHA-256 hash chain | Tamper-evident
        </div>
        <div class="audit-chain">
          ${auditLog.map(entry => `
            <div class="audit-entry">
              <div style="display:flex;justify-content:space-between;align-items:start">
                <span class="event-type">${entry.event_type}</span>
                <span class="event-time">${new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <div class="event-desc">${esc(entry.description || '')}</div>
              ${entry.examiner ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Examiner: ${esc(entry.examiner)}</div>` : ''}
              <div class="event-hash">SHA-256: ${entry.hash || 'N/A'}${entry.prev_hash ? `<br>Prev: ${entry.prev_hash}` : ''}</div>
              ${entry.details && entry.details !== '{}' ? `<details style="margin-top:4px"><summary style="font-size:11px;color:var(--text-muted);cursor:pointer">Details</summary><div class="protocol-log" style="margin-top:4px;max-height:150px"><pre>${esc(JSON.stringify(JSON.parse(entry.details), null, 2))}</pre></div></details>` : ''}
            </div>`).join('')}
        </div>`}
    </div>`;
}

// ── Evidence Integrity ──
async function renderIntegrity(el) {
  const projects = await api('/projects');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><div><div class="card-title">Evidence Integrity Verification</div><div class="card-subtitle">Verify hash integrity, audit chain, export files, and RFC 3161 timestamps</div></div></div>
      <div class="form-group"><label class="form-label">Select Project</label><select class="form-select" id="verify-project"><option value="">-- Select --</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)} (${p.status})</option>`).join('')}</select></div>
      <button class="btn btn-primary" onclick="runVerification()">Run Integrity Check</button>
    </div>
    <div class="card" id="verify-result" style="display:none"><div class="card-header"><div class="card-title">Verification Report</div></div><div id="verify-result-content"></div></div>
    <div class="card">
      <div class="card-header"><div class="card-title">Forensic Standards Reference</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <h4 style="font-size:13px;margin-bottom:8px;color:var(--accent)">Hash Algorithms</h4>
          <table><tr><th>Algorithm</th><th>Bits</th><th>Status</th></tr>
            <tr><td>MD5</td><td>128</td><td><span class="badge-status badge-error">Legacy</span></td></tr>
            <tr><td>SHA-256</td><td>256</td><td><span class="badge-status badge-completed">Minimum</span></td></tr>
            <tr><td>SHA-512</td><td>512</td><td><span class="badge-status badge-completed">Recommended</span></td></tr>
          </table>
        </div>
        <div>
          <h4 style="font-size:13px;margin-bottom:8px;color:var(--accent)">Applicable Standards</h4>
          <div class="forensic-note">FRE 901(b)(9) — Process/system accuracy</div>
          <div class="forensic-note">FRE 902(14) — Self-authentication via hash</div>
          <div class="forensic-note">NIST SP 800-86 — Forensic techniques</div>
          <div class="forensic-note">ISO/IEC 27037 — Digital evidence handling</div>
          <div class="forensic-note">RFC 3161 — Trusted timestamping</div>
          <div class="forensic-note">Daubert v. Merrell Dow — Expert reliability</div>
        </div>
      </div>
    </div>`;
}

async function runVerification() {
  const projectId = document.getElementById('verify-project')?.value;
  if (!projectId) return toast('Select a project', 'error');

  document.getElementById('verify-result').style.display = 'block';
  document.getElementById('verify-result-content').innerHTML = `<div style="display:flex;align-items:center;gap:8px"><div class="spinner"></div><span>Running integrity checks...</span></div>`;

  try {
    const r = await api(`/projects/${projectId}/verify`);
    const chainOk = r.auditLogIntegrity.chainVerified.valid;
    const msgPreserved = r.hashVerification.preserved;
    const exportsOk = r.exportIntegrity.filter(e => e.valid).length;
    const exportsFailed = r.exportIntegrity.filter(e => !e.valid).length;

    document.getElementById('verify-result-content').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        <div class="stat-card ${msgPreserved > 0 ? 'success' : 'warning'}" style="margin:0"><div class="stat-label">Msg Hashes</div><div class="stat-value">${msgPreserved}/${r.messageCount}</div></div>
        <div class="stat-card ${chainOk ? 'success' : 'danger'}" style="margin:0"><div class="stat-label">Audit Chain</div><div class="stat-value">${chainOk ? 'VALID' : 'BROKEN'}</div></div>
        <div class="stat-card ${exportsFailed === 0 ? 'success' : 'warning'}" style="margin:0"><div class="stat-label">Exports</div><div class="stat-value">${exportsOk}/${r.exportIntegrity.length || 0}</div></div>
        <div class="stat-card info" style="margin:0"><div class="stat-label">Timestamps</div><div class="stat-value">${r.timestampRecords}</div></div>
      </div>

      ${r.hashVerification.details.length > 0 ? `
        <h4 style="font-size:13px;margin-bottom:8px">Message Hashes</h4>
        <div class="table-container" style="max-height:250px;overflow-y:auto"><table>
          <tr><th>Subject</th><th>From</th><th>SHA-256</th><th>Status</th></tr>
          ${r.hashVerification.details.slice(0, 50).map(d => `<tr>
            <td>${esc(d.subject || '(no subject)')}</td>
            <td style="font-size:12px">${esc(d.from || '')}</td>
            <td><span class="hash-value">${(d.originalHash || '').substring(0, 24)}...</span></td>
            <td><span class="badge-status badge-${d.status === 'preserved' ? 'completed' : 'error'}">${d.status}</span></td>
          </tr>`).join('')}
        </table></div>` : ''}

      ${r.exportIntegrity.length > 0 ? `
        <h4 style="font-size:13px;margin:16px 0 8px">Export Verification</h4>
        ${r.exportIntegrity.map(exp => `<div style="padding:8px 12px;background:var(--bg-input);border-radius:6px;margin-bottom:8px;display:flex;justify-content:space-between"><span style="font-weight:500">${exp.format?.toUpperCase() || 'Export'}</span><span class="badge-status badge-${exp.valid ? 'completed' : 'error'}">${exp.valid ? 'VERIFIED' : exp.error || 'FAILED'}</span></div>`).join('')}` : ''}

      <div style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:6px;font-size:12px;color:var(--text-secondary)">
        <strong>Tool:</strong> SherlockMail v${r.toolVersion} | <strong>Verified:</strong> ${r.timestamp} | <strong>Standards:</strong> ${r.standards.hashAlgorithm}, ${r.standards.legalStandard}, ${r.standards.timestampStandard}
      </div>`;
    toast('Integrity check completed', 'success');
  } catch (err) {
    document.getElementById('verify-result-content').innerHTML = `<div style="color:var(--danger)">Verification failed: ${esc(err.message)}</div>`;
    toast(`Verification failed: ${err.message}`, 'error');
  }
}

// ── Helpers ──
function fmtProto(t) { return { imap: 'IMAP', pop3: 'POP3', ews: 'EWS', graph: 'Graph API', gmail_api: 'Gmail API' }[t] || t; }
function fmtBytes(b) { if (!b) return '0 B'; const k = 1024; const s = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`; }
function fmtImapDate(d) { const dt = new Date(d); const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${dt.getDate()}-${m[dt.getMonth()]}-${dt.getFullYear()}`; }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

renderPage();
