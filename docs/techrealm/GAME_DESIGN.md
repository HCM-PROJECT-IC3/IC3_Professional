# TechRealm — Game Design: Bí cảnh

> 17/11/2026 · Khung kỹ thuật và chấm điểm: [CHALLENGE_SYSTEM.md](CHALLENGE_SYSTEM.md). Phong cách hình ảnh:
> [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md).

## 1. Nguyên tắc thiết kế

| # | Nguyên tắc | Hệ quả |
|---|---|---|
| 1 | **Học qua làm, không phải trắc nghiệm đội lốt game.** Mỗi màn có một việc thật để làm (nối mạch, chia điện, đọc biểu đồ), câu hỏi chỉ để chốt hiểu biết | Mỗi màn có "nhiệm vụ" riêng rồi mới tới 1–3 câu vận dụng |
| 2 | **Theo lượt, không đòi phản xạ** | Học sinh chậm tay, máy phòng học yếu, bàn phím, trình đọc màn hình đều chơi được. Máy chủ chạy lại đúng từng bước để chấm |
| 3 | **Sai được, học từ sai** | Thử lại thoải mái; nhân vật gợi ý sau mỗi lần sai; điểm giảm nhẹ chứ không khoá |
| 4 | **Mỗi lượt chơi một đề khác** | Đề sinh từ hạt giống (vật liệu trong túi, công suất, số liệu, thứ tự sự kiện) → khó chép đáp án của bạn |
| 5 | **Phẳng, tự vẽ** | Sơ đồ mạch, bản đồ, nhân vật đều là SVG phẳng. Không ảnh AI, không hạt bay, không phát sáng. "Dòng điện chạy" là nét đứt chuyển động, tắt khi máy bật giảm chuyển động |
| 6 | **Làm xong một bí cảnh mẫu rồi mới làm tiếp** (Prompt 05 §5) | Bí cảnh 1 hoàn chỉnh; 2–5 mới ở mức thiết kế (§3) |

## 2. Bí cảnh 1 — Thành phố mất điện (đã chơi được)

**Kiến thức:** vật lý (mạch điện, vật dẫn / cách điện, công tắc, mạch song song), năng lượng (công suất, ưu tiên),
toán (cộng trừ trong giới hạn, tối ưu), dữ liệu (đọc biểu đồ cột, phát hiện bất thường, tổng theo giờ).
**Đối tượng:** lớp 4–8. **Thời lượng:** 10–15 phút cả bí cảnh.
**Mã:** luật `js/techrealm/thanh-pho-mat-dien-core.js`, giao diện `web/src/features/techrealm/challenges/PowerCityGame.tsx`.

### 2.1 Cốt truyện

Một đêm, sự cố ở trạm biến áp làm cả thành phố mất điện. Bệnh viện chạy máy phát dự phòng, trạm bơm nước ngừng, đèn
đường tắt. **Kỹ sư Lam**, kỹ sư điện của thành phố, nhờ học sinh làm trợ thủ: nối lại mạch, chia điện có hạn cho
các khu, tìm chỗ rò điện, rồi giữ thành phố qua **cơn bão quá tải**.

### 2.2 Nhân vật (NPC)

| Nhân vật | Vai trò | Hình |
|---|---|---|
| Kỹ sư Lam | Dẫn chuyện, giao nhiệm vụ, gợi ý khi sai, khen khi đúng. Lời thoại ngắn, xưng "mình – em" | `assets/npc-ky-su-lam.svg` (phẳng: mũ bảo hộ vàng, áo xanh) |
| Cơn bão quá tải | Boss, không có hình người: là thanh "sức mạnh cơn bão" và 5 đợt tấn công | Thanh tiến độ tím |

### 2.3 Bản đồ

Bản đồ thành phố (`assets/map-thanh-pho.svg`, phẳng): đường phố, khối nhà, một **đường dây điện** (nét vàng đứt) nối 4
địa điểm. Địa điểm mở lần lượt: qua địa điểm trước (≥ 1 sao) thì mở địa điểm sau.

`Trạm biến áp → Nhà máy điện → Phòng điều khiển → Tâm bão (Boss)`

### 2.4 Các màn

