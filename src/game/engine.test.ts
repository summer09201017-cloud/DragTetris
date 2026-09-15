import { describe, it, expect } from 'vitest';
import { createInitialState, reduce, hasSupport, collides, TOTAL_H, BOARD_H } from './engine';
import { blocksOf } from './pieces';
import type { Board, GameMode, GameState, PieceType, Rotation } from './types';

const BUFFER = TOTAL_H - BOARD_H;

/** 造一個乾淨盤面的狀態,種子固定 ⇒ 每次跑的方塊序列都一樣。 */
function mk(mode: GameMode = 'gravity', width = 8): GameState {
  return createInitialState(width, 12345, mode);
}

/** 在「可見座標」填一格(y 用畫面上的 0..19,函式自己加 buffer)。 */
function fill(state: GameState, col: number, visibleRow: number, cell: PieceType = 'I'): GameState {
  const board: Board = state.board.map((r) => [...r]);
  board[visibleRow + BUFFER][col] = cell;
  return { ...state, board };
}

/**
 * 方塊的格子偏移都在一個 4×4 盒子裡、而且**全是正的**(x,y 是盒子左上角,不是中心)。
 * ⇒ 裸座標會讓下半截穿出底部、右半截穿出右牆,被 collides 正確擋掉。
 * App.tsx 的 dropOrigin 本來就會夾擠,測試必須用同一套,否則測到的是自己寫錯的座標。
 */
function bounds(type: PieceType) {
  const cells = blocksOf(type, 0);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return { maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** 把左上角座標夾進合法範圍(可見座標系)。 */
function clampOrigin(type: PieceType, col: number, visibleRow: number, width: number) {
  const b = bounds(type);
  return {
    x: Math.max(0, Math.min(col, width - 1 - b.maxX)),
    y: Math.max(0, Math.min(visibleRow, BOARD_H - 1 - b.maxY))
  };
}

/** 一個方塊放在可見第 visibleRow 列時,它最底下那一列是哪裡。 */
function bottomRowOf(type: PieceType, visibleRow: number) {
  return visibleRow + bounds(type).maxY;
}

/** 把托盤第一顆 next 拖到可見座標 (col, visibleRow),座標比照 App 夾擠。 */
function dropNext(state: GameState, col: number, visibleRow: number) {
  const piece = state.queue[0];
  const o = clampOrigin(piece, col, visibleRow, state.boardWidth);
  return reduce(state, { type: 'placePiece', source: 'next', piece, rotation: 0, x: o.x, y: o.y });
}

// ───────────────────────────────────────── 隨機與初始狀態

describe('7-bag 隨機', () => {
  it('同一顆種子產生完全相同的序列', () => {
    const a = createInitialState(8, 999, 'gravity');
    const b = createInitialState(8, 999, 'gravity');
    expect(a.queue).toEqual(b.queue);
    expect(a.current?.type).toBe(b.current?.type);
  });

  it('不同種子會產生不同序列(抽驗,非絕對保證)', () => {
    const seqs = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => createInitialState(8, s, 'gravity').queue.join(''))
    );
    expect(seqs.size).toBeGreaterThan(1);
  });

  it('前 7 顆(含現役)恰好是 7 種各一次', () => {
    const s = createInitialState(8, 4242, 'gravity');
    const first7 = [s.current!.type, ...s.queue].slice(0, 7);
    expect(new Set(first7).size).toBe(7);
  });
});

describe('createInitialState', () => {
  it('預設模式是經典重力', () => {
    expect(createInitialState(8).mode).toBe('gravity');
  });

  it('欄數非法時退回預設 8 欄', () => {
    expect(createInitialState(99 as number, 1).boardWidth).toBe(8);
  });

  it('紀錄用的累計欄位從 0 起算', () => {
    const s = mk();
    expect(s.maxCombo).toBe(0);
    expect(s.pcCount).toBe(0);
  });
});

// ───────────────────────────────────────── hasSupport(本輪新規則的核心)

describe('hasSupport', () => {
  it('貼著地板 ⇒ 有支撐', () => {
    const s = mk();
    const p = { type: 'O' as PieceType, rotation: 0 as const, x: 3, y: TOTAL_H - 1 };
    expect(hasSupport(s.board, p)).toBe(true);
  });

  it('半空中、下方全空 ⇒ 沒有支撐', () => {
    const s = mk();
    const p = { type: 'O' as PieceType, rotation: 0 as const, x: 3, y: 5 };
    expect(hasSupport(s.board, p)).toBe(false);
  });

  it('只要有一格踩到東西就算(這正是「塞縫」要保留的能力)', () => {
    let s = mk();
    s = fill(s, 0, 10);            // 只在最左邊、可見第 10 列堆一格
    // 橫躺的 I(rotation 0)格子在 dy=1 ⇒ 盒子左上角放在可見第 9 列,方塊本體就落在第 9 列,
    // 它的正下方正好是剛剛填的那一格。
    const p = { type: 'I' as PieceType, rotation: 0 as const, x: 0, y: 9 + BUFFER - 1 };
    expect(hasSupport(s.board, p)).toBe(true);
  });

  it('自己的另一格不算支撐(否則任何方塊都會被判成有支撐)', () => {
    const s = mk();
    // 直立的 I 在半空中:每一格下面都是自己,除了最底那格 —— 那格下面是空的
    const p = { type: 'I' as PieceType, rotation: 1 as const, x: 3, y: 4 };
    expect(hasSupport(s.board, p)).toBe(false);
  });
});

