import { useEffect, useRef } from 'react';
import { renderMini, renderQueue } from '../render/renderBoard';
import type { PieceType } from '../game/types';

type DragStart = (source: 'hold' | 'next', piece: PieceType, event: React.PointerEvent) => void;

export function HoldBox({
  piece,
  locked,
  onPieceDragStart
}: {
  piece: PieceType | null;
  locked: boolean;
  onPieceDragStart?: DragStart;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderMini(ref.current, piece, locked);
  }, [piece, locked]);

  const startDrag = (event: React.PointerEvent) => {
    if (!piece || !onPieceDragStart) return;
    onPieceDragStart('hold', piece, event);
  };

  return (
    <div className={piece ? 'mini draggable-mini' : 'mini'} style={{ flex: 1 }} onPointerDown={startDrag}>
      <div className="mini-title">HOLD (C)</div>
      <canvas ref={ref} style={{ aspectRatio: '4 / 3' }} />
    </div>
  );
}

export function NextBox({
  queue,
  onPieceDragStart
}: {
  queue: PieceType[];
  onPieceDragStart?: DragStart;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderQueue(ref.current, queue, 5);
  }, [queue]);

  const startDrag = (event: React.PointerEvent) => {
    if (!queue[0] || !onPieceDragStart) return;
    onPieceDragStart('next', queue[0], event);
  };

  return (
    <div className={queue[0] ? 'mini draggable-mini' : 'mini'} style={{ flex: 1 }} onPointerDown={startDrag}>
      <div className="mini-title">NEXT</div>
      <canvas ref={ref} style={{ aspectRatio: '1 / 2.6' }} />
    </div>
  );
}
