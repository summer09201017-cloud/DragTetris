import { useEffect, useRef } from 'react';
import { renderMini, renderQueue } from '../render/renderBoard';
import type { PieceType, Rotation } from '../game/types';

type DragStart = (
  source: 'hold' | 'next',
  piece: PieceType,
  rotation: Rotation,
  event: React.PointerEvent
) => void;

type RotateTray = (source: 'hold' | 'next') => void;

/** 判定「這是點一下」而不是「開始拖」的位移門檻(px)。 */
const TAP_SLOP = 8;

/**
 * 托盤方塊的共用互動:按住拖 = 放到盤上,點一下(幾乎沒移動)= 轉 90°。
 *
 * ★ 為什麼用「位移門檻」而不是兩顆各自獨立的鈕:托盤在手機上只有指甲大小,
 *   再塞一顆 ⟳ 進去會把兩個目標都壓到 44px 以下(canvas-touch-targets 的下限)。
 *   點/拖同一個目標、用 8px 位移分流,兩個動作都保有整塊面積。
 * ★ 門檻不能設太小:手指按下去本來就會晃兩三 px,設 2~3 會讓「想點」變成「轉不動」。
 */
function useTapOrDrag(
  source: 'hold' | 'next',
  piece: PieceType | null | undefined,
  rotation: Rotation,
  onPieceDragStart?: DragStart,
  onRotate?: RotateTray
) {
  const down = useRef<{ x: number; y: number; id: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!piece) return;
    down.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    onPieceDragStart?.(source, piece, rotation, event);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== event.pointerId || !piece) return;
    const moved = Math.hypot(event.clientX - d.x, event.clientY - d.y);
    if (moved <= TAP_SLOP) onRotate?.(source);
  };

  return { onPointerDown, onPointerUp, onPointerCancel: () => { down.current = null; } };
}

export function HoldBox({
  piece,
  locked,
  rotation = 0,
  onPieceDragStart,
  onRotate
}: {
  piece: PieceType | null;
  locked: boolean;
  rotation?: Rotation;
  onPieceDragStart?: DragStart;
  onRotate?: RotateTray;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderMini(ref.current, piece, locked, rotation);
  }, [piece, locked, rotation]);

  const handlers = useTapOrDrag('hold', piece, rotation, onPieceDragStart, onRotate);

  return (
    <div className={piece ? 'mini draggable-mini' : 'mini'} style={{ flex: 1 }} {...handlers}>
      <div className="mini-title">HOLD (C)</div>
      <canvas ref={ref} style={{ aspectRatio: '4 / 3' }} />
      {piece && (
        <div className="mini-hint">
          <span className="hint-long">點一下轉向 </span>⟳
        </div>
      )}
    </div>
  );
}

export function NextBox({
  queue,
  rotation = 0,
  onPieceDragStart,
  onRotate
}: {
  queue: PieceType[];
  rotation?: Rotation;
  onPieceDragStart?: DragStart;
  onRotate?: RotateTray;
}) {
  const headRef = useRef<HTMLCanvasElement>(null);
  const restRef = useRef<HTMLCanvasElement>(null);

  // 第一顆單獨畫(它是唯一能拖、能轉的),後面四顆維持原本的佇列預覽。
  useEffect(() => {
    if (headRef.current) renderMini(headRef.current, queue[0] ?? null, false, rotation);
  }, [queue, rotation]);
  useEffect(() => {
    if (restRef.current) renderQueue(restRef.current, queue.slice(1), 4);
  }, [queue]);

  const handlers = useTapOrDrag('next', queue[0], rotation, onPieceDragStart, onRotate);

  return (
    <div className="mini" style={{ flex: 1 }}>
      <div className="mini-title">NEXT</div>
      <div className={queue[0] ? 'next-head draggable-mini' : 'next-head'} {...handlers}>
        <canvas ref={headRef} style={{ aspectRatio: '4 / 3' }} />
        {queue[0] && (
          <div className="mini-hint">
            <span className="hint-long">點一下轉向 </span>⟳
          </div>
        )}
      </div>
      <canvas ref={restRef} style={{ aspectRatio: '1 / 2.1' }} />
    </div>
  );
}
