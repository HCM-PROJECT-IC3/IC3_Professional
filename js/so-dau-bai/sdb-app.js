/* ============================================================
   js/so-dau-bai/sdb-app.js — Sổ đầu bài điện tử (so-dau-bai.html).
   Dữ liệu sổ lưu trong localStorage (sodaubai_v1) của trình duyệt — không lên Firebase, không gọi Apps Script.
   Lớp + học sinh lấy từ dữ liệu có sẵn của web (js/so-dau-bai/sdb-sources.js): sổ lớp Điều phối đã đọc ở
   trang Điểm danh, hoặc data/roster/students-active.json. Tiết đã ghi hôm nay gửi sang Gọi tên (vắng + bài).
   ============================================================ */
'use strict';

const KEY = 'sodaubai_v1';
const SOLOP_KEY = 'eduquiz_solop_v1';   // sổ lớp Điều phối đã đọc (js/so-lop/diem-danh.js)
const GOITEN_KEY = 'eduquiz_goiten_v1'; // trang Gọi tên (js/name-picker/name-picker.js)
const ROSTER_URL = 'data/roster/students-active.json';
const SRC = window.EduSdbSources;
const UI_KEY = 'sodaubai_ui';
const BUOI = ['Sáng', 'Chiều'];
const DOW = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const DOW_FULL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DEFAULT_UU = ['Hào hứng, tích cực phát biểu.', 'Nắm được nội dung chính của bài.', 'Thực hành nhanh, chính xác.', 'Làm việc nhóm hiệu quả.', 'Liên hệ thực tế tốt.'];
const DEFAULT_HC = ['Một số HS chưa tập trung.', 'Còn nói chuyện riêng.', 'Thao tác còn chậm.', 'Chưa quen nề nếp phòng máy.', 'Một số em ghi nhớ chưa chắc.'];
const OFF_REASONS = ['Nghỉ lễ', 'Trường tổ chức hoạt động chung', 'GV nghỉ phép (dạy bù sau)', 'HS kiểm tra / thi', 'Sự cố phòng máy'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const IC = {
  home: '<path d="M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6M9 11h4"/>',
  grid: '<rect x="3.5" y="4" width="17" height="16.5" rx="2"/><path d="M3.5 9h17M9.5 9v11.5M15 9v11.5M8 2.5v3M16 2.5v3"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 4.8a3.2 3.2 0 0 1 0 6.4M17.5 13.6a6 6 0 0 1 3.5 5.9"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4 6.5h1M4 12h1M4 17.5h1"/>',
  printer: '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 13.5h10v7H7z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  left: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  right: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  upload: '<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11.5M7.5 11 12 15.5l4.5-4.5M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  trash: '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="m13 7 4 4"/>',
  save: '<path d="M5 3.5h11l3.5 3.5v13.5H5z"/><path d="M8.5 3.5v5h6v-5M8.5 20.5v-6h7v6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  chev: '<path d="m9.5 6 6 6-6 6"/>',
  clip: '<path d="M9 3.5h6v3H9z"/><path d="M15 5h3.5v15.5h-13V5H9"/><path d="m9 13 2 2 4-4"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  mega: '<path d="M4 10v4h3l7 4.5v-13L7 10z"/><path d="M17.5 9a4.2 4.2 0 0 1 0 6"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

/* ---------- ngày tháng ---------- */
const pad = n => String(n).padStart(2, '0');
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return iso(d); };
const vnDate = s => { const d = parseD(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const shortDate = s => vnDate(s).slice(0, 5);
const longDate = s => { const d = parseD(s); return `${DOW_FULL[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}`; };
const thu = s => DOW[parseD(s).getDay()];
const today = () => iso(new Date());
const weekOf = s => Math.floor(Math.round((parseD(s) - parseD(S.settings.week1)) / 864e5) / 7) + 1;
const weekMonday = n => addDays(S.settings.week1, (n - 1) * 7);
const weekDates = n => { const m = weekMonday(n); return [0, 1, 2, 3, 4, 5].map(i => addDays(m, i)); };
const curWeek = () => Math.max(1, weekOf(today()));

/* ---------- lớp ---------- */
const normClass = s => String(s ?? '').trim().replace(/^(\d+)\s*[Aa.\/_-]\s*(\d+)$/, '$1.$2');
const isClass = s => /^\d+\.\d+$/.test(normClass(s));
const gradeOf = c => parseInt(c, 10);
const gcls = c => [3, 4, 5].includes(gradeOf(c)) ? 'g' + gradeOf(c) : 'g0';
const clsBadge = (c, sm) => `<span class="cls ${gcls(c)} ${sm ? 'sm' : ''}">${esc(c)}</span>`;
const cmpClass = (a, b) => { const [a1, a2] = a.split('.').map(Number), [b1, b2] = b.split('.').map(Number); return a1 - b1 || a2 - b2 || a.localeCompare(b); };
const slotOrder = e => `${e.date}|${BUOI.indexOf(e.buoi)}|${pad(e.tiet || 0)}`;
const bySlot = (a, b) => slotOrder(a).localeCompare(slotOrder(b));

/* ---------- trạng thái ---------- */
let S = load() || seed();
if (!S.srcSchool) S.srcSchool = {}; // lớp → trường trong dữ liệu nguồn (để khớp danh sách Gọi tên)
let UI = Object.assign({ view: 'home', week: null, day: null, cls: null, weekCls: '', ppctProg: null, ppctGrade: null }, loadUI());
if (UI.view === 'dash') UI.view = 'home';
if (!UI.week) UI.week = curWeek();

function seed() {
  const ppct = {};
  for (const g of [3, 4, 5]) ppct['QT|' + g] = ((window.PPCT_SEED || {})['IC3_K' + g] || []).map(([t, topic, name]) => ({ t, topic, name }));
  // Web dùng chung nhiều giáo viên: sổ mới để trống lớp/TKB/tên — lớp + học sinh lấy ở mục Học sinh,
  // tên giáo viên lấy từ tài khoản đăng nhập (fillFromProfile)
  return {
    v: 1,
    settings: {
      ubnd: '', school: '', year: '2026-2027',
      reportTitle: 'BẢNG THEO DÕI, NHẬN XÉT TÌNH HÌNH GIẢNG DẠY, HỌC TẬP MÔN TIN HỌC QUỐC TẾ IC3',
      teacher: '', toTruong: '', pht: '',
      week1: '2026-09-07', periods: { 'Sáng': 5, 'Chiều': 4 }, days: [2, 3, 4, 5, 6], absentAlert: 3,
    },
    programs: [{ id: 'QT', name: 'Tin học quốc tế' }, { id: '2018', name: 'Tin học CTGDPT 2018' }],
    classes: [], students: {}, srcSchool: {}, ppct, tkb: [{ dow: 2, buoi: 'Sáng', tiet: 1, label: 'Chào cờ' }], entries: [],
  };
}
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v ? s : null; } catch { return null; } }
function loadUI() { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Trình duyệt không cho lưu – hãy tải bản sao lưu.'); } }
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch { } }

const progName = id => (S.programs.find(p => p.id === id) || { name: id }).name;
const ppctOf = (prog, cls) => S.ppct[`${prog}|${gradeOf(cls)}`] || [];
const lessonAt = (prog, cls, t) => (ppctOf(prog, cls).find(r => +r.t === +t) || {}).name || '';
const multiProg = () => new Set(S.entries.map(e => e.prog).concat(S.tkb.filter(t => t.cls).map(t => t.prog))).size > 1;

/* ---------- tính toán ---------- */
function lastPPCT(prog, cls, before) {
  let best = 0;
  for (const e of S.entries) if (!e.off && e.prog === prog && e.cls === cls && (!before || slotOrder(e) < before) && +e.ppct > best) best = +e.ppct;
  return best;
}
// Tất cả tiết của tuần n: tiết theo TKB (kèm entry nếu đã ghi) + tiết ghi ngoài TKB
function weekItems(n) {
  const dates = weekDates(n), out = [], used = new Set();
  for (const s of S.tkb) {
    const date = dates[s.dow - 2]; if (!date) continue;
    if (!s.cls) { out.push({ ...s, date }); continue; }
    const e = S.entries.find(x => x.date === date && x.cls === s.cls && x.buoi === s.buoi && +x.tiet === +s.tiet);
    if (e) used.add(e.id);
    out.push({ date, cls: s.cls, prog: s.prog, buoi: s.buoi, tiet: s.tiet, entry: e });
  }
  for (const e of S.entries) if (e.date >= dates[0] && e.date <= dates[5] && !used.has(e.id)) out.push({ date: e.date, cls: e.cls, prog: e.prog, buoi: e.buoi, tiet: e.tiet, entry: e, extra: true });
  return out.sort(bySlot);
}
const isMissing = it => it.cls && !it.entry && it.date <= today();
function absentCount(cls, name) {
  let P = 0, K = 0;
  for (const e of S.entries) if (e.cls === cls) for (const a of e.absent || []) if (a.name === name) a.type === 'K' ? K++ : P++;
  return { P, K, n: P + K };
}
function hotStudents() {
  const m = new Map();
  for (const e of S.entries) for (const a of e.absent || []) {
    const k = e.cls + '|' + a.name, o = m.get(k) || { cls: e.cls, name: a.name, P: 0, K: 0 };
    a.type === 'K' ? o.K++ : o.P++; m.set(k, o);
  }
  return [...m.values()].filter(o => o.P + o.K >= S.settings.absentAlert).sort((a, b) => (b.P + b.K) - (a.P + a.K));
}
function phraseFreq(field, defaults) {
  const m = new Map();
  for (const e of S.entries) { const v = (e[field] || '').trim(); if (v && v.length < 70) m.set(v, (m.get(v) || 0) + 1); }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
  return [...new Set([...top, ...defaults])].slice(0, 14);
}
const commentText = e => [e.uu && `Ưu: ${e.uu}`, e.hc && `Hạn chế: ${e.hc}`].filter(Boolean).join('\n');
const absentText = e => (e.absent || []).map(a => a.name + (a.type === 'K' ? ' (K)' : '')).join(', ');
function progressRows() {
  const rows = [];
  for (const prog of S.programs) {
    const list = [...new Set(S.entries.filter(e => e.prog === prog.id).map(e => e.cls).concat(S.tkb.filter(t => t.prog === prog.id && t.cls).map(t => t.cls)))].sort(cmpClass);
    const maxG = {};
    for (const c of list) maxG[gradeOf(c)] = Math.max(maxG[gradeOf(c)] || 0, lastPPCT(prog.id, c));
    for (const c of list) {
      const last = lastPPCT(prog.id, c), total = ppctOf(prog.id, c).reduce((m, r) => Math.max(m, +r.t), 0);
      rows.push({ prog: prog.id, cls: c, last, total, lag: maxG[gradeOf(c)] - last });
    }
  }
  return rows;
}

/* =========================================================
   KHUNG GIAO DIỆN
   ========================================================= */
const NAV = [
  { v: 'home', label: 'Hôm nay', short: 'Hôm nay', icon: 'home' },
  { v: 'week', label: 'Sổ đầu bài', short: 'Sổ tuần', icon: 'book' },
  { v: 'tkb', label: 'Thời khóa biểu', short: 'TKB', icon: 'grid' },
  { v: 'classes', label: 'Học sinh', short: 'Học sinh', icon: 'users' },
  { v: 'ppct', label: 'Chương trình', short: 'PPCT', icon: 'list' },
  { sep: true },
  { v: 'report', label: 'In & xuất file', short: 'In', icon: 'printer' },
  { v: 'settings', label: 'Cài đặt', short: 'Cài đặt', icon: 'sliders' },
];
const VIEWS = { home: viewHome, week: viewWeek, tkb: viewTKB, classes: viewClasses, ppct: viewPPCT, report: viewReport, settings: viewSettings };
let CARDS = [];

function go(v) { UI.view = v; saveUI(); render(); window.scrollTo(0, 0); }
function render() {
  const due = weekItems(curWeek()).filter(isMissing).length;
  $('#nav').innerHTML = NAV.map(n => n.sep ? '<div class="sep"></div>' :
    `<button type="button" data-v="${n.v}" class="${UI.view === n.v ? 'on' : ''}">${ic(n.icon)}${n.label}${n.v === 'week' && due ? `<span class="badge" title="Tiết chưa ghi">${due}</span>` : ''}</button>`).join('');
  $('#bottomnav').innerHTML = NAV.filter(n => !n.sep).map(n => `<button type="button" data-v="${n.v}" class="${UI.view === n.v ? 'on' : ''}">${ic(n.icon)}${n.short}</button>`).join('');
  $('#brandSub').textContent = `Năm học ${S.settings.year}`;
  $('#me').innerHTML = `<b>${esc(S.settings.teacher)}</b><span class="faint">${esc(S.settings.school)}</span>`;
  $('#crumb').innerHTML = `<b>Tuần ${pad(curWeek())}</b><span class="crumb-date"> · ${longDate(today())}</span>`;
  $('#newEntry').innerHTML = `${ic('plus')}<span>Ghi tiết dạy</span>`;
  $('#themeBtn').innerHTML = document.documentElement.dataset.theme === 'dark' ? `${ic('sun')}Sáng` : `${ic('moon')}Tối`;
  $('#quickBackup').innerHTML = `${ic('save')}Sao lưu`;
  CARDS = [];
  const root = $('#view'); root.innerHTML = '';
  VIEWS[UI.view](root);
}

$('#nav').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) go(b.dataset.v); });
$('#bottomnav').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) go(b.dataset.v); });
// Sáng/tối dùng chung công tắc của web (ic3_theme) — đổi ở đây thì các trang khác cũng đổi theo
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('ic3_theme', dark ? 'dark' : 'light'); } catch { }
  render();
};
$('#logoutBtn').onclick = async () => {
  try { if (window.EduAuth) await window.EduAuth.logoutUser(); } catch { /* vẫn chuyển trang */ }
  location.href = 'login.html';
};
$('#quickBackup').onclick = () => downloadBackup();
$('#newEntry').onclick = () => {
  const d = weekDates(UI.view === 'week' ? UI.week : curWeek());
  openEntry({ date: d.includes(today()) ? today() : (UI.view === 'home' && UI.day) || d[0] });
};
$('#drawerForm').addEventListener('submit', e => e.preventDefault());
$('#modalForm').addEventListener('submit', e => e.preventDefault());
document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close(); });
// thẻ tiết dạy (dùng chung cho mọi trang)
$('#view').addEventListener('click', ev => {
  const c = ev.target.closest('[data-ci]'); if (!c) return;
  const it = CARDS[+c.dataset.ci], b = ev.target.closest('[data-act]');
  const act = b ? b.dataset.act : it.entry ? 'edit' : null;
  if (!act) return;
  if (act === 'pick') sendToPicker(it.entry);
  else if (act === 'edit') openEntry(it.entry);
  else openEntry({ date: it.date, cls: it.cls, buoi: it.buoi, tiet: it.tiet, prog: it.prog, off: act === 'off' });
});

