/* ============================================================
   js/result-pack-ui.js — nút "Lưu kết quả để nộp cho thầy/cô" ở màn Kết quả
   (index.html #resultPack). Đọc mã đã lưu bởi EduResultPack.remember() lúc
   nộp bài (js/services/result-pack.js). 0 mạng, 0 Firebase.
   ============================================================ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function say(t) { const m = $('resultPackMsg'); if (m) m.textContent = t || ''; }

  function init() {
    const P = window.EduResultPack;
    const open = $('btnResultPack');
    if (!P || !open) return;
    const panel = $('resultPackPanel');
    const box = $('resultPackCode');

    open.addEventListener('click', () => {
      const last = P.last();
      if (!last) { panel.hidden = false; box.value = ''; say('Chưa có kết quả nào được lưu trên máy này.'); return; }
      box.value = last.code;
      panel.hidden = !panel.hidden;
      say('');
      if (!panel.hidden) { box.focus(); box.select(); }
    });
    $('btnPackCopy').addEventListener('click', () => {
      box.focus(); box.select();
      const done = () => say('Đã chép mã. Dán vào Zalo hoặc email để gửi thầy/cô.');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, () => { document.execCommand('copy'); done(); });
      else { try { document.execCommand('copy'); done(); } catch (e) { say('Bấm giữ vào ô mã rồi chọn Sao chép.'); } }
    });
    $('btnPackFile').addEventListener('click', () => {
      const last = P.last();
      if (!last) return;
      download('ket-qua-' + P.safeName(last.name) + '.txt', last.code + '\r\n');
      say('Đã tải file. Gửi file này cho thầy/cô.');
    });
    $('btnPackAll').addEventListener('click', () => {
      const all = P.list();
      if (!all.length) { say('Chưa có kết quả nào được lưu trên máy này.'); return; }
      download('ket-qua-tat-ca-' + P.safeName(all[0].name) + '.txt', all.map((x) => x.code).join('\r\n') + '\r\n');
      say('Đã tải ' + all.length + ' kết quả gần nhất trên máy này.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
