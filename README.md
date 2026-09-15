# 俄羅斯方塊 PWA (Tetris)

Vite + React + TypeScript 的俄羅斯方塊 PWA，桌機鍵盤、手機觸控拖曳通用。可安裝到手機主畫面、離線可玩。

## 功能

- **遊戲核心** — Guideline-style：SRS 旋轉踢牆、7-bag 隨機、Hold（C 鍵）、Ghost 陰影、Lock Delay
- **計分** — Tetris、T-Spin（含 Mini）、Back-to-Back × 1.5、Combo、Perfect Clear、Soft Drop / Hard Drop 加分
- **音效** — Web Audio 合成的快樂頌（Beethoven，公有領域）+ 8-bit SFX；BGM/SFX 獨立音量
- **PWA** — manifest + service worker，可加到主畫面、離線可玩
- **手機操作** — 在棋盤上拖曳：水平移動、向下軟降、快速下滑硬降、點擊旋轉、長按/雙指 Hold
- **桌機操作** — 鍵盤 ←/→/↓/Space/↑/Z/X/C/P/R
- **三種拖曳放置規則**（各自獨立記最高分）— 經典重力（拖到哪欄就落到底）／塞縫（不下墜，但底下要有支撐）／自由建造（放哪就哪，沙盒不計分）
- **托盤拖曳可轉向** — 點一下 HOLD / NEXT 的方塊轉 90°；桌機拖曳途中 ↑ / X / Z 也能轉
- **每日挑戰** — `?daily` 今天全世界同一串方塊，`?seed=123456` 指定題號（老師報號、全班同一盤）
- **個人紀錄** — 最高分／行數／等級／Combo／Perfect Clear／局數，依「模式 × 欄數」分開記；全部只存本機
- **🧩 每日殘局**（0916）— 每天三題（暖身／標準／挑戰），把盤面清乾淨就過關。出題時就用**遊戲本身的規則**跑過一遍證明解得開
- **↩ 悔一步**（0916）— 一局 3 次，把上一顆方塊落定前的盤面整個還原。用過的那一局不列入紀錄
- **🎨 主題皮膚**（0916）— 經典街機／聖經・建造（石頭與泥磚，消行時出現和合本經文）

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

## 驗證

```bash
npm test                        # 單元測試（引擎 / 每日挑戰 / 殘局 / 皮膚）
npx tsc -b                      # 型別
npm run build

npm run preview                 # 另一個視窗
node scripts/verify-browser.mjs                                    # 真瀏覽器行為驗收
BASE=https://dragtetris.pages.dev node scripts/verify-browser.mjs  # 打線上
SHOT_DIR=shots node scripts/verify-browser.mjs                     # 順便存截圖
```

單元測試證明「規則對」，證不了「畫面上做得到」——`scripts/verify-browser.mjs` 會真的點下去，
抓得到「按了沒反應」這種測試全綠也看不到的病（0915 實錄：一個半透明的角落徽章蓋住按鈕右下角）。

## 維護鐵則（動手前先看這幾條）

- **經文零容忍** — `src/skins.ts` 每一句 `verse` 都是用 cuv MCP（和合本）逐句查過的原文，
  畫面上的 `show` 一定是 `verse` 的**逐字子字串**。要加經文請先查 `/cuv-check` 或
  `mcp__cuv__lookup`，**不可以憑記憶打**。`src/skins.test.ts` 有一條在守這件事。
- **殘局的可解性要機器證** — `src/puzzles.ts` 生題（把長方形用方塊鋪滿再挖幾塊），
  `src/puzzleSolver.ts` **用遊戲本身的 `reduce` 實跑一遍**證明解得開；驗不過就換種子，
  全部失敗就誠實顯示「出不了題」，**絕不發一題沒驗過的**。
  不要另寫一份簡化模擬來驗——兩邊分岔的那天測試還是綠的，而玩家拿到的是一題放不進去的殘局。
- **悔一步用過就不進紀錄** — 理由同自由建造沙盒不計分：規則不一樣，混在一起比沒有意義。
  另外**遊戲結束後不給悔**：那一刻已經寫進紀錄也送出了完賽打點，復活會讓局數與最高分兩邊對不上。
- **版號只有一處** — `index.html` 的 `APP_VERSIONS`，最新的放最前面；徽章、設定面板、
  驗收腳本都從那裡讀，**不要在別的地方再寫一份**（`scripts/verify-browser.mjs` 0916 就是
  因為寫死 `'v3'` 才變成「改功能順便要改測試」）。
- **改了什麼都要重跑 `scripts/verify-browser.mjs`**，尤其動過版面、按鈕或設定面板之後。

## 部署

```bash
npm run build
npx wrangler pages deploy dist --project-name dragtetris --branch main
```

線上：<https://dragtetris.pages.dev>（大廳卡片指這裡）

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
