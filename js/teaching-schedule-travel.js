/* ============================================================
   js/teaching-schedule-travel.js
   Tab "🚗 Hỗ trợ xăng xe" (teaching-schedule.html) — tính tiền hỗ trợ đi
   lại cho giáo viên dạy xa, dành cho role "teaching_coordinator" (🚗 Điều
   phối giáo viên) quản lý (admin dùng được luôn).

   Quy tắc tính (xem đầy đủ trong js/models/teaching-travel.model.js, ĐÚNG
   công thức người dùng đã cung cấp trực tiếp, KHÔNG tự đổi):
   - 11-15km/ngày: 20.000đ. ≥15,1km/ngày: 30.000đ. Dưới 11km: không hỗ trợ.
   - KHÔNG hỗ trợ cho buổi Dự Giảng/Ôn online (Dạy Trực Tuyến)/Trợ Giảng.
   - Khoảng cách nhà→trường: điền tay HOẶC bấm "🌍 Tính tất cả qua Google
     Maps" để tự tính (xem js/services/google-maps-distance.js) — lưu vào
     collection teaching_travel_distances.

   XEM THEO Tuần/Tháng/Quý/Năm (Commit mở rộng theo yêu cầu): "Tuần" giữ
   NGUYÊN hành vi cũ (bảng chi tiết Thứ2→7 + tổng tuần/GV). "Tháng/Quý/
   Năm" gộp NHIỀU tuần lại — tải teaching_schedule của TỪNG tuần khớp kỳ
   đã chọn (dựa vào weekKey dạng "YYYY-MM-DD" = Thứ Hai đầu mỗi tuần), rồi
   cộng dồn số buổi + tiền hỗ trợ theo TỪNG GIÁO VIÊN trên toàn kỳ (bảng
   tổng hợp gọn hơn bảng Thứ2→7 vì 1 tháng/quý/năm có quá nhiều ngày để
   liệt kê hết theo hàng ngang).

   role === 'teacher' KHÔNG thấy tab này (ẩn qua [data-tab="travel"]) — chỉ
   admin/teaching_coordinator dùng (giống hệt js/teaching-schedule-report.js).

   Nạp SAU: js/models/teaching-schedule.model.js, js/models/teaching-travel.model.js,
   js/repositories/teaching-schedule-repository.js, js/repositories/teaching-travel-repository.js,
   js/services/google-maps-distance.js.
   ============================================================ */
