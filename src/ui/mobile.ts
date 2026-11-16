import type Phaser from 'phaser';
import { SCENES } from '../config';
import { el } from './dom';
import { touchControls } from './TouchControls';
import { isTouchDevice, onTouchDetected } from './touchDevice';

const portrait = window.matchMedia('(orientation: portrait)');

/** Portrait "rotate your phone" overlay (pauses the game), fullscreen on first touch, pinch-zoom block. */
export function setupMobile(game: Phaser.Game): void {
  // iOS Safari ignores user-scalable=no; block its pinch gesture explicitly.
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const guard = el('div', 'overlay rotate');
  guard.hidden = true;
  guard.append(el('div', 'rotate__icon', '📱'), el('div', undefined, 'Xoay ngang điện thoại nhé 📱↻'));
  document.body.append(guard);

  let pausedByUs: string[] = [];
  const update = () => {
    const show = isTouchDevice() && portrait.matches;
    guard.hidden = !show;
    if (show && pausedByUs.length === 0) {
      touchControls.releaseAll();
      // Boot/Preload must keep running: pausing them would stall the loader hand-off.
      pausedByUs = game.scene
        .getScenes(true)
        .map((s) => s.scene.key)
        .filter((k) => k !== SCENES.Boot && k !== SCENES.Preload);
      for (const k of pausedByUs) game.scene.pause(k);
    } else if (!show && pausedByUs.length > 0) {
      for (const k of pausedByUs) game.scene.resume(k);
      pausedByUs = [];
    }
  };
  portrait.addEventListener('change', update);
  onTouchDetected(update);
  update();

  // Fullscreen on the first touch where supported (Android Chrome; iPhone Safari has no API and is skipped).
  const el0 = document.documentElement;
  if (typeof el0.requestFullscreen === 'function') {
    const once = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      window.removeEventListener('pointerup', once, true);
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      void el0
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => orientation.lock?.('landscape'))
        .catch(() => undefined);
    };
    window.addEventListener('pointerup', once, true);
  }
}
