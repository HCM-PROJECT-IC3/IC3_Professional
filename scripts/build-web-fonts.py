#!/usr/bin/env python3
"""
scripts/build-web-fonts.py — tự lưu font Inter, Baloo 2, Space Mono (lib/fonts/), chỉ bộ chữ Latin + tiếng Việt.

Trước đây các trang nạp CSS từ fonts.googleapis.com rồi font từ fonts.gstatic.com: thêm 2 tên miền phải kết nối, và
Google tách mỗi font thành latin / latin-ext / vietnamese — chữ "ỳ ỹ ỷ ỵ" nằm trong CẢ latin-ext lẫn vietnamese nên
trình duyệt tải thêm gói latin-ext (Inter: 83 KB) dù trang chỉ có tiếng Việt. Bản tự lưu chỉ khai báo latin +
vietnamese → không còn gói latin-ext; ký tự hiếm ngoài 2 bộ này hiện bằng font dự phòng của máy.

    python scripts/build-web-fonts.py

Font: SIL Open Font License 1.1 (được phép tự lưu, phát hành lại). Chạy lại khi muốn cập nhật font mới của Google.
"""
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'lib', 'fonts')
CSS_URL = ('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800'
           '&family=Baloo+2:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'  # → woff2
KEEP = ('vietnamese', 'latin')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    os.makedirs(OUT, exist_ok=True)
    css = get(CSS_URL).decode('utf-8')
    blocks = re.findall(r'/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})', css)
    files, out = {}, []
    for subset, block in blocks:
        if subset not in KEEP:
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        url = re.search(r'url\((https://[^)]+\.woff2)\)', block).group(1)
        if url not in files:  # font biến thiên: nhiều độ đậm dùng chung 1 file
            weight = re.search(r'font-weight:\s*(\d+)', block).group(1)
            static = fam == 'Space Mono'
            name = f"{fam.lower().replace(' ', '')}-{subset}{'-' + weight if static else ''}.woff2"
            data = get(url)
            with open(os.path.join(OUT, name), 'wb') as fh:
                fh.write(data)
            files[url] = (name, len(data))
        out.append(f'/* {fam} · {subset} */\n' + block.replace(url, files[url][0]).strip())
    header = ('/* Font tự lưu — Inter, Baloo 2, Space Mono · chỉ Latin + tiếng Việt (scripts/build-web-fonts.py).\n'
              '   License: SIL Open Font License 1.1 — https://openfontlicense.org */\n')
    with open(os.path.join(OUT, 'fonts.css'), 'w', encoding='utf-8') as fh:
        fh.write(header + '\n'.join(out) + '\n')
    for name, size in sorted(files.values()):
        print(f'{size:>7} byte  {name}')
    print(len(out), '@font-face ·', len(files), 'file')


if __name__ == '__main__':
    sys.exit(main())
