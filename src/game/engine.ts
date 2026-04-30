import {
  BOARD_W,
  BOARD_H,
  TOTAL_H,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  SOFT_DROP_FACTOR,
  gravitySecondsPerCell,
  linesPerLevel
} from './constants';
import { blocksOf } from './pieces';
import { kicksFor, rotateIndex } from './srs';
import { shuffleBag } from './bag';
import type {
  Action,
  Board,
  Cell,
  GameEvent,
  GameState,
  Piece,
  PieceType,
  Rotation,
  StepResult,
  ClearResult,
  LockTSpin
} from './types';

// ────────────────────────────── helpers

function emptyBoard(): Board {
  const b: Board = [];
  for (let y = 0; y < TOTAL_H; y++) {
    b.push(new Array<Cell>(BOARD_W).fill(0));
  }
  return b;
}

function cloneBoard(b: Board): Board {
  return b.map(row => row.slice());
}

function spawnPiece(type: PieceType): Piece {
  // x = 3 for all in a 10-wide board (centers 4-wide bounding box around col 3-6).
  return { type, rotation: 0, x: 3, y: 0 };
}

function pieceCells(p: Piece): [number, number][] {
  return blocksOf(p.type, p.rotation).map(([dx, dy]) => [p.x + dx, p.y + dy]);
}

function collides(b: Board, p: Piece): boolean {
  for (const [x, y] of pieceCells(p)) {
    if (x < 0 || x >= BOARD_W || y >= TOTAL_H) return true;
    if (y < 0) continue; // above the visible+buffer top is OK during spawn
    if (b[y][x] !== 0) return true;
  }
  return false;
}

function lockPiece(b: Board, p: Piece): Board {
  const next = cloneBoard(b);
  for (const [x, y] of pieceCells(p)) {
    if (y >= 0 && y < TOTAL_H && x >= 0 && x < BOARD_W) {
      next[y][x] = p.type;
    }
  }
  return next;
}

function clearLines(b: Board): { board: Board; cleared: number[] } {
  const cleared: number[] = [];
  const rows: Cell[][] = [];
  for (let y = 0; y < TOTAL_H; y++) {
    if (b[y].every(c => c !== 0)) {
      cleared.push(y);
    } else {
      rows.push(b[y]);
    }
  }
  while (rows.length < TOTAL_H) {
    rows.unshift(new Array<Cell>(BOARD_W).fill(0));
  }
  return { board: rows, cleared };
}

function isPerfectClear(b: Board): boolean {
  for (let y = 0; y < TOTAL_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      if (b[y][x] !== 0) return false;
    }
  }
  return true;
}

function ghostY(b: Board, p: Piece): number {
  let test = { ...p };
  while (true) {
    const next = { ...test, y: test.y + 1 };
    if (collides(b, next)) return test.y;
    test = next;
  }
}

export function getGhost(state: GameState): Piece | null {
  if (!state.current) return null;
  return { ...state.current, y: ghostY(state.board, state.current) };
}

// ────────────────────────────── T-Spin detection

function detectTSpin(board: Board, piece: Piece, lastWasRotate: boolean, lastKickIdx: number): LockTSpin {
  if (!lastWasRotate || piece.type !== 'T') return 'none';
  // 4 corners of T's 3x3 bounding box (at local 0,0 / 2,0 / 0,2 / 2,2)
  const corners = [
    [piece.x + 0, piece.y + 0],
    [piece.x + 2, piece.y + 0],
    [piece.x + 0, piece.y + 2],
    [piece.x + 2, piece.y + 2]
  ];
  const filled = corners.map(([x, y]) => {
    if (x < 0 || x >= BOARD_W || y < 0 || y >= TOTAL_H) return true;
    return board[y][x] !== 0;
  });
  const total = filled.filter(Boolean).length;
  if (total < 3) return 'none';

  // Front corners depend on rotation:
  // 0 (point up):    front = top-left, top-right (corner 0,1)
  // 1 (point right): front = top-right, bottom-right (corner 1,3)
  // 2 (point down):  front = bottom-left, bottom-right (corner 2,3)
  // 3 (point left):  front = top-left, bottom-left (corner 0,2)
  const frontPairs: Record<Rotation, [number, number]> = {
    0: [0, 1], 1: [1, 3], 2: [2, 3], 3: [0, 2]
  };
  const [fa, fb] = frontPairs[piece.rotation];
  const frontFilled = (filled[fa] ? 1 : 0) + (filled[fb] ? 1 : 0);

  // 4th-kick (TST kick) escalates a mini to a full T-Spin.
  if (frontFilled === 2 || lastKickIdx === 4) return 'full';
  return 'mini';
}

