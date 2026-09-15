/**
 * 🧩 殘局 / 每日殘局(2026-09-16)。
 *
 * 給一個「差幾塊就填滿」的盤面與固定的幾顆方塊,把它清乾淨。
 * ★ 為什麼這一款做得出別人做不出的題:本作的招牌是**從托盤直接把方塊拖到盤上任一格**,
 *   所以「掛在突出物下面 / 塞進凹角」這種在一般俄羅斯方塊裡永遠到不了的洞,
 *   在這裡是可解的 —— 殘局固定跑 support(塞縫)規則,正是為了用上這個能力。
 *
 * 型別(daily-puzzle-kit 第一節):**D 型 = 生成 + 機器驗**。
 *   生成:把一塊 rows×cols 的長方形用俄羅斯方塊**完整鋪滿**(exact cover),
 *        再挖掉其中幾塊當題目 ⇒ 盤面天生有解(把挖掉的放回去就是答案)。
 *   驗證:**用遊戲本身的 reduce 實跑一遍**,不另寫一份簡化模擬
 *        (另寫一份的話,兩邊分岔的那天測試還是綠的)。
 *
 * ★ 三條鐵則(都吃過虧才寫下來的):
 *   1. 決定性:全程 mulberry32 + 日期種子,**絕不用 Math.random** —— 否則「今天大家同一題」不成立。
 *   2. 可解性要機器證,不可以靠「我覺得排得下」(daily-puzzle-kit §三:手擺棋局的直覺錯誤率實測七成)。
 *   3. 出題順序要讓每一步都放得下:照「最低的先放」排(bottom-first),
 *      被放的那塊底下一定已經有東西撐著。排完仍然要跑驗證器確認。
 */
import { BOARD_H, TOTAL_H, normalizeBoardWidth } from './game/constants';
import { SHAPES } from './game/pieces';
import { nextRng } from './game/bag';
import { seedFromString } from './daily';
import type { Board, Cell, PieceType, Rotation } from './game/types';

const ALL_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

/** 一塊已經放好的方塊(座標是「盤面座標」,y 已含隱藏緩衝列)。 */
export interface Placement {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
  cells: [number, number][];
}

export interface Puzzle {
  /** 題目 id：內容雜湊，不是流水號（daily-puzzle-kit §13.2）。 */
  id: string;
  /** 難度標籤。 */
  tier: 'warmup' | 'standard' | 'challenge';
  boardWidth: number;
  /** 起始盤面（已經是引擎吃得下的 Board）。 */
  board: Board;
  /** 要用的方塊，順序固定。 */
  queue: PieceType[];
  /** 一組已知解（驗證器實跑證明過的那一組）。 */
  solution: Placement[];
  /** 這題佔幾列（給文案用）。 */
  rows: number;
}

interface Rng {
  next(): number;
  int(n: number): number;
}

function makeRng(seed: number): Rng {
  let state = seed | 0;
  return {
    next() {
      const r = nextRng(state);
      state = r.state;
      return r.value;
    },
    int(n) {
      return Math.floor(this.next() * n) % Math.max(1, n);
    }
  };
}

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ───────────────────────────── 鋪滿長方形（exact cover）

interface Tile {
  type: PieceType;
  rotation: Rotation;
  /** 長方形內座標 [col, row]。 */
  cells: [number, number][];
}

/**
 * 把 rows×cols 的長方形用俄羅斯方塊完整鋪滿。
 * 作法:永遠先處理「掃描順序上第一個還空著的格子」——它一定要被某一塊蓋住,
 * 所以只需要枚舉「哪一塊的哪一個小格落在它身上」,搜尋樹不會爆炸。
 * 找不到解就回 null(例如 rows*cols 不是 4 的倍數)。
 */
