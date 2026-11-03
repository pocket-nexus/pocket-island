//! The encyclopedia: each kind of fish caught and fossil dug up, how many, the largest fish of its
//! kind, and the day it was first found. A fish swims in one water at its hours (`habits`), so
//! some are only had in the evening, or at night; a host hands the core the hour (`Things::hour`).
//!
//! It lives in `Things` with the pockets: catching a fish or digging up a fossil records it, and a
//! kind found for the first time is the outcome `NEW` for the interfaces to say.

use crate::things::{item, Things, Water};

/// Fish, then fossils.
pub const ENTRIES: usize = item::FISHES as usize + item::FOSSILS as usize;

#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub struct Entry {
    /// How many have been found, the largest (a fish's size, 0.5 small to 1.5 large) and the day
    /// the first was (days since 1970).
    pub count: u16,
    pub best: f64,
    pub first: i64,
}

pub const NO_ENTRY: Entry = Entry { count: 0, best: 0.0, first: 0 };

/// The item each entry is for.
pub fn item_of(k: usize) -> u16 {
    if k < item::FISHES as usize { item::FISH + k as u16 } else { item::FOSSIL + (k - item::FISHES as usize) as u16 }
}

pub fn index_of(id: u16) -> Option<usize> {
    if (item::FISH..item::FISH + item::FISHES).contains(&id) {
        Some((id - item::FISH) as usize)
    } else if (item::FOSSIL..item::FOSSIL + item::FOSSILS).contains(&id) {
        Some(item::FISHES as usize + (id - item::FOSSIL) as usize)
    } else {
        None
    }
}

/// Where a fish swims, and from which hour to which (to before from goes past midnight; the same
/// hour both ways is all day).
pub fn habits(id: u16) -> (Water, f64, f64) {
    match id - item::FISH {
        0 => (Water::Sea, 0.0, 0.0),    // sardine
        1 => (Water::Sea, 0.0, 0.0),    // mackerel
        2 => (Water::Sea, 4.0, 21.0),   // sea bream
        3 => (Water::Sea, 0.0, 0.0),    // flounder
        4 => (Water::Sea, 21.0, 4.0),   // pufferfish
        5 => (Water::River, 0.0, 0.0),  // minnow
        6 => (Water::River, 16.0, 9.0), // trout
        7 => (Water::River, 0.0, 0.0),  // carp
        8 => (Water::River, 21.0, 4.0), // catfish
        9 => (Water::Pond, 9.0, 16.0),  // goldfish
        _ => (Water::Pond, 16.0, 9.0),  // koi
    }
}

/// Whether `hour` (0 to 24) is within a fish's hours.
pub fn swims_at(id: u16, hour: f64) -> bool {
    let (_, from, to) = habits(id);
    if from == to {
        true
    } else if from < to {
        hour >= from && hour < to
    } else {
        hour >= from || hour < to
    }
}

impl Things {
    /// The hour of the day, for the fish that swim at it.
    pub fn hour(&mut self, hour: f64) {
        self.hour = if (0.0..24.0).contains(&hour) { hour } else { 12.0 };
    }

    /// One more `id` found, of `size` for a fish: whether it is the first of its kind.
    pub(crate) fn record(&mut self, id: u16, size: f64) -> bool {
        let Some(k) = index_of(id) else { return false };
        let day = self.day.max(0);
        let e = &mut self.dex[k];
        let first = e.count == 0;
        e.count = e.count.saturating_add(1);
        if size > e.best {
            e.best = size;
        }
        if first {
            e.first = day;
        }
        first
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_water_has_a_fish_at_every_hour() {
        for water in [Water::Sea, Water::River, Water::Pond] {
            for hour in 0..24 {
                let any = (item::FISH..item::FISH + item::FISHES).any(|id| habits(id).0 == water && swims_at(id, hour as f64 + 0.5));
                assert!(any, "{water:?} at {hour}");
            }
        }
        assert!(swims_at(item::FISH + 4, 23.0) && !swims_at(item::FISH + 4, 12.0), "the pufferfish at night");
        assert!(swims_at(item::FISH + 9, 12.0) && !swims_at(item::FISH + 9, 20.0), "the goldfish by day");
    }

    #[test]
    fn entries_and_items_go_both_ways() {
        for k in 0..ENTRIES {
            assert_eq!(index_of(item_of(k)), Some(k));
        }
        assert_eq!(index_of(item::WOOD), None);
    }
}
