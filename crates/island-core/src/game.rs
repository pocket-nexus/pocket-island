//! The player's game: where they are (on the island or in the house), how they walk there each
//! frame, the door between the two, and the fade while they go through it. The browser and the
//! console both run it; they hand it the stick and read back where the player is and how they
//! stand, and draw that.
//!
//! A frame is `step`: the stick (or a walk to a clicked point) moves the walker by the place's
//! rules; outdoors, standing at the door and pushing toward it goes in; in the house, walking out
//! through the doorway comes out. Going through takes `FADE` seconds each way, and the place
//! changes in the middle, when `Events::PLACE` is raised.
//!
//! Outdoors the player also acts on the island's things (`act`, crate::things): while an action plays
//! out they stand still, and with a line out, moving the stick brings it in. A step's events include
//! the things' outcomes (things::Outcome, from 16 up).

use crate::indoors::RoomWorld;
use crate::island::{IslandMap, GRASS, PATH, SAND};
use crate::math::{abs, floor, hypot, min};
use crate::pose::{act_pose, pose, Doing, Pose};
use crate::things::{Act, Press, Things};
use crate::walk::{find_path, step, Input, PathScratch, Point, WalkWorld, Walker, WALKER_RADIUS};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Place {
    Island = 0,
    House = 1,
}

/// Seconds the screen takes to fade out, and again to come back.
pub const FADE: f64 = 0.24;
const MAX_CORNERS: usize = 96;

/// What happened during a step.
pub struct Events;
impl Events {
    /// The place changed (in the middle of a fade, or at once).
    pub const PLACE: u32 = 1;
    /// The player came to the door, or left it.
    pub const DOOR: u32 = 2;
    /// A walk to a point ended.
    pub const ARRIVED: u32 = 4;
    /// A fade began.
    pub const FADING: u32 = 8;
    /// A foot came down (`Game::surface` says on what), above the things' outcomes.
    pub const STEP: u32 = 1 << 16;
}

/// What is underfoot, for a step's sound.
pub mod surface {
    pub const NONE: u8 = 0;
    pub const GRASS: u8 = 1;
    pub const SAND: u8 = 2;
    pub const PATH: u8 = 3;
    pub const WOOD: u8 = 4;
    pub const STONE: u8 = 5;
    pub const RUG: u8 = 6;
    /// The room's floor, as its flooring is (the host knows the finish).
    pub const FLOOR: u8 = 7;
}

#[derive(Clone, Copy)]
struct Goal {
    path: [Point; MAX_CORNERS],
    len: usize,
    next: usize,
    stuck: f64,
    enter: bool,
}

#[derive(Clone, Copy)]
struct Passing {
    t: f64,
    to: Place,
    /// Where to stand in the house, when going in somewhere other than the doorway.
    at: Option<(f64, f64, f64)>,
    changed: bool,
}

pub struct Game {
    pub place: Place,
    pub walker: Walker,
    /// Where the player stands on the island while they are in the house.
    pub outside: Walker,
    pub near_door: bool,
    pub seconds: f64,
    pub room: RoomWorld,
    goal: Option<Goal>,
    passing: Option<Passing>,
    /// The island's things and the player's pockets.
    pub things: Things,
}

impl Game {
    pub const EMPTY: Game = Game {
        place: Place::Island,
        walker: Walker { x: 0.0, z: 0.0, y: 0.0, yaw: 0.0, speed: 0.0, phase: 0.0 },
        outside: Walker { x: 0.0, z: 0.0, y: 0.0, yaw: 0.0, speed: 0.0, phase: 0.0 },
        near_door: false,
        seconds: 0.0,
        room: RoomWorld::EMPTY,
        goal: None,
        passing: None,
        things: Things::EMPTY,
    };

    /// Put the player outdoors at (x, z) facing `yaw`, or in the house at `house`.
    pub fn restore(&mut self, map: &IslandMap, x: f64, z: f64, yaw: f64, house: Option<(f64, f64, f64)>) {
        let y = map.height_at(x, z);
        self.outside = Walker::new(x, z, y, yaw);
        self.walker = self.outside;
        self.place = Place::Island;
        self.goal = None;
        self.passing = None;
        self.near_door = false;
        if let Some(at) = house {
            self.change(map, Place::House, Some(at));
        }
    }

