/* ============================================================
   js/services/teacher-sync.js — lưu link sổ lớp của giáo viên lên tài khoản (đăng nhập máy khác không mất).
   Chỉ lưu phần Sổ lớp khó nhập lại: link Sheet "FORM QUẢN LÝ LỚP" theo trường (links), link thư mục Drive (folders),
   "Tên của tôi" (me) và "Lớp của tôi" (mine) → ĐÚNG 1 document teacher_sync/{uid}. Gọi tên KHÔNG lưu (chỉ máy này);
   bản CSV Sheet, điểm danh nháp, thẻ/bộ lọc là của từng máy (máy khác tự đọc lại Sheet).
   Tiết kiệm hạn mức Spark (không dùng Apps Script):
     • Đọc: 1 lần khi mở trang Điểm danh; mở lại (tab nào cũng vậy) trong 30 phút thì không đọc (PULL_MS).
     • Ghi: chỉ khi 4 phần trên thật sự đổi (so mã băm) — tức là khi thêm/bỏ sổ, "Cập nhật lớp", đổi tên, gắn sao lớp;
       gộp ≤ 1 lần / phút, đóng trang gửi nốt. localStorage vẫn là bản chính; phần chưa gửi tự gửi ở lần mở sau.
     • Nhiều tab cùng mở: dùng chung trạng thái trong localStorage + Web Lock → 1 thay đổi chỉ ghi 1 lần.
     • Rule chỉ so uid (không get() hồ sơ users) → không tốn thêm lượt đọc.
   Trộn: lấy bản mới hơn. Máy chưa từng đồng bộ → gộp hai bên (link hợp theo mã file, không ghi đè mất).
   Bản trong máy bị thay luôn được giữ 1 bản ở edu_sync_backup_v1.
     autoStart(opts)   trang đã có Firebase + đăng nhập (diem-danh)
                       opts = { onApplied(keys), onStatus(st) } — onApplied: dữ liệu vừa tải về, trang tự nạp lại
     saveNow() · status() · exportText() · importText(text)
   ============================================================ */
