/* The island's sound on the console: the sounds and the music the browser plays, rendered by the
 * same scripts into romfs:/extension/sound.pack (tools/sound.ts), played through the DSP (NDSP).
 *
 * The sounds are loaded whole into linear memory at the start and played on six voices taken in
 * turn, each at its own loudness and speed. The music streams from the pack an IMA ADPCM block at
 * a time, decoded into three buffers queued on its channel, and comes round to its start without a
 * seam; a new piece comes in on the second music channel while the old one fades out, over three
 * seconds. Without the DSP's firmware (no /3ds/dspfirm.cdc and no Homebrew Launcher handle) it is
 * silent and says so (island.info().sound).
 *
 * Channel 0 is PocketJS's media; the island takes 8 and 9 for music and 10 to 15 for sounds. */
#include "audio.h"

#include <3ds.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { MUSIC_CH = 8, VOICE_CH = 10, VOICES = 6, BLOCK = 2048, BLOCK_BYTES = 4 + BLOCK / 2, MUSIC_BUFS = 3 };
#define FADE_SECONDS 3.0f

typedef struct {
  uint8_t kind, loop;
  uint32_t frames, offset, bytes;
} Entry;

typedef struct {
  int32_t piece;
  float gain, target;
  uint32_t block;
  bool on;
  FILE *file;
  int16_t *pcm[MUSIC_BUFS];
  ndspWaveBuf wave[MUSIC_BUFS];
} Stream;

static bool live;
static uint32_t rate, count;
static Entry *entries;
/* The sounds' samples, all in one block of linear memory, and where each starts. */
static int16_t *sounds;
static uint32_t *sound_at;
static ndspWaveBuf voice_wave[VOICES];
static uint32_t next_voice;
static Stream streams[2];
static float music_volume = 1, sound_volume = 1;
static char path[96];
static char problem[64] = "not started";

static const int16_t STEP[89] = {7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767};
static const int8_t INDEX[16] = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};

static uint32_t read32(const uint8_t *p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }

/* One block of IMA ADPCM into `out`, BLOCK samples, from the state at its head. */
static void decode_block(const uint8_t *block, int16_t *out) {
  int32_t predictor = (int16_t)(block[0] | block[1] << 8);
  int32_t index = block[2];
  if (index > 88) index = 88;
  for (int i = 0; i < BLOCK; i++) {
    uint8_t byte = block[4 + (i >> 1)];
    uint8_t nibble = i & 1 ? byte >> 4 : byte & 15;
    int32_t step = STEP[index], delta = step >> 3;
    if (nibble & 4) delta += step;
    if (nibble & 2) delta += step >> 1;
    if (nibble & 1) delta += step >> 2;
    predictor += nibble & 8 ? -delta : delta;
    if (predictor > 32767) predictor = 32767;
    if (predictor < -32768) predictor = -32768;
    index += INDEX[nibble];
    if (index < 0) index = 0;
    if (index > 88) index = 88;
    out[i] = (int16_t)predictor;
  }
}

static void set_mix(int ch, float gain) {
  float mix[12] = {0};
  mix[0] = mix[1] = gain;
  ndspChnSetMix(ch, mix);
}

static void channel(int ch) {
  ndspChnReset(ch);
  ndspChnSetInterp(ch, NDSP_INTERP_LINEAR);
  ndspChnSetRate(ch, (float)rate);
  ndspChnSetFormat(ch, NDSP_FORMAT_MONO_PCM16);
}

bool audio_init(const char *file) {
  snprintf(path, sizeof path, "%s", file);
  FILE *f = fopen(path, "rb");
  if (!f) return snprintf(problem, sizeof problem, "no %s", path), false;
  uint8_t head[16];
  if (fread(head, 1, 16, f) != 16 || memcmp(head, "PSND", 4) != 0 || read32(head + 4) != AUDIO_VERSION) {
    fclose(f);
    return snprintf(problem, sizeof problem, "not a sound pack of version %d", AUDIO_VERSION), false;
  }
  rate = read32(head + 8);
  count = read32(head + 12);
  entries = calloc(count, sizeof *entries);
  sound_at = calloc(count, sizeof *sound_at);
  uint8_t *table = malloc(count * 16);
  if (!entries || !sound_at || !table || fread(table, 1, count * 16, f) != count * 16) {
    free(table);
    fclose(f);
    return snprintf(problem, sizeof problem, "the pack's table"), false;
  }
  uint32_t samples = 0;
  for (uint32_t k = 0; k < count; k++) {
    const uint8_t *e = table + k * 16;
    entries[k] = (Entry){e[0], e[1], read32(e + 4), read32(e + 8), read32(e + 12)};
    if (entries[k].kind == 0) sound_at[k] = samples, samples += entries[k].frames;
  }
  free(table);
  /* The sounds, whole, where the DSP reads them. */
  sounds = linearAlloc(samples * 2 + 16);
  if (!sounds) {
    fclose(f);
    return snprintf(problem, sizeof problem, "no linear memory for %lu samples", (unsigned long)samples), false;
  }
  for (uint32_t k = 0; k < count; k++) {
    if (entries[k].kind != 0) continue;
    fseek(f, (long)entries[k].offset, SEEK_SET);
    if (fread(sounds + sound_at[k], 1, entries[k].bytes, f) != entries[k].bytes) memset(sounds + sound_at[k], 0, entries[k].bytes);
  }
  fclose(f);
  DSP_FlushDataCache(sounds, samples * 2);
  Result r = ndspInit();
  if (R_FAILED(r)) return snprintf(problem, sizeof problem, "no DSP (ndspInit 0x%08lx)", (unsigned long)r), false;
  live = true;
  problem[0] = 0;
  ndspSetOutputMode(NDSP_OUTPUT_STEREO);
  for (int v = 0; v < VOICES; v++) channel(VOICE_CH + v);
  for (int s = 0; s < 2; s++) {
    channel(MUSIC_CH + s);
    streams[s].piece = -1;
    streams[s].file = fopen(path, "rb");
    for (int b = 0; b < MUSIC_BUFS; b++) streams[s].pcm[b] = linearAlloc(BLOCK * 2);
  }
  return true;
}

