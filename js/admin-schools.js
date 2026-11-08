/* ============================================================
   js/admin-schools.js — trang admin-schools.html (Danh mục trường).
   Admin: mọi trường + số học sinh (bản đệm roster dùng chung, 0 lượt đọc thêm
   nếu đã có) + đổi trạng thái. Quản trị trường: chỉ trường được gán, sửa
   thông tin liên hệ. Không đổi tên trường ở đây: tên đang là khoá nối roster,
   Sheet kết quả và quyền (users.schools) — xem docs/architecture/AUDIT-2.0.md §6.
   ============================================================ */
(function () {
  'use strict';

  (function initThemeToggle() {
    const saved = localStorage.getItem('ic3_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ic3_theme', next);
    });
  })();

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  const S = window.EduModels.School;
  const repo = window.EduRepositories.school;
  const LABELS = { address: 'Địa chỉ', phone: 'Điện thoại', contactName: 'Người liên hệ', note: 'Ghi chú' };

  let profile = null;
  let schools = [];
  let allSchools = []; // bản đầy đủ danh mục (admin: = schools) — để lưu lại bản đệm sau khi sửa
  let studentCount = null; // { schoolId: số HS đang học } — chỉ Admin

  const isAdmin = () => profile && profile.role === 'admin';

  function logSchoolChange(schoolAction, schoolId, meta) {
    if (window.EduActivityLog) {
      window.EduActivityLog.log(window.EduModels.ActivityLog.ACTIONS.UPDATE_SCHOOL, {
        targetId: schoolId, meta: Object.assign({ schoolAction }, meta || {}),
      });
    }
  }

  function renderKpis() {
    const active = schools.filter((s) => s.status !== S.SCHOOL_STATUS.INACTIVE).length;
    const cards = [
      ['fa-school', 'Trường', schools.length],
      ['fa-circle-check', 'Đang hoạt động', active],
    ];
    if (studentCount) {
      const total = schools.reduce((n, s) => n + (studentCount[s.id] || 0), 0);
      cards.push(['fa-user-graduate', 'Học sinh đang học', total.toLocaleString('vi-VN')]);
    }
    document.getElementById('kpiRow').innerHTML = cards.map(([icon, label, value]) => `
      <div class="kpi-card"><i class="fa-solid ${icon}" aria-hidden="true"></i>
        <div><div class="kpi-value">${esc(value)}</div><div class="kpi-label">${esc(label)}</div></div></div>`).join('');
  }

  function render() {
    renderKpis();
    const tbody = document.getElementById('schoolRows');
    if (!schools.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">${isAdmin()
        ? 'Chưa có trường nào. Danh mục tự tạo theo roster khi mở trang Quản lý tài khoản.'
        : 'Tài khoản chưa được gán trường nào — liên hệ Quản trị viên.'}</td></tr>`;
      return;
    }
    tbody.innerHTML = schools.map((s) => {
      const inactive = s.status === S.SCHOOL_STATUS.INACTIVE;
      const status = isAdmin()
        ? `<select class="statusSelect" aria-label="Trạng thái ${esc(s.name)}">
             <option value="active" ${inactive ? '' : 'selected'}>Đang hoạt động</option>
             <option value="inactive" ${inactive ? 'selected' : ''}>Ngừng</option>
           </select>`
        : `<span class="badge ${inactive ? 'pending' : 'student'}">${inactive ? 'Ngừng' : 'Đang hoạt động'}</span>`;
      const count = studentCount ? (studentCount[s.id] || 0).toLocaleString('vi-VN') : '—';
      const inputs = repo.INFO_FIELDS.map((k) => `<td><input class="infoInput" data-field="${k}" value="${esc(s[k])}"
        maxlength="500" aria-label="${LABELS[k]} — ${esc(s.name)}" placeholder="${LABELS[k]}"></td>`).join('');
      return `<tr data-id="${esc(s.id)}" class="${inactive ? 'is-inactive' : ''}">
        <td class="school-name">${esc(s.name)}</td>
        <td><code>${esc(s.id)}</code></td>
        <td class="num">${count}</td>
        <td>${status}</td>
        ${inputs}
        <td><button type="button" class="btn btn-ghost saveInfoBtn"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Lưu</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.saveInfoBtn').forEach((btn) => btn.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const cur = schools.find((s) => s.id === id);
      const info = {};
      tr.querySelectorAll('.infoInput').forEach((inp) => { info[inp.dataset.field] = inp.value.trim(); });
      const changed = repo.INFO_FIELDS.filter((k) => (cur[k] || '') !== info[k]);
      if (!changed.length) { toast('Không có thay đổi để lưu.'); return; }
      btn.disabled = true;
      try {
        await repo.updateInfo(id, info);
        changed.forEach((k) => { cur[k] = info[k]; });
        saveList(allSchools);
        logSchoolChange('update_info', id, { fields: changed });
        toast('Đã lưu thông tin trường');
      } catch (err) {
        toast('Lỗi: ' + err.message);
      } finally {
        btn.disabled = false;
      }
    }));

    tbody.querySelectorAll('.statusSelect').forEach((sel) => sel.addEventListener('change', async (e) => {
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const cur = schools.find((s) => s.id === id);
      const status = e.target.value;
      try {
        await repo.setStatus(id, status);
        logSchoolChange('set_status', id, { from: cur.status || 'active', to: status });
        cur.status = status;
        saveList(allSchools);
        render();
        toast(status === 'inactive' ? 'Đã chuyển trường sang Ngừng' : 'Trường hoạt động trở lại');
      } catch (err) {
        e.target.value = cur.status || 'active';
        toast('Lỗi: ' + err.message);
      }
    }));
  }

  // Danh mục trường chỉ vài chục doc nhưng đọc lại ở MỖI lần tải trang (F5 / chuyển trang qua lại): bản đệm theo tab 5 phút,
  // cập nhật ngay khi sửa ở đây (07/11/2026). Trường mới do trang Quản lý tài khoản thêm hiện sau tối đa 5 phút.
  const LIST_KEY = 'admin-schools:list';
  const LIST_TTL_MS = 5 * 60 * 1000;
  async function listSchools() {
    const C = window.EduDataCache;
    const hit = C ? await C.getAsync(LIST_KEY, false) : null;
    if (Array.isArray(hit)) return hit;
    const all = await repo.listAll();
    saveList(all);
    return all;
  }
  function saveList(all) {
    if (window.EduDataCache) window.EduDataCache.setAsync(LIST_KEY, all, LIST_TTL_MS, false);
  }

  async function load() {
    try {
      const all = allSchools = await listSchools();
      if (isAdmin()) {
        schools = all;
      } else {
        // Quản trị trường: chỉ trường được gán (theo tên hoặc schoolId — giống firestore.rules).
        const mine = new Set((profile.schoolIds || []).concat(S.schoolIdsOf(profile.schools || [])));
        schools = all.filter((s) => mine.has(s.id) || (profile.schools || []).includes(s.name));
      }
      document.getElementById('pageHint').textContent = isAdmin()
        ? 'Danh mục tự thêm trường mới theo roster (trang Quản lý tài khoản). "Ngừng" chỉ đánh dấu — không xoá dữ liệu học sinh, kết quả.'
        : 'Cập nhật thông tin liên hệ của trường bạn quản trị. Tên trường do Quản trị viên quản lý.';
      render();
    } catch (err) {
      document.getElementById('schoolRows').innerHTML =
        `<tr><td colspan="9" class="empty-cell">Không tải được danh mục trường: ${esc(err.message)}</td></tr>`;
      return;
    }
    // Số học sinh: bản đệm roster dùng chung với Quản lý lớp / Dashboard (chỉ Admin đọc được cả roster).
    if (isAdmin() && window.EduRosterCache) {
      try {
        const students = await window.EduRosterCache.activeAll();
        studentCount = {};
        students.forEach((st) => {
          const id = st.schoolId || S.schoolIdOf(st.school);
          if (id) studentCount[id] = (studentCount[id] || 0) + 1;
        });
        render();
      } catch (err) {
        console.warn('[AdminSchools] Không đếm được học sinh:', err.message);
      }
    }
  }

  window.addEventListener('edu:ready', ({ detail }) => {
    profile = detail.profile;
    document.getElementById('whoami').textContent =
      `${profile.name || detail.user.email} · ${EduAuth.ROLE_LABEL[profile.role] || profile.role}`;
    load();
  });
})();
