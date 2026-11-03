// Walking: how the player moves over a world that says where a body may
// stand. The same step runs on the island and in the house; each world
// answers two questions, how high the ground is at a point and whether a
// body of the walker's radius fits there. Like the rest of src/core this
// imports nothing from a renderer.
//
// The walker turns toward where the stick points and accelerates to a walk
// or, with run held, a run. Blocked, it slides along what is in the way: it
// tries the move, then each axis alone, then the move turned a little either
// way, so it slips round a tree trunk instead of sticking to it.

export interface Walker {
  /** Where it stands, in tiles; y is the ground under it as drawn (eased). */
  x: number;
  z: number;
  y: number;
  /** Facing: 0 looks toward +z (the camera), turning counter-clockwise seen from above. */
  yaw: number;
  /** Tiles a second it means to go: it accelerates toward the stick's speed, and stops dead against a wall. */
  speed: number;
  /** The walk cycle's phase in steps (one step is half a cycle). */
  phase: number;
}

export interface WalkInput {
  /** Where to go, in world axes, length 0..1. */
  x: number;
  z: number;
  run: boolean;
}

export interface WalkWorld {
  /** The ground's height at a point. */
  height(x: number, z: number): number;
  /** Whether a body of radius `r` fits with its centre at (x, z), coming from ground at height `from`. */
  fits(x: number, z: number, r: number, from: number): boolean;
}

export const WALK_SPEED = 3.1;
export const RUN_SPEED = 6.2;
export const WALKER_RADIUS = 0.28;
/** Strides a tile walked; the cycle runs this many steps a tile. */
export const STEPS_PER_TILE = 1.7;
const ACCEL = 18;
const TURN = 14;
const DEADZONE = 0.12;

