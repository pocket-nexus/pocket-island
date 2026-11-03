// What the export hands the interface about the island (tools/cook.ts
// writes it to generated/island.ts): the map as src/core/island.ts made it,
// with its tiers and ground as base64.
import type { Bridge, House, Prop, Ramp, Shop } from "../../src/core/island.ts";

export interface IslandData {
  w: number;
  d: number;
  tier: string;
  ground: string;
  ramps: Ramp[];
  bridges: Bridge[];
  house: House;
  shop: Shop;
  spawn: { x: number; z: number; yaw: number };
  /** The props with a footprint; flowers and shells are not in the way. */
  props: Prop[];
}
