# Hướng dẫn triển khai — TechRealm 2.0 (Prompt 08)

Dành cho người triển khai (quản trị kỹ thuật của trường). Nguyên tắc: **bản web đang chạy giữ nguyên tới khi bản mới được nghiệm thu trên staging**. Mỗi bước đều có cách quay lui.

Đợt này **không đổi Firestore** (rules, index, collection). Chỉ đổi **Apps Script** (`BACKEND_VERSION 2026-11-04c → 2026-11-17a`, phần thêm vào không phá cái cũ) và **web**.

```
§1 Kiểm tra trước ─► §2 Sao lưu ─► §3 Staging ─► §4 Nghiệm thu ─► §5 Production ─► §6 Kiểm sau triển khai
                                                  (chủ dự án duyệt)              (§7 quay lui nếu cần)
```

## 1. Kiểm tra trước (trên máy)

```bash
cd web && npm ci && npm run typecheck && npm run build && cd ..
node scripts/build-apps-script.js --check
for t in js/*/__tests__/*.test.js; do node "$t" || echo "LỖI $t"; done
node apps/__tests__/code-gs.test.js && node apps/__tests__/tr-ledger.test.js
cd tests/e2e && npm ci && node run.mjs && cd ../..        # 13 bộ, ~11 phút
node scripts/build-hosting.mjs --strict
E2E_ROOT=../../dist-hosting node tests/e2e/run.mjs        # cùng bộ, chạy trên bản rút gọn sẽ phát
```

Sau đó commit (gồm `app/` đã build), push nhánh `react-2.0` và chờ **GitHub Actions xanh**, đặc biệt job `firestore-rules` (cần Java, chỉ CI chạy được).

## 2. Sao lưu

| Cái gì | Cách | Khôi phục |
|---|---|---|
| Mã nguồn + việc chưa commit | `node scripts/backup-before-deploy.mjs` → `backups/<thời điểm>/` (đã .gitignore): `repo.bundle`, `uncommitted.patch`, `untracked.tar`, `live-Code.gs`, `MANIFEST.txt` (kèm SHA-256) | `git clone repo.bundle` → `git checkout react-2.0` → `git apply uncommitted.patch` → `tar -xf untracked.tar` (đã thử ngày 17/11: 142/142 file khớp) |
| Mốc bản đang chạy | `git tag -a truoc-techrealm-2026-11 origin/main -m "Trước TechRealm 2.0"` → `git push origin truoc-techrealm-2026-11` | §7 |
| Apps Script | Không cần làm gì: mỗi lần Deploy là một phiên bản, bản cũ còn trong Manage deployments. `backups/…/live-Code.gs` là mã bản đang chạy | §7 |
| Google Sheet kết quả + sheet nhật ký | Mở từng file → File → **Tạo bản sao** (đặt tên kèm ngày) | Chép lại tab cần thiết |
| Firestore | Đợt này **không đổi** Firestore. Gói Spark không có export tự động (ROADMAP: lên Blaze mới bật export định kỳ) | — |

## 3. Staging (bản thử, địa chỉ riêng)

### 3.1 Apps Script thử nghiệm
1. Mở dự án Apps Script → dán toàn bộ `apps/Code.gs` mới → Lưu.
2. Chạy hàm `kiemTraSauDeploy`, phải đủ ✅.
3. **Deploy → New deployment** → Web app, *Execute as: Me*, *Who has access: Anyone* → chép **URL /exec mới**.

   → Deployment **cũ** của bản thật vẫn chạy phiên bản cũ. Học sinh không bị ảnh hưởng.
4. `node scripts/check-deployed-backend.js <URL /exec mới>` → phải báo `2026-11-17a`.

Lưu ý: hai deployment dùng **chung Google Sheet và Script Properties**. Khi thử, nộp bài dưới tên lớp `TEST-STAGING` để sau dễ lọc và xoá. Lượt AI thử tính vào trần 800 lượt/ngày của trường.

### 3.2 Web thử nghiệm (Cloudflare, Worker riêng)
```bash
node scripts/build-hosting.mjs --strict --staging=<URL /exec mới>
npx wrangler deploy --env staging        # Worker "ic3-professional-staging", KHÔNG đụng "ic3-professional"
```
- `--staging` thay URL Apps Script trong mọi file của `dist-hosting/`, kể cả gói `app/`. Bản staging chặn máy tìm kiếm (`robots.txt` + `X-Robots-Tag`). Mã nguồn không đổi.
- Địa chỉ staging: `https://ic3-professional-staging.<tài-khoản>.workers.dev`. Cấu hình `env.staging` trong `wrangler.jsonc` đã kiểm bằng `wrangler deploy --env staging --dry-run`.
- Chỉ phát file tĩnh, 0 lượt Worker.
- Thêm tên miền staging vào **HTTP referrers** của khoá Firebase / Drive (SECURITY_REPORT §4.3), và vào Firebase Console → Authentication → **Authorized domains** để đăng nhập được.
- **Sau khi thử xong, build lại bản thường** (`node scripts/build-hosting.mjs --strict`, không `--staging`) trước khi phát production.

