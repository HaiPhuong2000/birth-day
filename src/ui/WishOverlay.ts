/** DOM overlay that typewrites the birthday wish, then offers "album" / "replay". Styles: src/styles.css (.overlay/.card + .wish*). */

export interface WishOverlayOptions {
  title: string;
  wish: string;
  onAlbum: () => void;
  onReplay: () => void;
}

/** ms per tick and characters revealed per tick. */
const TICK_MS = 32;
const CHARS_PER_TICK = 1;

export class WishOverlay {
  private readonly root: HTMLDivElement;
  private readonly timer: number;

  constructor(opts: WishOverlayOptions) {
    const root = document.createElement('div');
    root.className = 'overlay wish';

    const card = document.createElement('div');
    card.className = 'card wish__card';

    const title = document.createElement('h2');
    title.className = 'card__title';
    title.textContent = opts.title;

    const scroll = document.createElement('div');
    scroll.className = 'wish__scroll';
    const text = document.createElement('p');
    text.className = 'wish__text';
    const node = document.createTextNode('');
    text.append(node);
    scroll.append(text);

    const hint = document.createElement('p');
    hint.className = 'wish__hint';
    hint.textContent = 'Chạm vào lời chúc để hiện hết';

    const actions = document.createElement('div');
    actions.className = 'card__row wish__actions';
    actions.hidden = true;
    const album = this.button('Xem lại album 📷', opts.onAlbum, false);
    const replay = this.button('Chơi lại 🔄', opts.onReplay, true);
    actions.append(album, replay);

    card.append(title, scroll, hint, actions);
    root.append(card);
    document.body.append(root);
    this.root = root;

    const chars = Array.from(opts.wish);
    let i = 0;
    const finish = (): void => {
      window.clearInterval(this.timer);
      node.data = opts.wish;
      hint.textContent = '';
      actions.hidden = false;
      scroll.scrollTop = 0;
      album.focus({ preventScroll: true });
    };
    this.timer = window.setInterval(() => {
      node.appendData(chars.slice(i, i + CHARS_PER_TICK).join(''));
      i += CHARS_PER_TICK;
      scroll.scrollTop = scroll.scrollHeight;
      if (i >= chars.length) finish();
    }, TICK_MS);
    scroll.addEventListener('click', () => {
      if (actions.hidden) finish();
    });
    if (chars.length === 0) finish();
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.root.remove();
  }

  private button(label: string, onClick: () => void, ghost: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ghost ? 'btn btn--ghost' : 'btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
}
