#!/usr/bin/env python3
"""
scripts/build-fa-subset.py — bộ icon Font Awesome 6.5.2 RÚT GỌN, tự lưu trong web (lib/fontawesome/).

Trước đây 32 trang nạp all.min.css + fa-solid-900.woff2 từ cdnjs (~200 KB lần đầu, phụ thuộc CDN —
mạng trường chặn cdnjs là mất hết icon). Script này:
  1. tải bản gốc Font Awesome Free 6.5.2 từ cdnjs (chỉ lúc build);
  2. quét mọi icon dự án dùng: "fa-<tên>" trong *.html / *.js / *.css + bảng EMOJI_FA (js/ribbon-sim-core.js,
     ghép tên động 'fa-' + tên);
  3. giữ trong CSS: mọi quy tắc chung (fa-solid, fa-spin, fa-2x, fa-fw...) + đúng các icon đó;
  4. cắt 3 font (solid / regular / brands) chỉ còn các ký tự đó → woff2.

    python scripts/build-fa-subset.py           # cần: pip install fonttools brotli

THÊM ICON MỚI → chạy lại script này rồi commit lib/fontawesome/. Test
js/services/__tests__/fa-subset.test.js báo đỏ nếu code dùng icon chưa có trong bộ rút gọn.
"""
import io
import json
import os
import re
import subprocess
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

VERSION = '6.5.2'
CDN = f'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/{VERSION}'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'lib', 'fontawesome')
FONTS = {'fa-solid-900': 'solid', 'fa-regular-400': 'regular', 'fa-brands-400': 'brands'}
# Tên lớp tiện ích / kiểu chữ — không phải icon
NOT_ICON = re.compile(r'^((solid|regular|brands)-\d+|solid|regular|brands|light|thin|duotone|sharp|classic|fw|lg|sm|xs|2xs|xl|2xl|[1-9]0?x|'
                      r'spin|spin-pulse|spin-reverse|pulse|beat|beat-fade|bounce|fade|flip|shake|rotate-\d+|rotate-by|'
                      r'flip-horizontal|flip-vertical|flip-both|inverse|border|pull-left|pull-right|pull-start|pull-end|'
                      r'stack|stack-1x|stack-2x|ul|li|width-auto|layers|sr-only|sr-only-focusable|swap-opacity)$')


def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def used_icons():
    """Tên icon (không tiền tố fa-) dự án đang dùng."""
    files = subprocess.run(['git', 'ls-files', '*.html', '*.js', '*.css'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    names = set()
    for f in files:
        if '__tests__' in f or f.startswith(('lib/', 'apps/')):
            continue
        txt = open(os.path.join(ROOT, f), encoding='utf-8', errors='ignore').read()
        names.update(re.findall(r'(?<![\w-])fa-([a-z0-9]+(?:-[a-z0-9]+)*)', txt))
        # Ghép tên động: bảng EMOJI_FA { '☀': 'sun', ... } → 'fa-' + tên
        m = re.search(r'EMOJI_FA\s*=\s*\{(.*?)\};', txt, re.S)
        if m:
            names.update(re.findall(r":\s*'([a-z0-9-]+)'", m.group(1)))
    return {n for n in names if not NOT_ICON.match(n)}


def split_rules(css):
    """CSS phẳng → [(prelude, body)] ở cấp ngoài cùng (giữ nguyên @keyframes/@media/@font-face)."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        prelude, depth, k = css[i:j].strip(), 1, j + 1
        while k < n and depth:
            depth += {'{': 1, '}': -1}.get(css[k], 0)
            k += 1
        out.append((prelude, css[j + 1:k - 1]))
        i = k
    return out


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')  # console Windows (cp1258) không in được tiếng Việt
    for d in ('css', 'webfonts'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    css = get(f'{CDN}/css/all.min.css').decode('utf-8')
    want = used_icons()

    # Bản đồ tên icon → mã ký tự từ CSS gốc: ".fa-house{--fa:\"\\f015\"}" (FA 6.5) hoặc ":before{content:...}"
    icon_cp = {}
    kept, dropped_icons = [], 0
    for prelude, body in split_rules(css):
        cp = re.search(r'(?:--fa|content)\s*:\s*"\\([0-9a-f]+)"', body)
        sels = [s.strip() for s in prelude.split(',')]
        icon_sels = [s for s in sels if re.fullmatch(r'\.fa-[a-z0-9-]+(?::+before)?', s)]
        if cp and icon_sels and len(icon_sels) == len(sels):
            for s in icon_sels:
                icon_cp[re.match(r'\.fa-([a-z0-9-]+)', s).group(1)] = int(cp.group(1), 16)
            keep = [s for s in icon_sels if re.match(r'\.fa-([a-z0-9-]+)', s).group(1) in want]
            if keep:
                kept.append(f"{','.join(keep)}{{{body}}}")
            else:
                dropped_icons += 1
            continue
        if prelude.startswith('@font-face') and 'v4compatibility' in body:
            continue  # font tương thích FA4 — dự án không dùng
        kept.append(f'{prelude}{{{body}}}')

    missing = sorted(n for n in want if n not in icon_cp)
    have = sorted(n for n in want if n in icon_cp)
    cps = sorted({icon_cp[n] for n in have})
    out_css = ''.join(kept)
    out_css = re.sub(r'url\(\.\./webfonts/(fa-[a-z0-9-]+)\.woff2\)', r'url(../webfonts/\1.woff2)', out_css)
    out_css = re.sub(r',\s*url\(\.\./webfonts/[^)]+\.ttf\)\s*format\("truetype"\)', '', out_css)
    header = (f'/*! Font Awesome Free {VERSION} — bản RÚT GỌN {len(have)} icon cho EduQuiz (scripts/build-fa-subset.py). '
              'License: https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT) */\n')
    with open(os.path.join(OUT, 'css', 'fa.min.css'), 'w', encoding='utf-8') as fh:
        fh.write(header + out_css)

    sizes = {}
    for fname in FONTS:
        src = TTFont(io.BytesIO(get(f'{CDN}/webfonts/{fname}.woff2')))
        have_cp = set(src.getBestCmap() or {})
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = []
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=[c for c in cps if c in have_cp] or [0x20])
        sub.subset(src)
        path = os.path.join(OUT, 'webfonts', f'{fname}.woff2')
        src.flavor = 'woff2'
        src.save(path)
        sizes[fname] = os.path.getsize(path)

    with open(os.path.join(OUT, 'icons.json'), 'w', encoding='utf-8') as fh:
        json.dump({'version': VERSION, 'icons': have}, fh, ensure_ascii=False, indent=0)
    print(f'{len(have)} icon dùng / {len(icon_cp)} icon gốc — bỏ {dropped_icons} quy tắc icon thừa')
    print('CSS', os.path.getsize(os.path.join(OUT, 'css', 'fa.min.css')), 'byte;', ', '.join(f'{k} {v} byte' for k, v in sizes.items()))
    if missing:
        print('Tên "fa-…" không phải icon Font Awesome 6.5.2 (lỗi gõ / lớp riêng của dự án):', ', '.join(missing))


if __name__ == '__main__':
    sys.exit(main())
