/* ============================================================
   js/teaching-timetable.js
   Logic cho tab "🗓️ TKB lớp" (teaching-schedule.html) — thời khoá biểu
   dạng lưới tiết học (Buổi/Tiết/Thời gian × Thứ2-7), điền MÃ LỚP đang dạy
   cho từng tiết, phỏng theo mẫu thời khoá biểu giấy nhà trường.
   Model/collection tách riêng với tab "📅 Lịch tuần" (theo dõi LOẠI HÌNH
   PHỤ TRÁCH nhân sự), nhưng Mã lớp/Trường của từng tiết được TỰ ĐỘNG lấy
   từ Lịch tuần của đúng giáo viên/tuần đang xem mỗi khi mở lưới (xem
   applyScheduleAutoFill()) — không cần gõ tay/dán bảng từ Excel như
   trước, trừ những tiết Lịch tuần chưa có dữ liệu.

   PHÂN QUYỀN (khớp firestore.rules):
   - admin: toàn quyền xem/sửa/lưu TKB của mọi giáo viên.
   - teacher: chỉ XEM (không sửa) LƯỚI mã lớp của chính mình — teaching_timetable
     chỉ cho phép admin write, nên "📥 Nhập Excel"/"💾 Lưu" (lưới) đều ẩn, ô
     nhập chuyển readonly (xem applyTeacherReadOnlyUI()). RIÊNG "⏱️ Giờ tiết"
     giáo viên ĐƯỢC TỰ SỬA (thiết lập linh hoạt khung giờ Sáng/Chiều theo cấp
     học THCS/TiH cho từng Thứ) — teaching_timetable_periods cho phép giáo
     viên ghi ĐÚNG bản ghi của chính mình (firestore.rules), khác hẳn
     teaching_timetable (lưới mã lớp) vẫn chỉ admin ghi được.
     Vì chỉ xem đúng 1 GV (chính mình) nên KHÔNG list() cả collection
     teaching_teachers (rules không cho), tự chọn sẵn đúng GV đó, khoá cứng
     ô chọn GV luôn (không có ai khác để chọn).
   - teaching_coordinator (🚗 Điều phối giáo viên — KHÁC "coordinator" tức
     "🧭 Điều phối đào tạo", role đó không được vào trang này nữa): CHỈ
     XEM, giống hệt teacher ở phần ẩn nút chỉnh sửa (⏱️ Giờ tiết/📥 Nhập
     Excel/💾 Lưu) + ô nhập readonly (xem applyCoordinatorReadOnlyUI()) —
     nhưng KHÁC teacher ở chỗ được xem TKB của MỌI giáo viên (list() cả
     collection teaching_teachers, rules đã cho phép), nên vẫn chọn GV tự
     do qua <select> như admin và vẫn thấy tab "👤 Giáo viên" (chỉ ẩn nút
     thêm/sửa/xoá ở đó, xem js/teaching-schedule.js).

   File tự chứa (IIFE riêng, không phụ thuộc biến nội bộ của
   js/teaching-schedule.js) — cùng nghe sự kiện 'edu:ready', dùng chung
   #toast/model/repository đã nạp trước đó.
   ============================================================ */
