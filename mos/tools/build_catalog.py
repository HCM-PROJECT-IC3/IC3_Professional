"""Sinh mos/data/index.json + data/sets/*.json + chép tệp đề vào mos/files/ từ bộ zip ôn tập.

Chạy:  python mos/tools/build_catalog.py --src "C:/Users/Amin/Downloads/On_Tap_MOS"
Cần:   pip install openpyxl

Nguồn:
  On_tap_Excel.zip      On_luyen_cuoi_khoa/Tiet_N/Tiet_N_MOS_Excel_Projects.xlsx + PROJECT_k/*
  On_Tap_PowerPoint.zip On_Tap/Tiet_N/De_N.xlsx (đề) + HD_N.xlsx (hướng dẫn) + Tai lieu/*
  On_Tap_Word.zip       Tiết N/BaiOnN_HoanThien.pptx (đề + hướng dẫn + tệp .docx nhúng) + Data/*
Tiêu chí chấm KHÔNG sinh ở đây — viết tay trong mos/data/rubrics/*.json.
"""
import argparse
import io
import json
import os
import posixpath
import re
import shutil
import sys
import zipfile

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def zip_names(z):
    """Tên tệp trong zip, sửa lỗi mã hoá tên tiếng Việt (zip tạo trên Windows không bật cờ UTF-8)."""
    out = []
    for info in z.infolist():
        name = info.filename
        if not info.flag_bits & 0x800:
            try:
                name = name.encode('cp437').decode('utf-8')
            except UnicodeError:
                pass
        out.append((name, info))
    return out


def clean(v):
    if v is None:
        return ''
    s = str(v).replace('\r', '').strip()
    return re.sub(r'[ \t]+', ' ', s)


def rows_of(ws):
    return [[clean(v) for v in row] for row in ws.iter_rows(values_only=True)]


def load_wb(z, info):
    return openpyxl.load_workbook(io.BytesIO(z.read(info)), data_only=True)


def copy_file(z, info, dest_rel, copy):
    dest = os.path.join(ROOT, 'files', dest_rel)
    if copy:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with z.open(info) as src, open(dest, 'wb') as out:
            shutil.copyfileobj(src, out)
    return {'name': os.path.basename(dest_rel), 'path': 'files/' + dest_rel.replace(os.sep, '/'), 'size': info.file_size}


# ---------------------------------------------------------------- Excel

def build_excel(path, copy):
    z = zipfile.ZipFile(path)
    names = zip_names(z)
    sets = {}
    for name, info in names:
        m = re.search(r'Tiet_(\d+)/Tiet_\d+_MOS_Excel_Projects\.xlsx$', name)
        if not m:
            continue
        n = int(m.group(1))
        wb = load_wb(z, info)
        projects = []
        for ws in wb.worksheets:
            pm = re.match(r'PROJECT\s*(\d+)', ws.title, re.I)
            if not pm:
                continue
            k = int(pm.group(1))
            tasks = []
            for row in rows_of(ws):
                tm = re.match(r'Task\s*(\d+)', row[0] if row else '', re.I)
                if tm and len(row) > 1 and row[1]:
                    tasks.append({'no': int(tm.group(1)), 'text': row[1]})
            folder = re.compile(r'Tiet_%d/PROJECT[_ ]%d/' % (n, k), re.I)
            files, main = [], None
            for fname, finfo in names:
                if folder.search(fname) and not fname.endswith('/'):
                    rec = copy_file(z, finfo, os.path.join('excel', 't%d' % n, 'p%d' % k, os.path.basename(fname)), copy)
                    files.append(rec)
                    if fname.lower().endswith('.xlsx'):
                        main = rec['name']
            projects.append({'id': 'excel-t%d-p%d' % (n, k), 'no': k, 'title': 'Project %d' % k,
                             'main': main, 'files': files, 'tasks': tasks})
        projects.sort(key=lambda p: p['no'])
        sets[n] = {'id': 'excel-t%d' % n, 'no': n, 'title': 'Bộ đề Tiết %d' % n, 'projects': projects}
    for st in build_excel_lessons(names, z, copy):
        sets[st['no']] = st
    return [sets[k] for k in sorted(sets)]


def allow_doc_props(path):
    """Tắt "Remove personal information from file properties on save" để task sửa thuộc tính tài liệu lưu được."""
    with zipfile.ZipFile(path) as src:
        items = [(i, src.read(i)) for i in src.infolist()]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            if info.filename == 'xl/workbook.xml':
                data = re.sub(rb' filterPrivacy="(1|true)"', b'', data)
            out.writestr(info, data)


