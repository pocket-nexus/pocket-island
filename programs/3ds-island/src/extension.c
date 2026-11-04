/* PocketJS's product extension interface (include/pocket_extension.h),
 * answered by Pocket Island's room renderer.
 *
 * The interface (apps/island-3ds) owns the room: its rules, its history and
 * every pixel of 2D. It hands this program what to draw through
 * `globalThis.island`, and this program draws the room on the upper screen
 * under the interface's HUD and, on the touch screen, the plan under its
 * lists:
 *
 *   island.info()                          the pack: ok, error, catalogue hash, counts
 *   island.room(w, d, paper, floor, items) the room; items: Float32Array, 10 numbers each (scene.h)
 *   island.marks(marks)                    footprints and the cursor: Float32Array, 10 each
 *   island.light(mode, time)               the ceiling light and the time of day
 *   island.camera(yaw, pitch, zoom, reset) turn, tilt and zoom the upper screen's view
 *   island.plan(mode, x0, y0, scale, layers, paper)   the touch screen's plan
 *   island.options(halos, shadows)
 *   island.fonts(lang)                     the glyphs for a language, from romfs:/extension/fonts-<lang>.bin
 *   island.save(name, text), island.load(name)   what is kept between runs, on the SD card
 *   island.stats()                         frames, draws, triangles, memory
 *   island.tune(fill, env, key, front, lamp, cap)   the light's balance, for tuning on the console
 *   island.place(where)                    0 the room, 1 the island outdoors
 *   island.player(pose)                    the player: Float32Array of PLAYER_FIELDS numbers (scene.h)
 *   island.follow(x, y, z, snap)           outdoors, the point the camera follows */
#include "pocket_extension.h"

#include <3ds.h>
#include <pocket_core.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#include "pack.h"
#include "scene.h"

#define PACK_PATH "romfs:/extension/island.pack"
#define FONT_DIR "romfs:/extension"
#define SAVE_DIR "sdmc:/3ds/pocket-island"

static bool enabled, ready;
static Pack pack;
static char error[160];
static char font_wanted[8], font_loaded[8];
static uint64_t last_tick;

size_t pocket_extension_command_buffer_bytes(void) { return 0x100000; }
const char *pocket_extension_link_feature(void) { return "island"; }

bool pocket_extension_init(void) {
  mkdir("sdmc:/3ds", 0777);
  mkdir(SAVE_DIR, 0777);
  if (!pack_open(PACK_PATH, &pack, error, sizeof error)) memset(&pack, 0, sizeof pack);
  ready = scene_init(&pack);
  if (!ready && !error[0]) snprintf(error, sizeof error, "the room's shaders did not load");
  last_tick = svcGetSystemTick();
  return true;
}

void pocket_extension_shutdown(void) {
  if (ready) scene_shutdown();
  pack_close();
}

void pocket_extension_set_enabled(bool on) { enabled = on; }
bool pocket_extension_enabled(void) { return enabled; }
bool pocket_extension_quit_requested(void) { return false; }

/* ---------------------------------------------------------------- fonts */

/* fonts-<lang>.bin: a count, then each atlas's length and bytes (tools/fonts.ts). */
static void load_fonts(const char *lang) {
  char path[64];
  snprintf(path, sizeof path, FONT_DIR "/fonts-%s.bin", lang);
  FILE *f = fopen(path, "rb");
  if (!f) return;
  uint32_t count = 0;
  if (fread(&count, 4, 1, f) == 1 && count < 64) {
    for (uint32_t i = 0; i < count; i++) {
      uint32_t length = 0;
      if (fread(&length, 4, 1, f) != 1 || length > 4 * 1024 * 1024) break;
      uint8_t *bytes = malloc(length);
      if (!bytes) break;
      if (fread(bytes, 1, length, f) == length) ui_load_font_atlas(bytes, length);
      free(bytes);
    }
  }
  fclose(f);
  snprintf(font_loaded, sizeof font_loaded, "%s", lang);
}

