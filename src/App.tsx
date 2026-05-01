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
import { BOARD_W, BOARD_H } from './game/constants';
import { registerPwa } from './pwa';

export default function App() {
  const state = useGame((s) => s.state);
  const toast = useGame((s) => s.toast);
  const dispatch = useGame((s) => s.dispatch);
  const tick = useGame((s) => s.tick);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardWidthRatio = (BOARD_W / BOARD_H) * 1.3;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
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
        <div className="right">
          <button type="button" onClick={togglePause} disabled={state.status === 'gameover'}>
            {state.status === 'paused' ? '繼續' : '暫停'}
          </button>
          <button
            type="button"
            className={mouseDragEnabled ? 'toggle active' : 'toggle'}
            aria-pressed={mouseDragEnabled}
            title="開啟後，可用滑鼠在棋盤上拖曳目前方塊"
            onClick={() => setMouseDragEnabled((v) => !v)}
          >
            滑鼠拖曳 {mouseDragEnabled ? '開' : '關'}
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>設定</button>
          <button type="button" onClick={restart}>重啟</button>
        </div>
      </header>

      <div className="layout">
        <div className="panel-left">
          <HoldBox piece={state.hold} locked={!state.canHold} />
          <Hud state={state} />
        </div>

        <div className={mouseDragEnabled ? 'stage mouse-drag-enabled' : 'stage'} ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="board-canvas"
            aria-label="俄羅斯方塊棋盤"
            style={{
              width: `min(100%, calc((100dvh - 220px) * ${boardWidthRatio}))`,
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
          <NextBox queue={state.queue} />
        </div>

        <TouchPad dispatch={dispatch} />
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
