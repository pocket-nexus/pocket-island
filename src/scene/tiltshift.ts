// The island's tilt-shift: a sharp band across the middle of the picture,
// soft above and a little soft below, so the room reads as a little model.
//
// One pass, reading the finished picture directly: each pixel outside the
// band averages a golden-angle spiral of taps whose radius grows with its
// distance from the band.

import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

const FRAG = /* glsl */ `
uniform float focus;
uniform float halfBand;
uniform float feather;
uniform float topBlur;
uniform float bottomBlur;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float d = uv.y - focus;
  float amount = smoothstep(halfBand, halfBand + feather, abs(d));
  float radius = amount * (d > 0.0 ? topBlur : bottomBlur);
  // Grading upstream can leave values outside 0..1 in the float buffer
  // (a saturated dark brown has a negative blue); averaging those would
  // tint the blur, so every sample is clamped first.
  if (radius < 0.35) {
    outputColor = clamp(inputColor, 0.0, 1.0);
    return;
  }
  vec4 sum = vec4(0.0);
  float spin = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  const int TAPS = 28;
  for (int i = 0; i < TAPS; i++) {
    float f = (float(i) + 0.5) / float(TAPS);
    float a = float(i) * 2.39996323 + spin;
    vec2 off = vec2(cos(a), sin(a)) * sqrt(f) * radius * texelSize;
    sum += clamp(texture2D(inputBuffer, uv + off), 0.0, 1.0);
  }
  outputColor = sum / float(TAPS);
}
`;

export class TiltShift extends Effect {
  constructor() {
    super("IslandTiltShift", FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ["focus", new THREE.Uniform(0.5)],
        ["halfBand", new THREE.Uniform(0.22)],
        ["feather", new THREE.Uniform(0.22)],
        ["topBlur", new THREE.Uniform(9)],
        ["bottomBlur", new THREE.Uniform(5)],
      ]),
    });
  }

  set(focus: number, halfBand: number, feather: number, topBlur: number, bottomBlur: number): void {
    this.uniforms.get("focus")!.value = focus;
    this.uniforms.get("halfBand")!.value = halfBand;
    this.uniforms.get("feather")!.value = feather;
    this.uniforms.get("topBlur")!.value = topBlur;
    this.uniforms.get("bottomBlur")!.value = bottomBlur;
  }
}
