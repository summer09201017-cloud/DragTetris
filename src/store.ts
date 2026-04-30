import { create } from 'zustand';
import { createInitialState, reduce } from './game/engine';
import type { Action, GameEvent, GameState } from './game/types';
import { audio } from './audio/AudioManager';

interface Store {
  state: GameState;
  toast: string | null;
  dispatch: (a: Action) => void;
  tick: (dt: number) => void;
  setToast: (msg: string | null) => void;
}

function clearTextFor(e: Extract<GameEvent, { type: 'clear' }>): string | null {
  if (e.perfectClear) return 'PERFECT CLEAR!';
  if (e.tspin === 'full' && e.lines > 0) {
    return e.lines === 3 ? 'T-SPIN TRIPLE' : e.lines === 2 ? 'T-SPIN DOUBLE' : 'T-SPIN SINGLE';
  }
  if (e.tspin === 'mini' && e.lines > 0) return 'T-SPIN MINI';
  if (e.lines === 4) return 'TETRIS';
  if (e.combo >= 2) return `COMBO ×${e.combo}`;
  if (e.b2b) return 'BACK-TO-BACK';
  return null;
}

function handleEvents(events: GameEvent[], setToast: (m: string | null) => void) {
  for (const e of events) {
    switch (e.type) {
      case 'move':     audio.playSfx('move'); break;
      case 'rotate':   audio.playSfx('rotate'); break;
      case 'softdrop': audio.playSfx('softdrop'); break;
      case 'harddrop': audio.playSfx('harddrop'); break;
      case 'lock':     audio.playSfx('lock'); break;
      case 'hold':     audio.playSfx('hold'); break;
      case 'levelup':  audio.playSfx('levelup'); setToast(`LEVEL ${e.level}`); break;
      case 'gameover': audio.playSfx('gameover'); audio.stopBgm(); break;
      case 'clear': {
        if (e.perfectClear) audio.playSfx('pc');
        else if (e.tspin !== 'none') audio.playSfx('tspin');
        else if (e.lines === 4) audio.playSfx('tetris');
        else if (e.lines === 3) audio.playSfx('clear3');
        else if (e.lines === 2) audio.playSfx('clear2');
        else audio.playSfx('clear1');
        const msg = clearTextFor(e);
        if (msg) setToast(msg);
        break;
      }
    }
  }
}

export const useGame = create<Store>((set, get) => ({
  state: createInitialState(),
  toast: null,
  dispatch: (a) => {
    const { state: newState, events } = reduce(get().state, a);
    handleEvents(events, (m) => get().setToast(m));
    set({ state: newState });
  },
  tick: (dt) => {
    const { state: newState, events } = reduce(get().state, { type: 'tick', dt });
    if (events.length > 0) handleEvents(events, (m) => get().setToast(m));
    set({ state: newState });
  },
  setToast: (msg) => {
    set({ toast: msg });
    if (msg) {
      setTimeout(() => {
        if (get().toast === msg) set({ toast: null });
      }, 800);
    }
  }
}));
