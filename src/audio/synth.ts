// The island's sound is made here, from nothing: a few soft instruments (a mallet, an electric
// piano, a nylon string, a round bass, a music box, a pad, a breathy flute, brushed drums), noise
// and filters for the sounds of things, and a small room's reverb. Everything is rendered into
// mono samples at RATE, the same numbers on every run: the browser plays them (./player.ts) and the
// console's build writes them into its pack (tools/sound.ts).

export const RATE = 22_050;

/** A seeded number source (mulberry32): the same seed, the same numbers. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

/** Samples for `seconds`. */
export const frames = (seconds: number) => Math.max(1, Math.round(seconds * RATE));

/** `src` added into `dst` from sample `at`, times `gain`; with `wrap`, what falls past either end comes round (a loop's tail). */
export function mix(dst: Float32Array, src: Float32Array, at: number, gain = 1, wrap = false): void {
  const n = dst.length;
  for (let i = 0; i < src.length; i++) {
    let k = at + i;
    if (k >= n || k < 0) {
      if (!wrap) {
        if (k >= n) break;
        continue;
      }
      // Round the loop either way: a note a little early at the start ends the loop's last bar.
      k = ((k % n) + n) % n;
    }
    dst[k]! += src[i]! * gain;
  }
}

/** A one-pole low-pass at `hz`, in place. */
export function lowpass(buf: Float32Array, hz: number): Float32Array {
  const a = 1 - Math.exp((-TAU * hz) / RATE);
  let y = 0;
  for (let i = 0; i < buf.length; i++) buf[i] = y += a * (buf[i]! - y);
  return buf;
}

/** A one-pole high-pass at `hz`, in place. */
export function highpass(buf: Float32Array, hz: number): Float32Array {
  const a = Math.exp((-TAU * hz) / RATE);
  let x1 = 0, y = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i]!;
    y = a * (y + x - x1);
    x1 = x;
    buf[i] = y;
  }
  return buf;
}

/** A resonant band-pass (a state-variable filter) whose centre may move: `hz(t)` for t from 0 to 1. */
export function bandpass(buf: Float32Array, hz: number | ((t: number) => number), q = 1.2): Float32Array {
  let low = 0, band = 0;
  const damp = 1 / q;
  for (let i = 0; i < buf.length; i++) {
    const f = typeof hz === "number" ? hz : hz(i / buf.length);
    const k = 2 * Math.sin((Math.PI * Math.min(f, RATE / 4)) / RATE);
    const high = buf[i]! - low - damp * band;
    band += k * high;
    low += k * band;
    buf[i] = band;
  }
  return buf;
}

/** White noise for `n` samples. */
export function noise(n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return out;
}

/** An envelope over `buf`: `attack` seconds up, then a fall by e every `decay` seconds. */
export function shape(buf: Float32Array, attack: number, decay: number): Float32Array {
  const a = Math.max(1, attack * RATE), d = decay * RATE;
  for (let i = 0; i < buf.length; i++) buf[i]! *= (i < a ? i / a : 1) * Math.exp(-Math.max(0, i - a) / d);
  return buf;
}

/** A sine whose pitch moves from `from` to `to` Hz (exponentially) over its length, falling by e every `decay` seconds. */
export function chirp(seconds: number, from: number, to: number, decay: number, attack = 0.002): Float32Array {
  const n = frames(seconds), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += (TAU * from * (to / from) ** t) / RATE;
    out[i] = Math.sin(ph);
  }
  return shape(out, attack, decay);
}

// ---------------------------------------------------------------- instruments

/** A note of an instrument: `seconds` long as written (it may ring on past it), `velocity` 0 to 1. */
export type Instrument = (midi: number, seconds: number, velocity: number, rand: () => number) => Float32Array;

/** A mallet on wooden bars: the bar's tone and its fourth partial, which dies first, and the mallet's tap. */
export const marimba: Instrument = (m, _s, v, rand) => {
  const f = midiHz(m), n = frames(1.1), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = (Math.sin(TAU * f * t) * Math.exp(-t / 0.45) + 0.32 * Math.sin(TAU * f * 3.93 * t) * Math.exp(-t / 0.06)) * Math.min(1, i / 30);
  }
  mix(out, shape(bandpass(noise(frames(0.015), rand), f * 2.5, 2), 0, 0.004), 0, 0.15);
  for (let i = 0; i < n; i++) out[i]! *= v * 0.55;
  return out;
};

