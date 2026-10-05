/* ============================================================
   js/firebase-config.js
   Khởi tạo Firebase dùng chung cho toàn bộ dự án EduQuiz.
   Nạp file này SAU các thẻ <script> của Firebase Compat SDK và
   TRƯỚC js/auth.js / js/auth-guard.js / các script khác cần dùng
   firebase.auth() hoặc firebase.firestore().

   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check-compat.js"></script>
   <script src="js/firebase-config.js"></script>

   ⚠️ APP CHECK — CẦN 1 BƯỚC THỦ CÔNG TRƯỚC KHI CHẠY THẬT:
   1. Firebase Console → App Check → Apps → chọn app Web "data-ic3" →
      Register → chọn provider "Fraud Defense" (= reCAPTCHA Enterprise,
      Firebase KHÔNG còn cho đăng ký reCAPTCHA v3 Classic nữa) → tạo
      site key SCORE-BASED tại console.cloud.google.com/security/recaptcha
      (KHÁC trang recaptcha/admin cũ — trang đó chỉ tạo được key Classic,
      không dùng được với App Check) → domain = domain thật đang deploy
      (vd. hcm-project-ic3.github.io) + "localhost" để test.
   2. Dán site key vào APP_CHECK_SITE_KEY bên dưới. KHÔNG cần thêm thẻ
      <script src=".../recaptcha/enterprise.js?render=..."> hay gọi
      grecaptcha.execute() thủ công như trang tạo key gợi ý — App Check
      SDK (firebase-app-check-compat.js) tự làm việc đó khi activate().
   3. Test xong, quay lại Console → App Check → từng API (Firestore/
      Storage) → "Enforce" để CHẶN THẬT request không có token hợp lệ
      (trước khi bấm Enforce, mọi thứ vẫn chạy bình thường dù đã có
      site key — App Check chỉ ở chế độ "theo dõi").
   4. Khi code chạy ở localhost (không phải domain đã đăng ký site key),
      mở Console log sẽ có 1 dòng debug token — vào App Check → ⋮ →
      "Manage debug tokens" để thêm token đó, tránh bị chặn lúc dev.
   ============================================================ */
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyCff1nnmUBKONN8JnzoWuitvIi3ewM1oi4",
    authDomain: "data-ic3.firebaseapp.com",
    databaseURL: "https://data-ic3-default-rtdb.firebaseio.com",
    projectId: "data-ic3",
    storageBucket: "data-ic3.firebasestorage.app",
    messagingSenderId: "1087430420781",
    appId: "1:1087430420781:web:d126581d25aaf6d853cba4",
    measurementId: "G-2EMBPZXCX1"
  };

  // Site key reCAPTCHA Enterprise / "Fraud Defense" (App Check) — tạo tại
  // console.cloud.google.com/security/recaptcha, loại "Score-based",
  // domain hcm-project-ic3.github.io + localhost. Đây là giá trị PUBLIC,
  // an toàn khi để trong code client (giống apiKey ở trên).
  const APP_CHECK_SITE_KEY = '6LeWKNMtAAAAAMKNtDet4TgNR-yqDS-hncys8r5W';

  if (!window.firebase) {
    console.error('[EduQuiz] Firebase SDK chưa được nạp trước firebase-config.js');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  // App Check PHẢI được activate TRƯỚC lần gọi firestore()/auth() đầu
  // tiên để mọi request sau đó đều tự động đính kèm token — nên đặt
  // ngay sau initializeApp(), trước đoạn cấu hình cache Firestore bên dưới.
  // Bọc try/catch: đây là lớp bảo vệ THÊM, lỗi ở đây (vd. SDK app-check
  // chưa nạp, hoặc site key sai) không được phép làm hỏng toàn bộ app.
  try {
    if (APP_CHECK_SITE_KEY && firebase.appCheck) {
      // Dùng ReCaptchaEnterpriseProvider (khớp provider "Fraud Defense" đã
      // đăng ký ở Firebase Console) — KHÔNG truyền thẳng site key dạng
      // string vào activate() như reCAPTCHA v3 Classic cũ, vì Firebase đã
      // ngừng hỗ trợ đăng ký Classic mới (xem hướng dẫn đầu file).
      const provider = new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY);
      firebase.appCheck().activate(provider, /* isTokenAutoRefreshEnabled */ true);
    } else if (!APP_CHECK_SITE_KEY) {
      console.warn('[EduQuiz] App Check chưa cấu hình site key — bỏ qua (xem hướng dẫn đầu file firebase-config.js).');
    }
  } catch (e) {
    console.warn('[EduQuiz] Không khởi tạo được App Check (không chặn app chạy tiếp):', e);
  }

  // Bật cache offline (không bắt buộc, giúp trang mượt hơn khi mạng chập chờn).
  // enablePersistence({synchronizeTabs:true}) (= enableMultiTabIndexedDbPersistence
  // bên dưới) đã bị SDK 10.13 đánh dấu deprecated — chuyển sang cấu hình cache
  // mới qua settings({ localCache: persistentLocalCache(...) }) theo hướng dẫn
  // migrate chính thức của Firebase. Phải gọi settings() TRƯỚC lần dùng
  // firestore() đầu tiên nên đặt ngay tại đây, trước khi build EduFirebase.db.
  try {
    if (firebase.firestore && firebase.firestore.persistentLocalCache) {
      firebase.firestore().settings({
        localCache: firebase.firestore.persistentLocalCache({
          tabManager: firebase.firestore.persistentMultipleTabManager()
        })
      });
    } else {
      // SDK cũ hơn không có API cache mới — dùng lại cách cũ để không mất tính năng.
      firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }
  } catch (e) { /* cache offline là tính năng "nice-to-have", lỗi ở đây không được làm hỏng app */ }

  // SDK compat 10.13 chưa có API cache mới nên vẫn dùng enablePersistence() ở trên và
  // in cảnh báo "will be deprecated" (vô hại) — chỉ giữ log mức lỗi cho sạch console.
  try { firebase.firestore.setLogLevel('error'); } catch (e) { /* bỏ qua */ }

  // firebase.auth() chỉ tồn tại nếu trang có nạp firebase-auth-compat.js.
  // index.html (trang học sinh làm bài) không yêu cầu đăng nhập nên có thể
  // không nạp Auth SDK — tránh throw lỗi làm hỏng cả Firestore.
  let authInstance = null;
  try {
    if (firebase.auth) authInstance = firebase.auth();
  } catch (e) {
    console.warn('[EduQuiz] Firebase Auth SDK chưa được nạp trên trang này (bình thường với index.html).');
  }

  window.EduFirebase = {
    auth: authInstance,
    db: firebase.firestore(),
    // Lộ config ra ngoài để các trang cần tạo tài khoản HÀNG LOẠT (vd
    // admin-users.html → "📥 Nhập giáo viên từ Excel") có thể khởi tạo
    // THÊM 1 app instance PHỤ (firebase.initializeApp(config, 'ten-khac'))
    // dùng RIÊNG cho createUserWithEmailAndPassword — SDK Compat luôn tự
    // đăng nhập làm user vừa tạo trên CHÍNH app instance gọi hàm đó, nên
    // nếu gọi thẳng trên app mặc định sẽ ĐĂNG XUẤT admin đang thao tác
    // giữa chừng. Không hardcode lại config lần 2 ở nơi khác, tránh lệch
    // khi đổi project sau này.
    config: firebaseConfig,
  };
})();
