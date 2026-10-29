/* ============================================================
   js/dashboard-settings.js — mục "Cài đặt hệ thống" ở ic3-dashboard.html
   Trước đây cả trang là công tắc GIẢ (bấm chỉ đổi màu, không ảnh hưởng gì) và thẻ
   "Thông tin hệ thống" trống. Giờ:
   - Giao diện: Dark Mode / hiệu ứng / số câu hỏi trên thẻ — lưu localStorage, có tác dụng thật.
   - Dữ liệu trên máy: đếm bộ đề + lượt làm bài, sao lưu/khôi phục bộ đề ra file .json
     (bộ đề tự soạn chỉ nằm trong trình duyệt — đổi máy là mất nếu không sao lưu).
   - Thông tin hệ thống: đọc js/backend-config.js + kết quả kiểm tra Apps Script ĐÃ LƯU
     (js/services/backend-version-check.js) → mở mục này 0 lượt Firebase, 0 lượt Apps Script.
     Chỉ nút "Kiểm tra Apps Script ngay" (admin) gửi 1 lượt ping công khai, không đọc/ghi Sheet.
   Nạp SAU js/dashboard.js (dùng loadSets/renderCards/getSessions/showToast của file đó).
   ============================================================ */

/* ── Giao diện: áp ngay khi nạp trang để không nháy ── */
const DASH_PREFS_KEY = 'ic3_dash_prefs';

