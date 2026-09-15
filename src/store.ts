import { create } from 'zustand';
import { createInitialState, createPuzzleState, isBoardEmpty, reduce } from './game/engine';
import { DEFAULT_BOARD_W, normalizeBoardWidth } from './game/constants';
import type { Action, GameEvent, GameMode, GameState } from './game/types';
import { audio } from './audio/AudioManager';
import { loadRecords, submitGame, type BeatenFlags, type RecordBook } from './records';
import {
  challengeFromLocation,
  loadDaily,
  seedOf,
  submitDaily,
  todayKey,
  type Challenge,
  type DailyResult
} from './daily';
import {
  dailyPuzzles,
  loadProgress,
  markSolved,
  solvedIdsOf,
  PUZZLE_SPECS,
  type Puzzle
} from './puzzles';
import { verifyPuzzle } from './puzzleSolver';
import { loadSkinId, saveSkinId, setActiveSkin, skinLineText, SKINS, type SkinId } from './skins';

const BOARD_WIDTH_STORAGE_KEY = 'tetris.boardWidth';
const MODE_STORAGE_KEY = 'tetris.mode';

const MODES: readonly GameMode[] = ['gravity', 'support', 'creative'];

/**
 * ↩ 悔一步的次數上限(2026-09-16 使用者拍板的「極高 CP」之一)。
 * 為什麼是 3:再多就不是「手滑救一下」而是「把遊戲變成可以無限試錯」,
 * 張力整個消失;再少則救不到真正會讓孩子放棄的那一次。
 */
const UNDO_MAX = 3;

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

/**
 * 這一場的挑戰設定。`?daily` / `?seed=` 只在開頁時解析一次 ——
 * ★ 重開一局必須沿用同一顆種子,否則「全世界同一題」當場破功
 *   (使用者一按「再玩一局」就換了一副牌,而畫面還寫著同一個題號 = 說謊)。
 */
const challenge: Challenge = challengeFromLocation();
const challengeSeed = seedOf(challenge);

export type PuzzleStatus = 'off' | 'playing' | 'solved' | 'failed';

interface Store {
  state: GameState;
  toast: string | null;
  records: RecordBook;
  beaten: BeatenFlags | null;
  challenge: Challenge;
  daily: DailyResult | null;
  dailyBeaten: boolean;

  /** ↩ 悔一步。 */
  undoLeft: number;
  canUndo: boolean;
  /** 這一局用過悔一步嗎 —— 用過就不進紀錄(理由見 undo())。 */
  usedUndo: boolean;

  /** 🧩 殘局。 */
  puzzleStatus: PuzzleStatus;
  puzzleDay: string;
  puzzleSet: (Puzzle | null)[] | null;
  puzzleIndex: number;
  puzzleSolvedIds: string[];
  puzzleMoves: number;

  /** 🎨 皮膚。 */
  skin: SkinId;

  dispatch: (a: Action) => void;
  tick: (dt: number) => void;
  setToast: (msg: string | null) => void;
  undo: () => void;
  setSkin: (id: SkinId) => void;
  openPuzzles: () => void;
  startPuzzle: (index: number) => void;
  retryPuzzle: () => void;
  exitPuzzle: () => void;
}

/**
 * 消行文案。聖經皮換成經文(skins.ts 那幾句都用 cuv MCP 核對過),
 * 經典皮維持原本的英文術語。
 */
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

/** 依目前皮膚決定要顯示哪一句。 */
function resolveClearText(e: Extract<GameEvent, { type: 'clear' }>, skinId: SkinId): string | null {
  const skin = SKINS[skinId] ?? SKINS.classic;
  const kind = e.perfectClear
    ? 'pc'
    : e.tspin !== 'none' && e.lines > 0
      ? 'tspin'
      : e.lines === 4
        ? 'tetris'
        : e.lines === 3
          ? 'triple'
          : e.lines === 2
            ? 'double'
            : e.lines === 1
              ? 'single'
              : e.combo >= 2
                ? 'combo'
                : e.b2b
                  ? 'b2b'
                  : null;
  if (kind) {
    const line = skinLineText(skin, kind);
    if (line) return `${line.show}（${line.ref}）`;
  }
  return clearTextFor(e);
}

