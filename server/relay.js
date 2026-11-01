/* Hàng đợi bài nộp của máy chủ trường: nhận submitExam / mosSubmit của học sinh qua LAN,
   ghi ra đĩa ngay (mất điện/khởi động lại không mất bài), rồi gửi lên Apps Script THEO LÔ.

   Vì sao: Apps Script chỉ chạy song song 30 lượt/tài khoản và mỗi bài nộp là 1 lượt chạy.
   Cả trường nộp cùng lúc → bị từ chối, máy học sinh phải gửi lại nhiều lần. Qua máy chủ này:
     - học sinh nhận "đã nộp" ngay khi bài nằm trên đĩa máy chủ (vài ms, không chờ Google);
     - 1 lượt Apps Script (action submitBatch — apps/src/36-batch.gs) ghi tới BATCH bài;
     - Apps Script bản cũ chưa có submitBatch hoặc chưa đặt RELAY_TOKEN → gửi từng bài,
       lần lượt (tối đa SINGLE_PARALLEL lượt cùng lúc), vẫn không dồn 30 lượt một lúc.
   Chỉ chuyển tiếp tới https://script.google.com/macros/s/... (URL do trang gửi kèm theo
   sheetEndpoints của trường) — không thành proxy đi đâu tuỳ ý. */
'use strict';
const fs = require('fs');
const path = require('path');

const GAS_PREFIX = 'https://script.google.com/macros/s/';
const ACTIONS = new Set(['submitExam', 'mosSubmit']);
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_BODY = 64 * 1024;           // bài MOS có tới 200 task kèm ghi chú
const SINGLE_PARALLEL = 3;
const SEEN_MS = 24 * 3600000;         // nhớ mã bài đã nhận 24 giờ (Apps Script tự lọc trùng 6 giờ)

