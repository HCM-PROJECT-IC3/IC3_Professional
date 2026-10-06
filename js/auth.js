/* ============================================================
   js/auth.js
   Hệ thống tài khoản & phân quyền EduQuiz: Admin / Teacher / Student.
   Dùng Firebase Authentication (email/password) + Firestore collection
   "users" để lưu hồ sơ + vai trò (role) của từng người dùng.

   Cấu trúc 1 document trong collection "users" (id = uid của Auth):
   {
     name: "Nguyễn Văn A",
     email: "a@example.com",
     role: "admin" | "teacher" | "coordinator" | "teaching_coordinator" | "student",
     approved: true|false,   // teacher cần admin duyệt mới approved=true
     createdAt: <timestamp>
   }

   Quy tắc:
   - Đăng ký mới luôn tạo role mặc định "student" (approved=true) trừ khi
     người dùng tự chọn "Tôi là giáo viên" → role "teacher", approved=false
     (chờ admin duyệt trong trang admin-users.html).
   - Tài khoản "admin", "coordinator" và "teaching_coordinator" KHÔNG thể
     tự đăng ký — chỉ được admin khác nâng cấp thủ công trong
     admin-users.html (hoặc gán tay lần đầu trong Firestore Console).
     - "coordinator" (🧭 Điều phối đào tạo): quản lý roster/điểm số/điểm
       danh học sinh (roster-manager.html) + CHỈ ĐỌC báo cáo kết quả (mục
       Báo cáo trong ic3-dashboard.html) — KHÔNG xem được lịch giảng dạy
       của giáo viên (teaching-schedule.html), 2 việc tách biệt hoàn toàn.
     - "teaching_coordinator" (🚗 Điều phối giáo viên): CHỈ XEM lịch giảng
       dạy/TKB của MỌI giáo viên + báo cáo biểu đồ/pivot table + tính hỗ
       trợ xăng xe (teaching-schedule.html) — KHÔNG đụng gì tới
       roster/điểm số học sinh. Không có quyền sửa câu hỏi/tài khoản.
   ============================================================ */
