# IC3 Professional — EduQuiz

Nền tảng web ôn luyện & kiểm tra trực tuyến chứng chỉ tin học quốc tế
**IC3** (Spark, Level 1-3) và **MOS** (Word/Excel/PowerPoint) — trắc
nghiệm theo chủ đề, mô phỏng thao tác thực hành, mini-game ôn tập, và
dashboard theo dõi tiến độ cho điều phối đào tạo/giáo viên.

> Đổi log các bản nâng cấp theo thời gian: xem [CHANGELOG.md](CHANGELOG.md).

## Mục lục

- [Tổng quan tính năng](#tổng-quan-tính-năng)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Chạy thử ở máy local](#chạy-thử-ở-máy-local)
- [Cấu hình Firebase](#cấu-hình-firebase)
- [Triển khai (Deploy)](#triển-khai-deploy)
- [Vai trò & trang chính](#vai-trò--trang-chính)
- [Quy ước code](#quy-ước-code)

## Tổng quan tính năng

- **Làm bài trắc nghiệm** theo chủ đề/cấp độ (IC3 Spark/LV1-3, MOS
  Word/Excel/PowerPoint) — nhiều dạng câu hỏi (chọn 1/nhiều đáp án,
  đúng/sai, nối cột, kéo-thả, bấm vào hình...), chế độ "Ôn luyện" hoặc
  "Kiểm tra" (tính giờ, chống gian lận cơ bản: phát hiện chuyển tab,
  nhiều tab, thoát toàn màn hình...).
- **Mô phỏng thực hành** Word/Excel/PowerPoint (ribbon giả lập) để học
  sinh luyện thao tác trước khi thi thật.
- **Mini-game ôn tập** trong "Khu Vui Chơi": Trí Nhớ Thiết Bị, Phòng Thủ
  Dữ Liệu, Battle Quiz, Cyber Detective, Phân Loại Thần Tốc, Chim Vượt
  Ải (Mario + Flappy Bird kết hợp cổng câu hỏi IC3), Thử thách cùng lớp
  (quiz trực tiếp nhiều thiết bị)... — mở khóa theo
  kết quả bài thi, không có bộ câu hỏi riêng (dùng lại đúng ngân hàng
  câu hỏi của Quiz).
- **Gamification**: XP, streak, huy hiệu — lưu local-first (không cần tài
  khoản); bảng điểm nhiều người hiển thị trong từng phòng. Bảng xếp hạng
  mini-game toàn hệ thống đang tắt vì client có thể tự giả mạo điểm.
- **Dashboard báo cáo** (điều phối đào tạo / giáo viên / admin): thống
  kê điểm theo lớp/chủ đề/thời gian, quản lý danh sách học sinh (nạp từ
  Excel), quản lý lịch giảng dạy, trang Social nội bộ cho giáo viên.

## Công nghệ sử dụng

- **Không build step** — HTML/CSS/JavaScript thuần (vanilla), mỗi trang
  là 1 file `.html` độc lập nạp các `<script>` cần dùng trực tiếp.
- **Firebase** (gói Spark — free tier): Firestore (lưu kết quả thi,
  roster, bài đăng Social...), Authentication (đăng nhập admin/giáo
  viên và Anonymous Auth cho phòng chơi), App Check.
- **Chart.js** (biểu đồ dashboard, nạp theo trang cần dùng, không nạp
  toàn site), **jsPDF/ExcelJS/SheetJS** (xuất PDF/Excel, chỉ ở các
  trang cần).
- **Dữ liệu câu hỏi**: file JSON tĩnh trong `data/ic3/` (tách nhỏ theo
  từng chủ đề để giảm dung lượng tải — xem `data/ic3/minitests-manifest.json`),
  không cần tải cả bộ câu hỏi để làm 1 bài.
- **Lưu trữ local-first**: `localStorage` là nguồn chính cho lịch sử
  làm bài/gamification (hoạt động offline-first, không bắt buộc tài
  khoản); Firestore là nguồn phụ/tổng hợp cho dashboard quản trị.

## Cấu trúc thư mục

```
index.html                 Trang chính — học sinh chọn bài & làm Quiz
*-dashboard.html            Dashboard điều phối/giáo viên/admin
*-simulator.html            Mô phỏng thực hành Word/Excel/PowerPoint
battle-quiz.html, ...       Các mini-game trong "Khu Vui Chơi"
js/                         Toàn bộ logic — 1 file/tính năng (không bundler)
  ├─ quiz-engine.js          Lõi: chọn bài, chấm điểm, chống gian lận
  ├─ coordinator/, teacher/  Data loader + dashboard riêng từng vai trò
  ├─ repositories/           Lớp truy cập Firestore dùng chung (CRUD)
  ├─ services/                Cache, analytics, hàng đợi gửi lại khi mất mạng
  ├─ exam-engine/, word-engine/, excel-engine/, ppt-engine/
  │                           Mô phỏng thao tác thực hành theo từng ứng dụng
  └─ game-*.js                Hạ tầng dùng chung cho mini-game (modal, SFX...)
css/                        1 stylesheet/trang + css/theme.css (token dùng chung)
data/ic3/                   Ngân hàng câu hỏi (JSON tĩnh, tách nhỏ theo chủ đề)
data/roster/                Danh sách học sinh xuất tĩnh (tránh đọc Firestore mỗi lần tải trang)
docs/                       Ghi chú kiến trúc/quyết định kỹ thuật
firestore.rules             Luật bảo mật Firestore (phân quyền theo vai trò)
scripts/                    Script Python hỗ trợ (tách dữ liệu câu hỏi...)
apps/Code.gs                Google Apps Script — nhận bài thi ghi vào Google Sheet (dự phòng Firestore)
```

## Chạy thử ở máy local

Dự án không có build step — chỉ cần 1 static file server (vì các trang
dùng `fetch()` để tải JSON câu hỏi, không mở trực tiếp bằng `file://`
được do CORS):

```bash
# Python (có sẵn trên hầu hết máy)
python -m http.server 5000

# hoặc Node
npx serve -l 5000
```

Sau đó mở `http://localhost:5000/index.html`.

> Các trang quản trị (`*-dashboard.html`, `roster-manager.html`,
> `admin-users.html`...) cần đăng nhập qua `login.html` với tài khoản
> đã được cấp quyền admin/giáo viên trong Firestore — xem
> `js/auth.js`/`js/auth-guard.js`.

## Cấu hình Firebase

Cấu hình Firebase (project `data-ic3`) đã có sẵn trong
`js/firebase-config.js` — không cần tạo project riêng để chạy thử đọc.
Nếu fork dự án để triển khai độc lập (project Firebase riêng):

1. Tạo project Firebase mới, bật **Firestore** + **Authentication**
  (Email/Password; bật thêm provider **Anonymous** nếu dùng phòng chơi)
  + **App Check**.
2. Thay `firebaseConfig` trong `js/firebase-config.js` bằng config
   project mới.
3. Deploy `firestore.rules` lên project đó (`firebase deploy --only firestore:rules`
   nếu dùng Firebase CLI, hoặc dán tay qua Console).
4. Làm theo hướng dẫn App Check ngay trong comment đầu file
   `js/firebase-config.js` (đăng ký site key reCAPTCHA Enterprise).
5. Để dùng `live-quiz.html`, vào Firebase Console → Authentication →
  Sign-in method và bật **Anonymous**. Phòng chỉ lưu biệt danh, câu trả
  lời và điểm trò chơi tạm thời; không ghi `quiz_results`. Trên Spark,
  chỉ Admin, giáo viên đã duyệt hoặc điều phối được tạo phòng; client
  không thể tự xác minh đáp án/điểm do host tính, nên không dùng
  kết quả này làm điểm thi chính thức. Phòng hết hạn sau 90 phút nhưng
  Firestore không tự xóa subcollection; người dẫn dùng nút **Xóa phòng
  và dữ liệu** để dọn người chơi/câu trả lời sau khi kết thúc.
   Chống lạm dụng: mã phòng 8 ký tự ngẫu nhiên (~8,5×10¹¹ khả năng, không
   liệt kê được phòng); chỉ nhân sự được duyệt tạo phòng, tối đa 1 phòng/30 giây
   (`live_hosts`); phòng hết hạn sau 90 phút. Nên bật thêm: App Check *Enforce*
   cho Firestore và Auth, TTL policy trên trường `expiresAt` của `live_rooms`
   (Firestore → TTL), và đặt ngân sách/cảnh báo quota.
6. Bài thi quiz/MOS hiện vẫn cho phép học sinh nộp ẩn danh để giữ luồng
  không cần tài khoản. Rules giới hạn schema và giá trị, nhưng không thể
  xác minh điểm do trình duyệt gửi; muốn chống giả mạo điểm chính thức
  cần chấm bài ở backend đáng tin cậy.

## Triển khai (Deploy)

Dự án deploy tĩnh qua **GitHub Pages** — push lên nhánh đang trỏ Pages
là tự động lên bản mới, không cần pipeline CI/CD riêng. Xem file
[`VERSION`](VERSION) để biết quy ước gắn tag/rollback khi cần mốc phục
hồi trước 1 đợt deploy lớn.

## Vai trò & trang chính

| Vai trò | Trang vào | Ghi chú |
|---|---|---|
| Học sinh | `index.html` | Không cần tài khoản — chọn Trường/Lớp/Tên từ roster |
| Điều phối đào tạo | `coordinator-dashboard.html`, `roster-manager.html` | Cần đăng nhập, quản lý nhiều trường |
| Giáo viên | `teacher-dashboard.html`, `teaching-schedule.html` | Cần đăng nhập, phạm vi theo trường được phân công |
| Admin | `admin-users.html` | Cấp/thu quyền tài khoản giáo viên/điều phối |

## Quy ước code

- **Không có bộ câu hỏi/dữ liệu riêng cho từng tính năng** — mọi tính
  năng mới (mini-game, dashboard...) đều tái sử dụng đúng nguồn dữ liệu
  gốc (`data/ic3/`, collection `quiz_results`...), tránh trùng lặp và
  lệch dữ liệu.
- **Luôn escape dữ liệu người dùng trước khi ghép vào `innerHTML`** —
  dùng helper `esc()`/`escHtml()` sẵn có trong từng file, không nội
  suy chuỗi thô.
- **Đọc Firestore phải có `.limit()`** và ưu tiên cache qua
  `js/services/data-cache-service.js` (sessionStorage/localStorage,
  TTL ngắn) để không vượt hạn mức đọc/ghi miễn phí của gói Spark khi
  người dùng F5/mở lại trang nhiều lần.
- **Mỗi file JS gắn với đúng 1 trang/tính năng** — không có bundler nên
  tránh phụ thuộc chéo ngầm giữa các file không cùng 1 trang.
