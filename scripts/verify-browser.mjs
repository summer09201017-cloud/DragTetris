/**
 * 真瀏覽器行為驗收(v2:三種模式 / 個人紀錄 / 大廳鈕 / 全螢幕鈕 / 版號兩件套 / 手機版面)。
 *
 * 用法:
 *   npm run preview              # 另一個視窗先起 preview
 *   node scripts/verify-browser.mjs
 *   BASE=https://dragtetris.pages.dev node scripts/verify-browser.mjs   # 打線上
 *   SHOT_DIR=<資料夾> ...                                               # 順便存截圖
 *
 * ★ 為什麼非有不可:engine 的 36 項單元測試證明「規則對」,證不了「畫面上做得到」。
 *   本輪實錄——版號簡歷那層遮罩因為 inline `display:flex` 贏過 `hidden`,一開頁就蓋住全畫面、
 *   攔截所有點擊;36 項單元測試全綠、build 也全綠,只有真的去點才看得到。
 * ★ 第二筆實錄:徽章做成可點之後,它蓋住手機下方 ⟳ 與 ▼ 兩顆鈕的下緣 ——
 *   截圖看不出來,是 elementFromPoint 量出來的 ⇒ 這支留了一項常駐檢查。
 * ★ 不用 process.exit():fetch 之後 keep-alive socket 還開著就 exit,Windows 上離開碼會亂
 *   (silent-failure #36)。一律 process.exitCode。
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4173';

/**
 * 期望的版號從 index.html 的 APP_VERSIONS[0] 讀出來,**不要寫死**。
 * 0916 實錄:這支腳本原本寫死 'v3',一改版就變成「改功能順便要改測試」——
 * 那正是 v2 當初在產品裡修掉的「版號寫死改版必漂移」,只是搬到測試裡而已。
 */
