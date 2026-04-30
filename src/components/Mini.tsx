import { useEffect, useRef } from 'react';
import { renderMini, renderQueue } from '../render/renderBoard';
import type { PieceType } from '../game/types';

export function HoldBox({ piece, locked }: { piece: PieceType | null; locked: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderMini(ref.current, piece, locked);
  }, [piece, locked]);
  return (
    <div className="mini" style={{ flex: 1 }}>
      <div className="mini-title">HOLD (C)</div>
      <canvas ref={ref} style={{ aspectRatio: '4 / 3' }} />
    </div>
  );
}

export function NextBox({ queue }: { queue: PieceType[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderQueue(ref.current, queue, 5);
  }, [queue]);
  return (
    <div className="mini" style={{ flex: 1 }}>
      <div className="mini-title">NEXT</div>
      <canvas ref={ref} style={{ aspectRatio: '1 / 2.6' }} />
    </div>
  );
}
