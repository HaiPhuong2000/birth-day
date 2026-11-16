const listeners = new Set<() => void>();
let touchDetected = window.matchMedia('(pointer: coarse)').matches;

/** True on phones/tablets: coarse pointer, or after the first real touch event. */
export function isTouchDevice(): boolean {
  return touchDetected;
}

/** Calls `cb` now if touch is already detected, otherwise on the first touch. */
export function onTouchDetected(cb: () => void): void {
  if (touchDetected) cb();
  else listeners.add(cb);
}

window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType !== 'touch' || touchDetected) return;
    touchDetected = true;
    for (const cb of listeners) cb();
    listeners.clear();
  },
  { capture: true },
);
