//! The island's things and the player's pockets: what lies about (branches, shells, weeds, fallen
//! fruit, wood, where a fossil is buried), the trees' fruit and wood, the fish in the water, and what
//! the player carries and keeps in the house's box.
//!
//! A day's things come with the date (`new_day`): the same date makes the same things on every run.
//! Shells and branches wash in and fall each day, and the last day's go; weeds grow and stay until
//! pulled; four fossils are buried somewhere new; fruit grows back two days after a tree is shaken;
//! each tree gives three pieces of wood a day. What the player drops stays where it fell.
//!
//! The player acts with A (`Things::press` through `Game::act`): picks up or pulls what is at their feet
//! or just ahead, and otherwise uses what is in their hand: with nothing, shakes a tree; with the
//! axe, chops one; with the shovel, digs where a fossil is; with the rod, casts into water ahead,
//! and again to reel in, which hooks the fish if it has just bitten. At the shop's counter A talks
//! to its keeper (the shop itself is `crate::shop`). A tool wears with each use (a chop, a dig, a
//! cast) and breaks when it has none left.
//!
//! Fish swim about the water near the player, seen as their shadows (`OUTLINE`), as on the island
//! games: the kind's size is the shadow's, and a fish mostly rests. The cast's float flies in an arc,
//! the line (`line`) following it and settling to hang. A fish comes to the float only when it
//! lands where the fish can see it (ahead of it, not too far), and one it lands on is frightened
//! off; so is any a player runs past. A fish that has come noses at the float a few times, then
//! bites: A then hooks it and three hard pulls (`Act::Tug`) land it, and A before then sends it off.

use crate::island::{IslandMap, GRASS, PATH, SAND, SEA, WATER};
use crate::math::{abs, cos, ease, floor, hypot, sin, PI};

// ---------------------------------------------------------------- items

/// What can be carried, by number (the interfaces name them, src/items/items.ts).
pub mod item {
    pub const NONE: u16 = 0;
    pub const SHOVEL: u16 = 1;
    pub const AXE: u16 = 2;
    pub const ROD: u16 = 3;
    pub const BRANCH: u16 = 10;
    pub const WOOD: u16 = 11;
    pub const WEED: u16 = 12;
    /// Shells: a scallop, a cowrie, a conch.
    pub const SHELL: u16 = 20;
    pub const SHELLS: u16 = 3;
    /// Fruit, by the tree it grows on: an orange, an apple, a peach.
    pub const FRUIT: u16 = 30;
    pub const FRUITS: u16 = 3;
    /// Fossils: an ammonite, a trilobite, a shark's tooth, a fern in stone.
    pub const FOSSIL: u16 = 40;
    pub const FOSSILS: u16 = 4;
    /// Fish: five of the sea, four of the river, two of the pond.
    pub const FISH: u16 = 50;
    pub const FISHES: u16 = 11;
    /// Ten more pockets, from the shop: never carried, it opens them.
    pub const POCKET_UPGRADE: u16 = 90;
    /// A piece of furniture, by the catalogue's number for it (src/furniture/codes.ts, from 1) and
    /// which of its looks: `FURNITURE + code × LOOKS + look`.
    pub const FURNITURE: u16 = 1000;
    pub const LOOKS: u16 = 8;

    /// The item a piece of furniture in look `variant` is carried as (0 when it cannot be).
    pub fn furniture(code: u16, variant: u8) -> u16 {
        if code == 0 || variant as u16 >= LOOKS || code > (u16::MAX - FURNITURE) / LOOKS - 1 {
            return NONE;
        }
        FURNITURE + code * LOOKS + variant as u16
    }

    /// The piece of furniture and look an item is, when it is one.
    pub fn furniture_of(id: u16) -> Option<(u16, u8)> {
        (id >= FURNITURE + LOOKS).then(|| ((id - FURNITURE) / LOOKS, ((id - FURNITURE) % LOOKS) as u8))
    }

    pub fn is_tool(id: u16) -> bool {
        (SHOVEL..=ROD).contains(&id)
    }

    /// How many times a new tool is used before it breaks (0: it is not a tool).
    pub fn uses(id: u16) -> u16 {
        match id {
            SHOVEL => 40,
            AXE => 50,
            ROD => 40,
            _ => 0,
        }
    }

    /// How many of one go in a pocket.
    pub fn stack(id: u16) -> u16 {
        match id {
            BRANCH | WOOD | WEED => 30,
            x if (SHELL..SHELL + SHELLS).contains(&x) => 10,
            x if (FRUIT..FRUIT + FRUITS).contains(&x) => 10,
            _ => 1,
        }
    }

    pub fn known(id: u16) -> bool {
        furniture_of(id).is_some()
            || is_tool(id)
            || matches!(id, BRANCH | WOOD | WEED)
            || (SHELL..SHELL + SHELLS).contains(&id)
            || (FRUIT..FRUIT + FRUITS).contains(&id)
            || (FOSSIL..FOSSIL + FOSSILS).contains(&id)
            || (FISH..FISH + FISHES).contains(&id)
    }
}

/// What a view entry shows (`Things::view`): an item lying on the ground by its number, or one of
/// these.
pub mod show {
    /// Where a fossil is buried: a mound of loose earth.
    pub const BURIED: u16 = 100;
    /// A fish's shadow in the water; the entry's last value is how large it is drawn (its kind's
    /// size, growing as the fish comes and shrinking as it flees).
    pub const FISH: u16 = 101;
    /// The rod's float; the last value is how far it dips.
    pub const FLOAT: u16 = 102;
    /// Something dropped that has no model of its own lying down: a tied bundle.
    pub const BUNDLE: u16 = 103;
    /// A tree being shaken or chopped (x, z its trunk): the last value is how far through.
    pub const SHAKE: u16 = 104;
    /// The shop's keeper behind the counter; the last value is how far they rise as they breathe.
    pub const KEEPER: u16 = 105;
}

/// What a press of A would do now (`Things::hint`), for the interfaces' legends.
pub mod hint {
    pub const NONE: u8 = 0;
    pub const PICK: u8 = 1;
    pub const PULL: u8 = 2;
    pub const SHAKE: u8 = 3;
    pub const CHOP: u8 = 4;
    pub const DIG: u8 = 5;
    pub const CAST: u8 = 6;
    pub const REEL: u8 = 7;
    /// At the shop's counter: talking to its keeper opens the shop.
    pub const TALK: u8 = 8;
    /// In the house (crate::handle): A takes hold of the piece ahead; Y picks up what is ahead.
    pub const GRAB: u8 = 9;
    pub const LIFT: u8 = 10;
}

/// Which button a press is: the browser's one key does whatever there is to do (picking up first);
/// on the console, as on the handheld island games, A uses what is in hand (or talks, or shakes a
/// tree) and never picks up, and Y only picks up.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Press {
    Any = 0,
    Use = 1,
    Pick = 2,
}

impl Press {
    pub fn from(n: u32) -> Press {
        match n {
            1 => Press::Use,
            2 => Press::Pick,
            _ => Press::Any,
        }
    }
}

/// What an action did, for the interfaces to say: flags among a press's or a step's events.
pub struct Outcome;
impl Outcome {
    /// An item went into the pockets (the outcome's item and count).
    pub const GOT: u32 = 16;
    /// The pockets are full: what was there stays.
    pub const FULL: u32 = 32;
    /// A fish took the float: press now.
    pub const BITE: u32 = 64;
    /// A fish was landed (the outcome's item).
    pub const CAUGHT: u32 = 128;
    /// A fish got away.
    pub const ESCAPED: u32 = 256;
    /// Something fell from a tree, or wood came off it.
    pub const FELL: u32 = 512;
    /// The player spoke to the shop's keeper: the interface opens the shop.
    pub const SHOP: u32 = 1024;
    /// The tool in hand broke (the outcome's item).
    pub const BROKE: u32 = 2048;
    /// What was caught or dug up is the first of its kind (the encyclopedia, `crate::dex`).
    pub const NEW: u32 = 4096;
    /// The moment an action takes effect (the chop, the dig, the float landing, the pick): the
    /// game's `act` says which, for its sound.
    pub const HIT: u32 = 8192;
    /// A fish nosed at the float.
    pub const NIBBLE: u32 = 16384;
    /// Something that fell from a tree came down on the ground.
    pub const LAND: u32 = 32768;
}

/// Pockets at most, and how many are open at first (the shop opens ten more at a time).
pub const POCKETS: usize = 40;
pub const POCKETS_FIRST: usize = 20;
pub const BOX: usize = 60;
pub const MAX_THINGS: usize = 160;
pub const MAX_TREES: usize = 256;
pub const MAX_FISH: usize = 8;
pub const MAX_VIEW: usize = MAX_THINGS + MAX_TREES * 3 + MAX_FISH + 5;
/// Numbers a view entry takes: what, x, y, z, yaw, and one more (see `show`).
pub const VIEW_FIELDS: usize = 6;

#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Slot {
    pub item: u16,
    pub count: u16,
    /// A tool's uses left (0 for anything else).
    pub uses: u16,
}

