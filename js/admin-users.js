window.EDU_ALLOWED_ROLES = ['admin'];

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  // Danh sách trường CHUẨN (nguồn thật: collection "students_roster", do
  // Điều phối đào tạo quản lý trong roster-manager.html) — dùng để gán
  // "Trường được xem" cho giáo viên, đảm bảo khớp CHÍNH XÁC với giá trị
  // studentSchool được ghi vào quiz_results lúc học sinh nộp bài (ô Trường
  // ở index.html cũng là dropdown lấy từ CÙNG một nguồn, xem js/lobby-roster.js).
  // Không cho gõ tay để tránh lệch chính tả → giáo viên bị rớt mất dữ liệu
  // hợp lệ do firestore.rules so khớp "in" tuyệt đối chuỗi.
  let allSchools = [];
  // uid (users/{uid}, CHÍNH LÀ students_roster.teacherId — roster-manager.html
  // gán "Giáo viên phụ trách" cho 1 lớp bằng UID tài khoản, không phải
  // teacherCode của Lịch giảng dạy) -> Set các trường có học sinh ĐANG HỌC
  // do giáo viên đó phụ trách = "trường giáo viên này THẬT SỰ đang dạy".
  // Dùng để TỰ ĐỘNG suy ra/sửa lại "Trường được xem" thay vì admin phải tự
  // multi-select tay (dễ gán nhầm/gán sót — người dùng phản hồi đã thấy
  // nhiều giáo viên khác nhau bị gán CÙNG 1 bộ trường giống hệt nhau).
  let schoolsByTeacherId = {};

  async function loadSchools() {
    try {
      const snap = await EduFirebase.db.collection('students_roster').where('status', '==', 'active').get();
      const set = new Set();
      schoolsByTeacherId = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const s = (data.school || '').trim();
        if (!s) return;
        set.add(s);
        if (!data.teacherId) return;
        (schoolsByTeacherId[data.teacherId] = schoolsByTeacherId[data.teacherId] || new Set()).add(s);
      });
      allSchools = [...set].sort((a, b) => a.localeCompare(b, 'vi'));
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh sách trường (students_roster):', err.message);
      allSchools = [];
      schoolsByTeacherId = {};
    }
  }

  /** Trường THẬT SỰ giáo viên `uid` đang dạy (suy từ students_roster đang
   * học, KHÔNG phải giá trị đã lưu tay trên users/{uid}.schools — dùng để
   * so sánh/tự sửa nếu 2 giá trị lệch nhau). */
  function actualSchoolsOf(uid) {
    return [...(schoolsByTeacherId[uid] || [])].sort((a, b) => a.localeCompare(b, 'vi'));
  }

  // Danh sách giáo viên trong "Lịch giảng dạy" (teaching-schedule.html) —
  // dùng để liên kết 1 tài khoản (role teacher) với ĐÚNG 1 bản ghi giáo
  // viên (field "teacherCode" trên users/{uid}), nhờ đó giáo viên tự xem
  // được lịch của mình mà firestore.rules vẫn chặn được xem lịch người khác.
  let allTeachingTeachers = []; // [{code,name}]

  async function loadTeachingTeachers() {
    try {
      const snap = await EduFirebase.db.collection('teaching_teachers').get();
      allTeachingTeachers = snap.docs
        .map(d => ({ code: d.id, name: (d.data().name || '').trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh sách giáo viên (teaching_teachers):', err.message);
      allTeachingTeachers = [];
    }
  }

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    loadUsers();
  });

  async function loadUsers() {
    const tbody = document.getElementById('userRows');
    const [snap] = await Promise.all([
      EduFirebase.db.collection('users').orderBy('createdAt', 'desc').get(),
      loadSchools(),
      loadTeachingTeachers(),
    ]);
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7">Chưa có tài khoản nào.</td></tr>';
      return;
    }

    // TỰ ĐỘNG sửa "Trường được xem" của giáo viên theo ĐÚNG trường họ đang
    // dạy thật (students_roster.teacherId, xem loadSchools()) — trước đây
    // trường này phải admin tự multi-select tay, dễ gán nhầm/gán sót (đã
    // thấy nhiều giáo viên khác nhau bị gán CÙNG 1 bộ trường). CHỈ tự sửa
    // khi có ít nhất 1 lớp roster thật cho GV đó (actual.length > 0) — GV
    // mới chưa có lớp nào thì giữ nguyên (kể cả rỗng), tránh xoá mất gán
    // tay hợp lệ của admin trong lúc chưa kịp nhập roster.
    // .data() tạo object MỚI mỗi lần gọi — lấy ra đúng 1 lần/doc và dùng
    // lại object đó xuyên suốt (vòng tự sửa bên dưới VÀ vòng render), nếu
    // không sửa `u.schools` ở vòng tự sửa sẽ không thấy được ở vòng render
    // (2 object .data() khác nhau, không liên quan gì tới nhau).
    const users = snap.docs.map(doc => ({ doc, u: doc.data() }));

    const batch = EduFirebase.db.batch();
    let fixedCount = 0;
    users.forEach(({ doc, u }) => {
      if (u.role !== 'teacher') return;
      const saved = Array.isArray(u.schools) ? [...u.schools].sort((a, b) => a.localeCompare(b, 'vi')) : [];
      const actual = actualSchoolsOf(doc.id);
      if (!actual.length) return;
      if (JSON.stringify(saved) === JSON.stringify(actual)) return;
      batch.set(doc.ref, { schools: actual }, { merge: true });
      u.schools = actual; // cập nhật NGAY object dùng để render, không cần tải lại
      fixedCount++;
    });
    if (fixedCount) {
      try {
        await batch.commit();
        toast(`🔧 Đã tự đồng bộ lại "Trường được xem" cho ${fixedCount} giáo viên theo đúng lớp đang dạy`);
      } catch (err) {
        console.warn('[EduAdminUsers] Không tự đồng bộ được "Trường được xem":', err.message);
      }
    }

    tbody.innerHTML = users.map(({ doc, u }) => {
      const pending = u.role === 'teacher' && u.approved === false;
      const userSchools = Array.isArray(u.schools) ? u.schools : [];
      return `
      <tr data-uid="${doc.id}">
        <td>${esc(u.name || '(chưa đặt tên)')}</td>
        <td>${esc(u.email || '')}</td>
        <td><span class="badge ${esc(u.role)}">${esc(EduAuth.ROLE_LABEL[u.role] || u.role)}</span>${pending ? '<span class="badge pending">Chờ duyệt</span>' : ''}</td>
        <td>
          <select class="roleSelect">
            <option value="student" ${u.role === 'student' ? 'selected' : ''}>🎓 Học sinh</option>
            <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>📖 Giáo viên</option>
            <option value="coordinator" ${u.role === 'coordinator' ? 'selected' : ''}>🧭 Điều phối đào tạo</option>
            <option value="teaching_coordinator" ${u.role === 'teaching_coordinator' ? 'selected' : ''}>🚗 Điều phối giáo viên</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Quản trị viên</option>
          </select>
        </td>
        <td class="schoolsCell" ${(u.role === 'teacher' || u.role === 'coordinator') ? '' : 'hidden'}>
          ${allSchools.length ? `
            <select class="schoolsSelect" multiple size="${Math.min(4, Math.max(2, allSchools.length))}" title="Giữ Ctrl (hoặc Cmd) để chọn nhiều trường${u.role === 'teacher' ? ' — trang đã TỰ ĐỘNG đồng bộ theo lớp đang dạy thật mỗi lần tải trang, chỉ sửa tay ở đây nếu cần thêm ngoại lệ' : ''}">
              ${allSchools.map(s => `<option value="${esc(s)}" ${userSchools.includes(s) ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
            <button type="button" class="saveSchoolsBtn">💾 Lưu trường</button>
            ${u.role === 'teacher' ? `<button type="button" class="syncSchoolsBtn" title="Đặt lại đúng theo trường giáo viên này ĐANG DẠY THẬT (students_roster), bỏ mọi chỉnh tay">🔄 Đồng bộ theo lớp đang dạy</button>` : ''}
          ` : `<span class="hint">Chưa có trường nào trong danh sách học sinh (roster-manager.html)</span>`}
          ${userSchools.length ? `<div class="schoolsCurrent">${u.role === 'coordinator' ? 'Đang hỗ trợ' : 'Đang xem'}: ${userSchools.map(esc).join(', ')}</div>` : (u.role === 'coordinator' ? `<div class="schoolsCurrent hint">⚠️ Chưa gán trường nào — điều phối đào tạo này CHƯA xem/sửa được trường nào cả (khác trước đây, mặc định thấy hết)</div>` : '')}
        </td>
        <td class="teacherCodeCell" ${u.role === 'teacher' ? '' : 'hidden'}>
          ${allTeachingTeachers.length ? `
            <select class="teacherCodeSelect">
              <option value="">-- Chưa liên kết --</option>
              ${allTeachingTeachers.map(tc => `<option value="${esc(tc.code)}" ${u.teacherCode === tc.code ? 'selected' : ''}>${esc(tc.code)} — ${esc(tc.name)}</option>`).join('')}
            </select>
            <button type="button" class="saveTeacherCodeBtn">💾 Lưu</button>
          ` : `<span class="hint">Chưa có giáo viên nào trong Lịch giảng dạy (teaching-schedule.html)</span>`}
        </td>
        <td>${pending ? '<button class="approveBtn">✅ Duyệt ngay</button>' : '—'}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.roleSelect').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const uid = e.target.closest('tr').dataset.uid;
        const newRole = e.target.value;
        try {
          await EduFirebase.db.collection('users').doc(uid).set(
            { role: newRole, approved: true }, { merge: true }
          );
          toast('✅ Đã cập nhật vai trò');
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });

    tbody.querySelectorAll('.approveBtn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = e.target.closest('tr').dataset.uid;
        try {
          await EduFirebase.db.collection('users').doc(uid).set({ approved: true }, { merge: true });
          toast('✅ Đã duyệt tài khoản giáo viên');
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });

    tbody.querySelectorAll('.saveSchoolsBtn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tr = e.target.closest('tr');
        const uid = tr.dataset.uid;
        const sel = tr.querySelector('.schoolsSelect');
        const chosen = Array.from(sel.selectedOptions).map(o => o.value);
        if (!chosen.length) {
          toast('⚠️ Chọn ít nhất 1 trường trước khi lưu (nếu muốn giáo viên không xem trường nào, đổi vai trò tạm thời)');
          return;
        }
        try {
          await EduFirebase.db.collection('users').doc(uid).set({ schools: chosen }, { merge: true });
          toast(`✅ Đã gán ${chosen.length} trường cho giáo viên`);
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });

    tbody.querySelectorAll('.syncSchoolsBtn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = e.target.closest('tr').dataset.uid;
        const actual = actualSchoolsOf(uid);
        if (!actual.length) {
          toast('⚠️ Giáo viên này chưa có lớp nào đang học trong danh sách học sinh (roster-manager.html) — không có gì để đồng bộ.');
          return;
        }
        try {
          await EduFirebase.db.collection('users').doc(uid).set({ schools: actual }, { merge: true });
          toast(`✅ Đã đặt lại đúng ${actual.length} trường đang dạy thật`);
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });

    tbody.querySelectorAll('.saveTeacherCodeBtn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const tr = e.target.closest('tr');
        const uid = tr.dataset.uid;
        const sel = tr.querySelector('.teacherCodeSelect');
        const code = sel.value;
        try {
          await EduFirebase.db.collection('users').doc(uid).set(
            { teacherCode: code || firebase.firestore.FieldValue.delete() }, { merge: true }
          );
          toast(code ? '✅ Đã liên kết Mã NV cho giáo viên' : '✅ Đã bỏ liên kết Mã NV');
          loadUsers();
        } catch (err) {
          toast('❌ Lỗi: ' + err.message);
        }
      });
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Lộ ra ngoài để js/admin-users-import.js gọi lại sau khi tạo xong hàng
  // loạt tài khoản — bảng chính tự làm mới, không cần F5 mới thấy 18 tài
  // khoản giáo viên vừa tạo.
  window.EduAdminUsersReload = loadUsers;
