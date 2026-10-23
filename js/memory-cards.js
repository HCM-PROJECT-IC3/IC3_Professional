/* ============================================================
   js/memory-cards.js — "🃏 Thẻ ghi nhớ" ở màn Kết quả (index.html)

   Nộp bài xong, mỗi câu sai/bỏ qua thành 1 thẻ lật: mặt trước là câu hỏi
   (em tự nhớ lại đáp án), bấm lật → mặt sau là đáp án đúng + giải thích.
   "Đã nhớ" bỏ thẻ khỏi xấp, "Chưa nhớ" đưa thẻ xuống cuối xấp để
   gặp lại — tự nhớ lại + lặp lại ngay trong buổi giúp nhớ lâu hơn đọc lại.
   (Ôn qua nhiều ngày: Sổ tay câu sai ở js/learning-hub.js.)

   Chỉ đọc sự kiện 'edu:exam-graded' (js/quiz-engine.js § submitExam),
   không ghi gì — 0 Firebase, 0 localStorage.
   ============================================================ */
(function (global) {
  'use strict';

  const canSpeak = 'speechSynthesis' in global;
  let cards = [];        // [{ q, a, extra, speakText }]
  let deck = [];         // chỉ số thẻ còn phải ôn
  let total = 0;
  let firstTry = 0;      // số thẻ "nhớ rồi" ngay lần đầu
  let seen = new Set();
  let lastFocus = null;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function plain(html) { const d = document.createElement('div'); d.innerHTML = String(html ?? ''); return (d.textContent || '').trim(); }
  function speak(text) {
    if (!canSpeak || !text) return;
    global.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 0.9;
    const vi = global.speechSynthesis.getVoices().find((v) => /^vi/i.test(v.lang));
    if (vi) u.voice = vi;
    global.speechSynthesis.speak(u);
  }

  function toCard(d) {
    const r = d.raw || {};
    const q = plain(d.fullText || d.text);
    const explain = plain(d.explanation);
    let a = '';
    let extra = '';
    if ((d.type === 'single' || d.type === 'multi') && (r.correct || []).length) {
      a = r.correct.map(plain).join(' · ');
    } else if (d.type === 'truefalse' && (r.statements || []).length) {
      extra = '<ul class="mc-tf">' + r.statements.map((st) =>
        `<li><b>${esc(st.answer === 'true' ? r.labelTrue : r.labelFalse)}</b> — ${esc(plain(st.text))}</li>`).join('') + '</ul>';
    } else if (typeof global._rdBuildDetailBody === 'function') {
      // Nối cột, kéo thả, hotspot…: dùng lại phần "đáp án đúng" của màn xem chi tiết
      extra = global._rdBuildDetailBody(Object.assign({}, d, { explanation: '' }), { showQuestionText: false });
    }
    return {
      q, a, extra, explain,
      speakText: [a && `Đáp án đúng là: ${a}`, explain].filter(Boolean).join('. '),
    };
  }

  // ── Khung thẻ ──
  function ensureOverlay() {
    let ov = document.getElementById('mcOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'mcOverlay';
    ov.className = 'mc-overlay';
    ov.hidden = true;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'mcTitle');
    ov.innerHTML = `
      <div class="mc-box">
        <div class="mc-top">
          <div class="mc-title" id="mcTitle">🃏 Thẻ ghi nhớ</div>
          <div class="mc-progress" id="mcProgress"></div>
          <button type="button" class="mc-close" id="mcClose" aria-label="Đóng thẻ ghi nhớ"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="mc-bar"><span id="mcBarFill"></span></div>
        <div id="mcStage"></div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#mcClose').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    return ov;
  }

  function renderCard() {
    const stage = document.getElementById('mcStage');
    const done = total - deck.length;
    document.getElementById('mcProgress').textContent = `Đã nhớ ${done}/${total}`;
    document.getElementById('mcBarFill').style.width = `${total ? (done / total) * 100 : 0}%`;

    if (!deck.length) {
            stage.innerHTML = `
        <div class="mc-done">
          <div class="mc-done-emoji" aria-hidden="true"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></div>
          <div class="mc-done-title">Đã ôn xong ${total} thẻ</div>
          <p>${firstTry === total ? 'Em nhớ được cả ngay từ lần lật đầu tiên.' : `Nhớ ngay lần đầu ${firstTry}/${total} thẻ. Các câu này đã có trong <b>Góc học tập › Sổ tay câu sai</b>, mai ôn lại sẽ nhớ lâu hơn.`}</p>
          <div class="mc-actions">
            <button type="button" class="mc-btn mc-btn-again" id="mcRestart"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Ôn lại từ đầu</button>
            <button type="button" class="mc-btn mc-btn-know" id="mcFinish">Xong</button>
          </div>
        </div>`;
      stage.querySelector('#mcRestart').addEventListener('click', () => start());
      stage.querySelector('#mcFinish').addEventListener('click', close);
      stage.querySelector('#mcFinish').focus();
      return;
    }

    const c = cards[deck[0]];
    stage.innerHTML = `
      <div class="mc-card" id="mcCard">
        <div class="mc-face mc-front">
          <div class="mc-face-label">Câu hỏi</div>
          <div class="mc-q">${esc(c.q)}</div>
          <div class="mc-think">Nhớ lại đáp án trong đầu, rồi lật thẻ để kiểm tra.</div>
        </div>
        <div class="mc-face mc-back">
          <div class="mc-face-label">Đáp án đúng</div>
          <div class="mc-q mc-q-small">${esc(c.q)}</div>
          ${c.a ? `<div class="mc-a">${esc(c.a)}</div>` : ''}
          ${c.extra}
          ${c.explain ? `<div class="mc-explain">${esc(c.explain)}</div>` : ''}
          ${canSpeak && c.speakText ? '<button type="button" class="mc-listen" id="mcListen"><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Nghe đáp án</button>' : ''}
        </div>
      </div>
      <div class="mc-actions" id="mcActions">
        <button type="button" class="mc-btn mc-btn-flip" id="mcFlip"><i class="fa-solid fa-repeat" aria-hidden="true"></i> Lật thẻ</button>
      </div>`;
    stage.querySelector('#mcFlip').addEventListener('click', flip);
    stage.querySelector('#mcFlip').focus();
  }

  function flip() {
    const card = document.getElementById('mcCard');
    if (!card || card.classList.contains('is-flipped')) return;
    card.classList.add('is-flipped');
    const c = cards[deck[0]];
    document.getElementById('mcListen')?.addEventListener('click', () => speak(c.speakText));
    const actions = document.getElementById('mcActions');
    actions.innerHTML = `
      <button type="button" class="mc-btn mc-btn-again" id="mcAgain">Chưa nhớ, gặp lại sau</button>
      <button type="button" class="mc-btn mc-btn-know" id="mcKnow"><i class="fa-solid fa-check" aria-hidden="true"></i> Đã nhớ</button>`;
    actions.querySelector('#mcAgain').addEventListener('click', () => next(false));
    actions.querySelector('#mcKnow').addEventListener('click', () => next(true));
    actions.querySelector('#mcKnow').focus();
  }

  function next(known) {
    if (canSpeak) global.speechSynthesis.cancel();
    const idx = deck.shift();
    if (known) {
      if (!seen.has(idx)) firstTry++;
    } else {
      deck.push(idx);
    }
    seen.add(idx);
    renderCard();
  }

  function start() {
    deck = cards.map((_, i) => i);
    total = cards.length;
    firstTry = 0;
    seen = new Set();
    renderCard();
  }

  function open() {
    if (!cards.length) return;
    lastFocus = document.activeElement;
    const ov = ensureOverlay();
    ov.hidden = false;
    document.body.classList.add('mc-open');
    start();
  }
  function close() {
    const ov = document.getElementById('mcOverlay');
    if (!ov || ov.hidden) return;
    if (canSpeak) global.speechSynthesis.cancel();
    ov.hidden = true;
    document.body.classList.remove('mc-open');
    lastFocus?.focus?.();
  }

  function onGraded(e) {
    const details = e.detail?.details || [];
    cards = details.filter((d) => d.status !== 'correct').map(toCard).filter((c) => c.q);
    let btn = document.getElementById('btnMemoryCards');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btnMemoryCards';
      btn.className = 'btn-retry btn-memory-cards';
      btn.addEventListener('click', open);
      const anchor = document.getElementById('btnRetryWrong') || document.querySelector('#result .btn-retry');
      if (!anchor) return;
      anchor.insertAdjacentElement('beforebegin', btn);
    }
    btn.hidden = cards.length === 0;
    btn.innerHTML = `<i class="fa-solid fa-clone" aria-hidden="true"></i> Ôn ${cards.length} câu sai bằng thẻ ghi nhớ`;
  }

  global.addEventListener('edu:exam-graded', onGraded);
})(window);
