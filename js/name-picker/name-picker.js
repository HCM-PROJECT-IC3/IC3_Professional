/* ============================================================
   js/name-picker/name-picker.js — điều khiển trang "Gọi tên học sinh" (goi-ten.html).
   Nguồn tên · tuỳ chọn · lịch sử "đã gọi" · nút Bắt đầu. Sân khấu và 11 trò: np-games.js; tranh: np-art.js.
   Người được gọi chọn TRƯỚC (name-picker-core.js), trò chơi chỉ "diễn" tới kết quả đó.
   Chỉ đọc file tĩnh data/roster/students-active.json; lưu localStorage trên máy này — không gửi gì đi.
   ============================================================ */
(function (global) {
  'use strict';

  const N = global.EduNamePicker;
  const G = global.EduNamePickerGames;
  const $ = (id) => document.getElementById(id);
  const STORE = 'eduquiz_goiten_v1';
  const ROSTER_URL = 'data/roster/students-active.json';
  const rng = Math.random;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  const S = Object.assign({ src: 'class', school: '', cls: '', paste: '', num: 20, game: 'egg', random: false, noRepeat: true, twist: false, secs: 12, called: {}, absent: {} }, load());
  if (!G.GAMES.some((g) => g.id === S.game)) S.game = 'egg';   // bản cũ lưu tên trò khác
  S.secs = Math.max(5, Math.min(30, S.secs | 0 || 12));
  S.num = Math.max(2, Math.min(50, S.num | 0 || 20));
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* bộ nhớ đầy / bị chặn — vẫn dùng được */ } }

  let roster = null;          // { [school]: { [cls]: [names] } }
  let busy = false;
  let showing = false;        // khung kết quả đang hiện trên sân khấu
  let lastPlan = null;

  function toast(msg) {
    const t = $('npToast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* ignore */ } };

  // ============================================================
  // NGUỒN TÊN
  // ============================================================
  function listKey() {
    if (S.src === 'class') return `class:${S.school}|${S.cls}`;
    if (S.src === 'number') return `num:${S.num}`;
    return 'paste';
  }
  function fullList() {
    if (S.src === 'class') return (roster && roster[S.school] && roster[S.school][S.cls]) || [];
    if (S.src === 'number') return N.numberList(S.num);
    return N.parseNames(S.paste);
  }
  /** Vắng hôm nay của danh sách đang chọn (tự xoá khi sang ngày mới). */
  function absentList() { const a = S.absent[listKey()]; return a && a.day === today() ? a.names : []; }
  function setAbsent(name, on) {
    const cur = absentList().filter((n) => n !== name);
    if (on) cur.push(name);
    S.absent[listKey()] = { day: today(), names: cur };
    save();
  }
  const present = () => { const ab = new Set(absentList()); return fullList().filter((n) => !ab.has(n)); };
  const calledList = () => S.called[listKey()] || [];
  function pool() {
    const list = present();
    return S.noRepeat ? N.remaining(list, calledList().map((c) => c.name)) : { list, fresh: false };
  }
  const numeric = () => S.src === 'number';
  const label = (n) => (numeric() ? `Số ${n}` : n);

  async function loadRoster() {
    if (roster) return;
    try {
      const res = await fetch(ROSTER_URL, { cache: 'no-cache' });
      const data = await res.json();
      roster = {};
      (data.students || []).forEach((s) => {
        if (!s.school || !s.className || !s.name) return;
        const sch = roster[s.school] || (roster[s.school] = {});
        (sch[s.className] || (sch[s.className] = [])).push(String(s.name).trim());
      });
    } catch (e) {
      roster = {};
      $('npRosterNote').textContent = 'Không tải được danh sách lớp — thầy cô dùng mục "Dán danh sách" nhé.';
    }
  }
  const byText = (a, b) => a.localeCompare(b, 'vi', { numeric: true });
  function paintRosterSelects() {
    const schools = Object.keys(roster || {}).sort(byText);
    if (!schools.length) return;
    if (!roster[S.school]) S.school = schools[0];
    $('npSchool').innerHTML = schools.map((s) => `<option${s === S.school ? ' selected' : ''}>${esc(s)}</option>`).join('');
    const classes = Object.keys(roster[S.school]).sort(byText);
    if (!roster[S.school][S.cls]) S.cls = classes[0];
    $('npClass').innerHTML = classes.map((c) => `<option${c === S.cls ? ' selected' : ''}>${esc(c)}</option>`).join('');
  }
  function paintRoster() {
    const list = fullList(), ab = new Set(absentList());
    $('npRosterNote').innerHTML = list.length
      ? `${list.length - ab.size}/${list.length} bạn có mặt · <b>bấm tên để đánh dấu vắng</b> (tự bỏ đánh dấu vào ngày mai)`
      : 'Lớp này chưa có tên học sinh.';
    $('npRoster').innerHTML = list.map((n) => `<button type="button" class="np-chip${ab.has(n) ? ' is-absent' : ''}" data-name="${esc(n)}" aria-pressed="${ab.has(n)}">${esc(n)}</button>`).join('');
  }
  async function paintSource() {
    document.querySelectorAll('#npSrcTabs [data-src]').forEach((b) => { const on = b.dataset.src === S.src; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== S.src; });
    if (S.src === 'class') { await loadRoster(); paintRosterSelects(); paintRoster(); }
    $('npPaste').value = S.paste;
    $('npNum').value = S.num; $('npNumOut').textContent = S.num;
    refresh(true);
  }

  // ============================================================
  // LƯỚI TRÒ · THANH TRẠNG THÁI · ĐÃ GỌI
  // ============================================================
  function paintGames() {
    $('npGames').innerHTML = G.GAMES.map((g) => `<button type="button" class="np-pick" role="radio" data-game="${g.id}" aria-checked="${g.id === S.game}">
      <span class="np-pick-ic">${g.icon()}</span><span><b>${esc(g.name)}</b><small>${esc(g.desc)}</small></span></button>`).join('');
  }
  function refresh(redraw) {
    const all = present(), called = calledList(), p = pool();
    const notYet = S.noRepeat ? (p.fresh ? 0 : p.list.length) : all.length;
    $('npStatus').textContent = !all.length ? 'Chưa có tên nào — chọn lớp hoặc dán danh sách bên dưới.'
      : S.noRepeat ? `Còn ${notYet}/${all.length} bạn chưa được gọi` : `${all.length} bạn · có thể gọi lại bạn đã được gọi`;
    $('npPlayers').textContent = all.length ? `${all.length} bạn` : '';
    $('npGo').disabled = busy || !all.length;
    $('npCalledCount').textContent = called.length ? `(${called.length})` : '';
    $('npCalled').innerHTML = called.length
      ? called.slice().reverse().map((c, i) => `<li><b>${esc(label(c.name))}</b><small>${esc(c.at)}</small>
          <button type="button" class="np-x" data-uncall="${called.length - 1 - i}" title="Bỏ khỏi danh sách đã gọi" aria-label="Bỏ ${esc(label(c.name))} khỏi danh sách đã gọi">×</button></li>`).join('')
      : '<li class="np-empty">Chưa có ai.</li>';
    document.querySelectorAll('#npGames [data-game]').forEach((b) => { const on = b.dataset.game === S.game; b.setAttribute('aria-checked', on); });
    $('npNoRepeat').checked = S.noRepeat;
    $('npTwist').checked = S.twist;
    $('npRandom').checked = S.random;
    $('npSecs').value = S.secs; $('npSecsOut').textContent = `${S.secs} giây`;
    if (redraw && !busy && !showing) idle();
  }
  function idle() {
    const list = pool().list;
    if (!list.length) {
      G.idle(S.game, [], numeric());
      const fx = document.querySelector('#npStage .np-fx');
      if (fx) fx.insertAdjacentHTML('beforeend', '<div class="np-hint-pill">Chọn lớp hoặc dán danh sách học sinh ở thẻ "Người chơi" bên dưới.</div>');
      return;
    }
    G.idle(S.game, list, numeric(), fullList());
  }

  // ============================================================
  // GỌI TÊN
  // ============================================================
  async function go() {
    if (busy) return;
    const p = pool();
    if (!p.list.length) return;
    showing = false;
    if (p.fresh && S.noRepeat && calledList().length) { S.called[listKey()] = []; save(); toast('Đã gọi hết lớp — bắt đầu vòng mới!'); }
    const list = p.list;
    const winner = N.pick(list, rng);
    const twist = S.twist && list.length > 1 ? N.decoy(list, winner, rng) : null;
    const game = S.random ? G.GAMES[Math.floor(rng() * G.GAMES.length)].id : S.game;
    if (S.random) { S.game = game; refresh(false); }
    const plan = { list, winner, twist, ms: S.secs * 1000, game };
    lastPlan = plan;
    busy = true;
    document.body.classList.add('is-busy');
    $('npGo').disabled = true;
    $('npGo').textContent = 'Đang chọn...';
    try {
      if (reduced()) G.idle(game, list, numeric(), fullList()); else await G.play(game, plan, numeric(), fullList());
    } catch (e) { /* hiệu ứng lỗi vẫn công bố kết quả */ }
    busy = false;
    document.body.classList.remove('is-busy');
    $('npGo').textContent = 'Bắt đầu!';
    const at = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    (S.called[listKey()] = calledList()).push({ name: winner, at });
    save();
    reveal(plan);
    refresh(false);
  }
  function reveal(plan) {
    showing = true;
    // Số thứ tự trong danh sách — khớp huy hiệu số trên sân khấu khi lớp đông
    const stt = numeric() ? 0 : fullList().indexOf(plan.winner) + 1;
    const sub = [stt ? `Số thứ tự ${stt}` : '', S.src === 'class' ? `${S.cls} · ${S.school}` : ''].filter(Boolean).join(' · ');
    const acts = G.result(label(plan.winner), sub, !!plan.twist);
    acts.innerHTML = `<button type="button" class="np-go np-go-sm" data-rv="next">Gọi tiếp <kbd>Space</kbd></button>
      <button type="button" class="np-small" data-rv="absent"><i class="fa-solid fa-user-xmark" aria-hidden="true"></i> Bạn này vắng — gọi bạn khác</button>
      <button type="button" class="np-small" data-rv="close">Đóng <kbd>Esc</kbd></button>`;
    sfx('win');
    if (global.EduFX) global.EduFX.confetti({ count: 140 });
    acts.querySelector('[data-rv="next"]').focus({ preventScroll: true });
  }
  function closeReveal() { showing = false; G.clearResult(); idle(); }

  // ============================================================
  // SỰ KIỆN
  // ============================================================
  function paintSound() {
    const off = global.EduSFX && global.EduSFX.isMuted();
    $('npSound').innerHTML = `<i class="fa-solid ${off ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>`;
    $('npSound').setAttribute('aria-pressed', String(!off));
  }
  function toggleFull() {
    const el = $('npStageWrap');
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else el.requestFullscreen();
    } catch (e) { toast('Trình duyệt không cho mở toàn màn hình — bấm F11 nhé.'); }
  }
  function init() {
    G.mount($('npStage'));
    paintGames();
    $('npGo').addEventListener('click', go);
    $('npStage').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rv]');
      if (b) { onReveal(b.dataset.rv); return; }
      if (!busy && !showing) go();
    });
    $('npGames').addEventListener('click', (e) => {
      const b = e.target.closest('[data-game]');
      if (!b || busy) return;
      S.game = b.dataset.game; S.random = false; save(); showing = false; refresh(true); sfx('click');
    });
    $('npSrcTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-src]');
      if (!b || busy) return;
      S.src = b.dataset.src; save(); showing = false; paintSource();
    });
    $('npSchool').addEventListener('change', () => { S.school = $('npSchool').value; S.cls = ''; paintRosterSelects(); save(); paintRoster(); refresh(true); });
    $('npClass').addEventListener('change', () => { S.cls = $('npClass').value; save(); paintRoster(); refresh(true); });
    $('npRoster').addEventListener('click', (e) => {
      const b = e.target.closest('[data-name]');
      if (!b || busy) return;
      setAbsent(b.dataset.name, !b.classList.contains('is-absent'));
      paintRoster(); refresh(!showing);
    });
    $('npPasteUse').addEventListener('click', () => {
      const list = N.parseNames($('npPaste').value);
      if (!list.length) { toast('Chưa có tên nào — mỗi dòng 1 tên nhé.'); return; }
      S.paste = list.join('\n'); save();
      $('npPaste').value = S.paste;
      $('npPasteNote').textContent = `Đã nhận ${list.length} tên (đã bỏ số thứ tự, cột lớp và tên trùng). Chỉ lưu trên máy này.`;
      showing = false; refresh(true);
    });
    $('npPasteClear').addEventListener('click', () => {
      if (S.paste && !global.confirm('Xoá danh sách đã dán và lịch sử đã gọi của danh sách này?')) return;
      S.paste = ''; S.called.paste = []; delete S.absent.paste; save(); paintSource();
    });
    const setNum = (v) => { S.num = Math.max(2, Math.min(50, v | 0 || 2)); save(); $('npNum').value = S.num; $('npNumOut').textContent = S.num; showing = false; refresh(true); };
    $('npNum').addEventListener('input', () => setNum(+$('npNum').value));
    document.querySelectorAll('[data-num]').forEach((b) => b.addEventListener('click', () => setNum(S.num + +b.dataset.num)));
    $('npNoRepeat').addEventListener('change', () => { S.noRepeat = $('npNoRepeat').checked; save(); refresh(!showing); });
    $('npTwist').addEventListener('change', () => { S.twist = $('npTwist').checked; save(); });
    $('npRandom').addEventListener('change', () => { S.random = $('npRandom').checked; save(); });
    $('npSecs').addEventListener('input', () => { S.secs = +$('npSecs').value; save(); $('npSecsOut').textContent = `${S.secs} giây`; });
    $('npReset').addEventListener('click', () => {
      if (!calledList().length) return;
      if (!global.confirm('Xoá danh sách "Đã được gọi" của danh sách này để gọi lại từ đầu?')) return;
      S.called[listKey()] = []; save(); refresh(!showing);
    });
    $('npCalled').addEventListener('click', (e) => {
      const b = e.target.closest('[data-uncall]');
      if (!b) return;
      calledList().splice(+b.dataset.uncall, 1); save(); refresh(!showing);
    });
    $('npSound').addEventListener('click', () => { if (global.EduSFX) global.EduSFX.toggleMuted(); paintSound(); sfx('click'); });
    $('npFull').addEventListener('click', toggleFull);
    $('npTheme').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('ic3_theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    });
    document.addEventListener('keydown', (e) => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape' && showing) { closeReveal(); return; }
      if (e.key === ' ' || (e.key === 'Enter' && !(e.target.closest && e.target.closest('button')))) {
        e.preventDefault();
        if (!busy) go();
      }
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) toggleFull();
    });
    paintSound();
    paintSource();
  }
  function onReveal(act) {
    if (act === 'close') closeReveal();
    else if (act === 'next') go();
    else if (act === 'absent') {
      // Bỏ lượt vừa gọi, đánh dấu vắng hôm nay rồi gọi bạn khác
      const list = calledList();
      const i = list.map((c) => c.name).lastIndexOf(lastPlan.winner);
      if (i >= 0) list.splice(i, 1);
      setAbsent(lastPlan.winner, true);
      toast(`Đã đánh dấu ${label(lastPlan.winner)} vắng hôm nay.`);
      if (S.src === 'class') paintRoster();
      refresh(false);
      go();
    }
  }
  init();

  global.EduNamePickerUI = { _state: () => S, go };
})(window);
