/* ic3-dashboard.html — JS riêng cho trang Dashboard (tách từ inline <script>) */
/* ========================================
   ICON SET — cắt trực tiếp từ hình minh hoạ 7 chủ đề IC3
   (Nội dung cơ bản, Công dân số, Quản lý thông tin,
   Tạo nội dung, Giao tiếp, Cộng tác, Bảo mật) do người dùng cung
   cấp — ảnh đặt tại img/deck-icon-*.png, mỗi ảnh là 1 ô vuông
   icon 3D lấy nguyên từ tấm hình gốc.
   ======================================== */
/* ĐẶT TÊN KHỚP VỚI FILE ẢNH THẬT (trước đây tên key — monitor/shield/
   lock/folder/palette/megaphone — không khớp icon thật sự render ra,
   vd. key "lock" lại trỏ tới ảnh info-icon, dễ gây nhầm khi đọc code
   lẫn khi gán icon cho từng bộ đề bên dưới). 6 bộ đề khối lớp không map
   1-1 với 7 chủ đề IC3 nên KHÔNG gán icon theo đúng tên chủ đề (khối
   lớp nào cũng học đủ 7 chủ đề) — chỉ chọn ảnh có TÔNG MÀU/SẮC THÁI phù
   hợp với đối tượng: khối lớn (THCS) dùng icon nghiêm túc hơn (màn
   hình, cộng đồng, bảo mật), khối nhỏ (Tiểu học) dùng icon vui tươi
   hơn (bút vẽ, hội thoại, tài liệu) — tránh ví dụ icon khoá bảo mật
   nghiêm trọng gán cho học sinh Tiểu học như trước. */
const DECK_ICONS = {
  tech:        'img/topic-icon-1-tech.png',        // màn hình máy tính
  citizenship: 'img/topic-icon-2-citizenship.png',  // nhóm người / cộng đồng
  info:        'img/topic-icon-3-info.png',         // tài liệu / thông tin
  content:     'img/topic-icon-4-content.png',       // bút vẽ / sáng tạo nội dung
  comm:        'img/topic-icon-5-comm.png',          // bong bóng hội thoại
  safety:      'img/topic-icon-7-safety.png'         // khiên/khoá bảo mật
};

/* ========================================
   DATA STORE
   ======================================== */
const QUIZ_SETS = [
  {
    id: 'class6',
    title: 'THCS – Khối 6',
    subtitle: 'IC3 GS5 – Trung học cơ sở',
    questions: 30,
    type: 'middle',
    icon: DECK_ICONS.tech,
    iconColor: '#5B8DEF',
    coverGradient: 'linear-gradient(135deg, #CFE3FF 0%, #EAF3FF 100%)',
    coverBg: '#CFE3FF',
    link: 'https://wit.id.vn/20252026/THCS/Class6'
  },
  {
    id: 'class7',
    title: 'THCS – Khối 7',
    subtitle: 'IC3 GS5 – Trung học cơ sở',
    questions: 30,
    type: 'middle',
    icon: DECK_ICONS.citizenship,
    iconColor: '#2FBF9B',
    coverGradient: 'linear-gradient(135deg, #C9F3E6 0%, #E9FBF5 100%)',
    coverBg: '#C9F3E6',
    link: 'https://wit.id.vn/20252026/THCS/Class7'
  },
  {
    id: 'class8',
    title: 'THCS – Khối 8',
    subtitle: 'IC3 GS5 – Trung học cơ sở',
    questions: 30,
    type: 'middle',
    icon: DECK_ICONS.safety,
    iconColor: '#8B5CF6',
    coverGradient: 'linear-gradient(135deg, #E4D6FF 0%, #F3EBFF 100%)',
    coverBg: '#E4D6FF',
    link: 'https://wit.id.vn/20252026/THCS/Class8'
  },
  {
    id: 'tiH3',
    title: 'Tiểu học – Khối 3',
    subtitle: 'IC3 GS5 – Tiểu học LV1',
    questions: 25,
    type: 'elementary',
    icon: DECK_ICONS.content,
    iconColor: '#34B368',
    coverGradient: 'linear-gradient(135deg, #D4F5DC 0%, #EEFBF1 100%)',
    coverBg: '#D4F5DC',
    link: 'https://wit.id.vn/20252026/TiH/LV1_Class3'
  },
  {
    id: 'tiH4',
    title: 'Tiểu học – Khối 4',
    subtitle: 'IC3 GS5 – Tiểu học LV2',
    questions: 25,
    type: 'elementary',
    icon: DECK_ICONS.comm,
    iconColor: '#E8A93D',
    coverGradient: 'linear-gradient(135deg, #FFECC2 0%, #FFF8E6 100%)',
    coverBg: '#FFECC2',
    link: 'https://wit.id.vn/20252026/TiH/LV2_Class4'
  },
  {
    id: 'tiH5',
    title: 'Tiểu học – Khối 5',
    subtitle: 'IC3 GS5 – Tiểu học LV3',
    questions: 25,
    type: 'elementary',
    icon: DECK_ICONS.info,
    iconColor: '#F2795A',
    coverGradient: 'linear-gradient(135deg, #FFDCCF 0%, #FFEFE8 100%)',
    coverBg: '#FFDCCF',
    link: 'https://wit.id.vn/20252026/TiH/LV3_Class5'
  }
];

