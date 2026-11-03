// What decorating draws over the room: the tile grids of the floor, the
// walls and the ceiling, the clear tile at the entrance, and the footprint
// of whatever is being carried, green where it fits and red where it does
// not.

import * as THREE from "three";
import { WALL_HEIGHT, doorRect } from "../core/rules.ts";
import type { Rect, WallSide } from "../core/types.ts";

const GRID_VERT = /* glsl */ `
varying vec2 vTile;
uniform vec2 size;
void main() {
  vTile = uv * size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GRID_FRAG = /* glsl */ `
varying vec2 vTile;
uniform vec2 size;
uniform float opacity;
uniform vec3 color;
uniform vec4 door;
uniform float fill;
float line(vec2 p, float width) {
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}
void main() {
  float tile = line(vTile, 1.4);
  float half_ = line(vTile * 2.0, 1.0) * 0.28;
  float a = max(tile, half_);
  vec4 c = vec4(color, a * opacity + fill);
  // Hatch the entrance tile.
  if (vTile.x > door.x && vTile.x < door.z && vTile.y > door.y && vTile.y < door.w) {
    float stripe = step(0.5, fract((vTile.x + vTile.y) * 4.0));
    c = mix(c, vec4(1.0, 0.55, 0.35, 0.55 * opacity), stripe * 0.8 + 0.2);
  }
  gl_FragColor = c;
}`;

function gridMaterial(fill = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      size: { value: new THREE.Vector2(1, 1) }, opacity: { value: 0.75 }, color: { value: new THREE.Color("#fffaf0") },
      door: { value: new THREE.Vector4(-1, -1, -1, -1) }, fill: { value: fill },
    },
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

const MARK_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 size;
uniform vec3 color;
uniform float time;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * size;
  float d = box(p, size * 0.5 - 0.03, 0.12);
  float edge = smoothstep(0.05, 0.0, abs(d + 0.035));
  float inside = step(d, 0.0);
  float pulse = 0.8 + 0.2 * sin(time * 5.0);
  gl_FragColor = vec4(color, (edge * 0.95 + inside * 0.14) * pulse);
}`;

export class Overlay {
  readonly group = new THREE.Group();
  private floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMaterial());
  private ceiling = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMaterial(0.08));
  private walls: Record<WallSide, THREE.Mesh> = {
    back: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMaterial()),
    left: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMaterial()),
    right: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMaterial()),
  };
  private marks: THREE.Mesh[] = [];
  private markMat = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: MARK_FRAG, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { size: { value: new THREE.Vector2(1, 1) }, color: { value: new THREE.Color("#7be08b") }, time: { value: 0 } },
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  private w = 6;
  private d = 6;

  constructor() {
    this.group.name = "overlay";
    this.floor.rotation.x = -Math.PI / 2;
    this.ceiling.rotation.x = -Math.PI / 2;
    this.ceiling.material.uniforms.color.value.set("#bfe3ff");
    this.walls.left.rotation.y = Math.PI / 2;
    this.walls.right.rotation.y = -Math.PI / 2;
    for (const m of [this.floor, this.ceiling, ...Object.values(this.walls)]) {
      m.renderOrder = 10;
      m.visible = false;
      m.raycast = () => {};
      this.group.add(m);
    }
  }

  fit(w: number, d: number): void {
    this.w = w;
    this.d = d;
    const H = WALL_HEIGHT;
    this.floor.scale.set(w, d, 1);
    this.floor.position.set(0, 0.004, 0);
    (this.floor.material as THREE.ShaderMaterial).uniforms.size.value.set(w, d);
    const door = doorRect({ w, d });
    // The plane's V runs from the front (0) to the back (d).
    (this.floor.material as THREE.ShaderMaterial).uniforms.door.value.set(door[0], d - door[3], door[2], d - door[1]);
    this.ceiling.scale.set(w, d, 1);
    this.ceiling.position.set(0, H, 0);
    (this.ceiling.material as THREE.ShaderMaterial).uniforms.size.value.set(w, d);
    this.walls.back.scale.set(w, H, 1);
    this.walls.back.position.set(0, H / 2, -d / 2 + 0.004);
    (this.walls.back.material as THREE.ShaderMaterial).uniforms.size.value.set(w, H);
    for (const side of ["left", "right"] as const) {
      const m = this.walls[side];
      m.scale.set(d, H, 1);
      m.position.set(side === "left" ? -w / 2 + 0.004 : w / 2 - 0.004, H / 2, 0);
      (m.material as THREE.ShaderMaterial).uniforms.size.value.set(d, H);
    }
  }

  show(layers: { floor?: boolean; walls?: boolean; ceiling?: boolean }): void {
    this.floor.visible = !!layers.floor;
    this.ceiling.visible = !!layers.ceiling;
    for (const m of Object.values(this.walls)) m.visible = !!layers.walls;
  }

  /** Show footprints: each a rectangle on the floor (or a top at height y), a wall or the ceiling. */
  mark(list: Array<{ where: "floor" | "ceiling" | WallSide; rect: Rect; y?: number }>, ok: boolean): void {
    while (this.marks.length < list.length) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.markMat.clone());
      m.renderOrder = 12;
      m.raycast = () => {};
      this.marks.push(m);
      this.group.add(m);
    }
    const hw = this.w / 2, hd = this.d / 2;
    this.marks.forEach((m, i) => {
      const item = list[i];
      m.visible = !!item;
      if (!item) return;
      const [x0, z0, x1, z1] = item.rect;
      const sx = x1 - x0, sz = z1 - z0;
      m.scale.set(sx, sz, 1);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.size.value.set(sx, sz);
      u.color.value.set(ok ? "#7be08b" : "#ff6b6b");
      if (item.where === "floor" || item.where === "ceiling") {
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.position.set((x0 + x1) / 2 - hw, item.where === "ceiling" ? WALL_HEIGHT - 0.01 : (item.y ?? 0) + 0.012, (z0 + z1) / 2 - hd);
      } else {
        // Wall rectangles are [u0, v0, u1, v1].
        const u = (x0 + x1) / 2, v = (z0 + z1) / 2;
        if (item.where === "back") {
          m.rotation.set(0, 0, 0);
          m.position.set(u - hw, v, -hd + 0.012);
        } else {
          m.rotation.set(0, item.where === "left" ? Math.PI / 2 : -Math.PI / 2, 0);
          m.position.set(item.where === "left" ? -hw + 0.012 : hw - 0.012, v, u - hd);
        }
      }
    });
  }

  clearMarks(): void {
    for (const m of this.marks) m.visible = false;
  }

  frame(now: number): void {
    for (const m of this.marks) (m.material as THREE.ShaderMaterial).uniforms.time.value = now / 1000;
  }
}
