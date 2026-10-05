# Checklist cấu hình Firebase (project `data-ic3`)

Những việc **phải làm trên Firebase Console** — code trong repo không tự làm được.
Làm theo thứ tự; mỗi bước có cách kiểm tra đã xong.

## 1. Publish Firestore Rules (BẮT BUỘC, làm trước tiên)

Rules đang chạy trên Console là bản "test mode" `allow read, write: if true;` —
ai có cấu hình Firebase (nằm công khai trong `js/firebase-config.js`) đều đọc/sửa/xoá
được toàn bộ dữ liệu.

1. Mở file `firestore.rules` trong repo → chọn tất cả → sao chép.
2. Firebase Console → Firestore Database → **Rules** → xoá nội dung cũ → dán → **Publish**.
   (Hoặc: `firebase deploy --only firestore:rules`.)
3. Nếu Console báo lỗi cú pháp: chụp dòng lỗi gửi lại để sửa.

**Kiểm tra ngay sau khi publish:**
- Học sinh làm 1 bài ở `index.html` và nộp → có bản ghi mới trong `quiz_results`.
- Đăng nhập admin → mở `teacher-dashboard.html` / `coordinator-dashboard.html` có số liệu.
- Tạo phòng ở `live-quiz.html`, cho 1 cửa sổ ẩn danh vào chơi 1 ván.

Lỗi `permission-denied` ở chức năng nào → gửi lại thông báo lỗi. Cần quay lại tạm:
bảng lịch sử bên trái tab Rules cho phép chọn bản cũ (đừng để rules mở lâu).

## 2. Bật Anonymous Auth (cho phòng chơi trực tiếp)

Authentication → Sign-in method → **Anonymous** → Enable.

**Kiểm tra:** mở `live-quiz.html` ở cửa sổ ẩn danh → dòng trạng thái báo "Đã kết nối",
không phải "Chưa bật Firebase Anonymous Auth".

## 3. App Check — khai báo tên miền

Console đang báo `AppCheck: ReCAPTCHA error` vì tên miền chạy trang chưa được cho phép.

1. Google Cloud Console → reCAPTCHA → key `6LeWKNMt...` → thêm tên miền GitHub Pages
   của site (và `localhost` nếu muốn thử ở máy).
2. Chỉ khi lỗi đã hết trên site thật mới bật **Enforce** cho Firestore và Authentication
   (App Check → APIs). Bật Enforce trước sẽ chặn luôn người dùng thật.

## 4. TTL — tự xoá dữ liệu cũ (miễn phí)

Firestore → tab **TTL** → Create policy:

| Collection group | Field | Tác dụng |
|---|---|---|
| `quiz_results` | `expireAt` | xoá kết quả sau 365 ngày (giữ dưới 1GB lưu trữ miễn phí) |
| `live_rooms` | `expiresAt` | xoá phòng chơi sau 90 phút |

TTL **không** xoá subcollection (`live_rooms/*/players`, `answers`) — người dẫn bấm
"Xóa phòng và dữ liệu" sau mỗi ván.

## 5. Cảnh báo hạn mức

Gói Spark mỗi ngày: **50.000 lượt đọc, 20.000 lượt ghi, 20.000 lượt xoá**; 10GB băng
thông ra/tháng. Đặt lại lúc 0h giờ Thái Bình Dương ≈ **14h–15h chiều giờ Việt Nam**.

- Theo dõi: Firestore → **Usage** (biểu đồ theo giờ).
- Khi hết lượt: bài nộp của học sinh vẫn được giữ trên máy và tự gửi lại; dashboard hiện
  dữ liệu đã lưu kèm thông báo; phòng chơi báo "hết lượt miễn phí hôm nay".
- Nếu thường xuyên chạm trần: cân nhắc gói Blaze + đặt Budget alert (Billing → Budgets).

## Ước tính mức dùng sau đợt tối ưu (10/2026)

| Hoạt động | Đọc | Ghi |
|---|---|---|
| 1 học sinh nộp 1 bài | ~0 | 1 |
| 1 phòng chơi 40 HS × 15 câu | ~2.100 | ~700 |
| Mở dashboard (lần đầu / các lần sau) | ≤1.000 / vài chục | 0 |
| Sửa 1 học sinh ở Quản lý danh sách | 1 | 1 |

Chi tiết từng thay đổi: xem `CHANGELOG.md` (mục 0a → 0j).
