/* ============================================================
   js/arena/arena-room-hype.js — không khí "gameshow" cho Phòng cả lớp. Chỉ tính chữ, không đụng DOM, không mạng.
   Mọi thứ tính từ dữ liệu ĐÃ CÓ: máy người dẫn có cả phòng, máy học sinh có gói 'reveal'/'end' như cũ
   → KHÔNG thêm tin nhắn, không thêm byte nào qua đường dự phòng Firestore.

   Máy người dẫn (màn chiếu):
     snap(room)                       chụp người dẫn đầu / số người còn trụ TRƯỚC khi chốt câu
     revealStory(room, prev)          sau khi chốt: { mood, mc, shouts:[{icon,label,text}], climax }
     openBanner(room, pending)        chữ lớn khi mở câu: BẮT ĐẦU! · CÂU CUỐI! · cao trào đang chờ
     endAwards(room)                  danh hiệu cuối trận: Chuỗi dài nhất · Chính xác nhất · Tia chớp · Bứt phá
     joinLine(name, face, seed)       dòng chào người mới vào sảnh
   Máy học sinh:
     studentRival(m, y)               mục tiêu trước mắt từ Top 5 (gói reveal)
     studentCheer(m, y, fast)         1 câu trend hợp tình huống: đúng nhanh, chuỗi, lên hạng, sai, hết giờ, bị loại
     endCheer(mode, y)                câu chúc cuối trận + huy hiệu tự tính
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const R = global.EduArenaRoomCore;
  const HY = global.EduArenaHype;
  const UNIT = { speed: 'điểm', race: 'bước', survival: 'điểm', tug: 'lực kéo', spell: 'sát thương', heist: 'đá quý' };
  const TAGLINE = {
    speed: 'Đúng + nhanh = nhiều điểm. Chuỗi đúng có thẻ thưởng!',
    race: 'Mỗi câu đúng tiến 1 bước — ai về đích trước?',
    survival: `Mỗi bạn ${C.LIVES} tim — người trụ lại cuối cùng thắng!`,
    tug: 'Đội Đỏ đấu Đội Xanh — đồng lòng kéo dây!',
    spell: 'Trả lời đúng để tung phép — người trụ lại thắng!',
    heist: 'Đào đá quý, phá két, giữ két — ai giàu nhất?',
  };
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
  const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
  const who = (p) => `${p.face} ${p.name}`;
  const alive = (room) => R.activeIds(room).filter((id) => room.players[id].hp > 0);
  const lives = (mode) => mode === 'survival' || mode === 'spell';

  function snap(room) {
    const b = R.leaderboard(room);
    return { leader: b[0] ? b[0].cid : '', alive: lives(room.mode) ? alive(room).length : 0, rope: room.rope || 0 };
  }

  function revealStory(room, prev) {
    const L = room.last, ids = R.activeIds(room), board = R.leaderboard(room);
    const res = L.results || {};
    const P = (id) => room.players[id];
    const shouts = [];
    // Tia chớp: đúng nhanh nhất câu này
    let fast = null;
    Object.keys(res).forEach((id) => {
      const a = room.answers[id];
      if (res[id].ok && a && (!fast || a.ms < fast.ms)) fast = { id, ms: a.ms };
    });
    if (fast) shouts.push({ icon: '⚡', label: 'Tia chớp', text: `${who(P(fast.id))} · ${sec(fast.ms)} giây` });
    // Bứt phá: lên nhiều hạng nhất
    const up = Object.keys(res).filter((id) => res[id].up >= 2).sort((a, b) => res[b].up - res[a].up)[0];
    if (up && room.mode !== 'tug') shouts.push({ icon: '🚀', label: 'Bứt phá', text: `${who(P(up))} +${res[up].up} hạng` });
    // Chuỗi nóng
    const hot = Object.keys(res).filter((id) => res[id].streak >= 3).sort((a, b) => res[b].streak - res[a].streak)[0];
    if (hot) shouts.push({ icon: '🔥', label: 'Chuỗi nóng', text: `${who(P(hot))} · ${res[hot].streak} câu liền` });
    // Ngôi đầu đổi chủ
    if (prev && prev.leader && board[0] && board[0].cid !== prev.leader && room.mode !== 'tug' && room.i > 0) {
      shouts.push({ icon: '👑', label: 'Ngôi đầu đổi chủ', text: who(board[0]) });
    }
    if (room.mode === 'survival') {
      const outNow = Object.values(res).filter((r) => r.out && !r.wasOut).length;
      const healed = Object.values(res).filter((r) => r.healed).length;
      if (outNow) shouts.push({ icon: '💀', label: 'Bị loại', text: `${outNow} bạn · còn ${alive(room).length} chiến binh` });
      if (healed) shouts.push({ icon: '💚', label: 'Hồi tim', text: `${healed} bạn` });
    }
    if (room.mode === 'tug' && L.delta) shouts.push({ icon: '🪢', label: 'Dây dịch', text: `${Math.abs(L.delta)} vạch về ${C.TEAMS[L.delta > 0 ? 'red' : 'blue'].name}` });

    // Cả lớp làm câu này thế nào
    const pct = L.answered ? (L.right ?? 0) / L.answered : 0;
    const seed = room.i + (L.right || 0);
    const mood = !L.answered ? 'Chưa ai kịp trả lời câu này — câu sau nhanh tay nha!'
      : pct >= 0.8 ? HY.say('classGreat', seed) : pct >= 0.45 ? HY.say('classOk', seed) : HY.say('classHard', seed);

    // Bình luận viên + cao trào theo từng trò
    let mc = '', climax = '';
    const left = room.mode === 'race' ? -1 : room.total - room.i - 1;
    if (room.mode === 'race') {
      const top = board[0];
      const d = top ? room.goal - top.value : 99;
      if (d > 0 && d <= 2) {
        climax = 'race';
        const close = board.filter((r) => room.goal - r.value <= 2);
        mc = close.length > 1 ? `🏁 Sát nút! ${close.slice(0, 3).map(who).join(', ')} cùng sắp về đích!` : `🏁 ${who(top)} chỉ còn ${d} bước nữa là về đích!`;
      }
    } else if (room.mode === 'tug') {
      const r = room.rope || 0;
      if (Math.abs(r) >= C.TUG_GOAL * 0.7 && Math.abs(r) < C.TUG_GOAL) {
        climax = 'tug';
        mc = `💪 ${C.TEAMS[r > 0 ? 'red' : 'blue'].name} chỉ còn ${C.TUG_GOAL - Math.abs(r)} vạch nữa là thắng — ${C.TEAMS[r > 0 ? 'blue' : 'red'].name} kéo lại ngay!`;
      } else if (r) mc = `🪢 ${C.TEAMS[r > 0 ? 'red' : 'blue'].name} đang chiếm thế ${Math.abs(r)} vạch — trả lời nhanh để kéo gấp đôi!`;
    } else if (lives(room.mode)) {
      const a = alive(room);
      if (a.length === 2 && ids.length > 2) { climax = 'duel'; mc = `⚔️ Chỉ còn ${who(P(a[0]))} và ${who(P(a[1]))} — ai sai trước là thua!`; }
      else if (a.length >= 3 && a.length <= 5 && prev && prev.alive > a.length) mc = `🔥 Chỉ còn ${a.length} chiến binh trụ lại!`;
    } else if (board.length >= 2 && room.i > 0) {
      const gap = board[0].value - board[1].value;
      if (gap <= (room.mode === 'heist' ? 15 : 250)) mc = `🔥 ${who(board[0])} và ${who(board[1])} chỉ cách nhau ${fmt(gap)} ${UNIT[room.mode]} — nghẹt thở!`;
    }
    if (!climax && left === 3 && room.total >= 6) { climax = 'final3'; mc = mc || '⏳ Chỉ còn 3 câu — thứ hạng vẫn có thể đảo ngược!'; }
    return { mood, mc, shouts: shouts.slice(0, 4), climax };
  }

  /** Chữ lớn khi mở câu (màn chiếu). pending = cao trào ghi nhận ở lượt trước. */
  function openBanner(room, pending) {
    if (room.i === 0) return { title: 'BẮT ĐẦU!', sub: TAGLINE[room.mode] || '', tone: 'speed', icon: 'fa-play' };
    if (room.mode !== 'race' && room.total > 1 && room.i === room.total - 1) return { title: 'CÂU CUỐI!', sub: 'Câu quyết định thứ hạng — dồn hết sức nào!', tone: 'final', icon: 'fa-flag-checkered' };
    if (pending && HY.CLIMAX[pending]) return HY.CLIMAX[pending];
    return null;
  }

  function endAwards(room) {
    const rows = R.activeIds(room).map((id) => Object.assign({ id }, room.players[id])).filter((p) => p.correct > 0 || p.bestStreak > 0);
    const best = (score, min) => rows.filter((p) => score(p) >= min).sort((a, b) => score(b) - score(a))[0];
    const out = [];
    const s = best((p) => p.bestStreak || 0, 3);
    if (s) out.push({ icon: '🔥', label: 'Chuỗi dài nhất', face: s.face, name: s.name, detail: `${s.bestStreak} câu liền` });
    const c = best((p) => p.correct || 0, 1);
    if (c) out.push({ icon: '🎯', label: 'Chính xác nhất', face: c.face, name: c.name, detail: `đúng ${c.correct}/${R.asked(room)} câu` });
    const minN = Math.max(1, Math.ceil(R.asked(room) / 2)); // Tia chớp: phải đúng ít nhất nửa số câu
    const f = rows.filter((p) => (p.fastN || 0) >= minN).sort((a, b) => a.fastMs / a.fastN - b.fastMs / b.fastN)[0];
    if (f) out.push({ icon: '⚡', label: 'Tia chớp', face: f.face, name: f.name, detail: `trung bình ${sec(f.fastMs / f.fastN)} giây/câu đúng` });
    const u = best((p) => p.bestUp || 0, 3);
    if (u && room.mode !== 'tug') out.push({ icon: '🚀', label: 'Bứt phá', face: u.face, name: u.name, detail: `+${u.bestUp} hạng trong 1 câu` });
    return out;
  }

  function joinLine(name, face, seed) { return `${face} ${name} ${HY.say('join', seed)}`; }

  // ── Máy học sinh ──
  function studentRival(m, y) {
    if (!y || !y.rank) return '';
    if (m.mode === 'tug') {
      const lead = (y.team === 'blue' ? -1 : 1) * (m.rope || 0);
      if (Math.abs(lead) >= C.TUG_GOAL) return lead > 0 ? '🏆 Đội em đã kéo tới vạch — thắng rồi!' : '🪢 Đội bạn đã kéo tới vạch — trận sau phục thù nhé!';
      return lead > 0 ? `🪢 Đội em đang dẫn ${lead} vạch — giữ chặt dây!` : lead < 0 ? `🪢 Đội em đang kém ${-lead} vạch — kéo lại nào!` : '🪢 Hai đội đang cân bằng!';
    }
    const top = m.top || [], unit = UNIT[m.mode];
    if (lives(m.mode)) {
      if (y.wasOut || y.out) return '';
      return y.rank === 1 ? '👑 Em đang đứng đầu — trụ vững nhé!' : `🎯 Em đang hạng ${y.rank} — trụ vững để leo lên!`;
    }
    if (y.rank === 1) {
      const gap = top[1] ? y.value - top[1].value : 0;
      return top[1] ? `👑 Em dẫn đầu, hơn ${who(top[1])} ${fmt(gap)} ${unit}` : '👑 Em đang dẫn đầu!';
    }
    if (y.rank <= top.length && top[y.rank - 2]) {
      const t = top[y.rank - 2], gap = t.value - y.value;
      return gap > 0 ? `🎯 Còn ${fmt(gap)} ${unit} nữa là vượt ${who(t)}${y.rank === 2 ? ' để dẫn đầu' : ''}` : `⚔️ Em đang ngang ${who(t)} — vượt lên nào!`;
    }
    const last = top[top.length - 1];
    return last ? `🎯 Còn ${fmt(Math.max(1, last.value - y.value))} ${unit} nữa là vào Top ${top.length}` : '';
  }

  /** fast = em trả lời trong 30% thời gian đầu (máy em tự đo lúc bấm). */
  function studentCheer(m, y, fast) {
    if (!y) return { text: '', tone: '' };
    const seed = (m.i || 0) * 7 + (y.rank || 0);
    if (y.out && !y.wasOut) return { text: HY.say('out', seed), tone: 'down' };
    if (y.wasOut) return { text: '', tone: '' };
    if (!y.ok) return { text: HY.say(y.k === null || y.k === undefined ? 'timeout' : 'wrong', seed), tone: 'down' };
    if (y.healed) return { text: HY.say('heal', seed), tone: 'up' };
    if (y.streak >= 8 && y.streak % 4 === 0) return { text: HY.say('streak8', seed), tone: 'fire' };
    if (y.streak === 5) return { text: HY.say('streak5', seed), tone: 'fire' };
    if (y.streak === 3) return { text: HY.say('streak3', seed), tone: 'fire' };
    if (y.rank === 1 && y.up > 0) return { text: HY.say('leader', seed), tone: 'gold' };
    if (y.up >= 2) return { text: HY.say('rankup', seed), tone: 'up' };
    return { text: HY.say(fast ? 'fast' : 'correct', seed), tone: 'up' };
  }

  function endCheer(mode, y) {
    if (!y) return { text: '', badges: [] };
    const pct = y.total ? y.correct / y.total : 0;
    const out = (mode === 'survival' && !(y.hp > 0)) || (mode === 'spell' && !(y.mp > 0));
    const podium = y.rank <= 3 && (y.players || 0) >= 4; // phòng 3 người: về bét không gọi là "lên bục"
    const text = y.rank === 1 && !out ? HY.say('endWin', y.correct) : podium && !out ? HY.say('endTop', y.correct)
      : pct >= 0.7 ? HY.say('endGood', y.correct) : HY.say('endTry', y.correct);
    const badges = [];
    if (y.total && y.correct === y.total) badges.push('💯 Không sai câu nào');
    if (y.bestStreak >= 5) badges.push(`🔥 Chuỗi ${y.bestStreak} câu`);
    if (y.rank === 1 || podium) badges.push(['', '🥇 Quán quân', '🥈 Á quân', '🥉 Hạng ba'][y.rank]);
    if (pct >= 0.8 && y.total >= 5) badges.push('📚 Học bài kỹ');
    return { text, badges };
  }

  global.EduArenaRoomHype = { snap, revealStory, openBanner, endAwards, joinLine, studentRival, studentCheer, endCheer, TAGLINE };
})(typeof window !== 'undefined' ? window : globalThis);
