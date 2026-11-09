/* Firestore/Auth compat SDK giả: đếm lượt đọc/ghi như biểu phí thật (query = max(1,số doc), get 1 doc = 1, listener = lượt đầu + mỗi doc đổi). */
(function () {
  const P = window.__FS_PROFILE || { uid: 'admin1', role: 'admin' };
  const LOG = (window.__fsLog = { reads: [], writes: [], listens: 0, t0: Date.now() });
  // Timestamp thật là class: field seconds/nanoseconds + hàm trên prototype (structured clone/IndexedDB lưu được)
  class Ts { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } toMillis() { return this.seconds * 1e3 + Math.floor(this.nanoseconds / 1e6); } toDate() { return new Date(this.toMillis()); } isEqual(o) { return !!o && o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; } }
  Object.defineProperty(Ts.prototype, '__ts', { value: true });
  const T = (ms) => new Ts(Math.floor(ms / 1e3), (ms % 1e3) * 1e6);
  const now = Date.now();
  const DB = {};
  const col = (n) => (DB[n] = DB[n] || {});
  // ---- dữ liệu mẫu cỡ thật
  for (let i = 0; i < 120; i++) col('users')['t' + i] = { role: i % 9 === 0 ? 'coordinator' : 'teacher', approved: true, name: 'GV ' + i, email: 'gv' + i + '@x.vn', schools: ['Trường ' + (i % 40)], updatedAt: T(now - i * 6e5) };
  const schools = Array.from({ length: 40 }, (_, i) => 'Trường ' + i);
  schools.forEach((s, i) => { col('schools')['truong-' + i] = { name: s, status: 'active' }; }); // id = EduModels.School.schoolIdOf(name)
  for (let i = 0; i < 150; i++) col('classes')['c' + i] = { name: 'Lớp ' + i, school: schools[i % 40], teacherId: 't' + (i % 120), status: 'active' };
  for (let i = 0; i < 60; i++) col('teaching_teachers')['tt' + i] = { name: 'GV ' + i, school: schools[i % 40] };
  for (let i = 0; i < 3000; i++) col('students_roster')['hs' + i] = { name: 'HS ' + i, studentSchool: schools[i % 40], school: schools[i % 40], classId: 'c' + (i % 150), teacherId: 't' + (i % 120), status: i < 2800 ? 'active' : 'inactive', updatedAt: T(now - (i % 90) * 864e5) };
  // Hồ sơ người đăng nhập đặt SAU dữ liệu mẫu: uid trùng giáo viên mẫu (vd 't3') vẫn giữ lớp/học sinh của người đó.
  // __FS_PROFILE.schools: trường được xem (giáo viên/điều phối/quản trị trường).
  // __FS_PROFILES (multi.py): hồ sơ của MỌI máy — máy nào nạp dữ liệu mẫu lên Firestore chung trước cũng có đủ tài khoản.
  (window.__FS_PROFILES || [P]).forEach((Q) => { col('users')[Q.uid] = Object.assign({}, col('users')[Q.uid], { role: Q.role, approved: true, name: Q.name || 'Tài khoản thử', email: Q.uid + '@x.vn', schools: Q.schools || (col('users')[Q.uid] || {}).schools || [] }); });
  for (let i = 0; i < 85; i++) col('gvlab_profiles')['g' + i] = { name: 'P' + i };
  const PERSIST = ['users', 'schools', 'classes', 'teacher_sync'];
  const ser = (o) => JSON.stringify(o, (k, v) => (v && v.__ts ? { __tsms: v.toMillis() } : v));
  const rev = (txt) => JSON.parse(txt, (k, v) => (v && v.__tsms !== undefined ? T(v.__tsms) : v));
  if (!window.__FS_SHARED) PERSIST.forEach((n) => { try { const raw = localStorage.getItem('__fsdb_' + n); if (raw) DB[n] = rev(raw); } catch (e) {} });
  const saveCol = (n) => { if (!window.__FS_SHARED && PERSIST.includes(n)) try { localStorage.setItem('__fsdb_' + n, ser(DB[n])); } catch (e) {} };
  const SHARED = window.__FS_SHARED || null;
  let ready = Promise.resolve();
  async function refresh() { // lấy bản mới nhất do các "máy" khác ghi
    if (!SHARED) return;
    const r = await fetch(SHARED + '/db'); const txt = await r.text();
    if (txt) { const fresh = rev(txt); Object.keys(DB).forEach((k) => delete DB[k]); Object.assign(DB, fresh); }
    else await fetch(SHARED + '/db?init=1', { method: 'PUT', body: ser(DB) });
  }
  let queue = [];
  async function push() { // chỉ gửi các lệnh ghi (theo từng doc) — máy chủ thử gộp như Firestore thật
    if (!SHARED || !queue.length) return;
    const ops = queue; queue = [];
    await fetch(SHARED + '/ops', { method: 'POST', body: ser(ops) });
  }
  const sentinel = { __sv: true };
  const resolve = (d) => { const o = {}; Object.keys(d || {}).forEach((k) => { o[k] = d[k] === sentinel ? T(Date.now()) : d[k]; }); return o; };
  const cmpv = (v) => (v && v.__ts ? v.toMillis() : v);
  const OPS = { '==': (a, b) => cmpv(a) === cmpv(b), '!=': (a, b) => cmpv(a) !== cmpv(b), '>': (a, b) => cmpv(a) > cmpv(b), '>=': (a, b) => cmpv(a) >= cmpv(b), '<': (a, b) => cmpv(a) < cmpv(b), '<=': (a, b) => cmpv(a) <= cmpv(b), in: (a, b) => b.includes(a), 'array-contains': (a, b) => Array.isArray(a) && a.includes(b), 'array-contains-any': (a, b) => Array.isArray(a) && a.some((x) => b.includes(x)) };
  const docSnap = (path, id, data) => ({ id, exists: data !== undefined, ref: { path, id }, metadata: { fromCache: false }, data: () => (data === undefined ? undefined : JSON.parse(JSON.stringify(data), (k, v) => v)), get: (f) => (data || {})[f] });
  // data() phải trả lại Timestamp thật → không JSON hoá
  const mk = (path, id, data) => { const s = docSnap(path, id, data); s.data = () => (data === undefined ? undefined : Object.assign({}, data)); return s; };
  // Máy chủ chung tự đếm lượt đọc (không mất khi trang tải lại / đóng giữa chừng — Firestore thật vẫn tính phí truy vấn đã gửi)
  const report = (label, n) => { if (window.__FS_SHARED) try { fetch(window.__FS_SHARED + '/read', { method: 'POST', body: JSON.stringify({ label, n }), keepalive: true }); } catch (e) {} };
  const note = (kind, label, n, extra) => { report(label, n); LOG.reads.push(Object.assign({ kind, label, n, at: Date.now() - LOG.t0 }, extra || {})); };
  // Độ trễ giống thật (__FS_LATENCY = {base, perDoc} ms): truy vấn 3.000 doc ≈ 3 giây → tái hiện nhiều tab/F5 chen nhau lúc đang tải
  const LAT = window.__FS_LATENCY || null;
  const wait = (n) => (LAT ? new Promise((r) => setTimeout(r, (LAT.base || 0) + (LAT.perDoc || 0) * n)) : Promise.resolve());
  class Query {
    constructor(name, f, o, l, sa) { this._n = name; this._f = f || []; this._o = o || []; this._l = l || null; this._sa = sa; }
    where(a, b, c) { return new Query(this._n, this._f.concat([[a, b, c]]), this._o, this._l, this._sa); }
    orderBy(a, d) { return new Query(this._n, this._f, this._o.concat([[a, d || 'asc']]), this._l, this._sa); }
    limit(n) { return new Query(this._n, this._f, this._o, n, this._sa); }
    startAfter(v) { return new Query(this._n, this._f, this._o, this._l, v); } // chỉ hỗ trợ orderBy(mã doc)
    _run() {
      let rows = Object.entries(col(this._n)).filter(([, d]) => this._f.every(([f, op, v]) => OPS[op](d[f], v)));
      const val = (row, f) => (f === '__name__' ? row[0] : cmpv(row[1][f]));
      this._o.forEach(([f, dir]) => rows.sort((x, y) => (val(x, f) > val(y, f) ? 1 : -1) * (dir === 'desc' ? -1 : 1)));
      if (this._sa !== undefined) rows = rows.filter((r) => r[0] > this._sa);
      if (this._l) rows = rows.slice(0, this._l);
      const docs = rows.map(([id, d]) => mk(this._n + '/' + id, id, d));
      return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, forEach: (fn) => docs.forEach(fn), docChanges: () => docs.map((d) => ({ type: 'added', doc: d })) };
    }
    async get() {
      await refresh();
      const s = this._run();
      note('query', this._n + (this._f.length ? ' where ' + this._f.map((x) => x[0] + x[1]).join('&') : ''), Math.max(1, s.size), { limit: this._l, delta: this._f.some((x) => x[0] === 'updatedAt' || x[0] === 'submittedAt') });
      await wait(s.size);
      return s;
    }
    onSnapshot(a, b) {
      const cb = typeof a === 'function' ? a : a.next; LOG.listens++;
      refresh().then(() => { const s = this._run(); note('listen', this._n, Math.max(1, s.size)); cb(s); }); return () => {};
    }
  }
  class DocRef {
    constructor(name, id) { this._n = name; this.id = id; this.path = name + '/' + id; }
    async get() { await refresh(); note('doc', this._n + '/' + (this._n === 'users' ? '{uid}' : this.id), 1); await wait(1); const d = col(this._n)[this.id]; return mk(this.path, this.id, d); }
    async _do(op, d, o, skipPush) {
      if (!skipPush) await refresh();
      LOG.writes.push({ label: this._n, op, at: Date.now() - LOG.t0 });
      if (op === 'set') col(this._n)[this.id] = o && o.merge ? Object.assign({}, col(this._n)[this.id], resolve(d)) : resolve(d);
      else if (op === 'update') col(this._n)[this.id] = Object.assign({}, col(this._n)[this.id], resolve(d));
      else delete col(this._n)[this.id];
      if (SHARED) queue.push({ c: this._n, i: this.id, op, d: op === 'delete' ? null : resolve(d), merge: !!(o && o.merge) || op === 'update' });
      saveCol(this._n); if (!skipPush) await push();
    }
    set(d, o) { return this._do('set', d, o); }
    update(d) { return this._do('update', d); }
    delete() { return this._do('delete'); }
    onSnapshot(a) { const cb = typeof a === 'function' ? a : a.next; LOG.listens++; note('listen', this._n + '/' + this.id, 1); refresh().then(() => cb(mk(this.path, this.id, col(this._n)[this.id]))); return () => {}; }
    collection(sub) { return new CollRef(this._n + '/' + this.id + '/' + sub); }
  }
  class CollRef extends Query {
    constructor(n) { super(n); this.id = n.split('/').pop(); }
    doc(id) { return new DocRef(this._n, id || 'auto' + Math.random().toString(36).slice(2, 10)); }
    add(d) { const r = this.doc(); return r.set(d).then(() => r); }
  }
  class Batch {
    constructor() { this.ops = []; }
    set(r, d, o) { this.ops.push(['set', r, d, o]); return this; }
    update(r, d) { this.ops.push(['update', r, d]); return this; }
    delete(r) { this.ops.push(['delete', r]); return this; }
    async commit() { await refresh(); for (const [m, r, d, o] of this.ops) await r._do(m, d, o, true); await push(); }
  }
  const dbObj = {
    collection: (n) => new CollRef(n), doc: (p) => { const [c, i] = p.split('/'); return new DocRef(c, i); },
    collectionGroup: (n) => { note('query', 'collectionGroup ' + n, 1); return new CollRef('__cg_' + n); },
    batch: () => new Batch(), settings() {}, enablePersistence: () => Promise.resolve(),
    runTransaction: (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: (r) => r.delete() }),
  };
  const fs = () => dbObj;
  fs.Query = Query; fs.WriteBatch = Batch; fs.setLogLevel = () => {};
  // Như SDK compat thật: trang móc vào prototype các lớp này để xoá bản đệm khi ghi (schedule-read-cache installWriteHooks)
  fs.DocumentReference = DocRef; fs.CollectionReference = CollRef;
  fs.FieldPath = { documentId: () => '__name__' };
  fs.FieldValue = { serverTimestamp: () => sentinel, increment: (n) => ({ __inc: n }), arrayUnion: (...a) => a, arrayRemove: (...a) => a, delete: () => null };
  fs.Timestamp = Object.assign(function (sec, ns) { return new Ts(sec, ns || 0); }, { fromMillis: T, now: () => T(Date.now()), fromDate: (d) => T(d.getTime()) });
  const user = { uid: P.uid, email: P.uid + '@x.vn', displayName: 'Admin Test', emailVerified: true, getIdToken: () => Promise.resolve('tok'), updateProfile: () => Promise.resolve() };
  const authObj = { currentUser: user, onAuthStateChanged: (cb) => { setTimeout(() => cb(user), 20); return () => {}; }, setPersistence: () => Promise.resolve(), signOut: () => Promise.resolve(), signInWithEmailAndPassword: () => Promise.resolve({ user }), createUserWithEmailAndPassword: () => Promise.resolve({ user }), sendPasswordResetEmail: () => Promise.resolve(), onIdTokenChanged: () => () => {} };
  const auth = () => authObj; auth.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
  const apps = [];
  window.firebase = { apps, initializeApp: (c) => { const a = { options: c, name: '[DEFAULT]' }; apps.push(a); return a; }, app: () => apps[0], firestore: fs, auth, appCheck: () => ({ activate() {} }), SDK_VERSION: 'fake' };
})();