/// How a thing lies.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
#[repr(u8)]
pub enum Lie {
    #[default]
    Free = 0,
    /// On the ground, to pick up (or pull, a weed).
    Ground = 1,
    /// Buried: dug up with the shovel.
    Buried = 2,
    /// Falling from a tree to `x, z`; `t` runs from 0 to 1.
    Falling = 3,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Thing {
    pub item: u16,
    pub count: u16,
    /// A dropped tool's uses left.
    pub uses: u16,
    pub x: f64,
    pub z: f64,
    pub yaw: f64,
    pub lie: Lie,
    /// A falling thing's height to fall from, and how far through it is.
    pub from: f64,
    pub t: f64,
    /// Come with the day (washed away or replaced the next), not dropped.
    pub natural: bool,
}

/// What kind of tree, by what can be had from it.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
#[repr(u8)]
pub enum TreeKind {
    #[default]
    Broadleaf = 0,
    Fruit = 1,
    Cedar = 2,
    Palm = 3,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Tree {
    pub x: f64,
    pub z: f64,
    /// The model's turn and lean (src/island/props.ts), where its fruit hangs.
    pub rot: f64,
    pub variant: u8,
    pub kind: TreeKind,
    /// Fruit on the tree, and the day it was shaken off.
    pub fruit: u8,
    pub bare_since: i64,
    /// Wood taken today, and whether it has been shaken today.
    pub wood: u8,
    pub shaken: bool,
}

/// Which water a fish swims in.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
#[repr(u8)]
pub enum Water {
    #[default]
    Sea = 0,
    River = 1,
    Pond = 2,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
#[repr(u8)]
enum Swim {
    #[default]
    Gone = 0,
    Wander = 1,
    /// Coming to the float.
    Come = 2,
    /// Nosing at it; it bites after the nibbles.
    Nibble = 3,
    /// Has the float: A now hooks it.
    Bite = 4,
    /// Off, fast, and gone when out of sight.
    Flee = 5,
    /// On the line, brought in a tug at a time (`Act::Tug`), and landed after the last.
    Hooked = 6,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Fish {
    pub species: u16,
    pub x: f64,
    pub z: f64,
    pub yaw: f64,
    /// 0.5 small to 1.5 large.
    pub size: f64,
    pub water: Water,
    swim: Swim,
    /// How long it has been doing what it does, how long since it came, and how long it has had the
    /// float in sight.
    t: f64,
    age: f64,
    seen: f64,
    /// Seconds until it swims on from where it rests, or until its next nibble.
    wait: f64,
    /// Nibbles before it bites; on the line, tugs before it is landed.
    nibbles: u8,
    tx: f64,
    tz: f64,
}

/// The float where the line is cast.
#[derive(Clone, Copy, Debug, Default)]
pub struct Float {
    pub x: f64,
    pub z: f64,
    pub dip: f64,
    pub out: bool,
    /// The fish that has noticed it.
    fish: Option<usize>,
    /// Where it leaves the rod as the line is cast (the tip's height above the ground), and how far
    /// up from the straight way it flies.
    from: [f64; 3],
    arc: f64,
    /// Seconds since it came down on the water, for the line to settle.
    settled: f64,
}

/// An action under way: the player stands while it plays out; its effect comes at `hit`.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
#[repr(u8)]
pub enum Act {
    #[default]
    None = 0,
    Pick = 1,
    Pull = 2,
    Shake = 3,
    Chop = 4,
    Dig = 5,
    Cast = 6,
    Reel = 7,
    /// Holding up what was caught.
    Show = 8,
    /// A tool swung or dug where there is nothing.
    Swing = 9,
    /// A hard pull on the rod with a fish on the line, one of `TUGS`.
    Tug = 10,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Action {
    pub act: Act,
    pub t: f64,
    pub length: f64,
    hit: f64,
    done: bool,
    /// What it acts on: a thing, a tree, or the item to show.
    target: usize,
}

impl Act {
    /// How long the action lasts, and when in it its effect comes.
    fn timing(self) -> (f64, f64) {
        match self {
            Act::Pick => (0.42, 0.2),
            Act::Pull => (0.6, 0.38),
            Act::Shake => (0.9, 0.3),
            Act::Chop => (0.62, 0.36),
            Act::Dig => (0.75, 0.45),
            // The rod back and forward, the float flying from `RELEASE` to its splash.
            Act::Cast => (0.95, 0.8),
            Act::Reel => (0.4, 0.15),
            Act::Show => (1.6, 0.0),
            Act::Swing => (0.55, 0.5),
            Act::Tug => (0.46, 0.16),
            Act::None => (0.0, 0.0),
        }
    }
}

/// A small, seeded source of numbers: the same seed, the same numbers.
#[derive(Clone, Copy, Debug)]
pub struct Rng(u32);
impl Rng {
    pub fn new(seed: u32) -> Rng {
        Rng(seed.wrapping_mul(2_654_435_761).wrapping_add(0x9e37_79b9) | 1)
    }
    /// A number from 0 up to 1.
    pub fn unit(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x as f64) / 4_294_967_296.0
    }
    pub fn below(&mut self, n: usize) -> usize {
        ((self.unit() * n as f64) as usize).min(n.saturating_sub(1))
    }
}

/// How far ahead of the player A reaches, and how near counts as at their feet.
const REACH: f64 = 0.95;
const UNDERFOOT: f64 = 0.5;
/// How far a line is cast, at most.
const CAST: f64 = 3.6;
/// The fruit's place on a fruit tree's crown (src/island/props.ts hardwood), before its turn and lean.
const FRUIT_SPOTS: [[f64; 3]; 3] = [[-0.45, 1.5, 0.5], [0.42, 1.62, 0.52], [0.02, 1.95, 0.68]];
const LEAN: [f64; 3] = [0.06, -0.05, 0.03];
/// Natural weeds at most, and how many come at the start and each day after.
const WEEDS_MAX: usize = 30;
/// Fish swim in the water within this far of the player, as many as `FISH_ABOUT` at once, one more
/// coming every `FISH_EVERY` seconds while there are fewer; one farther off is gone.
const FISH_NEAR: f64 = 13.0;
const FISH_ABOUT: usize = 6;
const FISH_EVERY: f64 = 1.2;
/// A fish sees the float this far ahead of it, no wider than this either side of the way it heads
/// (the cosine of the angle off it: 60°).
const SIGHT: f64 = 2.8;
const SIGHT_COS: f64 = 0.5;
/// Seconds a fish has the float in sight before it comes to it.
const NOTICE: f64 = 0.5;
/// A float landing this near a fish frightens it off.
const SPOOK: f64 = 0.5;
/// A player going faster than a walk (running) frightens off the fish this near.
const RUN_SCARE: f64 = 4.5;
const SCARE_SPEED: f64 = crate::walk::WALK_SPEED * 1.25;
/// Seconds a shadow takes to grow in as its fish comes, and a fleeing fish's dart before it is gone.
const APPEAR: f64 = 0.8;
const FLEE: f64 = 1.6;
/// How fast a fish swims about, comes to the float and darts off (tiles a second). A fish about
/// mostly rests: from `REST.0` to `REST.1` seconds where it stops, then a little way on (`HOP`).
const WANDER_SPEED: f64 = 0.2;
const COME_SPEED: f64 = 0.6;
const FLEE_SPEED: f64 = 3.0;
const REST: (f64, f64) = (4.0, 9.0);
const HOP: (f64, f64) = (0.25, 0.8);
/// How often a fish at rest only turns where it is (up to 1.5 radians either way), so it comes to
/// face more of the water about it.
const TURN_ONLY: f64 = 0.35;
/// Seconds between a fish's nibbles at the float (from, to), and how long its bite holds the float
/// under before it is off with the bait.
const NIBBLE_EVERY: (f64, f64) = (1.4, 2.4);
const BITE_HOLD: f64 = 1.3;
/// Hooked, a fish is brought in by this many hard pulls (`Act::Tug`), each this far of the way to
/// the player; it keeps to the float at `HOOKED_SPEED`, its shadow and the float thrashing at
/// `THRASH` radians a second.
const TUGS: u8 = 3;
const TUG_IN: f64 = 0.28;
const HOOKED_SPEED: f64 = 2.5;
const THRASH: f64 = 18.0;
/// The cast: the float leaves the rod this far into it, from about the rod's tip (ahead of the
/// player and up), and rises this far over the straight way, more for a longer cast.
const RELEASE: f64 = 0.42;
const TIP_AHEAD: f64 = 0.55;
const TIP_UP: f64 = 1.45;
const ARC: (f64, f64) = (0.55, 0.18);
/// The fishing line: how many points `line` gives, how far its middle hangs below the straight way
/// (of its length) once it has settled on the water, and how long that takes.
pub const LINE_POINTS: usize = 10;
const SAG: f64 = 0.14;
const SETTLE: f64 = 0.55;

/// A fish's shadow, from its tail (`-1`) to its head (`1`): the half width at each point along it,
/// of the shadow's widest. The head end is round and wide, the tail long and thin, so the way it
/// heads shows. Both renderers draw it from these (`pi_fish_outline`), for a fish of shadow size 1
/// `SHADOW_LENGTH` tiles from its middle to its head and `SHADOW_WIDTH` from its middle to a side.
pub const SHADOW_LENGTH: f64 = 0.32;
pub const SHADOW_WIDTH: f64 = 0.15;
pub const OUTLINE_POINTS: usize = 12;
pub const OUTLINE: [(f64, f64); OUTLINE_POINTS] = [
    (-1.0, 0.0),
    (-0.82, 0.06),
    (-0.6, 0.15),
    (-0.35, 0.3),
    (-0.1, 0.5),
    (0.15, 0.72),
    (0.38, 0.9),
    (0.56, 1.0),
    (0.72, 0.97),
    (0.85, 0.85),
    (0.95, 0.6),
    (1.0, 0.0),
];

pub struct Things {
    pub pockets: [Slot; POCKETS],
    /// How many pockets are open (`POCKETS_FIRST` to `POCKETS`); the rest stay empty.
    pub size: usize,
    pub boxed: [Slot; BOX],
    /// The tool in hand (an item number), or none.
    pub held: u16,
    pub things: [Thing; MAX_THINGS],
    pub trees: [Tree; MAX_TREES],
    pub tree_count: usize,
    pub fish: [Fish; MAX_FISH],
    pub float: Float,
    pub action: Action,
    /// The day the island's things are for (days since 1970, local), or `i64::MIN` before the first.
    pub day: i64,
    /// What the last action brought, for the interfaces to say: an item and how many; and the tool
    /// that last broke.
    pub got: Slot,
    pub broke: u16,
    /// Coins in the wallet and in savings (`crate::shop`), the interest the last new day paid, and
    /// the day interest was last paid for.
    pub wallet: u32,
    pub bank: u32,
    pub interest: u32,
    pub interest_day: i64,
    /// Which way the shop's keeper faces now (they turn to a customer).
    pub keeper_yaw: f64,
    /// The encyclopedia (`crate::dex`), and the hour of the day, for the fish that swim at it.
    pub dex: [crate::dex::Entry; crate::dex::ENTRIES],
    pub hour: f64,
    /// For fish to come and go, apart from the day's numbers.
    rng: Rng,
    clock: f64,
    /// Seconds until one more fish may come.
    fish_due: f64,
}

const NO_THING: Thing = Thing { item: 0, count: 0, uses: 0, x: 0.0, z: 0.0, yaw: 0.0, lie: Lie::Free, from: 0.0, t: 0.0, natural: false };
const NO_TREE: Tree = Tree { x: 0.0, z: 0.0, rot: 0.0, variant: 0, kind: TreeKind::Broadleaf, fruit: 0, bare_since: 0, wood: 0, shaken: false };
const NO_FISH: Fish = Fish { species: 0, x: 0.0, z: 0.0, yaw: 0.0, size: 0.0, water: Water::Sea, swim: Swim::Gone, t: 0.0, age: 0.0, seen: 0.0, wait: 0.0, nibbles: 0, tx: 0.0, tz: 0.0 };
const NO_FLOAT: Float = Float { x: 0.0, z: 0.0, dip: 0.0, out: false, fish: None, from: [0.0; 3], arc: 0.0, settled: 0.0 };
pub(crate) const NO_SLOT: Slot = Slot { item: 0, count: 0, uses: 0 };

pub(crate) fn day_seed(day: i64, salt: u32) -> u32 {
    (day as u32).wrapping_mul(0x85eb_ca6b) ^ salt.wrapping_mul(0xc2b2_ae35)
}

impl Things {
    pub const EMPTY: Things = Things {
        pockets: [NO_SLOT; POCKETS],
        size: 0,
        boxed: [NO_SLOT; BOX],
        held: 0,
        things: [NO_THING; MAX_THINGS],
        trees: [NO_TREE; MAX_TREES],
        tree_count: 0,
        fish: [NO_FISH; MAX_FISH],
        float: NO_FLOAT,
        action: Action { act: Act::None, t: 0.0, length: 0.0, hit: 0.0, done: false, target: 0 },
        day: 0,
        got: NO_SLOT,
        broke: 0,
        wallet: 0,
        bank: 0,
        interest: 0,
        interest_day: 0,
        keeper_yaw: 0.0,
        dex: [crate::dex::NO_ENTRY; crate::dex::ENTRIES],
        hour: 0.0,
        // Zero, as every default here: the store then takes no room in the program's file.
        rng: Rng(0),
        clock: 0.0,
        fish_due: 0.0,
    };

    /// A first run: the tools in the pockets, nothing about, no coins, no day yet.
    pub fn reset(&mut self) {
        self.pockets = [NO_SLOT; POCKETS];
        self.size = POCKETS_FIRST;
        self.boxed = [NO_SLOT; BOX];
        for (k, tool) in [item::SHOVEL, item::AXE, item::ROD].iter().enumerate() {
            self.pockets[k] = Slot { item: *tool, count: 1, uses: item::uses(*tool) };
        }
        self.held = 0;
        self.wallet = 0;
        self.bank = 0;
        self.interest = 0;
        self.interest_day = i64::MIN;
        self.dex = [crate::dex::NO_ENTRY; crate::dex::ENTRIES];
        self.hour = 12.0;
        self.things = [NO_THING; MAX_THINGS];
        for t in self.trees[..self.tree_count].iter_mut() {
            t.fruit = if t.kind == TreeKind::Fruit { 3 } else { 0 };
            t.bare_since = 0;
            t.wood = 0;
            t.shaken = false;
        }
        self.fish = [NO_FISH; MAX_FISH];
        self.fish_due = 0.0;
        self.float = Float::default();
        self.action = Action::default();
        self.day = i64::MIN;
        self.rng = Rng::new(7);
    }

    /// The island's trees, as the recipe placed them (before `reset`).
    pub fn clear_trees(&mut self) {
        self.tree_count = 0;
    }

    pub fn add_tree(&mut self, x: f64, z: f64, rot: f64, kind: TreeKind, variant: u8) -> bool {
        if self.tree_count >= MAX_TREES {
            return false;
        }
        self.trees[self.tree_count] = Tree { x, z, rot, variant, kind, fruit: if kind == TreeKind::Fruit { 3 } else { 0 }, bare_since: 0, wood: 0, shaken: false };
        self.tree_count += 1;
        true
    }

    // ------------------------------------------------------------ the pockets

    /// The open pockets.
    pub fn open(&self) -> &[Slot] {
        &self.pockets[..self.size.min(POCKETS)]
    }

    pub(crate) fn open_mut(&mut self) -> &mut [Slot] {
        let n = self.size.min(POCKETS);
        &mut self.pockets[..n]
    }

    /// Put `count` of `id` in the pockets: onto a stack of the same that has room, then into empty
    /// pockets. Returns how many did not fit. A tool comes new.
    pub fn give(&mut self, id: u16, count: u16) -> u16 {
        give_to(self.open_mut(), id, count, item::uses(id))
    }

    pub fn pockets_have_room(&self, id: u16) -> bool {
        let stack = item::stack(id);
        self.open().iter().any(|s| s.item == 0 || (s.item == id && s.count < stack))
    }

    /// The tool in hand, if it is no longer in the pockets, is put away.
    pub(crate) fn keep_hold(&mut self) {
        if self.held != 0 && !self.open().iter().any(|p| p.item == self.held) {
            self.held = 0;
        }
    }

    /// A use of `tool`: it wears, and breaks with its last use (the outcome `BROKE`; `broke` says
    /// which).
    fn wear(&mut self, tool: u16) -> u32 {
        let Some(k) = self.open().iter().position(|s| s.item == tool) else { return 0 };
        let s = &mut self.pockets[k];
        s.uses = s.uses.saturating_sub(1);
        if s.uses > 0 {
            return 0;
        }
        self.pockets[k] = NO_SLOT;
        self.broke = tool;
        self.keep_hold();
        Outcome::BROKE
    }

    /// The tools in the pockets, in order, after empty hands.
    fn tools(&self) -> ([u16; 4], usize) {
        let mut out = [0u16; 4];
        let mut n = 1;
        for s in self.open().iter() {
            if item::is_tool(s.item) && n < 4 && !out[..n].contains(&s.item) {
                out[n] = s.item;
                n += 1;
            }
        }
        (out, n)
    }

