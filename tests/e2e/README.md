# Kiểm thử trình duyệt (E2E)

Bộ này chạy Chrome thật (headless) cho cả trang cũ lẫn app 2.0. **Không gọi Firebase thật**: các trang có đăng nhập dùng bản đăng nhập giả và dữ liệu giả, chạy ngay trong trình duyệt (chặn `js/auth.js`).

```bash
cd tests/e2e
npm ci
npm test                        # 11 bộ, 148 kiểm tra, khoảng 3 phút
npm test -- learning deeplink   # chỉ chạy vài bộ
E2E_SHOTS=../../.e2e-shots npm test   # lưu ảnh chụp màn hình
E2E_NETLOG=../../.e2e-shots/net.json npm test && node netlog-check.mjs ../../.e2e-shots/net.json
#   ↑ nhật ký mạng của CẢ Chrome (gồm service worker, tiến trình nền); báo lỗi nếu có kết nối tới Firestore hay Firebase Auth
```

Trình chạy tự bật máy chủ tĩnh (`server.mjs`) và tự tìm Chrome đã cài trên máy. Nếu không tìm thấy, đặt biến `CHROME_PATH` trỏ tới Chrome.

| Bộ | Kiểm tra |
|---|---|
| `foundation` | Domain cũ (`rbac.js`, `grading.js`) nạp đúng; trang học sinh không nạp Firebase; trang 404; theme dùng chung; không tràn ngang |
| `student` | Góc học tập 2.0 **khớp** `EduLearningHub.studentSummary()`; mục tiêu tuần ghi cùng định dạng; đổi học sinh; máy mới |
| `learning` | Lộ trình **khớp** `EduLearningHub.seasonInfo()`; Sổ tay hiện chữ thuần; HTML độc không chạy (cả trang cũ); "Ôn ngay" mở đúng em |
| `deeplink` | `index.html?ct=&cap=&bai=`: 9 trường hợp, gồm `?de=`; bấm "Làm bài" từ Lộ trình |
| `plain-text` | 6 hàm lấy chữ thuần: không chạy `onerror`; chữ ra giống hệt cách cũ trên mọi chuỗi HTML của `data/ic3` |
| `play` | Khu vui chơi và Thành tích: link game có thật, nhiệm vụ ngày, huy hiệu |
| `offline` | Tắt hẳn máy chủ rồi mở lại `/app/` vẫn chạy (máy chỉ mở app, hoặc mở sảnh cũ trước); dùng chung 1 service worker |
| `pages` | 17 trang cũ mở thẳng: không lỗi, không gọi Firestore hay Firebase Auth |
| `teacher` | Cổng giáo viên: **máy chưa có bản lưu thì 0 lần tải cho tới khi bấm "Tải dữ liệu"** (giáo viên và quản trị); chưa đăng nhập (SDK thật, 0 request), lọc không tải lại, chặn sai vai trò hoặc chờ duyệt; **tự đăng xuất** (cảnh báo 14,5 phút, quá 15 phút thì về `login.html?reason=idle`, tua đồng hồ giả) |
| `coordinator` | Cổng điều phối: chặn đọc toàn bộ khi máy chưa có bản lưu; khoá dò trùng `EduRosterCache.scopeKeyOf` thật; 2 trường có lớp trùng tên, lỗi riêng phần kết quả rồi "Thử lại", phân quyền |
| `admin` | Quản trị chỉ xem: đọc bản đệm, luật "Cần xử lý", tìm không dấu, 0 request Firebase |

**Đã thử bộ test có bắt được lỗi thật hay không.** Ngày 13/11/2026, mình tạm trả `learning-hub.js` và `quiz-engine.js` về bản trước khi sửa: 8 kiểm tra báo lỗi đúng chỗ.

Khi thêm trang hoặc tính năng mới, hãy thêm một bộ vào `suites/` và tên bộ vào mảng `SUITES` trong `run.mjs`.
