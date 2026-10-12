/* ============================================================
   js/backend-config.js
   NƠI DUY NHẤT quyết định "tác vụ nào ghi dữ liệu vào đâu" ở các trang
   học sinh (index.html, mos-practice.html). Đổi chế độ ở đây, KHÔNG sửa
   rải rác trong quiz-engine.js / firestore-results.js / googleSheet.js.

   Vì sao cần: gói Spark của Firebase chỉ cho 20.000 lượt ghi/ngày (ngân
   sách an toàn của dự án: 12.000). Mỗi bài nộp = 1 lượt ghi quiz_results →
   mùa ôn thi hàng chục/hàng trăm nghìn bài/ngày chắc chắn vượt trần, bất kể
   tối ưu đọc ở dashboard tốt đến đâu. Google Sheet (Apps Script, apps/Code.gs)
   không tính vào hạn mức Firebase nên gánh được lưu lượng lớn.
   Phân tích đầy đủ + bảng chọn chế độ: docs/architecture/SCALING-SPARK.md.

   Nạp TRƯỚC js/services/firebase-loader.js và js/services/result-submitter.js.
   ============================================================ */
(function (global) {
  'use strict';

  global.EduBackend = {
    // ── Bài nộp IC3/Spark ở index.html ──
    quizResults: {
      // Ghi Firestore (quiz_results — nguồn của các dashboard) cho bài nào:
      //   'all'       : mọi bài (như trước đây). An toàn tới ~10.000 bài/ngày.
      //   'test-only' : chỉ bài chế độ "Kiểm tra"; bài "Ôn luyện" chỉ lên Google
      //                 Sheet. Dùng khi phần lớn lưu lượng là ôn luyện.
      //   'off'       : không ghi Firestore; mọi bài chỉ lên Google Sheet. Dùng cho
      //                 ngày cao điểm hàng chục nghìn bài trở lên — dashboard giáo
      //                 viên không có bài mới, xem kết quả ở Google Sheet.
      firestore: 'all',
      // Gửi kèm lên Google Sheet (bản lưu lâu dài, không tốn hạn mức Firebase).
      // Khi firestore khác 'all', Sheet là nơi DUY NHẤT giữ bài không lên Firestore.
      sheet: true,
      // Rải ngẫu nhiên 0..N ms trước khi gửi Sheet: cả lớp bấm "Nộp" cùng giây
      // sẽ không dồn vào Apps Script cùng lúc (Apps Script chỉ chạy song song 30
      // lượt/tài khoản — vượt thì bị từ chối, hàng đợi gửi lại lo phần còn lại).
      sheetJitterMs: 4000,
      // Chia Google Sheet theo trường: mỗi trường (hoặc cụm trường) 1 Apps Script +
      // 1 file Sheet riêng, deploy từ TÀI KHOẢN GOOGLE RIÊNG (giới hạn 30 lượt chạy
      // song song tính theo tài khoản chủ script). Khoá = đúng tên trường học sinh
      // chọn ở lobby (data/roster/students-active.json). Trường không có trong danh
      // sách → APPS_SCRIPT_URL mặc định trong js/googleSheet.js.
      // Ví dụ: sheetEndpoints: { 'THCS Nguyễn Du': 'https://script.google.com/macros/s/XXX/exec' }
      sheetEndpoints: {},
    },

    // ── Firebase SDK trên trang học sinh ──
    // Trang học sinh KHÔNG nạp Firebase lúc mở trang nữa: chỉ nạp khi thật sự cần
    // ghi Firestore (lúc nộp bài theo chế độ ở trên) hoặc máy này đang có sẵn phiên
    // đăng nhập giáo viên/admin. Tiết kiệm ~300 KB tải trang/học sinh và — quan trọng
    // hơn — lượt xác minh reCAPTCHA của App Check (gói miễn phí: 10.000 lượt/THÁNG,
    // vượt là reCAPTCHA trả lỗi nếu chưa bật thanh toán).
    firebaseSdk: {
      version: '10.13.0',
      // false = không nạp App Check trên trang học sinh. Chỉ đặt false khi App Check
      // CHƯA Enforce cho Firestore (Enforce rồi mà không có token thì bị từ chối ghi).
      appCheck: true,
    },
  };
})(window);
