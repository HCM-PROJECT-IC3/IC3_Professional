# Báo cáo bảo mật — TechRealm 2.0 (Prompt 08)

Ngày rà soát: 17/11/2026 · Nhánh `react-2.0` (chưa commit) · Người rà: Claude (rà mã + chạy kiểm thử trên máy).
Phạm vi: toàn bộ thay đổi TechRealm (Prompt 01–07) và các điểm chạm với EduQuiz cũ (Apps Script, Firebase, hosting).

## 1. Tóm tắt

| Mức | Số | Trạng thái |
|---|---|---|
| Cao | 2 | **Đã sửa:** `react-router` 7.9.1 có lỗ hổng chuyển hướng mở, đã nâng lên 7.18.5. Thư mục sao lưu suýt lọt vào bản phát hành (§4.0) |
| Trung bình | 3 | 1 đã sửa (header bảo mật). 2 cần chủ dự án xác nhận: giới hạn khoá API trình duyệt, chạy test rules Firestore trên CI |
| Thấp / chấp nhận | 6 | Ghi nhận, có biện pháp giảm thiểu (§4) |

**TechRealm không thêm collection Firestore nào, không đổi `firestore.rules`** (`git diff` rỗng), không thêm đường đọc Firestore cho học sinh.

## 2. Đã kiểm thực tế

| Hạng mục | Cách kiểm | Kết quả |
|---|---|---|
| Lộ bí mật trong mã | Quét mọi file đã theo dõi và file mới tìm khoá Google/OpenAI/GitHub/Slack, khoá riêng PEM | Chỉ có 2 khoá dùng ở trình duyệt, vốn công khai: cấu hình web Firebase (`js/firebase-config.js`) và khoá Drive API (`mos/js/config.js`). **Khoá Gemini không nằm trong mã** (ở Script Properties `GEMINI_API_KEY`) |
| Bản phát hành chứa gì | Quét `dist-hosting/` sau `build-hosting --strict` | Không có `apps/`, `*.gs`, `*.md`, `firestore.rules`, `tests/`, `web/`, `scripts/`, `.git`, `.env`, `Dockerfile` |
| Phân quyền trang nhân sự | E2E `teacher` / `admin` / `coordinator` (đăng nhập giả lập, Firebase SDK thật khi chưa đăng nhập) | Chưa đăng nhập → mời đăng nhập, 0 lượt đọc. Sai vai trò, chờ duyệt → bị chặn, 0 lần tải. Không thao tác 15 phút → tự đăng xuất |
| Báo cáo năng lực (mới) | E2E mới: giáo viên / điều phối / chưa đăng nhập | Chỉ giáo viên và quản trị xem được; điều phối và người chưa đăng nhập bị chặn, 0 lần tải dữ liệu |
| API công khai Apps Script | Đọc `10-router.gs` + test `code-gs` | 7 việc công khai (§3). Việc AI của giáo viên (`rubricReview`) bị `aiAsk` công khai từ chối, chỉ chạy qua `aiAskStaff` (cần vai trò) |
| AI: dữ liệu cá nhân | `mentor-core.test.js`, `code-gs.test.js`, E2E | Email, số điện thoại, địa chỉ, mật khẩu, "tên em là…" bị ẩn **cả ở trình duyệt lẫn máy chủ**. Nhật ký `NhatKyAI` không có nội dung, người dùng ghi bằng mã băm SHA-256 |
| AI: chế độ kiểm tra | E2E | Có bài Kiểm tra chưa nộp → 3 thẻ hỏi AI bị khoá. Bài Ôn luyện thì không khoá |
| XSS | Tìm `dangerouslySetInnerHTML` trong `web/src`, `innerHTML` trong `js/techrealm` | Không có. Chữ AI hiển thị qua React (`AiText`), không chèn HTML |
| Sổ cái công huân | `tr-ledger.test.js`, `cultivation-*.test.js` | Mã giao dịch xác định → nộp lại không cộng trùng. Thu hồi là dòng đảo, không xoá. Điểm bí cảnh do máy chủ chạy lại nhật ký thao tác. Móc thưởng **đang tắt** (`TR_REWARDS`) |
| Thư viện | `npm audit` (web, tests/e2e) | Web: 0 lỗ hổng sau khi nâng. tests/e2e: còn lỗ hổng ở `puppeteer-core` (§4.6) |
| Khoá trình duyệt cũ | So định dạng `eduquiz_ai_v1`, `eduquiz_ai_cid` giữa TechRealm và `ai-service.js` | Cùng định dạng, cùng luật. TechRealm chỉ ghi khoá mới `tr.*` |

