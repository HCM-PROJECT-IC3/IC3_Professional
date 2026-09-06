/* ============================================================
   js/teaching-schedule.js
   Logic cho trang teaching-schedule.html — quản lý lịch giảng
   dạy/làm việc hàng tuần của đội ngũ giáo viên (thay file Excel
   "LỊCH GIẢNG DẠY TEAM GVTH...xlsx").

   - admin/coordinator: toàn quyền quản lý (thêm/sửa/xoá GV, nhập Excel,
     tạo tuần mới, sửa lịch MỌI giáo viên) — bảng tổng hợp nhiều GV +
     modal lưới lịch (renderWeeklyTab/openSchedModal).
   - teacher (đã được Admin liên kết "Mã NV" ở admin-users.html): khối
     riêng "Lịch của tôi" — TỰ CẬP NHẬT đúng lịch của chính mình bằng lưới
     thẻ theo ngày, sửa/lưu trực tiếp không cần modal (renderMyWeekView).

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
    myWeekDraft: null,     // days{} đang sửa ở khối "Lịch của tôi" (giáo viên) — chưa lưu
    search: '',
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

  /** Ẩn/khoá các chức năng quản lý nhiều GV (chỉ admin/coordinator) khi tài
   * khoản đăng nhập là giáo viên, thay bằng khối "Lịch của tôi" (thẻ theo
   * ngày, sửa/lưu trực tiếp — xem renderMyWeekView()). Quyền ghi thật sự
   * vẫn do firestore.rules chốt (chỉ đúng teacherCode == chính mình), đây
   * chỉ là lớp UX. */
  function applyRoleUI() {
    const hide = (id) => { const el = document.getElementById(id); if (el) el.classList.add('force-hide'); };
    const show = (id) => { const el = document.getElementById(id); if (el) el.classList.remove('force-hide'); };
    if (!isTeacherRole()) return;
    hide('mainTabs');           // chỉ còn đúng 1 tab "Lịch tuần" có ý nghĩa với GV
    hide('weeklyFiltersWrap');  // tìm kiếm/lọc chỉ cần khi quản lý nhiều GV
    hide('newWeekBtn');
    hide('importExcelBtn');
    hide('weekProgressBar');
    hide('weeklyTableWrap');    // thay bằng khối thẻ "Lịch của tôi" bên dưới
    show('myWeekWrap');
    const banner = document.querySelector('.banner');
    if (banner) {
      banner.innerHTML = 'Tự <b>cập nhật lịch làm việc/giảng dạy hàng tuần</b> của chính bạn ngay tại đây —'
        + ' chọn <b>loại hình phụ trách</b> cho từng buổi Sáng/Chiều, điền địa điểm và lớp đang dạy, rồi bấm'
        + ' <b>"💾 Lưu lịch tuần của tôi"</b>. Có thắc mắc về lịch, liên hệ Điều phối đào tạo/Admin.';
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
      if (isTeacherRole()) {
        if (state.myTeacherCode) {
          const doc = await window.EduRepositories.teachingSchedule.getById(M.scheduleDocId(state.myTeacherCode, weekKey));
          if (doc) state.schedulesByTeacher[state.myTeacherCode] = doc;
        }
      } else {
        const rows = await window.EduRepositories.teachingSchedule.listByWeek(weekKey);
        rows.forEach((r) => { state.schedulesByTeacher[r.teacherCode] = r; });
      }
      renderWeeklyTab();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  // ============================================================
  // TABS
  // ============================================================
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
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

  // Bảng màu THEO LOẠI HÌNH PHỤ TRÁCH — dùng chung cho cả thẻ tóm tắt ở
  // bảng admin (wk-chip) LẪN khối thẻ ngày "Lịch của tôi" (day-card-session),
  // để cùng 1 loại hình luôn ra cùng 1 màu ở bất kỳ đâu trong trang.
  const TYPE_COLOR_SUFFIX = {
    'Dạy chính': 'main', 'Dạy Trám': 'sub', 'Dạy Trực Tuyến': 'online',
    'Ôn Thi': 'review', 'Trợ Giảng': 'mentor', 'Dự Giảng': 'mentor',
    'Soạn bài': 'prep', 'Làm việc tại cty': 'office', 'WFH': 'office',
    'Khám SK': 'health', 'Nghỉ phép/ lễ': 'leave',
  };
  function typeColorSuffix(type) { return TYPE_COLOR_SUFFIX[type] || ''; }

  /** 1 dòng tóm tắt ngắn gọn cho 1 buổi (Sáng/Chiều) — hiện trong bảng
   * chính, KHÔNG cần mở modal cũng biết sơ bộ giáo viên đang bận gì. */
  function summarizeSession(sess) {
    if (!sess || !sess.type) return '<span class="wk-chip wk-empty">–</span>';
    const cls = 'wk-' + (typeColorSuffix(sess.type) || 'prep');
    // periods[i] giờ là boolean (tích/không tích) — chỉ xét truthy (!!p),
    // không .trim() vì boolean không có hàm đó (dữ liệu cũ từ Excel vẫn có
    // thể là chuỗi tên lớp, !!p vẫn đúng với cả 2 dạng).
    const periods = (sess.periods || []).filter((p) => !!p).length;
    const extra = periods ? ` (${periods} tiết${sess.location ? ' · ' + esc(sess.location) : ''})` : (sess.location ? ` (${esc(sess.location)})` : '');
    return `<span class="wk-chip ${cls}">${esc(sess.type)}</span>${extra ? `<small>${extra}</small>` : ''}`;
  }

  function renderWeeklyTab() {
    if (isTeacherRole()) { renderMyWeekView(); return; }

    const tbody = document.getElementById('weeklyRows');
    const progressBar = document.getElementById('weekProgressBar');
    if (!state.currentWeekKey) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">Chưa có tuần nào — bấm "🧬 Tuần mới" hoặc "📥 Nhập từ Excel" để bắt đầu.</td></tr>';
      if (progressBar) progressBar.hidden = true;
      return;
    }

    const q = state.search;
    let teachers = state.teachers.filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q));

    const daysOf = (t) => (state.schedulesByTeacher[t.code] && state.schedulesByTeacher[t.code].days) || M.emptyDays();

    // Thanh tiến độ "đã nhập lịch / tổng số GV" — tính TRƯỚC khi áp bộ lọc
    // "chỉ hiện GV chưa có lịch" để luôn phản ánh đúng cả đội, không phải
    // riêng phần đang lọc hiển thị.
    if (progressBar) {
      const total = teachers.length;
      const missing = teachers.filter((t) => !M.hasAnySchedule(daysOf(t))).length;
      const done = total - missing;
      const pct = total ? Math.round((done / total) * 100) : 0;
      progressBar.hidden = total === 0;
      progressBar.innerHTML = total ? `
        <div class="wk-progress-track"><div class="wk-progress-fill" style="width:${pct}%"></div></div>
        <span class="wk-progress-label"><b>${done}/${total}</b> giáo viên đã nhập lịch tuần này${missing ? ` · <b class="wk-progress-warn">${missing}</b> chưa nhập` : ' · 🎉 đã đủ'}</span>` : '';
    }

    const onlyMissingChk = document.getElementById('onlyMissingChk');
    if (onlyMissingChk && onlyMissingChk.checked) {
      teachers = teachers.filter((t) => !M.hasAnySchedule(daysOf(t)));
    }

    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">Không có giáo viên khớp tìm kiếm/bộ lọc.</td></tr>';
      return;
    }

    tbody.innerHTML = teachers.map((t) => {
      const days = daysOf(t);
      const dayCells = M.WEEKDAYS.map((d) => {
        const day = days[String(d)] || M.emptyDay();
        return `<td><div class="wk-day-cell">${summarizeSession(day.morning)}${summarizeSession(day.afternoon)}</div></td>`;
      }).join('');
      const stats = M.computeWeekStats(days);
      const statsHtml = `<b>${stats.schoolsMain}</b> trường·<b>${stats.periodsMain}</b> tiết chính<br>
        Trám: ${stats.periodsSub} tiết · Ôn thi: ${stats.periodsReview} tiết<br>
        Soạn bài: ${stats.sessionsPrep} · Cty: ${stats.sessionsOffice} · TG/DG: ${stats.sessionsMentor}`;
      const rowClass = !M.hasAnySchedule(days) ? ' class="row-missing"' : '';
      return `<tr${rowClass}>
        <td>${esc(t.code)}</td>
        <td><strong>${esc(t.name)}</strong></td>
        ${dayCells}
        <td class="wk-stats-cell">${statsHtml}</td>
        <td><button type="button" class="btn-edit-text" data-edit-sched="${esc(t.code)}">Sửa lịch</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-sched]').forEach((b) => b.addEventListener('click', () => openSchedModal(b.dataset.editSched)));
  }

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

    if (!state.myTeacherCode) {
      emptyEl.hidden = false;
      bodyEl.hidden = true;
      emptyEl.textContent = 'Tài khoản của bạn chưa được liên kết với hồ sơ giáo viên trong "Lịch giảng dạy" — vui lòng liên hệ Admin/Điều phối đào tạo để được gán Mã NV (admin-users.html).';
      return;
    }
    if (!state.currentWeekKey) {
      emptyEl.hidden = false;
      bodyEl.hidden = true;
      emptyEl.textContent = 'Chưa có tuần nào được tạo — vui lòng liên hệ Điều phối đào tạo/Admin để tạo tuần mới, sau đó quay lại đây để tự cập nhật lịch.';
      return;
    }
    emptyEl.hidden = true;
    bodyEl.hidden = false;

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
        <div class="periods-caption">Tích vào tiết có dạy:</div>
        <div class="day-card-periods">
          ${[0, 1, 2, 3, 4].map((pi) => `
            <label class="period-cell">
              <span class="period-num">T${pi + 1}</span>
              <input type="checkbox" class="my-week-period" data-day="${d}" data-session="${sessionKey}" data-field="period" data-period-idx="${pi}" ${sess.periods[pi] ? 'checked' : ''} title="Có dạy tiết ${pi + 1} hay không">
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
        else if (f === 'period') sess.periods[Number(el.dataset.periodIdx)] = el.checked; // tích chọn, không còn gõ tên lớp
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
        <td class="sched-row-label" rowspan="7">${sessionLabel}</td>
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
          return `<td class="sched-period-cell"><input type="checkbox" class="sched-period" data-day="${d}" data-session="${sessionKey}" data-field="period" data-period-idx="${pi}" ${sess.periods[pi] ? 'checked' : ''} title="Có dạy tiết ${pi + 1} hay không"></td>`;
        }).join('')}
      </tr>`).join('');
      return typeRow + locRow + periodRows;
    }

    table.innerHTML = `
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
        else if (f === 'period') sess.periods[Number(el.dataset.periodIdx)] = el.checked; // tích chọn, không còn gõ tên lớp
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
        document.getElementById('importSummary').hidden = false;
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
    document.getElementById('importSummary').hidden = true;
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