    /// The next tool in hand, `dir` 1 forward or -1 back, empty hands among them.
    pub fn cycle(&mut self, dir: i32) {
        let (tools, n) = self.tools();
        let at = tools[..n].iter().position(|&t| t == self.held).unwrap_or(0) as i32;
        self.held = tools[((at + dir).rem_euclid(n as i32)) as usize];
        if self.held != item::ROD {
            self.float.out = false;
        }
    }

    /// Take the tool in pocket `slot` in hand (or put it away, if it is in hand).
    pub fn hold(&mut self, slot: usize) {
        let Some(s) = self.open().get(slot) else { return };
        if !item::is_tool(s.item) {
            return;
        }
        self.held = if self.held == s.item { 0 } else { s.item };
    }

    /// A pocket into the box (in the house). False when the box has no room for it.
    pub fn store(&mut self, slot: usize) -> bool {
        let Some(s) = self.open().get(slot).copied() else { return false };
        if s.item == 0 {
            return false;
        }
        let left = give_to(&mut self.boxed, s.item, s.count, s.uses);
        self.pockets[slot].count = left;
        if left == 0 {
            self.pockets[slot] = NO_SLOT;
            self.keep_hold();
        }
        left < s.count
    }

    /// From the box into the pockets. False when the pockets have no room for it.
    pub fn take(&mut self, slot: usize) -> bool {
        let Some(s) = self.boxed.get(slot).copied() else { return false };
        if s.item == 0 {
            return false;
        }
        let left = give_to(self.open_mut(), s.item, s.count, s.uses);
        self.boxed[slot].count = left;
        if left == 0 {
            self.boxed[slot] = NO_SLOT;
        }
        left < s.count
    }

    /// A pocket onto the ground in front of the player at (x, z) facing `yaw`. False with nowhere free,
    /// or for a piece of furniture.
    pub fn drop(&mut self, map: &IslandMap, slot: usize, x: f64, z: f64, yaw: f64) -> bool {
        let Some(s) = self.open().get(slot).copied() else { return false };
        // Furniture is put down in the house (crate::handle), never on the island.
        if s.item == 0 || item::furniture_of(s.item).is_some() {
            return false;
        }
        for k in 0..12 {
            let a = yaw + [0.0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, PI, 0.35, -0.35, 1.05, -1.05][k];
            let r = if k < 8 { 0.8 } else { 1.5 };
            let (px, pz) = (x + sin(a) * r, z + cos(a) * r);
            if self.free_spot(map, px, pz, 0.5) {
                if !self.place(Thing { item: s.item, count: s.count, uses: s.uses, x: px, z: pz, yaw: a * 2.0, lie: Lie::Ground, from: 0.0, t: 0.0, natural: false }) {
                    return false;
                }
                self.pockets[slot] = NO_SLOT;
                self.keep_hold();
                return true;
            }
        }
        false
    }

    // ------------------------------------------------------------ the day

    /// The island's things for `day` (days since 1970, local). On the same day it does nothing; on a
    /// later one, yesterday's shells, branches and buried fossils go and today's come, weeds grow,
    /// fruit grows back on trees shaken two days before, and every tree has its wood again.
    pub fn new_day(&mut self, map: &IslandMap, day: i64) {
        if day == self.day {
            return;
        }
        let first = self.day == i64::MIN;
        self.day = day;
        self.pay_interest(day);
        for t in self.things.iter_mut() {
            let stale = t.natural && (t.item == item::BRANCH || (item::SHELL..item::SHELL + item::SHELLS).contains(&t.item) || t.lie == Lie::Buried);
            if stale {
                *t = NO_THING;
            }
        }
        for t in self.trees[..self.tree_count].iter_mut() {
            t.wood = 0;
            t.shaken = false;
            if t.kind == TreeKind::Fruit && t.fruit == 0 && day - t.bare_since >= 2 {
                t.fruit = 3;
            }
        }
        let mut rng = Rng::new(day_seed(day, 1));
        // Shells along the beach.
        for _ in 0..8 {
            if let Some((x, z)) = self.spot(map, &mut rng, |m, i, j| m.ground_at(i, j) == SAND && near(m, i, j, SEA, 2), 60) {
                let id = item::SHELL + rng.below(item::SHELLS as usize) as u16;
                self.place(Thing { item: id, count: 1, x, z, yaw: rng.unit() * PI * 2.0, lie: Lie::Ground, natural: true, ..NO_THING });
            }
        }
        // Branches under the trees.
        for _ in 0..5 {
            if self.tree_count == 0 {
                break;
            }
            let t = self.trees[rng.below(self.tree_count)];
            if t.kind == TreeKind::Palm {
                continue;
            }
            let a = rng.unit() * PI * 2.0;
            let r = 0.9 + rng.unit() * 0.7;
            let (x, z) = (t.x + sin(a) * r, t.z + cos(a) * r);
            if self.free_spot(map, x, z, 0.6) {
                self.place(Thing { item: item::BRANCH, count: 1, x, z, yaw: rng.unit() * PI * 2.0, lie: Lie::Ground, natural: true, ..NO_THING });
            }
        }
        // Weeds on the grass.
        let weeds = self.things.iter().filter(|t| t.natural && t.item == item::WEED).count();
        let grow = if first { 14 } else { 3 }.min(WEEDS_MAX.saturating_sub(weeds));
        for _ in 0..grow {
            if let Some((x, z)) = self.spot(map, &mut rng, |m, i, j| m.ground_at(i, j) == GRASS && m.tier_at(i, j) >= 1, 60) {
                self.place(Thing { item: item::WEED, count: 1, x, z, yaw: rng.unit() * PI * 2.0, lie: Lie::Ground, natural: true, ..NO_THING });
            }
        }
        // Fossils, buried.
        for _ in 0..4 {
            if let Some((x, z)) = self.spot(map, &mut rng, |m, i, j| matches!(m.ground_at(i, j), GRASS | SAND), 60) {
                let id = item::FOSSIL + rng.below(item::FOSSILS as usize) as u16;
                self.place(Thing { item: id, count: 1, x, z, yaw: rng.unit() * PI * 2.0, lie: Lie::Buried, natural: true, ..NO_THING });
            }
        }
    }

    /// A free spot on a tile that `ok` accepts, tried up to `tries` times.
    fn spot(&self, map: &IslandMap, rng: &mut Rng, ok: impl Fn(&IslandMap, i64, i64) -> bool, tries: usize) -> Option<(f64, f64)> {
        for _ in 0..tries {
            let (i, j) = (rng.below(map.w) as i64, rng.below(map.d) as i64);
            let (x, z) = (i as f64 + 0.25 + rng.unit() * 0.5, j as f64 + 0.25 + rng.unit() * 0.5);
            if ok(map, i, j) && map.ground_at(i, j) != PATH && self.free_spot(map, x, z, 0.8) {
                return Some((x, z));
            }
        }
        None
    }

    /// Whether something can lie at (x, z): dry, level ground clear of the house, the door, trunks,
    /// inclines and bridges, and `apart` from anything else lying there.
    fn free_spot(&self, map: &IslandMap, x: f64, z: f64, apart: f64) -> bool {
        if !map.standable(x, z) || map.bridge_at(x, z).is_some() || map.ramp_at(x, z).is_some() {
            return false;
        }
        let h = map.height_at(x, z);
        if !map.fits(x, z, 0.22, h) {
            return false;
        }
        let d = map.doorstep();
        if x > d[0] - 0.4 && x < d[2] + 0.4 && z > d[1] - 0.4 && z < d[3] + 0.6 {
            return false;
        }
        // Nothing comes to lie in front of the shop's counter.
        let r = map.shop;
        if map.has_shop && x > r[0] - 1.0 && x < r[2] + 1.0 && z > r[1] - 1.0 && z < r[3] + 2.2 {
            return false;
        }
        !self.things.iter().any(|t| t.lie != Lie::Free && hypot(t.x - x, t.z - z) < apart)
    }

    fn place(&mut self, t: Thing) -> bool {
        match self.things.iter().position(|s| s.lie == Lie::Free) {
            Some(k) => {
                self.things[k] = t;
                true
            }
            None => false,
        }
    }

    // ------------------------------------------------------------ acting

    /// Whether the player stands still for an action (a line out is one: the cast's).
    pub fn busy(&self) -> bool {
        self.action.act != Act::None
    }

    /// The thing at the player's feet or just ahead, nearest first: on the ground (`buried` false)
    /// or buried.
    fn ahead(&self, x: f64, z: f64, yaw: f64, buried: bool) -> Option<usize> {
        let (fx, fz) = (sin(yaw), cos(yaw));
        let mut best: Option<(usize, f64)> = None;
        for (k, t) in self.things.iter().enumerate() {
            let wanted = if buried { t.lie == Lie::Buried } else { t.lie == Lie::Ground };
            if !wanted {
                continue;
            }
            let (dx, dz) = (t.x - x, t.z - z);
            let d = hypot(dx, dz);
            let facing = if d > 1e-6 { (dx * fx + dz * fz) / d } else { 1.0 };
            if d < UNDERFOOT || (d < REACH && facing > 0.35) {
                let score = d - facing * 0.3;
                if best.is_none_or(|(_, s)| score < s) {
                    best = Some((k, score));
                }
            }
        }
        best.map(|(k, _)| k)
    }

    /// The tree just ahead of the player.
    fn tree_ahead(&self, x: f64, z: f64, yaw: f64) -> Option<usize> {
        let (fx, fz) = (sin(yaw), cos(yaw));
        let mut best: Option<(usize, f64)> = None;
        for (k, t) in self.trees[..self.tree_count].iter().enumerate() {
            let (dx, dz) = (t.x - x, t.z - z);
            let d = hypot(dx, dz);
            if d < 1.25 && (d < 0.6 || (dx * fx + dz * fz) / d > 0.5) && best.is_none_or(|(_, b)| d < b) {
                best = Some((k, d));
            }
        }
        best.map(|(k, _)| k)
    }

    /// Where a line cast from (x, z) toward `yaw` lands: the nearest water at least a tile and a half
    /// ahead, out to `CAST`.
    fn water_ahead(&self, map: &IslandMap, x: f64, z: f64, yaw: f64) -> Option<(f64, f64)> {
        let (fx, fz) = (sin(yaw), cos(yaw));
        let mut d = 1.5;
        while d <= CAST {
            let (px, pz) = (x + fx * d, z + fz * d);
            let (i, j) = (floor(px) as i64, floor(pz) as i64);
            if matches!(map.ground_at(i, j), SEA | WATER) && map.in_map(i, j) && map.bridge_at(px, pz).is_none() {
                return Some((px, pz));
            }
            d += 0.25;
        }
        None
    }

    /// What a press of the browser's key would do for a player at (x, z) facing `yaw`.
    #[cfg(test)]
    pub fn hint(&self, map: &IslandMap, x: f64, z: f64, yaw: f64) -> u8 {
        self.hint_for(map, x, z, yaw, Press::Any)
    }

    /// What a press of `press` would do.
    pub fn hint_for(&self, map: &IslandMap, x: f64, z: f64, yaw: f64, press: Press) -> u8 {
        if self.busy() {
            return hint::NONE;
        }
        let pick = || self.ahead(x, z, yaw, false).map(|k| if self.things[k].item == item::WEED && self.things[k].natural { hint::PULL } else { hint::PICK });
        if press == Press::Pick {
            return if self.float.out { hint::NONE } else { pick().unwrap_or(hint::NONE) };
        }
        if self.float.out {
            return hint::REEL;
        }
        if map.at_shop(x, z, yaw) {
            return hint::TALK;
        }
        if press == Press::Any {
            if let Some(h) = pick() {
                return h;
            }
        }
        match self.held {
            item::SHOVEL if self.ahead(x, z, yaw, true).is_some() => hint::DIG,
            item::AXE if self.tree_ahead(x, z, yaw).is_some() => hint::CHOP,
            item::ROD if self.water_ahead(map, x, z, yaw).is_some() => hint::CAST,
            0 if self.tree_ahead(x, z, yaw).is_some() => hint::SHAKE,
            _ => hint::NONE,
        }
    }

    /// A press of the browser's key by a player at (x, z) facing `yaw`.
    #[cfg(test)]
    pub fn act(&mut self, map: &IslandMap, x: f64, z: f64, yaw: f64) -> u32 {
        self.press(map, x, z, yaw, Press::Any)
    }