function _loadDashPrefs() {
  try { return JSON.parse(localStorage.getItem(DASH_PREFS_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function _applyDashPrefs() {
  const p = _loadDashPrefs();
  const html = document.documentElement;
  if (p.motion === false) html.setAttribute('data-motion', 'off'); else html.removeAttribute('data-motion');
  if (p.qcount === false) html.setAttribute('data-hide-qcount', ''); else html.removeAttribute('data-hide-qcount');
  document.getElementById('settingsMotion')?.classList.toggle('on', p.motion !== false);
  document.getElementById('settingsQCount')?.classList.toggle('on', p.qcount !== false);
}

function toggleDashPref(btn, key) {
  const p = _loadDashPrefs();
  p[key] = !btn.classList.contains('on');
  try { localStorage.setItem(DASH_PREFS_KEY, JSON.stringify(p)); } catch (e) { /* kho bị chặn: không nhớ được */ }
  _applyDashPrefs();
}

_applyDashPrefs();

/* ── Dữ liệu trên máy ── */
function _fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function _readCustomSets() {
  try { const v = JSON.parse(localStorage.getItem('ic3_custom_sets') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function renderLocalDataInfo() {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('setInfoSets', _readCustomSets().length + ' bộ');
  set('setInfoSessions', getSessions().length + ' lượt');
  let bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      bytes += (k.length + (localStorage.getItem(k) || '').length) * 2; // UTF-16
    }
    set('setInfoStorage', _fmtBytes(bytes) + ' / ~5 MB');
  } catch (e) { set('setInfoStorage', 'Không đọc được'); }
}

function exportCustomSets() {
  const sets = _readCustomSets();
  if (!sets.length) { showToast('Chưa có bộ đề nào để sao lưu.', 'fa-triangle-exclamation'); return; }
  const blob = new Blob([JSON.stringify({ kind: 'ic3-custom-sets', v: 1, exportedAt: new Date().toISOString(), sets }, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'IC3_BoDe_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Đã sao lưu ${sets.length} bộ đề.`, 'fa-download');
}

/* File khôi phục có thể do người khác gửi, mà thẻ bộ đề render title/icon/coverGradient bằng
   innerHTML/style (js/dashboard.js renderCards) → chỉ nhận đúng các trường đã biết và lọc ký tự
   có thể chèn mã. builder giữ nguyên: exam-builder.js tự escape khi vẽ lại. */
function _cleanImportedSet(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^[\w-]{1,64}$/.test(s.id)) return null;
  const txt = (v, max) => (typeof v === 'string' ? v.replace(/[<>"'`]/g, '').slice(0, max) : '');
  const title = txt(s.title, 200).trim();
  const link = typeof s.link === 'string' ? s.link.trim() : '';
  if (!title || !link || /^\s*(javascript|data|vbscript):/i.test(link) || /["'<>\s]/.test(link)) return null;
  const out = {
    id: s.id,
    title,
    subtitle: txt(s.subtitle, 300),
    questions: Math.max(0, Math.min(500, parseInt(s.questions, 10) || 0)),
    type: s.type === 'elementary' ? 'elementary' : 'middle',
    icon: txt(s.icon, 120),
    coverGradient: typeof s.coverGradient === 'string' && /^[\w\s#(),.%-]{1,200}$/.test(s.coverGradient) ? s.coverGradient : '#e8ecff',
    link,
  };
  if (s.builder && typeof s.builder === 'object') out.builder = s.builder;
  if (Number.isFinite(s.updatedAt)) out.updatedAt = s.updatedAt;
  return out;
}

function importCustomSets(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { showToast('File quá lớn (tối đa 4 MB).', 'fa-triangle-exclamation'); return; }
  file.text().then((text) => {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('File không phải JSON hợp lệ'); }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.sets) ? data.sets : null);
    if (!list) throw new Error('File không phải bản sao lưu bộ đề');
    const clean = list.map(_cleanImportedSet).filter(Boolean);
    if (!clean.length) throw new Error('Không có bộ đề hợp lệ trong file');
    const current = _readCustomSets();
    const byId = new Map(current.map((s) => [s.id, s]));
    let added = 0, updated = 0;
    clean.forEach((s) => {
      const old = byId.get(s.id);
      if (!old) { added++; byId.set(s.id, s); return; }
      // Trùng id: giữ bản mới hơn (theo updatedAt), không ghi đè bản đang sửa dở trên máy
      if ((s.updatedAt || 0) > (old.updatedAt || 0)) { updated++; byId.set(s.id, s); }
    });
    if (!added && !updated) { showToast('Mọi bộ đề trong file đã có sẵn trên máy.', 'fa-circle-check'); return; }
    try { localStorage.setItem('ic3_custom_sets', JSON.stringify([...byId.values()])); }
    catch (e) { throw new Error('Bộ nhớ trình duyệt đầy'); }
    refreshSetsFromStorage();
    renderLocalDataInfo();
    showToast(`Đã khôi phục: thêm ${added}, cập nhật ${updated} bộ đề.`, 'fa-upload');
  }).catch((err) => showToast('Không khôi phục được: ' + err.message, 'fa-triangle-exclamation'));
}

/* ── Thông tin hệ thống (chỉ đọc cấu hình tĩnh + bộ đệm trên máy) ── */
const _RESULT_MODE_LABEL = {
  off: 'Google Sheet (0 lượt ghi Firebase)',
  'test-only': 'Sheet; bài Kiểm tra thêm Firestore',
  all: 'Firestore + Google Sheet',
};

function _scriptStatusText() {
  const want = window.EduBackend && window.EduBackend.expectedBackendVersion;
  let last = null;
  try { last = JSON.parse(localStorage.getItem('edu_backend_version_check') || 'null'); } catch (e) { /* bỏ qua */ }
  if (!last || last.want !== want || !Array.isArray(last.stale)) return { text: 'Chưa kiểm tra trên máy này', bad: false };
  const when = new Date(last.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  if (last.stale.length) return { text: `Cũ hơn bản ${want} (kiểm lúc ${when})`, bad: true };
  return { text: `Khớp bản ${want} (kiểm lúc ${when})`, bad: false };
}

function renderSystemInfo() {
  const b = window.EduBackend || {};
  const set = (id, text, bad) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-bad', !!bad);
  };
  const profile = window.EduCurrentProfile;
  if (profile) {
    const role = (window.EduAuth && EduAuth.ROLE_LABEL[profile.role]) || profile.role;
    set('sysInfoAccount', role + (profile.school ? ' · ' + profile.school : ''));
    const row = document.getElementById('sysInfoScriptRow');
    if (row) row.hidden = profile.role !== 'admin';
  }
  set('sysInfoVersion', window.APP_VERSION || '–');
  const qr = b.quizResults || {};
  set('sysInfoResults', _RESULT_MODE_LABEL[qr.firestore || 'all'] || String(qr.firestore), qr.firestore !== 'off' && !qr.sheet);
  const from = window.EduSheetResults ? (EduSheetResults.enabled() ? 'sheet' : 'firestore') : 'firestore';
  set('sysInfoReports', from === 'sheet' ? 'Google Sheet qua Apps Script' : 'Firestore (tốn lượt đọc)', from !== 'sheet' && qr.firestore !== 'all');
  set('sysInfoLog', b.activityLog === 'sheet' ? 'Google Sheet (0 lượt Firebase)' : 'Tắt');
  const st = _scriptStatusText();
  set('sysInfoScript', st.text, st.bad);
}

function recheckAppsScript(btn) {
  if (!window.EduBackendVersionCheck) return;
  btn.disabled = true;
  try { localStorage.removeItem('edu_backend_version_check'); } catch (e) { /* bỏ qua */ }
  EduBackendVersionCheck.check()
    .catch(() => { /* lỗi mạng: không kết luận */ })
    .finally(() => { btn.disabled = false; renderSystemInfo(); });
}

/* Phiên bản web: file VERSION tĩnh trên GitHub Pages (không phải Firebase/Apps Script),
   chỉ tải khi mở mục Cài đặt lần đầu. */
let _versionFetched = false;
function _loadWebVersion() {
  if (_versionFetched || window.APP_VERSION) return;
  _versionFetched = true;
  fetch('VERSION', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((t) => { const v = t.split('\n')[0].trim(); if (v) { window.APP_VERSION = v; renderSystemInfo(); } })
    .catch(() => { /* chỉ là thông tin */ });
}

function renderSettingsSection() {
  renderLocalDataInfo();
  renderSystemInfo();
  _loadWebVersion();
}

document.querySelector('.nav-item[data-section="settings"]')?.addEventListener('click', renderSettingsSection);
window.addEventListener('edu:ready', renderSystemInfo);
