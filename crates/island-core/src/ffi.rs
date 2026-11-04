//! The core's C interface, the same for the browser's WebAssembly module and the console's
//! archive. The core keeps one island, one room and one game in fixed storage; a host fills the
//! island and the room in and calls the rules and the game. Results longer than a number are left
//! in `pi_out()` (`OUT` doubles) and, for a way, `pi_path()` (2 doubles a corner).
//!
//! The island: `pi_island_reset`, its tiles through `pi_island_tiles`, then ramps, bridges, the
//! house and the props in the way. The room: `pi_room_reset`, the catalogue's specs, the items,
//! then `pi_room_commit` (the game walks the room as committed). Every call is from one thread.
//!
//! The island's things (crate::things): the recipe's trees with `pi_island_add_tree`, a first run's
//! pockets with `pi_things_reset` or a kept run's with `pi_things_load`, then the day with
//! `pi_things_day`. Lists come back in `pi_things_data()` (the pockets, a save) and
//! `pi_things_view_data()` (what to draw, filled by `pi_things_view`), as 32-bit floats.

use core::cell::UnsafeCell;

use crate::game::{Game, Place};
use crate::handle::Change;
use crate::things::{Press, TreeKind, MAX_VIEW, SAVE_MAX, VIEW_FIELDS};
use crate::island::{Bridge, Dir, IslandMap, Prop, Ramp};
use crate::room::{self, Kind, Layer, Placement, Room, Side, Spec, Verdict};
use crate::walk::{self, find_path, Input, PathScratch, Point, WalkWorld, Walker};

pub const MAX_SPECS: usize = 512;
pub const MAX_ITEMS: usize = 512;
pub const MAX_PATH: usize = 256;
/// Numbers `pi_out()` holds: enough for the fishing line's points and a fish's outline.
pub const OUT: usize = 32;
const _: () = assert!(crate::things::LINE_POINTS * 3 <= OUT && crate::things::OUTLINE_POINTS * 2 <= OUT);

struct Store {
    map: IslandMap,
    specs: [Spec; MAX_SPECS],
    spec_count: usize,
    items: [Placement; MAX_ITEMS],
    item_count: usize,
    ignored: [bool; MAX_ITEMS],
    room_w: f64,
    room_d: f64,
    game: Game,
    out: [f64; OUT],
    path: [f64; MAX_PATH * 2],
    /// The things' lists: the pockets and the box, or a save.
    data: [f32; DATA_LEN],
    /// What of the island's things to draw, `VIEW_FIELDS` numbers an entry.
    view: [f32; MAX_VIEW * VIEW_FIELDS],
}

pub const DATA_LEN: usize = if SAVE_MAX > 512 { SAVE_MAX } else { 512 };

// Every default is zero: the store then takes no room in the program's file (it is in its .bss).
const NO_SPEC: Spec = Spec { kind: Kind::Floor, size: [0.0, 0.0], surface: None, surface_y: 0.0, hang: 0.0, code: 0 };
const NO_ITEM: Placement = Placement { item: 0, variant: 0, layer: Layer::Floor, x: 0.0, z: 0.0, rot: 0, wall: None, u: 0.0, v: 0.0, host: None };

struct Shared(UnsafeCell<Store>);
// The hosts call from one thread: the browser's page, the console's main loop.
unsafe impl Sync for Shared {}

static STORE: Shared = Shared(UnsafeCell::new(Store {
    map: IslandMap::EMPTY,
    specs: [NO_SPEC; MAX_SPECS],
    spec_count: 0,
    items: [NO_ITEM; MAX_ITEMS],
    item_count: 0,
    ignored: [false; MAX_ITEMS],
    room_w: 0.0,
    room_d: 0.0,
    game: Game::EMPTY,
    out: [0.0; OUT],
    path: [0.0; MAX_PATH * 2],
    data: [0.0; DATA_LEN],
    view: [0.0; MAX_VIEW * VIEW_FIELDS],
}));

#[allow(clippy::mut_from_ref)]
fn store() -> &'static mut Store {
    // One thread, and no call keeps a borrow past its return.
    unsafe { &mut *STORE.0.get() }
}

/// The way finder's storage (about 1.4 MB), apart from the rest: it is all zeros at start.
struct Scratch(UnsafeCell<PathScratch>);
unsafe impl Sync for Scratch {}
static SCRATCH: Scratch = Scratch(UnsafeCell::new(PathScratch::EMPTY));

#[allow(clippy::mut_from_ref)]
fn scratch() -> &'static mut PathScratch {
    unsafe { &mut *SCRATCH.0.get() }
}

