import type { GameState } from '../game/types';
import type { RecordEntry } from '../records';
import { scoresCount } from '../records';

interface Props {
  state: GameState;
  record: RecordEntry;
}

export function Hud({ state, record }: Props) {
  const counts = scoresCount(state.mode);
  // 沙盒模式沒有紀錄可破,那一格改印模式名,不要留一個永遠是 0 的 BEST 騙人。
  const bestLabel = counts ? 'BEST' : '模式';
  const bestValue = counts
    ? Math.max(record.score, state.score).toLocaleString()
    : '自由建造';
  const isNewBest = counts && record.games > 0 && state.score > record.score;

  return (
    <div className="score-grid">
      <div className="score-cell">
        <div className="label">SCORE</div>
        <div className="value">{state.score.toLocaleString()}</div>
      </div>
      <div className={isNewBest ? 'score-cell best-live' : 'score-cell'}>
        <div className="label">{bestLabel}</div>
        <div className="value">{bestValue}</div>
      </div>
      <div className="score-cell">
        <div className="label">LEVEL</div>
        <div className="value">{state.level}</div>
      </div>
      <div className="score-cell">
        <div className="label">LINES</div>
        <div className="value">{state.lines}</div>
      </div>
    </div>
  );
}
