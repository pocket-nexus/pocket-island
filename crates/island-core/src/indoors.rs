//! Walking in the house (the browser's `src/core/indoors.ts` before it moved here): the room's
//! floor, its walls and its furniture in the way. Rugs are walked over, anything else standing on
//! the floor is not. The front of the room is open toward the camera, but only its doorway lets a
//! walker out: stepping through it is leaving the house.
//!
//! It keeps the room as last committed, each piece with its spec, numbered by its place, so the
//! game can move pieces, take them and put them down by hand (crate::handle) and walk among them as
//! they are at once, before the host commits the room again.

use crate::math::{abs, cos, sin, PI};
use crate::island::circle_hits_rect;
use crate::room::{check, door_rect, footprint, Catalog, Kind, Layer, Placement, Rect, Room, Spec, Verdict};
use crate::walk::{WalkWorld, WALKER_RADIUS};

/// How far past the room's front a walker gets before it has gone out of the door.
pub const DOOR_OUT: f64 = 0.12;
/// Half the doorway's width a walker's centre may use.
const DOOR_HALF: f64 = 0.42;
pub const MAX_OBSTACLES: usize = 160;
/// Pieces the room keeps, at most: all a room may hold (`room::ITEM_LIMIT`), and a few over.
pub const MAX_PIECES: usize = 160;
const _: () = assert!(MAX_PIECES >= crate::room::ITEM_LIMIT);
/// A piece taken out of the room until the host commits it again: an item no spec is for.
const GONE: u32 = u32::MAX;
const NO_PIECE: Placement = Placement { item: GONE, variant: 0, layer: Layer::Floor, x: 0.0, z: 0.0, rot: 0, wall: None, u: 0.0, v: 0.0, host: None };
const NO_SPEC: Spec = Spec { kind: Kind::Floor, size: [0.0, 0.0], surface: None, surface_y: 0.0, hang: 0.0, code: 0 };

/// The room as a world to walk in: its size and the footprints of what stands on its floor.
pub struct RoomWorld {
    pub w: f64,
    pub d: f64,
    blocks: [Rect; MAX_OBSTACLES],
    count: usize,
    /// The rugs' footprints: walked on, and heard underfoot.
    rugs: [Rect; MAX_RUGS],
    rug_count: usize,
    /// The pieces, each `item` its own place (into `specs`), and what each is.
    pieces: [Placement; MAX_PIECES],
    specs: [Spec; MAX_PIECES],
    piece_count: usize,
}

/// Rugs a room's walking world keeps, at most.
pub const MAX_RUGS: usize = 24;

impl RoomWorld {
    pub const EMPTY: RoomWorld = RoomWorld {
        w: 0.0,
        d: 0.0,
        blocks: [[0.0; 4]; MAX_OBSTACLES],
        count: 0,
        rugs: [[0.0; 4]; MAX_RUGS],
        rug_count: 0,
        pieces: [NO_PIECE; MAX_PIECES],
        specs: [NO_SPEC; MAX_PIECES],
        piece_count: 0,
    };

    /// The room as committed: its pieces, with the floor items' footprints in the way (rugs and
    /// tabletop things aside).
    pub fn set(&mut self, room: &Room, catalog: Catalog) {
        self.w = room.w;
        self.d = room.d;
        self.piece_count = room.items.len().min(MAX_PIECES);
        for (k, p) in room.items[..self.piece_count].iter().enumerate() {
            let spec = catalog.get(p.item as usize);
            self.pieces[k] = Placement { item: if spec.is_some() { k as u32 } else { GONE }, ..*p };
            self.specs[k] = spec.copied().unwrap_or(NO_SPEC);
        }
        self.rebuild();
    }

    /// What stands in the way and what is underfoot, from the pieces.
    fn rebuild(&mut self) {
        self.count = 0;
        self.rug_count = 0;
        let room = Room { w: self.w, d: self.d, items: &self.pieces[..self.piece_count] };
        let catalog = &self.specs[..self.piece_count];
        for p in room.items {
            if p.layer == Layer::Rug && self.rug_count < MAX_RUGS {
                if let Some(r) = footprint(&room, catalog, p) {
                    self.rugs[self.rug_count] = r;
                    self.rug_count += 1;
                }
            }
            if p.layer != Layer::Floor || self.count >= MAX_OBSTACLES {
                continue;
            }
            if let Some(r) = footprint(&room, catalog, p) {
                self.blocks[self.count] = r;
                self.count += 1;
            }
        }
    }

    /// The pieces as they stand now, as a room for the rules (each piece's item is its own place in `catalog`).
    pub fn room(&self) -> Room<'_> {
        Room { w: self.w, d: self.d, items: &self.pieces[..self.piece_count] }
    }

    pub fn catalog(&self) -> Catalog<'_> {
        &self.specs[..self.piece_count]
    }

    /// How many places there are (a taken piece keeps its place until the room is committed again).
    pub fn len(&self) -> usize {
        self.piece_count
    }

    pub fn is_empty(&self) -> bool {
        self.piece_count == 0
    }

    /// Piece `k`, unless it was taken.
    pub fn piece(&self, k: usize) -> Option<&Placement> {
        self.pieces[..self.piece_count].get(k).filter(|p| p.item != GONE)
    }

    pub fn spec(&self, k: usize) -> Option<&Spec> {
        self.piece(k).map(|_| &self.specs[k])
    }

    /// Piece `k` where `p` says (what stands on it goes with it).
    pub fn set_piece(&mut self, k: usize, p: Placement) {
        if self.piece(k).is_some() {
            self.pieces[k] = Placement { item: k as u32, ..p };
            self.rebuild();
        }
    }

    /// Piece `k` out of the room.
    pub fn take(&mut self, k: usize) {
        if k < self.piece_count {
            self.pieces[k].item = GONE;
            self.rebuild();
        }
    }

    /// A piece of `spec` into the room as `p` says, at the end; its place, or None when the room keeps no more.
    pub fn add(&mut self, p: Placement, spec: Spec) -> Option<usize> {
        let k = self.piece_count;
        if k >= MAX_PIECES {
            return None;
        }
        self.pieces[k] = Placement { item: k as u32, ..p };
        self.specs[k] = spec;
        self.piece_count += 1;
        self.rebuild();
        Some(k)
    }

    /// Whether a piece of `spec` added as `p` (its host, on a table, by place) may stand there.
    pub fn check_added(&mut self, p: &Placement, spec: &Spec) -> Verdict {
        let k = self.piece_count;
        if k >= MAX_PIECES {
            return Verdict::No { reason: crate::room::Reason::Limit, with: None };
        }
        // The new piece's spec in the next place, for the rules to read; it is not in the room.
        self.specs[k] = *spec;
        let room = Room { w: self.w, d: self.d, items: &self.pieces[..k] };
        check(&room, &self.specs[..k + 1], &Placement { item: k as u32, ..*p }, None, &|_| false)
    }

    /// Whether a walker fits at (x, z) with piece `k` standing as `p` says.
    pub fn fits_with(&mut self, k: usize, p: &Placement, x: f64, z: f64) -> bool {
        let Some(was) = self.piece(k).copied() else { return false };
        self.pieces[k] = Placement { item: k as u32, ..*p };
        self.rebuild();
        let fits = self.fits(x, z, WALKER_RADIUS, 0.0);
        self.pieces[k] = was;
        self.rebuild();
        fits
    }

    /// Whether (x, z) is on a rug.
    pub fn on_rug(&self, x: f64, z: f64) -> bool {
        self.rugs[..self.rug_count].iter().any(|r| x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3])
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
