"""Đo khi trang bị mở DỒN: NetSupport mở cùng 1 trang trên cả phòng máy, 1 máy mở nhiều tab cùng lúc, F5 liên tục, bấm nút
liên tục. Lượt đọc/ghi do MÁY CHỦ đếm (shared-db-server.py) nên không mất khi trang tải lại/đóng giữa chừng — Firestore thật
vẫn tính phí truy vấn đã gửi. Firestore giả có độ trễ giống thật (mặc định 300 ms + 1 ms/doc: 3.000 học sinh ≈ 3,3 giây).
  python scripts/measure-firestore/serve.py 8765 &                # ở thư mục gốc dự án (http.server thường từ chối khi mở dồn)
  python scripts/measure-firestore/shared-db-server.py 8766 &
  python scripts/measure-firestore/burst.py @machines.json @steps.json
machines: như multi.py — {"A":{"uid":"admin1","role":"admin"}, "G":{"uid":"t3","role":"teacher","schools":["Trường 3"]}}
steps:
  {"m":"A","do":"goto","arg":"admin-users.html"}                         mở 1 trang (tab chính của máy A)
  {"m":"A","do":"tabs","arg":{"page":"admin-users.html","n":5}}          mở 5 tab CÙNG LÚC trên máy A (chung bản đệm)
  {"m":"A","do":"spam","arg":{"page":"roster-manager.html","n":8,"ms":500}} mở rồi F5 8 lần, cách 500 ms
  {"m":"A","do":"clicks","arg":{"sel":"#refreshBtn","n":5,"ms":150}}     bấm 5 lần liên tiếp trên tab chính
  {"do":"fleet","arg":{"page":"index.html","n":30,"profile":{...}}}      30 máy MỚI cùng mở 1 trang (NetSupport)
  {"do":"time","arg":"+2h"}   {"m":"A","do":"eval","arg":"js"}
Biến môi trường: FS_BASELINE=1 (đối chứng: tắt khoá giữa tab + hoãn F5) · FS_LATENCY='{"base":300,"perDoc":1}' · FS_WAIT=ms chờ sau mỗi bước (mặc định 12000) · FS_DEBUG=1."""
import sys, json, asyncio, datetime, urllib.request, os, re
sys.stdout.reconfigure(encoding='utf-8')
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765'; SHARED = os.environ.get('FS_SHARED', 'http://localhost:8766')
FAKE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fake-firebase.js'), encoding='utf-8').read()
LAT = json.loads(os.environ.get('FS_LATENCY', '{"base":300,"perDoc":1}'))
WAIT = int(os.environ.get('FS_WAIT', '12000'))
# FS_BASELINE=1: tắt khoá giữa các tab (Web Locks) + hoãn F5 của auth-guard — đo đối chứng cùng kịch bản
BASELINE = bool(os.environ.get('FS_BASELINE'))
NET = {'appsScript': 0, 'sdk': 0, 'actions': {}}

async def route(r):
    u = r.request.url
    if 'gstatic.com/firebasejs' in u:
        if 'firebase-app-compat' in u: NET['sdk'] += 1
        return await r.fulfill(status=200, content_type='application/javascript', body=FAKE if 'firebase-app-compat' in u else '/**/')
    if BASELINE and u.endswith('js/auth-guard.js'):  # so sánh: tắt hoãn F5
        resp = await r.fetch(); return await r.fulfill(response=resp, body=(await resp.text()).replace('const RELOAD_SETTLE_MS = 1500;', 'const RELOAD_SETTLE_MS = 0;'))
    if u.startswith(BASE) or u.startswith(SHARED): return await r.continue_()
    if 'script.google' in u:
        NET['appsScript'] += 1
        body = r.request.post_data or ''
        m = re.search(r'[?&]action=([\w-]+)', u) or re.search(r'"action"\s*:\s*"([\w-]+)"', body)
        a = m.group(1) if m else (r.request.method + ' ?')
        NET['actions'][a] = NET['actions'].get(a, 0) + 1
        return await r.fulfill(status=200, content_type='application/json', body='{"ok":false}', headers={'access-control-allow-origin': '*'})
    return await r.abort()

_a = lambda x: open(x[1:], encoding='utf-8').read() if x.startswith('@') else x
prof = lambda c: {k: c[k] for k in ('uid', 'role', 'schools', 'name') if k in c}
MACH = json.loads(_a(sys.argv[1])); STEPS = json.loads(_a(sys.argv[2]))
PROFILES = list({c['uid']: prof(c) for c in MACH.values()}.values())

def get(path):
    return json.loads(urllib.request.urlopen(SHARED + path).read() or b'{}')

