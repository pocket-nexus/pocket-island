// Small rounded icons, drawn with thick strokes in the interface's brown.

const INK = "#6b563c";
const S = (d: string, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const ICONS = {
  leaf: `<svg viewBox="0 0 24 24"><path d="M12 2.5C6.8 7 4.6 11.6 5.4 16.3 6 19.6 8.8 21.5 12 21.5s6-1.9 6.6-5.2C19.4 11.6 17.2 7 12 2.5z" fill="#67c27a"/><path d="M12 7v13" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  "leaf-white": `<svg viewBox="0 0 24 24"><path d="M12 2.5C6.8 7 4.6 11.6 5.4 16.3 6 19.6 8.8 21.5 12 21.5s6-1.9 6.6-5.2C19.4 11.6 17.2 7 12 2.5z" fill="#fff"/><path d="M12 7v13" stroke="#67c27a" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  hammer: S('<path d="M14.5 4.5l5 5-2.5 2.5-5-5z" fill="#f8cd4a"/><path d="M12 7l-8.5 8.5a1.8 1.8 0 002.5 2.5L14.5 9.5"/>'),
  bulb: S('<path d="M9 17h6M10 20.5h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z" fill="#f8cd4a"/>'),
  "bulb-off": S('<path d="M9 17h6M10 20.5h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>'),
  sun: S('<circle cx="12" cy="12" r="4.2" fill="#f8cd4a"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  sunset: S('<path d="M7.5 15a4.5 4.5 0 019 0" fill="#f6a26b"/><path d="M3 15h18M6 19h12M12 4v3M5 8.5l1.6 1.4M19 8.5l-1.6 1.4"/>'),
  moon: S('<path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" fill="#ffe08a"/>'),
  sparkle: S('<path d="M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5-5.5-2L10 8.5z" fill="#f8cd4a"/><path d="M19 17v4M17 19h4"/>'),
  help: S('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 015 .8c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.3" r=".6" fill="' + INK + '"/>'),
  undo: S('<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 010 10H12"/>'),
  redo: S('<path d="M15 7l4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 000 10H12"/>'),
  book: S('<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z" fill="#9fd6c0"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5A1 1 0 014 20.5zM9 7.5h7"/>'),
  box: S('<path d="M3.5 8l8.5-4.5L20.5 8v9L12 21.5 3.5 17z" fill="#e8c48e"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5v9"/>'),
  house: S('<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5" fill="#f6a8bb"/><path d="M10 20v-5h4v5"/>'),
  close: S('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  "check-white": `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  rotate: S('<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.5 4v4.5H15"/>'),
  alert: S('<path d="M12 3.5l9 16H3z" fill="#ffd2c6"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".5" fill="' + INK + '"/>'),
  hand: S('<path d="M8 13V6.5a1.5 1.5 0 013 0V12M11 11.5V5a1.5 1.5 0 013 0v6.5M14 11.5V6.5a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L3.7 13.6a1.5 1.5 0 012.5-1.6L8 14" fill="#fff3d6"/>'),
  download: S('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  upload: S('<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>'),
  phone: S('<rect x="6" y="2.5" width="12" height="19" rx="3" fill="#ffe0d6"/><path d="M10 5h4"/><circle cx="12" cy="18" r=".9" fill="' + INK + '"/>'),
  back: S('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  rewind: S('<path d="M11.5 6l-6 6 6 6M18.5 6l-6 6 6 6"/>'),
  forward: S('<path d="M12.5 6l6 6-6 6M5.5 6l6 6-6 6"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5" fill="#fff4d6"/><path d="M12 7.5V12l3 2"/>'),
  map: S('<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z" fill="#bfe6a8"/><path d="M9 4v13.5M15 6.5V20"/>'),
  door: S('<path d="M6 21V4.5A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5V21" fill="#e8c48e"/><path d="M3.5 21h17"/><circle cx="14.5" cy="12.5" r=".9" fill="' + INK + '"/>'),
  "door-white": `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4.5A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5V21M3.5 21h17"/><circle cx="14.5" cy="12.5" r="1" fill="#fff"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Every icon, for the 3DS export, which draws each as a picture. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function icon(name: IconName, cls = "icon"): string {
  return ICONS[name].replace("<svg ", `<svg class="${cls}" `);
}
