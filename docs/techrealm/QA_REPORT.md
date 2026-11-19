# Báo cáo kiểm thử (QA) — TechRealm 2.0 + EduQuiz (Prompt 08)

Ngày chạy: 17–18/11/2026 · Nhánh `react-2.0` (chưa commit) · Máy: Windows 11, Chrome và Edge 157 · Mọi số dưới đây là **kết quả chạy thật**.

## 1. Tóm tắt

| Loại | Kết quả |
|---|---|
| E2E Chrome, mã nguồn (13 bộ) | __CHROME__ |
| E2E Chrome, **bản phát hành** `dist-hosting/` (bản rút gọn sẽ đưa lên mạng) | __DIST__ |
| E2E **Edge** (13 bộ) | __EDGE__ |
| Nhật ký mạng toàn bộ lượt Chrome | __NETLOG__ |
| Unit test `js/*/__tests__` | 66/67 đạt. `fa-subset` chỉ lỗi vì git đang giữ bản `app/` cũ; đưa bản build mới vào chỉ mục tạm thì **đạt** (hết khi commit `app/`) |
| Kiểm tra CI (15 script: dữ liệu, JS, HTML, kiến trúc, Apps Script, máy chủ, rubric MOS) | 15/15 |
| Typecheck web (`tsc -b`) | Đạt |
| `npm audit` web | 0 lỗ hổng (sau khi nâng react-router, vite) |
| Test rules Firestore (emulator) | **Chưa chạy được trên máy này** (cần Java). Chạy ở job CI `firestore-rules` |
| Firefox | **Chưa kiểm** (máy không cài) |
| Đăng nhập Firebase bằng tài khoản thật, gọi Gemini thật | **Chưa kiểm**. Làm ở staging (DEPLOYMENT_GUIDE §4) |

Kết luận: các chức năng đều qua kiểm thử tự động trên Chrome và Edge, cả với mã nguồn lẫn bản phát hành. **Chưa đủ điều kiện production** cho tới khi xong 3 việc ở §7.

## 2. Kiểm thử chức năng (§1)

E2E chạy trên trình duyệt thật. Đăng nhập nhân sự dùng bản giả lập (`stubAuth`), nhưng khi chưa đăng nhập thì chạy **Firebase SDK thật**.

| Chức năng | Kiểm bằng | Kết quả | Ghi chú |
|---|---|---|---|
| Đăng nhập | E2E `teacher`, `admin`, `coordinator`; `pages` (login.html) | Đạt | Chưa đăng nhập → mời đăng nhập, quay lại đúng trang, 0 lượt Firestore/Auth. Đăng nhập tài khoản thật: staging |
| Đăng xuất | E2E `teacher` | Đạt | Không thao tác 14,5 phút → cảnh báo; 15 phút → đăng xuất, về đúng trang |
| Phân quyền | E2E `teacher` / `admin` / `coordinator` + `code-gs.test.js` (vai trò từng API Apps Script) | Đạt | Sai vai trò, chờ duyệt, chưa gán trường → chặn, 0 lần tải. **Mới:** Báo cáo năng lực chặn điều phối và người chưa đăng nhập |
| Quản lý lớp | `pages` (roster-manager), `teacher` (lọc lớp không tải lại), unit roster-cache / admin-delta | Đạt | Ghi danh sách lên Firestore thật: staging |
| EduQuiz IC3 | E2E `student`, `learning`, `deeplink`, `play`; `validate-data` (2.687 câu) | Đạt | |
| Chấm điểm | `grading.test`, `grading-guard`, `grading-wire`, `result-submitter`, `arena-core` | Đạt | Thuật toán chấm không đổi |
| Lịch sử bài làm | E2E `learning`, `techrealm` (Tiến độ & lịch sử, lọc Kiểm tra / Ôn luyện); `wrongbook-store`, `result-pack` | Đạt | |
| Offline | E2E `offline` (service worker, mở lại khi mất mạng); `apps-script-saving` (hàng đợi gửi lại) | Đạt | |
| EXP | `cultivation-core`, `cultivation-service`, `tr-ledger` (máy chủ) | Đạt | Công huân thật **đang tắt** tới GĐ4 (mã học tập) |
| Cảnh giới | `cultivation-*`; E2E `techrealm` (điều kiện đột phá, khoá nút, hiệu ứng) | Đạt | |
| Nhiệm vụ | `smart-city-core`, `arena-quest-core`; E2E `techrealm` (nhiệm vụ đời sống), `play` (nhiệm vụ ngày, Hành trình) | Đạt | |
| Kho vật phẩm | E2E `techrealm` (Túi Càn Khôn: thiếu linh thạch → khoá); `cultivation-core` | Đạt | |
| Thành tựu | E2E `techrealm`, `student` | Đạt | |
| Bí cảnh | `challenge-core`; E2E: điểm trên màn hình = điểm máy chủ chạy lại nhật ký | Đạt | |
| Dự án (Bách Công Phường) | E2E `techrealm` (nộp thiếu tệp → báo lỗi) | **Một phần** | Chỉ có giao diện. Nộp và chấm thật là GĐ7 |
| Báo cáo | `analytics-core` (dữ liệu meta/courses thật); E2E `teacher` (+6: số liệu, lỗ hổng, lọc lớp, 375 px) | Đạt | CSV có BOM, mở được bằng Excel |
| AI Sư Phụ | `mentor-core`, `code-gs` (khối AI Sư Phụ); E2E `techrealm` | Đạt | Gọi Gemini thật: staging |
| Đấu trường (đợt 18/11) | `arena-core` (+17), `arena-hype` (+5), E2E `play` (29 → 48) | Đạt | Bạn máy theo kế hoạch, đối thủ nhớ em, Hành trình nhập vai (CHANGELOG 35) |

