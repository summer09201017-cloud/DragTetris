/**
 * 每日挑戰 / 指定題號(G)。
 *
 * 全世界同一天拿到**同一串方塊**,比誰分數高;零後端 —— 日期字串 → FNV-1a → 種子。
 *
 * ★ 為什麼不用 Math.random 或時間戳當種子:那樣每個人、每次重開都不一樣,
 *   「同一題」就不成立,每日挑戰整個失去意義。
 * ★ 為什麼用**本地日期**而不是 UTC:孩子晚上 9 點玩,UTC 已經是隔天了 ⇒ 會在
 *   一天當中換題。這是給同一個時區的教會用的,本地日期才符合直覺。
 *   代價是跨時區的人拿到的不是同一題 —— 本專案的使用者全在同一時區,接受。
 * ★ 種子只吃日期字串,與遊戲內的 rand() 無關,所以不會動到任何既有隨機序列。
 */

/** 今天的本地日期字串 YYYY-MM-DD。 */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a 32-bit。純函式、無狀態,同一個字串永遠得到同一個數。 */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // 乘 16777619,用位移避免 32 位元溢位失真
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** 某一天的種子(引擎要的是 31 位元正整數)。 */
export function dailySeed(day: string): number {
  return seedFromString(`dragtetris:${day}`) & 0x7fffffff;
}

/** 給人看 / 給老師報的題號:六位數,比 10 位數的種子好念。 */
export function seedLabel(seed: number): string {
  return String(seed % 1000000).padStart(6, '0');
}

export type Challenge =
  | { kind: 'free' }
  | { kind: 'daily'; day: string; seed: number }
  | { kind: 'seed'; seed: number };

/**
 * 解析網址:`?daily` = 今天的題,`?seed=123456` = 指定題號(練功房 / 老師報號)。
 * ⚠ 讀不到或格式不對一律退回 free,絕不讓一個壞參數擋住遊戲。
 */
export function challengeFromLocation(search: string = window.location.search): Challenge {
  try {
    const q = new URLSearchParams(search);
    if (q.has('daily')) {
      const day = todayKey();
      return { kind: 'daily', day, seed: dailySeed(day) };
    }
    const raw = q.get('seed');
    if (raw != null && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) {
        // 允許人直接打六位題號,也允許貼完整種子
        return { kind: 'seed', seed: Math.floor(n) % 0x80000000 };
      }
    }
  } catch {
    // URLSearchParams 在極舊瀏覽器可能不存在
  }
  return { kind: 'free' };
}

/** 這個挑戰要用的種子;free 回 undefined 讓引擎自己取隨機種子。 */
export function seedOf(c: Challenge): number | undefined {
  return c.kind === 'free' ? undefined : c.seed;
}

export function challengeLabel(c: Challenge): string | null {
  if (c.kind === 'daily') return `📅 今日挑戰 #${seedLabel(c.seed)}`;
  if (c.kind === 'seed') return `🎯 題號 #${seedLabel(c.seed)}`;
  return null;
}

// ───────────────────────────── 每日成績(本機)

const DAILY_KEY = 'tetris.daily.v1';

export interface DailyResult {
  day: string;
  best: number;
  plays: number;
}

/**
 * 每日成績只留**今天**那一筆。
 * 刻意不做歷史:留著只會無限長大,而且沒有任何畫面在讀它 —— 那正是
 * 「寫了從不讀」的資料,除了佔空間什麼也不做。
 */
export function loadDaily(day: string): DailyResult {
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<DailyResult>;
      if (o && o.day === day) {
        return {
          day,
          best: Number.isFinite(Number(o.best)) ? Math.max(0, Math.floor(Number(o.best))) : 0,
          plays: Number.isFinite(Number(o.plays)) ? Math.max(0, Math.floor(Number(o.plays))) : 0
        };
      }
    }
  } catch {
    // 讀不到就當今天還沒玩過
  }
  return { day, best: 0, plays: 0 };
}

/** 回傳更新後的成績 + 是不是破了今天的紀錄。 */
export function submitDaily(day: string, score: number): { result: DailyResult; beaten: boolean } {
  const prev = loadDaily(day);
  const beaten = score > prev.best;
  const result: DailyResult = { day, best: Math.max(prev.best, score), plays: prev.plays + 1 };
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(result));
  } catch {
    // 寫不進去不影響遊戲
  }
  return { result, beaten };
}