async def main():
    urllib.request.urlopen(urllib.request.Request(SHARED + '/db', method='POST'))
    t0 = datetime.datetime.now(); off = datetime.timedelta(); rows = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def new_ctx(cfg):
            c = await b.new_context(viewport={'width': 1280, 'height': 900}); await c.route('**/*', route)
            await c.clock.install(time=t0 + off)
            if BASELINE: await c.add_init_script("Object.defineProperty(Navigator.prototype,'locks',{get:()=>undefined,configurable:true});")
            await c.add_init_script('window.__FS_SHARED=%s;window.__FS_PROFILES=%s;window.__FS_PROFILE=%s;window.__FS_LATENCY=%s;' % (
                json.dumps(SHARED), json.dumps(PROFILES), json.dumps(prof(cfg)), json.dumps(LAT)))
            return c
        ctxs = {}; pages = {}
        for name, cfg in MACH.items():
            ctxs[name] = await new_ctx(cfg); pages[name] = await ctxs[name].new_page()
            if os.environ.get('FS_DEBUG'):
                pages[name].on('pageerror', lambda e, n=name: print('   [%s pageerror] %s' % (n, str(e)[:160])))
        for st in STEPS:
            do = st['do']; m = st.get('m'); arg = st.get('arg'); extra = ''
            r0 = get('/rstats'); w0 = get('/stats'); a0 = NET['appsScript']; s0 = NET['sdk']; act0 = dict(NET['actions'])
            if do == 'time':
                n = int(arg[1:-1]); off += datetime.timedelta(hours=n) if arg[-1] == 'h' else datetime.timedelta(days=n) if arg[-1] == 'd' else datetime.timedelta(minutes=n)
                for c in ctxs.values(): await c.clock.set_system_time(t0 + off)
                rows.append(('--', f'⏩ đồng hồ {arg}', '', '')); continue
            if do == 'goto':
                await pages[m].goto(BASE + '/' + arg); await pages[m].wait_for_timeout(WAIT); label = f'goto {arg}'
            elif do == 'tabs':
                tabs = [await ctxs[m].new_page() for _ in range(arg['n'])]
                await asyncio.gather(*[t.goto(BASE + '/' + arg['page'], wait_until='commit') for t in tabs])
                await tabs[0].wait_for_timeout(WAIT)
                for t in tabs: await t.close()
                label = f"{arg['n']} tab cùng lúc {arg['page']}"
            elif do == 'spam':
                pg = pages[m]
                await pg.goto(BASE + '/' + arg['page'], wait_until='commit')
                for _ in range(arg['n']):
                    await pg.wait_for_timeout(arg.get('ms', 500))
                    try: await pg.reload(wait_until='commit')
                    except Exception: pass
                await pg.wait_for_timeout(WAIT); label = f"F5 {arg['n']} lần/{arg.get('ms', 500)}ms {arg['page']}"
            elif do == 'clicks':
                pg = pages[m]; ok = 0
                for _ in range(arg['n']):
                    try: await pg.locator(arg['sel']).first.click(timeout=3000, force=True); ok += 1
                    except Exception: pass
                    await pg.wait_for_timeout(arg.get('ms', 150))
                await pg.wait_for_timeout(WAIT); label = f"bấm {arg['sel']} {ok}/{arg['n']} lần"
            elif do == 'fleet':
                cfg = arg.get('profile') or {'uid': 'student', 'role': 'student'}
                fl = [await new_ctx(cfg) for _ in range(arg['n'])]
                fps = [await c.new_page() for c in fl]
                await asyncio.gather(*[fp.goto(BASE + '/' + arg['page'], wait_until='commit') for fp in fps])
                await fps[0].wait_for_timeout(WAIT)
                for c in fl: await c.close()
                label = f"{arg['n']} máy cùng mở {arg['page']}"
            elif do == 'eval':
                extra = str(await pages[m].evaluate(arg))[:80]; await pages[m].wait_for_timeout(2000); label = 'eval'
            elif do == 'idle':
                await pages[m].wait_for_timeout(int(arg)); label = f'chờ {arg} ms'
            await asyncio.sleep(0.5)  # đợi báo cáo keepalive cuối tới máy chủ
            r1 = get('/rstats'); w1 = get('/stats')
            dr = {k: r1[k] - r0.get(k, 0) for k in r1 if r1[k] - r0.get(k, 0)}
            dw = {k: w1[k] - w0.get(k, 0) for k in w1 if w1[k] - w0.get(k, 0)}
            da = {k: v - act0.get(k, 0) for k, v in NET['actions'].items() if v - act0.get(k, 0)}
            top = ', '.join(f'{v} {k}' for k, v in sorted(dr.items(), key=lambda x: -x[1])[:4])
            rows.append((m or '*', label[:46], f"R={sum(dr.values()):6} W={sum(dw.values()):4} AS={NET['appsScript'] - a0:3} SDK={NET['sdk'] - s0:3}",
                         top + (f' | ghi {dw}' if dw else '') + (f' | AppsScript {da}' if da else '') + (' ' + extra if extra else '')))
        await b.close()
    for r in rows: print(f'{r[0]:3} {r[1]:46} {r[2]}  {r[3]}')
    tot = get('/rstats'); print('TỔNG lượt đọc:', sum(tot.values()), '| ghi:', sum(get('/stats').values()))

asyncio.run(main())
