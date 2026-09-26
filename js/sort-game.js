/* ========================================
   SORT GAME — "Phân Loại Thần Tốc"
   Kéo/bấm từng vật phẩm (dùng lại đúng bộ ảnh trong img/memory-game/,
   giống js/memory-game.js) vào đúng "thùng" chủ đề trước khi hết giờ.
   Độ khó tăng theo SỐ THÙNG phải phân biệt (3 → 4 → 5) + nhịp độ mỗi
   vật phẩm nhanh dần, tạo cảm giác dồn dập khác hẳn Trí Nhớ (vốn không
   giới hạn giờ mỗi lượt). Thuần vanilla JS, cùng phong cách
   js/memory-game.js / js/sudoku.js — không phụ thuộc thư viện ngoài.
   ======================================== */
(function () {
  var CATEGORIES = [
    {
      id: 'hardware', icon: '🖥️', name: 'Thiết bị phần cứng',
      items: [
        { id: 'keyboard',   label: 'Bàn phím',        img: 'img/memory-game/keyboard.png' },
        { id: 'mouse',      label: 'Chuột',            img: 'img/memory-game/mouse.png' },
        { id: 'headphones', label: 'Tai nghe',         img: 'img/memory-game/headphones.png' },
        { id: 'printer',    label: 'Máy in',           img: 'img/memory-game/printer.png' },
        { id: 'tower',      label: 'Thân máy (Case)',  img: 'img/memory-game/tower.png' },
        { id: 'monitor',    label: 'Màn hình',         img: 'img/memory-game/monitor.png' },
        { id: 'extdrive',   label: 'Ổ cứng di động',   img: 'img/memory-game/ext-drive.png' },
        { id: 'cpu',        label: 'CPU',              img: 'img/memory-game/cpu.png' },
        { id: 'laptop',     label: 'Laptop',           img: 'img/memory-game/laptop.png' },
        { id: 'audio',      label: 'Loa',              img: 'img/memory-game/audio.png' }
      ]
    },
    {
      id: 'office', icon: '📊', name: 'Phần mềm văn phòng',
      items: [
        { id: 'word',        label: 'Word',        img: 'img/memory-game/word.png' },
        { id: 'excel',       label: 'Excel',        img: 'img/memory-game/excel.png' },
        { id: 'powerpoint',  label: 'PowerPoint',   img: 'img/memory-game/powerpoint.png' },
        { id: 'outlook',     label: 'Outlook',      img: 'img/memory-game/outlook.png' },
        { id: 'illustrator', label: 'Illustrator',  img: 'img/memory-game/illustrator.png' },
        { id: 'photoshop',   label: 'Photoshop',    img: 'img/memory-game/photoshop.png' }
      ]
    },
    {
      id: 'os', icon: '🪟', name: 'Hệ điều hành',
      items: [
        { id: 'windows', label: 'Windows 11', img: 'img/memory-game/windown_11.png' },
        { id: 'macos',   label: 'macOS',       img: 'img/memory-game/mac_os.png' },
        { id: 'linux',   label: 'Linux',       img: 'img/memory-game/linux.png' },
        { id: 'ios',     label: 'iOS',         img: 'img/memory-game/ios.png' },
        { id: 'android', label: 'Android',     img: 'img/memory-game/adroid.png' }
      ]
    },
    {
      id: 'web', icon: '🌐', name: 'Trình duyệt & Liên lạc',
      items: [
        { id: 'chrome', label: 'Chrome',       img: 'img/memory-game/chrome.png' },
        { id: 'edge',   label: 'Edge',         img: 'img/memory-game/edge.png' },
        { id: 'gmail',  label: 'Gmail',        img: 'img/memory-game/gmail.png' },
        { id: 'yahoo',  label: 'Yahoo Mail',   img: 'img/memory-game/yahoo.png' },
        { id: 'teams',  label: 'Teams',        img: 'img/memory-game/teams.png' },
        { id: 'zoom',   label: 'Zoom',         img: 'img/memory-game/zoom.png' },
        { id: 'meet',   label: 'Google Meet',  img: 'img/memory-game/meet.png' }
      ]
    },
    {
      id: 'ai', icon: '🤖', name: 'Trợ lý AI',
      items: [
        { id: 'chatgpt',  label: 'ChatGPT',   img: 'img/memory-game/chatgpt.png' },
        { id: 'claude',   label: 'Claude',    img: 'img/memory-game/claude.png' },
        { id: 'copilot',  label: 'Copilot',   img: 'img/memory-game/copilot.png' },
        { id: 'gemini',   label: 'Gemini',    img: 'img/memory-game/gemini.png' },
        { id: 'siri',     label: 'Siri',      img: 'img/memory-game/siri.png' }
      ]
    }
  ];

  // Độ khó tăng theo SỐ THÙNG phải phân biệt (dễ nhớ hơn khi ít lựa chọn)
  // + thời gian mỗi vật phẩm rút ngắn dần — 2 trục khó khác nhau, không
  // chỉ đơn thuần "giảm giờ" như nhiều mini-game timed khác.
  var DIFFICULTIES = [
    { id: 'easy',   icon: '🌱', name: 'Dễ',          desc: '3 loại thùng, còn nhiều thời gian suy nghĩ', catIds: ['hardware', 'office', 'os'],                roundSec: 60, perItemSec: 6,   basePoints: 10 },
    { id: 'medium', icon: '⚡', name: 'Trung bình',  desc: '4 loại thùng, nhịp độ nhanh hơn',            catIds: ['hardware', 'office', 'os', 'web'],         roundSec: 55, perItemSec: 4.5, basePoints: 14 },
    { id: 'hard',   icon: '🔥', name: 'Khó',         desc: 'Cả 5 loại thùng, thử phản xạ thật sự',       catIds: ['hardware', 'office', 'os', 'web', 'ai'],   roundSec: 50, perItemSec: 3.5, basePoints: 18 }
  ];

  var BEST_KEY = 'eduquiz_sort_best'; // { <diffId>: { score, accuracyPct } } — kỷ lục điểm cao nhất mỗi độ khó.

  function sfx(name) { if (window.EduSFX) window.EduSFX.play(name); }

  function loadBests() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveBestIfBetter(diffId, score, accuracyPct) {
    var bests = loadBests();
    var prev = bests[diffId];
    if (prev != null && prev.score >= score) return false;
    bests[diffId] = { score: score, accuracyPct: accuracyPct };
    try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) { /* ignore */ }
    return true;
  }

  /** Dựng HTML 3 sao, mỗi sao 1 <span> riêng để CSS pop-in LẦN LƯỢT (xem .sg-star trong sort-game.css). */
  function buildStarsHtml(filled) {
    var html = '';
    for (var i = 0; i < 3; i++) html += '<span class="sg-star">' + (i < filled ? '⭐' : '☆') + '</span>';
    return html;
  }

  function comboMultiplier(combo) {
    if (combo >= 10) return 3;
    if (combo >= 5) return 2;
    if (combo >= 3) return 1.5;
    return 1;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var dom = {};
  var state = null;

  function buildPool(diff) {
    var pool = [];
    CATEGORIES.forEach(function (cat) {
      if (diff.catIds.indexOf(cat.id) === -1) return;
      cat.items.forEach(function (it) {
        pool.push({ id: it.id, label: it.label, img: it.img, catId: cat.id });
      });
    });
    return pool;
  }

  function refillQueue() {
    // Xáo lại toàn bộ pool mỗi khi hết hàng — vòng lặp vô hạn trong suốt
    // thời gian round, không lo hết vật phẩm giữa chừng.
    state.queue = state.queue.concat(shuffle(state.pool));
  }

  /* ---------- Màn chọn độ khó ---------- */

  function renderPicker() {
    dom.picker.innerHTML = '';
    var bests = loadBests();
    DIFFICULTIES.forEach(function (d) {
      var best = bests[d.id];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'sg-diff-card';
      card.innerHTML =
        '<span class="sg-diff-icon">' + d.icon + '</span>' +
        '<span class="sg-diff-body">' +
        '<span class="sg-diff-name">' + d.name + '</span>' +
        '<span class="sg-diff-desc">' + d.desc + '</span>' +
        '<span class="sg-diff-meta">' + d.catIds.length + ' thùng · ' + d.roundSec + 's · ' + d.perItemSec + 's/vật phẩm</span>' +
        (best ? '<span class="sg-diff-best">🏅 Kỷ lục: ' + best.score + ' điểm (' + best.accuracyPct + '%)</span>' : '') +
        '</span>';
      card.addEventListener('click', function () { sfx('click'); startGame(d); });
      dom.picker.appendChild(card);
    });
    dom.picker.style.display = '';
    dom.play.style.display = 'none';
    dom.subtitle.textContent = 'Chọn độ khó — càng nhiều thùng, càng cần phản xạ nhanh';
  }

  /* ---------- Vòng chơi ---------- */

  function startGame(diff) {
    state = {
      difficulty: diff,
      pool: buildPool(diff),
      queue: [],
      current: null,
      score: 0,
      combo: 0,
      maxCombo: 0,
      correctCount: 0,
      wrongCount: 0,
      roundMsLeft: diff.roundSec * 1000,
      itemMsLeft: 0,
      itemMsTotal: diff.perItemSec * 1000,
      finished: false,
      roundInterval: null
    };
    refillQueue();

    dom.picker.style.display = 'none';
    dom.play.style.display = '';
    dom.subtitle.textContent = 'Mức ' + diff.name + ' — bấm đúng thùng trước khi hết giờ!';
    dom.overlay.classList.remove('show');

    renderBins();
    updateHud();
    nextItem();
    startRoundTimer();
  }

  function renderBins() {
    dom.bins.innerHTML = '';
    state.difficulty.catIds.forEach(function (catId) {
      var cat = CATEGORIES.filter(function (c) { return c.id === catId; })[0];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sg-bin';
      btn.dataset.catId = catId;
      btn.innerHTML = '<span class="sg-bin-icon">' + cat.icon + '</span><span class="sg-bin-name">' + cat.name + '</span>';
      btn.addEventListener('click', function () { handleBinClick(catId, btn); });
      dom.bins.appendChild(btn);
    });
  }

  function nextItem() {
    if (!state.queue.length) refillQueue();
    state.current = state.queue.shift();
    state.itemMsLeft = state.itemMsTotal;
    dom.itemImg.src = state.current.img;
    dom.itemImg.alt = state.current.label;
    dom.itemLabel.textContent = state.current.label;
    dom.itemCard.classList.remove('sg-item-correct', 'sg-item-wrong');
    updateItemTimerBar();
  }

  function handleBinClick(catId, btnEl) {
    if (state.finished || !state.current) return;
    var isCorrect = catId === state.current.catId;
    if (isCorrect) {
      state.combo += 1;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.correctCount += 1;
      var mult = comboMultiplier(state.combo);
      var gained = Math.round(state.difficulty.basePoints * mult);
      state.score += gained;
      sfx(mult >= 2 ? 'combo' : 'correct');
      dom.itemCard.classList.add('sg-item-correct');
      flashBin(btnEl, true);
      showFloatScore('+' + gained + (mult > 1 ? ' ×' + mult : ''));
    } else {
      state.combo = 0;
      state.wrongCount += 1;
      sfx('wrong');
      dom.itemCard.classList.add('sg-item-wrong');
      flashBin(btnEl, false);
    }
    updateHud();
    setTimeout(function () {
      if (!state.finished) nextItem();
    }, 180);
  }

  function flashBin(btnEl, ok) {
    btnEl.classList.remove('sg-bin-correct', 'sg-bin-wrong');
    void btnEl.offsetWidth;
    btnEl.classList.add(ok ? 'sg-bin-correct' : 'sg-bin-wrong');
    setTimeout(function () { btnEl.classList.remove('sg-bin-correct', 'sg-bin-wrong'); }, 380);
  }

  function showFloatScore(text) {
    var f = document.createElement('div');
    f.className = 'sg-float-score';
    f.textContent = text;
    dom.itemCard.appendChild(f);
    setTimeout(function () { f.remove(); }, 700);
  }

  function updateItemTimerBar() {
    var pct = Math.max(0, state.itemMsLeft / state.itemMsTotal) * 100;
    dom.itemTimerFill.style.width = pct + '%';
    dom.itemTimerFill.classList.toggle('sg-timer-low', pct < 30);
  }

  function startRoundTimer() {
    clearInterval(state.roundInterval);
    var tickMs = 100;
    updateRoundTimerText();
    state.roundInterval = setInterval(function () {
      state.roundMsLeft -= tickMs;
      state.itemMsLeft -= tickMs;
      updateRoundTimerText();
      updateItemTimerBar();

      if (state.itemMsLeft <= 0 && !state.finished) {
        // Hết giờ riêng cho vật phẩm này = tính là bỏ lỡ (không tính sai
        // nặng như bấm nhầm, nhưng vẫn mất combo) rồi tự chuyển tiếp.
        state.combo = 0;
        state.wrongCount += 1;
        sfx('wrong');
        updateHud();
        nextItem();
      }
      if (state.roundMsLeft <= 0) {
        endRound();
      }
    }, tickMs);
  }

  function updateRoundTimerText() {
    var sec = Math.max(0, Math.ceil(state.roundMsLeft / 1000));
    dom.roundTimer.textContent = sec + 's';
    dom.roundTimer.classList.toggle('sg-danger', sec <= 10);
  }

  function updateHud() {
    dom.score.textContent = state.score;
    dom.combo.textContent = state.combo;
    if (window.EduFX) { EduFX.pop(dom.score); if (state.combo > 0) EduFX.pop(dom.combo); }
  }

  function endRound() {
    state.finished = true;
    clearInterval(state.roundInterval);

    var total = state.correctCount + state.wrongCount;
    var accuracyPct = total ? Math.round((state.correctCount / total) * 100) : 0;
    var stars = accuracyPct >= 90 ? 3 : (accuracyPct >= 70 ? 2 : 1);
    var isNewBest = saveBestIfBetter(state.difficulty.id, state.score, accuracyPct);
    sfx(isNewBest ? 'win' : (accuracyPct >= 70 ? 'match' : 'lose'));
    if (window.EduFX) {
      if (isNewBest || stars === 3) EduFX.confetti({ count: isNewBest ? 90 : 55 });
      else if (accuracyPct < 50) EduFX.shake(dom.itemCard);
    }

    dom.overlayIcon.innerHTML = buildStarsHtml(stars);
    dom.overlayTitle.textContent = isNewBest ? 'Kỷ lục mới! 🎉' : 'Hết giờ!';
    dom.overlayStats.innerHTML =
      '<div>' + state.score + '<span>Điểm</span></div>' +
      '<div>' + accuracyPct + '%<span>Chính xác</span></div>' +
      '<div>' + state.maxCombo + '<span>Combo cao nhất</span></div>';
    dom.overlaySub.textContent = isNewBest
      ? 'Bạn vừa lập kỷ lục điểm cao nhất mức ' + state.difficulty.name + '!'
      : (state.correctCount + ' đúng / ' + state.wrongCount + ' sai/bỏ lỡ — thử lại để phá kỷ lục!');
    dom.overlay.classList.add('show');

    recordSessionIfPossible(accuracyPct);
  }

  function recordSessionIfPossible(accuracyPct) {
    try {
      if (typeof EduGamification === 'undefined' || !EduGamification.recordGameSession) return;
      var student = null;
      try { student = JSON.parse(localStorage.getItem('eduquiz_current_student') || 'null'); }
      catch (e) { student = null; }
      if (!student || !student.name || !student.class) return;

      EduGamification.recordGameSession('sort-game', {
        score: accuracyPct,
        scoreType: 'percent',
        accuracy: accuracyPct,
        correctAnswers: state.correctCount,
        wrongAnswers: state.wrongCount,
        difficulty: state.difficulty.id,
        durationSec: state.difficulty.roundSec,
        studentName: student.name,
        studentClass: student.class,
        studentSchool: student.school || ''
      });
    } catch (e) { /* ghi XP là phụ — không được làm hỏng màn kết quả */ }
  }

  /* ---------- Khởi tạo ---------- */

  function init() {
    dom = {
      subtitle: document.getElementById('sgSubtitle'),
      picker: document.getElementById('sgPicker'),
      play: document.getElementById('sgPlay'),
      score: document.getElementById('sgScore'),
      combo: document.getElementById('sgCombo'),
      roundTimer: document.getElementById('sgRoundTimer'),
      itemCard: document.getElementById('sgItemCard'),
      itemImg: document.getElementById('sgItemImg'),
      itemLabel: document.getElementById('sgItemLabel'),
      itemTimerFill: document.getElementById('sgItemTimerFill'),
      bins: document.getElementById('sgBins'),
      overlay: document.getElementById('sgOverlay'),
      overlayIcon: document.getElementById('sgOverlayIcon'),
      overlayTitle: document.getElementById('sgOverlayTitle'),
      overlaySub: document.getElementById('sgOverlaySub'),
      overlayStats: document.getElementById('sgOverlayStats'),
      overlayRestartBtn: document.getElementById('sgOverlayRestartBtn'),
      overlayPickerBtn: document.getElementById('sgOverlayPickerBtn'),
      restartBtn: document.getElementById('sgRestartBtn'),
      pickerBtn: document.getElementById('sgPickerBtn')
    };
    if (!dom.picker) return;

    dom.restartBtn.addEventListener('click', function () { if (state) startGame(state.difficulty); });
    dom.overlayRestartBtn.addEventListener('click', function () { if (state) startGame(state.difficulty); });
    dom.pickerBtn.addEventListener('click', function () { clearInterval(state && state.roundInterval); renderPicker(); });
    dom.overlayPickerBtn.addEventListener('click', function () { clearInterval(state && state.roundInterval); renderPicker(); });

    renderPicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
