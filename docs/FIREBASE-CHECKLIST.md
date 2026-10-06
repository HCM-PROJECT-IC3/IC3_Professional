# Checklist cấu hình Firebase (project `data-ic3`)

Những việc **phải làm trên Firebase Console / Firebase CLI** — code trong repo không tự làm được.
Làm theo thứ tự; mỗi bước có cách kiểm tra đã xong.

## 1. Publish Firestore Rules + Indexes (BẮT BUỘC, làm trước tiên)

Đợt tối ưu hạn mức 10/2026 đổi cả `firestore.rules` lẫn `firestore.indexes.json` — **phải
publish cùng lúc với lúc deploy code** (code mới ghi thêm field `phaseAt`, `nextQuestion`,
`expiresAt` mà rules cũ từ chối; rules mới bắt buộc mọi query danh sách có `limit()` mà code
cũ ở vài trang chưa có).

**Cách nhanh (Firebase CLI, đã có `firebase.json` trong repo):**

```
npm i -g firebase-tools        # 1 lần
firebase login                 # 1 lần
firebase deploy --only firestore:rules,firestore:indexes --project data-ic3
```

Lệnh này publish rules, tạo composite index, **tắt index các field không dùng để lọc** và
**bật luôn các TTL policy** ở mục 4 (khai báo trong `fieldOverrides` của `firestore.indexes.json`).
CLI hỏi "xoá index không có trong file?" → chọn **No**.

**Cách thủ công (không dùng CLI):**
1. Mở `firestore.rules` → sao chép toàn bộ → Firebase Console → Firestore Database → **Rules** →
   dán → **Publish**.
2. Làm tay mục 4 (TTL) và mục 4b (tắt index) trong Console.

**Kiểm tra ngay sau khi publish:**
- Học sinh làm 1 bài ở `index.html` và nộp → có bản ghi mới trong `quiz_results` (mã document
  do máy học sinh tạo sẵn; nộp lại do mạng chập chờn không tạo bản trùng).
- Đăng nhập giáo viên → `teacher-dashboard.html` có số liệu; F12 → Console thấy các dòng
  `[teacher-dashboard] N lượt đọc Firestore — …`.
- Admin → `coordinator-dashboard.html`, `ic3-dashboard.html` (tab Báo cáo), `admin-users.html`
  đều tải được (rules mới từ chối query thiếu `limit()` — nếu trang nào báo `permission-denied`,
  gửi lại dòng lỗi).
- Tạo phòng ở `live-quiz.html`, cho 1–2 cửa sổ ẩn danh vào chơi trọn 1 ván: câu sau tự mở sau
  màn đáp án, điểm cộng đúng, cuối ván hiện bảng tổng kết.

Lỗi `permission-denied` ở chức năng nào → gửi lại thông báo lỗi. Cần quay lại tạm: bảng lịch sử
bên trái tab Rules cho phép chọn bản cũ (nhớ: code mới + rules cũ thì live-quiz không chạy).

## 2. Bật Anonymous Auth (cho phòng chơi trực tiếp)

Authentication → Sign-in method → **Anonymous** → Enable.

**Kiểm tra:** mở `live-quiz.html` ở cửa sổ ẩn danh → dòng trạng thái báo "Đã kết nối",
không phải "Chưa bật Firebase Anonymous Auth".

## 3. App Check — khai báo tên miền rồi Enforce

Console đang báo `AppCheck: ReCAPTCHA error` vì tên miền chạy trang chưa được cho phép.

1. Google Cloud Console → reCAPTCHA → key `6LeWKNMt...` → thêm tên miền GitHub Pages
   của site (và `localhost` nếu muốn thử ở máy).
2. Firebase Console → App Check → tab **APIs** → xem biểu đồ "Verified requests" của
   Cloud Firestore vài ngày. Khi gần như 100% request là *verified* → bấm **Enforce** cho
   Firestore và Authentication. Bật Enforce trước khi hết lỗi sẽ chặn luôn người dùng thật.
