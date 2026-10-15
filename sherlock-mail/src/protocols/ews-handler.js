import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// EWS (Exchange Web Services) handler
// Demonstrates how FEC connects to Exchange/O365 via SOAP-based EWS API
// In production, this would use the ews-javascript-api or @azure/msal-node libraries

export class EwsHandler {
  constructor(config) {
    this.config = config;
    this.protocolLog = [];
    this.authenticated = false;
    this.ewsUrl = null;
  }

  log(direction, message) {
    this.protocolLog.push({
      timestamp: new Date().toISOString(),
      direction,
      message
    });
  }

  async autodiscover(email) {
    // Autodiscover finds the EWS endpoint URL automatically
    // FEC uses this so examiner only needs email + credentials
    const domain = email.split('@')[1];
    const autodiscoverUrls = [
      `https://autodiscover.${domain}/autodiscover/autodiscover.svc`,
      `https://${domain}/autodiscover/autodiscover.svc`,
      `https://autodiscover.${domain}/autodiscover/autodiscover.xml`,
    ];

    this.log('CLIENT', `Running Autodiscover for ${email}`);

    // Simulated autodiscover response for educational demo
    const ewsUrl = `https://outlook.office365.com/EWS/Exchange.asmx`;
    this.log('S→C', `Autodiscover resolved to: ${ewsUrl}`);

    return {
      ewsUrl,
      autodiscoverUrls,
      protocol: 'EWS',
      serverVersion: 'Exchange2016',
    };
  }

  async connect() {
    const { email, password, ewsUrl, authType } = this.config;

    this.log('CLIENT', `Connecting via EWS - Auth type: ${authType || 'basic'}`);

    if (!ewsUrl) {
      const discovered = await this.autodiscover(email);
      this.ewsUrl = discovered.ewsUrl;
    } else {
      this.ewsUrl = ewsUrl;
    }

    // Build the SOAP request that FEC sends to authenticate
    const soapEnvelope = this.buildSoapRequest('GetFolder', {
      FolderShape: { BaseShape: 'Default' },
      FolderIds: [{ DistinguishedFolderId: 'inbox' }]
    });

    this.log('C→S', `POST ${this.ewsUrl}`);
    this.log('C→S', `SOAP GetFolder request (authentication test)`);

    // In a real implementation, this would make the HTTP request
    // For educational purposes, we simulate a successful connection
    this.authenticated = true;
    this.log('S→C', 'HTTP 200 - GetFolder response received');
    this.log('CLIENT', `Successfully authenticated to EWS as ${email}`);

    return {
      success: true,
      ewsUrl: this.ewsUrl,
      serverVersion: 'Exchange2016',
      capabilities: [
        'FindItem', 'GetItem', 'FindFolder', 'GetFolder',
        'SearchMailboxes', 'GetSearchableMailboxes',
        'GetDiscoverySearchConfiguration'
      ]
    };
  }

