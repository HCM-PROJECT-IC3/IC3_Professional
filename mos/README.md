# Ôn luyện MOS

Trang tĩnh để học sinh ôn thi MOS: tải tệp đề → làm trên Microsoft Office thật → nộp tệp đã lưu → chấm ngay trên trình duyệt.

- **Máy chủ phòng máy** (`node mos/server.js`): em bấm **"Mở bằng Excel/PowerPoint/Word"** → Office tự mở bản làm bài riêng của em
  (giao thức `ms-excel:ofe|u|…`, WebDAV) → làm bài, **Ctrl+S lưu thẳng về máy chủ** → trang chấm ngay. Không phải tìm tệp hay nộp bài — giống GMetrix.
- **Không có máy chủ, có thư mục làm bài** (Chrome/Edge): em chọn thư mục làm bài 1 lần (vd `C:\MOS`, đường dẫn không dấu) và dán đường dẫn của nó →
  "Tải đề & mở bằng …" lưu đề vào đó rồi mở luôn bằng Office (`ms-excel:ofe|u|file:///…`); Office có thể hỏi "Do you trust this content?" → Yes.
- **Không có máy chủ** (GitHub Pages, Chrome/Edge): "Tải đề về máy" → em tự mở tệp vừa lưu → Ctrl+S → trang đọc lại tệp để chấm (File System Access).
  Trang web không được phép tự mở Office với tệp trên ổ đĩa, nên bước mở tệp em phải tự làm.
- **Tải cả bộ đề vào một thư mục** (không có máy chủ, Chrome/Edge): mọi project sẵn trên máy, mở song song, lưu tệp nào chấm tệp đó.
  Mở lại trang chỉ cần cho phép đọc 1 lần cho cả thư mục. Tệp đề từ Drive được giữ trong Cache Storage — không tải lại.
- **Chấm trong Web Worker** (`js/grade-worker.js`): trang không đứng khi chấm tệp lớn; lỗi worker thì tự chấm trên trang.
- **Chấm từng câu**: nút **Chấm task này** ở mỗi task; task đã chấm/đánh dấu "Đã làm" tự chấm lại mỗi lần em Ctrl+S.
- **Thanh làm bài thu gọn**: cửa sổ nhỏ dưới đáy màn hình (Office ở phía trên) — danh sách task, chấm từng câu, Đã làm / Xem lại, hướng dẫn, đồng hồ.
- **Luyện tập** từng project (có hướng dẫn từng bước, điểm tạm tính) và **Thi thử** cả bộ đề 50 phút (ghi nhận âm thầm mỗi lần Ctrl+S, kết thúc đọc bản lưu cuối rồi chấm, thang 1000, đạt 700).
- Firefox/Safari: nộp tệp đã lưu như cách cũ.

Đề: Excel 10 bộ (354 task — Tiết 1–2 soạn tay trong `tools/excel-lessons.json` từ Bai_on_1/2.xlsx), PowerPoint 10 bộ (320 task), Word 10 bộ (275 task — tách từ bài giảng BaiOnN_HoanThien.pptx, tệp .docx thực hành nhúng trong slide).

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

## Tệp đề trên Google Drive

Trang tĩnh (GitHub Pages, Live Server) không có tệp đề Word/PowerPoint, nên tệp đề lấy từ 3 thư mục Drive (chia sẻ "Bất kỳ ai có đường liên kết"):
Excel `153pxS-HlbCTHOX-zQGn3AfaOigHUGdSh`, PowerPoint `10OAD6IRWNWrEQRZdebXNTf6EIA108JN4`, Word `1_dUNYR3p6wvocMM9inOpU4XnRW6PMQph`.

```
node mos/tools/build-drive-map.js   # ghép tệp đề với ID trên Drive → data/drive.json (chạy lại khi thêm/thay tệp trên Drive)
```

- Drive chặn `fetch()` từ trang khác tên miền (403), chỉ cho tải khi bấm link. Vì vậy học sinh bấm **Tải đề về máy** (link Drive) rồi **Chọn tệp vừa tải để chấm**.
- Đặt `driveApiKey` (khoá Google Drive API) trong `js/config.js` thì trang tự tải, tự lưu và tách được đề Word nằm trong bài giảng `BaiOnN_HoanThien.pptx`.
- Không có khoá: đề Word phải có tệp `.docx` riêng trong thư mục "Tiết N" trên Drive (cùng tên tệp), rồi chạy lại lệnh trên.
- Máy chủ trường (`server.js`) vẫn dùng tệp đề của nó, không đi qua Drive.

