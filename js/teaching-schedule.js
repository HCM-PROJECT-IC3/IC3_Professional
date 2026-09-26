/* ============================================================
   js/teaching-schedule.js
   Logic cho trang teaching-schedule.html — quản lý lịch giảng
   dạy/làm việc hàng tuần của đội ngũ giáo viên (thay file Excel
   "LỊCH GIẢNG DẠY TEAM GVTH...xlsx").

   - admin: toàn quyền quản lý (thêm/sửa/xoá GV, nhập Excel, tạo tuần mới,
     sửa lịch MỌI giáo viên) — bảng tổng hợp nhiều GV + modal lưới lịch
     (renderWeeklyTab/openSchedModal).
   - teacher (đã được Admin liên kết "Mã NV" ở admin-users.html): khối
     riêng "Lịch của tôi" — TỰ CẬP NHẬT đúng lịch của chính mình bằng lưới
     thẻ theo ngày, sửa/lưu trực tiếp không cần modal (renderMyWeekView).
   - teaching_coordinator (🚗 Điều phối giáo viên — KHÁC HẲN "coordinator"
     tức 🧭 Điều phối đào tạo, role đó quản lý roster/điểm số học sinh ở
     roster-manager.html và KHÔNG được vào trang này nữa): dùng CHUNG bảng
     tổng hợp nhiều GV với admin (📊 Tổng quan/🎴 Thẻ, danh sách 👤 Giáo
     viên) NHƯNG chỉ XEM — applyCoordinatorReadOnlyUI() gắn class
     "role-teaching-coordinator" lên <body>, css/teaching-schedule.css dùng class
     này ẩn MỌI nút thêm/sửa/xoá (Tuần mới/Nhập Excel/Sửa lịch/Thêm-Sửa-
     Xoá giáo viên); các nút chỉ ĐỌC (Xuất PDF, Xuất Phiếu công tác) vẫn
     giữ nguyên. Còn thấy thêm tab "📊 Báo cáo" (biểu đồ + pivot table
     nhiều tuần, xem js/teaching-schedule-report.js) và "🚗 Hỗ trợ xăng xe"
     (xem js/teaching-schedule-travel.js) mà admin/teacher không cần tới —
     quyền ghi lịch thật sự luôn do firestore.rules chốt (chỉ isAdmin()),
     đây chỉ là lớp UX (riêng dữ liệu khoảng cách xăng xe thì
     teaching_coordinator ĐƯỢC ghi, xem collection teaching_travel_distances).

   Kiến trúc theo đúng mẫu roster-manager.js: models/repositories đã
   tách riêng (js/models/teaching-schedule.model.js,
   js/repositories/teaching-schedule-repository.js), file này chỉ lo
   UI + điều phối gọi repository.
   ============================================================ */
