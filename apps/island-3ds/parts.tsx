// The pieces both screens are built from, in the browser's look: paper
// pills with a lip, cream tabs, cards with a picture, a sheet with a title.
import { createEffect, createSignal, For, Show, type JSX } from "solid-js";
import { Image, Text, View, type NodeMirror } from "@pocketjs/framework/components";
import type { SurfaceId } from "@pocketjs/framework/display";
import { createGesture } from "@pocketjs/framework/gesture";
import { getOps } from "@pocketjs/framework/host";
import { prop as hotProp } from "@pocketjs/framework/hot";
import { createScroller } from "@pocketjs/framework/kinetics";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { glyph } from "@pocketjs/framework/modality";
import { picture } from "./catalog.ts";
import { CREAM, CREAM_2, INK, INK_SOFT, LEAF, LEAF_DARK, LIP, PAPER, SUN, SUN_DARK, tint } from "./theme.ts";

/** A view a stylus can tap. While the stylus is on it, it sinks into its lip. */
export function Tap(props: { surface?: SurfaceId; onTap?: () => void; class?: string; style?: Record<string, number | string>; children?: JSX.Element }) {
  let node: NodeMirror | undefined;
  const [down, setDown] = createSignal(false);
  createGesture({
    surface: props.surface ?? "auxiliary",
    region: { node: () => node },
    onDown: () => setDown(!!props.onTap),
    onUp: () => setDown(false),
    onCancel: () => setDown(false),
    onTap: () => props.onTap?.(),
  });
  return (
    <View ref={node} class={props.class} style={{ ...props.style, opacity: down() ? 0.7 : 1 }}>
      {props.children}
    </View>
  );
}

export type Tone = "paper" | "leaf" | "sun" | "cream";
const FACE: Record<Tone, [string, string, string]> = {
  paper: [PAPER, LIP, INK],
  leaf: [LEAF, LEAF_DARK, "#ffffff"],
  sun: [SUN, SUN_DARK, INK],
  cream: [CREAM, CREAM_2, INK],
};

/** A rounded button on a lip. */
export function Pill(props: { label?: string; icon?: string; tone?: Tone; width: number; height: number; small?: boolean; onTap?: () => void; surface?: SurfaceId }) {
  const face = () => FACE[props.tone ?? "paper"];
  return (
    <Tap surface={props.surface} onTap={props.onTap} class="relative" style={{ width: props.width, height: props.height }}>
      <View class="absolute rounded-xl" style={{ insetL: 0, insetT: 3, width: props.width, height: props.height - 3, bgColor: face()[1] }} />
      <View class="absolute rounded-xl flex-row items-center justify-center gap-1" style={{ insetL: 0, insetT: 0, width: props.width, height: props.height - 3, bgColor: face()[0] }}>
        <Show when={props.icon}>
          <Image src={picture(`ui:${props.icon}`)} style={{ width: props.small ? 14 : 18, height: props.small ? 14 : 18 }} />
        </Show>
        <Show when={props.label}>
          <Text class={props.small ? "text-2xs font-bold" : "text-xs font-bold"} style={{ textColor: face()[2] }}>{props.label}</Text>
        </Show>
      </View>
    </Tap>
  );
}

/** A toolbar key: its icon over its name; `on` lights it. */
export function ToolKey(props: { icon: string; label: string; width: number; on?: boolean; off?: boolean; onTap: () => void }) {
  return (
    <Tap onTap={props.off ? undefined : props.onTap} class="flex-col items-center justify-center rounded-lg" style={{ width: props.width, height: 36, bgColor: props.on ? SUN : "#00000000", opacity: props.off ? 0.35 : 1 }}>
      <Image src={picture(`ui:${props.icon}`)} style={{ width: 20, height: 20 }} />
      <Text class="text-2xs font-bold" style={{ textColor: INK }}>{props.label}</Text>
    </Tap>
  );
}

/** A row of choices, one of them chosen (the browser's segmented control). */
export function Seg<T extends string | number>(props: { items: { value: T; label: string }[]; value: T; width: number; height?: number; leaf?: boolean; onPick: (value: T) => void }) {
  const each = () => Math.floor((props.width - 6) / props.items.length);
  const height = () => props.height ?? 24;
  return (
    <View class="flex-row rounded-xl p-[3]" style={{ width: props.width, height: height() + 6, bgColor: PAPER }}>
      <For each={props.items}>
        {(entry) => {
          const on = () => entry.value === props.value;
          return (
            <Tap onTap={() => props.onPick(entry.value)} class="items-center justify-center rounded-lg" style={{ width: each(), height: height(), bgColor: on() ? (props.leaf ? LEAF : SUN) : "#00000000" }}>
              <Text class="text-2xs font-bold" style={{ textColor: on() ? (props.leaf ? "#ffffff" : INK) : INK_SOFT }}>{entry.label}</Text>
            </Tap>
          );
        }}
      </For>
    </View>
  );
}

