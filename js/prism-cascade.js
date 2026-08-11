/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  js/prism-cascade.js — "Prism Cascade" mini-game (MVP)           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Bản MVP theo tài liệu thiết kế "Prism Cascade" (match3-game-design-
 * document.md), CHỈ lấy phần core loop:
 *   Swap liền kề → Match ≥3 (hàng/cột) → Cascade (rơi) → Refill
 *   → Chain Reaction (combo multiplier) → Score → Win/Lose theo
 *   Objective (đạt điểm mục tiêu trong số lượt cho phép).
 *
 * KHÔNG bao gồm (để Phase sau nếu cần): Special Piece, Obstacle,
 * RPG/Companion, Meta Game — theo đúng phạm vi MVP đã chọn.
 *
 * 5 loại Shard (điểm khác biệt hình học trừu tượng, không dùng
 * kẹo/trái cây):
 *   0 = Prism   (tam giác)
 *   1 = Cube    (vuông)
 *   2 = Orb     (tròn)
 *   3 = Spire   (kim cương)
 *   4 = Leaf    (lục giác)
 *
 * Công thức điểm (mục 3 & 5 của tài liệu):
 *   BaseScore = SốShardBịPhá × 10
 *   Combo Tier theo ChainStep trong cùng 1 lượt đi:
 *     Spark (chain 1)            x1.0
 *     Flow (chain 2–3)           x1.5
 *     Surge (chain 4–5)          x2.0
 *     Cascade Storm (chain 6–8)  x3.0
 *     Resonance Overload (9+)    x4.0 (cap)
 *   LevelScore += BaseScore × ComboMultiplier
 *
 * Module độc lập, không đụng vào quiz-engine.js / gamification.js.
 * Nhúng qua modal (xem js/prism-cascade-modal.js), file này chỉ chạy
 * bên trong game.html.
 */
