# Quà sinh nhật 23 tuổi 🎂

Game platformer pixel-art theo phong cách lâu đài phù thủy ban đêm (hình vẽ gốc, không dùng tài nguyên chính thức của bất kỳ bản quyền nào). Người chơi đi qua 12 vùng theo thứ tự thời gian (28 ảnh, 12 mốc lớn), nhặt đủ 23 cây nến, đánh bại boss rồi vào phòng bánh kem.

Công nghệ: Vite + TypeScript + Phaser 3. Không có backend.

## ⚠️ Về quyền riêng tư

- Ảnh được deploy lên một trang web **công khai**: **bất kỳ ai có link đều xem được ảnh** (kể cả bằng cách đoán đường dẫn `/assets/photos/...`).
- Màn nhập ngày sinh chỉ để tạo không khí, **không phải bảo mật**.
- Tên dự án Cloudflare Pages được sinh ngẫu nhiên để khó đoán. Chỉ gửi link riêng cho người nhận, đừng đăng công khai.
- Trang có `noindex` và `robots.txt` chặn công cụ tìm kiếm; chỉ các bot tạo thẻ xem trước link (Messenger, Zalo, Telegram…) được phép đọc trang. Ảnh xem trước (`og.png`) là bánh kem pixel, không chứa ảnh riêng tư.
- Thư mục `content/` và các file sinh ra từ nó (`public/assets/photos/`, `public/assets/face.webp`, `public/assets/content.json`) đã nằm trong `.gitignore`: đừng commit ảnh thật vào repo public.

## Chuẩn bị nội dung (việc của bạn)

Tạo thư mục `content/` ở gốc dự án:

```
content/
  content.json
  face.jpg            # ảnh mặt chụp thẳng, rõ mặt (sẽ cắt tròn làm đầu nhân vật)
  photos/
    01-be-xiu.jpg     # đặt tên theo thứ tự thời gian: 01 → 28
    02-....jpg
    ...
    28-....jpg
```

Quy tắc:

- Đúng **28 ảnh** (JPG/PNG/WebP). **Ảnh HEIC của iPhone chưa được hỗ trợ** — hãy đổi sang JPG trước (macOS: `sips -s format jpeg anh.heic --out anh.jpg`).
- `content.json` liệt kê **đúng 28 ảnh theo thứ tự tên file**, và có **đúng 12 ảnh** `"milestone": true` (mốc lớn, nằm trong hộp "?" và mở popup). Bạn chọn 12 mốc tuỳ ý (kể cả ảnh số 01 không phải mốc, hay các mốc liền nhau); 16 ảnh còn lại treo thành khung tranh dọc đường. Bản đồ tự sắp xếp lại theo lựa chọn của bạn mỗi lần chạy `npm run assets`. Số 23 chỉ còn là **tuổi/số nến** (nhặt đủ 23 cây nến), không liên quan đến số ảnh.
- `birthday` phải có dạng `YYYY-MM-DD`.

Mẫu `content.json` (xem thêm `content.example/content.json`):

```json
{
  "name": "Phương Trang",
  "age": 23,
  "birthday": "2003-11-16",
  "loginHint": "Ngày đặc biệt nhất trong năm của bạn đó 🎂",
  "photos": [
    { "file": "01-be-xiu.jpg", "caption": "Chú thích...", "label": "Hồi bé", "milestone": true },
    { "file": "02-....jpg", "caption": "...", "label": "Hồi bé", "milestone": false }
  ],
  "wish": "Lời chúc cuối game..."
}
```

Nếu chưa có `content/`, `npm run assets` dùng bộ ảnh giả trong `content.example/` và in cảnh báo lớn. Tạo lại ảnh giả bằng `npm run example:photos`.

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `npm install` | Cài thư viện (lần đầu) |
| `npm run assets` | Nén ảnh sang WebP, cắt mặt, ghi `public/assets/content.json` **và sinh lại bản đồ** theo 12 mốc đã chọn. Chạy lại mỗi khi đổi ảnh/`content.json`. |
| `npm run dev` | Chạy thử trên máy (http://localhost:5173) |
| `npm run build` | Kiểm tra kiểu + build ra `dist/` |
| `npm run typecheck` | Chỉ kiểm tra kiểu |
| `npm run art` | Sinh lại toàn bộ hình pixel (`public/assets/art/*.png`, `public/og.png`) |
| `npm run map` | Chỉ sinh lại bản đồ (cần đã chạy `npm run assets` ít nhất một lần) |
| `npm run deploy` | `assets` → `build` → đẩy `dist/` lên Cloudflare Pages |

Phím điều khiển: ←/→ hoặc A/D để chạy, Space/↑/W để nhảy (giữ lâu nhảy cao hơn), J hoặc X để phóng bùa khi đấu boss. Trên điện thoại có nút cảm ứng; xoay ngang màn hình để chơi.

Lối tắt khi dev (chỉ có ở `npm run dev`): `?scene=Level|Boss|Ending`, `?cp=N` (bắt đầu ở vùng N), `?candles=N` (có sẵn N nến), `?x=PX` (xuất hiện tại toạ độ x).

## Deploy lên Cloudflare Pages

Tên dự án (khó đoán, đã sinh sẵn): **`trang23-ff5df2c2`** → địa chỉ `https://trang23-ff5df2c2.pages.dev`.

Tên này nằm duy nhất ở `package.json` → `config.pagesProject`; script `deploy` và URL ảnh xem trước (`og:image`) đều đọc từ đó. Muốn đổi tên thì sửa ở đó.

Lần đầu:

```bash
npx wrangler login                       # đăng nhập Cloudflare
npx wrangler pages project create trang23-ff5df2c2 --production-branch main
```

Mỗi lần deploy (sau khi đã bỏ ảnh thật vào `content/`):

```bash
npm run deploy
```

Sau đó mở link, chơi thử từ đầu đến cuối và dán link vào Messenger để xem thẻ xem trước.

## Cấu trúc

- `scripts/build-assets.ts` — nén ảnh + ghép `content.json`
- `scripts/build-map.ts` — sinh bản đồ Tiled (`level.json`, `arena.json`) từ các "chunk": 12 vùng (mỗi vùng một mốc), khung tranh bố trí theo 12 mốc
- `scripts/build-art.ts` — vẽ toàn bộ pixel art và ảnh OG bằng code
- `src/scenes/` — Boot, Preload, Login, Level, Boss, Ending
- `src/config.ts` — mọi hằng số chỉnh độ khó (nhảy, quái, boss…) và **nơi duy nhất khai báo số lượng nội dung**: `TOTAL_PHOTOS` (28), `TOTAL_MILESTONES` (12), `TOTAL_FRAMES` (16, tự suy ra), `TOTAL_CANDLES` (23 = số tuổi). Script kiểm tra ảnh, script sinh bản đồ và game đều đọc từ đây
