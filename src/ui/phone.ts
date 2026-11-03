// The player's phone in the browser, as on the console's touch screen (apps/island-3ds/phone.tsx): a
// cartoon phone at the bottom right, its status bar with the clock and the island's name, and on its
// home screen a clock and the apps:
//
//   Map        the island (src/island/map.ts) with where the player is; a click walks there (from inside
//              the house, out of the door first), with dots marching to a ring where the walk ends
//   Clock      the hour, the day's looks along a bar, and keys that move the clock while held (debug)
//   Home       to the door and in; inside, out of the house
//   Pockets    what the player carries (src/core/things.ts): a tool to hold, something to drop
//              outdoors; in the house, the storage box beside them, to put in and take out
//   Guide      the fish caught and the fossils dug up (crates/island-core/src/dex.rs): each kind
//              found shows where and when it is had, the largest, how many and the first's day
//   Settings   the settings
//   Help       the rules and the keys
//
// The round key under the screen goes back to the home screen, and from there puts the phone away.

import type { World } from "../world.ts";
import { game } from "../core/game.ts";
import { clock, periodOf, skyPhase, weights, type Period } from "../core/clock.ts";
import { drawMap, MAP_COLORS } from "../island/map.ts";
import { routeDots } from "../island/route.ts";
import { h, svg } from "./dom.ts";
import type { IconName } from "./icons.ts";
import { pocketName, t, type MessageKey } from "../i18n/index.ts";
import { dex, shop, things, type DexEntry, type Slot, type Slots } from "../core/things.ts";
import { formatCoins, itemDef } from "../items/items.ts";
import { itemThumb } from "./thumbs.ts";

export type PhoneApp = "home" | "map" | "clock" | "pockets" | "dex";

export interface PhoneHost {
  world(): World | null;
  /** While a key is held: the clock moves back (-1) or forward (1); 0 lets go. */
  scrub(direction: number): void;
  /** The clock back to the device's own time. */
  now(): void;
  settings(): void;
  help(): void;
}

const PERIOD_ICON: Record<Period, IconName> = { day: "sun", dusk: "sunset", night: "moon" };
const PERIOD_NAME: Record<Period, MessageKey> = { day: "time.day", dusk: "time.dusk", night: "time.night" };
/** The day's looks, a colour an hour along the clock's bar. */
const LOOK_RGB: Record<Period, number[]> = { day: [0xf8, 0xd8, 0x6a], dusk: [0xf2, 0x9a, 0x7e], night: [0x3e, 0x4f, 0x8a] };
const HOUR_COLORS = Array.from({ length: 24 }, (_, hour) => {
  const w = weights(skyPhase(hour + 0.5));
  return `rgb(${[0, 1, 2].map((k) => Math.round(LOOK_RGB.day[k]! * w.day + LOOK_RGB.dusk[k]! * w.dusk + LOOK_RGB.night[k]! * w.night)).join(",")})`;
});
/** Pixels a tile the map is drawn at (it is shown smaller, for a sharp picture). */
const MAP_PX = 8;

export interface PhoneApi {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  readonly app: PhoneApp;
  /** Bring the phone out at an app. */
  show(app?: PhoneApp): void;
  /** Out at `app`, or away when it is already there. */
  toggle(app?: PhoneApp): void;
  /** Put away. */
  hide(): void;
  /** The round key: back to the home screen, or away from it. */
  back(): void;
  /** The clock changed (each minute, or each frame while it is moved). */
  clock(hour: number): void;
  /** The place or the language changed. */
  refresh(): void;
  /** Each frame: the map's marker and the route, while the map is shown. */
  frame(seconds: number): void;
}

