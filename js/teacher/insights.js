/* ============================================================
   js/teacher/insights.js — "Tổng quan lớp" của teacher-dashboard.html (tầng Presentation).
   Thẻ trên cùng: Thống kê lớp · Năng lực cả lớp (vòng tròn) · Cần hỗ trợ & Xuất sắc · Tổng kết tiến độ (đồng hồ).
   Công cụ: Giao bài theo lớp · So sánh 2 đợt kiểm tra · Chuyên cần (từ trang Điểm danh).

   0 lượt Firebase / Apps Script thêm — chỉ dùng:
     • bài nộp dashboard đã tải (rawData / scoped từ js/teacher/data-loader.js)
     • đề đã soạn: localStorage "ic3_custom_sets" (Soạn đề — js/exam-builder.js), bài đã giao: "eduquiz_assign_v1"
     • sổ lớp trang Điểm danh đã đọc: localStorage "eduquiz_solop_v1" (js/so-lop/so-lop-core.js phân tích)
   Phép tính ở js/teacher/teacher-insights-core.js (Domain, có test). Vẽ vòng tròn/đồng hồ bằng CSS conic-gradient.
   js/teacher/dashboard.js gọi EduTeacherInsights.render(ctx) mỗi lần đổi bộ lọc.
   ============================================================ */
