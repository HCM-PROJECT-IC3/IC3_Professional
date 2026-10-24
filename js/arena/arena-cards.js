/* ============================================================
   js/arena/arena-cards.js — bàn bốc thẻ bài trong trận Đấu trường (Chơi một mình).
   Chia 3 lá úp → tráo 4 lần → em chọn 1 lá (bấm hoặc phím 1/2/3) → lật ra hiệu ứng,
   2 lá còn lại lật theo ("suýt nữa thì được..."). Lá nào, hiệu ứng gì: EduArenaCore.CARDS / drawCards.
     open(ids) → Promise<id lá em chọn>  (đóng khi em bấm "Nhận thẻ" / Enter)
     isOpen() · key(e)                    arena.js chuyển phím vào đây khi đang mở
   Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* ignore */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const POS = [-1, 0, 1]; // vị trí lá: trái · giữa · phải (nhân với khoảng cách trong CSS)

  let S = null; // { box, ids, els, slot, picked, busy, resolve }
  function open(ids) {
    close();
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.className = 'ar-cards';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Bốc thẻ bài');
      box.innerHTML = `<div class="ar-cards-in">
        <p class="ar-cards-title"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Bốc thẻ bài!</p>
        <p class="ar-cards-hint">Đang tráo bài...</p>
        <div class="ar-cards-table">${ids.map((id, i) => {
          const c = C.CARDS[id];
          return `<button type="button" class="ar-card3 t-${c.tone}" data-ci="${i}" disabled aria-label="Lá bài ${i + 1}">
            <span class="ar-card3-in"><span class="ar-card3-back"><i class="fa-solid fa-question" aria-hidden="true"></i></span>
            <span class="ar-card3-face"><i class="fa-solid ${c.fa}" aria-hidden="true"></i><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></span></span></button>`;
        }).join('')}</div>
        <button type="button" class="ar-btn ar-btn-play ar-cards-ok" hidden>Nhận thẻ <kbd>Enter</kbd></button></div>`;
      document.body.appendChild(box);
      S = { box, ids, els: [...box.querySelectorAll('.ar-card3')], slot: [0, 1, 2], picked: -1, busy: true, resolve };
      box.addEventListener('click', (e) => {
        const c = e.target.closest('[data-ci]');
        if (c) { choose(+c.dataset.ci); return; }
        if (e.target.closest('.ar-cards-ok')) finish();
      });
      deal();
    });
  }
  const place = (el, slot, ms) => {
    el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,0,.3,1)` : 'none';
    el.style.setProperty('--slot', POS[slot]);
  };
  async function deal() {
    const s = S, quick = reduced();
    s.els.forEach((el) => { el.classList.add('is-dealing'); place(el, 1, 0); });
    await sleep(40);
    s.els.forEach((el, i) => { el.style.transitionDelay = `${i * .12}s`; el.classList.remove('is-dealing'); place(el, i, quick ? 0 : 480); });
    sfx('flip');
    await sleep(quick ? 0 : 820);
    if (S !== s) return;
    s.els.forEach((el) => { el.style.transitionDelay = '0s'; });
    for (let k = 0; k < (quick ? 0 : 4); k++) {
      const a = Math.floor(Math.random() * 3), b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      [s.slot[a], s.slot[b]] = [s.slot[b], s.slot[a]];
      s.els[a].classList.add('is-lift'); s.els[b].classList.add('is-lift');
      s.els.forEach((el, i) => place(el, s.slot[i], 300));
      sfx('click');
      await sleep(340);
      s.els[a].classList.remove('is-lift'); s.els[b].classList.remove('is-lift');
      if (S !== s) return;
    }
    s.busy = false;
    s.els.forEach((el) => { el.disabled = false; el.classList.add('is-ready'); });
    s.box.querySelector('.ar-cards-hint').textContent = 'Chọn 1 lá! (bấm hoặc phím 1 · 2 · 3)';
    s.els[s.slot.indexOf(1)].focus({ preventScroll: true });
  }
  async function choose(i) {
    const s = S;
    if (!s || s.busy || s.picked >= 0) return;
    s.picked = i;
    s.els.forEach((el) => { el.disabled = true; el.classList.remove('is-ready'); });
    s.els[i].classList.add('is-pick', 'is-flip');
    const c = C.CARDS[s.ids[i]];
    sfx(c.tone === 'rare' ? 'fanfare' : 'combo');
    s.box.querySelector('.ar-cards-hint').textContent = c.tone === 'rare' ? 'Lá hiếm! May mắn quá!' : `Em bốc được: ${c.name}`;
    await sleep(reduced() ? 0 : 750);
    if (S !== s) return;
    s.els.forEach((el, k) => { if (k !== i) el.classList.add('is-flip', 'is-other'); });
    const ok = s.box.querySelector('.ar-cards-ok');
    ok.hidden = false;
    ok.focus({ preventScroll: true });
  }
  function finish() {
    if (!S || S.picked < 0) return;
    const { resolve, ids, picked } = S;
    close();
    resolve(ids[picked]);
  }
  function close() { if (S) { S.box.remove(); S = null; } }
  function isOpen() { return !!S; }
  /** 1/2/3 chọn lá theo vị trí trái → phải; Enter/Space = Nhận thẻ. Mọi phím khác bị nuốt khi đang mở. */
  function key(e) {
    if (!S) return false;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 3 && S.picked < 0) choose(S.slot.indexOf(n - 1));
    else if ((e.key === 'Enter' || e.key === ' ') && S.picked < 0 && document.activeElement && document.activeElement.dataset.ci) choose(+document.activeElement.dataset.ci);
    else if ((e.key === 'Enter' || e.key === ' ') && S.picked >= 0) finish();
    return true;
  }

  global.EduArenaCards = { open, close, isOpen, key };
})(typeof window !== 'undefined' ? window : globalThis);
