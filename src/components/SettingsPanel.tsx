import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioManager';
import { BOARD_WIDTH_OPTIONS } from '../game/constants';
import type { GameMode } from '../game/types';
import { SKINS, SKIN_IDS, type SkinId } from '../skins';
import type { Puzzle } from '../puzzles';
import { appVersion, openVersionSheet } from '../appVersion';

const TIER_NAMES: Record<Puzzle['tier'], string> = {
  warmup: '暖身',
  standard: '標準',
  challenge: '挑戰'
};

/** 三種拖曳放置規則。順序 = 由淺入深,預設落在第一個。 */
const MODE_OPTIONS: ReadonlyArray<{ id: GameMode; name: string; note: string }> = [
  { id: 'gravity',  name: '經典重力', note: '拖到哪一欄就自動落到底,規則跟原版俄羅斯方塊一樣。' },
  { id: 'support',  name: '塞縫',     note: '放在指定位置不下墜,但底下至少要有一格踩得到東西。' },
  { id: 'creative', name: '自由建造', note: '放哪就哪,可以懸空蓋平台。沙盒模式,不列入紀錄。' }
];

interface Props {
  open: boolean;
  boardWidth: number;
  mode: GameMode;
  challengeKind: 'free' | 'daily' | 'seed';
  challengeSeedText: string;
  today: string;
  skin: SkinId;
  puzzleSet: (Puzzle | null)[] | null;
  puzzleSolvedIds: string[];
  onSkinChange: (id: SkinId) => void;
  onOpenPuzzles: () => void;
  onStartPuzzle: (index: number) => void;
  onStartDaily: () => void;
  onLeaveChallenge: () => void;
  onBoardWidthChange: (width: number) => void;
  onModeChange: (mode: GameMode) => void;
  onClose: () => void;
  /** 再叫出一次「怎麼玩」說明卡(第一次開啟會自動出現)。 */
  onShowIntro: () => void;
}

