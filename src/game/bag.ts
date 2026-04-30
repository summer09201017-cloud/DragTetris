import type { PieceType } from './types';

const ALL: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Mulberry32 PRNG so the game is deterministic per seed.
export function nextRng(state: number): { value: number; state: number } {
  let s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

export function shuffleBag(seed: number): { bag: PieceType[]; state: number } {
  const arr = [...ALL];
  let state = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    const r = nextRng(state);
    state = r.state;
    const j = Math.floor(r.value * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { bag: arr, state };
}
