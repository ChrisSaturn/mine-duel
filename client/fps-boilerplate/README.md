# MINE-DUEL FPS Boilerplate

Minimal standalone first-person prototype using npm `three` package with Vite.

This is the active client prototype in the workspace, not the final production client architecture.

## Runtime Overview

- World/camera/hitboxes are loaded from `public/maps/default-map.v1.json`.
- The default map uses procedural `cube-world-ground` as a block-array base environment with a stone/rock `16x16x8` mine patch whose top surface stays aligned with the surrounding terrain and tiles flush (no seam gaps).
- The default world `biomeLighting` is now `peak` for a lighter/friendlier daytime look (higher-key atmosphere + softer grade/bloom).
- Runtime map loading + application lives in `src/runtime/mapRuntime.js`.
- Map manifests may define `biomeLighting` (`peak`, `forest`, `desert`, `snow`, `island`) to drive `/game` mood colors across atmosphere, block shading, and post-process.
- Runtime asset URLs are resolved through `import.meta.env.BASE_URL` so hosted subpaths (for example `/game/`) still load maps/models correctly.
- Dev-only editor tooling lives in `src/dev/editorBootstrap.js` and is dynamically imported only in dev mode.
- Player runtime collision uses a capsule-style body resolver (horizontal body blocking + ground probe snap).
- Runtime object collision now prefers explicit template colliders (`userData.mapCollider=true`) and otherwise uses implicit per-mesh colliders for world elements (with box-bounds fallback only when no mesh is available).
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
- Runtime player model uses a slower, extra-aggressive procedural walk-cycle limb animation while moving on ground (arm/leg swing amplitudes doubled to `+/-40` with a forward-biased `-30` arm center, and `+/-60` legs).
- Runtime camera uses live runtime-head local anchoring (sampled each frame from head world position into rig-local space) and runtime head pitch follows the same look state for visual parity.
- Runtime camera anchor now uses live runtime-head local X/Z + vertical/crouch/head-bob offsets, with default forward offset `0`, so first-person body placement stays inside the capsule without cached-anchor artifacts.
- Runtime player model keeps native GLTF yaw orientation at load (no forced `Y=PI` flip), which avoids head-anchor inversion that can place the body in front of camera.
- Runtime map camera presets now enforce a downward pitch floor of `-85°` (`pitchMin >= -1.48353`) so players cannot look fully down into their own body mesh.
- Local runtime player model remains visible during gameplay while head occluder meshes are hidden for first-person clarity; editor mode still hides the runtime player model.
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

### Managed PER Runtime Environment Variables

- `VITE_ENABLE_MANAGED_PER` (`1` to enable managed PER runtime mode)
- `VITE_PER_RUNTIME_URL` (explicit managed runtime base URL)
- `VITE_WORLD_PROFILE_ID` (optional profile override used by stream setup)
- `VITE_MINE_DUEL_PROGRAM_ID` (optional on-chain program override used by stream setup)
- Legacy compatibility keys remain accepted during migration:
  - `VITE_ENABLE_WORLD_STREAM_GATEWAY`
  - `VITE_WORLD_STREAM_GATEWAY_URL`
- If neither current nor legacy variables are set, realtime runtime stays disabled.
- Runtime setup path uses real devnet setup transactions (`init_player_context`, `open_er_lease`) prepared by the managed runtime and submitted after wallet signing.

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
- Shows a centered Minecraft-style crosshair during active pointer-lock gameplay
- Shows a stamina sprint bar near the bottom-center that scales/fades based on sprint remaining
- Uses `Minecraft.ttf` loaded from `public/fonts/minecraft.ttf`

## Visual Pipeline

- Atmosphere:
  - Sky dome shader now blends PEAK-style gradients (cool top, warm horizon, deep nadir), layered cloud noise, and biome-specific day/sunset/night palettes.
  - Sky dome radius is tuned to the runtime clip/fog envelope to avoid visible dome-edge circles in gameplay view.
  - Sun direction now stays locked high in the sky during gameplay (with slow overhead azimuth drift), keeping lighting bright while preserving the current sky dome/skybox visuals.
  - Fog near/far and fog color now shift through day/sunset/night palettes for stronger depth separation.
- Illumination:
  - Renderer runs `ACESFilmicToneMapping` with physically-correct light behavior and dynamic exposure from atmosphere runtime.
  - Lighting stack uses a warm directional sun, cool sky hemisphere, biome-tinted ground bounce, and ambient fill; shadows stay colored (no neutral/black collapse).
  - Sun, hemisphere, ambient, and bounce colors/intensities blend in real time across day/sunset/night states for cinematic readability.
