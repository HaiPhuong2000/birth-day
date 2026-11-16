---
title: "Birthday Platformer cho Trang"
status: in-progress
created: 2026-11-16
scope: project
blockedBy: []
blocks: []
---

# Birthday Platformer cho Trang

## Phases

| # | Phase | Status | Depends |
|---|-------|--------|---------|
| 1 | [Scaffold va asset pipeline](phase-01-scaffold-va-asset-pipeline.md) | done | — |
| 2 | [Core platformer](phase-02-core-platformer.md) | done | — |
| 3 | [Moc anh va noi dung](phase-03-moc-anh-va-noi-dung.md) | done | — |
| 4 | [Ending va audio](phase-04-ending-va-audio.md) | done | — |
| 5 | [Polish mobile va deploy](phase-05-polish-mobile-va-deploy.md) | in-progress (deploy chờ ảnh thật + `wrangler login`) | — |

## Mục tiêu
Web game platformer kiểu Mario theo phong cách phù thủy pixel lấy cảm hứng từ Hogwarts, một màn duy nhất, tặng sinh nhật lần thứ 23 của **Nguyễn Đức Phương Trang** (bạn thân). Người chơi đi qua các mốc ảnh theo thứ tự thời gian, nhặt đủ 23 cây nến (nến lơ lửng của Đại Sảnh Đường), đánh bại boss cuối Voldemort rồi đến chỗ bánh kem: thổi nến, xem pháo hoa và đọc lời chúc. Chủ đề xuyên suốt: "từ đứa trẻ ngơ ngác đến một người tuyệt vời".

## Các quyết định đã chốt (sau 2 vòng hỏi đáp)
| Chủ đề | Quyết định |
|---|---|
| Thiết bị | Cả mobile và desktop: nút cảm ứng và bàn phím; trên mobile yêu cầu xoay ngang |
| Độ khó | Có thể chết, hồi sinh ngay tại checkpoint gần nhất. Không giới hạn mạng, không có game over |
| Ảnh (23) | **Đúng 8** mốc lớn nằm trong khối "?" (dừng game, mở popup ảnh và caption); 15 ảnh còn lại treo như khung tranh dọc đường, không dừng game |
| Cấu trúc | 1 màn dài, đi theo thứ tự thời gian: Level → Boss → Ending (đích là bánh kem) |
| Ending | Bánh kem 23 nến (chạm để thổi, có thể thổi vào mic), pháo hoa, lời chúc, nhạc Happy Birthday 8-bit |
| Đồ hoạ | Pixel art phù thủy **tự vẽ gốc**, lấy cảm hứng từ Hogwarts về đêm. **Không dùng** logo, font, asset phim, sprite rip sẵn của bản quyền, và không dùng Hedwig's Theme. Tên nhân vật, địa danh, thần chú thì dùng được vì đây là quà riêng, phi thương mại. Kenney được thay bằng texture pixel sinh bằng code (procedural). Ánh xạ: nhân vật = mặt Trang trên thân áo chùng, khăn đỏ/vàng, cầm đũa phép; nến = nến lơ lửng của Đại Sảnh Đường; khối "?" = hộp rune phép thuật; khung ảnh = chân dung biết cử động trong khung vàng; quái = pixie xứ Cornwall và niffler; checkpoint = cờ hiệu nhà; parallax = bóng lâu đài; cửa = cửa Đại Sảnh Đường |
| Boss cuối | Sau cửa 23 nến là đấu trường **Voldemort** có checkpoint riêng. Người chơi bắn tia đũa phép "Expelliarmus" bằng J/X hoặc nút tấn công cảm ứng. Voldemort dịch chuyển giữa 3 điểm, bắn đạn xanh có báo hiệu trước, kèm kiểu thứ hai (toả tia hoặc gọi pixie). Khoảng 8 máu, nhanh hơn khi dưới 50%. Chết thì hồi sinh ở checkpoint đấu trường và boss reset, không game over. Hạ boss → phòng bánh kem (Ending) |
| Đăng nhập | Màn đầu tiên chỉ yêu cầu nhập ngày sinh của Trang. **Không có tác dụng bảo mật**: ảnh vẫn public với ai có link |
| Cơ chế phụ | Phải nhặt đủ 23 nến (= số tuổi) thì cửa Đại Sảnh Đường dẫn vào đấu trường Voldemort mới mở. Nếu thiếu: game chỉ ra cây nến còn thiếu và có nút dịch chuyển về gần đó |
| Deploy | Static site trên Cloudflare Pages, link khó đoán |
| Hạn | Được phép trễ 1–2 ngày so với 16/11 để làm kỹ |

## Stack
Vite + TypeScript + Phaser 3 (Arcade Physics). Map là JSON định dạng Tiled, sinh bằng `scripts/build-map.ts` từ các chunk tái sử dụng, nên không cần cài app Tiled. Ảnh được resize bằng script `sharp`. Không có backend.

## Phụ thuộc giữa các phase
Phase 1 → 2 → 3 → 4 → 5. Có thể làm song song phase 3 và 4 khi phase 2 đã xong.

## Rủi ro chính
- Ảnh gốc từ điện thoại thường 3–8MB/ảnh, 23 ảnh cộng lại hơn 100MB → bắt buộc nén về WebP khoảng 150KB/ảnh, lazy-load.
- iOS Safari không phát âm thanh trước khi có tương tác của người dùng → nút "Vào" ở màn nhập ngày sinh đóng vai trò cú chạm đầu tiên để mở khoá audio.
- Bỏ sót nến → người chơi bị kẹt ở cửa. Cách xử lý (chi tiết ở phase 3): HUD hiện x/23; thanh tiến trình đánh dấu nến còn thiếu; mũi tên chỉ hướng; nút "Dẫn đường" dịch chuyển về checkpoint gần đó.
- Ngày sinh không phải bí mật, nên màn nhập ngày sinh chỉ để tạo không khí; ảnh cá nhân vẫn public với ai có link → chỉ gửi link riêng, đặt `noindex`.
- Boss quá khó với người chơi casual → giữ boss dễ: ~8 máu, đạn có báo hiệu rõ trước khi bắn, chết thì hồi sinh ngay tại checkpoint đấu trường và boss reset, không game over; tinh chỉnh tốc độ/độ dày đạn bằng hằng số trong `config.ts`.
- Nguy cơ bản quyền do chủ đề Harry Potter: chỉ dùng pixel art tự sinh bằng code và nhạc tự viết; không dùng logo, font, asset phim, sprite rip sẵn, không dùng Hedwig's Theme. Tên nhân vật/địa danh/thần chú là OK vì đây là quà tặng riêng, phi thương mại → không đăng công khai, không bán.

## Việc của bạn (chỉ bạn làm được)
1. Đặt tên file ảnh theo thứ tự thời gian: `01-...jpg` đến `23-...jpg`, cho vào `content/photos/`.
2. Điền `content/content.json` (template ở phase 1): ngày sinh `birthday` (định dạng `YYYY-MM-DD`), caption, nhãn giai đoạn `label` cho từng ảnh ("Hồi bé", "Cấp 3", "Đại học"...; không cần năm chính xác), đánh dấu **đúng 8** ảnh là mốc lớn (`"milestone": true`), lời chúc cuối.
3. Ảnh mặt Trang chụp thẳng, rõ mặt: `content/face.jpg`.
