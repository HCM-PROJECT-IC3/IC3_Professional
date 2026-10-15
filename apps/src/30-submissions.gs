// ====== GHI BÀI NỘP (công khai — học sinh không đăng nhập) ======
// Router: action 'submitExam'. Xem js/googleSheet.js (phía web).

/**
 * API này công khai (học sinh không đăng nhập) → chặn dữ liệu rác/quá khổ trước khi
 * ghi. Lỗi mã 'invalid-argument': web bỏ bài khỏi hàng đợi thay vì gửi lại mãi.
 */
function validateSubmission_(p) {
  const bad = function (msg) { throw appError_('invalid-argument', 'Bài nộp không hợp lệ: ' + msg); };
  if (!p || typeof p !== 'object') bad('thiếu dữ liệu');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(p.submissionId || ''))) bad('submissionId');
  [['studentName', 120], ['studentClass', 40], ['studentSchool', 160], ['testName', 300],
    ['correct', 20], ['time', 20], ['status', 300], ['note', 500], ['timestamp', 60]].forEach(function (f) {
    const v = p[f[0]];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f[1])) bad(f[0]);
  });
  if (!String(p.studentName || '').trim()) bad('studentName');
  const score = Number(p.score);
  if (p.score !== undefined && p.score !== '' && !(score >= 0 && score <= 100)) bad('score');
  ['tabSwitch', 'clickCount'].forEach(function (k) {
    if (p[k] !== undefined && p[k] !== '' && !(Number(p[k]) >= 0 && Number(p[k]) < 1e6)) bad(k);
  });
  if (p.examMode && ['practice', 'test'].indexOf(p.examMode) === -1) bad('examMode');
  // CauSai: "uid1,uid2" — uid ngân hàng câu hỏi (ic3__lv1__t1__q1; MOS có dấu/khoảng trắng),
  // cấm ký tự HTML/xuống dòng; khớp UID_RE ở js/services/result-submitter.js.
  if (p.wrong !== undefined && p.wrong !== null && p.wrong !== '') {
    if (typeof p.wrong !== 'string' || p.wrong.length > 2700) bad('wrong');
    const uids = p.wrong.split(',');
    if (uids.length > WRONG_MAX_UIDS || uids.some(function (u) { return !/^[^,<>"'`&\r\n]{3,80}$/.test(u); })) bad('wrong');
  }
  if (p.detail !== undefined && p.detail !== null) p.detail = cleanDetail_(p.detail, bad);
}

/**
 * Cột P ChiTiet (js/services/result-submitter.js → detail): chỉ giữ đúng các khoá biết
 * trước, số trong giới hạn, chữ ngắn → JSON gọn ≤ ~600 ký tự. Sai kiểu → từ chối bài.
 */
function cleanDetail_(d, bad) {
  if (typeof d !== 'object' || Array.isArray(d)) bad('detail');
  const n = function (v, max) {
    const x = Number(v);
    if (v !== undefined && v !== null && !(x >= 0 && x <= max)) bad('detail');
    return Math.round(x || 0);
  };
  const t = function (v) {
    if (v !== undefined && v !== null && typeof v !== 'string') bad('detail');
    return String(v || '').slice(0, 160);
  };
  const v = Array.isArray(d.v) ? d.v.slice(0, 6) : [];
  return {
    i: n(d.i, 10000), s: n(d.s, 10000), e: n(d.e, 864000),
    c: t(d.c), l: t(d.l), m: t(d.m), to: d.to ? 1 : 0,
    v: v.map(function (x) { return n(x, 1e6); }),
  };
}

/**
 * Ghi 1 dòng log nộp bài (đối chiếu/dự phòng) — tương đương vai trò của
 * Apps Script cũ mà js/googleSheet.js từng gọi, nhưng chuẩn hoá lại theo
 * router chung của file này. Chống ghi trùng bằng submissionId (khoá lock
 * để tránh 2 request cùng lúc ghi trùng khi mạng chập chờn gửi lại).
 *
 * payload khớp với payload gửi từ js/googleSheet.js:
 * { submissionId, studentName, studentClass, studentSchool, testName,
 *   score, correct, time, tabSwitch, clickCount, status, timestamp, note, examMode, wrong, detail }
 */
function writeSubmissionLog_(payload) {
  validateSubmission_(payload);

  // Chống trùng bằng CacheService (giữ mã đã ghi 6 giờ — DEDUPE_TTL_SEC) thay cho đọc
  // lại TOÀN BỘ cột SubmissionId mỗi lượt nộp: cách cũ chậm dần theo số dòng (100.000
  // dòng = đọc 100.000 ô mỗi bài, trong lúc giữ khoá chung) → mùa ôn thi các lượt nộp
  // xếp hàng chờ khoá rồi hết giờ. Gửi lại từ hàng đợi phía học sinh dùng cùng mã
  // (js/services/result-submitter.js) và thường diễn ra trong vài phút - vài giờ.
  const cache = CacheService.getScriptCache();
  const dedupeKey = 'sub:' + String(payload.submissionId).slice(0, 200);
  if (cache.get(dedupeKey)) return { written: false, duplicate: true };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // chỉ giữ khoá trong lúc chọn file + appendRow (rất ngắn)

  try {
    if (cache.get(dedupeKey)) return { written: false, duplicate: true }; // request song song vừa ghi xong
    const sheet = getSubmissionLogSheet_();
    // asText_(): giữ NGUYÊN chữ — trước đây Sheet tự đổi "7/24" (số câu đúng), lớp
    // "3/12", thời gian "5:05" thành ngày/giờ, và tên bắt đầu bằng "=" thành công thức.
    sheet.appendRow([
      asText_(payload.submissionId),
      asText_(payload.studentName),
      asText_(payload.studentClass),
      asText_(payload.studentSchool),
      asText_(payload.testName),
      payload.score         ?? '',
      asText_(payload.correct),
      asText_(payload.time),
      payload.tabSwitch     ?? '',
      payload.clickCount    ?? '',
      asText_(payload.status),
      new Date(), // Dùng giờ server (đáng tin cậy hơn giờ máy học sinh) - lưu dạng Date thật để sort/lọc được
      asText_(payload.note),
      asText_(payload.examMode), // N — CheDo: 'practice' (Ôn luyện) | 'test' (Kiểm tra); bài cũ để trống
      // O — CauSai: uid câu sai "a,b,c"; "-" = không sai câu nào; trống = web cũ chưa gửi.
      payload.wrong === '' ? '-' : asText_(payload.wrong),
      payload.detail ? JSON.stringify(payload.detail) : '' // P — ChiTiet (đã lọc ở cleanDetail_)
    ]);
    cache.put(dedupeKey, '1', DEDUPE_TTL_SEC);
  } finally {
    lock.releaseLock();
  }

  // Cảnh báo gian lận qua email — CHỈ khi có dấu ⚠️ trong status (do
  // js/googleSheet.js gắn khi integrity.valid == false), và chỉ với
  // dòng MỚI ghi (bản trùng đã return ở trên). Ngoài khoá để không giữ
  // khoá trong lúc gửi mail; lỗi gửi mail không làm mất dòng log đã ghi.
  if (payload.status && String(payload.status).indexOf('⚠️') !== -1) {
    sendCheatAlertEmail_(payload);
  }

  return { written: true, duplicate: false };
}

/**
 * Tab nhật ký đang nhận bài nộp. Mỗi file Google Sheet tối đa 10 triệu ô (mọi tab
 * cộng lại); 13 cột × 100.000 bài/ngày đầy 1 file sau ~1 tuần. Khi tab hiện tại
 * vượt MAX_LOG_ROWS dòng, tự tạo FILE MỚI "NhatKyNopBai <ngày>" (cùng dòng tiêu đề),
 * ghi tiếp vào đó và thêm 1 dòng vào tab DanhMucNhatKy của file chính để tra cứu.
 * Chưa có file mới nào thì dùng tab NhatKyNopBai của file chính như trước.
 * Gọi BÊN TRONG khoá của writeSubmissionLog_().
 */
function getSubmissionLogSheet_() {
  const currentId = cachedProp_(LOG_SPREADSHEET_PROP); // qua cache — xem cachedProp_ (quota Properties)
  const sheet = currentId
    ? SpreadsheetApp.openById(currentId).getSheetByName(SHEET_SUBMISSION_LOG)
    : SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_SUBMISSION_LOG);
  if (!sheet) {
    throw new Error('Chưa có tab "' + SHEET_SUBMISSION_LOG + '" trong Sheet báo cáo — xem HUONG_DAN.md để tạo.');
  }
  ensureLogSheetLayout_(sheet);
  if (!logTabFull_(sheet)) return sheet; // đầy theo số dòng HOẶC file sắp chạm trần 10 triệu ô

  const made = newLogFile_(SHEET_SUBMISSION_LOG, LOG_HEADERS);
  setCachedProp_(LOG_SPREADSHEET_PROP, made.file.getId());
  // Lịch sử file đọc thẳng Properties (không qua cache) để không mất file nào khi ghi lại.
  const history = JSON.parse(PropertiesService.getScriptProperties().getProperty(LOG_HISTORY_PROP) || '[]');
  history.push(made.file.getId());
  setCachedProp_(LOG_HISTORY_PROP, JSON.stringify(history));
  ensureLogSheetLayout_(made.sheet);
  return made.sheet;
}

/**
 * Tiêu đề các cột thêm sau (N CheDo, O CauSai...) + định dạng giờ nộp (L) kiểu Việt Nam.
 * Chạy tối đa 1 lần/6 giờ cho mỗi tab (cờ trong CacheService) — không tốn thêm thời
 * gian cho từng bài nộp.
 */
function ensureLogSheetLayout_(sheet) {
  const cache = CacheService.getScriptCache();
  const flag = 'layout:' + sheet.getParent().getId();
  if (cache.get(flag)) return;
  const head = sheet.getRange(1, 1, 1, LOG_HEADERS.length).getDisplayValues()[0];
  LOG_HEADERS.forEach(function (h, i) {
    if (i >= 13 && !head[i]) sheet.getRange(1, i + 1).setValue(h); // chỉ cột thêm sau, không đè tiêu đề cũ
  });
  sheet.getRange('L2:L').setNumberFormat('HH:mm:ss d/M/yyyy');
  const max = sheet.getMaxColumns(); // cột trống thừa vẫn tính vào trần 10 triệu ô/file
  if (max > LOG_HEADERS.length) sheet.deleteColumns(LOG_HEADERS.length + 1, max - LOG_HEADERS.length);
  cache.put(flag, '1', DEDUPE_TTL_SEC);
}

/**
 * Giữ nguyên chữ khi ghi vào Sheet: thêm dấu ' trước giá trị mà Sheet sẽ tự đổi
 * (dạng số/ngày/giờ như "7/24", "3/12", "5:05") hoặc hiểu thành công thức (bắt đầu
 * bằng = + - @). Dấu ' không hiện trong ô và không có trong giá trị đọc ra.
 */
function asText_(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@]/.test(s) || /^[\d\s\/.:,-]+$/.test(s) ? "'" + s : s;
}

/**
 * Gửi email cảnh báo 1 lượt nộp bài bị nghi vấn gian lận, có throttle
 * (ALERT_EMAIL_MAX_PER_HOUR) để không bao giờ vượt quota MailApp free.
 * Lỗi ở đây (mail quota hết, ALERT_EMAILS rỗng...) chỉ log, KHÔNG throw —
 * đây là tính năng "thêm", không được phép làm hỏng luồng ghi log chính.
 */
function sendCheatAlertEmail_(payload) {
  try {
    if (!ALERT_EMAILS || ALERT_EMAILS.length === 0) return;

    const cache = CacheService.getScriptCache();
    const bucketKey = 'cheatAlertCount_' + Math.floor(Date.now() / (60 * 60 * 1000)); // 1 khoá/giờ
    const sentThisHour = Number(cache.get(bucketKey) || 0);
    if (sentThisHour >= ALERT_EMAIL_MAX_PER_HOUR) {
      console.warn('Đã đạt giới hạn ' + ALERT_EMAIL_MAX_PER_HOUR + ' email cảnh báo/giờ — bỏ qua để giữ quota MailApp.');
      return;
    }

    const subject = '⚠️ Nghi vấn gian lận: ' + (payload.studentName || 'Ẩn danh') + ' — ' + (payload.testName || '');
    const body = [
      'Học sinh: ' + (payload.studentName || ''),
      'Lớp: ' + (payload.studentClass || ''),
      'Trường: ' + (payload.studentSchool || ''),
      'Bài thi: ' + (payload.testName || ''),
      'Điểm: ' + (payload.score ?? ''),
      'Trạng thái: ' + (payload.status || ''),
      'Ghi chú: ' + (payload.note || ''),
      'Số lần chuyển tab: ' + (payload.tabSwitch ?? ''),
      '',
      '(Email tự động từ apps/Code.gs — xem chi tiết đầy đủ ở sheet "' + SHEET_SUBMISSION_LOG + '")'
    ].join('\n');

    MailApp.sendEmail(ALERT_EMAILS.join(','), subject, body);
    cache.put(bucketKey, String(sentThisHour + 1), 3600); // hết hạn sau 1 giờ, tự dọn
  } catch (e) {
    console.error('Lỗi gửi email cảnh báo gian lận (không ảnh hưởng việc ghi log):', e);
  }
}
