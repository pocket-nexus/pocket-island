//! The island's map and its rules (the browser's `src/core/island.ts` queries before they moved
//! here): how high the ground is anywhere, whether a body fits, and the door. The map itself is
//! made by the recipe in `src/core/island.ts` when the island is authored and handed over as data:
//! tiers and ground a byte a tile, the inclines, bridges, the house, the shop's stall, and the props
//! in the way.
//!
//! Everything is in fixed storage (no heap), so the console keeps it in its program's data.

use crate::math::{abs, cos, floor, hypot, sin};
use crate::walk::WalkWorld;

pub const MAX_W: usize = 128;
pub const MAX_D: usize = 128;
pub const MAX_TILES: usize = MAX_W * MAX_D;
pub const MAX_RAMPS: usize = 16;
pub const MAX_BRIDGES: usize = 16;
pub const MAX_PROPS: usize = 1024;

/// What covers a tile.
pub const SEA: u8 = 0;
pub const SAND: u8 = 1;
pub const GRASS: u8 = 2;
pub const PATH: u8 = 3;
pub const WATER: u8 = 4;

/// The ground's height on each tier: 0 the beach, 1 the island's floor, 2 and 3 the cliff tops.
pub const TIER_Y: [f64; 4] = [0.0, 0.5, 1.5, 2.5];
pub const SEA_LEVEL: f64 = -0.22;
pub const WATER_DROP: f64 = 0.3;
/// The largest step a walker takes up or down without an incline (the beach's bank).
pub const STEP_UP: f64 = 0.55;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Dir {
    N = 0,
    S = 1,
    E = 2,
    W = 3,
}

/// An incline: a rectangle of the lower tier whose ground rises toward `up`.
#[derive(Clone, Copy, Debug)]
pub struct Ramp {
    pub rect: [f64; 4],
    pub up: Dir,
    pub low: f64,
    pub high: f64,
}

/// A bridge: a deck at height `y` over its rectangle.
#[derive(Clone, Copy, Debug)]
pub struct Bridge {
    pub rect: [f64; 4],
    pub y: f64,
}

/// Something in the way: a trunk, a rock, a lamp.
#[derive(Clone, Copy, Debug)]
pub struct Prop {
    pub x: f64,
    pub z: f64,
    pub radius: f64,
}

pub struct IslandMap {
    pub w: usize,
    pub d: usize,
    pub tier: [u8; MAX_TILES],
    pub ground: [u8; MAX_TILES],
    pub ramps: [Ramp; MAX_RAMPS],
    pub ramp_count: usize,
    pub bridges: [Bridge; MAX_BRIDGES],
    pub bridge_count: usize,
    /// The house's footprint and its door, in the middle of its front (+z) wall.
    pub house: [f64; 4],
    pub door: [f64; 2],
    /// The shop's stall (in the way, as the house), and where its keeper stands behind the counter
    /// and which way they face the customer; none until `set_shop`.
    pub shop: [f64; 4],
    pub keeper: [f64; 3],
    pub has_shop: bool,
    pub props: [Prop; MAX_PROPS],
    pub prop_count: usize,
    /// Changes with every change to the map (a way's grid is kept while it stays).
    pub version: u64,
    /// The props by tile: the first prop standing on each tile, and the next on the same tile.
    first: [i16; MAX_TILES],
    next: [i16; MAX_PROPS],
}

const NO_RAMP: Ramp = Ramp { rect: [0.0; 4], up: Dir::N, low: 0.0, high: 0.0 };
const NO_BRIDGE: Bridge = Bridge { rect: [0.0; 4], y: 0.0 };
const NO_PROP: Prop = Prop { x: 0.0, z: 0.0, radius: 0.0 };

impl IslandMap {
    pub const EMPTY: IslandMap = IslandMap {
        w: 0,
        d: 0,
        tier: [0; MAX_TILES],
        ground: [0; MAX_TILES],
        ramps: [NO_RAMP; MAX_RAMPS],
        ramp_count: 0,
        bridges: [NO_BRIDGE; MAX_BRIDGES],
        bridge_count: 0,
        house: [0.0; 4],
        door: [0.0; 2],
        shop: [0.0; 4],
        keeper: [0.0; 3],
        has_shop: false,
        props: [NO_PROP; MAX_PROPS],
        prop_count: 0,
        version: 0,
        // Filled with -1 by `reset`: a zeroed table keeps the program's data small.
        first: [0; MAX_TILES],
        next: [0; MAX_PROPS],
    };

