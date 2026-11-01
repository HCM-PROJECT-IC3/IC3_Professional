#!/usr/bin/env python3
"""scripts/shrink-git-history.py — làm repo nhẹ hẳn: bỏ khỏi LỊCH SỬ git các bản cũ của ảnh / tệp đề.

Mọi tệp từng commit nằm trong lịch sử mãi mãi. Đo 01/11/2026: 98 MB trong ~142 MB lịch sử là
tệp không còn dùng (92 MB là ảnh img/ trước khi nén). Script này KHÔNG đụng repo đang làm việc
và KHÔNG tự đẩy lên GitHub:

  1. Clone --mirror repo này sang thư mục mới (mặc định ../IC3_Professional-shrunk.git).
  2. Trong bản sao: bỏ mọi blob nằm dưới img/, mos/files/, mos/tools/fixtures-office/ hoặc
     quiz_data.json MÀ KHÔNG CÒN trong commit mới nhất (bản hiện tại giữ nguyên 100%).
     Lịch sử mã/dữ liệu (js, data/ic3...) giữ nguyên để còn xem lại được.
  3. Nén lại, in kích thước trước/sau và lệnh force-push để bạn TỰ chạy khi cả nhóm sẵn sàng.

Cần: pip install git-filter-repo   (hoặc --filter-repo <đường dẫn git_filter_repo.py>)
    python scripts/shrink-git-history.py [--out DIR] [--allow-dirty] [--filter-repo PATH]

Chạy SAU khi đã commit mọi thay đổi (tệp đang sửa chưa commit không có trong bản sao).
Sau khi force-push: mọi máy phải clone lại (hoặc `git fetch && git reset --hard origin/main`),
PR đang mở phải tạo lại; GitHub có thể giữ object cũ thêm một thời gian trước khi dọn.
"""
import argparse
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PREFIXES = ('img/', 'mos/files/', 'mos/tools/fixtures-office/')
FILES = ('quiz_data.json',)


def git(*args, cwd=ROOT, **kw):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True, encoding='utf-8', **kw).stdout


def size_mb(path):
    total = 0
    for d, _, files in os.walk(path):
        total += sum(os.path.getsize(os.path.join(d, f)) for f in files)
    return total / 1048576


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(ROOT), 'IC3_Professional-shrunk.git'))
    ap.add_argument('--allow-dirty', action='store_true', help='cho chạy khi còn thay đổi chưa commit (chỉ để đo thử)')
    ap.add_argument('--filter-repo', default='', help='đường dẫn git_filter_repo.py nếu chưa cài lệnh git filter-repo')
    a = ap.parse_args()

    if git('status', '--porcelain').strip() and not a.allow_dirty:
        sys.exit('Còn thay đổi chưa commit — commit trước (bản sao chỉ chứa những gì đã commit).')
    if os.path.exists(a.out):
        sys.exit('Thư mục đích đã có: ' + a.out)

    head = set(git('ls-tree', '-r', '--format=%(objectname)', 'HEAD').split())
    strip, strip_bytes = set(), 0
    objs = git('rev-list', '--objects', '--all')
    batch = subprocess.run(['git', 'cat-file', '--batch-check=%(objecttype) %(objectname) %(objectsize)'],
                           cwd=ROOT, input='\n'.join(l.split(' ', 1)[0] for l in objs.splitlines()),
                           capture_output=True, text=True, check=True).stdout.splitlines()
    for line, info in zip(objs.splitlines(), batch):
        sha, _, path = line.partition(' ')
        typ, _, size = info.split(' ')
        if typ == 'blob' and sha not in head and (path.startswith(PREFIXES) or path in FILES):
            if sha not in strip:
                strip.add(sha)
                strip_bytes += int(size)
    print('Bỏ %d bản cũ (%.1f MB chưa nén) khỏi lịch sử.' % (len(strip), strip_bytes / 1048576))

    print('Clone --mirror →', a.out)
    git('clone', '--mirror', '--quiet', ROOT, a.out, cwd=os.path.dirname(a.out))
    before = size_mb(a.out)
    ids = os.path.join(a.out, 'strip-ids.txt')
    with open(ids, 'w') as f:
        f.write('\n'.join(sorted(strip)) + '\n')
    cmd = [sys.executable, a.filter_repo] if a.filter_repo else ['git', 'filter-repo']
    subprocess.run(cmd + ['--strip-blobs-with-ids', ids, '--force', '--quiet'], cwd=a.out, check=True)
    os.remove(ids)
    git('reflog', 'expire', '--expire=now', '--all', cwd=a.out)
    git('gc', '--prune=now', '--aggressive', '--quiet', cwd=a.out)
    after = size_mb(a.out)

    # Bản hiện tại phải y hệt: so cây tệp của main trước/sau.
    same = git('rev-parse', 'HEAD^{tree}') == git('rev-parse', 'HEAD^{tree}', cwd=a.out)
    print('Kích thước repo: %.1f MB → %.1f MB. Bản mới nhất giữ nguyên: %s' % (before, after, 'CÓ' if same else 'KHÔNG — đừng đẩy!'))
    if not same:
        return 1
    url = git('remote', 'get-url', 'origin').strip()
    print('\nKiểm tra xong, khi cả nhóm sẵn sàng thì TỰ chạy (ghi đè lịch sử trên GitHub):')
    print('  git -C "%s" push --force "%s" "refs/heads/*:refs/heads/*" "refs/tags/*:refs/tags/*"' % (a.out, url))
    print('Rồi mọi máy clone lại repo. Không đẩy thì xoá thư mục trên là xong, không ảnh hưởng gì.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
