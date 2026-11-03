/* ============================================================
   js/teacher/wrong-questions.js
   "Câu cả lớp hay sai" — teacher-dashboard.html và coordinator-dashboard.html.

   Dữ liệu: mỗi bài nộp gửi kèm uid các câu sai lên Google Sheet (cột O
   CauSai — js/services/result-submitter.js); Apps Script tổng hợp ngay trên
   server (apps/src/40-results.gs → wrongStats_) và trả về bảng gọn. Firestore
   KHÔNG lưu câu sai (quiz_results giữ nguyên dung lượng) → 0 lượt đọc/ghi
   Firestore cho tính năng này (Apps Script chỉ xác thực người gọi, nhớ 1 giờ).

   Chỉ chạy khi giáo viên bấm "Phân tích" (không tự gọi lúc mở trang) để không
   tốn lượt chạy Apps Script. Nội dung câu tra từ file tĩnh data/ic3/*.json.
   "Tạo đề ôn" dựng link đề (js/custom-exam-codec.js, nạp lười) từ các câu hay
   sai nhất — đề nằm trong link, 0 Firebase.

   "Gợi ý dạy lại (AI)" trong từng câu: Gemini phân tích lỗi hay gặp + cách giảng lại (js/services/ai-service.js,
   chỉ chạy khi bấm, 0 Firestore — key cá nhân hoặc key trường qua Apps Script).

   Nạp SAU js/services/sheet-results-api.js, js/services/lazy-script-loader.js,
   js/services/question-bank-lookup.js (tra uid → câu, dùng chung với gom-ket-qua).
   js/teacher/dashboard.js, js/coordinator/dashboard.js gọi EduWrongQuestions.setContext(...) mỗi lần đổi bộ lọc.
   ============================================================ */
