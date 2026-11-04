// The look of the browser's interface (src/ui/style.css): warm paper, brown
// ink, leaf green for what is on, sun yellow for what is chosen, and a darker
// lip under everything that can be pressed.
export const PAPER = "#fffbee";
export const CREAM = "#f8f1dc";
export const CREAM_2 = "#f1e6c8";
export const LINE = "#e6d8b4";
export const LIP = "#d9c79c";
export const INK = "#6b563c";
export const INK_SOFT = "#a08c6c";
export const LEAF = "#67c27a";
export const LEAF_DARK = "#3f9c57";
export const SUN = "#f8cd4a";
export const SUN_DARK = "#d9a826";
export const SKY = "#73c4ec";
export const CORAL = "#f2806b";
export const ROSE = "#f6a8bb";
export const SHADE = "#3a2a1a59";
/** The table the phone lies on (phone.tsx): outdoors the renderer clears the touch screen to it. */
export const TABLE = "#a9dccf";

/** A colour as the renderer takes it, 0xrrggbb. */
export const rgb = (c: string) => parseInt(c.slice(1, 7), 16);

/** "#rrggbb" with an alpha in 0…1. */
export function tint(color: string, alpha: number): string {
  return color.slice(0, 7) + Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
}
