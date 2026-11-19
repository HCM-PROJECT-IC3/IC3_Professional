# Hướng dẫn sử dụng — EduQuiz IC3 + TechRealm 2.0

| Bạn là | Đọc |
|---|---|
| Học sinh | §1–§4 |
| Giáo viên | §5 và [HUONG_DAN_GIAO_VIEN.md](HUONG_DAN_GIAO_VIEN.md) (chi tiết) |
| Quản trị | §6 và [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) |

Trình duyệt hỗ trợ: Chrome, Edge (máy tính, điện thoại, máy tính bảng). Firefox và Safari dùng được nhưng chưa có kiểm thử tự động.

---

## 1. Học sinh: làm bài (EduQuiz)

1. Mở trang chủ, chọn **Chương trình → Cấp → Bài**. Nhập họ tên và lớp **đúng như danh sách lớp** (thầy cô dựa vào đó để tìm bài của em).
2. Chọn **Ôn luyện** (được xem giải thích) hoặc **Kiểm tra** (chấm khi nộp, thầy cô thấy kết quả).
3. Đang làm mà lỡ đóng trang: mở lại, máy hỏi có làm tiếp không (giữ tối đa 8 giờ).
4. **Mất mạng?** Cứ nộp. Bài được giữ trên máy và tự gửi khi có mạng lại.
5. Làm sai thì câu đó vào **Sổ tay câu sai** để ôn lại.

**Không cần tài khoản.** Tiến độ lưu trên máy em đang dùng. Đổi máy thì lịch sử ở TechRealm không đi theo (kết quả nộp bài vẫn có ở chỗ thầy cô).

## 2. Học sinh: EduQuiz 2.0 (`/app/`)

| Mục | Để làm gì |
|---|---|
| Lộ trình | Bài tiếp theo nên học, mục tiêu số bài mỗi tuần |
| Sổ tay câu sai | Ôn lại câu đã sai, đến hạn thì nhắc |
| Trò chơi | Các trò ôn tập |
| Thành tích | Huy hiệu, chuỗi ngày học |

## 3. Học sinh: TechRealm (`/app/#/the-gioi`)

Thế giới tu luyện: học để lên **cảnh giới** (Luyện Khí → Trúc Cơ → Kim Đan …).

| Nơi | Tên thường | Làm gì |
|---|---|---|
| Tàng Kinh Các | Khoá học | 12 lĩnh vực. Mỗi khoá là "công pháp" gồm nhiều bài + bài kiểm tra. Bài đạt từ 70 % thì mở bài sau. Bấm bài để làm ở sảnh |
| Luyện Công Đường | Luyện tập | Tiến độ và lịch sử, lọc Kiểm tra / Ôn luyện |
| Bí Cảnh | Thử thách | Bí cảnh 1 "Thành phố mất điện": lắp mạch, phân phối điện, đọc dữ liệu. 4 địa điểm, mỗi màn 1–3 sao |
| Vạn Tượng Giới | Khoa học & đời sống | Nhiệm vụ đời sống (Tính tiền điện, Phân loại rác) và **Thành phố thông minh**: xây công trình, theo dõi 6 chỉ số |
| Đấu Trường | Thi đấu | Thi cả lớp khi thầy cô mở phòng |
| Túi Càn Khôn, Thành tựu, Hồ sơ | | Vật phẩm, thành tích, nhân vật |
| **AI Sư Phụ** | Trợ lý học tập | §4 |

Lưu ý:
- "Tu vi" (EXP) hiện chỉ để em tự theo dõi trên máy. Phần thưởng chính thức (công huân) sẽ bật khi có **mã học tập**.
- Một số mục ghi "Sắp mở" hoặc "Đang thiết kế": chưa làm xong, chưa dùng được.

## 4. Học sinh: AI Sư Phụ

- **Hỏi kiến thức:** gõ câu hỏi về bài học.
- **Gợi ý bài tập:** dán câu hỏi luyện tập. Mở gợi ý **mức 1 → 2 → 3**. AI **không nói đáp án**.
- **Lập trình:** dán code và thông báo lỗi, AI chỉ chỗ sai.
- **Gợi ý nhiệm vụ:** việc nên làm tiếp. Tính trên máy, không dùng AI.

Quy tắc:
- **Đang làm bài Kiểm tra (chưa nộp), AI tự nghỉ.** Nộp bài xong mới hỏi được.
- Không gõ tên, số điện thoại, địa chỉ, mật khẩu. Máy cũng tự ẩn các thông tin này.
- Mỗi máy có 30 lượt/ngày.
- AI có thể sai. Thấy sai thì bấm **Báo câu trả lời có vấn đề**.

## 5. Giáo viên (tóm tắt)

- **Đăng nhập:** `login.html`. Tài khoản mới cần quản trị duyệt. Không thao tác 15 phút thì tự đăng xuất.
- **Lối vào chung:** TechRealm → menu trái → **Thầy cô: Tông môn**.
- **Lớp học của tôi** `/app/#/giao-vien`: kết quả cả lớp.
- **Năng lực học viên** `/app/#/giao-vien/nang-luc`: báo cáo từng em và cả lớp, CSV, in.
- **Quản lý công pháp:** gửi link khoá học cho lớp.
- **AI Sư Phụ → Thầy cô:** gợi ý chấm theo rubric (thầy cô quyết định điểm).

Chi tiết từng bước: [HUONG_DAN_GIAO_VIEN.md](HUONG_DAN_GIAO_VIEN.md).

## 6. Quản trị (tóm tắt)

- **Duyệt và phân quyền:** `admin-users.html`. **Tổng quan:** `/app/#/quan-tri`.
- **Vai trò:** quản trị, giáo viên (cần duyệt + gán trường), điều phối đào tạo, quản trị trường, điều phối giáo viên. Học sinh không có tài khoản.
- **AI:** key Gemini ở Script Properties `GEMINI_API_KEY`, trần ngày `AI_DAILY_MAX`, nhật ký tab `NhatKyAI`.
- **Triển khai và quay lui:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Câu hỏi thường gặp

- **Mất mạng?** Trang đã mở trước đó vẫn làm bài được. Bài nộp tự gửi khi có mạng.
- **Không thấy tiến độ cũ ở TechRealm?** Có thể em đang dùng máy khác hoặc trình duyệt ẩn danh.
- **Trang hiển thị lạ sau khi cập nhật?** Tải lại trang (Ctrl+F5). Trang tự cập nhật bản mới.
