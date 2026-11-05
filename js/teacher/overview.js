/* ============================================================
   js/teacher/overview.js — màn "Tổng quan" của trang quản lý (ic3-dashboard.html).
   Việc của giáo viên trong tuần ở 1 chỗ: số liệu chính, lịch dạy, học sinh cần chú ý, tiến độ từng lớp.
   Chỉ đọc localStorage (sổ lớp của Điểm danh, sổ đầu bài): 0 lượt Firebase, 0 lượt Apps Script.
   Sổ lớp của tài khoản khác trên máy dùng chung thì bỏ qua. Số liệu tính ở js/teacher/overview-core.js.
   ============================================================ */
(function (global) {
  'use strict';

  const SOLOP = 'eduquiz_solop_v1';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { done: 'Đã dạy', planned: 'Chưa tick hoàn thành', expected: 'Dự kiến' };
  const dm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  let me = { uid: '', name: '' };

  function read() {
    let store = {};
    try { store = JSON.parse(localStorage.getItem(SOLOP)) || {}; } catch (e) { store = {}; }
    if (store.owner && store.owner !== me.uid) store = {};
    return global.EduOverviewCore.build({
      store, books: global.EduSdbSources.listBooks(localStorage, me.uid), teacher: store.me || me.name, now: new Date(),
      L: global.EduSoLop, SRC: global.EduSdbSources,
    });
  }

  const tile = (icon, value, label, note) => `<div class="ov-tile"><span class="ov-tile-ico"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
    <div><b>${value}</b><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div></div>`;

  function weekList(week) {
    if (!week.length) return '<p class="ov-empty">Tuần này chưa có buổi nào trên sổ lớp.</p>';
    const days = [...new Set(week.map((e) => e.date.getTime()))];
    return days.map((t) => {
      const d = new Date(t), items = week.filter((e) => e.date.getTime() === t);
      return `<div class="ov-day${items[0].today ? ' is-today' : ''}"><div class="ov-date"><span>${global.EduSoLop.THU[d.getDay()]}</span><b>${dm(d)}</b></div>
        <ul>${items.map((e) => `<li class="k-${e.kind}"><b>${esc(e.name)}</b> <small>${esc(e.school)}</small>
          <span>${e.tiet.length ? `Tiết ${e.tiet.join(', ')}` : 'Tiết kế tiếp'}${e.bai.length ? ' · ' + esc(e.bai.join(' · ')) : ''}</span><em>${KIND[e.kind]}</em></li>`).join('')}</ul></div>`;
    }).join('');
  }

  function render() {
    const root = document.getElementById('overviewRoot');
    if (!root) return;
    const r = read(), k = r.kpi;
    const actions = `<section class="ov-card"><h3>Thao tác nhanh</h3><div class="ov-actions">
      <a href="diem-danh.html" target="_blank" rel="noopener"><i class="fa-solid fa-clipboard-user" aria-hidden="true"></i> Điểm danh</a>
      <a href="so-dau-bai.html" target="_blank" rel="noopener"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i> Sổ đầu bài</a>
      <button type="button" data-nav="navBuilder"><i class="fa-solid fa-file-pen" aria-hidden="true"></i> Soạn đề</button>
      <a href="goi-ten.html" target="_blank" rel="noopener"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> Gọi tên</a>
    </div></section>`;
    const hello = `<h2 class="ov-hello">Xin chào${me.name ? ', ' + esc(me.name) : ''}</h2>`;
    if (!r.hasData) {
      root.innerHTML = `${hello}<div class="ov-grid"><section class="ov-card ov-start"><h3>${r.unmatched ? 'Chưa thấy lớp mang tên của bạn' : 'Chưa có sổ lớp trên máy này'}</h3>
        <p>${r.unmatched ? 'Máy này đã đọc sổ lớp nhưng tên trên Sheet khác tên tài khoản. Mở Điểm danh, thẻ Cài đặt, sửa "Tên của tôi" cho đúng ô TÊN GV.' : 'Mở Điểm danh và bấm "Cập nhật tất cả" để đọc sổ lớp. Lịch dạy, chuyên cần và tiến độ sẽ hiện ở đây.'}</p>
        <a class="ov-go" href="diem-danh.html" target="_blank" rel="noopener">Mở Điểm danh</a></section>${actions}</div>`;
      return;
    }
    const show = r.progress.slice(0, 8);
    root.innerHTML = `${hello}
      <div class="ov-tiles">
        ${tile('fa-school', k.classes, 'Lớp của tôi')}
        ${tile('fa-calendar-days', `${k.tietDone}<small>/${k.tietWeek}</small>`, 'Tiết tuần này', 'đã tick hoàn thành')}
        ${tile('fa-clipboard-user', k.rate == null ? '–' : k.rate + '%', 'Chuyên cần', 'tất cả buổi đã điểm danh')}
        ${tile('fa-book-bookmark', k.unwritten == null ? '–' : k.unwritten, 'Buổi chưa ghi sổ', k.unwritten == null ? 'chưa dùng Sổ đầu bài' : 'trong tuần này')}
      </div>
      <div class="ov-grid">
        <section class="ov-card ov-week"><h3>Lịch tuần này</h3>${weekList(r.week)}</section>
        <div class="ov-side">
          ${actions}
          <section class="ov-card"><h3>Học sinh cần chú ý${r.watch.length ? ` <small>${r.watch.length}</small>` : ''}</h3>
            ${r.watch.length ? `<ul class="ov-watch">${r.watch.slice(0, 6).map((w) => `<li><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><div><b>${esc(w.name)}</b><small>${esc(w.cls)} · ${esc(w.school)} · vắng ${w.vang} tiết${w.lien >= 2 ? `, ${w.lien} tiết liền` : ''}</small></div></li>`).join('')}</ul>`
              : '<p class="ov-empty">Chưa có bạn nào vắng nhiều.</p>'}
          </section>
        </div>
        <section class="ov-card ov-progress"><h3>Tiến độ các lớp${r.progress.length > show.length ? ` <small>${show.length} lớp chậm nhất / ${r.progress.length}</small>` : ''}</h3>
          <ul>${show.map((p) => `<li title="${esc(p.school)}: đã dạy ${p.done}/${p.total} tiết"><span class="ov-pname"><b>${esc(p.name)}</b> <small>${esc(p.school)}</small></span>
            <span class="ov-meter" role="img" aria-label="${esc(p.name)} đã dạy ${p.done} trên ${p.total} tiết"><i style="width:${p.pct}%"></i></span><span class="ov-pval">${p.done}/${p.total}</span></li>`).join('')}</ul>
        </section>
      </div>`;
  }

  /** Gọi sau edu:ready. → true nếu máy có số liệu (khi đó mở Tổng quan làm màn đầu). */
  function init(user) {
    me = user;
    const root = document.getElementById('overviewRoot');
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) document.getElementById(b.dataset.nav)?.click(); });
    document.getElementById('navOverview')?.addEventListener('click', render);
    global.addEventListener('storage', (e) => { if (e.key === SOLOP || String(e.key).startsWith('sodaubai_v1')) render(); });
    render();
    return read().hasData;
  }

  global.EduTeacherOverview = { init };
})(window);
