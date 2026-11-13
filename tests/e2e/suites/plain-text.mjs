// 6 hàm "lấy chữ thuần" (plain/stripHtml) — vá 12/11/2026 sang DOMParser:
//  (1) <img onerror>, <svg onbegin> trong nội dung KHÔNG chạy;
//  (2) chữ ra GIỐNG HỆT cách cũ (div.innerHTML) trên mọi chuỗi HTML của data/ic3 (dữ liệu tin cậy → chạy cách cũ làm chuẩn được).
const FILES = ['js/daily-challenge.js', 'js/kid-mode.js', 'js/learning-hub.js', 'js/memory-cards.js', 'js/services/question-bank-lookup.js', 'js/exam-builder.js'];
const BANK = ['IC3__LV1', 'IC3__LV2', 'IC3__LV3', 'Spark__LV1', 'Spark__LV2', 'Spark__LV3', 'MOS__Word', 'MOS__Excel', 'MOS__PowerPoint'];

export default async function ({ base, page, check }) {
  const p = await page();
  await p.goto(base + 'robots.txt');
  const res = await p.evaluate(async (files, bank) => {
    const strings = [];
    const walk = (v) => {
      if (typeof v === 'string') { if (/[<&]/.test(v)) strings.push(v); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    for (const f of bank) walk(await (await fetch(`/data/ic3/${f}.json`)).json());
    const uniq = [...new Set(strings)];
    const reference = (html) => { const d = document.createElement('div'); d.innerHTML = String(html ?? ''); return (d.textContent || '').trim(); };
    const expected = uniq.map(reference);
    const out = { count: uniq.length };
    for (const file of files) {
      const src = await (await fetch('/' + file)).text();
      const m = src.match(/(?:function (?:plain|stripHtml)\((?:html|s)\)\s*\{[^\n]*\}|const plain = \(html\) => \{[^\n]*\};)/);
      if (!m) { out[file] = { error: 'không tìm thấy hàm' }; continue; }
      const body = m[0].startsWith('const') ? m[0].replace('const plain =', 'return') : `${m[0]}; return ${m[0].match(/function (\w+)/)[1]};`;
      const fn = new Function(body)();
      window.__hit = 0;
      fn('<img src="x" onerror="window.__hit++">');
      fn('<svg><animate onbegin="window.__hit++" attributeName="x" dur="1s"></animate></svg>');
      await new Promise((r) => setTimeout(r, 600));
      const diff = uniq.map((s, i) => (fn(s) === expected[i] ? null : s.slice(0, 80))).filter(Boolean);
      out[file] = { executed: window.__hit, diff: diff.length, example: diff[0] };
    }
    return out;
  }, FILES, BANK);
  check(`đọc được chuỗi HTML trong ngân hàng đề (${res.count})`, res.count > 50, res.count);
  for (const f of FILES) {
    const r = res[f];
    check(`${f}: nội dung độc không chạy`, r && !r.error && r.executed === 0, r);
    check(`${f}: chữ ra giống hệt cách cũ`, r && !r.error && r.diff === 0, r);
  }
  await p.closeAll();
}