(function (global) {
  'use strict';

  const SHOW = 15;          // số câu hiện trên thẻ
  const EXAM_MAX = 20;      // số câu tối đa đưa vào đề ôn
  const $ = (id) => document.getElementById(id);
  const { esc, plain, answerHtml, resolve } = global.EduQuestionLookup;   // js/services/question-bank-lookup.js

  let ctx = null;           // { schools, classes, sinceMs, testName, label }
  let last = null;          // { stats, resolved: Map uid → {q, mt, catId, levelId, levelName} }

  function setStatus(html) { $('wqStatus').innerHTML = html; }

  function render() {
    const { stats, resolved } = last;
    const items = stats.items.slice(0, SHOW);
    const base = stats.withData;
    const pct = (n) => (ctx.testName && base ? ` · ${Math.round((n / base) * 100)}% bài` : '');
    setStatus(`Phạm vi: <b>${esc(ctx.label)}</b> — ${base} bài có dữ liệu câu sai`
      + (stats.submissions > base ? ` <span class="wq-note">(${stats.submissions - base} bài cũ hơn chưa có dữ liệu)</span>` : '')
      + (stats.truncated ? ' <span class="wq-note">· quá nhiều bài, chỉ xét phần mới nhất</span>' : ''));
    $('wqList').innerHTML = items.length ? items.map((it, i) => {
      const r = resolved.get(it.uid);
      const text = r ? plain(r.q.question) : `(Không tìm thấy câu ${it.uid} trong ngân hàng — có thể đã đổi/xoá)`;
      return `<li class="wq-item"><details>
          <summary><span class="wq-rank">${i + 1}</span><span class="wq-q">${esc(text)}</span>
            <span class="wq-meta">${it.count} lượt sai · ${it.students} HS${pct(it.count)}${r ? ` · ${esc(r.levelName)} › ${esc(r.mt)}` : ''}</span></summary>
          ${r ? answerHtml(r.q) + (r.q.explanation ? `<p class="wq-expl"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> ${esc(plain(r.q.explanation))}</p>` : '') : ''}
          ${r && global.EduAI ? `<div class="wq-ai" data-ai-staff><button type="button" class="ai-btn" data-wq-ai="${i}"><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> Gợi ý dạy lại (AI)</button><div class="ai-box" hidden aria-live="polite"></div></div>` : ''}
        </details></li>`;
    }).join('') : '<li class="watchlist-empty">Chưa có câu sai nào trong phạm vi này (hoặc học sinh chưa nộp bài từ khi bật tính năng).</li>';
    $('wqMakeExam').hidden = !items.some((it) => resolved.has(it.uid));
  }

  async function analyze() {
    if (!ctx || !global.EduSheetResults) return;
    const btn = $('wqAnalyze');
    btn.disabled = true;
    setStatus('Đang tổng hợp câu sai từ Google Sheet...');
    $('wqList').innerHTML = '';
    $('wqMakeExam').hidden = true;
    try {
      const stats = await global.EduSheetResults.wrongStats(ctx);
      last = { stats, resolved: await resolve(stats.items.slice(0, Math.max(SHOW, EXAM_MAX))) };
      render();
    } catch (err) {
      last = null;
      setStatus(err.code === 'not-found'
        ? 'Apps Script chưa có API "wrongStats" — Admin cần dán apps/Code.gs mới rồi Deploy → New version.'
        : 'Không tải được: ' + esc(err.message));
    } finally {
      btn.disabled = false;
    }
  }

  /** Đề ôn từ các câu hay sai nhất — cùng Chương trình/Cấp độ với câu sai nhiều nhất (link đề chỉ chứa 1 cấp độ). */
  async function makeExam() {
    if (!last) return;
    const picks = last.stats.items.map((it) => last.resolved.get(it.uid) && Object.assign({ uid: it.uid }, last.resolved.get(it.uid))).filter(Boolean);
    if (!picks.length) return;
    const head = picks[0];
    const items = picks.filter((p) => p.catId === head.catId && p.levelId === head.levelId).slice(0, EXAM_MAX).map((p) => ({ mt: p.mt, uid: p.uid }));
    const btn = $('wqMakeExam');
    btn.disabled = true;
    try {
      await global.EduLazyLoad.loadScripts(['js/custom-exam-codec.js']);
      const exam = {
        title: `Ôn câu hay sai — ${ctx.label}`.slice(0, 120),
        desc: `${items.length} câu ${head.levelName} học sinh sai nhiều nhất`,
        cat: head.catId, level: head.levelId, duration: 0, shuffle: true, items,
      };
      const url = new URL(await global.EduCustomExam.buildLink(exam, 'index.html'), location.href).href;
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* trình duyệt chặn clipboard */ }
      global.dispatchEvent(new CustomEvent('edu:toast', { detail: copied ? `Đã chép link đề ôn ${items.length} câu — gửi cho học sinh.` : `Đề ôn ${items.length} câu đã mở ở tab mới.` }));
      global.open(url, '_blank', 'noopener');
    } catch (err) {
      global.dispatchEvent(new CustomEvent('edu:toast', { detail: 'Không tạo được đề: ' + err.message }));
    } finally {
      btn.disabled = false;
    }
  }

  /** Bộ lọc dashboard đổi → kết quả cũ không còn đúng phạm vi, chờ bấm Phân tích lại. */
  function setContext(c) {
    const same = ctx && JSON.stringify(ctx) === JSON.stringify(c);
    ctx = c;
    $('wrongQCard').hidden = false;
    if (same && last) return;
    last = null;
    $('wqList').innerHTML = '';
    $('wqMakeExam').hidden = true;
    setStatus(`Phạm vi: <b>${esc(c.label)}</b> — bấm <b>Phân tích</b> để xem câu học sinh sai nhiều nhất.`);
  }

  const txt = (x) => (typeof x === 'string' ? plain(x) : x); // chuỗi có thẻ HTML → chữ; đáp án dạng đối tượng giữ nguyên
  /** "Gợi ý dạy lại (AI)": câu + đáp án + số lượt sai → Gemini gợi ý vì sao sai, cách giảng lại, câu củng cố. */
  async function reteach(btn) {
    const it = last && last.stats.items[+btn.dataset.wqAi];
    const r = it && last.resolved.get(it.uid);
    if (!r || !global.EduAI) return;
    const grade = parseInt((String(r.levelName || '').match(/lớp\s*(\d+)/i) || [])[1], 10) || 0;
    btn.disabled = true;
    const ok = await global.EduAI.askInto(btn.nextElementSibling, 'reteach', {
      question: plain(r.q.question), options: (r.q.options || []).map(txt), correct: Array.isArray(r.q.correct) ? r.q.correct.map(txt) : r.q.correct,
      explanation: plain(r.q.explanation || ''), wrong: it.count, students: it.students, scope: ctx && ctx.label, grade,
    }, { staff: true });
    if (ok) btn.hidden = true; else btn.disabled = false;
  }

  function init() {
    if (!$('wrongQCard')) return;
    $('wqAnalyze').addEventListener('click', analyze);
    $('wqMakeExam').addEventListener('click', makeExam);
    $('wqList').addEventListener('click', (e) => { const b = e.target.closest('[data-wq-ai]'); if (b) reteach(b); });
  }
  init();

  global.EduWrongQuestions = { setContext, _resolve: resolve };
})(window);
