/* ============================================================
   js/name-picker/np-challenge.js — "Bốc thử thách" cho bạn vừa được gọi (trang Gọi tên).
   Chia 3 lá bài úp → tráo 3 lần → bạn đó chọn 1 lá (bấm hoặc phím 1/2/3) → lật ra thử thách,
   2 lá còn lại lật theo cho cả lớp xem "suýt nữa thì...". Lá Hỏi nhanh IC3 có nút "Xem đáp án" cho giáo viên.
     open(fxEl, name, onDone)   vẽ trong lớp hiệu ứng của sân khấu (toạ độ 1000×600)
     isOpen() · key(e)          trang chính chuyển phím 1/2/3, Enter, Esc vào đây khi đang mở
   Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* ignore */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /** k: quiz (Hỏi nhanh IC3, có đáp án) · task (Thử thách vui) · luck (Thẻ may mắn). */
  const DECK = [
    { k: 'quiz', t: 'Phím tắt để Sao chép (Copy) là gì?', a: 'Ctrl + C' },
    { k: 'quiz', t: 'Phím tắt để Dán (Paste) là gì?', a: 'Ctrl + V' },
    { k: 'quiz', t: 'Phím tắt để Hoàn tác (Undo) là gì?', a: 'Ctrl + Z' },
    { k: 'quiz', t: 'Phím tắt để Lưu tệp là gì?', a: 'Ctrl + S' },
    { k: 'quiz', t: 'Phím tắt để chọn tất cả là gì?', a: 'Ctrl + A' },
    { k: 'quiz', t: 'Trong Word, phím tắt in đậm chữ là gì?', a: 'Ctrl + B' },
    { k: 'quiz', t: 'Phím tắt mở tab mới trong trình duyệt là gì?', a: 'Ctrl + T' },
    { k: 'quiz', t: 'Kể tên 3 thiết bị nhập (input).', a: 'Ví dụ: bàn phím, chuột, máy quét, micro, webcam' },
    { k: 'quiz', t: 'Kể tên 3 thiết bị xuất (output).', a: 'Ví dụ: màn hình, máy in, loa, tai nghe, máy chiếu' },
    { k: 'quiz', t: 'CPU là viết tắt của cụm từ nào?', a: 'Central Processing Unit — bộ xử lý trung tâm' },
    { k: 'quiz', t: 'Tắt máy thì dữ liệu trong RAM còn hay mất?', a: 'Mất — RAM là bộ nhớ tạm thời' },
    { k: 'quiz', t: 'Hệ điều hành là gì? Kể tên 2 hệ điều hành.', a: 'Phần mềm quản lý máy tính và chạy các ứng dụng — ví dụ Windows, macOS, Linux, Android, iOS' },
    { k: 'quiz', t: 'Tệp Word, Excel, PowerPoint có phần mở rộng (đuôi) là gì?', a: '.docx · .xlsx · .pptx' },
    { k: 'quiz', t: 'Một mật khẩu mạnh cần có những gì?', a: 'Đủ dài, có chữ hoa, chữ thường, số và ký hiệu; không dùng tên, ngày sinh; không dùng chung cho nhiều tài khoản' },
    { k: 'quiz', t: 'Trong Excel, công thức luôn bắt đầu bằng ký tự nào?', a: 'Dấu bằng ( = )' },
    { k: 'quiz', t: 'Hàm nào trong Excel dùng để tính tổng? Hàm nào tính trung bình?', a: 'SUM tính tổng · AVERAGE tính trung bình' },
    { k: 'quiz', t: 'URL là gì? Cho 1 ví dụ.', a: 'Địa chỉ của một trang web — ví dụ https://www.google.com' },
    { k: 'quiz', t: '"Lừa đảo trực tuyến" (phishing) là gì?', a: 'Giả mạo email, tin nhắn hay trang web để lừa lấy mật khẩu, thông tin cá nhân' },
    { k: 'quiz', t: 'Lưu trữ đám mây là gì? Kể 1 dịch vụ.', a: 'Lưu tệp trên máy chủ qua Internet — ví dụ Google Drive, OneDrive' },
    { k: 'quiz', t: 'Muốn chụp màn hình trên Windows, em bấm phím gì?', a: 'Print Screen (PrtSc), hoặc Windows + Shift + S' },
    { k: 'quiz', t: 'Bản quyền (copyright) là gì?', a: 'Quyền của tác giả với tác phẩm — muốn dùng phải xin phép hoặc ghi nguồn đúng quy định' },
    { k: 'quiz', t: 'Vì sao nên đăng xuất khi dùng máy tính chung?', a: 'Để người sau không vào được tài khoản, đọc thư hay đổi thông tin của em' },
    { k: 'task', t: 'Lên bảng viết 3 phím tắt em nhớ nhất.' },
    { k: 'task', t: 'Kể tên 5 phần mềm em biết trong 15 giây!' },
    { k: 'task', t: 'Giải thích cho cả lớp 1 thuật ngữ tin học em thích nhất.' },
    { k: 'task', t: 'Kể 1 việc em làm để giữ an toàn khi lên mạng.' },
    { k: 'task', t: 'Đọc to câu hỏi đầu tiên trên bảng cho cả lớp nghe.' },
    { k: 'task', t: 'Nói 1 câu khen một bạn trong lớp.' },
    { k: 'task', t: 'Nói 1 câu bằng giọng người máy: "Xin chào, tôi là máy tính!"' },
    { k: 'luck', t: 'Thẻ may mắn: em được miễn lượt này!' },
    { k: 'luck', t: 'Thẻ trợ giúp: em được chọn 1 bạn trả lời giúp.' },
    { k: 'luck', t: 'Thẻ đổi vai: em được gọi tên bạn tiếp theo!' },
  ];
  const KIND = { quiz: { name: 'Hỏi nhanh IC3', icon: 'fa-circle-question' }, task: { name: 'Thử thách vui', icon: 'fa-star' }, luck: { name: 'Thẻ may mắn', icon: 'fa-clover' } };
  const POS = [230, 500, 770]; // tâm 3 lá bài (x)

  /** 3 lá khác nhau: thường 2 Hỏi nhanh + 1 lá khác; thỉnh thoảng có Thẻ may mắn. */
  function draw3() {
    const pick = (k, n) => DECK.filter((c) => c.k === k).sort(() => Math.random() - .5).slice(0, n);
    const luck = Math.random() < .35;
    const out = pick('quiz', 2).concat(luck ? pick('luck', 1) : pick('task', 1));
    return out.sort(() => Math.random() - .5);
  }

  let S = null; // { box, cards, slot, picked, done }
  function open(fxEl, name, onDone) {
    close();
    const cards = draw3();
    const box = document.createElement('div');
    box.className = 'np-chal';
    box.innerHTML = `<p class="np-chal-title">Thử thách cho <b>${esc(name)}</b></p>
      <p class="np-chal-hint">Đang tráo bài...</p>
      ${cards.map((c, i) => `<button type="button" class="np-cc k-${c.k}" data-cc="${i}" disabled aria-label="Lá bài ${i + 1}">
        <span class="np-cc-in"><span class="np-cc-back"><i class="fa-solid fa-question" aria-hidden="true"></i></span>
        <span class="np-cc-face"><em><i class="fa-solid ${KIND[c.k].icon}" aria-hidden="true"></i> ${KIND[c.k].name}</em><span class="np-cc-t">${esc(c.t)}</span>
        ${c.a ? `<span class="np-cc-a" hidden>Đáp án: ${esc(c.a)}</span>` : ''}</span></span></button>`).join('')}
      <div class="np-chal-acts" hidden><button type="button" class="np-small" data-cc-act="ans" hidden><i class="fa-solid fa-eye" aria-hidden="true"></i> Xem đáp án</button>
        <button type="button" class="np-go np-go-sm" data-cc-act="done">Xong <kbd>Enter</kbd></button></div>`;
    fxEl.appendChild(box);
    S = { box, cards, slot: [0, 1, 2], picked: -1, onDone, busy: true };
    const els = [...box.querySelectorAll('.np-cc')];
    S.els = els;
    box.addEventListener('click', (e) => {
      e.stopPropagation(); // không để sân khấu hiểu là "bấm để gọi tên"
      const c = e.target.closest('[data-cc]');
      if (c) { choose(+c.dataset.cc); return; }
      const a = e.target.closest('[data-cc-act]');
      if (a && a.dataset.ccAct === 'ans') showAnswer();
      if (a && a.dataset.ccAct === 'done') finish();
    });
    deal();
  }
  const place = (el, slot, ms) => { el.style.transition = ms ? `left ${ms}ms cubic-bezier(.4,0,.3,1), transform ${ms}ms cubic-bezier(.4,0,.3,1)` : 'none'; el.style.left = POS[slot] + 'px'; };
  async function deal() {
    const s = S, quick = reduced();
    s.els.forEach((el, i) => { el.style.left = '500px'; el.classList.add('is-dealing'); el.style.transitionDelay = `${i * .12}s`; });
    await sleep(30);
    s.els.forEach((el, i) => { place(el, i, quick ? 0 : 450); el.classList.remove('is-dealing'); sfx('flip'); });
    await sleep(quick ? 0 : 800);
    if (S !== s) return;
    s.els.forEach((el) => { el.style.transitionDelay = '0s'; });
    // Tráo: đổi chỗ 2 lá bất kỳ, 4 lần
    for (let k = 0; k < (quick ? 0 : 4); k++) {
      const a = Math.floor(Math.random() * 3), b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
      [s.slot[a], s.slot[b]] = [s.slot[b], s.slot[a]];
      s.els.forEach((el, i) => place(el, s.slot[i], 320));
      s.els[a].classList.add('is-lift'); s.els[b].classList.add('is-lift');
      sfx('click');
      await sleep(360);
      s.els[a].classList.remove('is-lift'); s.els[b].classList.remove('is-lift');
      if (S !== s) return;
    }
    s.busy = false;
    s.els.forEach((el) => { el.disabled = false; el.classList.add('is-ready'); });
    s.box.querySelector('.np-chal-hint').textContent = 'Chọn 1 lá bài! (bấm hoặc phím 1 · 2 · 3)';
  }
  async function choose(i) {
    const s = S;
    if (!s || s.busy || s.picked >= 0) return;
    s.picked = i;
    s.els.forEach((el) => { el.disabled = true; el.classList.remove('is-ready'); });
    s.els[i].classList.add('is-pick', 'is-flip');
    sfx('combo');
    s.box.querySelector('.np-chal-hint').textContent = KIND[s.cards[i].k].name + '!';
    await sleep(reduced() ? 0 : 700);
    if (S !== s) return;
    s.els.forEach((el, k) => { if (k !== i) el.classList.add('is-flip', 'is-other'); });
    const acts = s.box.querySelector('.np-chal-acts');
    acts.hidden = false;
    acts.querySelector('[data-cc-act="ans"]').hidden = !s.cards[i].a;
    acts.querySelector('[data-cc-act="done"]').focus({ preventScroll: true });
  }
  function showAnswer() {
    if (!S || S.picked < 0) return;
    const a = S.els[S.picked].querySelector('.np-cc-a');
    if (a) { a.hidden = false; sfx('match'); }
  }
  function finish() { const cb = S && S.onDone; close(); if (cb) cb(); }
  function close() { if (S) { S.box.remove(); S = null; } }
  function isOpen() { return !!S; }
  /** Phím khi đang mở: 1/2/3 chọn lá (theo vị trí trái → phải), Enter = Xong, Esc = đóng. Trả true nếu đã xử lý. */
  function key(e) {
    if (!S) return false;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 3 && S.picked < 0) { choose(S.slot.indexOf(n - 1)); return true; }
    if ((e.key === 'Enter' || e.key === ' ') && S.picked >= 0) { finish(); return true; }
    if (e.key === 'Escape') { finish(); return true; }
    return true; // phím khác: nuốt để không "Gọi tiếp" khi đang bốc thử thách
  }

  global.EduNamePickerChallenge = { open, close, isOpen, key, DECK };
})(typeof window !== 'undefined' ? window : globalThis);
