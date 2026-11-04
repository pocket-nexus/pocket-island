//! The room's furniture handled by hand, outside the editor, as on the island games. In the house
//! the player holds A at a piece standing on the floor to take hold of it; then the stick toward the
//! piece pushes it away, away from it pulls it (the player stepping back with it), and to either side
//! turns it a quarter in place: half a tile or a turn at a time, as the room's rules let it
//! (crate::room), the player moving with it. A short press that moves nothing is a tap (the host
//! switches a lamp with it). Y picks up what is just ahead into the pockets: what stands on a table
//! first, then the table; what hangs on the wall faced; a rug underfoot. A piece in the pockets is put
//! down in front of the player, facing them: on a table ahead when it is small enough to stand on
//! one, on the wall faced when it hangs, under the player when it is a rug. What hangs from the
//! ceiling is the editor's alone.
//!
//! The room is the host's (its editor's state): each change is said as a `Change` for the host to
//! make there and commit again, and the game's copy of the room (`RoomWorld`) has it at once.

use crate::game::{Events, Game, Place};
use crate::island::circle_hits_rect;
use crate::math::{abs, atan2, cos, hypot, max, min, sin};
use crate::room::{add_rot, check, clamp_axis, footprint, rect_at, snap_axis, snap_in, surface_at, turned, wall_length, Kind, Layer, Placement, Side, Spec, Verdict, WALL_HEIGHT};
use crate::things::{hint, item, Outcome, Press, Slot};
use crate::walk::WALKER_RADIUS;

/// A move: half a tile or a quarter turn, taking `SLIDE` seconds, the player eased along it as the
/// renderers ease a piece toward where it goes, with the time constant `EASE` (src/scene/view.ts
/// PIECE_EASE, scene.c HANDLE_EASE).
const STEP: f64 = 0.5;
const SLIDE: f64 = 0.25;
pub const EASE: f64 = 0.055;
/// How far ahead the hands reach, and how near that a piece must come to be in reach.
const REACH: f64 = 0.7;
const NEAR: f64 = 0.3;
/// A press of A shorter than this that moved nothing is a tap.
const TAP: f64 = 0.25;
/// Seconds the player bends to pick something up or put it down; and waits after a move the room
/// refused before trying it again.
pub const BEND: f64 = 0.42;
const BUMP: f64 = 0.35;
/// A piece is put down this far clear of the player, and hung from as far as this from its wall.
const CLEAR: f64 = 0.06;
const WALL_NEAR: f64 = 1.2;
/// Where a piece that hangs is first hung, when its spec does not say.
const HANG: f64 = 1.5;

/// Why a piece in the pockets cannot be put down, beyond the room's own reasons (room::Reason, 1
/// to 13): returned by `Game::put` (0 when it was).
pub mod refusal {
    /// The pocket holds no piece of furniture, or another than the one named.
    pub const NOT_FURNITURE: u32 = 20;
    /// Not in the house, or in the middle of something.
    pub const BUSY: u32 = 21;
    /// A piece that hangs needs a wall just ahead.
    pub const NO_WALL: u32 = 22;
    /// A piece that hangs from the ceiling is put up in the editor.
    pub const CEILING: u32 = 23;
}

/// What the player has hold of.
#[derive(Clone, Copy, Debug)]
pub struct Hold {
    /// The piece, by its place in the room.
    pub index: usize,
    /// The way the player faces it: 0 the back wall (-z), 1 right (+x), 2 the front (+z), 3 left (-x).
    pub dir: u8,
    /// Whether anything has moved since A went down.
    moved: bool,
    /// The move under way: seconds of it left, and where the player is going.
    slide: f64,
    to: (f64, f64),
    /// After a move the room refused, seconds before another is tried.
    wait: f64,
    /// Pushing (1), pulling (-1) or neither, for the pose.
    pub lean: i8,
}

/// What the player did to the room, for the host to do to its own.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Change {
    #[default]
    None,
    /// Piece `index` stands at (x, z), turned `rot`.
    Moved { index: usize, x: f64, z: f64, rot: u8 },
    /// Piece `index` went into the pockets.
    Taken { index: usize },
    /// A piece came out of the pockets to stand as `p` says (its host, when on a table, by index).
    Put(Placement),
}

/// Of the four ways, the nearest to `yaw` (facing (sin yaw, cos yaw)).
fn dir_of(yaw: f64) -> u8 {
    let (fx, fz) = (sin(yaw), cos(yaw));
    if abs(fx) > abs(fz) {
        if fx > 0.0 { 1 } else { 3 }
    } else if fz > 0.0 {
        2
    } else {
        0
    }
}