| # | Địa điểm | Nhiệm vụ | Câu đố / thử thách | Vận dụng kiến thức | Đề thay đổi theo hạt giống |
|---|---|---|---|---|---|
| 1 | **Trạm biến áp** | Nối lại 3 mạch: (a) mạch kín 2 chỗ đứt; (b) mạch có công tắc; (c) mạch song song chỉ cấp điện cho Bệnh viện, ngắt Khu vui chơi | Chọn vật liệu từ túi 6 món (3 dẫn điện: đồng, sắt, giấy nhôm, ruột bút chì; 3 cách điện: nhựa, gỗ khô, len, thủy tinh, cao su), đặt vào chỗ đứt, đóng công tắc, bấm **Thử mạch** | Vì sao đèn sáng? Vật nào không dẫn điện? Vì sao nhánh song song vẫn sáng khi nhánh kia ngắt? | Món nào có trong túi; thứ tự phương án |
| 2 | **Nhà máy điện** | Chia công suất có hạn (90/100/110 kW) cho 6 khu, **bắt buộc** Bệnh viện + Trạm bơm nước, dùng càng sát công suất càng tốt | Bật/tắt từng khu, thanh công suất đổi đỏ khi quá tải, bấm **Cấp điện** | Tính phần còn dư (công suất − đang dùng); vì sao ưu tiên nơi thiết yếu | Công suất máy; nhu cầu mỗi khu ±5 kW |
| 3 | **Phòng điều khiển** | Đọc điện năng 4 khu × 6 khung giờ, tìm chỗ rò | Biểu đồ cột nhỏ (cùng thang đo) hoặc bảng số; tìm **khu** và **giờ** bất thường, giờ cả thành phố dùng nhiều nhất | Vì sao phải sửa chỗ rò ngay (lãng phí, nguy hiểm) | Hệ số từng khu, nhiễu, vị trí chỗ rò (luôn nhìn thấy được: cao nhất trong khu đó và ≥ 1,8× khu khác cùng giờ, test 200 hạt giống) |
| Boss | **Tâm bão** | Chống 5 đợt: sét làm giảm máy phát, nắng nóng, trời tối phải bật đèn đường, ca mổ cấp cứu, pin mặt trời hỗ trợ, mưa lớn | Mỗi đợt bật/tắt các khu rồi **Chống đỡ**; không quá tải và giữ nơi thiết yếu thì cơn bão mất máu theo mức dùng điện hiệu quả | Khi máy phát giảm, tắt khu nào trước | 5/6 đợt và thứ tự |

### 2.5 Điều kiện hoàn thành và phần thưởng

- **Một màn hoàn thành** khi: làm xong nhiệm vụ VÀ trả lời đúng các câu vận dụng (sai thì chọn lại). Boss còn cần ≥ 3/5
  đợt không quá tải.
- **Bí cảnh hoàn thành** khi cả 4 màn đạt ít nhất 1 sao. Bản đồ và thẻ ở trang Bí Cảnh hiện "Hoàn thành".
- **Phần thưởng:**
  - *Tu vi luyện tập* (trên máy): mỗi lần lập kỷ lục mới của màn, nhận ½ số điểm tăng thêm.
  - *Công huân* (máy chủ xác nhận khi lớp bật): ≥ 85 điểm +30, ≥ 65 +20, ≥ 50 +10; Boss thêm +40; mỗi màn 1 lần. Cách
    xác nhận: CHALLENGE_SYSTEM.md §4.

### 2.6 Màn hình

`Cốt truyện → Bản đồ → Màn (nhân vật nói + bảng chơi + câu hỏi) → Kết quả (6 tiêu chí, sao, phần thưởng) → Bản đồ / Màn tiếp`.
Lần sau mở bí cảnh thì vào thẳng bản đồ.

## 3. Bí cảnh 2–5 — thiết kế (chưa làm)

Cùng khung: cốt truyện, 1 NPC, bản đồ 4 địa điểm, 3 màn + Boss, 6 tiêu chí chấm, đề sinh từ hạt giống, máy chủ chạy
lại để chấm.

### Bí cảnh 2 — Hacker xâm nhập (An toàn thông tin, mật khẩu, Internet)

NPC: **Chị Vy**, đội phản ứng sự cố của trường. Mạng trường bị tấn công trước ngày thi.

| Màn | Nhiệm vụ | Cơ chế |
|---|---|---|
| Phòng máy | Đánh giá 8 mật khẩu, sửa 3 cái yếu cho đạt chuẩn | Luật độ mạnh minh bạch (độ dài, loại ký tự, không dùng tên/ngày sinh); máy chủ kiểm lại |
| Hộp thư | Phân loại 10 email: lừa đảo hay thật | Mỗi email có dấu hiệu (địa chỉ gửi, link lạ, đòi gấp); đề rút từ kho câu IC3 chủ đề 7 |
| Phòng mạng | Chặn kẻ xâm nhập: chọn quy tắc tường lửa cho 6 kết nối | Mô phỏng theo lượt |
| Boss: Mã độc tống tiền | 5 lượt: chọn biện pháp (sao lưu, cập nhật, ngắt mạng, báo cáo…) đúng thứ tự | Sai thứ tự → mất dữ liệu |