    /// The fade's strength, 0 to 1 and back while going through the door.
    pub fn fade(&self) -> f64 {
        match self.passing {
            Some(p) => if p.t <= FADE { p.t / FADE } else { (2.0 - p.t / FADE).max(0.0) },
            None => 0.0,
        }
    }

    pub fn walking_to(&self) -> bool {
        self.goal.is_some()
    }

    /// The corners still ahead on a walk to a point, the last being where it ends; 0 when there is
    /// no such walk.
    pub fn corners_ahead(&self, out: &mut [Point]) -> usize {
        let Some(goal) = self.goal.as_ref() else { return 0 };
        let ahead = &goal.path[goal.next..goal.len];
        let n = ahead.len().min(out.len());
        out[..n].copy_from_slice(&ahead[..n]);
        n
    }

    /// Into the house: at the doorway, or at `at` (x, z, yaw in the room's tiles).
    pub fn enter(&mut self, map: &IslandMap, instant: bool, at: Option<(f64, f64, f64)>) -> u32 {
        self.through(map, Place::House, instant, at)
    }

    /// Out to the island, in front of the door.
    pub fn exit(&mut self, map: &IslandMap, instant: bool) -> u32 {
        self.through(map, Place::Island, instant, None)
    }

    fn through(&mut self, map: &IslandMap, to: Place, instant: bool, at: Option<(f64, f64, f64)>) -> u32 {
        if self.passing.is_some() {
            return 0;
        }
        self.goal = None;
        if instant {
            self.change(map, to, at);
            return Events::PLACE;
        }
        self.passing = Some(Passing { t: 0.0, to, at, changed: false });
        Events::FADING
    }

    fn change(&mut self, map: &IslandMap, to: Place, at: Option<(f64, f64, f64)>) {
        match to {
            Place::House => {
                if self.place == Place::Island {
                    self.outside = self.walker;
                }
                let (ex, ez, eyaw) = self.room.entrance();
                let (x, z, yaw) = match at {
                    Some((x, z, yaw)) => {
                        let (fx, fz) = self.room.nearest_free(x, z);
                        (fx, fz, yaw)
                    }
                    None => (ex, ez, eyaw),
                };
                self.walker = Walker::new(x, z, 0.0, yaw);
                self.near_door = false;
            }
            Place::Island => {
                if self.place == Place::House {
                    let (dx, dz) = (map.door[0], map.door[1] + 0.75);
                    self.outside = Walker::new(dx, dz, map.height_at(dx, dz), 0.0);
                }
                self.walker = self.outside;
            }
        }
        self.place = to;
    }

    /// Walk to a point in the place's tiles, round what is in the way; `enter` goes in at the end.
    pub fn walk_to(&mut self, map: &IslandMap, scratch: &mut PathScratch, x: f64, z: f64, enter: bool) -> bool {
        let from = Point { x: self.walker.x, z: self.walker.z };
        let mut path = [Point::default(); MAX_CORNERS];
        let found = match self.place {
            Place::Island => find_path(map, from, Point { x, z }, [0.0, 0.0, map.w as f64, map.d as f64], 0.5, WALKER_RADIUS, 20_000, scratch, &mut path),
            Place::House => {
                let bounds = [0.0, 0.0, self.room.w, self.room.d];
                find_path(&self.room, from, Point { x, z }, bounds, 0.5, WALKER_RADIUS, 20_000, scratch, &mut path)
            }
        };
        match found {
            Some(len) if len > 0 => {
                self.goal = Some(Goal { path, len, next: 0, stuck: 0.0, enter });
                true
            }
            _ => {
                self.goal = None;
                false
            }
        }
    }

    /// After the room changed: the player steps aside from whatever now stands where they were.
    pub fn settle(&mut self) {
        if self.place != Place::House {
            return;
        }
        let (x, z) = self.room.nearest_free(self.walker.x, self.walker.z);
        self.walker.x = x;
        self.walker.z = z;
    }

