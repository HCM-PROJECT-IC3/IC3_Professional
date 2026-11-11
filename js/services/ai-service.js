/* ============================================================
   js/services/ai-service.js — Trợ lý AI (Gemini): COMPOSITION ROOT + giao diện dùng chung (Clean Architecture).
     Domain       js/services/ai-core.js       câu lệnh, đọc phản hồi, câu hỏi AI soạn (thuần)
     Use case     js/services/ai-assistant.js  luật bản đệm → key cá nhân → key trường (thuần, nhận cổng)
     Adapter      file này: keyStore/cache (localStorage), gemini (REST), school (Apps Script)
     Presentation file này: askInto (ô trả lời), openSettings (hộp Cài đặt AI)
   Dùng chung cho:
   màn xem lại bài (js/review-detail.js), Soạn đề (js/exam-builder.js), "Câu hay sai"
   (js/teacher/wrong-questions.js), Gọi tên (js/name-picker/name-picker.js).

   Key 2 lớp (theo giáo trình "Web App" — Vấn đề API key Gemini, hướng Platform key + BYOK):
     1) Key CÁ NHÂN trên máy (localStorage "eduquiz_ai_v1") → gọi thẳng Gemini. Không gửi lên máy chủ trường.
     2) Không có / lỗi 429 / key sai → gọi Apps Script (aiAsk | aiAskStaff, apps/src/78-ai.gs) dùng KEY GIÁO VIÊN
        cất trong Script Properties — học sinh F12 không thấy được.
     3) Cả 2 không được → báo rõ lý do + nút "Cài đặt AI" để nhập key cá nhân (không tự gọi lại).
   Lời giải lưu đệm trên máy ("eduquiz_ai_cache_v1", 120 mục mới nhất): hỏi lại cùng câu → 0 lượt Gemini.
   0 Firebase: không đọc/ghi Firestore (việc của giáo viên chỉ kèm ID token để Apps Script xác thực, nhớ 1 giờ).
   Chỉ gửi nội dung câu hỏi / đáp án / tên bài — KHÔNG gửi tên học sinh.
   Nạp SAU js/services/ai-core.js và js/services/ai-assistant.js; dùng js/services/apps-script-client.js nếu trang có.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduAICore;
  if (!C || !global.EduAIAssistant) return;
  const CFG_KEY = 'eduquiz_ai_v1';
  const CACHE_KEY = 'eduquiz_ai_cache_v1';
  const CID_KEY = 'eduquiz_ai_cid';
  const CACHE_MAX = 120;
  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  // ============================================================
  // ADAPTER — localStorage (kho key cá nhân, bộ đệm lời giải, mã máy)
  // ============================================================
  function config() {
    const c = store.get(CFG_KEY) || {};
    return { key: typeof c.key === 'string' ? c.key.trim() : '', model: C.MODEL_RE.test(c.model || '') ? c.model : C.DEFAULT_MODEL };
  }
  function cid() {
    let v = '';
    try { v = localStorage.getItem(CID_KEY) || ''; } catch (e) { /* ignore */ }
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(v)) {
      v = 'm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      try { localStorage.setItem(CID_KEY, v); } catch (e) { /* ignore */ }
    }
    return v;
  }
  function cacheGet(k) { const m = store.get(CACHE_KEY); return m && m[k] ? m[k][1] : null; }
  function cachePut(k, text) {
    const m = store.get(CACHE_KEY) || {};
    m[k] = [Date.now(), text];
    const keys = Object.keys(m);
    if (keys.length > CACHE_MAX) keys.sort((a, b) => m[a][0] - m[b][0]).slice(0, keys.length - CACHE_MAX).forEach((x) => { delete m[x]; });
    if (!store.set(CACHE_KEY, m)) store.set(CACHE_KEY, { [k]: m[k] }); // đầy bộ nhớ → chỉ giữ mục mới
  }

  const aiErr = global.EduAIAssistant.aiErr;

  // ============================================================
  // ADAPTER — Gemini REST (key cá nhân, gọi thẳng từ trình duyệt)
  // ============================================================
  async function geminiGenerate(key, model, b, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 60000);
    let res, txt;
    try {
      res = await fetch(API + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, // key ở header, không nằm trên URL
        body: JSON.stringify(C.requestBody(b)),
      });
      txt = await res.text();
    } catch (e) { throw aiErr('busy'); } finally { clearTimeout(timer); }
    if (!res.ok) throw aiErr(C.classify(res.status, txt));
    let json = null;
    try { json = JSON.parse(txt); } catch (e) { throw aiErr('busy'); }
    const out = C.extractText(json);
    if (!out.text) throw aiErr(out.finish === 'SAFETY' ? 'safety' : 'empty');
    return out.text;
  }

  // ============================================================
  // ADAPTER — máy chủ trường (Apps Script aiAsk | aiAskStaff, key giáo viên trong Script Properties)
  // ============================================================
  async function schoolAsk(task, payload) {
    const A = global.EduAppsScript;
    if (!A) throw aiErr('no-school', 'Trang này chưa nối máy chủ trường.');
    const staff = C.STAFF_TASKS.indexOf(task) >= 0;
    try {
      return staff
        ? await A.call('aiAskStaff', { task, payload }, { timeoutMs: 90000 })
        : await A.call('aiAsk', { task, payload, cid: cid() }, { auth: false, timeoutMs: 90000 });
    } catch (e) {
      const code = String((e && e.code) || '');
      if (code.indexOf('ai-') === 0) throw aiErr(code.slice(3), e.message);
      if (code === 'unauthenticated' || code === 'permission-denied') throw aiErr('login', 'Cần đăng nhập tài khoản giáo viên để dùng key của trường.');
      if (code === 'not-found') throw aiErr('no-school', 'Máy chủ trường chưa cập nhật bản có Trợ lý AI.');
      throw aiErr('busy', 'Không kết nối được máy chủ trường.');
    }
  }

  // Nối adapter thật vào use case
  const assistant = global.EduAIAssistant.create({
    keyStore: { get: config },
    cache: { get: cacheGet, put: cachePut },
    gemini: { generate: (key, model, b) => geminiGenerate(key, model, b) },
    school: { ask: schoolAsk },
  });
  const ask = assistant.ask;
  const testKey = assistant.testKey;

  // ============================================================
  // PRESENTATION — ô trả lời + hộp Cài đặt AI
  // ============================================================
  const VIA = { mine: 'key cá nhân', school: 'key của trường', 'school-cache': 'đã lưu ở máy chủ trường', cache: 'đã lưu trên máy này' };
  function footHtml(via) {
    return `<p class="ai-foot"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Gemini · ${esc(VIA[via] || '')} · AI có thể nhầm, hãy đối chiếu với bài học.
      <button type="button" class="ai-link" data-ai-settings>Cài đặt AI</button></p>`;
  }
  function errHtml(e) {
    const hint = e.kind === 'safety' ? '' : (e.school && e.school.kind === 'login'
      ? ' Đăng nhập tài khoản giáo viên, hoặc nhập key cá nhân.'
      : ' Có thể nhập <b>key Gemini cá nhân</b> (miễn phí) để dùng ngay.');
    return `<p><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(e.message)}${hint}</p>
      <p class="ai-foot"><button type="button" class="ai-link" data-ai-settings>Cài đặt AI</button></p>`;
  }
  /** Hỏi AI và hiện kết quả vào ô `box`. Trả kết quả của ask() hoặc null nếu lỗi (đã hiện lý do). */
  async function askInto(box, task, payload, opts) {
    box.hidden = false;
    box.className = 'ai-box is-loading';
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = '<span class="ai-spin" aria-hidden="true"></span> Đang hỏi Gemini…';
    if (opts && opts.staff) box.dataset.aiStaff = '1';
    try {
      const r = await ask(task, payload, opts);
      box.className = 'ai-box';
      box.innerHTML = (opts && opts.render ? opts.render(r) : C.formatText(r.text)) + footHtml(r.via);
      return r;
    } catch (e) {
      box.className = 'ai-box is-err';
      box.innerHTML = errHtml(e);
      return null;
    } finally { box.removeAttribute('aria-busy'); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ai-settings]');
    if (!b) return;
    e.preventDefault();
    const host = b.closest('[data-ai-staff]');
    openSettings({ staff: !!host || b.hasAttribute('data-ai-staff') });
  });

  const modelOptions = (cur) => C.MODELS.concat(C.MODELS.some((m) => m.id === cur) ? [] : [{ id: cur, name: cur }])
    .map((m) => `<option value="${esc(m.id)}"${m.id === cur ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  /** Hộp "Cài đặt AI": key cá nhân (mọi người) + key hệ thống của trường (staff — Apps Script chỉ cho Admin lưu). */
  function openSettings(opts) {
    const staff = !!(opts && opts.staff);
    const old = document.querySelector('.ai-modal');
    if (old) old.remove();
    const back = document.activeElement;
    const c = config();
    const wrap = document.createElement('div');
    wrap.className = 'ai-modal';
    wrap.innerHTML = `<div class="ai-modal-box" role="dialog" aria-modal="true" aria-labelledby="aiMTitle">
      <button type="button" class="ai-x" data-ai-close aria-label="Đóng"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <h2 id="aiMTitle"><i class="fa-solid fa-message" aria-hidden="true"></i> Trợ lý AI (Gemini)</h2>
      <p class="ai-help">AI giải thích câu sai, gợi ý dạy lại, soạn câu hỏi. Máy dùng <b>key cá nhân</b> trước; không có thì dùng <b>key của trường</b> (nếu Admin đã cài). Không tốn lượt Firebase.</p>
      <section class="ai-sec">
        <h3><i class="fa-solid fa-key" aria-hidden="true"></i> Key cá nhân trên máy này</h3>
        <label class="ai-field"><span>API key Gemini</span>
          <input type="password" id="aiKey" autocomplete="off" spellcheck="false" placeholder="${c.key ? 'Đã lưu — dán key mới để thay' : 'AIza…'}"></label>
        <label class="ai-field"><span>Model</span><select id="aiModel">${modelOptions(c.model)}</select></label>
        <div class="ai-row">
          <button type="button" class="ai-btn2" id="aiTest">Kết nối thử</button>
          <button type="button" class="ai-btn2 is-primary" id="aiSave">Lưu trên máy này</button>
          <button type="button" class="ai-btn2 is-danger" id="aiDel"${c.key ? '' : ' hidden'}>Xoá key</button>
        </div>
        <p class="ai-status" id="aiMine" role="status">${c.key ? 'Đã có key cá nhân trên máy này.' : 'Chưa có key cá nhân.'}</p>
        <p class="ai-note">Lấy key miễn phí tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>.
          Key chỉ lưu trong trình duyệt máy này, không gửi lên máy chủ trường. Máy dùng chung: bấm "Xoá key" khi dùng xong.</p>
      </section>
      ${staff ? `<section class="ai-sec">
        <h3><i class="fa-solid fa-school" aria-hidden="true"></i> Key hệ thống của trường <small>(chỉ Admin lưu được)</small></h3>
        <p class="ai-status" id="aiSchool" role="status">Đang kiểm tra…</p>
        <label class="ai-field"><span>API key Gemini của trường</span><input type="password" id="aiSKey" autocomplete="off" spellcheck="false" placeholder="Để trống = giữ key đang có"></label>
        <label class="ai-field"><span>Model</span><select id="aiSModel">${modelOptions(C.DEFAULT_MODEL)}</select></label>
        <label class="ai-field"><span>Trần lượt gọi Gemini mỗi ngày (cả trường)</span><input type="number" id="aiSMax" min="10" max="20000" step="10" placeholder="800"></label>
        <div class="ai-row">
          <button type="button" class="ai-btn2 is-primary" id="aiSSave">Kiểm tra &amp; lưu lên Apps Script</button>
          <button type="button" class="ai-btn2 is-danger" id="aiSDel">Gỡ key của trường</button>
        </div>
        <p class="ai-note">Key nằm trong Script Properties của Apps Script — học sinh không xem được. Mỗi câu trả lời được lưu đệm 6 giờ (nhiều em hỏi cùng câu chỉ tốn 1 lượt);
          mỗi máy học sinh tối đa 30 lượt/ngày, mỗi tài khoản giáo viên 150 lượt/ngày.</p>
      </section>` : ''}
    </div>`;
    document.body.appendChild(wrap);
    const $ = (id) => wrap.querySelector('#' + id);
    const say = (el, msg, tone) => { el.textContent = msg; el.className = 'ai-status' + (tone ? ' is-' + tone : ''); };
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (back && back.focus) back.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-ai-close]')) close(); });
    const busy = (btn, on) => { btn.disabled = on; };

    $('aiTest').addEventListener('click', async () => {
      const key = $('aiKey').value.trim() || config().key;
      if (!key) { say($('aiMine'), 'Dán key Gemini vào ô trên trước đã.', 'bad'); return; }
      busy($('aiTest'), true); say($('aiMine'), 'Đang gửi câu hỏi thử tới Google…');
      try { await testKey(key, $('aiModel').value); say($('aiMine'), '✓ Kết nối thành công — key dùng được.', 'ok'); } catch (e) { say($('aiMine'), '✗ ' + e.message, 'bad'); }
      busy($('aiTest'), false);
    });
    $('aiSave').addEventListener('click', async () => {
      const key = $('aiKey').value.trim() || config().key;
      if (!key) { say($('aiMine'), 'Dán key Gemini vào ô trên trước đã.', 'bad'); return; }
      busy($('aiSave'), true); say($('aiMine'), 'Đang kiểm tra key trước khi lưu…');
      try {
        await testKey(key, $('aiModel').value);
        store.set(CFG_KEY, { key, model: $('aiModel').value });
        $('aiKey').value = ''; $('aiDel').hidden = false;
        say($('aiMine'), '✓ Đã lưu key cá nhân trên máy này.', 'ok');
      } catch (e) { say($('aiMine'), '✗ Chưa lưu: ' + e.message, 'bad'); }
      busy($('aiSave'), false);
    });
    $('aiDel').addEventListener('click', () => { store.del(CFG_KEY); $('aiDel').hidden = true; say($('aiMine'), 'Đã xoá key cá nhân khỏi máy này.', 'ok'); });

    if (staff) {
      const A = global.EduAppsScript;
      const paint = (st) => {
        say($('aiSchool'), st.configured ? `✓ Đã cài · ${st.model} · hôm nay đã dùng ${st.usedToday}/${st.dailyMax} lượt` : 'Chưa cài key của trường — học sinh cần key cá nhân để dùng AI.', st.configured ? 'ok' : '');
        if (st.model) $('aiSModel').innerHTML = modelOptions(st.model);
        if (st.dailyMax) $('aiSMax').placeholder = String(st.dailyMax);
      };
      const fail = (e) => say($('aiSchool'), String(e.code || '') === 'not-found' ? 'Máy chủ trường chưa cập nhật bản có Trợ lý AI (dán lại apps/Code.gs → Deploy).' : '✗ ' + (e.message || e), 'bad');
      if (!A) say($('aiSchool'), 'Trang này chưa nối máy chủ trường.', 'bad');
      else A.call('aiStatus', {}, { timeoutMs: 30000 }).then(paint).catch(fail);
      $('aiSSave').addEventListener('click', async () => {
        if (!A) return;
        busy($('aiSSave'), true); say($('aiSchool'), 'Apps Script đang gọi thử Gemini bằng key này…');
        try {
          paint(await A.call('aiConfig', { key: $('aiSKey').value.trim(), model: $('aiSModel').value, dailyMax: Number($('aiSMax').value) || 0 }, { timeoutMs: 60000 }));
          $('aiSKey').value = '';
        } catch (e) { fail(e); }
        busy($('aiSSave'), false);
      });
      $('aiSDel').addEventListener('click', async () => {
        if (!A || !global.confirm('Gỡ key Gemini của trường? Học sinh sẽ cần key cá nhân để dùng AI.')) return;
        try { paint(await A.call('aiConfig', { remove: true }, { timeoutMs: 30000 })); } catch (e) { fail(e); }
      });
    }
    setTimeout(() => $('aiKey').focus(), 30);
  }

  global.EduAI = { ask, askInto, openSettings, testKey, config, parseQuiz: C.parseQuiz, toQuickText: C.toQuickText, formatText: C.formatText };
})(window);
