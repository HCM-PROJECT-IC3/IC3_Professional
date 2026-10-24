/* ============================================================
   js/exam-countdown.js — "Còn N ngày đến kỳ thi" ở sảnh index.html

   Một hàng nhỏ trong .lobby-extras (ngay dưới "Thử thách hôm nay"):
     • Ngày thi: EduBackend.examSeason (thầy cô khai trong js/backend-config.js,
       theo Chương trình đang chọn); chưa khai thì học sinh tự đặt — lưu
       localStorage 'eduquiz_examdate' theo học sinh + chương trình.
     • "Tuần này ôn N/7 ngày": đếm ngày có bài nộp (eduquiz_records) hoặc
       có làm Thử thách hôm nay (eduquiz_daily) của học sinh đang chọn.
     • Gợi ý theo số ngày còn lại (nước rút ≤ 14 ngày: làm bài Kiểm tra).

   Chỉ đọc localStorage + cấu hình tĩnh. 0 Firebase, 0 Apps Script, 0 tải thêm.
   ============================================================ */
(function (global) {
  'use strict';

  const PREF_KEY = 'eduquiz_examdate';
  const $ = (id) => document.getElementById(id);
  function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* chế độ ẩn danh: bỏ qua */ } }

  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function today0() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysLeft(date) { return Math.round((date - today0()) / 864e5); }

  function student() {
    const v = (id) => ($(id)?.value || '').trim();
    const name = v('studentName');
    return {
      name, cls: v('studentClass'), school: v('studentSchool'),
      key: name ? [name, v('studentClass'), v('studentSchool')].map((x) => x.toLowerCase()).join('|') : 'khach',
    };
  }
  function program() { return $('categorySelect')?.value || ''; }

  /** Kỳ thi gần nhất chưa qua: cấu hình của trường trước, rồi tới ngày học sinh tự đặt. */
  function upcomingExam(st, prog) {
    const list = (global.EduBackend?.examSeason || [])
      .filter((e) => e && (!e.program || e.program === prog))
      .map((e) => ({ date: parseDay(e.date), label: String(e.label || 'Kỳ thi'), fixed: true }))
      .filter((e) => e.date && daysLeft(e.date) >= 0)
      .sort((a, b) => a.date - b.date);
    if (list.length) return list[0];
    const own = lsGet(PREF_KEY, {})[`${st.key}|${prog}`];
    const d = parseDay(own);
    return d && daysLeft(d) >= 0 ? { date: d, label: `Kỳ thi ${prog}`.trim(), fixed: false } : null;
  }

  /** Số ngày trong tuần này (thứ Hai → hôm nay) em có ôn bài. */
  function studyDaysThisWeek(st) {
    const t = today0();
    const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const days = new Set();
    const recs = lsGet('eduquiz_records', []);
    (Array.isArray(recs) ? recs : []).forEach((r) => {
      if (st.name && String(r.studentName || '').trim().toLowerCase() !== st.name.toLowerCase()) return;
      const id = Number(r.id) || 0;
      const ms = id > 1e14 ? Math.floor(id / 1000) : id; // rec.id = Date.now()*1000 + ngẫu nhiên
      if (ms >= monday.getTime()) days.add(dayKey(new Date(ms)));
    });
    const daily = lsGet('eduquiz_daily', {})[st.key];
    Object.keys(daily?.results || {}).forEach((k) => {
      const d = parseDay(k.split('|')[0]);
      if (d && d >= monday) days.add(dayKey(d));
    });
    return { n: days.size, of: (t.getDay() + 6) % 7 + 1 };
  }

  function advice(left) {
    if (left === 0) return 'Hôm nay thi. Bình tĩnh, đọc kỹ đề!';
    if (left <= 3) return 'Ôn lại Sổ tay câu sai, ngủ đủ giấc.';
    if (left <= 14) return 'Nước rút: mỗi ngày 1 bài Tổng hợp chế độ Kiểm tra.';
    return 'Mỗi ngày 1 bài + Thử thách hôm nay.';
  }

  function render() {
    const row = $('examCountdown');
    if (!row) return;
    const st = student();
    const prog = program();
    const ex = upcomingExam(st, prog);
    const wk = studyDaysThisWeek(st);
    const dd = ex ? `${ex.date.getDate()}/${ex.date.getMonth() + 1}` : '';
    const left = ex ? daysLeft(ex.date) : 0;
    row.classList.toggle('is-unset', !ex);
    row.classList.toggle('is-near', !!ex && left <= 14);
    row.querySelector('.xc-main').innerHTML = ex
      ? `<b>${left === 0 ? 'Hôm nay' : `Còn ${left} ngày`}</b> <span>${esc(ex.label)} · ${dd}</span>`
      : '<b>Đặt ngày thi</b> <span>· bấm để đếm ngược</span>';
    row.querySelector('.xc-sub').textContent = `Tuần này đã ôn ${wk.n}/${wk.of} ngày` + (ex ? ` · ${advice(left)}` : '');
    const edit = row.querySelector('.xc-edit');
    edit.hidden = !!ex?.fixed;
    edit.title = ex ? 'Đổi ngày thi' : 'Đặt ngày thi';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function editDate() {
    const st = student();
    const prog = program();
    const all = lsGet(PREF_KEY, {});
    const key = `${st.key}|${prog}`;
    const inp = $('examCountdownInput');
    inp.min = dayKey(today0());
    inp.value = all[key] || '';
    inp.hidden = false;
    try { inp.showPicker?.(); } catch (e) { /* trình duyệt cũ: vẫn gõ được */ }
    inp.focus();
    inp.onchange = () => {
      const d = parseDay(inp.value);
      if (d && daysLeft(d) >= 0) all[key] = inp.value; else delete all[key];
      lsSet(PREF_KEY, all);
      inp.hidden = true;
      render();
    };
    inp.onblur = () => { setTimeout(() => { inp.hidden = true; }, 150); };
  }

  function mount() {
    const box = document.querySelector('.lobby-card .lobby-extras');
    if (!box || $('examCountdown')) return;
    const row = document.createElement('div');
    row.id = 'examCountdown';
    row.className = 'exam-countdown';
    row.innerHTML = '<i class="fa-regular fa-calendar xc-ico" aria-hidden="true"></i>'
      + '<div class="xc-text"><div class="xc-main"></div><div class="xc-sub"></div></div>'
      + '<button type="button" class="xc-edit" aria-label="Đặt ngày thi"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>'
      + '<input type="date" id="examCountdownInput" class="xc-input" hidden aria-label="Ngày thi">';
    row.querySelector('.xc-edit').addEventListener('click', editDate);
    row.querySelector('.xc-text').addEventListener('click', () => { if (row.classList.contains('is-unset')) editDate(); });
    const dc = $('dailyChallengeBtn');
    if (dc) dc.after(row); else box.prepend(row);
    ['studentName', 'studentClass', 'studentSchool', 'categorySelect']
      .forEach((id) => $(id)?.addEventListener('change', () => setTimeout(render)));
    global.addEventListener('edu:record-saved', render);
    global.addEventListener('edu:daily-updated', render);
    render();
  }

  // Sau js/daily-challenge.js (cùng defer) để nằm ngay dưới nút Thử thách.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window);
