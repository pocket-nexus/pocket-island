// The mods every host starts, in this order.

import type { Mod } from "./api.ts";
import { welcome } from "./welcome.ts";

export const MODS: readonly Mod[] = [welcome];
