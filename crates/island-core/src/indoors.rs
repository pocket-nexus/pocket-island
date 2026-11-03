//! Walking in the house (the browser's `src/core/indoors.ts` before it moved here): the room's
//! floor, its walls and its furniture in the way. Rugs are walked over, anything else standing on
//! the floor is not. The front of the room is open toward the camera, but only its doorway lets a
//! walker out: stepping through it is leaving the house.

use crate::math::{abs, cos, sin, PI};
use crate::room::{door_rect, footprint, Catalog, Layer, Rect, Room};
use crate::walk::{WalkWorld, WALKER_RADIUS};

/// How far past the room's front a walker gets before it has gone out of the door.
pub const DOOR_OUT: f64 = 0.12;
/// Half the doorway's width a walker's centre may use.
const DOOR_HALF: f64 = 0.42;
pub const MAX_OBSTACLES: usize = 160;

fn circle_hits_rect(x: f64, z: f64, r: f64, rect: &Rect) -> bool {
    let cx = rect[0].max(x.min(rect[2]));
    let cz = rect[1].max(z.min(rect[3]));
    (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r
}

/// The room as a world to walk in: its size and the footprints of what stands on its floor.
pub struct RoomWorld {
    pub w: f64,
    pub d: f64,
    blocks: [Rect; MAX_OBSTACLES],
    count: usize,
}

impl RoomWorld {
    pub const EMPTY: RoomWorld = RoomWorld { w: 0.0, d: 0.0, blocks: [[0.0; 4]; MAX_OBSTACLES], count: 0 };

    /// The room's floor items' footprints, rugs and tabletop things aside.
    pub fn set(&mut self, room: &Room, catalog: Catalog) {
        self.w = room.w;
        self.d = room.d;
        self.count = 0;
        for p in room.items {
            if p.layer != Layer::Floor || self.count >= MAX_OBSTACLES {
                continue;
            }
            if let Some(r) = footprint(room, catalog, p) {
                self.blocks[self.count] = r;
                self.count += 1;
            }
        }
    }

    fn door_x(&self) -> f64 {
        let door = door_rect(self.w, self.d);
        (door[0] + door[2]) / 2.0
    }

    /// Whether a walker at (x, z) has stepped out through the doorway.
    pub fn out_of_door(&self, x: f64, z: f64) -> bool {
        z > self.d + DOOR_OUT * 0.5 && abs(x - self.door_x()) <= DOOR_HALF + 1e-6
    }

    /// Where a walker comes in: just inside the doorway, facing in.
    pub fn entrance(&self) -> (f64, f64, f64) {
        (self.door_x(), self.d - 0.45, PI)
    }

    /// The nearest place to (x, z) a walker fits, searching outward in rings.
    pub fn nearest_free(&self, x: f64, z: f64) -> (f64, f64) {
        let r = WALKER_RADIUS;
        if self.fits(x, z, r, 0.0) {
            return (x, z);
        }
        for ring in 1..=40 {
            let reach = ring as f64 * 0.25;
            let steps = (ring * 6).max(8);
            for k in 0..steps {
                let a = (k as f64 / steps as f64) * PI * 2.0;
                let (px, pz) = (x + cos(a) * reach, z + sin(a) * reach);
                if pz <= self.d - r && self.fits(px, pz, r, 0.0) {
                    return (px, pz);
                }
            }
        }
        let (ex, ez, _) = self.entrance();
        (ex, ez)
    }
}

impl WalkWorld for RoomWorld {
    fn height(&self, _x: f64, _z: f64) -> f64 {
        0.0
    }

    fn fits(&self, x: f64, z: f64, r: f64, _from: f64) -> bool {
        if x < r || x > self.w - r || z < r {
            return false;
        }
        // The front is closed but for the doorway.
        if z > self.d - r && (abs(x - self.door_x()) > DOOR_HALF || z > self.d + DOOR_OUT + r) {
            return false;
        }
        !self.blocks[..self.count].iter().any(|b| circle_hits_rect(x, z, r, b))
    }
}
