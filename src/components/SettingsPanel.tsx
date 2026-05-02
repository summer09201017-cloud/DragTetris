import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioManager';
import { BOARD_WIDTH_OPTIONS } from '../game/constants';

interface Props {
  open: boolean;
  boardWidth: number;
  onBoardWidthChange: (width: number) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, boardWidth, onBoardWidthChange, onClose }: Props) {
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
                onClick={() => onBoardWidthChange(width)}
              >
                {width} 欄
              </button>
            ))}
          </div>
          <p className="field-note">切換欄數會重新開始一局。</p>
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