function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) $('button', t).onclick = () => { t.classList.remove('show'); action.fn(); };
  t.classList.add('show'); clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2800);
}
function ask({ title, body = '', ok = 'Đồng ý', cancel = 'Hủy', danger = false }) {
  return new Promise(res => {
    const m = $('#modal'); m.className = 'modal';
    $('#modalForm').innerHTML = `<div class="mh"><h2>${esc(title)}</h2></div><div class="mb">${body}</div>
      <div class="mf"><button type="button" class="btn" data-a="0">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-a="1">${esc(ok)}</button></div>`;
    $('#modalForm').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { m.close(); res(b.dataset.a === '1'); } };
    m.addEventListener('cancel', () => res(false), { once: true });
    m.showModal();
    $('[data-a="1"]', m).focus();
  });
}
function modal(title, body, foot, wide) {
  const m = $('#modal'); m.className = 'modal' + (wide ? ' wide' : '');
  $('#modalForm').onclick = null;
  $('#modalForm').innerHTML = `<div class="mh"><h2>${esc(title)}</h2></div><div class="mb">${body}</div><div class="mf">${foot}</div>`;
  m.showModal();
  return m;
}
const phead = (title, sub, actions = '') => `<div class="phead"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="grow"></span><div class="row gap-s">${actions}</div></div>`;
const emptyBox = (icon, title, text = '') => `<div class="empty">${ic(icon)}<b>${title}</b>${text}</div>`;
function weekNav(n) {
  return `<div class="row gap-s noprint"><button type="button" class="btn icon" data-wk="-1" aria-label="Tuần trước">${ic('left')}</button>
    <div style="min-width:96px;text-align:center"><b>Tuần ${pad(n)}</b></div>
    <button type="button" class="btn icon" data-wk="1" aria-label="Tuần sau">${ic('right')}</button>
    ${n !== curWeek() ? '<button type="button" class="btn sm" data-wk="0">Về tuần này</button>' : ''}</div>`;
}
function bindWeekNav(root) {
  $$('[data-wk]', root).forEach(b => b.onclick = () => {
    const d = +b.dataset.wk; UI.week = d === 0 ? curWeek() : Math.max(1, UI.week + d); saveUI(); render();
  });
}

/* ---------- thẻ tiết dạy ---------- */
function lessonCard(it, { comment = false } = {}) {
  if (it.label) return `<div class="lesson label"><div class="when"><b>Tiết ${it.tiet}</b><span>${it.buoi}</span></div><div>${esc(it.label)}</div></div>`;
  const i = CARDS.push(it) - 1, e = it.entry;
  const when = `<div class="when"><b>Tiết ${it.tiet}</b><span>${it.buoi}</span></div>`;
  const prog = multiProg() ? `<span>${esc(progName(it.prog))}</span>` : '';
  if (!e) {
    const next = lastPPCT(it.prog, it.cls, slotOrder(it)) + 1, name = lessonAt(it.prog, it.cls, next);
    const late = it.date < today();
    return `<article class="lesson todo" data-ci="${i}">${when}${clsBadge(it.cls)}
      <div class="what"><div class="ttl">${name ? esc(name) : 'Chưa ghi sổ'}</div>
        <div class="sub"><span>Gợi ý tiết PPCT ${next}</span>${prog}${late ? '<span class="tag warn">Chưa ghi</span>' : ''}</div></div>
      <div class="act"><button type="button" class="btn ghost" data-act="off">${ic('pause')}Nghỉ</button><button type="button" class="btn primary lg" data-act="write">${ic('edit')}Ghi sổ</button></div></article>`;
  }
  const abs = (e.absent || []);
  return `<article class="lesson click ${e.off ? 'off' : ''}" data-ci="${i}">${when}${clsBadge(it.cls)}
    <div class="what"><div class="ttl">${e.off ? '<span class="tag warn">Nghỉ</span> ' : ''}${esc(e.lesson)}</div>
      <div class="sub">${e.off ? '' : `<span>Tiết PPCT ${esc(e.ppct)}</span>`}${prog}${it.extra ? '<span>Ngoài TKB</span>' : ''}
        ${e.off ? '' : abs.length ? `<span style="color:var(--amber)">Vắng ${abs.length}: ${esc(absentText(e))}</span>` : '<span>Đủ sĩ số</span>'}</div>
      ${comment && commentText(e) ? `<div class="cmt">${esc(commentText(e))}</div>` : ''}</div>
    <div class="act">${!e.off && it.date === today() ? `<button type="button" class="btn" data-act="pick" title="Mở Gọi tên: bỏ qua bạn vắng, câu hỏi theo bài này">${ic('mega')}Gọi tên</button>` : ''}<span class="done-mark">${ic('check')}Đã ghi</span></div></article>`;
}

/* =========================================================
   HÔM NAY
   ========================================================= */
function viewHome(root) {
  const wk = curWeek(), dates = weekDates(wk), items = weekItems(wk);
  const teachDays = S.settings.days.map(d => dates[d - 2]).filter(Boolean);
  if (!UI.day || !dates.includes(UI.day)) {
    const has = d => items.some(it => it.date === d && it.cls);
    UI.day = (teachDays.includes(today()) && has(today())) ? today()
      : (items.find(isMissing) || {}).date || (teachDays.includes(today()) ? today() : teachDays.filter(d => d <= today()).pop() || teachDays[0]);
  }
  const dayItems = items.filter(it => it.date === UI.day);
  const real = items.filter(it => it.cls);
  const missing = real.filter(isMissing);
  const absences = real.reduce((a, it) => a + ((it.entry && it.entry.absent) || []).length, 0);
  const hot = hotStudents();
  const prog = progressRows();

  root.innerHTML = `${phead(longDate(UI.day), `Tuần ${pad(wk)} · ${vnDate(dates[0])} – ${vnDate(dates[5])}`)}
  <div class="layout-home">
    <div>
      <div class="days" style="grid-template-columns:repeat(${teachDays.length},minmax(0,1fr))">${teachDays.map(d => {
        const its = items.filter(it => it.date === d && it.cls), done = its.every(it => it.entry);
        const st = !its.length ? '' : done ? 'done' : d <= today() ? 'miss' : 'future';
        return `<button type="button" class="day ${st} ${d === UI.day ? 'on' : ''} ${d === today() ? 'today' : ''}" data-day="${d}" title="${its.length} tiết">
          <div class="dw">${thu(d).replace('Thứ ', 'T')}</div><div class="dn">${parseD(d).getDate()}</div><span class="dot"></span></button>`;
      }).join('')}</div>
      <div class="lessons">${dayItems.length ? dayItems.map(it => lessonCard(it)).join('')
        : `<div class="panel">${emptyBox('book', 'Không có tiết nào theo thời khóa biểu', '<div>Bấm “Ghi tiết dạy” để ghi tiết dạy bù hoặc ngoài lịch.</div>')}</div>`}</div>
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-h"><h2>Tuần này</h2></div><div class="panel-b">
        <div class="summary"><div><b>${real.filter(it => it.entry).length}<span class="faint" style="font-size:16px">/${real.length}</span></b><span>tiết đã ghi</span></div>
        <div><b style="color:${missing.length ? 'var(--amber)' : 'var(--green)'}">${missing.length}</b><span>chưa ghi</span></div>
        <div><b>${absences}</b><span>lượt vắng</span></div></div></div></section>
      ${missing.length ? `<section class="panel"><div class="panel-h"><h2>Cần ghi bổ sung</h2><span class="grow"></span><span class="badge">${missing.length}</span></div><div class="panel-b mini">
        ${missing.slice(0, 8).map(it => `<div data-ci="${CARDS.push(it) - 1}">${clsBadge(it.cls, true)}<div class="grow"><div class="t">${thu(it.date)}, ${shortDate(it.date)}</div><div class="s">Tiết ${it.tiet} buổi ${it.buoi.toLowerCase()}</div></div><button type="button" class="btn sm" data-act="write">Ghi</button></div>`).join('')}
      </div></section>` : ''}
      <section class="panel"><div class="panel-h"><h2>Học sinh cần chú ý</h2></div><div class="panel-b mini">
        ${hot.length ? hot.slice(0, 6).map(o => `<div>${clsBadge(o.cls, true)}<div class="grow"><div class="t">${esc(o.name)}</div><div class="s">Vắng ${o.P + o.K} buổi (${o.P} P, ${o.K} K)</div></div><span class="tag bad">Báo GVCN</span></div>`).join('')
          : '<div><span class="faint sm-t">Chưa có học sinh vắng nhiều.</span></div>'}
      </div></section>
      <section class="panel"><div class="panel-h"><h2>Tiến độ chương trình</h2></div><div class="panel-b mini">
        ${prog.length ? prog.map(r => `<div>${clsBadge(r.cls, true)}<div class="grow"><div class="row gap-s" style="flex-wrap:nowrap"><div class="bar ${r.lag >= 2 ? 'lag' : ''}"><i style="width:${r.total ? Math.min(100, r.last / r.total * 100) : 0}%"></i></div><span class="s" style="min-width:48px;text-align:right">${r.last}${r.total ? '/' + r.total : ''}</span></div>
          ${r.lag >= 2 ? `<div class="s" style="color:var(--amber)">Chậm ${r.lag} tiết so với lớp cùng khối</div>` : ''}</div></div>`).join('')
          : '<div><span class="faint sm-t">Chưa có dữ liệu.</span></div>'}
      </div></section>
    </div>
  </div>`;
  $$('[data-day]', root).forEach(b => b.onclick = () => { UI.day = b.dataset.day; saveUI(); render(); });
}

