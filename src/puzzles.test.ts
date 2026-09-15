import { describe, it, expect, beforeEach } from 'vitest';
import {
  tileRect,
  buildPuzzle,
  dailyPuzzles,
  puzzleSeed,
  PUZZLE_SPECS,
  loadProgress,
  markSolved,
  solvedIdsOf
} from './puzzles';
import { solvePuzzle, verifyPuzzle } from './puzzleSolver';
import { createPuzzleState, isBoardEmpty, reduce } from './game/engine';
import { BOARD_H, TOTAL_H } from './game/constants';
import { nextRng } from './game/bag';
import type { Board, Cell, PieceType } from './game/types';

/** 極簡 localStorage 替身:vitest 預設跑在 node,沒有 window。 */
function installStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear()
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: store };
  return store;
}

beforeEach(() => { installStorage(); });

function makeRng(seed: number) {
  let state = seed | 0;
  return {
    next() { const r = nextRng(state); state = r.state; return r.value; },
    int(n: number) { return Math.floor(this.next() * n) % Math.max(1, n); }
  };
}

function emptyBoard(width: number): Board {
  return Array.from({ length: TOTAL_H }, () => new Array<Cell>(width).fill(0));
}

describe('鋪滿長方形（殘局的地基）', () => {
  it.each([
    [2, 8],
    [3, 8],
    [2, 12],
    [4, 7]
  ])('%i×%i 能被俄羅斯方塊完整鋪滿，不重疊不漏格', (rows: number, cols: number) => {
    const tiles = tileRect(rows, cols, makeRng(12345 + rows * 100 + cols));
    expect(tiles).not.toBeNull();
    expect(tiles!.length).toBe((rows * cols) / 4);

    const seen = new Set<string>();
    for (const tile of tiles!) {
      expect(tile.cells.length).toBe(4);
      for (const [x, y] of tile.cells) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(cols);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(rows);
        const key = `${x},${y}`;
        expect(seen.has(key)).toBe(false);   // 不重疊
        seen.add(key);
      }
    }
    expect(seen.size).toBe(rows * cols);      // 不漏格
  });

  it('格數不是 4 的倍數就老實回 null（不硬生一題爛的）', () => {
    expect(tileRect(1, 7, makeRng(1))).toBeNull();
    expect(tileRect(3, 7, makeRng(1))).toBeNull();
  });
});

describe('出題', () => {
  it('每一階都生得出題，佇列長度＝挖掉的塊數', () => {
    for (const spec of PUZZLE_SPECS) {
      const puzzle = buildPuzzle(puzzleSeed('2026-09-16', 0), spec, 8);
      expect(puzzle).not.toBeNull();
      expect(puzzle!.queue.length).toBe(spec.holes);
      expect(puzzle!.rows).toBe(spec.rows);
    }
  });

  it('盤上剩下的格子數＝總格數 − 挖掉的（洞剛好放得下那幾顆）', () => {
    const spec = PUZZLE_SPECS[1];
    const puzzle = buildPuzzle(puzzleSeed('2026-09-16', 1), spec, 8)!;
    const filled = puzzle.board.flat().filter((c) => c !== 0).length;
    expect(filled).toBe(spec.rows * 8 - spec.holes * 4);
  });

  it('題目只佔盤面最底下那幾列（不會憑空浮在半空中）', () => {
    const spec = PUZZLE_SPECS[2];
    const puzzle = buildPuzzle(puzzleSeed('2026-09-16', 2), spec, 8)!;
    for (let y = 0; y < TOTAL_H - spec.rows; y++) {
      expect(puzzle.board[y].every((c) => c === 0)).toBe(true);
    }
  });

  it('決定性：同一顆種子永遠同一題（全世界同一題的命根）', () => {
    const a = buildPuzzle(999, PUZZLE_SPECS[1], 8)!;
    const b = buildPuzzle(999, PUZZLE_SPECS[1], 8)!;
    expect(a.id).toBe(b.id);
    expect(a.queue).toEqual(b.queue);
    expect(JSON.stringify(a.board)).toBe(JSON.stringify(b.board));
  });

  it('題目 id 是內容雜湊，不是流水號（重生題庫不會弄亂玩家進度）', () => {
    const a = buildPuzzle(1000, PUZZLE_SPECS[0], 8)!;
    const b = buildPuzzle(2000, PUZZLE_SPECS[0], 8)!;
    expect(a.id).toMatch(/^warmup-[0-9a-f]{6}$/);
    if (JSON.stringify(a.board) !== JSON.stringify(b.board) || a.queue.join('') !== b.queue.join('')) {
      expect(a.id).not.toBe(b.id);
    }
  });
});

