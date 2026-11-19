# TechRealm — Learning System (Tàng Kinh Các + Luyện Công Đường)

> 16/11/2026 · Liên quan: [CULTIVATION_SYSTEM.md](CULTIVATION_SYSTEM.md) (EXP, cảnh giới), [ARCHITECTURE.md](ARCHITECTURE.md) §3 (M6, M7).

## 0. Tóm tắt

- **Không viết lại EduQuiz.** Làm bài vẫn ở sảnh cũ (`index.html?ct=&cap=&bai=`). Mọi chức năng sảnh vẫn nguyên: chọn
  trường/lớp/học sinh, chương trình/cấp/bài, Ôn luyện/Kiểm tra, đếm giờ, chấm điểm (`js/core/grading.js`), lịch sử,
  xuất kết quả, offline. `js/quiz-engine.js` **không sửa dòng nào**.
- **Khoá học sinh từ dữ liệu đang có**, không soạn tay: `scripts/build-techrealm-courses.mjs` đọc `data/ic3/meta.json`
  (bài, kiểm tra, ôn tập) và `data/slides-manifest.json` (bài giảng), ghi `data/techrealm/courses.json`. CI kiểm file
  luôn khớp ngân hàng câu hỏi.
- **Tiến độ đọc từ lịch sử bài làm sẵn có** (`eduquiz_records`), nối về đúng bài nhờ `{catId, levelId, mtKey}` mà sảnh
  đã lưu. Không ghi thêm gì.
- **Cấu hình của giáo viên nằm trong link** (`?lop=…`, nén deflate, giống đề tự soạn `?de=`).
- **Firebase: 0 lượt. Apps Script: 0 lượt.** Một file tĩnh 24 KB gzip, chỉ tải khi mở Tàng Kinh Các; service worker
  lưu đệm cho lần sau và khi mất mạng.
- **EXP:** chỉ bài Kiểm tra **được máy chủ chấm lại** và khớp điểm mới sinh EXP (`trRewardSubmission_`). Hook đã viết
  và test, **chưa nối, tắt mặc định**. Cần mã học tập (GĐ4).

## 1. Kho học liệu: 12 lĩnh vực, 13 khoá học, 259 bài

| Lĩnh vực | Khoá học | Nguồn |
|---|---|---|
| IC3 | IC3 cấp 1–3, IC3 Spark cấp 1–3 | 35 bài/cấp + bài kiểm tra + đề ôn trong `meta.json` |
| MOS | Word, Excel, PowerPoint | Bài MOS trong `meta.json` (bài có 0 câu hỏi bị bỏ) |
| Tin học văn phòng | Tin học văn phòng căn bản | Tuyển chọn 8 bài Word/PowerPoint của IC3 cấp 1 + thực hành máy tính mô phỏng |
| Computer Science | Tư duy máy tính | Tuyển chọn: Boolean, Flowchart, dữ liệu, trực quan hoá |
| AI | Trí tuệ nhân tạo nhập môn | Tuyển chọn: máy học, prompt, đánh giá công cụ AI, kiểm chứng thông tin |
| Kỹ năng sống | Kỹ năng sống trên môi trường số | Tuyển chọn: mật khẩu, bắt nạt trực tuyến, ứng xử, sức khỏe |
| Scratch, Python, Lập trình Web, Robotics, STEM, Khoa học tự nhiên | — | **Sắp mở**: chưa có nội dung, giao diện ghi rõ, không tạo bài giả |

Khoá tuyển chọn ghi đúng tên bài trong `meta.json`. Bài bị đổi tên thì script báo lỗi, nên không thể trỏ nhầm.

## 2. Cấu trúc một khoá học

