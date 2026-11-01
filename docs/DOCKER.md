# Máy chủ trường bằng Docker

Một container phát **toàn bộ dự án** (EduQuiz + Đấu trường + Ôn luyện MOS) qua mạng LAN của trường.
GitHub Pages vẫn chạy song song như cũ cho học sinh ở nhà. Tệp nào cũng chỉ dùng Node có sẵn, không cài gói npm.

```
cp .env.example .env          # điền GAS_RELAY_TOKEN (xem §2)
docker compose up -d --build  # → http://<IP máy chủ>:8080      MOS: http://<IP máy chủ>:8080/mos/
```

Không có Docker: `node server/server.js` (cần Node ≥ 18), cùng các biến môi trường như trong `docker-compose.yml`.

## 1. Bớt được gì

| Giới hạn | Không có máy chủ trường | Có máy chủ trường |
|---|---|---|
| **Apps Script**: 30 lượt chạy song song / tài khoản; mỗi bài nộp = 1 lượt | Cả trường bấm "Nộp" cùng lúc → bị từ chối, máy học sinh gửi lại nhiều lần | Bài vào hàng đợi trên đĩa máy chủ, gửi lên **theo lô**: 1 lượt chạy ghi tới 50 bài (`GAS_BATCH`). Chưa bật lô: gửi lần lượt, tối đa 3 lượt cùng lúc |
| **Dung lượng GitHub** | Tệp đề MOS phải nằm trên git mới tải được | Tệp đề Word (~31 MB) và PowerPoint (~460 MB) **không lên git**: gắn thư mục `mos/files` vào container |
| **Băng thông GitHub Pages** (100 GB/tháng) | Mọi máy trong trường tải trang từ GitHub | Máy trong trường tải từ LAN (có nén gzip) |
| **Firebase** (Phòng cả lớp) | Bắt tay qua `0.peerjs.com`; mạng trường chặn thì học sinh đi đường dự phòng Firestore | Chạy kèm PeerServer (§4): học sinh trong LAN nối thẳng với máy giáo viên, ít đi đường dự phòng hơn |

Trang học sinh đã không dùng Firebase từ 10/2026. Máy chủ trường cũng không gọi Firebase.

## 2. Gửi bài theo lô (Apps Script)

1. Apps Script → Project Settings → Script Properties → thêm `RELAY_TOKEN`, giá trị là một chuỗi ngẫu nhiên dài.
   Chia Sheet theo trường (`sheetEndpoints`) thì đặt **cùng giá trị** ở mọi Apps Script.
2. Dán `apps/Code.gs` bản ≥ `2026-11-01` (có `submitBatch`), rồi Deploy → New version.
3. Trong `.env`, đặt `GAS_RELAY_TOKEN` bằng đúng giá trị đó, rồi chạy `docker compose up -d`.

Thiếu một trong ba bước thì máy chủ tự gửi từng bài như trước. Không mất bài.

Cách chạy:
- Trang mở từ máy chủ trường thì `js/backend-config.js` được nối thêm `EduBackend.schoolServer`, và `mos/js/config.js` được nối thêm `relayUrl`.
  Trang gửi bài vào `/api/gas`, kèm URL Apps Script mà trang lẽ ra gọi (theo `sheetEndpoints` của trường).
- Máy chủ chỉ chuyển tiếp tới `https://script.google.com/macros/s/...`.
  Mã bài trùng thì bỏ qua. Mỗi IP gửi tối đa `RELAY_RATE_PER_MIN` bài/phút.
- Học sinh thấy "Đã nộp" khi bài **đã ghi xuống đĩa** máy chủ (`/data/outbox.jsonl`).
  Mất mạng Internet hoặc khởi động lại máy chủ thì bài vẫn nằm đó và được gửi khi có mạng (thử lại sau 15 s, chậm dần tới 5 phút).
- Apps Script từ chối hẳn một bài (dữ liệu sai) thì bài đó vào `/data/rejected.jsonl`, không gửi lại nữa.
- Xem tình trạng: `http://<máy chủ>:8080/api/status`. Trang này cho biết số bài chờ gửi, đã gửi, bị từ chối, lỗi gần nhất, và lần đồng bộ GitHub gần nhất (§5).
  Trang chỉ có số đếm, không có dữ liệu học sinh.
- Apps Script mở Sheet và kiểm tra tab **một lần cho cả lô**, không phải một lần cho mỗi bài. Mỗi bài trong lô không phải mở lại file và đếm ô cả file như khi gửi lẻ.

Trên GitHub Pages không có các dòng nối thêm, nên trang gửi thẳng Apps Script như cũ.

## 3. Tệp đề MOS

`mos/files/` được gắn vào container ở chế độ chỉ đọc. Tạo hoặc cập nhật thư mục này bằng:

