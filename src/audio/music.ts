// The island's music: four pieces of one family, a piece for each part of the day, each a loop of
// sixteen bars (a theme and its answer), all of them written for this island. Soft instruments over
// jazz chords, a light hand on the drums, a little room around them:
//
//   morning   5:00–10:00   F major, 88 a minute: a flute over a nylon string's arpeggios
//   day      10:00–17:00   C major, 104, swung: a marimba, the electric piano's offbeats, a walking bass
//   evening  17:00–20:00   E♭ major, 80: the electric piano sings over a pad, brushes
//   night    20:00–5:00    D minor, 70: a music box, a pad and a held bass, almost nothing else
//
// A melody is written an eighth note a word, eight to a bar: a note (`c5`, `f#4`, `bb4`), `-`
// holding the one before, `.` a rest. Chords are named, one or two to a bar.

import { bass, drum, epiano, flute, frames, marimba, midiHz, mix, musicbox, normalize, nylon, pad, random, RATE, reverb, type Drum, type Instrument } from "./synth.ts";

import { PIECES, pieceAt, type PieceName } from "./names.ts";
export { PIECES, pieceAt, type PieceName };

interface Piece {
  bpm: number;
  /** How late the offbeat eighths come, as a part of an eighth. */
  swing: number;
  chords: string[];
  melody: string[];
  lead: Instrument;
  /** The melody an octave on (0) or down (-12). */
  leadShift?: number;
  comp: "arpeggio" | "offbeats" | "held";
  compWith: Instrument;
  bassline: "fifths" | "walking" | "pedal";
  /** Each drum's eight steps a bar: `x` a full hit, `o` a soft one, `.` none. */
  drums: Partial<Record<Drum, string>>;
  wet: number;
  gains: { lead: number; comp: number; bass: number; drums: number; pad?: number };
}

