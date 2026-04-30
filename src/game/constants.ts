import type { PieceType } from './types';

export const BOARD_W = 10;
export const BOARD_H = 20;
// Hidden buffer rows above the visible board where pieces spawn.
export const BUFFER_H = 2;
export const TOTAL_H = BOARD_H + BUFFER_H;

export const COLORS: Record<PieceType | 'G', string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#22c55e',
  Z: '#ef4444',
  J: '#3b82f6',
  L: '#fb923c',
  G: '#3b4282' // ghost
};

// Lock delay (ms) and max move/rotate resets while on ground.
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;

// Soft drop multiplier vs gravity (Guideline: soft drop ≈ 20× faster).
export const SOFT_DROP_FACTOR = 20;

// DAS / ARR (ms)
export const DAS_MS = 150;
export const ARR_MS = 33;

// Guideline gravity: seconds per cell at given level.
export function gravitySecondsPerCell(level: number): number {
  const l = Math.max(1, level);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
}

export function linesPerLevel(level: number): number {
  return level * 10;
}
