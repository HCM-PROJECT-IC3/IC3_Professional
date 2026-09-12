/* ============================================================
   js/admin-users-import.js
   "📥 Nhập giáo viên từ Excel" (admin-users.html) — đọc file .xlsx (đúng
   mẫu On_Tap_MOS/Thong_Tin_GV.xlsx: cột "Mã GV" + "Họ Tên" + "Số CCCD",
   các cột khác bỏ qua), TỰ TẠO tài khoản đăng nhập Firebase cho từng giáo
   viên — không cần Admin gõ tay từng người trong Firebase Console.

   QUY TẮC TÀI KHOẢN (đã CHỐT với người dùng — không tự đổi khi sửa code
   sau này nếu không có yêu cầu mới):
   - Email đăng nhập = "<Số CCCD>@iigteacher.local" — domain ".local" GIẢ,
     CHỈ để hợp lệ hoá định dạng email cho Firebase Auth (bắt buộc phải có
     "@..."), KHÔNG phải email thật/không nhận được thư. Dùng CCCD (không
     phải Mã GV) làm phần tên vì đây là lựa chọn người dùng đã CHỌN khi
     được hỏi (Mã GV cũng hợp lệ nhưng CCCD ít trùng lặp hơn về lâu dài).
   - Mật khẩu = "<Số CCCD>@IIG" — giáo viên tự đổi mật khẩu sau khi đăng
     nhập lần đầu nếu muốn (trang hiện chưa có UI đổi mật khẩu riêng,
     dùng "Quên mật khẩu" ở login.html nếu cần, NHƯNG lưu ý: email giả
     ".local" sẽ KHÔNG nhận được thư đặt lại mật khẩu thật — nếu quên,
     phải nhờ Admin tạo lại tài khoản hoặc đổi thủ công qua Firebase Console).
   - role = "teacher", approved = true (bỏ qua bước chờ duyệt vì admin là
     người trực tiếp tạo, không phải giáo viên tự đăng ký).
   - teacherCode = đúng "Mã GV" trong file — liên kết ngay với bản ghi
     trong collection "teaching_teachers" (tab "👤 Giáo viên" của
     teaching-schedule.html) để giáo viên tự xem được lịch của mình luôn,
     không cần Admin liên kết thủ công thêm 1 bước riêng ở bảng phía trên.

   KỸ THUẬT QUAN TRỌNG: createUserWithEmailAndPassword() trên SDK Compat
   luôn TỰ ĐĂNG NHẬP làm user vừa tạo trên ĐÚNG app instance gọi hàm đó —
   gọi thẳng trên app mặc định (window.EduFirebase) sẽ ĐĂNG XUẤT admin
   đang thao tác ngay giữa chừng. Giải pháp: dùng 1 app instance THỨ HAI
   (firebase.initializeApp(config, 'bulkCreateTeachers')), tạo xong thì
   signOut() luôn trên app phụ đó — admin ở app mặc định không hề bị ảnh
   hưởng trong suốt quá trình.

   Nạp SAU: js/firebase-config.js (cần window.EduFirebase.config),
   js/admin-users.js (cần allTeachingTeachers để đối chiếu Mã GV), SheetJS.
   ============================================================ */