const PIECE: Record<PieceName, Piece> = {
  morning: {
    bpm: 88, swing: 0.12,
    chords: ["Fmaj7", "Em7 A7", "Dm7", "Cm7 F7", "Bbmaj7", "Am7 Dm7", "Gm7", "C7sus C7",
      "Bbmaj7", "C7", "Am7", "Dm7", "Gm7", "C7", "Fmaj7 Dm7", "Gm7 C7"],
    melody: [
      "c5 - - a4 g4 a4 c5 -", "e5 - - d5 c#5 - a4 -", "d5 - - f5 e5 d5 c5 -", "bb4 - a4 - g4 - eb5 -",
      "d5 - - - f5 - d5 -", "c5 - a4 - f5 - e5 -", "d5 - bb4 - a4 g4 f4 -", "g4 - a4 bb4 c5 - - .",
      "f5 - - e5 d5 - f5 -", "e5 - - d5 c5 - bb4 -", "a4 - c5 - e5 - g5 -", "f5 - - - e5 d5 - .",
      "d5 - - bb4 c5 d5 - f5", "e5 - - d5 c5 - g4 -", "a4 - c5 - f5 - e5 -", "d5 - c5 - bb4 - g4 -",
    ],
    lead: flute, comp: "arpeggio", compWith: nylon, bassline: "fifths",
    drums: { brush: "..o...o.", shaker: "o.o.o.oo" },
    wet: 0.3, gains: { lead: 0.9, comp: 0.5, bass: 0.55, drums: 0.35 },
  },
  day: {
    bpm: 104, swing: 0.3,
    chords: ["Cmaj7", "A7", "Dm7", "G7", "Em7", "A7", "Dm7 G7", "Cmaj7",
      "Fmaj7", "Fm6", "Em7", "A7", "Dm7", "G7", "C6 A7", "Dm7 G7"],
    melody: [
      "e5 g5 . e5 d5 c5 . g4", "c#5 - e5 - g5 - e5 c#5", "d5 - f5 a5 - g5 f5 -", "e5 - d5 - b4 . g4 -",
      "g5 - e5 - b4 d5 e5 -", "c#5 e5 - g5 - e5 d5 c#5", "d5 - f5 - b4 - d5 -", "c5 - e5 g5 - . . .",
      "a5 - g5 - f5 e5 - c5", "ab5 - g5 - f5 - d5 -", "g5 - - e5 - d5 e5 -", "c#5 - - e5 a5 - g5 -",
      "f5 - e5 f5 a5 - f5 -", "d5 - b4 d5 f5 - e5 d5", "c5 - e5 - c#5 - e5 -", "d5 - f5 - g5 . b4 -",
    ],
    lead: marimba, comp: "offbeats", compWith: epiano, bassline: "walking",
    drums: { kick: "x...o...", rim: "..x...x.", shaker: "oooooooo" },
    wet: 0.2, gains: { lead: 0.85, comp: 0.45, bass: 0.6, drums: 0.55 },
  },
  evening: {
    bpm: 80, swing: 0.15,
    chords: ["Ebmaj7", "Cm7", "Abmaj7", "Bb7", "Gm7", "C7", "Fm7", "Bb7",
      "Abmaj7", "Gm7 C7", "Fm7", "Bb7", "Ebmaj7", "Db7", "Abmaj7 Bb7", "Ebmaj7"],
    melody: [
      "bb4 - eb5 - g5 - - f5", "eb5 - - - g4 - bb4 -", "c5 - - eb5 - - g5 -", "f5 - - - - - . .",
      "bb4 - d5 - f5 - - g5", "g5 - - e5 - - c5 -", "ab5 - - g5 f5 - eb5 -", "d5 - - - f5 - - .",
      "c6 - - bb5 ab5 - g5 -", "bb5 - - g5 e5 - - .", "f5 - ab5 - c6 - - bb5", "ab5 - - g5 f5 - - .",
      "g5 - - - bb5 - g5 -", "f5 - - db5 ab4 - - .", "c5 - eb5 - d5 - f5 -", "eb5 - - - - - . .",
    ],
    lead: epiano, leadShift: -12, comp: "held", compWith: epiano, bassline: "fifths",
    drums: { kick: "x.......", brush: "..o...o." },
    wet: 0.38, gains: { lead: 1.1, comp: 0.35, bass: 0.55, drums: 0.35, pad: 0.8 },
  },
  night: {
    bpm: 70, swing: 0.1,
    chords: ["Dm9", "Bbmaj7", "Gm7", "A7", "Dm9", "Bbmaj7", "Em7b5", "A7",
      "Fmaj7", "C", "Bbmaj7", "A7", "Dm7", "Gm7", "Bbmaj7 A7", "Dm9"],
    melody: [
      "a5 - - - e5 - f5 -", "d5 - - - a5 - - .", "bb5 - - a5 g5 - d5 -", "e5 - - - c#5 - . .",
      "f5 - - e5 f5 - a5 -", "d6 - - - c6 - a5 -", "g5 - - - bb5 - g5 -", "e5 - - - - - . .",
      "c6 - - a5 - - e5 -", "g5 - - - e5 - c5 -", "d5 - f5 - a5 - - .", "g5 - - e5 c#5 - - .",
      "f5 - - - a5 - d6 -", "bb5 - - a5 g5 - f5 -", "d5 - - - c#5 - e5 -", "d5 - - - - - . .",
    ],
    lead: musicbox, comp: "held", compWith: pad, bassline: "pedal",
    drums: { block: "o.......", shaker: "....o..." },
    wet: 0.5, gains: { lead: 1, comp: 0.9, bass: 0.45, drums: 0.35 },
  },
};

// ---------------------------------------------------------------- reading the score

const NOTE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** A note's name (`c5`, `f#4`, `bb4`, `eb5`) as MIDI. */
export function noteMidi(name: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`music: a note ${name}`);
  return NOTE[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], m6: [0, 3, 7, 9], "6": [0, 4, 7, 9],
  "7sus": [0, 5, 7, 10], m7b5: [0, 3, 6, 10], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
};
const ROOT: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11, Cb: 11 };

/** A chord's root (0 to 11) and its intervals. */
export function chord(name: string): { root: number; tones: number[] } {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(name);
  const tones = m && QUALITY[m[2]!];
  if (!m || !tones) throw new Error(`music: a chord ${name}`);
  return { root: ROOT[m[1]!]!, tones };
}

/** A chord's tones close together from `low` up. */
function voicing(c: { root: number; tones: number[] }, low: number): number[] {
  return c.tones.map((t) => {
    let n = c.root + t;
    while (n < low) n += 12;
    while (n >= low + 12) n -= 12;
    return n;
  }).sort((a, b) => a - b);
}

// ---------------------------------------------------------------- playing it

