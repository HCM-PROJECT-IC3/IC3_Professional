#!/usr/bin/env python3
"""scripts/convert-images-webp.py — chuyển ảnh PNG trong img/ sang WebP và sửa mọi chỗ trỏ tới.

    python scripts/convert-images-webp.py            # chỉ báo cáo, không đổi gì
    python scripts/convert-images-webp.py --apply    # chuyển + sửa đường dẫn + xoá PNG đã chuyển

Mỗi ảnh lấy bản nhỏ hơn giữa WebP không mất dữ liệu và WebP chất lượng 90 (đủ nét cho chữ
trong ảnh chụp màn hình), chỉ chuyển khi bớt được ≥ 15%. KHÔNG chuyển khi:
  - ảnh động, hoặc icon PWA (img/pwa — iOS cần PNG cho apple-touch-icon);
  - tên tệp trùng với tệp khác trong repo (không chắc chỗ nào trỏ tới tệp nào);
  - không tìm thấy chỗ nào nhắc ĐÚNG tên tệp (có thể trang ghép tên động → đổi đuôi sẽ gãy).
Trước và sau khi chuyển đều đếm đường dẫn img/... bị gãy trong mã + dữ liệu; số đó không được tăng.
Ảnh mới tải lên qua trang Quản lý ảnh đã tự nén WebP (js/services/image-compress.js).
"""
import io
import os
import re
import sys
from urllib.parse import quote, unquote

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TEXT_EXT = ('.html', '.js', '.css', '.json', '.webmanifest', '.md', '.py', '.gs')
SKIP_DIRS = {'.git', 'node_modules', 'server-data', 'vendor', '__pycache__'}
SKIP_PREFIX = ('mos/files/', 'mos/tools/', 'lib/', 'img/pwa/')
MIN_SAVING = 0.15
REF_RE = re.compile(r'img/[^"\'\s)`<>\\]+?\.(?:png|jpe?g|webp|gif|svg)', re.I)


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')


def walk():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            yield os.path.join(d, f)


def text_files():
    out = {}
    for p in walk():
        r = rel(p)
        if r.endswith(TEXT_EXT) and not r.startswith(('mos/files/', 'mos/tools/')) and 'convert-images-webp' not in r:
            try:
                out[r] = io.open(p, encoding='utf-8', newline='').read()
            except UnicodeDecodeError:
                pass
    return out


def broken_refs(texts):
    bad = set()
    for r, t in texts.items():
        for m in REF_RE.finditer(t):
            path = unquote(m.group(0))
            # Đường dẫn tương đối theo trang ở gốc repo (mos/ có img/ riêng của nó).
            base = os.path.dirname(r) if r.startswith('mos/') else ''
            if not os.path.exists(os.path.join(ROOT, base, path)) and not os.path.exists(os.path.join(ROOT, path)):
                bad.add(path)
    return bad


def encode(path):
    im = Image.open(path)
    if getattr(im, 'is_animated', False):
        return None
    im.load()
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.getbands() or 'transparency' in im.info else 'RGB')
    best = None
    for kw in ({'lossless': True, 'method': 4}, {'quality': 90, 'method': 6}):
        buf = io.BytesIO()
        im.save(buf, 'WEBP', **kw)
        if best is None or buf.tell() < len(best):
            best = buf.getvalue()
    return best


def ref_pattern(name):
    alts = sorted({re.escape(name), re.escape(quote(name))}, key=len, reverse=True)
    return re.compile(r'(?<![\w.\-%])(' + '|'.join(alts) + r')(?![\w])')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')  # console Windows mặc định không in được tiếng Việt
    apply = '--apply' in sys.argv
    texts = text_files()
    before_bad = broken_refs(texts)

    names = {}
    for p in walk():
        names.setdefault(os.path.basename(p).lower(), []).append(rel(p))
    pngs = [r for r in (rel(p) for p in walk()) if r.startswith('img/') and r.lower().endswith('.png') and not r.startswith(SKIP_PREFIX)]

    plan, skipped = [], []
    for r in sorted(pngs):
        name = os.path.basename(r)
        webp_name = name[:-4] + '.webp'
        if len(names.get(name.lower(), [])) > 1 or names.get(webp_name.lower()):
            skipped.append((r, 'trùng tên tệp khác'))
            continue
        pat = ref_pattern(name)
        hits = {f: len(pat.findall(t)) for f, t in texts.items()}
        hits = {f: n for f, n in hits.items() if n}
        if not hits:
            skipped.append((r, 'không thấy chỗ nào nhắc đúng tên'))
            continue
        data = encode(os.path.join(ROOT, r))
        size = os.path.getsize(os.path.join(ROOT, r))
        if data is None:
            skipped.append((r, 'ảnh động'))
            continue
        if len(data) > size * (1 - MIN_SAVING):
            skipped.append((r, 'bớt < 15%'))
            continue
        plan.append((r, name, webp_name, size, data, hits))

    before = sum(p[3] for p in plan)
    after = sum(len(p[4]) for p in plan)
    print('Chuyển %d ảnh: %.1f MB → %.1f MB (bớt %.1f MB). Bỏ qua %d ảnh.'
          % (len(plan), before / 1048576, after / 1048576, (before - after) / 1048576, len(skipped)))
    reasons = {}
    for r, why in skipped:
        reasons.setdefault(why, []).append(r)
    for why, rs in reasons.items():
        print('  bỏ qua (%s): %d — vd %s' % (why, len(rs), ', '.join(rs[:3])))
    touched = sorted({f for p in plan for f in p[5]})
    print('Sửa đường dẫn trong %d tệp: %s%s' % (len(touched), ', '.join(touched[:8]), ' …' if len(touched) > 8 else ''))
    if not apply:
        print('\nChưa đổi gì. Chạy lại với --apply để chuyển.')
        return 0

    for r, name, webp_name, size, data, hits in plan:
        with open(os.path.join(ROOT, r[:-4] + '.webp'), 'wb') as f:
            f.write(data)
        pat = ref_pattern(name)
        for f in hits:
            texts[f] = pat.sub(lambda m: webp_name if m.group(1) == name else quote(webp_name), texts[f])
    for f in touched:
        io.open(os.path.join(ROOT, f), 'w', encoding='utf-8', newline='').write(texts[f])
    for r, *_ in plan:
        os.remove(os.path.join(ROOT, r))

    after_bad = broken_refs(text_files())
    new_bad = sorted(after_bad - before_bad)
    print('Đường dẫn ảnh gãy: trước %d, sau %d.' % (len(before_bad), len(after_bad)))
    if new_bad:
        print('LỖI — gãy thêm:', ', '.join(new_bad[:20]))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