**Chưa kiểm được trên máy này:**
- Test rules Firestore (33 ca, `tests/firestore-rules`): cần Java cho emulator, máy này không có. Job CI `firestore-rules` chạy được.
- Đăng nhập Firebase bằng tài khoản thật: cần staging và tài khoản thử (DEPLOYMENT_GUIDE §4).
- Gọi Gemini thật bằng key trường.

## 3. API công khai của Apps Script (không cần đăng nhập)

| Việc | Rủi ro | Giảm thiểu hiện có |
|---|---|---|
| `ping` | Không | Chỉ trả phiên bản |
| `submitExam`, `mosSubmit` | Ai cũng gửi được bài giả, vì học sinh không đăng nhập (đã chấp nhận từ trước) | Kiểm định dạng từng trường, chống trùng 6 giờ (CacheService), email cảnh báo gian lận có giới hạn |
| `submitBatch` | Máy chủ trường gửi gộp | Tự kiểm `RELAY_TOKEN` |
| `rosterByCode` | Dò mã lớp | Mã 6 ký tự từ 32 ký tự (bỏ I, O, 0, 1), 32⁶ ≈ 1,07 tỷ tổ hợp, đệm cả kết quả "không thấy". Chỉ trả tên 1 lớp |
| `aiAsk` | Tốn hạn mức Gemini | Chỉ nhận việc có trong danh sách, câu lệnh do code dựng (không mượn được key để hỏi việc khác). Trần 30 lượt/máy/ngày **và 800 lượt/trường/ngày**. Đổi mã máy lách được trần theo máy, nhưng không vượt trần trường |
| `aiReport` (mới) | Spam nhật ký | 10 lần/ngày/máy. Lý do chỉ nhận 4 giá trị cố định, ghi chú ≤ 300 ký tự đã lọc dữ liệu cá nhân |

## 4. Phát hiện

### 4.0 [Cao, ĐÃ SỬA, phát hiện trong đợt này] Thư mục sao lưu có thể bị phát công khai
`scripts/build-hosting.mjs` chép mọi file **trừ** danh sách loại trừ trong `firebase.json`. Thư mục `backups/` (do `backup-before-deploy.mjs` tạo, chứa **toàn bộ repo** và `Code.gs`) không có trong danh sách. Lần build đầu sau khi sao lưu chỉ bị `--strict` chặn **vì file quá 25 MB**, không phải vì lý do bảo mật. Một bản sao lưu nhỏ hơn sẽ lọt lên mạng nếu deploy từ máy này bằng `npx wrangler deploy` hoặc `firebase deploy`. GitHub Pages / Cloudflare build từ git không bị, vì `backups/` nằm trong `.gitignore`.

Đã sửa 3 lớp:
1. `backups/**` có trong `firebase.json` → `hosting.ignore`.
2. `backups/**` có trong danh sách **luôn bỏ** của `build-hosting.mjs`.
3. **Chốt chặn mới:** `--strict` báo lỗi nếu bản phát hành có `*.gs`, `*.bundle`, `*.patch`, `*.pem`, `*.key`, `.env*`, `firestore.rules`. Đã thử bằng một file `.gs` giả: build dừng với exit 1.

