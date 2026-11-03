// bun scripts/e2e.ts [url]
//
// Drives the room in headless Chrome with real pointer and key events and
// checks the island's decorating rules end to end. Prints one line per check
// and exits non-zero when any fails.
import { openPage, type Page } from "./chrome.ts";

const base = process.argv[2] ?? "http://127.0.0.1:5317/";
const page = await openPage(base + "?fresh", 1600, 1000);
const results: Array<[boolean, string]> = [];
const check = (ok: boolean, label: string) => {
  results.push([ok, label]);
  console.log(`${ok ? "✓" : "✗"} ${label}`);
};

type XY = [number, number];
const ev = <T>(expr: string) => page.evaluate<T>(expr);
const sleep = (ms: number) => Bun.sleep(ms);
const uidOf = (item: string) => ev<string>(`app.model.state.items.find(p => p.item === ${JSON.stringify(item)})?.uid`);
const placement = (uid: string) => ev<any>(`app.model.state.items.find(p => p.uid === ${JSON.stringify(uid)})`);
const screen = (x: number, y: number, z: number) => ev<XY>(`__screen(${x}, ${y}, ${z})`);
const screenOf = (uid: string, lift = 0) => ev<XY>(`__screenOf(${JSON.stringify(uid)}, ${lift})`);
/** What the last toast was about: a problem's reason, or "cant-rotate", "stored" and so on. */
const lastToast = () => ev<string>(`[...document.querySelectorAll('.toast')].at(-1)?.dataset.key ?? ''`);
const OVERLAPS = ["overlap", "wall-overlap", "surface-overlap", "rug-overlap"];

async function move(p: Page, from: XY, to: XY, held: boolean) {
  for (let i = 1; i <= 12; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / 12, y = from[1] + ((to[1] - from[1]) * i) / 12;
    await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: held ? "left" : "none", buttons: held ? 1 : 0 });
    await sleep(16);
  }
}
async function drag(from: XY, to: XY, modifiers = 0) {
  await page.mouse("mouseMoved", from[0], from[1]);
  await page.mouse("mousePressed", from[0], from[1], "left", modifiers);
  await move(page, from, to, true);
  await sleep(120);
  await page.mouse("mouseReleased", to[0], to[1], "left", modifiers);
  await sleep(450);
}
async function click(at: XY, modifiers = 0) {
  await page.mouse("mouseMoved", at[0], at[1]);
  await page.mouse("mousePressed", at[0], at[1], "left", modifiers);
  await sleep(40);
  await page.mouse("mouseReleased", at[0], at[1], "left", modifiers);
  await sleep(350);
}
async function placeAt(item: string, variant: number, at: XY) {
  await ev(`app.editor.beginPlacing(__def(${JSON.stringify(item)}), ${variant})`);
  await sleep(150);
  await move(page, [800, 500], at, false);
  await sleep(250);
  await click(at);
}
const count = () => ev<number>("app.model.state.items.length");