## Tiêu chí chấm tự động

Viết tay trong `data/rubrics/excel.json`, `data/rubrics/powerpoint.json` theo mã project và số task. Ví dụ:

```json
"excel-t3-p2": {
  "1": { "type": "x.printArea", "sheet": "January", "range": "A4:F12" }
}
```

Các loại kiểm tra nằm trong `js/checks.js` (`x.*` cho Excel, `p.*` cho PowerPoint). Task không có tiêu chí hiện là **Tự kiểm**, không tính điểm.
Hiện có: Excel 350/354 task, PowerPoint 312/320, Word 243/275. Còn lại là task không lưu trong tệp (Quick Access Toolbar, AutoCorrect, lưu PDF/XPS/web/RTF/TXT/template,
tuỳ chọn của Word, hiện dấu đoạn, Restrict Permission), tệp đề đã đúng sẵn, tệp có "xoá thông tin cá nhân khi lưu" nên Company bị xoá,
hoặc thao tác chưa tạo được bài mẫu bằng Office thật để kiểm chứng (Always Open Read-Only của PowerPoint, Hide Comments, Change Picture, đổi bullet trong hộp văn bản).
Task "Mã hoá bằng mật khẩu" (`p.encrypted`, `w.encrypted`): tệp đã mã hoá thì chỉ chấm task đó, các task khác giữ kết quả lần chấm trước.

Ngoài các loại riêng, có tiêu chí chung theo XML: `p.xml` (PowerPoint: `part` = slide/allSlides/layout/master/handout/presProps/theme/viewProps/presentation)
và `w.xml` (Word: `part` = body/document/settings/styles/numbering/header/footer/comments/footnotes/endnotes/custom/commentsExtended/diagramData; chọn đoạn bằng `para` — `startsWith`, `text`, `after`, `last`, `bookmark`, `withEl` — hoặc `table`, `within`).
Luật `has`/`none`: `{ el, attrs, text, min, tol }`; `el` hoặc giá trị thuộc tính bắt đầu bằng `~` là biểu thức chính quy. `scope` luôn là ghi chú hiện cho học sinh.
`"sticky": true` = task đã đúng một lần thì giữ (vd bật Track Changes rồi task sau lại tắt).

Kiểm tra sau khi sửa tiêu chí:

```
node mos/tools/make-fixtures.js     # bài mẫu đã làm đúng (sửa XML)
node mos/tools/test-rubrics.js      # tệp gốc phải trượt hết, bài mẫu phải đạt hết
node mos/tools/inspect.js mos/files/excel/t3/p1/Project_1.xlsx   # xem cấu trúc tệp khi soạn tiêu chí
```

`tools/fixtures-com/` là bài mẫu cho các tiêu chí bổ sung 11/2026, làm bằng Office thật qua COM — tạo lại bằng
`powershell -ExecutionPolicy Bypass -File mos/tools/fixtures-com-excel.ps1` (và `-ppt.ps1`, `-word.ps1`; thêm tên project để chỉ làm lại project đó).
`tools/fixtures-office/` là bài làm lưu bằng Excel/PowerPoint/Word thật (qua COM) — Excel Tiết 3 35/35, PowerPoint Tiết 1 và Word Tiết 9 đạt mọi task đã làm.
`manifest.json` ở đó ghi task nào đã làm trong từng tệp.

## Máy chủ phòng máy

```
node mos/server.js                 # cổng 8080, in ra địa chỉ http://<IP>:8080 cho học sinh
# hoặc
cd mos && docker compose up -d --build
```

- Trang theo dõi Ctrl+S bằng 1 request `POST api/stat` cho mọi project (project không đang mở hỏi thưa hơn);
  bắt đầu thi thử tạo bản làm bài cả bộ trong 1 lượt `POST api/work { items }`.
- Bản làm bài của từng em ở `work/<mã phiên>/<bài>/`, tự xoá sau 3 ngày (`MOS_WORK_DAYS`). Máy chủ không chấm, không lưu điểm.
- Office mở tệp qua `http://<IP>` có thể hiện thanh vàng *Protected View* — em bấm **Enable Editing**.
  Muốn bỏ hẳn: thêm địa chỉ máy chủ vào *Local intranet* (Internet Options → Security) trên các máy học sinh.
- Lần đầu Chrome hỏi "Mở Microsoft Excel?" — chọn Mở, tích "Luôn cho phép".
- Trên GitHub Pages, project PowerPoint và Word vẫn mở được nhưng báo "tệp đề chưa có trên máy chủ này" (tệp đề hai môn này không đưa lên git).