(function () {
  'use strict';

  // ── Cấu hình Level (theo "Level 1" ở mục 18 của tài liệu thiết kế) ──
  const LEVEL = {
    width: 6,
    height: 6,
    moves: 20,
    targetScore: 3000,
  };

  const SHARD_TYPES = 5;
  const SHARD_META = [
    { cls: 'shard-prism', label: 'Prism' },
    { cls: 'shard-cube', label: 'Cube' },
    { cls: 'shard-orb', label: 'Orb' },
    { cls: 'shard-spire', label: 'Spire' },
    { cls: 'shard-leaf', label: 'Leaf-node' },
  ];

  const COMBO_TIERS = [
    { max: 1, name: 'Spark', mult: 1.0, cls: 'tier-spark' },
    { max: 3, name: 'Flow', mult: 1.5, cls: 'tier-flow' },
    { max: 5, name: 'Surge', mult: 2.0, cls: 'tier-surge' },
    { max: 8, name: 'Cascade Storm', mult: 3.0, cls: 'tier-storm' },
    { max: Infinity, name: 'Resonance Overload', mult: 4.0, cls: 'tier-overload' },
  ];

  function comboTierFor(chainStep) {
    return COMBO_TIERS.find(t => chainStep <= t.max);
  }

  // ── State ──
  let board = [];      // board[row][col] = 0..4
  let score = 0;
  let movesLeft = LEVEL.moves;
  let selected = null; // {r,c}
  let busy = false;    // khoá input trong lúc đang giải (resolve chain)
  let gameOver = false;

  // ── DOM refs ──
  let boardEl, scoreEl, movesEl, targetEl, progressFillEl, comboBannerEl,
    toastEl, overlayEl, overlayIconEl, overlayTitleEl, overlaySubEl, restartBtn, cellSize = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    boardEl = $('gameBoard');
    scoreEl = $('gameScore');
    movesEl = $('gameMoves');
    targetEl = $('gameTarget');
    progressFillEl = $('gameProgressFill');
    comboBannerEl = $('comboBanner');
    toastEl = $('gameToast');
    overlayEl = $('gameOverlay');
    overlayIconEl = $('gameOverlayIcon');
    overlayTitleEl = $('gameOverlayTitle');
    overlaySubEl = $('gameOverlaySub');
    restartBtn = $('gameRestartBtn');

    targetEl.textContent = LEVEL.targetScore.toLocaleString('vi-VN');

    boardEl.style.setProperty('--cols', LEVEL.width);
    boardEl.style.setProperty('--rows', LEVEL.height);

    restartBtn.addEventListener('click', startGame);
    $('gameOverlayRestartBtn').addEventListener('click', startGame);

    window.addEventListener('resize', updateCellSize);

    startGame();
  }

  function startGame() {
    score = 0;
    movesLeft = LEVEL.moves;
    selected = null;
    busy = false;
    gameOver = false;
    overlayEl.classList.remove('show');
    updateHud();
    board = generateInitialBoard();
    // Đảm bảo bàn cờ khởi tạo luôn có ít nhất 1 nước đi hợp lệ,
    // tránh trường hợp người chơi bị "kẹt" ngay từ đầu ván.
    while (!hasAnyValidMove()) {
      board = generateInitialBoard();
    }
    renderBoardFull();
  }

  // ── Sinh board ban đầu, tự "đốt" hết match sẵn có để không ăn điểm free ──
  function generateInitialBoard() {
    const b = [];
    for (let r = 0; r < LEVEL.height; r++) {
      const row = [];
      for (let c = 0; c < LEVEL.width; c++) {
        let t;
        do {
          t = randomType();
        } while (
          (c >= 2 && row[c - 1] === t && row[c - 2] === t) ||
          (r >= 2 && b[r - 1][c] === t && b[r - 2][c] === t)
        );
        row.push(t);
      }
      b.push(row);
    }
    return b;
  }

  function randomType() {
    return Math.floor(Math.random() * SHARD_TYPES);
  }

  function inBounds(r, c) {
    return r >= 0 && r < LEVEL.height && c >= 0 && c < LEVEL.width;
  }

  // ── Render toàn bộ board (dùng lúc khởi tạo / restart) ──
  function renderBoardFull() {
    boardEl.innerHTML = '';
    updateCellSize();
    for (let r = 0; r < LEVEL.height; r++) {
      for (let c = 0; c < LEVEL.width; c++) {
        const el = createShardEl(board[r][c], r, c);
        boardEl.appendChild(el);
      }
    }
  }

  function updateCellSize() {
    if (!boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    cellSize = rect.width / LEVEL.width;
  }

  function createShardEl(type, r, c) {
    const el = document.createElement('div');
    el.className = 'shard ' + SHARD_META[type].cls;
    el.dataset.r = r;
    el.dataset.c = c;
    el.dataset.type = type;
    el.style.gridRowStart = r + 1;
    el.style.gridColumnStart = c + 1;
    el.innerHTML = '<span class="shard-inner"></span>';
    el.addEventListener('click', onShardClick);
    return el;
  }

  function getEl(r, c) {
    return boardEl.querySelector(`.shard[data-r="${r}"][data-c="${c}"]`);
  }

  function updateHud() {
    scoreEl.textContent = score.toLocaleString('vi-VN');
    movesEl.textContent = movesLeft;
    const pct = Math.min(100, Math.round((score / LEVEL.targetScore) * 100));
    progressFillEl.style.width = pct + '%';
  }

  // ── Xử lý click ──
  function onShardClick(e) {
    if (busy || gameOver) return;
    const el = e.currentTarget;
    const r = parseInt(el.dataset.r, 10);
    const c = parseInt(el.dataset.c, 10);

    if (!selected) {
      selected = { r, c };
      el.classList.add('selected');
      return;
    }

    if (selected.r === r && selected.c === c) {
      el.classList.remove('selected');
      selected = null;
      return;
    }

    const prevEl = getEl(selected.r, selected.c);
    const isAdjacent = Math.abs(selected.r - r) + Math.abs(selected.c - c) === 1;

    if (!isAdjacent) {
      // Chọn lại ô khác thay vì cố swap 2 ô không liền kề.
      if (prevEl) prevEl.classList.remove('selected');
      selected = { r, c };
      el.classList.add('selected');
      return;
    }

    if (prevEl) prevEl.classList.remove('selected');
    const from = selected;
    const to = { r, c };
    selected = null;
    attemptSwap(from, to);
  }

  async function attemptSwap(from, to) {
    busy = true;
    swapData(from, to);
    await animateSwap(from, to);

    const matches = findMatches();
    if (matches.size === 0) {
      // Invalid swap → tự động swap ngược lại (không trừ lượt).
      swapData(from, to);
      await animateSwap(to, from, true);
      busy = false;
      return;
    }

    movesLeft -= 1;
    updateHud();
    await resolveChain(1);

    if (movesLeft <= 0) {
      endGame(score >= LEVEL.targetScore);
    } else if (!hasAnyValidMove()) {
      await shuffleBoard();
    }
    busy = false;
  }

  function swapData(a, b) {
    const tmp = board[a.r][a.c];
    board[a.r][a.c] = board[b.r][b.c];
    board[b.r][b.c] = tmp;
  }

  function animateSwap(from, to, isRevert) {
    return new Promise(resolve => {
      const elA = getEl(from.r, from.c);
      const elB = getEl(to.r, to.c);
      if (!elA || !elB) return resolve();

      // Đổi type hiển thị + class cho đúng dữ liệu mới, nhưng animate
      // bằng transform để mắt thấy 2 khối "trượt" đổi chỗ.
      const dx = (to.c - from.c) * cellSize;
      const dy = (to.r - from.r) * cellSize;

      elA.style.transition = 'transform .18s ease';
      elB.style.transition = 'transform .18s ease';
      elA.style.transform = `translate(${dx}px, ${dy}px)`;
      elB.style.transform = `translate(${-dx}px, ${-dy}px)`;
      if (isRevert) {
        elA.classList.add('shake');
        elB.classList.add('shake');
      }

      setTimeout(() => {
        elA.style.transition = '';
        elB.style.transition = '';
        elA.style.transform = '';
        elB.style.transform = '';
        elA.classList.remove('shake');
        elB.classList.remove('shake');
        syncShardEl(elA, from.r, from.c);
        syncShardEl(elB, to.r, to.c);
        resolve();
      }, 190);
    });
  }

  function syncShardEl(el, r, c) {
    const type = board[r][c];
    el.className = 'shard ' + SHARD_META[type].cls;
    el.dataset.type = type;
  }

  // ── Tìm match (hàng ngang + cột dọc, ≥3 liên tiếp cùng loại) ──
  function findMatches() {
    const matched = new Set();

    for (let r = 0; r < LEVEL.height; r++) {
      let runStart = 0;
      for (let c = 1; c <= LEVEL.width; c++) {
        const same = c < LEVEL.width && board[r][c] === board[r][runStart];
        if (!same) {
          if (c - runStart >= 3) {
            for (let k = runStart; k < c; k++) matched.add(r + ',' + k);
          }
          runStart = c;
        }
      }
    }
    for (let c = 0; c < LEVEL.width; c++) {
      let runStart = 0;
      for (let r = 1; r <= LEVEL.height; r++) {
        const same = r < LEVEL.height && board[r][c] === board[runStart][c];
        if (!same) {
          if (r - runStart >= 3) {
            for (let k = runStart; k < r; k++) matched.add(k + ',' + c);
          }
          runStart = r;
        }
      }
    }
    return matched;
  }

  // ── Vòng lặp Chain Reaction: xoá match → cascade → refill → tìm match mới ──
  async function resolveChain(chainStep) {
    const matches = findMatches();
    if (matches.size === 0) return;

    await removeMatches(matches, chainStep);
    await cascadeAndRefill();
    await resolveChain(chainStep + 1);
  }

  async function removeMatches(matchSet, chainStep) {
    const tier = comboTierFor(chainStep);
    const piecesCount = matchSet.size;
    const gained = Math.round(piecesCount * 10 * tier.mult);
    score += gained;
    updateHud();

    showFloatingScore(matchSet, gained);
    if (chainStep >= 2) showComboBanner(tier);

    matchSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const el = getEl(r, c);
      if (el) el.classList.add('popping');
    });

    await wait(220);

    matchSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      board[r][c] = null;
      const el = getEl(r, c);
      if (el) el.remove();
    });
  }

  function showFloatingScore(matchSet, gained) {
    // Hiện điểm nổi lên tại ô ở "giữa" vùng match, cho cảm giác phản hồi tức thì.
    let ar = 0, ac = 0, n = 0;
    matchSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      ar += r; ac += c; n++;
    });
    const r = Math.round(ar / n), c = Math.round(ac / n);
    const pop = document.createElement('div');
    pop.className = 'floating-score';
    pop.textContent = '+' + gained;
    pop.style.left = ((c + 0.5) / LEVEL.width * 100) + '%';
    pop.style.top = ((r + 0.5) / LEVEL.height * 100) + '%';
    boardEl.appendChild(pop);
    setTimeout(() => pop.remove(), 700);
  }

  function showComboBanner(tier) {
    comboBannerEl.textContent = '✨ ' + tier.name + ' ×' + tier.mult;
    comboBannerEl.className = 'combo-banner show ' + tier.cls;
    if (tier.max >= 6) {
      boardEl.classList.add('board-shake');
      setTimeout(() => boardEl.classList.remove('board-shake'), 400);
    }
    clearTimeout(showComboBanner._t);
    showComboBanner._t = setTimeout(() => {
      comboBannerEl.classList.remove('show');
    }, 900);
  }

  // ── Cascade: rơi xuống lấp chỗ trống + sinh shard mới từ trên ──
  async function cascadeAndRefill() {
    const moves = []; // { el, fromRow, toRow, col }
    const spawns = []; // { row, col, type }

    for (let c = 0; c < LEVEL.width; c++) {
      const stack = [];
      for (let r = LEVEL.height - 1; r >= 0; r--) {
        if (board[r][c] !== null) stack.push({ type: board[r][c], oldRow: r });
      }
      let writeRow = LEVEL.height - 1;
      for (const item of stack) {
        if (item.oldRow !== writeRow) {
          const el = getEl(item.oldRow, c);
          if (el) {
            moves.push({ el, fromRow: item.oldRow, toRow: writeRow, col: c });
            el.dataset.r = writeRow;
          }
        }
        board[writeRow][c] = item.type;
        writeRow--;
      }
      while (writeRow >= 0) {
        const type = randomType();
        board[writeRow][c] = type;
        spawns.push({ row: writeRow, col: c, type });
        writeRow--;
      }
    }

    // Animate rơi bằng FLIP: đặt transform lệch lên rồi cho về 0.
    moves.forEach(m => {
      const dy = (m.toRow - m.fromRow) * cellSize;
      m.el.style.transition = 'none';
      m.el.style.transform = `translateY(${-dy}px)`;
      m.el.style.gridRowStart = m.toRow + 1;
    });
    // force reflow
    void boardEl.offsetHeight;
    moves.forEach(m => {
      m.el.style.transition = 'transform .22s cubic-bezier(.34,1.3,.64,1)';
      m.el.style.transform = 'translateY(0)';
    });

    spawns.forEach(s => {
      const el = createShardEl(s.type, s.row, s.col);
      el.classList.add('spawning');
      boardEl.appendChild(el);
    });

    await wait(240);
    moves.forEach(m => { m.el.style.transition = ''; m.el.style.transform = ''; });
  }

  function hasAnyValidMove() {
    for (let r = 0; r < LEVEL.height; r++) {
      for (let c = 0; c < LEVEL.width; c++) {
        if (c + 1 < LEVEL.width && wouldMatch(r, c, r, c + 1)) return true;
        if (r + 1 < LEVEL.height && wouldMatch(r, c, r + 1, c)) return true;
      }
    }
    return false;
  }

  function wouldMatch(r1, c1, r2, c2) {
    swapData({ r: r1, c: c1 }, { r: r2, c: c2 });
    const has = findMatches().size > 0;
    swapData({ r: r1, c: c1 }, { r: r2, c: c2 });
    return has;
  }

  // "No-move Shuffle" — xáo trộn có cảnh báo, không trừ lượt (mục 3 tài liệu).
  async function shuffleBoard() {
    showToast('🔀 Hết nước đi — tự động xáo bàn cờ…');
    await wait(500);
    let flat;
    do {
      flat = [];
      for (let r = 0; r < LEVEL.height; r++)
        for (let c = 0; c < LEVEL.width; c++) flat.push(board[r][c]);
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flat[i], flat[j]] = [flat[j], flat[i]];
      }
      let idx = 0;
      for (let r = 0; r < LEVEL.height; r++)
        for (let c = 0; c < LEVEL.width; c++) board[r][c] = flat[idx++];
    } while (findMatches().size > 0 || !hasAnyValidMove());

    boardEl.querySelectorAll('.shard').forEach(el => el.classList.add('reshuffling'));
    await wait(200);
    renderBoardFull();
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  function endGame(won) {
    gameOver = true;
    overlayIconEl.textContent = won ? '🏆' : '💥';
    overlayTitleEl.textContent = won ? 'Hoàn thành mục tiêu!' : 'Hết lượt rồi!';
    overlaySubEl.textContent = won
      ? `Bạn đạt ${score.toLocaleString('vi-VN')} điểm — vượt mục tiêu ${LEVEL.targetScore.toLocaleString('vi-VN')}. 🎉`
      : `Bạn đạt ${score.toLocaleString('vi-VN')} / ${LEVEL.targetScore.toLocaleString('vi-VN')} điểm. Thử lại nhé!`;
    overlayEl.classList.add('show');
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
