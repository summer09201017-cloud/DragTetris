import { describe, it, expect, beforeEach } from 'vitest';
import { SKINS, SKIN_IDS, loadSkinId, saveSkinId, setActiveSkin, activeSkin, pieceColor, skinLineText } from './skins';
import type { PieceType } from './game/types';

function installStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, String(v)); },
      removeItem: (k: string) => { map.delete(k); }
    }
  };
  return map;
}

beforeEach(() => {
  installStorage();
  setActiveSkin('classic');
});

const TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

describe('★ 經文零容忍', () => {
  const skin = SKINS.bible;

  it('聖經皮的每一句「顯示短句」都是和合本原文的逐字子字串', () => {
    expect(skin.lines).not.toBeNull();
    for (const [kind, line] of Object.entries(skin.lines!)) {
      expect(line.verse.includes(line.show), `${kind}:「${line.show}」不在原文裡`).toBe(true);
    }
  });

  it('每一句都附出處（寧可只有出處，也不給孩子錯經文）', () => {
    for (const [kind, line] of Object.entries(skin.lines!)) {
      expect(line.ref.length, `${kind} 沒有出處`).toBeGreaterThan(2);
      // 出處長得像「某某書 3:3」或「某某書 7:24-25」
      expect(line.ref, `${kind} 的出處格式怪怪的`).toMatch(/\d+:\d+(-\d+)?$/);
    }
  });

  it('顯示短句不是空的、也沒有明顯的佔位字', () => {
    for (const line of Object.values(skin.lines!)) {
      expect(line.show.trim().length).toBeGreaterThan(3);
      expect(line.show).not.toMatch(/undefined|TODO|待補|\.\.\./);
      expect(line.verse).not.toMatch(/undefined|TODO|待補/);
    }
  });
});

describe('皮膚顏色', () => {
  it('每一種方塊都有顏色，不會掉到 undefined', () => {
    for (const id of SKIN_IDS) {
      const skin = SKINS[id];
      for (const type of [...TYPES, 'G' as const]) {
        expect(skin.colors[type], `${id}/${type}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('七種方塊的顏色互不相同（投影在教室要分得出哪塊是哪塊）', () => {
    for (const id of SKIN_IDS) {
      const used = TYPES.map((t) => SKINS[id].colors[t].toLowerCase());
      expect(new Set(used).size, `${id} 有重複的顏色`).toBe(TYPES.length);
    }
  });

  it('ghost 的顏色跟任何一塊都不一樣（不然落點預覽會被誤認成實體）', () => {
    for (const id of SKIN_IDS) {
      const skin = SKINS[id];
      expect(TYPES.map((t) => skin.colors[t].toLowerCase())).not.toContain(skin.colors.G.toLowerCase());
    }
  });
});

describe('切換與記住', () => {
  it('預設是經典皮（想玩純街機的人不會被換皮）', () => {
    expect(loadSkinId()).toBe('classic');
  });

  it('存得起來、讀得回來', () => {
    saveSkinId('bible');
    expect(loadSkinId()).toBe('bible');
  });

  it('壞掉的值退回經典皮，不炸', () => {
    window.localStorage.setItem('tetris.skin', 'nope');
    expect(loadSkinId()).toBe('classic');
  });

  it('setActiveSkin 之後，繪圖層拿到的就是新皮的顏色', () => {
    setActiveSkin('bible');
    expect(activeSkin().id).toBe('bible');
    expect(pieceColor('I')).toBe(SKINS.bible.colors.I);
    setActiveSkin('classic');
    expect(pieceColor('I')).toBe(SKINS.classic.colors.I);
  });

  it('不認得的皮膚 id 退回經典皮，不會讓畫面變成全黑', () => {
    setActiveSkin('nope' as never);
    expect(activeSkin().id).toBe('classic');
  });
});

describe('消行文案', () => {
  it('經典皮不給文案（用引擎原本的英文術語）', () => {
    expect(skinLineText(SKINS.classic, 'tetris')).toBeNull();
  });

  it('聖經皮每一種事件都給得出一句', () => {
    for (const kind of ['single', 'double', 'triple', 'tetris', 'tspin', 'pc', 'combo', 'b2b'] as const) {
      const line = skinLineText(SKINS.bible, kind);
      expect(line, kind).not.toBeNull();
      expect(line!.show.length).toBeGreaterThan(0);
    }
  });
});