export function mountPhone(host: PhoneHost): PhoneApi {
  let app: PhoneApp = "home";
  let open = false;
  const relabels: Array<() => void> = [];
  const label = (key: MessageKey): Text => {
    const node = document.createTextNode(t(key));
    relabels.push(() => { node.textContent = t(key); });
    return node;
  };

  // ---------- The status bar ----------
  const barTime = h("b", { class: "time" });
  const barName = h("span", { class: "name" }, label("island.name"));
  const bar = h("div", { class: "phone-bar" }, barTime, barName, h("span", { class: "battery" }, h("i")));

  // ---------- The home screen ----------
  const widgetTime = h("b", { class: "big-time" });
  const widgetPeriod = h("span", { class: "period" });
  const widgetPlace = h("span", { class: "place" });
  const widget = h("button", { class: "phone-widget", "data-phone": "clock", onclick: () => go("clock") },
    widgetTime, h("span", { class: "about" }, widgetPeriod, widgetPlace));
  const doorLabel = h("span", { class: "label" });
  const appKey = (name: string, tile: HTMLElement, text: Node, open: () => void) =>
    h("button", { class: "phone-app", "data-phone": name, onclick: open }, tile, h("span", { class: "label" }, text));
  const apps = h("div", { class: "phone-apps" },
    appKey("map", h("span", { class: "tile leaf" }, svg("map")), label("island.map"), () => go("map")),
    appKey("pockets", h("span", { class: "tile sand" }, svg("bag")), label("phone.pockets"), () => go("pockets")),
    appKey("dex", h("span", { class: "tile sky" }, svg("book")), label("phone.dex"), () => go("dex")),
    h("button", { class: "phone-app", "data-phone": "door", onclick: () => door() }, h("span", { class: "tile coral" }, svg("door")), doorLabel),
    appKey("settings", h("span", { class: "tile sun" }, svg("sparkle")), label("settings.button"), () => host.settings()),
    appKey("help", h("span", { class: "tile rose" }, svg("help")), label("phone.help"), () => host.help()),
  );
  const home = h("div", { class: "phone-page home", "data-page": "home" },
    h("i", { class: "deco sun-disc" }), h("i", { class: "deco cloud a" }), h("i", { class: "deco cloud b" }), h("i", { class: "deco sea" }), h("i", { class: "deco beach" }),
    widget, apps);

  // ---------- The map ----------
  const base = h("canvas", { class: "base" });
  const over = h("canvas", { class: "over" });
  const mapHint = h("span", { class: "hint" });
  const mapDoor = h("button", { class: "pill leaf small", "data-phone": "map-door", onclick: () => door() });
  const legend = h("div", { class: "legend" });
  const mapWrap = h("div", { class: "map-wrap" }, base, over);
  mapWrap.addEventListener("pointerdown", (e) => {
    const w = host.world();
    if (!w || e.button !== 0) return;
    const r = over.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * w.map.w, z = ((e.clientY - r.top) / r.height) * w.map.d;
    const [x0, z0, x1, z1] = w.map.house.rect;
    if (x > x0 - 0.5 && x < x1 + 0.5 && z > z0 - 1 && z < z1 + 0.6) w.walkOnIsland(w.map.house.door.x, w.map.house.door.z + 0.5, true);
    else w.walkOnIsland(x, z);
  });
  const mapPage = h("div", { class: "phone-page map", "data-page": "map" },
    h("button", { class: "phone-back", "data-phone": "back", onclick: () => go("home") }, svg("back")),
    h("h4", {}, label("island.mapTitle")),
    mapWrap,
    h("div", { class: "map-foot" }, mapHint, mapDoor),
    legend);
  let drawnMap = false;

  // ---------- The clock ----------
  const clockTime = h("b", { class: "big-time" });
  const clockPeriod = h("span", { class: "period" });
  const marker = h("i", { class: "marker" });
  const dayBar = h("div", { class: "day-bar" }, h("div", { class: "hours" }, ...HOUR_COLORS.map((c) => h("i", { style: `background:${c}` }))), marker,
    h("div", { class: "ticks" }, ...[0, 6, 12, 18, 24].map((hour) => h("span", { style: `left:${(hour / 24) * 100}%` }, String(hour)))));
  const holdKey = (name: string, glyph: IconName, dir: number) => {
    const el = h("button", { class: "pill", "data-scrub": `phone-${name}` }, svg(glyph));
    const stop = () => host.scrub(0);
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); host.scrub(dir); });
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointerleave", stop);
    el.addEventListener("pointercancel", stop);
    return el;
  };
  const clockPage = h("div", { class: "phone-page clock", "data-page": "clock" },
    h("button", { class: "phone-back", "data-phone": "back", onclick: () => go("home") }, svg("back")),
    clockTime, clockPeriod, dayBar,
    h("div", { class: "scrub" }, holdKey("back", "rewind", -1), h("button", { class: "pill", onclick: () => host.now() }, label("settings.timeNow")), holdKey("forward", "forward", 1)),
    h("p", { class: "note" }, label("phone.clockDebug")));

  // ---------- The body ----------
  // ---------- The pockets, and the box in the house ----------
  let tab: "pockets" | "box" = "pockets";
  let chosen = -1;
  // The list beside the chosen place (what can be done with it), as on the touch screen.
  let menu = false;
  let shownSlots = "";
  const pocketTab = h("button", { class: "on", "data-tab": "pockets", onclick: () => { tab = "pockets"; chosen = -1; shownSlots = ""; } }, label("pockets.title"));
  const boxTab = h("button", { "data-tab": "box", onclick: () => { tab = "box"; chosen = -1; shownSlots = ""; } }, label("pockets.box"));
  const grid = h("div", { class: "slots" });
  const detail = h("div", { class: "slot-detail" });
  const wallet = h("span", { class: "coins" });
  const pocketsPage = h("div", { class: "phone-page pockets", "data-page": "pockets" },
    h("button", { class: "phone-back", "data-phone": "back", onclick: () => go("home") }, svg("back")),
    h("h4", {}, label("phone.pockets")),
    h("div", { class: "wallet", "data-wallet": "" }, wallet),
    h("div", { class: "seg pocket-tabs" }, pocketTab, boxTab),
    grid, detail);

  /** The pockets or the box, drawn again when what is in them, or the choice, changed. */
  function renderPockets(force = false): void {
    const w = host.world();
    if (!w) return;
    const indoors = w.place === "house";
    if (!indoors && tab === "box") tab = "pockets";
    const s = things.slots();
    const list = tab === "box" ? s.box : s.pockets;
    const coins = shop.money().wallet;
    const signature = `${tab}:${chosen}:${menu}:${indoors}:${s.held}:${coins}:${list.map((x) => `${x.item}x${x.count}w${x.wear.toFixed(2)}`).join(",")}`;
    if (!force && signature === shownSlots) return;
    shownSlots = signature;
    pocketTab.classList.toggle("on", tab === "pockets");
    boxTab.classList.toggle("on", tab === "box");
    boxTab.disabled = !indoors;
    grid.classList.toggle("box", tab === "box");
    wallet.replaceChildren(svg("coin"), t("pockets.wallet", { n: formatCoins(coins) }));
    grid.replaceChildren(...list.map((slot, k) => slotCell(slot, k, s)));
    detail.replaceChildren(...slotDetail(list[chosen], s, indoors));
    const options = menu ? slotMenu(list[chosen], s, indoors) : [];
    if (options.length) {
      // Beside the chosen place: to its right, or to its left near the grid's right edge.
      const cell = grid.children[chosen] as HTMLElement;
      const box = h("div", { class: "slot-menu", "data-menu": "" }, ...options);
      grid.append(box);
      const right = cell.offsetLeft + cell.offsetWidth - 6;
      box.style.left = `${right + box.offsetWidth > grid.clientWidth ? cell.offsetLeft - box.offsetWidth + 6 : right}px`;
      box.style.top = `${cell.offsetTop + 8}px`;
    }
  }

  function slotCell(slot: Slot, k: number, s: Slots): HTMLElement {
    const cell = h("button", {
      class: `slot${k === chosen ? " on" : ""}${slot.item && slot.item === s.held && tab === "pockets" ? " held" : ""}`, "data-slot": String(k),
      onclick: () => {
        // A click on something brings up what can be done with it; again, or on an empty place, puts it away.
        if (chosen === k && menu) menu = false;
        else {
          chosen = k;
          menu = !!slot.item;
        }
      },
    });
    if (slot.item) {
      const img = h("img", { alt: "", draggable: "false" });
      itemThumb(slot.item, (url) => { img.src = url; });
      cell.append(img);
      if (slot.count > 1) cell.append(h("b", {}, String(slot.count)));
      // A tool's wear, as a bar along the bottom.
      if (slot.wear > 0) cell.append(h("i", { class: `wear${slot.wear < 0.25 ? " low" : ""}`, style: `--wear:${Math.round(slot.wear * 100)}%` }));
    }
    return cell;
  }

  function slotDetail(slot: Slot | undefined, s: Slots, indoors: boolean): Node[] {
    const def = slot?.item ? itemDef(slot.item) : undefined;
    if (!slot || !def) {
      const empty = tab === "box" ? s.box.every((x) => !x.item) : s.pockets.every((x) => !x.item);
      return [h("span", { class: "note" }, tab === "box" ? (empty ? t("pockets.boxEmpty") : "") : empty ? t("pockets.empty") : indoors ? "" : t("pockets.boxAway"))];
    }
    const name = slot.count > 1 ? `${pocketName(def)} ×${slot.count}` : pocketName(def);
    return [h("b", {}, slot.wear > 0 ? `${name} · ${t("pockets.wear", { n: Math.max(1, Math.round(slot.wear * 100)) })}` : name)];
  }

  /** What can be done with the chosen place: hold a tool or put it away and drop outdoors, into the box or out of it in the house. */
  function slotMenu(slot: Slot | undefined, s: Slots, indoors: boolean): HTMLElement[] {
    const def = slot?.item ? itemDef(slot.item) : undefined;
    if (!slot || !def) return [];
    const k = chosen;
    const act = (name: MessageKey, run: () => void) => h("button", {
      "data-do": name, onclick: (e: Event) => {
        e.stopPropagation();
        run();
        host.world()?.keep();
        menu = false;
      },
    }, t(name));
    if (tab === "box") return [act("pockets.take", () => things.take(k))];
    if (indoors) return [act("pockets.store", () => things.store(k))];
    const out: HTMLElement[] = [];
    if (def.kind === "tool") out.push(act(s.held === def.id ? "pockets.putAway" : "pockets.hold", () => things.hold(k)));
    out.push(act("pockets.drop", () => things.drop(k)));
    return out;
  }

  // ---------- The field guide ----------
  let dexTab: "fish" | "fossils" = "fish";
  let dexChosen = 0;
  let shownDex = "";
  const dexTabs = (["fish", "fossils"] as const).map((k) => h("button", { "data-tab": k, onclick: () => { dexTab = k; dexChosen = 0; } }, label(`dex.${k}`)));
  const dexGrid = h("div", { class: "slots dex-grid" });
  const dexDetail = h("div", { class: "dex-detail" });
  const dexProgress = h("span", { class: "progress" });
  const dexPage = h("div", { class: "phone-page dex", "data-page": "dex" },
    h("button", { class: "phone-back", "data-phone": "back", onclick: () => go("home") }, svg("back")),
    h("h4", {}, label("dex.title")), dexProgress,
    h("div", { class: "seg pocket-tabs" }, ...dexTabs),
    dexGrid, dexDetail);

  /** The guide drawn again when what has been found, the tab or the choice changed. */
  function renderDex(force = false): void {
    const all = dex.entries();
    const list = all.filter((e) => (dexTab === "fish") === (e.where !== "ground"));
    const signature = `${dexTab}:${dexChosen}:${all.map((e) => `${e.count}/${e.best.toFixed(2)}`).join(",")}`;
    if (!force && signature === shownDex) return;
    shownDex = signature;
    dexTabs.forEach((b, k) => b.classList.toggle("on", (k === 0) === (dexTab === "fish")));
    dexProgress.textContent = t("dex.progress", { n: all.filter((e) => e.count > 0).length, total: all.length });
    dexGrid.replaceChildren(...list.map((e, k) => {
      const cell = h("button", { class: `slot${k === dexChosen ? " on" : ""}${e.count ? "" : " unknown"}`, "data-dex": String(e.item), onclick: () => { dexChosen = k; } });
      const img = h("img", { alt: "", draggable: "false" });
      itemThumb(e.item, (url) => { img.src = url; });
      cell.append(img);
      return cell;
    }));
    dexDetail.replaceChildren(...dexLines(list[dexChosen]));
  }

  function dexLines(e: DexEntry | undefined): Node[] {
    const def = e ? itemDef(e.item) : undefined;
    if (!e || !def) return [];
    if (!e.count) return [h("b", {}, "?"), h("span", { class: "note" }, t("dex.unknown"))];
    const where = t(`dex.where.${e.where}`);
    const hours = e.where === "ground" ? "" : e.from === e.to ? t("dex.allDay") : t("dex.hours", { from: String(e.from).padStart(2, "0"), to: String(e.to).padStart(2, "0") });
    const date = new Date(e.first * 86_400_000).toISOString().slice(0, 10);
    return [
      h("b", {}, pocketName(def)),
      h("span", {}, [where, hours].filter(Boolean).join(" · ")),
      h("span", { class: "note" }, [
        t(e.where === "ground" ? "dex.found" : "dex.caught", { n: e.count }),
        def.length ? t("dex.best", { n: Math.round(def.length * e.best * 100) }) : "",
        t("dex.price", { n: formatCoins(e.price) }),
      ].filter(Boolean).join(" · ")),
      h("span", { class: "note" }, t("dex.first", { date })),
    ];
  }

  const screen = h("div", { class: "phone-screen" }, home, mapPage, clockPage, pocketsPage, dexPage, bar);
  const key = h("button", { class: "phone-key", "data-phone": "key", onclick: () => api.back() });
  relabels.push(() => key.setAttribute("aria-label", t("phone.open")));
  const el = h("div", { class: "phone", "data-app": app },
    h("div", { class: "phone-body" }, h("i", { class: "speaker" }), screen, key));

  function go(next: PhoneApp): void {
    app = next;
    el.dataset.app = next;
    if (next === "map" && !drawnMap) drawBase();
  }

  function door(): void {
    const w = host.world();
    if (!w) return;
    if (w.place === "house") w.exit();
    else {
      w.walkOnIsland(w.map.house.door.x, w.map.house.door.z + 0.5, true);
      go("map");
    }
  }

  function drawBase(): void {
    const w = host.world();
    if (!w) return;
    const m = w.map;
    base.width = over.width = m.w * MAP_PX;
    base.height = over.height = m.d * MAP_PX;
    drawMap(base.getContext("2d")!, m, MAP_PX);
    drawnMap = true;
  }

  function renderLegend(): void {
    legend.replaceChildren(...([["#f2806b", "island.youAreHere"], ["#e2715a", "island.house"], [MAP_COLORS.grass[2], "island.legend.cliff"], [MAP_COLORS.water, "island.legend.river"], [MAP_COLORS.path, "island.legend.path"], [MAP_COLORS.bridge, "island.legend.bridge"]] as Array<[string, MessageKey]>)
      .map(([color, key]) => h("span", {}, h("i", { style: `background:${color}` }), t(key))));
  }

  /** The map's overlay: where the walk goes, and the player. */
  function drawOver(seconds: number): void {
    const w = host.world();
    if (!w || !drawnMap) return;
    const g = over.getContext("2d")!;
    const s = MAP_PX;
    g.clearRect(0, 0, over.width, over.height);
    const indoors = w.place === "house";
    const here = indoors ? { x: w.map.house.door.x, z: w.map.house.door.z + 0.6, yaw: 0 } : w.walker;
    const ahead = !indoors && w.now.walking ? game.goal() : [];
    if (ahead.length) {
      g.fillStyle = "#ffffff";
      for (const d of routeDots(here, ahead, seconds, { spacing: 2.2, near: 2, ring: 2.4, most: 40, march: 1.6 })) {
        g.beginPath();
        g.arc(d.x * s, d.z * s, s * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      const end = ahead[ahead.length - 1]!;
      const wave = (seconds * 0.9) % 1;
      g.lineWidth = s * 0.55;
      g.strokeStyle = `rgba(255,255,255,${0.85 * (1 - wave) * (1 - wave)})`;
      g.beginPath();
      g.arc(end.x * s, end.z * s, s * (1.6 + 2.2 * wave), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "#ffffff";
      g.beginPath();
      g.arc(end.x * s, end.z * s, s * (1.6 + 0.2 * Math.sin(seconds * 5.5)), 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#f2806b";
      g.beginPath();
      g.arc(end.x * s, end.z * s, s * 0.7, 0, Math.PI * 2);
      g.fill();
    }
    // The player: a white disc with a coral arrow toward where they face.
    g.save();
    g.translate(here.x * s, here.z * s);
    g.rotate(-here.yaw);
    g.scale(1.7, 1.7);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(0, 0, s * 1.05, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f2806b";
    g.beginPath();
    if (indoors) g.arc(0, 0, s * 0.6, 0, Math.PI * 2);
    else {
      g.moveTo(0, s * 1.0);
      g.lineTo(s * 0.62, -s * 0.5);
      g.lineTo(0, -s * 0.15);
      g.lineTo(-s * 0.62, -s * 0.5);
      g.closePath();
    }
    g.fill();
    g.restore();
  }

  const api: PhoneApi = {
    el,
    get isOpen() { return open; },
    get app() { return app; },
    show(next = app) {
      open = true;
      el.classList.add("open");
      go(next);
      api.refresh();
    },
    toggle(next = "home") {
      if (open && app === next) api.hide();
      else api.show(next);
    },
    hide() {
      open = false;
      el.classList.remove("open");
      host.scrub(0);
    },
    back() {
      if (app !== "home") go("home");
      else api.hide();
    },
    clock(hour) {
      const p = skyPhase(hour);
      const period = periodOf(p);
      const text = clock.label(hour);
      barTime.textContent = widgetTime.textContent = clockTime.textContent = text;
      widgetPeriod.replaceChildren(svg(PERIOD_ICON[period]), t(PERIOD_NAME[period]));
      clockPeriod.replaceChildren(svg(PERIOD_ICON[period]), t(PERIOD_NAME[period]));
      clockPage.dataset.period = period;
      marker.style.left = `${(hour / 24) * 100}%`;
    },
    refresh() {
      shownSlots = "";
      for (const f of relabels) f();
      const w = host.world();
      const indoors = w?.place === "house";
      doorLabel.textContent = indoors ? t("island.goOut") : t("phone.home");
      widgetPlace.textContent = indoors ? t("island.house") : t("island.name");
      mapHint.textContent = indoors ? t("phone.mapOut") : t("phone.mapTap");
      mapDoor.replaceChildren(svg(indoors ? "door" : "door-white"), indoors ? t("island.goOut") : t("island.goIn"));
      mapDoor.classList.toggle("leaf", !indoors);
      renderLegend();
      api.clock(clock.hour());
    },
    frame(seconds) {
      if (open && app === "pockets") renderPockets();
      if (open && app === "dex") renderDex();
      if (open && app === "map") drawOver(seconds);
    },
  };
  return api;
}
