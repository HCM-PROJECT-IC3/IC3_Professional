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
    // URL Apps Script mặc định (apps/Code.gs): nhận bài nộp + trả kết quả cho dashboard.
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyxiqIjwDotYLobFSf11RvosrW9FksEHCQEz8lNm2uU8_8QQJtw9eDM5gBsW_Ga4JLa/exec',

    // ── Dashboard đọc kết quả từ đâu (teacher / coordinator / ic3-dashboard Báo cáo) ──
    //   'auto'      : Firestore khi quizResults.firestore = 'all', ngược lại Google Sheet
    //                 (Sheet luôn có ĐỦ mọi bài, Firestore thì không).
    //   'sheet'     : luôn đọc Sheet qua Apps Script — 0 lượt đọc Firebase cho kết quả
    //                 (chỉ 1 lượt đọc hồ sơ/giờ/người để xác thực, trong Apps Script).
    //   'firestore' : luôn đọc Firestore quiz_results (như trước).
    dashboard: {
      readFrom: 'auto',
    },

    // ── Bài nộp IC3/Spark ở index.html ──
    quizResults: {
      // Ghi Firestore (quiz_results — nguồn của các dashboard) cho bài nào:
      //   'all'       : mọi bài (như trước đây). An toàn tới ~10.000 bài/ngày.
      //   'test-only' : chỉ bài chế độ "Kiểm tra"; bài "Ôn luyện" chỉ lên Google
      //                 Sheet. Dùng khi phần lớn lưu lượng là ôn luyện.
      //   'off'       : không ghi Firestore; mọi bài chỉ lên Google Sheet (MẶC ĐỊNH từ
      //                 15/10/2026). Dashboard (readFrom 'auto') tự đọc Sheet qua Apps
      //                 Script — Sheet có cột P ChiTiet nên đủ mọi trường như quiz_results
      //                 (sai/bỏ qua, bài, hết giờ, vi phạm). Học sinh mở trang và nộp bài
      //                 KHÔNG nạp Firebase → 0 lượt ghi, 0 lượt reCAPTCHA (App Check).
      //                 Apps Script bản cũ chưa có listResults → dashboard tự đọc Firestore.
      // Đổi về 'all' chỉ khi muốn dashboard đọc Firestore (≤ ~9.000 bài/ngày).
      firestore: 'off',
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

    // ── Kết quả MOS Practice (mos-practice.html) ──
    // Không trang nào đọc lại mos_submissions trên Firestore → mặc định chỉ ghi Google
    // Sheet (tab NhatKyMOS, giáo viên mở Sheet là xem được), 0 lượt ghi Firebase.
    mosResults: {
      firestore: false,
      sheet: true,
    },

    // ── Nhật ký hoạt động của tài khoản quản trị (đăng nhập, xem chi tiết HS, sửa roster...) ──
    //   'sheet' : ghi tab NhatKyHoatDong qua Apps Script (0 lượt Firebase)
    //   'off'   : không ghi
    // Thao tác nhạy cảm (đẩy câu hỏi/roster lên GitHub, xoá bài nộp) Apps Script luôn tự ghi.
    activityLog: 'sheet',

    // ── Phòng cả lớp của Đấu trường (arena.html, js/arena/arena-room.js) ──
    // Chạy ngang hàng (WebRTC): máy giáo viên làm máy chủ, học sinh nối thẳng vào → 0 lượt
    // Firebase. Máy chủ "bắt tay" mặc định là 0.peerjs.com (miễn phí, chỉ giúp 2 máy tìm
    // nhau, không thấy câu hỏi/điểm). Nếu mạng trường chặn hoặc muốn tự chủ: tự chạy
    // PeerServer (npx peer --port 9000) rồi khai báo ở đây, vd:
    //   peer: { host: 'peer.truong.edu.vn', port: 443, path: '/', secure: true }
    // Thêm máy TURN riêng (mạng chặn kết nối trực tiếp): peer: { config: { iceServers: [...] } }
    //
    // Mạng trường chặn WebRTC trực tiếp? PeerJS đã kèm sẵn TURN miễn phí; muốn thêm TURN riêng
    // (ổn định hơn cho lớp đông) khai ở `turn` — danh sách được GỘP với máy chủ mặc định, không
    // thay thế. Ví dụ:
    //   turn: [{ urls: 'turn:turn.truong.edu.vn:3478', username: 'user', credential: 'pass' }]
    arenaRoom: {
      peer: {},
      turn: [],
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
