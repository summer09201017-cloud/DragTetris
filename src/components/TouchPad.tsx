import type { Action } from '../game/types';

interface Props {
  dispatch: (a: Action) => void;
}

// Mobile fallback button row. The main control is the canvas drag; this gives
// players reliable buttons for rotate / hold / hard-drop without obscuring.
export function TouchPad({ dispatch }: Props) {
  const press = (a: Action) => (e: React.PointerEvent) => {
    e.preventDefault();
    dispatch(a);
  };
  return (
    <div className="touch-pad">
      <button onPointerDown={press({ type: 'rotate', dir: -1 })}>⟲</button>
      <button onPointerDown={press({ type: 'hold' })}>HOLD</button>
      <button onPointerDown={press({ type: 'hardDrop' })}>⤓</button>
      <button onPointerDown={press({ type: 'rotate', dir: 1 })}>⟳</button>
      <button
        onPointerDown={(e) => { e.preventDefault(); dispatch({ type: 'softDrop', on: true }); }}
        onPointerUp={(e) => { e.preventDefault(); dispatch({ type: 'softDrop', on: false }); }}
        onPointerLeave={() => dispatch({ type: 'softDrop', on: false })}
      >▼</button>
    </div>
  );
}
