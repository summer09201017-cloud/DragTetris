/**
 * 🧩 殘局求解器 / 驗證器(2026-09-16)。
 *
 * ★★ 這是 daily-puzzle-kit §三 的鐵則:**機器生的題,可解性也要機器驗**。
 *    而且 §十二 那條同樣適用:**驗證一律走遊戲本身的 `reduce`**,不可以另寫一份簡化模擬 ——
 *    另寫一份的話,兩邊分岔的那天測試還是綠的,而玩家拿到的是一題放不進去的殘局。
 *
 * ★ 這裡也守 solitaire-solver-kit 第〇節:**提示/解答絕不可以是貪心猜測**。
 *   這支是真的把整條解搜出來(DFS + 去重 + 節點預算),
 *   搜不到就明說「這顆種子生不出題」讓上層換種子,而不是給一個「看起來像解」的走法。
 *
 * 搜尋空間為什麼不會爆炸:殘局的方塊只能放進「瓦礫區」(盤面上有東西的那幾列)的空洞裡,
 * 一題只有 2~3 列、寬 7~12 格 ⇒ 每一步的合法落點只有數十個,深度又只有 3~5。
 */
import { createPuzzleState, isBoardEmpty, reduce } from './game/engine';
import { BOARD_H, TOTAL_H } from './game/constants';
import { blocksOf } from './game/pieces';
import type { GameState, Rotation } from './game/types';
import type { Placement, Puzzle } from './puzzles';

const ROTATIONS: Rotation[] = [0, 1, 2, 3];
/** 節點預算:超過就當作「這顆種子生不出題」。**預算用完 ≠ 無解**,文案不可以混講。 */
const NODE_BUDGET = 40000;

interface Candidate {
  rotation: Rotation;
  /** 盤面座標的原點（含隱藏緩衝列）。 */
  x: number;
  y: number;
  cells: [number, number][];
}

/**
 * 佇列第一顆方塊的所有「填進題目區空洞」的擺法。
 *
 * 刻意**只**枚舉「四格全部落在題目區的空格上」的擺法 —— 這是個保守的縮限:
 * 找得到解就一定真的有解(sound);找不到不代表絕對無解,但那種解(把方塊蓋在題目區上面)
 * 本來就清不乾淨,對殘局沒有意義。
 *
 * ⚠ `top` 必須是**題目區的頂**(盤面最底下那 R 列),**不可以**用「最上面那一列有磚的列」——
 *   題目最上面那一列有可能整列都是洞(被挖掉的塊剛好在最上層),那樣算出來的 top 會往下掉一列,
 *   把整排合法落點排除在外,求解器就會說「無解」而其實有解(0916 實錘:7 欄挑戰題整組被誤判)。
 *   R 會隨著消行變少 ⇒ 由呼叫端一路帶下來。
 */
function candidatesFor(state: GameState, top: number): Candidate[] {
  const type = state.queue[0];
  if (!type) return [];
  if (top >= TOTAL_H) return [];

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const rotation of ROTATIONS) {
    const shape = blocksOf(type, rotation);
    for (let y = top - 3; y < TOTAL_H; y++) {
      for (let x = -3; x < state.boardWidth + 3; x++) {
        const cells = shape.map(([dx, dy]) => [x + dx, y + dy] as [number, number]);
        let ok = true;
        for (const [cx, cy] of cells) {
          if (cx < 0 || cx >= state.boardWidth || cy < top || cy >= TOTAL_H || state.board[cy][cx] !== 0) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        // 不同的 (x,y,rotation) 可能蓋到同一組格子（O 的四個朝向就是）⇒ 去重，
        // 不然分支數會白白乘上四倍。
        const key = cells
          .map(([cx, cy]) => `${cx},${cy}`)
          .sort()
          .join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ rotation, x, y, cells });
      }
    }
  }
  return out;
}

/**
 * 搜一條把盤面清乾淨的解。回 null = 在預算內沒找到。
 * ⚠ 每一步都走真正的 `reduce`,所以消行、往下塌、support 判定全都是遊戲本人的規則。
 */
export function solvePuzzle(puzzle: Puzzle): Placement[] | null {
  const start = createPuzzleState(puzzle.board, puzzle.queue, puzzle.boardWidth);
  let nodes = 0;

  const dfs = (state: GameState, path: Placement[], rowsLeft: number): Placement[] | null => {
    if (state.queue.length === 0) {
      return isBoardEmpty(state.board) ? path : null;
    }
    if (nodes++ > NODE_BUDGET) return null;

    const type = state.queue[0];
    for (const candidate of candidatesFor(state, TOTAL_H - rowsLeft)) {
      const result = reduce(state, {
        type: 'placePiece',
        source: 'next',
        piece: type,
        rotation: candidate.rotation,
        x: candidate.x,
        // 引擎收的是「可見座標」,自己會加上隱藏緩衝列
        y: candidate.y - (TOTAL_H - BOARD_H)
      });
      // 被拒絕(支撐不足、重疊…)時 reduce 回的是同一個 state 物件
      if (result.state === state) continue;
      const step: Placement = {
        type,
        rotation: candidate.rotation,
        x: candidate.x,
        y: candidate.y,
        cells: candidate.cells
      };
      // 消掉幾列，題目區就跟著矮幾列（上面的整個往下塌）
      const clearedRows = result.state.lines - state.lines;
      const found = dfs(result.state, [...path, step], rowsLeft - clearedRows);
      if (found) return found;
    }
    return null;
  };

  return dfs(start, [], puzzle.rows);
}

/** 這一題在遊戲本身的規則下解得開嗎? */
export function verifyPuzzle(puzzle: Puzzle): boolean {
  return solvePuzzle(puzzle) != null;
}
