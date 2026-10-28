#!/usr/bin/env python3
"""
scripts/build-ppct-lessons.py — đọc PPCT 45 tiết (bản Aca HCM) của 6 khối → ghi
data/ic3/ppct-lessons.json: thứ tự tiết → bài IC3/Spark của từng cấp.

    python scripts/build-ppct-lessons.py "<thư mục Tài Liệu Bàn Giao NH 2026-2027>"

Trang Gọi tên (js/name-picker/np-challenge.js) dùng file này để giáo viên chọn
"Hôm nay học tiết/bài nào" và tự gợi ý bài kế tiếp của lớp vào buổi sau.
Chỉ đọc cột IC3 (cột "Tiết" + "Tên bài học" thứ hai trong sheet đầu tiên — 45 tiết).
Dòng "Ôn tập"/"Kiểm tra" giữ nguyên tên; trang Gọi tên lấy câu của các bài đã học
từ tiết ôn/kiểm tra trước tới tiết đó. Chạy lại khi PPCT đổi.
"""
import glob
import json
import os
import re
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'ic3', 'ppct-lessons.json')
LEVELS = {  # tên thư mục bàn giao → khoá cấp độ trong data/ic3
    'IC3 SPARK Level1': ('Spark__LV1', 3), 'IC3 SPARK Level2': ('Spark__LV2', 4), 'IC3 SPARK Level3': ('Spark__LV3', 5),
    'IC3 Level1': ('IC3__LV1', 6), 'IC3 Level2': ('IC3__LV2', 7), 'IC3 Level3': ('IC3__LV3', 8),
}
TIET = re.compile(r'^\d+(\s*[-–+]\s*\d+)?$')


def clean(v):
    return re.sub(r'\s+', ' ', str(v if v is not None else '').replace('\xa0', ' ')).strip()


def read(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = [[clean(c) for c in r] for r in ws.iter_rows(values_only=True)]
    h = next(i for i, r in enumerate(rows) if 'Tiết' in r[:1])
    # Cột "Tiết"/"Tên bài học" thứ hai = phần IC3 (phần đầu là chương trình của Bộ)
    tcol = rows[h].index('Tiết', 1)
    ncol = rows[h].index('Tên bài học', tcol)
    out, tiet = [], ''
    for r in rows[h + 1:]:
        if len(r) <= ncol:
            continue
        t, name = r[tcol], r[ncol]
        if TIET.match(t):
            tiet = re.sub(r'\s*[-–]\s*', '-', t)
        m = re.match(r'^Bài\s*(\d+)\b', name)
        if m:
            out.append({'tiet': tiet, 'bai': int(m.group(1))})
        elif re.match(r'^(Ôn tập|Kiểm tra)', name, re.I):
            kind = 'kt' if name.lower().startswith('kiểm tra') else 'on'
            out.append({'tiet': tiet, 'kind': kind, 'title': re.sub(r'\s*[:(].*$', '', name)})
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else '.'
    data = {'_doc': 'Sinh bởi scripts/build-ppct-lessons.py từ PPCT 45 tiết (Aca HCM). Mỗi cấp: các dòng theo thứ tự tiết — '
                    '{tiet, bai} là bài học IC3/Spark (tên bài lấy từ bộ "Bài N." trong data/ic3); {tiet, kind: on|kt, title} là tiết Ôn tập/Kiểm tra. '
                    'grade = khối lớp học cấp đó. Dùng ở trang Gọi tên (Bốc thử thách theo bài hôm nay).'}
    for folder, (key, grade) in LEVELS.items():
        files = [f for f in glob.glob(os.path.join(base, folder, 'PPCT*.xlsx')) if 'aca' in f.lower()]
        if not files:
            print('Thiếu PPCT:', folder)
            continue
        rows = read(files[0])
        data[key] = {'grade': grade, 'rows': rows}
        print(key, len(rows), 'dòng ·', sum(1 for r in rows if 'bai' in r), 'bài')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('Đã ghi', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
