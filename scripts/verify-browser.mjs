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

const BASE = process.env.BASE || 'http://localhost:4173';
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
  // 設定面板沒有關閉鈕,點背景遮罩才收(onClick 掛在 .settings 上)。
  await page.locator('.settings').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch({ timeout: 60000 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // 預設 30 秒太長:這支每個「找不到就是紅燈」的判斷都不該等那麼久,疊起來像死當。
  page.setDefaultTimeout(6000);

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
  check('版號徽章不是寫死的舊版 v1', badgeText.includes('v2'), badgeText);

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
  check('設定面板看得到版號', verText.includes('v2'), verText);
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
