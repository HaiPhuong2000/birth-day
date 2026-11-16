---
phase: 5
title: "Polish mobile va deploy"
status: in-progress
priority: P2
effort: "1.5h"
dependencies: [3, 4]
---

# Phase 5: Polish mobile và deploy

## Overview
Điều khiển cảm ứng, xử lý xoay màn hình, test trên máy thật, deploy Cloudflare Pages.

> **Trạng thái:** in-progress. Phần code (TouchControls, overlay xoay màn, noindex/robots, OG) đã xong; deploy chưa làm được vì còn chờ ảnh thật (`content/photos`, `face.jpg`, `content.json`) và `wrangler login`.

## Requirements
- Functional:
  - TouchControls: nút ◀ ▶ bên trái, nút nhảy và **nút tấn công (bắn Expelliarmus)** bên phải; hỗ trợ multi-touch (vừa chạy vừa nhảy vừa bắn); chỉ hiện khi thiết bị có cảm ứng. Nút tấn công chỉ cần hiện trong Boss scene.
  - Màn hình dọc → overlay "Xoay ngang điện thoại nhé 📱↻".
  - Chặn pinch-zoom/scroll khi chơi (`touch-action: none`), hỗ trợ safe-area cho tai thỏ.
- Non-functional: lần tải đầu < 3MB (ảnh lazy-load); có `noindex` meta và `robots.txt` chặn toàn bộ; ảnh OG xem trước khi dán link (dùng bánh kem pixel, **không** dùng ảnh riêng tư).

## Implementation Steps
1. TouchControls bằng DOM hoặc Phaser pointer, có 4 vùng chạm (◀, ▶, nhảy, tấn công).
2. Orientation overlay, fullscreen khi chạm lần đầu (Android).
3. Test trên iPhone Safari, Android Chrome, desktop Chrome và Safari.
4. `npm run build` → `wrangler pages deploy dist --project-name <ten-kho-doan>`.
5. Chơi thử từ đầu đến cuối trên link production.

## Success Criteria
- [ ] Chơi trọn vẹn trên điện thoại thật bằng cảm ứng, không bị kẹt.
- [ ] Dán link vào Messenger thấy preview đẹp, không lộ ảnh riêng tư.

## Risk Assessment
- Nút cảm ứng che mất gameplay → bố trí game 16:9 sao cho vùng nút nằm trên nền đất.
