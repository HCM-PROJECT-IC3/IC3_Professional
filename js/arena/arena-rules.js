/* ============================================================
   js/arena/arena-rules.js — "Luật chơi" từng chế độ Đấu trường (15/11/2026). Dữ liệu thuần, không DOM, không mạng.
     RULES[mode] = { tags: [2–3 nhãn trong TAGS], steps: [[icon, tiêu đề, 1 câu] × 3], win: điều kiện thắng,
                     twist: khoảnh khắc lật kèo của chế độ — hiện ở thẻ Luật chơi và màn mở trận 3‑2‑1 }
     card(mode, role)  HTML thẻ Luật chơi (arena.js § paintModes)
   Số liệu lấy từ EduArenaCore (LIVES, TUG_GOAL, MOON_KM...) → đổi luật trong arena-core.js là thẻ tự đúng theo.
   Icon ghi TÊN ĐẦY ĐỦ 'fa-…' (scripts/build-fa-subset.py chỉ dò chuỗi fa-<tên>). Không nhắc tên sản phẩm khác.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore || {};
  const n = (v, d) => (typeof v === 'number' ? v : d);
  const LIVES = n(C.LIVES, 3), HEAL = n(C.HEAL_EVERY, 3), HP = n(C.SPELL_HP, 100), TUG = n(C.TUG_GOAL, 100);
  const MOON = n(C.MOON_KM, 384), FALL = n(C.MOON_FALL, 30), FINE = Math.round(n(C.DINO_FINE, 0.4) * 100);
  const CHEAT = n(C.DINO_CHEAT, 3), VAULT = n(C.VAULT_LEN, 3), STEAL = n(C.HEIST_STEAL, 0.5), KICK = n(C.KICK_SURE, 3);

  const TAGS = {
    reflex: { label: 'Phản xạ', fa: 'fa-bolt' },
    tactic: { label: 'Chiến thuật', fa: 'fa-chess-knight' },
    luck: { label: 'May rủi', fa: 'fa-dice' },
    versus: { label: 'Đối đầu', fa: 'fa-user-group' },
    team: { label: 'Đồng đội', fa: 'fa-people-group' },
    endure: { label: 'Bền bỉ', fa: 'fa-heart' },
    calm: { label: 'Thư giãn', fa: 'fa-mug-hot' },
  };

  const RULES = {
    speed: {
      tags: ['reflex', 'versus'],
      steps: [
        ['fa-bolt', 'Trả lời nhanh', 'Đúng càng sớm càng nhiều điểm, mỗi câu tới 1.000.'],
        ['fa-fire', 'Giữ chuỗi', 'Đúng liền nhiều câu được cộng thêm điểm thưởng.'],
        ['fa-trophy', 'Về nhất', 'Điểm cao nhất sau câu cuối thắng.'],
      ],
      win: 'Điểm cao nhất sau câu cuối',
      twist: '3 câu cuối: một lần trả lời nhanh vẫn đủ đảo thứ hạng.',
    },
    gold: {
      tags: ['luck', 'tactic'],
      steps: [
        ['fa-circle-check', 'Trả lời đúng', 'Không giới hạn giờ, đúng mới được mở rương.'],
        ['fa-box-open', 'Chọn 1 trong 3 rương', 'Rương có thể nhân vàng, lấy vàng của bạn hoặc đổi vàng.'],
        ['fa-coins', 'Giữ vàng', 'Nhiều vàng nhất khi hết câu thắng.'],
      ],
      win: 'Nhiều vàng nhất khi hết câu',
      twist: 'Một rương đổi vàng có thể đưa người cuối bảng lên đầu.',
    },
    race: {
      tags: ['reflex', 'versus'],
      steps: [
        ['fa-circle-check', 'Trả lời đúng', 'Mỗi câu đúng tiến 1 bước.'],
        ['fa-forward', 'Tăng tốc', 'Câu đúng liền thứ 3 tiến luôn 2 bước.'],
        ['fa-flag-checkered', 'Về đích', 'Ai chạm vạch đích trước thắng.'],
      ],
      win: 'Chạm vạch đích trước',
      twist: 'Nước rút: khi có người sắp về đích, mỗi câu đều quyết định.',
    },
    survival: {
      tags: ['endure', 'versus'],
      steps: [
        ['fa-heart', `${LIVES} tim`, 'Trả lời sai mất 1 tim.'],
        ['fa-kit-medical', 'Hồi tim', `Đúng liền ${HEAL} câu hồi lại 1 tim.`],
        ['fa-shield-halved', 'Trụ lại', 'Người còn tim cuối cùng thắng.'],
      ],
      win: 'Người còn tim cuối cùng',
      twist: 'Còn 2 người là vào đấu tay đôi, sai 1 câu có thể bị loại.',
    },
    fish: {
      tags: ['luck', 'calm'],
      steps: [
        ['fa-circle-check', 'Trả lời đúng', 'Mỗi câu đúng được thả câu 1 lần.'],
        ['fa-fish', 'Câu cá', 'Cá rô vài ký, cá mập vài chục ký, cá voi hiếm hơn nhiều.'],
        ['fa-weight-hanging', 'Cộng cân', 'Tổng cân nặng cao nhất thắng.'],
      ],
      win: 'Tổng cân nặng cao nhất',
      twist: 'Mồi thần nhân đôi 3 lần câu tiếp theo; một con cá voi lật được cả bảng.',
    },
    tug: {
      tags: ['team', 'reflex'],
      steps: [
        ['fa-people-group', 'Chia 2 đội', 'Đội Đỏ đấu Đội Xanh.'],
        ['fa-people-pulling', 'Kéo dây', 'Câu đúng kéo dây về phía đội mình, đúng nhanh kéo mạnh hơn.'],
        ['fa-flag', 'Thắng', `Kéo lệch ${TUG} vạch là thắng ngay; hết câu thì dây nghiêng về đội nào, đội đó thắng.`],
      ],
      win: `Kéo lệch ${TUG} vạch, hoặc dây nghiêng về đội mình khi hết câu`,
      twist: 'Dây đã nghiêng sát vạch vẫn kéo ngược lại được nếu cả đội đúng nhanh.',
    },
    spell: {
      tags: ['tactic', 'versus'],
      steps: [
        ['fa-circle-check', 'Trả lời đúng', `Mỗi người có ${HP} máu.`],
        ['fa-hat-wizard', 'Chọn phép', 'Cầu lửa, sấm sét, khiên hoặc hồi máu; trả lời nhanh phép mạnh hơn.'],
        ['fa-shield-halved', 'Trụ lại', 'Người còn máu cuối cùng thắng.'],
      ],
      win: 'Người còn máu cuối cùng',
      twist: 'Khiên đúng lúc chặn trọn một đòn; còn 2 người là đấu tay đôi.',
    },
    heist: {
      tags: ['tactic', 'versus'],
      steps: [
        ['fa-gem', 'Đào đá quý', 'Mỗi câu đúng đào thêm đá quý vào két.'],
        ['fa-key', 'Đoán mã', `Đoán đúng mã ${VAULT} ký hiệu của bạn là lấy ${Math.round(STEAL * 100)}% kho của bạn đó.`],
        ['fa-vault', 'Giữ két', 'Thấy bị dò mã thì đổi mã. Nhiều đá quý nhất thắng.'],
      ],
      win: 'Nhiều đá quý nhất',
      twist: 'Một lần phá két đúng lúc lấy đi nửa kho của người dẫn đầu.',
    },
    dino: {
      tags: ['luck', 'tactic'],
      steps: [
        ['fa-circle-check', 'Trả lời đúng', 'Được đào 1 trong 3 tảng đá.'],
        ['fa-bone', 'Đào hoá thạch', `Có thể ăn gian để được gấp ${CHEAT}, nhưng bị kiểm tra thì mất ${FINE}%.`],
        ['fa-magnifying-glass', 'Kiểm tra bạn', 'Bắt được bạn ăn gian thì lấy hoá thạch của bạn.'],
      ],
      win: 'Nhiều hoá thạch nhất',
      twist: 'Người dẫn đầu ăn gian một lần bị bắt là rơi khỏi ngôi đầu.',
    },
    moon: {
      tags: ['reflex', 'endure'],
      steps: [
        ['fa-rocket', 'Bay lên', 'Đúng càng nhanh, tên lửa bay càng cao.'],
        ['fa-layer-group', 'Bật tầng đẩy', 'Đúng liền 3 câu ×1,5, liền 5 câu ×2.'],
        ['fa-moon', 'Chạm Mặt Trăng', `Tới ${MOON} nghìn km trước thì thắng. Sai tụt ${FALL} nghìn km, không dưới trạm đã qua.`],
      ],
      win: `Chạm Mặt Trăng (${MOON} nghìn km) trước`,
      twist: 'Chặng cuối: một chuỗi đúng với tầng đẩy ×2 vượt được cả người đang dẫn.',
    },
    boss: {
      tags: ['team', 'endure'],
      steps: [
        ['fa-people-group', 'Chung đội', 'Em và 3 bạn máy cùng đánh Trùm Virus.'],
        ['fa-hand-fist', 'Ra đòn', 'Đúng nhanh, đúng liền đánh mạnh hơn; sai bị đánh trả mất tim.'],
        ['fa-virus', 'Hạ Virus', 'Hết máu Virus là cả đội thắng.'],
      ],
      win: 'Cả đội hạ Trùm Virus',
      twist: 'Đội đúng chưa tới một nửa thì Virus hồi máu; Virus sắp gục thì chí mạng dễ hơn, dồn sức là thắng.',
    },
    goal: {
      tags: ['reflex', 'versus'],
      steps: [
        ['fa-circle-check', 'Trả lời đúng', 'Mỗi câu đúng được sút 1 quả penalty.'],
        ['fa-futbol', 'Sút', 'Trả lời càng nhanh, thủ môn càng khó cản.'],
        ['fa-bullseye', 'Chắc chắn vào', `Đúng liền ${KICK} câu thì cú sút chắc chắn vào lưới.`],
      ],
      win: 'Ghi nhiều bàn nhất',
      twist: 'Sai là mất lượt sút: một câu chậm có thể mất trắng một bàn.',
    },
    board: {
      tags: ['team', 'tactic'],
      steps: [
        ['fa-table-cells', 'Chiếu bảng', 'Bảng ô 100–500 hiện trên màn hình lớn.'],
        ['fa-hand-pointer', 'Chọn ô', 'Các đội lần lượt chọn ô, ô càng to câu càng khó.'],
        ['fa-chart-column', 'Cộng điểm', 'Đúng được điểm của ô. Học sinh không cần máy.'],
      ],
      win: 'Đội nhiều điểm nhất khi hết ô',
      twist: 'Còn vài ô cuối, một ô 500 đủ lật ngược cả bảng.',
    },
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** HTML thẻ Luật chơi cho chế độ `mode` (tên hiện = `name`). Không có luật → ''. */
  function card(mode, name, cover) {
    const r = RULES[mode];
    if (!r) return '';
    // cover: HTML tranh bìa của thẻ đang chọn (arena-covers.js) — phóng to làm "sân đấu", chạy liên tục.
    const stage = cover ? `<div class="ar-stage m-${esc(mode)}" aria-hidden="true"><div class="ar-stage-art">${cover}</div>
      <span class="ar-stage-win"><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${esc(r.win || '')}</span></div>` : '';
    return `${stage}<div class="ar-rules-body">
      <div class="ar-rules-head"><b>${esc(name)}</b><span class="ar-rules-tags">${r.tags.map((t) => `<span class="ar-rules-tag"><i class="fa-solid ${TAGS[t].fa}" aria-hidden="true"></i>${esc(TAGS[t].label)}</span>`).join('')}</span></div>
      <ol class="ar-rules-steps">${r.steps.map(([fa, t, d]) => `<li><i class="fa-solid ${fa}" aria-hidden="true"></i><div><b>${esc(t)}</b> <span>${esc(d)}</span></div></li>`).join('')}</ol>
      <p class="ar-rules-twist"><b>Gay cấn nhất:</b> ${esc(r.twist)}</p></div>`;
  }

  global.EduArenaRules = { TAGS, RULES, card };
})(typeof window !== 'undefined' ? window : globalThis);
