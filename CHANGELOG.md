# Nhật ký thay đổi — EduQuiz IC3

Ghi những thay đổi người dùng thấy được và việc cần làm khi triển khai.
Chi tiết kỹ thuật từng đợt: xem lịch sử git của file này và commit tương ứng.

## Khi triển khai bản mới

Thứ tự: Apps Script → `firestore.rules`/index → đẩy web.

1. `node scripts/check-deployed-backend.js` — Apps Script đang chạy phải khớp `BACKEND_VERSION`.
   Lệch thì dán `apps/Code.gs`, chạy `kiemTraSauDeploy`, Deploy → New version.
2. Publish rules và index (cần nếu chưa làm từ đợt 26/10 và 29/10: `teacher_sync`,
   giáo viên tự nhập lịch, `arena_relay`):
   `firebase deploy --only firestore:rules,firestore:indexes --project data-ic3`
3. Firebase Console → Authentication → Anonymous: **Enabled** (đường dự phòng Phòng cả lớp).
   App Check: không Enforce.
4. Kiểm tra nhanh trên bản thật:
   - Điểm danh → Cài đặt → "Đồng bộ ngay" báo đã lưu; đăng nhập máy khác thấy đủ link.
   - Tài khoản Điều phối mở Báo cáo kết quả: chỉ thấy trường của mình.
   - Giáo viên nhập lịch từ Excel tổ sau khi đồng nghiệp vừa nhập: không báo lỗi quyền.
   - F12 → Console, lọc "lượt đọc Firestore": danh sách học sinh chỉ vài lượt mỗi lần mở.
     Lệch dữ liệu thì đặt `rosterDeltaSync: false` trong `js/backend-config.js`.

## 02/11/2026

- **Dashboard Điều phối có thẻ "Câu học sinh hay sai"** (dùng chung `js/teacher/wrong-questions.js` với dashboard giáo viên).
  - Theo đúng bộ lọc Khoá học / Giáo viên / Lớp / Bài thi / Thời gian đang chọn, chỉ trong các trường được gán.
  - Bấm "Phân tích" mới gọi Apps Script `wrongStats` (đã cho vai trò Điều phối từ trước). 0 lượt Firestore.
  - "Tạo đề ôn" chép link đề từ các câu sai nhiều nhất, như ở dashboard giáo viên.
  - Không cần deploy lại Apps Script hay rules.
- CI kiểm thêm:
  - `scripts/check-html.js` (mới): trang HTML/CSS không trỏ tới file JS/CSS/ảnh/font đã xoá hoặc đổi tên; trang nào cũng có `lang`, `viewport`, `<title>`.
  - `scripts/check-js.js` kiểm cú pháp cả `mos/`, `server/`, `scripts/` (trước chỉ `js/` và `sw.js`).
  - `mos/tools/test-rubrics.js`: tiêu chí chấm MOS không "đạt sẵn" trên tệp đề gốc.
- Các trang quản lý (đăng nhập, dashboard, sổ đầu bài, lịch dạy…) có `theme-color` như trang chính: thanh trình duyệt điện thoại cùng màu.
- EduQuiz 2.0 — Sprint 0:
  - Báo cáo audit kiến trúc + bảo mật: `docs/architecture/AUDIT-2.0.md`.
  - `js/repositories/user-repository.js` (mới): mọi truy cập collection `users` của trang quản lý đi qua
    repository (trừ `js/auth.js`). Quản lý tài khoản, Quản lý lớp, Dashboard Điều phối, Lịch giảng dạy
    không đổi giao diện, không đổi số lượt đọc. Không cần deploy lại rules hay Apps Script.
  - Khi máy offline/hết lượt đọc, danh sách giáo viên báo lỗi như các danh sách khác thay vì hiện rỗng.
- **Danh mục trường + vai trò "Quản trị trường"** (EduQuiz 2.0, bước chuẩn hoá đa trường):
  - Collection mới `schools`, id = `schoolId` suy từ tên ("THCS Huỳnh Tấn Phát" → `thcs-huynh-tan-phat`,
    `js/models/school.model.js`). Trang Quản lý tài khoản tự thêm trường còn thiếu theo roster (chỉ thêm, không sửa).
  - Gán "Trường được xem" giờ ghi thêm `schoolIds` lên hồ sơ. Rules nhận bản ghi theo tên trường **hoặc**
    `schoolId` — dữ liệu cũ chỉ có tên vẫn chạy như trước.
  - Vai trò `school_admin` (Quản trị trường): Admin gán ở Quản lý tài khoản, kèm "Trường được xem". Dùng
    Dashboard Điều phối, Quản lý lớp, Báo cáo kết quả như Điều phối đào tạo nhưng chỉ trong trường được gán;
    sửa được địa chỉ/điện thoại/người liên hệ của trường mình. Không tự đăng ký được.
  - **Cần triển khai theo thứ tự:** (1) dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-02 —
    thiếu bước này `school_admin` bị Apps Script từ chối); (2) publish `firestore.rules`; (3) đẩy web.
  - Kiểm tra sau triển khai: tài khoản `school_admin` chỉ thấy học sinh/kết quả của trường được gán; Admin mở
    Quản lý tài khoản thấy collection `schools` có đủ trường trong Firebase Console.
- **Gắn `schoolId` cho học sinh và lớp** (tiếp bước chuẩn hoá đa trường):
  - Mọi lần thêm/sửa học sinh, lớp (tay, Nạp Excel, đổi giáo viên) tự ghi `schoolId` khớp tên trường.
  - Dữ liệu cũ: lần đầu **Admin** mở Quản lý lớp sau khi cập nhật, trang tự ghi bù `schoolId` cho học sinh/lớp
    còn thiếu (1 lần mỗi máy, ~1 lượt ghi/bản ghi — vài nghìn lượt, trong hạn mức 20k ghi/ngày) và báo số bản ghi.
    Không đổi `updatedAt` nên các máy khác **không** phải đọc lại danh sách học sinh.
  - Chỉ cần đẩy web — không đổi rules, không đổi Apps Script.
  - Kiểm tra: Firebase Console → `students_roster`/`classes` có field `schoolId`.
- **Kết quả bài nộp (Google Sheet) lọc theo `schoolId`:**
  - Apps Script so trường theo `schoolId` suy từ cột Trường — tên gõ khác hoa/thường/dấu cách
    (vd "THCS Lê Lợi" / "thcs  lê lợi") giờ vẫn khớp; không thêm cột, không sửa dữ liệu Sheet cũ.
  - Tài khoản chỉ có `schoolIds` (không có tên trường) vẫn xem được kết quả/roster trường mình.
  - Quản lý tài khoản cảnh báo nếu có 2 trường tên chỉ khác dấu (vd "TH Ân" / "TH An") — hai trường này
    sẽ bị coi là một, cần đổi tên cho khác hẳn.
  - **Cần triển khai:** dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-02b), rồi đẩy web.
    Không đổi rules.
- **Siết rules — đóng 2 chỗ ghi không còn ai dùng** (audit §5.3, §3):
  - `mos_submissions`: trước ai cũng ghi được không cần đăng nhập (đốt hạn mức). Web đã bỏ từ 02/11 — bài MOS
    chỉ gửi Apps Script (tab `NhatKyMOS`). Bản ghi cũ vẫn đọc được tới khi TTL tự xoá.
  - `questions` (ngân hàng câu hỏi cũ trên Firestore): giáo viên không ghi được nữa; Admin còn đọc/xoá để dọn.
  - **Cần triển khai:** `firebase deploy --only firestore:rules --project data-ic3`.

