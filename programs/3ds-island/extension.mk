# Pocket Island as PocketJS's 3DS product extension (products/3ds/Makefile
# includes this): the room renderer, its pack reader and its two shaders.
OBJECTS += $(BUILD)/extension.o $(BUILD)/scene.o $(BUILD)/pack.o $(BUILD)/room_shbin.o $(BUILD)/flat_shbin.o
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
