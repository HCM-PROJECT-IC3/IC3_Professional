#!/usr/bin/env python3
"""
build-allkey-map.py
────────────────────────────────────────────────────────────────────────
Ghi data/ic3/allkey-map.json: mỗi câu của 7 bộ "Theo chủ đề" (Spark/IC3) nằm ở ĐỀ ÔN nào
của file đáp án gốc All Key (iSpring .quiz) — vd "Test1#10", "OntapSo2#7".

All Key mỗi cấp là các đề ôn tập chính thức (LV1: Test1/Test2/Test3/Cập nhật 10_04_2026,
LV2: OntapSo1..3, LV3: BaiOnSo1..3, Spark: Test/On Tap 1..3). PPCT ghi tiết ôn theo đề
(vd IC3 LV1 "Ôn tập: Chủ đề Căn bản về công nghệ - Test 1"), nên
scripts/generate-review-minitests.js cần biết câu nào thuộc đề nào (và câu nào KHÔNG thuộc All Key).

Khớp câu: với TỪNG câu All Key, tìm câu chủ đề giống nhất (bộ chữ đề bài + lựa chọn/phát biểu,
không phân biệt thứ tự, dấu câu). 1 câu dữ liệu có thể trùng nhiều câu All Key (đề sau lặp câu đề trước).

CÁCH CHẠY (khi All Key hoặc ngân hàng chủ đề đổi):
  python scripts/build-allkey-map.py "C:/Users/<bạn>/Downloads/All Key/All Key"
  node scripts/generate-review-minitests.js
  python scripts/split-minitests.py
────────────────────────────────────────────────────────────────────────
"""
import io
import json
import pathlib
import re
import sys
import unicodedata
import zipfile

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "ic3"
FILES = {"IC3__LV1": "LV1.quiz", "IC3__LV2": "LV2.quiz", "IC3__LV3": "LV3.quiz",
         "Spark__LV1": "Spark_Lv1.quiz", "Spark__LV2": "Spark_Lv2.quiz", "Spark__LV3": "Spark_Lv3.quiz"}
TOPIC_RE = re.compile(r"^\d+\.\s")
LINKS = json.loads((DATA / "allkey-sync.json").read_text(encoding="utf-8")).get("links", [])


def words(s):
    s = unicodedata.normalize("NFC", re.sub(r"<[^>]+>", " ", str(s or ""))).lower()
    return set(w for w in re.split(r"[^\w]+", s) if w)


def texts(node, out):
    """Mọi chuỗi 't' (chữ) trong cây JSON của 1 slide iSpring."""
    if isinstance(node, dict):
        if isinstance(node.get("t"), str) and node.get("tp") == "text":
            out.append(node["t"])
        for v in node.values():
            texts(v, out)
    elif isinstance(node, list):
        for v in node:
            texts(v, out)
    return out


def q_words(q):
    parts = [q.get("question")]
    parts += q.get("options") or []
    parts += [s.get("text") for s in q.get("statements") or []]
    parts += [p.get("left", "") + " " + p.get("right", "") for p in q.get("pairs") or []]
    parts += [x if isinstance(x, str) else x.get("text", "") for x in q.get("items") or []]
    parts += q.get("segments") or []
    parts += q.get("wordBank") or []
    return words(" ".join(str(p or "") for p in parts))