fn room_of(s: &Store) -> Room<'_> {
    Room { w: s.room_w, d: s.room_d, items: &s.items[..s.item_count] }
}

fn side(v: u32) -> Option<Side> {
    match v {
        0 => Some(Side::Back),
        1 => Some(Side::Left),
        2 => Some(Side::Right),
        _ => None,
    }
}

fn layer(v: u32) -> Layer {
    match v {
        1 => Layer::Rug,
        2 => Layer::Wall,
        3 => Layer::Ceiling,
        4 => Layer::Surface,
        _ => Layer::Floor,
    }
}

fn kind(v: u32) -> Kind {
    match v {
        1 => Kind::Misc,
        2 => Kind::Wall,
        3 => Kind::Ceiling,
        4 => Kind::Rug,
        _ => Kind::Floor,
    }
}

#[allow(clippy::too_many_arguments)]
fn placement(item: u32, variant: u32, layer_code: u32, x: f64, z: f64, rot: u32, wall: u32, u: f64, v: f64, host: i32) -> Placement {
    Placement { item, variant: variant.min(u8::MAX as u32) as u8, layer: layer(layer_code), x, z, rot: (rot % 4) as u8, wall: side(wall), u, v, host: if host >= 0 { Some(host as u32) } else { None } }
}

// ---------------------------------------------------------------- results

