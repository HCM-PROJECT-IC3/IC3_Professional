/* ============================================================
   js/mos-tasks/tiet3-project2.js — Rubric khai báo cho dự án
   "Excel · Tiết 3 · Project 2" (nguồn: Downloads/On_Tap_MOS/On_tap_Excel.zip
   → On_luyen_cuoi_khoa/Tiet_3/PROJECT_2, đề bài lấy từ
   Tiet_3_MOS_Excel_Projects.xlsx, sheet "PROJECT 2", Task 1-5).

   File này CHỈ khai báo dữ liệu (không chứa logic chấm — xem
   js/mos-grading-engine.js). Cấu trúc dữ liệu gốc (starter.xlsx):
     - Sheet "January": bảng A4:G12 đã có đủ dữ liệu (mẫu tham khảo).
     - Sheet "February": bảng A4:G16, cột F (Policy Type) và G (Discount)
       còn TRỐNG — học sinh phải tự điền công thức (Task 3, Task 5).
     - Sheet "March": bảng Table134 (A4:G13) đầy đủ dữ liệu — học sinh lọc
       theo Policy Type = "MP" (Task 2).
     - Sheet "Summary": có 1 biểu đồ cột "Policies" (Task 4 — Alt Text).

   Task 4 (Alt Text cho biểu đồ) không có checker khả thi ở Phase 1
   (ExcelJS không đọc được thuộc tính Alt Text của chart) → type:"manual".
   ============================================================ */
(function (root) {
  'use strict';

  const project = {
    id: 'excel-tiet3-project2',
    subject: 'excel',
    title: 'Excel · Tiết 3 · Project 2',
    tietLabel: 'Tiết 3',
    starterFile: 'data/mos-practice/excel/tiet3-project2/starter.xlsx',
    tasks: [
      {
        id: 1,
        label: `Cấu hình worksheet "January" để chỉ in phạm vi A4:F12.`,
        type: 'printArea',
        params: { sheet: 'January', range: 'A4:F12' },
      },
      {
        id: 2,
        label: `Trên worksheet "March", lọc bảng để chỉ hiển thị các chính sách có "Policy Type" = "MP".`,
        type: 'rowsVisibility',
        params: {
          sheet: 'March',
          visibleRows: [8, 13],
          hiddenRows: [5, 6, 7, 9, 10, 11, 12],
        },
      },
      {
        id: 3,
        label: `Trên worksheet "February", trong cột "Discount", dùng hàm hiển thị "YES" nếu "Years as Member" > 5, ngược lại hiển thị "NO".`,
        type: 'conditionalTextResult',
        params: {
          sheet: 'February',
          op: '>',
          threshold: 5,
          trueText: 'YES',
          falseText: 'NO',
          rows: [
            { compareCell: 'E5',  targetCell: 'G5' },
            { compareCell: 'E6',  targetCell: 'G6' },
            { compareCell: 'E7',  targetCell: 'G7' },
            { compareCell: 'E8',  targetCell: 'G8' },
            { compareCell: 'E9',  targetCell: 'G9' },
            { compareCell: 'E10', targetCell: 'G10' },
            { compareCell: 'E11', targetCell: 'G11' },
            { compareCell: 'E12', targetCell: 'G12' },
            { compareCell: 'E13', targetCell: 'G13' },
            { compareCell: 'E14', targetCell: 'G14' },
            { compareCell: 'E15', targetCell: 'G15' },
            { compareCell: 'E16', targetCell: 'G16' },
          ],
        },
      },
      {
        id: 4,
        label: `Trên worksheet "Summary", thêm mô tả Alt Text "New Data" cho biểu đồ. (Xem đề gốc trong file Tiet_3_MOS_Excel_Projects.xlsx — task này chưa có tiêu chí chấm tự động rõ ràng.)`,
        type: 'manual',
      },
      {
        id: 5,
        label: `Trên worksheet "February", trong cột "Policy Type", dùng hàm hiển thị 2 ký tự đầu tiên của "Policy Number" (cột B).`,
        type: 'leftCharsResult',
        params: {
          sheet: 'February',
          length: 2,
          rows: [
            { sourceCell: 'B5',  targetCell: 'F5' },
            { sourceCell: 'B6',  targetCell: 'F6' },
            { sourceCell: 'B7',  targetCell: 'F7' },
            { sourceCell: 'B8',  targetCell: 'F8' },
            { sourceCell: 'B9',  targetCell: 'F9' },
            { sourceCell: 'B10', targetCell: 'F10' },
            { sourceCell: 'B11', targetCell: 'F11' },
            { sourceCell: 'B12', targetCell: 'F12' },
            { sourceCell: 'B13', targetCell: 'F13' },
            { sourceCell: 'B14', targetCell: 'F14' },
            { sourceCell: 'B15', targetCell: 'F15' },
            { sourceCell: 'B16', targetCell: 'F16' },
          ],
        },
      },
    ],
  };

  const api = { projects: [project] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.MosTasks = root.MosTasks || { projects: [] };
    root.MosTasks.projects.push(project);
  }
})(typeof window !== 'undefined' ? window : globalThis);
