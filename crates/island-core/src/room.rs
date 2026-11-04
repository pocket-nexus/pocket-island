//! The room's placement rules, after the island's interior editor (the browser's `src/core/rules.ts`
//! before it moved here):
//!
//! - The floor is a grid of tiles. Items have a footprint of whole or half tiles and stand on
//!   half-tile positions. They turn in quarter turns, which swaps width and depth.
//! - Housewares and miscellaneous items on the floor never overlap.
//! - Rugs lie on a layer of their own: furniture stands on them, but two rugs never overlap.
//! - Miscellaneous items may also stand on a table's top, as many as fit inside it.
//! - Walls have a grid like the floor's; wall items never overlap on one wall.
//! - The ceiling has a grid of its own for hanging items.
//! - The tile in front of the entrance stays clear.
//! - A room holds at most 150 items, wall and ceiling items included.
//!
//! A room is a slice of [`Placement`]s whose items are numbers into a slice of [`Spec`]s, and a
//! surface item names its host by its index in the same slice.

use crate::math::{js_round, max, min};

pub const WALL_HEIGHT: f64 = 3.0;
pub const ITEM_LIMIT: usize = 150;
const EPS: f64 = 1e-6;

/// What an item is, for placement.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Kind {
    /// Housewares: stands on the floor, collides with other floor items.
    Floor = 0,
    /// Miscellaneous: on the floor or on a table's top.
    Misc = 1,
    /// Hangs on the back, left or right wall.
    Wall = 2,
    /// Hangs from the ceiling.
    Ceiling = 3,
    /// Lies flat under furniture; rugs never overlap each other.
    Rug = 4,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Layer {
    Floor = 0,
    Rug = 1,
    Wall = 2,
    Ceiling = 3,
    Surface = 4,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Side {
    Back = 0,
    Left = 1,
    Right = 2,
}

/// An axis-aligned rectangle [x0, z0, x1, z1].
pub type Rect = [f64; 4];

/// The part of an item's definition the rules read.
#[derive(Clone, Copy, Debug)]
pub struct Spec {
    pub kind: Kind,
    /// Floor, misc, ceiling and rug items: width and depth. Wall items: width and height. Tiles.
    pub size: [f64; 2],
    /// A top misc items stand on: a rectangle about the item's centre in its unrotated frame.
    pub surface: Option<Rect>,
    pub surface_y: f64,
    /// Wall items: the centre height they are first hung at.
    pub hang: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Placement {
    /// The item, as an index into the catalogue's specs.
    pub item: u32,
    pub layer: Layer,
    /// Floor, rug, ceiling: the centre in room tiles. Surface: the centre in the host's unrotated
    /// frame, relative to the host's centre.
    pub x: f64,
    pub z: f64,
    /// Quarter turns clockwise seen from above (0..3).
    pub rot: u8,
    /// Wall items: which wall, the centre along it and the centre's height.
    pub wall: Option<Side>,
    pub u: f64,
    pub v: f64,
    /// Surface items: the index of the item this one stands on.
    pub host: Option<u32>,
}

/// Why a placement is refused.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Reason {
    Unknown = 1,
    WrongLayer = 2,
    Limit = 3,
    NoWall = 4,
    OffWall = 5,
    WallOverlap = 6,
    NoSurface = 7,
    OffSurface = 8,
    SurfaceOverlap = 9,
    OffRoom = 10,
    Door = 11,
    RugOverlap = 12,
    Overlap = 13,
}

/// The verdict on a placement; `with` is the item it overlaps, when it overlaps one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Verdict {
    Ok,
    No { reason: Reason, with: Option<u32> },
}

impl Verdict {
    fn no(reason: Reason) -> Verdict {
        Verdict::No { reason, with: None }
    }
}

pub struct Room<'a> {
    pub w: f64,
    pub d: f64,
    pub items: &'a [Placement],
}

pub type Catalog<'a> = &'a [Spec];

fn spec_of<'a>(catalog: Catalog<'a>, item: u32) -> Option<&'a Spec> {
    catalog.get(item as usize)
}

pub fn layers_allow(kind: Kind, layer: Layer) -> bool {
    match kind {
        Kind::Floor => layer == Layer::Floor,
        Kind::Misc => layer == Layer::Floor || layer == Layer::Surface,
        Kind::Wall => layer == Layer::Wall,
        Kind::Ceiling => layer == Layer::Ceiling,
        Kind::Rug => layer == Layer::Rug,
    }
}

/// Width and depth after `rot` quarter turns.
pub fn turned(spec: &Spec, rot: u8) -> [f64; 2] {
    if rot.is_multiple_of(2) { spec.size } else { [spec.size[1], spec.size[0]] }
}

pub fn add_rot(a: i32, b: i32) -> u8 {
    ((((a + b) % 4) + 4) % 4) as u8
}