    /// Start a map of `w` × `d` tiles, all sea. False when it is larger than the core holds.
    pub fn reset(&mut self, w: usize, d: usize) -> bool {
        self.version += 1;
        if w == 0 || d == 0 || w > MAX_W || d > MAX_D {
            return false;
        }
        self.w = w;
        self.d = d;
        self.tier[..w * d].fill(0);
        self.ground[..w * d].fill(SEA);
        self.ramp_count = 0;
        self.bridge_count = 0;
        self.prop_count = 0;
        self.has_shop = false;
        self.first[..w * d].fill(-1);
        true
    }

    pub fn add_ramp(&mut self, r: Ramp) -> bool {
        self.version += 1;
        if self.ramp_count >= MAX_RAMPS {
            return false;
        }
        self.ramps[self.ramp_count] = r;
        self.ramp_count += 1;
        true
    }

    pub fn add_bridge(&mut self, b: Bridge) -> bool {
        self.version += 1;
        if self.bridge_count >= MAX_BRIDGES {
            return false;
        }
        self.bridges[self.bridge_count] = b;
        self.bridge_count += 1;
        true
    }

    /// A prop in the way (radius above 0); filed by the tile it stands on.
    pub fn add_prop(&mut self, p: Prop) -> bool {
        self.version += 1;
        if self.prop_count >= MAX_PROPS || p.radius <= 0.0 {
            return false;
        }
        let k = self.prop_count;
        self.props[k] = p;
        self.next[k] = -1;
        let (i, j) = (floor(p.x) as i64, floor(p.z) as i64);
        if self.in_map(i, j) {
            let t = self.index(i, j);
            self.next[k] = self.first[t];
            self.first[t] = k as i16;
        }
        self.prop_count += 1;
        true
    }

    pub fn in_map(&self, i: i64, j: i64) -> bool {
        i >= 0 && j >= 0 && (i as usize) < self.w && (j as usize) < self.d
    }

    fn index(&self, i: i64, j: i64) -> usize {
        j as usize * self.w + i as usize
    }

    pub fn tier_at(&self, i: i64, j: i64) -> u8 {
        if self.in_map(i, j) { self.tier[self.index(i, j)] } else { 0 }
    }

    pub fn ground_at(&self, i: i64, j: i64) -> u8 {
        if self.in_map(i, j) { self.ground[self.index(i, j)] } else { SEA }
    }

    /// The surface of the water on a wet tile: the sea's, or a river's below its banks.
    pub fn water_level(&self, i: i64, j: i64) -> f64 {
        let t = self.tier_at(i, j);
        if self.ground_at(i, j) == SEA || t == 0 { SEA_LEVEL } else { TIER_Y[t as usize] - WATER_DROP }
    }

    pub fn ramp_at(&self, x: f64, z: f64) -> Option<&Ramp> {
        self.ramps[..self.ramp_count].iter().find(|r| inside_rect(&r.rect, x, z))
    }

    pub fn bridge_at(&self, x: f64, z: f64) -> Option<&Bridge> {
        self.bridges[..self.bridge_count].iter().find(|b| inside_rect(&b.rect, x, z))
    }

    /// The ground's height where a walker would stand: a bridge's deck, an incline, a tier, or water.
    pub fn height_at(&self, x: f64, z: f64) -> f64 {
        if let Some(b) = self.bridge_at(x, z) {
            return b.y;
        }
        if let Some(r) = self.ramp_at(x, z) {
            return r.low + (r.high - r.low) * ramp_rise(r, x, z);
        }
        let (i, j) = (floor(x) as i64, floor(z) as i64);
        if is_wet(self.ground_at(i, j)) {
            return self.water_level(i, j);
        }
        TIER_Y[self.tier_at(i, j) as usize]
    }

    /// Whether a point is ground to stand on: not the sea or a river, unless a bridge spans it.
    pub fn standable(&self, x: f64, z: f64) -> bool {
        if x < 0.0 || z < 0.0 || x >= self.w as f64 || z >= self.d as f64 {
            return false;
        }
        if self.bridge_at(x, z).is_some() {
            return true;
        }
        !is_wet(self.ground_at(floor(x) as i64, floor(z) as i64))
    }

