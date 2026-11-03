// Renders the island's sound off the page's thread: a piece of music or a sound by name, sent back
// as samples (./music.ts, ./sfx.ts).
import { renderPiece, type PieceName } from "./music.ts";
import { renderSound } from "./sfx.ts";

self.onmessage = (e: MessageEvent<{ kind: "piece" | "sound"; name: string }>) => {
  const { kind, name } = e.data;
  const samples = kind === "piece" ? renderPiece(name as PieceName) : renderSound(name);
  (self as unknown as Worker).postMessage({ kind, name, samples }, [samples.buffer]);
};
