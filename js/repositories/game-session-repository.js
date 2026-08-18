/* ============================================================
   js/repositories/game-session-repository.js
   CRUD cho collection MỚI "game_sessions". Chỉ hỗ trợ GHI MỚI + ĐỌC —
   không có update/remove cho 1 session (immutable theo thiết kế, xem
   models/game-session.model.js — lý do giống quiz_results).

   Nạp SAU: firebase-config.js, repositories/base-repository.js,
            models/exam-history.model.js, models/game-session.model.js
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME, normalize, studentKeyOf } = global.EduModels.GameSession;

  class GameSessionRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    /**
     * Ghi 1 lượt chơi mới. Không có hàm update tương ứng — session đã ghi
     * là bất biến (immutable), giống nguyên tắc quiz_results/student_answers.
     * @param {Object} session — xem @typedef GameSession, không cần truyền studentKey/playedAt (tự sinh).
     */
    async recordSession(session) {
      const studentKey = studentKeyOf(session);
      const playedAt = (global.firebase && global.firebase.firestore)
        ? global.firebase.firestore.FieldValue.serverTimestamp()
        : new Date();
      return this.create(Object.assign({}, session, { studentKey, playedAt }));
    }

    /** Lịch sử chơi của 1 học sinh (MỌI game), mới nhất trước. */
    async listByStudent({ studentName, studentClass, limit = 200 }) {
      const key = studentKeyOf({ studentName, studentClass });
      const rows = await this.list({
        where: [['studentKey', '==', key]],
        orderBy: 'playedAt',
        direction: 'desc',
        limit,
      });
      return rows.map(normalize);
    }

    /** Lịch sử chơi 1 game cụ thể của 1 học sinh (vd. hiện "điểm cao nhất PZ Defense" cho học sinh đó). */
    async listByStudentAndGame({ studentName, studentClass, gameId, limit = 50 }) {
      const key = studentKeyOf({ studentName, studentClass });
      const rows = await this.list({
        where: [['studentKey', '==', key], ['gameId', '==', gameId]],
        orderBy: 'playedAt',
        direction: 'desc',
        limit,
      });
      return rows.map(normalize);
    }

    /** Lượt chơi gần đây nhất trên toàn hệ thống cho 1 game — dùng cho báo cáo/leaderboard (Phase sau). */
    async listRecentByGame(gameId, limit = 100) {
      const rows = await this.list({
        where: [['gameId', '==', gameId]],
        orderBy: 'playedAt',
        direction: 'desc',
        limit,
      });
      return rows.map(normalize);
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.gameSession = new GameSessionRepository();
})(window);
