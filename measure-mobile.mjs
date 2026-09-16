/**
 * 量那 6 項手機健檢紅黃燈的現況(只量、不改)。
 *
 * ★ 先量再改:DEYI 場的回報是線索,數字要自己量過才動手 ——
 *   而且修完要用同一支腳本再量一次,才知道有沒有真的修好。
 *
 * 用法:node measure-mobile.mjs            # 量線上
 *       BRICKS=http://localhost:5500 TETRIS=http://localhost:4173 node measure-mobile.mjs
 */
import { chromium, devices } from 'playwright';

const BRICKS = process.env.BRICKS || 'https://bricksbreaking.pages.dev';
const TETRIS = process.env.TETRIS || 'https://dragtetris.pages.dev';

const LAND = { width: 844, height: 390 };
const PORT = { width: 390, height: 844 };

/** 畫面上所有「可點的東西」的尺寸,連同它在不在可見範圍內。 */
const PROBE = () => {
  const out = [];
  const sel = 'button, a[href], input, select, [role="button"], .cell, .touch-pad *';
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 28),
      text: (el.textContent || '').trim().slice(0, 12),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      inView: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0
    });
  }
  return {
    controls: out,
    scrollH: document.documentElement.scrollHeight,
    viewH: innerHeight,
    viewW: innerWidth,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
};

function report(title, data, { small = 44 } = {}) {
  const bad = data.controls.filter((c) => c.h < small);
  const visible = data.controls.filter((c) => c.inView);
  console.log(`\n  ${title}`);
  console.log(`    視窗 ${data.viewW}×${data.viewH} ・ 頁高 ${data.scrollH} ・ 橫向溢出 ${data.overflowX}`);
  console.log(`    可點元素 ${data.controls.length} 個,其中「可見範圍內」${visible.length} 個`);
  console.log(`    高度 < ${small}px 的:${bad.length} 個`);
  for (const c of bad.slice(0, 10)) {
    console.log(`      · ${c.h}px  ${c.tag}.${c.cls} "${c.text}"`);
  }
}

async function run() {
  const browser = await chromium.launch();

  // ── 打磚塊
  for (const [name, vp] of [['橫向', LAND], ['直向', PORT]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: vp, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(BRICKS, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    report(`打磚塊・首頁・${name}`, await p.evaluate(PROBE));

    // 進遊戲中
    const start = p.locator('button', { hasText: '開始' }).first();
    if (await start.count()) {
      await start.click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(1500);
      report(`打磚塊・遊戲中・${name}`, await p.evaluate(PROBE));
    }
    await ctx.close();
  }

  // ── dragtetris
  for (const [name, vp] of [['橫向', LAND], ['直向', PORT]]) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: vp, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(TETRIS, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    const d = await p.evaluate(PROBE);
    report(`俄羅斯方塊・${name}`, d);

    const geom = await p.evaluate(() => {
      const q = (s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
      };
      const badge = document.getElementById('appVerBadge');
      let overlap = null;
      if (badge) {
        const br = badge.getBoundingClientRect();
        const hits = [];
        for (const b of document.querySelectorAll('button')) {
          const r = b.getBoundingClientRect();
          if (r.width && br.left < r.right && br.right > r.left && br.top < r.bottom && br.bottom > r.top) {
            hits.push((b.textContent || '').trim().slice(0, 8) || b.className.toString().slice(0, 16));
          }
        }
        overlap = hits;
      }
      return {
        stage: q('.stage'),
        board: q('.board') || q('canvas'),
        hud: q('.hud-stack'),
        header: q('header') || q('.app-header'),
        touchPad: q('.touch-pad'),
        badgeOverlaps: overlap
      };
    });
    console.log(`    幾何:${JSON.stringify(geom)}`);
    await ctx.close();
  }

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