(function () {
  'use strict';

  const EMAIL_DOMAIN = 'iigteacher.local';
  let parsedRows = []; // [{maGV, hoTen, cccd, email, status, message}]

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function openModal() { document.getElementById('importModalOverlay').classList.add('show'); }
  function closeModal() {
    document.getElementById('importModalOverlay').classList.remove('show');
    parsedRows = [];
    document.getElementById('importTeachersInput').value = '';
    document.getElementById('importConfirmBtn').disabled = true;
  }
  document.getElementById('importModalCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('importModalCancelBtn')?.addEventListener('click', closeModal);
  document.getElementById('importModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'importModalOverlay') closeModal();
  });

  document.getElementById('importTeachersBtn')?.addEventListener('click', () => {
    openModal();
    document.getElementById('importTeachersInput').click();
  });

  document.getElementById('importTeachersInput')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        parseWorkbook(ev.target.result);
      } catch (err) {
        toast('❌ Không đọc được file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  /** Chuẩn hoá tên cột — bỏ dấu để so khớp "Mã GV"/"MaGV"/"mã gv" đều ra
   * cùng 1 khoá, tránh vỡ vì người dùng gõ hoa/thường/dấu cách khác nhau
   * giữa các phiên bản file theo thời gian. Lọc dấu bằng cách so mã điểm
   * Unicode (NFD rồi loại khối "Combining Diacritical Marks" 0x0300-0x036F)
   * thay vì viết thẳng ký tự dấu tổ hợp vào regex — tránh lỗi mã hoá file
   * khi copy/paste ký tự tổ hợp (đã gặp ở chỗ khác trong dự án). */
  function stripDiacritics(s) {
    let out = '';
    for (const ch of String(s).normalize('NFD')) {
      const code = ch.codePointAt(0);
      if (code < 0x0300 || code > 0x036f) out += ch;
    }
    return out;
  }
  function normalizeHeader(h) {
    return stripDiacritics(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

    // Dò đúng HÀNG TIÊU ĐỀ (chứa "Mã GV") thay vì cố định "hàng 2" — file
    // mẫu có 1 hàng tiêu đề lớn ở trên cùng (gộp ô), không phải lúc nào
    // cũng đúng 1 hàng banner cố định nếu người dùng chỉnh sửa thêm.
    let headerRowIdx = -1;
    let colMaGV = -1, colHoTen = -1, colCccd = -1;
    for (let i = 0; i < rows.length; i += 1) {
      const normalized = rows[i].map(normalizeHeader);
      const maGVIdx = normalized.indexOf('magv');
      if (maGVIdx !== -1) {
        headerRowIdx = i;
        colMaGV = maGVIdx;
        colHoTen = normalized.indexOf('hoten');
        colCccd = normalized.findIndex((h) => h.includes('cccd'));
        break;
      }
    }
    if (headerRowIdx === -1 || colCccd === -1) {
      toast('❌ Không tìm thấy cột "Mã GV"/"Số CCCD" trong file — kiểm tra lại đúng file mẫu.');
      return;
    }

    const seenCccd = new Set();
    parsedRows = [];
    for (let i = headerRowIdx + 1; i < rows.length; i += 1) {
      const row = rows[i];
      const maGV = String(row[colMaGV] || '').trim();
      const hoTen = colHoTen !== -1 ? String(row[colHoTen] || '').trim() : '';
      const cccd = String(row[colCccd] || '').trim().replace(/\D/g, ''); // chỉ giữ chữ số — phòng Excel tự thêm khoảng trắng/định dạng số
      if (!maGV && !cccd) continue; // dòng trống hoàn toàn — bỏ qua âm thầm, không tính là lỗi

      let status = 'pending', message = '';
      if (!maGV) { status = 'skip'; message = 'Thiếu Mã GV'; }
      else if (!cccd) { status = 'skip'; message = 'Thiếu Số CCCD'; }
      else if (seenCccd.has(cccd)) { status = 'skip'; message = 'Trùng CCCD với 1 dòng khác trong file'; }
      else seenCccd.add(cccd);

      parsedRows.push({
        maGV, hoTen, cccd,
        email: cccd ? `${cccd}@${EMAIL_DOMAIN}` : '',
        status, message,
      });
    }
    renderPreview();
  }

  function renderPreview() {
    const table = document.getElementById('importPreviewTable');
    const confirmBtn = document.getElementById('importConfirmBtn');
    const summary = document.getElementById('importSummary');
    if (!parsedRows.length) {
      table.querySelector('tbody').innerHTML = '<tr><td colspan="5" class="empty-cell">Không có dòng dữ liệu nào hợp lệ trong file.</td></tr>';
      confirmBtn.disabled = true;
      return;
    }
    const pendingCount = parsedRows.filter((r) => r.status === 'pending').length;
    const skipCount = parsedRows.filter((r) => r.status === 'skip').length;
    const okCount = parsedRows.filter((r) => r.status === 'ok').length;
    const existsCount = parsedRows.filter((r) => r.status === 'exists').length;
    const errCount = parsedRows.filter((r) => r.status === 'err').length;
    const doneAny = okCount + existsCount + errCount > 0;
    summary.innerHTML = doneAny
      ? `
        <div class="import-stat ok"><b>${okCount}</b><span>Đã tạo mới</span></div>
        <div class="import-stat warn"><b>${existsCount}</b><span>Đã tồn tại từ trước</span></div>
        <div class="import-stat err"><b>${errCount}</b><span>Lỗi</span></div>
        <div class="import-stat"><b>${skipCount}</b><span>Bị bỏ qua (thiếu dữ liệu)</span></div>
      `
      : `
        <div class="import-stat ok"><b>${pendingCount}</b><span>Sẽ tạo tài khoản</span></div>
        <div class="import-stat warn"><b>${skipCount}</b><span>Bị bỏ qua</span></div>
        <div class="import-stat"><b>${parsedRows.length}</b><span>Tổng dòng đọc được</span></div>
      `;
    const STATUS_TEXT = {
      pending: '✅ Sẵn sàng',
      skip: (r) => `⏭️ ${esc(r.message)}`,
      ok: '✅ Đã tạo tài khoản',
      exists: (r) => `⚠️ ${esc(r.message)}`,
      err: (r) => `❌ ${esc(r.message)}`,
    };
    const STATUS_CLASS = { pending: 'row-status-ok', skip: 'row-status-skip', ok: 'row-status-ok', exists: 'row-status-exists', err: 'row-status-err' };
    table.querySelector('tbody').innerHTML = parsedRows.map((r) => {
      const textRule = STATUS_TEXT[r.status];
      const text = typeof textRule === 'function' ? textRule(r) : textRule;
      return `<tr class="${r.status === 'skip' ? 'row-skip' : ''}">
        <td>${esc(r.maGV) || '—'}</td>
        <td>${esc(r.hoTen) || '—'}</td>
        <td>${esc(r.cccd) || '—'}</td>
        <td>${esc(r.email) || '—'}</td>
        <td class="${STATUS_CLASS[r.status]}">${text}</td>
      </tr>`;
    }).join('');
    // Sau khi đã chạy 1 lượt, chỉ cho bấm lại nếu còn dòng "pending" (vd
    // người dùng tự sửa file rồi tải lại — hiếm khi xảy ra trong modal
    // này) — KHÔNG cho bấm lại vô tội vạ để tránh tạo trùng/tốn quota.
    confirmBtn.disabled = pendingCount === 0;
  }

  /** App instance THỨ HAI dùng riêng cho createUserWithEmailAndPassword —
   * xem chú thích đầu file về lý do KHÔNG được gọi trên app mặc định. */
  function getBulkCreateAuth() {
    const name = 'bulkCreateTeachers';
    let app = firebase.apps.find((a) => a.name === name);
    if (!app) app = firebase.initializeApp(window.EduFirebase.config, name);
    return app.auth();
  }

  document.getElementById('importConfirmBtn')?.addEventListener('click', async () => {
    const rowsToCreate = parsedRows.filter((r) => r.status === 'pending');
    if (!rowsToCreate.length) return;
    const btn = document.getElementById('importConfirmBtn');
    btn.disabled = true;
    const secondaryAuth = getBulkCreateAuth();

    let created = 0, existed = 0, failed = 0;
    for (const r of rowsToCreate) {
      btn.textContent = `⏳ Đang tạo... (${created + existed + failed + 1}/${rowsToCreate.length})`;
      const password = `${r.cccd}@IIG`;
      try {
        const cred = await secondaryAuth.createUserWithEmailAndPassword(r.email, password);
        await window.EduFirebase.db.collection('users').doc(cred.user.uid).set({
          name: r.hoTen || r.maGV,
          email: r.email,
          role: 'teacher',
          approved: true,
          teacherCode: r.maGV,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        r.status = 'ok';
        created += 1;
      } catch (err) {
        if (err && err.code === 'auth/email-already-in-use') {
          r.status = 'exists'; r.message = 'Tài khoản đã tồn tại từ trước — bỏ qua, không tạo trùng';
          existed += 1;
        } else {
          r.status = 'err'; r.message = (err && err.message) || String(err);
          failed += 1;
        }
      } finally {
        // Dọn session phụ sau MỖI lần tạo (kể cả lỗi) — không để tồn đọng
        // trạng thái đăng nhập lạ trên app phụ giữa các lượt.
        try { await secondaryAuth.signOut(); } catch (e) { /* bỏ qua */ }
      }
      renderPreview();
    }

    btn.textContent = '✅ Tạo tài khoản';
    btn.disabled = false;
    toast(`✅ Đã tạo ${created} tài khoản mới${existed ? `, ${existed} đã tồn tại từ trước` : ''}${failed ? `, ${failed} lỗi` : ''}.`);
    if (window.EduAdminUsersReload) window.EduAdminUsersReload();
  });
})();
