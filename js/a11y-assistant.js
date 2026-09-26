/* ============================================================
   js/a11y-assistant.js — Trợ lý trợ năng DÙNG CHUNG cho nhiều trang
   (index.html, portfolio.html, ...).

   Tự tạo nút nổi + panel bằng JS (không cần thêm markup vào HTML của
   từng trang — chỉ cần nạp css/a11y-assistant.css + file này là có).

   CHẠY HOÀN TOÀN PHÍA TRÌNH DUYỆT — không gọi Firestore/API ngoài nào,
   không lưu lịch sử hỏi đáp lên server. Lý do: nếu mỗi câu hỏi/trả lời
   đều ghi/đọc Firestore (kiểu chat realtime), số lượt đọc/ghi sẽ nhân
   theo số học sinh/giáo viên mở trang mỗi ngày — đúng vấn đề "reads
   tăng quá nhanh" đã xử lý ở nơi khác của dự án. Trợ lý này vì vậy
   KHÔNG tốn bất kỳ lượt đọc/ghi Firestore nào, dùng được cho MỌI
   người xem trang, không cần đăng nhập.

   Nâng cấp riêng cho học sinh làm bài (index.html, khi #qPanel của
   js/quiz-engine.js đang hiện câu hỏi): đọc to câu hỏi + đáp án hiện
   tại — dò DOM trực tiếp (.q-text/.option-btn), KHÔNG đụng vào biến
   nội bộ của quiz-engine.js, nên không rủi ro phá luồng làm bài/nộp
   bài đang có.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function buildMarkup() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <button type="button" class="a11y-fab" id="a11yFab" title="Trợ lý trợ năng">
        <i class="fa-solid fa-universal-access"></i>
      </button>
      <div class="a11y-panel" id="a11yPanel" hidden>
        <div class="a11y-head" id="a11yHead">
          <span><i class="fa-solid fa-universal-access"></i> Trợ lý trợ năng</span>
          <span class="a11y-head-actions">
            <button type="button" id="a11yMinimizeBtn" aria-label="Thu nhỏ" title="Thu nhỏ"><i class="fa-solid fa-minus"></i></button>
            <button type="button" id="a11yCloseBtn" aria-label="Đóng" title="Đóng"><i class="fa-solid fa-xmark"></i></button>
          </span>
        </div>
        <div class="a11y-body" id="a11yBody">
          <div class="a11y-messages" id="a11yMessages"></div>
          <div class="a11y-chips" id="a11yChips"></div>
          <form class="a11y-form" id="a11yForm">
            <input type="text" id="a11yInput" placeholder="Hỏi về trang này…" maxlength="200" autocomplete="off">
            <button type="submit" aria-label="Gửi"><i class="fa-solid fa-paper-plane"></i></button>
          </form>
        </div>
      </div>
    `;
    // Chèn từng phần tử con thẳng vào <body> (bỏ div bọc ngoài tạm thời) —
    // FAB + panel là 2 anh em ngang hàng, không phải lồng trong 1 wrapper.
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  function init() {
    if (document.getElementById('a11yFab')) return; // đã có (vd trang tự thêm sẵn) — không tạo trùng
    buildMarkup();

    const fab = document.getElementById('a11yFab');
    const panel = document.getElementById('a11yPanel');
    const head = document.getElementById('a11yHead');
    const closeBtn = document.getElementById('a11yCloseBtn');
    const minimizeBtn = document.getElementById('a11yMinimizeBtn');
    const messagesEl = document.getElementById('a11yMessages');
    const chipsEl = document.getElementById('a11yChips');
    const form = document.getElementById('a11yForm');
    const input = document.getElementById('a11yInput');

    // ── Chỉ hiện trợ lý khi ĐANG làm bài ở chế độ "Ôn luyện" ────────────
    // #exam chỉ hiển thị (style.display khác 'none') khi học sinh đang
    // làm bài (xem startExam() trong quiz-engine.js); lớp "exam-locked"
    // chỉ được gắn khi State.examMode === 'test' (Kiểm tra — xem
    // acStartGuard()/acStopGuard()). Không có #exam (vd portfolio.html)
    // hoặc #exam đang ẩn (trang chọn đề, trang kết quả) → ẩn hẳn nút nổi,
    // không tạo phiền cho các màn hình khác ngoài lúc ôn luyện.
    function isPracticingNow() {
      const examEl = document.getElementById('exam');
      if (!examEl) return false;
      const shown = (examEl.style.display || getComputedStyle(examEl).display) !== 'none';
      return shown && !examEl.classList.contains('exam-locked');
    }
    function applyVisibility() {
      const visible = isPracticingNow();
      fab.style.display = visible ? '' : 'none';
      if (!visible && !panel.hidden) closePanel();
    }

    const FONT_KEY = 'a11y_font_scale';
    const CONTRAST_KEY = 'a11y_contrast';
    const FONT_STEPS = [87.5, 100, 112.5, 125, 137.5];
    let fontStepIdx = FONT_STEPS.indexOf(100);

    (function loadPrefs() {
      try {
        const savedFont = Number(localStorage.getItem(FONT_KEY));
        const idx = FONT_STEPS.indexOf(savedFont);
        if (idx >= 0) { fontStepIdx = idx; document.documentElement.style.fontSize = savedFont + '%'; }
        if (localStorage.getItem(CONTRAST_KEY) === '1') document.body.classList.add('a11y-contrast');
      } catch (e) { /* localStorage có thể bị chặn — bỏ qua, dùng mặc định */ }
    })();

    function addMsg(text, isBot) {
      const div = document.createElement('div');
      div.className = 'a11y-msg' + (isBot ? '' : ' is-own');
      const body = document.createElement('div');
      body.className = 'a11y-msg-body';
      body.textContent = text;
      div.appendChild(body);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function speak(text) {
      if (!('speechSynthesis' in window)) { addMsg('Trình duyệt này không hỗ trợ đọc to.', true); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      window.speechSynthesis.speak(u);
    }
    function stopSpeaking() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

    function setFontStep(idx) {
      fontStepIdx = Math.max(0, Math.min(FONT_STEPS.length - 1, idx));
      const pct = FONT_STEPS[fontStepIdx];
      document.documentElement.style.fontSize = pct + '%';
      try { localStorage.setItem(FONT_KEY, String(pct)); } catch (e) { /* ignore */ }
      addMsg(`Đã đặt cỡ chữ ${pct}%.`, true);
    }

    function toggleContrast() {
      const on = document.body.classList.toggle('a11y-contrast');
      try { localStorage.setItem(CONTRAST_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
      addMsg(on ? 'Đã bật độ tương phản cao.' : 'Đã tắt độ tương phản cao.', true);
    }

    function readPageSummary() {
      const parts = [document.title];
      document.querySelectorAll('main h1, main h2, section h1, section h2, h1, h2').forEach((h) => parts.push(h.textContent.trim()));
      const text = parts.filter(Boolean).slice(0, 6).join('. ');
      addMsg('Đang đọc tóm tắt trang…', true);
      speak(text);
    }

    // ── Đọc câu hỏi + đáp án hiện tại (js/quiz-engine.js § renderQuestion)
    // — chỉ đọc DOM đã render sẵn, không đụng biến nội bộ quiz-engine. ──
    function findQuestionPanel() {
      return document.getElementById('qPanel');
    }
    function readCurrentQuestion() {
      const panel = findQuestionPanel();
      const qText = panel && panel.querySelector('.q-text');
      if (!qText) {
        addMsg('Chưa có câu hỏi nào đang hiển thị — hãy bắt đầu làm bài trước.', true);
        return;
      }
      const opts = Array.from(panel.querySelectorAll('#q-body .option-btn span'))
        .map((el, i) => `${String.fromCharCode(65 + i)}. ${el.textContent.trim()}`);
      const text = [qText.textContent.trim(), ...opts].join('. ');
      addMsg('Đang đọc câu hỏi hiện tại…', true);
      speak(text);
    }

    // ── Điều hướng bài thi qua đúng nút thật trong .q-nav (thứ tự cố
    // định trong renderQuestion() của quiz-engine.js: Câu trước, Câu
    // tiếp/Nộp bài, Đánh dấu) — bấm hộ .click() thay vì tự viết lại logic
    // chuyển câu, nên KHÔNG rủi ro lệch pha với State nội bộ của
    // quiz-engine.js (module đó không expose gì ra global để gọi thẳng). ──
    function quizNavButtons() {
      const qp = findQuestionPanel();
      const nav = qp && qp.querySelector('.q-nav');
      if (!nav) return null;
      return { prev: nav.children[0], next: nav.children[1], flag: nav.children[2] };
    }
    function clickQuizNav(which, doneLabel) {
      const btns = quizNavButtons();
      const btn = btns && btns[which];
      if (!btn) { addMsg('Chưa có câu hỏi nào đang hiển thị.', true); return; }
      if (btn.disabled) { addMsg('Không còn thao tác này ở câu hiện tại.', true); return; }
      btn.click();
      if (doneLabel) addMsg(doneLabel, true);
    }
    function readProgressSummary() {
      const total = document.querySelectorAll('.q-btn').length;
      if (!total) { addMsg('Chưa có bài đang làm để xem tiến độ.', true); return; }
      const answered = document.querySelectorAll('.q-btn.answered').length;
      const flagged = document.querySelectorAll('.q-btn.flagged').length;
      const text = `Đã làm ${answered}/${total} câu — còn ${total - answered} câu chưa trả lời, ${flagged} câu đã đánh dấu.`;
      addMsg(text, true);
      speak(text);
    }

    // ── FAQ — khớp từ khoá đơn giản, không cần API/AI ngoài. ──
    const FAQ = [
      { keys: ['bắt đầu', 'làm bài', 'thi', 'ôn luyện'], reply: 'Chọn Trường/Lớp/Họ tên ở khung "Bắt đầu làm bài", rồi chọn đề thi phù hợp để vào làm.' },
      { keys: ['nộp bài'], reply: 'Bấm nút "Nộp bài" ở cuối câu hỏi cuối cùng, hoặc bài sẽ tự nộp khi hết giờ.' },
      { keys: ['đăng nhập', 'login', 'tài khoản'], reply: 'Chỉ Giáo viên/Admin mới cần đăng nhập (trang "login.html") — học sinh làm bài không cần tài khoản.' },
      { keys: ['dashboard'], reply: 'Giáo viên/Admin bấm "Dashboard" ở góc trên bên phải (sau khi đăng nhập) để vào khu vực quản lý.' },
      { keys: ['cỡ chữ', 'phóng to', 'to chữ', 'font'], reply: null, action: () => setFontStep(fontStepIdx + 1) },
      { keys: ['thu nhỏ chữ', 'giảm cỡ chữ', 'nhỏ chữ'], reply: null, action: () => setFontStep(fontStepIdx - 1) },
      { keys: ['tương phản', 'contrast'], reply: null, action: toggleContrast },
      { keys: ['đọc câu hỏi', 'đọc câu', 'đọc đề'], reply: null, action: readCurrentQuestion },
      { keys: ['câu trước', 'quay lại câu'], reply: null, action: () => clickQuizNav('prev') },
      { keys: ['câu tiếp', 'câu sau', 'câu kế'], reply: null, action: () => clickQuizNav('next') },
      { keys: ['đánh dấu', 'flag'], reply: null, action: () => clickQuizNav('flag', 'Đã bấm đánh dấu/bỏ đánh dấu câu hiện tại.') },
      { keys: ['tiến độ', 'còn bao nhiêu', 'đã làm mấy', 'đã trả lời'], reply: null, action: readProgressSummary },
      { keys: ['đọc', 'nghe', 'text to speech'], reply: null, action: readPageSummary },
    ];

    function handleQuestion(raw) {
      const q = raw.trim();
      if (!q) return;
      addMsg(q, false);
      const norm = q.toLowerCase();
      const hit = FAQ.find((f) => f.keys.some((k) => norm.includes(k)));
      if (hit) {
        if (hit.action) hit.action();
        else addMsg(hit.reply, true);
      } else {
        addMsg('Mình chưa hiểu câu này. Thử hỏi về: bắt đầu làm bài, nộp bài, câu trước/câu tiếp, đánh dấu câu, tiến độ làm bài, cỡ chữ, tương phản, đọc câu hỏi — hoặc bấm 1 gợi ý bên dưới.', true);
      }
    }

    function buildQuickChips() {
      const chips = [
        { label: '🔠 Cỡ chữ to hơn', run: () => setFontStep(fontStepIdx + 1) },
        { label: '🔡 Cỡ chữ nhỏ hơn', run: () => setFontStep(fontStepIdx - 1) },
        { label: '🌓 Tương phản cao', run: toggleContrast },
        { label: '⏹ Dừng đọc', run: stopSpeaking },
      ];
      // Chỉ thêm các nút liên quan bài thi khi ĐANG có câu hỏi trên trang —
      // đỡ rối cho các trang khác (vd portfolio.html) không có #qPanel.
      if (findQuestionPanel()) {
        chips.push({ label: '🔊 Đọc câu hỏi hiện tại', run: readCurrentQuestion });
        chips.push({ label: '◀ Câu trước', run: () => clickQuizNav('prev') });
        chips.push({ label: 'Câu tiếp ▶', run: () => clickQuizNav('next') });
        chips.push({ label: '🚩 Đánh dấu câu này', run: () => clickQuizNav('flag', 'Đã bấm đánh dấu/bỏ đánh dấu câu hiện tại.') });
        chips.push({ label: '📊 Tiến độ làm bài', run: readProgressSummary });
      } else {
        chips.push({ label: '🔊 Đọc tóm tắt trang', run: readPageSummary });
        chips.push({ label: 'Cách bắt đầu làm bài?', run: () => handleQuestion('bắt đầu làm bài') });
      }
      return chips;
    }

    let greeted = false;
    function openPanel() {
      panel.hidden = false;
      // Dựng lại danh sách gợi ý mỗi lần mở — findQuestionPanel() có thể
      // đổi kết quả giữa các lần mở (vd học sinh vừa bắt đầu làm bài).
      const chips = buildQuickChips();
      chipsEl.innerHTML = chips.map((c, i) => `<button type="button" class="a11y-chip" data-chip="${i}">${esc(c.label)}</button>`).join('');
      chipsEl.querySelectorAll('[data-chip]').forEach((btn) => {
        btn.addEventListener('click', () => chips[Number(btn.dataset.chip)].run());
      });
      if (!greeted) {
        greeted = true;
        const hint = findQuestionPanel()
          ? 'Chào bạn! Mình có thể đọc to câu hỏi/đáp án hiện tại, chỉnh cỡ chữ/độ tương phản khi làm bài. Bấm 1 gợi ý bên dưới hoặc gõ câu hỏi.'
          : 'Chào bạn! Mình là trợ lý trợ năng — có thể đọc to nội dung, chỉnh cỡ chữ/độ tương phản, và trả lời vài câu hỏi thường gặp về trang này.';
        addMsg(hint, true);
      }
      input.focus();
      fab.classList.add('is-open');
      fab.querySelector('i').className = 'fa-solid fa-xmark';
      fab.setAttribute('aria-expanded', 'true');
      positionPanelNearFab();
    }
    function closePanel() {
      panel.hidden = true;
      fab.classList.remove('is-open');
      fab.querySelector('i').className = 'fa-solid fa-universal-access';
      fab.setAttribute('aria-expanded', 'false');
    }

    // ── Thu nhỏ/phóng to (KHÁC đóng hẳn) — thu chỉ còn dải tiêu đề, giữ
    // lịch sử trò chuyện + không mất chỗ đang gõ dở, bấm lại (nút hoặc
    // chính dải tiêu đề) để phóng to lại. Mặc định LUÔN mở ở dạng đầy đủ
    // khi bấm nút nổi — thu nhỏ là lựa chọn CHỦ ĐỘNG của người dùng khi
    // thấy panel che mất nội dung cần xem, không phải trạng thái mặc định. ──
    function setMinimized(min) {
      panel.classList.toggle('is-minimized', min);
      minimizeBtn.querySelector('i').className = min ? 'fa-solid fa-chevron-up' : 'fa-solid fa-minus';
      minimizeBtn.title = min ? 'Phóng to' : 'Thu nhỏ';
      minimizeBtn.setAttribute('aria-label', min ? 'Phóng to' : 'Thu nhỏ');
      if (!min) input.focus();
    }
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMinimized(!panel.classList.contains('is-minimized'));
    });
    head.addEventListener('click', () => {
      if (panel.classList.contains('is-minimized')) setMinimized(false);
    });

    // ── Kéo-thả nút nổi — cách CHẮC CHẮN nhất để tránh che mất nút/thành
    // phần khác trên MỌI trang (mỗi trang bố trí khác nhau — bài thi có
    // "Đánh dấu"/"Câu tiếp" ở góc dưới phải, trang khác lại khác), thay vì
    // đoán 1 vị trí mặc định "an toàn" cho tất cả. Nhớ vị trí qua
    // localStorage NÊN chỉ cần kéo 1 lần, các lần mở trang sau tự đúng
    // chỗ học sinh đã để. Panel (khi mở) luôn bám theo đúng vị trí hiện
    // tại của nút nổi — xem positionPanelNearFab(). ──
    const POS_KEY = 'a11y_fab_pos';
    let dragging = false, dragMoved = false, dragStartX = 0, dragStartY = 0, fabStartRight = 0, fabStartBottom = 0;

    function clampFabPos(right, bottom) {
      const margin = 8;
      const maxRight = Math.max(margin, window.innerWidth - fab.offsetWidth - margin);
      const maxBottom = Math.max(margin, window.innerHeight - fab.offsetHeight - margin);
      return { right: Math.min(Math.max(right, margin), maxRight), bottom: Math.min(Math.max(bottom, margin), maxBottom) };
    }
    function applyFabPos(right, bottom) {
      fab.style.right = right + 'px';
      fab.style.bottom = bottom + 'px';
    }
    function loadFabPos() {
      try {
        const raw = localStorage.getItem(POS_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (typeof saved.right === 'number' && typeof saved.bottom === 'number') {
          const c = clampFabPos(saved.right, saved.bottom);
          applyFabPos(c.right, c.bottom);
        }
      } catch (e) { /* localStorage bị chặn hoặc dữ liệu hỏng — dùng vị trí mặc định trong CSS */ }
    }
    function saveFabPos(right, bottom) {
      try { localStorage.setItem(POS_KEY, JSON.stringify({ right, bottom })); } catch (e) { /* ignore */ }
    }
    // Panel bám sát góc trên-phải của nút nổi hiện tại — nếu không đủ chỗ
    // phía TRÊN (nút bị kéo lên gần đỉnh màn hình) thì tự chuyển xuống
    // phía DƯỚI nút nổi thay vì tràn ra ngoài màn hình.
    function positionPanelNearFab() {
      const rect = fab.getBoundingClientRect();
      const gap = 12;
      const panelW = panel.offsetWidth || 300;
      const panelH = panel.offsetHeight || 400;
      let right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - panelW - 8));
      let bottom = window.innerHeight - rect.top + gap;
      if (bottom + panelH > window.innerHeight - 8) {
        bottom = Math.max(8, window.innerHeight - rect.bottom - panelH - gap);
      }
      panel.style.right = right + 'px';
      panel.style.bottom = bottom + 'px';
    }
    window.addEventListener('resize', () => { if (!panel.hidden) positionPanelNearFab(); });

    loadFabPos();

    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return; // chỉ chuột trái/chạm, bỏ qua chuột phải
      dragging = true; dragMoved = false;
      dragStartX = e.clientX; dragStartY = e.clientY;
      const rect = fab.getBoundingClientRect();
      fabStartRight = window.innerWidth - rect.right;
      fabStartBottom = window.innerHeight - rect.bottom;
      try { fab.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    fab.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
      if (!dragMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) { dragMoved = true; fab.classList.add('is-dragging'); }
      if (!dragMoved) return;
      const c = clampFabPos(fabStartRight - dx, fabStartBottom - dy);
      applyFabPos(c.right, c.bottom);
      if (!panel.hidden) positionPanelNearFab();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      fab.classList.remove('is-dragging');
      if (dragMoved) {
        const rect = fab.getBoundingClientRect();
        saveFabPos(window.innerWidth - rect.right, window.innerHeight - rect.bottom);
      }
    }
    fab.addEventListener('pointerup', endDrag);
    fab.addEventListener('pointercancel', endDrag);

    fab.setAttribute('aria-expanded', 'false');
    fab.addEventListener('click', () => {
      if (dragMoved) { dragMoved = false; return; } // vừa kéo xong — không tính là bấm mở
      if (panel.hidden) { openPanel(); setMinimized(false); }
      else closePanel();
    });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value;
      input.value = '';
      handleQuestion(q);
    });

    // ── Bấm ra ngoài / Esc để đóng — panel là 1 lớp NỔI TRÊN nội dung
    // trang (khác drawer đẩy layout), nên cần cách đóng nhanh, tránh che
    // khuất lâu các thành phần khác (form chọn trường/lớp, nút Bắt đầu…). ──
    document.addEventListener('click', (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      closePanel();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) closePanel();
    });

    // Theo dõi #exam đổi style/class (bắt đầu/nộp bài, chuyển Ôn luyện ⇄
    // Kiểm tra qua acStartGuard/acStopGuard) để ẩn/hiện nút nổi kịp thời —
    // trang là SPA (không load lại), nên không thể chỉ kiểm tra 1 lần.
    const examEl = document.getElementById('exam');
    if (examEl) {
      new MutationObserver(applyVisibility).observe(examEl, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    applyVisibility();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
