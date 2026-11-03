/* ============================================================
   js/thi-dua/thi-dua.js — giao diện trang "Thi đua lớp học" (thi-dua.html).
   Logic điểm ở js/thi-dua/thi-dua-core.js (EduThiDua); tách tên dán vào dùng
   EduNamePicker.parseNames (cùng bộ tách với Gọi tên học sinh).
   Lưu trữ: localStorage 'eduquiz_thidua_v1' trên máy giáo viên — 0 Firebase, 0 Apps Script.
   Danh sách lớp có sẵn: data/roster/students-active.json (file tĩnh, như goi-ten.html) — không có thì dán tay.
   Đo tiếng ồn: getUserMedia + AnalyserNode, chỉ đọc âm lượng từng khung hình, không ghi/gửi âm thanh.
   ============================================================ */
(function (global) {
  'use strict';
  const T = global.EduThiDua;
  const N = global.EduNamePicker;
  const $ = (id) => document.getElementById(id);
  const STORE = 'eduquiz_thidua_v1';
  const ROSTER_URL = 'data/roster/students-active.json';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byText = (a, b) => a.localeCompare(b, 'vi', { numeric: true });
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* âm thanh chỉ là phụ */ } };

  // ── Lưu trữ ──
  function load() {
    try { return T.normalize(JSON.parse(localStorage.getItem(STORE))) || T.emptyState(); } catch (e) { return T.emptyState(); }
  }
  let S = load();
  let storageWarned = false;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {
      if (!storageWarned) { storageWarned = true; toast('Không lưu được vào trình duyệt (bộ nhớ đầy / bị chặn) — tải file sao lưu ở thẻ Cài đặt.'); }
    }
  }
  const cls = () => S.classes[S.cur] || null;

  let tab = 'board';
  const selected = new Set();

  function toast(msg) {
    const t = $('tdToast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ── Pháo giấy nhẹ (canvas, tự tắt khi người dùng chọn giảm chuyển động) ──
  function confetti() {
    try { if (global.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* ignore */ }
    const cv = $('tdConfetti');
    const ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return;
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#2f40b2', '#f6a723', '#21b36b', '#ff8f1f', '#f0483e'];
    const bits = Array.from({ length: 90 }, () => ({ x: cv.width / 2, y: cv.height / 3, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 4,
      s: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0], r: Math.random() * 6 }));
    let frames = 0;
    (function step() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      bits.forEach((b) => { b.x += b.vx; b.y += b.vy; b.vy += 0.35; b.r += 0.2; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore(); });
      if (++frames < 110) requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  // ============================================================
  // LỚP: chọn / tạo / danh sách có sẵn
  // ============================================================
  function paintClassSelect() {
    const list = Object.values(S.classes).sort((a, b) => byText(a.name, b.name));
    $('tdClass').innerHTML = list.map((c) => `<option value="${esc(c.id)}"${c.id === S.cur ? ' selected' : ''}>${esc(c.name)} (${c.students.length})${c.kind === 'gvcn' ? ' · Chủ nhiệm' : ''}</option>`).join('');
    $('tdClass').hidden = !list.length;
  }

  let roster = null; // { school: { class: [names] } }
  async function loadRoster() {
    if (roster) return roster;
    try {
      const res = await fetch(ROSTER_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      roster = {};
      (data.students || []).forEach((s) => {
        if (!s.school || !s.className || !s.name) return;
        const sch = roster[s.school] || (roster[s.school] = {});
        (sch[s.className] || (sch[s.className] = [])).push(String(s.name).trim());
      });
    } catch (e) { roster = {}; }
    return roster;
  }
  async function showSetup(canCancel) {
    $('tdSetup').hidden = false;
    $('tdMain').hidden = true;
    $('tdCancelNew').hidden = !canCancel;
    $('tdNewName').focus();
    const r = await loadRoster();
    const schools = Object.keys(r).sort(byText);
    $('tdRosterPick').hidden = !schools.length;
    if (!schools.length) return;
    $('tdRosterSchool').innerHTML = schools.map((s) => `<option>${esc(s)}</option>`).join('');
    const paintClasses = () => {
      const cs = Object.keys(r[$('tdRosterSchool').value] || {}).sort(byText);
      $('tdRosterClass').innerHTML = cs.map((c) => `<option>${esc(c)}</option>`).join('');
    };
    $('tdRosterSchool').onchange = paintClasses;
    paintClasses();
  }
  function countNames() {
    const n = N.parseNames($('tdNewNames').value).length;
    $('tdNewCount').textContent = n ? `${n} học sinh` : '';
  }
  function createClass() {
    const names = N.parseNames($('tdNewNames').value);
    if (!names.length) { toast('Dán danh sách học sinh trước (mỗi dòng 1 tên).'); return; }
    const c = T.newClass($('tdNewName').value, names, Number($('tdNewGroups').value), $('tdNewKind').value);
    S.classes[c.id] = c;
    S.cur = c.id;
    save();
    $('tdNewName').value = ''; $('tdNewNames').value = ''; countNames();
    selected.clear();
    tab = 'board'; // lớp mới → mở thẳng Bảng điểm
    showMain();
    toast(`Đã tạo bảng thi đua ${c.name} — ${c.students.length} học sinh, ${c.groups.length} tổ.`);
  }

  function showMain() {
    paintClassSelect();
    if (!cls()) { showSetup(false); return; }
    $('tdSetup').hidden = true;
    $('tdMain').hidden = false;
    setTab(tab);
  }

  // ============================================================
  // THẺ
  // ============================================================
  function setTab(t) {
    tab = t;
    document.querySelectorAll('.td-tabs [role=tab]').forEach((b) => {
      const on = b.dataset.tab === t;
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.td-panel').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    render();
  }
  function render() {
    const c = cls();
    if (!c) return;
    if (tab === 'board') renderBoard(c);
    else if (tab === 'groups') renderGroups(c);
    else if (tab === 'week') renderWeek(c);
    else if (tab === 'honor') renderHonor(c);
    else if (tab === 'shop') renderShop(c);
    else if (tab === 'setup') renderSetup(c);
  }

  // ============================================================
  // BẢNG ĐIỂM
  // ============================================================
  const initials = (name) => { const p = name.split(' ').filter(Boolean); return (p[p.length - 1] || '?').charAt(0).toUpperCase(); };
  const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

  function renderBoard(c) {
    const sc = T.scores(c);
    const order = c.students.slice().sort((a, b) => byText(a.group, b.group) || byText(a.name, b.name));
    $('tdGrid').innerHTML = order.map((s) => {
      const p = sc[s.id];
      const on = selected.has(s.id);
      return `<button type="button" class="td-st${on ? ' is-on' : ''}" data-id="${esc(s.id)}" aria-pressed="${on}">
        <span class="td-av" style="--h:${hue(s.name)}">${esc(initials(s.name))}</span>
        <span class="td-st-name">${esc(s.name)}</span>
        <span class="td-st-group">${esc(s.group)}</span>
        <b class="td-st-pts${p.earned < 0 ? ' neg' : ''}">${p.earned}</b>
        ${p.spent ? `<small class="td-st-bal" title="Điểm còn để đổi quà">còn ${p.balance}</small>` : ''}
      </button>`;
    }).join('') || '<p class="td-note">Lớp chưa có học sinh — thêm ở thẻ Cài đặt.</p>';
    paintSelection(c);
    const critBtn = (k) => `<button type="button" class="td-critbtn" data-pts="${k.points}" data-label="${esc(k.label)}"><i class="fa-solid ${esc(k.icon)}" aria-hidden="true"></i> ${esc(k.label)} <b>${k.points > 0 ? '+' : '−'}${Math.abs(k.points)}</b></button>`;
    const crit = T.criteriaFor(S, c);
    $('tdCritPlus').innerHTML = crit.plus.map(critBtn).join('');
    $('tdCritMinus').innerHTML = crit.minus.map(critBtn).join('');
    // Lớp chủ nhiệm: tổ trực nhật tuần này (xoay vòng theo tuần, dời được 1 lượt)
    const duty = c.kind === 'gvcn' && c.groups.length > 1 ? T.dutyGroup(c) : '';
    $('tdDuty').hidden = !duty;
    if (duty) $('tdDuty').innerHTML = `<i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Tổ trực nhật tuần này: <b>${esc(duty)}</b>
      <button type="button" class="td-btn" id="tdDutyNext" title="Dời sang tổ kế tiếp (các tuần sau xoay vòng theo)">Đổi tổ</button>`;
    $('tdSelGroups').innerHTML = c.groups.map((g) => `<button type="button" class="td-btn" data-group="${esc(g)}">${esc(g)}</button>`).join('');
    renderSide(c);
  }
  function paintSelection(c) {
    const n = selected.size;
    $('tdSelInfo').textContent = n ? (n === c.students.length ? `Đã chọn cả lớp (${n})` : `Đã chọn ${n} em`) : 'Bấm tên để chọn em';
    $('tdActions').classList.toggle('has-sel', n > 0);
    $('tdUndo').disabled = !c.log.length;
    document.querySelectorAll('#tdGrid .td-st').forEach((b) => {
      const on = selected.has(b.dataset.id);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on);
    });
  }
  function weekStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  function renderSide(c) {
    const week = T.earnedSince(c, weekStart());
    const top = c.students.map((s) => ({ name: s.name, pts: week[s.id] || 0 })).filter((x) => x.pts > 0)
      .sort((a, b) => (b.pts - a.pts) || byText(a.name, b.name)).slice(0, 5);
    $('tdWeekTop').innerHTML = top.length
      ? top.map((x, i) => `<li><span class="td-rank r${i + 1}">${i + 1}</span> ${esc(x.name)} <b>+${x.pts}</b></li>`).join('')
      : '<li class="td-note">Tuần này chưa có điểm cộng.</li>';
    const fmt = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`; };
    $('tdFeed').innerHTML = T.recent(c, 12).map((e) => `<li class="${e.kind === 'redeem' ? 'is-redeem' : e.delta > 0 ? 'is-plus' : 'is-minus'}">
        <b>${e.kind === 'redeem' ? '<i class="fa-solid fa-gem" aria-hidden="true"></i>' : (e.delta > 0 ? '+' : '−') + Math.abs(e.delta)}</b>
        <span>${esc(e.names.length > 3 ? `${e.names.slice(0, 3).join(', ')} +${e.names.length - 3}` : e.names.join(', '))} · ${esc(e.reason || (e.delta > 0 ? 'Cộng điểm' : 'Trừ điểm'))}</span>
        <small>${fmt(e.t)}</small></li>`).join('') || '<li class="td-note">Chưa có hoạt động.</li>';
  }
  function applyPoints(pts, label) {
    const c = cls();
    if (!selected.size) { toast('Bấm tên học sinh (hoặc Cả lớp / 1 tổ) trước khi chấm.'); return; }
    const e = T.award(c, [...selected], pts, label);
    if (!e) return;
    save();
    sfx(pts > 0 ? (e.ids.length > 3 ? 'cheer' : 'correct') : 'wrong');
    if (pts > 0 && e.ids.length === c.students.length) confetti();
    toast(`${pts > 0 ? '+' : '−'}${Math.abs(pts)} ${label} · ${e.ids.length === 1 ? c.students.find((s) => s.id === e.ids[0]).name : e.ids.length + ' em'}`);
    selected.clear();
    renderBoard(c);
  }
  function undo() {
    const c = cls();
    const e = c && T.undo(c);
    if (!e) return;
    save();
    toast(`Đã hoàn tác: ${e.kind === 'redeem' ? 'đổi ' : ''}${e.reason || ''} (${e.ids.length} em)`);
    render();
  }

  // ============================================================
  // THI ĐUA TỔ
  // ============================================================
  function renderGroups(c) {
    const rows = T.groupBoard(c);
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.avg)));
    $('tdGroups').innerHTML = rows.map((r, i) => `<li class="td-g${i === 0 && r.total > 0 ? ' is-lead' : ''}" style="--w:${Math.max(4, Math.round((Math.max(0, r.avg) / max) * 100))}%">
      <span class="td-rank r${i + 1}">${i + 1}</span>
      <span class="td-g-name">${esc(r.group)} <small>${r.members} em</small></span>
      <span class="td-g-bar"><i></i></span>
      <b class="td-g-avg" title="Điểm TB mỗi em">${r.avg}</b><small class="td-g-total">tổng ${r.total}</small>
      <span class="td-g-act"><button type="button" class="td-btn" data-gpts="1" data-group="${esc(r.group)}" aria-label="Cộng 1 điểm cho ${esc(r.group)}">+1</button>
        <button type="button" class="td-btn" data-gpts="-1" data-group="${esc(r.group)}" aria-label="Trừ 1 điểm của ${esc(r.group)}">−1</button></span>
    </li>`).join('');
  }
  function groupPoints(group, pts) {
    const c = cls();
    const ids = c.students.filter((s) => s.group === group).map((s) => s.id);
    if (!ids.length || !T.award(c, ids, pts, pts > 0 ? `Cả ${group} được khen` : `Cả ${group} bị nhắc nhở`)) return;
    save();
    sfx(pts > 0 ? 'cheer' : 'wrong');
    if (pts > 0) confetti();
    renderGroups(c);
  }

  // ============================================================
  // SƠ KẾT TUẦN — tin nhắn lớp (2 loại lớp) · tin nhắn phụ huynh (chủ nhiệm) · so sánh lớp (bộ môn)
  // ============================================================
  let weekOffset = 0;
  let weekCache = null; // { sum, bounds } cho nút Chép
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (e) { global.prompt('Trình duyệt chặn chép tự động — bôi đen rồi Ctrl+C:', text); }
  }
  function renderWeek(c) {
    const bounds = T.weekBounds(weekOffset);
    const sum = T.weekSummary(c, bounds);
    weekCache = { sum, bounds };
    document.querySelectorAll('.td-seg [data-week]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.week) === weekOffset)));
    $('tdWeekLabel').textContent = `${T.weekLabel(bounds)} · ${sum.entries} lượt ghi nhận`;
    const li = (html) => `<li>${html}</li>`;
    $('tdWeekGroups').innerHTML = sum.groups.map((g, i) => li(`<span class="td-rank r${i + 1}">${i + 1}</span> ${esc(g.group)} <b>${g.net > 0 ? '+' : ''}${g.net}</b> <small>TB ${g.avg}</small>`)).join('');
    $('tdWeekPraise').innerHTML = sum.top.map((s, i) => li(`<span class="td-rank r${i + 1}">${i + 1}</span> ${esc(s.name)} <b>+${s.net}</b>`)).join('') || '<li class="td-note">Chưa có em nào được cộng điểm.</li>';
    $('tdWeekRemind').innerHTML = sum.reminders.map((s) => li(`${esc(s.name)} <b class="neg">−${s.minus}</b> <small>${esc(Object.keys(s.reasons).filter((r) => s.reasons[r].pts < 0).join(', '))}</small>`)).join('') || '<li class="td-note">Không có em nào.</li>';
    $('tdWeekReasons').innerHTML = Object.entries(sum.reasonCounts).sort((a, b) => b[1].n - a[1].n).slice(0, 6)
      .map(([r, v]) => li(`<span class="td-dot ${v.sign > 0 ? 'plus' : 'minus'}"></span> ${esc(r)} <b>${v.n} lượt</b>`)).join('') || '<li class="td-note">Chưa có ghi nhận.</li>';
    $('tdClassMsg').textContent = T.classMessage(c, sum, bounds);

    // Chủ nhiệm: tin nhắn từng phụ huynh
    $('tdParents').hidden = c.kind !== 'gvcn';
    if (c.kind === 'gvcn') {
      $('tdSign').value = S.sign || '';
      const total = T.scores(c);
      const list = sum.students.filter((s) => !$('tdOnlyNoted').checked || s.plus || s.minus).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      $('tdParentList').innerHTML = list.map((s) => `<li>
          <div class="td-pm-head"><b>${esc(s.name)}</b> <span class="td-pm-pts">${s.plus ? `<i class="plus">+${s.plus}</i>` : ''}${s.minus ? ` <i class="minus">−${s.minus}</i>` : ''}</span>
            <button type="button" class="td-btn" data-pm="${esc(s.id)}"><i class="fa-solid fa-copy" aria-hidden="true"></i> Chép</button></div>
          <pre class="td-msg small">${esc(T.parentMessage(c, s, bounds, { total: total[s.id].earned, teacher: S.sign }))}</pre></li>`).join('')
        || '<li class="td-note">Tuần này chưa em nào có ghi nhận — bỏ chọn "Chỉ em có ghi nhận" để soạn cho cả lớp.</li>';
    }
    // Bộ môn: so sánh các lớp cùng loại
    const cmp = c.kind === 'gvcn' ? [] : T.compareClasses(S, bounds, 'gvbm');
    $('tdCompare').hidden = cmp.length < 2;
    $('tdCompareRows').innerHTML = cmp.map((r, i) => `<tr${r.id === c.id ? ' class="is-cur"' : ''}><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.students}</td>
      <td class="num">${r.active}</td><td class="num">+${r.plus}</td><td class="num">${r.minus ? '−' + r.minus : 0}</td><td class="num"><b>${r.avg}</b></td></tr>`).join('');
  }
  function parentText(c, s) {
    return T.parentMessage(c, s, weekCache.bounds, { total: T.scores(c)[s.id].earned, teacher: S.sign });
  }

  // ============================================================
  // HOA ĐIỂM 10 — mã kết quả IC3 (EduResultPack) → điểm thi đua
  // ============================================================
  const GATHER_KEY = 'eduquiz_gom_ket_qua_v1'; // js/gom-ket-qua.js lưu mã gốc ở đây (cùng tên miền)
  let pending = null; // { rows, source }
  function gatheredCodes() {
    try { const o = JSON.parse(localStorage.getItem(GATHER_KEY) || 'null'); return o && Array.isArray(o.codes) ? o.codes.filter((x) => typeof x === 'string') : []; } catch (e) { return []; }
  }
  function readRows(text, source) {
    const P = global.EduResultPack;
    if (!P) { toast('Không tải được bộ đọc mã kết quả.'); return; }
    const res = P.parseMany(text);
    if (!res.rows.length) { toast(res.bad.length ? `${res.bad.length} mã bị lỗi chép — không đọc được.` : 'Không tìm thấy mã kết quả nào (mã bắt đầu bằng EQR1.).'); return; }
    pending = { rows: res.rows, source, bad: res.bad.length };
    const rc = T.resultClasses(cls(), res.rows);
    $('tdImpClass').innerHTML = rc.list.map((c) => `<option${c === rc.guess ? ' selected' : ''}>${esc(c)}</option>`).join('')
      || '<option value="">(không có tên nào khớp bảng này)</option>';
    previewImport();
  }
  function previewImport() {
    const box = $('tdImpPreview');
    if (!pending) { box.hidden = true; return; }
    const dry = JSON.parse(JSON.stringify(cls())); // chạy thử trên bản sao — chưa đổi gì
    const r = T.importResults(dry, pending.rows, { className: $('tdImpClass').value });
    box.hidden = false;
    box.innerHTML = `<p><b>${pending.rows.length}</b> mã đọc được từ ${esc(pending.source)}${pending.bad ? ` (${pending.bad} mã lỗi)` : ''} · lớp <b>${esc($('tdImpClass').value || '—')}</b>:</p>
      <ul>
        <li>Sẽ cộng <b>${r.awarded}</b> bài (+${r.points} điểm), trong đó <b>${r.perfect}</b> bài điểm 10</li>
        ${r.already ? `<li>${r.already} bài đã nhập trước đó — bỏ qua</li>` : ''}
        ${r.low ? `<li>${r.low} bài dưới 90% — không cộng</li>` : ''}
        ${r.unmatched.length ? `<li>Không có trong bảng (kiểm tra cách viết tên): ${r.unmatched.slice(0, 12).map(esc).join(', ')}${r.unmatched.length > 12 ? '…' : ''}</li>` : ''}
      </ul>
      <div class="td-row"><button type="button" class="td-btn primary" id="tdImpGo"${r.awarded || r.low ? '' : ' disabled'}><i class="fa-solid fa-check" aria-hidden="true"></i> Cộng điểm</button>
        <button type="button" class="td-btn" id="tdImpCancel">Huỷ</button></div>`;
    $('tdImpGo').addEventListener('click', applyImport);
    $('tdImpCancel').addEventListener('click', () => { pending = null; previewImport(); });
  }
  function applyImport() {
    const c = cls();
    const r = T.importResults(c, pending.rows, { className: $('tdImpClass').value });
    pending = null;
    save();
    previewImport();
    $('tdImpText').value = '';
    renderHonor(c);
    if (r.perfect) { sfx('win'); confetti(); } else if (r.awarded) sfx('correct');
    toast(`Đã cộng ${r.awarded} bài (+${r.points} điểm)${r.perfect ? ` — ${r.perfect} bài điểm 10!` : ''}`);
  }
  function renderHonor(c) {
    const n = gatheredCodes().length;
    $('tdImpAvail').textContent = n ? `Trang Gom kết quả trên máy này đang có ${n} mã.` : 'Trang Gom kết quả trên máy này chưa có mã nào.';
    $('tdImpGather').disabled = !n;
    $('tdHonorClass').textContent = c.name;
    const list = T.honorBoard(c);
    $('tdHonors').innerHTML = list.length ? list.map((e, i) => `<div class="td-honor${i < 3 ? ' top' + (i + 1) : ''}">
        <span class="td-honor-flower" aria-hidden="true"><i class="fa-solid fa-award"></i><b>${e.count}</b></span>
        <span class="td-honor-name">${esc(e.name)}</span>
        <span class="td-honor-meta">${esc(e.group)} · ${e.count} bài điểm 10</span>
        <span class="td-honor-tests">${e.tests.slice(-3).map(esc).join(' · ')}${e.tests.length > 3 ? ` +${e.tests.length - 3}` : ''}</span>
      </div>`).join('')
      : '<p class="td-note">Chưa có bài điểm 10 nào. Gom mã kết quả học sinh gửi rồi bấm "Lấy từ trang Gom kết quả".</p>';
  }

  // ============================================================
  // ĐỔI QUÀ
  // ============================================================
  let shopStudent = '';
  function renderShop(c) {
    const lb = T.leaderboard(c).slice().sort((a, b) => byText(a.name, b.name));
    if (!lb.some((s) => s.id === shopStudent)) shopStudent = (lb[0] && lb[0].id) || '';
    $('tdShopStudent').innerHTML = lb.map((s) => `<option value="${esc(s.id)}"${s.id === shopStudent ? ' selected' : ''}>${esc(s.name)} — còn ${s.balance} điểm</option>`).join('');
    const me = lb.find((s) => s.id === shopStudent);
    $('tdShopBalance').textContent = me ? `${me.name}: còn ${me.balance} điểm (thi đua ${me.earned})` : '';
    $('tdRewards').innerHTML = S.rewards.map((r) => {
      const can = me && me.balance >= r.cost;
      return `<button type="button" class="td-reward${can ? '' : ' is-locked'}" data-rid="${esc(r.id)}" ${can ? '' : 'aria-disabled="true"'}>
        <i class="fa-solid ${esc(r.icon)}" aria-hidden="true"></i><span>${esc(r.label)}</span><b>${r.cost} điểm</b></button>`;
    }).join('') || '<p class="td-note">Chưa có phần thưởng — thêm ở thẻ Cài đặt.</p>';
  }
  function buy(rid) {
    const c = cls();
    const r = S.rewards.find((x) => x.id === rid);
    if (!r || !shopStudent) return;
    const name = (c.students.find((s) => s.id === shopStudent) || {}).name;
    const res = T.redeem(c, shopStudent, r);
    if (!res.ok) { toast(res.error); sfx('wrong'); return; }
    save();
    sfx('win');
    confetti();
    toast(`${name} đã đổi "${r.label}" (−${r.cost} điểm).`);
    renderShop(c);
  }

  // ============================================================
  // CÀI ĐẶT
  // ============================================================
  function renderSetup(c) {
    $('tdClassName').value = c.name;
    $('tdGroupCount').value = c.groups.length;
    const sc = T.scores(c);
    $('tdStudents').innerHTML = c.students.slice().sort((a, b) => byText(a.name, b.name)).map((s) => `<li>
      <span>${esc(s.name)} <small>${sc[s.id].earned} điểm</small></span>
      <select class="td-select" data-move="${esc(s.id)}" aria-label="Tổ của ${esc(s.name)}">${c.groups.map((g) => `<option${g === s.group ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <button type="button" class="td-x" data-del="${esc(s.id)}" aria-label="Xoá ${esc(s.name)} khỏi lớp"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li>`).join('');
    const editRow = (k, kind) => `<li><i class="fa-solid ${esc(k.icon)}" aria-hidden="true"></i> <span>${esc(k.label)}</span>
      <b>${kind === 'reward' ? k.cost + ' điểm' : (k.points > 0 ? '+' : '−') + Math.abs(k.points)}</b>
      <button type="button" class="td-x" data-rm="${kind}:${esc(k.id)}" aria-label="Xoá ${esc(k.label)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li>`;
    const crit = T.criteriaFor(S, c);
    $('tdKind').value = c.kind || 'gvbm';
    $('tdCritTitle').textContent = `Tiêu chí (dùng chung các ${c.kind === 'gvcn' ? 'lớp chủ nhiệm' : 'lớp bộ môn'})`;
    $('tdCritList').innerHTML = crit.plus.map((k) => editRow(k, 'plus')).concat(crit.minus.map((k) => editRow(k, 'minus'))).join('');
    $('tdRewardList').innerHTML = S.rewards.map((k) => editRow(k, 'reward')).join('');
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'lop';
  const stamp = () => new Date().toISOString().slice(0, 10);

  function wireSetup() {
    $('tdClassName').addEventListener('change', (e) => { const c = cls(); c.name = e.target.value.trim().slice(0, 40) || c.name; save(); paintClassSelect(); });
    $('tdRegroup').addEventListener('click', () => {
      const n = Math.max(1, Math.min(12, Number($('tdGroupCount').value) || 4));
      if (!confirm(`Chia lại ${n} tổ lần lượt theo danh sách? Điểm của từng em giữ nguyên.`)) return;
      T.setGroupCount(cls(), n); save(); renderSetup(cls()); toast(`Đã chia ${n} tổ.`);
    });
    $('tdStudents').addEventListener('change', (e) => {
      const id = e.target.dataset.move;
      if (!id) return;
      const s = cls().students.find((x) => x.id === id);
      if (s) { s.group = e.target.value; save(); }
    });
    $('tdStudents').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const c = cls();
      const s = c.students.find((x) => x.id === b.dataset.del);
      if (!s || !confirm(`Xoá ${s.name} khỏi ${c.name}? Điểm của em sẽ mất.`)) return;
      c.students = c.students.filter((x) => x.id !== s.id);
      c.log.forEach((en) => { en.ids = en.ids.filter((id) => id !== s.id); });
      c.log = c.log.filter((en) => en.ids.length);
      selected.delete(s.id);
      save(); renderSetup(c); paintClassSelect();
    });
    $('tdAddBtn').addEventListener('click', () => {
      const n = T.addStudents(cls(), N.parseNames($('tdAddNames').value));
      $('tdAddNames').value = '';
      save(); renderSetup(cls()); paintClassSelect();
      toast(n ? `Đã thêm ${n} học sinh.` : 'Không có tên mới (trùng hoặc trống).');
    });
    const remove = (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      const [kind, id] = b.dataset.rm.split(':');
      if (kind === 'reward') S.rewards = S.rewards.filter((r) => r.id !== id);
      else { const crit = T.criteriaFor(S, cls()); crit[kind] = crit[kind].filter((k) => k.id !== id); }
      save(); renderSetup(cls());
    };
    $('tdCritList').addEventListener('click', remove);
    $('tdRewardList').addEventListener('click', remove);
    $('tdCritAdd').addEventListener('click', () => {
      const label = $('tdCritLabel').value.trim().slice(0, 60);
      const pts = Math.round(Number($('tdCritPts').value) || 0);
      if (!label || !pts || Math.abs(pts) > 20) { toast('Nhập tên tiêu chí và điểm từ −20 đến 20 (khác 0).'); return; }
      const crit = T.criteriaFor(S, cls());
      (pts > 0 ? crit.plus : crit.minus).push({ id: 'k' + Date.now().toString(36), label, points: pts, icon: pts > 0 ? 'fa-star' : 'fa-triangle-exclamation' });
      $('tdCritLabel').value = '';
      save(); renderSetup(cls());
    });
    $('tdRewardAdd').addEventListener('click', () => {
      const label = $('tdRewardLabel').value.trim().slice(0, 60);
      const cost = Math.round(Number($('tdRewardCost').value) || 0);
      if (!label || cost < 1 || cost > 999) { toast('Nhập tên phần thưởng và giá từ 1 đến 999 điểm.'); return; }
      S.rewards.push({ id: 'r' + Date.now().toString(36), label, cost, icon: 'fa-gem' });
      $('tdRewardLabel').value = '';
      save(); renderSetup(cls());
    });
    $('tdCsv').addEventListener('click', () => download(`thi-dua-${slug(cls().name)}-${stamp()}.csv`, T.toCsv(cls()), 'text/csv;charset=utf-8'));
    $('tdBackup').addEventListener('click', () => download(`thi-dua-sao-luu-${stamp()}.json`, JSON.stringify(S), 'application/json'));
    $('tdRestore').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast('File quá lớn (tối đa 5 MB).'); return; }
      let next = null;
      try { next = T.normalize(JSON.parse(await f.text())); } catch (err) { next = null; }
      if (!next || !Object.keys(next.classes).length) { toast('File không phải bản sao lưu Thi đua lớp học.'); return; }
      if (!confirm(`Khôi phục ${Object.keys(next.classes).length} lớp từ file? Dữ liệu hiện tại trên máy sẽ được thay thế.`)) return;
      S = next; selected.clear(); save(); showMain(); toast('Đã khôi phục từ file sao lưu.');
    });
    $('tdResetPts').addEventListener('click', () => {
      const c = cls();
      if (!confirm(`Bắt đầu đợt thi đua mới cho ${c.name}? Điểm và lịch sử của lớp về 0 (nên tải CSV / sao lưu trước).`)) return;
      c.log = []; c.honors = []; c.students.forEach((s) => { s.carry = 0; s.carrySpent = 0; });
      // c.imported giữ nguyên: bài IC3 đã cộng ở đợt trước không được cộng lại
      save(); render(); toast('Đã bắt đầu đợt thi đua mới.');
    });
    $('tdDelClass').addEventListener('click', () => {
      const c = cls();
      if (!confirm(`Xoá hẳn bảng thi đua ${c.name} (${c.students.length} học sinh)? Không hoàn tác được.`)) return;
      delete S.classes[c.id];
      S.cur = Object.keys(S.classes)[0] || '';
      selected.clear(); save(); showMain();
    });
  }

  // ============================================================
  // CÔNG CỤ: ĐO TIẾNG ỒN
  // ============================================================
  const noise = { stream: null, ctx: null, raf: 0, level: 0, over: 0, lastOver: 0 };
  function noiseLimit() { return Number($('tdNoiseLimit').value); }
  async function toggleNoise() {
    if (noise.stream) { stopNoise(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Trình duyệt này không cho dùng micro.'); return; }
    try {
      noise.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      toast('Chưa được phép dùng micro — bấm biểu tượng ổ khoá trên thanh địa chỉ để cho phép.');
      return;
    }
    const Ctor = global.AudioContext || global.webkitAudioContext;
    noise.ctx = new Ctor();
    if (noise.ctx.state === 'suspended') noise.ctx.resume().catch(() => {}); // trình duyệt chặn tự phát âm → mở lại
    const src = noise.ctx.createMediaStreamSource(noise.stream);
    const an = noise.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    $('tdNoiseBtn').innerHTML = '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i> Tắt micro';
    noise.over = 0;
    let shown = '';
    (function tick() {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const db = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8); // −∞..0 dBFS
      const lvl = Math.max(0, Math.min(100, Math.round((db + 70) * (100 / 60)))); // −70 dB → 0, −10 dB → 100
      noise.level = noise.level * 0.85 + lvl * 0.15; // làm mượt để vạch không giật
      const v = Math.round(noise.level);
      const lim = noiseLimit();
      $('tdNoiseBar').style.width = v + '%';
      const st = v >= lim ? 'loud' : v >= lim * 0.75 ? 'warn' : 'ok';
      $('tdNoise').dataset.state = st;
      if (st !== shown) {
        shown = st;
        $('tdNoiseState').textContent = st === 'loud' ? 'Quá ồn! Cả lớp giữ trật tự nhé' : st === 'warn' ? 'Hơi ồn rồi' : 'Lớp đang yên lặng — tốt lắm!';
      }
      // Đếm số lần vượt ngưỡng (cách nhau ≥ 3 giây) + 1 tiếng nhắc
      if (st === 'loud' && Date.now() - noise.lastOver > 3000) {
        noise.lastOver = Date.now();
        noise.over++;
        $('tdNoiseCount').textContent = `Vượt ngưỡng ${noise.over} lần`;
        sfx('wrong');
      }
      noise.raf = requestAnimationFrame(tick);
    })();
  }
  function stopNoise() {
    cancelAnimationFrame(noise.raf);
    if (noise.stream) noise.stream.getTracks().forEach((t) => t.stop());
    if (noise.ctx) noise.ctx.close().catch(() => {});
    noise.stream = null; noise.ctx = null; noise.level = 0;
    $('tdNoiseBar').style.width = '0%';
    $('tdNoise').dataset.state = '';
    $('tdNoiseState').textContent = 'Đã tắt micro';
    $('tdNoiseBtn').innerHTML = '<i class="fa-solid fa-microphone-lines" aria-hidden="true"></i> Bật micro';
  }
  function paintNoiseLimit() {
    $('tdNoiseLimitV').textContent = noiseLimit();
    $('tdNoiseLine').style.left = noiseLimit() + '%';
  }

  // ============================================================
  // CÔNG CỤ: ĐỒNG HỒ ĐẾM NGƯỢC
  // ============================================================
  const timer = { total: 300, left: 300, endAt: 0, iv: 0 };
  const PRESETS = [[30, '30 giây'], [60, '1 phút'], [180, '3 phút'], [300, '5 phút'], [600, '10 phút'], [900, '15 phút']];
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  function paintClock() {
    $('tdClock').textContent = mmss(Math.max(0, Math.ceil(timer.left)));
    $('tdTimer').classList.toggle('is-low', timer.iv && timer.left <= 10);
    $('tdTimerGo').innerHTML = timer.iv ? '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Tạm dừng' : '<i class="fa-solid fa-play" aria-hidden="true"></i> ' + (timer.left < timer.total && timer.left > 0 ? 'Tiếp tục' : 'Bắt đầu');
  }
  function setTimer(sec) {
    stopTimer();
    timer.total = timer.left = Math.max(1, Math.min(5999, sec));
    $('tdMin').value = Math.floor(timer.total / 60);
    $('tdSec').value = timer.total % 60;
    $('tdTimer').classList.remove('is-done');
    paintClock();
  }
  function stopTimer() { clearInterval(timer.iv); timer.iv = 0; }
  function toggleTimer() {
    if (timer.iv) { timer.left = (timer.endAt - Date.now()) / 1000; stopTimer(); paintClock(); return; }
    if (timer.left <= 0) timer.left = timer.total;
    $('tdTimer').classList.remove('is-done');
    timer.endAt = Date.now() + timer.left * 1000; // theo đồng hồ hệ thống: tab ngủ / máy chậm vẫn đúng giờ
    timer.iv = setInterval(() => {
      const prev = Math.ceil(timer.left);
      timer.left = (timer.endAt - Date.now()) / 1000;
      const now = Math.ceil(timer.left);
      if (now !== prev && now > 0 && now <= 5) sfx('count');
      if (timer.left <= 0) {
        timer.left = 0; stopTimer();
        $('tdTimer').classList.add('is-done');
        sfx('boom');
        toast('Hết giờ!');
      }
      paintClock();
    }, 200);
    paintClock();
  }
  function readTimerInputs() {
    const m = Math.max(0, Math.min(99, Number($('tdMin').value) || 0));
    const s = Math.max(0, Math.min(59, Number($('tdSec').value) || 0));
    setTimer(m * 60 + s);
  }

  // ============================================================
  // TRÌNH CHIẾU + PHÍM TẮT
  // ============================================================
  function present() {
    const panel = document.querySelector(`.td-panel[data-panel="${tab}"]`);
    const target = tab === 'tools' ? document.querySelector('.td-toolgrid') : panel;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (target && target.requestFullscreen) target.requestFullscreen().catch(() => toast('Trình duyệt không cho toàn màn hình — bấm F11.'));
  }

  function wire() {
    $('tdNewNames').addEventListener('input', countNames);
    $('tdCreate').addEventListener('click', createClass);
    $('tdCancelNew').addEventListener('click', showMain);
    $('tdNewClass').addEventListener('click', () => showSetup(!!cls()));
    $('tdRosterUse').addEventListener('click', () => {
      const names = (roster[$('tdRosterSchool').value] || {})[$('tdRosterClass').value] || [];
      $('tdNewNames').value = names.join('\n');
      if (!$('tdNewName').value.trim()) $('tdNewName').value = `${$('tdRosterClass').value} – ${$('tdRosterSchool').value}`.slice(0, 40);
      countNames();
    });
    $('tdClass').addEventListener('change', (e) => { S.cur = e.target.value; selected.clear(); pending = null; previewImport(); save(); showMain(); });
    document.querySelector('.td-tabs').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });
    document.querySelector('.td-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = [...document.querySelectorAll('.td-tabs [role=tab]')];
      const i = tabs.findIndex((b) => b.dataset.tab === tab);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setTab(next.dataset.tab); next.focus();
    });

    $('tdGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.td-st');
      if (!b) return;
      if (selected.has(b.dataset.id)) selected.delete(b.dataset.id); else selected.add(b.dataset.id);
      sfx('click');
      paintSelection(cls());
    });
    $('tdSelAll').addEventListener('click', () => { cls().students.forEach((s) => selected.add(s.id)); paintSelection(cls()); });
    $('tdSelNone').addEventListener('click', () => { selected.clear(); paintSelection(cls()); });
    $('tdSelGroups').addEventListener('click', (e) => {
      const b = e.target.closest('[data-group]');
      if (!b) return;
      selected.clear();
      cls().students.filter((s) => s.group === b.dataset.group).forEach((s) => selected.add(s.id));
      paintSelection(cls());
    });
    ['tdCritPlus', 'tdCritMinus'].forEach((id) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.td-critbtn');
      if (b) applyPoints(Number(b.dataset.pts), b.dataset.label);
    }));
    $('tdUndo').addEventListener('click', undo);
    $('tdGroups').addEventListener('click', (e) => { const b = e.target.closest('[data-gpts]'); if (b) groupPoints(b.dataset.group, Number(b.dataset.gpts)); });
    $('tdShopStudent').addEventListener('change', (e) => { shopStudent = e.target.value; renderShop(cls()); });
    $('tdRewards').addEventListener('click', (e) => { const b = e.target.closest('.td-reward'); if (b) buy(b.dataset.rid); });

    // Sơ kết tuần
    document.querySelector('.td-seg').addEventListener('click', (e) => { const b = e.target.closest('[data-week]'); if (b) { weekOffset = Number(b.dataset.week); renderWeek(cls()); } });
    $('tdCopyClassMsg').addEventListener('click', () => copyText($('tdClassMsg').textContent, 'Đã chép tin nhắn sơ kết — dán vào nhóm lớp.'));
    $('tdSign').addEventListener('change', (e) => { S.sign = e.target.value.trim().slice(0, 60); save(); renderWeek(cls()); });
    $('tdOnlyNoted').addEventListener('change', () => renderWeek(cls()));
    $('tdParentList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pm]');
      if (!b || !weekCache) return;
      const st = weekCache.sum.students.find((x) => x.id === b.dataset.pm);
      if (st) copyText(parentText(cls(), st), `Đã chép tin nhắn cho phụ huynh em ${st.name}.`);
    });
    $('tdCopyAllParents').addEventListener('click', () => {
      if (!weekCache) return;
      const list = weekCache.sum.students.filter((s) => !$('tdOnlyNoted').checked || s.plus || s.minus).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      if (!list.length) return;
      copyText(list.map((s) => parentText(cls(), s)).join('\n\n────────\n\n'), `Đã chép ${list.length} tin nhắn phụ huynh.`);
    });
    // Tổ trực nhật (lớp chủ nhiệm): dời 1 lượt
    $('tdDuty').addEventListener('click', (e) => {
      if (!e.target.closest('#tdDutyNext')) return;
      const c = cls();
      c.dutyShift = ((c.dutyShift | 0) + 1) % 12;
      save(); renderBoard(c); toast(`Tổ trực nhật tuần này: ${T.dutyGroup(c)}`);
    });
    $('tdKind').addEventListener('change', (e) => {
      const c = cls();
      c.kind = e.target.value === 'gvcn' ? 'gvcn' : 'gvbm';
      save(); paintClassSelect(); renderSetup(c);
      toast(c.kind === 'gvcn' ? 'Đã chuyển thành lớp chủ nhiệm — dùng bộ tiêu chí nề nếp.' : 'Đã chuyển thành lớp bộ môn.');
    });
    $('tdImpGather').addEventListener('click', () => readRows(gatheredCodes().join('\n'), 'trang Gom kết quả'));
    $('tdImpPaste').addEventListener('click', () => readRows($('tdImpText').value, 'mã đã dán'));
    $('tdImpClass').addEventListener('change', previewImport);
    $('tdNoiseBtn').addEventListener('click', toggleNoise);
    $('tdNoiseLimit').addEventListener('input', paintNoiseLimit);
    $('tdPresets').innerHTML = PRESETS.map(([s, l]) => `<button type="button" class="td-btn" data-sec="${s}">${l}</button>`).join('');
    $('tdPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) setTimer(Number(b.dataset.sec)); });
    $('tdTimerGo').addEventListener('click', toggleTimer);
    $('tdTimerReset').addEventListener('click', readTimerInputs);
    ['tdMin', 'tdSec'].forEach((id) => $(id).addEventListener('change', readTimerInputs));

    $('tdPresent').addEventListener('click', present);
    $('tdTheme').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('ic3_theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    });
    const paintSound = () => { $('tdSound').innerHTML = `<i class="fa-solid ${global.EduSFX && global.EduSFX.isMuted() ? 'fa-volume-xmark' : 'fa-volume-high'}" aria-hidden="true"></i>`; };
    $('tdSound').addEventListener('click', () => { if (global.EduSFX) global.EduSFX.toggleMuted(); paintSound(); });
    paintSound();
    document.addEventListener('keydown', (e) => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !$('tdMain').hidden) { e.preventDefault(); undo(); }
      else if (e.key === 'f' || e.key === 'F') present();
    });
    // Rời trang / ẩn tab lâu: tắt micro (không để micro bật ngầm)
    document.addEventListener('visibilitychange', () => { if (document.hidden && noise.stream) stopNoise(); });
    wireSetup();
    paintNoiseLimit();
    setTimer(300);
  }

  wire();
  showMain();
  global.EduThiDuaPage = { _state: () => S };
})(window);
