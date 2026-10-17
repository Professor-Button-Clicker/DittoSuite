import net from 'net';
import tls from 'tls';
import crypto from 'crypto';
import { simpleParser } from 'mailparser';
import { v4 as uuidv4 } from 'uuid';

export class Pop3Handler {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.protocolLog = [];
    this.buffer = '';
  }

  log(direction, message) {
    this.protocolLog.push({
      timestamp: new Date().toISOString(),
      direction,
      message
    });
  }

  async sendCommand(command) {
    return new Promise((resolve, reject) => {
      const logCmd = command.startsWith('PASS ') ? 'PASS ****' : command;
      this.log('C→S', logCmd);

      this.socket.write(command + '\r\n');

      let data = '';
      const onData = (chunk) => {
        data += chunk.toString();
        if (data.includes('\r\n')) {
          this.socket.removeListener('data', onData);
          this.log('S→C', data.trim());
          if (data.startsWith('+OK')) {
            resolve(data.trim());
          } else if (data.startsWith('-ERR')) {
            reject(new Error(data.trim()));
          } else {
            resolve(data.trim());
          }
        }
      };
      this.socket.on('data', onData);
      setTimeout(() => { this.socket.removeListener('data', onData); reject(new Error('Timeout')); }, 30000);
    });
  }

  async readMultiLine(command) {
    return new Promise((resolve, reject) => {
      this.log('C→S', command);
      this.socket.write(command + '\r\n');

      let data = '';
      const onData = (chunk) => {
        data += chunk.toString();
        if (data.includes('\r\n.\r\n')) {
          this.socket.removeListener('data', onData);
          const firstLine = data.substring(0, data.indexOf('\r\n'));
          this.log('S→C', `${firstLine} [+ ${data.length} bytes]`);
          resolve(data);
        }
      };
      this.socket.on('data', onData);
      setTimeout(() => { this.socket.removeListener('data', onData); reject(new Error('Timeout')); }, 60000);
    });
  }

  async connect() {
    const { host, port, username, password, useTls, email } = this.config;
    const connectPort = port || (useTls !== false ? 995 : 110);

    return new Promise((resolve, reject) => {
      const onConnect = async () => {
        try {
          const greeting = await new Promise((res) => {
            const onData = (chunk) => {
              this.socket.removeListener('data', onData);
              const msg = chunk.toString().trim();
              this.log('S→C', msg);
              res(msg);
            };
            this.socket.on('data', onData);
          });

          await this.sendCommand(`USER ${username || email}`);
          await this.sendCommand(`PASS ${password}`);

          const stat = await this.sendCommand('STAT');
          const [, count, size] = stat.match(/\+OK\s+(\d+)\s+(\d+)/) || [null, '0', '0'];

          this.log('CLIENT', `Connected. ${count} messages, ${size} bytes`);
          resolve({ success: true, messageCount: parseInt(count), totalSize: parseInt(size) });
        } catch (err) {
          reject(err);
        }
      };

      if (useTls !== false) {
        this.socket = tls.connect({ host, port: connectPort, rejectUnauthorized: false }, onConnect);
      } else {
        this.socket = net.createConnection({ host, port: connectPort }, onConnect);
      }

      this.socket.on('error', reject);
      this.socket.setEncoding('utf8');
    });
  }

  async listMessages() {
    const response = await this.readMultiLine('LIST');
    const lines = response.split('\r\n').filter(l => l && !l.startsWith('+OK') && l !== '.');
    return lines.map(line => {
      const [num, size] = line.split(' ');
      return { number: parseInt(num), size: parseInt(size) };
    });
  }

  async fetchMessage(messageNumber) {
    const response = await this.readMultiLine(`RETR ${messageNumber}`);
    const firstNewline = response.indexOf('\r\n');
    const rawSource = response.substring(firstNewline + 2).replace(/\r\n\.\r\n$/, '');
    const rawBuffer = Buffer.from(rawSource);

    const hashMd5 = crypto.createHash('md5').update(rawBuffer).digest('hex');
    const hashSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
    const hashSha512 = crypto.createHash('sha512').update(rawBuffer).digest('hex');

    const parsed = await simpleParser(rawBuffer);

    return {
      id: uuidv4(),
      uid: messageNumber,
      folder: 'INBOX',
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
    };
  }

  async disconnect() {
    if (this.socket) {
      try { await this.sendCommand('QUIT'); } catch {}
      this.socket.destroy();
      this.log('CLIENT', 'Disconnected');
    }
  }

  getProtocolLog() {
    return this.protocolLog;
  }

  static getProviderPresets() {
    return {
      gmail: { host: 'pop.gmail.com', port: 995, useTls: true },
      outlook: { host: 'outlook.office365.com', port: 995, useTls: true },
      yahoo: { host: 'pop.mail.yahoo.com', port: 995, useTls: true },
      custom: { host: '', port: 995, useTls: true },
    };
  }
}
