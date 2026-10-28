/* ============================================================
   js/kid-mode.js — "Chữ to" cho học sinh tiểu học ở trang làm bài (index.html)

   Tự bật khi lớp ≤ 5 (hoặc chương trình Spark); nút "Chữ to" trên thanh
   trên cùng cho bật/tắt tay (nhớ trong localStorage, theo máy).
     • Chữ câu hỏi/đáp án to, đáp án đang chọn tô đặc + nhãn "Em chọn".
     • Dòng nhắc dưới đáp án: "Em đã chọn: B. Máy quét" / "Em hãy bấm 1 đáp án".
     • 🔊 Nghe câu hỏi (đọc to câu hỏi + đáp án, giọng tiếng Việt của máy).
     • Ôn luyện → "Kiểm tra đáp án": tô xanh/đỏ NGAY trên đáp án (không lặp
       lại danh sách bên dưới) + thẻ "Ghi nhớ" ghi đáp án đúng, đọc to được.

   Chỉ đổi giao diện — không đụng chấm điểm. Nhận tín hiệu từ
   js/quiz-engine.js: 'edu:quiz-updated' (updateSidebar) và
   'edu:answer-checked' (_renderCheckResult).
   ============================================================ */
(function (global) {
  'use strict';

  const PREF_KEY = 'eduquiz_kidmode';   // 'on' | 'off' | (trống = tự theo lớp)
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const canSpeak = 'speechSynthesis' in global;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function plain(html) { const d = document.createElement('div'); d.innerHTML = String(html ?? ''); return (d.textContent || '').trim(); }
  function getPref() { try { return localStorage.getItem(PREF_KEY) || ''; } catch (e) { return ''; } }
  function setPref(v) { try { v ? localStorage.setItem(PREF_KEY, v) : localStorage.removeItem(PREF_KEY); } catch (e) { /* ignore */ } }

  function quiz() { return typeof State !== 'undefined' ? State : null; }
  function gradeOf(cls) { const m = String(cls || '').match(/\d+/); return m ? parseInt(m[0], 10) : 0; }
  function autoKid() {
    const s = quiz()?.session || {};
    const g = gradeOf(s.studentClass);
    return (g >= 1 && g <= 5) || /spark/i.test(s.category || '');
  }
  function isKid() {
    const p = getPref();
    return p === 'on' ? true : p === 'off' ? false : autoKid();
  }

  // ── Đọc to ──
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
  function stopSpeaking() { if (canSpeak) global.speechSynthesis.cancel(); }

  function readQuestion() {
    const panel = document.getElementById('qPanel');
    if (!panel) return;
    const parts = [plain(panel.querySelector('.q-text')?.innerHTML)];
    panel.querySelectorAll('#q-body .option-btn').forEach((b, j) => {
      parts.push(`${b.querySelector('.option-marker') ? ALPHA[j] + '. ' : ''}${(b.querySelector('span')?.textContent || '').trim()}`);
    });
    panel.querySelectorAll('#q-body .tf-row-text').forEach((t, j) => parts.push(`${j + 1}. ${t.textContent.trim()}`));
    speak(parts.filter(Boolean).join('. '));
  }

  // ── Nút bật/tắt trên thanh trên cùng ──
  function ensureToggle() {
    let btn = document.getElementById('kidToggle');
    if (btn) return btn;
    const submit = document.querySelector('#exam .topbar .btn-submit-top');
    if (!submit) return null;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'kidToggle';
    btn.className = 'kid-toggle';
    btn.title = 'Bật/tắt chữ to, dễ nhìn';
    btn.innerHTML = '<i class="fa-solid fa-text-height" aria-hidden="true"></i> <span class="kid-toggle-label">Chữ to</span>';
    btn.addEventListener('click', () => {
      const on = !document.body.classList.contains('kid-mode');
      // Trùng với mặc định theo lớp → xoá ưu tiên (lần sau lại tự theo lớp)
      setPref(on === autoKid() ? '' : (on ? 'on' : 'off'));
      refresh();
      if (!on) clearMarks();
    });
    submit.insertAdjacentElement('beforebegin', btn);
    return btn;
  }

  // ── Dòng "Em đã chọn…" ──
  function statusText(q, body) {
    if (q.type === 'single') {
      const btns = [...body.querySelectorAll('.option-btn')];
      const j = btns.findIndex((b) => b.classList.contains('selected'));
      if (j < 0) return { done: false, html: '<i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Em hãy bấm vào <b>1 đáp án</b> em cho là đúng' };
      const letter = btns[j].querySelector('.option-marker') ? `<span class="kid-pick-letter">${ALPHA[j]}</span>` : '';
      return { done: true, html: `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Em đã chọn: ${letter}<b>${esc(btns[j].querySelector('span')?.textContent.trim())}</b>` };
    }
    if (q.type === 'multi') {
      const btns = [...body.querySelectorAll('.option-btn')];
      const picked = btns.map((b, j) => (b.classList.contains('selected') ? j : -1)).filter((j) => j >= 0);
      const need = q.correct?.length || 0;
      if (!picked.length) return { done: false, html: `<i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Em hãy bấm chọn <b>${need || 'các'} đáp án</b> đúng` };
      const letters = picked.map((j) => (btns[j].querySelector('.option-marker') ? `<span class="kid-pick-letter">${ALPHA[j]}</span>` : '')).join('');
      const left = need - picked.length;
      return {
        done: left <= 0,
        html: `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Em đã chọn ${letters || `<b>${picked.length}</b> đáp án`}` + (left > 0 ? ` · còn <b>${left}</b> đáp án nữa` : ' · đủ rồi'),
      };
    }
    if (q.type === 'truefalse') {
      const total = body.querySelectorAll('.tf-row').length;
      const n = body.querySelectorAll('.tf-row.is-true, .tf-row.is-false').length;
      return n >= total
        ? { done: true, html: `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Em đã trả lời đủ <b>${total}/${total}</b> dòng` }
        : { done: false, html: `<i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Em đã trả lời <b>${n}/${total}</b> dòng · còn <b>${total - n}</b> dòng` };
    }
    const done = typeof isAnswered === 'function' && isAnswered(quiz().current);
    return done
      ? { done: true, html: '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Em đã làm xong câu này' }
      : { done: false, html: '<i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Em chưa làm xong câu này' };
  }

  let lastSig = '';
  function selectionSig(body) {
    return [...body.querySelectorAll('.selected, .is-true, .is-false')].map((e) => e.className).join('|') + body.childElementCount;
  }

  function refresh() {
    const S = quiz();
    const on = isKid();
    document.body.classList.toggle('kid-mode', on);
    const toggle = ensureToggle();
    if (toggle) toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!S || !on) { document.getElementById('kidPick')?.remove(); return; }

    const q = S.questions?.[S.current];
    const card = document.querySelector('#qPanel .q-card');
    const body = document.getElementById('q-body');
    if (!q || !card || !body) return;

    if (canSpeak && !card.querySelector('.kid-listen')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kid-listen';
      b.innerHTML = '<i class="fa-solid fa-volume-high" aria-hidden="true"></i> Nghe câu hỏi';
      b.addEventListener('click', readQuestion);
      card.querySelector('.q-meta')?.appendChild(b);
    }

    // Bấm vào hình: ảnh co theo chiều cao còn lại → không thêm dòng nhắc (dòng
    // "Đã chọn x/y" có sẵn), chỉ đo lại ảnh sau khi thêm nút Nghe câu hỏi.
    if (q.type === 'hotspot') {
      if (typeof fitHotspotImage === 'function') requestAnimationFrame(fitHotspotImage);
      return;
    }

    let pick = document.getElementById('kidPick');
    if (!pick) {
      pick = document.createElement('div');
      pick.id = 'kidPick';
      pick.className = 'kid-pick';
      pick.setAttribute('aria-live', 'polite');
      body.insertAdjacentElement('afterend', pick);
    }
    const st = statusText(q, body);
    pick.classList.toggle('is-done', st.done);
    pick.innerHTML = st.html;

    // Đổi đáp án sau khi đã kiểm tra → bỏ tô xanh/đỏ cũ (không còn đúng với lựa chọn mới).
    const sig = selectionSig(body);
    if (body.dataset.kidChecked && sig !== lastSig) clearMarks();
    lastSig = sig;
  }

  // ── Kiểm tra đáp án (Ôn luyện) ──
  function clearMarks() {
    const body = document.getElementById('q-body');
    if (!body) return;
    delete body.dataset.kidChecked;
    body.querySelectorAll('.kid-correct, .kid-wrong').forEach((e) => e.classList.remove('kid-correct', 'kid-wrong'));
    document.getElementById('qCheckResult')?.classList.remove('kid-inline');
  }

  function onChecked(e) {
    clearMarks();
    stopSpeaking();
    const d = e.detail;
    const res = document.getElementById('qCheckResult');
    const body = document.getElementById('q-body');
    if (!d || !res || !body || !document.body.classList.contains('kid-mode')) return;

    const banner = res.querySelector('.q-check-banner');
    if (d.status === 'skipped') {
      if (banner) banner.innerHTML = '<span class="kid-big-emoji" aria-hidden="true"><i class="fa-solid fa-hand" aria-hidden="true"></i></span><span>Em chưa trả lời câu này. Chọn đáp án rồi bấm <b>Kiểm tra</b> lại.</span>';
      return;
    }
    const ok = d.status === 'correct';
    if (banner) {
      banner.innerHTML = ok
        ? '<span class="kid-big-emoji" aria-hidden="true"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span><span>Đúng rồi!</span>'
        : '<span class="kid-big-emoji" aria-hidden="true"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i></span><span>Chưa đúng. Đáp án đúng là ô <b>màu xanh</b>.</span>';
    }

    const r = d.raw || {};
    let answerText = '';
    if (d.type === 'single' || d.type === 'multi') {
      const correct = r.correct || [];
      const picked = Array.isArray(r.userAns) ? r.userAns : (r.userAns != null ? [r.userAns] : []);
      const btns = [...body.querySelectorAll('.option-btn')];
      btns.forEach((b) => {
        const val = decodeURIComponent(b.dataset.val || '');
        if (correct.includes(val)) b.classList.add('kid-correct');
        else if (picked.includes(val)) b.classList.add('kid-wrong');
      });
      answerText = btns.filter((b) => b.classList.contains('kid-correct'))
        .map((b) => (b.querySelector('span')?.textContent || '').trim()).join(', ');
      res.classList.add('kid-inline'); // ẩn danh sách đáp án lặp lại bên dưới
    } else if (d.type === 'truefalse') {
      const rows = body.querySelectorAll('.tf-row');
      const sts = r.statements || [];
      if (rows.length === sts.length) {
        rows.forEach((row, j) => row.classList.add((r.userTF || {})[j] === sts[j].answer ? 'kid-correct' : 'kid-wrong'));
      }
    }
    body.dataset.kidChecked = '1';
    lastSig = selectionSig(body);
    // Kết quả nằm dưới các đáp án → cuộn tới cho em thấy ngay.
    setTimeout(() => res.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);

    // Thẻ "Nhớ nhé": đáp án đúng + giải thích, đọc to được — nhìn + nghe để nhớ lâu.
    const explain = plain(d.explanation);
    if (!answerText && !explain) return;
    const card = document.createElement('div');
    card.className = 'kid-remember';
    card.innerHTML = `<div class="kid-remember-head"><i class="fa-solid fa-bookmark" aria-hidden="true"></i> Ghi nhớ</div>` +
      (answerText ? `<div class="kid-remember-answer">${esc(plain(d.fullText || ''))}<br>Đáp án: <b>${esc(answerText)}</b></div>` : '') +
      (canSpeak ? '<button type="button" class="kid-listen kid-remember-listen"><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Nghe lại</button>' : '');
    res.querySelector('.rd-explain')?.insertAdjacentElement('beforebegin', card) || res.appendChild(card);
    card.querySelector('.kid-remember-listen')?.addEventListener('click', () => {
      speak([answerText && `Đáp án đúng là: ${answerText}`, explain].filter(Boolean).join('. '));
    });
  }

  global.addEventListener('edu:quiz-updated', refresh);
  global.addEventListener('edu:answer-checked', onChecked);
  // Rời câu / nộp bài → dừng giọng đọc của câu trước.
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.btn-nav, .q-btn, .btn-submit-top')) stopSpeaking();
  });
})(window);
