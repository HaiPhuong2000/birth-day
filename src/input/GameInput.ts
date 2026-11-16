import Phaser from 'phaser';

export interface TouchState {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
}

/**
 * Single input source for gameplay. Keyboard is wired here; touch controls (phase 5)
 * only need to call `setTouch`. Call `poll()` once per frame before reading.
 */
export class GameInput {
  left = false;
  right = false;
  jumpHeld = false;
  /** True only on the frame the jump button went down. */
  jumpPressed = false;
  /** Wand button (J / X); `attackPressed` is true only on the frame it went down. */
  attackHeld = false;
  attackPressed = false;

  private readonly keys: Record<'left' | 'a' | 'right' | 'd' | 'space' | 'up' | 'w' | 'j' | 'x', Phaser.Input.Keyboard.Key>;
  private readonly touch: TouchState = { left: false, right: false, jump: false, attack: false };
  private prevJump = false;
  private prevAttack = false;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('Keyboard plugin unavailable');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT),
      a: kb.addKey(K.A),
      right: kb.addKey(K.RIGHT),
      d: kb.addKey(K.D),
      space: kb.addKey(K.SPACE),
      up: kb.addKey(K.UP),
      w: kb.addKey(K.W),
      j: kb.addKey(K.J),
      x: kb.addKey(K.X),
    };
  }

  setTouch(state: Partial<TouchState>): void {
    Object.assign(this.touch, state);
  }

  poll(): void {
    const k = this.keys;
    this.left = k.left.isDown || k.a.isDown || this.touch.left;
    this.right = k.right.isDown || k.d.isDown || this.touch.right;
    this.jumpHeld = k.space.isDown || k.up.isDown || k.w.isDown || this.touch.jump;
    this.jumpPressed = this.jumpHeld && !this.prevJump;
    this.prevJump = this.jumpHeld;
    this.attackHeld = k.j.isDown || k.x.isDown || this.touch.attack;
    this.attackPressed = this.attackHeld && !this.prevAttack;
    this.prevAttack = this.attackHeld;
  }
}
