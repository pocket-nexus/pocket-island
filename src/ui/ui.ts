// The interface around the room, in the island's style: cream panels with a
// lip, rounded type, and the decorating toolbar along the bottom.

import type { App } from "../app.ts";
import type { World, WorldEvents } from "../world.ts";
import { ITEM_LIMIT, ROOM_SIZES } from "../core/rules.ts";
import { LAYERS, type EditorEvents, type Notice } from "../editor.ts";
import { FURNITURE, furniture } from "../furniture/catalog.ts";
import { FINISHES } from "../furniture/finishes.ts";
import { SERIES, type FurnitureDef, type SeriesId } from "../furniture/types.ts";
import type { CeilingMode, TimeOfDay } from "../scene/lighting.ts";
import { PRESETS, defaultRoom } from "../presets.ts";
import { showroom } from "../showroom.ts";
import { loadSaved } from "../app.ts";
import { parseRoom } from "../core/model.ts";
import { finishThumb, thumb } from "./thumbs.ts";
import { MAP_COLORS, drawMap } from "../island/map.ts";
import { icon } from "./icons.ts";
import {
  LOCALES, categoryName, finishName, itemName, languageName, locale, onLocaleChange, presetBlurb, presetName, problemText,
  roomSizeName, seriesBlurb, seriesName, setLocale, t, variantName, type MessageKey,
} from "../i18n/index.ts";

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const svg = (name: Parameters<typeof icon>[0], cls = "icon") => {
  const span = h("span", { html: icon(name, cls) });
  return span.firstElementChild as Element;
};

type Drawer = "catalog" | "storage" | "sets" | "room" | null;
type Tab = "floor" | "misc" | "wall" | "ceiling" | "rug" | "wallpaper" | "flooring";

const TABS: Tab[] = ["floor", "misc", "wall", "ceiling", "rug", "wallpaper", "flooring"];
const LIGHTS: CeilingMode[] = ["warm", "cool", "off"];
const TIMES: Array<[TimeOfDay, Parameters<typeof icon>[0]]> = [["day", "sun"], ["dusk", "sunset"], ["night", "moon"]];

