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
import * as O from "./outdoors.ts";
import { phonePress } from "./phone.tsx";
import { sheetPress } from "./sheets.tsx";
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
    O.frame(!!(buttons & BTN.CROSS), analogX(), analogY());
    O.keepNow();
    padFrame(buttons, rightAnalogX(), rightAnalogY());
  });
  const ALL = 0xffff;
  onButtonPress(ALL, (pressed) => {
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

mount(() => <Island />);
// For measuring on the console (`bun tools/n3ds.ts eval`): the interface's modules.
(globalThis as unknown as { __islandDebug: unknown }).__islandDebug = { E, O };
