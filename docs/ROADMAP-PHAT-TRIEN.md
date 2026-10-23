# Lộ trình phát triển khi dự án lớn lên

> Bổ sung cho [architecture/LMAP-ARCHITECTURE.md](architecture/LMAP-ARCHITECTURE.md) (định hướng nền tảng)
> và [FIREBASE-CHECKLIST.md](FIREBASE-CHECKLIST.md) (số đo hạn mức). Tài liệu này trả lời câu hỏi:
> **khi quy mô tăng tới ngưỡng X thì phải làm gì, tốn gì, sửa ở đâu.** Cập nhật lại sau mỗi đợt đo mới.

## 1. Mốc hiện tại (10/2026)

| Hạng mục | Hiện trạng | Giới hạn đang chạm |
|---|---|---|
| Hạn mức Firebase | Gói Spark miễn phí, mục tiêu ≤ 60% (30.000 đọc / 12.000 ghi mỗi ngày) | 3.000 HS × 3 bài + 50 GV + 1 admin ≈ 25.700 đọc / 9.000 ghi |
| Phòng thử thách trực tiếp | Mỗi câu trả lời = 1 ghi + 1 đọc | ~3 phòng 40 HS × 20 câu/ngày |
| Lưu trữ | `quiz_results` tự xoá sau 45 ngày (TTL) | 1 GiB của Spark |
| Ngân hàng câu hỏi | 6.071 câu, file JSON tĩnh `data/ic3` (0 lượt Firebase) | Mỗi file khối ~1 MB |
| Đã sẵn sàng cho tăng trưởng | Đề nằm trong link (0 Firebase), Góc học tập / Sổ tay / Trình chiếu chạy trên máy, Service Worker chống mất mạng, **CI tự kiểm tra** (`.github/workflows/ci.yml`: dữ liệu câu hỏi + cú pháp JS + unit test) | — |

Nguyên tắc giữ nguyên khi mở rộng: **tính năng mới mặc định chạy trên máy hoặc file tĩnh; chỉ dùng
Firestore khi bắt buộc phải chia sẻ giữa nhiều người, và luôn ước lượng lượt đọc/ghi trước khi làm.**

## 2. Ngưỡng tăng trưởng → việc cần làm

### Ngưỡng A — hơn ~3.000 học sinh/ngày hoặc hơn ~9.000 bài nộp/ngày
Mỗi bài nộp là 1 lượt ghi, không giảm được nữa → vượt hạn mức ghi.
- **Khuyến nghị: chuyển gói Blaze + đặt ngân sách cảnh báo.** Blaze vẫn giữ nguyên phần miễn phí
  hằng ngày của Spark, chỉ tính tiền phần vượt; theo bảng giá Firestore (kiểm tra lại trước khi bật)
  phần vượt cỡ vài chục nghìn lượt/ngày chỉ tốn vài cent/ngày. Đặt Budget alert (vd 5 USD/tháng) trong
  Google Cloud Billing để không bao giờ phát sinh bất ngờ.
- Thay thế không tốn tiền: giữ Spark, chuyển bớt bài *Ôn luyện* sang chỉ lưu trên máy (Google Sheet
  vẫn nhận), chỉ bài *Kiểm tra* mới ghi Firestore — sửa ở `js/quiz-engine.js` § submitExam.

### Ngưỡng B — hơn 3 phòng thử thách trực tiếp/ngày
- Dùng **Trình chiếu lớp học** (Soạn đề → Trình chiếu, 0 lượt) cho các lớp còn lại.
- Hoặc thêm chế độ **"nộp gộp"** cho phòng trực tiếp: học sinh trả lời cả ván trên máy, gửi 1 lần
  cuối ván (≈ 1 ghi/HS thay vì 1 ghi/câu, giảm ~20 lần), đổi lại không có bảng xếp hạng sau từng câu.
  Sửa ở `js/live-quiz.js` + rule `live_rooms/{code}/answers` trong `firestore.rules`.
- Hoặc Blaze (như ngưỡng A).

### Ngưỡng C — giáo viên cần biết "câu nào cả lớp hay sai" ✅ (10/2026, qua Google Sheet)
Đã làm **không qua Firestore** (`quiz_results` vẫn chỉ lưu điểm tổng → không thêm dung lượng, không
đổi rules): uid câu sai (≤ 30/bài) đi kèm bài nộp lên Sheet, cột O `CauSai`; Apps Script `wrongStats`
tổng hợp trên server; dashboard giáo viên → thẻ "❌ Câu cả lớp hay sai" (bấm Phân tích) + "Tạo đề ôn"
(link đề, 0 Firebase). Xem CHANGELOG 10/2026. Trang `gom-ket-qua.html` cũng có thẻ này, tính từ mã kết quả học sinh gửi (offline, 0 backend — 23/10/2026). Việc còn có thể làm: đưa thẻ này sang coordinator-dashboard
và tab Báo cáo của ic3-dashboard.

### Ngưỡng D — học sinh dùng nhiều thiết bị / muốn giữ tiến độ khi đổi máy
Góc học tập, Sổ tay câu sai, mục tiêu tuần đang nằm trong `localStorage` từng máy.
- Thêm "mã học tập" cá nhân (vd 6 ký tự, giáo viên phát kèm roster) → đồng bộ 1 document/HS
  (`student_progress/{mã}`), **ghi tối đa 1 lần/ngày** (gộp thay đổi), đọc 1 lần khi mở trang.
  Chi phí ≈ số HS hoạt động/ngày lượt ghi + đọc → chỉ bật khi đã lên Blaze hoặc còn dư hạn mức.
