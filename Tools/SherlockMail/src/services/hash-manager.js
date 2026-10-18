import crypto from 'crypto';

export class HashManager {

  static ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];

  static computeAll(data) {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    const results = {};
    for (const alg of this.ALGORITHMS) {
      results[alg] = crypto.createHash(alg).update(buf).digest('hex');
    }
    return results;
  }

  static computeSelected(data, algorithms) {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    const results = {};
    for (const alg of algorithms) {
      if (!this.ALGORITHMS.includes(alg)) throw new Error(`Unsupported algorithm: ${alg}`);
      results[alg] = crypto.createHash(alg).update(buf).digest('hex');
    }
    return results;
  }

  static computeStreaming(algorithms = this.ALGORITHMS) {
    const hashers = {};
    for (const alg of algorithms) {
      hashers[alg] = crypto.createHash(alg);
    }
    return {
      update(chunk) {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        for (const h of Object.values(hashers)) h.update(buf);
        return this;
      },
      digest() {
        const results = {};
        for (const [alg, h] of Object.entries(hashers)) results[alg] = h.digest('hex');
        return results;
      },
    };
  }

  static verify(data, expectedHashes) {
    const computed = this.computeAll(data);
    const results = [];
    for (const [alg, expected] of Object.entries(expectedHashes)) {
      if (!expected) continue;
      const actual = computed[alg];
      results.push({
        algorithm: alg,
        expected,
        computed: actual,
        match: actual === expected,
      });
    }
    return {
      allMatch: results.every(r => r.match),
      algorithms: results,
    };
  }

  static computeCollectionDigest(messages, algorithm = 'sha256') {
    const hashes = messages
      .map(m => m[`hash_${algorithm}`] || m[`hash${algorithm.charAt(0).toUpperCase() + algorithm.slice(1)}`] || '')
      .filter(Boolean)
      .sort();
    return crypto.createHash(algorithm).update(hashes.join('|')).digest('hex');
  }

  static getAlgorithmInfo() {
    return {
      md5: { name: 'MD5', bits: 128, oid: '1.2.840.113549.2.5', forensicUse: 'Legacy compatibility, fast deduplication', securityNote: 'Collision-vulnerable — not suitable as sole integrity proof' },
      sha1: { name: 'SHA-1', bits: 160, oid: '1.3.14.3.2.26', forensicUse: 'FEC compatibility, backward compatibility', securityNote: 'Theoretical collision attacks — use SHA-256+ for new evidence' },
      sha256: { name: 'SHA-256', bits: 256, oid: '2.16.840.1.101.3.4.2.1', forensicUse: 'Primary forensic hash — NIST recommended', securityNote: 'No known attacks' },
      sha384: { name: 'SHA-384', bits: 384, oid: '2.16.840.1.101.3.4.2.2', forensicUse: 'FEC parity, higher security margin', securityNote: 'Truncated SHA-512 variant' },
      sha512: { name: 'SHA-512', bits: 512, oid: '2.16.840.1.101.3.4.2.3', forensicUse: 'Maximum integrity assurance', securityNote: 'No known attacks, faster than SHA-256 on 64-bit' },
    };
  }
}
