// Every item, by id. The rules read only the ItemSpec part.

import type { Catalog } from "../core/rules.ts";
import { BASIC } from "./basic.ts";
import { WOODEN } from "./wooden.ts";
import { CUTE } from "./cute.ts";
import { RATTAN } from "./rattan.ts";
import { JAPANESE } from "./japanese.ts";
import { STARRY } from "./starry.ts";
import { NORDIC } from "./nordic.ts";
import { EXTRAS } from "./extras.ts";
import type { FurnitureDef } from "./types.ts";

export const FURNITURE: FurnitureDef[] = [...WOODEN, ...CUTE, ...RATTAN, ...JAPANESE, ...STARRY, ...NORDIC, ...BASIC, ...EXTRAS];

const byId = new Map<string, FurnitureDef>();
for (const def of FURNITURE) {
  if (byId.has(def.id)) throw new Error(`duplicate furniture id ${def.id}`);
  byId.set(def.id, def);
}

export function furniture(id: string): FurnitureDef | undefined {
  return byId.get(id);
}

export const catalog: Catalog = (id) => byId.get(id);
