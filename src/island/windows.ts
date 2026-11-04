// The house's windows as seen from the island: how the rooms inside light them, and their colours.
// The browser's house (./house.ts) and the console's (programs/3ds-island/src/scene.c, given them by
// apps/island-3ds/editor.ts and its pack) both draw by these. Nothing here needs a renderer.

/**
 * The windows' glow: warm, or under a cool ceiling light cool, at `glow` times the night's (the
 * export hands the console's pack these, tools/cook.ts VIEW).
 */
export const HOUSE_WINDOW = { warm: "#ffcf86", cool: "#e4eeff", glow: 1.5 } as const;

/** How many of `items` are lamps that are on: those whose definition gives light (`light(id)`), as switched or as they start. */
export function lampsOn(items: readonly { item: string; on?: boolean }[], light: (id: string) => { startsOn?: boolean } | undefined): number {
  return items.filter((p) => {
    const l = light(p.item);
    return !!l && (p.on ?? l.startsOn ?? false);
  }).length;
}

/** How the rooms inside light the windows: all of their glow under the ceiling light, a little from the
 * lamps that are on when it is off, none when nothing is on. */
export function houseLight(ceiling: "warm" | "cool" | "off", lampsOn: number): { glow: number; cool: boolean } {
  if (ceiling !== "off") return { glow: 1, cool: ceiling === "cool" };
  return { glow: lampsOn > 0 ? Math.min(0.6, 0.25 + 0.12 * lampsOn) : 0, cool: false };
}