## 03/11/2026

- **Dashboard giáo viên: "Tổng quan lớp" kiểu thẻ + Giao bài · So sánh 2 đợt · Chuyên cần — 0 lượt Firebase thêm**
  (`js/teacher/insights.js`, logic thuần `js/teacher/teacher-insights-core.js` + test, `css/teacher-insights.css`):
  - **Thống kê lớp** (tổng học sinh, cần hỗ trợ < 60%, xuất sắc ≥ 85%, thanh "% học sinh đã làm bài") ·
    **Năng lực cả lớp** (vòng tròn Giỏi/Khá/TB/Yếu theo điểm TB từng em + 4 em tiêu biểu kèm nhãn Tiến bộ/Sa sút/Ổn định)
    · **Cần hỗ trợ & Xuất sắc** (3 + 3 em, nút "Xem" mở lịch sử làm bài) · **Tổng kết tiến độ** (đồng hồ Chưa làm /
    Chưa đạt / Đạt / Vượt trội). Theo đúng bộ lọc trường/lớp/bài/thời gian; sáng/tối, điện thoại.
  - **Giao bài theo lớp:** chọn đề đã soạn (Soạn đề trên cùng máy) → hạn nộp → các lớp → "Giao bài". Mỗi bài hiện
    đã nộp/sĩ số từng lớp, số em nộp muộn, điểm TB; "Chép lời giao bài" (tên đề, hạn, link) và "Chép tên chưa nộp" để
    dán nhóm lớp. Lưu trên máy (`eduquiz_assign_v1`).
  - **So sánh 2 đợt kiểm tra:** chọn đợt A/B → điểm TB từng lớp (2 thanh), chênh lệch, số em tiến bộ/sa sút (±5).
  - **Chuyên cần:** tỉ lệ có mặt từng lớp + em vắng ≥ 3 buổi / vắng liền ≥ 2, lấy từ sổ lớp trang Điểm danh đã đọc
    trên cùng máy (Google Sheet, không Firebase). Chưa có thì hướng dẫn mở Điểm danh → "Cập nhật tất cả".
  - Tính trên bài nộp dashboard đã tải + localStorage → **0 lượt đọc/ghi Firestore, 0 lượt Apps Script thêm**.
    Các phần sẵn có giữ nguyên (KPI, 6 biểu đồ, danh sách cần chú ý, câu hay sai, bảng học sinh, xuất Excel/PDF).
  - Chỉ cần đẩy web.
- **Clean Architecture — quy ước + máy kiểm tra** (`docs/architecture/CLEAN-ARCHITECTURE.md`). Người dùng không thấy khác:
  - 4 tầng gắn vào thư mục sẵn có: Domain (`js/core`, `js/models`, `*-core.js`) · Use case · Adapter
    (`js/repositories`, Apps Script, Gemini, localStorage) · Giao diện. Phụ thuộc chỉ hướng vào trong.
  - CI thêm bước `node scripts/check-architecture.js`: Domain không đụng DOM/mạng/Firebase/bộ nhớ trình duyệt;
    repository không đụng giao diện; trang không thêm lượt gọi Firestore trực tiếp (nợ cũ ghi số, chỉ được giảm).
  - Model không còn gọi `firebase.firestore.FieldValue` — đặt dấu `EduModels.SERVER_TIME`, repository đổi thành
    `serverTimestamp()`; chạy được trong Node. Ghi theo lô qua `EduBaseRepository.commitBatch` (tự chia lô 450).
  - Lịch giảng dạy (nhập lịch từ Excel, tạo tuần có sao chép lịch, lưu lịch tuần) ghi qua repository thay vì tự dựng
    `db.batch()` — số lượt ghi Firestore **không đổi**.
  - Trợ lý AI tách use case `js/services/ai-assistant.js` (luật key 2 lớp, test bằng cổng giả) khỏi adapter/giao diện
    trong `ai-service.js`. Các trang AI nạp thêm `ai-assistant.js`.
  - Test mới: `js/repositories/__tests__/base-repository.test.js`, `js/services/__tests__/ai-assistant.test.js`.
  - Chỉ cần đẩy web. Không đổi Apps Script, không đổi rules.
- **Trợ lý AI (Gemini) — 0 lượt Firebase** (theo giáo trình "Web App", phần API key Gemini: key hệ thống + key cá nhân):
  - **Học sinh — "Hỏi AI: vì sao em sai?"** ở màn xem lại bài (cả chế độ Ôn luyện): giải thích vì sao lựa chọn của em
    chưa đúng, vì sao đáp án đúng, 1 mẹo nhớ. Chỉ câu sai/bỏ trống, chỉ khi em bấm.
  - **Giáo viên — "AI soạn câu"** ở Soạn đề: chủ đề hoặc đoạn bài học → 3–15 câu (độ khó, lớp, có thể xen Đúng/Sai và
    nhiều đáp án), đổ vào hộp "Nhập nhanh" để duyệt/sửa rồi mới thêm.
  - **Giáo viên — "Gợi ý dạy lại (AI)"** trong thẻ "Câu học sinh hay sai" (dashboard giáo viên / điều phối / ic3-dashboard):
    vì sao hay sai, cách giảng lại trong 3 phút, 1 câu củng cố.
  - **Gọi tên — "AI soạn thêm câu hỏi cho bài này"**: câu hỏi miệng theo bài đang chọn, trộn vào xấp "Bốc thử thách";
    lưu trên máy (`eduquiz_goiten_ai_v1`), xoá được.
  - **Key 2 lớp:** (1) key cá nhân trong localStorage → gọi thẳng Gemini, không gửi lên máy chủ; (2) không có / hết hạn
    mức / key sai → Apps Script gọi bằng **key của trường** cất trong Script Properties (học sinh F12 không thấy);
    (3) cả 2 không được → báo lý do + nút "Cài đặt AI". Hộp "Cài đặt AI" có "Kết nối thử" trước khi lưu; Admin cài key
    trường ngay trên web (Apps Script gọi thử, sai thì không lưu).
  - **Chống hao phí:** câu lệnh do code dựng (không ai mượn key trường hỏi việc khác); lời giải lưu đệm trên máy + 6 giờ ở
    máy chủ (nhiều em hỏi cùng câu → 1 lượt Gemini); trần 30 lượt/máy học sinh/ngày, 150/tài khoản giáo viên/ngày,
    800 lượt/ngày cả trường (đổi được). Không gửi tên học sinh. Lượt học sinh **không đọc Firestore** (đã test).
  - Mã: `js/services/ai-core.js` (+ test), `js/services/ai-service.js`, `css/ai-assist.css`, `apps/src/78-ai.gs`
    (câu lệnh giống hệt bản web — `apps/__tests__/code-gs.test.js` so 2 bản).
  - **Cần triển khai:** (1) dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-03c);
    (2) đẩy web; (3) Admin mở Soạn đề hoặc dashboard → bấm "AI soạn câu"/"Gợi ý dạy lại" → "Cài đặt AI" → "Key hệ thống
    của trường" → dán key từ aistudio.google.com/apikey → "Kiểm tra & lưu". Chưa cài key trường thì ai có key cá nhân
    vẫn dùng được. Không cần sửa rules.
