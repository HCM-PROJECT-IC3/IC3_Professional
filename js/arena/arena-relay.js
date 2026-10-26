/* ============================================================
   js/arena/arena-relay.js — ĐƯỜNG DỰ PHÒNG qua Firestore cho Phòng cả lớp
   (js/arena/arena-room.js), chỉ dùng cho học sinh KHÔNG nối thẳng được (WebRTC).

   Vì sao: học sinh khác mạng máy giáo viên (4G, Wi-Fi khác, Wi-Fi trường có tường
   lửa) không nối thẳng được; TURN miễn phí kèm PeerJS đã chết (10/2026) và TURN
   ngoài (Metered/Cloudflare) đòi đăng ký/thẻ. Đường này chỉ dùng Firebase sẵn có.

   Cách chạy — cùng giao thức tin nhắn với WebRTC, nên arena-room.js không đổi logic:
     • arena_relay/{mã phòng}         (máy giáo viên ghi) out.{uid} = ≤ 4 tin gần nhất cho
                                       từng học sinh dự phòng, gom lại ≤ 1 lần ghi/giây
                                       (sảnh chờ: 2,5 giây). Học sinh nghe document này.
     • arena_relay/{mã}/up/{uid}      (học sinh ghi) ≤ 4 tin gần nhất (vào phòng, trả lời,
                                       chọn phép...). Máy giáo viên nghe collection này.
   Mỗi tin có số thứ tự n tăng dần (bắt đầu từ Date.now(), tải lại trang vẫn tăng) → bên
   nhận chỉ xử lý tin mới. Tin lưu dạng chuỗi JSON (Firestore cấm mảng lồng mảng).

   ĐÔNG học sinh dự phòng: mỗi em đọc lại CẢ document phòng mỗi lần đổi, mà Firestore Spark chỉ
   cho tải ra 10 GB/tháng. Câu hỏi/đáp án/bảng điểm giống hệt nhau cho mọi em → chỉ lưu 1 bản
   trong blobs{mã: JSON phần chung}; out.{uid} chỉ còn {n, b: mã phần chung, p: phần riêng nhỏ}
   (PERSONAL: đã trả lời, thẻ, máu, đá quý...). 60 em: ~480 KB → ~20 KB mỗi lần đọc.

   Lượt Firebase (chỉ khi có học sinh dự phòng): mỗi em ~1 ghi/câu (trả lời) + ~3 đọc/câu
   (câu hỏi, đáp án, rules kiểm phòng còn mở khi em ghi); máy giáo viên ~2 ghi/câu cho CẢ nhóm dự phòng. Tin "got" (đã nhận đáp
   án) KHÔNG đi qua Firestore: máy em tự báo khi ghi thành công. Học sinh nối thẳng: 0 lượt.
   Mở phòng: 1 ghi + 1 đọc (nghe collection up rỗng).

   Học sinh đăng nhập ẨN DANH (Firebase Auth — không tính hạn mức Firestore, phiên chỉ
   giữ trong tab) để firestore.rules chặn ghi giả người khác.
   ============================================================ */