(function (global) {
  'use strict';

  const T = global.EduTeacherInsights;
  if (!T || !T.proficiency) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const ASSIGN_KEY = 'eduquiz_assign_v1';
  const PREF_KEY = 'eduquiz_insights_v1';
  const COLORS = { gioi: 'var(--green)', kha: 'var(--blue)', tb: 'var(--yellow)', yeu: 'var(--red)', notStarted: 'var(--border)', below: 'var(--orange)', pass: 'var(--green)', excel: 'var(--blue)' };
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(-2).map((w) => w.charAt(0)).join('').toUpperCase();
  const shortTest = (t) => String(t || '').split(' › ').pop();
  const fmtDT = (ms) => { if (!ms) return ''; const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const byNatural = (a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true });
  const toast = (msg) => global.dispatchEvent(new CustomEvent('edu:toast', { detail: msg }));
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (e) { global.prompt('Trình duyệt chặn chép tự động — bôi đen rồi Ctrl+C:', text); }
  }

  let ctx = null; // { rawData, scoped, filters, keyOf, openStudent, applyFilters }

  /** Vòng tròn chia phần: parts [{ v, color }] → nền conic-gradient. half = nửa vòng (đồng hồ). */
  function conic(parts, half) {
    const total = parts.reduce((s, p) => s + p.v, 0) || 1, span = half ? 180 : 360;
    let at = 0;
    const stops = parts.filter((p) => p.v > 0).map((p) => { const a = at, b = at + (p.v / total) * span; at = b; return `${p.color} ${a.toFixed(2)}deg ${b.toFixed(2)}deg`; });
    if (half) stops.push(`transparent 180deg 360deg`);
    return `conic-gradient(from ${half ? '-90deg' : '0deg'}, ${stops.join(', ') || 'var(--border) 0deg 360deg'})`;
  }

  // ============================================================
  // THẺ TỔNG QUAN
  // ============================================================
  function renderOverview() {
    const { scoped, keyOf } = ctx;
    const hist = scoped.examHistories;
    const prof = T.proficiency(hist);
    const gauge = T.progressGauge(scoped.filteredStudents, hist, keyOf);
    const spot = T.spotlight(hist, 3);
    const trends = T.trendLabel(global.EduAnalytics && global.EduAnalytics.progressTrends ? global.EduAnalytics.progressTrends(scoped.filteredResults) : null);
    const needs = hist.filter((h) => typeof h.avgScore === 'number' && h.avgScore < 60).length;
    const excel = hist.filter((h) => typeof h.avgScore === 'number' && h.avgScore >= 85).length;
    const scope = [ctx.filters.classId ? 'Lớp ' + ctx.filters.classId : ctx.filters.school || 'Mọi lớp của tôi',
      ctx.filters.examName ? shortTest(ctx.filters.examName) : null, { '7': '7 ngày', '30': '30 ngày', '90': '90 ngày' }[ctx.filters.rangeDays] || 'toàn bộ'].filter(Boolean).join(' · ');
    const bandLabel = (h) => { const b = T.BANDS.find((x) => x.id === T.bandOf(h.avgScore)); return b ? b.label : ''; };
    const pill = (h) => {
      const t = trends.get(T.keyNC(h.studentName, h.studentClass));
      return t === 'up' ? '<span class="ti-pill is-up">Tiến bộ</span>' : t === 'down' ? '<span class="ti-pill is-down">Sa sút</span>'
        : h.avgScore >= T.EXCEL ? '<span class="ti-pill is-top">Vượt trội</span>' : '<span class="ti-pill is-ok">Ổn định</span>';
    };
    const person = (h, btn) => `<li class="ti-person"><span class="ti-ava b-${T.bandOf(h.avgScore)}" aria-hidden="true">${esc(initials(h.studentName))}</span>
      <span class="ti-pname"><b>${esc(h.studentName)}</b><small>${esc(h.studentClass || '—')} · <em class="t-${T.bandOf(h.avgScore)}">${esc(bandLabel(h))} ${h.avgScore}%</em> · ${h.attemptsCount || 0} bài</small></span>
      ${btn ? `<button type="button" class="ti-view" data-ti-student="${esc(h.studentName)}" data-ti-class="${esc(h.studentClass || '')}">Xem</button>` : pill(h)}</li>`;
    const topFour = hist.filter((h) => typeof h.avgScore === 'number').sort((a, b) => b.avgScore - a.avgScore || (b.attemptsCount || 0) - (a.attemptsCount || 0)).slice(0, 4);
    const level = gauge.passPct >= 80 ? 'Tốt' : gauge.passPct >= 60 ? 'Khá' : gauge.passPct >= 40 ? 'Trung bình' : 'Cần cố gắng';

    $('tiOverview').innerHTML = `
      <div class="ti-col">
      <div class="ti-card ti-a-stats">
        <div class="ti-head"><h2>Thống kê lớp</h2><span class="ti-scope">${esc(scope)}</span></div>
        <div class="ti-bubbles">
          <div class="ti-bubble"><span class="ti-bub-ic is-blue"><i class="fa-solid fa-users" aria-hidden="true"></i></span><b>${scoped.filteredStudents.length}</b><small>Tổng học sinh</small></div>
          <div class="ti-bubble"><span class="ti-bub-ic is-orange"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i></span><b>${needs}</b><small>Cần hỗ trợ (&lt; 60%)</small></div>
          <div class="ti-bubble"><span class="ti-bub-ic is-green"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span><b>${excel}</b><small>Xuất sắc (≥ 85%)</small></div>
        </div>
        <div class="ti-progress"><span class="ti-prog-ic" aria-hidden="true"><i class="fa-solid fa-list-check"></i></span>
          <div class="ti-prog-body"><small>Tiến độ lớp</small>
            <div class="ti-bar" role="progressbar" aria-valuenow="${gauge.donePct}" aria-valuemin="0" aria-valuemax="100" aria-label="Học sinh đã làm bài"><i style="width:${gauge.donePct}%"></i></div>
            <b>${gauge.donePct}% học sinh đã làm bài</b> <small>(${gauge.total - gauge.notStarted}/${gauge.total})</small></div></div>
      </div>

      <div class="ti-card ti-a-spot">
        <div class="ti-head"><h2>Cần hỗ trợ &amp; Xuất sắc</h2></div>
        <h3 class="ti-h3"><i class="fa-solid fa-circle-exclamation t-red" aria-hidden="true"></i> 3 em cần hỗ trợ nhất</h3>
        <ul class="ti-people">${spot.bottom.length ? spot.bottom.map((h) => person(h, true)).join('') : '<li class="ti-empty">Không có em nào dưới 70% — tuyệt vời!</li>'}</ul>
        <h3 class="ti-h3"><i class="fa-solid fa-star t-yellow" aria-hidden="true"></i> 3 em xuất sắc nhất</h3>
        <ul class="ti-people">${spot.top.length ? spot.top.map((h) => person(h, true)).join('') : '<li class="ti-empty">Chưa có em đạt từ 70%.</li>'}</ul>
      </div>
      </div>
      <div class="ti-col">
      <div class="ti-card ti-a-prof">
        <div class="ti-head"><h2>Năng lực cả lớp</h2><a class="ti-link" href="#studentTableCard">Bảng học sinh <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a></div>
        <p class="ti-sub">Xếp theo điểm trung bình từng em (${prof.total} em có bài)</p>
        <div class="ti-donut-row">
          <div class="ti-donut" style="background:${conic(T.BANDS.map((b) => ({ v: prof.bands[b.id], color: COLORS[b.id] })))}" role="img"
            aria-label="${T.BANDS.map((b) => `${b.label} ${prof.pct[b.id]}%`).join(', ')}"><span>${prof.total}<small>em</small></span></div>
          <ul class="ti-legend">${T.BANDS.map((b) => `<li><i style="background:${COLORS[b.id]}"></i><small>${b.label}${b.min ? ` ≥ ${b.min}` : ' &lt; 50'}</small><b>${prof.pct[b.id]}%</b><em>${prof.bands[b.id]} em</em></li>`).join('')}</ul>
        </div>
        <h3 class="ti-h3">Học sinh tiêu biểu</h3>
        <ul class="ti-people">${topFour.length ? topFour.map((h) => person(h, false)).join('') : '<li class="ti-empty">Chưa có bài nộp trong phạm vi này.</li>'}</ul>
      </div>

      <div class="ti-card ti-a-gauge">
        <div class="ti-head"><h2>Tổng kết tiến độ</h2></div>
        <div class="ti-gauge-row">
          <div class="ti-gauge" style="background:${conic([{ v: gauge.notStarted, color: COLORS.notStarted }, { v: gauge.below, color: COLORS.below }, { v: gauge.pass, color: COLORS.pass }, { v: gauge.excel, color: COLORS.excel }], true)}"
            role="img" aria-label="Đạt trở lên ${gauge.passPct}%"><span>${gauge.passPct}%<small>đạt trở lên</small></span></div>
          <div class="ti-level"><b>${level}</b><small>Mức chung của lớp</small><i class="fa-solid fa-medal" aria-hidden="true"></i></div>
        </div>
        <ul class="ti-gauge-legend">${[['notStarted', 'Chưa làm'], ['below', 'Chưa đạt'], ['pass', 'Đạt'], ['excel', 'Vượt trội']].map(([k, label]) =>
          `<li><b style="color:${k === 'notStarted' ? 'var(--muted)' : COLORS[k]}">${label}</b><small>${gauge[k]} em · ${gauge.total ? Math.round((gauge[k] / gauge.total) * 100) : 0}%</small></li>`).join('')}</ul>
        <p class="ti-note">Chưa đạt &lt; ${T.PASS}% · Đạt ${T.PASS}–${T.EXCEL - 1}% · Vượt trội ≥ ${T.EXCEL}% (điểm TB từng em trong phạm vi lọc)</p>
      </div>
      </div>`;
  }

  // ============================================================
  // GIAO BÀI THEO LỚP — đề từ Soạn đề, tiến độ tính trên bài nộp đã tải
  // ============================================================
  const sets = () => (lsGet('ic3_custom_sets', []) || []).filter((s) => s && s.title && s.link);
  const assigns = () => (lsGet(ASSIGN_KEY, []) || []).filter((a) => a && a.title);
  function classesInScope() {
    const f = ctx.filters;
    return [...new Set(ctx.rawData.students.filter((s) => !f.school || s.school === f.school).map((s) => s.className).filter(Boolean))].sort(byNatural);
  }
  function renderAssign() {
    const list = sets();
    const classes = classesInScope();
    const mine = assigns().filter((a) => !ctx.filters.classId || a.classes.includes(ctx.filters.classId));
    const toLocal = (ms) => { if (!ms) return ''; const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
    const card = $('tiAssign');
    card.innerHTML = `
      <div class="ti-head"><h2><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Giao bài theo lớp</h2><a class="ti-link" href="ic3-dashboard.html#section-builder">Soạn đề <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a></div>
      ${list.length ? `<form class="ti-assign-form" id="tiAssignForm">
        <label class="ti-field"><span>Đề (từ Soạn đề trên máy này)</span><select id="tiSet">${list.map((s, i) => `<option value="${i}">${esc(s.title)}${s.builder && s.builder.deadline ? ` · hạn ${esc(fmtDT(s.builder.deadline))}` : ''}</option>`).join('')}</select></label>
        <label class="ti-field"><span>Hạn nộp</span><input type="datetime-local" id="tiDeadline"></label>
        <fieldset class="ti-classes"><legend>Giao cho lớp</legend>${classes.map((c) => `<label><input type="checkbox" value="${esc(c)}"${ctx.filters.classId === c ? ' checked' : ''}> ${esc(c)}</label>`).join('') || '<small>Chưa có danh sách lớp.</small>'}</fieldset>
        <button type="submit" class="btn ti-btn-primary"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Giao bài</button>
      </form>` : '<p class="ti-empty">Chưa có đề nào trong Soạn đề trên máy này — soạn đề ở Trang quản lý › Soạn đề rồi quay lại giao cho lớp.</p>'}
      <ul class="ti-assigns">${mine.length ? mine.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((a) => {
        const p = T.assignmentProgress(a, ctx.rawData.results, ctx.rawData.students, ctx.keyOf);
        return `<li class="ti-assign" data-ti-assign="${esc(a.id)}">
          <div class="ti-assign-head"><b>${esc(a.title)}</b>
            <span class="ti-pill ${p.overdue ? 'is-down' : 'is-ok'}">${a.deadline ? (p.overdue ? 'Đã quá hạn ' : 'Hạn ') + esc(fmtDT(a.deadline)) : 'Không hạn'}</span>
            <span class="ti-assign-total">${p.total.submitted}/${p.total.roster} em đã nộp · ${p.total.pct}%</span></div>
          <ul class="ti-cls-rows">${p.classes.map((c) => `<li><span class="ti-cls-name">${esc(c.className)}</span>
            <span class="ti-bar"><i style="width:${c.roster ? Math.round((c.submitted / c.roster) * 100) : 0}%"></i></span>
            <span class="ti-cls-meta">${c.submitted}/${c.roster}${c.late ? ` · ${c.late} muộn` : ''}${c.avg != null ? ` · TB ${c.avg}%` : ''}</span></li>`).join('')}</ul>
          <div class="ti-assign-acts">
            <button type="button" class="ti-mini" data-ti-act="msg"><i class="fa-solid fa-copy" aria-hidden="true"></i> Chép lời giao bài</button>
            <button type="button" class="ti-mini" data-ti-act="missing"${p.total.submitted >= p.total.roster ? ' disabled' : ''}><i class="fa-solid fa-copy" aria-hidden="true"></i> Chép tên chưa nộp</button>
            <button type="button" class="ti-mini is-danger" data-ti-act="del"><i class="fa-solid fa-trash" aria-hidden="true"></i> Xoá</button>
          </div></li>`;
      }).join('') : `<li class="ti-empty">${list.length ? 'Chưa giao bài nào' + (ctx.filters.classId ? ' cho lớp này' : '') + '.' : ''}</li>`}</ul>
      <p class="ti-note">Bài đã giao lưu trên máy này. Tiến độ tính trên bài nộp dashboard đã tải — 0 lượt Firebase.</p>`;
    const form = $('tiAssignForm');
    if (!form) return;
    const syncDeadline = () => { const s = list[+$('tiSet').value]; $('tiDeadline').value = toLocal(s && s.builder && s.builder.deadline); };
    syncDeadline();
    $('tiSet').addEventListener('change', syncDeadline);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = list[+$('tiSet').value];
      const cls = [...form.querySelectorAll('.ti-classes input:checked')].map((x) => x.value);
      if (!s || !cls.length) { toast('Chọn ít nhất 1 lớp để giao bài.'); return; }
      const dl = $('tiDeadline').value ? new Date($('tiDeadline').value).getTime() : 0;
      const all = assigns();
      all.push({ id: 'as_' + Date.now(), setId: s.id, title: s.title, link: s.link, classes: cls, deadline: Number.isFinite(dl) ? dl : 0, createdAt: Date.now() });
      if (!lsSet(ASSIGN_KEY, all.slice(-60))) { toast('Không lưu được — bộ nhớ trình duyệt đầy.'); return; }
      renderAssign();
      toast(`Đã giao "${s.title}" cho ${cls.join(', ')} — bấm "Chép lời giao bài" để gửi nhóm lớp.`);
    });
  }
  function onAssignClick(e) {
    const b = e.target.closest('[data-ti-act]');
    const li = b && b.closest('[data-ti-assign]');
    if (!li) return;
    const all = assigns();
    const a = all.find((x) => x.id === li.dataset.tiAssign);
    if (!a) return;
    if (b.dataset.tiAct === 'del') {
      if (!global.confirm(`Xoá bài đã giao "${a.title}"? (Bài nộp của học sinh không bị xoá.)`)) return;
      lsSet(ASSIGN_KEY, all.filter((x) => x !== a)); renderAssign(); return;
    }
    const link = new URL(a.link, location.href).href;
    if (b.dataset.tiAct === 'msg') {
      copy(`📝 Bài tập: ${a.title}\nLớp: ${a.classes.join(', ')}${a.deadline ? `\nHạn nộp: ${fmtDT(a.deadline)}` : ''}\nLàm bài tại: ${link}\nCác em nhập đúng họ tên và lớp khi làm bài nhé!`, 'Đã chép lời giao bài — dán vào nhóm lớp.');
    } else if (b.dataset.tiAct === 'missing') {
      const p = T.assignmentProgress(a, ctx.rawData.results, ctx.rawData.students, ctx.keyOf);
      const lines = p.classes.filter((c) => c.missing.length).map((c) => `Lớp ${c.className} (${c.missing.length}): ${c.missing.join(', ')}`);
      copy([`Các em chưa nộp "${a.title}"${a.deadline ? ` (hạn ${fmtDT(a.deadline)})` : ''}:`].concat(lines, [`Link: ${link}`]).join('\n'), 'Đã chép tên học sinh chưa nộp.');
    }
  }

  // ============================================================
  // SO SÁNH 2 ĐỢT KIỂM TRA — trường/lớp theo bộ lọc, mọi thời gian
  // ============================================================
  function renderRounds() {
    const f = ctx.filters;
    const base = ctx.applyFilters(ctx.rawData, Object.assign({}, f, { examName: '', rangeDays: 'all' })).filteredResults;
    const last = {};
    base.forEach((r) => { if (r.testName) last[r.testName] = Math.max(last[r.testName] || 0, r.submittedAtMs || 0); });
    const tests = Object.keys(last).sort((a, b) => last[b] - last[a]);
    const pref = lsGet(PREF_KEY, {});
    const A = tests.includes(pref.a) ? pref.a : tests[1] || '', B = tests.includes(pref.b) ? pref.b : tests[0] || '';
    const opts = (sel) => tests.map((t) => `<option value="${esc(t)}"${t === sel ? ' selected' : ''}>${esc(shortTest(t))} — ${esc(fmtDT(last[t]).slice(0, 5))}</option>`).join('');
    const card = $('tiRounds');
    if (tests.length < 2) {
      card.innerHTML = `<div class="ti-head"><h2><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> So sánh 2 đợt kiểm tra</h2></div><p class="ti-empty">Cần bài nộp của ít nhất 2 bài thi trong phạm vi trường/lớp đang lọc.</p>`;
      return;
    }
    const cmp = T.compareRounds(base, A, B);
    const max = 100;
    const dTag = (d) => (d == null ? '—' : `<span class="ti-delta ${d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}">${d > 0 ? '+' : ''}${d}</span>`);
    card.innerHTML = `
      <div class="ti-head"><h2><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> So sánh 2 đợt kiểm tra</h2></div>
      <div class="ti-rounds-pick">
        <label class="ti-field"><span><i class="ti-dot is-a"></i> Đợt A</span><select id="tiRoundA">${opts(A)}</select></label>
        <label class="ti-field"><span><i class="ti-dot is-b"></i> Đợt B</span><select id="tiRoundB">${opts(B)}</select></label>
      </div>
      <div class="ti-rounds-sum">
        <div><small>Điểm TB</small><b>${cmp.overall.avgA ?? '—'}% → ${cmp.overall.avgB ?? '—'}%</b>${dTag(cmp.overall.delta)}</div>
        <div><small>Làm cả 2 đợt</small><b>${cmp.students.both} em</b></div>
        <div><small>Tiến bộ / sa sút (±5)</small><b><span class="t-green">${cmp.students.up}</span> / <span class="t-red">${cmp.students.down}</span></b></div>
      </div>
      <ul class="ti-rounds">${cmp.classes.map((c) => `<li><span class="ti-cls-name">${esc(c.className)}</span>
        <span class="ti-dbar"><i class="is-a" style="width:${c.avgA != null ? (c.avgA / max) * 100 : 0}%"></i><i class="is-b" style="width:${c.avgB != null ? (c.avgB / max) * 100 : 0}%"></i></span>
        <span class="ti-cls-meta">${c.avgA ?? '—'} → ${c.avgB ?? '—'} ${dTag(c.delta)}<small>${c.nA}/${c.nB} em</small></span></li>`).join('')}</ul>
      <p class="ti-note">Mỗi em lấy điểm cao nhất của mỗi đợt. Tính trên bài nộp đã tải — 0 lượt Firebase.</p>`;
    const save = () => { lsSet(PREF_KEY, Object.assign(lsGet(PREF_KEY, {}), { a: $('tiRoundA').value, b: $('tiRoundB').value })); renderRounds(); };
    $('tiRoundA').addEventListener('change', save);
    $('tiRoundB').addEventListener('change', save);
  }

  // ============================================================
  // CHUYÊN CẦN — sổ lớp trang Điểm danh đã đọc trên máy này (Google Sheet, không Firebase)
  // ============================================================
  function attendanceClasses() {
    const L = global.EduSoLop;
    const S = lsGet('eduquiz_solop_v1', null);
    if (!L || !S || !Array.isArray(S.links)) return [];
    const out = [];
    S.links.forEach((link) => (link.tabs || []).forEach((tab) => {
      const c = S.cache && S.cache[`${link.id}|${tab.gid}`];
      if (!c || !c.csv) return;
      try {
        const cls = L.parseClass(L.parseCSV(c.csv));
        if (cls) out.push({ className: tab.name, school: link.school || link.label || '', at: c.at, stats: L.stats(cls) });
      } catch (e) { /* tab hỏng — bỏ qua */ }
    }));
    return out;
  }
  function renderAttendance() {
    const low = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    const f = ctx.filters;
    let classes = attendanceClasses();
    if (f.classId) classes = classes.filter((c) => low(c.className) === low(f.classId));
    const sum = T.attendanceSummary(classes);
    const at = Math.max(0, ...classes.map((c) => c.at || 0));
    $('tiAttend').innerHTML = `
      <div class="ti-head"><h2><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Chuyên cần</h2><a class="ti-link" href="diem-danh.html">Điểm danh <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a></div>
      ${sum.classes.length ? `
        <div class="ti-rounds-sum"><div><small>Có mặt trung bình</small><b>${sum.rate ?? '—'}%</b></div><div><small>Lớp có số liệu</small><b>${sum.classes.length}</b></div><div><small>Em cần chú ý</small><b class="${sum.watch ? 't-red' : ''}">${sum.watch}</b></div></div>
        <ul class="ti-rounds">${sum.classes.map((c) => `<li><span class="ti-cls-name">${esc(c.className)}</span>
          <span class="ti-bar ${c.rate != null && c.rate < 85 ? 'is-warn' : ''}"><i style="width:${c.rate ?? 0}%"></i></span>
          <span class="ti-cls-meta">${c.rate != null ? c.rate + '%' : '—'}<small>${c.sessions} buổi</small></span>
          ${c.watch.length ? `<span class="ti-watch">${c.watch.slice(0, 6).map((w) => `<em title="Vắng ${w.vang} buổi${w.lien >= 2 ? `, vắng liền ${w.lien}` : ''}">${esc(w.name)} (${w.vang}${w.lien >= 2 ? `, liền ${w.lien}` : ''})</em>`).join('')}${c.watch.length > 6 ? `<em>+${c.watch.length - 6}</em>` : ''}</span>` : ''}</li>`).join('')}</ul>
        <p class="ti-note">Từ sổ lớp trang Điểm danh đã đọc trên máy này (mới nhất ${esc(fmtDT(at))}). Cần chú ý: vắng ≥ 3 buổi hoặc vắng liền ≥ 2. 0 lượt Firebase.</p>`
      : `<p class="ti-empty">${f.classId ? `Chưa có sổ lớp ${esc(f.classId)} trên máy này.` : 'Chưa có số liệu điểm danh trên máy này.'} Mở <a href="diem-danh.html">Điểm danh</a> → "Cập nhật tất cả" (đọc Google Sheet sổ lớp, không tốn lượt Firebase) rồi quay lại.</p>`}`;
  }

  // ============================================================
  function render(c) {
    ctx = c;
    $('tiOverview').hidden = false;
    $('tiTools').hidden = false;
    renderOverview();
    renderAssign();
    renderRounds();
    renderAttendance();
  }
  function init() {
    if (!$('tiOverview')) return;
    $('tiOverview').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ti-student]');
      if (b && ctx && ctx.openStudent) ctx.openStudent(b.dataset.tiStudent, b.dataset.tiClass);
    });
    $('tiAssign').addEventListener('click', onAssignClick);
    // Soạn đề / Điểm danh mở ở tab khác lưu xong → cập nhật ngay khi quay lại
    global.addEventListener('storage', (e) => {
      if (!ctx) return;
      if (e.key === 'ic3_custom_sets' || e.key === ASSIGN_KEY) renderAssign();
      if (e.key === 'eduquiz_solop_v1') renderAttendance();
    });
  }
  init();

  Object.assign(T, { render });
})(window);
