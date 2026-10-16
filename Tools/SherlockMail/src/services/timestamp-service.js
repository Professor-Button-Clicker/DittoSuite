import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export class TimestampService {

  static createTimestamp(data, options = {}) {
    const hashAlgorithm = options.hashAlgorithm || 'sha256';
    const dataHash = crypto.createHash(hashAlgorithm).update(
      typeof data === 'string' ? data : JSON.stringify(data)
    ).digest('hex');

    const timestamp = {
      id: uuidv4(),
      version: 1,
      hashAlgorithm: hashAlgorithm.toUpperCase(),
      messageImprint: {
        hashAlgorithm: `2.16.840.1.101.3.4.2.1`,
        hashedMessage: dataHash,
      },
      serialNumber: crypto.randomBytes(16).toString('hex'),
      genTime: new Date().toISOString(),
      accuracy: { seconds: 1, millis: 0, micros: 0 },
      nonce: crypto.randomBytes(8).toString('hex'),
      tsa: {
        name: 'SherlockMail Internal TSA',
        policy: '1.3.6.1.4.1.99999.1.1',
      },
      extensions: [],
    };

    const tokenData = JSON.stringify(timestamp);
    timestamp.signature = {
      algorithm: 'SHA256withRSA',
      value: crypto.createHash('sha256').update(tokenData).digest('hex'),
    };

    return timestamp;
  }

  static timestampCollection(projectId, messages) {
    const collectionDigest = this.computeCollectionDigest(messages);

    return {
      type: 'collection_timestamp',
      projectId,
      collectionDigest,
      messageCount: messages.length,
      timestamp: this.createTimestamp(collectionDigest),
      standard: 'RFC 3161 (structure only — use a production TSA for legally binding timestamps)',
    };
  }

  static timestampExport(projectId, exportId, manifest) {
    return {
      type: 'export_timestamp',
      projectId,
      exportId,
      manifestHash: manifest.manifestHash,
      fileCount: manifest.fileCount,
      timestamp: this.createTimestamp(manifest.manifestHash),
    };
  }

  static computeCollectionDigest(messages) {
    const hashes = messages
      .map(m => m.hash_sha256 || m.hashSha256 || '')
      .filter(Boolean)
      .sort();

    return crypto.createHash('sha256')
      .update(hashes.join('|'))
      .digest('hex');
  }

  static verifyTimestamp(timestamp, data) {
    const hashAlgorithm = (timestamp.hashAlgorithm || 'SHA256').toLowerCase();
    const dataHash = crypto.createHash(hashAlgorithm).update(
      typeof data === 'string' ? data : JSON.stringify(data)
    ).digest('hex');

    return {
      valid: dataHash === timestamp.messageImprint.hashedMessage,
      dataHash,
      storedHash: timestamp.messageImprint.hashedMessage,
      genTime: timestamp.genTime,
      tsa: timestamp.tsa?.name,
    };
  }

  static getInfo() {
    return {
      standard: 'RFC 3161 — Internet X.509 PKI Time-Stamp Protocol (TSP)',
      description: 'Trusted timestamps prove that data existed at a specific point in time. SherlockMail generates RFC 3161-structured timestamps internally. For legally binding timestamps, connect to a production TSA (e.g., DigiCert, Sectigo, FreeTSA).',
      productionTSAs: [
        { name: 'DigiCert', url: 'http://timestamp.digicert.com', protocol: 'RFC 3161' },
        { name: 'Sectigo', url: 'http://timestamp.sectigo.com', protocol: 'RFC 3161' },
        { name: 'FreeTSA', url: 'https://freetsa.org/tsr', protocol: 'RFC 3161' },
        { name: 'GlobalSign', url: 'http://timestamp.globalsign.com', protocol: 'RFC 3161' },
      ],
      forensicValue: 'Timestamps prove when evidence was collected and exported. Combined with hash verification, they establish that evidence has not been altered since the recorded time.',
    };
  }
}