  buildSoapRequest(operation, body) {
    // This shows the SOAP XML structure that EWS uses
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2016"/>
  </soap:Header>
  <soap:Body>
    <m:${operation}>
      ${JSON.stringify(body, null, 2)}
    </m:${operation}>
  </soap:Body>
</soap:Envelope>`;
  }

  async listFolders() {
    this.log('C→S', 'SOAP FindFolder request - Traversal: Deep');

    // Simulated folder structure from Exchange
    const folders = [
      { id: uuidv4(), path: 'Inbox', name: 'Inbox', totalMessages: 1247, unseenMessages: 23, folderClass: 'IPF.Note' },
      { id: uuidv4(), path: 'Sent Items', name: 'Sent Items', totalMessages: 892, unseenMessages: 0, folderClass: 'IPF.Note' },
      { id: uuidv4(), path: 'Drafts', name: 'Drafts', totalMessages: 15, unseenMessages: 0, folderClass: 'IPF.Note' },
      { id: uuidv4(), path: 'Deleted Items', name: 'Deleted Items', totalMessages: 340, unseenMessages: 0, folderClass: 'IPF.Note' },
      { id: uuidv4(), path: 'Junk Email', name: 'Junk Email', totalMessages: 56, unseenMessages: 56, folderClass: 'IPF.Note' },
      { id: uuidv4(), path: 'Archive', name: 'Archive', totalMessages: 2100, unseenMessages: 0, folderClass: 'IPF.Note' },
      { id: uuidv4(), path: 'Recoverable Items', name: 'Recoverable Items', totalMessages: 89, unseenMessages: 0, folderClass: 'IPF.Note', isRecoverable: true },
      { id: uuidv4(), path: 'Calendar', name: 'Calendar', totalMessages: 156, unseenMessages: 0, folderClass: 'IPF.Appointment' },
      { id: uuidv4(), path: 'Contacts', name: 'Contacts', totalMessages: 234, unseenMessages: 0, folderClass: 'IPF.Contact' },
    ];

    this.log('S→C', `FindFolder returned ${folders.length} folders`);
    return folders;
  }

  async searchMailboxes(criteria) {
    // In-place eDiscovery search - this is how FEC searches server-side
    // Uses the SearchMailboxes EWS operation
    this.log('C→S', `SOAP SearchMailboxes - Query: "${criteria.query || ''}" DateRange: ${criteria.since || '*'} to ${criteria.before || '*'}`);

    const kql = this.buildKqlQuery(criteria);
    this.log('CLIENT', `KQL query: ${kql}`);

    // Simulated search results
    const resultCount = Math.floor(Math.random() * 50) + 5;
    this.log('S→C', `SearchMailboxes returned ${resultCount} results`);

    return {
      query: kql,
      resultCount,
      searchId: uuidv4(),
    };
  }

  buildKqlQuery(criteria) {
    // KQL (Keyword Query Language) is what Exchange uses for search
    const parts = [];
    if (criteria.keyword) parts.push(criteria.keyword);
    if (criteria.from) parts.push(`from:${criteria.from}`);
    if (criteria.to) parts.push(`to:${criteria.to}`);
    if (criteria.subject) parts.push(`subject:"${criteria.subject}"`);
    if (criteria.hasAttachment) parts.push('hasattachment:true');
    if (criteria.since) parts.push(`received>=${criteria.since}`);
    if (criteria.before) parts.push(`received<=${criteria.before}`);
    if (criteria.size) parts.push(`size>${criteria.size}`);
    return parts.join(' AND ') || '*';
  }

  async fetchMessages(folderPath, { limit } = {}) {
    const top = limit || 25;
    this.log('C→S', `SOAP FindItem - FolderPath: ${folderPath}, MaxEntries: ${top}`);

    const soapBody = this.buildSoapRequest('FindItem', {
      ItemShape: { BaseShape: 'AllProperties', IncludeMimeContent: true },
      ParentFolderIds: [{ DistinguishedFolderId: folderPath.toLowerCase() }],
      Traversal: 'Shallow',
      MaxEntriesReturned: top,
    });

    this.log('CLIENT', `Requesting MIME content for messages in ${folderPath}`);

    const messages = [];
    const count = Math.min(top, 5 + Math.floor(Math.random() * 8));

    for (let i = 0; i < count; i++) {
      const msgId = uuidv4();
      this.log('C→S', `SOAP GetItem - ItemId: ${msgId.substring(0, 16)}, IncludeMimeContent: true`);

      const subject = `Exchange message ${i + 1} from ${folderPath}`;
      const rawContent = `From: exchange-user@contoso.com\r\nTo: recipient@example.com\r\nSubject: ${subject}\r\nDate: ${new Date(Date.now() - i * 86400000).toUTCString()}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nMessage body from ${folderPath} via EWS.`;
      const rawBuffer = Buffer.from(rawContent);

      this.log('S→C', `GetItem response - MIME content (${rawBuffer.length} bytes)`);

      messages.push({
        id: msgId,
        uid: i + 1,
        folder: folderPath,
        subject,
        fromAddress: 'exchange-user@contoso.com',
        toAddresses: ['recipient@example.com'],
        date: new Date(Date.now() - i * 86400000).toISOString(),
        size: rawBuffer.length,
        hashMd5: crypto.createHash('md5').update(rawBuffer).digest('hex'),
        hashSha256: crypto.createHash('sha256').update(rawBuffer).digest('hex'),
        hashSha512: crypto.createHash('sha512').update(rawBuffer).digest('hex'),
        hasAttachments: false,
        attachmentCount: 0,
        bodyText: `Message body from ${folderPath} via EWS.`,
        contentType: 'text/plain',
      });
    }

    this.log('CLIENT', `Fetched ${messages.length} messages from ${folderPath} via EWS`);
    return messages;
  }

  async disconnect() {
    this.authenticated = false;
    this.log('CLIENT', 'EWS session ended');
  }

  getProtocolLog() {
    return this.protocolLog;
  }

  static getCapabilities() {
    return {
      protocols: ['EWS SOAP API'],
      authentication: ['Basic', 'NTLM', 'OAuth2', 'App-Only (Certificate)', 'App-Only (Client Secret)'],
      features: [
        'Autodiscover endpoint resolution',
        'In-place eDiscovery search (KQL)',
        'Recoverable Items Folder access',
        'In-place Archive access',
        'Public Folder access',
        'Calendar and Contact items',
        'Delegate and impersonation access',
        'Batch item retrieval',
        'MIME content export',
      ],
      searchOperators: [
        'from:', 'to:', 'cc:', 'bcc:', 'subject:', 'body:',
        'received>=', 'received<=', 'sent>=', 'sent<=',
        'hasattachment:', 'size>', 'size<', 'kind:',
        'AND', 'OR', 'NOT', 'NEAR(n)',
      ],
    };
  }
}
