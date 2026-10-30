# IC3 Professional — EduQuiz

Nền tảng web ôn luyện & kiểm tra trực tuyến chứng chỉ tin học quốc tế
**IC3** (Spark, Level 1-3) và **MOS** (Word/Excel/PowerPoint) — trắc
nghiệm theo chủ đề, mô phỏng thao tác thực hành, mini-game ôn tập, và
dashboard theo dõi tiến độ cho điều phối đào tạo/giáo viên.

> Đổi log các bản nâng cấp theo thời gian: xem [CHANGELOG.md](CHANGELOG.md).
> Lộ trình khi dự án lớn lên: [docs/ROADMAP-PHAT-TRIEN.md](docs/ROADMAP-PHAT-TRIEN.md).
> Trước khi đẩy code/dữ liệu: `node scripts/validate-data.js && node scripts/check-js.js`
> (CI GitHub Actions chạy tự động — `.github/workflows/ci.yml`).

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
- **Mini-game ôn tập** trong Đấu trường (`arena.html?vai=minigame`, không khoá):
  hành trình 5 chặng theo thứ tự học IC3 — Trí Nhớ Thiết Bị → Máy Tính Ảo →
  Thám Tử Mạng → Phòng Thủ Dữ Liệu → Đấu Boss. Mỗi trò leo 5 hạng đối thủ (Đồng →
  Huyền thoại), đua điểm trực tiếp với đối thủ, thắng nhận xu mở Linh vật
  (js/arena/arena-mini*.js). Không có bộ câu hỏi riêng (dùng lại đúng ngân
  hàng câu hỏi của Quiz).
- **Gamification**: XP, streak, huy hiệu — lưu local-first (không cần tài
  khoản); bảng điểm nhiều người hiển thị trong từng phòng. Bảng xếp hạng
  mini-game toàn hệ thống đang tắt vì client có thể tự giả mạo điểm.
- **Góc học tập** (học sinh, `js/learning-hub.js`): tiến độ & xu hướng
  điểm, mức nắm vững từng bài (yếu nhất lên đầu, nút "Ôn ngay"), gợi ý
  hôm nay, và **Sổ tay câu sai** tự gom câu làm sai qua mọi bài — ôn
  theo phương pháp lặp lại ngắt quãng (hộp Leitner: ngay → 1 → 3 → 7
  ngày → thuộc), thẻ ghi nhớ lật mặt, mục tiêu học mỗi tuần. Chạy hoàn
  toàn trên máy, 0 lượt Firebase.
- **Chống lag / mất mạng** (`sw.js`): lưu đệm file tĩnh của chính web
  (không đụng Firebase); mạng trường chập chờn vẫn mở trang và làm bài
  đã tải. Nút **"Tải sẵn để dùng offline"** ở sảnh (`js/offline-pack.js`) tải
  trọn câu hỏi + ảnh của khối đang chọn vào bộ nhớ máy để làm bài khi mất
  mạng; có `manifest.webmanifest` + icon (`img/pwa/`) nên học sinh **cài lên
  màn hình chính** điện thoại như 1 ứng dụng. Font Google/icon CDN không lưu
  được (offline dùng font hệ thống).
- **Nộp kết quả bằng mã/file, giáo viên gom** (`js/services/result-pack.js`,
  `gom-ket-qua.html`): nộp bài xong máy học sinh giữ mã `EQR1.…`; màn Kết quả
  có nút Chép mã / Tải file. Giáo viên mở `gom-ket-qua.html`, dán mã hoặc chọn
  nhiều file → bảng điểm + CSV, **không cần mạng/tài khoản**, kết quả đã gom
  được giữ trên trình duyệt đó. Mã chỉ có CRC32 bắt lỗi chép sai — **không
  chống làm giả có chủ ý**; kỳ kiểm tra cần chống gian lận dùng đường nộp có
  tài khoản (Sheet/Firestore) hoặc Phòng cả lớp.
