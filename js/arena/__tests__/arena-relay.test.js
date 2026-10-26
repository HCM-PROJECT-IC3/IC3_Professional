/* Test đường dự phòng Firestore của Phòng cả lớp (js/arena/arena-relay.js) với Firestore GIẢ trong
   bộ nhớ (onSnapshot + docChanges) — không gọi Firebase thật, có đếm lượt đọc/ghi.
   Chạy: node js/arena/__tests__/arena-relay.test.js */
'use strict';
const path = require('path');

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Firestore giả ──
const docs = new Map();      // path → data
const listeners = [];        // { kind: 'doc'|'col', path, cb, known:Set }
const stat = { reads: 0, writes: 0 };
const upWrites = [];       // giờ ghi up/{uid} (kiểm giãn cách — firestore.rules chặn ≤ 0,5 giây)
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function notify(changedPath) {
  listeners.slice().forEach((l) => {
    if (l.kind === 'doc' && l.path === changedPath) { stat.reads++; l.cb(docSnap(l.path)); }
    if (l.kind === 'col' && changedPath.startsWith(l.path + '/') && !changedPath.slice(l.path.length + 1).includes('/')) {
      const id = changedPath.slice(l.path.length + 1);
      const exists = docs.has(changedPath);
      const type = !exists ? 'removed' : l.known.has(id) ? 'modified' : 'added';
      if (exists) l.known.add(id); else l.known.delete(id);
      stat.reads++;
      l.cb({ docChanges: () => [{ type, doc: { id, data: () => clone(docs.get(changedPath)) } }] });
    }
  });
}
function docSnap(p) { return { exists: docs.has(p), data: () => clone(docs.get(p)) }; }
function docRef(p) {
  return {
    path: p,
    collection: (n) => colRef(p + '/' + n),
    async set(d) { stat.writes++; if (p.includes('/up/')) upWrites.push(Date.now()); docs.set(p, clone(d)); setTimeout(() => notify(p)); },
    async update(upd) {
      if (!docs.has(p)) throw Object.assign(new Error('not-found'), { code: 'not-found' });
      stat.writes++;
      const d = docs.get(p);
      Object.keys(upd).forEach((k) => { const ks = k.split('.'); let o = d; ks.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; }); o[ks[ks.length - 1]] = clone(upd[k]); });
      setTimeout(() => notify(p));
    },
    async delete() { stat.writes++; docs.delete(p); setTimeout(() => notify(p)); },
    onSnapshot(cb) {
      const l = { kind: 'doc', path: p, cb };
      listeners.push(l);
      setTimeout(() => { stat.reads++; cb(docSnap(p)); });
      return () => listeners.splice(listeners.indexOf(l), 1);
    },
  };
}
function colRef(p) {
  return {
    doc: (id) => docRef(p + '/' + id),
    onSnapshot(cb) {
      const l = { kind: 'col', path: p, cb, known: new Set() };
      listeners.push(l);
      setTimeout(() => {
        const changes = [...docs.keys()].filter((k) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'))
          .map((k) => { const id = k.slice(p.length + 1); l.known.add(id); return { type: 'added', doc: { id, data: () => clone(docs.get(k)) } }; });
        stat.reads += Math.max(1, changes.length);
        cb({ docChanges: () => changes });
      });
      return () => listeners.splice(listeners.indexOf(l), 1);
    },
  };
}
const auth = {
  currentUser: { uid: 'T1', isAnonymous: false },
  onAuthStateChanged(fn) { setTimeout(fn); return () => {}; },
  async setPersistence() {},
  anon: 0,
  async signInAnonymously() { auth.currentUser = { uid: 'S' + (++auth.anon), isAnonymous: true }; return { user: auth.currentUser }; },
};
global.window = global;
global.firebase = { firestore: { Timestamp: { fromMillis: (ms) => ({ ms }) }, FieldValue: { serverTimestamp: () => 'SERVER_TS' } }, auth: { Auth: { Persistence: { SESSION: 'session' } } } };
global.EduLazyLoad = { loadScripts: async () => {} };
global.EduFirebaseLoader = { ensure: async () => ({ db: { collection: (n) => colRef(n) }, auth }) };
require(path.join(__dirname, '..', 'arena-relay.js'));
const Relay = global.EduArenaRelay;

(async () => {
  eq('fresh(): chỉ tin mới, đúng thứ tự', Relay.fresh([{ n: 5 }, { n: 3 }, { n: 1 }, null], 2).map((x) => x.n), [3, 5]);

  // ── Máy giáo viên mở đường dự phòng ──
  const hostGot = [];
  let lobby = false;
  const host = await Relay.host('ABC234', (conn) => {
    conn.on('data', (msg) => {
      hostGot.push(msg.t);
      if (msg.t === 'hello') { conn.send({ t: 'welcome', you: { name: msg.name } }); conn.send({ t: 'lobby', count: 1, players: [[1, 2]] }); }
      if (msg.t === 'ans') { conn.send({ t: 'got', i: msg.i, k: msg.k }); conn.send({ t: 'reveal', i: msg.i, correctIdx: 1, you: { ok: msg.k === 1 } }); }
      if (msg.t === 'q?') conn.send({ t: 'q', i: 3, text: 'Câu hỏi dài '.repeat(40), options: ['A', 'B', 'C', 'D'], answered: null, hp: msg.hp });
    });
  }, () => lobby);
  eq('mở phòng: 1 ghi (document phòng)', [stat.writes, docs.get('arena_relay/ABC234').hostUid], [1, 'T1']);

  // ── Học sinh (máy khác, chưa đăng nhập) ──
  auth.currentUser = null;
  const conn = await Relay.connect('ABC234');
  eq('học sinh đăng nhập ẩn danh', auth.currentUser.uid, 'S1');
  const got = [];
  let opened = false;
  conn.on('open', () => { opened = true; conn.send({ t: 'hello', cid: 'c1', name: 'Lan' }); });
  conn.on('data', (m) => got.push(m.t));
  await sleep(1600);
  eq('học sinh thấy phòng, gửi hello, máy giáo viên nhận', [opened, hostGot], [true, ['hello']]);
  eq('học sinh nhận welcome + lobby (mảng lồng mảng vẫn gửi được)', got, ['welcome', 'lobby']);

  const w0 = stat.writes;
  conn.send({ t: 'ans', i: 0, k: 1 });
  await sleep(300);
  eq('trả lời: 1 ghi, máy em tự báo "got" khi ghi xong', [stat.writes - w0, got[got.length - 1]], [1, 'got']);
  await sleep(1500);
  eq('máy giáo viên nhận đáp án, học sinh nhận reveal (không nhận "got" thứ 2 qua Firestore)', [hostGot, got], [['hello', 'ans'], ['welcome', 'lobby', 'got', 'reveal']]);
  const room = docs.get('arena_relay/ABC234');
  const out = room.out.S1.map((x) => Relay.joinMsg(x, room.blobs).t);
  eq('"got" không bị ghi vào document phòng', out.includes('got'), false);
  eq('reveal mang phần riêng "you" đúng của em', Relay.joinMsg(room.out.S1[room.out.S1.length - 1], room.blobs).you, { ok: true });

  // Nhiều tin liền nhau → gom 1 lần ghi, giữ ≤ 4 tin
  const w1 = stat.writes;
  for (let i = 0; i < 6; i++) conn.send({ t: 'ans', i: 10 + i, k: 0 });
  await sleep(1800);
  eq('6 tin liền nhau: học sinh 1 lần ghi (gom), máy giáo viên ≤ 1 lần ghi/giây', stat.writes - w1 <= 3, true);
  eq('document up giữ ≤ 4 tin', docs.get('arena_relay/ABC234/up/S1').m.length, 4);
  eq('document up có at = giờ máy chủ (rules chống spam)', docs.get('arena_relay/ABC234/up/S1').at, 'SERVER_TS');
  upWrites.length = 0;
  conn.send({ t: 'ans', i: 20, k: 0 });
  await sleep(300);
  conn.send({ t: 'ans', i: 21, k: 0 });
  await sleep(1500);
  eq('2 tin cách 0,3 giây: 2 lần ghi cách nhau ≥ 1 giây', upWrites.length === 2 && upWrites[1] - upWrites[0] >= 1000, true);

  // ── 2 học sinh dự phòng: câu hỏi (phần chung) chỉ lưu 1 bản ──
  auth.currentUser = null;
  const conn2 = await Relay.connect('ABC234');
  const got2 = [];
  conn2.on('open', () => conn2.send({ t: 'hello', cid: 'c2', name: 'Minh' }));
  conn2.on('data', (m) => got2.push(m));
  await sleep(1600);
  conn.send({ t: 'q?', hp: 3 }); conn2.send({ t: 'q?', hp: 1 });
  await sleep(1800);
  const r2 = docs.get('arena_relay/ABC234');
  const qOf = (uid) => r2.out[uid].filter((x) => Relay.joinMsg(x, r2.blobs).t === 'q');
  eq('2 em cùng 1 mã phần chung cho câu hỏi', qOf('S1')[0].b === qOf('S2')[0].b, true);
  eq('phần riêng (máu) vẫn khác nhau', [Relay.joinMsg(qOf('S1')[0], r2.blobs).hp, Relay.joinMsg(qOf('S2')[0], r2.blobs).hp], [3, 1]);
  const q2 = got2.find((m) => m.t === 'q');
  eq('em thứ 2 nhận đủ câu hỏi ghép lại', [q2 && q2.text.length, q2 && q2.options.length, q2 && q2.hp], ['Câu hỏi dài '.repeat(40).length, 4, 1]);
  const blobKeys = Object.keys(r2.blobs);
  const referenced = new Set(Object.values(r2.out).flat().map((x) => x.b));
  eq('bảng phần chung chỉ giữ mã còn dùng', blobKeys.every((k) => referenced.has(k)) && blobKeys.length === referenced.size, true);
  eq('splitMsg: phần riêng tách khỏi phần chung', Relay.splitMsg({ t: 'q', text: 'x', hp: 2, you: 1 }).p, '{"hp":2,"you":1}');

  // Sảnh chờ: gom thưa hơn
  lobby = true;

  // ── Đóng phòng ──
  let closed = false;
  conn.on('close', () => { closed = true; });
  host.close();
  await sleep(1800);
  eq('đóng phòng: xoá document, máy em nhận "close"', [docs.has('arena_relay/ABC234'), closed], [false, true]);

  // Phòng không tồn tại
  const ghost = await Relay.connect('ZZZ999');
  let err = null;
  ghost.on('error', (e) => { err = e.type; });
  await sleep(50);
  eq('mã phòng không có → peer-unavailable', err, 'peer-unavailable');

  // ── Hạn mức chỗ (Firestore dùng chung cả dự án) ──
  let calls = 0;
  let budget = 7; // cả hệ thống hôm nay còn 7 chỗ
  const sl = Relay.slots({ roomMax: 25, fetchChunk: async (n) => { calls++; const g = Math.min(n, budget); budget -= g; return { granted: g, used: 7 - budget, cap: 7 }; } });
  const res = await Promise.all(Array.from({ length: 10 }, (_, i) => sl.take('c' + i)));
  eq('10 em cùng lúc, hệ thống còn 7 chỗ → đúng 7 em vào', res.filter(Boolean).length, 7);
  eq('xin theo gói: 7 chỗ chỉ tốn 2 lượt xin + 1 lượt biết đã hết', calls, 3);
  eq('em vào lại (rớt mạng) không tốn chỗ mới', [await sl.take('c0'), calls], [true, 3]);
  const sl2 = Relay.slots({ roomMax: 3, fetchChunk: async (n) => ({ granted: n, used: n, cap: 100 }) });
  eq('trần mỗi phòng', (await Promise.all(['a', 'b', 'c', 'd'].map((c) => sl2.take(c)))).filter(Boolean).length, 3);
  const sl3 = Relay.slots({ roomMax: 25, localMax: 2, fetchChunk: async () => { throw new Error('not-found'); } });
  eq('Apps Script cũ/lỗi: cho tối đa localMax em rồi dừng', (await Promise.all(['a', 'b', 'c'].map((c) => sl3.take(c)))).filter(Boolean).length, 2);

  console.log(`\n(Firestore giả: ${stat.writes} ghi, ${stat.reads} đọc cho cả bài test)`);
  console.log(failures ? `\n${failures} test FAIL` : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
