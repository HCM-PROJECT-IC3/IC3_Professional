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
};