try {
  await page.ready();
  await sleep(1200);
  await ev("localStorage.clear()");

  // Light: every lamp has something that glows, and only glowing things bloom.
  // The default room's floor lamp stands half a tile from the right wall; at
  // night with the ceiling light on, the wall above it must stay a warm
  // cream, not a blown-out white, and must not feed the bloom.
  const glowless = await ev<string[]>("__glowless()");
  check(glowless.length === 0, `every lamp has a part that glows${glowless.length ? ` (missing: ${glowless.join(", ")})` : ""}`);
  await ev("app.setLight('warm', 'night')");
  await sleep(800);
  const wall = await ev<{ rgb: number[]; bloom: number }>(`(() => {
    const s = app.stage, st = app.model.state;
    const lamp = st.items.find(p => p.item === 'floor-lamp');
    const at = __screen(st.w - 0.02, 2.0, lamp.z);
    s.frame(16);
    const k = s.renderer.getPixelRatio(), r = s.canvas.getBoundingClientRect();
    const px = Math.round((at[0] - r.left) * k), py = Math.round(s.canvas.height - (at[1] - r.top) * k);
    const gl = s.renderer.getContext(), rgb = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgb);
    const h = new Uint16Array(4);
    s.renderer.readRenderTargetPixels(s.bloom.renderTargetMasked, px, py, 1, 1, h);
    return { rgb: [rgb[0], rgb[1], rgb[2]], bloom: h[0] + h[1] + h[2] };
  })()`);
  const [wr, wg, wb] = wall.rgb as [number, number, number];
  check(wall.bloom === 0 && wr - wb > 25 && Math.min(wr, wg, wb) < 235, `warm light at night: the wall by the floor lamp is not blown out and does not bloom (rgb ${wall.rgb.join(",")})`);
  await ev("app.setLight('warm', 'day')");
  await sleep(300);

  await page.key("KeyE");
  await sleep(1400);
  check((await ev<string>("app.editor.mode")) === "decorate", "E starts decorating");

  // Carry a stool to a free tile; it lands on the grid.
  const stool = await uidOf("wooden-stool");
  await drag(await screenOf(stool), await screen(4.5, 0, 5.5));
  let p = await placement(stool);
  check(p.x === 4.5 && p.z === 5.5, `drag the stool to open floor: it snaps to the grid (${p.x}, ${p.z})`);

  // Onto the teddy: it does not fit and goes back.
  const teddy = await uidOf("teddy-bear");
  await drag(await screenOf(stool), await screen(3.5, 0, 3.5));
  p = await placement(stool);
  check(p.x === 4.5 && p.z === 5.5 && OVERLAPS.includes(await lastToast()), "drop it on the teddy bear: told it overlaps, and it goes back");

  // Half tiles: a 1×1 item can stop half a tile over.
  await click(await screenOf(stool));
  await page.key("ArrowLeft");
  await sleep(300);
  p = await placement(stool);
  check(p.x === 4 && p.z === 5.5, `an arrow key nudges half a tile → (${p.x}, ${p.z})`);
  await page.key("ArrowRight");
  await sleep(300);

  // Turning: the wardrobe has no room to turn, the chair does.
  const wardrobe = await uidOf("wooden-wardrobe");
  await click(await screenOf(wardrobe, 1));
  await page.key("KeyR");
  await sleep(300);
  check((await placement(wardrobe)).rot === 0 && (await lastToast()) === "cant-rotate", "the wardrobe against the wall has no room to turn: refused, with a message");
  const chair = await uidOf("wooden-chair");
  const chairRot = (await placement(chair)).rot;
  await click(await screenOf(chair, 0.5));
  await page.key("KeyR");
  await sleep(300);
  check((await placement(chair)).rot === (chairRot + 1) % 4, "the chair turns 90° clockwise");

  // Put away, then back from storage through the drawer.
  await click(await screenOf(teddy, 0.2));
  await page.key("KeyX");
  await sleep(500);
  check(!(await placement(teddy)) && (await ev<number>("app.model.state.storage.length")) === 1, "X puts the teddy bear into storage");
  await ev(`document.querySelector('[data-drawer="storage"]').click()`);
  await sleep(500);
  const card = await ev<XY>(`(() => { const r = document.querySelector('.drawer .card').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 3]; })()`);
  await click(card);
  const spot = await screen(4.5, 0, 4.5);
  await move(page, card, spot, false);
  await sleep(250);
  await click(spot);
  const back = await ev<any>("app.model.state.items.find(p => p.item === 'teddy-bear')");
  if (!back || back.x !== 4.5) console.log("  teddy:", JSON.stringify(back), "storage:", await ev("app.model.state.storage.length"), "placing:", await ev("!!app.editor.placing"), "toast:", await lastToast());
  check((await ev<number>("app.model.state.storage.length")) === 0 && (await ev<boolean>(`app.model.state.items.some(p => p.item === 'teddy-bear' && p.x === 4.5 && p.z === 4.5)`)), "the teddy bear comes back out of storage onto the floor");

  // A table top takes a small thing, which then moves with the table.
  const desk = await uidOf("wooden-desk");
  const succulent = await uidOf("succulent");
  await page.key("Escape");
  await click(await screenOf(succulent, 0.1));
  await page.key("KeyX");
  await sleep(400);
  await placeAt("alarm-clock", 1, await screen(5.5, 0.8, 3.0));
  const clock = await ev<any>(`app.model.state.items.find(p => p.item === 'alarm-clock' && p.host === ${JSON.stringify(desk)})`);
  check(!!clock && clock.layer === "surface", "the alarm clock goes on the desk top (surface layer)");
  const before = await ev<number[]>(`app.editor.centre(app.model.state.items.find(p => p.uid === ${JSON.stringify(clock?.uid)}))`);
  await page.key("Escape");
  await click(await screen(5.75, 0.79, 1.75));
  const picked = await ev<string[]>("[...app.editor.selection].map(u => app.model.state.items.find(p => p.uid === u)?.item)");
  await page.key("ArrowDown");
  await sleep(400);
  if (picked.join() !== "wooden-desk") console.log("  selected:", picked.join(","));
  const after = await ev<number[]>(`app.editor.centre(app.model.state.items.find(p => p.uid === ${JSON.stringify(clock?.uid)}))`);
  check(after[1] - before[1] === 0.5, "the desk moves half a tile and the clock on it follows");
  await placeAt("book-stack", 1, await screen(5.5, 0.8, 3.0));
  check(["surface-overlap", "off-surface"].includes(await lastToast()), "the top is full: another stack of books is refused");
  await page.key("Escape");

  // Walls and the ceiling have grids of their own.
  await placeAt("wall-clock", 2, await screen(0, 1.9, 1.2));
  check(await ev<boolean>(`app.model.state.items.some(p => p.item === 'wall-clock' && p.wall === 'left')`), "the wall clock hangs on the left wall");
  await placeAt("pendant-lamp", 2, await screen(1.5, 3, 1.5));
  check(await ev<boolean>(`app.model.state.items.some(p => p.item === 'pendant-lamp' && p.layer === 'ceiling' && p.x === 1.5)`), "the pendant lamp hangs from the ceiling");
  const n0 = await count();
  await placeAt("pendant-lamp", 0, await screen(3.4, 3, 3.1));
  check((await count()) === n0 && OVERLAPS.includes(await lastToast()), "pendant lamps can't overlap on the ceiling");
  await page.key("Escape");
  await ev("app.editor.setLayer('all')");

  // Rugs: under furniture is fine, over another rug is not.
  const n1 = await count();
  await placeAt("stripe-rug", 0, await screen(4.5, 0, 1));
  check((await count()) === n1 + 1, "the striped rug can go under furniture");
  await placeAt("heart-rug", 0, await screen(2.5, 0, 3.5));
  check((await count()) === n1 + 1 && (await lastToast()) === "rug-overlap", "rugs can't overlap each other");
  await page.key("Escape");

  // The entrance stays clear.
  await placeAt("wooden-chair", 0, await screen(3, 0, 5.6));
  check((await lastToast()) === "door", "nothing can stand on the doorway tile");
  await page.key("Escape");

  // Several at once: shift-click two, carry one, both move.
  await click(await screenOf(stool, 0.3));
  await click(await screenOf(chair, 0.5), 8);
  const sel = await ev<number>("app.editor.selection.size");
  const s0 = await placement(stool), c0 = await placement(chair);
  await drag(await screenOf(stool), await screen(s0.x - 0.5, 0, s0.z));
  const s1 = await placement(stool), c1 = await placement(chair);
  check(sel === 2 && s1.x === s0.x - 0.5 && c1.x === c0.x - 0.5 && c1.z === c0.z, `⇧ selects the stool and chair; they move half a tile together (${sel})`);

  // Undo and redo.
  const n2 = await count();
  await page.key("KeyZ", 4);
  await sleep(300);
  const undone = await placement(stool);
  await page.key("KeyZ", 4 | 8);
  await sleep(300);
  check(undone.x === s0.x && (await placement(stool)).x === s1.x && (await count()) === n2, "⌘Z undoes, ⇧⌘Z redoes");

  // Shrinking the room stores what no longer fits; undo brings it back.
  const n3 = await count();
  await ev("app.setSize(4, 4)");
  await sleep(500);
  const stored = await ev<number>("app.model.state.storage.length");
  check((await ev<number>("app.model.state.w")) === 4 && stored > 0 && (await count()) + stored >= n3, `resize to 4×4: the ${stored} items that don't fit go into storage`);
  await page.key("KeyZ", 4);
  await sleep(400);
  check((await ev<number>("app.model.state.w")) === 6 && (await count()) === n3, "undoing the resize brings everything back");

  // Lamps switch in the view; the room survives a reload.
  await page.key("KeyE");
  await sleep(1200);
  // Languages: the picker in Settings relabels everything on the spot, and
  // no message key ever shows through.
  const centre = (sel: string) => ev<XY>(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
  const rawKey = /\b(app|room|light|time|settings|toolbar|mode|layer|key|hint|tag|tab|catalog|storage|sets|inspector|where|confirm|help|notice|problem)\.[a-z][A-Za-z.-]*/;
  const seen: string[] = [];
  for (const l of ["ja", "zh", "en"]) {
    await click(await centre("[data-action=settings]"));
    await click(await centre(`[data-locale=${l}]`));
    await page.key("Escape");
    await sleep(200);
    const ui = await ev<{ lang: string; title: string; decorate: string; text: string; want: [string, string] }>(`({
      lang: document.documentElement.lang, title: document.querySelector('.room-card h1').textContent,
      decorate: document.querySelector('[data-action=decorate]').textContent, text: document.getElementById('ui').innerText,
      want: [__i18n.t('app.title'), __i18n.t('mode.decorate')],
    })`);
    const ok = ui.lang.startsWith(l) && ui.title === ui.want[0] && ui.decorate === ui.want[1] && !rawKey.test(ui.text) && !seen.includes(ui.decorate);
    seen.push(ui.decorate);
    check(ok, `language ${l}: the interface reads “${ui.title}” / “${ui.decorate}”${rawKey.test(ui.text) ? ` (raw key: ${ui.text.match(rawKey)![0]})` : ""}`);
  }

  const tableLamp = await uidOf("wooden-lamp");
  await click(await screenOf(tableLamp, 0.45));
  check((await placement(tableLamp)).on === false, "clicking the table lamp outside decorating switches it off");
  const saved = JSON.stringify(await ev("app.model.state.items.map(p => [p.uid, p.x, p.z, p.rot, p.on ?? null]).sort()"));
  await page.send("Page.navigate", { url: base });
  await sleep(500);
  await page.ready();
  const reloaded = JSON.stringify(await ev("app.model.state.items.map(p => [p.uid, p.x, p.z, p.rot, p.on ?? null]).sort()"));
  check(saved === reloaded, "the layout survives a reload");
} catch (error) {
  check(false, `script error: ${(error as Error).message}`);
} finally {
  if (page.problems.length) console.log("page problems:\n  " + page.problems.join("\n  "));
  await page.close();
}
const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
