import { describe, it, expect, beforeEach } from 'vitest';
import {
  todayKey, seedFromString, dailySeed, seedLabel,
  challengeFromLocation, seedOf, challengeLabel,
  loadDaily, submitDaily
} from './daily';
import { createInitialState } from './game/engine';

/** 極簡 localStorage 替身:vitest 預設跑在 node,沒有 window。 */
function installStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear()
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: store };
  return store;
}

beforeEach(() => { installStorage(); });

describe('日期鍵', () => {
  it('用本地日期,不是 UTC(晚上玩不會跳到隔天)', () => {
    // 2026-03-01 23:30 本地時間
    const d = new Date(2026, 2, 1, 23, 30, 0);
    expect(todayKey(d)).toBe('2026-03-01');
  });

  it('月與日補零', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('種子決定性(每日挑戰的命根)', () => {
  it('同一個字串永遠得到同一個數', () => {
    expect(seedFromString('abc')).toBe(seedFromString('abc'));
    expect(dailySeed('2026-09-15')).toBe(dailySeed('2026-09-15'));
  });

  it('不同日期得到不同種子', () => {
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-10-15', '2027-09-15'];
    expect(new Set(days.map(dailySeed)).size).toBe(days.length);
  });

  it('連續 400 天都不重複(一年多不會撞題)', () => {
    const seeds = new Set<number>();
    const base = new Date(2026, 0, 1);
    for (let i = 0; i < 400; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      seeds.add(dailySeed(todayKey(d)));
    }
    expect(seeds.size).toBe(400);
  });

  it('種子落在引擎能吃的 31 位元正整數範圍', () => {
    for (const day of ['2026-01-01', '2026-06-30', '2026-12-31']) {
      const s = dailySeed(day);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(0x80000000);
    }
  });

  it('★ 同一天所有人拿到同一串方塊(整條鏈的真正驗收)', () => {
    const seed = dailySeed('2026-09-15');
    const a = createInitialState(8, seed, 'gravity');
    const b = createInitialState(8, seed, 'gravity');
    expect(a.queue).toEqual(b.queue);
    expect(a.current?.type).toBe(b.current?.type);
  });

  it('★ 不同天的方塊序列不一樣(否則「每日」是假的)', () => {
    const q = (day: string) => {
      const s = createInitialState(8, dailySeed(day), 'gravity');
      return [s.current!.type, ...s.queue].join('');
    };
    expect(new Set([q('2026-09-15'), q('2026-09-16'), q('2026-09-17')]).size).toBeGreaterThan(1);
  });

  it('題號是六位數、補零', () => {
    expect(seedLabel(12)).toBe('000012');
    expect(seedLabel(1234567)).toHaveLength(6);
  });
});

describe('網址解析', () => {
  it('?daily 給今天的題', () => {
    const c = challengeFromLocation('?daily');
    expect(c.kind).toBe('daily');
    if (c.kind === 'daily') {
      expect(c.day).toBe(todayKey());
      expect(c.seed).toBe(dailySeed(c.day));
    }
  });

  it('?seed=123456 給指定題號', () => {
    const c = challengeFromLocation('?seed=123456');
    expect(c.kind).toBe('seed');
    expect(seedOf(c)).toBe(123456);
  });

  it('沒有參數 = 自由練習,種子交給引擎自己取', () => {
    const c = challengeFromLocation('');
    expect(c.kind).toBe('free');
    expect(seedOf(c)).toBeUndefined();
    expect(challengeLabel(c)).toBeNull();
  });

  it('壞參數一律退回自由練習,絕不擋住遊戲', () => {
    for (const q of ['?seed=abc', '?seed=', '?seed=-5', '?seed=NaN', '?foo=1']) {
      expect(challengeFromLocation(q).kind, q).toBe('free');
    }
  });

  it('daily 與 seed 都在時以 daily 優先', () => {
    expect(challengeFromLocation('?daily&seed=99').kind).toBe('daily');
  });

  it('標籤看得出是哪一題', () => {
    expect(challengeLabel({ kind: 'seed', seed: 42 })).toContain('000042');
  });
});

describe('每日成績', () => {
  it('第一次玩是 0 分 0 局', () => {
    const r = loadDaily('2026-09-15');
    expect(r.best).toBe(0);
    expect(r.plays).toBe(0);
  });

  it('提交會記最高分並累加局數', () => {
    submitDaily('2026-09-15', 500);
    const { result, beaten } = submitDaily('2026-09-15', 1200);
    expect(result.best).toBe(1200);
    expect(result.plays).toBe(2);
    expect(beaten).toBe(true);
  });

  it('比較低的分數不會蓋掉最佳,但局數照算', () => {
    submitDaily('2026-09-15', 1200);
    const { result, beaten } = submitDaily('2026-09-15', 300);
    expect(result.best).toBe(1200);
    expect(result.plays).toBe(2);
    expect(beaten).toBe(false);
  });

  it('換日就重新算(昨天的成績不會被當成今天的)', () => {
    submitDaily('2026-09-15', 9999);
    expect(loadDaily('2026-09-16').best).toBe(0);
  });

  it('localStorage 壞掉時不炸,當作沒玩過', () => {
    window.localStorage.setItem('tetris.daily.v1', '{不是 JSON');
    expect(loadDaily('2026-09-15').best).toBe(0);
  });

  it('存進去的髒值會被清成合法數字', () => {
    window.localStorage.setItem(
      'tetris.daily.v1',
      JSON.stringify({ day: '2026-09-15', best: 'abc', plays: -3 })
    );
    const r = loadDaily('2026-09-15');
    expect(r.best).toBe(0);
    expect(r.plays).toBe(0);
  });
});
