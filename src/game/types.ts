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
  /**
   * 🧩 殘局模式(0916)。true 時:
   *   - 佇列是**有限**的(放完就沒了,不從袋子補牌)——殘局的題目就是那幾顆方塊;
   *   - current 恆為 null ⇒ 沒有會自己往下掉的方塊(tickGravity 開頭就 return)。
   * 一般對局恆為 false,行為與 0915 版完全相同。
   */
  puzzle: boolean;
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
  /**
   * 從托盤（Hold / Next）直接把方塊拖到盤上。
   * rotation 是 0915 補的：原本寫死 0 ⇒ I 只能橫躺、L 只有一個姿勢，
   * 這個招牌機制自己砍掉了 3/4 的可能性。
   */
  | {
      type: 'placePiece';
      source: 'hold' | 'next';
      piece: PieceType;
      rotation: Rotation;
      x: number;
      y: number;
    }
  | { type: 'softDrop'; on: boolean }
  | { type: 'hardDrop' }
  | { type: 'rotate'; dir: -1 | 1 }
  | { type: 'hold' }
  | { type: 'pause' }
  | { type: 'pauseToggle' }
  | { type: 'resume' }
  // seed:每日挑戰 / 指定題號重開一局時沿用同一副牌;不給就取時間當種子。
  | { type: 'setBoardWidth'; width: number; seed?: number }
  | { type: 'setMode'; mode: GameMode; seed?: number }
  | { type: 'restart'; seed?: number };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
