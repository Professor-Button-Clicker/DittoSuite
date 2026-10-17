import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export class ImapHandler {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.protocolLog = [];
  }

  log(direction, message) {
    this.protocolLog.push({
      timestamp: new Date().toISOString(),
      direction,
      message: typeof message === 'string' ? message : JSON.stringify(message)
    });
  }

  async connect() {
    const { host, port, username, password, tls, email } = this.config;

    this.client = new ImapFlow({
      host,
      port: port || (tls !== false ? 993 : 143),
      secure: tls !== false,
      auth: { user: username || email, pass: password },
      logger: {
        debug: (msg) => this.log('DEBUG', msg),
        info: (msg) => this.log('INFO', msg),
        warn: (msg) => this.log('WARN', msg),
        error: (msg) => this.log('ERROR', msg),
      }
    });

    await this.client.connect();
    this.log('CLIENT', `Connected to ${host}:${port || (tls !== false ? 993 : 143)}`);
    return { success: true, host, port: port || (tls !== false ? 993 : 143) };
  }

  async listFolders() {
    const tree = await this.client.listTree();
    const folders = [];

    const flatten = (items, parentPath) => {
      for (const item of items) {
        const path = item.path || item.name;
        folders.push({
          id: uuidv4(),
          path,
          name: item.name,
          delimiter: item.delimiter || '/',
          flags: item.flags || [],
          specialUse: item.specialUse || null,
          parentPath,
        });
        if (item.folders?.length) {
          flatten(item.folders, path);
        }
      }
    };

    flatten(tree.folders || [], null);

    for (const folder of folders) {
      try {
        const lock = await this.client.getMailboxLock(folder.path);
        try {
          folder.totalMessages = this.client.mailbox.exists || 0;
          folder.unseenMessages = this.client.mailbox.unseen || 0;
        } finally {
          lock.release();
        }
      } catch {
        folder.totalMessages = 0;
        folder.unseenMessages = 0;
      }
    }

    this.log('CLIENT', `Listed ${folders.length} folders`);
    return folders;
  }

  async fetchMessages(folderPath, { limit, searchCriteria } = {}) {
    const lock = await this.client.getMailboxLock(folderPath);
    const messages = [];

    try {
      let query = searchCriteria || { all: true };

      const uids = [];
      for await (const msg of this.client.fetch(query, { uid: true, envelope: true, bodyStructure: true, size: true, flags: true })) {
        uids.push(msg.uid);
        if (limit && uids.length >= limit) break;
      }

      for (const uid of uids) {
        try {
          const raw = await this.client.download(uid.toString(), undefined, { uid: true });
          const chunks = [];
          for await (const chunk of raw.content) {
            chunks.push(chunk);
          }
          const rawBuffer = Buffer.concat(chunks);

          const hashMd5 = crypto.createHash('md5').update(rawBuffer).digest('hex');
          const hashSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
          const hashSha512 = crypto.createHash('sha512').update(rawBuffer).digest('hex');

          const parsed = await simpleParser(rawBuffer);

          messages.push({
            id: uuidv4(),
            uid,
            folder: folderPath,
            subject: parsed.subject || '(no subject)',
            fromAddress: parsed.from?.text || '',
            toAddresses: parsed.to?.value?.map(a => a.address) || [],
            ccAddresses: parsed.cc?.value?.map(a => a.address) || [],
            bccAddresses: parsed.bcc?.value?.map(a => a.address) || [],
            date: parsed.date?.toISOString() || new Date().toISOString(),
            messageId: parsed.messageId || null,
            inReplyTo: parsed.inReplyTo || null,
            size: rawBuffer.length,
            flags: [],
            hasAttachments: (parsed.attachments?.length || 0) > 0,
            attachmentCount: parsed.attachments?.length || 0,
            contentType: parsed.headers?.get('content-type')?.value || 'text/plain',
            hashMd5,
            hashSha256,
            hashSha512,
            bodyText: parsed.text || '',
            bodyHtml: parsed.html || '',
            headers: Object.fromEntries(parsed.headers || []),
            rawSource: rawBuffer.toString('base64'),
            attachments: (parsed.attachments || []).map(att => ({
              id: uuidv4(),
              filename: att.filename || 'unnamed',
              contentType: att.contentType || 'application/octet-stream',
              size: att.size || 0,
              hashMd5: crypto.createHash('md5').update(att.content).digest('hex'),
              hashSha256: crypto.createHash('sha256').update(att.content).digest('hex'),
              disposition: att.contentDisposition || 'attachment',
              contentId: att.contentId || null,
              isInline: att.contentDisposition === 'inline',
            })),
          });
        } catch (err) {
          this.log('ERROR', `Failed to fetch UID ${uid}: ${err.message}`);
        }
      }
    } finally {
      lock.release();
    }

    this.log('CLIENT', `Fetched ${messages.length} messages from ${folderPath}`);
    return messages;
  }

  async serverSearch(folderPath, criteria) {
    const lock = await this.client.getMailboxLock(folderPath);
    try {
      const searchQuery = {};

      if (criteria.from) searchQuery.from = criteria.from;
      if (criteria.to) searchQuery.to = criteria.to;
      if (criteria.subject) searchQuery.subject = criteria.subject;
      if (criteria.body) searchQuery.body = criteria.body;
      if (criteria.since) searchQuery.since = new Date(criteria.since);
      if (criteria.before) searchQuery.before = new Date(criteria.before);
      if (criteria.hasAttachment) searchQuery.header = { 'Content-Type': 'multipart/mixed' };
      if (criteria.flagged) searchQuery.flagged = true;
      if (criteria.unseen) searchQuery.unseen = true;
      if (criteria.keyword) searchQuery.or = [
        { subject: criteria.keyword },
        { body: criteria.keyword },
        { from: criteria.keyword }
      ];

      const results = await this.client.search(searchQuery);
      this.log('CLIENT', `Server-side search returned ${results.length} results in ${folderPath}`);
      return { count: results.length, uids: results };
    } finally {
      lock.release();
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.logout();
      this.log('CLIENT', 'Disconnected');
    }
  }

  getProtocolLog() {
    return this.protocolLog;
  }

  static getProviderPresets() {
    return {
      gmail: { host: 'imap.gmail.com', port: 993, tls: true, note: 'Requires App Password or OAuth2' },
      outlook: { host: 'outlook.office365.com', port: 993, tls: true, note: 'May require OAuth2' },
      yahoo: { host: 'imap.mail.yahoo.com', port: 993, tls: true, note: 'Requires App Password' },
      aol: { host: 'imap.aol.com', port: 993, tls: true },
      zoho: { host: 'imap.zoho.com', port: 993, tls: true },
      icloud: { host: 'imap.mail.me.com', port: 993, tls: true, note: 'Requires App-Specific Password' },
      fastmail: { host: 'imap.fastmail.com', port: 993, tls: true },
      protonmail: { host: '127.0.0.1', port: 1143, tls: false, note: 'Requires ProtonMail Bridge' },
      custom: { host: '', port: 993, tls: true },
    };
  }
}
