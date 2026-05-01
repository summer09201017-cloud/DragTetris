import { useEffect, useRef, useState, useCallback } from 'react';
import { useGame } from './store';
import { useKeyboard } from './input/useKeyboard';
import { usePointer } from './input/usePointer';
import { renderBoard } from './render/renderBoard';
import { Hud } from './components/Hud';
import { HoldBox, NextBox } from './components/Mini';
import { SettingsPanel } from './components/SettingsPanel';
import { TouchPad } from './components/TouchPad';
import { audio } from './audio/AudioManager';
import { BOARD_W, BOARD_H, COLORS } from './game/constants';
import { blocksOf } from './game/pieces';
import type { PieceType } from './game/types';
import { registerPwa } from './pwa';

type TraySource = 'hold' | 'next';
type TrayDrag = { source: TraySource; type: PieceType; pointerId: number; x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pieceBounds(type: PieceType) {
  const cells = blocksOf(type, 0);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function boardPointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const cell = Math.max(8, Math.floor(Math.min(rect.width / BOARD_W, rect.height / BOARD_H)));
  const boardW = cell * BOARD_W;
  const boardH = cell * BOARD_H;
  const ox = Math.max(0, (rect.width - boardW) / 2);
  const oy = Math.max(0, (rect.height - boardH) / 2);
  const x = clientX - rect.left - ox;
  const y = clientY - rect.top - oy;

  if (x < 0 || y < 0 || x >= boardW || y >= boardH) return null;

  return {
    col: clamp(Math.floor(x / cell), 0, BOARD_W - 1),
    row: clamp(Math.floor(y / cell), 0, BOARD_H - 1)
  };
}

function dropOrigin(type: PieceType, col: number, row: number) {
  const bounds = pieceBounds(type);
  const anchorX = Math.round((bounds.minX + bounds.maxX) / 2);
  const anchorY = Math.round((bounds.minY + bounds.maxY) / 2);

  return {
    x: clamp(col - anchorX, -bounds.minX, BOARD_W - 1 - bounds.maxX),
    y: clamp(row - anchorY, -bounds.minY, BOARD_H - 1 - bounds.maxY)
  };
}

function FloatingPiece({ drag }: { drag: TrayDrag }) {
  const bounds = pieceBounds(drag.type);
  const cell = 22;
  const width = (bounds.maxX - bounds.minX + 1) * cell;
  const height = (bounds.maxY - bounds.minY + 1) * cell;

  return (
    <div
      className="floating-piece"
      style={{ left: drag.x, top: drag.y, width, height }}
      aria-hidden="true"
    >
      {blocksOf(drag.type, 0).map(([x, y], index) => (
        <span
          key={`${x}-${y}-${index}`}
          className="floating-piece-cell"
          style={{
            left: (x - bounds.minX) * cell,
            top: (y - bounds.minY) * cell,
            width: cell,
            height: cell,
            background: COLORS[drag.type]
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const state = useGame((s) => s.state);
  const toast = useGame((s) => s.toast);
  const dispatch = useGame((s) => s.dispatch);
  const tick = useGame((s) => s.tick);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardHeightScale = 1.3 * 1.2;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const [trayDrag, setTrayDrag] = useState<TrayDrag | null>(null);
  const [mouseDragEnabled, setMouseDragEnabled] = useState(() => {
    try {
      return window.localStorage.getItem('tetris.mouseDragEnabled') === '1';
    } catch {
      return false;
    }
  });

  // Register service worker once
  useEffect(() => {
    try { registerPwa(); } catch { /* dev mode */ }
  }, []);

  // Game loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      tick(dt);
      if (canvasRef.current) renderBoard(canvasRef.current, useGame.getState().state);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  useKeyboard({ dispatch, enabled: state.status !== 'gameover' });

  useEffect(() => {
    try {
      window.localStorage.setItem('tetris.mouseDragEnabled', mouseDragEnabled ? '1' : '0');
    } catch {
      // localStorage can be unavailable in hardened browser modes.
    }
  }, [mouseDragEnabled]);

  const cellSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return 24;
    return Math.floor(Math.min(c.clientWidth / BOARD_W, c.clientHeight / BOARD_H));
  }, []);

  const getCurrentPiece = useCallback(() => useGame.getState().state.current, []);

  usePointer({
    targetRef: stageRef,
    boardRef: canvasRef,
    dispatch,
    enabled: state.status === 'playing',
    cellSize,
    mouseDragEnabled,
    getCurrentPiece
  });

  const togglePause = useCallback(() => {
    dispatch({ type: 'pauseToggle' });
  }, [dispatch]);

  const restart = useCallback(() => {
    dispatch({ type: 'restart' });
    audio.startBgm();
  }, [dispatch]);

  const startTrayDrag = useCallback((source: TraySource, type: PieceType, event: React.PointerEvent) => {
    if (state.status !== 'playing') return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTrayDrag({ source, type, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }, [state.status]);

  const dropTrayPiece = useCallback((drag: TrayDrag, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = boardPointFromClient(canvas, clientX, clientY);
    if (!point) return;

    const origin = dropOrigin(drag.type, point.col, point.row);
    dispatch({
      type: 'placePiece',
      source: drag.source,
      piece: drag.type,
      x: origin.x,
      y: origin.y
    });
  }, [dispatch]);

  useEffect(() => {
    if (!trayDrag) return;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== trayDrag.pointerId) return;
      event.preventDefault();
      setTrayDrag((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== trayDrag.pointerId) return;
      event.preventDefault();
      dropTrayPiece(trayDrag, event.clientX, event.clientY);
      setTrayDrag(null);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === trayDrag.pointerId) setTrayDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerCancel);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [dropTrayPiece, trayDrag]);

  const startAudio = useCallback(async () => {
    if (audioStarted) return;
    await audio.resume();
    audio.startBgm();
    setAudioStarted(true);
  }, [audioStarted]);

  // Pause BGM on tab hide
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        audio.stopBgm();
        if (state.status === 'playing') dispatch({ type: 'pause' });
      } else if (audioStarted && state.status !== 'gameover') {
        audio.startBgm();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [audioStarted, state.status, dispatch]);

  return (
    <div className="app" onPointerDownCapture={startAudio} onKeyDownCapture={startAudio}>
      <header className="app-header">
        <h1>俄羅斯方塊 TETRIS</h1>
      </header>

      <div className="layout">
        <Hud state={state} />

        <div className="side-controls side-controls-left">
          <button type="button" onClick={togglePause} disabled={state.status === 'gameover'}>
            {state.status === 'paused' ? '繼續' : '暫停'}
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>設定</button>
        </div>

        <div className="side-controls side-controls-right">
          <button
            type="button"
            className={mouseDragEnabled ? 'toggle active' : 'toggle'}
            aria-pressed={mouseDragEnabled}
            title="開啟後，可用滑鼠在棋盤上拖曳目前方塊"
            onClick={() => setMouseDragEnabled((v) => !v)}
          >
            滑鼠拖曳 {mouseDragEnabled ? '開' : '關'}
          </button>
          <button type="button" onClick={restart}>重啟</button>
        </div>

        <div className="panel-left">
          <HoldBox piece={state.hold} locked={!state.canHold} onPieceDragStart={startTrayDrag} />
        </div>

        <div className={mouseDragEnabled ? 'stage mouse-drag-enabled' : 'stage'} ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="board-canvas"
            aria-label="俄羅斯方塊棋盤"
            style={{
              height: `min(100%, calc((100dvh - 170px) * ${boardHeightScale}))`,
              width: 'auto',
              maxWidth: '100%',
              aspectRatio: `${BOARD_W} / ${BOARD_H}`
            }}
          />
          {toast && <div className="toast">{toast}</div>}
          {state.status === 'paused' && (
            <div className="overlay">
              <div className="panel">
                <h2>暫停</h2>
                <p>遊戲已暫停</p>
                <div className="row">
                  <button type="button" onClick={() => dispatch({ type: 'resume' })}>繼續</button>
                  <button type="button" onClick={restart}>重新開始</button>
                </div>
              </div>
            </div>
          )}
          {state.status === 'gameover' && (
            <div className="overlay">
              <div className="panel">
                <h2>GAME OVER</h2>
                <p>分數 {state.score.toLocaleString()} ・ 等級 {state.level} ・ 行數 {state.lines}</p>
                <div className="row">
                  <button type="button" onClick={restart}>再玩一局</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel-right">
          <NextBox queue={state.queue} onPieceDragStart={startTrayDrag} />
        </div>

        <TouchPad dispatch={dispatch} />
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {trayDrag && <FloatingPiece drag={trayDrag} />}
    </div>
  );
}
