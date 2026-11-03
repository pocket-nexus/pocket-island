// The upper screen: the room, drawn by the renderer, and over it the room's
// card, the light, what is selected, what was just said, and what the
// buttons do now.
import { createSignal, For, onCleanup, Show } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { picture } from "./catalog.ts";
import * as E from "./editor.ts";
import { island } from "./host.ts";
import * as O from "./outdoors.ts";
import { itemDef } from "../../src/items/items.ts";
import { Glyph } from "./parts.tsx";
import { CORAL, INK, INK_SOFT, LEAF, PAPER, tint } from "./theme.ts";

const W = 400, H = 240;

export function Top(props: { problem: string | null }) {
  return (
    <View class="relative" style={{ width: W, height: H }}>
      <Show when={!props.problem} fallback={<Problem text={props.problem!} />}>
        <Show when={O.place() === "house"} fallback={<IslandCard />}>
          <RoomCard />
          <LightChip />
          <Selected />
        </Show>
        <Toast />
        <Legend />
        <Show when={O.place() === "island"}><ToolChip /></Show>
        <Stats />
        <Fade />
      </Show>
    </View>
  );
}

function Problem(props: { text: string }) {
  return (
    <View class="absolute items-center justify-center" style={{ insetL: 0, insetT: 0, width: W, height: H, bgColor: "#211812" }}>
      <View class="rounded-xl px-4 py-3 flex-col items-center gap-1" style={{ bgColor: PAPER, maxW: 340 }}>
        <Text class="text-base font-bold" style={{ textColor: INK }}>{E.tr("app.title")}</Text>
        <Text class="text-xs" style={{ textColor: INK_SOFT, maxW: 320 }}>{props.text}</Text>
      </View>
    </View>
  );
}

/** The browser's room card: whose room or which showroom, its size and how full it is. */
function RoomCard() {
  const title = () => {
    const show = E.showroom();
    if (!show) return E.tr("app.title");
    return E.tr("room.showroom", { name: show === "all" ? E.tr("room.everything") : E.seriesNameOf(show) });
  };
  return (
    <View class="absolute flex-col rounded-xl px-3 py-1" style={{ insetL: 8, insetT: 8, bgColor: tint(PAPER, 0.94) }}>
      <Text class="text-sm font-bold" style={{ textColor: INK }}>{title()}</Text>
      <Text class="text-2xs font-bold" style={{ textColor: INK_SOFT }}>
        {`${E.tr("room.tiles", { w: E.room().w, d: E.room().d })} · ${E.tr("room.count", { n: E.itemCount(), max: 150 })}`}
      </Text>
    </View>
  );
}

/** Outdoors: the island's name and the clock. */
function IslandCard() {
  return (
    <View class="absolute flex-col rounded-xl px-3 py-1" style={{ insetL: 8, insetT: 8, bgColor: tint(PAPER, 0.94) }}>
      <Text class="text-sm font-bold" style={{ textColor: INK }}>{E.tr("island.name")}</Text>
      <Text class="text-2xs font-bold" style={{ textColor: INK_SOFT }}>{E.tr("island.outdoors", { time: E.clockLabel() })}</Text>
    </View>
  );
}

/** Going through the door: the upper screen fades to the paper's colour and back. */
function Fade() {
  return (
    <Show when={O.fade() > 0}>
      <View class="absolute" style={{ insetL: 0, insetT: 0, width: W, height: H, bgColor: tint(PAPER, Math.min(1, O.fade())) }} />
    </Show>
  );
}

const LIGHT_ICONS = ["bulb", "bulb", "bulb-off"];
const TIME_ICONS = ["sun", "sunset", "moon"];

function LightChip() {
  return (
    <View class="absolute flex-row items-center gap-1 rounded-xl px-2" style={{ insetR: 8, insetT: 8, height: 26, bgColor: tint(PAPER, 0.94) }}>
      <Image src={picture(`ui:${LIGHT_ICONS[E.lightMode()]}`)} style={{ width: 16, height: 16 }} />
      <Text class="text-2xs font-bold" style={{ textColor: INK }}>{E.lightName()}</Text>
      <View style={{ width: 4, height: 1 }} />
      <Image src={picture(`ui:${TIME_ICONS[E.timeOfDay()]}`)} style={{ width: 16, height: 16 }} />
      <Text class="text-2xs font-bold" style={{ textColor: INK }}>{E.clockLabel()}</Text>
    </View>
  );
}

