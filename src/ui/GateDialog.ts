import { TOTAL_CANDLES } from '../config';
import { el, overlay } from './dom';

/** "Còn thiếu N cây nến nữa nè!" dialog shown when touching the locked door. */
export class GateDialog {
  private readonly root = overlay();
  private readonly title = el('h2', 'card__title');
  private onGuide?: () => void;
  private onClose?: () => void;

  constructor() {
    const card = el('div', 'card');
    const body = el('p', 'card__caption', `Hãy nhặt đủ ${TOTAL_CANDLES} cây nến để mở cánh cửa Đại Sảnh Đường.`);
    const row = el('div', 'card__row');
    const close = el('button', 'btn btn--ghost', 'Để mình tự tìm');
    const guide = el('button', 'btn', 'Dẫn đường');
    for (const b of [close, guide]) b.type = 'button';
    row.append(close, guide);
    card.append(this.title, body, row);
    this.root.append(card);
    close.addEventListener('click', () => this.finish(false));
    guide.addEventListener('click', () => this.finish(true));
    guide.dataset.role = 'guide';
  }

  show(missing: number, onGuide: () => void, onClose: () => void): void {
    this.title.textContent = `Còn thiếu ${missing} cây nến nữa nè! 🕯`;
    this.onGuide = onGuide;
    this.onClose = onClose;
    this.root.hidden = false;
    this.root.querySelector<HTMLButtonElement>('[data-role=guide]')?.focus({ preventScroll: true });
    window.addEventListener('keydown', this.onKey, true);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  private finish(guide: boolean): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey, true);
    const cb = guide ? this.onGuide : this.onClose;
    this.onGuide = this.onClose = undefined;
    cb?.();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.finish(false);
    }
  };
}