bool audio_live(void) { return live; }
const char *audio_problem(void) { return problem; }

void audio_shutdown(void) {
  if (!live) return;
  for (int c = MUSIC_CH; c < VOICE_CH + VOICES; c++) ndspChnWaveBufClear(c);
  for (int s = 0; s < 2; s++) {
    if (streams[s].file) fclose(streams[s].file);
    for (int b = 0; b < MUSIC_BUFS; b++) linearFree(streams[s].pcm[b]);
  }
  linearFree(sounds);
  ndspExit();
  live = false;
}

void audio_sound(uint32_t id, float gain, float speed) {
  if (!live || id >= count || entries[id].kind != 0 || gain <= 0) return;
  int ch = VOICE_CH + (int)(next_voice++ % VOICES);
  ndspWaveBuf *w = &voice_wave[ch - VOICE_CH];
  ndspChnWaveBufClear(ch);
  ndspChnSetRate(ch, (float)rate * (speed > 0.25f && speed < 4 ? speed : 1));
  set_mix(ch, gain * sound_volume);
  memset(w, 0, sizeof *w);
  w->data_vaddr = sounds + sound_at[id];
  w->nsamples = entries[id].frames;
  ndspChnWaveBufAdd(ch, w);
}

/* The next block of a stream's piece into one of its buffers, and queued. */
static void feed(Stream *s, int ch, int b) {
  const Entry *e = &entries[s->piece];
  uint32_t blocks = (e->frames + BLOCK - 1) / BLOCK;
  if (s->block >= blocks) s->block = 0;
  uint8_t raw[BLOCK_BYTES];
  bool ok = s->file && fseek(s->file, (long)(e->offset + s->block * BLOCK_BYTES), SEEK_SET) == 0 && fread(raw, 1, BLOCK_BYTES, s->file) == BLOCK_BYTES;
  if (ok) decode_block(raw, s->pcm[b]);
  else memset(s->pcm[b], 0, BLOCK * 2);
  uint32_t n = s->block == blocks - 1 ? e->frames - s->block * BLOCK : BLOCK;
  s->block++;
  DSP_FlushDataCache(s->pcm[b], BLOCK * 2);
  ndspWaveBuf *w = &s->wave[b];
  memset(w, 0, sizeof *w);
  w->data_vaddr = s->pcm[b];
  w->nsamples = n;
  ndspChnWaveBufAdd(ch, w);
}

void audio_music(int32_t piece, float gain) {
  if (!live) return;
  if (piece >= 0 && ((uint32_t)piece >= count || entries[piece].kind != 1)) piece = -1;
  /* The stream playing it already, toward its loudness; any other, away. */
  int keep = -1;
  for (int s = 0; s < 2; s++) {
    if (streams[s].on && streams[s].piece == piece && piece >= 0) keep = s;
    else streams[s].target = 0;
  }
  if (keep >= 0) {
    streams[keep].target = gain;
    return;
  }
  if (piece < 0) return;
  /* A stream free for it: one off, or the quieter. */
  int s = !streams[0].on ? 0 : !streams[1].on ? 1 : streams[0].gain <= streams[1].gain ? 0 : 1;
  Stream *st = &streams[s];
  ndspChnWaveBufClear(MUSIC_CH + s);
  st->piece = piece;
  st->block = 0;
  st->on = true;
  st->gain = 0;
  st->target = gain;
  set_mix(MUSIC_CH + s, 0);
  for (int b = 0; b < MUSIC_BUFS; b++) feed(st, MUSIC_CH + s, b);
}

void audio_volumes(float music, float sound) {
  music_volume = music;
  sound_volume = sound;
}

void audio_tick(float dt) {
  if (!live) return;
  for (int s = 0; s < 2; s++) {
    Stream *st = &streams[s];
    if (!st->on) continue;
    int ch = MUSIC_CH + s;
    float step = dt / FADE_SECONDS;
    if (st->gain < st->target) st->gain = st->gain + step > st->target ? st->target : st->gain + step;
    else if (st->gain > st->target) st->gain = st->gain - step < st->target ? st->target : st->gain - step;
    set_mix(ch, st->gain * music_volume);
    if (st->gain <= 0 && st->target <= 0) {
      ndspChnWaveBufClear(ch);
      st->on = false;
      st->piece = -1;
      continue;
    }
    /* One block a frame at most, into a buffer the DSP has finished with. */
    for (int b = 0; b < MUSIC_BUFS; b++) {
      if (st->wave[b].status == NDSP_WBUF_DONE || st->wave[b].status == NDSP_WBUF_FREE) {
        feed(st, ch, b);
        break;
      }
    }
  }
}