/* Load custom sets from localStorage */
function loadSets() {
  const saved = localStorage.getItem('ic3_custom_sets');
  if (saved) {
    try {
      const extra = JSON.parse(saved);
      return [...QUIZ_SETS, ...extra];
    } catch(e) {}
  }
  return [...QUIZ_SETS];
}

let allSets = loadSets();
let currentFilter = 'all';
let currentSearch = '';

/* ========================================
   RENDER CARDS
   ======================================== */
/* set.icon có thể là đường dẫn ảnh (img/deck-icon-*.png, dùng cho
   6 bộ đề mặc định) hoặc 1 emoji do người dùng nhập khi tạo bộ đề
   mới (modal "Tạo bộ đề mới") — hàm này render đúng loại tương ứng. */
function renderDeckIcon(set) {
  const icon = set.icon || '🎯';
  if (/\.(png|jpg|jpeg|webp|svg)$/i.test(icon)) {
    return `<img src="${icon}" alt="${set.title}" loading="lazy">`;
  }
  return `<span class="cover-icon-emoji">${icon}</span>`;
}

/* Số "lượt" hiển thị trên thẻ = số phiên làm bài THẬT được ghi nhận
   trong localStorage (mỗi lần bấm "Bắt đầu làm bài" tạo 1 phiên) —
   trước đây là số hardcode cố định (124, 98...), không phản ánh gì
   thực tế. Không có endpoint nhận điểm thật từ link ngoài (wit.id.vn)
   nên đây là số liệu THẬT duy nhất mà app tự ghi nhận được. */
function getAttemptCount(setId) {
  return getSessions().filter(s => s.setId === setId).length;
}

function renderCards() {
  const grid = document.getElementById('cardsGrid');
  const countLabel = document.getElementById('cardsCount');
  let sets = allSets;

  // Filter by type
  if (currentFilter !== 'all') {
    sets = sets.filter(s => s.type === currentFilter);
  }
  // Search
  if (currentSearch) {
    sets = sets.filter(s => s.title.toLowerCase().includes(currentSearch.toLowerCase()));
  }

  if (countLabel) countLabel.textContent = `${sets.length} bộ đề`;

  if (sets.length === 0) {
    grid.innerHTML = `<div class="no-results"><span class="emoji">🔍</span><p>Không tìm thấy bộ đề nào phù hợp.</p></div>`;
    return;
  }

  grid.innerHTML = sets.map(set => `
    <div class="quiz-card" data-id="${set.id}" data-type="${set.type}">
      <div class="card-cover" style="background:${set.coverGradient};">
        <div class="cover-pattern"></div>
        <div class="cover-icon-wrap" style="color:${set.iconColor || '#5B8DEF'};">${renderDeckIcon(set)}</div>
      </div>
      <div class="card-body">
        <div class="card-header">
          <div class="card-title">${set.title}</div>
          <span class="badge ${set.type === 'elementary' ? 'badge-elementary' : 'badge-middle'}">
            ${set.type === 'elementary' ? '🌱 Tiểu học' : '🎒 THCS'}
          </span>
        </div>
        <div class="card-stats">
          <div class="stat-item"><span>📝</span><span>${set.questions} câu hỏi</span></div>
          <div class="stat-item"><span>👥</span><span>${getAttemptCount(set.id)} lượt</span></div>
        </div>
        <div class="card-actions">
          <button class="btn-play" onclick="openStartModal('${set.id}', event)">🚀 Bắt đầu làm bài</button>
          <button class="btn-manage" onclick="openManageModal('${set.id}', event)" title="Quản lý bộ đề">⚙️</button>
        </div>
      </div>
    </div>
  `).join('');
}

/* ========================================
   FILTERS & SEARCH
   ======================================== */
function setFilter(btn, filter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = filter;
  renderCards();
}

function filterCards() {
  currentSearch = document.getElementById('searchInput').value;
  renderCards();
}

/* ========================================
   3D SHELF VIEW (Working Volumes embed)
   Chuyển đổi giữa lưới bộ đề dạng thẻ (mặc định)
   và trải nghiệm kệ sách 3D, cùng nằm trong khu vực
   #cardsViewport. Iframe chỉ được nạp (lazy) ở lần
   bấm đầu tiên để không ảnh hưởng tốc độ tải trang.
   ======================================== */
let shelfViewActive = false;

function toggleShelfView() {
  const grid = document.getElementById('cardsGrid');
  const shelf = document.getElementById('shelfEmbed');
  const btn = document.getElementById('toggleShelfViewBtn');
  const frame = document.getElementById('shelfFrame');
  if (!grid || !shelf) return;

  shelfViewActive = !shelfViewActive;

  if (shelfViewActive) {
    if (frame && frame.dataset.src && frame.getAttribute('src') === 'about:blank') {
      frame.setAttribute('src', frame.dataset.src);
    }
    grid.hidden = true;
    shelf.hidden = false;
    btn && btn.classList.add('active');
  } else {
    shelf.hidden = true;
    grid.hidden = false;
    btn && btn.classList.remove('active');
  }
}