/* =========================================================
   SỔ ĐẦU BÀI THEO TUẦN
   ========================================================= */
function viewWeek(root) {
  const n = UI.week, dates = weekDates(n);
  const real = weekItems(n).filter(it => it.cls);
  const classes = [...new Set(real.map(it => it.cls))].sort(cmpClass);
  if (UI.weekCls && !classes.includes(UI.weekCls)) UI.weekCls = '';
  const shown = real.filter(it => !UI.weekCls || it.cls === UI.weekCls);
  const missing = real.filter(isMissing).length, offs = real.filter(it => it.entry && it.entry.off).length;
  const absences = real.reduce((a, it) => a + ((it.entry && it.entry.absent) || []).length, 0);

  root.innerHTML = `${phead('Sổ đầu bài', `${vnDate(dates[0])} – ${vnDate(dates[5])}`, weekNav(n))}
  <div class="panel" style="margin-bottom:22px"><div class="panel-b row">
    <div class="summary"><div><b>${real.filter(it => it.entry && !it.entry.off).length}</b><span>tiết đã dạy</span></div>
      <div><b style="color:${missing ? 'var(--amber)' : 'inherit'}">${missing}</b><span>chưa ghi</span></div>
      <div><b>${offs}</b><span>tiết nghỉ</span></div><div><b>${absences}</b><span>lượt vắng</span></div></div>
    <span class="grow"></span>
    <button type="button" class="btn" id="wPrint">${ic('printer')}Xem bản in</button>
  </div></div>
  ${classes.length > 1 ? `<div class="chips" style="margin-bottom:22px"><button type="button" class="chip ${UI.weekCls ? '' : 'on'}" data-wc="">Tất cả lớp</button>${classes.map(c => `<button type="button" class="chip ${UI.weekCls === c ? 'on' : ''}" data-wc="${esc(c)}">Lớp ${esc(c)}</button>`).join('')}</div>` : ''}
  <div id="wDays"></div>`;
  const days = [...new Set(shown.map(it => it.date))];
  $('#wDays', root).innerHTML = days.length ? days.map(d => `<section class="day-group"><h3><b>${thu(d)}</b>${vnDate(d)}</h3><div class="lessons">${shown.filter(it => it.date === d).map(it => lessonCard(it, { comment: true })).join('')}</div></section>`).join('')
    : `<div class="panel">${emptyBox('book', 'Tuần này chưa có tiết nào', '<div>Hãy nhập thời khóa biểu, hoặc bấm “Ghi tiết dạy”.</div>')}</div>`;
  bindWeekNav(root);
  $('#wPrint').onclick = () => go('report');
  $$('[data-wc]', root).forEach(b => b.onclick = () => { UI.weekCls = b.dataset.wc; saveUI(); render(); });
}

/* =========================================================
   KHUNG GHI TIẾT DẠY
   ========================================================= */