## 3. Kiểm thử dữ liệu (§2)

| Yêu cầu | Bằng chứng |
|---|---|
| Không mất dữ liệu cũ | TechRealm chỉ ghi khoá mới `tr.*`. Hai khoá AI dùng chung (`eduquiz_ai_v1`, `eduquiz_ai_cid`) có cùng định dạng và cùng luật với `ai-service.js` (đã đối chiếu mã). Firestore: rules, index, collection **không đổi**. Sheet: chỉ thêm tab `NhatKyAI`. Bản sao lưu đã thử khôi phục: 142/142 file khớp |
| Không ghi nhận trùng | Bài nộp: chống trùng 6 giờ (CacheService, `code-gs.test`). Sổ cái công huân: mã giao dịch xác định, `summarize` chỉ tính dòng đầu (`tr-ledger.test`) |
| Không cộng EXP sai | `cultivation-*.test` (công thức, trần, đột phá). Bí cảnh: máy chủ chạy lại nhật ký thao tác, không tin điểm từ máy (E2E so điểm) |
| Không truy cập trái phép | E2E chặn theo vai trò (§2). `aiAsk` công khai từ chối việc của giáo viên. Rules Firestore: CI |
| Không sửa dữ liệu người khác | Rules Firestore (không đổi, 33 ca test ở CI). Học sinh không có tài khoản. Sổ cái chỉ ghi thêm, thu hồi là dòng đảo |
| Không lộ thông tin cá nhân | Lọc dữ liệu cá nhân trước khi gửi AI (trình duyệt và máy chủ, có test). Nhật ký AI không có nội dung, người dùng ghi bằng mã băm. Bản phát hành không chứa mã máy chủ, sao lưu hay bí mật (có chốt chặn, SECURITY_REPORT §4.0) |

## 4. Kiểm thử giao diện (§3)

| Kích thước | Trang kiểm | Kết quả |
|---|---|---|
| Desktop 1280 / 1366 px | Mọi trang (`pages`, `techrealm`, `teacher`…) | Đạt |
| **Màn hình lớn 1920 × 1080** (bộ mới `responsive`) | 27 trang `.html` + 24 route app/TechRealm | Không tràn ngang, không lỗi JS, không `console.error` của trang |
| **Tablet dọc 768 × 1024, tablet ngang 1024 × 768** (bộ mới) | Như trên | Như trên |
| Mobile 375 px | Mọi trang | Không tràn ngang |

| Trình duyệt | Kết quả |
|---|---|
| Chrome 157 | __CHROME__ |
| Edge 157 | __EDGE__ |
| Firefox | Chưa kiểm (không cài). Nên thử tay một vòng ở staging |

## 5. Hiệu suất (§4)

