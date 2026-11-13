import { useEffect } from 'react';

/**
 * 第一次開啟時的「怎麼玩」說明卡(1113 v4.6,長輩友善審查 1.5)。
 * 本站一開頁就是對局,沒有獨立的開始畫面 ⇒ 用一張蓋住全畫面的卡片當開始畫面。
 * ★ 卡片開著的時候對局一定是暫停的(App.tsx 負責 pause / resume),不能在背後掉方塊。
 * ★ 說明要跟程式一致:拖曳**不會**加速往下(v4.4 起),加速只靠 ▼ 鈕與鍵盤 ↓。
 */
export function IntroCard({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onStart(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="introTitle">
      <div className="intro-card">
        <h2 id="introTitle">俄羅斯方塊</h2>
        <p className="intro-lead">
          把落下來的方塊排整齊，排滿一整橫排就會消掉、得分；方塊堆到最上面就結束。
          這一款還可以把旁邊「下一個」的方塊，直接拖到棋盤上想放的位置。
        </p>
        <h3>怎麼玩</h3>
        <ul className="intro-list">
          <li><b>手機</b>：在棋盤上左右拖，方塊跟著走；點一下轉向；很快往下一滑，方塊直接落到底。</li>
          <li><b>下排按鈕</b>：⟲ 左轉、⤓ 落到底、⟳ 右轉、▼ 按住加速；「保留」先把這一顆收起來，等一下再用。</li>
          <li><b>電腦鍵盤</b>：← → 移動、↑ 轉向、↓ 加速、空白鍵 落到底、C 保留、P 暫停。</li>
        </ul>
        <p className="intro-note">這張說明之後可以從「設定」→「怎麼玩」再打開。</p>
        <button type="button" className="intro-start" onClick={onStart} autoFocus>
          開始玩
        </button>
      </div>
    </div>
  );
}
