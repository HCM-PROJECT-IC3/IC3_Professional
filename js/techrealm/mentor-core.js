/* ============================================================
   js/techrealm/mentor-core.js — AI SƯ PHỤ (Domain thuần).

   Mở rộng Trợ lý AI có sẵn (js/services/ai-core.js) bằng 4 việc mới, cùng khuôn: CODE dựng câu lệnh từ dữ liệu có
   cấu trúc (không nhận câu lệnh tự do) → không mượn được key của trường để hỏi việc khác.
     mentorConcept  HS  giải thích kiến thức (câu hỏi ngắn của học sinh, đã lọc thông tin cá nhân)
     mentorHint     HS  gợi ý giải bài tập theo 3 mức — KHÔNG nhận đáp án đúng, dặn AI không nêu đáp án
     codeHelp       HS  hướng dẫn lập trình / phân tích lỗi code — chỉ ra lỗi + gợi ý, không viết lời giải trọn vẹn
     rubricReview   GV  gợi ý chấm sản phẩm theo rubric (GIÁO VIÊN quyết định điểm)
   Chạy ở trình duyệt (ai-core.build gọi sang đây) VÀ Apps Script (scripts/build-apps-script.js chép nguyên văn; 78-ai.gs
   aiBuild_ gọi sang đây) → câu lệnh hai nơi giống hệt, không có bản chép tay.
   Không DOM, không mạng, không `?.` / `??`. Tài liệu: docs/techrealm/AI_MENTOR.md
   ============================================================ */
