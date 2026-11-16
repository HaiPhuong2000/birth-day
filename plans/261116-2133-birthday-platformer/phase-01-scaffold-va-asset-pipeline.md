---
phase: 1
title: "Scaffold va asset pipeline"
status: done
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Scaffold và asset pipeline

## Overview
Dựng project Vite + Phaser, kèm pipeline đưa ảnh thật và nội dung (`content.json`) vào game.

## Requirements
- Functional: `npm run dev` mở được canvas Phaser; `npm run assets` sinh ra ảnh WebP đã nén và `public/content.json`.
- Non-functional: mỗi ảnh ≤ 200KB, cạnh dài ≤ 1280px; ảnh mặt 256×256 cắt hình vuông.

## Architecture
```
content/            # bạn sở hữu (không commit nếu repo public)
  photos/01-*.jpg … 23-*.jpg
  face.jpg
  content.json
scripts/build-assets.ts   # sharp: resize + webp + xoay theo EXIF, ghép content.json với danh sách file
scripts/build-map.ts      # ghép các chunk tái sử dụng thành map JSON định dạng Tiled (phase 2), không cần app Tiled
public/assets/
  photos/*.webp, face.webp, content.json
  # (không còn thư mục kenney: texture sinh bằng code lúc Boot)
src/
  main.ts  config.ts
  scenes/  Boot, Preload, Login, Level, Boss, Ending
  objects/ Player, Enemy, QuestionBlock, PhotoFrame, Candle, Checkpoint, Boss, Projectile
  ui/      PhotoModal (DOM overlay), TouchControls, Hud
  gfx/     procedural pixel textures
  audio/   chiptune.ts
```

Schema của `content.json`:
```json
{
  "name": "Phương Trang",
  "age": 23,
  "birthday": "2003-11-16",
  "loginHint": "Ngày đặc biệt nhất trong năm của bạn đó 🎂",
  "photos": [
    { "file": "01-be-xiu.jpg", "caption": "…", "label": "Hồi bé", "milestone": true }
  ],
  "wish": "Lời chúc dài…"
}
```

## Implementation Steps
1. `npm create vite@latest` (template vanilla-ts), cài `phaser`, `sharp`, `tsx`.
2. Viết `scripts/build-assets.ts`: đọc `content/photos` theo thứ tự tên file; kiểm tra file nào cũng có entry trong JSON; `.rotate()` (xoay theo EXIF) → resize 1280 → webp q75; xử lý ảnh mặt.
3. Sinh texture pixel bằng code (không tải asset ngoài): module `gfx/` vẽ lên canvas/`Graphics` rồi `generateTexture` trong Boot — thân áo chùng, đũa phép, nến lơ lửng, hộp rune, khung chân dung vàng, pixie/niffler, cờ hiệu, bóng lâu đài, cửa Đại Sảnh, Voldemort.
4. Boot/Preload scene có thanh loading.

## Success Criteria
- [x] `npm run assets` báo lỗi rõ ràng khi số file ảnh khác số entry trong JSON, khi số ảnh `milestone: true` khác 8, hoặc khi `birthday` sai định dạng.
- [x] Tổng dung lượng `public/assets/photos` < 5MB.

## Risk Assessment
- Ảnh HEIC từ iPhone: sharp chỉ đọc được nếu libvips có hỗ trợ HEIF → script phải báo lỗi rõ và hướng dẫn đổi sang JPG.
