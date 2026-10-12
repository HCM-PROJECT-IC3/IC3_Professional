# Sơ đồ backend: Firebase + Apps Script + GitHub Pages

Dự án dùng 3 nơi lưu/xử lý, mỗi nơi làm đúng việc nó rẻ và mạnh nhất. Muốn thêm tính năng
mới, tra bảng §2 để biết dữ liệu nên nằm ở đâu.

## 1. Nguyên tắc chia việc

| | **GitHub Pages** (file tĩnh) | **Firebase** (Auth + Firestore) | **Apps Script + Google Sheet** |
|---|---|---|---|
| Mạnh ở | Phục vụ vô hạn người đọc, nhanh, miễn phí | Đăng nhập; dữ liệu nhỏ hay sửa; thời gian thực; quyền chặt theo từng bản ghi | Ghi thêm số lượng lớn; người dùng mở Sheet là xem/lọc/xuất; gọi dịch vụ Google (Maps, Gmail, Drive); giữ bí mật (token) |
| Giới hạn | Chỉ đổi được bằng commit | Spark: 50k đọc / 20k ghi / 20k xoá mỗi ngày, 1 GiB | 30 lượt chạy song song/tài khoản; 10 triệu ô/file; ~1.000 lượt bản đồ/ngày |
| Dùng cho | Dữ liệu **mọi học sinh đọc** | Dữ liệu **quản trị viên sửa** và **thời gian thực** | Dữ liệu **ghi thêm, ít đọc** + **tích hợp** |

Quy tắc nhanh: học sinh (không đăng nhập) chỉ **đọc file tĩnh** và **ghi qua Apps Script**;
không trang học sinh nào cần Firebase (Firebase chỉ nạp khi `quizResults.firestore` bật hoặc
máy có phiên giáo viên).

## 2. Dữ liệu nằm ở đâu

| Dữ liệu | Nơi lưu | Ai ghi | Ai đọc |
|---|---|---|---|
| Ngân hàng câu hỏi `data/ic3/` | GitHub Pages | Admin (image-manager → Apps Script `githubPublish`) | Học sinh |
| Danh sách trường/lớp/tên ở sảnh `data/roster/students-active.json` | GitHub Pages | Admin (roster-manager → Apps Script `publishRoster`) | Học sinh |
| Tài khoản, vai trò, trường phụ trách (`users`) | Firebase | Đăng ký / Admin | Mọi trang quản trị; Apps Script (xác thực) |
| Roster quản lý (`students_roster`, `classes`, `courses`) | Firebase | Điều phối / Admin | Dashboard |
| Lịch dạy, TKB, khoảng cách xăng xe (`teaching_*`) | Firebase | Giáo viên / Điều phối GV | teaching-schedule |
| Phòng thử thách trực tiếp (`live_rooms`, `players`, `answers`) | Firebase | Giáo viên + học sinh (ẩn danh) | Thời gian thực |
| Cộng đồng giáo viên (`gvlab_*`) | Firebase | Giáo viên | Giáo viên |
| **Bài nộp IC3/Spark** | **Sheet `NhatKyNopBai`** (+ Firestore `quiz_results` tuỳ chế độ) | Học sinh → `submitExam` | Dashboard (`listResults` hoặc Firestore) |
| **Kết quả MOS Practice** | **Sheet `NhatKyMOS`** | Học sinh → `mosSubmit` | Giáo viên mở Sheet |
| **Nhật ký hoạt động (audit)** | **Sheet `NhatKyHoatDong`** | Trang quản trị → `logActivity`; Apps Script tự ghi khi đẩy GitHub / xoá bài | Admin mở Sheet |
| Khoảng cách nhà → trường (tính) | Apps Script `mapDistance` (Maps của Google) → lưu Firebase `teaching_travel_distances` | Điều phối GV | teaching-schedule |
| Tiến độ học, sổ tay câu sai, XP | localStorage máy học sinh | Học sinh | Học sinh |

## 3. Công tắc (`js/backend-config.js`)

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `quizResults.firestore` | `'all'` | `'test-only'` / `'off'` để giảm lượt ghi Firebase mùa thi — xem SCALING-SPARK.md §3 |
| `dashboard.readFrom` | `'auto'` | `'auto'` = đọc Sheet khi Firestore không nhận đủ bài |
| `quizResults.sheetEndpoints` | `{}` | Chia Apps Script theo trường khi rất nhiều bài/ngày |
| `mosResults` | Sheet | Bật `firestore: true` nếu muốn giữ thêm bản Firestore |
| `activityLog` | `'sheet'` | `'off'` để tắt nhật ký |

## 4. Bảo mật
- Mọi API Apps Script (trừ `ping`, `submitExam`, `mosSubmit`) bắt buộc Firebase ID token;
  Apps Script tự đọc vai trò/trường từ `users/{uid}` và phân quyền giống `firestore.rules`.
- Bí mật (token GitHub) chỉ ở Script Properties của Apps Script, không ở trình duyệt.
- Dữ liệu học sinh gửi lên (công khai) được kiểm tra độ dài/kiểu/khoảng giá trị; chữ được ghi
  dạng văn bản để Sheet không tự đổi thành ngày/giờ hay công thức.

## 5. Thứ tự deploy khi đổi cả 2 phía
1. **Apps Script trước** (`node scripts/build-apps-script.js` → dán `apps/Code.gs` → Save →
   Run `doGet` nếu có quyền mới → Deploy New version, giữ URL).
2. **Web sau** (push lên GitHub). Nếu web lên trước, bài nộp gọi API Apps Script chưa có sẽ nằm
   trong hàng đợi trên máy học sinh và tự gửi lại khi Apps Script được cập nhật.