/// Snap a centre so the item's near edge lands on a half tile counted from `origin`.
pub fn snap_axis(center: f64, extent: f64, origin: f64) -> f64 {
    origin + js_round((center - extent / 2.0 - origin) * 2.0) / 2.0 + extent / 2.0
}

/// Keep a centre inside [lo, hi] for an item `extent` wide.
pub fn clamp_axis(center: f64, extent: f64, lo: f64, hi: f64) -> f64 {
    if hi - lo < extent {
        return (lo + hi) / 2.0;
    }
    min(hi - extent / 2.0, max(lo + extent / 2.0, center))
}

pub fn rect_at(x: f64, z: f64, w: f64, d: f64) -> Rect {
    [x - w / 2.0, z - d / 2.0, x + w / 2.0, z + d / 2.0]
}

/// True when two rectangles share area; touching edges do not count.
pub fn overlaps(a: &Rect, b: &Rect) -> bool {
    a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS
}

pub fn inside(inner: &Rect, outer: &Rect) -> bool {
    inner[0] >= outer[0] - EPS && inner[1] >= outer[1] - EPS && inner[2] <= outer[2] + EPS && inner[3] <= outer[3] + EPS
}

/// A point in an item's unrotated frame, carried into the frame it is turned into.
pub fn rotate_point(x: f64, z: f64, rot: u8) -> [f64; 2] {
    match rot % 4 {
        0 => [x, z],
        1 => [-z, x],
        2 => [-x, -z],
        _ => [z, -x],
    }
}

pub fn unrotate_point(x: f64, z: f64, rot: u8) -> [f64; 2] {
    rotate_point(x, z, add_rot(0, -(rot as i32)))
}

pub fn rotate_rect(r: &Rect, rot: u8) -> Rect {
    let [ax, az] = rotate_point(r[0], r[1], rot);
    let [bx, bz] = rotate_point(r[2], r[3], rot);
    [min(ax, bx), min(az, bz), max(ax, bx), max(az, bz)]
}

pub fn room_rect(w: f64, d: f64) -> Rect {
    [0.0, 0.0, w, d]
}

/// The entrance is in the front wall's middle; the tile inside it stays clear.
pub fn door_rect(w: f64, d: f64) -> Rect {
    [w / 2.0 - 0.5, d - 1.0, w / 2.0 + 0.5, d]
}

pub fn wall_length(w: f64, d: f64, side: Side) -> f64 {
    if side == Side::Back { w } else { d }
}

/// A host's surface in room tiles.
pub fn surface_rect(host: &Placement, spec: &Spec) -> Option<Rect> {
    let top = spec.surface?;
    if host.layer != Layer::Floor {
        return None;
    }
    let r = rotate_rect(&top, host.rot);
    Some([r[0] + host.x, r[1] + host.z, r[2] + host.x, r[3] + host.z])
}

/// The rotation an item shows in the room: a surface item turns with its host.
pub fn world_rot(room: &Room, p: &Placement) -> u8 {
    if p.layer != Layer::Surface {
        return p.rot;
    }
    match p.host.and_then(|h| room.items.get(h as usize)) {
        Some(host) => add_rot(host.rot as i32, p.rot as i32),
        None => p.rot,
    }
}

/// Centre in room tiles of anything but a wall item.
pub fn center_of(room: &Room, p: &Placement) -> [f64; 2] {
    if p.layer != Layer::Surface {
        return [p.x, p.z];
    }
    match p.host.and_then(|h| room.items.get(h as usize)) {
        Some(host) => {
            let [dx, dz] = rotate_point(p.x, p.z, host.rot);
            [host.x + dx, host.z + dz]
        }
        None => [p.x, p.z],
    }
}

/// Footprint in room tiles. Wall items have none on the floor.
pub fn footprint(room: &Room, catalog: Catalog, p: &Placement) -> Option<Rect> {
    let spec = spec_of(catalog, p.item)?;
    if p.layer == Layer::Wall {
        return None;
    }
    let [w, d] = turned(spec, world_rot(room, p));
    let [x, z] = center_of(room, p);
    Some(rect_at(x, z, w, d))
}

/// A wall item's rectangle on its wall: [u0, v0, u1, v1].
pub fn wall_rect(spec: &Spec, p: &Placement) -> Rect {
    rect_at(p.u, p.v, spec.size[0], spec.size[1])
}

/// A surface item's rectangle in its host's unrotated frame.
fn local_rect(spec: &Spec, p: &Placement) -> Rect {
    let [w, d] = turned(spec, p.rot);
    rect_at(p.x, p.z, w, d)
}

