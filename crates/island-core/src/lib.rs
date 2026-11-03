//! Pocket Island's core: the rules of the room and of the island, walking, finding the way, the
//! player's game and pose, and the island's things and the player's pockets. It owns the state and the clock of the player; the browser (as
//! WebAssembly) and the Nintendo 3DS (linked into the renderer) hand it the stick and the room,
//! and draw what it says. The interfaces and mods are scripts on top of it.
//!
//! The core is `no_std` and takes no memory from a heap: everything it keeps is in fixed storage
//! (`ffi`), so it runs the same on a browser's page and on a handheld.

#![cfg_attr(not(test), no_std)]

pub mod ffi;
pub mod game;
pub mod indoors;
pub mod island;
pub mod math;
pub mod pose;
pub mod room;
pub mod things;
pub mod walk;

#[cfg(all(not(test), target_arch = "wasm32"))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    core::arch::wasm32::unreachable()
}

/// On the console the program's own runtime provides the panic handler (this archive's symbols are
/// made weak when it is linked, tools/n3ds.ts); this one stands in when nothing else does.
#[cfg(all(not(test), not(target_arch = "wasm32")))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    loop {
        core::hint::spin_loop();
    }
}
