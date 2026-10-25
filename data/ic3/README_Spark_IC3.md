# Bộ câu hỏi Spark & IC3 (GS6) — chuyển đổi từ iSpring QuizMaker

Thay thế cho bộ câu hỏi THCS/TIH cũ (K3-K8). Nguồn gốc: 6 file `.quiz`
(iSpring QuizMaker) `Spark_GS6_LV1/2/3` và `IC3_GS6_LV1/2/3`.

## Cấu trúc
- `Spark__LV1/2/3.json`, `IC3__LV1/2/3.json` — dữ liệu câu hỏi đầy đủ, được
  `meta.json` trỏ tới qua field `file` (engine fetch tại `data/ic3/<file>`).
- `meta.json` — chỉ 2 category: `Spark` và `IC3`, mỗi category 3 level
  (`LV1/LV2/LV3`, giữ nguyên tên gốc "GS6 LV1/2/3", **không** tương ứng
  K3-K8 hay K6-K8 như quy ước cũ).
- *(Đã gỡ 10/2026)* `../manual_review/*.json` — dữ liệu rà soát thủ công của đợt nhập đầu, đã gộp vào `data/ic3`; còn trong lịch sử git nếu cần.

## Loại câu hỏi đã chuyển tự động
- `MultipleChoice` → `single`
- `MultipleResponse` → `multi`
- `Matching` → `matching`
- `MultipleChoiceText` nhị phân nhất quán (mọi dòng dùng đúng 1 cặp lựa
  chọn, vd Đúng/Sai, Có/Không, Phần cứng/Phần mềm...) → `truefalse`, với
  `label_true`/`label_false` lấy đúng theo cặp nhãn gốc của từng câu (có
  thể không mang nghĩa đúng/sai theo nghĩa đen — UI hiển thị truefalse
  cần dùng đúng 2 field này thay vì hard-code "Đúng/Sai").

## uid
`{cat}__{lv}__mt{n}__q{sort}` viết thường, vd `spark__lv1__mt1__q1`.

## Bộ "Theo chủ đề" (7 minitest "N. Tên chủ đề")
Chủ đề của từng câu bám **PPCT của cấp đó** (không chỉ theo số `tN` trong uid — uid giữ nguyên
khi chuyển chủ đề để link đề/lịch sử cũ không vỡ). Mọi chuyển/bỏ câu ghi ở `topic-reassign.json`
(kèm lý do); sửa dữ liệu chủ đề → cập nhật file đó → `node scripts/apply-topic-reassign.js` →
`node scripts/generate-review-minitests.js` → `python scripts/split-minitests.py`. `scripts/validate-data.js` chặn câu trùng / câu ở 2 chủ đề.

## Đồng bộ với đáp án gốc "All Key" (iSpring .quiz NH2025-2026)
`allkey-sync.json` ghi các câu thêm từ khoá (`adds`) và các câu sửa theo khoá (`updates`, giữ uid),
kèm nguồn `All Key › <file> › <nhóm>#<số>` và lý do. Câu khoá có nhiều phiên bản thì giữ bản cũ và
thêm bản mới (không ghi đè). Áp dụng: `node scripts/apply-allkey-sync.js` →
`python scripts/build-allkey-map.py "<thư mục All Key>"` → `node scripts/generate-review-minitests.js` → `python scripts/split-minitests.py`.

## 3 nhóm bộ câu hỏi — không trộn lẫn
| Nhóm | Tên bộ | Nguồn | Dùng |
|---|---|---|---|
| Theo Tên bài | `Bài N. …` | file Củng cố của giáo viên (`Quiz/*_CungCo.xlsx`) | dạy/luyện trên lớp — chỉ chế độ Ôn luyện, không trộn vào bộ khác |
| Theo chủ đề | `N. Tên chủ đề` | ngân hàng chủ đề (All Key + câu GS6 cũ) | luyện theo chủ đề, Tổng hợp, mini-game |
| Ôn tập / Kiểm tra theo tiết | `Ôn tập 1 (Tiết 11): …`, `Kiểm tra HK1 (Tiết 24)`, `Luyện thi — …` | **chỉ câu All Key** (`allkey-map.json`), chia theo tiết ôn/kiểm tra trong PPCT từng khối (`ppct-review.json`) | ôn trước kiểm tra, làm bài Kiểm tra |

- `ppct-review.json`: tiết Ôn tập / Kiểm tra / Luyện thi của từng cấp (PPCT 2026-2027 bản Aca HCM, 45 tiết) và các chủ đề mỗi tiết phủ.
  Ôn tập = mọi câu All Key của các chủ đề đó; Kiểm tra = rút đều (có seed) đúng số câu đề thi thật của khối từ các chủ đề đã học tới tiết đó;
  Luyện thi = nguyên 1 đề All Key.
- `allkey-map.json`: câu chủ đề nào trùng câu All Key nào (`"Đề#số câu"`) + danh sách câu All Key chưa tìm thấy trong dữ liệu (`unmatched`).
- `scripts/validate-data.js` chặn: bộ Ôn tập/Kiểm tra có câu ngoài All Key, có câu "Bài N", hoặc lệch nội dung bộ chủ đề.
