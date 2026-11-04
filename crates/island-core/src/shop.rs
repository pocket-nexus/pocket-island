//! The shop at the stall by the beach, and the savings its keeper looks after: coins come from
//! selling what the island gives (`sell`), and go on tools and more pockets (`buy`). Each day the
//! keeper pays half as much again for one kind of thing (`featured`), and savings earn a little
//! interest (`pay_interest`, from `Things::new_day`).
//!
//! It all lives in `Things` with the pockets it buys into and sells from.

use crate::things::{day_seed, item, Things, NO_SLOT, POCKETS};

/// The most coins a wallet holds, and savings.
pub const WALLET_MAX: u32 = 999_999;
/// Kept below what a 32-bit float counts exactly (the saves and the lists are floats).
pub const BANK_MAX: u32 = 9_999_999;
/// Savings earn this part of themselves each day (0.2 %).
const INTEREST_PER: u32 = 500;
/// Days of interest paid at most when the island has been away a long while.
const INTEREST_DAYS: i64 = 30;

/// What the keeper sells, at most at once.
pub const STOCK: usize = 4;

/// The kinds of thing the keeper may pay extra for, by the day.
pub mod kind {
    pub const NONE: u8 = 0;
    pub const SHELLS: u8 = 1;
    pub const FRUIT: u8 = 2;
    pub const FISH: u8 = 3;
    pub const FOSSILS: u8 = 4;
}

/// What a purchase came to.
pub mod bought {
    /// Nothing there to buy.
    pub const NONE: u8 = 0;
    pub const OK: u8 = 1;
    /// Not enough coins in the wallet.
    pub const POOR: u8 = 2;
    /// No pocket free for it.
    pub const FULL: u8 = 3;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Offer {
    pub item: u16,
    pub price: u32,
}

/// A shell's worth, in the order of item::SHELL's: a scallop, a cowrie, a conch.
const SHELL_PRICES: [u32; item::SHELLS as usize] = [120, 60, 700];
/// A fossil's, from item::FOSSIL: an ammonite, a trilobite, a shark's tooth, a fern in stone.
const FOSSIL_PRICES: [u32; item::FOSSILS as usize] = [900, 1300, 1100, 700];
/// A fish's, from item::FISH: the sea's five, the river's four, the pond's two.
const FISH_PRICES: [u32; item::FISHES as usize] = [120, 250, 600, 800, 2500, 90, 900, 300, 1200, 1300, 3000];

/// The `id`'s place among `count` items from `first`.
fn among(id: u16, first: u16, count: u16) -> Option<usize> {
    (first..first + count).contains(&id).then(|| (id - first) as usize)
}

/// What an item is worth to the keeper on an ordinary day; 0 for what they do not buy.
pub fn base_price(id: u16) -> u32 {
    if let Some(k) = among(id, item::SHELL, item::SHELLS) {
        return SHELL_PRICES[k];
    }
    if let Some(k) = among(id, item::FOSSIL, item::FOSSILS) {
        return FOSSIL_PRICES[k];
    }
    if let Some(k) = among(id, item::FISH, item::FISHES) {
        return FISH_PRICES[k];
    }
    match id {
        item::SHOVEL | item::AXE | item::ROD => 150,
        item::BRANCH => 5,
        item::WOOD => 60,
        item::WEED => 10,
        x if among(x, item::FRUIT, item::FRUITS).is_some() => 100,
        _ => 0,
    }
}

/// The kind of thing an item is, for the day's extra.
pub fn kind_of(id: u16) -> u8 {
    if among(id, item::SHELL, item::SHELLS).is_some() {
        kind::SHELLS
    } else if among(id, item::FRUIT, item::FRUITS).is_some() {
        kind::FRUIT
    } else if among(id, item::FISH, item::FISHES).is_some() {
        kind::FISH
    } else if among(id, item::FOSSIL, item::FOSSILS).is_some() {
        kind::FOSSILS
    } else {
        kind::NONE
    }
}

/// What a new tool costs.
const TOOL_PRICE: u32 = 600;
/// Ten more pockets, from twenty, then from thirty.
const UPGRADE_PRICES: [u32; 2] = [3000, 8000];

impl Things {
    /// The kind the keeper pays extra for today.
    pub fn featured(&self) -> u8 {
        if self.day == i64::MIN {
            return kind::NONE;
        }
        1 + (day_seed(self.day, 77) % 4) as u8
    }

