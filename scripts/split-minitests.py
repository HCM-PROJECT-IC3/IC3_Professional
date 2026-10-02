#!/usr/bin/env python3
"""
split-minitests.py
────────────────────────────────────────────────────────────────────────
Tách tiếp MỖI "minitest" (1 chủ đề / 1 "Tiết N" / 1 "Bài N") trong các
file data/ic3/<cat>__<level>.json (đã được split-quiz-data.py ghi ra)
thành 1 file JSON riêng, nhỏ:

  data/ic3/minitests/<cat>_<level>/<slug>.json   → CHỈ mảng câu hỏi của
                                                    đúng 1 minitest đó.
  data/ic3/minitests-manifest.json               → { "cat__level": {
                                                    "Tên minitest":
                                                    "đường dẫn file" } }

VÌ SAO CẦN BƯỚC NÀY (ngoài split-quiz-data.py)?
  split-quiz-data.py đã tách theo LEVEL (mỗi khối 1 file), nhưng 1 khối
  giờ có tới ~50 minitest (7 chủ đề + 8 "Tiết N" + 35 "Bài N" — chế độ
  "Theo Tên bài"), nên file/khối nặng 0.5-1.2MB dù học sinh chỉ chọn
  ĐÚNG 1 bài (~15 câu, chỉ cần vài chục KB). Script này tách tiếp xuống
  cấp "từng minitest" để js/quiz-engine.js (_fetchMinitestQuestions) chỉ
  tải đúng phần cần dùng — nhanh hơn 10-50 lần cho trường hợp phổ biến
  nhất, vẫn fallback an toàn về file cấp-level cũ nếu thiếu/lỗi.

CÁCH CHẠY:
  python3 scripts/split-minitests.py
  (đọc data/ic3/*.json hiện có, ghi ra data/ic3/minitests/ +
  data/ic3/minitests-manifest.json — KHÔNG đụng tới meta.json hay các
  file <cat>__<level>.json gốc, chỉ thêm dữ liệu phái sinh bên cạnh)

KHI NÀO CẦN CHẠY LẠI:
  Mỗi khi nội dung minitest trong data/ic3/<cat>__<level>.json đổi (thêm/
  sửa/xoá câu hỏi của BẤT KỲ chủ đề/Tiết/Bài nào) — dù sửa trực tiếp hay
  qua split-quiz-data.py — chạy lại script NÀY SAU CÙNG để đồng bộ lại
  các file nhỏ + manifest, rồi commit luôn thư mục data/ic3/minitests/
  và file data/ic3/minitests-manifest.json.
────────────────────────────────────────────────────────────────────────
"""
import io
import json
import pathlib
import re
import sys
import unicodedata

# Console Windows mặc định dùng codepage (vd cp1258), không encode được
# ✓/→ hay tiếng Việt có dấu trong print() — ép stdout/stderr UTF-8 để
# script chạy được trên mọi máy mà không cần set PYTHONIOENCODING tay.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "ic3"
OUT_ROOT = DATA_DIR / "minitests"

# Tự dò mọi file "<cat>__<level>.json" trong data/ic3/ (IC3__LV1.json,
# Spark__LV3.json, MOS__Word.json...) thay vì liệt kê cứng, để thêm
# khối/chương trình mới sau này không cần sửa script.
LEVEL_FILE_RE = re.compile(r"^([A-Za-z0-9]+)__([A-Za-z0-9]+)\.json$")


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "mt"


def main():
    if not DATA_DIR.exists():
        sys.exit(f"❌ Không tìm thấy {DATA_DIR}")

    manifest = {}
    total_minitests = 0
    total_bytes = 0

    for path in sorted(DATA_DIR.glob("*.json")):
        m = LEVEL_FILE_RE.match(path.name)
        if not m:
            continue  # meta.json, minitests-manifest.json... không phải file level
        cat, lv = m.group(1), m.group(2)

        data = json.loads(path.read_text(encoding="utf-8"))
        minitests = data.get("minitests", {})
        out_dir = OUT_ROOT / f"{cat}_{lv}"
        out_dir.mkdir(parents=True, exist_ok=True)

        used_slugs = {}
        level_manifest = {}
        for name, questions in minitests.items():
            base_slug = slugify(name)
            slug = base_slug
            n = 2
            while slug in used_slugs and used_slugs[slug] != name:
                slug = f"{base_slug}-{n}"
                n += 1
            used_slugs[slug] = name

            out_path = out_dir / f"{slug}.json"
            content = json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
            out_path.write_text(content, encoding="utf-8")
            total_bytes += len(content.encode("utf-8"))

            level_manifest[name] = f"minitests/{cat}_{lv}/{slug}.json"

        manifest[f"{cat}__{lv}"] = level_manifest
        total_minitests += len(level_manifest)
        print(f"  ✓ {cat}/{lv}: {len(level_manifest)} minitest → {out_dir.relative_to(ROOT)}")

    manifest_path = DATA_DIR / "minitests-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    print(f"\n✅ Đã tách {total_minitests} minitest ({total_bytes / 1024:.0f} KB tổng).")
    print(f"   manifest: {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
