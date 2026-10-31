// Xem nhanh một tệp .xlsx/.pptx qua mô hình của mos/js/office-model.js — dùng khi soạn tiêu chí chấm.
//   node mos/tools/inspect.js mos/files/excel/t3/p1/Project_1.xlsx [Tên sheet ...]
const fs = require('fs');
const path = require('path');
const JSZip = require('../../js/vendor/jszip.min.js');
const Office = require('../js/office-model.js');

(async () => {
  const [file, ...want] = process.argv.slice(2);
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  if (/\.docx$/i.test(file)) {
    const d = await Office.loadDocx(zip);
    const cut = s => String(s).replace(/\s+/g, ' ').slice(0, 110);
    console.log('props', JSON.stringify({ title: d.props.title, subject: d.props.subject }), 'comments', d.comments, 'track', d.settings.trackRevisions,
      'footnotes', d.footnotes.length, 'endnotes', d.endnotes.length, 'breaks', JSON.stringify(d.breaks), 'bg', JSON.stringify(d.background));
    console.log('fields', JSON.stringify(d.fields.map(cut)));
    console.log('bookmarks', d.bookmarks.join(', '));
    console.log('revisions', JSON.stringify(d.revisions.map(r => r.kind + ':' + cut(r.text))));
    d.sections.forEach((s, i) => console.log(`section ${i}`, JSON.stringify({ cols: s.cols, titlePg: s.titlePg, orient: s.orient,
      headers: s.headers.map(h => h.which + ':' + cut(h.text) + (h.watermark ? ' WM=' + h.watermark : '')), footers: s.footers.map(h => h.which + ':' + cut(h.text) + ' ' + h.fields.join('|')) })));
    d.drawings.forEach(g => console.log('drawing', JSON.stringify(Object.assign({}, g, { text: cut(g.text) }))));
    d.blocks.forEach((b, i) => console.log(`${String(i).padStart(3)} ${b.kind === 'p' ? `[${b.style}${b.num ? ' num' + b.num.numId + '/' + b.num.ilvl : ''}${b.spacing['w:line'] ? ' line' + b.spacing['w:line'] : ''}]` : `TABLE ${b.rows.length}x${b.rows[0]?.length} cap="${b.caption}" grid=${b.grid.join(',')}`} ${cut(b.text)}`));
    return;
  }
  if (/\.pptx$/i.test(file)) {
    const p = await Office.loadPptx(zip);
    console.log('size', p.size, 'show', p.show, 'theme', p.master?.theme, 'sections', JSON.stringify(p.sections));
    console.log('props', JSON.stringify(p.props));
    console.log('layouts', p.master?.layouts.map(l => l.name).join(' | '));
    for (const s of p.slides) {
      console.log(`\n# slide ${s.index}${s.hidden ? ' (ẩn)' : ''} layout="${s.layout}" title="${s.title.replace(/\n/g, ' ')}" trans=${JSON.stringify(s.transitionXml)} anim=${s.animations.length} bg=${JSON.stringify(s.bg)} ink=${s.ink}`);
      for (const sh of s.shapes) console.log(`   [${sh.type}${sh.ph ? ':' + sh.ph : ''}] "${sh.name}" geom=${sh.geom} pos=${sh.x},${sh.y} ${sh.cx}x${sh.cy}${sh.descr ? ' alt="' + sh.descr + '"' : ''}${sh.table ? ' TABLE ' + JSON.stringify(sh.table.rows.map(r => r.map(c => c.text))) : ''}${sh.chart ? ' CHART ' + JSON.stringify(sh.chart.series.map(x => x.name)) : ''} :: ${sh.text.slice(0, 80).replace(/\n/g, ' / ')}`);
    }
    return;
  }
  const wb = await Office.loadXlsx(zip);
  console.log('names', JSON.stringify(wb.definedNames));
  console.log('props', JSON.stringify(wb.props));
  for (const s of wb.sheets) {
    if (want.length && !want.includes(s.name)) continue;
    console.log(`\n# ${s.name} [${s.kind}${s.state !== 'visible' ? ', ' + s.state : ''}] pane=${JSON.stringify(s.pane)} af=${JSON.stringify(s.autoFilter)} merges=${JSON.stringify(s.merges)}`);
    for (const t of s.tables || []) console.log('   table', JSON.stringify(Object.assign({}, t, { columns: t.columns.join('|') })));
    for (const d of s.drawings || []) console.log('   drawing', d.kind, d.name, d.descr, JSON.stringify(d.from), d.chart ? JSON.stringify(Object.assign({}, d.chart, { series: d.chart.series.map(x => [x.name, x.nameRef, x.catRef, x.valRef, x.showVal]) })) : '');
    if (s.cf && s.cf.length) console.log('   cf', JSON.stringify(s.cf));
    if (s.sparklines && s.sparklines.length) console.log('   spark', JSON.stringify(s.sparklines));
    if (s.cols && s.cols.length) console.log('   cols', JSON.stringify(s.cols));
    const byRow = {};
    for (const [a, c] of Object.entries(s.cells || {})) {
      const r = +a.replace(/^[A-Z]+/, '');
      (byRow[r] = byRow[r] || []).push(`${a}=${c.f ? '{' + c.f + '}' : ''}${JSON.stringify(c.v)}`);
    }
    for (const r of Object.keys(byRow).sort((a, b) => a - b)) console.log(`   ${r}${s.rows[r]?.hidden ? '(ẩn)' : ''}: ${byRow[r].join('  ')}`.slice(0, 260));
  }
})().catch(e => { console.error(e); process.exit(1); });
