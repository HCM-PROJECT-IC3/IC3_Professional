/* ============================================================
   js/services/ai-assistant.js — USE CASE "hỏi Trợ lý AI" (tầng Application, Clean Architecture).
   Chỉ chứa LUẬT: bản đệm → key cá nhân → key của trường → báo cần key. Không DOM, không mạng,
   không localStorage — mọi thứ bên ngoài đi qua CỔNG (port) được truyền vào create(ports):

     keyStore.get()                       → { key, model }        key cá nhân (rỗng = chưa có)
     cache.get(k) / cache.put(k, text)                              lời giải đã có
     gemini.generate(key, model, built)   → Promise<string>        gọi thẳng Gemini; lỗi có e.kind
     school.ask(task, payload)            → Promise<{ text, cached }>  qua máy chủ trường (key GV); lỗi có e.kind

   Bộ nối (adapter) thật cho trình duyệt nằm ở js/services/ai-service.js (composition root);
   test dùng cổng giả: js/services/__tests__/ai-assistant.test.js.
   Phụ thuộc DUY NHẤT: js/services/ai-core.js (tầng Domain).
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduAICore;
  const aiErr = (kind, msg) => Object.assign(new Error(msg || (C && C.KIND_MSG[kind]) || 'Trợ lý AI gặp lỗi.'), { kind });

  function create(ports) {
    const { keyStore, cache, gemini, school } = ports;

    /**
     * Hỏi AI 1 việc. Trả { text, via: 'cache' | 'mine' | 'school' | 'school-cache' }.
     * Lỗi: 'safety' ném ngay; còn lại gom thành kind 'need-key' kèm .mine / .school (lỗi từng lớp).
     */
    async function ask(task, payload, opts) {
      const b = C.build(task, payload);
      const ck = C.cacheKey(task, b.payload);
      if (!(opts && opts.fresh)) { const hit = cache.get(ck); if (hit) return { text: hit, via: 'cache' }; }
      const me = keyStore.get();
      let mine = null;
      if (me.key) {
        try {
          const text = await gemini.generate(me.key, me.model, b);
          cache.put(ck, text);
          return { text, via: 'mine' };
        } catch (e) {
          if (e.kind === 'safety') throw e;
          mine = e; // hết hạn mức / key sai / bận → thử key của trường
        }
      }
      if (!school) throw Object.assign(aiErr('need-key', mine ? 'Key cá nhân: ' + mine.message : 'Chưa có key AI nào dùng được trên máy này.'), { mine, school: null });
      try {
        const d = await school.ask(task, b.payload);
        cache.put(ck, d.text);
        return { text: d.text, via: d.cached ? 'school-cache' : 'school' };
      } catch (s) {
        if (s.kind === 'safety') throw s;
        const noSchool = s.kind === 'no-key' || s.kind === 'no-school';
        const msg = mine ? 'Key cá nhân: ' + mine.message + (noSchool ? '' : ' Key của trường: ' + s.message)
          : noSchool ? 'Chưa có key AI nào dùng được trên máy này.' : s.message;
        throw Object.assign(aiErr('need-key', msg), { mine, school: s });
      }
    }

    /** Kiểm tra key: 1 câu rất ngắn. Model chỉ "nghĩ" mà không ra chữ (empty) vẫn tính là key dùng được. */
    async function testKey(key, model) {
      try {
        await gemini.generate(key, model, { system: 'Trả lời ngắn.', user: 'Trả lời đúng một từ: OK', json: false, maxTokens: 256, temperature: 0 });
      } catch (e) { if (e.kind !== 'empty') throw e; }
      return true;
    }

    return { ask, testKey };
  }

  global.EduAIAssistant = { create, aiErr };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.EduAIAssistant;
})(typeof window !== 'undefined' ? window : globalThis);