    /// What the keeper pays for one `id` today.
    pub fn sell_price(&self, id: u16) -> u32 {
        let base = base_price(id);
        if base > 0 && kind_of(id) == self.featured() { base * 3 / 2 } else { base }
    }

    /// What is for sale: the three tools, and ten more pockets while there are more to open.
    pub fn stock(&self) -> ([Offer; STOCK], usize) {
        let mut out = [Offer::default(); STOCK];
        let mut n = 0;
        for tool in [item::SHOVEL, item::AXE, item::ROD] {
            out[n] = Offer { item: tool, price: TOOL_PRICE };
            n += 1;
        }
        if self.size < POCKETS {
            let step = (self.size.saturating_sub(crate::things::POCKETS_FIRST) / 10).min(UPGRADE_PRICES.len() - 1);
            out[n] = Offer { item: item::POCKET_UPGRADE, price: UPGRADE_PRICES[step] };
            n += 1;
        }
        (out, n)
    }

    /// Buy the stock's `k`th offer (`bought`).
    pub fn buy(&mut self, k: usize) -> u8 {
        let (stock, n) = self.stock();
        if k >= n {
            return bought::NONE;
        }
        let o = stock[k];
        if self.wallet < o.price {
            return bought::POOR;
        }
        if o.item == item::POCKET_UPGRADE {
            self.size = (self.size + 10).min(POCKETS);
        } else {
            if !self.pockets_have_room(o.item) {
                return bought::FULL;
            }
            self.give(o.item, 1);
        }
        self.wallet -= o.price;
        bought::OK
    }

    /// Sell `count` (or what there is) from pocket `slot`; returns the coins paid, 0 when the keeper
    /// does not buy it. A wallet that would overflow takes only what fits.
    pub fn sell(&mut self, slot: usize, count: u16) -> u32 {
        let Some(s) = self.open().get(slot).copied() else { return 0 };
        let price = self.sell_price(s.item);
        if s.item == 0 || price == 0 || count == 0 {
            return 0;
        }
        let room = (WALLET_MAX - self.wallet) / price;
        let n = (count.min(s.count) as u32).min(room) as u16;
        if n == 0 {
            return 0;
        }
        let paid = price * n as u32;
        self.wallet += paid;
        if n == s.count {
            self.pockets[slot] = NO_SLOT;
            self.keep_hold();
        } else {
            self.pockets[slot].count -= n;
        }
        paid
    }

    /// Coins from the wallet into savings; returns how many went.
    pub fn deposit(&mut self, coins: u32) -> u32 {
        let n = coins.min(self.wallet).min(BANK_MAX - self.bank);
        self.wallet -= n;
        self.bank += n;
        n
    }

    /// Coins from savings into the wallet; returns how many came.
    pub fn withdraw(&mut self, coins: u32) -> u32 {
        let n = coins.min(self.bank).min(WALLET_MAX - self.wallet);
        self.bank -= n;
        self.wallet += n;
        n
    }

    /// A new day's interest on savings, for each day since it was last paid (a month of them at
    /// most); a clock put back pays none. `interest` keeps what it came to.
    pub(crate) fn pay_interest(&mut self, day: i64) {
        self.interest = 0;
        if self.interest_day == i64::MIN {
            self.interest_day = day;
        }
        if day <= self.interest_day {
            return;
        }
        let days = (day - self.interest_day).min(INTEREST_DAYS);
        self.interest_day = day;
        for _ in 0..days {
            let add = (self.bank / INTEREST_PER).min(BANK_MAX - self.bank);
            self.bank += add;
            self.interest += add;
        }
    }