(function (global) {
  'use strict';

  const COL = 'teacher_sync';
  const META = 'edu_sync_meta_v1';
  const BACKUP = 'edu_sync_backup_v1';
  const PULL_MS = 30 * 60e3;
  const PUSH_GAP = 60e3;
  const HIDE_GAP = 15e3;
  const CHECK_MS = 30e3;
  const LOCK = 'edu-teacher-sync';
  const MAX_CHARS = 95000; // khớp rule (< 100000 ký tự); ~45 lớp × 6 sổ chỉ ~10.000
  /** Khoá localStorage được lưu · pick: chỉ các trường này lên tài khoản (còn lại là của từng máy, giữ nguyên khi tải về). */
  const KEYS = {
    eduquiz_solop_v1: { pick: ['links', 'folders', 'me', 'mine'] },
  };

  const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const pickOf = (k, v) => { const o = {}; if (isObj(v)) KEYS[k].pick.forEach((f) => { if (f in v) o[f] = v[f]; }); return o; };
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /** Bản gửi đi của 1 khoá (chuỗi JSON) — null nếu máy chưa có. */
  function snapshot(k) {
    const v = readJSON(k, null);
    if (!isObj(v)) return null;
    const s = JSON.stringify(pickOf(k, v));
    return s.length < MAX_CHARS ? s : null; // quá lớn: không gửi (rule cũng chặn), vẫn dùng được trong máy
  }
  /** Gộp lần đầu (máy chưa từng đồng bộ): object gộp từng trường, mảng hợp lại (bỏ trùng), còn lại lấy bản trên tài khoản. */
  function mergeFirst(local, remote) {
    if (Array.isArray(local) && Array.isArray(remote)) {
      const id = (x) => (isObj(x) && x.id != null ? 'id:' + x.id : JSON.stringify(x));
      const seen = new Set(remote.map(id));
      return remote.concat(local.filter((x) => !seen.has(id(x))));
    }
    if (isObj(local) && isObj(remote)) {
      const out = Object.assign({}, local);
      Object.keys(remote).forEach((k) => { out[k] = k in local ? mergeFirst(local[k], remote[k]) : remote[k]; });
      return out;
    }
    return remote === undefined || remote === null || remote === '' ? local : remote; // ô trống không đè tên đã có
  }

  let ctx = null; // { db, uid, opts, meta, timer, err, busy, inflight }
  // meta (dùng chung mọi tab qua localStorage): keys{k:{h,at,dirty,synced}} · pulledAt · pushedAt · tryAt (lần thử ghi gần nhất)
  const blankMeta = (uid) => ({ uid, keys: {}, pulledAt: 0, pushedAt: 0, tryAt: 0 });
  const saveMeta = () => writeJSON(META, ctx.meta);
  /** Nhận trạng thái tab khác vừa ghi (đã gửi khoá nào, lúc nào) — tránh 2 tab gửi trùng 1 thay đổi. */
  function syncMeta() { const m = readJSON(META, null); if (m && m.uid === ctx.uid) ctx.meta = m; }
  const emit = () => { if (ctx && ctx.opts.onStatus) try { ctx.opts.onStatus(status()); } catch (e) { /* ignore */ } };

  /** Dò khoá đổi trong máy (không mạng) → đánh dấu dirty kèm thời điểm. Trả số khoá đang chờ gửi. */
  function scan() {
    syncMeta();
    let n = 0;
    Object.keys(KEYS).forEach((k) => {
      const s = snapshot(k);
      if (s == null) return;
      const m = ctx.meta.keys[k], h = hash(s);
      if (!m || m.h !== h) ctx.meta.keys[k] = { h, at: Date.now(), dirty: true };
      if (ctx.meta.keys[k].dirty) n++;
    });
    saveMeta();
    return n;
  }

  async function pull(force) {
    scan();
    if (!force && Date.now() - ctx.meta.pulledAt < PULL_MS) return [];
    const snap = await ctx.db.collection(COL).doc(ctx.uid).get();
    syncMeta();
    const meta = ctx.meta;
    meta.pulledAt = Date.now();
    const items = (snap.exists && snap.data().items) || {};
    const applied = [];
    const backup = readJSON(BACKUP, {});
    Object.keys(items).forEach((k) => {
      const r = items[k];
      if (!KEYS[k] || !r || typeof r.v !== 'string') return;
      const m = meta.keys[k];
      if (m && !m.dirty && m.h === hash(r.v)) return;      // giống nhau
      if (m && m.at >= (r.at || 0) && m.synced) return;      // bản máy này mới hơn → sẽ gửi lên
      let remote;
      try { remote = JSON.parse(r.v); } catch (e) { return; }
      const local = readJSON(k, null);
      let next = pickOf(k, remote);
      if (isObj(local) && !(m && m.synced)) next = mergeFirst(pickOf(k, local), next); // máy chưa từng đồng bộ: gộp, không ghi đè
      if (local != null) backup[k] = { at: Date.now(), raw: JSON.stringify(pickOf(k, local)) };
      if (!writeJSON(k, Object.assign(isObj(local) ? local : {}, next))) return; // giữ phần của máy (CSV, nháp, bộ lọc)
      const s = snapshot(k), merged = s != null && hash(s) !== hash(r.v);
      meta.keys[k] = { h: s != null ? hash(s) : '', at: merged ? Date.now() : (r.at || 0), dirty: merged, synced: true };
      applied.push(k);
    });
    if (applied.length) writeJSON(BACKUP, backup);
    saveMeta();
    return applied;
  }

  /** Gửi các khoá đã đổi — 1 lượt ghi (set merge). gap: khoảng tối thiểu từ lần thử ghi trước (của mọi tab).
      Có Web Lock thì chỉ 1 tab gửi một lúc; tab đến sau thấy meta đã sạch nên không ghi lại. */
  async function push(gap, noLock) {
    if (!ctx || ctx.busy) return false;
    const locks = !noLock && global.navigator && global.navigator.locks;
    if (locks) return locks.request(LOCK, { ifAvailable: true }, (lock) => (lock ? send(gap) : false));
    return send(gap);
  }
  async function send(gap) {
    if (!ctx || ctx.busy) return false;
    if (!scan()) return false;
    if (Date.now() - (ctx.meta.tryAt || 0) < gap) return false;
    const items = {}, sent = {};
    Object.keys(KEYS).forEach((k) => {
      const m = ctx.meta.keys[k];
      if (!m || !m.dirty) return;
      const s = snapshot(k);
      if (s == null) return;
      items[k] = { v: s, at: m.at };
      sent[k] = m.h;
    });
    if (!Object.keys(items).length) return false;
    ctx.busy = true; ctx.meta.tryAt = Date.now(); saveMeta(); // lỗi cũng tính → không thử lại liên tục mỗi 30 giây
    try {
      await (ctx.inflight = ctx.db.collection(COL).doc(ctx.uid).set({ v: 1, at: global.firebase.firestore.FieldValue.serverTimestamp(), items }, { merge: true }));
      syncMeta();
      Object.keys(sent).forEach((k) => { const m = ctx.meta.keys[k]; if (m && m.h === sent[k]) { m.dirty = false; m.synced = true; } });
      ctx.meta.pushedAt = Date.now(); ctx.err = '';
      saveMeta();
      return true;
    } catch (e) {
      ctx.err = (e && e.code) || 'error';
      return false;
    } finally { ctx.busy = false; ctx.inflight = null; emit(); }
  }

  async function start(db, uid, opts) {
    if (ctx && ctx.uid === uid) return [];
    const meta = readJSON(META, null);
    ctx = { db, uid, opts: opts || {}, meta: meta && meta.uid === uid ? meta : blankMeta(uid), err: '', busy: false };
    let applied = [];
    try { applied = await pull(false); } catch (e) { ctx.err = (e && e.code) || 'error'; }
    emit();
    if (applied.length && ctx.opts.onApplied) ctx.opts.onApplied(applied);
    clearInterval(ctx.timer);
    ctx.timer = setInterval(() => { if (document.visibilityState === 'visible') push(PUSH_GAP); }, CHECK_MS);
    // Ẩn tab (chuyển sang PowerPoint, Zalo...): gửi nốt nếu đã ≥ 2 phút — bật tắt tab liên tục không ghi dồn.
    // Đóng trang: gửi luôn, không chờ Web Lock (trang sắp tắt, không kịp đợi).
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push(HIDE_GAP); });
    global.addEventListener('pagehide', () => push(0, true));
    return applied;
  }

  /** Trang đã có Firebase + đăng nhập (diem-danh). Trang chưa nạp Firebase: chỉ nạp SDK khi máy còn phiên đăng nhập. */
  async function autoStart(opts) {
    try {
      let fb = global.EduFirebase;
      if (!fb || !fb.db) {
        const L = global.EduFirebaseLoader;
        if (!L || !(await L.hasStoredSession())) return null;
        fb = await L.ensure();
      }
      const user = fb.auth.currentUser || await new Promise((res) => { const off = fb.auth.onAuthStateChanged((u) => { off(); res(u); }); });
      if (!user || user.isAnonymous) return null;
      return await start(fb.db, user.uid, opts);
    } catch (e) { return null; }
  }

  function status() {
    if (!ctx) return { on: false };
    const dirty = ctx.busy ? Object.values(ctx.meta.keys).filter((m) => m.dirty).length : scan(); // dò trong máy, không mạng
    return { on: true, pulledAt: ctx.meta.pulledAt, pushedAt: ctx.meta.pushedAt, dirty, err: ctx.err, busy: ctx.busy };
  }
  /** Bấm "Lưu ngay": đợi lần lưu tự động đang chạy (nếu có) rồi lưu nốt.
      Trả true = vừa lưu · null = không có gì mới (đã lưu hết) · false = chưa lưu được / chưa kết nối. */
  async function saveNow() {
    if (!ctx) return false;
    if (ctx.inflight) { try { await ctx.inflight; } catch (e) { /* lỗi đã ghi ở ctx.err */ } }
    if (await push(0)) return true;
    return ctx.err || status().dirty ? false : null;
  }

  /** Tệp sao lưu (0 mạng): đúng phần được lưu lên tài khoản (link, thư mục, tên, lớp của tôi). */
  function exportText() {
    const out = { app: 'eduquiz-teacher', v: 1, at: new Date().toISOString(), items: {} };
    Object.keys(KEYS).forEach((k) => { const v = readJSON(k, null); if (isObj(v)) out.items[k] = pickOf(k, v); });
    return JSON.stringify(out);
  }
  /** Nhập tệp sao lưu: gộp vào dữ liệu trong máy (không xoá gì). Trả số phần đã nhập. */
  function importText(text) {
    const d = JSON.parse(text);
    if (!d || d.app !== 'eduquiz-teacher' || !isObj(d.items)) throw new Error('Không phải tệp sao lưu của trang này.');
    let n = 0;
    const backup = readJSON(BACKUP, {});
    Object.keys(d.items).forEach((k) => {
      if (!KEYS[k] || !isObj(d.items[k])) return;
      const local = readJSON(k, null), add = pickOf(k, d.items[k]);
      if (local != null) backup[k] = { at: Date.now(), raw: JSON.stringify(pickOf(k, local)) };
      if (writeJSON(k, isObj(local) ? Object.assign(local, mergeFirst(pickOf(k, local), add)) : add)) n++;
    });
    writeJSON(BACKUP, backup);
    if (ctx) scan();
    return n;
  }

  global.EduTeacherSync = { autoStart, saveNow, status, exportText, importText, KEYS, _mergeFirst: mergeFirst, _hash: hash };
})(typeof window !== 'undefined' ? window : globalThis);
