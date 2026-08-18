/* ════════════════════════════════════════════════════════════
   js/battle-quiz.js — Mini-game "Battle Quiz" (Player vs AI).

   Cơ chế (mục 12 yêu cầu gốc):
   - Mỗi câu hỏi type "single" (đọc thật từ Firestore/quiz_data.json,
     KHÔNG bịa câu hỏi mới) có 1 mốc thời gian trả lời (bqCONFIG.timePerQuestionSec).
   - Trả lời ĐÚNG → tấn công AI. Combo càng cao, sát thương càng lớn:
       combo 1-2  → Tấn công thường   (10 dmg)
       combo 3-4  → Combo Attack      (16 dmg)
       combo 5-9  → Critical          (26 dmg)
       combo 10+  → Ultimate          (45 dmg)
   - Trả lời SAI hoặc hết giờ → mất combo, AI phản công (12 dmg cố định).
   - Ai về 0 HP trước thua; hết câu hỏi mà chưa ai về 0 → so HP còn lại.

   KHÔNG tạo Question Engine mới: đọc câu hỏi trực tiếp từ Firestore
   collection "questions" (cùng cách image-manager.html đọc), lọc theo
   chủ đề qua js/game-engine/question-topic-map.js. Nếu Firestore lỗi/
   offline, tự rơi về đọc quiz_data.json tĩnh — đúng fallback mà
   index.html/quiz-engine.js đã dùng.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = {
    startHp: 100,
    timePerQuestionSec: 15,
    maxQuestionsPerMatch: 15,
    dmg: { normal: 10, combo: 16, critical: 26, ultimate: 45, enemyCounter: 12 },
    comboTier: function (combo) {
      if (combo >= 10) return { label: '💥 ULTIMATE!', dmg: CONFIG.dmg.ultimate };
      if (combo >= 5) return { label: '⚡ CRITICAL!', dmg: CONFIG.dmg.critical };
      if (combo >= 3) return { label: '🔥 Combo Attack!', dmg: CONFIG.dmg.combo };
      return { label: 'Tấn công!', dmg: CONFIG.dmg.normal };
    },
  };

  // ── State ──
  var state = {
    playerHp: CONFIG.startHp,
    enemyHp: CONFIG.startHp,
    score: 0,
    xp: 0,
    combo: 0,
    maxCombo: 0, // (bugfix qua test) theo dõi riêng combo CAO NHẤT — không dùng state.combo lúc kết thúc vì nó thường về 0 khi thua ở câu cuối
    correctCount: 0,
    wrongCount: 0,
    questions: [],
    qIndex: 0,
    topic: null, // null = tổng hợp ngẫu nhiên
    timerHandle: null,
    timeLeftMs: 0,
    over: false,
    sessionStartedAtMs: 0,
  };

  // ── DOM refs (gán trong init()) ──
  var el = {};

  function qs(id) { return document.getElementById(id); }

  function cacheEls() {
    el.score = qs('bqScore');
    el.combo = qs('bqCombo');
    el.xp = qs('bqXp');
    el.restartBtn = qs('bqRestartBtn');
    el.playerHpFill = qs('bqPlayerHpFill');
    el.playerHpText = qs('bqPlayerHpText');
    el.enemyHpFill = qs('bqEnemyHpFill');
    el.enemyHpText = qs('bqEnemyHpText');
    el.playerAvatar = document.querySelector('.bq-fighter-player .bq-fighter-avatar');
    el.enemyAvatar = document.querySelector('.bq-fighter-enemy .bq-fighter-avatar');
    el.floaterLayer = qs('bqFloaterLayer');
    el.timerFill = qs('bqTimerFill');
    el.questionText = qs('bqQuestionText');
    el.options = qs('bqOptions');
    el.topicOverlay = qs('bqTopicOverlay');
    el.topicGrid = qs('bqTopicGrid');
    el.resultOverlay = qs('bqResultOverlay');
    el.resultIcon = qs('bqResultIcon');
    el.resultTitle = qs('bqResultTitle');
    el.resultStats = qs('bqResultStats');
    el.playAgainBtn = qs('bqPlayAgainBtn');
  }

  // ── Nạp câu hỏi ──

  function loadFromFirestore(topic) {
    if (typeof firebase === 'undefined' || !firebase.firestore) return Promise.reject(new Error('no-firebase'));
    try {
      var db = firebase.firestore();
      var query = db.collection('questions').where('type', '==', 'single');
      if (topic) query = query.where('minitestName', '==', topic);
      return query.limit(300).get().then(function (snap) {
        if (snap.empty) throw new Error('empty');
        return snap.docs.map(function (d) { return d.data(); });
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function loadFromStaticJson(topic) {
    return fetch('quiz_data.json').then(function (r) { return r.json(); }).then(function (data) {
      var out = [];
      (data.categories || []).forEach(function (c) {
        (c.levels || []).forEach(function (lv) {
          Object.keys(lv.minitests || {}).forEach(function (mtName) {
            if (topic && mtName !== topic) return;
            (lv.minitests[mtName] || []).forEach(function (q) {
              if (q.type === 'single') {
                out.push(Object.assign({}, q, { minitestName: mtName, catName: c.name, gradeName: lv.name }));
              }
            });
          });
        });
      });
      return out;
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function loadQuestions(topic) {
    return loadFromFirestore(topic).catch(function () {
      return loadFromStaticJson(topic);
    }).then(function (list) {
      var shuffled = shuffle(list).slice(0, CONFIG.maxQuestionsPerMatch);
      // Xáo cả thứ tự đáp án trong mỗi câu, giữ nguyên nội dung.
      return shuffled.map(function (q) {
        var options = shuffle(q.options || []);
        return Object.assign({}, q, { options: options });
      });
    });
  }

  // ── Màn chọn chủ đề ──

  function buildTopicOverlay() {
    var topics = (window.EduGameEngine && window.EduGameEngine.QuestionTopicMap)
      ? window.EduGameEngine.QuestionTopicMap.CANONICAL_TOPICS
      : ['1. Căn bản về công nghệ', '2. Công dân số', '3. Quản lý thông tin', '4. Sáng tạo nội dung', '5. Giao tiếp', '6. Hợp tác, cộng tác', '7. An toàn và bảo mật'];
    el.topicGrid.innerHTML = '';
    var randomBtn = document.createElement('button');
    randomBtn.type = 'button';
    randomBtn.className = 'bq-topic-btn bq-topic-random';
    randomBtn.textContent = '🎲 Tổng hợp ngẫu nhiên (mọi chủ đề)';
    randomBtn.addEventListener('click', function () { startMatch(null); });
    el.topicGrid.appendChild(randomBtn);

    topics.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bq-topic-btn';
      btn.textContent = t.replace(/^\d+\.\s*/, ''); // bỏ số thứ tự cho gọn nút
      btn.addEventListener('click', function () { startMatch(t); });
      el.topicGrid.appendChild(btn);
    });
  }

  // ── Vòng đời ván đấu ──

  function resetState() {
    state.playerHp = CONFIG.startHp;
    state.enemyHp = CONFIG.startHp;
    state.score = 0;
    state.xp = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.qIndex = 0;
    state.over = false;
    state.sessionStartedAtMs = Date.now();
    updateHud();
  }

  function startMatch(topic) {
    state.topic = topic;
    el.topicOverlay.hidden = true;
    el.resultOverlay.hidden = true;
    resetState();
    el.questionText.textContent = 'Đang tải câu hỏi…';
    el.options.innerHTML = '';
    loadQuestions(topic).then(function (qs2) {
      if (!qs2.length) {
        el.questionText.textContent = 'Không tìm thấy câu hỏi cho chủ đề này — thử lại với "Tổng hợp ngẫu nhiên".';
        return;
      }
      state.questions = qs2;
      showQuestion();
    }).catch(function (err) {
      el.questionText.textContent = 'Không tải được câu hỏi (lỗi mạng). Vui lòng thử lại.';
      console.error('[BattleQuiz] loadQuestions lỗi:', err);
    });
  }

  function showQuestion() {
    if (state.over) return;
    if (state.qIndex >= state.questions.length || state.playerHp <= 0 || state.enemyHp <= 0) {
      return endMatch();
    }
    var q = state.questions[state.qIndex];
    el.questionText.textContent = q.question || '(câu hỏi trống)';
    el.options.innerHTML = '';
    (q.options || []).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bq-option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', function () { handleAnswer(opt, btn); });
      el.options.appendChild(btn);
    });
    startTimer();
  }

  function startTimer() {
    clearInterval(state.timerHandle);
    state.timeLeftMs = CONFIG.timePerQuestionSec * 1000;
    var tickMs = 100;
    updateTimerBar();
    state.timerHandle = setInterval(function () {
      state.timeLeftMs -= tickMs;
      updateTimerBar();
      if (state.timeLeftMs <= 0) {
        clearInterval(state.timerHandle);
        handleAnswer(null, null); // hết giờ = coi như trả lời sai
      }
    }, tickMs);
  }

  function updateTimerBar() {
    var pct = Math.max(0, state.timeLeftMs / (CONFIG.timePerQuestionSec * 1000)) * 100;
    el.timerFill.style.width = pct + '%';
    el.timerFill.classList.toggle('bq-timer-low', pct < 30);
  }

  function handleAnswer(selectedText, btnEl) {
    if (state.over) return;
    clearInterval(state.timerHandle);
    var q = state.questions[state.qIndex];
    var correctAnswers = q.correct || [];
    var isCorrect = selectedText !== null && correctAnswers.indexOf(selectedText) !== -1;

    // Khoá toàn bộ nút + tô màu đúng/sai để phản hồi trực quan.
    var buttons = el.options.querySelectorAll('.bq-option-btn');
    buttons.forEach(function (b) {
      b.disabled = true;
      if (correctAnswers.indexOf(b.textContent) !== -1) b.classList.add('bq-correct');
      else if (b === btnEl) b.classList.add('bq-wrong');
    });

    if (isCorrect) {
      state.combo += 1;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.correctCount += 1;
      var tier = CONFIG.comboTier(state.combo);
      state.enemyHp = Math.max(0, state.enemyHp - tier.dmg);
      state.score += 10 + state.combo;
      showFloater(tier.label + ' -' + tier.dmg, 'bq-floater-dmg', true);
      shakeAvatar(el.enemyAvatar);
    } else {
      state.combo = 0;
      state.wrongCount += 1;
      state.playerHp = Math.max(0, state.playerHp - CONFIG.dmg.enemyCounter);
      showFloater((selectedText === null ? '⏱ Hết giờ! ' : '❌ Sai! ') + '-' + CONFIG.dmg.enemyCounter, 'bq-floater-dmg', false);
      shakeAvatar(el.playerAvatar);
    }

    updateHud();

    setTimeout(function () {
      state.qIndex += 1;
      if (state.playerHp <= 0 || state.enemyHp <= 0 || state.qIndex >= state.questions.length) {
        endMatch();
      } else {
        showQuestion();
      }
    }, 1100);
  }

  function showFloater(text, cls, onEnemySide) {
    var f = document.createElement('div');
    f.className = 'bq-floater ' + cls;
    f.textContent = text;
    f.style.left = onEnemySide ? '70%' : '15%';
    f.style.top = '10px';
    el.floaterLayer.appendChild(f);
    setTimeout(function () { f.remove(); }, 1000);
  }

  function shakeAvatar(node) {
    if (!node) return;
    node.classList.remove('bq-hit');
    void node.offsetWidth; // ép reflow để animation chạy lại được nếu bấm liên tục
    node.classList.add('bq-hit');
  }

  function updateHud() {
    el.score.textContent = state.score;
    el.combo.textContent = state.combo;
    el.xp.textContent = state.xp;
    el.playerHpFill.style.width = state.playerHp + '%';
    el.playerHpText.textContent = state.playerHp;
    el.enemyHpFill.style.width = state.enemyHp + '%';
    el.enemyHpText.textContent = state.enemyHp;
  }

  function endMatch() {
    state.over = true;
    clearInterval(state.timerHandle);
    var win = state.enemyHp <= 0 || (state.playerHp > state.enemyHp && state.playerHp > 0);
    var totalAnswered = state.correctCount + state.wrongCount;
    var accuracyPct = totalAnswered ? Math.round((state.correctCount / totalAnswered) * 100) : 0;

    // XP: base theo % chính xác, không phụ thuộc thắng/thua tuyệt đối —
    // khuyến khích trả lời đúng nhiều hơn là "ăn may" thắng với ít câu.
    state.xp = Math.round(accuracyPct * 0.5) + (win ? 20 : 0);
    updateHud();

    el.resultIcon.textContent = win ? '🏆' : '💥';
    el.resultTitle.textContent = win ? 'Chiến Thắng!' : 'Bạn Đã Thua!';
    el.resultStats.textContent =
      'Điểm: ' + state.score + '\n' +
      'Độ chính xác: ' + accuracyPct + '% (' + state.correctCount + ' đúng / ' + state.wrongCount + ' sai)\n' +
      'Combo cao nhất: ' + state.maxCombo + '\n' +
      'XP nhận được: +' + state.xp;
    el.resultOverlay.hidden = false;

    recordSessionIfPossible(win, accuracyPct);
  }

  /**
   * (Phase 3/4/6) Ghi 1 lượt chơi vào js/gamification.js § recordGameSession
   * — giống hệt pattern đã dùng ở pz-defense.js. Im lặng bỏ qua nếu thiếu
   * EduGamification hoặc chưa chọn học sinh nào ở lobby.
   */
  function recordSessionIfPossible(win, accuracyPct) {
    try {
      if (typeof EduGamification === 'undefined' || !EduGamification.recordGameSession) return;
      var student = null;
      try { student = JSON.parse(localStorage.getItem('eduquiz_current_student') || 'null'); }
      catch (e) { student = null; }
      if (!student || !student.name || !student.class) return;

      EduGamification.recordGameSession('battle-quiz', {
        score: accuracyPct,
        scoreType: 'percent',
        accuracy: accuracyPct,
        correctAnswers: state.correctCount,
        wrongAnswers: state.wrongCount,
        topic: state.topic || null,
        difficulty: null,
        durationSec: Math.max(0, Math.round((Date.now() - state.sessionStartedAtMs) / 1000)),
        studentName: student.name,
        studentClass: student.class,
        studentSchool: student.school || '',
      });
    } catch (e) { /* ghi XP là phụ — không được làm hỏng màn kết quả */ }
  }

  // ── Init ──

  function init() {
    cacheEls();
    buildTopicOverlay();
    el.restartBtn.addEventListener('click', function () {
      clearInterval(state.timerHandle);
      el.resultOverlay.hidden = true;
      el.topicOverlay.hidden = false;
    });
    el.playAgainBtn.addEventListener('click', function () {
      el.resultOverlay.hidden = true;
      el.topicOverlay.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