export function tileRect(rows: number, cols: number, rng: Rng): Tile[] | null {
  if (rows <= 0 || cols <= 0 || (rows * cols) % 4 !== 0) return null;
  const grid: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const tiles: Tile[] = [];
  let nodes = 0;

  const firstEmpty = (): [number, number] | null => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) return [c, r];
      }
    }
    return null;
  };

  /**
   * ⚡ 剪枝:剩下的空白區塊,每一塊的格數都必須是 4 的倍數 —— 否則怎麼鋪都鋪不滿,
   * 現在就可以回頭,不必再往下搜幾千個節點。
   * ★ 這不是微調:沒有這一條時 12 欄 ×3 列實測要 **5.4 秒**才生得出一題
   *   (而且是隨機的——換顆種子可能 1ms、也可能更久),加上之後穩定在毫秒級。
   *   「測試貴到讓人跳過」比覆蓋率低更危險,所以這條剪枝是必要的,不是可有可無的最佳化。
   */
  const regionsOk = (): boolean => {
    const seen: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] || seen[r][c]) continue;
        let size = 0;
        const stack: [number, number][] = [[c, r]];
        seen[r][c] = true;
        while (stack.length > 0) {
          const [x, y] = stack.pop()!;
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
            if (grid[ny][nx] || seen[ny][nx]) continue;
            seen[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
        if (size % 4 !== 0) return false;
      }
    }
    return true;
  };

  const solve = (): boolean => {
    if (nodes++ > 200000) return false;
    const spot = firstEmpty();
    if (!spot) return true;
    const [tc, tr] = spot;

    const candidates: Tile[] = [];
    for (const type of ALL_TYPES) {
      for (const rotation of ROTATIONS) {
        const shape = SHAPES[type][rotation];
        for (const [ax, ay] of shape) {
          // 讓 shape 的 (ax,ay) 這一格落在目標格上
          const cells = shape.map(([sx, sy]) => [tc + sx - ax, tr + sy - ay] as [number, number]);
          let ok = true;
          for (const [x, y] of cells) {
            if (x < 0 || x >= cols || y < 0 || y >= rows || grid[y][x]) { ok = false; break; }
          }
          if (ok) candidates.push({ type, rotation, cells });
        }
      }
    }

    for (const tile of shuffled(candidates, rng)) {
      for (const [x, y] of tile.cells) grid[y][x] = true;
      if (regionsOk()) {
        tiles.push(tile);
        if (solve()) return true;
        tiles.pop();
      }
      for (const [x, y] of tile.cells) grid[y][x] = false;
    }
    return false;
  };

  return solve() ? tiles : null;
}

// ───────────────────────────── 生成一題

function emptyBoard(boardWidth: number): Board {
  return Array.from({ length: TOTAL_H }, () => new Array<Cell>(boardWidth).fill(0));
}

/** FNV-1a 取 6 位十六進位：題目 id 用內容雜湊，重生／補題都不會動到玩家進度。 */
function contentHash(boardWidth: number, board: Board, queue: PieceType[]): string {
  const key = `${boardWidth}|${queue.join('')}|${board.map((row) => row.map((c) => (c === 0 ? '.' : c)).join('')).join('/')}`;
  return seedFromString(key).toString(16).padStart(8, '0').slice(0, 6);
}

export interface PuzzleSpec {
  tier: Puzzle['tier'];
  /** 題目佔幾列。 */
  rows: number;
  /** 挖掉幾塊當題目（＝要放幾顆方塊）。 */
  holes: number;
}

/**
 * 題目要佔幾列 —— **不能直接用 spec.rows**。
 * 一塊 rows×cols 的長方形要能被四格的方塊鋪滿,`rows * cols` 必須是 4 的倍數;
 * 8 欄與 12 欄任何列數都可以,但 **7 欄**必須是 4 的倍數列
 * (2×7=14、3×7=21 都不是 ⇒ 舊版在 7 欄整組出不了題,測試當場咬出來)。
 * 作法:從 spec.rows 往上找第一個可行的列數,找不到(不該發生)就回 null 讓上層誠實放棄。
 */
export function rowsFor(width: number, baseRows: number): number | null {
  for (let rows = Math.max(1, baseRows); rows <= baseRows + 4; rows++) {
    if ((rows * width) % 4 === 0) return rows;
  }
  return null;
}

/** 階梯：暖身 → 標準 → 挑戰。一天一組三題（daily-puzzle-kit §十一）。 */
export const PUZZLE_SPECS: readonly PuzzleSpec[] = [
  { tier: 'warmup', rows: 2, holes: 3 },
  { tier: 'standard', rows: 3, holes: 4 },
  { tier: 'challenge', rows: 3, holes: 5 }
];

/**
 * 產一題。回 null 表示這顆種子生不出合格的題（呼叫端換種子重試）。
 * ⚠ 這裡**不做**可解性驗證 —— 驗證要用遊戲本身的 reduce，那是 verifyPuzzle 的事，
 *   分開才不會讓 puzzles.ts 反過來依賴 store／engine 的執行時序。
 */
