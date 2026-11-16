---
phase: 3
title: "Moc anh va noi dung"
status: done
priority: P1
effort: "2.5h"
dependencies: [2]
---

# Phase 3: Mốc ảnh và nội dung

## Overview
Đưa 28 ảnh vào màn: 12 khối "?" cho các mốc lớn, 16 khung tranh dọc đường; 23 cây nến (= số tuổi) kèm cơ chế dẫn đường khi nhặt thiếu; màn nhập ngày sinh mở đầu.

## Requirements
- Functional:
  - **QuestionBlock** (hộp rune phép thuật): húc từ dưới lên → hộp nảy, ảnh bay ra → game pause → `PhotoModal` hiện ảnh, `label` (nhãn giai đoạn tự viết, ví dụ "Cấp 3"; không có thì ẩn) và caption. Đóng bằng chạm/Enter/Esc → game chạy tiếp. Mỗi hộp chỉ mở 1 lần, sau đó thành hộp rỗng nhưng có thể chạm để xem lại.
  - **PhotoFrame**: chân dung biết cử động trong khung vàng treo trên nền, ảnh thu nhỏ bên trong; khi người chơi đi ngang qua thì phóng to nhẹ và hiện caption ngắn bên dưới, không pause.
  - Thứ tự xuất hiện trên map = thứ tự file `01`→`28`. Ảnh `milestone: true` gán vào khối "?", các ảnh khác gán vào khung tranh nằm giữa hai mốc lớn liên tiếp. Việc gán do code tự làm theo thứ tự, map chỉ khai báo vị trí slot.
  - **Candle**: 23 cây nến (= số tuổi) lơ lửng kiểu Đại Sảnh Đường, HUD hiện `🕯 x/23`. Mỗi vùng có khoảng 2 cây (vùng cuối 1 cây), phần lớn nằm ngay trên đường chạy, vài cây cần nhảy lên mới lấy được. Nến có hiệu ứng lấp lánh và bồng bềnh để dễ thấy từ xa.
  - **Hướng dẫn khi nhặt thiếu nến** (cửa Đại Sảnh Đường dẫn vào đấu trường Voldemort chỉ mở khi đủ 23):
    1. Đến cửa mà còn thiếu: cửa rung nhẹ, hiện hộp thoại "Còn thiếu N cây nến nữa nè! 🕯".
    2. Thanh tiến trình nhỏ ở đầu màn hình đánh dấu vị trí các cây nến còn thiếu (chấm vàng); vị trí người chơi hiện bằng chấm mặt Trang.
    3. Mũi tên ở mép màn hình luôn chỉ về cây nến gần nhất còn thiếu (chỉ bật sau khi đã chạm cửa lần đầu, để không làm lộ trước).
    4. Hộp thoại có nút **"Dẫn đường"**: dịch chuyển người chơi về checkpoint gần cây nến thiếu đầu tiên, khỏi phải chạy ngược cả màn.
    5. Đủ 23 nến: cửa Đại Sảnh Đường mở và dẫn sang **Boss scene** (đấu trường Voldemort, xem phase 4); chỉ sau khi hạ boss mới vào phòng bánh kem.
  - **Login scene** (màn đầu, trước khi vào game):
    - Nền pixel, dòng chữ "Nhập ngày sinh để vào nhé", một ô nhập kiểu DOM có `inputmode="numeric"` (bàn phím số trên mobile) và placeholder `dd/mm/yyyy`.
    - Hàm parse dễ tính: chấp nhận `16/11/2003`, `16-11-2003`, `16.11.2003`, `16112003`, `16/11`, `1/11`... Tách các cụm số; nếu người dùng gõ liền 8 chữ số thì cắt theo `ddmmyyyy`. Đúng khi ngày và tháng khớp; năm không bắt buộc, nhưng nếu có nhập thì phải khớp.
    - Sai: ô nhập rung, hiện câu đùa nhẹ. Sai 3 lần thì hiện `loginHint`.
    - Đúng: confetti, nút "Vào" → Level. Cú chạm vào nút này dùng để mở khoá audio.
    - Không lưu trạng thái đăng nhập: mở lại link thì nhập lại (link chỉ để xem một lần nên giữ đơn giản).
- Non-functional: PhotoModal làm bằng DOM overlay (chữ tiếng Việt hiển thị nét, không phụ thuộc bitmap font); ảnh lazy-load theo vùng.

## Implementation Steps
1. Hàm `assignPhotos(slots, photos)`: chia ảnh vào slot block/frame theo thứ tự; cảnh báo trong console nếu số slot ≠ số ảnh.
2. QuestionBlock + PhotoModal (có hỗ trợ ảnh dọc/ngang, nút đóng ≥ 44px).
3. PhotoFrame và hiệu ứng khi đi ngang qua.
4. Candle, HUD, logic khoá cửa.
5. Login scene và hàm `matchBirthday(input, birthday)`; test nhanh các định dạng nêu trên bằng một script ném đi sau khi chạy.
6. Thanh tiến trình nến, mũi tên chỉ hướng và nút "Dẫn đường".

## Success Criteria
- [x] Ảnh gán vào slot đúng thứ tự thời gian `01`→`28` với mọi bộ mốc lớn (đã kiểm tra); chưa chơi thật từ đầu đến cuối.
- [x] Đổi `content.json` rồi chạy `npm run assets` là nội dung thay đổi theo, không phải sửa code. (Đã kiểm tra: đổi các bộ milestone trong `content.json` và chạy lại assets, không sửa code.)

## Risk Assessment
- Caption dài làm vỡ layout modal → giới hạn chiều cao, cho phép cuộn.
