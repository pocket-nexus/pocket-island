/* `globalThis.islandCore` (core_js.c). */
#ifndef ISLAND_CORE_JS_H
#define ISLAND_CORE_JS_H

#include <quickjs.h>

void core_install(JSContext *ctx, JSValueConst global);

#endif