/// The way `dir` goes, in tiles.
fn way(dir: u8) -> (f64, f64) {
    [(0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0)][(dir % 4) as usize]
}

fn yaw_of(dir: u8) -> f64 {
    let (x, z) = way(dir);
    atan2(x, z)
}

/// How far (x, z) is from the rectangle (0 inside it).
fn distance_to(r: &[f64; 4], x: f64, z: f64) -> f64 {
    hypot(max(max(r[0] - x, 0.0), x - r[2]), max(max(r[1] - z, 0.0), z - r[3]))
}

enum Move {
    Push,
    Pull,
    Turn(i32),
}

impl Game {
    /// A going down (`on`) or up. Down, in the house, takes hold of the piece on the floor just ahead
    /// (the player turns square to it) and returns its index, or -1. Up lets go, and returns the index
    /// of what is just ahead when the press was a tap that moved nothing (for the host to switch), or -1.
    pub fn grab(&mut self, on: bool) -> i32 {
        if on {
            self.pressing = Some(0.0);
            if self.place != Place::House || self.passing.is_some() || self.hold.is_some() || self.bend > 0.0 {
                return -1;
            }
            let Some(index) = self.piece_ahead(|p| p.layer == Layer::Floor) else { return -1 };
            self.goal = None;
            let dir = dir_of(self.walker.yaw);
            self.walker.yaw = yaw_of(dir);
            self.walker.speed = 0.0;
            self.hold = Some(Hold { index, dir, moved: false, slide: 0.0, to: (self.walker.x, self.walker.z), wait: 0.0, lean: 0 });
            return index as i32;
        }
        let pressed = self.pressing.take();
        let moved = self.hold.is_some_and(|h| h.moved);
        if let Some(h) = self.hold.take() {
            // Let go in the middle of a move: the player ends it where it was going.
            if h.slide > 0.0 {
                (self.walker.x, self.walker.z) = h.to;
            }
            self.walker.speed = 0.0;
        }
        let tap = pressed.is_some_and(|t| t < TAP) && !moved && self.place == Place::House;
        if !tap {
            return -1;
        }
        // What stands on a table before the table, as for picking up.
        self.piece_ahead(|p| p.layer == Layer::Surface)
            .or_else(|| self.piece_ahead(|p| matches!(p.layer, Layer::Floor | Layer::Wall)))
            .map_or(-1, |k| k as i32)
    }

    /// The piece just ahead of the player of those `wanted`: the nearest whose footprint comes within
    /// reach of the hands, in front of the player. A piece on a wall has no footprint: see `on_wall_ahead`.
    fn piece_ahead(&self, wanted: impl Fn(&Placement) -> bool) -> Option<usize> {
        let w = self.walker;
        let (fx, fz) = (sin(w.yaw), cos(w.yaw));
        let (ax, az) = (w.x + fx * REACH, w.z + fz * REACH);
        let room = self.room.room();
        let mut best: Option<(usize, f64)> = None;
        for k in 0..self.room.len() {
            let Some(p) = self.room.piece(k) else { continue };
            if p.layer == Layer::Wall {
                if wanted(p) && self.on_wall_ahead(k) {
                    return Some(k);
                }
                continue;
            }
            if !wanted(p) {
                continue;
            }
            let Some(r) = footprint(&room, self.room.catalog(), p) else { continue };
            // The near side of it, ahead of the player and not beside or behind them.
            let (nx, nz) = (min(max(w.x, r[0]), r[2]), min(max(w.z, r[1]), r[3]));
            let d = distance_to(&r, ax, az);
            if d <= NEAR && (nx - w.x) * fx + (nz - w.z) * fz > 0.0 && best.is_none_or(|(_, b)| d < b) {
                best = Some((k, d));
            }
        }
        best.map(|(k, _)| k)
    }

    /// The wall the player faces, near it: which, where along it they stand, and how far off it they are.
    fn wall_ahead(&self) -> Option<(Side, f64)> {
        let w = self.walker;
        let (side, u, off) = match dir_of(w.yaw) {
            0 => (Side::Back, w.x, w.z),
            3 => (Side::Left, w.z, w.x),
            1 => (Side::Right, w.z, self.room.w - w.x),
            _ => return None,
        };
        (off <= WALL_NEAR).then_some((side, u))
    }

