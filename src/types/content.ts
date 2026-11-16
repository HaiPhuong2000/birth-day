/** Shape of public/assets/content.json (produced by scripts/build-assets.ts). */
export interface PhotoEntry {
  /** WebP file name inside public/assets/photos/. */
  file: string;
  caption: string;
  /** Short life-stage label ("Cấp 3"); may be empty. */
  label: string;
  milestone: boolean;
  width: number;
  height: number;
}

export interface Content {
  name: string;
  age: number;
  /** YYYY-MM-DD */
  birthday: string;
  loginHint: string;
  photos: PhotoEntry[];
  wish: string;
}

/** Shape of content.json as authored by the user (before the asset pipeline). */
export interface SourcePhotoEntry {
  /** File name inside content/photos/ (e.g. "01-be-xiu.jpg"). */
  file: string;
  caption: string;
  label?: string;
  milestone?: boolean;
}

export interface SourceContent {
  name: string;
  age: number;
  birthday: string;
  loginHint: string;
  photos: SourcePhotoEntry[];
  wish: string;
}
