export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Cell = 0 | PieceType | 'G';
export type Rotation = 0 | 1 | 2 | 3;
export type Board = Cell[][];

export interface Piece {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
}

export type LockTSpin = 'none' | 'mini' | 'full';

export interface ClearResult {
  lines: number;
  tspin: LockTSpin;
  perfectClear: boolean;
}

export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameover';

export interface GameState {
  boardWidth: number;
  board: Board;
  current: Piece | null;
  hold: PieceType | null;
  canHold: boolean;
  queue: PieceType[];
  bag: PieceType[];
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  status: GameStatus;
  lastClear: ClearResult | null;
  // Internal
  gravityAcc: number;
  lockTimer: number;
  lockResets: number;
  onGround: boolean;
  lastMoveWasRotate: boolean;
  lastKickIndex: number;
  softDropping: boolean;
  // Animation
  clearAnim: { rows: number[]; t: number } | null;
  // RNG seed
  rngState: number;
}

export type GameEvent =
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'softdrop' }
  | { type: 'harddrop'; cells: number }
  | { type: 'lock' }
  | { type: 'hold' }
  | { type: 'clear'; lines: number; tspin: LockTSpin; b2b: boolean; combo: number; perfectClear: boolean }
  | { type: 'levelup'; level: number }
  | { type: 'gameover' };

export type Action =
  | { type: 'tick'; dt: number }
  | { type: 'move'; dx: number }
  | { type: 'moveTo'; x: number }
  | { type: 'placePiece'; source: 'hold' | 'next'; piece: PieceType; x: number; y: number }
  | { type: 'softDrop'; on: boolean }
  | { type: 'hardDrop' }
  | { type: 'rotate'; dir: -1 | 1 }
  | { type: 'hold' }
  | { type: 'pause' }
  | { type: 'pauseToggle' }
  | { type: 'resume' }
  | { type: 'setBoardWidth'; width: number }
  | { type: 'restart' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