- **Gọi tên: thẻ "Chia nhóm" + đọc to tên** (`goi-ten.html`):
  - Chọn 2–8 nhóm, tuỳ chọn mỗi nhóm 1 nhóm trưởng ngẫu nhiên (★). Chỉ chia các bạn có mặt; nhóm lệch nhau tối đa 1 bạn.
  - "Gọi một nhóm": đèn chạy qua các nhóm rồi dừng ở 1 nhóm. "Sao chép kết quả" để dán vào Zalo/Word.
  - Kết quả chia nhóm lưu theo từng danh sách trong localStorage (`eduquiz_goiten_v1`); "Xoá hết tên" xoá luôn nhóm của danh sách dán.
  - Tuỳ chọn "Đọc to tên người được gọi" (giọng có sẵn trên máy qua Web Speech; không có giọng Việt thì dùng giọng mặc định).
  - 0 Firebase / Apps Script. Test: `js/name-picker/__tests__/name-picker-core.test.js` (`makeGroups`). Chỉ cần đẩy web.
- **Gọi tên: 17 trò (thêm 6) + kịch tính hơn ở mọi trò** (`js/name-picker/np-games-extra.js`, tranh SVG tự vẽ):
  - Trò mới: **Ong tìm hoa** (tới 40 bạn) · **Mèo bắt chuột** · **Thả diều** (gió lớn giữa chừng) · **Sút luân lưu**
    (thủ môn bắt, trúng cột, dội xà... bàn thắng vàng ở cú cuối) · **Đèn xanh đèn đỏ** (đèn đỏ cuối rơi đúng lúc hết giờ) ·
    **Bịt mắt bắt dê** (dưới gốc đa). Đều có Lật kèo và "Mỗi lượt đổi trò ngẫu nhiên".
  - Mọi trò dùng khung "người bắt": vòng ngắm đỏ nhấp nháy dưới chân bạn sắp bị bắt; máy quay cận cảnh lúc bắt thật
    (tắt khi máy bật "giảm chuyển động"); 3 giây cuối có 2 dải đen kiểu phim.
  - Đã chạy thử trên Chrome cả 6 trò mới + Trộm trứng, Đèn pin, Thẻ đỏ, UFO: đủ lượt, hiện khung tên, không lỗi console.
  - 0 Firebase / Apps Script. Chỉ cần đẩy web.
- **Tranh "3D": nhân vật có khối** (Gọi tên + Đấu trường + mọi trang dùng `np-art.js`):
  - Đầu, tóc, bóng bay, trứng, cá… đổ sáng/tối kiểu khối cầu; áo, tay chân, tên lửa, hộp quà kiểu khối trụ — ánh sáng
    từ trên-trái, cảnh nền có thêm vệt nắng. Gradient dùng chung gắn 1 lần vào trang (`#npShadeDefs`), không dùng filter
    → máy chiếu yếu vẫn mượt.
  - Gọi tên: phối cảnh xa–gần (bạn đứng xa nhỏ hơn) và bóng đổ mềm dưới chân; trò xếp làn (Đua, Tên lửa, Diều) giữ cỡ đều.
  - Tranh 6 trò thêm tách sang `js/name-picker/np-art-extra.js` (Đấu trường dùng chung sân bóng, thủ môn, quả bóng).
- **Đấu trường: chế độ mới "⚽ Sút luân lưu"** (Chơi một mình — chưa có ở phòng giáo viên):
  - Mỗi câu đúng = 1 quả penalty; trả lời càng nhanh càng dễ vào (50% sát giờ → 95% tức thì); đúng liền 3 câu =
    "cú sút sấm sét" chắc chắn vào; sai = mất lượt sút. Nhiều bàn nhất thắng (bằng bàn → ít cú sút hơn).
  - Sân khấu: khung thành có thủ môn nhún nhảy; mỗi cú sút của em và bạn máy diễn lần lượt — vào lưới, thủ môn cản phá,
    trúng cột, dội xà, vọt xà. Bảng xếp hạng hiện số cú sút và tỉ lệ vào; thẻ chọn chế độ có tranh bìa riêng.
  - Logic thuần `C.penaltyKick` / `C.kickOrder` + test trong `js/arena/__tests__/arena-core.test.js`.
  - 0 Firebase / Apps Script. Chỉ cần đẩy web.

- **Rà soát hạn mức Firebase + Apps Script** (sửa trước khi triển khai đợt này):
  - Quản lý lớp — ghi bù `schoolId`: máy Admin thứ hai trở đi dùng bản đệm delta (không thấy `schoolId` vừa ghi
    bù vì cố ý không đổi `updatedAt`) nên sẽ ghi lại **toàn bộ** ~2.800 học sinh (~2.800 lượt ghi mỗi máy).
    Nay máy nào thấy học sinh "thiếu" `schoolId` trong bản đệm thì đọc lại toàn bộ 1 lần (~2.800 lượt đọc)
    và chỉ ghi bản ghi thật sự thiếu.
  - Danh mục trường: Quản lý tài khoản không đọc lại cả collection `schools` mỗi lần tải danh sách trường —
    chỉ đọc khi roster có trường máy này chưa thấy.
  - Chấm lại trên máy chủ: bài có câu ngoài ngân hàng không còn làm Apps Script tải lại file khối (~1 MB,
    UrlFetch ~20.000 lượt/ngày) cho **mỗi** bài nộp — tối đa 1 lần/10 phút/file khối.
  - Đã rà: Apps Script xác thực nhớ 1 giờ; nhật ký gộp lặp; sảnh mã lớp nhớ trên máy + bản đệm 10 phút trên
    máy chủ; `firestore.rules` chỉ tốn 1 lượt đọc hồ sơ/request; trang Danh mục trường đọc vài chục lượt.
- **ic3-dashboard → tab Báo cáo có thẻ "Câu học sinh hay sai"** (như 2 dashboard kia, theo bộ lọc Lớp / Bài thi /
  Khoảng thời gian). Bấm "Phân tích" mới gọi Apps Script `wrongStats`; 0 lượt Firestore. CSS của thẻ tách ra
  `css/wrong-questions.css` dùng chung 3 trang. Chỉ cần đẩy web.
- **Bảng xếp hạng "Thử thách hôm nay" cho cả lớp** (0 Firebase, 0 Apps Script):
  - Học sinh đã chọn tên ở sảnh: "Chép kết quả" chép thêm dòng `Mã cho thầy cô: EQR1…` (cùng định dạng mã kết quả
    bài làm). Chỉ lượt đầu trong ngày (lượt tính điểm) có mã; mã cũng nằm trong danh sách kết quả đã lưu trên máy em.
  - Giáo viên bôi đen cả đoạn chat nhóm lớp → dán vào **Gom kết quả** → mục mới "Bảng xếp hạng Thử thách hôm nay":
    mỗi đề (số thử thách + cấp độ) 1 bảng, mỗi em giữ lượt cao nhất, bằng điểm thì ai nhanh hơn xếp trên; theo bộ
    lọc lớp; nút **Trình chiếu** toàn màn hình. Dán trùng không tính 2 lần (mã cố định theo ngày + cấp độ + học sinh).
  - Mã kết quả có thêm trường tuỳ chọn `pt` (điểm tốc độ). Mã cũ và mã bài làm thường không đổi.
  - Lưu ý như mọi mã kết quả: chỉ bắt lỗi chép, không chống tự dựng mã giả — đây là trò thi đua, không phải điểm thi.
  - Chỉ cần đẩy web.
