  // ---- Nút chuyển sáng/tối (đồng hồ mặt trời neumorphism, xem
  // .theme-toggle trong css/login.css). ----
  (function initThemeToggle() {
    const saved = localStorage.getItem('ic3_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ic3_theme', next);
    });
  })();

  const params = new URLSearchParams(location.search);
  const nextUrl = params.get('next') || 'ic3-dashboard.html';

  if (params.get('reason') === 'idle') {
    const msgEl = document.getElementById('msg');
    msgEl.textContent = '⏳ Bạn đã bị đăng xuất do không hoạt động trong 10 phút. Vui lòng đăng nhập lại.';
    msgEl.classList.add('err');
  }

  // Nếu đã đăng nhập sẵn → chuyển thẳng đi, khỏi cần đăng nhập lại
  EduFirebase.auth.onAuthStateChanged((user) => {
    if (user) redirectByRole();
  });

  async function redirectByRole() {
    try {
      const user = EduFirebase.auth.currentUser;
      const profile = await EduAuth.fetchProfile(user.uid);
      if (!profile) return; // hồ sơ chưa kịp tạo (vừa đăng ký) — để luồng register tự điều hướng
      if (profile.role === 'student') {
        window.location.href = 'index.html';
        return;
      }
      // Giáo viên chưa được duyệt: KHÔNG điều hướng sang trang quản trị (sẽ bị
      // auth-guard.js chặn ngay), tránh vòng lặp "đẩy ra đẩy vào" giữa login.html
      // và trang quản trị. Hiện thông báo tại chỗ và đăng xuất để người dùng có
      // thể thử tài khoản khác ngay.
      if (profile.role === 'teacher' && profile.approved === false) {
        setMsg('⏳ Tài khoản giáo viên của bạn đang chờ quản trị viên duyệt. Vui lòng thử lại sau, hoặc đăng nhập bằng tài khoản khác.', 'err');
        await EduAuth.logoutUser();
        return;
      }
      window.location.href = nextUrl;
    } catch (e) { /* ignore, ở lại trang login */ }
  }

  // Tabs — chỉ thị trượt (.tab-indicator) + form trượt/mờ vào (xem
  // form:not(.hidden) trong css/login.css) mỗi lần đổi tab.
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('tabIndicator').classList.toggle('pos-register', !isLogin);
      document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
      document.getElementById('registerForm').classList.toggle('hidden', isLogin);
      setMsg('');
    });
  });

  // Role choice — 4 lựa chọn (Học sinh/Giáo viên/Điều phối đào tạo/Điều
  // phối giáo viên). CHỈ "student" tự động dùng được ngay; 3 lựa chọn còn
  // lại đều cần quản trị viên duyệt thủ công (xem js/auth.js registerUser()
  // + firestore.rules — "coordinator"/"teaching_coordinator" KHÔNG được tự
  // đăng ký thẳng vào role đó vì lý do bảo mật, tài khoản tạm lưu ở dạng
  // "giáo viên chờ duyệt" kèm requestedRole để admin thấy đúng ý muốn rồi
  // gán role chính xác ở admin-users.html).
  const ROLE_HINTS = {
    student: 'Tài khoản học sinh dùng được ngay sau khi đăng ký.',
    teacher: 'Tài khoản giáo viên cần quản trị viên duyệt trước khi dùng được các trang quản trị.',
    coordinator: 'Tài khoản Điều phối đào tạo cần quản trị viên duyệt và gán trường phụ trách trước khi dùng được.',
    teaching_coordinator: 'Tài khoản Điều phối giáo viên cần quản trị viên duyệt trước khi dùng được trang Lịch giảng dạy.',
  };
  let chosenRole = 'student';
  document.querySelectorAll('.role-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      chosenRole = opt.dataset.role;
      document.getElementById('roleHint').textContent = ROLE_HINTS[chosenRole] || '';
    });
  });

  // ---- Ràng buộc/validate real-time (theo yêu cầu người dùng: "tạo thêm
  // điều kiện ràng buộc cho form đăng ký và nhập") — kiểm tra khi rời ô
  // (blur) + khi gõ lại (input, để tắt lỗi ngay khi sửa đúng), KHÔNG chỉ
  // dựa vào HTML5 required/minlength mặc định (trình duyệt mỗi nơi hiện
  // tooltip 1 kiểu, không đồng bộ giao diện, và không validate được các
  // ràng buộc chéo như "2 mật khẩu khớp nhau"). ----
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PASS_RE = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/; // tối thiểu 6 ký tự, có cả chữ và số

  function showFieldError(input, message) {
    const err = document.getElementById('err-' + input.id);
    input.classList.toggle('invalid', !!message);
    input.classList.toggle('valid', !message && input.value.trim() !== '');
    if (err) err.textContent = message || '';
    return !message;
  }

  function validators() {
    return {
      loginEmail: (v) => {
        v = v.trim();
        if (!v) return 'Vui lòng nhập email.';
        if (!EMAIL_RE.test(v)) return 'Email không đúng định dạng.';
        return '';
      },
      loginPass: (v) => (!v ? 'Vui lòng nhập mật khẩu.' : ''),
      regName: (v) => {
        v = v.trim();
        if (!v) return 'Vui lòng nhập họ và tên.';
        if (v.length < 2) return 'Họ và tên quá ngắn.';
        return '';
      },
      regEmail: (v) => {
        v = v.trim();
        if (!v) return 'Vui lòng nhập email.';
        if (!EMAIL_RE.test(v)) return 'Email không đúng định dạng.';
        return '';
      },
      regPass: (v) => {
        if (!v) return 'Vui lòng nhập mật khẩu.';
        if (!PASS_RE.test(v)) return 'Mật khẩu cần tối thiểu 6 ký tự, gồm cả chữ và số.';
        return '';
      },
      regPass2: (v) => {
        const p1 = document.getElementById('regPass').value;
        if (!v) return 'Vui lòng nhập lại mật khẩu.';
        if (v !== p1) return 'Hai mật khẩu không khớp nhau.';
        return '';
      },
    };
  }

  function validateField(input) {
    const fn = validators()[input.id];
    if (!fn) return true;
    return showFieldError(input, fn(input.value));
  }

  function validateForm(formEl) {
    const inputs = formEl.querySelectorAll('input[id]');
    let firstInvalid = null;
    let allValid = true;
    inputs.forEach((input) => {
      const ok = validateField(input);
      if (!ok) {
        allValid = false;
        if (!firstInvalid) firstInvalid = input;
      }
    });
    if (firstInvalid) firstInvalid.focus();
    return allValid;
  }

  ['loginEmail', 'loginPass', 'regName', 'regEmail', 'regPass', 'regPass2'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('blur', () => validateField(input));
    input.addEventListener('input', () => {
      if (input.classList.contains('invalid')) validateField(input);
      // Mật khẩu 2 phụ thuộc mật khẩu 1 — gõ lại ô 1 thì kiểm tra lại ô 2 nếu đã đụng tới
      if (id === 'regPass') {
        const p2 = document.getElementById('regPass2');
        if (p2.classList.contains('invalid') || p2.value) validateField(p2);
      }
    });
  });

  function setMsg(text, type) {
    const el = document.getElementById('msg');
    el.textContent = text || '';
    el.className = 'msg' + (type ? ' ' + type : '');
  }

  function friendlyError(err) {
    const code = err && err.code || '';
    const map = {
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
      'auth/wrong-password': 'Sai mật khẩu.',
      'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
      'auth/email-already-in-use': 'Email này đã được đăng ký.',
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
      'auth/too-many-requests': 'Bạn thử sai quá nhiều lần, hãy đợi một lát rồi thử lại.',
    };
    return map[code] || (err && err.message) || 'Đã có lỗi xảy ra, thử lại nhé.';
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formEl = e.target;
    if (!validateForm(formEl)) { setMsg('⚠️ Vui lòng kiểm tra lại các ô được đánh dấu đỏ.', 'err'); return; }
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    setMsg('Đang đăng nhập...', '');
    try {
      const email = document.getElementById('loginEmail').value.trim();
      const pass = document.getElementById('loginPass').value;
      const remember = document.getElementById('rememberMe').checked;
      await EduAuth.loginUser(email, pass, remember);
      setMsg('✅ Đăng nhập thành công, đang chuyển hướng...', 'ok');
      await redirectByRole();
    } catch (err) {
      setMsg('❌ ' + friendlyError(err), 'err');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formEl = e.target;
    if (!validateForm(formEl)) { setMsg('⚠️ Vui lòng kiểm tra lại các ô được đánh dấu đỏ.', 'err'); return; }
    const btn = document.getElementById('registerBtn');
    btn.disabled = true;
    setMsg('Đang tạo tài khoản...', '');
    try {
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass = document.getElementById('regPass').value;
      const { role, approved, requestedRole } = await EduAuth.registerUser({
        name, email, password: pass, requestedRole: chosenRole,
      });
      if (role === 'teacher' && !approved) {
        const label = EduAuth.ROLE_LABEL[requestedRole] || 'giáo viên';
        setMsg(`✅ Đã tạo tài khoản (đăng ký làm ${label}). Vui lòng chờ quản trị viên duyệt trước khi đăng nhập vào trang quản trị.`, 'ok');
        btn.disabled = false;
        return;
      }
      setMsg('✅ Tạo tài khoản thành công, đang chuyển hướng...', 'ok');
      window.location.href = role === 'student' ? 'index.html' : nextUrl;
    } catch (err) {
      setMsg('❌ ' + friendlyError(err), 'err');
      btn.disabled = false;
    }
  });

  document.getElementById('forgotLink').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) { setMsg('Nhập email ở trên trước rồi bấm "Quên mật khẩu?" nhé.', 'err'); return; }
    try {
      await EduAuth.sendResetEmail(email);
      setMsg('📩 Đã gửi email đặt lại mật khẩu tới ' + email, 'ok');
    } catch (err) {
      setMsg('❌ ' + friendlyError(err), 'err');
    }
  });
