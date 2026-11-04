// @title Pocket Island
// The 3DS: the room on the upper screen, drawn by the product extension
// (programs/3ds-island) under this interface's HUD; its plan and every list
// on the touch screen.
import { onMount } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { AuxiliarySurface } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { analogX, analogY, onButtonPress, onFrame, rightAnalogX, rightAnalogY } from "@pocketjs/framework/lifecycle";
import * as E from "./editor.ts";
import { sheetPress } from "./sheets.tsx";
import { Top } from "./top.tsx";
import { padFrame, padPress, Touch } from "./touch.tsx";

function Island() {
  const problem = E.packProblem();
  onMount(() => {
    E.restore();
    E.syncPlan();
  });
  onFrame((buttons) => {
    E.tickFrame();
    padFrame(buttons, analogX(), analogY(), rightAnalogX(), rightAnalogY());
  });
  const ALL = 0xffff;
  onButtonPress(ALL, (pressed) => {
    if (E.confirmation()) {
      if (pressed & BTN.CIRCLE) E.answer(true);
      else if (pressed & BTN.CROSS) E.answer(false);
      return;
    }
    if (E.sheet()) {
      sheetPress(pressed);
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
