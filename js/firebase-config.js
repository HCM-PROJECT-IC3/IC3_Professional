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

   App Check (reCAPTCHA) ĐÃ GỠ (10/2026): gói reCAPTCHA miễn phí chỉ 10.000 lượt
   xác minh/THÁNG — mỗi lần mở trang có Firebase tốn 1 lượt, vượt là báo lỗi
   recaptcha-error. Firestore được bảo vệ bằng firestore.rules (xác thực + vai
   trò). KHÔNG bấm "Enforce" App Check trong Firebase Console: mọi request sẽ
   bị chặn vì web không còn gửi token.
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

  // ── Giám sát hạn mức (Spark: 50.000 đọc / 20.000 ghi mỗi ngày) ──
  // Mỗi lần tải dữ liệu gọi countReads() để in ra console dạng
  // "[teacher-dashboard] 12 lượt đọc Firestore — quiz_results (tổng trang: 15)".
  // Cách tính theo đúng biểu phí: query trả 0 kết quả vẫn tính 1 lượt; kết quả
  // lấy từ cache máy (fromCache) không tính. Chỉ là ước lượng phía client —
  // lượt đọc phát sinh trong firestore.rules (get()/exists()) không thấy được ở đây.
  const PAGE_LABEL = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  let readTotal = 0;
  function countReads(label, n) {
    const reads = Math.max(1, Number(n) || 0);
    readTotal += reads;
    console.info('[' + PAGE_LABEL + '] ' + reads + ' lượt đọc Firestore — ' + label + ' (tổng trang: ' + readTotal + ')');
    return reads;
  }
  /** Số lượt đọc tính phí của 1 QuerySnapshot/DocumentSnapshot (0 nếu lấy từ cache máy). */
  function countSnap(label, snap) {
    if (!snap || (snap.metadata && snap.metadata.fromCache)) return 0;
    return countReads(label, typeof snap.size === 'number' ? snap.size : 1);
  }
  // Hết lượt đọc/ghi trong ngày: SDK coi 'resource-exhausted' là lỗi TẠM THỜI, tự
  // chuyển sang offline → phía trang thường nhận 'unavailable' (client is offline)
  // hoặc snapshot fromCache, hiếm khi thấy đúng mã 'resource-exhausted'.
  function isQuotaOrOffline(err) {
    const code = err && err.code;
    return code === 'resource-exhausted' || code === 'unavailable' || code === 'deadline-exceeded';
  }
  // Hạn mức Spark đặt lại lúc 0h giờ Thái Bình Dương ≈ 14h-15h chiều giờ Việt Nam.
  const QUOTA_HINT = 'Firebase chưa phản hồi (hết lượt miễn phí hôm nay — đặt lại khoảng 14-15h chiều giờ VN — hoặc mất mạng)';

  // ── Ghi bài nộp ĐÚNG 1 LẦN (dùng cho quiz_results / mos_submissions) ──
  // Mã document do máy học sinh tạo SẴN lúc nộp (lưu kèm payload trong hàng đợi
  // gửi lại) → gửi lại bao nhiêu lần cũng chỉ ra 1 document: lần đầu là "create";
  // các lần sau thành "update" và bị firestore.rules từ chối (chỉ cho create) —
  // nghĩa là bài ĐÃ được lưu, không phải lỗi. Trước đây dùng add() (mỗi lần gửi
  // lại sinh mã mới) nên mạng chập chờn có thể tạo bài trùng.
  // SDK coi hết lượt ghi (resource-exhausted) và mất mạng là lỗi TẠM THỜI: promise
  // treo (SDK tự giữ lệnh ghi trong IndexedDB và gửi khi có lại lượt) chứ không
  // báo lỗi — vì thế có timeout để nơi gọi đưa bài vào hàng đợi gửi lại của mình.
  const PERMANENT_WRITE_ERRORS = ['permission-denied', 'invalid-argument', 'already-exists', 'failed-precondition'];
  const inflightWrites = new Map();
  function createOnce(collection, id, data, timeoutMs) {
    const key = collection + '/' + id;
    let write = inflightWrites.get(key);
    if (!write) {
      // Cùng 1 trang đang có lệnh ghi treo cho mã này → chờ lệnh đó, không xếp thêm lệnh mới.
      write = firebase.firestore().collection(collection).doc(id).set(data).then(
        () => ({ success: true, id }),
        (err) => ({ success: false, code: err.code, message: err.message, permanent: PERMANENT_WRITE_ERRORS.indexOf(err.code) !== -1 })
      );
      inflightWrites.set(key, write);
      write.then(() => inflightWrites.delete(key));
    }
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ success: false, pending: true, message: QUOTA_HINT }), timeoutMs || 20000);
    });
    return Promise.race([write, timeout]).finally(() => clearTimeout(timer));
  }
  /** Mã document ngẫu nhiên tạo ở máy (không tốn lượt đọc/ghi). */
  function newDocId(collection) {
    return firebase.firestore().collection(collection).doc().id;
  }

  window.EduFirebase = {
    auth: authInstance,
    db: firebase.firestore(),
    createOnce,
    newDocId,
    countReads,
    countSnap,
    isQuotaOrOffline,
    QUOTA_HINT,
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