```
python mos/tools/build_catalog.py --src "<thư mục On_Tap_MOS>"
```

- Lệnh này đọc `On_tap_Excel.zip`, `On_Tap_PowerPoint.zip`, `On_Tap_Word.zip`.
- Danh mục đề (`mos/data/`) vẫn trên git, nên GitHub Pages vẫn liệt kê đủ đề.
- Đề Word/PowerPoint mở trên GitHub Pages sẽ báo "tệp đề chưa có trên máy chủ này". Đề Excel (~3 MB) vẫn trên git.
- Bản làm bài của học sinh (WebDAV cho Office) nằm ở volume `/data/work`, tự xoá sau `MOS_WORK_DAYS` ngày.

## 4. PeerServer cho Phòng cả lớp (tuỳ chọn)

```
# .env: PEER_PUBLIC_PORT=9000
docker compose --profile arena up -d
```

Trang mở từ máy chủ trường sẽ bắt tay qua `<máy chủ>:9000` thay cho `0.peerjs.com`.
Lần chạy đầu cần Internet để tải gói `peer@1.0.2`.

## 5. Tự cập nhật từ GitHub

Ảnh Docker chứa trang ở thời điểm build. Máy chủ tự kiểm tra nhánh `main` mỗi `SITE_SYNC_MIN` phút (mặc định 10):

- Không có commit mới: chỉ tốn 1 lượt hỏi trả về 304. Lượt này không tính vào hạn mức API GitHub (60 lượt/giờ khi không đăng nhập).
- Có commit mới: máy chủ so mã từng tệp với bản đang có, rồi **chỉ tải tệp đã đổi** vào volume `/data/site`.
  Tệp ở đó được phát trước tệp trong ảnh. Bản checkout Windows (xuống dòng CRLF) vẫn được coi là trùng với GitHub.
- Vì vậy, khi admin đẩy câu hỏi hoặc danh sách học sinh lên GitHub, máy chủ trường có bản mới sau tối đa ~10 phút mà không cần build lại.
- Không đồng bộ: mã máy chủ (`server/`, `mos/server.js`), tệp đề MOS (lấy từ thư mục gắn vào), mã Apps Script, công cụ.
  Đổi mã máy chủ thì phải build lại ảnh (hoặc kéo ảnh mới, §6).
- **Nhánh `main` trên GitHub là bản chuẩn.** Ảnh build từ máy có thay đổi chưa đẩy lên thì các tệp đó sẽ bị thay bằng bản GitHub.
  Khi đang thử thay đổi chưa đẩy, đặt `SITE_SYNC_MIN=0`.
- Tệp bị xoá trên GitHub vẫn còn trong ảnh tới lần build sau. Không trang nào trỏ tới tệp đó nên không gây hại.

## 6. Trường khác: dùng ảnh dựng sẵn (không clone repo)

Workflow `.github/workflows/docker-publish.yml` đẩy ảnh lên `ghcr.io/hcm-project-ic3/ic3_professional/school-server`.
Workflow chỉ chạy khi gắn tag `server-v*` hoặc bấm Run workflow. Lần đầu cần vào Packages và đặt gói **Public**.

Ở trường khác chỉ cần 2 tệp `docker-compose.yml` và `.env` (có `SCHOOL_IMAGE=ghcr.io/hcm-project-ic3/ic3_professional/school-server:latest`), cùng thư mục `mos/files` nếu dùng MOS:

```
docker compose pull && docker compose up -d --no-build
```

Dung lượng ảnh trên GHCR không tính vào dung lượng repo. Trang trong ảnh tự cập nhật theo §5, nên chỉ cần kéo ảnh mới khi mã máy chủ đổi.

## 7. Ghi chú

- Ảnh Docker chỉ chứa mã trang và `server/`, không chứa mã Apps Script, công cụ, tài liệu hay `.git`.
  Máy chủ cũng không phát các thư mục đó: `apps/`, `scripts/`, `docs/`, `server/`, `__tests__`, tệp ẩn.
- CI (`.github/workflows/ci.yml`, job `docker`) build ảnh và chạy thử mỗi lần đẩy code. CI không đẩy ảnh đi đâu.
- `mos/Dockerfile` (chỉ MOS) vẫn dùng được. Máy chủ chung đã gồm MOS nên không cần chạy cả hai.
- Lịch sử git cũ vẫn giữ các tệp Word và ảnh cũ đã từng commit. `python scripts/shrink-git-history.py`
  dọn chúng trên một bản sao riêng và in lệnh force-push để bạn tự chạy (xem đầu tệp script).
  Force-push ảnh hưởng mọi bản clone, nên chỉ làm khi cả nhóm đồng ý.
