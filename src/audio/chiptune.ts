/** Tiny WebAudio chiptune engine. No audio files. */

export type Note = string | null; // 'C4', 'F#5', 'Bb3' or null (rest)
export type Step = [Note, number]; // [note, duration in beats]
export interface Song {
  bpm: number;
  wave: 'square' | 'triangle';
  melody: Step[];
  bass?: Step[];
  /** bass waveform, default 'triangle' */
  bassWave?: 'square' | 'triangle';
  /** quiet square arpeggio track */
  arp?: Step[];
}

const MUTE_KEY = 'bday-muted';
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  return ctx;
}

/** Call inside a user gesture (tap/click/keydown). */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') void c.resume();
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}

export function setMuted(b: boolean): void {
  muted = b;
  try {
    localStorage.setItem(MUTE_KEY, b ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(b ? 0 : 0.5, ctx.currentTime, 0.015);
  }
}

export function isMuted(): boolean {
  return muted;
}

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return 0;
  const [, letter = 'C', accidental = '', octave = '4'] = m;
  const n = (SEMI[letter] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + (Number(octave) + 1) * 12;
  return 440 * Math.pow(2, (n - 69) / 12);
}

/** One enveloped tone; returns the oscillator. */
function tone(
  c: AudioContext,
  type: OscillatorType,
  f0: number,
  start: number,
  dur: number,
  vol: number,
  f1?: number,
): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, start);
  if (f1) osc.frequency.exponentialRampToValueAtTime(f1, start + dur);
  const atk = Math.min(0.008, dur / 4);
  const rel = Math.min(0.03, dur / 3);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + atk);
  g.gain.setValueAtTime(vol, Math.max(start + atk, start + dur - rel));
  g.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// ---------- sequencer ----------
interface Track {
  steps: Step[];
  wave: OscillatorType;
  vol: number;
  idx: number;
  next: number; // audio time of next step
  base: number; // audio time this pass started
}

let timer: number | null = null;
let onEnd: (() => void) | null = null;

function clearTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/** Stop current music (resolves a pending playOnce). */
export function stop(): void {
  clearTimer();
  const cb = onEnd;
  onEnd = null;
  cb?.();
}

function run(song: Song, loop: boolean, done?: () => void): void {
  stop();
  const c = getCtx();
  if (!c) {
    done?.();
    return;
  }
  if (c.state !== 'running') void c.resume();
  onEnd = done ?? null;
  const spb = 60 / song.bpm;
  const t0 = c.currentTime + 0.06;
  const tracks: Track[] = [{ steps: song.melody, wave: song.wave, vol: 0.18, idx: 0, next: t0, base: t0 }];
  if (song.bass) tracks.push({ steps: song.bass, wave: song.bassWave ?? 'triangle', vol: 0.28, idx: 0, next: t0, base: t0 });
  if (song.arp) tracks.push({ steps: song.arp, wave: 'square', vol: 0.07, idx: 0, next: t0, base: t0 });
  let endTime = t0;
  for (const t of tracks) endTime = Math.max(endTime, t0 + t.steps.reduce((s, x) => s + x[1], 0) * spb);
  const loopLen = endTime - t0;
  const finished = tracks.map(() => false);

  const pump = (): void => {
    const now = ctx!.currentTime;
    tracks.forEach((t, ti) => {
      while (!finished[ti] && t.next < now + SCHEDULE_AHEAD) {
        const step = t.steps[t.idx];
        if (!step) {
          finished[ti] = true;
          break;
        }
        const [note, beats] = step;
        const dur = beats * spb;
        if (note) {
          const f = freq(note);
          if (f) tone(ctx!, t.wave, f, t.next, dur * 0.92, t.vol);
        }
        t.next += dur;
        t.idx++;
        if (t.idx >= t.steps.length) {
          if (loop) {
            // pad shorter tracks to the common loop length so tracks stay aligned
            t.idx = 0;
            t.base += loopLen;
            t.next = t.base;
          } else finished[ti] = true;
        }
      }
    });
    if (!loop && now >= endTime) {
      clearTimer();
      const cb = onEnd;
      onEnd = null;
      cb?.();
    }
  };
  pump();
  timer = window.setInterval(pump, LOOKAHEAD_MS);
}

