/* The island's sound on the console: the sounds and the music the browser plays, rendered by the
 * same scripts into romfs:/extension/sound.pack (tools/sound.ts).
 *
 * It plays through the DSP (NDSP) when the console has the DSP's firmware (/3ds/dspfirm.cdc, or the
 * Homebrew Launcher's handle to it), and otherwise through the sound hardware's own channels (CSND),
 * which need none:
 *
 *   - The sounds are loaded whole into linear memory at the start and played on six voices taken in
 *     turn, each at its own loudness and speed.
 *   - The music is IMA ADPCM. Through the DSP it streams from the pack a block at a time, decoded
 *     into three buffers queued on its channel. Through CSND a piece is decoded whole into linear
 *     memory by a thread of the lowest priority (reading the SD card's romfs takes milliseconds,
 *     which the frame cannot spare), and then loops in the hardware. Either way it comes round to its
 *     start without a seam, and a new piece comes in on the second music channel while the old one
 *     fades out, over three seconds.
 *
 * NDSP's channel 0 is PocketJS's media; the island takes 8 and 9 for music and 10 to 15 for sounds.
 * Through CSND it takes the first eight channels the system allows. */
#include "audio.h"

#include <3ds.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { MUSIC_CH = 8, VOICE_CH = 10, VOICES = 6, BLOCK = 2048, BLOCK_BYTES = 4 + BLOCK / 2, MUSIC_BUFS = 3 };
/* Blocks of a piece the decoder reads from the pack at once (through CSND). */
enum { DECODE_CHUNK = 32 };
/* The music's fades as the browser's (src/audio/names.ts MIX, set by the interface, island.mix): the
 * time constants a piece comes in and the last goes away with, the first comes up with, and a change
 * of level follows with; a fading piece is stopped once it is this quiet. */
static float fade_crossfade, fade_first, fade_level;
#define FADE_GONE 0.003f

typedef enum { NONE, DSP, HARDWARE } Backend;

typedef struct {
  uint8_t kind, loop;
  uint32_t frames, offset, bytes;
} Entry;

typedef struct {
  int32_t piece;
  float gain, target, shown, tau;
  uint32_t block;
  bool on;
  FILE *file;
  /* Through the DSP: three buffers queued in turn. */
  int16_t *pcm[MUSIC_BUFS];
  ndspWaveBuf wave[MUSIC_BUFS];
  /* Through CSND: the whole piece (room for the longest), decoded by the decoder; playing once it is. */
  int16_t *whole;
  bool playing;
} Stream;

/* The decoder: the piece each stream wants decoded (-1 none), and the piece decoded in it. */
static Thread decoder;
static LightEvent decode_wake;
static volatile int32_t decode_want[2] = {-1, -1}, decoded[2] = {-1, -1};
static volatile bool decoder_stop;
static FILE *decode_file;
static void decoder_main(void *arg);

static Backend backend;
static uint32_t rate, count;
static Entry *entries;
/* The sounds' samples, all in one block of linear memory, and where each starts. */
static int16_t *sounds;
static uint32_t *sound_at;
static ndspWaveBuf voice_wave[VOICES];
static uint32_t next_voice;
static Stream streams[2];
/* CSND's channels taken: two for music, then the voices. */
static int hw_channel[2 + VOICES];
static float music_volume = 1, sound_volume = 1;
static char path[96];
static char problem[80] = "not started";

static const int16_t STEP[89] = {7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767};
static const int8_t INDEX[16] = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};

static uint32_t blocks_of(const Entry *e) { return (e->frames + BLOCK - 1) / BLOCK; }

static uint32_t read32(const uint8_t *p) { return p[0] | p[1] << 8 | p[2] << 16 | (uint32_t)p[3] << 24; }

