/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  js/gamification.js — XP · Streak · Huy hiệu cho EduQuiz         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Module độc lập, KHÔNG đụng vào quiz-engine.js — chỉ đọc kết quả bài
 * làm (đã có sẵn trong `rec` mà saveRecord() tạo ra) và tự quản lý
 * state riêng trong localStorage key "eduquiz_gamestate".
 *
 * localStorage là NGUỒN DUY NHẤT — mini-game KHÔNG ghi/đọc Firestore
 * (trước đây recordGameSession() ghi phụ vào "game_sessions", nhưng
 * firestore.rules chỉ cho admin ghi collection đó nên mọi lượt chơi của
 * học sinh đều tốn 1 request bị từ chối, kèm tải Firebase SDK + App
 * Check vào từng game). XP, nhiệm vụ ngày, huy hiệu đều tính tại máy.
 *
 * Kết thúc 1 lượt chơi, recordGameSession() tự hiện THẺ PHẦN THƯỞNG
 * (+XP, thanh cấp độ, lên cấp, huy hiệu mới, nhiệm vụ hôm nay) — các
 * game không cần tự vẽ gì thêm. Truyền session.showReward=false để tắt.
 *
 * Cách dùng ở trang khác (vd. ic3-dashboard.html):
 *   const state = EduGamification.getState();
 *   // state.xp, state.level, state.streak, state.badges: string[]
 *
 * Cách hiển thị nhanh trong lobby (index.html), thêm vào cuối <body>:
 *   <script src="js/gamification.js"></script>
 *   <script>EduGamification.renderInto('#lobbyGameStrip');</script>
 *
 * Cách 1 mini-game ghi nhận lượt chơi (Phase 4+, khi game đó được build):
 *   EduGamification.recordGameSession('pz-defense', {
 *     score: 82, scoreType: 'percent', accuracy: 82,
 *     correctAnswers: 41, wrongAnswers: 9, durationSec: 240,
 *     studentName, studentClass, studentSchool, // lấy từ form lobby đang chọn
 *   });
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'eduquiz_gamestate';
  const XP_PER_CORRECT = 10;
  const XP_PER_MINITEST_DONE = 50;
  const XP_PER_PERFECT_SCORE = 100; // thêm, cộng dồn cùng XP_PER_MINITEST_DONE
  const XP_PER_GAME_SESSION = 20; // XP cơ bản cho 1 lượt chơi mini-game xong (Phase 3+)
  // Nhiệm vụ hằng ngày: chơi DAILY_GAME_GOAL lượt mini-game → thưởng 1 lần/ngày.
  const DAILY_GAME_GOAL = 3;
  const XP_DAILY_QUEST_BONUS = 30;

  const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

  // "label" hiện qua showToast() (js/quiz-engine.js, "Huy hiệu mới: ...")
  // vốn dùng textContent (không innerHTML) để tránh phải escape thủ công
  // — nên KHÔNG nhét icon Font Awesome vào đây được, bỏ hẳn emoji.
  const BADGE_DEFS = [
    { id: 'first_quiz',    label: 'Bài đầu tiên',     check: s => s.totalQuizzes >= 1 },
    { id: 'streak_3',      label: '3 ngày liên tiếp', check: s => s.streak >= 3 },
    { id: 'streak_7',      label: '7 ngày liên tiếp', check: s => s.streak >= 7 },
    { id: 'perfect_score', label: 'Điểm tuyệt đối',   check: s => s.perfectScores >= 1 },
    { id: 'ten_quizzes',   label: '10 bài đã làm',    check: s => s.totalQuizzes >= 10 },
    { id: 'first_game',    label: 'Lượt chơi đầu tiên', check: s => s.totalGameSessions >= 1 },
    { id: 'games_10',      label: '10 lượt chơi game',  check: s => s.totalGameSessions >= 10 },
    { id: 'games_50',      label: '50 lượt chơi game',  check: s => s.totalGameSessions >= 50 },
    { id: 'explorer',      label: 'Nhà thám hiểm (chơi 5 game khác nhau)', check: s => Object.keys(s.gameCounts || {}).length >= 5 },
    { id: 'daily_quest',   label: 'Hoàn thành nhiệm vụ ngày', check: s => s.dailyQuestsDone >= 1 },
    { id: 'daily_quest_7', label: '7 lần hoàn thành nhiệm vụ ngày', check: s => s.dailyQuestsDone >= 7 },
    { id: 'level_5',       label: 'Đạt cấp 5',          check: s => levelForXp(s.xp) >= 5 },
  ];

  function _today() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, ổn định múi giờ trình duyệt
  }

  function _defaultState() {
    return {
      xp: 0,
      totalQuizzes: 0,
      perfectScores: 0,
      streak: 0,
      lastPlayedDate: null, // YYYY-MM-DD
      badges: [],
      totalGameSessions: 0, // (Phase 3+) số lượt chơi mini-game đã ghi nhận, mọi game cộng chung
      gameCounts: {},       // gameId -> số lượt chơi (huy hiệu "Nhà thám hiểm")
      daily: { date: null, games: 0, done: false }, // tiến độ nhiệm vụ HÔM NAY
      dailyQuestsDone: 0,
    };
  }

  function getState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaultState();
      return Object.assign(_defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn('[Gamification] Không đọc được state, dùng mặc định.', e);
      return _defaultState();
    }
  }

  function _saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[Gamification] Không lưu được state.', e);
    }
  }

  function levelForXp(xp) {
    let lvl = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
    }
    return lvl;
  }

  function xpToNextLevel(xp) {
    const nextThreshold = LEVEL_THRESHOLDS.find(t => t > xp);
    return nextThreshold === undefined ? null : nextThreshold - xp;
  }

  /** Cập nhật streak dựa trên ngày làm bài gần nhất. */
  function _updateStreak(state) {
    const today = _today();
    if (state.lastPlayedDate === today) {
      // Đã làm bài hôm nay rồi → streak không đổi
      return;
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (state.lastPlayedDate === yesterday) {
      state.streak += 1; // liên tiếp
    } else {
      state.streak = 1; // đứt quãng → bắt đầu lại
    }
    state.lastPlayedDate = today;
  }

  /**
   * Gọi hàm này sau mỗi lần nộp bài (đã được hook trong quiz-engine.js § SAVE RECORD).
   * @param {object} rec — bản ghi kết quả, có { correct, total, score }
   * @returns {{ xpGained: number, newBadges: object[], state: object }}
   */
  function recordResult(rec) {
    const state = getState();
    _updateStreak(state);

    const correct = rec.correct || 0;
    const isPerfect = rec.total > 0 && correct === rec.total;

    let xpGained = correct * XP_PER_CORRECT + XP_PER_MINITEST_DONE;
    if (isPerfect) xpGained += XP_PER_PERFECT_SCORE;

    state.xp += xpGained;
    state.totalQuizzes += 1;
    if (isPerfect) state.perfectScores += 1;

    const newBadges = [];
    BADGE_DEFS.forEach(def => {
      if (!state.badges.includes(def.id) && def.check(state)) {
        state.badges.push(def.id);
        newBadges.push(def);
      }
    });

    _saveState(state);
    return { xpGained, newBadges, state };
  }

  /**
   * (Phase 3+) Gọi hàm này khi 1 mini-game (Memory/PZ Defense/Battle
   * Quiz/Cyber Detective/Computer Simulator/Sort Game...) kết thúc 1
   * lượt chơi. KHÔNG đụng streak (streak vẫn chỉ tính theo
   * ngày làm BÀI THI, giữ đúng ý nghĩa cũ) — chỉ cộng XP + đếm lượt
   * chơi + xét huy hiệu liên quan game.
   *
   * @param {string} gameId — 'pz-defense' | 'memory-game' | 'battle-quiz' | 'cyber-detective' | 'computer-simulator' | 'sort-game'
   * @param {Object} [session] — xem @typedef GameSession trong
   *   js/models/game-session.model.js. `xp` có thể tự truyền (game tự
   *   tính XP riêng theo combo/độ khó); nếu không truyền, dùng mặc định
   *   XP_PER_GAME_SESSION (+ thưởng thêm nếu có `score` dạng percent cao).
   * @returns {{ xpGained: number, newBadges: object[], state: object }}
   */
  function recordGameSession(gameId, session = {}) {
    const state = getState();
    const prevXp = state.xp;

    let xpGained = typeof session.xp === 'number' ? session.xp : XP_PER_GAME_SESSION;
    if (session.scoreType === 'percent' && typeof session.score === 'number' && session.score >= 90) {
      xpGained += 15; // thưởng nhỏ cho lượt chơi đạt điểm cao, không đổi luật XP_PER_PERFECT_SCORE của quiz
    }

    state.totalGameSessions += 1;
    state.gameCounts[gameId] = (state.gameCounts[gameId] || 0) + 1;

    // Nhiệm vụ hằng ngày — sang ngày mới thì đếm lại từ 0.
    const today = _today();
    if (!state.daily || state.daily.date !== today) state.daily = { date: today, games: 0, done: false };
    state.daily.games += 1;
    let dailyJustDone = false;
    if (!state.daily.done && state.daily.games >= DAILY_GAME_GOAL) {
      state.daily.done = true;
      state.dailyQuestsDone += 1;
      xpGained += XP_DAILY_QUEST_BONUS;
      dailyJustDone = true;
    }

    state.xp += xpGained;

    const newBadges = [];
    BADGE_DEFS.forEach(def => {
      if (!state.badges.includes(def.id) && def.check(state)) {
        state.badges.push(def.id);
        newBadges.push(def);
      }
    });

    _saveState(state);

    const result = { xpGained, newBadges, state, prevXp, dailyJustDone };
    if (session.showReward !== false) {
      try { showGameReward(result); } catch (e) { /* thẻ thưởng chỉ là phụ — không làm hỏng màn kết quả */ }
    }
    return result;
  }

  // ── Thẻ phần thưởng cuối ván (tự chèn CSS, không phụ thuộc CSS của từng game) ──
  const REWARD_CSS = `
    .edu-reward{position:fixed;left:50%;bottom:20px;transform:translate(-50%,140%);z-index:2147483000;
      width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:14px 16px 12px;border-radius:16px;
      background:#1e1b4b;color:#f8fafc;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      box-shadow:0 12px 32px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);
      transition:transform .45s cubic-bezier(.2,1.3,.4,1),opacity .3s;opacity:0;cursor:pointer}
    .edu-reward.show{transform:translate(-50%,0);opacity:1}
    .edu-reward-top{display:flex;align-items:baseline;gap:10px}
    .edu-reward-xp{font-size:28px;font-weight:800;color:#fde047;letter-spacing:-.5px}
    .edu-reward-lvl{margin-left:auto;font-weight:700;color:#c7d2fe}
    .edu-reward-close{background:none;border:0;color:#a5b4fc;font-size:18px;cursor:pointer;padding:0 0 0 6px;line-height:1}
    .edu-reward-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.15);overflow:hidden;margin:8px 0 4px}
    .edu-reward-bar>i{display:block;height:100%;width:0;border-radius:inherit;
      background:linear-gradient(90deg,#facc15,#f97316);transition:width 1s ease-out .25s}
    .edu-reward-sub{font-size:12px;color:#c7d2fe}
    .edu-reward-up{margin-top:8px;font-weight:800;color:#86efac;font-size:16px}
    .edu-reward-row{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}
    .edu-reward-chip{background:rgba(250,204,21,.18);border:1px solid rgba(250,204,21,.5);color:#fef08a;
      border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600}
    .edu-reward-quest{margin-top:8px;font-size:12.5px;color:#e0e7ff}
    .edu-reward-quest b{color:#fde047}
    @media (prefers-reduced-motion:reduce){.edu-reward,.edu-reward-bar>i{transition:none}}
  `;

  function _ensureRewardCss() {
    if (document.getElementById('eduRewardCss')) return;
    const st = document.createElement('style');
    st.id = 'eduRewardCss';
    st.textContent = REWARD_CSS;
    document.head.appendChild(st);
  }

  function _levelProgressPct(xp) {
    const lvl = levelForXp(xp);
    const from = LEVEL_THRESHOLDS[lvl - 1];
    const to = LEVEL_THRESHOLDS[lvl];
    if (to === undefined) return 100;
    return Math.round(((xp - from) / (to - from)) * 100);
  }

  function _el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let _rewardTimer = null;

  /** Hiện thẻ phần thưởng (gọi tự động từ recordGameSession()). */
  function showGameReward(r) {
    if (typeof document === 'undefined' || !document.body) return;
    _ensureRewardCss();
    const old = document.getElementById('eduReward');
    if (old) old.remove();
    clearTimeout(_rewardTimer);

    const s = r.state;
    const lvl = levelForXp(s.xp);
    const leveledUp = lvl > levelForXp(r.prevXp);
    const toNext = xpToNextLevel(s.xp);
    const d = s.daily || { games: 0, done: false };

    const card = _el('div', 'edu-reward');
    card.id = 'eduReward';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.title = 'Bấm để đóng';

    const top = _el('div', 'edu-reward-top');
    const close = _el('button', 'edu-reward-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Đóng');
    top.append(_el('span', 'edu-reward-xp', '+' + r.xpGained + ' XP'), _el('span', 'edu-reward-lvl', '⭐ Cấp ' + lvl), close);

    const bar = _el('div', 'edu-reward-bar');
    const fill = _el('i');
    // Chạy từ tiến độ CŨ (hoặc 0 nếu vừa lên cấp) tới tiến độ mới.
    fill.style.width = (leveledUp ? 0 : _levelProgressPct(r.prevXp)) + '%';
    bar.appendChild(fill);

    card.append(top, bar, _el('div', 'edu-reward-sub',
      s.xp + ' XP' + (toNext !== null ? ' · còn ' + toNext + ' XP để lên cấp ' + (lvl + 1) : ' · Cấp tối đa!')));

    if (leveledUp) card.appendChild(_el('div', 'edu-reward-up', '🎉 LÊN CẤP ' + lvl + '!'));

    if (r.newBadges.length) {
      const row = _el('div', 'edu-reward-row');
      r.newBadges.forEach(b => row.appendChild(_el('span', 'edu-reward-chip', '🏅 ' + b.label)));
      card.appendChild(row);
    }

    const quest = _el('div', 'edu-reward-quest');
    if (r.dailyJustDone) {
      quest.append('✅ Hoàn thành nhiệm vụ hôm nay! ', _el('b', null, '+' + XP_DAILY_QUEST_BONUS + ' XP'));
    } else if (d.done) {
      quest.textContent = '✅ Nhiệm vụ hôm nay đã xong — chơi tiếp để lên cấp!';
    } else {
      quest.append('🎯 Nhiệm vụ hôm nay: chơi ' + DAILY_GAME_GOAL + ' ván (', _el('b', null, d.games + '/' + DAILY_GAME_GOAL),
        ') → thưởng ', _el('b', null, '+' + XP_DAILY_QUEST_BONUS + ' XP'));
    }
    card.appendChild(quest);

    const hide = () => {
      clearTimeout(_rewardTimer);
      card.classList.remove('show');
      setTimeout(() => card.remove(), 400);
    };
    card.addEventListener('click', hide);

    document.body.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.classList.add('show');
      fill.style.width = _levelProgressPct(s.xp) + '%';
    }));
    _rewardTimer = setTimeout(hide, leveledUp || r.newBadges.length ? 9000 : 6000);

    if (leveledUp || r.newBadges.length || r.dailyJustDone) {
      setTimeout(() => {
        if (global.EduSFX) global.EduSFX.play('combo');
        if (global.EduFX && leveledUp) global.EduFX.confetti({ count: 70 });
      }, 700);
    }
  }

  /** Render 1 dải nhỏ (streak + level + XP) vào 1 container có sẵn trên trang. */
  // Mini-game chạy trong <iframe> (js/game-modal.js) cùng origin — khi game ghi
  // XP vào localStorage, trang cha nhận sự kiện "storage" → vẽ lại dải XP ngay,
  // học sinh đóng game là thấy XP/nhiệm vụ mới mà không cần tải lại trang.
  const _renderedTargets = new Set();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) _renderedTargets.forEach(t => renderInto(t));
    });
  }

  function renderInto(selector) {
    _renderedTargets.add(selector);
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    const s = getState();
    const lvl = levelForXp(s.xp);
    const toNext = xpToNextLevel(s.xp);
    const daily = s.daily && s.daily.date === _today() ? s.daily : { games: 0, done: false };

    el.innerHTML = `
      <div class="eduquiz-game-strip" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:14px;color:#1f2937;">
        <span class="chip" style="background:#fff3cd;border:1px solid #ffe08a;border-radius:999px;padding:4px 12px;">
          <i class="fa-solid fa-star"></i> Cấp ${lvl} · ${s.xp} XP${toNext !== null ? ` (còn ${toNext} XP lên cấp)` : ' (MAX)'}
        </span>
        <span class="chip" style="background:#ffe5e5;border:1px solid #ffb3b3;border-radius:999px;padding:4px 12px;">
          <i class="fa-solid fa-fire"></i> Chuỗi ${s.streak} ngày
        </span>
        <span class="chip" style="background:#e0e7ff;border:1px solid #c7d2fe;border-radius:999px;padding:4px 12px;">
          <i class="fa-solid fa-medal"></i> ${s.badges.length} huy hiệu
        </span>
        <span class="chip" style="background:#dcfce7;border:1px solid #86efac;border-radius:999px;padding:4px 12px;" title="Chơi ${DAILY_GAME_GOAL} ván ở Khu Vui Chơi mỗi ngày để nhận +${XP_DAILY_QUEST_BONUS} XP">
          <i class="fa-solid fa-bullseye"></i> ${daily.done ? 'Nhiệm vụ hôm nay: xong ✓' : `Nhiệm vụ hôm nay: ${daily.games}/${DAILY_GAME_GOAL} ván game (+${XP_DAILY_QUEST_BONUS} XP)`}
        </span>
      </div>
    `;
  }

  global.EduGamification = {
    getState,
    recordResult,
    recordGameSession,
    showGameReward,
    renderInto,
    levelForXp,
    xpToNextLevel,
    BADGE_DEFS,
  };
})(window);
