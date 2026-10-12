// ====== XÁC THỰC + PHÂN QUYỀN (Firebase ID token) ======
//
// Web gửi kèm Firebase ID token của người đang đăng nhập. Script dùng CHÍNH token đó đọc
// hồ sơ users/{uid} qua Firestore REST: Firestore chỉ trả về khi token thật, còn hạn và
// đúng chủ hồ sơ (firestore.rules) → vừa xác thực vừa biết vai trò/trường. Kết quả giữ
// trong CacheService tới khi token hết hạn (≤ 1 giờ) → ~1 lượt đọc Firebase/giờ/người.
// Lưu ý: nếu bật Enforce App Check cho Firestore, lượt đọc REST này bị chặn.

/**
 * @returns {{uid:string, role:string, approved:boolean, schools:(string[]|null)}}
 *   schools = null: xem mọi trường (admin).
 */
function authenticate_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw appError_('unauthenticated', 'Chưa đăng nhập.');
  const cache = CacheService.getScriptCache();
  const key = 'auth2:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  // Đọc nhanh phần thân token (CHƯA tin) chỉ để lấy uid/hạn — Firestore xác thực thật ở dưới.
  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(idToken.split('.')[1])).getDataAsString());
  } catch (e) {
    throw appError_('unauthenticated', 'Phiên đăng nhập không hợp lệ.');
  }
  const uid = claims.user_id || claims.sub;
  const expSec = Number(claims.exp) || 0;
  if (!uid || claims.aud !== FIREBASE_PROJECT_ID || expSec * 1000 < Date.now()) {
    throw appError_('unauthenticated', 'Phiên đăng nhập đã hết hạn — tải lại trang.');
  }

  const res = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/users/' + encodeURIComponent(uid),
    { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw appError_('unauthenticated', 'Không xác thực được tài khoản (mã ' + res.getResponseCode() + ').');
  }
  const f = (JSON.parse(res.getContentText()).fields) || {};
  const role = (f.role && f.role.stringValue) || '';
  const schools = ((f.schools && f.schools.arrayValue && f.schools.arrayValue.values) || [])
    .map(function (v) { return v.stringValue; }).filter(Boolean);
  const who = {
    uid: uid,
    role: role,
    approved: !!(f.approved && f.approved.booleanValue),
    schools: role === 'admin' ? null : schools,
  };

  const ttl = Math.min(3600, Math.floor(expSec - Date.now() / 1000) - 60);
  if (ttl > 60) cache.put(key, JSON.stringify(who), ttl);
  return who;
}

/** Chặn nếu vai trò không nằm trong danh sách; giáo viên phải được admin duyệt. */
function requireRole_(who, roles) {
  if (roles.indexOf(who.role) === -1 || (who.role === 'teacher' && !who.approved)) {
    throw appError_('permission-denied', 'Tài khoản không có quyền dùng chức năng này.');
  }
  return who;
}
