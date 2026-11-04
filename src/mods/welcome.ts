// A mod as an example: the first time each run that the player comes home, the house says
// welcome; the hundredth time it says so, with the count kept between runs.

import type { Mod } from "./api.ts";

export const welcome: Mod = {
  id: "welcome",
  start(ctx) {
    let greeted = false;
    ctx.on("place", (place) => {
      if (place !== "house") return;
      const visits = Number(ctx.kept("visits") ?? 0) + 1;
      ctx.keep("visits", String(visits));
      if (visits % 100 === 0) ctx.say("mod.welcome.visits", { n: visits });
      else if (!greeted) ctx.say("mod.welcome.home");
      greeted = true;
    });
  },
};
