/* ============================================================
   js/services/result-submitter.js
   GỬI 1 BÀI NỘP ĐI ĐÚNG NƠI — tách khỏi quiz-engine.js (trước đây hàm
   submitExam() tự dựng 2 payload, tự gọi Google Sheet + Firestore, tự xếp
   hàng đợi gửi lại: ~100 dòng trộn lẫn chấm điểm và lưu trữ).

   Phân vai:
     quiz-engine.js           chấm điểm, hiện kết quả → gọi submitQuiz()
     result-submitter.js      dựng payload, chọn đích theo EduBackend.quizResults
     firestore-results.js     ghi 1 bài vào Firestore (quiz_results)
     googleSheet.js           ghi 1 bài vào Google Sheet (Apps Script)
     pending-sync-queue.js    gửi lại khi thất bại

   Payload dựng 1 LẦN ở đây, tự chứa đủ dữ liệu (không đọc lại State.session
   lúc gửi) để hàng đợi gửi lại nhiều phút sau vẫn đúng bài gốc. Cả 2 đích
   dùng CHUNG 1 mã bài (resultId = submissionId) → gửi lại không tạo bản trùng
   ở Firestore (createOnce) lẫn Google Sheet (apps/Code.gs chống trùng theo mã).

   Nạp SAU js/backend-config.js, js/services/firebase-loader.js; TRƯỚC quiz-engine.js.
   ============================================================ */
