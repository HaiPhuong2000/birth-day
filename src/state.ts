/** Run-wide progress that must survive death/respawn (and, later, scene changes). */
export interface GameState {
  /** Indices (map order) of the candles collected so far. */
  candles: Set<number>;
  /** Zone index of the last activated checkpoint. */
  checkpoint: number;
  /** Set the first time the player touches the locked door; enables the guide arrow. */
  gateTouched: boolean;
}

export const gameState: GameState = {
  candles: new Set(),
  checkpoint: 0,
  gateTouched: false,
};

export function resetGameState(): void {
  gameState.candles.clear();
  gameState.checkpoint = 0;
  gameState.gateTouched = false;
}
