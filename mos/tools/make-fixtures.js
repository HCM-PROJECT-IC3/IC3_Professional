// Tạo bài mẫu "đã làm đúng" cho test-rubrics.js bằng cách sửa XML giống cách Office lưu.
// Bài mẫu chỉ để kiểm tra bộ chấm đọc đúng cấu trúc — không thay được việc thử với tệp lưu từ Office thật.
//   node mos/tools/make-fixtures.js
const fs = require('fs');
const path = require('path');
const JSZip = require('../../js/vendor/jszip.min.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'fixtures');

function setCell(xml, addr, inner, attrs = '') {
  const row = +addr.replace(/^[A-Z]+/, '');
  const cellRe = new RegExp(`<c r="${addr}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const m = cellRe.exec(xml);
  const style = m ? (/ s="\d+"/.exec(m[1]) || [''])[0] : '';
  const cell = `<c r="${addr}"${style}${attrs}${inner ? '>' + inner + '</c>' : '/>'}`;
  if (m) return xml.replace(cellRe, cell);
  const rowRe = new RegExp(`(<row r="${row}"[^>]*?)(/>|>)`);
  if (!rowRe.test(xml)) throw new Error('Không có hàng ' + row);
  // Chèn cuối hàng: các ô test đều nằm bên phải ô đã có.
  return xml.replace(new RegExp(`(<row r="${row}"[^>]*>[\\s\\S]*?)(</row>)`), `$1${cell}$2`).replace(rowRe, (s, a, b) => b === '/>' ? `${a}>${cell}</row>` : s);
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const done = {};

// tasks: các task bài mẫu đã làm (mặc định: tất cả task có tiêu chí).
async function edit(src, dest, fn, tasks) {
  if (tasks) done[dest.replace(/\.\w+$/, '')] = tasks;
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(ROOT, src)));
  const io = {
    get: p => zip.file(p).async('string'),
    put: (p, s) => zip.file(p, s),
    files: () => Object.keys(zip.files),
  };
  await fn(io);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, dest), await zip.generateAsync({ type: 'nodebuffer' }));
  console.log('đã tạo', dest);
}

async function addXf(io, fromS, patch) {
  let st = await io.get('xl/styles.xml');
  const block = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(st);
  const xfs = block[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g);
  const xf = patch(xfs[fromS]);
  st = st.replace(block[0], `<cellXfs count="${xfs.length + 1}">${block[2]}${xf}</cellXfs>`);
  io.put('xl/styles.xml', st);
  return xfs.length;
}

(async () => {
  // Excel Tiết 3 · Project 1
  await edit('files/excel/t3/p1/Project_1.xlsx', 'excel-t3-p1.xlsx', async io => {
    let s3 = await io.get('xl/worksheets/sheet3.xml');
    s3 = setCell(setCell(s3, 'A11', ''), 'B11', '');
    const sOf = a => +(new RegExp(`<c r="${a}"[^>]*? s="(\\d+)"`).exec(s3) || [0, 0])[1];
    const map = {};
    for (const col of 'BCD') for (let r = 4; r <= 9; r++) {
      const a = col + r, s = sOf(a);
      if (map[s] === undefined) map[s] = await addXf(io, s, x => x.replace(/numFmtId="\d+"/, 'numFmtId="4"').replace('<xf ', '<xf applyNumberFormat="1" '));
      s3 = s3.replace(new RegExp(`(<c r="${a}"[^>]*?) s="\\d+"`), `$1 s="${map[s]}"`);
    }
    io.put('xl/worksheets/sheet3.xml', s3);

    // Xoá hàng "Manley Valve" trong bảng (Table Rows): chỉ cột A:C dời lên, L8 giữ nguyên.
    let s2 = await io.get('xl/worksheets/sheet2.xml');
    const val = (x, a) => (new RegExp(`<c r="${a}"[^>]*?>([\\s\\S]*?)</c>`).exec(x) || [0, ''])[1];
    const tAttr = (x, a) => (new RegExp(`<c r="${a}"([^>]*?)>`).exec(x) || [0, ''])[1].replace(/ r="[^"]*"| s="\d+"/g, '');
    for (let r = 8; r <= 10; r++) for (const c of 'ABC') s2 = setCell(s2, c + r, val(s2, c + (r + 1)), tAttr(s2, c + (r + 1)));
    for (const c of 'ABC') s2 = setCell(s2, c + 11, '');
    io.put('xl/worksheets/sheet2.xml', s2);
    io.put('xl/tables/table2.xml', (await io.get('xl/tables/table2.xml')).replace(/ref="A3:C11"/g, 'ref="A3:C10"'));

    let s1 = await io.get('xl/worksheets/sheet1.xml');
    const vip = { 4: [3773, 1752, 1644, 3663], 5: [3786, 1751, 1653, 2472], 6: [3791, 3720, 1843, 2593], 7: [3738, 3711, 1819, 2600], 8: [3704, 3667, 1775, 3302], 9: [3678, 3692, 1792, 3591], 10: [3695, 3667, 1695, 3880] };
    for (const [r, v] of Object.entries(vip)) s1 = setCell(s1, 'C' + r, `<f>AVERAGE(D${r}:G${r})</f><v>${v.reduce((a, b) => a + b) / 4}</v>`);
    io.put('xl/worksheets/sheet1.xml', s1);

    let s4 = await io.get('xl/worksheets/sheet4.xml');
    const first = ['Philip', 'Franklyn', 'Shavonne', 'Shavon', 'Loreta', 'Teresa', 'Libbie', 'Lester', 'Francesca', 'Judie'];
    first.forEach((n, i) => { s4 = setCell(s4, 'C' + (i + 4), `<f>${esc(`A${i + 4}&"@gmail.com"`)}</f><v>${n}@gmail.com</v>`, ' t="str"'); });
    io.put('xl/worksheets/sheet4.xml', s4);

    let ch = await io.get('xl/charts/chart1.xml');
    const sers = ch.match(/<c:ser>[\s\S]*?<\/c:ser>/g);
    const ser = (i, col, name) => sers[0]
      .replace(/<c:idx val="\d+"\/>/, `<c:idx val="${i}"/>`).replace(/<c:order val="\d+"\/>/, `<c:order val="${i}"/>`)
      .replace(/<c:tx>[\s\S]*?<\/c:tx>/, `<c:tx><c:strRef><c:f>'New Accounts'!$${col}$3</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx>`);
    for (const s of sers) ch = ch.replace(s, '');
    io.put('xl/charts/chart1.xml', ch.replace(/(<c:varyColors val="\d"\/>)/, `$1${ser(0, 'B', 'Opening Balance')}${ser(1, 'C', 'Current Balance')}`));
  });

  // Excel Tiết 3 · Project 6
  await edit('files/excel/t3/p6/Project_6.xlsx', 'excel-t3-p6.xlsx', async io => {
    let s1 = await io.get('xl/worksheets/sheet1.xml');
    s1 = s1.replace(/<sheetView ([^>]*?)(\/>|>[\s\S]*?<\/sheetView>)/, '<sheetView $1><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/></sheetView>');
    const a1s = +/<c r="A1"[^>]*? s="(\d+)"/.exec(s1)[1];
    const left = await addXf(io, a1s, x => x.replace(/horizontal="\w+"/, 'horizontal="left"'));
    s1 = s1.replace(/(<c r="A1"[^>]*?) s="\d+"/, `$1 s="${left}"`);
    const cf = '<conditionalFormatting sqref="E4:E18"><cfRule type="iconSet" priority="1"><iconSet><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet></cfRule></conditionalFormatting>';
    s1 = s1.replace(/(<tableParts|<pageMargins)/, cf + '$1');
    const rate = 0.1;
    const rev = r => +(new RegExp(`<c r="G${r}"[^>]*>[\\s\\S]*?<v>([^<]*)</v>`).exec(s1)[1]);
    for (let r = 4; r <= 18; r++) s1 = setCell(s1, 'H' + r, `<f>ProductList[[#This Row],[Revenue]]*Rate</f><v>${rev(r) * rate}</v>`);
    io.put('xl/worksheets/sheet1.xml', s1);
    io.put('xl/tables/table1.xml', (await io.get('xl/tables/table1.xml')).replace(/TableStyleLight12/, 'TableStyleMedium1'));
    const colors = io.files().find(f => /xl\/charts\/colors\d*\.xml/.test(f));
    if (colors) io.put(colors, (await io.get(colors)).replace(/id="\d+"/, 'id="11"'));
  });

  // PowerPoint Tiết 1 · Project 2
  await edit('files/powerpoint/t1/p2/Project 2.pptx', 'ppt-t1-p2.pptx', async io => {
    const pres = await io.get('ppt/presentation.xml');
    const rels = await io.get('ppt/_rels/presentation.xml.rels');
    const ids = [...pres.matchAll(/<p:sldId [^>]*r:id="(rId\d+)"/g)].map(m => m[1]);
    const target = id => 'ppt/' + new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels).slice(1).find(Boolean);
    const last = target(ids[ids.length - 1]);
    io.put(last, (await io.get(last)).replace(/<p:sld /, '<p:sld show="0" '));
    const s5 = target(ids[4]);
    io.put(s5, (await io.get(s5)).replace(/ show="0"/, ''));
    const s2 = target(ids[1]);
    let x2 = await io.get(s2);
    x2 = x2.replace(/(<a:r><a:rPr )([^>]*?)(\/?>)((?:[\s\S](?!<a:r>))*?SUPPLIER POWER)/, '$1spc="300" $2$3$4');
    x2 = x2.replace(/<a:r><a:rPr ([^>]*?)\/>(<a:t>[^<]*(?:SUPPLIER POWER|Well-integrated)[^<]*<\/a:t>)/g, '<a:r><a:rPr spc="300" $1><a:effectLst><a:outerShdw blurRad="38100" dist="38100" dir="2700000" algn="tl"><a:srgbClr val="000000"><a:alpha val="43137"/></a:srgbClr></a:outerShdw></a:effectLst></a:rPr>$2');
    io.put(s2, x2);
  }, [1, 2, 3]);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(done, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
