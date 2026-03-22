# MINE-DUEL FPS Boilerplate

Minimal standalone first-person prototype using npm `three` package with Vite.

This is the active client prototype in the workspace, not the final production client architecture.

## Runtime Overview

- World/camera/hitboxes are loaded from `public/maps/default-map.v1.json`.
- The default map uses procedural `cube-world-ground` as a block-array base environment with a deterministic mixed-ore `16x16x8` mine patch (stone, coal, diamond, purple ore) whose top surface stays aligned with the surrounding terrain and tiles flush (no seam gaps).
- The default map now layers environment occlusion beyond the mine perimeter with an additional outer tree ring (`outer-tree-*`) and a dispersed mountain field (`mountain-ring-*`) generated from a noise-driven, smoothed heightmap (Minecraft-style silhouette) that keeps long-distance breakup without reading as a continuous enclosure.
- The default world `biomeLighting` is now `peak` for a lighter/friendlier daytime look (higher-key atmosphere + softer grade/bloom).
- Runtime map loading + application lives in `src/runtime/mapRuntime.js`.
- Map manifests may define `biomeLighting` (`peak`, `forest`, `desert`, `snow`, `island`) to drive `/game` mood colors across atmosphere, block shading, and post-process.
- Runtime asset URLs are resolved through `import.meta.env.BASE_URL` so hosted subpaths (for example `/game/`) still load maps/models correctly.
- Dev-only editor tooling lives in `src/dev/editorBootstrap.js` and is dynamically imported only in dev mode.
- Player runtime collision + grounding now live entirely in `src/runtime/firstPersonControllerRuntime.js` (capsule-style horizontal blocking, ground probe snap, jump/gravity integration, and spawn reset flow).
- Runtime object collision now prefers explicit template colliders (`userData.mapCollider=true`) and otherwise uses implicit per-mesh colliders for world elements (with box-bounds fallback only when no mesh is available).
- Procedural `cube-world-ground` now uses explicit per-block instanced mesh colliders (grass + mine patch ore), so mining a block removes both its visual instance and its collider, letting the block below become the next support surface.
- Synthetic mine-column grounding has been removed; mine traversal support now comes from real block colliders only.
- A hidden patch-local bedrock bounds collider is placed at mine depth limit to prevent void falls when a column is fully mined out.
- Map manifest supports `spawnPreset` (`position`, `yaw`) and runtime spawn/reset now use it, so player spawn stays inside authored map space.
- Runtime + editor player preview default to `Kenney Blocky Characters` (`/models/characters/kenney-blocky/character-a.glb`).
- Lobby view now renders a dedicated 3D character preview stage with left/right skin arrows (`character-a` through `character-r` under `public/models/characters/kenney-blocky/`), and the selected skin is used as the runtime player model when entering game.
- Lobby character preview camera now auto-fits each selected skin (including on resize) with a strong close-up zoom target (~1.7x) and lower vertical framing, and the stage container/canvas footprint is enlarged in UI (including responsive breakpoints); viewport safety correction enforces head, shadow, and model-bottom (legs) visibility to prevent lower-body clipping.
- Lobby shell now follows the Figma `Home Screen - Scary Tales` composition (top HUD, centered hero stage, bottom event + CTA lane) implemented with project-native HTML/CSS only (no direct Figma asset usage), with side rail action chips removed and an edge-to-edge full-viewport layout (no contained outer card frame).
- Lobby character stage now expands across the center lane, the skin arrows are overlaid on top of the preview canvas (with camera side-safe margins), and stage backdrop fill remains transparent with no pedestal stand element rendered; preview fit includes projected shadow-disc visibility correction with a stricter bottom-safe margin while keeping the shadow plane slightly below the feet to avoid overlap clipping with the character.
- Lobby character preview now spawns facing the camera (front-facing at load) before the idle turntable spin advances, avoiding the initial back-facing frame in lobby.
- Lobby skin selector arrows now render as literal `<` and `>` glyphs, and their arrow boxes use a glassmorphism treatment (blurred translucent surface + soft highlights) to better match the stage overlay aesthetic.
- Lobby root now mounts `public/background.mp4` as a full-viewport background video (`autoplay`, `loop`, `playsinline`) with audio left on (`muted=false`), bottom-aligned framing, slight vertical stretch for composition, plus a first-interaction playback retry fallback for browsers that block audible autoplay.
- Lobby flow is wallet-first in the new layout: `Connect Wallet` is in the top-right menu chip, and the primary CTA label switches between `CONNECT WALLET` (disconnected) and `ENTER GAME` (connected).
- Lobby footer now includes a `Create Room` CTA that submits on-chain `create_room(stake_lamports)` and returns a room-code handle from chain (one-room-per-creator rule).
- `Enter Game` and join flow are room-code-driven and require the target room-code + wallet; no global room browser is used.
- Connected-wallet controls now use a top-right dropdown: clicking the wallet chip while connected opens a menu with `Disconnect`, while disconnected click behavior still starts `connect()`.
- Wallet disconnect flow is gateway-driven and immediate: on disconnect request, UI state flips out of connected instantly and all connected adapters are asked to disconnect to prevent stale `Wallet connected` labels.
- Gateway now ignores late wallet `connect` events after a manual disconnect until the next explicit `connect()` call, preventing stale address/SOL-balance rebound after disconnect.
- Lobby wallet dropdown close handling is click-phase (not pointerdown) and the `Disconnect` menu item now stops propagation before invoking disconnect, so the action is not dropped by menu-close races.
- Lobby wallet dropdown layering now keeps top-nav actions above stage content, and the `Disconnect` menu item uses full-row hit area sizing for accurate hover/click targeting.
- Lobby click feedback is lobby-scoped: clicking lobby buttons (connect, enter, skin arrows) now triggers short screen-shake pulses plus square confetti bursts, without changing in-game effect systems.
- Lobby skin display is now promoted to the top of the character stage as a dedicated `SKIN` header with a blue highlight and underline accent, and character camera framing is tuned to render skins larger while preserving full bottom floor-shadow visibility using a stronger dark-green shadow disc (HSL saturation `0.3`).
- When connected, the top-right lobby wallet button shows the short connected wallet address, and the top resource lane uses a single Solana-logo pill that displays live SOL balance as a numeric value.
- Top nav layout is refactored into explicit responsive regions (`brand`, `metrics`, `actions`) so desktop keeps a single-row header and mobile stacks controls predictably without overlap.
- Lobby footer event card shows `BLITZ V2` with `MAGICBLOCK` subtitle, while the primary `Enter Game` CTA remains the main footer action.
- Lobby character stage/canvas height is increased across desktop/tablet/mobile breakpoints so the bottom character shadow renders fully in preview.
- In-game HUD styling (`src/style.css`) now follows the Lobby UI visual language (shared palette/tokens, pixel card gradients, chip-style wallet controls, lobby-colored sprint bar, and updated pointer-lock instruction card), while preserving existing HUD IDs/runtime logic.
- In-game HUD now includes a default bottom-right notification bopper (`#notification-bopper`) with lobby-aligned styling, queued runtime alerts, tone states (`info`, `success`, `warning`, `danger`), and game-route-only display.
- Runtime player model uses a slower, extra-aggressive procedural walk-cycle limb animation while moving on ground (arm/leg swing amplitudes doubled to `+/-40` with a forward-biased `-30` arm center, and `+/-60` legs).
- Runtime camera anchor now keeps local `X` fixed and samples the bind/rebind anchor from head-mesh world bounds (higher eye-height ratio), with fallback to head-node origin when bounds are unavailable, preserving stable first-person eye placement while preventing yaw-induced lateral drift.
- Runtime camera sampled `Z` anchor is clamped to the capsule envelope (`~45%` of collider radius), preventing camera placement outside the player pill.
- Runtime first-person camera local `Z` also enforces a forward-placement safety floor (`max(0.18, 40% of collider radius)`), preventing torso/arm near-plane projection in front of view on larger scaled avatars.
- Runtime first-person camera uses scale-independent comfort offsets (`cameraHeadVerticalOffset = 0.1`, `cameraHeadForwardOffset = 0.12`) and a full-body down-look cap of `75°` (applied after map camera presets), so the player can see torso/legs in first-person without shifting to third-person framing.
- Runtime player model keeps native GLTF yaw orientation at load (no forced `Y=PI` flip), which avoids head-anchor inversion that can place the body in front of camera.
- Runtime map camera presets still enforce a pitch floor of `-85°` (`pitchMin >= -1.48353`) so camera tilt cannot exceed near-vertical upward extremes.
- Local runtime player model is now hidden during gameplay and editor mode to keep pure camera-only first-person rendering.
- Runtime first-person tool viewmodel now loads Kenney Survival `GLB format/tool-pickaxe.glb` and attaches it to camera space with a camera-space cloned right-arm holder (Minecraft-style in-hand view), with gameplay-only visibility (hidden in editor), decoupled scale (`tool-root/arm` stays at `0.22` while pickaxe renders at world-scale `1.0`), preserved arm handedness/orientation from the source rig (no arm-axis mirroring), a more outward resting tool rotation, and a faster extra-aggressive mine animation with a larger up-then-down strike arc, stronger impact jitter, emissive energy pulse, and stronger idle sway.
- First-person pickaxe viewmodel materials now preserve self-occlusion (`depthTest=true`, `depthWrite=false`) and enforce linear+mipmapped texture sampling with anisotropy so the in-hand atlas renders smoothly at close camera distance.
- Mine-break debris particles now launch with stronger spread/speed, heavier spin, lower drag, longer hang-time, and larger chunk sizes so the floating breakup reads more aggressive during block destruction.
- Mine hover targeting now drives a shader-based white full-face overlay across the entire currently aimed stone/ore block in the mine area (`src/runtime/voxelRuntime.js`), with frame-level camera raycast in `src/main.js` and deterministic map-grid coordinate projection before on-chain `mine(x,y,z)` dispatch.
- Atmosphere runtime (`src/runtime/atmosphereRuntime.js`) now drives a PEAK-inspired sky model (cinematic warm horizon, cool zenith, layered clouds, and top-locked gameplay sun lighting/fog/exposure, without an in-view sun orb).
- Rendering now uses post-processing (`src/runtime/postProcessRuntime.js`) with highlight bloom + cinematic color grading + FXAA through `EffectComposer`.
- Shared biome style presets now live in `src/runtime/blockworldStyleRuntime.js`, and are consumed by map/atmosphere/voxel/post runtimes.
- Runtime map objects and voxel chunks both cast + receive shadows under the directional sun light.
- The procedural base ground (`primitive-plane`) is configured as receive-only for shadows to avoid large-floor self-shadow blackouts.
- Wallet connector runtime (`IC-001`) lives in `src/wallet/walletGateway.js` and is lazy-loaded from HUD wiring in `src/main.js` to keep gameplay bundle weight lower.
- Hash router guard in `bootstrap()` redirects unauthorized `#/game` visits back to `#/lobby` without referencing router state during initial dispatch.

