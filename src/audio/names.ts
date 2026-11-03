// The island's sounds and pieces by name, and so by number: the console's pack keeps them in this
// order (tools/sound.ts), and its interface asks for one by its place here. The sounds are made in
// ./sfx.ts, the pieces in ./music.ts.

export const SOUND_NAMES = [
  "bite", "broke", "cancel", "cast", "catch", "chop", "close", "coin", "dig", "door", "escape", "got", "land", "move", "new",
  "nibble", "ok", "open", "pick", "plop", "pull", "reel", "shake",
  ...["grass", "path", "rug", "sand", "stone", "wood"].flatMap((g) => [0, 1, 2, 3].map((v) => `step.${g}.${v}`)),
  "swing", "tool",
  ...[0, 1, 2, 3, 4, 5].map((k) => `voice.${k}`),
] as const;

export type PieceName = "morning" | "day" | "evening" | "night";
export const PIECES: PieceName[] = ["morning", "day", "evening", "night"];

/** The piece for an hour of the day (0 to 24). */
export function pieceAt(hour: number): PieceName {
  return hour >= 5 && hour < 10 ? "morning" : hour >= 10 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "evening" : "night";
}
