// The touch screen, as on the handheld decorating games: the room's plan
// under the stylus, the layers above it, the toolbar below it.
//
//   tap a piece            select it; tap it again to turn it
//   drag a piece           move it (and the rest of the selection); its footprint
//                          shows green where it fits and red where it does not
//   drag onto Put away     store it
//   drag empty floor       select what the box covers
//   L or R held + tap      a copy beside it
import { createMemo, createSignal, For, Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { byUid } from "../../src/core/rules.ts";
import { picture } from "./catalog.ts";
import * as E from "./editor.ts";
import { Pill, Seg, Swatch, Tap, ToolKey } from "./parts.tsx";
import { IslandMap } from "./map.tsx";
import * as O from "./outdoors.ts";
import { Sheets } from "./sheets.tsx";
import { CORAL, CREAM, INK, INK_SOFT, PAPER, SUN, tint } from "./theme.ts";

const W = 320, H = 240;
const TOOLBAR = 38;

/** Buttons held this frame (L and R turn a tap into a copy). */
let held = 0;
export const heldButtons = () => held;
export function noteHeld(buttons: number): void {
  held = buttons;
}

export function Touch() {
  return (
    <View class="relative" style={{ width: W, height: H }}>
      <Show when={O.place() === "house"} fallback={<IslandMap />}>
        <LayerBar />
        <PlanOverlay />
        <Inspector />
        <Toolbar />
      </Show>
      <Sheets />
      <Confirm />
    </View>
  );
}

// ---------------------------------------------------------------- layers

function LayerBar() {
  const items = () => E.LAYERS.map((value) => ({ value, label: E.tr(LAYER_KEYS[value]) }));
  return (
    <View class="absolute flex-row items-center px-1" style={{ insetL: 0, insetT: 0, width: W, height: 28, bgColor: CREAM }}>
      <Seg items={items()} value={E.layer()} width={W - 8} height={18} leaf onPick={(l) => E.setLayer(l)} />
    </View>
  );
}
const LAYER_KEYS = { all: "layer.all", floor: "layer.floor", rug: "layer.rug", ceiling: "layer.ceiling", wall: "layer.wall" } as const;

// ---------------------------------------------------------------- the plan

function PlanOverlay() {
  const view = createMemo(() => (E.room(), E.layer(), E.wall(), E.planView()));
  const [box, setBox] = createSignal<[number, number, number, number] | null>(null);
  let pressed: string | null = null;
  let boxing = false;
  const area = () => (E.sheet() || E.confirmation() || O.place() !== "house" ? null : E.PLAN_AREA);
  createGesture({
    surface: "auxiliary",
    region: { rect: area },
    onDown: (c) => {
      const [x, z] = E.fromPlan(c.x, c.y);
      pressed = E.itemAt(x, z);
    },
    onTap: (c) => {
      const [x, z] = E.fromPlan(c.x, c.y);
      const uid = E.itemAt(x, z);
      if (!uid) {
        E.clearSelection();
        return;
      }
      if (heldButtons() & (BTN.LTRIGGER | BTN.RTRIGGER)) {
        E.copy(uid);
        return;
      }
      const sel = E.selection();
      // A second tap on the one piece selected turns it, as on the handhelds.
      if (sel.size === 1 && sel.has(uid)) E.rotate();
      else E.select([uid]);
    },
    onPanStart: (c) => {
      if (pressed) {
        E.beginCarry(pressed, c.x, c.y);
        boxing = false;
      } else {
        boxing = true;
        setBox([c.startX, c.startY, c.x, c.y]);
      }
    },
    onPanMove: (c) => {
      if (boxing) setBox([c.startX, c.startY, c.x, c.y]);
      else E.moveCarry(c.x, Math.min(c.y, E.PLAN_AREA.y + E.PLAN_AREA.h - 1));
    },
    onPanEnd: (c) => {
      if (boxing) {
        boxing = false;
        setBox(null);
        E.boxSelect(c.startX, c.startY, c.x, c.y);
        return;
      }
      E.dropCarry(c.y > H - TOOLBAR);
    },
    onCancel: () => {
      boxing = false;
      setBox(null);
      E.cancelCarry();
    },
  });

  // The grid: a line on every tile's edge.
  const lines = createMemo(() => {
    const v = view();
    const s = E.room();
    const across = v.mode === "floor" ? s.w : v.length, down = v.mode === "floor" ? s.d : 3;
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i <= across; i++) out.push({ x: v.x0 + i * v.s, y: v.y0, w: 1, h: down * v.s });
    for (let j = 0; j <= down; j++) out.push({ x: v.x0, y: v.y0 + j * v.s, w: across * v.s, h: 1 });
    return out;
  });
  const outlines = createMemo(() => {
    const s = E.room();
    const sel = E.selection();
    return [...sel].map((uid) => byUid(s, uid)).filter((p) => p && E.inLayer(p)).map((p) => E.rectOf(s, p!)).filter((r) => !!r).map((r) => E.toPlan(r!));
  });
  const door = createMemo(() => (view().mode === "floor" ? E.toPlan(E.door()) : null));
  const wallItems = () => [
    { value: "left" as const, label: E.tr("ds.wall.left") },
    { value: "back" as const, label: E.tr("ds.wall.back") },
    { value: "right" as const, label: E.tr("ds.wall.right") },
  ];
  return (
    <>
      <For each={lines()}>{(l) => <View class="absolute" style={{ insetL: l.x, insetT: l.y, width: l.w, height: l.h, bgColor: tint(INK, 0.16) }} />}</For>
      <Show when={door()}>
        <View class="absolute rounded-sm" style={{ insetL: door()![0] + 2, insetT: door()![1] + door()![3] - 4, width: door()![2] - 4, height: 4, bgColor: tint(INK, 0.45) }} />
      </Show>
      <For each={outlines()}>
        {(r) => <View class="absolute rounded-md" style={{ insetL: r[0] - 2, insetT: r[1] - 2, width: r[2] + 4, height: r[3] + 4, borderWidth: 2, borderColor: SUN }} />}
      </For>
      <Show when={box()}>
        <View class="absolute" style={{ insetL: Math.min(box()![0], box()![2]), insetT: Math.min(box()![1], box()![3]), width: Math.abs(box()![2] - box()![0]), height: Math.abs(box()![3] - box()![1]), borderWidth: 1, borderColor: INK, bgColor: tint(SUN, 0.25) }} />
      </Show>
      <Show when={E.layer() === "wall"}>
        <View class="absolute" style={{ insetL: 60, insetT: E.PLAN_AREA.y + 2 }}>
          <Seg items={wallItems()} value={E.wall()} width={200} height={16} onPick={(w) => E.setWall(w)} />
        </View>
      </Show>
    </>
  );
}

