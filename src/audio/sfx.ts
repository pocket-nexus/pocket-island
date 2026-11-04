// The sounds of things, made from noise, filters and a few tones (./synth.ts): steps on each ground
// (four of each, so that a walk is not one sound over and over), what the hands and the tools do,
// the water and the fish, things getting got, the door, the interface's keys, coins, and the
// syllables the island's people speak in. Each is a short mono clip at RATE.

import { SOUND_NAMES } from "./names.ts";
import { bandpass, chirp, frames, highpass, lowpass, mix, musicbox, noise, normalize, random, RATE, scale, shape } from "./synth.ts";

const TAU = Math.PI * 2;

/** A tone with partials, each its own fall (`decays` seconds), all from one attack. */
function tones(seconds: number, partials: [number, number, number][], attack = 0.002): Float32Array {
  const n = frames(seconds), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let v = 0;
    for (const [hz, gain, decay] of partials) v += gain * Math.sin(TAU * hz * t) * Math.exp(-t / decay);
    out[i] = v * Math.min(1, t / attack);
  }
  return out;
}

/** Clips laid one after another at the given times (seconds). */
function sequence(parts: [number, Float32Array, number][], seconds: number): Float32Array {
  const out = new Float32Array(frames(seconds));
  for (const [t, clip, gain] of parts) mix(out, clip, Math.round(t * RATE), gain);
  return out;
}

const STEPS = ["grass", "sand", "path", "wood", "stone", "rug"] as const;
export type StepGround = (typeof STEPS)[number];

/** A foot on `ground`, the `v`th of its four. */
function step(ground: StepGround, v: number): Float32Array {
  const rand = random(1000 + STEPS.indexOf(ground) * 17 + v);
  const pitch = 0.92 + 0.05 * v;
  switch (ground) {
    case "grass": {
      // Blades brushed aside, twice close together.
      const a = shape(bandpass(noise(frames(0.09), rand), 2400 * pitch, 0.9), 0.006, 0.025);
      const b = shape(bandpass(noise(frames(0.07), rand), 3400 * pitch, 1.1), 0.004, 0.018);
      return sequence([[0, a, 1], [0.025, b, 0.6]], 0.12);
    }
    case "sand": {
      // A soft crunch: grains, unevenly.
      const n = frames(0.12), out = lowpass(noise(n, rand), 1500 * pitch);
      for (let i = 0; i < n; i++) out[i]! *= 0.5 + rand();
      return shape(out, 0.01, 0.035);
    }
    case "path": {
      // A dull thud on packed earth, and a little grit.
      const thud = chirp(0.08, 110 * pitch, 70, 0.025, 0.001);
      return sequence([[0, thud, 0.9], [0.002, shape(lowpass(noise(frames(0.06), rand), 700), 0.002, 0.015), 0.7]], 0.09);
    }
    case "wood":
      // A hollow knock on planks.
      return sequence([[0, tones(0.12, [[185 * pitch, 1, 0.03], [420 * pitch, 0.45, 0.015], [960 * pitch, 0.2, 0.006]], 0.0008), 1],
        [0, shape(bandpass(noise(frames(0.02), rand), 2000, 2), 0, 0.004), 0.4]], 0.13);
    case "stone":
      // A tap on stone: a click and a short ring.
      return sequence([[0, shape(highpass(noise(frames(0.03), rand), 3000), 0, 0.005), 0.8], [0, tones(0.05, [[930 * pitch, 0.5, 0.01]], 0.0005), 1]], 0.06);
    case "rug":
      return shape(lowpass(noise(frames(0.08), rand), 380 * pitch), 0.012, 0.025);
  }
}

