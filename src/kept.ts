// What the browser keeps between visits, each under a name of its own in the page's storage: the
// room (`room/v1`), where the player was and what they carry (`world/v1`), the language (`lang`),
// the sound's switches (`sound`) and what mods keep (`mod:…`). The console keeps the same on its SD
// card (apps/island-3ds). Storage can be blocked, or missing (the console's scripts share
// src/i18n): then nothing is kept, and everything still works for the visit.

const PREFIX = "pocket-island/";
/** Where some were kept before they had a name here: read once from there, and moved. */
const BEFORE: Record<string, string> = { "room/v1": "acnh-room/v1", lang: "acnh-room/lang", sound: "pocket-island-sound" };

/** What is kept under `name`, or null. */
export function kept(name: string): string | null {
  try {
    const now = localStorage.getItem(PREFIX + name);
    if (now !== null) return now;
    const old = BEFORE[name];
    const was = old ? localStorage.getItem(old) : null;
    if (old && was !== null) {
      localStorage.setItem(PREFIX + name, was);
      localStorage.removeItem(old);
    }
    return was;
  } catch {
    return null;
  }
}

/** `text` kept under `name`; null forgets it. */
export function keep(name: string, text: string | null): void {
  try {
    if (text === null) localStorage.removeItem(PREFIX + name);
    else localStorage.setItem(PREFIX + name, text);
  } catch {
    /* not kept: it still holds for this visit */
  }
}
