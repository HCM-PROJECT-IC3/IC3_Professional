/* ============================================================
   js/arena/arena-mini-core.js — logic thuần của "Mini-game" trong Đấu trường.
   5 mini-game học tập của Khu Vui Chơi cũ (trang riêng, nhúng iframe ?arena=1) được đưa vào
   Đấu trường và thêm lớp thi đấu bên ngoài:
     • Leo hạng: mỗi trò 5 đối thủ máy (Đồng → Huyền thoại), mỗi người 1 mốc điểm phải vượt.
       Hạ hết 5 → "Giữ ngai vàng": đối thủ là bóng ma kỷ lục của chính em.
     • Điểm Đấu trường: quy kết quả từng trò (sao, %, sóng, điểm...) về 1 thang để so với đối thủ.
     • Bóng ma: đối thủ "chạy" theo thời gian tới mốc của họ → biết lúc nào bị dẫn trước.
     • Xu: thắng đối thủ, phá kỷ lục, chuỗi thắng, "Trò của ngày" ×2 — trần mỗi ngày để không cày xu.
   Hàm thuần — không DOM, không lưu trữ (arena-mini.js gọi rồi tự lưu). Test: js/arena/__tests__/arena-mini-core.test.js
   ============================================================ */
(function (global) {
  'use strict';

  const TIERS = [
    { id: 'dong', name: 'Đồng', color: '#b4733a' },
    { id: 'bac', name: 'Bạc', color: '#7c8a99' },
    { id: 'vang', name: 'Vàng', color: '#d49b00' },
    { id: 'kimcuong', name: 'Kim cương', color: '#1c9bd6' },
    { id: 'huyenthoai', name: 'Huyền thoại', color: '#b4246b' },
  ];
  const CHAMP = { id: 'ngaivang', name: 'Ngai vàng', color: '#7a3cd1' };

  const DAILY_CAP = 120;      // xu tối đa mỗi ngày từ mini-game (mọi trò cộng lại)
  const LOSE_XU = 2;          // thua nhưng có điểm: xu khích lệ
  const BEST_XU = 5;          // phá kỷ lục cá nhân (không tính ván đầu tiên)
  const CHAMP_XU = 15;        // đã Huyền thoại, vượt kỷ lục của chính mình
  const NEAR = 0.9;           // thua mà đạt ≥ 90% mốc = "sát nút"
  const winXu = (tier) => 8 + tier * 4; // Đồng 8 · Bạc 12 · Vàng 16 · Kim cương 20 · Huyền thoại 24

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

  /**
   * Hành trình 5 chặng (thứ tự = thứ tự học IC3): nhận biết thiết bị → thao tác máy tính →
   * nhận diện tấn công → phòng thủ → trận cuối ôn tổng hợp. Chỉ giữ trò có nội dung học
   * (Chim Vượt Ải, Phân Loại Thần Tốc là trò "Giải trí" ở Khu Vui Chơi cũ — không đưa vào).
   * ladder = mốc điểm 5 đối thủ (tăng dần); expectSec = thời gian bóng ma chạy tới mốc;
   * live = trò có gửi điểm trực tiếp trong lúc chơi; topic = chủ đề IC3; learn = em học được gì.
   * Tranh bìa 3D vẽ ở js/arena/arena-mini-art.js (theo id), nền = cảnh của chính trang trò.
   */
  const GAMES = [
    { id: 'memory-game', page: 'memory-game.html', name: 'Trí Nhớ Thiết Bị', fa: 'fa-brain', scene: 'classroom',
      topic: 'Căn bản công nghệ', learn: 'Nhận biết thiết bị phần cứng và phần mềm qua hình ảnh.',
      desc: 'Lật thẻ ghép cặp — càng ít lượt, càng nhanh, càng nhiều điểm.',
      ladder: [720, 800, 860, 930, 970], expectSec: 80, live: true,
      rivals: [['Rùa Byte', '🐢'], ['Thỏ Router', '🐰'], ['Gấu Cache', '🐻'], ['Voi Nhớ Dai', '🐘'], ['Bạch Tuộc 8 Tay', '🐙']] },
    { id: 'computer-simulator', page: 'computer-simulator.html', name: 'Máy Tính Ảo', fa: 'fa-computer', scene: 'pegboard',
      topic: 'Căn bản công nghệ', learn: 'Tạo, đổi tên, di chuyển tệp và thư mục như trên máy thật.',
      desc: 'Làm đúng nhiệm vụ trên máy tính ảo — ít lần kiểm tra sai, càng nhanh càng tốt.',
      ladder: [550, 700, 850, 1000, 1100], expectSec: 120, live: false,
      rivals: [['Bạn Mới Vào Lớp', '🧒'], ['Lớp Phó Học Tập', '🧑‍🎓'], ['Kỹ Thuật Viên', '🧑‍🔧'], ['Quản Trị Mạng', '🧑‍💻'], ['Robot Trợ Giảng', '🤖']] },
    { id: 'cyber-detective', page: 'cyber-detective.html', name: 'Thám Tử Mạng', fa: 'fa-user-secret', scene: 'street',
      topic: 'An toàn và bảo mật', learn: 'Đọc dấu hiệu để nhận ra lừa đảo, mã độc, tấn công mạng.',
      desc: 'Mở ít manh mối nhất mà vẫn tìm đúng thủ phạm tấn công.',
      ladder: [600, 720, 840, 950, 1050], expectSec: 120, live: false,
      rivals: [['Cún Đánh Hơi', '🐶'], ['Mèo Tò Mò', '🐈'], ['Cú Thông Thái', '🦉'], ['Thanh Tra Cáo', '🦊'], ['Siêu Thám Tử', '🕵️']] },
    { id: 'pz-defense', page: 'pz-defense.html', name: 'Phòng Thủ Dữ Liệu', fa: 'fa-shield-halved', scene: 'farm',
      topic: 'An toàn và bảo mật', learn: 'Chọn đúng biện pháp (tường lửa, diệt virus, sao lưu...) cho từng mối đe doạ.',
      desc: 'Đặt lá chắn chặn 13 đợt mã độc, giữ Server sống sót.',
      ladder: [210, 420, 620, 830, 1050], expectSec: 600, live: true,
      rivals: [['Lính Gác Mới', '💂'], ['Kỹ Sư Mạng', '👷'], ['Chuyên Gia Tường Lửa', '🧱'], ['Đội Trưởng SOC', '🛡️'], ['Tổng Chỉ Huy', '🎖️']] },
    { id: 'battle-quiz', page: 'battle-quiz.html', name: 'Đấu Boss', fa: 'fa-hand-fist', scene: 'castle',
      topic: 'Ôn tổng hợp', learn: 'Trả lời câu hỏi IC3 thật trong ngân hàng đề — trận cuối của hành trình.',
      desc: 'Đúng liền tay tung combo, hạ Boss mã độc trước khi hết máu.',
      ladder: [120, 200, 270, 330, 400], expectSec: 150, live: true,
      rivals: [['Sóc USB', '🐿️'], ['Cú Bit', '🦉'], ['Mèo Wifi', '🐱'], ['Cáo Pixel', '🦊'], ['Rồng RAM', '🐲']] },
  ];
  const byId = (id) => GAMES.find((g) => g.id === id) || null;

  /**
   * Quy kết quả 1 ván về Điểm Đấu trường. s = session gửi vào EduGamification.recordGameSession,
   * s.arena = số liệu riêng mỗi trò thêm vào (xem từng js/<trò>.js). Thiếu số liệu → 0, không ném lỗi.
   */
  function points(gameId, s) {
    s = s || {};
    const a = s.arena || {};
    switch (gameId) {
      case 'memory-game': {
        // 600 khi ghép xong + 100/sao + thưởng tốc độ (tối đa 100, mất 1 điểm mỗi 3 giây)
        const stars = clamp(num(a.stars || s.score), 0, 3);
        const done = a.pairs ? num(a.matched ?? a.pairs) / a.pairs : (stars ? 1 : 0);
        return Math.round(600 * clamp(done, 0, 1) + stars * 100 + clamp(100 - Math.floor(num(s.durationSec) / 3), 0, 100));
      }
      case 'battle-quiz': return Math.round(num(a.score) + (a.win ? 100 + clamp(num(a.hp), 0, 100) : 0));
      case 'pz-defense': {
        const total = num(a.total) || 13;
        const hpPct = a.hpMax ? clamp(num(a.hp) / a.hpMax, 0, 1) : 0;
        return Math.round(clamp(num(a.waves), 0, total) / total * 900 + (a.win ? 100 + hpPct * 200 : 0));
      }
      case 'cyber-detective':
      case 'computer-simulator': {
        const pct = clamp(num(s.score), 0, 100);
        // Thưởng tốc độ chỉ khi đã làm đúng (≥ 1 điểm) — sai thì 0, không "ăn" điểm nhờ bấm nhanh
        return pct ? Math.round(pct * 10 + clamp(200 - num(s.durationSec), 0, 200)) : 0;
      }
      default: return Math.round(num(s.score));
    }
  }

  /** Điểm trực tiếp trong lúc chơi (cùng thang với points) — mỗi trò gửi 1 con số "thô". */
  function livePoints(gameId, raw) {
    const v = num(raw);
    if (gameId === 'memory-game') return Math.round(clamp(v, 0, 1) * 600); // raw = tỉ lệ cặp đã ghép
    if (gameId === 'pz-defense') return Math.round(clamp(v, 0, 1) * 900);  // raw = tỉ lệ đợt đã qua
    return Math.round(v);
  }

  /** Tiến độ 1 trò: { tier: số đối thủ đã hạ (0–5), best, plays, wins }. */
  function gameProg(prog, id) {
    const g = (prog && prog.g && prog.g[id]) || {};
    return { tier: clamp(num(g.tier), 0, TIERS.length), best: num(g.best), plays: num(g.plays), wins: num(g.wins) };
  }

  /** Đối thủ kế tiếp của em ở 1 trò. Đã hạ cả 5 → bóng ma kỷ lục (mốc = kỷ lục, không thấp hơn mốc Huyền thoại). */
  function rivalFor(gameId, prog) {
    const g = byId(gameId);
    if (!g) return null;
    const p = gameProg(prog, gameId);
    if (p.tier >= TIERS.length) {
      return { champ: true, tier: TIERS.length, tierInfo: CHAMP, name: 'Bóng ma kỷ lục', face: '👻', target: Math.max(p.best, g.ladder[g.ladder.length - 1]) };
    }
    const [name, face] = g.rivals[p.tier];
    return { champ: false, tier: p.tier, tierInfo: TIERS[p.tier], name, face, target: g.ladder[p.tier] };
  }

  /**
   * Bóng ma: điểm của đối thủ sau sec giây — tăng đều tới mốc, chậm dần ở cuối (dễ bị đuổi kịp ở nước rút).
   */
  function ghostAt(target, expectSec, sec) {
    const f = clamp(num(sec) / Math.max(1, num(expectSec)), 0, 1);
    return Math.round(num(target) * (1 - Math.pow(1 - f, 1.6)));
  }

  /** Chặng kế tiếp trên hành trình (null nếu đã là trận cuối). */
  function nextStage(gameId) {
    const i = GAMES.findIndex((g) => g.id === gameId);
    return i >= 0 && i < GAMES.length - 1 ? GAMES[i + 1] : null;
  }
  const stageOf = (gameId) => GAMES.findIndex((g) => g.id === gameId) + 1;

  /** Ngày dạng YYYY-MM-DD theo giờ máy. */
  function dayKey(d) {
    const t = d || new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  /** "Trò của ngày" (×2 xu): chọn theo ngày — cả lớp cùng 1 trò, ngày mai đổi trò khác. */
  function featured(day) {
    let h = 0;
    for (const ch of String(day)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return GAMES[h % GAMES.length].id;
  }

  /**
   * Chốt 1 ván: trả kết quả + tiến độ MỚI (không sửa prog đầu vào).
   * prog = { streak, day: { date, xu }, g: { [id]: {...} } }.
   * Trả { win, near, gap, pts, rival, tierUp, newBest, firstPlay, xu, parts: [{label, xu}], capped, prog }.
   */
  function settle(prog, gameId, pts, day) {
    const g = byId(gameId);
    const P = JSON.parse(JSON.stringify(prog || {}));
    P.g = P.g || {};
    P.streak = num(P.streak);
    if (!P.day || P.day.date !== day) P.day = { date: day, xu: 0 };
    const before = gameProg(P, gameId);
    const rival = rivalFor(gameId, P);
    pts = Math.max(0, Math.round(num(pts)));

    const win = !!rival && pts > 0 && (rival.champ ? pts > rival.target : pts >= rival.target);
    const firstPlay = before.plays === 0;
    const newBest = pts > before.best && !firstPlay;
    const gap = rival ? Math.max(0, rival.target - pts + (rival.champ ? 1 : 0)) : 0;
    const near = !win && !!rival && pts >= rival.target * NEAR;

    const parts = [];
    if (win) parts.push({ label: rival.champ ? 'Vượt bóng ma kỷ lục' : 'Hạ ' + rival.name, xu: rival.champ ? CHAMP_XU : winXu(rival.tier) });
    else if (pts > 0) parts.push({ label: 'Xu khích lệ', xu: LOSE_XU });
    if (newBest && !(win && rival.champ)) parts.push({ label: 'Kỷ lục mới', xu: BEST_XU });
    const streak = win ? P.streak + 1 : 0;
    if (win && streak >= 3) {
      const base = parts[0].xu;
      parts.push({ label: 'Chuỗi thắng ' + streak, xu: Math.ceil(base / 2) });
    }
    let xu = parts.reduce((s, x) => s + x.xu, 0);
    const isFeatured = featured(day) === gameId;
    if (isFeatured && xu) { parts.push({ label: 'Trò của ngày ×2', xu }); xu *= 2; }
    const room = Math.max(0, DAILY_CAP - num(P.day.xu));
    const capped = xu > room;
    xu = Math.min(xu, room);

    P.streak = streak;
    P.day.xu = num(P.day.xu) + xu;
    P.g[gameId] = {
      tier: win && !rival.champ ? before.tier + 1 : before.tier,
      best: Math.max(before.best, pts),
      plays: before.plays + 1,
      wins: before.wins + (win ? 1 : 0),
    };
    return { win, near, gap, pts, rival, tierUp: win && !rival.champ, newBest, firstPlay, featured: isFeatured, xu, parts, capped, prog: P, game: g };
  }

  /** Câu bình luận kết quả (động viên, không chê). seed để đổi câu giữa các lần. */
  function verdictLine(r, seed) {
    const pick = (l) => l[Math.abs(Math.round(num(seed))) % l.length];
    if (r.win && r.rival.champ) return pick(['Tự vượt chính mình — đỉnh nóc, kịch trần!', 'Kỷ lục cũ đã là dĩ vãng!', 'Ngai vàng vẫn gọi tên em! 👑']);
    if (r.win && r.rival.tier === TIERS.length - 1) return pick(['Huyền thoại đã gọi tên em! 🏆', 'Hạ cả trùm cuối — out trình thật sự!']);
    if (r.win) return pick(['Hạ gục gọn gàng — lên hạng như diều gặp gió! 🪁', 'Chuẩn không cần chỉnh!', 'Bứt phá ngoạn mục!', 'Quá cháy — đối thủ kế tiếp đang run rồi đó!']);
    if (r.near) return pick(['Sát nút luôn! Phục thù ngay là thắng!', 'Chỉ còn một chút xíu nữa thôi!', 'Suýt nữa là hạ được rồi — làm lại liền!']);
    if (r.pts > 0) return pick(['Chưa thắng thôi, chưa phải chưa giỏi!', 'Thua keo này, ta bày keo khác!', 'Mỗi ván là một bài học — lần sau bùng nổ nha!']);
    return pick(['Khởi động thế là đủ — vào trận thật nào!', 'Bình tĩnh, tự tin, không cay cú — thử lại nhé!']);
  }

  /** Câu nhắc khi đang đua với bóng ma (null nếu không có gì đáng nói). */
  function raceLine(me, ghost, target, done) {
    me = num(me); ghost = num(ghost);
    if (me >= target) return { tone: 'up', text: 'Đã vượt mốc ' + fmt(target) + ' — giữ vững tới cuối!' };
    if (done && me < target) return { tone: 'final', text: 'Nước rút! Còn thiếu ' + fmt(target - me) + ' điểm' };
    if (me > ghost) return { tone: 'up', text: 'Đang dẫn trước ' + fmt(me - ghost) + ' điểm' };
    if (ghost > me) return { tone: 'down', text: 'Bị dẫn ' + fmt(ghost - me) + ' điểm — tăng tốc!' };
    return null;
  }
  const fmt = (n) => Math.round(num(n)).toLocaleString('vi-VN');

  global.EduArenaMiniCore = {
    TIERS, CHAMP, GAMES, DAILY_CAP, byId, nextStage, stageOf, points, livePoints, gameProg, rivalFor, ghostAt, dayKey, featured, settle, verdictLine, raceLine, winXu, fmt,
  };
})(typeof window !== 'undefined' ? window : globalThis);
