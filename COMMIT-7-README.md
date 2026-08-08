# Commit #7 — Xuất Excel (7 sheet) + Xuất PDF cho bảng "Danh sách học sinh"

Gộp cả Commit #6 (`Excel export engine`) và #7 (`PDF export engine`) trong
`docs/architecture/LMAP-ARCHITECTURE.md` vào cùng 1 đợt theo yêu cầu — 2 nút
`⬇️ Excel` / `🖨️ PDF` ở bảng "Danh sách học sinh" (Coordinator Dashboard +
Teacher Dashboard, dùng chung `js/coordinator/student-table.js`) trước đây
chỉ hiện toast "sẽ có ở Commit #6/#7", giờ xuất file thật.

## Lệch 1 điểm so với tài liệu gốc — vì sao

`LMAP-ARCHITECTURE.md` ghi "Excel export engine (**SheetJS**)". Khi build
thật, SheetJS bản miễn phí (Community) **không ghi được style/tô màu/
conditional formatting** khi xuất `.xlsx` — đây là giới hạn đã biết của bản
Community (ghi style chỉ có ở bản Pro trả phí). Vì yêu cầu bắt buộc phải có
"conditional formatting" (đỏ/xanh theo điểm, color-scale cho ma trận nhiệt),
mình dùng **ExcelJS** thay cho SheetJS — vẫn xuất đúng file `.xlsx`, vẫn
đúng 7 sheet theo spec, chỉ đổi thư viện phía dưới.

## File MỚI

```
js/vendor/exceljs.min.js                (~925 KB — ExcelJS 4.4.0, tự lưu trữ)
js/vendor/jspdf.umd.min.js              (~410 KB — jsPDF 4.2.1)
js/vendor/jspdf.plugin.autotable.min.js (~35 KB  — jsPDF-AutoTable 4.0.0)
js/export/excel-exporter.js
js/export/pdf-exporter.js
```

Cả 3 thư viện tự lưu trữ trong `js/vendor/` (đúng nguyên tắc project đã
dùng cho Chart.js — tránh bị Tracking Prevention/adblock chặn khi tải CDN),
không cần CDN, không cần cài npm.

## File ĐÃ SỬA

- **`js/coordinator/student-table.js`**
  - Lưu thêm `state.scoped` (dữ liệu đã lọc 5 chiều, nhận từ `render(scoped)`)
    để 2 hàm export dùng — export **toàn bộ tập đang xem trên dashboard**,
    không bị giới hạn bởi ô tìm kiếm/trạng thái/trang cục bộ của riêng bảng.
  - Thêm `readKpisFromDom()` (đọc lại 7 thẻ KPI đã render sẵn — tự động bỏ
    qua `kpiTeachers` khi chạy ở Teacher Dashboard, vì trang đó không có
    thẻ này) và `scopeLabel()` (ghép tiêu đề trang + tên người đang đăng
    nhập) để đưa vào phần header của cả 2 file xuất.
  - 2 handler `handleExportExcel()` / `handleExportPdf()` thay hẳn 2 toast
    placeholder cũ — có disable nút + đổi label "⏳ Đang tạo..." lúc xử lý,
    và toast báo lỗi rõ ràng nếu thất bại (không im lặng nuốt lỗi).
- **`coordinator-dashboard.html`** + **`teacher-dashboard.html`** — thêm 5
  thẻ `<script>` (3 vendor + 2 engine) trước script `coordinator/*`/`teacher/*`;
  sửa `title` của 2 nút (bỏ chữ "— Commit #6/#7" vì giờ đã chạy thật).

**Không sửa**: `js/coordinator/charts.js`, `js/coordinator/dashboard.js`,
`js/teacher/dashboard.js`, `js/services/analytics-service.js` — 2 engine
export chỉ **đọc** dữ liệu/DOM đã có sẵn, không cần đổi gì ở tầng tính toán.

## Excel — 7 sheet

1. **Tổng quan** — KPI card (7 chỉ số, tô nền màu thương hiệu).
2. **Danh sách học sinh** — bảng đầy đủ; cột Điểm gần nhất/Điểm TB dùng
   conditional formatting thật của Excel (đỏ nếu <70%, xanh nếu ≥70% —
   áp dụng động, kể cả khi mở file ra sửa số liệu); cột Tiến độ dùng
   color-scale 3 màu.
3. **Điểm theo lớp** — nhóm điểm TB theo lớp (nguồn dữ liệu trùng
   Bar/Radar chart trên dashboard) + color-scale.
4. **Xu hướng theo ngày** — điểm TB theo ngày (nguồn Line chart).
5. **Ma trận Lớp × Bài thi** — bản Excel của Heatmap trên dashboard, dùng
   color-scale thật (không phải ảnh chụp).
6. **Cần hỗ trợ** — pivot: học sinh điểm TB <60%, yếu nhất trước.
7. **Xuất sắc** — pivot: Top 20 học sinh điểm TB cao nhất.

## PDF

- Header lặp lại mỗi trang: huy hiệu "IC3" (vẽ vector — project chưa có
  file logo hình ảnh; khi có `assets/logo.png` chỉ cần sửa hàm
  `drawLogoBadge()` trong `pdf-exporter.js` để dùng ảnh thật), tên báo cáo,
  phạm vi đang xem, thời điểm xuất.
- Footer mỗi trang: "Trang X/N" + dòng ghi chú tự động.
- Trang 1: bảng KPI. Trang 2: 4 biểu đồ (Bar/Pie/Line/Radar) — lấy trực
  tiếp từ canvas Chart.js đã vẽ sẵn trên trang (`canvas.toDataURL`), không
  vẽ lại, không cần thêm thư viện chụp màn hình. Các trang sau: "Cần hỗ
  trợ", "Xuất sắc", "Danh sách học sinh" (bảng dài tự động sang trang,
  header/footer lặp lại đúng ở mỗi trang mới).

## Đã kiểm thử

Chạy `js/export/excel-exporter.js` và `js/export/pdf-exporter.js` bằng dữ
liệu mẫu trong môi trường giả lập trình duyệt (jsdom) trước khi giao —
workbook Excel xuất được buffer hợp lệ, PDF chạy hết toàn bộ luồng vẽ
header/footer/bảng/biểu đồ đến bước `doc.save()` không lỗi. Cần bạn tự
kiểm tra thêm 1 lượt bằng mắt trên trình duyệt thật (mở file `.xlsx`/`.pdf`
xuất ra) vì môi trường giả lập không hiển thị được hình ảnh/màu sắc để
mình xem trực quan.
