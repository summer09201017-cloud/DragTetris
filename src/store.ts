import { create } from 'zustand';
import { createInitialState, reduce } from './game/engine';
import { DEFAULT_BOARD_W, normalizeBoardWidth } from './game/constants';
import type { Action, GameEvent, GameMode, GameState } from './game/types';
import { audio } from './audio/AudioManager';
import { loadRecords, submitGame, type BeatenFlags, type RecordBook } from './records';

const BOARD_WIDTH_STORAGE_KEY = 'tetris.boardWidth';
const MODE_STORAGE_KEY = 'tetris.mode';

const MODES: readonly GameMode[] = ['gravity', 'support', 'creative'];

function loadMode(): GameMode {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY) as GameMode | null;
    return raw && MODES.includes(raw) ? raw : 'gravity';
  } catch {
    return 'gravity';
  }
}

function saveMode(mode: GameMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage can be unavailable in hardened browser modes.
  }
}

/**
 * 完賽打點(play-stats 第三層)。開啟與停留在 index.html 已經接了,
 * 這裡補的是 `-done` —— 沒有它,完賽率永遠是 0(只知道有人開、不知道有沒有人玩完)。
 * ⚠ 一局只送一發:gameover 會從三條路徑進來(spawn 卡住 / hold 兩種),
 *   靠 status 轉換去重,不是靠事件次數。
 */
let gameStartedAt = Date.now();

/** 重新開局時重置計時（算「這一局玩了多久」用）。 */
function markGameStart(): void {
  gameStartedAt = Date.now();
}

function pingDone(): void {
  try {
    const ping = (window as unknown as { psPing?: (k: string, t?: number) => void }).psPing;
    if (!ping) return;
    // Worker 只在 g 以 -done 結尾時收 t，且只收 3~1800 秒；
    // 超出範圍就不帶（帶了會被丟掉，還不如至少計一局）。
    const sec = Math.round((Date.now() - gameStartedAt) / 1000);
    ping('dragtetris-done', sec >= 3 && sec <= 1800 ? sec : undefined);
  } catch {
    // 打點永遠不可以弄壞遊戲。
  }
}

function loadBoardWidth(): number {
  try {
    const raw = window.localStorage.getItem(BOARD_WIDTH_STORAGE_KEY);
    return raw == null ? DEFAULT_BOARD_W : normalizeBoardWidth(Number(raw));
  } catch {
    return DEFAULT_BOARD_W;
  }
}

function saveBoardWidth(width: number): void {
  try {
    window.localStorage.setItem(BOARD_WIDTH_STORAGE_KEY, String(normalizeBoardWidth(width)));
  } catch {
    // localStorage can be unavailable in hardened browser modes.
  }
}

interface Store {
  state: GameState;
  toast: string | null;
  records: RecordBook;
  beaten: BeatenFlags | null;
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

/**
 * 一局剛結束的那一刻(playing/paused → gameover)做兩件事:記紀錄 + 送完賽打點。
 * ★ 用「狀態轉換」判斷而不是「收到幾個 gameover 事件」:engine 有三條路徑會產生
 *   gameover,而重複提交會把 games 局數灌水、也會重複打點。
 */
function afterTransition(
  before: GameState,
  after: GameState,
  set: (partial: Partial<Store>) => void
): void {
  if (before.status === 'gameover' || after.status !== 'gameover') return;
  const { book, beaten } = submitGame(after);
  pingDone();
  set({ records: book, beaten });
}

export const useGame = create<Store>((set, get) => ({
  state: createInitialState(loadBoardWidth(), undefined, loadMode()),
  toast: null,
  records: loadRecords(),
  beaten: null,
  dispatch: (a) => {
    const before = get().state;
    const { state: newState, events } = reduce(before, a);
    if (a.type === 'setBoardWidth') saveBoardWidth(newState.boardWidth);
    if (a.type === 'setMode') saveMode(newState.mode);
    if (a.type === 'restart' || a.type === 'setBoardWidth' || a.type === 'setMode') {
      set({ beaten: null });
      markGameStart();
    }
    handleEvents(events, (m) => get().setToast(m));
    set({ state: newState });
    afterTransition(before, newState, set);
  },
  tick: (dt) => {
    const before = get().state;
    const { state: newState, events } = reduce(before, { type: 'tick', dt });
    if (events.length > 0) handleEvents(events, (m) => get().setToast(m));
    set({ state: newState });
    afterTransition(before, newState, set);
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
