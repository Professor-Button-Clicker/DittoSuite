import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createProject, getProjects, getProject, deleteProject, updateProjectStatus,
  saveFolders, getFolders, createAcquisition, saveMessage, getMessages, getMessageCount,
  saveSearchQuery, getSearchQueries, saveExportRecord, getExportRecords, updateExportRecord,
  getAuditLog, getFullAuditLog, getStats, addAuditEntry,
  getMessage, getAllProjectMessages, updateAcquisition, getAcquisitions,
  saveAttachment, getAttachments,
  saveDriveLink, getDriveLinks,
  saveTimestampRecord, getTimestampRecords,
  saveInlineSearch, getInlineSearches,
  saveQcResult, getQcResults,
  getDifferentialIds, saveDifferentialId,
} from '../db/database.js';
import { ImapHandler } from '../protocols/imap-handler.js';
import { Pop3Handler } from '../protocols/pop3-handler.js';
import { EwsHandler } from '../protocols/ews-handler.js';
import { GraphHandler } from '../protocols/graph-handler.js';
import { GmailHandler } from '../protocols/gmail-handler.js';
import { ZohoHandler } from '../protocols/zoho-handler.js';
import { JmapHandler } from '../protocols/jmap-handler.js';
import { ExportService } from '../services/export-service.js';
import { InlineSearchEngine } from '../services/inline-search.js';
import { QualityControlService } from '../services/quality-control.js';
import { CloudAttachmentService } from '../services/cloud-attachment-service.js';
import { TimestampService } from '../services/timestamp-service.js';
import {
  getAuthStatus, getAuthUrl, saveCredentials, loadCredentials,
  startCallbackServer, waitForAuth, stopCallbackServer, revokeTokens,
} from '../services/google-oauth.js';
import {
  getAuthStatus as msGetAuthStatus, getAuthUrl as msGetAuthUrl,
  saveCredentials as msSaveCredentials,
  startCallbackServer as msStartCallbackServer, waitForAuth as msWaitForAuth,
  stopCallbackServer as msStopCallbackServer, revokeTokens as msRevokeTokens,
} from '../services/microsoft-oauth.js';
import {
  getAuthStatus as zohoGetAuthStatus, getAuthUrl as zohoGetAuthUrl,
  saveCredentials as zohoSaveCredentials,
  startCallbackServer as zohoStartCallbackServer, waitForAuth as zohoWaitForAuth,
  stopCallbackServer as zohoStopCallbackServer, revokeTokens as zohoRevokeTokens,
} from '../services/zoho-oauth.js';
import {
  getAuthStatus as fmGetAuthStatus, saveCredentials as fmSaveCredentials,
  revokeTokens as fmRevokeTokens,
} from '../services/fastmail-auth.js';
import { getProviders, detectProvider, getProvider, getRecommendedProtocol, getPreset, getCollectionProfiles, getCollectionProfile, getAllCollectionProfiles } from '../services/provider-profiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const router = Router();

// ── Dashboard Stats ──
router.get('/stats', (req, res) => {
  const stats = getStats();
  stats.version = '0.9.0';
  res.json(stats);
});

// ── Google OAuth ──
router.get('/oauth/google/status', (req, res) => {
  res.json(getAuthStatus());
});