- **Sảnh "Mã lớp" chịu được cả trường vào cùng lúc** (Apps Script `rosterByCode`, chế độ `class-code`):
  - Trước: bản đệm mỗi mã chỉ 10 phút; hết hạn thì MỖI lượt nhập mã mở file Sheet (~1–2 giây). Đầu giờ vài lớp cùng
    nhập mã có thể chiếm hết 30 lượt chạy song song của Apps Script → bài nộp của lớp khác bị từ chối đúng lúc đó.
  - Nay: "Cập nhật cho học sinh" nạp sẵn bản đệm mọi lớp (6 giờ — tối đa của CacheService); hết hạn thì 1 lượt đọc
    Sheet nạp lại cả bảng; mã gõ sai nhớ 10 phút (không mở Sheet lại). Test: 45 lượt nhập mã sau khi đẩy roster =
    0 lần mở Sheet; bản đệm hết hạn = 1 lần.
  - Triển khai cùng `apps/Code.gs` đợt 2026-11-03b (chưa dán thì chưa có tác dụng, không lỗi).
- **"Nhiệm vụ hôm nay" theo mùa thi** ở sảnh, ngay dưới đếm ngược (khi đã có ngày thi):
  - Còn hơn 14 ngày: bài nên làm tiếp trong Lộ trình của chính em + nhịp cần đạt (bài/tuần) để kịp nước rút; nhịp
    quá dày (> 5 bài/tuần) thì nhắc tăng tốc. 4–14 ngày: 1 bài Tổng hợp chế độ Kiểm tra mỗi ngày. 1–3 ngày: ôn Sổ tay
    câu sai. Ngày thi: không giao bài. Đạt cả lộ trình: Tổng hợp để giữ phong độ.
  - "Làm ngay" chọn sẵn bài (nước rút: bật luôn chế độ Kiểm tra), em tự bấm Bắt đầu. Làm xong hiện "đã xong".
  - Chỉ đọc lịch sử trên máy + danh mục đề đã tải — đã đo trên Chrome: 0 request Firebase / Apps Script.
    Chỉ cần đẩy web.
- **Dashboard giáo viên: 3 thẻ mới + nút nhắc bài** (theo đúng bộ lọc Trường / Lớp / Bài / Thời gian):
  - **Tiến bộ rõ / Đang sa sút:** so điểm TB các bài gần đây với các bài trước đó của từng em (từ 3 bài, chênh
    ≥ 10 điểm), vd "48% → 85% · +37". Bài bị cảnh báo sửa điểm không được tính.
  - **Bài nộp cần xem lại:** điểm gửi lên khác điểm máy chủ chấm (khi bật `serverGrading: 'verify'`), rời trang làm
    bài ≥ 3 lần, hoặc điểm ≥ 80% mà dưới 4 giây/câu. Ghi rõ lý do; chỉ là gợi ý để hỏi lại học sinh.
  - **"Chép danh sách"** ở thẻ Học sinh chưa làm bài: chép tên theo từng lớp (kèm tên bài nếu đang lọc) để dán
    nhắc trong nhóm lớp.
  - Tính trên bài nộp dashboard đã tải — 0 lượt đọc Firestore / Apps Script thêm, không đổi rules. Chỉ cần đẩy web.
  - **Bấm vào tên** ở mọi thẻ danh sách (chưa làm bài, cần hỗ trợ, xuất sắc, tiến bộ, sa sút, cần xem lại) → mở
    chi tiết lịch sử làm bài của em đó, như nút "Xem" ở bảng học sinh (dùng được bằng bàn phím: Tab + Enter).
    Chi phí như nút "Xem": chỉ khi bấm, bài của cả lớp tải 1 lần rồi nhớ lại cho các em cùng lớp.
- **Trang mới "Thi đua lớp học"** (`thi-dua.html` — sảnh → Dành cho thầy cô; nút cúp ở trang Gọi tên). Dùng trên máy
  chiếu trong giờ học, không cần đăng nhập:
  - **Bảng điểm:** mỗi lớp thầy cô dạy 1 bảng riêng. Bấm tên (hoặc Cả lớp / 1 tổ) rồi bấm tiêu chí thưởng / nhắc nhở;
    Hoàn tác (Ctrl+Z); "Ngôi sao tuần này" và hoạt động gần đây.
  - **Thi đua tổ:** xếp theo điểm TB mỗi em (tổ đông không tự thắng), cộng/trừ cả tổ.
  - **Đổi quà:** trừ vào điểm còn lại, KHÔNG trừ điểm thi đua (em vẫn giữ hạng); không đủ điểm thì báo rõ.
  - **Công cụ:** đo tiếng ồn bằng micro (chỉ đo âm lượng trên máy, không ghi âm; ẩn tab là tự tắt micro) với ngưỡng
    nhắc chỉnh được; đồng hồ đếm ngược (6 mốc nhanh, đếm 5 giây cuối, báo hết giờ). Nút toàn màn hình / phím F.
  - **Cài đặt:** thêm/xoá học sinh, đổi tổ, chia lại tổ, sửa tiêu chí và phần thưởng; xuất CSV; sao lưu / khôi phục
    mọi lớp (.json); bắt đầu đợt thi đua mới.
  - Danh sách học sinh: dán từ Excel/Word/Zalo (cùng bộ tách tên với Gọi tên) hoặc chọn lớp có sẵn.
  - Dữ liệu chỉ ở localStorage máy giáo viên (`eduquiz_thidua_v1`) — đã đo trên Chrome: 0 request Firebase /
    Apps Script, 0 request ra ngoài. Test: `js/thi-dua/__tests__/thi-dua-core.test.js`. Chỉ cần đẩy web.
  - Ý tưởng lấy từ app GVCN "Lớp học hạnh phúc"; viết lại theo cấu trúc dự án và cho giáo viên dạy nhiều lớp.
  - **Thẻ "Hoa điểm 10" — nối kết quả IC3 với điểm thi đua:** "Lấy từ trang Gom kết quả" đọc thẳng các mã kết quả
    giáo viên đã gom trên cùng trình duyệt (hoặc dán mã). Bài 100%: +3 điểm và lên bảng Hoa điểm 10; từ 90%: +2.
    - Xem trước trước khi cộng: số bài / điểm sẽ cộng, bài đã nhập, bài dưới mốc, tên không khớp bảng.
    - Chỉ nhận bài của **lớp ghi trong mã** (tự đoán theo tên bảng, đổi được) — 2 em trùng họ tên ở 2 lớp không bị
      cộng nhầm. Bỏ qua mã "Thử thách hôm nay".
    - Mỗi bài chỉ cộng 1 lần (nhớ mã bài, cả sau sao lưu/khôi phục và sau "Bắt đầu đợt thi đua mới").
    - Bảng vinh danh: số bài điểm 10 của từng em, bài gần nhất; trình chiếu toàn màn hình.
    - 0 Firebase / Apps Script (đã đo trên Chrome). Chỉ cần đẩy web.
  - **Lớp chủ nhiệm (GVCN) và lớp bộ môn (GVBM):** chọn loại lớp khi tạo bảng (đổi được ở Cài đặt; bảng cũ mặc định
    là lớp bộ môn, không mất dữ liệu).
    - Mỗi loại 1 bộ tiêu chí dùng chung: bộ môn = học tập trong giờ (như trước); chủ nhiệm = nề nếp (đi học muộn,
      đồng phục, bài tập về nhà, trực nhật, phong trào…). Sửa ở Cài đặt.
    - Lớp chủ nhiệm: **tổ trực nhật tuần này** trên Bảng điểm, tự xoay vòng mỗi thứ Hai; "Đổi tổ" để dời lượt.
  - **Thẻ "Sơ kết tuần"** (tuần này / tuần trước): tổ trong tuần, tuyên dương, cần nhắc nhở (bị trừ từ 2 điểm), ghi
    nhận nhiều nhất.
    - "Chép tin nhắn sơ kết cho lớp" — dán nhóm lớp; KHÔNG nêu tên em bị nhắc nhở (nhắc riêng).
    - Lớp chủ nhiệm: **tin nhắn riêng cho từng phụ huynh** nêu đúng việc được khen / cần nhắc trong tuần + điểm tích
      luỹ + chữ ký giáo viên; Chép từng em hoặc Chép tất cả.
    - Lớp bộ môn: **so sánh các lớp bộ môn** trong tuần (em được khen, điểm cộng/trừ, TB/em), không lẫn lớp chủ nhiệm.
  - Tạo lớp mới thì mở thẳng Bảng điểm.