// ────────────────────────────── scoring

const CLEAR_BASE: Record<number, number> = { 1: 100, 2: 300, 3: 500, 4: 800 };
const TSPIN_FULL_BASE: Record<number, number> = { 0: 400, 1: 800, 2: 1200, 3: 1600 };
const TSPIN_MINI_BASE: Record<number, number> = { 0: 100, 1: 200, 2: 400 };

function scoreFor(clear: ClearResult, level: number, b2bBefore: boolean): { points: number; b2bAfter: boolean } {
  const { lines, tspin } = clear;
  let base = 0;
  let isDifficult = false;

  if (tspin === 'full') {
    base = TSPIN_FULL_BASE[lines] ?? 0;
    isDifficult = lines > 0;
  } else if (tspin === 'mini') {
    base = TSPIN_MINI_BASE[lines] ?? 0;
    isDifficult = lines > 0;
  } else if (lines > 0) {
    base = CLEAR_BASE[lines] ?? 0;
    isDifficult = lines === 4; // Tetris
  }

  let points = base * level;
  let b2bAfter = b2bBefore;
  if (isDifficult) {
    if (b2bBefore) points = Math.floor(points * 1.5);
    b2bAfter = true;
  } else if (lines > 0) {
    b2bAfter = false;
  }
  if (clear.perfectClear && lines > 0) {
    const pcBonus = lines === 1 ? 800 : lines === 2 ? 1200 : lines === 3 ? 1800 : 2000;
    points += pcBonus * level;
  }
  return { points, b2bAfter };
}

// ────────────────────────────── state

export function createInitialState(seed = Date.now() & 0x7fffffff): GameState {
  const { bag, state: rng1 } = shuffleBag(seed);
  const { bag: bag2, state: rng2 } = shuffleBag(rng1);
  const queue = [...bag.slice(1), ...bag2].slice(0, 6);
  return {
    board: emptyBoard(),
    current: spawnPiece(bag[0]),
    hold: null,
    canHold: true,
    queue,
    bag: bag2,
    score: 0,
    lines: 0,
    level: 1,
    combo: -1,
    backToBack: false,
    status: 'playing',
    lastClear: null,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    onGround: false,
    lastMoveWasRotate: false,
    lastKickIndex: 0,
    softDropping: false,
    clearAnim: null,
    rngState: rng2
  };
}

// Refill queue from bag(s), generating new bags as needed.
function refillQueue(state: GameState): GameState {
  let { queue, bag, rngState } = state;
  queue = [...queue];
  bag = [...bag];
  while (queue.length < 6) {
    if (bag.length === 0) {
      const { bag: nb, state: ns } = shuffleBag(rngState);
      bag = nb;
      rngState = ns;
    }
    queue.push(bag.shift()!);
  }
  return { ...state, queue, bag, rngState };
}

function spawnNext(state: GameState): { state: GameState; gameOver: boolean } {
  const filled = refillQueue(state);
  const next = filled.queue[0];
  const queue = filled.queue.slice(1);
  const piece = spawnPiece(next);
  const gameOver = collides(filled.board, piece);
  return {
    state: {
      ...filled,
      queue,
      current: gameOver ? null : piece,
      canHold: true,
      gravityAcc: 0,
      lockTimer: 0,
      lockResets: 0,
      onGround: false,
      lastMoveWasRotate: false,
      lastKickIndex: 0
    },
    gameOver
  };
}

function setOnGround(state: GameState): GameState {
  if (!state.current) return state;
  const below = { ...state.current, y: state.current.y + 1 };
  const onGround = collides(state.board, below);
  if (onGround && !state.onGround) {
    return { ...state, onGround: true, lockTimer: 0 };
  }
  if (!onGround && state.onGround) {
    return { ...state, onGround: false, lockTimer: 0 };
  }
  return { ...state, onGround };
}

// ────────────────────────────── reducer

function tryMove(state: GameState, dx: number): { state: GameState; moved: boolean } {
  if (!state.current) return { state, moved: false };
  const next = { ...state.current, x: state.current.x + dx };
  if (collides(state.board, next)) return { state, moved: false };
  let s = { ...state, current: next, lastMoveWasRotate: false };
  if (s.onGround && s.lockResets < MAX_LOCK_RESETS) {
    s = { ...s, lockTimer: 0, lockResets: s.lockResets + 1 };
  }
  return { state: setOnGround(s), moved: true };
}