## Wallet Connector (Solana)

- Connectors: `Phantom` + `Solflare` via `@solana/wallet-adapter-*`.
- Surface exposed by gateway:
  - `connect()`
  - `disconnect()`
  - `signTransaction(tx)`
  - `signAllTransactions(txs)`
  - `signMessage(bytes)`
  - `sendTransaction(tx, options)` (uses configured RPC connection)
- Default network is `devnet` (override with env vars below).
- Last selected connector is persisted in browser `localStorage`.

### Wallet Environment Variables

- `VITE_SOLANA_NETWORK` (`devnet` | `testnet` | `mainnet-beta`, default `devnet`)
- `VITE_SOLANA_RPC_URL` (optional explicit RPC URL override)
- Workspace default profile sets `VITE_SOLANA_RPC_URL` to a Helius devnet endpoint in local `.env.local`.

### Serverless Gameplay Runtime Environment Variables

- `VITE_MINE_DUEL_PROGRAM_ID` (`4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ` on this workspace)
- `VITE_SOLANA_NETWORK` (`devnet` | `testnet` | `mainnet-beta`, default `devnet`)
- `VITE_SOLANA_RPC_URL` (optional explicit base RPC for chain reads/writes; must support websocket subscriptions for room/reveal updates)
- `VITE_ER_RPC_URL` (optional explicit ER RPC/rollup router URL for session-key mining instructions).
- `VITE_ER_WS_URL` (optional explicit websocket endpoint for ER account subscriptions; defaults to ER RPC ws transform).
- Managed `world_profile`/PER stream gateway flow is deprecated in this client path and no longer the default gameplay runtime.
- Gameplay is two-phase on finalization: `finalize_win` on ER schedules undelegation, then `settle_win_payout` is submitted on base when writable ownership returns.