    /// Whether piece `k` hangs on the wall the player faces, in front of them.
    fn on_wall_ahead(&self, k: usize) -> bool {
        let (Some(p), Some(spec)) = (self.room.piece(k), self.room.spec(k)) else { return false };
        let Some((side, u)) = self.wall_ahead() else { return false };
        p.wall == Some(side) && abs(p.u - u) <= spec.size[0] / 2.0 + 0.2
    }

    /// What A (`Press::Use`, or the browser's key) or Y (`Press::Pick`) would do in the house now
    /// (things::hint): take hold of the piece ahead, or pick up what is ahead.
    pub(crate) fn house_hint(&self, press: Press) -> u8 {
        if self.passing.is_some() || self.hold.is_some() || self.bend > 0.0 {
            return hint::NONE;
        }
        if press == Press::Pick {
            let carried = self.lift_target().and_then(|k| self.room.spec(k)).is_some_and(|s| s.code != 0);
            return if carried { hint::LIFT } else { hint::NONE };
        }
        if self.piece_ahead(|p| p.layer == Layer::Floor).is_some() { hint::GRAB } else { hint::NONE }
    }

    /// What Y would pick up: what stands on a table ahead (or on the table ahead: what is nearest the
    /// hands), the piece ahead on the floor, what hangs on the wall ahead, the rug underfoot.
    fn lift_target(&self) -> Option<usize> {
        if let Some(k) = self.piece_ahead(|p| p.layer == Layer::Surface) {
            return Some(k);
        }
        if let Some(k) = self.piece_ahead(|p| p.layer == Layer::Floor) {
            return Some(self.top_of(k).unwrap_or(k));
        }
        if let Some(k) = self.piece_ahead(|p| p.layer == Layer::Wall) {
            return Some(k);
        }
        let (x, z) = (self.walker.x, self.walker.z);
        let room = self.room.room();
        (0..self.room.len()).rev().find(|&k| {
            self.room.piece(k).is_some_and(|p| p.layer == Layer::Rug && footprint(&room, self.room.catalog(), p).is_some_and(|r| distance_to(&r, x, z) == 0.0))
        })
    }

    /// Of what stands on piece `k`, the nearest the player's hands.
    fn top_of(&self, k: usize) -> Option<usize> {
        let w = self.walker;
        let (ax, az) = (w.x + sin(w.yaw) * REACH, w.z + cos(w.yaw) * REACH);
        let room = self.room.room();
        let mut best: Option<(usize, f64)> = None;
        for j in 0..self.room.len() {
            let Some(p) = self.room.piece(j) else { continue };
            if p.layer != Layer::Surface || p.host != Some(k as u32) {
                continue;
            }
            let Some(r) = footprint(&room, self.room.catalog(), p) else { continue };
            let d = distance_to(&r, ax, az);
            if best.is_none_or(|(_, b)| d < b) {
                best = Some((j, d));
            }
        }
        best.map(|(j, _)| j)
    }

    /// Y in the house: what is just ahead into the pockets. Returns the outcome (things::Outcome
    /// `GOT`, or `FULL` when there is no pocket for it) with `Events::ROOM`; 0 when there is nothing.
    pub fn pick_up(&mut self) -> u32 {
        if self.place != Place::House || self.passing.is_some() || self.hold.is_some() || self.bend > 0.0 {
            return 0;
        }
        let Some(k) = self.lift_target() else { return 0 };
        let (Some(p), Some(spec)) = (self.room.piece(k).copied(), self.room.spec(k).copied()) else { return 0 };
        let id = item::furniture(spec.code, p.variant);
        if id == 0 {
            return 0;
        }
        self.goal = None;
        self.things.got = Slot { item: id, count: 1, uses: 0 };
        if !self.things.pockets_have_room(id) {
            return Outcome::FULL;
        }
        self.things.give(id, 1);
        self.room.take(k);
        self.change = Change::Taken { index: k };
        self.bend = BEND;
        Outcome::GOT | Events::ROOM
    }