- **File Excel từ Dashboard giáo viên và Dashboard Điều phối** có thêm 2 sheet (chỉ khi có dữ liệu):
  "Tiến bộ & sa sút" (điểm TB trước → gần đây, chênh lệch tô xanh/đỏ) và "Bài nộp cần xem lại" (giờ nộp, bài,
  điểm, lý do). Tính trên dữ liệu đã tải — 0 lượt đọc thêm.

- **Nhật ký thao tác Quản lý tài khoản** (audit log — kế hoạch 2.0 §VI.2):
  - Đổi vai trò (ghi cả vai trò cũ → mới), duyệt tài khoản, gán/đồng bộ "Trường được xem", gán lớp đang dạy,
    liên kết Mã NV, nhập giáo viên từ Excel (chỉ số lượng — không ghi email/CCCD/mật khẩu) → tab
    `NhatKyHoatDong` trên Google Sheet, hành động `update_user`, chi tiết ở cột ChiTiet (`userAction`).
  - Ai làm lấy từ tài khoản đã xác thực trên Apps Script, không tin tên web gửi lên. 0 lượt Firebase.
  - **Cần triển khai:** dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-03), rồi đẩy web.
    Thiếu bước Apps Script thì nhật ký `update_user` bị từ chối (thao tác tài khoản vẫn chạy bình thường).
- **Trang mới "Danh mục trường"** (`admin-schools.html`, menu Trang quản lý → Danh mục trường):
  - Admin: mọi trường, số học sinh đang học từng trường (từ bản đệm roster dùng chung), đổi trạng thái
    Đang hoạt động / Ngừng (chỉ đánh dấu, không xoá dữ liệu).
  - Quản trị trường: chỉ trường được gán; sửa địa chỉ, điện thoại, người liên hệ, ghi chú.
  - Không đổi tên trường ở đây — tên vẫn là khoá nối roster, Sheet kết quả và quyền.
  - Mọi lần sửa ghi nhật ký `update_school` (tab `NhatKyHoatDong`).
  - Rules: Quản trị trường sửa được trường của mình theo tên **hoặc** `schoolId`.
  - Triển khai cùng đợt trên (Apps Script 2026-11-03 + rules + web).
- **Dashboard Điều phối: thẻ "So sánh giữa các trường"** (kế hoạch 2.0 §VII.3):
  - Mỗi trường: số học sinh, số em đã làm bài, % tham gia, lượt nộp, điểm TB, tỷ lệ đạt (≥ 70%), sắp theo điểm TB.
  - Theo đúng bộ lọc đang chọn; chỉ hiện khi phạm vi xem có từ 2 trường (Admin, Điều phối nhiều trường).
  - Tên trường gõ lệch giữa danh sách và bài nộp vẫn gộp đúng 1 trường (theo `schoolId`).
  - File Excel xuất từ dashboard có thêm sheet "So sánh trường" (cùng điều kiện ≥ 2 trường, tô màu cột Điểm TB).
  - Tính trên dữ liệu dashboard đã tải — 0 lượt Firebase/Apps Script thêm. Chỉ cần đẩy web.
- **Kiểm thử phân quyền trên Firestore emulator** (kế hoạch 2.0 TEST-01/TEST-02): `tests/firestore-rules/`
  chạy `firestore.rules` thật — 23 tình huống: không truy cập chéo trường, không tự nâng quyền / tự gán
  trường, Quản trị trường, chuyển tiếp tên → `schoolId`, chỉ Admin sửa điểm, `schools`, `mos_submissions`,
  `questions`. CI: job **rules** (Node 24 + Java 21, project giả `demo-ic3` — không đụng Firebase thật).
  Chạy tay: `cd tests/firestore-rules && npm install && npm test` (cần Java 21).
- Quản lý tài khoản tự ghi bù `schoolIds` cho mọi tài khoản đã có "Trường được xem" (Điều phối/Quản trị
  trường gán trước 02/11/2026 chưa có) — chuẩn bị siết rules ghi roster theo `schoolId`.
- **Chế độ "Mã lớp" cho sảnh làm bài** (sẵn sàng, **mặc định TẮT** — chưa đổi gì với học sinh):
  - Vì sao: `data/roster/students-active.json` công khai tên 2.838 học sinh (audit §5.1).
  - Bật: `js/backend-config.js` → `roster: { mode: 'class-code' }`. Khi đó:
    - Quản lý lớp → "Cập nhật cho học sinh": KHÔNG đẩy tên lên file công khai; Apps Script cấp mỗi lớp 1 mã
      6 ký tự (giữ nguyên mã cũ khi đẩy lại), lưu tab `MaLop`, trang tải file `ma-lop-<ngày>.csv` để phát.
    - Sảnh: học sinh nhập mã lớp → thấy tên ĐÚNG lớp đó (Trường/Lớp tự điền). Máy nhớ lớp vừa mở (mở lại
      trang / mất mạng vẫn chọn được tên).
  - Quy trình đề xuất: (1) triển khai Apps Script 2026-11-03b; (2) bật `class-code`, bấm "Cập nhật cho học sinh",
    phát mã cho giáo viên; (3) khi các lớp đã quen, gỡ `data/roster/students-active.json` và dọn lịch sử git —
    bước này không hoàn tác được, làm khi đã chốt. "Gọi tên" khi đó dùng "Dán danh sách".
  - **Cần triển khai:** dán `apps/Code.gs` → New version (`BACKEND_VERSION` 2026-11-03b), rồi đẩy web.
- **Luật chấm điểm dùng chung web ↔ Apps Script** (bước 0 của chấm điểm phía máy chủ —
  `docs/architecture/SERVER-GRADING.md`):
  - Luật chấm 10 loại câu tách khỏi `js/quiz-engine.js` sang `js/core/grading.js` (quiz-engine gọi lại);
    bản Apps Script `apps/src/77-grading.gs` (chưa route nào dùng).
  - Kiểm chứng: so hàm chấm CŨ với bản mới trên 4.005 câu / 12.614 trường hợp (đúng, bỏ trống, sai lệch 1 chỗ)
    — kết quả + dữ liệu xem lại bài trùng khớp 100%; test CI so bản Apps Script với bản web trên cùng bộ đó
    và kiểm mọi câu trong ngân hàng được chấm đúng với chính đáp án của nó.
  - Học sinh không thấy khác biệt. Chỉ cần đẩy web (Apps Script đi cùng đợt 2026-11-03b).
- **Chấm lại bài Kiểm tra trên máy chủ** (bước 1, **mặc định TẮT**): `js/backend-config.js` →
  `serverGrading: { mode: 'verify' }`. Bài Kiểm tra (đề ngân hàng) gửi kèm câu trả lời; Apps Script chấm lại,
  ghi điểm máy chủ vào ChiTiet và gắn ⚠️ "Điểm gửi lên … khác điểm máy chủ chấm …" nếu học sinh sửa điểm.
  Lỗi tải đề không làm mất bài. Chi tiết + cách đọc cột: `docs/architecture/SERVER-GRADING.md` §5.
  Lưu ý: chặn được sửa điểm, CHƯA chặn được đọc đáp án (đề vẫn công khai) — đó là bước 2.
