/* ============================================================
   js/mos-grading-engine-pptx.js — Engine chấm điểm MOS Practice cho
   PowerPoint (Phase 1 mở rộng — pilot thứ 2 sau Excel).

   Khác với Excel (dùng ExcelJS đọc trực tiếp model workbook), PowerPoint
   KHÔNG có thư viện đọc-model vendor sẵn trong repo, nên engine này tự
   đọc thẳng XML bên trong file .pptx bằng JSZip (js/vendor/jszip.min.js)
   + regex trên text XML (KHÔNG dùng DOMParser — để cùng 1 bộ code chạy
   được cả trên trình duyệt lẫn Node.js khi viết test, xem
   scratch/mos-verify-pptx của phiên làm việc lúc build tính năng này).

   Cùng triết lý với js/mos-grading-engine.js: type không có checker
   tương ứng (hoặc type:"manual") LUÔN hiện "cần giáo viên xem thủ công",
   không tự chấm bừa. Schema XML dùng ở đây (DrawingML Table/Chart,
   ECMA-376 Part 1 §20-21) ổn định từ Office 2007 tới nay, nhưng vẫn có
   thể có biến thể hiếm gặp — mỗi checker cố gắng khoan dung nhất có thể
   (so khớp không phân biệt hoa/thường, khoảng trắng thừa, thứ tự cột
   biểu đồ) thay vì so khớp XML tuyệt đối.
   ============================================================ */