### 4.1 [Cao, ĐÃ SỬA] react-router 7.9.1
13 cảnh báo GHSA. Phần lớn chỉ ảnh hưởng SSR/RSC, không áp dụng vì app chạy hoàn toàn ở trình duyệt, dùng HashRouter. Riêng **GHSA-wrjc-x8rr-h8h6** (chuyển hướng mở qua dấu `\` trong `<Link>`/`useNavigate`) áp dụng phía client. Đã nâng lên **7.18.5** (cùng bản chính 7). Vite (chỉ dùng khi phát triển) nâng 7.1.7 → 7.3.8. Đã build lại và chạy lại toàn bộ E2E (QA_REPORT §2).

### 4.2 [Trung bình, ĐÃ SỬA] Thiếu header bảo mật cơ bản
Đã thêm `X-Content-Type-Options: nosniff` và `Referrer-Policy: strict-origin-when-cross-origin` cho Cloudflare (`_headers`, do `scripts/build-hosting.mjs` sinh) và Firebase (`firebase.json`).

**Cố ý không thêm** `X-Frame-Options` / CSP `frame-ancestors`: thầy cô nhúng trang làm bài vào Google Sites / LMS. Nếu muốn chặn nhúng, cần hỏi ý kiến giáo viên trước.

### 4.3 [Trung bình, CẦN XÁC NHẬN] Giới hạn khoá API dùng ở trình duyệt
Khoá Firebase web và khoá Drive API buộc phải nằm trong mã trình duyệt. Chúng chỉ an toàn khi được giới hạn. Vào Google Cloud Console → APIs & Services → Credentials và kiểm:
- **Application restrictions:** HTTP referrers, chỉ tên miền của trường (GitHub Pages, Cloudflare, Firebase Hosting, và tên miền staging nếu dùng).
- **API restrictions:** khoá Firebase chỉ cho các API Firebase cần dùng; khoá Drive chỉ cho Drive API.

Từ mã nguồn không xác minh được việc này.

### 4.4 [Trung bình, CẦN CHẠY] Test rules Firestore trên CI
Rules không đổi trong đợt này, nhưng vẫn phải thấy job `firestore-rules` trên GitHub Actions xanh trước khi triển khai (DEPLOYMENT_GUIDE §1).

### 4.5 [Thấp, chấp nhận] Chặn AI khi kiểm tra chỉ có hiệu lực trên máy học sinh
Học sinh không đăng nhập nên máy chủ không biết em đang thi. Đổi máy hoặc xoá dữ liệu trình duyệt là lách được. Giảm thiểu: gợi ý bài tập **không nhận đáp án đúng** và được dặn không nêu đáp án; giáo viên nên tắt AI (không phát link) trong giờ thi tập trung.

### 4.6 [Thấp, chấp nhận] `puppeteer-core` 23 trong tests/e2e
Chỉ dùng để kiểm thử, không nằm trong bản phát hành. Bản sửa là nâng bản chính (25.x), nên làm ở đợt riêng.

### 4.7 [Thấp, chấp nhận] Tu vi luyện tập (EXP trên máy) sửa được bằng DevTools
Đây là thiết kế: tu vi chỉ là động lực, **không** dùng để xếp hạng hay thưởng. Công huân (thưởng thật) chỉ ghi ở máy chủ, có kiểm chứng (CULTIVATION_SYSTEM.md).

### 4.8 [Thấp, chấp nhận] Source map của JS cũ được phát hành
`dist-hosting` kèm `.map`, nên F12 thấy mã gốc kèm chú thích. Không có bí mật (đã quét ở §2). Lợi cho việc sửa lỗi tại trường.

### 4.9 [Thấp, chấp nhận] Tên học sinh trong Google Sheet kết quả
Như trước TechRealm. Báo cáo năng lực chỉ hiện cho giáo viên và quản trị, và dùng lại dữ liệu trang giáo viên đã có quyền đọc.

### 4.10 [Thấp, ghi nhận] Đổi URL Apps Script staging khi build lại
Gói `bundles/` và `app/assets/` đặt tên theo nội dung **trước khi** thay URL. Build lại staging với URL khác thì trình duyệt đã mở staging có thể giữ bản cũ tới khi xoá cache. Chỉ ảnh hưởng staging.

## 5. Việc chủ dự án cần làm trước production
1. Xác nhận giới hạn 2 khoá trình duyệt (§4.3).
2. Đẩy nhánh lên, chờ CI xanh, gồm job `firestore-rules` (§4.4).
3. Cuối cùng kiểm lại trên staging bằng tài khoản thật (DEPLOYMENT_GUIDE §4).