/* ========================================
   SESSION & QUIZ START (Anti-cheat)
   ======================================== */
/* Trước đây dùng prompt() (hộp thoại trình duyệt xấu, chặn thao tác)
   để xin tên học sinh — giờ dùng modal sẵn có của trang cho đồng bộ
   giao diện. */
function openStartModal(id, event) {
  event && event.stopPropagation();
  const set = allSets.find(s => s.id === id);
  if (!set) return;

  document.getElementById('modal-title').innerHTML = `🚀 Bắt đầu – ${set.title}`;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn-cancel" onclick="closeModal()">Huỷ bỏ</button>
    <button class="btn-save" onclick="confirmStartQuiz('${id}')">🚀 Mở bài làm</button>
  `;
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Tên học sinh *</label>
      <input id="startStudentName" type="text" placeholder="VD: Nguyễn Văn A" value="Học sinh">
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin-top:-4px;">
      Bài làm sẽ mở ở đường link ngoài của bộ đề này. Đây chỉ là ghi nhận cục bộ trên máy này để theo dõi
      ai đã bắt đầu — điểm số cần nhập tay ở mục "⚙️ Quản lý" sau khi học sinh làm xong.
    </p>
  `;
  openModalEl();
  document.getElementById('startStudentName')?.focus();
}

function confirmStartQuiz(id) {
  const set = allSets.find(s => s.id === id);
  if (!set) return;
  const nameInput = document.getElementById('startStudentName');
  const studentName = (nameInput?.value || '').trim() || 'Học sinh';

  const session = {
    id: 'sess_' + Date.now(),
    studentName,
    setId: id,
    setTitle: set.title,
    startTime: new Date().toLocaleString('vi-VN'),
    status: 'Đang làm',
    score: null,
    locked: true // can't be manually edited
  };

  saveSession(session);
  closeModal();
  showToast(`📌 Ghi nhận: ${session.studentName} – ${set.title}`);
  renderCards();

  window.open(set.link, '_blank', 'noopener,noreferrer');
  updateReportTab();
}

function saveSession(session) {
  let sessions = getSessions();
  sessions.push(session);
  localStorage.setItem('ic3_sessions', JSON.stringify(sessions));
}

function getSessions() {
  try { return JSON.parse(localStorage.getItem('ic3_sessions') || '[]'); } catch { return []; }
}

/* Bộ đề dùng link ngoài (wit.id.vn) nên app không có cách nào nhận điểm
   thật tự động — trước đây có 1 hàm simulateScore() BỊA điểm ngẫu nhiên
   sau 5s để demo, trông như thật nhưng hoàn toàn giả. Đã bỏ hàm đó;
   thay vào đó giáo viên tự nhập điểm thật (recordScore, gọi từ modal
   "⚙️ Quản lý") sau khi học sinh làm xong ở link ngoài. */
function recordScore(sessionId, score) {
  score = Math.max(0, Math.min(100, Math.round(score)));
  const sessions = getSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return;
  sessions[idx].score = score;
  sessions[idx].status = 'Hoàn thành';
  localStorage.setItem('ic3_sessions', JSON.stringify(sessions));
  const set = allSets.find(s => s.id === sessions[idx].setId);
  if (set) openManageModal(set.id);
  updateReportTab();
}

/* ========================================
   REPORT TAB — dữ liệu thật từ Firestore (collection "quiz_results")
   ======================================== */
let _reportRawDocs   = null;  // cache toàn bộ bản ghi tải từ Firestore (chưa lọc)
let _reportFiltered  = [];    // bản ghi sau khi áp bộ lọc (dùng để xuất CSV)
let _reportCharts    = {};    // instance Chart.js đang hiển thị (để destroy trước khi vẽ lại)
let _reportFiltersBuilt = false;

/** Tải dữ liệu (nếu chưa có cache) rồi áp bộ lọc + vẽ lại toàn bộ báo cáo. */
async function updateReportTab() {
  const body = document.getElementById('reportBody');

  if (!window.EduFirebase || !window.EduFirebase.db) {
    body.innerHTML = `<tr><td colspan="6" class="table-empty-cell">⚠️ Chưa kết nối được Firestore.</td></tr>`;
    return;
  }

  if (_reportRawDocs === null) {
    body.innerHTML = `<tr><td colspan="8" class="table-empty-cell">Đang tải dữ liệu...</td></tr>`;
    try {
      // Trước đây .limit(500) cắt bớt dữ liệu cũ hơn khỏi cả báo cáo (không
      // chỉ bảng chi tiết) — người dùng phản hồi cần ĐẦY ĐỦ số lượt làm bài,
      // không bị giới hạn. Nâng lên mức trần TỐI ĐA Firestore CHO PHÉP
      // (10.000 — thử 20.000 trước đó bị chính Firestore từ chối thẳng với
      // lỗi "Limit value in the structured query is over the maximum value
      // of 10000", làm sập cả trang báo cáo) thay vì bỏ hẳn .limit() — query
      // không có limit vẫn có thể tải cả collection nếu 1 ngày nào đó phình
      // to bất thường, trần này chỉ để chặn tình huống đó, KHÔNG nhằm cắt
      // bớt dữ liệu thật ở quy mô hiện tại (còn rất xa 10.000 bản ghi).
      const snap = await window.EduFirebase.db.collection('quiz_results')
        .orderBy('submittedAt', 'desc')
        .limit(10000)
        .get();
      _reportRawDocs = snap.docs.map(doc => {
        const d = doc.data();
        return Object.assign({ id: doc.id }, d, {
          submittedAtMs: d.submittedAt && d.submittedAt.toMillis ? d.submittedAt.toMillis() : Date.now(),
        });
      });
    } catch (err) {
      console.error('[EduQuiz] Lỗi tải báo cáo Firestore:', err);
      body.innerHTML = `<tr><td colspan="6" class="table-empty-cell">❌ Không tải được dữ liệu: ${err.message}</td></tr>`;
      return;
    }
  }

  buildReportFilterOptions(_reportRawDocs);
  applyReportFiltersAndRender();
}