    /// A press of `press` by a player at (x, z) facing `yaw`. Returns the outcome's flags of what
    /// happened at once (most come as the action plays out, from `step`).
    pub fn press(&mut self, map: &IslandMap, x: f64, z: f64, yaw: f64, press: Press) -> u32 {
        if self.busy() || (press == Press::Pick && self.float.out) {
            return 0;
        }
        if self.float.out {
            return self.reel();
        }
        if press != Press::Pick && map.at_shop(x, z, yaw) {
            return Outcome::SHOP;
        }
        let ahead = if press == Press::Use { None } else { self.ahead(x, z, yaw, false) };
        if let Some(k) = ahead {
            let pull = self.things[k].item == item::WEED && self.things[k].natural;
            if !self.pockets_have_room(self.things[k].item) {
                self.got = Slot { item: self.things[k].item, count: self.things[k].count, uses: 0 };
                return Outcome::FULL;
            }
            self.start(if pull { Act::Pull } else { Act::Pick }, k);
            return 0;
        }
        if press == Press::Pick {
            return 0;
        }
        match self.held {
            item::SHOVEL => match self.ahead(x, z, yaw, true) {
                Some(k) => self.start(Act::Dig, k),
                None => self.start(Act::Swing, 0),
            },
            item::AXE => match self.tree_ahead(x, z, yaw) {
                Some(k) => self.start(Act::Chop, k),
                None => self.start(Act::Swing, 0),
            },
            item::ROD => {
                if let Some((fx, fz)) = self.water_ahead(map, x, z, yaw) {
                    let from = [x + sin(yaw) * TIP_AHEAD, map.height_at(x, z) + TIP_UP, z + cos(yaw) * TIP_AHEAD];
                    let arc = ARC.0 + ARC.1 * hypot(fx - from[0], fz - from[2]);
                    self.float = Float { x: fx, z: fz, from, arc, ..NO_FLOAT };
                    self.start(Act::Cast, 0);
                }
            }
            _ => {
                if let Some(k) = self.tree_ahead(x, z, yaw) {
                    self.start(Act::Shake, k);
                }
            }
        }
        0
    }

    fn start(&mut self, act: Act, target: usize) {
        let (length, hit) = act.timing();
        self.action = Action { act, t: 0.0, length, hit, done: false, target };
    }

    /// A press with the line out: at a bite the fish is hooked and brought in by `TUGS` hard pulls
    /// (`land` at the last); before one it is frightened off, and the line comes in.
    fn reel(&mut self) -> u32 {
        let mut out = 0;
        if let Some(k) = self.float.fish {
            let f = self.fish[k];
            if f.swim == Swim::Bite && self.pockets_have_room(f.species) {
                self.fish[k] = Fish { swim: Swim::Hooked, t: 0.0, nibbles: TUGS, ..f };
                self.start(Act::Tug, k);
                return 0;
            }
            self.float.fish = None;
            if f.swim == Swim::Bite {
                self.fish[k].swim = Swim::Gone;
                self.got = Slot { item: f.species, count: 1, uses: 0 };
                out |= Outcome::FULL;
            } else {
                self.flee(k, self.float.x, self.float.z);
                out |= Outcome::ESCAPED;
            }
        }
        self.float.out = false;
        self.start(Act::Reel, 0);
        out
    }

    /// The last tug over: the fish on the line comes out of the water, into the pockets, and is
    /// held up.
    fn land(&mut self) -> u32 {
        self.float.out = false;
        let Some(k) = self.float.fish.take() else { return 0 };
        let f = self.fish[k];
        self.fish[k].swim = Swim::Gone;
        if !self.pockets_have_room(f.species) {
            self.got = Slot { item: f.species, count: 1, uses: 0 };
            return Outcome::FULL;
        }
        self.give(f.species, 1);
        self.got = Slot { item: f.species, count: 1, uses: 0 };
        self.start(Act::Show, f.species as usize);
        let new = if self.record(f.species, f.size) { Outcome::NEW } else { 0 };
        Outcome::CAUGHT | Outcome::GOT | new
    }

    /// Fish `k` darts off away from (x, z) (back the way it faces, when it is right there) and is gone.
    fn flee(&mut self, k: usize, x: f64, z: f64) {
        if self.float.fish == Some(k) {
            self.float.fish = None;
        }
        let f = &mut self.fish[k];
        f.swim = Swim::Flee;
        f.t = 0.0;
        let a = if hypot(f.x - x, f.z - z) > 0.2 { atan2_safe(f.x - x, f.z - z) } else { f.yaw + PI };
        f.tx = f.x + sin(a) * 6.0;
        f.tz = f.z + cos(a) * 6.0;
    }

    /// The action's effect, at its moment.
    fn effect(&mut self, map: &IslandMap, px: f64, pz: f64) -> u32 {
        let a = self.action;
        match a.act {
            Act::Pick | Act::Pull => {
                let t = self.things[a.target];
                if t.lie != Lie::Ground {
                    return 0;
                }
                // A dropped tool comes back as worn as it went.
                let uses = if t.uses > 0 { t.uses } else { item::uses(t.item) };
                let left = give_to(self.open_mut(), t.item, t.count, uses);
                self.got = Slot { item: t.item, count: t.count - left, uses: 0 };
                if left == 0 {
                    self.things[a.target] = NO_THING;
                } else {
                    self.things[a.target].count = left;
                }
                if left == t.count { Outcome::FULL } else { Outcome::GOT }
            }
            Act::Dig => {
                let t = self.things[a.target];
                if t.lie != Lie::Buried {
                    return 0;
                }
                let worn = self.wear(item::SHOVEL);
                if !self.pockets_have_room(t.item) {
                    // Dug up, it lies on the ground to pick up later.
                    self.things[a.target].lie = Lie::Ground;
                    self.things[a.target].natural = false;
                    self.got = Slot { item: t.item, count: 1, uses: 0 };
                    return Outcome::FULL | worn;
                }
                self.give(t.item, 1);
                self.got = Slot { item: t.item, count: 1, uses: 0 };
                self.things[a.target] = NO_THING;
                let new = if self.record(t.item, 0.0) { Outcome::NEW } else { 0 };
                Outcome::GOT | worn | new
            }
            Act::Chop => {
                let tree = self.trees[a.target];
                let worn = self.wear(item::AXE);
                if tree.wood >= 3 {
                    return worn;
                }
                self.trees[a.target].wood += 1;
                // The wood falls on the player's side of the trunk.
                let side = atan2_safe(px - tree.x, pz - tree.z) + (tree.wood as f64 - 2.0) * 0.6;
                self.fall_from(map, &tree, item::WOOD, 0.9, side, 0.6);
                Outcome::FELL | worn
            }
            Act::Shake => {
                let k = a.target;
                let tree = self.trees[k];
                if tree.shaken {
                    return 0;
                }
                self.trees[k].shaken = true;
                if tree.kind == TreeKind::Fruit && tree.fruit > 0 {
                    for n in 0..tree.fruit as usize {
                        let id = item::FRUIT + (tree.variant as u16 % item::FRUITS);
                        let sy = fruit_spot(&tree, n)[1];
                        let side = atan2_safe(px - tree.x, pz - tree.z) + (n as f64 - 1.0) * 0.9;
                        self.fall_from(map, &tree, id, sy, side, 0.85);
                    }
                    self.trees[k].fruit = 0;
                    self.trees[k].bare_since = self.day;
                    return Outcome::FELL;
                }
                let mut rng = Rng::new(day_seed(self.day, 1000 + k as u32));
                if tree.kind != TreeKind::Palm && rng.unit() < 0.4 {
                    let side = atan2_safe(px - tree.x, pz - tree.z) + 0.8;
                    self.fall_from(map, &tree, item::BRANCH, 1.6, side, 0.85);
                    return Outcome::FELL;
                }
                0
            }
            Act::Cast => {
                self.float.out = true;
                self.float.dip = 0.0;
                self.float.settled = 0.0;
                // The splash frightens off a fish it lands on; the others see it, or do not (step_fish).
                let (x, z) = (self.float.x, self.float.z);
                for k in 0..MAX_FISH {
                    let f = self.fish[k];
                    if f.swim == Swim::Wander && hypot(f.x - x, f.z - z) < SPOOK {
                        self.flee(k, x, z);
                    }
                }
                // A rod that breaks with this cast takes its line with it.
                let worn = self.wear(item::ROD);
                if worn != 0 {
                    self.float.out = false;
                }
                worn
            }
            Act::Tug => {
                // The pull brings the float, and the fish on it, nearer, as far as the open water goes.
                let (dx, dz) = ((px - self.float.x) * TUG_IN, (pz - self.float.z) * TUG_IN);
                for s in [1.0, 0.75, 0.5, 0.25] {
                    let (x, z) = (self.float.x + dx * s, self.float.z + dz * s);
                    if wet(map, x, z) {
                        self.float.x = x;
                        self.float.z = z;
                        break;
                    }
                }
                0
            }
            _ => 0,
        }
    }

    /// A tug on fish `k` over: the next, or the fish landed after the last.
    fn tugged(&mut self, k: usize) -> u32 {
        let f = &mut self.fish[k];
        if f.swim != Swim::Hooked {
            return 0;
        }
        f.nibbles = f.nibbles.saturating_sub(1);
        if f.nibbles > 0 {
            self.start(Act::Tug, k);
            return 0;
        }
        self.land()
    }

    /// Something falls from a tree's crown at `height` to the ground `out` tiles from the trunk
    /// toward `side`, or as near there as is free.
    fn fall_from(&mut self, map: &IslandMap, tree: &Tree, id: u16, height: f64, side: f64, out: f64) {
        let base = map.height_at(tree.x, tree.z);
        for k in 0..8 {
            let a = side + [0.0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, PI][k];
            let (x, z) = (tree.x + sin(a) * out, tree.z + cos(a) * out);
            if map.standable(x, z) && abs(map.height_at(x, z) - base) < 0.3 && self.free_spot_loose(x, z) {
                let start = base + height;
                self.place(Thing { item: id, count: 1, uses: 0, x, z, yaw: a * 3.0, lie: Lie::Falling, from: start, t: 0.0, natural: false });
                return;
            }
        }
    }

    /// Room for a fallen thing: nothing else lying right there.
    fn free_spot_loose(&self, x: f64, z: f64) -> bool {
        !self.things.iter().any(|t| t.lie != Lie::Free && hypot(t.x - x, t.z - z) < 0.35)
    }

    // ------------------------------------------------------------ fish

    /// One more fish in the water about the player at (px, pz), while there are few: from a little way
    /// off out to where fish swim, in open water clear of the bank, the bridges and the other fish;
    /// a kind of that water at the hour, heading any way.
    fn spawn_about(&mut self, map: &IslandMap, px: f64, pz: f64) {
        if self.fish.iter().filter(|f| f.swim != Swim::Gone).count() >= FISH_ABOUT {
            return;
        }
        let Some(k) = self.fish.iter().position(|f| f.swim == Swim::Gone) else { return };
        for _ in 0..16 {
            let a = self.rng.unit() * PI * 2.0;
            let r = 3.0 + self.rng.unit() * (FISH_NEAR - 3.0);
            let (x, z) = (px + sin(a) * r, pz + cos(a) * r);
            let open = [(0.0, 0.0), (0.35, 0.0), (-0.35, 0.0), (0.0, 0.35), (0.0, -0.35)].iter().all(|&(dx, dz)| wet(map, x + dx, z + dz));
            if !open || self.fish.iter().any(|f| f.swim != Swim::Gone && hypot(f.x - x, f.z - z) < 1.5) {
                continue;
            }
            let water = water_of(map, x, z);
            let species = species_for(water, self.hour, &mut self.rng);
            let size = 0.55 + self.rng.unit() * 0.9;
            let yaw = self.rng.unit() * PI * 2.0;
            // It may rest a while where it comes before it swims on.
            let wait = self.rng.unit() * REST.1;
            self.fish[k] = Fish { species, x, z, yaw, size, water, swim: Swim::Wander, wait, tx: x, tz: z, ..NO_FISH };
            return;
        }
    }

