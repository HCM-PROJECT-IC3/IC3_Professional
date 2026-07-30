#!/usr/bin/env python3
"""
generate_explanations.py
────────────────────────────────────────────────────────────────────────
Sinh field "explanation" (giải thích đúng/sai) cho MỌI câu hỏi trong
quiz_data.json — dựa trên chính dữ liệu đáp án đúng đã có sẵn (không
cần nguồn ngoài). Áp dụng theo từng loại câu hỏi (single/multi/
truefalse/matching/hotspot).

Chạy:
  python3 scripts/generate_explanations.py
  (đọc + ghi đè quiz_data.json ở thư mục gốc dự án)

Sau khi chạy, nhớ chạy lại scripts/split-quiz-data.py để đồng bộ
data/ic3/*.json + version cache-busting mới.
────────────────────────────────────────────────────────────────────────
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "quiz_data.json"


def explain_single_multi(q):
    correct = q.get("correct") or []
    if not correct:
        return ""
    if len(correct) == 1:
        return f"Đáp án đúng là: “{correct[0].rstrip('.')}”."
    joined = "; ".join(f"“{c.rstrip('.')}”" for c in correct)
    return f"Các đáp án đúng là: {joined}."


def explain_truefalse(q):
    lt = q.get("label_true", "Đúng")
    lf = q.get("label_false", "Sai")
    trues  = [s["text"].rstrip(".") for s in q.get("statements", []) if s.get("answer") == "true"]
    falses = [s["text"].rstrip(".") for s in q.get("statements", []) if s.get("answer") == "false"]
    parts = []
    if trues:
        parts.append(f"{lt}: " + ", ".join(trues) + ".")
    if falses:
        parts.append(f"{lf}: " + ", ".join(falses) + ".")
    return " ".join(parts)


def explain_matching(q):
    pairs = q.get("pairs") or []
    if not pairs:
        return ""
    joined = "; ".join(f"“{p['left'].rstrip('.')}” ↔ “{p['right'].rstrip('.')}”" for p in pairs)
    return f"Ghép đúng: {joined}."


def explain_hotspot(q):
    areas = q.get("areas") or []
    n_correct = sum(1 for a in areas if a.get("correct"))
    if n_correct == 0:
        return ""
    if n_correct == 1:
        return "Đáp án đúng là vị trí được đánh dấu màu xanh trên hình minh họa ở trên."
    return f"Có {n_correct} vị trí đúng, được đánh dấu màu xanh trên hình minh họa ở trên."


EXPLAINERS = {
    "single": explain_single_multi,
    "multi": explain_single_multi,
    "truefalse": explain_truefalse,
    "matching": explain_matching,
    "hotspot": explain_hotspot,
}


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    total = 0
    filled = 0

    for cat in data.get("categories", []):
        for level in cat.get("levels", []):
            for mt_name, qs in level.get("minitests", {}).items():
                for q in qs:
                    total += 1
                    # Không ghi đè giải thích đã có sẵn (vd. đã chỉnh tay qua admin.html)
                    if q.get("explanation"):
                        continue
                    fn = EXPLAINERS.get(q.get("type"))
                    text = fn(q) if fn else ""
                    if text:
                        q["explanation"] = text
                        filled += 1

    SRC.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"✅ Đã điền giải thích cho {filled}/{total} câu hỏi → {SRC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
