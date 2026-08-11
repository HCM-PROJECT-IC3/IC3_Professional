/* ========================================
   MEMORY GAME — "Trí Nhớ Thiết Bị & Phần Mềm"
   Lật thẻ tìm cặp, chia theo chủ đề để mỗi ván không quá dài.
   Toàn bộ ảnh lấy từ img/memory-game/ (thiết bị phần cứng nhập/
   xuất, phần mềm văn phòng, hệ điều hành, trình duyệt & liên
   lạc, trợ lý AI). Thuần vanilla JS, không phụ thuộc thư viện
   ngoài — cùng phong cách js/prism-cascade.js.
   ======================================== */
(function () {
  var CATEGORIES = [
    {
      id: 'hardware',
      icon: '🖥️',
      name: 'Thiết bị phần cứng',
      desc: 'Thiết bị nhập / xuất & linh kiện máy tính',
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
      id: 'office',
      icon: '📊',
      name: 'Phần mềm văn phòng',
      desc: 'Word, Excel, PowerPoint & các ứng dụng tạo nội dung',
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
      id: 'os',
      icon: '🪟',
      name: 'Hệ điều hành',
      desc: 'Windows, macOS, Linux, iOS, Android',
      items: [
        { id: 'windows', label: 'Windows 11', img: 'img/memory-game/windown_11.png' },
        { id: 'macos',   label: 'macOS',       img: 'img/memory-game/mac_os.png' },
        { id: 'linux',   label: 'Linux',       img: 'img/memory-game/linux.png' },
        { id: 'ios',     label: 'iOS',         img: 'img/memory-game/ios.png' },
        { id: 'android', label: 'Android',     img: 'img/memory-game/adroid.png' }
      ]
    },
    {
      id: 'web',
      icon: '🌐',
      name: 'Trình duyệt & Liên lạc',
      desc: 'Trình duyệt web, Email, họp trực tuyến',
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
      id: 'ai',
      icon: '🤖',
      name: 'Trợ lý AI',
      desc: 'Các trợ lý trí tuệ nhân tạo phổ biến',
      items: [
        { id: 'chatgpt',  label: 'ChatGPT',   img: 'img/memory-game/chatgpt.png' },
        { id: 'claude',   label: 'Claude',    img: 'img/memory-game/claude.png' },
        { id: 'copilot',  label: 'Copilot',   img: 'img/memory-game/copilot.png' },
        { id: 'gemini',   label: 'Gemini',    img: 'img/memory-game/gemini.png' },
        { id: 'siri',     label: 'Siri',      img: 'img/memory-game/siri.png' }
      ]
    }
  ];

  var pickerEl, playEl, subtitleEl, boardEl, movesEl, matchesEl, timerEl, toastEl,
      overlayEl, overlayIconEl, overlayTitleEl, overlaySubEl;
  var state = { items: [], cards: [], flipped: [], matched: 0, moves: 0, lock: false, startTs: 0, timerId: null };

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildDeck(items) {
    var deck = [];
    items.forEach(function (item) {
      deck.push({ item: item, key: item.id + '-a' });
      deck.push({ item: item, key: item.id + '-b' });
    });
    return shuffle(deck);
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startTimer() {
    state.startTs = Date.now();
    clearInterval(state.timerId);
    state.timerId = setInterval(function () {
      var sec = Math.floor((Date.now() - state.startTs) / 1000);
      timerEl.textContent = fmtTime(sec);
    }, 1000);
  }
  function stopTimer() { clearInterval(state.timerId); }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 900);
  }

  /* ── Màn hình chọn chủ đề ── */
  function renderPicker() {
    pickerEl.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'mg-cat-card';
      card.innerHTML =
        '<div class="mg-cat-icon">' + cat.icon + '</div>' +
        '<div class="mg-cat-name">' + cat.name + '</div>' +
        '<div class="mg-cat-desc">' + cat.desc + '</div>' +
        '<div class="mg-cat-count">' + cat.items.length + ' cặp thẻ</div>';
      card.addEventListener('click', function () { startCategory(cat); });
      pickerEl.appendChild(card);
    });
  }

  function showPicker() {
    stopTimer();
    playEl.style.display = 'none';
    pickerEl.style.display = 'grid';
    subtitleEl.textContent = 'Chọn 1 chủ đề để bắt đầu lật thẻ tìm cặp';
  }

  function startCategory(cat) {
    state.items = cat.items;
    pickerEl.style.display = 'none';
    playEl.style.display = 'block';
    subtitleEl.textContent = cat.icon + ' ' + cat.name;
    resetGame();
  }

  /* ── Bàn chơi ── */
  function renderBoard() {
    boardEl.innerHTML = '';
    state.cards.forEach(function (card, idx) {
      var el = document.createElement('div');
      el.className = 'mg-card';
      el.dataset.index = idx;
      el.innerHTML =
        '<div class="mg-card-inner">' +
          '<div class="mg-card-face mg-card-back"></div>' +
          '<div class="mg-card-face mg-card-front">' +
            '<img src="' + card.item.img + '" alt="' + card.item.label + '">' +
            '<span>' + card.item.label + '</span>' +
          '</div>' +
        '</div>';
      el.addEventListener('click', function () { onCardClick(idx, el); });
      boardEl.appendChild(el);
    });
  }

  function onCardClick(idx, el) {
    if (state.lock) return;
    var card = state.cards[idx];
    if (el.classList.contains('is-flipped') || el.classList.contains('is-matched')) return;
    if (state.flipped.length >= 2) return;

    el.classList.add('is-flipped');
    state.flipped.push({ idx: idx, el: el, card: card });

    if (state.flipped.length === 2) {
      state.moves++;
      movesEl.textContent = state.moves;
      var a = state.flipped[0], b = state.flipped[1];
      if (a.card.item.id === b.card.item.id) {
        state.lock = true;
        setTimeout(function () {
          a.el.classList.add('is-matched');
          b.el.classList.add('is-matched');
          state.matched++;
          matchesEl.textContent = state.matched + ' / ' + state.items.length;
          state.flipped = [];
          state.lock = false;
          if (state.matched === state.items.length) onWin();
        }, 260);
      } else {
        state.lock = true;
        a.el.classList.add('is-mismatch');
        b.el.classList.add('is-mismatch');
        showToast('Chưa khớp, thử lại!');
        setTimeout(function () {
          a.el.classList.remove('is-flipped', 'is-mismatch');
          b.el.classList.remove('is-flipped', 'is-mismatch');
          state.flipped = [];
          state.lock = false;
        }, 700);
      }
    }
  }

  function onWin() {
    stopTimer();
    var sec = Math.floor((Date.now() - state.startTs) / 1000);
    overlayIconEl.textContent = '🏆';
    overlayTitleEl.textContent = 'Hoàn thành!';
    overlaySubEl.textContent = 'Xong sau ' + state.moves + ' lượt lật · ' + fmtTime(sec);
    overlayEl.classList.add('show');
  }

  function resetGame() {
    stopTimer();
    state.cards = buildDeck(state.items);
    state.flipped = [];
    state.matched = 0;
    state.moves = 0;
    state.lock = false;
    movesEl.textContent = '0';
    matchesEl.textContent = '0 / ' + state.items.length;
    timerEl.textContent = '00:00';
    overlayEl.classList.remove('show');
    renderBoard();
    startTimer();
  }

  function init() {
    pickerEl = document.getElementById('mgPicker');
    playEl = document.getElementById('mgPlay');
    subtitleEl = document.getElementById('mgSubtitle');
    boardEl = document.getElementById('mgBoard');
    movesEl = document.getElementById('mgMoves');
    matchesEl = document.getElementById('mgMatches');
    timerEl = document.getElementById('mgTimer');
    toastEl = document.getElementById('mgToast');
    overlayEl = document.getElementById('mgOverlay');
    overlayIconEl = document.getElementById('mgOverlayIcon');
    overlayTitleEl = document.getElementById('mgOverlayTitle');
    overlaySubEl = document.getElementById('mgOverlaySub');
    if (!pickerEl) return;

    document.getElementById('mgRestartBtn').addEventListener('click', resetGame);
    document.getElementById('mgOverlayRestartBtn').addEventListener('click', resetGame);
    document.getElementById('mgPickerBtn').addEventListener('click', showPicker);
    document.getElementById('mgOverlayPickerBtn').addEventListener('click', showPicker);

    renderPicker();
    showPicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
