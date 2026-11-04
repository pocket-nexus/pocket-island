//! The dots along the way a click or a tap sent the player, as the island's ground (both renderers),
//! the browser's phone map and the console's draw them: whole spacings back from where the walk
//! ends, less a share that grows with the clock, so that they march toward the end however the
//! player walks. Laid out here once (`pi_route_dots`, `pi_route_ground`).

use crate::math::hypot;

/// How the dots are spaced: tiles between them, how far past the player the first may stand and how
/// far short of the end the last (where the end's ring is), the most of them, and how fast they march
/// (tiles a second).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spacing {
    pub spacing: f64,
    pub near: f64,
    pub ring: f64,
    pub most: usize,
    pub march: f64,
}

/// The most dots laid out at once.
pub const MAX_DOTS: usize = 48;

/// On the ground, the island's or the room's floor.
pub const GROUND: Spacing = Spacing { spacing: 0.62, near: 0.35, ring: 0.6, most: MAX_DOTS, march: 1.0 };

/// Where the dots stand at time `t` (seconds) along a way from `from` through the corners `ahead`,
/// in the way's own tiles, into `out`: returns how many.
pub fn dots(from: [f64; 2], ahead: &[[f64; 2]], t: f64, s: &Spacing, out: &mut [[f64; 2]]) -> usize {
    if ahead.is_empty() || s.spacing <= 0.0 {
        return 0;
    }
    let most = s.most.min(out.len());
    let mut length = 0.0;
    let [mut ax, mut az] = from;
    for p in ahead {
        length += hypot(p[0] - ax, p[1] - az);
        [ax, az] = *p;
    }
    let back = s.spacing - (t * s.march) % s.spacing;
    let at = length - back - s.near;
    let mut next = if at >= 0.0 { s.near + at % s.spacing } else { length };
    let (mut walked, mut n) = (0.0, 0);
    [ax, az] = from;
    for p in ahead {
        let len = hypot(p[0] - ax, p[1] - az);
        while len > 0.0 && next <= walked + len && next < length - s.ring && n < most {
            let f = (next - walked) / len;
            out[n] = [ax + (p[0] - ax) * f, az + (p[1] - az) * f];
            n += 1;
            next += s.spacing;
        }
        walked += len;
        [ax, az] = *p;
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_dots_stand_a_spacing_apart_short_of_the_end_and_march_on() {
        let mut out = [[0.0; 2]; MAX_DOTS];
        let ahead = [[4.0, 0.0], [4.0, 3.0]];
        let n = dots([0.0, 0.0], &ahead, 0.0, &GROUND, &mut out);
        assert!(n > 5);
        for w in out[..n].windows(2) {
            let d = hypot(w[1][0] - w[0][0], w[1][1] - w[0][1]);
            // A spacing apart, or less round the corner.
            assert!(d <= GROUND.spacing + 1e-9);
        }
        // None in the end's ring, and none behind the player.
        let [ex, ez] = ahead[1];
        assert!(out[..n].iter().all(|p| hypot(p[0] - ex, p[1] - ez) > GROUND.ring - 1e-9 || p[0] < 4.0));
        // A moment later they have marched on toward the end.
        let mut later = [[0.0; 2]; MAX_DOTS];
        dots([0.0, 0.0], &ahead, 0.2, &GROUND, &mut later);
        assert!((later[0][0] - out[0][0] - 0.2).abs() < 1e-9 || later[0][0] < out[0][0]);
        assert_eq!(dots([0.0, 0.0], &[], 0.0, &GROUND, &mut out), 0);
    }
}
