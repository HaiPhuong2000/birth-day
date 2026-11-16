import Phaser from 'phaser';
import { hiRes } from '../util/hires';
import { GAME_HEIGHT, GAME_WIDTH, SCENES, TEX, TOTAL_CANDLES } from '../config';
import { resetGameState } from '../state';
import type { Content } from '../types/content';
import { HAPPY_BIRTHDAY, playOnce, stop as stopMusic } from '../audio/chiptune';
import { Album } from '../ui/Album';
import { WishOverlay } from '../ui/WishOverlay';

const FLAME_TEX = 'ending-flame';
const GLOW_TEX = 'ending-glow';
const SPARK_TEX = 'ending-spark';

const CAKE = { cx: GAME_WIDTH / 2, topY: 188, rx: 110, ry: 14, bodyH: 34 } as const;
/** Candles per row; the two rows sum to TOTAL_CANDLES. */
const ROWS = [
  { count: 11, baseY: 181, x0: 150, x1: 330 },
  { count: 12, baseY: 195, x0: 142, x1: 338 },
] as const;
const STICK_COLORS = [0xff6b8b, 0x6bc7ff, 0xffe066, 0x8be08b] as const;
const FIREWORK_COLORS = [0xff5c7a, 0xffd23f, 0x6ee7ff, 0x9dff7a, 0xc58bff, 0xffffff] as const;

/** Blow tuning. */
const TAP_BLOW = 2;
const HOLD_INTERVAL_MS = 140;
const MIC_INTERVAL_MS = 90;
const MIC_CALIBRATION_FRAMES = 30;
const MIC_MIN_THRESHOLD = 0.05;
const DIM_MAX = 0.55;

interface Flame {
  flame: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  tweens: Phaser.Tweens.Tween[];
}

type Phase = 'blowing' | 'finale' | 'wish';

/** Cake room: blow out 23 candles (tap/hold or mic) -> fireworks -> Happy Birthday -> wish -> album / replay. */
export class EndingScene extends Phaser.Scene {
  private content!: Content;
  private phase: Phase = 'blowing';
  private lit: Flame[] = [];
  private dim!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  private holding = false;
  private holdAcc = 0;

  private controls: HTMLDivElement | null = null;
  private msg: HTMLDivElement | null = null;
  private micButton: HTMLButtonElement | null = null;
  private mic: { stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> } | null = null;
  private micStarting = false;
  private micFrames = 0;
  private micBaseline = 0;
  private micThreshold = MIC_MIN_THRESHOLD;
  private micAcc = 0;

  private wish: WishOverlay | null = null;
  private album: Album | null = null;
  private alive = true;

  constructor() {
    super(SCENES.Ending);
  }

  create(): void {
    hiRes(this);
    this.content = this.cache.json.get('content') as Content;
    this.phase = 'blowing';
    this.lit = [];
    this.emitters = [];
    this.holding = false;
    this.holdAcc = 0;
    this.micFrames = this.micAcc = this.micBaseline = 0;
    this.micThreshold = MIC_MIN_THRESHOLD;
    this.alive = true;
    stopMusic();

    this.makeTextures();
    this.drawRoom();
    this.drawCake();
    this.dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05030f, 0).setOrigin(0).setDepth(1);
    this.lightCandles();
    this.title = this.add
      .text(GAME_WIDTH / 2, 22, `Thổi nến nào, ${this.content.name}!`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2d27a',
        stroke: '#1a1020',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.buildControls();
    this.bindKeys();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  update(_time: number, delta: number): void {
    if (this.phase !== 'blowing') return;
    if (this.holding) {
      this.holdAcc += delta;
      while (this.holdAcc >= HOLD_INTERVAL_MS) {
        this.holdAcc -= HOLD_INTERVAL_MS;
        this.blow(1);
      }
    }
    this.pollMic(delta);
  }

  // ---------- drawing ----------

  private makeTextures(): void {
    const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };
    make(FLAME_TEX, 5, 7, (g) => {
      g.fillStyle(0xff8a1f).fillRect(2, 0, 1, 1).fillRect(1, 1, 3, 2).fillRect(0, 3, 5, 3).fillRect(1, 6, 3, 1);
      g.fillStyle(0xffe27a).fillRect(1, 3, 3, 3);
      g.fillStyle(0xfffbe0).fillRect(2, 3, 1, 3);
    });
    make(GLOW_TEX, 24, 24, (g) => {
      g.fillStyle(0xffb040, 0.35).fillCircle(12, 12, 12);
      g.fillStyle(0xffd070, 0.45).fillCircle(12, 12, 7);
    });
    make(SPARK_TEX, 3, 3, (g) => {
      g.fillStyle(0xffffff).fillRect(0, 0, 3, 3);
    });
  }

