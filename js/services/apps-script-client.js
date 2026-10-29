/* ============================================================
   js/services/apps-script-client.js
   Gọi API Apps Script (apps/Code.gs → routes_()) — DÙNG CHUNG cho mọi trang
   quản trị: kết quả dashboard (sheet-results-api.js), bản đồ
   (apps-script-map-distance.js), đẩy dữ liệu lên GitHub (github-publish.js).

   • Tự đính kèm Firebase ID token của người đang đăng nhập (auth: true) —
     Apps Script tự xác thực + phân quyền theo vai trò, không tin gì từ web.
   • Lỗi trả về có err.code giống Firestore ('permission-denied',
     'unauthenticated', 'invalid-argument', 'conflict', 'unavailable',
     'deadline-exceeded'...) để nơi gọi xử lý như lỗi Firebase.

   Trang học sinh KHÔNG dùng file này (gửi bài qua js/googleSheet.js, không đăng nhập).
   Nạp SAU js/backend-config.js và js/firebase-config.js.
   ============================================================ */
(function (global) {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 90 * 1000;

  function defaultUrl() { return (global.EduBackend && global.EduBackend.appsScriptUrl) || ''; }

  async function idToken() {
    const F = global.EduFirebase;
    const user = F && F.auth && F.auth.currentUser;
    if (!user) throw Object.assign(new Error('Chưa đăng nhập.'), { code: 'unauthenticated' });
    return user.getIdToken();
  }

  /**
   * @param {string} action tên API trong apps/Code.gs → routes_()
   * @param {Object} [body]
   * @param {{auth?:boolean, url?:string, timeoutMs?:number}} [opts] auth mặc định true
   * @returns {Promise<*>} json.data
   */
  // Lỗi mạng/máy chủ mang source: 'apps-script' — nơi gọi phân biệt với Firebase hết lượt
  // (cùng code 'unavailable'), tránh báo nhầm "Firebase hết lượt, chờ 14-15h".
  async function call(action, body, opts) {
    const o = Object.assign({ auth: true }, opts);
    const url = o.url || defaultUrl();
    if (!url) throw Object.assign(new Error('Chưa cấu hình EduBackend.appsScriptUrl (js/backend-config.js).'), { code: 'failed-precondition' });
    const payload = Object.assign({ action }, body);
    if (o.auth) payload.idToken = await idToken();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs || DEFAULT_TIMEOUT_MS);
    let json;
    try {
      // text/plain: "simple request", không preflight (Apps Script không xử lý OPTIONS).
      const res = await fetch(url, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      json = await res.json();
    } catch (err) {
      if (err.name === 'AbortError') throw Object.assign(new Error('Apps Script phản hồi quá lâu'), { code: 'deadline-exceeded', source: 'apps-script' });
      // Mất mạng, hoặc Apps Script quá tải trả trang HTML lỗi thay vì JSON.
      // Câu hiện cho người dùng bằng tiếng Việt (trước: lộ "Failed to fetch"); lỗi gốc vẫn ở console.
      console.warn('[EduAppsScript] ' + action + ':', err.message);
      throw Object.assign(new Error('mất kết nối tới máy chủ'), { code: 'unavailable', source: 'apps-script', cause: err });
    } finally {
      clearTimeout(timer);
    }
    if (!json || !json.ok) {
      throw Object.assign(new Error((json && json.error) || 'Apps Script báo lỗi không rõ'), { code: (json && json.code) || 'internal', source: 'apps-script' });
    }
    return json.data;
  }

  global.EduAppsScript = { call, idToken };
})(window);
