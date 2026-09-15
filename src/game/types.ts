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

/**
 * 玩法模式(2026-09-15 使用者拍板:三種都保住,讓玩家挑)。
 * 差別只在「從 Hold / Next 托盤把方塊拖到盤上」那一下怎麼判定:
 *
 *  gravity  = 經典重力(預設,最忠於原作):拖到哪一欄就從那裡**自動落到底**。
 *             等於「指定落點的硬降」——規則跟一般俄羅斯方塊完全一樣,只是換個操作方式。
 *  support  = 塞縫:落點就是落點、不自動下墜,但**至少一格正下方要有支撐**(地板或既有方塊)。
 *             保留本作獨有的「掛在突出物下面 / 塞進凹角」能力,又不能憑空懸浮。
 *  creative = 自由建造:放哪就哪,不檢查支撐,可以蓋浮空平台。
 *             ⚠ 沙盒模式,**刻意不計分**——能懸浮的分數拿去跟另外兩檔比沒有意義。
 */
export type GameMode = 'gravity' | 'support' | 'creative';

export interface GameState {
  mode: GameMode;
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
  maxCombo: number;
  pcCount: number;
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
  | { type: 'setMode'; mode: GameMode }
  | { type: 'restart' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