/** Đổ dữ liệu lớp / bài thi vào 2 dropdown lọc (chỉ dựng 1 lần khi có dữ liệu mới). */
function buildReportFilterOptions(docs) {
  if (_reportFiltersBuilt) return;
  const classSel = document.getElementById('filterClass');
  const testSel  = document.getElementById('filterTest');

  const classes = [...new Set(docs.map(d => d.studentClass).filter(Boolean))].sort();
  const tests   = [...new Set(docs.map(d => d.testName).filter(Boolean))].sort();

  classes.forEach(c => classSel.insertAdjacentHTML('beforeend', `<option value="${escHtml(c)}">${escHtml(c)}</option>`));
  tests.forEach(t => testSel.insertAdjacentHTML('beforeend', `<option value="${escHtml(t)}">${escHtml(t)}</option>`));

  [classSel, testSel, document.getElementById('filterRange')].forEach(sel => {
    sel.addEventListener('change', applyReportFiltersAndRender);
  });
  _reportFiltersBuilt = true;
}

/** Áp bộ lọc hiện tại (lớp / bài thi / khoảng thời gian) lên _reportRawDocs rồi vẽ lại UI. */
function applyReportFiltersAndRender() {
  const classVal = document.getElementById('filterClass').value;
  const testVal  = document.getElementById('filterTest').value;
  const rangeVal = document.getElementById('filterRange').value;

  const now = Date.now();
  const rangeMs = { '7': 7, '30': 30, '90': 90 }[rangeVal];
  const cutoff = rangeMs ? now - rangeMs * 86400000 : null;

  _reportFiltered = (_reportRawDocs || []).filter(d =>
    (!classVal || d.studentClass === classVal) &&
    (!testVal || d.testName === testVal) &&
    (!cutoff || d.submittedAtMs >= cutoff)
  );

  renderReportStats(_reportFiltered);
  renderReportTable(_reportFiltered);
  renderReportCharts(_reportFiltered);
}

function renderReportStats(rows) {
  // Điểm TB / Tỉ lệ đạt DÙNG CHUNG js/services/analytics-service.js (đúng
  // hàm EduAnalytics.avgScore()/passRate() mà Dashboard điều phối/Dashboard
  // giáo viên đang dùng) thay vì tự tính lại — chỉ "Điểm cao nhất" (Math.max
  // đơn giản) và "Tổng lượt làm" là giữ tính tại chỗ vì chưa có hàm dùng
  // chung tương ứng trong analytics-service.
  const scores = rows.map(r => r.score).filter(x => typeof x === 'number');
  const avgScoreRaw = window.EduAnalytics.avgScore(rows);
  const avgScore = avgScoreRaw === null ? null : Math.round(avgScoreRaw);
  const topScore = scores.length ? Math.max(...scores) : null;
  const passRate = window.EduAnalytics.passRate(rows);

  document.getElementById('totalSessions').textContent = rows.length;
  document.getElementById('totalDone').textContent = passRate !== null ? passRate + '%' : '—';
  document.getElementById('avgScore').textContent = avgScore !== null ? avgScore + '%' : '—';
  document.getElementById('topScore').textContent = topScore !== null ? topScore + '%' : '—';
}

// ID các lượt làm bài đang được tick chọn trong bảng chi tiết (để xoá hàng loạt).
// Reset mỗi lần lọc lại/render lại bảng (chọn ở lần lọc trước không còn ý nghĩa
// vì hàng đó có thể không còn hiển thị).
let _reportSelectedIds = new Set();

