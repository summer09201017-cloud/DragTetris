import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioManager';
import { BOARD_WIDTH_OPTIONS } from '../game/constants';
import type { GameMode } from '../game/types';

/** 三種拖曳放置規則。順序 = 由淺入深,預設落在第一個。 */
const MODE_OPTIONS: ReadonlyArray<{ id: GameMode; name: string; note: string }> = [
  { id: 'gravity',  name: '經典重力', note: '拖到哪一欄就自動落到底,規則跟原版俄羅斯方塊一樣。' },
  { id: 'support',  name: '塞縫',     note: '放在指定位置不下墜,但底下至少要有一格踩得到東西。' },
  { id: 'creative', name: '自由建造', note: '放哪就哪,可以懸空蓋平台。沙盒模式,不列入紀錄。' }
];

/**
 * 版號與改版簡歷住在 index.html（跟全艦隊其他站一致，不進 bundle），
 * 這裡只是把它的入口接出來。拿不到就退化，不能拋錯。
 */
function appVersion(): string {
  const v = (window as unknown as { __appVersion?: string }).__appVersion;
  return v ?? '—';
}

function openVersionSheet(): void {
  const fn = (window as unknown as { __openVersionSheet?: () => void }).__openVersionSheet;
  fn?.();
}

interface Props {
  open: boolean;
  boardWidth: number;
  mode: GameMode;
  onBoardWidthChange: (width: number) => void;
  onModeChange: (mode: GameMode) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, boardWidth, mode, onBoardWidthChange, onModeChange, onClose }: Props) {
  const [s, setS] = useState(audio.getSettings());

  useEffect(() => {
    return audio.subscribe(setS);
  }, []);

  if (!open) return null;

  return (
    <div className="settings" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2>設定</h2>

        <div className="field">
          <label>
            <span>拖曳放置規則</span>
            <span>{MODE_OPTIONS.find((m) => m.id === mode)?.name}</span>
          </label>
          <div className="segmented mode-options" role="group" aria-label="拖曳放置規則">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={mode === m.id ? 'active' : ''}
                aria-pressed={mode === m.id}
                onClick={() => {
                  if (m.id === mode) return;
                  if (window.confirm(`切換成「${m.name}」會重新開始一局,確定嗎?`)) onModeChange(m.id);
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
          <p className="field-note">{MODE_OPTIONS.find((m) => m.id === mode)?.note}</p>
          <p className="field-note">三種規則各自獨立記錄最高分。</p>
        </div>

        <div className="field">
          <label>
            <span>棋盤欄數</span>
            <span>{boardWidth} 欄</span>
          </label>
          <div className="segmented board-width-options" role="group" aria-label="棋盤欄數">
            {BOARD_WIDTH_OPTIONS.map((width) => (
              <button
                key={width}
                type="button"
                className={boardWidth === width ? 'active' : ''}
                aria-pressed={boardWidth === width}
                onClick={() => {
                  if (width === boardWidth) return;
                  if (window.confirm(`切換成 ${width} 欄會重新開始一局,確定嗎?`)) onBoardWidthChange(width);
                }}
              >
                {width} 欄
              </button>
            ))}
          </div>
          <p className="field-note">每種欄數各自獨立記錄最高分。</p>
        </div>

        <div className="field about-field">
          <label>
            <span>版本</span>
            <span id="settingsVer">{appVersion()}</span>
          </label>
          <button type="button" className="wide-btn" onClick={openVersionSheet}>
            看改版簡歷
          </button>
          <p className="field-note">右下角的小字只是標示，不搶遊戲操作。</p>
        </div>

        <div className="field">
          <label>
            <span>背景音樂 BGM</span>
            <span>{s.bgmMuted ? '靜音' : `${Math.round(s.bgmVolume * 100)}%`}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(s.bgmVolume * 100)}
            onChange={(e) => audio.setBgmVolume(Number(e.target.value) / 100)}
          />
          <button style={{ marginTop: 6, width: '100%' }} onClick={() => audio.toggleBgmMute()}>
            {s.bgmMuted ? '取消靜音' : '靜音'}
          </button>
        </div>

        <div className="field">
          <label>
            <span>音效 SFX</span>
            <span>{s.sfxMuted ? '靜音' : `${Math.round(s.sfxVolume * 100)}%`}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(s.sfxVolume * 100)}
            onChange={(e) => audio.setSfxVolume(Number(e.target.value) / 100)}
          />
          <button style={{ marginTop: 6, width: '100%' }} onClick={() => audio.toggleSfxMute()}>
            {s.sfxMuted ? '取消靜音' : '靜音'}
          </button>
        </div>

        <div className="help">
          <strong style={{ color: 'var(--text)' }}>桌機操作</strong><br />
          <kbd>←</kbd> <kbd>→</kbd> 移動，<kbd>↓</kbd> 軟降，<kbd>Space</kbd> 硬降<br />
          <kbd>↑</kbd> / <kbd>X</kbd> 順時針，<kbd>Z</kbd> 逆時針<br />
          <kbd>C</kbd> Hold，<kbd>P</kbd> 暫停/繼續，<kbd>R</kbd> 重啟<br />
          開啟「滑鼠拖曳」後，可在棋盤上拖曳目前方塊
          <br /><br />
          <strong style={{ color: 'var(--text)' }}>手機操作</strong><br />
          水平拖曳 → 左右移動<br />
          下拖曳 → 軟降，快速下滑 → 硬降<br />
          點一下 → 旋轉，雙擊 → 反向旋轉<br />
          長按或雙指 → Hold
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
          <button onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
