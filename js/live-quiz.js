(function () {
  'use strict';

  var ROOM_COLLECTION = 'live_rooms';
  var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var DEFAULT_QUESTION_MS = 20000;
  var REVEAL_MS = 3000;
  var ROOM_LIFETIME_MS = 90 * 60 * 1000;
  var currentUser = null;
  var roomRef = null;
  var roomData = null;
  var players = [];
  var questions = [];
  var isHost = false;
  var canHostRoom = false;
  var roomUnsubscribe = null;
  var playersUnsubscribe = null;
  var answersUnsubscribe = null;
  var timerHandle = null;
  var scheduledKey = '';
  var toastHandle = null;
  var tickHandle = null;
  var myAnswer = null;
  var liveAnswers = {};
  var el = {};

  function questionMs() { return roomData && roomData.questionMs ? roomData.questionMs : DEFAULT_QUESTION_MS; }
  function byId(id) { return document.getElementById(id); }
  function serverTimestamp() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function showStatus(message, isError) {
    el.appStatus.textContent = message;
    el.appStatus.dataset.state = isError ? 'error' : 'ready';
  }
  function notify(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(toastHandle);
    toastHandle = setTimeout(function () { el.toast.classList.remove('show'); }, 2800);
  }
  function setBusy(button, busy, label) {
    button.disabled = busy;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label || 'Đang xử lý…';
    } else if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
  // Hạn mức Firebase Spark đặt lại lúc 0h giờ Thái Bình Dương ≈ 14h-15h chiều giờ Việt Nam.
  var QUOTA_MSG = 'Firebase đã hết lượt miễn phí hôm nay. Thử lại sau khoảng 14-15h chiều (giờ VN).';
  // Âm thanh/hiệu ứng (js/game-sfx.js, js/game-fx.js — chạy trên máy, không tốn lượt Firebase).
  // Mỗi khoảnh khắc chỉ phát 1 lần dù document phòng được vẽ lại nhiều lần.
  var playedFx = {};
  function fxOnce(key, fn) {
    if (playedFx[key]) return;
    playedFx[key] = true;
    try { fn(); } catch (e) { /* hiệu ứng chỉ là phụ */ }
  }
  function sfx(name) { if (window.EduSFX) window.EduSFX.play(name); }
  function cleanName(value) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, 24); }
  function createCode() {
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (byte) { return CODE_ALPHABET[byte % CODE_ALPHABET.length]; }).join('');
  }
  function shuffle(values) {
    var output = values.slice();
    for (var i = output.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = output[i]; output[i] = output[j]; output[j] = temp;
    }
    return output;
  }
  function flattenQuestions(data, topic) {
    var output = [];
    (data.categories || []).forEach(function (category) {
      (category.levels || []).forEach(function (level) {
        Object.keys(level.minitests || {}).forEach(function (topicName) {
          if (topic !== 'all' && topicName !== topic) return;
          (level.minitests[topicName] || []).forEach(function (item) {
            if (item.type !== 'single' || !item.question || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6) return;
            if (!Array.isArray(item.correct) || !item.correct.length) return;
            output.push({ question: item.question, options: item.options.map(String), correct: item.correct.map(String) });
          });
        });
      });
    });
    return output;
  }
  function prepareQuestions(raw, count) {
    return shuffle(raw).slice(0, count).map(function (item) {
      var options = shuffle(item.options);
      return { question: item.question, options: options, correct: item.correct.filter(function (answer) { return options.indexOf(answer) !== -1; }) };
    }).filter(function (item) { return item.correct.length > 0; });
  }
  function stopListeners() {
    if (roomUnsubscribe) roomUnsubscribe();
    if (playersUnsubscribe) playersUnsubscribe();
    if (answersUnsubscribe) answersUnsubscribe();
    roomUnsubscribe = null;
    playersUnsubscribe = null;
    answersUnsubscribe = null;
    clearTimeout(timerHandle);
    clearTimeout(tickHandle);
    timerHandle = null;
    scheduledKey = '';
  }
  function showEntry() {
    stopListeners();
    roomRef = null; roomData = null; players = []; questions = []; isHost = false; myAnswer = null;
    el.roomScreen.hidden = true;
    el.entryScreen.hidden = false;
    showStatus('Đã sẵn sàng tạo hoặc tham gia phòng.');
  }
  function enterRoom(code, host) {
    stopListeners();
    roomRef = firebase.firestore().collection(ROOM_COLLECTION).doc(code);
    isHost = host;
    if (host) window.history.replaceState(null, '', window.location.pathname + '?room=' + encodeURIComponent(code));
    el.entryScreen.hidden = true;
    el.roomScreen.hidden = false;
    el.roomCodeDisplay.textContent = code;
    el.startButton.hidden = !host;
    el.deleteRoomButton.hidden = !host;
    roomUnsubscribe = roomRef.onSnapshot(function (snapshot) {
      if (!snapshot.exists) {
        showEntry();
        showStatus('Phòng đã được xoá hoặc không còn tồn tại.', true);
        return;
      }
      roomData = snapshot.data();
      renderRoom();
      if (isHost && roomData.status === 'question') scheduleFinalize();
      if (isHost && roomData.status === 'reveal') scheduleAdvance();
    }, function (error) { showStatus(error.message || 'Mất kết nối với phòng.', true); });
    // Tiết kiệm lượt đọc: chỉ người dẫn nghe cả danh sách người chơi; học sinh chỉ nghe
    // document của chính mình + bảng top nằm trong document phòng (leaderboard).
    if (host) {
      playersUnsubscribe = roomRef.collection('players').orderBy('joinedAt').limit(100).onSnapshot(function (snapshot) {
        players = snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
        var cap = roomData && roomData.maxPlayers;
        if (cap && players.length > cap) {
          var batch = firebase.firestore().batch();
          players.slice(cap).forEach(function (extra) { batch.delete(roomRef.collection('players').doc(extra.id)); });
          batch.commit().catch(function () {});
          players = players.slice(0, cap);
          notify('Phòng đã đủ ' + cap + ' người, người vào sau bị loại.');
        }
        renderPlayers();
      }, function (error) { showStatus(error.message || 'Không tải được danh sách người chơi.', true); });
    }
  }
  function myScore() {
    return currentUser && roomData && roomData.scores ? (roomData.scores[currentUser.uid] || 0) : 0;
  }
  function renderBoard() {
    var board = roomData.leaderboard || [];
    el.playerCount.textContent = board.length ? String(board.length) : '';
    el.playerList.textContent = '';
    board.forEach(function (row) {
      var item = document.createElement('li');
      var name = document.createElement('span');
      var score = document.createElement('span');
      name.textContent = row.name || 'Người chơi';
      score.textContent = String(row.score || 0) + ' đ';
      item.appendChild(name); item.appendChild(score); el.playerList.appendChild(item);
    });
    if (roomData.status !== 'lobby') el.sideHint.textContent = 'Điểm của bạn: ' + myScore();
  }
  function renderPlayers() {
    el.playerCount.textContent = String(players.length);
    el.playerList.textContent = '';
    var playing = roomData && roomData.status !== 'lobby';
    var pts = (roomData && roomData.scores) || {};
    var ordered = playing ? players.slice().sort(function (a, b) { return (pts[b.id] || 0) - (pts[a.id] || 0); }) : players;
    ordered.forEach(function (player) {
      var item = document.createElement('li');
      var name = document.createElement('span');
      var score = document.createElement('span');
      name.textContent = player.name || 'Người chơi';
      score.textContent = roomData && roomData.status !== 'lobby' ? String(pts[player.id] || 0) + ' đ' : 'Sẵn sàng';
      item.appendChild(name); item.appendChild(score); el.playerList.appendChild(item);
    });
    el.startButton.disabled = players.length === 0;
    if (roomData && roomData.status === 'lobby') el.sideHint.textContent = players.length ? 'Đã đủ người? Bắt đầu khi cả lớp sẵn sàng.' : 'Chia sẻ mã phòng để mời người chơi.';
    else if (roomData && roomData.status === 'question') el.sideHint.textContent = 'Người chơi đã gửi: ' + (el.answerFeedback.dataset.count || 'đang chờ');
    else if (roomData && roomData.status === 'reveal') el.sideHint.textContent = 'Điểm của cả phòng đã được cập nhật.';
  }
  function hideViews() {
    ['lobbyView', 'questionView', 'revealView', 'finishedView', 'closedView'].forEach(function (id) { byId(id).hidden = true; });
  }
  function renderRoom() {
    if (!roomData) return;
    hideViews();
    if (roomData.status !== 'question' && answersUnsubscribe) {
      answersUnsubscribe();
      answersUnsubscribe = null;
    }
    if (!isHost) renderBoard(); else renderPlayers();
    el.roomEyebrow.textContent = isHost ? 'NGƯỜI DẪN PHÒNG' : 'NGƯỜI CHƠI';
    el.roomTitle.textContent = roomData.status === 'finished' ? 'Thử thách đã xong' : 'Phòng ' + roomRef.id;
    if (roomData.status === 'lobby') {
      el.lobbyView.hidden = false; el.startButton.hidden = !isHost;
      el.sideHint.textContent = isHost ? 'Chia sẻ mã phòng để mời người chơi.' : 'Đã vào phòng. Chờ người dẫn bắt đầu.';
    } else if (roomData.status === 'question') {
      el.questionView.hidden = false; el.startButton.hidden = true; renderQuestion();
    } else if (roomData.status === 'reveal') {
      el.revealView.hidden = false; el.startButton.hidden = true; renderReveal();
    } else if (roomData.status === 'finished') {
      el.finishedView.hidden = false; el.startButton.hidden = true; renderFinalScores();
    } else {
      el.closedView.hidden = false; el.startButton.hidden = true;
    }
  }
  function renderQuestion() {
    var question = roomData.currentQuestion || {};
    var index = roomData.questionIndex;
    el.questionProgress.textContent = 'CÂU ' + (index + 1) + ' / ' + roomData.questionCount;
    el.questionText.textContent = question.text || '';
    el.answerGrid.textContent = '';
    el.answerFeedback.textContent = isHost ? 'Đang nhận câu trả lời…' : 'Chọn một đáp án trước khi hết giờ.';
    el.answerFeedback.dataset.count = 'đang chờ';
    if (!isHost) {
      (question.options || []).forEach(function (option, choiceIndex) {
        var button = document.createElement('button');
        button.type = 'button'; button.className = 'answer-option'; button.textContent = option;
        button.addEventListener('click', function () { submitAnswer(choiceIndex, button); });
        el.answerGrid.appendChild(button);
      });
      if (myAnswer && myAnswer.questionIndex === index) lockAnswer(myAnswer.choiceIndex);
    } else loadAnswerCount(index);
    updateTimer();
  }
  function lockAnswer(choiceIndex) {
    Array.prototype.forEach.call(el.answerGrid.querySelectorAll('button'), function (button, index) {
      button.disabled = true;
      if (index === choiceIndex) { button.classList.add('is-selected'); myAnswer = { questionIndex: roomData ? roomData.questionIndex : -1, choiceIndex: choiceIndex }; }
    });
    el.answerFeedback.textContent = 'Đã nhận câu trả lời. Chờ cả lớp nhé!';
  }
  function submitAnswer(choiceIndex, button) {
    if (!roomData || roomData.status !== 'question' || !button || button.disabled) return;
    sfx('click');
    Array.prototype.forEach.call(el.answerGrid.querySelectorAll('button'), function (item) { item.disabled = true; });
    roomRef.collection('answers').doc(currentUser.uid).set({
      uid: currentUser.uid, questionIndex: roomData.questionIndex, choiceIndex: choiceIndex, submittedAt: serverTimestamp()
    }).then(function () { myAnswer = { questionIndex: roomData.questionIndex, choiceIndex: choiceIndex }; el.answerFeedback.textContent = 'Đã nhận câu trả lời. Chờ cả lớp nhé!'; })
      .catch(function (error) {
        Array.prototype.forEach.call(el.answerGrid.querySelectorAll('button'), function (item) { item.disabled = false; });
        el.answerFeedback.textContent = error.code === 'permission-denied' ? 'Hết giờ, đã gửi rồi, hoặc phòng đã đủ người.' : 'Không gửi được. Kiểm tra kết nối rồi thử lại.';
      });
  }
  function loadAnswerCount(index) {
    if (answersUnsubscribe) answersUnsubscribe();
    liveAnswers = {};
    answersUnsubscribe = roomRef.collection('answers').where('questionIndex', '==', index).limit(100).onSnapshot(function (snapshot) {
      liveAnswers = {};
      snapshot.forEach(function (doc) { liveAnswers[doc.data().uid] = doc.data(); });
      var count = snapshot.size + '/' + players.length;
      el.answerFeedback.dataset.count = count + ' người';
      el.answerFeedback.textContent = 'Đã trả lời: ' + count;
      el.sideHint.textContent = 'Người chơi đã gửi: ' + count + ' người';
    }, function (error) { showStatus(error.message || 'Không tải được tiến độ trả lời.', true); });
  }
  function updateTimer() {
    if (!roomData || !roomData.deadline || !roomData.deadline.toMillis) return;
    var remaining = Math.max(0, roomData.deadline.toMillis() - Date.now());
    el.timerText.textContent = Math.ceil(remaining / 1000) + ' giây';
    el.timerBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, remaining / questionMs())) + ')';
    clearTimeout(tickHandle);
    if (remaining > 0) tickHandle = setTimeout(function () { if (roomData && roomData.status === 'question') updateTimer(); }, Math.min(500, remaining));
  }
  function renderReveal() {
    var question = roomData.currentQuestion || {};
    var correctIndexes = question.correctIndexes || [];
    var answer = correctIndexes.map(function (index) { return (question.options || [])[index]; }).filter(Boolean).join(' / ');
    el.revealTitle.textContent = answer ? 'Đáp án chính xác' : 'Hết thời gian!';
    el.revealAnswer.textContent = answer || 'Không có đáp án được gửi.';
    el.revealSubtext.textContent = roomData.questionIndex + 1 >= roomData.questionCount ? 'Câu cuối cùng. Đang tổng kết điểm…' : 'Điểm vừa được cập nhật. Câu tiếp theo bắt đầu sau ít giây.';
    var top = (roomData.leaderboard || []).slice(0, 3);
    if (top.length) el.revealSubtext.textContent += ' Top: ' + top.map(function (pl, i) { return (i + 1) + '. ' + (pl.name || 'Người chơi') + ' (' + (pl.score || 0) + ')'; }).join(' · ');
    if (isHost) return;
    var mine = myAnswer && myAnswer.questionIndex === roomData.questionIndex ? myAnswer.choiceIndex : null;
    var right = mine !== null && correctIndexes.indexOf(mine) !== -1;
    if (mine === null) el.revealTitle.textContent = 'Bạn chưa trả lời kịp';
    else el.revealTitle.textContent = right ? 'Chính xác! 🎉' : 'Chưa đúng — cố lên!';
    var streak = roomData.streaks && currentUser ? (roomData.streaks[currentUser.uid] || 0) : 0;
    if (right && streak >= 2) el.revealTitle.textContent = '🔥 Chuỗi ' + streak + ' câu đúng! +' + Math.min(500, 100 * (streak - 1)) + ' điểm thưởng';
    fxOnce(roomRef.id + ':reveal:' + roomData.questionIndex, function () { if (mine !== null) sfx(right ? (streak >= 3 ? 'combo' : 'correct') : 'wrong'); });
  }
  function renderFinalScores() {
    el.finalScores.textContent = '';
    (roomData.leaderboard || []).forEach(function (player) {
      var item = document.createElement('li');
      var score = document.createElement('span');
      item.appendChild(document.createTextNode(player.name || 'Người chơi'));
      score.textContent = String(player.score || 0) + ' điểm';
      item.appendChild(score); el.finalScores.appendChild(item);
    });
    el.exportScoresButton.hidden = !isHost;
    var board = roomData.leaderboard || [];
    var myRank = -1;
    if (!isHost && currentUser && roomData.scores) {
      var myPoints = myScore();
      myRank = board.findIndex(function (row) { return row.score === myPoints; });
    }
    fxOnce(roomRef.id + ':finish', function () {
      if (isHost || (myRank >= 0 && myRank < 3)) {
        sfx('win');
        if (window.EduFX) window.EduFX.confetti();
      } else sfx('flip');
    });
    el.finishTitle.textContent = !isHost && currentUser && roomData.scores && roomData.scores[currentUser.uid] !== undefined ? 'Bạn đạt ' + myScore() + ' điểm' : 'Cảm ơn cả lớp đã chơi!';
  }
  // Bảng điểm ĐẦY ĐỦ cả phòng (không chỉ top 10) từ dữ liệu người dẫn đã có sẵn — không tốn lượt Firebase.
  function exportScores() {
    if (!isHost || !roomData) return;
    var pts = roomData.scores || {};
    var rows = players.map(function (p) { return { name: p.name || 'Người chơi', score: pts[p.id] || 0 }; })
      .sort(function (a, b) { return b.score - a.score; });
    var quote = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    var lines = ['Hạng,Biệt danh,Điểm'].concat(rows.map(function (r, i) { return (i + 1) + ',' + quote(r.name) + ',' + r.score; }));
    // BOM để Excel đọc đúng tiếng Việt (UTF-8).
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'bang-diem-phong-' + roomRef.id + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function scheduleFinalize() {
    var index = roomData.questionIndex;
    var key = 'question:' + index;
    if (scheduledKey === key) return;
    clearTimeout(timerHandle); scheduledKey = key;
    var deadline = roomData.deadline && roomData.deadline.toMillis ? roomData.deadline.toMillis() : Date.now();
    timerHandle = setTimeout(function () { finalizeQuestion(index); }, Math.max(0, deadline - Date.now()) + 800);
  }
  function finalizeQuestion(index) {
    if (!isHost || !roomRef || !questions[index]) return;
    var latest = roomData;
    if (!latest || latest.status !== 'question' || latest.questionIndex !== index || !latest.deadline) return;
    // 0 lượt đọc: dùng document phòng + câu trả lời đã nghe sẵn. Điểm cả lớp nằm trong
    // 1 map `scores` của document phòng nên chỉ tốn 1 lượt ghi mỗi câu (không ghi từng người chơi).
    var options = latest.currentQuestion.options;
    var correctIndexes = [];
    questions[index].correct.forEach(function (answer) {
      var correctIndex = options.indexOf(answer);
      if (correctIndex >= 0 && correctIndexes.indexOf(correctIndex) === -1) correctIndexes.push(correctIndex);
    });
    var deadlineMs = latest.deadline.toMillis();
    var scores = Object.assign({}, latest.scores || {});
    // Chuỗi đúng liên tiếp (kiểu Kahoot): từ câu đúng thứ 2 liên tiếp được thưởng +100/câu
    // trong chuỗi, tối đa +500. Sai/không trả lời → về 0. Nằm chung document phòng, không tốn thêm lượt ghi.
    var streaks = Object.assign({}, latest.streaks || {});
    var board = [];
    players.forEach(function (player) {
      var answer = liveAnswers[player.uid];
      var score = scores[player.uid] || 0;
      var correct = false;
      if (answer && answer.questionIndex === index) {
        var submittedMs = answer.submittedAt && answer.submittedAt.toMillis ? answer.submittedAt.toMillis() : deadlineMs;
        var qMs = questionMs();
        var elapsed = Math.max(0, Math.min(qMs, submittedMs - (deadlineMs - qMs)));
        correct = correctIndexes.indexOf(answer.choiceIndex) !== -1;
        if (correct) {
          var streak = (streaks[player.uid] || 0) + 1;
          var bonus = Math.min(500, 100 * (streak - 1));
          score = Math.min(25000, score + 1000 + Math.round(500 * (qMs - elapsed) / qMs) + bonus);
        }
      }
      streaks[player.uid] = correct ? (streaks[player.uid] || 0) + 1 : 0;
      scores[player.uid] = score;
      board.push({ name: player.name || 'Người chơi', score: score });
    });
    board.sort(function (x, y) { return y.score - x.score; });
    roomRef.update({
      status: 'reveal',
      currentQuestion: Object.assign({}, latest.currentQuestion, { correctIndexes: correctIndexes }),
      leaderboard: board.slice(0, 10),
      scores: scores,
      streaks: streaks,
      deadline: null
    }).catch(function (error) {
      console.error('[LiveQuiz] Không thể chốt câu trả lời:', error);
      scheduledKey = '';
      showStatus(error.code === 'resource-exhausted' ? QUOTA_MSG : 'Không chốt được câu (' + (error.code || 'lỗi') + '). Kiểm tra Rules và kết nối Firebase.', true);
    });
  }
  function scheduleAdvance() {
    var index = roomData.questionIndex;
    var key = 'reveal:' + index;
    if (scheduledKey === key) return;
    clearTimeout(timerHandle); scheduledKey = key;
    timerHandle = setTimeout(function () {
      if (index + 1 >= roomData.questionCount) {
        var room = roomRef;
        room.update({ status: 'finished', deadline: null }).then(function () {
          // Câu trả lời không còn cần sau khi chốt điểm (điểm + top 10 nằm trong document phòng).
          // TTL không xoá subcollection nên tự dọn ở đây: id answer = uid người chơi đã biết sẵn
          // → xoá thẳng, không tốn lượt đọc. Người chơi giữ lại để còn tải bảng điểm đầy đủ.
          var batch = firebase.firestore().batch();
          players.slice(0, 450).forEach(function (p) { batch.delete(room.collection('answers').doc(p.id)); });
          return batch.commit();
        }).catch(function (error) { showStatus(error.message, true); });
      } else publishQuestion(index + 1);
    }, REVEAL_MS);
  }
  function publishQuestion(index) {
    var item = questions[index];
    if (!item || !roomRef) return;
    scheduledKey = '';
    roomRef.update({
      status: 'question', questionIndex: index,
      currentQuestion: { text: item.question, options: item.options },
      deadline: firebase.firestore.Timestamp.fromMillis(Date.now() + questionMs())
    }).catch(function (error) { showStatus(error.message || 'Không thể mở câu hỏi tiếp theo.', true); });
  }
  function restoreHostQuestions(code) {
    try { var saved = JSON.parse(localStorage.getItem('eduquiz_live_host:' + code) || 'null'); questions = Array.isArray(saved) ? saved : []; }
    catch (e) { questions = []; }
  }
  async function deleteRoomData() {
    if (!isHost || !roomRef || !window.confirm('Xóa phòng cùng danh sách người chơi và câu trả lời?')) return;
    try {
      var paths = [roomRef.collection('players'), roomRef.collection('answers')];
      for (var p = 0; p < paths.length; p += 1) {
        var snapshot = await paths[p].limit(100).get();
        for (var i = 0; i < snapshot.docs.length; i += 10) {
          var batch = firebase.firestore().batch();
          snapshot.docs.slice(i, i + 10).forEach(function (doc) { batch.delete(doc.ref); });
          await batch.commit();
        }
      }
      await roomRef.delete();
      localStorage.removeItem('eduquiz_live_host:' + roomRef.id);
      showEntry();
      notify('Đã xóa dữ liệu phòng.');
    } catch (error) { showStatus(error.message || 'Không xóa được dữ liệu phòng.', true); }
  }

  el = {
    appStatus: byId('appStatus'), entryScreen: byId('entryScreen'), roomScreen: byId('roomScreen'),
    createForm: byId('createForm'), joinForm: byId('joinForm'), topicSelect: byId('topicSelect'), questionSeconds: byId('questionSeconds'), maxPlayers: byId('maxPlayers'), questionCount: byId('questionCount'),
    playerName: byId('playerName'), roomCodeInput: byId('roomCodeInput'), roomEyebrow: byId('roomEyebrow'), roomTitle: byId('roomTitle'),
    roomCodeDisplay: byId('roomCodeDisplay'), playerCount: byId('playerCount'), playerList: byId('playerList'), startButton: byId('startButton'),
    deleteRoomButton: byId('deleteRoomButton'), sideHint: byId('sideHint'), answerFeedback: byId('answerFeedback'),
    lobbyView: byId('lobbyView'), questionView: byId('questionView'), revealView: byId('revealView'), finishedView: byId('finishedView'),
    closedView: byId('closedView'), questionProgress: byId('questionProgress'), timerText: byId('timerText'), timerBar: byId('timerBar'),
    questionText: byId('questionText'), answerGrid: byId('answerGrid'), revealTitle: byId('revealTitle'), revealAnswer: byId('revealAnswer'),
    revealSubtext: byId('revealSubtext'), finishTitle: byId('finishTitle'), finalScores: byId('finalScores'), exportScoresButton: byId('exportScoresButton'), toast: byId('toast')
  };

  el.createForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = el.createForm.querySelector('button[type="submit"]');
    if (!canHostRoom) { notify('Cần tài khoản Admin, giáo viên đã duyệt hoặc điều phối để tạo phòng.'); return; }
    setBusy(button, true, 'Đang tạo phòng…');
    try {
      var response = await fetch('quiz_data.json');
      if (!response.ok) throw new Error('Không tải được ngân hàng câu hỏi.');
      var data = await response.json();
      var topic = el.topicSelect.value;
      var count = Number(el.questionCount.value);
      questions = prepareQuestions(flattenQuestions(data, topic), count);
      if (questions.length < 5) throw new Error('Chủ đề này cần tối thiểu 5 câu trắc nghiệm phù hợp.');
      var code = '';
      var ref = null;
      for (var attempt = 0; attempt < 5; attempt += 1) {
        code = createCode();
        var candidate = firebase.firestore().collection(ROOM_COLLECTION).doc(code);
        if (!(await candidate.get()).exists) { ref = candidate; break; }
      }
      if (!ref) throw new Error('Chưa tạo được mã phòng. Thử lại.');
      var batch = firebase.firestore().batch();
      batch.set(firebase.firestore().collection('live_hosts').doc(currentUser.uid), { lastCreatedAt: serverTimestamp() });
      batch.set(ref, {
        hostUid: currentUser.uid, status: 'lobby', topic: topic, questionCount: questions.length,
        questionIndex: -1, currentQuestion: null, deadline: null, createdAt: serverTimestamp(),
        questionMs: Number(el.questionSeconds.value) * 1000, maxPlayers: Number(el.maxPlayers.value),
        expiresAt: firebase.firestore.Timestamp.fromMillis(Date.now() + ROOM_LIFETIME_MS)
      });
      await batch.commit();
      localStorage.setItem('eduquiz_live_host:' + code, JSON.stringify(questions));
      enterRoom(code, true);
    } catch (error) {
      console.error('[LiveQuiz] Tạo phòng lỗi:', error);
      showStatus(error.message || 'Không tạo được phòng. Kiểm tra cấu hình Firebase.', true);
      notify(error.code === 'resource-exhausted' ? QUOTA_MSG : error.code === 'permission-denied' ? 'Không tạo được: đợi 30 giây giữa 2 lần tạo phòng, hoặc kiểm tra Rules/Anonymous Auth.' : (error.message || 'Không tạo được phòng.'));
    } finally { setBusy(button, false); }
  });

  el.joinForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = el.joinForm.querySelector('button[type="submit"]');
    var name = cleanName(el.playerName.value);
    var code = el.roomCodeInput.value.toUpperCase().replace(/[^2-9A-HJKMNP-Z]/g, '').slice(0, 8);
    if (!name || code.length !== 8) { notify('Nhập biệt danh và mã phòng đủ 8 ký tự.'); return; }
    setBusy(button, true, 'Đang vào phòng…');
    try {
      var ref = firebase.firestore().collection(ROOM_COLLECTION).doc(code);
      var snapshot = await ref.get();
      if (!snapshot.exists || snapshot.data().expiresAt.toMillis() <= Date.now()) throw new Error('Mã phòng không đúng hoặc đã hết hạn.');
      var playerRef = ref.collection('players').doc(currentUser.uid);
      var oldPlayer = await playerRef.get();
      if (!oldPlayer.exists && snapshot.data().status !== 'lobby') throw new Error('Phòng đã bắt đầu; chỉ thành viên cũ mới có thể vào lại.');
      if (!oldPlayer.exists) {
        await playerRef.set({ uid: currentUser.uid, name: name, score: 0, correct: 0, joinedAt: serverTimestamp() });
      }
      enterRoom(code, false);
    } catch (error) {
      showStatus(error.message || 'Không vào được phòng.', true);
      notify(error.code === 'resource-exhausted' ? QUOTA_MSG : error.code === 'permission-denied' ? 'Không được phép tham gia. Kiểm tra Firestore Rules.' : (error.message || 'Không vào được phòng.'));
    } finally { setBusy(button, false); }
  });

  el.startButton.addEventListener('click', function () { if (isHost && roomRef && questions.length && players.length) publishQuestion(0); });
  byId('copyCodeButton').addEventListener('click', function () {
    if (!roomRef) return;
    var link = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(roomRef.id);
    if (!navigator.clipboard || !navigator.clipboard.writeText) { notify('Link mời: ' + link); return; }
    navigator.clipboard.writeText(link).then(function () { notify('Đã sao chép link mời. Dán cho cả lớp!'); }).catch(function () { notify('Link mời: ' + link); });
  });
  el.deleteRoomButton.addEventListener('click', deleteRoomData);
  el.exportScoresButton.addEventListener('click', exportScores);
  byId('staffLoginLink').addEventListener('click', function (event) {
    event.preventDefault();
    EduFirebase.auth.signOut().finally(function () { window.location.href = 'login.html?next=live-quiz.html'; });
  });
  byId('leaveButton').addEventListener('click', function () {
    if (roomRef && !isHost && currentUser) roomRef.collection('players').doc(currentUser.uid).delete().catch(function () {});
    showEntry();
  });
  el.roomCodeInput.addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^2-9A-HJKMNP-Z]/g, '').slice(0, 8); });

  if (!window.EduFirebase || !EduFirebase.auth || !EduFirebase.db) {
    showStatus('Chưa kết nối được Firebase.', true);
    return;
  }
  showStatus('Đang xác thực thiết bị…');
  new Promise(function (resolve) {
    var unsubscribe = EduFirebase.auth.onAuthStateChanged(function (user) {
      unsubscribe();
      resolve(user);
    }, function () { resolve(null); });
  }).then(function (user) {
    return user || EduFirebase.auth.signInAnonymously().then(function (credential) { return credential.user; });
  }).then(async function (user) {
    currentUser = user;
    if (!user.isAnonymous) {
      try {
        var profile = await EduFirebase.db.collection('users').doc(user.uid).get();
        var role = profile.exists ? profile.data() : {};
        canHostRoom = role.role === 'admin' || role.role === 'coordinator' || (role.role === 'teacher' && role.approved === true);
      } catch (error) { console.warn('[LiveQuiz] Không xác minh được quyền người dẫn:', error); }
    }
    byId('createRoomButton').disabled = !canHostRoom;
    byId('staffLoginLink').hidden = canHostRoom;
    el.entryScreen.hidden = false;
    showStatus(canHostRoom
      ? 'Đã xác minh quyền người dẫn. Học sinh có thể tham gia bằng mã phòng.'
      : 'Đã kết nối. Đăng nhập nhân sự để tạo phòng; học sinh có thể nhập mã để tham gia.');
    var code = new URLSearchParams(window.location.search).get('room');
    if (code) el.roomCodeInput.value = code.toUpperCase().slice(0, 8);
    code = code && code.toUpperCase();
    if (code && localStorage.getItem('eduquiz_live_host:' + code)) {
      restoreHostQuestions(code);
      enterRoom(code, true);
    }
  }).catch(function (error) {
    console.error('[LiveQuiz] Anonymous Auth lỗi:', error);
    showStatus('Chưa bật Firebase Anonymous Auth. Bật provider Anonymous trong Firebase Console.', true);
  });
})();