(function () {
  'use strict';

  const M = window.EduModels.TeachingTimetable;
  const TS = window.EduModels.TeachingSchedule; // chỉ mượn todayWeekKey() để chọn tuần mặc định

  const state = {
    role: '',
    myTeacherCode: '', // teacherCode liên kết của tài khoản (chỉ có ý nghĩa khi role==='teacher')
    teachers: [],
    weeks: [],
    weekKey: '',
    teacherCode: '',
    // { "2".."7": { morning:[{start,end}], afternoon:[{start,end}] } } — MỖI
    // THỨ 1 khung giờ RIÊNG (không còn dùng chung 1 khung cho cả tuần —
    // giáo viên dạy Tiểu học vài ngày/THCS vài ngày khác trong CÙNG 1 tuần
    // rất phổ biến, xem js/models/teaching-timetable.model.js).
    periodTimesByDay: null,
    days: null,         // { "2".."7": { morning:[mã lớp...], afternoon:[mã lớp...] } }
    truongOptions: [],  // gợi ý "Trường" (datalist) — map từ tab Lịch tuần + lịch sử TKB của GV đang chọn
    lopOptions: [],      // gợi ý "Mã lớp" (datalist) — lịch sử TKB của GV đang chọn + mọi GV khác trong tuần đang xem
    autoCells: new Set(), // set "day-session-idx" các ô vừa được tự động điền từ Lịch tuần (xem applyScheduleAutoFill) — chỉ để tô sáng UI, không lưu Firestore
  };
  let ptDraft = null; // bản nháp { "2".."7": {morning,afternoon} } đang sửa trong modal "⏱️ Giờ tiết"
  let ptEditingDay = '2'; // Thứ đang chọn để sửa trong modal (tab) — mặc định Thứ 2
  // Tham số TỰ SINH giờ tiết (giờ vào/số phút mỗi tiết/số phút chuyển tiết/
  // số phút nghỉ giải lao) CỦA TỪNG Thứ×Buổi đang sửa trong modal — CHỈ là
  // trợ giúp tạo nhanh mảng periods (xem M.generatePeriodTimes()), KHÔNG
  // lưu xuống Firestore (chỉ periods {start,end} cuối cùng mới lưu) nên
  // reset mỗi lần mở modal, lazy-tính khi lần đầu vẽ 1 cột (xem
  // getGenState()) — suy luận lại từ periods ĐÃ CÓ nếu giáo viên từng lưu,
  // để không hiện số 0/trống vô nghĩa khi mở lại modal đã cấu hình trước đó.
  let ptGenState = null; // { "day-session": {minutes,start,gap,breakMinutes} }

  // Cho phép module khác (js/teaching-timetable-import.js) ĐỌC được đúng
  // bối cảnh đang xem (giáo viên/tuần đang chọn, danh sách GV/tuần đã tải
  // sẵn) mà KHÔNG cần đụng vào biến `state` đóng kín trong IIFE này — dùng
  // để validate file Excel nhập vào (mã GV có tồn tại không, tuần nào
  // đang áp dụng) và để nạp lại lưới sau khi nhập xong.
  window.EduTeachingTimetableView = {
    getContext() {
      const t = state.teachers.find((x) => x.code === state.teacherCode);
      const week = state.weeks.find((w) => w.id === state.weekKey);
      return {
        teacherCode: state.teacherCode,
        teacherName: t ? t.name : '',
        periodTimesByDay: state.periodTimesByDay,
        weekKey: state.weekKey,
        weekLabel: week ? (week.label || week.id) : '',
        teachers: state.teachers, // [{code, name, ...}] — GV đang có trong hệ thống, để đối chiếu mã GV nhập vào
      };
    },
    /** Nạp lại lưới đang xem (gọi sau khi nhập Excel xong, vì dữ liệu vừa
     * ghi vào Firestore có thể trùng đúng giáo viên/tuần đang mở). */
    reload() { loadAndRenderGrid(); },
  };

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
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
      return 'Chưa có quyền — kiểm tra Firestore Rules đã publish đủ collection teaching_timetable* chưa.';
    }
    return err && err.message ? err.message : String(err);
  }

  window.addEventListener('edu:ready', ({ detail }) => {
    state.role = detail.profile.role;
    state.myTeacherCode = detail.profile.teacherCode || '';
    if (state.role === 'teacher') {
      // Giáo viên được XEM (không sửa) đúng TKB của chính mình — tab "👤
      // Giáo viên" (quản lý toàn bộ đội ngũ) không thuộc quyền teacher nên
      // vẫn ẩn; tab "🗓️ TKB lớp" thì HIỆN nhưng chuyển hẳn sang chế độ
      // read-only (xem applyTeacherReadOnlyUI()).
      document.querySelectorAll('[data-tab="teachers"]').forEach((b) => b.classList.add('force-hide'));
      applyTeacherReadOnlyUI();
    } else if (state.role === 'teaching_coordinator') {
      // "🚗 Điều phối giáo viên": CHỈ XEM như teacher nhưng được xem TKB
      // của MỌI giáo viên (không tự chọn sẵn 1 người, không khoá ô chọn
      // GV, không ẩn tab "👤 Giáo viên" — xem applyCoordinatorReadOnlyUI()).
      applyCoordinatorReadOnlyUI();
    }
    loadTeachersAndWeeks();
  });

  /** Ẩn control CHỈNH SỬA LƯỚI (📥 Nhập Excel/💾 Lưu) — theo firestore.rules,
   * teaching_timetable chỉ cho phép admin ghi, giáo viên chỉ đọc được đúng
   * bản ghi của chính mình. Ô "Mã lớp"/"Trường" trong lưới cũng chuyển
   * readonly (xem renderGrid()). RIÊNG "⏱️ Giờ tiết" (khung giờ Sáng/Chiều
   * theo cấp học THCS/TiH) VẪN HIỆN cho giáo viên — teaching_timetable_periods
   * đã cho phép giáo viên tự ghi ĐÚNG bản ghi của chính mình (firestore.rules),
   * để GV tự thiết lập giờ tiết linh hoạt theo trường mình đang dạy thay vì
   * phải nhờ Admin chỉnh hộ. */
  function applyTeacherReadOnlyUI() {
    document.getElementById('ttImportBtn')?.classList.add('force-hide');
    document.getElementById('ttSaveBtn')?.classList.add('force-hide');
    const teacherSel = document.getElementById('ttTeacherSelect');
    if (teacherSel) teacherSel.disabled = true; // GV chỉ có đúng 1 lựa chọn (chính mình), không cần chọn tay
  }

  /** Giống applyTeacherReadOnlyUI() nhưng KHÔNG khoá ô chọn giáo viên —
   * điều phối đào tạo xem TKB của MỌI giáo viên (list() cả collection,
   * rules đã cho phép) nên vẫn cần chọn tự do qua <select> như admin. */
  function applyCoordinatorReadOnlyUI() {
    document.getElementById('ttPeriodTimesBtn')?.classList.add('force-hide');
    document.getElementById('ttImportBtn')?.classList.add('force-hide');
    document.getElementById('ttSaveBtn')?.classList.add('force-hide');
  }

  async function loadTeachersAndWeeks() {
    try {
      let teachers, weeks;
      if (state.role === 'teacher') {
        // Firestore rules chỉ cho giáo viên đọc ĐÚNG 1 document
        // teaching_teachers của chính mình — không được list() cả
        // collection (giống cách js/teaching-schedule.js xử lý "Lịch của
        // tôi"), nên KHÔNG dùng teachingTeacher.list() ở nhánh này.
        const me = state.myTeacherCode ? await window.EduRepositories.teachingTeacher.getById(state.myTeacherCode) : null;
        teachers = me ? [me] : [];
        weeks = await window.EduRepositories.teachingWeek.listAll();
      } else {
        [teachers, weeks] = await Promise.all([
          window.EduRepositories.teachingTeacher.list({ orderBy: 'name' }),
          window.EduRepositories.teachingWeek.listAll(),
        ]);
      }
      state.teachers = teachers;
      state.weeks = weeks;
      renderWeekSelect();
      renderTeacherSelect();
      loadAndRenderGrid();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  function renderWeekSelect() {
    const sel = document.getElementById('ttWeekSelect');
    if (!state.weeks.length) {
      sel.innerHTML = '<option value="">-- Chưa có tuần nào --</option>';
      state.weekKey = '';
      return;
    }
    sel.innerHTML = state.weeks.map((w) => `<option value="${esc(w.id)}">${esc(w.label || w.id)}</option>`).join('');
    const todayKey = TS ? TS.todayWeekKey() : '';
    const defaultKey = state.weeks.some((w) => w.id === todayKey) ? todayKey : state.weeks[state.weeks.length - 1].id;
    sel.value = state.weeks.some((w) => w.id === state.weekKey) ? state.weekKey : defaultKey;
    state.weekKey = sel.value;
  }

  function renderTeacherSelect() {
    const sel = document.getElementById('ttTeacherSelect');
    if (!state.teachers.length) {
      sel.innerHTML = '<option value="">-- Chưa có giáo viên --</option>';
      state.teacherCode = '';
      return;
    }
    sel.innerHTML = '<option value="">-- Chọn giáo viên --</option>'
      + state.teachers.map((t) => `<option value="${esc(t.code)}">${esc(t.name)} (${esc(t.code)})</option>`).join('');
    // Giáo viên: tự động chọn đúng chính mình (danh sách chỉ có 1 lựa
    // chọn) — không bắt gõ/chọn tay như admin.
    if (state.role === 'teacher' && state.myTeacherCode) state.teacherCode = state.myTeacherCode;
    if (state.teacherCode && state.teachers.some((t) => t.code === state.teacherCode)) sel.value = state.teacherCode;
    else state.teacherCode = '';
  }

  document.getElementById('ttWeekSelect').addEventListener('change', (e) => { state.weekKey = e.target.value; loadAndRenderGrid(); });
  document.getElementById('ttTeacherSelect').addEventListener('change', (e) => { state.teacherCode = e.target.value; loadAndRenderGrid(); });

  async function loadAndRenderGrid() {
    const emptyEl = document.getElementById('ttEmpty');
    const wrapEl = document.getElementById('ttGridWrap');
    if (!state.weekKey || !state.teacherCode) {
      emptyEl.classList.remove('force-hide');
      wrapEl.classList.add('force-hide');
      // Giáo viên chưa được Admin liên kết "Mã NV" thì state.teachers rỗng
      // (không tự chọn được ai) — nói rõ thay vì để nguyên câu chung chung
      // "chọn 1 tuần và 1 giáo viên" (họ không có gì để chọn).
      emptyEl.textContent = (state.role === 'teacher' && !state.myTeacherCode)
        ? 'Tài khoản của bạn chưa được liên kết với hồ sơ giáo viên trong "Lịch giảng dạy" — vui lòng liên hệ Admin để được gán Mã NV (admin-users.html).'
        : 'Chọn 1 tuần và 1 giáo viên ở trên để xem/sửa thời khoá biểu.';
      return;
    }
    try {
      const scheduleId = TS ? TS.scheduleDocId(state.teacherCode, state.weekKey) : null;
      const [ptDoc, ttDoc, scheduleDoc] = await Promise.all([
        window.EduRepositories.teachingPeriodTimes.getById(state.teacherCode),
        window.EduRepositories.teachingTimetable.getById(M.docId(state.teacherCode, state.weekKey)),
        scheduleId ? window.EduRepositories.teachingSchedule.getById(scheduleId).catch(() => null) : Promise.resolve(null),
      ]);
      state.periodTimesByDay = M.normalizePeriodTimesDoc(ptDoc);
      state.days = M.normalizeDays(ttDoc && ttDoc.days, state.periodTimesByDay);
      applyScheduleAutoFill(scheduleDoc);
      emptyEl.classList.add('force-hide');
      wrapEl.classList.remove('force-hide');
      renderPosterHead();
      renderGrid();
      // Gợi ý gõ nhanh chỉ cần cho chế độ SỬA (admin) — bỏ qua ở chế độ
      // XEM (teacher/coordinator): vừa không cần thiết (ô đã readonly) vừa
      // đỡ tốn thêm mấy lượt đọc list()/listByWeek() vô ích (coordinator
      // thật ra ĐƯỢC rules cho phép list(), nhưng không có gì để gõ nên
      // không cần tải).
      if (state.role !== 'teacher' && state.role !== 'teaching_coordinator') loadSuggestions(state.teacherCode, state.weekKey); // không await — nạp gợi ý xong render lại datalist riêng, không chặn lưới chính hiện ngay
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  /** Tự động điền "Mã lớp"/"Trường" vào lưới TKB dựa trên dữ liệu đã ghi ở
   * tab "📅 Lịch tuần" (collection teaching_schedule) của ĐÚNG giáo viên +
   * tuần đang xem — thay cho việc phải gõ tay/dán bảng từ Excel như trước.
   * Lịch tuần là NGUỒN GỐC (tiết nào có mã lớp thì mã lớp + trường của tiết
   * đó trong TKB được ghi đè theo); những tiết Lịch tuần không có dữ liệu
   * (vd tiết thứ 5 buổi chiều nếu giáo viên tự thêm qua "⏱️ Giờ tiết", hoặc
   * cả tuần đó chưa nhập Lịch tuần) vẫn giữ nguyên giá trị đã lưu/gõ tay
   * trong TKB — không tự xoá dữ liệu mà Lịch tuần không biết tới.
   * state.autoCells ghi lại đúng những ô vừa được tự động điền (KHÔNG lưu
   * vào Firestore, chỉ dùng để tô sáng UI ở renderGrid()). */
  function applyScheduleAutoFill(scheduleDoc) {
    state.autoCells = new Set();
    if (!scheduleDoc || !scheduleDoc.days) return;
    M.WEEKDAYS.forEach((d) => {
      const schedDay = scheduleDoc.days[String(d)];
      if (!schedDay) return;
      M.SESSIONS.forEach((s) => {
        const schedSess = schedDay[s];
        if (!schedSess) return;
        const location = (schedSess.location || '').trim();
        const periods = schedSess.periods || [];
        (state.days[String(d)][s] || []).forEach((cell, i) => {
          const raw = periods[i];
          // Tương thích ngược: dữ liệu Lịch tuần CŨ có thể vẫn là boolean
          // true (giai đoạn chỉ tích chọn, chưa có mã lớp dạng chữ) — bỏ
          // qua, không có mã lớp để điền.
          const maLop = typeof raw === 'string' ? raw.trim() : '';
          if (!maLop) return;
          cell.maLop = maLop;
          cell.truong = location || cell.truong;
          state.autoCells.add(`${d}-${s}-${i}`);
        });
      });
    });
  }

  /** Nạp gợi ý "Trường"/"Mã lớp" để gõ nhanh (datalist, vẫn gõ tự do được
   * nếu không có trong danh sách) — GIỐNG cách chọn từ danh sách có sẵn ở
   * file Excel gốc (data validation dropdown), tránh gõ lệch chính tả
   * cùng 1 trường/lớp giữa các tuần.
   * - "Trường": map từ ĐỊA ĐIỂM đã ghi ở tab "📅 Lịch tuần" (mọi tuần) +
   *   lịch sử "Trường" đã gõ ở chính TKB lớp (mọi tuần) CỦA GIÁO VIÊN này.
   * - "Mã lớp": lịch sử "Mã lớp" đã gõ ở TKB lớp CỦA GIÁO VIÊN này (mọi
   *   tuần) + mã lớp mọi giáo viên KHÁC đã dùng trong ĐÚNG TUẦN đang xem
   *   (thường trùng lặp giữa các GV do cùng quy ước đặt tên lớp toàn
   *   trường, vd "5/1", "4/6"). */
  async function loadSuggestions(teacherCode, weekKey) {
    try {
      const [scheduleRows, ttRowsOfTeacher, ttRowsOfWeek] = await Promise.all([
        window.EduRepositories.teachingSchedule.listByTeacher(teacherCode).catch(() => []),
        window.EduRepositories.teachingTimetable.listByTeacher(teacherCode).catch(() => []),
        window.EduRepositories.teachingTimetable.listByWeek(weekKey).catch(() => []),
      ]);
      // Bỏ dở nếu người dùng đã đổi giáo viên/tuần trong lúc đang tải.
      if (teacherCode !== state.teacherCode || weekKey !== state.weekKey) return;

      const truongSet = new Set();
      const lopSet = new Set();

      scheduleRows.forEach((doc) => {
        Object.values(doc.days || {}).forEach((day) => {
          ['morning', 'afternoon'].forEach((s) => {
            const loc = day[s] && day[s].location;
            if (loc && loc.trim()) truongSet.add(loc.trim());
          });
        });
      });
      const collectTt = (rows, targetTeacherOnly) => {
        rows.forEach((doc) => {
          Object.values(doc.days || {}).forEach((day) => {
            ['morning', 'afternoon'].forEach((s) => {
              (day[s] || []).forEach((raw) => {
                const cell = M.cellOf(raw);
                if (cell.truong && cell.truong.trim() && (!targetTeacherOnly || doc.teacherCode === teacherCode)) truongSet.add(cell.truong.trim());
                if (cell.maLop && cell.maLop.trim()) lopSet.add(cell.maLop.trim());
              });
            });
          });
        });
      };
      collectTt(ttRowsOfTeacher, false);
      collectTt(ttRowsOfWeek, false);

      state.truongOptions = Array.from(truongSet).sort((a, b) => a.localeCompare(b, 'vi'));
      state.lopOptions = Array.from(lopSet).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
      renderSuggestionLists();
    } catch (err) {
      // Gợi ý là tiện ích phụ, lỗi ở đây KHÔNG được làm gián đoạn việc gõ
      // tay bình thường — chỉ log ra console, không toast làm phiền.
      console.warn('[TKB lớp] Không tải được gợi ý Trường/Mã lớp:', err);
    }
  }

  function renderSuggestionLists() {
    const truongList = document.getElementById('ttTruongOptions');
    const lopList = document.getElementById('ttLopOptions');
    if (truongList) truongList.innerHTML = state.truongOptions.map((v) => `<option value="${esc(v)}">`).join('');
    if (lopList) lopList.innerHTML = state.lopOptions.map((v) => `<option value="${esc(v)}">`).join('');
  }

  function renderPosterHead() {
    const t = state.teachers.find((x) => x.code === state.teacherCode);
    const week = state.weeks.find((w) => w.id === state.weekKey);
    document.getElementById('ttPosterHead').innerHTML = `
      <div class="tt-poster-title">🗓️ THỜI KHOÁ BIỂU — ${esc(t ? t.name : state.teacherCode)}</div>
      <div class="tt-poster-sub">Áp dụng: ${esc(week ? (week.label || week.id) : state.weekKey)}</div>`;
  }

  /** Vẽ lưới Buổi/Tiết/Thời gian × Thứ2-7 — mỗi ô Thứ×Tiết giờ có 2 ô nhập
   * xếp chồng: MÃ LỚP (đậm, trên) + TRƯỜNG (nhạt hơn, dưới) — tách riêng
   * vì 1 giáo viên có thể dạy LINH HOẠT nhiều trường khác nhau, kể cả đổi
   * trường giữa các tiết trong CÙNG 1 buổi, nên "trường" phải theo TỪNG
   * TIẾT chứ không gộp chung 1 ô/buổi được. Chèn 1 dòng "☕ Ra chơi" sau
   * tiết thứ M.BREAK_AFTER_INDEX+1 của mỗi buổi (nếu buổi đó đủ dài) giống
   * mẫu giấy.
   *
   * MỖI THỨ có khung giờ RIÊNG (state.periodTimesByDay) nên KHÔNG còn cột
   * "Thời gian" dùng chung cho cả 6 Thứ (1 cột chung chỉ hiện được ĐÚNG 1
   * giờ THAM CHIẾU trong khi các Thứ khác đã có giờ riêng ngay trong ô của
   * mình rồi, giữ cột chung chỉ THỪA/GÂY HIỂU LẦM) — giờ mỗi ô ĐÃ CÓ mã
   * lớp tự hiện LUÔN giờ thực của đúng Thứ/tiết đó, cột đầu chỉ còn "Tiết"
   * (số thứ tự, không đổi theo Thứ). Thứ nào có ÍT tiết hơn Thứ nhiều nhất
   * (vd chỉ dạy 4 tiết Sáng thay vì 5) — ô dư ra của Thứ đó bị khoá (không
   * có ô nhập, hiện "—"). */
  function renderGrid() {
    const table = document.getElementById('ttGrid');
    const dayHeaders = M.WEEKDAYS.map((d, i) => `<th class="tt-day-head tt-day-${i}">${M.WEEKDAY_LABELS[d]}</th>`).join('');
    // Giáo viên/điều phối chỉ được XEM (teaching_timetable chỉ cho admin
    // write) — khoá cứng mọi ô nhập, không gắn listener sửa/dán bên dưới.
    const readOnly = state.role === 'teacher' || state.role === 'teaching_coordinator';
    const readOnlyAttr = readOnly ? ' readonly' : '';

    /** Tính lại HTML huy hiệu cấp học cho 1 ô (dùng cả lúc vẽ lưới lần đầu
     * VÀ khi gõ lại "Trường"/"Mã lớp" — xem addEventListener('input') bên
     * dưới — để huy hiệu/cảnh báo cập nhật ngay khi gõ, không phải đợi tải
     * lại cả lưới mới thấy đúng). `period` là khung giờ THỰC của ĐÚNG
     * Thứ/tiết ô này (không còn dùng chung 1 khung cho cả tuần). */
    function computeBadgeHtml(sessionKey, pi, cell, period) {
      const rowMinutes = period ? M.periodMinutes(period) : null;
      const levelKey = M.inferSchoolLevel(cell.truong);
      if (!levelKey || !cell.maLop) return '';
      const level = M.SCHOOL_LEVELS[levelKey];
      const mismatched = rowMinutes && level.minutes !== rowMinutes;
      const realPeriod = (M.LEVEL_PERIOD_TIMES[levelKey][sessionKey] || [])[pi];
      const warnTitle = mismatched && realPeriod
        ? ` title="⚠️ Ô này đang để ${rowMinutes}’/tiết, nhưng ${level.label} chuẩn ${level.minutes}’/tiết (≈ ${esc(realPeriod.start)}–${esc(realPeriod.end)}). Sửa khung giờ đúng Thứ này trong ⏱️ Giờ tiết nếu cần."`
        : '';
      return `<span class="tt-level-badge tt-level-${levelKey}${mismatched ? ' tt-level-mismatch' : ''}"${warnTitle}>${esc(level.short)}${mismatched ? ' ⚠️' : ''}</span>`;
    }

    /** Giờ THỰC của đúng Thứ/tiết này — hiện khi ô đã có mã lớp (xem
     * computeBadgeHtml() ở trên cho lý do bỏ cột "Thời gian" dùng chung).
     * Tách hàm riêng để dùng lại được cả lúc vẽ lưới lần đầu VÀ lúc gõ lại
     * "Mã lớp" (input listener bên dưới) — gõ xong ẩn/hiện ngay, không cần
     * tải lại cả lưới. */
    function computeOwnTimeHtml(d, pi, cell, period) {
      if (!cell.maLop || !period) return '';
      return `<div class="tt-cell-own-time" title="Giờ tiết ${pi + 1} của ${esc(M.WEEKDAY_LABELS[d])}">⏱ ${esc(period.start)}–${esc(period.end)}</div>`;
    }

    function sessionRows(sessionKey) {
      const maxCount = M.maxPeriodCount(state.periodTimesByDay, sessionKey);
      const hasBreak = maxCount > M.BREAK_AFTER_INDEX + 1;
      const rowspan = maxCount + (hasBreak ? 1 : 0);
      const icon = sessionKey === 'morning' ? '☀️' : '🌙';
      const label = M.SESSION_LABELS[sessionKey];
      const rows = [];
      for (let pi = 0; pi < maxCount; pi++) {
        const dayCellsHtml = M.WEEKDAYS.map((d) => {
          const dayPeriods = state.periodTimesByDay[String(d)][sessionKey] || [];
          const period = dayPeriods[pi];
          if (!period) {
            // Thứ này không dạy tới tiết thứ pi+1 (ít tiết hơn Thứ khác
            // trong cùng buổi) — ô khoá, không có ô nhập.
            return '<td class="tt-cell tt-cell-disabled"><div class="tt-cell-inner tt-cell-inner-disabled">—</div></td>';
          }
          const cell = M.cellOf((state.days[String(d)][sessionKey] || [])[pi]);
          // LƯU Ý: input bọc trong 1 <div class="tt-cell-inner"> riêng —
          // KHÔNG được đặt display:flex thẳng lên <td> (tt-cell), vì làm
          // vậy trình duyệt bỏ luôn "table-cell" của ô đó, vỡ toàn bộ
          // layout bảng (đã từng bị 1 cột phình to nuốt hết cột khác).
          // list="ttLopOptions"/"ttTruongOptions" biến ô thành combo-box
          // (gõ tự do VẪN được, danh sách chỉ là gợi ý) — nạp động theo
          // đúng giáo viên/tuần đang xem qua loadSuggestions().
          const isAuto = state.autoCells.has(`${d}-${sessionKey}-${pi}`);
          const autoTitle = isAuto ? ' title="🔄 Tự động lấy từ Lịch tuần — vẫn sửa được nếu TKB cần khác đi"' : '';
          return `<td class="tt-cell"><div class="tt-cell-inner${isAuto ? ' tt-cell-auto' : ''}"${autoTitle}>
            <span class="tt-own-time-slot">${computeOwnTimeHtml(d, pi, cell, period)}</span>
            <input type="text" class="tt-input tt-input-lop" list="ttLopOptions" data-day="${d}" data-session="${sessionKey}" data-period-idx="${pi}" data-field="maLop" value="${esc(cell.maLop)}" placeholder="Mã lớp"${readOnlyAttr}>
            <div class="tt-truong-row">
              <input type="text" class="tt-input tt-input-truong" list="ttTruongOptions" data-day="${d}" data-session="${sessionKey}" data-period-idx="${pi}" data-field="truong" value="${esc(cell.truong)}" placeholder="Trường..."${readOnlyAttr}>
              <span class="tt-level-badge-slot">${computeBadgeHtml(sessionKey, pi, cell, period)}</span>
            </div>
          </div></td>`;
        }).join('');

        rows.push(`<tr>
          ${pi === 0 ? `<td class="tt-buoi-cell tt-sess-${sessionKey}" rowspan="${rowspan}">${icon}<br>${label}</td>` : ''}
          <td class="tt-tiet-cell">${pi + 1}</td>
          ${dayCellsHtml}
        </tr>`);
        if (hasBreak && pi === M.BREAK_AFTER_INDEX) {
          // Cột "Buổi" đang bị chiếm bởi ô rowspan từ dòng tiết đầu tiên
          // của buổi này (bao trùm cả dòng "Ra chơi") nên dòng này KHÔNG có
          // <td> riêng cho cột đó — colspan chỉ cần che cột "Tiết" + 6 cột
          // Thứ (đã bỏ cột "Thời gian" dùng chung, không còn 2 cột nữa).
          rows.push(`<tr class="tt-break-row"><td class="tt-break-label" colspan="${1 + M.WEEKDAYS.length}">☕ Ra chơi</td></tr>`);
        }
      }
      return rows.join('');
    }

    // Dòng ngăn cách SÁNG/CHIỀU — trước đây 2 khối nối liền nhau không có
    // ranh giới rõ ràng (nhìn như 1 dòng trống bất thường ở chỗ nối), người
    // dùng phản hồi cần "giãn cách phân biệt sáng/chiều" rõ hơn. Kiểu dáng ở
    // css/teaching-schedule.css (.tt-session-divider) — GIỮ NGUYÊN cả khi in
    // (không nằm trong danh sách ẩn của @media print).
    const sessionDivider = `<tr class="tt-session-divider"><td colspan="${2 + M.WEEKDAYS.length}"></td></tr>`;

    table.innerHTML = `
      <thead><tr><th>Buổi</th><th>Tiết</th>${dayHeaders}</tr></thead>
      <tbody>${sessionRows('morning')}${sessionDivider}${sessionRows('afternoon')}</tbody>`;

    if (!readOnly) {
      table.querySelectorAll('.tt-input').forEach((el) => {
        el.addEventListener('input', () => {
          const d = el.dataset.day, s = el.dataset.session, pi = Number(el.dataset.periodIdx), f = el.dataset.field;
          const cell = state.days[d][s][pi];
          cell[f] = el.value;
          // Gõ lại "Trường"/"Mã lớp" thì huy hiệu cấp học/cảnh báo lệch giờ
          // VÀ giờ thực (⏱) cập nhật NGAY (không phải tải lại cả lưới mới
          // thấy đúng) — dùng ĐÚNG khung giờ của Thứ này.
          const period = (state.periodTimesByDay[d][s] || [])[pi];
          const inner = el.closest('.tt-cell-inner');
          const badgeSlot = inner.querySelector('.tt-level-badge-slot');
          if (badgeSlot) badgeSlot.innerHTML = computeBadgeHtml(s, pi, cell, period);
          const timeSlot = inner.querySelector('.tt-own-time-slot');
          if (timeSlot) timeSlot.innerHTML = computeOwnTimeHtml(d, pi, cell, period);
        });
        // Dán bảng trực tiếp CHỈ áp dụng cho cột "Mã lớp" (trường hợp dùng
        // nhiều nhất — dán nguyên hàng mã lớp từ Excel) — ô "Trường" thường
        // lặp lại giống nhau nhiều tiết liền nên gõ tay/copy 1 ô là đủ,
        // không cần hỗ trợ dán khối cho ô đó.
        if (el.dataset.field === 'maLop') el.addEventListener('paste', (e) => handleGridPaste(e, el, table));
      });
    }
  }

  /** Sắp xếp mọi (buổi, tiết) thành 1 danh sách "hàng" phẳng ĐÚNG THỨ TỰ
   * hiển thị trên lưới (Sáng trước, Chiều sau) — dùng để biết "dán xuống
   * mấy hàng" đi từ đúng ô đang bấm khi dán 1 khối nhiều dòng/cột. */
  function flatRowOrder() {
    const order = [];
    M.SESSIONS.forEach((s) => {
      const maxCount = M.maxPeriodCount(state.periodTimesByDay, s);
      for (let idx = 0; idx < maxCount; idx++) order.push({ session: s, idx });
    });
    return order;
  }

  /** "💡 Dán bảng trực tiếp" — bôi đen 1 vùng ô trong Excel/Google Sheets
   * (Ctrl+C), bấm vào đúng ô Thứ/Tiết muốn bắt đầu rồi Ctrl+V ngay trên
   * lưới: tách theo tab (cột) + xuống dòng (hàng), điền tiếp từ đúng vị
   * trí ô đang bấm — không cần gõ tay từng ô, và KHÔNG có nguy cơ lẫn dữ
   * liệu giáo viên khác như OCR ảnh (vì lưới này vốn đã CHỈ CỦA 1 giáo
   * viên đang chọn). Dán 1 ô đơn (không có tab/xuống dòng) thì để trình
   * duyệt xử lý mặc định như dán bình thường. */
  function handleGridPaste(e, startEl, table) {
    const clip = e.clipboardData || window.clipboardData;
    const text = clip ? clip.getData('text') : '';
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // dán 1 ô — hành vi mặc định
    e.preventDefault();
    const rows = text.replace(/\r/g, '').split('\n').filter((r, i, arr) => !(i === arr.length - 1 && r === ''));
    const grid = rows.map((r) => r.split('\t'));
    const order = flatRowOrder();
    const startDayIdx = M.WEEKDAYS.indexOf(Number(startEl.dataset.day));
    const startRowIdx = order.findIndex((o) => o.session === startEl.dataset.session && o.idx === Number(startEl.dataset.periodIdx));
    if (startDayIdx < 0 || startRowIdx < 0) return;
    let filled = 0, skipped = 0;
    grid.forEach((rowVals, r) => {
      const rowIdx = startRowIdx + r;
      if (rowIdx >= order.length) { skipped += rowVals.length; return; }
      const { session, idx } = order[rowIdx];
      rowVals.forEach((val, c) => {
        const dayIdx = startDayIdx + c;
        if (dayIdx >= M.WEEKDAYS.length) { skipped++; return; }
        const day = M.WEEKDAYS[dayIdx];
        const target = table.querySelector(`.tt-input[data-day="${day}"][data-session="${session}"][data-period-idx="${idx}"][data-field="maLop"]`);
        if (!target) { skipped++; return; }
        const v = val.trim();
        target.value = v;
        state.days[String(day)][session][idx].maLop = v;
        filled++;
      });
    });
    toast(`✅ Đã dán ${filled} ô` + (skipped ? ` (bỏ qua ${skipped} ô vượt ngoài lưới hiện có)` : '') + '.');
  }

  document.getElementById('ttSaveBtn').addEventListener('click', async () => {
    if (!state.teacherCode || !state.weekKey) { toast('⚠️ Chọn tuần và giáo viên trước.'); return; }
    const t = state.teachers.find((x) => x.code === state.teacherCode);
    const week = state.weeks.find((w) => w.id === state.weekKey);
    const id = M.docId(state.teacherCode, state.weekKey);
    const btn = document.getElementById('ttSaveBtn');
    btn.disabled = true;
    try {
      await window.EduRepositories.teachingTimetable.upsert(id, {
        teacherCode: state.teacherCode,
        teacherName: t ? t.name : '',
        weekKey: state.weekKey,
        weekLabel: week ? (week.label || week.id) : '',
        days: state.days,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      toast('✅ Đã lưu thời khoá biểu');
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });

  // ------------------------------------------------------------
  // In/Xuất PDF — TRƯỚC ĐÂY gọi window.print() (hộp thoại in của trình
  // duyệt, xem css/teaching-schedule.css @media print), nhưng Chrome/Edge
  // tự chèn header/footer (ngày giờ, tiêu đề trang, URL, số trang) vào mỗi
  // trang in mà KHÔNG có cách nào tắt từ phía trang web — người dùng phản
  // hồi cần bỏ hẳn phần đó. Đổi sang xuất THẲNG file .pdf bằng jsPDF (xem
  // js/export/teaching-timetable-pdf.js) — không đi qua hộp thoại in của
  // trình duyệt nên không dính header/footer đó, đồng thời tự canh vừa
  // đúng 1 trang A4 ngang (tự lùi cỡ chữ nếu cần) và tự vẽ vạch ngăn cách
  // Sáng/Chiều rõ ràng thay vì phụ thuộc CSS in.
  // ------------------------------------------------------------
  document.getElementById('ttPrintBtn')?.addEventListener('click', () => {
    if (!state.teacherCode || !state.weekKey) { toast('⚠️ Chọn tuần và giáo viên trước.'); return; }
    const t = state.teachers.find((x) => x.code === state.teacherCode);
    const week = state.weeks.find((w) => w.id === state.weekKey);
    window.EduTeachingTimetablePdf.exportTimetablePdf({
      teacherName: t ? t.name : state.teacherCode,
      weekLabel: week ? (week.label || week.id) : state.weekKey,
      days: state.days,
      periodTimesByDay: state.periodTimesByDay,
    }, M);
  });

  // ------------------------------------------------------------
  // MODAL: ⏱️ Giờ tiết — khung giờ riêng của giáo viên đang chọn, MỖI THỨ
  // 2→7 sửa RIÊNG qua tab (không còn 1 khung chung cho cả tuần) — áp dụng
  // cho mọi tuần (không lặp cấu hình theo tuần), chỉ khác theo Thứ.
  // ------------------------------------------------------------
  function openPeriodTimesModal() {
    if (!state.teacherCode) { toast('⚠️ Chọn giáo viên trước.'); return; }
    const t = state.teachers.find((x) => x.code === state.teacherCode);
    document.getElementById('periodTimesModalTitle').textContent = `⏱️ Giờ tiết — ${t ? t.name : state.teacherCode}`;
    ptDraft = {};
    M.WEEKDAYS.forEach((d) => { ptDraft[String(d)] = M.clonePeriodTimes(state.periodTimesByDay[String(d)]); });
    ptGenState = {};
    ptEditingDay = '2';
    renderPeriodTimesTabs();
    renderPeriodTimesBody();
    document.getElementById('periodTimesModalOverlay').classList.add('show');
  }
  function closePeriodTimesModal() {
    document.getElementById('periodTimesModalOverlay').classList.remove('show');
    ptDraft = null;
    ptGenState = null;
  }
  document.getElementById('ttPeriodTimesBtn').addEventListener('click', openPeriodTimesModal);
  document.getElementById('periodTimesCloseBtn').addEventListener('click', closePeriodTimesModal);
  document.getElementById('periodTimesCancelBtn').addEventListener('click', closePeriodTimesModal);
  document.getElementById('periodTimesModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'periodTimesModalOverlay') closePeriodTimesModal();
  });

  /** Tab chọn Thứ đang sửa — CHỈ Thứ đang chọn (ptEditingDay) mới hiện/sửa
   * được trong thân modal, các Thứ khác GIỮ NGUYÊN không đụng tới, đúng
   * yêu cầu "mỗi Thứ áp dụng riêng" thay vì đổi chung cả tuần. */
  function renderPeriodTimesTabs() {
    const wrap = document.getElementById('periodTimesDayTabs');
    if (!wrap) return;
    wrap.innerHTML = M.WEEKDAYS.map((d) => {
      const key = String(d);
      const active = key === ptEditingDay ? ' pt-day-tab-active' : '';
      return `<button type="button" class="pt-day-tab${active}" data-day="${key}">${esc(M.WEEKDAY_LABELS[d])}</button>`;
    }).join('');
    wrap.querySelectorAll('.pt-day-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        ptEditingDay = btn.dataset.day;
        renderPeriodTimesTabs();
        renderPeriodTimesBody();
      });
    });
  }

  /** Tham số tự sinh giờ tiết CỦA ĐÚNG 1 Thứ×Buổi — lazy-tính lần đầu bằng
   * cách ĐỌC NGƯỢC từ periods đã có (nếu giáo viên từng lưu/gõ tay trước
   * đó), để mở modal lên không thấy toàn số trống dù đã cấu hình từ trước.
   * Không suy luận được (chưa có tiết nào) thì để trống — bắt giáo viên tự
   * gõ "Giờ vào" hoặc bấm 1 trong 2 nút cấp học để có gợi ý khởi điểm,
   * thay vì áp liều 1 giờ vào không chắc đúng trường họ đang dạy. */
  function getGenState(day, sessionKey) {
    const key = `${day}-${sessionKey}`;
    if (ptGenState[key]) return ptGenState[key];
    const periods = ptDraft[day][sessionKey];
    const minutes = periods.length ? M.periodMinutes(periods[0]) : null;
    const gap = periods.length > 1 ? M.gapMinutesBetween(periods, 0) : null;
    const breakMinutes = periods.length > M.BREAK_AFTER_INDEX + 1 ? M.gapMinutesBetween(periods, M.BREAK_AFTER_INDEX) : null;
    const gs = {
      minutes: minutes != null && minutes > 0 ? minutes : '',
      start: (periods.length && periods[0].start) || '',
      gap: gap != null && gap >= 0 ? gap : M.DEFAULT_GAP_MINUTES,
      breakMinutes: breakMinutes != null && breakMinutes >= 0 ? breakMinutes : '',
    };
    ptGenState[key] = gs;
    return gs;
  }

  /** Sinh lại mảng periods của ĐÚNG 1 Thứ×Buổi từ tham số hiện có
   * (getGenState) — giữ NGUYÊN số tiết đang có (thêm/bớt tiết vẫn qua nút
   * ➕/✕ như cũ, tách biệt với việc đổi giờ vào/nghỉ giải lao). Thiếu "Giờ
   * vào" hoặc "Số phút/tiết" thì bỏ qua (chưa đủ để tính), giữ nguyên
   * periods hiện có cho tới khi giáo viên điền đủ. */
  function regeneratePeriods(day, sessionKey) {
    const gs = getGenState(day, sessionKey);
    if (!gs.start || !gs.minutes) return;
    const count = ptDraft[day][sessionKey].length || (sessionKey === 'morning' ? 5 : 4);
    ptDraft[day][sessionKey] = M.generatePeriodTimes({
      startTime: gs.start,
      minutesPerPeriod: gs.minutes,
      gapMinutes: gs.gap === '' ? M.DEFAULT_GAP_MINUTES : gs.gap,
      breakAfterIndex: M.BREAK_AFTER_INDEX,
      breakMinutes: gs.breakMinutes === '' ? 0 : gs.breakMinutes,
      count,
    });
  }

  /** Nút "🟢 Tiểu học 35’/tiết · 🔵 THCS 45’/tiết" — CHỈ đặt SỐ PHÚT MỖI
   * TIẾT (đặc trưng thật sự cố định theo cấp học) cho ĐÚNG 1 buổi
   * (sessionKey) CỦA ĐÚNG 1 THỨ đang chọn (ptEditingDay), KHÔNG đụng tới
   * buổi/Thứ còn lại — giáo viên dạy Thứ 2 ở Tiểu học nhưng Thứ 3 lại ở
   * THCS (hoặc Sáng/Chiều khác cấp trong cùng 1 ngày) rất phổ biến.
   * "Giờ vào"/"Nghỉ giải lao" GIỮ NGUYÊN nếu giáo viên đã tự gõ — CHỈ điền
   * gợi ý khi ô đó còn trống — vì mỗi trường quy định giờ vào/giờ ra chơi
   * khác nhau (7h hoặc 7h30 vào, buổi chiều vào giờ khác, nghỉ giải lao
   * dài ngắn khác nhau), không có 1 khung giờ cố định đúng cho mọi nơi
   * (phản hồi người dùng — bản trước đè thẳng cả khung giờ Excel mẫu, sai
   * với những trường vào giờ khác). */
  function applyLevelPreset(sessionKey, levelKey) {
    if (!ptDraft) return;
    const gs = getGenState(ptEditingDay, sessionKey);
    gs.minutes = M.SCHOOL_LEVELS[levelKey].minutes;
    if (!gs.start) gs.start = M.SUGGESTED_START_TIME[levelKey][sessionKey];
    if (gs.breakMinutes === '') gs.breakMinutes = M.SUGGESTED_BREAK_MINUTES[levelKey][sessionKey];
    if (gs.gap === '') gs.gap = M.DEFAULT_GAP_MINUTES;
    regeneratePeriods(ptEditingDay, sessionKey);
    renderPeriodTimesBody();
    const sessLabel = sessionKey === 'morning' ? 'Sáng' : 'Chiều';
    toast(`✅ Đã đặt ${M.SCHOOL_LEVELS[levelKey].minutes}’/tiết cho buổi ${sessLabel} — ${M.WEEKDAY_LABELS[Number(ptEditingDay)]} (giờ vào/nghỉ giải lao xem lại bên dưới, sửa tay nếu trường bạn khác) — bấm "💾 Lưu giờ tiết" để áp dụng.`);
  }

  function renderPeriodTimesBody() {
    const wrap = document.getElementById('periodTimesBody');
    const dayDraft = ptDraft[ptEditingDay];
    function col(sessionKey, label) {
      const periods = dayDraft[sessionKey];
      const gs = getGenState(ptEditingDay, sessionKey);
      return `<div class="pt-col">
        <div class="pt-col-title">${label}</div>
        <div class="pt-gen-row">
          <label class="pt-gen-field"><span>Giờ vào tiết 1</span><input type="time" class="pt-gen-start form-input" data-session="${sessionKey}" value="${esc(gs.start)}"></label>
          <label class="pt-gen-field"><span>Phút/tiết</span><input type="number" min="1" class="pt-gen-minutes form-input" data-session="${sessionKey}" value="${esc(gs.minutes)}"></label>
        </div>
        <div class="pt-gen-row">
          <label class="pt-gen-field"><span>Chuyển tiết (phút)</span><input type="number" min="0" class="pt-gen-gap form-input" data-session="${sessionKey}" value="${esc(gs.gap)}"></label>
          <label class="pt-gen-field"><span>Nghỉ giải lao (phút)</span><input type="number" min="0" class="pt-gen-break form-input" data-session="${sessionKey}" value="${esc(gs.breakMinutes)}"></label>
        </div>
        <div class="pt-preset-row">
          <button type="button" class="btn btn-ghost pt-preset-btn" data-session="${sessionKey}" data-level="tieuHoc">🟢 Tiểu học · 35’/tiết</button>
          <button type="button" class="btn btn-ghost pt-preset-btn" data-session="${sessionKey}" data-level="thcs">🔵 THCS · 45’/tiết</button>
        </div>
        ${periods.map((p, pi) => `
          <div class="pt-row" data-session="${sessionKey}" data-idx="${pi}">
            <span class="pt-row-num">Tiết ${pi + 1}</span>
            <input type="time" class="pt-start form-input" value="${esc(p.start)}">
            <span>–</span>
            <input type="time" class="pt-end form-input" value="${esc(p.end)}">
            <button type="button" class="pt-remove-btn" title="Xoá tiết này">✕</button>
          </div>`).join('')}
        <button type="button" class="btn btn-ghost pt-add-btn" data-session="${sessionKey}">➕ Thêm tiết</button>
      </div>`;
    }
    wrap.innerHTML = col('morning', '☀️ Sáng') + col('afternoon', '🌙 Chiều');

    wrap.querySelectorAll('.pt-row').forEach((row) => {
      const s = row.dataset.session, idx = Number(row.dataset.idx);
      row.querySelector('.pt-start').addEventListener('input', (e) => { dayDraft[s][idx].start = e.target.value; });
      row.querySelector('.pt-end').addEventListener('input', (e) => { dayDraft[s][idx].end = e.target.value; });
      row.querySelector('.pt-remove-btn').addEventListener('click', () => { dayDraft[s].splice(idx, 1); renderPeriodTimesBody(); });
    });
    wrap.querySelectorAll('.pt-add-btn').forEach((btn) => {
      btn.addEventListener('click', () => { dayDraft[btn.dataset.session].push({ start: '', end: '' }); renderPeriodTimesBody(); });
    });
    wrap.querySelectorAll('.pt-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyLevelPreset(btn.dataset.session, btn.dataset.level));
    });
    // "Giờ vào"/"Phút mỗi tiết"/"Chuyển tiết"/"Nghỉ giải lao" — sửa xong (rời
    // ô, không phải từng phím gõ) là TỰ SINH lại ngay các tiết bên dưới,
    // không cần nút "Áp dụng" riêng.
    wrap.querySelectorAll('.pt-gen-start, .pt-gen-minutes, .pt-gen-gap, .pt-gen-break').forEach((input) => {
      input.addEventListener('change', (e) => {
        const s = e.target.dataset.session;
        const gs = getGenState(ptEditingDay, s);
        if (e.target.classList.contains('pt-gen-start')) gs.start = e.target.value;
        else if (e.target.classList.contains('pt-gen-minutes')) gs.minutes = e.target.value;
        else if (e.target.classList.contains('pt-gen-gap')) gs.gap = e.target.value;
        else gs.breakMinutes = e.target.value;
        regeneratePeriods(ptEditingDay, s);
        renderPeriodTimesBody();
      });
    });
  }

  /** "📋 Copy khung giờ Thứ này cho tất cả các Thứ còn lại" — tiện ích cho
   * trường hợp giáo viên dạy giống hệt nhau mọi ngày trong tuần (không
   * cần bấm 6 lần), KHÔNG chạy tự động — chỉ khi admin chủ động bấm. */
  document.getElementById('periodTimesCopyAllBtn')?.addEventListener('click', () => {
    if (!ptDraft) return;
    const source = ptDraft[ptEditingDay];
    M.WEEKDAYS.forEach((d) => {
      const key = String(d);
      if (key === ptEditingDay) return;
      ptDraft[key] = { morning: source.morning.map((p) => ({ ...p })), afternoon: source.afternoon.map((p) => ({ ...p })) };
      // Xoá cache tham số tự sinh (giờ vào/nghỉ giải lao...) của các Thứ vừa
      // bị ghi đè — lần sau mở lại Thứ đó, getGenState() sẽ ĐỌC NGƯỢC đúng
      // từ periods vừa copy thay vì giữ giá trị cũ (đã lệch với periods mới).
      delete ptGenState[`${key}-morning`];
      delete ptGenState[`${key}-afternoon`];
    });
    toast(`✅ Đã copy khung giờ ${M.WEEKDAY_LABELS[Number(ptEditingDay)]} sang mọi Thứ còn lại — bấm "💾 Lưu giờ tiết" để áp dụng.`);
  });

  document.getElementById('periodTimesSaveBtn').addEventListener('click', async () => {
    if (!state.teacherCode || !ptDraft) return;
    const dayDraft = ptDraft[ptEditingDay];
    if (!dayDraft.morning.length && !dayDraft.afternoon.length) { toast(`⚠️ ${M.WEEKDAY_LABELS[Number(ptEditingDay)]} cần ít nhất 1 tiết.`); return; }
    const btn = document.getElementById('periodTimesSaveBtn');
    btn.disabled = true;
    try {
      await window.EduRepositories.teachingPeriodTimes.upsert(state.teacherCode, { byDay: ptDraft });
      toast('✅ Đã lưu giờ tiết');
      closePeriodTimesModal();
      await loadAndRenderGrid(); // chuẩn hoá lại "days" theo số tiết mới (nếu vừa thêm/bớt)
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });
})();