function createRelay(opts) {
  const o = Object.assign({
    dir: '/data',
    token: '',                 // = Script Properties RELAY_TOKEN của Apps Script (bỏ trống: gửi từng bài)
    batch: 50,
    flushSec: 15,
    ratePerMin: 120,           // mỗi IP tối đa bao nhiêu bài/phút (chống gửi rác)
    fetch: global.fetch,
    log: console,
  }, opts || {});
  fs.mkdirSync(o.dir, { recursive: true });
  const OUTBOX = path.join(o.dir, 'outbox.jsonl');
  const REJECTED = path.join(o.dir, 'rejected.jsonl');

  const seen = new Map();      // submissionId → lúc nhận
  let queue = [];              // { id, action, endpoint, payload, at, tries }
  const stats = { accepted: 0, sent: 0, rejected: 0, duplicate: 0, batches: 0, lastFlush: null, lastError: null };
  const noBatch = new Map();   // endpoint → hết hạn (Apps Script không nhận lô: gửi từng bài)
  const backoff = new Map();   // endpoint → { until, ms }
  const rate = new Map();      // ip → { min, n }
  let flushing = null;
  let timer = null;

  // Nạp lại bài chưa gửi từ lần chạy trước.
  if (fs.existsSync(OUTBOX)) {
    for (const line of fs.readFileSync(OUTBOX, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const it = JSON.parse(line);
        if (it && it.id && !seen.has(it.id)) { queue.push(it); seen.set(it.id, it.at || Date.now()); }
      } catch (e) { /* dòng ghi dở lúc mất điện — bỏ qua */ }
    }
    if (queue.length) o.log.log(`Hàng đợi: ${queue.length} bài chưa gửi từ lần chạy trước.`);
  }

  function saveQueue() {
    const tmp = OUTBOX + '.tmp';
    fs.writeFileSync(tmp, queue.map(it => JSON.stringify(it)).join('\n') + (queue.length ? '\n' : ''));
    fs.renameSync(tmp, OUTBOX);
  }

  function limited(ip) {
    const min = Math.floor(Date.now() / 60000);
    const r = rate.get(ip);
    if (!r || r.min !== min) { rate.set(ip, { min, n: 1 }); return false; }
    return ++r.n > o.ratePerMin;
  }

  /** Nhận 1 bài từ trang. Trả { status, body } theo đúng dạng Apps Script trả ({ ok, code, data }). */
  function accept(raw, ip) {
    let body;
    try { body = JSON.parse(raw); } catch (e) { return { status: 400, body: { ok: false, code: 'invalid-argument', error: 'Payload không hợp lệ' } }; }
    const action = body && body.action;
    const p = body && body.payload;
    const endpoint = String((body && body.endpoint) || '');
    if (!ACTIONS.has(action)) return { status: 400, body: { ok: false, code: 'not-found', error: 'Máy chủ trường chỉ nhận bài nộp.' } };
    if (!endpoint.startsWith(GAS_PREFIX)) return { status: 400, body: { ok: false, code: 'invalid-argument', error: 'endpoint' } };
    if (!p || typeof p !== 'object' || !ID_RE.test(String(p.submissionId || '')) || !String(p.studentName || '').trim()) {
      return { status: 400, body: { ok: false, code: 'invalid-argument', error: 'Bài nộp không hợp lệ' } };
    }
    const id = action + ':' + p.submissionId;
    if (seen.has(id)) { stats.duplicate++; return { status: 200, body: { ok: true, data: { written: false, duplicate: true, queued: true } } }; }
    if (limited(ip)) return { status: 429, body: { ok: false, code: 'resource-exhausted', error: 'Gửi quá nhanh, thử lại sau.' } };
    const it = { id, action, endpoint, payload: p, at: Date.now(), tries: 0 };
    fs.appendFileSync(OUTBOX, JSON.stringify(it) + '\n'); // nằm trên đĩa rồi mới báo "đã nộp"
    queue.push(it);
    seen.set(id, it.at);
    stats.accepted++;
    if (queue.length >= o.batch) setImmediate(flush);
    return { status: 200, body: { ok: true, data: { written: true, duplicate: false, queued: true } } };
  }

  async function post(endpoint, body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 330000); // Apps Script chạy tối đa 6 phút
    try {
      // Apps Script trả 302 sang googleusercontent; fetch tự theo (POST → GET) như trình duyệt.
      const res = await o.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body), signal: ctl.signal, redirect: 'follow' });
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { throw new Error(`Apps Script trả về không phải JSON (HTTP ${res.status})`); }
    } finally { clearTimeout(t); }
  }

  /** Kết quả 1 bài: true = xong (bỏ khỏi hàng đợi), false = giữ lại gửi sau. */
  function settle(it, r) {
    if (r && r.ok) { stats.sent++; return true; }
    if (r && r.code === 'invalid-argument') {
      // Apps Script từ chối hẳn — gửi lại cũng vô ích. Giữ lại để giáo viên xem.
      stats.rejected++;
      fs.appendFileSync(REJECTED, JSON.stringify(Object.assign({ error: r.error }, it)) + '\n');
      return true;
    }
    it.tries++;
    stats.lastError = (r && r.error) || 'lỗi không rõ';
    return false;
  }

  async function sendBatch(endpoint, items) {
    const r = await post(endpoint, { action: 'submitBatch', token: o.token,
      items: items.map(it => ({ action: it.action, payload: it.payload })) });
    if (!r.ok) {
      // Bản cũ chưa có submitBatch / chưa đặt RELAY_TOKEN / sai mã → gửi từng bài 1 giờ.
      if (['not-found', 'failed-precondition', 'permission-denied'].includes(r.code)) {
        noBatch.set(endpoint, Date.now() + 3600000);
        o.log.warn(`Apps Script không nhận theo lô (${r.code}: ${r.error}) — gửi từng bài.`);
        return sendSingles(endpoint, items);
      }
      throw new Error(r.error || r.code || 'Apps Script báo lỗi');
    }
    stats.batches++;
    const results = (r.data && r.data.results) || [];
    return items.filter((it, i) => !settle(it, results[i] || { ok: false, code: 'unavailable', error: 'thiếu kết quả' }));
  }

  async function sendSingles(endpoint, items) {
    const left = [];
    for (let i = 0; i < items.length; i += SINGLE_PARALLEL) {
      const part = items.slice(i, i + SINGLE_PARALLEL);
      const rs = await Promise.all(part.map(it => post(endpoint, { action: it.action, payload: it.payload })
        .catch(e => ({ ok: false, code: 'unavailable', error: e.message }))));
      part.forEach((it, k) => { if (!settle(it, rs[k])) left.push(it); });
      if (left.length) { left.push(...items.slice(i + SINGLE_PARALLEL)); break; } // lỗi mạng: dừng, để lượt sau
    }
    return left;
  }

  async function flushOnce() {
    if (!queue.length) return;
    const now = Date.now();
    const byEndpoint = new Map();
    for (const it of queue) {
      const b = backoff.get(it.endpoint);
      if (b && b.until > now) continue;
      if (!byEndpoint.has(it.endpoint)) byEndpoint.set(it.endpoint, []);
      byEndpoint.get(it.endpoint).push(it);
    }
    const done = new Set();
    for (const [endpoint, items] of byEndpoint) {
      for (let i = 0; i < items.length; i += o.batch) {
        const part = items.slice(i, i + o.batch);
        let left;
        try {
          left = o.token && !((noBatch.get(endpoint) || 0) > Date.now())
            ? await sendBatch(endpoint, part) : await sendSingles(endpoint, part);
        } catch (e) {
          left = part;
          part.forEach(it => it.tries++);
          stats.lastError = e.message;
        }
        part.forEach(it => { if (!left.includes(it)) done.add(it); });
        if (left.length) {
          const prev = backoff.get(endpoint);
          const ms = Math.min(300000, prev ? prev.ms * 2 : 15000);
          backoff.set(endpoint, { until: Date.now() + ms, ms });
          o.log.warn(`Chưa gửi được ${left.length} bài lên Apps Script (${stats.lastError}) — thử lại sau ${ms / 1000}s.`);
          break;
        }
        backoff.delete(endpoint);
      }
    }
    if (done.size) { queue = queue.filter(it => !done.has(it)); saveQueue(); }
    stats.lastFlush = new Date().toISOString();
  }

  function flush() {
    if (!flushing) flushing = flushOnce().catch(e => { stats.lastError = e.message; }).finally(() => { flushing = null; });
    return flushing;
  }

  function prune() {
    const limit = Date.now() - SEEN_MS;
    const queued = new Set(queue.map(it => it.id));
    for (const [id, at] of seen) if (at < limit && !queued.has(id)) seen.delete(id);
    rate.clear();
  }

  return {
    accept, flush,
    status: () => Object.assign({ pending: queue.length, batchMode: !!o.token }, stats),
    start() {
      timer = setInterval(() => { flush(); }, o.flushSec * 1000);
      timer.unref();
      setInterval(prune, 3600000).unref();
      if (queue.length) flush();
    },
    stop() { clearInterval(timer); return flushing || Promise.resolve(); },
  };
}

module.exports = { createRelay, GAS_PREFIX };