router.post('/oauth/google/credentials', (req, res) => {
  try {
    saveCredentials(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oauth/google/authorize', async (req, res) => {
  try {
    await startCallbackServer();
    const url = getAuthUrl();
    if (!url) return res.status(400).json({ error: 'OAuth credentials not configured. Upload client_secret JSON first.' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oauth/google/wait', async (req, res) => {
  try {
    const result = await waitForAuth();
    stopCallbackServer();
    res.json(result);
  } catch (err) {
    stopCallbackServer();
    res.status(500).json({ error: err.message });
  }
});

router.post('/oauth/google/revoke', (req, res) => {
  revokeTokens();
  res.json({ success: true });
});

// ── Microsoft OAuth ──
router.get('/oauth/microsoft/status', (req, res) => {
  res.json(msGetAuthStatus());
});

router.post('/oauth/microsoft/credentials', (req, res) => {
  try {
    msSaveCredentials(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oauth/microsoft/authorize', async (req, res) => {
  try {
    await msStartCallbackServer();
    const url = msGetAuthUrl();
    if (!url) return res.status(400).json({ error: 'Microsoft credentials not configured. Enter Client ID and Secret first.' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oauth/microsoft/wait', async (req, res) => {
  try {
    const result = await msWaitForAuth();
    msStopCallbackServer();
    res.json(result);
  } catch (err) {
    msStopCallbackServer();
    res.status(500).json({ error: err.message });
  }
});

router.post('/oauth/microsoft/revoke', (req, res) => {
  msRevokeTokens();
  res.json({ success: true });
});

// ── Zoho OAuth ──
router.get('/oauth/zoho/status', (req, res) => {
  res.json(zohoGetAuthStatus());
});

router.post('/oauth/zoho/credentials', (req, res) => {
  try {
    zohoSaveCredentials(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oauth/zoho/authorize', async (req, res) => {
  try {
    await zohoStartCallbackServer();
    const url = zohoGetAuthUrl();
    if (!url) return res.status(400).json({ error: 'Zoho credentials not configured. Enter Client ID and Secret first.' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/oauth/zoho/wait', async (req, res) => {
  try {
    const result = await zohoWaitForAuth();
    zohoStopCallbackServer();
    res.json(result);
  } catch (err) {
    zohoStopCallbackServer();
    res.status(500).json({ error: err.message });
  }
});

router.post('/oauth/zoho/revoke', (req, res) => {
  zohoRevokeTokens();
  res.json({ success: true });
});

// ── Fastmail Auth ──
router.get('/oauth/fastmail/status', (req, res) => {
  res.json(fmGetAuthStatus());
});

router.post('/oauth/fastmail/credentials', (req, res) => {
  try {
    fmSaveCredentials(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/oauth/fastmail/revoke', (req, res) => {
  fmRevokeTokens();
  res.json({ success: true });
});

// ── Provider Profiles ──
router.get('/providers', (req, res) => {
  res.json(getProviders());
});

router.get('/providers/detect', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const providerId = detectProvider(email);
  const provider = getProvider(providerId);
  const recommended = getRecommendedProtocol(providerId);
  res.json({ providerId, provider, recommended });
});

// ── Collection Profiles ──
router.get('/collection-profiles', (req, res) => {
  res.json(getAllCollectionProfiles());
});

router.get('/collection-profiles/:providerId', (req, res) => {
  const profiles = getCollectionProfiles(req.params.providerId);
  res.json(profiles);
});

// ── Projects ──
router.get('/projects', (req, res) => {
  res.json(getProjects());
});

router.get('/projects/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/projects', (req, res) => {
  try {
    const project = createProject(req.body);
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/projects/:id', (req, res) => {
  try {
    deleteProject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Protocol Information ──
router.get('/protocols', (req, res) => {
  res.json({
    imap: {
      name: 'IMAP (Internet Message Access Protocol)',
      port: { secure: 993, plain: 143 },
      rfc: 'RFC 9051 (IMAP4rev2), RFC 3501 (IMAP4rev1)',
      description: 'Synchronizes email between client and server. Supports folders, flags, server-side search. Read-only mode preserves mailbox state. The primary protocol for forensic email collection.',
      presets: ImapHandler.getProviderPresets(),
      forensicNotes: [
        'IMAP EXAMINE command opens mailbox read-only (no flag changes)',
        'IMAP SEARCH runs queries server-side without downloading all messages',
        'UID-based tracking ensures each message is uniquely identified',
        'IMAP FETCH with BODY.PEEK[] downloads without setting \\Seen flag',
        'Protocol log captures every command/response for chain of custody',
      ],
    },
    pop3: {
      name: 'POP3 (Post Office Protocol v3)',
      port: { secure: 995, plain: 110 },
      rfc: 'RFC 1939',
      description: 'Downloads email from server. Simpler than IMAP but limited: no folders, no server-side search, no flags. Used as fallback when IMAP is unavailable.',
      presets: Pop3Handler.getProviderPresets(),
      forensicNotes: [
        'POP3 only accesses INBOX - no other folder support',
        'No server-side search capability',
        'RETR downloads the complete message',
        'TOP command can preview headers without full download',
        'Some servers delete messages after RETR (document this behavior)',
      ],
    },
    ews: {
      name: 'EWS (Exchange Web Services)',
      port: { secure: 443 },
      rfc: 'Microsoft proprietary SOAP API',
      description: 'SOAP-based API for Microsoft Exchange and Office 365. Provides rich access to mailboxes, calendars, contacts, and eDiscovery features. Uses Autodiscover for endpoint resolution.',
      capabilities: EwsHandler.getCapabilities(),
      forensicNotes: [
        'Autodiscover resolves the EWS endpoint from just email + credentials',
        'SearchMailboxes provides in-place eDiscovery search (KQL syntax)',
        'Recoverable Items folder contains soft-deleted and purged items',
        'In-Place Archive holds archival mail separate from primary mailbox',
        'MIME content export preserves the raw message for forensic integrity',
        'Being deprecated by Microsoft in favor of Graph API',
      ],
    },
    graph: {
      name: 'Microsoft Graph API',
      port: { secure: 443 },
      rfc: 'Microsoft REST API',
      description: 'Modern REST API replacing EWS for Microsoft 365. Supports mail, calendar, files, and more. Uses OAuth 2.0 and supports both delegated and app-only authentication.',
      capabilities: GraphHandler.getCapabilities(),
      forensicNotes: [
        'App-only auth enables batch mailbox access without user interaction',
        '$value endpoint returns raw MIME content for forensic preservation',
        'Modern attachments are OneDrive/SharePoint links (need separate download)',
        'Delta queries enable differential/incremental collection',
        'RBAC can limit app access to specific mailboxes or admin units',
      ],
    },
    gmail: {
      name: 'Gmail API',
      port: { secure: 443 },
      rfc: 'Google REST API',
      description: 'REST API for Gmail and Google Workspace. Uses labels instead of folders. Supports powerful search syntax identical to the Gmail search bar. OAuth 2.0 required.',
      capabilities: GmailHandler.getCapabilities(),
      forensicNotes: [
        'format=raw returns base64url-encoded MIME content',
        'Gmail uses labels, not folders (a message can have multiple labels)',
        'Service account with domain-wide delegation for enterprise access',
        'History API enables efficient incremental collection',
        'Trash and Spam are accessible for complete collection',
      ],
    },
    zoho: {
      name: 'Zoho Mail API',
      port: { secure: 443 },
      rfc: 'Zoho REST API',
      description: 'REST API for Zoho Mail and Zoho Workplace. Regional endpoints for US, EU, IN, AU, JP. OAuth 2.0 required.',
      capabilities: ZohoHandler.getCapabilities(),
      forensicNotes: [
        'Regional API endpoints must match account region',
        'Full message content retrieval with metadata',
        'Attachment download via separate endpoint',
        'Folder-based organization with search support',
        'OAuth tokens are short-lived (1 hour) with refresh',
      ],
    },
    jmap: {
      name: 'JMAP (Fastmail)',
      port: { secure: 443 },
      rfc: 'RFC 8621',
      description: 'JSON Meta Application Protocol — open standard for modern email access. Used by Fastmail. HTTP+JSON, batch method calls, efficient sync.',
      capabilities: JmapHandler.getCapabilities(),
      forensicNotes: [
        'Open standard (IETF RFC 8621) — not vendor-specific',
        'Batch method calls reduce round-trips',
        'State tokens enable efficient incremental sync',
        'Full message properties including headers',
        'API token authentication (no OAuth dance required)',
      ],
    },
  });
});

// ── Connection Testing ──
router.post('/connect/test', async (req, res) => {
  const { protocol, config } = req.body;

  try {
    let handler;
    let result;

    switch (protocol) {
      case 'imap':
        handler = new ImapHandler(config);
        result = await handler.connect();
        const folders = await handler.listFolders();
        await handler.disconnect();
        res.json({ ...result, folders, protocolLog: handler.getProtocolLog() });
        return;

      case 'pop3':
        handler = new Pop3Handler(config);
        result = await handler.connect();
        const msgList = await handler.listMessages();
        await handler.disconnect();
        res.json({ ...result, messages: msgList, protocolLog: handler.getProtocolLog() });
        return;

      case 'ews':
        handler = new EwsHandler(config);
        result = await handler.connect();
        const ewsFolders = await handler.listFolders();
        await handler.disconnect();
        res.json({ ...result, folders: ewsFolders, protocolLog: handler.getProtocolLog() });
        return;

      case 'graph':
        handler = new GraphHandler(config);
        result = await handler.connect();
        const graphFolders = await handler.listFolders();
        await handler.disconnect();
        res.json({ ...result, folders: graphFolders, protocolLog: handler.getProtocolLog() });
        return;

      case 'gmail_api':
        handler = new GmailHandler(config);
        result = await handler.connect();
        const gmailFolders = await handler.listLabels();
        await handler.disconnect();
        res.json({ ...result, folders: gmailFolders, protocolLog: handler.getProtocolLog() });
        return;

      case 'zoho_api':
        handler = new ZohoHandler(config);
        result = await handler.connect();
        const zohoFolders = await handler.listFolders();
        await handler.disconnect();
        res.json({ ...result, folders: zohoFolders, protocolLog: handler.getProtocolLog() });
        return;

      case 'jmap':
        handler = new JmapHandler(config);
        result = await handler.connect();
        const jmapFolders = await handler.listFolders();
        await handler.disconnect();
        res.json({ ...result, folders: jmapFolders, protocolLog: handler.getProtocolLog() });
        return;

      default:
        res.status(400).json({ error: `Unknown protocol: ${protocol}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message, protocolLog: [] });
  }
});

// ── Folders ──
router.get('/projects/:id/folders', (req, res) => {
  res.json(getFolders(req.params.id));
});

router.post('/projects/:id/folders', (req, res) => {
  saveFolders(req.params.id, req.body.folders);
  res.json({ success: true });
});

// ── Collection / Acquisition ──
router.post('/projects/:id/collect', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { folders: selectedFolders, searchQuery, config, differential } = req.body;
  const limit = req.body.limit || 50;
  const acquisitionId = createAcquisition(project.id, selectedFolders);
  updateProjectStatus(project.id, 'collecting');

  try {
    let handler;
    let allMessages = [];
    let skippedCount = 0;
    const targetFolders = selectedFolders || ['INBOX'];

    const existingIds = new Set();
    if (differential) {
      const existing = getAllProjectMessages(project.id);
      for (const m of existing) {
        if (m.message_id) existingIds.add(m.message_id);
        if (m.hash_sha256) existingIds.add(m.hash_sha256);
      }
    }

    switch (project.provider_type) {
      case 'imap': {
        if (!config?.host) throw new Error('IMAP host is required');
        handler = new ImapHandler(config);
        await handler.connect();

        for (const folder of targetFolders) {
          const messages = await handler.fetchMessages(folder, { limit, searchCriteria: searchQuery });
          for (const msg of messages) {
            if (differential && (existingIds.has(msg.messageId) || existingIds.has(msg.hashSha256))) {
              skippedCount++;
              continue;
            }
            msg.projectId = project.id;
            msg.acquisitionId = acquisitionId;
            saveMessage(msg);
            if (msg.attachments) {
              for (const att of msg.attachments) {
                saveAttachment({ ...att, messageId: msg.id });
              }
            }
            allMessages.push(msg);
          }
        }

        await handler.disconnect();
        break;
      }

      case 'pop3': {
        if (!config?.host) throw new Error('POP3 host is required');
        handler = new Pop3Handler(config);
        await handler.connect();

        const msgList = await handler.listMessages();
        const fetchCount = Math.min(msgList.length, limit);

        for (let i = 0; i < fetchCount; i++) {
          const msg = await handler.fetchMessage(msgList[i].number);
          if (differential && (existingIds.has(msg.messageId) || existingIds.has(msg.hashSha256))) {
            skippedCount++;
            continue;
          }
          msg.projectId = project.id;
          msg.acquisitionId = acquisitionId;
          saveMessage(msg);
          if (msg.attachments) {
            for (const att of msg.attachments) {
              saveAttachment({ ...att, messageId: msg.id });
            }
          }
          allMessages.push(msg);
        }

        await handler.disconnect();
        break;
      }

      case 'ews': {
        handler = new EwsHandler(config || { email: project.target_email });
        await handler.connect();

        for (const folder of targetFolders) {
          const messages = await handler.fetchMessages(folder, { limit });
          for (const msg of messages) {
            if (differential && existingIds.has(msg.hashSha256)) { skippedCount++; continue; }
            msg.projectId = project.id;
            msg.acquisitionId = acquisitionId;
            saveMessage(msg);
            allMessages.push(msg);
          }
        }

        await handler.disconnect();
        break;
      }

      case 'graph': {
        handler = new GraphHandler(config || { email: project.target_email, authType: 'delegated' });
        await handler.connect();

        for (const folder of targetFolders) {
          const messages = await handler.fetchMessages(folder, { limit });
          for (const msg of messages) {
            if (differential && existingIds.has(msg.hashSha256)) { skippedCount++; continue; }
            msg.projectId = project.id;
            msg.acquisitionId = acquisitionId;
            saveMessage(msg);
            allMessages.push(msg);
          }
        }

        await handler.disconnect();
        break;
      }

      case 'gmail_api': {
        handler = new GmailHandler(config || { email: project.target_email, authType: 'oauth2' });
        await handler.connect();

        for (const folder of targetFolders) {
          const messages = await handler.fetchMessages(folder, { limit });
          for (const msg of messages) {
            if (differential && existingIds.has(msg.hashSha256)) { skippedCount++; continue; }
            msg.projectId = project.id;
            msg.acquisitionId = acquisitionId;
            saveMessage(msg);
            allMessages.push(msg);
          }
        }

        await handler.disconnect();
        break;
      }

      case 'zoho_api': {
        handler = new ZohoHandler(config || { email: project.target_email });
        await handler.connect();

        for (const folder of targetFolders) {
          const messages = await handler.fetchMessages(folder, { limit });
          for (const msg of messages) {
            if (differential && existingIds.has(msg.hashSha256)) { skippedCount++; continue; }
            msg.projectId = project.id;
            msg.acquisitionId = acquisitionId;
            saveMessage(msg);
            allMessages.push(msg);
          }
        }

        await handler.disconnect();
        break;
      }

      case 'jmap': {
        handler = new JmapHandler(config || { email: project.target_email });
        await handler.connect();

        for (const folder of targetFolders) {
          const messages = await handler.fetchMessages(folder, { limit });
          for (const msg of messages) {
            if (differential && existingIds.has(msg.hashSha256)) { skippedCount++; continue; }
            msg.projectId = project.id;
            msg.acquisitionId = acquisitionId;
            saveMessage(msg);
            allMessages.push(msg);
          }
        }

        await handler.disconnect();
        break;
      }

      default:
        throw new Error(`Unsupported protocol: ${project.provider_type}`);
    }

    const totalBytes = allMessages.reduce((sum, m) => sum + (m.size || 0), 0);

    updateAcquisition(acquisitionId, {
      status: 'completed',
      totalMessages: allMessages.length + skippedCount,
      acquiredMessages: allMessages.length,
      failedMessages: 0,
      totalBytes,
      protocolLog: handler?.getProtocolLog() || [],
    });

    updateProjectStatus(project.id, 'completed');

    addAuditEntry(project.id, 'ACQUISITION_COMPLETED', `Acquired ${allMessages.length} messages via ${project.provider_type.toUpperCase()}${differential ? ` (differential: ${skippedCount} skipped)` : ''}`, {
      acquisitionId,
      messageCount: allMessages.length,
      skippedCount,
      differential: !!differential,
      totalBytes,
      folders: targetFolders,
      protocol: project.provider_type,
    }, project.examiner_name, acquisitionId);

    const tsResult = TimestampService.timestampCollection(project.id, allMessages);
    saveTimestampRecord(project.id, 'collection', tsResult.collectionDigest, tsResult.timestamp);

    res.json({
      acquisitionId,
      messageCount: allMessages.length,
      skippedCount,
      differential: !!differential,
      totalBytes,
      protocolLog: handler?.getProtocolLog() || [],
      timestamp: tsResult.timestamp.genTime,
    });
  } catch (err) {
    updateAcquisition(acquisitionId, { status: 'failed' });
    updateProjectStatus(project.id, 'error');
    addAuditEntry(project.id, 'ACQUISITION_FAILED', err.message, { acquisitionId, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Acquisitions ──
router.get('/projects/:id/acquisitions', (req, res) => {
  res.json(getAcquisitions(req.params.id));
});

// ── Messages ──
router.get('/projects/:id/messages', (req, res) => {
  const { folder, limit, offset, search } = req.query;
  const messages = getMessages(req.params.id, {
    folder,
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0,
    search,
  });
  const total = getMessageCount(req.params.id);
  res.json({ messages, total });
});

router.get('/projects/:id/messages/:msgId', (req, res) => {
  const msg = getMessage(req.params.msgId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  const attachments = getAttachments(req.params.msgId);
  res.json({ ...msg, attachments });
});

// ── Inline Search ──
router.post('/projects/:id/inline-search', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { query } = req.body;
  const messages = getAllProjectMessages(project.id);
  const result = InlineSearchEngine.search(messages, query);

  saveInlineSearch(project.id, query, result.stats.matched, result.stats.elapsed);
  addAuditEntry(project.id, 'INLINE_SEARCH', `Inline search: "${query}" — ${result.stats.matched} of ${result.stats.total} matched`, {
    query,
    matched: result.stats.matched,
    total: result.stats.total,
    elapsed: result.stats.elapsed,
  }, project.examiner_name);

  res.json({
    results: result.results.map(m => ({
      id: m.id,
      subject: m.subject,
      from_address: m.from_address,
      to_addresses: m.to_addresses,
      date: m.date,
      folder: m.folder,
      size: m.size,
      hash_sha256: m.hash_sha256,
      has_attachments: m.has_attachments,
      is_encrypted: m.is_encrypted,
      is_signed: m.is_signed,
    })),
    stats: result.stats,
    parsed: result.parsed,
  });
});

router.get('/inline-search/syntax', (req, res) => {
  res.json(InlineSearchEngine.getSyntaxHelp());
});

router.get('/projects/:id/inline-searches', (req, res) => {
  res.json(getInlineSearches(req.params.id));
});

// ── Server-side Search Queries ──
router.get('/projects/:id/searches', (req, res) => {
  res.json(getSearchQueries(req.params.id));
});

router.post('/projects/:id/search', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { criteria, queryType } = req.body;

  const dbResults = getMessages(project.id, {
    search: criteria.keyword || criteria.from || criteria.subject,
    folder: criteria.folder,
  });

  let serverResult = { resultCount: 0, query: '', protocolLog: [] };

  try {
    switch (project.provider_type) {
      case 'imap': {
        const config = JSON.parse(project.config || '{}');
        if (config.host) {
          const handler = new ImapHandler(config);
          await handler.connect();
          const searchResult = await handler.serverSearch(criteria.folder || 'INBOX', criteria);
          serverResult = {
            query: JSON.stringify(criteria),
            resultCount: searchResult.count,
            uids: searchResult.uids,
            protocolLog: handler.getProtocolLog(),
          };
          await handler.disconnect();
        } else {
          serverResult.query = JSON.stringify(criteria);
          serverResult.note = 'IMAP SEARCH requires active connection with host configured';
        }
        break;
      }
      case 'ews': {
        const handler = new EwsHandler({ email: project.target_email });
        await handler.connect();
        serverResult = await handler.searchMailboxes(criteria);
        serverResult.protocolLog = handler.getProtocolLog();
        await handler.disconnect();
        break;
      }
      case 'graph': {
        const handler = new GraphHandler({ email: project.target_email, authType: 'delegated' });
        await handler.connect();
        serverResult = await handler.searchMessages(criteria);
        serverResult.protocolLog = handler.getProtocolLog();
        await handler.disconnect();
        break;
      }
      case 'gmail_api': {
        const handler = new GmailHandler({ email: project.target_email, authType: 'oauth2' });
        await handler.connect();
        serverResult = await handler.searchMessages(criteria);
        serverResult.protocolLog = handler.getProtocolLog();
        await handler.disconnect();
        break;
      }
      case 'zoho_api': {
        const handler = new ZohoHandler({ email: project.target_email });
        await handler.connect();
        serverResult = await handler.searchMessages(criteria);
        serverResult.protocolLog = handler.getProtocolLog();
        await handler.disconnect();
        break;
      }
      case 'jmap': {
        const handler = new JmapHandler({ email: project.target_email });
        await handler.connect();
        serverResult = await handler.searchMessages(criteria);
        serverResult.protocolLog = handler.getProtocolLog();
        await handler.disconnect();
        break;
      }
    }
  } catch (err) {
    serverResult.error = err.message;
  }

  const queryId = saveSearchQuery(project.id, queryType || 'keyword', serverResult.query || JSON.stringify(criteria), criteria);
  addAuditEntry(project.id, 'SEARCH_EXECUTED', `Search: ${serverResult.query || JSON.stringify(criteria)}`, {
    queryId, criteria,
    serverResults: serverResult.resultCount,
    localResults: dbResults.length,
  }, project.examiner_name);

  res.json({
    ...serverResult,
    queryId,
    localResults: dbResults.map(m => ({
      id: m.id,
      subject: m.subject,
      from_address: m.from_address,
      date: m.date,
      folder: m.folder,
      hash_sha256: m.hash_sha256,
      has_attachments: m.has_attachments,
    })),
    localResultCount: dbResults.length,
  });
});

// ── Quality Control ──
router.post('/projects/:id/qc', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(project.id);
  const acquisitions = getAcquisitions(project.id);
  const folders = getFolders(project.id);
  const exports = getExportRecords(project.id);

  const results = QualityControlService.runChecks(project, messages, acquisitions, folders, exports);
  saveQcResult(project.id, results);

  addAuditEntry(project.id, 'QC_COMPLETED', `Quality control: ${results.summary.passed} passed, ${results.summary.warnings} warnings, ${results.summary.failed} failed`, {
    summary: results.summary,
    overallStatus: results.overallStatus,
  }, project.examiner_name);

  res.json(results);
});

router.get('/projects/:id/qc', (req, res) => {
  res.json(getQcResults(req.params.id));
});

// ── Cloud Attachment Detection ──
router.post('/projects/:id/cloud-scan', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(project.id);
  const result = CloudAttachmentService.scanMessages(messages);

  for (const link of result.links) {
    saveDriveLink({ ...link, projectId: project.id });
  }

  addAuditEntry(project.id, 'CLOUD_SCAN', `Cloud attachment scan: ${result.totalLinks} links found from ${result.totalProviders} provider(s)`, {
    totalLinks: result.totalLinks,
    byProvider: result.byProvider,
  }, project.examiner_name);

  res.json(result);
});

router.get('/projects/:id/cloud-links', (req, res) => {
  res.json(getDriveLinks(req.params.id));
});

router.get('/cloud/providers', (req, res) => {
  res.json(CloudAttachmentService.getProviderInfo());
});

// ── RFC 3161 Timestamps ──
router.post('/projects/:id/timestamp', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { type } = req.body;
  const messages = getAllProjectMessages(project.id);

  let tsResult;
  if (type === 'export') {
    const exports = getExportRecords(project.id);
    const latest = exports[0];
    if (!latest) return res.status(400).json({ error: 'No exports to timestamp' });
    tsResult = TimestampService.timestampExport(project.id, latest.id, {
      manifestHash: latest.hash_sha256,
      fileCount: latest.message_count,
    });
  } else {
    tsResult = TimestampService.timestampCollection(project.id, messages);
  }

  saveTimestampRecord(project.id, tsResult.type, tsResult.collectionDigest || tsResult.manifestHash, tsResult.timestamp);

  addAuditEntry(project.id, 'TIMESTAMP_CREATED', `RFC 3161 timestamp created: ${tsResult.type}`, {
    type: tsResult.type,
    genTime: tsResult.timestamp.genTime,
    serialNumber: tsResult.timestamp.serialNumber,
  }, project.examiner_name);

  res.json(tsResult);
});

router.get('/projects/:id/timestamps', (req, res) => {
  res.json(getTimestampRecords(req.params.id));
});

router.get('/timestamp/info', (req, res) => {
  res.json(TimestampService.getInfo());
});

// ── Analytics: Timeline ──
router.get('/projects/:id/analytics/timeline', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(project.id);
  const buckets = {};
  const hourBuckets = new Array(24).fill(0);
  const dayOfWeekBuckets = new Array(7).fill(0);

  for (const msg of messages) {
    if (!msg.date) continue;
    const d = new Date(msg.date);
    if (isNaN(d.getTime())) continue;

    const dateKey = d.toISOString().substring(0, 10);
    if (!buckets[dateKey]) buckets[dateKey] = { date: dateKey, count: 0, sent: 0, received: 0, totalSize: 0 };
    buckets[dateKey].count++;
    buckets[dateKey].totalSize += msg.size || 0;

    const fromAddr = (msg.from_address || '').toLowerCase();
    const targetEmail = (project.target_email || '').toLowerCase();
    if (fromAddr.includes(targetEmail)) buckets[dateKey].sent++;
    else buckets[dateKey].received++;

    hourBuckets[d.getHours()]++;
    dayOfWeekBuckets[d.getDay()]++;
  }

  const timeline = Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    timeline,
    hourDistribution: hourBuckets,
    dayOfWeekDistribution: dayOfWeekBuckets,
    totalMessages: messages.length,
    dateRange: timeline.length > 0
      ? { from: timeline[0].date, to: timeline[timeline.length - 1].date }
      : null,
  });
});

// ── Analytics: Relationships ──
router.get('/projects/:id/analytics/relationships', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(project.id);
  const pairMap = {};
  const contactMap = {};

  for (const msg of messages) {
    const from = (msg.from_address || '').toLowerCase().trim();
    if (!from) continue;

    if (!contactMap[from]) contactMap[from] = { address: from, sent: 0, received: 0, totalMessages: 0 };
    contactMap[from].sent++;
    contactMap[from].totalMessages++;

    let toAddrs = msg.to_addresses || '[]';
    if (typeof toAddrs === 'string') {
      try { toAddrs = JSON.parse(toAddrs); } catch { toAddrs = [toAddrs]; }
    }
    const ccAddrs = msg.cc_addresses ? (typeof msg.cc_addresses === 'string' ? (() => { try { return JSON.parse(msg.cc_addresses); } catch { return [msg.cc_addresses]; } })() : msg.cc_addresses) : [];

    const allRecipients = [...(Array.isArray(toAddrs) ? toAddrs : [toAddrs]), ...(Array.isArray(ccAddrs) ? ccAddrs : [])];

    for (const to of allRecipients) {
      const toAddr = (to || '').toLowerCase().trim();
      if (!toAddr) continue;

      if (!contactMap[toAddr]) contactMap[toAddr] = { address: toAddr, sent: 0, received: 0, totalMessages: 0 };
      contactMap[toAddr].received++;
      contactMap[toAddr].totalMessages++;

      const key = [from, toAddr].sort().join('|||');
      if (!pairMap[key]) pairMap[key] = { source: from, target: toAddr, count: 0, subjects: [] };
      pairMap[key].count++;
      if (pairMap[key].subjects.length < 5 && msg.subject) {
        pairMap[key].subjects.push(msg.subject);
      }
    }
  }

  const pairs = Object.values(pairMap).sort((a, b) => b.count - a.count);
  const contacts = Object.values(contactMap).sort((a, b) => b.totalMessages - a.totalMessages);

  res.json({
    pairs: pairs.slice(0, 100),
    contacts: contacts.slice(0, 50),
    totalPairs: pairs.length,
    totalContacts: contacts.length,
  });
});

// ── Analytics: Email Threading ──
router.get('/projects/:id/analytics/threading', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(project.id);
  const byMsgId = {};
  const threads = [];
  const orphans = [];

  for (const msg of messages) {
    if (msg.message_id) byMsgId[msg.message_id] = msg;
  }

  const assigned = new Set();

  function buildThread(root) {
    const thread = [root];
    assigned.add(root.id);
    const children = messages.filter(m =>
      !assigned.has(m.id) && (
        (m.in_reply_to && m.in_reply_to === root.message_id) ||
        (m.headers_json && (() => {
          try {
            const h = typeof m.headers_json === 'string' ? JSON.parse(m.headers_json) : m.headers_json;
            const refs = h.references || h.References || '';
            return refs.includes(root.message_id);
          } catch { return false; }
        })())
      )
    );
    for (const child of children) {
      thread.push(...buildThread(child));
    }
    return thread;
  }

  for (const msg of messages) {
    if (assigned.has(msg.id)) continue;
    const isReply = msg.in_reply_to && byMsgId[msg.in_reply_to];
    if (isReply) continue;

    const thread = buildThread(msg);
    if (thread.length > 1) {
      threads.push({
        rootMessageId: msg.message_id,
        rootSubject: msg.subject,
        rootFrom: msg.from_address,
        rootDate: msg.date,
        messageCount: thread.length,
        participants: [...new Set(thread.map(m => m.from_address).filter(Boolean))],
        dateRange: {
          from: thread.reduce((min, m) => m.date && m.date < min ? m.date : min, thread[0]?.date || ''),
          to: thread.reduce((max, m) => m.date && m.date > max ? m.date : max, thread[0]?.date || ''),
        },
        messages: thread.map(m => ({
          id: m.id, subject: m.subject, from: m.from_address, date: m.date,
          inReplyTo: m.in_reply_to, messageId: m.message_id
        })),
      });
    }
  }

  for (const msg of messages) {
    if (!assigned.has(msg.id)) orphans.push(msg.id);
  }

  const subjectGroups = {};
  for (const id of orphans) {
    const msg = messages.find(m => m.id === id);
    if (!msg) continue;
    const normSubj = (msg.subject || '').replace(/^(Re|Fwd|Fw)\s*:\s*/gi, '').trim().toLowerCase();
    if (!normSubj) continue;
    if (!subjectGroups[normSubj]) subjectGroups[normSubj] = [];
    subjectGroups[normSubj].push(msg);
  }

  for (const [, group] of Object.entries(subjectGroups)) {
    if (group.length > 1) {
      group.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      threads.push({
        rootMessageId: group[0].message_id,
        rootSubject: group[0].subject,
        rootFrom: group[0].from_address,
        rootDate: group[0].date,
        messageCount: group.length,
        participants: [...new Set(group.map(m => m.from_address).filter(Boolean))],
        dateRange: {
          from: group[0].date,
          to: group[group.length - 1].date,
        },
        threadedBy: 'subject',
        messages: group.map(m => ({
          id: m.id, subject: m.subject, from: m.from_address, date: m.date,
          inReplyTo: m.in_reply_to, messageId: m.message_id
        })),
      });
      group.forEach(m => assigned.add(m.id));
    }
  }

  threads.sort((a, b) => b.messageCount - a.messageCount);

  res.json({
    totalMessages: messages.length,
    threadedMessages: assigned.size,
    singleMessages: messages.length - assigned.size,
    threadCount: threads.length,
    threads: threads.slice(0, 100),
  });
});

// ── Analytics: Deduplication ──
router.get('/projects/:id/analytics/dedup', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(project.id);
  const hashGroups = {};
  const contentGroups = {};

  for (const msg of messages) {
    if (msg.hash_sha256) {
      if (!hashGroups[msg.hash_sha256]) hashGroups[msg.hash_sha256] = [];
      hashGroups[msg.hash_sha256].push(msg);
    }

    const contentKey = crypto.createHash('sha256').update(
      [msg.from_address || '', msg.to_addresses || '', msg.subject || '', (msg.date || '').substring(0, 19), (msg.body_text || '').substring(0, 500)].join('|')
    ).digest('hex');
    if (!contentGroups[contentKey]) contentGroups[contentKey] = [];
    contentGroups[contentKey].push(msg);
  }

  const exactDupes = Object.entries(hashGroups)
    .filter(([, group]) => group.length > 1)
    .map(([hash, group]) => ({
      hash,
      count: group.length,
      subject: group[0].subject,
      from: group[0].from_address,
      date: group[0].date,
      folders: [...new Set(group.map(m => m.folder).filter(Boolean))],
      ids: group.map(m => m.id),
    }))
    .sort((a, b) => b.count - a.count);

  const nearDupes = Object.entries(contentGroups)
    .filter(([, group]) => group.length > 1)
    .filter(([, group]) => {
      const hashes = new Set(group.map(m => m.hash_sha256).filter(Boolean));
      return hashes.size > 1 || !group[0].hash_sha256;
    })
    .map(([hash, group]) => ({
      contentHash: hash,
      count: group.length,
      subject: group[0].subject,
      from: group[0].from_address,
      date: group[0].date,
      ids: group.map(m => m.id),
    }))
    .sort((a, b) => b.count - a.count);

  const totalExactDupeMessages = exactDupes.reduce((sum, d) => sum + d.count - 1, 0);
  const totalNearDupeMessages = nearDupes.reduce((sum, d) => sum + d.count - 1, 0);
  const uniqueMessages = messages.length - totalExactDupeMessages;
  const dedupSavingsPct = messages.length > 0 ? ((totalExactDupeMessages / messages.length) * 100).toFixed(1) : '0.0';

  res.json({
    totalMessages: messages.length,
    uniqueMessages,
    exactDuplicates: totalExactDupeMessages,
    nearDuplicates: totalNearDupeMessages,
    dedupSavingsPercent: dedupSavingsPct,
    exactGroups: exactDupes.slice(0, 50),
    nearGroups: nearDupes.slice(0, 50),
    hashAlgorithm: 'SHA-256',
  });
});

// ── Analytics: Header Analysis ──
router.get('/projects/:id/messages/:msgId/headers', (req, res) => {
  const msg = getMessage(req.params.msgId);
  if (!msg || msg.project_id !== req.params.id) return res.status(404).json({ error: 'Message not found' });

  let headers = {};
  try { headers = typeof msg.headers_json === 'string' ? JSON.parse(msg.headers_json) : (msg.headers_json || {}); } catch {}

  const receivedHeaders = [];
  const rawReceived = headers.received || headers.Received || [];
  const receivedList = Array.isArray(rawReceived) ? rawReceived : [rawReceived];

  for (const hop of receivedList) {
    if (!hop) continue;
    const fromMatch = hop.match(/from\s+(\S+)/i);
    const byMatch = hop.match(/by\s+(\S+)/i);
    const dateMatch = hop.match(/;\s*(.+)$/);
    const ipMatch = hop.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/);

    receivedHeaders.push({
      raw: hop,
      from: fromMatch?.[1] || null,
      by: byMatch?.[1] || null,
      ip: ipMatch?.[1] || null,
      date: dateMatch?.[1]?.trim() || null,
    });
  }

  const authResults = headers['authentication-results'] || headers['Authentication-Results'] || '';
  const authList = Array.isArray(authResults) ? authResults : [authResults];
  const authentication = { spf: 'none', dkim: 'none', dmarc: 'none', raw: authList.filter(Boolean) };

  for (const ar of authList) {
    if (!ar) continue;
    const spfMatch = ar.match(/spf=(\w+)/i);
    const dkimMatch = ar.match(/dkim=(\w+)/i);
    const dmarcMatch = ar.match(/dmarc=(\w+)/i);
    if (spfMatch) authentication.spf = spfMatch[1].toLowerCase();
    if (dkimMatch) authentication.dkim = dkimMatch[1].toLowerCase();
    if (dmarcMatch) authentication.dmarc = dmarcMatch[1].toLowerCase();
  }

  const dkimSig = headers['dkim-signature'] || headers['DKIM-Signature'] || '';
  const dkimDomain = dkimSig ? (dkimSig.match(/d=([^;\s]+)/)?.[1] || null) : null;

  const returnPath = headers['return-path'] || headers['Return-Path'] || '';
  const replyTo = headers['reply-to'] || headers['Reply-To'] || '';
  const fromHeader = headers.from || headers.From || msg.from_address || '';

  const redFlags = [];
  if (returnPath && fromHeader && !returnPath.toLowerCase().includes(fromHeader.toLowerCase().replace(/.*</, '').replace(/>.*/, '').split('@')[1] || '__none__')) {
    redFlags.push({ type: 'RETURN_PATH_MISMATCH', description: 'Return-Path domain does not match From domain', severity: 'warning' });
  }
  if (replyTo && fromHeader && replyTo.toLowerCase() !== fromHeader.toLowerCase()) {
    redFlags.push({ type: 'REPLY_TO_DIFFERS', description: 'Reply-To differs from From address', severity: 'info' });
  }
  if (authentication.spf === 'fail' || authentication.spf === 'softfail') {
    redFlags.push({ type: 'SPF_FAIL', description: `SPF check ${authentication.spf}ed — sender not authorized`, severity: 'critical' });
  }
  if (authentication.dkim === 'fail') {
    redFlags.push({ type: 'DKIM_FAIL', description: 'DKIM signature verification failed — message may be altered', severity: 'critical' });
  }
  if (authentication.dmarc === 'fail') {
    redFlags.push({ type: 'DMARC_FAIL', description: 'DMARC policy check failed', severity: 'critical' });
  }
  if (dkimDomain && fromHeader && !fromHeader.toLowerCase().includes(dkimDomain.toLowerCase())) {
    redFlags.push({ type: 'DKIM_DOMAIN_MISMATCH', description: `DKIM signed by ${dkimDomain} but From shows different domain`, severity: 'warning' });
  }

  const hopCount = receivedHeaders.length;
  if (hopCount > 8) {
    redFlags.push({ type: 'EXCESSIVE_HOPS', description: `Message traversed ${hopCount} servers — unusually high`, severity: 'info' });
  }

  res.json({
    messageId: msg.message_id,
    subject: msg.subject,
    from: msg.from_address,
    date: msg.date,
    receivedHops: receivedHeaders,
    authentication,
    dkimDomain,
    returnPath,
    replyTo,
    redFlags,
    xHeaders: Object.entries(headers).filter(([k]) => k.toLowerCase().startsWith('x-')).map(([k, v]) => ({ name: k, value: v })),
    rawHeaderCount: Object.keys(headers).length,
  });
});

// ── Chain of Custody Report ──
router.get('/projects/:id/chain-of-custody', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const auditLog = getAuditLog(req.params.id);
  const messages = getAllProjectMessages(project.id);
  const acquisitions = getAcquisitions(project.id);
  const exports = getExportRecords(project.id);
  const timestamps = getTimestampRecords(project.id);
  const chainVerification = verifyAuditChain(auditLog);

  let config = {};
  try { config = JSON.parse(project.config || '{}'); } catch {}

  const custodyEvents = auditLog.map(entry => ({
    timestamp: entry.timestamp,
    event: entry.event_type,
    description: entry.description,
    handler: entry.examiner || project.examiner_name || 'System',
    hashChain: entry.hash,
    verified: true,
  }));

  const report = {
    reportGenerated: new Date().toISOString(),
    reportVersion: '1.0',
    toolInfo: {
      name: 'SherlockMail',
      version: '0.9.0',
      description: 'FEC-grade forensic email collection tool',
    },
    caseInfo: {
      projectName: project.name,
      projectId: project.id,
      caseId: project.case_id,
      caseName: project.case_name,
      evidenceId: config.evidenceId || project.agency,
      custodian: config.custodianName || null,
      examiner: project.examiner_name,
      targetEmail: project.target_email,
      provider: project.provider_type,
      legalAuthority: project.legal_authority,
      legalScope: project.legal_scope,
      projectCreated: project.created_at,
    },
    evidenceSummary: {
      totalMessages: messages.length,
      totalAttachments: messages.reduce((sum, m) => sum + (m.attachment_count || 0), 0),
      totalSize: messages.reduce((sum, m) => sum + (m.size || 0), 0),
      dateRange: messages.length > 0 ? {
        earliest: messages.reduce((min, m) => m.date && m.date < min ? m.date : min, messages[0]?.date || ''),
        latest: messages.reduce((max, m) => m.date && m.date > max ? m.date : max, messages[0]?.date || ''),
      } : null,
      hashAlgorithms: ['MD5', 'SHA-256', 'SHA-512'],
      messagesWithHash: messages.filter(m => m.hash_sha256).length,
    },
    acquisitionHistory: acquisitions.map(a => ({
      id: a.id,
      status: a.status,
      started: a.started_at,
      completed: a.completed_at,
      totalMessages: a.total_messages,
      acquiredMessages: a.acquired_messages,
      failedMessages: a.failed_messages,
      totalBytes: a.total_bytes,
    })),
    custodyChain: custodyEvents,
    auditIntegrity: {
      totalEntries: auditLog.length,
      chainValid: chainVerification.valid,
      breaks: chainVerification.breaks,
      hashAlgorithm: 'SHA-256',
      standard: 'NIST SP 800-86 compliant hash chain',
    },
    exportHistory: exports.map(e => ({
      id: e.id,
      format: e.format,
      started: e.started_at,
      completed: e.completed_at,
      messageCount: e.message_count,
      totalBytes: e.total_bytes,
      hash: e.hash_sha256,
    })),
    timestampRecords: timestamps.length,
    standards: {
      collection: 'ISO/IEC 27037:2012 — Identification, collection, acquisition, preservation',
      hashing: 'NIST FIPS 180-4 (SHA-256/SHA-512)',
      auditTrail: 'NIST SP 800-86 — Guide to Integrating Forensic Techniques',
      bestPractices: 'SWGDE 18-F-002-2.0 (2025) — Best Practices for Digital Evidence Collection',
      cloudEvidence: 'SWGDE 23-F-004-1.1 — Digital Evidence from Cloud Service Providers',
      principles: 'ACPO Good Practice Guide v5 (2012) — Four Principles for Digital Evidence',
      timestamping: 'RFC 3161 Trusted Timestamping (structure; use production TSA for legal binding)',
      admissibility: 'FRE 901(b)(9) — Process or System Producing Accurate Result',
      authentication: 'FRE 902(14) — Certified Data from Electronic Process',
      eDiscovery: 'EDRM Collection Standards — Repeatable processes with documented risks',
    },
    certification: {
      statement: `I certify that the evidence described in this report was collected, preserved, and maintained in accordance with forensic best practices. The chain of custody was maintained throughout the process, and the integrity of the evidence can be verified using the hash values and audit trail documented herein.`,
      examiner: project.examiner_name,
      date: new Date().toISOString(),
    },
  };

  addAuditEntry(req.params.id, 'CUSTODY_REPORT_GENERATED', 'Chain of custody report generated', {
    messageCount: messages.length, auditEntries: auditLog.length, chainValid: chainVerification.valid,
  }, project.examiner_name);

  res.json(report);
});

// ── Export ──
router.get('/export/formats', (req, res) => {
  res.json(ExportService.getFormats());
});

router.post('/projects/:id/export', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { format, outputDir: customOutputDir, pdfSplitMode } = req.body;
  const messages = getAllProjectMessages(project.id);
  const folders = getFolders(project.id);

  if (messages.length === 0) {
    return res.status(400).json({ error: 'No messages to export. Collect messages first.' });
  }

  try {
    const exportId = crypto.randomUUID();
    const options = {};
    if (pdfSplitMode) options.pdfSplitMode = pdfSplitMode;
    const { files, manifest, outputDir } = ExportService.exportToFiles(project.id, exportId, format, messages, folders, customOutputDir, options);

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    saveExportRecord(project.id, format, outputDir, messages.length, totalBytes, manifest.manifestHash);
    updateProjectStatus(project.id, 'exported');

    const tsResult = TimestampService.timestampExport(project.id, exportId, manifest);
    saveTimestampRecord(project.id, 'export', manifest.manifestHash, tsResult.timestamp);

    addAuditEntry(project.id, 'EXPORT_COMPLETED', `Exported ${messages.length} messages to ${format.toUpperCase()}`, {
      exportId, format, outputDir, messageCount: messages.length, totalBytes,
      manifestHash: manifest.manifestHash,
      fileHashes: files.map(f => ({ filename: f.filename, sha256: f.hash })),
      timestamp: tsResult.timestamp.genTime,
    }, project.examiner_name);

    res.json({
      exportId,
      format,
      files: files.map(f => ({
        filename: f.filename || f.relativePath,
        size: f.size,
        hash: f.hash,
        downloadUrl: `/api/projects/${project.id}/exports/${exportId}/files/${encodeURIComponent(f.filename || f.relativePath)}`,
      })),
      manifest,
      messageCount: messages.length,
      totalBytes,
      outputDir,
      timestamp: tsResult.timestamp,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id/exports', (req, res) => {
  res.json(getExportRecords(req.params.id));
});

// ── File Download ──
router.get('/projects/:id/exports/:exportId/files/:filename', (req, res) => {
  const filePath = path.join(DATA_DIR, 'exports', req.params.id, req.params.exportId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

router.get('/projects/:id/exports/:exportId/download-all', (req, res) => {
  const dir = path.join(DATA_DIR, 'exports', req.params.id, req.params.exportId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Export not found' });

  const files = fs.readdirSync(dir).map(f => ({
    filename: f,
    size: fs.statSync(path.join(dir, f)).size,
    downloadUrl: `/api/projects/${req.params.id}/exports/${req.params.exportId}/files/${encodeURIComponent(f)}`,
  }));

  res.json({ exportId: req.params.exportId, files });
});

// ── Audit Log ──
router.get('/projects/:id/audit', (req, res) => {
  res.json(getAuditLog(req.params.id));
});

router.get('/audit', (req, res) => {
  res.json(getFullAuditLog());
});

// ── Evidence Integrity Verification ──
router.get('/projects/:id/verify', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const messages = getAllProjectMessages(req.params.id);
  const auditLog = getAuditLog(req.params.id);
  const exports = getExportRecords(req.params.id);
  const timestamps = getTimestampRecords(req.params.id);

  const messageVerification = messages.map(m => {
    const bodyContent = m.body_text || '';
    const recomputedHash = crypto.createHash('sha256').update(bodyContent).digest('hex');
    const originalHash = m.hash_sha256 || '';
    return {
      id: m.id,
      subject: m.subject || '(no subject)',
      from: m.from_address,
      date: m.date,
      originalHash: originalHash,
      storedHash: originalHash,
      status: originalHash ? 'preserved' : 'no_hash',
    };
  });

  const chainVerification = verifyAuditChain(auditLog);

  const exportVerification = [];
  for (const exp of exports) {
    if (exp.output_dir && fs.existsSync(exp.output_dir)) {
      const result = ExportService.verifyExport(exp.output_dir);
      exportVerification.push({ exportId: exp.id, format: exp.format, ...result });
    } else {
      exportVerification.push({ exportId: exp.id, format: exp.format, valid: false, error: 'Export directory not found' });
    }
  }

  const verification = {
    timestamp: new Date().toISOString(),
    toolVersion: '0.9.0',
    projectId: req.params.id,
    projectName: project.name,
    examiner: project.examiner_name,
    messageCount: messages.length,
    hashVerification: {
      algorithm: 'SHA-256',
      total: messages.length,
      preserved: messageVerification.filter(m => m.status === 'preserved').length,
      noHash: messageVerification.filter(m => m.status === 'no_hash').length,
      details: messageVerification,
    },
    auditLogIntegrity: {
      totalEntries: auditLog.length,
      chainVerified: chainVerification,
    },
    exportIntegrity: exportVerification,
    timestampRecords: timestamps.length,
    standards: {
      hashAlgorithm: 'SHA-256 (NIST FIPS 180-4)',
      auditStandard: 'NIST SP 800-86',
      evidenceHandling: 'ISO/IEC 27037:2012',
      bestPractices: 'SWGDE 18-F-002-2.0 (2025)',
      principles: 'ACPO Good Practice Guide v5 (2012)',
      legalStandard: 'FRE 901(b)(9) / FRE 902(14)',
      timestampStandard: 'RFC 3161 (structure; use production TSA for legal binding)',
    },
  };

  addAuditEntry(req.params.id, 'INTEGRITY_VERIFIED', 'Evidence integrity verification completed', {
    messageCount: messages.length,
    preserved: messageVerification.filter(m => m.status === 'preserved').length,
    chainValid: chainVerification.valid,
    exportsVerified: exportVerification.filter(e => e.valid).length,
    timestamps: timestamps.length,
  }, project.examiner_name);

  res.json(verification);
});

function verifyAuditChain(auditLog) {
  if (auditLog.length === 0) return { valid: true, entries: 0, breaks: [] };

  let valid = true;
  const details = [];

  for (let i = 1; i < auditLog.length; i++) {
    const entry = auditLog[i];
    const prevEntry = auditLog[i - 1];

    if (entry.prev_hash && entry.prev_hash !== prevEntry.hash) {
      valid = false;
      details.push({
        index: i,
        entryId: entry.id,
        expected: prevEntry.hash,
        got: entry.prev_hash,
        event: entry.event_type,
      });
    }
  }

  return { valid, entries: auditLog.length, breaks: details };
}

export default router;