/** A colour to choose a variant by. */
export function Swatch(props: { color: string; on: boolean; onTap: () => void }) {
  return (
    <Tap onTap={props.onTap} class="items-center justify-center rounded-full w-[22] h-[22]" style={{ bgColor: props.on ? INK : CREAM_2 }}>
      <View class="rounded-full w-[16] h-[16]" style={{ bgColor: props.color }} />
    </Tap>
  );
}

/** The lower screen given to one list: a title, a way back, and the list. */
export function Sheet(props: { title: string; onClose: () => void; children?: JSX.Element; right?: JSX.Element }) {
  return (
    <View class="absolute flex-col" style={{ insetL: 0, insetT: 0, width: 320, height: 240, bgColor: CREAM }}>
      <View class="flex-row items-center justify-between px-2" style={{ width: 320, height: 30, bgColor: PAPER }}>
        <Text class="text-sm font-bold" style={{ textColor: INK }}>{props.title}</Text>
        <View class="flex-row items-center gap-1">
          {props.right}
          <Tap onTap={props.onClose} class="items-center justify-center rounded-full w-[24] h-[24]" style={{ bgColor: CREAM }}>
            <Image src={picture("ui:close")} style={{ width: 16, height: 16 }} />
          </Tap>
        </View>
      </View>
      <View class="relative" style={{ width: 320, height: 210 }}>{props.children}</View>
    </View>
  );
}

/** A button's name on this console (A, B, X, Y; ○ × △ □ elsewhere) on a chip. */
export function Glyph(props: { button: "circle" | "cross" | "triangle" | "square" | "start" | "select" | "ltrigger" | "rtrigger" | "pad" | string; label: string }) {
  const name = () => (["circle", "cross", "triangle", "square", "start", "select", "ltrigger", "rtrigger"].includes(props.button) ? glyph(props.button as "circle") : props.button);
  return (
    <View class="flex-row items-center gap-1">
      <Show
        when={props.button !== "pad"}
        fallback={
          // The Circle Pad: a round key with its nub.
          <View class="rounded-full w-4 h-4 items-center justify-center" style={{ bgColor: tint(PAPER, 0.92) }}>
            <View class="rounded-full w-2 h-2" style={{ bgColor: INK }} />
          </View>
        }
      >
        <View class="rounded-md px-1 items-center justify-center" style={{ height: 14, bgColor: tint(PAPER, 0.92) }}>
          <Text class="text-2xs font-bold" style={{ textColor: INK }}>{name()}</Text>
        </View>
      </Show>
      <Text class="text-2xs font-bold" style={{ textColor: "#fffbee" }}>{props.label}</Text>
    </View>
  );
}

/**
 * A list taller than its window: the stylus drags it and flings it, and
 * `focus` keeps a row in view when the pad walks it. The content is one node
 * that slides.
 */
export function Scroll(props: { width: number; height: number; content: number; focus?: [number, number] | null; children?: JSX.Element }) {
  let viewport: NodeMirror | undefined, inner: NodeMirror | undefined;
  let painted = -1;
  const scroller = createScroller({ max: () => Math.max(0, props.content - props.height), extent: () => props.height, overscroll: 24 });
  createGesture({
    surface: "auxiliary",
    axis: "y",
    region: { node: () => viewport },
    onPanStart: () => scroller.beginDrag(),
    onPanMove: (c) => scroller.drag(-c.fdy),
    onPanEnd: (c) => scroller.endDrag(-c.vy),
    onCancel: () => scroller.endDrag(0),
  });
  createEffect(() => {
    const f = props.focus;
    if (!f) return;
    const at = scroller.intent();
    if (f[0] < at) scroller.chaseTo(Math.max(0, f[0] - 6));
    else if (f[1] > at + props.height) scroller.chaseTo(Math.min(Math.max(0, props.content - props.height), f[1] - props.height + 6));
  });
  onFrame(() => {
    scroller.step();
    const off = Math.round(scroller.offset());
    if (off !== painted) {
      painted = off;
      hotProp(inner, "translateY", -off);
    }
  });
  return (
    <View ref={viewport} class="overflow-hidden" style={{ width: props.width, height: props.height }}>
      <View ref={inner} class="flex-col" style={{ width: props.width, height: Math.max(props.content, props.height) }}>{props.children}</View>
    </View>
  );
}

/** A switch, on or off. */
export function Switch(props: { on: boolean; onTap: () => void }) {
  return (
    <Tap onTap={props.onTap} class="rounded-full w-[38] h-[22]" style={{ bgColor: props.on ? LEAF : CREAM_2 }}>
      <View class="absolute rounded-full w-[16] h-[16]" style={{ insetT: 3, insetL: props.on ? 19 : 3, bgColor: "#ffffff" }} />
    </Tap>
  );
}