def build_excel_lessons(names, z, copy):
    """Tiết 1-2: 1 tệp bài ôn dùng chung, đề viết tay trong tools/excel-lessons.json (mỗi project là 1 nhóm bài)."""
    spec = json.load(open(os.path.join(ROOT, 'tools', 'excel-lessons.json'), encoding='utf-8'))
    find = lambda tail: next(info for name, info in names if name.endswith(tail))
    out = []
    for st in spec['sets']:
        n = st['no']
        main = copy_file(z, find(st['file']), os.path.join('excel', 't%d' % n, posixpath.basename(st['file'])), copy)
        if copy and st.get('keepProps'):
            allow_doc_props(os.path.join(ROOT, main['path']))
        projects = []
        for p in st['projects']:
            extra = [copy_file(z, find(f), os.path.join('excel', 't%d' % n, posixpath.basename(f)), copy) for f in p.get('files', [])]
            projects.append({'id': 'excel-t%d-p%d' % (n, p['no']), 'no': p['no'], 'title': p['title'],
                             'main': main['name'], 'files': [main] + extra, 'tasks': p['tasks']})
        out.append({'id': 'excel-t%d' % n, 'no': n, 'title': 'Bộ đề Tiết %d' % n, 'projects': projects})
    return out


# ---------------------------------------------------------------- PowerPoint

def parse_de(rows):
    """Trả về [{no, name, file, tasks:[{no,text}]}] — hỗ trợ 2 kiểu: khối '📁 PROJECT n' và bảng P1/1.1."""
    projects = {}
    cur = None
    header_idx = next((i for i, r in enumerate(rows) if 'Câu' in r and 'Project' in r), None)
    if header_idx is not None:
        h = rows[header_idx]
        c_proj, c_name, c_file, c_no, c_text = (h.index('Project'), h.index('Tên Project'), h.index('Tệp làm việc'),
                                                h.index('Câu'), h.index('Yêu cầu thực hiện'))
        for r in rows[header_idx + 1:]:
            pm = re.match(r'P(\d+)$', r[c_proj])
            if pm:
                k = int(pm.group(1))
                name = re.sub(r'^Project\s*\d+\s*[—–-]\s*', '', r[c_name])
                cur = projects.setdefault(k, {'no': k, 'name': name, 'file': r[c_file], 'tasks': []})
            tm = re.match(r'(\d+)\.(\d+)$', r[c_no])
            if tm and r[c_text]:
                k = int(tm.group(1))
                cur = projects.setdefault(k, {'no': k, 'name': '', 'file': '', 'tasks': []})
                cur['tasks'].append({'no': int(tm.group(2)), 'text': r[c_text]})
    else:
        for r in rows:
            joined = ' '.join(c for c in r if c)
            pm = re.search(r'PROJECT\s*(\d+)\s*:?\s*(.*)$', joined, re.I) if '📁' in joined else None
            if pm:
                k = int(pm.group(1))
                name = re.sub(r'\s*Project$', '', pm.group(2).strip(), flags=re.I)
                cur = projects.setdefault(k, {'no': k, 'name': name, 'file': '', 'tasks': []})
                continue
            tm = next((re.match(r'Task\s*(\d+)$', c, re.I) for c in r if re.match(r'Task\s*(\d+)$', c, re.I)), None)
            if tm and cur is not None:
                text = r[-1] if r[-1] else next((c for c in reversed(r) if c), '')
                cur['tasks'].append({'no': int(tm.group(1)), 'text': text})
    return [projects[k] for k in sorted(projects)]