export function SettingsPanel({
  open,
  boardWidth,
  mode,
  challengeKind,
  challengeSeedText,
  today,
  skin,
  puzzleSet,
  puzzleSolvedIds,
  onSkinChange,
  onOpenPuzzles,
  onStartPuzzle,
  onStartDaily,
  onLeaveChallenge,
  onBoardWidthChange,
  onModeChange,
  onClose,
  onShowIntro
}: Props) {
  const [s, setS] = useState(audio.getSettings());

  useEffect(() => {
    return audio.subscribe(setS);
  }, []);

  // ⌨ Esc 關閉 —— 0916 手機體檢抓到「打開設定就出不來」(橫向時「關閉」鈕
  //   在螢幕外兩個畫面高的地方),鍵盤這條是桌機的第二條退路。
  //   手機的退路是下面那顆 sticky 的 ✕(永遠在面板頂端看得到)。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const solved = new Set(puzzleSolvedIds);

  return (
    <div className="settings" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>設定</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="關閉設定">✕</button>
        </div>

        {/* 怎麼玩 + 版本與更新紀錄放在**最上面**(0916 使用者實機回報「沒有簡歷」:
            原本排在最後面,手機上要捲過大半個面板才看得到,等於沒有)。
            1113 v4.6 起標題列也常駐一顆「版本 … · 更新紀錄」鈕,這裡是第二個入口;
            兩邊的版號都從 index.html 的 APP_VERSIONS 讀(appVersion()),不另寫一份。 */}
        <div className="field about-field">
          <button type="button" className="wide-btn" onClick={onShowIntro}>
            📖 怎麼玩
          </button>
          <label>
            <span>版本</span>
            <span id="settingsVer">{appVersion()}</span>
          </label>
          <button type="button" className="wide-btn" onClick={openVersionSheet}>
            更新紀錄
          </button>
        </div>

        <div className="field">
          <label>
            <span>🎨 主題皮膚</span>
            <span>{SKINS[skin]?.label ?? '經典街機'}</span>
          </label>
          <div className="segmented skin-options" role="group" aria-label="主題皮膚">
            {SKIN_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={skin === id ? 'active' : ''}
                aria-pressed={skin === id}
                onClick={() => onSkinChange(id)}
              >
                {SKINS[id].label}
              </button>
            ))}
          </div>
          <p className="field-note">
            聖經皮把方塊換成石頭與泥磚，消行時出現和合本經文（每一句都查過出處）。
            玩法完全一樣，隨時可以切回來，也不會影響紀錄。
          </p>
        </div>

        <div className="field">
          <label>
            <span>🧩 每日殘局</span>
            <span>{today}</span>
          </label>
          {puzzleSet ? (
            <>
              <div className="segmented puzzle-options" role="group" aria-label="今日殘局">
                {puzzleSet.map((puzzle, index) => (
                  <button
                    key={puzzle?.id ?? `empty-${index}`}
                    type="button"
                    disabled={!puzzle}
                    className={puzzle && solved.has(puzzle.id) ? 'active' : ''}
                    onClick={() => onStartPuzzle(index)}
                  >
                    {puzzle ? TIER_NAMES[puzzle.tier] : '—'}
                    {puzzle && solved.has(puzzle.id) ? ' ✓' : ''}
                  </button>
                ))}
              </div>
              <p className="field-note">
                今天三題，全世界同一組。把盤面清乾淨就過關 ——
                方塊只有那幾顆，放錯就清不掉，可以按「悔一步」或重來。
              </p>
            </>
          ) : (
            <>
              <button type="button" className="wide-btn" onClick={onOpenPuzzles}>
                看今天的三題
              </button>
              <p className="field-note">
                固定用「塞縫」規則出題 —— 這一款才做得出「只有拖曳塞得進去」的洞。
              </p>
            </>
          )}
        </div>

        <div className="field">
          <label>
            <span>每日挑戰</span>
            <span>{challengeKind === 'daily' ? today : challengeKind === 'seed' ? `#${challengeSeedText}` : '未開始'}</span>
          </label>
          {challengeKind === 'free' ? (
            <>
              <button type="button" className="wide-btn" onClick={onStartDaily}>
                開始今日挑戰
              </button>
              <p className="field-note">
                全世界同一天拿到同一串方塊,比誰分數高。每天換一題。
              </p>
            </>
          ) : (
            <>
              <button type="button" className="wide-btn" onClick={onLeaveChallenge}>
                離開挑戰,回自由練習
              </button>
              <p className="field-note">
                題號 <b>#{challengeSeedText}</b> ——
                把網址整串傳給別人,或請他們在網址加 <code>?seed={challengeSeedText}</code>,就是同一副牌。
              </p>
            </>
          )}
        </div>

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

        <div className="field">
          <label>
            <span>音樂</span>
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
            <span>音效</span>
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

        {/* ⚠ 說明要跟程式一致(1113 審查 3.1):v4.4 起拖曳**不會**加速往下(usePointer.ts 檔頭),
            加速只靠下排 ▼ 鈕與鍵盤 ↓;很快往下一滑才是直接落到底。 */}
        <div className="help">
          <strong style={{ color: 'var(--text)' }}>手機操作</strong><br />
          左右拖 → 方塊跟著左右移動<br />
          很快往下一滑 → 直接落到底<br />
          要加速往下 → 按住下排的 ▼<br />
          點一下 → 轉向（也可以按下排的 ⟲ ⟳）<br />
          按住不動或兩指一起點 → 保留這一顆<br />
          <b>點一下「保留」「下一個」裡的方塊 → 轉 90 度</b>，再拖到棋盤上就照那個方向放
          <br /><br />
          <strong style={{ color: 'var(--text)' }}>電腦鍵盤</strong><br />
          <kbd>←</kbd> <kbd>→</kbd> 移動，<kbd>↓</kbd> 加速，<kbd>空白鍵</kbd> 直接落到底<br />
          <kbd>↑</kbd> / <kbd>X</kbd> 右轉，<kbd>Z</kbd> 左轉<br />
          <kbd>C</kbd> 保留，<kbd>P</kbd> 暫停／繼續，<kbd>R</kbd> 重新開始<br />
          打開「滑鼠拖曳」後，可以用滑鼠在棋盤上拖著方塊走<br />
          拖「保留」「下一個」的方塊時，按 ↑ / X / Z 可以邊拖邊轉向
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
          <button onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  );
}
