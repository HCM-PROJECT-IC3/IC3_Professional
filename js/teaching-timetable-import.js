/* ============================================================
   js/teaching-timetable-import.js
   Modal "📥 Nhập từ Excel" của tab "🗓️ TKB lớp" — nhập hàng loạt mã lớp
   (+ tuỳ chọn giờ tiết) cho NHIỀU giáo viên/nhiều ngày cùng lúc từ 1 file
   Excel, thay cho hướng "đọc ảnh" (OCR) đã bỏ vì không đủ tin cậy khi 1
   ảnh có nhiều giáo viên chia nhau theo cột/khoảng tiết.

   Định dạng "DANH SÁCH DÀI" (1 dòng = 1 tiết của 1 giáo viên), 9 cột:
   Mã GV | Tên GV | Trường | Thứ (2-7) | Buổi (Sáng/Chiều) | Tiết (số) |
   Mã lớp | Giờ bắt đầu | Giờ kết thúc.

   KIỂM DUYỆT trước khi ghi (mục tiêu chính: TRÁNH ĐIỀN NHẦM DỮ LIỆU CỦA
   GIÁO VIÊN KHÁC chỉ vì gõ sai/nhầm Mã GV trong file):
   - Mã GV: phải tồn tại trong hệ thống — sai → BỎ QUA dòng.
   - Tên GV: BẮT BUỘC, phải khớp (không phân biệt hoa/thường, dấu) đúng
     tên đã lưu của mã GV đó — đây là chốt chặn CHÍNH; thiếu/lệch tên →
     BỎ QUA dòng dù mã GV đúng cú pháp (phòng gõ nhầm mã của người khác
     mà tên vẫn để "trùng ngẫu nhiên" đúng hoặc bỏ trống qua mắt).
   - Giờ tiết: nếu khác giờ ĐÃ CẤU HÌNH trước đó cho đúng tiết này (tab
     "⏱️ Giờ tiết") → vẫn cho ghi nhưng CẢNH BÁO rõ trước khi xác nhận.
   - Trường: nếu có ghi, đối chiếu với "địa điểm" đã lưu ở tab "📅 Lịch
     tuần" (teaching_schedule) cho đúng giáo viên/Thứ/buổi/tuần đó — lệch
     thì CẢNH BÁO (không chặn, vì địa điểm ghi tự do nên tên gọi có thể
     không giống hệt nhau dù cùng 1 nơi).
   Cả 2 loại cảnh báo (giờ/trường) hiện THẲNG trong modal (không giấu
   trong <details>) để người nhập tự quyết định trước khi bấm "Nhập dữ
   liệu" — đúng tinh thần "kiểm duyệt" thay vì chỉ dựa vào cấu trúc dữ
   liệu (mỗi dòng đã ghi rõ mã GV) để coi là đủ an toàn.

   File tự chứa (IIFE riêng), đọc bối cảnh qua
   window.EduTeachingTimetableView.getContext() — không đụng vào state nội
   bộ của js/teaching-timetable.js.
   ============================================================ */