const EXPECTED_VERSION = (() => {
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const m = html.match(/\{\s*v:\s*'(v\d+)'/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
})();
const SHOT_DIR = process.env.SHOT_DIR || '';

let pass = 0;
let fail = 0;
const fails = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  × ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/** 清掉本機狀態、指定模式重開,回到乾淨起點。 */
async function reset(page, { mode = 'gravity', width = 8 } = {}) {
  await page.evaluate(({ mode, width }) => {
    try {
      localStorage.clear();
      localStorage.setItem('tetris.mode', mode);
      localStorage.setItem('tetris.boardWidth', String(width));
    } catch { /* 無痕模式 */ }
  }, { mode, width });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(450);
}

async function openSettings(page) {
  await page.locator('.side-controls button', { hasText: '設定' }).first().click();
  await page.waitForTimeout(250);
}

async function closeSettings(page) {
  // 0916 起面板頂端有一顆 sticky 的 ✕(手機體檢紅燈:橫向時底部那顆「關閉」在螢幕外
  // 將近兩個畫面高的地方,小孩點進設定就出不來)。優先用它,退路才是點背景遮罩。
  const x = page.locator('.settings-close');
  if (await x.count()) await x.click();
  else await page.locator('.settings').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch({ timeout: 60000 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // 預設 30 秒太長:這支每個「找不到就是紅燈」的判斷都不該等那麼久,疊起來像死當。
  page.setDefaultTimeout(6000);
  // ★ 導覽要分開給：6 秒對本機 preview 綽綽有餘，但打線上第一發冷請求常常不夠
  //   ⇒ 會把「網路慢」讀成「網站壞了」（實測跡過）。
  page.setDefaultNavigationTimeout(45000);

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  console.log(`\n▶ BASE = ${BASE}\n`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  // ── 1. 基本渲染
  console.log('1. 基本渲染');
  check('頁面標題正確', (await page.title()).includes('俄羅斯方塊'));
  check('棋盤 canvas 存在', await page.locator('canvas.board-canvas').count() === 1);
  check('HUD 四格都在', await page.locator('.score-cell').count() === 4);
  const bodyText = await page.locator('body').innerText();
  check('畫面上沒有 undefined / NaN / [object Object]',
    !/undefined|NaN|\[object Object\]/.test(bodyText));

  // ── 2. must-haves 按鈕
  console.log('\n2. must-haves');
  check('← 大廳鈕在', await page.locator('.header-btn', { hasText: '大廳' }).count() === 1);
  const lobbyTitle = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.header-btn')].find((x) => x.textContent.includes('大廳'));
    return b ? b.getAttribute('title') : null;
  });
  check('← 大廳鈕有 title', lobbyTitle === '返回大廳', String(lobbyTitle));
  check('⛶ 全螢幕鈕在', await page.locator('.header-btn', { hasText: '⛶' }).count() === 1);
  check('版號徽章在', await page.locator('#appVerBadge').count() === 1);
  const badgeText = await page.locator('#appVerBadge').innerText();
  check('版號徽章跟得上改版', EXPECTED_VERSION != null && badgeText.includes(EXPECTED_VERSION), `${badgeText} vs ${EXPECTED_VERSION}`);

  // ── 3. 版號兩件套:徽章只是標示,不可搶觸控
  console.log('\n3. 版號兩件套');
  check('簡歷一開頁是收起來的(hidden 要贏過 inline display)',
    !(await page.locator('#appVerSheet').isVisible()));
  const badgeSteals = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.touch-pad button, .side-controls button').forEach((btn) => {
      const r = btn.getBoundingClientRect();
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.right - 3, r.bottom - 3]];
      for (const [x, y] of pts) {
        const el = document.elementFromPoint(x, y);
        if (el && el.id === 'appVerBadge') bad.push(btn.textContent.trim());
      }
    });
    return [...new Set(bad)];
  });
  check('版號徽章沒有搶走任何按鈕的觸控', badgeSteals.length === 0, badgeSteals.join('/'));

  // ── 4. 設定面板:三種模式 + 三種欄數 + 版號簡歷
  console.log('\n4. 設定面板');
  await openSettings(page);
  check('設定面板開得起來', await page.locator('.settings .card').isVisible());
  const modeBtns = await page.locator('.mode-options button').allInnerTexts();
  check('三種模式都列出來', modeBtns.length === 3, modeBtns.join('/'));
  check('模式名稱正確',
    ['經典重力', '塞縫', '自由建造'].every((n) => modeBtns.includes(n)), modeBtns.join('/'));
  const widthBtns = await page.locator('.board-width-options button').allInnerTexts();
  check('三種欄數都列出來', widthBtns.length === 3, widthBtns.join('/'));
  const verText = await page.locator('#settingsVer').innerText();
  check('設定面板看得到版號', EXPECTED_VERSION != null && verText.includes(EXPECTED_VERSION), `${verText} vs ${EXPECTED_VERSION}`);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/settings.png` });

  await page.locator('.wide-btn', { hasText: '改版簡歷' }).click();
  await page.waitForTimeout(300);
  check('從設定開得了改版簡歷', await page.locator('#appVerSheet').isVisible());
  const entries = await page.locator('#appVerList li').count();
  check('簡歷至少兩筆', entries >= 2, `實得 ${entries}`);
  await page.locator('#appVerClose').click();
  await page.waitForTimeout(250);
  check('簡歷關得掉', !(await page.locator('#appVerSheet').isVisible()));
  await closeSettings(page);
  check('點背景收得起設定面板', await page.locator('.settings .card').count() === 0);

  // ── 5. 遊戲仍可操作
  console.log('\n5. 遊戲仍可操作');
  await reset(page, { mode: 'gravity' });
  await page.locator('canvas.board-canvas').click({ position: { x: 10, y: 10 } });
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
  check('硬降五次後畫面沒炸', (await page.locator('.score-grid').innerText()).length > 0);
  check('主控台沒有錯誤', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ── 6. 個人紀錄
  console.log('\n6. 個人紀錄');
  const recordRW = await page.evaluate(() => {
    try {
      localStorage.setItem('tetris.records.v1', JSON.stringify({ 'gravity:8': { score: 4321, games: 1 } }));
      return !!JSON.parse(localStorage.getItem('tetris.records.v1'))['gravity:8'];
    } catch { return false; }
  });
  check('紀錄鍵 tetris.records.v1 可讀寫', recordRW);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const bestCell = (await page.locator('.score-cell').nth(1).innerText()).replace(/\n/g, ' ');
  check('HUD 第二格是 BEST', bestCell.includes('BEST'), bestCell);
  check('BEST 真的讀到了存進去的 4,321', bestCell.includes('4,321'), bestCell);

  // ── 7. 自由建造:沙盒不假裝有紀錄
  console.log('\n7. 自由建造模式');
  await reset(page, { mode: 'creative' });
  const creativeCell = (await page.locator('.score-cell').nth(1).innerText()).replace(/\n/g, ' ');
  check('自由建造時第二格印模式名而不是 BEST 0',
    creativeCell.includes('自由建造'), creativeCell);

  // ── 7.5 F 拖曳可轉向
  console.log('\n7.5 拖曳可轉向');
  await reset(page, { mode: 'gravity' });
  check('托盤有「點一下轉向」提示',
    await page.locator('.mini-hint').count() >= 1);

  // ⚠ 0916 修掉一個**假紅**:自由模式的種子是時間戳,NEXT 第一顆是隨機的 ——
  //   抽到 O 的時候轉 90° 的畫面**本來就一模一樣**(O 的四個朝向相同),
  //   於是這一項每七次會無緣無故紅一次,而產品完全沒壞(0916 連跑三輪:紅、綠、綠)。
  //   改成先用 ?seed= 挑一顆不是 O 的題號,這一項才是在測「轉得動嗎」。
  let rotatable = false;
  for (let seed = 1; seed <= 12 && !rotatable; seed++) {
    await page.goto(`${BASE}?seed=${seed}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(450);
    rotatable = await page.evaluate(() => window.__state?.queue?.[0] !== 'O');
  }
  check('找得到一顆轉起來看得出差別的方塊(不是 O)', rotatable);
  const nextHead = page.locator('.next-head canvas').first();
  const shot1 = await nextHead.screenshot();
  await nextHead.click();            // 點一下 = 轉 90°
  await page.waitForTimeout(300);
  const shot2 = await nextHead.screenshot();
  check('點一下托盤方塊，畫面真的變了',
    Buffer.compare(shot1, shot2) !== 0);
  for (let i = 0; i < 3; i++) { await nextHead.click(); await page.waitForTimeout(160); }
  const shot5 = await nextHead.screenshot();
  check('轉4 次回到原本的樣子', Buffer.compare(shot1, shot5) === 0);

  // ── 7.6 G 每日挑戰
  console.log('\n7.6 每日挑戰');
  await page.goto(`${BASE}?daily`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  check('挑戰橫幅出現', await page.locator('.challenge-bar').count() === 1);
  const tag = await page.locator('.challenge-tag').innerText();
  check('橫幅寫著今日挑戰與題號',
    tag.includes('今日挑戰') && /#\d{6}/.test(tag), tag);
  const queue1 = await page.evaluate(() => {
    const c = document.querySelector('.next-head canvas');
    return c ? c.toDataURL().slice(0, 200) : null;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const queue2 = await page.evaluate(() => {
    const c = document.querySelector('.next-head canvas');
    return c ? c.toDataURL().slice(0, 200) : null;
  });
  check('重新整理拿到同一副牌（同一題才成立）',
    queue1 != null && queue1 === queue2);
  await openSettings(page);
  check('設定面板有「離開挑戰」',
    await page.locator('.wide-btn', { hasText: '離開挑戰' }).count() === 1);
  await closeSettings(page);

  await page.goto(`${BASE}?seed=123456`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const seedTag = await page.locator('.challenge-tag').innerText();
  check('?seed=123456 認得出來', seedTag.includes('123456'), seedTag);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  check('自由練習時沒有挑戰橫幅', await page.locator('.challenge-bar').count() === 0);

  // ── 8. 手機版面
  console.log('\n8. 手機版面');
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 740 });
    await reset(page, { mode: 'gravity' });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${w}px 不橫向溢出`, overflow <= 0, `溢出 ${overflow}px`);
    const box = await page.locator('canvas.board-canvas').boundingBox();
    check(`${w}px 棋盤看得到`, box && box.width > 60 && box.height > 100,
      box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'null');
    const steals = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('.touch-pad button').forEach((btn) => {
        const r = btn.getBoundingClientRect();
        for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.right - 3, r.bottom - 3]]) {
          const el = document.elementFromPoint(x, y);
          if (el && el.id === 'appVerBadge') bad.push(btn.textContent.trim());
        }
      });
      return [...new Set(bad)];
    });
    check(`${w}px 徽章沒壓住操作鈕`, steals.length === 0, steals.join('/'));
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/mobile-${w}.png` });
  }

  // ── 9. 0916 新功能:悔一步 / 每日殘局 / 聖經皮膚
  console.log('\n9. 悔一步 / 每日殘局 / 聖經皮膚');
  await page.setViewportSize({ width: 430, height: 860 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await reset(page, { mode: 'gravity' });

  // 9.1 悔一步
  const undoBtn = page.locator('.undo-btn');
  check('悔一步鈕在', await undoBtn.count() === 1);
  check('一開局悔不了(還沒有任何方塊落定)', await undoBtn.isDisabled());
  check('悔棋次數一開始是 3', (await undoBtn.innerText()).includes('3'));

  await page.locator('canvas.board-canvas').click();
  await page.keyboard.press('Space');            // 硬降一顆 ⇒ 產生一次 lock
  await page.waitForTimeout(250);
  check('落定一顆之後就能悔', !(await undoBtn.isDisabled()));

  const beforeUndo = await page.evaluate(() => JSON.stringify(window.__state?.board ?? null));
  await undoBtn.click();
  await page.waitForTimeout(250);
  check('悔完剩兩次', (await undoBtn.innerText()).includes('2'), await undoBtn.innerText());
  const afterUndo = await page.evaluate(() => JSON.stringify(window.__state?.board ?? null));
  check('悔一步之後盤面真的變回去了', beforeUndo !== afterUndo);

  // 用完三次就不能再悔
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(160);
    if (!(await undoBtn.isDisabled())) await undoBtn.click();
    await page.waitForTimeout(160);
  }
  check('三次用完就按不下去了', await undoBtn.isDisabled(), await undoBtn.innerText());

  // 9.2 聖經皮膚
  await reset(page, { mode: 'gravity' });
  await openSettings(page);
  const skinBtns = await page.locator('.skin-options button').allInnerTexts();
  check('皮膚有兩種', skinBtns.length === 2, skinBtns.join('/'));
  check('預設是經典皮', (await page.locator('.skin-options button.active').innerText()).includes('經典'));
  const boardBefore = await page.evaluate(() => document.querySelector('canvas.board-canvas')?.toDataURL().slice(0, 300));
  await page.locator('.skin-options button', { hasText: '聖經' }).click();
  await page.waitForTimeout(400);
  check('切成聖經皮之後畫面真的換了色',
    boardBefore !== await page.evaluate(() => document.querySelector('canvas.board-canvas')?.toDataURL().slice(0, 300)));
  await closeSettings(page);
  check('聖經皮有副標', (await page.locator('.app-subtitle').count()) === 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  check('皮膚選擇記得住', await page.locator('.app-subtitle').count() === 1);

  // 9.3 每日殘局
  await openSettings(page);
  await page.locator('.wide-btn', { hasText: '看今天的三題' }).click();
  await page.waitForTimeout(1200);
  const tiers = await page.locator('.puzzle-options button').allInnerTexts();
  check('今天出得了三題', tiers.length === 3, tiers.join('/'));
  check('三題都不是「—」(出不出來會誠實顯示)', !tiers.some((t) => t.trim() === '—'), tiers.join('/'));
  await page.locator('.puzzle-options button').first().click();
  await page.waitForTimeout(500);
  check('進殘局後設定面板自動關掉', await page.locator('.settings .card').count() === 0);
  check('殘局狀態列出現', await page.locator('.puzzle-bar').count() === 1);
  const puzzleInfo = await page.evaluate(() => {
    const s = window.__state;
    if (!s) return null;
    const filled = s.board.flat().filter((c) => c !== 0).length;
    return { puzzle: s.puzzle, current: s.current, queue: s.queue.length, filled };
  });
  check('殘局盤面上真的有磚', puzzleInfo != null && puzzleInfo.filled > 0, JSON.stringify(puzzleInfo));
  check('殘局沒有會自己往下掉的方塊', puzzleInfo?.current == null);
  check('殘局的佇列是有限的(不是 6 顆的無限佇列)',
    puzzleInfo != null && puzzleInfo.queue >= 3 && puzzleInfo.queue <= 7, String(puzzleInfo?.queue));
  await page.waitForTimeout(1200);
  const stillSame = await page.evaluate(() => window.__state?.board.flat().filter((c) => c !== 0).length);
  check('等一秒多盤面也不會自己動', stillSame === puzzleInfo?.filled, `${stillSame} vs ${puzzleInfo?.filled}`);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/puzzle.png` });

  // 9.4 手機紅燈迴歸:設定面板在橫向也關得掉
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await openSettings(page);
  const closeBox = await page.locator('.settings-close').boundingBox();
  check('橫向時關閉鈕就在畫面裡(不必捲兩個畫面)',
    closeBox != null && closeBox.y >= 0 && closeBox.y + closeBox.height <= 390,
    closeBox ? `y=${Math.round(closeBox.y)} h=${Math.round(closeBox.height)}` : 'null');
  check('關閉鈕夠大', closeBox != null && closeBox.width >= 44 && closeBox.height >= 44,
    closeBox ? `${Math.round(closeBox.width)}x${Math.round(closeBox.height)}` : 'null');
  const ownsClose = await page.evaluate(() => {
    const el = document.querySelector('.settings-close');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  });
  check('關閉鈕沒有被別的東西蓋住', ownsClose);
  await closeSettings(page);
  check('橫向時設定面板真的關得掉', await page.locator('.settings .card').count() === 0);

  const smallButtons = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.side-controls button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.height < 44) bad.push(`${b.textContent.trim()}=${Math.round(r.height)}px`);
    });
    return bad;
  });
  check('側邊控制鈕都 ≥44px(0916 體檢是 30px)', smallButtons.length === 0, smallButtons.join('/'));

  // ⚠ 橫向的棋盤本來就窄:8×20 的盤寬高比 0.4,受限的是**高度**不是欄寬
  //   (844×390 上就算把整個畫面高度都給它也只能到 156px 寬)。
  //   所以這裡守的是「沒有退步」與「還看得到」,不是一個做不到的寬度目標。
  const landscapeBoard = await page.locator('canvas.board-canvas').boundingBox();
  check('橫向時棋盤仍然看得到且用滿可用高度',
    landscapeBoard != null && landscapeBoard.width >= 60 && landscapeBoard.height >= 150,
    landscapeBoard ? `${Math.round(landscapeBoard.width)}x${Math.round(landscapeBoard.height)}` : 'null');
  // ★ 迴歸:手機橫放時那排備援鈕(⟲ HOLD ⤓ ⟳ ▼)不可以消失 ——
  //   0916 一度想把桌機版面的門檻降到 600px,那會連帶把它藏掉。
  const padButtons = await page.locator('.touch-pad button').count();
  const padVisible = await page.evaluate(() => {
    const pad = document.querySelector('.touch-pad');
    return pad ? getComputedStyle(pad).display !== 'none' : false;
  });
  check('手機橫放時觸控備援鈕還在', padButtons === 5 && padVisible, `${padButtons} 顆 / 顯示=${padVisible}`);
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/landscape.png` });

  await browser.close();

  console.log(`\n${'─'.repeat(46)}`);
  console.log(`  ${pass} 綠 / ${fail} 紅  (共 ${pass + fail} 項)`);
  if (fails.length) {
    console.log('\n紅燈:');
    for (const f of fails) console.log(`  · ${f}`);
  }
  console.log('');
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('驗收腳本自己爆了:', e);
  process.exitCode = 2;
});