/** A syllable of the island's speech: a voiced buzz through a vowel's two formants, a little glide. */
function syllable(k: number): Float32Array {
  const vowels: [number, number][] = [[800, 1200], [400, 2200], [300, 2600], [500, 900], [350, 800], [600, 1700]];
  const [f1, f2] = vowels[k % vowels.length]!;
  const n = frames(0.075), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += (TAU * 220 * (1 + 0.08 * Math.sin(Math.PI * t))) / RATE;
    // A buzz rich in harmonics: a clipped sine.
    out[i] = Math.max(-0.6, Math.min(0.6, Math.sin(ph) * 2));
  }
  const a = bandpass(Float32Array.from(out), f1, 4), b = bandpass(Float32Array.from(out), f2, 6);
  const voice = new Float32Array(n);
  for (let i = 0; i < n; i++) voice[i] = a[i]! + 0.6 * b[i]!;
  return shape(voice, 0.006, 0.03);
}

/** Every sound by name. */
const MAKERS: Record<string, () => Float32Array> = {
  // The hands and the tools.
  pick: () => sequence([[0, chirp(0.09, 520, 1250, 0.03), 1], [0.03, chirp(0.06, 1300, 1700, 0.02), 0.4]], 0.12),
  pull: () => {
    const rand = random(21);
    return sequence([[0, shape(bandpass(noise(frames(0.22), rand), (t) => 2400 - 1600 * t, 1.4), 0.01, 0.08), 1], [0.16, chirp(0.08, 400, 900, 0.03), 0.6]], 0.28);
  },
  shake: () => {
    const rand = random(22), n = frames(0.7), out = bandpass(noise(n, rand), 3200, 0.8);
    for (let i = 0; i < n; i++) out[i]! *= (0.55 + 0.45 * Math.sin((TAU * 22 * i) / RATE)) * Math.min(1, i / 800) * Math.exp(-i / (0.35 * RATE));
    return out;
  },
  chop: () => {
    const rand = random(23);
    return sequence([[0, chirp(0.14, 210, 90, 0.04, 0.0005), 1], [0, shape(lowpass(noise(frames(0.08), rand), 1600), 0, 0.02), 0.8], [0.004, shape(bandpass(noise(frames(0.03), rand), 3500, 3), 0, 0.006), 0.5]], 0.18);
  },
  dig: () => {
    const rand = random(24), n = frames(0.26), out = lowpass(noise(n, rand), 900);
    for (let i = 0; i < n; i++) out[i]! *= 0.4 + rand() * 0.9;
    return sequence([[0, shape(out, 0.015, 0.07), 1], [0, tones(0.12, [[2300, 0.25, 0.03], [3100, 0.15, 0.02]]), 1]], 0.3);
  },
  swing: () => shape(bandpass(noise(frames(0.26), random(25)), (t) => 500 + 1500 * Math.sin(Math.PI * t), 1.6), 0.08, 0.08),
  cast: () => shape(bandpass(noise(frames(0.38), random(26)), (t) => 400 + 2200 * t, 1.8), 0.12, 0.12),
  plop: () => sequence([[0, chirp(0.08, 1100, 320, 0.03), 1], [0.05, chirp(0.05, 700, 1500, 0.015), 0.35], [0.09, chirp(0.04, 900, 1700, 0.012), 0.25]], 0.16),
  nibble: () => chirp(0.04, 1500, 800, 0.012),
  bite: () => {
    const rand = random(27);
    return sequence([[0, shape(lowpass(noise(frames(0.35), rand), 2600), 0.003, 0.09), 1], [0, chirp(0.12, 600, 200, 0.05), 0.8]], 0.4);
  },
  reel: () => {
    const out = new Float32Array(frames(0.34));
    for (let k = 0; k < 11; k++) mix(out, tones(0.02, [[2600 + 80 * (k % 3), 0.5, 0.004]], 0.0003), Math.round(k * 0.03 * RATE));
    return out;
  },
  catch: () => {
    // A little fanfare: up the chord, and a sparkle.
    const notes = [72, 76, 79, 84].map((m, k) => [k * 0.09, musicbox(m, 0.3, 1, random(28 + k)), 1] as [number, Float32Array, number]);
    return sequence([...notes, [0.36, musicbox(88, 0.3, 0.7, random(40)), 0.8]], 1.6);
  },
  escape: () => {
    const rand = random(29);
    return sequence([[0, shape(lowpass(noise(frames(0.3), rand), 2200), 0.002, 0.08), 0.8], [0.12, chirp(0.4, 520, 260, 0.2, 0.02), 0.5]], 0.6);
  },
  got: () => sequence([[0, musicbox(79, 0.2, 0.9, random(30)), 1], [0.08, musicbox(84, 0.3, 1, random(31)), 1]], 1),
  land: () => sequence([[0, chirp(0.1, 140, 60, 0.03, 0.0005), 1], [0, shape(lowpass(noise(frames(0.05), random(32)), 900), 0, 0.012), 0.6]], 0.12),
  broke: () => {
    const rand = random(33);
    return sequence([[0, shape(highpass(noise(frames(0.12), rand), 1500), 0, 0.03), 1], [0.02, chirp(0.3, 900, 300, 0.12), 0.6], [0.1, chirp(0.25, 700, 220, 0.1), 0.5]], 0.45);
  },
  new: () => {
    const notes = [84, 88, 91, 96].map((m, k) => [k * 0.07, musicbox(m, 0.2, 0.8, random(50 + k)), 1] as [number, Float32Array, number]);
    return sequence(notes, 1.4);
  },
  door: () => {
    // A latch, the door swinging on its hinge, and its soft close.
    const rand = random(34);
    const creak = new Float32Array(frames(0.35));
    let ph = 0;
    for (let i = 0; i < creak.length; i++) {
      const t = i / creak.length;
      ph += (TAU * (240 + 90 * Math.sin(TAU * 3 * t))) / RATE;
      creak[i] = Math.sign(Math.sin(ph)) * 0.3 * Math.sin(Math.PI * t);
    }
    return sequence([[0, tones(0.05, [[1800, 0.5, 0.008]], 0.0005), 0.8], [0.05, bandpass(creak, 900, 3), 0.6], [0.4, chirp(0.12, 120, 70, 0.04), 0.9], [0.4, shape(lowpass(noise(frames(0.05), rand), 800), 0, 0.012), 0.5]], 0.6);
  },
  coin: () => sequence([[0, tones(0.4, [[2650, 0.6, 0.12], [3950, 0.35, 0.08]]), 1], [0.07, tones(0.5, [[3300, 0.6, 0.15], [4900, 0.3, 0.08]]), 1]], 0.6),
  // The interface's keys.
  open: () => sequence([[0, chirp(0.06, 700, 1050, 0.03), 1], [0.04, chirp(0.06, 1050, 1400, 0.03), 0.8]], 0.12),
  close: () => sequence([[0, chirp(0.06, 1300, 950, 0.03), 0.8], [0.04, chirp(0.06, 950, 650, 0.03), 1]], 0.12),
  move: () => tones(0.03, [[2100, 0.6, 0.006]], 0.0005),
  ok: () => chirp(0.07, 800, 1300, 0.03),
  cancel: () => chirp(0.07, 700, 420, 0.03),
  tool: () => sequence([[0, shape(bandpass(noise(frames(0.08), random(35)), 2600, 1.5), 0.01, 0.02), 0.7], [0.03, tones(0.04, [[1600, 0.4, 0.008]]), 1]], 0.1),
};
for (const g of STEPS) for (let v = 0; v < 4; v++) MAKERS[`step.${g}.${v}`] = () => step(g, v);
for (let k = 0; k < 6; k++) MAKERS[`voice.${k}`] = () => syllable(k);

if (Object.keys(MAKERS).sort().join() !== [...SOUND_NAMES].sort().join()) throw new Error("sfx: the sounds made and ./names.ts differ");

/** How loud each kind of sound is made, as a peak (steps quiet, a catch's fanfare bright). */
function level(name: string): number {
  if (name.startsWith("step.")) return name.includes(".rug.") ? 0.25 : 0.45;
  if (name.startsWith("voice.")) return 0.35;
  if (["move", "nibble"].includes(name)) return 0.35;
  if (["catch", "new", "got", "coin"].includes(name)) return 0.6;
  return 0.55;
}

/** A sound, rendered. */
export function renderSound(name: string): Float32Array {
  const make = MAKERS[name];
  if (!make) throw new Error(`sfx: no sound ${name}`);
  return scale(normalize(make(), 1), level(name));
}

