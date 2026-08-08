/* ============================================================
   js/export/excel-exporter.js
   Engine xuất Excel (Commit #6) cho bảng "Danh sách học sinh" ở
   Coordinator Dashboard & Teacher Dashboard.

   GHI CHÚ KỸ THUẬT (khác 1 chữ so với LMAP-ARCHITECTURE.md):
   Tài liệu gốc ghi "engine SheetJS". Khi triển khai thật, SheetJS bản
   miễn phí (js-xlsx Community) KHÔNG ghi được style/tô màu/conditional
   formatting khi xuất file .xlsx (chỉ đọc được, không ghi được — giới
   hạn đã biết của bản Community, xem sheetjs.com/pro để so sánh). Vì
   yêu cầu bắt buộc phải có "conditional formatting", file này dùng
   ExcelJS (js/vendor/exceljs.min.js) thay cho xlsx.full.min.js — vẫn
   xuất ra đúng định dạng .xlsx, vẫn 1 file, vẫn 7 sheet đúng spec,
   chỉ đổi thư viện phía dưới để tô màu/pivot thật sự chạy được.

   7 SHEET:
   1. Tổng quan       — KPI card (7 chỉ số, có tô nền màu)
   2. Danh sách HS     — bảng đầy đủ, conditional formatting theo điểm
   3. Điểm theo lớp    — nhóm điểm TB theo lớp (nguồn Bar/Radar chart)
   4. Xu hướng theo ngày — điểm TB theo ngày (nguồn Line chart)
   5. Ma trận Lớp×Bài thi — heatmap dạng bảng, color-scale thật của Excel
   6. Cần hỗ trợ       — pivot: học sinh điểm TB < 60%, yếu nhất trước
   7. Xuất sắc         — pivot: Top 20 học sinh điểm TB cao nhất

   Nạp SAU: js/vendor/exceljs.min.js, analytics-service.js,
            exam-history.model.js, roster.model.js.
   ============================================================ */
