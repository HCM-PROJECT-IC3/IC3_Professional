/* ============================================================
   js/models/school.model.js
   Danh mục trường — collection "schools", id = schoolId.

   schoolId là slug SUY RA từ tên trường ("THCS Huỳnh Tấn Phát" →
   "thcs-huynh-tan-phat"), không phải id ngẫu nhiên: dữ liệu cũ chỉ có TÊN
   trường (students_roster.school, quiz_results.studentSchool, cột Trường
   trên Sheet, data/roster/students-active.json) nên đổi được sang schoolId
   mà không cần bảng tra cứu. Giai đoạn chuyển tiếp firestore.rules chấp nhận
   cả tên lẫn schoolId (xem docs/architecture/AUDIT-2.0.md §6).

   Đổi tên trường: giữ nguyên schoolId cũ, chỉ sửa field name.

   Document: { name, status("active"|"inactive"), address?, phone?,
               contactName?, note?, createdAt, updatedAt }
   ============================================================ */
(function (global) {
  'use strict';

  const SCHOOLS_COLLECTION = 'schools';

  const SCHOOL_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  });

  /** Tên trường → schoolId: bỏ dấu, đ→d, chữ thường, ký tự khác chữ/số → "-". */
  function schoolIdOf(name) {
    return String(name || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Danh sách tên → schoolId tương ứng, bỏ trùng và rỗng, giữ thứ tự. */
  function schoolIdsOf(names) {
    return [...new Set((names || []).map(schoolIdOf).filter(Boolean))];
  }

  /**
   * Bản ghi có field tên trường (mặc định "school") → bản sao kèm schoolId khớp tên.
   * Gọi ở MỌI lần ghi tên trường để hai field không lệch nhau. Không có field tên → giữ nguyên.
   */
  function withSchoolId(data, nameField = 'school') {
    if (!data || !(nameField in data)) return data;
    return Object.assign({}, data, { schoolId: schoolIdOf(data[nameField]) });
  }

  /**
   * Nhóm tên trường KHÁC NHAU nhưng ra CÙNG schoolId — thường là 2 trường chỉ khác dấu
   * ("TH Ân" / "TH An"): rules và Apps Script sẽ coi là 1 trường, giáo viên trường này thấy
   * dữ liệu trường kia. Tên chỉ khác hoa/thường/dấu cách là cùng 1 trường, không tính.
   * @returns {string[][]}
   */
  function findCollisions(names) {
    const byId = new Map();
    (names || []).forEach((name) => {
      const id = schoolIdOf(name);
      if (!id) return;
      const same = String(name).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
      if (!byId.has(id)) byId.set(id, new Map());
      if (!byId.get(id).has(same)) byId.get(id).set(same, String(name).trim());
    });
    return [...byId.values()].filter((m) => m.size > 1).map((m) => [...m.values()]);
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.School = { SCHOOLS_COLLECTION, SCHOOL_STATUS, schoolIdOf, schoolIdsOf, withSchoolId, findCollisions };
})(window);
