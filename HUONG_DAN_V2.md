# Cập nhật: thay Apps Script cũ (chỉ phần log nộp bài) — HUONG_DAN_V2.md

Phạm vi lần này (đã xác nhận): **KHÔNG đụng vào 3 dashboard** (Coordinator/Teacher/Admin) —
chúng vẫn đọc Firestore như cũ, đang chạy tốt. Chỉ thay Apps Script cũ mà
`js/googleSheet.js` gọi mỗi khi học sinh nộp bài (log đối chiếu/dự phòng).

## Đã sửa trong project

1. **`apps/Code.gs`**
   - Thêm tab mới `NhatKyNopBai` (log nộp bài) — tách biệt hoàn toàn với
     `HocSinh`/`KetQua`/`TongHop` đã có, không ảnh hưởng các action khác.
   - Thêm `action: 'submitExam'` trong `doPost` + hàm `writeSubmissionLog_()`
     — có chống ghi trùng bằng `submissionId` + `LockService`.

2. **`js/googleSheet.js`**
   - Đổi `APPS_SCRIPT_URL` sang URL Apps Script mới bạn đã deploy:
     `https://script.google.com/macros/s/AKfycbwfxLY8H1SpkbfvW12w5kbrIKUCBZfQu-6cvGZhLJW6MF_RkwUWbhsRhSCfo97B5VpH/exec`
   - Bọc payload thành `{ action: 'submitExam', payload: {...} }` để khớp
     router trong `Code.gs` mới.
   - Đổi từ `mode: 'no-cors'` (gửi mù, không biết thành/bại) sang gửi có thể
     đọc response thật — sẽ biết chính xác ghi thành công, lỗi, hay trùng.

## Bạn cần làm 2 việc trên Google

### 1) Thêm tab `NhatKyNopBai` vào Sheet
Mở Sheet: https://docs.google.com/spreadsheets/d/16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck/edit

Tạo 1 tab mới, đặt tên **chính xác**: `NhatKyNopBai`

Dòng 1 (tiêu đề) — gõ đúng theo thứ tự:
```
SubmissionId | HoTen | Lop | Truong | BaiThi | Diem | SoCauDung | ThoiGianLam | SoLanChuyenTab | SoLanClick | TrangThai | ThoiGianNop | GhiChu
```
(Code ghi theo **thứ tự cột**, không dựa vào tên header cho tab này — nhưng vẫn nên đặt đúng tên để dễ đọc.)

### 2) Deploy lại Apps Script với code mới
Vì `apps/Code.gs` đã đổi nội dung, bạn cần cập nhật deployment hiện có (KHÔNG
tạo deployment mới, để giữ nguyên URL `.../exec` đang dùng):

1. Mở lại project Apps Script (project đã deploy sẵn tại URL trên).
2. Dán đè toàn bộ nội dung `apps/Code.gs` mới vào.
3. **Deploy → Manage deployments** → bấm ✏️ (sửa) ở deployment hiện tại →
   **Version: New version** → **Deploy**.
   *(Nếu tạo "New deployment" thay vì sửa cái cũ, URL sẽ đổi và bạn phải
   cập nhật lại `APPS_SCRIPT_URL` trong `js/googleSheet.js`.)*

## Test nhanh

1. Vào 1 trang làm bài, làm và nộp thử 1 bài.
2. Mở Console (F12) — phải thấy log `✅ [GoogleSheet] Đã lưu: {written: true, duplicate: false}`.
3. Mở tab `NhatKyNopBai` trên Sheet — phải thấy 1 dòng mới.
4. Nộp lại bài y hệt (nếu code cho phép) → phải thấy log `duplicate: true`, KHÔNG có dòng mới trong Sheet (chống trùng qua submissionId hoạt động).

## Không đổi gì khác
- 3 dashboard Coordinator/Teacher/Admin: giữ nguyên, vẫn đọc Firestore qua `EduRepositories`.
- `js/dashboard-api.js` và các action `getRoster`/`getScores`/`getDashboard`/`writeReport`
  trong `Code.gs`: vẫn còn trong code nhưng CHƯA được gắn vào trang nào — để dành nếu sau
  này bạn muốn dùng, không ảnh hưởng gì hiện tại.