(function (root) {
  'use strict';

  function norm(s) {
    return (s ?? '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Nối toàn bộ text run <a:t>...</a:t> nằm trong 1 đoạn XML (dùng cho ô bảng, tiêu đề biểu đồ...). */
  function extractText(xmlFragment) {
    const matches = xmlFragment.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
    return matches.map(m => m.replace(/<\/?a:t>/g, '')).join('').trim();
  }

  function decodeXmlEntities(s) {
    return (s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  // ── Đọc thứ tự slide thật (theo p:sldIdLst) — không dùng cho checker hiện
  //    tại (checker quét toàn bộ slide/chart, không cần biết số thứ tự
  //    chính xác), nhưng để sẵn cho các task type sau này cần "đúng Slide N".
  async function getOrderedSlideNames(zip) {
    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!presXml || !relsXml) return [];
    const relMap = {};
    (relsXml.match(/<Relationship[^>]+>/g) || []).forEach(tag => {
      const id = tag.match(/Id="([^"]+)"/)?.[1];
      const target = tag.match(/Target="([^"]+)"/)?.[1];
      if (id && target) relMap[id] = target.replace(/^\.?\//, '');
    });
    const rIds = [...presXml.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)].map(m => m[1]);
    return rIds.map(id => relMap[id]).filter(Boolean).map(t => 'ppt/' + t.replace(/^ppt\//, ''));
  }

  async function getAllSlideTexts(zip) {
    const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n));
    const out = [];
    for (const n of names) out.push(await zip.file(n).async('string'));
    return out;
  }

  async function getAllChartXmls(zip) {
    const names = Object.keys(zip.files).filter(n => /^ppt\/charts\/chart\d+\.xml$/i.test(n));
    const out = [];
    for (const n of names) out.push(await zip.file(n).async('string'));
    return out;
  }

  const CHECKERS = {
    /**
     * params: { texts: [...] } — tìm 1 hàng bảng (a:tr) trên BẤT KỲ slide nào
     * có đúng thứ tự nội dung từng ô như params.texts (so khớp chuẩn hoá).
     */
    async tableRowValues(zip, params) {
      const slideTexts = await getAllSlideTexts(zip);
      const expected = params.texts.map(norm);
      for (const xml of slideTexts) {
        const rows = xml.match(/<a:tr[\s\S]*?<\/a:tr>/g) || [];
        for (const row of rows) {
          const cells = row.match(/<a:tc[\s\S]*?<\/a:tc>/g) || [];
          const cellTexts = cells.map(c => norm(decodeXmlEntities(extractText(c))));
          if (cellTexts.length === expected.length && cellTexts.every((t, i) => t === expected[i])) {
            return { passed: true, note: `Đã tìm thấy đúng hàng dữ liệu: ${params.texts.join(' | ')}.` };
          }
        }
      }
      return { passed: false, note: `Chưa tìm thấy hàng dữ liệu: ${params.texts.join(' | ')}.` };
    },

    /**
     * params: { series: [ { name, points: [{category, value}] } ] } — tìm
     * TRONG TOÀN BỘ chart đã chèn (không cần biết đúng slide nào) đủ các
     * series với đúng cặp (category, value), không quan trọng thứ tự.
     */
    async chartSeriesData(zip, params) {
      const charts = await getAllChartXmls(zip);
      if (charts.length === 0) return { passed: false, note: 'Chưa tìm thấy biểu đồ nào trong bài nộp.' };

      // Gộp series từ TẤT CẢ chart tìm được (học sinh có thể chèn đúng 1 chart).
      const foundSeries = [];
      charts.forEach(xml => {
        const serBlocks = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/g) || [];
        serBlocks.forEach(ser => {
          const txBlock = ser.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0] || '';
          const name = decodeXmlEntities((txBlock.match(/<c:v>([\s\S]*?)<\/c:v>/) || [])[1] || '');

          const catBlock = ser.match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0] || '';
          const valBlock = ser.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0] || '';
          const catPts = [...catBlock.matchAll(/<c:pt idx="(\d+)"[^>]*>\s*<c:v>([\s\S]*?)<\/c:v>/g)]
            .map(m => ({ idx: +m[1], text: decodeXmlEntities(m[2]) }));
          const valPts = [...valBlock.matchAll(/<c:pt idx="(\d+)"[^>]*>\s*<c:v>([\s\S]*?)<\/c:v>/g)]
            .map(m => ({ idx: +m[1], value: parseFloat(m[2]) }));

          const pointMap = {};
          catPts.forEach(c => { pointMap[c.idx] = { category: c.text }; });
          valPts.forEach(v => { pointMap[v.idx] = Object.assign(pointMap[v.idx] || {}, { value: v.value }); });

          foundSeries.push({ name, points: Object.values(pointMap) });
        });
      });

      const missing = [];
      params.series.forEach(expSer => {
        const match = foundSeries.find(f => norm(f.name) === norm(expSer.name));
        if (!match) { missing.push(`thiếu series "${expSer.name}"`); return; }
        expSer.points.forEach(expPt => {
          const got = match.points.find(p => norm(p.category) === norm(expPt.category));
          if (!got || Math.abs(Number(got.value) - Number(expPt.value)) > 0.001) {
            missing.push(`series "${expSer.name}" — "${expPt.category}": cần ${expPt.value}, có ${got ? got.value : '(không có)'}`);
          }
        });
      });

      return missing.length === 0
        ? { passed: true, note: 'Dữ liệu biểu đồ khớp đề bài.' }
        : { passed: false, note: 'Sai lệch: ' + missing.join('; ') + '.' };
    },

    /**
     * params: { title, dLblPos } — kiểm tra tiêu đề biểu đồ (c:title) và vị
     * trí nhãn dữ liệu (c:dLblPos, enum chuẩn OOXML: outEnd/inEnd/ctr/inBase...).
     */
    async chartTitleAndLabelPos(zip, params) {
      const charts = await getAllChartXmls(zip);
      if (charts.length === 0) return { passed: false, note: 'Chưa tìm thấy biểu đồ nào trong bài nộp.' };

      let titleOk = !params.title;
      let posOk = !params.dLblPos;
      let foundTitle = '';
      charts.forEach(xml => {
        if (params.title) {
          const titleBlock = xml.match(/<c:title>[\s\S]*?<\/c:title>/)?.[0];
          if (titleBlock) {
            const t = decodeXmlEntities(extractText(titleBlock));
            foundTitle = foundTitle || t;
            if (norm(t) === norm(params.title)) titleOk = true;
          }
        }
        if (params.dLblPos && new RegExp(`<c:dLblPos val="${params.dLblPos}"`, 'i').test(xml)) {
          posOk = true;
        }
      });

      if (titleOk && posOk) return { passed: true, note: 'Đã đặt đúng tiêu đề biểu đồ và vị trí nhãn dữ liệu.' };
      const problems = [];
      if (!titleOk) problems.push(`tiêu đề biểu đồ cần là "${params.title}"${foundTitle ? ` (hiện là "${foundTitle}")` : ' (chưa có tiêu đề)'}`);
      if (!posOk) problems.push(`vị trí nhãn dữ liệu cần là "${params.dLblPos}"`);
      return { passed: false, note: problems.join('; ') + '.' };
    },
  };

  /**
   * Chấm 1 file .pptx (đã nạp bằng JSZip.loadAsync(buffer)) theo danh sách task.
   * Trả về CÙNG hình dạng kết quả với js/mos-grading-engine.js (gradeWorkbook)
   * để js/mos-practice.js dùng chung 1 hàm renderResult() cho cả 2 môn.
   */
  async function gradePptx(zip, tasks) {
    const results = [];
    for (const task of tasks) {
      if (task.type === 'manual' || !CHECKERS[task.type]) {
        results.push({ id: task.id, label: task.label, manual: true, passed: null, note: 'Cần giáo viên xem thủ công.' });
        continue;
      }
      try {
        const r = await CHECKERS[task.type](zip, task.params || {});
        results.push({ id: task.id, label: task.label, manual: false, passed: !!r.passed, note: r.note || '' });
      } catch (err) {
        results.push({ id: task.id, label: task.label, manual: false, passed: false, note: 'Lỗi khi chấm: ' + err.message });
      }
    }
    const autoResults = results.filter(r => !r.manual);
    const passedCount = autoResults.filter(r => r.passed).length;
    const score = autoResults.length ? Math.round((passedCount / autoResults.length) * 100) : null;
    return {
      results,
      score,
      autoTotal: autoResults.length,
      passedCount,
      manualCount: results.length - autoResults.length,
    };
  }

  const api = { gradePptx, CHECKERS, getOrderedSlideNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MosGradingEnginePptx = api;
})(typeof window !== 'undefined' ? window : globalThis);