def parse_hd(wb):
    """Trả về {(project, task): {'steps','tips'}} — HD_N có 4 kiểu trình bày khác nhau."""
    out = {}
    for ws in wb.worksheets:
        rows = rows_of(ws)
        pm = re.search(r'Project\s*(\d+)', ws.title, re.I)
        sheet_project = int(pm.group(1)) if pm else None
        # Kiểu khối dọc: "TASK n — ..." rồi các dòng nhãn "Các bước thực hiện:".
        if any(re.match(r'TASK\s*\d+\s*[—–-]', c) for r in rows for c in r):
            task = None
            for r in rows:
                cells = [c for c in r if c]
                if not cells:
                    continue
                tm = re.match(r'TASK\s*(\d+)', cells[0])
                if tm:
                    task = int(tm.group(1))
                    continue
                if task and len(cells) >= 2:
                    key = cells[0].lower()
                    entry = out.setdefault((sheet_project, task), {'steps': '', 'tips': ''})
                    if 'bước' in key:
                        entry['steps'] = cells[1]
                    elif 'lưu ý' in key or 'mẹo' in key:
                        entry['tips'] = (entry['tips'] + '\n' + cells[1]).strip()
            continue
        header_idx = next((i for i, r in enumerate(rows)
                           if sum(1 for c in r if c) >= 3 and any(re.search(r'bước', c, re.I) for c in r)), None)
        if header_idx is None:
            continue
        h = rows[header_idx]
        c_steps = next(i for i, c in enumerate(h) if re.search(r'bước', c, re.I))
        c_tips = next((i for i, c in enumerate(h) if re.search(r'lưu ý|mẹo', c, re.I) and i != c_steps), None)
        c_no = next((i for i, c in enumerate(h) if c in ('Câu', 'Task', 'STT')), None)
        seq = 0
        for r in rows[header_idx + 1:]:
            if not r[c_steps]:
                continue
            seq += 1
            project, task = sheet_project, seq
            label = r[c_no] if c_no is not None else ''
            m = re.match(r'(\d+)\.(\d+)$', label)
            if m:
                project, task = int(m.group(1)), int(m.group(2))
            else:
                m = re.match(r'(?:Task\s*)?(\d+)$', label, re.I)
                if m:
                    task = int(m.group(1))
            out[(project, task)] = {'steps': r[c_steps], 'tips': r[c_tips] if c_tips is not None else ''}
    return out


def build_ppt(path, copy):
    z = zipfile.ZipFile(path)
    names = zip_names(z)
    sets = []
    tiets = sorted({int(m.group(1)) for n, _ in names for m in [re.search(r'On_Tap/Tiet_(\d+)/De_\d+\.xlsx$', n)] if m})
    for n in tiets:
        de_info = next(i for nm, i in names if nm.endswith('Tiet_%d/De_%d.xlsx' % (n, n)))
        hd_info = next((i for nm, i in names if nm.endswith('Tiet_%d/HD_%d.xlsx' % (n, n))), None)
        de_wb = load_wb(z, de_info)
        projects = parse_de(rows_of(de_wb.worksheets[0]))
        guides = parse_hd(load_wb(z, hd_info)) if hd_info else {}
        attachments = []
        if len(de_wb.worksheets) > 1:
            rows = [[c for c in r if c] for r in rows_of(de_wb.worksheets[1])]
            attachments = [r for r in rows if r]

        prefix = 'On_Tap/Tiet_%d/Tai lieu/' % n
        res = [(nm[len(prefix):], i) for nm, i in names if nm.startswith(prefix) and not nm.endswith('/')]
        shared = [(rel, i) for rel, i in res if not re.search(r'project\s*\d+', rel, re.I)]
        out_projects = []
        for p in projects:
            k = p['no']
            own = [(rel, i) for rel, i in res
                   if re.match(r'project\s*%d\b' % k, rel.split('/')[0], re.I)]
            files, main = [], None
            for rel, i in own + shared:
                dest = os.path.join('powerpoint', 't%d' % n, 'p%d' % k, *rel.split('/')[1:] if '/' in rel else [rel])
                rec = copy_file(z, i, dest, copy)
                files.append(rec)
                top = '/' not in rel or rel.count('/') == 1
                if rel.lower().endswith('.pptx') and top and (rel, i) in own:
                    if not main or (p['file'] and rec['name'] == p['file']):
                        main = rec['name']
            tasks = []
            for t in p['tasks']:
                g = guides.get((k, t['no']))
                task = {'no': t['no'], 'text': t['text']}
                if g:
                    task['guide'] = g['steps']
                    if g['tips']:
                        task['tips'] = g['tips']
                tasks.append(task)
            title = 'Project %d' % k + (' · ' + p['name'] if p['name'] else '')
            out_projects.append({'id': 'ppt-t%d-p%d' % (n, k), 'no': k, 'title': title,
                                 'main': main, 'files': files, 'tasks': tasks})
        rec = {'id': 'ppt-t%d' % n, 'no': n, 'title': 'Bộ đề Tiết %d' % n, 'projects': out_projects}
        if attachments:
            rec['attachments'] = attachments
        sets.append(rec)
    return sets


# ---------------------------------------------------------------- Word
# Đề Word nằm trong bài giảng "Tiết N/BaiOnN_HoanThien.pptx": slide bài tập liệt kê task + tệp .docx nhúng
# (ppt/embeddings), slide "Hướng dẫn" ghi từng bước. 2 kiểu: "Mở file wordXX.docx" (gom theo tệp)
# và "Project N – Mở file X.docx" (task đánh số "1."). Thư mục Data/ của tiết = tệp kèm.

