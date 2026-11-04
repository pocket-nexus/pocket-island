/* The island's sound through the DSP or the sound hardware (audio.c): sounds by number, the music by piece. */
#pragma once

#include <stdbool.h>
#include <stdint.h>

/* The layout tools/sound.ts writes (its SOUND_VERSION). */
#define AUDIO_VERSION 1

/* The pack opened, its sounds loaded and the DSP or the sound hardware's channels started; false and silent without them. */
bool audio_init(const char *path);
bool audio_live(void);
/* Why it is silent, or ""; and which way it plays ("dsp", "csnd", or ""). */
const char *audio_problem(void);
const char *audio_way(void);
void audio_shutdown(void);
/* Sound `id` (src/audio/names.ts order) at `gain` (0 to 1) and `speed` (1 as made). */
void audio_sound(uint32_t id, float gain, float speed);
/* Entry `piece` (the sounds' count onward) toward `gain`, fading over three seconds; -1, none. */
void audio_music(int32_t piece, float gain);
/* The settings' loudness of the music and of the sounds, 0 to 1. */
void audio_volumes(float music, float sound);
/* The music's fades' time constants (seconds): a piece in and the last away, the first up, a change of level. */
void audio_mix(float crossfade, float first, float level);
/* Each frame: the music's fades, and its next block. */
void audio_tick(float dt);