function renderReportTable(rows) {
  const body = document.getElementById('reportBody');
  document.getElementById('reportTableCount').textContent = rows.length;
  _reportSelectedIds = new Set();
  updateReportSelectionUI();

  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="8" class="table-empty-cell">Chưa có dữ liệu phù hợp bộ lọc. Học sinh bắt đầu làm bài để xem kết quả.</td></tr>`;
    return;
  }
  // KHÔNG còn .slice(0, 200) — người dùng phản hồi cần thấy ĐẦY ĐỦ số lượt
  // làm bài khớp bộ lọc hiện tại, không bị cắt bớt.
  body.innerHTML = rows.map(r => {
    const dateStr = new Date(r.submittedAtMs).toLocaleString('vi-VN');
    const ok = r.integrityOk !== false;
    return `
    <tr data-row-id="${escHtml(r.id)}">
      <td><input type="checkbox" class="report-row-check" data-id="${escHtml(r.id)}"></td>
      <td><strong>${escHtml(r.studentName || 'Ẩn danh')}</strong></td>
      <td>${escHtml(r.studentClass || '—')}</td>
      <td>${escHtml(r.testName || '—')}</td>
      <td style="color:var(--text-muted);font-size:12px;">${dateStr}</td>
      <td>
        <div class="score-bar-wrap">
          <div class="score-bar"><div class="score-bar-fill" style="width:${r.score}%"></div></div>
          <span class="score-label">${r.score}%</span>
        </div>
      </td>
      <td class="${ok ? 'status-done' : 'status-progress'}">${ok ? '✅ Hợp lệ' : '⚠️ Nghi vấn'}</td>
      <td><button type="button" class="row-delete-btn" data-id="${escHtml(r.id)}" title="Xoá lượt này">🗑️</button></td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.report-row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _reportSelectedIds.add(cb.dataset.id);
      else _reportSelectedIds.delete(cb.dataset.id);
      updateReportSelectionUI();
    });
  });
  body.querySelectorAll('.row-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteReportRows([btn.dataset.id]));
  });
}

/** Cập nhật checkbox "chọn tất cả" + hiện/ẩn nút xoá hàng loạt theo số dòng đang tick. */
function updateReportSelectionUI() {
  const selectAll = document.getElementById('reportSelectAll');
  const deleteBtn = document.getElementById('deleteSelectedRowsBtn');
  const countEl = document.getElementById('selectedRowsCount');
  const total = _reportFiltered.length;
  const selected = _reportSelectedIds.size;
  if (selectAll) {
    selectAll.checked = total > 0 && selected === total;
    selectAll.indeterminate = selected > 0 && selected < total;
  }
  if (countEl) countEl.textContent = selected;
  if (deleteBtn) deleteBtn.hidden = selected === 0;
}

document.getElementById('reportSelectAll')?.addEventListener('change', (e) => {
  _reportSelectedIds = e.target.checked ? new Set(_reportFiltered.map(r => r.id)) : new Set();
  document.querySelectorAll('.report-row-check').forEach(cb => { cb.checked = e.target.checked; });
  updateReportSelectionUI();
});

document.getElementById('deleteSelectedRowsBtn')?.addEventListener('click', () => {
  deleteReportRows([..._reportSelectedIds]);
});

/** Xoá 1 hoặc nhiều lượt làm bài (collection "quiz_results") khỏi Firestore
 * + khỏi 2 mảng cache cục bộ (_reportRawDocs/_reportFiltered), rồi vẽ lại
 * bảng/thống kê/biểu đồ. Cần quyền isAdmin() hoặc isCoordinator() theo
 * firestore.rules — báo lỗi rõ ràng nếu bị từ chối thay vì im lặng. */
async function deleteReportRows(ids) {
  if (!ids.length) return;
  const msg = ids.length === 1
    ? 'Xoá vĩnh viễn lượt làm bài này? Không thể hoàn tác.'
    : `Xoá vĩnh viễn ${ids.length} lượt làm bài đã chọn? Không thể hoàn tác.`;
  if (!confirm(msg)) return;

  try {
    const db = window.EduFirebase.db;
    const batch = db.batch();
    ids.forEach(id => batch.delete(db.collection('quiz_results').doc(id)));
    await batch.commit();

    const idSet = new Set(ids);
    _reportRawDocs = (_reportRawDocs || []).filter(d => !idSet.has(d.id));
    applyReportFiltersAndRender();
  } catch (err) {
    console.error('[EduQuiz] Lỗi xoá lượt làm bài:', err);
    alert('❌ Xoá thất bại: ' + err.message + '\n(Cần quyền Admin/Điều phối đào tạo — kiểm tra lại tài khoản đăng nhập.)');
  }
}

/** Hiện thông báo lỗi thân thiện thay cho canvas trắng khi Chart.js không tải được
 *  (bị chặn mạng, tracking prevention, adblock, CDN sập...). Không im lặng bỏ qua. */
function showChartLibUnavailable(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  canvas.style.display = 'none';
  let msg = canvas.parentElement.querySelector('.chart-lib-error');
  if (!msg) {
    msg = document.createElement('div');
    msg.className = 'chart-lib-error chart-empty';
    msg.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;min-height:180px;text-align:center;color:var(--text-muted);font-size:13px;padding:16px;';
    msg.innerHTML = '⚠️ Không tải được thư viện biểu đồ (Chart.js).<br>Có thể do trình chặn theo dõi (Tracking Prevention), adblock, hoặc mất mạng.' +
      '<button type="button" class="btn-retry-chart" style="margin-top:6px;padding:6px 14px;border-radius:8px;border:1px solid var(--border,#ddd);background:#fff;cursor:pointer;">🔄 Thử lại</button>';
    canvas.parentElement.appendChild(msg);
    msg.querySelector('.btn-retry-chart').addEventListener('click', () => {
      msg.innerHTML = 'Đang thử tải lại…';
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
      s.onload = () => renderReportCharts(_reportFiltered);
      s.onerror = () => { location.reload(); };
      document.body.appendChild(s);
    });
  }
  msg.style.display = 'flex';
}

