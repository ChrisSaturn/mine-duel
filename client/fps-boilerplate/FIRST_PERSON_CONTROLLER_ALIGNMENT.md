# First-Person Controller Alignment

**Date:** 2026-03-22  
**Scope:** `PROJECT/client/fps-boilerplate/src/main.js`, `PROJECT/client/fps-boilerplate/src/runtime/firstPersonControllerRuntime.js`

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
   - camera position is derived from runtime-head local anchor sampling each frame (head world -> rig local), using local-space camera offsets only
   - camera anchor applies live runtime-head local X/Z anchoring with vertical/crouch/head-bob offsets; extra forward offset is now `0` by default to keep first-person body placement inside the capsule
   - camera pitch and runtime head pitch are driven from the same clamped look state
   - runtime player model stays visible in gameplay with head-only occluder meshes hidden, while editor mode still hides the runtime model
   - default FOV is `70` and effective map-camera pitch limits are `[-85°, +90°]` (`[-1.48353, +PI/2]`)
8. Added procedural runtime walk-cycle animation for `arm-left`, `arm-right`, `leg-left`, and `leg-right` model nodes while grounded movement input is active.
9. Tuned walk-cycle feel to be broader and slower:
   - cycle frequency range reduced to `2.1Hz -> 4.1Hz` (from `3.4Hz -> 6.2Hz`)
   - arm swing amplitude doubled to `+/-40` degrees with a forward-biased `-30` degree center
   - leg swing amplitude doubled to `+/-60` degrees
10. Added fixed-timestep (`50Hz`) velocity-change horizontal movement to better match Unity's `VelocityChange`-style controller behavior.
11. Added sprint stamina state machine with cooldown, sprint-only FOV kick (`80`), and bottom-center stamina bar scale/fade.
12. Added crouch state (`C`/`Ctrl`) with speed reduction and camera/head height blend-down.
13. Added zoom (`RMB`) with smooth FOV lerp, gated behind non-sprinting state.
14. Added camera head-bob with sprint/crouch frequency modifiers and idle return smoothing.
15. Updated procedural limb animation to a Unity-like cycle (`sin(timer*10)` with `+/-60` legs and `+/-40 - 30` front-biased arms).
16. Refactored first-person runtime into a modular controller service (`createFirstPersonControllerRuntime`) with Unity-style subsystem boundaries:
   - look/camera pitch-yaw handling
   - zoom state + FOV transition
   - sprint stamina/cooldown + bar UI
   - crouch toggle/hold state + blend
   - head-bob phase and offset generation
   - horizontal velocity-change movement intent
17. Kept world-specific responsibilities in `main.js` (collider resolution, grounding, spawn reset, map/runtime stream wiring) while delegating controller behavior to the modular runtime.
18. Runtime character no longer applies a forced `Y=PI` model rotation on load; first-person anchor math now uses the model’s native forward orientation to avoid camera-behind-body projection artifacts.

## Explicitly Out of Scope

- Fly mode is not implemented.
- Third-person camera/view switching is not implemented.
- Vehicle controller mode is not implemented.

## Notes for Follow-up

- If collision fidelity needs to match `three-player-controller-master` further, next step is capsule/BVH collision resolution (currently this prototype uses raycast-based ground detection only).
- For Unity 6 parity targets (camera, movement, stamina, head bob, procedural limbs, pickaxe mining, hover outline), use [`DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md`](./DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md).