- Không cần đăng nhập Google cho học sinh — giữ trải nghiệm hiện tại.

### Ngưỡng E — nhiều đơn vị/trường độc lập (đa đơn vị)
- Giai đoạn 1: dùng field `schools` có sẵn trên hồ sơ người dùng + rule theo trường (đã có cho
  coordinator) — thêm vai trò "Quản trị trường" chỉ thấy dữ liệu trường mình.
- Giai đoạn 2 (đơn vị lớn, cần tách hạn mức/dữ liệu): **mỗi đơn vị 1 Firebase project riêng**, cùng
  một mã nguồn; chọn project theo tên miền trong `js/firebase-config.js`. Hạn mức miễn phí nhân theo
  số project, dữ liệu tách bạch tuyệt đối.

### Ngưỡng F — ngân hàng câu hỏi lớn / nhiều người cùng soạn
- **Đã có:** `scripts/validate-data.js` chạy trong CI — chặn deploy nếu đáp án đúng không nằm trong
  lựa chọn, thiếu ảnh, uid trùng, JSON hỏng.
- Quy trình: người soạn sửa qua "Quản lý câu hỏi" → đẩy lên nhánh riêng → Pull Request → CI xanh →
  người duyệt gộp vào `main`. Bật "Require status checks" cho nhánh `main` trên GitHub.
- Khi 1 file khối vượt ~2 MB: tách tiếp theo chương; trang làm bài đã chỉ tải file minitest nhỏ
  nên học sinh không bị ảnh hưởng.
- Ảnh > 300 KB: nén khi thêm mới (quy trình đã dùng: thu cạnh dài ≤ 1000px, kiểm tra bằng mắt).

### Ngưỡng G — cần lưu kết quả lâu hơn 45 ngày
- Nguồn lâu dài hiện tại là Google Sheet (mỗi bài 1 dòng). Thêm bản lưu theo học kỳ: xuất CSV từ
  "Báo cáo kết quả" cuối mỗi tháng.
- Trên Blaze: bật Firestore export định kỳ sang Cloud Storage (sao lưu thật, khôi phục được) hoặc
  BigQuery để phân tích nhiều năm.

## 3. Vận hành khi có nhiều người dùng

| Việc | Vì sao | Cách làm |
|---|---|---|
| Bật bảo vệ nhánh `main` | Không để code/dữ liệu lỗi lên thẳng web học sinh | GitHub → Settings → Branches → Require status checks "Kiểm tra dự án" |
| Bản thử (staging) | Thử trước kỳ thi | Nhánh `staging` + GitHub Pages thứ hai, cùng Firebase project nhưng tắt ghi `quiz_results` bằng cờ cấu hình |
| Gắn tag trước kỳ thi | Lùi bản nhanh | Đã hướng dẫn trong file `VERSION` |
| Cảnh báo hạn mức | Biết trước khi hết lượt | FIREBASE-CHECKLIST § 5 (Cloud Monitoring alert 60%) |
| Đổi `CACHE_VERSION` trong `sw.js` | Ép mọi máy bỏ bản lưu cũ khi đổi cấu trúc lớn | Sửa 1 dòng, deploy |
| Theo dõi lỗi phía học sinh | Lỗi chỉ xảy ra trên máy trường | `js/global-error-handler.js` → gửi tóm tắt lỗi kèm phiên bản về Google Sheet riêng (0 Firebase, giới hạn 1 lỗi/trang/lần mở) |

## 4. Tạo hứng thú học tập — việc nên làm tiếp (đều 0 hoặc rất ít Firebase)

1. ✅ **Thi đua lớp theo tuần** (10/2026) — thẻ "🏅 Thi đua lớp tuần này" + nút Trình chiếu trên
   dashboard giáo viên, tính từ dữ liệu *đã đọc sẵn* (0 lượt thêm).
2. ✅ **Chứng nhận hoàn thành lộ trình** (10/2026) — ảnh PNG vẽ bằng canvas trên máy khi học sinh đạt
   mọi bài của 1 cấp độ (không dùng jsPDF: font mặc định của jsPDF thiếu dấu tiếng Việt).
3. ✅ **Lộ trình học thích ứng** (10/2026) — Góc học tập → tab "Lộ trình", gợi ý bài nên làm tiếp.
4. ✅ **Đề "ôn từ câu cả lớp hay sai"** (10/2026) — nút "Tạo đề ôn" trên thẻ Câu cả lớp hay sai.
5. ✅ **Đấu trường kiểu Kahoot/Blooket** (10/2026) — `arena.html`: Tốc độ, Săn vàng, Đua về đích, Linh vật; chơi một mình với đối thủ máy, 0 Firebase.
   Tiếp theo có thể làm: thêm chế độ (Phòng thủ tháp, Quán cà phê), sự kiện theo mùa cho Linh vật, chế độ "đấu nhóm trên 1 máy chiếu" dùng Đấu trường.
6. **Nhiệm vụ theo mùa thi** — gói đề theo lịch thi IC3 thật, đếm ngược ngày thi trên sảnh.

## 5. Thứ tự đề xuất

1. Bật bảo vệ nhánh `main` với CI (làm ngay, 0 chi phí).
2. Theo dõi số đo hạn mức hằng tuần; khi chạm 60% liên tục → Ngưỡng A (Blaze + ngân sách cảnh báo).
3. ✅ Ngưỡng C (phân tích câu sai) — đã làm qua Google Sheet, 0 Firebase.
4. Mục 4.1–4.3 để tăng hứng thú học sinh.
5. Ngưỡng D, E, G khi thực sự có nhu cầu — không làm trước.
