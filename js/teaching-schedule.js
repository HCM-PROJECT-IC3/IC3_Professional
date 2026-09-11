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
   - coordinator (Điều phối đào tạo): KHÔNG được vào trang này nữa (chặn ở
     EDU_ALLOWED_ROLES của teaching-schedule.html + firestore.rules) — các
     đoạn code còn lại trong file chỉ còn phân biệt admin/teacher.

   Kiến trúc theo đúng mẫu roster-manager.js: models/repositories đã
   tách riêng (js/models/teaching-schedule.model.js,
   js/repositories/teaching-schedule-repository.js), file này chỉ lo
   UI + điều phối gọi repository.
   ============================================================ */
(function () {
  'use strict';

  const M = window.EduModels.TeachingSchedule;

  // ---- State cục bộ ----
  const state = {
    role: '',              // 'admin' | 'coordinator' | 'teacher'
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
  /** true khi tài khoản đăng nhập là giáo viên — trang chuyển sang khối
   * "Lịch của tôi" (renderMyWeekView) thay vì bảng tổng hợp nhiều GV; giáo
   * viên TỰ CẬP NHẬT được đúng lịch của mình, quyền ghi thật sự vẫn do
   * firestore.rules chốt (chỉ đúng teacherCode == chính mình). */
  function isTeacherRole() { return state.role === 'teacher'; }

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
    loadEverything();
  });

  /** Ẩn/khoá các chức năng quản lý nhiều GV (chỉ admin) khi tài khoản đăng
   * nhập là giáo viên, thay bằng khối "Lịch của tôi" (thẻ theo ngày,
   * sửa/lưu trực tiếp — xem renderMyWeekView()). Quyền ghi thật sự vẫn do
   * firestore.rules chốt (chỉ đúng teacherCode == chính mình), đây chỉ là
   * lớp UX. */
  function applyRoleUI() {
    const hide = (id) => { const el = document.getElementById(id); if (el) el.classList.add('force-hide'); };
    const show = (id) => { const el = document.getElementById(id); if (el) el.classList.remove('force-hide'); };
    if (!isTeacherRole()) return;
    // Toàn bộ sidebar + khối chính (Tổng quan/Thẻ) chỉ dành cho admin quản
    // lý NHIỀU giáo viên — giáo viên chỉ cần đúng 1 khối "Lịch của tôi"
    // full-width bên dưới, ẩn nguyên khối cha 1 lần thay vì ẩn từng phần
    // tử con riêng lẻ.
    hide('weeklyLayout');
    show('myWeekWrap');
    // Banner giới thiệu riêng cho giáo viên đã bị bỏ (chiếm quá nhiều chỗ
    // phía trên lưới thẻ) — dồn hướng dẫn vào đúng nút ℹ️ sẵn có ở tiêu đề
    // (admin/teacher dùng chung 1 nút, chỉ đổi nội dung tooltip theo role).
    const infoBtn = document.querySelector('.topbar .info-btn');
    if (infoBtn) {
      infoBtn.title = 'Tự cập nhật lịch làm việc/giảng dạy hàng tuần của chính bạn ngay tại đây — chọn loại '
        + 'hình phụ trách cho từng buổi Sáng/Chiều, điền địa điểm và lớp đang dạy, rồi bấm "💾 Lưu lịch tuần của tôi". '
        + 'Có thắc mắc về lịch, liên hệ Admin.';
    }
  }

  async function loadEverything() {
    try {
      let teachers, weeks;
      if (isTeacherRole()) {
        // Giáo viên: firestore.rules chỉ cho đọc ĐÚNG 1 document
        // teaching_teachers của chính mình — không được list() cả collection.
        const [me, allWeeks] = await Promise.all([
          state.myTeacherCode ? window.EduRepositories.teachingTeacher.getById(state.myTeacherCode) : Promise.resolve(null),
          window.EduRepositories.teachingWeek.listAll(),
        ]);
        teachers = me ? [me] : [];
        weeks = allWeeks;
      } else {
        [teachers, weeks] = await Promise.all([
          window.EduRepositories.teachingTeacher.list({ orderBy: 'name' }),
          window.EduRepositories.teachingWeek.listAll(),
        ]);
      }
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
      const TTM = window.EduModels.TeachingTimetable;
      if (isTeacherRole()) {
        if (state.myTeacherCode) {
          const [doc, ttDoc] = await Promise.all([
            window.EduRepositories.teachingSchedule.getById(M.scheduleDocId(state.myTeacherCode, weekKey)),
            TT && TTM ? TT.getById(TTM.docId(state.myTeacherCode, weekKey)) : Promise.resolve(null),
          ]);
          if (doc) state.schedulesByTeacher[state.myTeacherCode] = doc;
          if (ttDoc) state.timetablesByTeacher[state.myTeacherCode] = ttDoc;
        }
      } else {
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
      }
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
    const truongRow = hasType && sess.location ? `<div class="tc-chip-truong">${esc(sess.location)}</div>` : '';
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
    if (isTeacherRole()) { renderMyWeekView(); return; }

    const cardsContainer = document.getElementById('weeklyCards');
    const progressBar = document.getElementById('weekProgressBar');
    if (!state.currentWeekKey) {
      const msg = '<div class="empty-cell">Chưa có tuần nào — bấm "🧬 Tuần mới" hoặc "📥 Nhập từ Excel" để bắt đầu.</div>';
      cardsContainer.innerHTML = msg;
      document.getElementById('dashMatrixBody').innerHTML = `<tr><td colspan="9" class="empty-cell">${msg.replace(/<[^>]+>/g, '')}</td></tr>`;
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
      return `<div class="teacher-card${missing ? ' missing' : ''}">
        <div class="teacher-card-header">
          <div class="teacher-avatar">${esc(initialsOf(t.name))}</div>
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
          <button type="button" class="btn btn-ghost" data-edit-sched="${esc(t.code)}">✏️ Sửa lịch</button>
          <button type="button" class="btn btn-ghost" data-pdf-sched="${esc(t.code)}" title="Xuất lịch tuần của ${esc(t.name)} ra PDF">🖨️ PDF</button>
          <button type="button" class="btn btn-ghost" data-congtac-sched="${esc(t.code)}" title="Xuất Phiếu công tác của ${esc(t.name)} (tự điền theo lịch tuần này)">📋 Phiếu công tác</button>
        </div>
      </div>`;
    }).join('');

    cardsContainer.querySelectorAll('[data-edit-sched]').forEach((b) => b.addEventListener('click', () => openSchedModal(b.dataset.editSched)));
    cardsContainer.querySelectorAll('[data-pdf-sched]').forEach((b) => b.addEventListener('click', () => exportTeacherPdf(b.dataset.pdfSched)));
    cardsContainer.querySelectorAll('[data-congtac-sched]').forEach((b) => b.addEventListener('click', () => openCongTacModalFor(b.dataset.congtacSched)));
  }

  // Tên viết tắt cho ô mini trong ma trận — chấm tròn trước đây không đọc
  // được gì (phải hover từng chấm mới biết loại hình), đổi sang chip CÓ
  // CHỮ (viết tắt gọn, tooltip vẫn đủ chi tiết đầy đủ khi hover) để nhìn
  // là biết ngay đang bận gì, không cần rà chuột qua từng ô.
  const TYPE_ABBR = {
    'Dạy chính': 'Chính', 'Dạy Trám': 'Trám', 'Dạy Trực Tuyến': 'Online',
    'Ôn Thi': 'Ôn thi', 'Trợ Giảng': 'TG', 'Dự Giảng': 'DG',
    'Soạn bài': 'Soạn', 'Làm việc tại cty': 'Cty', 'WFH': 'WFH',
    'Khám SK': 'SK', 'Nghỉ phép/ lễ': 'Nghỉ',
  };

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
      // Kèm CHỮ viết tắt loại hình (vd "Chính · 5/2") ngay trong chip —
      // chỉ dựa vào MÀU rất dễ nhầm giữa Dạy chính/Dạy Trám/Dự Giảng...
      // (nhất là người mới xem lần đầu, chưa quen bảng màu), có chữ thì
      // không cần nhớ màu vẫn đọc đúng ngay.
      const label = hasType ? `${TYPE_ABBR[sess.type] || sess.type} · ${value}` : value;
      const title = hasType ? `${sess.type} · ${value}` : value;
      return `<span class="dash-chip ${suffix}" title="${esc(title)}">${esc(label)}</span>`;
    }
    // Loại hình không tách theo tiết (Cty/WFH/Soạn bài/Nghỉ phép.../Khám
    // SK) — hiện đúng 1 lần ở tiết đầu buổi để biết cả buổi đang bận gì.
    if (isFirstPeriod && sess && sess.type && NON_PERIOD_TYPES.has(sess.type)) {
      const suffix = typeColorSuffix(sess.type) || 'prep';
      return `<span class="dash-chip ${suffix}" title="${esc(sess.type)}">${esc(TYPE_ABBR[sess.type] || sess.type)}</span>`;
    }
    return '<span class="dash-chip-off">—</span>';
  }

  /** "📊 Tổng quan" — MỖI GIÁO VIÊN TÁCH THÀNH NHIỀU HÀNG, 1 hàng/tiết,
   * đúng số tiết + giờ giấc lấy từ khung giờ đã cấu hình ở tab "🗓️ TKB
   * lớp" (⏱️ Giờ tiết — mặc định 5 tiết Sáng/4 tiết Chiều nếu GV chưa tự
   * cấu hình riêng). 2 cột "Buổi" (tô cam/xanh lá như TKB) và "Thời gian"
   * ghim ngay cạnh cột tên — nhìn 1 hàng là biết NGAY tiết mấy, mấy giờ,
   * buổi nào, đang dạy lớp gì ở từng Thứ, không cần suy luận hay hover.
   * Hàng của GV chưa nhập lịch tự tô nền vàng nhạt (.dash-row-missing). */
  /** Bảng chú thích màu loại hình (1 lần, tĩnh) — đối chiếu nhanh khi lỡ
   * quên màu nào là loại hình gì, giảm nguy cơ nhầm giữa Dạy chính/Dạy
   * Trám/Dự Giảng/Trợ Giảng... vốn chỉ khác nhau ở màu chip. */
  function renderDashLegend() {
    const el = document.getElementById('dashLegend');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';
    el.innerHTML = Object.keys(TYPE_COLOR_SUFFIX).map((type) => {
      const suffix = TYPE_COLOR_SUFFIX[type];
      const abbr = TYPE_ABBR[type] || type;
      return `<span class="dash-legend-item"><span class="dash-legend-swatch ${suffix}"></span>${esc(abbr)} = ${esc(type)}</span>`;
    }).join('');
  }

  function renderDashboardView(teachers, daysOf) {
    renderDashLegend();
    const tbody = document.getElementById('dashMatrixBody');
    const TTM = window.EduModels.TeachingTimetable;
    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">Không có giáo viên khớp tìm kiếm.</td></tr>';
    } else {
      const sorted = [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      const rowsHtml = [];
      sorted.forEach((t) => {
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
        const nameCellContent = `<div class="dash-matrix-teacher">
            <div class="dash-matrix-avatar">${esc(initialsOf(t.name))}</div>
            <div class="dash-matrix-name-info">
              <div class="dash-matrix-name">${esc(t.name)}</div>
              <div class="dash-matrix-code">${esc(t.code)}${missingT ? ' · <span class="tc-missing-tag">chưa có lịch</span>' : ''}</div>
            </div>
            <div class="dash-matrix-name-actions">
              <button type="button" class="dash-name-action-btn" data-edit-sched="${esc(t.code)}" title="Sửa lịch của ${esc(t.name)}">✏️</button>
              <button type="button" class="dash-name-action-btn" data-pdf-sched="${esc(t.code)}" title="Xuất PDF lịch của ${esc(t.name)}">🖨️</button>
              <button type="button" class="dash-name-action-btn" data-congtac-sched="${esc(t.code)}" title="Xuất Phiếu công tác của ${esc(t.name)}">📋</button>
            </div>
          </div>
          <div class="dash-matrix-stats">
            <span><b>${stats.periodsMain}</b> tiết chính</span>
            <span><b>${stats.periodsSub}</b> tiết trám</span>
          </div>`;

        // Khung giờ tiết CỦA GIÁO VIÊN này (áp dụng mọi tuần, không lặp lại
        // theo tuần) — nếu module TKB lớp chưa kịp nạp thì vẫn không vỡ
        // trang, chỉ hiện 1 hàng gộp fallback bên dưới.
        const pt = TTM ? TTM.clonePeriodTimes(state.periodTimesByTeacher[t.code]) : null;
        const blocks = pt ? TTM.SESSIONS.map((sessionKey) => ({ sessionKey, periods: pt[sessionKey] || [] })).filter((b) => b.periods.length) : [];

        if (!blocks.length) {
          // Fallback: không có TTM (lỗi tải module) — vẫn hiện 1 hàng/GV
          // như bản cũ, tối thiểu để trang không trắng xoá.
          rowsHtml.push(`<tr class="${missingClass}">
            <td class="dash-matrix-name-col">${nameCellContent}</td>
            <td class="dash-matrix-buoi-cell">—</td><td class="dash-matrix-time-cell">—</td>
            ${M.WEEKDAYS.map((d) => `<td class="dash-matrix-cell" data-day="${d}"><span class="dash-chip-off">—</span></td>`).join('')}
          </tr>`);
          return;
        }

        const totalRows = blocks.reduce((sum, b) => sum + b.periods.length, 0);
        let nameCellWritten = false;
        blocks.forEach((block, blockIdx) => {
          block.periods.forEach((p, pi) => {
            const dayCells = M.WEEKDAYS.map((d) => {
              const day = days[String(d)] || M.emptyDay();
              const val = periodValueAt(t.code, day, d, block.sessionKey, pi);
              return `<td class="dash-matrix-cell" data-day="${d}">${dashPeriodCell(day[block.sessionKey], val, pi === 0)}</td>`;
            }).join('');
            const nameCellHtml = !nameCellWritten ? `<td class="dash-matrix-name-col" rowspan="${totalRows}">${nameCellContent}</td>` : '';
            nameCellWritten = true;
            const buoiCellHtml = pi === 0
              ? `<td class="dash-matrix-buoi-cell dash-sess-${block.sessionKey}" rowspan="${block.periods.length}">${block.sessionKey === 'morning' ? '☀️ Sáng' : '🌙 Chiều'}</td>`
              : '';
            rowsHtml.push(`<tr class="${missingClass}">${nameCellHtml}${buoiCellHtml}<td class="dash-matrix-time-cell">${esc(p.start)} - ${esc(p.end)}</td>${dayCells}</tr>`);
          });
        });
      });
      tbody.innerHTML = rowsHtml.join('');
      tbody.querySelectorAll('[data-edit-sched]').forEach((b) => b.addEventListener('click', () => openSchedModal(b.dataset.editSched)));
      tbody.querySelectorAll('[data-pdf-sched]').forEach((b) => b.addEventListener('click', () => exportTeacherPdf(b.dataset.pdfSched)));
      tbody.querySelectorAll('[data-congtac-sched]').forEach((b) => b.addEventListener('click', () => openCongTacModalFor(b.dataset.congtacSched)));
    }

    // ---- Đánh dấu cột "hôm nay" trong ma trận (nếu tuần đang xem CHỨA
    // ngày hôm nay) — giúp điều phối đào tạo định vị nhanh "đang ở đâu
    // trong tuần" mà không cần đối chiếu lịch riêng. ----
    const isCurrentWeek = state.currentWeekKey === M.todayWeekKey();
    const jsDow = new Date().getDay(); // 0=CN,1=T2,...6=T7
    const todayDayNum = isCurrentWeek && jsDow >= 1 && jsDow <= 6 ? jsDow + 1 : null;
    M.WEEKDAYS.forEach((d) => {
      document.getElementById(`dashDayHead${d}`)?.classList.toggle('today-col', d === todayDayNum);
    });
    document.querySelectorAll('.dash-matrix-cell[data-day]').forEach((td) => {
      td.classList.toggle('today-col', Number(td.dataset.day) === todayDayNum);
    });
  }

  /** Xuất PDF lịch tuần của ĐÚNG 1 giáo viên (nút "🖨️ PDF" từng hàng). */
  function exportTeacherPdf(teacherCode) {
    const t = state.teachers.find((x) => x.id === teacherCode);
    if (!t) return;
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const days = (state.schedulesByTeacher[teacherCode] && state.schedulesByTeacher[teacherCode].days) || M.emptyDays();
    if (!window.EduTeachingSchedulePdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    window.EduTeachingSchedulePdf.exportOne(t, days, week ? (week.label || week.id) : state.currentWeekKey, M);
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
   * (đã áp bộ lọc tìm kiếm/"chỉ hiện GV chưa có lịch" hiện tại), mỗi giáo
   * viên 1 trang — nút "🖨️ Xuất PDF tất cả" trên thanh công cụ. */
  function exportAllPdf() {
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    if (!window.EduTeachingSchedulePdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    const list = filteredTeachersWithDays();
    if (!list.length) { toast('⚠️ Không có giáo viên nào để xuất (kiểm tra lại bộ lọc/tìm kiếm).'); return; }
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const weekLabel = week ? (week.label || week.id) : state.currentWeekKey;
    window.EduTeachingSchedulePdf.exportMany(list, weekLabel, M);
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

  document.getElementById('myWeekPdfBtn')?.addEventListener('click', () => {
    if (!state.myTeacherCode || !state.currentWeekKey || !state.myWeekDraft) return;
    const t = state.teachers.find((x) => x.id === state.myTeacherCode);
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    if (!window.EduTeachingSchedulePdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    // Xuất đúng những gì đang hiển thị trên màn hình (kể cả thay đổi CHƯA
    // lưu) — giáo viên có thể muốn xem trước bản in trước khi bấm Lưu.
    window.EduTeachingSchedulePdf.exportOne(t || { code: state.myTeacherCode, name: '' }, state.myWeekDraft, week ? (week.label || week.id) : state.currentWeekKey, M);
  });

  // ------------------------------------------------------------
  // MODAL: "📋 Phiếu công tác" — mẫu On_Tap_MOS/Phieu cong tac.doc, tự điền
  // theo đúng Lịch tuần (xem js/export/teaching-schedule-cong-tac-pdf.js).
  // Dùng CHUNG 1 modal cho 3 lối vào: giáo viên tự xuất phiếu của chính
  // mình ("Lịch của tôi"), admin xuất phiếu thay cho 1 giáo viên cụ thể
  // (nút 📋 trên từng thẻ/hàng ở "📊 Tổng quan"/"🎴 Thẻ"), và admin xuất
  // HÀNG LOẠT mọi giáo viên đang hiển thị vào 1 file duy nhất ("📋 Xuất PDF
  // tất cả Phiếu công tác" trên thanh công cụ) — congTacTarget (1 giáo
  // viên) HOẶC congTacBulk (nhiều giáo viên) ghi nhớ ĐÚNG dữ liệu sắp
  // xuất, set trước khi mở modal, đọc lại khi bấm Xuất PDF trong modal.
  // Chỉ hỏi đúng 1 lựa chọn "Mục đích" (Giảng dạy/Ôn Thi — 2 giá trị duy
  // nhất mẫu gốc dùng, áp dụng chung cho MỌI giáo viên nếu xuất hàng loạt
  // — không có cách nào chọn riêng mục đích từng người trong 1 lần xuất),
  // mọi field còn lại tự điền, không hỏi thêm gì khác.
  // ------------------------------------------------------------
  let congTacTarget = null; // { teacher, days, weekLabel, weekKey } của lần mở modal gần nhất — chế độ 1 giáo viên
  let congTacBulk = null;   // { list:[{teacher,days}], weekLabel, weekKey } — chế độ xuất hàng loạt
  function openCongTacModal() {
    const info = document.getElementById('congTacModalTeacher');
    if (info) {
      if (congTacBulk) info.textContent = `👥 ${congTacBulk.list.length} giáo viên · 🗓️ Tuần: ${congTacBulk.weekLabel}`;
      else if (congTacTarget) info.textContent = `👤 ${congTacTarget.teacher.name || congTacTarget.teacher.code} · 🗓️ Tuần: ${congTacTarget.weekLabel}`;
    }
    document.getElementById('congTacModalOverlay').classList.add('show');
  }
  function closeCongTacModal() {
    document.getElementById('congTacModalOverlay').classList.remove('show');
    congTacTarget = null;
    congTacBulk = null;
  }
  document.getElementById('myWeekCongTacBtn')?.addEventListener('click', () => {
    if (!state.myTeacherCode || !state.currentWeekKey || !state.myWeekDraft) { toast('⚠️ Chưa có lịch tuần để xuất.'); return; }
    const t = state.teachers.find((x) => x.id === state.myTeacherCode);
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    congTacTarget = {
      teacher: t || { code: state.myTeacherCode, name: '' },
      days: state.myWeekDraft, // đúng những gì đang hiển thị trên màn hình, kể cả thay đổi CHƯA lưu
      weekLabel: week ? (week.label || week.id) : state.currentWeekKey,
      weekKey: state.currentWeekKey, // để suy ra ngày dương lịch cụ thể trong mục "Thời gian"
    };
    openCongTacModal();
  });
  /** Admin/điều phối bấm nút 📋 trên 1 thẻ/hàng giáo viên cụ thể (khác
   * "Lịch của tôi" — không có bản nháp đang sửa dở, luôn dùng đúng dữ liệu
   * ĐÃ LƯU trong state.schedulesByTeacher của tuần đang chọn). */
  function openCongTacModalFor(teacherCode) {
    const t = state.teachers.find((x) => x.id === teacherCode || x.code === teacherCode);
    if (!t) return;
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    const days = (state.schedulesByTeacher[teacherCode] && state.schedulesByTeacher[teacherCode].days) || M.emptyDays();
    congTacTarget = {
      teacher: t, days,
      weekLabel: week ? (week.label || week.id) : state.currentWeekKey,
      weekKey: state.currentWeekKey,
    };
    openCongTacModal();
  }
  /** Nút "📋 Xuất PDF tất cả Phiếu công tác" — cùng bộ lọc GV đang hiển thị
   * với "🖨️ Xuất PDF tất cả" (Lịch tuần), chỉ khác đầu ra là Phiếu công
   * tác, gộp mọi giáo viên vào 1 file duy nhất (xem exportMany() trong
   * js/export/teaching-schedule-cong-tac-pdf.js). */
  document.getElementById('exportAllCongTacBtn')?.addEventListener('click', () => {
    if (!state.currentWeekKey) { toast('⚠️ Hãy chọn 1 tuần trước.'); return; }
    const list = filteredTeachersWithDays();
    if (!list.length) { toast('⚠️ Không có giáo viên nào để xuất (kiểm tra lại bộ lọc/tìm kiếm).'); return; }
    const week = state.weeks.find((w) => w.id === state.currentWeekKey);
    congTacBulk = { list, weekLabel: week ? (week.label || week.id) : state.currentWeekKey, weekKey: state.currentWeekKey };
    openCongTacModal();
  });
  document.getElementById('congTacCloseBtn')?.addEventListener('click', closeCongTacModal);
  document.getElementById('congTacCancelBtn')?.addEventListener('click', closeCongTacModal);
  document.getElementById('congTacModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'congTacModalOverlay') closeCongTacModal();
  });
  document.getElementById('congTacConfirmBtn')?.addEventListener('click', () => {
    if (!congTacTarget && !congTacBulk) return;
    if (!window.EduCongTacPdf) { toast('⚠️ Chưa tải được thư viện xuất PDF, kiểm tra mạng rồi thử lại.'); return; }
    const purpose = document.getElementById('f-cong-tac-purpose').value;
    if (congTacBulk) {
      window.EduCongTacPdf.exportMany(congTacBulk.list, congTacBulk.weekKey, M, purpose, congTacBulk.weekLabel);
    } else {
      const { teacher, days, weekLabel, weekKey } = congTacTarget;
      window.EduCongTacPdf.exportOne(teacher, days, weekLabel, weekKey, M, purpose);
    }
    closeCongTacModal();
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
  // ============================================================
  const WEEKDAY_COL_IDX = [6, 8, 10, 12, 14, 16]; // 0-based, ứng với Thứ2..Thứ7
  const BLOCK_ROWS = 14;

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
    if (headerRowIdx === -1) return null; // không phải sheet lịch tuần (vd sheet mẫu trống) → bỏ qua

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
        days[String(weekday)] = {
          morning: {
            type: cell(0, col), location: cell(1, col),
            periods: [2, 3, 4, 5, 6].map((rr) => cell(rr, col)),
          },
          afternoon: {
            type: cell(7, col), location: cell(8, col),
            periods: [9, 10, 11, 12, 13].map((rr) => cell(rr, col)),
          },
        };
      });

      teachers.push({ code, name, phone, address, days });
      r += BLOCK_ROWS;
    }

    return { weekKey, weekLabel, teachers };
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
        const workbook = XLSX.read(ev.target.result, { type: 'array' });
        const weeks = [];
        const skippedSheets = [];
        workbook.SheetNames.forEach((sheetName) => {
          const ws = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
          const parsed = parseWorkbookSheet(rows, sheetName);
          if (parsed && parsed.teachers.length) weeks.push(parsed);
          else skippedSheets.push(sheetName);
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
        document.getElementById('importConfirmBtn').disabled = false;
        document.getElementById('importModalOverlay').classList.add('show');
      } catch (err) {
        toast('⚠️ ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

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

      const knownTeacherCodes = new Set(state.teachers.map((t) => t.id));
      const knownWeekKeys = new Set(state.weeks.map((w) => w.id));

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
        }
      }
      if (ops > 0) await batch.commit();

      toast(`✅ Đã nhập ${pendingImport.weeks.length} tuần / ${new Set(pendingImport.weeks.flatMap((w) => w.teachers.map((t) => t.code))).size} giáo viên`);
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