function hideChartLibUnavailable(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.parentElement) return;
  canvas.style.display = '';
  const msg = canvas.parentElement.querySelector('.chart-lib-error');
  if (msg) msg.style.display = 'none';
}

// Style tooltip dùng chung cho cả 3 biểu đồ — to hơn, bo góc, đổ bóng nhẹ,
// giống tooltip của các dashboard BI doanh nghiệp (PowerBI/Looker) thay vì
// tooltip mặc định nhỏ/phẳng của Chart.js.
const PROFESSIONAL_TOOLTIP = {
  backgroundColor: 'rgba(20,22,34,.92)',
  titleFont: { weight: '800', size: 13 },
  bodyFont: { size: 12.5 },
  padding: 12,
  cornerRadius: 10,
  displayColors: true,
  boxPadding: 4,
};

function renderReportCharts(rows) {
  if (typeof Chart === 'undefined') {
    // Thư viện chưa tải xong / bị chặn mạng — hiện cảnh báo rõ ràng ở cả 3
    // card thay vì để trắng trơn không rõ lý do (đúng nguyên nhân trong ảnh
    // console: cdnjs.cloudflare.com bị Tracking Prevention chặn).
    ['chartPassFail', 'chartByClass', 'chartTrend'].forEach(showChartLibUnavailable);
    return;
  }
  ['chartPassFail', 'chartByClass', 'chartTrend'].forEach(hideChartLibUnavailable);

  Object.values(_reportCharts).forEach(c => c && c.destroy());
  _reportCharts = {};

  const scores = rows.map(r => r.score).filter(x => typeof x === 'number');
  const passed = scores.filter(s => s >= 70).length;
  const failed = scores.length - passed;

  // 1) Đạt / Chưa đạt — doughnut 3D (xem js/charts-3d.js: plugin edu3dPie tự
  // vẽ thêm "đáy trụ" dày hơn phía dưới). Cần chừa padding-bottom cho phần
  // đáy đó không bị cắt bởi vùng clip mặc định của Chart.js.
  _reportCharts.passFail = new Chart(document.getElementById('chartPassFail'), {
    type: 'doughnut',
    data: {
      labels: ['Đạt (≥70%)', 'Chưa đạt (<70%)'],
      datasets: [{ data: [passed, failed], backgroundColor: ['#21b36b', '#f0483e'], borderWidth: 0, hoverOffset: 10 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { bottom: 12 } },
      plugins: {
        legend: { position: 'bottom', labels: { font: { weight: '700' }, padding: 16 } },
        tooltip: PROFESSIONAL_TOOLTIP,
      },
    },
  });

  // 2) Điểm trung bình theo lớp — DÙNG CHUNG EduAnalytics.groupAvgBy() (đúng
  // hàm js/coordinator/charts.js!renderBar() đang dùng để vẽ biểu đồ y hệt
  // ý nghĩa ở Dashboard điều phối/Dashboard giáo viên) thay vì tự nhóm/tính
  // trung bình lại lần nữa ở đây.
  const byClass = window.EduAnalytics.groupAvgBy(rows, 'studentClass');
  const classLabels = Object.keys(byClass).sort();
  const classAverages = classLabels.map(k => Math.round(byClass[k] ?? 0));

  // Bar 3D (plugin edu3dBar tự vẽ thêm mặt bên + nắp trên, xem
  // js/charts-3d.js) — bỏ borderRadius (mặt phẳng bo tròn không khớp được
  // với mặt bên/nắp hình bình hành), chừa padding top/right cho phần khối
  // nhô thêm không bị cắt.
  _reportCharts.byClass = new Chart(document.getElementById('chartByClass'), {
    type: 'bar',
    data: {
      labels: classLabels,
      datasets: [{ label: 'Điểm TB (%)', data: classAverages, backgroundColor: '#4f6bff', maxBarThickness: 56 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 16, right: 16 } },
      plugins: { legend: { display: false }, tooltip: PROFESSIONAL_TOOLTIP },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,.06)' } },
        x: { grid: { display: false } },
      },
    },
  });

  // 3) Xu hướng điểm trung bình theo ngày — DÙNG CHUNG EduAnalytics.trendByDay()
  // (đúng hàm js/coordinator/charts.js!renderLine() đang dùng) — hàm này gom
  // theo ngày kiểu ISO (yyyy-mm-dd, ổn định để sort tăng dần) rồi trả sẵn
  // {date, avg}, chỉ cần đổi "date" sang định dạng vi-VN để hiển thị nhãn
  // trục X giống hệt bản cũ.
  const dayEntries = window.EduAnalytics.trendByDay(rows)
    .map((e) => ({ day: new Date(e.date).toLocaleDateString('vi-VN'), avg: Math.round(e.avg ?? 0) }));

  // Line "nổi khối" nhẹ (đổ bóng dưới đường viền, xem plugin edu3dLineShadow
  // ở js/charts-3d.js) + gradient đậm dần xuống đáy vùng tô thay vì màu
  // phẳng đơn sắc — trông có chiều sâu hơn mà biểu đồ xu hướng vẫn dễ đọc
  // (khác bar/pie, line 3D thật sự sẽ rối mắt nên không vẽ khối 3D thật).
  _reportCharts.trend = new Chart(document.getElementById('chartTrend'), {
    type: 'line',
    data: {
      labels: dayEntries.map(e => e.day),
      datasets: [{
        label: 'Điểm TB theo ngày (%)',
        data: dayEntries.map(e => e.avg),
        borderColor: '#17b3a3',
        backgroundColor: (ctx) => window.EduCharts3D.verticalGradient(
          ctx.chart.ctx, ctx.chart.chartArea, 'rgba(23,179,163,.05)', 'rgba(23,179,163,.45)'
        ),
        fill: true, tension: 0.35, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#17b3a3', pointBorderColor: '#fff', pointBorderWidth: 2,
        borderWidth: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { bottom: 10 } },
      plugins: { legend: { display: false }, tooltip: PROFESSIONAL_TOOLTIP },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,.06)' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ========================================
   MANAGE MODAL
   ======================================== */
function openManageModal(id, event) {
  event && event.stopPropagation();
  const set = allSets.find(s => s.id === id);
  if (!set) return;

  const sessions = getSessions().filter(s => s.setId === id);
  document.getElementById('modal-title').innerHTML = `⚙️ Quản lý – ${set.title}`;
  document.getElementById('modal-footer').innerHTML = `<button class="btn-cancel" onclick="closeModal()">Đóng</button>`;

  const items = sessions.length === 0
    ? `<div style="text-align:center;color:var(--text-muted);padding:24px 0;">Chưa có học sinh nào làm bài này.</div>`
    : sessions.map((s, i) => {
        const emojis = ['😊','🎯','🌟','🦊','🐼','🦋','🚀','🎲'];
        const colors = ['#f59e0b','#10b981','#6366f1','#ef4444','#ec4899','#14b8a6','#f97316','#8b5cf6'];
        return `<div class="progress-item">
          <div class="progress-avatar" style="background:${colors[i%colors.length]}22">${emojis[i%emojis.length]}</div>
          <div class="progress-info">
            <div class="progress-name">${s.studentName}</div>
            <div class="progress-meta">${s.startTime}</div>
          </div>
          ${s.score !== null
            ? `<div class="progress-score" style="color:#6366f1">${s.score}%</div>`
            : `<form class="progress-score-form" onsubmit="event.preventDefault();recordScore('${s.id}', this.querySelector('input').value)">
                 <input type="number" min="0" max="100" placeholder="%" required>
                 <button type="submit" title="Lưu điểm học sinh này">✔ Lưu</button>
               </form>`}
        </div>`;
      }).join('');

  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:4px;">
      <div style="background:var(--input-bg);border-radius:10px;padding:12px 18px;flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:900;font-family:'Baloo 2',cursive;">${sessions.length}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted)">Lượt làm</div>
      </div>
      <div style="background:var(--input-bg);border-radius:10px;padding:12px 18px;flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:900;font-family:'Baloo 2',cursive;">${sessions.filter(s=>s.status==='Hoàn thành').length}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted)">Hoàn thành</div>
      </div>
      <div style="background:var(--input-bg);border-radius:10px;padding:12px 18px;flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:900;font-family:'Baloo 2',cursive;">${set.questions}</div>
        <div style="font-size:11px;font-weight:700;color:var(--text-muted)">Câu hỏi</div>
      </div>
    </div>
    <div style="font-weight:800;font-size:13px;color:var(--text-secondary);margin-bottom:6px;">Danh sách học sinh</div>
    <div class="progress-student-list">${items}</div>
  `;

  openModalEl();
}

/* ========================================
   CREATE MODAL
   ======================================== */
function openModal(type) {
  document.getElementById('modal-title').innerHTML = '➕ Tạo bộ đề mới';
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn-cancel" onclick="closeModal()">Huỷ bỏ</button>
    <button class="btn-save" onclick="saveNewSet()">💾 Lưu bộ đề</button>
  `;
  document.getElementById('modal-body').innerHTML = `
    <div class="form-group">
      <label>Tên bộ đề *</label>
      <input id="newSetName" type="text" placeholder="VD: THCS – Khối 9">
    </div>
    <div class="form-group">
      <label>Cấp học *</label>
      <select id="newSetType">
        <option value="elementary">🌱 Tiểu học</option>
        <option value="middle">🎒 THCS</option>
      </select>
    </div>
    <div class="form-group">
      <label>Số câu hỏi</label>
      <input id="newSetQuestions" type="number" min="1" max="200" placeholder="30" value="30">
    </div>
    <div class="form-group">
      <label>Link ôn tập *</label>
      <input id="newSetLink" type="url" placeholder="https://wit.id.vn/...">
    </div>
    <div class="form-group">
      <label>Biểu tượng (emoji)</label>
      <input id="newSetIcon" type="text" placeholder="🎯" maxlength="2" value="🎯">
    </div>
  `;
  openModalEl();
}

function openModalEl() {
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function saveNewSet() {
  const name = document.getElementById('newSetName')?.value?.trim();
  const type = document.getElementById('newSetType')?.value;
  const link = document.getElementById('newSetLink')?.value?.trim();
  const questions = parseInt(document.getElementById('newSetQuestions')?.value || 30);
  const icon = document.getElementById('newSetIcon')?.value?.trim() || '🎯';

  if (!name || !link) {
    alert('Vui lòng nhập đầy đủ Tên bộ đề và Link ôn tập!');
    return;
  }

  const gradients = [
    'linear-gradient(135deg, #CFE3FF 0%, #EAF3FF 100%)',
    'linear-gradient(135deg, #C9F3E6 0%, #E9FBF5 100%)',
    'linear-gradient(135deg, #E4D6FF 0%, #F3EBFF 100%)',
    'linear-gradient(135deg, #D4F5DC 0%, #EEFBF1 100%)',
    'linear-gradient(135deg, #FFECC2 0%, #FFF8E6 100%)',
    'linear-gradient(135deg, #FFDCCF 0%, #FFEFE8 100%)',
  ];

  const newSet = {
    id: 'custom_' + Date.now(),
    title: name,
    subtitle: type === 'elementary' ? 'IC3 GS5 – Tiểu học' : 'IC3 GS5 – THCS',
    questions: questions || 30,
    type: type,
    icon: icon,
    coverGradient: gradients[Math.floor(Math.random() * gradients.length)],
    link: link
  };

  // Save to localStorage
  const saved = JSON.parse(localStorage.getItem('ic3_custom_sets') || '[]');
  saved.push(newSet);
  localStorage.setItem('ic3_custom_sets', JSON.stringify(saved));

  allSets = loadSets();
  renderCards();
  closeModal();
  showToast('✅ Đã tạo bộ đề: ' + name);
}

/* ========================================
   TOAST NOTIFICATION
   ======================================== */
function showToast(msg) {
  const toast = document.getElementById('session-toast');
  document.getElementById('toast-text').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ========================================
   NAVIGATION
   ======================================== */
const SECTION_TITLES = {
  'my-sets': '📚 Bộ đề của tôi',
  'reports': '📊 Báo cáo kết quả',
  'settings': '⚙️ Cài đặt hệ thống'
};

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    document.getElementById('section-' + section).classList.add('active');
    document.getElementById('topbar-title').textContent = SECTION_TITLES[section];

    if (section === 'reports') updateReportTab();

    // Close sidebar on mobile
    if (window.innerWidth <= 900) closeSidebar();
  });
});

