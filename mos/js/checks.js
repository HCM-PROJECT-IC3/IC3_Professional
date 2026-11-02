/* Các loại kiểm tra dùng trong mos/data/rubrics/*.json. Mỗi hàm nhận (model, params, ctx) và trả về
   { pass, note }. ctx.base = mô hình tệp đề gốc (chỉ có với Excel) để so "trước/sau".
   Nguyên tắc: chỉ chấm điều đọc chắc được trong tệp; không chắc thì để task ở dạng tự kiểm. */
(function (root) {
  'use strict';

  const Office = typeof module !== 'undefined' && module.exports ? require('./office-model.js') : root.MosOffice;
  const { expandRange, parseAddr, colName } = Office;
  const colNumOf = c => Office.colNum(c);

  const ok = note => ({ pass: true, note });
  const fail = note => ({ pass: false, note });
  const norm = v => String(v ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
  const num = v => (typeof v === 'number' ? v : v === '' || v == null ? NaN : Number(v));
  function same(a, b) {
    const x = num(a), y = num(b);
    if (!isNaN(x) && !isNaN(y)) return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
    return norm(a) === norm(b);
  }
  const list = (arr, n = 4) => arr.slice(0, n).join(', ') + (arr.length > n ? ` (+${arr.length - n})` : '');

  function sheetOf(m, name) {
    const s = m.sheet(name);
    if (!s) throw new Error(`Không thấy trang tính "${name}".`);
    return s;
  }
  function rowsOf(p) { const out = []; for (let r = p.rows[0]; r <= p.rows[1]; r++) out.push(r); return out; }
  // Bảng có thể ngắn lại/dài ra vì task khác (xoá trùng, xoá hàng): lấy hàng cuối theo bảng chứa ô đầu tiên.
  function tableRows(s, p) {
    if (!p.table) return p;
    const t = s.tables.find(x => { const [a, b] = x.ref.split(':').map(parseAddr); const c = colNumOf(p.col || 'A'); return c >= a.col && c <= b.col && p.rows[0] > a.row && p.rows[0] <= b.row; });
    if (!t) return p;
    const end = parseAddr(t.ref.split(':')[1]).row - (t.totalsRow ? 1 : 0);
    return Object.assign({}, p, { rows: [p.rows[0], end] });
  }
  // Hàng bị ẩn do bộ lọc (AutoFilter của bảng/trang tính) không tính là hàng ẩn.
  function filteredRows(s) {
    const out = new Set();
    const refs = s.tables.filter(t => t.filters > 0).map(t => t.ref).concat(s.autoFilter && s.autoFilter.filters > 0 ? [s.autoFilter.ref] : []);
    for (const ref of refs) { const [a, b] = ref.split(':').map(parseAddr); for (let r = a.row + 1; r <= b.row; r++) out.add(r); }
    return out;
  }
  function refRange(ref) { return ref.split('!').pop().replace(/[$']/g, ''); }
  function nameRange(m, name) {
    const d = m.definedNames.find(n => n.name.toLowerCase() === name.toLowerCase());
    return d ? { sheet: d.ref.split('!')[0].replace(/^'|'$/g, ''), range: refRange(d.ref) } : null;
  }
  function chartsOn(m, sheet) {
    const s = sheetOf(m, sheet);
    return (s.drawings || []).filter(d => d.chart).map(d => Object.assign({ anchor: d }, d.chart));
  }
  function pickChart(m, p) {
    const charts = p.sheet ? chartsOn(m, p.sheet) : m.charts();
    const c = p.title ? charts.find(x => norm(x.title) === norm(p.title)) || (charts.length === 1 ? charts[0] : null) : charts[p.index || 0];
    if (!c) throw new Error(`Không thấy biểu đồ${p.title ? ' "' + p.title + '"' : ''}${p.sheet ? ' trên ' + p.sheet : ''}.`);
    return c;
  }

  // Giá trị mong đợi của 1 ô theo dòng — dùng cho công thức điền theo cột.
  const ROW_EXPECT = {
    avg: (s, r, e) => { const v = e.cols.map(c => num(s.value(c + r))); return v.reduce((a, b) => a + b, 0) / v.length; },
    sum: (s, r, e) => e.cols.reduce((a, c) => a + num(s.value(c + r)), 0),
    concat: (s, r, e) => e.parts.map(p => p.replace(/\{([A-Z]+)\}/g, (_, c) => s.value(c + r) ?? '')).join(''),
    left: (s, r, e) => String(s.value(e.col + r) ?? '').slice(0, e.n),
    right: (s, r, e) => String(s.value(e.col + r) ?? '').slice(-e.n),
    if: (s, r, e) => {
      const v = num(s.value(e.col + r));
      const t = { '>': v > e.value, '>=': v >= e.value, '<': v < e.value, '<=': v <= e.value, '=': v === e.value }[e.cmp];
      return t ? e.then : e.else;
    },
    mul: (s, r, e, m) => num(s.value(e.col + r)) * (e.name ? num(cellByName(m, e.name)) : e.k),
    expr: (s, r, e, m) => {
      const v = c => { const x = s.value(c + r); return x === null ? '' : x; };
      const js = e.js.replace(/\{([A-Z]+)(\d*)\}/g, (_, c, row) => JSON.stringify(row ? s.value(c + row) ?? '' : v(c)));
      return Function('F', 'N', 'with (F) { return (' + js + '); }')(FN, n => num(cellByName(m, n)));
    },
  };
  // Hàm dùng trong biểu thức expr — tên giống hàm Excel.
  const FN = {
    UPPER: x => String(x).toUpperCase(), LOWER: x => String(x).toLowerCase(),
    PROPER: x => String(x).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (a, b, c) => b + c.toUpperCase()),
    LEFT: (x, n = 1) => String(x).slice(0, n), RIGHT: (x, n = 1) => String(x).slice(-n), MID: (x, a, n) => String(x).substr(a - 1, n),
    LEN: x => String(x).length, INT: x => Math.floor(x), MOD: (a, b) => a - b * Math.floor(a / b),
    MAX: (...a) => Math.max(...a), MIN: (...a) => Math.min(...a), SUM: (...a) => a.reduce((x, y) => x + (+y || 0), 0),
    AVERAGE: (...a) => a.reduce((x, y) => x + +y, 0) / a.length, IF: (c, a, b = false) => (c ? a : b),
    COUNTIF0: (...a) => a.filter(x => x === 0 || x === '0').length, COUNTBLANK: (...a) => a.filter(x => x === '' || x === null).length, ROUND: (x, n = 0) => Math.round(x * 10 ** n) / 10 ** n,
  };
  function cellByName(m, name) {
    const n = nameRange(m, name);
    return n ? m.sheet(n.sheet)?.value(n.range.split(':')[0]) : null;
  }

  function fontKey(m, s, addr) {
    const st = s.styleOf(addr);
    const f = m.styles.fonts[st.fontId] || {};
    const fill = m.styles.fills[st.fillId] || {};
    return JSON.stringify([f.b, f.i, f.sz, f.name, f.color, fill.pattern, fill.fg]);
  }

  const X = {
    // ------------------------------------------------ ô / giá trị
    cellsEmpty(m, p) {
      let { sheet, range } = p;
      if (p.name) { const n = nameRange(m, p.name); if (!n) return fail(`Không còn vùng tên "${p.name}".`); ({ sheet, range } = n); }
      const s = sheetOf(m, sheet);
      const left = expandRange(range).filter(a => { const v = s.value(a); return v !== null && v !== ''; });
      return left.length ? fail(`Còn dữ liệu ở ${list(left)}.`) : ok(`Đã xoá nội dung ${range}.`);
    },
    cellsEqual(m, p) {
      const s = sheetOf(m, p.sheet);
      const wrong = Object.entries(p.values).filter(([a, v]) => !same(s.value(a), v)).map(([a]) => a);
      return wrong.length ? fail(`Sai/thiếu ở ${list(wrong)}.`) : ok('Dữ liệu đúng.');
    },
    textGone(m, p) {
      const s = sheetOf(m, p.sheet);
      const all = Object.values(s.cells).map(c => norm(c.v));
      if (all.includes(norm(p.text))) return fail(`Vẫn còn "${p.text}".`);
      const lost = (p.keep || []).filter(t => !all.includes(norm(t)));
      if (lost.length) return fail(`Mất thêm dữ liệu: ${list(lost)}.`);
      const moved = Object.entries(p.keepCells || {}).filter(([a, v]) => !same(s.value(a), v)).map(([a]) => a);
      return moved.length ? fail(`Nội dung ngoài bảng bị thay đổi (${list(moved)}) — chỉ xoá hàng trong bảng.`) : ok(`Đã xoá "${p.text}".`);
    },
    numDecimals(m, p) {
      const s = sheetOf(m, p.sheet);
      const wrong = expandRange(p.range).filter(a => {
        const code = m.styles.fmtCode(s.styleOf(a).numFmtId).split(';')[0];
        const d = /\.([0#?]+)/.exec(code);
        return (d ? d[1].length : 0) !== p.decimals;
      });
      return wrong.length ? fail(`Chưa đúng ${p.decimals} chữ số thập phân ở ${list(wrong)}.`) : ok('Định dạng số đúng.');
    },
    rowFormula(m, p) {
      const s = sheetOf(m, p.sheet);
      p = tableRows(s, p);
      const fn = p.fn ? new RegExp('\\b(' + p.fn + ')\\s*\\(', 'i') : null;
      const wrong = [], noF = [];
      for (const r of rowsOf(p)) {
        const c = s.cell(p.col + r);
        if (!c || !c.f) { noF.push(p.col + r); continue; }
        if (fn && c.f !== '(shared)' && !fn.test(c.f)) { wrong.push(p.col + r); continue; }
        const want = ROW_EXPECT[p.expect.op](s, r, p.expect, m);
        if (!same(c.v, want)) wrong.push(p.col + r);
      }
      if (noF.length) return fail(`Chưa có công thức ở ${list(noF)}.`);
      return wrong.length ? fail(`Kết quả sai ở ${list(wrong)}.`) : ok(`Công thức đúng cho ${p.rows[1] - p.rows[0] + 1} dòng.`);
    },
    cellFormula(m, p) {
      const s = sheetOf(m, p.sheet);
      const c = s.cell(p.cell);
      if (!c || !c.f) return fail(`Ô ${p.cell} chưa có công thức.`);
      if (p.fn && !new RegExp('\\b(' + p.fn + ')\\s*\\(', 'i').test(c.f)) return fail(`Công thức ở ${p.cell} chưa dùng hàm ${p.fn.replace(/\|/g, '/')}.`);
      for (const n of p.names || []) if (!new RegExp('\\b' + n + '\\b', 'i').test(c.f)) return fail(`Công thức chưa dùng tên vùng ${n}.`);
      if (p.noAddress && /\$?[A-Z]{1,3}\$?\d+/.test(c.f.replace(/'[^']*'!/g, ''))) return fail('Công thức còn dùng địa chỉ ô thay vì tên vùng.');
      if (p.value !== undefined && !same(c.v, p.value)) return fail(`Kết quả ở ${p.cell} là ${c.v}, cần ${p.value}.`);
      if (p.fRegex && !new RegExp(p.fRegex, 'i').test(c.f)) return fail(`Công thức ở ${p.cell} chưa đúng yêu cầu (${c.f}).`);
      return ok(`Công thức ở ${p.cell} đúng.`);
    },
    formulaFilled(m, p) {
      const s = sheetOf(m, p.sheet);
      const miss = expandRange(p.range).filter(a => !s.cell(a)?.f);
      return miss.length ? fail(`Chưa có công thức ở ${list(miss)}.`) : ok('Đã điền công thức hết cột.');
    },

    // ------------------------------------------------ định dạng / hiển thị
    align(m, p) {
      const h = sheetOf(m, p.sheet).styleOf(p.cell).align.horizontal || 'general';
      return h === p.horizontal ? ok(`Ô ${p.cell} căn ${p.horizontal}.`) : fail(`Ô ${p.cell} đang căn "${h}".`);
    },
    sameStyle(m, p) {
      const s = sheetOf(m, p.sheet);
      const wrong = p.cells.filter(c => fontKey(m, s, c) !== fontKey(m, s, p.from));
      return wrong.length ? fail(`Định dạng ở ${list(wrong)} chưa giống ô ${p.from}.`) : ok('Đã sao chép định dạng.');
    },
    styleCopied(m, p) {
      const a = sheetOf(m, p.from), b = sheetOf(m, p.to);
      const wrong = p.cells.filter(c => fontKey(m, a, c) !== fontKey(m, b, c));
      return wrong.length ? fail(`Định dạng ở ${list(wrong)} chưa giống trang ${p.from}.`) : ok('Đã sao chép định dạng.');
    },
    cellStyle(m, p) {
      const s = sheetOf(m, p.sheet);
      const name = m.styles.styleName(s.cell(p.cell)?.s);
      return norm(name) === norm(p.name) ? ok(`Ô ${p.cell} dùng kiểu ${p.name}.`) : fail(`Ô ${p.cell} đang dùng kiểu "${name || 'Normal'}".`);
    },
    colWidth(m, p) {
      const s = sheetOf(m, p.sheet);
      const [a, b] = p.cols.split(':').map(c => parseAddr(c + '1').col);
      const wrong = [];
      for (let c = a; c <= (b || a); c++) {
        const w = s.colWidth(c);
        // Excel lưu thêm phần đệm ~0,71 ký tự (12 → 12.7109375).
        if (w == null || w < p.width - 0.01 || w > p.width + 0.8) wrong.push(colName(c));
      }
      return wrong.length ? fail(`Độ rộng cột ${list(wrong)} chưa bằng ${p.width}.`) : ok(`Độ rộng cột ${p.cols} = ${p.width}.`);
    },
    freeze(m, p) {
      const pane = sheetOf(m, p.sheet).pane;
      if (!pane || !/frozen/.test(pane.state)) return fail('Chưa cố định (Freeze Panes).');
      return pane.ySplit === (p.rows || 0) && pane.xSplit === (p.cols || 0) ? ok('Đã cố định đúng.')
        : fail(`Đang cố định ${pane.ySplit} hàng, ${pane.xSplit} cột.`);
    },
    printArea(m, p) {
      const idx = m.sheets.findIndex(s => norm(s.name) === norm(p.sheet));
      const d = m.definedNames.find(n => n.name === '_xlnm.Print_Area' && n.localSheetId === idx);
      if (!d) return fail('Chưa đặt vùng in.');
      return norm(refRange(d.ref)) === norm(p.range) ? ok(`Vùng in ${p.range}.`) : fail(`Vùng in đang là ${refRange(d.ref)}.`);
    },
    filterOnly(m, p) {
      const s = sheetOf(m, p.sheet);
      const keep = p.equals.map(norm);
      const wrong = rowsOf(p).filter(r => keep.includes(norm(s.value(p.col + r))) === !!s.rows[r]?.hidden);
      return wrong.length ? fail(`Lọc chưa đúng ở hàng ${list(wrong.map(String))}.`) : ok('Đã lọc đúng.');
    },
    sorted(m, p, ctx) {
      const s = sheetOf(m, p.sheet);
      // Khoá có "order" = danh sách tuỳ chỉnh (Custom List): giá trị ngoài danh sách xếp sau.
      const rank = (k, v) => { const i = k.order.map(norm).indexOf(v); return String(i < 0 ? 999 : i).padStart(3, '0'); };
      const rows = rowsOf(p).map(r => p.keys.map(k => { const v = norm(s.value(k.col + r)); return k.order ? rank(k, v) : v; }));
      for (let i = 1; i < rows.length; i++) {
        for (let k = 0; k < p.keys.length; k++) {
          // Giống Excel: hai số so theo giá trị, còn lại so theo chữ ("8-port" sau "24-port"), bỏ qua "-" và "'" như "T-Rex".
          const x = rows[i - 1][k], y = rows[i][k];
          const c = (x !== '' && y !== '' && !isNaN(x) && !isNaN(y) ? Math.sign(x - y) : x.replace(/[-']/g, '').localeCompare(y.replace(/[-']/g, ''), 'en')) * (p.keys[k].desc ? -1 : 1);
          if (c < 0) break;
          // Hai giá trị cùng nằm ngoài danh sách tuỳ chỉnh nhưng khác nhau: đề không quy định thứ tự giữa chúng.
          if (p.keys[k].order && c === 0 && norm(s.value(p.keys[k].col + (p.rows[0] + i - 1))) !== norm(s.value(p.keys[k].col + (p.rows[0] + i)))) break;
          if (c > 0) return fail(`Hàng ${p.rows[0] + i} chưa đúng thứ tự.`);
        }
      }
      if (p.idCol && ctx.base) {
        const ids = s2 => rowsOf(p).map(r => String(s2.value(p.idCol + r))).sort().join('|');
        if (ids(s) !== ids(sheetOf(ctx.base, p.sheet))) return fail('Dữ liệu bị thay đổi khi sắp xếp.');
      }
      return ok('Đã sắp xếp đúng.');
    },
    noCF(m, p) {
      const cf = sheetOf(m, p.sheet).cf;
      return cf.length ? fail(`Còn ${cf.length} quy tắc Conditional Formatting.`) : ok('Đã xoá hết Conditional Formatting.');
    },
    iconSet(m, p) {
      const cf = sheetOf(m, p.sheet).cf.filter(c => c.rules.some(r => r.iconSet));
      const hit = cf.find(c => c.rules.some(r => r.iconSet === p.set) && expandRange(p.range).every(a => c.sqref.split(' ').some(q => expandRange(q).includes(a))));
      if (hit) return ok('Đã áp dụng bộ biểu tượng đúng.');
      return cf.length ? fail(`Bộ biểu tượng chưa đúng (${cf.flatMap(c => c.rules.map(r => r.iconSet)).join(', ')}).`) : fail('Chưa có Conditional Formatting dạng biểu tượng.');
    },
    sparklines(m, p) {
      const g = sheetOf(m, p.sheet).sparklines;
      const cells = g.filter(x => !p.sparkType || x.type === p.sparkType).flatMap(x => x.items.flatMap(i => expandRange(i.sqref)));
      const miss = expandRange(p.range).filter(a => !cells.includes(a));
      if (!g.length) return fail('Chưa chèn Sparklines.');
      return miss.length ? fail(`Thiếu Sparklines${p.sparkType ? ' dạng ' + p.sparkType : ''} ở ${list(miss)}.`) : ok('Đã chèn Sparklines đúng.');
    },

    // ------------------------------------------------ bảng
    tableName(m, p) {
      const t = sheetOf(m, p.sheet).tables;
      return t.some(x => x.displayName === p.name) ? ok(`Bảng tên "${p.name}".`) : fail(`Tên bảng đang là "${t.map(x => x.displayName).join(', ') || '(không có bảng)'}".`);
    },
    tableProp(m, p) {
      const t = sheetOf(m, p.sheet).tables[p.index || 0];
      if (!t) return fail('Không thấy bảng.');
      if (p.style && norm(t.style) !== norm(p.style)) return fail(`Kiểu bảng đang là ${t.style}.`);
      for (const k of ['rowStripes', 'colStripes', 'firstCol', 'lastCol', 'totalsRow', 'headerRow']) {
        if (p[k] !== undefined && t[k] !== p[k]) return fail(`Tuỳ chọn ${k} chưa đúng.`);
      }
      return ok('Thiết lập bảng đúng.');
    },
    noTable(m, p) {
      const t = sheetOf(m, p.sheet).tables;
      return t.length ? fail('Vẫn còn là Table — cần Convert to Range.') : ok('Đã chuyển bảng thành vùng thường.');
    },

    // ------------------------------------------------ biểu đồ
    chart(m, p) {
      const c = pickChart(m, p);
      const bad = [];
      if (p.legend !== undefined && c.legend !== p.legend) bad.push(p.legend ? 'chưa có chú giải' : 'còn chú giải (Legend)');
      if (p.showVal !== undefined && c.showVal !== p.showVal) bad.push(p.showVal ? 'chưa hiện giá trị dữ liệu' : 'còn nhãn giá trị');
      if (p.seriesCount !== undefined && c.series.length !== p.seriesCount) bad.push(`có ${c.series.length} chuỗi dữ liệu`);
      if (p.seriesNames && !p.seriesNames.every(n => c.series.some(s => norm(s.name) === norm(n)))) bad.push('tên chuỗi chưa đúng');
      if (p.dTable !== undefined) {
        if (!c.dTable) bad.push('chưa có Data Table');
        else if (p.dTable.showKeys !== undefined && c.dTable.showKeys !== p.dTable.showKeys) bad.push(p.dTable.showKeys ? 'Data Table chưa có Legend Keys' : 'Data Table còn Legend Keys');
      }
      if (p.valAxisTitle !== undefined) {
        const ax = c.axes.find(a => a.kind === 'valAx');
        if (!ax || norm(ax.title) !== norm(p.valAxisTitle)) bad.push(`tiêu đề trục dọc là "${ax?.title || ''}"`);
      }
      if (p.colorStyle !== undefined && String(c.colorStyle) !== String(p.colorStyle)) bad.push('bảng màu chưa đúng');
      if (p.chartType && !c.types.includes(p.chartType)) bad.push(`loại biểu đồ là ${c.types.join(', ')}`);
      if (p.barDir && c.barDir !== p.barDir) bad.push('hướng cột chưa đúng');
      if (p.grouping && c.grouping !== p.grouping) bad.push('kiểu nhóm chưa đúng');
      if (p.title2 !== undefined && norm(c.title) !== norm(p.title2)) bad.push(`tiêu đề là "${c.title}"`);
      if (p.hasTitle !== undefined && c.hasTitle !== p.hasTitle) bad.push(p.hasTitle ? 'chưa có tiêu đề' : 'còn tiêu đề');
      if (p.legendPos && (!c.legend || c.legendPos !== p.legendPos)) bad.push(`chú giải đang ở "${c.legend ? c.legendPos : 'không có'}"`);
      if (p.dLblPos && c.dLblPos !== p.dLblPos && !(p.dLblPos === 'outEnd' && c.showVal && !c.dLblPos)) bad.push(`vị trí nhãn dữ liệu là ${c.dLblPos || 'mặc định'}`);
      if (p.showPercent !== undefined && c.showPercent !== p.showPercent) bad.push(p.showPercent ? 'chưa hiện phần trăm' : 'còn phần trăm');
      if (p.valAxisDeleted !== undefined && !!c.axes.find(a => a.kind === 'valAx')?.deleted !== p.valAxisDeleted) bad.push(p.valAxisDeleted ? 'còn trục giá trị' : 'thiếu trục giá trị');
      if (p.styleN !== undefined && !chartStyleIds(c, p.styleN).includes(String(c.chartStyle))) bad.push(`kiểu biểu đồ chưa phải Style ${p.styleN}`);
      if (p.palette && String(c.colorStyle) !== String(PALETTE[p.palette])) bad.push(`bảng màu chưa phải ${p.palette}`);
      if (p.minSeries !== undefined && c.series.length < p.minSeries) bad.push(`mới có ${c.series.length} chuỗi dữ liệu`);
      if (p.valIncludes && !c.series.some(s => refRange(s.valRef).includes(p.valIncludes) || norm(s.name) === norm(p.valIncludes))) bad.push('chưa thêm chuỗi dữ liệu');
      if (p.catRow && !c.series.every(s => new RegExp('\\$' + p.catRow + '$').test(s.catRef.split(':').pop()))) bad.push('vùng dữ liệu chưa mở rộng');
      return bad.length ? fail('Biểu đồ: ' + bad.join('; ') + '.') : ok('Biểu đồ đúng yêu cầu.');
    },
    chartAltText(m, p) {
      const c = pickChart(m, p);
      const d = c.anchor;
      return norm(d.descr) === norm(p.text) || norm(d.title) === norm(p.text) ? ok('Đã thêm Alt Text.') : fail(`Alt Text đang là "${d.descr || ''}".`);
    },
    chartSheet(m, p) {
      const s = m.sheet(p.name);
      if (!s) return fail(`Chưa có trang "${p.name}".`);
      return s.kind === 'chart' && s.drawings.some(d => d.chart) ? ok('Đã chuyển biểu đồ sang trang riêng.') : fail(`"${p.name}" không phải trang biểu đồ.`);
    },
    // ------------------------------------------------ bổ sung: liên kết, tên vùng, ẩn/hiện, dữ liệu
    hyperlink(m, p) {
      const s = sheetOf(m, p.sheet);
      const h = s.hyperlinks.find(x => expandRange(x.ref).includes(p.cell));
      if (!h) return fail(`Ô ${p.cell} chưa có siêu liên kết.`);
      const target = (h.target || h.location || '').replace(/\/$/, '').replace(/'/g, '');
      if (p.url && norm(target).replace(/^https?:\/\//, '').replace(/^www\./, '') !== norm(p.url).replace(/\/$/, '').replace(/^https?:\/\//, '').replace(/^www\./, '')) return fail(`Liên kết đang trỏ tới "${target}".`);
      if (p.tip && norm(h.tooltip) !== norm(p.tip)) return fail(`ScreenTip đang là "${h.tooltip || ''}".`);
      if (p.text && !same(s.value(p.cell), p.text)) return fail(`Chữ hiển thị đang là "${s.value(p.cell)}".`);
      return ok('Siêu liên kết đúng.');
    },
    noHyperlink(m, p) {
      const s = sheetOf(m, p.sheet);
      if (s.hyperlinks.some(x => expandRange(x.ref).includes(p.cell))) return fail(`Ô ${p.cell} vẫn còn siêu liên kết.`);
      return p.text && !same(s.value(p.cell), p.text) ? fail(`Chữ trong ô ${p.cell} bị mất/đổi.`) : ok('Đã bỏ siêu liên kết, giữ chữ.');
    },
    definedName(m, p) {
      const d = m.definedNames.find(n => n.name.toLowerCase() === p.name.toLowerCase() && !n.name.startsWith('_xlnm'));
      if (!d) return fail(`Chưa có vùng tên "${p.name}".`);
      const parts = d.ref.split(',').map(r => ({ sheet: r.split('!')[0].replace(/^'|'$/g, ''), range: refRange(r) }));
      const want = p.range.split(',').map(r => norm(r));
      const got = parts.map(x => norm(x.range));
      if (want.length !== got.length || !want.every(w => got.includes(w))) return fail(`Vùng tên "${p.name}" đang là ${d.ref}.`);
      if (p.sheet && !parts.every(x => norm(x.sheet) === norm(p.sheet))) return fail(`Vùng tên "${p.name}" nằm sai trang tính.`);
      return ok(`Đã đặt tên vùng "${p.name}".`);
    },
    noHidden(m) {
      const bad = [];
      for (const s of m.sheets) {
        if (s.kind !== 'work') continue;
        const flt = filteredRows(s);
        if (Object.entries(s.rows).some(([r, x]) => x.hidden && !flt.has(+r))) bad.push(s.name + ' (hàng)');
        if (s.cols.some(c => c.hidden)) bad.push(s.name + ' (cột)');
      }
      return bad.length ? fail(`Còn hàng/cột ẩn: ${list(bad)}.`) : ok('Không còn hàng/cột ẩn.');
    },
    unique(m, p, ctx) {
      const s = sheetOf(m, p.sheet);
      const vals = s2 => { const out = []; for (let r = p.from; r <= (p.to || p.from + 5000); r++) { const v = s2.value(p.col + r); if (v === null || v === '') break; out.push(norm(v)); } return out; };
      const now = vals(s);
      const dup = now.filter((v, i) => now.indexOf(v) !== i);
      if (dup.length) return fail(`Còn giá trị trùng: ${list([...new Set(dup)])}.`);
      if (ctx.base) {
        const want = [...new Set(vals(sheetOf(ctx.base, p.sheet)))];
        const lost = want.filter(v => !now.includes(v));
        if (lost.length) return fail(`Mất giá trị: ${list(lost)}.`);
      }
      return ok('Đã xoá các bản ghi trùng.');
    },
    alignment(m, p) {
      const s = sheetOf(m, p.sheet);
      const wrong = expandRange(p.range).filter(a => {
        const al = s.styleOf(a).align || {};
        if (p.horizontal && (al.horizontal || 'general') !== p.horizontal) return true;
        if (p.indent !== undefined && +(al.indent || 0) !== p.indent) return true;
        if (p.wrap && !(al.wrapText === '1' || al.wrapText === 'true')) return true;
        if (p.rotation !== undefined && +(al.textRotation || 0) !== p.rotation) return true;
        return false;
      });
      return wrong.length ? fail(`Căn chỉnh chưa đúng ở ${list(wrong)}.`) : ok('Căn chỉnh đúng.');
    },
    totals(m, p) {
      const t = (p.table ? sheetOf(m, p.sheet).tables.find(x => x.displayName === p.table) : sheetOf(m, p.sheet).tables[p.index || 0]);
      if (!t) return fail('Không thấy bảng.');
      if (!t.totalsRow) return fail('Bảng chưa bật Total Row.');
      const miss = (p.cols || []).filter(c => !t.totals[c] || (p.fn && t.totals[c] !== p.fn && t.totals[c] !== 'custom'));
      return miss.length ? fail(`Hàng tổng chưa tính ${p.fn || ''} ở cột ${list(miss)}.`) : ok('Total Row đúng.');
    },
    chartSwapped(m, p, ctx) {
      if (!ctx.base) return { pass: null, note: 'Thiếu tệp gốc để so.' };
      const orient = c => {
        const r = refRange(c.series[0]?.valRef || '');
        if (!r.includes(':')) return c.series.length > 1 ? 'col' : 'row';
        const [a, b] = r.split(':').map(parseAddr);
        return a.col === b.col ? 'col' : 'row';
      };
      const now = pickChart(m, p), before = pickChart(ctx.base, p);
      if (now.series.length === before.series.length && orient(now) === orient(before)) return fail('Dữ liệu chưa được hoán đổi giữa hai trục.');
      return ok('Đã hoán đổi hàng/cột (Switch Row/Column).');
    },
    chartPos(m, p) {
      const c = pickChart(m, p);
      const f = c.anchor.from || { col: 0, row: 0 };
      if (p.rightOfCol && f.col + 1 <= colNumOf(p.rightOfCol)) return fail('Biểu đồ chưa nằm bên phải bảng.');
      if (p.belowRow && f.row + 1 <= p.belowRow) return fail('Biểu đồ chưa nằm dưới bảng.');
      return ok('Vị trí biểu đồ đúng.');
    },
    cfRule(m, p) {
      const s = sheetOf(m, p.sheet);
      const PRESET = { yellow: ['FFFFEB9C', 'FF9C5700', 'FF9C6500'], red: ['FFFFC7CE', 'FF9C0006'], green: ['FFC6EFCE', 'FF006100'] };
      const cover = c => expandRange(p.range).every(a => c.sqref.split(' ').some(q => expandRange(q).includes(a)));
      const hits = s.cf.filter(cover).flatMap(c => c.rules);
      if (!hits.length) return fail(`Chưa có định dạng có điều kiện cho ${p.range}.`);
      const r = hits.find(x => (!p.ruleType || x.type === p.ruleType) && (!p.operator || x.operator === p.operator)
        && (p.value === undefined || x.formula.some(f => same(f.replace(/^"|"$/g, ''), p.value))) && (!p.text || norm(x.text) === norm(p.text))
        && (!p.iconSet || x.iconSet === p.iconSet));
      if (!r) return fail(`Quy tắc chưa đúng (${hits.map(x => x.type + (x.operator ? ' ' + x.operator : '') + (x.formula[0] ? ' ' + x.formula[0] : '')).join('; ')}).`);
      if (p.preset) {
        const d = m.styles.dxfs[r.dxfId] || {};
        const colors = [d.fill?.rgb, d.font?.rgb].map(x => String(x || '').toUpperCase());
        if (!(PRESET[p.preset].includes(colors[0]) && PRESET[p.preset].includes(colors[1]))) return fail('Màu định dạng chưa đúng kiểu yêu cầu.');
      }
      return ok('Định dạng có điều kiện đúng.');
    },
    printTitles(m, p) {
      const idx = m.sheets.findIndex(s => norm(s.name) === norm(p.sheet));
      const d = m.definedNames.find(n => n.name === '_xlnm.Print_Titles' && n.localSheetId === idx);
      if (!d) return fail('Chưa đặt tiêu đề in lặp lại (Print Titles).');
      const refs = d.ref.split(',').map(refRange).map(norm);
      // "*" = chấp nhận mọi vùng hàng/cột (đề không nói rõ hàng nào).
      const isRows = x => /^\d+:\d+$/.test(x), isCols = x => /^[a-z]+:[a-z]+$/.test(x);
      const miss = [[p.rows, isRows], [p.cols, isCols]].filter(([w]) => w)
        .filter(([w, kind]) => (w === '*' ? !refs.some(kind) : !refs.includes(norm(w))));
      return miss.length ? fail(`Print Titles đang là ${refs.join(', ')}.`) : ok('Đã lặp lại tiêu đề trên mọi trang in.');
    },
    privacy(m, p) {
      const pr = m.props;
      const leftover = ['creator', 'lastModifiedBy', 'title', 'subject', 'keywords', 'description', 'category', 'Company', 'Manager'].filter(k => pr[k] && !(p.keep || []).includes(k));
      if (m.workbookPr.filterPrivacy === '1' || m.workbookPr.filterPrivacy === 'true') return leftover.length ? fail(`Còn thuộc tính: ${list(leftover)}.`) : ok('Đã xoá thuộc tính ẩn và thông tin cá nhân.');
      return fail('Chưa chạy Inspect Document → Remove All (Document Properties and Personal Information).');
    },
    pageSetup(m, p) {
      const ps = sheetOf(m, p.sheet).pageSetup;
      return (ps.orientation || 'portrait') === p.orientation ? ok(`Hướng giấy ${p.orientation}.`) : fail(`Hướng giấy đang là ${ps.orientation || 'portrait'}.`);
    },
    view(m, p) {
      const v = sheetOf(m, p.sheet).view;
      if (p.mode && (v.view || 'normal') !== p.mode) return fail(`Chế độ xem đang là ${v.view || 'normal'}.`);
      if (p.showFormulas && !(v.showFormulas === '1' || v.showFormulas === 'true')) return fail('Chưa bật hiển thị công thức (Show Formulas).');
      return ok('Chế độ xem đúng.');
    },
    rowBreak(m, p) {
      const b = sheetOf(m, p.sheet).rowBreaks;
      return b.includes(p.after) ? ok('Đã chèn ngắt trang.') : fail(b.length ? `Ngắt trang đang ở sau hàng ${b.join(', ')}.` : 'Chưa chèn ngắt trang.');
    },
    sheetAdded(m, p, ctx) {
      const old = ctx.base ? ctx.base.sheets.map(s => norm(s.name)) : [];
      const fresh = m.sheets.filter(s => !old.includes(norm(s.name)) && (!p.name || new RegExp(p.name, 'i').test(s.name)));
      if (!fresh.length) return fail('Chưa có trang tính mới.');
      const hit = fresh.find(s => Object.values(p.contains || {}).every(v => Object.values(s.cells).some(c => same(c.v, v))) && (!p.table || s.tables.length));
      return hit ? ok(`Đã có trang tính "${hit.name}".`) : fail(p.table ? 'Trang tính mới chưa có dữ liệu dạng bảng.' : 'Trang tính mới chưa có dữ liệu cần thiết.');
    },
    dataModel(m) {
      return m.dataModel || m.connections.some(c => c.model) ? ok('Dữ liệu đã nạp vào Data Model.') : fail('Chưa thêm dữ liệu vào Data Model.');
    },
    footer(m, p) {
      const hf = sheetOf(m, p.sheet).headerFooter;
      const f = hf ? (p.part === 'header' ? hf.header : hf.footer) : '';
      const sec = (f.split(/&([LCR])/).reduce((acc, x, i, arr) => { if (i % 2) acc[x] = arr[i + 1] || ''; return acc; }, {}))[p.pos || 'R'] || '';
      return sec.includes(p.code) ? ok('Đầu/chân trang đúng.') : fail(`Chưa có ${p.label || p.code} ở ${p.part === 'header' ? 'đầu' : 'chân'} trang.`);
    },
    merged(m, p) {
      const ms = sheetOf(m, p.sheet).merges.map(norm);
      return ms.includes(norm(p.range)) ? ok(`Đã gộp ${p.range}.`) : fail(`Chưa gộp ô ${p.range}.`);
    },
    coreProp(m, p) {
      const v = p.prop.startsWith('custom:') ? m.props.custom[p.prop.slice(7)] : m.props[p.prop];
      return norm(v).includes(norm(p.value)) ? ok(`Thuộc tính ${p.prop} đúng.`) : fail(`Thuộc tính ${p.prop} đang là "${v || ''}".`);
    },
    numFmt(m, p) {
      const s = sheetOf(m, p.sheet);
      const re = new RegExp(p.pattern);
      const wrong = expandRange(p.range).filter(a => s.cell(a) && !re.test(m.styles.fmtCode(s.styleOf(a).numFmtId)));
      return wrong.length ? fail(`Định dạng số chưa đúng ở ${list(wrong)}.`) : ok('Định dạng số đúng.');
    },
    rowHeight(m, p) {
      const s = sheetOf(m, p.sheet);
      const wrong = rowsOf(p).filter(r => !s.rows[r] || s.rows[r].ht == null || Math.abs(s.rows[r].ht - p.height) > 0.3);
      return wrong.length ? fail(`Chiều cao hàng chưa bằng ${p.height} ở ${list(wrong.map(String))}.`) : ok('Chiều cao hàng đúng.');
    },
    styleCleared(m, p) {
      const s = sheetOf(m, p.sheet);
      const base = m.styles.cellXfs[0];
      const wrong = expandRange(p.range).filter(a => {
        const x = s.styleOf(a);
        return x.fontId !== base.fontId || x.fillId !== base.fillId || x.borderId !== base.borderId || x.numFmtId !== base.numFmtId;
      });
      return wrong.length ? fail(`Còn định dạng ở ${list(wrong)}.`) : ok('Đã xoá định dạng.');
    },
    tableAt(m, p) {
      const t = sheetOf(m, p.sheet).tables.find(x => norm(x.ref) === norm(p.ref));
      if (!t) return fail(`Chưa có bảng ở vùng ${p.ref}.`);
      if (p.style && norm(t.style) !== norm(p.style)) return fail(`Kiểu bảng đang là ${t.style}.`);
      if (p.headerRow !== undefined && t.headerRow !== p.headerRow) return fail('Tuỳ chọn hàng tiêu đề chưa đúng.');
      return ok('Đã tạo bảng đúng.');
    },
    filterBy(m, p) {
      const s = sheetOf(m, p.sheet);
      const vals = rowsOf(p).map(r => num(s.value(p.col + r)));
      const avg = vals.filter(v => !isNaN(v)).reduce((a, b) => a + b, 0) / vals.filter(v => !isNaN(v)).length;
      const show = r => {
        const v = s.value(p.col + r);
        if (p.test === 'startsWith') return norm(v).startsWith(norm(p.value));
        if (p.test === 'contains') return norm(v).includes(norm(p.value));
        if (p.test === 'aboveAverage') return num(v) > avg;
        return false;
      };
      const wrong = rowsOf(p).filter(r => show(r) === !!s.rows[r]?.hidden);
      return wrong.length ? fail(`Lọc chưa đúng ở hàng ${list(wrong.map(String))}.`) : ok('Đã lọc đúng.');
    },
    split(m, p) {
      const pane = sheetOf(m, p.sheet).pane;
      const s = sheetOf(m, p.sheet);
      if (!pane || /frozen/.test(pane.state) || !pane.ySplit) return fail('Chưa chia cửa sổ (Split) theo hàng.');
      // Split lưu chiều cao ngăn trên (1/20 pt): cộng chiều cao từng hàng để biết ngăn trên có mấy hàng.
      let h = 0, n = 0;
      while (n < 500) { const next = h + (s.rows[n + 1]?.ht ?? s.defaultRowHeight); if (next > pane.ySplit / 20 + 0.5) break; h = next; n++; }
      // Vạch chia lệch vài điểm tuỳ cách Excel đo; ô đầu ngăn dưới (topLeftCell) cũng cho biết số hàng khi chưa cuộn.
      const byTop = pane.topLeft ? parseAddr(pane.topLeft).row - 1 : -1;
      return n === p.rows || byTop === p.rows ? ok('Đã chia cửa sổ đúng.') : fail(`Ngăn trên đang có khoảng ${n} hàng.`);
    },
    textReplaced(m, p, ctx) {
      const s = sheetOf(m, p.sheet);
      const re = new RegExp('\\b' + p.from + '\\b(?!' + p.to.slice(p.from.length) + ')', 'i');
      const left = Object.entries(s.cells).filter(([, c]) => typeof c.v === 'string' && re.test(c.v.replace(new RegExp(p.to, 'gi'), ''))).map(([a]) => a);
      if (left.length) return fail(`Còn "${p.from}" ở ${list(left)}.`);
      if (ctx.base) {
        const cnt = mm => Object.values(sheetOf(mm, p.sheet).cells).filter(c => typeof c.v === 'string' && new RegExp('\\b' + p.from, 'i').test(c.v)).length;
        if (cnt(m) < cnt(ctx.base)) return fail('Mất dữ liệu khi thay thế.');
      }
      return ok(`Đã thay "${p.from}" bằng "${p.to}".`);
    },
    sparkCopied(m, p) {
      const g = sheetOf(m, p.sheet).sparklines;
      const cells = g.flatMap(x => x.items.flatMap(i => expandRange(i.sqref)));
      const miss = expandRange(p.range).filter(a => !cells.includes(a));
      return miss.length ? fail(`Thiếu Sparklines ở ${list(miss)}.`) : ok('Đã có Sparklines cho cả cột.');
    },
    cellAgg(m, p) {
      const s = sheetOf(m, p.sheet);
      const c = s.cell(p.cell);
      if (!c || !c.f) return fail(`Ô ${p.cell} chưa có công thức.`);
      if (p.fn && !new RegExp('\\b(' + p.fn + ')\\s*\\(', 'i').test(c.f)) return fail(`Công thức ở ${p.cell} chưa dùng hàm ${p.fn.replace(/\|/g, '/')}.`);
      const src = sheetOf(m, p.from || p.sheet);
      const vals = expandRange(p.range).map(a => src.value(a));
      const nums = vals.map(num).filter(v => !isNaN(v) && v !== null);
      const want = {
        max: () => Math.max(...nums), min: () => Math.min(...nums), sum: () => nums.reduce((a, b) => a + b, 0),
        avg: () => nums.reduce((a, b) => a + b, 0) / nums.length, count: () => vals.filter(v => typeof v === 'number').length,
        counta: () => vals.filter(v => v !== null && v !== '').length, countblank: () => vals.filter(v => v === null || v === '').length,
        countif: () => vals.filter(v => same(v, p.eq)).length,
      }[p.agg]();
      if (!same(c.v, want)) return fail(`Kết quả ở ${p.cell} là ${c.v}, cần ${want}.`);
      for (const n of p.names || []) if (!new RegExp('\\b' + n + '\\b', 'i').test(c.f)) return fail(`Công thức chưa dùng tên vùng ${n}.`);
      return ok(`Công thức ở ${p.cell} đúng.`);
    },
    newChart(m, p, ctx) {
      const before = ctx.base ? chartsOn(ctx.base, p.sheet).length : 0;
      const charts = chartsOn(m, p.sheet);
      if (charts.length <= before) return fail(`Chưa có biểu đồ mới trên ${p.sheet}.`);
      const c = charts[charts.length - 1];
      const bad = [];
      if (p.chartType && !c.types.includes(p.chartType)) bad.push(`loại là ${c.types.join(', ')}`);
      if (p.barDir && c.barDir !== p.barDir) bad.push('hướng cột chưa đúng');
      if (p.grouping && c.grouping !== p.grouping) bad.push(`kiểu nhóm là ${c.grouping}`);
      if (p.valCol && !c.series.some(s => new RegExp('\\$' + p.valCol + '\\$').test(s.valRef))) bad.push(`chưa lấy dữ liệu cột ${p.valCol}`);
      if (p.belowRow && (c.anchor.from?.row ?? 0) + 1 <= p.belowRow) bad.push('chưa đặt dưới bảng');
      if (p.rightOfCol && (c.anchor.from?.col ?? 0) + 1 <= colNumOf(p.rightOfCol)) bad.push('chưa đặt bên phải bảng');
      if (p.valCols && !p.valCols.every(col => c.series.some(s => new RegExp('\\$' + col + '\\$').test(s.valRef)))) bad.push(`chưa lấy đủ dữ liệu cột ${p.valCols.join(', ')}`);
      if (p.seriesCount && c.series.length !== p.seriesCount) bad.push(`có ${c.series.length} chuỗi dữ liệu`);
      if (p.catCol && !c.series.every(s => new RegExp('\\$' + p.catCol + '\\$').test(s.catRef))) bad.push(`nhãn trục chưa lấy từ cột ${p.catCol}`);
      return bad.length ? fail('Biểu đồ mới: ' + bad.join('; ') + '.') : ok('Đã tạo biểu đồ đúng.');
    },
  };

  // Bảng màu (tab Chart Design → Change Colors) và kiểu biểu đồ: id theo cách Excel lưu trong colorsN.xml / styleN.xml.
  const PALETTE = { 'Colorful 1': 10, 'Colorful 2': 11, 'Colorful 3': 12, 'Colorful 4': 13 };
  for (let i = 1; i <= 13; i++) PALETTE['Monochromatic ' + i] = 13 + i;
  const STYLE_BASE = { barChart: 201, bar3DChart: 286, lineChart: 227, line3DChart: 332, pieChart: 251, pie3DChart: 262, doughnutChart: 251, areaChart: 276, scatterChart: 240 };
  // Biểu đồ thanh ngang có thể mang dải id của cột (201…) hoặc của thanh (216…) tuỳ cách tạo ban đầu.
  function chartStyleIds(c, n) {
    const ids = [(STYLE_BASE[c.types[0]] || 201) + n - 1];
    if (c.types[0] === 'barChart' && c.barDir === 'bar') ids.push(215 + n);
    return ids.map(String);
  }

  // GUID kiểu bảng PowerPoint (tab Table Design) — lấy từ tableStyles.xml do PowerPoint lưu.
  const TABLE_STYLES = {
    'Dark Style 1 - Accent 1': '{125E5076-3810-47DD-B79F-674D7AD40C01}',
    'Dark Style 1 - Accent 4': '{E929F9F4-4A8F-4326-A1B4-22849713DDAB}',
    'Dark Style 2': '{5202B0CA-FC54-4496-8BCA-5EF66A818D29}',
    'Dark Style 2 - Accent 1/Accent 2': '{0660B408-B3CF-4A94-85FC-2B1E0A45F4A2}',
    'Dark Style 2 - Accent 5/Accent 6': '{46F890A9-2807-4EBB-B81D-B2AA78EC7F39}',
    'Light Style 1': '{9D7B26C5-4107-4FEC-AEDC-1716B250A1EF}',
    'Light Style 1 - Accent 1': '{3B4B98B0-60AC-42C2-AFA5-B58CD77FA1E5}',
    'Light Style 1 - Accent 2': '{0E3FDE45-AF77-4B5C-9715-49D594BDF05E}',
    'Light Style 1 - Accent 3': '{C083E6E3-FA7D-4D7B-A595-EF9225AFEA82}',
    'Light Style 1 - Accent 4': '{D27102A9-8310-4765-A935-A1911B00CA55}',
    'Light Style 1 - Accent 5': '{5FD0F851-EC5A-4D38-B0AD-8093EC10F338}',
    'Light Style 1 - Accent 6': '{68D230F3-CF80-4859-8CE7-A43EE81993B5}',
    'Light Style 2': '{7E9639D4-E3E2-4D34-9284-5A2195B3D0D7}',
    'Light Style 2 - Accent 1': '{69012ECD-51FC-41F1-AA8D-1B2483CD663E}',
    'Light Style 2 - Accent 2': '{72833802-FEF1-4C79-8D5D-14CF1EAF98D9}',
    'Light Style 2 - Accent 3': '{F2DE63D5-997A-4646-A377-4702673A728D}',
    'Light Style 2 - Accent 4': '{17292A2E-F333-43FB-9621-5CBBE7FDCDCB}',
    'Light Style 2 - Accent 5': '{5A111915-BE36-4E01-A7E5-04B1672EAD32}',
    'Light Style 2 - Accent 6': '{912C8C85-51F0-491E-9774-3900AFEF0FD7}',
    'Light Style 3': '{616DA210-FB5B-4158-B5E0-FEB733F419BA}',
    'Light Style 3 - Accent 1': '{BC89EF96-8CEA-46FF-86C4-4CE0E7609802}',
    'Light Style 3 - Accent 2': '{5DA37D80-6434-44D0-A028-1B22A696006F}',
    'Light Style 3 - Accent 3': '{8799B23B-EC83-4686-B30A-512413B5E67A}',
    'Light Style 3 - Accent 4': '{ED083AE6-46FA-4A59-8FB0-9F97EB10719F}',
    'Light Style 3 - Accent 5': '{BDBED569-4797-4DF1-A0F4-6AAB3CD982D8}',
    'Light Style 3 - Accent 6': '{E8B1032C-EA38-4F05-BA0D-38AFFFC7BED3}',
    'Medium Style 1': '{793D81CF-94F2-401A-BA57-92F5A7B2D0C5}',
    'Medium Style 1 - Accent 1': '{B301B821-A1FF-4177-AEE7-76D212191A09}',
    'Medium Style 1 - Accent 2': '{9DCAF9ED-07DC-4A11-8D7F-57B35C25682E}',
    'Medium Style 1 - Accent 3': '{1FECB4D8-DB02-4DC6-A0A2-4F2EBAE1DC90}',
    'Medium Style 1 - Accent 4': '{1E171933-4619-4E11-9A3F-F7608DF75F80}',
    'Medium Style 1 - Accent 6': '{10A1B5D5-9B99-4C35-A422-299274C87663}',
    'Medium Style 2': '{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}',
    'Medium Style 2 - Accent 1': '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}',
    'Medium Style 2 - Accent 2': '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}',
    'Medium Style 2 - Accent 3': '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}',
    'Medium Style 2 - Accent 4': '{00A15C55-8517-42AA-B614-E9B94910E393}',
    'Medium Style 2 - Accent 5': '{7DF18680-E054-41AD-8BC1-D1AEF772440D}',
    'Medium Style 2 - Accent 6': '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}',
    'Medium Style 3 - Accent 1': '{6E25E649-3F16-4E02-A733-19D2CDBF48F0}',
    'Medium Style 3 - Accent 2': '{85BE263C-DBD7-4A20-BB59-AAB30ACAA65A}',
    'Medium Style 3 - Accent 4': '{EB9631B5-78F2-41C9-869B-9F39066F8104}',
    'Medium Style 4': '{D7AC3CCA-C797-4891-BE02-D94E43425B78}',
    'Medium Style 4 - Accent 2': '{8A107856-5554-42FB-B03E-39F5DBC370BA}',
    'Medium Style 4 - Accent 3': '{0505E3EF-67EA-436B-97B2-0124C06EBD24}',
    'Medium Style 4 - Accent 4': '{C4B1156A-380E-4F78-BDF5-A606A8083BF9}',
    'Medium Style 4 - Accent 5': '{22838BEF-8BB2-4498-84A7-C5851F593DF1}',
    'Medium Style 4 - Accent 6': '{16D9F66E-5EB9-4882-86FB-DCBF35E3C3E4}',
    'No Style, No Grid': '{2D5ABB26-0587-4C30-8999-92F81FD0307C}',
    'No Style, Table Grid': '{5940675A-B579-460E-94D1-54222C63F5DA}',
    'Themed Style 1 - Accent 1': '{3C2FFA5D-87B4-456A-9821-1D502468CF0F}',
    'Themed Style 1 - Accent 3': '{69C7853C-536D-4A76-A0AE-DD22124D55A5}',
    'Themed Style 1 - Accent 4': '{775DCB02-9BB8-47FD-8907-85C794F793BA}',
    'Themed Style 1 - Accent 5': '{35758FB7-9AC5-4552-8A53-C91805E547FA}',
    'Themed Style 2 - Accent 1': '{D113A9D2-9D6B-4929-AA2D-F23B5EE8CBE7}',
    'Themed Style 2 - Accent 4': '{E269D01E-BC32-4049-B463-5C60D7B0CCD2}',
    'Themed Style 2 - Accent 5': '{327F97BB-C833-4FB7-BDE5-3F7075034690}'
  };

  // ------------------------------------------------ PowerPoint
  function slideOf(m, p) {
    let s = null;
    if (p.slide === 'last') s = m.slides[m.slides.length - 1];
    else if (p.titled) s = m.slides.find(x => norm(x.title).includes(norm(p.titled)));
    else s = m.slides[(p.slide || 1) - 1];
    if (!s) throw new Error(`Không thấy trang chiếu ${p.titled ? '"' + p.titled + '"' : p.slide}.`);
    return s;
  }
  const EMU_IN = 914400;

  const P = {
    slideHidden(m, p) {
      const s = slideOf(m, p);
      return s.hidden === p.hidden ? ok(p.hidden ? 'Đã ẩn trang chiếu.' : 'Trang chiếu đang hiện.') : fail(p.hidden ? 'Trang chiếu chưa bị ẩn.' : 'Trang chiếu vẫn đang ẩn.');
    },
    untitledVisible(m) {
      const s = m.slides.filter(x => !x.title.trim());
      return s.length && s.every(x => !x.hidden) ? ok('Trang chiếu không tiêu đề đã hiện.') : fail('Trang chiếu không tiêu đề vẫn đang ẩn.');
    },
    showType(m, p) {
      const bad = [];
      if (p.show && m.show.type !== p.show) bad.push(`kiểu trình chiếu là ${m.show.type}`);
      if (p.manual && m.show.useTimings) bad.push('chưa chọn chuyển trang thủ công (Manually)');
      return bad.length ? fail(bad.join('; ') + '.') : ok('Thiết lập trình chiếu đúng.');
    },
    picBackground(m, p) {
      const s = slideOf(m, p);
      if (!s.bg || !s.bg.picture) return fail('Chưa đặt nền hình ảnh.');
      const transp = s.bg.alpha ? 100 - Math.round(+s.bg.alpha / 1000) : 0;
      return p.transparency === undefined || transp === p.transparency ? ok('Nền hình ảnh đúng.') : fail(`Độ trong suốt đang là ${transp}%.`);
    },
    ink(m, p) {
      const s = slideOf(m, p);
      return s.ink > 0 ? ok('Đã có nét vẽ bằng tab Draw.') : fail('Chưa thấy nét vẽ (ink) trên trang chiếu.');
    },
    cropToEdge(m, p) {
      const s = slideOf(m, p);
      const pic = s.shapes.find(x => x.type === 'pic' && x.x != null && (!p.name || x.name === p.name));
      if (!pic) return fail('Không thấy hình ảnh.');
      if (p.edge === 'b') {
        if (Math.abs(pic.y + pic.cy - m.size.cy) > EMU_IN * 0.02) return fail('Cạnh dưới của ảnh chưa khớp mép trang chiếu.');
        return pic.crop && +pic.crop.b > 0 ? ok('Đã cắt ảnh khớp mép dưới.') : fail('Ảnh được di chuyển/co lại chứ chưa cắt (Crop).');
      }
      const right = pic.x + pic.cx;
      if (Math.abs(right - m.size.cx) > EMU_IN * 0.02) return fail('Cạnh phải của ảnh chưa khớp mép trang chiếu.');
      return pic.crop && +pic.crop.r > 0 ? ok('Đã cắt ảnh khớp mép phải.') : fail('Ảnh được di chuyển/co lại chứ chưa cắt (Crop).');
    },
    tableHeaderMerged(m, p) {
      const s = slideOf(m, p);
      const t = s.shapes.find(x => x.table)?.table;
      if (!t) return fail('Không thấy bảng.');
      const first = t.rows[0];
      const cell = first[0];
      if (norm(cell.text) !== norm(p.text)) return fail(`Hàng đầu đang là "${cell.text}".`);
      if (cell.gridSpan < t.cols) return fail('Hàng đầu chưa hợp nhất các ô.');
      if (p.center && cell.align !== 'ctr') return fail('Tiêu đề chưa căn giữa.');
      return ok('Hàng tiêu đề đúng.');
    },
    shapeGeom(m, p) {
      const s = slideOf(m, p);
      const has = g => s.shapes.some(x => x.geom === g);
      if (p.absent && has(p.absent)) return fail(`Vẫn còn hình ${p.absent}.`);
      return has(p.geom) ? ok(`Đã có hình ${p.geom}.`) : fail(`Chưa có hình ${p.geom}.`);
    },
    alignedTop(m, p) {
      const s = slideOf(m, p);
      const items = s.shapes.filter(x => x.y != null && (p.namePattern ? new RegExp(p.namePattern).test(x.name) : x.type === 'pic'));
      if (items.length < 2) return fail('Không đủ hình để kiểm tra.');
      const ys = items.map(x => x.y);
      return Math.max(...ys) - Math.min(...ys) <= 12700 ? ok('Các hình đã thẳng cạnh trên.') : fail('Cạnh trên các hình chưa bằng nhau.');
    },
    centeredH(m, p) {
      const s = slideOf(m, p);
      const wrong = p.geoms.filter(g => {
        const sh = s.shapes.find(x => x.geom === g);
        return !sh || Math.abs(sh.x + sh.cx / 2 - m.size.cx / 2) > 12700;
      });
      return wrong.length ? fail(`Chưa căn giữa ngang: ${wrong.join(', ')}.`) : ok('Đã căn giữa theo chiều ngang.');
    },
    slideSize(m, p) {
      const w = m.size.cx / EMU_IN, h = m.size.cy / EMU_IN;
      return Math.abs(w - p.width) < 0.02 && Math.abs(h - p.height) < 0.02 ? ok('Kích thước trang chiếu đúng.') : fail(`Kích thước đang là ${w.toFixed(2)}" × ${h.toFixed(2)}".`);
    },
    themeFont(m, p) {
      const t = m.master?.theme;
      if (!t) return fail('Không đọc được theme.');
      const bad = [];
      if (p.theme && !norm(t.name).startsWith(norm(p.theme))) bad.push(`theme là "${t.name}"`);
      if (p.font && !(norm(t.majorFont) === norm(p.font) && norm(t.minorFont) === norm(p.font))) bad.push(`font là ${t.majorFont}/${t.minorFont}`);
      return bad.length ? fail(bad.join('; ') + '.') : ok('Theme và font đúng.');
    },
    masterPictureBullet(m) {
      return m.master?.bulletPictures > 0 ? ok('Đã dùng bullet hình ảnh.') : fail('Bullet cấp 1 chưa dùng hình ảnh.');
    },
    footerText(m, p) {
      const want = norm(p.text);
      const has = s => s.footers.some(f => f.type === 'ftr' && norm(f.text) === want);
      const hasNum = s => s.footers.some(f => f.type === 'sldNum');
      // skipTitle "title" = chỉ bỏ trang tiêu đề (Title Slide); true = bỏ cả Section Header.
      const isTitle = s => (p.skipTitle === 'title' ? /title slide/i : /title slide|section header/i).test(s.layout);
      const wrong = m.slides.filter(s => {
        const should = p.only ? p.only.includes(s.index) : p.skipTitle ? !isTitle(s) : true;
        return has(s) !== should || (p.slideNumber && !isTitle(s) && !hasNum(s));
      }).map(s => s.index);
      return wrong.length ? fail(`Chân trang chưa đúng ở trang chiếu ${list(wrong.map(String), 6)}.`) : ok('Chân trang đúng.');
    },
    layoutExists(m, p) {
      const l = m.master?.layouts.find(x => norm(x.name) === norm(p.name));
      if (!l) return fail(`Chưa có bố cục "${p.name}".`);
      const miss = (p.placeholders || []).filter(t => !l.placeholders.includes(t));
      return miss.length ? fail(`Bố cục thiếu placeholder: ${miss.join(', ')}.`) : ok(`Đã tạo bố cục "${p.name}".`);
    },
    masterPlaceholder(m, p) {
      const X = typeof module !== 'undefined' && module.exports ? require('./xml.js') : root.MosXml;
      const types = X.all(m.master.xml, 'p:ph').map(ph => ph.attrs.type || 'body');
      return types.includes(p.ph) ? ok('Slide Master đã có placeholder.') : fail(`Slide Master chưa có placeholder ${p.ph}.`);
    },
    textEffect(m, p) {
      const s = slideOf(m, p);
      const runs = s.shapes.flatMap(x => x.paragraphs.flatMap(par => par.runs)).filter(r => norm(r.text) && norm(p.text).includes(norm(r.text)));
      if (!runs.length) return fail('Không thấy đoạn văn bản cần định dạng.');
      if (p.spacing !== undefined && !runs.every(r => +r.spc === p.spacing)) return fail('Khoảng cách ký tự chưa đúng.');
      if (p.shadow && !runs.every(r => r.shadow)) return fail('Chưa có hiệu ứng đổ bóng chữ.');
      return ok('Định dạng chữ đúng.');
    },
    animation(m, p) {
      const s = slideOf(m, p);
      const a = s.animations.filter(x => (!p.cls || x.cls === p.cls) && (!p.preset || x.id === p.preset));
      if (!a.length) return fail('Chưa có hiệu ứng hoạt hoạ đúng loại.');
      if (p.sub !== undefined && !a.every(x => x.sub === p.sub)) return fail('Tuỳ chọn hướng hiệu ứng chưa đúng.');
      if (p.minCount && a.length < p.minCount) return fail(`Mới có ${a.length} hiệu ứng, cần ${p.minCount}.`);
      if (p.onClick && !a.every(x => x.node === 'clickEffect')) return fail('Hiệu ứng chưa đặt "On Click".');
      return ok('Hiệu ứng đúng.');
    },
    chartData(m, p) {
      const s = slideOf(m, p);
      const c = s.shapes.find(x => x.chart)?.chart;
      if (!c) return fail('Chưa có biểu đồ.');
      if (p.chartType && !c.types.includes(p.chartType)) return fail(`Loại biểu đồ là ${c.types.join(', ')}.`);
      if (p.series && (c.series.length !== p.series.length || !p.series.every(n => c.series.some(x => norm(x.name) === norm(n))))) return fail('Chuỗi dữ liệu chưa đúng.');
      if (p.categories && !p.categories.every(n => c.series[0]?.cats.some(x => norm(x) === norm(n)))) return fail('Danh mục chưa đúng.');
      return ok('Biểu đồ đúng.');
    },
    coreProp(m, p) {
      const v = m.props[p.prop] || '';
      return norm(v).includes(norm(p.value)) ? ok(`Thuộc tính ${p.prop} đúng.`) : fail(`Thuộc tính ${p.prop} đang là "${v}".`);
    },
    sectionNamed(m, p) {
      const sec = m.sections.find(s => norm(s.name) === norm(p.name));
      if (!sec) return fail(`Chưa có phần "${p.name}".`);
      if (p.first && sec.slides[0] !== p.first) return fail(`Phần "${p.name}" đang bắt đầu ở trang chiếu ${sec.slides[0] || '(trống)'}.`);
      if (p.slides && sec.slides.join(',') !== p.slides.join(',')) return fail(`Phần "${p.name}" đang gồm trang chiếu ${sec.slides.join(', ') || '(trống)'}.`);
      return ok(`Có phần "${p.name}".`);
    },
    largestAtBack(m, p) {
      const s = slideOf(m, p);
      const items = s.shapes.filter(x => !x.group && new RegExp(p.name, 'i').test(x.name) && x.cx);
      if (items.length < 2) return fail('Không đủ hình để kiểm tra.');
      const big = items.reduce((a, b) => (b.cx * b.cy > a.cx * a.cy ? b : a));
      return items[0] === big ? ok('Hình lớn nhất đã ở phía sau.') : fail(`Hình lớn nhất (${big.name}) chưa nằm sau các hình khác.`);
    },
    zOrderTop(m, p) {
      const s = slideOf(m, p);
      const top = s.shapes.filter(x => !x.group).pop();
      return top && new RegExp(p.name, 'i').test(top.name) ? ok('Hình đã ở lớp trên cùng.') : fail(`Lớp trên cùng đang là "${top ? top.name : ''}".`);
    },
    smartArt(m, p) {
      const s = slideOf(m, p);
      if (!s.shapes.some(x => x.smartArt)) return fail('Trang chiếu chưa có SmartArt.');
      if (p.layout && !s.diagrams.layouts.includes(p.layout)) return fail(`Bố cục SmartArt đang là ${s.diagrams.layouts.join(', ') || '?'}.`);
      if (p.colors && !s.diagrams.colors.some(c => (p.colors[0] === '~' ? new RegExp(p.colors.slice(1)).test(c) : c === p.colors))) return fail(`Màu SmartArt đang là ${s.diagrams.colors.join(', ') || '?'}.`);
      if (p.texts) {
        const t = (s.diagrams.texts || []).map(norm);
        const pos = p.texts.map(x => t.findIndex(y => y.includes(norm(x))));
        if (pos.some(i => i < 0)) return fail(`SmartArt chưa có: ${p.texts.filter((x, i) => pos[i] < 0).join(', ')}.`);
        if (pos.some((v, i) => i && v < pos[i - 1])) return fail('Thứ tự các hình trong SmartArt chưa đúng.');
      }
      return ok('SmartArt đúng yêu cầu.');
    },
    // ------------------------------------------------ bổ sung chung: tìm phần tử XML theo phạm vi + hình
    xml(m, p) {
      const XM = typeof module !== 'undefined' && module.exports ? require('./xml.js') : root.MosXml;
      const scope = p.part || 'slide';
      let roots;
      if (scope === 'slide') roots = [slideOf(m, p)];
      else if (scope === 'allSlides') roots = m.slides.filter(s => !p.skipFirst || s.index > 1);
      else if (scope === 'layout') {
        const l = m.master?.layouts.find(x => norm(x.name) === norm(p.layout));
        if (!l) return fail(`Không thấy bố cục "${p.layout}".`);
        roots = [{ xml: l.xml, shapes: null }];
      } else {
        const x = m.parts[scope];
        if (!x) return fail(p.missing || `Tệp chưa có phần ${scope}.`);
        roots = [{ xml: x, shapes: null }];
      }
      const pickShape = r => {
        if (!p.shape) return r.xml || r.node || r;
        const f = p.shape;
        const shapes = r.shapes || XM.all(r.xml, '*').filter(n => ['sp', 'pic', 'graphicFrame', 'grpSp'].includes(n.local)).map(n => ({ node: n, name: XM.first(n, 'p:cNvPr')?.attrs.name || '', text: XM.all(n, 'a:t').map(t => t.text).join(' '), type: n.local, ph: XM.first(n, 'p:ph') ? (XM.first(n, 'p:ph').attrs.type || 'body') : null }));
        const hit = shapes.find(s => (!f.name || new RegExp(f.name, 'i').test(s.name)) && (!f.type || s.type === f.type) && (f.ph === undefined || s.ph === f.ph)
          && (!f.text || norm(s.text).includes(norm(f.text))) && (!f.geom || s.geom === f.geom) && (!f.media || s.hasMedia || s.mediaKind)
          && (!f.smartArt || s.smartArt) && (!f.model3d || s.model3d) && (!f.chart || s.chart || s.chartPath) && (!f.table || s.table));
        return hit ? hit.node : null;
      };
      // el bắt đầu bằng "~" = biểu thức chính quy trên tên phần tử (vd "~Zm" cho Slide/Summary Zoom).
      const match = (node, rule) => (rule.el[0] === '~' ? XM.all(node, '*').filter(n => new RegExp(rule.el.slice(1)).test(n.name)) : XM.all(node, rule.el)).filter(n => Object.entries(rule.attrs || {}).every(([k, v]) => {
        const got = n.attrs[k];
        if (v === null) return got === undefined;
        if (typeof v === 'string' && v[0] === '~') return got !== undefined && new RegExp(v.slice(1), 'i').test(got);
        if (typeof v === 'number') return got !== undefined && Math.abs(+got - v) <= (rule.tol ?? 0);
        return got === String(v);
      }) && (!rule.text || norm(XM.text(n)).includes(norm(rule.text))));
      for (const r of roots) {
        const node = pickShape(r);
        const where = scope === 'allSlides' ? ` (trang chiếu ${r.index})` : '';
        if (!node) return fail((p.noShape || 'Không thấy đối tượng cần kiểm tra.') + where);
        for (const rule of p.has || []) if (match(node, rule).length < (rule.min || 1)) return fail((rule.fail || p.fail || 'Chưa đúng yêu cầu.') + where);
        for (const rule of p.none || []) if (match(node, rule).length) return fail((rule.fail || p.fail || 'Vẫn còn thiết lập cũ.') + where);
      }
      return ok(p.ok || 'Đúng yêu cầu.');
    },
    slideOrder(m, p) {
      const titles = m.slides.map(s => norm(s.title));
      const wrong = Object.entries(p.positions).filter(([i, t]) => !(titles[+i - 1] || '').includes(norm(t))).map(([i]) => i);
      return wrong.length ? fail(`Trang chiếu số ${wrong.join(', ')} chưa đúng.`) : ok('Thứ tự trang chiếu đúng.');
    },
    titleCount(m, p) {
      const n = m.slides.filter(s => norm(s.title).includes(norm(p.title))).length;
      return n === p.count ? ok('Số trang chiếu đúng.') : fail(`Có ${n} trang chiếu tiêu đề "${p.title}", cần ${p.count}.`);
    },
    slideCount(m, p) { return m.slides.length === p.count ? ok(`Có ${p.count} trang chiếu.`) : fail(`Bài đang có ${m.slides.length} trang chiếu, cần ${p.count}.`); },
    slideLayout(m, p) {
      const s = slideOf(m, p);
      return norm(s.layout) === norm(p.layout) ? ok(`Trang chiếu dùng bố cục ${p.layout}.`) : fail(`Bố cục đang là "${s.layout}".`);
    },
    transitionAll(m, p) {
      const bad = m.slides.filter(s => !(s.transitionXml.includes(p.kind) || (s.transition?.all || []).includes(p.kind))).map(s => s.index);
      return bad.length ? fail(`Chưa có hiệu ứng ${p.label || p.kind} ở trang chiếu ${list(bad.map(String), 6)}.`) : ok('Đã áp dụng hiệu ứng chuyển tiếp cho mọi trang chiếu.');
    },
    timings(m, p) {
      const bad = m.slides.filter(s => !s.hidden && !(s.transition && +(s.transition.attrs.advTm || 0) >= (p.min || 1000))).map(s => s.index);
      return bad.length ? fail(`Chưa có thời gian trình chiếu ở trang chiếu ${list(bad.map(String), 6)}.`) : ok('Đã lưu thời gian trình chiếu.');
    },
    animOrder(m, p) {
      const s = slideOf(m, p);
      const XM = typeof module !== 'undefined' && module.exports ? require('./xml.js') : root.MosXml;
      const byId = Object.fromEntries(s.shapes.map(x => [XM.first(x.node, 'p:cNvPr')?.attrs.id, x]));
      const timing = XM.first(s.xml, 'p:timing');
      if (!timing) return fail('Trang chiếu chưa có hiệu ứng hoạt hoạ.');
      const seq = XM.all(timing, 'p:cTn').filter(c => c.attrs.presetClass === (p.cls || 'entr')).map(c => {
        const tg = XM.first(c, 'p:spTgt');
        const sh = byId[tg?.attrs.spid];
        const rg = XM.first(tg, 'p:pRg');
        const paras = sh ? sh.paragraphs.filter(x => x.text.trim()) : [];
        return rg ? (paras[+rg.attrs.st] || {}).text : sh?.text;
      }).filter(Boolean).map(norm);
      const pos = p.order.map(t => seq.findIndex(x => x.includes(norm(t))));
      if (pos.some(i => i < 0)) return fail('Chưa có hiệu ứng cho đủ các mục.');
      return pos.every((v, i) => !i || v > pos[i - 1]) ? ok('Thứ tự hiệu ứng đúng.') : fail('Thứ tự hiệu ứng chưa đúng.');
    },
    comment(m, p) {
      const texts = m.modernComments.concat(m.slides.flatMap(s => s.commentTexts || []));
      if (p.text && !texts.some(t => norm(t).includes(norm(p.text)))) return fail(m.hasComments ? `Chưa có nhận xét "${p.text}".` : 'Chưa chèn nhận xét.');
      return m.hasComments ? ok('Đã chèn nhận xét.') : fail('Chưa chèn nhận xét.');
    },
    chart(m, p) {
      const s = slideOf(m, p);
      const c = s.shapes.filter(x => x.chart).map(x => x.chart).find(x => !p.title || norm(x.title).includes(norm(p.title)));
      if (!c) return fail('Không thấy biểu đồ.');
      if (p.styleN !== undefined && !chartStyleIds(c, p.styleN).includes(String(c.chartStyle))) return fail(`Kiểu biểu đồ chưa phải Style ${p.styleN}.`);
      if (p.palette && String(c.colorStyle) !== String(PALETTE[p.palette])) return fail(`Bảng màu chưa phải ${p.palette}.`);
      if (p.chartType && !c.types.includes(p.chartType)) return fail(`Loại biểu đồ là ${c.types.join(', ')}.`);
      if (p.title2 && norm(c.title) !== norm(p.title2)) return fail(`Tiêu đề biểu đồ đang là "${c.title}".`);
      if (p.legendPos && (!c.legend || c.legendPos !== p.legendPos)) return fail(`Chú giải đang ở "${c.legend ? c.legendPos : 'không có'}".`);
      if (p.dLblPos && c.dLblPos !== p.dLblPos) return fail(`Vị trí nhãn dữ liệu là ${c.dLblPos || 'mặc định'}.`);
      return ok('Biểu đồ đúng.');
    },
    shapePos(m, p) {
      const s = slideOf(m, p);
      const sh = s.shapes.find(x => (!p.kind || x.type === p.kind) && (!p.media || x.hasMedia || x.mediaKind) && (!p.name || new RegExp(p.name, 'i').test(x.name))
        && (p.ph === undefined || x.ph === p.ph) && x.x != null);
      if (!sh) return fail(p.noShape || 'Không thấy đối tượng.');
      const near = (a, b) => Math.abs(a - b) <= EMU_IN * 0.03;
      if (p.sameAs) {
        const ref = s.shapes.find(x => new RegExp(p.sameAs, 'i').test(x.name));
        if (!ref) return fail('Không thấy hình mẫu để so kích thước.');
        if (!near(sh.cx, ref.cx) || !near(sh.cy, ref.cy)) return fail(`Kích thước đang là ${(sh.cx / EMU_IN).toFixed(2)}" × ${(sh.cy / EMU_IN).toFixed(2)}", cần bằng ${ref.name}.`);
      }
      if (p.xIn !== undefined && !near(sh.x, p.xIn * EMU_IN)) return fail(`Vị trí ngang đang là ${(sh.x / EMU_IN).toFixed(2)}".`);
      if (p.yIn !== undefined && !near(sh.y, p.yIn * EMU_IN)) return fail(`Vị trí dọc đang là ${(sh.y / EMU_IN).toFixed(2)}".`);
      if (p.wIn !== undefined && !near(sh.cx, p.wIn * EMU_IN)) return fail(`Chiều rộng đang là ${(sh.cx / EMU_IN).toFixed(2)}".`);
      if (p.hIn !== undefined && !near(sh.cy, p.hIn * EMU_IN)) return fail(`Chiều cao đang là ${(sh.cy / EMU_IN).toFixed(2)}".`);
      if (p.centerV && Math.abs(sh.y + sh.cy / 2 - m.size.cy / 2) > EMU_IN * 0.03) return fail('Chưa căn giữa theo chiều dọc của trang chiếu.');
      return ok('Vị trí, kích thước đúng.');
    },
    tableStyle(m, p) {
      const s = slideOf(m, p);
      const t = s.shapes.find(x => x.table)?.table;
      if (!t) return fail('Không thấy bảng.');
      const name = Object.keys(TABLE_STYLES).find(k => TABLE_STYLES[k] === t.style) || t.style;
      return t.style === TABLE_STYLES[p.name] ? ok(`Bảng dùng kiểu ${p.name}.`) : fail(`Kiểu bảng đang là ${name}.`);
    },
    customShow(m, p) {
      const c = m.customShows.find(x => x.name === p.name);
      if (!c) return fail(`Chưa có custom show "${p.name}".`);
      return !p.slides || c.slides.join(',') === p.slides.join(',') ? ok('Custom show đúng.') : fail(`Custom show gồm trang ${c.slides.join(', ')}.`);
    },
  };

  // ------------------------------------------------ Word
  const TWIP_IN = 1440;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  function blockIndex(m, text) {
    const i = m.blocks.findIndex(b => b.kind === 'p' && norm(b.text) === norm(text));
    return i >= 0 ? i : m.blocks.findIndex(b => b.kind === 'p' && norm(b.text).startsWith(norm(text)) && norm(text).length > 8);
  }
  function listParas(m, p) {
    const ps = m.paragraphs.filter(x => x.num && x.text.trim());
    return p.contains ? ps.filter(x => p.contains.some(t => norm(x.text).includes(norm(t)))) : ps;
  }

  // Khớp phần tử XML theo luật {el, attrs, text, min} — dùng chung cho p.xml / w.xml.
  function xmlMatch(XM, node, rule) {
    const nodes = rule.el[0] === '~' ? XM.all(node, '*').filter(n => new RegExp(rule.el.slice(1)).test(n.name)) : XM.all(node, rule.el);
    return nodes.filter(n => Object.entries(rule.attrs || {}).every(([k, v]) => {
      const got = n.attrs[k];
      if (v === null) return got === undefined;
      if (typeof v === 'string' && v[0] === '~') return got !== undefined && new RegExp(v.slice(1), 'i').test(got);
      if (typeof v === 'number') return got !== undefined && Math.abs(+got - v) <= (rule.tol ?? 0);
      return got === String(v);
    }) && (!rule.text || norm(XM.text(n)).includes(norm(rule.text))));
  }

  const Wd = {
    // Tiêu chí chung: part = body/settings/styles/numbering/header/footer/comments/footnotes/endnotes/app/custom/glossary;
    // para = đoạn văn chứa/bắt đầu bằng chữ; table = bảng chứa chữ; has/none = luật phần tử XML.
    xml(m, p) {
      const XM = typeof module !== 'undefined' && module.exports ? require('./xml.js') : root.MosXml;
      const part = m.parts[p.part || 'body'];
      const roots = (Array.isArray(part) ? part : [part]).filter(Boolean);
      if (!roots.length) return p.emptyOk ? ok(p.ok || 'Đúng yêu cầu.') : fail(p.missing || p.fail || 'Tài liệu chưa có phần cần kiểm tra.');
      const textOf = n => XM.all(n, 'w:t').map(t => t.text).join('');
      const pick = r => {
        if (p.para) {
          const f = p.para;
          const all = XM.all(r, 'w:p');
          let ps;
          if (f.after) {
            // Đoạn có chữ đầu tiên ngay sau đoạn chứa f.after (vd đoạn dưới tiêu đề "1.2 Mission").
            const i = all.findIndex(x => norm(textOf(x)).includes(norm(f.after)) && !XM.first(x, 'w:fldSimple') && !/^toc/i.test(XM.first(x, 'w:pStyle')?.attrs['w:val'] || ''));
            ps = i < 0 ? [] : all.slice(i + 1).filter(x => textOf(x).trim()).slice(0, 1);
          } else if (f.last) ps = all.filter(x => textOf(x).trim()).slice(-1);
          else if (f.bookmark) {
            // Đoạn chứa (hoặc ngay sau) điểm đánh dấu có tên f.bookmark.
            const i = all.findIndex(x => XM.all(x, 'w:bookmarkStart').some(b => b.attrs['w:name'] === f.bookmark));
            ps = i < 0 ? [] : all.slice(i).filter(x => textOf(x).trim()).slice(0, 1);
          } else if (f.withEl) { ps = all.filter(x => xmlMatch(XM, x, f.withEl).length); if (f.pick === 'last') ps = ps.slice(-1); }
          else ps = all.filter(x => { const t = norm(textOf(x)); return f.startsWith ? t.startsWith(norm(f.startsWith)) : t.includes(norm(f.text || '')) && (f.text !== undefined || t); });
          return f.all ? ps : ps.slice(0, 1);
        }
        if (p.table) return XM.all(r, 'w:tbl').filter(x => norm(textOf(x)).includes(norm(p.table))).slice(-1);
        // within = phần tử chứa (vd w:style có w:name "SubObjective Heading").
        if (p.within) return xmlMatch(XM, r, p.within).filter(n => !p.within.has || xmlMatch(XM, n, p.within.has).length).slice(0, 1);
        return [r];
      };
      const nodes = roots.flatMap(pick);
      if (!nodes.length) return fail(p.noShape || 'Không thấy đoạn văn/bảng cần kiểm tra.');
      const okOne = n => (p.has || []).every(rule => xmlMatch(XM, n, rule).length >= (rule.min || 1)) && !(p.none || []).some(rule => xmlMatch(XM, n, rule).length);
      const hits = nodes.filter(okOne);
      if (p.para && p.para.all ? hits.length === nodes.length : hits.length) return ok(p.ok || 'Đúng yêu cầu.');
      const n = nodes[0];
      for (const rule of p.has || []) if (xmlMatch(XM, n, rule).length < (rule.min || 1)) return fail(rule.fail || p.fail || 'Chưa đúng yêu cầu.');
      for (const rule of p.none || []) if (xmlMatch(XM, n, rule).length) return fail(rule.fail || p.fail || 'Vẫn còn thiết lập cũ.');
      return fail(p.fail || 'Chưa đúng yêu cầu.');
    },
    coreProp: P.coreProp,
    tableSize(m, p) {
      const ts = m.tables.filter(t => !p.text || norm(t.text).includes(norm(p.text)));
      const dims = t => [t.rows.length, Math.max(...t.rows.map(r => r.reduce((a, c) => a + (c.span || 1), 0)))];
      const hit = ts.find(t => { const [r, c] = dims(t); return (!p.rows || r === p.rows) && (!p.cols || c === p.cols) && (!p.style || norm(t.style).replace(/\s/g, '') === norm(p.style).replace(/\s/g, '')); });
      if (hit) return ok('Bảng đúng yêu cầu.');
      if (!ts.length) return fail(p.text ? `Chưa có bảng chứa "${p.text}".` : 'Chưa có bảng.');
      const [r, c] = dims(ts[ts.length - 1]);
      return fail(`Bảng đang có ${r} hàng × ${c} cột${p.style ? ', kiểu ' + (ts[ts.length - 1].style || 'mặc định') : ''}.`);
    },
    tableSorted(m, p) {
      const t = m.tables.find(x => norm(x.text).includes(norm(p.text)));
      if (!t) return fail('Không thấy bảng.');
      const vals = t.rows.slice(p.header === false ? 0 : 1).map(r => (r[p.col] || {}).text || '').map(v => (p.numeric ? +String(v).replace(/[^0-9.-]/g, '') : norm(v)));
      for (let i = 1; i < vals.length; i++) {
        const c = p.numeric ? Math.sign(vals[i - 1] - vals[i]) : vals[i - 1].localeCompare(vals[i]);
        if (p.desc ? c < 0 : c > 0) return fail(`Hàng ${i + 1} của bảng chưa đúng thứ tự.`);
      }
      return ok('Bảng đã sắp xếp đúng.');
    },
    noComments(m) { return m.comments ? fail(`Còn ${m.comments} bình luận.`) : ok('Đã xoá hết bình luận.'); },
    textHas(m, p) {
      return norm(m.text).includes(norm(p.text)) || m.tables.some(t => norm(t.text).includes(norm(p.text)))
        ? ok(`Đã có "${p.text}".`) : fail(`Chưa thấy "${p.text}".`);
    },
    textGone(m, p) { return norm(m.text).includes(norm(p.text)) ? fail(`Vẫn còn "${p.text}".`) : ok(`Đã xoá "${p.text}".`); },
    footerField(m, p) {
      const re = new RegExp('^\\s*' + p.field + '\\b', 'i');
      return m.headersFooters.some(h => h.type === (p.part || 'footer') && h.fields.some(f => re.test(f)))
        ? ok(`Đã chèn trường ${p.field} ở ${p.part === 'header' ? 'đầu' : 'chân'} trang.`) : fail(`Chưa có trường ${p.field} ở ${p.part === 'header' ? 'đầu' : 'chân'} trang.`);
    },
    footerText(m, p) {
      const s = m.sections[m.sections.length - 1];
      const f = (s.footers.find(x => x.which === 'default') || {}).text || '';
      if (!norm(f).includes(norm(p.text))) return fail(`Chân trang chưa có "${p.text}".`);
      if (p.notFirst && !(s.titlePg && !norm((s.footers.find(x => x.which === 'first') || {}).text).includes(norm(p.text)))) return fail('Chân trang vẫn hiện ở trang bìa.');
      return ok('Chân trang đúng.');
    },
    field(m, p) {
      const re = new RegExp('^\\s*' + p.instr + '\\b', 'i');
      return m.fields.some(f => re.test(f)) ? ok(`Đã chèn ${p.label || p.instr}.`) : fail(`Chưa có ${p.label || p.instr}.`);
    },
    tableBetween(m, p) {
      const a = blockIndex(m, p.after), b = blockIndex(m, p.before);
      if (a < 0 || b < 0) return fail('Không tìm thấy các tiêu đề mốc.');
      const t = m.blocks.slice(a + 1, b).find(x => x.kind === 'table');
      if (!t) return fail(`Chưa có bảng giữa "${p.after}" và "${p.before}".`);
      const cols = Math.max(...t.rows.map(r => r.length));
      return t.rows.length === p.rows && cols === p.cols ? ok(`Đã chèn bảng ${p.rows}×${p.cols}.`) : fail(`Bảng đang là ${t.rows.length}×${cols}.`);
    },
    setting(m, p) {
      return m.settings.flag(p.name) === p.on ? ok(p.okNote || 'Thiết lập đúng.') : fail(p.failNote || `Thiết lập ${p.name} chưa đúng.`);
    },
    noTablesWith(m, p) {
      if (m.tables.some(t => norm(t.text).includes(norm(p.text)))) return fail('Vẫn còn bảng.');
      return norm(m.text).includes(norm(p.text)) ? ok('Đã chuyển bảng thành văn bản, dữ liệu còn nguyên.') : fail('Dữ liệu trong bảng bị mất.');
    },
    shape(m, p) {
      return m.drawings.some(d => d.geom === p.geom) ? ok(`Đã có hình ${p.geom}.`) : fail(`Chưa có hình ${p.geom}.`);
    },
    picturePos(m, p) {
      const d = m.drawings.find(x => x.kind === 'pic' && (!p.name || x.name === p.name));
      if (!d || !d.anchor) return fail('Hình chưa được đặt vị trí (đang nằm cùng dòng chữ).');
      const h = d.posH || {}, v = d.posV || {};
      const hOk = h.relativeFrom === p.h.relativeFrom && (h.align === p.h.align || (h.offset != null && near(h.offset, 0, 12700) && p.h.align === 'left'));
      const vOk = v.relativeFrom === p.v.relativeFrom && (v.align === 'top' || (v.offset != null && near(v.offset, 0, 12700)));
      if (!hOk) return fail('Vị trí ngang chưa sát lề trái (Margin).');
      return vOk ? ok('Vị trí hình đúng.') : fail('Vị trí dọc chưa sát đoạn văn (0" below Paragraph).');
    },
    drawingKind(m, p, ctx) {
      const pick = mm => mm.drawings.filter(d => d.kind === p.kind);
      const before = ctx.base && p.isNew ? pick(ctx.base).length : 0;
      const ds = pick(m);
      if (ds.length <= before) return fail(`Chưa chèn ${p.label || p.kind}.`);
      const d = p.isNew ? ds[ds.length - 1] : ds[0];
      const cands = p.isNew ? ds : [d];
      const hit = cands.find(x => (!p.wrap || x.wrap === p.wrap) && (!p.widthIn || near(x.cx, p.widthIn * EMU_IN, EMU_IN * 0.03))
        && (!p.heightIn || near(x.cy, p.heightIn * EMU_IN, EMU_IN * 0.03)));
      if (hit) return ok(`${p.label || p.kind} đúng yêu cầu.`);
      const bad = [];
      if (p.wrap && d.wrap !== p.wrap) bad.push(`kiểu bao chữ là ${d.wrap}`);
      if (p.widthIn && !near(d.cx, p.widthIn * EMU_IN, EMU_IN * 0.03)) bad.push(`rộng ${(d.cx / EMU_IN).toFixed(2)}"`);
      if (p.heightIn && !near(d.cy, p.heightIn * EMU_IN, EMU_IN * 0.03)) bad.push(`cao ${(d.cy / EMU_IN).toFixed(2)}"`);
      return fail(`${p.label || p.kind}: ${bad.join('; ')}.`);
    },
    bgRemoved(m) { return m.drawings.some(d => d.bgRemoved) ? ok('Đã xoá nền hình.') : fail('Chưa xoá nền hình (Remove Background).'); },
    tableSingleCell(m, p) {
      const t = m.tables.filter(x => norm(x.text).includes(norm(p.text))).sort((a, b) => a.text.length - b.text.length)[0];
      if (!t) return fail('Không thấy bảng.');
      const cells = t.rows.flat().length;
      return cells === 1 ? ok('Đã hợp nhất thành 1 ô.') : fail(`Bảng còn ${cells} ô.`);
    },
    bookmarkGone(m, p) {
      if (m.bookmarks.includes(p.name)) return fail(`Đánh dấu "${p.name}" và nội dung vẫn còn.`);
      return Wd.textGone(m, { text: p.text });
    },
    altText(m, p) {
      return m.drawings.some(d => norm(d.descr) === norm(p.text) || norm(d.title) === norm(p.text)) ? ok('Đã thêm văn bản thay thế.') : fail(`Chưa có hình nào có Alt Text "${p.text}".`);
    },
    tableColWidth(m, p) {
      const t = m.tables.find(x => x.rows[0] && x.rows[0].some(c => norm(c.text) === norm(p.header)));
      if (!t) return fail('Không thấy bảng.');
      const i = t.rows[0].findIndex(c => norm(c.text) === norm(p.header));
      const w = t.rows[0][i].width || t.grid[i];
      return near(w, p.inches * TWIP_IN, 30) ? ok(`Cột ${p.header} rộng ${p.inches}".`) : fail(`Cột ${p.header} đang rộng ${(w / TWIP_IN).toFixed(2)}".`);
    },
    tableCaption(m, p) {
      return m.tables.some(t => norm(t.caption) === norm(p.text)) ? ok('Đã thêm tiêu đề thay thế cho bảng.') : fail(`Chưa có bảng nào có tiêu đề "${p.text}".`);
    },
    notes(m) {
      if (m.footnotes.length) return fail('Vẫn còn chú thích chân trang (footnote).');
      return m.endnotes.length ? ok('Đã chuyển thành chú thích cuối tài liệu (endnote).') : fail('Chưa có endnote.');
    },
    columns(m, p) {
      const s = m.sections.find(x => x.cols.num === p.num);
      if (!s) return fail(`Chưa chia ${p.num} cột.`);
      if (p.sep && !s.cols.sep) return fail('Chưa có đường kẻ giữa các cột (Line between).');
      return ok(`Đã chia ${p.num} cột.`);
    },
    columnBreak(m) { return m.breaks.column ? ok('Đã chèn Column Break.') : fail('Chưa có Column Break.'); },
    revisions(m, p) {
      const inRev = t => m.revisions.some(r => norm(r.text).includes(norm(t)));
      const stillRev = (p.accepted || []).filter(inRev);
      if (stillRev.length) return fail(`Chưa chấp nhận thay đổi: ${stillRev.join(', ')}.`);
      const lost = (p.accepted || []).filter(t => !norm(m.text).includes(norm(t)));
      if (lost.length) return fail(`Thay đổi bị từ chối nhầm: ${lost.join(', ')}.`);
      if ((p.pending || []).some(t => !inRev(t))) return fail(`Không được chấp nhận/từ chối thay đổi "${p.pending.join('/')}".`);
      return ok('Duyệt thay đổi đúng.');
    },
    listSpacing(m, p) {
      const ps = listParas(m, p);
      const bad = ps.filter(x => +(x.spacing['w:line'] || 240) !== p.line || (x.spacing['w:lineRule'] && x.spacing['w:lineRule'] !== 'auto'));
      return !ps.length ? fail('Không thấy danh sách.') : bad.length ? fail(`Còn ${bad.length} mục chưa giãn dòng ${p.line / 240}.`) : ok('Khoảng cách dòng đúng.');
    },
    listLevel(m, p) {
      const ps = listParas(m, p);
      const bad = ps.filter(x => x.num.ilvl !== p.level - 1);
      return !ps.length ? fail('Không thấy danh sách.') : bad.length ? fail(`Còn ${bad.length} mục chưa ở mức ${p.level}.`) : ok(`Danh sách ở mức ${p.level}.`);
    },
  };

  const REGISTRY = {};
  for (const [k, f] of Object.entries(X)) REGISTRY['x.' + k] = f;
  for (const [k, f] of Object.entries(P)) REGISTRY['p.' + k] = f;
  for (const [k, f] of Object.entries(Wd)) REGISTRY['w.' + k] = f;

  /** Chạy 1 tiêu chí (một đối tượng {type,...} hoặc {all:[...]}) — lỗi đọc tệp tính là sai, kèm lý do. */
  function run(spec, model, ctx) {
    // any: đạt một trong các cách làm (vd có hoặc không dùng TRIM).
    if (spec.any) {
      let last = null;
      for (const s of spec.any) { const r = run(s, model, ctx); if (r.pass) return r; last = last || r; }
      return last || fail('Chưa đạt.');
    }
    if (spec.all) {
      for (const s of spec.all) { const r = run(s, model, ctx); if (!r.pass) return r; }
      return ok(spec.note || 'Đạt tất cả yêu cầu.');
    }
    const f = REGISTRY[spec.type];
    if (!f) return { pass: null, note: 'Chưa hỗ trợ chấm tự động.' };
    try { return f(model, spec, ctx); } catch (e) { return fail(e.message); }
  }

  const api = { run, REGISTRY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MosChecks = api;
})(typeof window !== 'undefined' ? window : globalThis);
