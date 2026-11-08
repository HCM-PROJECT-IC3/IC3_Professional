"""Máy chủ web tĩnh cho burst.py: nhiều luồng + hàng đợi lớn (http.server mặc định chỉ 5 → 30 máy mở cùng lúc bị từ chối).
  python scripts/measure-firestore/serve.py 8765        # chạy ở thư mục gốc dự án"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
class S(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
S(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
