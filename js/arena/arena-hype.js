/* ============================================================
   js/arena/arena-hype.js — "bình luận viên" cho trận Đấu trường (Chơi một mình). Chỉ tính chữ, không đụng DOM.
     rivalLine(G, order)            mục tiêu trước mắt: "Còn 437 điểm nữa là vượt Mèo Wifi" / "Em dẫn đầu, hơn ..."
     commentary(G, before, order)   sau mỗi lượt: { text, climax, taunt: { id, text } } — lời bình hợp với từng trò,
                                    climax = khoảnh khắc cao trào (mỗi trận hiện 1 lần), taunt = bạn máy vừa vượt / bị vượt nói 1 câu
     before(G, order)               chụp hạng + người dẫn đầu TRƯỚC khi chấm câu để so
     CLIMAX                         chữ lớn cho từng cao trào
     say(kind, seed)                1 câu "trend" lành mạnh theo tình huống (TREND) — dùng chung cho Phòng cả lớp
   order = danh sách người chơi đã xếp hạng (arena.js ranked), không có bóng ma kỷ lục.
   Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  // Thước đo hiện cho em: [trường, đơn vị]
  const MEASURE = {
    speed: ['score', 'điểm'], gold: ['gold', 'vàng'], race: ['pos', 'bước'], survival: ['score', 'điểm'], fish: ['kg', 'kg'],
    spell: ['hp', 'máu'], heist: ['gems', 'đá quý'], dino: ['fossils', 'hoá thạch'], moon: ['km', 'nghìn km'],
  };
  // Khoảng cách coi là "sát nút" giữa em và người kế bên
  const CLOSE = { speed: 250, gold: 40, race: 1, survival: 250, fish: 4, spell: 10, heist: 15, dino: 20, moon: 25 };
  const CLIMAX = {
    race: { title: 'NƯỚC RÚT!', icon: 'fa-flag-checkered', tone: 'final', sub: 'Có người sắp về đích — tăng tốc!' },
    moon: { title: 'SẮP CHẠM MẶT TRĂNG!', icon: 'fa-rocket', tone: 'speed', sub: 'Chặng cuối — đúng nhanh để bứt lên!' },
    tug: { title: 'GIẰNG CO QUYẾT ĐỊNH!', icon: 'fa-hand-fist', tone: 'fire', sub: 'Dây sắp nghiêng hẳn về 1 đội!' },
    duel: { title: 'ĐẤU TAY ĐÔI!', icon: 'fa-khanda', tone: 'fire', sub: 'Chỉ còn 2 người trụ lại' },
    boss: { title: 'VIRUS SẮP GỤC!', icon: 'fa-virus', tone: 'up', sub: 'Dứt điểm ngay câu này!' },
    final3: { title: '3 CÂU CUỐI!', icon: 'fa-hourglass-half', tone: 'final', sub: 'Thứ hạng vẫn có thể đảo ngược' },
  };
  // Câu "trend" cho học sinh: vui, bắt kịp mạng xã hội nhưng đúng chính tả, không thô tục, không chê bai.
  // Câu sai/hết giờ luôn động viên + hướng về việc học (xem đáp án, đọc giải thích).
  const TREND = {
    correct: ['Chuẩn không cần chỉnh!', 'Đỉnh của chóp!', 'Xịn xò quá trời!', 'Ăn trọn điểm rồi nha!', 'Tuyệt cú mèo!', '10 điểm không có nhưng!', 'Kiến thức này em nắm chắc rồi!'],
    fast: ['Nhanh như một cơn gió! 🌪️', 'Nhanh hơn cả Wi-Fi trường!', 'Phản xạ đỉnh cao!', 'Vừa nhanh vừa chuẩn — quá đỉnh!'],
    streak3: ['Đang vào form rồi đó! 🔥', 'Nóng tay rồi nha!', 'Combo 3 câu — quá cháy!'],
    streak5: ['Không thể cản phá!', 'Cháy quá cả lớp ơi! 🔥', 'Đỉnh nóc, kịch trần, bay phấp phới!'],
    streak8: ['Huyền thoại sống của lớp!', 'Out trình thật sự!', 'Gánh cả phòng luôn rồi! 💪'],
    wrong: ['Không sao đâu, câu sau gỡ lại nha!', 'Chưa đúng thôi, chưa phải chưa giỏi!', 'Bình tĩnh, tự tin, không cay cú!', 'Sai một chút, học thêm một chút — đọc giải thích nhé!', 'Thua keo này, ta bày keo khác!'],
    timeout: ['Ơ kìa, đồng hồ chạy nhanh quá! ⏰', 'Lần sau chốt sớm hơn chút nha!', 'Nghĩ kỹ là tốt, nhưng nhớ canh giờ nhé!'],
    rankup: ['Lên top như diều gặp gió! 🪁', 'Bứt phá ngoạn mục!', 'Leo hạng thần tốc!'],
    leader: ['Ngôi vương gọi tên em! 👑', 'Top 1 server lớp mình!', 'Đứng đầu bảng — giữ vững phong độ nhé!'],
    out: ['Bị loại rồi nhưng vẫn luyện tiếp được — kiến thức là của mình!', 'Hết tim rồi, nhưng tinh thần thì không! Trả lời tiếp để luyện nhé.'],
    heal: ['Hồi tim thành công — sống dai quá!', 'Hồi máu rồi, chiến tiếp thôi! 💚'],
    classGreat: ['Cả lớp đỉnh nóc, kịch trần! 🎉', 'Lớp mình học bài kỹ ghê!', 'Cả lớp đồng lòng — quá xịn!'],
    classOk: ['Khá lắm cả lớp ơi!', 'Phần lớn đã đúng — cố thêm chút nữa!', 'Ổn áp rồi, câu sau bứt phá nha!'],
    classHard: ['Câu này hơi “khoai” — cùng xem giải thích nhé! 📖', 'Câu khó đây rồi — ai đúng là đỉnh thật sự!', 'Ghi nhớ câu này nha, dễ gặp lại lắm!'],
    join: ['đã vào sân!', 'sẵn sàng chiến!', 'đã có mặt — điểm danh!', 'vào phòng với khí thế ngút trời!', 'đã lên đồ, sẵn sàng!'],
    wait: ['Khởi động ngón tay đi nào! ✌️', 'Hít thở sâu — sắp bắt đầu rồi!', 'Hôm nay ai sẽ là “trùm” của lớp? 👀', 'Bình tĩnh, tự tin, chiến thắng!'],
    endWin: ['Nhà vô địch! Đỉnh nóc, kịch trần! 🏆', 'Ngôi vương đã có chủ — chính là em!'],
    endTop: ['Lên bục rồi — quá xịn! 🥈', 'Top 3 của lớp — tự hào ghê!'],
    endGood: ['Kiến thức chắc tay — tự hào ghê!', 'Đúng nhiều thế này là học bài kỹ rồi!'],
    endTry: ['Mỗi trận là một bài học — lần sau bùng nổ nha!', 'Xem lại câu sai bên dưới, lần sau chắc chắn lên hạng!'],
  };
  /** 1 câu trend theo tình huống; seed để mỗi lượt đổi câu nhưng tải lại trang vẫn ra như cũ. */
  function say(kind, seed) { const l = TREND[kind]; return l ? l[Math.abs(Math.round(seed || 0)) % l.length] : ''; }

  const TAUNT_UP = ['Vượt rồi nhé! 😜', 'Theo kịp không?', 'Tớ lên đây!', 'Hì hì, xin vượt!'];
  const TAUNT_DOWN = ['Ơ kìa!', 'Không thể nào!', 'Nhanh thế!', 'Để xem câu sau!'];

  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const nm = (p) => `${p.face} ${p.name}`;
  const pick = (list, seed) => list[Math.abs(seed) % list.length];
  const outOf = (G, p) => (G.mode === 'survival' || G.mode === 'spell' || G.mode === 'boss') && !(p.hp > 0);
  const val = (G, p) => Number(p[MEASURE[G.mode][0]]) || 0;

  function before(G, order) {
    const rank = {};
    order.forEach((p, i) => { rank[p.id] = i + 1; });
    return { rank, leader: order[0] && order[0].id };
  }

  function rivalLine(G, order) {
    const me = G.me;
    if (G.mode === 'tug') {
      const r = G.rope || 0;
      return r === 0 ? '🪢 Dây đang ở giữa — kéo nào!' : `🪢 Dây lệch về ${r > 0 ? 'Đội Đỏ (đội em)' : 'Đội Xanh'} ${Math.abs(r)}/${C.TUG_GOAL} vạch`;
    }
    if (G.mode === 'boss') return G.boss && G.boss.hp > 0 && G.boss.hp < G.boss.max ? `🦠 Trùm Virus còn ${Math.ceil((G.boss.hp / G.boss.max) * 100)}% máu` : '';
    if (!MEASURE[G.mode] || outOf(G, me) || !(G.log && G.log.length)) return ''; // chưa trả lời câu nào: chưa có gì để so
    const unit = MEASURE[G.mode][1];
    const list = order.filter((p) => p.me || !outOf(G, p));
    const i = list.indexOf(me);
    if (i < 0) return '';
    const toGoal = G.mode === 'race' ? ` · còn ${Math.max(0, G.goal - me.pos)} bước về đích`
      : G.mode === 'moon' ? ` · còn ${Math.max(0, C.MOON_KM - me.km)} nghìn km` : '';
    if (i > 0) {
      const t = list[i - 1];
      if (G.mode === 'survival' && t.hp > me.hp) return `🎯 ${nm(t)} hơn em ${t.hp - me.hp} tim — giữ tim, gỡ điểm!`;
      if (G.mode === 'spell') return t.hp > me.hp ? `🎯 ${nm(t)} nhiều hơn em ${t.hp - me.hp} máu — nhắm phép vào bạn ấy!` : `⚔️ Em đang ngang máu ${nm(t)} — giữ khiên!`;
      const gap = val(G, t) - val(G, me);
      return gap <= 0 ? `⚔️ Em đang ngang ${nm(t)} — vượt lên nào!`
        : `🎯 Còn ${fmt(gap)} ${unit} nữa là vượt ${nm(t)}${i === 1 ? ' để dẫn đầu' : ` (hạng ${i})`}`;
    }
    if (list.length < 2) return toGoal ? `👑 Em dẫn đầu${toGoal}` : '';
    const lead = val(G, me) - val(G, list[1]);
    return lead > 0 ? `👑 Em dẫn đầu, hơn ${nm(list[1])} ${fmt(lead)} ${unit}${toGoal}` : `👑 Em đang đứng đầu — ${nm(list[1])} bám sát!${toGoal}`;
  }

  /** Lời bình sau lượt. Ưu tiên: cao trào của trò → đổi ngôi đầu → em và bạn kế bên sát nút. */
  function commentary(G, b, order) {
    const me = G.me, out = { text: '', climax: '', taunt: null };
    const alive = G.players.filter((p) => !p.ghost && !outOf(G, p));
    const left = G.mode === 'race' || G.mode === 'moon' ? -1 : G.maxRounds - G.i - 1; // số câu còn lại sau câu này

    if (G.mode === 'race') {
      const top = alive.slice().sort((x, y) => y.pos - x.pos)[0];
      const d = top ? G.goal - top.pos : 99;
      if (d > 0 && d <= 2) {
        const close = alive.filter((p) => G.goal - p.pos <= 2);
        out.climax = 'race';
        out.text = close.length > 1 && close.includes(me) ? `🏁 Sát nút! Em và ${nm(close.find((p) => !p.me))} cùng sắp về đích!`
          : top.me ? `🏁 Em chỉ còn ${d} bước nữa là về đích!` : `🏁 ${nm(top)} chỉ còn ${d} bước nữa là về đích — đuổi theo!`;
      }
    } else if (G.mode === 'moon') {
      const top = alive.filter((p) => p.km < C.MOON_KM).sort((x, y) => y.km - x.km)[0];
      if (top && top.km >= C.MOON_KM * 0.75) {
        out.climax = 'moon';
        out.text = `🌕 ${top.me ? 'Em' : nm(top)} chỉ còn ${C.MOON_KM - top.km} nghìn km nữa là chạm Mặt Trăng!`;
      }
    } else if (G.mode === 'tug') {
      const r = G.rope || 0;
      if (Math.abs(r) >= C.TUG_GOAL * 0.7 && Math.abs(r) < C.TUG_GOAL) {
        out.climax = 'tug';
        out.text = r > 0 ? `💪 Đội Đỏ chỉ còn ${C.TUG_GOAL - r} vạch nữa là thắng — giữ chặt dây!`
          : `😱 Đội Xanh sắp kéo đổ đội em — còn ${C.TUG_GOAL + r} vạch, kéo lại ngay!`;
      } else if (r) out.text = r > 0 ? '🪢 Đội Đỏ đang chiếm thế — kéo đều tay!' : '🪢 Đội Xanh đang nhỉnh hơn — trả lời nhanh để kéo gấp đôi!';
    } else if (G.mode === 'boss') {
      const pct = G.boss.max ? G.boss.hp / G.boss.max : 1;
      if (G.boss.hp > 0 && pct <= 0.25) { out.climax = 'boss'; out.text = `🦠 Virus chỉ còn ${Math.ceil(pct * 100)}% máu — cả đội dứt điểm!`; }
      else if (me.hp === 1) out.text = '❤️ Em chỉ còn 1 tim — bình tĩnh đọc kỹ đề!';
      else if (G.boss.lastHeal) out.text = '🧬 Virus vừa hồi máu — cả đội cần trả lời đúng nhiều hơn!';
    } else if ((G.mode === 'survival' || G.mode === 'spell') && !outOf(G, me)) {
      if (alive.length === 2 && G.players.filter((p) => !p.ghost).length > 2) {
        out.climax = 'duel';
        out.text = `⚔️ Chỉ còn em và ${nm(alive.find((p) => !p.me))} — ai sai trước là thua!`;
      } else if (G.mode === 'survival' && me.hp === 1) out.text = '❤️ Em chỉ còn 1 tim — đúng liền 3 câu để hồi tim!';
      else if (G.mode === 'spell' && me.hp <= 30) out.text = '🛡️ Máu em đang thấp — nhớ dùng Khiên hoặc Hồi máu!';
    }

    if (!out.climax && left === 3 && G.maxRounds >= 6) { out.climax = 'final3'; out.text = out.text || '⏳ Chỉ còn 3 câu — thứ hạng vẫn có thể đảo ngược!'; }

    // Đổi ngôi đầu giữa 2 bạn máy (em lên/mất ngôi đầu đã có chữ lớn riêng)
    const lead = order[0];
    if (!out.text && lead && b.leader && lead.id !== b.leader && !lead.me && b.leader !== 'me' && G.mode !== 'tug' && G.mode !== 'boss') {
      out.text = `📣 ${nm(lead)} vừa vượt lên dẫn đầu!`;
    }
    // Có người bám sát SAU LƯNG em (người phía trên đã có ở dòng mục tiêu; em đứng đầu thì dòng mục tiêu đã nói người thứ 2)
    if (!out.text && CLOSE[G.mode] !== undefined && !outOf(G, me)) {
      const i = order.indexOf(me), nb = order[i + 1];
      const gap = nb && !outOf(G, nb) ? val(G, me) - val(G, nb) : Infinity;
      if (i > 0 && gap <= CLOSE[G.mode]) {
        out.text = gap <= 0 ? `🔥 ${nm(nb)} đang ngang em — câu sau quyết định!`
          : `🔥 ${nm(nb)} bám sát sau lưng, chỉ kém em ${fmt(gap)} ${MEASURE[G.mode][1]}!`;
      }
    }

    // Bạn máy vừa vượt em / bị em vượt → nói 1 câu trên đầu
    if (G.mode !== 'tug' && G.mode !== 'boss' && b.rank.me) {
      const myNow = order.indexOf(me) + 1;
      const passedMe = order.find((p) => p.bot && b.rank[p.id] > b.rank.me && order.indexOf(p) + 1 < myNow);
      const passedByMe = order.find((p) => p.bot && b.rank[p.id] < b.rank.me && order.indexOf(p) + 1 > myNow);
      if (passedMe) out.taunt = { id: passedMe.id, text: pick(TAUNT_UP, G.i + passedMe.name.length), hot: false };
      else if (passedByMe) out.taunt = { id: passedByMe.id, text: pick(TAUNT_DOWN, G.i + passedByMe.name.length), hot: true };
    }
    return out;
  }

  global.EduArenaHype = { before, rivalLine, commentary, say, CLIMAX, MEASURE, TREND };
})(typeof window !== 'undefined' ? window : globalThis);