/* ---------------------------------------------------------------- the frame */

int32_t pocket_extension_tick(int32_t buttons, int32_t analog, int32_t right_analog) {
  (void)analog;
  (void)right_analog;
  /* 3D with the slider up; with it down one picture is drawn and shown (Pocket Studio does the same). */
  bool stereo = osGet3DSliderState() > 0.01f;
  if (stereo != gfxIs3D()) gfxSet3D(stereo);
  /* The glyphs change between two turns of the guest, never inside one. */
  if (font_wanted[0] && strcmp(font_wanted, font_loaded) != 0) load_fonts(font_wanted);
  uint64_t now = svcGetSystemTick();
  float dt = (float)(now - last_tick) / SYSCLOCK_ARM11;
  last_tick = now;
  if (ready) scene_step(dt > 0.1f ? 0.1f : dt);
  return buttons;
}

void pocket_extension_frame_begin(void) {}

void pocket_extension_render(C3D_RenderTarget *target, C3D_RenderTarget *right) {
  if (ready) scene_render_top(target, right);
  else C3D_RenderTargetClear(target, C3D_CLEAR_ALL, 0x211812ff, 0);
}

bool pocket_extension_shows_primary(void) { return true; }

bool pocket_extension_render_auxiliary(C3D_RenderTarget *target) { return ready && scene_render_plan(target); }

void pocket_extension_after_frame(void) {}

bool pocket_extension_link_ctrl(const char *json, size_t length) {
  (void)json;
  (void)length;
  return false;
}

void pocket_extension_trace(const char *step) { (void)step; }
void pocket_extension_script_tick(void) {}

/* ---------------------------------------------------------------- globalThis.island */

static double number(JSContext *ctx, JSValueConst v) {
  double d = 0;
  if (JS_ToFloat64(ctx, &d, v) < 0) return 0;
  return d;
}

static double arg(JSContext *ctx, int argc, JSValueConst *argv, int i) { return i < argc ? number(ctx, argv[i]) : 0; }

/* A Float32Array's numbers, valid for the call. */
static const float *floats(JSContext *ctx, JSValueConst v, uint32_t *count) {
  size_t offset = 0, length = 0, per = 0;
  *count = 0;
  JSValue buffer = JS_GetTypedArrayBuffer(ctx, v, &offset, &length, &per);
  if (JS_IsException(buffer)) {
    JS_FreeValue(ctx, JS_GetException(ctx));
    return NULL;
  }
  size_t size = 0;
  uint8_t *data = JS_GetArrayBuffer(ctx, &size, buffer);
  JS_FreeValue(ctx, buffer);
  if (!data || per != 4 || offset + length > size) return NULL;
  *count = (uint32_t)(length / 4);
  return (const float *)(data + offset);
}

static JSValue js_info(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val, (void)argc, (void)argv;
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "ok", JS_NewBool(ctx, ready && pack.item_count > 0));
  JS_SetPropertyStr(ctx, o, "error", JS_NewString(ctx, error));
  JS_SetPropertyStr(ctx, o, "catalogue", JS_NewUint32(ctx, pack.catalogue));
  JS_SetPropertyStr(ctx, o, "items", JS_NewUint32(ctx, pack.item_count));
  JS_SetPropertyStr(ctx, o, "finishes", JS_NewUint32(ctx, pack.finish_count));
  bool new3ds = false;
  APT_CheckNew3DS(&new3ds);
  JS_SetPropertyStr(ctx, o, "new3ds", JS_NewBool(ctx, new3ds));
  return o;
}

static JSValue js_room(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 5 || !ready) return JS_UNDEFINED;
  uint32_t count = 0;
  const float *list = floats(ctx, argv[4], &count);
  scene_room((uint32_t)arg(ctx, argc, argv, 0), (uint32_t)arg(ctx, argc, argv, 1), (int32_t)arg(ctx, argc, argv, 2), (int32_t)arg(ctx, argc, argv, 3), list, list ? count / ITEM_FIELDS : 0);
  return JS_UNDEFINED;
}

