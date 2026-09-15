/**
 * 🎨 主題皮膚(2026-09-16)。
 *
 * 為什麼做這個:這個站原本是一款「沒有經文的懷舊遊戲」,放在聖經遊戲大廳裡有點格格不入。
 * 換皮是**零玩法改動**的——方塊換石頭與泥磚、消行文案換成經文、Perfect Clear 出金光——
 * 就能讓同一個引擎在主日學用得上,而想玩純街機的人切回經典皮即可。
 *
 * ★ 經文零容忍(share-card / bible-game-studio 的第一鐵則):
 *   下面每一段 `verse` 都是 **2026-09-16 用 cuv MCP(和合本)逐句查過**的原文,
 *   `show` 一定是 `verse` 的**逐字子字串**(顯示用的短句),`ref` 一定附上。
 *   skins.test.ts 有一條測試在守這件事:改壞了會當場紅。
 *   要新增經文 ⇒ **先查 `/cuv-check` 或 mcp__cuv__lookup,不可以憑記憶打**。
 */
import type { PieceType } from './game/types';

export type SkinId = 'classic' | 'bible';

export interface VerseLine {
  /** 畫面上顯示的短句(必須是 verse 的逐字子字串)。 */
  show: string;
  /** 和合本原文全句(核對過的那一句)。 */
  verse: string;
  /** 出處。 */
  ref: string;
}

export interface Skin {
  id: SkinId;
  label: string;
  /** 標題列副標;經典皮不顯示。 */
  subtitle: string | null;
  colors: Record<PieceType | 'G', string>;
  /** 棋盤底色。 */
  boardBg: string;
  /** 格線顏色。 */
  gridLine: string;
  /** Perfect Clear 的金光(經典皮不畫)。 */
  glow: string | null;
  /** 消行等事件的文案;回 null 表示用引擎預設的英文術語。 */
  lines: Record<'single' | 'double' | 'triple' | 'tetris' | 'tspin' | 'pc' | 'combo' | 'b2b', VerseLine> | null;
}

const CLASSIC: Skin = {
  id: 'classic',
  label: '經典街機',
  subtitle: null,
  colors: {
    I: '#22d3ee',
    O: '#facc15',
    T: '#a855f7',
    S: '#22c55e',
    Z: '#ef4444',
    J: '#3b82f6',
    L: '#fb923c',
    G: '#3b4282'
  },
  boardBg: '#07091a',
  gridLine: 'rgba(255,255,255,0.04)',
  glow: null,
  lines: null
};

/**
 * 🧱 聖經皮:石頭與泥磚。
 * 顏色刻意保留七種**色相**的差距(不是七階灰),否則投影在教室前面、
 * 坐最後一排的孩子會分不出哪一塊是哪一塊(a11y-projector-check 的老問題)。
 */
const BIBLE: Skin = {
  id: 'bible',
  label: '聖經・建造',
  subtitle: '拆毀有時，建造有時',
  colors: {
    I: '#7fb3c9', // 青石板
    O: '#d9a441', // 金
    T: '#9d7bb5', // 紫石
    S: '#7fa05a', // 橄欖石
    Z: '#b5563f', // 紅磚
    J: '#5b7fa6', // 藍灰石
    L: '#c98b4b', // 泥磚
    G: '#4a3f30'  // ghost：土色
  },
  boardBg: '#1d1710',
  gridLine: 'rgba(255,226,183,0.06)',
  glow: '#ffd98a',
  lines: {
    single: {
      show: '拆毀有時，建造有時',
      verse: '殺戮有時，醫治有時；拆毀有時，建造有時；',
      ref: '傳道書 3:3'
    },
    double: {
      show: '城牆就都連絡',
      verse: '這樣，我們修造城牆，城牆就都連絡，高至一半，因為百姓專心做工。',
      ref: '尼希米記 4:6'
    },
    triple: {
      show: '把房子蓋在磐石上',
      verse:
        '「所以，凡聽見我這話就去行的，好比一個聰明人，把房子蓋在磐石上；雨淋，水沖，風吹，撞著那房子，房子總不倒塌，因為根基立在磐石上。',
      ref: '馬太福音 7:24-25'
    },
    tetris: {
      show: '匠人所棄的石頭已成了房角的頭塊石頭',
      verse: '匠人所棄的石頭已成了房角的頭塊石頭。',
      ref: '詩篇 118:22'
    },
    tspin: {
      show: '被建造成為靈宮',
      verse:
        '你們來到主面前，也就像活石，被建造成為靈宮，作聖潔的祭司，藉著耶穌基督奉獻　神所悅納的靈祭。',
      ref: '彼得前書 2:5'
    },
    pc: {
      show: '若不是耶和華建造房屋，建造的人就枉然勞力',
      verse:
        '（所羅門上行之詩。）若不是耶和華建造房屋，建造的人就枉然勞力；若不是耶和華看守城池，看守的人就枉然警醒。',
      ref: '詩篇 127:1'
    },
    combo: {
      show: '因為百姓專心做工',
      verse: '這樣，我們修造城牆，城牆就都連絡，高至一半，因為百姓專心做工。',
      ref: '尼希米記 4:6'
    },
    b2b: {
      show: '那已經立好的根基就是耶穌基督',
      verse: '因為那已經立好的根基就是耶穌基督，此外沒有人能立別的根基。',
      ref: '哥林多前書 3:11'
    }
  }
};

export const SKINS: Record<SkinId, Skin> = { classic: CLASSIC, bible: BIBLE };
export const SKIN_IDS: readonly SkinId[] = ['classic', 'bible'];

const SKIN_STORAGE_KEY = 'tetris.skin';

export function loadSkinId(): SkinId {
  try {
    const raw = window.localStorage.getItem(SKIN_STORAGE_KEY) as SkinId | null;
    return raw && SKIN_IDS.includes(raw) ? raw : 'classic';
  } catch {
    return 'classic';
  }
}

export function saveSkinId(id: SkinId): void {
  try {
    window.localStorage.setItem(SKIN_STORAGE_KEY, id);
  } catch {
    // 私密模式寫不進去:照玩，只是記不住。
  }
}

/**
 * 繪圖層用的「目前皮膚」。
 * renderBoard / renderMini / renderQueue 分散在三個呼叫點、又各自被 React 的
 * useEffect 叫,把 skin 一路當參數傳下去會把四個元件的介面都弄髒;
 * 一次只會有一個皮膚,所以這裡放一個模組層的 active 就夠了。
 * ★ 唯一的規矩:**只有 store 能改它**(setActiveSkin),元件不要自己動,
 *   否則畫面與設定面板會各說各話。
 */
let active: Skin = CLASSIC;

export function activeSkin(): Skin {
  return active;
}

export function setActiveSkin(id: SkinId): Skin {
  active = SKINS[id] ?? CLASSIC;
  return active;
}

export function pieceColor(type: PieceType | 'G'): string {
  return active.colors[type] ?? CLASSIC.colors[type];
}

/** 消行文案。回 null 就用呼叫端原本的英文術語。 */
export function skinLineText(
  skin: Skin,
  kind: 'single' | 'double' | 'triple' | 'tetris' | 'tspin' | 'pc' | 'combo' | 'b2b'
): VerseLine | null {
  return skin.lines ? skin.lines[kind] : null;
}
