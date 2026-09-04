/* ============================================================
   js/mos-tasks/pptx-tiet10-project2.js — Rubric khai báo cho dự án pilot
   thứ 2 (PowerPoint) "PowerPoint · Tiết 10 · Project 2 — Extreme Adventure
   Analysis" (nguồn: Downloads/On_Tap_MOS/On_Tap_PowerPoint.zip →
   On_Tap/Tiet_10, đề bài lấy từ De_10.xlsx, Task 2.1-2.4 của Project 2).

   Cùng nguyên tắc với js/mos-tasks/tiet3-project1.js (Excel): file này CHỈ
   khai báo dữ liệu, logic chấm nằm ở js/mos-grading-engine-pptx.js.

   Task 2.1 (đổi Table Style thành "Medium Style 4 – Accent 6") khai báo
   type:"manual" — style bảng trong PowerPoint lưu dưới dạng GUID số
   (vd {2D5ABB26-...}) chứ không phải tên, và KHÔNG có bảng tra cứu
   GUID↔tên đủ tin cậy trong repo này để tự chấm chính xác — chấm nhầm ở
   đây rủi ro cao hơn lợi ích, nên để giáo viên xem thủ công thay vì đoán.
   ============================================================ */
(function (root) {
  'use strict';

  const project = {
    id: 'pptx-tiet10-project2',
    subject: 'powerpoint',
    title: 'PowerPoint · Tiết 10 · Project 2',
    tietLabel: 'Tiết 10',
    starterFile: 'data/mos-practice/powerpoint/tiet10-project2/starter.pptx',
    tasks: [
      {
        id: 1,
        label: `Trên Slide 1, hiệu chỉnh bảng có sẵn: áp dụng Table Style "Medium Style 4 – Accent 6" và bật tùy chọn "Banded Rows".`,
        type: 'manual',
      },
      {
        id: 2,
        label: `Chèn thêm 1 dòng mới vào cuối bảng với dữ liệu: Everest Base Camp | 89 | 145 | 210 | 76 (tương ứng các cột: Under 19 | 19 to 34 | 35 to 49 | 50+).`,
        type: 'tableRowValues',
        params: { texts: ['Everest Base Camp', '89', '145', '210', '76'] },
      },
      {
        id: 3,
        label: `Chèn một slide mới (Slide 2) với bố cục "Title and Content". Chèn biểu đồ cột (Clustered Column Chart) với dữ liệu: Kilimanjaro (235, 368, 453) và Riding Rapids (678, 987, 1256) theo các nhóm tuổi Under 19 / 19 to 34 / 35 to 49.`,
        type: 'chartSeriesData',
        params: {
          series: [
            {
              name: 'Kilimanjaro',
              points: [
                { category: 'Under 19', value: 235 },
                { category: '19 to 34', value: 368 },
                { category: '35 to 49', value: 453 },
              ],
            },
            {
              name: 'Riding Rapids',
              points: [
                { category: 'Under 19', value: 678 },
                { category: '19 to 34', value: 987 },
                { category: '35 to 49', value: 1256 },
              ],
            },
          ],
        },
      },
      {
        id: 4,
        label: `Định dạng biểu đồ vừa chèn: thêm Data Labels vị trí "Outside End", thêm tiêu đề biểu đồ (Chart Title) "Adventure Tour Popularity".`,
        type: 'chartTitleAndLabelPos',
        params: { title: 'Adventure Tour Popularity', dLblPos: 'outEnd' },
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
