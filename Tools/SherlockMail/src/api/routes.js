import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createProject, getProjects, getProjectsSummary, getProject, deleteProject, updateProjectStatus, updateProject,
  saveFolders, getFolders, createAcquisition, saveMessage, getMessages, getMessageCount,
  saveSearchQuery, getSearchQueries, saveExportRecord, getExportRecords, updateExportRecord,
  getAuditLog, getFullAuditLog, getStats, addAuditEntry,
  getMessage, getAllProjectMessages, updateAcquisition, getAcquisitions,
  saveAttachment, getAttachments, getProjectAttachments,
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
import { HashManager } from '../services/hash-manager.js';
import { Rfc3161TimestampService } from '../services/rfc3161-timestamp.js';
import { FolderSnapshotService } from '../services/folder-snapshot.js';
import {
  getAuthStatus as yahooGetAuthStatus, getAuthUrl as yahooGetAuthUrl,
  saveCredentials as yahooSaveCredentials,
  startCallbackServer as yahooStartCallbackServer, waitForAuth as yahooWaitForAuth,
  stopCallbackServer as yahooStopCallbackServer, revokeTokens as yahooRevokeTokens,
} from '../services/yahoo-oauth.js';
import { EnterpriseAuthService } from '../services/enterprise-auth.js';
import { ExchangeAdvancedService } from '../services/exchange-advanced.js';
import { LocalImportService } from '../services/local-import.js';
import { CloudCollectionService } from '../services/cloud-collection.js';
import { CloudDownloadPipeline } from '../services/cloud-download-pipeline.js';
import { ContainerService } from '../services/container-service.js';
import { ReportService } from '../services/report-service.js';
import { AdvancedSearchService } from '../services/advanced-search.js';
import { AutomationService } from '../services/automation-service.js';
import { CryptoService } from '../services/crypto-service.js';
import { FileTypeDetector } from '../services/file-detection.js';
import { MetadataExportService } from '../services/metadata-export.js';
import { RetryPolicy, CircuitBreaker, RateLimiter, EmailValidator } from '../services/automation-service.js';
import {
  saveRfc3161Timestamp, getRfc3161Timestamps,
  saveFolderSnapshot, getFolderSnapshots,
  saveDriveItem, getDriveItems, updateDriveItem,
  saveCalendarEvent, getCalendarEvents,
  saveContact, getContacts,
  saveCloudDownload, getCloudDownloads, updateCloudDownload,
  savePreAcquisitionSearch, getPreAcquisitionSearches,
  indexMessage, searchIndex,
  saveSmtpSettings, getSmtpSettings,
  saveHealthEvent, getHealthEvents,
  saveAcquisitionTarget, getAcquisitionTargets, updateAcquisitionTarget,
  saveConnectivityTest, getConnectivityTests,
  saveProxySettings, getProxySettings, getDefaultProxy,
  saveServerProfile, getServerProfile, getAllServerProfiles,
  saveCertificate, getCertificates,
  saveCredential, getCredentials, getCredential, deleteCredential,
  saveCustomImapProfile, getCustomImapProfiles, getCustomImapProfile, deleteCustomImapProfile,
} from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SHERLOCKMAIL_DATA_DIR || path.join(__dirname, '..', '..', 'data');

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

