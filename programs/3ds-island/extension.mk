# Pocket Island as PocketJS's 3DS product extension (products/3ds/Makefile
# includes this): the renderer, its pack reader, its two shaders, and the
# island's core (crates/island-core, built by `bun tools/core.ts --3ds` into
# lib/ with its symbols weak, so the product's own Rust runtime wins).
OBJECTS += $(BUILD)/extension.o $(BUILD)/scene.o $(BUILD)/pack.o $(BUILD)/core_js.o $(BUILD)/room_shbin.o $(BUILD)/flat_shbin.o
LIBS += $(POCKETJS_EXTENSION)/lib/libpocket_island_core.a
EXTENSION_HEADERS := $(BUILD)/room_shbin.h $(BUILD)/flat_shbin.h

$(BUILD)/%.shbin: $(POCKETJS_EXTENSION)/src/%.v.pica | $(BUILD)
	$(PICASSO) -o $@ $<
$(BUILD)/room_shbin.s $(BUILD)/room_shbin.h &: $(BUILD)/room.shbin
	cd $(BUILD) && $(BIN2S) -a 4 -H room_shbin.h room.shbin > room_shbin.s
$(BUILD)/flat_shbin.s $(BUILD)/flat_shbin.h &: $(BUILD)/flat.shbin
	cd $(BUILD) && $(BIN2S) -a 4 -H flat_shbin.h flat.shbin > flat_shbin.s
$(BUILD)/room_shbin.o: $(BUILD)/room_shbin.s
	$(CC) $(ARCH) -c $< -o $@
$(BUILD)/flat_shbin.o: $(BUILD)/flat_shbin.s
	$(CC) $(ARCH) -c $< -o $@

# The program is linked again whenever the core changes: its bindings are built after it.
$(BUILD)/core_js.o: $(POCKETJS_EXTENSION)/lib/libpocket_island_core.a
