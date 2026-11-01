/* Máy chủ trường (server/): hàng đợi bài nộp với Apps Script GIẢ + phát trang qua HTTP thật.
   Không gọi Google. Chạy: node server/__tests__/server.test.js */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { createRelay } = require('../relay');
const { createSync, blobSha } = require('../sync');

let fails = 0;
const eq = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)));
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ic3-relay-'));
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const quiet = { log() {}, warn() {} };
const sub = (id, extra) => JSON.stringify(Object.assign({ action: 'submitExam', endpoint: GAS,
  payload: { submissionId: id, studentName: 'An', testName: 'T', score: 50 } }, extra));

// Apps Script giả: ghi lại mọi lượt gọi, trả lời theo `mode`.
function fakeGas(mode) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    let out;
    if (mode.down) throw new Error('mạng hỏng');
    if (body.action === 'submitBatch') {
      out = mode.noBatch ? { ok: false, code: 'not-found', error: 'Không rõ action' }
        : { ok: true, data: { results: body.items.map((it) => (it.payload.score > 100 ? { ok: false, code: 'invalid-argument', error: 'score' } : { ok: true, data: { written: true } })) } };
    } else {
      out = body.payload.score > 100 ? { ok: false, code: 'invalid-argument', error: 'score' } : { ok: true, data: { written: true } };
    }
    return { status: 200, text: async () => JSON.stringify(out) };
  };
  return { calls, fetch };
}

