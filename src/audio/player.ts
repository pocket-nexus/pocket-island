// The island's sound in the browser: the music for the hour (./music.ts), changing with a slow
// cross-fade, darker and softer inside the house and lower while someone talks; and the sounds of
// things (./sfx.ts) as the frame's cues ask (./cues.ts). Everything is rendered in a worker the
// first time it is wanted. The browser lets sound start only after a key or a click, so it waits for
// one. Music and sounds can each be switched off, and are kept so.

import { RATE } from "./synth.ts";
import { musicLevel, PIECES, SOUND_NAMES, type PieceName } from "./names.ts";
import type { Cue } from "./cues.ts";
import { hear } from "./hear.ts";
import { keep, kept } from "../kept.ts";


class Player {
  private ctx: AudioContext | null = null;
  private worker: Worker | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private asked = new Set<string>();
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private playing: { name: PieceName; gain: GainNode; source: AudioBufferSourceNode } | null = null;
  private wanted: PieceName | null = null;
  private inside = false;
  private quiet = false;
  musicOn = true;
  soundsOn = true;

  constructor() {
    try {
      const was = JSON.parse(kept("sound") ?? "{}") as { music?: boolean; sounds?: boolean };
      this.musicOn = was.music ?? true;
      this.soundsOn = was.sounds ?? true;
    } catch {
      /* the defaults */
    }
    const start = () => this.start();
    window.addEventListener("pointerdown", start, { once: true, capture: true });
    window.addEventListener("keydown", start, { once: true, capture: true });
  }

  /** On the first key or click: the sound's context, and everything rendered from the steps up. */
  private start(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    } catch {
      return;
    }
    const c = this.ctx;
    this.tone = c.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 18_000;
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.tone).connect(c.destination);
    this.sfxBus.connect(c.destination);
    this.apply();
    this.worker = new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<{ kind: string; name: string; samples: Float32Array }>) => {
      const { kind, name, samples } = e.data;
      const b = c.createBuffer(1, samples.length, RATE);
      b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(`${kind}:${name}`, b);
      if (kind === "piece" && name === this.wanted) this.music(this.wanted, this.inside, this.quiet);
    };
    if (this.wanted) this.ask("piece", this.wanted);
    for (const s of SOUND_NAMES) this.ask("sound", s);
    for (const p of PIECES) this.ask("piece", p);
  }

  private ask(kind: "piece" | "sound", name: string): void {
    const key = `${kind}:${name}`;
    if (this.asked.has(key) || !this.worker) return;
    this.asked.add(key);
    this.worker.postMessage({ kind, name });
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus!.gain.setTargetAtTime(this.musicOn ? musicLevel(this.inside, this.quiet) : 0, t, 0.4);
    this.tone!.frequency.setTargetAtTime(this.inside ? 1600 : 18_000, t, 0.4);
    this.sfxBus!.gain.setTargetAtTime(this.soundsOn ? 0.9 : 0, t, 0.05);
  }

  /** The music for now: `piece`, inside the house or out, quieter while someone talks. */
  music(piece: PieceName, inside: boolean, quiet: boolean): void {
    this.wanted = piece;
    if (inside !== this.inside || quiet !== this.quiet) {
      this.inside = inside;
      this.quiet = quiet;
      this.apply();
    }
    const c = this.ctx, buffer = this.buffers.get(`piece:${piece}`);
    if (!c || !buffer || this.playing?.name === piece) return;
    const t = c.currentTime;
    // The old piece away over three seconds, the new one up over the same.
    if (this.playing) {
      const old = this.playing;
      old.gain.gain.setTargetAtTime(0, t, 1);
      old.source.stop(t + 6);
    }
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, t, this.playing ? 1 : 0.3);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(this.musicBus!);
    source.start();
    this.playing = { name: piece, gain, source };
  }

  play(cue: Cue): void {
    const c = this.ctx, buffer = this.buffers.get(`sound:${cue.sound}`);
    if (!c || !buffer || !this.soundsOn) return;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = cue.rate;
    const gain = c.createGain();
    gain.gain.value = cue.gain;
    source.connect(gain).connect(this.sfxBus!);
    source.start();
  }

  set(which: "music" | "sounds", on: boolean): void {
    if (which === "music") this.musicOn = on;
    else this.soundsOn = on;
    keep("sound", JSON.stringify({ music: this.musicOn, sounds: this.soundsOn }));
    this.apply();
  }
}

export const audio = new Player();
// What the shared scripts ask to hear (./hear.ts) is played here, as the console's mixer plays it (apps/island-3ds/sound.ts).
hear.play = (c) => audio.play(c);