describe('可解性（機器證，不是我覺得排得下）', () => {
  it('求解器找到的那條解，實跑一遍真的把盤面清乾淨', () => {
    const puzzle = buildPuzzle(puzzleSeed('2026-09-16', 1), PUZZLE_SPECS[1], 8)!;
    const solution = solvePuzzle(puzzle);
    expect(solution).not.toBeNull();
    expect(solution!.length).toBe(puzzle.queue.length);

    let state = createPuzzleState(puzzle.board, puzzle.queue, puzzle.boardWidth);
    for (const step of solution!) {
      const before = state;
      state = reduce(state, {
        type: 'placePiece',
        source: 'next',
        piece: step.type,
        rotation: step.rotation,
        x: step.x,
        y: step.y - (TOTAL_H - BOARD_H)
      }).state;
      expect(state).not.toBe(before);   // 每一步都真的被接受
    }
    expect(state.queue.length).toBe(0);
    expect(isBoardEmpty(state.board)).toBe(true);
  });

  it('★ 會咬的反例：放不進去的題必須被判成無解（壞掉的閘門比沒有閘門更毒）', () => {
    // 盤面底下一列只缺三格，卻給一顆四格的方塊 ⇒ 怎麼放都清不乾淨
    const board = emptyBoard(8);
    const bottom = TOTAL_H - 1;
    for (let x = 0; x < 5; x++) board[bottom][x] = 'I';
    const impossible = {
      id: 'x-000000',
      tier: 'warmup' as const,
      boardWidth: 8,
      board,
      queue: ['O'] as PieceType[],
      solution: [],
      rows: 1
    };
    expect(verifyPuzzle(impossible)).toBe(false);
  });

  it('★ 會咬的反例二：空盤沒有洞可填，也是無解', () => {
    const impossible = {
      id: 'x-000001',
      tier: 'warmup' as const,
      boardWidth: 8,
      board: emptyBoard(8),
      queue: ['T'] as PieceType[],
      solution: [],
      rows: 1
    };
    expect(verifyPuzzle(impossible)).toBe(false);
  });
});

describe('每日一組三題', () => {
  // 逐日掃是最貴的一項；抽 12 天，覆蓋跨月與跨年
  const days = [
    '2026-09-16', '2026-09-17', '2026-09-30', '2026-10-01',
    '2026-12-31', '2027-01-01', '2027-02-28', '2027-06-15',
    '2026-11-11', '2026-08-08', '2027-03-03', '2027-07-04'
  ];

  it.each(days)('%s 出得了三題，而且每一題都驗過可解', (day: string) => {
    const set = dailyPuzzles(day, 8, verifyPuzzle);
    expect(set.length).toBe(3);
    for (const puzzle of set) {
      expect(puzzle).not.toBeNull();
      expect(verifyPuzzle(puzzle!)).toBe(true);
    }
  });

  it('同一天同一欄數 → 同一組題（老師報號、全班同一題）', () => {
    const a = dailyPuzzles('2026-09-16', 8, verifyPuzzle);
    const b = dailyPuzzles('2026-09-16', 8, verifyPuzzle);
    expect(a.map((p) => p?.id)).toEqual(b.map((p) => p?.id));
  });

  it('不同天 → 不同組題（不然每天打開都一樣，沒有回訪的意義）', () => {
    const a = dailyPuzzles('2026-09-16', 8, verifyPuzzle);
    const b = dailyPuzzles('2026-09-17', 8, verifyPuzzle);
    expect(a.map((p) => p?.id)).not.toEqual(b.map((p) => p?.id));
  });

  it('7 欄與 12 欄也出得了題（欄數是玩家可選的）', () => {
    for (const width of [7, 12]) {
      const set = dailyPuzzles('2026-09-16', width, verifyPuzzle);
      for (const puzzle of set) {
        expect(puzzle).not.toBeNull();
        expect(puzzle!.boardWidth).toBe(width);
      }
    }
  });
});