    fn step_fish(&mut self, map: &IslandMap, dt: f64) -> u32 {
        let mut out = 0;
        let float = self.float;
        for k in 0..MAX_FISH {
            let f = self.fish[k];
            if f.swim == Swim::Gone {
                continue;
            }
            let mut f = f;
            f.t += dt;
            f.age += dt;
            let speed = match f.swim {
                Swim::Flee => FLEE_SPEED,
                Swim::Come => COME_SPEED,
                // On the line it keeps to the float as the pulls bring it in.
                Swim::Hooked => HOOKED_SPEED,
                _ => WANDER_SPEED,
            };
            // Toward where it is going: a wanderer along open water; one at the float, or fleeing,
            // through any water (under a bridge too), to a side of the float there is water on.
            let at_float = matches!(f.swim, Swim::Come | Swim::Nibble | Swim::Bite | Swim::Hooked);
            let (gx, gz) = if at_float { approach(map, &float, &f) } else { (f.tx, f.tz) };
            let (dx, dz) = (gx - f.x, gz - f.z);
            let d = hypot(dx, dz);
            let mut blocked = false;
            if d > 0.03 && f.swim != Swim::Bite {
                // A wanderer slows as it comes to where it rests.
                let speed = if f.swim == Swim::Wander { speed * (0.5 + 0.5 * (d / 0.3).min(1.0)) } else { speed };
                let step = (speed * dt).min(d);
                let (nx, nz) = (f.x + dx / d * step, f.z + dz / d * step);
                let swims = if at_float || f.swim == Swim::Flee { water(map, nx, nz) } else { wet(map, nx, nz) };
                if swims {
                    f.x = nx;
                    f.z = nz;
                } else if f.swim == Swim::Flee {
                    // The bank in the way: off along it instead.
                    let a = atan2_safe(dx, dz) + if self.rng.unit() < 0.5 { 1.3 } else { -1.3 };
                    f.tx = f.x + sin(a) * 5.0;
                    f.tz = f.z + cos(a) * 5.0;
                } else {
                    blocked = true;
                    f.tx = f.x;
                    f.tz = f.z;
                }
                let want = atan2_safe(dx, dz);
                f.yaw += wrap(want - f.yaw) * (dt * 6.0).min(1.0);
            }
            match f.swim {
                Swim::Wander => {
                    if float.out && sees(&f, float.x, float.z) {
                        // It stops and turns to the float; after a moment it comes (one fish at a time).
                        f.tx = f.x;
                        f.tz = f.z;
                        f.yaw += wrap(atan2_safe(float.x - f.x, float.z - f.z) - f.yaw) * (dt * 3.0).min(1.0);
                        f.seen += dt;
                        if f.seen >= NOTICE && self.float.fish.is_none() {
                            f.swim = Swim::Come;
                            f.t = 0.0;
                            f.seen = 0.0;
                            self.float.fish = Some(k);
                        }
                    } else {
                        f.seen = 0.0;
                        // At rest where it stopped, for a while; then a little way on, or (now and
                        // then) only a turn where it is. One that cannot get there in a while rests
                        // where it is.
                        if d < 0.05 || blocked || f.t > 10.0 {
                            f.wait -= dt;
                            if f.wait <= 0.0 || f.t > 10.0 {
                                let turn = self.rng.unit() < TURN_ONLY;
                                let a = if turn { f.yaw + (self.rng.unit() - 0.5) * 3.0 } else { self.rng.unit() * PI * 2.0 };
                                let r = if turn { 0.06 } else { HOP.0 + self.rng.unit() * (HOP.1 - HOP.0) };
                                let (tx, tz) = (f.x + sin(a) * r, f.z + cos(a) * r);
                                if wet(map, tx, tz) {
                                    f.tx = tx;
                                    f.tz = tz;
                                }
                                f.t = 0.0;
                                f.wait = REST.0 + self.rng.unit() * (REST.1 - REST.0);
                            }
                        }
                    }
                }
                Swim::Come => {
                    if !float.out {
                        f.swim = Swim::Wander;
                    } else if blocked || f.t > COME_MAX {
                        // No way to it, or too long on the way: it turns away, and another may come.
                        f.swim = Swim::Wander;
                        f.t = 0.0;
                        if self.float.fish == Some(k) {
                            self.float.fish = None;
                        }
                    } else if d < 0.06 {
                        f.swim = Swim::Nibble;
                        f.t = 0.0;
                        out |= Outcome::NIBBLE;
                        // None to two nibbles more before it bites (one to three in all).
                        f.nibbles = (self.rng.unit() * 2.5) as u8;
                        f.wait = NIBBLE_EVERY.0 + self.rng.unit() * (NIBBLE_EVERY.1 - NIBBLE_EVERY.0);
                    }
                }
                Swim::Nibble => {
                    if !float.out {
                        self.fish[k] = f;
                        self.flee(k, float.x, float.z);
                        continue;
                    } else if f.t > f.wait {
                        f.t = 0.0;
                        f.wait = NIBBLE_EVERY.0 + self.rng.unit() * (NIBBLE_EVERY.1 - NIBBLE_EVERY.0);
                        if f.nibbles == 0 {
                            f.swim = Swim::Bite;
                            out |= Outcome::BITE;
                        } else {
                            f.nibbles -= 1;
                            out |= Outcome::NIBBLE;
                        }
                    }
                }
                Swim::Hooked => {}
                Swim::Bite => {
                    if f.t > BITE_HOLD {
                        // Too late: it is off with the bait.
                        self.fish[k] = f;
                        self.flee(k, float.x, float.z);
                        out |= Outcome::ESCAPED;
                        continue;
                    }
                }
                Swim::Flee => {
                    if f.t > FLEE {
                        f.swim = Swim::Gone;
                    }
                }
                Swim::Gone => {}
            }
            self.fish[k] = f;
        }
        // The float bobs, dips at a nibble and goes under at a bite.
        if self.float.out {
            let bite = self.float.fish.map(|k| (self.fish[k].swim, self.fish[k].t));
            self.float.dip = match bite {
                Some((Swim::Nibble, t)) if t < 0.18 => 0.05,
                Some((Swim::Bite, _)) => 0.16,
                // On the line, it thrashes.
                Some((Swim::Hooked, _)) => 0.08 + 0.05 * sin(self.clock * THRASH),
                _ => 0.012 * sin(self.clock * 3.0),
            };
        }
        out
    }

    /// One frame: the action plays out, fruit falls, fish come and swim. `px, pz` is the player, going
    /// at `speed` (tiles a second).
    pub fn step(&mut self, map: &IslandMap, px: f64, pz: f64, speed: f64, dt: f64) -> u32 {
        self.clock += dt;
        let mut out = 0;
        // The keeper turns to a customer near the counter, and back to the way the stall faces.
        if map.has_shop {
            let [kx, kz, ky] = map.keeper;
            let near = hypot(px - kx, pz - kz) < 4.5 && (px - kx) * sin(ky) + (pz - kz) * cos(ky) > 0.2;
            let want = if near { atan2_safe(px - kx, pz - kz) } else { ky };
            let turn = wrap(want - self.keeper_yaw);
            // Never f64::clamp here: a host's first frame may come with no time at all (NaN), and it panics.
            let most = dt * 4.0;
            self.keeper_yaw = wrap(self.keeper_yaw + crate::math::clamp(turn, -most, most));
        }
        if self.action.act != Act::None {
            self.action.t += dt;
            if !self.action.done && self.action.t >= self.action.hit {
                self.action.done = true;
                out |= self.effect(map, px, pz) | Outcome::HIT;
            }
            if self.action.t >= self.action.length {
                let ended = self.action;
                self.action = Action::default();
                if ended.act == Act::Tug {
                    out |= self.tugged(ended.target);
                }
            }
        }
        // (A first frame with no time, NaN, leaves it as it is.)
        if self.float.out && dt > 0.0 {
            self.float.settled += dt;
        }
        for t in self.things.iter_mut() {
            if t.lie == Lie::Falling {
                t.t += dt * 2.2;
                if t.t >= 1.0 {
                    t.lie = Lie::Ground;
                    t.t = 0.0;
                    out |= Outcome::LAND;
                }
            }
        }
        // Fish come to the water about the player now and then (a first frame with no
        // time, NaN, still counts down), and are gone when it is left far behind; a run past them
        // frightens them off.
        self.fish_due -= dt;
        if self.fish_due.is_nan() || self.fish_due <= 0.0 {
            self.fish_due = FISH_EVERY;
            self.spawn_about(map, px, pz);
        }
        for k in 0..MAX_FISH {
            let f = self.fish[k];
            if matches!(f.swim, Swim::Gone | Swim::Flee) {
                continue;
            }
            let d = hypot(f.x - px, f.z - pz);
            if speed > SCARE_SPEED && d < RUN_SCARE {
                self.flee(k, px, pz);
            } else if d > FISH_NEAR + 2.0 && self.float.fish != Some(k) {
                self.fish[k].swim = Swim::Gone;
            }
        }
        out | self.step_fish(map, dt)
    }

    /// The player moved off while a line was out: it comes in, and its fish swims off.
    pub fn line_in(&mut self) {
        if !self.float.out {
            return;
        }
        self.float.out = false;
        if let Some(k) = self.float.fish {
            self.flee(k, self.float.x, self.float.z);
        }
    }

    // ------------------------------------------------------------ keeping

    /// What there is to keep between runs, as numbers into `out`: returns how many. `load` reads it back.
    pub fn save(&self, out: &mut [f32]) -> usize {
        let mut w = Writer { out, n: 0 };
        w.put(SAVE_VERSION);
        w.put(self.day as f64);
        w.put(self.held as f64);
        w.put(self.size as f64);
        w.put(self.wallet as f64);
        w.put(self.bank as f64);
        // A day before any is kept as the day itself: interest starts from it.
        w.put(if self.interest_day == i64::MIN { self.day as f64 } else { self.interest_day as f64 });
        for s in self.pockets.iter().chain(self.boxed.iter()) {
            w.put(s.item as f64);
            w.put(s.count as f64);
            w.put(s.uses as f64);
        }
        w.put(self.tree_count as f64);
        for t in self.trees[..self.tree_count].iter() {
            w.put(t.fruit as f64);
            w.put(t.bare_since as f64);
            w.put(t.wood as f64);
            w.put(if t.shaken { 1.0 } else { 0.0 });
        }
        let lying = self.things.iter().filter(|t| t.lie != Lie::Free).count();
        w.put(lying as f64);
        for t in self.things.iter().filter(|t| t.lie != Lie::Free) {
            // A falling thing is kept where it lands.
            let lie = if t.lie == Lie::Falling { Lie::Ground } else { t.lie };
            for v in [t.item as f64, t.count as f64, t.x, t.z, t.yaw, lie as u8 as f64, if t.natural { 1.0 } else { 0.0 }, t.uses as f64] {
                w.put(v);
            }
        }
        for e in self.dex.iter() {
            w.put(e.count as f64);
            w.put(e.best);
            w.put(e.first as f64);
        }
        w.n
    }

    /// Back as `save` left it, or as an earlier version did: the first (twenty pockets, no coins,
    /// tools new) or the second (no field guide). False (and nothing changed) when it is not a save
    /// of any, or is of another island's trees.
    pub fn load(&mut self, data: &[f32]) -> bool {
        let mut r = Reader { data, at: 0 };
        let version = r.get();
        let first = version == Some(1.0);
        if !first && version != Some(2.0) && version != Some(SAVE_VERSION) {
            return false;
        }
        let (Some(day), Some(held)) = (r.get(), r.get()) else { return false };
        let (mut size, mut wallet, mut bank, mut interest_day) = (POCKETS_FIRST as f64, 0.0, 0.0, day);
        if !first {
            let (Some(a), Some(b), Some(c), Some(d)) = (r.get(), r.get(), r.get(), r.get()) else { return false };
            (size, wallet, bank, interest_day) = (a, b, c, d);
        }
        let size = (size as usize).clamp(POCKETS_FIRST, POCKETS);
        let mut pockets = [NO_SLOT; POCKETS];
        let mut boxed = [NO_SLOT; BOX];
        let kept_pockets = if first { POCKETS_FIRST } else { POCKETS };
        for s in pockets[..kept_pockets].iter_mut().chain(boxed.iter_mut()) {
            let (Some(id), Some(count)) = (r.get(), r.get()) else { return false };
            let uses = if first { None } else { r.get() };
            let (id, count) = (id as u16, count as u16);
            let new = item::uses(id);
            let uses = uses.map_or(new, |u| (u as u16).clamp(1, new.max(1)));
            *s = if item::known(id) && count > 0 { Slot { item: id, count: count.min(item::stack(id)), uses: if new > 0 { uses } else { 0 } } } else { NO_SLOT };
        }
        if r.get() != Some(self.tree_count as f64) {
            return false;
        }
        let mut trees = self.trees;
        for t in trees[..self.tree_count].iter_mut() {
            let (Some(fruit), Some(bare), Some(wood), Some(shaken)) = (r.get(), r.get(), r.get(), r.get()) else { return false };
            t.fruit = if t.kind == TreeKind::Fruit { (fruit as u8).min(3) } else { 0 };
            t.bare_since = bare as i64;
            t.wood = (wood as u8).min(3);
            t.shaken = shaken > 0.5;
        }
        let Some(lying) = r.get() else { return false };
        let mut things = [NO_THING; MAX_THINGS];
        let fields = if first { 7 } else { 8 };
        for slot in things.iter_mut().take(lying as usize) {
            let mut v = [0.0; 8];
            for x in v.iter_mut().take(fields) {
                let Some(y) = r.get() else { return false };
                *x = y;
            }
            let id = v[0] as u16;
            if !item::known(id) {
                continue;
            }
            let lie = if v[5] as u8 == Lie::Buried as u8 { Lie::Buried } else { Lie::Ground };
            let uses = if item::is_tool(id) { (v[7] as u16).clamp(1, item::uses(id)) } else { 0 };
            *slot = Thing { item: id, count: (v[1] as u16).max(1), uses, x: v[2], z: v[3], yaw: v[4], lie, from: 0.0, t: 0.0, natural: v[6] > 0.5 };
        }
        // The encyclopedia, from the third version.
        let mut dex = [crate::dex::NO_ENTRY; crate::dex::ENTRIES];
        if version == Some(SAVE_VERSION) {
            for e in dex.iter_mut() {
                let (Some(count), Some(best), Some(day)) = (r.get(), r.get(), r.get()) else { return false };
                *e = crate::dex::Entry { count: count as u16, best: best.clamp(0.0, 2.0), first: day as i64 };
            }
        }
        self.day = day as i64;
        self.held = held as u16;
        self.size = size;
        self.wallet = (wallet as u32).min(crate::shop::WALLET_MAX);
        self.bank = (bank as u32).min(crate::shop::BANK_MAX);
        self.interest_day = interest_day as i64;
        self.interest = 0;
        self.dex = dex;
        self.pockets = pockets;
        self.boxed = boxed;
        self.trees = trees;
        self.things = things;
        self.fish = [NO_FISH; MAX_FISH];
        self.fish_due = 0.0;
        // Seeded as a first run is: unseeded (zero), every number it gives is zero, and every fish
        // would be the same kind, coming to the same spot.
        self.rng = Rng::new(7);
        self.float = Float::default();
        self.action = Action::default();
        self.keep_hold();
        true
    }