// ---------------------------------------------------------------- the selection

function Inspector() {
  const sel = () => E.selected();
  const one = () => (sel().length === 1 ? sel()[0]! : null);
  return (
    <Show when={sel().length && !E.carrying() && !E.sheet()}>
      <View class="absolute flex-row items-center gap-1 rounded-xl px-2" style={{ insetL: 4, insetB: TOOLBAR + 2, width: W - 8, height: 34, bgColor: tint(PAPER, 0.96) }}>
        <View class="flex-col" style={{ width: 92 }}>
          <Text class="text-2xs font-bold" style={{ textColor: INK }}>{one() ? E.nameOf(one()!.def) : E.tr("inspector.selected", { n: sel().length })}</Text>
          <Show when={one()}>
            <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{E.variantNameOf(one()!.def.variants[one()!.placement.variant])}</Text>
          </Show>
        </View>
        <Show when={one()}>
          <View class="flex-row gap-1" style={{ width: 96 }}>
            <For each={one()!.def.variants.slice(0, 4)}>{(v, i) => <Swatch color={v.swatch} on={i() === one()!.placement.variant} onTap={() => E.setVariant(i())} />}</For>
          </View>
        </Show>
        <Show when={!one()}>
          <View style={{ width: 96 }} />
        </Show>
        <Show when={one() && (one()!.def.light || one()!.def.switchable)}>
          <Pill icon={one()!.placement.on ?? one()!.def.light?.startsOn ? "bulb" : "bulb-off"} width={26} height={26} small onTap={() => E.toggle(one()!.placement.uid)} />
        </Show>
        <Pill icon="rotate" width={26} height={26} small onTap={E.rotate} />
        <Pill icon="box" width={26} height={26} small onTap={() => E.putAway()} />
      </View>
    </Show>
  );
}

// ---------------------------------------------------------------- the toolbar

const TIME_ICONS = ["sun", "sunset", "moon"];