    /// The piece of furniture in pocket `slot`, whose spec is `spec`, put down in front of the player.
    /// Returns 0 when it was (the room's change is `Change::Put`), or why not: a room::Reason, or a
    /// `refusal`.
    pub fn put(&mut self, slot: usize, spec: &Spec) -> u32 {
        if self.place != Place::House || self.passing.is_some() || self.hold.is_some() || self.bend > 0.0 {
            return refusal::BUSY;
        }
        let Some(s) = self.things.open().get(slot).copied() else { return refusal::NOT_FURNITURE };
        match item::furniture_of(s.item) {
            Some((code, variant)) if code == spec.code && code != 0 => match self.put_down(spec, variant) {
                Ok(p) => {
                    self.things.open_mut()[slot] = crate::things::NO_SLOT;
                    self.room.add(p, *spec);
                    self.change = Change::Put(p);
                    self.goal = None;
                    self.bend = BEND;
                    0
                }
                Err(why) => why,
            },
            _ => refusal::NOT_FURNITURE,
        }
    }

    /// Where a piece of `spec` in look `variant` goes down in front of the player, or why it cannot.
    fn put_down(&mut self, spec: &Spec, variant: u8) -> Result<Placement, u32> {
        let w = self.walker;
        let dir = dir_of(w.yaw);
        let (fx, fz) = way(dir);
        let (rx, rz) = (-fz, fx);
        // Facing the player: turned as they face (a quarter turn clockwise for each way round).
        let base = Placement { item: 0, variant, layer: Layer::Floor, x: 0.0, z: 0.0, rot: dir, wall: None, u: 0.0, v: 0.0, host: None };
        let mut first: Option<u32> = None;
        let mut fits = |room: &mut crate::indoors::RoomWorld, p: Placement| -> bool {
            match room.check_added(&p, spec) {
                Verdict::Ok => true,
                Verdict::No { reason, .. } => {
                    first.get_or_insert(reason as u32);
                    false
                }
            }
        };
        match spec.kind {
            Kind::Ceiling => return Err(refusal::CEILING),
            Kind::Wall => {
                let Some((side, u0)) = self.wall_ahead() else { return Err(refusal::NO_WALL) };
                let length = wall_length(self.room.w, self.room.d, side);
                let [width, height] = spec.size;
                let v = snap_axis(clamp_axis(if spec.hang > 0.0 { spec.hang } else { HANG }, height, 0.0, WALL_HEIGHT), height, 0.0);
                for off in [0.0, 0.5, -0.5, 1.0, -1.0] {
                    let u = snap_axis(clamp_axis(u0 + off, width, 0.0, length), width, 0.0);
                    let p = Placement { layer: Layer::Wall, wall: Some(side), u, v, rot: 0, ..base };
                    if fits(&mut self.room, p) {
                        return Ok(p);
                    }
                }
            }
            Kind::Rug => {
                let [pw, pd] = turned(spec, dir);
                for (a, s) in [(0.0, 0.0), (0.5, 0.0), (0.0, 0.5), (0.0, -0.5), (-0.5, 0.0)] {
                    let [x, z] = snap_in(pw, pd, w.x + fx * a + rx * s, w.z + fz * a + rz * s, &[0.0, 0.0, self.room.w, self.room.d]);
                    let p = Placement { layer: Layer::Rug, x, z, ..base };
                    if fits(&mut self.room, p) {
                        return Ok(p);
                    }
                }
            }
            Kind::Floor | Kind::Misc => {
                // Something small goes on a table ahead, when there is one with room: the spot before
                // the hands, else along the top and further in, as on the floor.
                if spec.kind == Kind::Misc {
                    let (ax, az) = (w.x + fx * (REACH + 0.1), w.z + fz * (REACH + 0.1));
                    let mut spots = [None; 10];
                    {
                        let room = self.room.room();
                        let catalog = self.room.catalog();
                        if let Some((host, ..)) = surface_at(&room, catalog, spec, dir, ax, az, &|_| false) {
                            let mut n = 0;
                            for ahead in [0.0, 0.5] {
                                for side in [0.0, 0.5, -0.5, 1.0, -1.0] {
                                    let (x, z) = (ax + fx * ahead + rx * side, az + fz * ahead + rz * side);
                                    spots[n] = surface_at(&room, catalog, spec, dir, x, z, &|i| i != host);
                                    n += 1;
                                }
                            }
                        }
                    }
                    for (host, x, z, rot) in spots.into_iter().flatten() {
                        let p = Placement { layer: Layer::Surface, host: Some(host), x, z, rot, ..base };
                        if fits(&mut self.room, p) {
                            return Ok(p);
                        }
                    }
                }
                let [pw, pd] = turned(spec, dir);
                let reach = WALKER_RADIUS + CLEAR + (if dir.is_multiple_of(2) { pd } else { pw }) / 2.0;
                for ahead in [0.0, 0.5] {
                    for side in [0.0, 0.5, -0.5, 1.0, -1.0] {
                        let (cx, cz) = (w.x + fx * (reach + ahead) + rx * side, w.z + fz * (reach + ahead) + rz * side);
                        let [x, z] = snap_in(pw, pd, cx, cz, &[0.0, 0.0, self.room.w, self.room.d]);
                        if circle_hits_rect(w.x, w.z, WALKER_RADIUS, &rect_at(x, z, pw, pd)) {
                            continue;
                        }
                        let p = Placement { layer: Layer::Floor, x, z, ..base };
                        if fits(&mut self.room, p) {
                            return Ok(p);
                        }
                    }
                }
            }
        }
        Err(first.unwrap_or(crate::room::Reason::Overlap as u32))
    }