(function (global) {
  'use strict';

  function policy() {
    return (global.EduBackend && global.EduBackend.quizResults) || { firestore: 'all', sheet: true, sheetJitterMs: 0 };
  }

  /** Có ghi Firestore cho bài ở chế độ examMode ('practice' | 'test') không. */
  function wantsFirestore(examMode, p) {
    const mode = (p || policy()).firestore;
    if (mode === 'off') return false;
    if (mode === 'test-only') return examMode !== 'practice';
    return true;
  }

  /** Bài không lên Firestore thì Sheet là nơi lưu duy nhất → luôn gửi Sheet. */
  function wantsSheet(examMode, p) {
    p = p || policy();
    return p.sheet !== false || !wantsFirestore(examMode, p);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // Câu sai gửi kèm bài lên Google Sheet (cột CauSai) để giáo viên xem "câu cả lớp
  // hay sai" — KHÔNG đưa vào Firestore (thêm dung lượng quiz_results, sát trần 1 GiB).
  const WRONG_MAX = 30;
  // uid ngân hàng: "ic3__lv1__t1__q1", MOS có cả dấu/khoảng trắng ("mos_word__bài1") —
  // chỉ cấm dấu phẩy (phân cách) và ký tự HTML/xuống dòng. Khớp validateSubmission_ (Apps Script).
  const UID_RE = /^[^,<>"'`&\r\n]{3,80}$/;
  /** uid các câu trả lời SAI (bỏ câu bỏ trống, câu tự soạn) → "uid1,uid2" (tối đa 30). */
  function wrongUids(questions, details) {
    if (!Array.isArray(questions) || !Array.isArray(details)) return '';
    const out = [];
    details.forEach((d, i) => {
      const uid = questions[i] && questions[i].uid;
      if (!d || d.status !== 'incorrect' || !uid || !UID_RE.test(uid) || /^custom__/i.test(uid)) return;
      if (out.length < WRONG_MAX && out.indexOf(uid) === -1) out.push(uid);
    });
    return out.join(',');
  }

  /**
   * Dựng 2 payload từ kết quả đã chấm. Hàm thuần (không gửi gì) — test được ở Node.
   * @param {Object} a
   * @param {Object} a.session   State.session lúc nộp
   * @param {Object} a.result    kết quả gradeExam()
   * @param {Object} a.integrity kết quả computeIntegrity()
   * @param {number} a.elapsed   số giây làm bài
   * @param {string} a.id        mã bài (20 ký tự)
   * @param {Object[]} [a.questions] State.questions (cùng thứ tự result.details) — lấy uid câu sai
   * @param {Date}   [a.now]
   */
  function buildPayloads({ session: s, result, integrity, elapsed, id, questions, now }) {
    const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
    const testName = [s.category, s.level, s.minitest].filter(Boolean).join(' › ');
    const flags = integrity.flags || [];
    const sheet = {
      submissionId:  id,
      studentName:   s.studentName,
      studentClass:  s.studentClass  || '',
      studentSchool: s.studentSchool || '',
      testName,
      score:       pct,
      correct:     `${result.correct}/${result.total}`,
      time:        `${pad2(Math.floor(elapsed / 60))}:${pad2(elapsed % 60)}`,
      tabSwitch:   integrity.tabSwitches,
      clickCount:  integrity.clicks,
      status:      integrity.valid ? 'OK' : '⚠️ ' + (flags[0] || 'Nghi vấn'),
      timestamp:   (now || new Date()).toLocaleString('vi-VN'),
      note:        flags.length > 1 ? flags.slice(1).join('; ') : (s.timedOut ? 'Hết giờ' : ''),
      examMode:    s.examMode || 'test',
      wrong:       wrongUids(questions, result.details),
      // Cột P ChiTiet: phần quiz_results có mà các cột cũ của Sheet không có → dashboard
      // đọc từ Sheet đủ dữ liệu như Firestore (sai/bỏ qua tách riêng, bài chính xác, hết giờ,
      // vi phạm nâng cao). Gọn (khoá 1-2 chữ) vì mỗi bài là 1 dòng Sheet.
      detail: {
        i: result.incorrect || 0, s: result.skipped || 0, e: elapsed || 0,
        c: s.category || '', l: s.level || '', m: s.minitest || '', to: s.timedOut ? 1 : 0,
        v: [integrity.multiTabHits, integrity.fullscreenExits, integrity.appSwitches,
          integrity.devtoolsHits, integrity.shortcutBlocks, integrity.printAttempts].map((n) => Number(n) || 0),
      },
    };
    const firestore = {
      resultId:      id,
      studentName:   s.studentName,
      studentClass:  s.studentClass  || '',
      studentSchool: s.studentSchool || '',
      category:      s.category,
      level:         s.level,
      minitest:      s.minitest,
      examMode:      s.examMode || 'test', // 'practice' (Ôn luyện) | 'test' (Kiểm tra)
      score:         pct,
      correct:       result.correct,
      incorrect:     result.incorrect,
      skipped:       result.skipped,
      total:         result.total,
      elapsedSec:    elapsed,
      tabSwitches:   integrity.tabSwitches,
      clicks:        integrity.clicks,
      integrityOk:   integrity.valid,
      flags,
      timedOut:      s.timedOut,
      // Vi phạm nâng cao chỉ có ý nghĩa ở chế độ "Kiểm tra" — xem quiz-engine.js § 2b
      multiTabHits:    integrity.multiTabHits,
      fullscreenExits: integrity.fullscreenExits,
      appSwitches:     integrity.appSwitches,
      devtoolsHits:    integrity.devtoolsHits,
      shortcutBlocks:  integrity.shortcutBlocks,
      printAttempts:   integrity.printAttempts,
    };
    return { sheet, firestore };
  }

  /**
   * Gọi hàm gửi; thất bại tạm thời → xếp hàng đợi gửi lại. Không bao giờ throw:
   * lưu báo cáo không được chặn trải nghiệm học sinh.
   */
  function sendOrQueue(queueType, fnName, payload) {
    const fn = global[fnName];
    const enqueue = () => { if (global.EduPendingSync) global.EduPendingSync.enqueue(queueType, payload); };
    if (typeof fn !== 'function') { enqueue(); return Promise.resolve(); }
    return Promise.resolve()
      .then(() => fn(payload))
      .then((res) => {
        // res.permanent = dữ liệu bị máy chủ từ chối hẳn — gửi lại cũng vô ích.
        if ((!res || res.success === false) && !(res && res.permanent)) enqueue();
      }, (err) => {
        console.warn('[EduResultSubmitter] ' + fnName + '() reject ngoài dự kiến:', err);
        enqueue();
      });
  }

  /**
   * Gửi 1 bài nộp IC3/Spark theo EduBackend.quizResults.
   * @returns {{id:string, firestore:boolean, sheet:boolean}} đích đã chọn (để log/test)
   */
  function submitQuiz({ session, result, integrity, elapsed, questions }) {
    const p = policy();
    const loader = global.EduFirebaseLoader;
    const id = loader ? loader.newDocId()
      : (global.EduFirebase && global.EduFirebase.newDocId ? global.EduFirebase.newDocId('quiz_results') : undefined);
    const payloads = buildPayloads({ session, result, integrity, elapsed, id, questions });
    const examMode = payloads.firestore.examMode;
    const toFirestore = wantsFirestore(examMode, p);
    const toSheet = wantsSheet(examMode, p);

    if (toSheet) {
      const jitter = Math.max(0, Number(p.sheetJitterMs) || 0) * Math.random();
      setTimeout(() => sendOrQueue('google_sheet', 'saveToGoogleSheet', payloads.sheet), jitter);
    }
    if (toFirestore) sendOrQueue('firestore_quiz_result', 'saveResultToFirestore', payloads.firestore);
    if (!toFirestore) console.info('[EduResultSubmitter] Chế độ "' + p.firestore + '": bài này chỉ lưu Google Sheet (không tốn lượt ghi Firebase).');
    return { id, firestore: toFirestore, sheet: toSheet };
  }

  global.EduResultSubmitter = { submitQuiz, buildPayloads, wantsFirestore, wantsSheet, wrongUids };
})(typeof window !== 'undefined' ? window : globalThis);