    /// Whether a body of radius `r` fits at (x, z), coming from ground at height `from`: its
    /// middle and eight points round its edge stand on dry ground within a step of `from`, and it
    /// touches neither the house nor a prop.
    pub fn fits(&self, x: f64, z: f64, r: f64, from: f64) -> bool {
        let ring = RING.iter().map(|&(c, s)| (x + c * r, z + s * r));
        for (px, pz) in ring.chain(core::iter::once((x, z))) {
            if !self.standable(px, pz) || abs(self.height_at(px, pz) - from) > STEP_UP {
                return false;
            }
        }
        if circle_hits_rect(x, z, r, &self.house) || (self.has_shop && circle_hits_rect(x, z, r, &self.shop)) {
            return false;
        }
        let (i0, j0) = (floor(x) as i64, floor(z) as i64);
        for j in j0 - 1..=j0 + 1 {
            for i in i0 - 1..=i0 + 1 {
                if !self.in_map(i, j) {
                    continue;
                }
                let mut k = self.first[self.index(i, j)];
                while k >= 0 {
                    let p = &self.props[k as usize];
                    let reach = r + p.radius;
                    if (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < reach * reach {
                        return false;
                    }
                    k = self.next[k as usize];
                }
            }
        }
        true
    }

    /// The rectangle in front of the door where a walker stands to go in.
    pub fn doorstep(&self) -> [f64; 4] {
        [self.door[0] - 0.6, self.door[1], self.door[0] + 0.6, self.door[1] + 0.9]
    }

    /// Whether a walker at (x, z) facing `yaw` is at the door and facing it (facing -z).
    pub fn at_door(&self, x: f64, z: f64, yaw: f64) -> bool {
        inside_rect(&self.doorstep(), x, z) && cos(yaw) < -0.5
    }

    /// The shop's stall over `rect`, its keeper at (x, z) facing `yaw` (toward the customer).
    pub fn set_shop(&mut self, rect: [f64; 4], x: f64, z: f64, yaw: f64) {
        self.version += 1;
        self.shop = rect;
        self.keeper = [x, z, yaw];
        self.has_shop = true;
    }

    /// Whether a walker at (x, z) facing `yaw` stands at the shop's counter facing its keeper: in
    /// front of them, within reach of the counter, and turned toward them.
    pub fn at_shop(&self, x: f64, z: f64, yaw: f64) -> bool {
        if !self.has_shop {
            return false;
        }
        let [kx, kz, ky] = self.keeper;
        let (fx, fz) = (sin(ky), cos(ky));
        let (dx, dz) = (x - kx, z - kz);
        let ahead = dx * fx + dz * fz;
        let aside = abs(dx * fz - dz * fx);
        // Facing the keeper: the walker's facing against the way from them to the keeper.
        let d = hypot(dx, dz).max(1e-6);
        let toward = -(sin(yaw) * dx + cos(yaw) * dz) / d;
        (0.5..=2.3).contains(&ahead) && aside < 1.4 && toward > 0.55
    }
}

impl WalkWorld for IslandMap {
    fn height(&self, x: f64, z: f64) -> f64 {
        self.height_at(x, z)
    }
    fn fits(&self, x: f64, z: f64, r: f64, from: f64) -> bool {
        IslandMap::fits(self, x, z, r, from)
    }
    fn version(&self) -> u64 {
        // The tiles are written through a pointer (ffi), which the version cannot see: a host
        // resets the map before writing them, and that counts.
        self.version
    }
}

/// The cosine and sine of each eighth of a turn, as JavaScript's Math gives them (worked out once:
/// a trigonometric call is dear on a handheld, and `fits` runs thousands of times for a way). They
/// are JavaScript's values to the last bit, not the nearest constants.
#[allow(clippy::approx_constant)]
const RING: [(f64, f64); 8] = [
    (1.0, 0.0),
    (0.7071067811865476, 0.7071067811865475),
    (6.123233995736766e-17, 1.0),
    (-0.7071067811865475, 0.7071067811865476),
    (-1.0, 1.2246467991473532e-16),
    (-0.7071067811865477, -0.7071067811865475),
    (-1.8369701987210297e-16, -1.0),
    (0.7071067811865474, -0.7071067811865477),
];

pub fn is_wet(g: u8) -> bool {
    g == SEA || g == WATER
}

pub fn inside_rect(r: &[f64; 4], x: f64, z: f64) -> bool {
    x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]
}

pub fn circle_hits_rect(x: f64, z: f64, r: f64, rect: &[f64; 4]) -> bool {
    let cx = rect[0].max(x.min(rect[2]));
    let cz = rect[1].max(z.min(rect[3]));
    (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r
}

/// How far up an incline a point is, 0 at its foot and 1 at its top.
pub fn ramp_rise(r: &Ramp, x: f64, z: f64) -> f64 {
    let [x0, z0, x1, z1] = r.rect;
    let t = match r.up {
        Dir::N => (z1 - z) / (z1 - z0),
        Dir::S => (z - z0) / (z1 - z0),
        Dir::E => (x - x0) / (x1 - x0),
        Dir::W => (x1 - x) / (x1 - x0),
    };
    t.clamp(0.0, 1.0)
}
