/* ============================================================
   js/so-lop/diem-danh.js — trang "Điểm danh & tiến độ" (diem-danh.html).
   Giáo viên dạy nhiều trường: mỗi trường 1 Điều phối đào tạo, 1 hoặc nhiều Google Sheet "FORM QUẢN LÝ LỚP"
   (mỗi tab 1 lớp). Đọc bằng 2 link công khai của Google (có CORS — đọc thẳng từ trình duyệt):
     /htmlview                     → tên file + danh sách tab (gid)
     /export?format=csv&gid=<tab>  → nguyên bảng của lớp (giữ đủ chữ, không bị đoán kiểu như gviz)
   Trang chỉ cho giáo viên + admin (auth-guard → chạy init khi "edu:ready"). Đọc Sheet không dùng Firebase. Link thư mục
   Drive không đọc được từ trình duyệt (Google chặn) → lưu để mở nhanh, giáo viên chép link các file FORM trong đó rồi dán thêm.
   Tải mạng: mở 1 lớp = 1 lần đọc tab đó (bản lưu dùng lại tới khi bấm "Tải lại"); "Cập nhật tất cả" (bảng
   tổng quan) đọc mọi tab, 3 tab một lúc, bỏ qua tab đã đọc trong 6 giờ.
   Đồng bộ 2 chiều: "Ghi vào Sheet" (Apps Script classSheetWrite — điểm danh, ô NGÀY trống, ô Đã hoàn thành), xong đọc lại;
   lớp đang mở tự đọc lại Sheet 2 phút/lần khi đang xem. Dự phòng: "Sao chép cột" + "Mở Sheet ở ô" để dán tay (Ctrl+V).
   "Dùng cho Gọi tên": đánh dấu vắng hôm nay + chọn tiết/bài cho Bốc thử thách trong localStorage của goi-ten.html.
   Giao diện 4 thẻ (showTab): Lịch dạy · Các lớp · Điểm danh · Cài đặt — bộ lọc Trường/GV dùng chung cho 2 thẻ đầu.
   Đỡ việc tay: mở trang tự đọc lại các lớp của tôi đã cũ hơn 6 giờ · "Bảng công tháng" dán Excel · "Tin nhắn báo vắng"
   dán Zalo · "Học sinh cần chú ý" (vắng nhiều/vắng liền) gom từ mọi lớp đã đọc.
   ============================================================ */
