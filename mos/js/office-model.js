/* Đọc .xlsx / .pptx (đã giải nén bằng JSZip) thành mô hình gọn để mos/js/checks.js kiểm tra.
   Chỉ đọc những phần các tiêu chí chấm cần; giá trị công thức lấy từ bộ đệm <v> Excel đã lưu. */
(function (root) {
  'use strict';

  const X = typeof module !== 'undefined' && module.exports ? require('./xml.js') : root.MosXml;

  // ---------------------------------------------------------------- tiện ích chung

  function dirOf(p) { return p.slice(0, p.lastIndexOf('/') + 1); }
  function resolve(base, target) {
    if (target[0] === '/') return target.slice(1);
    const parts = (dirOf(base) + target).split('/');
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
    return out.join('/');
  }
  function relsPath(p) { return dirOf(p) + '_rels/' + p.slice(dirOf(p).length) + '.rels'; }

  async function readXml(zip, p) {
    const f = zip.file(p);
    return f ? X.parse(await f.async('string')) : null;
  }
  async function readRels(zip, p) {
    const doc = await readXml(zip, relsPath(p));
    const out = {};
    X.all(doc, 'Relationship').forEach(r => {
      out[r.attrs.Id] = { target: r.attrs.TargetMode === 'External' ? r.attrs.Target : resolve(p, r.attrs.Target),
        type: (r.attrs.Type || '').split('/').pop(), external: r.attrs.TargetMode === 'External' };
    });
    return out;
  }
  const rid = n => n && (n.attrs['r:id'] || n.attrs['r:embed']);

  function colNum(letters) {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }
  function colName(n) {
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function parseAddr(a) {
    const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(a.trim());
    if (!m) throw new Error('Địa chỉ ô không hợp lệ: ' + a);
    return { col: colNum(m[1]), row: +m[2] };
  }
  function expandRange(range) {
    const [a, b] = range.replace(/\$/g, '').split(':');
    const s = parseAddr(a), e = parseAddr(b || a);
    const out = [];
    for (let r = Math.min(s.row, e.row); r <= Math.max(s.row, e.row); r++)
      for (let c = Math.min(s.col, e.col); c <= Math.max(s.col, e.col); c++) out.push(colName(c) + r);
    return out;
  }

  async function loadProps(zip) {
    const core = await readXml(zip, 'docProps/core.xml');
    const app = await readXml(zip, 'docProps/app.xml');
    const custom = await readXml(zip, 'docProps/custom.xml');
    const props = {};
    if (core) for (const c of X.first(core, 'coreProperties')?.children || []) props[c.local] = X.text(c).trim();
    if (app) for (const c of X.first(app, 'Properties')?.children || []) if (!c.children.length) props[c.local] = c.text.trim();
    props.custom = {};
    X.all(custom, 'property').forEach(p => { props.custom[p.attrs.name] = X.text(p).trim(); });
    return props;
  }

  // ---------------------------------------------------------------- biểu đồ (dùng chung xlsx + pptx)

  async function loadChart(zip, p) {
    const doc = await readXml(zip, p);
    if (!doc) return null;
    const chart = X.first(doc, 'c:chart');
    const plot = X.first(chart, 'c:plotArea');
    const types = (plot?.children || []).filter(c => /Chart$/.test(c.local)).map(c => c.local);
    const typeNode = (plot?.children || []).find(c => /Chart$/.test(c.local));
    const val = (n, name) => X.kid(n, name)?.attrs.val;
    const series = X.all(plot, 'c:ser').map(s => ({
      name: X.text(X.first(X.kid(s, 'c:tx'), 'c:v')) || X.text(X.kid(s, 'c:tx'), 'a:t'),
      nameRef: X.text(X.first(X.kid(s, 'c:tx'), 'c:f')),
      catRef: X.text(X.first(X.kid(s, 'c:cat'), 'c:f')),
      valRef: X.text(X.first(X.kid(s, 'c:val'), 'c:f')),
      cats: X.all(X.kid(s, 'c:cat'), 'c:pt').map(pt => X.text(X.kid(pt, 'c:v'))),
      vals: X.all(X.kid(s, 'c:val'), 'c:pt').map(pt => X.text(X.kid(pt, 'c:v'))),
      showVal: X.all(s, 'c:showVal').some(n => n.attrs.val === '1'),
    }));
    const titleNode = X.kid(chart, 'c:title');
    const axes = (plot?.children || []).filter(c => /Ax$/.test(c.local)).map(a => ({
      kind: a.local, pos: val(a, 'c:axPos'), deleted: val(a, 'c:delete') === '1',
      title: X.text(X.kid(a, 'c:title'), 'a:t'),
    }));
    const dTable = X.kid(plot, 'c:dTable');
    const rels = await readRels(zip, p);
    let colorStyle = null, chartStyle = null;
    for (const r of Object.values(rels)) {
      if (r.type === 'chartColorStyle') colorStyle = X.first(await readXml(zip, r.target), 'colorStyle')?.attrs.id || null;
      if (r.type === 'chartStyle') chartStyle = X.first(await readXml(zip, r.target), 'chartStyle')?.attrs.id || null;
    }
    // Kiểu biểu đồ: <c:style> hoặc <mc:AlternateContent>/<c14:style>.
    const styleNode = X.first(doc, 'c14:style') || X.first(doc, 'c:style');
    return {
      path: p, types, barDir: val(typeNode, 'c:barDir'), grouping: val(typeNode, 'c:grouping'),
      title: X.text(titleNode, 'a:t') || (titleNode && series.length === 1 ? series[0].name : ''),
      hasTitle: !!titleNode && val(chart, 'c:autoTitleDeleted') !== '1',
      legend: !!X.kid(chart, 'c:legend'), legendPos: val(X.kid(chart, 'c:legend'), 'c:legendPos'),
      series, axes, showVal: series.some(s => s.showVal) || X.all(X.kid(typeNode, 'c:dLbls'), 'c:showVal').some(n => n.attrs.val === '1'),
      dTable: dTable ? { showKeys: val(dTable, 'c:showKeys') === '1' } : null,
      style: styleNode?.attrs.val || null, colorStyle, chartStyle,
      is3d: types.some(t => /3D/.test(t)),
    };
  }

  // ---------------------------------------------------------------- XLSX

  async function loadXlsx(zip) {
    const wbPath = 'xl/workbook.xml';
    const wb = await readXml(zip, wbPath);
    if (!wb) throw new Error('Không phải tệp Excel (.xlsx) hợp lệ.');
    const wbRels = await readRels(zip, wbPath);

    const sst = [];
    const sstDoc = await readXml(zip, 'xl/sharedStrings.xml');
    X.all(sstDoc, 'si').forEach(si => sst.push(X.text(si, 't')));

    const styles = await loadStyles(zip);
    const definedNames = X.all(wb, 'definedName').map(d => ({
      name: d.attrs.name, localSheetId: d.attrs.localSheetId != null ? +d.attrs.localSheetId : null, ref: d.text.trim(),
    }));

    const sheets = [];
    for (const s of X.all(wb, 'sheet')) {
      const rel = wbRels[rid(s)];
      if (!rel) continue;
      const sheet = { name: s.attrs.name, state: s.attrs.state || 'visible', path: rel.target,
        kind: rel.type === 'chartsheet' ? 'chart' : 'work' };
      Object.assign(sheet, sheet.kind === 'chart' ? await loadChartSheet(zip, rel.target) : await loadWorksheet(zip, rel.target, sst, styles));
      sheets.push(sheet);
    }
    const tables = sheets.flatMap(s => (s.tables || []).map(t => Object.assign({ sheet: s.name }, t)));
    return { kind: 'xlsx', sheets, definedNames, tables, styles, props: await loadProps(zip),
      sheet: name => sheets.find(s => s.name.toLowerCase() === String(name).toLowerCase()) || null,
      charts: () => sheets.flatMap(s => (s.drawings || []).filter(d => d.chart).map(d => Object.assign({ sheet: s.name, anchor: d }, d.chart))) };
  }

  async function loadStyles(zip) {
    const doc = await readXml(zip, 'xl/styles.xml');
    const numFmts = {};
    X.all(doc, 'numFmt').forEach(n => { numFmts[n.attrs.numFmtId] = n.attrs.formatCode; });
    const fonts = X.kids(X.first(doc, 'fonts'), 'font').map(f => ({
      b: !!X.kid(f, 'b') && X.kid(f, 'b').attrs.val !== '0', i: !!X.kid(f, 'i'), sz: X.kid(f, 'sz')?.attrs.val,
      name: X.kid(f, 'name')?.attrs.val, color: X.kid(f, 'color')?.attrs || null,
    }));
    const fills = X.kids(X.first(doc, 'fills'), 'fill').map(f => {
      const p = X.kid(f, 'patternFill');
      return { pattern: p?.attrs.patternType || 'none', fg: X.kid(p, 'fgColor')?.attrs || null };
    });
    const xf = n => ({
      numFmtId: n.attrs.numFmtId || '0', fontId: +(n.attrs.fontId || 0), fillId: +(n.attrs.fillId || 0),
      borderId: +(n.attrs.borderId || 0), xfId: +(n.attrs.xfId || 0),
      align: X.kid(n, 'alignment')?.attrs || {},
    });
    const cellXfs = X.kids(X.first(doc, 'cellXfs'), 'xf').map(xf);
    const cellStyles = X.kids(X.first(doc, 'cellStyles'), 'cellStyle').map(c => ({ name: c.attrs.name, xfId: +c.attrs.xfId }));
    return { numFmts, fonts, fills, cellXfs, cellStyles,
      fmtCode(id) {
        const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'm/d/yyyy' };
        return numFmts[id] ?? BUILTIN[id] ?? '';
      },
      styleName(s) {
        const x = cellXfs[s || 0];
        return x ? (cellStyles.find(c => c.xfId === x.xfId)?.name || '') : '';
      },
    };
  }

  async function loadWorksheet(zip, p, sst, styles) {
    const doc = await readXml(zip, p);
    const ws = X.first(doc, 'worksheet');
    const rels = await readRels(zip, p);
    const cells = {};
    const rows = {};
    for (const r of X.all(X.kid(ws, 'sheetData'), 'row')) {
      rows[+r.attrs.r] = { hidden: r.attrs.hidden === '1' || r.attrs.hidden === 'true', ht: r.attrs.ht ? +r.attrs.ht : null,
        customHeight: r.attrs.customHeight === '1' };
      for (const c of X.kids(r, 'c')) {
        const t = c.attrs.t || 'n';
        const vNode = X.kid(c, 'v');
        const fNode = X.kid(c, 'f');
        let v = vNode ? vNode.text : null;
        if (t === 's' && v != null) v = sst[+v];
        else if (t === 'inlineStr') v = X.text(X.kid(c, 'is'), 't');
        else if (t === 'b') v = v === '1';
        else if (t === 'n' && v != null && v !== '') v = +v;
        cells[c.attrs.r] = { v, t, s: +(c.attrs.s || 0),
          f: fNode ? (fNode.text || (fNode.attrs.t === 'shared' ? '(shared)' : '')) : null,
          fShared: fNode?.attrs.t === 'shared' ? fNode.attrs.si : null };
      }
    }
    const view = X.first(ws, 'sheetView');
    const pane = X.kid(view, 'pane');
    const cols = X.kids(X.kid(ws, 'cols'), 'col').map(c => ({ min: +c.attrs.min, max: +c.attrs.max,
      width: c.attrs.width ? +c.attrs.width : null, hidden: c.attrs.hidden === '1', custom: c.attrs.customWidth === '1' }));
    const cf = X.kids(ws, 'conditionalFormatting').map(n => ({ sqref: n.attrs.sqref, rules: X.kids(n, 'cfRule').map(cfRule) }));
    // Định dạng có điều kiện kiểu mới (x14) + sparkline nằm trong <extLst>.
    X.all(ws, 'x14:conditionalFormatting').forEach(n => cf.push({
      sqref: X.text(X.kid(n, 'xm:sqref')), rules: X.kids(n, 'x14:cfRule').map(cfRule) }));
    const sparklines = X.all(ws, 'x14:sparklineGroup').map(g => ({
      type: g.attrs.type || 'line',
      items: X.all(g, 'x14:sparkline').map(s => ({ f: X.text(X.kid(s, 'xm:f')), sqref: X.text(X.kid(s, 'xm:sqref')) })),
    }));
    const tables = [];
    for (const tp of X.all(X.kid(ws, 'tableParts'), 'tablePart')) {
      const tdoc = await readXml(zip, rels[rid(tp)].target);
      const t = X.first(tdoc, 'table');
      const si = X.kid(t, 'tableStyleInfo');
      tables.push({ name: t.attrs.name, displayName: t.attrs.displayName, ref: t.attrs.ref,
        style: si?.attrs.name || '', rowStripes: si?.attrs.showRowStripes === '1', colStripes: si?.attrs.showColumnStripes === '1',
        firstCol: si?.attrs.showFirstColumn === '1', lastCol: si?.attrs.showLastColumn === '1',
        totalsRow: +(t.attrs.totalsRowCount || 0) > 0 || t.attrs.totalsRowShown === '1' && !!X.first(t, 'totalsRowFunction'),
        headerRow: t.attrs.headerRowCount !== '0',
        autoFilter: !!X.kid(t, 'autoFilter'), filters: X.all(X.kid(t, 'autoFilter'), 'filterColumn').length,
        columns: X.all(t, 'tableColumn').map(c => c.attrs.name) });
    }
    const drawings = [];
    for (const d of X.kids(ws, 'drawing')) drawings.push(...await loadDrawing(zip, rels[rid(d)].target));
    const af = X.kid(ws, 'autoFilter');
    const sortState = X.first(ws, 'sortState');
    return {
      cells, rows, cols, cf, sparklines, tables, drawings,
      pane: pane ? { xSplit: +(pane.attrs.xSplit || 0), ySplit: +(pane.attrs.ySplit || 0), state: pane.attrs.state || '', topLeft: pane.attrs.topLeftCell } : null,
      view: view?.attrs || {},
      autoFilter: af ? { ref: af.attrs.ref, filters: X.kids(af, 'filterColumn').length } : null,
      sortState: sortState ? X.kids(sortState, 'sortCondition').map(s => ({ ref: s.attrs.ref, descending: s.attrs.descending === '1' })) : [],
      merges: X.all(X.kid(ws, 'mergeCells'), 'mergeCell').map(m => m.attrs.ref),
      hyperlinks: X.all(X.kid(ws, 'hyperlinks'), 'hyperlink').map(h => ({ ref: h.attrs.ref, location: h.attrs.location,
        display: h.attrs.display, tooltip: h.attrs.tooltip, target: rels[rid(h)]?.target })),
      pageSetup: X.kid(ws, 'pageSetup')?.attrs || {},
      printOptions: X.kid(ws, 'printOptions')?.attrs || {},
      headerFooter: X.kid(ws, 'headerFooter') ? { header: X.text(X.kid(X.kid(ws, 'headerFooter'), 'oddHeader')), footer: X.text(X.kid(X.kid(ws, 'headerFooter'), 'oddFooter')) } : null,
      dataValidations: X.all(X.kid(ws, 'dataValidations'), 'dataValidation').map(v => Object.assign({}, v.attrs, { formula1: X.text(X.kid(v, 'formula1')) })),
      cell(addr) { return cells[addr.replace(/\$/g, '').toUpperCase()] || null; },
      value(addr) { const c = this.cell(addr); return c ? c.v : null; },
      styleOf(addr) { const c = this.cell(addr); return styles.cellXfs[c ? c.s : 0] || {}; },
      colWidth(n) { const c = cols.find(x => n >= x.min && n <= x.max); return c ? c.width : null; },
    };
  }

  function cfRule(r) {
    const icon = X.first(r, 'iconSet');
    return { type: r.attrs.type, operator: r.attrs.operator, priority: r.attrs.priority,
      iconSet: icon ? (icon.attrs.iconSet || '3TrafficLights1') : null,
      formula: X.all(r, 'formula').map(f => f.text).concat(X.all(r, 'xm:f').map(f => f.text)),
      dataBar: !!X.first(r, 'dataBar'), colorScale: !!X.first(r, 'colorScale') };
  }

  async function loadDrawing(zip, p) {
    const doc = await readXml(zip, p);
    const rels = await readRels(zip, p);
    const out = [];
    const anchors = (X.first(doc, 'xdr:wsDr')?.children || []).filter(a => /Anchor$/.test(a.local));
    for (const a of anchors) {
      const cNvPr = X.first(a, 'xdr:cNvPr');
      const from = X.kid(a, 'xdr:from');
      const gf = X.first(a, 'c:chart');
      const item = { name: cNvPr?.attrs.name || '', descr: cNvPr?.attrs.descr || '', title: cNvPr?.attrs.title || '',
        from: from ? { col: +X.text(X.kid(from, 'xdr:col')), row: +X.text(X.kid(from, 'xdr:row')) } : null,
        kind: X.kid(a, 'xdr:pic') ? 'pic' : gf ? 'chart' : X.kid(a, 'xdr:sp') ? 'shape' : 'other' };
      if (gf) item.chart = await loadChart(zip, rels[rid(gf)].target);
      out.push(item);
    }
    return out;
  }

  async function loadChartSheet(zip, p) {
    const doc = await readXml(zip, p);
    const rels = await readRels(zip, p);
    const d = X.first(doc, 'drawing');
    return { drawings: d ? await loadDrawing(zip, rels[rid(d)].target) : [], cells: {}, rows: {}, cols: [], tables: [],
      cell: () => null, value: () => null };
  }

  // ---------------------------------------------------------------- PPTX

  async function loadPptx(zip) {
    const presPath = 'ppt/presentation.xml';
    const pres = await readXml(zip, presPath);
    if (!pres) throw new Error('Không phải tệp PowerPoint (.pptx) hợp lệ.');
    const rels = await readRels(zip, presPath);
    const sz = X.first(pres, 'p:sldSz');
    const slides = [];
    const idToIndex = {};
    for (const s of X.all(X.first(pres, 'p:sldIdLst'), 'p:sldId')) {
      idToIndex[s.attrs.id] = slides.length + 1;
      slides.push(await loadSlide(zip, rels[rid(s)].target, slides.length + 1));
    }
    const sections = X.all(pres, 'p14:section').map(s => ({ name: s.attrs.name,
      slides: X.all(s, 'p14:sldId').map(i => idToIndex[i.attrs.id]).filter(Boolean) }));
    const customShows = X.all(pres, 'p:custShow').map(c => ({ name: c.attrs.name,
      slides: X.all(c, 'p:sld').map(s => slides.findIndex(sl => sl.path === rels[rid(s)]?.target) + 1) }));
    const presProps = await readXml(zip, 'ppt/presProps.xml');
    const showPr = X.first(presProps, 'p:showPr');
    const masterRel = Object.values(rels).find(r => r.type === 'slideMaster');
    const master = masterRel ? await loadMaster(zip, masterRel.target) : null;
    return {
      kind: 'pptx', slides, sections, customShows, master,
      size: sz ? { cx: +sz.attrs.cx, cy: +sz.attrs.cy, type: sz.attrs.type || '' } : null,
      show: showPr ? { loop: showPr.attrs.loop === '1', useTimings: showPr.attrs.useTimings !== '0', showNarration: showPr.attrs.showNarration !== '0',
        type: X.kid(showPr, 'p:browse') ? 'browse' : X.kid(showPr, 'p:kiosk') ? 'kiosk' : 'present',
        browseScrollbar: X.kid(showPr, 'p:browse')?.attrs.showScrollbar !== '0' } : { type: 'present', useTimings: true },
      props: await loadProps(zip),
      hasComments: Object.keys(zip.files).some(f => /^ppt\/(comments|modernComment)/i.test(f)),
      slide: n => n === 'last' ? slides[slides.length - 1] : slides[n - 1] || null,
    };
  }

  async function loadMaster(zip, p) {
    const doc = await readXml(zip, p);
    const rels = await readRels(zip, p);
    const themeRel = Object.values(rels).find(r => r.type === 'theme');
    const theme = themeRel ? await readXml(zip, themeRel.target) : null;
    const layouts = [];
    for (const r of Object.values(rels).filter(r => r.type === 'slideLayout')) {
      const l = await readXml(zip, r.target);
      layouts.push({ path: r.target, name: X.first(l, 'p:cSld')?.attrs.name || '',
        placeholders: X.all(l, 'p:ph').map(ph => ph.attrs.type || 'body') });
    }
    const fontScheme = X.first(theme, 'a:fontScheme');
    return { path: p, layouts,
      theme: theme ? { name: X.first(theme, 'a:theme')?.attrs.name || '',
        fontScheme: fontScheme?.attrs.name || '',
        majorFont: X.first(X.first(fontScheme, 'a:majorFont'), 'a:latin')?.attrs.typeface || '',
        minorFont: X.first(X.first(fontScheme, 'a:minorFont'), 'a:latin')?.attrs.typeface || '',
        colorScheme: X.first(theme, 'a:clrScheme')?.attrs.name || '' } : null,
      bulletPictures: X.all(X.first(doc, 'p:txStyles'), 'a:buBlip').length,
      xml: doc };
  }

  async function loadSlide(zip, p, index) {
    const doc = await readXml(zip, p);
    const rels = await readRels(zip, p);
    const sld = X.first(doc, 'p:sld');
    const layoutRel = Object.values(rels).find(r => r.type === 'slideLayout');
    const layoutDoc = layoutRel ? await readXml(zip, layoutRel.target) : null;
    const shapes = [];
    const tree = X.first(sld, 'p:spTree');
    const walk = (parent, group) => {
      for (const n of parent.children) {
        if (!['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(n.local)) continue;
        const nv = X.first(n, 'p:cNvPr');
        const ph = X.first(n, 'p:ph');
        const xfrm = X.kid(X.kid(n, 'p:spPr') || X.kid(n, 'p:grpSpPr'), 'a:xfrm') || X.kid(n, 'p:xfrm');
        const off = X.kid(xfrm, 'a:off'), ext = X.kid(xfrm, 'a:ext');
        const shape = {
          type: n.local, name: nv?.attrs.name || '', descr: nv?.attrs.descr || '', hidden: nv?.attrs.hidden === '1', group: group || null,
          ph: ph ? (ph.attrs.type || 'body') : null, geom: X.first(X.kid(n, 'p:spPr'), 'a:prstGeom')?.attrs.prst || null,
          x: off ? +off.attrs.x : null, y: off ? +off.attrs.y : null, cx: ext ? +ext.attrs.cx : null, cy: ext ? +ext.attrs.cy : null,
          rot: xfrm?.attrs.rot ? +xfrm.attrs.rot / 60000 : 0,
          text: X.all(n, 'a:p').map(par => X.text(par, 'a:t')).filter(Boolean).join('\n'),
          paragraphs: X.all(X.kid(n, 'p:txBody'), 'a:p').map(par => ({ text: X.text(par, 'a:t'), pPr: X.kid(par, 'a:pPr')?.attrs || {},
            runs: X.kids(par, 'a:r').map(r => Object.assign({ text: X.text(r, 'a:t') }, X.kid(r, 'a:rPr')?.attrs || {},
              { shadow: !!X.first(X.kid(r, 'a:rPr'), 'a:outerShdw'), fill: X.first(X.kid(X.kid(r, 'a:rPr'), 'a:solidFill'), 'a:srgbClr')?.attrs.val
                || X.first(X.kid(X.kid(r, 'a:rPr'), 'a:solidFill'), 'a:schemeClr')?.attrs.val || null })) })),
          effects: { outerShadow: !!X.first(X.kid(n, 'p:spPr'), 'a:outerShdw'), innerShadow: !!X.first(X.kid(n, 'p:spPr'), 'a:innerShdw'),
            styleRef: !!X.kid(n, 'p:style') },
          crop: X.first(n, 'a:srcRect')?.attrs || null,
          node: n,
        };
        if (n.local === 'pic') shape.media = rels[rid(X.first(n, 'a:blip'))]?.target || null;
        const vid = X.first(n, 'a:videoFile') || X.first(n, 'a:audioFile');
        if (vid) shape.mediaKind = vid.local === 'videoFile' ? 'video' : 'audio';
        if (X.first(n, 'p14:media') || X.first(n, 'a:videoFile')) shape.hasMedia = true;
        if (n.local === 'graphicFrame') {
          const tbl = X.first(n, 'a:tbl');
          const ch = X.first(n, 'c:chart');
          const model3d = X.first(n, 'am3d:model3d');
          if (tbl) shape.table = { style: X.text(X.first(tbl, 'a:tableStyleId')), props: X.kid(tbl, 'a:tblPr')?.attrs || {},
            rows: X.kids(tbl, 'a:tr').map(tr => X.kids(tr, 'a:tc').map(tc => ({ text: X.text(tc, 'a:t'), gridSpan: +(tc.attrs.gridSpan || 1), hMerge: tc.attrs.hMerge === '1',
              align: X.first(tc, 'a:pPr')?.attrs.algn || '' }))), cols: X.all(tbl, 'a:gridCol').length, xml: tbl };
          if (ch) shape.chartPath = rels[rid(ch)]?.target;
          if (X.first(n, 'dgm:relIds')) shape.smartArt = true;
          if (model3d) shape.model3d = true;
        }
        if (X.first(n, 'am3d:model3d') || X.first(n, 'p:model3d')) shape.model3d = true;
        shapes.push(shape);
        if (n.local === 'grpSp') walk(n, shape.name);
      }
    };
    if (tree) walk(tree, null);
    for (const s of shapes) if (s.chartPath) s.chart = await loadChart(zip, s.chartPath);
    const timing = X.kid(sld, 'p:timing');
    const transition = X.kid(sld, 'p:transition') || X.first(sld, 'p:transition');
    const notesRel = Object.values(rels).find(r => r.type === 'notesSlide');
    const notes = notesRel ? await readXml(zip, notesRel.target) : null;
    const bg = X.first(sld, 'p:bg');
    const commentsRel = Object.values(rels).filter(r => /comment/i.test(r.type));
    return {
      index, path: p, hidden: sld?.attrs.show === '0',
      layout: X.first(layoutDoc, 'p:cSld')?.attrs.name || '', layoutPath: layoutRel?.target || null,
      shapes, title: (shapes.find(s => s.ph === 'title' || s.ph === 'ctrTitle') || {}).text || '',
      text: shapes.map(s => s.text + (s.table ? '\n' + s.table.rows.flat().map(c => c.text).join('\n') : '')).join('\n'),
      transition: transition ? { kinds: transition.children.map(c => c.local).filter(k => k !== 'sndAc' && k !== 'extLst' && k !== 'AlternateContent'),
        all: X.all(transition, '*').map(c => c.local), attrs: transition.attrs,
        p14: X.all(sld, 'p14:*').length } : null,
      transitionXml: X.all(sld, 'p159:morph').length ? ['morph'] : X.all(sld, 'p:transition').flatMap(t => t.children.map(c => c.local)),
      animations: timing ? X.all(timing, 'p:cTn').filter(c => c.attrs.presetClass).map(c => ({
        cls: c.attrs.presetClass, id: +c.attrs.presetID, sub: +(c.attrs.presetSubtype || 0), node: c.attrs.nodeType,
        target: X.first(c, 'p:spTgt')?.attrs.spid || '', paragraph: !!X.first(c, 'p:pRg') })) : [],
      bg: bg ? { picture: !!X.first(bg, 'a:blipFill'), alpha: X.first(X.first(bg, 'a:blip'), 'a:alphaModFix')?.attrs.amt,
        solid: !!X.first(bg, 'a:solidFill') } : null,
      notes: notes ? X.all(notes, 'p:sp').filter(s => (X.first(s, 'p:ph')?.attrs.type || 'body') === 'body').map(s => X.text(s, 'a:t')).join('\n') : '',
      footers: shapes.filter(s => ['ftr', 'sldNum', 'dt'].includes(s.ph)).map(s => ({ type: s.ph, text: s.text })),
      ink: X.all(sld, 'p14:contentPart').length + X.all(sld, 'p:contentPart').length,
      comments: commentsRel.length,
      xml: doc,
    };
  }

  // ---------------------------------------------------------------- DOCX

  const EMU_IN = 914400;

  function wText(n) {
    // Chữ hiển thị: w:t (bỏ w:delText = chữ đã xoá đang chờ duyệt) + tab/ký hiệu đặc biệt.
    let s = '';
    const walk = x => {
      for (const c of x.children) {
        if (c.name === 'w:t') s += c.text;
        else if (c.name === 'w:tab') s += '\t';
        else if (c.name === 'w:sym') s += String.fromCharCode(parseInt(c.attrs['w:char'] || '0', 16));
        else if (c.name !== 'w:delText' && c.name !== 'w:instrText' && c.name !== 'mc:Fallback') walk(c);
      }
    };
    walk(n);
    return s;
  }

  function wParagraph(p) {
    const pPr = X.kid(p, 'w:pPr');
    const numPr = X.kid(pPr, 'w:numPr');
    return {
      kind: 'p', text: wText(p), style: X.kid(pPr, 'w:pStyle')?.attrs['w:val'] || '',
      num: numPr ? { numId: X.kid(numPr, 'w:numId')?.attrs['w:val'], ilvl: +(X.kid(numPr, 'w:ilvl')?.attrs['w:val'] || 0) } : null,
      spacing: X.kid(pPr, 'w:spacing')?.attrs || {}, ind: X.kid(pPr, 'w:ind')?.attrs || {}, jc: X.kid(pPr, 'w:jc')?.attrs['w:val'] || '',
      sectPr: X.kid(pPr, 'w:sectPr'), node: p,
    };
  }

  function wTable(t) {
    const tblPr = X.kid(t, 'w:tblPr');
    const rows = X.kids(t, 'w:tr').map(tr => X.kids(tr, 'w:tc').map(tc => ({
      text: X.kids(tc, 'w:p').map(wText).join('\n'), width: +(X.path(tc, 'w:tcPr', 'w:tcW')?.attrs['w:w'] || 0),
      span: +(X.path(tc, 'w:tcPr', 'w:gridSpan')?.attrs['w:val'] || 1),
    })));
    return { kind: 'table', rows, caption: X.kid(tblPr, 'w:tblCaption')?.attrs['w:val'] || '',
      description: X.kid(tblPr, 'w:tblDescription')?.attrs['w:val'] || '', style: X.kid(tblPr, 'w:tblStyle')?.attrs['w:val'] || '',
      grid: X.all(X.kid(t, 'w:tblGrid'), 'w:gridCol').map(g => +g.attrs['w:w']), node: t,
      text: rows.flat().map(c => c.text).join('\n') };
  }

  function wDrawing(d) {
    const anchor = d.local === 'anchor';
    const ext = X.kid(d, 'wp:extent');
    const docPr = X.kid(d, 'wp:docPr');
    const gd = X.first(d, 'a:graphicData');
    const uri = gd?.attrs.uri || '';
    const pos = n => n ? { relativeFrom: n.attrs.relativeFrom, align: X.text(X.kid(n, 'wp:align')).trim(), offset: X.kid(n, 'wp:posOffset') ? +X.text(X.kid(n, 'wp:posOffset')) : null } : null;
    const wrap = anchor ? (d.children.find(c => /^wrap/.test(c.local))?.local || '') : 'inline';
    return {
      anchor, wrap: wrap.replace(/^wrap/, '').replace(/^./, c => c.toLowerCase()),
      cx: ext ? +ext.attrs.cx : 0, cy: ext ? +ext.attrs.cy : 0,
      name: docPr?.attrs.name || '', descr: docPr?.attrs.descr || '', title: docPr?.attrs.title || '',
      posH: pos(X.kid(d, 'wp:positionH')), posV: pos(X.kid(d, 'wp:positionV')),
      kind: /picture/.test(uri) ? 'pic' : /diagram/.test(uri) ? 'smartart' : /chart/.test(uri) ? 'chart' : /model3d/i.test(uri) || X.first(d, 'am3d:model3d') ? 'model3d'
        : /wordprocessingShape/.test(uri) ? 'shape' : /wordprocessingGroup|wordprocessingCanvas/.test(uri) ? 'group' : 'other',
      geom: X.first(d, 'a:prstGeom')?.attrs.prst || '',
      fill: X.first(X.first(d, 'wps:spPr'), 'a:srgbClr')?.attrs.val || X.first(X.first(d, 'wps:spPr'), 'a:schemeClr')?.attrs.val || '',
      bgRemoved: !!X.first(d, 'a14:imgEffect') && X.all(d, 'a14:backgroundRemoval').length > 0,
      text: wText(d),
    };
  }

  function fieldsOf(root) {
    const out = X.all(root, 'w:fldSimple').map(f => f.attrs['w:instr'] || '');
    // Trường có thể lồng nhau (mục lục chứa nhiều PAGEREF) — dùng ngăn xếp, trường ngoài không bị mất.
    const stack = [];
    for (const r of X.all(root, 'w:r')) {
      const fc = X.kid(r, 'w:fldChar');
      if (fc && fc.attrs['w:fldCharType'] === 'begin') stack.push('');
      else if (fc && fc.attrs['w:fldCharType'] === 'end') { if (stack.length) out.push(stack.pop()); }
      const it = X.kid(r, 'w:instrText');
      if (it && stack.length) stack[stack.length - 1] += it.text;
    }
    return out.map(s => s.trim()).filter(Boolean);
  }

  // Word lưu hộp văn bản 2 lần (mc:Choice + mc:Fallback dạng VML) — bỏ bản dự phòng để không đếm trùng.
  function noFallback(nodes, root) {
    const inFallback = new Set(X.all(root, 'mc:Fallback').flatMap(f => X.all(f, nodes[0] ? nodes[0].name : 'w:ins')));
    return nodes.filter(n => !inFallback.has(n));
  }

  async function loadDocx(zip) {
    const docPath = 'word/document.xml';
    const doc = await readXml(zip, docPath);
    if (!doc) throw new Error('Không phải tệp Word (.docx) hợp lệ.');
    const rels = await readRels(zip, docPath);
    const body = X.first(doc, 'w:body');
    const blocks = [];
    const walk = n => {
      for (const c of n.children) {
        if (c.name === 'w:p') blocks.push(wParagraph(c));
        else if (c.name === 'w:tbl') blocks.push(wTable(c));
        else if (c.name === 'w:sdt' || c.name === 'w:sdtContent' || c.name === 'w:customXml' || c.name === 'w:ins' || c.name === 'w:moveTo') walk(c);
      }
    };
    walk(body);
    const hf = {};
    for (const [id, r] of Object.entries(rels)) {
      if (r.type !== 'header' && r.type !== 'footer') continue;
      const x = await readXml(zip, r.target);
      hf[id] = { type: r.type, text: X.all(x, 'w:p').map(wText).join('\n'), fields: fieldsOf(x),
        drawings: X.all(x, 'wp:anchor').concat(X.all(x, 'wp:inline')).map(wDrawing),
        watermark: X.all(x, 'v:textpath').map(t => t.attrs.string || '').join(' ').trim() };
    }
    const sections = X.all(body, 'w:sectPr').map(s => ({
      cols: X.kid(s, 'w:cols') ? { num: +(X.kid(s, 'w:cols').attrs['w:num'] || 1), sep: X.kid(s, 'w:cols').attrs['w:sep'] === '1' || X.kid(s, 'w:cols').attrs['w:sep'] === 'true',
        space: +(X.kid(s, 'w:cols').attrs['w:space'] || 0), widths: X.kids(X.kid(s, 'w:cols'), 'w:col').map(c => +c.attrs['w:w']) } : { num: 1 },
      titlePg: !!X.kid(s, 'w:titlePg') && X.kid(s, 'w:titlePg').attrs['w:val'] !== '0',
      headers: X.kids(s, 'w:headerReference').map(h => Object.assign({ which: h.attrs['w:type'] }, hf[h.attrs['r:id']] || {})),
      footers: X.kids(s, 'w:footerReference').map(h => Object.assign({ which: h.attrs['w:type'] }, hf[h.attrs['r:id']] || {})),
      orient: X.kid(s, 'w:pgSz')?.attrs['w:orient'] || 'portrait', pgMar: X.kid(s, 'w:pgMar')?.attrs || {},
      lineNumbers: !!X.kid(s, 'w:lnNumType'), pgBorders: !!X.kid(s, 'w:pgBorders'),
    }));
    const settings = await readXml(zip, 'word/settings.xml');
    const flag = name => { const n = X.first(settings, 'w:' + name); return !!n && !['0', 'false', 'off'].includes(n.attrs['w:val']); };
    const notes = async (p, tag) => { const x = await readXml(zip, p); return x ? X.all(x, tag).filter(n => !n.attrs['w:type'] || n.attrs['w:type'] === 'normal').map(wText) : []; };
    const comments = await readXml(zip, 'word/comments.xml');
    const all = X.all(body, 'wp:anchor').concat(X.all(body, 'wp:inline'));
    return {
      kind: 'docx', blocks, sections, props: await loadProps(zip),
      paragraphs: blocks.filter(b => b.kind === 'p'), tables: X.all(body, 'w:tbl').map(wTable),
      drawings: all.map(wDrawing), headersFooters: Object.values(hf),
      fields: fieldsOf(body).concat(...Object.values(hf).map(h => h.fields)),
      bookmarks: X.all(body, 'w:bookmarkStart').map(b => b.attrs['w:name']),
      comments: X.all(comments, 'w:comment').length,
      footnotes: await notes('word/footnotes.xml', 'w:footnote'), endnotes: await notes('word/endnotes.xml', 'w:endnote'),
      revisions: noFallback(X.all(body, 'w:ins'), body).map(n => ({ kind: 'ins', text: wText(n) })).concat(noFallback(X.all(body, 'w:del'), body).map(n => ({ kind: 'del', text: X.all(n, 'w:delText').map(t => t.text).join('') }))),
      breaks: { column: X.all(body, 'w:br').filter(b => b.attrs['w:type'] === 'column').length, page: X.all(body, 'w:br').filter(b => b.attrs['w:type'] === 'page').length },
      settings: { trackRevisions: flag('trackRevisions'), protection: X.first(settings, 'w:documentProtection')?.attrs || null, flag },
      background: X.first(doc, 'w:background')?.attrs || null,
      text: X.all(body, 'w:p').map(wText).join('\n'),
      raw: doc,
    };
  }

  const api = { loadXlsx, loadPptx, loadDocx, expandRange, parseAddr, colNum, colName, EMU_IN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MosOffice = api;
})(typeof window !== 'undefined' ? window : globalThis);
