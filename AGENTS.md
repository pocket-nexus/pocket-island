# Repository instructions

- Pocket3D owns reusable animation, mesh formats and GPU backends in the pinned `vendor/pocketjs` submodule. Put Island movement, expressions, chat, camera, scene composition and application lifecycle under this repository.
- Do not edit the submodule to fix application behavior. Send reusable changes to PocketJS, then update the pinned revision here.
- The Pocket3D title card plays first at every launch, in the `release` and `capture` flavors, before the GPU is set up: `pocket3d_title_play()` in `3ds/main.c`, after `gfxInitDefault()` and before `C3D_Init`. It comes from PocketJS (`vendor/pocketjs/engine/pocket3d/crates/pocket3d-title`), and the Pocket3D License makes it a condition of distributing Island. Do not skip, shorten, recolour or redraw it here, and do not draw the mark with Island's own renderer.
- Use Conventional Commits for commits and pull requests. Publish validated changes as a Draft PR before review; mark it ready before an authorized merge.
- Preserve the distinction between native build, emulator rendering, hardware timing and physical interaction evidence. Emulator FPS is not a hardware performance claim.
