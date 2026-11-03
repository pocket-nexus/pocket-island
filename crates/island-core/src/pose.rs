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