function tryMoveTo(state: GameState, targetX: number): { state: GameState; moved: boolean } {
  if (!state.current) return { state, moved: false };

  let s = state;
  let moved = false;
  const target = Math.trunc(targetX);

  while (s.current && s.current.x !== target) {
    const dir = s.current.x < target ? 1 : -1;
    const next = tryMove(s, dir);
    if (!next.moved) break;
    s = next.state;
    moved = true;
  }

  return { state: s, moved };
}

function tryRotate(state: GameState, dir: -1 | 1): { state: GameState; rotated: boolean } {
  if (!state.current) return { state, rotated: false };
  const from = state.current.rotation;
  const to = rotateIndex(from, dir);
  const kicks = kicksFor(state.current.type, from, to);
  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    const candidate: Piece = {
      ...state.current,
      rotation: to,
      x: state.current.x + kx,
      y: state.current.y + ky
    };
    if (!collides(state.board, candidate)) {
      let s: GameState = {
        ...state,
        current: candidate,
        lastMoveWasRotate: true,
        lastKickIndex: i
      };
      if (s.onGround && s.lockResets < MAX_LOCK_RESETS) {
        s = { ...s, lockTimer: 0, lockResets: s.lockResets + 1 };
      }
      return { state: setOnGround(s), rotated: true };
    }
  }
  return { state, rotated: false };
}

function dropOne(state: GameState): { state: GameState; dropped: boolean } {
  if (!state.current) return { state, dropped: false };
  const next = { ...state.current, y: state.current.y + 1 };
  if (collides(state.board, next)) return { state, dropped: false };
  return {
    state: setOnGround({ ...state, current: next, lastMoveWasRotate: false }),
    dropped: true
  };
}

function lockAndClear(state: GameState, hardCells = 0): StepResult {
  if (!state.current) return { state, events: [] };
  const events: GameEvent[] = [];
  const tspin = detectTSpin(state.board, state.current, state.lastMoveWasRotate, state.lastKickIndex);
  const locked = lockPiece(state.board, state.current);
  const { board: cleared, cleared: rows } = clearLines(locked);
  const pc = rows.length > 0 && isPerfectClear(cleared);
  const clear: ClearResult = { lines: rows.length, tspin, perfectClear: pc };
  const { points, b2bAfter } = scoreFor(clear, state.level, state.backToBack);

  const newCombo = rows.length > 0 ? state.combo + 1 : -1;
  const comboBonus = newCombo > 0 ? 50 * newCombo * state.level : 0;
  const totalLines = state.lines + rows.length;
  const newLevel = Math.max(state.level, Math.floor(totalLines / 10) + 1);
  const levelChanged = newLevel !== state.level;

  const hardScore = hardCells * 2;

  const next: GameState = {
    ...state,
    board: cleared,
    current: null,
    score: state.score + points + comboBonus + hardScore,
    lines: totalLines,
    level: newLevel,
    combo: newCombo,
    backToBack: b2bAfter,
    lastClear: clear,
    gravityAcc: 0,
    lockTimer: 0,
    lockResets: 0,
    onGround: false,
    softDropping: false,
    clearAnim: rows.length > 0 ? { rows, t: 0 } : null
  };

  events.push({ type: 'lock' });
  if (rows.length > 0) {
    events.push({
      type: 'clear',
      lines: rows.length,
      tspin,
      b2b: b2bAfter && state.backToBack && (rows.length === 4 || tspin !== 'none'),
      combo: Math.max(0, newCombo),
      perfectClear: pc
    });
  }
  if (levelChanged) events.push({ type: 'levelup', level: newLevel });

  // Spawn next piece
  const spawned = spawnNext(next);
  if (spawned.gameOver) {
    events.push({ type: 'gameover' });
    return { state: { ...spawned.state, status: 'gameover' }, events };
  }
  return { state: spawned.state, events };
}

function hardDrop(state: GameState): StepResult {
  if (!state.current) return { state, events: [] };
  let p = state.current;
  let cells = 0;
  while (true) {
    const next = { ...p, y: p.y + 1 };
    if (collides(state.board, next)) break;
    p = next;
    cells++;
  }
  const after: GameState = { ...state, current: p, lastMoveWasRotate: false };
  const { state: locked, events } = lockAndClear(after, cells);
  return { state: locked, events: [{ type: 'harddrop', cells }, ...events] };
}