(function (global) {
  'use strict';

  function db() { return window.EduFirebase.db; }
  function auth() { return window.EduFirebase.auth; }

  const USERS_COL = 'users';

  /** Đăng ký tài khoản mới. wantsTeacher=true → xin làm giáo viên (chờ duyệt). */
  /**
   * @param {Object} p
   * @param {string} p.requestedRole - 'student'|'teacher'|'coordinator'|
   *   'teaching_coordinator' — vai trò NGƯỜI DÙNG MUỐN đăng ký. LƯU Ý:
   *   firestore.rules chỉ cho phép tự đăng ký thẳng role 'student' hoặc
   *   'teacher' (xem match /users/{userId} → allow create) — 'coordinator'/
   *   'teaching_coordinator' CHỦ Ý không nằm trong danh sách đó vì đây là
   *   2 vai trò có quyền quản lý dữ liệu nhiều người khác, cần ADMIN xét
   *   duyệt thủ công (admin-users.html) chứ không thể tự nhận ngay khi
   *   đăng ký (tránh 1 tài khoản tự phong "điều phối" rồi có quyền y hệt
   *   admin cấp). Nên khi requestedRole là 2 role này, hồ sơ Firestore vẫn
   *   ghi role:'teacher', approved:false (ĐÚNG luồng "chờ duyệt" đã có sẵn
   *   — auth-guard.js/login.js đã chặn truy cập khi teacher chưa approved)
   *   kèm thêm field requestedRole để admin THẤY ĐÚNG người này muốn làm
   *   gì mà gán role chính xác lúc duyệt, xem js/admin-users.js.
   */
  async function registerUser({ name, email, password, requestedRole }) {
    const cred = await auth().createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await auth().currentUser.updateProfile({ displayName: name });
    const isStudent = requestedRole === 'student';
    // role GHI VÀO FIRESTORE luôn thuộc {student, teacher} để hợp lệ với
    // firestore.rules — requestedRole (field riêng) mới là vai trò THẬT
    // người dùng chọn, dùng để admin duyệt đúng ý.
    const role = isStudent ? 'student' : 'teacher';
    const approved = isStudent; // chỉ học sinh tự động approved; mọi vai trò khác đều chờ duyệt
    await db().collection(USERS_COL).doc(uid).set({
      name: name || '',
      email: email || '',
      role,
      approved,
      requestedRole: requestedRole || role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { uid, role, approved, requestedRole: requestedRole || role };
  }

  async function loginUser(email, password, remember) {
    // remember=false → chỉ giữ phiên đăng nhập trong tab hiện tại (mất khi đóng
    // trình duyệt), remember=true/undefined → giữ đăng nhập lâu dài (mặc định
    // gốc của Firebase), theo checkbox "Ghi nhớ đăng nhập" trên login.html.
    const persistence = remember === false
      ? firebase.auth.Auth.Persistence.SESSION
      : firebase.auth.Auth.Persistence.LOCAL;
    await auth().setPersistence(persistence);
    const cred = await auth().signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function logoutUser() {
    clearStoredProfiles();
    await auth().signOut();
  }

  async function sendResetEmail(email) {
    await auth().sendPasswordResetEmail(email);
  }

  /** Lấy hồ sơ Firestore (role, approved, name...) của 1 uid. */
  async function fetchProfile(uid) {
    const snap = await db().collection(USERS_COL).doc(uid).get();
    if (global.EduFirebase && global.EduFirebase.countSnap) global.EduFirebase.countSnap('users/{uid} (hồ sơ đăng nhập)', snap);
    return snap.exists ? Object.assign({ uid }, snap.data()) : null;
  }

  /**
   * Gọi callback(user, profile) mỗi khi trạng thái đăng nhập thay đổi.
   * user = firebase.auth() user object hoặc null.
   * profile = document Firestore users/{uid} hoặc null.
   */
  // Hồ sơ dùng chung cho mọi onAuthReady() trên cùng 1 trang (auth-guard, game-zone-gate,
  // portfolio... mỗi nơi từng tự đọc users/{uid} → 2-3 lượt đọc/lần mở trang). Chỉ lưu hồ sơ
  // ĐÃ TỒN TẠI, hết hạn sau 5 phút (đổi vai trò/duyệt tài khoản vẫn có hiệu lực sau tối đa 5 phút).
  const PROFILE_TTL_MS = 5 * 60 * 1000;
  let profileMemo = { uid: null, at: 0, promise: null };

  // Lưu thêm vào sessionStorage (theo tab) để chuyển qua lại giữa các trang quản trị
  // không tốn thêm 1 lượt đọc users/{uid} mỗi lần tải trang — cùng TTL 5 phút. Quyền
  // thật vẫn do firestore.rules chốt, cache này chỉ phục vụ hiển thị/điều hướng UI.
  const PROFILE_SS_PREFIX = 'eduAuthProfile:';

  function readStoredProfile(uid) {
    try {
      const entry = JSON.parse(sessionStorage.getItem(PROFILE_SS_PREFIX + uid) || 'null');
      if (entry && entry.profile && Date.now() - entry.at < PROFILE_TTL_MS) return entry;
    } catch (e) { /* storage bị chặn/hỏng — coi như miss */ }
    return null;
  }

  function storeProfile(uid, profile) {
    try { sessionStorage.setItem(PROFILE_SS_PREFIX + uid, JSON.stringify({ at: Date.now(), profile })); }
    catch (e) { /* ignore */ }
  }

  function clearStoredProfiles() {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(PROFILE_SS_PREFIX))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  }

  function memoProfile(uid) {
    const now = Date.now();
    if (profileMemo.uid === uid && profileMemo.promise && now - profileMemo.at < PROFILE_TTL_MS) {
      return profileMemo.promise;
    }
    const stored = readStoredProfile(uid);
    if (stored) {
      profileMemo = { uid, at: stored.at, promise: Promise.resolve(stored.profile) };
      return profileMemo.promise;
    }
    const promise = fetchProfile(uid).then((p) => {
      if (!p && profileMemo.promise === promise) profileMemo = { uid: null, at: 0, promise: null };
      if (p) storeProfile(uid, p);
      return p;
    }, (e) => {
      if (profileMemo.promise === promise) profileMemo = { uid: null, at: 0, promise: null };
      throw e;
    });
    profileMemo = { uid, at: now, promise };
    return promise;
  }

  function onAuthReady(callback) {
    // Mỗi người đăng ký chỉ được gọi lại khi người dùng THỰC SỰ đổi (đăng nhập/đăng xuất/đổi
    // tài khoản) — onAuthStateChanged có thể bắn lại cho cùng 1 uid (khôi phục phiên, mạng...).
    let lastUid;
    auth().onAuthStateChanged(async (user) => {
      const uid = user ? user.uid : null;
      if (lastUid !== undefined && lastUid === uid && uid !== null) return;
      lastUid = uid;
      if (!user) { profileMemo = { uid: null, at: 0, promise: null }; clearStoredProfiles(); return callback(null, null); }
      try {
        const profile = await memoProfile(user.uid);
        callback(user, profile);
      } catch (e) {
        console.error('[EduAuth] Không đọc được hồ sơ người dùng', e);
        lastUid = undefined; // cho phép thử lại ở lần bắn kế tiếp
        callback(user, null);
      }
    });
  }

  const ROLE_LABEL = {
    admin: '👑 Quản trị viên',
    teacher: '📖 Giáo viên',
    coordinator: '🧭 Điều phối đào tạo',
    teaching_coordinator: '🚗 Điều phối giáo viên',
    student: '🎓 Học sinh',
  };

  global.EduAuth = {
    registerUser,
    loginUser,
    logoutUser,
    sendResetEmail,
    fetchProfile,
    onAuthReady,
    ROLE_LABEL,
  };
})(window);
