/* Nạp MỌI câu hỏi trong data/ic3 (file khối { minitests: {...} } + file minitest dạng mảng), bỏ trùng
   theo uid + type. Dùng chung cho test chấm điểm JS và Apps Script. Không phải file test. */
'use strict';
const fs = require('fs');
const path = require('path');

function walkFiles(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkFiles(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function collect(node, out) {
  if (Array.isArray(node)) {
    node.forEach((x) => {
      if (x && typeof x === 'object' && typeof x.type === 'string' && typeof x.question === 'string') out.push(x);
      else collect(x, out);
    });
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach((v) => collect(v, out));
  }
}

function loadBank(root) {
  const seen = new Set();
  const out = [];
  walkFiles(path.join(root, 'data', 'ic3'), []).forEach((f) => {
    let data;
    try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return; }
    const qs = [];
    collect(data, qs);
    qs.forEach((q) => {
      const key = (q.uid || q.id || q.question) + '|' + q.type;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(q);
    });
  });
  return out;
}

module.exports = { loadBank };
