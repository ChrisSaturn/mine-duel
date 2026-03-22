# Dev Editor Workflow (fps-boilerplate)

This document defines the map authoring workflow for the dev-only world/camera/hitbox editor.

## Availability

Editor tooling is available only in dev sessions and is not shipped to production bundles.

Enable it with:

```bash
cd PROJECT/client/fps-boilerplate
VITE_ENABLE_EDITOR=1 npm run dev
```

The editor module (`src/dev/editorBootstrap.js`) is dynamically imported only when:

- `import.meta.env.DEV === true`
- `import.meta.env.VITE_ENABLE_EDITOR === "1"`

## Authoring Modes

- `1` World: select map objects with raycast and transform them.
- `2` Camera: edit player-relative camera offset, pitch clamps, FOV, and player scale.
- `3` Hitbox: add/select/edit box and capsule hitboxes.

## Core Controls

- Toggle editor: `` ` ``
- Edit mode runs in a standalone scene view camera (separate from player camera).
- Scene navigation: `RMB` orbit, hold `LMB` on empty space to pan, mouse wheel zoom.
- Camera auto-frames world objects and avoids oversized ground-hitbox framing.
- Player rig marker is visible in edit mode for camera-relative placement context.
- Camera marker (position + forward vector) is visible in edit mode.
- Character preview model is rendered at player rig location and auto-centered/grounded without forcing mesh scale.
- Player capsule marker dimensions are synced from runtime collider config, which is derived from model bounds.
- `Player Scale` updates runtime model size and re-derives collider dimensions live.
- Runtime player body is visible in gameplay (head/face occluders hidden for first-person), and runtime model is hidden in editor so only the editor marker/preview is shown during authoring.
- Select a world mesh to attach a 3D transform controller (gizmo).
- Use panel buttons `Move` / `Rotate` / `Scale` or `W` / `E` / `R`.
- Handles render on top and auto-scale with camera distance for readability.
- Use `Show Colliders` in hitbox section to keep collider wireframes visible in all modes.
- `Ctrl/Cmd + Z` restores the previous map edit snapshot.
- Transform mode: `W` (translate), `E` (rotate), `R` (scale)
- Duplicate selected: `Ctrl/Cmd + D`
- Delete selected: `Delete`
- Nudge selected: arrows (`PageUp/PageDown` adjusts Y)
- Grid/angle snap toggles are available in the panel.

Mode behavior:

- Entering editor exits pointer lock and pauses player locomotion input.
- Exiting editor returns to gameplay flow (`Click To Play` to re-lock pointer).

## Map IO

- Export: creates a JSON download of current scene transforms + camera + hitboxes.
- Import: loads a local JSON file in dev and reapplies the world in-session.

## Map Manifest Schema (v1)

```json
{
  "version": 1,
  "objects": [
    {
      "id": "base-plane-001",
      "template": "primitive-plane",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [260, 1, 260]
    }
  ],
  "cameraPreset": {
    "localOffset": [0, 1.62, 0],
    "pitchMin": -1.5708,
    "pitchMax": 1.5708,
    "fov": 70
  },
  "playerPreset": {
    "scale": 1
  },
  "hitboxes": [
    {
      "id": "ground-001",
      "type": "box",
      "position": [0, -0.5, 0],
      "rotation": [0, 0, 0],
      "size": [260, 1, 260],
      "layer": "ground"
    },
    {
      "id": "capsule-001",
      "type": "capsule",
      "position": [2, 1, 2],
      "rotation": [0, 0, 0],
      "radius": 0.5,
      "height": 1.2,
      "attachToObjectId": "tile-001",
      "layer": "solid"
    }
  ]
}
```

## Runtime Contracts

- `loadMapManifest(path) -> MapData`
- `applyMapData(scene, playerRig, colliders, options) -> runtimeState`
- `mountEditor({ scene, camera, playerRig, colliders, mapData, ... })`
- `serializeMapData() -> MapData`

## Production Hardening

- Production build excludes editor module imports by compile-time dev gating.
- `npm run build` executes `scripts/verify-no-editor-in-dist.mjs`.
- Build fails if editor artifacts are detected in `dist`.
