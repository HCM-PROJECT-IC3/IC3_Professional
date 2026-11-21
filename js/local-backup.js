/* ============================================================
   js/local-backup.js — "Sao lưu tất cả dữ liệu trên máy" (thẻ Cài đặt của ic3-dashboard.html).
   Nhiều công cụ của giáo viên chỉ lưu trên máy (localStorage): Sổ đầu bài, Đơn nghỉ phép, Điểm danh, Gọi tên,
   Thi đua, Bộ đề tự soạn, Giao bài, Gom kết quả… Đổi máy / xoá dữ liệu trình duyệt là mất.
   1 nút gom mọi thứ vào 1 file .json; 1 nút khôi phục. Không gửi đi đâu — 0 Firebase, 0 Apps Script.
   Chỉ lấy khoá thuộc danh sách PREFIX bên dưới (không đụng phiên đăng nhập, cache Firebase, bản đọc Sheet tạm).
   ============================================================ */
(function (global) {
  'use strict';

  // Tiền tố khoá thuộc dữ liệu của giáo viên (thêm công cụ mới lưu localStorage thì thêm vào đây)
  const PREFIX = [
    { p: 'sodaubai_', name: 'Sổ đầu bài' },
    { p: 'nghiphep_', name: 'Đơn nghỉ phép' },
    { p: 'eduquiz_solop', name: 'Điểm danh / sổ lớp' },
    { p: 'eduquiz_tkb', name: 'Thời khóa biểu' },
    { p: 'eduquiz_goiten', name: 'Gọi tên' },
    { p: 'eduquiz_thidua', name: 'Thi đua lớp học' },
    { p: 'ic3_custom_sets', name: 'Bộ đề tự soạn' },
    { p: 'eduquiz_assign', name: 'Giao bài theo lớp' },
    { p: 'eduquiz_gom_ket_qua', name: 'Gom kết quả' },
    { p: 'eduquiz_insights', name: 'Tổng quan lớp' },
    { p: 'ic3_dash_prefs', name: 'Tuỳ chọn trang quản lý' },
  ];
  const groupOf = (k) => PREFIX.find((x) => k.indexOf(x.p) === 0);

  function collect() {
    const data = {}, groups = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), g = groupOf(k);
      if (!g) continue;
      data[k] = localStorage.getItem(k);
      groups[g.name] = (groups[g.name] || 0) + 1;
    }
    return { data, groups };
  }

  function exportAll() {
    const { data, groups } = collect();
    if (!Object.keys(data).length) return say('Máy này chưa có dữ liệu nào để sao lưu.');
    const file = { kind: 'eduquiz-local-backup', v: 1, at: new Date().toISOString(), groups, data };
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `EduQuiz_sao-luu_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    try { localStorage.setItem('eduquiz_backup_at', String(Date.now())); } catch (e) { /* bỏ qua */ }
    say(`Đã tải file sao lưu: ${Object.entries(groups).map(([n, c]) => n).join(', ')}.`);
    paint();
  }

  function importAll(fileObj) {
    const rd = new FileReader();
    rd.onload = () => {
      let f;
      try { f = JSON.parse(rd.result); } catch (e) { return say('File không đọc được — chọn đúng file EduQuiz_sao-luu_….json'); }
      if (!f || f.kind !== 'eduquiz-local-backup' || !f.data || typeof f.data !== 'object') return say('Đây không phải file sao lưu của EduQuiz.');
      const keys = Object.keys(f.data).filter((k) => groupOf(k) && typeof f.data[k] === 'string');
      if (!keys.length) return say('File sao lưu không có dữ liệu.');
      const clash = keys.filter((k) => localStorage.getItem(k) !== null && localStorage.getItem(k) !== f.data[k]).length;
      const when = f.at ? new Date(f.at).toLocaleString('vi-VN') : '';
      if (!confirm(`Khôi phục ${keys.length} mục từ bản sao lưu ${when}?` + (clash ? `\n\n${clash} mục đang có trên máy này sẽ bị THAY bằng bản trong file.` : ''))) return;
      let n = 0;
      keys.forEach((k) => { try { localStorage.setItem(k, f.data[k]); n++; } catch (e) { /* hết chỗ */ } });
      say(n === keys.length ? `Đã khôi phục ${n} mục. Mở lại các trang (Sổ đầu bài, Điểm danh…) để thấy dữ liệu.` : `Khôi phục được ${n}/${keys.length} mục — bộ nhớ trình duyệt đầy.`);
      paint();
    };
    rd.readAsText(fileObj);
  }

  function say(msg) {
    const el = document.getElementById('lbStatus');
    if (el) el.textContent = msg;
  }

  function paint() {
    const box = document.getElementById('lbSummary');
    if (!box) return;
    const { data, groups } = collect();
    const at = +localStorage.getItem('eduquiz_backup_at') || 0;
    const days = at ? Math.floor((Date.now() - at) / 864e5) : null;
    box.innerHTML = Object.keys(data).length
      ? `<p class="settings-note">Trên máy này có: <b>${Object.entries(groups).map(([n, c]) => n).join(', ')}</b>.
         ${days == null ? '<span style="color:var(--orange,#c2410c)">Chưa sao lưu lần nào.</span>' : days === 0 ? 'Đã sao lưu hôm nay.' : `Lần sao lưu gần nhất: ${days} ngày trước.`}</p>`
      : '<p class="settings-note">Máy này chưa có dữ liệu công cụ nào (Sổ đầu bài, Điểm danh, Nghỉ phép…).</p>';
  }

  function init() {
    const card = document.getElementById('lbCard');
    if (!card) return;
    document.getElementById('lbExport').addEventListener('click', exportAll);
    const inp = document.getElementById('lbImport');
    document.getElementById('lbImportBtn').addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => { if (inp.files[0]) importAll(inp.files[0]); inp.value = ''; });
    paint();
  }

  global.EduLocalBackup = { collect, exportAll, PREFIX };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