/** What is selected: its name and colour, or how many. */
function Selected() {
  const label = () => {
    const sel = E.selected();
    if (!sel.length) return null;
    if (sel.length > 1) return { name: E.tr("inspector.selected", { n: sel.length }), detail: "" };
    const { def, placement } = sel[0]!;
    return { name: E.nameOf(def), detail: E.variantNameOf(def.variants[placement.variant]) };
  };
  return (
    <Show when={label()}>
      <View class="absolute flex-row items-center gap-2 rounded-xl px-3" style={{ insetL: 8, insetT: 48, height: 24, bgColor: tint("#f8cd4a", 0.95) }}>
        <Text class="text-xs font-bold" style={{ textColor: INK }}>{label()!.name}</Text>
        <Show when={label()!.detail}>
          <Text class="text-2xs font-bold" style={{ textColor: tint(INK, 0.75) }}>{label()!.detail}</Text>
        </Show>
      </View>
    </Show>
  );
}

function Toast() {
  return (
    <Show when={E.notice()}>
      <View class="absolute items-center" style={{ insetL: 0, insetB: 30, width: W }}>
        <View class="rounded-xl px-3 py-1" style={{ bgColor: E.notice()!.tone === "warn" ? CORAL : E.notice()!.tone === "good" ? LEAF : tint(PAPER, 0.96), maxW: 360 }}>
          <Text class="text-xs font-bold" style={{ textColor: E.notice()!.tone === "info" ? INK : "#ffffff" }}>{E.notice()!.text}</Text>
        </View>
      </View>
    </Show>
  );
}

/** What the buttons do now. */
function Legend() {
  const entries = () => {
    if (E.sheet() || E.confirmation()) return [["circle", E.tr("ds.pad.choose")], ["cross", E.tr("ds.pad.back")]];
    if (O.place() === "island") {
      // A's entry names what it would do now: go in, pick up, shake, chop, dig, cast, reel in.
      // Four at most beside the tool's chip: SELECT's map is in the help.
      const a = O.nearDoor() ? [["circle", E.tr("ds.pad.goIn")]] : O.hint() ? [["circle", E.tr(`act.${O.hint()}` as Parameters<typeof E.tr>[0])]] : [["pad", E.tr("ds.pad.walk")]];
      return [...a, ["cross", E.tr("ds.pad.run")], ["+", E.tr("ds.pad.tool")], ["start", E.tr("ds.pad.menu")]];
    }
    if (E.selection().size)
      return [["+", E.tr("ds.pad.move")], ["triangle", E.tr("ds.pad.rotate")], ["square", E.tr("ds.pad.putAway")], ["cross", E.tr("ds.pad.cancel")]];
    return [["circle", E.tr("ds.pad.select")], ["ltrigger", E.tr("ds.pad.layer")], ["select", E.tr("ds.pad.light")], ["start", E.tr("ds.pad.menu")]];
  };
  return (
    <View class="absolute flex-row items-center gap-3 rounded-xl px-2" style={{ insetL: 8, insetB: 6, height: 20, bgColor: tint("#3a2a1a", 0.55) }}>
      <For each={entries()}>{([button, label]) => <Glyph button={button!} label={label!} />}</For>
    </View>
  );
}

const TOOL_ICONS: Record<number, string> = { 0: "hand", 1: "shovel", 2: "axe", 3: "rod" };

/** Outdoors: the tool in hand, by its picture and name. */
function ToolChip() {
  const name = () => {
    const def = itemDef(O.held());
    return def ? E.pocketNameOf(def) : E.tr("tool.hands");
  };
  return (
    <View class="absolute flex-row items-center gap-1 rounded-xl px-2" style={{ insetR: 8, insetB: 6, height: 22, bgColor: tint(PAPER, 0.94) }}>
      <Image src={picture(`ui:${TOOL_ICONS[O.held()] ?? "hand"}`)} style={{ width: 16, height: 16 }} />
      <Text class="text-2xs font-bold" style={{ textColor: INK }}>{name()}</Text>
    </View>
  );
}

/** Frames, draws and triangles, once a second while the setting is on. */
function Stats() {
  const [line, setLine] = createSignal("");
  let frames = 0;
  onFrame(() => {
    if (!E.settings().stats) return;
    if (++frames % 60) return;
    const s = island.stats();
    setLine(E.tr("ds.stats", { fps: s.fps.toFixed(1), draws: s.draws, tris: s.triangles }) + ` · GPU ${s.gpuMs.toFixed(1)} ms · ${s.lamps}`);
  });
  onCleanup(() => setLine(""));
  return (
    <Show when={E.settings().stats && line()}>
      <View class="absolute rounded-md px-2" style={{ insetR: 8, insetT: 38, bgColor: tint("#211812", 0.7) }}>
        <Text class="text-2xs" style={{ textColor: "#fffbee" }}>{line()}</Text>
      </View>
    </Show>
  );
}
