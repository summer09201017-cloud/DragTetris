/**
 * 版號與更新紀錄的守門(1113 v4.6,長輩友善審查 1.4)。
 *
 * 版號只有一處:index.html 的 APP_VERSIONS(最新的放最前面)。
 * 標題列的「版本 … · 更新紀錄」鈕與設定面板都讀 window.__appVersion(由 APP_VERSIONS[0] 組出來)。
 * 本站沒有手寫 sw.js —— vite-plugin-pwa 依檔案內容自動產快取版本,改了 index.html 就會換新,
 * 所以這裡守的是「畫面上的版號只有一個來源,而且那個來源本身是對的」。
 */
import { describe, expect, it } from 'vitest';
// 用 Vite 的 ?raw 讀原始檔(本 repo 的 tsconfig 沒有 node 型別,不用 node:fs)
import html from '../index.html?raw';

/** src 底下所有原始碼(不含測試),key 是相對路徑 */
const SOURCES = import.meta.glob(['./**/*.ts', './**/*.tsx', './**/*.css', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

type Entry = { v: string; d: string; t: string };

function parseVersions(src: string): { entries: Entry[]; rawCount: number } {
  const block = src.match(/var APP_VERSIONS = \[([\s\S]*?)\n\s*\];/);
  if (!block) return { entries: [], rawCount: 0 };
  const body = block[1];
  const rawCount = (body.match(/\{\s*v:/g) || []).length;
  const re = /\{\s*v:\s*'([^']*)',\s*d:\s*'([^']*)',\s*t:\s*'((?:[^'\\]|\\.)*)'\s*\}/g;
  const entries: Entry[] = [];
  for (const m of body.matchAll(re)) entries.push({ v: m[1], d: m[2], t: m[3] });
  return { entries, rawCount };
}

function versionParts(v: string): number[] {
  return v.slice(1).split('.').map(Number);
}

/** a 比 b 新 ⇒ 正數 */
function compareVersion(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function isRealDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

const { entries, rawCount } = parseVersions(html);

describe('APP_VERSIONS(index.html,版號唯一來源)', () => {
  it('找得到,而且每一筆都解析得出來(沒有一筆格式壞掉被跳過)', () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBe(rawCount);
  });

  it('第一筆(畫面上顯示的那一版)格式正確:vN 或 vN.M、真的日期、有白話說明', () => {
    const first = entries[0];
    expect(first.v).toMatch(/^v\d+(\.\d+)*$/);
    expect(isRealDate(first.d)).toBe(true);
    expect(first.t.trim().length).toBeGreaterThan(10);
  });

  it('每一筆格式都對', () => {
    for (const e of entries) {
      expect(e.v, JSON.stringify(e)).toMatch(/^v\d+(\.\d+)*$/);
      expect(isRealDate(e.d), JSON.stringify(e)).toBe(true);
      expect(e.t.trim().length, JSON.stringify(e)).toBeGreaterThan(0);
    }
  });

  it('版號不重複', () => {
    const vs = entries.map((e) => e.v);
    expect(new Set(vs).size).toBe(vs.length);
  });

  it('由新到舊排:日期不會往後跳、版號一路變小', () => {
    for (let i = 1; i < entries.length; i++) {
      const newer = entries[i - 1];
      const older = entries[i];
      expect(newer.d >= older.d, `${newer.v}(${newer.d}) 排在 ${older.v}(${older.d}) 前面`).toBe(true);
      expect(compareVersion(newer.v, older.v), `${newer.v} 應該比 ${older.v} 新`).toBeGreaterThan(0);
    }
  });

  it('更新紀錄寫給會眾看:不寫 px、百分比量測、「打點」「beacon」「單元測試」這類工程用語', () => {
    const jargon = /\d\s*px\b|\d+(\.\d+)?\s*%|打點|beacon|單元測試|y=\d|\.tsx?\b|\.mjs\b|\.css\b/i;
    for (const e of entries) {
      expect(jargon.test(e.t), `${e.v}:${e.t}`).toBe(false);
    }
  });
});

describe('畫面上的版號只有一個來源', () => {
  it('index.html 用 APP_VERSIONS[0] 組出 window.__appVersion', () => {
    expect(html).toMatch(/var latest = APP_VERSIONS\[0\];/);
    expect(html).toMatch(/window\.__appVersion = latest\.v \+ '（' \+ latest\.d \+ '）';/);
  });

  it('更新紀錄叫「更新紀錄」,不再叫「改版簡歷」', () => {
    expect(html).toContain('更新紀錄');
    expect(html).not.toContain('改版簡歷');
  });

  it('src 裡沒有任何地方手寫目前的版號或日期(都要讀 window.__appVersion)', () => {
    const latest = entries[0];
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(10); // 掃不到檔案 = 沒有在守(閘門找不到輸入就等於沒閘門)
    const hits = files.filter((p) => {
      const src = SOURCES[p];
      return src.includes(`'${latest.v}'`) || src.includes(`"${latest.v}"`) || src.includes(latest.d);
    });
    expect(hits).toEqual([]);
  });

  it('標題列與設定面板都是透過 appVersion() 讀版號', () => {
    expect(SOURCES['./App.tsx']).toMatch(/版本 \{appVersion\(\)\}/);
    expect(SOURCES['./components/SettingsPanel.tsx']).toMatch(/\{appVersion\(\)\}/);
  });
});