(function () {
  'use strict';

  const M = window.EduModels.TeachingSchedule;
  const TM = window.EduModels.TeachingTravel;

  const state = {
    role: '',
    weeks: [],
    weekKey: '',
    periodType: 'week',   // 'week' | 'month' | 'quarter' | 'year'
    scheduleRows: [],     // teaching_schedule docs khớp kỳ đang chọn (1 hoặc nhiều tuần, mọi giáo viên)
    distanceByTeacher: {}, // teacherCode -> { schools: { [ten truong]: km } }
    teachersByCode: {},    // teacherCode -> teaching_teachers doc (cần .address cho Google Maps)
    teachersLoaded: false,
    // "teacherCode__school" -> địa chỉ trường Google đã DÒ trúng khi tính
    // qua Google Maps — CHỈ lưu tạm trong phiên này (không có chỗ trong
    // schema teaching_travel_distances hiện tại), dùng để hiện tooltip
    // cho Điều phối giáo viên soát lại có đúng trường mong muốn không.
    matchedSchoolAddress: {},
  };

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

  window.addEventListener('edu:ready', ({ detail }) => {
    state.role = detail.profile.role;
    if (state.role === 'teacher') {
      // 1 giáo viên không cần xem/quản lý hỗ trợ xăng xe CẢ ĐỘI — ẩn hẳn
      // tab, không tải gì thêm.
      document.querySelectorAll('[data-tab="travel"]').forEach((b) => b.classList.add('force-hide'));
      return;
    }
    loadWeeks();
  });

  // ============================================================
  // "XEM THEO": chọn Tuần/Tháng/Quý/Năm — đổi bộ chọn tương ứng, các bộ
  // chọn Tháng/Quý/Năm được đổ option dựa trên NHỮNG TUẦN THẬT SỰ ĐÃ CÓ
  // (state.weeks), không cho chọn kỳ nào không có dữ liệu.
  // ============================================================
  function weekDate(weekKey) {
    // weekKey dạng "YYYY-MM-DD" (Thứ Hai đầu tuần, xem model) — parse thủ
    // công thay vì `new Date(weekKey)` để tránh lệch múi giờ UTC/local.
    const [y, m, d] = weekKey.split('-').map(Number);
    return { y, m, d };
  }
  function quarterOfMonth(m) { return Math.floor((m - 1) / 3) + 1; }

  function populatePeriodSelectors() {
    const months = new Map();   // "YYYY-MM" -> label
    const quarters = new Map(); // "YYYY-Q" -> label
    const years = new Map();    // "YYYY" -> label
    state.weeks.forEach((w) => {
      const { y, m } = weekDate(w.id);
      const mKey = `${y}-${String(m).padStart(2, '0')}`;
      months.set(mKey, `Tháng ${m}/${y}`);
      const q = quarterOfMonth(m);
      quarters.set(`${y}-${q}`, `Quý ${q}/${y}`);
      years.set(String(y), `Năm ${y}`);
    });
    const fill = (sel, map) => {
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = [...map.entries()]
        .sort((a, b) => b[0].localeCompare(a[0])) // mới nhất trước
        .map(([val, label]) => `<option value="${esc(val)}">${esc(label)}</option>`).join('');
      if (map.has(current)) sel.value = current;
    };
    fill(document.getElementById('travelMonthSelect'), months);
    fill(document.getElementById('travelQuarterSelect'), quarters);
    fill(document.getElementById('travelYearSelect'), years);
  }

  function switchPeriodType(type) {
    state.periodType = type;
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('force-hide', !on); };
    show('travelWeekWrap', type === 'week');
    show('travelMonthWrap', type === 'month');
    show('travelQuarterWrap', type === 'quarter');
    show('travelYearWrap', type === 'year');
  }
  document.getElementById('travelPeriodType')?.addEventListener('change', (e) => switchPeriodType(e.target.value));

  /** Danh sách weekKey khớp kỳ đang chọn (dùng cho Tháng/Quý/Năm — "Tuần"
   * chỉ có đúng 1 weekKey nên không gọi hàm này). */
  function weekKeysForPeriod(type, value) {
    if (!value) return [];
    return state.weeks
      .filter((w) => {
        const { y, m } = weekDate(w.id);
        if (type === 'month') return `${y}-${String(m).padStart(2, '0')}` === value;
        if (type === 'quarter') return `${y}-${quarterOfMonth(m)}` === value;
        if (type === 'year') return String(y) === value;
        return false;
      })
      .map((w) => w.id);
  }

  async function loadWeeks() {
    try {
      state.weeks = await window.EduRepositories.teachingWeek.listAll();
      const sel = document.getElementById('travelWeekSelect');
      if (sel) {
        if (!state.weeks.length) {
          sel.innerHTML = '<option value="">-- Chưa có tuần nào --</option>';
        } else {
          sel.innerHTML = state.weeks.map((w) => `<option value="${esc(w.id)}">${esc(w.label || w.id)}</option>`).join('');
          sel.value = state.weeks[state.weeks.length - 1].id; // mặc định tuần gần nhất
        }
      }
      populatePeriodSelectors();
    } catch (err) {
      console.error('[Hỗ trợ xăng xe] Không tải được danh sách tuần:', err);
    }
  }

  /** Tải danh sách giáo viên 1 lần (cần field `address` cho Google Maps) —
   * cache lại, không tải lại mỗi lần bấm "Tính hỗ trợ". */
  async function ensureTeachersLoaded() {
    if (state.teachersLoaded) return;
    const rows = await window.EduRepositories.teachingTeacher.list();
    state.teachersByCode = {};
    rows.forEach((t) => { state.teachersByCode[t.code || t.id] = t; });
    state.teachersLoaded = true;
  }

  document.getElementById('travelLoadBtn')?.addEventListener('click', loadTravel);

  async function loadTravel() {
    const type = state.periodType;
    let weekKeys = [];
    let rangeLabel = '';

    if (type === 'week') {
      const weekKey = document.getElementById('travelWeekSelect').value;
      if (!weekKey) { toast('⚠️ Chọn 1 tuần trước.'); return; }
      weekKeys = [weekKey];
      const week = state.weeks.find((w) => w.id === weekKey);
      rangeLabel = `📆 ${week ? (week.label || week.id) : weekKey}`;
    } else {
      const selId = type === 'month' ? 'travelMonthSelect' : type === 'quarter' ? 'travelQuarterSelect' : 'travelYearSelect';
      const value = document.getElementById(selId)?.value;
      if (!value) { toast('⚠️ Chọn 1 kỳ trước (chưa có tuần nào thuộc kỳ này).'); return; }
      weekKeys = weekKeysForPeriod(type, value);
      if (!weekKeys.length) { toast('⚠️ Không có tuần nào thuộc kỳ đã chọn.'); return; }
      const label = document.getElementById(selId).selectedOptions[0]?.textContent || value;
      rangeLabel = `📆 ${label} (gồm ${weekKeys.length} tuần đã có lịch)`;
    }

    const btn = document.getElementById('travelLoadBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Đang tải...';
    try {
      const [weekResults, distanceDocs] = await Promise.all([
        Promise.all(weekKeys.map((wk) => window.EduRepositories.teachingSchedule.listByWeek(wk))),
        window.EduRepositories.teachingTravelDistance.listAll().catch(() => []),
        ensureTeachersLoaded().catch((err) => { console.warn('[Hỗ trợ xăng xe] Không tải được danh sách GV (chỉ ảnh hưởng Google Maps):', err); }),
      ]);
      state.scheduleRows = weekResults.flat();
      state.distanceByTeacher = {};
      distanceDocs.forEach((d) => { state.distanceByTeacher[d.id] = d; });

      const info = document.getElementById('travelRangeInfo');
      if (info) info.textContent = rangeLabel;
      document.getElementById('travelResultTitle').textContent = type === 'week'
        ? '🚗 Hỗ trợ xăng xe theo tuần'
        : '🚗 Tổng hợp hỗ trợ xăng xe theo kỳ đã chọn';

      renderDistanceTable();
      if (type === 'week') renderAllowanceTableWeek();
      else renderAllowanceTableSummary();
      document.getElementById('travelEmpty').classList.add('force-hide');
      document.getElementById('travelBody').classList.remove('force-hide');
    } catch (err) {
      toast('❌ ' + (err && err.message ? err.message : String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  /** Danh sách trường (thứ tự Sáng→Chiều, GỘP TRÙNG) THẬT SỰ cần hỗ trợ
   * xăng xe trong 1 ngày — dùng để biết cần hỏi khoảng cách trường nào
   * cho GV đó, không hỏi thừa những trường chỉ dùng cho Dự Giảng/Trợ
   * Giảng/Online. */
  function allowanceSchoolsOfTeacher(doc) {
    const seen = new Set();
    M.WEEKDAYS.forEach((d) => {
      const day = (doc.days && doc.days[String(d)]) || M.emptyDay();
      TM.schoolsForDay(day, M).forEach((s) => seen.add(s));
    });
    return Array.from(seen);
  }

  function renderDistanceTable() {
    const table = document.getElementById('travelDistanceTable');
    if (!table) return;
    // GỘP theo (teacherCode, school) qua TOÀN BỘ scheduleRows đang có (có
    // thể nhiều tuần/nhiều dòng của cùng 1 GV khi xem theo Tháng/Quý/Năm)
    // — mỗi cặp chỉ cần hỏi khoảng cách 1 lần, không lặp lại theo từng tuần.
    const seen = new Set();
    const rows = [];
    state.scheduleRows.forEach((doc) => {
      allowanceSchoolsOfTeacher(doc).forEach((school) => {
        const key = `${doc.teacherCode}__${school}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ teacherCode: doc.teacherCode, teacherName: doc.teacherName || doc.teacherCode, school });
      });
    });
    if (!rows.length) {
      table.innerHTML = '<thead><tr><th>Giáo viên</th><th>Trường</th><th>Khoảng cách (km)</th><th></th></tr></thead>'
        + '<tbody><tr><td colspan="4" class="empty-cell">Không có buổi dạy nào cần hỗ trợ xăng xe trong kỳ này.</td></tr></tbody>';
      return;
    }
    rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'vi') || a.school.localeCompare(b.school, 'vi'));
    const isReadOnly = state.role !== 'admin' && state.role !== 'teaching_coordinator';
    const body = rows.map((r) => {
      const km = ((state.distanceByTeacher[r.teacherCode] || {}).schools || {})[r.school] || '';
      // Địa chỉ trường Google đã DÒ trúng lần tính gần nhất (nếu có) — hiện
      // làm tooltip tên trường để Điều phối giáo viên soát lại có đúng
      // trường mong muốn không (phòng trùng tên với trường ở khu vực khác).
      const matched = state.matchedSchoolAddress[`${r.teacherCode}__${r.school}`];
      const schoolTitle = matched ? ` title="Google đã dò trúng: ${esc(matched)}"` : '';
      return `<tr>
        <td class="report-pivot-name">${esc(r.teacherName)}</td>
        <td class="report-pivot-name"${schoolTitle}>${esc(r.school)}${matched ? ' 📍' : ''}</td>
        <td><input type="number" min="0" step="0.1" class="travel-km-input" data-teacher="${esc(r.teacherCode)}" data-school="${esc(r.school)}" value="${esc(km)}" placeholder="vd 12.5" ${isReadOnly ? 'readonly' : ''}></td>
        <td>${isReadOnly ? '' : `<button type="button" class="row-gmaps-btn" data-teacher="${esc(r.teacherCode)}" data-school="${esc(r.school)}" title="Tính lại đúng khoảng cách này qua Google Maps">🌍</button>`}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `<thead><tr><th>Giáo viên</th><th>Trường</th><th>Khoảng cách (km)</th><th></th></tr></thead><tbody>${body}</tbody>`;

    if (isReadOnly) return;
    table.querySelectorAll('.travel-km-input').forEach((input) => {
      input.addEventListener('change', () => saveDistance(input.dataset.teacher, input.dataset.school, Number(input.value) || 0));
    });
    table.querySelectorAll('.row-gmaps-btn').forEach((btn) => {
      btn.addEventListener('click', () => computeOneDistance(btn.dataset.teacher, btn.dataset.school, true));
    });
  }

  /** Lưu 1 khoảng cách (cập nhật state NGAY để bảng hỗ trợ tính lại tức
   * thì, không cần chờ round-trip Firestore) rồi ghi Firestore.
   * @param {string} [matchedSchoolAddress] Địa chỉ trường Google đã dò
   *   trúng (chỉ có khi gọi từ luồng Google Maps) — lưu tạm để hiện
   *   tooltip, xem ghi chú ở state.matchedSchoolAddress.
   * @param {boolean} [skipToast] Bỏ qua toast "Đã lưu" mặc định — dùng khi
   *   bên gọi (computeOneDistance) đã tự hiện 1 toast chi tiết hơn ngay
   *   sau đó, tránh 2 toast chồng lên nhau. */
  async function saveDistance(teacherCode, school, km, matchedSchoolAddress, skipToast) {
    state.distanceByTeacher[teacherCode] = state.distanceByTeacher[teacherCode] || { schools: {} };
    state.distanceByTeacher[teacherCode].schools = state.distanceByTeacher[teacherCode].schools || {};
    state.distanceByTeacher[teacherCode].schools[school] = km;
    if (matchedSchoolAddress) state.matchedSchoolAddress[`${teacherCode}__${school}`] = matchedSchoolAddress;
    if (state.periodType === 'week') renderAllowanceTableWeek(); else renderAllowanceTableSummary();
    try {
      await window.EduRepositories.teachingTravelDistance.setSchoolDistance(teacherCode, school, km);
      if (!skipToast) toast(`✅ Đã lưu khoảng cách ${esc(school)}: ${km}km`);
    } catch (err) {
      toast('❌ ' + (err && err.message ? err.message : String(err)));
    }
  }

  // ============================================================
  // GOOGLE MAPS — tự tính khoảng cách nhà (địa chỉ GV, tab "👤 Giáo viên")
  // → trường, thay vì Điều phối giáo viên phải tự tra tay từng cặp.
  // "Trường" chỉ là TÊN NGẮN tự do (vd "TiH Tân Tạo A", không phải địa chỉ
  // đầy đủ) — nới rộng thành "Trường Tiểu học ... , Thành phố Hồ Chí
  // Minh, Việt Nam" để Google định vị đúng hơn (best-effort, không đảm
  // bảo tuyệt đối chính xác nếu trùng tên trường ở khu vực khác — nên vẫn
  // xem lại km sau khi tính, sửa tay nếu thấy vô lý).
  // ============================================================
  function expandSchoolQuery(school) {
    let q = school.trim();
    if (/^tih\s/i.test(q)) q = 'Trường Tiểu học ' + q.replace(/^tih\s/i, '');
    if (!/việt nam/i.test(q)) q += ', Thành phố Hồ Chí Minh, Việt Nam';
    return q;
  }

  async function computeOneDistance(teacherCode, school, forcePrompt) {
    const teacher = state.teachersByCode[teacherCode];
    const address = teacher && teacher.address && teacher.address.trim();
    if (!address) {
      toast(`⚠️ ${esc(teacherCode)} chưa có địa chỉ nhà — bổ sung ở tab "👤 Giáo viên" trước.`);
      return null;
    }
    try {
      // computeDistanceKm() giờ tự DÒ đúng trường thật gần nhà GV qua
      // Places API (xem js/services/google-maps-distance.js) — trả kèm
      // matchedSchoolAddress để soát lại có đúng đã dò trúng trường mong
      // muốn không (hiện trong tooltip + toast, phòng trường hợp trùng tên).
      const result = await window.EduGoogleMapsDistance.computeDistanceKm(address, expandSchoolQuery(school));
      if (result === null) {
        toast(`⚠️ Google Maps không định vị được "${esc(school)}" hoặc địa chỉ nhà — kiểm tra lại, hoặc điền tay.`);
        return null;
      }
      const { km, matchedSchoolAddress } = result;
      await saveDistance(teacherCode, school, km, matchedSchoolAddress, true);
      toast(matchedSchoolAddress
        ? `✅ ${esc(school)}: ${km}km — đã dò trúng "${esc(matchedSchoolAddress)}"`
        : `✅ ${esc(school)}: ${km}km (không dò được địa chỉ trường cụ thể, tính theo tên — nên kiểm tra lại)`);
      return km;
    } catch (err) {
      toast('❌ Google Maps: ' + (err && err.message ? err.message : String(err)));
      if (forcePrompt) window.EduGoogleMapsDistance.forgetApiKey(); // cho prompt lại key ở lần bấm kế
      return null;
    }
  }

  document.getElementById('travelGmapsAllBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('travelGmapsAllBtn');
    const rows = [...document.querySelectorAll('.travel-km-input')].filter((el) => !el.value);
    if (!rows.length) { toast('✅ Mọi khoảng cách đang hiện đã có giá trị — không có ô trống nào cần tính.'); return; }
    // Đăng nhập/hỏi API Key NGAY LẦN ĐẦU (trước khi chạy vòng lặp) để nếu
    // người dùng bấm Huỷ, không tốn thời gian chạy dở dang rồi mới báo lỗi.
    try {
      await window.EduGoogleMapsDistance.ensureLoaded(false);
    } catch (err) {
      toast('❌ ' + (err && err.message ? err.message : String(err)));
      return;
    }
    btn.disabled = true;
    let done = 0, ok = 0;
    const originalLabel = btn.textContent;
    for (const input of rows) {
      done++;
      btn.textContent = `⏳ Đang tính (${done}/${rows.length})...`;
      const km = await computeOneDistance(input.dataset.teacher, input.dataset.school, false);
      if (km !== null) ok++;
      // Giãn nhẹ giữa các lượt gọi API — tránh dồn dập quá nhiều request
      // cùng lúc nếu danh sách dài (vd cả 1 quý/năm).
      await new Promise((r) => setTimeout(r, 150));
    }
    btn.disabled = false;
    btn.textContent = originalLabel;
    toast(`🌍 Đã tính xong ${ok}/${rows.length} khoảng cách qua Google Maps.`);
  });

  // ============================================================
  // KẾT QUẢ — "Tuần": bảng chi tiết Thứ2→7 (giữ nguyên hành vi cũ).
  // ============================================================
  function renderAllowanceTableWeek() {
    const table = document.getElementById('travelAllowanceTable');
    if (!table) return;
    if (!state.scheduleRows.length) {
      table.innerHTML = '<thead><tr><th>Không có dữ liệu</th></tr></thead><tbody></tbody>';
      return;
    }
    const dayHead = M.WEEKDAYS.map((d) => `<th>${esc(M.WEEKDAY_LABELS[d])}</th>`).join('');
    const rows = state.scheduleRows.map((doc) => {
      const distanceMap = (state.distanceByTeacher[doc.teacherCode] || {}).schools || {};
      let weekTotal = 0;
      const dayCells = M.WEEKDAYS.map((d) => {
        const day = (doc.days && doc.days[String(d)]) || M.emptyDay();
        const { schools, km, amount, missingDistance } = TM.allowanceForDay(day, M, distanceMap);
        weekTotal += amount;
        if (!schools.length) return '<td class="travel-cell-zero">–</td>';
        const title = `${esc(schools.join(' → '))} (${km}km)${missingDistance ? ' — CHƯA đủ khoảng cách' : ''}`;
        const cls = missingDistance ? 'travel-cell-warn' : (amount > 0 ? 'travel-cell-paid' : 'travel-cell-zero');
        return `<td class="${cls}" title="${title}">${amount > 0 ? TM.formatVnd(amount) : '0đ'}${missingDistance ? ' ⚠️' : ''}</td>`;
      }).join('');
      return `<tr><td class="report-pivot-name">${esc(doc.teacherName || doc.teacherCode)}</td>${dayCells}<td class="report-pivot-total">${TM.formatVnd(weekTotal)}</td></tr>`;
    });
    table.innerHTML = `<thead><tr><th>Giáo viên</th>${dayHead}<th>Tổng tuần</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  }

  // ============================================================
  // KẾT QUẢ — "Tháng/Quý/Năm": gộp NHIỀU document teaching_schedule (mỗi
  // GV có thể có nhiều bản ghi, mỗi bản ghi = 1 tuần) thành 1 dòng/GV —
  // liệt kê từng ngày ra bảng ngang như "Tuần" là không khả thi (1 quý có
  // thể tới ~65 ngày dạy) nên tổng hợp thành Số buổi có hỗ trợ + Tổng tiền.
  // ============================================================
  function renderAllowanceTableSummary() {
    const table = document.getElementById('travelAllowanceTable');
    if (!table) return;
    if (!state.scheduleRows.length) {
      table.innerHTML = '<thead><tr><th>Không có dữ liệu</th></tr></thead><tbody></tbody>';
      return;
    }
    const byTeacher = {}; // teacherCode -> { name, days: 0, total: 0, missing: 0 }
    state.scheduleRows.forEach((doc) => {
      const distanceMap = (state.distanceByTeacher[doc.teacherCode] || {}).schools || {};
      const acc = byTeacher[doc.teacherCode] = byTeacher[doc.teacherCode]
        || { name: doc.teacherName || doc.teacherCode, days: 0, total: 0, missing: 0 };
      M.WEEKDAYS.forEach((d) => {
        const day = (doc.days && doc.days[String(d)]) || M.emptyDay();
        const { schools, amount, missingDistance } = TM.allowanceForDay(day, M, distanceMap);
        if (!schools.length) return;
        if (amount > 0) { acc.days += 1; acc.total += amount; }
        if (missingDistance) acc.missing += 1;
      });
    });
    const rows = Object.values(byTeacher).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    const body = rows.map((r) => `<tr>
        <td class="report-pivot-name">${esc(r.name)}</td>
        <td>${r.days}</td>
        <td class="report-pivot-total">${TM.formatVnd(r.total)}</td>
        <td>${r.missing ? `<span class="travel-cell-warn" style="padding:.15rem .5rem;border-radius:6px" title="Còn ${r.missing} buổi chưa đủ khoảng cách để tính đúng">⚠️ ${r.missing}</span>` : '—'}</td>
      </tr>`).join('');
    const footer = `<tr class="report-pivot-footer"><td>Tổng cộng</td><td>${rows.reduce((s, r) => s + r.days, 0)}</td><td class="report-pivot-total">${TM.formatVnd(grandTotal)}</td><td></td></tr>`;
    table.innerHTML = `<thead><tr><th>Giáo viên</th><th>Số buổi có hỗ trợ</th><th>Tổng tiền hỗ trợ</th><th>Thiếu km</th></tr></thead><tbody>${body}${footer}</tbody>`;
  }
})();