/* One block of IMA ADPCM into `out`, BLOCK samples, from the state at its head. */
static void decode_block(const uint8_t *block, int16_t *out, uint32_t n) {
  int32_t predictor = (int16_t)(block[0] | block[1] << 8);
  int32_t index = block[2];
  if (index > 88) index = 88;
  for (uint32_t i = 0; i < n; i++) {
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

/* ---------------------------------------------------------------- the two ways out */

static void dsp_mix(int ch, float gain) {
  float mix[12] = {0};
  mix[0] = mix[1] = gain;
  ndspChnSetMix(ch, mix);
}

static void dsp_channel(int ch) {
  ndspChnReset(ch);
  ndspChnSetInterp(ch, NDSP_INTERP_LINEAR);
  ndspChnSetRate(ch, (float)rate);
  ndspChnSetFormat(ch, NDSP_FORMAT_MONO_PCM16);
}

static void hw_volume(int ch, float gain) {
  u32 v = CSND_VOL(gain, 0);
  CSND_SetVol((u32)ch, v, v);
}

static void hw_stop(int ch) { CSND_SetPlayState((u32)ch, 0); }

/* A sound on CSND's channel `ch`, as libctru's csndPlaySound sets it (16-bit samples at `hz`, once
 * or round and round), but queued for the frame's one execution of the commands (audio_tick) instead
 * of waiting there for each: a step's sound would otherwise hold its frame. */
static void hw_play(int ch, bool loop, uint32_t hz, float gain, const int16_t *data, uint32_t bytes) {
  u32 flags = SOUND_FORMAT_16BIT | (loop ? SOUND_REPEAT : SOUND_ONE_SHOT);
  u32 timer = CSND_TIMER(hz);
  if (timer < 0x42) timer = 0x42;
  if (timer > 0xffff) timer = 0xffff;
  flags &= ~0xFFFF001F;
  flags |= SOUND_ENABLE | SOUND_CHANNEL(ch) | (timer << 16);
  u32 paddr = osConvertVirtToPhys(data), volumes = CSND_VOL(gain, 0);
  CSND_SetChnRegs(flags, paddr, paddr, bytes, volumes, volumes);
}

static bool hw_commands;

/* The DSP, or else CSND's channels: which there is. */
static bool start_backend(void) {
  Result r = ndspInit();
  if (R_SUCCEEDED(r)) {
    backend = DSP;
    ndspSetOutputMode(NDSP_OUTPUT_STEREO);
    for (int v = 0; v < VOICES; v++) dsp_channel(VOICE_CH + v);
    for (int s = 0; s < 2; s++) dsp_channel(MUSIC_CH + s);
    return true;
  }
  Result h = csndInit();
  if (R_FAILED(h)) {
    snprintf(problem, sizeof problem, "no DSP (ndspInit 0x%08lx) and no CSND (0x%08lx)", (unsigned long)r, (unsigned long)h);
    return false;
  }
  int n = 0;
  for (int c = 0; c < 32 && n < 2 + VOICES; c++)
    if (csndChannels & BIT(c)) hw_channel[n++] = c;
  if (n < 2 + VOICES) {
    csndExit();
    snprintf(problem, sizeof problem, "CSND allows %d channels", n);
    return false;
  }
  backend = HARDWARE;
  return true;
}

/* ---------------------------------------------------------------- starting */

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
  /* The sounds, whole, where the DSP or the sound hardware reads them. */
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
  GSPGPU_FlushDataCache(sounds, samples * 2);
  if (!start_backend()) return false;
  /* Through CSND, room in each music stream for the longest piece, and the decoder to fill it. */
  uint32_t longest = 0;
  for (uint32_t k = 0; k < count; k++)
    if (entries[k].kind == 1 && blocks_of(&entries[k]) * BLOCK > longest) longest = blocks_of(&entries[k]) * BLOCK;
  /* Through the DSP each stream reads its piece a block at a time from a file of its own; through
   * CSND the decoder reads them all from one (decode_file). */
  for (int s = 0; s < 2; s++) {
    streams[s].piece = -1;
    if (backend == DSP) {
      streams[s].file = fopen(path, "rb");
      for (int b = 0; b < MUSIC_BUFS; b++) streams[s].pcm[b] = linearAlloc(BLOCK * 2);
    } else
      streams[s].whole = linearAlloc(longest * 2);
  }
  if (backend == HARDWARE) {
    decode_file = fopen(path, "rb");
    LightEvent_Init(&decode_wake, RESET_ONESHOT);
    decoder = threadCreate(decoder_main, NULL, 16 * 1024, 0x3f, -2, false);
  }
  problem[0] = 0;
  return true;
}

bool audio_live(void) { return backend != NONE; }
const char *audio_problem(void) { return problem; }
const char *audio_way(void) { return backend == DSP ? "dsp" : backend == HARDWARE ? "csnd" : ""; }

void audio_shutdown(void) {
  if (backend == NONE) return;
  if (decoder) {
    decoder_stop = true;
    LightEvent_Signal(&decode_wake);
    threadJoin(decoder, U64_MAX);
    threadFree(decoder);
    decoder = NULL;
  }
  if (decode_file) fclose(decode_file), decode_file = NULL;
  for (int s = 0; s < 2; s++) {
    if (backend == DSP) ndspChnWaveBufClear(MUSIC_CH + s);
    else hw_stop(hw_channel[s]);
    if (streams[s].file) fclose(streams[s].file);
    for (int b = 0; b < MUSIC_BUFS; b++) if (streams[s].pcm[b]) linearFree(streams[s].pcm[b]);
    if (streams[s].whole) linearFree(streams[s].whole);
  }
  if (backend == DSP) {
    for (int v = 0; v < VOICES; v++) ndspChnWaveBufClear(VOICE_CH + v);
    ndspExit();
  } else {
    for (int v = 0; v < VOICES; v++) hw_stop(hw_channel[2 + v]);
    csndExecCmds(true);
    csndExit();
  }
  linearFree(sounds);
  backend = NONE;
}

/* ---------------------------------------------------------------- sounds */

void audio_sound(uint32_t id, float gain, float speed) {
  if (backend == NONE || id >= count || entries[id].kind != 0 || gain <= 0) return;
  if (!(speed > 0.25f && speed < 4)) speed = 1;
  uint32_t voice = next_voice++ % VOICES;
  if (backend == HARDWARE) {
    hw_play(hw_channel[2 + voice], false, (uint32_t)(rate * speed), gain * sound_volume, sounds + sound_at[id], entries[id].frames * 2);
    hw_commands = true;
    return;
  }
  int ch = VOICE_CH + (int)voice;
  ndspWaveBuf *w = &voice_wave[voice];
  ndspChnWaveBufClear(ch);
  ndspChnSetRate(ch, (float)rate * speed);
  dsp_mix(ch, gain * sound_volume);
  memset(w, 0, sizeof *w);
  w->data_vaddr = sounds + sound_at[id];
  w->nsamples = entries[id].frames;
  ndspChnWaveBufAdd(ch, w);
}

/* ---------------------------------------------------------------- music */


/* Block `b` of a stream's piece, read from the pack and decoded into `out` (`n` samples of it). */
static void read_block(Stream *s, uint32_t b, int16_t *out, uint32_t n) {
  const Entry *e = &entries[s->piece];
  uint8_t raw[BLOCK_BYTES];
  bool ok = s->file && fseek(s->file, (long)(e->offset + b * BLOCK_BYTES), SEEK_SET) == 0 && fread(raw, 1, BLOCK_BYTES, s->file) == BLOCK_BYTES;
  if (ok) decode_block(raw, out, n);
  else memset(out, 0, n * 2);
}

/* Through the DSP: the next block into one of the stream's buffers, and queued. */
static void feed(Stream *s, int ch, int b) {
  const Entry *e = &entries[s->piece];
  uint32_t blocks = blocks_of(e);
  if (s->block >= blocks) s->block = 0;
  uint32_t n = s->block == blocks - 1 ? e->frames - s->block * BLOCK : BLOCK;
  read_block(s, s->block, s->pcm[b], n);
  s->block++;
  DSP_FlushDataCache(s->pcm[b], BLOCK * 2);
  ndspWaveBuf *w = &s->wave[b];
  memset(w, 0, sizeof *w);
  w->data_vaddr = s->pcm[b];
  w->nsamples = n;
  ndspChnWaveBufAdd(ch, w);
}

/* Through CSND, on the decoder's thread: the piece a stream wants, decoded whole into its buffer, a
 * chunk of blocks a read; begun again if another is wanted before it is done. */
static void decode_piece(int s, int32_t piece) {
  const Entry *e = &entries[piece];
  uint32_t blocks = blocks_of(e);
  static uint8_t raw[DECODE_CHUNK * BLOCK_BYTES];
  for (uint32_t b = 0; b < blocks && !decoder_stop; b += DECODE_CHUNK) {
    if (decode_want[s] != piece) return;
    uint32_t n = blocks - b < DECODE_CHUNK ? blocks - b : DECODE_CHUNK;
    bool ok = decode_file && fseek(decode_file, (long)(e->offset + b * BLOCK_BYTES), SEEK_SET) == 0 && fread(raw, 1, n * BLOCK_BYTES, decode_file) == n * BLOCK_BYTES;
    for (uint32_t k = 0; k < n; k++) {
      uint32_t count = b + k == blocks - 1 ? e->frames - (b + k) * BLOCK : BLOCK;
      if (ok) decode_block(raw + k * BLOCK_BYTES, streams[s].whole + (b + k) * BLOCK, count);
      else memset(streams[s].whole + (b + k) * BLOCK, 0, count * 2);
    }
  }
  if (decode_want[s] == piece) {
    GSPGPU_FlushDataCache(streams[s].whole, e->frames * 2);
    decoded[s] = piece;
  }
}

static void decoder_main(void *arg) {
  (void)arg;
  while (!decoder_stop) {
    LightEvent_Wait(&decode_wake);
    for (int s = 0; s < 2; s++) {
      int32_t piece = decode_want[s];
      if (piece >= 0 && decoded[s] != piece) decode_piece(s, piece);
    }
  }
}

void audio_music(int32_t piece, float gain) {
  if (backend == NONE) return;
  if (piece >= 0 && ((uint32_t)piece >= count || entries[piece].kind != 1)) piece = -1;
  /* The stream playing it already, toward its loudness; any other, away. */
  int keep = -1;
  bool playing = false;
  for (int s = 0; s < 2; s++) {
    if (streams[s].on && streams[s].piece == piece && piece >= 0) keep = s;
    else if (streams[s].target > 0) streams[s].target = 0, streams[s].tau = fade_crossfade;
    playing = playing || streams[s].on;
  }
  if (keep >= 0) {
    if (streams[keep].target != gain) streams[keep].target = gain, streams[keep].tau = fade_level;
    return;
  }
  if (piece < 0) return;
  /* A stream free for it: one off, or the quieter. */
  int s = !streams[0].on ? 0 : !streams[1].on ? 1 : streams[0].gain <= streams[1].gain ? 0 : 1;
  Stream *st = &streams[s];
  st->tau = playing ? fade_crossfade : fade_first;
  st->piece = piece;
  st->block = 0;
  st->on = true;
  st->gain = 0;
  st->shown = -1;
  st->target = gain;
  if (backend == DSP) {
    ndspChnWaveBufClear(MUSIC_CH + s);
    dsp_mix(MUSIC_CH + s, 0);
    for (int b = 0; b < MUSIC_BUFS; b++) feed(st, MUSIC_CH + s, b);
    return;
  }
  /* Stopped, and the new piece decoded into its room by the decoder. */
  hw_stop(hw_channel[s]);
  hw_commands = true;
  st->playing = false;
  if (!st->whole || !decoder) {
    st->on = false;
    return;
  }
  decoded[s] = -1;
  decode_want[s] = piece;
  LightEvent_Signal(&decode_wake);
}

void audio_mix(float crossfade, float first, float level) {
  fade_crossfade = crossfade, fade_first = first, fade_level = level;
}

void audio_volumes(float music, float sound) {
  music_volume = music;
  sound_volume = sound;
}

void audio_tick(float dt) {
  if (backend == NONE) return;
  bool commands = false;
  for (int s = 0; s < 2; s++) {
    Stream *st = &streams[s];
    if (!st->on) continue;
    /* Through CSND, a piece plays once it is all decoded, and its fade begins then. */
    if (backend == HARDWARE && !st->playing) {
      if (decoded[s] != st->piece) continue;
      const Entry *e = &entries[st->piece];
      hw_play(hw_channel[s], true, rate, 0, st->whole, e->frames * 2);
      st->playing = true;
      commands = true;
    }
    /* Toward its loudness as the browser's gains go (setTargetAtTime), at its fade's time constant. */
    st->gain = st->tau > 0 ? st->gain + (st->target - st->gain) * (1 - expf(-dt / st->tau)) : st->target;
    if (st->target <= 0 && st->gain < FADE_GONE) st->gain = 0;
    float shown = st->gain * music_volume;
    if (shown != st->shown) {
      st->shown = shown;
      if (backend == DSP) dsp_mix(MUSIC_CH + s, shown);
      else hw_volume(hw_channel[s], shown), commands = true;
    }
    if (st->gain <= 0 && st->target <= 0) {
      if (backend == DSP) ndspChnWaveBufClear(MUSIC_CH + s);
      else hw_stop(hw_channel[s]), commands = true;
      st->on = false;
      st->playing = false;
      st->piece = -1;
      continue;
    }
    if (backend != DSP) continue;
    /* One block a frame at most, into a buffer the DSP has finished with. */
    for (int b = 0; b < MUSIC_BUFS; b++) {
      if (st->wave[b].status == NDSP_WBUF_DONE || st->wave[b].status == NDSP_WBUF_FREE) {
        feed(st, MUSIC_CH + s, b);
        break;
      }
    }
  }
  if (commands || hw_commands) csndExecCmds(false);
  hw_commands = false;
}
