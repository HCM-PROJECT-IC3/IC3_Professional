/* ============================================================
   js/arena/arena-core.js — LOGIC THUẦN của "Đấu trường" (arena.html).
   Không đụng DOM/mạng → chạy được trong Node (js/arena/__tests__).

   Đấu trường = chơi 1 bộ câu hỏi (ngân hàng data/ic3 hoặc link đề giáo
   viên ?de=) theo kiểu game, đấu với đối thủ máy trên CHÍNH máy học sinh:
     • speed — "Tốc độ" kiểu Kahoot: điểm theo tốc độ, chuỗi đúng, bóng ma kỷ lục
     • gold  — "Săn vàng" kiểu Blooket Gold Quest: đúng → mở 1 trong 3 rương
     • race  — "Đua về đích" kiểu Blooket Racing: đúng → tiến 1 bước
   + Linh vật: xu kiếm được khi chơi → mở hộp → sưu tập (localStorage).
   0 lượt Firebase, 0 Apps Script — không gửi gì ra ngoài.
   ============================================================ */
(function (global) {
  'use strict';

  // ── Ngẫu nhiên có hạt giống (test lặp lại được) ──
  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () { // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function pickWeighted(list, rng) {
    const total = list.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of list) { r -= x.w; if (r < 0) return x; }
    return list[list.length - 1];
  }

  // ============================================================
  // CÂU HỎI — đổi câu ngân hàng / câu tự soạn sang dạng 1 đáp án đúng
  // (ô màu ▲ ◆ ● ■ như Kahoot). Đúng/Sai nhiều mệnh đề → mỗi mệnh đề 1 câu.
  // ============================================================
  const MAX_OPTIONS = 6;
  function strip(html) {
    return String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
  }
  function imageOf(q) {
    const src = q.imageUrl || (q.image_file ? 'img/' + q.image_file : '');
    return /^(img\/[\w\-./]+|https:\/\/[^\s"'<>`\\]+)$/i.test(src) && !src.includes('..') ? src : '';
  }
  /** 1 câu (dạng engine data/ic3) → 0..n câu Đấu trường {text, options, correctIdx, img, uid, expl}. */
  function convert(q) {
    if (!q || typeof q !== 'object') return [];
    const base = { img: imageOf(q), uid: q.uid || '', expl: strip(q.explanation) };
    if (q.type === 'single' || q.type === 'multi') {
      const options = (q.options || []).map(strip);
      const ok = new Set((q.correct || []).map(strip));
      const hits = options.filter((o) => ok.has(o));
      if (hits.length !== 1 || options.length < 2 || options.length > MAX_OPTIONS || options.some((o) => !o)) return [];
      const text = strip(q.question);
      return text ? [Object.assign({ text, options, answer: hits[0] }, base)] : [];
    }
    if (q.type === 'truefalse') {
      const t = q.label_true || 'Đúng', f = q.label_false || 'Sai';
      const intro = strip(q.question);
      return (q.statements || []).map((s) => strip(s.text) && (s.answer === 'true' || s.answer === 'false') && Object.assign({
        text: (intro && intro.length < 120 ? intro + ' — ' : 'Đúng hay sai? ') + strip(s.text),
        options: [t, f], answer: s.answer === 'true' ? t : f, keepOrder: true,
      }, base)).filter(Boolean);
    }
    return [];
  }
  /** Danh sách câu → bộ câu chơi: trộn câu + trộn đáp án (Đúng/Sai giữ thứ tự). */
  function buildDeck(questions, rng, max) {
    const out = [];
    const seen = new Set();
    (questions || []).forEach((q) => convert(q).forEach((c) => {
      const k = c.text + '\u0000' + c.answer;
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }));
    return shuffle(out, rng).slice(0, max || out.length).map((c) => {
      const options = c.keepOrder ? c.options : shuffle(c.options, rng);
      return { text: c.text, options, correctIdx: options.indexOf(c.answer), img: c.img, uid: c.uid, expl: c.expl };
    });
  }

  // ============================================================
  // ĐIỂM KIỂU KAHOOT
  // ============================================================
  /** Đúng: 1000 × (1 − (thời gian/giới hạn)/2), 500..1000. Sai/hết giờ: 0. */
  function speedPoints(correct, ms, limitMs) {
    if (!correct) return 0;
    const f = Math.min(1, Math.max(0, ms / limitMs));
    return Math.round(1000 * (1 - f / 2));
  }
  /** Thưởng chuỗi đúng: 2 câu liên tiếp +100, 3 → +200 ... tối đa +500. */
  function streakBonus(streak) { return streak >= 2 ? Math.min(500, (streak - 1) * 100) : 0; }

  // ============================================================
  // ĐỐI THỦ MÁY
  // ============================================================
  const BOT_NAMES = ['Mèo Wifi', 'Cú Bit', 'Rùa Byte', 'Cáo Pixel', 'Gấu Cache', 'Sóc USB', 'Cá Cloud', 'Thỏ Router'];
  const BOT_FACES = ['🐱', '🦉', '🐢', '🦊', '🐻', '🐿️', '🐟', '🐰'];
  /** level: 'easy' | 'normal' | 'hard' — độ chính xác + tốc độ của bot. */
  function makeBots(n, rng, level) {
    const acc = { easy: [0.45, 0.65], normal: [0.6, 0.8], hard: [0.75, 0.92] }[level] || [0.6, 0.8];
    return shuffle(BOT_NAMES.map((name, i) => ({ name, face: BOT_FACES[i] })), rng).slice(0, n).map((b, i) => Object.assign(b, {
      id: 'bot' + i, bot: true,
      accuracy: acc[0] + rng() * (acc[1] - acc[0]),
      speed: 0.25 + rng() * 0.5, // tỉ lệ thời gian thường dùng
      score: 0, gold: 0, pos: 0, streak: 0,
    }));
  }
  function botAnswer(bot, limitMs, rng) {
    const correct = rng() < bot.accuracy;
    const ms = Math.min(limitMs, Math.round(limitMs * Math.max(0.08, bot.speed + (rng() - 0.5) * 0.3)));
    return { correct, ms };
  }

  // ============================================================
  // SĂN VÀNG — rương (giống bảng của Blooket Gold Quest, đã chỉnh cho lớp học)
  // ============================================================
  const CHESTS = [
    { kind: 'gain', amount: 10, w: 14 }, { kind: 'gain', amount: 20, w: 14 }, { kind: 'gain', amount: 30, w: 12 },
    { kind: 'gain', amount: 40, w: 10 }, { kind: 'gain', amount: 50, w: 9 }, { kind: 'gain', amount: 100, w: 5 },
    { kind: 'mult', factor: 2, w: 7 }, { kind: 'mult', factor: 3, w: 3 },
    { kind: 'lose', pct: 25, w: 6 }, { kind: 'lose', pct: 50, w: 3 },
    { kind: 'steal', pct: 10, w: 6 }, { kind: 'steal', pct: 25, w: 4 },
    { kind: 'swap', w: 2 }, { kind: 'none', w: 5 },
  ];
  function chestLabel(c) {
    switch (c.kind) {
      case 'gain': return { icon: '🪙', title: `+${c.amount} vàng` };
      case 'mult': return { icon: c.factor === 3 ? '💎' : '✨', title: `Nhân ${c.factor}!` };
      case 'lose': return { icon: '🕳️', title: `Mất ${c.pct}%` };
      case 'steal': return { icon: '🦝', title: `Lấy ${c.pct}% của 1 bạn` };
      case 'swap': return { icon: '🔄', title: 'Đổi vàng với 1 bạn' };
      default: return { icon: '💨', title: 'Không có gì' };
    }
  }
  /** 3 rương — luôn có ít nhất 1 rương "được" để không quá xui. */
  function rollChests(rng) {
    const out = [pickWeighted(CHESTS, rng), pickWeighted(CHESTS, rng), pickWeighted(CHESTS, rng)];
    if (!out.some((c) => c.kind === 'gain' || c.kind === 'mult')) out[Math.floor(rng() * 3)] = { kind: 'gain', amount: 20 };
    return out.map((c) => Object.assign({}, c));
  }
  /**
   * Áp rương cho người mở (actor); target = người bị lấy/đổi (giàu nhất ngoài actor nếu không chỉ định).
   * Sửa trực tiếp .gold; trả { delta, target } để hiện thông báo.
   */
  function applyChest(c, actor, others) {
    const before = actor.gold;
    let target = null;
    const richest = () => others.filter((o) => o !== actor).sort((a, b) => b.gold - a.gold)[0] || null;
    switch (c.kind) {
      case 'gain': actor.gold += c.amount; break;
      case 'mult': actor.gold = actor.gold > 0 ? actor.gold * c.factor : 10 * c.factor; break;
      case 'lose': actor.gold = Math.floor(actor.gold * (1 - c.pct / 100)); break;
      case 'steal': {
        target = richest();
        if (target) { const take = Math.floor(target.gold * c.pct / 100); target.gold -= take; actor.gold += take; }
        break;
      }
      case 'swap': {
        target = richest();
        if (target && target.gold > actor.gold) { const t = target.gold; target.gold = actor.gold; actor.gold = t; } else target = null;
        break;
      }
      default: break;
    }
    return { delta: actor.gold - before, target };
  }

  // ============================================================
  // ĐUA VỀ ĐÍCH
  // ============================================================
  /** Đúng → +1 bước; chuỗi 3 đúng liên tiếp → thêm +1 (tăng tốc). Không vượt đích. */
  function raceStep(racer, correct, goal) {
    if (!correct) { racer.streak = 0; return 0; }
    racer.streak = (racer.streak || 0) + 1;
    const step = racer.streak % 3 === 0 ? 2 : 1;
    const before = racer.pos;
    racer.pos = Math.min(goal, racer.pos + step);
    return racer.pos - before;
  }

  // ============================================================
  // XẾP HẠNG
  // ============================================================
  function rank(players, key) {
    return players.slice().sort((a, b) => (b[key] - a[key]) || (a.bot === b.bot ? 0 : a.bot ? 1 : -1));
  }

  // ============================================================
  // XU + LINH VẬT (kiểu "Blook" của Blooket)
  // ============================================================
  /** Xu thưởng sau 1 ván: theo số câu đúng + thứ hạng (không thưởng khi không đúng câu nào). */
  function coinsFor({ correct, place, players }) {
    if (!correct) return 0;
    const placeBonus = { 1: 15, 2: 10, 3: 6 }[place] || 2;
    return Math.min(60, correct * 2 + (players > 1 ? placeBonus : 0));
  }
  const PACK_PRICE = 25;
  const RARITY = {
    common: { label: 'Thường', w: 600, refund: 3 },
    rare: { label: 'Hiếm', w: 270, refund: 8 },
    epic: { label: 'Sử thi', w: 100, refund: 15 },
    legendary: { label: 'Huyền thoại', w: 27, refund: 40 },
    mystery: { label: 'Bí ẩn', w: 3, refund: 100 },
  };
  const PACKS = [
    { id: 'hardware', name: 'Hộp Phần cứng', icon: '💻', blooks: [
      ['mouse', 'Chuột Click', '🖱️', 'common'], ['keyboard', 'Bàn Phím', '⌨️', 'common'], ['printer', 'Máy In', '🖨️', 'common'],
      ['disk', 'Đĩa Mềm', '💾', 'common'], ['battery', 'Pin Năng Lượng', '🔋', 'rare'], ['monitor', 'Màn Hình', '🖥️', 'rare'],
      ['chip', 'Chip Thông Minh', '🧠', 'epic'], ['robot', 'Rô-bốt IC3', '🤖', 'legendary'], ['alien', 'Bọ Lỗi Ngoài Hành Tinh', '👾', 'mystery'],
    ] },
    { id: 'internet', name: 'Hộp Internet', icon: '🌐', blooks: [
      ['mail', 'Thư Điện Tử', '📧', 'common'], ['link', 'Liên Kết', '🔗', 'common'], ['cloud', 'Đám Mây', '☁️', 'common'],
      ['phone', 'Điện Thoại', '📱', 'common'], ['satellite', 'Vệ Tinh', '🛰️', 'rare'], ['compass', 'La Bàn Web', '🧭', 'rare'],
      ['rocket', 'Tên Lửa 5G', '🚀', 'epic'], ['owl', 'Cú Tra Cứu', '🦉', 'legendary'], ['ufo', 'Đĩa Bay Wi-Fi', '🛸', 'mystery'],
    ] },
    { id: 'security', name: 'Hộp An toàn', icon: '🛡️', blooks: [
      ['lock', 'Ổ Khoá', '🔒', 'common'], ['key', 'Chìa Khoá', '🔑', 'common'], ['shield', 'Khiên Chắn', '🛡️', 'common'],
      ['bug', 'Sâu Máy Tính', '🐛', 'common'], ['detective', 'Thám Tử Mạng', '🕵️', 'rare'], ['virus', 'Vi-rút Bị Bắt', '🦠', 'rare'],
      ['fire', 'Tường Lửa', '🧯', 'epic'], ['dragon', 'Rồng Bảo Mật', '🐉', 'legendary'], ['ghost', 'Bóng Ma Hacker', '👻', 'mystery'],
    ] },
    { id: 'pets', name: 'Hộp Thú cưng', icon: '🐾', blooks: [
      ['cat', 'Mèo', '🐱', 'common'], ['dog', 'Cún', '🐶', 'common'], ['frog', 'Ếch', '🐸', 'common'], ['penguin', 'Chim Cánh Cụt', '🐧', 'common'],
      ['fox', 'Cáo', '🦊', 'rare'], ['panda', 'Gấu Trúc', '🐼', 'rare'], ['tiger', 'Hổ', '🐯', 'epic'],
      ['unicorn', 'Kỳ Lân', '🦄', 'legendary'], ['dragonpet', 'Rồng Con', '🐲', 'mystery'],
    ] },
  ].map((p) => Object.assign(p, { blooks: p.blooks.map(([id, name, emoji, rarity]) => ({ id: p.id + ':' + id, name, emoji, rarity, pack: p.id })) }));
  function blookById(id) {
    for (const p of PACKS) { const b = p.blooks.find((x) => x.id === id); if (b) return b; }
    return null;
  }
  /** Mở 1 hộp: chọn độ hiếm theo trọng số rồi chọn đều trong độ hiếm đó. */
  function openPack(packId, rng) {
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack) return null;
    const avail = Object.keys(RARITY).filter((r) => pack.blooks.some((b) => b.rarity === r)).map((r) => ({ r, w: RARITY[r].w }));
    const r = pickWeighted(avail, rng).r;
    const pool = pack.blooks.filter((b) => b.rarity === r);
    return pool[Math.floor(rng() * pool.length)];
  }
  /**
   * Hồ sơ người chơi (lưu localStorage theo biệt danh): { coins, owned:{id:count}, avatar, best:{setKey: {...}} }.
   * buyPack: trừ xu, thêm linh vật; trùng → hoàn lại xu theo độ hiếm. Trả { ok, blook, dupe, refund }.
   */
  // Bắt đầu 0 xu: đổi biệt danh không "cày" được xu; 1 ván đầu đã đủ mở hộp đầu tiên.
  function newProfile() { return { coins: 0, owned: {}, avatar: '', best: {}, games: 0 }; }
  function buyPack(profile, packId, rng) {
    if (profile.coins < PACK_PRICE) return { ok: false, reason: 'coins' };
    const blook = openPack(packId, rng);
    if (!blook) return { ok: false, reason: 'pack' };
    profile.coins -= PACK_PRICE;
    const dupe = !!profile.owned[blook.id];
    profile.owned[blook.id] = (profile.owned[blook.id] || 0) + 1;
    const refund = dupe ? RARITY[blook.rarity].refund : 0;
    profile.coins += refund;
    if (!profile.avatar) profile.avatar = blook.id;
    return { ok: true, blook, dupe, refund };
  }

  /** Bóng ma kỷ lục (Kahoot ghost mode): điểm cộng dồn sau mỗi câu của lần chơi tốt nhất. */
  function ghostScoreAt(best, i) {
    if (!best || !Array.isArray(best.trail) || !best.trail.length) return null;
    return best.trail[Math.min(i, best.trail.length - 1)];
  }

  global.EduArenaCore = {
    rngFrom, shuffle, strip, convert, buildDeck,
    speedPoints, streakBonus, makeBots, botAnswer,
    CHESTS, rollChests, applyChest, chestLabel, raceStep, rank,
    coinsFor, PACK_PRICE, RARITY, PACKS, blookById, openPack, newProfile, buyPack, ghostScoreAt,
  };
})(typeof window !== 'undefined' ? window : globalThis);
