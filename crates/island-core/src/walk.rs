//! Walking (the browser's `src/core/walk.ts` before it moved here): how the player moves over a
//! world that says how high the ground is and whether a body fits. The walker turns toward the
//! stick and accelerates to a walk or a run; blocked, it slides along what is in the way, trying
//! the move, then each axis alone, then the move turned a little either way. A click is walked to
//! by a way found on a grid of half tiles.

use crate::math::{abs, atan2, ceil, cos, exp, floor, hypot, js_round, max, min, sign, sin, PI, SQRT_2};

pub const WALK_SPEED: f64 = 3.1;
pub const RUN_SPEED: f64 = 6.2;
pub const WALKER_RADIUS: f64 = 0.28;
/// Strides a tile walked: the cycle runs this many steps a tile.
pub const STEPS_PER_TILE: f64 = 1.7;
const ACCEL: f64 = 18.0;
const TURN: f64 = 14.0;
const DEADZONE: f64 = 0.12;

pub trait WalkWorld {
    /// The ground's height at a point.
    fn height(&self, x: f64, z: f64) -> f64;
    /// Whether a body of radius `r` fits with its centre at (x, z), coming from ground at `from`.
    fn fits(&self, x: f64, z: f64, r: f64, from: f64) -> bool;
    /// A number that changes whenever the world does, so a grid made of it can be kept; 0 for a
    /// world whose grid is made again for each search.
    fn version(&self) -> u64 {
        0
    }
}

/// The largest step up or down between neighbouring points of a way (the island's STEP_UP).
const GRID_STEP_UP: f64 = 0.55;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Walker {
    /// Where it stands, in tiles; y is the ground under it, eased onto a bank or a step.
    pub x: f64,
    pub z: f64,
    pub y: f64,
    /// Facing: 0 looks toward +z, turning counter-clockwise seen from above.
    pub yaw: f64,
    /// Tiles a second it means to go.
    pub speed: f64,
    /// The walk cycle's phase in steps (one step is half a cycle).
    pub phase: f64,
}

