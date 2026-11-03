// Catalogue pictures: each item and variant rendered once, from a three-
// quarter view, in a small renderer of its own, and kept as an image URL.
// They are drawn a few per frame so the catalogue opens at once and fills in.

import * as THREE from "three";
import { softRoom } from "../scene/lighting.ts";
import type { FurnitureDef, FinishDef } from "../furniture/types.ts";
import { instance, setGlow } from "../scene/view.ts";
import { finishTextures } from "../scene/shell.ts";

const SIZE = 192;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
const urls = new Map<string, string>();
const queue: Array<{ key: string; def: FurnitureDef; variant: number; done: (url: string) => void }> = [];
let pumping = false;

function setup(): void {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(softRoom(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff1de, 2.6);
  key.position.set(2, 4, 3);
  scene.add(key, new THREE.HemisphereLight(0xfff6ea, 0xb9926e, 1.3));
  camera = new THREE.PerspectiveCamera(24, 1, 0.05, 100);
}

function render(def: FurnitureDef, variant: number): string {
  if (!renderer) setup();
  const { root, glows, halo } = instance(def, variant);
  setGlow(glows, halo, true);
  if (halo) halo.visible = false;
  // Wall items face the camera; others turn a little toward it.
  if (def.kind !== "wall") root.rotation.y = -0.55;
  scene.add(root);
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = def.kind === "wall" ? new THREE.Vector3(0.15, 0.12, 1) : def.kind === "rug" ? new THREE.Vector3(0, 1.4, 1) : new THREE.Vector3(0, 0.62, 1);
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(12)) * 0.98;
  camera.position.copy(centre).addScaledVector(dir.normalize(), dist);
  camera.lookAt(centre);
  camera.near = dist * 0.1;
  camera.far = dist * 4;
  camera.updateProjectionMatrix();
  renderer!.render(scene, camera);
  scene.remove(root);
  return renderer!.domElement.toDataURL("image/png");
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const started = performance.now();
    while (queue.length && performance.now() - started < 12) {
      const job = queue.shift()!;
      let url = urls.get(job.key);
      if (!url) {
        url = render(job.def, job.variant);
        urls.set(job.key, url);
      }
      job.done(url);
    }
    if (queue.length) requestAnimationFrame(step);
    else pumping = false;
  };
  requestAnimationFrame(step);
}

/** Call `done` with the item's picture, now if it is drawn, or once it is. */
export function thumb(def: FurnitureDef, variant: number, done: (url: string) => void): void {
  const key = `${def.id}:${variant}`;
  const url = urls.get(key);
  if (url) {
    done(url);
    return;
  }
  queue.push({ key, def, variant, done });
  pump();
}

/** A finish's swatch: a piece of its texture. */
export function finishThumb(def: FinishDef): string {
  const key = `finish:${def.id}`;
  let url = urls.get(key);
  if (url) return url;
  const t = finishTextures(def);
  const src = t.map.image as HTMLCanvasElement;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d")!;
  if (def.kind === "wallpaper") {
    // One tile wide, the wall's lower two thirds.
    g.drawImage(src, 0, src.height * 0.3, src.width, src.height * 0.7, 0, 0, 160, 160 * 1.05);
  } else {
    g.drawImage(src, 0, 0, src.width / 2, src.height / 2, 0, 0, 160, 160);
  }
  url = c.toDataURL("image/png");
  urls.set(key, url);
  return url;
}
