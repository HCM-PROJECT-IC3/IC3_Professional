/* ========================================
   SUDOKU — "Sudoku Trí Tuệ" mini-game
   Sudoku 9x9 chuẩn: sinh lưới đã giải bằng backtracking ngẫu
   nhiên, rồi loại bỏ dần các ô trong khi kiểm tra số nghiệm để
   đảm bảo đề luôn có lời giải DUY NHẤT. Thuần vanilla JS, không
   phụ thuộc thư viện ngoài — cùng phong cách js/memory-game.js.
   ======================================== */
(function () {
  var DIFFICULTIES = [
    { id: 'easy', icon: '🌱', name: 'Dễ', desc: 'Nhiều ô gợi ý sẵn, phù hợp làm quen', clues: 42, hints: 5 },
    { id: 'medium', icon: '⚡', name: 'Trung bình', desc: 'Cân bằng giữa tốc độ và suy luận', clues: 34, hints: 3 },
    { id: 'hard', icon: '🔥', name: 'Khó', desc: 'Ít ô gợi ý, cần suy luận chặt chẽ', clues: 27, hints: 1 }
  ];

  var MAX_MISTAKES = 3;

  var state = null; // gán trong startGame()
  var dom = {};

  /* ---------- Tiện ích lưới 9x9 (mảng phẳng 81 phần tử) ---------- */

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function isValid(grid, row, col, n) {
    var boxR = Math.floor(row / 3) * 3, boxC = Math.floor(col / 3) * 3;
    for (var i = 0; i < 9; i++) {
      if (grid[row * 9 + i] === n) return false;
      if (grid[i * 9 + col] === n) return false;
    }
    for (var r = boxR; r < boxR + 3; r++) {
      for (var c = boxC; c < boxC + 3; c++) {
        if (grid[r * 9 + c] === n) return false;
      }
    }
    return true;
  }

  function fillGrid(grid) {
    var idx = grid.indexOf(0);
    if (idx === -1) return true;
    var row = Math.floor(idx / 9), col = idx % 9;
    var nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (var i = 0; i < nums.length; i++) {
      var n = nums[i];
      if (isValid(grid, row, col, n)) {
        grid[idx] = n;
        if (fillGrid(grid)) return true;
        grid[idx] = 0;
      }
    }
    return false;
  }

  function generateSolved() {
    var grid = new Array(81).fill(0);
    fillGrid(grid);
    return grid;
  }

  // Đếm số nghiệm, dừng sớm khi đạt cap (dùng để kiểm tra "nghiệm duy nhất").
  function countSolutions(grid, cap) {
    var g = grid.slice();
    var count = 0;
    function helper() {
      if (count >= cap) return;
      var idx = g.indexOf(0);
      if (idx === -1) { count++; return; }
      var row = Math.floor(idx / 9), col = idx % 9;
      for (var n = 1; n <= 9; n++) {
        if (count >= cap) return;
        if (isValid(g, row, col, n)) {
          g[idx] = n;
          helper();
          g[idx] = 0;
        }
      }
    }
    helper();
    return count;
  }

  function makePuzzle(solved, clues) {
    var puzzle = solved.slice();
    var positions = [];
    for (var p = 0; p < 81; p++) positions.push(p);
    shuffle(positions);
    var toRemove = 81 - clues;
    var removed = 0;
    for (var i = 0; i < positions.length && removed < toRemove; i++) {
      var pos = positions[i];
      var backup = puzzle[pos];
      if (backup === 0) continue;
      puzzle[pos] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        removed++;
      } else {
        puzzle[pos] = backup;
      }
    }
    return puzzle;
  }

  /* ---------- Sinh ván chơi ---------- */

  function newPuzzle(diff) {
    var solved = generateSolved();
    var puzzle = makePuzzle(solved, diff.clues);
    return { solution: solved, puzzle: puzzle };
  }

  /* ---------- Render: màn chọn độ khó ---------- */

  function renderPicker() {
    dom.picker.innerHTML = '';
    DIFFICULTIES.forEach(function (d) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'sk-diff-card';
      card.innerHTML =
        '<span class="sk-diff-icon">' + d.icon + '</span>' +
        '<span class="sk-diff-body">' +
        '<span class="sk-diff-name">' + d.name + '</span>' +
        '<span class="sk-diff-desc">' + d.desc + '</span>' +
        '<span class="sk-diff-clues">' + d.clues + ' ô cho sẵn · ' + d.hints + ' gợi ý</span>' +
        '</span>';
      card.addEventListener('click', function () { startGame(d); });
      dom.picker.appendChild(card);
    });
    dom.picker.style.display = '';
    dom.play.style.display = 'none';
    dom.subtitle.textContent = 'Chọn độ khó để bắt đầu rèn luyện tư duy logic';
    stopTimer();
  }

  /* ---------- Bắt đầu ván mới ---------- */

  function startGame(diff) {
    var gen = newPuzzle(diff);
    state = {
      difficulty: diff,
      solution: gen.solution,
      given: gen.puzzle.slice(),
      grid: gen.puzzle.slice(),
      notes: new Array(81).fill(null).map(function () { return new Array(9).fill(false); }),
      errorSet: {},
      hintSet: {},
      selected: -1,
      mistakes: 0,
      hintsLeft: diff.hints,
      notesMode: false,
      seconds: 0,
      finished: false
    };

    dom.picker.style.display = 'none';
    dom.play.style.display = '';
    dom.subtitle.textContent = 'Mức ' + diff.name + ' — chạm ô rồi chọn số';
    dom.overlay.classList.remove('show');

    buildBoardDom();
    renderBoard();
    renderNumpad();
    updateHUD();
    startTimer();
  }

  /* ---------- Board DOM ---------- */

  function buildBoardDom() {
    dom.board.innerHTML = '';
    for (var i = 0; i < 81; i++) {
      var cell = document.createElement('div');
      cell.className = 'sk-cell';
      cell.dataset.idx = i;
      var row = Math.floor(i / 9);
      if (row === 2 || row === 5) cell.classList.add('sk-border-bottom');
      cell.addEventListener('click', function () {
        selectCell(parseInt(this.dataset.idx, 10));
      });
      dom.board.appendChild(cell);
    }
  }

  function renderBoard() {
    var cells = dom.board.children;
    var selRow = state.selected >= 0 ? Math.floor(state.selected / 9) : -1;
    var selCol = state.selected >= 0 ? state.selected % 9 : -1;
    var selBoxR = selRow >= 0 ? Math.floor(selRow / 3) : -1;
    var selBoxC = selCol >= 0 ? Math.floor(selCol / 3) : -1;
    var selValue = state.selected >= 0 ? state.grid[state.selected] : 0;

    for (var i = 0; i < 81; i++) {
      var cell = cells[i];
      var row = Math.floor(i / 9), col = i % 9;
      var boxR = Math.floor(row / 3), boxC = Math.floor(col / 3);
      var val = state.grid[i];

      cell.className = 'sk-cell';
      if (row === 2 || row === 5) cell.classList.add('sk-border-bottom');
      if (state.given[i] !== 0) cell.classList.add('given');
      if (state.errorSet[i]) cell.classList.add('error');
      if (state.hintSet[i]) cell.classList.add('hint-cell');

      if (state.selected === i) cell.classList.add('selected');
      else if (row === selRow || col === selCol || (boxR === selBoxR && boxC === selBoxC)) cell.classList.add('peer');

      if (val !== 0 && selValue !== 0 && val === selValue) cell.classList.add('same-value');

      if (val !== 0) {
        cell.textContent = val;
      } else {
        cell.textContent = '';
        var notes = state.notes[i];
        if (notes.some(Boolean)) {
          var wrap = document.createElement('div');
          wrap.className = 'sk-notes';
          for (var n = 1; n <= 9; n++) {
            var span = document.createElement('span');
            span.textContent = notes[n - 1] ? n : '';
            wrap.appendChild(span);
          }
          cell.appendChild(wrap);
        }
      }
    }
  }

  function renderNumpad() {
    dom.numpad.innerHTML = '';
    for (var n = 1; n <= 9; n++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sk-num-btn';
      btn.textContent = n;
      btn.dataset.num = n;
      btn.addEventListener('click', function () { inputNumber(parseInt(this.dataset.num, 10)); });
      dom.numpad.appendChild(btn);
    }
    updateNumpadCounts();
  }

  function updateNumpadCounts() {
    var counts = new Array(10).fill(0);
    for (var i = 0; i < 81; i++) {
      var v = state.grid[i];
      if (v !== 0 && !state.errorSet[i]) counts[v]++;
    }
    var btns = dom.numpad.children;
    for (var b = 0; b < btns.length; b++) {
      var n = parseInt(btns[b].dataset.num, 10);
      btns[b].classList.toggle('depleted', counts[n] >= 9);
    }
  }

  /* ---------- Tương tác ---------- */

  function selectCell(idx) {
    if (state.finished) return;
    state.selected = idx;
    renderBoard();
  }

  function inputNumber(n) {
    if (state.finished) return;
    var idx = state.selected;
    if (idx < 0) { showToast('Hãy chọn 1 ô trước'); return; }
    if (state.given[idx] !== 0) return;

    if (state.notesMode) {
      state.notes[idx][n - 1] = !state.notes[idx][n - 1];
      renderBoard();
      return;
    }

    delete state.hintSet[idx];
    state.notes[idx] = new Array(9).fill(false);

    if (n === state.solution[idx]) {
      state.grid[idx] = n;
      delete state.errorSet[idx];
      clearNotesForPlacement(idx, n);
      renderBoard();
      updateNumpadCounts();
      checkWin();
    } else {
      state.grid[idx] = n;
      state.errorSet[idx] = true;
      state.mistakes++;
      updateHUD();
      renderBoard();
      updateNumpadCounts();
      if (state.mistakes >= MAX_MISTAKES) {
        endGame(false);
      } else {
        showToast('❌ Sai rồi, thử lại nhé');
      }
    }
  }

  // Khi đặt đúng số vào 1 ô, tự dọn ghi chú trùng ở hàng/cột/khối liên quan
  // (tiện lợi khi dùng chế độ Ghi chú).
  function clearNotesForPlacement(idx, n) {
    var row = Math.floor(idx / 9), col = idx % 9;
    var boxR = Math.floor(row / 3) * 3, boxC = Math.floor(col / 3) * 3;
    for (var c = 0; c < 9; c++) state.notes[row * 9 + c][n - 1] = false;
    for (var r = 0; r < 9; r++) state.notes[r * 9 + col][n - 1] = false;
    for (var r2 = boxR; r2 < boxR + 3; r2++) {
      for (var c2 = boxC; c2 < boxC + 3; c2++) state.notes[r2 * 9 + c2][n - 1] = false;
    }
  }

  function eraseCell() {
    if (state.finished) return;
    var idx = state.selected;
    if (idx < 0 || state.given[idx] !== 0) return;
    state.grid[idx] = 0;
    state.notes[idx] = new Array(9).fill(false);
    delete state.errorSet[idx];
    delete state.hintSet[idx];
    renderBoard();
    updateNumpadCounts();
  }

  function toggleNotes() {
    state.notesMode = !state.notesMode;
    dom.notesBtn.classList.toggle('active', state.notesMode);
  }

  function useHint() {
    if (state.finished) return;
    if (state.hintsLeft <= 0) { showToast('Hết lượt gợi ý rồi'); return; }

    var idx = state.selected;
    var candidates = [];
    if (idx >= 0 && state.given[idx] === 0 && state.grid[idx] !== state.solution[idx]) {
      candidates = [idx];
    } else {
      for (var i = 0; i < 81; i++) {
        if (state.given[i] === 0 && state.grid[i] !== state.solution[i]) candidates.push(i);
      }
    }
    if (!candidates.length) { showToast('Không còn ô nào cần gợi ý'); return; }

    var pick = candidates[Math.floor(Math.random() * candidates.length)];
    state.grid[pick] = state.solution[pick];
    state.notes[pick] = new Array(9).fill(false);
    delete state.errorSet[pick];
    state.hintSet[pick] = true;
    state.hintsLeft--;
    state.selected = pick;

    updateHUD();
    renderBoard();
    updateNumpadCounts();
    checkWin();
  }

  /* ---------- HUD / Timer ---------- */

  function updateHUD() {
    dom.mistakes.textContent = state.mistakes + ' / ' + MAX_MISTAKES;
    dom.mistakes.classList.toggle('sk-danger', state.mistakes >= MAX_MISTAKES - 1);
    dom.hints.textContent = state.hintsLeft;
    dom.hintBadge.textContent = state.hintsLeft > 0 ? state.hintsLeft : '';
  }

  function startTimer() {
    stopTimer();
    state.seconds = 0;
    dom.timer.textContent = '00:00';
    state.timerInterval = setInterval(function () {
      state.seconds++;
      var m = Math.floor(state.seconds / 60), s = state.seconds % 60;
      dom.timer.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  }

  function stopTimer() {
    if (state && state.timerInterval) clearInterval(state.timerInterval);
    if (state) state.timerInterval = null;
  }

  var toastTimer = null;
  function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dom.toast.classList.remove('show'); }, 1400);
  }

  /* ---------- Kết thúc ván ---------- */

  function checkWin() {
    for (var i = 0; i < 81; i++) {
      if (state.grid[i] !== state.solution[i]) return;
    }
    endGame(true);
  }

  function endGame(won) {
    state.finished = true;
    state.selected = -1;
    stopTimer();

    var m = Math.floor(state.seconds / 60), s = state.seconds % 60;
    var timeStr = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    var hintsUsed = state.difficulty.hints - state.hintsLeft;

    if (won) {
      dom.overlayIcon.textContent = '🏆';
      dom.overlayTitle.textContent = 'Hoàn thành!';
      dom.overlaySub.textContent = 'Bạn đã giải xong Sudoku mức ' + state.difficulty.name + '!';
    } else {
      // Hiển thị lời giải đầy đủ để người chơi đối chiếu.
      state.grid = state.solution.slice();
      renderBoard();
      dom.overlayIcon.textContent = '💥';
      dom.overlayTitle.textContent = 'Hết lượt sai!';
      dom.overlaySub.textContent = 'Đừng nản — lời giải đã được hiển thị, thử lại ván mới nhé.';
    }
    dom.overlayStats.innerHTML =
      '<div>' + timeStr + '<span>Thời gian</span></div>' +
      '<div>' + state.mistakes + '<span>Lỗi</span></div>' +
      '<div>' + hintsUsed + '<span>Gợi ý dùng</span></div>';
    dom.overlay.classList.add('show');
  }

  /* ---------- Khởi tạo ---------- */

  function init() {
    dom = {
      subtitle: document.getElementById('skSubtitle'),
      picker: document.getElementById('skPicker'),
      play: document.getElementById('skPlay'),
      board: document.getElementById('skBoard'),
      numpad: document.getElementById('skNumpad'),
      timer: document.getElementById('skTimer'),
      mistakes: document.getElementById('skMistakes'),
      hints: document.getElementById('skHints'),
      hintBadge: document.getElementById('skHintBadge'),
      toast: document.getElementById('skToast'),
      eraseBtn: document.getElementById('skEraseBtn'),
      notesBtn: document.getElementById('skNotesBtn'),
      hintBtn: document.getElementById('skHintBtn'),
      restartBtn: document.getElementById('skRestartBtn'),
      pickerBtn: document.getElementById('skPickerBtn'),
      overlay: document.getElementById('skOverlay'),
      overlayIcon: document.getElementById('skOverlayIcon'),
      overlayTitle: document.getElementById('skOverlayTitle'),
      overlaySub: document.getElementById('skOverlaySub'),
      overlayStats: document.getElementById('skOverlayStats'),
      overlayRestartBtn: document.getElementById('skOverlayRestartBtn'),
      overlayPickerBtn: document.getElementById('skOverlayPickerBtn')
    };
    if (!dom.picker) return;

    dom.eraseBtn.addEventListener('click', eraseCell);
    dom.notesBtn.addEventListener('click', toggleNotes);
    dom.hintBtn.addEventListener('click', useHint);
    dom.restartBtn.addEventListener('click', function () { if (state) startGame(state.difficulty); });
    dom.pickerBtn.addEventListener('click', renderPicker);
    dom.overlayRestartBtn.addEventListener('click', function () { if (state) startGame(state.difficulty); });
    dom.overlayPickerBtn.addEventListener('click', renderPicker);

    document.addEventListener('keydown', function (e) {
      if (!state || state.finished || state.selected < 0) return;
      if (e.key >= '1' && e.key <= '9') inputNumber(parseInt(e.key, 10));
      else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') eraseCell();
    });

    renderPicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
