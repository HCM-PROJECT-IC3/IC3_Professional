# Nghiệm thu IC3 Professional 2.0 (Phase 7)

Nhánh `react-2.0`. App 2.0 chạy ở `<site>/app/` song song với giao diện cũ, nên mọi trang cũ vẫn giữ nguyên đường dẫn.
Đọc cùng: [AUDIT-2.0.md](AUDIT-2.0.md), [../../web/README.md](../../web/README.md), [../../tests/e2e/README.md](../../tests/e2e/README.md).

## 1. Máy đã tự kiểm (CI chạy mỗi lần push)

| Nhóm | Ở đâu | Kết quả 13/11/2026 |
|---|---|---|
| Dữ liệu câu hỏi, cú pháp JS, link HTML, kiến trúc, đường dẫn cũ, lấy chữ thuần | job `check` (`scripts/*.js`) | Đạt |
| Unit test cũ (mô phỏng Office, nộp bài, Apps Script, máy chủ trường, rubric MOS) | job `check` | Đạt |
| Phân quyền Firestore trên emulator | job `rules` | Không đổi trong đợt này |
| TypeScript và build thử app 2.0 | job `web` | Đạt |
| **Trình duyệt thật: 11 bộ, 140 kiểm tra** | job `e2e` (`tests/e2e`) | Đạt 140/140, 4 lần liên tiếp |

Bộ E2E kiểm những gì:
- **Số liệu khớp bản cũ:**
  - Góc học tập khớp `EduLearningHub.studentSummary()`.
  - Lộ trình khớp `EduLearningHub.seasonInfo()`.
  - Luật "Chờ duyệt" và "Cần xử lý" khớp `admin-users.js`.
- **0 request tới Firestore hay Firebase Auth:**
  - Trang học sinh, Khu vui chơi, Quản trị chỉ xem.
  - 17 trang cũ khi mở thẳng.
  - Cổng nhân sự khi chưa đăng nhập, chạy SDK Firebase thật.
- **Phân quyền giao diện:** chặn sai vai trò, giáo viên chờ duyệt, tài khoản chưa gán trường. Không tự tải dữ liệu khi bị chặn.
- **Tự đăng xuất khi không thao tác:** cảnh báo ở phút 14,5; bấm "Tiếp tục" thì tắt; quá 15 phút thì về `login.html?reason=idle&next=...`. Đồng hồ được tua giả, không phải chờ thật.
- **Offline:** tắt hẳn máy chủ rồi mở lại `/app/#/lo-trinh` vẫn chạy, cả khi máy chỉ từng mở app 2.0. Sảnh cũ và app dùng **chung 1** service worker.
- **Bản vá chữ thuần:** 6 hàm không còn chạy `onerror`, chữ ra giống hệt cách cũ trên mọi chuỗi HTML của `data/ic3`.
- **Link mở bài** `?ct=&cap=&bai=`: 9 trường hợp, gồm cả khi có đề giáo viên `?de=`.
- **Màn hình 375px** (điện thoại): không tràn ngang ở mọi trang 2.0.

Bộ test đã được thử xem có bắt được lỗi thật không: tạm trả 2 file đã sửa về bản cũ thì 8 kiểm tra báo lỗi đúng chỗ.

## 2. Cần người thử bằng tài khoản thật, trước khi gộp vào `main`

Máy không làm thay được phần này, vì nó cần đăng nhập Firebase thật và dữ liệu thật. **Không dùng tài khoản của học sinh.**

Cách chạy trên máy:
1. Trong Command Prompt: `cd <thư mục dự án>`, rồi chạy `npx http-server@14.1.1 -p 8770 -c-1 -s .`
2. Mở `http://127.0.0.1:8770/app/`.

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Đăng nhập **giáo viên**, mở `/app/#/giao-vien` | Số học sinh, điểm TB, tỉ lệ đạt, chưa làm bài khớp `teacher-dashboard.html` cùng bộ lọc |
| 2 | F12, Console, lọc "lượt đọc Firestore", rồi mở trang 2.0 **sau khi** đã mở trang cũ | Không đọc thêm. Bản đệm dùng chung, chỉ đọc bài mới nộp |
| 3 | Đăng nhập **điều phối** (nhiều trường nếu có), mở `/app/#/dieu-phoi` | Khớp `coordinator-dashboard.html`; chỉ thấy trường của mình |
| 4 | Đăng nhập **quản trị**: mở `admin-users.html` 1 lần, rồi mở `/app/#/quan-tri` | Số "Chờ duyệt" và "Cần xử lý" khớp trang cũ; Console không có lượt đọc Firestore mới |
| 5 | Học sinh: làm 1 bài ở sảnh, rồi mở `/app/` | Bài vừa làm có trong Lịch sử, chuỗi ngày và XP cập nhật |
| 6 | Lộ trình, bấm "Làm bài" | Sảnh mở sẵn đúng bài |
| 7 | Tắt Wi-Fi, mở lại `/app/` | Vẫn xem được Góc học tập, Lộ trình, Sổ tay |
| 8 | Điện thoại thật (Android, iOS) | Menu kéo ra, bảng, biểu đồ đọc được; không tràn ngang |

## 3. Triển khai (Phase 8), chỉ làm khi đã được đồng ý

- Push nhánh `react-2.0`, mở Pull Request, chờ CI xanh cả 5 job, rồi gộp vào `main`. GitHub Pages tự đưa `app/` lên.
- **Không cần** deploy Apps Script, `firestore.rules` hay index: đợt 2.0 không đổi backend.
- Sau khi lên web, làm lại mục 1, 3, 4, 7 ở trên trên địa chỉ thật.
- Quay lui: revert commit gộp. Trang cũ không phụ thuộc `app/`, nên gỡ app 2.0 không ảnh hưởng gì tới trang cũ.

## 4. Giới hạn đã biết

- Xuất Excel/PDF, câu hay sai, trợ lý AI, sửa danh sách học sinh, duyệt tài khoản: **vẫn ở trang cũ**. App 2.0 có nút "Bản đầy đủ" hoặc "Quản lý tài khoản".
- XP, cấp, huy hiệu tính **chung cho cả máy**, đúng như hệ thống cũ (`gamification.js` không tách theo học sinh).
- Link mở bài: nếu em mở bài của **cấp khác** lớp mình rồi mới chọn lớp, sảnh tự đổi về cấp theo lớp. Đây là hành vi sẵn có, giống nút "Ôn ngay" của Góc học tập.
- Quản trị chỉ xem dùng bản lưu trên máy (giữ 30 ngày). Số liệu mới nhất sau khi mở lại trang Quản lý tài khoản.