    // ------------------------------------------------------------ what to draw

    /// What is to be drawn, `VIEW_FIELDS` numbers an entry (what, x, y, z, yaw, and a value), into
    /// `out`; returns how many entries.
    pub fn view(&self, map: &IslandMap, out: &mut [f32]) -> usize {
        let mut n = 0;
        let mut push = |what: u16, x: f64, y: f64, z: f64, yaw: f64, v: f64| {
            if (n + 1) * VIEW_FIELDS > out.len() {
                return;
            }
            out[n * VIEW_FIELDS..(n + 1) * VIEW_FIELDS].copy_from_slice(&[what as f32, x as f32, y as f32, z as f32, yaw as f32, v as f32]);
            n += 1;
        };
        for t in self.things.iter() {
            match t.lie {
                Lie::Free => {}
                Lie::Buried => push(show::BURIED, t.x, map.height_at(t.x, t.z), t.z, t.yaw, 0.0),
                Lie::Ground | Lie::Falling => {
                    let ground = map.height_at(t.x, t.z);
                    let y = if t.lie == Lie::Falling { t.from + (ground - t.from) * t.t * t.t } else { ground };
                    push(lying_model(t.item), t.x, y, t.z, t.yaw, t.item as f64);
                }
            }
        }
        for (k, t) in self.trees[..self.tree_count].iter().enumerate() {
            if t.kind == TreeKind::Fruit {
                let base = map.height_at(t.x, t.z);
                for f in 0..t.fruit as usize {
                    let [x, y, z] = fruit_spot(t, f);
                    push(item::FRUIT + (t.variant as u16 % item::FRUITS), x, base + y, z, 0.0, 0.0);
                }
            }
            let a = self.action;
            if matches!(a.act, Act::Shake | Act::Chop) && a.target == k && a.length > 0.0 {
                push(show::SHAKE, t.x, map.height_at(t.x, t.z), t.z, 0.0, a.t / a.length);
            }
        }
        for f in self.fish.iter() {
            if f.swim != Swim::Gone {
                let y = map.water_level(floor(f.x) as i64, floor(f.z) as i64);
                let grown = (f.age / APPEAR).min(1.0);
                let going = if f.swim == Swim::Flee { (1.0 - f.t / FLEE).max(0.0) } else { 1.0 };
                let size = crate::dex::shadow(f.species) * (0.8 + 0.4 * (f.size - 0.5));
                let thrash = if f.swim == Swim::Hooked { 0.5 * sin(self.clock * THRASH * 0.9) } else { 0.0 };
                push(show::FISH, f.x, y, f.z, f.yaw + thrash, size * grown * going);
            }
        }
        if map.has_shop {
            let [kx, kz, _] = map.keeper;
            push(show::KEEPER, kx, map.height_at(kx, kz), kz, self.keeper_yaw, 0.012 * (1.0 + sin(self.clock * 2.1)));
        }
        if let Some([x, y, z]) = self.float_at(map) {
            push(show::FLOAT, x, y, z, 0.0, self.float.dip);
        }
        n
    }

    /// How far the cast's float has flown (0 as it leaves the rod, 1 at the splash), while it flies.
    fn flight(&self) -> Option<f64> {
        let a = self.action;
        let released = a.act == Act::Cast && !a.done && a.t >= RELEASE;
        released.then(|| crate::math::clamp((a.t - RELEASE) / (a.hit - RELEASE), 0.0, 1.0))
    }

    /// Where the float is (on the water, before the dip), while it flies or is out: on its way from
    /// the rod to the water up over the straight way, as thrown.
    fn float_at(&self, map: &IslandMap) -> Option<[f64; 3]> {
        if self.float.out {
            return Some(self.float_on_way(map, 1.0));
        }
        self.flight().map(|s| self.float_on_way(map, s))
    }

    /// The fishing line from the rod's tip (`tip`, where the host draws it) to the float, as
    /// `LINE_POINTS` points (x, y, z) into `out`; returns how many (none without a float). While the
    /// float flies the line paid out follows the way it went; on the water it settles to hang a
    /// little; a bite, or a fish on the line, pulls it straight. It never dips below the water or
    /// the ground under it.
    pub fn line(&self, map: &IslandMap, tip: [f64; 3], out: &mut [f64]) -> usize {
        let Some(at) = self.float_at(map) else { return 0 };
        if out.len() < LINE_POINTS * 3 {
            return 0;
        }
        // Its end at the float's top, as it dips.
        let end = [at[0], at[1] - self.float.dip + 0.04, at[2]];
        let mid = [(tip[0] + end[0]) / 2.0, (tip[1] + end[1]) / 2.0, (tip[2] + end[2]) / 2.0];
        let length = hypot(hypot(end[0] - tip[0], end[2] - tip[2]), end[1] - tip[1]);
        // A curve from the tip to the end through `through` at its middle.
        let through = if let Some(s) = self.flight() {
            self.float_on_way(map, s * 0.5)
        } else {
            let hooked = self.float.fish.is_some_and(|k| matches!(self.fish[k].swim, Swim::Bite | Swim::Hooked));
            let sag = if hooked { 0.015 } else { SAG } * length;
            let hanging = [mid[0], mid[1] - sag, mid[2]];
            // Settling: from the way it flew to hanging.
            let thrown = self.float_on_way(map, 0.5);
            let k = ease(self.float.settled / SETTLE);
            [thrown[0] + (hanging[0] - thrown[0]) * k, thrown[1] + (hanging[1] - thrown[1]) * k, thrown[2] + (hanging[2] - thrown[2]) * k]
        };
        // A quadratic curve whose middle is `through`: its control point twice as far from the chord.
        let c = [2.0 * through[0] - mid[0], 2.0 * through[1] - mid[1], 2.0 * through[2] - mid[2]];
        for i in 0..LINE_POINTS {
            let t = i as f64 / (LINE_POINTS - 1) as f64;
            let (a, b, d) = ((1.0 - t) * (1.0 - t), 2.0 * (1.0 - t) * t, t * t);
            let x = a * tip[0] + b * c[0] + d * end[0];
            let z = a * tip[2] + b * c[2] + d * end[2];
            let y = a * tip[1] + b * c[1] + d * end[1];
            let (i0, j0) = (floor(x) as i64, floor(z) as i64);
            let under = if matches!(map.ground_at(i0, j0), SEA | WATER) { map.water_level(i0, j0) } else { map.height_at(x, z) };
            out[i * 3] = x;
            out[i * 3 + 1] = if i == 0 || i == LINE_POINTS - 1 { y } else { y.max(under + 0.01) };
            out[i * 3 + 2] = z;
        }
        LINE_POINTS
    }

    /// The float's way from the rod to where it came down, `s` of the way along (`float_at`'s flight).
    fn float_on_way(&self, map: &IslandMap, s: f64) -> [f64; 3] {
        let f = self.float;
        let water = map.water_level(floor(f.x) as i64, floor(f.z) as i64);
        let [ox, oy, oz] = f.from;
        [ox + (f.x - ox) * s, oy + (water - oy) * s + f.arc * 4.0 * s * (1.0 - s), oz + (f.z - oz) * s]
    }

    /// A number that changes whenever anything the interfaces show of the things does: the pockets
    /// and the box, how many pockets are open, the tool in hand, the wallet and savings, the day
    /// (the shop's stock and featured kind), the encyclopedia. A host reads it each frame and reads
    /// those again only when it moves.
    pub fn version(&self) -> u32 {
        // FNV-1a over their numbers.
        let mut h: u32 = 0x811c_9dc5;
        let mut put = |v: u32| {
            for b in v.to_le_bytes() {
                h = (h ^ b as u32).wrapping_mul(0x0100_0193);
            }
        };
        for s in self.pockets.iter().chain(self.boxed.iter()) {
            put(s.item as u32 | (s.count as u32) << 16);
            put(s.uses as u32);
        }
        put(self.size as u32);
        put(self.held as u32);
        put(self.wallet);
        put(self.bank);
        put(self.interest);
        put(self.day as u32);
        for e in self.dex.iter() {
            let best = e.best.to_bits();
            put(e.count as u32);
            put(best as u32);
            put((best >> 32) as u32);
            put(e.first as u32);
        }
        h
    }
}


/// The model an item lying on the ground is drawn with: its own for what is often about, a bundle
/// for the rest.
pub fn lying_model(id: u16) -> u16 {
    if matches!(id, item::BRANCH | item::WOOD | item::WEED) || (item::SHELL..item::SHELL + item::SHELLS).contains(&id) || (item::FRUIT..item::FRUIT + item::FRUITS).contains(&id) {
        id
    } else {
        show::BUNDLE
    }
}

/// Where fruit `n` hangs on a fruit tree, in the island's tiles and height above its foot: on the
/// crown's south side, toward the camera, whichever way the tree is turned (the crown is round
/// enough), about its middle as the tree leans.
pub fn fruit_spot(t: &Tree, n: usize) -> [f64; 3] {
    let [sx, sy, sz] = FRUIT_SPOTS[n % 3];
    let lean = LEAN[t.variant as usize % 3];
    // The lean is along the model's x, turned with it as three.js turns it.
    [t.x + lean * cos(t.rot) + sx, sy, t.z - lean * sin(t.rot) + sz]
}

/// The layout `save` writes (the first and second are read too); a save of another is not read.
const SAVE_VERSION: f64 = 3.0;
/// Numbers `save` may write, at most.
pub const SAVE_MAX: usize = 8 + (POCKETS + BOX) * 3 + 1 + MAX_TREES * 4 + 1 + MAX_THINGS * 8 + crate::dex::ENTRIES * 3;

struct Writer<'a> {
    out: &'a mut [f32],
    n: usize,
}
impl Writer<'_> {
    fn put(&mut self, v: f64) {
        if self.n < self.out.len() {
            self.out[self.n] = v as f32;
            self.n += 1;
        }
    }
}

struct Reader<'a> {
    data: &'a [f32],
    at: usize,
}
impl Reader<'_> {
    fn get(&mut self) -> Option<f64> {
        let v = *self.data.get(self.at)?;
        self.at += 1;
        Some(v as f64)
    }
}

/// `count` of `id` into `slots`, onto stacks of the same with room and then into empty ones; a tool
/// with `uses` left. Returns how many did not fit.
pub(crate) fn give_to(slots: &mut [Slot], id: u16, count: u16, uses: u16) -> u16 {
    if id == 0 || count == 0 {
        return count;
    }
    let stack = item::stack(id);
    let mut left = count;
    for s in slots.iter_mut() {
        if left == 0 {
            break;
        }
        if s.item == id && s.count < stack {
            let n = left.min(stack - s.count);
            s.count += n;
            left -= n;
        }
    }
    for s in slots.iter_mut() {
        if left == 0 {
            break;
        }
        if s.item == 0 {
            let n = left.min(stack);
            *s = Slot { item: id, count: n, uses: if item::is_tool(id) { uses } else { 0 } };
            left -= n;
        }
    }
    left
}

/// The longest a fish takes coming to the float before it gives up.
const COME_MAX: f64 = 10.0;

/// Where a fish waits at the float: a little off it on the fish's side, or turned round it to a side
/// there is water on; at the float itself when there is none.
fn approach(map: &IslandMap, float: &Float, f: &Fish) -> (f64, f64) {
    let r = 0.32 + 0.12 * f.size;
    let a = atan2_safe(f.x - float.x, f.z - float.z);
    for turn in [0.0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, PI] {
        let (x, z) = (float.x + sin(a + turn) * r, float.z + cos(a + turn) * r);
        if water(map, x, z) {
            return (x, z);
        }
    }
    (float.x, float.z)
}

/// Whether fish `f` sees a float at (x, z): ahead of it, no farther than `SIGHT` and no wider than
/// `SIGHT_COS` either side of the way it heads.
fn sees(f: &Fish, x: f64, z: f64) -> bool {
    let (dx, dz) = (x - f.x, z - f.z);
    let d = hypot(dx, dz);
    d <= SIGHT && d > 1e-6 && (dx * sin(f.yaw) + dz * cos(f.yaw)) / d >= SIGHT_COS
}

/// Water a fish can swim in, a bridge over it or not.
fn water(map: &IslandMap, x: f64, z: f64) -> bool {
    let (i, j) = (floor(x) as i64, floor(z) as i64);
    map.in_map(i, j) && matches!(map.ground_at(i, j), SEA | WATER)
}

fn wet(map: &IslandMap, x: f64, z: f64) -> bool {
    let (i, j) = (floor(x) as i64, floor(z) as i64);
    map.in_map(i, j) && matches!(map.ground_at(i, j), SEA | WATER) && map.bridge_at(x, z).is_none()
}

