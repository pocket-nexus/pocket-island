// @title Pocket Island
// The 3DS: the island or the room on the upper screen, drawn by the product
// extension (programs/3ds-island) under this interface's HUD; the player's
// phone, or the room's plan, and every list on the touch screen.
import { onMount } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { AuxiliarySurface } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { analogX, analogY, onButtonPress, onFrame, rightAnalogX, rightAnalogY } from "@pocketjs/framework/lifecycle";
import * as E from "./editor.ts";
import { clock } from "../../src/core/clock.ts";
import * as O from "./outdoors.ts";
import { app as phoneApp, phonePress, phoneStick } from "./phone.tsx";
import { sheetPress } from "./sheets.tsx";
import { talkFrame, talking, talkPress } from "./talk.tsx";
import { Top } from "./top.tsx";
import { padFrame, padPress, Touch } from "./touch.tsx";

function Island() {
  const problem = E.packProblem();
  onMount(() => {
    E.restore();
    O.restoreWorld();
  });
  onFrame((buttons) => {
    E.tickFrame();
    E.tickClock(1 / 60);
    // As on the handheld island games: B, L or R held runs outdoors; while the pockets are open the
    // player stands still and the Circle Pad moves their cursor.
    const outdoors = O.place() === "island";
    const pockets = phoneApp() === "pockets" && !E.confirmation() && (outdoors ? !E.sheet() : E.sheet() === "phone");
    const run = !!(buttons & (outdoors ? BTN.CROSS | BTN.LTRIGGER | BTN.RTRIGGER : BTN.CROSS));
    // While someone talks, the player stands and listens.
    talkFrame();
    const still = pockets || talking();
    O.frame(run, still ? 0 : analogX(), still ? 0 : analogY());
    if (pockets) phoneStick(analogX(), analogY());
    O.keepNow();
    padFrame(buttons, rightAnalogX(), rightAnalogY());
  });
  const ALL = 0xffff;
  onButtonPress(ALL, (pressed) => {
    if (talkPress(pressed)) return;
    if (E.confirmation()) {
      if (pressed & BTN.CIRCLE) E.answer(true);
      else if (pressed & BTN.CROSS) E.answer(false);
      return;
    }
    if (E.sheet()) {
      if (E.sheet() === "phone") phonePress(pressed);
      else sheetPress(pressed);
      return;
    }
    padPress(pressed);
  });
  return (
    <>
      <Top problem={problem} />
      <AuxiliarySurface>{() => <Touch />}</AuxiliarySurface>
    </>
  );
}

// The console's clock keeps local time and reports it as UTC, and its scripts' time zone is not to be
// trusted: the island's clock reads it as it is.
clock.zone = () => 0;
mount(() => <Island />);
// For measuring on the console (`bun tools/n3ds.ts eval`): the interface's modules.
(globalThis as unknown as { __islandDebug: unknown }).__islandDebug = { E, O };
