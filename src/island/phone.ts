// What the player's phone shows of the island, laid out once for the browser's phone (src/ui/phone.ts)
// and the console's (apps/island-3ds/phone.tsx), as the route's dots are (./route.ts): where the map
// shows the player, what a tap on the map's house does, the day's look's icon, and the clock's bar.

import { doorFront, type IslandMap } from "../core/island.ts";
import { skyPhase, weights, type Period } from "../core/clock.ts";

/** The day's looks in the clock's order (the console numbers them so: day 0, dusk 1, night 2). */
export const PERIODS: readonly Period[] = ["day", "dusk", "night"];

/** Each look's icon (src/ui/icons.ts; on the console, the `ui:` pictures of the same names). */
export const PERIOD_ICON: Record<Period, "sun" | "sunset" | "moon"> = { day: "sun", dusk: "sunset", night: "moon" };

/** The day's looks, a colour an hour along the clock's bar, as #rrggbb. */
const LOOK_RGB: Record<Period, readonly number[]> = { day: [0xf8, 0xd8, 0x6a], dusk: [0xf2, 0x9a, 0x7e], night: [0x3e, 0x4f, 0x8a] };
export const HOUR_COLORS: readonly string[] = Array.from({ length: 24 }, (_, hour) => {
  const w = weights(skyPhase(hour + 0.5));
  const c = [0, 1, 2].map((k) => Math.round(LOOK_RGB.day[k]! * w.day + LOOK_RGB.dusk[k]! * w.dusk + LOOK_RGB.night[k]! * w.night));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
});

/** Whether a tap at (x, z) on the map is on the house (it walks to the door and goes in): the house and its front, a little wider. */
export function onHouse(m: IslandMap, x: number, z: number): boolean {
  const [x0, z0, x1, z1] = m.house.rect;
  return x > x0 - 0.5 && x < x1 + 0.5 && z > z0 - 1 && z < z1 + 0.6;
}

/** Where the map shows the player while they are in the house: at the door, facing out. */
export function atHome(m: IslandMap): { x: number; z: number; yaw: number } {
  return { ...doorFront(m), yaw: 0 };
}
