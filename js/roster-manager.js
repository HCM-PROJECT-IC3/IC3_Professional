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

  let myProfile = null; // hồ sơ users/{uid} của người đang đăng nhập (Admin/Điều phối đào tạo)

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    myProfile = profile;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    loadEverything();
  });

  /** where('in', ...) tối đa 10 giá trị — chia nhỏ "schools" thành từng
   * nhóm ≤10 rồi gộp kết quả lại (giống js/coordinator/data-loader.js). */
  function chunk10(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
    return out;
  }

  async function loadEverything() {
    try {
      // Điều phối đào tạo (Commit #7/LMAP): firestore.rules giờ chỉ cho đọc
      // students_roster trong (các) trường đã được Admin gán ở "schools" —
      // TRƯỚC ĐÂY trang này tải KHÔNG lọc gì (list({orderBy:'name'})), vốn
      // hoạt động vì coordinator từng mặc định xem hết; giờ 1 query không
      // where(...,'in', schools) sẽ bị Firestore từ chối HẲN cho coordinator
      // (không tự lọc giúp, xem canAccessRosterStudent() trong firestore.rules).
      // Admin vẫn tải không lọc (đúng quyền isAdmin()).
      const isAdmin = myProfile.role === 'admin';
      const schools = Array.isArray(myProfile.schools) ? myProfile.schools.filter(Boolean) : [];
      if (!isAdmin && !schools.length) {
        toast('⚠️ Bạn chưa được Admin gán trường nào để hỗ trợ — liên hệ Admin (Quản lý tài khoản → Trường được xem/hỗ trợ).');
        state.courses = []; state.classes = []; state.students = []; state.teachers = [];
        renderCourses(); renderClasses(); renderStudentClassFilter(); renderStudents();
        return;
      }

      const [courses, classes, students, teacherSnap] = await Promise.all([
        window.EduRepositories.course.list({ orderBy: 'name' }),
        window.EduRepositories.class.list({ orderBy: 'name' }),
        isAdmin
          ? window.EduRepositories.studentRoster.list({ orderBy: 'name' })
          // CỐ TÌNH KHÔNG dùng listBySchools() (chỉ lọc status "active") — trang
          // này cần quản lý CẢ học sinh đã nghỉ/đã tốt nghiệp (đổi trạng thái,
          // xem lại lịch sử...), nên lọc trực tiếp theo "school" mà không kèm
          // điều kiện status. KHÔNG truyền orderBy ở query này (where('in',...)
          // + orderBy field khác đòi hỏi composite index phải tạo tay trong
          // Firebase Console — không có sẵn) — sắp xếp lại theo tên ở JS sau khi
          // gộp các chunk thay vì nhờ Firestore sắp xếp.
          : Promise.all(chunk10(schools).map((part) => window.EduRepositories.studentRoster.list({ where: [['school', 'in', part]] })))
              .then((parts) => parts.flat().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'))),
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

      await repairKnownBadTeacherNames();
      await renameGenericCourseNames();
      await repairDuplicateCourses();
    } catch (err) {
      toast('❌ Lỗi tải dữ liệu: ' + friendlyError(err));
    }
  }

  /** Đổi lại tên các khoá học đang để trần "Khối N" (do 1 bản cũ của
   * courseInfoForGrade() tự tạo lúc "📥 Nạp từ Excel") thành "Khoá học
   * Khối N" — tên trần "Khối 3" dễ bị nhìn nhầm thành tên LỚP (lớp thật
   * sự tên kiểu "3/11"), gây rối vì 2 khái niệm khác nhau (khối = cấp
   * học, lớp = 1 lớp cụ thể trong khối đó) lại trông giống hệt nhau ở
   * cột "Tên khoá học". Chạy TRƯỚC repairDuplicateCourses() để các khoá
   * học cùng khối sau khi đổi tên vẫn được nhóm đúng và gộp trùng bình
   * thường. An toàn để chạy nhiều lần (không làm gì nếu đã đổi tên). */
  async function renameGenericCourseNames() {
    const BARE_GRADE_NAME = /^Khối\s*(\d+)$/i;
    let renamed = 0;
    for (const c of state.courses) {
      const m = BARE_GRADE_NAME.exec((c.name || '').trim());
      if (!m) continue;
      const newName = `Khoá học Khối ${parseInt(m[1], 10)}`;
      await window.EduRepositories.course.update(c.id, { name: newName });
      c.name = newName;
      renamed++;
    }
    if (renamed) {
      renderCourses();
      toast(`🔧 Đã đổi tên ${renamed} khoá học "Khối N" → "Khoá học Khối N" cho rõ nghĩa (không nhầm với tên lớp)`);
    }
  }

  /** Gộp các "Khoá học" bị trùng TÊN (vd 3 khoá học cùng tên "Khối 3") —
   * hậu quả của việc tự tạo khoá học lúc "📥 Nạp từ Excel" (xem
   * courseInfoForGrade/renderImportPreview phía dưới) chỉ kiểm tra trùng
   * tên dựa trên state.courses đã nạp SẴN TRONG BỘ NHỚ của phiên đó —
   * nếu 2 người cùng nạp Excel gần như đồng thời (mỗi người 1 file lớp
   * khác nhau nhưng cùng khối), cả 2 đều không thấy khoá học của người
   * kia trong state.courses của mình → mỗi người tự tạo 1 khoá học mới
   * trùng tên. Giữ lại khoá học có createdAt SỚM NHẤT (hoặc bản ghi đầu
   * tiên nếu thiếu createdAt), chuyển hết "classes" đang trỏ courseId
   * của các bản trùng còn lại sang khoá học được giữ, rồi xoá bản trùng.
   * Chạy mỗi lần tải trang, không làm gì nếu không có trùng tên. */
  async function repairDuplicateCourses() {
    const groups = new Map(); // normalizedName -> [course,...]
    state.courses.forEach((c) => {
      const key = stripDiacritics(c.name || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    });

    const toMs = (c) => (c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : Infinity);
    let mergedCount = 0, deletedCount = 0;

    for (const dupes of groups.values()) {
      if (dupes.length < 2) continue;
      const sorted = [...dupes].sort((a, b) => toMs(a) - toMs(b));
      const keep = sorted[0];
      const drop = sorted.slice(1);
      for (const d of drop) {
        const affectedClasses = state.classes.filter((cl) => cl.courseId === d.id);
        for (const cl of affectedClasses) {
          await window.EduRepositories.class.update(cl.id, { courseId: keep.id });
          cl.courseId = keep.id;
          mergedCount++;
        }
        await window.EduRepositories.course.remove(d.id);
        state.courses = state.courses.filter((c) => c.id !== d.id);
        deletedCount++;
      }
    }

    if (deletedCount) {
      renderCourses();
      renderClasses();
      toast(`🔧 Đã gộp ${deletedCount} khoá học trùng tên (chuyển ${mergedCount} lớp về khoá học giữ lại)`);
    }
  }

  /** Tự sửa 1 lần dữ liệu GV bị đọc sai từ 1 lần nhập cũ (trước khi
   * extractTeacherNameFromSheet() được vá lỗi bỏ ngoặc dư / chữ mẫu chưa
   * điền — xem hàm đó): lớp 3/11 và 3/12 trường "TiH Phan Chu Trinh" đang
   * lưu literal "(Nguyễn Tuyết Nhi)" / "(Tên lót + Tên)" làm teacherName,
   * trong khi đối chiếu sheet gốc ("Nhi - FORM QUẢN LÝ LỚP 3.xlsx") cả 2
   * lớp đều do cô Nguyễn Tuyết Nhi phụ trách. Chạy mỗi lần tải trang,
   * không làm gì nếu dữ liệu đã đúng (an toàn để chạy nhiều lần) — có thể
   * xoá đoạn này sau khi xác nhận dữ liệu đã sạch. */
  async function repairKnownBadTeacherNames() {
    const SCHOOL = 'TiH Phan Chu Trinh';
    const CLASS_NAMES = ['3/11', '3/12'];
    const BAD_VALUES = ['(Nguyễn Tuyết Nhi)', '(Tên lót + Tên)'];
    const CORRECT_NAME = 'Nguyễn Tuyết Nhi';

    const badStudents = state.students.filter((s) =>
      s.school === SCHOOL && CLASS_NAMES.includes(s.className) && BAD_VALUES.includes(s.teacherName));
    for (const s of badStudents) {
      await window.EduRepositories.studentRoster.update(s.id, { teacherName: CORRECT_NAME });
      s.teacherName = CORRECT_NAME;
    }

    const badClasses = state.classes.filter((cl) =>
      CLASS_NAMES.includes(cl.name) && BAD_VALUES.includes(cl.teacherName));
    for (const cl of badClasses) {
      await window.EduRepositories.class.update(cl.id, { teacherName: CORRECT_NAME });
      cl.teacherName = CORRECT_NAME;
    }

    if (badStudents.length || badClasses.length) {
      renderClasses();
      renderStudents();
      toast(`🔧 Đã tự sửa GV → "${CORRECT_NAME}" cho ${badStudents.length} học sinh + ${badClasses.length} lớp (${SCHOOL}, ${CLASS_NAMES.join(' & ')})`);
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
    // Chặn trùng tên (đã xảy ra thật — xem repairDuplicateCourses): 1 khối
    // chỉ nên có 1 khoá học, trùng tên chỉ gây rối chứ không có tác dụng gì.
    const dup = state.courses.find((c) =>
      stripDiacritics(c.name) === stripDiacritics(name) && c.id !== modalMode.editingId);
    if (dup) { toast(`⚠️ Đã có khoá học tên "${dup.name}" rồi — sửa khoá học đó thay vì tạo trùng.`); return; }
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
      if (search && !(`${s.name} ${s.mssv} ${s.school || ''}`.toLowerCase().includes(search))) return false;
      return true;
    });

    document.getElementById('studentCount').textContent = `${filtered.length} / ${state.students.length}`;
    const tbody = document.getElementById('studentRows');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">Không tìm thấy học sinh nào.</td></tr>';
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
        <td>${esc(s.school || '—')}</td>
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

  // ============================================================
  // XUẤT JSON TĨNH cho index.html (js/lobby-roster.js đọc file này
  // thay vì gọi Firestore trực tiếp — xem ghi chú đầu file
  // js/lobby-roster.js để biết lý do: tránh nổ quota đọc Firestore
  // (mỗi lần mở/tải lại index.html trước đây tốn 1 lượt đọc × số học
  // sinh "active"). File xuất ra là NGUỒN TĨNH — nút chính
  // "🚀 Cập nhật cho học sinh" (publishRosterToGitHub, phía dưới) tự
  // đẩy file này lên GitHub qua API. Hàm exportRosterJson() dưới đây
  // chỉ còn là NÚT DỰ PHÒNG (tải file JSON về tay) cho lúc không dùng
  // được token GitHub.
  // ============================================================
  function buildRosterExportPayload() {
    const students = state.students
      .filter((s) => s.status === 'active' && s.name)
      .map((s) => ({ school: s.school || '', className: s.className || '', name: s.name }))
      .sort((a, b) =>
        String(a.school).localeCompare(String(b.school), 'vi') ||
        String(a.className).localeCompare(String(b.className), 'vi') ||
        String(a.name).localeCompare(String(b.name), 'vi'));

    return {
      version: new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14),
      generatedAt: new Date().toISOString(),
      count: students.length,
      students,
    };
  }

  function exportRosterJson() {
    const payload = buildRosterExportPayload();
    if (!payload.count) {
      toast('⚠️ Chưa có học sinh "Đang học" nào để xuất.');
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-active.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logRosterChange('export_json', null, { count: payload.count });
    toast(`📤 Đã tải file — chép đè vào data/roster/students-active.json rồi commit + push lên GitHub (${payload.count} học sinh).`);
  }

  document.getElementById('exportRosterJsonBtn').addEventListener('click', exportRosterJson);

  // ============================================================
  // CẬP NHẬT TỰ ĐỘNG CHO index.html — ĐẨY THẲNG data/roster/students-active.json
  // LÊN GITHUB QUA API (window.EduGitHubPublish, xem js/github-publish.js),
  // KHÔNG cần tải file + git commit + push thủ công nữa. Vẫn ghi ra
  // CÙNG 1 file tĩnh (không đổi kiến trúc "index.html đọc file tĩnh,
  // không gọi Firestore trực tiếp" — lý do bảo mật/quota vẫn còn
  // nguyên, xem ghi chú ở buildRosterExportPayload phía trên), chỉ tự
  // động hoá bước cuối.
  // ============================================================
  async function publishRosterToGitHub() {
    const payload = buildRosterExportPayload();
    if (!payload.count) {
      toast('⚠️ Chưa có học sinh "Đang học" nào để cập nhật.');
      return;
    }
    const btn = document.getElementById('publishRosterGitHubBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Đang cập nhật...';
    try {
      await window.EduGitHubPublish.publishFiles(
        [{ path: 'data/roster/students-active.json', content: JSON.stringify(payload, null, 2) }],
        `chore(roster): cập nhật danh sách học sinh (${payload.count} HS, ${payload.version})`
      );
      logRosterChange('publish_json_github', null, { count: payload.count });
      toast(`🚀 Đã cập nhật lên GitHub (${payload.count} học sinh) — index.html sẽ thấy sau khoảng 1 phút.`);
    } catch (err) {
      toast('❌ Cập nhật GitHub thất bại: ' + friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  document.getElementById('publishRosterGitHubBtn').addEventListener('click', publishRosterToGitHub);

  // ============================================================
  // NẠP HỌC SINH TỪ FILE EXCEL (.xlsx/.xls) — đọc bằng SheetJS ngay
  // trên trình duyệt, KHÔNG dùng file làm nguồn dữ liệu thường trực:
  // chỉ dùng 1 LẦN để đổ vào Firestore (students_roster), sau đó
  // trang danh sách học sinh vẫn hiển thị dữ liệu Firestore như bình
  // thường. Đây là nơi DUY NHẤT trong hệ thống có nút nạp Excel —
  // KHÔNG đặt ở index.html (trang học sinh làm bài) để tránh lộ thao
  // tác quản trị ra màn hình công khai.
  // ============================================================
  const IMPORT_HEADER_ALIASES = {
    mssv:      ['mssv', 'ma so hoc sinh', 'ma hoc sinh', 'ma so sinh vien', 'id', 'student id'],
    name:      ['ho va ten', 'hovaten', 'hoten', 'ten', 'ten hoc sinh', 'name', 'fullname', 'hotenhocsinh'],
    school:    ['truong', 'ten truong', 'truonghoc', 'school'],
    className: ['lop', 'ten lop', 'class', 'classname'],
  };
  let pendingImportRows = []; // kết quả phân tích, chờ người dùng bấm "Nạp danh sách"
  let pendingImportFormat = 'flat'; // 'flat' (1 sheet, 1 hàng tiêu đề) | 'classSheet' (mỗi sheet = 1 lớp, kiểu FORM QUẢN LÝ LỚP)

  function stripDiacritics(str) {
    return String(str ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /** Chuẩn hoá tên cột thành 1 khoá chỉ gồm a-z0-9 — dùng riêng để dò tiêu
   * đề dạng "classSheet" (VD "MÃ SỐ HS" -> "masohs", "HỌ & TÊN " -> "hoten"),
   * vì các mẫu này có thêm khoảng trắng/ký tự "&" mà bảng alias của định
   * dạng "flat" phía trên không cover hết. */
  function normalizeHeaderKey(cell) {
    return stripDiacritics(cell).replace(/[^a-z0-9]/g, '');
  }

  function matchImportHeader(cell) {
    const norm = stripDiacritics(cell);
    for (const key of Object.keys(IMPORT_HEADER_ALIASES)) {
      if (IMPORT_HEADER_ALIASES[key].includes(norm)) return key;
    }
    return null;
  }

  function parseFlatWorkbook(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) throw new Error('File Excel không có dữ liệu.');

    const colMap = {};
    rows[0].forEach((cell, idx) => {
      const key = matchImportHeader(cell);
      if (key) colMap[key] = idx;
    });
    if (colMap.name === undefined) {
      throw new Error('Không tìm thấy cột "Họ và tên". Đặt tên cột: MSSV / Trường / Lớp / Họ và tên.');
    }

    const cell = (row, key) => (colMap[key] !== undefined ? String(row[colMap[key]] ?? '').trim() : '');
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = cell(row, 'name');
      if (!name && !cell(row, 'mssv')) continue; // dòng trống hoàn toàn
      out.push({ mssv: cell(row, 'mssv'), name, school: cell(row, 'school'), className: cell(row, 'className') });
    }
    if (!out.length) throw new Error('Không đọc được học sinh nào (kiểm tra cột "Họ và tên").');
    return out;
  }

  /* ------------------------------------------------------------
     ĐỊNH DẠNG "classSheet": file kiểu FORM QUẢN LÝ LỚP (mỗi sheet là
     1 lớp — ô A1 = "TRƯỜNG", A2 = "LỚP:", có hàng tiêu đề "MÃ SỐ HS" /
     "HỌ & TÊN" và 1 ô "TÊN GV ..." — xem On_Tap_MOS/FORM QUẢN LÝ LỚP
     4.xlsx). Nhận diện TỰ ĐỘNG (không cần người dùng chọn định dạng) để
     tận dụng luôn dữ liệu Trường/Lớp/GV có sẵn trong file thay vì bắt
     nhập lại — bấm cùng 1 nút "📥 Nạp từ Excel" cho cả 2 kiểu file.
     ------------------------------------------------------------ */
  const CLASS_SHEET_SKIP_SHEETS = ['CÔNG CỤ ÔN TẬP', 'BÁO GIẢNG']; // sheet tiện ích, không phải danh sách lớp

  function extractTeacherNameFromSheet(rows) {
    for (const row of rows) {
      for (const raw0 of row) {
        const raw = String(raw0 || '');
        if (!raw) continue;
        if (normalizeHeaderKey(raw).indexOf('tengv') !== 0) continue;
        // "GV" không có dấu nên vị trí trong chuỗi gốc không lệch do NFD —
        // an toàn khi cắt chuỗi gốc theo vị trí tìm được trên chuỗi gốc.
        const idx = raw.search(/gv/i);
        if (idx === -1) continue;
        let name = raw.slice(idx + 2).trim();
        // Bỏ ngoặc đơn thừa quanh tên nếu GV lỡ gõ cả ngoặc (VD ô ghi
        // "TÊN GV (Nguyễn Tuyết Nhi)" thay vì "TÊN GV Nguyễn Tuyết Nhi").
        name = name.replace(/^\(([^()]+)\)$/, '$1').trim();
        // Ô vẫn còn nguyên chữ mẫu hướng dẫn chưa điền (VD "(Tên lót +
        // Tên)") — coi như chưa có tên, đọc tiếp ô "TÊN GV" khác (nếu có)
        // thay vì trả về luôn chữ mẫu này làm tên GV.
        if (!name || stripDiacritics(name).indexOf('ten lot') === 0) continue;
        return name;
      }
    }
    return '';
  }

  function parseClassSheetWorkbook(workbook) {
    const out = [];
    for (const sheetName of workbook.SheetNames) {
      if (CLASS_SHEET_SKIP_SHEETS.some((s) => stripDiacritics(s) === stripDiacritics(sheetName))) continue;
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      if (!rows.length || normalizeHeaderKey(rows[0][0]) !== 'truong') continue; // không đúng cấu trúc mong đợi

      const school = String((rows[0] || [])[1] || '').trim();
      const className = String((rows[1] || [])[1] || '').trim();
      if (!className) continue;
      const teacherName = extractTeacherNameFromSheet(rows);

      // Dò hàng tiêu đề chứa "MÃ SỐ HS" trong vài hàng đầu (không cố định
      // số hàng — file mẫu có 4 hàng banner/merge phía trên hàng tiêu đề).
      let headerIdx = -1, colMssv = -1, colName = -1;
      for (let i = 0; i < Math.min(rows.length, 12); i++) {
        const normRow = rows[i].map(normalizeHeaderKey);
        const mIdx = normRow.indexOf('masohs');
        if (mIdx !== -1) {
          headerIdx = i; colMssv = mIdx;
          colName = normRow.findIndex((h) => h === 'hoten' || h === 'hovaten');
          break;
        }
      }
      if (headerIdx === -1 || colName === -1) continue; // sheet lạ — bỏ qua an toàn, không đoán bừa cột

      // LƯU Ý: ngay sau hàng tiêu đề còn 5 hàng phụ (THỨ/NGÀY/TÊN GV/BÀI
      // DẠY/ĐÃ HOÀN THÀNH — thuộc khối lịch giảng dạy, KHÔNG phải học
      // sinh) có cột MÃ SỐ HS/HỌ & TÊN trống — phải BỎ QUA (không dừng)
      // các hàng này trước khi gặp học sinh đầu tiên. Ngược lại, phía
      // DƯỚI danh sách học sinh thật, sheet có sẵn các hàng "trắng" đã
      // đánh số thứ tự tiếp (VD "IC3 - 30", "IC3 - 31"...) nhưng KHÔNG
      // có tên — đây là chỗ trống định dạng sẵn cho HS mới, phải DỪNG
      // ngay khi gặp (không phải bỏ qua) một khi đã bắt đầu đọc được học
      // sinh thật. Vì vậy: bỏ qua hàng trống TRƯỚC khi có học sinh đầu
      // tiên, nhưng dừng hẳn ở hàng trống ĐẦU TIÊN sau khi đã có học sinh.
      let started = false;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const mssv = String(row[colMssv] || '').trim();
        const name = String(row[colName] || '').trim();
        if (!name) {
          if (started) break; // hết danh sách học sinh thật của lớp này
          continue; // vẫn đang ở vùng hàng phụ phía trên, chưa tới học sinh
        }
        started = true;
        out.push({ mssv, name, school, className, teacherName });
      }
    }
    return out;
  }

  function parseImportWorkbook(workbook) {
    const classSheetRows = parseClassSheetWorkbook(workbook);
    if (classSheetRows.length) return { format: 'classSheet', rows: classSheetRows };
    return { format: 'flat', rows: parseFlatWorkbook(workbook) };
  }

  /** Suy ra "Khối X" từ số đầu tiên trong tên lớp (VD "4A1" -> khối 4) —
   * chỉ dùng cho định dạng classSheet để tự động điền tab "Khoá học",
   * KHÔNG áp dụng cho định dạng flat (tránh tạo khoá học không rõ nguồn
   * gốc từ 1 dòng Excel đơn lẻ không có ngữ cảnh khối lớp). */
  function courseGradeFromClassName(className) {
    const m = String(className || '').match(/(\d+)/);
    return m ? m[1] : '';
  }
  // Tên khoá học đặt "Khoá học Khối N" (KHÔNG để trần "Khối N") — để trần
  // dễ nhầm với tên LỚP (khái niệm khác: "Khối" là cấp học, "Lớp" là lớp cụ
  // thể như "3/11"), người dùng phản ánh nhìn tên khoá học "Khối 3" cứ như
  // đang xem tên lớp, thiếu logic. Xem thêm renameGenericCourseNames() —
  // hàm tự đổi lại các khoá học cũ đã lỡ tạo theo tên trần này.
  function courseInfoForGrade(grade) {
    const g = parseInt(grade, 10);
    if (!g) return null;
    return { name: `Khoá học Khối ${g}`, level: g <= 5 ? 'tieu_hoc' : 'thcs' };
  }

  /** Slug an toàn để dùng làm ID Firestore (chỉ a-z0-9 và dấu gạch ngang). */
  function docIdSlug(str) {
    const s = stripDiacritics(str).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'x';
  }

  /** ID học sinh dự kiến sẽ ghi vào Firestore — QUAN TRỌNG: file dạng
   * classSheet dùng "Mã số HS" kiểu "IC3 - 1" chỉ đánh số LẠI TỪ ĐẦU ở
   * mỗi lớp (không duy nhất toàn trường) — nếu dùng thẳng làm ID như định
   * dạng "flat" thì học sinh IC3-1 của lớp 4A1 và 4A2 sẽ GHI ĐÈ lẫn nhau.
   * Ghép thêm tên lớp vào khoá để đảm bảo duy nhất, đồng thời khoá này ổn
   * định qua các lần nạp lại (nạp lại cùng file → cập nhật, không tạo trùng).
   *
   * SỬA (phát hiện qua báo cáo "K4 chỉ có 4 học sinh mới" dù nạp 92 dòng):
   * ghép thêm TÊN TRƯỜNG vào khoá — nhiều trường DÙNG CHUNG tên lớp kiểu
   * "4A5"/"4A3" (khuôn "FORM QUẢN LÝ LỚP" đánh số lại từ đầu mỗi trường,
   * đã xác nhận trong data/roster/students-active.json: "4A3"/"4A5" tồn
   * tại ở CẢ "TIH VÕ VĂN TẦN" lẫn "TIH NGUYỄN TRUNG NGẠN"), nên khoá cũ
   * (chỉ lớp + mã số) của "4A5" trường A và "4A5" trường B TRÙNG NHAU —
   * nạp lớp "4A5" của 1 trường sẽ vô tình khớp trúng ID học sinh của
   * TRƯỜNG KHÁC, bị xếp nhầm "Cập nhật" thay vì "Mới", rồi GHI ĐÈ (merge)
   * lên đúng bản ghi của trường kia khi bấm Nạp — chính là nguyên nhân
   * "chỉ 4 học sinh mới" dù cả lớp thật ra là học sinh mới hoàn toàn.
   * Học sinh ĐÃ NẠP TRƯỚC ĐÂY (khoá cũ, không có trường) vẫn được nhận
   * diện đúng qua fallback so khớp tên+lớp+TRƯỜNG bên dưới (dùng existingId
   * gốc để cập nhật, không đổi ID) — chỉ học sinh MỚI TẠO từ giờ mới dùng
   * khoá mới (có trường) để tránh trùng lặp về sau. */
  function studentDocIdFor(r, format) {
    if (format === 'classSheet') return `${docIdSlug(r.school)}_${docIdSlug(r.className)}_${docIdSlug(r.mssv || r.name)}`;
    return r.mssv || null; // định dạng flat: giữ nguyên hành vi cũ (không đổi để tránh ảnh hưởng dữ liệu đã nạp trước đây)
  }

  /** Gắn nhãn new/update/skip cho từng dòng đã đọc, dựa trên dữ liệu hiện có trong state. */
  function classifyImportRows(rows, format) {
    return rows.map((r) => {
      if (!r.name) return Object.assign({}, r, { action: 'skip', reason: 'Thiếu họ tên' });

      const expectedDocId = studentDocIdFor(r, format);
      // MỌI so khớp với học sinh ĐÃ CÓ đều bắt buộc kèm ĐÚNG TRƯỜNG — tránh
      // nạp lớp "4A5" của trường này lại khớp/ghi đè học sinh "4A5" của
      // trường khác (xem chú thích studentDocIdFor() ở trên).
      const sameSchool = (s) => stripDiacritics(s.school || '') === stripDiacritics(r.school || '');
      let existing = null;
      if (format === 'classSheet') {
        existing = expectedDocId ? state.students.find((s) => s.id === expectedDocId && sameSchool(s)) : null;
      } else {
        existing = r.mssv ? state.students.find((s) => s.mssv && s.mssv.toLowerCase() === r.mssv.toLowerCase() && sameSchool(s)) : null;
      }
      if (!existing) {
        existing = state.students.find((s) => sameSchool(s) && stripDiacritics(s.name) === stripDiacritics(r.name)
          && stripDiacritics(s.className || '') === stripDiacritics(r.className || ''));
      }

      // "classes" KHÔNG có field trường (schema không hỗ trợ, xem
      // firestore.rules) nên vẫn chỉ so khớp theo tên lớp — 2 trường cùng
      // tên lớp "4A5" VẪN dùng chung 1 document "classes" (hạn chế đã biết,
      // KHÔNG sửa trong đợt này vì cần đổi schema + di trú dữ liệu, phạm vi
      // rộng hơn lỗi học sinh bị ghi đè đang sửa ở đây).
      const matchedClass = state.classes.find((c) => stripDiacritics(c.name) === stripDiacritics(r.className || ''));
      return Object.assign({}, r, {
        action: existing ? 'update' : 'new',
        existingId: existing ? existing.id : null,
        expectedDocId,
        willCreateClass: !!r.className && !matchedClass,
        matchedClassId: matchedClass ? matchedClass.id : null,
        matchedClassTeacher: matchedClass ? { id: matchedClass.teacherId || '', name: matchedClass.teacherName || '' } : null,
      });
    });
  }

  function renderImportPreview() {
    const rows = pendingImportRows;
    const isClassSheet = pendingImportFormat === 'classSheet';
    const nNew = rows.filter((r) => r.action === 'new').length;
    const nUpdate = rows.filter((r) => r.action === 'update').length;
    const nSkip = rows.filter((r) => r.action === 'skip').length;
    const newClasses = [...new Set(rows.filter((r) => r.willCreateClass).map((r) => r.className))];
    // Chỉ tính khoá học MỚI (Khối X) cho định dạng classSheet — flat không
    // đụng tới tab "Khoá học" để tránh phát sinh dữ liệu không liên quan.
    const newCourseNames = isClassSheet
      ? [...new Set(newClasses.map((cn) => {
          const info = courseInfoForGrade(courseGradeFromClassName(cn));
          return info ? info.name : null;
        }).filter(Boolean))]
      : [];
    const teacherNames = isClassSheet
      ? [...new Set(rows.filter((r) => r.teacherName).map((r) => r.teacherName))]
      : [];

    const tagHtml = { new: '<span class="import-tag new">Mới</span>', update: '<span class="import-tag update">Cập nhật</span>', skip: '<span class="import-tag skip">Bỏ qua</span>' };
    const rowsHtml = rows.map((r) => `
      <tr class="${r.action === 'skip' ? 'import-row-err' : r.willCreateClass ? 'import-row-warn' : ''}">
        <td>${tagHtml[r.action]}</td>
        <td>${esc(r.mssv || '—')}</td>
        <td>${esc(r.name || '—')}</td>
        <td>${esc(r.school || '—')}</td>
        <td>${esc(r.className || '—')}${r.willCreateClass ? ' <span class="import-tag update">Lớp mới</span>' : ''}</td>
        ${isClassSheet ? `<td>${esc(r.teacherName || '—')}</td>` : ''}
      </tr>`).join('');

    const formatHint = isClassSheet
      ? `Nhận diện đúng định dạng <b>"FORM QUẢN LÝ LỚP"</b> (mỗi sheet = 1 lớp) — Trường/Lớp/GV phụ trách được đọc thẳng từ file, không cần nhập tay.
         ${newClasses.length ? `Sẽ tự tạo ${newClasses.length} lớp mới: <b>${newClasses.map(esc).join(', ')}</b>.` : ''}
         ${newCourseNames.length ? ` Sẽ tự tạo khoá học: <b>${newCourseNames.map(esc).join(', ')}</b>.` : ''}
         ${teacherNames.length ? ` Giáo viên phụ trách theo file: <b>${teacherNames.map(esc).join(', ')}</b>${teacherNames.length > 1 ? ' — kiểm tra lại nếu 1 lớp chỉ nên có 1 GV.' : ''}.` : ''}`
      : `File cần có cột <b>Họ và tên</b> (bắt buộc), và tuỳ chọn <b>MSSV</b>, <b>Trường</b>, <b>Lớp</b>.
         Học sinh trùng MSSV (hoặc trùng Họ tên + Lớp) sẽ được <b>cập nhật</b> thay vì tạo trùng.
         ${newClasses.length ? `Sẽ tự tạo ${newClasses.length} lớp mới: <b>${newClasses.map(esc).join(', ')}</b>.` : ''}`;

    document.getElementById('importModalBody').innerHTML = `
      <div class="import-hint">${formatHint}</div>
      <div class="import-summary">
        <div class="import-stat ok"><b>${nNew}</b><span>Học sinh mới</span></div>
        <div class="import-stat"><b>${nUpdate}</b><span>Cập nhật</span></div>
        <div class="import-stat ${nSkip ? 'err' : ''}"><b>${nSkip}</b><span>Bỏ qua</span></div>
      </div>
      <div class="import-preview-scroll">
        <table>
          <thead><tr><th></th><th>MSSV</th><th>Họ tên</th><th>Trường</th><th>Lớp</th>${isClassSheet ? '<th>GV phụ trách</th>' : ''}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    const confirmBtn = document.getElementById('importConfirmBtn');
    confirmBtn.disabled = !(nNew + nUpdate);
    confirmBtn.textContent = `💾 Nạp ${nNew + nUpdate} học sinh`;
  }

  function openImportModal() {
    document.getElementById('importModalOverlay').classList.add('show');
  }
  function closeImportModal() {
    document.getElementById('importModalOverlay').classList.remove('show');
    pendingImportRows = [];
    pendingImportFormat = 'flat';
  }
  document.getElementById('importModalCloseBtn').addEventListener('click', closeImportModal);
  document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
  document.getElementById('importModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'importModalOverlay') closeImportModal();
  });

  document.getElementById('importExcelBtn').addEventListener('click', () => document.getElementById('importExcelInput').click());
  document.getElementById('importExcelInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!window.XLSX) { toast('⚠️ Chưa tải được thư viện đọc Excel, kiểm tra mạng rồi thử lại.'); return; }
    const reader = new FileReader();
    reader.onerror = () => toast('⚠️ Không đọc được file, thử lại.');
    reader.onload = (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'array' });
        const parsed = parseImportWorkbook(workbook);
        pendingImportFormat = parsed.format;
        pendingImportRows = classifyImportRows(parsed.rows, parsed.format);
        renderImportPreview();
        openImportModal();
      } catch (err) {
        toast('⚠️ ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  document.getElementById('importConfirmBtn').addEventListener('click', async () => {
    const rows = pendingImportRows.filter((r) => r.action !== 'skip');
    if (!rows.length) return;
    const btn = document.getElementById('importConfirmBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang nạp...';
    const isClassSheet = pendingImportFormat === 'classSheet';
    try {
      const db = window.EduFirebase.db;
      const courseCol = window.EduRepositories.course.col();
      const classCol = window.EduRepositories.class.col();
      const studentCol = window.EduRepositories.studentRoster.col();

      let batch = db.batch();
      let ops = 0;

      // 0) (chỉ định dạng classSheet) tự tạo Khoá học theo khối lớp (suy ra
      // từ số trong tên lớp, VD "4A1" -> "Khối 4") nếu chưa có sẵn — giúp
      // tab "Khoá học" có dữ liệu thật thay vì bỏ trống, tận dụng đúng cấu
      // trúc lớp có sẵn trong file thay vì bịa thêm khái niệm mới.
      const courseIdByName = {};
      if (isClassSheet) {
        const neededCourses = new Map();
        rows.forEach((r) => {
          const info = courseInfoForGrade(courseGradeFromClassName(r.className));
          if (info) neededCourses.set(info.name, info);
        });
        for (const info of neededCourses.values()) {
          const existingCourse = state.courses.find((c) => stripDiacritics(c.name) === stripDiacritics(info.name));
          if (existingCourse) { courseIdByName[info.name] = existingCourse.id; continue; }
          // state.courses được nạp lúc mở trang, có thể đã CŨ nếu ai đó vừa
          // nạp Excel tạo cùng khoá học này ở phiên khác — đọc thẳng
          // Firestore lần nữa ngay trước khi tạo để tránh tạo trùng do
          // race condition (xem repairDuplicateCourses() để hiểu lỗi này
          // đã từng xảy ra).
          const freshMatch = await courseCol.where('name', '==', info.name).limit(1).get();
          if (!freshMatch.empty) { courseIdByName[info.name] = freshMatch.docs[0].id; continue; }
          const ref = courseCol.doc();
          batch.set(ref, { name: info.name, level: info.level, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          courseIdByName[info.name] = ref.id;
          ops++;
          if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
        }
      }

      // 1) Tạo trước các lớp còn thiếu (mỗi tên lớp mới chỉ tạo 1 lần) —
      // với định dạng classSheet, gắn luôn courseId vừa có ở bước 0 và
      // GV phụ trách đọc được từ ô "TÊN GV ..." trong sheet (đối chiếu tên
      // với danh sách tài khoản giáo viên đã duyệt để lấy đúng teacherId,
      // không có mới lưu tạm teacherName để Admin gán lại thủ công sau).
      const classIdByName = {};
      const classTeacherByName = {};
      const newClassNames = [...new Set(rows.filter((r) => r.willCreateClass).map((r) => r.className))];
      for (const name of newClassNames) {
        const ref = classCol.doc();
        let courseId = '', teacherId = '', teacherName = '';
        if (isClassSheet) {
          const info = courseInfoForGrade(courseGradeFromClassName(name));
          courseId = info ? (courseIdByName[info.name] || '') : '';
          const sheetTeacherName = (rows.find((r) => r.className === name) || {}).teacherName || '';
          const teacherMatch = sheetTeacherName
            ? state.teachers.find((t) => stripDiacritics(t.name || '') === stripDiacritics(sheetTeacherName))
            : null;
          teacherId = teacherMatch ? teacherMatch.id : '';
          teacherName = teacherMatch ? teacherMatch.name : sheetTeacherName;
        }
        batch.set(ref, { name, courseId, teacherId, teacherName, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        classIdByName[name] = ref.id;
        classTeacherByName[name] = { id: teacherId, name: teacherName };
        ops++;
        if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
      }

      // 2) Tạo/cập nhật từng học sinh. Định dạng flat: có MSSV → dùng MSSV
      // làm ID (hành vi cũ, không đổi); định dạng classSheet: dùng ID ghép
      // "trường_lớp_mã số hs" (xem studentDocIdFor) vì MSSV trong file này
      // không duy nhất toàn trường, THẬM CHÍ không duy nhất giữa CÁC TRƯỜNG
      // (nhiều trường dùng chung tên lớp "4A5"/"4A3") — tránh học sinh khác
      // lớp/khác TRƯỜNG ghi đè lẫn nhau (lỗi thật đã xảy ra, xem chú thích ở
      // studentDocIdFor()).
      for (const r of rows) {
        const classId = r.matchedClassId || classIdByName[r.className] || '';
        let teacherId = r.matchedClassTeacher ? r.matchedClassTeacher.id : '';
        let teacherName = r.matchedClassTeacher ? r.matchedClassTeacher.name : '';
        if (!r.matchedClassId && classTeacherByName[r.className]) {
          teacherId = classTeacherByName[r.className].id;
          teacherName = classTeacherByName[r.className].name;
        }
        const data = {
          mssv: r.mssv, name: r.name, school: r.school, className: r.className,
          classId, teacherId, teacherName, status: 'active',
        };
        let ref;
        if (r.existingId) {
          ref = studentCol.doc(r.existingId);
          batch.set(ref, data, { merge: true });
        } else if (r.expectedDocId) {
          ref = studentCol.doc(r.expectedDocId);
          batch.set(ref, Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, data), { merge: true });
        } else {
          ref = studentCol.doc();
          batch.set(ref, Object.assign({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, data));
        }
        ops++;
        if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
      }
      if (ops > 0) await batch.commit();

      logRosterChange('import_excel', null, { count: rows.length, newClasses: newClassNames.length, format: pendingImportFormat });
      toast(`✅ Đã nạp ${rows.length} học sinh từ Excel`);
      closeImportModal();
      loadEverything();
    } catch (err) {
      toast('❌ ' + friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  });

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
        <label for="f-student-school">Trường</label>
        <input type="text" id="f-student-school" class="form-input" placeholder="VD: THCS Nguyễn Du" value="${esc(student ? student.school : '')}">
        <span class="form-hint">Dùng để lọc danh sách Trường → Lớp → Tên ở màn hình học sinh chọn khi bắt đầu làm bài.</span>
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
    const school = document.getElementById('f-student-school').value.trim();
    const classId = document.getElementById('f-student-class').value;
    const avatarUrl = document.getElementById('f-student-avatar').value.trim();
    const status = document.getElementById('f-student-status').value;
    if (!name) { toast('⚠️ Vui lòng nhập họ tên học sinh'); return; }

    const cls = state.classes.find((c) => c.id === classId);
    const data = {
      mssv, name, school, avatarUrl, status,
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