static JSValue js_marks(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 1 || !ready) return JS_UNDEFINED;
  uint32_t count = 0;
  const float *list = floats(ctx, argv[0], &count);
  scene_marks(list, list ? count / MARK_FIELDS : 0);
  return JS_UNDEFINED;
}

static JSValue js_light(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (ready) scene_light((uint32_t)arg(ctx, argc, argv, 0), (uint32_t)arg(ctx, argc, argv, 1));
  return JS_UNDEFINED;
}

static JSValue js_camera(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (ready) scene_camera((float)arg(ctx, argc, argv, 0), (float)arg(ctx, argc, argv, 1), (float)arg(ctx, argc, argv, 2), arg(ctx, argc, argv, 3) != 0);
  return JS_UNDEFINED;
}

static JSValue js_plan(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (ready)
    scene_plan((uint32_t)arg(ctx, argc, argv, 0), (float)arg(ctx, argc, argv, 1), (float)arg(ctx, argc, argv, 2), (float)arg(ctx, argc, argv, 3), (uint32_t)arg(ctx, argc, argv, 4),
               (uint32_t)arg(ctx, argc, argv, 5));
  return JS_UNDEFINED;
}

static JSValue js_options(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (ready) scene_options(arg(ctx, argc, argv, 0) != 0, arg(ctx, argc, argv, 1) != 0);
  return JS_UNDEFINED;
}

static JSValue js_place(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (ready) scene_place((uint32_t)arg(ctx, argc, argv, 0));
  return JS_UNDEFINED;
}

static JSValue js_player(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 1 || !ready) return JS_UNDEFINED;
  uint32_t count = 0;
  const float *pose = floats(ctx, argv[0], &count);
  if (pose) scene_player(pose, count);
  return JS_UNDEFINED;
}

static JSValue js_follow(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (ready) scene_follow((float)arg(ctx, argc, argv, 0), (float)arg(ctx, argc, argv, 1), (float)arg(ctx, argc, argv, 2), arg(ctx, argc, argv, 3) != 0);
  return JS_UNDEFINED;
}

static JSValue js_tune(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  float values[6];
  int n = argc < 6 ? argc : 6;
  for (int i = 0; i < n; i++) values[i] = (float)number(ctx, argv[i]);
  if (ready) scene_tune(values, (uint32_t)n);
  return JS_UNDEFINED;
}

static JSValue js_fonts(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 1) return JS_FALSE;
  const char *lang = JS_ToCString(ctx, argv[0]);
  if (!lang) return JS_FALSE;
  bool known = strlen(lang) < sizeof font_wanted;
  if (known) snprintf(font_wanted, sizeof font_wanted, "%s", lang);
  JS_FreeCString(ctx, lang);
  return JS_NewBool(ctx, known);
}

/* A name of letters, digits and dashes, so it cannot leave the directory. */
static bool save_path(JSContext *ctx, JSValueConst value, char *out, size_t capacity) {
  const char *name = JS_ToCString(ctx, value);
  if (!name) return false;
  bool ok = name[0] && strlen(name) < 32;
  for (const char *c = name; ok && *c; c++) ok = (*c >= 'a' && *c <= 'z') || (*c >= '0' && *c <= '9') || *c == '-';
  if (ok) snprintf(out, capacity, SAVE_DIR "/%s.json", name);
  JS_FreeCString(ctx, name);
  return ok;
}

static JSValue js_save(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  char path[80], temp[84];
  if (argc < 2 || !save_path(ctx, argv[0], path, sizeof path)) return JS_FALSE;
  size_t length = 0;
  const char *text = JS_ToCStringLen(ctx, &length, argv[1]);
  if (!text) return JS_FALSE;
  /* Written beside, then put in place: a power cut leaves the old file or the new one. */
  snprintf(temp, sizeof temp, "%s.new", path);
  FILE *f = fopen(temp, "wb");
  bool ok = f && fwrite(text, 1, length, f) == length;
  if (f) ok = fclose(f) == 0 && ok;
  JS_FreeCString(ctx, text);
  if (ok) {
    remove(path);
    ok = rename(temp, path) == 0;
  }
  return JS_NewBool(ctx, ok);
}

