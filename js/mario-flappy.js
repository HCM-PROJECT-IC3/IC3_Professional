/* ════════════════════════════════════════════════════════════
   js/mario-flappy.js — Mini-game "Chim Vượt Ải"
   Flappy Bird (vỗ cánh né cột ống) + Mario (vượt qua 5 màn cố định,
   mỗi màn kết thúc bằng 1 cột cờ) + câu hỏi trắc nghiệm IC3 làm
   "cổng kiểm tra" giữa màn. Canvas 2D thuần, không phụ thuộc thư viện
   ngoài — cùng cấu trúc (picker độ khó → chơi → overlay kết quả) như
   js/sort-game.js để đồng bộ với các mini-game khác trong Khu Vui Chơi.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BEST_KEY = 'ic3_mario_flappy_best';

  var DIFFICULTIES = [
    { id: 'easy', name: 'Dễ', icon: '🟢', gravity: 0.30, flap: -6.0, pipeGap: 176, speed: 2.3, spacing: 265, desc: 'Khoảng hở rộng, bay chậm — hợp cho người mới làm quen.' },
    { id: 'medium', name: 'Vừa', icon: '🟡', gravity: 0.38, flap: -6.6, pipeGap: 152, speed: 2.9, spacing: 235, desc: 'Tốc độ & khoảng hở cân bằng — thử thách vừa phải.' },
    { id: 'hard', name: 'Khó', icon: '🔴', gravity: 0.46, flap: -7.2, pipeGap: 130, speed: 3.5, spacing: 210, desc: 'Bay nhanh, khe hẹp — dành cho cao thủ IC3.' }
  ];

  var LEVELS = [
    { id: 1, name: 'Màn 1 — Khởi động', pipes: 6 },
    { id: 2, name: 'Màn 2 — Tăng tốc', pipes: 8 },
    { id: 3, name: 'Màn 3 — Thử thách', pipes: 10 },
    { id: 4, name: 'Màn 4 — Gian nan', pipes: 12 },
    { id: 5, name: 'Màn 5 — Chung kết', pipes: 15 }
  ];

  var CONTEXT_KEY = 'eduquiz_minigame_context';

  var CANVAS_W = 800, CANVAS_H = 420;
  var GROUND_H = 44;
  var PIPE_W = 56;
  var GATE_W = 16;
  var FLAG_W = 10;
  var BIRD_R = 15;
  var BIRD_X = 150;
  var HIT_INVINCIBLE_MS = 1200;
  var SHIELD_MS = 2200;

  // ── Câu hỏi dự phòng (dùng khi không tải được data/ic3/minitests/*.json,
  //    ví dụ mở file trực tiếp bằng file:// không qua server) ──
  var FALLBACK_QUESTIONS = [
    { question: 'RAM là viết tắt của loại bộ nhớ nào trong máy tính?', options: ['Bộ nhớ truy cập ngẫu nhiên', 'Bộ nhớ chỉ đọc', 'Ổ đĩa cứng', 'Bộ xử lý trung tâm'], correct: 'Bộ nhớ truy cập ngẫu nhiên', explanation: 'RAM (Random Access Memory) là bộ nhớ tạm thời, lưu dữ liệu khi máy đang chạy.' },
    { question: 'Thiết bị nào dùng để nhập dữ liệu hình ảnh vào máy tính?', options: ['Máy quét (Scanner)', 'Loa', 'Máy in', 'Màn hình'], correct: 'Máy quét (Scanner)', explanation: 'Máy quét chuyển hình ảnh/giấy tờ thành dữ liệu số để đưa vào máy tính.' },
    { question: 'Mật khẩu mạnh nên có đặc điểm gì?', options: ['Kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt', 'Là ngày sinh của bạn', 'Giống nhau cho mọi tài khoản', 'Chỉ gồm chữ cái'], correct: 'Kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt', explanation: 'Mật khẩu càng đa dạng ký tự càng khó bị dò/đoán.' },
    { question: 'Phần mềm nào dùng để soạn thảo văn bản trong bộ Microsoft Office?', options: ['Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Access'], correct: 'Microsoft Word', explanation: 'Word là phần mềm soạn thảo văn bản; Excel dùng cho bảng tính, PowerPoint cho trình chiếu.' },
    { question: 'Đâu là một ví dụ về hành vi bắt nạt trực tuyến?', options: ['Nhắn tin đe dọa, xúc phạm người khác trên mạng', 'Kết bạn với người quen', 'Chia sẻ bài viết học tập', 'Gửi lời chúc sinh nhật'], correct: 'Nhắn tin đe dọa, xúc phạm người khác trên mạng', explanation: 'Bắt nạt trực tuyến là dùng công nghệ để đe dọa, quấy rối người khác.' },
    { question: 'Tập tin có đuôi .jpg thường chứa loại dữ liệu gì?', options: ['Hình ảnh', 'Âm thanh', 'Văn bản', 'Chương trình cài đặt'], correct: 'Hình ảnh', explanation: '.jpg/.jpeg/.png là các định dạng ảnh phổ biến.' },
    { question: 'Bộ phận nào được coi là "bộ não" của máy tính?', options: ['CPU (Bộ xử lý trung tâm)', 'RAM', 'Ổ cứng', 'Bàn phím'], correct: 'CPU (Bộ xử lý trung tâm)', explanation: 'CPU thực hiện các phép tính và xử lý lệnh của máy tính.' },
    { question: 'Khi nhận được email yêu cầu cung cấp mật khẩu, bạn nên làm gì?', options: ['Không cung cấp và báo cáo email đáng ngờ', 'Trả lời ngay mật khẩu', 'Chuyển tiếp cho bạn bè', 'Nhấp vào mọi liên kết trong email'], correct: 'Không cung cấp và báo cáo email đáng ngờ', explanation: 'Đây có thể là email lừa đảo (phishing) — không nên chia sẻ thông tin đăng nhập.' }
  ];

  var state = {
    phase: 'picker', // picker | playing | question | levelComplete | gameClear | gameOver
    difficulty: null,
    levelIndex: 0,
    score: 0,
    lives: 3,
    bird: { y: CANVAS_H / 2, vy: 0 },
    obstacles: [],
    queue: [],
    pipesPassed: 0,
    invincibleUntil: 0,
    shieldUntil: 0,
    groundOffset: 0,
    pendingGate: null,
    rafId: null,
    lastTs: 0,
    enableKnowledgeGate: false
  };

  var questionPool = [];
  var questionsLoaded = false;

  /* ---------- Bối cảnh từ Quiz (nếu được mở từ bài thi vừa làm/đang
     làm — xem js/quiz-engine.js § _writeMiniGameContext()). KHÔNG có bộ
     câu hỏi riêng nào ở đây: context chỉ cho biết ĐÚNG category/level/
     topic vừa thi để tải lại đúng file nhỏ trong data/ic3/minitests/.
     Đọc 1 LẦN rồi xoá ngay — tránh 1 context cũ (bài thi trước) còn sót
     lại nếu sau đó học sinh mở game trực tiếp từ Khu Vui Chơi (không qua
     Quiz) ở 1 phiên chơi khác. ---------- */
  var quizContext = null;
  function readQuizContext() {
    try {
      var raw = localStorage.getItem(CONTEXT_KEY);
      localStorage.removeItem(CONTEXT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  var dom = {};

  function $(id) { return document.getElementById(id); }

  function cacheDom() {
    dom.subtitle = $('mfSubtitle');
    dom.contextBanner = $('mfContextBanner');
    dom.gateToggleWrap = $('mfGateToggleWrap');
    dom.gateToggle = $('mfGateToggle');
    dom.backToQuizBtn = $('mfBackToQuizBtn');
    dom.picker = $('mfPicker');
    dom.play = $('mfPlay');
    dom.hearts = $('mfHearts');
    dom.score = $('mfScore');
    dom.level = $('mfLevel');
    dom.canvas = $('mfCanvas');
    dom.ctx = dom.canvas.getContext('2d');
    dom.questionOverlay = $('mfQuestionOverlay');
    dom.questionText = $('mfQuestionText');
    dom.questionOptions = $('mfQuestionOptions');
    dom.questionExplain = $('mfQuestionExplain');
    dom.questionFooter = $('mfQuestionFooter');
    dom.questionContinueBtn = $('mfQuestionContinueBtn');
    dom.levelCompleteOverlay = $('mfLevelCompleteOverlay');
    dom.levelCompleteIcon = $('mfLevelCompleteIcon');
    dom.levelCompleteTitle = $('mfLevelCompleteTitle');
    dom.levelCompleteSub = $('mfLevelCompleteSub');
    dom.levelCompleteStats = $('mfLevelCompleteStats');
    dom.nextLevelBtn = $('mfNextLevelBtn');
    dom.levelPickerBtn = $('mfLevelPickerBtn');
    dom.gameClearOverlay = $('mfGameClearOverlay');
    dom.gameClearSub = $('mfGameClearSub');
    dom.gameClearStats = $('mfGameClearStats');
    dom.clearRestartBtn = $('mfClearRestartBtn');
    dom.clearPickerBtn = $('mfClearPickerBtn');
    dom.gameOverOverlay = $('mfGameOverOverlay');
    dom.gameOverSub = $('mfGameOverSub');
    dom.gameOverStats = $('mfGameOverStats');
    dom.retryBtn = $('mfRetryBtn');
    dom.gameOverPickerBtn = $('mfGameOverPickerBtn');
    dom.restartBtn = $('mfRestartBtn');
    dom.pickerBtn = $('mfPickerBtn');
  }

  // fetch() trần không có timeout mặc định — trên mạng trường học yếu, 1
  // request treo lơ lửng sẽ khiến questionsLoaded không bao giờ thành true,
  // âm thầm giữ game ở bộ câu hỏi dự phòng (FALLBACK_QUESTIONS) suốt cả
  // ván thay vì câu hỏi đúng chủ đề — cùng vấn đề mà
  // js/quiz-engine.js § _fetchJsonWithTimeout() đã xử lý cho trang Quiz
  // chính, áp dụng lại ở đây (bản rút gọn, không cần retry vì mọi nhánh
  // gọi hàm này đều đã có .catch() rơi về bộ câu hỏi dự phòng).
  function fetchWithTimeout(url, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    return fetch(url, { signal: controller.signal }).finally(function () { clearTimeout(timer); });
  }

  function questionsFromLists(lists) {
    var pool = [];
    lists.forEach(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (q) {
        if (q && q.type === 'multi' && Array.isArray(q.options) && Array.isArray(q.correct) && q.correct.length === 1) {
          pool.push({ question: q.question, options: q.options, correct: q.correct[0], explanation: q.explanation || '' });
        }
      });
    });
    return pool;
  }

  /* ---------- Tải ngân hàng câu hỏi IC3 (có fallback) ----------
     KHÔNG tạo bộ câu hỏi riêng cho mini-game: luôn đọc từ chính
     data/ic3/minitests-manifest.json + data/ic3/minitests/*.json mà
     js/quiz-engine.js đang dùng. Nếu được mở từ 1 bài thi (quizContext
     có catId/levelId/topic — xem readQuizContext()), ưu tiên tải ĐÚNG
     file câu hỏi của chủ đề vừa thi; nếu không có context (mở trực tiếp
     từ Khu Vui Chơi) hoặc file đó rỗng, rơi về lấy ngẫu nhiên vài chủ đề
     như trước. ---------- */
  function loadQuestionPool() {
    fetchWithTimeout('data/ic3/minitests-manifest.json', 8000)
      .then(function (res) { if (!res.ok) throw new Error('manifest'); return res.json(); })
      .then(function (manifest) {
        var topicPath = null;
        if (quizContext && quizContext.catId && quizContext.levelId && quizContext.topic) {
          var program = manifest[quizContext.catId + '__' + quizContext.levelId];
          topicPath = program && program[quizContext.topic];
        }
        if (topicPath) {
          return fetchWithTimeout('data/ic3/' + topicPath, 8000)
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) {
              var pool = questionsFromLists([list]);
              if (pool.length) return pool;
              return loadRandomPool(manifest); // file chủ đề không có câu "multi" đơn đáp án phù hợp → rơi về ngẫu nhiên
            })
            .catch(function () { return loadRandomPool(manifest); });
        }
        return loadRandomPool(manifest);
      })
      .then(function (pool) {
        questionPool = pool && pool.length ? pool : FALLBACK_QUESTIONS.slice();
        questionsLoaded = true;
      })
      .catch(function () {
        questionPool = FALLBACK_QUESTIONS.slice();
        questionsLoaded = true;
      });
  }

  function loadRandomPool(manifest) {
    var allPaths = [];
    Object.keys(manifest).forEach(function (program) {
      var topics = manifest[program];
      Object.keys(topics).forEach(function (topic) { allPaths.push(topics[topic]); });
    });
    // Lấy ngẫu nhiên tối đa 6 file chủ đề để không tải quá nhiều dữ liệu.
    var picked = shuffle(allPaths).slice(0, 6);
    return Promise.all(picked.map(function (p) {
      return fetchWithTimeout('data/ic3/' + p, 8000).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    })).then(questionsFromLists);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickQuestion() {
    var pool = questionsLoaded && questionPool.length ? questionPool : FALLBACK_QUESTIONS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- Kỷ lục (localStorage, theo từng độ khó) ---------- */
  function readBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveBest(diffId, levelReached, score) {
    var best = readBest();
    var cur = best[diffId] || { bestLevel: 0, bestScore: 0 };
    var changed = false;
    if (levelReached > cur.bestLevel) { cur.bestLevel = levelReached; changed = true; }
    if (score > cur.bestScore) { cur.bestScore = score; changed = true; }
    best[diffId] = cur;
    if (changed) { try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) {} }
    return changed;
  }

  /* ---------- Bối cảnh Quiz: banner + toggle cổng câu hỏi + nút quay lại ---------- */
  function renderContextUi() {
    if (quizContext && quizContext.topic) {
      var scoreHtml = typeof quizContext.scorePercent === 'number'
        ? ' · Điểm bài thi: <strong>' + quizContext.scorePercent + '%</strong>'
        : '';
      dom.contextBanner.innerHTML = '<i class="fa-solid fa-book-open"></i> Chủ đề vừa thi: <strong>' + quizContext.topic + '</strong>' + scoreHtml;
      dom.contextBanner.style.display = '';
    } else {
      dom.contextBanner.style.display = 'none';
    }

    state.enableKnowledgeGate = !!(quizContext && quizContext.enableKnowledgeGate);
    dom.gateToggle.checked = state.enableKnowledgeGate;

    var showBack = !!(quizContext && (quizContext.source === 'result' || quizContext.source === 'gamebreak'));
    dom.backToQuizBtn.style.display = showBack ? '' : 'none';
  }

  function bindContextControls() {
    dom.gateToggle.addEventListener('change', function () {
      state.enableKnowledgeGate = dom.gateToggle.checked;
    });
    dom.backToQuizBtn.addEventListener('click', function () {
      // Game được nhúng qua <iframe> cùng origin (Khu Vui Chơi hoặc "Giải
      // lao" giữa bài — xem js/quiz-engine.js § showGameBreak()/
      // openMarioFlappyReward()) — bấm hộ đúng nút "quay lại" tương ứng ở
      // trang cha thay vì tự đóng iframe (iframe không tự đóng được chính
      // nó/modal chứa nó).
      try {
        var parentDoc = window.parent && window.parent.document;
        var continueBtn = parentDoc && parentDoc.getElementById('gameBreakContinueBtn');
        var closeBtn = parentDoc && parentDoc.getElementById('closeMarioFlappyModalBtn');
        if (continueBtn && parentDoc.getElementById('gameBreakOverlay')?.classList.contains('show')) continueBtn.click();
        else if (closeBtn) closeBtn.click();
      } catch (e) { /* khác origin hoặc không nằm trong iframe — bỏ qua, chỉ ẩn nút này thôi cũng không sao */ }
    });
  }

  /* ---------- Màn hình chọn độ khó ---------- */
  function renderPicker() {
    var best = readBest();
    dom.subtitle.textContent = 'Chọn độ khó để bắt đầu hành trình 5 màn';
    dom.picker.innerHTML = '';
    DIFFICULTIES.forEach(function (d) {
      var b = best[d.id];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'mf-diff-card';
      card.innerHTML =
        '<div class="mf-diff-icon">' + d.icon + '</div>' +
        '<div class="mf-diff-body">' +
          '<div class="mf-diff-name">' + d.name + '</div>' +
          '<div class="mf-diff-desc">' + d.desc + '</div>' +
          '<div class="mf-diff-meta">5 màn · tăng dần độ khó</div>' +
          (b ? '<div class="mf-diff-best">🏆 Màn xa nhất: ' + b.bestLevel + '/5 · Điểm cao: ' + b.bestScore + '</div>' : '');
      card.addEventListener('click', function () { startRun(d, 0); });
      dom.picker.appendChild(card);
    });
    dom.picker.style.display = '';
    dom.play.style.display = 'none';
    hideAllOverlays();
    state.phase = 'picker';
  }

  function hideAllOverlays() {
    [dom.questionOverlay, dom.levelCompleteOverlay, dom.gameClearOverlay, dom.gameOverOverlay].forEach(function (el) {
      el.classList.remove('show');
    });
  }

  /* ---------- Bắt đầu 1 lượt chơi (từ màn levelIndex) ---------- */
  function startRun(difficulty, levelIndex) {
    state.difficulty = difficulty;
    state.levelIndex = levelIndex;
    state.score = 0;
    dom.picker.style.display = 'none';
    dom.play.style.display = '';
    startLevel();
  }

  function startLevel() {
    hideAllOverlays();
    var level = LEVELS[state.levelIndex];
    state.lives = 3;
    state.bird.y = CANVAS_H / 2;
    state.bird.vy = 0;
    state.obstacles = [];
    state.pipesPassed = 0;
    state.invincibleUntil = 0;
    state.shieldUntil = 0;
    state.groundOffset = 0;
    state.pendingGate = null;

    // Hàng đợi chướng ngại vật của màn: N cột ống, kết thúc bằng cột cờ.
    // Chỉ chèn 1 "cổng câu hỏi" ở giữa màn khi state.enableKnowledgeGate
    // bật (mặc định TẮT — xem renderContextUi()/bindContextControls()).
    var queue = [];
    var midIndex = Math.floor(level.pipes / 2);
    for (var i = 0; i < level.pipes; i++) {
      queue.push(i === midIndex && state.enableKnowledgeGate ? 'gate' : 'pipe');
    }
    queue.push('flag');
    state.queue = queue;

    dom.subtitle.textContent = level.name + ' — ' + state.difficulty.name;
    updateHud();
    state.phase = 'playing';
    if (!state.rafId) {
      state.lastTs = 0;
      state.rafId = requestAnimationFrame(loop);
    }
  }

  function updateHud() {
    var level = LEVELS[state.levelIndex];
    var hearts = '';
    for (var i = 0; i < 3; i++) {
      hearts += '<span' + (i < state.lives ? '' : ' class="mf-heart-lost"') + '>❤️</span>';
    }
    dom.hearts.innerHTML = hearts;
    dom.score.textContent = state.score;
    dom.level.textContent = level.id + '/5';
  }

  /* ---------- Input: vỗ cánh ---------- */
  function flap() {
    if (state.phase !== 'playing') return;
    state.bird.vy = state.difficulty.flap;
    if (window.EduSFX && window.EduSFX.play) { try { EduSFX.play('click'); } catch (e) {} }
  }

  function bindInput() {
    dom.canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); flap(); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); flap(); }
    });
  }

  /* ---------- Vòng lặp game ---------- */
  function loop(ts) {
    state.rafId = requestAnimationFrame(loop);
    if (!state.lastTs) state.lastTs = ts;
    var dt = ts - state.lastTs;
    state.lastTs = ts;
    var dtScale = Math.min(dt / 16.67, 2.5); // giới hạn để tránh bước nhảy lớn khi tab bị treo

    if (state.phase === 'playing') update(dtScale);
    draw();
  }

  function update(dtScale) {
    var d = state.difficulty;
    var bird = state.bird;

    bird.vy += d.gravity * dtScale;
    bird.y += bird.vy * dtScale;

    state.groundOffset = (state.groundOffset + d.speed * dtScale) % 24;

    var invincible = Date.now() < state.invincibleUntil;
    var shielded = Date.now() < state.shieldUntil;

    // Trần / đất
    if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vy = 0; }
    if (bird.y + BIRD_R > CANVAS_H - GROUND_H) {
      bird.y = CANVAS_H - GROUND_H - BIRD_R;
      if (!invincible && !shielded) hit();
    }

    // Di chuyển & dọn chướng ngại vật ra ngoài màn hình
    for (var i = state.obstacles.length - 1; i >= 0; i--) {
      var o = state.obstacles[i];
      o.x -= d.speed * dtScale;
      if (o.x < -100) state.obstacles.splice(i, 1);
    }

    // Sinh chướng ngại vật tiếp theo khi còn chỗ
    var last = state.obstacles[state.obstacles.length - 1];
    if (state.queue.length && (!last || last.x <= CANVAS_W - d.spacing)) {
      spawnNext();
    }

    // Va chạm / tương tác
    state.obstacles.forEach(function (o) {
      if (o.type === 'pipe') {
        var inX = (BIRD_X + BIRD_R > o.x && BIRD_X - BIRD_R < o.x + PIPE_W);
        if (inX && !invincible && !shielded) {
          if (bird.y - BIRD_R < o.gapY || bird.y + BIRD_R > o.gapY + o.gapHeight) hit();
        }
        if (!o.passed && BIRD_X - BIRD_R > o.x + PIPE_W) {
          o.passed = true;
          state.pipesPassed++;
          state.score += 10;
          updateHud();
        }
      } else if (o.type === 'gate') {
        if (!o.triggered && BIRD_X + BIRD_R > o.x && BIRD_X - BIRD_R < o.x + GATE_W) {
          o.triggered = true;
          triggerQuestion();
        }
      } else if (o.type === 'flag') {
        if (!o.reached && BIRD_X + BIRD_R > o.x) {
          o.reached = true;
          onLevelComplete();
        }
      }
    });
  }

  function spawnNext() {
    var type = state.queue.shift();
    var d = state.difficulty;
    if (type === 'pipe') {
      var minGapY = 46, maxGapY = CANVAS_H - GROUND_H - 46 - d.pipeGap;
      var gapY = minGapY + Math.random() * Math.max(10, maxGapY - minGapY);
      state.obstacles.push({ type: 'pipe', x: CANVAS_W + 20, gapY: gapY, gapHeight: d.pipeGap, passed: false });
    } else if (type === 'gate') {
      state.obstacles.push({ type: 'gate', x: CANVAS_W + 20, triggered: false });
    } else if (type === 'flag') {
      state.obstacles.push({ type: 'flag', x: CANVAS_W + 20, reached: false });
    }
  }

  function hit() {
    state.lives--;
    updateHud();
    if (window.EduSFX && window.EduSFX.play) { try { EduSFX.play('wrong'); } catch (e) {} }
    if (state.lives <= 0) {
      onGameOver();
      return;
    }
    state.bird.y = CANVAS_H / 2;
    state.bird.vy = 0;
    state.invincibleUntil = Date.now() + HIT_INVINCIBLE_MS;
  }

  /* ---------- Cổng câu hỏi ---------- */
  function triggerQuestion() {
    state.phase = 'question';
    var q = pickQuestion();
    state.pendingGate = q;
    dom.questionText.textContent = q.question;
    dom.questionOptions.innerHTML = '';
    dom.questionExplain.style.display = 'none';
    dom.questionFooter.style.display = 'none';
    shuffle(q.options).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mf-option';
      btn.textContent = opt;
      btn.addEventListener('click', function () { answerQuestion(opt, btn); });
      dom.questionOptions.appendChild(btn);
    });
    dom.questionOverlay.classList.add('show');
  }

  function answerQuestion(opt, btnEl) {
    var q = state.pendingGate;
    var correct = opt === q.correct;
    var buttons = dom.questionOptions.querySelectorAll('.mf-option');
    buttons.forEach(function (b) {
      b.disabled = true;
      if (b.textContent === q.correct) b.classList.add('mf-option-correct');
      else if (b === btnEl && !correct) b.classList.add('mf-option-wrong');
    });

    if (correct) {
      state.score += 50;
      state.shieldUntil = Date.now() + SHIELD_MS;
      if (window.EduSFX && window.EduSFX.play) { try { EduSFX.play('correct'); } catch (e) {} }
    } else {
      state.lives--;
      state.invincibleUntil = Date.now() + HIT_INVINCIBLE_MS;
      if (window.EduSFX && window.EduSFX.play) { try { EduSFX.play('wrong'); } catch (e) {} }
    }
    updateHud();

    if (q.explanation) {
      dom.questionExplain.textContent = (correct ? '✅ Chính xác! ' : '❌ Chưa đúng — đáp án là "' + q.correct + '". ') + q.explanation;
      dom.questionExplain.style.display = '';
    }
    dom.questionFooter.style.display = '';

    dom.questionContinueBtn.onclick = function () {
      dom.questionOverlay.classList.remove('show');
      if (state.lives <= 0) { onGameOver(); return; }
      state.phase = 'playing';
      state.bird.vy = 0;
    };
  }

  /* ---------- Qua màn / Hoàn thành / Game Over ---------- */
  function starsForLives(lives) {
    var html = '';
    for (var i = 0; i < 3; i++) {
      html += '<span class="mf-star">' + (i < lives ? '⭐' : '☆') + '</span>';
    }
    return html;
  }

  function onLevelComplete() {
    state.phase = 'levelComplete';
    var level = LEVELS[state.levelIndex];
    var isLast = state.levelIndex >= LEVELS.length - 1;
    var isNewBest = saveBest(state.difficulty.id, level.id, state.score);

    if (window.EduSFX && window.EduSFX.play) { try { EduSFX.play(isLast ? 'win' : 'match'); } catch (e) {} }
    recordSessionIfPossible(level.id, isLast);

    if (isLast) {
      dom.gameClearSub.textContent = isNewBest
        ? 'Kỷ lục mới ở độ khó ' + state.difficulty.name + '! 🎉'
        : 'Bạn đã bay qua trọn vẹn cả 5 màn ở độ khó ' + state.difficulty.name + '.';
      dom.gameClearStats.innerHTML = '<div>' + state.score + '<span>Điểm</span></div>';
      dom.gameClearOverlay.classList.add('show');
      return;
    }

    dom.levelCompleteIcon.innerHTML = starsForLives(state.lives);
    dom.levelCompleteTitle.textContent = 'Qua ' + level.name + '!';
    dom.levelCompleteSub.textContent = isNewBest ? 'Kỷ lục mới! 🎉' : 'Chuẩn bị cho màn tiếp theo, khó hơn một chút.';
    dom.levelCompleteStats.innerHTML =
      '<div>' + state.score + '<span>Điểm</span></div>' +
      '<div>' + state.lives + '/3<span>Mạng còn lại</span></div>';
    dom.levelCompleteOverlay.classList.add('show');
  }

  function onGameOver() {
    state.phase = 'gameOver';
    hideAllOverlays();
    var level = LEVELS[state.levelIndex];
    saveBest(state.difficulty.id, Math.max(0, level.id - 1), state.score);
    if (window.EduSFX && window.EduSFX.play) { try { EduSFX.play('lose'); } catch (e) {} }
    recordSessionIfPossible(Math.max(0, level.id - 1), false);
    dom.gameOverSub.textContent = 'Dừng chân ở ' + level.name + ' (độ khó ' + state.difficulty.name + ').';
    dom.gameOverStats.innerHTML = '<div>' + state.score + '<span>Điểm</span></div>';
    dom.gameOverOverlay.classList.add('show');
  }

  function recordSessionIfPossible(levelReached, cleared) {
    try {
      if (typeof EduGamification === 'undefined' || !EduGamification.recordGameSession) return;
      var student = null;
      try { student = JSON.parse(localStorage.getItem('eduquiz_current_student') || 'null'); } catch (e) { student = null; }
      student = student || {}; // XP chỉ lưu trên máy (js/gamification.js) — chưa chọn học sinh ở lobby vẫn được cộng

      EduGamification.recordGameSession('mario-flappy', {
        score: state.score, // miniGameScore — TÁCH RIÊNG khỏi điểm Quiz, không ghi đè/ảnh hưởng eduquiz_records
        scoreType: 'score',
        levelReached: levelReached,
        cleared: !!cleared,
        difficulty: state.difficulty.id,
        knowledgeGateUsed: state.enableKnowledgeGate,
        // Bối cảnh Quiz vừa thi (nếu có) — chỉ để đối chiếu/báo cáo thêm,
        // KHÔNG dùng để tính lại điểm Quiz hay thay thế quizScore.
        quizTopic: (quizContext && quizContext.topic) || null,
        quizScorePercent: (quizContext && typeof quizContext.scorePercent === 'number') ? quizContext.scorePercent : null,
        studentName: student.name || '',
        studentClass: student.class || '',
        studentSchool: student.school || ''
      });
    } catch (e) { /* ghi XP là phụ — không được làm hỏng màn kết quả */ }
  }

  /* ---------- Vẽ ---------- */
  function draw() {
    var ctx = dom.ctx;
    // Bầu trời
    var sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#17b3a3');
    sky.addColorStop(1, '#8fa4ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Mây trang trí (tĩnh, chỉ để đỡ trống)
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    [[90, 60, 30], [260, 100, 22], [520, 50, 26], [680, 120, 20]].forEach(function (c) {
      ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill();
    });

    // Chướng ngại vật
    state.obstacles.forEach(function (o) {
      if (o.type === 'pipe') drawPipe(ctx, o);
      else if (o.type === 'gate') drawGate(ctx, o);
      else if (o.type === 'flag') drawFlag(ctx, o);
    });

    // Đất (sọc cuộn để tạo cảm giác di chuyển)
    ctx.fillStyle = '#2f40b2';
    ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, GROUND_H);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (var gx = -state.groundOffset; gx < CANVAS_W; gx += 24) {
      ctx.fillRect(gx, CANVAS_H - GROUND_H, 12, 8);
    }

    drawBird(ctx);
  }

  function drawPipe(ctx, o) {
    ctx.fillStyle = '#17b3a3';
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 2;
    // Ống trên
    ctx.fillRect(o.x, 0, PIPE_W, o.gapY);
    ctx.strokeRect(o.x, 0, PIPE_W, o.gapY);
    ctx.fillRect(o.x - 6, Math.max(0, o.gapY - 22), PIPE_W + 12, 22);
    ctx.strokeRect(o.x - 6, Math.max(0, o.gapY - 22), PIPE_W + 12, 22);
    // Ống dưới
    var bottomY = o.gapY + o.gapHeight;
    var bottomH = CANVAS_H - GROUND_H - bottomY;
    ctx.fillRect(o.x, bottomY, PIPE_W, bottomH);
    ctx.strokeRect(o.x, bottomY, PIPE_W, bottomH);
    ctx.fillRect(o.x - 6, bottomY, PIPE_W + 12, 22);
    ctx.strokeRect(o.x - 6, bottomY, PIPE_W + 12, 22);
  }

  function drawGate(ctx, o) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ff8f1f';
    ctx.fillRect(o.x, 0, GATE_W, CANVAS_H - GROUND_H);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Baloo 2, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', o.x + GATE_W / 2, CANVAS_H / 2);
  }

  function drawFlag(ctx, o) {
    ctx.fillStyle = '#e1e6f4';
    ctx.fillRect(o.x, 40, FLAG_W, CANVAS_H - GROUND_H - 40);
    ctx.fillStyle = '#ff8f1f';
    ctx.beginPath();
    ctx.moveTo(o.x + FLAG_W, 44);
    ctx.lineTo(o.x + FLAG_W + 34, 58);
    ctx.lineTo(o.x + FLAG_W, 72);
    ctx.closePath();
    ctx.fill();
  }

  function drawBird(ctx) {
    var invincible = Date.now() < state.invincibleUntil;
    var shielded = Date.now() < state.shieldUntil;
    var blink = invincible && Math.floor(Date.now() / 100) % 2 === 0;
    if (blink) return;

    var bird = state.bird;
    var angle = Math.max(-0.5, Math.min(0.9, bird.vy / 12));

    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(angle);

    if (shielded) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_R + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = '#ff8f1f';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();
    // Cánh
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(-4, 2, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Mỏ
    ctx.fillStyle = '#ffb938';
    ctx.beginPath();
    ctx.moveTo(BIRD_R - 3, -2);
    ctx.lineTo(BIRD_R + 8, 2);
    ctx.lineTo(BIRD_R - 3, 6);
    ctx.closePath();
    ctx.fill();
    // Mắt
    ctx.fillStyle = '#1b2036';
    ctx.beginPath();
    ctx.arc(5, -5, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ---------- Nút điều hướng ---------- */
  function bindButtons() {
    dom.pickerBtn.addEventListener('click', renderPicker);
    dom.restartBtn.addEventListener('click', startLevel);
    dom.nextLevelBtn.addEventListener('click', function () {
      state.levelIndex++;
      startLevel();
    });
    dom.levelPickerBtn.addEventListener('click', renderPicker);
    dom.clearRestartBtn.addEventListener('click', function () { startRun(state.difficulty, 0); });
    dom.clearPickerBtn.addEventListener('click', renderPicker);
    dom.retryBtn.addEventListener('click', startLevel);
    dom.gameOverPickerBtn.addEventListener('click', renderPicker);
  }

  function init() {
    cacheDom();
    quizContext = readQuizContext();
    renderContextUi();
    bindContextControls();
    bindButtons();
    bindInput();
    loadQuestionPool();
    renderPicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
