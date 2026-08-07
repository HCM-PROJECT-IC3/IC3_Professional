/* ============================================================
   js/firebase-config.js
   Khởi tạo Firebase dùng chung cho toàn bộ dự án EduQuiz.
   Nạp file này SAU các thẻ <script> của Firebase Compat SDK và
   TRƯỚC js/auth.js / js/auth-guard.js / các script khác cần dùng
   firebase.auth() hoặc firebase.firestore().

   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
   <script src="js/firebase-config.js"></script>
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

  if (!window.firebase) {
    console.error('[EduQuiz] Firebase SDK chưa được nạp trước firebase-config.js');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
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
  };
})();
