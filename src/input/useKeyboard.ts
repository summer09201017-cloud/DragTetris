import { useEffect, useRef } from 'react';
import { DAS_MS, ARR_MS } from '../game/constants';
import type { Action } from '../game/types';

interface KeyboardOptions {
  dispatch: (a: Action) => void;
  enabled: boolean;
}

// Default key bindings (Guideline-friendly).
const KEYS = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  softDrop: ['ArrowDown'],
  hardDrop: [' ', 'Space'],
  rotateCW: ['ArrowUp', 'x', 'X'],
  rotateCCW: ['z', 'Z', 'Control'],
  hold: ['c', 'C', 'Shift'],
  pause: ['p', 'P', 'Escape'],
  restart: ['r', 'R']
};

function matches(key: string, list: string[]): boolean {
  return list.includes(key);
}

export function useKeyboard({ dispatch, enabled }: KeyboardOptions): void {
  const downRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const dasRef = useRef<{ dir: -1 | 0 | 1; t: number; firing: boolean }>({ dir: 0, t: 0, firing: false });
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (matches(e.key, KEYS.left)) {
        e.preventDefault();
        downRef.current.left = true;
        dasRef.current = { dir: -1, t: 0, firing: false };
        dispatchRef.current({ type: 'move', dx: -1 });
      } else if (matches(e.key, KEYS.right)) {
        e.preventDefault();
        downRef.current.right = true;
        dasRef.current = { dir: 1, t: 0, firing: false };
        dispatchRef.current({ type: 'move', dx: 1 });
      } else if (matches(e.key, KEYS.softDrop)) {
        e.preventDefault();
        dispatchRef.current({ type: 'softDrop', on: true });
      } else if (matches(e.key, KEYS.hardDrop)) {
        e.preventDefault();
        dispatchRef.current({ type: 'hardDrop' });
      } else if (matches(e.key, KEYS.rotateCW)) {
        e.preventDefault();
        dispatchRef.current({ type: 'rotate', dir: 1 });
      } else if (matches(e.key, KEYS.rotateCCW)) {
        e.preventDefault();
        dispatchRef.current({ type: 'rotate', dir: -1 });
      } else if (matches(e.key, KEYS.hold)) {
        e.preventDefault();
        dispatchRef.current({ type: 'hold' });
      } else if (matches(e.key, KEYS.pause)) {
        e.preventDefault();
        dispatchRef.current({ type: 'pauseToggle' });
      } else if (matches(e.key, KEYS.restart)) {
        e.preventDefault();
        dispatchRef.current({ type: 'restart' });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (matches(e.key, KEYS.left)) {
        downRef.current.left = false;
        if (dasRef.current.dir === -1) {
          dasRef.current = downRef.current.right
            ? { dir: 1, t: 0, firing: false }
            : { dir: 0, t: 0, firing: false };
        }
      } else if (matches(e.key, KEYS.right)) {
        downRef.current.right = false;
        if (dasRef.current.dir === 1) {
          dasRef.current = downRef.current.left
            ? { dir: -1, t: 0, firing: false }
            : { dir: 0, t: 0, firing: false };
        }
      } else if (matches(e.key, KEYS.softDrop)) {
        dispatchRef.current({ type: 'softDrop', on: false });
      }
    };

    const tick = (now: number) => {
      const dt = lastTickRef.current ? now - lastTickRef.current : 16;
      lastTickRef.current = now;
      const das = dasRef.current;
      if (das.dir !== 0) {
        das.t += dt;
        if (!das.firing && das.t >= DAS_MS) {
          das.firing = true;
          das.t = 0;
          dispatchRef.current({ type: 'move', dx: das.dir });
        } else if (das.firing && das.t >= ARR_MS) {
          das.t -= ARR_MS;
          dispatchRef.current({ type: 'move', dx: das.dir });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [enabled]);
}