export function playLoop(song: Song): void {
  run(song, true);
}

export function playOnce(song: Song): Promise<void> {
  return new Promise((resolve) => run(song, false, resolve));
}

// ---------- sfx ----------
function fx(fn: (c: AudioContext, t: number) => void): void {
  const c = getCtx();
  if (!c || muted) return;
  if (c.state !== 'running') void c.resume();
  fn(c, c.currentTime + 0.005);
}

export const sfx = {
  jump: () => fx((c, t) => tone(c, 'square', 300, t, 0.16, 0.15, 720)),
  candle: () =>
    fx((c, t) => {
      tone(c, 'square', 988, t, 0.07, 0.14);
      tone(c, 'square', 1319, t + 0.07, 0.2, 0.14);
    }),
  block: () =>
    fx((c, t) => {
      tone(c, 'square', 160, t, 0.09, 0.2, 90);
      tone(c, 'triangle', 330, t + 0.02, 0.1, 0.15);
    }),
  die: () =>
    fx((c, t) => {
      [494, 466, 440, 415].forEach((f, i) => tone(c, 'square', f, t + i * 0.1, 0.1, 0.15));
      tone(c, 'triangle', 392, t + 0.4, 0.45, 0.22, 98);
    }),
  checkpoint: () =>
    fx((c, t) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, 'square', f, t + i * 0.08, i === 3 ? 0.25 : 0.08, 0.13));
    }),
  spell: () =>
    fx((c, t) => {
      tone(c, 'square', 900, t, 0.12, 0.12, 1800);
      tone(c, 'triangle', 1350, t + 0.03, 0.12, 0.1, 2700);
    }),
  bossHit: () =>
    fx((c, t) => {
      tone(c, 'square', 220, t, 0.08, 0.2, 110);
      tone(c, 'square', 165, t + 0.06, 0.14, 0.17, 70);
    }),
  bossDefeat: () =>
    fx((c, t) => {
      [880, 784, 659, 523, 440, 330, 262].forEach((f, i) => tone(c, 'square', f, t + i * 0.09, 0.09, 0.14, f * 0.8));
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, 'triangle', f, t + 0.8 + i * 0.1, i === 4 ? 0.5 : 0.1, 0.18));
    }),
};

// ---------- songs ----------
export const HAPPY_BIRTHDAY: Song = {
  bpm: 130,
  wave: 'square',
  melody: [
    ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2], ['G4', 0.75], ['G4', 0.25],
    ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2], ['G4', 0.75], ['G4', 0.25],
    ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 1], ['F5', 0.75], ['F5', 0.25],
    ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3],
  ],
  bass: [
    // 3/4 oom-pah-pah, pickup bar is a 1-beat rest
    [null, 1],
    ['C3', 1], ['E3', 1], ['G3', 1],
    ['G2', 1], ['D3', 1], ['G3', 1],
    ['G2', 1], ['D3', 1], ['G3', 1],
    ['C3', 1], ['E3', 1], ['G3', 1],
    ['C3', 1], ['E3', 1], ['G3', 1],
    ['C3', 1], ['E3', 1], ['G3', 1],
    ['F2', 1], ['C3', 1], ['F3', 1],
    ['C3', 1], ['G3', 1], ['C3', 1],
  ],
};

// Helpers for the original songs below.
const bar = (...s: Step[]): Step[] => s;
const q = (n: Note): Step => [n, 1];
const e = (n: Note): Step => [n, 0.5];

