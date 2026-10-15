// ====== ĐẤU TRƯỜNG — PHÒNG CẢ LỚP (arena.html) ======
// Router: arenaRoomLog (tài khoản quản trị đã đăng nhập — người dẫn phòng). Ghi tab NhatKyDauTruong.
// Phòng cả lớp chạy NGANG HÀNG trên máy người dẫn (WebRTC, js/arena/arena-room.js) — 0 lượt
// Firebase. Hết trận, người dẫn bấm "Lưu lên Google Sheet" → ĐÚNG 1 lượt gọi cho cả phòng
// (thay vì mỗi câu trả lời 1 lượt ghi Firestore như live-quiz.html cũ). Mỗi người chơi 1 dòng.

const SHEET_ARENA_LOG = 'NhatKyDauTruong';
const ARENA_HEADERS = ['ThoiGian', 'MaPhong', 'CheDo', 'BoCau', 'Hang', 'BietDanh', 'Diem', 'SoCauDung',
  'SoCauHoi', 'ChuoiDungDaiNhat', 'NguoiDan', 'BatDau', 'KetThuc'];
const ARENA_MAX_PLAYERS = 80;   // khớp EduArenaRoomCore.MAX_PLAYERS
const ARENA_MAX_QUESTIONS = 200;

/** p: { summary: EduArenaRoomCore.summary(room) } */
function arenaRoomLog_(p, who) {
  const s = p.summary || {};
  const code = String(s.code || '');
  if (!/^[2-9A-HJKMNP-Z]{6}$/.test(code)) throw appError_('invalid-argument', 'Mã phòng không hợp lệ.');
  if (s.mode !== 'speed' && s.mode !== 'race') throw appError_('invalid-argument', 'Chế độ không hợp lệ.');
  const players = Array.isArray(s.players) ? s.players : [];
  if (!players.length || players.length > ARENA_MAX_PLAYERS) throw appError_('invalid-argument', 'Danh sách người chơi không hợp lệ.');
  const questions = Math.max(0, Math.min(ARENA_MAX_QUESTIONS, Number(s.questions) || 0));
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const time = (v) => (Number(v) > 0 ? new Date(Number(v)) : '');

  // Gửi lại cùng 1 phòng (bấm 2 lần, mạng chập chờn) → không ghi trùng.
  const cache = CacheService.getScriptCache();
  const key = 'arena:' + code + ':' + (Number(s.endedAt) || 0);
  if (cache.get(key)) return { written: 0, duplicate: true };

  const sheet = logTab_(SHEET_ARENA_LOG, ARENA_HEADERS);
  const now = new Date();
  const mode = s.mode === 'speed' ? 'Tốc độ' : 'Đua về đích';
  players.forEach(function (pl, i) {
    sheet.appendRow([
      now, code, mode, asText_(String(s.title || '').slice(0, 150)),
      num(pl.rank || i + 1, ARENA_MAX_PLAYERS), asText_(String(pl.name || '').slice(0, 30)),
      num(pl.value, 100000), num(pl.correct, ARENA_MAX_QUESTIONS), questions, num(pl.bestStreak, ARENA_MAX_QUESTIONS),
      who.uid, time(s.startedAt), time(s.endedAt),
    ]);
  });
  cache.put(key, '1', DEDUPE_TTL_SEC);
  return { written: players.length };
}
