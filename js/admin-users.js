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

  async function loadSchools() {
    try {
      const snap = await EduFirebase.db.collection('students_roster').get();
      const set = new Set();
      snap.docs.forEach(d => { const s = (d.data().school || '').trim(); if (s) set.add(s); });
      allSchools = [...set].sort((a, b) => a.localeCompare(b, 'vi'));
    } catch (err) {
      console.warn('[EduAdminUsers] Không tải được danh sách trường (students_roster):', err.message);
      allSchools = [];
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
    ]);
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6">Chưa có tài khoản nào.</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(doc => {
      const u = doc.data();
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
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Quản trị viên</option>
          </select>
        </td>
        <td class="schoolsCell" ${u.role === 'teacher' ? '' : 'hidden'}>
          ${allSchools.length ? `
            <select class="schoolsSelect" multiple size="${Math.min(4, Math.max(2, allSchools.length))}" title="Giữ Ctrl (hoặc Cmd) để chọn nhiều trường">
              ${allSchools.map(s => `<option value="${esc(s)}" ${userSchools.includes(s) ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
            <button type="button" class="saveSchoolsBtn">💾 Lưu trường</button>
          ` : `<span class="hint">Chưa có trường nào trong danh sách học sinh (roster-manager.html)</span>`}
          ${userSchools.length ? `<div class="schoolsCurrent">Đang xem: ${userSchools.map(esc).join(', ')}</div>` : ''}
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
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
