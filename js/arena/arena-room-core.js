/* ============================================================
   js/arena/arena-room-core.js — LOGIC THUẦN của "Phòng cả lớp" trong Đấu trường
   (thay live-quiz.html cũ chạy trên Firestore). Không đụng DOM/mạng → chạy được
   trong Node (js/arena/__tests__/arena-room-core.test.js).

   Mô hình: máy NGƯỜI DẪN (giáo viên, máy chiếu) giữ toàn bộ trạng thái phòng và
   tự chấm điểm; học sinh nối thẳng vào máy người dẫn bằng WebRTC (js/arena/
   arena-room.js) — 0 lượt Firebase, đáp án đúng KHÔNG gửi trước khi chốt câu.
   Điểm dùng đúng công thức của Đấu trường 1 người (js/arena/arena-core.js):
     • speed — Tốc độ kiểu Kahoot: 500..1000 theo tốc độ + thưởng chuỗi đúng
     • race  — Đua về đích: đúng +1 bước, 3 câu đúng liên tiếp +2 bước
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // bỏ 0/O, 1/I/L dễ nhầm khi đọc trên máy chiếu
  const CODE_LEN = 6;
  const PEER_PREFIX = 'eduquiz-arena-v1-';
  const ANSWER_GRACE_MS = 1500; // trễ mạng: câu trả lời tới muộn tối đa chừng này vẫn nhận
  const MAX_PLAYERS = 80;
  const KEY_OF = { speed: 'score', race: 'pos' };

  function makeCode(rng) {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    return s;
  }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^2-9A-HJKMNP-Z]/g, '').slice(0, CODE_LEN); }
  function peerId(code) { return PEER_PREFIX + code; }
  function cleanName(s) { return String(s || '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); }

  /**
   * Tạo phòng ở máy người dẫn.
   * opts: { code, mode:'speed'|'race', deck (EduArenaCore.buildDeck), count, secs, maxPlayers, title, setKey }
   */
  function createRoom(opts) {
    const mode = opts.mode === 'race' ? 'race' : 'speed';
    const count = Math.max(1, opts.count | 0);
    return {
      v: 1, code: opts.code, mode, title: String(opts.title || '').slice(0, 120), setKey: opts.setKey || '',
      deck: opts.deck.slice(), secs: Math.max(5, opts.secs | 0 || 20),
      // Tốc độ: số câu = số câu chọn (≤ số câu có). Đua: về đích sau `count` bước, tối đa 2×count câu (lặp bộ nếu thiếu).
      total: mode === 'speed' ? Math.min(count, opts.deck.length) : count * 2,
      goal: mode === 'race' ? count : 0,
      max: Math.min(MAX_PLAYERS, Math.max(2, opts.maxPlayers | 0 || 60)),
      players: {}, order: [], i: -1, phase: 'lobby', qStartAt: 0, answers: {}, last: null,
      createdAt: opts.now || Date.now(), endedAt: 0,
    };
  }

  function uniqueName(room, name, cid) {
    const taken = new Set(room.order.filter((id) => id !== cid && !room.players[id].kicked).map((id) => room.players[id].name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let k = 2; ; k++) { const n = `${name.slice(0, 20)} (${k})`; if (!taken.has(n.toLowerCase())) return n; }
  }

  /**
   * Học sinh vào phòng (hoặc vào lại sau khi rớt mạng — nhận ra bằng cid lưu trên máy em).
   * @returns {{ok:true, player, rejoin:boolean} | {ok:false, reason:'full'|'name'|'kicked'|'ended'}}
   */
  function join(room, { cid, name, face }) {
    cid = String(cid || '').slice(0, 40);
    if (!cid) return { ok: false, reason: 'name' };
    const old = room.players[cid];
    if (old) {
      if (old.kicked) return { ok: false, reason: 'kicked' };
      old.online = true;
      return { ok: true, player: old, rejoin: true };
    }
    if (room.phase === 'end') return { ok: false, reason: 'ended' };
    const clean = cleanName(name);
    if (!clean) return { ok: false, reason: 'name' };
    if (activeIds(room).length >= room.max) return { ok: false, reason: 'full' };
    const player = {
      cid, name: uniqueName(room, clean, cid), face: String(face || '🙂').slice(0, 8),
      // log[i]: vào giữa chừng thì các câu trước để trống = "không trả lời"
      score: 0, pos: 0, streak: 0, bestStreak: 0, correct: 0, log: [], online: true, kicked: false,
    };
    room.players[cid] = player;
    room.order.push(cid);
    return { ok: true, player, rejoin: false };
  }
  function activeIds(room) { return room.order.filter((id) => !room.players[id].kicked); }
  function setOnline(room, cid, on) { if (room.players[cid]) room.players[cid].online = on; }
  /** Tự rời phòng: còn ở sảnh chờ → xoá hẳn (nhường chỗ); đang chơi → giữ điểm, coi như rớt mạng. */
  function leave(room, cid) {
    if (!room.players[cid]) return;
    if (room.phase !== 'lobby') { room.players[cid].online = false; return; }
    delete room.players[cid];
    room.order = room.order.filter((id) => id !== cid);
  }
  function kick(room, cid) {
    const p = room.players[cid];
    if (!p) return false;
    p.kicked = true; p.online = false;
    delete room.answers[cid];
    return true;
  }

  function current(room) { return room.deck[room.i % room.deck.length]; }
  /** Câu gửi cho học sinh — KHÔNG kèm đáp án đúng. */
  function publicQuestion(room, now) {
    const q = current(room);
    const left = Math.max(0, room.secs * 1000 - ((now || Date.now()) - room.qStartAt));
    return { t: 'q', i: room.i, total: room.total, text: q.text, options: q.options, img: q.img || '', ms: left, secs: room.secs, mode: room.mode, goal: room.goal };
  }

  function canAdvance(room) { return room.phase === 'lobby' || room.phase === 'reveal'; }
  /** Mở câu kế tiếp. Trả câu (không đáp án) để phát cho cả lớp, hoặc null nếu hết. */
  function openNext(room, now) {
    if (!canAdvance(room) || isDone(room)) return null;
    room.i++;
    room.phase = 'q';
    room.qStartAt = now;
    room.answers = {};
    room.last = null;
    return publicQuestion(room, now);
  }

  /**
   * Nhận 1 câu trả lời. Máy người dẫn tự đo thời gian (giờ máy người dẫn, không tin giờ học sinh).
   * @returns {{ok:boolean, reason?:string, allIn?:boolean}}
   */
  function submit(room, cid, i, k, now) {
    const p = room.players[cid];
    if (!p || p.kicked) return { ok: false, reason: 'player' };
    if (room.phase !== 'q' || i !== room.i) return { ok: false, reason: 'phase' };
    if (room.answers[cid]) return { ok: false, reason: 'dupe' };
    const q = current(room);
    if (!Number.isInteger(k) || k < 0 || k >= q.options.length) return { ok: false, reason: 'choice' };
    const ms = now - room.qStartAt;
    if (ms > room.secs * 1000 + ANSWER_GRACE_MS) return { ok: false, reason: 'late' };
    room.answers[cid] = { k, ms: Math.max(0, Math.min(room.secs * 1000, ms)) };
    return { ok: true, allIn: allAnswered(room) };
  }
  /** Mọi người ĐANG KẾT NỐI đã trả lời → chốt sớm (như Kahoot). */
  function allAnswered(room) {
    const online = activeIds(room).filter((id) => room.players[id].online);
    return online.length > 0 && online.every((id) => room.answers[id]);
  }
  function answeredCount(room) { return Object.keys(room.answers).length; }

  /** Chốt câu đang mở: chấm điểm mọi người, trả kết quả chung + riêng từng người. */
  function reveal(room) {
    if (room.phase !== 'q') return room.last;
    const q = current(room);
    const limit = room.secs * 1000;
    const counts = q.options.map(() => 0);
    const before = rankMap(room);
    const results = {};
    activeIds(room).forEach((id) => {
      const p = room.players[id];
      const a = room.answers[id];
      const ok = !!a && a.k === q.correctIdx;
      if (a) counts[a.k]++;
      let pts = 0, bonus = 0, step = 0;
      if (room.mode === 'speed') {
        if (ok) { p.streak++; pts = C.speedPoints(true, a.ms, limit); bonus = C.streakBonus(p.streak); } else p.streak = 0;
        p.score += pts + bonus;
      } else {
        step = C.raceStep(p, ok, room.goal); // raceStep tự cập nhật p.streak
      }
      if (ok) p.correct++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      p.log[room.i] = a ? (ok ? 1 : 0) : -1; // 1 đúng, 0 sai, -1 không trả lời
      results[id] = { ok, k: a ? a.k : null, pts, bonus, step, streak: p.streak };
    });
    room.phase = 'reveal';
    const board = leaderboard(room);
    board.forEach((row, idx) => {
      const r = results[row.cid];
      if (!r) return;
      r.rank = idx + 1;
      r.value = row.value;
      r.up = before[row.cid] ? before[row.cid] - (idx + 1) : 0;
    });
    room.last = { i: room.i, correctIdx: q.correctIdx, counts, answered: answeredCount(room), results, expl: q.expl || '' };
    return room.last;
  }
  function rankMap(room) {
    const m = {};
    leaderboard(room).forEach((row, idx) => { m[row.cid] = idx + 1; });
    return m;
  }

  /** Bảng xếp hạng (bằng điểm → ai đúng nhiều hơn, rồi ai vào trước). */
  function leaderboard(room) {
    const key = KEY_OF[room.mode];
    return activeIds(room).map((id, idx) => {
      const p = room.players[id];
      return { cid: id, name: p.name, face: p.face, value: p[key], correct: p.correct, online: p.online, idx };
    }).sort((a, b) => (b.value - a.value) || (b.correct - a.correct) || (a.idx - b.idx));
  }

  function isDone(room) {
    if (room.i + 1 >= room.total) return true;
    return room.mode === 'race' && activeIds(room).some((id) => room.players[id].pos >= room.goal);
  }
  function finish(room, now) {
    if (room.phase === 'q') reveal(room);
    room.phase = 'end';
    room.endedAt = now || Date.now();
    return leaderboard(room);
  }

  /** Số câu đã hỏi (để tính tỉ lệ đúng). */
  function asked(room) { return Math.max(0, room.i + 1); }

  /** Kết quả riêng của 1 người khi kết thúc (gửi về máy em, tính xu ở máy em). */
  function personalEnd(room, cid) {
    const board = leaderboard(room);
    const idx = board.findIndex((r) => r.cid === cid);
    const p = room.players[cid];
    if (!p || idx < 0) return null;
    return { rank: idx + 1, players: board.length, value: board[idx].value, correct: p.correct, total: asked(room), bestStreak: p.bestStreak };
  }

  // ============================================================
  // LƯU KẾT QUẢ — trên máy người dẫn (CSV / lịch sử) và Google Sheet (Apps Script)
  // ============================================================
  const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+@\t\r]|^-./.test(s)) s = "'" + s; // chặn công thức khi mở bằng Excel (CSV injection); "-" đứng riêng = không trả lời
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function toCsv(room) {
    const n = asked(room);
    const unit = room.mode === 'speed' ? 'Điểm' : 'Bước';
    const head = ['Hạng', 'Biệt danh', unit, 'Số câu đúng', 'Số câu đã hỏi', 'Tỉ lệ đúng (%)', 'Chuỗi đúng dài nhất'];
    for (let i = 0; i < n; i++) head.push('C' + (i + 1));
    const lines = [head.map(csvCell).join(',')];
    leaderboard(room).forEach((row, idx) => {
      const p = room.players[row.cid];
      const cells = [idx + 1, p.name, row.value, p.correct, n, n ? Math.round((p.correct / n) * 100) : 0, p.bestStreak];
      for (let i = 0; i < n; i++) cells.push(p.log[i] === 1 ? 'Đ' : p.log[i] === 0 ? 'S' : '-');
      lines.push(cells.map(csvCell).join(','));
    });
    // Dòng cuối: tỉ lệ cả lớp đúng từng câu → giáo viên thấy câu nào cả lớp hay sai.
    const ids = activeIds(room);
    const pct = [];
    for (let i = 0; i < n; i++) {
      const ok = ids.filter((id) => room.players[id].log[i] === 1).length;
      pct.push(ids.length ? Math.round((ok / ids.length) * 100) + '%' : '');
    }
    lines.push(['', 'Cả lớp đúng', '', '', '', '', ''].concat(pct).map(csvCell).join(','));
    lines.push('');
    lines.push(['Câu', 'Nội dung', 'Đáp án đúng'].map(csvCell).join(','));
    for (let i = 0; i < n; i++) {
      const q = room.deck[i % room.deck.length];
      lines.push(['C' + (i + 1), q.text, q.options[q.correctIdx]].map(csvCell).join(','));
    }
    return '﻿' + lines.join('\r\n'); // BOM → Excel đọc đúng tiếng Việt
  }

  /** Bản tóm tắt gọn: lưu lịch sử trên máy + gửi Apps Script (1 lượt cho cả phòng). */
  function summary(room) {
    const n = asked(room);
    return {
      code: room.code, mode: room.mode, title: room.title, setKey: room.setKey,
      startedAt: room.createdAt, endedAt: room.endedAt || Date.now(), questions: n,
      players: leaderboard(room).map((row, idx) => {
        const p = room.players[row.cid];
        return { rank: idx + 1, name: p.name, value: row.value, correct: p.correct, answered: p.log.filter((x) => x === 0 || x === 1).length, bestStreak: p.bestStreak };
      }),
      perQuestion: Array.from({ length: n }, (_, i) => {
        const ids = activeIds(room);
        const q = room.deck[i % room.deck.length];
        return { text: q.text.slice(0, 200), uid: q.uid || '', correct: ids.filter((id) => room.players[id].log[i] === 1).length, of: ids.length };
      }),
    };
  }

  /** Lưu/khôi phục trạng thái phòng (máy người dẫn tải lại trang vẫn điều khiển tiếp). */
  function snapshot(room) { return JSON.stringify(room); }
  function restore(json) {
    let r;
    try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return null; }
    if (!r || r.v !== 1 || !Array.isArray(r.deck) || !r.players || !Array.isArray(r.order)) return null;
    Object.values(r.players).forEach((p) => { p.online = false; });
    if (r.phase === 'q') reveal(r); // đang dở câu → chốt luôn với câu trả lời đã nhận
    return r;
  }

  global.EduArenaRoomCore = {
    CODE_LEN, ANSWER_GRACE_MS, MAX_PLAYERS, KEY_OF,
    makeCode, normCode, peerId, cleanName, createRoom, join, leave, kick, setOnline, activeIds,
    publicQuestion, openNext, canAdvance, submit, allAnswered, answeredCount, reveal, leaderboard,
    isDone, finish, asked, personalEnd, toCsv, summary, snapshot, restore, current,
  };
})(typeof window !== 'undefined' ? window : globalThis);