(function (root) {
  'use strict';

  const PUBLIC_TASKS = ['mentorConcept', 'mentorHint', 'codeHelp'];
  const STAFF_TASKS = ['rubricReview'];
  const LANGS = { python: 'Python', javascript: 'JavaScript', html: 'HTML/CSS', scratch: 'Scratch (mô tả khối lệnh)' };

  const SYS = 'Bạn là "AI Sư Phụ" — trợ giảng thân thiện cho học sinh phổ thông Việt Nam, môn Tin học, khoa học và kỹ năng số. '
    + 'Trả lời bằng tiếng Việt chuẩn, ngắn gọn, đúng kiến thức, hợp lứa tuổi. Không bịa; không chắc thì nói không chắc. '
    + 'Mục tiêu là giúp học sinh TỰ HIỂU và TỰ LÀM: hướng dẫn từng bước, không làm bài hộ. '
    + 'Chỉ trả lời nội dung học tập. Nếu câu hỏi ngoài phạm vi học tập, không phù hợp lứa tuổi, nguy hiểm, hoặc hỏi/đưa thông tin '
    + 'cá nhân (tên, địa chỉ, số điện thoại, mật khẩu): từ chối lịch sự bằng 1 câu và gợi ý hỏi nội dung bài học. '
    + 'Không bao giờ đề nghị học sinh cung cấp thông tin cá nhân.';

  /* ── Lọc thông tin cá nhân khỏi chữ học sinh gõ (chạy ở CẢ trình duyệt lẫn máy chủ) ── */
  const PII = [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
    [/https?:\/\/\S+|www\.\S+/gi, '[link]'],
    [/(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g, '[số điện thoại]'],
    [/\b\d{9,12}\b/g, '[dãy số]'],
    [/(?:mật khẩu|mat khau|password|pass)\s*(?:là|:|=)?\s*\S+/gi, '[mật khẩu]'],
    [/\b(?:tên|ten)\s+(?:em|mình|minh|tôi|toi|tớ|to|con)\s+(?:là|la)\s+[^\s,.!?]+(?:\s+[^\s,.!?]+){0,3}/gi, '[tên]'],
    [/\b(?:em|mình|tôi|tớ)\s+(?:tên là|ten la|là học sinh lớp)\s+[^\s,.!?]+(?:\s+[^\s,.!?]+){0,3}/gi, '[tên]'],
    [/\b(?:nhà|nha)\s+(?:em|mình|tôi|tớ)\s+(?:ở|o)\s+[^.!?\n]{1,60}/gi, '[địa chỉ]'],
  ];
  function scrubPII(s) {
    let text = String(s == null ? '' : s);
    let removed = 0;
    PII.forEach(function (rule) {
      text = text.replace(rule[0], function () { removed++; return rule[1]; });
    });
    return { text: text, removed: removed };
  }

  const ctrl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
  function clip(s, n) { return scrubPII(String(s == null ? '' : s).replace(ctrl, '').replace(/\s+/g, ' ').trim()).text.slice(0, n); }
  function clipCode(s, n) { return scrubPII(String(s == null ? '' : s).replace(ctrl, '').replace(/\t/g, '  ').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')).text.slice(0, n); }
  function int(v, a, b, d) { const x = Math.round(Number(v)); return isFinite(x) ? Math.max(a, Math.min(b, x)) : d; }
  function grade(v) { const g = Math.round(Number(v)); return g >= 3 && g <= 12 ? g : 0; }
  const forGrade = function (g) { return g ? ' lớp ' + g : ''; };
  const opts = function (a) { return (Array.isArray(a) ? a : []).slice(0, 8).map(function (x) { return clip(x, 200); }).filter(Boolean); };

  const TASKS = {
    mentorConcept: {
      norm: function (p) { return { topic: clip(p.topic, 120), question: clip(p.question, 300), grade: grade(p.grade) }; },
      ok: function (n) { return n.question.length >= 5; },
      prompt: function (n) {
        return {
          user: 'Học sinh' + forGrade(n.grade) + (n.topic ? ' đang học "' + n.topic + '"' : '') + ' hỏi:\n"' + n.question + '"\n\n'
            + 'Giải thích dễ hiểu trong tối đa 150 chữ, có 1 ví dụ gần gũi đời sống. '
            + 'Kết thúc bằng 1 câu hỏi ngắn để học sinh tự kiểm tra mình đã hiểu chưa (KHÔNG kèm đáp án của câu đó).',
          json: false, maxTokens: 700, temperature: 0.4,
        };
      },
    },
    mentorHint: {
      // Cố ý KHÔNG có trường đáp án đúng: AI không được biết đáp án do hệ thống đưa.
      norm: function (p) { return { question: clip(p.question, 900), options: opts(p.options), attempt: clip(p.attempt, 300), level: int(p.level, 1, 3, 1), grade: grade(p.grade) }; },
      ok: function (n) { return !!n.question; },
      prompt: function (n) {
        const lv = ['', 'MỨC 1: chỉ nhắc khái niệm / kiến thức liên quan, không đề cập phương án nào.',
          'MỨC 2: gợi ý cách suy luận hoặc cách loại trừ, có thể nói 1 phương án CHẮC CHẮN SAI và vì sao.',
          'MỨC 3: phân tích lần lượt từng phương án (điểm hợp lý / chưa hợp lý) nhưng KHÔNG kết luận phương án nào đúng.'][n.level];
        return {
          user: 'Học sinh' + forGrade(n.grade) + ' nhờ gợi ý cho bài tập LUYỆN TẬP sau:\n' + n.question
            + (n.options.length ? '\nCác phương án:\n' + n.options.map(function (o, i) { return 'ABCDEFGH'.charAt(i) + '. ' + o; }).join('\n') : '')
            + (n.attempt ? '\nHọc sinh đang nghĩ: "' + n.attempt + '"' : '')
            + '\n\nĐưa gợi ý ' + lv + ' TUYỆT ĐỐI không nêu đáp án đúng, không viết "đáp án là…". Tối đa 100 chữ. '
            + 'Kết thúc bằng 1 câu hỏi dẫn dắt để học sinh tự nghĩ tiếp.',
          json: false, maxTokens: 500, temperature: 0.3,
        };
      },
    },
    codeHelp: {
      norm: function (p) { return { language: LANGS[p.language] ? p.language : 'python', code: clipCode(p.code, 1500), error: clip(p.error, 300), goal: clip(p.goal, 200), grade: grade(p.grade) }; },
      ok: function (n) { return n.code.trim().length >= 3; },
      prompt: function (n) {
        return {
          user: 'Học sinh' + forGrade(n.grade) + ' đang học ' + LANGS[n.language] + '.'
            + (n.goal ? '\nMục tiêu chương trình: ' + n.goal : '')
            + '\nCode của học sinh:\n```\n' + n.code + '\n```'
            + (n.error ? '\nThông báo lỗi / hiện tượng: ' + n.error : '')
            + '\n\nHãy: (1) chỉ ra dòng hoặc chỗ có vấn đề và GIẢI THÍCH vì sao; (2) gợi ý cách sửa bằng lời, '
            + 'nếu cần minh hoạ thì tối đa 3 dòng code cho đúng chỗ lỗi đó; (3) KHÔNG viết lại toàn bộ chương trình hay lời giải hoàn chỉnh; '
            + '(4) kết thúc bằng 1 việc nhỏ để học sinh tự thử. Tối đa 180 chữ.',
          json: false, maxTokens: 900, temperature: 0.2,
        };
      },
    },
    rubricReview: {
      norm: function (p) {
        const crit = (Array.isArray(p.criteria) ? p.criteria : []).slice(0, 8).map(function (c) { return { name: clip(c && c.name, 80), max: int(c && c.max, 1, 10, 4) }; }).filter(function (c) { return c.name; });
        return { title: clip(p.title, 120), description: clipCode(p.description, 1500), criteria: crit, grade: grade(p.grade) };
      },
      ok: function (n) { return n.description.trim().length >= 20 && n.criteria.length > 0; },
      prompt: function (n) {
        return {
          user: 'Bạn hỗ trợ GIÁO VIÊN chấm sản phẩm học sinh' + forGrade(n.grade) + (n.title ? ' cho dự án "' + n.title + '"' : '') + '.\n'
            + 'Mô tả / nội dung sản phẩm:\n' + n.description + '\n\nRubric:\n'
            + n.criteria.map(function (c, i) { return (i + 1) + '. ' + c.name + ' (tối đa ' + c.max + ' điểm)'; }).join('\n')
            + '\n\nĐề xuất điểm từng tiêu chí (số nguyên, không vượt tối đa) kèm nhận xét ngắn, cụ thể, khích lệ. '
            + 'Chỉ dựa trên mô tả; thiếu thông tin thì cho điểm thận trọng và ghi rõ "cần xem sản phẩm". '
            + 'Trả về DUY NHẤT JSON: {"criteria":[{"name":"…","score":0,"comment":"…"}],"overall":"…"}',
          json: true, maxTokens: 1200, temperature: 0.2,
        };
      },
    },
  };

  /** Dựng câu lệnh — cùng dạng kết quả với ai-core.build. Lỗi: { code: 'invalid-argument' }. */
  function build(task, payload) {
    const t = Object.prototype.hasOwnProperty.call(TASKS, task) ? TASKS[task] : null;
    if (!t) throw Object.assign(new Error('Việc AI không hợp lệ: ' + task), { code: 'invalid-argument' });
    const n = t.norm(payload || {});
    if (!t.ok(n)) throw Object.assign(new Error('Thiếu dữ liệu cho việc AI ' + task), { code: 'invalid-argument' });
    const p = t.prompt(n);
    return { task: task, payload: n, system: SYS, user: p.user, json: p.json, maxTokens: p.maxTokens, temperature: p.temperature };
  }

  /* ── Chế độ học / kiểm tra ──
     Đang làm bài KIỂM TRA (bản tự lưu của sảnh có examMode 'test', chưa nộp, < 8 giờ) → AI Sư Phụ nghỉ HẲN cho học sinh.
     Lớp bảo vệ thứ 2: mentorHint không nhận đáp án; lớp 3 (GĐ5): máy chủ từ chối khi học viên có phiên khảo hạch đang mở. */
  const TEST_MAX_AGE_MS = 8 * 3600e3;
  function modeOf(inProgress, nowMs) {
    if (inProgress && inProgress.examMode === 'test' && typeof inProgress.savedAt === 'number' && nowMs - inProgress.savedAt < TEST_MAX_AGE_MS) return 'test';
    return 'learn';
  }
  function policy(mode, task) {
    if (STAFF_TASKS.indexOf(task) >= 0) return { allowed: true };
    if (PUBLIC_TASKS.indexOf(task) < 0 && ['explain', 'quickQ'].indexOf(task) < 0) return { allowed: false, reason: 'Việc AI không hợp lệ.' };
    if (mode === 'test') return { allowed: false, reason: 'Em đang làm bài kiểm tra — AI Sư Phụ tạm nghỉ tới khi em nộp bài. Cố gắng tự làm nhé!' };
    return { allowed: true };
  }

  /** JSON rubric AI trả về → điểm đã kẹp trong [0, tối đa] theo đúng rubric; null nếu không đọc được. */
  function parseRubric(text, criteria) {
    let j = null;
    try { j = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { j = null; }
    if (!j || !Array.isArray(j.criteria)) return null;
    const rows = (criteria || []).map(function (c, i) {
      const hit = j.criteria.filter(function (x) { return x && String(x.name || '').trim().toLowerCase() === String(c.name).trim().toLowerCase(); })[0] || j.criteria[i] || {};
      return { name: c.name, max: c.max, score: int(hit.score, 0, c.max, 0), comment: clip(hit.comment, 300) };
    });
    return { rows: rows, total: rows.reduce(function (t, r) { return t + r.score; }, 0), max: rows.reduce(function (t, r) { return t + r.max; }, 0), overall: clip(j.overall, 500) };
  }

  /* ── Gợi ý nhiệm vụ: LUẬT trên máy, KHÔNG gọi AI (không gửi dữ liệu học tập đi đâu) ──
     input: { courses: [{ id, name, pct, next: { title, href } | null, started }], challengeLevels: [{ id, name, stars, unlocked }],
              missions: [{ id, name, score, href }], due: số câu cần ôn trong Sổ tay } */
  function suggestNext(input) {
    const out = [];
    const i = input || {};
    if ((i.due || 0) > 0) out.push({ kind: 'on-tap', title: 'Ôn ' + i.due + ' câu đến hạn trong Sổ tay câu sai', why: 'Ôn đúng lúc sắp quên giúp nhớ lâu nhất.' });
    const started = (i.courses || []).filter(function (c) { return c.started && c.next && c.pct < 100; })
      .sort(function (a, b) { return b.pct - a.pct; });
    if (started[0]) out.push({ kind: 'bai-hoc', title: 'Học tiếp ' + started[0].next.title, why: 'Công pháp "' + started[0].name + '" đã được ' + started[0].pct + '% — làm tiếp cho trọn.', href: started[0].next.href });
    const lv = (i.challengeLevels || []).filter(function (l) { return l.unlocked && l.stars < 3; })[0];
    if (lv) out.push({ kind: 'bi-canh', title: (lv.stars ? 'Lấy thêm sao ở ' : 'Vượt màn ') + lv.name, why: lv.stars ? 'Em đã có ' + lv.stars + '/3 sao.' : 'Màn này đã mở cho em.', href: lv.href });
    const ms = (i.missions || []).filter(function (m) { return (m.score || 0) < 60; })[0];
    if (ms) out.push({ kind: 'nhiem-vu', title: 'Làm nhiệm vụ ' + ms.name, why: 'Đạt từ 60 điểm để mở công trình mới trong thành phố.', href: ms.href });
    if (!started.length) {
      const first = (i.courses || []).filter(function (c) { return !c.started && c.next; })[0];
      if (first) out.push({ kind: 'bai-hoc', title: 'Bắt đầu ' + first.name, why: 'Em chưa học công pháp nào — bắt đầu từ bài đầu tiên.', href: first.next.href });
    }
    return out.slice(0, 4);
  }

  const api = { PUBLIC_TASKS: PUBLIC_TASKS, STAFF_TASKS: STAFF_TASKS, LANGS: LANGS, TASKS: TASKS, SYS: SYS, scrubPII: scrubPII, build: build, modeOf: modeOf, policy: policy, parseRubric: parseRubric, suggestNext: suggestNext };
  root.EduMentor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
