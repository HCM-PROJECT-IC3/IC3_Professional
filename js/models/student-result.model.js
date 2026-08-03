/* ============================================================
   js/models/student-result.model.js
   Model StudentResult — ánh xạ 1-1 với document trong collection
   "quiz_results" ĐÃ TỒN TẠI (ghi bởi js/firestore-results.js).
   File này KHÔNG đổi schema cũ, chỉ mô tả lại bằng JSDoc + factory
   để các service/repository mới dùng chung 1 "khuôn" dữ liệu, tránh
   gõ tay field string dễ sai chính tả.

   @typedef {Object} StudentResult
   @property {string} id                Firestore doc id
   @property {string} studentName
   @property {string} studentClass
   @property {string} studentSchool
   @property {string} category          vd. "IC3" | "Spark"
   @property {string} level             vd. "LV1"
   @property {string} minitest
   @property {string} testName          "category › level › minitest"
   @property {number} score             0-100
   @property {number} correct
   @property {number} incorrect
   @property {number} skipped
   @property {number} total
   @property {number} elapsedSec
   @property {number} tabSwitches
   @property {number} clicks
   @property {boolean} integrityOk
   @property {string[]} flags
   @property {boolean} timedOut
   @property {firebase.firestore.Timestamp} submittedAt
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION_NAME = 'quiz_results';

  /** true nếu điểm đạt yêu cầu (giữ đúng ngưỡng 70 đang dùng ở dashboard.js). */
  function isPassing(result, passThreshold = 70) {
    return typeof result.score === 'number' && result.score >= passThreshold;
  }

  /** Chuẩn hoá 1 doc Firestore thô thành object dễ dùng (thêm submittedAtMs). */
  function normalize(doc) {
    return Object.assign({}, doc, {
      submittedAtMs: doc.submittedAt && doc.submittedAt.toMillis ? doc.submittedAt.toMillis() : null,
    });
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.StudentResult = { COLLECTION_NAME, isPassing, normalize };
})(window);
