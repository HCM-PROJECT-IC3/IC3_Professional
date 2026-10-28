/* ============================================================
   js/services/apps-script-map-distance.js
   Khoảng cách đường bộ (km) từ địa chỉ nhà giáo viên tới trường — tab
   "Hỗ trợ xăng xe" (js/teaching-schedule-travel.js).

   Gọi Apps Script (apps/Code.gs → mapDistance_), dùng dịch vụ Maps có sẵn của
   Google: dữ liệu bản đồ Google ở Việt Nam (tới số nhà/hẻm), không cần API key
   hay thẻ ngân hàng. Thay cho js/services/free-map-distance.js (máy chủ demo
   OpenStreetMap: tối đa 1 lượt/giây, thiếu số nhà trong hẻm).

   Giới hạn: mỗi người ~150 lượt tính/ngày (hạn mức bản đồ chung của tài khoản
   Google chạy Apps Script) — kết quả giống nhau được Apps Script nhớ 6 giờ.

   Nạp SAU js/services/apps-script-client.js.
   ============================================================ */
(function (global) {
  'use strict';

  /**
   * @param {string} origin Địa chỉ nhà giáo viên — dùng NGUYÊN VĂN.
   * @param {string} destination Tên trường (kèm thành phố).
   * @returns {Promise<{km:number, matchedSchoolAddress:string|null, approximateHome:boolean}|null>}
   *   null = không định vị được nhà hoặc trường.
   */
  async function computeDistanceKm(origin, destination) {
    if (!origin || !destination) throw new Error('Thiếu địa chỉ nhà hoặc tên trường.');
    return global.EduAppsScript.call('mapDistance', { origin, destination }, { timeoutMs: 45 * 1000 });
  }

  global.EduMapDistance = { computeDistanceKm };
})(window);
