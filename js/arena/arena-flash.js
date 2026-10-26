/* ============================================================
   js/arena/arena-flash.js — "Lật thẻ ôn nhanh" ở màn kết thúc Đấu trường (Chơi một mình + Phòng cả lớp).
     html(wrong)   xấp thẻ từ các câu sai [{ q }]: mặt trước câu hỏi, mặt sau đáp án đúng + giải thích.
   Em tự nhớ lại đáp án trước rồi mới lật (gợi nhớ chủ động → nhớ lâu hơn đọc lại):
     "Nhớ rồi" → thẻ bay đi · "Chưa nhớ" → thẻ quay về cuối xấp, gặp lại sau vài thẻ.
   Hết xấp → pháo giấy + "Em đã nhớ hết N câu!". Bấm/Space lật thẻ, phím 1 = Chưa nhớ, 2 = Nhớ rồi.
   Bắt sự kiện ở document (ủy quyền) nên chỉ cần chèn HTML, không cần gắn gì thêm. Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* ignore */ } };
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function html(wrong) {
    const list = (wrong || []).filter((x) => x && x.q);
    if (!list.length) return '';
    const cards = list.map((x, i) => `<div class="ar-fcard" data-fc="${i}">
        <button type="button" class="ar-fcard-in" aria-label="Lật thẻ xem đáp án">
          <span class="ar-fface is-front"><small>Câu hỏi · em nhớ đáp án không?</small><b>${esc(x.q.text)}</b><i><i class="fa-solid fa-rotate" aria-hidden="true"></i> Bấm để lật</i></span>
          <span class="ar-fface is-back"><small>Đáp án đúng</small><b>${C.answerLines(x.q).map(esc).join(' · ')}</b>${x.q.expl ? `<em>💡 ${esc(x.q.expl)}</em>` : ''}</span>
        </button></div>`).join('');
    return `<div class="ar-flash" data-total="${list.length}">
      <p class="ar-flash-head"><span>🧠 Lật thẻ ôn nhanh</span><span class="ar-flash-prog">Đã nhớ <b>0</b>/${list.length}</span></p>
      <div class="ar-flash-deck">${cards}</div>
      <div class="ar-flash-acts" hidden>
        <button type="button" class="ar-btn ar-btn-ghost" data-fl="again"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Chưa nhớ <kbd>1</kbd></button>
        <button type="button" class="ar-btn ar-btn-play" data-fl="got"><i class="fa-solid fa-check" aria-hidden="true"></i> Nhớ rồi <kbd>2</kbd></button>
      </div>
      <p class="ar-flash-done" hidden></p></div>`;
  }

  const top = (fl) => fl.querySelector('.ar-flash-deck > .ar-fcard');
  function flip(fl) {
    const c = top(fl);
    if (!c || c.classList.contains('is-flipped')) return;
    c.classList.add('is-flipped');
    fl.querySelector('.ar-flash-acts').hidden = false;
    sfx('flip');
  }
  function next(fl, got) {
    const c = top(fl);
    if (!c || !c.classList.contains('is-flipped') || c.classList.contains('is-leaving')) return;
    const deck = fl.querySelector('.ar-flash-deck');
    fl.querySelector('.ar-flash-acts').hidden = true;
    c.classList.add('is-leaving', got ? 'is-got' : 'is-again');
    sfx(got ? 'correct' : 'click');
    setTimeout(() => {
      c.classList.remove('is-leaving', 'is-got', 'is-again', 'is-flipped');
      if (got) c.remove(); else deck.appendChild(c); // chưa nhớ → về cuối xấp
      const total = +fl.dataset.total, left = deck.children.length;
      fl.querySelector('.ar-flash-prog b').textContent = total - left;
      if (left) deck.firstElementChild.querySelector('.ar-fcard-in').focus({ preventScroll: true });
      if (!left) {
        const d = fl.querySelector('.ar-flash-done');
        d.hidden = false;
        d.textContent = `🎉 Em đã nhớ hết ${total} câu! Đỉnh nóc, kịch trần!`;
        sfx('win');
        if (global.EduFX) global.EduFX.confetti({ count: 90 });
      }
    }, reduced() ? 0 : 420);
  }

  document.addEventListener('click', (e) => {
    const fl = e.target.closest && e.target.closest('.ar-flash');
    if (!fl) return;
    const b = e.target.closest('[data-fl]');
    if (b) { next(fl, b.dataset.fl === 'got'); return; }
    if (e.target.closest('.ar-fcard-in')) flip(fl);
  });
  // Phím tắt khi đang chọn (focus) trong xấp thẻ — không giành phím của trang khi em không dùng thẻ
  document.addEventListener('keydown', (e) => {
    const fl = document.activeElement && document.activeElement.closest && document.activeElement.closest('.ar-flash');
    if (!fl) return;
    if (e.key === '1' || e.key === '2') { e.preventDefault(); next(fl, e.key === '2'); }
    else if (e.key === ' ' && document.activeElement.classList.contains('ar-fcard-in')) { e.preventDefault(); flip(fl); }
  });

  global.EduArenaFlash = { html };
})(window);