def main():
    if len(sys.argv) < 2:
        sys.exit("Cần đường dẫn thư mục All Key, vd: python scripts/build-allkey-map.py \"C:/.../All Key/All Key\"")
    src = pathlib.Path(sys.argv[1])
    out, report, unmatched = {}, [], {}
    for lv, fname in FILES.items():
        doc = json.loads(zipfile.ZipFile(src / fname).read("document.json"))
        slides = []  # (nhãn "Đề#số câu", bộ chữ)
        for g in doc["sl"]["g"]:
            for k, s in enumerate(g["S"], 1):
                slides.append((f'{g["T"]}#{k}', words(" ".join(texts(s, [])))))
        level = json.loads((DATA / f"{lv}.json").read_text(encoding="utf-8"))
        bank = [q for name, lst in level["minitests"].items() if TOPIC_RE.match(name) for q in lst]
        cand = [(q, q_words(q), words(q.get("question"))) for q in bank]
        # Điểm = max(trùng toàn bộ chữ, phần chữ đề bài của câu nằm trong câu All Key) — câu dịch lại vài chữ
        # hoặc đổi dạng (chọn nhiều ↔ đúng/sai) vẫn khớp. Vế sau chỉ dùng khi đề bài ≥ 6 chữ và toàn bộ chữ
        # trùng ≥ 25% (tránh 1 câu đề bài chung chung "Với mỗi phát biểu..." hút hết câu khác).
        def score(c, sw):
            q, w, qw = c
            jac = len(w & sw) / max(1, len(w | sw))
            cont = len(qw & sw) / len(qw) * .9 if len(qw) >= 6 and jac >= .25 else 0
            return max(jac, cont)
        # Ghép tham lam theo điểm cao trước: mỗi câu All Key → 1 câu dữ liệu; 1 câu dữ liệu chỉ nhận thêm
        # câu All Key thứ 2+ khi gần như y hệt (≥ 0.8 — đề sau lặp lại câu của đề trước).
        pairs = sorted(((score(c, sw), i, j) for i, (_, sw) in enumerate(slides) for j, c in enumerate(cand)), reverse=True)
        took, used = {}, set()
        # Ghép tay (allkey-sync.json → links): câu khoá đã có trong data nhưng diễn đạt/dạng khác hẳn
        idx = {c[0]["uid"]: j for j, c in enumerate(cand)}
        for ln in LINKS:
            if ln["level"] != lv:
                continue
            i = next((i for i, (label, _) in enumerate(slides) if label == ln["src"]), None)
            if i is None or ln["uid"] not in idx:
                print(f"⚠ {lv}: links {ln['src']} → {ln['uid']} không tìm thấy, bỏ qua")
                continue
            took[i] = idx[ln["uid"]]
            used.add(idx[ln["uid"]])
        for sc, i, j in pairs:
            if sc < .5:
                break
            if i in took or (j in used and sc < .8):
                continue
            took[i] = j
            used.add(j)
        # Vòng 2 cho câu All Key còn lẻ (thường là câu có hình/hotspot, chữ ít): câu dữ liệu giống nhất
        # nếu ≥ 0.5, hoặc câu dữ liệu chưa khớp với câu nào mà giống nhất và ≥ 0.28.
        for i, (_, sw) in enumerate(slides):
            if i in took:
                continue
            ranked = sorted(((score(c, sw), j) for j, c in enumerate(cand)), reverse=True)
            pick = next(((sc, j) for sc, j in ranked if sc >= .5 or (sc >= .28 and j not in used)), None)
            if pick and pick[0] >= .28:
                took[i] = pick[1]
                used.add(pick[1])
        miss = []
        for i, (label, _) in enumerate(slides):
            if i in took:
                out.setdefault(cand[took[i]][0]["uid"], []).append(label)
            else:
                miss.append(label)
        unmatched[lv] = miss
        report.append((lv, len(slides), len(miss)))
    doc = {"_doc": "uid câu chủ đề → các câu All Key trùng (\"Đề#số câu\"). Câu không có ở đây = không thuộc All Key (không vào bộ Ôn tập/Kiểm tra). Sinh bằng scripts/build-allkey-map.py.",
           "unmatched": unmatched, "map": dict(sorted(out.items()))}
    (DATA / "allkey-map.json").write_text(json.dumps(doc, ensure_ascii=False, indent=0), encoding="utf-8")
    for lv, n, miss in report:
        print(f"{lv}: {n - miss}/{n} câu All Key tìm thấy trong ngân hàng chủ đề" + (f" — chưa thấy: {', '.join(unmatched[lv])}" if miss else ""))
    print("✅ Đã ghi data/ic3/allkey-map.json")


if __name__ == "__main__":
    main()
