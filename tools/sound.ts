// The console's sound: every sound (src/audio/sfx.ts) and piece of music (src/audio/music.ts),
// rendered by the same scripts the browser plays, into one file the renderer's mixer reads
// (programs/3ds-island/src/audio.c):
//
//   "PSND", version, rate, count
//   count entries of 16 bytes: kind (0 16-bit samples, 1 IMA ADPCM), whether it loops, frames,
//     the data's offset from the file's start, its bytes
//   the data, each four-aligned
//
// The sounds are short and kept as samples, loaded whole; the music is IMA ADPCM (four bits a
// sample) in blocks of BLOCK samples, each opening with the decoder's state, so a piece streams a
// block at a time and comes round to its start. Entries are the sounds in src/audio/names.ts order,
// then the pieces.
//
//   bun tools/sound.ts        (tools/n3ds.ts build runs it) → .pocket-build/3ds/romfs/sound.pack

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PIECES, SOUND_NAMES } from "../src/audio/names.ts";
import { renderPiece } from "../src/audio/music.ts";
import { renderSound } from "../src/audio/sfx.ts";
import { RATE } from "../src/audio/synth.ts";

const root = resolve(import.meta.dir, "..");
const OUT = join(root, ".pocket-build/3ds/romfs/sound.pack");
export const SOUND_VERSION = 1;
/** Samples an ADPCM block holds; its bytes are 4 of state and BLOCK / 2 of nibbles. */
export const BLOCK = 2048;

const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

const pcm16 = (s: Float32Array) => Int16Array.from(s, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));

/** Samples as IMA ADPCM, block by block (each block's first sample is its state's predictor). */
export function adpcm(samples: Int16Array): Uint8Array {
  const blocks = Math.ceil(samples.length / BLOCK);
  const out = new Uint8Array(blocks * (4 + BLOCK / 2));
  const v = new DataView(out.buffer);
  let predictor = 0, index = 0;
  for (let b = 0; b < blocks; b++) {
    const o = b * (4 + BLOCK / 2);
    v.setInt16(o, predictor, true);
    v.setUint8(o + 2, index);
    for (let i = 0; i < BLOCK; i++) {
      const x = samples[b * BLOCK + i] ?? 0;
      const step = STEP[index]!;
      let diff = x - predictor, nibble = 0;
      if (diff < 0) { nibble = 8; diff = -diff; }
      let delta = step >> 3;
      if (diff >= step) { nibble |= 4; diff -= step; delta += step; }
      if (diff >= step >> 1) { nibble |= 2; diff -= step >> 1; delta += step >> 1; }
      if (diff >= step >> 2) { nibble |= 1; delta += step >> 2; }
      predictor = Math.max(-32768, Math.min(32767, predictor + (nibble & 8 ? -delta : delta)));
      index = Math.max(0, Math.min(88, index + INDEX[nibble]!));
      const at = o + 4 + (i >> 1);
      out[at] = i & 1 ? out[at]! | (nibble << 4) : nibble;
    }
  }
  return out;
}

export function writeSound(): { bytes: number; sounds: number; pieces: number } {
  const entries: { kind: number; loop: number; frames: number; data: Uint8Array }[] = [];
  for (const name of SOUND_NAMES) {
    const s = pcm16(renderSound(name));
    entries.push({ kind: 0, loop: 0, frames: s.length, data: new Uint8Array(s.buffer) });
  }
  for (const p of PIECES) {
    const s = pcm16(renderPiece(p));
    entries.push({ kind: 1, loop: 1, frames: s.length, data: adpcm(s) });
  }
  const head = 16 + entries.length * 16;
  let at = head;
  const offsets = entries.map((e) => {
    const o = at;
    at += (e.data.length + 3) & ~3;
    return o;
  });
  const file = new Uint8Array(at), v = new DataView(file.buffer);
  "PSND".split("").forEach((c, i) => (file[i] = c.charCodeAt(0)));
  v.setUint32(4, SOUND_VERSION, true);
  v.setUint32(8, RATE, true);
  v.setUint32(12, entries.length, true);
  entries.forEach((e, k) => {
    const o = 16 + k * 16;
    file[o] = e.kind;
    file[o + 1] = e.loop;
    v.setUint32(o + 4, e.frames, true);
    v.setUint32(o + 8, offsets[k]!, true);
    v.setUint32(o + 12, e.data.length, true);
    file.set(e.data, offsets[k]!);
  });
  mkdirSync(resolve(OUT, ".."), { recursive: true });
  writeFileSync(OUT, file);
  return { bytes: file.length, sounds: SOUND_NAMES.length, pieces: PIECES.length };
}

if (import.meta.main) console.log(`sound: ${JSON.stringify(writeSound())}`);