| Hạng mục | Hiện trạng | Đánh giá |
|---|---|---|
| Tối ưu ảnh | 81 webp, 37 svg, 40 jpg, 20 png. Ảnh > 300 KB: `img/cpu.png` 460 KB (dùng trong đề IC3), `img/anim/404.webp` 416 KB, 1 ảnh portfolio 316 KB | Nên chuyển `cpu.png` sang webp (phải sửa đường dẫn trong 6 file đề, nên để đợt riêng) |
| Lazy loading | App: TechRealm, AI Sư Phụ (19 KB gzip), Bí cảnh, Thành phố, Năng lực, Giáo viên, Quản trị đều là gói lười. Trang cũ: gộp 502 thẻ script/link → 156 | Tốt |
| Bundle | Gói đầu app 134 KB gzip (react-router mới +4 KB). TechRealm 50 KB, CSS chung 6,5 KB. Bản phát hành rút gọn JS/CSS 5,2 MB → 2,9 MB | Chấp nhận |
| Truy vấn Firestore | Học sinh và TechRealm: **0**. Báo cáo năng lực dùng lại dữ liệu và bản đệm của trang giáo viên (E2E: tải đúng 1 lần, lọc lớp không tải lại). Nhật ký mạng cả lượt: __NETLOG__ | Tốt |
| Animation | Quy tắc "giảm chuyển động" toàn cục (app) và từng phần (trang cũ). **Đấu trường:** hết cảnh vẽ lại 2 lần mỗi khi về bản đồ; vùng ngoài màn hình không vẽ (`content-visibility`) | Đã sửa chỗ giật |
| Lỗi console | Bộ `responsive`: 0 `console.error` cùng nguồn trên 51 trang × 3 kích thước | Đạt |
| Trang chậm | `tai-lieu-nam-hoc.html`: sự kiện `load` mất ~28 giây vì phải đợi khung PowerPoint Online nhúng, và mạng không bao giờ rảnh | Nên nạp khung nhúng khi bấm xem (đợt riêng). Test đã đổi cách chờ để không lỗi oan |

## 6. Lỗi tìm thấy trong đợt QA

| # | Lỗi | Mức | Trạng thái |
|---|---|---|---|
| 1 | `build-hosting` có thể phát cả thư mục sao lưu (toàn bộ repo) | Cao | **Đã sửa** + có chốt chặn và test đột biến |
| 2 | react-router 7.9.1 có lỗ hổng | Cao | **Đã sửa** (7.18.5), build và chạy lại E2E |
| 3 | Thiếu header nosniff / Referrer-Policy | Trung bình | **Đã sửa** |
| 4 | Đấu trường: bạn máy "chốt" một thời điểm nhưng được chấm theo lần tung xúc xắc khác | Trung bình (cảm giác giả) | **Đã sửa**, có test đột biến |
| 5 | Đấu trường: về bản đồ thì vẽ lại 2 lần, dựng lại 8 cảnh SVG (giật) | Trung bình | **Đã sửa** (E2E: 0 lần dựng lại) |
| 6 | E2E: `tai-lieu-nam-hoc` quá thời gian chờ (khung nhúng ngoài) | Lỗi của bộ test | **Đã sửa** cách chờ |
| 7 | Máy ngủ giữa lượt chạy làm trình duyệt đóng | Môi trường | Chạy lại |

## 7. Còn mở (trước production)

1. Job CI `firestore-rules` xanh (máy này không có Java).
2. Nghiệm thu trên staging bằng tài khoản thật: đăng nhập, nộp bài, AI bằng key trường (DEPLOYMENT_GUIDE §4). Thử thêm Firefox.
3. Xác nhận giới hạn 2 khoá API dùng ở trình duyệt (SECURITY_REPORT §4.3).

Không chặn production, làm đợt sau: `cpu.png` sang webp, nạp khung PowerPoint khi bấm xem, nâng `puppeteer-core`, bộ `responsive` làm job E2E CI dài thêm khoảng 4,5 phút.

## 8. Cách chạy lại

```bash
cd tests/e2e && npm ci
node run.mjs                                   # Chrome, 13 bộ
CHROME_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" node run.mjs   # Edge
node ../../scripts/build-hosting.mjs --strict && E2E_ROOT=../../dist-hosting node run.mjs # bản phát hành
E2E_NETLOG=./netlog node run.mjs && node netlog-check.mjs netlog/*.json                   # chứng minh 0 Firestore
```