| Prompt 04 yêu cầu | Trường trong `courses.json` | Ghi chú |
|---|---|---|
| Tên khóa | `name` (tên công pháp) + `plain` (tên thường) | |
| Mô tả | `description` | |
| Cấp độ | `level` | |
| Danh mục bài học | `lessons[]` `{ id, n, title, src:{ct,cap,bai}, questions, requires }` | `id` = `ic3-lv1/12` |
| Video | `lessons[].videos` + video giáo viên thêm qua link lớp | Kho chưa có video. Giáo viên thêm link https cho từng bài |
| Tài liệu | `lessons[].docs` (bài giảng Google Drive từ `slides-manifest.json`) + tài liệu giáo viên thêm | 331 tài liệu |
| Bài thực hành | Làm câu hỏi của bài ở chế độ Ôn luyện; `practice[]` (vd. máy tính mô phỏng) | |
| Bài kiểm tra | `gates[]` (minitest "Kiểm tra …") | Đặt sau bài thứ ⌊35 × tiết/45⌉ (ước theo số tiết trong tên); giáo viên đổi được |
| Điều kiện hoàn thành | Đạt điểm đạt (mặc định 70) ở mọi bài + mọi bài kiểm tra | `learning-core.courseStatus` |
| EXP thưởng | Xem trước theo bảng thưởng của luật tu luyện (20/bài, 60/kiểm tra) | Chỉ hiển thị; EXP thật do máy chủ ghi |
| Ôn tập | `reviews[]` | Không bắt buộc |

## 3. Cây công pháp và điều kiện học

- Mặc định **tuần tự**: bài N mở khi bài N−1 đạt điểm đạt. Bài kiểm tra mở sau bài nó yêu cầu.
- Hiển thị: chia tầng 7 bài, bài kiểm tra chen đúng chỗ. Mỗi nút có trạng thái *Đã đạt / Đang mở / Chưa mở* và điểm
  cao nhất. Bấm vào nút sẽ mở chi tiết: tài liệu, video, thực hành, cách nhận công huân, nút làm bài.
- Trạng thái tính bằng `learning-core.nodeStates` (thuần, có test).

**Giáo viên cấu hình** (Thầy cô: Quản lý công pháp, `/app/#/the-gioi/quan-ly-cong-phap`):

| Cài đặt | Phạm vi |
|---|---|
| Thứ tự học | Tuần tự / Tự do |
| Điểm đạt | 50–100 (link nhận 40–100) |
| Từng bài | Theo thứ tự / Mở sẵn / Khoá |
| Bài kiểm tra mở sau bài | Chọn bài bất kỳ |
| Video, tài liệu thêm | Tối đa 5 link https mỗi loại mỗi bài |
| Tên lớp | ≤ 40 ký tự |

Bấm **Tạo link**, gửi cho lớp. Học sinh mở 1 lần, lộ trình được nhớ trên máy đó (có nút "Bỏ lộ trình lớp"). Bản nháp
của giáo viên lưu trên máy giáo viên. Link do ai cũng tạo được nên khi nhận, `sanitizeClassConfig` làm sạch hết: id lạ,
link không phải https (chặn `javascript:`, `data:`), chuỗi quá dài, số ngoài khoảng.

**Vì sao không cần bảo vệ cấu hình:** cấu hình chỉ hướng dẫn thứ tự học trên máy học sinh. Học sinh tự sửa link thì
chỉ mở được bài sớm hơn, không nhận thêm EXP hay cảnh giới, vì những thứ đó do máy chủ xác thực.

## 4. Tích hợp EduQuiz IC3

| Chức năng sảnh | Trạng thái |
|---|---|
| Chọn trường / lớp / học viên | Giữ nguyên ở sảnh. TechRealm chỉ cho chọn "Tiến độ của …" trong số học sinh đã làm bài trên máy |
| Chọn chương trình / cấp độ / bài | Deeplink `?ct=&cap=&bai=` có sẵn (E2E `deeplink` 9 kiểm tra) |
| Ôn luyện / Kiểm tra, đếm giờ | Giữ nguyên ở sảnh. Học sinh chọn chế độ như cũ |
| Chấm điểm | Không đổi. `js/core/grading.js` (trình duyệt) và `77-grading.gs` (máy chủ) đã được test tương đương trên toàn ngân hàng |
| Lịch sử bài làm, xuất kết quả | Giữ nguyên ở sảnh. Thêm tab **Tiến độ & lịch sử** (đọc cùng dữ liệu, xuất CSV có BOM cho Excel) |
| Offline | Giữ nguyên. `courses.json` được service worker lưu đệm (mạng trước, đệm sau) |

**EXP sau khi bài làm được xác nhận hợp lệ** (`apps/src/79-tr-ledger.gs` § `trRewardSubmission_`):
```
bài nộp → applyServerGrading_ (chỉ chế độ Kiểm tra) → detail.sv, detail.sk
  thiếu mã học viên / không có sv / sk ≠ 'ok' (lệch điểm)  → không thưởng
  đủ → EduLearning.submissionEvents → LESSON | TEST | EXERCISE → CultivationService.recordEvent (actor: system)
```
Hook chưa được gọi trong `writeSubmissionLog_`, và công tắc Script Property `TR_REWARDS` mặc định tắt. Nối ở GĐ4 cùng
mã học tập (sảnh gửi kèm `lid`).

