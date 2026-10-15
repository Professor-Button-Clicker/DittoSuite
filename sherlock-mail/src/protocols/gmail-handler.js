import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Gmail API handler
// Demonstrates how FEC connects to Gmail and Google Workspace via REST API
// In production, uses googleapis npm package with OAuth2

export class GmailHandler {
  constructor(config) {
    this.config = config;
    this.protocolLog = [];
    this.accessToken = null;
    this.baseUrl = 'https://gmail.googleapis.com/gmail/v1';
  }

  log(direction, message) {
    this.protocolLog.push({
      timestamp: new Date().toISOString(),
      direction,
      message
    });
  }

  async connect() {
    const { email, authType } = this.config;

    this.log('CLIENT', `Connecting to Gmail API - Auth: ${authType || 'oauth2'}`);

    if (authType === 'service_account') {
      // Service account authentication for Google Workspace admin
      this.log('C→S', 'POST https://oauth2.googleapis.com/token');
      this.log('C→S', 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer');
      this.log('C→S', `JWT assertion with subject=${email} (domain-wide delegation)`);
      this.log('S→C', 'Token response: access_token=*****, expires_in=3600');
    } else {
      // OAuth2 authorization code flow
      this.log('C→S', 'GET https://accounts.google.com/o/oauth2/v2/auth');
      this.log('C→S', 'scope=https://www.googleapis.com/auth/gmail.readonly');
      this.log('CLIENT', 'Redirect user to Google consent screen');
      this.log('S→C', 'Authorization code received');
      this.log('C→S', 'POST https://oauth2.googleapis.com/token');
      this.log('S→C', 'Token response: access_token=*****, refresh_token=*****');
    }

    this.accessToken = 'simulated_token';

    // Test connection
    this.log('C→S', `GET ${this.baseUrl}/users/me/profile`);
    this.log('S→C', `200 OK - emailAddress: "${email}", messagesTotal: 15234`);

    return {
      success: true,
      email,
      messagesTotal: 15234,
      threadsTotal: 8912,
      capabilities: this.constructor.getCapabilities(),
    };
  }

  async listLabels() {
    // Gmail uses labels instead of traditional IMAP folders
    this.log('C→S', `GET ${this.baseUrl}/users/me/labels`);

    const labels = [
      { id: 'INBOX', name: 'INBOX', type: 'system', totalMessages: 2341, unseenMessages: 89 },
      { id: 'SENT', name: 'SENT', type: 'system', totalMessages: 1567, unseenMessages: 0 },
      { id: 'DRAFT', name: 'DRAFT', type: 'system', totalMessages: 12, unseenMessages: 0 },
      { id: 'SPAM', name: 'SPAM', type: 'system', totalMessages: 234, unseenMessages: 234 },
      { id: 'TRASH', name: 'TRASH', type: 'system', totalMessages: 178, unseenMessages: 0 },
      { id: 'STARRED', name: 'STARRED', type: 'system', totalMessages: 45, unseenMessages: 0 },
      { id: 'IMPORTANT', name: 'IMPORTANT', type: 'system', totalMessages: 890, unseenMessages: 0 },
      { id: 'CATEGORY_PERSONAL', name: 'Personal', type: 'system', totalMessages: 1200, unseenMessages: 34 },
      { id: 'CATEGORY_SOCIAL', name: 'Social', type: 'system', totalMessages: 456, unseenMessages: 22 },
      { id: 'CATEGORY_PROMOTIONS', name: 'Promotions', type: 'system', totalMessages: 890, unseenMessages: 89 },
      { id: 'Label_1', name: 'Work/Projects', type: 'user', totalMessages: 234, unseenMessages: 5 },
      { id: 'Label_2', name: 'Work/Legal', type: 'user', totalMessages: 67, unseenMessages: 0 },
      { id: 'Label_3', name: 'Personal/Finance', type: 'user', totalMessages: 89, unseenMessages: 2 },
    ];

    // Convert to folder format for consistency
    const folders = labels.map(l => ({
      id: uuidv4(),
      path: l.name,
      name: l.name.split('/').pop(),
      totalMessages: l.totalMessages,
      unseenMessages: l.unseenMessages,
      flags: [l.type],
      delimiter: '/',
      parentPath: l.name.includes('/') ? l.name.substring(0, l.name.lastIndexOf('/')) : null,
    }));

    this.log('S→C', `200 OK - ${labels.length} labels returned`);
    return folders;
  }

  async searchMessages(criteria) {
    // Gmail API supports powerful search via q parameter
    // Uses the same syntax as the Gmail search bar
    const queryParts = [];

    if (criteria.keyword) queryParts.push(criteria.keyword);
    if (criteria.from) queryParts.push(`from:${criteria.from}`);
    if (criteria.to) queryParts.push(`to:${criteria.to}`);
    if (criteria.subject) queryParts.push(`subject:${criteria.subject}`);
    if (criteria.hasAttachment) queryParts.push('has:attachment');
    if (criteria.since) queryParts.push(`after:${criteria.since.replace(/-/g, '/')}`);
    if (criteria.before) queryParts.push(`before:${criteria.before.replace(/-/g, '/')}`);
    if (criteria.label) queryParts.push(`label:${criteria.label}`);
    if (criteria.larger) queryParts.push(`larger:${criteria.larger}`);
    if (criteria.smaller) queryParts.push(`smaller:${criteria.smaller}`);
    if (criteria.isUnread) queryParts.push('is:unread');
    if (criteria.isStarred) queryParts.push('is:starred');
    if (criteria.inTrash) queryParts.push('in:trash');
    if (criteria.inSpam) queryParts.push('in:spam');
    if (criteria.filename) queryParts.push(`filename:${criteria.filename}`);

    const query = queryParts.join(' ') || '';
    this.log('C→S', `GET ${this.baseUrl}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=500`);

    const resultCount = Math.floor(Math.random() * 100) + 5;
    this.log('S→C', `200 OK - resultSizeEstimate: ${resultCount}`);

    return {
      query,
      resultCount,
      searchId: uuidv4(),
    };
  }

  async fetchMessages(labelId, { limit } = {}) {
    const maxResults = limit || 25;
    this.log('C→S', `GET ${this.baseUrl}/users/me/messages?labelIds=${labelId}&maxResults=${maxResults}`);

    const messages = [];
    const count = Math.min(maxResults, 4 + Math.floor(Math.random() * 8));

    for (let i = 0; i < count; i++) {
      const msgId = uuidv4().replace(/-/g, '').substring(0, 16);
      this.log('C→S', `GET ${this.baseUrl}/users/me/messages/${msgId}?format=raw`);

      const subject = `Gmail message ${i + 1} from ${labelId}`;
      const rawContent = `From: gmail-user@gmail.com\r\nTo: recipient@example.com\r\nSubject: ${subject}\r\nDate: ${new Date(Date.now() - i * 86400000).toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nMessage body from ${labelId} via Gmail API.`;
      const rawBuffer = Buffer.from(rawContent);

      this.log('S→C', `200 OK - raw MIME (${rawBuffer.length} bytes, base64url encoded)`);

      messages.push({
        id: uuidv4(),
        uid: i + 1,
        folder: labelId,
        subject,
        fromAddress: 'gmail-user@gmail.com',
        toAddresses: ['recipient@example.com'],
        date: new Date(Date.now() - i * 86400000).toISOString(),
        size: rawBuffer.length,
        hashMd5: crypto.createHash('md5').update(rawBuffer).digest('hex'),
        hashSha256: crypto.createHash('sha256').update(rawBuffer).digest('hex'),
        hashSha512: crypto.createHash('sha512').update(rawBuffer).digest('hex'),
        hasAttachments: false,
        attachmentCount: 0,
        bodyText: `Message body from ${labelId} via Gmail API.`,
        contentType: 'text/plain',
      });
    }

    this.log('CLIENT', `Fetched ${messages.length} messages from ${labelId} via Gmail API`);
    return messages;
  }

  async disconnect() {
    // Revoke token if needed
    if (this.accessToken) {
      this.log('C→S', 'POST https://oauth2.googleapis.com/revoke');
      this.log('S→C', '200 OK - Token revoked');
    }
    this.accessToken = null;
    this.log('CLIENT', 'Gmail API session ended');
  }

  getProtocolLog() {
    return this.protocolLog;
  }

  static getCapabilities() {
    return {
      protocols: ['Gmail REST API v1'],
      authentication: ['OAuth2 (Authorization Code)', 'Service Account (Domain-Wide Delegation)'],
      features: [
        'Label-based folder structure',
        'Server-side search (Gmail search syntax)',
        'Raw MIME content download (format=raw)',
        'Batch requests (up to 100 per batch)',
        'History-based incremental sync',
        'Thread-based conversation grouping',
        'Push notifications via Pub/Sub',
        'Pagination via nextPageToken',
        'Trash and Spam access',
      ],
      searchOperators: [
        'from:', 'to:', 'cc:', 'bcc:', 'subject:',
        'has:attachment', 'filename:', 'label:',
        'after:', 'before:', 'older:', 'newer:',
        'larger:', 'smaller:', 'size:',
        'is:unread', 'is:starred', 'is:important',
        'in:inbox', 'in:sent', 'in:trash', 'in:spam', 'in:anywhere',
        'category:', 'deliveredto:', 'list:',
        'OR', '-', '""', '()',
      ],
      scopes: [
        'gmail.readonly',
        'gmail.metadata',
      ],
    };
  }
}
