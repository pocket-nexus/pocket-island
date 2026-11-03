// The island's clock: the hour of the day where the player is, from the device's own clock, so a
// morning on the island is a morning at home. The light follows it smoothly: the day's looks (day,
// dusk, night) are keys at hours, and between two keys the light is a mix of both (`skyPhase`).
// A debug offset moves the clock forward or back (held keys in the menu scrub it).

export type Period = "day" | "dusk" | "night";

/** The hours at which each look is at its fullest: night until dawn, dusk-coloured at sunrise and sunset. */
const KEYS: ReadonlyArray<readonly [number, Period]> = [
  [0, "night"], [4.8, "night"], [6.2, "dusk"], [7.8, "day"], [16.6, "day"], [18.2, "dusk"], [19.8, "night"], [24, "night"],
];

export interface SkyPhase {
  /** The hour, 0 to 24. */
  hour: number;
  /** The looks either side of the hour, and how far from `a` to `b` (eased). */
  a: Period;
  b: Period;
  t: number;
}

const wrap = (h: number) => ((h % 24) + 24) % 24;

export function skyPhase(hour: number): SkyPhase {
  const h = wrap(hour);
  for (let k = 0; k + 1 < KEYS.length; k++) {
    const [h0, a] = KEYS[k]!, [h1, b] = KEYS[k + 1]!;
    if (h < h0 || h > h1) continue;
    const x = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
    return { hour: h, a, b, t: x * x * (3 - 2 * x) };
  }
  return { hour: h, a: "night", b: "night", t: 0 };
}

/** The look nearest the hour, for an icon. */
export function periodOf(p: SkyPhase): Period {
  return p.t < 0.5 ? p.a : p.b;
}

/** How much of each look is in the light at a phase (the three add to 1). */
export function weights(p: SkyPhase): Record<Period, number> {
  const w = { day: 0, dusk: 0, night: 0 };
  w[p.a] += 1 - p.t;
  w[p.b] += p.t;
  return w;
}

export class Clock {
  /** Hours added to the device's clock (the debug scrub). */
  offset = 0;
  /** The device's hour now, 0 to 24. */
  now: () => number = () => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  };

  hour(): number {
    return wrap(this.now() + this.offset);
  }

  /** The island's moment, in milliseconds since 1970: the device's, moved by the debug offset (the
   * island's things count days by it, src/core/things.ts localDay). */
  ms(): number {
    return this.wall() + this.offset * 3_600_000;
  }

  /** The device's own moment, in milliseconds since 1970. */
  wall: () => number = () => Date.now();

  /** Move the clock by `hours` (negative is back). The offset is kept whole days and all, so scrubbing
   * past midnight is a new day for the island's things. */
  scrub(hours: number): void {
    this.offset += hours;
  }

  /** Back to the device's own time. */
  reset(): void {
    this.offset = 0;
  }

  /** The hour as "HH:MM". */
  label(hour = this.hour()): string {
    const minutes = Math.floor(hour * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
}

export const clock = new Clock();

/** Hours a second the held debug keys move the clock. */
export const SCRUB_RATE = 3;