### Gameplay Architecture (v1)

- Canonical room states: `Lobby` -> `WaitingForOpponent` -> `WaitingForVrf` -> `Active` -> `Won` -> `Finalized` -> `PayoutSettled`.
- Game input/pointer-lock is hard-gated to `Active`; creators entering immediately after `create_room` stay in a wait screen until player two joins.
- While in `WaitingForOpponent`/`WaitingForVrf`, gameplay route renders a room-status overlay with the full room code; creator sees a `Cancel Room` action wired to on-chain `cancel_room_prejoin`.
- Base (L1) runtime writes: `create_room` / `cancel_room_prejoin` / `join_room` / `delegate_private_state` / `settle_win_payout`.
- ER/runtime writes: `request_winner_vrf` / `mine` / `finalize_win`.
- Settlement support: base-layer `process_undelegation` after `finalize_win` ownership return.
- Session keys are auto-managed in client: create when entering `Active`, sign repeated `mine` only with session signer, refresh/revoke around room exit and settlement.
- Room discovery is room-code-only and uses creator-owned single-PDA naming; there is no room-browser list in client v1.
- Match completion is two-step payout: `finalize_win` commits + undelegation, then base-layer `settle_win_payout` drains escrow and confirms final payout.

### Solana Runtime Playbook

- MagicBlock implementation reference: [`../../MAGICBLOCK-PLAYBOOK.MD`](../../MAGICBLOCK-PLAYBOOK.MD)