// Original "enchanted castle" waltz: A minor, 3/4, 132 bpm, 16 bars.
// Triangle lead (celesta-ish) + quiet square arpeggio + triangle bass.
// Chords: Am Am F F | Dm E Am Am | C G Dm Am | F E Am Am
const WALTZ_LEAD: Step[] = [
  ...bar(['E5', 1.5], e('D5'), q('C5')),
  ...bar(['A4', 2], q('C5')),
  ...bar(['F5', 1.5], e('E5'), q('C5')),
  ...bar(['A4', 2], q(null)),
  ...bar(['D5', 1.5], e('C5'), q('A4')),
  ...bar(q('B4'), q('G#4'), q('B4')),
  ...bar(q('C5'), q('E5'), q('A5')),
  ...bar(['A5', 2], q('E5')),
  ...bar(['G5', 1.5], e('E5'), q('C5')),
  ...bar(q('B4'), q('D5'), q('G5')),
  ...bar(['F5', 1.5], e('E5'), q('D5')),
  ...bar(q('C5'), q('A4'), q('E5')),
  ...bar(['A5', 1.5], e('G5'), q('F5')),
  ...bar(q('E5'), q('D5'), q('B4')),
  ...bar(q('C5'), q('B4'), q('A4')),
  ...bar(['A4', 2], q(null)),
];
// per-bar chord: [bass root, arpeggio notes (6 eighths)]
const WALTZ_CHORDS: [string, string[]][] = [
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
  ['F2', ['F3', 'A3', 'C4', 'F4', 'C4', 'A3']],
  ['F2', ['F3', 'A3', 'C4', 'F4', 'C4', 'A3']],
  ['D3', ['D4', 'F4', 'A4', 'D5', 'A4', 'F4']],
  ['E3', ['E4', 'G#4', 'B4', 'E5', 'B4', 'G#4']],
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
  ['C3', ['C4', 'E4', 'G4', 'C5', 'G4', 'E4']],
  ['G2', ['G3', 'B3', 'D4', 'G4', 'D4', 'B3']],
  ['D3', ['D4', 'F4', 'A4', 'D5', 'A4', 'F4']],
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
  ['F2', ['F3', 'A3', 'C4', 'F4', 'C4', 'A3']],
  ['E3', ['E4', 'G#4', 'B4', 'E5', 'B4', 'G#4']],
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
  ['A2', ['A3', 'C4', 'E4', 'A4', 'E4', 'C4']],
];

export const BGM: Song = {
  bpm: 132,
  wave: 'triangle',
  melody: WALTZ_LEAD,
  bass: WALTZ_CHORDS.flatMap(([r]): Step[] => [[r, 1.5], [null, 1.5]]),
  arp: WALTZ_CHORDS.flatMap(([, a]): Step[] => a.map((n) => e(n))),
};

// Original boss theme: D minor, 4/4, 168 bpm, 8 bars. Driving eighth-note bass.
// Chords: Dm Dm Bb A | Dm Gm Bb A
const BOSS_BASS_ROOTS: [string, string][] = [
  ['D2', 'D3'], ['D2', 'D3'], ['Bb1', 'Bb2'], ['A1', 'A2'],
  ['D2', 'D3'], ['G2', 'G3'], ['Bb1', 'Bb2'], ['A1', 'A2'],
];

export const BOSS_BGM: Song = {
  bpm: 168,
  wave: 'square',
  melody: [
    ...bar(e('D5'), e('D5'), e('F5'), e('D5'), q('A5'), e('G5'), e('F5')),
    ...bar(e('D5'), e('E5'), e('F5'), e('E5'), ['D5', 2]),
    ...bar(e('Bb4'), e('D5'), e('F5'), e('D5'), q('Bb5'), e('A5'), e('F5')),
    ...bar(e('C#5'), e('E5'), e('A5'), e('E5'), q('A5'), q('G5')),
    ...bar(e('F5'), e('F5'), e('A5'), e('F5'), q('D6'), e('C6'), e('A5')),
    ...bar(e('G5'), e('Bb5'), e('D6'), e('Bb5'), q('G5'), q('F5')),
    ...bar(q('Bb5'), q('F5'), q('E5'), q('C#5')),
    ...bar(e('A4'), e('C#5'), e('E5'), e('G5'), q('A5'), q(null)),
  ],
  bass: BOSS_BASS_ROOTS.flatMap(([r, o]): Step[] => [e(r), e(r), e(o), e(r), e(r), e(r), e(o), e(r)]),
};