- Shadows:
  - Directional shadows stay on `PCFSoftShadowMap` but now use tighter PEAK-style tuning (softer penumbra, stronger normal-bias protection, and cleaner acne control).
  - Shadow frustum scales by viewport and now uses texel-snapped focus anchoring around the player to reduce crawl/shimmer while moving.
  - Shadow map resolution now scales by viewport class (`4096` desktop / `2048` compact viewport) for cleaner distant silhouettes.
- Blockworld shading:
  - Voxel runtime now uses `MeshLambertMaterial` and per-face color weighting so top faces read brightest, side faces shift cooler/darker, and bottom faces remain tinted (not black).
  - Voxel geometry applies subtle height-based gradients to keep large surfaces painterly/readable without noisy texture detail.
  - Cube World world objects (`cube-world-*`, including procedural `cube-world-ground` instances built from Cube World block materials) now preserve original authored textures.
  - Stylized biome recolor pass is scoped to `block-grass*` and `primitive-plane`; character templates (`character-male-a`, `blocky-character-*`) and `demo-scene` remain excluded.
- Post-processing:
  - `EffectComposer` render path uses `RenderPass`, `UnrealBloomPass`, a PEAK grade pass (contrast/saturation/warmth/shadow-lift/vignette/grain), and `FXAAShader`.
  - Grade/bloom tuning now derives from the active map `biomeLighting` preset.
  - Post-processing resizes with the viewport and supports both gameplay camera and editor camera.

## Controller Feature Notes

- First-person controller alignment notes: [`FIRST_PERSON_CONTROLLER_ALIGNMENT.md`](./FIRST_PERSON_CONTROLLER_ALIGNMENT.md)
- Modular first-person runtime controller now lives in `src/runtime/firstPersonControllerRuntime.js` and is consumed by `src/main.js` for look/zoom/sprint/crouch/head-bob/movement state flow.
- Unity 6 parity reference for full first-person behavior porting: [`DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md`](./DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md)
- First-person camera architecture (yaw/pitch axis split, head-bob joint, dynamic FOV priority): [`DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md#camera-system`](./DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md#camera-system)

## 3D Asset + Map Organization

- Asset flow: [`ASSET_FLOW.md`](./ASSET_FLOW.md)
- Editor + schema workflow: [`EDITOR_WORKFLOW.md`](./EDITOR_WORKFLOW.md)

## Imported Packs (2026-03-22)

- `Kenney Blocky Characters` imported under `public/models/characters/kenney-blocky/`
- `Kenney UI Pack - Pixel Adventure` imported under `public/ui/kenney-ui-pack-pixel-adventure/`
- `Cube World - Aug 2023` imported under `public/models/cube-world/` as a full source mirror (`Animals`, `Blocks`, `Characters`, `Enemies`, `Environment`, `Pixel Blocks`, `Tools` with `glTF`, `FBX`, `OBJ`, and `Blends` subfolders)
- `Minecraft.ttf` imported as `public/fonts/minecraft.ttf`
- Lobby screen intentionally avoids imported UI texture packs for layout composition, using local CSS primitives for the Figma-style shell.
- `src/runtime/mapRuntime.js` exposes `blocky-character-a` through `blocky-character-r` map templates
- `src/runtime/mapRuntime.js` also exposes:
  - `primitive-plane` (legacy simple generated base area)
  - `cube-world-block-grass` (single cube-world grass block template)
  - `cube-world-ground` (contiguous cube grid with a dedicated mesh-collider child and a stone/rock `16x16x8` mine patch using the stone source mesh geometry)
  - Cube World environment props:
    - `cube-world-tree-{1,2,3}`
    - `cube-world-rock-{1,2}`
    - `cube-world-mushroom`
    - `cube-world-fence-{center,corner,end}`
    - `cube-world-sugarcane` (mapped to Cube World bamboo for reed-like vegetation)
    - `cube-world-flowers-{1,2}`
    - `cube-world-grass-{small,big}`
  - `demo-scene` (imported environment glTF with a runtime-generated ground collider)
- `public/maps/default-map.v1.json` now seeds a populated blockworld biome using Cube World props (trees, rocks, mushrooms, fences, sugarcane/bamboo, flowers, and grass) on top of `cube-world-ground`.
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