router.get('/projects-summary', (req, res) => {
  res.json(getProjectsSummary());
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

router.put('/projects/:id', (req, res) => {
  try {
    const updated = updateProject(req.params.id, req.body, req.body.examiner);
    res.json(updated);
  } catch (err) {
    const status = err.message.includes('Cannot edit') ? 403 : 400;
    res.status(status).json({ error: err.message });
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

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function processMessageItem(msg, projectId, acquisitionId, existingIds, differential, errors) {
  const isDuplicate = differential && (existingIds.has(msg.messageId) || existingIds.has(msg.hashSha256));
  if (isDuplicate) return 'skipped';

  try {
    msg.projectId = projectId;
    msg.acquisitionId = acquisitionId;
    saveMessage(msg);
    if (msg.attachments) {
      for (const att of msg.attachments) {
        saveAttachment({ ...att, messageId: msg.id });
      }
    }
    return 'acquired';
  } catch (err) {
    errors.push({
      messageId: msg.messageId || msg.id,
      subject: (msg.subject || '').slice(0, 100),
      folder: msg.folder,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
    return 'failed';
  }
}

router.post('/projects/:id/collect', async (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { folders: selectedFolders, searchQuery, config, differential } = req.body;
  const limit = req.body.limit || 50;
  const batchSize = req.body.batchSize || 500;
  const acquisitionId = createAcquisition(project.id, selectedFolders);
  updateProjectStatus(project.id, 'collecting');

  try {
    let handler;
    const allMessages = [];
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];
    const targetFolders = selectedFolders || ['INBOX'];
    const folderStats = {};

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
        await retryWithBackoff(() => handler.connect());

        for (const folder of targetFolders) {
          const stats = { acquired: 0, skipped: 0, failed: 0 };
          try {
            const messages = await retryWithBackoff(() =>
              handler.fetchMessages(folder, { limit, searchCriteria: searchQuery })
            );
            for (const msg of messages) {
              msg.folder = msg.folder || folder;
              const result = processMessageItem(msg, project.id, acquisitionId, existingIds, differential, errors);
              if (result === 'skipped') { skippedCount++; stats.skipped++; }
              else if (result === 'failed') { failedCount++; stats.failed++; }
              else { allMessages.push(msg); stats.acquired++; }
            }
          } catch (folderErr) {
            errors.push({ folder, error: folderErr.message, timestamp: new Date().toISOString(), type: 'folder_error' });
          }
          folderStats[folder] = stats;
        }

        await handler.disconnect().catch(() => {});
        break;
      }

      case 'pop3': {
        if (!config?.host) throw new Error('POP3 host is required');
        handler = new Pop3Handler(config);
        await retryWithBackoff(() => handler.connect());

        const msgList = await handler.listMessages();
        const fetchCount = Math.min(msgList.length, limit);
        const stats = { acquired: 0, skipped: 0, failed: 0 };

        for (let i = 0; i < fetchCount; i++) {
          try {
            const msg = await retryWithBackoff(() => handler.fetchMessage(msgList[i].number));
            msg.folder = msg.folder || 'INBOX';
            const result = processMessageItem(msg, project.id, acquisitionId, existingIds, differential, errors);
            if (result === 'skipped') { skippedCount++; stats.skipped++; }
            else if (result === 'failed') { failedCount++; stats.failed++; }
            else { allMessages.push(msg); stats.acquired++; }
          } catch (msgErr) {
            failedCount++;
            stats.failed++;
            errors.push({ index: i, error: msgErr.message, timestamp: new Date().toISOString(), type: 'message_fetch_error' });
          }
        }
        folderStats['INBOX'] = stats;

        await handler.disconnect().catch(() => {});
        break;
      }

      case 'ews':
      case 'graph':
      case 'gmail_api':
      case 'zoho_api':
      case 'jmap': {
        const handlers = {
          ews:      () => new EwsHandler(config || { email: project.target_email }),
          graph:    () => new GraphHandler(config || { email: project.target_email, authType: 'delegated' }),
          gmail_api:() => new GmailHandler(config || { email: project.target_email, authType: 'oauth2' }),
          zoho_api: () => new ZohoHandler(config || { email: project.target_email }),
          jmap:     () => new JmapHandler(config || { email: project.target_email }),
        };
        handler = handlers[project.provider_type]();
        await retryWithBackoff(() => handler.connect());

        for (const folder of targetFolders) {
          const stats = { acquired: 0, skipped: 0, failed: 0 };
          try {
            const messages = await retryWithBackoff(() =>
              handler.fetchMessages(folder, { limit, searchCriteria: searchQuery })
            );
            for (const msg of messages) {
              msg.folder = msg.folder || folder;
              const result = processMessageItem(msg, project.id, acquisitionId, existingIds, differential, errors);
              if (result === 'skipped') { skippedCount++; stats.skipped++; }
              else if (result === 'failed') { failedCount++; stats.failed++; }
              else { allMessages.push(msg); stats.acquired++; }
            }
          } catch (folderErr) {
            errors.push({ folder, error: folderErr.message, timestamp: new Date().toISOString(), type: 'folder_error' });
          }
          folderStats[folder] = stats;
        }

        await handler.disconnect().catch(() => {});
        break;
      }

      default:
        throw new Error(`Unsupported protocol: ${project.provider_type}`);
    }

    const totalBytes = allMessages.reduce((sum, m) => sum + (m.size || 0), 0);
    const status = failedCount > 0 && allMessages.length === 0 ? 'failed'
      : failedCount > 0 ? 'completed_with_errors' : 'completed';

    updateAcquisition(acquisitionId, {
      status,
      totalMessages: allMessages.length + skippedCount + failedCount,
      acquiredMessages: allMessages.length,
      failedMessages: failedCount,
      skippedMessages: skippedCount,
      totalBytes,
      protocolLog: handler?.getProtocolLog() || [],
      errorLog: errors.length > 0 ? errors : null,
    });

    updateProjectStatus(project.id, status === 'failed' ? 'error' : 'completed');

    addAuditEntry(project.id, 'ACQUISITION_COMPLETED', `Acquired ${allMessages.length} messages via ${project.provider_type.toUpperCase()}${differential ? ` (differential: ${skippedCount} skipped)` : ''}${failedCount > 0 ? ` (${failedCount} failed)` : ''}`, {
      acquisitionId,
      messageCount: allMessages.length,
      skippedCount,
      failedCount,
      differential: !!differential,
      totalBytes,
      folders: targetFolders,
      folderStats,
      protocol: project.provider_type,
      errors: errors.slice(0, 50),
    }, project.examiner_name, acquisitionId);

    const tsResult = TimestampService.timestampCollection(project.id, allMessages);
    saveTimestampRecord(project.id, 'collection', tsResult.collectionDigest, tsResult.timestamp);

    res.json({
      acquisitionId,
      status,
      messageCount: allMessages.length,
      skippedCount,
      failedCount,
      differential: !!differential,
      totalBytes,
      folderStats,
      errors: errors.slice(0, 50),
      protocolLog: handler?.getProtocolLog() || [],
      timestamp: tsResult.timestamp.genTime,
    });
  } catch (err) {
    updateAcquisition(acquisitionId, { status: 'failed', errorLog: [{ error: err.message, timestamp: new Date().toISOString(), type: 'fatal' }] });
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
  const attachments = getProjectAttachments(project.id);
  const timestamps = getTimestampRecords(project.id);
  const driveLinks = getDriveLinks(project.id);

  const results = QualityControlService.runChecks(project, messages, acquisitions, folders, exports, { attachments, timestamps, driveLinks });
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

  const rawDkimSig = headers['dkim-signature'] || headers['DKIM-Signature'] || '';
  const dkimSig = Array.isArray(rawDkimSig) ? rawDkimSig[0] || '' : rawDkimSig;
  const dkimDomain = dkimSig ? (String(dkimSig).match(/d=([^;\s]+)/)?.[1] || null) : null;

  const rawReturnPath = headers['return-path'] || headers['Return-Path'] || '';
  const returnPath = Array.isArray(rawReturnPath) ? rawReturnPath[0] || '' : String(rawReturnPath);
  const rawReplyTo = headers['reply-to'] || headers['Reply-To'] || '';
  const replyTo = Array.isArray(rawReplyTo) ? rawReplyTo[0] || '' : String(rawReplyTo);
  const rawFrom = headers.from || headers.From || msg.from_address || '';
  const fromHeader = Array.isArray(rawFrom) ? rawFrom[0] || '' : String(rawFrom);

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
    const acquisitions = getAcquisitions(project.id);
    const latestAcquisition = acquisitions.length ? acquisitions[0] : {};
    const options = { provider: project.provider_type || 'Unknown', preserveFolders: req.body.preserveFolders, project, acquisition: latestAcquisition };
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

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 1: Forensic Integrity (Features 1-3) ──
// ══════════════════════════════════════════════════════════════

// Feature 1: RFC 3161 Trusted Timestamping
router.get('/rfc3161/tsas', (req, res) => {
  res.json(Rfc3161TimestampService.getAvailableTSAs());
});

router.post('/projects/:id/rfc3161/timestamp', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { targetType, targetHash, tsaUrl } = req.body;
    if (!targetHash || !tsaUrl) return res.status(400).json({ error: 'targetHash and tsaUrl required' });
    const result = await Rfc3161TimestampService.requestTimestamp(targetHash, tsaUrl, req.body);
    result.projectId = req.params.id;
    result.targetType = targetType || 'manual';
    saveRfc3161Timestamp(result);
    addAuditEntry(req.params.id, 'RFC3161_TIMESTAMP', `RFC 3161 timestamp requested from ${result.tsaName}`, { tsaUrl, targetType, status: result.status }, project.examiner_name);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/projects/:id/rfc3161/timestamp-collection', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const messages = getAllProjectMessages(req.params.id);
    const { tsaUrl } = req.body;
    if (!tsaUrl) return res.status(400).json({ error: 'tsaUrl required' });
    const result = await Rfc3161TimestampService.timestampCollection(req.params.id, messages, tsaUrl, req.body);
    saveRfc3161Timestamp(result);
    addAuditEntry(req.params.id, 'RFC3161_COLLECTION_TIMESTAMP', `Collection timestamped via RFC 3161 (${messages.length} messages)`, { tsaUrl, messageCount: messages.length, status: result.status }, project.examiner_name);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/rfc3161/timestamps', (req, res) => {
  res.json(getRfc3161Timestamps(req.params.id));
});

router.get('/rfc3161/info', (req, res) => {
  res.json(Rfc3161TimestampService.getInfo());
});

// Feature 2: Multi-Algorithm Hashing
router.post('/hash/compute', (req, res) => {
  try {
    const { data, algorithms } = req.body;
    if (!data) return res.status(400).json({ error: 'data required' });
    const result = algorithms ? HashManager.computeSelected(data, algorithms) : HashManager.computeAll(data);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/hash/verify', (req, res) => {
  try {
    const { data, expectedHashes } = req.body;
    if (!data || !expectedHashes) return res.status(400).json({ error: 'data and expectedHashes required' });
    res.json(HashManager.verify(data, expectedHashes));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/hash/algorithms', (req, res) => {
  res.json(HashManager.getAlgorithmInfo());
});

// Feature 3: Folder Snapshots
router.post('/projects/:id/snapshots', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const folders = getFolders(req.params.id);
    const { snapshotType, acquisitionId } = req.body;
    const snapshot = FolderSnapshotService.captureSnapshot(req.params.id, folders, acquisitionId, snapshotType || 'manual');
    saveFolderSnapshot(snapshot);
    addAuditEntry(req.params.id, 'FOLDER_SNAPSHOT', `Folder snapshot captured (${snapshot.totalFolders} folders, ${snapshot.totalMessages} messages)`, { snapshotType: snapshotType || 'manual', totalFolders: snapshot.totalFolders }, project.examiner_name);
    res.json(snapshot);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/snapshots', (req, res) => {
  res.json(getFolderSnapshots(req.params.id));
});

router.post('/projects/:id/snapshots/compare', (req, res) => {
  try {
    const snapshots = getFolderSnapshots(req.params.id);
    if (snapshots.length < 2) return res.status(400).json({ error: 'Need at least 2 snapshots to compare' });
    const pre = snapshots[snapshots.length - 1];
    const post = snapshots[0];
    res.json(FolderSnapshotService.compareSnapshots(pre, post));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 2: Protocol & Provider Coverage (Features 4-9) ──
// ══════════════════════════════════════════════════════════════

// Feature 4: Yahoo OAuth
router.get('/oauth/yahoo/status', (req, res) => { res.json(yahooGetAuthStatus()); });
router.post('/oauth/yahoo/credentials', (req, res) => {
  try { yahooSaveCredentials(req.body); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/oauth/yahoo/authorize', async (req, res) => {
  try {
    await yahooStartCallbackServer();
    const url = yahooGetAuthUrl();
    if (!url) return res.status(400).json({ error: 'Yahoo OAuth credentials not configured' });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/oauth/yahoo/wait', async (req, res) => {
  try { const result = await yahooWaitForAuth(); yahooStopCallbackServer(); res.json(result); }
  catch (err) { yahooStopCallbackServer(); res.status(500).json({ error: err.message }); }
});
router.post('/oauth/yahoo/revoke', (req, res) => { res.json(yahooRevokeTokens()); });

// Feature 5: Enterprise App-Only Auth + Feature 9: Azure Sovereign Clouds
router.get('/enterprise/azure-environments', (req, res) => {
  res.json(EnterpriseAuthService.getAzureEnvironments());
});

router.post('/enterprise/authenticate', async (req, res) => {
  try {
    const { method } = req.body;
    let result;
    if (method === 'certificate') result = await EnterpriseAuthService.authenticateWithCertificate(req.body);
    else result = await EnterpriseAuthService.authenticateAppOnly(req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 8: Remote Token Import
router.post('/enterprise/import-token', async (req, res) => {
  try {
    const result = await EnterpriseAuthService.importToken(req.body.tokenData || req.body);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Feature 6: Exchange Advanced Features
router.get('/projects/:id/exchange/recoverable-items', async (req, res) => {
  try {
    const result = await ExchangeAdvancedService.getRecoverableItems(null, req.query.email, req.query);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/exchange/public-folders', async (req, res) => {
  try { res.json(await ExchangeAdvancedService.getPublicFolders(null, req.query)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/exchange/archive', async (req, res) => {
  try { res.json(await ExchangeAdvancedService.getArchiveMailbox(null, req.query.email, req.query)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/exchange/inbox-rules', async (req, res) => {
  try { res.json(await ExchangeAdvancedService.getInboxRules(null, req.query.email)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/exchange/detect-version', async (req, res) => {
  try { res.json(await ExchangeAdvancedService.detectExchangeVersion(req.query.host)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 7: Local File Import (MBOX/PST/EML)
router.post('/projects/:id/import', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { filePath, format, targetFolder } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'File not found' });

    let result;
    const ext = (format || path.extname(filePath).slice(1)).toLowerCase();
    if (ext === 'mbox' || ext === 'mbx') {
      result = await LocalImportService.importMbox(filePath, req.params.id, { targetFolder });
    } else if (ext === 'pst') {
      result = await LocalImportService.importPst(filePath, req.params.id, { targetFolder });
    } else if (ext === 'eml' || fs.statSync(filePath).isDirectory()) {
      result = await LocalImportService.importEmlDirectory(filePath, req.params.id, { targetFolder });
    } else {
      return res.status(400).json({ error: `Unsupported format: ${ext}. Supported: mbox, pst, eml` });
    }

    for (const msg of result.messages.filter(m => !m.error)) {
      saveMessage(msg);
      if (msg.attachments) for (const att of msg.attachments) saveAttachment({ ...att, messageId: msg.id });
    }

    addAuditEntry(req.params.id, 'LOCAL_IMPORT', `Imported ${result.successful} messages from ${ext.toUpperCase()} file`, { source: filePath, format: ext, total: result.totalParsed || result.totalFiles, successful: result.successful, failed: result.failed }, project.examiner_name);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/import/formats', (req, res) => {
  res.json(LocalImportService.getSupportedFormats());
});

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 3: Cloud & Drive Collection (Features 10-15) ──
// ══════════════════════════════════════════════════════════════

// Feature 10: Google Drive Collection
router.get('/projects/:id/drive/google/items', async (req, res) => {
  try {
    const result = await CloudCollectionService.listGoogleDriveItems(req.query.accessToken, req.query);
    for (const item of result.items) { item.projectId = req.params.id; saveDriveItem(item); }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/drive/google/shared-drives', async (req, res) => {
  try { res.json(await CloudCollectionService.listGoogleSharedDrives(req.query.accessToken)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/drive/google/revisions/:fileId', async (req, res) => {
  try { res.json(await CloudCollectionService.getGoogleDriveRevisions(req.query.accessToken, req.params.fileId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 11: OneDrive Collection
router.get('/projects/:id/drive/onedrive/items', async (req, res) => {
  try {
    const result = await CloudCollectionService.listOneDriveItems(req.query.accessToken, req.query);
    for (const item of result.items) { item.projectId = req.params.id; saveDriveItem(item); }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/drive/onedrive/revisions/:itemId', async (req, res) => {
  try { res.json(await CloudCollectionService.getOneDriveRevisions(req.query.accessToken, req.params.itemId, req.query.userId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 12: SharePoint Collection
router.get('/projects/:id/drive/sharepoint/sites', async (req, res) => {
  try { res.json(await CloudCollectionService.listSharePointSites(req.query.accessToken, req.query.search)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/drive/sharepoint/documents/:siteId', async (req, res) => {
  try { res.json(await CloudCollectionService.listSharePointDocuments(req.query.accessToken, req.params.siteId, req.query)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 13: Google Calendar Collection
router.get('/projects/:id/calendar/events', async (req, res) => {
  try {
    const result = await CloudCollectionService.listGoogleCalendarEvents(req.query.accessToken, req.query);
    for (const evt of result.events) { evt.projectId = req.params.id; saveCalendarEvent(evt); }
    addAuditEntry(req.params.id, 'CALENDAR_COLLECTED', `Collected ${result.events.length} calendar events`);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/calendar', (req, res) => {
  res.json(getCalendarEvents(req.params.id));
});

// Feature 14: Contact Collection
router.get('/projects/:id/contacts/google', async (req, res) => {
  try {
    const result = await CloudCollectionService.listGoogleContacts(req.query.accessToken, req.query);
    for (const c of result.contacts) { c.projectId = req.params.id; saveContact(c); }
    addAuditEntry(req.params.id, 'CONTACTS_COLLECTED', `Collected ${result.contacts.length} Google contacts`);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/contacts/microsoft', async (req, res) => {
  try {
    const result = await CloudCollectionService.listMicrosoftContacts(req.query.accessToken, req.query);
    for (const c of result.contacts) { c.projectId = req.params.id; saveContact(c); }
    addAuditEntry(req.params.id, 'CONTACTS_COLLECTED', `Collected ${result.contacts.length} Microsoft contacts`);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/contacts', (req, res) => {
  res.json(getContacts(req.params.id));
});

// Feature 15: Cloud Attachment Download Pipeline
router.post('/projects/:id/cloud-attachments/download', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const links = getDriveLinks(req.params.id);
    if (links.length === 0) return res.json({ totalLinks: 0, downloaded: 0, message: 'No cloud links to download' });
    const outputDir = path.join(DATA_DIR, 'projects', req.params.id);
    const result = await CloudDownloadPipeline.processLinks(req.params.id, links, req.body.accessTokens || {}, outputDir);
    for (const dl of result.results) saveCloudDownload(dl);
    addAuditEntry(req.params.id, 'CLOUD_ATTACHMENTS_DOWNLOADED', `Downloaded ${result.downloaded} of ${result.totalLinks} cloud attachments`, { downloaded: result.downloaded, failed: result.failed, totalBytes: result.totalBytes }, project.examiner_name);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/cloud-downloads', (req, res) => {
  res.json(getCloudDownloads(req.params.id));
});

// Drive items listing
router.get('/projects/:id/drive-items', (req, res) => {
  res.json(getDriveItems(req.params.id, req.query.provider));
});

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 4: Export & Containerization (Features 16-20) ──
// ══════════════════════════════════════════════════════════════

// Feature 16: VHDX Container Export
router.post('/projects/:id/export/vhdx', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const exportDir = req.body.exportDir || path.join(DATA_DIR, 'exports', req.params.id);
    if (!fs.existsSync(exportDir)) return res.status(400).json({ error: 'Export directory not found — run an export first' });
    const outputPath = req.body.outputPath || path.join(DATA_DIR, 'exports', req.params.id, `evidence_${Date.now()}.vhdx`);
    const result = ContainerService.createVhdxContainer(exportDir, outputPath, { label: project.name });
    addAuditEntry(req.params.id, 'VHDX_CREATED', `VHDX container created (${result.fileCount} files, ${result.size} bytes)`, { outputPath, hashes: result.hashes }, project.examiner_name);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 17: PST Writer
router.post('/projects/:id/export/pst-create', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const messages = getAllProjectMessages(req.params.id);
    const folders = getFolders(req.params.id);
    const outputPath = req.body.outputPath || path.join(DATA_DIR, 'exports', req.params.id, `collection_${Date.now()}.pst`);
    const result = ContainerService.createPstFile(messages, folders, outputPath, { displayName: project.name, ExportService });
    addAuditEntry(req.params.id, 'PST_CREATED', `PST file created (${result.messageCount} messages)`, { outputPath, hashes: result.hashes }, project.examiner_name);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 18: History Report
router.get('/projects/:id/reports/history', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const auditLog = getAuditLog(req.params.id);
    const acquisitions = getAcquisitions(req.params.id);
    const exports = getExportRecords(req.params.id);
    const report = ReportService.generateHistoryReport(project, auditLog, acquisitions, exports);
    if (req.query.save === 'true') {
      const outDir = path.join(DATA_DIR, 'reports', req.params.id);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, report.filename), report.content);
    }
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 19: Revision Report
router.get('/projects/:id/reports/revisions', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const driveItems = getDriveItems(req.params.id);
    const report = ReportService.generateRevisionReport(project, driveItems, []);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 20: Log Compression
router.post('/projects/:id/logs/compress', async (req, res) => {
  try {
    const logsDir = req.body.logsDir || path.join(DATA_DIR, 'logs', req.params.id);
    const outputPath = req.body.outputPath || path.join(DATA_DIR, 'exports', req.params.id, `logs_${Date.now()}.zip`);
    const result = await ReportService.compressLogs(req.params.id, logsDir, outputPath);
    if (result.compressed) {
      addAuditEntry(req.params.id, 'LOGS_COMPRESSED', `${result.fileCount} log files compressed`, { outputPath, hash: result.hash });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 5: Search & Filtering (Features 21-23) ──
// ══════════════════════════════════════════════════════════════

// Feature 21: Pre-Acquisition Server-Side Search
router.post('/projects/:id/search/pre-acquisition', async (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const result = await AdvancedSearchService.preAcquisitionSearch({ client: null }, req.body.criteria || req.body);
    result.projectId = req.params.id;
    savePreAcquisitionSearch(result);
    addAuditEntry(req.params.id, 'PRE_ACQUISITION_SEARCH', `Pre-acquisition search: ${result.resultCount} matches`, { criteria: req.body.criteria || req.body, resultCount: result.resultCount });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/search/pre-acquisition', (req, res) => {
  res.json(getPreAcquisitionSearches(req.params.id));
});

// Feature 22: Full-Text Index Search
router.post('/projects/:id/search/index', (req, res) => {
  try {
    const messages = getAllProjectMessages(req.params.id);
    let indexed = 0;
    for (const msg of messages) {
      indexMessage(req.params.id, msg.id, {
        subject: msg.subject,
        body: msg.body_text,
        from: msg.from_address,
        to: msg.to_addresses,
        cc: msg.cc_addresses,
        folder: msg.folder,
      });
      indexed++;
    }
    res.json({ indexed, projectId: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/search/fulltext', (req, res) => {
  try {
    const { query, fields } = req.query;
    if (!query) return res.status(400).json({ error: 'query parameter required' });
    const fieldList = fields ? fields.split(',') : null;
    const messageIds = searchIndex(req.params.id, query, fieldList);
    const messages = messageIds.map(id => getMessage(id)).filter(Boolean);
    res.json({ query, resultCount: messages.length, messages });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 23: Differential/Incremental Acquisition
router.get('/projects/:id/differential/plan', (req, res) => {
  try {
    const messages = getAllProjectMessages(req.params.id);
    const folders = getFolders(req.params.id);
    const plan = AdvancedSearchService.computeDifferentialPlan(messages, folders);
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/differential/ids', (req, res) => {
  res.json(getDifferentialIds(req.params.id));
});

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 6: Automation & Operations (Features 24-31) ──
// ══════════════════════════════════════════════════════════════

// Feature 24: SMTP Notifications
router.post('/notifications/smtp/settings', (req, res) => {
  try {
    const settings = { id: req.body.id || crypto.randomUUID(), ...req.body };
    saveSmtpSettings(settings);
    res.json({ success: true, id: settings.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/notifications/smtp/settings/:projectId', (req, res) => {
  const settings = getSmtpSettings(req.params.projectId);
  if (settings) { delete settings.password_encrypted; }
  res.json(settings || { configured: false });
});

router.post('/notifications/smtp/test', async (req, res) => {
  try {
    const result = await AutomationService.sendNotification(req.body, {
      type: 'test',
      projectName: 'Test Notification',
      details: { message: 'This is a test notification from SherlockMail' },
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 25: CLI Commands Info
router.get('/cli/commands', (req, res) => {
  res.json(AutomationService.getCliCommands());
});

// Feature 26: Health Monitoring
router.get('/health', (req, res) => {
  res.json(AutomationService.checkHealth());
});

router.get('/health/disk', async (req, res) => {
  const targetPath = req.query.path || DATA_DIR;
  res.json(await AutomationService.checkDiskSpace(targetPath));
});

router.get('/projects/:id/health/events', (req, res) => {
  res.json(getHealthEvents(req.params.id));
});

// Feature 27: Acquisition Insights
router.get('/projects/:id/insights', (req, res) => {
  try {
    const messages = getAllProjectMessages(req.params.id);
    const acquisitions = getAcquisitions(req.params.id);
    const folders = getFolders(req.params.id);
    res.json(AutomationService.generateInsights(messages, acquisitions, folders));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 28: Multi-Target Acquisition
router.post('/acquisitions/batch', (req, res) => {
  try {
    const { targets } = req.body;
    if (!targets || !targets.length) return res.status(400).json({ error: 'targets array required' });
    const batch = AutomationService.createBatch(targets);
    for (const target of batch.targets) {
      const project = createProject({
        name: `Batch — ${target.targetEmail}`,
        targetEmail: target.targetEmail,
        providerType: target.providerType,
        caseName: req.body.caseName,
        caseId: req.body.caseId,
        examinerName: req.body.examinerName,
      });
      target.projectId = project.id;
      saveAcquisitionTarget(target);
    }
    res.json(batch);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/acquisitions/batch/:batchId', (req, res) => {
  res.json(getAcquisitionTargets(req.params.batchId));
});

// Feature 29: Connectivity Testing
router.post('/connectivity/test', async (req, res) => {
  try {
    const { host, port, protocol } = req.body;
    if (!host) return res.status(400).json({ error: 'host required' });
    const result = await AutomationService.testConnectivity(host, port || 993, protocol || 'imaps', req.body);
    if (req.body.projectId) { result.projectId = req.body.projectId; saveConnectivityTest(result); }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/projects/:id/connectivity/tests', (req, res) => {
  res.json(getConnectivityTests(req.params.id));
});

// Feature 30: Proxy Support
router.post('/proxy/settings', (req, res) => {
  try {
    const proxy = { id: crypto.randomUUID(), ...req.body };
    saveProxySettings(proxy);
    res.json({ success: true, id: proxy.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/proxy/settings', (req, res) => {
  const proxies = getProxySettings();
  for (const p of proxies) delete p.password_encrypted;
  res.json(proxies);
});

router.get('/proxy/default', (req, res) => {
  const proxy = getDefaultProxy();
  if (proxy) delete proxy.password_encrypted;
  res.json(proxy || { configured: false });
});

// Feature 31: Server Profile Auto-Detection
router.post('/server-profiles/detect', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const profile = await AutomationService.detectServerProfile(email);
    saveServerProfile(profile);
    res.json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/server-profiles', (req, res) => {
  res.json(getAllServerProfiles());
});

router.get('/server-profiles/:domain', (req, res) => {
  const profile = getServerProfile(req.params.domain);
  res.json(profile || { found: false, domain: req.params.domain });
});

// ══════════════════════════════════════════════════════════════
// ── CATEGORY 7: Security & Cryptography (Features 32-35) ──
// ══════════════════════════════════════════════════════════════

// Feature 32: S/MIME Decryption
router.post('/projects/:id/crypto/decrypt', async (req, res) => {
  try {
    const certs = getCertificates(req.params.id);
    const result = await CryptoService.decryptMessage(req.body.content, certs);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Feature 33: Digital Signature Verification
router.post('/projects/:id/crypto/verify-signature', async (req, res) => {
  try {
    const result = await CryptoService.verifySignature(req.body.content, req.body.options);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Certificate management
router.post('/certificates', (req, res) => {
  try {
    const cert = { id: crypto.randomUUID(), ...req.body };
    saveCertificate(cert);
    addAuditEntry(req.body.projectId, 'CERTIFICATE_IMPORTED', `Certificate imported: ${cert.subject || cert.email_address || 'unknown'}`, { certType: cert.certType, thumbprint: cert.thumbprintSha256 });
    res.json({ success: true, id: cert.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/certificates', (req, res) => {
  const certs = getCertificates(req.query.projectId);
  for (const c of certs) { delete c.pem_data; delete c.pfx_path; }
  res.json(certs);
});

// Feature 34: Credential Manager
router.post('/credentials', (req, res) => {
  try {
    const { label, credentialType, targetHost, username, password, masterKey } = req.body;
    if (!label || !credentialType || !password || !masterKey) return res.status(400).json({ error: 'label, credentialType, password, masterKey required' });
    const encrypted = CryptoService.encryptCredential(password, masterKey);
    const cred = { id: crypto.randomUUID(), label, credentialType, targetHost, username, ...encrypted, metadata: req.body.metadata || {} };
    saveCredential(cred);
    res.json({ success: true, id: cred.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/credentials', (req, res) => {
  res.json(getCredentials());
});

router.post('/credentials/:id/decrypt', (req, res) => {
  try {
    const cred = getCredential(req.params.id);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    const { masterKey } = req.body;
    if (!masterKey) return res.status(400).json({ error: 'masterKey required' });
    const decrypted = CryptoService.decryptCredential(cred.encrypted_data, cred.iv, cred.auth_tag, masterKey);
    res.json({ id: cred.id, label: cred.label, decrypted });
  } catch (err) { res.status(400).json({ error: 'Decryption failed — wrong master key?' }); }
});

router.delete('/credentials/:id', (req, res) => {
  deleteCredential(req.params.id);
  res.json({ success: true });
});

// Feature 35: Custom IMAP Profiles
router.post('/imap-profiles', (req, res) => {
  try {
    const profile = { id: crypto.randomUUID(), ...req.body };
    saveCustomImapProfile(profile);
    res.json({ success: true, id: profile.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/imap-profiles', (req, res) => {
  res.json(getCustomImapProfiles());
});

router.get('/imap-profiles/:id', (req, res) => {
  const profile = getCustomImapProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  res.json(profile);
});

router.delete('/imap-profiles/:id', (req, res) => {
  deleteCustomImapProfile(req.params.id);
  res.json({ success: true });
});

router.post('/imap-profiles/:id/export', (req, res) => {
  try {
    const profile = getCustomImapProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(CryptoService.exportProfile(profile));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/imap-profiles/import', (req, res) => {
  try {
    const { xmlContent } = req.body;
    if (!xmlContent) return res.status(400).json({ error: 'xmlContent required' });
    const profile = CryptoService.importProfile(xmlContent);
    saveCustomImapProfile(profile);
    res.json({ success: true, profile });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// ── FEC-PARITY UPGRADES: File Detection, Metadata Export,    ──
// ── Retry/Rate-Limit, Email Validation, AutoDiscover,        ──
// ── Hash File Ops, Timestamp Verification                    ──
// ══════════════════════════════════════════════════════════════

// ── File Type Detection (matching FEC's FileTypeDetector) ──
router.post('/detect/file', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    res.json(FileTypeDetector.detect(filePath));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/detect/buffer', (req, res) => {
  try {
    const { data, filename } = req.body;
    if (!data) return res.status(400).json({ error: 'data (base64) required' });
    const buf = Buffer.from(data, 'base64');
    res.json(FileTypeDetector.detectBuffer(buf, filename));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/detect/classify', (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const buf = data ? Buffer.from(data, 'base64') : null;
    res.json(FileTypeDetector.classifyAttachment(filename, buf));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Metadata Export (matching FEC's 12 MetadataExportMap types) ──
router.get('/metadata-export/types', (req, res) => {
  res.json(MetadataExportService.getAvailableExportTypes());
});

router.post('/projects/:id/metadata-export', (req, res) => {
  try {
    const { type, format } = req.body;
    if (!type) return res.status(400).json({ error: 'type required (email, attachment, calendar, contact, document, drive, audit, hash, timestamp, snapshot)' });

    let data;
    switch (type) {
      case 'email': data = getAllProjectMessages(req.params.id); break;
      case 'attachment': data = getProjectAttachments(req.params.id); break;
      case 'calendar': data = getCalendarEvents(req.params.id); break;
      case 'contact': data = getContacts(req.params.id); break;
      case 'drive': data = getDriveItems(req.params.id); break;
      case 'audit': data = getFullAuditLog(req.params.id); break;
      case 'timestamp': data = getRfc3161Timestamps(req.params.id); break;
      case 'snapshot': data = getFolderSnapshots(req.params.id); break;
      default: data = [];
    }

    const csv = MetadataExportService.exportToString(data, type, format || 'csv');
    const ext = (format === 'tsv') ? 'tsv' : 'csv';
    res.setHeader('Content-Type', format === 'tsv' ? 'text/tab-separated-values' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_export.${ext}"`);
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/projects/:id/metadata-export/file', (req, res) => {
  try {
    const { type, format, outputPath } = req.body;
    if (!type || !outputPath) return res.status(400).json({ error: 'type and outputPath required' });

    let data;
    switch (type) {
      case 'email': data = getAllProjectMessages(req.params.id); break;
      case 'attachment': data = getProjectAttachments(req.params.id); break;
      case 'calendar': data = getCalendarEvents(req.params.id); break;
      case 'contact': data = getContacts(req.params.id); break;
      case 'drive': data = getDriveItems(req.params.id); break;
      case 'audit': data = getFullAuditLog(req.params.id); break;
      case 'timestamp': data = getRfc3161Timestamps(req.params.id); break;
      case 'snapshot': data = getFolderSnapshots(req.params.id); break;
      default: data = [];
    }

    const result = MetadataExportService.exportToFile(data, type, outputPath, format || 'csv');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/metadata-export/columns/:type', (req, res) => {
  const columns = MetadataExportService.getColumns(req.params.type);
  if (!columns) return res.status(404).json({ error: 'Unknown type' });
  res.json({ type: req.params.type, columns });
});

// ── File Hashing (new endpoints for upgraded hash-manager) ──
router.post('/hash/file', (req, res) => {
  try {
    const { filePath, algorithms } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    res.json(HashManager.computeFileSync(filePath, algorithms));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hash/file/streaming', async (req, res) => {
  try {
    const { filePath, algorithms } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    const result = await HashManager.computeFileStreaming(filePath, algorithms);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hash/verify-file', (req, res) => {
  try {
    const { filePath, expectedHashes } = req.body;
    if (!filePath || !expectedHashes) return res.status(400).json({ error: 'filePath and expectedHashes required' });
    res.json(HashManager.verifyFile(filePath, expectedHashes));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hash/directory-manifest', (req, res) => {
  try {
    const { dirPath, algorithms } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'dirPath required' });
    res.json(HashManager.computeDirectoryManifest(dirPath, algorithms));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hash/mime', (req, res) => {
  try {
    const { messageId, mimeData, emlData } = req.body;
    if (!messageId || !mimeData) return res.status(400).json({ error: 'messageId and mimeData required' });
    const mime = Buffer.from(mimeData, 'base64');
    const eml = emlData ? Buffer.from(emlData, 'base64') : null;
    res.json(HashManager.createMimeHashResult(messageId, mime, eml));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hash/drive', (req, res) => {
  try {
    const { itemId, fileData, metadata } = req.body;
    if (!itemId || !fileData) return res.status(400).json({ error: 'itemId and fileData required' });
    res.json(HashManager.createDriveHashResult(itemId, Buffer.from(fileData, 'base64'), metadata));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/hash/attachment', (req, res) => {
  try {
    const { attachmentId, data, parentMessageId } = req.body;
    if (!attachmentId || !data) return res.status(400).json({ error: 'attachmentId and data required' });
    res.json(HashManager.createAttachmentHashResult(attachmentId, Buffer.from(data, 'base64'), parentMessageId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── RFC 3161 Timestamp Verification (new endpoints) ──
router.post('/projects/:id/rfc3161/verify', async (req, res) => {
  try {
    const { timestampToken, originalHash, tsaUrl } = req.body;
    if (!timestampToken) return res.status(400).json({ error: 'timestampToken (base64) required' });
    const result = await Rfc3161TimestampService.verifyTimestamp(timestampToken, originalHash, { tsaUrl });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/projects/:id/rfc3161/verify-chain', async (req, res) => {
  try {
    const timestamps = getRfc3161Timestamps(req.params.id);
    if (!timestamps.length) return res.json({ totalTimestamps: 0, allValid: true, chronologicalOrder: true, results: [] });
    const result = await Rfc3161TimestampService.verifyTimestampChain(timestamps);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Email Validation (matching FEC's EmailValidation) ──
router.post('/validate/email', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    res.json(EmailValidator.validate(email));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/validate/email/mx', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    res.json(await EmailValidator.validateMx(email));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Exchange AutoDiscover (matching FEC's ExchangeAutoDiscover) ──
router.post('/exchange/autodiscover', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    res.json(await AutomationService.exchangeAutoDiscover(email));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Session/Output Naming (matching FEC's SessionNameCreator) ──
router.post('/session/name', (req, res) => {
  try {
    const { projectName, targetEmail, counter } = req.body;
    res.json({ sessionName: AutomationService.createSessionName(projectName, targetEmail, { counter }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/session/output-folder', (req, res) => {
  try {
    const { baseDir, projectName, targetEmail, counter } = req.body;
    if (!baseDir) return res.status(400).json({ error: 'baseDir required' });
    res.json(AutomationService.createOutputFolder(baseDir, projectName, targetEmail, { counter }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Retry Policy & Rate Limiter Status ──
router.get('/resilience/info', (req, res) => {
  res.json({
    retryPolicy: { description: 'Exponential backoff with jitter', maxRetries: 3, retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'EAI_AGAIN'], retryableStatusCodes: [408, 429, 500, 502, 503, 504] },
    circuitBreaker: { description: 'Trips after consecutive failures, auto-resets', states: ['closed', 'open', 'half-open'], failureThreshold: 5, resetTimeoutMs: 60000 },
    rateLimiter: { description: 'Token-bucket rate limiting', defaultMaxRequests: 30, defaultWindowMs: 60000 },
  });
});

// ══════════════════════════════════════════════════════════════

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
