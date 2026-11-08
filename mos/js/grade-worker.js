/* Chấm bài trong luồng riêng (Web Worker) để trang không bị đứng khi đọc tệp Office lớn.
   Nhận { id, buffer, project, rubric, only, baseKey, baseBuffer? } → trả { id, ok, result | error, code }.
   Tệp đề gốc (Excel/Word) chỉ phân tích 1 lần cho mỗi project rồi giữ trong bộ nhớ của worker. */
/* global importScripts, MosGrader */
'use strict';
importScripts('jszip.min.js', 'xml.js', 'office-model.js', 'checks.js', 'grader.js');

const bases = new Map(); // baseKey → Promise<model|null>
const kindOf = main => (/\.(xlsx|docx|pptx)$/i.exec(main) || [, 'pptx'])[1].toLowerCase();

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'base') { // nhận trước tệp gốc (tải sẵn) — phân tích luôn khi rảnh
    if (m.baseBuffer && !bases.has(m.baseKey)) bases.set(m.baseKey, MosGrader.loadModel(m.baseBuffer, kindOf(m.main)).catch(() => null));
    return;
  }
  try {
    if (m.baseBuffer && !bases.has(m.baseKey)) bases.set(m.baseKey, MosGrader.loadModel(m.baseBuffer, kindOf(m.project.main)).catch(() => null));
    const baseModel = m.baseKey && bases.has(m.baseKey) ? await bases.get(m.baseKey) : null;
    const result = await MosGrader.grade(m.buffer, m.project, m.rubric || {}, { baseModel, only: m.only });
    self.postMessage({ id: m.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err), code: err && err.code });
  }
};
