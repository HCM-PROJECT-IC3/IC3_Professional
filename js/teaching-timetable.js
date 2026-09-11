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
   - teacher: chỉ XEM (không sửa) đúng TKB của chính mình — teaching_timetable
     chỉ cho phép admin write, nên mọi control chỉnh sửa (⏱️ Giờ tiết/📥 Nhập
     Excel/💾 Lưu) đều ẩn, ô nhập chuyển readonly (xem applyTeacherReadOnlyUI()).
   - coordinator (Điều phối đào tạo): KHÔNG được vào trang này nữa — chặn từ
     EDU_ALLOWED_ROLES ở teaching-schedule.html, file này không cần tự kiểm.

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
    periodTimes: null, // { morning:[{start,end}], afternoon:[{start,end}] } của giáo viên đang chọn
    days: null,         // { "2".."7": { morning:[mã lớp...], afternoon:[mã lớp...] } }
    truongOptions: [],  // gợi ý "Trường" (datalist) — map từ tab Lịch tuần + lịch sử TKB của GV đang chọn
    lopOptions: [],      // gợi ý "Mã lớp" (datalist) — lịch sử TKB của GV đang chọn + mọi GV khác trong tuần đang xem
    autoCells: new Set(), // set "day-session-idx" các ô vừa được tự động điền từ Lịch tuần (xem applyScheduleAutoFill) — chỉ để tô sáng UI, không lưu Firestore
  };
  let ptDraft = null; // bản nháp đang sửa trong modal "⏱️ Giờ tiết"

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
        periodTimes: state.periodTimes,
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
    }
    loadTeachersAndWeeks();
  });

  /** Ẩn mọi control CHỈNH SỬA (⏱️ Giờ tiết/📥 Nhập Excel/💾 Lưu) — theo
   * firestore.rules, teaching_timetable + teaching_timetable_periods chỉ
   * cho phép admin ghi, giáo viên chỉ đọc được đúng bản ghi của chính mình.
   * Ô "Mã lớp"/"Trường" trong lưới cũng chuyển readonly (xem renderGrid()). */
  function applyTeacherReadOnlyUI() {
    document.getElementById('ttPeriodTimesBtn')?.classList.add('force-hide');
    document.getElementById('ttImportBtn')?.classList.add('force-hide');
    document.getElementById('ttSaveBtn')?.classList.add('force-hide');
    const teacherSel = document.getElementById('ttTeacherSelect');
    if (teacherSel) teacherSel.disabled = true; // GV chỉ có đúng 1 lựa chọn (chính mình), không cần chọn tay
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
      state.periodTimes = M.clonePeriodTimes(ptDoc);
      state.days = M.normalizeDays(ttDoc && ttDoc.days, state.periodTimes);
      applyScheduleAutoFill(scheduleDoc);
      emptyEl.classList.add('force-hide');
      wrapEl.classList.remove('force-hide');
      renderPosterHead();
      renderGrid();
      // Gợi ý gõ nhanh chỉ cần cho chế độ SỬA (admin) — bỏ qua ở chế độ
      // XEM của giáo viên, vừa không cần thiết (ô đã readonly) vừa tránh
      // gọi listByWeek()/listByTeacher() (list cả collection) mà
      // firestore.rules không cho phép role teacher.
      if (state.role !== 'teacher') loadSuggestions(state.teacherCode, state.weekKey); // không await — nạp gợi ý xong render lại datalist riêng, không chặn lưới chính hiện ngay
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
   * mẫu giấy. */
  function renderGrid() {
    const table = document.getElementById('ttGrid');
    const dayHeaders = M.WEEKDAYS.map((d, i) => `<th class="tt-day-head tt-day-${i}">${M.WEEKDAY_LABELS[d]}</th>`).join('');
    // Giáo viên chỉ được XEM (teaching_timetable chỉ cho admin write) —
    // khoá cứng mọi ô nhập, không gắn listener sửa/dán bên dưới.
    const readOnly = state.role === 'teacher';
    const readOnlyAttr = readOnly ? ' readonly' : '';

    function sessionRows(sessionKey) {
      const periods = state.periodTimes[sessionKey];
      const hasBreak = periods.length > M.BREAK_AFTER_INDEX + 1;
      const rowspan = periods.length + (hasBreak ? 1 : 0);
      const icon = sessionKey === 'morning' ? '☀️' : '🌙';
      const label = M.SESSION_LABELS[sessionKey];
      const rows = [];
      periods.forEach((p, pi) => {
        rows.push(`<tr>
          ${pi === 0 ? `<td class="tt-buoi-cell tt-sess-${sessionKey}" rowspan="${rowspan}">${icon}<br>${label}</td>` : ''}
          <td class="tt-tiet-cell">${pi + 1}</td>
          <td class="tt-time-cell">${esc(p.start)} - ${esc(p.end)}</td>
          ${M.WEEKDAYS.map((d) => {
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
              <input type="text" class="tt-input tt-input-lop" list="ttLopOptions" data-day="${d}" data-session="${sessionKey}" data-period-idx="${pi}" data-field="maLop" value="${esc(cell.maLop)}" placeholder="Mã lớp"${readOnlyAttr}>
              <input type="text" class="tt-input tt-input-truong" list="ttTruongOptions" data-day="${d}" data-session="${sessionKey}" data-period-idx="${pi}" data-field="truong" value="${esc(cell.truong)}" placeholder="Trường..."${readOnlyAttr}>
            </div></td>`;
          }).join('')}
        </tr>`);
        if (hasBreak && pi === M.BREAK_AFTER_INDEX) {
          // Cột "Buổi" đang bị chiếm bởi ô rowspan từ dòng tiết đầu tiên
          // của buổi này (bao trùm cả dòng "Ra chơi") nên dòng này KHÔNG có
          // <td> riêng cho cột đó — colspan chỉ cần che 2 cột (Tiết/Thời
          // gian) + 6 cột Thứ, không phải toàn bộ 3+6 cột của bảng.
          rows.push(`<tr class="tt-break-row"><td class="tt-break-label" colspan="${2 + M.WEEKDAYS.length}">☕ Ra chơi</td></tr>`);
        }
      });
      return rows.join('');
    }

    table.innerHTML = `
      <thead><tr><th>Buổi</th><th>Tiết</th><th>Thời gian</th>${dayHeaders}</tr></thead>
      <tbody>${sessionRows('morning')}${sessionRows('afternoon')}</tbody>`;

    if (!readOnly) {
      table.querySelectorAll('.tt-input').forEach((el) => {
        el.addEventListener('input', () => {
          const d = el.dataset.day, s = el.dataset.session, pi = Number(el.dataset.periodIdx), f = el.dataset.field;
          state.days[d][s][pi][f] = el.value;
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
    M.SESSIONS.forEach((s) => { state.periodTimes[s].forEach((_, idx) => order.push({ session: s, idx })); });
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
  // In — chỉ cần hộp thoại in của trình duyệt (Ctrl+P), scope theo
  // .tt-printing (xem css/teaching-schedule.css @media print) để chỉ in
  // đúng khối thời khoá biểu, không kèm sidebar/topbar/nút.
  // ------------------------------------------------------------
  document.getElementById('ttPrintBtn')?.addEventListener('click', () => {
    if (!state.teacherCode || !state.weekKey) { toast('⚠️ Chọn tuần và giáo viên trước.'); return; }
    document.body.classList.add('tt-printing');
    window.print();
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('tt-printing'));

  // ------------------------------------------------------------
  // MODAL: ⏱️ Giờ tiết — khung giờ riêng của giáo viên đang chọn, áp dụng
  // mọi tuần (không lặp cấu hình theo tuần).
  // ------------------------------------------------------------
  function openPeriodTimesModal() {
    if (!state.teacherCode) { toast('⚠️ Chọn giáo viên trước.'); return; }
    const t = state.teachers.find((x) => x.code === state.teacherCode);
    document.getElementById('periodTimesModalTitle').textContent = `⏱️ Giờ tiết — ${t ? t.name : state.teacherCode}`;
    ptDraft = M.clonePeriodTimes(state.periodTimes);
    renderPeriodTimesBody();
    document.getElementById('periodTimesModalOverlay').classList.add('show');
  }
  function closePeriodTimesModal() {
    document.getElementById('periodTimesModalOverlay').classList.remove('show');
    ptDraft = null;
  }
  document.getElementById('ttPeriodTimesBtn').addEventListener('click', openPeriodTimesModal);
  document.getElementById('periodTimesCloseBtn').addEventListener('click', closePeriodTimesModal);
  document.getElementById('periodTimesCancelBtn').addEventListener('click', closePeriodTimesModal);
  document.getElementById('periodTimesModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'periodTimesModalOverlay') closePeriodTimesModal();
  });

  function renderPeriodTimesBody() {
    const wrap = document.getElementById('periodTimesBody');
    function col(sessionKey, label) {
      const periods = ptDraft[sessionKey];
      return `<div class="pt-col">
        <div class="pt-col-title">${label}</div>
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
      row.querySelector('.pt-start').addEventListener('input', (e) => { ptDraft[s][idx].start = e.target.value; });
      row.querySelector('.pt-end').addEventListener('input', (e) => { ptDraft[s][idx].end = e.target.value; });
      row.querySelector('.pt-remove-btn').addEventListener('click', () => { ptDraft[s].splice(idx, 1); renderPeriodTimesBody(); });
    });
    wrap.querySelectorAll('.pt-add-btn').forEach((btn) => {
      btn.addEventListener('click', () => { ptDraft[btn.dataset.session].push({ start: '', end: '' }); renderPeriodTimesBody(); });
    });
  }

  document.getElementById('periodTimesSaveBtn').addEventListener('click', async () => {
    if (!state.teacherCode || !ptDraft) return;
    if (!ptDraft.morning.length && !ptDraft.afternoon.length) { toast('⚠️ Cần ít nhất 1 tiết.'); return; }
    const btn = document.getElementById('periodTimesSaveBtn');
    btn.disabled = true;
    try {
      await window.EduRepositories.teachingPeriodTimes.upsert(state.teacherCode, { morning: ptDraft.morning, afternoon: ptDraft.afternoon });
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
