"""Máy chủ thử giữ 1 Firestore giả DÙNG CHUNG cho nhiều "máy" (trình duyệt) — dùng với multi.py. python3 shared-db-server.py 8766"""
import sys, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
BLOB = {'v': b''}
DB = {}
LOCK = threading.Lock()
READS = {}  # lượt đọc theo nhãn truy vấn (fake-firebase.js báo lên)
STATS = {}  # số lệnh ghi theo 'collection op' — máy chủ đếm nên không mất khi trang tự nạp lại
class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        with LOCK:
            if self.path.startswith('/rstats'): body = json.dumps(READS).encode()
            elif self.path.startswith('/stats'): body = json.dumps(STATS).encode()
            else: body = json.dumps(DB).encode() if DB else b''
        self.send_response(200); self._cors(); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_PUT(self):  # nạp dữ liệu mẫu — chỉ khi máy chủ còn trống (máy đến sau không đè)
        n = int(self.headers.get('Content-Length', 0)); data = json.loads(self.rfile.read(n) or b'{}')
        with LOCK:
            if not DB: DB.update(data)
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); raw = self.rfile.read(n)
        with LOCK:
            if self.path.startswith('/read'):
                o = json.loads(raw or b'{}'); READS[o['label']] = READS.get(o['label'], 0) + int(o['n'])
            elif self.path.startswith('/ops'):
                for o in json.loads(raw or b'[]'):
                    STATS[o['c'] + ' ' + o['op']] = STATS.get(o['c'] + ' ' + o['op'], 0) + 1
                    c = DB.setdefault(o['c'], {})
                    if o['op'] == 'delete': c.pop(o['i'], None)
                    elif o['merge']: c[o['i']] = {**c.get(o['i'], {}), **(o['d'] or {})}
                    else: c[o['i']] = o['d'] or {}
            else: DB.clear(); STATS.clear(); READS.clear()
        self.send_response(204); self._cors(); self.end_headers()
    def log_message(self, *a): pass
ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
