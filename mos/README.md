# Ôn luyện MOS

Trang tĩnh để học sinh ôn thi MOS: tải tệp đề → làm trên Microsoft Office thật → nộp tệp đã lưu → chấm ngay trên trình duyệt.

- **Máy chủ phòng máy** (`node mos/server.js`): em bấm **"Mở bằng Excel/PowerPoint/Word"** → Office tự mở bản làm bài riêng của em
  (giao thức `ms-excel:ofe|u|…`, WebDAV) → làm bài, **Ctrl+S lưu thẳng về máy chủ** → trang chấm ngay. Không phải tìm tệp hay nộp bài — giống GMetrix.
- **Không có máy chủ** (GitHub Pages, Chrome/Edge): "Tải đề về máy" → em tự mở tệp vừa lưu → Ctrl+S → trang đọc lại tệp để chấm (File System Access).
  Trang web không được phép tự mở Office với tệp trên ổ đĩa, nên bước mở tệp em phải tự làm.
- **Chấm từng câu**: nút **Chấm task này** ở mỗi task; task đã chấm/đánh dấu "Đã làm" tự chấm lại mỗi lần em Ctrl+S.
- **Thanh làm bài thu gọn**: cửa sổ nhỏ dưới đáy màn hình (Office ở phía trên) — danh sách task, chấm từng câu, Đã làm / Xem lại, hướng dẫn, đồng hồ.
- **Luyện tập** từng project (có hướng dẫn từng bước, điểm tạm tính) và **Thi thử** cả bộ đề 50 phút (ghi nhận âm thầm mỗi lần Ctrl+S, kết thúc đọc bản lưu cuối rồi chấm, thang 1000, đạt 700).
- Firefox/Safari: nộp tệp đã lưu như cách cũ.

Đề: Excel 8 bộ (281 task), PowerPoint 10 bộ (320 task), Word 10 bộ (283 task — tách từ bài giảng BaiOnN_HoanThien.pptx, tệp .docx thực hành nhúng trong slide).

## Hạ tầng (dùng ít nhất có thể)

| Thành phần | Dùng để | Chi phí |
|---|---|---|
| GitHub Pages (chung với EduQuiz) | Phát trang + đề Excel (~3 MB) | 0 |
| Trình duyệt học sinh | Đọc và chấm tệp `.xlsx/.pptx` (tệp không gửi đi đâu) | 0 |
| Apps Script `mosSubmit` (đã deploy) | Ghi kết quả **thi thử** vào tab `NhatKyMOS` | 1 lượt gọi / bài thi |
| Máy chủ phòng máy (tuỳ chọn) | `server.js`: phát trang + tệp đề Word/PowerPoint (không có trên git) qua LAN, Office mở/lưu bản làm bài qua WebDAV | Máy chủ trường chung (`docker compose up -d` ở thư mục gốc, MOS ở `/mos/` — [docs/DOCKER.md](../docs/DOCKER.md)) hoặc riêng `node mos/server.js`; không cần gói npm |
| Firebase | **Không dùng** — kết quả chỉ ghi thêm, Sheet hợp hơn và không ăn hạn mức Spark | 0 |

Luyện tập không gửi gì (`sendPractice: false` trong `js/config.js`). Gửi lỗi thì tự gửi lại khi có mạng, trùng mã bài Apps Script tự bỏ qua.

Giáo viên xem kết quả: mở Google Sheet của EduQuiz → tab **NhatKyMOS** (cột DuAn ghi "Thi thử Excel · Bộ đề Tiết 3 (742/1000)", cột ChiTiet có từng task).

## Cập nhật đề

```
pip install openpyxl
python mos/tools/build_catalog.py --src "C:/Users/Amin/Downloads/On_Tap_MOS"
```

Đọc `On_tap_Excel.zip`, `On_Tap_PowerPoint.zip` → sinh `data/index.json`, `data/sets/*.json` và chép tệp đề vào `files/`.
Word chưa có tệp đề trong bộ ôn tập nên trang hiện "Chưa có bộ đề".

## Tiêu chí chấm tự động

Viết tay trong `data/rubrics/excel.json`, `data/rubrics/powerpoint.json` theo mã project và số task. Ví dụ:

```json
"excel-t3-p2": {
  "1": { "type": "x.printArea", "sheet": "January", "range": "A4:F12" }
}
```

Các loại kiểm tra nằm trong `js/checks.js` (`x.*` cho Excel, `p.*` cho PowerPoint). Task không có tiêu chí hiện là **Tự kiểm**, không tính điểm.
Hiện có: Excel Tiết 3 (35/35 task), PowerPoint Tiết 1 (24/29 task), Word Tiết 9 (29/35 task).
`"sticky": true` = task đã đúng một lần thì giữ (vd bật Track Changes rồi task sau lại tắt).

Kiểm tra sau khi sửa tiêu chí:

```
node mos/tools/make-fixtures.js     # bài mẫu đã làm đúng (sửa XML)
node mos/tools/test-rubrics.js      # tệp gốc phải trượt hết, bài mẫu phải đạt hết
node mos/tools/inspect.js mos/files/excel/t3/p1/Project_1.xlsx   # xem cấu trúc tệp khi soạn tiêu chí
```

`tools/fixtures-office/` là bài làm lưu bằng Excel/PowerPoint/Word thật (qua COM) — Excel Tiết 3 35/35, PowerPoint Tiết 1 và Word Tiết 9 đạt mọi task đã làm.
`manifest.json` ở đó ghi task nào đã làm trong từng tệp.

## Máy chủ phòng máy

```
node mos/server.js                 # cổng 8080, in ra địa chỉ http://<IP>:8080 cho học sinh
# hoặc
cd mos && docker compose up -d --build
```

- Bản làm bài của từng em ở `work/<mã phiên>/<bài>/`, tự xoá sau 3 ngày (`MOS_WORK_DAYS`). Máy chủ không chấm, không lưu điểm.
- Office mở tệp qua `http://<IP>` có thể hiện thanh vàng *Protected View* — em bấm **Enable Editing**.
  Muốn bỏ hẳn: thêm địa chỉ máy chủ vào *Local intranet* (Internet Options → Security) trên các máy học sinh.
- Lần đầu Chrome hỏi "Mở Microsoft Excel?" — chọn Mở, tích "Luôn cho phép".
- Trên GitHub Pages, project PowerPoint và Word vẫn mở được nhưng báo "tệp đề chưa có trên máy chủ này" (tệp đề hai môn này không đưa lên git).
