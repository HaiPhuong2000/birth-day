import Phaser from 'phaser';
import { hiRes } from '../util/hires';
import { unlockAudio } from '../audio/chiptune';
import { FRAME, GAME_HEIGHT, GAME_WIDTH, SCENES, TEX } from '../config';
import { getContent } from '../content/content';
import { resetGameState } from '../state';
import { el, overlay } from '../ui/dom';
import { matchBirthday } from '../util/matchBirthday';

const WRONG_MESSAGES = [
  'Hmm, chưa đúng rồi nè 🤔',
  'Ngày đặc biệt nhất trong năm cơ mà!',
  'Bạn quên sinh nhật của mình hả? 😆',
  'Gần rồi… chắc vậy. Thử lại nhé!',
];
const HINT_AFTER = 3;
const CONFETTI_TINTS = [0xff6b6b, 0xffd36a, 0x7dff7d, 0x6bc7ff, 0xff9de2, 0xffffff];

/** Cosmetic gate: type the birthday (dd/mm[/yyyy]) to enter. Not a security feature. */
export class LoginScene extends Phaser.Scene {
  private root!: HTMLDivElement;
  private card!: HTMLDivElement;
  private fails = 0;

  constructor() {
    super(SCENES.Login);
  }

  create(): void {
    hiRes(this);
    const content = getContent(this);
    this.fails = 0;

    const far = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEX.bgFar).setOrigin(0);
    const near = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEX.bgNear).setOrigin(0);
    this.tweens.addCounter({
      from: 0,
      to: GAME_WIDTH,
      duration: 240000,
      repeat: -1,
      onUpdate: (t) => {
        far.tilePositionX = Math.floor(t.getValue()! * 0.1);
        near.tilePositionX = Math.floor(t.getValue()! * 0.4);
      },
    });

    this.root = overlay('overlay--clear');
    this.root.hidden = false;
    this.card = el('div', 'card login-card');
    this.root.append(this.card);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.root.remove());
    this.showForm(content.birthday, content.loginHint, content.name);
  }

  private showForm(birthday: string, hint: string, name: string): void {
    const title = el('h2', 'card__title', 'Nhập ngày sinh để vào nhé');
    const form = el('form');
    form.noValidate = true;
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '10px';
    const input = el('input', 'login-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.placeholder = 'dd/mm/yyyy';
    input.maxLength = 12;
    input.setAttribute('aria-label', 'Ngày sinh');
    const msg = el('p', 'login-msg');
    const hintEl = el('p', 'login-hint');
    const submit = el('button', 'btn', 'Mở cửa');
    submit.type = 'submit';
    form.append(input, submit);
    this.card.replaceChildren(title, form, msg, hintEl);
    input.focus({ preventScroll: true });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      unlockAudio();
      if (matchBirthday(input.value, birthday)) {
        this.showSuccess(name);
        return;
      }
      msg.textContent = WRONG_MESSAGES[this.fails % WRONG_MESSAGES.length]!;
      this.fails += 1;
      if (this.fails >= HINT_AFTER) hintEl.textContent = `Gợi ý: ${hint}`;
      input.classList.remove('shake');
      void input.offsetWidth; // restart the animation
      input.classList.add('shake');
      input.select();
    });
  }

  private showSuccess(name: string): void {
    this.confetti();
    const title = el('h2', 'card__title', `Chào ${name}! 🎂`);
    const text = el('p', 'card__caption', 'Cánh cổng lâu đài đã mở. Chúc bạn một chuyến phiêu lưu thật vui!');
    const enter = el('button', 'btn', 'Vào');
    enter.type = 'button';
    enter.addEventListener('click', () => {
      unlockAudio();
      resetGameState();
      this.scene.start(SCENES.Level);
    });
    this.card.replaceChildren(title, text, enter);
    enter.focus({ preventScroll: true });
  }

  private confetti(): void {
    const emitter = this.add.particles(0, -8, TEX.projectiles, {
      frame: FRAME.bolt.spark,
      x: { min: 0, max: GAME_WIDTH },
      speedX: { min: -30, max: 30 },
      speedY: { min: 50, max: 130 },
      lifespan: 3200,
      scale: { start: 1.6, end: 0.8 },
      rotate: { min: 0, max: 360 },
      tint: CONFETTI_TINTS,
      frequency: 25,
    });
    emitter.setDepth(20);
  }
}