/** An electric piano: a tine's tone with a little bark at the start that softens, ringing as the note is held. */
export const epiano: Instrument = (m, s, v) => {
  const f = midiHz(m), hold = s + 0.25, n = frames(hold + 0.6), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const index = 1.2 * Math.exp(-t / 0.35) + 0.15;
    const tone = Math.sin(TAU * f * t + index * Math.sin(TAU * f * t));
    const bell = 0.12 * Math.sin(TAU * f * 7.1 * t) * Math.exp(-t / 0.04);
    const release = t < hold ? 1 : Math.exp(-(t - hold) / 0.12);
    out[i] = (tone + bell) * Math.exp(-t / 1.6) * release * Math.min(1, i / 40);
  }
  for (let i = 0; i < n; i++) out[i]! *= v * 0.35;
  return out;
};

/** A nylon string plucked (Karplus–Strong): bright at the pluck, mellowing as it rings. */
export const nylon: Instrument = (m, s, v, rand) => {
  const f = midiHz(m), period = Math.max(2, Math.round(RATE / f)), n = frames(Math.max(s + 0.3, 1.4));
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = rand() * 2 - 1;
  // A softer pluck: the burst smoothed first.
  for (let k = 0; k < 3; k++) for (let i = 1; i < period; i++) line[i] = (line[i]! + line[i - 1]!) * 0.5;
  const out = new Float32Array(n);
  let at = 0;
  for (let i = 0; i < n; i++) {
    const next = (at + 1) % period;
    const y = line[at]!;
    line[at] = 0.996 * 0.5 * (y + line[next]!);
    out[i] = y;
    at = next;
  }
  highpass(out, 60);
  for (let i = 0; i < n; i++) out[i]! *= v * 0.7;
  return out;
};

/** A round bass: a sine with a little of its octave, a soft thump, gone soon after the note. */
export const bass: Instrument = (m, s, v) => {
  const f = midiHz(m), hold = s * 0.92, n = frames(hold + 0.2), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const release = t < hold ? 1 : Math.exp(-(t - hold) / 0.05);
    out[i] = (Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * 2 * f * t)) * Math.exp(-t / 1.2) * release * Math.min(1, i / 60);
  }
  for (let i = 0; i < n; i++) out[i]! *= v * 0.6;
  return out;
};

/** A music box's comb: a pure high tone, a bell's partials, a long ring. */
export const musicbox: Instrument = (m, _s, v) => {
  const f = midiHz(m), n = frames(1.8), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = (Math.sin(TAU * f * t) * Math.exp(-t / 0.9) + 0.25 * Math.sin(TAU * f * 2.98 * t) * Math.exp(-t / 0.25) + 0.08 * Math.sin(TAU * f * 5.43 * t) * Math.exp(-t / 0.08)) * Math.min(1, i / 20);
  }
  for (let i = 0; i < n; i++) out[i]! *= v * 0.32;
  return out;
};

/** A soft pad: three detuned triangles, slow to come and to go, darkened. */
export const pad: Instrument = (m, s, v) => {
  const f = midiHz(m), n = frames(s + 1.2), out = new Float32Array(n);
  const tri = (p: number) => 1 - 4 * Math.abs(((p % 1) + 1) % 1 - 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.5) * (t < s ? 1 : Math.exp(-(t - s) / 0.45));
    out[i] = (tri(f * t) + tri(f * 1.004 * t) + tri(f * 0.996 * t)) * env;
  }
  lowpass(out, 1400);
  for (let i = 0; i < n; i++) out[i]! *= v * 0.12;
  return out;
};