(function () {
  'use strict';

  // ---- Nút chuyển sáng/tối (đồng hồ mặt trời neumorphism, xem
  // .theme-toggle trong css/teaching-schedule.css) — trang này TRƯỚC ĐÂY
  // chưa có, thêm mới đồng bộ với ic3-dashboard.html/index.html. ----
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

  const M = window.EduModels.TeachingSchedule;

  // ---- State cục bộ ----
  const state = {
    role: '',              // 'admin' | 'teaching_coordinator' | 'teacher' (KHÔNG bao gồm 'coordinator' — role đó không được vào trang này)
    myTeacherCode: '',      // teacherCode liên kết (chỉ có ý nghĩa khi role==='teacher')
    teachers: [],          // toàn bộ giáo viên (mọi trạng thái) — teacher chỉ thấy đúng 1 GV (chính mình)
    weeks: [],             // toàn bộ tuần đã có dữ liệu
    currentWeekKey: '',    // weekKey đang chọn ở tab "Lịch tuần"
    schedulesByTeacher: {},// teacherCode -> schedule doc (CỦA TUẦN ĐANG CHỌN)
    timetablesByTeacher: {}, // teacherCode -> doc "teaching_timetable" (TKB lớp, CỦA TUẦN ĐANG CHỌN) —
                              // nạp cùng lúc với schedulesByTeacher để "áp dụng TKB lớp vào Lịch tuần":
                              // mỗi chip Sáng/Chiều ở Tổng quan/Thẻ giờ kèm luôn MÃ LỚP đã điền ở tab
                              // "🗓️ TKB lớp" (xem classCodesFor()), không cần mở riêng tab kia mới biết.
    periodTimesByTeacher: {}, // teacherCode -> doc "teaching_timetable_periods" (giờ tiết CỦA GIÁO VIÊN
                                // đó, áp dụng mọi tuần) — dựng đúng số hàng/giờ giấc cho "📊 Tổng quan"
                                // dạng lưới theo tiết (renderDashboardView()).
    myWeekDraft: null,     // days{} đang sửa ở khối "Lịch của tôi" (giáo viên) — chưa lưu
    search: '',
    viewMode: 'dashboard', // 'dashboard' (tổng quan, mặc định) | 'cards' (thẻ từng GV) — chỉ áp dụng admin/coordinator
  };
  /** true khi tài khoản đăng nhập là giáo viên — giờ dùng CHUNG bảng tổng
   * hợp "Tổng quan"/"Thẻ" nhiều GV với admin (đã được cấp quyền ĐỌC cả đội
   * qua firestore.rules, KHÔNG còn giới hạn chỉ đọc đúng 1 GV như trước) —
   * chỉ khác ở chỗ nút "✏️ Sửa lịch" bị khoá với hàng KHÔNG PHẢI của chính
   * mình (xem canEditTeacherRow()) + ẩn vài nút hành động cấp-đội chỉ
   * Admin mới cần (xem applyRoleUI()). Quyền GHI thật sự vẫn luôn do
   * firestore.rules chốt (chỉ đúng teacherCode == chính mình). */
  function isTeacherRole() { return state.role === 'teacher'; }
  /** true nếu tài khoản hiện tại được phép bấm "✏️ Sửa lịch" của hàng GV
   * này — Admin/Điều phối giáo viên (đọc-hết, xem isCoordinatorRole())
   * không có quyền sửa gì ở đây nên trả false luôn (nút vốn đã ẩn hết với
   * role đó); Admin có toàn quyền; giáo viên chỉ đúng hàng của chính mình. */
  function canEditTeacherRow(teacherCode) {
    if (isCoordinatorRole()) return false;
    if (isTeacherRole()) return teacherCode === state.myTeacherCode;
    return true;
  }
  /** true khi tài khoản đăng nhập là "🚗 Điều phối giáo viên"
   * (teaching_coordinator — KHÁC "coordinator" tức "🧭 Điều phối đào tạo",
   * role đó không được vào trang này nữa) — dùng CHUNG bảng tổng hợp
   * nhiều GV với admin (khác hẳn teacher, vốn có khối riêng "Lịch của
   * tôi") nhưng CHỈ XEM, không có nút thêm/sửa/xoá gì — xem
   * applyCoordinatorReadOnlyUI(). Quyền ghi thật sự luôn do
   * firestore.rules chốt (chỉ isAdmin()), đây chỉ là lớp UX. */
  function isCoordinatorRole() { return state.role === 'teaching_coordinator'; }

  let teacherModalEditingCode = null; // null = đang thêm mới
  let schedModalTeacherCode = null;   // mã GV đang mở lưới sửa
  let schedModalDraftDays = null;     // bản nháp days{} đang sửa trong modal (chưa lưu)
  let pendingImport = null;           // { weeks:[{weekKey,label,teachers:[...]}], skippedSheets:[] }

  // ============================================================
  // TIỆN ÍCH DÙNG CHUNG
  // ============================================================
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function friendlyError(err) {
    if (err && err.code === 'permission-denied') {
      return 'Chưa có quyền ghi dữ liệu — kiểm tra Firestore Rules đã publish đủ 3 collection teaching_* chưa.';
    }
    return err && err.message ? err.message : String(err);
  }

  // ============================================================
  // KHỞI ĐỘNG TRANG
  // ============================================================
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    state.role = profile.role;
    state.myTeacherCode = profile.teacherCode || '';
    applyRoleUI();
    applyCoordinatorReadOnlyUI();
    initWhoamiAvatar(user.uid, profile.name || user.email);
    initScheduleAvatars();
    loadEverything();
  });

  /** Ảnh đại diện của CHÍNH tài khoản đang đăng nhập ở khung "whoami" trên
   * topbar — cùng cách làm với js/dashboard-page.js/js/teacher/dashboard.js
   * (đọc 1 lần đúng document gvlab_profiles/{uid}, KHÔNG phải listener sống). */
  function initWhoamiAvatar(uid, name) {
    const box = document.getElementById('whoamiAvatar');
    if (!box) return;
    box.textContent = String(name || '').trim().charAt(0).toUpperCase();
    if (window.EduFirebase && window.EduFirebase.db) {
      window.EduFirebase.db.collection('gvlab_profiles').doc(uid).get()
        .then((snap) => {
          const avatar = snap.exists ? snap.data().avatar : null;
          if (avatar) box.innerHTML = `<img src="${avatar}" alt="">`;
        })
        .catch((err) => console.warn('[Lịch giảng dạy] Không tải được ảnh đại diện Trang Social Media:', err.message));
    }
  }

  // ============================================================
  // ẢNH ĐẠI DIỆN THẬT (Trang Social Media) TRÊN CÁC Ô "GIÁO VIÊN" — mã NV (teacherCode)
  // không liên quan trực tiếp tới uid, nên phải bắc cầu: users/{uid} nào
  // có field "teacherCode" → gvlab_profiles/{uid} có field "avatar". Đọc
  // bảng users 1 LẦN (nhỏ, ~18 GV) để dựng map teacherCode -> uid, sau đó
  // GẮN LISTENER SỐNG trên gvlab_profiles (giống avatarCache của
  // js/portfolio.js) để ảnh cập nhật ngay khi giáo viên vừa đổi ở Trang Social Media,
  // không cần tải lại trang. Mọi ô avatar render động đều gắn sẵn
  // data-teacher-code="<mã NV>" để patchScheduleAvatars() tìm và vá lại
  // sau mỗi lần render.
  let teacherCodeToUid = {};
  let scheduleAvatarByUid = {};
  function initScheduleAvatars() {
    if (!window.EduFirebase || !window.EduFirebase.db) return;
    const db = window.EduFirebase.db;
    db.collection('users').where('role', '==', 'teacher').get()
      .then((snap) => {
        snap.forEach((doc) => {
          const code = doc.data().teacherCode;
          if (code) teacherCodeToUid[code] = doc.id;
        });
        patchScheduleAvatars();
      })
      .catch((err) => console.warn('[Lịch giảng dạy] Không dựng được map giáo viên → tài khoản:', err.message));
    db.collection('gvlab_profiles').onSnapshot((snap) => {
      snap.docChanges().forEach((chg) => {
        scheduleAvatarByUid[chg.doc.id] = chg.doc.data().avatar || null;
      });
      patchScheduleAvatars();
    }, (err) => console.warn('[Lịch giảng dạy] Không theo dõi được ảnh đại diện Trang Social Media:', err.message));
  }
  /** Vá lại MỌI ô avatar đang hiện trên trang (thẻ + ma trận Tổng quan)
   * bằng ảnh thật nếu có — gọi lại sau mỗi lần render lại danh sách/tuần,
   * vì innerHTML render mới sẽ xoá mất ảnh đã vá trước đó. */
  function patchScheduleAvatars() {
    document.querySelectorAll('[data-teacher-code]').forEach((el) => {
      const uid = teacherCodeToUid[el.dataset.teacherCode];
      const avatar = uid ? scheduleAvatarByUid[uid] : null;
      el.innerHTML = avatar ? `<img src="${avatar}" alt="">` : esc(initialsOf(el.dataset.teacherName || ''));
    });
  }

  /** Ẩn các chức năng quản lý cấp-đội chỉ dành cho Admin (Tuần mới/Đồng bộ
   * SharePoint/Xuất PDF tất cả/Xuất PDF tất cả Phiếu công tác/tab "Giáo
   * viên" — CRUD hồ sơ + thông tin liên hệ của đồng nghiệp) khi tài khoản
   * đăng nhập là giáo viên. Giáo viên giờ dùng CHUNG bảng "Tổng quan"/"Thẻ"
   * nhiều GV với admin (đã được cấp quyền ĐỌC cả đội) để xem lịch của đồng
   * nghiệp, chỉ KHÔNG sửa được ngoài đúng hàng của chính mình (xem
   * canEditTeacherRow(), áp dụng ngay trong renderWeeklyTab()/renderDashboardView()).
   * Quyền ghi thật sự vẫn luôn do firestore.rules chốt (chỉ teacherCode ==
   * chính mình), đây chỉ là lớp UX. */
  function applyRoleUI() {
    const hide = (id) => { const el = document.getElementById(id); if (el) el.classList.add('force-hide'); };
    if (!isTeacherRole()) return;
    hide('newWeekBtn');
    hide('syncSharePointBtn');
    hide('exportAllPdfBtn');
    hide('exportAllCongTacBtn');
    // Tab "👤 Giáo viên" có tới 3 BẢN SAO nút (mỗi tab-panel 1 bản, đồng bộ
    // theo data-tab — xem HTML) — phải ẩn CẢ 3, chỉ ẩn #teachersTabBtn
    // (bản ở panel-weekly) thì giáo viên vẫn lách được qua bản sao ở
    // panel-timetable/panel-teachers.
    document.querySelectorAll('[data-tab="teachers"]').forEach((el) => el.classList.add('force-hide'));
  }

  /** Điều phối đào tạo: dùng chung bảng tổng hợp nhiều GV với admin (KHÔNG
   * chuyển sang "Lịch của tôi" như teacher — họ không phải giáo viên, cũng
   * không quản lý MỘT giáo viên cụ thể nào) nhưng chỉ được XEM. Gắn 1 class
   * lên <body> để css/teaching-schedule.css ẩn MỌI nút thêm/sửa/xoá (Tuần
   * mới/Nhập Excel/Sửa lịch/Thêm-Sửa-Xoá giáo viên) — kể cả những nút
   * render ĐỘNG mỗi lần vẽ lại bảng (data-edit-sched.../data-edit-teacher),
   * không cần sửa từng hàm render để gọi hide() thủ công lặp lại. Các nút
   * CHỈ ĐỌC (Xuất PDF/Xuất Phiếu công tác) không nằm trong danh sách ẩn.
   * Quyền ghi thật sự luôn do firestore.rules chốt (chỉ isAdmin()). */
  function applyCoordinatorReadOnlyUI() {
    if (!isCoordinatorRole()) return;
    document.body.classList.add('role-teaching-coordinator');
  }

  async function loadEverything() {
    try {
      // Giáo viên giờ ĐỌC ĐƯỢC cả đội (firestore.rules đã nới quyền đọc
      // teaching_teachers/teaching_schedule/teaching_timetable cho mọi
      // isApprovedTeacher(), không riêng gì đúng document của chính mình
      // nữa) — dùng CHUNG 1 đường tải dữ liệu với admin/điều phối giáo
      // viên, không cần nhánh riêng đọc "chỉ đúng 1 GV" như trước.
      const [teachers, weeks] = await Promise.all([
        window.EduRepositories.teachingTeacher.list({ orderBy: 'name' }),
        window.EduRepositories.teachingWeek.listAll(),
      ]);
      state.teachers = teachers;
      state.weeks = weeks;
      renderTeacherTab();
      renderWeekSelect();
      if (state.currentWeekKey) await loadWeekSchedules(state.currentWeekKey);
      else renderWeeklyTab(); // hiện bảng/khối rỗng "chưa chọn tuần"
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  async function loadWeekSchedules(weekKey) {
    state.currentWeekKey = weekKey;
    try {
      state.schedulesByTeacher = {};
      state.timetablesByTeacher = {};
      // teaching_timetable/teaching_timetable_periods (tab "🗓️ TKB lớp") là
      // tính năng thêm sau — repo có thể chưa kịp nạp trong 1 số ngữ cảnh
      // test, nên luôn kiểm tra tồn tại trước khi gọi, tránh vỡ cả trang
      // "Lịch tuần" chỉ vì thiếu 1 phần bổ trợ.
      const TT = window.EduRepositories.teachingTimetable;
      const PT = window.EduRepositories.teachingPeriodTimes;
      // Giáo viên giờ tải lịch của CẢ ĐỘI giống admin/điều phối giáo viên
      // (firestore.rules đã nới quyền đọc) — dùng chung 1 đường tải, không
      // còn nhánh riêng "chỉ đúng 1 GV" như trước.
      const [rows, ttRows, ptRows] = await Promise.all([
        window.EduRepositories.teachingSchedule.listByWeek(weekKey),
        TT ? TT.listByWeek(weekKey) : Promise.resolve([]),
        // Giờ tiết KHÔNG lặp lại theo tuần (áp dụng mọi tuần, xem
        // js/models/teaching-timetable.model.js) — tải trọn collection 1
        // lần (18 giáo viên, rất nhỏ) để dựng đúng số hàng/giờ giấc cho
        // ma trận "📊 Tổng quan" bên dưới.
        PT ? PT.list() : Promise.resolve([]),
      ]);
      rows.forEach((r) => { state.schedulesByTeacher[r.teacherCode] = r; });
      ttRows.forEach((r) => { state.timetablesByTeacher[r.teacherCode] = r; });
      state.periodTimesByTeacher = {};
      ptRows.forEach((r) => { state.periodTimesByTeacher[r.id] = r; });
      renderWeeklyTab();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  /** Mã lớp đã điền ở tab "🗓️ TKB lớp" cho ĐÚNG giáo viên/Thứ/buổi này (tuần
   * đang chọn) — "áp dụng thời khoá biểu vào lịch tuần": ghép dữ liệu 2 tab
   * lại để xem "Lịch tuần" là biết luôn đang dạy lớp nào, không cần mở
   * riêng tab TKB. Trả về mảng mã lớp không rỗng (vd ["5/1"], có thể nhiều
   * hơn 1 nếu các tiết trong buổi đó dạy nhiều lớp khác nhau). */
  function classCodesFor(teacherCode, d, sessionKey) {
    const tt = state.timetablesByTeacher[teacherCode];
    const arr = tt && tt.days && tt.days[String(d)] && tt.days[String(d)][sessionKey];
    if (!Array.isArray(arr)) return [];
    // Loại trùng (nhiều tiết cùng buổi thường cùng 1 lớp) mà vẫn giữ đúng
    // thứ tự tiết đầu tiên xuất hiện, để không lặp "5/1, 5/1, 5/1".
    const seen = new Set();
    const out = [];
    // Mỗi ô-tiết của TKB lớp là {maLop, truong} (dữ liệu CŨ có thể vẫn là
    // string thẳng) — dùng cellOf() để đọc đúng cả 2 dạng, không tự ý đọc
    // .maLop trực tiếp (xem js/models/teaching-timetable.model.js).
    const TT = window.EduModels.TeachingTimetable;
    arr.forEach((v) => {
      const code = String((TT ? TT.cellOf(v).maLop : v) || '').trim();
      if (code && !seen.has(code)) { seen.add(code); out.push(code); }
    });
    return out;
  }

  // ============================================================
  // TABS
  // ============================================================
  // Đồng bộ theo data-tab (không chỉ dựa vào chính nút vừa bấm) — mỗi
  // toolbar (Lịch tuần/Giáo viên) có 1 bản sao nút tab riêng để gộp chung
  // vào 1 hàng với các control khác (đỡ tốn 1 hàng trống riêng), đồng bộ
  // theo data-tab đảm bảo mọi bản sao luôn hiển thị đúng trạng thái.
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab}`));
    });
  });

  // ============================================================
  // TAB "GIÁO VIÊN" — danh sách + thêm/sửa/xoá
  // ============================================================
  function renderTeacherTab() {
    const tbody = document.getElementById('teacherRows');
    document.getElementById('teacherCount').textContent = state.teachers.length;
    if (!state.teachers.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Chưa có giáo viên nào — bấm "➕ Thêm giáo viên" hoặc nhập từ Excel.</td></tr>';
      return;
    }
    tbody.innerHTML = state.teachers.map((t) => `
      <tr>
        <td>${esc(t.code)}</td>
        <td><strong>${esc(t.name)}</strong></td>
        <td>${esc(t.phone) || '–'}</td>
        <td>${esc(t.address) || '–'}</td>
        <td><span class="badge ${t.active ? 'active' : 'inactive'}">${t.active ? 'Đang dạy' : 'Ngừng'}</span></td>
        <td>
          <button type="button" class="btn-edit-text" data-edit-teacher="${esc(t.id)}">Sửa</button>
          <button type="button" class="btn-danger-text" data-del-teacher="${esc(t.id)}">Xoá</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-edit-teacher]').forEach((b) => b.addEventListener('click', () => openTeacherModal(b.dataset.editTeacher)));
    tbody.querySelectorAll('[data-del-teacher]').forEach((b) => b.addEventListener('click', () => deleteTeacher(b.dataset.delTeacher)));
  }

  function openTeacherModal(code) {
    const t = code ? state.teachers.find((x) => x.id === code) : null;
    teacherModalEditingCode = code || null;
    document.getElementById('teacherModalTitle').textContent = code ? '✏️ Sửa giáo viên' : '➕ Thêm giáo viên';
    document.getElementById('f-teacher-code').value = t ? t.code : '';
    document.getElementById('f-teacher-code').disabled = !!code; // mã NV là ID, không đổi được sau khi tạo
    document.getElementById('f-teacher-name').value = t ? t.name : '';
    document.getElementById('f-teacher-phone').value = t ? t.phone : '';
    document.getElementById('f-teacher-address').value = t ? t.address : '';
    document.getElementById('teacherModalOverlay').classList.add('show');
  }
  function closeTeacherModal() {
    document.getElementById('teacherModalOverlay').classList.remove('show');
    document.getElementById('f-teacher-code').disabled = false;
  }
  document.getElementById('addTeacherBtn').addEventListener('click', () => openTeacherModal(null));
  document.getElementById('teacherModalCloseBtn').addEventListener('click', closeTeacherModal);
  document.getElementById('teacherModalCancelBtn').addEventListener('click', closeTeacherModal);
  document.getElementById('teacherModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'teacherModalOverlay') closeTeacherModal();
  });

  document.getElementById('teacherModalSaveBtn').addEventListener('click', async () => {
    const code = document.getElementById('f-teacher-code').value.trim();
    const name = document.getElementById('f-teacher-name').value.trim();
    const phone = document.getElementById('f-teacher-phone').value.trim();
    const address = document.getElementById('f-teacher-address').value.trim();
    if (!code || !name) { toast('⚠️ Cần nhập Mã NV và Họ tên.'); return; }

    const btn = document.getElementById('teacherModalSaveBtn');
    btn.disabled = true;
    try {
      if (teacherModalEditingCode) {
        await window.EduRepositories.teachingTeacher.update(teacherModalEditingCode, { name, phone, address });
      } else {
        if (state.teachers.some((t) => t.id === code)) { toast('⚠️ Mã NV này đã tồn tại.'); btn.disabled = false; return; }
        await window.EduRepositories.teachingTeacher.createWithId(code, M.buildTeacher({ code, name, phone, address }));
      }
      toast('✅ Đã lưu giáo viên');
      closeTeacherModal();
      await loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });

  async function deleteTeacher(code) {
    const t = state.teachers.find((x) => x.id === code);
    if (!confirm(`Xoá giáo viên "${t ? t.name : code}"? Lịch đã nhập của giáo viên này ở các tuần vẫn còn trong hệ thống (không tự xoá theo), chỉ ẩn khỏi danh sách quản lý.`)) return;
    try {
      await window.EduRepositories.teachingTeacher.remove(code);
      toast('🗑️ Đã xoá giáo viên');
      await loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  // ============================================================
  // TAB "LỊCH TUẦN"
  // ============================================================
  function renderWeekSelect() {
    const sel = document.getElementById('weekSelect');
    const prev = state.currentWeekKey;
    if (!state.weeks.length) {
      sel.innerHTML = '<option value="">-- Chưa có tuần nào --</option>';
      return;
    }
    sel.innerHTML = state.weeks.map((w) => `<option value="${esc(w.id)}">${esc(w.label || w.id)}</option>`).join('');
    // Giữ nguyên lựa chọn cũ nếu vẫn còn (vd sau khi thêm GV/nhập Excel khi
    // đang xem 1 tuần khác) — CHỈ khi CHƯA có lựa chọn nào (mới mở trang)
    // mới tự chọn mặc định, và mặc định giờ là ĐÚNG TUẦN HIỆN TẠI theo giờ
    // thực (không còn luôn dừng ở tuần cuối danh sách).
    sel.value = state.weeks.some((w) => w.id === prev) ? prev : pickDefaultWeekKey(state.weeks);
    if (sel.value !== state.currentWeekKey) {
      state.currentWeekKey = sel.value;
      loadWeekSchedules(sel.value);
    }
  }

  /** Chọn tuần mặc định khi mới mở trang (chưa có lựa chọn nào trước đó):
   * ưu tiên ĐÚNG tuần hiện tại (theo ngày thực); nếu chưa có dữ liệu tuần
   * đó thì chọn tuần ĐÃ QUA gần nhất (tuần gần đây nhất còn dữ liệu); nếu
   * mọi tuần đều ở tương lai thì chọn tuần gần nhất sắp tới. */
  function pickDefaultWeekKey(weeks) {
    if (!weeks.length) return '';
    const todayKey = M.todayWeekKey();
    if (weeks.some((w) => w.id === todayKey)) return todayKey;
    const past = weeks.filter((w) => w.id <= todayKey); // đã sort tăng dần theo id (xem listAll())
    if (past.length) return past[past.length - 1].id;
    return weeks[0].id;
  }
  document.getElementById('weekSelect').addEventListener('change', (e) => loadWeekSchedules(e.target.value));
  document.getElementById('teacherSearch').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderWeeklyTab();
  });
  document.getElementById('onlyMissingChk').addEventListener('change', renderWeeklyTab);

  // Bảng màu THEO LOẠI HÌNH PHỤ TRÁCH — dùng chung cho cả chip lịch trong
  // thẻ giáo viên (tc-chip), khối thẻ ngày "Lịch của tôi" (day-card-session)
  // LẪN khi xuất PDF (js/export/teaching-schedule-pdf.js), để cùng 1 loại
  // hình luôn ra cùng 1 màu ở bất kỳ đâu (kể cả file in ra).
  // Khớp ĐÚNG bảng màu chữ người dùng cung cấp lần 2: Trợ Giảng=hồng/magenta,
  // Dạy Trám=xanh dương, Dạy chính (Dạy Trực Tiếp)=xanh ngọc/teal, Dạy Trực
  // Tuyến=xanh lá, Dự Giảng=cam, Làm việc tại cty=đỏ, Nghỉ phép/lễ=đen/trung
  // tính (không tô màu riêng). Ôn Thi/Soạn bài/WFH/Khám SK không có trong
  // bảng màu được cung cấp — chọn màu còn trống, không trùng các màu trên.
  const TYPE_COLOR_SUFFIX = {
    'Dạy chính': 'main', 'Dạy Trám': 'sub', 'Dạy Trực Tuyến': 'online',
    'Ôn Thi': 'review', 'Trợ Giảng': 'assist', 'Dự Giảng': 'demo',
    'Soạn bài': 'prep', 'Làm việc tại cty': 'onsite', 'WFH': 'remote',
    'Khám SK': 'health', 'Nghỉ phép/ lễ': 'leave',
  };
  function typeColorSuffix(type) { return TYPE_COLOR_SUFFIX[type] || ''; }

  /** Chữ viết tắt làm avatar cho 1 giáo viên — lấy chữ cái đầu của tối đa
   * 2 từ cuối trong tên (thường là tên riêng, dễ nhận diện hơn họ). */
  function initialsOf(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const last2 = words.slice(-2);
    return last2.map((w) => w[0]).join('').toUpperCase();
  }

  /** 1 chip lịch trong thẻ giáo viên — CÓ CHỮ rõ ràng (Thứ + Buổi + loại
   * hình), không phải chấm màu trừu tượng khó đọc như bản trước. Chỉ vẽ
   * chip cho buổi CÓ lịch (bỏ qua buổi trống) — giáo viên bận nhiều thì
   * thấy nhiều chip, rảnh thì thẻ ngắn gọn, không có ô trống chiếm chỗ. */
  /** Mã lớp đọc THẲNG từ chính "Tiết 1-5" của buổi này (giờ là ô nhập chữ,
   * không còn chỉ tích chọn) — gộp với mã lớp lấy từ tab "🗓️ TKB lớp"
   * (tham số classCodes) để dù điền ở bên nào cũng hiện ra đủ, không sót. */
  function ownPeriodClassCodes(sess) {
    if (!sess || !Array.isArray(sess.periods)) return [];
    const out = [];
    sess.periods.forEach((p) => {
      if (typeof p === 'string' && p.trim() && !out.includes(p.trim())) out.push(p.trim());
    });
    return out;
  }

  /** Chip lịch — CẤU TRÚC NHIỀU DÒNG giống hệt cách tab "🗓️ TKB lớp" trình
   * bày (mỗi ô: Mã lớp trên/Trường dưới, nhãn rõ ràng), thay vì nhồi hết
   * "Loại hình · mã lớp" vào 1 dòng như bản trước — nhìn 1 lần thấy đủ cả
   * 3 lớp thông tin (loại hình / mã lớp / trường) mà không cần hover. */
  function scheduleChip(d, sess, classCodes) {
    const codes = Array.from(new Set([...ownPeriodClassCodes(sess), ...(classCodes || [])]));
    const hasType = sess && sess.type;
    if (!hasType && !codes.length) return '';
    const suffix = hasType ? (typeColorSuffix(sess.type) || 'prep') : 'main';
    const periods = hasType ? (sess.periods || []).filter((p) => !!p).length : 0;
    const detailParts = [hasType ? sess.location : '', periods ? `${periods} tiết` : '', codes.length ? `Lớp ${codes.join(', ')}` : ''].filter(Boolean);
    const title = detailParts.length ? ` title="${esc(detailParts.join(' · '))}"` : '';
    // Không lặp lại chữ "Sáng"/"Chiều" trong từng chip nữa — vị trí CỘT
    // (trái=Sáng, phải=Chiều, xem tc-chip-list) đã nói lên điều đó.
    const typeRow = `<div class="tc-chip-title"><b>T${d}</b> ${hasType ? esc(sess.type) : 'Lớp đang dạy'}</div>`;
    const lopRow = codes.length ? `<div class="tc-chip-lop">${esc(codes.join(', '))}</div>` : '';
    // Buổi dạy Ở 2 TRƯỜNG (location = "Trường A + Trường B", xem
    // M.splitLocations()) → tách thành 2 dòng riêng thay vì dính chung 1
    // chuỗi dài, giống đúng cách file Excel gốc trình bày 2 cột/buổi (cột
    // chính + cột phụ) cho cùng 1 ngày — mỗi trường 1 dòng, rõ ràng.
    const schoolRows = hasType ? M.splitLocations(sess.location) : [];
    const truongRow = schoolRows.map((s) => `<div class="tc-chip-truong">${esc(s)}</div>`).join('');
    return `<span class="tc-chip ${suffix}"${title}>${typeRow}${lopRow}${truongRow}</span>`;
  }
  /** 1 ô trong lưới 2 cột Sáng/Chiều — luôn trả về 1 phần tử (chip màu nếu
   * có lịch, ô "—" mờ nếu buổi đó trống) để 2 cột LUÔN thẳng hàng theo
   * từng Thứ, không bao giờ lệch cột như khi chip tự wrap tự do. */
  function scheduleChipCell(d, sess, classCodes) {
    return scheduleChip(d, sess, classCodes) || `<span class="tc-chip-off">T${d} —</span>`;
  }

  // Chuyển "📊 Tổng quan" ⇄ "🎴 Thẻ" — điều phối đào tạo cần thấy CẢ ĐỘI
  // cùng lúc (tổng quan) hoặc đọc/sửa chi tiết TỪNG giáo viên (thẻ).
  document.getElementById('viewToggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelectorAll('.view-toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.viewMode = btn.dataset.view;
    document.getElementById('weeklyDashboard')?.classList.toggle('force-hide', state.viewMode !== 'dashboard');
    document.getElementById('weeklyCardsWrap')?.classList.toggle('force-hide', state.viewMode !== 'cards');
    renderWeeklyTab();
  });

  function renderWeeklyTab() {
    // Giáo viên giờ dùng CHUNG bảng "Tổng quan"/"Thẻ" nhiều GV với admin
    // (không còn chuyển sang khối riêng "Lịch của tôi"/renderMyWeekView()
    // nữa) — quyền sửa từng hàng bị khoá riêng ở canEditTeacherRow(), áp
    // dụng ngay trong vòng lặp render bên dưới.
    const cardsContainer = document.getElementById('weeklyCards');
    const progressBar = document.getElementById('weekProgressBar');
    if (!state.currentWeekKey) {
      const msg = '<div class="empty-cell">Chưa có tuần nào — bấm "🧬 Tuần mới" hoặc "📥 Nhập từ Excel" để bắt đầu.</div>';
      cardsContainer.innerHTML = msg;
      document.getElementById('dashMatrixBody').innerHTML = `<tr><td colspan="8" class="empty-cell">${msg.replace(/<[^>]+>/g, '')}</td></tr>`;
      if (progressBar) progressBar.classList.add('force-hide');
      return;
    }

    const q = state.search;
    let teachers = state.teachers.filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q));

    const daysOf = (t) => (state.schedulesByTeacher[t.code] && state.schedulesByTeacher[t.code].days) || M.emptyDays();

    // Thanh tiến độ "đã nhập lịch / tổng số GV" — tính TRƯỚC khi áp bộ lọc
    // "chỉ hiện GV chưa có lịch" để luôn phản ánh đúng cả đội, không phải
    // riêng phần đang lọc hiển thị. Chỉ hiện ở chế độ Thẻ — chế độ Tổng
    // quan đã có ma trận + tô hàng vàng nhạt cho GV chưa nhập, tránh lặp
    // thông tin.
    if (progressBar) {
      const total = teachers.length;
      const missing = teachers.filter((t) => !M.hasAnySchedule(daysOf(t))).length;
      const done = total - missing;
      const pct = total ? Math.round((done / total) * 100) : 0;
      progressBar.classList.toggle('force-hide', total === 0 || state.viewMode !== 'cards');
      progressBar.innerHTML = total ? `
        <div class="wk-progress-track"><div class="wk-progress-fill" style="width:${pct}%"></div></div>
        <span class="wk-progress-label"><b>${done}/${total}</b> giáo viên đã nhập lịch tuần này${missing ? ` · <b class="wk-progress-warn">${missing}</b> chưa nhập` : ' · 🎉 đã đủ'}</span>` : '';
    }

    if (state.viewMode === 'dashboard') {
      renderDashboardView(teachers, daysOf);
      return;
    }

    const onlyMissingChk = document.getElementById('onlyMissingChk');
    if (onlyMissingChk && onlyMissingChk.checked) {
      teachers = teachers.filter((t) => !M.hasAnySchedule(daysOf(t)));
    }

    if (!teachers.length) {
      cardsContainer.innerHTML = '<div class="empty-cell">Không có giáo viên khớp tìm kiếm/bộ lọc.</div>';
      return;
    }

    // Mỗi giáo viên 1 thẻ, kích thước lớn hơn hẳn bản trước — thay bảng dày
    // đặc lẫn dải chấm màu trừu tượng (khó đọc) bằng danh sách chip CÓ CHỮ
    // rõ ràng (Thứ + Buổi + loại hình), chỉ hiện buổi CÓ lịch nên thẻ giáo
    // viên rảnh sẽ ngắn gọn, thẻ bận sẽ tự nhiên dài hơn.
    cardsContainer.innerHTML = teachers.map((t) => {
      const days = daysOf(t);
      const stats = M.computeWeekStats(days);
      const missing = !M.hasAnySchedule(days);
      // Lưới 2 CỘT CỐ ĐỊNH (Sáng | Chiều) — mỗi Thứ 1 hàng, cả 2 ô của
      // hàng đó LUÔN được vẽ (ô trống hiện "—" mờ thay vì bỏ trống hẳn)
      // để 2 cột thẳng hàng nhau; CHỈ bỏ qua nguyên hàng nếu cả buổi Sáng
      // lẫn Chiều hôm đó đều trống — giữ thẻ GV rảnh vẫn ngắn gọn.
      const chips = M.WEEKDAYS.map((d) => {
        const day = days[String(d)] || M.emptyDay();
        const morningCodes = classCodesFor(t.code, d, 'morning');
        const afternoonCodes = classCodesFor(t.code, d, 'afternoon');
        const hasMorning = (day.morning && day.morning.type) || morningCodes.length;
        const hasAfternoon = (day.afternoon && day.afternoon.type) || afternoonCodes.length;
        if (!hasMorning && !hasAfternoon) return '';
        return scheduleChipCell(d, day.morning, morningCodes) + scheduleChipCell(d, day.afternoon, afternoonCodes);
      }).join('');
      const chipList = chips
        ? `<div class="tc-chip-head"><span>Sáng</span><span>Chiều</span></div><div class="tc-chip-list">${chips}</div>`
        : '<div class="tc-empty-note">Chưa nhập lịch tuần này</div>';
      const canEdit = canEditTeacherRow(t.code);
      return `<div class="teacher-card${missing ? ' missing' : ''}">
        <div class="teacher-card-header">
          <div class="teacher-avatar" data-teacher-code="${esc(t.code)}" data-teacher-name="${esc(t.name)}">${esc(initialsOf(t.name))}</div>
          <div class="teacher-card-title">
            <div class="teacher-card-name">${esc(t.name)}</div>
            <div class="teacher-card-code">${esc(t.code)}${missing ? ' · <span class="tc-missing-tag">chưa có lịch</span>' : ''}</div>
          </div>
        </div>
        ${chipList}
        <div class="teacher-card-stats">
          <span><b>${stats.schoolsMain}</b> trường chính</span>
          <span><b>${stats.periodsMain}</b> tiết chính</span>
          <span><b>${stats.periodsSub}</b> tiết trám</span>
          <span><b>${stats.sessionsPrep}</b> soạn bài</span>
        </div>
        <div class="teacher-card-actions">
          <button type="button" class="btn btn-ghost" data-edit-sched="${esc(t.code)}" ${canEdit ? '' : 'disabled title="Chỉ sửa được đúng lịch của chính mình"'}>✏️ Sửa lịch</button>
          <button type="button" class="btn btn-ghost" data-pdf-sched="${esc(t.code)}" title="Xuất lịch tuần của ${esc(t.name)} ra PDF">🖨️ PDF</button>
          <button type="button" class="btn btn-ghost" data-congtac-sched="${esc(t.code)}" title="Xuất Phiếu công tác của ${esc(t.name)} (tự điền theo lịch tuần này)">📋 Phiếu công tác</button>
        </div>
      </div>`;
    }).join('');

    cardsContainer.querySelectorAll('[data-edit-sched]').forEach((b) => b.addEventListener('click', () => openSchedModal(b.dataset.editSched)));
    cardsContainer.querySelectorAll('[data-pdf-sched]').forEach((b) => b.addEventListener('click', () => exportTeacherPdf(b.dataset.pdfSched)));
    cardsContainer.querySelectorAll('[data-congtac-sched]').forEach((b) => b.addEventListener('click', () => openCongTacModalFor(b.dataset.congtacSched)));
    patchScheduleAvatars();
  }

  // TRƯỚC ĐÂY hiện viết tắt (vd "Chính", "TG", "DG"...) kèm 1 bảng chú
  // thích riêng bên dưới để tra "viết tắt = tên đầy đủ" — người dùng phản
  // hồi cứ phải tra đi tra lại rất mất công. Đổi sang hiện NGUYÊN VĂN tên
  // loại hình đầy đủ ngay trong chip (chip đã đủ rộng vì nằm cả hàng
  // riêng, không như ô mini kiểu cũ) — dùng thẳng sess.type, không cần
  // bảng viết tắt/chú thích nữa (đã bỏ renderDashLegend() + #dashLegend).

  // Loại hình KHÔNG tách theo tiết (áp dụng cho CẢ buổi, không có khái
  // niệm "tiết mấy") — chỉ hiện 1 lần ở TIẾT ĐẦU TIÊN của buổi đó khi
  // không có mã lớp nào, các tiết sau để trống, tránh lặp lại vô nghĩa.
  const NON_PERIOD_TYPES = new Set(['Làm việc tại cty', 'WFH', 'Soạn bài', 'Nghỉ phép/ lễ', 'Khám SK']);

  /** Mã lớp CỦA ĐÚNG 1 TIẾT (không phải cả buổi) — ưu tiên dữ liệu đã điền
   * ở tab "🗓️ TKB lớp" (nguồn chi tiết nhất theo từng tiết), nếu trống thì
   * lấy từ chính "Tiết {n}" của tab Lịch tuần (đã cho gõ mã lớp trực tiếp). */
  function periodValueAt(teacherCode, day, thu, sessionKey, tietIdx) {
    const TTM = window.EduModels.TeachingTimetable;
    const tt = state.timetablesByTeacher[teacherCode];
    const raw = tt && tt.days && tt.days[String(thu)] && tt.days[String(thu)][sessionKey] && tt.days[String(thu)][sessionKey][tietIdx];
    const ttVal = raw != null && TTM ? TTM.cellOf(raw).maLop : '';
    if (ttVal) return ttVal.trim();
    const sess = day && day[sessionKey];
    const p = sess && sess.periods && sess.periods[tietIdx];
    return typeof p === 'string' ? p.trim() : '';
  }

  /** 1 ô Thứ×Tiết trong ma trận "📊 Tổng quan" — CHỈ hiện đúng nội dung
   * của TIẾT ĐÓ (mã lớp nếu có dạy), Buổi/Thời gian đã có cột riêng bên
   * trái nên không cần nhắc lại trong từng ô nữa (khác bản trước dồn cả
   * Buổi+Loại hình+Mã lớp+Trường vào 1 ô, dễ vỡ dòng). */
  function dashPeriodCell(sess, value, isFirstPeriod) {
    if (value) {
      const hasType = sess && sess.type;
      const suffix = hasType ? (typeColorSuffix(sess.type) || 'prep') : 'main';
      // Hiện NGUYÊN VĂN tên loại hình đầy đủ (vd "Dạy chính · 5/2") ngay
      // trong chip — không cần nhớ bảng chú thích viết tắt/màu nữa.
      const label = hasType ? `${sess.type} · ${value}` : value;
      return `<span class="dash-chip ${suffix}" title="${esc(label)}">${esc(label)}</span>`;
    }
    // Loại hình không tách theo tiết (Cty/WFH/Soạn bài/Nghỉ phép.../Khám
    // SK) — hiện đúng 1 lần ở tiết đầu buổi để biết cả buổi đang bận gì.
    if (isFirstPeriod && sess && sess.type && NON_PERIOD_TYPES.has(sess.type)) {
      const suffix = typeColorSuffix(sess.type) || 'prep';
      return `<span class="dash-chip ${suffix}" title="${esc(sess.type)}">${esc(sess.type)}</span>`;
    }
    return '<span class="dash-chip-off">—</span>';
  }

  /** "📊 Tổng quan" — MỖI GIÁO VIÊN TÁCH THÀNH NHIỀU HÀNG, 1 hàng/tiết,
   * đúng số tiết + giờ giấc lấy từ khung giờ đã cấu hình ở tab "🗓️ TKB
   * lớp" (⏱️ Giờ tiết — mặc định 5 tiết Sáng/4 tiết Chiều nếu GV chưa tự
   * cấu hình riêng). Cột "Buổi" (tô cam/xanh lá như TKB) ghim ngay cạnh
   * cột tên — mỗi chip trong ô đã tự hiện nguyên văn loại hình + mã lớp
   * nên KHÔNG cần thêm cột "Thời gian"/bảng chú thích màu riêng nữa (đã
   * bỏ, xem dashPeriodCell()). Hàng của GV chưa nhập lịch tự tô nền vàng
   * nhạt (.dash-row-missing). */
  function renderDashboardView(teachers, daysOf) {
    const tbody = document.getElementById('dashMatrixBody');
    const TTM = window.EduModels.TeachingTimetable;
    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Không có giáo viên khớp tìm kiếm.</td></tr>';
    } else {
      const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      const rowsHtml = [];
      sorted.forEach((t, tIdx) => {
        // Viền phân tách rõ giữa khối hàng của từng giáo viên (mỗi GV
        // nhiều hàng gộp qua rowspan cột tên) — chỉ hàng ĐẦU TIÊN của GV
        // (trừ GV đầu bảng) mới cần viền trên, các hàng sau CÙNG 1 GV thì
        // không (không phải là ranh giới giữa 2 GV khác nhau).
        const teacherStartClass = tIdx > 0 ? ' dash-teacher-start' : '';
        const days = daysOf(t);
        // GV đã điền mã lớp bên tab "🗓️ TKB lớp" (dù chưa chọn "loại hình
        // phụ trách" bên đây) thì KHÔNG tính là "chưa có lịch" nữa — 2 tab
        // giờ đã liên thông dữ liệu, tránh báo sai "thiếu" trong khi thật ra
        // đã có TKB.
        const tt = state.timetablesByTeacher[t.code];
        // Mỗi ô-tiết là {maLop, truong} (object LUÔN truthy dù rỗng) — phải
        // đọc qua cellOf().maLop mới biết ô đó THỰC SỰ có dữ liệu hay
        // không, không thể .some(Boolean) trực tiếp trên mảng object.
        const cellHasData = (c) => !!(TTM ? TTM.cellOf(c).maLop : c);
        const hasTtData = !!(tt && tt.days && Object.values(tt.days).some(
          (day) => (day.morning || []).some(cellHasData) || (day.afternoon || []).some(cellHasData),
        ));
        const missingT = !M.hasAnySchedule(days) && !hasTtData;
        const missingClass = missingT ? ' dash-row-missing' : '';
        // Ô tên giờ CAO NGUYÊN CỘT (rowspan ~9 hàng/GV) — thêm avatar + vài
        // số liệu tuần (giống thẻ giáo viên) để lấp khoảng trắng thay vì
        // chỉ 2 dòng chữ nổi lơ lửng giữa 1 ô rất cao, trông như "bỏ trống".
        const stats = M.computeWeekStats(days);
        // Chỉnh sửa/Xuất PDF giờ đi THẲNG qua cột tên giáo viên (2 nút icon
        // nhỏ ngay trong ô tên) thay vì 1 cột "hành động" riêng ở rìa phải
        // — cột đó gần như luôn trống (chỉ 1 hàng/GV nhờ rowspan) nên tốn
        // hẳn 1 cột chỉ để hiện 2 icon, trong khi các cột Thứ lại chật hẹp.
        // Bỏ cột này trả lại chỗ cho các cột Thứ giãn rộng ra, dễ đọc hơn.
        const canEditRow = canEditTeacherRow(t.code);
        const nameCellContent = `<div class="dash-matrix-teacher">
            <div class="dash-matrix-avatar" data-teacher-code="${esc(t.code)}" data-teacher-name="${esc(t.name)}">${esc(initialsOf(t.name))}</div>
            <div class="dash-matrix-name-info">
              <div class="dash-matrix-name">${esc(t.name)}</div>
              <div class="dash-matrix-code">${esc(t.code)}${missingT ? ' · <span class="tc-missing-tag">chưa có lịch</span>' : ''}</div>
            </div>
            <div class="dash-matrix-name-actions">
              <button type="button" class="dash-name-action-btn" data-edit-sched="${esc(t.code)}" title="${canEditRow ? `Sửa lịch của ${esc(t.name)}` : 'Chỉ sửa được đúng lịch của chính mình'}" ${canEditRow ? '' : 'disabled'}>✏️</button>
              <button type="button" class="dash-name-action-btn" data-pdf-sched="${esc(t.code)}" title="Xuất PDF lịch của ${esc(t.name)}">🖨️</button>
              <button type="button" class="dash-name-action-btn" data-congtac-sched="${esc(t.code)}" title="Xuất Phiếu công tác của ${esc(t.name)}">📋</button>
            </div>
          </div>
          <div class="dash-matrix-stats">
            <div class="dash-matrix-stat-card stat-main"><b>${stats.periodsMain}</b><span>tiết chính</span></div>
            <div class="dash-matrix-stat-card stat-sub"><b>${stats.periodsSub}</b><span>tiết trám</span></div>
          </div>`;

        // Khung giờ tiết CỦA GIÁO VIÊN này (áp dụng mọi tuần, không lặp lại
        // theo tuần) — nếu module TKB lớp chưa kịp nạp thì vẫn không vỡ
        // trang, chỉ hiện 1 hàng gộp fallback bên dưới. CHỈ dùng số tiết ở
        // đây để biết vẽ BAO NHIÊU HÀNG (giá trị start/end không hiện ra
        // cột nào cả, xem dashPeriodCell()) — ÉP TỐI THIỂU đủ
        // M.PERIODS_PER_SESSION (5) hàng/buổi dù khung giờ TKB lớp của GV
        // chỉ cấu hình 4 tiết Chiều (mặc định DEFAULT_PERIOD_TIMES.afternoon
        // ở teaching-timetable.model.js), vì "Lịch giảng dạy" (periods[]
        // của teaching_schedule) LUÔN cho phép dạy tới tiết 5 Chiều — thiếu
        // bước ép này khiến 1 số GV có nhập lịch tiết 5 Chiều nhưng
        // "Tổng quan" chỉ vẽ 4 hàng, tiết 5 bị ẩn mất dù dữ liệu vẫn còn.
        const pt = TTM ? TTM.clonePeriodTimes(state.periodTimesByTeacher[t.code]) : null;
        const blocks = pt ? TTM.SESSIONS.map((sessionKey) => {
          const periods = pt[sessionKey] || [];
          const rowCount = Math.max(periods.length, M.PERIODS_PER_SESSION);
          return { sessionKey, periods: Array.from({ length: rowCount }, (_, i) => periods[i] || { start: '', end: '' }) };
        }).filter((b) => b.periods.length) : [];

        if (!blocks.length) {
          // Fallback: không có TTM (lỗi tải module) — vẫn hiện 1 hàng/GV
          // như bản cũ, tối thiểu để trang không trắng xoá.
          rowsHtml.push(`<tr class="${missingClass}${teacherStartClass}">
            <td class="dash-matrix-name-col">${nameCellContent}</td>
            <td class="dash-matrix-buoi-cell">—</td>
            ${M.WEEKDAYS.map((d) => `<td class="dash-matrix-cell" data-day="${d}"><span class="dash-chip-off">—</span></td>`).join('')}
          </tr>`);
          return;
        }

        const totalRows = blocks.reduce((sum, b) => sum + b.periods.length, 0);
        let nameCellWritten = false;
        blocks.forEach((block, blockIdx) => {
          // Thứ nào có loại hình KHÔNG tách theo tiết (Soạn bài/WFH/Cty/
          // Nghỉ phép.../Khám SK — NON_PERIOD_TYPES) VÀ không có mã lớp gõ
          // ở tiết nào — TRƯỚC ĐÂY chỉ hiện chip ở đúng tiết 1, các tiết
          // 2-5 để trống "—" trông như còn dư tiết/mất dữ liệu, dù thực ra
          // loại hình đó áp dụng CẢ buổi. Giờ GỘP các Thứ đó thành 1 ô
          // rowSpan xuyên suốt cả buổi (giống ô "Buổi") — Thứ nào có mã lớp
          // riêng theo từng tiết vẫn tách dòng bình thường như cũ.
          const mergeWholeSession = {};
          M.WEEKDAYS.forEach((d) => {
            const day = days[String(d)] || M.emptyDay();
            const sess = day[block.sessionKey];
            const hasAnyPeriodValue = block.periods.some((_, pi) => periodValueAt(t.code, day, d, block.sessionKey, pi));
            mergeWholeSession[d] = !!(sess && sess.type && NON_PERIOD_TYPES.has(sess.type) && !hasAnyPeriodValue);
          });
          block.periods.forEach((p, pi) => {
            const dayCells = M.WEEKDAYS.map((d) => {
              const day = days[String(d)] || M.emptyDay();
              if (mergeWholeSession[d]) {
                if (pi > 0) return ''; // đã gộp vào ô rowSpan ở tiết 1, KHÔNG vẽ <td> ở các hàng sau
                return `<td class="dash-matrix-cell" data-day="${d}" rowspan="${block.periods.length}">${dashPeriodCell(day[block.sessionKey], '', true)}</td>`;
              }
              const val = periodValueAt(t.code, day, d, block.sessionKey, pi);
              return `<td class="dash-matrix-cell" data-day="${d}">${dashPeriodCell(day[block.sessionKey], val, pi === 0)}</td>`;
            }).join('');
            const isVeryFirstRow = !nameCellWritten;
            const nameCellHtml = isVeryFirstRow ? `<td class="dash-matrix-name-col" rowspan="${totalRows}">${nameCellContent}</td>` : '';
            nameCellWritten = true;
            const buoiCellHtml = pi === 0
              ? `<td class="dash-matrix-buoi-cell dash-sess-${block.sessionKey}" rowspan="${block.periods.length}">${block.sessionKey === 'morning' ? '☀️ Sáng' : '🌙 Chiều'}</td>`
              : '';
            // Gắn class buổi NGAY TRÊN <tr> (không chỉ ô "Buổi") — để CSS tô
            // nền vàng nhạt (Sáng)/xanh lá nhạt (Chiều) cho CẢ HÀNG giống
            // đúng file Excel gốc "LỊCH GIẢNG DẠY TEAM GVTH..." (mẫu người
            // dùng cung cấp), thay vì chỉ tô mỗi ô "Buổi" như bản trước.
            const rowClass = `${missingClass}${isVeryFirstRow ? teacherStartClass : ''} dash-row-sess-${block.sessionKey}`;
            rowsHtml.push(`<tr class="${rowClass}">${nameCellHtml}${buoiCellHtml}${dayCells}</tr>`);
          });
        });
      });
      tbody.innerHTML = rowsHtml.join('');
      tbody.querySelectorAll('[data-edit-sched]').forEach((b) => b.addEventListener('click', () => openSchedModal(b.dataset.editSched)));
      tbody.querySelectorAll('[data-pdf-sched]').forEach((b) => b.addEventListener('click', () => exportTeacherPdf(b.dataset.pdfSched)));
      tbody.querySelectorAll('[data-congtac-sched]').forEach((b) => b.addEventListener('click', () => openCongTacModalFor(b.dataset.congtacSched)));
      patchScheduleAvatars();
    }

    // ---- Đánh dấu cột "hôm nay" trong ma trận (nếu tuần đang xem CHỨA
    // ngày hôm nay) — giúp điều phối đào tạo định vị nhanh "đang ở đâu
    // trong tuần" mà không cần đối chiếu lịch riêng. CHỈ đánh dấu ở HEADER
    // (viền dưới, xem .dash-matrix th.today-col trong CSS) — trước đây còn
    // gắn class lên TỪNG Ô thân cột để tô nền tím, nhưng nền đó đè lên
    // đúng chỗ màu vàng/xanh lá theo buổi, tạo mảng trắng/tím lạc tông
    // giữa cột (phản hồi người dùng) — bỏ hẳn, 1 dấu hiệu ở header là đủ.
    const isCurrentWeek = state.currentWeekKey === M.todayWeekKey();
    const jsDow = new Date().getDay(); // 0=CN,1=T2,...6=T7
    const todayDayNum = isCurrentWeek && jsDow >= 1 && jsDow <= 6 ? jsDow + 1 : null;
    M.WEEKDAYS.forEach((d) => {
      document.getElementById(`dashDayHead${d}`)?.classList.toggle('today-col', d === todayDayNum);
    });
  }

  /** Xuất PDF lịch tuần của ĐÚNG 1 giáo viên (nút "🖨️ PDF" từng hàng) —
   * TỰ ĐỘNG thêm 1 trang phụ "minh chứng tuần cuối tháng" nếu có (xem
   * computeExtraWeekEvidence()), để khớp đúng khoảng ngày "Phiếu công tác"
   * đã gộp (tuần hiện tại + phần còn lại của tháng). */
  async function exportTeacherPdf(teacherCode) {
    const t = state.teachers.find((x) => x.id === teacherCode);
    if (!t) return;
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const days = (state.schedulesByTeacher[teacherCode] && state.schedulesByTeacher[teacherCode].days) || M.emptyDays();
    if (!window.EduTeachingSchedulePdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    try {
      const extra = computeExtraWeekEvidence();
      const extraWeek = extra ? { days: await fetchExtraWeekDaysFor(teacherCode, extra), weekLabel: extra.label } : null;
      window.EduTeachingSchedulePdf.exportOne(t, days, week ? (week.label || week.id) : state.currentWeekKey, M, extraWeek);
    } catch (err) {
      console.error('[Lịch giảng dạy] Lỗi khi xuất PDF:', err);
      toast('❌ Xuất PDF thất bại: ' + (err && err.message ? err.message : String(err)));
    }
  }

  /** Nhãn "d.m - d.m.yyyy" (khớp kiểu week.label sẵn có, vd "21.9 - 26.9.2026"). */
  function formatDateRangeLabel(start, end) {
    return `${start.getDate()}.${start.getMonth() + 1} - ${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
  }

  /** Khoảng ngày + weekKey của "tuần cuối tháng" (đoạn 2 trong
   * defaultCongTacRanges(), xem đó — cùng quy tắc gộp với "📋 Phiếu công
   * tác": tuần đang chọn KHÔNG PHẢI tuần cuối tháng thì phần còn lại của
   * tháng, từ Thứ2 tuần sau đến hết tháng, mới cần minh chứng thêm) — CHỈ
   * trả về khi tuần kế tiếp đó ĐÃ CÓ trong hệ thống (state.weeks, tức đã
   * được tạo/có lịch), nếu chưa có gì để tải thì bỏ qua (null), PDF "Lịch
   * giảng dạy" vẫn xuất bình thường, chỉ là không có trang phụ minh chứng. */
  function computeExtraWeekEvidence() {
    const { week2 } = defaultCongTacRanges();
    if (!week2) return null;
    const weekKey = isoDate(week2.start);
    if (!state.weeks.some((w) => w.id === weekKey)) return null;
    // KHÔNG thêm chú thích "(phần cuối tháng)" vào label — người dùng phản
    // hồi trang phụ minh chứng chỉ cần hiện đúng "Tuần {d}.{m} - {d}.{m}.{y}"
    // giống hệt cách trình bày của trang chính, không cần ghi chú thêm.
    return { weekKey, range: week2, label: formatDateRangeLabel(week2.start, week2.end) };
  }

  /** Tải + cắt `days` của 1 giáo viên cho "tuần cuối tháng" (xem
   * computeExtraWeekEvidence()) — chỉ giữ đúng những ngày còn trong tháng
   * (clippedDaysForWeek), dùng làm trang phụ minh chứng của PDF "Lịch giảng
   * dạy" (xem exportOne()/exportMany() trong js/export/teaching-schedule-pdf.js). */
  async function fetchExtraWeekDaysFor(teacherCode, extra) {
    const rows = await window.EduRepositories.teachingSchedule.listByWeek(extra.weekKey);
    const row = rows.find((r) => r.teacherCode === teacherCode);
    const rawDays = (row && row.days) || M.emptyDays();
    return clippedDaysForWeek(rawDays, extra.weekKey, [extra.range], M);
  }

  /** Danh sách giáo viên ĐANG HIỂN THỊ ở "🎴 Thẻ"/"📊 Tổng quan" của tuần
   * đang chọn (đã áp đúng bộ lọc tìm kiếm + "chỉ hiện GV chưa có lịch"
   * hiện tại) kèm sẵn `days` — dùng chung cho cả 2 nút xuất PDF hàng loạt
   * ("🖨️ Xuất PDF tất cả" của Lịch tuần và "📋 Xuất PDF tất cả Phiếu công
   * tác"), tránh lặp lại đúng 1 đoạn lọc ở 2 nơi. */
  function filteredTeachersWithDays() {
    const q = state.search;
    let teachers = state.teachers.filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q));
    const onlyMissingChk = document.getElementById('onlyMissingChk');
    if (onlyMissingChk && onlyMissingChk.checked) {
      teachers = teachers.filter((t) => !M.hasAnySchedule((state.schedulesByTeacher[t.code] && state.schedulesByTeacher[t.code].days) || M.emptyDays()));
    }
    return teachers.map((t) => ({ teacher: t, days: (state.schedulesByTeacher[t.code] && state.schedulesByTeacher[t.code].days) || M.emptyDays() }));
  }

  /** Xuất 1 file PDF DUY NHẤT gồm lịch của TOÀN BỘ giáo viên đang hiển thị
   * (đã áp bộ lọc tìm kiếm/"chỉ hiện GV chưa có lịch" hiện tại) — mỗi giáo
   * viên 1 trang chính + (nếu có, xem computeExtraWeekEvidence()) 1 trang
   * phụ minh chứng "tuần cuối tháng" — nút "🖨️ Xuất PDF tất cả" trên thanh
   * công cụ. */
  async function exportAllPdf() {
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    if (!window.EduTeachingSchedulePdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    const list = filteredTeachersWithDays();
    if (!list.length) { toast('⚠️ Không có giáo viên nào để xuất (kiểm tra lại bộ lọc/tìm kiếm).'); return; }
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const weekLabel = week ? (week.label || week.id) : state.currentWeekKey;
    // TRƯỚC ĐÂY không có try/catch quanh đây — 1 lỗi bất kỳ khi build PDF
    // (dữ liệu 1 giáo viên nào đó lệch dạng...) sẽ throw NGAY TRONG handler
    // click, không có gì báo cho người dùng biết — bấm nút xong không thấy
    // gì xảy ra, dễ hiểu lầm "không xuất được" trong khi thực ra có lỗi cụ
    // thể (chỉ nằm im trong console). Bọc lại để LUÔN có toast báo rõ lý do.
    try {
      const extra = computeExtraWeekEvidence();
      let fullList = list;
      if (extra) {
        // Tải MỘT LẦN cho cả tuần cuối tháng (dùng chung cho mọi giáo viên
        // trong danh sách), không lặp lại 1 query/GV.
        const rows = await window.EduRepositories.teachingSchedule.listByWeek(extra.weekKey);
        const rawDaysByTeacher = new Map();
        rows.forEach((r) => rawDaysByTeacher.set(r.teacherCode, r.days));
        fullList = list.map(({ teacher, days }) => ({
          teacher,
          days,
          extraDays: clippedDaysForWeek(rawDaysByTeacher.get(teacher.code) || M.emptyDays(), extra.weekKey, [extra.range], M),
        }));
      }
      window.EduTeachingSchedulePdf.exportMany(fullList, weekLabel, M, extra ? extra.label : undefined);
    } catch (err) {
      console.error('[Lịch giảng dạy] Lỗi khi xuất PDF tất cả:', err);
      toast('❌ Xuất PDF thất bại: ' + (err && err.message ? err.message : String(err)));
    }
  }
  document.getElementById('exportAllPdfBtn')?.addEventListener('click', exportAllPdf);

  // ============================================================
  // "LỊCH CỦA TÔI" — khối riêng cho role giáo viên: thay bảng tổng hợp
  // nhiều GV bằng lưới THẺ theo từng ngày (Thứ2→Thứ7), sửa/lưu TRỰC TIẾP
  // ngay tại trang, không cần mở modal — phù hợp vì giáo viên chỉ quản lý
  // đúng lịch của chính mình (1 "hàng" duy nhất) nên bảng dài 10 cột như
  // của admin/coordinator không phù hợp/dễ dùng bằng thẻ theo ngày.
  // ============================================================
  function renderMyWeekView() {
    const emptyEl = document.getElementById('myWeekEmpty');
    const bodyEl = document.getElementById('myWeekBody');

    // Dùng "force-hide" thay vì thuộc tính hidden — .my-week-body có
    // "display:flex" riêng, cùng độ ưu tiên CSS với UA-stylesheet của
    // [hidden] nên thuộc tính hidden không chắc thắng (xem .force-hide).
    if (!state.myTeacherCode) {
      emptyEl.classList.remove('force-hide');
      bodyEl.classList.add('force-hide');
      emptyEl.textContent = 'Tài khoản của bạn chưa được liên kết với hồ sơ giáo viên trong "Lịch giảng dạy" — vui lòng liên hệ Admin/Điều phối đào tạo để được gán Mã NV (admin-users.html).';
      return;
    }
    if (!state.currentWeekKey) {
      emptyEl.classList.remove('force-hide');
      bodyEl.classList.add('force-hide');
      emptyEl.textContent = 'Chưa có tuần nào được tạo — vui lòng liên hệ Điều phối đào tạo/Admin để tạo tuần mới, sau đó quay lại đây để tự cập nhật lịch.';
      return;
    }
    emptyEl.classList.add('force-hide');
    bodyEl.classList.remove('force-hide');

    // Nạp lại "bản nháp" đang sửa từ dữ liệu đã lưu MỖI KHI đổi tuần (hàm
    // này chỉ được gọi lại sau loadWeekSchedules/loadEverything — tức là
    // đúng lúc dữ liệu tuần đang chọn vừa được tải, không phải mỗi lần gõ
    // phím, nên không lo mất nội dung đang sửa dở).
    const existing = state.schedulesByTeacher[state.myTeacherCode];
    state.myWeekDraft = JSON.parse(JSON.stringify((existing && existing.days) || M.emptyDays()));
    renderMyWeekCards();
  }

  function renderMyWeekCards() {
    const container = document.getElementById('myWeekCards');

    function sessionBlock(d, sessionKey, sessionLabel) {
      const sess = state.myWeekDraft[String(d)][sessionKey];
      const colorClass = typeColorSuffix(sess.type) ? ` sess-${typeColorSuffix(sess.type)}` : '';
      return `<div class="day-card-session${colorClass}">
        <div class="day-card-session-label">${sessionLabel}</div>
        <select class="my-week-type" data-day="${d}" data-session="${sessionKey}" data-field="type">
          ${['', ...M.TASK_TYPES].map((t) => `<option value="${esc(t)}" ${sess.type === t ? 'selected' : ''}>${t ? esc(t) : '— (trống/nghỉ)'}</option>`).join('')}
        </select>
        <input type="text" class="my-week-loc" data-day="${d}" data-session="${sessionKey}" data-field="location" value="${esc(sess.location)}" placeholder="Địa điểm / tên trường...">
        <div class="periods-caption">Lớp đang dạy từng tiết (để trống nếu không dạy):</div>
        <div class="day-card-periods">
          ${[0, 1, 2, 3, 4].map((pi) => `
            <label class="period-cell${sess.periods[pi] ? ' has-value' : ''}">
              <span class="period-num">T${pi + 1}</span>
              <input type="text" class="my-week-period" data-day="${d}" data-session="${sessionKey}" data-field="period" data-period-idx="${pi}" value="${esc(sess.periods[pi] || '')}" placeholder="Lớp" title="Lớp đang dạy tiết ${pi + 1} (để trống nếu không dạy)">
            </label>`).join('')}
        </div>
      </div>`;
    }

    container.innerHTML = M.WEEKDAYS.map((d) => `
      <div class="day-card">
        <div class="day-card-title">${M.WEEKDAY_LABELS[d]}</div>
        ${sessionBlock(d, 'morning', 'Sáng')}
        ${sessionBlock(d, 'afternoon', 'Chiều')}
      </div>`).join('');

    // Ghi trực tiếp vào draft khi gõ/chọn (không re-render toàn bộ lưới thẻ
    // mỗi keystroke — tránh mất focus/con trỏ trong input). Riêng đổi
    // "Loại hình" thì cập nhật luôn màu của cả khối buổi đó ngay lập tức
    // (đổi class thay vì render lại toàn bộ, để không mất focus/dữ liệu
    // đang gõ dở ở các ô khác).
    container.querySelectorAll('select, input').forEach((el) => {
      el.addEventListener('input', () => {
        const d = el.dataset.day, s = el.dataset.session, f = el.dataset.field;
        const sess = state.myWeekDraft[d][s];
        if (f === 'type') {
          sess.type = el.value;
          const sessionEl = el.closest('.day-card-session');
          if (sessionEl) {
            const suffix = typeColorSuffix(sess.type);
            sessionEl.className = 'day-card-session' + (suffix ? ` sess-${suffix}` : '');
          }
        } else if (f === 'location') sess.location = el.value;
        else if (f === 'period') {
          sess.periods[Number(el.dataset.periodIdx)] = el.value;
          el.closest('.period-cell')?.classList.toggle('has-value', !!el.value.trim());
        }
        renderMyWeekStatsBar();
      });
    });
    renderMyWeekStatsBar();
  }

  function renderMyWeekStatsBar() {
    const stats = M.computeWeekStats(state.myWeekDraft);
    document.getElementById('myWeekStatsBar').innerHTML = `
      <div class="import-stat ok"><b>${stats.schoolsMain}</b><span>Trường dạy chính</span></div>
      <div class="import-stat ok"><b>${stats.periodsMain}</b><span>Tiết dạy chính</span></div>
      <div class="import-stat"><b>${stats.schoolsSub}</b><span>Trường dạy trám</span></div>
      <div class="import-stat"><b>${stats.periodsSub}</b><span>Tiết dạy trám</span></div>
      <div class="import-stat"><b>${stats.periodsReview}</b><span>Tiết ôn thi (TT/Online)</span></div>
      <div class="import-stat"><b>${stats.sessionsPrep}</b><span>Buổi soạn bài</span></div>
      <div class="import-stat"><b>${stats.sessionsOffice}</b><span>Buổi làm tại cty</span></div>
      <div class="import-stat"><b>${stats.sessionsMentor}</b><span>Lần trợ giảng/dự giảng</span></div>`;
  }

  document.getElementById('myWeekSaveBtn').addEventListener('click', async () => {
    if (!state.myTeacherCode || !state.currentWeekKey) return;
    const t = state.teachers.find((x) => x.id === state.myTeacherCode);
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const docId = M.scheduleDocId(state.myTeacherCode, state.currentWeekKey);
    const btn = document.getElementById('myWeekSaveBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu...';
    try {
      await window.EduRepositories.teachingSchedule.upsert(docId, {
        teacherCode: state.myTeacherCode,
        teacherName: t ? t.name : '',
        weekKey: state.currentWeekKey,
        weekLabel: week ? week.label || week.id : '',
        days: state.myWeekDraft,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      toast('✅ Đã lưu lịch tuần của bạn');
      await loadWeekSchedules(state.currentWeekKey);
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  document.getElementById('myWeekPdfBtn')?.addEventListener('click', async () => {
    if (!state.myTeacherCode || !state.currentWeekKey || !state.myWeekDraft) return;
    const t = state.teachers.find((x) => x.id === state.myTeacherCode);
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    if (!window.EduTeachingSchedulePdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    try {
      // Xuất đúng những gì đang hiển thị trên màn hình (kể cả thay đổi CHƯA
      // lưu) — giáo viên có thể muốn xem trước bản in trước khi bấm Lưu.
      // TỰ ĐỘNG thêm trang phụ "minh chứng tuần cuối tháng" nếu có, khớp
      // đúng khoảng ngày "Phiếu công tác" đã gộp (xem computeExtraWeekEvidence()).
      const extra = computeExtraWeekEvidence();
      const extraWeek = extra ? { days: await fetchExtraWeekDaysFor(state.myTeacherCode, extra), weekLabel: extra.label } : null;
      window.EduTeachingSchedulePdf.exportOne(t || { code: state.myTeacherCode, name: '' }, state.myWeekDraft, week ? (week.label || week.id) : state.currentWeekKey, M, extraWeek);
    } catch (err) {
      console.error('[Lịch giảng dạy] Lỗi khi xuất PDF:', err);
      toast('❌ Xuất PDF thất bại: ' + (err && err.message ? err.message : String(err)));
    }
  });

  // ------------------------------------------------------------
  // "📋 Phiếu công tác" — mẫu On_Tap_MOS/Phieu cong tac.doc, tự điền theo
  // đúng Lịch tuần. "Mục đích" từng cho chọn Giảng dạy/Ôn Thi qua modal,
  // nhưng người dùng phản hồi bỏ hẳn lựa chọn đó, cố định luôn "Giảng dạy
  // IC3" (xem hằng số PURPOSE trong js/export/teaching-schedule-cong-tac-pdf.js).
  // 3 lối vào: giáo viên tự xuất phiếu của chính mình ("Lịch của tôi"),
  // admin xuất phiếu thay cho 1 giáo viên cụ thể (nút 📋 trên từng thẻ/hàng
  // ở "📊 Tổng quan"/"🎴 Thẻ"), và admin xuất HÀNG LOẠT mọi giáo viên đang
  // hiển thị vào 1 file duy nhất ("📋 Xuất PDF tất cả Phiếu công tác").
  //
  // GỘP "TUẦN HIỆN TẠI" + "PHẦN CÒN LẠI CỦA THÁNG" (không phải cả tháng từ
  // đầu, và KHÔNG qua tháng sau): người dùng phản hồi — giữa tháng làm
  // phiếu cho tuần vừa dạy xong rồi cuối tháng lại phải làm tiếp cho những
  // ngày còn lại, ra 2 phiếu/2 lần xuất, khá lòng vòng; nhưng gộp NGUYÊN
  // CẢ THÁNG (kể cả các tuần ĐÃ LÀM PHIẾU TỪ TRƯỚC, và lỡ dính qua tận
  // tháng sau nếu 1 tuần cuối tháng có Thứ7 rơi sang tháng kế) lại SAI —
  // chỉ nên tính từ Thứ2 tuần đang chọn (Lịch tuần) đến hết ngày cuối cùng
  // của đúng tháng đó. Cả 3 lối vào bên dưới đều mở modal
  // congTacRangeModalOverlay cho chọn/sửa lại 2 khoảng ngày này (mặc định
  // đúng quy tắc trên, xem defaultCongTacRanges()) trước khi xuất — xem
  // weekEntries ở js/export/teaching-schedule-cong-tac-pdf.js.
  // ------------------------------------------------------------
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  /** Parse "YYYY-MM-DD" (value của <input type="date">) thành Date LOCAL lúc
   * 00:00 — không dùng `new Date(str)` thẳng (parse theo UTC, lệch múi giờ
   * local có thể lùi/tăng 1 ngày). */
  function parseIsoDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  /** Ngày dương lịch cụ thể (Date, LOCAL) của 1 Thứ trong tuần — suy từ
   * weekKey (Thứ 2 đầu tuần "YYYY-MM-DD") + số Thứ (2..7, khớp M.WEEKDAYS) —
   * bản LOCAL của dateObjForWeekday() trong js/export/teaching-schedule-cong-tac-pdf.js
   * (cần lại ở đây để so ngày với các mốc range do người dùng chọn). */
  function dateForWeekdayLocal(weekKey, weekdayNum) {
    const monday = parseIsoDate(weekKey);
    const d = new Date(monday);
    d.setDate(monday.getDate() + (weekdayNum - 2));
    return d;
  }
  function lastDateOfMonthContaining(weekKey) {
    const [y, m] = weekKey.split('-').map(Number);
    return new Date(y, m, 0); // new Date(y, m, 0) = ngày cuối cùng của tháng m (m 1-indexed)
  }

  /** 2 khoảng ngày MẶC ĐỊNH để xuất Phiếu công tác + minh chứng Lịch giảng
   * dạy, tính từ tuần đang chọn (state.currentWeekKey): {week1} = Thứ2→Thứ7
   * của TUẦN ĐANG CHỌN (kẹp lại ở cuối tháng, phòng khi tuần này đã là
   * tuần cuối cùng và Thứ7 rơi sang tháng sau); {week2} = Thứ2 tuần KẾ TIẾP
   * → hết ngày cuối tháng.
   * CHỈ gộp thêm week2 khi tuần đang chọn ĐÚNG LÀ TUẦN ÁP CHÓT của tháng
   * (2 tuần cuối tháng) — người dùng phản hồi: nếu đang ở tuần ĐẦU/GIỮA
   * tháng (còn ≥ 2 tuần trọn vẹn nữa mới hết tháng) thì KHÔNG được tự gộp
   * thêm phần cuối tháng vào, chỉ xuất đúng 1 tuần đang chọn như bình
   * thường — tránh gộp nhầm/gộp quá xa so với tuần đang xem. Điều kiện:
   * Thứ2 tuần kế tiếp (nextMonday) phải nằm trong tháng NHƯNG Thứ2 tuần kế
   * tiếp NỮA (nextMonday + 7 ngày) phải đã VƯỢT quá cuối tháng — tức tuần
   * kế tiếp đó chính là tuần cuối cùng (đầy đủ hoặc chỉ còn vài ngày) của
   * tháng, không còn tuần trọn vẹn nào khác xen giữa. */
  function defaultCongTacRanges() {
    const monday = parseIsoDate(state.currentWeekKey);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    const monthEnd = lastDateOfMonthContaining(state.currentWeekKey);
    const week1 = { start: monday, end: saturday < monthEnd ? saturday : monthEnd };
    let week2 = null;
    if (saturday < monthEnd) {
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);
      const mondayAfterNext = new Date(monday);
      mondayAfterNext.setDate(monday.getDate() + 14);
      if (nextMonday <= monthEnd && mondayAfterNext > monthEnd) week2 = { start: nextMonday, end: monthEnd };
    }
    return { week1, week2 };
  }

  function dateInAnyRange(date, ranges) {
    return ranges.some((r) => date >= r.start && date <= r.end);
  }

  /** Mọi weekKey (đã có dữ liệu, state.weeks) có tuần GIAO NHAU với ít nhất
   * 1 khoảng trong `ranges` — sắp tăng dần. Chỉ cần lấy ĐỦ các tuần liên
   * quan để tải dữ liệu; việc cắt đúng ngày nằm trong/ngoài range để hiện
   * lên phiếu do clippedDaysForWeek() đảm nhiệm. */
  function weekKeysOverlappingRanges(ranges) {
    if (!ranges.length) return [];
    const minDate = new Date(Math.min(...ranges.map((r) => r.start.getTime())));
    const maxDate = new Date(Math.max(...ranges.map((r) => r.end.getTime())));
    return state.weeks
      .map((w) => w.id)
      .filter((wk) => {
        const monday = parseIsoDate(wk);
        const saturday = new Date(monday);
        saturday.setDate(monday.getDate() + 5);
        return saturday >= minDate && monday <= maxDate;
      })
      .sort();
  }

  /** Tải `days` của MỌI giáo viên cho từng weekKey trong `weekKeys`, trả
   * về Map(weekKey -> Map(teacherCode -> days)) — tải MỖI TUẦN ĐÚNG 1 LẦN
   * (dùng chung cho mọi giáo viên khi xuất hàng loạt) thay vì lặp lại 1
   * query/GV/tuần. Tuần đang chọn (state.currentWeekKey) dùng lại đúng dữ
   * liệu đã có sẵn trong state (không tải lại). */
  async function fetchScheduleRowsByWeek(weekKeys) {
    const otherWeekKeys = weekKeys.filter((wk) => wk !== state.currentWeekKey);
    const otherRows = await Promise.all(
      otherWeekKeys.map((wk) => window.EduRepositories.teachingSchedule.listByWeek(wk)),
    );
    const byWeek = new Map();
    if (weekKeys.includes(state.currentWeekKey)) {
      const cur = new Map();
      Object.entries(state.schedulesByTeacher).forEach(([code, row]) => cur.set(code, row.days));
      byWeek.set(state.currentWeekKey, cur);
    }
    otherWeekKeys.forEach((wk, i) => {
      const cur = new Map();
      otherRows[i].forEach((r) => cur.set(r.teacherCode, r.days));
      byWeek.set(wk, cur);
    });
    return byWeek;
  }

  /** Cắt `days` của 1 tuần (weekKey) chỉ giữ lại đúng những Thứ có ngày
   * dương lịch rơi vào 1 trong `ranges` — Thứ nào rơi ngoài mọi range (vd
   * thuộc tuần trước "tuần hiện tại", hoặc rơi sang tháng sau) bị coi như
   * KHÔNG dạy (M.emptyDay()), dù dữ liệu gốc trong teaching_schedule có gì
   * đi nữa — đảm bảo cả "Tên khách hàng cần gặp" lẫn "Thời gian" trên phiếu
   * đều tự động khớp đúng khoảng ngày người dùng đã chọn/xác nhận. */
  function clippedDaysForWeek(daysRaw, weekKey, ranges, M) {
    const out = {};
    M.WEEKDAYS.forEach((d) => {
      const date = dateForWeekdayLocal(weekKey, d);
      const original = (daysRaw && daysRaw[String(d)]) || M.emptyDay();
      out[String(d)] = dateInAnyRange(date, ranges) ? original : M.emptyDay();
    });
    return out;
  }

  /** Gộp `days` (đã CẮT đúng theo `ranges`) của 1 giáo viên qua nhiều tuần
   * (từ `byWeek`, xem fetchScheduleRowsByWeek()) thành weekEntries cho
   * js/export/teaching-schedule-cong-tac-pdf.js. `draftForCurrentWeek` cho
   * phép ưu tiên bản nháp CHƯA LƯU của "Lịch của tôi" ở tuần đang chọn
   * (nhất quán với nút "🖨️ Xuất PDF" lịch tuần bên cạnh, luôn xuất đúng
   * những gì đang hiển thị trên màn hình). */
  function weekEntriesFromByWeek(byWeek, weekKeys, teacherCode, ranges, draftForCurrentWeek) {
    return weekKeys.map((wk) => {
      const rawDays = (wk === state.currentWeekKey && draftForCurrentWeek)
        ? draftForCurrentWeek
        : (byWeek.get(wk) && byWeek.get(wk).get(teacherCode)) || M.emptyDays();
      return { weekKey: wk, days: clippedDaysForWeek(rawDays, wk, ranges, M) };
    });
  }

  // ---- Modal chọn/sửa 2 khoảng ngày trước khi xuất -----------------
  let congTacRangePendingRun = null; // (ranges) => Promise<void>|void — set khi mở modal, chạy khi bấm "Xuất PDF"
  function openCongTacRangeModal(run) {
    const { week1, week2 } = defaultCongTacRanges();
    document.getElementById('congTacRange1Start').value = isoDate(week1.start);
    document.getElementById('congTacRange1End').value = isoDate(week1.end);
    const week2Wrap = document.getElementById('congTacRange2Wrap');
    if (week2) {
      week2Wrap.classList.remove('force-hide');
      document.getElementById('congTacRange2Start').value = isoDate(week2.start);
      document.getElementById('congTacRange2End').value = isoDate(week2.end);
    } else {
      week2Wrap.classList.add('force-hide');
    }
    congTacRangePendingRun = run;
    document.getElementById('congTacRangeModalOverlay').classList.add('show');
  }
  function closeCongTacRangeModal() {
    document.getElementById('congTacRangeModalOverlay').classList.remove('show');
    congTacRangePendingRun = null;
  }
  document.getElementById('congTacRangeCloseBtn')?.addEventListener('click', closeCongTacRangeModal);
  document.getElementById('congTacRangeCancelBtn')?.addEventListener('click', closeCongTacRangeModal);
  document.getElementById('congTacRangeModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'congTacRangeModalOverlay') closeCongTacRangeModal();
  });
  document.getElementById('congTacRangeConfirmBtn')?.addEventListener('click', async () => {
    const r1s = document.getElementById('congTacRange1Start').value;
    const r1e = document.getElementById('congTacRange1End').value;
    if (!r1s || !r1e) { toast('⚠️ Chọn đủ ngày bắt đầu/kết thúc của tuần hiện tại.'); return; }
    const ranges = [{ start: parseIsoDate(r1s), end: parseIsoDate(r1e) }];
    const week2Visible = !document.getElementById('congTacRange2Wrap').classList.contains('force-hide');
    if (week2Visible) {
      const r2s = document.getElementById('congTacRange2Start').value;
      const r2e = document.getElementById('congTacRange2End').value;
      if (r2s && r2e) ranges.push({ start: parseIsoDate(r2s), end: parseIsoDate(r2e) });
    }
    const run = congTacRangePendingRun;
    closeCongTacRangeModal();
    if (run) await run(ranges);
  });

  document.getElementById('myWeekCongTacBtn')?.addEventListener('click', () => {
    if (!state.myTeacherCode || !state.currentWeekKey || !state.myWeekDraft) { toast('⚠️ Chưa có lịch tuần để xuất.'); return; }
    if (!window.EduCongTacPdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    openCongTacRangeModal(async (ranges) => {
      const t = state.teachers.find((x) => x.id === state.myTeacherCode);
      try {
        const weekKeys = weekKeysOverlappingRanges(ranges);
        const byWeek = await fetchScheduleRowsByWeek(weekKeys);
        const weekEntries = weekEntriesFromByWeek(byWeek, weekKeys, state.myTeacherCode, ranges, state.myWeekDraft);
        window.EduCongTacPdf.exportOne(t || { code: state.myTeacherCode, name: '' }, weekEntries, M);
      } catch (err) {
        console.error('[Lịch giảng dạy] Lỗi khi xuất Phiếu công tác:', err);
        toast('❌ Xuất PDF thất bại: ' + (err && err.message ? err.message : String(err)));
      }
    });
  });
  /** Admin/điều phối bấm nút 📋 trên 1 thẻ/hàng giáo viên cụ thể (khác
   * "Lịch của tôi" — không có bản nháp đang sửa dở, luôn dùng đúng dữ liệu
   * ĐÃ LƯU trong state.schedulesByTeacher/repository của khoảng ngày đã chọn). */
  function openCongTacModalFor(teacherCode) {
    const t = state.teachers.find((x) => x.id === teacherCode || x.code === teacherCode);
    if (!t) return;
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    if (!window.EduCongTacPdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    openCongTacRangeModal(async (ranges) => {
      try {
        const weekKeys = weekKeysOverlappingRanges(ranges);
        const byWeek = await fetchScheduleRowsByWeek(weekKeys);
        const weekEntries = weekEntriesFromByWeek(byWeek, weekKeys, teacherCode, ranges);
        window.EduCongTacPdf.exportOne(t, weekEntries, M);
      } catch (err) {
        console.error('[Lịch giảng dạy] Lỗi khi xuất Phiếu công tác:', err);
        toast('❌ Xuất PDF thất bại: ' + (err && err.message ? err.message : String(err)));
      }
    });
  }
  /** Nút "📋 Xuất PDF tất cả Phiếu công tác" — cùng bộ lọc GV đang hiển thị
   * với "🖨️ Xuất PDF tất cả" (Lịch tuần), chỉ khác đầu ra là Phiếu công
   * tác, gộp mọi giáo viên (+ khoảng ngày đã chọn) vào 1 file duy nhất (xem
   * exportMany() trong js/export/teaching-schedule-cong-tac-pdf.js). */
  document.getElementById('exportAllCongTacBtn')?.addEventListener('click', () => {
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    if (!window.EduCongTacPdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    const list = filteredTeachersWithDays();
    if (!list.length) { toast('⚠️ Không có giáo viên nào để xuất (kiểm tra lại bộ lọc/tìm kiếm).'); return; }
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const weekLabel = week ? (week.label || week.id) : state.currentWeekKey;
    openCongTacRangeModal(async (ranges) => {
      // Cùng lý do bọc try/catch như exportAllPdf() ở trên — trước đây lỗi
      // ở đây cũng throw âm thầm, không báo được gì cho người dùng.
      try {
        const weekKeys = weekKeysOverlappingRanges(ranges);
        const byWeek = await fetchScheduleRowsByWeek(weekKeys);
        const fullList = list.map(({ teacher }) => ({
          teacher,
          weekEntries: weekEntriesFromByWeek(byWeek, weekKeys, teacher.code, ranges),
        }));
        window.EduCongTacPdf.exportMany(fullList, M, weekLabel);
      } catch (err) {
        console.error('[Lịch giảng dạy] Lỗi khi xuất PDF tất cả Phiếu công tác:', err);
        toast('❌ Xuất PDF thất bại: ' + (err && err.message ? err.message : String(err)));
      }
    });
  });

  // ------------------------------------------------------------
  // MODAL: LƯỚI LỊCH TUẦN CỦA 1 GIÁO VIÊN
  // ------------------------------------------------------------
  function openSchedModal(teacherCode) {
    const t = state.teachers.find((x) => x.id === teacherCode);
    if (!t) return;
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    schedModalTeacherCode = teacherCode;
    const existing = state.schedulesByTeacher[teacherCode];
    // Deep clone để sửa trong modal KHÔNG ảnh hưởng state cho tới khi bấm Lưu.
    schedModalDraftDays = JSON.parse(JSON.stringify((existing && existing.days) || M.emptyDays()));

    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    document.getElementById('schedModalTitle').textContent = `📅 ${t.name} — ${week ? week.label || week.id : state.currentWeekKey}`;
    renderSchedGrid();
    document.getElementById('schedModalOverlay').classList.add('show');
  }
  function closeSchedModal() {
    document.getElementById('schedModalOverlay').classList.remove('show');
    schedModalTeacherCode = null;
    schedModalDraftDays = null;
  }
  document.getElementById('schedModalCloseBtn').addEventListener('click', closeSchedModal);
  document.getElementById('schedModalCancelBtn').addEventListener('click', closeSchedModal);
  document.getElementById('schedModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'schedModalOverlay') closeSchedModal();
  });

  const TYPE_OPTIONS_HTML = ['', ...M.TASK_TYPES].map((t) => `<option value="${esc(t)}">${t ? esc(t) : '— (trống)'}</option>`).join('');

  /** Dựng bảng sửa: 1 hàng nhãn "Thứ" trên cùng, rồi 2 nhóm (Sáng/Chiều) ×
   * (Loại hình / Địa điểm / Tiết 1-5) — input đọc/ghi trực tiếp vào
   * schedModalDraftDays qua data-attribute, không cần state riêng cho form. */
  function renderSchedGrid() {
    const table = document.getElementById('schedGrid');
    const dayHeaders = M.WEEKDAYS.map((d) => `<th>${M.WEEKDAY_LABELS[d]}</th>`).join('');

    function sessionRows(sessionKey, sessionLabel) {
      const typeRow = `<tr class="sched-session-start">
        <td class="sched-buoi-label ${sessionKey}" rowspan="7">${sessionLabel}</td>
        <td class="sched-row-label">Loại hình</td>
        ${M.WEEKDAYS.map((d) => {
          const sess = schedModalDraftDays[String(d)][sessionKey];
          return `<td><select class="sched-type" data-day="${d}" data-session="${sessionKey}" data-field="type">
            ${['', ...M.TASK_TYPES].map((t) => `<option value="${esc(t)}" ${sess.type === t ? 'selected' : ''}>${t ? esc(t) : '— (trống)'}</option>`).join('')}
          </select></td>`;
        }).join('')}
      </tr>`;
      const locRow = `<tr>
        <td class="sched-row-label">Địa điểm</td>
        ${M.WEEKDAYS.map((d) => {
          const sess = schedModalDraftDays[String(d)][sessionKey];
          return `<td><input type="text" class="sched-loc" data-day="${d}" data-session="${sessionKey}" data-field="location" value="${esc(sess.location)}" placeholder="Tên trường..."></td>`;
        }).join('')}
      </tr>`;
      const periodRows = [0, 1, 2, 3, 4].map((pi) => `<tr>
        <td class="sched-row-label">Tiết ${pi + 1}</td>
        ${M.WEEKDAYS.map((d) => {
          const sess = schedModalDraftDays[String(d)][sessionKey];
          return `<td class="sched-period-cell"><input type="text" class="sched-period" data-day="${d}" data-session="${sessionKey}" data-field="period" data-period-idx="${pi}" value="${esc(sess.periods[pi] || '')}" placeholder="Lớp" title="Lớp đang dạy tiết ${pi + 1} (để trống nếu không dạy)"></td>`;
        }).join('')}
      </tr>`).join('');
      return typeRow + locRow + periodRows;
    }

    table.innerHTML = `
      <colgroup>
        <col class="sched-col-buoi"><col class="sched-col-label">
        ${M.WEEKDAYS.map(() => '<col>').join('')}
      </colgroup>
      <thead><tr><th colspan="2">Buổi</th>${dayHeaders}</tr></thead>
      <tbody>
        ${sessionRows('morning', 'SÁNG')}
        ${sessionRows('afternoon', 'CHIỀU')}
      </tbody>`;

    // Ghi trực tiếp vào draft khi người dùng gõ/chọn (không re-render toàn
    // bảng mỗi keystroke — tránh mất focus/con trỏ trong input).
    table.querySelectorAll('select, input').forEach((el) => {
      el.addEventListener('input', () => {
        const d = el.dataset.day, s = el.dataset.session, f = el.dataset.field;
        const sess = schedModalDraftDays[d][s];
        if (f === 'type') sess.type = el.value;
        else if (f === 'location') sess.location = el.value;
        else if (f === 'period') sess.periods[Number(el.dataset.periodIdx)] = el.value;
        renderSchedStatsBar();
      });
    });
    renderSchedStatsBar();
  }

  function renderSchedStatsBar() {
    const stats = M.computeWeekStats(schedModalDraftDays);
    document.getElementById('schedStatsBar').innerHTML = `
      <div class="import-stat ok"><b>${stats.schoolsMain}</b><span>Trường dạy chính</span></div>
      <div class="import-stat ok"><b>${stats.periodsMain}</b><span>Tiết dạy chính</span></div>
      <div class="import-stat"><b>${stats.schoolsSub}</b><span>Trường dạy trám</span></div>
      <div class="import-stat"><b>${stats.periodsSub}</b><span>Tiết dạy trám</span></div>
      <div class="import-stat"><b>${stats.periodsReview}</b><span>Tiết ôn thi (TT/Online)</span></div>
      <div class="import-stat"><b>${stats.sessionsPrep}</b><span>Buổi soạn bài</span></div>
      <div class="import-stat"><b>${stats.sessionsOffice}</b><span>Buổi làm tại cty</span></div>
      <div class="import-stat"><b>${stats.sessionsMentor}</b><span>Lần trợ giảng/dự giảng</span></div>`;
  }

  document.getElementById('schedModalSaveBtn').addEventListener('click', async () => {
    if (!schedModalTeacherCode || !state.currentWeekKey) return;
    const t = state.teachers.find((x) => x.id === schedModalTeacherCode);
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const docId = M.scheduleDocId(schedModalTeacherCode, state.currentWeekKey);
    const btn = document.getElementById('schedModalSaveBtn');
    btn.disabled = true;
    try {
      await window.EduRepositories.teachingSchedule.upsert(docId, {
        teacherCode: schedModalTeacherCode,
        teacherName: t ? t.name : '',
        weekKey: state.currentWeekKey,
        weekLabel: week ? week.label || week.id : '',
        days: schedModalDraftDays,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      toast('✅ Đã lưu lịch tuần');
      closeSchedModal();
      await loadWeekSchedules(state.currentWeekKey);
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });

  // ============================================================
  // TỰ ĐỘNG HOÁ: "🧬 Tuần mới" — tạo tuần kế tiếp trong 1 bước, có thể tự
  // SAO CHÉP lịch từ 1 tuần đã có sang tuần mới (giáo viên dạy lặp lại lịch
  // theo tuần chỉ cần sửa phần thay đổi thay vì nhập lại từ đầu/qua Excel).
  // ============================================================
  function openNewWeekModal() {
    const dateInput = document.getElementById('f-week-date');
    const labelInput = document.getElementById('f-week-label');
    const cloneSel = document.getElementById('f-week-clone');
    dateInput.value = '';
    labelInput.value = '';
    cloneSel.innerHTML = '<option value="">-- Để trống, không sao chép --</option>'
      + state.weeks.map((w) => `<option value="${esc(w.id)}">${esc(w.label || w.id)}</option>`).join('');
    // Mặc định chọn tuần đang xem — trường hợp phổ biến nhất là "nhân bản
    // tuần vừa xong sang tuần kế tiếp".
    if (state.currentWeekKey) cloneSel.value = state.currentWeekKey;
    document.getElementById('newWeekModalOverlay').classList.add('show');
  }
  function closeNewWeekModal() {
    document.getElementById('newWeekModalOverlay').classList.remove('show');
  }
  document.getElementById('newWeekBtn').addEventListener('click', openNewWeekModal);
  document.getElementById('newWeekCloseBtn').addEventListener('click', closeNewWeekModal);
  document.getElementById('newWeekCancelBtn').addEventListener('click', closeNewWeekModal);
  document.getElementById('newWeekModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'newWeekModalOverlay') closeNewWeekModal();
  });
  // Gợi ý nhãn hiển thị tự động ngay khi chọn ngày, người dùng vẫn sửa tay được.
  document.getElementById('f-week-date').addEventListener('change', (e) => {
    const labelInput = document.getElementById('f-week-label');
    if (!labelInput.value.trim() && e.target.value) labelInput.value = M.labelFromMonday(e.target.value);
  });

  document.getElementById('newWeekConfirmBtn').addEventListener('click', async () => {
    const weekKey = document.getElementById('f-week-date').value;
    const label = document.getElementById('f-week-label').value.trim();
    const cloneFrom = document.getElementById('f-week-clone').value;
    if (!weekKey) { toast('⚠️ Chọn ngày Thứ 2 đầu tuần.'); return; }
    if (state.weeks.some((w) => w.id === weekKey)) { toast('⚠️ Tuần này đã tồn tại — chọn ngày khác hoặc sửa trực tiếp ở tuần đó.'); return; }

    const btn = document.getElementById('newWeekConfirmBtn');
    btn.disabled = true;
    try {
      const weekLabel = label || M.labelFromMonday(weekKey);
      await window.EduRepositories.teachingWeek.createWithId(weekKey, M.buildWeek({ label: weekLabel }));

      let clonedCount = 0;
      if (cloneFrom) {
        const sourceRows = await window.EduRepositories.teachingSchedule.listByWeek(cloneFrom);
        if (sourceRows.length) {
          const db = window.EduFirebase.db;
          const schedCol = window.EduRepositories.teachingSchedule.col();
          let batch = db.batch();
          let ops = 0;
          const flushIfNeeded = async () => { if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } };
          for (const row of sourceRows) {
            const docId = M.scheduleDocId(row.teacherCode, weekKey);
            batch.set(schedCol.doc(docId), {
              teacherCode: row.teacherCode,
              teacherName: row.teacherName,
              weekKey, weekLabel,
              days: row.days,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            ops++; await flushIfNeeded();
          }
          if (ops > 0) await batch.commit();
          clonedCount = sourceRows.length;
        }
      }

      toast(`✅ Đã tạo tuần "${weekLabel}"${clonedCount ? ` (đã sao chép lịch của ${clonedCount} giáo viên)` : ''}`);
      closeNewWeekModal();
      state.currentWeekKey = weekKey;
      await loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });

  // ============================================================
  // NHẬP TỪ EXCEL — đọc TOÀN BỘ sheet tuần trong file, mỗi sheet là 1
  // tuần đúng cấu trúc file gốc "LỊCH GIẢNG DẠY TEAM GVTH...xlsx":
  //   Hàng tiêu đề chứa "MÃ NV" → xác định cột A-D (mã/tên/sđt/địa chỉ)
  //   và 6 cột Thứ2..Thứ7 (cách nhau 2 cột: G,I,K,M,O,Q = idx 6,8,10,12,14,16).
  //   Mỗi giáo viên chiếm khối 14 dòng liên tiếp ngay sau hàng tiêu đề:
  //     dòng 0: loại hình (SÁNG) | dòng 1: địa điểm (SÁNG)
  //     dòng 2-6: tiết 1-5 (SÁNG)
  //     dòng 7: loại hình (CHIỀU) | dòng 8: địa điểm (CHIỀU)
  //     dòng 9-13: tiết 1-5 (CHIỀU)
  //   CỘT PHỤ (H,J,L,N,P,R = ngay bên phải mỗi cột Thứ, idx+1) — buổi nào
  //   giáo viên dạy ở 2 TRƯỜNG khác nhau trong cùng buổi (vd Chiều Thứ Tư
  //   nửa buổi ở trường A, nửa buổi ở trường B) thì người nhập lịch ghi
  //   TRƯỜNG THỨ 2 + các tiết tương ứng ngay cột phụ này, cùng khối 14
  //   dòng, giống hệt cột chính (xem banner Excel người dùng cung cấp,
  //   cột L cạnh cột K/Thứ 4 của cô Huỳnh Ngọc Tuyết). Trước đây
  //   WEEKDAY_COL_IDX chỉ trỏ vào cột CHÍNH nên toàn bộ dữ liệu cột phụ bị
  //   ĐỌC SÓT khi nhập — mergeSecondarySchoolColumn() bên dưới gộp lại,
  //   ghép `location` thành "Trường A + Trường B" bằng M.joinLocations()
  //   (cùng quy ước với syncScheduleLocationsFromTimetable() ở
  //   teaching-timetable.js) để thống kê/hỗ trợ xăng xe tính đúng 2 trường.
  // ============================================================
  const WEEKDAY_COL_IDX = [6, 8, 10, 12, 14, 16]; // 0-based, ứng với Thứ2..Thứ7
  const BLOCK_ROWS = 14;

  /** Gộp session cột phụ (2 trường/buổi) vào session cột chính đã đọc được
   * — `location` ghép bằng M.joinLocations() (bỏ trùng), `type` giữ của
   * cột chính (chỉ lấy của cột phụ khi cột chính bỏ trống loại hình),
   * `periods[i]` ưu tiên giá trị cột chính, chỉ lấy của cột phụ khi đúng
   * tiết đó cột chính đang trống (đúng tình huống thực tế: 1 buổi nhưng
   * mỗi trường dạy các tiết khác nhau, không tiết nào trùng cả 2 trường).
   * `periodSchools[i]` = ĐÚNG trường của riêng tiết i (cột nào có mã lớp ở
   * tiết đó thì lấy trường của cột đó) — field `location` gộp
   * ("Trường A + Trường B") không đủ để biết tiết nào ở trường nào, nên
   * giữ thêm mảng này để tab "🗓️ TKB lớp" tự điền ĐÚNG "Trường" cho từng
   * tiết khi auto-fill (xem applyScheduleAutoFill() ở teaching-timetable.js
   * — trước đây chỉ có `location` gộp nên KHÔNG tự điền được, để trống
   * "Trường" ở mọi tiết của buổi 2-trường, đúng lỗi người dùng gặp: tiết
   * 4 chiều Thứ 4 hiện mã lớp nhưng thiếu tên trường). */
  function mergeSecondarySchoolColumn(primary, secondary) {
    const hasSecondary = secondary.type || secondary.location || secondary.periods.some(Boolean);
    if (!hasSecondary) return primary;
    const schools = [];
    M.splitLocations(primary.location).forEach((s) => { if (!schools.includes(s)) schools.push(s); });
    M.splitLocations(secondary.location).forEach((s) => { if (!schools.includes(s)) schools.push(s); });
    return {
      type: primary.type || secondary.type,
      location: M.joinLocations(schools),
      periods: primary.periods.map((p, i) => p || secondary.periods[i] || ''),
      periodSchools: primary.periods.map((p, i) => (p ? primary.location : (secondary.periods[i] ? secondary.location : ''))),
    };
  }

  function computeWeekKeyFromLabel(label, fallbackSheetName) {
    const m = String(label || '').match(/(\d{1,2})\.(\d{1,2})/);
    const y = String(label || '').match(/(\d{4})/);
    if (m && y) {
      const day = m[1].padStart(2, '0');
      const month = m[2].padStart(2, '0');
      return `${y[1]}-${month}-${day}`;
    }
    // Không đọc được ngày từ nhãn → dùng chính tên sheet làm khoá tạm (vẫn
    // nhập được, chỉ là không tự sắp đúng thứ tự thời gian trong dropdown).
    return 'sheet-' + String(fallbackSheetName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function parseWorkbookSheet(rows, sheetName) {
    let headerRowIdx = -1;
    for (let r = 0; r < rows.length; r++) {
      if ((rows[r] || []).some((cell) => String(cell ?? '').trim() === 'MÃ NV')) { headerRowIdx = r; break; }
    }
    // Không tìm thấy hàng tiêu đề "MÃ NV" — KHÔNG hẳn là lỗi, sheet mẫu/ghi
    // chú/hướng dẫn kèm trong file gốc cũng rơi vào đây. reason:'no-header'
    // để modal xác nhận hiện rõ TÊN + LÝ DO thay vì chỉ 1 con số như trước
    // (người dùng phản hồi không biết "7 Sheet bỏ qua" là sheet nào/vì sao).
    if (headerRowIdx === -1) return { reason: 'no-header' };

    let weekLabel = '';
    for (let r = 0; r < headerRowIdx && !weekLabel; r++) {
      for (const cell of rows[r] || []) {
        const s = String(cell ?? '');
        if (/tuần/i.test(s)) { weekLabel = s.replace(/^.*?tuần\s*/i, '').trim(); break; }
      }
    }
    if (!weekLabel) weekLabel = sheetName;
    const weekKey = computeWeekKeyFromLabel(weekLabel, sheetName);

    const teachers = [];
    let r = headerRowIdx + 1;
    let consecutiveEmpty = 0;
    while (r + BLOCK_ROWS <= rows.length && consecutiveEmpty < 2) {
      const block = rows.slice(r, r + BLOCK_ROWS);
      const code = String(block[0][0] ?? '').trim();
      const name = String(block[0][1] ?? '').trim();
      if (!code) { consecutiveEmpty++; r += BLOCK_ROWS; continue; }
      consecutiveEmpty = 0;
      const phone = String(block[0][2] ?? '').trim();
      const address = String(block[0][3] ?? '').trim();

      const days = {};
      WEEKDAY_COL_IDX.forEach((col, wi) => {
        const weekday = wi + 2;
        const cell = (row, c) => String((rows[0] && block[row] && block[row][c]) ?? '').trim();
        const readSession = (typeRow, locRow, periodRows, c) => ({
          type: cell(typeRow, c), location: cell(locRow, c),
          periods: periodRows.map((rr) => cell(rr, c)),
        });
        const morningPrimary = readSession(0, 1, [2, 3, 4, 5, 6], col);
        const morningSecondary = readSession(0, 1, [2, 3, 4, 5, 6], col + 1);
        const afternoonPrimary = readSession(7, 8, [9, 10, 11, 12, 13], col);
        const afternoonSecondary = readSession(7, 8, [9, 10, 11, 12, 13], col + 1);
        days[String(weekday)] = {
          morning: mergeSecondarySchoolColumn(morningPrimary, morningSecondary),
          afternoon: mergeSecondarySchoolColumn(afternoonPrimary, afternoonSecondary),
        };
      });

      teachers.push({ code, name, phone, address, days });
      r += BLOCK_ROWS;
    }

    // Có hàng "MÃ NV" nhưng không đọc được giáo viên nào — khác hẳn
    // 'no-header' (đây LÀ sheet lịch tuần thật, chỉ là cấu trúc khối 14
    // dòng/cột G,I,K,M,O,Q không khớp, vd sai dòng/thiếu cột) — đáng để
    // người nhập kiểm tra lại file, không nên im lặng bỏ qua như nhau.
    return { weekKey, weekLabel, teachers, reason: teachers.length ? null : 'no-teachers' };
  }

  /** Parse 1 workbook (ArrayBuffer) thành { weeks, skippedSheets } và mở
   * modal xác nhận nhập — dùng CHUNG cho cả 2 nguồn: chọn file .xlsx thủ
   * công (importExcelInput) và tải trực tiếp từ SharePoint
   * (syncSharePointBtn, xem js/services/sharepoint-sync.js) để không lặp
   * lại logic đọc/parse Excel. */
  function parseWorkbookArrayBufferAndOpenImport(arrayBuffer) {
    if (!window.XLSX) { toast('⚠️ Chưa tải được thư viện đọc Excel, kiểm tra mạng rồi thử lại.'); return; }
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const weeks = [];
    const skippedSheets = [];
    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const parsed = parseWorkbookSheet(rows, sheetName);
      if (parsed && parsed.teachers && parsed.teachers.length) weeks.push(parsed);
      else skippedSheets.push({ name: sheetName, reason: (parsed && parsed.reason) || 'no-header' });
    });
    if (!weeks.length) { toast('⚠️ Không tìm thấy sheet lịch tuần hợp lệ nào trong file (thiếu cột "MÃ NV").'); return; }

    pendingImport = { weeks, skippedSheets };
    const teacherCount = new Set(weeks.flatMap((w) => w.teachers.map((t) => t.code))).size;
    document.getElementById('importSummary').classList.remove('force-hide');
    document.getElementById('importWeekCount').textContent = weeks.length;
    document.getElementById('importTeacherCount').textContent = teacherCount;
    const skippedStat = document.getElementById('importSkippedStat');
    skippedStat.hidden = skippedSheets.length === 0;
    document.getElementById('importSkippedCount').textContent = skippedSheets.length;
    const REASON_LABEL = {
      'no-header': 'Không thấy hàng tiêu đề "MÃ NV" — thường là sheet mẫu/ghi chú/hướng dẫn, không phải lịch tuần.',
      'no-teachers': 'Có hàng "MÃ NV" nhưng không đọc được giáo viên nào — kiểm tra lại cấu trúc file (đúng khối 14 dòng/GV, 6 cột Thứ2-Thứ7 cách nhau 2 cột).',
    };
    const skippedList = document.getElementById('importSkippedList');
    if (skippedList) {
      skippedList.innerHTML = skippedSheets.map((s) =>
        `<li><b>${esc(s.name)}</b> — ${esc(REASON_LABEL[s.reason] || s.reason)}</li>`
      ).join('');
      skippedList.hidden = skippedSheets.length === 0;
    }
    document.getElementById('importConfirmBtn').disabled = false;
    document.getElementById('importModalOverlay').classList.add('show');
  }

  document.getElementById('importExcelBtn').addEventListener('click', () => document.getElementById('importExcelInput').click());
  document.getElementById('importExcelInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.XLSX) { toast('⚠️ Chưa tải được thư viện đọc Excel, kiểm tra mạng rồi thử lại.'); return; }
    const reader = new FileReader();
    reader.onerror = () => toast('⚠️ Không đọc được file, thử lại.');
    reader.onload = (ev) => {
      try {
        parseWorkbookArrayBufferAndOpenImport(ev.target.result);
      } catch (err) {
        toast('⚠️ ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Đồng bộ trực tiếp từ file Excel trên SharePoint (không cần tải về máy
  // rồi upload lại thủ công) — đăng nhập Microsoft ngay trên trình duyệt
  // qua MSAL.js, xem js/services/sharepoint-sync.js để biết cách cấu hình.
  const syncSharePointBtn = document.getElementById('syncSharePointBtn');
  if (syncSharePointBtn) {
    syncSharePointBtn.addEventListener('click', async () => {
      if (!window.EduSharePointSync) { toast('⚠️ Chưa tải được module đồng bộ SharePoint.'); return; }
      syncSharePointBtn.disabled = true;
      const originalText = syncSharePointBtn.textContent;
      syncSharePointBtn.textContent = '⏳ Đang tải từ SharePoint...';
      try {
        const arrayBuffer = await window.EduSharePointSync.fetchLatestWorkbookArrayBuffer();
        parseWorkbookArrayBufferAndOpenImport(arrayBuffer);
      } catch (err) {
        toast('⚠️ ' + err.message);
      } finally {
        syncSharePointBtn.disabled = false;
        syncSharePointBtn.textContent = originalText;
      }
    });
  }

  function closeImportModal() {
    document.getElementById('importModalOverlay').classList.remove('show');
    document.getElementById('importSummary').classList.add('force-hide');
    document.getElementById('importConfirmBtn').disabled = true;
    pendingImport = null;
  }
  document.getElementById('importModalCloseBtn').addEventListener('click', closeImportModal);
  document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
  document.getElementById('importModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'importModalOverlay') closeImportModal();
  });

  /** Dựng 5 ô-tiết {maLop,truong} (đúng schema TeachingTimetable Cell) cho
   * 1 buổi, từ ĐÚNG session đã đọc ở "Lịch tuần" (periods[] + periodSchools[]
   * nếu buổi đó dạy 2 trường, xem mergeSecondarySchoolColumn()) — dùng để tự
   * điền tab "🗓️ TKB lớp" NGAY LÚC NHẬP EXCEL, khỏi phải mở riêng tab đó rồi
   * bấm Lưu thêm 1 lần nữa mới ra đúng "Trường" từng tiết (đúng điều người
   * dùng phản hồi: "phải cập nhật thủ công" sau khi nhập Excel). */
  function sessionToTimetableCells(sess) {
    const periods = sess.periods || [];
    const periodSchools = sess.periodSchools || [];
    return [0, 1, 2, 3, 4].map((i) => {
      const maLop = typeof periods[i] === 'string' ? periods[i].trim() : '';
      if (!maLop) return { maLop: '', truong: '' };
      const truong = (periodSchools[i] || sess.location || '').trim();
      return { maLop, truong };
    });
  }

  document.getElementById('importConfirmBtn').addEventListener('click', async () => {
    if (!pendingImport) return;
    const btn = document.getElementById('importConfirmBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang nhập...';
    try {
      const db = window.EduFirebase.db;
      const teacherCol = window.EduRepositories.teachingTeacher.col();
      const weekCol = window.EduRepositories.teachingWeek.col();
      const schedCol = window.EduRepositories.teachingSchedule.col();
      const TTM = window.EduModels.TeachingTimetable;
      const ttCol = TTM ? window.EduRepositories.teachingTimetable.col() : null;

      const knownTeacherCodes = new Set(state.teachers.map((t) => t.id));
      const knownWeekKeys = new Set(state.weeks.map((w) => w.id));

      // Đọc TRƯỚC toàn bộ TKB lớp ĐÃ CÓ của đúng các giáo viên/tuần sắp
      // nhập — CHỈ điền vào Ô-TIẾT nào TKB lớp đang TRỐNG (không mã lớp),
      // giữ nguyên mọi ô Admin đã gõ tay khác đi trước đó (TKB lớp vẫn là
      // nguồn chi tiết hơn — nhập Excel không được phép ghi đè dữ liệu đã
      // tinh chỉnh thủ công ở đó, chỉ tự điền chỗ còn thiếu).
      const existingTtById = new Map();
      if (ttCol) {
        const pairs = [];
        pendingImport.weeks.forEach((week) => week.teachers.forEach((t) => pairs.push({ code: t.code, weekKey: week.weekKey })));
        await Promise.all(pairs.map(async ({ code, weekKey }) => {
          const id = TTM.docId(code, weekKey);
          const doc = await window.EduRepositories.teachingTimetable.getById(id);
          if (doc) existingTtById.set(id, doc);
        }));
      }

      let batch = db.batch();
      let ops = 0;
      const flushIfNeeded = async () => { if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } };

      for (const week of pendingImport.weeks) {
        if (!knownWeekKeys.has(week.weekKey)) {
          batch.set(weekCol.doc(week.weekKey), M.buildWeek({ label: week.weekLabel }));
          knownWeekKeys.add(week.weekKey);
          ops++; await flushIfNeeded();
        }
        for (const t of week.teachers) {
          if (!knownTeacherCodes.has(t.code)) {
            batch.set(teacherCol.doc(t.code), M.buildTeacher(t));
            knownTeacherCodes.add(t.code);
            ops++; await flushIfNeeded();
          }
          const docId = M.scheduleDocId(t.code, week.weekKey);
          batch.set(schedCol.doc(docId), {
            teacherCode: t.code, teacherName: t.name,
            weekKey: week.weekKey, weekLabel: week.weekLabel,
            days: t.days, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          ops++; await flushIfNeeded();

          if (ttCol) {
            const ttId = TTM.docId(t.code, week.weekKey);
            const existingTt = existingTtById.get(ttId);
            const existingDays = (existingTt && existingTt.days) || {};
            const ttDays = {};
            M.WEEKDAYS.forEach((d) => {
              const daySess = t.days[String(d)] || {};
              const existingDay = existingDays[String(d)] || {};
              ttDays[String(d)] = {};
              ['morning', 'afternoon'].forEach((s) => {
                const fromExcel = sessionToTimetableCells(daySess[s] || {});
                const existingCells = (existingDay[s] || []).map((c) => TTM.cellOf(c));
                // Ô nào TKB lớp đã có mã lớp thì GIỮ NGUYÊN; ô nào đang
                // trống mới lấy dữ liệu vừa đọc từ Excel — merge tự nhiên,
                // không mất dữ liệu Admin đã tinh chỉnh riêng ở TKB lớp.
                ttDays[String(d)][s] = fromExcel.map((cell, i) => {
                  const existing = existingCells[i];
                  return (existing && existing.maLop) ? existing : cell;
                });
              });
            });
            batch.set(ttCol.doc(ttId), {
              teacherCode: t.code, teacherName: t.name,
              weekKey: week.weekKey, weekLabel: week.weekLabel,
              days: ttDays, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            ops++; await flushIfNeeded();
          }
        }
      }
      if (ops > 0) await batch.commit();

      toast(`✅ Đã nhập ${pendingImport.weeks.length} tuần / ${new Set(pendingImport.weeks.flatMap((w) => w.teachers.map((t) => t.code))).size} giáo viên${ttCol ? ' (đã tự điền cả TKB lớp)' : ''}`);
      closeImportModal();
      await loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Nhập dữ liệu';
    }
  });
})();