(function (global) {
  'use strict';

  const HEADER_FILL = 'FF4F6BFF';
  const HEADER_FONT = 'FFFFFFFF';
  const PASS_FILL = 'FFD9F5E3';
  const PASS_FONT = 'FF1B7A43';
  const FAIL_FILL = 'FFFCE1DE';
  const FAIL_FONT = 'FFB23A2E';
  const KPI_FILL = 'FFEFF2FF';
  const BAND_FILL = 'FFF7F8FC';

  function nowLabel() {
    return new Date().toLocaleString('vi-VN');
  }

  function styleHeaderRow(row) {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: HEADER_FONT } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D5E5' } } };
    });
    row.height = 22;
  }

  function zebra(ws, startRow) {
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= startRow) return;
      if ((rowNumber - startRow) % 2 === 0) {
        row.eachCell((cell) => {
          if (!cell.fill || cell.fill.fgColor?.argb === undefined) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
          }
        });
      }
    });
  }

  function autoWidth(ws, mins) {
    ws.columns.forEach((col, i) => {
      let max = mins?.[i] || 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = len;
      });
      col.width = Math.min(max + 2, 42);
    });
  }

  // ---- Sheet 1: Tổng quan (KPI card) ----
  function buildOverviewSheet(wb, ctx) {
    const ws = wb.addWorksheet('Tổng quan', { properties: { tabColor: { argb: HEADER_FILL } } });
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = '📊 Báo cáo tổng quan — Học Liệu Số / IC3';
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: HEADER_FILL } };

    ws.mergeCells('A2:D2');
    ws.getCell('A2').value = `Xuất lúc: ${nowLabel()} · ${ctx.scopeLabel}`;
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };

    const kpis = ctx.kpis;
    let r = 4;
    kpis.forEach(([label, value]) => {
      ws.getCell(`A${r}`).value = label;
      ws.getCell(`A${r}`).font = { bold: true };
      ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KPI_FILL } };
      ws.mergeCells(`A${r}:B${r}`);
      ws.getCell(`C${r}`).value = value;
      ws.getCell(`C${r}`).font = { bold: true, size: 13, color: { argb: HEADER_FILL } };
      ws.getCell(`C${r}`).alignment = { horizontal: 'center' };
      ws.mergeCells(`C${r}:D${r}`);
      r += 1;
    });
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
  }

  // ---- Sheet 2: Danh sách học sinh (conditional formatting theo điểm) ----
  function buildStudentSheet(wb, rows) {
    const ws = wb.addWorksheet('Danh sách học sinh');
    ws.columns = [
      { header: 'MSSV', key: 'mssv', width: 14 },
      { header: 'Họ tên', key: 'name', width: 24 },
      { header: 'Trường', key: 'school', width: 20 },
      { header: 'Lớp', key: 'className', width: 12 },
      { header: 'Giáo viên', key: 'teacherName', width: 20 },
      { header: 'Điểm gần nhất (%)', key: 'latest', width: 16 },
      { header: 'Điểm TB (%)', key: 'avg', width: 14 },
      { header: 'Tiến độ học (%)', key: 'progress', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 14 },
    ];
    styleHeaderRow(ws.getRow(1));
    rows.forEach((row) => {
      const { student, history, progress } = row;
      ws.addRow({
        mssv: student.mssv || '',
        name: student.name || '',
        school: student.school || '',
        className: student.className || '',
        teacherName: student.teacherName || '',
        latest: history ? history.latestScore : null,
        avg: history ? history.avgScore : null,
        progress,
        status: student.status === 'inactive' ? 'Ngừng học' : 'Đang học',
      });
    });
    zebra(ws, 1);

    // Conditional formatting THẬT của Excel (không phải tô màu tĩnh):
    // đỏ nếu < 70%, xanh nếu >= 70% — áp dụng khi mở file, kể cả nếu
    // sau này người dùng sửa số liệu ngay trong Excel.
    const lastRow = ws.rowCount;
    ['F', 'G'].forEach((col) => {
      ws.addConditionalFormatting({
        ref: `${col}2:${col}${lastRow}`,
        rules: [
          { type: 'cellIs', operator: 'lessThan', formulae: [70], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: FAIL_FILL } }, font: { color: { argb: FAIL_FONT } } } },
          { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [70], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: PASS_FILL } }, font: { color: { argb: PASS_FONT } } } },
        ],
      });
    });
    ws.addConditionalFormatting({
      ref: `H2:H${lastRow}`,
      rules: [{
        type: 'colorScale',
        cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
        color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
      }],
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ---- Sheet 3: Điểm theo lớp ----
  function buildByClassSheet(wb, filteredResults) {
    const ws = wb.addWorksheet('Điểm theo lớp');
    ws.columns = [
      { header: 'Lớp', key: 'cls', width: 16 },
      { header: 'Điểm TB (%)', key: 'avg', width: 14 },
      { header: 'Số lượt làm bài', key: 'count', width: 16 },
    ];
    styleHeaderRow(ws.getRow(1));
    const byClass = global.EduAnalytics.groupAvgBy(filteredResults, 'studentClass');
    const countByClass = {};
    filteredResults.forEach((r) => {
      const k = r.studentClass || '—';
      countByClass[k] = (countByClass[k] || 0) + 1;
    });
    Object.keys(byClass).sort().forEach((cls) => {
      ws.addRow({ cls, avg: byClass[cls], count: countByClass[cls] || 0 });
    });
    zebra(ws, 1);
    if (ws.rowCount > 1) {
      ws.addConditionalFormatting({
        ref: `B2:B${ws.rowCount}`,
        rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }] }],
      });
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ---- Sheet 4: Xu hướng theo ngày ----
  function buildTrendSheet(wb, filteredResults) {
    const ws = wb.addWorksheet('Xu hướng theo ngày');
    ws.columns = [
      { header: 'Ngày', key: 'date', width: 14 },
      { header: 'Điểm TB (%)', key: 'avg', width: 14 },
      { header: 'Số lượt nộp bài', key: 'count', width: 16 },
    ];
    styleHeaderRow(ws.getRow(1));
    const trend = global.EduAnalytics.trendByDay(filteredResults);
    trend.forEach((t) => ws.addRow({ date: new Date(t.date).toLocaleDateString('vi-VN'), avg: t.avg, count: t.count }));
    zebra(ws, 1);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ---- Sheet 5: Ma trận Lớp × Bài thi (heatmap thật bằng color-scale) ----
  function buildHeatmapSheet(wb, filteredResults) {
    const ws = wb.addWorksheet('Ma trận Lớp × Bài thi');
    const { rows, cols, matrix } = global.EduAnalytics.heatmapMatrix(filteredResults, 'studentClass', 'testName');
    const header = ['Lớp \\ Bài thi', ...cols];
    ws.addRow(header);
    styleHeaderRow(ws.getRow(1));
    rows.forEach((rowName, ri) => {
      ws.addRow([rowName, ...matrix[ri].map((v) => (v === null || v === undefined ? null : v))]);
    });
    ws.getColumn(1).width = 18;
    for (let c = 2; c <= header.length; c += 1) ws.getColumn(c).width = 16;
    if (cols.length && rows.length) {
      const lastCol = ws.getColumn(header.length).letter;
      ws.addConditionalFormatting({
        ref: `B2:${lastCol}${rows.length + 1}`,
        rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }] }],
      });
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  }

  // ---- Sheet 6 & 7: pivot-style — cần hỗ trợ / xuất sắc ----
  function buildStudentPivotSheet(wb, title, list, fillArgb, fontArgb) {
    const ws = wb.addWorksheet(title);
    ws.columns = [
      { header: 'Họ tên', key: 'name', width: 24 },
      { header: 'Lớp', key: 'cls', width: 14 },
      { header: 'Điểm TB (%)', key: 'avg', width: 14 },
      { header: 'Điểm cao nhất (%)', key: 'best', width: 16 },
      { header: 'Số lượt làm bài', key: 'count', width: 16 },
    ];
    styleHeaderRow(ws.getRow(1));
    list.forEach((e) => ws.addRow({ name: e.studentName, cls: e.studentClass, avg: e.avgScore, best: e.bestScore, count: e.attemptsCount }));
    zebra(ws, 1);
    if (ws.rowCount > 1) {
      ws.addConditionalFormatting({
        ref: `C2:C${ws.rowCount}`,
        rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: [-1], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: fillArgb } }, font: { color: { argb: fontArgb } } } }],
      });
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  /**
   * @param {Object} scoped { filteredResults, filteredStudents, examHistories }
   * @param {Object} opts   { rows (từ student-table state.rows), scopeLabel, kpis: [[label,value],...], fileName }
   */
  async function exportWorkbook(scoped, opts) {
    if (typeof ExcelJS === 'undefined') {
      global.dispatchEvent(new CustomEvent('edu:toast', { detail: '❌ Không tải được thư viện Excel (ExcelJS). Kiểm tra kết nối mạng rồi thử lại.' }));
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Học Liệu Số / IC3';
    wb.created = new Date();

    buildOverviewSheet(wb, opts);
    buildStudentSheet(wb, opts.rows);
    buildByClassSheet(wb, scoped.filteredResults);
    buildTrendSheet(wb, scoped.filteredResults);
    buildHeatmapSheet(wb, scoped.filteredResults);
    buildStudentPivotSheet(wb, 'Cần hỗ trợ', global.EduAnalytics.studentsNeedingSupport(scoped.examHistories, 60), FAIL_FILL, FAIL_FONT);
    buildStudentPivotSheet(wb, 'Xuất sắc', global.EduAnalytics.topStudents(scoped.examHistories, 20), PASS_FILL, PASS_FONT);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = opts.fileName || `bao-cao-hoc-sinh-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  global.EduExcelExporter = { exportWorkbook };
})(window);