export function newWalker(x: number, z: number, y: number, yaw = 0): Walker {
  return { x, z, y, yaw, speed: 0, phase: 0 };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The facing for a direction of travel (dx, dz). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** One step of `dt` seconds. Returns a new walker. */
export function stepWalker(w: Walker, input: WalkInput, dt: number, world: WalkWorld, r = WALKER_RADIUS): Walker {
  const length = Math.min(1, Math.hypot(input.x, input.z));
  const pushing = length > DEADZONE;
  const goal = pushing ? (input.run ? RUN_SPEED : WALK_SPEED) * Math.min(1, (length - DEADZONE) / (0.6 - DEADZONE)) : 0;
  let speed = w.speed + Math.sign(goal - w.speed) * Math.min(Math.abs(goal - w.speed), ACCEL * dt);
  let yaw = w.yaw;
  if (pushing) {
    const want = yawOf(input.x, input.z);
    const turn = wrapAngle(want - yaw);
    yaw = wrapAngle(yaw + Math.sign(turn) * Math.min(Math.abs(turn), TURN * dt));
  }
  let { x, z } = w;
  const ground = world.height(x, z);
  let moved = 0;
  if (speed > 1e-3) {
    // Travel along the stick's direction, so a turn never drags the walker sideways.
    const heading = pushing ? yawOf(input.x, input.z) : yaw;
    const reach = speed * dt;
    const along = (bend: number): [number, number] => {
      const k = reach * Math.max(0.35, Math.cos(bend));
      return [Math.sin(heading + bend) * k, Math.cos(heading + bend) * k];
    };
    const ahead = along(0);
    const tries: Array<Array<[number, number]>> = [[ahead], [[ahead[0], 0]], [[0, ahead[1]]]];
    for (const bend of [0.45, 0.9, 1.25, Math.PI / 2]) tries.push([along(bend), along(-bend)]);
    for (const options of tries) {
      const open = options.filter(([dx, dz]) => Math.hypot(dx, dz) > 1e-5 && world.fits(x + dx, z + dz, r, ground));
      if (!open.length) continue;
      // Turned either way, go the way with more room: round the obstacle, not into its middle.
      const roomy = open.length > 1 ? open.find(([dx, dz]) => world.fits(x + dx * 6, z + dz * 6, r, ground)) : undefined;
      const [dx, dz] = roomy ?? open[0]!;
      x += dx;
      z += dz;
      moved = Math.hypot(dx, dz);
      break;
    }
    if (!moved) speed = 0;
  }
  const height = world.height(x, z);
  // The body rises and settles onto a bank or a step rather than jumping.
  const y = w.y + (height - w.y) * (1 - Math.exp(-dt * 18));
  const phase = w.phase + moved * STEPS_PER_TILE;
  return { x, z, y: Math.abs(y - height) < 1e-4 ? height : y, yaw, speed, phase };
}

export interface Point {
  x: number;
  z: number;
}

/**
 * A way from `from` to `to` through `world`, on a grid of `step` tiles inside `bounds`
 * ([x0, z0, x1, z1]): the corners where it turns, ending at `to` or, when nothing can stand
 * there, at the nearest place that can be reached. Null when the walker cannot move at all.
 */
export function findPath(world: WalkWorld, from: Point, to: Point, bounds: readonly [number, number, number, number], step = 0.5, r = WALKER_RADIUS, limit = 20000): Point[] | null {
  const [x0, z0, x1, z1] = bounds;
  const cols = Math.max(1, Math.floor((x1 - x0) / step)), rows = Math.max(1, Math.floor((z1 - z0) / step));
  const node = (p: Point) => {
    const c = Math.min(cols - 1, Math.max(0, Math.round((p.x - x0) / step - 0.5)));
    const rr = Math.min(rows - 1, Math.max(0, Math.round((p.z - z0) / step - 0.5)));
    return rr * cols + c;
  };
  const at = (n: number): Point => ({ x: x0 + ((n % cols) + 0.5) * step, z: z0 + (Math.floor(n / cols) + 0.5) * step });
  const start = node(from), goal = node(to);
  const cost = new Map<number, number>([[start, 0]]);
  const ground = new Map<number, number>([[start, world.height(from.x, from.z)]]);
  const came = new Map<number, number>();
  // The open nodes in a binary heap by estimated cost; a node is expanded once.
  const heap: Array<[number, number]> = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (heap[parent]![0] <= heap[i]![0]) break;
      [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const a = i * 2 + 1, b = a + 1;
        let m = i;
        if (a < heap.length && heap[a]![0] < heap[m]![0]) m = a;
        if (b < heap.length && heap[b]![0] < heap[m]![0]) m = b;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const closed = new Set<number>();
  push([0, start]);
  const guess = (n: number) => { const p = at(n); return Math.hypot(p.x - to.x, p.z - to.z); };
  let best = start, bestGuess = guess(start);
  while (heap.length && closed.size < limit) {
    const [, n] = pop();
    if (closed.has(n)) continue;
    closed.add(n);
    if (n === goal) {
      best = n;
      break;
    }
    const here = at(n), h = ground.get(n)!;
    const c = n % cols, rr = Math.floor(n / cols);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nc = c + dx, nr = rr + dz;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const m = nr * cols + nc;
      if (closed.has(m)) continue;
      const p = at(m);
      // Through the middle of the step too, so a diagonal does not cut a corner.
      if (!world.fits(p.x, p.z, r, h) || !world.fits((p.x + here.x) / 2, (p.z + here.z) / 2, r, h)) continue;
      const g = cost.get(n)! + (dx && dz ? Math.SQRT2 : 1) * step;
      if (g >= (cost.get(m) ?? Infinity)) continue;
      cost.set(m, g);
      ground.set(m, world.height(p.x, p.z));
      came.set(m, n);
      const f = guess(m);
      if (f < bestGuess) {
        bestGuess = f;
        best = m;
      }
      push([g + f, m]);
    }
  }
  const chain: Point[] = [];
  for (let n: number | undefined = best; n !== undefined && n !== start; n = came.get(n)) chain.push(at(n));
  chain.reverse();
  if (best === goal && world.fits(to.x, to.z, r, world.height(to.x, to.z))) chain.push({ x: to.x, z: to.z });
  // Keep only the corners: a point is dropped when the walk past it is clear in a straight line.
  const clear = (a: Point, b: Point) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
    let h = world.height(a.x, a.z);
    for (let i = 1; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n;
      if (!world.fits(x, z, r, h)) return false;
      h = world.height(x, z);
    }
    return true;
  };
  const out: Point[] = [];
  let anchor: Point = from;
  for (let i = 0; i < chain.length; i++) {
    const next = chain[i + 1];
    if (next && clear(anchor, next)) continue;
    out.push(chain[i]!);
    anchor = chain[i]!;
  }
  return out.length || best !== start ? out : null;
}
