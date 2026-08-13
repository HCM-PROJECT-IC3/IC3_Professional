/**
 * dashboard-api.js
 * Lớp giao tiếp giữa frontend (Coordinator / Teacher / Admin dashboard) và Apps Script mới.
 * Import file này vào các trang dashboard hiện có, thay cho hàm fetch dữ liệu cũ.
 */

// ⚠️ THAY bằng URL Web App bạn lấy được sau khi Deploy Apps Script (Code.gs)
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyxiqIjwDotYLobFSf11RvosrW9FksEHCQEz8lNm2uU8_8QQJtw9eDM5gBsW_Ga4JLa/exec';

/**
 * Lấy số liệu tổng hợp sẵn để vẽ dashboard (khuyên dùng - đỡ tính toán ở client).
 * role: 'coordinator' | 'teacher' | 'admin'
 * lop: (optional) lọc theo lớp, ví dụ '6A1'
 */
async function fetchDashboardData(role, lop) {
  const params = new URLSearchParams({ action: 'getDashboard', role });
  if (lop) params.set('lop', lop);

  const res = await fetch(`${WEB_APP_URL}?${params.toString()}`);
  const json = await res.json();

  if (!json.ok) throw new Error(json.error || 'Lỗi không xác định từ Apps Script');
  return json.data;
  // json.data = { totalStudents, totalSubmitted, completionRate, avgScore,
  //               distribution: {...}, byQuestionType: {...}, byClass?: [...], roster?: [...] }
}

/** Lấy danh sách học sinh thô (nếu dashboard cần tự xử lý thêm) */
async function fetchRoster(lop) {
  const params = new URLSearchParams({ action: 'getRoster' });
  if (lop) params.set('lop', lop);
  const res = await fetch(`${WEB_APP_URL}?${params.toString()}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

/** Lấy điểm/kết quả thô */
async function fetchScores(lop, baiThi) {
  const params = new URLSearchParams({ action: 'getScores' });
  if (lop) params.set('lop', lop);
  if (baiThi) params.set('baiThi', baiThi);
  const res = await fetch(`${WEB_APP_URL}?${params.toString()}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

/**
 * Ghi báo cáo tổng hợp ra Sheet báo cáo (ví dụ: Coordinator bấm nút "Xuất báo cáo").
 * report: mảng object, key phải KHỚP với hàng tiêu đề (header) của sheet TongHop.
 *
 * Lưu ý quan trọng: Content-Type phải là 'text/plain' (không phải 'application/json')
 * để trình duyệt không gửi CORS preflight (OPTIONS) - Apps Script Web App không xử lý preflight.
 */
async function writeSummaryReport(report) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'writeReport', report })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data; // { rowsWritten: n }
}

// ====== VÍ DỤ TÍCH HỢP VÀO DASHBOARD COORDINATOR HIỆN CÓ ======
//
// async function loadCoordinatorDashboard(lop) {
//   const data = await fetchDashboardData('coordinator', lop);
//
//   // Thay các dòng cũ đọc từ nguồn dữ liệu cũ bằng:
//   renderKPI({
//     completionRate: data.completionRate,
//     avgScore: data.avgScore,
//     totalStudents: data.totalStudents
//   });
//   renderScoreDistributionChart(data.distribution);
//   renderQuestionTypeAccuracyChart(data.byQuestionType);
// }
