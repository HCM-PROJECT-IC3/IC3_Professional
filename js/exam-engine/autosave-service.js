/* ════════════════════════════════════════════════════════════
   js/exam-engine/autosave-service.js — MOS Exam Simulator

   Application State → IndexedDB → Firestore (đúng luồng bắt buộc trong
   goal), cho phép khôi phục bài thi khi refresh trình duyệt hoặc mất
   mạng tạm thời:

   - IndexedDB LUÔN ghi trước, đồng bộ (best-effort) — vì đây là "nguồn
     phục hồi tức thời" khi mất mạng, không phụ thuộc Firestore.
   - Firestore ghi SAU, KHÔNG CHẶN (fire-and-forget với catch im lặng) —
     mất mạng tạm thời không được làm hỏng trải nghiệm làm bài; khi có
     mạng lại, lần autosave tiếp theo (mỗi vài giây, do exam UI gọi) sẽ
     tự đồng bộ lên.
   - restore() ưu tiên bản có `updatedAt` MỚI HƠN giữa IndexedDB và
     Firestore (vd học sinh đổi máy giữa chừng bài thi).

   NẠP FILE NÀY SAU js/firebase-config.js (nếu trang có dùng Firestore —
   không bắt buộc, service tự phát hiện qua window.EduFirebase và vẫn
   hoạt động đầy đủ ở chế độ chỉ-IndexedDB nếu thiếu).
   ════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var DB_NAME = 'mos_exam_autosave';
  var DB_VERSION = 1;
  var STORE = 'sessions';
  var FIRESTORE_COLLECTION = 'mos_exam_sessions';

  var hasIndexedDB = typeof indexedDB !== 'undefined';
  var dbPromise = null;

  function openDb() {
    if (!hasIndexedDB) return Promise.reject(new Error('IndexedDB not available in this environment'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'sessionId' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbPut(record) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function () { resolve(record); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(sessionId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(sessionId);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(sessionId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(sessionId);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function firestoreAvailable() {
    return !!(global.EduFirebase && global.EduFirebase.db);
  }

  function firestoreSave(sessionId, record) {
    if (!firestoreAvailable()) return Promise.resolve(false);
    return global.EduFirebase.db.collection(FIRESTORE_COLLECTION).doc(sessionId).set(
      Object.assign({}, record, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
      { merge: true }
    ).then(function () { return true; }).catch(function (e) {
      console.warn('[MOS Exam] Firestore autosave thất bại (sẽ thử lại ở lần autosave kế tiếp):', e && e.message);
      return false;
    });
  }

  function firestoreLoad(sessionId) {
    if (!firestoreAvailable()) return Promise.resolve(null);
    return global.EduFirebase.db.collection(FIRESTORE_COLLECTION).doc(sessionId).get()
      .then(function (doc) { return doc.exists ? doc.data() : null; })
      .catch(function (e) {
        console.warn('[MOS Exam] Không đọc được Firestore autosave (dùng bản IndexedDB nếu có):', e && e.message);
        return null;
      });
  }

  /**
   * Lưu 1 lượt autosave — record = { sessionId, studentInfo, snapshot }.
   * `snapshot` là kết quả của ExamSession.toSnapshot() (xem exam-runner.js).
   * Trả về Promise resolve NGAY SAU KHI IndexedDB ghi xong (không đợi
   * Firestore) để UI không bị khựng lại chờ mạng.
   */
  function autosave(sessionId, studentInfo, snapshot) {
    var record = {
      sessionId: sessionId,
      studentInfo: studentInfo || null,
      snapshot: snapshot,
      updatedAtLocal: Date.now()
    };
    var localWrite = hasIndexedDB ? idbPut(record).catch(function (e) {
      console.warn('[MOS Exam] IndexedDB autosave thất bại:', e && e.message);
      return null;
    }) : Promise.resolve(null);

    // Firestore ghi song song, không chặn UI — best-effort.
    firestoreSave(sessionId, record);

    return localWrite;
  }

  /**
   * Khôi phục 1 phiên thi — ưu tiên bản MỚI HƠN giữa IndexedDB và
   * Firestore (so theo updatedAtLocal / updatedAt).
   */
  function restore(sessionId) {
    var localPromise = hasIndexedDB ? idbGet(sessionId).catch(function () { return null; }) : Promise.resolve(null);
    var remotePromise = firestoreLoad(sessionId);
    return Promise.all([localPromise, remotePromise]).then(function (results) {
      var local = results[0], remote = results[1];
      if (local && remote) {
        var localTime = local.updatedAtLocal || 0;
        var remoteTime = remote.updatedAt && remote.updatedAt.toMillis ? remote.updatedAt.toMillis() : (remote.updatedAtLocal || 0);
        return remoteTime > localTime ? remote : local;
      }
      return local || remote || null;
    });
  }

  function clear(sessionId) {
    var localClear = hasIndexedDB ? idbDelete(sessionId).catch(function () { return false; }) : Promise.resolve(false);
    var remoteClear = firestoreAvailable()
      ? global.EduFirebase.db.collection(FIRESTORE_COLLECTION).doc(sessionId).delete().catch(function () { return false; })
      : Promise.resolve(false);
    return Promise.all([localClear, remoteClear]);
  }

  global.MosExamAutosave = {
    autosave: autosave,
    restore: restore,
    clear: clear,
    _internal: { openDb: openDb, hasIndexedDB: hasIndexedDB, firestoreAvailable: firestoreAvailable }
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