## 4. Nghiệm thu trên staging (người thật, tài khoản thật)

Đánh dấu từng dòng. Kiểm thử tự động đã làm bằng tài khoản giả lập, nên **phần này bắt buộc**.

- [ ] Học sinh: mở sảnh, làm 1 bài **Ôn luyện** và 1 bài **Kiểm tra** (lớp `TEST-STAGING`). Bài lên Sheet đúng 1 dòng, không trùng.
- [ ] Mất mạng giữa bài (tắt Wi-Fi) → nộp → bật lại → bài tự gửi.
- [ ] Giáo viên: đăng nhập, mở `/app/#/giao-vien` → thấy bài vừa nộp → đăng xuất.
- [ ] `/app/#/giao-vien/nang-luc`: học sinh `TEST-STAGING` có trong báo cáo. Xuất CSV mở được bằng Excel.
- [ ] Tài khoản điều phối mở `/giao-vien/nang-luc` → bị chặn.
- [ ] Quản trị: `admin-users.html`, `/app/#/quan-tri`.
- [ ] TechRealm `/app/#/the-gioi`: các trang mở được. Bí cảnh 1 chơi hết màn 1. Thành phố xây được.
- [ ] AI Sư Phụ: hỏi 1 câu (key trường). Bấm "Báo câu trả lời có vấn đề" → sheet nhật ký có tab `NhatKyAI`, dòng mới **không chứa nội dung câu hỏi**.
- [ ] Đang làm dở 1 bài Kiểm tra → mở AI Sư Phụ → "Chế độ kiểm tra".
- [ ] Điện thoại thật + máy tính bảng thật: không tràn ngang, chữ đọc được.
- [ ] Firebase Console → Usage: số lượt đọc trong buổi thử không tăng bất thường.
- [ ] Xoá các dòng `TEST-STAGING` trong Sheet.

**Chủ dự án xác nhận nghiệm thu** rồi mới làm §5.

## 5. Production

Thứ tự: **Apps Script trước, web sau**. Bản Apps Script mới vẫn phục vụ đầy đủ web cũ, nên giữa hai bước không có gì hỏng.

1. Apps Script → **Manage deployments** → deployment của bản thật → ✏️ → Version: **phiên bản vừa tạo ở §3.1** → Deploy. URL /exec giữ nguyên, web không cần đổi gì.
2. `node scripts/check-deployed-backend.js` → phải ✔ `2026-11-17a`.
3. Gộp `react-2.0` vào `main` (PR), commit kèm `app/` → push.
   - GitHub Pages phục vụ thẳng từ `main`.
   - Cloudflare (Workers Builds) tự build `cd web && npm ci && cd .. && node scripts/build-hosting.mjs --strict` rồi deploy. Nếu deploy tay: `npx wrangler deploy` (không `--env`).
   - Firebase Hosting (nếu dùng): `firebase deploy --only hosting` (`predeploy` tự build).
4. (Không bắt buộc) Xoá deployment staging ở Apps Script và Worker staging (`npx wrangler delete --env staging`).

## 6. Kiểm sau triển khai (15 phút)
- Mở trang chủ trên điện thoại. F12 → Console không lỗi đỏ.
- Làm 1 bài, thấy trên Sheet.
- Giáo viên đăng nhập → Lớp học của tôi → Năng lực học viên.
- `/app/#/the-gioi/su-phu` hỏi 1 câu.
- Hôm sau: Firebase Usage (đọc/ghi) và số dòng `NhatKyAI` hợp lý (≤ 800 lượt AI/ngày).

## 7. Quay lui

| Sự cố | Làm |
|---|---|
| Web mới lỗi | `git revert -m 1 <commit merge>` → push (Pages và Cloudflare tự phát lại). Hoặc Cloudflare dashboard → Deployments → **Rollback** về bản trước (tức thì) |
| Apps Script mới lỗi | Manage deployments → deployment bản thật → Version: **bản cũ** (2026-11-04c) → Deploy. Web cũ chạy bình thường. Web mới vẫn chạy, chỉ AI Sư Phụ bằng key trường báo lỗi và thanh cảnh báo phiên bản hiện cho quản trị |
| Cần khôi phục mã nguồn | §2: `repo.bundle` / tag `truoc-techrealm-2026-11` |

Dữ liệu học sinh không cần quay lui: TechRealm chỉ ghi thêm khoá `tr.*` trên máy và tab `NhatKyAI`. Không sửa hay xoá dữ liệu cũ.