  private drawRoom(): void {
    this.add.image(0, 0, TEX.bgFar).setOrigin(0).setDepth(0);
    this.add.image(0, 0, TEX.bgNear).setOrigin(0).setDepth(0);
    this.add.image(34, 0, TEX.banner, 1).setOrigin(0.5, 0).setDepth(2);
    this.add.image(GAME_WIDTH - 34, 0, TEX.banner, 1).setOrigin(0.5, 0).setDepth(2);

    // Floating candles of the Great Hall.
    const floaters = [70, 105, 150, 195, 285, 330, 375, 410];
    floaters.forEach((x, i) => {
      const y = 50 + ((i * 37) % 60);
      const c = this.add.sprite(x, y, TEX.candle, 0).setDepth(2);
      c.play('candle-flicker');
      this.tweens.add({ targets: c, y: y - 5, duration: 1400 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 170 });
    });

    // Long table with a cloth.
    this.add.rectangle(0, 226, GAME_WIDTH, GAME_HEIGHT - 226, 0x4a2a1c).setOrigin(0).setDepth(3);
    this.add.rectangle(0, 226, GAME_WIDTH, 5, 0x6b3f28).setOrigin(0).setDepth(3);
    this.add.rectangle(0, 242, GAME_WIDTH, GAME_HEIGHT - 242, 0x8a1c2b).setOrigin(0).setDepth(3);
    this.add.rectangle(0, 242, GAME_WIDTH, 3, 0xf2d27a).setOrigin(0).setDepth(3);
  }

