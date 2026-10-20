import crypto from 'crypto';
import { simpleParser } from 'mailparser';
import { v4 as uuidv4 } from 'uuid';

// Per-protocol throughput settings. Limits follow each provider's documented ceilings:
// Graph allows 4 concurrent requests per mailbox, Gmail 250 quota units/s (messages.get = 5),
// EWS GetItem is batched like FEC's BindToItems, IMAP uses parallel sessions with range FETCH.
export const COLLECTION_PROFILES = {
  imap:      { workers: 4, perWorkerConnection: true, batchSize: 50 },
  pop3:      { workers: 1, perWorkerConnection: false, batchSize: 10 },
  gmail_api: { workers: 10, perWorkerConnection: false, batchSize: 1, ratePerSec: 40 },
  graph:     { workers: 4, perWorkerConnection: false, batchSize: 1 },
  ews:       { workers: 4, perWorkerConnection: false, batchSize: 20 },
};

export function supportsEngine(protocol) {
  return Object.prototype.hasOwnProperty.call(COLLECTION_PROFILES, protocol);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_RETRY_AFTER_MS = 120000;

export async function withRetry(fn, { attempts = 4, baseMs = 500, maxMs = 30000, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (err.permanent || attempt === attempts) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const delay = err.retryAfterMs != null
        ? Math.min(err.retryAfterMs, MAX_RETRY_AFTER_MS)
        : backoff / 2 + Math.random() * (backoff / 2);
      if (onRetry) await onRetry(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

class RateLimiter {
  constructor(perSec) {
    this.interval = 1000 / perSec;
    this.nextSlot = 0;
  }

  async take() {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.interval;
    if (slot > now) await sleep(slot - now);
  }
}

const PARSER_OPTIONS = { skipHtmlToText: true, skipTextToHtml: true, skipTextLinks: true, skipImageLinks: true };

function addressList(field) {
  return [].concat(field || []).flatMap(o => o?.value || []).map(a => a.address).filter(Boolean);
}

function isoOrNull(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function htmlToPlain(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function hashHex(algo, buf) {
  return crypto.createHash(algo).update(buf).digest('hex');
}

export async function buildMessageRecord(raw, extra = {}) {
  let parsed = null;
  try {
    parsed = await simpleParser(raw, PARSER_OPTIONS);
  } catch {
    // Unparseable MIME is still evidence: keep the raw bytes and hashes.
  }
  const attachments = (parsed?.attachments || []).map(att => ({
    id: uuidv4(),
    filename: att.filename || 'unnamed',
    contentType: att.contentType || 'application/octet-stream',
    size: att.size || 0,
    hashMd5: hashHex('md5', att.content),
    hashSha256: hashHex('sha256', att.content),
    disposition: att.contentDisposition || 'attachment',
    contentId: att.contentId || null,
    isInline: att.contentDisposition === 'inline',
  }));

  return {
    id: uuidv4(),
    subject: parsed?.subject || '(no subject)',
    fromAddress: parsed?.from?.text || '',
    toAddresses: addressList(parsed?.to),
    ccAddresses: addressList(parsed?.cc),
    bccAddresses: addressList(parsed?.bcc),
    date: isoOrNull(parsed?.date) || isoOrNull(extra.internalDate) || new Date().toISOString(),
    messageId: parsed?.messageId || null,
    inReplyTo: parsed?.inReplyTo || null,
    size: raw.length,
    flags: [],
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
    contentType: parsed?.headers?.get('content-type')?.value || 'text/plain',
    hashMd5: hashHex('md5', raw),
    hashSha256: hashHex('sha256', raw),
    hashSha512: hashHex('sha512', raw),
    bodyText: parsed?.text || (parsed?.html ? htmlToPlain(parsed.html) : ''),
    bodyHtml: parsed?.html || '',
    headers: Object.fromEntries(parsed?.headers || []),
    attachments,
    rawMime: raw,
    ...extra,
  };
}

// Rolling throughput (EWMA over 1s samples) so the ETA tracks the current rate
// instead of an all-time average skewed by connection setup and enumeration.
const WARMUP_SAMPLES = 5;
const MIN_COLLECT_MS_FOR_ETA = 2000;

function startRateTracker(progress) {
  let lastDone = 0;
  let lastBytes = 0;
  let lastT = Date.now();
  let itemsRate = null;
  let bytesRate = null;
  let samples = 0;
  let collectStart = null;
  let doneAtStart = 0;
  let bytesAtStart = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const done = progress.acquired + progress.failed + progress.skipped;
    progress.elapsedMs = now - progress.startedAt;
    const secs = (now - lastT) / 1000;
    if (progress.phase === 'collecting' && collectStart === null) {
      collectStart = lastT;
      doneAtStart = lastDone;
      bytesAtStart = lastBytes;
    }
    if (progress.phase === 'collecting' && secs > 0) {
      samples++;
      const sinceStart = (now - collectStart) / 1000;
      const inst = (done - lastDone) / secs;
      const instBytes = (progress.bytesDone - lastBytes) / secs;
      // Cumulative average while warming up (one slow first second would otherwise dominate), EWMA after.
      if (samples <= WARMUP_SAMPLES) {
        itemsRate = (done - doneAtStart) / sinceStart;
        bytesRate = (progress.bytesDone - bytesAtStart) / sinceStart;
      } else {
        itemsRate = 0.3 * inst + 0.7 * itemsRate;
        bytesRate = 0.3 * instBytes + 0.7 * bytesRate;
      }
      progress.itemsPerSec = Math.round(itemsRate * 10) / 10;
      progress.bytesPerSec = Math.round(bytesRate);
      const remaining = Math.max(0, progress.total - done);
      progress.estimateMs = itemsRate > 0.01 && now - collectStart >= MIN_COLLECT_MS_FOR_ETA
        ? Math.round((remaining / itemsRate) * 1000)
        : null;
    }
    lastDone = done;
    lastBytes = progress.bytesDone;
    lastT = now;
  }, 1000);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Handler contract: enumerate(folder, opts) -> { key, refs: [{ key, uid, serviceId? }] },
 * fetchBatch(key, refs) -> [{ ref, raw: Buffer, meta }]; optional ensureConnected(),
 * cloneForWorker() (required when the profile uses a connection per worker).
 */
export async function runCollection({
  protocol, primary, folders, limit = 0, searchCriteria, progress,
  onRecord, onFailure, onFolderError, overrides = {}, signal,
}) {
  const profile = { ...COLLECTION_PROFILES[protocol] };
  if (overrides.workers > 0) profile.workers = Math.min(overrides.workers, 16);
  const stopTracker = startRateTracker(progress);
  const extraHandlers = [];
  progress.bytesDone = progress.bytesDone || 0;

  try {
    progress.phase = 'enumerating';
    const queue = [];
    const folderTotals = {};
    for (const folder of folders) {
      if (signal?.aborted) break;
      progress.currentFolder = folder;
      try {
        const { key, refs } = await withRetry(() => primary.enumerate(folder, { limit, searchCriteria }), { attempts: 3 });
        folderTotals[folder] = refs.length;
        progress.total += refs.length;
        for (let i = 0; i < refs.length; i += profile.batchSize) {
          queue.push({ folder, key, refs: refs.slice(i, i + profile.batchSize) });
        }
      } catch (err) {
        folderTotals[folder] = 0;
        onFolderError?.(folder, err);
      }
    }

    const handlers = [primary];
    if (profile.perWorkerConnection && profile.workers > 1 && queue.length > 1) {
      const wanted = Math.min(profile.workers, queue.length) - 1;
      const results = await Promise.allSettled(Array.from({ length: wanted }, async () => {
        const h = primary.cloneForWorker();
        await h.connect();
        return h;
      }));
      for (const r of results) if (r.status === 'fulfilled') { handlers.push(r.value); extraHandlers.push(r.value); }
    }
    const workerHandlers = profile.perWorkerConnection
      ? handlers
      : Array.from({ length: Math.max(1, Math.min(profile.workers, queue.length)) }, () => primary);
    progress.connections = handlers.length;
    progress.workers = workerHandlers.length;
    progress.phase = 'collecting';

    const limiter = profile.ratePerSec ? new RateLimiter(profile.ratePerSec) : null;

    const fetchJob = (handler, job) => withRetry(async () => {
      if (limiter) await limiter.take();
      if (handler.ensureConnected) await handler.ensureConnected();
      const items = await handler.fetchBatch(job.key, job.refs);
      if (job.refs.length === 1 && items.length === 0) throw new Error('Server returned no content for item');
      return items;
    }, {
      attempts: job.refs.length > 1 ? 2 : 4,
      onRetry: (err) => {
        progress.retrying = true;
        progress.retryItem = `${job.folder} (${job.refs.length} item${job.refs.length > 1 ? 's' : ''}): ${err.message}`;
      },
    });

    const processJob = async (handler, job) => {
      let items;
      try {
        items = await fetchJob(handler, job);
      } catch (err) {
        if (job.refs.length > 1) {
          for (const ref of job.refs) queue.push({ ...job, refs: [ref] });
        } else {
          onFailure({ folder: job.folder, ref: job.refs[0], error: err, stage: 'fetch' });
        }
        return;
      } finally {
        progress.retrying = false;
      }

      const got = new Set();
      for (const item of items) {
        got.add(item.ref.key);
        progress.bytesDone += item.raw.length;
        try {
          const msg = await buildMessageRecord(item.raw, {
            uid: item.ref.uid,
            serviceId: item.ref.serviceId || null,
            folder: job.folder,
            ...item.meta,
          });
          await onRecord(msg, job.folder);
        } catch (err) {
          onFailure({ folder: job.folder, ref: item.ref, error: err, stage: 'process' });
        }
      }
      const missing = job.refs.filter(r => !got.has(r.key));
      for (const ref of missing) {
        if (job.refs.length > 1) queue.push({ ...job, refs: [ref] });
        else onFailure({ folder: job.folder, ref, error: new Error('Server returned no content for item'), stage: 'fetch' });
      }
    };

    const worker = async (handler) => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        if (signal?.aborted) return;
        progress.currentFolder = job.folder;
        await processJob(handler, job);
      }
    };

    await Promise.all(workerHandlers.map(worker));
    return { folderTotals, connections: handlers.length };
  } finally {
    stopTracker();
    await Promise.allSettled(extraHandlers.map(h => h.disconnect()));
  }
}