## 5. Trang

| Trang | Đường dẫn | Ai |
|---|---|---|
| Tàng Kinh Các: 12 lĩnh vực, thẻ khoá học có tiến độ | `/app/#/the-gioi/tang-kinh-cac` | Học sinh |
| Công pháp: cây bài, chi tiết bài, điều kiện, EXP, đề ôn | `/app/#/the-gioi/tang-kinh-cac/<id>` | Học sinh |
| Quản lý công pháp | `/app/#/the-gioi/quan-ly-cong-phap` | Giáo viên |
| Tiến độ & lịch sử (tab trong Luyện Công Đường) | `/app/#/the-gioi/luyen-cong` | Học sinh |
| Báo cáo cả lớp | `teacher-dashboard.html`, `/app/#/giao-vien` (có sẵn, đọc Sheet) | Giáo viên |

## 6. Mã nguồn

| Tầng | File |
|---|---|
| Domain (dùng chung trình duyệt + Apps Script) | `js/techrealm/learning-core.js` |
| Sinh nội dung | `scripts/build-techrealm-courses.mjs` → `data/techrealm/courses.json` |
| Dữ liệu trình duyệt (tải, link lớp, mã hoá) | `web/src/features/techrealm/learning/learning.ts` |
| Thành phần | `learning/components.tsx` (`CourseTree`, `LessonDrawer`, `LearnerBar`, `ClassBanner`), `learning/ProgressReport.tsx` |
| Trang | `pages/LibraryPage.tsx`, `pages/CoursePage.tsx`, `pages/TeacherCoursesPage.tsx`, `pages/PracticePage.tsx` |
| Máy chủ | `apps/src/79-tr-ledger.gs` § `trSubmissionOf_`, `trRewardSubmission_` |

## 7. Kiểm thử

| Bộ | Nội dung | Số kiểm tra |
|---|---|---|
| `js/techrealm/__tests__/learning-core.test.js` | Mọi nút trong `courses.json` (bài, kiểm tra, ôn tập) nối đúng từ bài làm ở sảnh; không trùng id; danh sách bài trong điều kiện đột phá khớp khoá học; làm sạch link; tiến độ; cây (tuần tự, tự do, khoá, mở, đổi điểm đạt, đổi chỗ kiểm tra); hoàn thành; nối trọn đường vào luật tu luyện | 30 |
| `apps/__tests__/tr-ledger.test.js` | Hook thưởng: tắt, thiếu mã, lệch điểm, chưa chấm, thưởng + trùng, MOS | 23 (cả bộ) |
| `tests/e2e/suites/techrealm.mjs` | 12 lĩnh vực; tiến độ thật từ lịch sử; cây 39 nút đúng trạng thái; chi tiết bài + tài liệu + link sảnh; giáo viên tạo link → học sinh mở → lộ trình áp dụng → bỏ; báo cáo + lọc; 375px | 49 (cả bộ) |

## 8. Chưa làm / giới hạn

1. **Video:** kho chưa có video. Giáo viên thêm theo lớp. Muốn có video chung cho mọi lớp thì thêm trường vào script
   sinh khoá học.
2. **Vị trí bài kiểm tra** được ước theo số tiết trong tên đề. Giáo viên chỉnh được theo lớp. Nếu có bảng PPCT chuẩn
   cho IC3 THCS thì thay ước lượng bằng dữ liệu thật.
3. **Chủ đề (linh căn) của từng bài:** chưa gán, vì minitest bài không chung câu hỏi với minitest chủ đề. Linh căn vẫn
   tính từ bài đánh giá theo chủ đề.
4. **Chọn chế độ Kiểm tra từ link:** sảnh chưa có tham số chế độ. Muốn thêm thì phải sửa `quiz-engine.js` / sảnh, nên
   chưa làm.
5. Tiến độ gắn với **máy** và tên học sinh như sảnh hiện nay. Đồng bộ nhiều máy cần mã học tập (GĐ4).
6. 6 lĩnh vực chưa có nội dung.