  private drawCake(): void {
    const { cx, topY, rx, ry, bodyH } = CAKE;
    const g = this.add.graphics().setDepth(4);
    // plate
    g.fillStyle(0xd8d4e6).fillEllipse(cx, topY + bodyH + 2, rx * 2 + 24, 18);
    g.fillStyle(0xf4f1ff).fillEllipse(cx, topY + bodyH, rx * 2 + 24, 16);
    // body
    g.fillStyle(0xf4a6c0).fillRect(cx - rx, topY, rx * 2, bodyH);
    g.fillStyle(0xe27fa3).fillRect(cx - rx, topY + bodyH - 8, rx * 2, 8);
    g.fillStyle(0xe27fa3).fillEllipse(cx, topY + bodyH, rx * 2, ry * 2);
    g.fillStyle(0xf4a6c0).fillRect(cx - rx, topY, rx * 2, bodyH - 1);
    g.fillStyle(0xe27fa3).fillRect(cx - rx, topY + bodyH - 8, rx * 2, 8);
    g.fillStyle(0xe27fa3).fillEllipse(cx, topY + bodyH - 1, rx * 2, ry * 2 - 2);
    // frosting top + drips
    g.fillStyle(0xfff0e0).fillEllipse(cx, topY, rx * 2, ry * 2);
    for (let x = cx - rx + 8; x < cx + rx - 4; x += 14) {
      const h = 5 + ((x * 7) % 9);
      g.fillStyle(0xfff0e0).fillRect(x, topY + ry - 2, 6, h);
    }
    // berries along the front rim
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (i / 10);
      g.fillStyle(0xc0392b).fillRect(Math.round(cx - Math.cos(a) * (rx - 6)) - 2, Math.round(topY + Math.sin(a) * (ry - 3)) - 1, 4, 4);
    }
  }

  private lightCandles(): void {
    let index = 0;
    for (const row of ROWS) {
      for (let i = 0; i < row.count; i++) {
        const x = Math.round(row.x0 + ((row.x1 - row.x0) * i) / (row.count - 1));
        const color = STICK_COLORS[index % STICK_COLORS.length] ?? 0xffffff;
        index++;
        const stick = this.add.graphics().setDepth(5);
        stick.fillStyle(color).fillRect(x - 1, row.baseY - 11, 3, 11);
        stick.fillStyle(0xffffff, 0.5).fillRect(x - 1, row.baseY - 9, 1, 2).fillRect(x - 1, row.baseY - 5, 1, 2);
        stick.fillStyle(0x2a1a2a).fillRect(x, row.baseY - 12, 1, 1);

        const fy = row.baseY - 12;
        const glow = this.add.image(x, fy - 3, GLOW_TEX).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
        const flame = this.add.image(x, fy, FLAME_TEX).setOrigin(0.5, 1).setDepth(7);
        const d = 90 + ((index * 23) % 80);
        const tweens = [
          this.tweens.add({ targets: flame, scaleY: { from: 0.8, to: 1.25 }, scaleX: { from: 1, to: 0.8 }, duration: d, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: index * 17 }),
          this.tweens.add({ targets: glow, alpha: { from: 0.65, to: 1 }, scale: { from: 0.9, to: 1.15 }, duration: d * 1.4, yoyo: true, repeat: -1, delay: index * 11 }),
        ];
        this.lit.push({ flame, glow, tweens });
      }
    }
    if (this.lit.length !== TOTAL_CANDLES) console.warn(`Ending: ${this.lit.length} flames, expected ${TOTAL_CANDLES}`);
  }

  // ---------- blowing ----------

  /** Extinguish up to n random lit flames. */
  private blow(n: number): void {
    for (let k = 0; k < n && this.lit.length > 0; k++) {
      const i = Phaser.Math.Between(0, this.lit.length - 1);
      const f = this.lit.splice(i, 1)[0];
      if (f) this.extinguish(f);
    }
    this.dim.setFillStyle(0x05030f, DIM_MAX * (1 - this.lit.length / TOTAL_CANDLES));
    if (this.lit.length === 0 && this.phase === 'blowing') void this.finale();
  }

  private extinguish(f: Flame): void {
    for (const t of f.tweens) t.stop();
    this.tweens.add({ targets: [f.flame, f.glow], alpha: 0, duration: 160, onComplete: () => [f.flame, f.glow].forEach((o) => o.destroy()) });
    for (let i = 0; i < 3; i++) {
      const puff = this.add.circle(f.flame.x + Phaser.Math.Between(-1, 1), f.flame.y - 4, 1.5, 0xb8b4c8, 0.7).setDepth(8);
      this.tweens.add({
        targets: puff,
        y: puff.y - 14 - i * 5,
        x: puff.x + Phaser.Math.Between(-4, 4),
        scale: 2.2,
        alpha: 0,
        duration: 700 + i * 150,
        delay: i * 80,
        onComplete: () => puff.destroy(),
      });
    }
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-SPACE', (e: KeyboardEvent) => {
      if (e.repeat || this.phase !== 'blowing') return;
      this.startHold();
    });
    kb.on('keyup-SPACE', () => this.stopHold());
  }

  private startHold(): void {
    if (this.holding) return;
    this.holding = true;
    this.holdAcc = 0;
    this.blow(TAP_BLOW);
  }

  private stopHold(): void {
    this.holding = false;
  }

  // ---------- DOM controls ----------

  private buildControls(): void {
    const root = document.createElement('div');
    root.className = 'ending';
    const msg = document.createElement('div');
    msg.className = 'ending__msg';
    msg.textContent = 'Chạm hoặc giữ nút để thổi nến 🌬';
    const row = document.createElement('div');
    row.className = 'ending__row';

    const blowBtn = document.createElement('button');
    blowBtn.type = 'button';
    blowBtn.className = 'btn';
    blowBtn.textContent = 'Thổi nến 🎂';
    const release = (): void => this.stopHold();
    blowBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.phase === 'blowing') this.startHold();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) blowBtn.addEventListener(ev, release);
    blowBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    const micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'btn btn--ghost';
    micBtn.textContent = 'Thổi vào mic 🎤';
    micBtn.setAttribute('aria-pressed', 'false');
    micBtn.addEventListener('click', () => void this.toggleMic());

    row.append(blowBtn, micBtn);
    root.append(msg, row);
    document.body.append(root);
    this.controls = root;
    this.msg = msg;
    this.micButton = micBtn;
  }

  private setMessage(text: string): void {
    if (this.msg) this.msg.textContent = text;
  }

  // ---------- microphone ----------

  private async toggleMic(): Promise<void> {
    if (this.phase !== 'blowing' || this.micStarting) return;
    if (this.mic) {
      this.stopMic();
      this.setMessage('Đã tắt mic. Chạm hoặc giữ nút để thổi nến 🌬');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setMessage('Thiết bị này không dùng được mic, bạn chạm nút "Thổi nến" nhé 🙂');
      return;
    }
    this.micStarting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (!this.alive || this.phase !== 'blowing') {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const ctx = new window.AudioContext();
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      this.mic = { stream, ctx, analyser, buf: new Float32Array(analyser.fftSize) };
      this.micFrames = 0;
      this.micBaseline = 0;
      this.micAcc = 0;
      this.micButton?.setAttribute('aria-pressed', 'true');
      this.setMessage('Đang nghe... hãy thổi thật mạnh vào mic nhé 🌬');
    } catch {
      this.setMessage('Chưa bật được mic (có thể bạn đã từ chối quyền). Không sao, bạn cứ chạm nút "Thổi nến" nhé 🙂');
    } finally {
      this.micStarting = false;
    }
  }

  private pollMic(delta: number): void {
    const mic = this.mic;
    if (!mic) return;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    let sum = 0;
    for (const s of mic.buf) sum += s * s;
    const rms = Math.sqrt(sum / mic.buf.length);

    if (this.micFrames < MIC_CALIBRATION_FRAMES) {
      this.micBaseline += rms / MIC_CALIBRATION_FRAMES;
      this.micFrames++;
      if (this.micFrames === MIC_CALIBRATION_FRAMES) this.micThreshold = Math.max(MIC_MIN_THRESHOLD, this.micBaseline * 2.5 + 0.03);
      return;
    }
    if (rms < this.micThreshold) {
      this.micAcc = 0;
      return;
    }
    this.micAcc += delta;
    while (this.micAcc >= MIC_INTERVAL_MS) {
      this.micAcc -= MIC_INTERVAL_MS;
      this.blow(rms > this.micThreshold * 2 ? 2 : 1);
    }
  }

  private stopMic(): void {
    const mic = this.mic;
    this.mic = null;
    this.micButton?.setAttribute('aria-pressed', 'false');
    if (!mic) return;
    for (const t of mic.stream.getTracks()) t.stop();
    void mic.ctx.close();
  }

  // ---------- finale ----------

  private async finale(): Promise<void> {
    this.phase = 'finale';
    this.stopHold();
    this.stopMic();
    this.controls?.remove();
    this.controls = null;
    this.msg = null;
    this.micButton = null;

    this.tweens.add({ targets: this.dim, fillAlpha: 0, duration: 800 });
    this.title.setText(`Chúc mừng sinh nhật ${this.content.name}! 🎉`);
    this.makeEmitters();

    const volley = this.time.addEvent({ delay: 380, repeat: 6, callback: () => this.firework() });
    await this.wait(2600);
    if (!this.alive) return;
    volley.remove();

    // Fireworks continue gently while the song plays; tapping skips the song.
    const gentle = this.time.addEvent({ delay: 850, loop: true, callback: () => this.firework() });
    this.input.once('pointerdown', () => stopMusic());
    // A suspended AudioContext never advances its clock, so don't wait on playOnce alone.
    const songMs = (HAPPY_BIRTHDAY.melody.reduce((sum, [, beats]) => sum + beats, 0) * 60000) / HAPPY_BIRTHDAY.bpm;
    await Promise.race([playOnce(HAPPY_BIRTHDAY), this.wait(songMs + 1500)]);
    gentle.remove();
    if (!this.alive) return;
    this.showWish();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private makeEmitters(): void {
    this.emitters = FIREWORK_COLORS.map((tint) =>
      this.add
        .particles(0, 0, SPARK_TEX, {
          emitting: false,
          lifespan: { min: 700, max: 1300 },
          speed: { min: 45, max: 150 },
          angle: { min: 0, max: 360 },
          gravityY: 70,
          scale: { start: 1.4, end: 0 },
          alpha: { start: 1, end: 0 },
          tint,
          blendMode: Phaser.BlendModes.ADD,
        })
        .setDepth(20),
    );
  }

  private firework(): void {
    const emitter = Phaser.Utils.Array.GetRandom(this.emitters);
    if (!emitter) return;
    const x = Phaser.Math.Between(60, GAME_WIDTH - 60);
    const y = Phaser.Math.Between(40, 120);
    const rocket = this.add.rectangle(x, GAME_HEIGHT - 40, 2, 5, 0xfff3d0).setDepth(20);
    this.tweens.add({
      targets: rocket,
      y,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => {
        rocket.destroy();
        emitter.explode(Phaser.Math.Between(32, 48), x, y);
      },
    });
  }

  // ---------- wish / album / replay ----------

  private showWish(): void {
    this.phase = 'wish';
    this.wish = new WishOverlay({
      title: `Chúc mừng sinh nhật ${this.content.name}! 🎂`,
      wish: this.content.wish,
      onAlbum: () => this.openAlbum(),
      onReplay: () => this.replay(),
    });
  }

  private openAlbum(): void {
    if (this.album) return;
    this.album = new Album(this.content.photos, () => {
      this.album?.destroy();
      this.album = null;
    });
  }

  private replay(): void {
    resetGameState();
    this.scene.start(SCENES.Level);
  }

  private cleanup(): void {
    this.alive = false;
    this.stopHold();
    this.stopMic();
    this.controls?.remove();
    this.controls = null;
    this.wish?.destroy();
    this.wish = null;
    this.album?.destroy();
    this.album = null;
    this.input.keyboard?.off('keydown-SPACE');
    this.input.keyboard?.off('keyup-SPACE');
    stopMusic();
  }
}
