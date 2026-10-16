import crypto from 'crypto';

export class QualityControlService {

  static runChecks(project, messages, acquisitions, folders, exports) {
    const startTime = Date.now();
    const checks = [];

    checks.push(this.checkCollectionCompleteness(messages, acquisitions, folders));
    checks.push(this.checkHashIntegrity(messages));
    checks.push(this.checkDuplicates(messages));
    checks.push(this.checkDateConsistency(messages));
    checks.push(this.checkMissingFields(messages));
    checks.push(this.checkFolderCoverage(messages, folders));
    checks.push(this.checkExportCompleteness(messages, exports));
    checks.push(this.checkAuditTrail(project));
    checks.push(this.checkEncryptionDetection(messages));

    const elapsed = Date.now() - startTime;
    const passed = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    const failed = checks.filter(c => c.status === 'fail').length;

    return {
      timestamp: new Date().toISOString(),
      projectId: project.id,
      projectName: project.name,
      elapsed,
      summary: { total: checks.length, passed, warnings, failed },
      overallStatus: failed > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass',
      checks,
    };
  }

  static checkCollectionCompleteness(messages, acquisitions, folders) {
    const check = { name: 'Collection Completeness', category: 'collection' };
    const totalAcquired = acquisitions.reduce((s, a) => s + (a.acquired_messages || 0), 0);
    const totalExpected = acquisitions.reduce((s, a) => s + (a.total_messages || 0), 0);
    const failedCount = acquisitions.reduce((s, a) => s + (a.failed_messages || 0), 0);

    if (messages.length === 0) {
      return { ...check, status: 'fail', detail: 'No messages collected', metrics: { collected: 0 } };
    }

    const ratio = totalExpected > 0 ? totalAcquired / totalExpected : 1;
    check.metrics = { collected: messages.length, expected: totalExpected, acquisitions: acquisitions.length, failed: failedCount };

    if (failedCount > 0) {
      check.status = 'warning';
      check.detail = `${failedCount} messages failed during acquisition`;
    } else if (ratio >= 0.95) {
      check.status = 'pass';
      check.detail = `${messages.length} messages collected across ${acquisitions.length} acquisition(s)`;
    } else {
      check.status = 'warning';
      check.detail = `Collection ratio ${(ratio * 100).toFixed(1)}% — some messages may be missing`;
    }
    return check;
  }

  static checkHashIntegrity(messages) {
    const check = { name: 'Hash Integrity', category: 'integrity' };
    let withHash = 0, withoutHash = 0, tripleHash = 0;

    for (const m of messages) {
      const has256 = !!(m.hash_sha256 || m.hashSha256);
      const has512 = !!(m.hash_sha512 || m.hashSha512);
      const hasMd5 = !!(m.hash_md5 || m.hashMd5);
      if (has256) withHash++;
      else withoutHash++;
      if (has256 && has512 && hasMd5) tripleHash++;
    }

    check.metrics = { withHash, withoutHash, tripleHash, total: messages.length };

    if (withoutHash === 0 && tripleHash === messages.length) {
      check.status = 'pass';
      check.detail = `All ${messages.length} messages have MD5 + SHA-256 + SHA-512 hashes`;
    } else if (withoutHash === 0) {
      check.status = 'pass';
      check.detail = `All ${messages.length} messages have SHA-256 hashes (${tripleHash} with triple hash)`;
    } else {
      check.status = 'warning';
      check.detail = `${withoutHash} of ${messages.length} messages missing hash values`;
    }
    return check;
  }

  static checkDuplicates(messages) {
    const check = { name: 'Duplicate Detection', category: 'data_quality' };
    const hashMap = new Map();
    const msgIdMap = new Map();
    const duplicateHashes = [];
    const duplicateMsgIds = [];

    for (const m of messages) {
      const h = m.hash_sha256 || m.hashSha256;
      if (h) {
        if (hashMap.has(h)) duplicateHashes.push({ hash: h, subject: m.subject, folder: m.folder });
        else hashMap.set(h, true);
      }
      const mid = m.message_id || m.messageId;
      if (mid) {
        if (msgIdMap.has(mid)) duplicateMsgIds.push({ messageId: mid, subject: m.subject });
        else msgIdMap.set(mid, true);
      }
    }

    check.metrics = { duplicatesByHash: duplicateHashes.length, duplicatesByMessageId: duplicateMsgIds.length };

    if (duplicateHashes.length === 0 && duplicateMsgIds.length === 0) {
      check.status = 'pass';
      check.detail = 'No duplicate messages detected';
    } else {
      check.status = 'warning';
      check.detail = `${duplicateHashes.length} hash duplicate(s), ${duplicateMsgIds.length} Message-ID duplicate(s)`;
      check.duplicates = { byHash: duplicateHashes.slice(0, 10), byMessageId: duplicateMsgIds.slice(0, 10) };
    }
    return check;
  }

