import Phaser from 'phaser';

export const photoUrl = (file: string): string => `assets/photos/${file}`;
export const thumbUrl = (file: string): string => `assets/photos/thumb/${file}`;
export const photoKey = (file: string): string => `photo:${file}`;

/** Lazy-loads photo textures on demand (per zone / per block). */
export class PhotoLoader {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** Resolves once every file is a texture (or failed to load). */
  ensure(files: string[]): Promise<void> {
    return Promise.all(files.map((f) => this.one(f))).then(() => undefined);
  }

  private one(file: string): Promise<void> {
    const key = photoKey(file);
    if (this.scene.textures.exists(key)) return Promise.resolve();
    const hit = this.pending.get(key);
    if (hit) return hit;
    const p = new Promise<void>((resolve) => {
      const loader = this.scene.load;
      const done = (): void => {
        this.scene.textures.exists(key) && this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.pending.delete(key);
        resolve();
      };
      loader.once(`filecomplete-image-${key}`, done);
      loader.once(`loaderror`, done);
      loader.image(key, thumbUrl(file));
      if (!loader.isLoading()) loader.start();
    });
    this.pending.set(key, p);
    return p;
  }
}
