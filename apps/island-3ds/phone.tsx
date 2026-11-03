// The touch screen outdoors: a phone in the player's hands, lying across the screen. Its status bar
// has the clock and the island's name; its home screen a clock and the apps:
//
//   Map        the island as the browser draws it (src/island/map.ts, through the export), three
//              pixels a tile, with where the player is; a tap walks there (on the house, to its door
//              and in), with dots marching along the way to a ring where it ends
//   Clock      the hour, the day's looks along a bar, and keys that move the clock while held (debug)
//   Home       walks to the door and in; inside, goes out
//   Settings   the menu
//   Help       the rules and the controls
//
// The round key on the right of the phone goes back to its home screen (inside the house, from the
// home screen it puts the phone away); so does B where the pad has the phone.
import { createMemo, createSignal, For, Index, onCleanup, Show } from "solid-js";
import { Image, Text, View, type NodeMirror } from "@pocketjs/framework/components";
import { createGesture } from "@pocketjs/framework/gesture";
import { prop as hotProp } from "@pocketjs/framework/hot";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { skyPhase, weights } from "../../src/core/clock.ts";
import { routeDots } from "../../src/island/route.ts";
import { picture } from "./catalog.ts";
import * as E from "./editor.ts";
import * as O from "./outdoors.ts";
import { Pill, Tap } from "./parts.tsx";
import { CORAL, CREAM, INK, INK_SOFT, LEAF, PAPER, ROSE, SKY, SUN, tint } from "./theme.ts";

const W = 320, H = 240;
/** The phone's body, and its screen inside the bezel (left and right are wider: the speaker, the round key). */
const BODY = { x: 4, y: 3, w: 312, h: 230 };
const SCREEN = { x: 28, y: 10, w: 264, h: 214 };
/** The status bar along the top of the screen. */
const BAR = 16;
const BODY_COLOR = "#f59a7e", BODY_LIP = "#d9705a", FRAME = "#5a4630";
/** The table the phone lies on. Outdoors the renderer clears the screen to it (editor.ts syncPlan), which
 * costs nothing; over the room's plan inside, it is drawn. */
const TABLE = "#a9dccf";
/** The screen's corner radius, and its frame's width: a frame of a radius r's (√2 - 1) or more covers a square corner. */
const SCREEN_RADIUS = 8, FRAME_W = 4;

export type PhoneApp = "home" | "map" | "clock";
const [app, setApp] = createSignal<PhoneApp>("home");
export { app };

export function openApp(next: PhoneApp): void {
  setApp(next);
}

/** Back toward the home screen; from there, inside the house, the phone is put away. */
export function phoneBack(): void {
  if (app() !== "home") setApp("home");
  else if (E.sheet() === "phone") E.openSheet(null);
}

const PERIOD_ICON = ["sun", "sunset", "moon"];

export function Phone() {
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: W, height: H, bgColor: O.place() === "house" ? TABLE : "#00000000" }}>
      {/* The body on its lip. */}
      <View class="absolute" style={{ insetL: BODY.x, insetT: BODY.y + BODY.h - 56, width: BODY.w, height: 60, radius: 26, bgColor: BODY_LIP }} />
      <View class="absolute" style={{ insetL: BODY.x, insetT: BODY.y, width: BODY.w, height: BODY.h, radius: 26, bgColor: BODY_COLOR }} />
      {/* The left of the bezel: the camera and the speaker. */}
      <View class="absolute rounded-full w-[7] h-[7]" style={{ insetL: 13, insetT: 58, bgColor: FRAME }} />
      <View class="absolute" style={{ insetL: 14, insetT: 96, width: 5, height: 34, bgColor: tint(FRAME, 0.55) }} />
      <HomeKey />
      {/* The screen, and over it its dark frame: the screen's content is square, so the frame is drawn on top,
          thick enough that its rounded inside covers the content's corners. The apps keep inside the
          screen themselves (a clipped box costs the console a scissor of its own). */}
      <View class="absolute" style={{ insetL: SCREEN.x, insetT: SCREEN.y, width: SCREEN.w, height: SCREEN.h }}>
        <Show when={app() === "home"}><HomeScreen /></Show>
        <Show when={app() === "map"}><MapApp /></Show>
        <Show when={app() === "clock"}><ClockApp /></Show>
        <StatusBar />
      </View>
      <ScreenFrame />
    </View>
  );
}