- An toàn khi cập nhật: nếu máy học sinh dùng trang HTML cũ trong bản lưu (Service Worker, mạng chậm) cùng
  `quiz-engine.js` mới, trang tự nạp bộ chấm `js/core/grading.js`; bấm Nộp bài lúc bộ chấm chưa tải xong thì
  bài KHÔNG bị khoá — báo "bấm Nộp bài lại sau vài giây". Dựng câu trả lời cho máy chủ lỗi → bài vẫn nộp.
  Test: `js/core/__tests__/grading-guard.test.js`.

## 01/11/2026

- **Giao diện làm bài mới cho học sinh cấp 1, 2** (`css/quiz-play.css`, chỉ áp dụng ở màn làm bài).
  - Thẻ viền đậm có bóng cứng, nền giấy kem chấm bi. Không dùng gradient hay hiệu ứng phát sáng.
  - Ô "Câu x/y" và thanh tiến độ sọc. Danh sách câu là thẻ nổi, câu đang làm có vòng xanh.
  - Đáp án là nút to, nhấn xuống khi bấm. Câu phân loại tô màu đầu từng nhóm. Nút "Câu tiếp" màu vàng.
  - Chế độ tối và giao diện điện thoại đều đã kiểm tra. Chế độ "Chữ to" vẫn giữ kiểu chọn đáp án riêng.
  - Câu "Bấm vào hình": ảnh rộng hết thẻ theo đúng tỉ lệ ảnh, không còn bị ép co theo chiều cao màn hình.
    Trước đây trên màn thấp ảnh chỉ còn vài chục px, học sinh phải phóng to mới bấm được.
    Ảnh minh hoạ của các câu khác cũng được hiển thị to hơn.
  - Thanh nút cố định ở đáy: Câu trước · Đánh dấu · Kiểm tra đáp án · Câu tiếp luôn ở cùng một chỗ, không bị cuộn mất.
    Kết quả kiểm tra hiện cuối thẻ, trang tự cuộn tới. Trên điện thoại, nút phụ chỉ còn biểu tượng.
  - Câu "Bấm vào hình" tự co ảnh vừa phần trống phía trên thanh nút: thấy trọn ảnh và các nút cùng lúc, không phải cuộn.
  - Responsive theo cả chiều cao: màn thấp (laptop 1366×768, máy chiếu) tự thu gọn phần đầu trang.
    Máy tính bảng dọc dùng dải số câu cuộn ngang như điện thoại. Điện thoại xoay ngang bỏ hàng tiến độ.
    Thanh nút tự gọn theo bề rộng thật của khu câu hỏi. Đã đo ở 11 cỡ màn hình, không tràn ngang.
  - Câu chọn điền có 2–5 lựa chọn ngắn (Có/Không, Đúng/Sai…) hiện thẳng các nút bấm, không còn dropdown che dòng bên dưới.
    Gần như toàn bộ 296 câu chọn điền thuộc dạng này. Câu có lựa chọn dài vẫn dùng dropdown, nhưng ô to và viền rõ hơn.
  - Câu nhiều dòng (Đúng/Sai, chọn từng dòng, chọn/kéo điền, nối, phân loại): thanh nút đáy báo "Còn N dòng chưa chọn".
    Bấm vào chip thì trang cuộn tới dòng còn thiếu và nháy viền dòng đó.
    Bấm "Câu tiếp" khi mới làm dở một câu thì có nhắc một lần; bấm lần nữa thì đi tiếp.
  - Nút trợ năng nằm trong hàng "Câu x/y" khi đang làm bài, không còn đè lên đáp án.
  - Vừa một khung hình, không phải cuộn: đáp án ngắn (≤ 70 ký tự) xếp 2 cột khi khu câu hỏi đủ rộng.
    Đáp án rất ngắn (vd Crop/Trim) giữ 2 cột cả trên điện thoại. Màn thấp ẩn nhãn "Một lựa chọn" để nhường chỗ.
    Đã đo: màn 1535×650, 1366×657, 1920×960, máy tính bảng và điện thoại dọc đều thấy đủ câu hỏi và 4 đáp án.
  - Chú thích "Đã làm / Đánh dấu / Chưa làm" có kèm số đếm, nằm dính ở đầu danh sách câu.
    Danh sách tự cuộn tới câu đang làm. Nút "Quay lại trang chọn bài" lên thanh trên cùng, thành nút "Chọn bài khác".
  - Câu Sắp xếp thứ tự: có tay nắm kéo-thả, dùng được cả chuột và cảm ứng. Mũi tên lên/xuống vẫn giữ, hàng gọn hơn.
    Câu 6 bước vừa một màn hình 1535×700. Gợi ý chung trong dữ liệu được thay bằng một câu ngắn khớp với nút trên màn hình.
  - Gọn chữ: dòng gợi ý thành dải mỏng. Bỏ dòng đếm "Đã điền 1/4" vì đã trùng với chip "Còn N dòng".
    Khu câu hỏi hẹp (điện thoại): đề bài dùng hết bề ngang, ô số và nhãn dạng câu nằm chung một hàng.
  - Bỏ nhãn dạng câu ("Nối cột", "Một lựa chọn"…) và mọi dòng gợi ý chữ trên tất cả dạng câu, để học sinh đỡ rối mắt.
    Chip ở thanh đáy thay cho các dòng đó, ví dụ "Chọn 2 đáp án", "Bấm 3 chỗ đúng trên hình", "Còn 4 mục chưa nối".
    Lúc mới vào câu chip màu trung tính, chỉ chuyển đỏ khi đã làm dở.
  - Giao diện tự chỉ cách làm: bấm chọn 1 thẻ hoặc 1 ô thì mọi chỗ còn trống để đặt vào sáng viền xanh nét đứt.
    Áp dụng cho phân loại, kéo điền, nối trên ảnh và nối 2 cột.
  - Nối 2 cột: ô phải đã nối có màu "đã nối" (trước đây trông như bị khoá), đường nối dày và rõ cả ở nền tối.
    Trên điện thoại, cột mô tả rộng hơn cột đáp án.
  - Không thêm lệnh Firebase/Apps Script nào. Chỉ thêm 1 file CSS (~33 KB, chưa nén), không thêm ảnh hay font.
- **Máy chủ trường bằng Docker** (`Dockerfile`, `docker-compose.yml`, `server/`). Hướng dẫn ở [docs/DOCKER.md](docs/DOCKER.md).
  - Một container phát cả dự án qua LAN. MOS chạy ở `/mos/`.
  - Bài nộp được ghi vào hàng đợi trên đĩa rồi gửi Apps Script theo lô.
  - Trên GitHub Pages trang vẫn chạy như cũ.
- Apps Script `2026-11-01` có thêm `submitBatch`: 1 lượt chạy ghi tới 100 bài.
  - Route này chỉ bật khi Script Properties có `RELAY_TOKEN`.
  - Triển khai: đặt `RELAY_TOKEN` → dán `apps/Code.gs` → New version → đặt `GAS_RELAY_TOKEN` trong `.env` của máy chủ.
  - Chưa làm các bước này thì máy chủ gửi từng bài.
