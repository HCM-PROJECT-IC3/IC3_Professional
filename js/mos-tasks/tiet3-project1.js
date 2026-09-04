/* ============================================================
   js/mos-tasks/tiet3-project1.js — Rubric khai báo cho dự án pilot
   "Excel · Tiết 3 · Project 1" (nguồn: Downloads/On_Tap_MOS/On_tap_Excel.zip
   → On_luyen_cuoi_khoa/Tiet_3/PROJECT_1, đề bài lấy từ
   Tiet_3_MOS_Excel_Projects.xlsx, Task 1-6 của Project 1).

   File này CHỈ khai báo dữ liệu (KHÔNG chứa logic chấm — logic nằm ở
   js/mos-grading-engine.js), để sau này thêm project khác chỉ cần thêm
   1 file dữ liệu tương tự, không phải sửa engine.

   Task 4 và Task 6 (thao tác biểu đồ) không có checker khả thi ở Phase 1
   (ExcelJS đọc chart rất hạn chế) → khai báo type:"manual", LUÔN hiện
   "cần giáo viên xem thủ công", không tự chấm đúng/sai.
   ============================================================ */
(function (root) {
  'use strict';

  const project = {
    id: 'excel-tiet3-project1',
    subject: 'excel',
    title: 'Excel · Tiết 3 · Project 1',
    tietLabel: 'Tiết 3',
    starterFile: 'data/mos-practice/excel/tiet3-project1/starter.xlsx',
    tasks: [
      {
        id: 1,
        label: `Đi đến vùng được đặt tên "Date" (worksheet Exchange Rates) và xoá nội dung trong các ô đã chọn.`,
        type: 'cellsEmpty',
        params: { sheet: 'Exchange Rates', range: 'A11:B11' },
      },
      {
        id: 2,
        label: `Trên worksheet "Exchange Rates", trong các ô B4:D9, định dạng số để hiển thị 2 chữ số thập phân.`,
        type: 'numberFormatDecimals',
        params: { sheet: 'Exchange Rates', range: 'B4:D9', decimals: 2 },
      },
      {
        id: 3,
        label: `Trên worksheet "New Accounts", xoá hàng chứa dữ liệu "Manley Valve". Không thay đổi nội dung ngoài bảng.`,
        type: 'rowDeleted',
        params: {
          sheet: 'New Accounts',
          deletedText: 'Manley Valve',
          mustRemainTexts: [
            'Alum Sheeting', 'Durrable Products', 'Fast-Tie Aerospace', 'Hulkey Fasteners',
            'Pylon Accessories', 'Spacetime Technologies', 'Steelpin Inc.',
          ],
        },
      },
      {
        id: 4,
        label: `(Xem đề gốc trong file Tiet_3_MOS_Excel_Projects.xlsx — task này chưa có tiêu chí chấm tự động rõ ràng.)`,
        type: 'manual',
      },
      {
        id: 5,
        label: `Trên worksheet "Contact", trong cột "Email Address", sử dụng hàm để tạo địa chỉ email từ First Name và "@gmail.com".`,
        type: 'concatFormulaResult',
        params: {
          sheet: 'Contact',
          suffix: '@gmail.com',
          rows: [
            { sourceCell: 'A4',  targetCell: 'C4' },
            { sourceCell: 'A5',  targetCell: 'C5' },
            { sourceCell: 'A6',  targetCell: 'C6' },
            { sourceCell: 'A7',  targetCell: 'C7' },
            { sourceCell: 'A8',  targetCell: 'C8' },
            { sourceCell: 'A9',  targetCell: 'C9' },
            { sourceCell: 'A10', targetCell: 'C10' },
            { sourceCell: 'A11', targetCell: 'C11' },
            { sourceCell: 'A12', targetCell: 'C12' },
            { sourceCell: 'A13', targetCell: 'C13' },
          ],
        },
      },
      {
        id: 6,
        label: `Trên worksheet "New Accounts", với biểu đồ "Account Balances", hoán đổi dữ liệu qua trục.`,
        type: 'manual',
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