3. Sau khi Enforce: script lạ cầm `apiKey` công khai không còn ghi rác/đọc trộm được — đây là
   lớp chống lạm dụng quota quan trọng nhất khi trang học sinh cho ghi không cần đăng nhập.

## 4. TTL — tự xoá dữ liệu cũ (miễn phí)

`firebase deploy --only firestore:indexes` (mục 1) đã bật sẵn. Làm tay: Firestore → tab **TTL**
→ Create policy cho từng dòng:

| Collection group | Field | Tác dụng |
|---|---|---|
| `quiz_results` | `expireAt` | xoá bài nộp sau **45 ngày** (giữ dưới 60% của 1 GiB — xem mục 6) |
| `mos_submissions` | `expireAt` | xoá kết quả MOS sau 45 ngày |
| `live_rooms` | `expiresAt` | xoá phòng chơi sau 90 phút |
| `players` | `expiresAt` | xoá người chơi của phòng đã hết hạn |
| `answers` | `expiresAt` | xoá câu trả lời còn sót của phòng đã hết hạn |

- TTL không xoá subcollection theo document cha, nên `players`/`answers` có policy riêng (code
  mới ghi `expiresAt` = hạn của phòng vào mọi người chơi/câu trả lời).
- Lượt xoá do TTL **tính vào hạn mức 20.000 lượt xoá/ngày** — vẫn rẻ hơn đọc-để-xoá.
- Bài nộp **trước** đợt này mang `expireAt` 365 ngày → TTL xoá theo hạn cũ của chúng.
- Muốn xem bài cũ hơn 45 ngày: Google Sheet (mỗi bài nộp 1 dòng, `js/googleSheet.js`).

## 4b. Tắt index các field không dùng để lọc (giảm ~65% dung lượng)

Mặc định Firestore tạo 2 index cho **mọi** field → mỗi `quiz_results` chiếm ~5,3 KB thay vì
~1,9 KB. `firestore.indexes.json → fieldOverrides` tắt index của: `quiz_results` (mọi field trừ
`studentSchool`, `studentClass`, `testName`, `submittedAt`), `mos_submissions.taskResults`,
các map lớn của `live_rooms` (`scores`, `streaks`, `leaderboard`, `currentQuestion`,
`nextQuestion`…). Làm tay: Firestore → Indexes → **Single field** → Add exemption.

## 5. Giám sát hạn mức + cảnh báo

Gói Spark mỗi ngày: **50.000 lượt đọc, 20.000 lượt ghi, 20.000 lượt xoá**; 1 GiB lưu trữ;
10 GiB băng thông ra/tháng. Đặt lại lúc 0h giờ Thái Bình Dương ≈ **14h–15h chiều giờ VN**.
Ngân sách an toàn của dự án: **≤ 60%** (30.000 đọc / 12.000 ghi / 600 MB).

- **Xem mức dùng:** Firebase Console → Firestore → tab **Usage** (theo giờ/ngày). Mở dữ liệu
  trong tab *Data* của Console **cũng tính lượt đọc** — đừng cuộn duyệt `quiz_results`.
- **Xem từng trang tốn bao nhiêu:** F12 → Console, lọc chữ `lượt đọc Firestore`. Mỗi lần tải
  dữ liệu in `[trang] N lượt đọc Firestore — <nguồn> (tổng trang: T)`. Không tính lượt đọc
  phát sinh bên trong `firestore.rules` (`get()`/`exists()`).
- **Cảnh báo tự động (không cần Blaze):** Google Cloud Console (project `data-ic3`) →
  Monitoring → Alerting → **Create policy** → metric *Firestore Instance → Document Reads*
  (`firestore.googleapis.com/document/read_ops_count`), Rolling window 1 ngày, Sum,
  ngưỡng **30.000** → kênh thông báo Email. Làm thêm 1 policy cho *Document Writes*
  (`write_ops_count`) ngưỡng **12.000**.
- **Budget alert** (Billing → Budgets) chỉ có khi đã gắn tài khoản thanh toán (Blaze) — nếu
  sau này lên Blaze, đặt ngay budget 1 USD/tháng có email cảnh báo 50%/90%.
