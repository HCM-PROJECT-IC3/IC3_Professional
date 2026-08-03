/* ============================================================
   js/roster-manager.js
   Logic cho trang roster-manager.html — Commit #3 của lộ trình LMAP
   (xem docs/architecture/LMAP-ARCHITECTURE.md, mục 6).

   Trang này cho phép Admin / Điều phối đào tạo quản lý 3 collection
   MỚI (courses, classes, students_roster) thông qua các repository đã
   tạo ở Commit #1 (js/repositories/roster-repository.js). KHÔNG đụng
   tới quiz-engine.js / dashboard.js / firestore.rules hiện có.

   LƯU Ý QUAN TRỌNG: các thao tác ghi ở trang này (thêm/sửa/xoá) chỉ
   thành công SAU KHI bạn đã publish phần bổ sung Firestore Rules trong
   docs/architecture/firestore.rules.PROPOSED-ADDITIONS.txt (Commit #2).
   Trước đó, các nút Lưu/Xoá sẽ báo lỗi "Missing or insufficient
   permissions" — đây là hành vi ĐÚNG (an toàn), không phải lỗi trang.
   ============================================================ */
(function () {
  'use strict';

  // ---- State cục bộ (nạp 1 lần, render lại từ bộ nhớ khi lọc/tìm) ----
  const state = {
    courses: [],
    classes: [],
    students: [],
    teachers: [], // danh sách tài khoản role=teacher đã được duyệt (để gán vào lớp)
  };

  // Sửa hay Thêm mới đang mở trong modal, và loại đối tượng (course|class|student)
  let modalMode = null; // { type: 'course'|'class'|'student', editingId: string|null }

  // ============================================================
  // TIỆN ÍCH DÙNG CHUNG
  // ============================================================
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function logRosterChange(action, targetId, meta) {
    // Ghi audit log — an toàn tuyệt đối, không bao giờ chặn UI nếu lỗi
    // (activity-log-service tự try/catch bên trong EduActivityLog.log).
    if (window.EduActivityLog) {
      window.EduActivityLog.log(window.EduModels.ActivityLog.ACTIONS.UPDATE_ROSTER, {
        targetId, meta: Object.assign({ rosterAction: action }, meta || {}),
      });
    }
  }

  function friendlyError(err) {
    if (err && err.code === 'permission-denied') {
      return 'Chưa có quyền ghi dữ liệu roster — kiểm tra xem Firestore Rules bổ sung (Commit #2) đã được publish chưa.';
    }
    return err && err.message ? err.message : String(err);
  }

  // ============================================================
  // KHỞI ĐỘNG TRANG
  // ============================================================
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    loadEverything();
  });

  async function loadEverything() {
    try {
      const [courses, classes, students, teacherSnap] = await Promise.all([
        window.EduRepositories.course.list({ orderBy: 'name' }),
        window.EduRepositories.class.list({ orderBy: 'name' }),
        window.EduRepositories.studentRoster.list({ orderBy: 'name' }),
        EduFirebase.db.collection('users').where('role', '==', 'teacher').where('approved', '==', true).get(),
      ]);
      state.courses = courses;
      state.classes = classes;
      state.students = students;
      state.teachers = teacherSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));

      renderCourses();
      renderClasses();
      renderStudentClassFilter();
      renderStudents();
    } catch (err) {
      toast('❌ Lỗi tải dữ liệu: ' + friendlyError(err));
    }
  }

  // ============================================================
  // TABS
  // ============================================================
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ============================================================
  // RENDER: KHOÁ HỌC (courses)
  // ============================================================
  const COURSE_LEVEL_LABEL = { thcs: 'THCS', tieu_hoc: 'Tiểu học' };

  function renderCourses() {
    document.getElementById('courseCount').textContent = state.courses.length;
    const tbody = document.getElementById('courseRows');
    if (!state.courses.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Chưa có khoá học nào.</td></tr>';
      return;
    }
    tbody.innerHTML = state.courses.map((c) => {
      const classCount = state.classes.filter((cl) => cl.courseId === c.id).length;
      return `<tr>
        <td>${esc(c.name)}</td>
        <td>${esc(COURSE_LEVEL_LABEL[c.level] || c.level || '—')}</td>
        <td>${classCount}</td>
        <td>
          <button type="button" class="btn-edit-text" data-edit-course="${c.id}">Sửa</button>
          <button type="button" class="btn-danger-text" data-del-course="${c.id}">Xoá</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-course]').forEach((b) => b.addEventListener('click', () => openCourseModal(b.dataset.editCourse)));
    tbody.querySelectorAll('[data-del-course]').forEach((b) => b.addEventListener('click', () => deleteCourse(b.dataset.delCourse)));
  }

  document.getElementById('addCourseBtn').addEventListener('click', () => openCourseModal(null));

  function openCourseModal(id) {
    const course = id ? state.courses.find((c) => c.id === id) : null;
    modalMode = { type: 'course', editingId: id };
    document.getElementById('modalTitle').textContent = id ? '✏️ Sửa khoá học' : '➕ Thêm khoá học';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-group">
        <label for="f-course-name">Tên khoá học</label>
        <input type="text" id="f-course-name" class="form-input" placeholder="VD: IC3 GS6 — THCS" value="${esc(course ? course.name : '')}">
      </div>
      <div class="form-group">
        <label for="f-course-level">Cấp học</label>
        <select id="f-course-level" class="form-input">
          <option value="tieu_hoc" ${course && course.level === 'tieu_hoc' ? 'selected' : ''}>Tiểu học</option>
          <option value="thcs" ${!course || course.level === 'thcs' ? 'selected' : ''}>THCS</option>
        </select>
      </div>`;
    showModal();
  }

  async function saveCourse() {
    const name = document.getElementById('f-course-name').value.trim();
    const level = document.getElementById('f-course-level').value;
    if (!name) { toast('⚠️ Vui lòng nhập tên khoá học'); return; }
    const data = { name, level };
    try {
      if (modalMode.editingId) {
        await window.EduRepositories.course.update(modalMode.editingId, data);
        logRosterChange('update_course', modalMode.editingId, { name });
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const id = await window.EduRepositories.course.create(data);
        logRosterChange('create_course', id, { name });
      }
      toast('✅ Đã lưu khoá học');
      closeModal();
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  async function deleteCourse(id) {
    const hasClasses = state.classes.some((cl) => cl.courseId === id);
    if (hasClasses && !confirm('Khoá học này đang có lớp học gắn với nó. Vẫn xoá?')) return;
    if (!hasClasses && !confirm('Xoá khoá học này?')) return;
    try {
      await window.EduRepositories.course.remove(id);
      logRosterChange('delete_course', id);
      toast('🗑️ Đã xoá khoá học');
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  // ============================================================
  // RENDER: LỚP HỌC (classes)
  // ============================================================
  function renderClasses() {
    document.getElementById('classCount').textContent = state.classes.length;
    const tbody = document.getElementById('classRows');
    if (!state.classes.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Chưa có lớp học nào.</td></tr>';
      return;
    }
    tbody.innerHTML = state.classes.map((cl) => {
      const course = state.courses.find((c) => c.id === cl.courseId);
      const studentCount = state.students.filter((s) => s.classId === cl.id).length;
      return `<tr>
        <td>${esc(cl.name)}</td>
        <td>${esc(course ? course.name : '—')}</td>
        <td>${esc(cl.teacherName || '—')}</td>
        <td>${studentCount}</td>
        <td>
          <button type="button" class="btn-edit-text" data-edit-class="${cl.id}">Sửa</button>
          <button type="button" class="btn-danger-text" data-del-class="${cl.id}">Xoá</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-class]').forEach((b) => b.addEventListener('click', () => openClassModal(b.dataset.editClass)));
    tbody.querySelectorAll('[data-del-class]').forEach((b) => b.addEventListener('click', () => deleteClass(b.dataset.delClass)));
  }

  document.getElementById('addClassBtn').addEventListener('click', () => openClassModal(null));

  function openClassModal(id) {
    const cls = id ? state.classes.find((c) => c.id === id) : null;
    modalMode = { type: 'class', editingId: id };
    document.getElementById('modalTitle').textContent = id ? '✏️ Sửa lớp học' : '➕ Thêm lớp học';

    const courseOptions = state.courses.map((c) =>
      `<option value="${c.id}" ${cls && cls.courseId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('') || '<option value="">(chưa có khoá học nào — tạo khoá học trước)</option>';

    const teacherOptions = '<option value="">— Chưa gán giáo viên —</option>' + state.teachers.map((t) =>
      `<option value="${t.id}" ${cls && cls.teacherId === t.id ? 'selected' : ''}>${esc(t.name || t.email)}</option>`
    ).join('');

    document.getElementById('modalBody').innerHTML = `
      <div class="form-group">
        <label for="f-class-name">Tên lớp</label>
        <input type="text" id="f-class-name" class="form-input" placeholder="VD: 6A1" value="${esc(cls ? cls.name : '')}">
      </div>
      <div class="form-group">
        <label for="f-class-course">Khoá học</label>
        <select id="f-class-course" class="form-input">${courseOptions}</select>
      </div>
      <div class="form-group">
        <label for="f-class-teacher">Giáo viên phụ trách</label>
        <select id="f-class-teacher" class="form-input">${teacherOptions}</select>
      </div>`;
    showModal();
  }

  async function saveClass() {
    const name = document.getElementById('f-class-name').value.trim();
    const courseId = document.getElementById('f-class-course').value;
    const teacherId = document.getElementById('f-class-teacher').value;
    const teacherName = teacherId ? (state.teachers.find((t) => t.id === teacherId) || {}).name || '' : '';
    if (!name) { toast('⚠️ Vui lòng nhập tên lớp'); return; }
    const data = { name, courseId, teacherId, teacherName };
    try {
      if (modalMode.editingId) {
        await window.EduRepositories.class.update(modalMode.editingId, data);
        logRosterChange('update_class', modalMode.editingId, { name });
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const id = await window.EduRepositories.class.create(data);
        logRosterChange('create_class', id, { name });
        // Cập nhật classId cho học sinh nếu thêm lớp mới không ảnh hưởng — bỏ qua.
      }
      toast('✅ Đã lưu lớp học');
      closeModal();
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  async function deleteClass(id) {
    const hasStudents = state.students.some((s) => s.classId === id);
    if (hasStudents && !confirm('Lớp này đang có học sinh. Vẫn xoá lớp (học sinh sẽ không còn gắn lớp)?')) return;
    if (!hasStudents && !confirm('Xoá lớp học này?')) return;
    try {
      await window.EduRepositories.class.remove(id);
      logRosterChange('delete_class', id);
      toast('🗑️ Đã xoá lớp học');
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  // ============================================================
  // RENDER: HỌC SINH (students_roster)
  // ============================================================
  function renderStudentClassFilter() {
    const sel = document.getElementById('studentClassFilter');
    const current = sel.value;
    sel.innerHTML = '<option value="">Tất cả lớp</option>' + state.classes.map((c) =>
      `<option value="${c.id}">${esc(c.name)}</option>`
    ).join('');
    sel.value = current;
  }

  function renderStudents() {
    const search = document.getElementById('studentSearch').value.trim().toLowerCase();
    const classFilter = document.getElementById('studentClassFilter').value;

    const filtered = state.students.filter((s) => {
      if (classFilter && s.classId !== classFilter) return false;
      if (search && !(`${s.name} ${s.mssv}`.toLowerCase().includes(search))) return false;
      return true;
    });

    document.getElementById('studentCount').textContent = `${filtered.length} / ${state.students.length}`;
    const tbody = document.getElementById('studentRows');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Không tìm thấy học sinh nào.</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map((s) => {
      const initials = (s.name || '?').trim().charAt(0).toUpperCase();
      const avatar = s.avatarUrl
        ? `<img src="${esc(s.avatarUrl)}" alt="">`
        : initials;
      const statusOk = s.status === 'active';
      return `<tr>
        <td><div class="avatar-cell">${avatar}</div></td>
        <td>${esc(s.mssv || '—')}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.className || '—')}</td>
        <td>${esc(s.teacherName || '—')}</td>
        <td><span class="badge ${statusOk ? 'active' : 'inactive'}">${statusOk ? 'Đang học' : 'Ngừng học'}</span></td>
        <td>
          <button type="button" class="btn-edit-text" data-edit-student="${s.id}">Sửa</button>
          <button type="button" class="btn-danger-text" data-del-student="${s.id}">Xoá</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit-student]').forEach((b) => b.addEventListener('click', () => openStudentModal(b.dataset.editStudent)));
    tbody.querySelectorAll('[data-del-student]').forEach((b) => b.addEventListener('click', () => deleteStudent(b.dataset.delStudent)));
  }

  document.getElementById('studentSearch').addEventListener('input', renderStudents);
  document.getElementById('studentClassFilter').addEventListener('change', renderStudents);
  document.getElementById('addStudentBtn').addEventListener('click', () => openStudentModal(null));

  function openStudentModal(id) {
    const student = id ? state.students.find((s) => s.id === id) : null;
    modalMode = { type: 'student', editingId: id };
    document.getElementById('modalTitle').textContent = id ? '✏️ Sửa học sinh' : '➕ Thêm học sinh';

    const classOptions = state.classes.map((c) =>
      `<option value="${c.id}" ${student && student.classId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('') || '<option value="">(chưa có lớp nào — tạo lớp trước)</option>';

    document.getElementById('modalBody').innerHTML = `
      <div class="form-group">
        <label for="f-student-mssv">MSSV</label>
        <input type="text" id="f-student-mssv" class="form-input" placeholder="VD: HS0012" value="${esc(student ? student.mssv : '')}">
      </div>
      <div class="form-group">
        <label for="f-student-name">Họ tên</label>
        <input type="text" id="f-student-name" class="form-input" placeholder="VD: Nguyễn Văn A" value="${esc(student ? student.name : '')}">
        <span class="form-hint">Họ tên phải khớp CHÍNH XÁC với tên học sinh nhập lúc làm bài để hệ thống đối chiếu được kết quả.</span>
      </div>
      <div class="form-group">
        <label for="f-student-class">Lớp</label>
        <select id="f-student-class" class="form-input">${classOptions}</select>
      </div>
      <div class="form-group">
        <label for="f-student-avatar">Ảnh đại diện (URL, tuỳ chọn)</label>
        <input type="text" id="f-student-avatar" class="form-input" placeholder="https://..." value="${esc(student ? student.avatarUrl : '')}">
      </div>
      <div class="form-group">
        <label for="f-student-status">Trạng thái</label>
        <select id="f-student-status" class="form-input">
          <option value="active" ${!student || student.status === 'active' ? 'selected' : ''}>Đang học</option>
          <option value="inactive" ${student && student.status === 'inactive' ? 'selected' : ''}>Ngừng học</option>
        </select>
      </div>`;
    showModal();
  }

  async function saveStudent() {
    const mssv = document.getElementById('f-student-mssv').value.trim();
    const name = document.getElementById('f-student-name').value.trim();
    const classId = document.getElementById('f-student-class').value;
    const avatarUrl = document.getElementById('f-student-avatar').value.trim();
    const status = document.getElementById('f-student-status').value;
    if (!name) { toast('⚠️ Vui lòng nhập họ tên học sinh'); return; }

    const cls = state.classes.find((c) => c.id === classId);
    const data = {
      mssv, name, avatarUrl, status,
      classId: classId || '',
      className: cls ? cls.name : '',
      teacherId: cls ? cls.teacherId || '' : '',
      teacherName: cls ? cls.teacherName || '' : '',
    };
    try {
      if (modalMode.editingId) {
        await window.EduRepositories.studentRoster.update(modalMode.editingId, data);
        logRosterChange('update_student', modalMode.editingId, { name });
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const id = await window.EduRepositories.studentRoster.create(data);
        logRosterChange('create_student', id, { name });
      }
      toast('✅ Đã lưu học sinh');
      closeModal();
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  async function deleteStudent(id) {
    const student = state.students.find((s) => s.id === id);
    if (!confirm(`Xoá học sinh "${student ? student.name : ''}" khỏi danh sách?`)) return;
    try {
      await window.EduRepositories.studentRoster.remove(id);
      logRosterChange('delete_student', id);
      toast('🗑️ Đã xoá học sinh');
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    }
  }

  // ============================================================
  // MODAL DÙNG CHUNG
  // ============================================================
  function showModal() {
    document.getElementById('modalOverlay').classList.add('show');
  }
  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
    modalMode = null;
  }
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.getElementById('modalSaveBtn').addEventListener('click', () => {
    if (!modalMode) return;
    if (modalMode.type === 'course') saveCourse();
    else if (modalMode.type === 'class') saveClass();
    else if (modalMode.type === 'student') saveStudent();
  });
})();
