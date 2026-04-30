import { MELODY, BASS_ROOTS, TEMPO_BPM } from './odeToJoy';

const STORAGE_KEY = 'tetris.audio.v1';

export type SfxName =
  | 'move' | 'rotate' | 'softdrop' | 'harddrop' | 'lock'
  | 'clear1' | 'clear2' | 'clear3' | 'tetris'
  | 'tspin' | 'pc' | 'levelup' | 'hold' | 'gameover';

interface Settings {
  bgmVolume: number; // 0..1
  sfxVolume: number; // 0..1
  bgmMuted: boolean;
  sfxMuted: boolean;
}

const DEFAULTS: Settings = { bgmVolume: 0.45, sfxVolume: 0.7, bgmMuted: false, sfxMuted: false };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmPlaying = false;
  private nextNoteTime = 0;
  private noteIndex = 0;
  private beatCounter = 0;
  private settings: Settings = loadSettings();
  private listeners = new Set<(s: Settings) => void>();

  // ────────── lifecycle

  ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    this.ctx = new Ctor!();
    this.bgmGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.settings.bgmMuted ? 0 : this.settings.bgmVolume;
    this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfxVolume;
    this.bgmGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume();
  }

  // ────────── settings

  getSettings(): Settings { return { ...this.settings }; }

  setBgmVolume(v: number): void {
    this.settings.bgmVolume = Math.max(0, Math.min(1, v));
    this.persist();
    if (this.bgmGain) this.bgmGain.gain.value = this.settings.bgmMuted ? 0 : this.settings.bgmVolume;
  }
  setSfxVolume(v: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, v));
    this.persist();
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfxVolume;
  }
  toggleBgmMute(): void {
    this.settings.bgmMuted = !this.settings.bgmMuted;
    this.persist();
    if (this.bgmGain) this.bgmGain.gain.value = this.settings.bgmMuted ? 0 : this.settings.bgmVolume;
  }
  toggleSfxMute(): void {
    this.settings.sfxMuted = !this.settings.sfxMuted;
    this.persist();
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfxVolume;
  }

  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.listeners.forEach(fn => fn({ ...this.settings }));
  }

  // ────────── BGM (Ode to Joy) — scheduled via lookahead

  startBgm(): void {
    if (this.bgmPlaying) return;
    this.ensureContext();
    this.bgmPlaying = true;
    this.noteIndex = 0;
    this.beatCounter = 0;
    this.nextNoteTime = this.ctx!.currentTime + 0.05;
    this.scheduleBgm();
  }

  stopBgm(): void {
    this.bgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private scheduleBgm = (): void => {
    if (!this.bgmPlaying || !this.ctx || !this.bgmGain) return;
    const lookahead = 0.15;       // schedule 150ms ahead
    const interval = 0.04;        // run every 40ms
    const beatSec = 60 / TEMPO_BPM;

    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      const note = MELODY[this.noteIndex];
      const dur = note.b * beatSec;
      if (!('rest' in note)) {
        this.playMelodyNote(midiToHz(note.m), this.nextNoteTime, dur);
      }
      // Bass: one bass note per beat starting from current beatCounter
      let beatsLeft = note.b;
      let t = this.nextNoteTime;
      while (beatsLeft > 0) {
        const root = BASS_ROOTS[this.beatCounter % BASS_ROOTS.length];
        this.playBassNote(midiToHz(root), t, beatSec * 0.95);
        t += beatSec;
        beatsLeft -= 1;
        this.beatCounter++;
      }

      this.nextNoteTime += dur;
      this.noteIndex = (this.noteIndex + 1) % MELODY.length;
      if (this.noteIndex === 0) this.beatCounter = 0;
    }

    this.bgmTimer = window.setTimeout(this.scheduleBgm, interval * 1000);
  };

  private playMelodyNote(freq: number, when: number, dur: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    const g = this.ctx.createGain();
    const peak = 0.32;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.01);
    g.gain.linearRampToValueAtTime(peak * 0.7, when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.bgmGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private playBassNote(freq: number, when: number, dur: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, when);
    const g = this.ctx.createGain();
    const peak = 0.12;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.bgmGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // ────────── SFX

  playSfx(name: SfxName): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'move':     this.beep(t, 'square',   320, 0.05, 0.18); break;
      case 'rotate':   this.beep(t, 'square',   520, 0.05, 0.20); break;
      case 'softdrop': this.beep(t, 'triangle', 240, 0.03, 0.10); break;
      case 'harddrop': this.sweep(t, 'sawtooth', 600, 120, 0.08, 0.30); break;
      case 'lock':     this.thump(t, 0.18); break;
      case 'clear1':   this.beep(t, 'triangle', 700, 0.10, 0.30); break;
      case 'clear2':   this.arpeggio(t, [660, 880], 0.07, 0.30); break;
      case 'clear3':   this.arpeggio(t, [660, 880, 990], 0.06, 0.32); break;
      case 'tetris':   this.arpeggio(t, [523, 659, 784, 1046, 1318], 0.06, 0.40); break;
      case 'tspin':    this.arpeggio(t, [392, 587, 784, 1175], 0.06, 0.40); break;
      case 'pc':       this.arpeggio(t, [523, 659, 784, 1046, 1318, 1568, 2093], 0.06, 0.45); break;
      case 'levelup':  this.arpeggio(t, [523, 659, 784, 1046], 0.07, 0.32); break;
      case 'hold':     this.beep(t, 'sine',     440, 0.06, 0.20); break;
      case 'gameover': this.sweep(t, 'sawtooth', 440, 80, 0.6, 0.40); break;
    }
  }

  private beep(when: number, type: OscillatorType, freq: number, dur: number, gain: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private sweep(when: number, type: OscillatorType, fromHz: number, toHz: number, dur: number, gain: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), when + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private arpeggio(start: number, freqs: number[], step: number, gain: number) {
    freqs.forEach((f, i) => this.beep(start + i * step, 'square', f, step * 1.4, gain));
  }

  private thump(when: number, gain: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, when);
    osc.frequency.exponentialRampToValueAtTime(60, when + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(when);
    osc.stop(when + 0.22);
    // Noise burst for "click"
    const buf = this.ctx.createBuffer(1, 0.04 * this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.value = gain * 0.6;
    src.connect(ng);
    ng.connect(this.sfxGain);
    src.start(when);
  }
}

export const audio = new AudioManager();
