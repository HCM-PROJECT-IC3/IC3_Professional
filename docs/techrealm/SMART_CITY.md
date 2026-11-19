# TechRealm — Vạn Tượng Giới & Thành phố thông minh

> 17/11/2026 · Mã: `js/techrealm/smart-city-core.js`, `js/techrealm/life-missions-core.js` (luật thuần, có test),
> `web/src/features/techrealm/city/` (giao diện, gói lười riêng), `pages/LabPage.tsx` (Vạn Tượng Giới).

## 0. Tóm tắt

- Theo Prompt 06 §6: **một thành phố nhỏ có thể tương tác** (6×6 ô, có sông), **8 công trình mẫu**
  (trạm năng lượng có 2 loại), **6 chỉ số** có công thức rõ ràng. Mở rộng sau khi nghiệm thu.
- **Mọi công trình (trừ Khu dân cư, nơi bắt đầu) mở khoá bằng bằng chứng học tập thật trên máy:** bài đã đạt ở Tàng
  Kinh Các, sao Bí cảnh 1, điểm nhiệm vụ đời sống.
- **2 nhiệm vụ đời sống mới**: *Tính tiền điện*, *Phân loại rác*. Cùng *Lập kế hoạch tiết kiệm* (đã có), mỗi nhiệm vụ
  mở khoá công trình.
- **Vạn Tượng Giới** chia 3 khu đúng Prompt 06. Mỗi mục trỏ tới nội dung có thật hoặc ghi "Sắp mở".
- **Sân tập:** không sinh EXP/công huân nên không cần máy chủ. **0 lượt Firebase, 0 lượt Apps Script.** Dữ liệu ở
  `localStorage` (`tr.city.v1`, `tr.missions.v1`).

## 1. Vạn Tượng Giới

| Khu | Mục | Trạng thái |
|---|---|---|
| **Phòng thí nghiệm khoa học** | Vật lý · Năng lượng | Mở: Bí cảnh 1 (mạch điện; chia công suất) |
| | Toán học | Mở: Tính tiền điện (bậc thang, phần trăm) |
| | Môi trường | Mở: Phân loại rác; chỉ số Môi trường của thành phố |
| | Hóa học · Sinh học | Sắp mở (thiết kế trong Bí cảnh 5). Chỉ mô phỏng, **không hướng dẫn thí nghiệm thật có rủi ro** |
| **Công nghệ** | AI Lab · Coding Lab | Mở: khoá *AI nhập môn*, *Tư duy máy tính* |
| | Data Lab | Mở: Bí cảnh 1 · Phòng điều khiển (đọc biểu đồ) |
| | Robotics Lab · IoT Lab | Sắp mở (Bí cảnh 4) |
| **Đời sống thực tiễn** | Tính tiền điện · Phân loại rác · Lập kế hoạch tiết kiệm | Mở |
| | Bảo mật tài khoản | Mở: khoá *Kỹ năng sống trên môi trường số* |
| | Bảo vệ môi trường | Mở: Thành phố thông minh |
| | Quản lý chi tiêu · Quản lý thời gian · Thiết kế nhà thông minh | Sắp mở |

## 2. Nhiệm vụ đời sống

### 2.1 Tính tiền điện
- 6 thiết bị (tủ lạnh, đèn, quạt, tivi, máy lạnh, nồi cơm). Học sinh chỉnh số giờ dùng mỗi ngày, có giới hạn tối
  thiểu (tủ lạnh 24 giờ, nồi cơm ≥ 1 giờ).
- Điện năng/tháng = **W × giờ/ngày × 30 ÷ 1000** (kWh). Tiền tính **bậc thang**: mỗi bậc chỉ tính phần kWh trong bậc đó.
- **Giá là giá minh hoạ** để học cách tính, giao diện ghi rõ là không phải biểu giá điện hiện hành. Lý do: giá thật
  thay đổi theo từng đợt điều chỉnh; đưa số thật vào thì sẽ lỗi thời.
- Mục tiêu: hoá đơn ≤ 500.000 đ. Điểm = đạt ngân sách 50 + 3 câu vận dụng × 16,7.
- ≥ 60 điểm mở **Nhà máy**, và cùng màn "Nhà máy điện" mở **Trạm điện mặt trời**.

### 2.2 Phân loại rác
- 17 món, 4 thùng theo Luật Bảo vệ môi trường 2020: **Tái chế**, **Thực phẩm**, **Rác khác**, cộng nhóm **Nguy hại** thu
  gom riêng (pin, bóng đèn huỳnh quang, thuốc hết hạn, bình xịt côn trùng).
- Mỗi món có giải thích vì sao (vd. bóng huỳnh quang có thủy ngân, để nguyên, không đập vỡ).
- ≥ 60 điểm mở **Công viên**.

## 3. Thành phố thông minh

### 3.1 Bản đồ
6 × 6 ô; 7 ô sông (không xây được). Bắt đầu với 300 xu. Thao tác: **Xây** (chọn công trình, bấm ô trống), **Phá**
(hoàn 50%), **Qua một năm** (cộng tiền ròng, lưu lịch sử chỉ số). Tự lưu trên máy; "Xây lại từ đầu" chỉ xoá bản đồ,
không xoá công trình đã mở khoá.

### 3.2 Công trình