(function (global) {
  'use strict';

  const COL = 'arena_relay';
  const KEEP = 4;                 // số tin giữ lại mỗi chiều cho mỗi học sinh
  const FLUSH_MS = 600;           // gom tin trong trận
  const LOBBY_FLUSH_MS = 5000;    // sảnh chờ: người vào liên tục → gom thưa hơn (mỗi em đỡ ~1 lượt đọc/5 giây)
  const MIN_GAP_MS = 1000;        // Firestore: ~1 lần ghi/giây cho 1 document
  const UP_GAP_MS = 1000;         // máy học sinh: giãn các lần ghi up/{uid} (firestore.rules chặn ≤ 0,5 giây)
  const TTL_MS = 6 * 60 * 60 * 1000;
  // Trường RIÊNG từng học sinh trong tin của arena-room.js (questionMsg/revealMsg/endMsg) — còn lại là phần chung
  const PERSONAL = ['you', 'answered', 'cards', 'hp', 'team', 'mp', 'shield', 'note', 'gems', 'threat', 'hnote', 'heistDone'];

  /** Mã ngắn cho 1 chuỗi (djb2) — cùng nội dung → cùng mã → lưu 1 lần. */
  function hashOf(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + str.length.toString(36);
  }
  /** Tin → { b: mã phần chung, shared: JSON phần chung, p: JSON phần riêng | '' }. */
  function splitMsg(msg) {
    const shared = {};
    const own = {};
    Object.keys(msg).forEach((k) => { if (msg[k] !== undefined) (PERSONAL.includes(k) ? own : shared)[k] = msg[k]; });
    const sj = JSON.stringify(shared);
    return { b: hashOf(sj), shared: sj, p: Object.keys(own).length ? JSON.stringify(own) : '' };
  }
  /** Ghép lại tin từ bản ghi {n, b, p} (+ bảng blobs) hoặc bản cũ {n, j}. null nếu thiếu phần chung. */
  function joinMsg(x, blobs) {
    try {
      if (x.j) return JSON.parse(x.j);
      const shared = blobs && blobs[x.b];
      if (!shared) return null;
      return Object.assign(JSON.parse(shared), x.p ? JSON.parse(x.p) : {});
    } catch (e) { return null; }
  }

  async function firebase() {
    await global.EduLazyLoad.loadScripts(['js/services/firebase-loader.js']);
    return global.EduFirebaseLoader.ensure();
  }
  const ts = (ms) => global.firebase.firestore.Timestamp.fromMillis(ms);

  /** Kết nối giả cùng giao diện với PeerJS DataConnection (on/send/close/open). */
  function makeConn(sendImpl, closeImpl) {
    const handlers = {};
    const conn = {
      open: false, relay: true,
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return conn; },
      emit(ev, arg) { (handlers[ev] || []).slice().forEach((fn) => { try { fn(arg); } catch (e) { console.error('[Relay]', e); } }); },
      send(msg) { if (conn.open) sendImpl(msg); },
      close() { if (!conn.open) return; conn.open = false; closeImpl(); conn.emit('close'); },
    };
    return conn;
  }
  /** Danh sách tin [{n, j}] → các tin có n > last (đã sắp xếp). */
  function fresh(list, last) {
    return (Array.isArray(list) ? list : []).filter((x) => x && x.n > last).sort((a, b) => a.n - b.n);
  }

  // ============================================================
  // MÁY GIÁO VIÊN
  // ============================================================
  /**
   * Mở đường dự phòng cho phòng `code`. onConn(conn) được gọi khi 1 học sinh dự phòng
   * xuất hiện (giống peer.on('connection')). isLobby() → đang ở sảnh chờ (gom tin thưa hơn).
   * @returns {Promise<{close(): void}>}
   */
  async function host(code, onConn, isLobby) {
    const F = await firebase();
    const user = F.auth.currentUser;
    if (!user || user.isAnonymous) throw Object.assign(new Error('Cần tài khoản giáo viên'), { code: 'unauthenticated' });
    const ref = F.db.collection(COL).doc(code);
    await ref.set({ hostUid: user.uid, exp: ts(Date.now() + TTL_MS), out: {}, blobs: {} });

    let seq = Date.now();
    const conns = new Map();   // uid → conn giả
    const seen = {};           // uid → n tin đã xử lý
    const outQ = {};           // uid → [{n, t, b, p}]
    const blobs = {};          // mã → JSON phần chung (chỉ giữ mã còn được out tham chiếu)
    const dirty = new Set();
    let flushT = 0;
    let lastFlush = 0;
    let closed = false;

    function queue(uid, msg) {
      if (msg.t === 'got') return; // máy em tự báo "đã gửi" khi ghi Firestore thành công
      let q = outQ[uid] || (outQ[uid] = []);
      if (msg.t === 'lobby') q = outQ[uid] = q.filter((x) => x.t !== 'lobby'); // chỉ cần sảnh chờ mới nhất
      const parts = splitMsg(msg);
      blobs[parts.b] = parts.shared;
      q.push({ n: ++seq, t: msg.t, b: parts.b, p: parts.p });
      while (q.length > KEEP) q.shift();
      dirty.add(uid);
      schedule();
    }
    function schedule() {
      if (flushT || closed) return;
      const delay = isLobby && isLobby() ? LOBBY_FLUSH_MS : FLUSH_MS;
      flushT = setTimeout(flush, Math.max(delay, MIN_GAP_MS - (Date.now() - lastFlush)));
    }
    function flush() {
      flushT = 0;
      if (closed || !dirty.size) return;
      lastFlush = Date.now();
      const upd = {};
      dirty.forEach((uid) => { upd['out.' + uid] = outQ[uid].map((x) => (x.p ? { n: x.n, b: x.b, p: x.p } : { n: x.n, b: x.b })); });
      dirty.clear();
      // Ghi lại TOÀN BỘ bảng phần chung, chỉ gồm mã còn dùng → bản cũ tự rơi khỏi document
      const used = {};
      Object.keys(outQ).forEach((uid) => outQ[uid].forEach((x) => { used[x.b] = blobs[x.b]; }));
      Object.keys(blobs).forEach((k) => { if (!used[k]) delete blobs[k]; });
      upd.blobs = used;
      ref.update(upd).catch((e) => console.warn('[Relay] Không gửi được tin cho học sinh dự phòng:', e.message));
    }

    const unsub = ref.collection('up').onSnapshot((snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') return;
        const uid = ch.doc.id;
        const d = ch.doc.data() || {};
        let conn = conns.get(uid);
        if (!conn || !conn.open) {
          // Đóng (từ chối/mời ra): giữ hàng đợi để tin "deny" vừa xếp vẫn tới được máy em ở lần ghi kế
          conn = makeConn((m) => queue(uid, m), () => {});
          conn.open = true;
          conns.set(uid, conn);
          onConn(conn);
        }
        fresh(d.m, seen[uid] || 0).forEach((x) => {
          seen[uid] = x.n;
          let msg = null;
          try { msg = JSON.parse(x.j); } catch (e) { return; }
          conn.emit('data', msg);
        });
      });
    }, (err) => console.warn('[Relay] Ngừng nghe học sinh dự phòng:', err.message));

    return {
      close() {
        if (closed) return;
        flush();
        closed = true;
        unsub();
        clearTimeout(flushT);
        conns.forEach((c) => { if (c.open) { c.open = false; c.emit('close'); } });
        setTimeout(() => ref.delete().catch(() => {}), 1500); // sau lần gửi cuối (kết quả trận)
      },
    };
  }

  // ============================================================
  // HỌC SINH
  // ============================================================
  let anonPromise = null;
  async function signedIn(F) {
    if (F.auth.currentUser) return F.auth.currentUser;
    await new Promise((res) => { const un = F.auth.onAuthStateChanged(() => { un(); res(); }); });
    if (F.auth.currentUser) return F.auth.currentUser;
    if (!anonPromise) {
      // Phiên ẩn danh chỉ sống trong tab: không đè phiên giáo viên, không lưu lâu trên máy chung
      anonPromise = F.auth.setPersistence(global.firebase.auth.Auth.Persistence.SESSION)
        .then(() => F.auth.signInAnonymously())
        .finally(() => { anonPromise = null; });
    }
    const cred = await anonPromise;
    return cred.user;
  }

  /**
   * Nối vào phòng `code` qua Firestore. Trả về conn giả: 'open' khi thấy phòng, 'data' mỗi tin
   * của máy giáo viên, 'error' {type:'peer-unavailable'} khi không có phòng / chưa mở đường dự phòng.
   */
  async function connect(code) {
    const F = await firebase();
    const user = await signedIn(F);
    const ref = F.db.collection(COL).doc(code);
    const upRef = ref.collection('up').doc(user.uid);
    let last = 0;
    let upSeq = Date.now();
    const upQ = [];
    let upT = 0;
    let unsub = null;

    let pendingAcks = [];
    let upBusy = false;
    let upAgain = false;
    let lastUpDone = 0;
    function scheduleUp() {
      clearTimeout(upT);
      // gom tin bấm liền nhau; firestore.rules chặn 2 lần ghi cách nhau ≤ 0,5 giây
      upT = setTimeout(writeUp, Math.max(150, UP_GAP_MS - (Date.now() - lastUpDone)));
    }
    function writeUp() {
      upT = 0;
      if (upBusy) { upAgain = true; return; }
      upBusy = true;
      const acks = pendingAcks;
      pendingAcks = [];
      upRef.set({ m: upQ.slice(), exp: ts(Date.now() + TTL_MS), at: global.firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => acks.forEach((m) => conn.emit('data', { t: 'got', i: m.i, k: m.k })))
        .catch((e) => conn.emit('error', Object.assign(e, { type: 'network' })))
        .finally(() => {
          upBusy = false;
          lastUpDone = Date.now();
          if (upAgain) { upAgain = false; scheduleUp(); }
        });
    }
    const conn = makeConn((msg) => {
      upQ.push({ n: ++upSeq, j: JSON.stringify(msg) });
      while (upQ.length > KEEP) upQ.shift();
      if (msg.t === 'ans') pendingAcks.push(msg);
      scheduleUp();
    }, () => { if (unsub) unsub(); clearTimeout(upT); });

    unsub = ref.onSnapshot((doc) => {
      if (!doc.exists) {
        if (conn.open) { conn.open = false; conn.emit('close'); } else conn.emit('error', { type: 'peer-unavailable' });
        return;
      }
      if (!conn.open) { conn.open = true; conn.emit('open'); }
      const data = doc.data() || {};
      fresh((data.out || {})[user.uid], last).forEach((x) => {
        const msg = joinMsg(x, data.blobs);
        if (!msg) return; // thiếu phần chung (không xảy ra khi máy giáo viên ghi cùng 1 lần) — chờ lần sau
        last = x.n;
        conn.emit('data', msg);
      });
    }, (err) => conn.emit('error', Object.assign(err, { type: err.code === 'permission-denied' ? 'peer-unavailable' : 'network' })));
    return conn;
  }

  // ============================================================
  // HẠN MỨC CHỖ (máy giáo viên) — Firestore dùng chung cả dự án
  // ============================================================
  /**
   * Bộ đếm chỗ đường dự phòng của 1 phòng. fetchChunk(n) → Promise<{granted, used, cap}> (Apps Script
   * arenaRelayTicket); lỗi lần đầu → cho localMax chỗ (Apps Script cũ / mất mạng), lỗi lần sau → hết.
   * Nhiều em tới cùng lúc chỉ có 1 lượt xin đang chạy; em vào lại (cùng cid) không tốn chỗ mới.
   */
  function slots({ fetchChunk, roomMax = 25, chunk = 5, localMax = 10 }) {
    const st = { cids: new Set(), free: 0, out: false, local: false, info: null, pending: null };
    async function more() {
      const want = Math.max(1, Math.min(chunk, roomMax - st.cids.size));
      try {
        const res = await fetchChunk(want);
        st.info = res || null;
        if (res && res.granted > 0) st.free += res.granted; else st.out = true;
      } catch (e) {
        if (!st.local) { st.local = true; st.free += localMax; } else st.out = true;
      }
    }
    async function take(cid) {
      if (st.cids.has(cid)) return true;
      while (st.free <= 0) {
        if (st.out || st.cids.size >= roomMax) return false;
        if (!st.pending) st.pending = more().finally(() => { st.pending = null; });
        await st.pending;
      }
      if (st.cids.size >= roomMax) return false;
      st.free--;
      st.cids.add(cid);
      return true;
    }
    return { take, state: st };
  }

  global.EduArenaRelay = { host, connect, fresh, splitMsg, joinMsg, slots };
})(window);
