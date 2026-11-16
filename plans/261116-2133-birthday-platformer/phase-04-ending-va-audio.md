---
phase: 4
title: "Ending va audio"
status: done
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 4: Ending và audio

## Overview
Phòng bánh kem: thổi 23 nến → pháo hoa → lời chúc; nhạc 8-bit cho cả game.

## Requirements
- Functional:
  - Ending scene: bánh pixel có 23 ngọn lửa nến. Nút "Thổi nến 🎂": chạm/giữ để thổi tắt dần. Có thêm tuỳ chọn "Thổi vào mic": `getUserMedia` + `AnalyserNode`, vượt ngưỡng RMS thì tắt nến; bị từ chối quyền mic thì quay về cách chạm.
  - Nến tắt hết → particle pháo hoa → lời chúc (hiệu ứng gõ chữ, DOM overlay) → nút "Xem lại album" (lưới 23 ảnh) và "Chơi lại".
  - **Boss scene** (giữa Level và Ending): đấu trường Voldemort có checkpoint riêng ngay cửa vào. Người chơi bắn tia đũa phép "Expelliarmus" bằng J/X hoặc nút tấn công cảm ứng (có cooldown ngắn). Voldemort dịch chuyển giữa 3 điểm, bắn đạn xanh có báo hiệu trước (nhấp nháy ~0.6s), kèm kiểu thứ hai (toả tia hoặc gọi pixie). ~8 máu, tốc độ tăng khi dưới 50%. Chết thì hồi sinh ở checkpoint đấu trường và boss reset máu; không game over. Hạ boss → hiệu ứng tan biến → chuyển sang Ending.
  - Audio: nhạc nền chiptune lấy cảm hứng phép thuật (nhịp 3/4, giọng thứ) trong lúc chơi và `BOSS_BGM` căng thẳng, nhanh hơn trong đấu trường; sfx nhảy/nến/hộp/chết, phép (`spell`), trúng boss (`bossHit`), boss bị hạ (`bossDefeat`); ending phát giai điệu Happy Birthday 8-bit. Nhạc hoàn toàn tự soạn, không dùng Hedwig's Theme.
- Non-functional: nhạc tự tổng hợp bằng WebAudio (oscillator square/triangle) → không cần file nhạc, không dính bản quyền bản thu. Giai điệu "Happy Birthday to You" là public domain ở Mỹ từ 2016.

## Implementation Steps
1. `audio/chiptune.ts`: sequencer nhỏ dạng mảng [note, duration]; hàm `playLoop`, `playOnce`, `stop`.
2. Ending scene, cơ chế thổi nến (chạm và mic).
3. Pháo hoa bằng Phaser particles; overlay lời chúc.
4. Album grid + nút chơi lại.
5. Nút tắt/bật tiếng trên HUD.
6. Boss scene: nhạc `BOSS_BGM`, sfx `spell`, `bossHit`, `bossDefeat`; đổi nhạc khi vào/ra đấu trường.

## Success Criteria
- [ ] Trên iOS Safari có tiếng sau khi bấm "Vào" ở màn nhập ngày sinh.
- [x] Từ chối quyền mic thì vẫn thổi nến được bằng cách chạm.

## Risk Assessment
- Mic trên iOS cần HTTPS → Cloudflare Pages đã có sẵn HTTPS.
- Boss quá khó với người chơi casual → xem rủi ro ở `plan.md`; hằng số máu/tốc độ/độ dày đạn gom hết vào `config.ts` để chỉnh nhanh sau khi chơi thử.