export function mountUI(root: HTMLElement): { events: EditorEvents; worldEvents: WorldEvents; attach(app: App, world: World): void } {
  let app: App | null = null;
  let world: World | null = null;
  let drawer: Drawer = null;
  let reopen: Drawer = null;
  let tab: Tab = "floor";
  let series: SeriesId | "all" = "all";
  let light: CeilingMode = "warm";
  let time: TimeOfDay = "day";
  const cardVariant = new Map<string, number>();

  // Fixed labels: each registers how to redraw itself when the language changes.
  const relabels: Array<() => void> = [];
  const label = (key: MessageKey): Text => {
    const node = document.createTextNode(t(key));
    relabels.push(() => { node.textContent = t(key); });
    return node;
  };
  const titled = <E extends HTMLElement>(el: E, key: MessageKey, attr = "title"): E => {
    const set = () => el.setAttribute(attr, t(key));
    set();
    relabels.push(set);
    return el;
  };

  const toasts = h("div", { class: "toasts" });
  /** `key` names what the toast is about, for scripted checks. */
  const toast = (message: string, tone: "info" | "warn" = "info", key = "") => {
    const el = h("div", { class: `toast ${tone}`, "data-key": key || undefined }, svg(tone === "warn" ? "alert" : "leaf"), message);
    toasts.append(el);
    setTimeout(() => el.remove(), 2700);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
  };
  const notice = (n: Notice) => {
    if (n.kind === "selected") toast(t("notice.selected", { n: n.count }), "info", "selected");
    else if (n.kind === "stored") toast(t("notice.stored", { n: n.count }), "info", "stored");
    else if (n.rotating) toast(t("notice.cantRotate", { reason: problemText(n.problem) }), "warn", "cant-rotate");
    else toast(problemText(n.problem), "warn", n.problem.reason);
  };

  // ---------- Top left: the room card ----------
  const countEl = h("span", { class: "count" });
  const sizeEl = h("span");
  const titleEl = h("h1");
  const backBtn = h("button", { class: "pill back", onclick: () => {
    app?.loadRoom(loadSaved() ?? defaultRoom());
    toast(t("room.backed"));
  } }, svg("house"), label("room.back"));
  const roomCard = h("div", { class: "room-card panel" },
    h("div", { class: "badge" }, svg("leaf-white", "icon icon-lg")),
    h("div", {}, titleEl, h("p", {}, sizeEl, " · ", countEl)),
  );
  const tag = h("div", { class: "tag" });

  // ---------- Outdoors: the island's card, the map, the door ----------
  const islandSub = h("p");
  const islandCard = h("div", { class: "room-card panel island-card" },
    h("div", { class: "badge" }, svg("leaf-white", "icon icon-lg")),
    h("div", {}, h("h1", {}, label("island.name")), islandSub),
  );
  const mapBtn = h("button", { class: "pill", "data-action": "map", onclick: () => openMap() }, svg("map"), label("island.map"));
  const goInBtn = h("button", { class: "pill big leaf", "data-action": "go-in", onclick: () => world?.enter() }, svg("door-white", "icon icon-lg"), label("island.goIn"));
  const goOutBtn = h("button", { class: "pill", "data-action": "go-out", onclick: () => world?.exit() }, svg("door"), label("island.goOut"));

  // ---------- Top right: light, time, picture ----------
  const lightBtn = titled(h("button", { class: "pill", onclick: () => cycleLight() }), "light.title");
  const timeSeg = h("div", { class: "seg" });
  const settingsBtn = h("button", { class: "pill", "data-action": "settings", onclick: () => settings.classList.toggle("open") }, svg("sparkle"), label("settings.button"));
  const helpBtn = titled(h("button", { class: "pill", onclick: () => openHelp() }, svg("help")), "help.button");
  const topRight = h("div", { class: "top-right" }, lightBtn, timeSeg, mapBtn, settingsBtn, helpBtn);

  const quality = { tiltShift: true, ao: true, bloom: true };
  const toggleRow = (name: MessageKey, key: keyof typeof quality) => {
    const sw = titled(h("button", { class: "switch on" }), name, "aria-label");
    sw.addEventListener("click", () => {
      quality[key] = !quality[key];
      sw.classList.toggle("on", quality[key]);
      app?.stage.setQuality({ [key]: quality[key] });
    });
    return h("div", { class: "toggle-row" }, label(name), sw);
  };
  const languageSeg = h("div", { class: "seg languages" });
  const renderLanguages = () => languageSeg.replaceChildren(...LOCALES.map((l) => h("button", {
    class: l === locale() ? "on" : "", lang: l, "data-locale": l, onclick: () => setLocale(l),
  }, languageName(l))));
  const settings = h("div", { class: "settings-pop panel" },
    h("h3", {}, label("settings.picture")),
    toggleRow("settings.tiltShift", "tiltShift"),
    toggleRow("settings.ao", "ao"),
    toggleRow("settings.bloom", "bloom"),
    h("h3", { class: "gap" }, label("settings.language")),
    languageSeg,
  );

  // ---------- Bottom: mode button, decorating toolbar, hints ----------
  const layerSeg = h("div", { class: "seg layers" });
  const undoBtn = titled(h("button", { class: "pill", onclick: () => app?.editor.undo() }, svg("undo")), "toolbar.undo");
  const redoBtn = titled(h("button", { class: "pill", onclick: () => app?.editor.redo() }, svg("redo")), "toolbar.redo");
  const storageCount = h("span");
  const drawerBtn = (which: Exclude<Drawer, null>, name: MessageKey, ico: Parameters<typeof icon>[0], extra?: Node) =>
    h("button", { class: "pill", "data-drawer": which, onclick: () => toggleDrawer(which) }, svg(ico), label(name), extra ?? null);
  const catalogBtn = drawerBtn("catalog", "toolbar.catalog", "book");
  const storageBtn = drawerBtn("storage", "toolbar.storage", "box", storageCount);
  const setsBtn = drawerBtn("sets", "toolbar.sets", "sparkle");
  const roomBtn = drawerBtn("room", "toolbar.room", "house");
  const doneBtn = h("button", { class: "pill big leaf", onclick: () => app?.editor.setMode("view") }, svg("check-white", "icon icon-lg"), label("mode.done"));
  const decorateBtn = h("button", { class: "pill big", "data-action": "decorate", onclick: () => app?.editor.setMode("decorate") }, svg("hammer", "icon icon-lg"), label("mode.decorate"));
  const toolbar = h("div", { class: "toolbar" });
  const hints = h("div", { class: "hints" });
  const bottom = h("div", { class: "bottom" }, toolbar, hints);

  // ---------- Drawer ----------
  const drawerTitle = h("h3");
  const drawerBody = h("div", { class: "scroll" });
  const drawerTabs = h("div", { class: "tabs" });
  const drawerChips = h("div", { class: "chips" });
  const drawerEl = h("div", { class: "drawer panel" },
    h("div", { class: "drawer-head" }, drawerTitle, h("button", { class: "close", onclick: () => toggleDrawer(null) }, svg("close"))),
    drawerTabs, drawerChips, drawerBody,
  );

  // ---------- Inspector ----------
  const inspector = h("div", { class: "inspector panel" });

  // ---------- Banner while placing ----------
  const banner = h("div", { class: "banner panel" });

  // ---------- Modal ----------
  const modalBack = h("div", { class: "modal-back", onclick: (e: Event) => { if (e.target === modalBack) closeModal(); } });
  const closeModal = () => modalBack.classList.remove("open");
  const openModal = (content: HTMLElement) => {
    modalBack.replaceChildren(content);
    modalBack.classList.add("open");
  };

  const loading = h("div", { class: "loading" }, h("div", {}, svg("leaf", "leaf"), label("app.loading")));

  root.append(roomCard, islandCard, topRight, settings, bottom, drawerEl, inspector, banner, toasts, tag, modalBack, loading);

  // A name tag follows the pointer over an item.
  let tagUid: string | null = null;
  window.addEventListener("pointermove", (e) => {
    tag.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`;
  });
  function showTag(uid: string | null): void {
    tagUid = uid;
    const p = uid && app ? app.model.state.items.find((q) => q.uid === uid) : null;
    const def = p && furniture(p.item);
    tag.classList.toggle("open", !!def);
    if (!def || !p || !app) return;
    const variant = def.variants.length > 1 ? variantName(def.variants[p.variant]) : "";
    const hint = app.editor.mode === "view" ? ((def.light || def.switchable) ? t("tag.switch") : "") : t("tag.edit");
    tag.replaceChildren(h("b", {}, itemName(def)), h("span", {}, [variant, `${def.size[0]}×${def.size[1]}`, hint].filter(Boolean).join(" · ")));
  }

  // ---------- Behaviour ----------

  function cycleLight(): void {
    if (outdoors()) return;
    light = LIGHTS[(LIGHTS.indexOf(light) + 1) % LIGHTS.length]!;
    app?.setLight(light, time);
    renderTop();
    toast(t("light.toast", { mode: t(`light.${light}`) }));
  }

  function renderTop(): void {
    lightBtn.replaceChildren(svg(light === "off" ? "bulb-off" : "bulb"), t(`light.${light}`));
    lightBtn.classList.toggle("on", light !== "off");
    lightBtn.style.display = outdoors() ? "none" : "";
    timeSeg.replaceChildren(...TIMES.map(([when, ico]) => h("button", {
      class: when === time ? "on" : "", onclick: () => { time = when; app?.setLight(light, time); world?.setTime(time); renderTop(); renderRoomCard(); },
    }, svg(ico), t(`time.${when}`))));
  }

  const outdoors = () => world?.place === "island";

  function toggleDrawer(which: Drawer): void {
    drawer = drawer === which ? null : which;
    if (drawer && app && app.editor.mode !== "decorate") app.editor.setMode("decorate");
    renderDrawer();
    renderBottom();
  }

  function renderBottom(): void {
    if (!app) return;
    const e = app.editor;
    const s = app.model.state;
    storageCount.textContent = s.storage.length ? ` ${s.storage.length}` : "";
    for (const b of [catalogBtn, storageBtn, setsBtn, roomBtn]) b.classList.toggle("on", b.dataset.drawer === drawer);
    undoBtn.disabled = !app.model.canUndo;
    redoBtn.disabled = !app.model.canRedo;
    if (outdoors()) {
      toolbar.replaceChildren(...(world?.nearDoor ? [goInBtn] : []));
      hints.replaceChildren(...hintList(world?.nearDoor
        ? [["E", "hint.goIn"], ["WASD", "hint.walk"], ["Shift", "hint.run"], ["M", "hint.map"]]
        : [["WASD", "hint.walk"], ["Shift", "hint.run"], ["key.click", "hint.walkThere"], ["M", "hint.map"]]));
    } else if (e.mode === "view") {
      toolbar.replaceChildren(goOutBtn, decorateBtn);
      hints.replaceChildren(...hintList([["WASD", "hint.walk"], ["key.click", "hint.walkOrSwitch"], ["key.drag", "hint.orbit"], ["E", "hint.decorate"]]));
    } else {
      layerSeg.replaceChildren(...LAYERS.map((l) =>
        h("button", { class: l === e.layer ? "on" : "", onclick: () => app!.editor.setLayer(l) }, t(`layer.${l}`))));
      toolbar.replaceChildren(layerSeg, h("span", { class: "sep" }), catalogBtn, storageBtn, setsBtn, roomBtn, h("span", { class: "sep" }), undoBtn, redoBtn, doneBtn);
      hints.replaceChildren(...hintList(e.placing
        ? [["key.click", "hint.drop"], ["R", "hint.rotate"], ["key.shiftClick", "hint.keepPlacing"], ["Esc", "hint.cancel"]]
        : [["key.dragItem", "hint.move"], ["R", "hint.rotate"], ["X", "hint.putAway"], ["key.arrows", "hint.nudge"], ["key.dragFloor", "hint.boxSelect"], ["key.rightDrag", "hint.turnView"], ["Tab", "hint.layer"]]));
    }
  }

  /** Key and action pairs; a key is a message for words like "Drag", or itself for E, R, Tab. */
  function hintList(list: Array<[MessageKey | string, MessageKey]>): HTMLElement[] {
    return list.map(([k, v]) => h("span", {}, h("kbd", {}, k.includes(".") ? t(k as MessageKey) : k), t(v)));
  }

  function renderRoomCard(): void {
    if (!app) return;
    const out = outdoors();
    roomCard.style.display = out ? "none" : "";
    islandCard.style.display = out ? "" : "none";
    islandSub.textContent = t("island.outdoors", { time: t(`time.${time}`) });
    const s = app.model.state;
    const show = app.showroom;
    titleEl.textContent = show ? t("room.showroom", { name: show === "all" ? t("room.everything") : seriesName(show) }) : t("app.title");
    if (show) roomCard.append(backBtn);
    else backBtn.remove();
    sizeEl.textContent = t("room.tiles", { w: s.w, d: s.d });
    countEl.textContent = t("room.count", { n: s.items.length, max: ITEM_LIMIT });
    countEl.classList.toggle("full", s.items.length >= ITEM_LIMIT);
  }

  function itemCard(def: FurnitureDef, onPick: (variant: number) => void, badge?: string): HTMLElement {
    const v = Math.min(cardVariant.get(def.id) ?? 0, def.variants.length - 1);
    const name = itemName(def);
    const img = h("img", { class: "pic", alt: name, draggable: "false" });
    thumb(def, v, (url) => { img.src = url; });
    const sw = def.variants.length > 1 ? h("div", { class: "swatches" }, ...def.variants.map((variant, i) => {
      const dot = h("button", { class: `swatch${i === v ? " on" : ""}`, title: variantName(variant), style: `background:${variant.swatch}` });
      dot.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cardVariant.set(def.id, i);
        renderDrawer();
      });
      return dot;
    })) : null;
    const size = `${def.size[0]}×${def.size[1]}`;
    return h("div", { class: "card", "data-item": def.id, title: `${name} (${seriesName(def.series)} · ${categoryName(def.category)})`, onclick: () => onPick(v) },
      img, h("span", { class: "size" }, size), badge ? h("span", { class: "count" }, badge) : null, h("div", { class: "name" }, name), sw);
  }

  function renderDrawer(): void {
    drawerEl.classList.toggle("open", drawer !== null);
    if (!app || !drawer) return;
    const s = app.model.state;
    drawerTabs.replaceChildren();
    drawerChips.replaceChildren();
    if (drawer === "catalog") {
      drawerTitle.textContent = t("catalog.title");
      drawerTabs.replaceChildren(...TABS.map((which) => h("button", { class: `tab${which === tab ? " on" : ""}`, onclick: () => { tab = which; renderDrawer(); } }, t(`tab.${which}`))));
      const seriesIds = ["all", ...Object.keys(SERIES)] as Array<SeriesId | "all">;
      drawerChips.replaceChildren(...seriesIds.map((id) => h("button", { class: `chip${id === series ? " on" : ""}`, onclick: () => { series = id; renderDrawer(); } },
        id === "all" ? t("catalog.allSeries") : seriesName(id))));
      if (tab === "wallpaper" || tab === "flooring") {
        const kind = tab === "wallpaper" ? "wallpaper" : "flooring";
        const list = FINISHES.filter((f) => f.kind === kind && (series === "all" || f.series === series));
        const current = kind === "wallpaper" ? s.wallpaper : s.flooring;
        drawerBody.replaceChildren(list.length ? h("div", { class: "grid" }, ...list.map((f) => h("div", {
          class: `card${f.id === current ? " current" : ""}`, onclick: () => {
            if (kind === "wallpaper") app!.setWallpaper(f.id);
            else app!.setFlooring(f.id);
            toast(t("catalog.applied", { name: finishName(f) }));
          },
        }, h("img", { class: "pic flat", src: finishThumb(f), alt: finishName(f) }), h("div", { class: "name" }, finishName(f))))) : h("div", { class: "empty" }, t("catalog.noFinishes")));
        return;
      }
      const list = FURNITURE.filter((d) => !d.hidden && d.kind === tab && (series === "all" || d.series === series));
      drawerBody.replaceChildren(list.length ? h("div", { class: "grid" }, ...list.map((def) => itemCard(def, (v) => place(def, v, null)))) : h("div", { class: "empty" }, t("catalog.noItems")));
      return;
    }
    if (drawer === "storage") {
      drawerTitle.textContent = t("storage.title");
      const groups = new Map<string, number[]>();
      s.storage.forEach((st, i) => {
        const key = `${st.item}:${st.variant}`;
        groups.set(key, [...(groups.get(key) ?? []), i]);
      });
      if (!groups.size) {
        drawerBody.replaceChildren(h("div", { class: "empty" }, t("storage.empty"), h("br"), t("storage.emptyHint")));
        return;
      }
      drawerBody.replaceChildren(h("div", { class: "grid" }, ...[...groups].map(([key, idx]) => {
        const [id, variant] = key.split(":");
        const def = furniture(id!);
        if (!def) return h("div");
        cardVariant.set(def.id, Number(variant));
        const card = itemCard(def, () => place(def, Number(variant), idx[0]!), idx.length > 1 ? `×${idx.length}` : undefined);
        card.querySelector(".swatches")?.remove();
        return card;
      })));
      return;
    }
    if (drawer === "sets") {
      drawerTitle.textContent = t("sets.title");
      const seriesIds = Object.keys(SERIES) as SeriesId[];
      drawerBody.replaceChildren(
        h("h3", {}, t("sets.rooms")),
        h("div", { class: "sets" }, ...PRESETS.map((p) => h("button", {
          class: "set", onclick: () => confirmAction(t("sets.confirm", { name: presetName(p) }), t("sets.confirmBody"), () => {
            app!.loadRoom(p.make());
            toast(t("sets.done", { name: presetName(p) }));
          }),
        }, h("span", { class: "dot", style: `background:${p.swatch}` }), h("span", {}, h("b", {}, presetName(p)), h("span", {}, presetBlurb(p)))))),
        h("h3", { style: "margin-top:18px" }, t("sets.showrooms")),
        h("p", { class: "note" }, t("sets.showroomNote")),
        h("div", { class: "sets" }, ...seriesIds.map((id) => {
          const count = FURNITURE.filter((d) => d.series === id && !d.hidden).length;
          const swatch = FURNITURE.find((d) => d.series === id)?.variants[0]?.swatch ?? "#ddd";
          return h("button", {
            class: "set", onclick: () => {
              app!.loadRoom(showroom(id), id);
              toast(t("sets.entered", { name: seriesName(id), n: count }));
            },
          }, h("span", { class: "dot", style: `background:${swatch}` }), h("span", {}, h("b", {}, seriesName(id)), h("span", {}, t("sets.count", { n: count, blurb: seriesBlurb(id) }))));
        })),
      );
      return;
    }
    if (drawer === "room") {
      drawerTitle.textContent = t("room.title");
      const sizes = h("div", { class: "sizes" }, ...ROOM_SIZES.map((r) => h("button", {
        class: `size-btn${r.w === s.w && r.d === s.d ? " on" : ""}`, onclick: () => {
          if (r.w === s.w && r.d === s.d) return;
          const lost = app!.setSize(r.w, r.d);
          toast(lost ? t("room.resizedLost", { w: r.w, d: r.d, n: lost }) : t("room.resized", { w: r.w, d: r.d }));
        },
      }, roomSizeName(r), h("small", {}, t("room.sizeTiles", { w: r.w, d: r.d })))));
      drawerBody.replaceChildren(
        h("h3", {}, t("room.size")), sizes,
        h("h3", {}, t("room.tidy")),
        h("div", { class: "row-actions" },
          h("button", { class: "pill", onclick: () => confirmAction(t("room.putAllConfirm"), t("room.putAllBody"), () => { app!.editor.selectAllEverything(); app!.editor.putAway(); }) }, svg("box"), t("room.putAll")),
          h("button", { class: "pill", onclick: () => exportRoom() }, svg("download"), t("room.export")),
          h("button", { class: "pill", onclick: () => importRoom() }, svg("upload"), t("room.import")),
          h("button", { class: "pill", onclick: () => confirmAction(t("room.resetConfirm"), t("room.resetBody", { name: presetName(PRESETS[0]!) }), () => { app!.loadRoom(PRESETS[0]!.make()); }) }, svg("house"), t("room.reset")),
        ),
      );
    }
  }

  function place(def: FurnitureDef, variant: number, fromStorage: number | null): void {
    if (!app) return;
    reopen = drawer;
    drawer = null;
    renderDrawer();
    app.editor.beginPlacing(def, variant, fromStorage);
  }

  function renderInspector(): void {
    if (!app) return;
    const e = app.editor;
    const sel = e.selected();
    const open = e.mode === "decorate" && sel.length > 0 && !e.placing;
    inspector.classList.toggle("open", open);
    if (!open) return;
    if (sel.length > 1) {
      inspector.replaceChildren(
        h("h2", {}, t("inspector.selected", { n: sel.length })),
        h("div", { class: "meta" }, t("inspector.selectedNote")),
        h("div", { class: "actions" },
          h("button", { class: "pill", onclick: () => e.rotate() }, svg("rotate"), t("inspector.rotate")),
          h("button", { class: "pill danger", onclick: () => e.putAway() }, svg("box"), t("inspector.putAll")),
        ),
      );
      return;
    }
    const { placement, def } = sel[0]!;
    const where = t(`where.${placement.layer}`);
    const switchable = !!(def.light || def.switchable);
    const on = placement.on ?? def.light?.startsOn ?? false;
    const parts: Array<HTMLElement | null> = [
      h("h2", {}, itemName(def)),
      h("div", { class: "meta" }, [seriesName(def.series), categoryName(def.category), t("inspector.size", { w: def.size[0], d: def.size[1] }), where].join(" · ")),
      def.variants.length > 1 ? h("div", { class: "variants" }, ...def.variants.map((v, i) => h("button", {
        class: `variant${i === placement.variant ? " on" : ""}`, onclick: () => e.setVariant(i),
      }, h("i", { style: `background:${v.swatch}` }), variantName(v)))) : null,
      h("div", { class: "actions" },
        placement.layer !== "wall" ? h("button", { class: "pill", onclick: () => e.rotate() }, svg("rotate"), t("inspector.rotate")) : null,
        switchable ? h("button", { class: "pill", onclick: () => e.toggle(placement.uid) }, svg(on ? "bulb-off" : "bulb"), on ? t("inspector.turnOff") : t("inspector.turnOn")) : null,
        h("button", { class: "pill danger", onclick: () => e.putAway() }, svg("box"), t("inspector.putAway")),
      ),
    ];
    inspector.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }

  function renderBanner(): void {
    const pl = app?.editor.placing;
    banner.classList.toggle("open", !!pl);
    if (!pl) return;
    const variant = pl.def.variants.length > 1 ? variantName(pl.def.variants[pl.variant]) : "";
    banner.replaceChildren(svg("hand"), h("b", {}, itemName(pl.def)), h("small", {}, [variant, t("inspector.size", { w: pl.def.size[0], d: pl.def.size[1] })].filter(Boolean).join(" · ")));
  }

  function confirmAction(title: string, body: string, ok: () => void): void {
    openModal(h("div", { class: "modal panel confirm" },
      h("h2", {}, title), h("p", {}, body),
      h("div", { class: "foot" },
        h("button", { class: "pill", onclick: closeModal }, t("confirm.cancel")),
        h("button", { class: "pill leaf", onclick: () => { closeModal(); ok(); } }, t("confirm.ok")),
      ),
    ));
  }

  /** The island's map, with where the player is and the house. */
  function openMap(): void {
    if (!world) return;
    const m = world.map;
    const s = Math.max(4, Math.min(9, Math.floor(Math.min(innerWidth - 120, 760) / m.w)));
    const c = h("canvas", { class: "map", width: m.w * s, height: m.d * s });
    const g = c.getContext("2d")!;
    drawMap(g, m, s);
    // Where the player is: on the island, or at the house when inside it.
    const here = world.place === "island" ? world.walker : { x: m.house.door.x, z: m.house.door.z + 0.6, yaw: 0 };
    g.save();
    g.translate(here.x * s, here.z * s);
    g.rotate(-here.yaw);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(0, 0, s * 1.05, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f2806b";
    g.beginPath();
    g.moveTo(0, s * 1.0);
    g.lineTo(s * 0.62, -s * 0.5);
    g.lineTo(0, -s * 0.15);
    g.lineTo(-s * 0.62, -s * 0.5);
    g.closePath();
    g.fill();
    g.restore();
    const legend = ([["#f2806b", "island.youAreHere"], ["#e2715a", "island.house"], [MAP_COLORS.grass[2], "island.legend.cliff"], [MAP_COLORS.water, "island.legend.river"], [MAP_COLORS.path, "island.legend.path"], [MAP_COLORS.bridge, "island.legend.bridge"]] as Array<[string, MessageKey]>)
      .map(([color, key]) => h("span", {}, h("i", { style: `background:${color}` }), t(key)));
    openModal(h("div", { class: "modal panel map-modal" },
      h("h2", {}, t("island.mapTitle")),
      c,
      h("div", { class: "legend" }, ...legend),
      h("div", { class: "foot" }, h("button", { class: "pill leaf", onclick: closeModal }, t("help.ok"))),
    ));
  }

  function openHelp(): void {
    if (outdoors()) {
      const keys: Array<[MessageKey | string, MessageKey]> = [
        ["help.key.arrows", "help.do.walk"], ["Shift", "help.do.run"], ["help.key.leftButton", "help.do.walkThere"],
        ["E / Enter", "help.do.goIn"], ["M", "help.do.map"],
      ];
      openModal(h("div", { class: "modal panel" },
        h("h2", {}, t("help.island")),
        h("ul", {}, ...(["help.island.walk", "help.island.cliffs", "help.island.house"] as MessageKey[]).map((r) => h("li", {}, t(r)))),
        h("h4", {}, t("help.controls")),
        h("div", { class: "keys" }, ...keys.flatMap(([k, v]) => [h("kbd", {}, k.startsWith("help.") ? t(k as MessageKey) : k), h("span", {}, t(v))])),
        h("div", { class: "foot" }, h("button", { class: "pill leaf", onclick: closeModal }, t("help.ok"))),
      ));
      return;
    }
    const keys: Array<[MessageKey | string, MessageKey]> = [
      ["E", "help.do.decorate"], ["help.key.leftButton", "help.do.pick"], ["R", "help.do.rotate"], ["X / Delete", "help.do.store"],
      ["help.key.arrows", "help.do.nudge"], ["Tab", "help.do.layer"], ["help.key.rightDrag", "help.do.orbit"], ["help.key.wheel", "help.do.zoom"],
      ["⌘Z / ⇧⌘Z", "help.do.undo"], ["help.key.shiftClick", "help.do.add"], ["L", "help.do.light"],
    ];
    const rules: MessageKey[] = [
      "help.rule.grid", "help.rule.rotate", "help.rule.overlap", "help.rule.rugs", "help.rule.surfaces",
      "help.rule.walls", "help.rule.ceiling", "help.rule.door", "help.rule.limit", "help.rule.shrink",
    ];
    openModal(h("div", { class: "modal panel" },
      h("h2", {}, t("help.rules")),
      h("ul", {}, ...rules.map((r) => h("li", {}, t(r, { max: ITEM_LIMIT })))),
      h("h4", {}, t("help.controls")),
      h("div", { class: "keys" }, ...keys.flatMap(([k, v]) => [h("kbd", {}, k.startsWith("help.") ? t(k as MessageKey) : k), h("span", {}, t(v))])),
      h("div", { class: "foot" }, h("button", { class: "pill leaf", onclick: closeModal }, t("help.ok"))),
    ));
  }

  function exportRoom(): void {
    if (!app) return;
    const blob = new Blob([JSON.stringify(app.model.state, null, 1)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "my-room.json" });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importRoom(): void {
    const input = h("input", { type: "file", accept: "application/json" });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file || !app) return;
      try {
        const room = parseRoom(JSON.parse(await file.text()));
        if (!room) throw new Error("bad");
        app.loadRoom(room);
        toast(t("room.imported"));
      } catch {
        toast(t("room.importBad"), "warn");
      }
    });
    input.click();
  }

  function refresh(): void {
    if (app?.editor.mode === "view" && drawer) {
      drawer = null;
      reopen = null;
      renderDrawer();
    }
    renderRoomCard();
    renderBottom();
    renderInspector();
    renderBanner();
    if (drawer === "storage" || drawer === "room" || (drawer === "catalog" && (tab === "wallpaper" || tab === "flooring"))) renderDrawer();
    if (app && !app.editor.placing && reopen) {
      drawer = reopen;
      reopen = null;
      renderDrawer();
      renderBottom();
    }
  }

  window.addEventListener("pointerdown", (e) => {
    const t = e.target as Node;
    if (!settings.contains(t) && !settingsBtn.contains(t)) settings.classList.remove("open");
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyL" && !(e.metaKey || e.ctrlKey)) cycleLight();
    if (e.code === "KeyM" && !(e.metaKey || e.ctrlKey) && !modalBack.classList.contains("open") && app?.editor.mode !== "decorate") openMap();
    if (e.code === "Escape") {
      if (modalBack.classList.contains("open")) closeModal();
      else if (drawer && !app?.editor.placing) toggleDrawer(null);
      settings.classList.remove("open");
    }
  });

  // A new language: redraw every label and whatever is open.
  onLocaleChange(() => {
    for (const f of relabels) f();
    closeModal();
    renderLanguages();
    renderTop();
    refresh();
    renderDrawer();
    showTag(tagUid);
  });

  let lastMode = "view";
  const events: EditorEvents = {
    changed: () => {
      if (app && app.editor.mode !== lastMode) {
        lastMode = app.editor.mode;
        if (lastMode === "view") world?.settle();
      }
      refresh();
    },
    notice,
    // The app saves on every change of the model.
    save: () => {},
    hover: (uid) => { if (uid !== tagUid) showTag(uid); },
    floor: (x, z) => world?.walkTo(x, z),
  };

  const worldEvents: WorldEvents = {
    place: () => refresh(),
    door: () => refresh(),
  };

  return {
    events,
    worldEvents,
    attach(a, w) {
      app = a;
      world = w;
      renderLanguages();
      renderTop();
      refresh();
      setTimeout(() => loading.classList.add("done"), 300);
    },
  };
}