## Controls

- Click `Click To Play` to lock pointer
- Move: `W/A/S/D` or arrow keys
- Sprint: `Shift` (stamina-based with cooldown + FOV kick)
- Crouch: `C` / `Ctrl`
- Zoom: right mouse button (`RMB`)
- Jump: `Space`

### Dev Editor Controls

Available only when running with `VITE_ENABLE_EDITOR=1`.

- Toggle editor: `` ` ``
- Edit mode uses a standalone scene-view camera (separate from player first-person camera)
- Scene navigation: `RMB` orbit, hold `LMB` on empty space to pan, mouse wheel zoom
- Edit camera auto-frames world objects (ignores oversized ground hitbox bounds)
- Player rig marker is shown in edit mode for camera-relative authoring context
- Camera location + forward direction marker is visible in edit mode
- Character preview model is auto-centered/grounded at player rig location in edit mode
- Runtime player capsule dimensions are derived from the player model bounds (model-first collider sizing)
- Runtime player model is loaded in normal gameplay too (not editor-only)
- Camera section includes `Player Scale` to resize runtime character and collider together
- Runtime player model stays visible during gameplay, and runtime model is hidden while editor mode is open to avoid duplicate player visuals
- 3D transform controller is attached to selected mesh with on-panel `Move` / `Rotate` / `Scale`
- Transform handles are forced on-top and auto-scale with camera distance for visibility
- Collider wireframes are visible in editor via `Show Colliders` toggle
- `Ctrl/Cmd + Z` reverts the last editor change (transform/edit/import operations)
- Modes: `1` world, `2` camera, `3` hitbox
- Transform selected: `W` translate, `E` rotate, `R` scale
- Duplicate selected: `Ctrl/Cmd + D`
- Delete selected: `Delete`
- Nudge selected: arrow keys (`PageUp/PageDown` for Y)
- Exit editor to resume pointer-lock gameplay movement

## HUD

- Displays controls summary
- Includes a real-time FPS counter
- Uses Lobby-aligned styling for the gameplay HUD shell, wallet controls, crosshair glow treatment, sprint bar, and pointer-lock instruction overlay
- Includes a bottom-right notification bopper for gameplay runtime events (wallet transitions, routing state, and settlement/failure notices)
- Includes a room wait overlay that shows room code + lifecycle messaging before match activation, with creator-only cancel while pre-join.
- Includes a match end visual overlay (winner/loser card) with a 3-2-1 countdown before returning to lobby
- Shows a centered Minecraft-style crosshair during active pointer-lock gameplay
- Shows a stamina sprint bar near the bottom-center that scales/fades based on sprint remaining
- Uses `Minecraft.ttf` loaded from `public/fonts/minecraft.ttf`

## Visual Pipeline

- Atmosphere:
  - Sky dome shader blends biome gradients with layered clouds, but gameplay lighting is now day-locked for stable, clean asset presentation.
  - Sky dome radius is tuned to the runtime clip/fog envelope to avoid visible dome-edge circles in gameplay view.
  - Sun direction stays fixed high in the sky and no longer cycles through sunset/night in default runtime.
  - Fog is pushed far back to avoid washing out asset colors in near/mid gameplay space.
- Illumination:
  - Renderer now uses `NoToneMapping` for faithful authored texture colors.
  - Lighting stack keeps physically-correct lights but is tuned for stable daylight readability over cinematic day/night shifts.
- Shadows:
  - Directional shadows now use `PCFShadowMap` with reduced softness to keep silhouettes cleaner.
  - Shadow frustum scales by viewport and now uses texel-snapped focus anchoring around the player to reduce crawl/shimmer while moving.
  - Shadow map resolution now scales by viewport class (`4096` desktop / `2048` compact viewport) for cleaner distant silhouettes.
- Blockworld shading:
  - Voxel runtime now uses `MeshLambertMaterial` and per-face color weighting so top faces read brightest, side faces shift cooler/darker, and bottom faces remain tinted (not black).
  - Voxel geometry applies subtle height-based gradients to keep large surfaces painterly/readable without noisy texture detail.
  - Mine hover highlight uses a dedicated `ShaderMaterial` expanded white overlay on the entire target mesh (all visible block faces), fed by center-camera mine targeting (voxel raycast + mine instanced-mesh fallback + tagged stone rock meshes) so targeted stone/ore blocks remain clearly readable against mixed ore colors.
  - Cube World world objects (`cube-world-*`, including procedural `cube-world-ground` instances built from Cube World block materials) now preserve original authored textures.
  - Stylized biome recolor pass is scoped to `block-grass*` and `primitive-plane`; character templates (`character-male-a`, `blocky-character-*`) and `demo-scene` remain excluded.
- Post-processing:
  - Default runtime keeps only the `RenderPass` path (bloom/FXAA/grade disabled) for a cleaner, less stylized look.
  - Post-processing runtime still supports style controls but they are no-ops under clean catalog mode.

## Controller Feature Notes

- First-person controller alignment notes: [`FIRST_PERSON_CONTROLLER_ALIGNMENT.md`](./FIRST_PERSON_CONTROLLER_ALIGNMENT.md)
- Modular first-person runtime controller now lives in `src/runtime/firstPersonControllerRuntime.js` and is consumed by `src/main.js` for look/zoom/sprint/crouch/head-bob plus fixed-step physics/collision/jump/spawn flow.
- Unity 6 parity reference for full first-person behavior porting: [`DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md`](./DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md)
- First-person camera architecture (yaw/pitch axis split, head-bob joint, dynamic FOV priority): [`DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md#camera-system`](./DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md#camera-system)

