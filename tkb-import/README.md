# File nhập TKB lớp — trích từ "LỊCH GIẢNG DẠY TEAM GVTH_NH 2026-2027.xlsx"

Trích xuất từ file **bạn vừa cập nhật lại** trong `On_Tap_MOS/` (đã đọc lại
bản mới nhất, không phải link SharePoint — link đó bị 403 vì cần đăng
nhập, nhưng bạn đã tải file về thư mục cũ nên tôi đọc thẳng từ đó).

Đúng định dạng 9 cột mà tab **"🗓️ TKB lớp" → "📥 Nhập từ Excel"** yêu cầu
(Mã GV, Tên GV, Trường, Thứ, Buổi, Tiết, Mã lớp, Giờ bắt đầu, Giờ kết thúc).

## File hiện có

| File | Tuần | Số dòng |
|---|---|---|
| `tkb-lop_2026-09-07.xlsx` | 7.9 - 12.9.2026 | 268 |

File mới bạn cập nhật có tổng cộng **8 tuần** (7.9 → 31.10.2026) và **18
giáo viên**, nhưng **chỉ tuần 7.9-12.9.2026 hiện đã có mã lớp** — 7 tuần
còn lại trong file gốc vẫn đang để trống (mọi buổi đều "Chọn loại hình
phụ trách", chưa điền gì), nên chưa có gì để tạo file nhập cho các tuần
đó. Khi bạn điền thêm tuần nào trong file gốc, báo tôi để trích lại.

## Đã TỰ SỬA 47 mã lớp bị gõ nhầm "." thay vì "/"

Phát hiện: mọi mã lớp khác trong file đều dạng "số/số" (vd `3/2`, `4/6`)
và được Excel lưu dạng **CHUỖI** (vì có dấu `/`). Riêng 47 ô sau được lưu
dạng **SỐ** — tức người nhập gõ **dấu chấm** thay vì **dấu gạch chéo** (vd
gõ `7.8` thay vì `7/8`), Excel hiểu nhầm thành số thập phân. Đã tự động
đổi lại `.` → `/` cho khớp quy ước chung (danh sách đầy đủ bên dưới) —
**bạn nên rà lại 1 lượt** trước khi nhập, đặc biệt 2 dòng đầu (GV
HCM0092) vì đây là nơi phát hiện ra vấn đề:

- **HCM0092 (Đinh Quang Minh Dũng)** — Thứ 5 Sáng tiết 1-2: `7/8`, tiết
  3-4: `7/3`; Thứ 5 Chiều tiết 1-2: `8/8`; Thứ 6 Chiều tiết 3: `7/1`.
- **HCM0280 (Hồ Thị Như Ý)** — 22 ô, rải khắp Thứ 2-6 (cả Sáng/Chiều),
  gồm cả `5/15` (Thứ 5 Chiều tiết 1-2) — mã lớp hơi khác thường (section
  15), tôi vẫn áp quy tắc chung nhưng bạn kiểm tra kỹ ô này giúp vì có vẻ
  không theo pattern các lớp khác.
- **HCM0334 (Nguyễn Hoài Linh)** — 12 ô, Thứ 2/5/6.

## Cách dùng

1. **Điều kiện cần trước**: 18 Mã GV + tuần "7.9-12.9.2026" phải đã có
   trong hệ thống — nếu chưa, vào tab "📅 Lịch tuần" → "📥 Nhập từ Excel" →
   nhập thẳng file gốc `LỊCH GIẢNG DẠY TEAM GVTH_NH 2026-2027.xlsx`
   trước (tự tạo Mã GV + Tên GV + tuần, đúng tên để đối chiếu ở bước sau —
   lưu ý tính năng này hiện chỉ đọc được các sheet đúng định dạng tuần cũ,
   sheet phụ `_HuongDan/_DanhSachTuan/...` trong file mới sẽ tự bị bỏ qua).
2. Vào tab **"🗓️ TKB lớp"**, chọn tuần **"7.9-12.9.2026"**.
3. Bấm **"📥 Nhập từ Excel"** → chọn `tkb-lop_2026-09-07.xlsx` → xem bảng
   kiểm duyệt (dòng hợp lệ/bỏ qua/cảnh báo) → bấm **"💾 Nhập dữ liệu"**.
