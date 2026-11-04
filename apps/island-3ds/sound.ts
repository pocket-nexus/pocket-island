// The island's sound on the console, as in the browser (src/audio/player.ts): the frame's cues
// (src/audio/cues.ts) and the hour's music, through the renderer's mixer (programs/3ds-island/src/audio.c,
// `island.sound`, `island.music`) by their places in src/audio/names.ts. The music is softer inside
// the house and lower while someone talks or the shop is open; the menu switches music and sounds
// off. A program without the mixer is silent.
import { Cues, type Cue } from "../../src/audio/cues.ts";
import { hear } from "../../src/audio/hear.ts";
import { MIX, musicLevel, PIECES, pieceAt, SOUND_NAMES } from "../../src/audio/names.ts";
import type { GameState, Surface } from "../../src/core/game.ts";
import { island } from "./host.ts";

const index = new Map<string, number>(SOUND_NAMES.map((n, k) => [n, k]));

export function play(c: Cue): void {
  const k = index.get(c.sound);
  if (k !== undefined) island.sound?.(k, c.gain * MIX.sounds, c.rate);
}
hear.play = play;
// The music's fades, as the browser's.
island.mix?.(MIX.crossfade, MIX.first, MIX.level);

const cues = new Cues();

/** What a frame's events (or a press's) sound like. */
export function heard(events: number, state: GameState, surface: Surface, flooring: string): void {
  for (const c of cues.frame(events, state, surface, flooring)) play(c);
}

let lastPiece = -2, lastGain = -1;

/** The music for `hour`: inside or out, quieter while someone talks. */
export function music(hour: number, inside: boolean, quiet: boolean): void {
  const piece = SOUND_NAMES.length + PIECES.indexOf(pieceAt(hour));
  const gain = musicLevel(inside, quiet);
  if (piece === lastPiece && Math.abs(gain - lastGain) < 0.01) return;
  lastPiece = piece;
  lastGain = gain;
  island.music?.(piece, gain);
}

export function volumes(musicOn: boolean, soundsOn: boolean): void {
  island.volumes?.(musicOn ? 1 : 0, soundsOn ? 1 : 0);
}