## 3D Asset + Map Organization

- Asset flow: [`ASSET_FLOW.md`](./ASSET_FLOW.md)
- Editor + schema workflow: [`EDITOR_WORKFLOW.md`](./EDITOR_WORKFLOW.md)

## Imported Packs (2026-03-22)

- `Kenney Blocky Characters` imported under `public/models/characters/kenney-blocky/`
- `Kenney Survival` imported under `public/models/kenney-survival/` as a full source mirror (`GLB format`, `FBX format`, `OBJ format`, and `Textures`)
- `Kenney UI Pack - Pixel Adventure` imported under `public/ui/kenney-ui-pack-pixel-adventure/`
- `Cube World - Aug 2023` imported under `public/models/cube-world/` as a full source mirror (`Animals`, `Blocks`, `Characters`, `Enemies`, `Environment`, `Pixel Blocks`, `Tools` with `glTF`, `FBX`, `OBJ`, and `Blends` subfolders)
- `Minecraft.ttf` imported as `public/fonts/minecraft.ttf`
- Lobby screen intentionally avoids imported UI texture packs for layout composition, using local CSS primitives for the Figma-style shell.
- `src/runtime/mapRuntime.js` exposes `blocky-character-a` through `blocky-character-r` map templates
- `src/runtime/mapRuntime.js` also exposes:
  - `primitive-plane` (legacy simple generated base area)
  - `cube-world-block-grass` (single cube-world grass block template)
  - `cube-world-block-{stone,dirt,coal,diamond,purple-ore}` (Cube World block template aliases used by the procedural mine patch + mountain belt)
  - `cube-world-ground` (contiguous cube grid with deterministic mixed-ore `16x16x8` mine patch using stone/coal/diamond/purple-ore source meshes, explicit instanced per-block colliders for grass + ore, and a hidden patch-local bedrock floor collider at depth limit)
  - Cube World environment props:
    - `cube-world-tree-{1,2,3}`
    - `cube-world-rock-{1,2}`
    - `cube-world-mushroom`
    - `cube-world-fence-{center,corner,end}`
    - `cube-world-sugarcane` (mapped to Cube World bamboo for reed-like vegetation)
    - `cube-world-flowers-{1,2}`
    - `cube-world-grass-{small,big}`
  - Kenney Survival environment props:
    - `kenney-survival-rock-{a,b,c}`
  - `demo-scene` (imported environment glTF with a runtime-generated ground collider)