    fn follow(&mut self, map: &IslandMap, run: bool, events: &mut u32) -> Input {
        let Some(goal) = self.goal.as_mut() else { return Input::default() };
        let mut p = goal.path[goal.next];
        let last = goal.next == goal.len - 1;
        let mut l = hypot(p.x - self.walker.x, p.z - self.walker.z);
        if l < 0.3 && !last {
            goal.next += 1;
            p = goal.path[goal.next];
            l = hypot(p.x - self.walker.x, p.z - self.walker.z);
        }
        let last = goal.next == goal.len - 1;
        if (last && l < 0.12) || goal.stuck > 0.6 {
            let enter = goal.enter;
            self.goal = None;
            *events |= Events::ARRIVED;
            if enter && self.place == Place::Island && hypot(self.walker.x - map.door[0], self.walker.z - map.door[1]) < 1.2 {
                *events |= self.enter(map, false, None);
            }
            return Input::default();
        }
        let mut rest = l;
        for k in goal.next..goal.len - 1 {
            rest += hypot(goal.path[k + 1].x - goal.path[k].x, goal.path[k + 1].z - goal.path[k].z);
        }
        let ease = if last { min(1.0, l * 2.5 + 0.25) } else { 1.0 };
        Input { x: (p.x - self.walker.x) / l * ease, z: (p.z - self.walker.z) / l * ease, run: run || rest > 5.0 }
    }

    /// One frame of `dt` seconds with the stick at (sx, sz) (world axes, up is -z) and run held or
    /// not; `busy` while a dialog has the buttons. Returns what happened (`Events`).
    pub fn step(&mut self, map: &IslandMap, sx: f64, sz: f64, run: bool, busy: bool, dt: f64) -> u32 {
        let mut events = 0;
        self.seconds += dt;
        if let Some(mut p) = self.passing {
            p.t += dt;
            if p.t >= FADE && !p.changed {
                p.changed = true;
                self.change(map, p.to, p.at);
                events |= Events::PLACE;
            }
            self.passing = if p.t >= FADE * 2.0 { None } else { Some(p) };
        }
        let acting = self.things.busy();
        let held = !busy && self.passing.is_none() && !acting;
        if held && self.things.float.out && hypot(sx, sz) > 0.15 {
            self.things.line_in();
        }
        let input = if !held || self.things.float.out {
            Input::default()
        } else if hypot(sx, sz) > 0.15 {
            self.goal = None;
            Input { x: sx, z: sz, run }
        } else {
            self.follow(map, run, &mut events)
        };
        let before = self.walker;
        self.walker = match self.place {
            Place::Island => step(&before, &input, dt, map, WALKER_RADIUS),
            Place::House => step(&before, &input, dt, &self.room, WALKER_RADIUS),
        };
        if let Some(goal) = self.goal.as_mut() {
            if hypot(self.walker.x - before.x, self.walker.z - before.z) < 0.002 && hypot(input.x, input.z) > 0.1 {
                goal.stuck += dt;
            }
        }
        // A foot comes down at each end of the legs' swing (the pose's sin(phase π) at ±1).
        if self.walker.speed > 0.05 && floor(self.walker.phase + 0.5) != floor(before.phase + 0.5) {
            events |= Events::STEP;
        }
        if self.place == Place::Island {
            events |= self.things.step(map, self.walker.x, self.walker.z, dt);
        }
        match self.place {
            Place::Island => {
                self.outside = self.walker;
                let at = map.at_door(self.walker.x, self.walker.z, self.walker.yaw);
                if at != self.near_door {
                    self.near_door = at;
                    events |= Events::DOOR;
                }
                if at && input.z < -0.5 && self.goal.is_none() && held {
                    events |= self.enter(map, false, None);
                }
            }
            Place::House => {
                if self.passing.is_none() && self.room.out_of_door(self.walker.x, self.walker.z) {
                    events |= self.exit(map, false);
                }
            }
        }
        events
    }