describe('進度（本機、零上傳）', () => {
  it('記一題破關後讀得回來', () => {
    markSolved('2026-09-16', 'warmup-abc123', 3);
    const progress = loadProgress();
    expect(solvedIdsOf(progress, '2026-09-16').has('warmup-abc123')).toBe(true);
    expect(progress.solved['2026-09-16']['warmup-abc123']).toBe(3);
  });

  it('同一題再解一次只留比較少的步數', () => {
    markSolved('2026-09-16', 'p1', 8);
    markSolved('2026-09-16', 'p1', 5);
    markSolved('2026-09-16', 'p1', 9);
    expect(loadProgress().solved['2026-09-16']['p1']).toBe(5);
  });

  it('只留 60 天，不會無限長大', () => {
    for (let i = 0; i < 70; i++) {
      const day = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      markSolved(day, `p${i}`, 1);
    }
    expect(Object.keys(loadProgress().solved).length).toBeLessThanOrEqual(60);
  });

  it('壞掉的舊資料當作沒解過，不炸也不誤報已解', () => {
    window.localStorage.setItem('tetris.puzzles.v1', '{ not json');
    expect(loadProgress()).toEqual({ solved: {} });
    window.localStorage.setItem('tetris.puzzles.v1', JSON.stringify({ solved: 'nope' }));
    expect(loadProgress()).toEqual({ solved: {} });
    window.localStorage.setItem('tetris.puzzles.v1', JSON.stringify({ solved: { '2026-01-01': { a: 'x' } } }));
    expect(solvedIdsOf(loadProgress(), '2026-01-01').has('a')).toBe(false);
  });
});

describe('殘局不會污染一般對局', () => {
  it('殘局的佇列是有限的：放完就沒了，不會自己補牌', () => {
    const puzzle = buildPuzzle(puzzleSeed('2026-09-16', 0), PUZZLE_SPECS[0], 8)!;
    let state = createPuzzleState(puzzle.board, puzzle.queue, puzzle.boardWidth);
    expect(state.puzzle).toBe(true);
    expect(state.current).toBeNull();
    const solution = solvePuzzle(puzzle)!;
    for (const step of solution) {
      state = reduce(state, {
        type: 'placePiece',
        source: 'next',
        piece: step.type,
        rotation: step.rotation,
        x: step.x,
        y: step.y - (TOTAL_H - BOARD_H)
      }).state;
    }
    expect(state.queue.length).toBe(0);
  });

  it('殘局沒有會自己往下掉的方塊：tick 再久盤面也不動', () => {
    const puzzle = buildPuzzle(puzzleSeed('2026-09-16', 0), PUZZLE_SPECS[0], 8)!;
    const start = createPuzzleState(puzzle.board, puzzle.queue, puzzle.boardWidth);
    let state = start;
    for (let i = 0; i < 200; i++) state = reduce(state, { type: 'tick', dt: 16 }).state;
    expect(JSON.stringify(state.board)).toBe(JSON.stringify(start.board));
    expect(state.queue).toEqual(start.queue);
  });
});
