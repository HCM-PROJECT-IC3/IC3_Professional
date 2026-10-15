/* ============================================================
   js/services/sheet-results-api.js
   Đọc / xoá kết quả bài nộp từ Google Sheet qua Apps Script (apps/Code.gs →
   listResults_ / deleteResults_) — nguồn thay cho Firestore quiz_results khi
   js/backend-config.js chọn dashboard đọc từ Sheet. 0 lượt đọc Firebase.

   Bảo mật: mỗi lời gọi kèm Firebase ID token của người đang đăng nhập; Apps
   Script tự xác thực và chỉ trả bài thuộc các trường người đó được xem (cùng
   quy tắc firestore.rules). Không đăng nhập thì không đọc được gì.

   Chia Sheet theo trường (EduBackend.quizResults.sheetEndpoints): mỗi trường
   hỏi đúng Apps Script của trường đó, admin xem tất cả thì hỏi mọi Apps Script
   rồi gộp lại.

   Bản ghi trả về cùng dạng dữ liệu quiz_results đã chuẩn hoá (có submittedAtMs)
   nên các dashboard dùng lại nguyên code hiển thị.

   Nạp SAU js/backend-config.js, js/firebase-config.js, js/services/apps-script-client.js.
   ============================================================ */
(function (global) {
  'use strict';

  function cfg() { return global.EduBackend || {}; }

  /** 'sheet' | 'firestore' — nguồn dashboard đang dùng. */
  function readFrom() {
    const b = cfg();
    const r = (b.dashboard && b.dashboard.readFrom) || 'auto';
    if (r === 'sheet' || r === 'firestore') return r;
    return ((b.quizResults && b.quizResults.firestore) || 'all') === 'all' ? 'firestore' : 'sheet';
  }

  // Apps Script đang chạy bản CŨ chưa có listResults (web lên trước khi deploy Apps Script)
  // → trả 'not-found'. Đánh dấu cho cả phiên tab để dashboard tự đọc Firestore thay vì
  // trống trơn; deploy Apps Script xong, mở tab mới là quay lại đọc Sheet.
  const MISSING_KEY = 'eduquiz_sheet_api_missing';
  function apiMissing() { try { return sessionStorage.getItem(MISSING_KEY) === '1'; } catch (e) { return false; } }
  /** @returns {boolean} true nếu lỗi này nghĩa là "Apps Script chưa có API" (đã đánh dấu, nên đọc lại từ Firestore). */
  function noteError(err) {
    if (!err || err.code !== 'not-found') return false;
    try { sessionStorage.setItem(MISSING_KEY, '1'); } catch (e) { /* ignore */ }
    console.warn('[EduSheetResults] Apps Script chưa có API đọc kết quả (cần deploy bản mới apps/Code.gs) — tạm đọc Firestore.');
    return true;
  }

  function enabled() { return readFrom() === 'sheet' && !!cfg().appsScriptUrl && !apiMissing(); }

  /**
   * Nhóm trường theo Apps Script phụ trách.
   * @param {string[]|undefined} schools undefined = mọi trường (admin)
   * @returns {{url:string, schools:(string[]|null)}[]}
   */
  function endpointGroups(schools) {
    const map = (cfg().quizResults && cfg().quizResults.sheetEndpoints) || {};
    const def = cfg().appsScriptUrl;
    if (!schools || !schools.length) {
      return [...new Set([def].concat(Object.values(map)).filter(Boolean))].map((url) => ({ url, schools: null }));
    }
    const byUrl = new Map();
    schools.forEach((s) => {
      const url = map[s] || def;
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url).push(s);
    });
    return [...byUrl].map(([url, list]) => ({ url, schools: list }));
  }

  /**
   * Bài nộp mới nhất trước.
   * @param {Object} o
   * @param {string[]} [o.schools]   bỏ trống = mọi trường được phép
   * @param {string[]} [o.classes]
   * @param {number}   [o.sinceMs]   chỉ lấy bài nộp từ thời điểm này (tải tăng dần)
   * @param {number}   [o.limit=1000]
   * @param {string}   [o.studentName] lọc đúng 1 học sinh (so không phân biệt hoa/thường)
   */
  async function list({ schools, classes, sinceMs, limit = 1000, studentName } = {}) {
    const parts = await Promise.all(endpointGroups(schools).map((g) => global.EduAppsScript.call('listResults',
      { schools: g.schools, classes, sinceMs, limit, studentName }, { url: g.url })));
    if (parts.some((p) => p && p.truncated)) {
      console.warn('[EduSheetResults] Apps Script dừng quét sớm (quá nhiều dòng) — dữ liệu cũ hơn có thể chưa đủ.');
    }
    return parts.flatMap((p) => (p && p.rows) || [])
      .sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0))
      .slice(0, limit);
  }

  /** Xoá bài theo mã ở mọi Apps Script (chỉ Admin/Điều phối). @returns {Promise<number>} số bài đã xoá */
  async function remove(ids) {
    const parts = await Promise.all(endpointGroups().map((g) => global.EduAppsScript.call('deleteResults', { ids }, { url: g.url })));
    return parts.reduce((n, p) => n + ((p && p.deleted) || 0), 0);
  }

  /**
   * "Câu cả lớp hay sai" — Apps Script tổng hợp cột CauSai trên server (wrongStats_),
   * ở đây chỉ gộp khi Sheet chia theo trường. Gọi được bất kể dashboard đọc kết quả từ
   * Firestore hay Sheet (câu sai chỉ nằm trên Sheet). 0 lượt đọc Firestore cho dữ liệu.
   * @returns {Promise<{submissions:number, withData:number, truncated:boolean, items:{uid,count,students,tests}[]}>}
   */
  async function wrongStats({ schools, classes, sinceMs, testName } = {}) {
    const parts = await Promise.all(endpointGroups(schools).map((g) => global.EduAppsScript.call('wrongStats',
      { schools: g.schools, classes, sinceMs, testName }, { url: g.url })));
    const byUid = new Map();
    const out = { submissions: 0, withData: 0, truncated: false, items: [] };
    parts.forEach((p) => {
      if (!p) return;
      out.submissions += p.submissions || 0;
      out.withData += p.withData || 0;
      out.truncated = out.truncated || !!p.truncated;
      (p.items || []).forEach((it) => {
        const e = byUid.get(it.uid);
        if (!e) byUid.set(it.uid, Object.assign({}, it, { tests: (it.tests || []).slice() }));
        else {
          e.count += it.count; e.students += it.students;
          (it.tests || []).forEach((t) => { if (!e.tests.includes(t)) e.tests.push(t); });
        }
      });
    });
    out.items = [...byUid.values()].sort((a, b) => (b.count - a.count) || (b.students - a.students));
    return out;
  }

  global.EduSheetResults = { enabled, readFrom, list, remove, endpointGroups, wrongStats, noteError };
})(window);
