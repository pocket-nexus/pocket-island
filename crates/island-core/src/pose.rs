//! How the player moves its parts (the browser's `src/character/pose.ts` before it moved here): a
//! walk that swings the legs and the opposite arms, bobs and leans into a run, and at rest a slow
//! breath. A pose is a few angles from the walker's step phase, its speed and the time.

use crate::math::{abs, sin, PI};
use crate::walk::{RUN_SPEED, WALK_SPEED};

/// Where the player's joints are, in tiles from the feet.
pub const HIP: f64 = 0.3;
pub const HIP_X: f64 = 0.075;
pub const SHOULDER: f64 = 0.53;
pub const SHOULDER_X: f64 = 0.16;
pub const NECK: f64 = 0.6;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Pose {
    /// The hips' lift above standing, tiles.
    pub bob: f64,
    /// The body's lean forward, radians.
    pub lean: f64,
    pub head: f64,
    /// Each limb's swing forward about its joint's x axis; the arms also swing out about z.
    pub arm_l: f64,
    pub arm_r: f64,
    pub arm_out: f64,
    pub leg_l: f64,
    pub leg_r: f64,
    /// At rest, the breath's stretch of the body.
    pub breath: f64,
}

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

pub fn pose(phase: f64, speed: f64, seconds: f64) -> Pose {
    let moving = clamp01(speed / WALK_SPEED);
    let run = clamp01((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
    let swing = sin(phase * PI);
    let legs = (0.55 + 0.3 * run) * moving;
    let arms = (0.55 + 0.45 * run) * moving;
    let rest = 1.0 - moving;
    Pose {
        bob: (1.0 - abs(swing)) * (0.03 + 0.03 * run) * moving,
        lean: 0.05 * moving + 0.16 * run,
        head: -0.4 * (0.05 * moving + 0.16 * run) + sin(seconds * 0.9) * 0.04 * rest,
        arm_l: -swing * arms,
        arm_r: swing * arms,
        arm_out: 0.1 + 0.12 * run + 0.03 * sin(seconds * 2.4) * rest,
        leg_l: swing * legs,
        leg_r: -swing * legs,
        breath: sin(seconds * 2.4) * 0.012 * rest,
    }
}

/// What the player is doing with their hands, for `act_pose`: the things' actions (things::Act), and
/// holding a line out.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Doing {
    Pick,
    Pull,
    Shake,
    Chop,
    Dig,
    Cast,
    Reel,
    Show,
    Swing,
    /// The line is out: the rod held forward.
    Fishing,
}

fn ease(x: f64) -> f64 {
    let x = clamp01(x);
    x * x * (3.0 - 2.0 * x)
}

/// A bump that rises from 0 at `a` to 1 at the middle and back to 0 at `b`.
fn bump(f: f64, a: f64, b: f64) -> f64 {
    if f <= a || f >= b {
        return 0.0;
    }
    sin((f - a) / (b - a) * PI)
}

/// The pose while doing something, `f` from 0 to 1 through it, over the standing pose `base`. A
/// forward swing of an arm is negative (the figure faces +z and turns about +x); a lean forward is
/// positive.
pub fn act_pose(doing: Doing, f: f64, base: Pose) -> Pose {
    let mut p = Pose { leg_l: 0.0, leg_r: 0.0, ..base };
    match doing {
        Doing::Pick | Doing::Pull => {
            // Down to the ground and up; a weed with a tug at the bottom.
            let down = bump(f, 0.0, 1.0);
            let tug = if doing == Doing::Pull { bump(f, 0.5, 0.8) * 0.25 } else { 0.0 };
            p.bob = -0.11 * down + 0.03 * tug;
            p.lean = 0.55 * down - tug * 0.4;
            p.head = 0.2 * down;
            p.arm_r = -1.25 * down + tug;
            p.arm_l = -0.9 * down + tug;
            p.leg_l = -0.35 * down;
            p.leg_r = 0.25 * down;
        }
        Doing::Shake => {
            // Both hands on the trunk, rocking it.
            let hold = ease(f / 0.15) * (1.0 - ease((f - 0.85) / 0.15));
            let rock = sin(f * PI * 6.0) * hold;
            p.arm_r = -1.45 * hold + rock * 0.15;
            p.arm_l = -1.45 * hold - rock * 0.15;
            p.arm_out = 0.05;
            p.lean = 0.12 * hold + rock * 0.08;
            p.bob = -0.01 * hold;
        }
        Doing::Chop | Doing::Swing => {
            // Up behind the shoulder, then down in front: the strike at 0.55 of it.
            let up = ease(f / 0.45);
            let down = ease((f - 0.45) / 0.15);
            let back = 1.0 - ease((f - 0.75) / 0.25);
            let raised = -2.7 * up;
            p.arm_r = (raised + (2.7 - 1.0) * down) * back;
            p.arm_l = -0.6 * up * back;
            p.lean = (-0.08 * up + 0.3 * down) * back;
            p.bob = -0.03 * down * back;
        }
        Doing::Dig => {
            // The blade pushed into the ground and the earth lifted out.
            let push = bump(f, 0.0, 0.65);
            let lift = bump(f, 0.45, 1.0);
            p.arm_r = -0.75 * push - 0.9 * lift;
            p.arm_l = -0.95 * push - 0.7 * lift;
            p.lean = 0.42 * push + 0.15 * lift;
            p.bob = -0.05 * push;
        }
        Doing::Cast => {
            // The rod back over the shoulder, then forward to send the line.
            let back = ease(f / 0.4);
            let forward = ease((f - 0.4) / 0.25);
            p.arm_r = -2.4 * back + (2.4 - 0.85) * forward;
            p.arm_l = -0.3 * back;
            p.lean = -0.1 * back + 0.22 * forward;
        }
        Doing::Fishing => {
            p.arm_r = -0.85 + base.breath * 2.0;
            p.arm_l = -0.25;
            p.lean = 0.06;
        }
        Doing::Reel => {
            let pull = bump(f, 0.0, 1.0);
            p.arm_r = -0.85 - 0.9 * pull;
            p.arm_l = -0.25 - 0.3 * pull;
            p.lean = 0.06 - 0.12 * pull;
        }
        Doing::Show => {
            // What was caught, held up high.
            let up = ease(f / 0.2) * (1.0 - ease((f - 0.85) / 0.15));
            p.arm_r = -2.9 * up;
            p.arm_l = -2.9 * up;
            p.arm_out = 0.1 + 0.15 * up;
            p.lean = -0.08 * up;
            p.bob = 0.03 * up;
            p.head = -0.15 * up;
        }
    }
    p
}