- Tệp đề MOS Word (~21 MB trên git) và bài mẫu Word được đưa khỏi git, giống PowerPoint.
  - Từ nay các tệp này chỉ phát qua máy chủ trường.
  - Sinh lại bằng `mos/tools/build_catalog.py`.
  - Trên GitHub Pages, đề Word báo "tệp đề chưa có trên máy chủ này".
- Máy chủ trường **tự cập nhật trang từ GitHub** mỗi 10 phút (`server/sync.js`).
  - Chỉ tải tệp đã đổi. Không có commit mới thì không tốn hạn mức API.
  - Câu hỏi hoặc danh sách học sinh admin vừa đẩy lên GitHub có trên máy chủ trường mà không cần build lại.
  - Tắt bằng `SITE_SYNC_MIN=0`.
- `submitBatch` mở Sheet một lần cho cả lô, thay vì mở lại cho mỗi bài.
- **Nén ảnh trước khi đẩy lên GitHub** (`js/services/image-compress.js`, trang Quản lý ảnh).
  - Ảnh tải lên được thu cạnh dài về ≤ 1600 px và chuyển sang WebP trước khi nhúng hoặc đẩy.
  - Lý do: 92 MB trong ~142 MB lịch sử git là các bản ảnh cũ chưa nén, và lịch sử giữ mọi ảnh đã commit mãi mãi.
  - GIF, SVG, và ảnh nén không bớt được ≥ 10% thì giữ nguyên ảnh gốc.
- **77 ảnh PNG trong `img/` chuyển sang WebP** (9,2 MB → 3,0 MB) bằng `scripts/convert-images-webp.py`.
  - Đường dẫn trong 104 tệp (`data/ic3`, css, trang) đã được sửa theo.
  - Không phát sinh đường dẫn gãy mới. 77 ảnh đều mở được trên Chrome.
  - Giữ PNG cho: icon PWA, 2 ảnh trùng tên, và 26 ảnh nén bớt < 15%.
- `scripts/shrink-git-history.py` dọn bản cũ của ảnh/tệp đề khỏi lịch sử git trên một bản sao riêng.
  - Đo thử: 146 MB → 46 MB, bản mới nhất giữ nguyên.
  - Script không tự đẩy. Force-push do người quản lý repo tự chạy, rồi mọi máy clone lại.
- Có `/api/status` (hàng đợi + đồng bộ). Workflow `docker-publish.yml` đẩy ảnh lên GHCR để trường khác chỉ cần `docker compose pull`.

## 31/10/2026

- **Bộ "Theo chủ đề" đối chiếu với `IC3 Review_All.docx`** (cột "Bài" của từng câu → chủ đề theo PPCT 2026-2027):
  chuyển 117 câu về đúng chủ đề ở 6 cấp, ghi lý do + nguồn từng câu trong `data/ic3/topic-reassign.json`. Chỉ chuyển khi
  PPCT của Bài và đề chứa câu trong file Word cùng chỉ một chủ đề (hoặc giáo viên ghi rõ "CDn"). Không thêm/bỏ câu nào,
  bộ "Bài N" giữ nguyên, không trùng câu. Bộ Ôn tập/Kiểm tra sinh lại theo chủ đề mới.
- `scripts/build-allkey-map.py`: khi hoà điểm (đề bài chung "Em hãy di chuyển từng thuật ngữ...") ưu tiên câu trùng nhiều
  chữ hơn — sửa 11 câu All Key trước đây bị ghép nhầm sang câu khác (bộ Ôn tập lấy đúng câu hơn).

- **Sổ đầu bài** (`so-dau-bai.html`, chỉ giáo viên/admin; lối vào ở Trang quản lý và Điểm danh): ghi tiết dạy,
  học sinh vắng (P/K), nhận xét, thời khóa biểu, tiến độ PPCT, in/xuất Excel. Mục Học sinh có nút
  **"Lấy từ dữ liệu trường"**: lấy lớp + học sinh từ sổ lớp Điều phối đã đọc ở Điểm danh (có mã HS, ngày sinh,
  bỏ học sinh nghỉ luôn) hoặc danh sách học sinh của hệ thống — không phải nhập lại.
  Tiết đã ghi hôm nay có nút **Gọi tên**: mở Gọi tên đúng lớp, bỏ qua bạn vắng, câu hỏi theo bài vừa dạy.
- Dữ liệu sổ chỉ nằm trên máy (localStorage) + file sao lưu: **0 lượt Firebase, 0 lượt Apps Script**
  (ngoài lượt đọc hồ sơ đăng nhập đã lưu đệm như mọi trang giáo viên). Không cần deploy Apps Script/rules.
  Ai đã dùng bản Sổ đầu bài riêng trước đây: "Tải bản sao lưu" ở bản cũ → "Khôi phục từ bản sao lưu" ở trang mới.
- **Điểm danh 1 lần**: ghi tiết mới trong Sổ đầu bài tự điền học sinh vắng từ Điểm danh (cùng lớp, cùng ngày,
  tính cả điểm danh chưa ghi vào Sheet), có dòng ghi rõ lấy lúc nào; bấm tên để sửa.
- **Menu Trang quản lý** gom thành 3 nhóm: Đề & kết quả · Lớp học · Khác; tên mục ngắn lại.
- **Sổ đầu bài cùng giao diện web**: nút navy phẳng, sáng/tối dùng chung công tắc với các trang khác, có Đăng xuất.

## 30/10/2026

- **Đấu trường gọn còn 3 thẻ vai**: Học sinh · Giáo viên · Chơi một mình. "Chơi một mình" có công tắc
  **Hành trình IC3 | Đấu tự do**, nhớ lựa chọn lần trước (mặc định Hành trình). `?vai=minigame` / `?vai=solo` vẫn dùng được.
- **Học sinh**: thẻ vào phòng đặt trên cảnh lớp học vẽ tay (bỏ nền tím loang và các hình bay), viền mực cùng kiểu
  bản đồ; thêm nút "Chưa có mã phòng? Chơi Hành trình IC3 trong lúc chờ" (ẩn khi mở bằng link phòng).
- **Giáo viên**: thanh dính đáy tóm tắt phòng sắp tạo (bộ câu · chế độ · số câu · giây · sĩ số) + nút Tạo phòng,
  khỏi cuộn xuống cuối trang; ô "Dùng gần đây" (4 bộ câu đã tạo phòng/vào trận) để dạy nhiều lớp cùng bài;
  thẻ chế độ 4 cột, tranh thấp hơn. Cách tạo phòng không đổi (WebRTC, Firebase chỉ cho đường dự phòng như cũ).
- **Hành trình IC3** (Đấu trường, vai thứ 4 — `arena.html?vai=minigame`): ghép Chơi một mình và Mini-game
  thành 1 bản đồ 7 vùng theo 7 chủ đề IC3 + Trùm cuối. Mỗi vùng 1 trận quiz 10 câu đúng bộ "Theo chủ đề"
  (mỗi vùng 1 chế độ: Tốc độ, Đua về đích, Săn vàng, Câu cá, Kéo co, Đấu phép, Sinh tồn; Trùm cuối: Diệt Virus
  trộn 7 chủ đề); 5 mini-game nằm ở vùng cùng chủ đề. Sao 1–3 mỗi chặng (quiz theo tỉ lệ đúng, mini-game theo
  mốc thang đối thủ), rương vùng +20 xu / rương vàng +30 xu, 5 danh hiệu theo tổng sao, 3 nhiệm vụ mỗi ngày
  (+10 xu). Bản đồ riêng cho từng cấp Spark/IC3. Không khoá chặng; ảnh đại diện đứng ở chặng gợi ý.
  Mỗi vùng có cảnh nền riêng; màn kết thúc trận và bảng kết quả mini-game hiện sao bật lần lượt + "Về bản đồ".
  Chơi một mình có lối vào bản đồ. Logic: `js/arena/arena-quest-core.js` (có test), giao diện `js/arena/arena-quest.js`.
  0 lượt Firebase/Apps Script; lưu trong hồ sơ biệt danh trên máy.
