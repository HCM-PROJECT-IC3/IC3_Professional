/* Các loại kiểm tra dùng trong mos/data/rubrics/*.json. Mỗi hàm nhận (model, params, ctx) và trả về
   { pass, note }. ctx.base = mô hình tệp đề gốc (chỉ có với Excel) để so "trước/sau".
   Nguyên tắc: chỉ chấm điều đọc chắc được trong tệp; không chắc thì để task ở dạng tự kiểm. */
(function (root) {
  'use strict';

  const Office = typeof module !== 'undefined' && module.exports ? require('./office-model.js') : root.MosOffice;
  const { expandRange, parseAddr, colName } = Office;

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
      const rows = rowsOf(p).map(r => p.keys.map(k => norm(s.value(k.col + r))));
      for (let i = 1; i < rows.length; i++) {
        for (let k = 0; k < p.keys.length; k++) {
          const c = rows[i - 1][k].localeCompare(rows[i][k], 'en', { numeric: true }) * (p.keys[k].desc ? -1 : 1);
          if (c < 0) break;
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
      return bad.length ? fail('Biểu đồ mới: ' + bad.join('; ') + '.') : ok('Đã tạo biểu đồ đúng.');
    },
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
      const isTitle = s => /title slide|section header/i.test(s.layout);
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
      return m.sections.some(s => norm(s.name) === norm(p.name)) ? ok(`Có phần "${p.name}".`) : fail(`Chưa có phần "${p.name}".`);
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
    return m.blocks.findIndex(b => b.kind === 'p' && norm(b.text) === norm(text));
  }
  function listParas(m, p) {
    const ps = m.paragraphs.filter(x => x.num && x.text.trim());
    return p.contains ? ps.filter(x => p.contains.some(t => norm(x.text).includes(norm(t)))) : ps;
  }

  const Wd = {
    coreProp: P.coreProp,
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