/// Whether `p` may stand where it says. `this` is its index when it is already in the room (a
/// move), and `ignored(i)` names the items treated as absent (the others moved with it).
pub fn check(room: &Room, catalog: Catalog, p: &Placement, this: Option<u32>, ignored: &dyn Fn(u32) -> bool) -> Verdict {
    let Some(spec) = spec_of(catalog, p.item) else { return Verdict::no(Reason::Unknown) };
    if !layers_allow(spec.kind, p.layer) {
        return Verdict::no(Reason::WrongLayer);
    }
    let adding = this.is_none();
    if adding && room.items.len() >= ITEM_LIMIT {
        return Verdict::no(Reason::Limit);
    }
    let others = room.items.iter().enumerate().filter(|(i, q)| {
        let i = *i as u32;
        Some(i) != this && !ignored(i) && q.layer == p.layer
    });

    if p.layer == Layer::Wall {
        let Some(side) = p.wall else { return Verdict::no(Reason::NoWall) };
        let r = wall_rect(spec, p);
        if !inside(&r, &[0.0, 0.0, wall_length(room.w, room.d, side), WALL_HEIGHT]) {
            return Verdict::no(Reason::OffWall);
        }
        for (i, q) in others {
            if q.wall != Some(side) {
                continue;
            }
            if let Some(qs) = spec_of(catalog, q.item) {
                if overlaps(&r, &wall_rect(qs, q)) {
                    return Verdict::No { reason: Reason::WallOverlap, with: Some(i as u32) };
                }
            }
        }
        return Verdict::Ok;
    }

    if p.layer == Layer::Surface {
        let host = p.host.and_then(|h| room.items.get(h as usize).map(|q| (h, q)));
        let Some((host_index, host)) = host else { return Verdict::no(Reason::NoSurface) };
        let Some(host_spec) = spec_of(catalog, host.item) else { return Verdict::no(Reason::NoSurface) };
        let Some(top) = host_spec.surface else { return Verdict::no(Reason::NoSurface) };
        if host.layer != Layer::Floor || ignored(host_index) {
            return Verdict::no(Reason::NoSurface);
        }
        let r = local_rect(spec, p);
        if !inside(&r, &top) {
            return Verdict::no(Reason::OffSurface);
        }
        for (i, q) in others {
            if q.host != p.host {
                continue;
            }
            if let Some(qs) = spec_of(catalog, q.item) {
                if overlaps(&r, &local_rect(qs, q)) {
                    return Verdict::No { reason: Reason::SurfaceOverlap, with: Some(i as u32) };
                }
            }
        }
        return Verdict::Ok;
    }

    let [w, d] = turned(spec, p.rot);
    let r = rect_at(p.x, p.z, w, d);
    if !inside(&r, &room_rect(room.w, room.d)) {
        return Verdict::no(Reason::OffRoom);
    }
    if p.layer == Layer::Floor && overlaps(&r, &door_rect(room.w, room.d)) {
        return Verdict::no(Reason::Door);
    }
    for (i, q) in others {
        let Some(qs) = spec_of(catalog, q.item) else { continue };
        let [qw, qd] = turned(qs, q.rot);
        if overlaps(&r, &rect_at(q.x, q.z, qw, qd)) {
            let reason = if p.layer == Layer::Rug { Reason::RugOverlap } else { Reason::Overlap };
            return Verdict::No { reason, with: Some(i as u32) };
        }
    }
    Verdict::Ok
}

/// Where a misc item would stand on a table under the room point (x, z): the host, and the centre
/// and turn in the host's frame. The top that holds the point wins.
pub fn surface_at(room: &Room, catalog: Catalog, spec: &Spec, rot: u8, x: f64, z: f64, ignored: &dyn Fn(u32) -> bool) -> Option<(u32, f64, f64, u8)> {
    if spec.kind != Kind::Misc {
        return None;
    }
    for (i, host) in room.items.iter().enumerate() {
        if host.layer != Layer::Floor || ignored(i as u32) {
            continue;
        }
        let Some(host_spec) = spec_of(catalog, host.item) else { continue };
        let Some(s) = host_spec.surface else { continue };
        let Some(top) = surface_rect(host, host_spec) else { continue };
        if x < top[0] - EPS || x > top[2] + EPS || z < top[1] - EPS || z > top[3] + EPS {
            continue;
        }
        let local = unrotate_point(x - host.x, z - host.z, host.rot);
        let relative = add_rot(rot as i32, -(host.rot as i32));
        let [w, d] = turned(spec, relative);
        let [sx, sz] = snap_in(w, d, local[0], local[1], &s);
        return Some((i as u32, sx, sz, relative));
    }
    None
}

/// A centre that follows (x, z), for something `w` × `d` kept inside `rect`, with its near edges on
/// the half tiles counted from the rectangle's corner: the floor's grid, a wall's, a table top's.
pub fn snap_in(w: f64, d: f64, x: f64, z: f64, rect: &Rect) -> [f64; 2] {
    [
        snap_axis(clamp_axis(x, w, rect[0], rect[2]), w, rect[0]),
        snap_axis(clamp_axis(z, d, rect[1], rect[3]), d, rect[1]),
    ]
}