impl Walker {
    pub fn new(x: f64, z: f64, y: f64, yaw: f64) -> Walker {
        Walker { x, z, y, yaw, speed: 0.0, phase: 0.0 }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Input {
    /// Where to go, in world axes, length 0..1.
    pub x: f64,
    pub z: f64,
    pub run: bool,
}

fn wrap_angle(a: f64) -> f64 {
    atan2(sin(a), cos(a))
}

/// The facing for a direction of travel (dx, dz).
pub fn yaw_of(dx: f64, dz: f64) -> f64 {
    atan2(dx, dz)
}

/// One step of `dt` seconds.
pub fn step<W: WalkWorld + ?Sized>(w: &Walker, input: &Input, dt: f64, world: &W, r: f64) -> Walker {
    let length = min(1.0, hypot(input.x, input.z));
    let pushing = length > DEADZONE;
    let goal = if pushing { (if input.run { RUN_SPEED } else { WALK_SPEED }) * min(1.0, (length - DEADZONE) / (0.6 - DEADZONE)) } else { 0.0 };
    let mut speed = w.speed + sign(goal - w.speed) * min(abs(goal - w.speed), ACCEL * dt);
    let mut yaw = w.yaw;
    if pushing {
        let want = yaw_of(input.x, input.z);
        let turn = wrap_angle(want - yaw);
        yaw = wrap_angle(yaw + sign(turn) * min(abs(turn), TURN * dt));
    }
    let (mut x, mut z) = (w.x, w.z);
    let ground = world.height(x, z);
    let mut moved = 0.0;
    if speed > 1e-3 {
        // Travel along the stick's direction, so a turn never drags the walker sideways.
        let heading = if pushing { yaw_of(input.x, input.z) } else { yaw };
        let reach = speed * dt;
        let along = |bend: f64| -> (f64, f64) {
            let k = reach * max(0.35, cos(bend));
            (sin(heading + bend) * k, cos(heading + bend) * k)
        };
        let ahead = along(0.0);
        let mut tries: [[(f64, f64); 2]; 7] = [[(0.0, 0.0); 2]; 7];
        let mut counts = [1usize; 7];
        tries[0][0] = ahead;
        tries[1][0] = (ahead.0, 0.0);
        tries[2][0] = (0.0, ahead.1);
        for (k, bend) in [0.45, 0.9, 1.25, PI / 2.0].into_iter().enumerate() {
            tries[3 + k] = [along(bend), along(-bend)];
            counts[3 + k] = 2;
        }
        for (options, &count) in tries.iter().zip(counts.iter()) {
            let mut open = [(0.0, 0.0); 2];
            let mut n = 0;
            for &(dx, dz) in &options[..count] {
                if hypot(dx, dz) > 1e-5 && world.fits(x + dx, z + dz, r, ground) {
                    open[n] = (dx, dz);
                    n += 1;
                }
            }
            if n == 0 {
                continue;
            }
            // Turned either way, go the way with more room: round the obstacle, not into its middle.
            let roomy = if n > 1 { open[..n].iter().find(|(dx, dz)| world.fits(x + dx * 6.0, z + dz * 6.0, r, ground)).copied() } else { None };
            let (dx, dz) = roomy.unwrap_or(open[0]);
            x += dx;
            z += dz;
            moved = hypot(dx, dz);
            break;
        }
        if moved == 0.0 {
            speed = 0.0;
        }
    }
    let height = world.height(x, z);
    // The body rises and settles onto a bank or a step rather than jumping.
    let y = w.y + (height - w.y) * (1.0 - exp(-dt * 18.0));
    Walker { x, z, y: if abs(y - height) < 1e-4 { height } else { y }, yaw, speed, phase: w.phase + moved * STEPS_PER_TILE }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Point {
    pub x: f64,
    pub z: f64,
}

/// Nodes a search may cover: the island's 72 × 60 tiles at half a tile is 17,280.
pub const MAX_NODES: usize = 40_000;
const HEAP: usize = 8 * 20_000 + 64;

/// What a search keeps while it runs. It is large (about 1.4 MB) and reused: a search marks what
/// it touches with its own number instead of clearing it.
pub struct PathScratch {
    cost: [f64; MAX_NODES],
    came: [u32; MAX_NODES],
    seen: [u16; MAX_NODES],
    shut: [u16; MAX_NODES],
    heap: [(f32, u32); HEAP],
    len: usize,
    stamp: u16,
    /// The grid of the world searched: whether a walker fits at each node's middle, and the
    /// ground's height there. Kept while the world's version and the bounds stay the same.
    open: [u8; MAX_NODES],
    height: [f32; MAX_NODES],
    grid: (u64, [f64; 4], usize, usize),
}

impl PathScratch {
    pub const EMPTY: PathScratch = PathScratch {
        cost: [0.0; MAX_NODES],
        came: [0; MAX_NODES],
        seen: [0; MAX_NODES],
        shut: [0; MAX_NODES],
        heap: [(0.0, 0); HEAP],
        len: 0,
        stamp: 0,
        open: [0; MAX_NODES],
        height: [0.0; MAX_NODES],
        grid: (0, [0.0; 4], 0, 0),
    };

    fn begin(&mut self) {
        self.len = 0;
        self.stamp = self.stamp.wrapping_add(1);
        if self.stamp == 0 {
            self.seen.fill(0);
            self.shut.fill(0);
            self.stamp = 1;
        }
    }

    fn push(&mut self, key: f32, node: u32) -> bool {
        if self.len >= HEAP {
            return false;
        }
        let mut i = self.len;
        self.heap[i] = (key, node);
        self.len += 1;
        while i > 0 {
            let parent = (i - 1) >> 1;
            if self.heap[parent].0 <= self.heap[i].0 {
                break;
            }
            self.heap.swap(parent, i);
            i = parent;
        }
        true
    }

    fn pop(&mut self) -> Option<u32> {
        if self.len == 0 {
            return None;
        }
        let top = self.heap[0].1;
        self.len -= 1;
        if self.len > 0 {
            self.heap[0] = self.heap[self.len];
            let mut i = 0;
            loop {
                let (a, b) = (i * 2 + 1, i * 2 + 2);
                let mut m = i;
                if a < self.len && self.heap[a].0 < self.heap[m].0 {
                    m = a;
                }
                if b < self.len && self.heap[b].0 < self.heap[m].0 {
                    m = b;
                }
                if m == i {
                    break;
                }
                self.heap.swap(m, i);
                i = m;
            }
        }
        Some(top)
    }
}

/// A way from `from` to `to` on a grid of `step` tiles inside `bounds` ([x0, z0, x1, z1]): the
/// corners where it turns, written to `out`, ending at `to` or, when nothing stands there, at the
/// nearest place that can be reached. Returns how many corners; None when the walker cannot move.
///
/// The grid's nodes are judged once (whether a walker of radius `r` fits at each, and the ground's
/// height) and kept for as long as the world's version does not change; the search then reads only
/// the grid. A step joins two open nodes within a step's height of each other, and a diagonal step
/// needs both nodes beside it open, so a way never cuts a corner.
#[allow(clippy::too_many_arguments)]
pub fn find_path<W: WalkWorld + ?Sized>(
    world: &W, from: Point, to: Point, bounds: [f64; 4], step: f64, r: f64, limit: usize, scratch: &mut PathScratch, out: &mut [Point],
) -> Option<usize> {
    let [x0, z0, x1, z1] = bounds;
    let cols = max(1.0, floor((x1 - x0) / step)) as usize;
    let rows = max(1.0, floor((z1 - z0) / step)) as usize;
    if cols * rows > MAX_NODES {
        return None;
    }
    let at = |n: usize| Point { x: x0 + ((n % cols) as f64 + 0.5) * step, z: z0 + ((n / cols) as f64 + 0.5) * step };
    let version = world.version();
    if version == 0 || scratch.grid != (version, bounds, cols, rows) {
        for n in 0..cols * rows {
            let p = at(n);
            let h = world.height(p.x, p.z);
            scratch.height[n] = h as f32;
            scratch.open[n] = world.fits(p.x, p.z, r, h) as u8;
        }
        scratch.grid = (version, bounds, cols, rows);
    }
    let node_of = |p: Point| -> usize {
        let c = min(cols as f64 - 1.0, max(0.0, js_round((p.x - x0) / step - 0.5))) as usize;
        let rr = min(rows as f64 - 1.0, max(0.0, js_round((p.z - z0) / step - 0.5))) as usize;
        rr * cols + c
    };
    let guess = |n: usize| {
        let p = at(n);
        hypot(p.x - to.x, p.z - to.z)
    };
    let (start, goal) = (node_of(from), node_of(to));
    scratch.begin();
    let stamp = scratch.stamp;
    scratch.cost[start] = 0.0;
    scratch.came[start] = u32::MAX;
    scratch.seen[start] = stamp;
    scratch.push(0.0, start as u32);
    let (mut best, mut best_guess) = (start, guess(start));
    let mut expanded = 0;
    while expanded < limit {
        let Some(n) = scratch.pop() else { break };
        let n = n as usize;
        if scratch.shut[n] == stamp {
            continue;
        }
        scratch.shut[n] = stamp;
        expanded += 1;
        if n == goal {
            best = n;
            break;
        }
        let h = scratch.height[n] as f64;
        let (c, rr) = ((n % cols) as i64, (n / cols) as i64);
        for dz in -1i64..=1 {
            for dx in -1i64..=1 {
                if dx == 0 && dz == 0 {
                    continue;
                }
                let (nc, nr) = (c + dx, rr + dz);
                if nc < 0 || nr < 0 || nc >= cols as i64 || nr >= rows as i64 {
                    continue;
                }
                let m = nr as usize * cols + nc as usize;
                if scratch.shut[m] == stamp || scratch.open[m] == 0 || abs(scratch.height[m] as f64 - h) > GRID_STEP_UP {
                    continue;
                }
                if dx != 0 && dz != 0 {
                    let (a, b) = (rr as usize * cols + nc as usize, nr as usize * cols + c as usize);
                    if scratch.open[a] == 0 || scratch.open[b] == 0 {
                        continue;
                    }
                }
                let g = scratch.cost[n] + (if dx != 0 && dz != 0 { SQRT_2 } else { 1.0 }) * step;
                if scratch.seen[m] == stamp && g >= scratch.cost[m] {
                    continue;
                }
                scratch.seen[m] = stamp;
                scratch.cost[m] = g;
                scratch.came[m] = n as u32;
                let f = guess(m);
                if f < best_guess {
                    best_guess = f;
                    best = m;
                }
                scratch.push((g + f) as f32, m as u32);
            }
        }
    }
    // The chain from the start to the best node, read backwards.
    let mut chain = [Point::default(); 512];
    let mut len = 0;
    let mut n = best;
    while n != start && scratch.seen[n] == stamp && len < chain.len() {
        chain[len] = at(n);
        len += 1;
        let back = scratch.came[n];
        if back == u32::MAX {
            break;
        }
        n = back as usize;
    }
    chain[..len].reverse();
    if best == goal && len < chain.len() && world.fits(to.x, to.z, r, world.height(to.x, to.z)) {
        chain[len] = to;
        len += 1;
    }
    // Keep only the corners: a point is dropped when the walk past it is clear in a straight line,
    // judged on the grid every half step.
    let grid = &*scratch;
    let clear = |a: Point, b: Point| -> bool {
        let n = ceil(hypot(b.x - a.x, b.z - a.z) / (step / 2.0)) as usize;
        let mut h = grid.height[node_of(a)] as f64;
        for i in 1..=n {
            let t = i as f64 / n as f64;
            let k = node_of(Point { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
            let hk = grid.height[k] as f64;
            if grid.open[k] == 0 || abs(hk - h) > GRID_STEP_UP {
                return false;
            }
            h = hk;
        }
        true
    };
    let mut written = 0;
    let mut anchor = from;
    for i in 0..len {
        if i + 1 < len && clear(anchor, chain[i + 1]) {
            continue;
        }
        if written < out.len() {
            out[written] = chain[i];
            written += 1;
        }
        anchor = chain[i];
    }
    if written > 0 || best != start { Some(written) } else { None }
}
