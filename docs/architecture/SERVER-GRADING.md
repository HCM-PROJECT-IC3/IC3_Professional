# Chấm điểm phía máy chủ cho bài Kiểm tra

> Trạng thái 03/11/2026: **bước 0 xong**, **bước 1 xong — mặc định tắt** (`EduBackend.serverGrading.mode`).
> Bước 2–3 chưa làm — cần chốt các câu hỏi ở §4. Liên quan: [AUDIT-2.0.md](AUDIT-2.0.md) §5.3, kế hoạch 2.0 §VI.3.

## 1. Hiện trạng

- Đề nằm ở `data/ic3/**` trên GitHub Pages, **kèm đáp án** (`correct`, `answer`, `pairs`, `areas`…).
- `js/quiz-engine.js` chấm trên máy học sinh rồi gửi **điểm** lên Apps Script (`submitExam` → tab `NhatKyNopBai`).
- Hệ quả: học sinh biết dùng công cụ trình duyệt có thể (a) đọc đáp án trước, (b) gửi điểm tuỳ ý.

## 2. Vì sao chỉ "chấm lại trên máy chủ" là chưa đủ

Chấm lại (gửi câu trả lời thay vì điểm, máy chủ tự tính) chặn được (b) nhưng **không chặn (a)**: ai sửa
được gói tin gửi điểm thì cũng mở được file đề công khai và chọn đúng hết. Muốn đạt tiêu chí "không lộ đáp
án" thì **đề Kiểm tra phải không nằm công khai cùng đáp án**.

## 3. Lộ trình

| Bước | Nội dung | Ảnh hưởng học sinh | Trạng thái |
|---|---|---|---|
| 0 | Luật chấm 10 loại câu tách thành `js/core/grading.js` (quiz-engine dùng), bản Apps Script `apps/src/77-grading.gs`; test so 2 bản trên toàn bộ ngân hàng | Không | ✅ 03/11/2026 |
| 1 | Bài Kiểm tra gửi kèm **câu trả lời dạng câu gốc** (`wireAnswerOf`: chỉ số trước khi xáo, loại câu trước khi đổi sang "phân loại 2 cột") + file khối; Apps Script chấm lại (`applyServerGrading_`), ghi `ChiTiet.sv`/`sk`, gắn ⚠️ nếu lệch điểm (email cảnh báo sẵn có) | Không (gói tin lớn hơn vài KB) | ✅ 03/11/2026, bật bằng `serverGrading: { mode: 'verify' }` |
| 2 | **Đề Kiểm tra riêng** không đưa lên Pages: Admin đẩy đề + đáp án vào Sheet/Drive qua Apps Script; trang làm bài nhận đề **đã bỏ đáp án** (`getExam`), nộp câu trả lời (`submitExamAnswers`), nhận điểm + review từ máy chủ | Có: chế độ Kiểm tra cần mạng lúc mở đề và lúc nộp | Chưa |
| 3 | Phiên thi (mã phiên, giờ mở/đóng, 1 lượt/học sinh) — kế hoạch §VI.3 "CHECK EXAM SESSION" | Có | Chưa |

Ôn luyện giữ nguyên chấm trên máy (chạy offline, 0 lượt máy chủ) — đáp án công khai ở đây chấp nhận được.

## 4. Cần chốt trước khi bật bước 1 cho mọi trường và trước bước 2

1. **Áp dụng cho bài nào?** Đề xuất: chỉ bài Kiểm tra do giáo viên giao (không phải mọi bài chế độ Kiểm tra).
2. **Mất mạng khi nộp:** bước 1 dùng lại hàng đợi gửi lại (`pending-sync-queue.js`); bước 2 không chấm được
   khi mất mạng — chấp nhận "nộp xong mới thấy điểm khi có mạng"?
3. **Hạn mức Apps Script:** mỗi lần mở đề + nộp = 2 lượt chạy; 30 lượt song song/tài khoản → lớp 40 em nộp
   cùng lúc cần `sheetEndpoints` chia tài khoản theo trường (đã có trong `js/backend-config.js`).
4. **Nơi giữ đề Kiểm tra:** Sheet (dễ sửa, giới hạn 50k ký tự/ô) hay file JSON trên Drive (đọc bằng
   `DriveApp`, không giới hạn ô) — đề xuất Drive, cache theo phiên bản đề.

## 5. Bước 1 — chi tiết vận hành

- `ChiTiet.sk`: `ok` khớp · `lech` lệch (cột Trạng thái có ⚠️, `sv` = điểm máy chủ) · `thieu` có câu ngoài
  ngân hàng (đề tự soạn) — không kết luận · `loi` không tải được đề — bài VẪN được ghi.
- Đáp án tải từ `raw.githubusercontent.com` (repo công khai), rút gọn còn trường cần chấm, giữ 6 giờ trong
  CacheService theo từng câu — mỗi khối 1 lần tải / 6 giờ. Sửa đề xong muốn chấm theo đề mới ngay: chờ 6 giờ
  hoặc đổi `ANSWER_KEY_CACHE_SEC`.
- Web bỏ phần câu trả lời nếu > 40 KB (relay máy chủ trường nhận ≤ 64 KB/bài); bài vẫn nộp, chỉ không chấm lại.
- Kiểm chứng: `js/core/__tests__/grading-wire.test.js` chạy thật `prepareQuestions` của quiz-engine trên toàn bộ
  ngân hàng, 5 lần xáo — 63.070 trường hợp, điểm máy chủ = điểm máy học sinh; `apps/__tests__/code-gs.test.js`
  phần "chấm lại".

## 6. Bất biến phải giữ khi làm bước 2–3

- Chỉ một luật chấm: sửa `js/core/grading.js` **và** `apps/src/77-grading.gs` cùng lúc; test
  `apps/__tests__/code-gs.test.js` báo đỏ nếu lệch.
- Định dạng câu trả lời gửi đi = câu trả lời theo DẠNG CÂU GỐC (`js/quiz-engine.js` § `wireAnswerOf`); thêm
  biến đổi mới trong `prepareQuestions` (xáo, đổi loại câu) thì cập nhật `wireAnswerOf` — test
  `grading-wire.test.js` báo đỏ nếu quên.
- Điểm máy chủ chấm là điểm chính thức; điểm máy học sinh chỉ để hiện ngay.
