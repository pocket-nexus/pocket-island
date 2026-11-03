//! The float functions the core needs, from `libm` (the core is `no_std`). Everything is `f64`, as
//! JavaScript's numbers are, so the core and the browser's scripts agree to the last bit where the
//! rules compare.

pub use libm::{atan2, ceil, cos, exp, floor, round, sin, sqrt};

pub const PI: f64 = core::f64::consts::PI;
pub const SQRT_2: f64 = core::f64::consts::SQRT_2;

pub fn hypot(x: f64, y: f64) -> f64 {
    sqrt(x * x + y * y)
}

pub fn abs(x: f64) -> f64 {
    if x < 0.0 { -x } else { x }
}

pub fn sign(x: f64) -> f64 {
    if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { 0.0 }
}

pub fn min(a: f64, b: f64) -> f64 {
    if a < b { a } else { b }
}

pub fn max(a: f64, b: f64) -> f64 {
    if a > b { a } else { b }
}

pub fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    min(hi, max(lo, v))
}

/// JavaScript's `Math.round`: halves go up, `-0.5` to `-0`.
pub fn js_round(x: f64) -> f64 {
    floor(x + 0.5)
}
