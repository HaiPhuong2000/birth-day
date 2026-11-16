---
phase: 2
title: "Core platformer"
status: done
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Core platformer

## Overview
Phần chính của game: di chuyển, nhảy, quái, checkpoint/hồi sinh, camera, một màn dài sinh từ chunk bằng `scripts/build-map.ts` (JSON định dạng Tiled).

## Requirements
- Functional:
  - Nhân vật: mặt Trang (`face.webp` cắt tròn) trên thân áo chùng phù thủy, khăn đỏ/vàng, cầm đũa phép; texture tự sinh bằng code (container gồm body sprite + head image, lật theo hướng chạy).
  - Điều khiển: ←/→ hoặc A/D, Space/↑/W để nhảy; giữ nút nhảy lâu thì nhảy cao hơn; coyote time 100ms; jump buffer 100ms.
  - Quái là Cornish pixie và niffler pixel dễ thương đi tuần qua lại. Nhảy lên đầu để hạ, chạm ngang thì chết.
  - Chết (do quái hoặc rơi hố): fade, hồi sinh ở checkpoint gần nhất sau khoảng 0.6s. Không có mạng, không có game over.
  - Checkpoint: cờ hiệu nhà (đỏ/vàng), chạm vào là kích hoạt. Đặt sau mỗi mốc lớn.
- Non-functional: giữ 60fps trên điện thoại tầm trung; độ phân giải game 480×270, scale pixel-perfect (FIT).

## Architecture
- Map là JSON định dạng Tiled, sinh bằng `scripts/build-map.ts` từ các chunk tái sử dụng (không cần app Tiled): layer `ground` (có collision), các object layer `blocks`, `frames`, `candles`, `enemies`, `checkpoints`, `goal`. Gồm 12 "vùng", mỗi vùng ứng với một mốc lớn và có một checkpoint ở đầu vùng. Mỗi vùng được rút ngắn (phần thử thách dài 42 → 71 ô, tăng dần) để tổng độ dài màn không đổi so với bản 8 vùng.
- Độ khó tăng nhẹ theo vùng (thêm hố, thêm quái) để gợi cảm giác "lớn lên".

## Implementation Steps
1. Player bằng Arcade Physics, tinh chỉnh các hằng số trong `config.ts`.
2. Load map JSON (định dạng Tiled) do `scripts/build-map.ts` sinh, collision cho tile, camera follow có deadzone.
3. Enemy patrol, quay đầu khi chạm mép hoặc chạm tường.
4. Hệ thống checkpoint và respawn.
5. Parallax background 2 lớp: bầu trời đêm và bóng lâu đài.
6. Sinh texture nhân vật/quái bằng code (xem phase 1).

## Success Criteria
- [ ] Đi hết màn từ đầu đến cuối mất khoảng 4–6 phút với người chơi bình thường. (Chưa kiểm chứng: sau khi đổi sang 12 vùng, màn dài 1046 cột = 18.828px (trước đây 18.918px với 8 vùng, bot chạy 184s). Ước tính theo cùng tỷ lệ ~103px/s: ~183s chỉ riêng di chuyển, tức vẫn 4,5–6,5 phút với người thật; chưa có người chơi thử.)
- [x] Rơi hố thì hồi sinh đúng checkpoint, giữ nguyên số nến đã nhặt.

## Risk Assessment
- Viết chunk cho `scripts/build-map.ts` tốn thời gian → làm vùng 1 trước, các vùng sau tái sử dụng chunk.