  static checkDateConsistency(messages) {
    const check = { name: 'Date Consistency', category: 'data_quality' };
    let future = 0, veryOld = 0, noDate = 0;
    const now = Date.now();
    const tenYearsAgo = now - (10 * 365.25 * 86400000);

    for (const m of messages) {
      if (!m.date) { noDate++; continue; }
      const d = new Date(m.date).getTime();
      if (d > now + 86400000) future++;
      if (d < tenYearsAgo) veryOld++;
    }

    check.metrics = { future, veryOld, noDate, total: messages.length };

    if (future === 0 && noDate === 0) {
      check.status = 'pass';
      check.detail = 'All message dates are consistent';
    } else if (future > 0) {
      check.status = 'warning';
      check.detail = `${future} message(s) have future dates — possible clock skew or tampering`;
    } else {
      check.status = noDate > messages.length * 0.1 ? 'warning' : 'pass';
      check.detail = `${noDate} message(s) missing date, ${veryOld} older than 10 years`;
    }
    return check;
  }

  static checkMissingFields(messages) {
    const check = { name: 'Required Fields', category: 'data_quality' };
    let noSubject = 0, noFrom = 0, noBody = 0;

    for (const m of messages) {
      if (!m.subject && !(m.subject === '(no subject)')) noSubject++;
      if (!(m.from_address || m.fromAddress)) noFrom++;
      if (!(m.body_text || m.bodyText || m.body_html || m.bodyHtml)) noBody++;
    }

    check.metrics = { noSubject, noFrom, noBody, total: messages.length };

    if (noFrom === 0) {
      check.status = 'pass';
      check.detail = `All messages have sender addresses. ${noSubject} without subject, ${noBody} without body.`;
    } else {
      check.status = 'warning';
      check.detail = `${noFrom} messages missing sender, ${noSubject} missing subject`;
    }
    return check;
  }

  static checkFolderCoverage(messages, folders) {
    const check = { name: 'Folder Coverage', category: 'collection' };
    const collectedFolders = new Set(messages.map(m => m.folder));
    const allFolders = (folders || []).map(f => f.path || f.name);
    const uncollected = allFolders.filter(f => !collectedFolders.has(f));

    check.metrics = { collected: collectedFolders.size, total: allFolders.length, uncollected: uncollected.length };

    if (allFolders.length === 0) {
      check.status = 'pass';
      check.detail = `Messages from ${collectedFolders.size} folder(s)`;
    } else if (uncollected.length === 0) {
      check.status = 'pass';
      check.detail = `All ${allFolders.length} folders collected`;
    } else {
      check.status = 'warning';
      check.detail = `${uncollected.length} folder(s) not yet collected: ${uncollected.slice(0, 5).join(', ')}`;
    }
    return check;
  }

  static checkExportCompleteness(messages, exports) {
    const check = { name: 'Export Completeness', category: 'export' };

    if (!exports || exports.length === 0) {
      return { ...check, status: 'warning', detail: 'No exports performed yet', metrics: { exports: 0 } };
    }

    const totalExported = exports.reduce((s, e) => s + (e.message_count || 0), 0);
    check.metrics = { exports: exports.length, totalExported, collected: messages.length };

    if (totalExported >= messages.length) {
      check.status = 'pass';
      check.detail = `${totalExported} messages exported across ${exports.length} export(s)`;
    } else {
      check.status = 'warning';
      check.detail = `Only ${totalExported} of ${messages.length} messages exported`;
    }
    return check;
  }

  static checkAuditTrail(project) {
    const check = { name: 'Audit Trail', category: 'forensic' };

    if (!project.examiner_name) {
      return { ...check, status: 'warning', detail: 'No examiner name recorded for chain of custody' };
    }
    if (!project.legal_authority) {
      return { ...check, status: 'warning', detail: 'No legal authority documented' };
    }

    check.status = 'pass';
    check.detail = `Examiner: ${project.examiner_name}, Authority: ${project.legal_authority}`;
    return check;
  }

  static checkEncryptionDetection(messages) {
    const check = { name: 'Encryption & Signing Detection', category: 'security' };
    let encrypted = 0, signed = 0, smimeDetected = 0;

    for (const m of messages) {
      if (m.is_encrypted) encrypted++;
      if (m.is_signed) signed++;
      const ct = m.content_type || m.contentType || '';
      const body = m.body_text || m.bodyText || '';
      if (ct.includes('pkcs7') || ct.includes('smime') || body.includes('BEGIN PKCS7')) smimeDetected++;
    }

    check.metrics = { encrypted, signed, smimeDetected, total: messages.length };
    check.status = encrypted > 0 ? 'warning' : 'pass';
    check.detail = encrypted > 0
      ? `${encrypted} encrypted, ${signed} signed message(s) — encrypted content may not be fully preserved`
      : `${signed} signed message(s) detected, no encrypted messages`;
    return check;
  }
}