(function () {
  'use strict';

  const M = window.EduModels.TeachingTimetable;
  const MS = window.EduModels.TeachingSchedule; // chỉ mượn scheduleDocId() để đối chiếu "Trường" với tab Lịch tuần
  let pendingImport = null; // { byTeacher: Map<code, {rows[], pt, days}>, rowCount, errors[], warnings[] }

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
    if (err && err.code === 'permission-denied') return 'Chưa có quyền ghi — kiểm tra Firestore Rules.';
    return err && err.message ? err.message : String(err);
  }
  function normalizeVi(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim().replace(/\s+/g, ' ');
  }
  /** So khớp nới lỏng: 1 chuỗi chứa chuỗi kia, hoặc chia sẻ ít nhất 1 "từ"
   * đủ dài — dùng cho tên GV lẫn tên trường/địa điểm (OCR/gõ tay dễ lệch
   * vài ký tự hoặc viết tắt khác nhau, không nên đòi khớp tuyệt đối). */
  function fuzzyMatch(a, b) {
    const na = normalizeVi(a), nb = normalizeVi(b);
    if (!na || !nb) return false;
    if (na.includes(nb) || nb.includes(na)) return true;
    const wordsA = na.split(' ').filter((w) => w.length > 1);
    return wordsA.some((w) => nb.includes(w));
  }

  // ---- 🧾 Tải file mẫu ----
  document.getElementById('ttImportTemplateBtn').addEventListener('click', () => {
    if (!window.XLSX) { toast('⚠️ Chưa tải được thư viện Excel, kiểm tra mạng rồi thử lại.'); return; }
    const header = ['Mã GV', 'Tên GV', 'Trường', 'Thứ', 'Buổi', 'Tiết', 'Mã lớp', 'Giờ bắt đầu', 'Giờ kết thúc'];
    const sample = [
      ['HCM0092', 'Nguyễn Văn A', 'TiH Tân Tạo A', 2, 'Sáng', 1, '5/1', '07:30', '08:05'],
      ['HCM0092', 'Nguyễn Văn A', 'TiH Tân Tạo A', 2, 'Sáng', 2, '5/1', '08:10', '08:45'],
      ['HCM0092', 'Nguyễn Văn A', 'THCS Bình Tây', 3, 'Chiều', 4, '4/6', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, ...sample]);
    ws['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TKB');
    XLSX.writeFile(wb, 'mau-nhap-tkb-lop.xlsx');
  });

  // ---- Mở modal ----
  document.getElementById('ttImportBtn').addEventListener('click', () => {
    if (!window.XLSX) { toast('⚠️ Chưa tải được thư viện đọc Excel, kiểm tra mạng rồi thử lại.'); return; }
    if (!window.EduTeachingTimetableView) { toast('⚠️ Trang chưa sẵn sàng, thử lại sau giây lát.'); return; }
    const ctx = window.EduTeachingTimetableView.getContext();
    if (!ctx.weekKey) { toast('⚠️ Chọn 1 tuần ở tab "TKB lớp" trước khi nhập.'); return; }
    resetModal();
    document.getElementById('ttImportWeekLabel').textContent = ctx.weekLabel || ctx.weekKey;
    document.getElementById('ttImportModalOverlay').classList.add('show');
  });
  function closeImportModal() {
    document.getElementById('ttImportModalOverlay').classList.remove('show');
    resetModal();
  }
  function resetModal() {
    pendingImport = null;
    document.getElementById('ttImportFileInput').value = '';
    document.getElementById('ttImportProgress').classList.add('force-hide');
    document.getElementById('ttImportSummary').classList.add('force-hide');
    document.getElementById('ttImportWarnList').classList.add('force-hide');
    document.getElementById('ttImportErrorsWrap').classList.add('force-hide');
    document.getElementById('ttImportConfirmBtn').disabled = true;
  }
  document.getElementById('ttImportCloseBtn').addEventListener('click', closeImportModal);
  document.getElementById('ttImportCancelBtn').addEventListener('click', closeImportModal);
  document.getElementById('ttImportModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'ttImportModalOverlay') closeImportModal();
  });

  const SESSION_ALIASES = {
    sang: 'morning', s: 'morning', morning: 'morning', am: 'morning',
    chieu: 'afternoon', c: 'afternoon', afternoon: 'afternoon', pm: 'afternoon',
  };
  function parseSession(raw) {
    return SESSION_ALIASES[normalizeVi(raw).replace(/\s+/g, '')] || '';
  }
  const TIME_FORMAT_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  function normalizeTime(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = s.match(TIME_FORMAT_RE);
    if (!m) return null; // sai định dạng
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  document.getElementById('ttImportFileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const ctx = window.EduTeachingTimetableView.getContext();
    const knownTeachers = new Map((ctx.teachers || []).map((t) => [t.code.toUpperCase(), t]));
    const reader = new FileReader();
    reader.onerror = () => toast('⚠️ Không đọc được file, thử lại.');
    reader.onload = async (ev) => {
      const progressEl = document.getElementById('ttImportProgress');
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        const parsed = parseRows(rows, knownTeachers);
        if (!parsed.rowCount) {
          toast('⚠️ Không có dòng hợp lệ nào trong file (kiểm tra lại Mã GV/Tên GV có khớp hệ thống không).');
          return;
        }
        progressEl.classList.remove('force-hide');
        await crossCheckAndFinalize(parsed, ctx);
      } catch (err) {
        toast('⚠️ ' + err.message);
      } finally {
        progressEl.classList.add('force-hide');
      }
    };
    reader.readAsArrayBuffer(file);
  });

  /** Dò dòng header (chứa "ma gv") để bỏ qua đúng — phòng khi file mẫu bị
   * chèn thêm dòng tiêu đề/trống ở trên, không cứng theo đúng dòng 1. */
  function findHeaderRowIndex(rows) {
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      if (normalizeVi(rows[i][0]).includes('ma gv')) return i;
    }
    return 0;
  }

  /** Bước 1 (đồng bộ): parse + validate những gì kiểm được ngay từ chính
   * nội dung file (mã GV có tồn tại, TÊN GV có khớp mã đó, định dạng
   * Thứ/Buổi/Tiết/giờ) — mọi dòng KHÔNG đạt bị loại (skip) NGAY, không
   * đi tiếp bước đối chiếu dữ liệu đã lưu (bước 2, cần đọc Firestore). */
  function parseRows(rows, knownTeachers) {
    const headerIdx = findHeaderRowIndex(rows);
    const byTeacher = new Map(); // code -> rows[]
    const errors = [];
    let rowCount = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => String(c).trim() === '')) continue; // dòng trống — bỏ qua êm, không tính lỗi
      const lineNo = i + 1;
      const codeRaw = String(row[0] || '').trim();
      const tenGvRaw = String(row[1] || '').trim();
      const truongRaw = String(row[2] || '').trim();
      const thuRaw = String(row[3] || '').trim();
      const buoiRaw = String(row[4] || '').trim();
      const tietRaw = String(row[5] || '').trim();
      const lopRaw = String(row[6] || '').trim();
      const gioBatDauRaw = row[7];
      const gioKetThucRaw = row[8];

      const code = codeRaw.toUpperCase();
      const teacher = knownTeachers.get(code);
      if (!code || !teacher) { errors.push(`Dòng ${lineNo}: mã GV "${esc(codeRaw)}" không tồn tại trong hệ thống — bỏ qua.`); continue; }

      // ---- Chốt chặn CHÍNH: Tên GV bắt buộc + phải khớp đúng mã ----
      if (!tenGvRaw) { errors.push(`Dòng ${lineNo}: thiếu "Tên GV" để đối chiếu với mã ${esc(code)} (bắt buộc, tránh nhầm mã giáo viên khác) — bỏ qua.`); continue; }
      if (!fuzzyMatch(tenGvRaw, teacher.name)) { errors.push(`Dòng ${lineNo}: Tên GV "${esc(tenGvRaw)}" KHÔNG khớp tên đã lưu của mã ${esc(code)} ("${esc(teacher.name)}") — bỏ qua, kiểm tra lại có gõ nhầm mã không.`); continue; }

      const thu = parseInt(thuRaw, 10);
      if (!M.WEEKDAYS.includes(thu)) { errors.push(`Dòng ${lineNo}: "Thứ" phải là số 2-7 (đang là "${esc(thuRaw)}") — bỏ qua.`); continue; }

      const session = parseSession(buoiRaw);
      if (!session) { errors.push(`Dòng ${lineNo}: "Buổi" phải là Sáng/Chiều (đang là "${esc(buoiRaw)}") — bỏ qua.`); continue; }

      const tiet = parseInt(tietRaw, 10);
      if (!Number.isInteger(tiet) || tiet < 1 || tiet > 12) { errors.push(`Dòng ${lineNo}: "Tiết" phải là số nguyên ≥1 (đang là "${esc(tietRaw)}") — bỏ qua.`); continue; }

      const gioBatDau = normalizeTime(gioBatDauRaw);
      const gioKetThuc = normalizeTime(gioKetThucRaw);
      if (gioBatDau === null || gioKetThuc === null) { errors.push(`Dòng ${lineNo}: giờ phải dạng "HH:MM" (vd "07:30") — bỏ qua.`); continue; }

      if (!lopRaw && !gioBatDau && !gioKetThuc) { errors.push(`Dòng ${lineNo}: không có Mã lớp lẫn giờ tiết nào để nhập — bỏ qua.`); continue; }

      const list = byTeacher.get(code) || [];
      list.push({
        lineNo, teacherCode: code, teacherName: teacher.name, truong: truongRaw,
        thu, session, tietIdx: tiet - 1, maLop: lopRaw, gioBatDau: gioBatDau || '', gioKetThuc: gioKetThuc || '',
      });
      byTeacher.set(code, list);
      rowCount++;
    }
    return { byTeacher, rowCount, errors };
  }

  /** Bước 2 (bất đồng bộ — cần đọc Firestore): đối chiếu GIỜ TIẾT với
   * "⏱️ Giờ tiết" đã cấu hình, và TRƯỜNG với "địa điểm" đã ghi ở tab
   * "📅 Lịch tuần" — CẢNH BÁO (không loại dòng) vì cả 2 đều là dữ liệu tự
   * do, chỉ cần người nhập TỰ THẤY để xác nhận trước khi lưu. Đồng thời
   * chuẩn bị sẵn `pt`/`days` cho từng giáo viên để bước Xác nhận ghi
   * thẳng vào Firestore mà không cần đọc lại lần 2. */
  async function crossCheckAndFinalize(parsed, ctx) {
    const { byTeacher, rowCount, errors } = parsed;
    const warnings = [];

    for (const [code, rows] of byTeacher.entries()) {
      const [existingPt, existingSchedule] = await Promise.all([
        window.EduRepositories.teachingPeriodTimes.getById(code),
        MS ? window.EduRepositories.teachingSchedule.getById(MS.scheduleDocId(code, ctx.weekKey)) : Promise.resolve(null),
      ]);
      const pt = M.clonePeriodTimes(existingPt);

      rows.forEach((r) => {
        const arr = pt[r.session];
        while (arr.length <= r.tietIdx) arr.push({ start: '', end: '' });
        const cur = arr[r.tietIdx];
        // ---- Cảnh báo GIỜ TIẾT lệch so với đã cấu hình ----
        if (r.gioBatDau && cur.start && cur.start !== r.gioBatDau) {
          warnings.push(`Dòng ${r.lineNo} (${esc(r.teacherName)}, Thứ ${r.thu}, tiết ${r.tietIdx + 1}): giờ bắt đầu trong file "${esc(r.gioBatDau)}" KHÁC giờ đã cấu hình "${esc(cur.start)}".`);
        }
        if (r.gioKetThuc && cur.end && cur.end !== r.gioKetThuc) {
          warnings.push(`Dòng ${r.lineNo} (${esc(r.teacherName)}, Thứ ${r.thu}, tiết ${r.tietIdx + 1}): giờ kết thúc trong file "${esc(r.gioKetThuc)}" KHÁC giờ đã cấu hình "${esc(cur.end)}".`);
        }
        if (r.gioBatDau) cur.start = r.gioBatDau;
        if (r.gioKetThuc) cur.end = r.gioKetThuc;

        // ---- Cảnh báo TRƯỜNG lệch so với "địa điểm" ở tab Lịch tuần ----
        if (r.truong) {
          const sess = existingSchedule && existingSchedule.days && existingSchedule.days[String(r.thu)] && existingSchedule.days[String(r.thu)][r.session];
          const location = sess && sess.location ? sess.location : '';
          if (location && !fuzzyMatch(r.truong, location)) {
            warnings.push(`Dòng ${r.lineNo} (${esc(r.teacherName)}, Thứ ${r.thu}): Trường trong file "${esc(r.truong)}" có vẻ KHÁC địa điểm đã ghi ở Lịch tuần ("${esc(location)}") — kiểm tra lại.`);
          }
        }
      });

      const existingTt = await window.EduRepositories.teachingTimetable.getById(M.docId(code, ctx.weekKey));
      const days = M.normalizeDays(existingTt && existingTt.days, pt);
      // Ghi CẢ mã lớp LẪN trường vào đúng ô-tiết ({maLop, truong}) — cột
      // "Trường" trong file giờ không chỉ để đối chiếu cảnh báo ở trên mà
      // còn được LƯU THẲNG vào TKB lớp, vì 1 giáo viên có thể dạy nhiều
      // trường khác nhau ngay trong cùng 1 buổi (khác field "địa điểm" cấp
      // buổi ở tab Lịch tuần).
      rows.forEach((r) => {
        const cell = days[String(r.thu)][r.session][r.tietIdx];
        if (r.maLop !== '') cell.maLop = r.maLop;
        if (r.truong) cell.truong = r.truong;
      });

      byTeacher.set(code, { rows, pt, days });
    }

    pendingImport = { byTeacher, rowCount, errors, warnings };
    renderPreview();
  }

  function renderPreview() {
    const { byTeacher, rowCount, errors, warnings } = pendingImport;
    document.getElementById('ttImportRowCount').textContent = rowCount;
    document.getElementById('ttImportTeacherCount').textContent = byTeacher.size;
    document.getElementById('ttImportSummary').classList.remove('force-hide');

    const skippedStat = document.getElementById('ttImportSkippedStat');
    skippedStat.hidden = errors.length === 0;
    document.getElementById('ttImportSkippedCount').textContent = errors.length;
    document.getElementById('ttImportErrorsWrap').classList.toggle('force-hide', errors.length === 0);
    document.getElementById('ttImportErrorsText').value = errors.join('\n');

    const warnStat = document.getElementById('ttImportWarnStat');
    warnStat.hidden = warnings.length === 0;
    document.getElementById('ttImportWarnCount').textContent = warnings.length;
    const warnList = document.getElementById('ttImportWarnList');
    warnList.classList.toggle('force-hide', warnings.length === 0);
    warnList.innerHTML = warnings.map((w) => `<div class="tt-import-check-row">⚠️ ${w}</div>`).join('');

    document.getElementById('ttImportConfirmBtn').disabled = false;
  }

  document.getElementById('ttImportConfirmBtn').addEventListener('click', async () => {
    if (!pendingImport) return;
    const ctx = window.EduTeachingTimetableView.getContext();
    if (!ctx.weekKey) { toast('⚠️ Không xác định được tuần đang chọn, đóng modal rồi thử lại.'); return; }
    const btn = document.getElementById('ttImportConfirmBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang nhập...';
    try {
      const db = window.EduFirebase.db;
      const ptCol = window.EduRepositories.teachingPeriodTimes.col();
      const ttCol = window.EduRepositories.teachingTimetable.col();
      let batch = db.batch();
      let ops = 0;
      const flushIfNeeded = async () => { if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } };

      // Dùng ĐÚNG `pt`/`days` đã tính sẵn ở bước kiểm duyệt (crossCheckAndFinalize)
      // — không đọc lại Firestore lần 2, tránh lệch dữ liệu giữa lúc xem trước
      // (đã cảnh báo giờ/trường) và lúc thực sự ghi.
      for (const [code, entry] of pendingImport.byTeacher.entries()) {
        const { rows, pt, days } = entry;
        batch.set(ptCol.doc(code), { morning: pt.morning, afternoon: pt.afternoon });
        ops++; await flushIfNeeded();

        const docId = M.docId(code, ctx.weekKey);
        batch.set(ttCol.doc(docId), {
          teacherCode: code,
          teacherName: rows[0].teacherName,
          weekKey: ctx.weekKey,
          weekLabel: ctx.weekLabel || ctx.weekKey,
          days,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        ops++; await flushIfNeeded();
      }
      if (ops > 0) await batch.commit();

      toast(`✅ Đã nhập ${pendingImport.rowCount} dòng cho ${pendingImport.byTeacher.size} giáo viên.`);
      closeImportModal();
      window.EduTeachingTimetableView.reload();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Nhập dữ liệu';
    }
  });
})();
