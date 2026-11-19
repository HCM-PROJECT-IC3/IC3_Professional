# AI Sư Phụ — thiết kế và bảo vệ dữ liệu (Prompt 07 §3–§4)

Trang: `/app/#/the-gioi/su-phu` (gói lười riêng `MentorPage`, ~19 KB gzip, chỉ tải khi mở trang).

AI Sư Phụ **không phải client AI mới**. Nó mở rộng Trợ lý AI có sẵn của EduQuiz:

```
MentorPage.tsx ─► mentorEngine.ts ─► EduAI (js/services/ai-service.js)
                                       ├─ bản đệm trên máy (eduquiz_ai_cache_v1)
                                       ├─ key cá nhân (BYOK, eduquiz_ai_v1) → gọi thẳng Gemini
                                       └─ key của trường → Apps Script aiAsk / aiAskStaff (78-ai.gs)
                                            └─ EduMentor.build (cùng file mentor-core.js chép vào Code.gs)
```

## 1. Các việc

| Việc | Ai dùng | Đường máy chủ | Ghi chú |
|---|---|---|---|
| `mentorConcept` | Học sinh | `aiAsk` (công khai, có trần) | Giải thích ngắn + ví dụ + 1 câu hỏi kiểm tra lại |
| `mentorHint` | Học sinh | `aiAsk` | Gợi ý 3 mức (nhắc kiến thức → loại trừ → phân tích phương án). **Dữ liệu vào không có trường đáp án đúng**, câu lệnh dặn AI không nêu đáp án |
| `codeHelp` | Học sinh | `aiAsk` | Python / JavaScript / HTML / Scratch: chỉ ra lỗi, giải thích, gợi ý sửa, không viết lại cả bài |
| `rubricReview` | Giáo viên | `aiAskStaff` (cần đăng nhập) | AI đề xuất điểm từng tiêu chí dạng JSON → `parseRubric` kẹp điểm trong [0, max], ghép theo tên tiêu chí. **Thầy cô quyết định điểm** |
| Gợi ý nhiệm vụ | Học sinh | **Không gọi AI** | `EduMentor.suggestNext`: luật trên máy từ tiến độ khoá, sao bí cảnh, nhiệm vụ đời sống, sổ tay câu sai |
| Tạo bài tập | Giáo viên | `aiAskStaff` → `genQuiz` (có sẵn) | Nằm ở Soạn đề (`ic3-dashboard.html`) |

Câu lệnh (prompt) do **code dựng từ dữ liệu có cấu trúc**, không nhận câu lệnh tự do → không mượn được key của trường để hỏi việc khác. Trình duyệt và Apps Script dùng chung `mentor-core.js` nên câu lệnh hai nơi giống hệt (có test so khớp).

## 2. Chế độ học và chế độ kiểm tra

- `EduMentor.modeOf(inProgress, now)`: máy có bản tự lưu bài làm chưa nộp của sảnh (`eduquiz_inprogress_v1`) với `examMode === 'test'` và lưu chưa quá 8 giờ (cùng ngưỡng `quiz-engine.js`) → **chế độ kiểm tra**.
- `EduMentor.policy(mode, task)`: ở chế độ kiểm tra **mọi việc AI của học sinh bị chặn** (`mentorConcept`, `mentorHint`, `codeHelp`, cả `explain` / `quickQ` cũ). Việc của giáo viên vẫn chạy.
- Giao diện: dải "Chế độ kiểm tra", ba thẻ hỏi AI được thay bằng "AI Sư Phụ tạm nghỉ". Thẻ Gợi ý nhiệm vụ vẫn mở vì không gọi AI.
- Giới hạn đã biết: chặn ở **máy học sinh**. Học sinh dùng máy khác hoặc xoá dữ liệu trình duyệt thì không chặn được (học sinh không đăng nhập). Ngay cả khi lọt, `mentorHint` vẫn không nhận và không nêu đáp án.

## 3. Bảo vệ dữ liệu (§4)

| Yêu cầu | Cách làm |
|---|---|
| Kiểm soát quyền truy cập | `rubricReview` chỉ đi qua `aiAskStaff` (vai trò giáo viên / quản trị). `aiAsk` công khai từ chối việc của giáo viên. Báo cáo năng lực sau `StaffGate` |
| Không gửi dữ liệu cá nhân thừa | `scrubPII` chạy **cả ở trình duyệt lẫn máy chủ**: email, link, số điện thoại VN, dãy 9–12 chữ số, mật khẩu, "tên em là…", "nhà em ở…". Giao diện báo trước "Đã tự ẩn N thông tin". Không gửi tên, lớp hay tiến độ học sinh cho AI |
| Không lộ API key | Key trường ở Script Property `GEMINI_API_KEY`, không bao giờ tới trình duyệt. Key cá nhân chỉ lưu trên máy đó, hiện dạng `AIza…xyz` |
| Giới hạn sử dụng | 30 lượt/máy/ngày (mã máy ẩn danh `eduquiz_ai_cid`), 150/tài khoản giáo viên, 800/trường/ngày (`AI_DAILY_MAX`). Lượt trúng bản đệm không tính |
| Kiểm soát nội dung | Câu lệnh hệ thống cố định (lứa tuổi, chỉ nội dung học tập). Gemini safety bật → báo "AI từ chối nội dung này". Hiển thị bằng React (không `innerHTML`) |
| Báo lỗi | Nút "Báo câu trả lời có vấn đề" → `aiReport` (4 lý do, ghi chú đã lọc PII, 10 lần/ngày/máy) |
| Ghi nhận hoạt động | Máy chủ: tab `NhatKyAI` (thời gian, loại, việc, mã người dùng băm SHA-256 10 ký tự, số ký tự hỏi/đáp). **Không lưu nội dung hỏi đáp**; dòng báo lỗi chỉ thêm ghi chú (≤ 300 ký tự, đã lọc PII). Trên máy: `tr.mentor.log` (30 dòng gần nhất, không nội dung) |

## 4. Chi phí

- **Firebase: 0.** Mở trang: 0 request ra ngoài (E2E kiểm).
- **Apps Script:** 1 lượt mỗi câu hỏi bằng key trường, trừ khi trúng bản đệm. Ghi nhật ký `NhatKyAI` chạy trong cùng lượt đó (1 `appendRow`, bọc try/catch nên lỗi ghi không làm hỏng câu trả lời). Báo lỗi: 1 lượt/lần, có trần.
- Gợi ý nhiệm vụ: 0 lượt.

## 5. Kiểm thử

- `node js/techrealm/__tests__/mentor-core.test.js`: dựng câu lệnh, gợi ý không có đáp án, lọc PII, chế độ kiểm tra, parseRubric, suggestNext.
- `node apps/__tests__/code-gs.test.js` (khối "AI Sư Phụ"): câu lệnh trình duyệt = máy chủ, PII bị lọc ở máy chủ, rubric bị chặn ở `aiAsk`, nhật ký không chứa nội dung, trần báo lỗi.
- E2E `techrealm`: 6 thẻ, báo ẩn số điện thoại, chế độ kiểm tra chặn thẻ hỏi và Lập trình, bài Ôn luyện dở vẫn là chế độ học, 375 px, 0 request ra ngoài.
