#!/usr/bin/env python3
"""
extract_questions_for_explain.py
────────────────────────────────────────────────────────────────────────
Trích 1 bản GỌN của mọi câu hỏi trong 1 file data/ic3/<cat>__<lvl>.json
— đủ thông tin để 1 người (hoặc AI) ĐỌC và VIẾT giải thích thật (vì sao
đáp án đúng), nhưng KHÔNG kèm ảnh/base64/toạ độ hotspot rườm rà — giúp
file gọn hơn nhiều so với file gốc, dễ đọc/viết hàng loạt.

Dùng chung với apply_explanations.py (script kia ghi kết quả TRỞ LẠI
file gốc theo "uid", không đụng tới field nào khác).

Cách dùng:
  python3 scripts/extract_questions_for_explain.py data/ic3/IC3__LV1.json out.jsonl

Định dạng output: 1 dòng JSON / câu hỏi (JSONL), field "uid" luôn có mặt
— dùng làm khoá để ghép lại sau này qua apply_explanations.py.
"""
import json
import sys

# Console Windows mặc định dùng codepage cp125x, không encode được emoji/dấu
# tiếng Việt trong print() → crash. Ép stdout/stderr sang UTF-8 khi có thể
# (Python ≥ 3.7); im lặng bỏ qua nếu môi trường không hỗ trợ reconfigure().
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


def summarize(q):
    t = q.get("type")
    base = {"uid": q.get("uid", ""), "type": t, "question": q.get("question", "")}

    if t in ("single", "multi"):
        base["options"] = q.get("options", [])
        base["correct"] = q.get("correct", [])
    elif t == "truefalse":
        base["label_true"] = q.get("label_true", "Đúng")
        base["label_false"] = q.get("label_false", "Sai")
        base["statements"] = [
            {"text": s.get("text", ""), "answer": s.get("answer", "")}
            for s in q.get("statements", [])
        ]
    elif t == "matching":
        base["pairs"] = [
            {"left": p.get("left", ""), "right": p.get("right", "")}
            for p in q.get("pairs", [])
        ]
    elif t == "hotspot":
        n_correct = sum(1 for a in q.get("areas", []) if a.get("correct"))
        base["n_correct_areas"] = n_correct
        base["note"] = "Câu dạng bấm vào hình — không có nhãn chữ cho từng vùng, chỉ biết SỐ vị trí đúng."
    elif t == "list":
        base["items"] = [
            {"text": it.get("text", ""), "options": it.get("options", []), "correct": it.get("correct", "")}
            for it in q.get("items", [])
        ]
    elif t == "classify":
        base["zones"] = [z if isinstance(z, str) else z.get("label", "") for z in q.get("zones", [])]
        base["items"] = [
            {"text": it.get("text", ""), "zone": it.get("zone", "")}
            for it in q.get("items", [])
        ]
    elif t == "ordering":
        base["correct_order"] = q.get("items", [])
    elif t in ("dragfill", "selectfill"):
        base["segments"] = q.get("segments", [])
        base["blanks"] = q.get("blanks", [])
        base["word_bank"] = q.get("wordBank", [])

    if q.get("hint"):
        base["hint"] = q["hint"]

    return base


def main():
    if len(sys.argv) != 3:
        print("Dùng: python3 extract_questions_for_explain.py <infile.json> <outfile.jsonl>")
        sys.exit(1)
    infile, outfile = sys.argv[1], sys.argv[2]

    data = json.loads(open(infile, encoding="utf-8").read())
    count = 0
    with open(outfile, "w", encoding="utf-8") as out:
        for mt_name, qs in (data.get("minitests") or {}).items():
            for q in qs:
                row = summarize(q)
                row["minitest"] = mt_name
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                count += 1
    print(f"✅ Đã trích {count} câu hỏi từ {infile} → {outfile}")


if __name__ == "__main__":
    main()