function holdPiece(state: GameState): StepResult {
  if (!state.current || !state.canHold) return { state, events: [] };
  const cur = state.current.type;
  const events: GameEvent[] = [{ type: 'hold' }];

  if (state.hold == null) {
    const filled = refillQueue(state);
    const next = filled.queue[0];
    const queue = filled.queue.slice(1);
    const piece = spawnPiece(next);
    if (collides(filled.board, piece)) {
      events.push({ type: 'gameover' });
      return {
        state: { ...filled, hold: cur, current: null, canHold: false, queue, status: 'gameover' },
        events
      };
    }
    return {
      state: {
        ...filled,
        hold: cur,
        current: piece,
        canHold: false,
        queue,
        gravityAcc: 0,
        lockTimer: 0,
        lockResets: 0,
        onGround: false,
        lastMoveWasRotate: false,
        lastKickIndex: 0
      },
      events
    };
  }

  const piece = spawnPiece(state.hold);
  if (collides(state.board, piece)) {
    events.push({ type: 'gameover' });
    return {
      state: { ...state, hold: cur, current: null, canHold: false, status: 'gameover' },
      events
    };
  }
  return {
    state: {
      ...state,
      hold: cur,
      current: piece,
      canHold: false,
      gravityAcc: 0,
      lockTimer: 0,
      lockResets: 0,
      onGround: false,
      lastMoveWasRotate: false,
      lastKickIndex: 0
    },
    events
  };
}

function tickGravity(state: GameState, dtMs: number): StepResult {
  if (!state.current) return { state, events: [] };
  const events: GameEvent[] = [];
  const baseSec = gravitySecondsPerCell(state.level);
  const effSec = state.softDropping ? Math.max(baseSec / SOFT_DROP_FACTOR, 0.001) : baseSec;
  const cellsPerMs = 1 / (effSec * 1000);
  let acc = state.gravityAcc + dtMs * cellsPerMs;
  let s = state;
  let softCells = 0;
  while (acc >= 1) {
    const r = dropOne(s);
    if (!r.dropped) break;
    s = r.state;
    if (s.softDropping) softCells++;
    acc -= 1;
  }
  s = { ...s, gravityAcc: acc };
  if (softCells > 0) {
    s = { ...s, score: s.score + softCells };
    events.push({ type: 'softdrop' });
  }

  // Lock delay
  s = setOnGround(s);
  if (s.onGround) {
    s = { ...s, lockTimer: s.lockTimer + dtMs };
    if (s.lockTimer >= LOCK_DELAY_MS) {
      const locked = lockAndClear(s);
      return { state: locked.state, events: [...events, ...locked.events] };
    }
  }
  // Animation tick
  if (s.clearAnim) {
    const t = s.clearAnim.t + dtMs;
    s = t > 200 ? { ...s, clearAnim: null } : { ...s, clearAnim: { ...s.clearAnim, t } };
  }
  return { state: s, events };
}

export function reduce(state: GameState, action: Action): StepResult {
  if (state.status === 'gameover' && action.type !== 'restart') {
    return { state, events: [] };
  }
  if (
    state.status === 'paused' &&
    action.type !== 'pauseToggle' &&
    action.type !== 'resume' &&
    action.type !== 'restart'
  ) {
    return { state, events: [] };
  }

  switch (action.type) {
    case 'tick':
      return tickGravity(state, action.dt);
    case 'move': {
      const r = tryMove(state, action.dx);
      return { state: r.state, events: r.moved ? [{ type: 'move' }] : [] };
    }
    case 'moveTo': {
      const r = tryMoveTo(state, action.x);
      return { state: r.state, events: r.moved ? [{ type: 'move' }] : [] };
    }
    case 'rotate': {
      const r = tryRotate(state, action.dir);
      return { state: r.state, events: r.rotated ? [{ type: 'rotate' }] : [] };
    }
    case 'softDrop':
      return { state: { ...state, softDropping: action.on }, events: [] };
    case 'hardDrop':
      return hardDrop(state);
    case 'hold':
      return holdPiece(state);
    case 'pause':
      return { state: { ...state, status: 'paused', softDropping: false }, events: [] };
    case 'pauseToggle':
      return {
        state: {
          ...state,
          status: state.status === 'paused' ? 'playing' : 'paused',
          softDropping: state.status === 'paused' ? state.softDropping : false
        },
        events: []
      };
    case 'resume':
      return { state: { ...state, status: 'playing' }, events: [] };
    case 'restart':
      return { state: createInitialState(), events: [] };
  }
}

// Public helpers re-exported for renderer
export { collides, ghostY, BOARD_W, BOARD_H, TOTAL_H, linesPerLevel };
