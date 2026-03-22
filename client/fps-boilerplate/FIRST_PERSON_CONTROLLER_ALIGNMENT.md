# First-Person Controller Refactor (Fresh Start)

**Date:** 2026-03-22  
**Scope:** `PROJECT/client/fps-boilerplate/src/runtime/firstPersonControllerRuntime.js`, `PROJECT/client/fps-boilerplate/src/main.js`

## Goal

Replace the previous split first-person implementation with a fresh, single-runtime controller architecture where one subsystem owns movement, gravity, collision, grounding, jump, and camera-controller state.

## What Changed

1. Rebuilt `createFirstPersonControllerRuntime` from scratch.
2. Moved fixed-step player simulation into the runtime:
   - horizontal velocity-change movement
   - jump request + consume flow
   - gravity integration
   - horizontal capsule-style collision solving
   - ground probe snap
   - fall reset to spawn
3. Moved spawn management into the runtime with:
   - `setSpawn(position, yaw)`
   - `resetToSpawn()`
4. Kept and rebuilt camera/controller state subsystems inside runtime:
   - yaw/pitch look state
   - crouch blend
   - sprint stamina + cooldown
   - zoom/sprint FOV priority
   - head-bob offset state
5. Added explicit runtime state/query methods used by game systems:
   - `getVelocity()` for stream pose publishing
   - `getCanJump()` / `getIsGrounded()` for gameplay and animation gates
   - `getMovementState()` for procedural limb animation
6. Simplified `main.js`:
   - removed duplicated collision/grounding/movement functions
   - replaced local `playerVelocity` and `canJump` ownership with runtime ownership
   - fixed-step loop now calls `firstPersonController.fixedUpdate(...)`
   - jump input now uses `firstPersonController.requestJump()`
7. Tuned first-person camera comfort guardrails:
   - kept runtime camera vertical offset (`cameraHeadVerticalOffset = 0.1`) and set forward bias (`cameraHeadForwardOffset = 0.12`) for true in-body first-person framing
   - camera comfort offsets are scale-independent (no `playerModelScale` multiplier)
   - expanded full-body down-look cap to `75°` (`CONFIG.maxPitch = min(CONFIG.maxPitch, maxPitchDownLimit)`), including map-preset overrides
8. Stabilized runtime head anchor to prevent rotational camera drift:
   - sample eye anchor on bind/rebind from head-mesh world bounds using a higher eye-height ratio
   - fallback to head-node world origin when head mesh bounds are unavailable
   - use sampled head **Y + Z offsets** (not head X) for runtime camera base
   - runtime camera local X stays fixed to prevent yaw-induced lateral drift
   - clamp sampled `Z` anchor inside capsule envelope (`~45%` of collider radius) so camera cannot drift outside the player pill
   - apply a forward-placement safety floor (`max(0.18, 40% of collider radius)`) so torso/arms do not near-plane project in front of camera
9. Runtime player visibility policy:
   - local runtime player model is hidden in gameplay
   - local runtime player model remains hidden in editor mode
10. Added first-person tool viewmodel policy:
   - Kenney Survival `tool-pickaxe` loads from `public/models/kenney-survival/GLB format/tool-pickaxe.glb`
   - model is attached to camera-space for Minecraft-style in-hand rendering with a cloned right-arm holder
   - tool root/arm scale remains `0.22`, while pickaxe scale is decoupled and set to world-scale `1.0`
   - right-arm viewmodel keeps source-rig handedness/orientation (no X-axis arm mirror) to preserve correct shoulder-to-hand direction
   - visibility is gameplay-only (hidden in editor), with a more outward resting pickaxe orientation and an aggressive but slower left-click mine swing that clearly reads up-then-down (anticipation/impact/recovery), plus impact jitter + emissive energy pulse + idle sway animation

## New Responsibility Split

- `src/runtime/firstPersonControllerRuntime.js`
  - First-person gameplay state machine + fixed-step physics/collision stack.
- `src/main.js`
  - Orchestration only: rendering, map runtime wiring, wallet/stream wiring, runtime model visuals/animation, pointer-lock lifecycle.

## Runtime API (Current)

- Look/camera: `setToward`, `setLookPitch`, `getLookPitch`, `clampLookPitchToBounds`
- Stance/zoom: `setCrouched`, `getIsCrouched`, `setZoomed`
- Lifecycle: `handleGameplayInactive`, `resetSprintState`, `resetMovementState`, `clearVelocity`, `resetForSpawn`
- Simulation: `update(delta, { gameplayActive })`, `fixedUpdate(step, { gameplayActive })`
- Spawn/jump: `requestJump`, `setSpawn`, `resetToSpawn`
- Query state: `getCrouchBlend`, `getHeadBobOffsetY`, `getMovementState`, `getVelocity`, `getCanJump`, `getIsGrounded`

## Validation

- `npm run build` passes (Vite build + `verify:no-editor-in-dist`).

## Follow-up

- If we need closer Unity Rigidbody parity later, the next step is replacing raycast/box collision approximation with a dedicated capsule vs mesh BVH solver while preserving this runtime API boundary.
