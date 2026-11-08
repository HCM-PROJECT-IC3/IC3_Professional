"""Đo lượt đọc/ghi khi CÙNG tài khoản dùng NHIỀU máy (mỗi máy = 1 trình duyệt riêng: bản đệm/localStorage riêng) trên 1 Firestore chung.
  python3 -m http.server 8765 &                              # ở thư mục gốc dự án
  python3 scripts/measure-firestore/shared-db-server.py 8766 &
  python3 scripts/measure-firestore/multi.py '<machines json>' '<steps json>'
machines: {"A":{"uid":"admin1","role":"admin","ls":{"khoá":"giá trị"}}, "B":{"uid":"t3","role":"teacher","schools":["Trường 3"]}, ...}
  (schools: trường được xem của tài khoản đó; hồ sơ MỌI máy đều có trên Firestore chung. FS_DETAIL=1 in từng truy vấn.)
steps: [{"m":"A","do":"goto","arg":"admin-users.html"}, {"m":"B","do":"click","arg":"#btn"}, {"m":"A","do":"eval","arg":"js"},
        {"do":"time","arg":"+2h"} (đồng hồ MỌI máy: +30m/+2h/+3d), {"m":"A","do":"idle","arg":60000}]
Tham số có thể là @đường-dẫn-file.json (tránh lỗi dấu nháy trong JS). FS_DEBUG=1 in log console của trang.
Trang tự nạp lại (vd diem-danh khi nhận dữ liệu mới) làm bộ đếm trong trang về 0 → muốn đếm lệnh ghi chắc chắn: curl localhost:8766/stats"""
import sys, json, asyncio, datetime, urllib.request, os
sys.stdout.reconfigure(encoding='utf-8')  # Windows: in tiếng Việt không lỗi cp1258
from playwright.async_api import async_playwright
BASE='http://localhost:8765'; SHARED=os.environ.get('FS_SHARED','http://localhost:8766')
FAKE=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'fake-firebase.js'),encoding='utf-8').read()
async def route(r):
    u=r.request.url
    if 'gstatic.com/firebasejs' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE if 'firebase-app-compat' in u else '/**/')
    if os.environ.get('FS_LAZY') and u.endswith('js/backend-config.js'):  # thử chế độ adminUsers.lazyRoster mà không sửa file
        resp = await r.fetch(); return await r.fulfill(response=resp, body=(await resp.text()).replace('lazyRoster: false', 'lazyRoster: true'))
    if u.startswith(BASE) or u.startswith(SHARED): return await r.continue_()
    if 'script.google' in u: return await r.fulfill(status=200,content_type='application/json',body='{"ok":false}',headers={'access-control-allow-origin':'*'})
    return await r.abort()
prof=lambda c: {k:c[k] for k in ('uid','role','schools','name') if k in c}
_a=lambda x: open(x[1:],encoding='utf-8').read() if x.startswith('@') else x
MACH=json.loads(_a(sys.argv[1])); STEPS=json.loads(_a(sys.argv[2]))
PROFILES=list({c['uid']:prof(c) for c in MACH.values()}.values())
async def main():
    urllib.request.urlopen(urllib.request.Request(SHARED+'/db',method='POST'))
    t0=datetime.datetime.now(); tot={}; rows=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctxs={}; pages={}
        for name,cfg in MACH.items():
            c=await b.new_context(viewport={'width':1280,'height':900}); await c.route('**/*',route)
            await c.clock.install(time=t0)
            await c.add_init_script('window.__FS_SHARED=%s;window.__FS_PROFILES=%s;window.__FS_PROFILE=%s;%s'%(json.dumps(SHARED),json.dumps(PROFILES),json.dumps(prof(cfg)),''.join('try{if(!localStorage.getItem(%s))localStorage.setItem(%s,%s)}catch(e){};'%(json.dumps(k),json.dumps(k),json.dumps(v)) for k,v in (cfg.get('ls') or {}).items())))
            ctxs[name]=c; pages[name]=await c.new_page(); tot[name]=[0,0]
            if os.environ.get('FS_DEBUG'):
                pages[name].on('console', lambda m, n=name: print('   [%s console] %s: %s' % (n, m.type, m.text[:150])) if m.type in ('error', 'warning') or 'Firestore' in m.text else None)
                pages[name].on('pageerror', lambda e, n=name: print('   [%s pageerror] %s' % (n, str(e)[:160])))
        off=datetime.timedelta()
        for st in STEPS:
            do=st['do']; m=st.get('m'); arg=st.get('arg')
            if do=='time':
                n=int(arg[1:-1]); off+=datetime.timedelta(hours=n) if arg[-1]=='h' else datetime.timedelta(days=n) if arg[-1]=='d' else datetime.timedelta(minutes=n)
                for c in ctxs.values(): await c.clock.set_system_time(t0+off)
                rows.append(('--','',f'⏩ đồng hồ +{arg}','','')); continue
            pg=pages[m]; extra=''
            if do=='goto': await pg.goto(BASE+'/'+arg); await pg.wait_for_timeout(6000)
            elif do=='click':
                try: await pg.locator(arg).first.click(timeout=4000); await pg.wait_for_timeout(4000)
                except Exception: extra='CLICKFAIL'
            elif do=='eval': extra=str(await pg.evaluate(arg))[:60]; await pg.wait_for_timeout(3000)
            elif do=='idle': await pg.wait_for_timeout(int(arg))
            L=await pg.evaluate('window.__fsLog||{reads:[],writes:[]}'); await pg.evaluate('window.__fsLog&&(window.__fsLog.reads.length=0,window.__fsLog.writes.length=0)')
            agg={}
            for x in L['reads']: agg[x['label']]=agg.get(x['label'],0)+x['n']
            R=sum(agg.values()); W=len(L['writes']); tot[m][0]+=R; tot[m][1]+=W
            top=', '.join(f'{v} {k}' for k,v in sorted(agg.items(),key=lambda a:-a[1])[:3])
            wl={}
            for x in L['writes']: wl[x['label']]=wl.get(x['label'],0)+1
            if os.environ.get('FS_DETAIL'): extra+=' | '+'; '.join(f"{x['n']}×{x['label']}" for x in L['reads'])
            rows.append((m,f'R={R:5} W={W:3}',f'{do} {arg if do!="eval" else ""}'.strip()[:34],top,(str(wl) if wl else '')+(' '+extra if extra else '')))
        await b.close()
    for r in rows: print(f'{r[0]:2} {r[1]:16} {r[2]:34} {r[3]}  {r[4]}')
    print('TỔNG:', {k:f'R={v[0]} W={v[1]}' for k,v in tot.items()}, '| cộng các máy: R=%d W=%d'%(sum(v[0] for v in tot.values()),sum(v[1] for v in tot.values())))
asyncio.run(main())
