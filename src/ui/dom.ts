// Building the interface's elements: a tag with its attributes and children, an icon, text that is
// written again when the language changes, and a key that does something while it is held.

import { t, type MessageKey } from "../i18n/index.ts";
import { icon, type IconName } from "./icons.ts";

export type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
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

export const svg = (name: IconName, cls = "icon"): Element => {
  const span = h("span", { html: icon(name, cls) });
  return span.firstElementChild as Element;
};

/** Text and attributes in the language, each written again by `relabel()` when it changes. */
export function labels() {
  const relabels: Array<() => void> = [];
  return {
    /** An interface key's text. */
    label(key: MessageKey): Text {
      const node = document.createTextNode(t(key));
      relabels.push(() => { node.textContent = t(key); });
      return node;
    },
    /** `el`'s title (or `attr`): an interface key's text, or a name of the catalogue's. */
    titled<E extends HTMLElement>(el: E, key: MessageKey | (() => string), attr = "title"): E {
      const set = () => el.setAttribute(attr, typeof key === "function" ? key() : t(key));
      set();
      relabels.push(set);
      return el;
    },
    /** Anything else to write again. */
    also(f: () => void): void {
      relabels.push(f);
    },
    relabel(): void {
      for (const f of relabels) f();
    },
  };
}

/** A key that calls `hold(dir)` while it is held down and `hold(0)` when it is let go (the clock's keys). */
export function holdKey(name: string, glyph: IconName, dir: number, hold: (dir: number) => void): HTMLElement {
  const el = h("button", { class: "pill", "data-scrub": name }, svg(glyph));
  const stop = () => hold(0);
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); hold(dir); });
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointerleave", stop);
  el.addEventListener("pointercancel", stop);
  return el;
}
