# MINE-DUEL FPS Boilerplate

Minimal standalone first-person prototype using npm `three` package with Vite.

This is the active client prototype in the workspace, not the final production client architecture.

## Runtime Overview

- World/camera/hitboxes are loaded from `public/maps/default-map.v1.json`.
- The default map now uses `demo-scene` (`/models/maps/demo-scene/Demo.gltf`) as the base environment.
- Runtime map loading + application lives in `src/runtime/mapRuntime.js`.
- Dev-only editor tooling lives in `src/dev/editorBootstrap.js` and is dynamically imported only in dev mode.
- Player runtime collision uses a capsule-style body resolver (horizontal body blocking + ground probe snap).
- Runtime object collision now prefers explicit template colliders (`userData.mapCollider=true`) and falls back to object bounds only when no explicit colliders exist.
- Runtime + editor player preview default to `Kenney Blocky Characters` (`/models/characters/kenney-blocky/character-a.glb`).
- Runtime player model uses a slower, larger-range procedural walk-cycle limb animation (arm/leg swing) while moving on ground.
- Runtime camera is linked to the runtime head node, and both camera pitch + head pitch are driven by the same look state.
- Runtime camera is pushed forward/up from the head anchor to keep the view facing forward without clipping inside the head mesh.
- Local runtime player model remains visible during gameplay (including head), while editor mode hides the runtime player model.
- Atmosphere runtime (`src/runtime/atmosphereRuntime.js`) now drives a PEAK-inspired sky model (cinematic warm horizon, cool zenith, layered clouds, dynamic sun disc/halo, and per-frame sun/fog/exposure modulation).
- Rendering now uses post-processing (`src/runtime/postProcessRuntime.js`) with highlight bloom + cinematic color grading + FXAA through `EffectComposer`.
- Runtime map objects and voxel chunks both cast + receive shadows under the directional sun light.
- The procedural base ground (`primitive-plane`) is configured as receive-only for shadows to avoid large-floor self-shadow blackouts.
- Wallet connector runtime (`IC-001`) lives in `src/wallet/walletGateway.js` and is lazy-loaded from HUD wiring in `src/main.js` to keep gameplay bundle weight lower.

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
- Run: `Shift`
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
- Shows a centered Minecraft-style crosshair during active pointer-lock gameplay
- Uses `Minecraft.ttf` loaded from `public/fonts/minecraft.ttf`

## Visual Pipeline

- Atmosphere:
  - Sky dome shader now blends PEAK-style gradients (cool top, warm horizon, deep nadir), layered cloud noise, and a directional sun disk/halo.
  - Sun direction animates continuously and drives all lighting placement, sky color uniforms, fog tint, and tone-mapping exposure.
  - Fog near/far and fog color now shift through day/sunset/night palettes for stronger depth separation.
- Illumination:
  - Renderer now runs `ACESFilmicToneMapping` with physically-correct light behavior and dynamic exposure from atmosphere runtime.
  - Lighting stack now includes a high-key sun directional light, hemisphere sky fill, ambient fill, and a cool bounce directional fill for PEAK-like stylized contrast.
  - Sun, ambient, and fill colors/intensities blend in real time across day/sunset/night states for cinematic readability.
- Shadows:
  - Directional shadows stay on `PCFSoftShadowMap` but now use tighter PEAK-style tuning (softer penumbra, stronger normal-bias protection, and cleaner acne control).
  - Shadow frustum scales by viewport and now uses texel-snapped focus anchoring around the player to reduce crawl/shimmer while moving.
  - Shadow map resolution now scales by viewport class (`4096` desktop / `2048` compact viewport) for cleaner distant silhouettes.
- Post-processing:
  - `EffectComposer` render path now uses `RenderPass`, `UnrealBloomPass`, a PEAK grade pass (contrast/saturation/warmth/shadow-lift/vignette/grain), and `FXAAShader`.
  - Post-processing resizes with the viewport and supports both gameplay camera and editor camera.

## Controller Feature Notes

- First-person controller alignment notes: [`FIRST_PERSON_CONTROLLER_ALIGNMENT.md`](./FIRST_PERSON_CONTROLLER_ALIGNMENT.md)

## 3D Asset + Map Organization

- Asset flow: [`ASSET_FLOW.md`](./ASSET_FLOW.md)
- Editor + schema workflow: [`EDITOR_WORKFLOW.md`](./EDITOR_WORKFLOW.md)

## Imported Packs (2026-03-22)

- `Kenney Blocky Characters` imported under `public/models/characters/kenney-blocky/`
- `Kenney UI Pack - Pixel Adventure` imported under `public/ui/kenney-ui-pack-pixel-adventure/`
- `Cube World - Aug 2023` imported under `public/models/cube-world/` as a full source mirror (`Animals`, `Blocks`, `Characters`, `Enemies`, `Environment`, `Pixel Blocks`, `Tools` with `glTF`, `FBX`, `OBJ`, and `Blends` subfolders)
- `Minecraft.ttf` imported as `public/fonts/minecraft.ttf`
- Lobby view now uses `public/logo.png` as the title/logo art, with responsive sizing caps in `src/views/lobby.css` for desktop/mobile parity
- `src/runtime/mapRuntime.js` exposes `blocky-character-a` through `blocky-character-r` map templates
- `src/runtime/mapRuntime.js` also exposes:
  - `primitive-plane` (legacy simple generated base area)
  - `cube-world-block-grass` (single cube-world grass block template)
  - `cube-world-ground` (contiguous cube grid with a dedicated mesh-collider child)
  - `demo-scene` (imported environment glTF with a runtime-generated ground collider)
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
