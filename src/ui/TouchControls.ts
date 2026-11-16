import type { GameInput } from '../input/GameInput';
import { el } from './dom';
import { onTouchDetected } from './touchDevice';

type ButtonId = 'left' | 'right' | 'jump' | 'attack';

const LABELS: Record<ButtonId, [text: string, aria: string]> = {
  left: ['◀', 'Sang trái'],
  right: ['▶', 'Sang phải'],
  jump: ['▲', 'Nhảy'],
  attack: ['✦', 'Phóng bùa'],
};

/**
 * On-screen buttons (DOM). Each pointer is tracked on its own, so run + jump work together and
 * sliding a finger between buttons switches them. Releasing, cancelling, losing capture or sliding
 * off every button releases the key. Only built on touch devices; feeds `GameInput.setTouch`.
 */
class TouchControls {
  private root?: HTMLDivElement;
  private readonly buttons = new Map<ButtonId, HTMLElement>();
  /** pointerId -> button currently under that finger (null = none). */
  private readonly pointers = new Map<number, ButtonId | null>();
  private target: GameInput | null = null;
  private wanted = false;
  private attackEnabled = false;

  constructor() {
    onTouchDetected(() => this.build());
  }

  /** Show the controls and drive `input`. The attack button only appears in the boss arena. */
  show(input: GameInput, attack: boolean): void {
    this.target = input;
    this.wanted = true;
    this.attackEnabled = attack;
    this.render();
    this.push();
  }

  hide(): void {
    this.releaseAll();
    this.target = null;
    this.wanted = false;
    this.render();
  }

  releaseAll(): void {
    this.pointers.clear();
    this.refresh();
  }

  private build(): void {
    const root = el('div', 'touch');
    for (const id of Object.keys(LABELS) as ButtonId[]) {
      const [text, aria] = LABELS[id];
      const b = el('div', 'touch__btn', text);
      b.dataset.btn = id;
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', aria);
      this.buttons.set(id, b);
      root.append(b);
    }
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('pointerdown', (e) => {
      const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-btn]');
      if (!hit) return;
      e.preventDefault();
      hit.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, hit.dataset.btn as ButtonId);
      this.refresh();
    });
    root.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, this.buttonAt(e.clientX, e.clientY));
      this.refresh();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      root.addEventListener(type, (e) => {
        if (this.pointers.delete(e.pointerId)) this.refresh();
      });
    }
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => this.releaseAll());
    document.body.append(root);
    this.root = root;
    this.render();
  }

  private render(): void {
    if (!this.root) return;
    this.root.hidden = !this.wanted;
    const attack = this.buttons.get('attack');
    if (attack) attack.hidden = !this.attackEnabled;
  }

  private buttonAt(x: number, y: number): ButtonId | null {
    for (const [id, b] of this.buttons) {
      if (b.hidden) continue;
      const r = b.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }

  /** Recompute pressed state from the tracked pointers, update visuals and GameInput. */
  private refresh(): void {
    const down = new Set<ButtonId>(
      [...this.pointers.values()].filter((v): v is ButtonId => v !== null),
    );
    for (const [id, b] of this.buttons) b.classList.toggle('touch__btn--on', down.has(id));
    this.push(down);
  }

  private push(down?: Set<ButtonId>): void {
    const set = down ?? new Set([...this.pointers.values()].filter((v): v is ButtonId => v !== null));
    this.target?.setTouch({
      left: set.has('left'),
      right: set.has('right'),
      jump: set.has('jump'),
      attack: this.attackEnabled && set.has('attack'),
    });
  }
}

export const touchControls = new TouchControls();
