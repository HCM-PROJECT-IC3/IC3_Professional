// ====== KIỂM TRA SAU KHI DEPLOY (chạy tay trong editor hoặc menu 🎯 Công cụ IC3) ======
// Dán apps/Code.gs mới → Save → chọn hàm kiemTraSauDeploy → Run → xem "Execution log".
// Ghi 1 bài nộp MẪU (mã SELFTEST...), đọc lại qua listResults_ để chắc cột P ChiTiet được
// ghi/đọc đúng, rồi XOÁ ngay dòng mẫu đó. Không đụng Firestore, không gửi email (status OK).

function kiemTraSauDeploy() {
  const out = [];
  const ok = function (label, cond, detail) { out.push((cond ? '✅ ' : '❌ ') + label + (detail ? ' — ' + detail : '')); return cond; };
  const id = 'SELFTEST' + Date.now();
  let written = false;
  try {
    ok('Phiên bản backend', true, BACKEND_VERSION);
    ok('Có đủ API mới', ['listResults', 'wrongStats', 'arenaRoomLog'].every(function (k) { return !!routes_()[k]; }));

    const res = writeSubmissionLog_({
      submissionId: id, studentName: 'Kiểm tra hệ thống', studentClass: 'SELFTEST', studentSchool: 'SELFTEST',
      testName: 'Kiểm tra › sau › deploy', score: 50, correct: '5/10', time: '01:40', tabSwitch: 0, clickCount: 1,
      status: 'OK', timestamp: '', note: '', examMode: 'test', wrong: '',
      detail: { i: 3, s: 2, e: 100, c: 'Kiểm tra', l: 'sau', m: 'deploy', to: 0, v: [1, 0, 0, 0, 0, 0] },
    });
    written = ok('Ghi bài nộp mẫu', res.written === true);

    const rows = listResults_({ schools: ['SELFTEST'], limit: 5 }, { uid: 'selftest', role: 'admin', schools: null }).rows;
    const r = rows.filter(function (x) { return x.id === id; })[0];
    ok('Đọc lại bài mẫu qua listResults_', !!r);
    ok('Cột P ChiTiet ghi + đọc đúng', !!r && r.incorrect === 3 && r.skipped === 2 && r.elapsedSec === 100 && r.minitest === 'deploy' && r.multiTabHits === 1,
      r ? 'sai=' + r.incorrect + ', bỏ qua=' + r.skipped + ', giây=' + r.elapsedSec : '');

    const sheet = getSubmissionLogSheet_();
    const head = sheet.getRange(1, 1, 1, LOG_HEADERS.length).getDisplayValues()[0];
    ok('Tiêu đề cột P = ChiTiet', head[15] === 'ChiTiet', head[15] || '(trống)');
    ok('Không thừa cột trống (trần 10 triệu ô tính cả ô trống)', sheet.getMaxColumns() === LOG_HEADERS.length, sheet.getMaxColumns() + ' cột');
    const cells = fileCells_(sheet.getParent());
    ok('File nhật ký còn dưới ngưỡng xoay vòng', cells < FILE_CELL_BUDGET, cells.toLocaleString() + ' / ' + FILE_CELL_BUDGET.toLocaleString() + ' ô');
    const a = cachedProp_(LOG_SPREADSHEET_PROP);
    ok('Đọc Script Properties qua cache', a === cachedProp_(LOG_SPREADSHEET_PROP), a ? 'đang ghi file ' + a : 'đang ghi file chính');
  } catch (e) {
    ok('Lỗi khi kiểm tra', false, String(e && e.message || e));
  } finally {
    if (written) {
      const del = deleteResults_({ ids: [id] }, { uid: 'selftest', role: 'admin', schools: null });
      ok('Xoá bài mẫu', del.deleted === 1);
      CacheService.getScriptCache().remove('sub:' + id);
    }
  }
  const text = out.join('\n');
  console.log(text);
  try { SpreadsheetApp.getUi().alert('Kiểm tra sau deploy', text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* chạy trong editor: xem Execution log */ }
  return out;
}