    /// A frame with hold of a piece: the stick (world axes) pushes, pulls or turns it, a move at a
    /// time, the player eased along each. Returns `Events::MOVED` as one begins, `Events::BUMP` when
    /// the room refuses one.
    pub(crate) fn step_hold(&mut self, sx: f64, sz: f64, dt: f64) -> u32 {
        let Some(mut h) = self.hold else { return 0 };
        if dt.is_nan() || dt <= 0.0 {
            return 0;
        }
        let mut events = 0;
        if h.slide > 0.0 {
            let k = 1.0 - crate::math::exp(-dt / EASE);
            self.walker.x += (h.to.0 - self.walker.x) * k;
            self.walker.z += (h.to.1 - self.walker.z) * k;
            // The legs step as the player moves.
            self.walker.speed = STEP / SLIDE;
            self.walker.phase += dt * STEP / SLIDE * crate::walk::steps_per_tile(STEP / SLIDE);
            h.slide -= dt;
            if h.slide <= 0.0 {
                (self.walker.x, self.walker.z) = h.to;
                self.walker.speed = 0.0;
            }
        } else if h.wait > 0.0 {
            h.wait -= dt;
        } else {
            let (fx, fz) = way(h.dir);
            let (rx, rz) = (-fz, fx);
            let (ahead, side) = (sx * fx + sz * fz, sx * rx + sz * rz);
            let m = if ahead > 0.6 {
                Some(Move::Push)
            } else if ahead < -0.6 {
                Some(Move::Pull)
            } else if side > 0.6 {
                Some(Move::Turn(1))
            } else if side < -0.6 {
                Some(Move::Turn(-1))
            } else {
                None
            };
            h.lean = match m {
                Some(Move::Push) => 1,
                Some(Move::Pull) => -1,
                _ => 0,
            };
            if let Some(m) = m {
                match self.try_move(&h, m) {
                    Some((x, z, rot, to)) => {
                        let p = *self.room.piece(h.index).expect("held");
                        self.room.set_piece(h.index, Placement { x, z, rot, ..p });
                        self.change = Change::Moved { index: h.index, x, z, rot };
                        h.moved = true;
                        h.slide = SLIDE;
                        h.to = to;
                        events |= Events::MOVED;
                    }
                    None => {
                        h.wait = BUMP;
                        events |= Events::BUMP;
                    }
                }
            }
        }
        self.hold = Some(h);
        events
    }