/* ========================================
   THEME TOGGLE
   ======================================== */
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('ic3_theme', isDark ? 'light' : 'dark');
  const sd = document.getElementById('settingsDark');
  if (sd) sd.classList.toggle('on', !isDark);
}

function toggleThemeFromSettings(btn) {
  btn.classList.toggle('on');
  const isDark = btn.classList.contains('on');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('ic3_theme', isDark ? 'dark' : 'light');
}

// Restore theme
(function() {
  const saved = localStorage.getItem('ic3_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const sd = document.getElementById('settingsDark');
    if (sd && saved === 'dark') sd.classList.add('on');
  }
})();

/* ========================================
   MOBILE SIDEBAR
   ======================================== */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

/* ========================================
   EXPORT REPORT — xuất CSV từ dữ liệu Firestore thật (đã áp bộ lọc hiện tại)
   ======================================== */
function exportReport() {
  const rows = _reportFiltered;
  if (!rows || rows.length === 0) { alert('Chưa có dữ liệu để xuất (theo bộ lọc hiện tại)!'); return; }
  const csv = ['Học sinh,Lớp,Trường,Bộ đề,Thời gian nộp,Điểm (%),Đúng/Tổng,Trạng thái',
    ...rows.map(r => {
      const dateStr = new Date(r.submittedAtMs).toLocaleString('vi-VN');
      const status = r.integrityOk !== false ? 'Hợp lệ' : 'Nghi vấn: ' + (r.flags || []).join('; ');
      return `"${r.studentName || ''}","${r.studentClass || ''}","${r.studentSchool || ''}","${r.testName || ''}","${dateStr}","${r.score ?? ''}","${r.correct ?? ''}/${r.total ?? ''}","${status}"`;
    })
  ].join('\n');
  const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IC3_BaoCao_' + new Date().toLocaleDateString('vi-VN').replace(/\//g,'_') + '.csv';
  a.click();
  showToast('📥 Đã xuất báo cáo CSV!');
}

function clearAllData() {
  if (!confirm('Xoá TOÀN BỘ dữ liệu phiên? Hành động này không thể hoàn tác!')) return;
  localStorage.removeItem('ic3_sessions');
  localStorage.removeItem('ic3_custom_sets');
  allSets = loadSets();
  renderCards();
  updateReportTab();
  showToast('🗑️ Đã xoá toàn bộ dữ liệu!');
}

/* ========================================
   INIT
   ======================================== */
renderCards();
// Báo cáo (Firestore) chỉ được tải khi vào tab "Báo cáo kết quả" (xem
// listener .nav-item ở trên) — vừa tránh gọi Firestore trước khi đăng
// nhập hoàn tất, vừa đỡ tốn quota khi người dùng không xem tab này.
