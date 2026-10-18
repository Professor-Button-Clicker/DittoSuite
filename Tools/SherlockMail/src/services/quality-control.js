import crypto from 'crypto';

export class QualityControlService {

  static runChecks(project, messages, acquisitions, folders, exports, options = {}) {
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
    checks.push(this.checkWriteProtection(project));
    checks.push(this.checkStandardsCompliance(project, messages, acquisitions));
    checks.push(this.checkAttachmentCompleteness(messages, options.attachments || []));
    checks.push(this.checkTimestampVerification(options.timestamps || []));
    checks.push(this.checkProtocolLogCompleteness(acquisitions));
    checks.push(this.checkCloudAttachmentCoverage(messages, options.driveLinks || []));
    checks.push(this.checkExportIntegrity(exports));
    checks.push(this.checkCollectionResumability(acquisitions));

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

  static checkWriteProtection(project) {
    const check = { name: 'Write Protection (ISO 27037)', category: 'forensic' };
    const protocol = project.provider_type || '';
    const readOnlyProtocols = ['imap', 'gmail_api', 'graph', 'zoho_api', 'jmap'];
    const isReadOnly = readOnlyProtocols.includes(protocol);

    check.metrics = { protocol, readOnlyAccess: isReadOnly };

    if (protocol === 'imap') {
      check.status = 'pass';
      check.detail = 'IMAP EXAMINE mode provides read-only access (ISO 27037 / ACPO Principle 1)';
    } else if (isReadOnly) {
      check.status = 'pass';
      check.detail = `${protocol.toUpperCase()} API uses read-only scopes — no write operations performed`;
    } else if (protocol === 'pop3') {
      check.status = 'warning';
      check.detail = 'POP3 RETR may cause message deletion on some servers — document server behavior per SWGDE guidelines';
    } else if (protocol === 'ews') {
      check.status = 'pass';
      check.detail = 'EWS read operations do not modify mailbox content';
    } else {
      check.status = 'warning';
      check.detail = 'Unknown protocol — verify that collection did not alter source data';
    }
    return check;
  }

  static checkStandardsCompliance(project, messages, acquisitions) {
    const check = { name: 'DFIR Standards Compliance', category: 'forensic' };
    const issues = [];

    if (!project.examiner_name) issues.push('No examiner name (ACPO Principle 2, ISO 27037)');
    if (!project.legal_authority) issues.push('No legal authority documented (SWGDE, FRE 901)');
    if (!project.case_id && !project.case_name) issues.push('No case identifier (SWGDE evidence tracking)');

    const hasHash = messages.some(m => m.hash_sha256);
    if (!hasHash && messages.length > 0) issues.push('No SHA-256 hashes on collected messages (NIST FIPS 180-4)');

    const hasAcquisition = acquisitions && acquisitions.length > 0;
    if (!hasAcquisition && messages.length > 0) issues.push('No acquisition record (NIST SP 800-86 collection phase)');

    check.metrics = { issues: issues.length, checks: 5 };

    if (issues.length === 0) {
      check.status = 'pass';
      check.detail = 'All DFIR documentation requirements met (ISO 27037, NIST SP 800-86, SWGDE, ACPO, FRE)';
    } else if (issues.length <= 2) {
      check.status = 'warning';
      check.detail = issues.join('; ');
    } else {
      check.status = 'fail';
      check.detail = issues.join('; ');
    }
    return check;
  }

  static checkAttachmentCompleteness(messages, attachments) {
    const check = { name: 'Attachment Completeness', category: 'data_quality' };
    let expectedCount = 0;
    let actualCount = attachments.length;
    let missingHash = 0;

    for (const m of messages) {
      expectedCount += (m.attachment_count || m.attachmentCount || 0);
    }

    for (const att of attachments) {
      if (!(att.hash_sha256 || att.hashSha256)) missingHash++;
    }

    check.metrics = { expected: expectedCount, actual: actualCount, missingHash };

    if (expectedCount === 0) {
      check.status = 'pass';
      check.detail = 'No attachments expected';
    } else if (actualCount >= expectedCount && missingHash === 0) {
      check.status = 'pass';
      check.detail = `All ${actualCount} attachments collected and hashed`;
    } else if (actualCount < expectedCount) {
      check.status = 'warning';
      check.detail = `${actualCount} of ${expectedCount} expected attachments collected`;
    } else {
      check.status = missingHash > 0 ? 'warning' : 'pass';
      check.detail = `${actualCount} attachments collected; ${missingHash} missing hash values`;
    }
    return check;
  }

  static checkTimestampVerification(timestamps) {
    const check = { name: 'Timestamp Verification', category: 'forensic' };

    if (!timestamps || timestamps.length === 0) {
      return { ...check, status: 'warning', detail: 'No timestamps recorded — forensic timeline cannot be verified', metrics: { count: 0 } };
    }

    let collectionTs = 0;
    let exportTs = 0;
    let internalOnly = 0;

    for (const ts of timestamps) {
      const data = typeof ts.timestamp_data === 'string' ? JSON.parse(ts.timestamp_data) : ts.timestamp_data;
      if (ts.type === 'collection') collectionTs++;
      if (ts.type === 'export') exportTs++;
      if (data?.tsa?.name === 'SherlockMail Internal TSA') internalOnly++;
    }

    check.metrics = { total: timestamps.length, collection: collectionTs, export: exportTs, internalOnly };

    if (collectionTs > 0 && exportTs > 0) {
      check.status = internalOnly === timestamps.length ? 'warning' : 'pass';
      check.detail = internalOnly === timestamps.length
        ? `${timestamps.length} timestamps present but all are internal — use a production TSA for evidentiary weight`
        : `${timestamps.length} timestamps verified (${collectionTs} collection, ${exportTs} export)`;
    } else {
      check.status = 'warning';
      check.detail = `Incomplete timestamps: ${collectionTs} collection, ${exportTs} export — both are needed for chain of custody`;
    }
    return check;
  }

  static checkProtocolLogCompleteness(acquisitions) {
    const check = { name: 'Protocol Log Completeness', category: 'forensic' };

    if (!acquisitions || acquisitions.length === 0) {
      return { ...check, status: 'warning', detail: 'No acquisitions recorded', metrics: { count: 0 } };
    }

    let withLog = 0;
    let withErrors = 0;
    let totalErrors = 0;

    for (const acq of acquisitions) {
      const log = acq.protocol_log ? (typeof acq.protocol_log === 'string' ? JSON.parse(acq.protocol_log) : acq.protocol_log) : [];
      if (log.length > 0) withLog++;
      const errLog = acq.error_log ? (typeof acq.error_log === 'string' ? JSON.parse(acq.error_log) : acq.error_log) : [];
      if (errLog.length > 0) { withErrors++; totalErrors += errLog.length; }
    }

    check.metrics = { acquisitions: acquisitions.length, withProtocolLog: withLog, withErrors, totalErrors };

    if (withLog === acquisitions.length && totalErrors === 0) {
      check.status = 'pass';
      check.detail = `All ${acquisitions.length} acquisition(s) have protocol logs with no errors`;
    } else if (totalErrors > 0) {
      check.status = 'warning';
      check.detail = `${totalErrors} error(s) across ${withErrors} acquisition(s) — review error logs for data gaps`;
    } else {
      check.status = 'warning';
      check.detail = `${acquisitions.length - withLog} acquisition(s) missing protocol logs`;
    }
    return check;
  }

  static checkCloudAttachmentCoverage(messages, driveLinks) {
    const check = { name: 'Cloud Attachment Coverage', category: 'data_quality' };

    if (!driveLinks || driveLinks.length === 0) {
      check.status = 'pass';
      check.detail = 'No cloud attachment links detected';
      check.metrics = { totalLinks: 0 };
      return check;
    }

    let detected = 0;
    let downloaded = 0;
    let pending = 0;

    for (const link of driveLinks) {
      detected++;
      if (link.status === 'downloaded' || link.local_path) downloaded++;
      else pending++;
    }

    check.metrics = { detected, downloaded, pending };

    if (pending === 0) {
      check.status = 'pass';
      check.detail = `All ${detected} cloud attachment link(s) preserved`;
    } else {
      check.status = 'warning';
      check.detail = `${pending} of ${detected} cloud attachment link(s) not yet preserved — external content may be lost`;
    }
    return check;
  }

  static checkExportIntegrity(exports) {
    const check = { name: 'Export Integrity', category: 'export' };

    if (!exports || exports.length === 0) {
      return { ...check, status: 'warning', detail: 'No exports performed', metrics: { count: 0 } };
    }

    let withHash = 0;
    let failedExports = 0;

    for (const exp of exports) {
      if (exp.hash_sha256 || exp.hashSha256) withHash++;
      if (exp.status === 'failed') failedExports++;
    }

    check.metrics = { total: exports.length, withHash, failed: failedExports };

    if (failedExports > 0) {
      check.status = 'fail';
      check.detail = `${failedExports} export(s) failed — re-export required`;
    } else if (withHash === exports.length) {
      check.status = 'pass';
      check.detail = `All ${exports.length} export(s) have verified SHA-256 manifest hashes`;
    } else {
      check.status = 'warning';
      check.detail = `${exports.length - withHash} export(s) missing manifest hash — integrity cannot be verified`;
    }
    return check;
  }

  static checkCollectionResumability(acquisitions) {
    const check = { name: 'Collection Resumability', category: 'collection' };

    if (!acquisitions || acquisitions.length === 0) {
      return { ...check, status: 'pass', detail: 'No acquisitions to assess', metrics: { count: 0 } };
    }

    let interrupted = 0;
    let completedWithErrors = 0;

    for (const acq of acquisitions) {
      if (acq.status === 'failed' || acq.status === 'paused') interrupted++;
      if (acq.status === 'completed_with_errors') completedWithErrors++;
    }

    check.metrics = { total: acquisitions.length, interrupted, completedWithErrors };

    if (interrupted > 0) {
      check.status = 'warning';
      check.detail = `${interrupted} acquisition(s) interrupted — use differential collection to resume and capture missing messages`;
    } else if (completedWithErrors > 0) {
      check.status = 'warning';
      check.detail = `${completedWithErrors} acquisition(s) completed with errors — re-run differential collection to retry failed items`;
    } else {
      check.status = 'pass';
      check.detail = `All ${acquisitions.length} acquisition(s) completed successfully`;
    }
    return check;
  }
}
