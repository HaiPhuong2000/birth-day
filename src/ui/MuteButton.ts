import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { isMuted, setMuted, unlockAudio } from '../audio/chiptune';

/** Speaker toggle, top-right of the HUD. */
export class MuteButton {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(GAME_WIDTH - 6, 4, '', { fontFamily: 'sans-serif', fontSize: '14px' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setPadding(6, 4, 6, 4)
      .setInteractive({ useHandCursor: true });
    this.text.on('pointerdown', () => {
      unlockAudio();
      setMuted(!isMuted());
      this.refresh();
    });
    this.refresh();
  }

  private refresh(): void {
    this.text.setText(isMuted() ? '🔇' : '🔊');
  }
}
