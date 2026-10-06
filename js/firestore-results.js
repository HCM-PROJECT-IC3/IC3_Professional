/* ============================================================
   📊 js/firestore-results.js
   Module ghi kết quả bài thi vào Firestore (collection "quiz_results")
   để phục vụ trang Báo cáo trực quan (ic3-dashboard.html → Báo cáo
   kết quả), dành cho Admin / Giáo viên / Điều phối đào tạo xem.

   Đây là nơi lưu CHÍNH (song song với Google Sheet ở js/googleSheet.js
   vốn chỉ dùng làm bản sao lưu/đối chiếu thủ công).

   NẠP FILE NÀY SAU:
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
     <script src="js/firebase-config.js"></script>
     <script src="js/firestore-results.js"></script>
   VÀ TRƯỚC js/quiz-engine.js (quiz-engine gọi saveResultToFirestore()).

   Học sinh làm bài KHÔNG cần đăng nhập Firebase Auth, nên hàm này ghi
   dữ liệu ở chế độ "public write" — xem firestore.rules để biết các
   ràng buộc dữ liệu tối thiểu chống giả mạo (collection quiz_results).
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION = 'quiz_results';

  // Số ngày giữ 1 bài nộp trên Firestore trước khi TTL tự xoá (field expireAt).
  // Trước đây 365 ngày — nhưng mỗi document quiz_results chiếm ~1,9 KB (sau khi
  // tắt index các field không lọc, xem fieldOverrides trong firestore.indexes.json;
  // ~5,3 KB nếu để index mặc định). Với 9.000 bài/ngày học, 60% của 1 GiB (gói
  // Spark) chỉ chứa được ~340.000 bài ≈ 38 ngày học ≈ 53 ngày lịch. 45 ngày là mức
  // an toàn; bản lưu lâu dài nằm ở Google Sheet (js/googleSheet.js, mỗi bài 1 dòng).
  // Muốn giữ lâu hơn: giảm lưu lượng hoặc nâng gói — đừng chỉ tăng số này.
  const RESULT_TTL_DAYS = 45;

  /**
   * Lưu 1 kết quả bài thi vào Firestore.
   * @param {Object} rec - Bản ghi kết quả (cùng cấu trúc với saveRecord() trong quiz-engine.js)
   * @returns {Promise<{success:boolean, id?:string, message?:string}>}
   */
  async function saveResultToFirestore(rec) {
    try {
      if (!global.EduFirebase || !global.EduFirebase.db) {
        console.warn('[EduQuiz] Firestore chưa sẵn sàng — bỏ qua lưu báo cáo (Google Sheet vẫn hoạt động).');
        return { success: false, message: 'Firestore chưa cấu hình' };
      }

      const fullTestName = [rec.category, rec.level, rec.minitest].filter(Boolean).join(' › ');

      const payload = {
        studentName:   rec.studentName   || 'Ẩn danh',
        studentClass:  rec.studentClass  || '',
        studentSchool: rec.studentSchool || '',
        category:      rec.category      || '',
        level:         rec.level         || '',
        minitest:      rec.minitest      || '',
        testName:      fullTestName      || 'Không rõ',
        score:         Number(rec.score) || 0,
        correct:       Number(rec.correct)   || 0,
        incorrect:     Number(rec.incorrect) || 0,
        skipped:       Number(rec.skipped)   || 0,
        total:         Number(rec.total)     || 0,
        elapsedSec:    Number(rec.elapsedSec) || 0,
        tabSwitches:   Number(rec.tabSwitches) || 0,
        clicks:        Number(rec.clicks)      || 0,
        integrityOk:   rec.integrityOk !== false,
        flags:         Array.isArray(rec.flags) ? rec.flags.slice(0, 10) : [],
        timedOut:      !!rec.timedOut,
        submittedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        // Trường TTL — Firestore sẽ TỰ XÓA document này sau RESULT_TTL_DAYS ngày, KHÔNG
        // tốn thao tác thủ công/Cloud Function. Chỉ có tác dụng SAU KHI bật
        // TTL policy 1 lần trong Console (miễn phí, không cần code):
        // Firebase Console → Firestore → tab "TTL" → Create policy →
        // collection group "quiz_results" → field "expireAt". Không bật thì
        // field này chỉ nằm im, không ảnh hưởng gì. Mục đích: quiz_results
        // tích lũy vô thời hạn sẽ chạm trần 1GB storage free của gói Spark
        // sớm muộn — xem RESULT_TTL_DAYS ở đầu file (vì sao 45 ngày).
        expireAt:      firebase.firestore.Timestamp.fromMillis(Date.now() + RESULT_TTL_DAYS * 24 * 60 * 60 * 1000),
      };

      // rec.resultId: mã tạo sẵn lúc nộp (quiz-engine.js § submitExam) → gửi lại từ
      // hàng đợi không tạo bài trùng (xem createOnce() trong firebase-config.js).
      // Bản ghi cũ còn trong hàng đợi từ trước đợt này không có mã → add() như cũ.
      if (rec.resultId && global.EduFirebase.createOnce) {
        const res = await global.EduFirebase.createOnce(COLLECTION, rec.resultId, payload);
        if (res.success) console.log('✅ [EduQuiz] Đã lưu báo cáo vào Firestore:', res.id);
        else if (res.pending) console.warn('⏳ [EduQuiz] Chưa lưu được báo cáo (Firebase chưa phản hồi) — sẽ tự gửi lại:', rec.resultId);
        else if (res.permanent && rec._retry) {
          // Gửi lại mà bị từ chối = document mã này ĐÃ tồn tại (lần gửi trước thật ra đã tới).
          console.log('✅ [EduQuiz] Báo cáo đã có sẵn trên Firestore (lần gửi trước đã thành công):', rec.resultId);
          return { success: true, id: rec.resultId, duplicate: true };
        } else console.error('❌ [EduQuiz] Lỗi lưu báo cáo Firestore:', res.code, res.message);
        return res;
      }
      const docRef = await global.EduFirebase.db.collection(COLLECTION).add(payload);
      console.log('✅ [EduQuiz] Đã lưu báo cáo vào Firestore:', docRef.id);
      return { success: true, id: docRef.id };
    } catch (err) {
      // Không chặn trải nghiệm học sinh nếu lưu báo cáo thất bại —
      // localStorage + Google Sheet (googleSheet.js) vẫn giữ vai trò dự phòng.
      // KHÔNG tự enqueue vào hàng đợi gửi lại ở ĐÂY — xem
      // js/services/pending-sync-queue.js: hàng đợi tự gọi LẠI đúng hàm
      // này lúc retry, nếu hàm tự enqueue chính nó mỗi lần thất bại sẽ
      // tạo thêm 1 bản ghi hàng đợi MỚI mỗi vòng retry thất bại (chồng
      // lên bản ghi mà flush() đã tự đưa lại vào hàng đợi) — nhân đôi vô
      // hạn. Việc enqueue lần ĐẦU TIÊN do nơi GỌI (quiz-engine.js §
      // submitExam) đảm nhận.
      console.error('❌ [EduQuiz] Lỗi lưu báo cáo Firestore:', err);
      return { success: false, message: err.message };
    }
  }

  global.saveResultToFirestore = saveResultToFirestore;
})(window);
