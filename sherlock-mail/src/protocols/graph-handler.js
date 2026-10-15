import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getAccessToken, getAuthStatus } from '../services/microsoft-oauth.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class GraphHandler {
  constructor(config) {
    this.config = config;
    this.protocolLog = [];
    this.accessToken = null;
    this.userEmail = null;
  }

  log(direction, message) {
    this.protocolLog.push({
      timestamp: new Date().toISOString(),
      direction,
      message
    });
  }

  async graphFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Graph API error (${res.status})`);
    }

    if (res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }
    return res;
  }

  async connect() {
    const status = getAuthStatus();
    if (!status.authorized) {
      throw new Error('Microsoft account not authorized. Click "Authorize with Microsoft" first.');
    }

    this.accessToken = await getAccessToken();

    this.log('CLIENT', 'Connecting to Microsoft Graph API via OAuth2');
    this.log('C→S', `GET ${GRAPH_BASE}/me`);

    const profile = await this.graphFetch('/me');
    this.userEmail = profile.mail || profile.userPrincipalName;

    this.log('S→C', `200 OK - displayName: "${profile.displayName}", mail: "${this.userEmail}"`);

    this.log('C→S', `GET ${GRAPH_BASE}/me/mailFolders?$top=1`);
    await this.graphFetch('/me/mailFolders?$top=1&$select=id');
    this.log('S→C', `200 OK - mail folders accessible`);

    return {
      success: true,
      email: this.userEmail,
      displayName: profile.displayName,
      graphVersion: 'v1.0',
      capabilities: this.constructor.getCapabilities(),
    };
  }

  async listFolders() {
    this.log('C→S', `GET ${GRAPH_BASE}/me/mailFolders?$top=100`);

    const data = await this.graphFetch('/me/mailFolders?$top=100');
    const mailFolders = data.value || [];

    const folders = mailFolders.map(f => ({
      id: uuidv4(),
      path: f.displayName,
      name: f.displayName,
      graphFolderId: f.id,
      totalMessages: f.totalItemCount || 0,
      unseenMessages: f.unreadItemCount || 0,
    }));

    this.log('S→C', `200 OK - ${folders.length} mail folders returned`);

    for (const f of mailFolders) {
      const childData = await this.graphFetch(`/me/mailFolders/${f.id}/childFolders?$top=50`);
      if (childData.value?.length) {
        for (const child of childData.value) {
          folders.push({
            id: uuidv4(),
            path: `${f.displayName}/${child.displayName}`,
            name: child.displayName,
            graphFolderId: child.id,
            totalMessages: child.totalItemCount || 0,
            unseenMessages: child.unreadItemCount || 0,
            parentPath: f.displayName,
          });
        }
      }
    }

    return folders;
  }

  async searchMessages(criteria) {
    const searchParams = [];
    const filterParams = [];

    if (criteria.keyword) searchParams.push(`"${criteria.keyword}"`);
    if (criteria.from) filterParams.push(`from/emailAddress/address eq '${criteria.from}'`);
    if (criteria.subject) searchParams.push(`subject:${criteria.subject}`);
    if (criteria.hasAttachment) filterParams.push('hasAttachments eq true');
    if (criteria.since) filterParams.push(`receivedDateTime ge ${criteria.since}`);
    if (criteria.before) filterParams.push(`receivedDateTime le ${criteria.before}`);

    const queryParts = [];
    if (searchParams.length) queryParts.push(`$search="${searchParams.join(' AND ')}"`);
    if (filterParams.length) queryParts.push(`$filter=${filterParams.join(' and ')}`);
    queryParts.push('$top=50', '$select=id,subject,from,toRecipients,receivedDateTime,hasAttachments,bodyPreview');

    const url = `/me/messages?${queryParts.join('&')}`;
    this.log('C→S', `GET ${GRAPH_BASE}${url}`);

    const data = await this.graphFetch(url);
    const results = data.value || [];

    this.log('S→C', `200 OK - ${results.length} messages matched`);

    return {
      query: queryParts.join('&'),
      resultCount: results.length,
      searchId: uuidv4(),
    };
  }

  async fetchMessages(folderIdOrPath, { limit } = {}) {
    const folderId = typeof folderIdOrPath === 'string'
      ? folderIdOrPath
      : folderIdOrPath.graphFolderId || folderIdOrPath.path || folderIdOrPath;

    const top = limit || 25;

    let listUrl;
    if (folderId.match(/^[A-Za-z0-9_=-]+$/)) {
      listUrl = `/me/mailFolders/${folderId}/messages?$top=${top}&$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,hasAttachments,internetMessageHeaders`;
    } else {
      const foldersData = await this.graphFetch('/me/mailFolders?$top=100');
      const match = (foldersData.value || []).find(f => f.displayName === folderId);
      if (!match) throw new Error(`Folder "${folderId}" not found`);
      listUrl = `/me/mailFolders/${match.id}/messages?$top=${top}&$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,hasAttachments,internetMessageHeaders`;
    }

    this.log('C→S', `GET ${GRAPH_BASE}${listUrl}`);
    const listData = await this.graphFetch(listUrl);
    const msgStubs = listData.value || [];

    this.log('S→C', `200 OK - ${msgStubs.length} messages listed`);

    const messages = [];
    for (const stub of msgStubs) {
      this.log('C→S', `GET ${GRAPH_BASE}/me/messages/${stub.id}/$value`);

      const mimeRes = await fetch(`${GRAPH_BASE}/me/messages/${stub.id}/$value`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!mimeRes.ok) {
        this.log('S→C', `${mimeRes.status} - Failed to fetch MIME for ${stub.id}`);
        continue;
      }

      const rawBuffer = Buffer.from(await mimeRes.arrayBuffer());
      this.log('S→C', `200 OK - MIME content (${rawBuffer.length} bytes)`);

      const headers = this.parseHeaders(rawBuffer.toString('utf8', 0, Math.min(rawBuffer.length, 8192)));

      messages.push({
        id: uuidv4(),
        uid: messages.length + 1,
        graphMessageId: stub.id,
        folder: folderIdOrPath,
        subject: stub.subject || headers.subject || '(no subject)',
        fromAddress: stub.from?.emailAddress?.address || headers.from || '',
        toAddresses: (stub.toRecipients || []).map(r => r.emailAddress?.address),
        ccAddresses: (stub.ccRecipients || []).map(r => r.emailAddress?.address),
        bccAddresses: (stub.bccRecipients || []).map(r => r.emailAddress?.address),
        date: stub.receivedDateTime || (headers.date ? new Date(headers.date).toISOString() : new Date().toISOString()),
        size: rawBuffer.length,
        hashMd5: crypto.createHash('md5').update(rawBuffer).digest('hex'),
        hashSha256: crypto.createHash('sha256').update(rawBuffer).digest('hex'),
        hashSha512: crypto.createHash('sha512').update(rawBuffer).digest('hex'),
        hasAttachments: stub.hasAttachments || false,
        attachmentCount: 0,
        bodyText: this.extractBody(rawBuffer.toString('utf8')),
        contentType: headers['content-type'] || 'text/plain',
        rawMime: rawBuffer,
      });
    }

    this.log('CLIENT', `Fetched ${messages.length} messages from ${folderIdOrPath} via Graph API`);
    return messages;
  }

  parseHeaders(headerBlock) {
    const headers = {};
    const endOfHeaders = headerBlock.indexOf('\r\n\r\n');
    const block = endOfHeaders > 0 ? headerBlock.substring(0, endOfHeaders) : headerBlock;
    const lines = block.split(/\r?\n/);
    let currentKey = null;

    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        if (currentKey) headers[currentKey] += ' ' + line.trim();
      } else {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          currentKey = line.substring(0, colonIdx).toLowerCase();
          headers[currentKey] = line.substring(colonIdx + 1).trim();
        }
      }
    }

    return headers;
  }

  extractBody(raw) {
    const bodyStart = raw.indexOf('\r\n\r\n');
    if (bodyStart < 0) return '';
    return raw.substring(bodyStart + 4, bodyStart + 4 + 1000).trim();
  }

  async disconnect() {
    this.accessToken = null;
    this.log('CLIENT', 'Graph API session ended');
  }

  getProtocolLog() {
    return this.protocolLog;
  }

  static getCapabilities() {
    return {
      protocols: ['Microsoft Graph REST API v1.0'],
      authentication: ['Delegated (OAuth2 Authorization Code)', 'App-Only (Client Credentials)', 'App-Only (Certificate)'],
      features: [
        'Mail folder enumeration',
        'Server-side $search (KQL)',
        'Server-side $filter (OData)',
        'MIME content download ($value)',
        'Modern attachments (OneDrive/SharePoint links)',
        'Batch requests (up to 20 per batch)',
        'Delta queries (incremental sync)',
        'Change notifications (webhooks)',
        'Pagination via @odata.nextLink',
      ],
      searchOperators: [
        'from:', 'to:', 'cc:', 'bcc:', 'subject:', 'body:',
        'hasAttachments eq true/false',
        'receivedDateTime ge/le',
        'importance eq high/normal/low',
        'AND', 'OR', 'NOT',
      ],
      scopes: {
        delegated: ['Mail.Read', 'Mail.ReadBasic'],
        appOnly: ['Mail.Read', 'Mail.ReadBasic.All'],
      },
    };
  }
}