def slide_paras(xml):
    out = []
    for p in re.findall(r'<a:p>.*?</a:p>|<a:p .*?</a:p>', xml, re.S):
        t = ''.join(re.findall(r'<a:t>([^<]*)</a:t>', p))
        t = html_unescape(t).replace('​', '').strip()
        if t:
            out.append(re.sub(r'\s+', ' ', t))
    return out


def html_unescape(s):
    import html
    return html.unescape(s)


def norm_key(s):
    return re.sub(r'[^0-9a-zà-ỹ]+', '', s.lower())[:60]


def match_guide(guides, text):
    tk = norm_key(text)
    hit = next((g for gk, g in guides if gk == tk), None)
    # Slide đôi khi tách 1 câu thành 2 dòng: chấp nhận khi phần dài ≥ 20 ký tự nằm trọn trong nhau.
    return hit or next((g for gk, g in guides if min(len(gk), len(tk)) >= 20 and (gk in tk or tk in gk)), None)


def build_word(path, copy):
    z = zipfile.ZipFile(path)
    names = zip_names(z)
    sets = []
    decks = sorted(((int(m.group(1)), nm, i) for nm, i in names
                    for m in [re.search(r'Tiết (\d+)/BaiOn\d+_HoanThien\.pptx$', nm)] if m))
    for n, deck_name, deck_info in decks:
        deck = zipfile.ZipFile(io.BytesIO(z.read(deck_info)))
        data = [(nm, i) for nm, i in names if re.search(r'Tiết %d/[Dd]ata/[^/]+$' % n, nm)]
        data_files = [copy_file(z, i, os.path.join('word', 't%d' % n, 'data', os.path.basename(nm)), copy) for nm, i in data]
        slides = sorted((x for x in deck.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', x)),
                        key=lambda x: int(re.findall(r'\d+', x)[0]))
        projects = {}   # key -> {'file', 'tasks':[text], 'embeds':{name: zip path}}
        order = []
        guides_a, guides_b = [], {}
        for s in slides:
            xml = deck.read(s).decode('utf-8')
            paras = slide_paras(xml)
            if not paras:
                continue
            rels_path = 'ppt/slides/_rels/' + s.split('/')[-1] + '.rels'
            rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', deck.read(rels_path).decode())) if rels_path in deck.namelist() else {}
            rels.update({k: v for v, k in re.findall(r'Target="([^"]+)"[^>]*Id="(rId\d+)"', deck.read(rels_path).decode())} if rels_path in deck.namelist() else {})
            embeds = [posixpath.normpath(posixpath.join('ppt/slides', rels[r])) for r in re.findall(r'<p:oleObj[^>]*?r:id="(rId\d+)"', xml) if r in rels]
            embeds = list(dict.fromkeys(e for e in embeds if e.endswith('.docx')))  # mc:Choice + mc:Fallback trùng rId
            joined = ' '.join(paras)
            if paras[0].startswith('Hướng dẫn'):
                body = paras[1:]
                if body and body[0] in ('KHỞI ĐỘNG',) or body and re.match(r'PROJECT \d+$', body[0]):
                    body = body[1:]
                if not body:
                    continue
                mb = re.match(r'Project (\d+)\s*[—–-]\s*Task (\d+)\.\s*(.*)', body[0])
                if mb:
                    guides_b[(int(mb.group(1)), int(mb.group(2)))] = '\n'.join(body[1:])
                else:
                    ma = re.match(r'([a-z]{1,2})\.\s+(.*)', body[0])
                    guides_a.append((norm_key(ma.group(2) if ma else body[0]), '\n'.join(body[1:])))
                continue
            mb = re.search(r'Project (\d+)\s*[–-]\s*Mở file (.+?\.docx)', joined)
            ma = None if mb else re.search(r'Mở file (.+?\.docx)', joined)
            if not (ma or mb):
                continue
            fname = (mb or ma).group(2 if mb else 1).strip()
            key = ('B', int(mb.group(1))) if mb else ('A', fname.lower())
            if key not in projects:
                projects[key] = {'file': fname, 'tasks': [], 'embeds': {}, 'no': int(mb.group(1)) if mb else None}
                order.append(key)
            proj = projects[key]
            hdr = next(i for i, p in enumerate(paras) if 'Mở file' in p)
            listed = []
            marks = [i for i, p in enumerate(paras) if p in ('Mở bài Word:', 'Mở:')]
            cut = marks[0] if marks else len(paras)
            listed = [p for p in paras[cut + 1:] if p.lower().endswith('.docx')]
            for p in paras[hdr + 1:cut]:
                if mb:
                    mt = re.match(r'(\d+)\.\s*(.*)', p)
                    if mt:
                        proj['tasks'].append((int(mt.group(1)), mt.group(2)))
                else:
                    proj['tasks'].append((None, p))
            for idx, e in enumerate(embeds):
                nm = listed[idx] if idx < len(listed) else (fname if idx == 0 else 'tai-lieu-%d.docx' % (idx + 1))
                proj['embeds'].setdefault(nm, e)

        out_projects = []
        for k, key in enumerate(order, 1):
            proj = projects[key]
            no = proj['no'] or k
            tasks = []
            for j, (tno, text) in enumerate(proj['tasks'], 1):
                t = {'no': tno or j, 'text': text}
                g = guides_b.get((no, tno)) if tno else match_guide(guides_a, text)
                if g:
                    t['guide'] = g
                tasks.append(t)
            files, main = [], None
            for nm, e in proj['embeds'].items():
                dest = os.path.join('word', 't%d' % n, 'p%d' % no, nm)
                if copy:
                    full = os.path.join(ROOT, 'files', dest)
                    os.makedirs(os.path.dirname(full), exist_ok=True)
                    with open(full, 'wb') as f:
                        f.write(deck.read(e))
                rec = {'name': nm, 'path': 'files/' + dest.replace(os.sep, '/'), 'size': deck.getinfo(e).file_size}
                files.append(rec)
                if nm.lower() == proj['file'].lower() or main is None:
                    main = rec['name'] if (nm.lower() == proj['file'].lower() or main is None) else main
            files += data_files
            title = 'Project %d · %s' % (no, proj['file'])
            out_projects.append({'id': 'word-t%d-p%d' % (n, no), 'no': no, 'title': title,
                                 'main': main, 'files': files, 'tasks': tasks})
        sets.append({'id': 'word-t%d' % n, 'no': n, 'title': 'Bộ đề Tiết %d' % n, 'projects': out_projects})
    return sets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=r'C:/Users/Amin/Downloads/On_Tap_MOS')
    ap.add_argument('--no-copy', action='store_true', help='chỉ sinh catalog.json, không chép tệp đề')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    copy = not args.no_copy

    catalog = {
        'subjects': [
            {'id': 'excel', 'name': 'Excel', 'ext': '.xlsx',
             'sets': build_excel(os.path.join(args.src, 'On_tap_Excel.zip'), copy)},
            {'id': 'powerpoint', 'name': 'PowerPoint', 'ext': '.pptx',
             'sets': build_ppt(os.path.join(args.src, 'On_Tap_PowerPoint.zip'), copy)},
            {'id': 'word', 'name': 'Word', 'ext': '.docx',
             'sets': build_word(os.path.join(args.src, 'On_Tap_Word.zip'), copy)},
        ],
    }
    # Mục lục nhỏ (trang chủ) + mỗi bộ đề 1 tệp (chỉ tải khi mở bộ đề đó).
    sets_dir = os.path.join(ROOT, 'data', 'sets')
    os.makedirs(sets_dir, exist_ok=True)
    index = {'subjects': []}
    for s in catalog['subjects']:
        entry = {k: s[k] for k in ('id', 'name', 'ext')}
        entry['sets'] = []
        for st in s['sets']:
            with open(os.path.join(sets_dir, st['id'] + '.json'), 'w', encoding='utf-8') as f:
                json.dump(dict(st, subject=s['id']), f, ensure_ascii=False, separators=(',', ':'))
            entry['sets'].append({'id': st['id'], 'no': st['no'], 'title': st['title'],
                                  'projects': [{'id': p['id'], 'title': p['title'], 'tasks': len(p['tasks'])} for p in st['projects']]})
        index['subjects'].append(entry)
    with open(os.path.join(ROOT, 'data', 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    if os.path.exists(os.path.join(ROOT, 'data', 'catalog.json')):
        os.remove(os.path.join(ROOT, 'data', 'catalog.json'))

    for s in catalog['subjects']:
        for st in s['sets']:
            no_main = [p['id'] for p in st['projects'] if not p['main']]
            no_guide = sum(1 for p in st['projects'] for t in p['tasks'] if 'guide' not in t)
            print('%-11s %-8s %d project, %d task%s%s' % (
                s['name'], 'Tiết %d' % st['no'], len(st['projects']), sum(len(p['tasks']) for p in st['projects']),
                ', thiếu tệp đề: %s' % no_main if no_main else '',
                ', %d task chưa có hướng dẫn' % no_guide if s['id'] != 'excel' and no_guide else ''))


if __name__ == '__main__':
    main()