static JSValue js_load(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  char path[80];
  if (argc < 1 || !save_path(ctx, argv[0], path, sizeof path)) return JS_NULL;
  FILE *f = fopen(path, "rb");
  if (!f) {
    /* A save cut short before the rename leaves only the new file. */
    char temp[84];
    snprintf(temp, sizeof temp, "%s.new", path);
    f = fopen(temp, "rb");
  }
  if (!f) return JS_NULL;
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  rewind(f);
  JSValue out = JS_NULL;
  if (size >= 0 && size < 512 * 1024) {
    char *text = malloc((size_t)size + 1);
    if (text && fread(text, 1, (size_t)size, f) == (size_t)size) out = JS_NewStringLen(ctx, text, (size_t)size);
    free(text);
  }
  fclose(f);
  return out;
}

static JSValue js_stats(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val, (void)argc, (void)argv;
  SceneStats s = ready ? scene_stats() : (SceneStats){0};
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "fps", JS_NewFloat64(ctx, s.fps));
  JS_SetPropertyStr(ctx, o, "frameMs", JS_NewFloat64(ctx, s.frame_ms));
  JS_SetPropertyStr(ctx, o, "gpuMs", JS_NewFloat64(ctx, s.gpu_ms));
  JS_SetPropertyStr(ctx, o, "draws", JS_NewUint32(ctx, s.draws));
  JS_SetPropertyStr(ctx, o, "triangles", JS_NewUint32(ctx, s.triangles));
  JS_SetPropertyStr(ctx, o, "lamps", JS_NewUint32(ctx, s.lamps));
  JS_SetPropertyStr(ctx, o, "residentKB", JS_NewUint32(ctx, pack_resident() / 1024));
  JS_SetPropertyStr(ctx, o, "linearFreeKB", JS_NewUint32(ctx, (uint32_t)(linearSpaceFree() / 1024)));
  JS_SetPropertyStr(ctx, o, "font", JS_NewString(ctx, font_loaded));
  JS_SetPropertyStr(ctx, o, "planRenders", JS_NewUint32(ctx, s.plan_renders));
  JS_SetPropertyStr(ctx, o, "stereo", JS_NewBool(ctx, s.stereo));
  JS_SetPropertyStr(ctx, o, "instances", JS_NewUint32(ctx, s.instances));
  JS_SetPropertyStr(ctx, o, "renderMs", JS_NewFloat64(ctx, s.render_ms));
  return o;
}

void pocket_extension_install(JSContext *ctx, JSValueConst global) {
  /* A guest starts with its bundle's own glyphs (a push restarts it): its language loads again. */
  font_wanted[0] = font_loaded[0] = '\0';
  JSValue o = JS_NewObject(ctx);
#define ADD(name, fn, length) JS_SetPropertyStr(ctx, o, name, JS_NewCFunction(ctx, fn, name, length))
  ADD("info", js_info, 0);
  ADD("room", js_room, 5);
  ADD("marks", js_marks, 1);
  ADD("light", js_light, 2);
  ADD("camera", js_camera, 4);
  ADD("plan", js_plan, 6);
  ADD("options", js_options, 2);
  ADD("fonts", js_fonts, 1);
  ADD("tune", js_tune, 6);
  ADD("save", js_save, 2);
  ADD("load", js_load, 1);
  ADD("stats", js_stats, 0);
  ADD("place", js_place, 1);
  ADD("player", js_player, 1);
  ADD("follow", js_follow, 4);
#undef ADD
  JS_SetPropertyStr(ctx, global, "island", o);
}
