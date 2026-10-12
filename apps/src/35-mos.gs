// ====== KẾT QUẢ MOS PRACTICE (công khai — học sinh không đăng nhập) ======
// Router: mosSubmit. Xem js/mos-submissions.js (phía web). Trước đây mỗi bài MOS ghi 1
// lượt Firestore (mos_submissions) mà không trang nào đọc lại — nay vào tab NhatKyMOS
// để giáo viên mở Sheet là xem/lọc được, 0 lượt Firebase.

const SHEET_MOS_LOG = 'NhatKyMOS';
const MOS_HEADERS = ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'DuAn', 'MaDuAn', 'Diem',
  'TaskDung', 'TaskTuCham', 'TaskThuCong', 'ThoiGianNop', 'ChiTiet'];

function validateMosSubmission_(p) {
  const bad = function (msg) { throw appError_('invalid-argument', 'Bài MOS không hợp lệ: ' + msg); };
  if (!p || typeof p !== 'object') bad('thiếu dữ liệu');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(p.submissionId || ''))) bad('submissionId');
  [['studentName', 120], ['studentClass', 40], ['studentSchool', 160], ['projectId', 120], ['projectTitle', 300]]
    .forEach(function (f) {
      const v = p[f[0]];
      if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f[1])) bad(f[0]);
    });
  if (!String(p.studentName || '').trim()) bad('studentName');
  if (p.score !== null && p.score !== undefined && !(Number(p.score) >= 0 && Number(p.score) <= 100)) bad('score');
  if (p.results !== undefined && (!Array.isArray(p.results) || p.results.length > 200)) bad('results');
}

/** p: payload như js/mos-submissions.js dựng (studentName, ..., score, results[]). */
function writeMosLog_(p) {
  validateMosSubmission_(p);
  const cache = CacheService.getScriptCache();
  const dedupeKey = 'mos:' + p.submissionId;
  if (cache.get(dedupeKey)) return { written: false, duplicate: true };

  // Chỉ giữ phần cần cho giáo viên xem lại, cắt ngắn để 1 ô không vượt 50.000 ký tự.
  const detail = JSON.stringify((p.results || []).map(function (r) {
    return { id: r.id, label: String(r.label || '').slice(0, 200), passed: r.passed, manual: !!r.manual,
      note: String(r.note || '').slice(0, 200) };
  })).slice(0, 45000);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (cache.get(dedupeKey)) return { written: false, duplicate: true };
    const sheet = ensureTab_(SPREADSHEET_ID_REPORT, SHEET_MOS_LOG, MOS_HEADERS);
    sheet.appendRow([
      asText_(p.submissionId), asText_(p.studentName), asText_(p.studentClass), asText_(p.studentSchool),
      asText_(p.projectTitle), asText_(p.projectId),
      // score null = không có task tự chấm (toàn thủ công) — để trống thay vì 0.
      p.score === null || p.score === undefined ? '' : Number(p.score),
      Number(p.passedCount) || 0, Number(p.autoTotal) || 0, Number(p.manualCount) || 0,
      new Date(), asText_(detail),
    ]);
    cache.put(dedupeKey, '1', DEDUPE_TTL_SEC);
  } finally {
    lock.releaseLock();
  }
  return { written: true, duplicate: false };
}
