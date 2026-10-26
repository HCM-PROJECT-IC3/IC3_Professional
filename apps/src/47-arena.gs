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
// Khớp MODE_LABEL trong js/arena/arena-room.js (trước đây chỉ nhận speed/race → 4 chế độ còn lại
// bấm "Lưu lên Google Sheet" luôn bị từ chối 'invalid-argument').
const ARENA_MODES = { speed: 'Tốc độ', race: 'Đua về đích', survival: 'Sinh tồn', tug: 'Kéo co', spell: 'Đấu phép', heist: 'Giải mã' };

// ====== ĐƯỜNG DỰ PHÒNG (Firestore) — TRẦN CHUNG MỖI NGÀY CHO CẢ DỰ ÁN ======
// Router: arenaRelayTicket (tài khoản quản trị — người dẫn phòng). Học sinh không nối thẳng được
// tới máy giáo viên đi đường dự phòng qua Firestore (js/arena/arena-relay.js) — mỗi em ~21 ghi +
// ~66 đọc/trận 20 câu. Firestore Spark DÙNG CHUNG với dashboard/lịch dạy/đăng nhập… nên nhiều giáo
// viên cùng mở phòng không được ăn hết hạn mức: máy người dẫn xin "chỗ" theo từng gói nhỏ, CHỈ khi
// có em thật sự cần đường dự phòng (phòng cả lớp chung Wi-Fi: 0 lượt gọi). Đếm theo ngày giờ VN.
// Đổi trần: Script Properties → RELAY_DAILY_SLOTS (mặc định 150 ≈ 3.200 ghi + 10.000 đọc/ngày).
const RELAY_DAILY_SLOTS_DEFAULT = 150;
const RELAY_CHUNK_MAX = 10;

/** p: { slots: số chỗ xin thêm (1..10) } → { granted, used, cap } */
function arenaRelayTicket_(p) {
  const want = Math.max(1, Math.min(RELAY_CHUNK_MAX, Math.round(Number(p.slots) || 5)));
  const day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const key = 'RELAY_USED_' + day;
  const props = PropertiesService.getScriptProperties(); // ~3 lượt Properties/lần — 1 lần cho mỗi 5 em
  return withRareLock_(function () {
    const cap = Math.max(0, Number(props.getProperty('RELAY_DAILY_SLOTS')) || RELAY_DAILY_SLOTS_DEFAULT);
    const raw = props.getProperty(key);
    if (raw === null) { // lượt đầu trong ngày: dọn bộ đếm ngày cũ
      props.getKeys().forEach(function (k) { if (k.indexOf('RELAY_USED_') === 0 && k !== key) props.deleteProperty(k); });
    }
    const used = Number(raw) || 0;
    const granted = Math.max(0, Math.min(want, cap - used));
    if (granted) props.setProperty(key, String(used + granted));
    return { granted: granted, used: used + granted, cap: cap };
  });
}

/** p: { summary: EduArenaRoomCore.summary(room) } */
function arenaRoomLog_(p, who) {
  const s = p.summary || {};
  const code = String(s.code || '');
  if (!/^[2-9A-HJKMNP-Z]{6}$/.test(code)) throw appError_('invalid-argument', 'Mã phòng không hợp lệ.');
  if (!ARENA_MODES[s.mode]) throw appError_('invalid-argument', 'Chế độ không hợp lệ.');
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
  const mode = ARENA_MODES[s.mode];
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
