/* ============================================================
   📊 js/mos-submissions.js
   Module ghi kết quả nộp bài MOS Practice — đích chọn ở js/backend-config.js
   → mosResults: Google Sheet qua Apps Script (tab NhatKyMOS, mặc định) và/hoặc
   Firestore (collection "mos_submissions"). Mô phỏng CHÍNH XÁC pattern của
   js/firestore-results.js (collection "quiz_results") — cùng cách xác
   thực học sinh (không cần đăng nhập Firebase Auth), cùng cách xử lý
   lỗi (không chặn trải nghiệm học sinh nếu lưu thất bại).

   CHỈ lưu KẾT QUẢ CHẤM (điểm + chi tiết từng task) — KHÔNG lưu file
   .xlsx học sinh nộp (Phase 1 không dùng Firebase Storage, xem plan).

   NẠP FILE NÀY SAU: js/backend-config.js, js/services/apps-script-client.js,
   js/services/firebase-loader.js (Firebase chỉ nạp khi mosResults.firestore = true).
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION = 'mos_submissions';
  const MOS_TTL_DAYS = 45; // xem RESULT_TTL_DAYS trong js/firestore-results.js

  function policy() {
    return (global.EduBackend && global.EduBackend.mosResults) || { firestore: true, sheet: false };
  }

  /**
   * Lưu 1 kết quả MOS vào MỌI đích đang bật. Thành công khi tất cả đích nhận; cả 2 đích
   * chống trùng theo submissionId nên hàng đợi gửi lại cả bài cũng không tạo bản trùng.
   * permanent = có đích từ chối hẳn dữ liệu (gửi lại vô ích).
   */
  async function saveMosSubmission(rec) {
    const p = policy();
    const jobs = [];
    if (p.sheet) jobs.push(saveMosToSheet(rec));
    if (p.firestore || !p.sheet) jobs.push(saveMosToFirestore(rec)); // tắt cả 2 → vẫn giữ Firestore
    const results = await Promise.all(jobs);
    const failed = results.filter((r) => !r.success);
    if (!failed.length) return { success: true, id: rec.submissionId };
    return { success: false, permanent: failed.some((r) => r.permanent), message: failed.map((r) => r.message).join('; ') };
  }

  /** Google Sheet qua Apps Script (apps/src/35-mos.gs) — công khai, không cần đăng nhập. */
  async function saveMosToSheet(rec) {
    if (!global.EduAppsScript) return { success: false, message: 'Thiếu js/services/apps-script-client.js' };
    const payload = Object.assign({}, rec);
    delete payload._retry;
    if (!payload.submissionId && global.EduFirebaseLoader) payload.submissionId = global.EduFirebaseLoader.newDocId();
    try {
      await global.EduAppsScript.call('mosSubmit', { payload }, { auth: false, timeoutMs: 30 * 1000 });
      console.log('✅ [MosPractice] Đã lưu kết quả vào Google Sheet:', payload.submissionId);
      return { success: true };
    } catch (err) {
      console.warn('[MosPractice] Chưa lưu được vào Google Sheet:', err.message);
      return { success: false, permanent: err.code === 'invalid-argument', message: err.message };
    }
  }

  /**
   * Lưu 1 kết quả nộp bài MOS Practice vào Firestore.
   * @param {Object} rec
   *   { studentName, studentClass, studentSchool, projectId, projectTitle,
   *     score, autoTotal, passedCount, manualCount, results:[{id,label,passed,manual,note}] }
   * @returns {Promise<{success:boolean, id?:string, message?:string}>}
   */
  async function saveMosToFirestore(rec) {
    try {
      // mos-practice.html nạp Firebase theo yêu cầu (js/services/firebase-loader.js).
      if (global.EduFirebaseLoader) await global.EduFirebaseLoader.ready();
      if (!global.EduFirebase || !global.EduFirebase.db) {
        console.warn('[MosPractice] Firestore chưa sẵn sàng — bỏ qua lưu kết quả.');
        return { success: false, message: 'Firestore chưa cấu hình' };
      }

      const payload = {
        studentName:   rec.studentName   || 'Ẩn danh',
        studentClass:  rec.studentClass  || '',
        studentSchool: rec.studentSchool || '',
        projectId:     rec.projectId     || '',
        projectTitle:  rec.projectTitle  || '',
        // score=null nghĩa là "không có task nào tự chấm được" (toàn manual) — Firestore
        // rules yêu cầu score là số 0-100, nên lưu 0 và dựa vào autoTotal===0 để phân biệt
        // với "đã chấm nhưng được 0 điểm" khi hiển thị báo cáo.
        score:         rec.score === null || rec.score === undefined ? 0 : Number(rec.score),
        autoTotal:     Number(rec.autoTotal)    || 0,
        passedCount:   Number(rec.passedCount)  || 0,
        manualCount:   Number(rec.manualCount)  || 0,
        // Chi tiết từng task — chỉ giữ field cần cho báo cáo, tránh phình document.
        taskResults: (rec.results || []).map(r => ({
          id: r.id, label: String(r.label || '').slice(0, 300),
          manual: !!r.manual, passed: r.passed === null ? null : !!r.passed,
          note: String(r.note || '').slice(0, 300),
        })),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        // TTL (Firestore tự xoá, cần bật policy "mos_submissions/expireAt" — xem
        // docs/FIREBASE-CHECKLIST.md). Cùng lý do dung lượng 1 GiB như quiz_results.
        expireAt: firebase.firestore.Timestamp.fromMillis(Date.now() + MOS_TTL_DAYS * 24 * 60 * 60 * 1000),
      };

      // Mã tạo sẵn lúc nộp (mos-practice.js) → gửi lại từ hàng đợi không tạo bài trùng.
      if (rec.submissionId && global.EduFirebase.createOnce) {
        const res = await global.EduFirebase.createOnce(COLLECTION, rec.submissionId, payload);
        if (res.success) console.log('✅ [MosPractice] Đã lưu kết quả nộp bài:', res.id);
        if (!res.success && res.permanent && rec._retry) return { success: true, id: rec.submissionId, duplicate: true };
        return res;
      }
      const docRef = await global.EduFirebase.db.collection(COLLECTION).add(payload);
      console.log('✅ [MosPractice] Đã lưu kết quả nộp bài:', docRef.id);
      return { success: true, id: docRef.id };
    } catch (err) {
      console.error('❌ [MosPractice] Lỗi lưu kết quả Firestore:', err);
      return { success: false, message: err.message };
    }
  }

  global.saveMosSubmission = saveMosSubmission;
})(window);
