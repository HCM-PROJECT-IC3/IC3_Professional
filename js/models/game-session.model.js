/* ============================================================
   js/models/game-session.model.js
   Model GameSession — collection MỚI "game_sessions".
   1 document = 1 LƯỢT CHƠI của 1 mini-game (Phase 4+ sẽ có Cyber
   Defense, Battle Quiz... ghi vào đây khi được build). Immutable
   theo thiết kế — giống quiz_results/student_answers: ghi 1 lần khi
   kết thúc lượt chơi, KHÔNG sửa lại sau đó. Tổng XP/tiến độ tích luỹ
   được TÍNH LẠI (view) từ các document này bằng summarize(), không
   lưu sẵn 1 con số "tổng XP hiện tại" có thể bị ghi đè/giả mạo từ
   phía client — đúng nguyên tắc exam-history.model.js đã áp dụng cho
   quiz_results.

   Vì học sinh chơi game KHÔNG đăng nhập (giống lúc làm bài thi),
   định danh học sinh dùng LẠI đúng công thức
   EduModels.ExamHistory.keyOf() (name+class đã chuẩn hoá) để 1 học
   sinh có thể đối chiếu giữa lịch sử thi (quiz_results) và lịch sử
   chơi game (game_sessions) bằng CÙNG 1 khoá — không tạo hệ khoá thứ
   hai chạy song song.

   Nạp file này SAU js/models/exam-history.model.js (dùng keyOf()).

   @typedef {Object} GameSession
   @property {string} id                 Firestore doc id
   @property {string} studentKey         EduModels.ExamHistory.keyOf()
   @property {string} studentName
   @property {string} studentClass
   @property {string} studentSchool
   @property {string} gameId             'pz-defense' | 'memory-game' | 'sudoku' | 'billiards' | 'prism-cascade' (Phase 4+: 'cyber-defense', 'battle-quiz', 'cyber-detective', 'computer-simulator'...)
   @property {number} score              Điểm của lượt chơi, thang tuỳ theo `scoreType`
   @property {string} scoreType          'percent' (0-100) | 'raw' (điểm thô riêng của game, vd. Sudoku/Bi-a không có %)
   @property {number} xp                 XP cộng dồn từ lượt chơi này (tính sẵn phía client trước khi ghi)
   @property {number|null} accuracy      0-100, chỉ áp dụng game có gắn câu hỏi IC3 (null nếu không có)
   @property {number|null} correctAnswers
   @property {number|null} wrongAnswers
   @property {string|null} topic         chủ đề IC3 liên quan (nếu game có gắn câu hỏi theo chủ đề — xem question-topic-map ở phase sau)
   @property {string|null} difficulty    'easy' | 'medium' | 'hard' | null
   @property {number} durationSec
   @property {firebase.firestore.Timestamp} playedAt
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION_NAME = 'game_sessions';

  // Danh sách gameId hợp lệ hiện có (Phase 2). Phase 4+ sẽ nối thêm khi
  // từng game mới thực sự được build — KHÔNG khai báo trước game chưa
  // tồn tại để tránh session "ma" không ai ghi được.
  const GAME_IDS = Object.freeze([
    'prism-cascade', 'memory-game', 'sudoku', 'billiards', 'pz-defense',
  ]);

  /** Định danh học sinh — tái dùng đúng công thức ExamHistory.keyOf() (không tạo khoá mới). */
  function studentKeyOf({ studentName, studentClass }) {
    return global.EduModels.ExamHistory.keyOf({ studentName, studentClass });
  }

  /** Chuẩn hoá 1 doc Firestore thô thành object dễ dùng (thêm playedAtMs). */
  function normalize(doc) {
    return Object.assign({}, doc, {
      playedAtMs: doc.playedAt && doc.playedAt.toMillis ? doc.playedAt.toMillis() : null,
    });
  }

  /** Tính tổng XP + số lượt chơi (theo từng game) từ danh sách session đã normalize — 1 VIEW, không lưu lại. */
  function summarize(sessions) {
    return sessions.reduce((acc, s) => {
      acc.totalXp += s.xp || 0;
      acc.totalSessions += 1;
      acc.byGame[s.gameId] = (acc.byGame[s.gameId] || 0) + 1;
      if (s.playedAtMs && (!acc.lastPlayedAtMs || s.playedAtMs > acc.lastPlayedAtMs)) {
        acc.lastPlayedAtMs = s.playedAtMs;
      }
      return acc;
    }, { totalXp: 0, totalSessions: 0, byGame: {}, lastPlayedAtMs: null });
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.GameSession = { COLLECTION_NAME, GAME_IDS, studentKeyOf, normalize, summarize };
})(window);