/** A breathy flute: a sine and a little of its octave, a vibrato that comes in, a breath of noise. */
export const flute: Instrument = (m, s, v, rand) => {
  const f = midiHz(m), n = frames(s + 0.15), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const vib = 1 + 0.004 * Math.sin(TAU * 5.2 * t) * Math.min(1, Math.max(0, (t - 0.18) / 0.3));
    ph += (TAU * f * vib) / RATE;
    const env = Math.min(1, t / 0.05) * (t < s ? 1 : Math.exp(-(t - s) / 0.06));
    out[i] = (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * env;
  }
  // A breath of noise under the tone, low and soft.
  const breath = shape(lowpass(noise(n, rand), 1800), 0.04, 0.25);
  mix(out, breath, 0, 0.025);
  for (let i = 0; i < n; i++) out[i]! *= v * 0.3;
  return out;
};

// ---------------------------------------------------------------- drums

export type Drum = "kick" | "rim" | "shaker" | "brush" | "snap" | "block";

export function drum(kind: Drum, v: number, rand: () => number): Float32Array {
  switch (kind) {
    case "kick": {
      const k = chirp(0.22, 120, 48, 0.09, 0.001);
      mix(k, shape(lowpass(noise(frames(0.02), rand), 900), 0, 0.006), 0, 0.3);
      return scale(k, v * 0.7);
    }
    case "rim": {
      const r = chirp(0.06, 820, 760, 0.012, 0.0005);
      mix(r, shape(bandpass(noise(frames(0.04), rand), 2200, 3), 0, 0.008), 0, 0.6);
      return scale(r, v * 0.35);
    }
    case "shaker":
      return scale(shape(highpass(noise(frames(0.07), rand), 5000), 0.012, 0.022), v * 0.18);
    case "brush":
      return scale(shape(bandpass(noise(frames(0.22), rand), 3200, 0.7), 0.03, 0.06), v * 0.22);
    case "snap":
      return scale(shape(bandpass(noise(frames(0.05), rand), 2600, 4), 0.0005, 0.01), v * 0.45);
    case "block": {
      const b = chirp(0.08, 1250, 1180, 0.018, 0.0005);
      return scale(b, v * 0.3);
    }
  }
}

export function scale(buf: Float32Array, g: number): Float32Array {
  for (let i = 0; i < buf.length; i++) buf[i]! *= g;
  return buf;
}

// ---------------------------------------------------------------- the room's air

/** A small room's reverb (four combs, two all-passes), its tail wrapping round to the start of a loop. */
export function reverb(dry: Float32Array, wet: number, size = 1, loop = false): Float32Array {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round((d * size * RATE) / 44_100));
  const passes = [225, 556].map((d) => Math.round((d * RATE) / 44_100));
  const n = dry.length, tail = loop ? n : n + frames(2.5);
  const out = new Float32Array(tail);
  // Twice round a loop, so its start hears its end.
  const rounds = loop ? 2 : 1;
  const sum = new Float32Array(tail);
  for (const d of combs) {
    const line = new Float32Array(d);
    let at = 0, store = 0;
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < tail; i++) {
        const x = i < n ? dry[i]! : 0;
        const y = line[at]!;
        store = y * 0.72 + store * 0.28;
        line[at] = x + store * 0.8;
        at = (at + 1) % d;
        if (r === rounds - 1) sum[i]! += y * 0.25;
      }
    }
  }
  for (const d of passes) {
    const line = new Float32Array(d);
    let at = 0;
    // A loop's all-passes, too, run round once before they are heard.
    if (loop) {
      for (let i = 0; i < tail; i++) {
        const b = line[at]!;
        line[at] = sum[i]! + b * 0.5;
        at = (at + 1) % d;
      }
    }
    for (let i = 0; i < tail; i++) {
      const b = line[at]!;
      const x = sum[i]!;
      line[at] = x + b * 0.5;
      sum[i] = b - x * 0.5;
      at = (at + 1) % d;
    }
  }
  for (let i = 0; i < tail; i++) out[i] = (i < n ? dry[i]! : 0) + sum[i]! * wet;
  return out;
}

/** Peaks brought under `ceiling`, softly (a tanh), and the whole scaled so the loudest is there. */
export function normalize(buf: Float32Array, ceiling = 0.9): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
  if (peak < 1e-6) return buf;
  const g = 1.4 / peak;
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i]! * g) * ceiling;
  return buf;
}
