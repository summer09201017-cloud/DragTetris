import type { GameMode, GameState } from './game/types';

/**
 * 個人紀錄(本機,零上傳)。
 *
 * ★ 分組鍵 = `${mode}:${boardWidth}` —— 7 / 8 / 12 欄的難度差很多,12 欄的分數拿去跟
 *   7 欄比是沒有意義的;混在一起會讓「最高分」永遠停在最寬的那一檔,玩窄盤的人再也
 *   破不了紀錄 ⇒ 回訪動機直接歸零。
 * ★ creative(自由建造)是沙盒:**刻意不記分數**,只記局數——能憑空懸浮的模式跟另外
 *   兩檔比分毫無意義,混進來會把排行汙染掉。gravity 與 support 規則不同但都憑實力,
 *   各自獨立記錄(分組鍵已含模式)。
 */

const KEY = 'tetris.records.v1';

export interface RecordEntry {
  score: number;
  lines: number;
  level: number;
  maxCombo: number;
  pcCount: number;
  games: number;
}

export type RecordBook = Record<string, RecordEntry>;

/** 破了哪些項目 —— GameOver 面板用它標「新紀錄!」 */
export interface BeatenFlags {
  score: boolean;
  lines: boolean;
  level: boolean;
  maxCombo: boolean;
}

export const EMPTY_ENTRY: RecordEntry = {
  score: 0,
  lines: 0,
  level: 0,
  maxCombo: 0,
  pcCount: 0,
  games: 0
};

export function recordKey(mode: GameMode, boardWidth: number): string {
  return `${mode}:${boardWidth}`;
}

/** creative(自由建造)是沙盒,分數不進紀錄(只有局數會累加)。 */
export function scoresCount(mode: GameMode): boolean {
  return mode !== 'creative';
}

function sanitize(raw: unknown): RecordEntry {
  const o = (raw ?? {}) as Partial<Record<keyof RecordEntry, unknown>>;
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  return {
    score: num(o.score),
    lines: num(o.lines),
    level: num(o.level),
    maxCombo: num(o.maxCombo),
    pcCount: num(o.pcCount),
    games: num(o.games)
  };
}

export function loadRecords(): RecordBook {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const book: RecordBook = {};
    for (const k of Object.keys(parsed)) book[k] = sanitize(parsed[k]);
    return book;
  } catch {
    // localStorage 可能不可用(Safari 私密模式 / 硬化瀏覽器),或 JSON 壞掉。
    return {};
  }
}

export function getRecord(book: RecordBook, mode: GameMode, boardWidth: number): RecordEntry {
  return book[recordKey(mode, boardWidth)] ?? EMPTY_ENTRY;
}

function save(book: RecordBook): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // 寫不進去就算了,不能因此弄壞遊戲。
  }
}

/**
 * 一局結束時提交。回傳更新後的整本紀錄 + 這一局破了哪些項目。
 * ⚠ 純函式風格:讀 → 算 → 寫 → 回傳,呼叫端不需要自己再讀一次。
 */
export function submitGame(state: GameState): { book: RecordBook; beaten: BeatenFlags } {
  const book = loadRecords();
  const key = recordKey(state.mode, state.boardWidth);
  const prev = book[key] ?? EMPTY_ENTRY;
  const counts = scoresCount(state.mode);

  const beaten: BeatenFlags = {
    score: counts && state.score > prev.score,
    lines: counts && state.lines > prev.lines,
    level: counts && state.level > prev.level,
    maxCombo: counts && state.maxCombo > prev.maxCombo
  };

  const next: RecordEntry = {
    score: counts ? Math.max(prev.score, state.score) : prev.score,
    lines: counts ? Math.max(prev.lines, state.lines) : prev.lines,
    level: counts ? Math.max(prev.level, state.level) : prev.level,
    maxCombo: counts ? Math.max(prev.maxCombo, state.maxCombo) : prev.maxCombo,
    pcCount: prev.pcCount + (counts ? state.pcCount : 0),
    games: prev.games + 1
  };

  book[key] = next;
  save(book);
  return { book, beaten };
}