- Bỏ phần không dùng: Thi thử MOS (Beta, mỗi môn 1 bài mẫu) cùng 4 thư mục engine, trò Phân loại thần tốc
  (đã gỡ khỏi menu), băng chuyền 3D cũ và ~380 dòng CSS của nó, 6 ảnh chủ đề không còn hiện, tài liệu LMAP cũ.
- Trang học sinh dễ đọc hơn (giữ kiểu phần mềm thi): chữ phụ tối thiểu ~14px, nhãn chữ thường thay chữ hoa nhỏ,
  đáp án A/B/C/D to rõ; sửa các chỗ tương phản thấp (dòng nhắc dưới nút Bắt đầu, nút Bắt đầu khi chưa đủ thông tin,
  nút Nộp bài, nhãn "Bài làm hợp lệ", số câu bỏ qua). Nút Đấu trường dùng icon, bỏ nhãn "Kahoot · Blooket";
  nút Thực hành MOS ghi tiếng Việt.
- Nộp bài trống (chưa trả lời câu nào) không còn được XP, huy hiệu và chuỗi ngày.
- Báo cáo kết quả: tài khoản Điều phối không còn bị Firestore từ chối khi báo cáo đọc từ Firestore.
- Lịch giảng dạy: giáo viên tự nhập lịch không còn hỏng cả lượt khi tuần đã được người khác tạo.
- Tài liệu: giữ Anonymous Auth bật; bỏ hướng dẫn App Check cũ.
- Mini-game chuyển vào Đấu trường (`arena.html?vai=minigame`): 5 chặng theo thứ tự học IC3,
  đối thủ máy theo hạng, xu thưởng (tối đa 120 xu/ngày). Bỏ Khu Vui Chơi và khoá 90% ở trang chủ.
- Dọn mã: bỏ emoji, nhãn nội bộ và ghi chú về quá trình làm trong chú thích; rút gọn chú thích
  `firestore.rules` và các trang HTML (luật, markup, code không đổi); trang quản trị thay emoji
  còn sót bằng icon. Nhật ký này rút gọn — bản chi tiết cũ xem lịch sử git.

## 29/10/2026

- Danh sách học sinh chỉ tải phần thay đổi (`updatedAt`), đọc lại toàn bộ 3 ngày/lần.
- Điểm danh: link sổ lớp lưu lên tài khoản (`teacher_sync/{uid}`); sửa lỗi có thể gửi bản trống đè link.
- Cài đặt hệ thống: sao lưu/khôi phục bộ đề, thông tin phiên bản; giáo viên cũng xem được.
- Báo cáo kết quả: bản đệm tách theo tài khoản (trước đó điều phối dùng chung máy có thể thấy bài trường khác).
- Màn làm bài: báo đúng câu còn trống/đánh dấu trước khi nộp; làm quá nhanh không tính XP.
- Bớt lượt Apps Script (chi tiết học sinh tải 1 lần cho cả lớp, nhật ký đăng nhập 6 giờ/lần).
- Icon và font tự lưu trong `lib/` (trang học sinh lần đầu 731 KB → 459 KB).
- Hồ sơ đăng nhập dùng chung giữa các tab trên máy cá nhân.
- Lưu mà không sửa gì: không ghi Firestore/Apps Script (danh sách lớp, tài khoản, lịch dạy, điểm danh).

## 28/10/2026

- Điểm danh & tiến độ đọc sổ lớp Google Sheet của Điều phối: nhiều trường, nhiều lớp, ghi thẳng vào Sheet,
  bảng công tháng, tin nhắn báo vắng; chia 4 thẻ.
- Gọi tên: "Bốc thử thách" theo bài hôm nay và khối lớp.
- Giao diện quản trị phẳng hơn, icon thay emoji.

## 26–27/10/2026

- Đấu trường: Phòng cả lớp kiểu gameshow, đường dự phòng qua Firestore cho học sinh khác mạng,
  giới hạn chỗ dự phòng theo phòng, "Đấu lại câu sai", câu sai vào Sổ tay ôn tập.
- Giáo viên tự nhập lịch của mình từ file Excel tổ.
- Apps Script bỏ khoá chung khi nộp bài (nhiều lớp nộp cùng lúc không xếp hàng); cảnh báo khi bản chạy thật cũ hơn web.
- Chống đốt hạn mức: cầu dao đọc 6.000 lượt/10 phút mỗi máy, siết rules, TTL cho `arena_relay`.
- Soạn đề theo nguồn (All Key / theo bài / ngoài All Key), báo câu trùng gần giống.
- Sửa: tự đăng xuất khi đang làm; "Tổng quan" lịch dạy hiện tiết cũ sau khi sửa.

## 23–25/10/2026

- Tài liệu năm học: xem slide bài giảng từ Google Drive.
- Ngân hàng câu hỏi đủ 830/830 câu All Key; tách 3 nhóm bộ câu (Bài học · Chủ đề · Ôn tập/Kiểm tra theo PPCT).
- Trình chỉnh vùng bấm (`hotspot-editor.html`) mở thẳng từ dự án.
- Gọi tên học sinh (`goi-ten.html`) với 11 trò có tranh minh hoạ.
- Đấu trường: 10 chế độ chơi một mình, 4 chế độ cả lớp, thẻ bài, Linh vật.
- Giao diện phẳng kiểu phần mềm thi; chế độ Chữ to cho tiểu học; Thử thách hôm nay.
- Soạn đề: hoàn tác, in nhiều mã đề, xuất Word, nhập từ Excel.
- Bản đệm danh sách học sinh dùng chung cho 4 trang quản lý.

## 10/2026 (trước 23/10)

- Bài nộp chỉ lưu Google Sheet; trang học sinh không dùng Firebase. Dashboard đọc kết quả từ Sheet.
- Backend gom về Apps Script + Firebase; mọi API Apps Script cần ID token (trừ nộp bài).
- Phòng thi P2P, cài như ứng dụng (PWA), trang gom kết quả chạy offline.
- "Câu cả lớp hay sai" tổng hợp trên Sheet.
- Đối chiếu ngân hàng câu hỏi với đáp án All Key; bộ "Theo chủ đề" bám PPCT.
- Lộ trình học thích ứng, giấy chứng nhận, thi đua lớp theo tuần, thẻ ghi nhớ.
- CI kiểm tra dữ liệu, cú pháp, unit test (`.github/workflows/ci.yml`).
- Rà soát bảo mật: đóng đọc công khai `questions`, bắt buộc `limit()` cho query danh sách, TTL bài nộp 45 ngày.

## Trước 10/2026

- Tổ chức lại thư mục (`js/`, `css/`, `data/ic3/` theo khối), tải câu hỏi theo khối.
- Câu nối cột bấm trực tiếp trên ảnh; ảnh câu hỏi nén nhẹ.
- Dashboard điều phối/giáo viên, quản lý danh sách học sinh, xuất Excel/PDF.
- Mô phỏng Word/Excel/PowerPoint, Thực hành MOS chấm trong trình duyệt.