#[no_mangle]
pub extern "C" fn pi_out() -> *mut f64 {
    store().out.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn pi_path() -> *mut f64 {
    store().path.as_mut_ptr()
}

// ---------------------------------------------------------------- the island

#[no_mangle]
pub extern "C" fn pi_island_reset(w: u32, d: u32) -> bool {
    let s = store();
    s.game.things.clear_trees();
    s.map.reset(w as usize, d as usize)
}

/// The island's tiles to fill: 0 its tiers, 1 its ground; `w * d` bytes, row by row.
#[no_mangle]
pub extern "C" fn pi_island_tiles(which: u32) -> *mut u8 {
    let map = &mut store().map;
    if which == 0 { map.tier.as_mut_ptr() } else { map.ground.as_mut_ptr() }
}

#[no_mangle]
pub extern "C" fn pi_island_add_ramp(x0: f64, z0: f64, x1: f64, z1: f64, up: u32, low: f64, high: f64) -> bool {
    let up = match up {
        1 => Dir::S,
        2 => Dir::E,
        3 => Dir::W,
        _ => Dir::N,
    };
    store().map.add_ramp(Ramp { rect: [x0, z0, x1, z1], up, low, high })
}

#[no_mangle]
pub extern "C" fn pi_island_add_bridge(x0: f64, z0: f64, x1: f64, z1: f64, y: f64) -> bool {
    store().map.add_bridge(Bridge { rect: [x0, z0, x1, z1], y })
}

#[no_mangle]
pub extern "C" fn pi_island_set_house(x0: f64, z0: f64, x1: f64, z1: f64, door_x: f64, door_z: f64) {
    let map = &mut store().map;
    map.version += 1;
    map.house = [x0, z0, x1, z1];
    map.door = [door_x, door_z];
}

/// The shop's stall over a rectangle (in the way, as the house), and its keeper at (x, z) behind the
/// counter, facing `yaw` toward the customer.
#[no_mangle]
pub extern "C" fn pi_island_set_shop(x0: f64, z0: f64, x1: f64, z1: f64, x: f64, z: f64, yaw: f64) {
    store().map.set_shop([x0, z0, x1, z1], x, z, yaw);
}

#[no_mangle]
pub extern "C" fn pi_island_add_prop(x: f64, z: f64, radius: f64) -> bool {
    store().map.add_prop(Prop { x, z, radius })
}

/// A tree, as the recipe placed it: its turn, its kind (0 broadleaf, 1 fruit, 2 cedar, 3 palm) and look.
#[no_mangle]
pub extern "C" fn pi_island_add_tree(x: f64, z: f64, rot: f64, kind: u32, variant: u32) -> bool {
    let kind = match kind {
        1 => TreeKind::Fruit,
        2 => TreeKind::Cedar,
        3 => TreeKind::Palm,
        _ => TreeKind::Broadleaf,
    };
    store().game.things.add_tree(x, z, rot, kind, variant as u8)
}

#[no_mangle]
pub extern "C" fn pi_island_height(x: f64, z: f64) -> f64 {
    store().map.height_at(x, z)
}

#[no_mangle]
pub extern "C" fn pi_island_standable(x: f64, z: f64) -> bool {
    store().map.standable(x, z)
}

#[no_mangle]
pub extern "C" fn pi_island_fits(x: f64, z: f64, r: f64, from: f64) -> bool {
    store().map.fits(x, z, r, from)
}

#[no_mangle]
pub extern "C" fn pi_island_at_door(x: f64, z: f64, yaw: f64) -> bool {
    store().map.at_door(x, z, yaw)
}

/// Where a walker stands before the door (out of it, or to go in): `out[0..2]`.
#[no_mangle]
pub extern "C" fn pi_island_door_front() {
    let s = store();
    let p = s.map.door_front();
    s.out[..2].copy_from_slice(&p);
}

// ---------------------------------------------------------------- walking, on the island (0) or in the committed room (1)

fn with_world<T>(which: u32, f: impl FnOnce(&dyn WalkWorld, &mut PathScratch, &mut [f64]) -> T) -> T {
    let s = store();
    if which == 1 { f(&s.game.room, scratch(), &mut s.path) } else { f(&s.map, scratch(), &mut s.path) }
}

/// One step of a walker (x, z, y, yaw, speed, phase) with the stick; the walker after it is in `out[0..6]`.
#[no_mangle]
pub extern "C" fn pi_walk_step(which: u32, x: f64, z: f64, y: f64, yaw: f64, speed: f64, phase: f64, ix: f64, iz: f64, run: bool, dt: f64) {
    let w = Walker { x, z, y, yaw, speed, phase };
    let next = with_world(which, |world, _, _| walk::step(&w, &Input { x: ix, z: iz, run }, dt, world, walk::WALKER_RADIUS));
    store().out[..6].copy_from_slice(&[next.x, next.z, next.y, next.yaw, next.speed, next.phase]);
}

/// A way from (fx, fz) to (tx, tz) in `bounds`; its corners are in `pi_path()`. Returns how many, or -1.
#[no_mangle]
pub extern "C" fn pi_walk_path(which: u32, fx: f64, fz: f64, tx: f64, tz: f64, x0: f64, z0: f64, x1: f64, z1: f64) -> i32 {
    with_world(which, |world, scratch, out| {
        let mut corners = [Point::default(); MAX_PATH];
        match find_path(world, Point { x: fx, z: fz }, Point { x: tx, z: tz }, [x0, z0, x1, z1], 0.5, walk::WALKER_RADIUS, 20_000, scratch, &mut corners) {
            Some(n) => {
                for (k, p) in corners[..n].iter().enumerate() {
                    out[k * 2] = p.x;
                    out[k * 2 + 1] = p.z;
                }
                n as i32
            }
            None => -1,
        }
    })
}

// ---------------------------------------------------------------- the room and its rules

#[no_mangle]
pub extern "C" fn pi_room_reset(w: f64, d: f64) {
    let s = store();
    s.room_w = w;
    s.room_d = d;
    s.item_count = 0;
}

/// The catalogue's item `index`: its number for the pockets (0: none), its kind, size, top (when it has
/// one) and hanging height.
#[no_mangle]
pub extern "C" fn pi_room_spec(index: u32, code: u32, kind_code: u32, w: f64, d: f64, has_surface: bool, sx0: f64, sz0: f64, sx1: f64, sz1: f64, sy: f64, hang: f64) -> bool {
    let s = store();
    let i = index as usize;
    if i >= MAX_SPECS {
        return false;
    }
    s.specs[i] = Spec { kind: kind(kind_code), size: [w, d], surface: if has_surface { Some([sx0, sz0, sx1, sz1]) } else { None }, surface_y: sy, hang, code: code.min(u16::MAX as u32) as u16 };
    s.spec_count = s.spec_count.max(i + 1);
    true
}

/// An item in the room, in look `variant`; returns its index, or -1 when the room is full.
#[no_mangle]
pub extern "C" fn pi_room_add(item: u32, variant: u32, layer_code: u32, x: f64, z: f64, rot: u32, wall: u32, u: f64, v: f64, host: i32) -> i32 {
    let s = store();
    if s.item_count >= MAX_ITEMS {
        return -1;
    }
    s.items[s.item_count] = placement(item, variant, layer_code, x, z, rot, wall, u, v, host);
    s.ignored[s.item_count] = false;
    s.item_count += 1;
    s.item_count as i32 - 1
}

/// Treat item `index` as absent in the next checks (it moves with the one being checked).
#[no_mangle]
pub extern "C" fn pi_room_ignore(index: u32, on: bool) {
    let s = store();
    if (index as usize) < MAX_ITEMS {
        s.ignored[index as usize] = on;
    }
}

#[no_mangle]
pub extern "C" fn pi_room_clear_ignored() {
    store().ignored.fill(false);
}

/// The room as it now stands is the one the player walks: its furniture in the way.
#[no_mangle]
pub extern "C" fn pi_room_commit() {
    let s = store();
    let room = Room { w: s.room_w, d: s.room_d, items: &s.items[..s.item_count] };
    s.game.room.set(&room, &s.specs[..s.spec_count]);
    s.game.settle();
}

fn reason_code(v: Verdict, out: &mut [f64; 32]) -> i32 {
    match v {
        Verdict::Ok => 0,
        Verdict::No { reason, with } => {
            out[0] = with.map(|w| w as f64).unwrap_or(-1.0);
            reason as i32
        }
    }
}

/// Whether a placement may stand where it says (`this`: its index when it is a move, or -1).
/// Returns 0, or the reason (room::Reason); the item it overlaps is `out[0]` (-1 for none).
#[no_mangle]
pub extern "C" fn pi_rules_check(this: i32, item: u32, layer_code: u32, x: f64, z: f64, rot: u32, wall: u32, u: f64, v: f64, host: i32) -> i32 {
    let s = store();
    let p = placement(item, 0, layer_code, x, z, rot, wall, u, v, host);
    let ignored = s.ignored;
    let verdict = room::check(&room_of(s), &s.specs[..s.spec_count], &p, if this >= 0 { Some(this as u32) } else { None }, &|i| ignored[i as usize]);
    reason_code(verdict, &mut s.out)
}

/// The table top under the room point (x, z) for a misc item: returns the host's index (-1 for
/// none), with the centre and turn in the host's frame in `out[0..3]`.
#[no_mangle]
pub extern "C" fn pi_rules_surface_at(item: u32, rot: u32, x: f64, z: f64) -> i32 {
    let s = store();
    let Some(spec) = s.specs[..s.spec_count].get(item as usize).copied() else { return -1 };
    let ignored = s.ignored;
    match room::surface_at(&room_of(s), &s.specs[..s.spec_count], &spec, (rot % 4) as u8, x, z, &|i| ignored[i as usize]) {
        Some((host, hx, hz, r)) => {
            s.out[..3].copy_from_slice(&[hx, hz, r as f64]);
            host as i32
        }
        None => -1,
    }
}

/// Where something `w` × `d` (as turned) that follows (x, z) stands within [x0, z0, x1, z1] on its
/// half tiles (room::snap_in): `out[0..2]`.
#[no_mangle]
pub extern "C" fn pi_rules_snap(w: f64, d: f64, x: f64, z: f64, x0: f64, z0: f64, x1: f64, z1: f64) {
    let s = store();
    let p = room::snap_in(w, d, x, z, &[x0, z0, x1, z1]);
    s.out[..2].copy_from_slice(&p);
}

/// A centre on the half tiles counted from `origin`, for something `extent` across, with no bounds
/// (room::snap_axis): a group turned about one of its pieces, a showroom laid out.
#[no_mangle]
pub extern "C" fn pi_rules_snap_axis(center: f64, extent: f64, origin: f64) -> f64 {
    room::snap_axis(center, extent, origin)
}

// ---------------------------------------------------------------- the game

/// The player outdoors at (x, z) facing `yaw`, or (with `in_house`) in the house at (hx, hz).
#[no_mangle]
pub extern "C" fn pi_game_restore(x: f64, z: f64, yaw: f64, in_house: bool, hx: f64, hz: f64, hyaw: f64) {
    let s = store();
    s.game.restore(&s.map, x, z, yaw, if in_house { Some((hx, hz, hyaw)) } else { None });
    // The island's grid for finding the way, judged now rather than at the first click (a fifth of a
    // second on a handheld; kept until the island changes).
    let here = Point { x, z };
    let mut none = [Point::default(); 1];
    find_path(&s.map, here, here, [0.0, 0.0, s.map.w as f64, s.map.d as f64], 0.5, walk::WALKER_RADIUS, 1, scratch(), &mut none);
}

#[no_mangle]
pub extern "C" fn pi_game_enter(instant: bool) -> u32 {
    let s = store();
    s.game.enter(&s.map, instant, None)
}

#[no_mangle]
pub extern "C" fn pi_game_exit(instant: bool) -> u32 {
    let s = store();
    s.game.exit(&s.map, instant)
}

/// Walk to (x, z) in the place's tiles; `enter` goes in at the end. False when there is no way.
#[no_mangle]
pub extern "C" fn pi_game_walk_to(x: f64, z: f64, enter: bool) -> bool {
    let s = store();
    s.game.walk_to(&s.map, scratch(), x, z, enter)
}

/// A frame: the stick (world axes), run, whether a dialog has the buttons, seconds. Returns the
/// game's events (game::Events).
#[no_mangle]
pub extern "C" fn pi_game_step(sx: f64, sz: f64, run: bool, busy: bool, dt: f64) -> u32 {
    let s = store();
    s.game.step(&s.map, sx, sz, run, busy, dt)
}

/// The game now, in `out`: place (0 island, 1 house), x, y, z, yaw, speed, phase, at the door,
/// fade, the island spot (x, z, yaw) while in the house, walking to a point, seconds; the tool in
/// hand (an item), the action under way (things::Act) and how far through it, whether a line is
/// out, and the piece of furniture the player has hold of (its place in the room, or -1).
#[no_mangle]
pub extern "C" fn pi_game_state() -> *const f64 {
    let s = store();
    let g = &s.game;
    let w = g.walker;
    let a = g.things.action;
    let flag = |b: bool| if b { 1.0 } else { 0.0 };
    let o = &mut s.out;
    o[gs::PLACE] = flag(g.place == Place::House);
    (o[gs::X], o[gs::Y], o[gs::Z], o[gs::YAW], o[gs::SPEED], o[gs::PHASE]) = (w.x, w.y, w.z, w.yaw, w.speed, w.phase);
    o[gs::NEAR_DOOR] = flag(g.near_door);
    o[gs::FADE] = g.fade();
    (o[gs::OUT_X], o[gs::OUT_Z], o[gs::OUT_YAW]) = (g.outside.x, g.outside.z, g.outside.yaw);
    o[gs::WALKING] = flag(g.walking_to());
    o[gs::SECONDS] = g.seconds;
    o[gs::HELD] = g.things.held as f64;
    o[gs::ACT] = a.act as u8 as f64;
    o[gs::ACT_T] = if a.length > 0.0 { a.t / a.length } else { 0.0 };
    o[gs::LINE] = flag(g.things.float.out);
    o[gs::HOLD] = g.hold.map_or(-1.0, |h| h.index as f64);
    s.out.as_ptr()
}

/// pi_game_state's numbers, by their place in `out` (the hosts read them by these: core.h `GS_*`,
/// src/core/game.ts `GS`).
pub mod gs {
    pub const PLACE: usize = 0;
    pub const X: usize = 1;
    pub const Y: usize = 2;
    pub const Z: usize = 3;
    pub const YAW: usize = 4;
    pub const SPEED: usize = 5;
    pub const PHASE: usize = 6;
    pub const NEAR_DOOR: usize = 7;
    pub const FADE: usize = 8;
    pub const OUT_X: usize = 9;
    pub const OUT_Z: usize = 10;
    pub const OUT_YAW: usize = 11;
    pub const WALKING: usize = 12;
    pub const SECONDS: usize = 13;
    pub const HELD: usize = 14;
    pub const ACT: usize = 15;
    pub const ACT_T: usize = 16;
    pub const LINE: usize = 17;
    pub const HOLD: usize = 18;
}

// ---------------------------------------------------------------- the furniture by hand (crate::handle)

/// A going down (`on`) or up in the house (Game::grab): down takes hold of the piece ahead (returns
/// its place in the room, or -1); up lets go, and returns the place of what is ahead when the press
/// was a tap that moved nothing, or -1.
#[no_mangle]
pub extern "C" fn pi_game_grab(on: bool) -> i32 {
    store().game.grab(on)
}

/// The piece of furniture in pocket `slot`, the catalogue's item `spec`, put down in front of the
/// player (Game::put): 0 when it was, else why not (room::Reason, or handle::refusal).
#[no_mangle]
pub extern "C" fn pi_game_put(slot: u32, spec: u32) -> u32 {
    let s = store();
    match s.specs[..s.spec_count].get(spec as usize).copied() {
        Some(spec) => s.game.put(slot as usize, &spec),
        None => crate::handle::refusal::NOT_FURNITURE,
    }
}

/// What `pi_game_change` returns: what the player last did to the room by hand.
pub mod change {
    pub const NONE: u32 = 0;
    pub const MOVED: u32 = 1;
    pub const TAKEN: u32 = 2;
    pub const PUT: u32 = 3;
}

/// Where `pi_game_change` leaves its numbers in `out`: a piece moved or taken by its place in the
/// room (`INDEX`, and a move's `X`, `Z`, `ROT`); a piece put down by its layer, place, turn, wall
/// (255 none), place on it and the table it stands on (-1 none).
pub mod change_out {
    pub const INDEX: usize = 0;
    pub const LAYER: usize = 0;
    pub const X: usize = 1;
    pub const Z: usize = 2;
    pub const ROT: usize = 3;
    pub const WALL: usize = 4;
    pub const U: usize = 5;
    pub const V: usize = 6;
    pub const HOST: usize = 7;
}

/// What the player last did to the room (`change`), its numbers in `out` (`change_out`), and
/// forgets it.
#[no_mangle]
pub extern "C" fn pi_game_change() -> u32 {
    use change_out as at;
    let s = store();
    let o = &mut s.out;
    match core::mem::take(&mut s.game.change) {
        Change::None => change::NONE,
        Change::Moved { index, x, z, rot } => {
            (o[at::INDEX], o[at::X], o[at::Z], o[at::ROT]) = (index as f64, x, z, rot as f64);
            change::MOVED
        }
        Change::Taken { index } => {
            o[at::INDEX] = index as f64;
            change::TAKEN
        }
        Change::Put(p) => {
            (o[at::LAYER], o[at::X], o[at::Z], o[at::ROT]) = (p.layer as u8 as f64, p.x, p.z, p.rot as f64);
            (o[at::WALL], o[at::U], o[at::V]) = (p.wall.map_or(255.0, |w| w as u8 as f64), p.u, p.v);
            o[at::HOST] = p.host.map_or(-1.0, |h| h as f64);
            change::PUT
        }
    }
}

/// What the player stands on (game::surface): 1 grass, 2 sand, 3 path, 4 wood, 5 stone, 6 a rug,
/// 7 the room's floor, 0 nothing to be heard.
#[no_mangle]
pub extern "C" fn pi_game_surface() -> u32 {
    let s = store();
    s.game.surface(&s.map) as u32
}

/// A press outdoors, `press` 0 the browser's key (whatever there is), 1 A on the console (use what
/// is in hand), 2 Y (pick up): in at the door, or the things'. Returns events and outcomes
/// (game::Events, things::Outcome).
#[no_mangle]
pub extern "C" fn pi_game_act(press: u32) -> u32 {
    let s = store();
    s.game.act(&s.map, Press::from(press))
}

// ---------------------------------------------------------------- the island's things

/// A first run: the tools in the pockets, nothing else, no day yet.
#[no_mangle]
pub extern "C" fn pi_things_reset() {
    store().game.things.reset();
}

/// The island's things for `day` (days since 1970, local time).
#[no_mangle]
pub extern "C" fn pi_things_day(day: f64) {
    let s = store();
    s.game.things.new_day(&s.map, day as i64);
}

/// What a press would do now (things::hint_for), `press` as for `pi_game_act`.
#[no_mangle]
pub extern "C" fn pi_things_hint(press: u32) -> u32 {
    let s = store();
    s.game.hint(&s.map, Press::from(press)) as u32
}

/// The next tool in hand (`dir` 1) or the one before (-1), empty hands among them.
#[no_mangle]
pub extern "C" fn pi_things_cycle(dir: i32) {
    store().game.things.cycle(dir);
}

/// The tool in pocket `slot` in hand, or put away.
#[no_mangle]
pub extern "C" fn pi_things_hold(slot: u32) {
    store().game.things.hold(slot as usize);
}

/// Pocket `slot` into the house's box (Game::store).
#[no_mangle]
pub extern "C" fn pi_things_store(slot: u32) -> bool {
    store().game.store(slot as usize)
}

/// The box's `slot` into the pockets (Game::take).
#[no_mangle]
pub extern "C" fn pi_things_take(slot: u32) -> bool {
    store().game.take(slot as usize)
}

/// Pocket `slot` onto the ground in front of the player (Game::drop).
#[no_mangle]
pub extern "C" fn pi_things_drop(slot: u32) -> bool {
    let s = store();
    s.game.drop(&s.map, slot as usize)
}

/// The pockets in `pi_things_data()`: the tool in hand, what the last action brought (item, count),
/// how many pockets are open, the tool that last broke, then each pocket (all of them, open or not)
/// and each place in the box as an item, a count and a tool's wear (its uses left as a part of a
/// new one's). Returns how many numbers.
#[no_mangle]
pub extern "C" fn pi_things_slots() -> u32 {
    let s = store();
    let t = &s.game.things;
    let d = &mut s.data;
    d[0] = t.held as f32;
    d[1] = t.got.item as f32;
    d[2] = t.got.count as f32;
    d[3] = t.size as f32;
    d[4] = t.broke as f32;
    let mut n = 5;
    for slot in t.pockets.iter().chain(t.boxed.iter()) {
        d[n] = slot.item as f32;
        d[n + 1] = slot.count as f32;
        d[n + 2] = t.wear_left(slot);
        n += 3;
    }
    n as u32
}

/// The hour of the day (0 to 24), for the fish that swim at it (crate::dex).
#[no_mangle]
pub extern "C" fn pi_things_hour(hour: f64) {
    store().game.things.hour(hour);
}

// ---------------------------------------------------------------- the encyclopedia (crate::dex)

/// The encyclopedia into `pi_things_data()`, eight numbers an entry (fish, then fossils): the item,
/// how many have been found, the largest (a fish's size), the first's day, where it is found (0 the
/// sea, 1 a river, 2 the pond, 3 underground), the hours it swims at (from, to; the same both ways
/// all day), and what the shop pays for one on an ordinary day. Returns how many entries.
#[no_mangle]
pub extern "C" fn pi_dex_data() -> u32 {
    let s = store();
    let t = &s.game.things;
    for k in 0..crate::dex::ENTRIES {
        let id = crate::dex::item_of(k);
        let e = t.dex[k];
        let (water, from, to) = if crate::dex::index_of(id).is_some_and(|k| k < crate::things::item::FISHES as usize) {
            let (w, a, b) = crate::dex::habits(id);
            (w as u8 as f32, a as f32, b as f32)
        } else {
            (3.0, 0.0, 0.0)
        };
        let d = &mut s.data[k * 8..k * 8 + 8];
        d.copy_from_slice(&[id as f32, e.count as f32, e.best as f32, e.first as f32, water, from, to, crate::shop::base_price(id) as f32]);
    }
    crate::dex::ENTRIES as u32
}

// ---------------------------------------------------------------- the shop (crate::shop)

/// What is for sale, into `pi_things_data()` as an item, a price and (for the upgrade) the pockets
/// it makes, three numbers each: returns how many offers.
#[no_mangle]
pub extern "C" fn pi_shop_stock() -> u32 {
    let s = store();
    let (stock, n) = s.game.things.stock();
    for (k, o) in stock[..n].iter().enumerate() {
        s.data[k * 3..k * 3 + 3].copy_from_slice(&[o.item as f32, o.price as f32, o.pockets as f32]);
    }
    n as u32
}

/// Buy offer `k` of the stock: 1 bought, 2 not enough coins, 3 no pocket free, 0 nothing there.
#[no_mangle]
pub extern "C" fn pi_shop_buy(k: u32) -> u32 {
    store().game.things.buy(k as usize) as u32
}

/// Sell `count` from pocket `slot`: returns the coins paid (0: not bought).
#[no_mangle]
pub extern "C" fn pi_shop_sell(slot: u32, count: u32) -> u32 {
    store().game.things.sell(slot as usize, count.min(u16::MAX as u32) as u16)
}

/// What the keeper pays for one `item` today (0: they do not buy it).
#[no_mangle]
pub extern "C" fn pi_shop_price(item: u32) -> u32 {
    store().game.things.sell_price(item.min(u16::MAX as u32) as u16)
}

/// The kind of thing the keeper pays extra for today (shop::kind).
#[no_mangle]
pub extern "C" fn pi_shop_featured() -> u32 {
    store().game.things.featured() as u32
}

#[no_mangle]
pub extern "C" fn pi_shop_wallet() -> u32 {
    store().game.things.wallet
}

#[no_mangle]
pub extern "C" fn pi_shop_bank() -> u32 {
    store().game.things.bank
}

/// The part of themselves savings earn each day (0.002).
#[no_mangle]
pub extern "C" fn pi_shop_rate() -> f64 {
    crate::shop::DAILY_RATE
}

/// The interest the last new day paid into savings.
#[no_mangle]
pub extern "C" fn pi_shop_interest() -> u32 {
    store().game.things.interest
}

/// Coins from the wallet into savings: returns how many went.
#[no_mangle]
pub extern "C" fn pi_shop_deposit(coins: u32) -> u32 {
    store().game.things.deposit(coins)
}

/// Coins from savings into the wallet: returns how many came.
#[no_mangle]
pub extern "C" fn pi_shop_withdraw(coins: u32) -> u32 {
    store().game.things.withdraw(coins)
}

#[no_mangle]
pub extern "C" fn pi_things_data() -> *mut f32 {
    store().data.as_mut_ptr()
}

/// How many numbers `pi_things_data()` holds.
#[no_mangle]
pub extern "C" fn pi_things_data_len() -> u32 {
    DATA_LEN as u32
}

#[no_mangle]
pub extern "C" fn pi_things_view_data() -> *mut f32 {
    store().view.as_mut_ptr()
}

/// How many numbers `pi_things_view_data()` holds.
#[no_mangle]
pub extern "C" fn pi_things_view_len() -> u32 {
    (MAX_VIEW * VIEW_FIELDS) as u32
}

/// What of the island's things to draw, into `pi_things_view_data()` (things::Things::view):
/// returns how many entries.
#[no_mangle]
pub extern "C" fn pi_things_view() -> u32 {
    let s = store();
    s.game.things.view(&s.map, &mut s.view) as u32
}

/// The fishing line from the rod's tip (x, y, z, where the host draws it) to the float, into
/// `pi_out()` as `things::LINE_POINTS` points of three numbers (things::Things::line): returns how
/// many points, 0 when there is no line.
#[no_mangle]
pub extern "C" fn pi_things_line(x: f64, y: f64, z: f64) -> u32 {
    let s = store();
    s.game.things.line(&s.map, [x, y, z], &mut s.out) as u32
}

/// A fish's shadow (things::OUTLINE) for one of shadow size 1, into `pi_out()`: for each point from
/// the tail to the head, how far along it from the middle and the half width there, in tiles (a
/// view entry's value scales both). Returns how many points.
#[no_mangle]
pub extern "C" fn pi_fish_outline() -> u32 {
    use crate::things::{OUTLINE, SHADOW_LENGTH, SHADOW_WIDTH};
    let out = &mut store().out;
    for (k, &(along, half)) in OUTLINE.iter().enumerate() {
        out[k * 2] = along * SHADOW_LENGTH;
        out[k * 2 + 1] = half * SHADOW_WIDTH;
    }
    OUTLINE.len() as u32
}

/// A number that moves whenever anything the interfaces show of the things does (the pockets, the
/// box, the tool in hand, the coins, the day, the encyclopedia): read each frame, and the rest read
/// again only when it moves (things::Things::version).
#[no_mangle]
pub extern "C" fn pi_things_version() -> u32 {
    store().game.things.version()
}

/// What to keep between runs, into `pi_things_data()`: returns how many numbers.
#[no_mangle]
pub extern "C" fn pi_things_save() -> u32 {
    let s = store();
    s.game.things.save(&mut s.data) as u32
}

/// Back as kept, from the first `n` numbers of `pi_things_data()`. False when the save is not of this
/// version or this island.
#[no_mangle]
pub extern "C" fn pi_things_load(n: u32) -> bool {
    let s = store();
    let n = (n as usize).min(DATA_LEN);
    s.game.things.load(&s.data[..n])
}

/// The corners still ahead on a walk to a point, in `pi_path()` (the last is where it ends).
/// Returns how many; 0 when the player is not walking to one.
#[no_mangle]
pub extern "C" fn pi_game_goal() -> u32 {
    let s = store();
    let mut corners = [Point::default(); MAX_PATH];
    let n = s.game.corners_ahead(&mut corners);
    for (k, p) in corners[..n].iter().enumerate() {
        s.path[k * 2] = p.x;
        s.path[k * 2 + 1] = p.z;
    }
    n as u32
}

/// The player's pose in `out`, by `pose_out`'s numbers.
#[no_mangle]
pub extern "C" fn pi_game_pose() -> *const f64 {
    let s = store();
    let p = s.game.pose();
    let o = &mut s.out;
    (o[pose_out::BOB], o[pose_out::LEAN], o[pose_out::HEAD]) = (p.bob, p.lean, p.head);
    (o[pose_out::ARM_L], o[pose_out::ARM_R], o[pose_out::ARM_OUT]) = (p.arm_l, p.arm_r, p.arm_out);
    (o[pose_out::LEG_L], o[pose_out::LEG_R], o[pose_out::BREATH]) = (p.leg_l, p.leg_r, p.breath);
    s.out.as_ptr()
}

/// pi_game_pose's numbers, by their place in `out` (core.h `POSE_*`, src/core/game.ts `POSE`).
pub mod pose_out {
    pub const BOB: usize = 0;
    pub const LEAN: usize = 1;
    pub const HEAD: usize = 2;
    pub const ARM_L: usize = 3;
    pub const ARM_R: usize = 4;
    pub const ARM_OUT: usize = 5;
    pub const LEG_L: usize = 6;
    pub const LEG_R: usize = 7;
    pub const BREATH: usize = 8;
}