    /// A tool's uses left as a part of a new one's (1 new, toward 0 worn).
    pub fn wear_left(&self, s: &crate::things::Slot) -> f32 {
        let new = item::uses(s.item);
        if new == 0 { 0.0 } else { s.uses as f32 / new as f32 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::island::{IslandMap, GRASS, SAND, SEA};
    use crate::things::{Things, TreeKind};

    fn island() -> Box<IslandMap> {
        let mut m: Box<IslandMap> = Box::new(IslandMap::EMPTY);
        m.reset(24, 20);
        for j in 0..20 {
            for i in 0..24 {
                let k = j * 24 + i;
                let edge = i < 2 || j < 2 || i >= 22 || j >= 18;
                m.tier[k] = if edge { 0 } else { 1 };
                m.ground[k] = if edge { SEA } else if j >= 16 { SAND } else { GRASS };
            }
        }
        m.house = [6.0, 5.0, 9.0, 7.0];
        m.door = [7.5, 7.0];
        m.set_shop([14.0, 8.0, 16.6, 9.6], 15.3, 8.55, 0.0);
        m
    }

    fn things(m: &IslandMap) -> Box<Things> {
        let mut t: Box<Things> = unsafe { Box::new_zeroed().assume_init() };
        t.clear_trees();
        t.add_tree(10.5, 12.5, 0.0, TreeKind::Fruit, 0);
        t.reset();
        t.new_day(m, 20_000);
        t
    }

    #[test]
    fn at_the_counter_a_talks_to_the_keeper() {
        let m = island();
        let mut t = things(&m);
        // In front of the counter (south, +z) facing it (north: yaw PI).
        assert_eq!(t.hint(&m, 15.3, 10.2, core::f64::consts::PI), crate::things::hint::TALK);
        assert_eq!(t.act(&m, 15.3, 10.2, core::f64::consts::PI), crate::things::Outcome::SHOP);
        // Turned away, or off to the side, it does not.
        assert_ne!(t.hint(&m, 15.3, 10.2, 0.0), crate::things::hint::TALK);
        assert_ne!(t.hint(&m, 19.0, 10.2, core::f64::consts::PI), crate::things::hint::TALK);
        // The stall is in the way.
        assert!(!m.fits(15.3, 8.8, 0.2, 0.5));
    }

    #[test]
    fn selling_pays_for_what_goes_and_the_days_kind_pays_more() {
        let m = island();
        let mut t = things(&m);
        t.give(20, 3);
        let k = t.open().iter().position(|s| s.item == 20).unwrap();
        let price = t.sell_price(20);
        assert_eq!(price, if t.featured() == kind::SHELLS { 180 } else { 120 });
        assert_eq!(t.sell(k, 2), price * 2);
        assert_eq!(t.open()[k].count, 1);
        assert_eq!(t.wallet, price * 2);
        assert_eq!(t.sell(k, 5), price);
        assert_eq!(t.open()[k].item, 0, "the last one goes and the pocket is free");
        // Each kind is the day's in turn, over the days.
        let mut kinds = [false; 5];
        for d in 0..40 {
            t.new_day(&m, 20_001 + d);
            kinds[t.featured() as usize] = true;
        }
        assert!(kinds[1..].iter().all(|&k| k));
    }

    #[test]
    fn buying_takes_coins_and_needs_a_pocket() {
        let m = island();
        let mut t = things(&m);
        let (stock, n) = t.stock();
        assert_eq!(n, 4);
        assert_eq!(stock[3].item, item::POCKET_UPGRADE);
        assert_eq!(t.buy(0), bought::POOR);
        t.wallet = 10_000;
        assert_eq!(t.buy(0), bought::OK);
        assert_eq!(t.wallet, 10_000 - stock[0].price);
        assert_eq!(t.open().iter().filter(|s| s.item == item::SHOVEL).count(), 2);
        // Pockets full: no room for a tool.
        while t.give(item::WOOD, 30) == 0 {}
        assert_eq!(t.buy(1), bought::FULL);
        // Ten more pockets, then ten more, then no more to buy.
        t.wallet = 20_000;
        assert_eq!(t.buy(3), bought::OK);
        assert_eq!(t.size, 30);
        assert_eq!(t.open().len(), 30);
        assert_eq!(t.buy(1), bought::OK, "a pocket free now");
        assert_eq!(t.stock().0[3].price, 8000);
        assert_eq!(t.buy(3), bought::OK);
        assert_eq!(t.size, 40);
        assert_eq!(t.stock().1, 3);
    }

    #[test]
    fn savings_take_and_give_coins_and_earn_by_the_day() {
        let m = island();
        let mut t = things(&m);
        t.wallet = 50_000;
        assert_eq!(t.deposit(60_000), 50_000);
        assert_eq!((t.wallet, t.bank), (0, 50_000));
        assert_eq!(t.withdraw(1000), 1000);
        assert_eq!((t.wallet, t.bank), (1000, 49_000));
        t.new_day(&m, 20_001);
        assert_eq!(t.interest, 98);
        assert_eq!(t.bank, 49_098);
        // Two days on, two days' interest; a clock put back pays none.
        t.new_day(&m, 20_003);
        assert_eq!(t.bank, 49_098 + 98 + 98);
        t.new_day(&m, 20_002);
        assert_eq!(t.interest, 0);
        t.new_day(&m, 20_003);
        assert_eq!(t.interest, 0, "not paid twice for the same day");
    }

    #[test]
    fn a_tool_wears_with_use_and_breaks() {
        let m = island();
        let mut t = things(&m);
        t.held = item::AXE;
        let k = t.open().iter().position(|s| s.item == item::AXE).unwrap();
        t.pockets[k].uses = 2;
        let chop = |t: &mut Things| {
            // What fell is left where it lies (A would pick it up first).
            for x in t.things.iter_mut() {
                x.lie = crate::things::Lie::Free;
            }
            t.act(&m, 10.5, 13.4, core::f64::consts::PI);
            let mut out = 0;
            for _ in 0..90 {
                out |= t.step(&m, 10.5, 13.4, 1.0 / 60.0);
            }
            out
        };
        assert_eq!(chop(&mut t) & crate::things::Outcome::BROKE, 0);
        assert_eq!(t.pockets[k].uses, 1);
        assert_ne!(chop(&mut t) & crate::things::Outcome::BROKE, 0);
        assert_eq!(t.broke, item::AXE);
        assert_eq!(t.held, 0, "nothing in hand");
        assert!(!t.open().iter().any(|s| s.item == item::AXE));
    }

    #[test]
    fn coins_pockets_and_wear_are_kept() {
        let m = island();
        let mut a = things(&m);
        a.wallet = 1234;
        a.bank = 56_789;
        a.size = 30;
        a.pockets[25] = crate::things::Slot { item: item::WOOD, count: 7, uses: 0 };
        a.pockets[0].uses = 9;
        let mut data = [0f32; crate::things::SAVE_MAX];
        let n = a.save(&mut data);
        let mut b = things(&m);
        assert!(b.load(&data[..n]));
        assert_eq!((b.wallet, b.bank, b.size), (1234, 56_789, 30));
        assert_eq!(b.pockets[25].count, 7);
        assert_eq!(b.pockets[0].uses, 9);
    }

    #[test]
    fn a_second_version_save_is_read_with_its_coins_and_an_empty_field_guide() {
        let m = island();
        let mut a = things(&m);
        a.wallet = 4321;
        a.bank = 1_000;
        a.size = 40;
        a.pockets[0].uses = 5;
        let mut data = [0f32; crate::things::SAVE_MAX];
        let n = a.save(&mut data);
        // The second version is the third without the field guide at its end.
        let n2 = n - crate::dex::ENTRIES * 3;
        data[0] = 2.0;
        let mut b = things(&m);
        b.dex[0].count = 3;
        assert!(b.load(&data[..n2]));
        assert_eq!((b.wallet, b.bank, b.size, b.pockets[0].uses), (4321, 1_000, 40, 5));
        assert!(b.dex.iter().all(|e| e.count == 0));
    }

    #[test]
    fn a_first_version_save_is_read_with_new_tools_and_no_coins() {
        let m = island();
        let t = things(&m);
        // The first version: day, held, then 20 pockets and 60 places of the box as item and count.
        let mut v1 = vec![1.0f32, 20_000.0, 2.0];
        for k in 0..80 {
            let (id, n) = match k {
                0 => (item::SHOVEL, 1),
                1 => (item::AXE, 1),
                2 => (30, 4),
                _ => (0, 0),
            };
            v1.push(id as f32);
            v1.push(n as f32);
        }
        v1.push(t.tree_count as f32);
        for _ in 0..t.tree_count {
            v1.extend_from_slice(&[3.0, 0.0, 0.0, 0.0]);
        }
        v1.push(0.0);
        let mut b = things(&m);
        assert!(b.load(&v1));
        assert_eq!((b.size, b.wallet, b.held), (20, 0, item::AXE));
        assert_eq!(b.pockets[1].uses, item::uses(item::AXE));
        assert_eq!(b.pockets[2], crate::things::Slot { item: 30, count: 4, uses: 0 });
    }
}
