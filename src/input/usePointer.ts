import { useEffect, useRef, RefObject } from 'react';
import { BOARD_H, BUFFER_H } from '../game/constants';
import { blocksOf } from '../game/pieces';
import type { Action, Piece } from '../game/types';

interface PointerOptions {
  targetRef: RefObject<HTMLElement>;
  boardRef?: RefObject<HTMLCanvasElement>;
  dispatch: (a: Action) => void;
  enabled: boolean;
  boardWidth: number;
  cellSize: () => number;
  mouseDragEnabled?: boolean;
  getCurrentPiece?: () => Piece | null;
}

type PointerStart = {
  x: number;
  y: number;
  t: number;
  lastX: number;
  lastY: number;
  mode: 'gesture' | 'mouseDrag';
  grabOffsetX: number;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(
    target.closest('button, input, select, textarea, a, [role="button"], [data-pointer-control-ignore]')
  );
}

// Touch controls:
//   horizontal drag      -> move left/right by cell
//   fast downward flick  -> hard drop
//   tap / double tap     -> rotate CW / CCW
//   two-finger or hold   -> hold piece
//
// ⚠ 拖曳**不做軟降**(0921 使用者回報「用手指碰方塊時,方塊會變快往下降」):
//   原本「往下拖超過 0.6 格就開軟降」——手指要橫移時幾乎一定會帶一點向下分量,
//   碰到方塊就等於按住 ▼,玩家以為是 bug。軟降留給 TouchPad 的 ▼ 鈕與鍵盤 ↓,
//   要快就用快速下滑(硬降)。滑鼠拖曳模式(桌機、要在設定裡打開)同一天第二輪也一起拿掉,
//   兩種拖曳行為一致。`movedRef.soft` / `clearSoft` 現在只是保險絲:沒有地方再把它設成 true。
//
// Optional mouse drag mode:
//   left-drag on board   -> move the active piece under the cursor
export function usePointer({
  targetRef,
  boardRef,
  dispatch,
  enabled,
  boardWidth,
  cellSize,
  mouseDragEnabled = false,
  getCurrentPiece
}: PointerOptions): void {
  const startRef = useRef<PointerStart | null>(null);
  const movedRef = useRef<{ dx: number; dy: number; soft: boolean; targetX: number | null }>({
    dx: 0,
    dy: 0,
    soft: false,
    targetX: null
  });
  const longPressTimerRef = useRef<number | null>(null);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    if (!enabled) return;
    const el = targetRef.current;
    if (!el) return;

    const HARD_DROP_VEL = 1.6;   // px/ms
    const TAP_TIME = 200;        // ms
    const TAP_DIST = 10;         // px
    const LONG_PRESS_MS = 380;
    const ROT_DOUBLE_TAP = 280;

    let lastTapAt = 0;
    let pointerCount = 0;
    let secondaryTapped = false;

    const boardPointFromEvent = (e: PointerEvent): { col: number; row: number } | null => {
      const boardEl = boardRef?.current ?? el;
      const rect = boardEl.getBoundingClientRect();
      const cs = Math.max(8, cellSize());
      const boardPixelW = boardWidth * cs;
      const boardPixelH = BOARD_H * cs;
      const ox = Math.max(0, (rect.width - boardPixelW) / 2);
      const oy = Math.max(0, (rect.height - boardPixelH) / 2);
      const x = e.clientX - rect.left - ox;
      const y = e.clientY - rect.top - oy;

      if (x < 0 || y < 0 || x >= boardPixelW || y >= boardPixelH) return null;

      return {
        col: Math.max(0, Math.min(boardWidth - 1, Math.floor(x / cs))),
        row: Math.max(0, Math.min(BOARD_H - 1, Math.floor(y / cs)))
      };
    };

    const grabOffsetFor = (piece: Piece | null, col: number, row: number): number => {
      if (!piece) return 1;

      const cells = blocksOf(piece.type, piece.rotation);
      for (const [dx, dy] of cells) {
        if (piece.x + dx === col && piece.y + dy - BUFFER_H === row) return dx;
      }

      const xs = cells.map(([dx]) => dx);
      return Math.floor((Math.min(...xs) + Math.max(...xs)) / 2);
    };

    const moveMouseDragTo = (e: PointerEvent, grabOffsetX: number) => {
      const point = boardPointFromEvent(e);
      if (!point) return;

      const targetX = point.col - grabOffsetX;
      if (movedRef.current.targetX === targetX) return;

      movedRef.current.targetX = targetX;
      dispatchRef.current({ type: 'moveTo', x: targetX });
    };

    const clearSoft = () => {
      if (movedRef.current.soft) {
        dispatchRef.current({ type: 'softDrop', on: false });
        movedRef.current.soft = false;
      }
    };

    const clearLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isInteractiveTarget(e.target)) return;

      if (mouseDragEnabled && e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        const point = boardPointFromEvent(e);
        if (!point) return;

        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const grabOffsetX = grabOffsetFor(getCurrentPiece?.() ?? null, point.col, point.row);
        startRef.current = {
          x: e.clientX,
          y: e.clientY,
          t: performance.now(),
          lastX: e.clientX,
          lastY: e.clientY,
          mode: 'mouseDrag',
          grabOffsetX
        };
        movedRef.current = { dx: 0, dy: 0, soft: false, targetX: null };
        moveMouseDragTo(e, grabOffsetX);
        return;
      }

      pointerCount++;
      if (pointerCount === 2) {
        secondaryTapped = true;
        dispatchRef.current({ type: 'hold' });
        startRef.current = null;
        clearSoft();
        clearLongPress();
        return;
      }

      el.setPointerCapture(e.pointerId);
      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        lastX: e.clientX,
        lastY: e.clientY,
        mode: 'gesture',
        grabOffsetX: 0
      };
      movedRef.current = { dx: 0, dy: 0, soft: false, targetX: null };
      secondaryTapped = false;

      longPressTimerRef.current = window.setTimeout(() => {
        if (startRef.current) {
          const dx = Math.abs(startRef.current.lastX - startRef.current.x);
          const dy = Math.abs(startRef.current.lastY - startRef.current.y);
          if (dx < TAP_DIST && dy < TAP_DIST) {
            dispatchRef.current({ type: 'hold' });
            startRef.current = null;
          }
        }
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (e: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;

      s.lastX = e.clientX;
      s.lastY = e.clientY;
      const cs = Math.max(8, cellSize());
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;

      if (s.mode === 'mouseDrag') {
        e.preventDefault();
        moveMouseDragTo(e, s.grabOffsetX);
        // 滑鼠拖曳同樣不開軟降(0921 第二輪,使用者拍板兩種拖曳一致)。
        movedRef.current.dy = dy;
        return;
      }

      const targetDx = Math.trunc(dx / cs);
      while (movedRef.current.dx < targetDx) {
        dispatchRef.current({ type: 'move', dx: 1 });
        movedRef.current.dx++;
      }
      while (movedRef.current.dx > targetDx) {
        dispatchRef.current({ type: 'move', dx: -1 });
        movedRef.current.dx--;
      }

      // 向下拖曳只記距離(給放手時判斷是不是硬降的快滑),不開軟降 —— 見檔頭說明。
      movedRef.current.dy = dy;

      if (Math.abs(dx) > TAP_DIST || Math.abs(dy) > TAP_DIST) {
        clearLongPress();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointerCount = Math.max(0, pointerCount - 1);
      clearLongPress();

      const s = startRef.current;
      clearSoft();
      if (!s || secondaryTapped) {
        startRef.current = null;
        return;
      }
      if (s.mode === 'mouseDrag') {
        startRef.current = null;
        return;
      }

      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const dt = performance.now() - s.t;
      const vy = dy / Math.max(1, dt);

      const dist = Math.hypot(dx, dy);
      if (dist < TAP_DIST && dt < TAP_TIME) {
        const now = performance.now();
        if (now - lastTapAt < ROT_DOUBLE_TAP) {
          dispatchRef.current({ type: 'rotate', dir: -1 });
          lastTapAt = 0;
        } else {
          dispatchRef.current({ type: 'rotate', dir: 1 });
          lastTapAt = now;
        }
      } else if (vy > HARD_DROP_VEL && dy > 60) {
        dispatchRef.current({ type: 'hardDrop' });
      }
      startRef.current = null;
    };

    const onPointerCancel = () => {
      pointerCount = 0;
      clearLongPress();
      clearSoft();
      startRef.current = null;
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [enabled, targetRef, boardRef, boardWidth, cellSize, mouseDragEnabled, getCurrentPiece]);
}