- **Khi chạm trần:** SDK tự chuyển "offline" — bài nộp của học sinh nằm trong hàng đợi gửi lại
  (giữ tới 30 ngày, có mã cố định nên không trùng) và tự gửi khi hạn mức đặt lại; dashboard dùng
  dữ liệu đã lưu trên máy (kể cả bản quá hạn) kèm thông báo; phòng chơi báo "hết lượt miễn phí".

## 6. Ngân sách ngày cao điểm (đo 10/2026)

Kịch bản: 3.000 học sinh × 3 bài nộp; 50 giáo viên × 10 lần mở dashboard; 5 admin (mỗi người
mở Báo cáo IC3 2 lần + Quản lý tài khoản 1 lần); 20 phòng thử thách × 40 học sinh × 20 câu.
Số đo bằng Chrome headless + SDK giả có bộ đếm tính phí; lượt đọc trong rules tính tay.

| Hạng mục / ngày | Đọc trước | Đọc sau | Ghi trước | Ghi sau |
|---|---|---|---|---|
| Học sinh nộp bài (9.000) | 0 | 0 | 9.000 | 9.000 |
| 50 giáo viên × 10 lần mở | ~111.000 | ~13.500 | 0 | 0 |
| 5 admin (Báo cáo IC3 + tài khoản) | ~89.000 | ~61.000 | 0 | 0 |
| 20 phòng thử thách (40 HS × 20 câu) | ~89.900 | ~37.400 | 17.660 | 17.260 |
| **Tổng** | **~290.000 (580%)** | **~112.000 (224%)** | **26.660 (133%)** | **26.260 (131%)** |

**Vượt 60% sau tối ưu — giới hạn cứng của thiết kế, không phải lỗi code:**
- **Phòng thử thách:** mỗi câu trả lời = 1 lượt ghi (học sinh) + 1 lượt đọc (người dẫn) là tối
  thiểu khi chấm điểm trực tiếp từng câu. 20 phòng × 40 × 20 = 16.000 ghi chỉ riêng câu trả lời.
  Trong 60% hạn mức ghi, sau 9.000 bài nộp chỉ còn chỗ cho **~3 phòng 40 HS × 20 câu/ngày**
  (hoặc 4 phòng × 15 câu — giao diện hiện giới hạn 15 câu/phòng, 60 người/phòng).
- **Báo cáo IC3 của admin:** mỗi admin xem bảng thô phải đọc **mọi** bài nộp mới (9.000/ngày).
  5 admin = 45.000. Nên để 1 admin dùng tab này; admin khác xem theo trường ở Dashboard
  điều phối (tối đa 1.000 bài/lần) hoặc xem Google Sheet.
- Học sinh + 50 giáo viên + **1** admin ≈ 25.700 đọc (51%) / 9.000 ghi (45%). Thêm 3 phòng
  40 × 20 câu → ≈ 31.300 đọc (63%) / 11.600 ghi (58%).

Giả định khi tính: 15 trường (≈ 600 bài/trường/ngày), mỗi giáo viên 60 học sinh, 10 lần mở
cách nhau > 30 phút và lần đầu trong ngày sau > 12 giờ; roster toàn hệ thống 3.000 học sinh.

## 7. Mức dùng từng thao tác (sau tối ưu)

| Thao tác | Đọc | Ghi |
|---|---|---|
| 1 học sinh mở trang + làm + nộp 1 bài | 0 | 1 (bấm nộp nhiều lần vẫn 1) |
| Dashboard giáo viên mở lần đầu trên máy mới | ≤ 1.000 + roster | 0 |
| Dashboard giáo viên mở lại (≤ 12 giờ) | 1 + số bài mới **của lớp mình** | 0 |
| Dashboard giáo viên mở lại sau > 12 giờ | + roster (1 lượt/học sinh) | 0 |
| Báo cáo IC3 (admin) mở lại | 1 + số bài mới (cache 7 ngày) | 0 |
| 1 phòng 40 HS × 15 câu (cả ván + xoá phòng) | ~1.470 | ~660 |