/** Font slots of the sizes the interface uses (PocketJS's slot table: 12 px is 0, its bold 7; 10 px is 19 and 20). */
export const SLOT = { tiny: 19, tinyBold: 20, small: 0, smallBold: 7, bodyBold: 8 } as const;

/** How wide `text` draws in a slot, in the glyphs the current language loaded. */
export function measure(text: string, slot: number): number {
  const ops = getOps() as { measureText?: (s: string, slot: number) => number };
  return ops.measureText ? ops.measureText(text, slot) : text.length * 6;
}

const CJK = /[぀-ヿ㐀-鿿＀-￯]/;

/**
 * `text` in lines no wider than `width`, at most `lines` of them, the last
 * cut with an ellipsis when the text does not fit. Latin text breaks between
 * words; Chinese and Japanese between any two characters.
 */
export function wrap(text: string, slot: number, width: number, lines = 2): string[] {
  const tokens: string[] = [];
  let word = "";
  for (const ch of text) {
    if (CJK.test(ch)) {
      if (word) tokens.push(word), (word = "");
      tokens.push(ch);
    } else if (ch === " ") {
      tokens.push(word + " ");
      word = "";
    } else word += ch;
  }
  if (word) tokens.push(word);
  const out: string[] = [];
  let line = "";
  for (let i = 0; i < tokens.length; i++) {
    const next = line + tokens[i];
    if (!line || measure(next.trimEnd(), slot) <= width) {
      line = next;
      continue;
    }
    out.push(line.trimEnd());
    line = tokens[i]!;
    if (out.length === lines) {
      line = tokens.slice(i).join("");
      break;
    }
  }
  if (line) out.push(line.trimEnd());
  if (out.length > lines || measure(out[Math.min(out.length, lines) - 1]!, slot) > width) {
    const kept = out.slice(0, lines);
    let last = out.slice(lines - 1).join(" ");
    while (last.length > 1 && measure(last + "…", slot) > width) last = last.slice(0, -1);
    kept[lines - 1] = last.trimEnd() + "…";
    return kept;
  }
  return out;
}

/**
 * A row of tabs as wide as their names, which the stylus slides sideways
 * when they are wider than the screen; the chosen one is kept in view.
 */
export function TabStrip<T extends string>(props: { items: { value: T; label: string }[]; value: T; width: number; onPick: (value: T) => void }) {
  let viewport: NodeMirror | undefined, inner: NodeMirror | undefined;
  let painted = -1;
  const widths = () => props.items.map((it) => Math.ceil(measure(it.label, SLOT.tinyBold)) + 16);
  const total = () => widths().reduce((a, b) => a + b + 2, 4);
  const scroller = createScroller({ max: () => Math.max(0, total() - props.width), extent: () => props.width, overscroll: 16 });
  createGesture({
    surface: "auxiliary",
    axis: "x",
    region: { node: () => viewport },
    onPanStart: () => scroller.beginDrag(),
    onPanMove: (c) => scroller.drag(-c.fdx),
    onPanEnd: (c) => scroller.endDrag(-c.vx),
    onCancel: () => scroller.endDrag(0),
  });
  createEffect(() => {
    const at = props.items.findIndex((it) => it.value === props.value);
    if (at < 0) return;
    const w = widths();
    const left = w.slice(0, at).reduce((a, b) => a + b + 2, 2);
    const right = left + w[at]!;
    const now = scroller.intent();
    if (left < now) scroller.chaseTo(Math.max(0, left - 12));
    else if (right > now + props.width) scroller.chaseTo(Math.min(Math.max(0, total() - props.width), right - props.width + 12));
  });
  onFrame(() => {
    scroller.step();
    const off = Math.round(scroller.offset());
    if (off !== painted) {
      painted = off;
      hotProp(inner, "translateX", -off);
    }
  });
  return (
    <View ref={viewport} class="overflow-hidden rounded-xl" style={{ width: props.width, height: 24, bgColor: PAPER }}>
      <View ref={inner} class="flex-row items-center gap-[2] px-[2]" style={{ width: total(), height: 24 }}>
        <For each={props.items}>
          {(entry, i) => (
            <Tap onTap={() => props.onPick(entry.value)} class="items-center justify-center rounded-lg shrink-0" style={{ width: widths()[i()]!, height: 20, bgColor: entry.value === props.value ? SUN : "#00000000" }}>
              <Text class="text-2xs font-bold" style={{ textColor: entry.value === props.value ? INK : INK_SOFT }}>{entry.label}</Text>
            </Tap>
          )}
        </For>
      </View>
    </View>
  );
}