Lưu ý: không trùng Cyber Detective / Thành Trì Dữ Liệu đang có. Hai trò đó giữ ở mục "Thử thách nhanh".

### Bí cảnh 3 — Giải mã cổ thư (Logic, thuật toán, mật mã)

NPC: **Cụ Đồ**, người giữ thư viện cổ. Một cuộn thư cổ bị mã hoá, giấu đường tới kho sách.

| Màn | Nhiệm vụ | Cơ chế |
|---|---|---|
| Hành lang | Mở khoá bằng mật mã Caesar (dịch chữ) | Đề sinh khoá ngẫu nhiên; gợi ý tần suất chữ |
| Thư phòng | Sắp xếp 8 cuộn thư theo năm bằng ít lần đổi chỗ nhất | Nhập môn thuật toán sắp xếp; đếm số bước |
| Mê cung | Viết chuỗi lệnh (tiến, rẽ trái, rẽ phải, lặp) cho robot ra khỏi mê cung | Lập trình khối đơn giản, chạy trên máy, máy chủ chạy lại |
| Boss: Ổ khoá logic | Lưới logic (mỗi hàng/cột một ký hiệu) | Có đúng một nghiệm (kiểm khi sinh đề) |

### Bí cảnh 4 — Kiến tạo thành phố thông minh (Robotics, IoT, lập trình)

NPC: **Kỹ sư Minh**, phụ trách dự án thành phố thông minh.

| Màn | Nhiệm vụ | Cơ chế |
|---|---|---|
| Ngã tư | Lập trình đèn giao thông theo cảm biến lượng xe | Luật NẾU–THÌ, mô phỏng theo lượt |
| Vườn thông minh | Đặt cảm biến độ ẩm và ngưỡng tưới | Đọc số liệu cảm biến, chọn ngưỡng |
| Kho hàng | Lập trình robot nhặt hàng tối ưu quãng đường | Lưới, khối lệnh, đếm bước |
| Boss: Mất kết nối | Chẩn đoán thiết bị IoT hỏng theo nhật ký | Đọc log, khoanh vùng lỗi |

### Bí cảnh 5 — Phòng thí nghiệm thất lạc (Khoa học, thí nghiệm, phân tích dữ liệu)

NPC: **Tiến sĩ Hà**, nhà khoa học mất sổ ghi chép.

| Màn | Nhiệm vụ | Cơ chế |
|---|---|---|
| Phòng hoá | Phân loại chất theo axit/bazơ/trung tính bằng giấy quỳ | Mô phỏng đổi màu; an toàn phòng thí nghiệm |
| Nhà kính | Thiết kế thí nghiệm có biến kiểm soát (ánh sáng và cây) | Chọn biến độc lập / phụ thuộc / giữ nguyên |
| Phòng số liệu | Vẽ và đọc đồ thị từ bảng đo | Chọn dạng biểu đồ đúng, đọc xu hướng |
| Boss: Kết luận | Từ dữ liệu, chọn kết luận được chứng minh / chưa đủ chứng cứ | Tư duy phản biện |

**Thứ tự đề xuất làm tiếp:** Bí cảnh 2, vì có sẵn nội dung IC3 chủ đề 7 và giáo viên đang dạy. Sau đó là 3, rồi 5, rồi 4
(cần thiết kế cơ chế lập trình khối, nặng nhất).

## 4. Vì sao không dùng Phaser / Canvas engine

| Tiêu chí | Phaser (~1 MB) | SVG + React (đang dùng) |
|---|---|---|
| Dung lượng thêm | ~300 KB gzip mỗi máy mới | Gói trò chơi 14 KB gzip |
| Bàn phím, trình đọc màn hình | Phải tự làm | Có sẵn (nút, nhãn) |
| Chấm lại trên máy chủ | Phải tách luật khỏi engine | Luật đã thuần, dùng chung với Apps Script |
| Loại game phù hợp | Hành động, vật lý thời gian thực | Theo lượt, câu đố, mô phỏng (đúng nhu cầu) |

Khi có bí cảnh cần chuyển động thời gian thực, nạp engine **chỉ trong gói của bí cảnh đó**, và vẫn phải tách luật
chấm điểm theo mẫu §CHALLENGE_SYSTEM 2.