function handleEvents(events: GameEvent[], setToast: (m: string | null) => void, skinId: SkinId) {
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
        const msg = resolveClearText(e, skinId);
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
 * ★ 用過悔一步的那一局**不進紀錄**(但仍然打完賽點)——理由同 creative 沙盒不計分:
 *   規則不一樣,混在一起比沒有意義。
 */
function afterTransition(
  before: GameState,
  after: GameState,
  usedUndo: boolean,
  set: (partial: Partial<Store>) => void
): void {
  if (before.status === 'gameover' || after.status !== 'gameover') return;
  pingDone();
  if (usedUndo) return;

  const { book, beaten } = submitGame(after);
  set({ records: book, beaten });

  // 每日挑戰另記一筆「今天最好」——跟一般最高分分開,因為那是同一副牌的較量。
  if (challenge.kind === 'daily') {
    const { result, beaten: dailyBeaten } = submitDaily(challenge.day, after.score);
    set({ daily: result, dailyBeaten });
  }
}

const initialSkin = loadSkinId();
setActiveSkin(initialSkin);

export const useGame = create<Store>((set, get) => ({
  state: createInitialState(loadBoardWidth(), challengeSeed, loadMode()),
  toast: null,
  records: loadRecords(),
  beaten: null,
  challenge,
  daily: challenge.kind === 'daily' ? loadDaily(challenge.day) : null,
  dailyBeaten: false,

  undoLeft: UNDO_MAX,
  canUndo: false,
  usedUndo: false,

  puzzleStatus: 'off',
  puzzleDay: todayKey(),
  puzzleSet: null,
  puzzleIndex: 0,
  puzzleSolvedIds: [],
  puzzleMoves: 0,

  skin: initialSkin,

  dispatch: (a) => {
    const before = get().state;
    const { state: newState, events } = reduce(before, a);
    if (a.type === 'setBoardWidth') saveBoardWidth(newState.boardWidth);
    if (a.type === 'setMode') saveMode(newState.mode);
    if (a.type === 'restart' || a.type === 'setBoardWidth' || a.type === 'setMode') {
      set({ beaten: null, dailyBeaten: false, undoLeft: UNDO_MAX, usedUndo: false, puzzleStatus: 'off' });
      undoStack.length = 0;
      set({ canUndo: false });
      markGameStart();
    }
    handleEvents(events, (m) => get().setToast(m), get().skin);

    // ↩ 只有「方塊真的落定」才進悔棋堆:移動與旋轉沒有不可逆的後果,
    //    把它們也存起來只會讓三次悔棋被雞毛蒜皮的操作吃光。
    if (events.some((e) => e.type === 'lock')) {
      pushUndo(before);
      set({ canUndo: undoStack.length > 0 && get().undoLeft > 0 });
    }

    set({ state: newState });
    afterTransition(before, newState, get().usedUndo, set);

    // 🧩 殘局的結束判定:方塊用完了就看盤面乾不乾淨。
    if (newState.puzzle && get().puzzleStatus === 'playing') {
      const moves = get().puzzleMoves + (newState.queue.length < before.queue.length ? 1 : 0);
      set({ puzzleMoves: moves });
      if (newState.queue.length === 0) {
        const puzzle = get().puzzleSet?.[get().puzzleIndex] ?? null;
        if (isBoardEmpty(newState.board)) {
          if (puzzle) {
            const progress = markSolved(get().puzzleDay, puzzle.id, moves);
            set({ puzzleSolvedIds: [...solvedIdsOf(progress, get().puzzleDay)] });
          }
          set({ puzzleStatus: 'solved' });
          audio.playSfx('pc');
        } else {
          set({ puzzleStatus: 'failed' });
        }
      }
    }
  },

  tick: (dt) => {
    const before = get().state;
    const { state: newState, events } = reduce(before, { type: 'tick', dt });
    if (events.length > 0) {
      handleEvents(events, (m) => get().setToast(m), get().skin);
      if (events.some((e) => e.type === 'lock')) {
        pushUndo(before);
        set({ canUndo: undoStack.length > 0 && get().undoLeft > 0 });
      }
    }
    set({ state: newState });
    afterTransition(before, newState, get().usedUndo, set);
  },

  setToast: (msg) => {
    set({ toast: msg });
    if (msg) {
      setTimeout(() => {
        if (get().toast === msg) set({ toast: null });
      }, 1400);
    }
  },

  /**
   * ↩ 悔一步:把上一顆方塊落定「之前」的整個盤面還原回來。
   *
   * 做得起來的原因是 `reduce` 是純函式、GameState 不帶任何外部參考 ⇒
   * 存一份快照就等於存了整個世界(盤面、佇列、分數、亂數指標全都在裡面),
   * 還原時不會有「分數回去了但亂數沒回去」這種半套狀態。
   *
   * ⚠ **遊戲結束後不給悔**:那一刻已經寫進紀錄、也送出了完賽打點,
   *   讓它復活會讓「已玩局數」與「最高分」兩邊都對不上。
   *   而且俄羅斯方塊的結束是幾十步累積出來的,不是最後一步失手 ——
   *   悔一步真正救得到的場合本來就在對局中。
   */
  undo: () => {
    const { undoLeft, state } = get();
    if (undoLeft <= 0 || undoStack.length === 0) return;
    if (state.status === 'gameover') {
      get().setToast('遊戲已結束，不能悔棋');
      return;
    }
    const previous = undoStack.pop()!;
    audio.playSfx('hold');
    set({
      state: previous,
      undoLeft: undoLeft - 1,
      usedUndo: true,
      canUndo: undoStack.length > 0 && undoLeft - 1 > 0,
      toast: `↩ 悔一步（還剩 ${undoLeft - 1} 次）`
    });
    setTimeout(() => {
      if (get().toast?.startsWith('↩')) set({ toast: null });
    }, 1400);

    // 殘局裡悔一步之後當然還沒解完
    if (previous.puzzle) {
      set({ puzzleStatus: 'playing', puzzleMoves: Math.max(0, get().puzzleMoves - 1) });
    }
  },

  setSkin: (id) => {
    setActiveSkin(id);
    saveSkinId(id);
    set({ skin: id });
  },

  /** 算出今天這一組殘局(只算一次;要驗可解性,約數十毫秒)。 */
  openPuzzles: () => {
    if (get().puzzleSet) return;
    const day = todayKey();
    const set3 = dailyPuzzles(day, get().state.boardWidth, verifyPuzzle);
    const progress = loadProgress();
    set({
      puzzleSet: set3,
      puzzleDay: day,
      puzzleSolvedIds: [...solvedIdsOf(progress, day)]
    });
  },

  startPuzzle: (index) => {
    get().openPuzzles();
    const puzzle = get().puzzleSet?.[index] ?? null;
    if (!puzzle) return;
    undoStack.length = 0;
    set({
      state: createPuzzleState(puzzle.board, puzzle.queue, puzzle.boardWidth),
      puzzleIndex: index,
      puzzleStatus: 'playing',
      puzzleMoves: 0,
      undoLeft: UNDO_MAX,
      usedUndo: false,
      canUndo: false,
      beaten: null,
      toast: null
    });
    markGameStart();
  },

  retryPuzzle: () => {
    get().startPuzzle(get().puzzleIndex);
  },

  exitPuzzle: () => {
    undoStack.length = 0;
    set({
      puzzleStatus: 'off',
      state: createInitialState(get().state.boardWidth, challengeSeed, loadMode()),
      undoLeft: UNDO_MAX,
      usedUndo: false,
      canUndo: false,
      beaten: null
    });
    markGameStart();
  }
}));

/**
 * 🔬 驗收用的唯讀視窗。
 * 這是一款 canvas 遊戲 —— 盤面不在 DOM 裡,Playwright 只能看到一張圖片,
 * 沒有這個就只能靠「截圖比對」去猜(canvas-playwright-verify 那支 skill 的老問題)。
 * 只給 getter,外面改不了狀態;內容是盤面與分數,沒有任何個資。
 */
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, '__state', {
      get: () => useGame.getState().state,
      configurable: true
    });
  } catch {
    // 有些環境不給改 window 的屬性:驗收腳本會退回截圖比對,遊戲不受影響。
  }
}

/**
 * 悔棋快照堆。放在 store 外面是刻意的:它不該進 React 的 re-render 路徑
 * (每一顆方塊落定都推一份完整盤面,放進 state 會讓整棵樹每次都以為資料換了)。
 * 只保留最近 UNDO_MAX 份 —— 更早的悔不到,留著只是佔記憶體。
 */
const undoStack: GameState[] = [];

function pushUndo(snapshot: GameState): void {
  undoStack.push(snapshot);
  while (undoStack.length > UNDO_MAX) undoStack.shift();
}

export { UNDO_MAX, PUZZLE_SPECS };