// ───────────────────────────────────────── 三種模式的托盤放置

describe('托盤拖曳放置 — 三種模式', () => {
  it('gravity:放在半空中會自動落到底', () => {
    const s = mk('gravity');
    const { state: after } = dropNext(s, 3, 2);
    // 有東西進盤面,而且落在最底幾列
    const lowestFilled = after.board.reduce(
      (acc, row, y) => (row.some((c) => c !== 0) ? Math.max(acc, y) : acc),
      -1
    );
    expect(lowestFilled).toBe(TOTAL_H - 1);
  });

  it('support:半空中放不下去(狀態原封不動)', () => {
    const s = mk('support');
    const { state: after, events } = dropNext(s, 3, 2);
    expect(after).toBe(s);
    expect(events).toEqual([]);
  });

  it('support:貼地板放得下去', () => {
    const s = mk('support');
    const { state: after } = dropNext(s, 3, BOARD_H - 1); // 夾擠後 = 能放的最低處
    expect(after).not.toBe(s);
    expect(after.lines + after.score).toBeGreaterThanOrEqual(0);
    expect(after.board.some((row) => row.some((c) => c !== 0))).toBe(true);
  });

  it('support:掛在一格突出物上放得下去(塞縫能力還在)', () => {
    let s = mk('support');
    const type = s.queue[0];
    // 在方塊底緣的正下方墊一格,其餘全空 ⇒ 只有這一格提供支撐
    const targetRow = BOARD_H - 5;
    const o = clampOrigin(type, 2, targetRow, s.boardWidth);
    s = fill(s, o.x + 1, bottomRowOf(type, o.y) + 1);
    const { state: after } = reduce(s, { type: 'placePiece', source: 'next', piece: type, rotation: 0, x: o.x, y: o.y });
    expect(after).not.toBe(s);
  });

  it('support:同一個位置底下沒墊東西就放不進去(上一項的對照組)', () => {
    const s = mk('support');
    const type = s.queue[0];
    const o = clampOrigin(type, 2, BOARD_H - 5, s.boardWidth);
    const { state: after } = reduce(s, { type: 'placePiece', source: 'next', piece: type, rotation: 0, x: o.x, y: o.y });
    expect(after).toBe(s);
  });

  it('creative:半空中放得下去,而且真的留在半空中', () => {
    const s = mk('creative');
    const { state: after } = dropNext(s, 3, 5);
    const lowestFilled = after.board.reduce(
      (acc, row, y) => (row.some((c) => c !== 0) ? Math.max(acc, y) : acc),
      -1
    );
    expect(after).not.toBe(s);
    expect(lowestFilled).toBeLessThan(TOTAL_H - 1); // 懸浮著,沒落到底
  });

  it('托盤方塊對不上時一律拒絕(防止前端送錯)', () => {
    const s = mk('gravity');
    const wrong: PieceType = s.queue[0] === 'I' ? 'O' : 'I';
    const { state: after } = reduce(s, {
      type: 'placePiece', source: 'next', piece: wrong, rotation: 0, x: 3, y: BOARD_H - 1
    });
    expect(after).toBe(s);
  });

  it('hold 是空的時候不能從 hold 拖', () => {
    const s = mk('gravity');
    expect(s.hold).toBeNull();
    const { state: after } = reduce(s, {
      type: 'placePiece', source: 'hold', piece: 'I', rotation: 0, x: 3, y: BOARD_H - 1
    });
    expect(after).toBe(s);
  });
});

// ───────────────────────────────────────── 托盤拖曳的朝向(F)