    /// A press outdoors (things::Press): in at the door when standing there (not for picking up),
    /// else the things' (picking up, shaking, chopping, digging, casting, reeling, talking at the
    /// shop's counter). Returns events and outcomes.
    pub fn act(&mut self, map: &IslandMap, press: Press) -> u32 {
        if self.place != Place::Island || self.passing.is_some() {
            return 0;
        }
        if press != Press::Pick && self.near_door && !self.things.busy() && !self.things.float.out {
            return self.enter(map, false, None);
        }
        self.goal = None;
        let w = self.walker;
        self.things.press(map, w.x, w.z, w.yaw, press)
    }

    /// What the player stands on (`surface`): a bridge's planks, the doorstep's stone, the ground's
    /// grass, sand or path; in the house a rug, or the floor.
    pub fn surface(&self, map: &IslandMap) -> u8 {
        let (x, z) = (self.walker.x, self.walker.z);
        match self.place {
            Place::House => if self.room.on_rug(x, z) { surface::RUG } else { surface::FLOOR },
            Place::Island => {
                let d = map.doorstep();
                if map.bridge_at(x, z).is_some() {
                    surface::WOOD
                } else if x >= d[0] && x <= d[2] && z >= d[1] - 0.2 && z <= d[3] {
                    surface::STONE
                } else {
                    match map.ground_at(floor(x) as i64, floor(z) as i64) {
                        GRASS => surface::GRASS,
                        SAND => surface::SAND,
                        PATH => surface::PATH,
                        _ => surface::NONE,
                    }
                }
            }
        }
    }

    /// What a press would do now (things::hint_for; at the door, going in is the interface's to say).
    pub fn hint(&self, map: &IslandMap, press: Press) -> u8 {
        if self.place != Place::Island || (self.near_door && press != Press::Pick) {
            return 0;
        }
        self.things.hint_for(map, self.walker.x, self.walker.z, self.walker.yaw, press)
    }

    /// How the player stands now: walking, or doing something with their hands.
    pub fn pose(&self) -> Pose {
        let base = pose(self.walker.phase, self.walker.speed, self.seconds);
        let a = self.things.action;
        let doing = match a.act {
            Act::Pick => Some(Doing::Pick),
            Act::Pull => Some(Doing::Pull),
            Act::Shake => Some(Doing::Shake),
            Act::Chop => Some(Doing::Chop),
            Act::Dig => Some(Doing::Dig),
            Act::Cast => Some(Doing::Cast),
            Act::Reel => Some(Doing::Reel),
            Act::Show => Some(Doing::Show),
            Act::Swing => Some(Doing::Swing),
            Act::None => None,
        };
        match doing {
            Some(d) if self.place == Place::Island => act_pose(d, if a.length > 0.0 { a.t / a.length } else { 1.0 }, base),
            _ if self.place == Place::Island && self.things.float.out => act_pose(Doing::Fishing, 0.0, base),
            _ => base,
        }
    }

    /// The ground's height under a point in the current place, as the rules see it.
    pub fn height(&self, map: &IslandMap, x: f64, z: f64) -> f64 {
        match self.place {
            Place::Island => map.height_at(x, z),
            Place::House => self.room.height(x, z),
        }
    }
}

