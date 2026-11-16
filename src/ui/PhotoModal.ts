import { el, overlay } from './dom';

export interface PhotoView {
  src: string;
  label: string;
  caption: string;
  width: number;
  height: number;
}

/** DOM overlay showing one photo with its stage label and (scrollable) caption. */
export class PhotoModal {
  private readonly root = overlay();
  private readonly img = el('img');
  private readonly label = el('div', 'card__label');
  private readonly caption = el('p', 'card__caption');
  private readonly close = el('button', 'btn btn--close', '✕');
  private onClose?: () => void;

  constructor() {
    const card = el('div', 'card');
    this.close.type = 'button';
    this.close.setAttribute('aria-label', 'Đóng');
    this.img.alt = '';
    card.append(this.label, this.img, this.caption, this.close);
    this.root.append(card);

    this.close.addEventListener('click', () => this.hide());
    this.img.addEventListener('click', () => this.hide());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.hide();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(view: PhotoView, onClose: () => void): void {
    this.onClose = onClose;
    this.img.src = view.src;
    this.img.width = view.width;
    this.img.height = view.height;
    this.label.textContent = view.label;
    this.caption.textContent = view.caption;
    this.caption.scrollTop = 0;
    this.root.hidden = false;
    this.close.focus({ preventScroll: true });
    window.addEventListener('keydown', this.onKey, true);
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey, true);
    const cb = this.onClose;
    this.onClose = undefined;
    cb?.();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }
  };
}