/**
 * The screen's dark frame, over its corners: four bars along the edges, and at each corner a quarter of a
 * small ring (a ring this small is drawn from a cached mask; one ring round the whole screen would be
 * rasterised row by row every frame). Touches pass through it to the screen.
 */
function ScreenFrame() {
  const R = SCREEN_RADIUS, B = FRAME_W, C = R + B;
  const { x, y, w, h } = SCREEN;
  const corners = [
    { l: x - B, t: y - B, rl: 0, rt: 0 },
    { l: x + w - R, t: y - B, rl: -C, rt: 0 },
    { l: x - B, t: y + h - R, rl: 0, rt: -C },
    { l: x + w - R, t: y + h - R, rl: -C, rt: -C },
  ];
  const bars = [[x + R, y - B, w - 2 * R, B], [x + R, y + h, w - 2 * R, B], [x - B, y + R, B, h - 2 * R], [x + w, y + R, B, h - 2 * R]];
  return (
    <>
      <For each={bars}>{(r) => <View class="absolute" style={{ insetL: r[0]!, insetT: r[1]!, width: r[2]!, height: r[3]!, bgColor: FRAME, hitPass: 1 }} />}</For>
      <For each={corners}>
        {(c) => (
          <View class="absolute overflow-hidden" style={{ insetL: c.l, insetT: c.t, width: C, height: C, hitPass: 1 }}>
            <View class="absolute" style={{ insetL: c.rl, insetT: c.rt, width: C * 2, height: C * 2, radius: C, borderWidth: B, borderColor: FRAME, hitPass: 1 }} />
          </View>
        )}
      </For>
    </>
  );
}

/** The round key on the right of the bezel. */
function HomeKey() {
  return (
    <Tap onTap={phoneBack} class="absolute items-center justify-center" style={{ insetL: 296, insetT: 96, width: 20, height: 40 }}>
      <View class="rounded-full w-[16] h-[16] items-center justify-center" style={{ bgColor: BODY_LIP }}>
        <View class="rounded-full w-[10] h-[10]" style={{ bgColor: tint(PAPER, 0.85) }} />
      </View>
    </Tap>
  );
}