/// Which water a point is in: the sea, a river, or the pond up on the cliffs.
pub fn water_of(map: &IslandMap, x: f64, z: f64) -> Water {
    let (i, j) = (floor(x) as i64, floor(z) as i64);
    if map.ground_at(i, j) == SEA || map.tier_at(i, j) == 0 {
        return Water::Sea;
    }
    // Still water: no wet tile two tiles off on two opposite sides is a river's run.
    let mut wet_around = 0;
    for (di, dj) in [(2, 0), (-2, 0), (0, 2), (0, -2), (2, 2), (-2, -2), (2, -2), (-2, 2)] {
        if matches!(map.ground_at(i + di, j + dj), WATER) {
            wet_around += 1;
        }
    }
    if wet_around >= 7 { Water::Pond } else { Water::River }
}

/// A fish for the water at the hour (`crate::dex::habits`): the commoner more often.
fn species_for(water: Water, hour: f64, rng: &mut Rng) -> u16 {
    // (species, weight)
    let table: &[(u16, f64)] = match water {
        Water::Sea => &[(0, 5.0), (1, 4.0), (2, 2.0), (3, 2.0), (4, 1.5)],
        Water::River => &[(5, 5.0), (6, 3.0), (7, 3.0), (8, 1.5)],
        Water::Pond => &[(9, 4.0), (10, 2.0)],
    };
    let here = |s: u16| crate::dex::swims_at(item::FISH + s, hour);
    let total: f64 = table.iter().filter(|(s, _)| here(*s)).map(|(_, w)| w).sum();
    let mut r = rng.unit() * total;
    for &(s, w) in table.iter().filter(|(s, _)| here(*s)) {
        if r < w {
            return item::FISH + s;
        }
        r -= w;
    }
    item::FISH + table[0].0
}

fn near(map: &IslandMap, i: i64, j: i64, ground: u8, r: i64) -> bool {
    for dj in -r..=r {
        for di in -r..=r {
            if map.ground_at(i + di, j + dj) == ground {
                return true;
            }
        }
    }
    false
}

fn atan2_safe(x: f64, z: f64) -> f64 {
    if abs(x) < 1e-9 && abs(z) < 1e-9 { 0.0 } else { crate::math::atan2(x, z) }
}

