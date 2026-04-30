# 俄羅斯方塊 PWA (Tetris)

Vite + React + TypeScript 的俄羅斯方塊 PWA，桌機鍵盤、手機觸控拖曳通用。可安裝到手機主畫面、離線可玩。

## 功能

- **遊戲核心** — Guideline-style：SRS 旋轉踢牆、7-bag 隨機、Hold（C 鍵）、Ghost 陰影、Lock Delay
- **計分** — Tetris、T-Spin（含 Mini）、Back-to-Back × 1.5、Combo、Perfect Clear、Soft Drop / Hard Drop 加分
- **音效** — Web Audio 合成的快樂頌（Beethoven，公有領域）+ 8-bit SFX；BGM/SFX 獨立音量
- **PWA** — manifest + service worker，可加到主畫面、離線可玩
- **手機操作** — 在棋盤上拖曳：水平移動、向下軟降、快速下滑硬降、點擊旋轉、長按/雙指 Hold
- **桌機操作** — 鍵盤 ←/→/↓/Space/↑/Z/X/C/P/R

## 開發

```bash
npm install
npm run dev      # 開發模式 (http://localhost:5173)
npm run build    # 編譯 production
npm run preview  # 預覽編譯結果（PWA 在 production 才完整啟用）
```

手機測試：用 `npm run preview --host` 後從手機連 `http://<電腦IP>:4173/`。HTTPS 才能完整啟用 PWA 安裝功能；本地開發用瀏覽器把 localhost 視為安全 origin。

## 自訂音樂

預設用合成的快樂頌（無需音檔）。如要換成 mp3：
1. 把音檔放到 `public/bgm/your.mp3`
2. 修改 `src/audio/AudioManager.ts` 的 `startBgm()`，改用 `new Audio('/bgm/your.mp3')` 並設 `loop = true`
3. 把音量接到 `bgmGain`

CC0 音源建議：
- OpenGameArt: <https://opengameart.org/>（搜 chiptune / tetris / loop）
- Kenney audio packs: <https://kenney.nl/assets/category:Audio>
- FreePD (Kevin MacLeod CC0): <https://freepd.com/>

## 鍵盤對應

| 鍵 | 動作 |
|---|---|
| ← / → | 左右移動（含 DAS/ARR 自動連發）|
| ↓ | 軟降 |
| Space | 硬降 |
| ↑ / X | 順時針旋轉 |
| Z / Ctrl | 逆時針旋轉 |
| **C** / Shift | **Hold** |
| P / Esc | 暫停 |
| R | 重啟 |
