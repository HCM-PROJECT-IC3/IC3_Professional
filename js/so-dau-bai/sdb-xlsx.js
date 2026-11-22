/* ============================================================
   js/so-dau-bai/sdb-xlsx.js — Xuất "Bảng theo dõi, nhận xét tình hình giảng dạy" của 1 tuần ra file Excel (.xlsx)
   định dạng sẵn để in nộp trường: quốc hiệu, tiêu đề, bảng có viền, tiêu đề cột lặp lại mỗi trang, A4 ngang vừa 1 trang
   bề ngang, đánh số trang, tổng số tiết theo GV, khối ký tên.
   Dùng ExcelJS (giữ được định dạng; SheetJS bản miễn phí không ghi được kiểu ô) — chỉ tải khi bấm xuất lần đầu.
   0 Firebase, 0 Apps Script: file tạo ngay trên máy. Muốn có link Google Sheet: tải file lên Drive → "Mở bằng Google Trang tính"
   (giữ nguyên viền, cỡ chữ, ô gộp).
   build(ExcelJS, data) là hàm thuần (test chạy được trong Node); exportWeek(data) tải thư viện rồi lưu file.
   ============================================================ */
(function (global) {
  'use strict';

  // Bản tự chứa (ExcelJS 4.4.0, dùng chung với Báo cáo/Soạn đề) — mạng trường chặn CDN / offline vẫn xuất được.
  // CDN chỉ là dự phòng khi file cục bộ lỗi.
  const SRC = ['js/vendor/exceljs.min.js', 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'];
  const FONT = 'Times New Roman';
  const COLS = [
    { h: 'Thứ, ngày', w: 12 }, { h: 'Lớp', w: 7 }, { h: 'Tiết TKB', w: 10 }, { h: 'Tiết PPCT', w: 7.5 },
    { h: 'Tên bài dạy', w: 32 }, { h: 'SL', w: 5.5 }, { h: 'Họ tên', w: 22 },
    { h: 'Nhận xét (ưu điểm, hạn chế)', w: 46 }, { h: 'Giáo viên', w: 17 }, { h: 'Ghi chú', w: 11 },
  ];
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };

  let loading = null;
  function lib() {
    if (global.ExcelJS) return Promise.resolve(global.ExcelJS);
    if (!loading) {
      const one = (src) => new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = () => (global.ExcelJS ? ok(global.ExcelJS) : no(new Error('Không tải được thư viện Excel')));
        s.onerror = () => { s.remove(); no(new Error('Không tải được thư viện Excel — kiểm tra mạng rồi thử lại')); };
        document.head.appendChild(s);
      });
      loading = SRC.slice(1).reduce((p, src) => p.catch(() => one(src)), one(SRC[0]))
        .catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  /**
   * data: { ubnd, school, title, weekText, rows: [{ thu, date, cls, tkb, ppct, lesson, absN, absNames, cmt, teacher, note }],
   *         perTeacher: [[tên, số tiết]], place, signLeft, signRight, signName }
   * → Workbook (chưa ghi file).
   */
  function build(ExcelJS, data) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sổ đầu bài — IC3 Professional';
    wb.created = new Date();
    const ws = wb.addWorksheet('Tuần', {
      pageSetup: {
        paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.55, header: 0.25, footer: 0.25 },
        printTitlesRow: '7:8',
      },
      headerFooter: { oddFooter: '&C&"Times New Roman"&10Trang &P/&N' },
      views: [{ state: 'frozen', ySplit: 8 }],
    });
    ws.columns = COLS.map((c) => ({ width: c.w }));
    const last = COLS.length;
    const font = (o) => Object.assign({ name: FONT, size: 12 }, o || {});
    const put = (r, c1, c2, v, f, a) => {
      if (c2 > c1) ws.mergeCells(r, c1, r, c2);
      const cell = ws.getCell(r, c1);
      cell.value = v;
      cell.font = font(f);
      cell.alignment = Object.assign({ horizontal: 'center', vertical: 'middle', wrapText: true }, a || {});
      return cell;
    };

    // Quốc hiệu (trái: cơ quan · phải: quốc hiệu)
    put(1, 1, 4, String(data.ubnd || '').toUpperCase(), { size: 12 });
    put(2, 1, 4, String(data.school || '').toUpperCase(), { bold: true });
    put(1, 6, last, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true });
    put(2, 6, last, 'Độc lập - Tự do - Hạnh phúc', { bold: true, underline: true, size: 13 });
    put(4, 1, last, String(data.title || 'BẢNG THEO DÕI, NHẬN XÉT TÌNH HÌNH GIẢNG DẠY').toUpperCase(), { bold: true, size: 14 });
    ws.getRow(4).height = 22;
    put(5, 1, last, data.weekText || '', { italic: true });

    // Tiêu đề bảng: 2 dòng, "Học sinh vắng" gộp trên SL + Họ tên
    COLS.forEach((c, i) => {
      const col = i + 1;
      if (col === 6 || col === 7) return;
      ws.mergeCells(7, col, 8, col);
      const cell = ws.getCell(7, col);
      cell.value = c.h;
    });
    ws.mergeCells(7, 6, 7, 7);
    ws.getCell(7, 6).value = 'Học sinh vắng';
    ws.getCell(8, 6).value = COLS[5].h;
    ws.getCell(8, 7).value = COLS[6].h;
    [7, 8].forEach((r) => {
      ws.getRow(r).height = 20;
      for (let c = 1; c <= last; c++) {
        const cell = ws.getCell(r, c);
        cell.font = font({ bold: true });
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = BOX;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF7' } };
      }
    });

    // Dòng tiết
    let r = 9;
    (data.rows || []).forEach((x) => {
      const vals = [`${x.thu || ''}\n${x.date || ''}`.trim(), x.cls, x.tkb, x.ppct, x.lesson, x.absN, x.absNames, x.cmt, x.teacher, x.note];
      const row = ws.getRow(r);
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        const n = i === 3 || i === 5 ? Number(v) : NaN;
        cell.value = v === '' || v == null ? null : (!isNaN(n) && String(v).trim() !== '' ? n : String(v));
        cell.font = font();
        cell.border = BOX;
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: [4, 6, 7].includes(i) ? 'left' : 'center' };
      });
      // Chiều cao theo ô dài nhất (Excel không tự giãn dòng khi mở file tạo bằng thư viện)
      const lines = (s, w) => String(s || '').split('\n').reduce((t, p) => t + Math.max(1, Math.ceil(p.length / (w * 1.15))), 0);
      row.height = Math.max(2, lines(x.lesson, COLS[4].w), lines(x.absNames, COLS[6].w), lines(x.cmt, COLS[7].w), lines(x.teacher, COLS[8].w)) * 15.5 + 4;
      r++;
    });

    // Tổng số tiết
    r++;
    (data.perTeacher || []).forEach(([t, k]) => {
      put(r, 1, 5, `Số tiết GV ${t} dạy: ${String(k).padStart(2, '0')} tiết.`, {}, { horizontal: 'left' });
      r++;
    });
    const total = (data.rows || []).length;
    put(r, 1, 5, `Tổng cộng: ${total} tiết`, { bold: true }, { horizontal: 'left' });
    r += 2;

    // Ký tên
    const d = new Date();
    put(r, 7, last, `${data.place || '.................'}, ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`, { italic: true });
    r++;
    put(r, 1, 4, data.signLeft || 'XÁC NHẬN CỦA BAN GIÁM HIỆU', { bold: true });
    put(r, 7, last, data.signRight || 'NGƯỜI LẬP BẢNG', { bold: true });
    r++;
    put(r, 7, last, '(Ký và ghi rõ họ tên)', { italic: true, size: 11 });
    r += 4;
    if (data.signName) put(r, 7, last, data.signName, { bold: true });
    return wb;
  }

  const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

  async function exportWeek(data) {
    const ExcelJS = await lib();
    const buf = await build(ExcelJS, data).xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.fileName || 'Bang_tuan'}_${slug(data.school)}.xlsx`.replace(/__+/g, '_');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const api = { build, exportWeek, COLS };
  global.EduSdbXlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
