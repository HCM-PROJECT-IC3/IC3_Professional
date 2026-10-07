# Prompt kiểm tra dự án (UX/UI · Bảo mật · Lượt đọc/ghi Firebase)

Dán nguyên phần **PROMPT** bên dưới vào Claude Code (mở ở thư mục gốc repo) mỗi khi cần rà soát
— trước đợt deploy lớn, sau khi thêm trang/collection mới, hoặc khi Firestore Usage tăng bất thường.
Có thể giới hạn phạm vi bằng cách thêm 1 dòng ở cuối, vd. `Chỉ kiểm tra: live-quiz.html, js/live-quiz.js`.

---

## PROMPT

```
Bạn là reviewer cho dự án EduQuiz IC3 (site tĩnh trên GitHub Pages + Firebase Spark, project
`data-ic3`). Hãy kiểm tra dự án theo 3 mảng dưới đây, CHỈ dựa trên code thật trong repo (đọc file,
grep), không phỏng đoán. Với mỗi phát hiện: ghi file:dòng, bằng chứng, mức độ, cách sửa.

BỐI CẢNH BẮT BUỘC PHẢI TÔN TRỌNG
- Gói Spark, ngân sách an toàn ≤ 60%: 30.000 đọc / 12.000 ghi / 600 MB mỗi ngày (xem
  docs/FIREBASE-CHECKLIST.md §5–7). Mọi đề xuất phải nói rõ nó làm tăng/giảm bao nhiêu lượt.
- Học sinh làm bài KHÔNG đăng nhập: quiz_results / mos_submissions cho phép create không auth —
  đây là thiết kế, không báo như lỗi; chỉ báo nếu schema/giới hạn trong rules lỏng hơn dữ liệu
  client thực sự gửi.
- Vai trò: admin | teacher (approved) | coordinator | teaching_coordinator | student. Phạm vi
  theo field `schools` / `teacherId` / `teacherCode` trên users/{uid}.
- KHÔNG chạy luồng nộp bài thật: js/googleSheet.js POST thẳng vào Google Sheet thật. Nếu phải
  chạy trình duyệt tự động, chặn *script.google.com*, *googleusercontent.com*, *googleapis.com*.
- Không sửa code trừ khi được yêu cầu; nếu sửa firestore.rules thì nhắc phải publish
  (`firebase deploy --only firestore:rules,firestore:indexes --project data-ic3`).

1) BẢO MẬT
 a. firestore.rules — với TỪNG `match`:
    - Ai đọc/ghi được? Có khớp đúng trang client đang dùng không? Collection không còn code nào
      dùng (grep `collection('<tên>')` trong js/, *.html) → phải đóng lại.
    - `allow read: if true` hoặc `list` không có `request.query.limit <= N` → báo (đọc công khai
      không giới hạn = đốt hạn mức + băng thông 10 GiB/tháng).
    - Ghi: có `keys().hasOnly([...])`, kiểu dữ liệu, giới hạn độ dài chuỗi/kích thước list,
      timestamp == request.time, và trường TTL (`expireAt`/`expiresAt`) bị chặn trên không?
    - `isSignedIn()` đứng một mình cho phép GHI → báo: Anonymous Auth đang bật cho live-quiz nên
      ai cũng có tài khoản ẩn danh.
    - Đối chiếu field client gửi (tìm `.add({`, `.set({`, `.update({`) với rules: thiếu field
      nào sẽ làm request bị từ chối?
 b. XSS: mọi `innerHTML` / `insertAdjacentHTML` / `outerHTML` chèn dữ liệu do người dùng nhập
    (tên học sinh, tên người chơi, bình luận, caption, tên lớp/trường, dữ liệu Excel nhập vào)
    phải qua hàm escape (esc / _acEscapeHtml / ...). Liệt kê chỗ chưa escape.
 c. Bí mật trong repo: tìm token/khoá thật (`ghp_`, `AKIA`, `private_key`, `password\s*[:=]`,
    URL Apps Script có quyền ghi). apiKey Firebase và site key reCAPTCHA là public — không báo.
 d. Phân quyền phía client chỉ là giao diện: trang admin/teacher (auth-guard.js, core/rbac.js)
    phải có rule tương ứng chặn ở server. Báo chỗ nào chỉ ẩn nút mà rules vẫn cho ghi.
 e. Link ngoài `target="_blank"` có `rel="noopener"`; thư viện CDN có ghim phiên bản.
 f. App Check: còn ở chế độ theo dõi hay đã Enforce (đọc docs/FIREBASE-CHECKLIST.md §3, hỏi tôi
    nếu không xác định được từ repo).

2) LƯỢT ĐỌC / GHI / DUNG LƯỢNG FIREBASE
 a. Liệt kê mọi lệnh đọc: `.get()`, `onSnapshot(`, repository `.list(` — kèm limit, tần suất
    (mỗi lần mở trang? mỗi giây? mỗi câu hỏi?), có cache không (js/services/data-cache-service.js,
    profile-cache-service.js). Đánh dấu: query không limit, onSnapshot không limit hoặc không
    unsubscribe khi rời trang, đọc lặp trong vòng lặp, `get()`/`exists()` trong rules nhân theo
    mỗi lần ghi.
 b. Liệt kê mọi lệnh ghi và số lượt/thao tác người dùng (vd. 1 bài nộp = 1 ghi). Báo ghi lặp do
    bấm nhiều lần, hẹn giờ ghi định kỳ, ghi trạng thái “đang hoạt động”.
 c. Dung lượng: document có base64 (ảnh/âm thanh), field nào đang được index mà không dùng để
    lọc (so firestore.indexes.json → fieldOverrides), collection nào thiếu TTL.
 d. Lập bảng ngân sách 1 ngày cao điểm theo kịch bản ở FIREBASE-CHECKLIST §6, cột: hạng mục,
    đọc, ghi, % hạn mức, đổi gì so với bảng cũ. Nếu tổng vượt 60%, nêu phương án giảm và
    cái giá về tính năng.
 e. Xác nhận log đo lượt đọc (`[trang] N lượt đọc Firestore`) có ở mọi trang đọc Firestore.

3) UX/UI
 a. Đồng nhất khung trang (bảng theo từng *.html): `lang="vi"`, viewport, `<title>` riêng,
    favicon, css/theme.css, css/accessibility.css, js/global-error-handler.js. Trang mô phỏng
    Office (exam-simulator-*, *-simulator.html) được phép khác giao diện — chỉ báo nếu thiếu
    khả năng truy cập cơ bản.
 b. Truy cập (WCAG 2.1 AA): nút chỉ có icon phải có aria-label; `<img>` có alt; focus nhìn thấy
    được (không `outline:none` mà thiếu `:focus-visible` thay thế); tương phản chữ ≥ 4.5:1;
    `prefers-reduced-motion` cho hiệu ứng (css/motion.css, game-fx); modal bẫy focus + Esc để
    đóng; form có `<label>`.
 c. Trạng thái: mỗi màn tải dữ liệu có trạng thái đang tải / rỗng / lỗi / hết lượt miễn phí
    (offline) bằng tiếng Việt dễ hiểu — không đổ thẳng `err.message` tiếng Anh cho học sinh.
 d. Di động 360 px: không cuộn ngang, vùng chạm ≥ 44 px, bảng dài cuộn trong khung.
 e. Thống nhất ngôn ngữ & thao tác: thay `alert()/confirm()` bằng modal chung nếu dự án đã có;
    cùng một hành động dùng cùng tên nút/icon giữa các trang.
 f. Hiệu năng cảm nhận: script nặng (vendor/exceljs, jspdf, chart) có tải trễ
    (js/services/lazy-script-loader.js) thay vì nạp ở <head> trang học sinh.

ĐẦU RA (đúng thứ tự)
1. Tóm tắt 5 dòng: tình trạng chung từng mảng + 3 việc nên làm ngay.
2. Bảng phát hiện: # | Mảng | Mức (Nghiêm trọng/Cao/Trung bình/Thấp) | file:dòng | Vấn đề |
   Bằng chứng | Đề xuất sửa | Ảnh hưởng lượt đọc/ghi.
   - Nghiêm trọng: lộ/sửa được dữ liệu người khác, đốt hạn mức không giới hạn.
   - Cao: ghi rác/phình dung lượng được, XSS, mất dữ liệu bài nộp.
   - Trung bình: lệch rules–client, thiếu trạng thái lỗi, a11y chặn thao tác.
   - Thấp: không đồng nhất giao diện/ngôn từ.
3. Bảng ngân sách Firebase 1 ngày (mục 2d).
4. Việc phải làm trên Console (publish rules, TTL, App Check, cảnh báo) — tách riêng khỏi code.
5. Những gì KHÔNG kiểm tra được và vì sao (vd. không có emulator, cần số liệu tab Usage).
```

---

## Ghi chú cho người dùng prompt

- Muốn Claude sửa luôn: thêm dòng `Sửa các mục Nghiêm trọng và Cao, mỗi mảng 1 commit.`
- Kiểm tra rules bằng emulator cần Java + `firebase-tools`
  (`firebase emulators:exec --only firestore "npm test"`); máy hiện chưa có Java.
- Kết quả lần chạy đầu (07/10/2026) đã được áp vào `firestore.rules` — xem CHANGELOG.md.