| Công trình | Giá | Điện (MW) | Môi trường | Khác | Mở khoá khi |
|---|---|---|---|---|---|
| Khu dân cư | 40 | −5 | −2 | +100 dân, thu 8/năm | Mở sẵn (nơi bắt đầu) |
| Trường học | 60 | −4 | 0 | Khoa học +12 | Đạt 1 bài bất kỳ ở Tàng Kinh Các |
| Bệnh viện | 80 | −6 | −1 | Khoa học +4, ưu tiên điện cao nhất | Đạt 3 bài khoá *Kỹ năng sống trên môi trường số* |
| Công viên | 30 | 0 | **+8** | | Phân loại rác ≥ 60 |
| Nhà máy | 70 | −10 | **−12** | Thu 25/năm | Tính tiền điện ≥ 60 |
| Phòng thí nghiệm | 90 | −6 | 0 | Khoa học +20 | Màn "Trạm biến áp" (Bí cảnh 1) đạt 2 sao |
| Trung tâm AI | 120 | −12 | 0 | Công nghệ +25, thu 10/năm | Đạt 2 bài *AI nhập môn* **và** đã xây Phòng thí nghiệm |
| Trạm năng lượng · Điện mặt trời | 100 | **+25** | 0 | | Màn "Nhà máy điện" + Tính tiền điện ≥ 60 |
| Trạm năng lượng · Nhiệt điện than | 50 | **+40** | **−18** | | Màn "Nhà máy điện" (Bí cảnh 1) |

### 3.3 Sáu chỉ số (0–100) — công thức

| Chỉ số | Công thức |
|---|---|
| **Năng lượng** | 100 × điện cấp ÷ điện cần (tối đa 100; không ai dùng điện thì 100). **Thiếu điện:** cấp lần lượt theo ưu tiên (bệnh viện → trường → dân cư, phòng TN, AI → nhà máy, công viên); công trình không đủ điện thì **không hoạt động**: không thu tiền, không góp chỉ số, vẫn tốn bảo trì |
| **Kinh tế** | 50 + 2 × (tổng thu của công trình đang chạy − tổng bảo trì) |
| **Môi trường** | 70 + Σ tác động môi trường của công trình đang chạy |
| **Khoa học** | Σ điểm khoa học của công trình đang chạy |
| **Công nghệ** | Σ điểm công nghệ của công trình đang chạy |
| **Chất lượng cuộc sống** | Trung bình các khu dân cư: 40 + trường trong 2 ô (+15) + bệnh viện trong 2 ô (+15) + công viên sát bên (+10) − sát nhà máy / nhiệt điện (−15) − mất điện (−30); rồi × (0,5 + Môi trường ÷ 200) |

Bấm vào từng chỉ số để xem bảng **"Vì sao = …?"**: từng công trình góp bao nhiêu. Với Chất lượng cuộc sống, bảng ghi
phần đóng góp **trung bình thật** (vd. 1/2 khu có trường thì +8, không ghi +15).

### 3.4 Quyết định ảnh hưởng thành phố (có test)

| Quyết định | Hệ quả (đã kiểm) |
|---|---|
| Than thay vì mặt trời | Rẻ hơn, nhiều điện hơn, nhưng Môi trường −18 → kéo Chất lượng sống xuống qua hệ số môi trường |
| Đặt khu dân cư sát nhà máy / nhiệt điện | −15 Chất lượng sống cho khu đó |
| Xây trường, bệnh viện trong 2 ô, công viên sát bên | Chất lượng sống từ 34 → 70 (vd. trong test) |
| Xây quá sức trạm điện | Công trình ưu tiên thấp mất điện, mất thu nhập; bệnh viện được giữ |
| Nhiều nhà máy | Kinh tế cao nhưng Môi trường thấp |

### 3.5 Mục tiêu mẫu "Thành phố xanh" (6 điều kiện)
≥ 400 dân · Năng lượng 100% và không công trình nào mất điện · Môi trường ≥ 60 · Chất lượng sống ≥ 70 · Khoa học ≥ 30
và Công nghệ ≥ 20 · Kinh tế ≥ 50. Có lời giải mẫu trong test để chắc chắn mục tiêu đạt được.

## 4. Kiểm thử

| Bộ | Nội dung | Số kiểm tra |
|---|---|---|
| `js/techrealm/__tests__/smart-city-core.test.js` | Mở khoá theo bằng chứng; luật xây; công thức 6 chỉ số; than vs mặt trời; nhà sát nhà máy; dịch vụ gần nhà; ưu tiên điện giữ bệnh viện; giải thích đúng số; luôn 0–100; qua năm; mục tiêu đạt được; làm sạch dữ liệu lưu; tiền điện bậc thang; giới hạn tối thiểu; phân loại rác (nguy hại, giải thích) | 33 |
| `tests/e2e/suites/techrealm.mjs` | Vạn Tượng Giới đủ mục; máy mới chỉ mở Khu dân cư; mất điện; sông; làm 2 nhiệm vụ qua giao diện → mở công trình; hoá đơn khớp luật; Môi trường 76 → 58 khi thêm than; bảng "vì sao"; qua năm; tải lại vẫn còn; 375px; 0 request ra ngoài | +19 (cả bộ 79) |

Đã cài lỗi thử: bỏ phạt "nhà sát nhà máy", bỏ ưu tiên điện. Test bắt được cả hai. Lần đầu, lỗi ưu tiên điện **không**
bị bắt, vì vị trí bệnh viện trong test vô tình xếp trước; đã sửa test.

## 5. Mở rộng sau nghiệm thu (đề xuất)

1. Bản đồ lớn hơn (10 × 10) và đường giao thông (công trình phải nối đường).
2. Sự kiện theo năm (hạn hán, nắng nóng, như Boss bí cảnh 1) để thử độ bền thành phố.
3. Thêm nhiệm vụ: Quản lý chi tiêu, Quản lý thời gian, Thiết kế nhà thông minh (mở công trình mới: nhà thông minh,
   trạm xe điện).
4. Nối với Bách Công Phường: sản phẩm được duyệt mở công trình đặc biệt.
5. Thi đua thành phố trong lớp (cần mã học tập; điểm do máy chủ tính lại từ thao tác như bí cảnh).