(async () => {
  // ── Theo lô ──
  {
    const dir = tmp();
    const gas = fakeGas({});
    const r = createRelay({ dir, token: 'tok', batch: 50, fetch: gas.fetch, log: quiet });
    const a = r.accept(sub('aaaaaa01'), '10.0.0.1');
    eq('nhận bài → báo đã nộp ngay (dạng trả lời như Apps Script)', [a.status, a.body.ok, a.body.data.queued], [200, true, true]);
    eq('bài nằm trên đĩa trước khi báo', fs.readFileSync(path.join(dir, 'outbox.jsonl'), 'utf8').includes('aaaaaa01'), true);
    eq('gửi lại cùng mã → trùng, không xếp thêm', [r.accept(sub('aaaaaa01'), '10.0.0.1').body.data.duplicate, r.status().pending], [true, 1]);
    for (let i = 2; i <= 5; i++) r.accept(sub('aaaaaa0' + i), '10.0.0.' + i);
    r.accept(sub('badscore1', { payload: { submissionId: 'badscore1', studentName: 'B', score: 500 } }), '10.0.0.9');
    eq('URL lạ (không phải Apps Script) bị từ chối', r.accept(sub('cccccc01', { endpoint: 'http://evil/' }), 'x').body.code, 'invalid-argument');
    eq('action khác bài nộp bị từ chối', r.accept(JSON.stringify({ action: 'githubPublish', endpoint: GAS, payload: {} }), 'x').body.code, 'not-found');
    eq('mã bài sai bị từ chối ngay', r.accept(sub('../x'), 'x').body.code, 'invalid-argument');
    await r.flush();
    eq('6 bài → 1 lượt gọi Apps Script (submitBatch kèm mã)', [gas.calls.length, gas.calls[0].body.action, gas.calls[0].body.token, gas.calls[0].body.items.length], [1, 'submitBatch', 'tok', 6]);
    eq('gửi xong → hàng đợi trống, tệp hàng đợi trống', [r.status().pending, fs.readFileSync(path.join(dir, 'outbox.jsonl'), 'utf8')], [0, '']);
    eq('bài Apps Script từ chối hẳn → rejected.jsonl, không gửi lại', [r.status().rejected, fs.readFileSync(path.join(dir, 'rejected.jsonl'), 'utf8').includes('badscore1')], [1, true]);
  }
  // ── Apps Script cũ chưa có submitBatch → gửi từng bài ──
  {
    const gas = fakeGas({ noBatch: true });
    const r = createRelay({ dir: tmp(), token: 'tok', fetch: gas.fetch, log: quiet });
    ['bbbbbb01', 'bbbbbb02', 'bbbbbb03', 'bbbbbb04'].forEach((id) => r.accept(sub(id), 'x'));
    await r.flush();
    eq('không có submitBatch → 1 lượt thử lô + 4 lượt từng bài', gas.calls.map((c) => c.body.action), ['submitBatch', 'submitExam', 'submitExam', 'submitExam', 'submitExam']);
    eq('không gửi mã RELAY_TOKEN khi gửi từng bài', gas.calls.slice(1).every((c) => !('token' in c.body)), true);
    r.accept(sub('bbbbbb05'), 'x');
    await r.flush();
    eq('đã biết không có lô → lần sau gửi từng bài luôn', gas.calls.slice(5).map((c) => c.body.action), ['submitExam']);
  }
  // ── Mất mạng: giữ bài, khởi động lại vẫn còn ──
  {
    const dir = tmp();
    const mode = { down: true };
    const gas = fakeGas(mode);
    const r = createRelay({ dir, token: '', fetch: gas.fetch, log: quiet });
    r.accept(sub('dddddd01'), 'x'); r.accept(sub('dddddd02'), 'x');
    await r.flush();
    eq('mất mạng → bài vẫn trong hàng đợi', [r.status().pending, !!r.status().lastError], [2, true]);
    mode.down = false;
    const r2 = createRelay({ dir, token: '', fetch: gas.fetch, log: quiet });
    eq('khởi động lại → nạp lại bài chưa gửi', r2.status().pending, 2);
    eq('bài đã nhận trước khi khởi động lại vẫn bị coi là trùng', r2.accept(sub('dddddd01'), 'x').body.data.duplicate, true);
    await r2.flush();
    eq('có mạng lại → gửi hết', r2.status().pending, 0);
  }
  // ── Chống gửi rác theo IP ──
  {
    const r = createRelay({ dir: tmp(), ratePerMin: 3, fetch: fakeGas({}).fetch, log: quiet });
    const codes = [1, 2, 3, 4].map((i) => r.accept(sub('eeeeee0' + i), '10.9.9.9').status);
    eq('quá ratePerMin bài/phút/IP → 429', codes, [200, 200, 200, 429]);
  }

  // ── Tự cập nhật từ GitHub (GitHub giả) ──
  {
    const root = tmp();
    const data = tmp();
    const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
    put('index.html', 'cũ'); put('data/a.json', '{"a":1}'); put('apps/Code.gs', 'bí mật'); put('js/crlf.js', 'a\r\nb\r\n'); // bản checkout Windows
    const gh = { commit: 'a'.repeat(40), files: { 'index.html': 'MỚI', 'data/a.json': '{"a":1}', 'data/b.json': '{"b":2}', 'apps/Code.gs': 'x', 'mos/files/excel/p.xlsx': 'y', 'js/crlf.js': 'a\nb\n' }, calls: [], corrupt: false };
    const resp = (status, body, hdr) => ({ status, ok: status < 300, headers: { get: (k) => (hdr || {})[k.toLowerCase()] || null },
      text: async () => body, json: async () => JSON.parse(body), arrayBuffer: async () => Buffer.from(body) });
    const fetch = async (url, init) => {
      gh.calls.push(url);
      if (url.includes('/commits/')) {
        const etag = '"e-' + gh.commit + '"';
        return (init.headers['If-None-Match'] === etag) ? resp(304, '') : resp(200, gh.commit, { etag });
      }
      if (url.includes('/git/trees/')) {
        return resp(200, JSON.stringify({ tree: Object.entries(gh.files).map(([p, t]) => ({ path: p, type: 'blob', size: Buffer.byteLength(t), sha: blobSha(Buffer.from(t)) })) }));
      }
      const rel = decodeURIComponent(url.split('/' + gh.commit + '/')[1]);
      return resp(200, gh.corrupt ? 'hỏng' : gh.files[rel]);
    };
    const isPublic = (u) => !/^\/apps\//.test(u) && !u.startsWith('/mos/files/');
    const mk = () => createSync({ repo: 'o/r', root, overlay: path.join(data, 'site'), isPublic, fetch, log: quiet });
    const s1 = mk();
    await s1.run();
    const raws = gh.calls.filter((u) => u.includes('raw.githubusercontent.com'));
    eq('lần đầu: chỉ tải tệp khác GitHub (bỏ tệp trùng kể cả khác CRLF/LF, mã Apps Script, tệp đề MOS)', raws.map((u) => u.split('/').slice(-2).join('/')).sort(), ['data/b.json', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/index.html'].sort());
    eq('tệp mới vào thư mục phủ, ảnh giữ nguyên', [fs.readFileSync(path.join(data, 'site/index.html'), 'utf8'), fs.readFileSync(path.join(root, 'index.html'), 'utf8'), s1.status().commit], ['MỚI', 'cũ', gh.commit]);
    gh.calls.length = 0;
    await mk().run(); // khởi động lại: nhớ commit + ETag
    eq('không có commit mới → chỉ 1 lượt hỏi (304, không tính hạn mức API)', gh.calls.length, 1);
    gh.commit = 'b'.repeat(40); gh.files['data/a.json'] = '{"a":2}'; gh.corrupt = true;
    const s2 = mk();
    await s2.run();
    eq('tệp tải về sai mã → báo lỗi, không ghi nhận commit', [!!s2.status().error, s2.status().commit], [true, 'a'.repeat(40)]);
    eq('tệp hỏng không được ghi', fs.existsSync(path.join(data, 'site/data/a.json')), false);
    gh.corrupt = false;
    await s2.run();
    eq('lượt sau làm lại được', [s2.status().error, fs.readFileSync(path.join(data, 'site/data/a.json'), 'utf8')], [null, '{"a":2}']);
    gh.commit = 'c'.repeat(40); gh.files['index.html'] = 'cũ'; // GitHub trùng lại bản trong ảnh (vd vừa build lại)
    await s2.run();
    eq('GitHub trùng bản trong ảnh → bỏ bản phủ', fs.existsSync(path.join(data, 'site/index.html')), false);
    eq('tắt khi SITE_SYNC_MIN = 0', createSync({ repo: 'o/r', minutes: 0, root, overlay: path.join(data, 'site'), fetch, log: quiet }).status().enabled, false);
  }

  // ── Phát trang qua HTTP ──
  process.env.DATA_DIR = tmp();
  process.env.MOS_WORK = tmp();
  process.env.PEER_PUBLIC_PORT = '9000';
  process.env.SITE_SYNC_REPO = ''; // không gọi GitHub thật
  fs.mkdirSync(path.join(process.env.DATA_DIR, 'site'), { recursive: true });
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'site', 'robots.txt'), 'bản từ GitHub');
  const { server } = require('../server');
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const get = (p, headers, method, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: method || 'GET', headers: headers || {} }, (res) => {
      const parts = [];
      res.on('data', (d) => parts.push(d));
      res.on('end', () => {
        let buf = Buffer.concat(parts);
        if (res.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
        resolve({ status: res.statusCode, headers: res.headers, text: buf.toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
  const cfg = await get('/js/backend-config.js', { 'accept-encoding': 'gzip' });
  eq('backend-config.js: gzip + báo trang đang ở máy chủ trường', [cfg.status, cfg.headers['content-encoding'], /schoolServer = \{ relayUrl: '\/api\/gas' \}/.test(cfg.text)], [200, 'gzip', true]);
  eq('backend-config.js: PeerServer riêng cho Phòng cả lớp', /port: 9000/.test(cfg.text), true);
  const cfgRun = { window: { EduBackend: null } };
  require('vm').runInNewContext(cfg.text, Object.assign(cfgRun, { location: { hostname: '10.0.0.5', protocol: 'http:' } }));
  eq('backend-config.js sau khi nối vẫn chạy được', [cfgRun.window.EduBackend.schoolServer.relayUrl, cfgRun.window.EduBackend.arenaRoom.peer.host], ['/api/gas', '10.0.0.5']);
  const etag = cfg.headers.etag;
  eq('304 khi không đổi', (await get('/js/backend-config.js', { 'if-none-match': etag })).status, 304);
  eq('trang chủ', [(await get('/')).status, /<html/i.test((await get('/')).text)], [200, true]);
  eq('MOS: cấu hình có relayUrl', /relayUrl = '\/api\/gas'/.test((await get('/mos/js/config.js')).text), true);
  eq('MOS: /mos/api/info báo có máy chủ phòng máy', JSON.parse((await get('/mos/api/info')).text).server, 'mos');
  eq('/mos → /mos/', (await get('/mos')).status, 301);
  eq('không phát mã Apps Script / công cụ / mã máy chủ / .git',
    await Promise.all(['/apps/Code.gs', '/scripts/check-js.js', '/server/relay.js', '/.git/config', '/mos/server.js', '/firestore.rules', '/js/services/__tests__/roster-cache.test.js'].map(async (p) => (await get(p)).status)),
    [404, 404, 404, 404, 404, 404, 404]);
  eq('không ra ngoài thư mục web', (await get('/..%2f..%2fetc/passwd')).status >= 400, true);
  const posted = await get('/api/gas', { 'content-type': 'text/plain' }, 'POST', sub('ffffff01'));
  eq('POST /api/gas nhận bài', [posted.status, JSON.parse(posted.text).ok], [200, true]);
  eq('/api/gas/status đếm bài chờ gửi', JSON.parse((await get('/api/gas/status')).text).pending, 1);
  eq('tệp trong thư mục phủ (GitHub mới hơn) được phát trước tệp trong ảnh', (await get('/robots.txt')).text, 'bản từ GitHub');
  const st = JSON.parse((await get('/api/status')).text);
  eq('/api/status: hàng đợi + đồng bộ', [st.submissions.pending, st.siteSync.enabled], [1, false]);
  eq('MOS: trang tĩnh phát qua máy chủ chung (gzip)', (await get('/mos/js/app.js', { 'accept-encoding': 'gzip' })).headers['content-encoding'], 'gzip');
  server.close();

  console.log(fails ? `\n${fails} FAIL` : '\nTất cả PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