function Toolbar() {
  const key = (W - 8) / 8;
  return (
    <View class="absolute" style={{ insetL: 0, insetB: 0, width: W, height: TOOLBAR, bgColor: PAPER }}>
      <Show
        when={!E.carrying()}
        fallback={
          <View class="flex-row items-center justify-center gap-2" style={{ width: W, height: TOOLBAR, bgColor: CORAL }}>
            <Image src={picture("ui:box")} style={{ width: 22, height: 22 }} />
            <Text class="text-sm font-bold" style={{ textColor: "#ffffff" }}>{E.tr("ds.trash")}</Text>
          </View>
        }
      >
        <View class="flex-row items-center px-1" style={{ width: W, height: TOOLBAR }}>
          <ToolKey icon="leaf" label={E.tr("toolbar.catalog")} width={key} onTap={() => E.openSheet("catalog")} />
          <ToolKey icon="box" label={E.tr("toolbar.storage")} width={key} onTap={() => E.openSheet("storage")} />
          <ToolKey icon="sparkle" label={E.tr("toolbar.sets")} width={key} onTap={() => E.openSheet("sets")} />
          <ToolKey icon="undo" label={E.tr("ds.undo")} width={key} off={!E.history().undo} onTap={E.undo} />
          <ToolKey icon="redo" label={E.tr("ds.redo")} width={key} off={!E.history().redo} onTap={E.redo} />
          <ToolKey icon={E.lightMode() === 2 ? "bulb-off" : "bulb"} label={E.lightName()} width={key} onTap={E.cycleLight} />
          <ToolKey icon={TIME_ICONS[E.timeOfDay()]!} label={E.timeName()} width={key} onTap={() => E.setTime((E.timeOfDay() + 1) % 3)} />
          <ToolKey icon="house" label={E.tr("ds.menu")} width={key} onTap={() => E.openSheet("menu")} />
        </View>
      </Show>
      <Show when={E.showroom()}>
        <View class="absolute" style={{ insetR: 4, insetT: -32 }}>
          <Pill label={E.tr("room.back")} tone="leaf" width={150} height={28} onTap={E.backToMyRoom} />
        </View>
      </Show>
    </View>
  );
}

// ---------------------------------------------------------------- a question

function Confirm() {
  return (
    <Show when={E.confirmation()}>
      <View class="absolute items-center justify-center" style={{ insetL: 0, insetT: 0, width: W, height: H, bgColor: tint("#211812", 0.55) }}>
        <View class="flex-col rounded-xl p-3 gap-2" style={{ width: 268, bgColor: PAPER }}>
          <Text class="text-sm font-bold" style={{ textColor: INK }}>{E.confirmation()!.title}</Text>
          <Text class="text-xs" style={{ textColor: INK_SOFT, width: 244 }}>{E.confirmation()!.body}</Text>
          <View class="flex-row justify-end gap-2">
            <Pill label={E.tr("confirm.cancel")} tone="cream" width={90} height={30} onTap={() => E.answer(false)} />
            <Pill label={E.tr("confirm.ok")} tone="leaf" width={90} height={30} onTap={() => E.answer(true)} />
          </View>
        </View>
      </View>
    </Show>
  );
}

// ---------------------------------------------------------------- the pad

let repeatFrames = 0;
let lastDpad = 0;

/** Once a frame: the C Stick turns the view (the Circle Pad walks, outdoors.ts), ZL and ZR zoom, a held +Control Pad repeats. */
export function padFrame(buttons: number, rx: number, ry: number): void {
  noteHeld(buttons);
  if (E.sheet() || E.confirmation()) return;
  const yaw = rx, pitch = ry;
  const zoom = buttons & BTN.ZL ? 1.012 : buttons & BTN.ZR ? 0.988 : 1;
  if (Math.abs(yaw) > 0.05 || Math.abs(pitch) > 0.05 || zoom !== 1) E.camera(-yaw * 0.022, -pitch * 0.014, zoom);
  const dpad = buttons & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT);
  if (dpad && dpad === lastDpad) {
    repeatFrames++;
    if (repeatFrames > 18 && repeatFrames % 5 === 0) step(dpad);
  } else repeatFrames = 0;
  lastDpad = dpad;
}

function step(dpad: number): void {
  E.nudge(dpad & BTN.RIGHT ? 1 : dpad & BTN.LEFT ? -1 : 0, dpad & BTN.DOWN ? 1 : dpad & BTN.UP ? -1 : 0);
}

/** A button's down edge, when no sheet has it. */
export function padPress(pressed: number): void {
  if (pressed & BTN.CIRCLE && O.pressA()) return;
  if (O.place() === "island") {
    // Outdoors there is nothing to select or arrange: the menu, and the time of day on SELECT.
    if (pressed & BTN.START) E.openSheet("menu");
    if (pressed & BTN.SELECT) E.setTime((E.timeOfDay() + 1) % 3);
    return;
  }
  if (pressed & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT)) step(pressed);
  if (pressed & BTN.CIRCLE) E.pickAtCursor();
  if (pressed & BTN.TRIANGLE) E.rotate();
  if (pressed & BTN.SQUARE) E.putAway();
  if (pressed & BTN.CROSS) E.clearSelection();
  if (pressed & BTN.LTRIGGER && !(held & BTN.RTRIGGER)) E.cycleLayer(-1);
  if (pressed & BTN.RTRIGGER && !(held & BTN.LTRIGGER)) E.cycleLayer(1);
  if (pressed & BTN.SELECT) E.cycleLight();
  if (pressed & BTN.START) E.openSheet("menu");
  if ((held & (BTN.ZL | BTN.ZR)) === (BTN.ZL | BTN.ZR) && pressed & (BTN.ZL | BTN.ZR)) E.camera(0, 0, 0, true);
}

