/* Chấm 1 tệp học sinh nộp theo tiêu chí của project. Đọc tệp ngay trong trình duyệt, không gửi đi đâu.
   Điểm theo thang MOS: 1000 × (task tự chấm đúng / task tự chấm được); task chưa có tiêu chí = tự kiểm. */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Office = isNode ? require('./office-model.js') : root.MosOffice;
  const Checks = isNode ? require('./checks.js') : root.MosChecks;
  const getZip = () => (isNode ? require('../../js/vendor/jszip.min.js') : root.JSZip);

  const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

  async function loadModel(buffer, kind) {
    const head = new Uint8Array(buffer.slice(0, 4));
    if (OLE_MAGIC.every((b, i) => head[i] === b)) {
      throw Object.assign(new Error('Tệp đang được đặt mật khẩu (Encrypt) hoặc lưu sai định dạng — hệ thống không mở được để chấm.'), { code: 'encrypted' });
    }
    const zip = await getZip().loadAsync(buffer);
    return kind === 'xlsx' ? Office.loadXlsx(zip) : kind === 'docx' ? Office.loadDocx(zip) : Office.loadPptx(zip);
  }

  const isOle = buffer => { const h = new Uint8Array(buffer.slice(0, 4)); return OLE_MAGIC.every((b, i) => h[i] === b); };

  /**
   * @param {ArrayBuffer} buffer tệp học sinh nộp
   * @param {{tasks:Array, main:string}} project
   * @param {Object} rubric {taskNo: spec}
   * @param {{baseBuffer?:ArrayBuffer, baseModel?:Object, only?:number[]}} [opts] tệp đề gốc (Excel/Word) cho các tiêu chí so trước/sau;
   *   only = chỉ chấm các task này (chấm từng câu)
   */
  async function grade(buffer, project, rubric, opts) {
    const kind = (/\.(xlsx|docx|pptx)$/i.exec(project.main) || [, 'pptx'])[1].toLowerCase();
    // Task "Mã hoá bằng mật khẩu" (type *.encrypted): tệp đã mã hoá thì không đọc được nội dung — chỉ chấm task đó,
    // các task khác giữ kết quả lần chấm trước (trang ghi theo từng task).
    const encNos = Object.keys(rubric || {}).filter(no => /\.encrypted$/.test(rubric[no].type || '')).map(Number);
    if (encNos.length && isOle(buffer)) {
      const results = project.tasks.filter(t => encNos.includes(t.no) && (!opts || !opts.only || opts.only.includes(t.no)))
        .map(t => ({ no: t.no, status: 'pass', note: 'Tệp đã được mã hoá bằng mật khẩu. Các task khác giữ kết quả lần chấm trước khi mã hoá.', scope: rubric[t.no].scope || '' }));
      return summarize(results);
    }
    const model = await loadModel(buffer, kind);
    const ctx = {};
    if (opts && opts.baseModel) ctx.base = opts.baseModel; // đã phân tích sẵn (worker giữ lại giữa các lần chấm)
    else if (opts && opts.baseBuffer) {
      try { ctx.base = await loadModel(opts.baseBuffer, kind); } catch (e) { /* không có tệp gốc thì bỏ các phép so trước/sau */ }
    }
    const tasks = opts && opts.only ? project.tasks.filter(t => opts.only.includes(t.no)) : project.tasks;
    const results = tasks.map(t => {
      const spec = rubric && rubric[t.no];
      if (!spec) return { no: t.no, status: 'self', note: 'Em tự đối chiếu với hướng dẫn.' };
      if (/\.encrypted$/.test(spec.type || '')) return { no: t.no, status: 'fail', note: 'Tệp chưa được mã hoá bằng mật khẩu (File → Info → Protect → Encrypt with Password).', scope: spec.scope || '' };
      const r = Checks.run(spec, model, ctx);
      if (r.pass === null) return { no: t.no, status: 'self', note: r.note };
      return { no: t.no, status: r.pass ? 'pass' : 'fail', note: r.note, scope: spec.scope || '' };
    });
    return summarize(results);
  }

  function summarize(results) {
    const auto = results.filter(r => r.status !== 'self');
    const passed = auto.filter(r => r.status === 'pass').length;
    return { results, auto: auto.length, passed, self: results.length - auto.length,
      score: auto.length ? Math.round(1000 * passed / auto.length) : null };
  }

  const api = { grade, summarize, loadModel };
  if (isNode) module.exports = api;
  else root.MosGrader = api;
})(typeof window !== 'undefined' ? window : globalThis);