(function (global) {
  'use strict';

  const L = global.EduSoLop;
  const LS = global.EduNamePickerLessons;
  const $ = (id) => document.getElementById(id);
  const STORE = 'eduquiz_solop_v1';
  const GOITEN = 'eduquiz_goiten_v1';
  const MAX_CACHE = 80;          // tab lớp lưu tạm (mỗi tab ~20–40KB CSV)
  const FRESH_MS = 6 * 3600e3;   // bảng tổng quan dùng lại bản đọc trong 6 giờ
  const POLL_MS = 2 * 60e3;      // lớp đang mở: đọc lại Sheet 2 phút/lần khi đang xem (1 file CSV, không Firebase)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}`;
  const lower = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  const byText = (a, b) => a.localeCompare(b, 'vi', { numeric: true });
  // goi-ten.html ghi ngày dạng "2026-10-28" không đệm số 0 — phải khớp đúng để "vắng hôm nay" có hiệu lực
  const goitenToday = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const fmtDate = (d) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '');

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  // links: [{ id, title, school, label, tabs }] · folders: [{ id, url, label }] · mine: { 'id|gid': true } · me: tên GV
  const S = Object.assign({ links: [], folders: [], folder: '', sel: '', drafts: {}, cache: {}, mine: {}, me: '', scope: 'all', tab: '' }, load());
  if (S.scope !== 'mine') S.scope = 'all'; // bản trước có "Hôm nay dạy" — nay đã nằm ở thẻ Lịch dạy
  // Bản cũ chỉ có 1 thư mục chung, không gắn trường → gắn vào trường của sổ có sẵn từ bản cũ (fillSchools)
  if (S.folder && !S.folders.length) S.folders.push({ id: S.folder.split('/').pop().split('?')[0], url: S.folder, label: '', old: true });
  delete S.folder;
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {
      // Đầy bộ nhớ: bỏ dần bản lưu cũ nhất, giữ link + bản nháp
      const keys = Object.keys(S.cache).sort((a, b) => S.cache[a].at - S.cache[b].at);
      while (keys.length) {
        delete S.cache[keys.shift()];
        try { localStorage.setItem(STORE, JSON.stringify(S)); return; } catch (e2) { /* tiếp tục bỏ */ }
      }
    }
  }
  function toast(msg) {
    const t = $('ddToast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 3600);
  }
  const status = (msg) => { $('ddStatus').textContent = msg; };
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch (e) { /* thử cách cũ */ }
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
    toast(ok ? okMsg : 'Trình duyệt chặn sao chép — thử lại bằng Chrome/Edge.');
  }

  async function getText(url) {
    const r = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }
  /** CSV 1 tab lớp — dùng bản lưu nếu còn mới (maxAge), không thì đọc lại từ Google. */
  async function tabCSV(id, gid, maxAge) {
    const key = `${id}|${gid}`, c = S.cache[key];
    if (c && maxAge != null && Date.now() - c.at < maxAge) return c;
    const csv = await getText(`${sheetUrl(id)}/export?format=csv&gid=${gid}`);
    S.cache[key] = { at: Date.now(), csv };
    const keys = Object.keys(S.cache).sort((a, b) => S.cache[b].at - S.cache[a].at);
    keys.slice(MAX_CACHE).forEach((k) => delete S.cache[k]);
    return S.cache[key];
  }

  // ── Tên bộ "Bài N." theo cấp (để hiện tên bài + khớp bài chỉ ghi tên) ──
  const namesMemo = {};
  async function namesFor(clsName) {
    const lv = LS ? LS.levelForClass(clsName) : '';
    if (!lv) return {};
    if (!namesMemo[lv]) namesMemo[lv] = LS.lessonSets(lv).catch(() => ({}));
    return namesMemo[lv];
  }
  const lessonText = (l, names) => {
    if (!l) return '';
    if (l.bai.length === 1 && names[l.bai[0]]) return names[l.bai[0]].name;
    if (l.bai.length) return 'Bài ' + l.bai.join(' + ');
    return l.review ? 'Ôn tập' : '';
  };

  // ============================================================
  // LINK SỔ LỚP · TRƯỜNG
  // ============================================================
  const schoolOf = (f) => f.school || f.label || f.title || 'Sổ lớp';
  /** Sổ thêm từ bản trước (chưa lưu tên trường) → lấy ô TRƯỜNG từ tab đã đọc trên máy; chưa có tab nào thì đọc 1 tab.
      Trả true nếu có sổ vừa được điền tên trường. */
  async function fillSchools(fetchMissing) {
    let changed = false;
    for (const f of S.links) {
      if (f.school) continue;
      const t = f.tabs.find((x) => S.cache[`${f.id}|${x.gid}`]);
      try {
        const csv = t ? S.cache[`${f.id}|${t.gid}`].csv : fetchMissing && f.tabs[0] ? (await tabCSV(f.id, f.tabs[0].gid, FRESH_MS)).csv : '';
        const c = csv && L.parseClass(L.parseCSV(csv));
        if (c && c.school) { f.school = c.school; changed = true; }
      } catch (e) { /* mất mạng — giữ tên file, lần sau điền */ }
    }
    const first = S.links[0];
    S.folders.forEach((d) => { if (d.old && !d.label && first && first.school) { d.label = first.school; delete d.old; changed = true; } });
    if (changed) save();
    return changed;
  }
  /** Đọc 1 file Sheet: danh sách tab lớp + tên trường (ô TRƯỜNG của tab lớp đầu — đọc luôn vào bản lưu). */
  async function readSheet(id, label) {
    const info = L.parseTabs(await getText(`${sheetUrl(id)}/htmlview`));
    const tabs = info.tabs.filter((t) => L.isClassTab(t.name));
    if (!tabs.length) throw new Error('no-tabs');
    let school = '';
    try { const c = L.parseClass(L.parseCSV((await tabCSV(id, tabs[0].gid, FRESH_MS)).csv)); school = c ? c.school : ''; } catch (e) { /* để trống — dùng nhãn */ }
    return { id, title: info.title || 'Sổ lớp', school, label: label || '', tabs: tabs.sort((a, b) => byText(a.name, b.name)) };
  }
  async function addLinks() {
    const p = L.parsePaste($('ddLinkInput').value);
    if (!p.sheets.length && !p.folders.length) { toast('Chưa thấy link Google Sheet hay thư mục Drive nào trong ô.'); return; }
    $('ddLinkAdd').disabled = true;
    p.folders.forEach((f) => {
      const old = S.folders.find((x) => x.id === f.id);
      if (old) { if (f.label) old.label = f.label; } else S.folders.push(f);
    });
    let ok = 0, bad = 0;
    for (const sh of p.sheets) {
      status(`Đang đọc sổ lớp ${ok + bad + 1}/${p.sheets.length}...`);
      try {
        const rec = await readSheet(sh.id, sh.label);
        const i = S.links.findIndex((x) => x.id === sh.id);
        if (i >= 0) { rec.label = rec.label || S.links[i].label; S.links[i] = rec; } else S.links.push(rec);
        ok++;
      } catch (e) { bad++; }
    }
    $('ddLinkAdd').disabled = false;
    save();
    const msg = [ok && `Đã thêm ${ok} sổ lớp`, p.folders.length && `lưu ${p.folders.length} thư mục`, bad && `${bad} link không đọc được (kiểm tra quyền chia sẻ "Bất kỳ ai có đường liên kết")`].filter(Boolean).join(' · ');
    toast(msg + '.');
    if (!bad) $('ddLinkInput').value = '';
    status('');
    paintLinks(); paintPick();
    if (ok && !S.sel) { const f = S.links[0]; S.sel = `${f.id}|${f.tabs[0].gid}`; save(); paintPick(); openClass(false); }
    if (ok) { $('ddOverview').hidden = false; paintOverview(); }
    if (ok && !bad && !p.folders.length) showTab('week');
  }
  /** Gom file + thư mục theo trường. Thư mục khớp trường theo nhãn hoặc tên trường đọc được từ Sheet. */
  function schools() {
    const map = new Map();
    const get = (name) => { const k = lower(name); if (!map.has(k)) map.set(k, { name, files: [], folders: [] }); return map.get(k); };
    S.links.forEach((f) => get(schoolOf(f)).files.push(f));
    S.folders.forEach((d) => {
      const hit = [...map.values()].find((s) => d.label && (lower(s.name) === lower(d.label) || s.files.some((f) => lower(f.label) === lower(d.label))));
      (hit || get(d.label || 'Thư mục chưa đặt tên')).folders.push(d);
    });
    return [...map.values()].sort((a, b) => byText(a.name, b.name));
  }
  function paintLinks() {
    const n = S.links.reduce((a, f) => a + f.tabs.length, 0), sc = schools();
    $('ddLinkCount').textContent = S.links.length || S.folders.length ? `${sc.length} trường · ${S.links.length} sổ · ${n} lớp` : '';
    $('ddSchools').innerHTML = sc.map((s) => `<div class="dd-school"><h3>${esc(s.name)}</h3>
      ${s.files.map((f) => `<div class="dd-file"><b>${esc(f.title)}</b> <small>${f.tabs.map((t) => esc(t.name)).join(', ')}</small>
        <a class="dd-small dd-a" href="${sheetUrl(f.id)}/edit" target="_blank" rel="noopener">Mở</a>
        <button type="button" class="dd-small" data-relink="${f.id}" title="Đọc lại danh sách lớp (điều phối thêm tab mới)">Cập nhật lớp</button>
        <button type="button" class="dd-x" data-unlink="${f.id}" aria-label="Bỏ sổ ${esc(f.title)}">×</button></div>`).join('')}
      ${s.folders.map((d) => `<div class="dd-file is-folder"><i class="fa-brands fa-google-drive" aria-hidden="true"></i> <b>Thư mục giảng dạy</b>
        <small>${s.files.length ? 'mở để lấy thêm file khi điều phối thêm lớp/khối mới' : 'chưa có sổ lớp — mở thư mục, chép link các file FORM QUẢN LÝ LỚP rồi dán vào ô trên'}</small>
        <a class="dd-small dd-a" href="${esc(d.url)}" target="_blank" rel="noopener">Mở thư mục</a>
        <button type="button" class="dd-x" data-unfolder="${esc(d.id)}" aria-label="Bỏ thư mục">×</button></div>`).join('')}</div>`).join('');
    $('ddMe').value = S.me || '';
    $('ddNoLinks').hidden = !!S.links.length || S.tab === 'setup';
    $('ddToolbar').hidden = !S.links.length || (S.tab !== 'week' && S.tab !== 'classes');
  }

  // ── Thẻ ──
  const TABS = ['week', 'classes', 'class', 'setup'];
  function showTab(tab) {
    if (!TABS.includes(tab)) tab = 'week';
    S.tab = tab; save();
    document.querySelectorAll('#ddTabs [data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    $('ddToolbar').hidden = !S.links.length || (tab !== 'week' && tab !== 'classes');
    $('ddNoLinks').hidden = !!S.links.length || tab === 'setup';
  }

  // ============================================================
  // CHỌN LỚP · TẢI TAB
  // ============================================================
  const selFile = () => S.links.find((f) => S.sel.startsWith(f.id + '|')) || null;
  const selTab = () => { const f = selFile(); const gid = S.sel.split('|')[1]; return f ? f.tabs.find((t) => t.gid === gid) || null : null; };
  function paintPick() {
    const sc = schools().filter((s) => s.files.length);
    $('ddClass').innerHTML = sc.length
      ? sc.map((s) => `<optgroup label="${esc(s.name)}">${s.files.flatMap((f) => f.tabs.map((t) => ({ f, t }))).sort((a, b) => byText(a.t.name, b.t.name))
        .map(({ f, t }) => `<option value="${f.id}|${t.gid}">${S.mine[`${f.id}|${t.gid}`] ? '' : ''}${esc(t.name)} — ${esc(s.name)}</option>`).join('')}</optgroup>`).join('')
      : '<option value="">— Thêm link sổ lớp trước —</option>';
    $('ddClass').value = S.sel;
    $('ddClass').disabled = $('ddReload').disabled = !S.links.length;
    const f = selFile(), t = selTab();
    $('ddOpenSheet').hidden = !f;
    if (f) $('ddOpenSheet').href = `${sheetUrl(f.id)}/edit#gid=${t ? t.gid : ''}`;
    const folder = f ? (schools().find((s) => s.files.includes(f)) || { folders: [] }).folders[0] : null;
    $('ddOpenFolder').hidden = !folder;
    if (folder) $('ddOpenFolder').href = folder.url;
  }

  let cls = null;       // lớp đang xem (EduSoLop.parseClass)
  let lessons = [];     // bài từng tiết (EduSoLop.lessonsOf)
  let names = {};       // tên bộ "Bài N." của cấp lớp đó
  let attendCol = -1;   // tiết đầu của buổi đang điểm danh
  /** Mở lớp đang chọn: có bản lưu thì hiện ngay; fresh=true hoặc chưa có thì đọc từ Sheet. */
  async function openClass(fresh) {
    const f = selFile(), t = selTab();
    if (!f || !t) return;
    const key = S.sel, cached = S.cache[key];
    if (cached && !fresh) { await show(cached.csv, cached.at); return; }
    status(`Đang tải lớp ${t.name} từ Sheet...`);
    $('ddReload').disabled = true;
    try {
      const c = await tabCSV(f.id, t.gid, null);
      save();
      if (S.sel === key) await show(c.csv, c.at);
      paintOverview();
    } catch (e) {
      if (cached) { await show(cached.csv, cached.at); toast('Mất mạng — đang dùng bản đã lưu trên máy.'); }
      else status('Không tải được lớp này — kiểm tra mạng hoặc quyền chia sẻ của file.');
    } finally { $('ddReload').disabled = false; }
  }
  async function show(csv, at) {
    cls = L.parseClass(L.parseCSV(csv));
    if (!cls) { status('Tab này không đúng mẫu FORM QUẢN LÝ LỚP (không thấy dòng TIẾT / BÀI DẠY).'); ['ddProgress', 'ddAttend', 'ddStats'].forEach((id) => { $(id).hidden = true; }); return; }
    const when = new Date(at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    status(`Đã đọc lúc ${when} · bấm "Tải lại từ Sheet" sau khi điều phối/thầy cô cập nhật Sheet.`);
    const sf = selFile();
    if (sf && !sf.school && cls.school) { sf.school = cls.school; save(); paintLinks(); paintPick(); paintOverview(); }
    names = await namesFor(cls.cls);
    lessons = L.lessonsOf(cls.sessions, names);
    const today = L.todaySession(cls.sessions), next = L.nextSession(cls.sessions);
    attendCol = (today || next || cls.sessions[0] || { col: -1 }).col;
    paintProgress(); paintSessionSelect(); paintAttend(); paintStats();
  }

  // ============================================================
  // TIẾN ĐỘ
  // ============================================================
  function paintProgress() {
    $('ddProgress').hidden = false;
    const sm = L.summary(cls, lessons), me = lower(S.me).replace(/\s+/g, '');
    const gvs = [...new Set(cls.sessions.map((s) => s.gv).filter(Boolean))];
    $('ddClassInfo').textContent = [cls.cls, cls.school, cls.teacher ? 'GV ' + cls.teacher : gvs.length > 1 ? `${gvs.length} GV dạy luân phiên` : gvs[0] && 'GV ' + gvs[0],
      `sĩ số ${cls.size}`, sm.daysText && `học ${sm.daysText}`, sm.perDay === 2 && '2 tiết/buổi'].filter(Boolean).join(' · ');
    const pct = sm.total ? Math.round((sm.done / sm.total) * 100) : 0;
    $('ddBar').setAttribute('aria-valuemax', String(sm.total));
    $('ddBar').setAttribute('aria-valuenow', String(sm.done));
    $('ddBar').firstElementChild.style.width = pct + '%';
    const nx = sm.next;
    const nxText = nx ? `<b>Tiết ${nx.tiet} · ${esc(nx.bai ? lessonText(sm.nextLesson, names) || nx.bai : sm.nextLesson ? `dự kiến ${lessonText(sm.nextLesson, names)}` : 'điều phối chưa ghi bài')}</b>${nx.ngay ? ` (${esc(nx.thu)} ${esc(nx.ngay)})` : ''}` : '';
    $('ddNext').innerHTML = `Đã dạy <b>${sm.done}/${sm.total}</b> tiết${sm.planned > sm.done ? ` (điều phối đã xếp bài tới tiết ${sm.planned})` : ''}${sm.last ? ` · gần nhất ${esc(sm.last.ngay || '')}` : ''}.`
      + (nx ? ` Tiết tiếp theo: ${nxText}.` : ' Đã hoàn thành các tiết điều phối đã xếp.');
    const shown = cls.sessions.filter((s) => s.bai || s.done || s === nx);
    $('ddSessions').innerHTML = shown.map((s) => {
      const l = lessons[cls.sessions.indexOf(s)], mine = me && lower(s.gv).replace(/\s+/g, '').includes(me);
      const label = s.bai || (s === nx && sm.nextLesson ? `dự kiến ${lessonText(sm.nextLesson, names)}` : '—');
      return `<li class="${s.done ? 'is-done' : ''}${s === nx ? ' is-next' : ''}${mine ? ' is-me' : ''}" title="${esc([lessonText(l, names), s.gv && 'GV ' + s.gv].filter(Boolean).join(' · '))}">
        <b>Tiết ${s.tiet}</b><span>${esc(label)}</span><small>${s.done ? '<i class="fa-solid fa-check" aria-hidden="true"></i> ' : ''}${esc(s.ngay || (s === nx ? 'tiếp theo' : ''))}${s.gv ? ` · ${esc(s.gv.split(' ').pop())}` : ''}</small></li>`;
    }).join('');
  }

  // ============================================================
  // ĐIỂM DANH
  // ============================================================
  const draftKey = () => `${S.sel}|${attendCol}`;
  const group = () => { const s = cls.sessions.find((x) => x.col === attendCol); return L.sessionGroup(cls.sessions, s); };
  /** Ký hiệu đang dùng: bản nháp → Sheet → NL nếu đã nghỉ luôn trước đó → có mặt. */
  function markOf(st) {
    const d = S.drafts[draftKey()];
    if (d && d.marks && d.marks[st.row] != null) return d.marks[st.row];
    const m = st.marks[attendCol];
    if (m && m !== '?') return m;
    const before = cls.sessions.filter((s) => s.col < attendCol).some((s) => st.marks[s.col] === 'nl');
    return before ? 'nl' : 'x';
  }
  function setMark(row, m) {
    const k = draftKey(), d = S.drafts[k] || (S.drafts[k] = { at: Date.now(), marks: {} });
    d.marks[row] = m; d.at = Date.now();
    Object.keys(S.drafts).forEach((x) => { if (Date.now() - (S.drafts[x].at || 0) > 45 * 864e5) delete S.drafts[x]; });
    save();
  }
  function paintSessionSelect() {
    $('ddAttend').hidden = false;
    const today = L.todaySession(cls.sessions), next = L.nextSession(cls.sessions);
    $('ddSession').innerHTML = cls.sessions.filter((s) => s.bai || s.ngay || s.done || s === next || s.col === attendCol).map((s) =>
      `<option value="${s.col}">Tiết ${s.tiet}${s.bai ? ' · ' + esc(s.bai) : ''}${s.ngay ? ' · ' + esc(s.ngay) : ''}${today && s.col === today.col ? ' (hôm nay)' : ''}${s.done ? '' : ''}</option>`).join('');
    $('ddSession').value = String(attendCol);
  }
  const LABEL = { x: 'Có mặt', v: 'Vắng', nl: 'Nghỉ luôn', moi: 'Mới' };
  function paintAttend() {
    const st = L.stats(cls);
    const vang = new Map(st.students.map((x) => [x.name, x.vang]));
    let co = 0, v = 0;
    $('ddList').innerHTML = cls.students.map((s, i) => {
      const m = markOf(s);
      if (m === 'x' || m === 'moi') co++; else if (m === 'v') v++;
      const n = vang.get(s.name) || 0;
      return `<li class="m-${esc(m)}"><button type="button" class="dd-name" data-flip="${s.row}"><small>${i + 1}</small> ${esc(s.name)}${n ? ` <em title="Số buổi vắng trên Sheet">vắng ${n}</em>` : ''}</button>
        <span class="dd-seg" role="radiogroup" aria-label="${esc(s.name)}">${['x', 'v', 'nl'].map((k) => `<button type="button" role="radio" aria-checked="${m === k}" data-row="${s.row}" data-m="${k}">${LABEL[k]}</button>`).join('')}</span></li>`;
    }).join('');
    $('ddCount').textContent = `Có mặt ${co} · Vắng ${v}`;
    applyFind();
    const g = group(), f = selFile(), t = selTab(), ref = cls.students.length ? L.cellRef(attendCol, cls.students[0].row) : '';
    $('ddOpenCell').href = f && t ? `${sheetUrl(f.id)}/edit#gid=${t.gid}&range=${ref}` : '#';
    $('ddOpenCell').lastChild.textContent = ` Mở Sheet ở ô ${ref}`;
    paintWrite(g);
    $('ddPasteHint').innerHTML = g.length
      ? `Cách dán: bấm <b>Sao chép cột</b> → <b>Mở Sheet ở ô ${ref}</b> → bấm vào ô ${ref} → <kbd>Ctrl</kbd>+<kbd>V</kbd>.`
        + (g.length > 1 ? ` Lớp học <b>${g.length} tiết/buổi</b> nên dán 1 lần điền luôn Tiết ${g.map((x) => x.tiet).join(' và ')}.` : '')
        + ' Ngày dạy và ô "Đã hoàn thành" thầy cô chọn trên Sheet như cũ.'
      : '';
  }
  /** Ô tìm học sinh: ẩn bạn không khớp (không phân biệt dấu, hoa thường). */
  const plain = (s) => lower(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function applyFind() {
    const q = plain($('ddFind').value);
    let n = 0;
    [...$('ddList').children].forEach((li) => { const b = li.querySelector('.dd-name'); li.hidden = !!q && !(b && plain(b.textContent).includes(q)); if (!li.hidden) n++; });
    $('ddNoFind').hidden = !q || n > 0;
  }
  /** Ô chọn khi ghi: điền ngày (chỉ khi ô NGÀY của buổi đang trống) · tick Đã hoàn thành (khi chưa tick). */
  function paintWrite(g) {
    const d = new Date();
    $('ddWNgayWrap').hidden = !g.length || g.some((s) => s.ngay);
    $('ddWNgayText').textContent = `Điền ngày dạy ${fmtDate(d)} vào ô NGÀY`;
    $('ddWDoneWrap').hidden = !g.length || g.every((s) => s.done);
    const d0 = S.drafts[draftKey()], n = d0 && d0.marks ? cls.students.filter((st) => d0.marks[st.row] != null && d0.marks[st.row] !== (st.marks[attendCol] || 'x')).length : 0;
    $('ddDraftInfo').textContent = n ? `${n} thay đổi chưa ghi vào Sheet` : '';
  }
  let writing = false;
  async function writeSheet() {
    if (writing || !cls) return;
    const f = selFile(), t = selTab(), g = group();
    if (!f || !t || !g.length) return;
    if (!global.EduAppsScript) { toast('Trang chưa nạp được Apps Script — dùng "Sao chép cột".'); return; }
    writing = true; $('ddWriteBtn').disabled = true;
    const key = S.sel, col = attendCol, d = new Date();
    const body = {
      sheetId: f.id, gid: t.gid, cols: g.map((s) => ({ col: s.col, tiet: s.tiet })),
      marks: cls.students.map((st) => ({ row: st.row, name: st.name, m: markOf(st) })),
      ngay: !$('ddWNgayWrap').hidden && $('ddWNgay').checked ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '',
      done: !$('ddWDoneWrap').hidden && $('ddWDone').checked,
    };
    status(`Đang ghi Tiết ${g.map((s) => s.tiet).join(', ')} vào Sheet...`);
    try {
      const r = await global.EduAppsScript.call('classSheetWrite', body, { timeoutMs: 60e3 });
      delete S.drafts[`${key}|${col}`]; save();
      toast(`Đã ghi vào Sheet: ${r.written} ô điểm danh${r.ngay ? ' · ngày dạy' : ''}${r.done ? ' · Đã hoàn thành' : ''}.`);
      // Đọc lại để thấy đúng như trên Sheet, vẫn ở buổi vừa ghi
      try { const n = await tabCSV(f.id, t.gid, null); save(); if (S.sel === key) await showKeep(n, col); } catch (e2) { /* lần đọc sau sẽ cập nhật */ }
    } catch (e) {
      const msg = e.code === 'not-found' && /action/i.test(e.message) ? 'Apps Script chưa cập nhật bản có chức năng ghi sổ lớp — nhờ admin deploy lại apps/Code.gs. Tạm dùng "Sao chép cột".'
        : e.code === 'unauthenticated' ? 'Phiên đăng nhập hết hạn — tải lại trang rồi ghi lại.'
        : e.source === 'apps-script' && (e.code === 'unavailable' || e.code === 'deadline-exceeded') ? 'Không kết nối được Apps Script — bản nháp vẫn giữ trên máy, thử lại sau hoặc dùng "Sao chép cột".'
        : e.message;
      status(''); toast(msg);
    } finally { writing = false; $('ddWriteBtn').disabled = false; }
  }
  async function copyColumn() {
    const marks = {};
    cls.students.forEach((s) => { marks[s.row] = markOf(s); });
    const g = group(), text = L.pasteText(cls.students, marks, g.length);
    const ref = L.cellRef(attendCol, cls.students[0].row);
    await copyText(text, `Đã sao chép ${text.split('\n').length} dòng × ${g.length} cột — mở Sheet và dán vào ô ${ref}.`);
  }
  /** Tin nhắn báo vắng buổi đang chọn (gửi GVCN / điều phối qua Zalo). */
  function noticeText() {
    const g = group(), s = g[0] || {}, d = L.dateOf(s.ngay) || new Date();
    const by = { v: [], nl: [] };
    let co = 0;
    cls.students.forEach((st) => { const m = markOf(st); if (by[m]) by[m].push(st.name); else co++; });
    const bai = g.map((x) => x.bai).filter(Boolean).join(' + ') || lessonText(L.summary(cls, lessons).nextLesson, names);
    const watch = L.watchList(cls).filter((x) => !by.v.includes(x.name));
    return [
      `Lớp ${cls.cls}${cls.school ? ' – ' + cls.school : ''}`,
      `${L.THU[d.getDay()]} ${fmtDate(d)} · Tiết ${g.map((x) => x.tiet).join(', ')}${bai ? ' · ' + bai : ''}: có mặt ${co}/${co + by.v.length}.`,
      by.v.length ? `Vắng (${by.v.length}): ${by.v.join(', ')}.` : 'Không có bạn nào vắng.',
      by.nl.length && `Đã nghỉ luôn: ${by.nl.join(', ')}.`,
      watch.length && `Cần nhắc chuyên cần: ${watch.map((x) => `${x.name} (vắng ${x.vang} tiết)`).join(', ')}.`,
    ].filter(Boolean).join('\n');
  }

  // ============================================================
  // CHUYÊN CẦN
  // ============================================================
  function paintStats() {
    $('ddStats').hidden = false;
    const st = L.stats(cls);
    const tot = st.sessions.reduce((a, x) => [a[0] + x.comat, a[1] + x.comat + x.vang], [0, 0]);
    $('ddRate').textContent = tot[1] ? `${st.sessions.length} tiết đã điểm danh · có mặt ${Math.round((tot[0] / tot[1]) * 100)}%` : 'chưa có buổi nào';
    const list = st.students.filter((x) => x.vang || x.nl).sort((a, b) => b.vang - a.vang || b.lien - a.lien);
    const tiets = (name) => { const s = cls.students.find((x) => x.name === name); return cls.sessions.filter((x) => s.marks[x.col] === 'v').map((x) => x.tiet); };
    $('ddAbsent').innerHTML = list.length ? list.map((x) => `<li class="${x.vang >= 3 || x.lien >= 2 ? 'is-warn' : ''}">
        <b>${esc(x.name)}</b> <span>${x.nl ? 'Nghỉ luôn' : `vắng ${x.vang} tiết`}${x.lien >= 2 ? ` · ${x.lien} tiết liền` : ''}</span>
        ${x.vang ? `<small>Tiết ${tiets(x.name).join(', ')}</small>` : ''}</li>`).join('')
      : '<li class="dd-empty">Chưa bạn nào vắng. Tuyệt vời!</li>';
  }

  // ============================================================
  // TỔNG QUAN CÁC LỚP (nhiều trường)
  // ============================================================
  const allTabs = () => S.links.flatMap((f) => f.tabs.map((t) => ({ f, t, key: `${f.id}|${t.gid}` })));
  // key → { at, row } (khỏi phân tích lại CSV mỗi lần vẽ). Không giữ tên trường trong đây — lấy lúc vẽ từ sổ (schoolOf),
  // để đổi/điền tên trường thì mọi lớp của sổ đó cùng chuyển nhóm.
  const ovMemo = new Map();
  async function ovRow(x) {
    const c = S.cache[x.key];
    if (!c) return { ...x, missing: true };
    const m = ovMemo.get(x.key);
    if (m && m.at === c.at) return { ...m.row, f: x.f, t: x.t }; // sổ có thể vừa được đọc lại (bản ghi mới)
    const p = L.parseClass(L.parseCSV(c.csv));
    if (!p) return { ...x, bad: true };
    const nm = await namesFor(p.cls), ls = L.lessonsOf(p.sessions, nm), sm = L.summary(p, ls);
    const row = { ...x, at: c.at, p, sm, nm, mineByName: L.isMine(p, S.me) };
    ovMemo.set(x.key, { at: c.at, row });
    return row;
  }
  let ovBusy = false;
  /** only: Set key lớp cần đọc (tự cập nhật lớp của tôi khi mở trang) — bỏ trống = mọi lớp. */
  async function loadAll(only) {
    if (ovBusy) return;
    ovBusy = true;
    $('ddOvLoad').disabled = true;
    const list = allTabs().filter((x) => !(only instanceof Set) || only.has(x.key));
    const todo = list.filter((x) => !S.cache[x.key] || Date.now() - S.cache[x.key].at >= FRESH_MS);
    let done = 0, fail = 0;
    const worker = async () => {
      while (todo.length) {
        const x = todo.shift();
        try { await tabCSV(x.f.id, x.t.gid, FRESH_MS); } catch (e) { fail++; }
        done++;
        $('ddOvInfo').textContent = `đang đọc ${done}/${done + todo.length} lớp${only instanceof Set ? ' của tôi' : ''}...`;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    save();
    ovBusy = false;
    $('ddOvLoad').disabled = false;
    if (fail) toast(`${fail} lớp không đọc được — thử lại sau.`);
    else if (only instanceof Set && done) toast(`Đã cập nhật ${done} lớp của tôi từ Sheet.`);
    await paintOverview();
    if (done && cls && S.cache[S.sel]) show(S.cache[S.sel].csv, S.cache[S.sel].at); // lớp đang mở cũng vừa được đọc lại
  }
  /** Mở trang: lớp của tôi (★ hoặc có tên trên Sheet) đọc lần cuối hơn 6 giờ trước → tự đọc lại, khỏi bấm "Cập nhật tất cả". */
  function autoRefresh() {
    if (navigator.onLine === false) return;
    const keys = new Set(lastRows.filter((r) => (S.mine[r.key] || r.mineByName) && r.at && Date.now() - r.at >= FRESH_MS).map((r) => r.key));
    if (keys.size) loadAll(keys);
  }
  async function paintOverview() {
    if (!S.links.length) { $('ddOverview').hidden = true; return; }
    $('ddOverview').hidden = false;
    document.querySelectorAll('#ddScope [data-scope]').forEach((b) => { const on = b.dataset.scope === S.scope; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    const rows = await Promise.all(allTabs().map(ovRow));
    if (await fillSchools(false)) { paintLinks(); paintPick(); }
    lastRows = rows;
    paintFilters(rows);
    const today = new Date().getDay(), loaded = rows.filter((r) => r.sm);
    const isMine = (r) => S.mine[r.key] || r.mineByName;
    const teacher = curTeacher();
    let shown = filtered(rows);
    if (S.scope === 'mine') shown = shown.filter(isMine);
    if (S.scope === 'today') {
      // Có chọn GV (hoặc Tên của tôi): lớp có trong lịch hôm nay của GV đó; không thì lớp có buổi học vào thứ hôm nay
      const who = teacher || S.me;
      if (who) {
        const now = new Date(), keys = new Set(L.weekPlan(planInput(shown), who, L.mondayOf(now), now)
          .filter((e) => e.date.toDateString() === now.toDateString()).map((e) => e.key));
        shown = shown.filter((r) => keys.has(r.key));
      } else shown = shown.filter((r) => r.sm && r.sm.days.includes(today) && (!Object.keys(S.mine).length || isMine(r)));
    }
    const missing = rows.filter((r) => r.missing).length;
    $('ddOvInfo').textContent = `${loaded.length}/${rows.length} lớp đã đọc${missing ? ` · ${missing} lớp chưa đọc — bấm "Cập nhật tất cả"` : ''}`;
    // Gộp theo trường không phân biệt hoa thường ("TiH Phong Phú 2" = "TIH PHONG PHÚ 2")
    const by = new Map();
    shown.forEach((r) => { const k = lower(schoolOf(r.f)); if (!by.has(k)) by.set(k, { name: schoolOf(r.f), rows: [] }); by.get(k).rows.push(r); });
    const empty = S.scope === 'today' ? `Hôm nay (${L.THU[today]}) không có lớp nào${teacher ? ` của GV ${teacher}` : S.me || Object.keys(S.mine).length ? ' của thầy cô' : ''} theo lịch đã dạy trên Sheet.`
      : S.scope === 'mine' ? 'Chưa đánh dấu lớp của tôi — bấm ☆ ở cột đầu (chọn "Tất cả"), hoặc nhập "Tên của tôi" ở phần Trường & sổ lớp.' : 'Chưa có lớp.';
    $('ddOv').innerHTML = shown.length ? [...by.values()].sort((a, b) => byText(a.name, b.name)).map(({ name: school, rows: rs }) => `<h3>${esc(school)}</h3>
      <table class="dd-table"><thead><tr><th scope="col"><span class="sr-only">Lớp của tôi</span></th><th scope="col">Lớp</th><th scope="col">Đã dạy</th><th scope="col">Gần nhất</th><th scope="col">Tiếp theo</th><th scope="col">Lịch</th></tr></thead>
      <tbody>${rs.sort((a, b) => byText(a.t.name, b.t.name)).map((r) => {
        const sm = r.sm, star = S.mine[r.key] ? '★' : r.mineByName ? '★' : '☆';
        if (!sm) return `<tr><td><button type="button" class="dd-star" data-star="${r.key}" aria-pressed="${!!S.mine[r.key]}" title="Lớp của tôi">${star}</button></td><td><button type="button" class="dd-link" data-open="${r.key}">${esc(r.t.name)}</button></td><td colspan="4" class="dd-muted">${r.bad ? 'không đúng mẫu FORM' : 'chưa đọc'}</td></tr>`;
        const nx = sm.next, nxText = nx ? `Tiết ${nx.tiet} · ${nx.bai ? lessonText(sm.nextLesson, r.nm) || nx.bai : sm.nextLesson ? 'dự kiến ' + lessonText(sm.nextLesson, r.nm) : '—'}` : 'xong';
        const stale = sm.lastDate && (Date.now() - sm.lastDate) > 9 * 864e5 && nx;
        return `<tr class="${sm.days.includes(today) ? 'is-today' : ''}"><td><button type="button" class="dd-star" data-star="${r.key}" aria-pressed="${!!S.mine[r.key]}" title="${r.mineByName && !S.mine[r.key] ? 'Có tên thầy cô trên Sheet' : 'Lớp của tôi'}">${star}</button></td>
          <td><button type="button" class="dd-link" data-open="${r.key}">${esc(r.t.name)}</button></td>
          <td><span class="dd-mini" style="--p:${sm.total ? Math.round((sm.done / sm.total) * 100) : 0}%"></span> ${sm.done}/${sm.total}</td>
          <td class="${stale ? 'is-stale' : ''}" title="${stale ? 'Hơn 9 ngày chưa có tiết mới — kiểm tra lịch hoặc nhắc cập nhật Sheet' : ''}">${esc(sm.last ? `${sm.last.ngay} · ${sm.last.bai}` : '—')}</td>
          <td>${esc(nxText)}</td><td>${esc(sm.daysText)}${sm.perDay === 2 ? ' · 2 tiết' : ''}</td></tr>`;
      }).join('')}</tbody></table>`).join('') : `<p class="dd-hint">${esc(empty)}</p>`;
    paintWatch(shown);
    paintWeek();
  }

  /** Học sinh cần chú ý ở các lớp đang hiện (đã đọc): vắng ≥3 tiết hoặc 2 tiết liền. */
  let watchText = '';
  function paintWatch(rows) {
    const items = rows.filter((r) => r.p).map((r) => ({ r, w: L.watchList(r.p) })).filter((x) => x.w.length)
      .sort((a, b) => byText(schoolOf(a.r.f), schoolOf(b.r.f)) || byText(a.r.t.name, b.r.t.name));
    const n = items.reduce((a, x) => a + x.w.length, 0);
    $('ddWatchN').textContent = n ? `${n} bạn` : '';
    $('ddWatchCopy').hidden = !n;
    const why = (x) => (x.lien >= 2 && x.lien === x.vang ? `vắng ${x.vang} tiết liền` : x.lien >= 2 ? `vắng ${x.vang} tiết, ${x.lien} tiết liền gần nhất` : `vắng ${x.vang} tiết`);
    $('ddWatchList').innerHTML = n ? items.map(({ r, w }) => `<li><button type="button" class="dd-link" data-open="${r.key}">${esc(r.t.name)}</button> <small>${esc(schoolOf(r.f))}</small>
        <span>${w.map((x) => `<b>${esc(x.name)}</b> (${esc(why(x))})`).join(' · ')}</span></li>`).join('')
      : '<li class="dd-muted">Chưa có bạn nào vắng nhiều trong các lớp đang xem.</li>';
    watchText = items.map(({ r, w }) => `${r.t.name} – ${schoolOf(r.f)}: ${w.map((x) => `${x.name} (${why(x)})`).join('; ')}`).join('\n');
  }

  // ============================================================
  // LỌC THEO TRƯỜNG · GIÁO VIÊN — LỊCH GIẢNG DẠY THEO TUẦN
  // ============================================================
  let lastRows = [];
  let weekOff = 0; // 0 = tuần này
  let weekPlanText = '', monthText = '';
  const curTeacher = () => S.fTeacherName || '';
  const filtered = (rows) => rows.filter((r) => (!S.fSchool || lower(schoolOf(r.f)) === S.fSchool)
    && (!S.fTeacher || (r.p && L.teachersOf(r.p)[S.fTeacher])));
  const planInput = (rows) => rows.filter((r) => r.p).map((r) => ({ key: r.key, school: schoolOf(r.f), cls: r.p, sm: r.sm }));
  /** Ô chọn Trường + Giáo viên (GV lấy từ ô TÊN GV của các lớp đã đọc, theo trường đang chọn). */
  function paintFilters(rows) {
    const sc = new Map();
    rows.forEach((r) => { const k = lower(schoolOf(r.f)); if (!sc.has(k)) sc.set(k, schoolOf(r.f)); });
    if (S.fSchool && !sc.has(S.fSchool)) S.fSchool = '';
    $('ddFSchool').innerHTML = '<option value="">Tất cả trường</option>' + [...sc.entries()].sort((a, b) => byText(a[1], b[1]))
      .map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    $('ddFSchool').value = S.fSchool || '';
    const tc = new Map();
    rows.forEach((r) => {
      if (!r.p || (S.fSchool && lower(schoolOf(r.f)) !== S.fSchool)) return;
      Object.entries(L.teachersOf(r.p)).forEach(([k, v]) => {
        const e = tc.get(k) || { name: v.name, classes: 0, tiet: 0 };
        e.classes++; e.tiet += v.tiet; tc.set(k, e);
      });
    });
    if (S.fTeacher && !tc.has(S.fTeacher)) { S.fTeacher = ''; S.fTeacherName = ''; }
    $('ddFTeacher').innerHTML = `<option value="">Tất cả giáo viên${tc.size ? ` (${tc.size})` : ''}</option>` + [...tc.entries()].sort((a, b) => byText(a[1].name, b[1].name))
      .map(([k, v]) => `<option value="${esc(k)}">${esc(v.name)} — ${v.classes} lớp${v.tiet ? ` · ${v.tiet} tiết đã dạy` : ''}</option>`).join('');
    $('ddFTeacher').value = S.fTeacher || '';
  }
  const KIND = { done: 'Đã dạy', planned: 'Chưa tick hoàn thành', expected: 'Dự kiến', missing: 'Sheet chưa cập nhật' };
  function weekText(e, nm) {
    if (e.kind === 'missing') return 'Ngày thường dạy — chưa có buổi trên Sheet';
    if (!e.sessions.length) return 'Tiết kế tiếp';
    const ss = e.sessions, tiet = ss.map((x) => x.tiet).join(', ');
    let bai = ss.map((x) => x.bai).filter(Boolean).join(' · ');
    if (!bai && e.kind === 'expected' && e.first) {
      const sm = (lastRows.find((r) => r.key === e.key) || {}).sm;
      if (sm && sm.nextLesson) bai = 'dự kiến ' + lessonText(sm.nextLesson, nm || {});
    }
    return `Tiết ${tiet}${bai ? ' · ' + bai : ''}`;
  }
  /** Lịch tuần của GV đang lọc (hoặc "Tên của tôi"): Thứ 2 → Thứ 7, mỗi ô là các lớp dạy hôm đó. */
  /** Hôm nay (lịch của GV hôm nay) + Việc cần làm (tiết đã qua chưa tick Hoàn thành, ngày thường dạy Sheet chưa có buổi). */
  function paintToday(rows, who) {
    const now = new Date();
    $('ddToday').hidden = !who || !rows.length;
    if ($('ddToday').hidden) return;
    const input = planInput(rows), name = (key, c) => { const r = rows.find((x) => x.key === key); return r && r.t ? r.t.name : c.cls; };
    const tietOf = (ss) => ss.length ? `Tiết ${ss.map((x) => x.tiet).join(', ')}` : '';
    const item = (key, col, title, sub, btn) => `<li><div><b>${esc(title)}</b><small>${esc(sub)}</small></div>
      <button type="button" class="dd-small" data-open="${key}"${col >= 0 ? ` data-col="${col}"` : ''}>${btn}</button></li>`;
    $('ddTodayDate').textContent = `${L.THU[now.getDay()]} ${fmtDate(now)}`;
    const today = L.weekPlan(input, who, L.mondayOf(now), now).filter((e) => e.date.toDateString() === now.toDateString() && e.kind !== 'missing');
    $('ddTodayList').innerHTML = today.length ? today.map((e) => item(e.key, e.sessions[0] ? e.sessions[0].col : -1, name(e.key, e.cls),
      [e.school, weekText(e, (rows.find((r) => r.key === e.key) || {}).nm), e.kind === 'done' ? 'đã tick hoàn thành' : ''].filter(Boolean).join(' · '),
      '<i class="fa-solid fa-clipboard-user" aria-hidden="true"></i> Điểm danh')).join('')
      : '<li class="dd-muted">Hôm nay không có lớp nào theo lịch trên Sheet.</li>';
    const unt = L.untickedSessions(input, who, now, 30);
    const miss = L.weekPlan(input, who, L.mondayOf(now), now).filter((e) => e.kind === 'missing');
    const todo = unt.map((e) => item(e.key, e.sessions[0].col, `${name(e.key, e.cls)} · ${L.THU[e.date.getDay()]} ${fmtDate(e.date)}`,
      `${e.school} · ${tietOf(e.sessions)} chưa tick "Đã hoàn thành"`, 'Mở'))
      .concat(miss.map((e) => item(e.key, -1, `${name(e.key, e.cls)} · ${L.THU[e.date.getDay()]} ${fmtDate(e.date)}`,
        `${e.school} · ngày thường dạy nhưng Sheet chưa có buổi — điểm danh và ghi ngày`, 'Mở')));
    $('ddTodoN').textContent = todo.length ? `${todo.length}` : '';
    $('ddTodoList').innerHTML = todo.length ? todo.join('') : '<li class="dd-muted"><i class="fa-solid fa-check" aria-hidden="true"></i> Không còn việc tồn — Sheet đã cập nhật đủ.</li>';
  }
  function paintWeek() {
    $('ddToday').hidden = true; // paintToday mở lại khi đã biết GV + có lớp đã đọc
    const card = $('ddWeek');
    card.hidden = !S.links.length;
    if (!lastRows.some((r) => r.p)) {
      $('ddWeekGrid').innerHTML = '<p class="dd-hint">Chưa đọc lớp nào trên máy này — bấm <b>Cập nhật tất cả</b> ở trên để đọc các lớp rồi xem lịch.</p>';
      $('ddMonth').textContent = ''; weekPlanText = ''; monthText = ''; $('ddMonthCopy').hidden = true;
      return;
    }
    const who = curTeacher() || S.me;
    const mon = L.mondayOf(new Date(), weekOff), sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    $('ddWeekRange').textContent = `${fmtDate(mon)} – ${fmtDate(sun)}${weekOff === 0 ? ' (tuần này)' : ''}`;
    $('ddWeekWho').textContent = who ? `GV ${who}${S.fSchool ? ' · ' + $('ddFSchool').selectedOptions[0].textContent : ''}` : '';
    if (!who) {
      $('ddWeekGrid').innerHTML = '<p class="dd-hint">Chọn giáo viên ở ô "Giáo viên" phía trên (hoặc nhập "Tên của tôi" ở phần Trường & sổ lớp) để xem lịch giảng dạy.</p>';
      $('ddMonth').textContent = ''; weekPlanText = ''; monthText = ''; $('ddMonthCopy').hidden = true;
      return;
    }
    const rows = lastRows.filter((r) => r.p && (!S.fSchool || lower(schoolOf(r.f)) === S.fSchool));
    paintToday(rows, who);
    const plan = L.weekPlan(planInput(rows), who, mon, new Date());
    const rowOf = (key) => rows.find((r) => r.key === key) || {};
    const today = new Date().toDateString();
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(d.getDate() + i); days.push(d); }
    const on = (d) => plan.filter((e) => e.date.toDateString() === d.toDateString());
    const cols = days.filter((d, i) => i < 6 || on(d).length);
    $('ddWeekGrid').innerHTML = `<div class="dd-week" style="--cols:${cols.length}">${cols.map((d) => {
      const es = on(d);
      return `<div class="dd-day${d.toDateString() === today ? ' is-today' : ''}"><h4>${L.THU[d.getDay()]} <small>${fmtDate(d)}</small></h4>
        ${es.length ? es.map((e) => `<button type="button" class="dd-ev k-${e.kind}" data-open="${e.key}" title="${esc(KIND[e.kind])} — bấm để mở lớp">
          <b>${esc(rowOf(e.key).t ? rowOf(e.key).t.name : e.cls.cls)}</b> <small>${esc(e.school)}</small><span>${esc(weekText(e, rowOf(e.key).nm))}</span><em>${esc(KIND[e.kind])}</em></button>`).join('')
          : '<p class="dd-free">—</p>'}</div>`;
    }).join('')}</div>`;
    const cnt = L.monthCount(planInput(rows), who, mon.getFullYear(), mon.getMonth());
    const tot = Object.values(cnt).reduce((a, b) => a + b, 0);
    $('ddMonth').textContent = tot
      ? `Tháng ${mon.getMonth() + 1}: đã dạy ${tot} tiết — ${Object.entries(cnt).sort((a, b) => byText(a[0], b[0])).map(([k, v]) => `${k} ${v}`).join(' · ')} (tiết đã tick Hoàn thành trên Sheet).`
      : `Tháng ${mon.getMonth() + 1}: chưa có tiết nào đã tick Hoàn thành.`;
    // Bảng công: mỗi dòng 1 tiết, cột cách nhau bằng Tab → dán thẳng vào Excel / Google Sheet
    const log = L.monthLog(planInput(rows), who, mon.getFullYear(), mon.getMonth());
    $('ddMonthCopy').hidden = !log.length;
    monthText = log.length ? [`Bảng công tháng ${mon.getMonth() + 1}/${mon.getFullYear()} — GV ${who}`, ['STT', 'Ngày', 'Thứ', 'Trường', 'Lớp', 'Tiết', 'Bài dạy'].join('\t')]
      .concat(log.map((e, i) => [i + 1, `${fmtDate(e.date)}/${e.date.getFullYear()}`, L.THU[e.date.getDay()], e.school, rowOf(e.key).t ? rowOf(e.key).t.name : e.cls, e.tiet, e.bai].join('\t')))
      .concat(['', ...Object.entries(cnt).sort((a, b) => byText(a[0], b[0])).map(([k, v]) => ['', '', '', k, '', v, 'tiết'].join('\t')), ['', '', '', 'Tổng', '', tot, 'tiết'].join('\t')]).join('\n') : '';
    weekPlanText = [`Lịch giảng dạy GV ${who} — tuần ${fmtDate(mon)}–${fmtDate(sun)}`].concat(cols.map((d) => {
      const es = on(d).filter((e) => e.kind !== 'missing');
      return es.length ? `${L.THU[d.getDay()]} ${fmtDate(d)}: ` + es.map((e) => `${rowOf(e.key).t ? rowOf(e.key).t.name : e.cls.cls} (${e.school}) ${weekText(e, rowOf(e.key).nm)}`).join('; ') : '';
    }).filter(Boolean)).join('\n');
  }

  // ============================================================
  // GỬI SANG GỌI TÊN (localStorage của goi-ten.html — cùng máy)
  // ============================================================
  /** Tiết PPCT (np-lessons) ứng với bài của buổi đang chọn: "Bài N" → tiết đầu tiên có Bài N;
      "Ôn tập" → tiết ôn đầu tiên sau bài gần nhất đã dạy. */
  function ppctTiet(periods, sess) {
    const i = cls.sessions.indexOf(sess);
    let want = lessons[i] || { bai: [], review: false };
    if (!sess.bai && !sess.done) want = L.summary(cls, lessons).nextLesson || want; // chưa ghi bài → bài dự kiến
    if (want.bai.length) { const p = periods.find((x) => x.items.includes(`Bài ${want.bai[0]}`)); return p ? p.tiet : 0; }
    if (!want.review) return 0;
    const prev = lessons.slice(0, i).reduce((a, l) => a.concat(l.bai), []).pop();
    const at = prev ? periods.findIndex((x) => x.items.includes(`Bài ${prev}`)) : -1;
    const p = periods.slice(at + 1).find((x) => x.items.some((it) => !/^Bài \d+$/.test(it)));
    return p ? p.tiet : 0;
  }
  async function toPicker() {
    let g;
    try { g = JSON.parse(localStorage.getItem(GOITEN)) || {}; } catch (e) { g = {}; }
    g.absent = g.absent || {}; g.lesson = g.lesson || {}; g.called = g.called || {};
    const out = cls.students.filter((s) => { const m = markOf(s); return m === 'v' || m === 'nl'; }).map((s) => s.name);
    // Lớp có trong danh sách lớp của trang (data/roster) → dùng luôn lớp đó; không có → dán danh sách từ Sheet
    let key, rosterNames = cls.students.map((s) => s.name);
    try {
      const data = await (await fetch('data/roster/students-active.json', { cache: 'no-cache' })).json();
      const hit = (data.students || []).find((s) => lower(s.school) === lower(cls.school) && lower(s.className) === lower(cls.cls));
      if (hit) {
        g.src = 'class'; g.school = hit.school; g.cls = hit.className; key = `class:${hit.school}|${hit.className}`;
        rosterNames = (data.students || []).filter((s) => s.school === hit.school && s.className === hit.className).map((s) => String(s.name).trim());
      }
    } catch (e) { /* không đọc được danh sách lớp → dán danh sách */ }
    if (!key) { g.src = 'paste'; g.paste = rosterNames.join('\n'); key = 'paste'; }
    const byLower = new Map(rosterNames.map((n) => [lower(n), n]));
    const absent = out.map((n) => byLower.get(lower(n))).filter(Boolean);
    g.absent[key] = { day: goitenToday(), names: absent };
    const sess = cls.sessions.find((s) => s.col === attendCol);
    let lessonNote = '';
    if (LS && sess) {
      const lv = LS.levelForClass(cls.cls), ppct = await LS.load(), periods = (ppct[lv] && ppct[lv].periods) || [];
      const tiet = periods.length ? ppctTiet(periods, sess) : 0;
      if (tiet) {
        g.lesson[key] = { lv: key === 'paste' ? lv : 'auto', tiet, day: goitenToday() }; // danh sách dán không tự biết khối
        lessonNote = ` · câu hỏi theo ${sess.bai || lessonText(L.summary(cls, lessons).nextLesson, names)}`;
      }
    }
    try { localStorage.setItem(GOITEN, JSON.stringify(g)); } catch (e) { toast('Không lưu được sang Gọi tên (bộ nhớ trình duyệt bị chặn).'); return; }
    const miss = out.length - absent.length;
    toast(`Đã gửi sang Gọi tên: ${absent.length} bạn vắng${lessonNote}.${miss ? ` ${miss} tên không khớp danh sách lớp.` : ''}`);
    global.open('goi-ten.html', 'eduquiz-goiten');
  }

  /** Hiện bản vừa đọc nhưng giữ nguyên buổi đang điểm danh (show() tự nhảy về buổi hôm nay/tiếp theo). */
  async function showKeep(c, keep) {
    await show(c.csv, c.at);
    if (cls && cls.sessions.some((s) => s.col === keep)) { attendCol = keep; paintSessionSelect(); paintAttend(); }
  }
  // ── Sheet → web: lớp đang mở tự đọc lại khi đang xem (điều phối/thầy cô khác sửa trên Sheet) ──
  async function pollClass(minAge) {
    if (document.hidden || S.tab !== 'class' || !S.sel || writing || navigator.onLine === false) return;
    const f = selFile(), t = selTab(), c = S.cache[S.sel];
    if (!f || !t || (c && Date.now() - c.at < minAge)) return;
    const key = S.sel, before = c ? c.csv : '';
    try {
      const n = await tabCSV(f.id, t.gid, null);
      save();
      if (S.sel === key && n.csv !== before) { await showKeep(n, attendCol); toast('Sheet vừa có thay đổi — đã cập nhật.'); }
      else if (S.sel === key) status(`Đã đọc lúc ${new Date(n.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · tự đọc lại 2 phút/lần khi đang xem.`);
    } catch (e) { /* mất mạng — lần sau thử lại */ }
  }

  // ============================================================
  // SỰ KIỆN
  // ============================================================
  /** Mở điểm danh 1 lớp; col = cột tiết cần mở sẵn (từ Hôm nay / Việc cần làm). */
  async function selectClass(key, col) {
    S.sel = key; save(); paintPick();
    showTab('class');
    global.scrollTo({ top: 0, behavior: 'smooth' });
    await openClass(false);
    if (cls && col != null && cls.sessions.some((s) => s.col === +col)) { attendCol = +col; paintSessionSelect(); paintAttend(); }
  }
  /** Tài khoản đang đăng nhập (auth-guard): chip tên ở thanh trên + tự điền "Tên của tôi" lần đầu. */
  function paintAccount(detail) {
    const p = (detail && detail.profile) || {}, u = (detail && detail.user) || {};
    const nm = p.name || p.displayName || u.email || '';
    $('ddWho').textContent = nm ? `${nm}${global.EduAuth && global.EduAuth.ROLE_LABEL[p.role] ? ' · ' + global.EduAuth.ROLE_LABEL[p.role] : ''}` : '';
    $('ddAvatar').textContent = nm ? nm.trim().split(/\s+/).pop().charAt(0).toUpperCase() : '';
    if (!S.me && p.role === 'teacher' && p.name) { S.me = p.name.trim(); save(); }
  }
  // Thanh thẻ dính ngay dưới thanh trên cùng (cao khác nhau khi chữ xuống dòng trên màn hình hẹp)
  function fitTop() { const t = document.querySelector('.topbar'); if (t) document.documentElement.style.setProperty('--dd-top', t.offsetHeight + 'px'); }
  function init(ev) {
    paintAccount(ev && ev.detail);
    fitTop(); global.addEventListener('resize', fitTop);
    paintLinks(); paintPick();
    $('ddTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
    $('ddTabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.indexOf(S.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      showTab(TABS[(i + TABS.length) % TABS.length]);
      document.querySelector(`#ddTabs [data-tab="${S.tab}"]`).focus();
    });
    document.querySelector('[data-goto="setup"]').addEventListener('click', () => showTab('setup'));
    $('ddLinkAdd').addEventListener('click', addLinks);
    $('ddMe').addEventListener('change', () => { S.me = $('ddMe').value.trim(); save(); ovMemo.clear(); paintOverview(); if (cls) paintProgress(); });
    $('ddSchools').addEventListener('click', (e) => {
      const un = e.target.closest('[data-unlink]'), re = e.target.closest('[data-relink]'), uf = e.target.closest('[data-unfolder]');
      if (un) {
        if (!global.confirm('Bỏ sổ lớp này khỏi máy? (Sheet trên Google không bị ảnh hưởng)')) return;
        const id = un.dataset.unlink;
        S.links = S.links.filter((f) => f.id !== id);
        [S.cache, S.drafts, S.mine].forEach((o) => Object.keys(o).forEach((k) => { if (k.startsWith(id + '|')) delete o[k]; }));
        if (S.sel.startsWith(id + '|')) S.sel = '';
        save(); paintLinks(); paintPick(); paintOverview();
      } else if (uf) {
        S.folders = S.folders.filter((d) => d.id !== uf.dataset.unfolder); save(); paintLinks(); paintPick();
      } else if (re) {
        const f = S.links.find((x) => x.id === re.dataset.relink);
        $('ddLinkInput').value = `${f && f.label ? f.label + ': ' : ''}${sheetUrl(re.dataset.relink)}`; addLinks();
      }
    });
    $('ddClass').addEventListener('change', () => { S.sel = $('ddClass').value; save(); paintPick(); openClass(false); });
    $('ddReload').addEventListener('click', () => openClass(true));
    $('ddOvLoad').addEventListener('click', loadAll);
    $('ddFSchool').addEventListener('change', () => { S.fSchool = $('ddFSchool').value; save(); paintOverview(); });
    $('ddFTeacher').addEventListener('change', () => {
      S.fTeacher = $('ddFTeacher').value;
      S.fTeacherName = S.fTeacher ? $('ddFTeacher').selectedOptions[0].textContent.split(' — ')[0] : '';
      save(); paintOverview();
    });
    $('ddWeekPrev').addEventListener('click', () => { weekOff--; paintWeek(); });
    $('ddWeekNext').addEventListener('click', () => { weekOff++; paintWeek(); });
    $('ddWeekNow').addEventListener('click', () => { weekOff = 0; paintWeek(); });
    $('ddWeekGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) selectClass(b.dataset.open); });
    $('ddToday').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) selectClass(b.dataset.open, b.dataset.col); });
    $('ddFind').addEventListener('input', applyFind);
    $('ddFind').addEventListener('keydown', (e) => {
      // Enter: đổi Có mặt ↔ Vắng cho bạn duy nhất đang hiện rồi xoá ô tìm (điểm danh bằng bàn phím)
      if (e.key !== 'Enter') return;
      const vis = [...$('ddList').children].filter((li) => !li.hidden);
      if (vis.length !== 1) return;
      const st = cls.students.find((s) => s.row === +vis[0].querySelector('[data-flip]').dataset.flip);
      setMark(st.row, markOf(st) === 'x' ? 'v' : 'x'); $('ddFind').value = ''; paintAttend();
      toast(`${st.name}: ${LABEL[markOf(st)]}`);
    });
    $('ddLogout').addEventListener('click', async () => {
      try { if (global.EduAuth) await global.EduAuth.logoutUser(); } catch (e) { /* vẫn chuyển trang */ }
      global.location.href = 'login.html';
    });
    $('ddWeekCopy').addEventListener('click', () => {
      if (!weekPlanText) { toast('Chọn giáo viên trước.'); return; }
      copyText(weekPlanText, 'Đã sao chép lịch tuần — dán vào Zalo/tin nhắn được.');
    });
    $('ddMonthCopy').addEventListener('click', () => { if (monthText) copyText(monthText, 'Đã sao chép bảng công — mở Excel/Google Sheet, bấm ô A1 rồi Ctrl+V.'); });
    $('ddWatchCopy').addEventListener('click', () => { if (watchText) copyText(watchText, 'Đã sao chép danh sách học sinh cần chú ý.'); });
    $('ddWatchList').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) selectClass(b.dataset.open); });
    $('ddNotice').addEventListener('click', () => { if (cls) copyText(noticeText(), 'Đã sao chép tin nhắn báo vắng — dán vào Zalo gửi GVCN/điều phối.'); });
    $('ddScope').addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (!b) return; S.scope = b.dataset.scope; save(); paintOverview(); });
    $('ddOv').addEventListener('click', (e) => {
      const st = e.target.closest('[data-star]'), op = e.target.closest('[data-open]');
      if (st) { const k = st.dataset.star; if (S.mine[k]) delete S.mine[k]; else S.mine[k] = true; save(); paintOverview(); paintPick(); }
      else if (op) selectClass(op.dataset.open);
    });
    $('ddSession').addEventListener('change', () => { attendCol = +$('ddSession').value; paintAttend(); });
    $('ddList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'), f = e.target.closest('[data-flip]');
      if (b) setMark(+b.dataset.row, b.dataset.m);
      else if (f) { const st = cls.students.find((s) => s.row === +f.dataset.flip); setMark(st.row, markOf(st) === 'x' ? 'v' : 'x'); }
      else return;
      paintAttend();
    });
    $('ddAllIn').addEventListener('click', () => { cls.students.forEach((s) => { if (markOf(s) !== 'nl') setMark(s.row, 'x'); }); paintAttend(); });
    $('ddCopy').addEventListener('click', copyColumn);
    $('ddWriteBtn').addEventListener('click', writeSheet);
    setInterval(() => pollClass(POLL_MS - 5e3), POLL_MS);
    document.addEventListener('visibilitychange', () => pollClass(60e3));
    $('ddToPicker').addEventListener('click', toPicker);
    $('ddTheme').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('ic3_theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    });
    // Mở đúng thẻ: chưa có sổ → Cài đặt; có rồi → thẻ lần trước (mặc định Lịch dạy)
    showTab(S.links.length ? (S.tab || 'week') : 'setup');
    save(); // ghi lại dạng mới (folders) nếu là bản cũ
    paintOverview().then(autoRefresh);
    // Sổ thêm từ bản trước chưa có tên trường → điền (đọc 1 tab nếu máy chưa có bản lưu nào của sổ đó)
    fillSchools(true).then((ch) => { if (ch) { paintLinks(); paintPick(); paintOverview(); } });
    if (S.sel) openClass(false);
  }
  // auth-guard bắn "edu:ready" khi đã xác nhận giáo viên/admin; học sinh bị chặn nên trang không đọc gì.
  if (global.EduAuth) global.addEventListener('edu:ready', init, { once: true });
  else init();
})(window);