function openEntry(src) {
  const isNew = !src.id;
  const e = Object.assign({ id: uid(), date: today(), cls: '', prog: S.programs[0]?.id, buoi: 'Sáng', tiet: 1, ppct: '', lesson: '', absent: [], uu: '', hc: '', teacher: S.settings.teacher, note: '', off: false }, structuredClone(src));
  if (isNew && e.cls && !e.off && !e.ppct) { e.ppct = lastPPCT(e.prog, e.cls, slotOrder(e)) + 1; e.lesson = e.lesson || lessonAt(e.prog, e.cls, e.ppct); }
  const prefilled = !!src.cls;
  const form = $('#drawerForm');
  form.innerHTML = `
  <div class="dh"><span id="dBadge"></span><div class="grow"><h2>${isNew ? 'Ghi tiết dạy' : 'Sửa tiết dạy'}</h2><p id="dSub"></p></div>
    <button type="button" class="btn icon ghost" data-close aria-label="Đóng">${ic('x')}</button></div>
  <div class="db">
    <details class="sec more" id="slotBox" ${prefilled ? '' : 'open'}><summary>${ic('chev')}${prefilled ? 'Đổi ngày, lớp hoặc tiết' : 'Thông tin tiết dạy'}</summary>
      <div class="grid c2" style="margin-top:14px">
        <label class="field"><span>Ngày dạy</span><input class="inp" type="date" name="date" value="${e.date}"></label>
        <label class="field"><span>Lớp</span><input class="inp" type="text" name="cls" list="clsList" value="${esc(e.cls)}" placeholder="vd 3.3"></label>
        <label class="field"><span>Buổi</span><select class="inp" name="buoi">${BUOI.map(b => `<option ${b === e.buoi ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="field"><span>Tiết theo TKB</span><input class="inp" type="number" name="tiet" min="1" max="10" value="${e.tiet}"></label>
        ${S.programs.length > 1 ? `<label class="field" style="grid-column:1/-1"><span>Chương trình</span><select class="inp" name="prog">${S.programs.map(p => `<option value="${esc(p.id)}" ${p.id === e.prog ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : `<input type="hidden" name="prog" value="${esc(e.prog)}">`}
      </div>
      <datalist id="clsList">${S.classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    </details>
    <div class="sec"><label class="switch"><input type="checkbox" name="off" ${e.off ? 'checked' : ''}><span><b style="font-weight:500">Tiết này không dạy</b><br><span class="faint sm-t">Nghỉ lễ, hoạt động chung… không tính vào tiến độ chương trình.</span></span></label>
      <div id="offBox" style="margin-top:14px">
        <div class="chips" id="offChips">${OFF_REASONS.map(r => `<button type="button" class="chip ${e.off && e.lesson === r ? 'on' : ''}">${esc(r)}</button>`).join('')}</div>
        <label class="field" style="margin-top:12px"><span>Lý do</span><input class="inp" type="text" name="offReason" value="${e.off ? esc(e.lesson) : ''}" placeholder="Chọn ở trên hoặc tự gõ"></label>
      </div>
    </div>
    <div id="teachBox">
      <div class="sec"><div class="sec-h"><h3>Bài dạy</h3></div>
        <div class="row lesson-row" style="align-items:flex-end;flex-wrap:nowrap">
          <div class="field"><span>Tiết PPCT</span><div class="step"><button type="button" data-st="-1" aria-label="Giảm">−</button><input type="number" name="ppct" min="0" value="${esc(e.ppct)}" aria-label="Tiết PPCT"><button type="button" data-st="1" aria-label="Tăng">+</button></div></div>
          <label class="field grow"><span>Tên bài dạy, nội dung công việc</span><input class="inp" type="text" name="lesson" list="lessonList" value="${e.off ? '' : esc(e.lesson)}"></label>
        </div>
        <datalist id="lessonList"></datalist>
        <div class="hintline" id="ppctHint"></div>
      </div>
      <div class="sec"><div class="sec-h"><h3>Học sinh vắng</h3><span class="grow"></span><span class="muted sm-t" id="absSum"></span></div>
        <div class="hintline" id="absSrc" style="margin:0 0 8px"></div>
        <div id="rosterBox"></div>
        <div class="row gap-s" style="margin-top:10px;flex-wrap:nowrap"><input class="inp" type="text" id="absIn" list="stuList" placeholder="Thêm tên học sinh vắng…"><button type="button" class="btn" id="absAdd">Thêm</button></div>
        <datalist id="stuList"></datalist>
        <div class="absent-sum" id="absExtra"></div>
      </div>
      <div class="sec"><div class="sec-h"><h3>Nhận xét</h3></div>
        <label class="field"><span>Ưu điểm</span><textarea class="inp" name="uu" rows="2">${esc(e.uu)}</textarea></label>
        <div class="chips" id="uuChips" style="margin-top:8px"></div>
        <label class="field" style="margin-top:16px"><span>Hạn chế</span><textarea class="inp" name="hc" rows="2">${esc(e.hc)}</textarea></label>
        <div class="chips" id="hcChips" style="margin-top:8px"></div>
      </div>
    </div>
    <details class="sec more"><summary>${ic('chev')}Giáo viên dạy &amp; ghi chú</summary>
      <div class="grid c2" style="margin-top:14px">
        <label class="field"><span>Giáo viên dạy</span><input class="inp" type="text" name="teacher" value="${esc(e.teacher)}"></label>
        <label class="field"><span>Ghi chú</span><input class="inp" type="text" name="note" value="${esc(e.note)}"></label>
      </div></details>
  </div>
  <div class="df">${isNew ? '' : `<button type="button" class="btn danger" id="dDel">${ic('trash')}Xóa</button>`}
    <span class="grow faint sm-t"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> để lưu</span>
    <button type="button" class="btn" data-close>Hủy</button>
    <button type="button" class="btn primary lg" id="dSave">${ic('check')}Lưu tiết dạy</button></div>`;

  const F = n => form.querySelector(`[name=${n}]`);
  const cur = () => ({ cls: normClass(F('cls').value), prog: F('prog').value, date: F('date').value, buoi: F('buoi').value, tiet: +F('tiet').value || 1 });

  const header = () => {
    const c = cur();
    $('#dBadge').innerHTML = isClass(c.cls) ? clsBadge(c.cls) : '';
    $('#dSub').textContent = c.date ? `${thu(c.date)}, ${vnDate(c.date)} · Tiết ${c.tiet} buổi ${c.buoi.toLowerCase()}${S.programs.length > 1 ? ' · ' + progName(c.prog) : ''}` : '';
  };
  const drawAbsent = () => {
    const roster = S.students[cur().cls] || [];
    const st = n => (e.absent.find(a => a.name === n) || {}).type;
    $('#rosterBox').innerHTML = roster.length
      ? `<div class="roster">${roster.map((s, i) => { const t = st(s.name); return `<button type="button" class="stu ${t || ''}" data-n="${esc(s.name)}"><span class="no">${i + 1}</span><span>${esc(s.name)}</span>${t ? `<span class="st">${t}</span>` : ''}</button>`; }).join('')}</div>
         <div class="hintline">Bấm vào tên: 1 lần = vắng có phép (P) · 2 lần = không phép (K) · 3 lần = bỏ chọn.</div>`
      : '<div class="hintline" style="margin-top:0">Lớp này chưa có danh sách học sinh – nhập ở mục <b>Học sinh</b> để chọn nhanh, hoặc gõ tên bên dưới.</div>';
    $('#stuList').innerHTML = roster.map(s => `<option value="${esc(s.name)}">`).join('');
    const extra = e.absent.filter(a => !roster.some(s => s.name === a.name));
    $('#absExtra').innerHTML = extra.map(a => `<button type="button" class="stu ${a.type === 'K' ? 'K' : 'P'}" data-n="${esc(a.name)}"><span>${esc(a.name)}</span><span class="st">${a.type === 'K' ? 'K' : 'P'}</span></button>`).join('');
    const P = e.absent.filter(a => a.type !== 'K').length, K = e.absent.length - P;
    $('#absSum').innerHTML = e.absent.length ? `<span class="tag warn">Vắng ${e.absent.length} · ${P} P, ${K} K</span>` : (roster.length ? `Đủ sĩ số ${roster.length}/${roster.length}` : '');
  };
  const refresh = () => {
    const c = cur(), list = ppctOf(c.prog, c.cls);
    $('#lessonList').innerHTML = list.map(r => `<option value="${esc(r.name)}">Tiết ${r.t}${r.topic ? ' · ' + esc(r.topic) : ''}</option>`).join('');
    const last = c.cls ? lastPPCT(c.prog, c.cls, isNew ? slotOrder(c) : slotOrder(e)) : 0;
    $('#ppctHint').textContent = !isClass(c.cls) ? '' : (last ? `Tiết trước của lớp ${c.cls}: tiết ${last} – ${lessonAt(c.prog, c.cls, last) || '…'}` : `Đây là tiết đầu tiên của lớp ${c.cls}.`) + (list.length ? '' : ' · Chưa có PPCT cho khối này.');
    header(); drawAbsent();
  };
  // Điểm danh 1 lần: lớp đã điểm danh ở trang Điểm danh (sổ lớp của Điều phối) → điền sẵn học sinh vắng.
  // Chỉ cho tiết mới, tới khi giáo viên tự bấm tên (touched) thì thôi không ghi đè.
  let touched = !isNew || e.absent.length > 0, fromSheet = false;
  const prefillAbsent = () => {
    const c = cur(), box = $('#absSrc');
    if (touched || !window.EduSoLop || !isClass(c.cls) || !c.date) return;
    let a = null;
    try { a = SRC.attendanceOn(JSON.parse(localStorage.getItem(SOLOP_KEY)) || {}, window.EduSoLop, { school: (S.srcSchool || {})[c.cls] || S.settings.school, cls: c.cls, date: parseD(c.date) }); } catch { a = null; }
    if (fromSheet && !a) { e.absent = []; fromSheet = false; box.textContent = ''; drawAbsent(); }
    if (!a) return;
    const byLow = new Map((S.students[c.cls] || []).map(s => [s.name.toLocaleLowerCase('vi'), s.name]));
    e.absent = a.absent.map(n => ({ name: byLow.get(n.toLocaleLowerCase('vi')) || n, type: 'P' }));
    fromSheet = true;
    const at = new Date(a.at);
    box.textContent = `Lấy từ Điểm danh (sổ lớp đọc lúc ${pad(at.getHours())}:${pad(at.getMinutes())} ${pad(at.getDate())}/${pad(at.getMonth() + 1)}): `
      + (a.absent.length ? `${a.absent.length} bạn vắng` : 'đủ sĩ số') + (a.bai.length ? ` · Sheet ghi “${a.bai.join(', ')}”` : '') + '. Bấm tên để sửa.';
    drawAbsent();
  };
  const cycle = name => {
    touched = true;
    const i = e.absent.findIndex(a => a.name === name);
    if (i < 0) e.absent.push({ name, type: 'P' });
    else if (e.absent[i].type !== 'K') e.absent[i].type = 'K';
    else e.absent.splice(i, 1);
    drawAbsent();
  };
  const addAbs = name => { name = name.trim(); if (name && !e.absent.some(a => a.name === name)) touched = true, e.absent.push({ name, type: 'P' }); drawAbsent(); };
  $('#rosterBox').onclick = ev => { const b = ev.target.closest('[data-n]'); if (b) cycle(b.dataset.n); };
  $('#absExtra').onclick = ev => { const b = ev.target.closest('[data-n]'); if (b) cycle(b.dataset.n); };
  $('#absAdd').onclick = () => { addAbs($('#absIn').value); $('#absIn').value = ''; };
  $('#absIn').addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.ctrlKey) { ev.preventDefault(); $('#absAdd').click(); } });

  const chipBox = (sel, field, items) => {
    const box = $(sel);
    const draw = all => {
      box.innerHTML = (all ? items : items.slice(0, 6)).map(t => `<button type="button" class="chip">${esc(t)}</button>`).join('')
        + (field === 'hc' ? '<button type="button" class="chip" data-abs="1">+ HS vắng cần bổ sung bài</button>' : '')
        + (!all && items.length > 6 ? `<button type="button" class="chip" data-more="1" style="border-style:dashed">Thêm ${items.length - 6} gợi ý…</button>` : '');
    };
    draw(false);
    box.onclick = ev => {
      const c = ev.target.closest('.chip'); if (!c) return;
      if (c.dataset.more) return draw(true);
      const ta = F(field);
      const add = c.dataset.abs ? `${e.absent.length} HS vắng cần bổ sung bài.` : c.textContent;
      ta.value = ta.value.trim() ? ta.value.trim().replace(/\.?$/, '; ') + add.charAt(0).toLowerCase() + add.slice(1) : add;
    };
  };
  chipBox('#uuChips', 'uu', phraseFreq('uu', DEFAULT_UU));
  chipBox('#hcChips', 'hc', phraseFreq('hc', DEFAULT_HC));

  const setPPCT = n => { F('ppct').value = n; const name = lessonAt(F('prog').value, cur().cls, n); if (name) F('lesson').value = name; };
  $$('[data-st]', form).forEach(b => b.onclick = () => setPPCT(Math.max(0, (+F('ppct').value || 0) + +b.dataset.st)));
  F('ppct').addEventListener('input', () => setPPCT(F('ppct').value));
  F('lesson').addEventListener('change', () => { const r = ppctOf(F('prog').value, cur().cls).find(r => r.name === F('lesson').value); if (r) F('ppct').value = r.t; });
  const onSlot = () => { if (isNew && isClass(cur().cls)) setPPCT(lastPPCT(F('prog').value, cur().cls, slotOrder(cur())) + 1); refresh(); prefillAbsent(); };
  ['cls', 'prog', 'date', 'buoi', 'tiet'].forEach(n => F(n).addEventListener('change', onSlot));
  const toggleOff = () => { const off = F('off').checked; $('#offBox').classList.toggle('hide', !off); $('#teachBox').classList.toggle('hide', off); };
  F('off').addEventListener('change', toggleOff);
  $('#offChips').onclick = ev => { const c = ev.target.closest('.chip'); if (c) { F('offReason').value = c.textContent; $$('.chip', $('#offChips')).forEach(x => x.classList.toggle('on', x === c)); } };
  toggleOff(); refresh(); prefillAbsent();

  const doSave = async () => {
    const c = cur(), off = F('off').checked;
    if (!c.date || !isClass(c.cls)) { $('#slotBox').open = true; F(c.date ? 'cls' : 'date').focus(); return toast('Cần nhập ngày và lớp (vd 3.3)'); }
    const lesson = off ? (F('offReason').value.trim() || 'Nghỉ') : F('lesson').value.trim();
    if (!lesson) { F('lesson').focus(); return toast('Cần nhập tên bài dạy'); }
    if ($('#absIn').value.trim()) addAbs($('#absIn').value);
    const dup = S.entries.find(x => x.id !== e.id && x.date === c.date && x.cls === c.cls && x.buoi === c.buoi && +x.tiet === c.tiet);
    if (dup && !await ask({ title: 'Tiết này đã được ghi', body: `Lớp ${esc(c.cls)} đã có tiết ${c.tiet} buổi ${c.buoi.toLowerCase()} ngày ${vnDate(c.date)} (“${esc(dup.lesson)}”). Vẫn lưu thêm một tiết?`, ok: 'Vẫn lưu' })) return;
    Object.assign(e, c, {
      off, ppct: off ? '' : F('ppct').value, lesson, absent: off ? [] : e.absent,
      uu: off ? '' : F('uu').value.trim(), hc: off ? '' : F('hc').value.trim(), teacher: F('teacher').value.trim(), note: F('note').value.trim(),
    });
    if (!S.classes.includes(c.cls)) S.classes.push(c.cls), S.classes.sort(cmpClass);
    const i = S.entries.findIndex(x => x.id === e.id);
    i >= 0 ? (S.entries[i] = e) : S.entries.push(e);
    save(); $('#drawer').close(); render(); toast(off ? `Đã đánh dấu nghỉ – lớp ${c.cls}` : `Đã lưu tiết dạy lớp ${c.cls}`);
  };
  $('#dSave').onclick = doSave;
  form.onkeydown = ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); doSave(); } };
  if (!isNew) $('#dDel').onclick = async () => {
    if (!await ask({ title: 'Xóa tiết dạy?', body: `Tiết “${esc(e.lesson)}” của lớp ${esc(e.cls)} sẽ bị xóa khỏi sổ.`, ok: 'Xóa', danger: true })) return;
    const idx = S.entries.findIndex(x => x.id === e.id), old = S.entries[idx];
    S.entries.splice(idx, 1); save(); $('#drawer').close(); render();
    toast('Đã xóa tiết dạy', { label: 'Hoàn tác', fn: () => { S.entries.splice(idx, 0, old); save(); render(); } });
  };
  $('#drawer').showModal();
  $('.db', form).scrollTop = 0;
  if (!prefilled) F('cls').focus();
}

/* =========================================================
   THỜI KHÓA BIỂU
   ========================================================= */
function viewTKB(root) {
  const days = S.settings.days, P = S.settings.periods, def = S.programs[0]?.id;
  const cellText = (dow, buoi, tiet) => {
    const s = S.tkb.find(x => x.dow === dow && x.buoi === buoi && +x.tiet === tiet);
    return s ? (s.label || `${s.cls}${s.prog !== def ? ' ' + s.prog : ''}`) : '';
  };
  const cellCls = v => { const m = v.trim().match(/^(\S+)/); return !v.trim() ? '' : m && isClass(m[1]) ? gcls(normClass(m[1])) : 'lbl'; };
  let rows = '';
  for (const buoi of BUOI) {
    if (!P[buoi]) continue;
    rows += `<tr class="bh"><td colspan="${days.length + 1}">Buổi ${buoi.toLowerCase()}</td></tr>`;
    for (let t = 1; t <= P[buoi]; t++) rows += `<tr><th class="r">Tiết ${t}</th>${days.map(d => { const v = cellText(d, buoi, t); return `<td><input class="${cellCls(v)}" data-d="${d}" data-b="${buoi}" data-t="${t}" value="${esc(v)}" aria-label="${DOW[d - 1]} tiết ${t} buổi ${buoi.toLowerCase()}"></td>`; }).join('')}</tr>`;
  }
  const count = S.tkb.filter(s => s.cls).length;
  root.innerHTML = `${phead('Thời khóa biểu', `${esc(S.settings.teacher)} · ${count} tiết mỗi tuần`, `<span class="tag warn hide" id="tDirty">Chưa lưu</span><button type="button" class="btn primary" id="tSave">${ic('check')}Lưu thời khóa biểu</button>`)}
  <div class="panel"><div class="panel-b tw"><table class="tkb"><thead><tr><th></th>${days.map(d => `<th>${DOW[d - 1]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-b muted sm-t" style="line-height:1.8">
    Gõ tên lớp vào ô, ví dụ <b>4.6</b> hoặc <b>4A6</b>. Ô có chữ khác (như <b>Chào cờ</b>) chỉ để hiển thị.
    ${S.programs.length > 1 ? `<br>Lớp học chương trình khác thì thêm mã sau tên lớp, ví dụ <b>3.2 ${esc(S.programs[1].id)}</b>. Mã: ${S.programs.map((p, i) => `<b>${esc(p.id)}</b> = ${esc(p.name)}${i === 0 ? ' (mặc định)' : ''}`).join(' · ')}` : ''}
  </div></div>`;
  root.oninput = ev => { if (ev.target.matches('.tkb input')) { ev.target.className = cellCls(ev.target.value); $('#tDirty').classList.remove('hide'); } };
  $('#tSave').onclick = async () => {
    const out = [], bad = [];
    for (const inp of $$('.tkb input')) {
      const v = inp.value.trim(); if (!v) continue;
      const base = { dow: +inp.dataset.d, buoi: inp.dataset.b, tiet: +inp.dataset.t };
      const m = v.match(/^(\S+)(?:\s+(.+))?$/);
      if (m && isClass(m[1])) {
        let prog = def;
        if (m[2]) { const p = S.programs.find(p => p.id.toLowerCase() === m[2].toLowerCase() || p.name.toLowerCase() === m[2].toLowerCase()); if (p) prog = p.id; else bad.push(v); }
        out.push({ ...base, cls: normClass(m[1]), prog });
        if (!S.classes.includes(normClass(m[1]))) S.classes.push(normClass(m[1]));
      } else out.push({ ...base, label: v });
    }
    if (bad.length && !await ask({ title: 'Không nhận ra mã chương trình', body: `Các ô ${bad.map(esc).join(', ')} sẽ dùng chương trình mặc định “${esc(progName(def))}”.`, ok: 'Tiếp tục lưu' })) return;
    S.classes.sort(cmpClass); S.tkb = out; save(); render(); toast('Đã lưu thời khóa biểu');
  };
}

/* =========================================================
   HỌC SINH
   ========================================================= */
function viewClasses(root) {
  if (!UI.cls || !S.classes.includes(UI.cls)) UI.cls = S.classes.find(c => (S.students[c] || []).length) || S.classes[0] || null;
  const cls = UI.cls, roster = S.students[cls] || [];
  root.innerHTML = `${phead('Học sinh', 'Danh sách lớp và theo dõi chuyên cần', `<button type="button" class="btn" id="cAdd">${ic('plus')}Thêm lớp</button><button type="button" class="btn" id="cImport">${ic('upload')}Nhập từ Excel</button><button type="button" class="btn primary" id="cSrc">${ic('link')}Lấy từ dữ liệu trường</button>`)}
  <div class="cls-tiles" style="margin-bottom:22px">${S.classes.map(c => { const n = (S.students[c] || []).length; return `<button type="button" class="cls-tile ${c === cls ? 'on' : ''}" data-c="${esc(c)}">${clsBadge(c, true)}<span>${n ? n + ' HS' : '<span class="faint">trống</span>'}</span></button>`; }).join('')}</div>
  ${cls ? `<div class="panel"><div class="panel-h">${clsBadge(cls)}<div><h2>Lớp ${esc(cls)}</h2><div class="faint sm-t">Sĩ số ${roster.length}</div></div><span class="grow"></span>
    ${roster.length > 10 ? '<input class="inp" type="search" id="cSearch" placeholder="Tìm học sinh…" style="max-width:220px">' : ''}
    <button type="button" class="btn" id="cPaste">${ic('clip')}Dán danh sách</button><button type="button" class="btn icon ghost danger" id="cDel" aria-label="Xóa lớp" title="Xóa lớp">${ic('trash')}</button></div>
    ${roster.length ? `<div class="tw"><table class="t"><thead><tr><th class="n">STT</th><th>Họ và tên</th><th>Ngày sinh</th><th class="n">Vắng P</th><th class="n">Vắng K</th><th></th></tr></thead><tbody id="cRows">
      ${roster.map((s, i) => { const a = absentCount(cls, s.name); return `<tr data-name="${esc(s.name.toLowerCase())}"><td class="n faint">${i + 1}</td><td><b style="font-weight:500">${esc(s.name)}</b></td><td class="muted">${esc(s.dob)}</td><td class="n">${a.P || '<span class="faint">–</span>'}</td><td class="n">${a.K || '<span class="faint">–</span>'}</td><td>${a.n >= S.settings.absentAlert ? '<span class="tag bad">Vắng nhiều</span>' : ''}</td></tr>`; }).join('')}
    </tbody></table></div>` : emptyBox('users', 'Lớp chưa có danh sách học sinh', '<div>Bấm “Lấy từ dữ liệu trường”, “Nhập từ Excel” (file FORM QUẢN LÝ LỚP) hoặc “Dán danh sách”.</div>')}</div>`
    : `<div class="panel">${emptyBox('users', 'Chưa có lớp nào', '<div>Bấm “Lấy từ dữ liệu trường” để lấy lớp và học sinh đã có trên web.</div>')}</div>`}`;

  $$('[data-c]', root).forEach(b => b.onclick = () => { UI.cls = b.dataset.c; saveUI(); render(); });
  $('#cImport').onclick = () => pickFile('.xlsx,.xls', importRoster);
  $('#cSrc').onclick = openSourcePicker;
  $('#cAdd').onclick = () => {
    modal('Thêm lớp', '<label class="field"><span>Tên lớp</span><input class="inp" id="nc" placeholder="vd 3.1 hoặc 3A1"></label>',
      '<button type="button" class="btn" data-close>Hủy</button><button type="button" class="btn primary" id="ncOk">Thêm lớp</button>');
    $('#nc').focus();
    const ok = () => { const c = normClass($('#nc').value); if (!isClass(c)) return toast('Tên lớp dạng 3.1 hoặc 3A1'); if (!S.classes.includes(c)) S.classes.push(c), S.classes.sort(cmpClass); UI.cls = c; save(); $('#modal').close(); render(); };
    $('#ncOk').onclick = ok; $('#nc').onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } };
  };
  if (!cls) return;
  const sr = $('#cSearch'); if (sr) sr.oninput = () => { const q = sr.value.trim().toLowerCase(); $$('#cRows tr').forEach(tr => tr.classList.toggle('hide', !!q && !tr.dataset.name.includes(q))); };
  $('#cDel').onclick = async () => {
    if (!await ask({ title: `Xóa lớp ${cls}?`, body: 'Danh sách học sinh của lớp sẽ bị xóa. Các tiết đã ghi trong sổ vẫn được giữ nguyên.', ok: 'Xóa lớp', danger: true })) return;
    S.classes = S.classes.filter(c => c !== cls); delete S.students[cls]; save(); render();
  };
  $('#cPaste').onclick = () => {
    modal(`Dán danh sách lớp ${cls}`, `<p style="margin-top:0">Mỗi dòng một học sinh. Dán thẳng từ Excel 3 cột <b>Mã HS · Họ tên · Ngày sinh</b>, hoặc chỉ cột Họ tên.</p><textarea class="inp" id="pasteTA" rows="14">${esc(roster.map(s => [s.code, s.name, s.dob].join('\t')).join('\n'))}</textarea>`,
      '<button type="button" class="btn" data-close>Hủy</button><button type="button" class="btn primary" id="pOk">Lưu danh sách</button>', true);
    $('#pOk').onclick = () => {
      S.students[cls] = $('#pasteTA').value.split('\n').map(l => l.split('\t').map(x => x.trim())).filter(c => c.some(Boolean))
        .map(c => c.length >= 2 ? { code: c[0], name: c[1], dob: c[2] || '' } : { code: '', name: c[0], dob: '' });
      save(); $('#modal').close(); render(); toast(`Đã lưu ${S.students[cls].length} học sinh`);
    };
  };
}

/* ---------- đọc Excel ---------- */
function pickFile(accept, handler) {
  const fp = $('#filePick'); fp.accept = accept; fp.value = '';
  fp.onchange = () => { const f = fp.files[0]; if (f) handler(f); };
  fp.click();
}
async function readWB(file) {
  if (!window.XLSX) { toast('Chưa tải được thư viện Excel – kiểm tra kết nối mạng'); throw new Error('no xlsx'); }
  return XLSX.read(await file.arrayBuffer(), { type: 'array' });
}
const cellV = (ws, r, c) => { const x = ws[XLSX.utils.encode_cell({ r, c })]; return !x ? undefined : typeof x.v === 'string' ? x.v.normalize('NFC') : x.v; };
const serialToISO = v => { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : ''; };
const strToISO = s => { const m = String(s).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : ''; };

async function importRoster(file) {
  const wb = await readWB(file); let nCls = 0, nStu = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws['!ref']) continue;
    const R = XLSX.utils.decode_range(ws['!ref']);
    let hr = -1, cName = -1, cCode = -1, cDob = -1;
    for (let r = R.s.r; r <= Math.min(R.e.r, 30) && hr < 0; r++) for (let c = R.s.c; c <= Math.min(R.e.c, 15); c++) {
      const v = String(cellV(ws, r, c) ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (/^HỌ (&|VÀ) TÊN|^HỌ TÊN/.test(v)) { hr = r; cName = c; }
    }
    if (hr < 0) continue;
    for (let c = R.s.c; c <= Math.min(R.e.c, 15); c++) {
      const v = String(cellV(ws, hr, c) ?? '').toUpperCase();
      if (/MÃ/.test(v)) cCode = c; if (/NGÀY SINH/.test(v)) cDob = c;
    }
    let cls = normClass(name);
    if (!isClass(cls)) for (let r = 0; r < hr; r++) for (let c = 0; c < 6; c++) if (/^LỚP/i.test(String(cellV(ws, r, c) ?? ''))) { const n = normClass(String(cellV(ws, r, c + 1) ?? '')); if (isClass(n)) cls = n; }
    if (!isClass(cls)) continue;
    const list = [];
    for (let r = hr + 1; r <= R.e.r; r++) {
      const nm = cellV(ws, r, cName); if (typeof nm !== 'string') continue;
      const name2 = nm.replace(/\s+/g, ' ').trim(), code = cCode >= 0 ? String(cellV(ws, r, cCode) ?? '').trim() : '';
      const dobV = cDob >= 0 ? cellV(ws, r, cDob) : '';
      const dob = typeof dobV === 'number' && dobV > 3000 ? vnDate(serialToISO(dobV)) : (typeof dobV === 'string' ? dobV : '');
      if (name2.split(' ').length < 2 || name2 === name2.toUpperCase()) continue;
      if (!/\d/.test(code) && !dob) continue;
      list.push({ code, name: name2, dob });
    }
    if (!list.length) continue;
    S.students[cls] = list; nCls++; nStu += list.length;
    if (!S.classes.includes(cls)) S.classes.push(cls);
  }
  S.classes.sort(cmpClass); save(); render();
  toast(nCls ? `Đã nhập ${nStu} học sinh của ${nCls} lớp` : 'Không tìm thấy sheet danh sách lớp phù hợp');
}

/* =========================================================
   CHƯƠNG TRÌNH (PPCT)
   ========================================================= */
function viewPPCT(root) {
  if (!S.programs.some(p => p.id === UI.ppctProg)) UI.ppctProg = S.programs[0]?.id;
  const grades = [...new Set(S.classes.map(gradeOf).concat(Object.keys(S.ppct).filter(k => k.startsWith(UI.ppctProg + '|')).map(k => +k.split('|')[1])))].filter(Boolean).sort((a, b) => a - b);
  if (!grades.includes(+UI.ppctGrade)) UI.ppctGrade = grades[0] || 3;
  const key = `${UI.ppctProg}|${UI.ppctGrade}`;
  const list = (S.ppct[key] || []).slice().sort((a, b) => a.t - b.t);
  const cog = S.classes.filter(c => gradeOf(c) === +UI.ppctGrade);
  const lasts = Object.fromEntries(cog.map(c => [c, lastPPCT(UI.ppctProg, c)]));

  let topic = null, body = '';
  for (const r of list) {
    if (r.topic && r.topic !== topic) { topic = r.topic; body += `<tr class="topic"><td colspan="3">${esc(topic)}</td></tr>`; }
    body += `<tr><td class="n"><b>${r.t}</b></td><td>${esc(r.name)}</td><td><div class="row gap-s">${cog.filter(c => lasts[c] >= r.t).map(c => clsBadge(c, true)).join('')}</div></td></tr>`;
  }
  root.innerHTML = `${phead('Chương trình', 'Phân phối chương trình và tiến độ từng lớp', `<button type="button" class="btn" id="pPaste">${ic('clip')}Dán PPCT</button><button type="button" class="btn primary" id="pImport">${ic('upload')}Nhập từ Excel</button>`)}
  <div class="row" style="margin-bottom:20px">
    ${S.programs.length > 1 ? `<div class="seg">${S.programs.map(p => `<button type="button" data-pp="${esc(p.id)}" class="${p.id === UI.ppctProg ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="seg">${grades.map(g => `<button type="button" data-pg="${g}" class="${g === +UI.ppctGrade ? 'on' : ''}">Khối ${g}</button>`).join('')}</div>
    <button type="button" class="btn sm ghost" id="pNewG">${ic('plus')}Khối khác</button>
  </div>
  ${cog.length ? `<div class="panel" style="margin-bottom:16px"><div class="panel-b row">${cog.map(c => `<div class="row gap-s">${clsBadge(c, true)}<span class="sm-t">${lasts[c] ? `đã dạy đến tiết ${lasts[c]}` : '<span class="faint">chưa dạy</span>'}</span></div>`).join('')}</div></div>` : ''}
  <div class="panel"><div class="panel-h"><h2>${esc(progName(UI.ppctProg))} · Khối ${UI.ppctGrade}</h2><span class="grow"></span><span class="faint sm-t">${list.length} tiết</span></div>
    ${list.length ? `<div class="tw"><table class="t"><thead><tr><th class="n" style="width:70px">Tiết</th><th>Tên bài học</th><th style="width:34%">Lớp đã dạy</th></tr></thead><tbody>${body}</tbody></table></div>`
      : emptyBox('list', 'Chưa có phân phối chương trình', '<div>Nhập từ Excel (sheet BÁO GIẢNG) hoặc dán từ bảng tính.</div>')}</div>`;

  $$('[data-pp]', root).forEach(b => b.onclick = () => { UI.ppctProg = b.dataset.pp; saveUI(); render(); });
  $$('[data-pg]', root).forEach(b => b.onclick = () => { UI.ppctGrade = +b.dataset.pg; saveUI(); render(); });
  $('#pNewG').onclick = () => {
    modal('Thêm khối', '<label class="field"><span>Khối lớp</span><input class="inp" type="number" id="ng" min="1" max="12" placeholder="vd 6"></label>',
      '<button type="button" class="btn" data-close>Hủy</button><button type="button" class="btn primary" id="ngOk">Thêm</button>');
    $('#ng').focus();
    $('#ngOk').onclick = () => { const g = +$('#ng').value; if (!g) return; UI.ppctGrade = g; S.ppct[`${UI.ppctProg}|${g}`] ||= []; save(); saveUI(); $('#modal').close(); render(); };
  };
  $('#pImport').onclick = () => pickFile('.xlsx,.xls', f => importPPCT(f, key));
  $('#pPaste').onclick = () => {
    modal(`PPCT ${progName(UI.ppctProg)} – khối ${UI.ppctGrade}`, `<p style="margin-top:0">Mỗi dòng: <b>Tiết</b> ⇥ <b>Chủ đề</b> ⇥ <b>Tên bài</b> (dán thẳng từ Excel), hoặc chỉ <b>Tiết</b> ⇥ <b>Tên bài</b>. Tiết dạng “23-24” hoặc “9+10” sẽ được tách thành từng tiết.</p>
      <textarea class="inp" id="pTA" rows="16">${esc(list.map(r => [r.t, r.topic, r.name].join('\t')).join('\n'))}</textarea>`,
      '<button type="button" class="btn" data-close>Hủy</button><button type="button" class="btn primary" id="pOk">Lưu PPCT</button>', true);
    $('#pOk').onclick = () => {
      const out = []; let tp0 = '';
      for (const line of $('#pTA').value.split('\n')) {
        const c = line.split('\t').map(x => x.trim()); if (!c[0]) continue;
        const [t, tp, nm] = c.length >= 3 ? c : [c[0], '', c[1] || ''];
        if (tp) tp0 = tp;
        for (const n of expandTiet(t)) out.push({ t: n, topic: tp0, name: nm });
      }
      S.ppct[key] = out; save(); $('#modal').close(); render(); toast(`Đã lưu ${out.length} tiết`);
    };
  };
}
function expandTiet(t) {
  // Excel hay tự đổi “9-10” thành ngày 09/10 → đọc lại thành khoảng tiết
  if (typeof t === 'number' && t > 1000 && window.XLSX) { const d = XLSX.SSF.parse_date_code(t); t = `${d.d}-${d.m}`; }
  const m = String(t).trim().match(/^(\d+)\s*[-+]\s*(\d+)$/);
  if (m) { const a = []; for (let i = +m[1]; i <= +m[2]; i++) a.push(i); return a; }
  return /^\d+$/.test(String(t).trim()) ? [+t] : [];
}
async function importPPCT(file, key) {
  const wb = await readWB(file);
  const name = wb.SheetNames.find(n => /BÁO GIẢNG|PPCT|PHÂN PHỐI/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
  const hi = rows.findIndex(r => r.some(v => /TÊN BÀI/i.test(String(v))));
  if (hi < 0) return toast('Không thấy cột “Tên bài học” trong sheet ' + name);
  const H = rows[hi].map(v => String(v).toUpperCase());
  const cT = H.findIndex(v => /^TIẾT/.test(v.trim())), cN = H.findIndex(v => /TÊN BÀI/.test(v)), cTp = H.findIndex(v => /CHỦ ĐỀ/.test(v));
  const out = []; let topic = '';
  for (const r of rows.slice(hi + 1)) {
    if (cTp >= 0 && String(r[cTp]).trim()) topic = String(r[cTp]).trim();
    const nm = String(r[cN] ?? '').replace(/\s+/g, ' ').trim(); if (!nm) continue;
    for (const n of expandTiet(r[cT])) out.push({ t: n, topic, name: nm });
  }
  if (!out.length) return toast('Không đọc được tiết nào');
  S.ppct[key] = out; save(); render(); toast(`Đã nhập ${out.length} tiết từ sheet “${name}”`);
}

/* =========================================================
   IN & XUẤT FILE
   ========================================================= */
function weekSummary(entries) {
  let P = 0, K = 0;
  for (const e of entries) for (const a of e.absent || []) a.type === 'K' ? K++ : P++;
  return { P, K, n: P + K };
}
function printHTML(n) {
  const st = S.settings, d = weekDates(n);
  const inWeek = S.entries.filter(e => e.date >= d[0] && e.date <= d[5]);
  const sum = weekSummary(inWeek);
  const sections = S.programs.map((p, i) => {
    const rows = inWeek.filter(e => e.prog === p.id).sort((a, b) => cmpClass(a.cls, b.cls) || bySlot(a, b));
    if (!rows.length && i > 0) return '';
    return `<div class="sec2">${i + 1}. ${esc(p.name)}</div>
    <table class="form"><thead>
      <tr><th rowspan="2" style="width:9%">Thứ, ngày</th><th rowspan="2" style="width:5%">Lớp dạy</th><th rowspan="2" style="width:6%">Tiết dạy theo TKB</th><th rowspan="2" style="width:5%">Tiết dạy theo PPCT</th><th rowspan="2" style="width:20%">Tên bài dạy, nội dung công việc</th><th colspan="2">Học sinh vắng</th><th rowspan="2" style="width:24%">Nhận xét (Ưu điểm, hạn chế) và đánh giá</th><th rowspan="2" style="width:10%">Giáo viên dạy ký tên (ký, ghi rõ họ và tên)</th><th rowspan="2" style="width:6%">Ghi chú</th></tr>
      <tr><th style="width:4%">Số lượng</th><th style="width:11%">Tên</th></tr></thead><tbody>
      ${rows.length ? rows.map(e => `<tr><td>${thu(e.date)}\n${vnDate(e.date)}</td><td style="text-align:center">${esc(e.cls)}</td><td style="text-align:center">${e.tiet} (${e.buoi})</td><td style="text-align:center">${e.off ? '' : esc(e.ppct)}</td><td>${esc(e.lesson)}</td><td style="text-align:center">${(e.absent || []).length}</td><td>${esc(absentText(e))}</td><td>${esc(commentText(e))}</td><td>${esc(e.teacher)}</td><td>${esc(e.note)}</td></tr>`).join('')
        : '<tr><td colspan="10" style="text-align:center;height:28px">Không có tiết dạy</td></tr>'}
    </tbody></table>`;
  }).join('');
  return `<table class="hdr"><tr><td style="width:40%">${esc(st.ubnd)}<br>${esc(st.school)}<br>———</td><td></td><td style="width:45%">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br><u>Độc lập - Tự do - Hạnh phúc</u></td></tr></table>
  <div class="ttl">${esc(st.reportTitle)}<br>NĂM HỌC ${esc(st.year)}</div>
  <div style="text-align:center;margin:4px 0 8px;font-style:italic">Tuần: ${pad(n)} &nbsp; Từ ngày ${vnDate(d[0])} đến ngày ${vnDate(d[5])}</div>
  ${sections}
  <div class="sec2">TỔNG KẾT TUẦN</div>
  <div>- Số tiết đã dạy: ${inWeek.filter(e => !e.off).length}${inWeek.some(e => e.off) ? `; tiết nghỉ: ${inWeek.filter(e => e.off).length}` : ''}.</div>
  <div>- Vắng: ${sum.n} trong đó: ${sum.P} P; ${sum.K} K.</div>
  <table class="sig"><tr><td>GVBM</td><td>TỔ TRƯỞNG</td><td>PHÓ HIỆU TRƯỞNG</td></tr>
  <tr><td style="height:70px"></td><td></td><td></td></tr>
  <tr><td>${esc(st.teacher)}</td><td>${esc(st.toTruong)}</td><td>${esc(st.pht)}</td></tr></table>`;
}
function viewReport(root) {
  const byCls = {};
  for (const e of S.entries) {
    const o = byCls[e.cls + '|' + e.prog] ||= { cls: e.cls, prog: e.prog, n: 0, off: 0, P: 0, K: 0 };
    e.off ? o.off++ : o.n++;
    for (const a of e.absent || []) a.type === 'K' ? o.K++ : o.P++;
  }
  const stats = Object.values(byCls).sort((a, b) => cmpClass(a.cls, b.cls)), mp = multiProg();
  root.innerHTML = `${phead('In & xuất file', 'Bản in đúng mẫu sổ của trường – khổ A4 ngang', weekNav(UI.week))}
  <div class="row noprint" style="margin-bottom:20px">
    <button type="button" class="btn primary lg" id="rPrint">${ic('printer')}In / Lưu PDF</button>
    <button type="button" class="btn lg" id="rXlsx">${ic('download')}Excel tuần ${pad(UI.week)}</button>
    <button type="button" class="btn lg" id="rXlsxAll">${ic('download')}Excel cả năm</button>
  </div>
  <div class="paper">${printHTML(UI.week)}</div>
  <div class="panel noprint" style="margin-top:24px"><div class="panel-h"><h2>Thống kê cả năm theo lớp</h2></div>
    ${stats.length ? `<div class="tw"><table class="t"><thead><tr><th>Lớp</th>${mp ? '<th>Chương trình</th>' : ''}<th class="n">Số tiết đã dạy</th><th class="n">Tiết nghỉ</th><th class="n">Tiết PPCT gần nhất</th><th class="n">Lượt vắng P</th><th class="n">Lượt vắng K</th></tr></thead><tbody>
    ${stats.map(o => `<tr><td>${clsBadge(o.cls, true)}</td>${mp ? `<td>${esc(progName(o.prog))}</td>` : ''}<td class="n">${o.n}</td><td class="n">${o.off || '<span class="faint">–</span>'}</td><td class="n">${lastPPCT(o.prog, o.cls) || '–'}</td><td class="n">${o.P}</td><td class="n">${o.K}</td></tr>`).join('')}</tbody></table></div>`
      : emptyBox('printer', 'Chưa có dữ liệu')}</div>`;
  bindWeekNav(root);
  $('#rPrint').onclick = () => window.print();
  $('#rXlsx').onclick = () => exportXlsx([UI.week]);
  $('#rXlsxAll').onclick = () => {
    const ws = [...new Set(S.entries.map(e => weekOf(e.date)))].filter(n => n > 0).sort((a, b) => a - b);
    ws.length ? exportXlsx(ws) : toast('Chưa có dữ liệu');
  };
}
function exportXlsx(weeks) {
  if (!window.XLSX) return toast('Chưa tải được thư viện Excel – kiểm tra kết nối mạng');
  const st = S.settings, wb = XLSX.utils.book_new();
  for (const n of weeks) {
    const d = weekDates(n), inWeek = S.entries.filter(e => e.date >= d[0] && e.date <= d[5]);
    const A = [], M = [], mg = (r, c1, c2, r2 = r) => M.push({ s: { r, c: c1 }, e: { r: r2, c: c2 } });
    A.push([st.ubnd, '', '', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM']); mg(0, 0, 3); mg(0, 7, 9);
    A.push([st.school, '', '', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc']); mg(1, 0, 3); mg(1, 7, 9);
    A.push([]);
    A.push([st.reportTitle]); mg(3, 0, 9);
    A.push([`NĂM HỌC ${st.year}`]); mg(4, 0, 9);
    A.push([`Tuần: ${pad(n)} Từ ngày ${vnDate(d[0])} đến ngày ${vnDate(d[5])}`]); mg(5, 0, 9);
    S.programs.forEach((p, i) => {
      const rows = inWeek.filter(e => e.prog === p.id).sort((a, b) => cmpClass(a.cls, b.cls) || bySlot(a, b));
      if (!rows.length && i > 0) return;
      A.push([`${i + 1}. ${p.name}`]); mg(A.length - 1, 0, 3);
      const h = A.length;
      A.push(['Thứ, ngày', 'Lớp dạy', 'Tiết dạy\ntheo TKB', 'Tiết dạy\ntheo PPCT', 'Tên bài dạy, nội dung công việc', 'Học sinh vắng', '', 'Nhận xét (Ưu điểm, hạn chế) và đánh giá', 'Giáo viên dạy ký tên\n(ký, ghi rõ họ và tên)', 'Ghi chú']);
      A.push(['', '', '', '', '', 'Số lượng', 'Tên']);
      [0, 1, 2, 3, 4, 7, 8, 9].forEach(c => mg(h, c, c, h + 1)); mg(h, 5, 6);
      for (const e of rows) A.push([`${thu(e.date)}\n${vnDate(e.date)}`, e.cls, `${e.tiet} (${e.buoi})`, e.off ? '' : (e.ppct === '' ? '' : +e.ppct), e.lesson, (e.absent || []).length, absentText(e), commentText(e), e.teacher, e.note]);
    });
    const sum = weekSummary(inWeek);
    A.push([]);
    A.push(['TỔNG KẾT TUẦN']); mg(A.length - 1, 0, 2);
    A.push([`- Vắng: ${sum.n} trong đó: ${sum.P} P; ${sum.K} K.`]); mg(A.length - 1, 0, 5);
    A.push(['GVBM', '', '', '', 'TỔ TRƯỞNG', '', '', '', 'PHÓ HIỆU TRƯỞNG']); mg(A.length - 1, 0, 1); mg(A.length - 1, 4, 6);
    A.push([]); A.push([]); A.push([]);
    A.push([st.teacher, '', '', '', st.toTruong, '', '', '', st.pht]); mg(A.length - 1, 0, 1); mg(A.length - 1, 4, 6);
    const ws = XLSX.utils.aoa_to_sheet(A);
    ws['!merges'] = M;
    ws['!cols'] = [14, 8, 10, 9, 38, 8, 24, 44, 20, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, `Tuần ${pad(n)}`);
  }
  XLSX.writeFile(wb, weeks.length === 1 ? `So_dau_bai_Tuan_${pad(weeks[0])}.xlsx` : `So_dau_bai_${st.year}.xlsx`);
}

/* =========================================================
   CÀI ĐẶT
   ========================================================= */
function viewSettings(root) {
  const st = S.settings;
  const fld = (k, label, type = 'text') => `<label class="field"><span>${label}</span><input class="inp" type="${type}" data-k="${k}" value="${esc(st[k])}"></label>`;
  root.innerHTML = `${phead('Cài đặt', 'Thông tin in trên sổ, năm học và dữ liệu')}
  <div class="stack">
  <section class="panel"><div class="panel-h"><h2>Trường &amp; người ký</h2></div><div class="panel-b">
    <div class="grid c3">${fld('ubnd', 'Cơ quan chủ quản')}${fld('school', 'Tên trường')}${fld('year', 'Năm học')}</div>
    <div class="grid" style="margin-top:14px">${fld('reportTitle', 'Tiêu đề bảng khi in')}</div>
    <div class="grid c3" style="margin-top:14px">${fld('teacher', 'Giáo viên bộ môn')}${fld('toTruong', 'Tổ trưởng')}${fld('pht', 'Phó hiệu trưởng')}</div>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>Năm học &amp; tiết học</h2></div><div class="panel-b">
    <div class="grid c4">${fld('week1', 'Thứ Hai của Tuần 01', 'date')}
      <label class="field"><span>Số tiết buổi sáng</span><input class="inp" type="number" min="1" max="6" id="pS" value="${st.periods['Sáng']}"></label>
      <label class="field"><span>Số tiết buổi chiều</span><input class="inp" type="number" min="0" max="6" id="pC" value="${st.periods['Chiều']}"></label>
      ${fld('absentAlert', 'Cảnh báo khi vắng từ (buổi)', 'number')}</div>
    <div class="field" style="margin-top:16px"><span>Ngày dạy trong tuần</span><div class="chips">${[2, 3, 4, 5, 6, 7].map(d => `<button type="button" class="chip ${st.days.includes(d) ? 'on' : ''}" data-day="${d}">${DOW[d - 1]}</button>`).join('')}</div></div>
    <div class="row" style="margin-top:20px"><span class="grow"></span><button type="button" class="btn primary" id="sSave">${ic('check')}Lưu cài đặt</button></div>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>Môn học / chương trình</h2></div><div class="panel-b">
    <p class="muted sm-t" style="margin-top:0">Giáo viên môn khác (Toán, Tiếng Anh, Khoa học…) chỉ cần đổi tên hoặc thêm môn ở đây. Mỗi môn là một mục riêng trong sổ khi in.</p>
    <div id="progs" class="stack" style="gap:8px"></div>
    <div class="row gap-s" style="margin-top:14px;flex-wrap:nowrap"><input class="inp" type="text" id="npId" placeholder="Mã, vd TA" style="width:120px"><input class="inp" type="text" id="npName" placeholder="Tên, vd Tiếng Anh"><button type="button" class="btn" id="npAdd">${ic('plus')}Thêm</button></div>
  </div></section>
  <section class="panel"><div class="panel-h"><h2>Dữ liệu</h2><span class="grow"></span><span class="faint sm-t">${S.entries.length} tiết · ${S.classes.length} lớp · ${Object.values(S.students).reduce((a, l) => a + l.length, 0)} học sinh</span></div><div class="panel-b">
    <p class="muted sm-t" style="margin-top:0">Dữ liệu chỉ lưu trong trình duyệt trên máy này. Nên tải bản sao lưu mỗi tuần; dùng file sao lưu để chuyển sang máy khác.</p>
    <div class="row">
      <button type="button" class="btn" id="bImportOld">${ic('upload')}Nhập sổ cũ (Excel)</button>
      <button type="button" class="btn" id="bBackup">${ic('download')}Tải bản sao lưu</button>
      <button type="button" class="btn" id="bRestore">${ic('upload')}Khôi phục từ bản sao lưu</button>
      <span class="grow"></span>
      <button type="button" class="btn danger" id="bReset">${ic('trash')}Xóa toàn bộ</button></div>
  </div></section>
  </div>`;

  $$('[data-day]', root).forEach(b => b.onclick = () => b.classList.toggle('on'));
  const drawProgs = () => {
    $('#progs').innerHTML = S.programs.map((p, i) => `<div class="row gap-s" style="flex-wrap:nowrap"><span class="tag brand" style="min-width:64px;justify-content:center">${esc(p.id)}</span>
      <input class="inp" type="text" data-pi="${i}" value="${esc(p.name)}" aria-label="Tên chương trình ${esc(p.id)}">
      <button type="button" class="btn icon" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Đưa lên trước" title="Đưa lên trước">↑</button>
      <button type="button" class="btn icon ghost danger" data-del="${i}" aria-label="Xóa">${ic('trash')}</button></div>`).join('');
  };
  drawProgs();
  $('#progs').addEventListener('change', ev => { const i = ev.target.dataset.pi; if (i != null) { S.programs[i].name = ev.target.value.trim() || S.programs[i].name; save(); toast('Đã đổi tên'); } });
  $('#progs').addEventListener('click', async ev => {
    const up = ev.target.closest('[data-up]'), del = ev.target.closest('[data-del]');
    if (up) { const i = +up.dataset.up; [S.programs[i - 1], S.programs[i]] = [S.programs[i], S.programs[i - 1]]; save(); drawProgs(); }
    if (del) {
      const p = S.programs[+del.dataset.del], n = S.entries.filter(e => e.prog === p.id).length;
      if (S.programs.length === 1) return toast('Cần ít nhất một môn / chương trình');
      if (!await ask({ title: `Xóa “${p.name}”?`, body: n ? `Có <b>${n} tiết</b> đã ghi thuộc chương trình này, chúng sẽ bị xóa theo.` : 'Chương trình chưa có tiết nào.', ok: 'Xóa', danger: true })) return;
      S.programs.splice(+del.dataset.del, 1); S.entries = S.entries.filter(e => e.prog !== p.id); S.tkb = S.tkb.filter(t => t.prog !== p.id); save(); drawProgs();
    }
  });
  $('#npAdd').onclick = () => {
    const id = $('#npId').value.trim().replace(/\s+/g, ''), name = $('#npName').value.trim();
    if (!id || !name) return toast('Nhập mã và tên');
    if (S.programs.some(p => p.id.toLowerCase() === id.toLowerCase())) return toast('Mã đã tồn tại');
    S.programs.push({ id, name }); save(); drawProgs(); $('#npId').value = $('#npName').value = '';
  };
  $('#sSave').onclick = () => {
    $$('[data-k]', root).forEach(i => st[i.dataset.k] = i.type === 'number' ? +i.value : i.value.trim());
    st.periods = { 'Sáng': +$('#pS').value || 4, 'Chiều': +$('#pC').value || 0 };
    st.days = $$('[data-day].on', root).map(x => +x.dataset.day);
    save(); render();
    toast(parseD(st.week1).getDay() !== 1 ? 'Đã lưu – lưu ý: ngày Tuần 01 nên là thứ Hai' : 'Đã lưu cài đặt');
  };
  $('#bBackup').onclick = downloadBackup;
  $('#bRestore').onclick = () => pickFile('.json', async f => {
    let d; try { d = JSON.parse(await f.text()); if (!d.v || !Array.isArray(d.entries)) throw 0; } catch { return toast('File sao lưu không hợp lệ'); }
    if (!await ask({ title: 'Khôi phục dữ liệu?', body: `Dữ liệu hiện tại sẽ được thay bằng bản sao lưu (${d.entries.length} tiết).`, ok: 'Khôi phục' })) return;
    S = d; save(); render(); toast('Đã khôi phục');
  });
  $('#bReset').onclick = async () => {
    if (!await ask({ title: 'Xóa toàn bộ dữ liệu?', body: 'Mọi tiết đã ghi, danh sách học sinh và cài đặt sẽ trở về mặc định. <b>Không thể hoàn tác</b> – hãy tải bản sao lưu trước.', ok: 'Xóa toàn bộ', danger: true })) return;
    S = seed(); save(); render();
  };
  $('#bImportOld').onclick = () => pickFile('.xlsx,.xls', importOldBook);
}
function downloadBackup() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `sodaubai_saoluu_${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Đã tải bản sao lưu');
}

/* ---------- nhập sổ đầu bài Excel theo mẫu cũ ---------- */
async function importOldBook(file) {
  const wb = await readWB(file);
  let added = 0, skipped = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]; if (!ws['!ref']) continue;
    const R = XLSX.utils.decode_range(ws['!ref']);
    let prog = null;
    for (let r = R.s.r; r <= R.e.r; r++) {
      const a = cellV(ws, r, 0);
      const as = typeof a === 'string' ? a.trim() : '';
      if (/^TỔNG KẾT/i.test(as)) break;
      const sec = as.match(/^\d+\.\s*(.+)$/);
      if (sec) {
        const nm = sec[1].trim();
        prog = S.programs.find(p => p.name.toLowerCase() === nm.toLowerCase());
        if (!prog) { prog = { id: nm.match(/\d{4}/) ? nm.match(/\d{4}/)[0] : nm.split(/\s+/).map(w => w[0]).join('').toUpperCase(), name: nm }; if (S.programs.some(p => p.id === prog.id)) prog.id += S.programs.length; S.programs.push(prog); }
        continue;
      }
      if (!prog) continue;
      const lesson = cellV(ws, r, 4);
      if (typeof lesson !== 'string' || !lesson.trim() || /Tên bài dạy/i.test(lesson)) continue;
      const date = typeof a === 'number' ? serialToISO(a) : strToISO(as);
      if (!date) continue;
      const b = cellV(ws, r, 1);
      const cls = typeof b === 'number' && b > 3000 ? (() => { const d = XLSX.SSF.parse_date_code(b); return `${d.d}.${d.m}`; })() : normClass(b);
      const cm = String(cellV(ws, r, 2) ?? '').match(/(\d+)\s*\(?\s*(Sáng|Chiều)?/i);
      const tiet = cm ? +cm[1] : 1, buoi = cm && /chi/i.test(cm[2] || '') ? 'Chiều' : 'Sáng';
      const names = String(cellV(ws, r, 6) ?? '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
      const absent = names.map(n => ({ name: n.replace(/\s*\((K|P)\)\s*$/i, ''), type: /\(K\)\s*$/i.test(n) ? 'K' : 'P' }));
      const cmt = String(cellV(ws, r, 7) ?? '');
      const mm = cmt.match(/^\s*(?:Ư|U)u(?: điểm)?\s*:\s*([\s\S]*?)\s*(?:Hạn chế\s*:\s*([\s\S]*))?$/i);
      const e = {
        id: uid(), date, cls, prog: prog.id, buoi, tiet, off: false,
        ppct: cellV(ws, r, 3) ?? '', lesson: lesson.replace(/\s+/g, ' ').trim(), absent,
        uu: mm ? mm[1].trim() : cmt.trim(), hc: mm && mm[2] ? mm[2].trim() : '',
        teacher: String(cellV(ws, r, 8) ?? '').trim(), note: String(cellV(ws, r, 9) ?? '').trim(),
      };
      if (S.entries.some(x => x.date === e.date && x.cls === e.cls && x.buoi === e.buoi && +x.tiet === e.tiet && x.prog === e.prog)) { skipped++; continue; }
      S.entries.push(e); added++;
      if (isClass(cls) && !S.classes.includes(cls)) S.classes.push(cls);
    }
  }
  S.classes.sort(cmpClass); save(); render();
  toast(`Đã nhập ${added} tiết${skipped ? `, bỏ qua ${skipped} tiết trùng` : ''}`);
}

/* =========================================================
   DỮ LIỆU CÓ SẴN CỦA WEB (sdb-sources.js) — chỉ đọc localStorage + 1 file tĩnh,
   0 lượt Firebase, 0 lượt Apps Script
   ========================================================= */
let rosterData = null; // students-active.json — đọc 1 lần mỗi lần mở trang, chỉ khi cần
const rosterJson = async () => rosterData || (rosterData = await (await fetch(ROSTER_URL, { cache: 'no-cache' })).json());
async function loadSources() {
  let solop = [], roster = [];
  try { if (window.EduSoLop) solop = SRC.fromSoLop(JSON.parse(localStorage.getItem(SOLOP_KEY)) || {}, window.EduSoLop); } catch { }
  try { roster = SRC.fromRoster(await rosterJson()); } catch { }
  return { solop: SRC.groupBySchool(solop), roster: SRC.groupBySchool(roster) };
}

async function openSourcePicker() {
  S.srcSchool = S.srcSchool || {};
  modal('Lấy lớp và học sinh từ dữ liệu trường', '<p class="muted" style="margin:0">Đang đọc dữ liệu…</p>', '<button type="button" class="btn" data-close>Đóng</button>', true);
  const body = () => $('.mb', $('#modal'));
  const src = await loadSources();
  const kinds = [
    { id: 'solop', label: 'Sổ lớp của Điều phối', note: 'Sổ lớp đã đọc ở trang Điểm danh trên máy này — có mã học sinh, ngày sinh; bỏ học sinh đã nghỉ luôn.' },
    { id: 'roster', label: 'Danh sách học sinh của hệ thống', note: 'Danh sách học sinh đang học do admin quản lý — chỉ có họ tên.' },
  ].filter(k => src[k.id].length);
  if (!kinds.length) {
    body().innerHTML = emptyBox('users', 'Chưa có dữ liệu lớp trên máy này',
      '<div>Mở trang <a href="diem-danh.html" target="_blank" rel="noopener">Điểm danh &amp; tiến độ</a>, dán link sổ lớp và bấm “Cập nhật tất cả”, rồi quay lại đây.</div>');
    return;
  }
  // Mặc định: nguồn có trường của sổ này, ưu tiên sổ lớp Điều phối (đủ thông tin hơn)
  const hasMine = k => src[k.id].some(g => SRC.sameSchool(g.school, S.settings.school));
  let kind = (kinds.find(hasMine) || kinds[0]).id;
  let school = null, picked = new Set();
  const groups = () => src[kind];
  const pickSchool = () => {
    const gs = groups();
    const g = gs.find(x => x.school === school) || gs.find(x => SRC.sameSchool(x.school, S.settings.school)) || gs[0];
    school = g.school;
    // Đánh dấu sẵn các lớp sổ đang có; sổ mới thì lấy cả trường
    const mine = g.classes.filter(c => S.classes.includes(c.key));
    picked = new Set((mine.length ? mine : g.classes).map(c => c.key));
    return g;
  };
  const draw = () => {
    const g = pickSchool();
    body().innerHTML = `
      ${kinds.length > 1 ? `<div class="seg" id="srcKind">${kinds.map(k => `<button type="button" data-k="${k.id}" class="${k.id === kind ? 'on' : ''}">${esc(k.label)}</button>`).join('')}</div>` : `<b style="font-weight:500">${esc(kinds[0].label)}</b>`}
      <div class="hintline">${esc(kinds.find(k => k.id === kind).note)} Chỉ đọc dữ liệu đã có, không gửi gì đi.</div>
      <label class="field" style="margin-top:14px"><span>Trường</span><select class="inp" id="srcSchool">${groups().map(x => `<option ${x.school === school ? 'selected' : ''}>${esc(x.school)}</option>`).join('')}</select></label>
      <div class="row" style="margin-top:14px"><b style="font-weight:500">Chọn lớp (${g.classes.length})</b><span class="grow"></span>
        <button type="button" class="btn sm" id="srcAll">Chọn tất cả</button><button type="button" class="btn sm ghost" id="srcNone">Bỏ chọn</button></div>
      <div class="tw" style="margin-top:8px"><table class="t"><thead><tr><th></th><th>Lớp</th><th class="n">Sĩ số nguồn</th><th class="n">Đang có trong sổ</th></tr></thead><tbody>
        ${g.classes.map(c => { const n = (S.students[c.key] || []).length; return `<tr><td><input type="checkbox" data-pk="${esc(c.key)}" ${picked.has(c.key) ? 'checked' : ''} aria-label="Lớp ${esc(c.key)}"></td><td>${clsBadge(c.key, true)}${c.cls !== c.key ? ` <span class="faint sm-t">${esc(c.cls)}</span>` : ''}</td><td class="n">${c.students.length}</td><td class="n">${n || '<span class="faint">–</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="hintline">Lớp đã có danh sách sẽ được thay bằng danh sách mới (giữ mã HS, ngày sinh đã nhập). Các tiết đã ghi và số buổi vắng không đổi.</div>`;
    const kb = $('#srcKind'); if (kb) kb.onclick = ev => { const b = ev.target.closest('[data-k]'); if (b) { kind = b.dataset.k; school = null; draw(); } };
    $('#srcSchool').onchange = ev => { school = ev.target.value; draw(); };
    $$('[data-pk]', body()).forEach(x => x.onchange = () => x.checked ? picked.add(x.dataset.pk) : picked.delete(x.dataset.pk));
    $('#srcAll').onclick = () => { g.classes.forEach(c => picked.add(c.key)); $$('[data-pk]', body()).forEach(x => x.checked = true); };
    $('#srcNone').onclick = () => { picked.clear(); $$('[data-pk]', body()).forEach(x => x.checked = false); };
  };
  draw();
  $('.mf', $('#modal')).innerHTML = `<button type="button" class="btn" data-close>Hủy</button><button type="button" class="btn primary" id="srcOk">${ic('check')}Lấy các lớp đã chọn</button>`;
  $('#srcOk').onclick = () => {
    const g = groups().find(x => x.school === school), list = g.classes.filter(c => picked.has(c.key));
    if (!list.length) return toast('Chọn ít nhất một lớp');
    let added = 0, removed = 0;
    for (const c of list) {
      const r = SRC.mergeStudents(S.students[c.key], c.students);
      S.students[c.key] = r.list; added += r.added; removed += r.removed.length;
      S.srcSchool[c.key] = g.school;
      if (!S.classes.includes(c.key)) S.classes.push(c.key);
    }
    S.classes.sort(cmpClass);
    if (!S.settings.school) S.settings.school = g.school;
    if (!list.some(c => c.key === UI.cls)) UI.cls = list[0].key;
    save(); saveUI(); $('#modal').close(); render();
    toast(`Đã lấy ${list.length} lớp · ${added} học sinh mới${removed ? ` · ${removed} tên không còn trong danh sách` : ''}`);
  };
}

/** Tiết đã ghi hôm nay → Gọi tên (cùng máy): đúng lớp, bỏ qua bạn vắng, câu hỏi theo bài vừa dạy. */
async function sendToPicker(e) {
  const names = (S.students[e.cls] || []).map(s => s.name);
  let g; try { g = JSON.parse(localStorage.getItem(GOITEN_KEY)) || {}; } catch { g = {}; }
  let hit = null, tiet = 0, level = '';
  try { hit = SRC.rosterHit(await rosterJson(), (S.srcSchool || {})[e.cls] || S.settings.school, e.cls); } catch { /* không đọc được → dán danh sách của sổ */ }
  if (!hit && !names.length) return toast(`Lớp ${e.cls} chưa có danh sách học sinh – lấy ở mục Học sinh trước`);
  const LS = window.EduNamePickerLessons;
  if (LS && window.EduSoLop) {
    try {
      level = LS.levelForClass(e.cls);
      const ppct = await LS.load();
      tiet = SRC.tietForLesson((ppct[level] || {}).periods, e.lesson, window.EduSoLop.lessonOf);
    } catch { tiet = 0; }
  }
  const r = SRC.goitenPatch(g, { names, absent: (e.absent || []).map(a => a.name), hit, tiet, level, day: SRC.goitenDay(new Date()) });
  try { localStorage.setItem(GOITEN_KEY, JSON.stringify(r.g)); } catch { return toast('Không lưu được sang Gọi tên (bộ nhớ trình duyệt bị chặn)'); }
  toast(`Đã gửi lớp ${e.cls} sang Gọi tên: ${r.absent} bạn vắng${tiet ? ' · câu hỏi theo bài này' : ''}${r.miss ? ` · ${r.miss} tên vắng không khớp danh sách` : ''}`);
  window.open('goi-ten.html', 'eduquiz-goiten');
}

/** Sổ mới chưa có tên giáo viên → lấy tên tài khoản (hồ sơ auth-guard đã đọc, không đọc thêm). */
window.addEventListener('edu:ready', ev => {
  const p = (ev.detail && ev.detail.profile) || {};
  if (!S.settings.teacher && p.name) { S.settings.teacher = String(p.name).trim(); save(); render(); }
});

render();