    /// Where move `m` takes the held piece (x, z, turn) and the player, when the room lets it: the
    /// piece where the room's rules allow it, the player with room to stand there inside the room.
    fn try_move(&mut self, h: &Hold, m: Move) -> Option<(f64, f64, u8, (f64, f64))> {
        let p = *self.room.piece(h.index)?;
        let spec = *self.room.spec(h.index)?;
        let (fx, fz) = way(h.dir);
        let w = self.walker;
        let (x, z, rot, to) = match m {
            Move::Push => (p.x + fx * STEP, p.z + fz * STEP, p.rot, (w.x + fx * STEP, w.z + fz * STEP)),
            Move::Pull => (p.x - fx * STEP, p.z - fz * STEP, p.rot, (w.x - fx * STEP, w.z - fz * STEP)),
            Move::Turn(t) => {
                let rot = add_rot(p.rot as i32, t);
                let [pw, pd] = turned(&spec, rot);
                let (x, z) = (snap_axis(p.x, pw, 0.0), snap_axis(p.z, pd, 0.0));
                // Before the side the player holds, as far off it as they stood, where they stood along it.
                let (along, across) = if h.dir.is_multiple_of(2) { (pd, pw) } else { (pw, pd) };
                let gap = along / 2.0 + WALKER_RADIUS + CLEAR;
                let (ox, oz) = (w.x - x, w.z - z);
                let lateral = crate::math::clamp(ox * -fz + oz * fx, -across / 2.0, across / 2.0);
                (x, z, rot, (x - fx * gap - fz * lateral, z - fz * gap + fx * lateral))
            }
        };
        let moved = Placement { x, z, rot, ..p };
        if check(&self.room.room(), self.room.catalog(), &moved, Some(h.index as u32), &|_| false) != Verdict::Ok {
            return None;
        }
        // Room for the player there, with the piece where it goes; and never out of the door.
        if to.1 > self.room.d - WALKER_RADIUS || !self.room.fits_with(h.index, &moved, to.0, to.1) {
            return None;
        }
        Some((x, z, rot, to))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::island::{IslandMap, GRASS};
    use crate::math::PI;
    use crate::room::Room;

    const fn spec(kind: Kind, w: f64, d: f64, code: u16) -> Spec {
        Spec { kind, size: [w, d], surface: None, surface_y: 0.0, hang: 0.0, code }
    }
    const CHAIR: Spec = spec(Kind::Floor, 1.0, 1.0, 5);
    const TABLE: Spec = Spec { surface: Some([-1.0, -0.5, 1.0, 0.5]), surface_y: 0.7, ..spec(Kind::Floor, 2.0, 1.0, 7) };
    const VASE: Spec = spec(Kind::Misc, 0.5, 0.5, 9);
    const PAINTING: Spec = Spec { hang: 1.5, ..spec(Kind::Wall, 1.0, 1.0, 11) };
    const RUG: Spec = spec(Kind::Rug, 2.0, 2.0, 13);
    const PENDANT: Spec = spec(Kind::Ceiling, 1.0, 1.0, 15);
    const SPECS: [Spec; 6] = [CHAIR, TABLE, VASE, PAINTING, RUG, PENDANT];

    fn at(item: u32, layer: Layer, x: f64, z: f64) -> Placement {
        Placement { item, variant: 0, layer, x, z, rot: 0, wall: None, u: 0.0, v: 0.0, host: None }
    }

    /// A 6 × 6 room (its door at x 2.5 to 3.5 in the front wall): a chair at (1.5, 2.5), a 2 × 1
    /// table at (4, 1.5) with a vase in the middle of its top, a painting on the back wall over the
    /// chair, a rug at (1.5, 4.5); the player in it at (x, z) facing `yaw`.
    fn house(x: f64, z: f64, yaw: f64) -> (Box<IslandMap>, Box<Game>) {
        let mut m: Box<IslandMap> = Box::new(IslandMap::EMPTY);
        m.reset(12, 12);
        m.tier[..144].fill(1);
        m.ground[..144].fill(GRASS);
        m.house = [4.0, 3.0, 8.0, 6.0];
        m.door = [6.0, 6.0];
        let mut g: Box<Game> = Box::new(Game::EMPTY);
        let items = [
            at(0, Layer::Floor, 1.5, 2.5),
            at(1, Layer::Floor, 4.0, 1.5),
            Placement { host: Some(1), ..at(2, Layer::Surface, 0.0, 0.0) },
            Placement { wall: Some(Side::Back), u: 1.5, v: 1.5, ..at(3, Layer::Wall, 0.0, 0.0) },
            at(4, Layer::Rug, 1.5, 4.5),
        ];
        g.room.set(&Room { w: 6.0, d: 6.0, items: &items }, &SPECS);
        g.things.reset();
        g.restore(&m, 6.0, 7.0, 0.0, Some((x, z, yaw)));
        (m, g)
    }

    fn run(g: &mut Game, m: &IslandMap, sx: f64, sz: f64, seconds: f64) -> u32 {
        let mut events = 0;
        for _ in 0..(seconds * 60.0).round() as usize {
            events |= g.step(m, sx, sz, false, false, 1.0 / 60.0);
        }
        events
    }

    fn slot_of(g: &Game, id: u16) -> usize {
        g.things.open().iter().position(|s| s.item == id).expect("in the pockets")
    }

    #[test]
    fn a_piece_held_is_pushed_to_the_wall_and_the_player_goes_with_it() {
        // Facing the chair from in front of it (up the screen is -z).
        let (m, mut g) = house(1.5, 3.4, PI);
        assert_eq!(g.hint(&m, Press::Use), hint::GRAB);
        assert_eq!(g.grab(true), 0);
        let events = run(&mut g, &m, 0.0, -1.0, 1.0 / 60.0);
        assert!(events & Events::MOVED != 0);
        assert_eq!(g.change, Change::Moved { index: 0, x: 1.5, z: 2.0, rot: 0 });
        let events = run(&mut g, &m, 0.0, -1.0, 2.0);
        assert!(events & Events::BUMP != 0, "the wall stops it");
        let p = g.room.piece(0).unwrap();
        assert_eq!((p.x, p.z), (1.5, 0.5));
        // The player came with it, standing before it as they held it.
        assert!((g.walker.z - 1.4).abs() < 1e-9 && (g.walker.x - 1.5).abs() < 1e-9);
        assert_eq!(g.place, Place::House);
    }

    #[test]
    fn a_pull_steps_the_player_back_but_never_out_of_the_room() {
        let (m, mut g) = house(1.5, 3.4, PI);
        g.grab(true);
        run(&mut g, &m, 0.0, 1.0, 1.0 / 60.0);
        assert_eq!(g.change, Change::Moved { index: 0, x: 1.5, z: 3.0, rot: 0 });
        // Over the rug, which is walked on, to the front wall, where the player has no room behind.
        let events = run(&mut g, &m, 0.0, 1.0, 3.0);
        assert!(events & Events::BUMP != 0);
        assert_eq!(g.room.piece(0).unwrap().z, 4.5);
        assert!((g.walker.z - 5.4).abs() < 1e-9);
        assert_eq!(g.place, Place::House);
        // Let go: the player walks again, round the chair where it now stands.
        assert_eq!(g.grab(false), -1);
        assert!(g.hold.is_none());
    }

    #[test]
    fn a_piece_turns_in_place_with_what_stands_on_it() {
        // Facing the table from in front.
        let (m, mut g) = house(4.0, 2.4, PI);
        assert_eq!(g.grab(true), 1);
        run(&mut g, &m, 1.0, 0.0, 1.0 / 60.0);
        assert_eq!(g.change, Change::Moved { index: 1, x: 4.0, z: 1.5, rot: 1 });
        // Now one wide and two deep, the player before its near end.
        let room = g.room.room();
        let table = footprint(&room, g.room.catalog(), g.room.piece(1).unwrap()).unwrap();
        assert_eq!(table, [3.5, 0.5, 4.5, 2.5]);
        let vase = footprint(&room, g.room.catalog(), g.room.piece(2).unwrap()).unwrap();
        assert!(vase[0] >= table[0] && vase[2] <= table[2] && vase[1] >= table[1] && vase[3] <= table[3]);
        run(&mut g, &m, 0.0, 0.0, 0.4);
        assert!((g.walker.z - (2.5 + WALKER_RADIUS + CLEAR)).abs() < 1e-9);
    }

    #[test]
    fn y_takes_what_is_on_a_table_first_then_the_table_and_they_go_back_down() {
        let (m, mut g) = house(4.0, 2.4, PI);
        assert_eq!(g.hint(&m, Press::Pick), hint::LIFT);
        let out = g.act(&m, Press::Pick);
        assert_eq!(out, Outcome::GOT | Events::ROOM);
        assert_eq!(g.change, Change::Taken { index: 2 });
        let vase = item::furniture(VASE.code, 0);
        assert_eq!(g.things.got.item, vase);
        // A moment's bend, then the table.
        assert_eq!(g.act(&m, Press::Pick), 0);
        run(&mut g, &m, 0.0, 0.0, 0.5);
        g.act(&m, Press::Pick);
        assert_eq!(g.change, Change::Taken { index: 1 });
        assert!(g.room.piece(1).is_none() && g.room.piece(2).is_none());
        run(&mut g, &m, 0.0, 0.0, 0.5);
        // The table back down in front of the player, facing them; the vase on it.
        let table = item::furniture(TABLE.code, 0);
        assert_eq!(g.put(slot_of(&g, table), &TABLE), 0);
        assert_eq!(g.change, Change::Put(Placement { item: 0, ..at(0, Layer::Floor, 4.0, 1.5) }));
        assert!(!g.things.open().iter().any(|s| s.item == table));
        run(&mut g, &m, 0.0, 0.0, 0.5);
        assert_eq!(g.put(slot_of(&g, vase), &VASE), 0);
        let Change::Put(p) = g.change else { panic!("{:?}", g.change) };
        assert_eq!((p.layer, p.host), (Layer::Surface, Some(5)));
    }

    #[test]
    fn a_small_piece_goes_on_the_table_beside_what_is_already_there() {
        // At the table, the vase in the middle of its top just before the hands.
        let (m, mut g) = house(4.0, 2.4, PI);
        let vase = item::furniture(VASE.code, 0);
        g.things.give(vase, 1);
        assert_eq!(g.put(slot_of(&g, vase), &VASE), 0);
        let Change::Put(p) = g.change else { panic!("{:?}", g.change) };
        assert_eq!((p.layer, p.host, p.x, p.z), (Layer::Surface, Some(1), 0.75, 0.25));
        // The next goes to the other side of it, still on the table.
        run(&mut g, &m, 0.0, 0.0, 0.5);
        g.things.give(vase, 1);
        assert_eq!(g.put(slot_of(&g, vase), &VASE), 0);
        let Change::Put(p) = g.change else { panic!("{:?}", g.change) };
        assert_eq!((p.layer, p.host, p.x, p.z), (Layer::Surface, Some(1), -0.75, 0.25));
    }

    #[test]
    fn a_table_reached_away_from_what_is_on_it_gives_that_up_first() {
        // At the table's left end, the vase out of the hands' reach in its middle.
        let (m, mut g) = house(3.2, 2.4, PI);
        g.act(&m, Press::Pick);
        assert_eq!(g.change, Change::Taken { index: 2 });
    }

    #[test]
    fn what_hangs_comes_off_the_wall_faced_and_goes_up_on_one() {
        // By the back wall, facing it, under the painting.
        let (m, mut g) = house(1.5, 0.9, PI);
        assert_eq!(g.act(&m, Press::Pick), Outcome::GOT | Events::ROOM);
        assert_eq!(g.change, Change::Taken { index: 3 });
        run(&mut g, &m, 0.0, 0.0, 0.5);
        let painting = item::furniture(PAINTING.code, 0);
        // Turned to the room, there is no wall to hang it on.
        g.walker.yaw = 0.0;
        assert_eq!(g.put(slot_of(&g, painting), &PAINTING), refusal::NO_WALL);
        g.walker.yaw = PI;
        assert_eq!(g.put(slot_of(&g, painting), &PAINTING), 0);
        let Change::Put(p) = g.change else { panic!() };
        assert_eq!((p.layer, p.wall, p.u, p.v), (Layer::Wall, Some(Side::Back), 1.5, 1.5));
        // A rug goes down under the player; what hangs from the ceiling is for the editor.
        run(&mut g, &m, 0.0, 0.0, 0.5);
        g.walker = crate::walk::Walker::new(4.5, 4.0, 0.0, PI);
        g.things.give(item::furniture(RUG.code, 1), 1);
        assert_eq!(g.put(slot_of(&g, item::furniture(RUG.code, 1)), &RUG), 0);
        let Change::Put(p) = g.change else { panic!() };
        assert_eq!((p.layer, p.x, p.z, p.variant), (Layer::Rug, 4.5, 4.0, 1));
        run(&mut g, &m, 0.0, 0.0, 0.5);
        g.things.give(item::furniture(PENDANT.code, 0), 1);
        assert_eq!(g.put(slot_of(&g, item::furniture(PENDANT.code, 0)), &PENDANT), refusal::CEILING);
    }

    #[test]
    fn a_tap_is_a_press_that_moves_nothing() {
        // At the table, the vase on it is named before it.
        let (_, mut g) = house(4.0, 2.4, PI);
        g.grab(true);
        assert_eq!(g.grab(false), 2, "a tap names the vase");
        let (m, mut g) = house(1.5, 3.4, PI);
        g.grab(true);
        assert_eq!(g.grab(false), 0, "a tap names the chair");
        g.grab(true);
        run(&mut g, &m, 0.0, 0.0, 0.4);
        assert_eq!(g.grab(false), -1, "held a while, it was no tap");
        g.grab(true);
        run(&mut g, &m, 0.0, -1.0, 0.1);
        assert_eq!(g.grab(false), -1, "it moved");
    }

    #[test]
    fn with_full_pockets_the_piece_stays() {
        let (m, mut g) = house(1.5, 3.4, PI);
        while g.things.pockets_have_room(item::WOOD) {
            g.things.give(item::WOOD, 30);
        }
        assert_eq!(g.act(&m, Press::Pick), Outcome::FULL);
        assert!(g.room.piece(0).is_some());
        assert_eq!(g.change, Change::None);
    }
}