- **Soạn đề kiểu Kahoot** (giáo viên, tab "Soạn đề" trong
  `ic3-dashboard.html`, `js/exam-builder.js`): tự soạn 5 dạng câu (trắc
  nghiệm, nhiều đáp án, Đúng/Sai, sắp xếp, nối cặp) kèm ảnh + giải thích,
  lấy câu từ ngân hàng / ma trận đề, nhập nhanh từ văn bản, xem trước,
  in đề. Đề nằm gọn trong link (`index.html?de=…`, nén deflate —
  `js/custom-exam-codec.js`) nên soạn/chia sẻ/mở đề không tốn lượt
  Firebase; mở được ở Phòng cả lớp của Đấu trường (`arena.html?de=…`)
  hoặc **Trình chiếu lớp học** (máy chiếu + đếm giờ + điểm theo nhóm, 0
  lượt Firebase). Giao bài về nhà có hạn nộp (bài trễ ghi "nộp muộn").
- **Đấu trường** (`arena.html`, `js/arena/`): chơi bộ câu hỏi kiểu
  Kahoot/Blooket (Tốc độ, Săn vàng, Đua về đích) với đối thủ máy, sưu tập
  Linh vật. **Phòng cả lớp** (thay `live-quiz.html` cũ): giáo viên bấm
  "Tạo phòng" → máy chiếu hiện mã 6 ký tự → học sinh nhập mã (hoặc mở
  `arena.html?phong=MÃ`) để cùng chơi Tốc độ / Đua về đích, tới 80 người.
  Chạy **ngang hàng WebRTC** (PeerJS, `js/vendor/peerjs.min.js`): máy giáo
  viên làm máy chủ, tự chấm điểm, đáp án chỉ gửi xuống sau khi chốt câu —
  **0 lượt Firebase**. Học sinh rớt mạng/tải lại trang tự vào lại, giữ
  điểm; máy giáo viên tải lại trang vẫn điều khiển tiếp. Kết quả lưu trên
  máy giáo viên (20 phòng gần nhất, tải CSV có Đ/S từng câu) và — tuỳ chọn
  — 1 lượt Apps Script/phòng lên tab `NhatKyDauTruong` (cần đăng nhập giáo
  viên). Sảnh phòng hiện **mã QR** (`js/vendor/qrcode.min.js`) để học sinh
  quét bằng camera. Chế độ Tốc độ có **thẻ thưởng**: đúng liền 3 câu → 🃏 x2
  (nhân đôi điểm câu đúng kế tiếp), liền 6 → 🛡️ Khiên (giữ chuỗi khi sai); bảng
  xếp hạng hiện 🔥 chuỗi. Máy chủ "bắt tay" mặc định `0.peerjs.com`; tự chạy máy
  chủ riêng hoặc thêm TURN cho mạng chặn WebRTC: `EduBackend.arenaRoom`
  (`peer`, `turn`) trong `js/backend-config.js`.
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
battle-quiz.html, ...       Các mini-game (chơi trong Đấu trường qua iframe ?arena=1)
js/                         Toàn bộ logic — 1 file/tính năng (không bundler)
  ├─ quiz-engine.js          Lõi: chọn bài, chấm điểm, chống gian lận
  ├─ coordinator/, teacher/  Data loader + dashboard riêng từng vai trò
  ├─ repositories/           Lớp truy cập Firestore dùng chung (CRUD)
  ├─ services/                Cache, analytics, hàng đợi gửi lại khi mất mạng, mã kết quả (result-pack)
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

> Các bước bắt buộc trên Firebase Console (publish Rules, Anonymous Auth, App Check,
> TTL, hạn mức): xem [docs/FIREBASE-CHECKLIST.md](docs/FIREBASE-CHECKLIST.md).

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
5. Phòng chơi trực tiếp **không còn dùng Firebase** (đã gộp vào Phòng cả lớp
  của `arena.html`, chạy WebRTC). Không cần bật Anonymous Auth cho tính năng
  này nữa; `live-quiz.html` chỉ chuyển hướng link cũ. Collection `live_rooms`
  / `live_hosts` và rules tương ứng trong `firestore.rules` giờ không trang
  nào dùng — giữ lại chỉ để phòng cũ (nếu còn) được TTL dọn; có thể xoá ở
  lần sửa rules sau. Điểm phòng là điểm trò chơi do máy giáo viên tính,
  không dùng làm điểm thi chính thức.
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