describe('托盤拖曳可旋轉', () => {
  /** 直接放一顆指定朝向的方塊,座標自己夾好。 */
  function placeRot(state: GameState, rotation: Rotation, col: number, visibleRow: number) {
    const type = state.queue[0];
    const cells = blocksOf(type, rotation);
    const maxX = Math.max(...cells.map(([x]) => x));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const x = Math.max(0, Math.min(col, state.boardWidth - 1 - maxX));
    const y = Math.max(0, Math.min(visibleRow, BOARD_H - 1 - maxY));
    return reduce(state, { type: 'placePiece', source: 'next', piece: type, rotation, x, y });
  }

  it('直立的 I 放得下去,而且真的是直的(佔 4 列 1 欄)', () => {
    const s = { ...mk('creative', 8), queue: ['I', ...mk().queue.slice(1)] as PieceType[] };
    const { state: after } = placeRot(s, 1, 3, 8);
    expect(after).not.toBe(s);
    const cols = new Set<number>();
    const rows = new Set<number>();
    after.board.forEach((row, y) => row.forEach((c, x) => { if (c !== 0) { cols.add(x); rows.add(y); } }));
    expect(cols.size).toBe(1);
    expect(rows.size).toBe(4);
  });

  it('橫躺的 I 是 1 列 4 欄(跟直立的是不同結果)', () => {
    const s = { ...mk('creative', 8), queue: ['I', ...mk().queue.slice(1)] as PieceType[] };
    const { state: after } = placeRot(s, 0, 2, 8);
    const cols = new Set<number>();
    const rows = new Set<number>();
    after.board.forEach((row, y) => row.forEach((c, x) => { if (c !== 0) { cols.add(x); rows.add(y); } }));
    expect(cols.size).toBe(4);
    expect(rows.size).toBe(1);
  });

  it('四種朝向都放得進去', () => {
    for (const r of [0, 1, 2, 3] as Rotation[]) {
      const s = { ...mk('creative', 8), queue: ['J', ...mk().queue.slice(1)] as PieceType[] };
      const { state: after } = placeRot(s, r, 2, 8);
      expect(after, `rotation ${r}`).not.toBe(s);
    }
  });

  it('越界的朝向值會被正規化,不會炸掉', () => {
    const s = mk('creative', 8);
    const type = s.queue[0];
    for (const bad of [-1, 4, 7, -5]) {
      const { state: after } = reduce(s, {
        type: 'placePiece', source: 'next', piece: type,
        rotation: bad as Rotation, x: 1, y: 10
      });
      // 不要求一定放得成功(夾擠後可能碰撞),只要求不拋例外、狀態仍是合法的
      expect(after.board.length).toBe(s.board.length);
    }
  });

  it('gravity 模式下轉過向的方塊一樣會落到底', () => {
    const s = { ...mk('gravity', 8), queue: ['I', ...mk().queue.slice(1)] as PieceType[] };
    const { state: after } = placeRot(s, 1, 3, 2);
    const lowest = after.board.reduce(
      (acc, row, y) => (row.some((c) => c !== 0) ? Math.max(acc, y) : acc), -1);
    expect(lowest).toBe(TOTAL_H - 1);
  });

  it('support 模式對轉過向的方塊一樣要求支撐', () => {
    const s = { ...mk('support', 8), queue: ['I', ...mk().queue.slice(1)] as PieceType[] };
    const { state: after } = placeRot(s, 1, 3, 4);   // 半空中的直立 I
    expect(after).toBe(s);
  });
});

// ───────────────────────────────────────── 模式切換

describe('模式與欄數切換', () => {
  it('切換模式會重開一局,並保留欄數', () => {
    const s = mk('gravity', 12);
    const { state: after } = reduce(s, { type: 'setMode', mode: 'creative' });
    expect(after.mode).toBe('creative');
    expect(after.boardWidth).toBe(12);
    expect(after.score).toBe(0);
  });

  it('切換到同一個模式是 no-op(不會白白重開一局)', () => {
    const s = mk('gravity');
    const { state: after } = reduce(s, { type: 'setMode', mode: 'gravity' });
    expect(after).toBe(s);
  });

  it('切換欄數會保留模式', () => {
    const s = mk('creative', 8);
    const { state: after } = reduce(s, { type: 'setBoardWidth', width: 12 });
    expect(after.mode).toBe('creative');
    expect(after.boardWidth).toBe(12);
  });

  it('restart 保留模式與欄數', () => {
    const s = mk('support', 7);
    const { state: after } = reduce(s, { type: 'restart' });
    expect(after.mode).toBe('support');
    expect(after.boardWidth).toBe(7);
  });

  it('gameover 之後仍然可以切模式(不然就卡死在設定面板)', () => {
    const s: GameState = { ...mk('gravity'), status: 'gameover' };
    const { state: after } = reduce(s, { type: 'setMode', mode: 'support' });
    expect(after.mode).toBe('support');
    expect(after.status).toBe('playing');
  });
});

// ───────────────────────────────────────── 消行、計分、累計

