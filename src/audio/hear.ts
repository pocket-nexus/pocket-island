// Where the shared scripts send a sound (the conversations, the shop): the browser's player or the
// console's mixer, whichever is listening (src/audio/player.ts, apps/island-3ds/sound.ts). Nothing is heard
// until one is.
import type { Cue } from "./cues.ts";

export const hear: { play(cue: Cue): void } = { play() {} };

/** A sound by name (src/audio/sfx.ts). */
export function sound(name: string, gain = 0.7, rate = 1): void {
  hear.play({ sound: name, gain, rate });
}
