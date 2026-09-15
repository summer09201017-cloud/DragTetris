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
import { BOARD_H, COLORS } from './game/constants';
import { blocksOf } from './game/pieces';
import type { GameMode, PieceType, Rotation } from './game/types';
import { getRecord, scoresCount } from './records';
import { challengeLabel, seedLabel, todayKey } from './daily';
import { registerPwa } from './pwa';

const LOBBY_URL = 'https://hfpc-bible-games.summer09201017.workers.dev/';

type TraySource = 'hold' | 'next';
type TrayDrag = {
  source: TraySource;
  type: PieceType;
  rotation: Rotation;
  pointerId: number;
  x: number;
  y: number;
};

/** 兩個托盤各自記住自己的朝向;方塊換了就歸零。 */
type TrayRotations = Record<TraySource, Rotation>;

const ZERO_ROTATIONS: TrayRotations = { hold: 0, next: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pieceBounds(type: PieceType, rotation: Rotation = 0) {
  const cells = blocksOf(type, rotation);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function boardPointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number, boardWidth: number) {
  const rect = canvas.getBoundingClientRect();
  const cell = Math.max(8, Math.floor(Math.min(rect.width / boardWidth, rect.height / BOARD_H)));
  const boardW = cell * boardWidth;
  const boardH = cell * BOARD_H;
  const ox = Math.max(0, (rect.width - boardW) / 2);
  const oy = Math.max(0, (rect.height - boardH) / 2);
  const x = clientX - rect.left - ox;
  const y = clientY - rect.top - oy;

  if (x < 0 || y < 0 || x >= boardW || y >= boardH) return null;

  return {
    col: clamp(Math.floor(x / cell), 0, boardWidth - 1),
    row: clamp(Math.floor(y / cell), 0, BOARD_H - 1)
  };
}

function dropOrigin(
  type: PieceType,
  rotation: Rotation,
  col: number,
  row: number,
  boardWidth: number
) {
  const bounds = pieceBounds(type, rotation);
  const anchorX = Math.round((bounds.minX + bounds.maxX) / 2);
  const anchorY = Math.round((bounds.minY + bounds.maxY) / 2);

  return {
    x: clamp(col - anchorX, -bounds.minX, boardWidth - 1 - bounds.maxX),
    y: clamp(row - anchorY, -bounds.minY, BOARD_H - 1 - bounds.maxY)
  };
}

function FloatingPiece({ drag }: { drag: TrayDrag }) {
  const bounds = pieceBounds(drag.type, drag.rotation);
  const cell = 22;
  const width = (bounds.maxX - bounds.minX + 1) * cell;
  const height = (bounds.maxY - bounds.minY + 1) * cell;

  return (
    <div
      className="floating-piece"
      style={{ left: drag.x, top: drag.y, width, height }}
      aria-hidden="true"
    >
      {blocksOf(drag.type, drag.rotation).map(([x, y], index) => (
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
  const records = useGame((s) => s.records);
  const beaten = useGame((s) => s.beaten);
  const challenge = useGame((s) => s.challenge);
  const daily = useGame((s) => s.daily);
  const dailyBeaten = useGame((s) => s.dailyBeaten);
  const dispatch = useGame((s) => s.dispatch);
  const tick = useGame((s) => s.tick);
  const record = getRecord(records, state.mode, state.boardWidth);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boardHeightScale = 1.3 * 1.2;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const [trayDrag, setTrayDrag] = useState<TrayDrag | null>(null);
  const [trayRotations, setTrayRotations] = useState<TrayRotations>(ZERO_ROTATIONS);
  const [mouseDragEnabled, setMouseDragEnabled] = useState(() => {
    try {
      return window.localStorage.getItem('tetris.mouseDragEnabled') === '1';
    } catch {
      return false;
    }
  });

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Register service worker once
  useEffect(() => {
    try { registerPwa(); } catch { /* dev mode */ }
  }, []);

  // ⛶ 全螢幕(game-must-haves)。iOS Safari 沒有 Element.requestFullscreen ⇒
  // 按鈕在那裡會失敗,所以只在瀏覽器真的支援時才顯示這顆鈕。
  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      // 使用者手勢外呼叫 / 不支援 ⇒ 靜默,不要弄壞遊戲。
    }
  }, []);

  // ← 返回大廳:離開前先問一次,不然玩到一半誤觸就整局沒了。
  const backToLobby = useCallback(() => {
    const playing = useGame.getState().state.status === 'playing';
    if (playing && !window.confirm('離開這一關回大廳?本局進度不會保留。')) return;
    window.location.href = LOBBY_URL;
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

  // ★ 托盤裡的方塊換人了就把朝向歸零。
  //   不歸零的話，上一顆轉好的角度會套到下一顆身上 —— 畫面確實會照那個角度畫，
  //   所以不會壞掉、也不會報錯，只是使用者每次都得先轉回來，像是「它自己亂轉」。
  const headNext = state.queue[0] ?? null;
  useEffect(() => {
    setTrayRotations((r) => (r.next === 0 ? r : { ...r, next: 0 }));
  }, [headNext]);
  useEffect(() => {
    setTrayRotations((r) => (r.hold === 0 ? r : { ...r, hold: 0 }));
  }, [state.hold]);

  const rotateTray = useCallback((source: TraySource) => {
    setTrayRotations((r) => ({ ...r, [source]: (((r[source] + 1) % 4) as Rotation) }));
  }, []);

  const cellSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return 24;
    return Math.floor(Math.min(c.clientWidth / state.boardWidth, c.clientHeight / BOARD_H));
  }, [state.boardWidth]);

  const getCurrentPiece = useCallback(() => useGame.getState().state.current, []);

  usePointer({
    targetRef: stageRef,
    boardRef: canvasRef,
    dispatch,
    enabled: state.status === 'playing',
    boardWidth: state.boardWidth,
    cellSize,
    mouseDragEnabled,
    getCurrentPiece
  });

  const togglePause = useCallback(() => {
    dispatch({ type: 'pauseToggle' });
  }, [dispatch]);

  // ★ 重開一局要把挑戰的種子帶回去,否則「同一題」當場換了一副牌。
  const challengeSeed = challenge.kind === 'free' ? undefined : challenge.seed;
  const restart = useCallback(() => {
    dispatch({ type: 'restart', seed: challengeSeed });
    audio.startBgm();
  }, [dispatch, challengeSeed]);

  // 進 / 離開挑戰都要換網址再整頁重來 —— 種子是在開頁時解析的,
  // 只改 state 的話網址跟實際玩的題目會對不起來(分享出去的連結就是錯的)。
  const goDaily = useCallback(() => {
    window.location.search = '?daily';
  }, []);
  const goFree = useCallback(() => {
    window.location.search = '';
  }, []);

  const startTrayDrag = useCallback((
    source: TraySource,
    type: PieceType,
    rotation: Rotation,
    event: React.PointerEvent
  ) => {
    if (state.status !== 'playing') return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTrayDrag({ source, type, rotation, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }, [state.status]);

  const dropTrayPiece = useCallback((drag: TrayDrag, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = boardPointFromClient(canvas, clientX, clientY, state.boardWidth);
    if (!point) return;

    const origin = dropOrigin(drag.type, drag.rotation, point.col, point.row, state.boardWidth);
    dispatch({
      type: 'placePiece',
      source: drag.source,
      piece: drag.type,
      rotation: drag.rotation,
      x: origin.x,
      y: origin.y
    });
  }, [dispatch, state.boardWidth]);

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

    // 拖曳途中用鍵盤轉向（桌機）。手機是「拖之前先點一下托盤」。
    const onKeyDown = (event: KeyboardEvent) => {
      const dir = ['ArrowUp', 'x', 'X'].includes(event.key) ? 1
        : ['z', 'Z', 'Control'].includes(event.key) ? -1
        : 0;
      if (!dir) return;
      event.preventDefault();
      setTrayDrag((cur) => cur ? { ...cur, rotation: (((cur.rotation + dir + 4) % 4) as Rotation) } : cur);
      setTrayRotations((r) => ({
        ...r,
        [trayDrag.source]: (((trayDrag.rotation + dir + 4) % 4) as Rotation)
      }));
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: false });
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
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
        <button type="button" className="header-btn" onClick={backToLobby} title="返回大廳">
          ← 大廳
        </button>
        <h1>俄羅斯方塊 TETRIS</h1>
        {fullscreenSupported && (
          <button
            type="button"
            className="header-btn"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? '離開全螢幕' : '全螢幕'}
          >
            {isFullscreen ? '⛶ 離開' : '⛶'}
          </button>
        )}
      </header>

      <div className="layout">
        <div className="hud-stack">
          {challengeLabel(challenge) && (
            <div className="challenge-bar">
              <span className="challenge-tag">{challengeLabel(challenge)}</span>
              {daily && daily.plays > 0 && (
                <span className="challenge-best">今日最佳 {daily.best.toLocaleString()}</span>
              )}
            </div>
          )}
          <Hud state={state} record={record} />
        </div>

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
          <HoldBox
            piece={state.hold}
            locked={!state.canHold}
            rotation={trayRotations.hold}
            onPieceDragStart={startTrayDrag}
            onRotate={rotateTray}
          />
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
              aspectRatio: `${state.boardWidth} / ${BOARD_H}`
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
                {beaten && (beaten.score || beaten.lines || beaten.level || beaten.maxCombo) && (
                  <p className="new-best">🎉 新紀錄!</p>
                )}
                {challenge.kind === 'daily' && (
                  <p className="field-note">
                    {dailyBeaten ? '📅 今日挑戰新高!' : '📅 今日挑戰'}
                    {daily ? ` ・ 今日最佳 ${daily.best.toLocaleString()}(第 ${daily.plays} 次)` : ''}
                  </p>
                )}
                <p>分數 {state.score.toLocaleString()} ・ 等級 {state.level} ・ 行數 {state.lines}</p>
                {scoresCount(state.mode) ? (
                  <dl className="record-list">
                    <div><dt>最高分</dt><dd>{record.score.toLocaleString()}{beaten?.score && ' ✨'}</dd></div>
                    <div><dt>最多行</dt><dd>{record.lines}{beaten?.lines && ' ✨'}</dd></div>
                    <div><dt>最高等級</dt><dd>{record.level}{beaten?.level && ' ✨'}</dd></div>
                    <div><dt>最長 Combo</dt><dd>{record.maxCombo}{beaten?.maxCombo && ' ✨'}</dd></div>
                    <div><dt>Perfect Clear</dt><dd>{record.pcCount} 次</dd></div>
                    <div><dt>已玩局數</dt><dd>{record.games}</dd></div>
                  </dl>
                ) : (
                  <p className="field-note">自由建造是沙盒模式,不列入紀錄。</p>
                )}
                <p className="field-note">紀錄依「模式 × 欄數」分開計算(目前:{state.boardWidth} 欄)。</p>
                <div className="row">
                  <button type="button" onClick={restart}>再玩一局</button>
                  <button type="button" onClick={backToLobby}>返回大廳</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel-right">
          <NextBox
            queue={state.queue}
            rotation={trayRotations.next}
            onPieceDragStart={startTrayDrag}
            onRotate={rotateTray}
          />
        </div>

        <TouchPad dispatch={dispatch} />
      </div>

      <SettingsPanel
        open={settingsOpen}
        boardWidth={state.boardWidth}
        mode={state.mode}
        challengeKind={challenge.kind}
        challengeSeedText={challenge.kind === 'free' ? '' : seedLabel(challenge.seed)}
        today={todayKey()}
        onStartDaily={goDaily}
        onLeaveChallenge={goFree}
        onBoardWidthChange={(width) => dispatch({ type: 'setBoardWidth', width, seed: challengeSeed })}
        onModeChange={(mode: GameMode) => dispatch({ type: 'setMode', mode, seed: challengeSeed })}
        onClose={() => setSettingsOpen(false)}
      />
      {trayDrag && <FloatingPiece drag={trayDrag} />}
    </div>
  );
}