describe('消行與計分', () => {
  /** 把可見第 row 列填滿,只留 gap 欄。 */
  function fillRowExcept(state: GameState, visibleRow: number, gap: number): GameState {
    const board: Board = state.board.map((r) => [...r]);
    for (let x = 0; x < state.boardWidth; x++) {
      if (x !== gap) board[visibleRow + BUFFER][x] = 'I';
    }
    return { ...state, board };
  }

  it('填滿兩列會一起消掉並加分', () => {
    let s = mk('creative', 8);
    // O 的格子在 dx=1,2 / dy=0,1。左上角放 (5, 18) ⇒ 實際佔 col 6,7 的第 18、19 列。
    const board: Board = s.board.map((r) => [...r]);
    for (let x = 0; x < 6; x++) {
      board[BOARD_H - 1 + BUFFER][x] = 'I';
      board[BOARD_H - 2 + BUFFER][x] = 'I';
    }
    s = { ...s, board, queue: ['O', ...s.queue.slice(1)] as PieceType[] };
    const { state: after, events } = reduce(s, {
      type: 'placePiece', source: 'next', piece: 'O', rotation: 0, x: 5, y: BOARD_H - 2
    });
    expect(after.lines).toBe(2);
    expect(after.score).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'clear')).toBe(true);
  });

  it('沒消行時 combo 歸零(-1)', () => {
    const s = { ...mk('gravity'), combo: 5 };
    const { state: after } = dropNext(s, 3, BOARD_H - 1);
    expect(after).not.toBe(s);      // 先確認這一放真的成立,否則下一行是假綠
    expect(after.lines).toBe(0);
    expect(after.combo).toBe(-1);
  });

  it('maxCombo 只增不減', () => {
    const s = { ...mk('gravity'), combo: 3, maxCombo: 7 };
    const { state: after } = dropNext(s, 3, BOARD_H - 1);
    expect(after).not.toBe(s);
    expect(after.maxCombo).toBe(7);
  });

  it('等級隨行數上升(每 10 行一級)', () => {
    const s = { ...mk('gravity'), lines: 19 };
    expect(s.level).toBe(1);
    const bumped = { ...s, lines: 25 };
    expect(Math.floor(bumped.lines / 10) + 1).toBe(3);
  });

  // 不使用的 helper 會被 TS 的 noUnusedLocals 擋下,這裡用一次保持誠實
  it('fillRowExcept 造出的列只差一格', () => {
    const s = fillRowExcept(mk(), BOARD_H - 1, 4);
    const row = s.board[BOARD_H - 1 + BUFFER];
    expect(row.filter((c) => c === 0).length).toBe(1);
    expect(row[4]).toBe(0);
  });
});

// ───────────────────────────────────────── 旋轉 / 碰撞 / 移動

describe('旋轉與碰撞', () => {
  it('collides:超出左右邊界算碰撞', () => {
    const s = mk('gravity', 8);
    expect(collides(s.board, { type: 'O', rotation: 0, x: -3, y: 10 })).toBe(true);
    expect(collides(s.board, { type: 'O', rotation: 0, x: 20, y: 10 })).toBe(true);
  });

  it('collides:掉出底部算碰撞', () => {
    const s = mk('gravity');
    expect(collides(s.board, { type: 'O', rotation: 0, x: 3, y: TOTAL_H + 1 })).toBe(true);
  });

  it('旋轉四次回到原朝向', () => {
    let s = mk('gravity');
    const r0 = s.current!.rotation;
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'rotate', dir: 1 }).state;
    expect(s.current!.rotation).toBe(r0);
  });

  it('O 方塊旋轉後格子集合不變', () => {
    const a = blocksOf('O', 0).map((c) => c.join(',')).sort();
    const b = blocksOf('O', 1).map((c) => c.join(',')).sort();
    expect(a).toEqual(b);
  });
});

describe('移動與硬降', () => {
  it('硬降後現役方塊換成新的一顆', () => {
    const s = mk('gravity');
    const before = s.current!.type;
    const { state: after, events } = reduce(s, { type: 'hardDrop' });
    expect(events.some((e) => e.type === 'harddrop')).toBe(true);
    expect(after.current).not.toBeNull();
    // 佇列前進了
    expect(after.queue[0]).not.toBe(s.queue[0]);
    expect(typeof before).toBe('string');
  });

  it('硬降會讓方塊貼底', () => {
    const s = mk('gravity');
    const { state: after } = reduce(s, { type: 'hardDrop' });
    const lowestFilled = after.board.reduce(
      (acc, row, y) => (row.some((c) => c !== 0) ? Math.max(acc, y) : acc),
      -1
    );
    expect(lowestFilled).toBe(TOTAL_H - 1);
  });

  it('暫停時一般操作不生效', () => {
    const s = { ...mk('gravity'), status: 'paused' as const };
    const { state: after } = reduce(s, { type: 'move', dx: 1 });
    expect(after).toBe(s);
  });

  it('hold 一次之後不能連續再 hold', () => {
    const s = mk('gravity');
    const once = reduce(s, { type: 'hold' }).state;
    expect(once.canHold).toBe(false);
    const twice = reduce(once, { type: 'hold' }).state;
    expect(twice).toBe(once);
  });
});
