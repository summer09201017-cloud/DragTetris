import type { Action } from '../game/types';

interface Props {
  dispatch: (a: Action) => void;
}

// Mobile fallback button row. The main control is the canvas drag; this gives
// players reliable buttons for rotate / hold / hard-drop without obscuring.
// 1113 v4.6(長輩友善 2.3):原本只有符號 ⟲ ⤓ ⟳ ▼,看不懂是什麼 ⇒ 每顆加 aria-label,
//   符號底下加一行小字。按鈕高度維持 44px(再加高會擠到棋盤),小字放在原本的留白裡。
export function TouchPad({ dispatch }: Props) {
  const press = (a: Action) => (e: React.PointerEvent) => {
    e.preventDefault();
    dispatch(a);
  };
  return (
    <div className="touch-pad">
      <button type="button" aria-label="左轉" onPointerDown={press({ type: 'rotate', dir: -1 })}>
        <span className="pad-icon" aria-hidden="true">⟲</span>
        <span className="pad-text" aria-hidden="true">左轉</span>
      </button>
      <button type="button" aria-label="保留" onPointerDown={press({ type: 'hold' })}>
        <span className="pad-word">保留</span>
      </button>
      <button type="button" aria-label="落到底" onPointerDown={press({ type: 'hardDrop' })}>
        <span className="pad-icon" aria-hidden="true">⤓</span>
        <span className="pad-text" aria-hidden="true">落底</span>
      </button>
      <button type="button" aria-label="右轉" onPointerDown={press({ type: 'rotate', dir: 1 })}>
        <span className="pad-icon" aria-hidden="true">⟳</span>
        <span className="pad-text" aria-hidden="true">右轉</span>
      </button>
      <button
        type="button"
        aria-label="按住加速往下"
        onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'softDrop', on: true }); }}
        onPointerUp={(e) => { e.preventDefault(); dispatch({ type: 'softDrop', on: false }); }}
        onPointerLeave={() => dispatch({ type: 'softDrop', on: false })}
      >
        <span className="pad-icon" aria-hidden="true">▼</span>
        <span className="pad-text" aria-hidden="true">加速</span>
      </button>
    </div>
  );
}
