"""Đo lượt đọc/ghi Firestore của các trang khi mở/tải lại/bấm Làm mới — KHÔNG đụng Firebase thật.
Thay SDK bằng fake-firebase.js (đếm lượt như biểu phí: truy vấn = max(1, số doc), get 1 doc = 1, listener = lượt đầu),
dữ liệu mẫu cỡ thật (roster 3.000, users 121, classes 150...). Cần Playwright (pip install playwright).
  python3 -m http.server 8765        # ở thư mục gốc dự án
  python3 scripts/measure-firestore/flow.py '["admin-users.html","roster-manager.html","+2h","admin-users.html"]' out.json
Bước: tên trang = mở trang · "+2h"/"+20d" = nhảy đồng hồ · "click:<selector>" = bấm nút. Một trình duyệt cho cả chuỗi
(như 1 admin dùng thật). Hiện R = lượt đọc, W = lượt ghi từng bước và bản đệm cuối cùng trong IndexedDB.
Lưu ý: dữ liệu giả không có doc cũ thiếu field nên lần đầu mở admin-users sẽ "ghi bù" ~160 doc (rồi dừng).
"""
import sys, json, asyncio, datetime
sys.stdout.reconfigure(encoding='utf-8')
from playwright.async_api import async_playwright
BASE='http://localhost:8765'; FAKE=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'fake-firebase.js'),encoding='utf-8').read()
async def route(r):
    u=r.request.url
    if 'gstatic.com/firebasejs' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE if 'firebase-app-compat' in u else '/**/')
    if u.startswith(BASE): return await r.continue_()
    if 'script.google' in u: return await r.fulfill(status=200,content_type='application/json',body='{"ok":false}',headers={'access-control-allow-origin':'*'})
    return await r.abort()
FLOW=json.loads(sys.argv[1]); OUT=sys.argv[2]
async def main():
    res=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1280,'height':900}); await ctx.route('**/*',route)
        await ctx.clock.install(time=datetime.datetime.now()); await ctx.add_init_script('window.__FS_PROFILE={"uid":"admin1","role":"admin"}')
        pg=await ctx.new_page()
        for step in FLOW:
            if step.startswith('+'):   # nhảy thời gian: +2h / +20d
                n=int(step[1:-1]); u=step[-1]; await ctx.clock.set_system_time(datetime.datetime.now()+(datetime.timedelta(hours=n) if u=='h' else datetime.timedelta(days=n))); continue
            if step.startswith('click:'):
                try: await pg.locator(step[6:]).first.click(timeout=3000)
                except Exception as e: res.append((step,'CLICKFAIL',0,0,'')); continue
                await pg.wait_for_timeout(5000)
            else:
                await pg.goto(BASE+'/'+step); await pg.wait_for_timeout(6000)
            L=await pg.evaluate('window.__fsLog||{reads:[],writes:[]}')
            agg={}
            for x in L['reads']: k=x['label']; agg[k]=agg.get(k,0)+x['n']
            await pg.evaluate('window.__fsLog&&(window.__fsLog.reads.length=0,window.__fsLog.writes.length=0)')
            res.append((step,'',sum(agg.values()),len(L['writes']),', '.join(f'{v} {k}' for k,v in sorted(agg.items(),key=lambda a:-a[1])[:3])))
        keys = await pg.evaluate('''async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('eduDataCache');r.onsuccess=()=>ok(r.result);r.onerror=no});const st=db.objectStoreNames[0];const tx=db.transaction(st,'readonly').objectStore(st);const all=await new Promise(ok=>{const q=tx.getAll(),k=tx.getAllKeys();q.onsuccess=()=>k.onsuccess=()=>ok(q.result.map((v,i)=>[k.result[i],v]))});return all.map(([k,e])=>{const v=e.value||{};const arr=Array.isArray(v)?v:(v.students||null);return k+' -> '+(arr?arr.length+' mục'+(arr.filter&&arr.some(x=>x.status)?' (active='+arr.filter(x=>x.status==='active').length+', khác='+arr.filter(x=>x.status&&x.status!=='active').length+')':''):typeof v)})}''')
        print('BẢN ĐỆM CUỐI:', *keys, sep='\n   ')
        await b.close()
    for r in res: print(f'{r[0]:34} R={r[2]:5} W={r[3]:3} {r[1]} {r[4]}')
asyncio.run(main())