- `public/maps/default-map.v1.json` now seeds a populated blockworld biome using Cube World props (trees, rocks, mushrooms, fences, sugarcane/bamboo, flowers, and grass) plus Kenney Survival perimeter rocks (`rock-a`, `rock-b`, `rock-c`) on top of `cube-world-ground`.
- Mine-zone dressing now centers around the mixed-ore `16x16x8` patch (the patch itself is centered in the `cube-world-ground` tile field): a perimeter fence ring (raised by `+1` world unit) with four wide gate openings and snapped segment spacing so fence pieces connect cleanly, plus denser tree/grass/rock/mushroom scatter positioned outside the patch bounds and offset away from fence pieces to avoid clipping.
- A second tree belt now runs outside the existing mine-tree ring, and the mountain field is generated from a smoothed noise heightmap with intentional openings/dispersion; visible block layering is strict (grass top, dirt middle, stone bottom), and selected high peaks receive mountain-top trees (`mountain-top-tree-*`).
- `client/demo-scene/` is treated as the source asset drop and mirrored into `public/models/maps/demo-scene/` for runtime serving

## Run

```bash
cd PROJECT/client/fps-boilerplate
npm install
npm run dev
```

Then open the local Vite URL shown in terminal.

### Run With Dev Editor Enabled

```bash
cd PROJECT/client/fps-boilerplate
VITE_ENABLE_EDITOR=1 npm run dev
```

## Scripts

```bash
npm run build                      # production build + editor artifact verification
npm run verify:no-editor-in-dist   # fails if editor code leaks into dist
npm run preview
```
