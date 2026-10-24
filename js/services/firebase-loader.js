/* ============================================================
   js/services/firebase-loader.js
   Nạp Firebase THEO YÊU CẦU cho trang học sinh (index.html, mos-practice.html).

   Trước đây mọi học sinh mở trang đều tải 4 file Firebase SDK (~300 KB) và
   khởi tạo Firebase dù chỉ làm bài ôn tập, chưa
   chắc nộp lên Firestore. Giờ:
     • ensure()            — tải SDK + js/firebase-config.js đúng 1 lần, trả về
                             window.EduFirebase. Gọi lúc thật sự cần ghi.
     • hasStoredSession()  — máy này có phiên đăng nhập Firebase cũ không (đọc
                             IndexedDB của Firebase Auth, KHÔNG cần SDK, 0 lượt
                             Firebase). Dùng cho game-zone-gate.js.
     • newDocId()          — mã document 20 ký tự giống Firestore auto-ID, tạo
                             ở máy, không cần SDK (mã bài nộp cố định từ lúc nộp).

   Trang quản trị vẫn nạp Firebase trực tiếp bằng thẻ <script> như cũ — nếu SDK
   đã có sẵn trên trang, ensure() dùng luôn, không tải lại.

   Nạp SAU js/backend-config.js và js/services/lazy-script-loader.js.
   ============================================================ */
(function (global) {
  'use strict';

  const CONFIG_SCRIPT = 'js/firebase-config.js';
  let loading = null;

  function sdkUrls() {
    const cfg = (global.EduBackend && global.EduBackend.firebaseSdk) || {};
    const base = 'https://www.gstatic.com/firebasejs/' + (cfg.version || '10.13.0') + '/';
    return ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'].map((n) => base + n);
  }

  /** @returns {Promise<Object>} window.EduFirebase đã khởi tạo. */
  function ensure() {
    if (global.EduFirebase && global.EduFirebase.db) return Promise.resolve(global.EduFirebase);
    if (loading) return loading;
    if (!global.EduLazyLoad) return Promise.reject(new Error('[EduFirebaseLoader] Thiếu js/services/lazy-script-loader.js'));
    loading = global.EduLazyLoad.loadScripts(sdkUrls().concat(CONFIG_SCRIPT)).then(() => {
      if (!global.EduFirebase || !global.EduFirebase.db) throw new Error('[EduFirebaseLoader] firebase-config.js không khởi tạo được Firestore');
      return global.EduFirebase;
    });
    // Lỗi tải (mất mạng) không được "kẹt" vĩnh viễn — lần gọi sau thử lại.
    loading.catch(() => { loading = null; });
    return loading;
  }

  /**
   * true nếu trình duyệt đang giữ phiên đăng nhập Firebase Auth (đã đăng nhập ở
   * login.html trước đó). Firebase Auth lưu phiên ở IndexedDB "firebaseLocalStorageDb"
   * (store "firebaseLocalStorage", khoá "firebase:authUser:<apiKey>:<app>"); bản cũ
   * hơn có thể dùng localStorage cùng tên khoá.
   * @returns {Promise<boolean>}
   */
  function hasStoredSession() {
    const PREFIX = 'firebase:authUser:';
    try {
      for (let i = 0; i < localStorage.length; i++) {
        if (String(localStorage.key(i)).indexOf(PREFIX) === 0) return Promise.resolve(true);
      }
    } catch (e) { /* storage bị chặn — xem IndexedDB */ }
    if (!global.indexedDB) return Promise.resolve(false);
    return new Promise((resolve) => {
      let req;
      try { req = global.indexedDB.open('firebaseLocalStorageDb'); } catch (e) { resolve(false); return; }
      // DB chưa tồn tại: huỷ để KHÔNG tạo DB rỗng (Firebase sẽ không tạo được store của nó nữa).
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* ignore */ } };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) { db.close(); resolve(false); return; }
          const all = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAllKeys();
          all.onsuccess = () => {
            db.close();
            resolve((all.result || []).some((k) => String(k).indexOf(PREFIX) === 0));
          };
          all.onerror = () => { db.close(); resolve(false); };
        } catch (e) { db.close(); resolve(false); }
      };
    });
  }

  const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  /** Mã 20 ký tự cùng định dạng auto-ID của Firestore. */
  function newDocId() {
    const bytes = new Uint8Array(40);
    (global.crypto || global.msCrypto).getRandomValues(bytes);
    let id = '';
    // 248 = 62*4: bỏ byte >= 248 để mọi ký tự có xác suất như nhau.
    for (let i = 0; i < bytes.length && id.length < 20; i++) if (bytes[i] < 248) id += ID_CHARS[bytes[i] % 62];
    while (id.length < 20) id += ID_CHARS[Math.floor(Math.random() * 62)];
    return id;
  }

  /**
   * Dùng ở các hàm ghi (firestore-results.js, mos-submissions.js): trả EduFirebase
   * đã sẵn sàng, tự nạp nếu trang chưa có. null nếu không nạp được (mất mạng...)
   * — nơi gọi trả {success:false} để hàng đợi gửi lại lo tiếp.
   */
  function ready() {
    if (global.EduFirebase && global.EduFirebase.db) return Promise.resolve(global.EduFirebase);
    return ensure().catch((err) => {
      console.warn('[EduFirebaseLoader] Chưa nạp được Firebase:', err.message);
      return null;
    });
  }

  global.EduFirebaseLoader = { ensure, ready, hasStoredSession, newDocId };
})(window);