/// Whether two walkers stand in the same place, for tests.
pub fn same_spot(a: &Walker, b: &Walker) -> bool {
    abs(a.x - b.x) < 1e-9 && abs(a.z - b.z) < 1e-9
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::island::{IslandMap, Prop, GRASS};
    use crate::room::{Kind, Layer, Placement, Room, Spec};

    /// A 12 × 12 island of grass on the first tier, with a 4 × 3 house whose door is at (6, 6).
    fn island() -> Box<IslandMap> {
        let mut m: Box<IslandMap> = Box::new(IslandMap::EMPTY);
        m.reset(12, 12);
        m.tier[..144].fill(1);
        m.ground[..144].fill(GRASS);
        m.house = [4.0, 3.0, 8.0, 6.0];
        m.door = [6.0, 6.0];
        m.add_prop(Prop { x: 9.5, z: 9.5, radius: 0.4 });
        m
    }

    fn game(m: &IslandMap) -> Box<Game> {
        let mut g: Box<Game> = Box::new(Game::EMPTY);
        let specs = [Spec { kind: Kind::Floor, size: [2.0, 2.0], surface: None, surface_y: 0.0, hang: 0.0 }];
        let items = [Placement { item: 0, layer: Layer::Floor, x: 1.0, z: 1.0, rot: 0, wall: None, u: 0.0, v: 0.0, host: None }];
        g.room.set(&Room { w: 6.0, d: 6.0, items: &items }, &specs);
        g.restore(m, 6.0, 7.0, 0.0, None);
        g
    }

    fn run(g: &mut Game, m: &IslandMap, sx: f64, sz: f64, seconds: f64) -> u32 {
        let mut events = 0;
        let mut t = 0.0;
        while t < seconds {
            events |= g.step(m, sx, sz, false, false, 1.0 / 60.0);
            t += 1.0 / 60.0;
        }
        events
    }

    #[test]
    fn pushing_into_the_door_goes_in_after_the_fade() {
        let m = island();
        let mut g = game(&m);
        let mut events = 0;
        while g.place == Place::Island {
            events |= run(&mut g, &m, 0.0, -1.0, 1.0 / 60.0);
            assert!(g.seconds < 2.0, "never went in");
        }
        assert!(events & Events::DOOR != 0, "came to the door");
        assert!(events & Events::FADING != 0 && events & Events::PLACE != 0);
        // Just inside the doorway, facing in; the stick does nothing until the fade is over.
        assert!((g.walker.x - 3.0).abs() < 1e-9 && (g.walker.z - 5.55).abs() < 1e-9);
        run(&mut g, &m, 0.0, 0.0, 0.3);
        assert_eq!(g.fade(), 0.0);
    }

    #[test]
    fn out_through_the_doorway_is_back_at_the_door() {
        let m = island();
        let mut g = game(&m);
        g.enter(&m, true, None);
        run(&mut g, &m, 0.0, 1.0, 1.2);
        assert_eq!(g.place, Place::Island);
        assert!((g.walker.x - 6.0).abs() < 0.2 && g.walker.z > 6.5);
    }

    #[test]
    fn a_click_walks_round_the_tree() {
        let m = island();
        let mut g = game(&m);
        // All zeros, as PathScratch::EMPTY is (built on the heap: it is too large for a test's stack).
        let mut scratch: Box<PathScratch> = unsafe { Box::new_zeroed().assume_init() };
        assert!(g.walk_to(&m, &mut scratch, 10.5, 10.5, false));
        let events = run(&mut g, &m, 0.0, 0.0, 6.0);
        assert!(events & Events::ARRIVED != 0);
        assert!(hypot(g.walker.x - 10.5, g.walker.z - 10.5) < 0.2);
    }

    #[test]
    fn the_corners_ahead_end_where_the_walk_ends_and_go_with_it() {
        let m = island();
        let mut g = game(&m);
        let mut scratch: Box<PathScratch> = unsafe { Box::new_zeroed().assume_init() };
        let mut corners = [Point::default(); 64];
        assert_eq!(g.corners_ahead(&mut corners), 0, "no walk, no corners");
        assert!(g.walk_to(&m, &mut scratch, 10.5, 10.5, false));
        let n = g.corners_ahead(&mut corners);
        assert!(n >= 1);
        assert!(hypot(corners[n - 1].x - 10.5, corners[n - 1].z - 10.5) < 1e-9);
        run(&mut g, &m, 0.0, 0.0, 6.0);
        assert_eq!(g.corners_ahead(&mut corners), 0, "none once there");
        // The stick takes over from a walk to a point.
        assert!(g.walk_to(&m, &mut scratch, 2.5, 10.5, false));
        run(&mut g, &m, 1.0, 0.0, 0.2);
        assert_eq!(g.corners_ahead(&mut corners), 0);
    }

    #[test]
    fn furniture_put_where_the_player_stands_moves_them_aside() {
        let m = island();
        let mut g = game(&m);
        g.enter(&m, true, Some((1.0, 1.0, 0.0)));
        // The bed covers (0..2, 0..2): the player stands beside it.
        assert!(g.room.fits(g.walker.x, g.walker.z, WALKER_RADIUS, 0.0));
    }
}
