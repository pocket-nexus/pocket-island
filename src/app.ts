// Wires the room together: the model and its saved copy, the stage, the
// shell, the items, the overlay and the editor.

import { RoomModel, parseRoom } from "./core/model.ts";
import { resize } from "./core/rules.ts";
import type { RoomState } from "./core/types.ts";
import { catalog } from "./furniture/catalog.ts";
import { finishById } from "./furniture/finishes.ts";
import { Editor, type EditorEvents } from "./editor.ts";
import { defaultRoom } from "./presets.ts";
import { showroom } from "./showroom.ts";
import { SERIES, type SeriesId } from "./furniture/types.ts";
import { Overlay } from "./scene/overlay.ts";
import { Shell } from "./scene/shell.ts";
import { Stage } from "./scene/stage.ts";
import { RoomView, beamMaterial, hullMaterial } from "./scene/view.ts";
import type { CeilingMode, TimeOfDay } from "./scene/lighting.ts";

const SAVE_KEY = "acnh-room/v1";

export function loadSaved(): RoomState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? parseRoom(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function save(state: RoomState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; the room still works */
  }
}

export class App {
  readonly stage: Stage;
  readonly shell = new Shell();
  readonly view = new RoomView();
  readonly overlay = new Overlay();
  readonly model: RoomModel;
  readonly editor: Editor;
  private size = "";
  /** A showroom is not the visitor's room: it is never saved over it. Its name while one is shown. */
  /** The series whose showroom is open, if one is: not saved. */
  showroom: SeriesId | "all" | null = null;
  private finishes = "";
  /** Whether the room is on the stage (the player is in the house). */
  indoors = true;
  private light: { mode: CeilingMode; time: TimeOfDay } = { mode: "warm", time: "day" };

  constructor(canvas: HTMLCanvasElement, events: EditorEvents, initial?: RoomState) {
    this.stage = new Stage(canvas);
    this.stage.scene.add(this.shell.group, this.view.items);
    this.stage.overlay.add(this.overlay.group);
    const params = new URLSearchParams(location.search);
    const fresh = params.has("fresh");
    // ?showroom=<series>[&variant=n] sets out a whole series, for checking the catalogue.
    const show = params.get("showroom") as SeriesId | "all" | null;
    this.showroom = show && (show === "all" || show in SERIES) ? show : null;
    const start = this.showroom ? showroom(this.showroom, Number(params.get("variant") ?? 0)) : null;
    this.model = new RoomModel(initial ?? start ?? ((!fresh && loadSaved()) || defaultRoom()));
    this.editor = new Editor(this.stage, this.view, this.overlay, this.model, events);
    this.model.subscribe((next) => {
      this.applyRoom(next);
      if (!this.showroom) save(next);
    });
    this.applyRoom(this.model.state, true);
    this.stage.onFrame((dt, now) => {
      const moved = this.view.frame(dt);
      if (moved) {
        this.stage.invalidateShadows();
        this.stage.refreshAO();
      }
      if (!this.indoors) return;
      this.stage.lighting.setLamps(this.view.lamps());
      this.overlay.frame(now);
      hullMaterial.uniforms.time.value = now / 1000;
      this.editor.frame();
    });
  }

  private applyRoom(state: RoomState, instant = false): void {
    const size = `${state.w}x${state.d}`;
    if (size !== this.size) {
      this.size = size;
      this.shell.build(state.w, state.d);
      this.stage.lighting.fit(state.w, state.d);
      this.stage.rig.setRoom(state.w, state.d);
      this.overlay.fit(state.w, state.d);
    }
    const finishes = `${state.wallpaper}|${state.flooring}`;
    if (finishes !== this.finishes) {
      this.finishes = finishes;
      const wp = finishById.get(state.wallpaper) ?? finishById.get("cream-wainscot")!;
      const fl = finishById.get(state.flooring) ?? finishById.get("oak-planks")!;
      this.shell.setWallpaper(wp);
      this.shell.setFlooring(fl);
    }
    if (instant) this.view.sync(state, true);
    this.stage.invalidateShadows();
    this.stage.refreshAO();
  }

  setWallpaper(id: string): void {
    if (id === this.model.state.wallpaper) return;
    this.model.commit({ ...this.model.state, wallpaper: id });
  }

  setFlooring(id: string): void {
    if (id === this.model.state.flooring) return;
    this.model.commit({ ...this.model.state, flooring: id });
  }

  setSize(w: number, d: number): number {
    const before = this.model.state.items.length;
    const next = resize(this.model.state, catalog, w, d);
    this.model.commit(next);
    return before - next.items.length;
  }

  /** Replace the room. A showroom passes its name and is never saved. */
  loadRoom(state: RoomState, showroom: SeriesId | "all" | null = null): void {
    this.showroom = showroom;
    this.editor.cancel();
    this.editor.selection.clear();
    this.model.commit(state);
  }

  /** Put the room on the stage, or take it off for the island. */
  setIndoors(on: boolean): void {
    this.indoors = on;
    this.shell.group.visible = on;
    this.view.items.visible = on;
    this.overlay.group.visible = on;
    this.editor.enabled = on;
    if (on) {
      this.editor.setMode("view");
      this.stage.rig.setFollow(null);
      this.stage.rig.setView("view");
      this.stage.rig.setRoom(this.model.state.w, this.model.state.d);
      this.stage.lighting.fit(this.model.state.w, this.model.state.d);
      this.setLight(this.light.mode, this.light.time);
    } else {
      this.editor.cancel();
      this.editor.selection.clear();
      this.stage.rig.setView("outdoors");
    }
    this.stage.setFocus(false);
    this.stage.invalidateShadows();
    this.stage.refreshAO();
  }

  setLight(mode: CeilingMode, time: TimeOfDay): void {
    this.light = { mode, time };
    if (!this.indoors) return;
    this.stage.lighting.apply(mode, time);
    this.stage.setQuality({});
    this.view.haloStrength = this.stage.lighting.haloStrength;
    beamMaterial.color.set(this.stage.lighting.beam.color);
    beamMaterial.opacity = this.stage.lighting.beam.strength;
    beamMaterial.visible = this.stage.lighting.beam.strength > 0;
    this.view.sync(this.model.state);
    this.stage.refreshAO();
  }
}