/** A piece, rendered: its sixteen bars as a seamless loop of mono samples at RATE. */
export function renderPiece(name: PieceName): Float32Array {
  const p = PIECE[name];
  const rand = random(name.length * 7919 + p.bpm);
  const eighth = 60 / p.bpm / 2;
  const bars = p.melody.length;
  const out = new Float32Array(frames(bars * 8 * eighth));
  /** When step `k` of the loop begins, in samples: the offbeats a little late, the hand a little loose. */
  const at = (k: number, loose = 0.004) => Math.round((k * eighth + (k % 2 ? p.swing * eighth : 0) + (rand() - 0.5) * loose) * RATE);
  const play = (inst: Instrument, midi: number, steps: number, step: number, v: number, gain: number) =>
    mix(out, inst(midi, steps * eighth, v * (0.88 + rand() * 0.12), rand), at(step), gain, true);

  for (let bar = 0; bar < bars; bar++) {
    // The melody: a note for as many eighths as it is held.
    const words = p.melody[bar]!.split(/\s+/);
    if (words.length !== 8) throw new Error(`music: ${name} bar ${bar + 1} has ${words.length} eighths`);
    words.forEach((w, s) => {
      if (w === "-" || w === ".") return;
      let hold = 1;
      while (s + hold < 8 && words[s + hold] === "-") hold++;
      play(p.lead, noteMidi(w) + (p.leadShift ?? 0), hold, bar * 8 + s, s % 2 ? 0.82 : 0.95, p.gains.lead);
    });
    // The chords, each over its half of the bar or the whole.
    const names = p.chords[bar]!.split(" ");
    names.forEach((cn, ci) => {
      const c = chord(cn), span = 8 / names.length, from = bar * 8 + ci * span;
      const next = chord(p.chords[(bar + (ci === names.length - 1 ? 1 : 0)) % bars]!.split(" ")[ci === names.length - 1 ? 0 : ci + 1]!);
      const tones = voicing(c, 53);
      if (p.comp === "arpeggio") {
        const order = [0, 1, 2, 3, 2, 1, 3, 1];
        for (let s = 0; s < span; s++) play(p.compWith, tones[order[s % 8]! % tones.length]!, 2, from + s, s % 2 ? 0.45 : 0.6, p.gains.comp);
      } else if (p.comp === "offbeats") {
        const hits = span === 8 ? [2, 6, ...(bar % 2 ? [7] : [])] : [2];
        for (const s of hits) for (const t of tones) play(p.compWith, t, 1, from + s, 0.55, p.gains.comp * 0.55);
      } else {
        for (const t of tones) play(p.compWith, t, span, from, 0.5, p.gains.comp * 0.5);
        if (p.gains.pad) for (const t of voicing(c, 48)) play(pad, t, span, from, 0.6, p.gains.pad);
      }
      // The bass: the root and the fifth, a walk to the next chord, or the root held.
      // From C2 to B2.
      const low = 36 + c.root;
      if (p.bassline === "pedal") play(bass, low, span, from, 0.7, p.gains.bass);
      else if (p.bassline === "fifths") {
        play(bass, low, span / 2, from, 0.8, p.gains.bass);
        play(bass, low + 7, span / 2, from + span / 2, 0.7, p.gains.bass);
      } else {
        // A quarter a beat, the last a half step under the next chord's root (or over it, nearer).
        const to = (next.root - c.root + 12) % 12;
        const approach = (to > 6 ? to - 12 : to) + (to > 6 ? 1 : -1);
        const walk = span === 8 ? [0, c.tones[1]!, 7, approach] : [0, approach];
        walk.forEach((iv, q) => play(bass, low + iv, 2, from + q * 2, q ? 0.7 : 0.85, p.gains.bass));
      }
    });
    // The drums.
    for (const [kind, pattern] of Object.entries(p.drums) as [Drum, string][]) {
      for (let s = 0; s < 8; s++) {
        const c = pattern[s];
        if (c === "x" || c === "o") mix(out, drum(kind, c === "x" ? 1 : 0.55, rand), at(bar * 8 + s, 0.003), p.gains.drums, true);
      }
    }
  }
  return normalize(reverb(out, p.wet, 1, true), 0.8);
}

/** Seconds a piece's loop lasts. */
export function pieceSeconds(name: PieceName): number {
  const p = PIECE[name];
  return (p.melody.length * 8 * 60) / p.bpm / 2;
}

export { midiHz };