/** The time, the island's name, a battery. */
function StatusBar() {
  const dark = () => app() === "clock" && E.timeOfDay() === 2;
  const ink = () => (dark() ? PAPER : INK);
  return (
    <View class="absolute flex-row items-center justify-between px-2" style={{ insetL: 0, insetT: 0, width: SCREEN.w, height: BAR, bgColor: dark() ? tint("#000000", 0.18) : tint(PAPER, 0.72) }}>
      <Text class="text-2xs font-bold" style={{ textColor: ink(), width: 60 }}>{E.clockLabel()}</Text>
      <Text class="text-2xs font-bold" style={{ textColor: ink() }}>{E.tr("island.name")}</Text>
      <View class="flex-row items-center justify-end" style={{ width: 60 }}>
        <View class="relative rounded-sm" style={{ width: 16, height: 8, borderWidth: 1, borderColor: ink() }}>
          <View class="absolute rounded-sm" style={{ insetL: 2, insetT: 2, width: 11, height: 4, bgColor: LEAF }} />
        </View>
        <View style={{ width: 2, height: 4, bgColor: ink() }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- the home screen

interface AppIcon {
  icon: string;
  label: string;
  color: string;
  open: () => void;
}

function HomeScreen() {
  const indoors = () => O.place() === "house";
  const apps = (): AppIcon[] => [
    { icon: "map", label: E.tr("island.map"), color: "#8fd6a4", open: () => setApp("map") },
    { icon: PERIOD_ICON[E.timeOfDay()]!, label: E.tr("phone.clock"), color: SKY, open: () => setApp("clock") },
    {
      icon: "door", label: indoors() ? E.tr("island.goOut") : E.tr("phone.home"), color: CORAL,
      open: () => {
        if (indoors()) {
          E.openSheet(null);
          O.exit();
        } else {
          O.goHome();
          setApp("map");
        }
      },
    },
    { icon: "sparkle", label: E.tr("settings.button"), color: SUN, open: () => E.openSheet("menu") },
    { icon: "help", label: E.tr("phone.help"), color: ROSE, open: () => E.openSheet("help") },
  ];
  const [focus, setFocus] = createSignal(-1);
  usePhonePad((pressed) => {
    const n = apps().length;
    if (pressed & BTN.RIGHT) setFocus((focus() + 1) % n);
    else if (pressed & BTN.LEFT) setFocus((focus() + n - 1) % n);
    else if (pressed & BTN.CIRCLE && focus() >= 0) apps()[focus()]!.open();
    else return false;
    return true;
  });
  const cell = (SCREEN.w - 8) / 5;
  return (
    <View class="absolute" style={{ insetL: 0, insetT: 0, width: SCREEN.w, height: SCREEN.h, bgColor: "#cdeef7" }}>
      {/* The wallpaper: a sun, the sea and a beach. */}
      <View class="absolute rounded-full w-[30] h-[30]" style={{ insetL: 214, insetT: 22, bgColor: "#ffe489" }} />
      <View class="absolute" style={{ insetL: 0, insetT: 186, width: SCREEN.w, height: 28, bgColor: "#86cfe0" }} />
      <View class="absolute rounded-lg" style={{ insetL: 70, insetT: 198, width: 124, height: 16, bgColor: "#f5e3b3" }} />
      <ClockCard />
      <View class="absolute flex-row px-1" style={{ insetL: 0, insetT: 120, width: SCREEN.w, height: 64 }}>
        <For each={apps()}>
          {(a, i) => (
            <Tap onTap={a.open} class="flex-col items-center" style={{ width: cell, height: 64 }}>
              <View class="rounded-xl items-center justify-center" style={{ width: 40, height: 40, bgColor: a.color, borderWidth: focus() === i() ? 2 : 0, borderColor: INK }}>
                <Image src={picture(`ui:${a.icon}`)} style={{ width: 24, height: 24 }} />
              </View>
              <Text class="text-2xs font-bold" style={{ textColor: INK, marginT: 4 }}>{a.label}</Text>
            </Tap>
          )}
        </For>
      </View>
    </View>
  );
}

/** The home screen's clock: the hour in big digits, the look of the day, the island. */
function ClockCard() {
  return (
    <Tap onTap={() => setApp("clock")} class="absolute flex-row items-center gap-3 px-3" style={{ radius: 16, insetL: 14, insetT: BAR + 10, width: SCREEN.w - 28, height: 76, bgColor: tint(PAPER, 0.9) }}>
      <Digits text={E.clockLabel()} cell={15} height={28} color={INK} />
      <View class="flex-col gap-1">
        <View class="flex-row items-center gap-1">
          <Image src={picture(`ui:${PERIOD_ICON[E.timeOfDay()]}`)} style={{ width: 16, height: 16 }} />
          <Text class="text-xs font-bold" style={{ textColor: INK }}>{E.timeName()}</Text>
        </View>
        <Text class="text-2xs font-bold" style={{ textColor: INK_SOFT }}>{O.place() === "house" ? E.tr("island.house") : E.tr("island.name")}</Text>
      </View>
    </Tap>
  );
}

// ---------------------------------------------------------------- big digits

/** Which of a digit's seven bars are lit: top, upper right, lower right, bottom, lower left, upper left, middle. */
const SEGMENTS: Record<string, number> = {
  "0": 0b0111111, "1": 0b0000110, "2": 0b1011011, "3": 0b1001111, "4": 0b1100110,
  "5": 0b1101101, "6": 0b1111101, "7": 0b0000111, "8": 0b1111111, "9": 0b1101111,
};

/** "HH:MM" in bars, as a clock's face draws it (no font holds digits this big). The bars are square and
 * only the lit ones are drawn: a rounded box is seven pieces for the console to draw. */
function Digits(props: { text: string; cell: number; height: number; color: string }) {
  const chars = () => props.text.split("");
  return (
    <View class="flex-row items-center" style={{ height: props.height, gap: Math.round(props.cell * 0.3) }}>
      <Index each={chars()}>{(ch) => (ch() === ":" ? <Colon height={props.height} color={props.color} /> : <Digit ch={ch()} w={props.cell} h={props.height} color={props.color} />)}</Index>
    </View>
  );
}

function Colon(props: { height: number; color: string }) {
  const d = Math.max(3, Math.round(props.height / 8));
  return (
    <View class="flex-col items-center justify-center" style={{ width: d, height: props.height, gap: Math.round(props.height / 5) }}>
      <View style={{ width: d, height: d, bgColor: props.color }} />
      <View style={{ width: d, height: d, bgColor: props.color }} />
    </View>
  );
}

function Digit(props: { ch: string; w: number; h: number; color: string }) {
  const lit = createMemo(() => SEGMENTS[props.ch] ?? 0);
  const t = () => Math.max(3, Math.round(props.w / 4.5));
  const bars = () => {
    const w = props.w, h = props.h, k = t(), half = h / 2;
    // [x, y, width, height] of each bar, in SEGMENTS' order.
    return [
      [k / 2, 0, w - k, k], [w - k, k / 2, k, half - k / 2], [w - k, half, k, half - k / 2],
      [k / 2, h - k, w - k, k], [0, half, k, half - k / 2], [0, k / 2, k, half - k / 2], [k / 2, half - k / 2, w - k, k],
    ];
  };
  return (
    <View class="relative" style={{ width: props.w, height: props.h }}>
      <Index each={bars()}>
        {(b, i) => (
          <Show when={lit() & (1 << i)}>
            <View class="absolute" style={{ insetL: b()[0]!, insetT: b()[1]!, width: b()[2]!, height: b()[3]!, bgColor: props.color }} />
          </Show>
        )}
      </Index>
    </View>
  );
}

// ---------------------------------------------------------------- the map

/** Pixels a tile, and where the map's corner is on the screen (under the status bar). The picture
 * (src/export/export.ts PHONE_MAP) is 256 pixels square with the map in the middle of its top 198 rows,
 * drawn a texel a pixel in the middle of the screen; the screen clips its bottom, and a strip of sea
 * either side fills the 264 pixels across. */
const S = 3, PICTURE = 256, SEA = "#5cb8d6";
const MAP_H = SCREEN.h - BAR, PICTURE_X = (SCREEN.w - PICTURE) / 2;
const X0 = PICTURE_X + Math.round((PICTURE - O.map.w * S) / 2), Y0 = BAR + Math.round((MAP_H - O.map.d * S) / 2);
/** Dots along the way: how far apart (tiles), how many at most, how fast they march (tiles a second). */
const SPACING = 1.5, DOTS = 40, MARCH = 1.2;

function MapApp() {
  let surface: NodeMirror | undefined;
  createGesture({
    surface: "auxiliary",
    region: { node: () => surface },
    onTap: (c) => {
      if (E.sheet() && E.sheet() !== "phone") return;
      const x = (c.x - SCREEN.x - X0) / S, z = (c.y - SCREEN.y - Y0) / S;
      if (x < 0 || z < 0 || x > O.map.w || z > O.map.d) return;
      const [x0, z0, x1, z1] = O.map.house.rect;
      if (x > x0 - 0.5 && x < x1 + 0.5 && z > z0 - 1 && z < z1 + 0.6) O.goHome();
      else {
        if (E.sheet() === "phone") E.openSheet(null);
        O.walkTo(x, z);
      }
    },
  });
  usePhonePad((pressed) => {
    if (pressed & BTN.CIRCLE && O.place() === "island") O.goHome();
    else return false;
    return true;
  });
  // Where the player is: on the island, or at the house's door while inside.
  const here = () => (O.place() === "island" ? O.marker() : { x: O.map.house.door.x, z: O.map.house.door.z + 0.6, yaw: 0, t: O.marker().t });
  const end = () => O.route()[O.route().length - 1] ?? null;
  // The dots march along the way toward its end (src/island/route.ts, as the browser's map draws them).
  const dots = createMemo(() => {
    const from = O.marker();
    return routeDots(from, O.route(), from.t, { spacing: SPACING, near: 1, ring: 1.4, most: DOTS, march: MARCH })
      .map((d) => ({ x: X0 + d.x * S, y: Y0 + d.z * S }));
  });
  // The ring where the walk ends breathes, and a wave spreads from it: paint-only, every frame.
  let ring: NodeMirror | undefined, wave: NodeMirror | undefined, frames = 0;
  onFrame(() => {
    if (!end()) return;
    frames++;
    hotProp(ring, "scale", 1 + 0.14 * Math.sin(frames * 0.16));
    const w = (frames % 60) / 60;
    hotProp(wave, "scale", 0.8 + 1.3 * w);
    hotProp(wave, "opacity", 0.8 * (1 - w) * (1 - w));
  });
  const indoors = () => O.place() === "house";
  return (
    <View ref={surface} class="absolute" style={{ insetL: 0, insetT: 0, width: SCREEN.w, height: SCREEN.h }}>
      <View class="absolute" style={{ insetL: 0, insetT: 0, width: PICTURE_X, height: SCREEN.h, bgColor: SEA }} />
      <View class="absolute" style={{ insetL: PICTURE_X + PICTURE, insetT: 0, width: PICTURE_X, height: SCREEN.h, bgColor: SEA }} />
      <Image src={picture("island:map")} class="absolute" style={{ insetL: PICTURE_X, insetT: BAR, width: PICTURE, height: PICTURE }} />
      <Index each={dots()}>
        {(d) => <View class="absolute rounded-full w-[4] h-[4]" style={{ insetL: 0, insetT: 0, translateX: Math.round(d().x) - 2, translateY: Math.round(d().y) - 2, bgColor: "#ffffff" }} />}
      </Index>
      <Show when={end()}>
        <View ref={wave} class="absolute rounded-full w-[16] h-[16]" style={{ insetL: X0 + end()!.x * S - 8, insetT: Y0 + end()!.z * S - 8, borderWidth: 2, borderColor: "#ffffff" }} />
        <View ref={ring} class="absolute rounded-full w-[14] h-[14] items-center justify-center" style={{ insetL: X0 + end()!.x * S - 7, insetT: Y0 + end()!.z * S - 7, borderWidth: 2, borderColor: "#ffffff" }}>
          <View class="rounded-full w-[5] h-[5]" style={{ bgColor: CORAL }} />
        </View>
      </Show>
      {/* The player: a dot with a nose toward where they face. */}
      <View class="absolute rounded-full w-[10] h-[10]" style={{ insetL: X0 + here().x * S - 5, insetT: Y0 + here().z * S - 5, bgColor: "#ffffff" }} />
      <View class="absolute rounded-full w-[6] h-[6]" style={{ insetL: X0 + here().x * S - 3, insetT: Y0 + here().z * S - 3, bgColor: CORAL }} />
      <Show when={!indoors()}>
        <View class="absolute rounded-full w-[4] h-[4]" style={{ insetL: X0 + (here().x + Math.sin(here().yaw) * 1.3) * S - 2, insetT: Y0 + (here().z + Math.cos(here().yaw) * 1.3) * S - 2, bgColor: CORAL }} />
      </Show>
      {/* The corners: back to the home screen, what a tap does, the door. */}
      <View class="absolute" style={{ insetL: 4, insetT: BAR + 4 }}>
        <Pill icon="back" width={30} height={24} small onTap={() => setApp("home")} />
      </View>
      <View class="absolute rounded-lg px-2 items-center justify-center" style={{ insetL: 4, insetB: 5, height: 18, bgColor: tint(PAPER, 0.9) }}>
        <Text class="text-2xs font-bold" style={{ textColor: INK }}>{indoors() ? E.tr("phone.mapOut") : E.tr("phone.mapTap")}</Text>
      </View>
      <View class="absolute" style={{ insetR: 4, insetB: 4 }}>
        <Pill icon={indoors() ? "door" : "door-white"} label={indoors() ? E.tr("island.goOut") : E.tr("island.goIn")} tone={indoors() ? "paper" : "leaf"} width={92} height={26} small onTap={() => {
          if (indoors()) {
            E.openSheet(null);
            O.exit();
          } else O.goHome();
        }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- the clock

/** The day's looks, a colour an hour along the bar. */
const LOOK_COLORS = { day: [0xf8, 0xd8, 0x6a], dusk: [0xf2, 0x9a, 0x7e], night: [0x3e, 0x4f, 0x8a] } as const;
const HOURS = Array.from({ length: 24 }, (_, h) => {
  const w = weights(skyPhase(h + 0.5));
  const c = [0, 1, 2].map((k) => Math.round(LOOK_COLORS.day[k]! * w.day + LOOK_COLORS.dusk[k]! * w.dusk + LOOK_COLORS.night[k]! * w.night));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
});
const BACKDROPS = ["#cdeef7", "#f8bba0", "#3a4a80"] as const;

function ClockApp() {
  const night = () => E.timeOfDay() === 2;
  const ink = () => (night() ? PAPER : INK);
  // A puts the clock back to the console's own time; the +Control Pad held moves it (phoneHeld).
  usePhonePad((pressed) => {
    if (pressed & BTN.CIRCLE) E.clockNow();
    else return false;
    return true;
  });
  onCleanup(() => E.scrub(0));
  const BAR_W = 216;
  return (
    <View class="absolute flex-col items-center" style={{ insetL: 0, insetT: 0, width: SCREEN.w, height: SCREEN.h, bgColor: BACKDROPS[E.timeOfDay()]! }}>
      <View class="absolute" style={{ insetL: 4, insetT: BAR + 4 }}>
        <Pill icon="back" width={30} height={24} small onTap={() => setApp("home")} />
      </View>
      <View style={{ height: BAR + 14 }} />
      <Digits text={E.clockLabel()} cell={24} height={44} color={ink()} />
      <View class="flex-row items-center gap-1" style={{ marginT: 8 }}>
        <Image src={picture(`ui:${PERIOD_ICON[E.timeOfDay()]}`)} style={{ width: 16, height: 16 }} />
        <Text class="text-xs font-bold" style={{ textColor: ink() }}>{E.timeName()}</Text>
      </View>
      {/* The day along a bar, and where the clock is on it. */}
      <View class="relative" style={{ width: BAR_W, height: 26, marginT: 8 }}>
        <View class="absolute flex-row overflow-hidden rounded-md" style={{ insetL: 0, insetT: 4, width: BAR_W, height: 10 }}>
          <For each={HOURS}>{(c) => <View style={{ width: BAR_W / 24, height: 10, bgColor: c }} />}</For>
        </View>
        <View class="absolute rounded-sm" style={{ insetL: Math.round((E.clockHour() / 24) * BAR_W) - 2, insetT: 0, width: 4, height: 18, bgColor: ink() }} />
        <For each={[0, 6, 12, 18, 24]}>
          {(h) => (
            <View class="absolute" style={{ insetL: Math.min(BAR_W - 12, Math.max(0, (h / 24) * BAR_W - 5)), insetT: 15 }}>
              <Text class="text-2xs" style={{ textColor: tint(ink(), 0.8) }}>{String(h)}</Text>
            </View>
          )}
        </For>
      </View>
      <View class="flex-row items-center gap-2" style={{ marginT: 6 }}>
        <HoldKey icon="rewind" direction={-1} />
        <Pill label={E.tr("settings.timeNow")} tone="cream" width={64} height={26} small onTap={E.clockNow} />
        <HoldKey icon="forward" direction={1} />
      </View>
      <Text class="text-2xs" style={{ textColor: tint(ink(), 0.85), marginT: 4 }}>{E.tr("phone.clockDebug")}</Text>
    </View>
  );
}

/** A key that moves the clock while the stylus holds it. */
export function HoldKey(props: { icon: "rewind" | "forward"; direction: number; width?: number }) {
  let node: NodeMirror | undefined;
  const [down, setDown] = createSignal(false);
  const stop = () => {
    setDown(false);
    E.scrub(0);
  };
  createGesture({
    surface: "auxiliary",
    region: { node: () => node },
    onDown: () => {
      setDown(true);
      E.scrub(props.direction);
    },
    onUp: stop,
    onCancel: stop,
  });
  onCleanup(() => E.scrub(0));
  const w = () => props.width ?? 52;
  return (
    <View ref={node} class="relative" style={{ width: w(), height: 26 }}>
      <View class="absolute rounded-xl" style={{ insetL: 0, insetT: 3, width: w(), height: 23, bgColor: "#d9c79c" }} />
      <View class="absolute rounded-xl items-center justify-center" style={{ insetL: 0, insetT: down() ? 2 : 0, width: w(), height: 23, bgColor: down() ? SUN : PAPER }}>
        <Image src={picture(`ui:${props.icon}`)} style={{ width: 16, height: 16 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- the pad

/** What the open app does with a button (inside the house, where the phone is a sheet and has the pad). */
let padHandler: ((pressed: number) => boolean) | null = null;
function usePhonePad(handler: (pressed: number) => boolean) {
  padHandler = handler;
  onCleanup(() => {
    if (padHandler === handler) padHandler = null;
  });
}

/** A button's down edge while the phone has the pad: the app's, then B goes back. */
export function phonePress(pressed: number): void {
  if (padHandler?.(pressed)) return;
  if (pressed & BTN.CROSS) phoneBack();
}

let padScrub = 0;
/** Each frame the phone is shown: in its clock, left and right on the +Control Pad move the clock while held. */
export function phoneHeld(buttons: number): void {
  const dir = app() === "clock" ? (buttons & BTN.RIGHT ? 1 : buttons & BTN.LEFT ? -1 : 0) : 0;
  if (dir === padScrub) return;
  padScrub = dir;
  E.scrub(dir);
}
