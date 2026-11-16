import type { PhotoEntry } from '../types/content';

/** DOM photo album: grid of all photos; tap one for a large view with its caption. */

/** Styles: src/styles.css (.overlay/.btn + .album*). */
const PHOTO_DIR = 'assets/photos/';

export class Album {
  private readonly root: HTMLDivElement;
  private view: HTMLDivElement | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.view) this.closeView();
    else this.onClose();
  };

  constructor(
    photos: readonly PhotoEntry[],
    private readonly onClose: () => void,
  ) {
    const root = document.createElement('div');
    root.className = 'overlay album';

    const bar = document.createElement('div');
    bar.className = 'album__bar';
    const title = document.createElement('h2');
    title.className = 'card__title';
    title.textContent = `Album ${photos.length} khoảnh khắc`;
    bar.append(title, this.closeButton(onClose, 'Đóng album'));

    const grid = document.createElement('div');
    grid.className = 'album__grid';
    for (const photo of photos) grid.append(this.thumb(photo));

    root.append(bar, grid);
    document.body.append(root);
    this.root = root;
    document.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey);
    this.view?.remove();
    this.root.remove();
  }

  private closeButton(onClick: () => void, label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn album__close';
    b.textContent = '✕';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  private thumb(photo: PhotoEntry): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'album__thumb';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = photo.caption;
    img.src = PHOTO_DIR + photo.file;
    b.append(img);
    if (photo.label) {
      const label = document.createElement('span');
      label.textContent = photo.label;
      b.append(label);
    }
    b.addEventListener('click', () => this.openView(photo));
    return b;
  }

  private openView(photo: PhotoEntry): void {
    this.closeView();
    const view = document.createElement('div');
    view.className = 'overlay album__view';
    const img = document.createElement('img');
    img.alt = photo.caption;
    img.src = PHOTO_DIR + photo.file;
    const caption = document.createElement('div');
    caption.className = 'album__caption';
    if (photo.label) {
      const label = document.createElement('b');
      label.textContent = photo.label;
      caption.append(label);
    }
    caption.append(document.createTextNode(photo.caption));
    view.append(img, caption, this.closeButton(() => this.closeView(), 'Đóng ảnh'));
    view.addEventListener('click', (e) => {
      if (e.target === view) this.closeView();
    });
    document.body.append(view);
    this.view = view;
  }

  private closeView(): void {
    this.view?.remove();
    this.view = null;
  }
}