export function buildPuzzle(seed: number, spec: PuzzleSpec, boardWidth: number): Puzzle | null {
  const width = normalizeBoardWidth(boardWidth);
  const rows = rowsFor(width, spec.rows);
  if (rows == null) return null;
  const rng = makeRng(seed);
  const tiles = tileRect(rows, width, rng);
  if (!tiles || tiles.length <= spec.holes) return null;

  // 挖掉哪幾塊 → 那幾塊就是玩家要放回去的方塊
  const picked = shuffled(tiles.map((_, i) => i), rng).slice(0, spec.holes);
  const pickedSet = new Set(picked);

  const top = TOTAL_H - rows;
  const toBoardCells = (tile: Tile): [number, number][] =>
    tile.cells.map(([x, y]) => [x, top + y] as [number, number]);

  const board = emptyBoard(width);
  tiles.forEach((tile, index) => {
    if (pickedSet.has(index)) return;
    for (const [x, y] of toBoardCells(tile)) board[y][x] = tile.type;
  });

  // ★ 出題順序＝「最低的先放」：被放的那塊底下一定已經有東西撐著，
  //   不然 support 規則會擋掉、題目就變成「明明看得出來卻放不進去」。
  const removed: Placement[] = picked
    .map((index) => {
      const tile = tiles[index];
      const cells = toBoardCells(tile);
      const shape = SHAPES[tile.type][tile.rotation];
      // 還原出引擎要的原點：cells[i] = origin + shape[i]
      const x = cells[0][0] - shape[0][0];
      const y = cells[0][1] - shape[0][1];
      return { type: tile.type, rotation: tile.rotation, x, y, cells };
    })
    .sort((a, b) => {
      const ay = Math.max(...a.cells.map(([, y]) => y));
      const by = Math.max(...b.cells.map(([, y]) => y));
      return by - ay;
    });

  const queue = removed.map((p) => p.type);
  return {
    id: `${spec.tier}-${contentHash(width, board, queue)}`,
    tier: spec.tier,
    boardWidth: width,
    board,
    queue,
    solution: removed,
    rows
  };
}

// ───────────────────────────── 每日一組三題

/** 這一題的種子：日期＋題序（種子揉進題序，玩家會跳著打，daily-puzzle-kit §七）。 */
export function puzzleSeed(day: string, index: number): number {
  return seedFromString(`dragtetris-puzzle:${day}#${index}`) & 0x7fffffff;
}

/**
 * 今天這一組題。
 * @param verify 可解性驗證器（由 store／測試注入，實跑遊戲引擎）。生不出來就換種子，
 *               最多試 `attempts` 次；全部失敗回 null（呼叫端要誠實顯示「今天出不了題」，
 *               **絕不可以發一題沒驗過的**）。
 */
export function dailyPuzzles(
  day: string,
  boardWidth: number,
  verify: (p: Puzzle) => boolean,
  attempts = 24
): (Puzzle | null)[] {
  return PUZZLE_SPECS.map((spec, index) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const puzzle = buildPuzzle(puzzleSeed(day, index) + attempt * 7919, spec, boardWidth);
      if (puzzle && verify(puzzle)) return puzzle;
    }
    return null;
  });
}

// ───────────────────────────── 進度（本機、零上傳）

const PROGRESS_KEY = 'tetris.puzzles.v1';
const KEEP_DAYS = 60;

export interface PuzzleProgress {
  /** { "YYYY-MM-DD": { 題目id: 用了幾步解開 } } */
  solved: Record<string, Record<string, number>>;
}

const EMPTY_PROGRESS: PuzzleProgress = { solved: {} };

export function loadProgress(): PuzzleProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { solved: {} };
    const parsed = JSON.parse(raw) as Partial<PuzzleProgress>;
    // 舊格式（或壞資料）一律寬鬆處理：當作沒解過，不炸、也不誤報「已解」
    if (!parsed || typeof parsed !== 'object' || typeof parsed.solved !== 'object' || !parsed.solved) {
      return { solved: {} };
    }
    const solved: PuzzleProgress['solved'] = {};
    for (const [day, entries] of Object.entries(parsed.solved)) {
      if (entries && typeof entries === 'object') {
        solved[day] = {};
        for (const [id, moves] of Object.entries(entries as Record<string, unknown>)) {
          const n = Number(moves);
          if (Number.isFinite(n) && n >= 0) solved[day][id] = Math.floor(n);
        }
      }
    }
    return { solved };
  } catch {
    return { solved: {} };
  }
}

/** 記一題破關。只留最近 60 天 —— 留到天荒地老只會佔空間，沒有任何畫面在讀它。 */
export function markSolved(day: string, puzzleId: string, moves: number): PuzzleProgress {
  const progress = loadProgress();
  const dayEntry = { ...(progress.solved[day] ?? {}) };
  const prev = dayEntry[puzzleId];
  dayEntry[puzzleId] = prev == null ? moves : Math.min(prev, moves);

  const solved = { ...progress.solved, [day]: dayEntry };
  const days = Object.keys(solved).sort().reverse().slice(0, KEEP_DAYS);
  const trimmed: PuzzleProgress['solved'] = {};
  for (const d of days) trimmed[d] = solved[d];

  const next: PuzzleProgress = { solved: trimmed };
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // 私密模式寫不進去：照玩，只是記不住。
  }
  return next;
}

export function solvedIdsOf(progress: PuzzleProgress, day: string): Set<string> {
  return new Set(Object.keys(progress.solved[day] ?? {}));
}

export { BOARD_H, TOTAL_H, EMPTY_PROGRESS };
