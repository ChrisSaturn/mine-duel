# First-Person Controller Alignment

**Date:** 2026-03-22  
**Scope:** `PROJECT/client/fps-boilerplate/src/main.js`

## Goal

Align the FPS boilerplate controller behavior more closely with the first-person path in `client/three-player-controller-master`, while keeping the prototype strictly first-person.

## Implemented Changes

1. Replaced `PointerLockControls` movement with a custom first-person controller loop.
2. Added `setToward`-style mouse look:
   - yaw rotates the player root (`playerRig`)
   - pitch rotates the camera with clamp limits (`minPitch`, `maxPitch`)
3. Switched movement vector calculation to camera-heading-relative movement (WASD/arrow input mapped through camera direction angle).
4. Added explicit run modifier (`Shift`) that increases horizontal movement speed.
5. Kept jump + gravity handling with a vertical velocity state and ground snap logic based on downward raycast.
6. Added out-of-bounds recovery reset for falls below `fallResetHeight`.
7. Reworked camera mounting to a head-linked first-person behavior:
   - camera position is driven from the runtime head node transform (not a fixed `playerRig` eye point)
   - camera is offset forward/up from the head anchor to avoid clipping inside the head mesh
   - camera pitch and head pitch are driven from the same clamped look state
   - runtime player model stays visible in gameplay (including head), while editor mode still hides the runtime model
   - default FOV is `70` and default pitch limits are `[-PI/2, +PI/2]`
8. Added procedural runtime walk-cycle animation for `arm-left`, `arm-right`, `leg-left`, and `leg-right` model nodes while grounded movement input is active.
9. Tuned walk-cycle feel to be broader and slower:
   - cycle frequency range reduced to `2.1Hz -> 4.1Hz` (from `3.4Hz -> 6.2Hz`)
   - arm swing amplitude range increased to `0.32 -> 0.92` radians (from `0.22 -> 0.68`)
   - leg swing amplitude range increased to `0.44 -> 1.18` radians (from `0.30 -> 0.95`)

## Explicitly Out of Scope

- Fly mode is not implemented.
- Third-person camera/view switching is not implemented.
- Vehicle controller mode is not implemented.

## Notes for Follow-up

- If collision fidelity needs to match `three-player-controller-master` further, next step is capsule/BVH collision resolution (currently this prototype uses raycast-based ground detection only).
