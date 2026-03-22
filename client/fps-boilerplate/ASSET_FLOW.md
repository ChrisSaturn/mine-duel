# 3D + UI Asset + Map Flow

This file defines the canonical flow for where runtime assets live (3D models, UI sprites, and fonts) and how they move from source packs into the FPS runtime and map manifest.

## Canonical Directories

```text
PROJECT/client/fps-boilerplate/
  public/
    models/
      characters/     # playable + NPC character GLBs
      platformer/     # terrain / block GLBs
      props/          # pickups, tools, environment props
    maps/
      default-map.v1.json
    textures/         # standalone textures not embedded in GLB
    ui/               # 2D HUD/UI sprite sheets and tiles
    fonts/            # runtime web fonts (TTF/WOFF/WOFF2)
  src/
    main.js                   # game loop + input + editor bootstrapping
    runtime/mapRuntime.js     # map manifest loader + scene application
    dev/editorBootstrap.js    # dev-only world/camera/hitbox editor
```

## Source -> Runtime Flow

1. Source assets start in top-level `assets/*` packs.
2. Choose an asset variant and convert/export to `.glb` if needed.
3. Optimize the model (mesh simplification, texture size, compression) before commit.
4. Copy the final `.glb` into one of:
   - `public/models/characters/`
   - `public/models/platformer/`
   - `public/models/props/`
5. If the GLB references external textures (for example `Textures/colormap.png`), copy that texture folder relative to the model path:
   - `public/models/platformer/Textures/colormap.png`
   - `public/models/characters/Textures/colormap.png`
6. Copy 2D UI packs under `public/ui/<pack-name>/` while preserving vendor folder structure.
7. Copy runtime fonts under `public/fonts/` with lowercase filenames (`minecraft.ttf`).
8. Reference 3D models from map template names in `src/runtime/mapRuntime.js`.
9. Reference UI sprites/fonts from CSS/JS/HTML via `/ui/*` and `/fonts/*` URLs.
10. Place/rotate/scale runtime instances through map manifest entries in `public/maps/*.json`.
11. Reuse loaded templates via cloning instead of re-loading the same file repeatedly.

## Naming Contract

- Use lowercase kebab-case: `character-male-a.glb`, `block-grass-low.glb`.
- Keep names semantic and pack-agnostic.
- Avoid spaces in final runtime filenames.
- For third-party raw packs copied wholesale (for example Kenney UI), keep vendor names/folders intact and map to clean runtime aliases in code when needed.

## Map Manifest Contract (v1)

Each map JSON stores:

- `objects[]`: `id`, `template`, `position`, `rotation`, `scale`
- `cameraPreset`: `localOffset`, `pitchMin`, `pitchMax`, `fov`
- `hitboxes[]`: `id`, `type`, `position`, `rotation`, plus:
  - `size` for `box`
  - `radius` + `height` for `capsule`
  - optional `attachToObjectId`
  - optional `layer`

## Runtime Contract (for humans and AI tools)

- Runtime loads assets and maps only from `public/` URLs.
- `src/runtime/mapRuntime.js` owns template mapping, manifest normalization, and world/hitbox application.
- Template `primitive-plane` is generated in runtime code (no external GLB), and includes a collider volume.
- Editor-enabled map authoring outputs JSON compatible with the same runtime loader.
- Production build must exclude dev editor code paths.

## Performance Rules

- Prefer GLB over OBJ/FBX for runtime web loading.
- Keep world tiles `receiveShadow: true`, `castShadow: false` by default.
- Cap renderer pixel ratio (`Math.min(devicePixelRatio, 2)`).
- Use one-time load + clone for repeated template instances.
- Avoid very large texture maps unless visually required.

## Current Active Assets

- `public/models/characters/character-male-a.glb`
- `public/models/characters/kenney-blocky/character-[a-r].glb`
- `public/models/characters/kenney-blocky/Textures/texture-[a-r].png`
- `public/models/platformer/block-grass.glb`
- `public/models/platformer/block-grass-low.glb`
- `public/models/platformer/block-grass-large.glb`
- `public/models/platformer/block-grass-corner.glb`
- `public/models/platformer/Textures/colormap.png`
- `public/models/characters/Textures/colormap.png`
- `public/ui/kenney-ui-pack-pixel-adventure/**`
- `public/fonts/minecraft.ttf`
