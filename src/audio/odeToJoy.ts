// Ode to Joy main theme — public domain (Beethoven 1824).
// Encoded as MIDI numbers + beat durations. 1 beat = quarter note.
// 60 = C4, 64 = E4, 67 = G4, etc.
export type Note = { m: number; b: number } | { rest: true; b: number };

// Two-voice arrangement: melody + simple bass.
export const MELODY: Note[] = [
  // Phrase 1
  { m: 64, b: 1 }, { m: 64, b: 1 }, { m: 65, b: 1 }, { m: 67, b: 1 },
  { m: 67, b: 1 }, { m: 65, b: 1 }, { m: 64, b: 1 }, { m: 62, b: 1 },
  { m: 60, b: 1 }, { m: 60, b: 1 }, { m: 62, b: 1 }, { m: 64, b: 1 },
  { m: 64, b: 1.5 }, { m: 62, b: 0.5 }, { m: 62, b: 2 },

  // Phrase 2 (repeat)
  { m: 64, b: 1 }, { m: 64, b: 1 }, { m: 65, b: 1 }, { m: 67, b: 1 },
  { m: 67, b: 1 }, { m: 65, b: 1 }, { m: 64, b: 1 }, { m: 62, b: 1 },
  { m: 60, b: 1 }, { m: 60, b: 1 }, { m: 62, b: 1 }, { m: 64, b: 1 },
  { m: 62, b: 1.5 }, { m: 60, b: 0.5 }, { m: 60, b: 2 },

  // Phrase 3 (development)
  { m: 62, b: 1 }, { m: 62, b: 1 }, { m: 64, b: 1 }, { m: 60, b: 1 },
  { m: 62, b: 1 }, { m: 64, b: 0.5 }, { m: 65, b: 0.5 }, { m: 64, b: 1 }, { m: 60, b: 1 },
  { m: 62, b: 1 }, { m: 64, b: 0.5 }, { m: 65, b: 0.5 }, { m: 64, b: 1 }, { m: 62, b: 1 },
  { m: 60, b: 1 }, { m: 62, b: 1 }, { m: 55, b: 2 },

  // Phrase 4 (climax/resolution = phrase 1+2 ending)
  { m: 64, b: 1 }, { m: 64, b: 1 }, { m: 65, b: 1 }, { m: 67, b: 1 },
  { m: 67, b: 1 }, { m: 65, b: 1 }, { m: 64, b: 1 }, { m: 62, b: 1 },
  { m: 60, b: 1 }, { m: 60, b: 1 }, { m: 62, b: 1 }, { m: 64, b: 1 },
  { m: 62, b: 1.5 }, { m: 60, b: 0.5 }, { m: 60, b: 2 }
];

// Bass plays root of harmony, two octaves below, on every beat.
// Harmony pattern (one chord per bar = 4 beats): C, G, C, G, C, F, C-G, C ...
// We'll generate bass notes from a per-beat root list (60 beats total).
export const BASS_ROOTS: number[] = [
  // P1: C  C  F  G  | G  F  C  G  | C  C  Dm G  | C    G    C
  48, 48, 53, 55,  55, 53, 48, 55,  48, 48, 50, 55,  48, 48, 55, 55,
  // P2 (same as P1 but ends on C)
  48, 48, 53, 55,  55, 53, 48, 55,  48, 48, 50, 55,  50, 50, 48, 48,
  // P3
  50, 50, 48, 48,  50, 53, 48, 48,  50, 53, 48, 50,  48, 50, 43, 43,
  // P4
  48, 48, 53, 55,  55, 53, 48, 55,  48, 48, 50, 55,  50, 50, 48, 48
];

export const TEMPO_BPM = 120;
