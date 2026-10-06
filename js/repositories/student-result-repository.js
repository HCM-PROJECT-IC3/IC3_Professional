/* ============================================================
   js/repositories/student-result-repository.js
   Đọc dữ liệu từ collection "quiz_results" (đã tồn tại). Đây là
   repository CHỈ ĐỌC — việc GHI vẫn do js/firestore-results.js đảm
   nhiệm như cũ (đúng nguyên tắc "không đổi chức năng hiện có").

   Nạp SAU: firebase-config.js, repositories/base-repository.js,
            models/student-result.model.js, models/exam-history.model.js
            (dùng ExamHistory.keyOf() để so khớp học sinh đã chuẩn hoá).
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME, normalize } = global.EduModels.StudentResult;

  // Giữ bản tải tăng dần trong IndexedDB 7 ngày (trước: 12 giờ). Mỗi lần mở trang
  // đã tự hỏi bài MỚI (thường 0-50 lượt) nên dữ liệu luôn tươi; hết hạn mới phải
  // đọc lại tới `limit` (1.000) lượt — 12 giờ nghĩa là mỗi giáo viên tốn ~1.000
  // lượt đọc/NGÀY chỉ cho lần mở đầu tiên (50 GV ≈ 50.000 = trọn hạn mức Spark).
  // Hết hạn 7 ngày vẫn cần để bỏ bài đã bị xoá ở máy khác / đã hết TTL.
  const RESULTS_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

  class StudentResultRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    /**
     * Lấy danh sách kết quả gần nhất, có thể lọc theo lớp/bài thi/khoảng thời gian.
     * Giữ giới hạn limit để tránh đọc quá nhiều doc (đúng tinh thần dashboard.js hiện tại).
     *
     * @param {string[]} [schools] Lọc theo studentSchool ('in', tối đa 10 giá trị —
     *   đủ dùng vì 1 giáo viên hiếm khi được gán quá 10 trường). BẮT BUỘC truyền cho
     *   teacher-dashboard.html (Commit #6/LMAP) — firestore.rules chỉ cho giáo viên đọc
     *   document có studentSchool nằm trong "schools" của họ, nên nếu KHÔNG lọc where
     *   ở đây, Firestore sẽ từ chối toàn bộ query (không tự lọc giúp). Coordinator/Admin
     *   không cần truyền (đọc không giới hạn theo rule).
     */
    /**
     * Danh sách kết quả gần đây theo kiểu TẢI TĂNG DẦN (tiết kiệm lượt đọc Firestore).
     * Lần đầu đọc đủ `limit` bản ghi rồi lưu cache (localStorage, sống qua nhiều lần mở
     * tab). Các lần sau chỉ hỏi Firestore những bài NỘP SAU bản ghi mới nhất đã có
     * (thường 0-50 doc thay vì 1000) rồi gộp vào cache. Trong `freshMs` không gọi gì cả.
     * @param {string} opts.cacheKey khoá cache theo phạm vi người xem (admin/trường)
     * @param {string[]} [opts.classes] Chỉ lấy bài của các lớp này (≤10, kèm ĐÚNG 1 trường)
     *   — xem js/teacher/data-loader.js.
     * @param {string} [opts.seedKey] Khoá cache cũ (phạm vi rộng hơn) dùng làm nền khi
     *   khoá mới chưa có gì — tránh đọc lại toàn bộ `limit` bản ghi chỉ vì đổi khoá.
     */
    async listRecentCached({ cacheKey, schools, classes, seedKey, limit = 1000, freshMs = 3 * 60 * 1000 } = {}) {
      const cache = global.EduDataCache;
      let entry = cache ? await cache.getAsync(cacheKey, true) : null;
      if (!entry && seedKey && cache) {
        const old = await cache.getAsync(seedKey, true, /* allowStale */ true);
        if (old && Array.isArray(old.rows)) {
          const keep = classes ? new Set(classes) : null;
          entry = { rows: keep ? old.rows.filter((r) => keep.has(r.studentClass)) : old.rows, fetchedAt: 0 };
        }
      }
      const now = Date.now();
      if (entry && Array.isArray(entry.rows) && now - entry.fetchedAt < freshMs) return entry.rows;
      let rows;
      if (entry && Array.isArray(entry.rows) && entry.rows.length) {
        const lastMs = entry.rows.reduce((m, r) => Math.max(m, r.submittedAtMs || 0), 0);
        const where = lastMs ? [['submittedAt', '>', global.firebase.firestore.Timestamp.fromMillis(lastMs - 1)]] : [];
        let fresh;
        try {
          fresh = await this.listRecent({ schools, classes, limit, extraWhere: where });
        } catch (err) {
          // Hết hạn mức đọc trong ngày / mất mạng: vẫn hiện dữ liệu đã có thay vì báo lỗi trắng.
          console.warn('[EduRepository] Không tải được kết quả mới, dùng dữ liệu đã lưu:', err.message);
          const F = global.EduFirebase;
          global.dispatchEvent(new CustomEvent('edu:toast', {
            detail: F && F.isQuotaOrOffline && F.isQuotaOrOffline(err)
              ? '⚠️ ' + F.QUOTA_HINT + ' — đang hiện dữ liệu đã lưu, chưa có bài nộp mới.'
              : '⚠️ Chưa tải được bài nộp mới — đang hiện dữ liệu đã lưu.',
          }));
          return entry.rows;
        }
        const byId = new Map(entry.rows.map((r) => [r.id, r]));
        fresh.forEach((r) => byId.set(r.id, r));
        rows = Array.from(byId.values())
          .sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0))
          .slice(0, limit);
      } else {
        try {
          rows = await this.listRecent({ schools, classes, limit });
        } catch (err) {
          // Bản lưu đã quá 7 ngày nhưng Firebase đang hết lượt/mất mạng: dùng tạm bản cũ.
          const F = global.EduFirebase;
          const stale = cache && F && F.isQuotaOrOffline(err) ? await cache.getAsync(cacheKey, true, /* allowStale */ true) : null;
          if (!stale || !Array.isArray(stale.rows)) throw err;
          global.dispatchEvent(new CustomEvent('edu:toast', { detail: '⚠️ ' + F.QUOTA_HINT + ' — đang hiện dữ liệu cũ đã lưu.' }));
          return stale.rows;
        }
      }
      if (cache) cache.setAsync(cacheKey, { rows, fetchedAt: now }, RESULTS_KEEP_MS, true);
      return rows;
    }

    async listRecent({ studentClass, testName, sinceMs, schools, classes, limit = 1000, extraWhere } = {}) {
      const where = [];
      if (studentClass) where.push(['studentClass', '==', studentClass]);
      if (testName) where.push(['testName', '==', testName]);
      // Lọc theo lớp ngay trên máy chủ (chỉ đọc bài của lớp mình, không đọc cả trường rồi
      // bỏ bớt ở máy): 1 trường dùng '==' để không phải 2 mệnh đề 'in' trong 1 query;
      // khớp composite index (studentClass, studentSchool, submittedAt) đã có.
      if (classes && classes.length && schools && schools.length === 1) {
        where.push(['studentClass', 'in', classes.slice(0, 10)]);
        where.push(['studentSchool', '==', schools[0]]);
      } else if (schools && schools.length) where.push(['studentSchool', 'in', schools.slice(0, 10)]);
      (extraWhere || []).forEach((w) => where.push(w));
      const rows = await this.list({ where, orderBy: 'submittedAt', direction: 'desc', limit });
      const normalized = rows.map(normalize);
      return sinceMs ? normalized.filter((r) => (r.submittedAtMs || 0) >= sinceMs) : normalized;
    }

    /**
     * Lấy toàn bộ kết quả của 1 học sinh theo tên+lớp (dùng cho trang chi tiết học sinh).
     *
     * LƯU Ý: chỉ lọc "studentClass" bằng Firestore where (giữ đúng quy ước so khớp
     * lớp đang dùng ở data-loader.js), sau đó so khớp CHÍNH XÁC học sinh ở phía
     * client bằng đúng công thức chuẩn hoá (trim + lowercase) mà
     * EduModels.ExamHistory.keyOf() / EduModels.Roster.studentKeyOf() đang dùng.
     * Trước đây dùng where('studentName','==',...) trực tiếp trên Firestore —
     * so khớp tuyệt đối, phân biệt hoa/thường và khoảng trắng — nên có thể trả
     * về rỗng dù bảng học sinh (đã chuẩn hoá) đang hiện học sinh đó có điểm.
     */
    /**
     * @param {string[]} [schools] BẮT BUỘC truyền khi gọi với vai trò giáo viên
     *   (Commit #8/LMAP, teacher-dashboard.html tái dùng student-detail.js của
     *   coordinator) — nếu không, Firestore từ chối query vì không có điều kiện
     *   where khớp rule scoping theo studentSchool. Coordinator/Admin không cần
     *   truyền (rule của họ không yêu cầu).
     */
    async listByStudent({ studentName, studentClass, schools }) {
      const where = [['studentClass', '==', studentClass]];
      if (schools && schools.length) where.push(['studentSchool', 'in', schools.slice(0, 10)]);
      const rows = await this.list({
        where,
        orderBy: 'submittedAt',
        direction: 'desc',
      });
      const normalized = rows.map(normalize);
      const wantKey = global.EduModels.ExamHistory.keyOf({ studentName, studentClass });
      return normalized.filter((r) => global.EduModels.ExamHistory.keyOf(r) === wantKey);
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.studentResult = new StudentResultRepository();
})(window);
