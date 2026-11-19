# Hướng dẫn sử dụng TechRealm cho giáo viên

Tài liệu này dành cho thầy cô dạy Tin học. Không cần biết lập trình.

**Lối vào chung:** mở `…/app/#/the-gioi/tong-mon` (menu bên trái → **Thầy cô: Tông môn**). Trang này liệt kê mọi việc quản lý lớp, việc nào đã dùng được, việc nào làm ở giai đoạn sau.

> Học sinh **không cần tài khoản**. Tiến độ của em lưu trên máy em dùng. Kết quả bài làm gửi về Google Sheet của trường như trước.

---

## 1. Chuẩn bị lớp

1. **Danh sách lớp:** Tông môn → *Quản lý lớp và học viên* (`roster-manager.html`). Nhập hoặc dán danh sách, sửa tên trùng.
2. **Đăng nhập tài khoản giáo viên** ở `login.html` khi cần xem kết quả. Tài khoản mới phải được quản trị duyệt.

## 2. Giao bài cho lớp (Quản lý công pháp)

1. Menu trái → **Thầy cô: Quản lý công pháp**.
2. Chọn khoá (VD: IC3 cấp 1), cách mở bài (**Tuần tự** hoặc **Tự do**), ngưỡng đạt (mặc định 70 %).
3. Bấm **Tạo link**, rồi gửi link qua Zalo/Classroom. Học sinh mở link là thấy lộ trình của lớp.
4. Cấu hình nằm trong link, không lưu trên máy chủ. Muốn đổi thì tạo link mới.

## 3. Theo dõi tiến độ

- **Kết quả bài làm:** `…/app/#/giao-vien`. Lọc theo trường, lớp, bài.
- Lần mở đầu trong ngày, trang hỏi trước khi tải toàn bộ kết quả (để tiết kiệm lượt đọc). Những lần sau dùng bản đã lưu, bấm **Làm mới** khi cần số mới.

## 4. Báo cáo năng lực học viên và báo cáo lớp

Mở `…/app/#/giao-vien/nang-luc` hoặc nút **Năng lực học viên** ở trang giáo viên.

| Phần | Ý nghĩa |
|---|---|
| Thẻ tổng | Số học sinh, số đã nộp bài, số hoạt động 7 ngày qua, số **cần chú ý** |
| Bảng học sinh | Điểm trung bình, tỷ lệ hoàn thành khoá, bài kiểm tra, lần làm gần nhất |
| **Cần chú ý** | Học sinh có ít nhất một dấu hiệu: điểm TB dưới 50, 14 ngày trở lên chưa làm bài, bài kiểm tra chưa đạt, hoặc chưa nộp bài nào |
| Chi tiết 1 học sinh | Bấm tên: tiến độ từng khoá, **lỗ hổng** (bài bị bỏ qua giữa chừng), kết quả kiểm tra, năng lực theo lĩnh vực và chủ đề IC3, bài nên làm tiếp, lịch sử |
| Bài khó nhất lớp | Bài có điểm TB thấp nhất (chỉ tính bài có từ 3 học sinh làm) → nên giảng lại |
| Xuất | **CSV** (mở bằng Excel, đủ dấu tiếng Việt) hoặc **In** |

Lưu ý:
- Báo cáo chỉ nhận bài làm từ đề có sẵn của sảnh. Đề tự soạn vẫn có trong trang kết quả nhưng không xếp vào khoá.
- Cảnh giới, EXP và sản phẩm hiện ghi "Chưa bật". Các mục này cần **mã học tập** (giai đoạn 4).

## 5. AI Sư Phụ

Menu trái → **AI Sư Phụ**.

**Cho học sinh** (thầy cô nên giới thiệu ở buổi đầu):
- *Hỏi kiến thức*: giải thích ngắn, có ví dụ.
- *Gợi ý bài tập*: 3 mức gợi ý, **không nói đáp án**.
- *Lập trình*: dán code và lỗi, AI chỉ chỗ sai và gợi ý sửa.
- *Gợi ý nhiệm vụ*: việc nên làm tiếp. Tính ngay trên máy, không dùng AI.
- **Khi học sinh đang làm bài Kiểm tra** (chưa nộp), AI tự nghỉ trên máy đó. Bài Ôn luyện thì vẫn hỏi được.

**Cho thầy cô** (thẻ *Thầy cô*):
- **Chấm theo rubric:** dán mô tả sản phẩm, ghi tiêu chí theo dạng `tên tiêu chí | điểm tối đa`. AI đề xuất điểm và nhận xét. **Thầy cô xem lại và quyết định điểm.** Cần đăng nhập tài khoản giáo viên.
- **Tạo câu hỏi bằng AI:** ở Soạn đề (`ic3-dashboard.html`).

**Giới hạn:** 30 lượt/máy học sinh/ngày, 150 lượt/tài khoản giáo viên/ngày, 800 lượt/trường/ngày. Câu hỏi đã hỏi rồi thì trả lời lại ngay, không tính lượt.

**Dữ liệu:**
- Không nhập tên, số điện thoại hay địa chỉ học sinh. Máy tự ẩn các thông tin này trước khi gửi.
- Khi AI trả lời sai, bấm **Báo câu trả lời có vấn đề**. Quản trị xem báo cáo ở tab `NhatKyAI` của sheet nhật ký.
- Nhật ký chỉ ghi thời điểm và loại việc, không ghi nội dung hỏi đáp.

## 6. Thi đấu cả lớp và bí cảnh

- **Phòng thi đấu cả lớp:** Tông môn → *Tạo bí cảnh / thi cả lớp* (`arena.html`).
- **Bí cảnh 1 "Thành phố mất điện"** (`/the-gioi/bi-canh`): học sinh tự chơi. Điểm do máy chủ chấm lại được từ nhật ký thao tác.

## 7. Việc chưa có (giai đoạn sau)

| Việc | Cần gì |
|---|---|
| Chấm sản phẩm, xác nhận hoàn thành | Mã học tập (GĐ4) + Bách Công Phường (GĐ7) |
| Thưởng / thu hồi công huân, vật phẩm | Mã học tập (GĐ4). Máy chủ đã có sổ cái, đang tắt (`TR_REWARDS`) |
| Trình tạo bí cảnh riêng | Sau khi nghiệm thu bí cảnh mẫu |

## 8. Dành cho quản trị

- **Phân quyền:** `admin-users.html`. **Tổng quan:** `…/app/#/quan-tri`.
- **Key AI của trường:** Apps Script → Project Settings → Script Properties → `GEMINI_API_KEY`. Đổi trần ngày: `AI_DAILY_MAX`.
- **Nhật ký AI:** tab `NhatKyAI` (cột: Thời gian, Loại [`ok` / `dung-dem` / `loi:…` / `bao-loi:<lý do>`; dòng báo lỗi có thêm ghi chú của người báo, đã lọc thông tin cá nhân], Việc, Người dùng [mã băm], số ký tự).

## Câu hỏi thường gặp

- **Học sinh đổi máy thì mất tiến độ trên TechRealm?** Đúng, cho tới GĐ4 (mã học tập). Kết quả bài làm vẫn có trên Sheet và trong báo cáo năng lực.
- **AI báo "hết lượt"?** Học sinh đã dùng hết 30 lượt trên máy đó hôm nay, hoặc trường đã chạm trần 800 lượt. Mai thử lại, hoặc quản trị tăng `AI_DAILY_MAX`.
- **Báo cáo không thấy học sinh A?** Kiểm tra tên/lớp ở danh sách lớp có khớp với tên em nhập khi làm bài không.
