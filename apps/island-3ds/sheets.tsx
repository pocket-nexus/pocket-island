// The lists that take the touch screen: the catalogue, storage, the sets
// and showrooms, the menu (the room, the settings, the language) and the
// rules. The stylus works every one; so does the pad (the +Control Pad walks,
// A chooses, L and R change tab, B goes back).
import { createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { Image, Text, View } from "@pocketjs/framework/components";
import { BTN } from "@pocketjs/framework/input";
import { onFrame } from "@pocketjs/framework/lifecycle";
import { ITEM_LIMIT, ROOM_SIZES } from "../../src/core/rules.ts";
import { DATA, finishesIn, itemsIn, picture, SERIES_IDS, TABS, type Tab } from "./catalog.ts";
import type { ItemData, SeriesId } from "./catalog-types.ts";
import * as E from "./editor.ts";
import { island } from "./host.ts";
import { Pill, Scroll, Seg, Sheet, SLOT, Swatch, Switch, TabStrip, Tap, wrap } from "./parts.tsx";
import { HoldKey } from "./phone.tsx";
import { ShopSheet, shopPad } from "./shop.tsx";
import { CREAM_2, INK, INK_SOFT, LEAF, PAPER, SUN, tint } from "./theme.ts";

/** The open sheet's answer to the pad; B goes back when it does not take it. */
let padHandler: ((pressed: number) => boolean) | null = null;
function usePad(handler: (pressed: number) => boolean) {
  padHandler = handler;
  onCleanup(() => {
    if (padHandler === handler) padHandler = null;
  });
}
export function sheetPress(pressed: number): void {
  if (E.sheet() === "shop" ? shopPad?.(pressed) : padHandler?.(pressed)) return;
  if (pressed & BTN.CROSS) E.openSheet(E.sheet() === "help" ? "menu" : null);
}

const close = () => E.openSheet(null);

export function Sheets() {
  return (
    <>
      <Show when={E.sheet() === "catalog"}><CatalogSheet /></Show>
      <Show when={E.sheet() === "storage"}><StorageSheet /></Show>
      <Show when={E.sheet() === "sets"}><SetsSheet /></Show>
      <Show when={E.sheet() === "menu"}><MenuSheet /></Show>
      <Show when={E.sheet() === "help"}><HelpSheet /></Show>
      <Show when={E.sheet() === "shop"}><ShopSheet /></Show>
    </>
  );
}

/** Moves a focus over a grid of `count` cells, `columns` across. */
function walk(pressed: number, at: number, count: number, columns: number): number {
  if (!count) return 0;
  if (pressed & BTN.RIGHT) return Math.min(count - 1, at + 1);
  if (pressed & BTN.LEFT) return Math.max(0, at - 1);
  if (pressed & BTN.DOWN) return Math.min(count - 1, at + columns);
  if (pressed & BTN.UP) return Math.max(0, at - columns);
  return at;
}

// ---------------------------------------------------------------- the catalogue

const CARD_W = 74, CARD_H = 70, COLUMNS = 4;
const TAB_KEYS = { floor: "tab.floor", misc: "tab.misc", wall: "tab.wall", ceiling: "tab.ceiling", rug: "tab.rug", wallpaper: "tab.wallpaper", flooring: "tab.flooring" } as const;

function Card(props: { picture: string; name: string; on: boolean; focused: boolean; badge?: string; onTap: () => void }) {
  // Two lines at most, measured in the glyphs of the language shown.
  const lines = () => (E.lang(), wrap(props.name, SLOT.tinyBold, CARD_W - 8, 2));
  return (
    <Tap onTap={props.onTap} class="relative flex-col items-center rounded-xl shrink-0" style={{ width: CARD_W, height: CARD_H, bgColor: props.on ? SUN : props.focused ? CREAM_2 : PAPER, borderWidth: props.focused ? 2 : 0, borderColor: INK }}>
      <Image src={props.picture} style={{ width: 40, height: 40, marginT: 2 }} />
      <For each={lines()}>{(line) => <Text class="text-2xs font-bold" style={{ textColor: INK, height: 11 }}>{line}</Text>}</For>
      <Show when={props.badge}>
        <View class="absolute rounded-md px-1" style={{ insetR: 3, insetT: 3, bgColor: tint(PAPER, 0.9) }}>
          <Text class="text-2xs font-bold" style={{ textColor: INK_SOFT }}>{props.badge}</Text>
        </View>
      </Show>
    </Tap>
  );
}

function CatalogSheet() {
  const [tab, setTab] = createSignal<Tab>(E.layer() === "wall" ? "wall" : E.layer() === "rug" ? "rug" : E.layer() === "ceiling" ? "ceiling" : "floor");
  const [series, setSeries] = createSignal<SeriesId | "all">("all");
  const [focus, setFocus] = createSignal(0);
  const [picked, setPicked] = createSignal<{ def: ItemData; variant: number } | null>(null);
  const finishTab = () => tab() === "wallpaper" || tab() === "flooring";
  const items = createMemo(() => (finishTab() ? [] : itemsIn(tab(), series())));
  const finishes = createMemo(() => (finishTab() ? finishesIn(tab() as "wallpaper" | "flooring", series()) : []));
  const count = () => (finishTab() ? finishes().length : items().length);
  const seriesList: (SeriesId | "all")[] = ["all", ...SERIES_IDS];
  const seriesLabel = () => (series() === "all" ? E.tr("catalog.allSeries") : E.seriesNameOf(series() as SeriesId));
  const switchTab = (next: Tab) => {
    setTab(next);
    setFocus(0);
    setPicked(null);
  };
  const stepSeries = (d: number) => {
    setSeries(seriesList[(seriesList.indexOf(series()) + d + seriesList.length) % seriesList.length]!);
    setFocus(0);
    setPicked(null);
  };
  const choose = (i: number) => {
    setFocus(i);
    if (finishTab()) {
      const f = finishes()[i];
      if (f) E.applyFinish(f.id);
      return;
    }
    const def = items()[i];
    if (!def) return;
    if (picked()?.def.id === def.id) place();
    else setPicked({ def, variant: 0 });
  };
  const place = () => {
    const p = picked();
    if (p && E.place(p.def, p.variant)) close();
  };
  usePad((pressed) => {
    if (pressed & BTN.LTRIGGER) switchTab(TABS[(TABS.indexOf(tab()) + TABS.length - 1) % TABS.length]!);
    else if (pressed & BTN.RTRIGGER) switchTab(TABS[(TABS.indexOf(tab()) + 1) % TABS.length]!);
    else if (pressed & BTN.SQUARE) stepSeries(1);
    else if (pressed & BTN.CIRCLE) choose(focus());
    else if (pressed & BTN.TRIANGLE && picked()) setPicked({ ...picked()!, variant: (picked()!.variant + 1) % picked()!.def.variants.length });
    else if (pressed & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT)) setFocus(walk(pressed, focus(), count(), COLUMNS));
    else return false;
    return true;
  });
  const rows = () => Math.ceil(count() / COLUMNS);
  const gridH = () => (picked() ? 210 - 26 - 26 - 40 : 210 - 26 - 26);
  const current = () => (tab() === "wallpaper" ? E.room().wallpaper : tab() === "flooring" ? E.room().flooring : "");
  const tabItems = () => TABS.map((value) => ({ value, label: E.tr(TAB_KEYS[value]) }));
  return (
    <Sheet title={E.tr("catalog.title")} onClose={close}>
      <View class="flex-col items-center" style={{ width: 320 }}>
        <View style={{ height: 2 }} />
        <TabStrip items={tabItems()} value={tab()} width={312} onPick={switchTab} />
        <View class="flex-row items-center justify-between px-1" style={{ width: 316, height: 24 }}>
          <Pill label="‹" width={28} height={22} small onTap={() => stepSeries(-1)} />
          <Text class="text-xs font-bold" style={{ textColor: INK }}>{wrap(seriesLabel(), SLOT.smallBold, 240, 1)[0]}</Text>
          <Pill label="›" width={28} height={22} small onTap={() => stepSeries(1)} />
        </View>
        <Scroll width={308} height={gridH()} content={rows() * (CARD_H + 4)} focus={[Math.floor(focus() / COLUMNS) * (CARD_H + 4), Math.floor(focus() / COLUMNS) * (CARD_H + 4) + CARD_H]}>
          <View class="flex-row flex-wrap gap-1" style={{ width: 308 }}>
            <Show when={!finishTab()}>
              <For each={items()}>
                {(def, i) => <Card picture={picture(`${def.id}.${picked()?.def.id === def.id ? picked()!.variant : 0}`)} name={E.nameOf(def)} on={picked()?.def.id === def.id} focused={focus() === i()} badge={`${def.size[0]}×${def.size[1]}`} onTap={() => choose(i())} />}
              </For>
            </Show>
            <Show when={finishTab()}>
              <For each={finishes()}>{(f, i) => <Card picture={picture(`finish:${f.id}`)} name={E.finishNameOf(f)} on={current() === f.id} focused={focus() === i()} onTap={() => choose(i())} />}</For>
            </Show>
          </View>
          <Show when={!count()}>
            <Text class="text-xs" style={{ textColor: INK_SOFT, width: 300 }}>{finishTab() ? E.tr("catalog.noFinishes") : E.tr("catalog.noItems")}</Text>
          </Show>
        </Scroll>
        <Show when={picked()}>
          <View class="flex-row items-center justify-between px-2" style={{ width: 320, height: 40, bgColor: PAPER }}>
            <View class="flex-col" style={{ width: 120 }}>
              <Text class="text-xs font-bold" style={{ textColor: INK }}>{E.nameOf(picked()!.def)}</Text>
              <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{E.variantNameOf(picked()!.def.variants[picked()!.variant])}</Text>
            </View>
            <View class="flex-row gap-1">
              <For each={picked()!.def.variants.slice(0, 4)}>{(v, i) => <Swatch color={v.swatch} on={i() === picked()!.variant} onTap={() => setPicked({ ...picked()!, variant: i() })} />}</For>
            </View>
            <Pill label={E.tr("ds.catalog.place")} tone="leaf" width={64} height={30} onTap={place} />
          </View>
        </Show>
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- storage

function StorageSheet() {
  const [focus, setFocus] = createSignal(0);
  const stored = () => E.room().storage;
  const take = (i: number) => {
    const s = stored()[i];
    const def = s && DATA.items.find((d) => d.id === s.item);
    if (def && E.place(def, s.variant, i)) close();
  };
  usePad((pressed) => {
    if (pressed & BTN.CIRCLE) take(focus());
    else if (pressed & (BTN.UP | BTN.DOWN | BTN.LEFT | BTN.RIGHT)) setFocus(walk(pressed, focus(), stored().length, COLUMNS));
    else return false;
    return true;
  });
  return (
    <Sheet title={`${E.tr("storage.title")} (${stored().length})`} onClose={close}>
      <Show
        when={stored().length}
        fallback={
          <View class="flex-col items-center justify-center gap-1" style={{ width: 320, height: 200 }}>
            <Image src={picture("ui:box")} style={{ width: 32, height: 32 }} />
            <Text class="text-xs font-bold" style={{ textColor: INK_SOFT }}>{E.tr("storage.empty")}</Text>
            <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{E.tr("storage.emptyHint")}</Text>
          </View>
        }
      >
        <View class="items-center" style={{ width: 320, height: 210 }}>
          <View style={{ height: 4 }} />
          <Scroll width={308} height={202} content={Math.ceil(stored().length / COLUMNS) * (CARD_H + 4)} focus={[Math.floor(focus() / COLUMNS) * (CARD_H + 4), Math.floor(focus() / COLUMNS) * (CARD_H + 4) + CARD_H]}>
            <View class="flex-row flex-wrap gap-1" style={{ width: 308 }}>
              <For each={stored()}>
                {(s, i) => {
                  const def = DATA.items.find((d) => d.id === s.item);
                  return <Card picture={picture(`${s.item}.${s.variant}`)} name={def ? E.nameOf(def) : s.item} on={false} focused={focus() === i()} onTap={() => take(i())} />;
                }}
              </For>
            </View>
          </Scroll>
        </View>
      </Show>
    </Sheet>
  );
}

// ---------------------------------------------------------------- sets and showrooms

function SetsSheet() {
  const [focus, setFocus] = createSignal(0);
  const showrooms: (SeriesId | "all")[] = [...SERIES_IDS, "all"];
  const rows = DATA.presets.length + showrooms.length;
  const open = (i: number) => {
    if (i < DATA.presets.length) {
      const p = DATA.presets[i]!;
      E.ask(E.tr("sets.confirm", { name: E.presetNameOf(p) }), E.tr("sets.confirmBody"), () => {
        E.loadRoom(p.state, true);
        close();
        E.say(E.tr("sets.done", { name: E.presetNameOf(p) }), "good", "set");
      });
      return;
    }
    const s = showrooms[i - DATA.presets.length]!;
    const state = DATA.showrooms[s];
    E.loadRoom(state, false, s);
    close();
    E.say(E.tr("sets.entered", { name: s === "all" ? E.tr("room.everything") : E.seriesNameOf(s), n: state.items.length }), "info", "showroom");
  };
  usePad((pressed) => {
    if (pressed & BTN.CIRCLE) open(focus());
    else if (pressed & (BTN.UP | BTN.DOWN)) setFocus(walk(pressed, focus(), rows, 1));
    else return false;
    return true;
  });
  const ROW = 34;
  return (
    <Sheet title={E.tr("sets.title")} onClose={close}>
      <View class="items-center" style={{ width: 320 }}>
        <Scroll width={312} height={208} content={rows * ROW + 40} focus={[focus() * ROW + (focus() >= DATA.presets.length ? 20 : 0), focus() * ROW + ROW + 20]}>
          <Text class="text-xs font-bold shrink-0" style={{ textColor: INK_SOFT, marginL: 6, height: 18 }}>{E.tr("sets.rooms")}</Text>
          <For each={DATA.presets}>
            {(p, i) => (
              <Tap onTap={() => open(i())} class="flex-row items-center gap-2 rounded-lg px-2 shrink-0" style={{ width: 308, height: ROW - 2, bgColor: focus() === i() ? CREAM_2 : PAPER, marginB: 2 }}>
                <View class="rounded-full w-[18] h-[18]" style={{ bgColor: p.swatch }} />
                <View class="flex-col">
                  <Text class="text-xs font-bold" style={{ textColor: INK }}>{E.presetNameOf(p)}</Text>
                  <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{(E.lang(), wrap(E.presetBlurbOf(p), SLOT.tiny, 270, 1)[0])}</Text>
                </View>
              </Tap>
            )}
          </For>
          <Text class="text-xs font-bold shrink-0" style={{ textColor: INK_SOFT, marginL: 6, height: 20, marginT: 2 }}>{E.tr("sets.showrooms")}</Text>
          <For each={showrooms}>
            {(s, i) => {
              const at = () => DATA.presets.length + i();
              return (
                <Tap onTap={() => open(at())} class="flex-row items-center justify-between rounded-lg px-2 shrink-0" style={{ width: 308, height: ROW - 2, bgColor: focus() === at() ? CREAM_2 : PAPER, marginB: 2 }}>
                  <Text class="text-xs font-bold" style={{ textColor: INK }}>{s === "all" ? E.tr("room.everything") : E.seriesNameOf(s)}</Text>
                  <Text class="text-2xs" style={{ textColor: INK_SOFT }}>{E.tr("sets.pieces", { n: DATA.showrooms[s].items.length })}</Text>
                </Tap>
              );
            }}
          </For>
        </Scroll>
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the menu: the room, the settings, the language

const ROW_H = 34;

function Row(props: { label: string; children?: JSX.Element; focused?: boolean }) {
  return (
    <View class="flex-row items-center justify-between rounded-lg px-2 shrink-0" style={{ width: 308, height: ROW_H - 2, marginB: 2, bgColor: props.focused ? CREAM_2 : PAPER }}>
      <Text class="text-xs font-bold" style={{ textColor: INK }}>{wrap(props.label, SLOT.smallBold, 150, 1)[0]}</Text>
      {props.children}
    </View>
  );
}

function MenuSheet() {
  const [focus, setFocus] = createSignal(0);
  const sizes = () => ROOM_SIZES.map((s) => ({ value: s.id, label: `${s.w}×${s.d}` }));
  const sizeId = () => ROOM_SIZES.find((s) => s.w === E.room().w && s.d === E.room().d)?.id ?? "";
  const langs = () => E.LOCALES.map((l) => ({ value: l, label: E.languageName(l) }));
  const toggle = (key: "halos" | "shadows" | "stats" | "music" | "sounds") => E.setOption(key, !E.settings()[key]);
  const actions: (() => void)[] = [
    () => {
      const i = ROOM_SIZES.findIndex((s) => s.id === sizeId());
      const next = ROOM_SIZES[(i + 1) % ROOM_SIZES.length]!;
      E.resizeRoom(next.w, next.d);
    },
    () => E.ask(E.tr("room.putAllConfirm"), E.tr("room.putAllBody"), E.putAllAway),
    () => E.saveToCard(),
    () => E.loadFromCard(),
    () => E.ask(E.tr("room.resetConfirm"), E.tr("room.resetBody", { name: E.presetNameOf(DATA.presets[0]!) }), E.resetRoom),
    () => E.setLanguage(E.LOCALES[(E.LOCALES.indexOf(E.lang()) + 1) % E.LOCALES.length]!),
    () => toggle("halos"),
    () => toggle("shadows"),
    () => toggle("stats"),
    () => toggle("music"),
    () => toggle("sounds"),
    () => E.clockNow(),
    () => E.openSheet("help"),
  ];
  const TIME_ROW = 11;
  usePad((pressed) => {
    if (pressed & BTN.CIRCLE) actions[focus()]!();
    else if (pressed & (BTN.UP | BTN.DOWN)) setFocus(walk(pressed, focus(), actions.length, 1));
    else return false;
    return true;
  });
  // On the clock's row, left or right held on the +Control Pad moves the clock (debug).
  let padScrub = 0;
  onFrame((buttons: number) => {
    const dir = focus() === TIME_ROW && !E.confirmation() ? (buttons & BTN.RIGHT ? 1 : buttons & BTN.LEFT ? -1 : 0) : 0;
    if (dir === padScrub) return;
    padScrub = dir;
    E.scrub(dir);
  });
  onCleanup(() => E.scrub(0));
  const y = (i: number) => [i * ROW_H + (i >= 5 ? 26 : 0) + 20, i * ROW_H + (i >= 5 ? 26 : 0) + 20 + ROW_H] as [number, number];
  return (
    <Sheet title={E.tr("ds.menu")} onClose={close}>
      <View class="items-center" style={{ width: 320 }}>
        <Scroll width={308} height={208} content={13 * ROW_H + 52} focus={y(focus())}>
          <Text class="text-xs font-bold shrink-0" style={{ textColor: INK_SOFT, marginL: 6, height: 20 }}>{E.tr("room.title")}</Text>
          <Row label={E.tr("room.size")} focused={focus() === 0}>
            <Seg items={sizes()} value={sizeId()} width={136} height={16} onPick={(id) => {
              const s = ROOM_SIZES.find((x) => x.id === id)!;
              E.resizeRoom(s.w, s.d);
            }} />
          </Row>
          <Row label={E.tr("room.putAll")} focused={focus() === 1}><Pill icon="box" width={36} height={24} small onTap={actions[1]!} /></Row>
          <Row label={E.tr("ds.room.save")} focused={focus() === 2}><Pill icon="download" width={36} height={24} small onTap={actions[2]!} /></Row>
          <Row label={E.tr("ds.room.load")} focused={focus() === 3}><Pill icon="upload" width={36} height={24} small onTap={actions[3]!} /></Row>
          <Row label={E.tr("room.reset")} focused={focus() === 4}><Pill icon="house" width={36} height={24} small onTap={actions[4]!} /></Row>
          <Text class="text-xs font-bold shrink-0" style={{ textColor: INK_SOFT, marginL: 6, height: 22, marginT: 4 }}>{E.tr("settings.button")}</Text>
          <Row label={E.tr("settings.language")} focused={focus() === 5}>
            <Seg items={langs()} value={E.lang()} width={136} height={16} onPick={(l) => E.setLanguage(l)} />
          </Row>
          <Row label={E.tr("ds.settings.halos")} focused={focus() === 6}><Switch on={E.settings().halos} onTap={actions[6]!} /></Row>
          <Row label={E.tr("ds.settings.shadows")} focused={focus() === 7}><Switch on={E.settings().shadows} onTap={actions[7]!} /></Row>
          <Row label={E.tr("ds.settings.stats")} focused={focus() === 8}><Switch on={E.settings().stats} onTap={actions[8]!} /></Row>
          <Row label={island.info().sound === false ? `${E.tr("settings.music")} · ${E.tr("ds.sound.off")}` : E.tr("settings.music")} focused={focus() === 9}><Switch on={E.settings().music} onTap={actions[9]!} /></Row>
          <Row label={E.tr("settings.sounds")} focused={focus() === 10}><Switch on={E.settings().sounds} onTap={actions[10]!} /></Row>
          <Row label={`${E.tr("ds.settings.time")} ${E.clockLabel()}`} focused={focus() === TIME_ROW}>
            <View class="flex-row items-center gap-1">
              <HoldKey icon="rewind" direction={-1} width={36} />
              <Pill label={E.tr("settings.timeNow")} tone="cream" width={52} height={26} small onTap={E.clockNow} />
              <HoldKey icon="forward" direction={1} width={36} />
            </View>
          </Row>
          <Row label={E.tr("help.button")} focused={focus() === 12}><Pill icon="help" width={36} height={24} small onTap={actions[12]!} /></Row>
        </Scroll>
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the rules and the controls

function HelpSheet() {
  const rules = ["grid", "rotate", "overlap", "rugs", "surfaces", "walls", "ceiling", "door", "limit", "shrink"] as const;
  const controls: [string, Parameters<typeof E.tr>[0]][] = [
    [E.tr("ds.help.key.pad"), "ds.help.do.walk"],
    ["A", "ds.help.do.door"],
    ["A", "ds.help.do.act"],
    ["Y", "ds.help.do.pickUp"],
    ["X", "ds.help.do.pockets"],
    ["A", "ds.help.do.shop"],
    [E.tr("ds.help.key.dpad"), "ds.help.do.tool"],
    [E.tr("ds.help.stylus"), "ds.help.do.map"],
    [E.tr("ds.help.stylus"), "ds.help.do.dex"],
    // In the house: the furniture by hand, then decorating and its keys.
    ["A", "ds.help.do.grab"],
    ["Y", "ds.help.do.lift"],
    [E.tr("ds.help.key.dpad"), "ds.help.do.decorate"],
    [E.tr("ds.help.stylus"), "ds.help.do.tap"],
    [E.tr("ds.help.stylus"), "ds.help.do.drag"],
    [E.tr("ds.help.stylus"), "ds.help.do.trash"],
    [E.tr("ds.help.key.lr"), "ds.help.do.copy"],
    [E.tr("ds.help.key.dpad"), "ds.help.do.dpad"],
    ["A", "ds.help.do.a"],
    ["X", "ds.help.do.x"],
    ["Y", "ds.help.do.y"],
    ["B", "ds.help.do.b"],
    [E.tr("ds.help.key.lr"), "ds.help.do.lr"],
    [E.tr("ds.help.key.stick"), "ds.help.do.stick"],
    [E.tr("ds.help.key.zoom"), "ds.help.do.zoom"],
    ["SELECT", "ds.help.do.select"],
    ["START", "ds.help.do.start"],
  ];
  // Each line is wrapped in the glyphs of the language shown, and its row is as tall as its lines.
  const rows = createMemo(() => {
    E.lang();
    const out: { key?: string; lines: string[]; y: number; h: number; heading?: boolean }[] = [];
    let y = 0;
    const add = (row: { key?: string; lines: string[]; heading?: boolean }) => {
      const h = row.heading ? 24 : row.lines.length * 12 + 8;
      out.push({ ...row, y, h });
      y += h;
    };
    add({ lines: [E.tr("help.rules")], heading: true });
    for (const r of rules) add({ lines: wrap(E.tr(`help.rule.${r}`, { max: ITEM_LIMIT }), SLOT.tiny, 280, 3) });
    add({ lines: [E.tr("help.controls")], heading: true });
    for (const [key, what] of controls) add({ key, lines: wrap(E.tr(what), SLOT.tiny, 196, 3) });
    return { out, height: y };
  });
  const [offset, setOffset] = createSignal(0);
  usePad((pressed) => {
    if (pressed & BTN.DOWN) setOffset(Math.min(offset() + 1, rows().out.length - 1));
    else if (pressed & BTN.UP) setOffset(Math.max(0, offset() - 1));
    else return false;
    return true;
  });
  const focusOf = () => {
    const r = rows().out[offset()]!;
    return [r.y, r.y + r.h] as [number, number];
  };
  return (
    <Sheet title={E.tr("help.button")} onClose={() => E.openSheet("menu")}>
      <View class="items-center" style={{ width: 320 }}>
        <Scroll width={308} height={208} content={rows().height + 8} focus={focusOf()}>
          <For each={rows().out}>
            {(row) => (
              <Show
                when={!row.heading}
                fallback={<Text class="text-xs font-bold shrink-0" style={{ textColor: INK_SOFT, height: row.h, marginL: 4, marginT: 4 }}>{row.lines[0]}</Text>}
              >
                <View class="flex-row items-center gap-2 shrink-0" style={{ width: 308, height: row.h }}>
                  <Show when={row.key} fallback={<View class="rounded-full w-[6] h-[6]" style={{ bgColor: LEAF }} />}>
                    <View class="rounded-md px-1 items-center justify-center" style={{ height: 18, width: 84, bgColor: CREAM_2 }}>
                      <Text class="text-2xs font-bold" style={{ textColor: INK }}>{wrap(row.key!, SLOT.tinyBold, 78, 1)[0]}</Text>
                    </View>
                  </Show>
                  <View class="flex-col">
                    <For each={row.lines}>{(line) => <Text class="text-2xs" style={{ textColor: INK, height: 12 }}>{line}</Text>}</For>
                  </View>
                </View>
              </Show>
            )}
          </For>
        </Scroll>
      </View>
    </Sheet>
  );
}