fn wrap(a: f64) -> f64 {
    crate::math::atan2(sin(a), cos(a))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::island::IslandMap;

    /// A 24 × 20 island: sea round the edge, a beach, grass with a tree, a fruit tree, and a river.
    fn island() -> Box<IslandMap> {
        let mut m: Box<IslandMap> = Box::new(IslandMap::EMPTY);
        m.reset(24, 20);
        for j in 0..20 {
            for i in 0..24 {
                let k = j * 24 + i;
                let edge = i < 2 || j < 2 || i >= 22 || j >= 18;
                let beach = i < 4 || j < 4 || i >= 20 || j >= 16;
                m.tier[k] = if edge || beach { 0 } else { 1 };
                m.ground[k] = if edge { SEA } else if beach { SAND } else if i == 15 { WATER } else { GRASS };
            }
        }
        m.house = [6.0, 5.0, 9.0, 7.0];
        m.door = [7.5, 7.0];
        m
    }

    fn things(m: &IslandMap) -> Box<Things> {
        let mut t: Box<Things> = unsafe { Box::new_zeroed().assume_init() };
        t.clear_trees();
        t.add_tree(10.5, 10.5, 0.0, TreeKind::Broadleaf, 0);
        t.add_tree(12.5, 12.5, 0.0, TreeKind::Fruit, 1);
        t.reset();
        t.new_day(m, 20_000);
        t
    }

    fn run(t: &mut Things, m: &IslandMap, seconds: f64) -> u32 {
        let mut out = 0;
        let mut s = 0.0;
        while s < seconds {
            out |= t.step(m, 0.0, 0.0, 0.0, 1.0 / 60.0);
            s += 1.0 / 60.0;
        }
        out
    }

    #[test]
    fn a_day_brings_the_same_things_every_time() {
        let m = island();
        let a = things(&m);
        let b = things(&m);
        let lying = |t: &Things| t.things.iter().filter(|x| x.lie != Lie::Free).map(|x| (x.item, (x.x * 100.0) as i64, (x.z * 100.0) as i64)).collect::<Vec<_>>();
        assert!(!lying(&a).is_empty());
        assert_eq!(lying(&a), lying(&b));
        assert!(a.things.iter().any(|x| x.lie == Lie::Buried), "fossils are buried");
        assert!(a.things.iter().any(|x| x.item == item::WEED), "weeds grow");
        assert!(a.things.iter().any(|x| (item::SHELL..item::SHELL + 3).contains(&x.item)), "shells wash in");
    }

    #[test]
    fn picking_up_puts_it_in_a_pocket() {
        let m = island();
        let mut t = things(&m);
        let k = t.things.iter().position(|x| x.lie == Lie::Ground).unwrap();
        let (x, z, id) = (t.things[k].x, t.things[k].z, t.things[k].item);
        assert_ne!(t.hint(&m, x, z - 0.3, 0.0), hint::NONE);
        t.act(&m, x, z - 0.3, 0.0);
        let out = run(&mut t, &m, 1.0);
        assert!(out & Outcome::GOT != 0);
        assert!(t.pockets.iter().any(|s| s.item == id));
        assert_eq!(t.things[k].lie, Lie::Free);
    }

    #[test]
    fn on_the_console_a_uses_the_hand_and_y_picks_up() {
        let m = island();
        let mut t = things(&m);
        let k = t.things.iter().position(|x| x.lie == Lie::Ground && x.item != item::WEED).unwrap();
        let (x, z) = (t.things[k].x, t.things[k].z);
        t.held = item::SHOVEL;
        assert_eq!(t.hint_for(&m, x, z - 0.3, 0.0, Press::Any), hint::PICK);
        assert_ne!(t.hint_for(&m, x, z - 0.3, 0.0, Press::Use), hint::PICK, "A digs, it does not pick up");
        assert_eq!(t.hint_for(&m, x, z - 0.3, 0.0, Press::Pick), hint::PICK);
        t.press(&m, x, z - 0.3, 0.0, Press::Use);
        assert_ne!(t.action.act, Act::Pick);
        run(&mut t, &m, 1.0);
        assert_eq!(t.things[k].lie, Lie::Ground, "still there");
        t.press(&m, x, z - 0.3, 0.0, Press::Pick);
        assert_eq!(t.action.act, Act::Pick);
        run(&mut t, &m, 1.0);
        assert_eq!(t.things[k].lie, Lie::Free);
        // Y with nothing at the feet does nothing, whatever is in hand.
        t.held = item::AXE;
        assert_eq!(t.press(&m, 10.5, 11.4, PI, Press::Pick), 0);
        assert_eq!(t.action.act, Act::None);
    }

    #[test]
    fn shaking_a_fruit_tree_drops_its_fruit_and_it_grows_back() {
        let m = island();
        let mut t = things(&m);
        t.held = 0;
        // Facing the fruit tree from the south (+z is south, so facing -z: yaw PI).
        t.act(&m, 12.5, 13.4, PI);
        run(&mut t, &m, 1.5);
        assert_eq!(t.trees[1].fruit, 0);
        let fruit = t.things.iter().filter(|x| (item::FRUIT..item::FRUIT + 3).contains(&x.item) && x.lie == Lie::Ground).count();
        assert_eq!(fruit, 3);
        t.new_day(&m, 20_001);
        assert_eq!(t.trees[1].fruit, 0, "not the next day");
        t.new_day(&m, 20_002);
        assert_eq!(t.trees[1].fruit, 3, "two days on");
    }

    #[test]
    fn a_tree_gives_three_pieces_of_wood_a_day() {
        let m = island();
        let mut t = things(&m);
        t.held = item::AXE;
        for _ in 0..5 {
            t.act(&m, 10.5, 11.4, PI);
            run(&mut t, &m, 0.8);
        }
        let wood = t.things.iter().filter(|x| x.item == item::WOOD).count();
        assert_eq!(wood, 3);
    }

    #[test]
    fn the_shovel_digs_up_a_fossil() {
        let m = island();
        let mut t = things(&m);
        t.held = item::SHOVEL;
        let k = t.things.iter().position(|x| x.lie == Lie::Buried).unwrap();
        let (x, z, id) = (t.things[k].x, t.things[k].z, t.things[k].item);
        // Clear anything lying beside it, so the dig is what A does.
        for o in t.things.iter_mut() {
            if o.lie == Lie::Ground {
                *o = Thing::default();
            }
        }
        assert_eq!(t.hint(&m, x, z - 0.4, 0.0), hint::DIG);
        t.act(&m, x, z - 0.4, 0.0);
        run(&mut t, &m, 1.0);
        assert!(t.pockets.iter().any(|s| s.item == id));
    }

    /// The only fish about: one of the sea's at (x, z), heading `yaw` and swimming on that way a while.
    fn fish_at(t: &mut Things, x: f64, z: f64, yaw: f64) {
        t.fish = [NO_FISH; MAX_FISH];
        t.fish_due = f64::INFINITY;
        let (tx, tz) = (x + sin(yaw) * 0.65, z + cos(yaw) * 0.65);
        t.fish[0] = Fish { species: item::FISH, x, z, yaw, size: 1.0, water: Water::Sea, swim: Swim::Wander, age: 1.0, wait: 1e9, tx, tz, ..NO_FISH };
    }

    /// Steps with the player standing at (x, z); the events.
    fn wait(t: &mut Things, m: &IslandMap, x: f64, z: f64, seconds: f64) -> u32 {
        let mut out = 0;
        for _ in 0..(seconds * 60.0) as usize {
            out |= t.step(m, x, z, 0.0, 1.0 / 60.0);
        }
        out
    }

    #[test]
    fn fish_swim_about_the_water_near_the_player() {
        let m = island();
        let mut t = things(&m);
        assert!(t.fish.iter().all(|f| f.swim == Swim::Gone));
        // Between the river (x 15) and the sea to the west.
        wait(&mut t, &m, 9.0, 10.0, 20.0);
        let about: Vec<&Fish> = t.fish.iter().filter(|f| f.swim != Swim::Gone).collect();
        assert!(about.len() >= 3, "{} fish", about.len());
        assert!(about.len() <= FISH_ABOUT);
        for f in about {
            assert!(wet(&m, f.x, f.z) && hypot(f.x - 9.0, f.z - 10.0) <= FISH_NEAR + 2.0);
        }
        // Each is drawn as its shadow, the size of its kind.
        let mut view = std::vec![0f32; MAX_VIEW * VIEW_FIELDS];
        let n = t.view(&m, &mut view);
        let shadows = (0..n).filter(|e| view[e * VIEW_FIELDS] as u16 == show::FISH).count();
        assert_eq!(shadows, t.fish.iter().filter(|f| f.swim != Swim::Gone).count());
        // Far off, they are gone.
        wait(&mut t, &m, 60.0, 60.0, 0.1);
        assert!(t.fish.iter().all(|f| f.swim == Swim::Gone));
        // And after a run kept and loaded (no first run's reset), as many come, of more than one kind.
        let mut data = std::vec![0f32; SAVE_MAX];
        let n = t.save(&mut data);
        let mut kept: Box<Things> = unsafe { Box::new_zeroed().assume_init() };
        kept.clear_trees();
        kept.add_tree(10.5, 10.5, 0.0, TreeKind::Broadleaf, 0);
        kept.add_tree(12.5, 12.5, 0.0, TreeKind::Fruit, 1);
        assert!(kept.load(&data[..n]));
        wait(&mut kept, &m, 9.0, 10.0, 20.0);
        let about: Vec<&Fish> = kept.fish.iter().filter(|f| f.swim != Swim::Gone).collect();
        assert!(about.len() >= 3, "{} fish after a load", about.len());
        assert!(about.iter().any(|f| f.species != about[0].species || hypot(f.x - about[0].x, f.z - about[0].z) > 1.0));
    }

    #[test]
    fn a_fish_comes_to_a_float_it_sees_and_not_to_one_behind_it() {
        let m = island();
        // On the beach facing the sea to the west: the float lands at (1.75, 10).
        let (x, z, yaw) = (4.5, 10.0, -PI / 2.0);
        for (heading, comes) in [(PI, true), (0.0, false)] {
            let mut t = things(&m);
            t.held = item::ROD;
            // Two tiles south of where it lands, heading north toward it, or south away.
            fish_at(&mut t, 1.0, 12.0, heading);
            t.act(&m, x, z, yaw);
            wait(&mut t, &m, x, z, 1.6);
            assert_eq!(t.float.fish == Some(0), comes, "heading {heading}");
        }
        // Out of sight too, though ahead: farther than a fish sees.
        let mut t = things(&m);
        t.held = item::ROD;
        fish_at(&mut t, 1.0, 13.5, PI);
        t.act(&m, x, z, yaw);
        wait(&mut t, &m, x, z, 1.6);
        assert_eq!(t.float.fish, None);
    }

    #[test]
    fn a_float_landing_on_a_fish_frightens_it_off() {
        let m = island();
        let mut t = things(&m);
        t.held = item::ROD;
        fish_at(&mut t, 1.75, 10.3, PI);
        t.act(&m, 4.5, 10.0, -PI / 2.0);
        // Not while the float flies, but as it comes down.
        wait(&mut t, &m, 4.5, 10.0, Act::Cast.timing().1 - 0.1);
        assert_eq!(t.fish[0].swim, Swim::Wander);
        wait(&mut t, &m, 4.5, 10.0, 0.2);
        assert_eq!(t.fish[0].swim, Swim::Flee);
        wait(&mut t, &m, 4.5, 10.0, FLEE + 0.1);
        assert_eq!(t.fish[0].swim, Swim::Gone);
    }

    #[test]
    fn a_run_past_frightens_fish_off_and_a_walk_does_not() {
        let m = island();
        let mut t = things(&m);
        fish_at(&mut t, 1.0, 10.0, PI);
        for _ in 0..60 {
            t.step(&m, 4.0, 10.0, crate::walk::WALK_SPEED, 1.0 / 60.0);
        }
        assert_eq!(t.fish[0].swim, Swim::Wander, "walked past");
        t.step(&m, 4.0, 10.0, crate::walk::RUN_SPEED, 1.0 / 60.0);
        assert_eq!(t.fish[0].swim, Swim::Flee, "ran past");
        // It darts away from the player, and does not swim onto the land.
        wait(&mut t, &m, 4.0, 10.0, 0.5);
        assert!(t.fish[0].x < 1.0 && water(&m, t.fish[0].x, t.fish[0].z));
    }

    #[test]
    fn a_fish_bites_and_is_landed_at_the_bite_and_not_before() {
        let m = island();
        let mut t = things(&m);
        t.held = item::ROD;
        // On the beach facing the sea to the west, a fish south of where the float lands, heading north.
        assert_eq!(t.hint(&m, 4.5, 10.0, -PI / 2.0), hint::CAST);
        fish_at(&mut t, 1.0, 12.0, PI);
        t.act(&m, 4.5, 10.0, -PI / 2.0);
        let mut caught = false;
        for _ in 0..60 * 20 {
            let out = t.step(&m, 4.5, 10.0, 0.0, 1.0 / 60.0);
            if out & Outcome::BITE != 0 {
                // Hooked: brought in by hard pulls, nearer each time, and landed after the last.
                assert_eq!(t.act(&m, 4.5, 10.0, -PI / 2.0), 0);
                assert_eq!((t.action.act, t.fish[0].swim), (Act::Tug, Swim::Hooked));
                let (out_at, mut tugs, mut landed) = (t.float.x, 0, 0);
                for _ in 0..60 * 3 {
                    let out = t.step(&m, 4.5, 10.0, 0.0, 1.0 / 60.0);
                    if out & Outcome::HIT != 0 && t.action.act == Act::Tug {
                        tugs += 1;
                    }
                    landed |= out;
                    if out & Outcome::CAUGHT != 0 {
                        break;
                    }
                }
                assert_eq!(tugs, TUGS);
                assert!(landed & Outcome::NEW != 0, "the first of its kind, in the encyclopedia");
                // Toward the player, as far as the water goes (it came down near the beach).
                assert!(t.float.x >= out_at && wet(&m, t.float.x, t.float.z), "from {out_at} to {}", t.float.x);
                assert_eq!((t.action.act, t.float.out, t.fish[0].swim), (Act::Show, false, Swim::Gone));
                caught = true;
                break;
            }
        }
        assert!(caught, "a fish bit within twenty seconds");
        assert!(t.pockets.iter().any(|s| (item::FISH..item::FISH + 5).contains(&s.item)), "a fish of the sea");
        let k = crate::dex::index_of(t.got.item).unwrap();
        assert_eq!((t.dex[k].count, t.dex[k].first), (1, t.day));
        assert!(t.dex[k].best > 0.5);
        // Kept with the rest.
        let mut data = std::vec![0f32; SAVE_MAX];
        let n = t.save(&mut data);
        let mut again = things(&m);
        assert!(again.load(&data[..n]));
        assert_eq!(again.dex[k].count, 1);
        // At noon the pufferfish of the night is not had.
        for _ in 0..200 {
            assert_ne!(species_for(Water::Sea, 12.0, &mut t.rng), item::FISH + 4);
        }
    }

    #[test]
    fn a_fish_bites_by_a_bridge_too() {
        // The river (x 15) ends at the beach (z 16); a bridge crosses it just north of where the line
        // lands (15.15, 15.5), so the fish is upriver, sees the float past the deck and waits at it
        // from under the deck.
        let mut m = island();
        m.add_bridge(crate::island::Bridge { rect: [14.5, 13.0, 16.5, 15.3], y: 0.56 });
        let mut t = things(&m);
        t.held = item::ROD;
        let (x, z, yaw) = (13.4, 15.5, PI / 2.0);
        assert_eq!(t.hint(&m, x, z, yaw), hint::CAST);
        fish_at(&mut t, 15.4, 12.75, 0.0);
        t.act(&m, x, z, yaw);
        let mut bit = false;
        for _ in 0..60 * 20 {
            if t.step(&m, x, z, 0.0, 1.0 / 60.0) & Outcome::BITE != 0 {
                bit = true;
                break;
            }
        }
        assert!(bit, "a bite within twenty seconds");
    }

    #[test]
    fn fish_about_mostly_rest_and_swim_slowly() {
        let m = island();
        let mut t = things(&m);
        wait(&mut t, &m, 9.0, 10.0, 6.0);
        let (mut moving, mut still, mut fastest) = (0, 0, 0.0f64);
        for _ in 0..60 * 20 {
            let before = t.fish;
            t.step(&m, 9.0, 10.0, 0.0, 1.0 / 60.0);
            for (a, b) in before.iter().zip(t.fish.iter()) {
                if a.swim != Swim::Wander || b.swim != Swim::Wander {
                    continue;
                }
                let speed = hypot(b.x - a.x, b.z - a.z) * 60.0;
                fastest = fastest.max(speed);
                if speed > 0.01 { moving += 1 } else { still += 1 }
            }
        }
        assert!(fastest <= WANDER_SPEED + 1e-9, "at most a wander's pace: {fastest}");
        assert!(still > moving * 2, "resting most of the time: {still} still, {moving} swimming");
    }

    #[test]
    fn nibbles_come_slowly_and_a_bite_holds_a_while() {
        let m = island();
        let mut t = things(&m);
        t.held = item::ROD;
        fish_at(&mut t, 1.0, 12.0, PI);
        t.act(&m, 4.5, 10.0, -PI / 2.0);
        let (mut last, mut gaps, mut bit_at) = (None::<usize>, std::vec::Vec::new(), None);
        for frame in 0..60 * 25 {
            let out = t.step(&m, 4.5, 10.0, 0.0, 1.0 / 60.0);
            if out & (Outcome::NIBBLE | Outcome::BITE) != 0 {
                if let Some(l) = last {
                    gaps.push((frame - l) as f64 / 60.0);
                }
                last = Some(frame);
            }
            if out & Outcome::BITE != 0 {
                bit_at = Some(frame);
            }
            if out & Outcome::ESCAPED != 0 {
                let held = (frame - bit_at.expect("off after a bite")) as f64 / 60.0;
                assert!(held >= BITE_HOLD - 0.02, "the bite held {held} s");
                break;
            }
        }
        assert!(bit_at.is_some(), "a bite");
        assert!(gaps.iter().all(|&g| g >= NIBBLE_EVERY.0 - 0.02), "{gaps:?}");
    }

    #[test]
    fn the_line_follows_the_cast_then_hangs_and_a_bite_pulls_it_straight() {
        let m = island();
        let mut t = things(&m);
        t.held = item::ROD;
        t.fish = [NO_FISH; MAX_FISH];
        t.fish_due = f64::INFINITY;
        let (x, z) = (4.5, 10.0);
        let tip = [x - 0.6, m.height_at(x, z) + 1.4, z];
        let mut out = [0.0; 32];
        let middle = |out: &[f64; 32]| {
            let (a, b, c) = (LINE_POINTS / 2 - 1, LINE_POINTS / 2, LINE_POINTS - 1);
            let y = (out[a * 3 + 1] + out[b * 3 + 1]) / 2.0;
            (y, (out[1] + out[c * 3 + 1]) / 2.0)
        };
        t.act(&m, x, z, -PI / 2.0);
        // Until the float leaves the rod there is no line.
        wait(&mut t, &m, x, z, RELEASE - 0.05);
        assert_eq!(t.line(&m, tip, &mut out), 0);
        // In flight, it follows the float's way, up over the straight way.
        wait(&mut t, &m, x, z, 0.2);
        assert_eq!(t.line(&m, tip, &mut out), LINE_POINTS);
        let (y, chord) = middle(&out);
        assert!(y > chord + 0.1, "arched: {y} over {chord}");
        // On the water, settled, it hangs.
        wait(&mut t, &m, x, z, 1.5);
        assert!(t.float.out);
        t.line(&m, tip, &mut out);
        let (y, chord) = middle(&out);
        assert!(y < chord - 0.05, "hanging: {y} under {chord}");
        let water = m.water_level(floor(t.float.x) as i64, floor(t.float.z) as i64);
        assert!((0..LINE_POINTS).all(|i| out[i * 3 + 1] >= water - 0.2), "above the water");
        assert!((out[(LINE_POINTS - 1) * 3] - t.float.x).abs() < 1e-9, "to the float");
        // A bite pulls it straight.
        let (fx, fz) = (t.float.x, t.float.z);
        fish_at(&mut t, fx, fz + 0.4, PI);
        t.fish[0].swim = Swim::Bite;
        t.float.fish = Some(0);
        t.line(&m, tip, &mut out);
        let (y, chord) = middle(&out);
        assert!((y - chord).abs() < 0.05, "taut: {y} against {chord}");
    }

    #[test]
    fn a_pocket_is_dropped_on_the_island_but_never_a_piece_of_furniture() {
        let m = island();
        let mut t = things(&m);
        let chair = item::furniture(5, 0);
        t.give(item::WOOD, 1);
        t.give(chair, 1);
        let at = |t: &Things, id: u16| t.open().iter().position(|s| s.item == id).unwrap();
        let chair_at = at(&t, chair);
        assert!(!Things::drop(&mut t, &m, chair_at, 9.0, 10.0, 0.0), "a piece goes down in the house");
        assert!(t.open().iter().any(|s| s.item == chair));
        let wood_at = at(&t, item::WOOD);
        assert!(Things::drop(&mut t, &m, wood_at, 9.0, 10.0, 0.0));
        assert!(t.things.iter().any(|o| o.item == item::WOOD && o.lie == Lie::Ground));
    }

    #[test]
    fn the_version_moves_with_what_the_interfaces_show() {
        let m = island();
        let mut t = things(&m);
        t.fish_due = f64::INFINITY;
        let v = t.version();
        wait(&mut t, &m, 9.0, 10.0, 0.5);
        assert_eq!(t.version(), v, "nothing shown changed");
        t.give(item::WOOD, 1);
        let given = t.version();
        assert_ne!(given, v);
        t.held = item::ROD;
        assert_ne!(t.version(), given, "the tool in hand");
        let held = t.version();
        t.record(item::FISH, 0.9);
        assert_ne!(t.version(), held, "the encyclopedia");
        let recorded = t.version();
        t.wallet += 10;
        assert_ne!(t.version(), recorded, "the wallet");
    }

    #[test]
    fn tools_come_round_with_empty_hands_among_them() {
        let m = island();
        let mut t = things(&m);
        assert_eq!(t.held, 0);
        t.cycle(1);
        assert_eq!(t.held, item::SHOVEL);
        t.cycle(1);
        t.cycle(1);
        assert_eq!(t.held, item::ROD);
        t.cycle(1);
        assert_eq!(t.held, 0);
        t.cycle(-1);
        assert_eq!(t.held, item::ROD);
    }

    #[test]
    fn what_is_kept_comes_back() {
        let m = island();
        let mut a = things(&m);
        a.give(item::FOSSIL + 2, 1);
        a.held = item::AXE;
        a.trees[1].fruit = 0;
        a.trees[1].bare_since = 19_999;
        let mut buf = vec![0f32; SAVE_MAX];
        let n = a.save(&mut buf);
        let mut b = things(&m);
        assert!(b.load(&buf[..n]));
        assert_eq!(b.pockets, a.pockets);
        assert_eq!(b.held, item::AXE);
        assert_eq!(b.trees[1].fruit, 0);
        assert_eq!(b.trees[1].bare_since, 19_999);
        let lying = |t: &Things| t.things.iter().filter(|x| x.lie != Lie::Free).count();
        assert_eq!(lying(&b), lying(&a));
        assert!(!b.load(&buf[..3]), "a short save is not read");
    }

    #[test]
    fn the_box_keeps_what_is_stored_and_gives_it_back() {
        let m = island();
        let mut t = things(&m);
        t.give(item::WOOD, 12);
        let slot = t.pockets.iter().position(|s| s.item == item::WOOD).unwrap();
        assert!(t.store(slot));
        assert_eq!(t.pockets[slot].item, 0);
        let b = t.boxed.iter().position(|s| s.item == item::WOOD).unwrap();
        assert_eq!(t.boxed[b].count, 12);
        assert!(t.take(b));
        assert!(t.pockets.iter().any(|s| s.item == item::WOOD && s.count == 12));
    }
}
