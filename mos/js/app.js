/* Trang Ôn luyện MOS — điều hướng bằng #hash, không cần máy chủ:
   #/                 trang chủ (thông tin học sinh, chọn môn)
   #/s/<môn>          danh sách bộ đề
   #/set/<bộ đề>      danh sách project + nút thi thử
   #/p/<project>      luyện tập 1 project (có hướng dẫn, chấm ngay)
   #/exam/<bộ đề>     thi thử cả bộ có giờ (ẩn hướng dẫn, chấm khi kết thúc)
   #/r/<lượt làm>     kết quả 1 lượt
   #/history          lịch sử trên máy này */
(function () {
  'use strict';

  const CFG = window.MosConfig;
  const app = document.getElementById('app');

  // ---------------------------------------------------------------- tiện ích

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = sel => app.querySelector(sel);

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy/bị chặn: chỉ mất lịch sử */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } },
  };

  const ICON = {
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
    upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v3h16v-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    file: '<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    moon: '<path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z"/>',
    warn: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    dock: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 15h18"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
    list: '<path d="M6 2h12v20H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>',
  };
  const icon = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const fmtTime = t => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  const pad2 = n => String(n).padStart(2, '0');
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`; };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const setIdOf = pid => pid.replace(/-p\d+$/, '');
  const subjectOf = id => id.startsWith('ppt-') ? 'powerpoint' : id.startsWith('word-') ? 'word' : 'excel';

  function lines(text) {
    return esc(text).replace(/\n{2,}/g, '\n').split('\n').map(l => l.trim()).filter(Boolean)
      .map(l => `<span class="line">${l}</span>`).join('');
  }

  // ---------------------------------------------------------------- dữ liệu

  const cache = {};
  async function getJson(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(`Không tải được ${url} (${r.status})`);
        return r.json();
      }).catch(e => { delete cache[url]; throw e; });
    }
    return cache[url];
  }
  const getIndex = () => getJson('data/index.json');
  const getSet = id => getJson(`data/sets/${id}.json`);
  const getRubrics = subject => getJson(`data/rubrics/${subject}.json`).catch(() => ({}));

  let jszip = null;
  function loadJsZip() {
    if (window.JSZip) return Promise.resolve();
    jszip = jszip || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/jszip.min.js';
      s.onload = res;
      s.onerror = () => { jszip = null; rej(new Error('Không tải được bộ đọc tệp (jszip).')); };
      document.head.appendChild(s);
    });
    return jszip;
  }

  // Tệp đề lấy từ Google Drive (data/drive.json, sinh bằng tools/build-drive-map.js) nên trang tĩnh
  // (GitHub Pages, Live Server) không cần có tệp đề. Máy chủ phòng máy vẫn dùng tệp của nó cho nhanh.
  // Drive chặn fetch() khác tên miền (403), nên:
  //   • có CFG.driveApiKey → đọc tệp qua Drive API (cho phép CORS), đề Word tách từ bài giảng .pptx;
  //   • không có khoá → học sinh bấm link tải từ Drive (link thường thì Drive cho tải), rồi chọn tệp vừa tải.
  let DRIVE = {};
  const driveReady = getJson('data/drive.json').then(d => { DRIVE = d.files || {}; }).catch(() => {});
  const driveUrl = id => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  const driveApi = id => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${encodeURIComponent(CFG.driveApiKey)}`;
  /** Tệp lấy từ Drive (null = dùng tệp trên máy chủ). Gọi sau driveReady và Srv.ready (route() đợi sẵn). */
  const driveOf = f => (Srv.ok ? null : DRIVE[f.path] || null);
  /** Không có khoá API: tệp chỉ tải được bằng link — trả về link đó (đề Word nằm trong bài giảng thì không có link). */
  const driveLink = f => { const d = driveOf(f); return d && !CFG.driveApiKey ? (d.embed ? '' : driveUrl(d.id)) : null; };
  async function fetchOk(url) {
    const r = await fetch(url);
    if (!r.ok) {
      throw Object.assign(new Error(r.status === 404
        ? 'Chưa có tệp đề này trên Drive lẫn máy chủ — em báo thầy cô.'
        : `Không tải được tệp đề (${r.status}).`), { code: 'nofile' });
    }
    return r;
  }
  const decks = {};
  async function fileBlob(f) {
    const d = driveOf(f);
    if (!d || !CFG.driveApiKey) return (await fetchOk(f.path)).blob();
    if (!d.embed) return (await fetchOk(driveApi(d.id))).blob();
    await loadJsZip();
    decks[d.id] = decks[d.id] || fetchOk(driveApi(d.id)).then(r => r.arrayBuffer()).then(b => window.JSZip.loadAsync(b))
      .catch(e => { delete decks[d.id]; throw e; });
    const entry = (await decks[d.id]).file(d.embed);
    if (!entry) throw Object.assign(new Error('Bài giảng trên Drive không còn tệp đề này — em báo thầy cô.'), { code: 'nofile' });
    return entry.async('blob');
  }
  // Nút tải tệp (tệp kèm, tệp đề khi trình duyệt không tự đọc được tệp): lấy qua fileBlob rồi lưu với đúng tên.
  const dlFiles = {};
  const dlLink = (f, cls, inner) => {
    const link = driveLink(f);
    if (link) return `<a class="${cls}" href="${esc(link)}" rel="noopener">${inner}</a>`;
    dlFiles[f.path] = f;
    return `<a class="${cls}" href="${esc(f.path)}" data-dl="${esc(f.path)}" download="${esc(f.name)}">${inner}</a>`;
  };
  document.addEventListener('click', async e => {
    const a = e.target.closest && e.target.closest('a[data-dl]');
    if (!a || !dlFiles[a.dataset.dl]) return;
    e.preventDefault();
    const f = dlFiles[a.dataset.dl];
    a.classList.add('busy');
    try {
      const url = URL.createObjectURL(await fileBlob(f));
      const tmp = Object.assign(document.createElement('a'), { href: url, download: f.name });
      document.body.appendChild(tmp); tmp.click(); tmp.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { alert(err.message); }
    a.classList.remove('busy');
  });

  /** Chấm 1 tệp; với Excel tải kèm tệp đề gốc (vài chục KB) cho các tiêu chí so trước/sau. */
  const baseCache = {};
  async function gradeFile(file, project, rubric, only) {
    await loadJsZip();
    const buffer = await file.arrayBuffer();
    if (/\.(xlsx|docx)$/i.test(project.main) && !(project.id in baseCache)) {
      const main = project.files.find(f => f.name === project.main);
      try { baseCache[project.id] = await (await fileBlob(main)).arrayBuffer(); } catch (e) { baseCache[project.id] = null; }
    }
    return window.MosGrader.grade(buffer, project, rubric || {}, { baseBuffer: baseCache[project.id] || null, only });
  }

  // Tệp đề có trên Drive thì coi là có; không thì hỏi máy chủ (tệp PowerPoint/Word không nằm trên git).
  const availability = {};
  function checkAvailable(f) {
    if (!(f.path in availability)) {
      const d = driveOf(f);
      availability[f.path] = d && (CFG.driveApiKey || !d.embed) ? Promise.resolve(true)
        : fetch(f.path, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
    }
    return availability[f.path];
  }

  // ---------------------------------------------------------------- học sinh / lịch sử / gửi kết quả

  const student = () => store.get('mos_student', null);
  const history = () => store.get('mos_history', []);
  function saveAttempt(a) {
    const h = history().filter(x => x.id !== a.id);
    h.unshift(a);
    store.set('mos_history', h.slice(0, 200));
  }

  function toSheetPayload(a) {
    const st = a.student || {};
    const results = a.projects.flatMap(p => p.results.map(r => ({
      id: `${p.no}.${r.no}`, label: (r.text || '').slice(0, 200),
      passed: r.status === 'self' ? null : r.status === 'pass', manual: r.status === 'self',
      note: r.note || (p.submitted ? '' : 'Chưa nộp tệp'),
    }))).slice(0, 200);
    return {
      submissionId: a.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64),
      studentName: (st.name || '').slice(0, 120), studentClass: (st.cls || '').slice(0, 40), studentSchool: (st.school || '').slice(0, 160),
      projectId: a.mode + ':' + (a.projectId || a.setId),
      projectTitle: `${a.mode === 'exam' ? 'Thi thử' : 'Luyện tập'} ${a.subjectName} · ${a.title}${a.score != null ? ` (${a.score}/1000)` : ''}`.slice(0, 300),
      score: a.score == null ? null : Math.round(a.score / 10),
      passedCount: a.passed, autoTotal: a.auto, manualCount: a.self, results,
    };
  }

  async function postSheet(payload) {
    // Máy chủ trường (server/server.js) đặt CFG.relayUrl: gửi vào hàng đợi, máy chủ gửi tiếp Apps Script theo lô.
    const res = await fetch(CFG.relayUrl || CFG.appsScriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'mosSubmit', payload, endpoint: CFG.relayUrl ? CFG.appsScriptUrl : undefined }),
    });
    const json = await res.json();
    if (!json.ok) throw Object.assign(new Error(json.error || 'Apps Script báo lỗi'), { code: json.code });
  }

  // Gửi lại khi có mạng; trùng submissionId thì Apps Script tự bỏ qua.
  async function flushPending() {
    if (!CFG.appsScriptUrl || !navigator.onLine) return;
    const queue = store.get('mos_pending', []);
    if (!queue.length) return;
    const left = [];
    for (const p of queue) {
      try { await postSheet(p); } catch (e) { if (e.code !== 'invalid-argument') left.push(p); }
    }
    store.set('mos_pending', left);
  }
  function sendAttempt(a) {
    if (!CFG.appsScriptUrl || !a.student || !a.student.name) return;
    if (a.mode === 'practice' && !CFG.sendPractice) return;
    const q = store.get('mos_pending', []);
    q.push(toSheetPayload(a));
    store.set('mos_pending', q);
    flushPending();
  }

  // ---------------------------------------------------------------- khung trang

  const whoText = st => (st && st.name ? st.name + (st.cls ? ' · ' + st.cls : '') : 'Chưa nhập tên');

  function sidebar() {
    const route = location.hash.split('/')[1] || '';
    const on = names => (names.includes(route) ? ' class="on"' : '');
    return `<aside class="sidenav">
      <a class="side-brand" href="#/"><span class="brand-mark">MOS</span><span>Ôn luyện MOS</span></a>
      <a class="side-who" href="#/" title="Sửa thông tin thí sinh">${icon('user')}<span>${esc(whoText(student()))}</span></a>
      <nav class="side-nav">
        <a href="#/"${on(['', 's', 'set', 'p', 'exam'])}>${icon('home')}<span>Trang chủ</span></a>
        <a href="#/history"${on(['history', 'r'])}>${icon('list')}<span>Bảng điểm</span></a>
      </nav>
      <button type="button" class="side-theme" id="themeBtn">${icon('moon')}<span>Chế độ tối</span></button>
    </aside>`;
  }

  function page(body, opts) {
    leave();
    app.innerHTML = `<div class="shell">${sidebar()}<main class="wrap${opts && opts.wide ? ' wide' : ''}">${body}</main></div>`;
    window.scrollTo(0, 0);
  }

  function crumbs(items) {
    return `<nav class="crumbs">${items.map((it, i) => i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a><span>/</span>` : `<strong>${esc(it[0])}</strong>`).join('')}</nav>`;
  }

  function showError(e) {
    page(`<section class="panel"><h1>Không mở được trang</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Về trang chủ</a></section>`);
  }

  // ---------------------------------------------------------------- trang chủ

  async function viewHome() {
    const idx = await getIndex();
    const st = student() || { name: '', cls: '', school: CFG.defaultSchool };
    const recent = history().slice(0, 5);
    const tiles = idx.subjects.map(s => {
      const tasks = s.sets.reduce((a, st2) => a + st2.projects.reduce((b, p) => b + p.tasks, 0), 0);
      const empty = !s.sets.length;
      return `<a class="tile${empty ? ' off' : ''}" ${empty ? 'aria-disabled="true"' : `href="#/s/${s.id}"`}>
        <span class="tile-mark m-${s.id}">${s.name[0]}</span>
        <span class="tile-name">${esc(s.name)}</span>
        <span class="tile-meta">${empty ? 'Chưa có bộ đề' : `${s.sets.length} bộ đề · ${tasks} task`}</span>
      </a>`;
    }).join('');
    page(`
      <h2 class="section-title first">Chọn môn</h2>
      <div class="tiles">${tiles}</div>
      <section class="panel intro">
        <h2>Thông tin thí sinh</h2>
        <form class="student" id="studentForm" autocomplete="on">
          <label>Họ và tên<input name="name" required maxlength="80" value="${esc(st.name)}" placeholder="Nguyễn Văn A"></label>
          <label>Lớp<input name="cls" maxlength="20" value="${esc(st.cls)}" placeholder="8A1"></label>
          <label>Trường<input name="school" maxlength="120" value="${esc(st.school)}" placeholder="THCS ..."></label>
          <button class="btn" type="submit">Lưu</button>
          <span class="saved muted" id="savedMsg" hidden>Đã lưu.</span>
        </form>
        <details class="how-box"><summary>Cách làm bài</summary><ol class="how">
          <li>Em tải tệp đề, làm trên Microsoft Office thật. Tệp chấm ngay trên máy em, không gửi đi đâu.</li>
          <li><strong>Luyện tập</strong>: không giới hạn thời gian, có hướng dẫn từng bước, chấm ngay từng task.</li>
          <li><strong>Thi thử</strong>: ${CFG.examMinutes} phút như phòng thi, không xem hướng dẫn, kết thúc mới có điểm.</li>
          <li>Điểm theo thang 1000, đạt từ ${CFG.passScore}. Task ghi "Tự kiểm" em tự đối chiếu với hướng dẫn.</li>
        </ol></details>
      </section>
      ${recent.length ? `<h2 class="section-title">Gần đây</h2>${historyTable(recent)}<p><a href="#/history">Xem bảng điểm</a></p>` : ''}
    `);
    $('#studentForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      store.set('mos_student', { name: f.get('name').trim(), cls: f.get('cls').trim(), school: f.get('school').trim() });
      $('#savedMsg').hidden = false;
      document.querySelector('.side-who span').textContent = whoText(student());
    });
  }

  // ---------------------------------------------------------------- môn / bộ đề

  async function viewSubject(id) {
    const idx = await getIndex();
    const s = idx.subjects.find(x => x.id === id);
    if (!s) throw new Error('Không có môn này.');
    const rubrics = await getRubrics(id);
    const best = bestScores();
    const rows = s.sets.map(st => {
      const tasks = st.projects.reduce((a, p) => a + p.tasks, 0);
      const auto = st.projects.reduce((a, p) => a + Object.keys(rubrics[p.id] || {}).length, 0);
      const b = best['exam:' + st.id];
      return `<tr>
        <td><a href="#/set/${st.id}"><strong>${esc(st.title)}</strong></a></td>
        <td>${st.projects.length} project · ${tasks} task</td>
        <td>${auto ? `<span class="chip ok">${auto}/${tasks} tự chấm</span>` : '<span class="chip">Tự kiểm</span>'}</td>
        <td>${b != null ? `<span class="score-sm ${b >= CFG.passScore ? 'pass' : 'fail'}">${b}</span>` : '<span class="muted">—</span>'}</td>
        <td class="actions"><a class="btn-sec" href="#/set/${st.id}">Luyện tập</a><a class="btn" href="#/exam/${st.id}">Thi thử</a></td>
      </tr>`;
    }).join('');
    page(`${crumbs([['Trang chủ', '#/'], [s.name, '']])}
      <h1>${esc(s.name)} — bộ đề ôn luyện</h1>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Bộ đề</th><th>Nội dung</th><th>Chấm</th><th>Thi thử tốt nhất</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`);
  }

  function bestScores() {
    const out = {};
    for (const a of history()) {
      const k = a.mode + ':' + (a.projectId || a.setId);
      if (a.score != null && (out[k] == null || a.score > out[k])) out[k] = a.score;
    }
    return out;
  }

  async function viewSet(id) {
    const set = await getSet(id);
    const idx = await getIndex();
    const subj = idx.subjects.find(s => s.id === set.subject);
    startScreen(set, subj, await getRubrics(set.subject), store.get('mos_mode', 'practice'));
  }

  /** Màn bắt đầu bộ đề: chọn chế độ Luyện tập / Thi thử, xem số task – thời gian – điểm đạt, rồi bấm Bắt đầu. */
  function startScreen(set, subj, rubrics, mode) {
    const best = bestScores();
    const taskN = set.projects.reduce((a, p) => a + p.tasks.length, 0);
    const autoN = set.projects.reduce((a, p) => a + Object.keys(rubrics[p.id] || {}).length, 0);
    const pracState = p => store.get('mos_prac_' + p.id, null);
    const doneOf = p => { const s = pracState(p); return s ? p.tasks.filter(t => (s.marks[t.no] || {}).done).length : 0; };
    const rows = set.projects.map(p => {
      const auto = Object.keys(rubrics[p.id] || {}).length;
      const b = best['practice:' + p.id];
      const done = doneOf(p);
      return `<a class="row-link" href="#/p/${p.id}">
        <span class="row-title">${esc(p.title)}</span>
        <span class="muted">${p.tasks.length} task${auto ? ` · ${auto} tự chấm` : ''}${done ? ` · đã làm ${done}` : ''}</span>
        <span>${b != null ? `<span class="score-sm ${b >= CFG.passScore ? 'pass' : 'fail'}">${b}</span>` : ''}</span>
        ${icon('right')}
      </a>`;
    }).join('');
    const examKey = 'mos_exam_' + set.id;
    page(`<div class="gm-head">
        <a class="gm-back" href="#/s/${subj.id}" title="Về danh sách bộ đề ${esc(subj.name)}">${icon('left')}</a>
        <span class="gm-app"><span class="tile-mark m-${subj.id}">${subj.name[0]}</span>${esc(subj.name)}</span>
        <h1>${esc(set.title)}</h1>
      </div>
      <section class="panel gm-start">
        ${store.get(examKey, null) ? `<p class="gm-resume">${icon('clock')}<span>Em đang thi thử dở bộ đề này.</span><a class="btn" href="#/exam/${set.id}">Tiếp tục bài thi</a></p>` : ''}
        <div class="gm-opts">
          <label for="modeSel">Chế độ</label>
          <select id="modeSel">
            <option value="practice"${mode === 'practice' ? ' selected' : ''}>Luyện tập</option>
            <option value="exam"${mode === 'exam' ? ' selected' : ''}>Thi thử</option>
          </select>
          <p class="muted small" id="modeHint"></p>
        </div>
        <div class="gm-stats" id="gmStats"></div>
        <div id="gmWho"></div>
        <div class="gm-go">
          <button type="button" class="link-btn" id="goPage">Làm trên trang đầy đủ</button>
          <a class="btn-sec" href="#/s/${subj.id}">Huỷ bỏ</a>
          <button type="button" class="btn" id="goBtn">Bắt đầu</button>
        </div>
      </section>
      <h2 class="section-title">Các project</h2>
      <div class="rows">${rows}</div>
      ${set.attachments ? `<details class="panel attach"><summary>Dữ liệu đính kèm của đề</summary>${attachTable(set.attachments)}</details>` : ''}`);

    const draw = () => {
      const exam = mode === 'exam';
      const st = student();
      $('#modeHint').textContent = exam
        ? `Thi cả ${set.projects.length} project trong ${CFG.examMinutes} phút, không xem hướng dẫn. Kết thúc mới có điểm.`
        : 'Không giới hạn thời gian, có hướng dẫn từng bước, chấm ngay từng task.';
      $('#gmStats').innerHTML = `
        <div class="gm-stat"><div class="gm-box"><b>${taskN}</b><small>${autoN} tự chấm</small></div><span>Task</span></div>
        <div class="gm-stat"><div class="gm-box"><b>${exam ? CFG.examMinutes : '—'}</b><small>${exam ? 'Phút' : 'Không giới hạn'}</small></div><span>Thời gian</span></div>
        <div class="gm-stat"><div class="gm-box"><b>${CFG.passScore}</b><small>Hết 1000</small></div><span>Điểm đạt</span></div>`;
      const needName = exam && !(st && st.name);
      $('#gmWho').innerHTML = needName
        ? `<p class="warn">${icon('warn')} Em nhập họ tên ở <a href="#/">trang chủ</a> trước khi thi để thầy cô nhận được kết quả.</p>`
        : st && st.name ? `<p class="muted small">Thí sinh: <strong>${esc(st.name)}</strong>${st.cls ? ' · Lớp ' + esc(st.cls) : ''}</p>` : '';
      $('#goBtn').disabled = needName;
      $('#goPage').disabled = needName;
    };
    const go = useDock => {
      if (mode === 'exam') return beginExam(set, useDock);
      const p = set.projects.find(x => doneOf(x) < x.tasks.length) || set.projects[0];
      if (useDock) openDock('p/' + p.id); else location.hash = '#/p/' + p.id;
    };
    $('#modeSel').addEventListener('change', e => { mode = e.target.value; store.set('mos_mode', mode); draw(); });
    $('#goBtn').addEventListener('click', () => go(true));
    $('#goPage').addEventListener('click', () => go(false));
    draw();
  }

  async function beginExam(set, useDock) {
    const key = 'mos_exam_' + set.id;
    if (!store.get(key, null)) {
      for (const p of set.projects) if (W.supported) await W.delHandle('exam:' + p.id);
      store.set(key, { startedAt: Date.now(), endsAt: Date.now() + CFG.examMinutes * 60000, cur: 0, subs: {}, marks: {} });
    }
    if (useDock) openDock('exam/' + set.id);
    else if (location.hash === '#/exam/' + set.id) route();
    else location.hash = '#/exam/' + set.id;
  }

  function attachTable(rows) {
    return `<div class="table-wrap"><table class="grid small">${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }

  // ---------------------------------------------------------------- tệp đang làm (kiểu GMetrix)
  // Em tải đề qua trang → làm trên Office → Ctrl+S → trang tự đọc lại tệp để chấm từng câu, không phải tải lên.

  const W = window.MosWorkfile;
  const leaving = [];
  function onLeave(fn) { leaving.push(fn); }
  function leave() { while (leaving.length) { try { leaving.pop()(); } catch (e) { /* bỏ qua */ } } stopTimer(); }

  // Máy chủ phòng máy (mos/server.js): Office mở/lưu thẳng tệp trên máy chủ qua WebDAV.
  // Trên GitHub Pages không có /api/info → dùng tệp trên máy em (File System Access).
  const Srv = { ok: false };
  Srv.ready = fetch('api/info', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
    .then(j => { Srv.ok = !!(j && j.server === 'mos'); }).catch(() => {});
  const OFFICE_APP = { excel: 'excel', powerpoint: 'powerpoint', word: 'word' };
  function sessionId() {
    let id = store.get('mos_sid', '');
    if (!/^[a-f0-9]{16}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
      store.set('mos_sid', id);
    }
    return id;
  }
  async function serverFile(url, name) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('Không đọc được tệp trên máy chủ (' + r.status + ').');
    const blob = await r.blob();
    return new File([blob], name, { lastModified: Date.parse(r.headers.get('last-modified')) || Date.now() });
  }

  function workSession(o) {
    const key = o.mode + ':' + o.project.id;
    const slotKey = 'mos_work_' + o.slot;
    const main = o.project.files.find(f => f.name === o.project.main);
    let unwatch = null;
    const ws = { handle: null, perm: '', fileName: '', savedAt: 0, upload: null, url: '', server: false };
    const live = () => (ws.server ? !!ws.url : !!ws.handle && ws.perm === 'granted');
    const watchNow = () => {
      if (unwatch) unwatch();
      if (ws.server) {
        // Hỏi máy chủ mỗi 1,5 giây xem tệp có đổi không (HEAD vài trăm byte trong mạng LAN).
        let last = null, busy = false, stopped = false;
        const tick = async () => {
          if (busy || stopped) return;
          busy = true;
          try {
            const r = await fetch(ws.url, { method: 'HEAD', cache: 'no-store' });
            const sig = r.headers.get('etag') || r.headers.get('last-modified');
            if (r.ok && last !== null && sig !== last) {
              last = sig;
              const f = await serverFile(ws.url, ws.fileName);
              ws.savedAt = f.lastModified;
              if (!stopped) await o.onSave(f);
            } else if (r.ok) last = sig;
          } catch (e) { /* mất mạng thoáng qua — lần sau hỏi lại */ }
          busy = false;
        };
        tick();
        const t = setInterval(tick, 1500);
        unwatch = () => { stopped = true; clearInterval(t); };
        return;
      }
      unwatch = W.watch(ws.handle, async file => { ws.savedAt = file.lastModified; await o.onSave(file); });
    };
    Object.assign(ws, {
      key, live,
      stop() { if (unwatch) unwatch(); unwatch = null; },
      async init() {
        await Srv.ready;
        if (Srv.ok) {
          ws.server = true;
          const u = store.get(slotKey, '');
          if (!u) return;
          const r = await fetch(u, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
          if (!r || !r.ok) { store.del(slotKey); return; }
          ws.url = u; ws.fileName = decodeURIComponent(u.split('/').pop());
          ws.savedAt = Date.parse(r.headers.get('last-modified')) || 0;
          watchNow();
          return;
        }
        if (!W.supported) return;
        ws.handle = await W.getHandle(key);
        if (!ws.handle) return;
        ws.fileName = ws.handle.name;
        ws.perm = await W.permission(ws.handle, false).catch(() => 'denied');
        if (live()) {
          try { ws.savedAt = (await ws.handle.getFile()).lastModified; } catch (e) { /* tệp bị xoá/đổi chỗ */ }
          watchNow();
        }
      },
      /** Máy chủ: tạo bản làm bài rồi mở bằng Office. Không có máy chủ: lưu tệp đề vào máy em. */
      async start(reset) {
        if (ws.server) {
          const r = await fetch('api/work', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid: sessionId(), slot: o.slot, file: main.path, reset: !!reset }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'Máy chủ không tạo được bản làm bài.');
          ws.url = j.url; ws.fileName = main.name; ws.savedAt = j.mtime;
          store.set(slotKey, j.url);
          watchNow();
          ws.openOffice();
          return;
        }
        ws.handle = await W.saveStarter(key, () => fileBlob(main), main.name, o.subj.ext);
        ws.fileName = ws.handle.name; ws.perm = 'granted'; ws.savedAt = Date.now();
        watchNow();
      },
      /** Mở tệp trên máy chủ bằng Office (giao thức ms-excel/ms-powerpoint/ms-word, chế độ sửa). */
      openOffice() {
        if (!ws.url) return;
        location.href = `ms-${OFFICE_APP[o.subj.id]}:ofe|u|${new URL(ws.url, location.href).href}`;
      },
      async pick() {
        ws.server = false;
        ws.handle = await W.pick(key, o.subj.ext);
        ws.fileName = ws.handle.name; ws.perm = 'granted';
        ws.savedAt = (await ws.handle.getFile()).lastModified;
        watchNow();
      },
      async resume() {
        ws.perm = await W.permission(ws.handle, true);
        if (live()) watchNow();
      },
      async file() {
        if (live()) {
          const f = ws.server ? await serverFile(ws.url, ws.fileName) : await W.read(ws.handle);
          ws.savedAt = f.lastModified;
          return f;
        }
        return ws.upload;
      },
    });
    onLeave(() => ws.stop());
    return ws;
  }

  // Task "sticky": đúng một lần là giữ (vd bật Track Changes rồi task sau lại tắt đi).
  function keepSticky(rubric, prev, results) {
    return results.map(r => (rubric[r.no] && rubric[r.no].sticky && r.status === 'fail' && prev[r.no] && prev[r.no].status === 'pass'
      ? Object.assign({}, prev[r.no], { note: prev[r.no].note + ' (đã làm đúng ở lần lưu trước)' }) : r));
  }

  // Trạng thái 1 project: luyện tập lưu riêng từng project; thi thử nằm trong trạng thái bài thi.
  function practiceCtx(subj, set, project, rubric) {
    const k = 'mos_prac_' + project.id;
    const get = () => store.get(k, { byNo: {}, marks: {}, fileName: '', at: 0 });
    return {
      mode: 'practice', subj, set, project, rubric, state: get,
      record(results, fileName) { const s = get(); keepSticky(rubric, s.byNo, results).forEach(r => { s.byNo[r.no] = r; }); s.fileName = fileName; s.at = Date.now(); store.set(k, s); },
      mark(no, kind, val) { const s = get(); s.marks[no] = s.marks[no] || {}; s.marks[no][kind] = val ?? !s.marks[no][kind]; store.set(k, s); },
      reset() { store.del(k); },
    };
  }
  function examCtx(subj, set, project, rubric, key) {
    const get = () => store.get(key, null) || { subs: {}, marks: {} };
    return {
      mode: 'exam', subj, set, project, rubric,
      state() { const ex = get(); const sub = ex.subs[project.id] || {}; return { byNo: sub.byNo || {}, marks: ex.marks[project.id] || {}, fileName: sub.fileName || '', at: sub.at || 0 }; },
      record(results, fileName) {
        const ex = store.get(key, null);
        if (!ex) return;
        const byNo = {};
        keepSticky(rubric, (ex.subs[project.id] || {}).byNo || {}, results).forEach(r => { byNo[r.no] = r; });
        ex.subs[project.id] = { byNo, fileName, at: Date.now() };
        store.set(key, ex);
      },
      mark(no, kind, val) { const ex = store.get(key, null); if (!ex) return; const m = (ex.marks[project.id] = ex.marks[project.id] || {}); m[no] = m[no] || {}; m[no][kind] = val ?? !m[no][kind]; store.set(key, ex); },
    };
  }

  const autoNos = ctx => ctx.project.tasks.filter(t => ctx.rubric[t.no]).map(t => t.no);

  /** Chấm các task trong nos (bỏ trống = cả project) từ tệp đang làm hoặc tệp vừa nộp. */
  async function runCheck(ctx, ws, nos) {
    const file = await ws.file();
    if (!file) throw Object.assign(new Error('Em chưa có tệp đang làm — bấm "Tải đề & bắt đầu" hoặc nộp tệp đã lưu.'), { code: 'nofile' });
    const g = await gradeFile(file, ctx.project, ctx.rubric, nos);
    ctx.record(g.results, file.name);
    return g;
  }

  function summaryOf(ctx) {
    const s = ctx.state();
    const autos = autoNos(ctx);
    const passed = autos.filter(n => s.byNo[n] && s.byNo[n].status === 'pass').length;
    const checked = autos.filter(n => s.byNo[n]).length;
    return { auto: autos.length, passed, checked, score: autos.length ? Math.round(1000 * passed / autos.length) : null };
  }

  function errText(e, ext) {
    if (e.name === 'AbortError') return '';
    if (e.code === 'encrypted' || e.code === 'nofile') return e.message;
    return `Không đọc được tệp (${e.message}). Em kiểm tra đã lưu đúng định dạng ${ext} chưa.`;
  }

  // ---------------------------------------------------------------- khối giao diện dùng chung

  function extrasBlock(project) {
    const extra = project.files.filter(f => f.name !== project.main);
    return extra.length ? `<details class="extras"><summary>Tệp kèm (${extra.length})</summary><div class="files">${extra.map(f =>
      dlLink(f, 'file', `${icon('file')}<span>${esc(f.name)}</span><small>${fmtSize(f.size)}</small>`)).join('')}</div></details>` : '';
  }

  function officeHelp(ctx) {
    return `<details class="help"><summary>Không thấy ${esc(ctx.subj.name)} mở ra?</summary><ul>
      <li>Lần đầu, trình duyệt hỏi <em>"Mở Microsoft ${esc(ctx.subj.name)}?"</em> — em chọn <strong>Mở</strong> (có thể tích "Luôn cho phép").</li>
      <li>${esc(ctx.subj.name)} hiện thanh vàng <em>Protected View</em> thì bấm <strong>Enable Editing</strong>.</li>
      <li>Máy không cài Office bản máy tính thì không mở được — em báo thầy cô.</li></ul></details>`;
  }

  function workPanel(ctx, ws) {
    const main = ctx.project.files.find(f => f.name === ctx.project.main);
    const warn = `<p class="warn" id="fileWarn" hidden>${icon('warn')} Tệp đề ${esc(ctx.subj.ext)} chưa có trên máy chủ này. Tệp PowerPoint và Word khá nặng nên chỉ có khi mở trang từ máy chủ trường (phòng máy) — em hỏi thầy cô địa chỉ.</p>`;
    if (!main) return '<p class="muted">Chưa có tệp đề.</p>';
    const app = esc(ctx.subj.name);
    const upload = `<label class="link-btn">${icon('upload')}Nộp tệp đã lưu<input type="file" class="vh" data-act="upload" accept="${esc(ctx.subj.ext)}"></label>`;
    const saved = `<small id="savedAt">${ws.savedAt ? 'Lưu lần cuối ' + new Date(ws.savedAt).toLocaleTimeString('vi-VN') : 'Đang theo dõi'}</small>`;
    const auto = ctx.mode === 'exam' ? 'bài được ghi nhận tự động.' : 'các task em đã chấm/đánh dấu "Đã làm" được chấm lại tự động.';

    // Máy chủ phòng máy: Office mở và lưu thẳng tệp trên máy chủ, em không phải tìm tệp.
    if (ws.server) {
      if (!ws.url) {
        return `<button type="button" class="btn wide-btn" data-act="start">${icon('file')}Mở bằng ${app}</button>
          <p class="muted small">${app} mở tệp <strong>${esc(main.name)}</strong> ngay. Làm bài rồi bấm <kbd>Ctrl</kbd>+<kbd>S</kbd> — trang tự chấm, không cần tìm tệp hay nộp bài.</p>
          <div class="row-actions">${upload}</div>
          ${officeHelp(ctx)}${extrasBlock(ctx.project)}${warn}`;
      }
      return `<div class="livefile"><span class="dot" aria-hidden="true"></span><div><strong>${esc(ws.fileName)}</strong>${saved}</div></div>
        <button type="button" class="btn-sec wide-btn" data-act="office">${icon('file')}Mở lại bằng ${app}</button>
        <p class="muted small">Bấm <kbd>Ctrl</kbd>+<kbd>S</kbd> trong ${app} — ${auto}</p>
        <div class="row-actions">${ctx.mode === 'practice' ? `<button type="button" class="link-btn" data-act="restart">${icon('download')}Làm lại từ đầu</button>` : ''}${upload}</div>
        ${officeHelp(ctx)}${extrasBlock(ctx.project)}`;
    }
    if (!W.supported) {
      return `<div class="files">${dlLink(main, 'file main', `${icon('download')}<span>${esc(main.name)}</span><small>${fmtSize(main.size)}</small>`)}</div>
        ${extrasBlock(ctx.project)}${warn}
        <p class="muted small">Trình duyệt này chưa hỗ trợ tự đọc tệp đang làm. Em tải đề, mở bằng ${app}, làm xong thì nộp tệp đã lưu (dùng Chrome hoặc Edge để chấm ngay khi bấm Ctrl+S).</p>
        <label class="drop">${icon('upload')}<span>Nộp tệp đã làm</span><small>Kéo thả hoặc bấm để chọn tệp ${esc(ctx.subj.ext)}</small><input type="file" class="vh" data-act="upload" accept="${esc(ctx.subj.ext)}"></label>`;
    }
    const link = !ws.handle && driveLink(main);
    if (link) {
      return `<ol class="steps-mini">
          <li><a class="btn wide-btn" href="${esc(link)}" rel="noopener">${icon('download')}Tải đề về máy</a>
            <span class="muted small">Tải <strong>${esc(main.name)}</strong> (${fmtSize(main.size)}) từ Google Drive — tệp nằm trong thư mục Tải xuống.</span></li>
          <li class="muted small">Mở tệp vừa tải bằng ${app} (nếu có thanh vàng, bấm <strong>Enable Editing</strong>), bấm <kbd>Ctrl</kbd>+<kbd>S</kbd>.</li>
          <li><button type="button" class="btn-sec wide-btn" data-act="pick">${icon('file')}Chọn tệp vừa tải để chấm</button>
            <span class="muted small">Từ đó mỗi lần em bấm <kbd>Ctrl</kbd>+<kbd>S</kbd>, trang tự chấm lại.</span></li></ol>
        <div class="row-actions">${upload}</div>
        ${extrasBlock(ctx.project)}`;
    }
    if (!ws.handle) {
      return `<ol class="steps-mini">
          <li><button type="button" class="btn wide-btn" data-act="start">${icon('download')}Tải đề về máy</button>
            <span class="muted small">Chọn nơi lưu <strong>${esc(main.name)}</strong> (${fmtSize(main.size)}) — nên lưu ở Desktop cho dễ tìm.</span></li>
          <li class="muted small">Mở tệp vừa lưu bằng ${app} (nháy đúp vào tệp).</li>
          <li class="muted small">Làm bài, bấm <kbd>Ctrl</kbd>+<kbd>S</kbd> rồi bấm "Chấm task này".</li></ol>
        <div class="row-actions"><button type="button" class="link-btn" data-act="pick">${icon('file')}Đã có tệp trên máy? Chọn tệp</button>${upload}</div>
        ${extrasBlock(ctx.project)}${warn}`;
    }
    if (!ws.live()) {
      return `<p>Tệp đang làm: <strong>${esc(ws.fileName)}</strong></p>
        <button type="button" class="btn wide-btn" data-act="resume">Cho phép đọc lại tệp này</button>
        <div class="row-actions"><button type="button" class="link-btn" data-act="start">${icon('download')}Tải đề mới</button>${upload}</div>
        ${extrasBlock(ctx.project)}`;
    }
    return `<div class="livefile"><span class="dot" aria-hidden="true"></span><div><strong>${esc(ws.fileName)}</strong>${saved}</div></div>
      <p class="next-step">${icon('file')}<span><strong>Mở tệp ${esc(ws.fileName)}</strong> ở thư mục em vừa chọn bằng ${app} (trang web không tự mở được ${app}). Bấm <kbd>Ctrl</kbd>+<kbd>S</kbd> — ${auto}</span></p>
      <div class="row-actions"><button type="button" class="link-btn" data-act="pick">${icon('file')}Đổi tệp</button>
        ${ctx.mode === 'practice' ? `<button type="button" class="link-btn" data-act="restart">${icon('download')}Làm lại từ đầu</button>` : ''}</div>
      ${extrasBlock(ctx.project)}`;
  }

  function verdictHtml(r) {
    return r.status === 'pass' ? icon('check') + 'Đúng' : r.status === 'fail' ? icon('x') + 'Chưa đúng' : icon('eye') + 'Tự kiểm';
  }

  function taskItem(ctx, t, openGuides) {
    const s = ctx.state();
    const auto = !!ctx.rubric[t.no];
    const exam = ctx.mode === 'exam';
    const r = exam ? null : s.byNo[t.no];
    const mark = s.marks[t.no] || {};
    return `<li class="task${r ? ' is-' + r.status : ''}${mark.done ? ' is-done' : ''}" data-no="${t.no}">
      <div class="task-head">
        <span class="task-no">Task ${t.no}</span>
        ${exam ? '' : `<span class="chip${auto ? ' ok' : ''}">${auto ? 'Tự chấm' : 'Tự kiểm'}</span>`}
        ${r ? `<span class="verdict">${verdictHtml(r)}</span>` : ''}
        <span class="marks">
          ${!exam && auto ? `<button type="button" class="mark check" data-act="check">${icon('check')}Chấm task này</button>` : ''}
          <button type="button" class="mark${mark.done ? ' on' : ''}" data-mark="done" aria-pressed="${!!mark.done}">${icon('check')}Đã làm</button>
          <button type="button" class="mark${mark.review ? ' on' : ''}" data-mark="review" aria-pressed="${!!mark.review}">${icon('flag')}Xem lại</button>
        </span>
      </div>
      <p class="task-text">${esc(t.text)}</p>
      ${r && r.note ? `<p class="task-note">${esc(r.note)}${r.scope ? `<br><span class="muted">${esc(r.scope)}</span>` : ''}</p>` : ''}
      ${!exam && t.guide ? `<details class="guide"${openGuides.has(t.no) ? ' open' : ''}><summary>Hướng dẫn từng bước</summary><div class="steps">${lines(t.guide)}</div>${t.tips ? `<div class="tips"><strong>Lưu ý:</strong>${lines(t.tips)}</div>` : ''}</details>` : ''}
    </li>`;
  }

  function scoreBox(sum) {
    if (sum.score == null) return `<p class="muted">Project này chưa có task tự chấm — em tự đối chiếu với hướng dẫn.</p>`;
    if (!sum.checked) return '<p class="muted">Chưa chấm task nào. Làm xong task nào em bấm "Chấm task này" ở task đó.</p>';
    const partial = sum.checked < sum.auto;
    return `<div class="score ${partial ? 'partial' : sum.score >= CFG.passScore ? 'pass' : 'fail'}"><span class="num">${sum.score}</span><span class="of">/ 1000${partial ? ' · tạm tính' : ''}</span></div>
      <p class="muted">${sum.passed}/${sum.auto} task tự chấm đúng${partial ? ` · mới chấm ${sum.checked}/${sum.auto} — bấm "Chấm cả project" để có điểm đầy đủ` : ''}</p>`;
  }

  /**
   * Nối các nút trong vùng làm bài với phiên làm việc. ui.redraw() vẽ lại; ui.status(msg, kind) báo trạng thái;
   * ui.focusTask(no) đưa task vừa chấm vào tầm nhìn.
   */
  function wireWork(rootEl, ctx, ws, ui) {
    const handler = async e => {
      const el = e.target.closest('[data-act],[data-mark]');
      if (!el || !rootEl.contains(el) || el.dataset.act === 'upload') return;
      const no = el.closest('.task, [data-no]') ? +el.closest('.task, [data-no]').dataset.no : null;
      try {
        if (el.dataset.mark) {
          ctx.mark(no, el.dataset.mark);
          if (ctx.mode === 'practice' && el.dataset.mark === 'done' && ctx.state().marks[no]?.done && ctx.rubric[no] && (ws.live() || ws.upload)) {
            await checkTasks([no]);
          }
          return ui.redraw();
        }
        const act = el.dataset.act;
        if (act === 'start' || act === 'restart') {
          const restart = act === 'restart';
          if (restart && !confirm(ws.server
            ? `Làm lại từ đầu? Bản làm bài trên máy chủ trở về như đề gốc. Em đóng tệp đang mở trong ${ctx.subj.name} trước (không lưu).`
            : 'Tải lại tệp đề gốc? Bài đang làm trong tệp hiện tại vẫn giữ nguyên, em chọn chỗ lưu tệp mới.')) return;
          await ws.start(restart);
          if (restart && ctx.reset) ctx.reset();
          ui.status(ws.server ? `Đang mở ${ws.fileName} bằng ${ctx.subj.name}...` : `Đã lưu ${ws.fileName}. Bước 2: mở tệp này bằng ${ctx.subj.name}.`, 'ok');
        } else if (act === 'office') {
          ws.openOffice();
          ui.status(`Đang mở ${ws.fileName} bằng ${ctx.subj.name}...`, 'ok');
        } else if (act === 'pick') {
          await ws.pick();
          ui.status(`Đang theo dõi ${ws.fileName}.`, 'ok');
        } else if (act === 'resume') {
          await ws.resume();
          if (!ws.live()) ui.status('Em chưa cho phép đọc tệp — bấm lại và chọn "Cho phép".', 'error');
        } else if (act === 'check') {
          await checkTasks([no]);
          ui.focusTask && ui.focusTask(no);
        } else if (act === 'checkAll') {
          await checkTasks(null, true);
        } else if (act === 'dock') {
          return openDock(ui.dockHash);
        }
        ui.redraw();
      } catch (err) {
        console.error(err);
        const msg = errText(err, ctx.subj.ext);
        if (msg) ui.status(msg, 'error');
      }
    };
    const onUpload = async e => {
      const input = e.target.closest('[data-act="upload"]');
      if (!input || !input.files[0]) return;
      const file = input.files[0];
      input.value = '';
      if (!file.name.toLowerCase().endsWith(ctx.subj.ext)) return ui.status(`Cần tệp ${ctx.subj.ext} — em đang chọn "${file.name}".`, 'error');
      ws.upload = file;
      try {
        await checkTasks(null, true);
        ui.redraw();
      } catch (err) { ui.status(errText(err, ctx.subj.ext), 'error'); }
    };

    async function checkTasks(nos, full) {
      ui.status(nos ? `Đang chấm task ${nos.join(', ')}...` : 'Đang chấm...', 'busy');
      const g = await runCheck(ctx, ws, nos || undefined);
      if (ctx.mode === 'exam') {
        ui.status(`Đã ghi nhận "${ws.upload && !ws.live() ? ws.upload.name : ws.fileName}" lúc ${new Date().toLocaleTimeString('vi-VN')}.`, 'ok');
      } else if (nos && nos.length === 1) {
        const r = g.results[0];
        ui.status(r ? `Task ${r.no}: ${r.status === 'pass' ? 'đúng' : r.status === 'fail' ? 'chưa đúng' : 'tự kiểm'}.` : '', r && r.status === 'pass' ? 'ok' : 'error');
      } else {
        ui.status(`Đã chấm ${g.auto} task tự chấm: đúng ${g.passed}.`, 'ok');
      }
      if (full && ctx.mode === 'practice') {
        const a = attemptFrom('practice', ctx.subj, ctx.set, [{ project: ctx.project, graded: g, submitted: true }]);
        a.projectId = ctx.project.id;
        a.title = `${ctx.set.title} · ${ctx.project.title}`;
        saveAttempt(a);
        sendAttempt(a);
      }
    }

    rootEl.addEventListener('click', handler);
    rootEl.addEventListener('change', onUpload);
    onLeave(() => { rootEl.removeEventListener('click', handler); rootEl.removeEventListener('change', onUpload); });

    // Mỗi lần em Ctrl+S: thi thử chấm cả project (âm thầm); luyện tập chấm lại các task đã kiểm/đã làm.
    return async function onSave() {
      try {
        if (ctx.mode === 'exam') await checkTasks(null);
        else {
          const s = ctx.state();
          const nos = autoNos(ctx).filter(n => s.byNo[n] || (s.marks[n] && s.marks[n].done));
          if (nos.length) await checkTasks(nos);
          else ui.status(`Thấy em vừa lưu lúc ${new Date().toLocaleTimeString('vi-VN')}. Bấm "Chấm task này" ở task em vừa làm.`, 'ok');
        }
        ui.redraw();
      } catch (err) { ui.status(errText(err, ctx.subj.ext), 'error'); }
    };
  }

  function attemptFrom(mode, subj, set, parts, extra) {
    const projects = parts.map(({ project, graded, submitted }) => ({
      id: project.id, no: project.no, title: project.title, submitted: !!submitted,
      results: project.tasks.map(t => {
        const r = graded && graded.results.find(x => x.no === t.no);
        return Object.assign({ no: t.no, text: t.text }, r || { status: 'fail', note: 'Chưa nộp tệp' });
      }),
    }));
    const all = projects.flatMap(p => p.results);
    const sum = window.MosGrader.summarize(all);
    return Object.assign({ id: newId(), mode, subject: subj.id, subjectName: subj.name, setId: set.id, title: set.title,
      student: student(), at: Date.now(), projects, score: sum.score, auto: sum.auto, passed: sum.passed, self: sum.self }, extra || {});
  }

  // ---------------------------------------------------------------- thanh làm bài thu gọn (cửa sổ nhỏ dưới đáy màn hình)

  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('mos-dock') : null;
  let dockWin = null;

  function openDock(hash) {
    const H = Math.max(260, Math.min(340, Math.round(screen.availHeight * 0.34)));
    const left = screen.availLeft || 0, top = (screen.availTop || 0) + screen.availHeight - H;
    dockWin = window.open(location.pathname + '#/dock/' + hash, 'mosdock',
      `popup=yes,width=${screen.availWidth},height=${H},left=${left},top=${top}`);
    if (!dockWin) { location.hash = '#/dock/' + hash; return; }
    location.hash = '#/docked/' + hash;
  }
  if (bc) {
    bc.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'undock' && (location.hash.startsWith('#/docked/') || location.hash.startsWith('#/r/'))) location.hash = '#/' + m.hash;
      if (m.type === 'finished' && location.hash.startsWith('#/docked/')) location.hash = '#/r/' + m.id;
      if (m.type === 'close-dock' && location.hash.startsWith('#/dock/')) window.close();
    };
  }

  function viewDocked(rest) {
    page(`<section class="panel docked">
      <h1>Thanh làm bài đang mở</h1>
      <p>Thanh làm bài nằm ở cửa sổ nhỏ dưới đáy màn hình. Em mở tệp đề bằng Office ở phần trên màn hình và làm bài như trong phòng thi.</p>
      <p class="muted small">Không thấy cửa sổ nhỏ? Có thể trình duyệt đã chặn cửa sổ bật lên — bấm nút bên dưới để làm ngay trên trang này.</p>
      <div class="row-actions"><button type="button" class="btn" id="undock">Làm trên trang này</button>
        <button type="button" class="btn-sec" id="redock">Mở lại thanh làm bài</button></div>
    </section>`);
    $('#undock').addEventListener('click', () => { if (bc) bc.postMessage({ type: 'close-dock' }); if (dockWin) dockWin.close(); location.hash = '#/' + rest; });
    $('#redock').addEventListener('click', () => openDock(rest));
  }

  // ---------------------------------------------------------------- luyện tập 1 project

  async function loadProject(pid) {
    const set = await getSet(setIdOf(pid));
    const project = set.projects.find(p => p.id === pid);
    if (!project) throw new Error('Không có project này.');
    const idx = await getIndex();
    const subj = idx.subjects.find(s => s.id === set.subject);
    const rubric = (await getRubrics(set.subject))[pid] || {};
    return { set, project, subj, rubric };
  }

  async function viewProject(pid, dock) {
    const { set, project, subj, rubric } = await loadProject(pid);
    const ctx = practiceCtx(subj, set, project, rubric);
    const pos = set.projects.indexOf(project);
    const prev = set.projects[pos - 1], next = set.projects[pos + 1];
    let onSave = async () => {};
    const ws = workSession({ mode: 'practice', subj, project, slot: 'practice-' + pid, onSave: f => onSave(f) });
    await ws.init();
    if (dock) return dockView({ ctx, ws, title: `${subj.name} · ${set.title}`, undock: 'p/' + pid,
      pos, total: set.projects.length, stateOf: q => practiceCtx(subj, set, q, {}).state(),
      goProject: i => { location.hash = '#/dock/p/' + set.projects[i].id; },
      bindSave: f => { onSave = f; } });

    const openGuides = new Set();
    page(`${crumbs([['Trang chủ', '#/'], [subj.name, '#/s/' + subj.id], [set.title, '#/set/' + set.id], [project.title, '']])}
      <div class="head-row"><h1>${esc(subj.name)} · ${esc(set.title)} · ${esc(project.title)}</h1>
        <button type="button" class="btn-sec" data-act="dock" id="dockBtn">${icon('dock')}Thanh làm bài thu gọn</button></div>
      <div class="split" id="work">
        <ol class="tasks" id="tasks"></ol>
        <aside class="side">
          <section class="panel"><h2>Tệp đang làm</h2><div id="wp"></div><p class="status" id="status" role="status"></p></section>
          <section class="panel"><h2>Điểm</h2><div id="score"></div>
            ${autoNos(ctx).length ? '<button type="button" class="btn-sec wide-btn" data-act="checkAll">Chấm cả project</button>' : ''}</section>
          <div class="pager">
            ${prev ? `<a class="btn-sec" href="#/p/${prev.id}">${icon('left')}${esc(prev.title.split(' · ')[0])}</a>` : '<span></span>'}
            ${next ? `<a class="btn-sec" href="#/p/${next.id}">${esc(next.title.split(' · ')[0])}${icon('right')}</a>` : `<a class="btn" href="#/exam/${set.id}">Thi thử cả bộ</a>`}
          </div>
        </aside>
      </div>`, { wide: true });
    const root = app.querySelector('main');
    root.addEventListener('toggle', e => {
      const li = e.target.closest && e.target.closest('.task');
      if (li && e.target.matches('details.guide')) { if (e.target.open) openGuides.add(+li.dataset.no); else openGuides.delete(+li.dataset.no); }
    }, true);
    const ui = {
      dockHash: 'p/' + pid,
      redraw() {
        $('#tasks').innerHTML = project.tasks.map(t => taskItem(ctx, t, openGuides)).join('');
        $('#wp').innerHTML = workPanel(ctx, ws);
        $('#score').innerHTML = scoreBox(summaryOf(ctx));
        const main = project.files.find(f => f.name === project.main);
        if (main) checkAvailable(main).then(okay => { const w = $('#fileWarn'); if (w && !okay) w.hidden = false; });
      },
      status: setStatus,
      focusTask(no) { const li = app.querySelector(`.task[data-no="${no}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    };
    onSave = wireWork(root, ctx, ws, ui);
    ui.redraw();
    const s = ctx.state();
    if (s.at) setStatus(`Lần chấm gần nhất: ${s.fileName} lúc ${fmtTime(s.at)}.`);
  }

  function setStatus(msg, kind) {
    const el = $('#status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('ok', 'error', 'busy');
    if (kind) el.classList.add(kind);
  }

  // ---------------------------------------------------------------- thanh làm bài kiểu GMetrix: dùng chung luyện tập + thi thử
  // Thanh trên: Project x/y, đồng hồ, Danh sách / Làm lại / Chấm / Kết thúc. Hàng tab: Tổng quan + Task 1..n.
  // Hàng dưới: Task trước · Đã làm xong · Đánh dấu xem lại · Task sau (+ Chấm task, Hướng dẫn khi luyện tập).

  let jumpTo = null; // bấm 1 task của project khác trong Danh sách → mở project đó đúng task này

  function dockView(o) {
    const { ctx, ws } = o;
    const exam = ctx.mode === 'exam';
    document.body.classList.add('is-dock');
    onLeave(() => document.body.classList.remove('is-dock'));
    const p = ctx.project;
    const tasks = p.tasks;
    const firstOpen = () => Math.max(0, tasks.findIndex(t => !(ctx.state().marks[t.no] || {}).done));
    let cur = ws.live() || ws.upload ? firstOpen() : -1; // -1 = tab Tổng quan (tệp đề)
    if (jumpTo && jumpTo.pid === p.id) { cur = Math.max(0, tasks.findIndex(t => t.no === jumpTo.no)); jumpTo = null; }
    let showGuide = false;
    const big = store.get('mos_gm_big', false);
    const name = esc(ctx.subj.name);
    const hasAuto = autoNos(ctx).length > 0;
    app.innerHTML = `<div class="dock gm${big ? ' big' : ''}" id="dock">
      <header class="gm-bar">
        <button type="button" class="gm-icon" data-i="-1" title="Tổng quan: tệp đề, cách mở ${name}">${icon('help')}</button>
        <button type="button" class="gm-icon gm-aa" data-gm="font" title="Đổi cỡ chữ" aria-pressed="${big}">AA</button>
        <span class="gm-proj">
          <button type="button" class="gm-icon" data-proj="-1" ${o.pos === 0 ? 'disabled' : ''} title="Project trước">${icon('left')}</button>
          <span>Project ${o.pos + 1} / ${o.total}</span>
          <button type="button" class="gm-icon" data-proj="1" ${o.pos === o.total - 1 ? 'disabled' : ''} title="Project sau">${icon('right')}</button>
        </span>
        <span class="gm-mid">${o.timer ? '<span class="timer" id="timer"><b></b></span>' : `<span class="gm-set">${esc(o.title)}</span>`}</span>
        <nav class="gm-menu">
          <button type="button" data-gm="summary">Danh sách</button>
          <button type="button" data-act="restart" id="gmRestart">Làm lại project</button>
          ${!exam && hasAuto ? '<button type="button" data-act="checkAll">Chấm project</button>' : ''}
          ${o.endBtn || ''}
          <button type="button" class="gm-icon" id="undockBtn" title="Mở rộng ra trang đầy đủ">${icon('expand')}</button>
        </nav>
      </header>
      <nav class="gm-tabs" id="gmTabs" aria-label="Task"></nav>
      <section class="gm-body" id="dockBody"></section>
      <footer class="gm-foot">
        <p class="status" id="status" role="status"></p>
        <div class="gm-actions" id="gmActions"></div>
        <div class="gm-side" id="gmSide"></div>
      </footer>
      <div class="modal" id="sumModal" hidden><div class="modal-box gm-sum" role="dialog" aria-modal="true" aria-labelledby="sumTitle">
        <h2 id="sumTitle">${exam ? 'Thi thử' : 'Luyện tập'} ${name} · ${esc(ctx.set.title)}</h2>
        <div class="gm-sum-list" id="sumList"></div>
        <div class="modal-actions"><button type="button" class="btn-sec" data-gm="close">Đóng</button>
          ${exam ? '<button type="button" class="btn" data-gm="finish">Kết thúc bài thi</button>' : ''}</div>
      </div></div>
      ${o.modal || ''}
    </div>`;
    const root = $('#dock');

    const summaryHtml = () => ctx.set.projects.map((q, i) => {
      const st = q.id === p.id ? ctx.state() : o.stateOf(q);
      const doneN = q.tasks.filter(t => (st.marks[t.no] || {}).done).length;
      return `<details class="gm-sum-proj"${i === o.pos ? ' open' : ''}>
        <summary><span>${esc(q.title)}</span><small>${doneN}/${q.tasks.length} hoàn thành</small></summary>
        <table class="grid small"><thead><tr><th>Task</th><th>Đã xem</th><th>Xem lại</th><th>Hoàn thành</th>${exam ? '' : '<th>Kết quả</th>'}</tr></thead>
        <tbody>${q.tasks.map(t => {
          const m = st.marks[t.no] || {};
          const r = exam ? null : st.byNo[t.no];
          return `<tr data-jump="${i}:${t.no}" tabindex="0"><td>Task ${t.no}</td><td>${m.viewed ? icon('check') : ''}</td>
            <td>${m.review ? icon('flag', 'flag') : ''}</td><td>${m.done ? icon('check') : ''}</td>
            ${exam ? '' : `<td>${r ? `<span class="verdict v-${r.status}">${verdictHtml(r)}</span>` : ''}</td>`}</tr>`;
        }).join('')}</tbody></table></details>`;
    }).join('');

    const draw = () => {
      const t = tasks[cur];
      if (t && !(ctx.state().marks[t.no] || {}).viewed) ctx.mark(t.no, 'viewed', true);
      const s = ctx.state();
      const m = t ? s.marks[t.no] || {} : {};
      const r = t && !exam ? s.byNo[t.no] : null;
      const auto = t && !!ctx.rubric[t.no];
      const sum = summaryOf(ctx);
      $('#gmRestart').hidden = !ws.live();

      $('#gmTabs').innerHTML = `<button type="button" class="gm-tab${cur === -1 ? ' on' : ''}" data-i="-1">Tổng quan</button>` + tasks.map((x, i) => {
        const rr = exam ? null : s.byNo[x.no];
        const mm = s.marks[x.no] || {};
        return `<button type="button" class="gm-tab${i === cur ? ' on' : ''}${rr ? ' is-' + rr.status : ''}${mm.done ? ' done' : ''}" data-i="${i}">Task ${x.no}${mm.done ? icon('check') : ''}${mm.review ? icon('flag', 'flag') : ''}</button>`;
      }).join('');

      if (!t) {
        $('#dockBody').innerHTML = `<div class="gm-over"><div class="gm-over-file">${workPanel(ctx, ws)}</div>
          <div class="gm-over-info"><p><strong>${esc(p.title)}</strong></p>
            <p class="muted small">${tasks.length} task${hasAuto && !exam ? ` · ${autoNos(ctx).length} tự chấm` : ''}. Làm lần lượt từng task trên ${name}, bấm <kbd>Ctrl</kbd>+<kbd>S</kbd> sau mỗi task.</p></div></div>`;
        const main = p.files.find(f => f.name === p.main);
        if (main) checkAvailable(main).then(okay => { const w = $('#fileWarn'); if (w && !okay) w.hidden = false; });
      } else {
        $('#dockBody').innerHTML = `<div class="gm-task task${r ? ' is-' + r.status : ''}">
          ${ws.live() || ws.upload ? '' : `<p class="gm-nofile">${icon('warn')}<span>Em chưa mở tệp đề.</span><button type="button" class="link-btn" data-i="-1">Mở ở tab Tổng quan</button></p>`}
          <p class="gm-text">${esc(t.text)}</p>
          ${r ? `<p class="task-note"><span class="verdict">${verdictHtml(r)}</span> ${esc(r.note || '')}</p>` : ''}
          ${showGuide && t.guide ? `<div class="dock-guide"><div class="steps">${lines(t.guide)}</div>${t.tips ? `<div class="tips"><strong>Lưu ý:</strong>${lines(t.tips)}</div>` : ''}</div>` : ''}
        </div>`;
      }

      const acts = $('#gmActions');
      if (t) acts.dataset.no = t.no; else delete acts.dataset.no;
      acts.innerHTML = `
        <button type="button" class="gm-btn g-prev" data-nav="-1" ${cur === -1 ? 'disabled' : ''}>Task trước</button>
        ${t ? `<button type="button" class="gm-btn g-done${m.done ? ' on' : ''}" data-mark="done" aria-pressed="${!!m.done}">${m.done ? icon('check') : ''}Đã làm xong</button>
        <button type="button" class="gm-btn g-review${m.review ? ' on' : ''}" data-mark="review" aria-pressed="${!!m.review}">${m.review ? icon('flag') : ''}Đánh dấu xem lại</button>` : ''}
        <button type="button" class="gm-btn g-next" data-nav="1" ${cur === tasks.length - 1 ? 'disabled' : ''}>${cur === -1 ? 'Bắt đầu Task 1' : 'Task sau'}</button>
        ${t && !exam && auto ? '<button type="button" class="gm-btn g-check" data-act="check">Chấm task</button>' : ''}
        ${t && !exam && t.guide ? `<button type="button" class="gm-btn g-help${showGuide ? ' on' : ''}" data-guide="1">Hướng dẫn</button>` : ''}`;

      $('#gmSide').innerHTML = `${ws.live() ? `<span class="gm-file" title="Tệp đang theo dõi"><span class="dot" aria-hidden="true"></span>${esc(ws.fileName)}</span>
          ${ws.server ? `<button type="button" class="link-btn" data-act="office">Mở ${name}</button>` : ''}` : ''}
        ${!exam && sum.score != null && sum.checked ? `<span class="dock-score ${sum.checked < sum.auto ? 'partial' : sum.score >= CFG.passScore ? 'pass' : 'fail'}" title="${sum.checked < sum.auto ? `Tạm tính: mới chấm ${sum.checked}/${sum.auto} task` : 'Điểm project'}">${sum.score}<small>/1000${sum.checked < sum.auto ? ' tạm' : ''}</small></span>` : ''}`;

      if (!$('#sumModal').hidden) $('#sumList').innerHTML = summaryHtml();
      if (o.afterDraw) o.afterDraw();
    };

    const jump = v => {
      const [i, no] = v.split(':').map(Number);
      $('#sumModal').hidden = true;
      if (i === o.pos) { cur = Math.max(0, tasks.findIndex(t => t.no === no)); showGuide = false; draw(); }
      else { jumpTo = { pid: ctx.set.projects[i].id, no }; o.goProject(i); }
    };
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-i],[data-nav],[data-guide],[data-gm],[data-proj],[data-jump]');
      if (!el || el.disabled) return;
      const d = el.dataset;
      if (d.i != null) { cur = +d.i; showGuide = false; draw(); }
      else if (d.nav) { cur = Math.min(tasks.length - 1, Math.max(-1, cur + +d.nav)); showGuide = false; draw(); }
      else if (d.guide) { showGuide = !showGuide; draw(); }
      else if (d.proj) o.goProject(o.pos + +d.proj);
      else if (d.jump) jump(d.jump);
      else if (d.gm === 'font') {
        const on = root.classList.toggle('big');
        el.setAttribute('aria-pressed', on);
        store.set('mos_gm_big', on);
      } else if (d.gm === 'summary') { $('#sumList').innerHTML = summaryHtml(); $('#sumModal').hidden = false; }
      else if (d.gm === 'close') $('#sumModal').hidden = true;
      else if (d.gm === 'finish') { $('#sumModal').hidden = true; $('#endBtn').click(); }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') root.querySelectorAll('.modal').forEach(x => { x.hidden = true; });
      const row = e.target.closest && e.target.closest('[data-jump]');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); jump(row.dataset.jump); }
    });
    $('#undockBtn').addEventListener('click', () => {
      if (window.opener && !window.opener.closed && bc) { bc.postMessage({ type: 'undock', hash: o.undock }); window.close(); }
      else location.hash = '#/' + o.undock;
    });
    const ui = { redraw: draw, status: setStatus };
    o.bindSave(wireWork(root, ctx, ws, ui));
    draw();
    if (o.after) o.after({ draw });
  }

  // ---------------------------------------------------------------- thi thử

  let timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  // Bài thi cũ (trước khi có chấm từng câu) lưu subs[pid].graded — đổi sang byNo.
  function migrateExam(ex) {
    for (const [pid, s] of Object.entries(ex.subs || {})) if (s.graded && !s.byNo) {
      s.byNo = {};
      s.graded.results.forEach(r => { s.byNo[r.no] = r; });
      delete s.graded;
    }
    return ex;
  }

  async function finishExam(set, subj, rubrics, key, auto) {
    stopTimer();
    const ex = migrateExam(store.get(key, null));
    if (!ex) return;
    // Đọc lại bản lưu mới nhất của mọi project đang theo dõi (không cần em nộp lại).
    await Srv.ready;
    for (const p of set.projects) {
      const url = Srv.ok ? store.get(`mos_work_exam-${ex.startedAt}-${p.id}`, '') : '';
      const h = !url && W.supported ? await W.getHandle('exam:' + p.id) : null;
      if (!url && (!h || await W.permission(h, false).catch(() => 'denied') !== 'granted')) continue;
      try {
        const f = url ? await serverFile(url, p.main) : await W.read(h);
        const g = await gradeFile(f, p, rubrics[p.id]);
        examCtx(subj, set, p, rubrics[p.id] || {}, key).record(g.results, f.name);
      } catch (e) { /* giữ lần ghi nhận trước */ }
    }
    const done = migrateExam(store.get(key, ex));
    const parts = set.projects.map(p => {
      const s = done.subs[p.id];
      const graded = s ? { results: p.tasks.map(t => s.byNo[t.no] || { no: t.no, status: rubrics[p.id] && rubrics[p.id][t.no] ? 'fail' : 'self', note: '' }) } : stubResults(p, rubrics[p.id]);
      return { project: p, graded, submitted: !!s };
    });
    const a = attemptFrom('exam', subj, set, parts, { startedAt: done.startedAt, minutes: Math.round((Math.min(Date.now(), done.endsAt) - done.startedAt) / 60000), timeUp: !!auto });
    saveAttempt(a);
    sendAttempt(a);
    store.del(key);
    for (const p of set.projects) { store.del(`mos_work_exam-${done.startedAt}-${p.id}`); if (W.supported) W.delHandle('exam:' + p.id); }
    if (bc) bc.postMessage({ type: 'finished', id: a.id });
    location.hash = '#/r/' + a.id;
  }

  async function viewExam(setId, dock) {
    const set = await getSet(setId);
    const idx = await getIndex();
    const subj = idx.subjects.find(s => s.id === set.subject);
    const rubrics = await getRubrics(set.subject);
    const key = 'mos_exam_' + setId;
    let ex = store.get(key, null);

    if (!ex) {
      if (dock) { location.hash = '#/exam/' + setId; return; }
      return startScreen(set, subj, rubrics, 'exam');
    }
    ex = migrateExam(ex);
    store.set(key, ex);
    if (Date.now() >= ex.endsAt) return finishExam(set, subj, rubrics, key, true);

    leave();
    const p = set.projects[ex.cur] || set.projects[0];
    const ctx = examCtx(subj, set, p, rubrics[p.id] || {}, key);
    // Theo dõi mọi project đã có tệp, để em lưu ở project nào cũng được ghi nhận.
    const sessions = {};
    let onSaveCur = async () => {};
    for (const q of set.projects) {
      const qctx = q === p ? ctx : examCtx(subj, set, q, rubrics[q.id] || {}, key);
      sessions[q.id] = workSession({ mode: 'exam', subj, project: q, slot: `exam-${ex.startedAt}-${q.id}`,
        onSave: async f => {
          if (q === p) return onSaveCur(f);
          try { const g = await gradeFile(f, q, rubrics[q.id]); qctx.record(g.results, f.name); drawTabs(); } catch (e) { /* lần lưu sau đọc lại */ }
        } });
      await sessions[q.id].init();
    }
    const ws = sessions[p.id];
    const go = i => { const e2 = store.get(key, null); if (!e2) return; e2.cur = i; store.set(key, e2); viewExam(setId, dock); };
    const tabsHtml = () => {
      const e2 = store.get(key, null) || ex;
      return set.projects.map((x, i) => {
        const m = e2.marks[x.id] || {};
        const flagged = Object.values(m).some(v => v.review);
        return `<button type="button" class="ptab${i === e2.cur ? ' on' : ''}${e2.subs[x.id] ? ' sent' : ''}" data-p="${i}">
          ${esc(x.title.split(' · ')[0].replace('Project ', dock ? 'P' : 'Project '))}${e2.subs[x.id] ? icon('check') : ''}${flagged ? icon('flag', 'flag') : ''}</button>`;
      }).join('');
    };
    const drawTabs = () => { const n = app.querySelector('.ptabs'); if (n) n.innerHTML = tabsHtml(); };
    const modal = `<div class="modal" id="endModal" hidden><div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="endTitle">
      <h2 id="endTitle">Kết thúc bài thi?</h2>
      <p id="endInfo"></p>
      <div class="modal-actions"><button type="button" class="btn-sec" id="endNo">Làm tiếp</button><button type="button" class="btn" id="endYes">Kết thúc</button></div>
    </div></div>`;
    const wireEnd = () => {
      const pt = app.querySelector('.ptabs');
      if (pt) pt.addEventListener('click', e => { const b2 = e.target.closest('[data-p]'); if (b2) go(+b2.dataset.p); });
      $('#endBtn').addEventListener('click', () => {
        const e2 = store.get(key, ex);
        $('#endInfo').textContent = `Đã ghi nhận ${Object.keys(e2.subs).length}/${set.projects.length} project. Hệ thống đọc bản lưu cuối của các tệp đang theo dõi rồi chấm. Sau khi kết thúc em không sửa được nữa.`;
        $('#endModal').hidden = false; $('#endNo').focus();
      });
      $('#endNo').addEventListener('click', () => { $('#endModal').hidden = true; });
      $('#endYes').addEventListener('click', () => { $('#endYes').disabled = true; finishExam(set, subj, rubrics, key, false); });
      const tick = () => {
        const e2 = store.get(key, null);
        if (!e2) { stopTimer(); return; }
        const left = e2.endsAt - Date.now();
        const el = document.querySelector('#timer b');
        if (el) { el.textContent = clock(left); el.parentNode.classList.toggle('low', left < 5 * 60000); }
        if (left <= 0) finishExam(set, subj, rubrics, key, true);
      };
      tick();
      timer = setInterval(tick, 1000);
    };

    if (dock) {
      return dockView({ ctx, ws, title: `${subj.name} · ${set.title}`, undock: 'exam/' + setId, timer: true,
        pos: ex.cur, total: set.projects.length, stateOf: q => examCtx(subj, set, q, {}, key).state(), goProject: go,
        endBtn: '<button type="button" class="gm-end" id="endBtn">Kết thúc</button>', modal,
        bindSave: f => { onSaveCur = f; }, after: wireEnd, afterDraw: () => drawTabs() });
    }

    const openGuides = new Set();
    app.innerHTML = `<div class="exam">
      <header class="exam-bar">
        <span class="exam-title">${esc(subj.name)} · ${esc(set.title)}</span>
        <span class="exam-who">${esc((student() || {}).name || '')}</span>
        <button type="button" class="icon-btn" data-act="dock" title="Thanh làm bài thu gọn">${icon('dock')}</button>
        <span class="timer" id="timer">${icon('clock')}<b></b></span>
        <button type="button" class="btn-end" id="endBtn">Kết thúc bài thi</button>
      </header>
      <nav class="ptabs">${tabsHtml()}</nav>
      <main class="wrap wide"><div class="split" id="work">
        <section><h1 class="exam-h">${esc(p.title)}</h1><ol class="tasks" id="tasks"></ol></section>
        <aside class="side">
          <section class="panel"><h2>Tệp ${esc(p.title.split(' · ')[0])}</h2><div id="wp"></div><p class="status" id="status" role="status"></p></section>
          <div class="pager">
            ${ex.cur > 0 ? `<button type="button" class="btn-sec" data-go="${ex.cur - 1}">${icon('left')}Project trước</button>` : '<span></span>'}
            ${ex.cur < set.projects.length - 1 ? `<button type="button" class="btn-sec" data-go="${ex.cur + 1}">Project sau${icon('right')}</button>` : ''}
          </div>
        </aside>
      </div></main>
      ${modal}
    </div>`;
    window.scrollTo(0, 0);
    app.querySelectorAll('[data-go]').forEach(b2 => b2.addEventListener('click', () => go(+b2.dataset.go)));
    const ui = {
      dockHash: 'exam/' + setId,
      redraw() {
        $('#tasks').innerHTML = p.tasks.map(t => taskItem(ctx, t, openGuides)).join('');
        $('#wp').innerHTML = workPanel(ctx, ws) + (ctx.state().at ? `<p class="ok-line">${icon('check')} Đã ghi nhận "${esc(ctx.state().fileName)}" lúc ${fmtTime(ctx.state().at)}.</p>` : '');
        drawTabs();
        const main = p.files.find(f => f.name === p.main);
        if (main) checkAvailable(main).then(okay => { const w = $('#fileWarn'); if (w && !okay) w.hidden = false; });
      },
      status: setStatus,
    };
    onSaveCur = wireWork(app.querySelector('.exam'), ctx, ws, ui);
    ui.redraw();
    wireEnd();
  }

  // Project chưa nộp: task có tiêu chí tính "chưa đúng", còn lại "tự kiểm".
  function stubResults(project, rubric) {
    return window.MosGrader.summarize(project.tasks.map(t => ({ no: t.no, status: rubric && rubric[t.no] ? 'fail' : 'self', note: 'Chưa nộp tệp' })));
  }

  // ---------------------------------------------------------------- kết quả / lịch sử

  function viewResult(id) {
    const a = history().find(x => x.id === id);
    if (!a) throw new Error('Không tìm thấy lượt làm bài này trên máy.');
    const pass = a.score != null && a.score >= CFG.passScore;
    const blocks = a.projects.map(p => {
      const g = window.MosGrader.summarize(p.results);
      return `<section class="panel res-proj">
        <h2>${esc(p.title)} ${p.submitted ? '' : '<span class="chip warn-chip">Chưa nộp</span>'}
          <span class="res-sub">${g.auto ? `${g.passed}/${g.auto} đúng` : 'Tự kiểm'}</span></h2>
        ${p.submitted ? '' : `<p class="muted">Em chưa nộp tệp cho project này — các task tự chấm tính 0 điểm.</p>`}
        <ol class="tasks compact"${p.submitted ? '' : ' hidden'}>${p.results.map(r => `<li class="task is-${r.status}">
          <div class="task-head"><span class="task-no">Task ${r.no}</span>
          <span class="verdict">${r.status === 'pass' ? icon('check') + 'Đúng' : r.status === 'fail' ? icon('x') + 'Chưa đúng' : icon('eye') + 'Tự kiểm'}</span></div>
          <p class="task-text">${esc(r.text)}</p>${r.note ? `<p class="task-note">${esc(r.note)}</p>` : ''}</li>`).join('')}</ol>
      </section>`;
    }).join('');
    page(`${crumbs([['Trang chủ', '#/'], ['Lịch sử', '#/history'], [a.title, '']])}
      <section class="panel result-head">
        <div>
          <p class="muted">${a.mode === 'exam' ? 'Thi thử' : 'Luyện tập'} · ${esc(a.subjectName)} · ${fmtTime(a.at)}${a.minutes != null ? ` · ${a.minutes} phút${a.timeUp ? ' (hết giờ)' : ''}` : ''}</p>
          <h1>${esc(a.title)}</h1>
          ${a.student ? `<p>${esc(a.student.name)}${a.student.cls ? ' · Lớp ' + esc(a.student.cls) : ''}</p>` : ''}
        </div>
        ${a.score != null ? `<div class="score big ${pass ? 'pass' : 'fail'}"><span class="num">${a.score}</span><span class="of">/ 1000</span>
          <span class="verdict-big">${pass ? 'Đạt' : 'Chưa đạt'}</span></div>` : ''}
      </section>
      <p class="muted">${a.passed}/${a.auto} task tự chấm đúng${a.self ? ` · ${a.self} task tự kiểm (không tính điểm)` : ''}.</p>
      ${blocks}
      <div class="pager"><a class="btn-sec" href="#/set/${a.setId}">Về bộ đề</a>
        <a class="btn" href="${a.mode === 'exam' ? '#/exam/' + a.setId : '#/p/' + a.projectId}">Làm lại</a></div>`);
  }

  function historyTable(list) {
    return `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Thời gian</th><th>Hình thức</th><th>Bài</th><th>Điểm</th></tr></thead>
      <tbody>${list.map(a => `<tr>
        <td>${fmtTime(a.at)}</td><td>${a.mode === 'exam' ? 'Thi thử' : 'Luyện tập'}</td>
        <td><a href="#/r/${a.id}">${esc(a.subjectName)} · ${esc(a.title)}</a></td>
        <td>${a.score != null ? `<span class="score-sm ${a.score >= CFG.passScore ? 'pass' : 'fail'}">${a.score}</span>` : '<span class="muted">Tự kiểm</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function viewHistory() {
    const h = history();
    page(`${crumbs([['Trang chủ', '#/'], ['Lịch sử', '']])}
      <div class="head-row"><h1>Lịch sử làm bài</h1>${h.length ? '<button type="button" class="btn-sec" id="clearBtn">Xoá lịch sử trên máy này</button>' : ''}</div>
      <p class="muted">Lịch sử lưu trên trình duyệt của máy này. Kết quả thi thử đã gửi cho thầy cô vẫn còn dù em xoá ở đây.</p>
      ${h.length ? historyTable(h) : '<p>Chưa có lượt làm bài nào.</p>'}`);
    const b = $('#clearBtn');
    if (b) b.addEventListener('click', () => { if (confirm('Xoá toàn bộ lịch sử trên máy này?')) { store.del('mos_history'); viewHistory(); } });
  }

  // ---------------------------------------------------------------- điều hướng

  async function route() {
    leave();
    await Promise.all([driveReady, Srv.ready]);
    const parts = (location.hash || '#/').split('/');
    const [, name, arg] = parts;
    try {
      if (!name) await viewHome();
      else if (name === 's') await viewSubject(arg);
      else if (name === 'set') await viewSet(arg);
      else if (name === 'p') await viewProject(arg);
      else if (name === 'exam') await viewExam(arg);
      else if (name === 'dock' && arg === 'p') await viewProject(parts[3], true);
      else if (name === 'dock' && arg === 'exam') await viewExam(parts[3], true);
      else if (name === 'docked') viewDocked(parts.slice(2).join('/'));
      else if (name === 'r') viewResult(arg);
      else if (name === 'history') viewHistory();
      else await viewHome();
    } catch (e) {
      console.error(e);
      showError(e);
    }
  }

  function applyTheme() {
    const t = store.get('mos_theme', null);
    if (t) document.documentElement.setAttribute('data-theme', t);
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('#themeBtn')) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('mos_theme', next);
  });

  applyTheme();
  window.addEventListener('hashchange', route);
  window.addEventListener('online', flushPending);
  route();
  flushPending();
})();
