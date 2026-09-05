#!/usr/bin/env python3
"""
apply_explanations.py
────────────────────────────────────────────────────────────────────────
Ghi field "explanation" (đã viết tay/AI viết theo uid) TRỞ LẠI file
data/ic3/<cat>__<lvl>.json gốc — CHỈ đổi đúng field "explanation" của
đúng câu hỏi khớp uid, không đụng tới bất kỳ field nào khác (question,
options, correct, ảnh, id...). An toàn để chạy nhiều lần.

Cách dùng:
  python3 scripts/apply_explanations.py data/ic3/IC3__LV1.json explanations_IC3_LV1.json

  Trong đó explanations_IC3_LV1.json là 1 object phẳng:
    { "ic3__lv1__t1__q1": "Vì RAM và ROM đều là...", ... }

Sau khi ghi, script TỰ KIỂM TRA:
  - File output vẫn là JSON hợp lệ.
  - Số câu hỏi (count) không đổi so với trước khi ghi.
  - Báo rõ bao nhiêu uid trong file giải thích KHÔNG khớp câu hỏi nào
    (có thể gõ sai uid) và bao nhiêu câu hỏi trong file gốc CHƯA có
    explanation tương ứng (còn thiếu, chưa được viết).
"""
import json
import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


def count_questions(data):
    n = 0
    for qs in (data.get("minitests") or {}).values():
        n += len(qs)
    return n


def main():
    if len(sys.argv) != 3:
        print("Dùng: python3 apply_explanations.py <data_file.json> <explanations.json>")
        sys.exit(1)
    data_path, expl_path = sys.argv[1], sys.argv[2]

    data = json.loads(open(data_path, encoding="utf-8").read())
    explanations = json.loads(open(expl_path, encoding="utf-8").read())

    before = count_questions(data)
    used_uids = set()
    missing = []

    for qs in (data.get("minitests") or {}).values():
        for q in qs:
            uid = q.get("uid", "")
            if uid in explanations:
                text = explanations[uid]
                if isinstance(text, str) and text.strip():
                    q["explanation"] = text.strip()
                    used_uids.add(uid)
            else:
                missing.append(uid)

    after = count_questions(data)
    if before != after:
        print(f"❌ DỪNG — số câu hỏi thay đổi bất thường ({before} → {after}), KHÔNG ghi file để tránh mất dữ liệu.")
        sys.exit(2)

    unmatched = set(explanations.keys()) - used_uids
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ Đã áp dụng {len(used_uids)} giải thích vào {data_path} (tổng {after} câu hỏi, không đổi).")
    if missing:
        print(f"⚠️ {len(missing)} câu hỏi trong file gốc CHƯA có giải thích tương ứng (uid không có trong {expl_path}).")
        for u in missing[:10]:
            print("   -", u)
        if len(missing) > 10:
            print(f"   ... và {len(missing) - 10} câu khác.")
    if unmatched:
        print(f"⚠️ {len(unmatched)} uid trong {expl_path} KHÔNG khớp câu hỏi nào trong file gốc (có thể gõ sai uid):")
        for u in list(unmatched)[:10]:
            print("   -", u)


if __name__ == "__main__":
    main()
