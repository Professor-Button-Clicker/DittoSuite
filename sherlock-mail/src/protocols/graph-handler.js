import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Microsoft Graph API handler
// Demonstrates how FEC connects to O365 and consumer Microsoft accounts
// Uses REST API instead of SOAP (unlike EWS)
// In production, uses @azure/msal-node for authentication

export class GraphHandler {
  constructor(config) {
    this.config = config;
    this.protocolLog = [];
    this.accessToken = null;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
  }

  log(direction, message) {
    this.protocolLog.push({
      timestamp: new Date().toISOString(),
      direction,
      message
    });
  }

  async connect() {
    const { authType, tenantId, clientId, clientSecret, email } = this.config;

    this.log('CLIENT', `Connecting via Microsoft Graph - Auth: ${authType}`);

    if (authType === 'app_only') {
      // App-only authentication (for enterprise/tenant-wide access)
      // POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
      this.log('C→S', `POST https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`);
      this.log('C→S', `grant_type=client_credentials&scope=https://graph.microsoft.com/.default`);
      this.log('S→C', 'Token response: access_token=*****, expires_in=3600');
    } else if (authType === 'delegated') {
      // Delegated authentication (user signs in via browser)
      // Uses authorization code flow with PKCE
      this.log('C→S', `GET https://login.microsoftonline.com/common/oauth2/v2.0/authorize`);
      this.log('CLIENT', 'Redirect user to browser for OAuth consent');
      this.log('S→C', 'Authorization code received via redirect');
      this.log('C→S', `POST https://login.microsoftonline.com/common/oauth2/v2.0/token`);
      this.log('S→C', 'Token response: access_token=*****, refresh_token=*****');
    }

    this.accessToken = 'simulated_token';

    // Test the connection by getting the user profile
    this.log('C→S', `GET ${this.baseUrl}/me`);
    this.log('S→C', `200 OK - displayName: "${email}", mail: "${email}"`);

    return {
      success: true,
      authType,
      email,
      graphVersion: 'v1.0',
      capabilities: this.constructor.getCapabilities(),
    };
  }

  async listFolders() {
    // Graph API uses mailFolders endpoint
    this.log('C→S', `GET ${this.baseUrl}/me/mailFolders?$top=100&$expand=childFolders`);

    const folders = [
      { id: uuidv4(), path: 'Inbox', name: 'Inbox', totalMessages: 1543, unseenMessages: 47 },
      { id: uuidv4(), path: 'Sent Items', name: 'Sent Items', totalMessages: 1102, unseenMessages: 0 },
      { id: uuidv4(), path: 'Drafts', name: 'Drafts', totalMessages: 8, unseenMessages: 0 },
      { id: uuidv4(), path: 'Deleted Items', name: 'Deleted Items', totalMessages: 215, unseenMessages: 0 },
      { id: uuidv4(), path: 'Junk Email', name: 'Junk Email', totalMessages: 72, unseenMessages: 72 },
      { id: uuidv4(), path: 'Archive', name: 'Archive', totalMessages: 3200, unseenMessages: 0 },
      { id: uuidv4(), path: 'Conversation History', name: 'Conversation History', totalMessages: 450, unseenMessages: 0 },
    ];

    this.log('S→C', `200 OK - ${folders.length} mail folders returned`);
    return folders;
  }

  async searchMessages(criteria) {
    // Graph API supports $search and $filter for server-side search
    // This is FEC's in-place search capability via Graph
    const searchParams = [];
    const filterParams = [];

    if (criteria.keyword) searchParams.push(`"${criteria.keyword}"`);
    if (criteria.from) filterParams.push(`from/emailAddress/address eq '${criteria.from}'`);
    if (criteria.subject) searchParams.push(`subject:${criteria.subject}`);
    if (criteria.hasAttachment) filterParams.push('hasAttachments eq true');
    if (criteria.since) filterParams.push(`receivedDateTime ge ${criteria.since}`);
    if (criteria.before) filterParams.push(`receivedDateTime le ${criteria.before}`);

    const queryParts = [];
    if (searchParams.length) queryParts.push(`$search=${searchParams.join(' AND ')}`);
    if (filterParams.length) queryParts.push(`$filter=${filterParams.join(' and ')}`);
    queryParts.push('$top=50', '$select=id,subject,from,toRecipients,receivedDateTime,hasAttachments,bodyPreview');

    const url = `${this.baseUrl}/me/messages?${queryParts.join('&')}`;
    this.log('C→S', `GET ${url}`);

    const resultCount = Math.floor(Math.random() * 40) + 3;
    this.log('S→C', `200 OK - ${resultCount} messages matched`);

    return {
      query: queryParts.join('&'),
      resultCount,
      searchId: uuidv4(),
    };
  }

  async fetchMessages(folderPath, { limit } = {}) {
    const top = limit || 25;
    this.log('C→S', `GET ${this.baseUrl}/me/mailFolders('${folderPath}')/messages?$top=${top}&$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,hasAttachments,body,internetMessageHeaders`);

    const messages = [];
    const count = Math.min(top, 4 + Math.floor(Math.random() * 8));

    for (let i = 0; i < count; i++) {
      const msgId = uuidv4();
      this.log('C→S', `GET ${this.baseUrl}/me/messages/${msgId}/$value`);

      const subject = `O365 message ${i + 1} from ${folderPath}`;
      const rawContent = `From: o365-user@contoso.com\r\nTo: recipient@example.com\r\nSubject: ${subject}\r\nDate: ${new Date(Date.now() - i * 86400000).toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nMessage body from ${folderPath} via Microsoft Graph API.`;
      const rawBuffer = Buffer.from(rawContent);

      this.log('S→C', `200 OK - MIME content (${rawBuffer.length} bytes)`);

      messages.push({
        id: msgId,
        uid: i + 1,
        folder: folderPath,
        subject,
        fromAddress: 'o365-user@contoso.com',
        toAddresses: ['recipient@example.com'],
        date: new Date(Date.now() - i * 86400000).toISOString(),
        size: rawBuffer.length,
        hashMd5: crypto.createHash('md5').update(rawBuffer).digest('hex'),
        hashSha256: crypto.createHash('sha256').update(rawBuffer).digest('hex'),
        hashSha512: crypto.createHash('sha512').update(rawBuffer).digest('hex'),
        hasAttachments: false,
        attachmentCount: 0,
        bodyText: `Message body from ${folderPath} via Microsoft Graph API.`,
        contentType: 'text/plain',
      });
    }

    this.log('CLIENT', `Fetched ${messages.length} messages from ${folderPath} via Graph`);
    return messages;
  }

  async getModernAttachments(messageId) {
    // Graph-specific: modern attachments are OneDrive/SharePoint links
    // FEC can also download these cloud files
    this.log('C→S', `GET ${this.baseUrl}/me/messages/${messageId}/attachments`);
    this.log('S→C', '200 OK - attachments listed');

    return {
      attachments: [],
      driveLinks: [],
    };
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
      authentication: ['Delegated (OAuth2 Authorization Code + PKCE)', 'App-Only (Client Credentials)', 'App-Only (Certificate)'],
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
