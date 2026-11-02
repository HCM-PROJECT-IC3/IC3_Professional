/* Cấu hình trang Ôn luyện MOS. Sửa ở đây, không cần sửa mã khác. */
window.MosConfig = {
  // Apps Script đang chạy cho EduQuiz (route công khai mosSubmit → tab NhatKyMOS).
  // Để trống '' nếu không muốn gửi kết quả đi đâu — lịch sử vẫn lưu trên máy.
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyxiqIjwDotYLobFSf11RvosrW9FksEHCQEz8lNm2uU8_8QQJtw9eDM5gBsW_Ga4JLa/exec',
  // Luyện tập chỉ lưu trên máy (không tốn lượt Apps Script); thi thử luôn gửi để giáo viên xem.
  sendPractice: false,
  examMinutes: 50,
  passScore: 700,
  // Trường mặc định điền sẵn ở ô "Trường" (học sinh vẫn sửa được).
  defaultSchool: '',
  // Tệp đề lấy từ Google Drive (data/drive.json — chạy tools/build-drive-map.js khi đổi tệp trên Drive).
  // Không có khoá: học sinh bấm link tải đề từ Drive rồi chọn tệp vừa tải để chấm.
  // Có khoá Google Drive API (Google Cloud → bật "Google Drive API" → tạo API key, giới hạn theo tên miền trang):
  // trang tự tải đề, tự lưu và tách đề Word nằm trong bài giảng — như khi chạy trên máy chủ trường.
  driveApiKey: 'AIzaSyB4Lb1BqL4loubx3oR7j68n0VCP3dWAVZs',
};
