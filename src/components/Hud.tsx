import type { GameState } from '../game/types';

interface Props {
  state: GameState;
}

export function Hud({ state }: Props) {
  return (
    <div className="score-grid">
      <div className="score-cell">
        <div className="label">SCORE</div>
        <div className="value">{state.score.toLocaleString()}</div>
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
