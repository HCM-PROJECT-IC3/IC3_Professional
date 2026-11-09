window.EDU_ALLOWED_ROLES = ['admin'];

  // ---- Nút chuyển sáng/tối (đồng hồ mặt trời neumorphism, xem
  // .theme-toggle trong css/admin-users.css). ----
  (function initThemeToggle() {
    const saved = localStorage.getItem('ic3_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ic3_theme', next);
    });
  })();

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  // Danh sách trường CHUẨN (nguồn thật: collection "students_roster", do
  // Điều phối đào tạo quản lý trong roster-manager.html) — dùng để gán
  // "Trường được xem" cho giáo viên, đảm bảo khớp CHÍNH XÁC với giá trị
  // studentSchool được ghi vào quiz_results lúc học sinh nộp bài (ô Trường
  // ở index.html cũng là dropdown lấy từ CÙNG một nguồn, xem js/lobby-roster.js).
  // Không cho gõ tay để tránh lệch chính tả → giáo viên bị rớt mất dữ liệu
  // hợp lệ do firestore.rules so khớp "in" tuyệt đối chuỗi.
  let allSchools = [];
  // uid (users/{uid}, CHÍNH LÀ students_roster.teacherId — roster-manager.html
  // gán "Giáo viên phụ trách" cho 1 lớp bằng UID tài khoản, không phải
  // teacherCode của Lịch giảng dạy) -> Set các trường có học sinh ĐANG HỌC
  // do giáo viên đó phụ trách = "trường giáo viên này THẬT SỰ đang dạy".
  // Dùng để TỰ ĐỘNG suy ra/sửa lại "Trường được xem" thay vì admin phải tự
  // multi-select tay (dễ gán nhầm/gán sót — đã thấy
  // nhiều giáo viên khác nhau bị gán CÙNG 1 bộ trường giống hệt nhau).
  let schoolsByTeacherId = {};
  let rosterLoaded = true; // false: schoolsByTeacherId CHƯA suy ra từ roster (chế độ EduBackend.adminUsers.lazyRoster)

  let lookupsLoadedAt = 0;

  // Lookups (trường/lớp/GV Lịch giảng dạy) suy từ TOÀN BỘ students_roster đang học
  // (~1.466 doc) — lưu IndexedDB 12 giờ (js/services/data-cache-service.js; trước: 30 phút
  // → mỗi lần admin mở trang cách nhau >30 phút tốn lại ~1.466 lượt đọc) để
  // mở lại admin-users.html không đọc lại cả roster mỗi lần. Lookups lấy từ cache
  // này KHÔNG dùng cho vòng tự sửa "Trường được xem" (xem loadUsers()) vì roster có
  // thể vừa đổi ở máy khác (roster-manager.html) — tránh ghi đè bằng dữ liệu cũ.
  const LOOKUPS_CACHE_KEY = 'admin-users:lookups';
  const LOOKUPS_TTL_MS = 12 * 60 * 60 * 1000;

  function saveLookupsCache() {
    if (!window.EduDataCache) return;
    const byTeacher = {};
    Object.keys(schoolsByTeacherId).forEach((k) => { byTeacher[k] = [...schoolsByTeacherId[k]]; });
    window.EduDataCache.setAsync(LOOKUPS_CACHE_KEY, { allSchools, allClasses, allTeachingTeachers, byTeacher, rosterLoaded }, LOOKUPS_TTL_MS, true);
  }

  /** Nhật ký thao tác trên tài khoản (Apps Script → tab NhatKyHoatDong, ai làm lấy từ token). */
  function logUserChange(userAction, uid, meta) {
    if (window.EduActivityLog) {
      window.EduActivityLog.log(window.EduModels.ActivityLog.ACTIONS.UPDATE_USER, {
        targetId: uid, meta: Object.assign({ userAction }, meta || {}),
      });
    }
  }

  async function restoreLookupsCache() {
    const c = window.EduDataCache ? await window.EduDataCache.getAsync(LOOKUPS_CACHE_KEY, true) : null;
    if (!c) return false;
    allSchools = c.allSchools || [];
    allClasses = c.allClasses || [];
    allTeachingTeachers = c.allTeachingTeachers || [];
    schoolsByTeacherId = {};
    Object.keys(c.byTeacher || {}).forEach((k) => { schoolsByTeacherId[k] = new Set(c.byTeacher[k]); });
    rosterLoaded = c.rosterLoaded !== false;
    return true;
  }

  /** Buộc lần loadUsers() kế tiếp đọc lại roster thật (sau khi chính trang này đổi
   *  phân công lớp → schoolsByTeacherId cũ không còn đúng). */
  function invalidateLookups() {
    lookupsLoadedAt = 0;
    if (window.EduDataCache) window.EduDataCache.clear(LOOKUPS_CACHE_KEY, true);
  }
  async function loadSchools() {
    try {
      // Bản đệm chung với Dashboard điều phối / giáo viên / Quản lý lớp (js/services/roster-cache-service.js)
      const students = await window.EduRosterCache.activeAll();
      const set = new Set();
      schoolsByTeacherId = {};
      students.forEach(data => {
        const s = (data.school || '').trim();
        if (!s) return;
        set.add(s);
        if (!data.teacherId) return;
        (schoolsByTeacherId[data.teacherId] = schoolsByTeacherId[data.teacherId] || new Set()).add(s);
      });
      allSchools = [...set].sort((a, b) => a.localeCompare(b, 'vi'));
      rosterLoaded = true;
      const collisions = window.EduModels.School.findCollisions(allSchools);
      if (collisions.length) {
        toast(`⚠️ Tên trường chỉ khác dấu sẽ bị coi là 1 trường: ${collisions.map((g) => g.join(' / ')).join('; ')} — đổi tên trong Quản lý lớp cho khác hẳn`);
      }
      // Danh mục "schools" (id = schoolId) theo tên trường đang có trong roster — chỉ thêm trường mới.
      window.EduRepositories.school.ensureFromNames(allSchools)
        .then((ids) => { if (ids.length) toast(`Đã thêm ${ids.length} trường vào danh mục trường`); })
        .catch((err) => console.warn('[EduAdminUsers] Không cập nhật được danh mục trường:', err.message));
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh sách trường (students_roster):', err.message);
      allSchools = [];
      schoolsByTeacherId = {};
      rosterLoaded = false;
    }
  }

  const lazyRoster = () => !!(window.EduBackend && window.EduBackend.adminUsers && window.EduBackend.adminUsers.lazyRoster);
  /** Chế độ lazyRoster: danh sách trường lấy từ danh mục `schools` (vài chục doc) thay vì suy từ cả roster. */
  async function loadSchoolsLite() {
    try {
      const list = await window.EduRepositories.school.listAll();
      allSchools = list.filter((s) => s.status !== 'inactive').map((s) => String(s.name || '').trim()).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'vi'));
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh mục trường:', err.message);
      allSchools = [];
    }
    schoolsByTeacherId = {};
    rosterLoaded = false;
  }
  /** Cần biết giáo viên đang dạy trường nào (nút đồng bộ trường): đọc roster khi chưa có. */
  async function ensureRoster() {
    if (rosterLoaded) return;
    await loadSchools();
    if (rosterLoaded) { lookupsLoadedAt = Date.now(); saveLookupsCache(); }
  }

  /** Trường THẬT SỰ giáo viên `uid` đang dạy (suy từ students_roster đang
   * học, KHÔNG phải giá trị đã lưu tay trên users/{uid}.schools — dùng để
   * so sánh/tự sửa nếu 2 giá trị lệch nhau). */
  function actualSchoolsOf(uid) {
    return [...(schoolsByTeacherId[uid] || [])].sort((a, b) => a.localeCompare(b, 'vi'));
  }

  // Danh sách giáo viên trong "Lịch giảng dạy" (teaching-schedule.html) —
  // dùng để liên kết 1 tài khoản (role teacher) với ĐÚNG 1 bản ghi giáo
  // viên (field "teacherCode" trên users/{uid}), nhờ đó giáo viên tự xem
  // được lịch của mình mà firestore.rules vẫn chặn được xem lịch người khác.
  // Danh sách LỚP thật (collection "classes", do roster-manager.html quản
  // lý) — dùng để admin GÁN TRỰC TIẾP "giáo viên này dạy lớp nào" thay vì
  // chỉ suy gián tiếp qua việc khớp tên GV lúc Nạp Excel (roster-manager.js
  // classifyImportRows() so tên bằng stripDiacritics — 2 GV trùng tên/gõ
  // sai dấu vẫn bị khớp NHẦM, khiến "Đồng bộ theo lớp đang dạy" ở đây lôi
  // theo cả trường/lớp SAI mà admin không có cách nào tự sửa ngoài việc
  // sửa lại tên trong Lịch giảng dạy). Cần chọn tay
  // được lớp cho từng giáo viên ngay tại đây.
  let allClasses = []; // [{id, name, school, courseId, teacherId, teacherName, ...}]

  // Cùng điều kiện (orderBy name) với Quản lý lớp / Dashboard điều phối → dùng chung bản đệm 10 phút của
  // BaseRepository.list({ cacheMs }) (đo 08/11/2026: Admin mở Quản lý tài khoản rồi Quản lý lớp đọc 150 lớp 2 lần).
  // Lớp thiếu field name không có trong kết quả — giống hệt danh sách lớp ở Quản lý lớp.
  async function loadClasses(forceRefresh) {
    try {
      allClasses = await new window.EduBaseRepository('classes').list({ orderBy: 'name', cacheMs: 10 * 60 * 1000, refresh: !!forceRefresh });
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh sách lớp (classes):', err.message);
      allClasses = [];
    }
  }

  /** <optgroup> theo trường, đánh dấu sẵn lớp đang gán cho `uid`, và ghi chú
   * nếu lớp đó đang thuộc về giáo viên KHÁC (giúp admin tránh gán chồng). */
  function classOptionsHtml(uid) {
    const bySchool = {};
    allClasses.forEach(c => {
      const school = c.school || '(Chưa gán trường)';
      (bySchool[school] = bySchool[school] || []).push(c);
    });
    const schoolNames = Object.keys(bySchool).sort((a, b) => a.localeCompare(b, 'vi'));
    return schoolNames.map(school => {
      const opts = bySchool[school]
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
        .map(c => {
          const isMine = c.teacherId === uid;
          const otherLabel = (c.teacherId && !isMine) ? ` — đang: ${c.teacherName || c.teacherId}` : '';
          return `<option value="${esc(c.id)}" ${isMine ? 'selected' : ''}>${esc(c.name || '(chưa đặt tên)')}${esc(otherLabel)}</option>`;
        }).join('');
      return `<optgroup label="${esc(school)}">${opts}</optgroup>`;
    }).join('');
  }

  let allTeachingTeachers = []; // [{code,name}]

  async function loadTeachingTeachers() {
    try {
      const snap = await EduFirebase.db.collection('teaching_teachers').limit(1000).get();
      EduFirebase.countSnap('teaching_teachers', snap);
      allTeachingTeachers = snap.docs
        .map(d => ({ code: d.id, name: (d.data().name || '').trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh sách giáo viên (teaching_teachers):', err.message);
      allTeachingTeachers = [];
    }
  }

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    loadUsers();
  });

  // Cache 15 phút theo tab (05/11/2026, trước 3 phút): hết hạn thì thao tác ghi kế tiếp đọc lại CẢ collection users,
  // Admin sửa từng tài khoản chậm rãi là mỗi lần bấm tốn trọn danh sách. Máy này sửa thì bản đệm tự cập nhật
  // (persist() sau mỗi lần lưu); tài khoản mới đăng ký ở nơi khác hiện chậm tối đa 15 phút trong tab đang mở, tải lại tab là thấy.
  const USERS_CACHE_KEY = 'admin-users:all';
  const USERS_CACHE_TTL_MS = 15 * 60 * 1000;

  const sameList = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  const serverNow = () => firebase.firestore.FieldValue.serverTimestamp();

  // ── Danh sách tài khoản: bản đệm bền + chỉ hỏi phần thay đổi (10/11/2026) ──
  // Đo (Firebase giả cỡ thật): bản đệm 15 phút theo TAB → mỗi lần Admin mở tab mới / mở lại sau 15 phút đọc lại cả
  // collection users (121 lượt). Nay lưu IndexedDB (mọi tab dùng chung): đọc đủ USERS_FULL_MS/lần (bắt tài khoản bị xoá,
  // người dùng tự đổi tên/email — rules không cho họ ghi updatedAt); giữa các lần chỉ hỏi tài khoản TẠO MỚI
  // (createdAt, tự đăng ký luôn có) + Admin VỪA SỬA (updatedAt, mọi lệnh ghi Admin đều đóng dấu) = 2 lượt.
  // Nút tải lại / sau thao tác cần đọc lại (loadUsers(true)) vẫn đọc đủ như cũ.
  const USERS_DELTA_KEY = 'admin-users:delta';
  const USERS_FULL_MS = 24 * 60 * 60 * 1000;
  const USERS_FRESH_MS = 60 * 1000;
  const USERS_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
  const MARGIN_MS = 10 * 60 * 1000; // chưa doc nào có dấu thời gian: mốc = lúc đọc đủ − lệch đồng hồ máy/máy chủ
  const msOf = (v) => (v && typeof v.seconds === 'number' ? v.seconds * 1e3 + Math.floor((Number(v.nanoseconds) || 0) / 1e6) : 0);
  const maxMs = (rows, f) => rows.reduce((m, r) => Math.max(m, msOf(r.u[f])), 0);
  const newestFirst = (a, b) => msOf(b.u.createdAt) - msOf(a.u.createdAt);

  function saveUsersDelta(rows, fullAt, checkedAt) {
    if (!window.EduDataCache) return;
    window.EduDataCache.setAsync(USERS_DELTA_KEY, {
      users: rows, fullAt, checkedAt,
      wmC: maxMs(rows, 'createdAt') || fullAt - MARGIN_MS,
      wmU: maxMs(rows, 'updatedAt') || fullAt - MARGIN_MS,
    }, USERS_KEEP_MS, true);
  }
  /** Bản đệm bền + phần thay đổi → rows [{ id, u }] | null (hết hạn đọc đủ / chưa có). Lưu lại phần vừa gộp. */
  async function deltaRows() {
    const C = window.EduDataCache;
    const e = C ? await C.getAsync(USERS_DELTA_KEY, true) : null;
    const now = Date.now();
    if (!e || !Array.isArray(e.users) || now - (e.fullAt || 0) >= USERS_FULL_MS) return null;
    let rows = e.users;
    if (now - (e.checkedAt || 0) >= USERS_FRESH_MS) {
      try {
        const TS = firebase.firestore.Timestamp;
        const changed = await window.EduRepositories.user.changedSince(TS.fromMillis(e.wmC || 0), TS.fromMillis(e.wmU || 0));
        const byId = new Map(rows.map((r) => [r.id, r]));
        changed.forEach(({ id, ...u }) => byId.set(id, { id, u }));
        rows = [...byId.values()].sort(newestFirst);
        const wmC = Math.max(e.wmC || 0, maxMs(rows, 'createdAt')), wmU = Math.max(e.wmU || 0, maxMs(rows, 'updatedAt'));
        C.setAsync(USERS_DELTA_KEY, { users: rows, fullAt: e.fullAt, checkedAt: now, wmC, wmU }, USERS_KEEP_MS, true);
      } catch (err) {
        console.warn('[EduAdminUsers] Không hỏi được phần thay đổi — dùng bản đã lưu:', err.message);
      }
    }
    return { rows, fullAt: e.fullAt };
  }
  /** Danh sách tài khoản cho nhánh đọc lại: phần thay đổi nếu bản đệm bền còn hạn, không thì đọc đủ.
      → { list: [{ id, ...u }] như listAll(), fullAt } */
  async function usersList(force) {
    const ver = window.EduRepositories.user.versionToken();
    const d = force ? null : await deltaRows();
    if (d) {
      const list = d.rows.map(({ id, u }) => Object.assign({ id }, u));
      window.EduRepositories.user.primeApproved(list, ver); // như listAll(): Quản lý lớp/Dashboard khỏi đọc lại GV đã duyệt
      return { list, fullAt: d.fullAt };
    }
    return { list: await window.EduRepositories.user.listAll(), fullAt: Date.now() };
  }
  /** Nhánh nhanh: bản đệm bền + bản tra cứu còn hạn → [{ doc: {id}, u }] | null. */
  async function usersFromDelta() {
    if (!(await restoreLookupsCache())) return null; // tra cứu hết hạn: đi nhánh đọc lại (vẫn dùng usersList → phần thay đổi)
    const ver = window.EduRepositories.user.versionToken();
    const d = await deltaRows();
    if (!d) return null;
    window.EduRepositories.user.primeApproved(d.rows.map(({ id, u }) => Object.assign({ id }, u)), ver);
    window.EduDataCache.setAsync(USERS_CACHE_KEY, { allSchools, allClasses, allTeachingTeachers, users: d.rows }, USERS_CACHE_TTL_MS);
    return d.rows.map(({ id, u }) => ({ doc: { id }, u }));
  }
  /** @param {boolean} [forceRefresh] Bỏ qua cache — dùng sau khi ghi (duyệt/xoá/đổi role...). */
  async function loadUsers(forceRefresh) {
    const gen = ++loadGen;

    // Cache hit: dựng lại đúng hình dạng { doc: {id}, u } mà toàn bộ code
    // render + gắn sự kiện bên dưới đang dùng (KHÔNG viết lại code đó —
    // chỉ "doc.id" được dùng ở nhánh render/sự kiện, "doc.ref" chỉ cần cho
    // vòng tự sửa TỰ ĐỘNG bên dưới nên bỏ qua an toàn khi có cache).
    let users;
    if (!forceRefresh && window.EduDataCache) {
      const cached = await window.EduDataCache.getAsync(USERS_CACHE_KEY);
      if (cached) {
        allSchools = cached.allSchools;
        allClasses = cached.allClasses;
        allTeachingTeachers = cached.allTeachingTeachers;
        users = cached.users.map(({ id, u }) => ({ doc: { id }, u }));
      }
    }
    if (!users && !forceRefresh) users = await usersFromDelta();

    if (!users) {
      // Sau mỗi thao tác ghi (duyệt/đổi role/gán trường...) loadUsers(true) chỉ cần đọc lại
      // danh sách tài khoản (vài chục-trăm doc). Danh sách trường/lớp/GV tra cứu suy ra từ
      // TOÀN BỘ students_roster đang học (~1.466 doc) nên giữ lại 30 phút, không đọc lại mỗi lần.
      const lookupsInMemory = !!(forceRefresh && lookupsLoadedAt && Date.now() - lookupsLoadedAt < LOOKUPS_TTL_MS);
      const lookupsFromStorage = !lookupsInMemory && await restoreLookupsCache();
      const lookupsFresh = lookupsInMemory || lookupsFromStorage;
      const [{ list, fullAt: usersFullAt }] = await Promise.all([
        usersList(forceRefresh), // bản tra cứu hết hạn ≠ danh sách tài khoản hết hạn: vẫn chỉ hỏi phần thay đổi
        lookupsFresh ? null : (lazyRoster() ? loadSchoolsLite() : loadSchools()),
        lookupsFresh ? null : loadClasses(forceRefresh),
        lookupsFresh ? null : loadTeachingTeachers(),
      ]);
      if (!lookupsFresh) { lookupsLoadedAt = Date.now(); saveLookupsCache(); }
      if (!list.length) {
        if (gen === loadGen) { USERS = []; syncedAt = Date.now(); renderAll(); }
        return;
      }

      // TỰ ĐỘNG sửa "Trường được xem" của giáo viên theo ĐÚNG trường họ đang
      // dạy thật (students_roster.teacherId, xem loadSchools()) — trước đây
      // trường này phải admin tự multi-select tay, dễ gán nhầm/gán sót (đã
      // thấy nhiều giáo viên khác nhau bị gán CÙNG 1 bộ trường). CHỈ tự sửa
      // khi có ít nhất 1 lớp roster thật cho GV đó (actual.length > 0) — GV
      // mới chưa có lớp nào thì giữ nguyên (kể cả rỗng), tránh xoá mất gán
      // tay hợp lệ của admin trong lúc chưa kịp nhập roster.
      // Cùng hình dạng { doc: {id}, u } với nhánh cache hit ở trên; vòng tự sửa
      // bên dưới sửa thẳng `u.schools` để vòng render thấy ngay.
      users = list.map(({ id, ...u }) => ({ doc: { id }, u }));

      const batch = EduFirebase.db.batch();
      let fixedCount = 0;
      users.forEach(({ doc, u }) => {
        if (lookupsFromStorage || !rosterLoaded) return; // chưa có dữ liệu roster → không tự sửa
        if (u.role !== 'teacher') return;
        const saved = Array.isArray(u.schools) ? [...u.schools].sort((a, b) => a.localeCompare(b, 'vi')) : [];
        const actual = actualSchoolsOf(doc.id);
        if (!actual.length) return;
        if (JSON.stringify(saved) === JSON.stringify(actual)) return;
        batch.set(window.EduRepositories.user.col().doc(doc.id), Object.assign(window.EduRepositories.UserRepository.schoolsPatch(actual), { updatedAt: serverNow() }), { merge: true });
        u.schools = actual; // cập nhật NGAY object dùng để render, không cần tải lại
        u.schoolIds = window.EduModels.School.schoolIdsOf(actual);
        fixedCount++;
      });
      // Ghi bù "schoolIds" khớp "schools" cho MỌI tài khoản (Điều phối/Quản trị trường gán trước
      // 02/11/2026 chưa có) — điều kiện để sau này siết rules ghi roster theo schoolId
      // (docs/architecture/AUDIT-2.0.md §4). Không phụ thuộc roster nên chạy cả khi dùng bản đệm.
      let idFixedCount = 0;
      users.forEach(({ doc, u }) => {
        if (!Array.isArray(u.schools)) return;
        if (fixedCount + idFixedCount >= 450) return; // 1 batch ≤ 500 lệnh ghi — phần còn lại lần mở trang sau
        const want = window.EduModels.School.schoolIdsOf(u.schools);
        if (JSON.stringify(u.schoolIds || []) === JSON.stringify(want)) return;
        batch.set(window.EduRepositories.user.col().doc(doc.id), { schoolIds: want, updatedAt: serverNow() }, { merge: true });
        u.schoolIds = want;
        idFixedCount++;
      });
      if (fixedCount || idFixedCount) {
        try {
          await batch.commit();
          if (fixedCount) {
            logUserChange('auto_sync_schools', '', { count: fixedCount });
            toast(`Đã tự đồng bộ lại "Trường được xem" cho ${fixedCount} giáo viên theo đúng lớp đang dạy`);
          }
          if (idFixedCount) logUserChange('backfill_school_ids', '', { count: idFixedCount });
        } catch (err) {
          console.warn('[EduAdminUsers] Không tự đồng bộ được "Trường được xem":', err.message);
        }
      }

      if (window.EduDataCache) {
        window.EduDataCache.setAsync(USERS_CACHE_KEY, {
          allSchools, allClasses, allTeachingTeachers,
          users: users.map(({ doc, u }) => ({ id: doc.id, u })),
        }, USERS_CACHE_TTL_MS);
        saveUsersDelta(users.map(({ doc, u }) => ({ id: doc.id, u })), usersFullAt, Date.now());
      }
    }

    if (gen !== loadGen) return; // một lần tải mới hơn đã chạy xong trước — không vẽ đè bằng dữ liệu cũ
    USERS = users;
    syncedAt = Date.now();
    renderAll();
  }

  // ══ Bảng tài khoản gọn + bảng sửa từng người (10/11/2026) ══
  // Trước: mỗi dòng dựng sẵn ô chọn nhiều của TẤT CẢ trường + lớp (121 dòng → ~31.000 <option>, ~39.000 phần tử),
  // phải giữ Ctrl để chọn — bấm nhầm không giữ Ctrl là mất hết lựa chọn rồi lỡ tay Lưu. Đổi vai trò ghi NGAY khi
  // chọn. Mỗi lần lưu lớp còn đọc lại cả users + classes + teaching_teachers (~400 lượt) và vẽ lại cả bảng.
  // Nay: dòng chỉ hiện tóm tắt; bấm "Sửa" mở bảng sửa 1 người (dựng danh sách khi mở), gom mọi thay đổi vào
  // 1 lần Lưu; trước khi ghi lớp đọc lại đúng các lớp sắp đổi (vài lượt) để không ghi đè phân công vừa đổi ở máy
  // khác; lưu xong sửa thẳng dữ liệu trong bộ nhớ + bản đệm, 0 lượt đọc lại.
  let USERS = [];   // [{ doc: { id }, u }] — dữ liệu của tab, bản đệm ghi lại từ đây
  let loadGen = 0;
  let syncedAt = 0;
  const PAGE = 60;
  let shown = PAGE;
  const F = { q: '', tab: 'all' };
  const ROLES = [['student', 'Học sinh'], ['teacher', 'Giáo viên'], ['coordinator', 'Điều phối đào tạo'], ['school_admin', 'Quản trị trường'], ['teaching_coordinator', 'Điều phối giáo viên'], ['admin', 'Quản trị viên']];
  const SCOPED = ['teacher', 'coordinator', 'school_admin'];
  const vi = (a, b) => String(a || '').localeCompare(String(b || ''), 'vi');
  const plain = (s) => (window.EduSmartSelect && EduSmartSelect.plain ? EduSmartSelect.plain(s) : String(s || '').toLowerCase());
  const roleLabel = (r) => (EduAuth.ROLE_LABEL && EduAuth.ROLE_LABEL[r]) || r || '?';
  const findUser = (uid) => USERS.find((x) => x.doc.id === uid);
  const isPending = (u) => u.role === 'teacher' && u.approved === false;
  const schoolsFromClasses = (list) => [...new Set(list.map((c) => c.school).filter(Boolean))].sort(vi);

  let classIdx = { src: null, map: {} };
  /** Lớp đang gán cho uid — chỉ mục dựng lại khi allClasses được thay (luôn gán mảng mới, không sửa tại chỗ). */
  function classesOf(uid) {
    if (classIdx.src !== allClasses) {
      const map = {};
      allClasses.forEach((c) => { if (c.teacherId) (map[c.teacherId] = map[c.teacherId] || []).push(c); });
      classIdx = { src: allClasses, map };
    }
    return classIdx.map[uid] || [];
  }

  /** Việc cần xử lý của 1 tài khoản — lọc "Cần xử lý" + nhãn cảnh báo trên dòng. */
  function issuesOf({ doc, u }) {
    const out = [];
    if (isPending(u)) out.push('Chờ duyệt');
    const sch = Array.isArray(u.schools) ? u.schools : [];
    if ((u.role === 'coordinator' || u.role === 'school_admin') && !sch.length) out.push('Chưa gán trường');
    if (u.role === 'teacher' && !isPending(u)) {
      const mine = classesOf(doc.id);
      if (!mine.length && allClasses.length) out.push('Chưa gán lớp');
      else if (schoolsFromClasses(mine).some((s) => !sch.includes(s))) out.push('Thiếu trường của lớp đang dạy');
      if (!u.teacherCode && allTeachingTeachers.length) out.push('Chưa liên kết Mã NV');
    }
    return out;
  }

  const TABS = [
    ['all', 'Tất cả', () => true],
    ['issues', 'Cần xử lý', (r) => issuesOf(r).length > 0],
    ['pending', 'Chờ duyệt', (r) => isPending(r.u)],
    ['teacher', 'Giáo viên', (r) => r.u.role === 'teacher'],
    ['staff', 'Điều phối · QT trường', (r) => ['coordinator', 'teaching_coordinator', 'school_admin'].includes(r.u.role)],
    ['admin', 'Quản trị viên', (r) => r.u.role === 'admin'],
    ['student', 'Học sinh', (r) => r.u.role === 'student'],
  ];

  function haystack({ doc, u }) {
    return plain([u.name, u.email, u.teacherCode, roleLabel(u.role), ...(u.schools || []), ...classesOf(doc.id).map((c) => c.name)].join(' '));
  }
  function visibleRows() {
    const tab = TABS.find((t) => t[0] === F.tab) || TABS[0];
    const words = plain(F.q).trim().split(/\s+/).filter(Boolean);
    return USERS.filter((r) => tab[2](r) && (!words.length || ((h) => words.every((w) => h.includes(w)))(haystack(r))));
  }

  function chips(list, max, cls) {
    if (!list.length) return '';
    const head = list.slice(0, max).map((x) => `<span class="au-chip ${cls || ''}" title="${esc(x.title || x.text)}">${esc(x.text)}</span>`).join('');
    const rest = list.slice(max);
    return head + (rest.length ? `<span class="au-chip au-more" title="${esc(rest.map((x) => x.title || x.text).join(', '))}">+${rest.length}</span>` : '');
  }
  const none = (t) => `<span class="au-none">${t}</span>`;
  const dash = '<span class="au-dash">—</span>';

  function rowHtml(r) {
    const { doc, u } = r;
    const pending = isPending(u);
    const wants = pending && u.requestedRole && u.requestedRole !== 'teacher';
    const sch = Array.isArray(u.schools) ? u.schools : [];
    const mine = classesOf(doc.id).slice().sort((a, b) => vi(a.school, b.school) || vi(a.name, b.name));
    const iss = issuesOf(r).filter((x) => x !== 'Chờ duyệt');
    const teacher = u.role === 'teacher';
    return `<tr data-uid="${esc(doc.id)}"${iss.length ? ' class="has-issue"' : ''}>
      <td class="au-who" data-label="Tài khoản"><b>${esc(u.name || '(chưa đặt tên)')}</b><small>${esc(u.email || '')}</small></td>
      <td data-label="Vai trò"><span class="badge ${esc(u.role)}">${esc(roleLabel(u.role))}</span>${pending ? `<span class="badge pending">${wants ? 'Chờ duyệt · muốn làm ' + esc(roleLabel(u.requestedRole)) : 'Chờ duyệt'}</span>` : ''}</td>
      <td data-label="Trường được xem">${SCOPED.includes(u.role) ? (chips(sch.map((s) => ({ text: s })), 2) || none('Chưa gán')) : dash}</td>
      <td data-label="Lớp đang dạy">${teacher ? (chips(mine.map((c) => ({ text: c.name || '?', title: `${c.school || '?'} · ${c.name || '?'}` })), 4, 'is-cls') || none('Chưa gán')) : dash}</td>
      <td data-label="Mã NV">${teacher ? (u.teacherCode ? `<code class="au-code">${esc(u.teacherCode)}</code>` : none('Chưa liên kết')) : dash}</td>
      <td class="au-act">${iss.length ? `<span class="au-warn" title="${esc(iss.join(' · '))}"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${esc(iss[0])}${iss.length > 1 ? ` <b>+${iss.length - 1}</b>` : ''}</span>` : ''}${pending ? `<button type="button" class="approveBtn" data-requested-role="${esc(u.requestedRole || '')}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Duyệt${wants ? ' làm ' + esc(roleLabel(u.requestedRole)) : ''}</button>` : ''}<button type="button" class="au-edit" aria-label="Sửa ${esc(u.name || u.email || '')}"><i class="fa-solid fa-pen" aria-hidden="true"></i> Sửa</button></td>
    </tr>`;
  }

  function renderTabs() {
    const box = document.getElementById('auTabs');
    if (!box) return;
    box.innerHTML = TABS.map(([k, label, fn]) => {
      const n = USERS.filter(fn).length;
      if (!n && k !== 'all' && k !== F.tab) return '';
      return `<button type="button" role="tab" data-tab="${k}" aria-selected="${F.tab === k}"${k === 'issues' && n ? ' class="is-alert"' : ''}>${label}<span>${n}</span></button>`;
    }).join('');
  }
  function renderAll() {
    const tbody = document.getElementById('userRows');
    renderTabs();
    const rows = visibleRows();
    const page = rows.slice(0, shown);
    tbody.innerHTML = page.length ? page.map(rowHtml).join('')
      : `<tr><td colspan="6" class="au-empty">${USERS.length ? 'Không có tài khoản nào khớp. Thử bỏ bớt chữ tìm hoặc chọn "Tất cả".' : 'Chưa có tài khoản nào.'}</td></tr>`;
    if (rows.length > page.length) {
      tbody.insertAdjacentHTML('beforeend', `<tr class="au-morerow"><td colspan="6"><button type="button" class="au-showmore">Xem thêm ${Math.min(PAGE, rows.length - page.length)} tài khoản · còn ${rows.length - page.length}</button></td></tr>`);
    }
    const st = document.getElementById('auStatus');
    if (st) st.textContent = `${rows.length === USERS.length ? USERS.length : rows.length + '/' + USERS.length} tài khoản` + (syncedAt ? ` · cập nhật ${new Date(syncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : '');
  }

  // Bản đệm ghi lại TỪ bộ nhớ, tuần tự: bấm lưu nhanh liên tiếp 2 người không còn cảnh 2 lần "đọc–sửa–ghi" chen nhau
  // làm mất lần sửa trước trong bản đệm (rồi trang hiện dữ liệu cũ, Admin tưởng chưa lưu và lưu đè lần nữa).
  let persistQ = Promise.resolve();
  function persist(uids) {
    persistQ = persistQ.then(async () => {
      const C = window.EduDataCache;
      if (!C) return;
      const rows = USERS.map(({ doc, u }) => ({ id: doc.id, u }));
      await C.setAsync(USERS_CACHE_KEY, { allSchools, allClasses, allTeachingTeachers, users: rows }, USERS_CACHE_TTL_MS);
      if (!uids.length) return;
      const e = await C.getAsync(USERS_DELTA_KEY, true);
      if (!e || !Array.isArray(e.users)) return;
      const byId = new Map(rows.map((x) => [x.id, x]));
      e.users = e.users.map((x) => (uids.includes(x.id) && byId.get(x.id)) || x);
      await C.setAsync(USERS_DELTA_KEY, e, USERS_KEEP_MS, true);
    }).catch((err) => console.warn('[EduAdminUsers] Không lưu được bản đệm:', err.message));
    return persistQ;
  }
  /** patch[k] === undefined = field đã xoá (FieldValue.delete()). */
  function applyLocal(uid, patch) {
    const r = findUser(uid);
    if (!r) return;
    Object.keys(patch).forEach((k) => { if (patch[k] === undefined) delete r.u[k]; else r.u[k] = patch[k]; });
  }

  /** "Cập nhật": chỉ hỏi tài khoản mới tạo/vừa sửa ở máy khác (2 lượt đọc), không đọc lại cả danh sách. */
  async function softReload() {
    await persistQ;
    const C = window.EduDataCache;
    if (C) {
      C.clear(USERS_CACHE_KEY);
      const e = await C.getAsync(USERS_DELTA_KEY, true);
      if (e) { e.checkedAt = 0; await C.setAsync(USERS_DELTA_KEY, e, USERS_KEEP_MS, true); }
    }
    return loadUsers(false);
  }

  async function approve(uid, btn) {
    if (!findUser(uid) || btn.disabled) return;
    const requestedRole = btn.dataset.requestedRole;
    const patch = { approved: true };
    // Đăng ký muốn làm Điều phối (2 vai trò không tự đăng ký thẳng được, xem js/auth.js registerUser()) → duyệt là gán luôn.
    if (requestedRole === 'coordinator' || requestedRole === 'teaching_coordinator') patch.role = requestedRole;
    btn.disabled = true;
    try {
      await window.EduRepositories.user.upsert(uid, patch);
      logUserChange('approve', uid, patch.role ? { role: patch.role } : {});
      toast('Đã duyệt tài khoản' + (patch.role ? ` làm ${roleLabel(patch.role)}` : ''));
      applyLocal(uid, patch);
      persist([uid]);
      renderAll();
    } catch (err) {
      btn.disabled = false;
      toast('Lỗi: ' + err.message);
    }
  }

  // ── Bảng sửa 1 tài khoản ──
  const ED = { uid: null, busy: false, base: null, role: '', schools: new Set(), classes: new Set(), code: '', touched: false, qS: '', qC: '', onlySel: false, opener: null };
  const $d = (sel) => document.querySelector('#auDrawer ' + sel);

  function editorHtml({ u }) {
    const pending = isPending(u);
    const wants = pending && u.requestedRole && u.requestedRole !== 'teacher';
    const codeOwner = {};
    USERS.forEach(({ doc, u: x }) => { if (x.teacherCode && doc.id !== ED.uid) codeOwner[x.teacherCode] = x.name || x.email || doc.id; });
    return `
      <header class="au-dh">
        <div><h2 id="auDrawerTitle">${esc(u.name || '(chưa đặt tên)')}</h2><p>${esc(u.email || '')}</p></div>
        <button type="button" class="au-x" aria-label="Đóng"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>
      <div class="au-db">
        ${pending ? `<p class="au-note"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Tài khoản đang chờ duyệt${wants ? ` · đăng ký làm <b>${esc(roleLabel(u.requestedRole))}</b>` : ''}. Đổi vai trò rồi Lưu cũng là duyệt.</p>` : ''}
        <section class="au-sec">
          <label class="au-lbl" for="auRole">Vai trò</label>
          <select id="auRole" class="au-role">${ROLES.map(([v, t]) => `<option value="${v}"${u.role === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        </section>
        <section class="au-sec" data-sec="schools">
          <div class="au-sh"><span class="au-lbl">Trường được xem</span><span class="au-cnt" id="auSchCnt"></span>
            <button type="button" class="au-link" id="auFromCls" data-only="teacher" title="Đặt trường đúng theo các lớp đang chọn bên dưới">Theo lớp đang dạy</button></div>
          <div class="au-picked" id="auSchPicked"></div>
          ${allSchools.length ? `<input type="search" class="au-q" id="auSchQ" placeholder="Tìm trường để thêm…" autocomplete="off">
          <div class="au-list" id="auSchList" role="group" aria-label="Danh sách trường"></div>` : '<p class="au-help">Chưa có trường nào trong danh sách học sinh (Quản lý lớp).</p>'}
        </section>
        <section class="au-sec" data-sec="classes">
          <div class="au-sh"><span class="au-lbl">Lớp đang dạy</span><span class="au-cnt" id="auClsCnt"></span>
            <label class="au-toggle"><input type="checkbox" id="auOnlySel"> Chỉ trường đã chọn</label></div>
          ${allClasses.length ? `<input type="search" class="au-q" id="auClsQ" placeholder="Tìm lớp hoặc trường…" autocomplete="off">
          <div class="au-list au-cls" id="auClsList" role="group" aria-label="Danh sách lớp"></div>` : '<p class="au-help">Chưa có lớp nào (Quản lý lớp).</p>'}
        </section>
        <section class="au-sec" data-sec="code">
          <label class="au-lbl" for="auCode">Mã NV liên kết (Lịch giảng dạy)</label>
          ${allTeachingTeachers.length ? `<select id="auCode" class="au-code-sel"><option value="">Chưa liên kết</option>${allTeachingTeachers.map((tc) => `<option value="${esc(tc.code)}"${u.teacherCode === tc.code ? ' selected' : ''}>${esc(tc.code)} — ${esc(tc.name)}${codeOwner[tc.code] ? ` · đã gán: ${esc(codeOwner[tc.code])}` : ''}</option>`).join('')}</select>`
            : '<p class="au-help">Chưa có giáo viên nào trong Lịch giảng dạy.</p>'}
        </section>
      </div>
      <footer class="au-df"><span class="au-diff" id="auDiff" aria-live="polite"></span>
        <button type="button" class="btn btn-ghost au-cancel">Huỷ</button>
        <button type="button" class="btn btn-primary au-save" disabled>Lưu thay đổi</button></footer>`;
  }

  function sectionsForRole() {
    const show = { schools: SCOPED.includes(ED.role), classes: ED.role === 'teacher', code: ED.role === 'teacher' };
    document.querySelectorAll('#auDrawer [data-sec]').forEach((s) => { s.hidden = !show[s.dataset.sec]; });
    const b = $d('#auFromCls');
    if (b) b.hidden = ED.role !== 'teacher';
  }

  function renderSchools() {
    const picked = [...ED.schools].sort(vi);
    $d('#auSchCnt').textContent = picked.length ? `${picked.length} trường` : '';
    $d('#auSchPicked').innerHTML = picked.length
      ? picked.map((s) => `<span class="au-chip is-pick">${esc(s)}<button type="button" data-rm="${esc(s)}" aria-label="Bỏ ${esc(s)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></span>`).join('')
      : `<span class="au-none">${ED.role === 'teacher' ? 'Chưa gán — chọn lớp bên dưới, trường tự thêm theo' : 'Chưa gán trường nào — tài khoản này chưa xem được trường nào'}</span>`;
    const list = $d('#auSchList');
    if (!list) return;
    const q = plain(ED.qS).trim();
    const rows = allSchools.filter((s) => !q || plain(s).includes(q));
    list.innerHTML = rows.map((s) => `<label class="au-opt"><input type="checkbox" value="${esc(s)}"${ED.schools.has(s) ? ' checked' : ''}><span>${esc(s)}</span></label>`).join('')
      || '<p class="au-help">Không có trường khớp.</p>';
  }

  function renderClasses() {
    const list = $d('#auClsList');
    if (!list) return;
    $d('#auClsCnt').textContent = ED.classes.size ? `${ED.classes.size} lớp` : '';
    const q = plain(ED.qC).trim();
    const by = {};
    allClasses.forEach((c) => {
      const sch = c.school || '(Chưa gán trường)';
      if (ED.onlySel && !ED.schools.has(sch) && !ED.classes.has(c.id)) return;
      if (q && !plain(sch + ' ' + (c.name || '')).includes(q)) return;
      (by[sch] = by[sch] || []).push(c);
    });
    const names = Object.keys(by).sort(vi);
    list.innerHTML = names.map((sch) => {
      const cls = by[sch].slice().sort((a, b) => vi(a.name, b.name));
      const n = cls.filter((c) => ED.classes.has(c.id)).length;
      return `<div class="au-grp"><div class="au-gh"><span>${esc(sch)}</span>${n ? `<b>${n}</b>` : ''}</div><div class="au-grid">${cls.map((c) => {
        const other = c.teacherId && c.teacherId !== ED.uid;
        return `<label class="au-opt${other ? ' is-other' : ''}" title="${other ? esc('Đang: ' + (c.teacherName || c.teacherId)) : ''}"><input type="checkbox" value="${esc(c.id)}"${ED.classes.has(c.id) ? ' checked' : ''}><span>${esc(c.name || '(chưa đặt tên)')}${other ? `<em>${esc(c.teacherName || 'GV khác')}</em>` : ''}</span></label>`;
      }).join('')}</div></div>`;
    }).join('') || `<p class="au-help">${ED.onlySel ? 'Trường đã chọn chưa có lớp khớp. Bỏ tích "Chỉ trường đã chọn" để xem mọi trường.' : 'Không có lớp khớp.'}</p>`;
  }

  /** Thay đổi so với lúc mở — chỉ phần áp dụng cho vai trò đang chọn. */
  function diff() {
    const b = ED.base;
    const d = { role: ED.role !== b.role ? ED.role : null, schools: null, add: [], rm: [], code: null };
    if (SCOPED.includes(ED.role)) {
      const sch = [...ED.schools].sort(vi);
      if (!sameList(sch, b.schools)) d.schools = sch;
    }
    if (ED.role === 'teacher') {
      d.add = [...ED.classes].filter((id) => !b.classes.includes(id));
      d.rm = b.classes.filter((id) => !ED.classes.has(id));
      if (ED.code !== b.code) d.code = ED.code;
    }
    d.any = !!(d.role || d.schools || d.add.length || d.rm.length || d.code !== null);
    return d;
  }
  function updateDiff() {
    const d = diff();
    const parts = [];
    if (d.role) parts.push(`vai trò → ${roleLabel(d.role)}`);
    if (d.add.length) parts.push(`+${d.add.length} lớp`);
    if (d.rm.length) parts.push(`−${d.rm.length} lớp`);
    if (d.schools) parts.push(`${d.schools.length} trường`);
    if (d.code !== null) parts.push(d.code ? `Mã NV ${d.code}` : 'bỏ Mã NV');
    $d('#auDiff').textContent = parts.length ? 'Sẽ lưu: ' + parts.join(' · ') : 'Chưa có thay đổi';
    $d('.au-save').disabled = !d.any || ED.busy;
  }
  /** Chưa sửa tay ô trường → trường đi theo lớp đang chọn (giống "Lưu lớp" cũ: trường = trường của các lớp). */
  function followClasses(force) {
    if (ED.touched && !force) return;
    const derived = schoolsFromClasses(allClasses.filter((c) => ED.classes.has(c.id)));
    if (derived.length || force) ED.schools = new Set(derived);
    if (force) ED.touched = false;
  }

  function openEditor(uid, opener) {
    if (ED.busy) return;
    const r = findUser(uid);
    if (!r) return;
    const u = r.u;
    ED.uid = uid;
    ED.opener = opener || null;
    ED.base = { role: u.role, schools: [...(Array.isArray(u.schools) ? u.schools : [])].sort(vi), classes: classesOf(uid).map((c) => c.id).sort(), code: u.teacherCode || '' };
    ED.role = u.role;
    ED.schools = new Set(ED.base.schools);
    ED.classes = new Set(ED.base.classes);
    ED.code = ED.base.code;
    ED.touched = false;
    ED.qS = ''; ED.qC = '';
    ED.onlySel = ED.schools.size > 0;
    const dr = document.getElementById('auDrawer');
    dr.innerHTML = editorHtml(r);
    const only = $d('#auOnlySel');
    if (only) only.checked = ED.onlySel;
    sectionsForRole();
    renderSchools();
    renderClasses();
    updateDiff();
    const code = $d('#auCode');
    if (code && window.EduSmartSelect && EduSmartSelect.enhance) EduSmartSelect.enhance(code, { title: 'Mã NV', unit: 'giáo viên', searchMin: 7 });
    document.getElementById('auScrim').hidden = false;
    dr.hidden = false;
    document.body.classList.add('au-locked');
    requestAnimationFrame(() => dr.classList.add('is-open'));
    $d('#auRole').focus();
  }
  function closeEditor(force) {
    const dr = document.getElementById('auDrawer');
    if (dr.hidden || ED.busy) return;
    if (!force && diff().any && !confirm('Bỏ các thay đổi chưa lưu của tài khoản này?')) return;
    dr.classList.remove('is-open');
    dr.hidden = true;
    dr.innerHTML = '';
    document.getElementById('auScrim').hidden = true;
    document.body.classList.remove('au-locked');
    const back = ED.opener && document.contains(ED.opener) ? ED.opener : document.querySelector(`#userRows tr[data-uid="${CSS.escape(ED.uid || '')}"] .au-edit`);
    ED.uid = null;
    if (back) back.focus();
  }
  function setBusy(on) {
    ED.busy = on;
    const btn = $d('.au-save');
    if (!btn) return;
    btn.innerHTML = on ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang lưu…' : 'Lưu thay đổi';
    document.querySelectorAll('#auDrawer input, #auDrawer select, #auDrawer .au-cancel, #auDrawer .au-x').forEach((el) => { el.disabled = on; });
    if (!on) updateDiff(); else btn.disabled = true;
  }

  /** Ghi lớp + lan xuống học sinh đang học (students_roster.teacherId là bản sao để lọc ở js/teacher/data-loader.js). */
  async function writeClasses(uid, teacherName, addCls, rmCls) {
    let batch = EduFirebase.db.batch();
    let ops = 0;
    const flush = async () => { if (ops >= 400) { await batch.commit(); batch = EduFirebase.db.batch(); ops = 0; } };
    const apply = async (classId, tid, tname) => {
      batch.set(new window.EduBaseRepository('classes').col().doc(classId), { teacherId: tid, teacherName: tname }, { merge: true });
      ops++; await flush();
      const snap = await EduFirebase.db.collection('students_roster')
        .where('classId', '==', classId).where('status', '==', 'active').limit(2000).get();
      for (const d of snap.docs) {
        const cur = d.data();
        if ((cur.teacherId || '') === tid && (cur.teacherName || '') === tname) continue; // không đổi: khỏi ghi, khỏi đẩy updatedAt cho mọi máy
        batch.set(d.ref, window.EduRosterCache.stampRoster({ teacherId: tid, teacherName: tname }), { merge: true });
        ops++; await flush();
      }
    };
    for (const c of addCls) await apply(c.id, uid, teacherName);
    for (const c of rmCls) await apply(c.id, '', '');
    if (ops > 0) await batch.commit();
  }

  async function saveEditor() {
    if (ED.busy || !ED.uid) return;
    const uid = ED.uid;
    const r = findUser(uid);
    if (!r) return;
    const d = diff();
    if (!d.any) return;
    const teacherName = r.u.name || r.u.email || '';
    if (d.role && (d.role === 'admin' || ED.base.role === 'admin') && !confirm(d.role === 'admin'
      ? `Cấp quyền Quản trị viên (toàn quyền hệ thống) cho "${teacherName}"?`
      : `Bỏ quyền Quản trị viên của "${teacherName}"?`)) return;
    if (d.schools && !d.schools.length && !confirm('Không gán trường nào → tài khoản này sẽ không xem được dữ liệu trường nào. Vẫn lưu?')) return;
    const byId = new Map(allClasses.map((c) => [c.id, c]));
    const addCls = d.add.map((id) => byId.get(id)).filter(Boolean);
    const rmCls = d.rm.map((id) => byId.get(id)).filter(Boolean);
    const stolen = addCls.filter((c) => c.teacherId && c.teacherId !== uid);
    if (stolen.length && !confirm(`${stolen.length} lớp đang có giáo viên khác phụ trách:\n` +
      stolen.map((c) => `- ${c.school || '?'} · ${c.name || '?'} (đang: ${c.teacherName || c.teacherId})`).join('\n') +
      `\n\nLưu sẽ CHUYỂN các lớp này sang "${teacherName}". Tiếp tục?`)) return;

    setBusy(true);
    let classesWritten = false;
    try {
      const touched = [...addCls, ...rmCls];
      if (touched.length) {
        // Đọc lại đúng các lớp sắp đổi (vài lượt): danh sách lớp trên trang có thể cũ tới 12 giờ — máy khác vừa chuyển
        // lớp đi thì không ghi đè (trước đây "bỏ gán" theo dữ liệu cũ xoá mất giáo viên mới của lớp).
        const classRepo = new window.EduBaseRepository('classes');
        const fresh = await Promise.all(touched.map((c) => classRepo.getById(c.id)));
        const moved = [];
        const serverOf = {};
        fresh.forEach((s, i) => {
          const c = touched[i];
          serverOf[c.id] = s;
          if (!s || (s.teacherId || '') !== (c.teacherId || '')) moved.push(c);
        });
        if (moved.length) {
          allClasses = allClasses.filter((c) => serverOf[c.id] !== null)
            .map((c) => (serverOf[c.id] ? Object.assign({}, c, { teacherId: serverOf[c.id].teacherId || '', teacherName: serverOf[c.id].teacherName || '' }) : c));
          ED.base.classes = classesOf(uid).map((c) => c.id).sort();
          ED.classes = new Set([...ED.classes].filter((id) => allClasses.some((c) => c.id === id)));
          new window.EduBaseRepository('classes').invalidate();
          saveLookupsCache();
          persist([]);
          renderClasses();
          renderAll();
          toast(`${moved.map((c) => c.name || c.id).join(', ')} vừa được đổi ở máy khác — đã cập nhật danh sách, xem lại rồi bấm Lưu lần nữa`);
          return;
        }
        await writeClasses(uid, teacherName, addCls, rmCls);
        classesWritten = true;
        const add = new Set(addCls.map((c) => c.id)), rm = new Set(rmCls.map((c) => c.id));
        allClasses = allClasses.map((c) => (add.has(c.id) ? Object.assign({}, c, { teacherId: uid, teacherName })
          : rm.has(c.id) ? Object.assign({}, c, { teacherId: '', teacherName: '' }) : c));
        if (window.EduRosterCache) window.EduRosterCache.invalidate(); // vừa đổi teacherId của học sinh
        new window.EduBaseRepository('classes').invalidate();          // bản đệm lớp dùng chung với Quản lý lớp/Dashboard
      }

      // Hồ sơ tài khoản: gộp vai trò + trường + Mã NV vào 1 lệnh ghi (trước: mỗi nút Lưu 1 lệnh, lỗi giữa chừng là lệch nửa vời).
      const patch = {}, local = {};
      if (d.role) Object.assign(patch, { role: d.role, approved: true });
      if (d.schools) Object.assign(patch, window.EduRepositories.UserRepository.schoolsPatch(d.schools));
      if (d.code !== null) { patch.teacherCode = d.code || firebase.firestore.FieldValue.delete(); local.teacherCode = d.code || undefined; }
      if (Object.keys(patch).length) {
        await window.EduRepositories.user.upsert(uid, patch);
        applyLocal(uid, Object.assign({}, patch, local));
      }

      // Giáo viên vừa bị chuyển lớp đi: "Trường được xem" theo lớp còn lại (lần tải đủ sau vòng tự sửa cũng làm vậy).
      const losers = [...new Set(stolen.map((c) => c.teacherId))];
      const changedUids = [uid];
      for (const lid of losers) {
        const L = findUser(lid);
        if (!L || L.u.role !== 'teacher') continue;
        const left = schoolsFromClasses(classesOf(lid));
        if (!left.length || sameList(left, L.u.schools)) continue;
        try {
          const p = window.EduRepositories.UserRepository.schoolsPatch(left);
          await window.EduRepositories.user.upsert(lid, p);
          applyLocal(lid, p);
          changedUids.push(lid);
        } catch (err) { console.warn('[EduAdminUsers] Không cập nhật được trường của GV bị chuyển lớp:', err.message); }
      }
      if (classesWritten) {
        [uid, ...losers].forEach((id) => { schoolsByTeacherId[id] = new Set(schoolsFromClasses(classesOf(id))); });
        saveLookupsCache();
      }
      persist(changedUids);

      if (d.role) logUserChange('set_role', uid, { from: ED.base.role, to: d.role });
      if (d.schools) logUserChange('set_schools', uid, { schools: d.schools });
      if (classesWritten) logUserChange('set_classes', uid, { assigned: addCls.length, unassigned: rmCls.length });
      if (d.code !== null) logUserChange('set_teacher_code', uid, { teacherCode: d.code });

      ED.busy = false;
      closeEditor(true);
      renderAll();
      const flash = document.querySelector(`#userRows tr[data-uid="${CSS.escape(uid)}"]`);
      if (flash) flash.classList.add('is-saved');
      toast(`Đã lưu ${teacherName}` + (losers.length ? ` · chuyển ${stolen.length} lớp từ giáo viên khác` : ''));
    } catch (err) {
      if (classesWritten || addCls.length || rmCls.length) invalidateLookups(); // lỗi giữa chừng khi ghi lớp: lần tải sau đọc lại cho chắc
      toast('Lỗi: ' + err.message + (classesWritten ? ' — lớp đã lưu, phần hồ sơ chưa lưu' : ' — chưa lưu gì'));
      persist([uid]);
      renderAll();
    } finally {
      if (ED.busy) setBusy(false);
    }
  }

  (function initTable() {
    const tbody = document.getElementById('userRows');
    tbody.addEventListener('click', (e) => {
      if (e.target.closest('.au-showmore')) { shown += PAGE; renderAll(); return; }
      const tr = e.target.closest('tr[data-uid]');
      if (!tr) return;
      const ap = e.target.closest('.approveBtn');
      if (ap) { approve(tr.dataset.uid, ap); return; }
      const ed = e.target.closest('.au-edit');
      if (ed) openEditor(tr.dataset.uid, ed);
    });
    tbody.addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr[data-uid]');
      if (tr && !e.target.closest('button')) openEditor(tr.dataset.uid, tr.querySelector('.au-edit'));
    });
    const q = document.getElementById('auSearch');
    let t = 0;
    if (q) {
      const fromUrl = new URLSearchParams(location.search).get('q');
      if (fromUrl) { q.value = fromUrl; F.q = fromUrl; }
      q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { F.q = q.value; shown = PAGE; renderAll(); }, 120); });
    }
    const tabs = document.getElementById('auTabs');
    if (tabs) tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      F.tab = b.dataset.tab; shown = PAGE; renderAll();
    });
    const rf = document.getElementById('auRefresh');
    if (rf) rf.addEventListener('click', async () => {
      rf.disabled = true;
      try { await softReload(); toast('Đã cập nhật danh sách'); } finally { rf.disabled = false; }
    });

    const dr = document.getElementById('auDrawer');
    document.getElementById('auScrim').addEventListener('click', () => closeEditor());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dr.hidden && !document.querySelector('.ss-panel')) closeEditor();
      if (e.key === '/' && q && document.activeElement === document.body && dr.hidden) { e.preventDefault(); q.focus(); }
    });
    dr.addEventListener('click', (e) => {
      if (e.target.closest('.au-x, .au-cancel')) { closeEditor(); return; }
      if (e.target.closest('.au-save')) { saveEditor(); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm && !ED.busy) { ED.schools.delete(rm.dataset.rm); ED.touched = true; renderSchools(); renderClasses(); updateDiff(); return; }
      if (e.target.closest('#auFromCls')) { followClasses(true); renderSchools(); renderClasses(); updateDiff(); }
    });
    dr.addEventListener('change', (e) => {
      const el = e.target;
      const box = el.closest('#auSchList') ? '#auSchList' : el.closest('#auClsList') ? '#auClsList' : '';
      if (el.id === 'auRole') { ED.role = el.value; sectionsForRole(); renderSchools(); }
      else if (el.id === 'auCode') ED.code = el.value;
      else if (el.id === 'auOnlySel') { ED.onlySel = el.checked; renderClasses(); }
      else if (box === '#auSchList') { if (el.checked) ED.schools.add(el.value); else ED.schools.delete(el.value); ED.touched = true; renderSchools(); if (ED.onlySel) renderClasses(); }
      else if (box === '#auClsList') { if (el.checked) ED.classes.add(el.value); else ED.classes.delete(el.value); followClasses(false); renderSchools(); renderClasses(); }
      // Danh sách vừa dựng lại → trả con trỏ bàn phím về đúng ô vừa tích (Space/Tab chọn tiếp được)
      if (box && !document.contains(el)) {
        const same = [...document.querySelectorAll(`#auDrawer ${box} input`)].find((i) => i.value === el.value);
        if (same) same.focus({ preventScroll: true });
      }
      updateDiff();
    });
    dr.addEventListener('input', (e) => {
      if (e.target.id === 'auSchQ') { ED.qS = e.target.value; renderSchools(); }
      if (e.target.id === 'auClsQ') { ED.qC = e.target.value; renderClasses(); }
    });
  })();

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Lộ ra ngoài để js/admin-users-import.js gọi lại sau khi tạo xong hàng
  // loạt tài khoản — bảng chính tự làm mới, không cần F5 mới thấy 18 tài
  // khoản giáo viên vừa tạo.
  window.EduAdminUsersReload = () => softReload(); // tài khoản vừa tạo có createdAt → phần thay đổi bắt được, khỏi đọc lại cả danh sách
