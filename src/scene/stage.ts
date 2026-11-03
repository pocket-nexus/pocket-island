// The stage: one WebGL renderer, the scene, the post-processing chain and
// the frame loop (after Pocket Studio's Stage).
//
// The picture is built in passes: the scene with soft key shadows, ambient
// occlusion (N8AO, accumulated while the view stands still), bloom on lamps
// and windows, a neutral tone curve with a little extra colour, the
// selection outline and the island's tilt-shift blur at the top and bottom
// of the frame.

import * as THREE from "three";
import {
  BlendFunction, BrightnessContrastEffect, EffectComposer, EffectPass, HueSaturationEffect,
  RenderPass, SelectiveBloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import type { Pass } from "postprocessing";
import { Rig } from "./rig.ts";
import { Lighting, installLampFalloff } from "./lighting.ts";
import { GLOW_LAYER } from "./materials.ts";
import { installSoftShadows } from "./shadows.ts";
import { TiltShift } from "./tiltshift.ts";

export type FrameListener = (dt: number, now: number) => void;

export interface Quality {
  ao: boolean;
  tiltShift: boolean;
  bloom: boolean;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new Rig();
  readonly lighting: Lighting;
  readonly composer: EffectComposer;
  /** Things that are not part of the picture's lighting: grids, markers. */
  readonly overlay = new THREE.Group();
  private ao: InstanceType<typeof N8AOPostPass>;
  private bloom: SelectiveBloomEffect;
  private tilt: TiltShift;
  private tiltPass: EffectPass;
  /** The passes, assembled once the canvas has its real size (built at 1×1, some targets keep the wrong size). */
  private chain: Pass[] = [];
  private assembled = false;
  private listeners = new Set<FrameListener>();
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private shadowsDirty = true;
  quality: Quality = { ao: true, tiltShift: true, bloom: true };

  constructor(readonly canvas: HTMLCanvasElement) {
    installSoftShadows();
    installLampFalloff();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

    this.lighting = new Lighting(this.scene, this.renderer);
    this.overlay.name = "overlay";
    this.scene.add(this.overlay);

    const camera = this.rig.camera;
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
    const renderPass = new RenderPass(this.scene, camera);

    this.ao = new N8AOPostPass(this.scene, camera, 1, 1);
    Object.assign(this.ao.configuration, {
      aoRadius: 0.7,
      distanceFalloff: 0.6,
      intensity: 3.2,
      color: new THREE.Color("#2b1a10"),
      halfRes: false,
      gammaCorrection: false,
      accumulate: false,
      aoSamples: 16,
      denoiseSamples: 8,
      denoiseRadius: 5,
      transparencyAware: false,
    });

    // Bloom only from surfaces that give off light (shades, bulbs, windows,
    // screens). Taken from the whole picture, a wall lit by a lamp beside
    // it would pass the threshold too and bloom into a white disc. Added,
    // not screened: the picture is still HDR here, and screening a channel
    // above 1 pulls it down, so a warm glow over a bright shade turns pink.
    this.bloom = new SelectiveBloomEffect(this.scene, camera, {
      blendFunction: BlendFunction.ADD, mipmapBlur: true, luminanceThreshold: 0.55, luminanceSmoothing: 0.3, intensity: this.lighting.bloom, radius: 0.72,
    });
    this.bloom.selection.layer = GLOW_LAYER;
    this.bloom.ignoreBackground = true;
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
    const colour = new HueSaturationEffect({ saturation: 0.1 });
    const contrast = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.06 });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    const mainPass = new EffectPass(camera, this.bloom, tone, colour, contrast, vignette);
    this.tilt = new TiltShift();
    this.tiltPass = new EffectPass(camera, this.tilt);
    this.chain = [renderPass, this.ao, mainPass, this.tiltPass];

    this.setFocus(false);
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(canvas);
    this.resize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  setQuality(q: Partial<Quality>): void {
    Object.assign(this.quality, q);
    this.ao.enabled = this.quality.ao;
    this.bloom.intensity = this.quality.bloom ? this.lighting.bloom : 0;
    this.tiltPass.enabled = this.quality.tiltShift;
  }

  /** How strong the tilt-shift is: the island blurs less while decorating. */
  setFocus(decorating: boolean): void {
    const k = Math.min(2, this.renderer.getPixelRatio());
    if (decorating) this.tilt.set(0.5, 0.34, 0.2, 5 * k, 3 * k);
    else this.tilt.set(0.52, 0.2, 0.26, 9 * k, 6 * k);
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    if (!this.assembled && width > 1 && height > 1) {
      this.assembled = true;
      for (const pass of this.chain) this.composer.addPass(pass);
    }
    this.composer.setSize(width, height, false);
    this.rig.resize(width / height);
  }

  /** Something that casts a shadow moved: redraw the shadow map next frame. */
  invalidateShadows(): void {
    this.shadowsDirty = true;
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - this.last);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  frame(dt: number): void {
    this.elapsed += dt;
    this.rig.update(dt);
    for (const listener of this.listeners) listener(dt, this.elapsed);
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    if (this.assembled) this.composer.render(dt / 1000);
  }

  /** A world point in CSS pixels inside the canvas. */
  project(point: THREE.Vector3): { x: number; y: number } {
    const v = point.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Tell the ambient occlusion that the picture changed without the camera moving. */
  refreshAO(): void {
    (this.ao as unknown as { needsFrame?: boolean }).needsFrame = true;
  }
}
