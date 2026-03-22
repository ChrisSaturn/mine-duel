# DIGGERS Unity 6 First-Person Controller Reference

## Purpose

This document is the complete technical reference for the DIGGERS first-person controller system as implemented in Unity 6 (URP). It covers every subsystem: hierarchy, physics, camera, movement, animation, interaction, and shaders, with exact values, formulas, and code snippets to enable a faithful port to Three.js.

---

## Scene Hierarchy

The entire player entity lives under a single root `GameObject` tagged `Player`:

```text
FirstPersonController          # Tag: Player, Layer: Default
├── Joint                      # Head-bob pivot (empty transform)
│   ├── PlayerCamera           # Tag: MainCamera, has Camera + AudioListener
│   │   └── CrosshairAndStamina
│   │       ├── Reticle        # UI Image (crosshair sprite)
│   │       └── SprintBar
│   │           ├── StaminaBG  # UI Image (bar background)
│   │           └── Stamina    # UI Image (bar fill)
│   └── DIGGERS_HUD            # Full HUD canvas (wallet, counters, pickaxe slot)
└── character-h                # Kenney Blocky Character model root
    └── root
        ├── leg-left           # Procedurally animated bone
        ├── leg-right          # Procedurally animated bone
        └── torso              # Static mesh (body)
            ├── arm-left       # Procedurally animated bone
            ├── arm-right      # Procedurally animated bone (also pickaxe pivot)
            │   └── tool-pickaxe  # Pickaxe mesh + PickaxeController script
            └── head           # Static mesh (scaled 0.1)
```

### Key Transform Offsets (Local Space, Unity Left-Handed Y-Up)

`TODO`: add raw inspector offsets if you want this section to contain full transform values.

---

## Physics Body (Rigidbody + CapsuleCollider)

The player is a physics-driven character (not a CharacterController). All horizontal movement is applied via `Rigidbody.AddForce` with `ForceMode.VelocityChange`.

### Rigidbody Configuration

`TODO`: add exact Rigidbody inspector values.

### CapsuleCollider Configuration

`TODO`: add exact CapsuleCollider inspector values.

### Three.js Port Note - Physics Equivalent

In Three.js with Cannon.js or Rapier:

- Create a capsule body with radius `0.5`, half-height `1.0` (total `2.0`)
- Lock all rotation axes (equivalent to `FreezeRotation`)
- Apply gravity `(0, -9.81, 0)`
- Use velocity-change impulses for movement (set velocity directly, not force)

---

## Ground Detection

Ground check uses a downward raycast from the bottom of the capsule:

```csharp
// Origin: center of player minus half the Y scale
Vector3 origin = new Vector3(
    transform.position.x,
    transform.position.y - (transform.localScale.y * 0.5f),
    transform.position.z
);
Vector3 direction = transform.TransformDirection(Vector3.down);
float distance = 0.75f;

isGrounded = Physics.Raycast(origin, direction, out RaycastHit hit, distance);
```

### Algorithm Summary

1. Ray origin: player center position, offset down by `localScale.y * 0.5` (normally `0.5` units)
2. Direction: straight down in player's local space (world down since player doesn't rotate on X/Z)
3. Distance: `0.75` units
4. If any collider is hit within `0.75` units below the capsule bottom: `isGrounded = true`

### Three.js Equivalent

```javascript
const origin = new THREE.Vector3(
    playerPosition.x,
    playerPosition.y - (playerScale.y * 0.5),
    playerPosition.z
);
const direction = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster(origin, direction, 0, 0.75);
const intersects = raycaster.intersectObjects(worldColliders);
isGrounded = intersects.length > 0;
```

---

## Camera System

### How the Player Camera Works

The camera is never directly rotated on both axes by a single node. Rotation is split across a strict three-node chain:

```text
FirstPersonController      # yaw only (Y axis), X/Z always zeroed
└── Joint                  # head-bob pivot, translation only, rotation kept identity
    └── PlayerCamera       # pitch only (X axis), Y/Z always zeroed
```

This axis split is the core contract of the system:

- Root owns horizontal look (`yaw`).
- Camera owns vertical look (`pitch`).
- `Joint` only translates for bobbing and never contributes rotation.

### Yaw (Horizontal Look)

Yaw is updated every frame from raw New Input System pointer delta and written directly to root local Euler Y:

```csharp
private const float POINTER_DELTA_SCALE = 0.1f; // normalize raw pixel delta

Vector2 lookInput = lookAction.action.ReadValue<Vector2>(); // pixels/frame
yaw = transform.localEulerAngles.y + lookInput.x * POINTER_DELTA_SCALE * mouseSensitivity;

// Root receives yaw only.
transform.localEulerAngles = new Vector3(0f, yaw, 0f);
```

`POINTER_DELTA_SCALE = 0.1` exists to normalize raw pixel delta so sensitivity behavior matches the legacy input path.

With `mouseSensitivity = 2.0`:

```text
degrees_per_pixel = 0.1 * 2.0 = 0.2 degrees
```

Because root X/Z are forced to zero every frame, accidental tilt/roll from physics cannot persist.

### Pitch (Vertical Look)

Pitch is a persistent accumulator float. It is not derived each frame from camera Euler reads.

```csharp
if (!invertCamera)
    pitch -= mouseSensitivity * POINTER_DELTA_SCALE * lookInput.y;
else
    pitch += mouseSensitivity * POINTER_DELTA_SCALE * lookInput.y;

pitch = Mathf.Clamp(pitch, -maxLookAngle, maxLookAngle); // [-50, +50]

// Camera receives pitch only.
playerCamera.transform.localEulerAngles = new Vector3(pitch, 0f, 0f);
```

Clamp behavior is hard-stop, not spring/ease:

- `maxLookAngle = 50`
- no soft boundary blending
- no overshoot recovery

### Joint Node (Head-Bob Pivot)

`Joint` is anchored at `localPosition = (0, 0.75, 0)` and used as a pure positional pivot for bobbing. Its local rotation stays identity.

Head bob drives only `joint.localPosition`:

```csharp
joint.localPosition = new Vector3(
    jointOriginalPos.x + Mathf.Sin(timer) * bobAmount.x,
    jointOriginalPos.y + Mathf.Sin(timer) * bobAmount.y,
    jointOriginalPos.z + Mathf.Sin(timer) * bobAmount.z
);
```

With `bobAmount = (0, 0.1, 0)`, effective motion is vertical only (`Y = 0.75 +/- 0.1`).

Timer rates by state:

| State | Timer rate | Oscillation period |
| --- | --- | --- |
| Walking | `bobSpeed = 10` | `~0.63s` |
| Sprinting | `bobSpeed + sprintSpeed = 17` | `~0.37s` |
| Crouching | `bobSpeed * speedReduction = 5` | `~1.26s` |

When movement stops:

- `timer` is reset to `0` immediately.
- `joint.localPosition` is lerped back toward `jointOriginalPos` with `deltaTime * bobSpeed` (exponential settle).

### Dynamic FOV State Priority

FOV is actively authored every frame using strict priority:

1. Sprinting: lerp toward `sprintFOV = 80` with step `10`
2. Zooming: lerp toward `zoomFOV = 30` with step `5`
3. Default: lerp toward `fov = 60` with step `5`

Sprint and zoom are mutually exclusive:

```csharp
if (isSprinting)
{
    isZoomed = false;
    playerCamera.fieldOfView = Mathf.Lerp(playerCamera.fieldOfView, sprintFOV, sprintFOVStepTime * Time.deltaTime);
}
```

Transition formula:

```text
newFOV = currentFOV + (targetFOV - currentFOV) * min(1, stepTime * deltaTime)
```

At 60 FPS with `stepTime = 10`, each frame moves about `16.7%` of remaining distance.

### Camera Component Properties (Scene)

| Property | Value |
| --- | --- |
| `fieldOfView` | `60` base, dynamically overwritten |
| `nearClipPlane` | `0.3` |
| `farClipPlane` | `1000` |
| `clearFlags` | `Skybox` |
| `cullingMask` | `Everything` |
| `allowHDR` | `true` |
| `allowMSAA` | `true` |
| `renderPostProcessing` | `false` |
| `depth` | `-1` |
| `localPosition` | `(0, 0, 0.18)` relative to `Joint` |
| `Tag` | `MainCamera` |

The forward camera offset (`Z = 0.18`) puts the view slightly in front of the bob pivot, which adds subtle perceived rotational feel during bob.

### Constraint Summary

| Constraint | Mechanism |
| --- | --- |
| No camera roll (`Z`) | camera local Euler written with `Z = 0` |
| Pitch clamped to `+/-50 deg` | `Mathf.Clamp(pitch, -maxLookAngle, maxLookAngle)` |
| No yaw on camera | camera only receives X rotation |
| No pitch on root | root only receives Y rotation |
| No rigidbody-driven tilt | `FreezeRotation` + root X/Z overwrite each frame |
| Zoom canceled by sprint | `isZoomed = false` in sprint branch |
| Zoom not applied while sprinting | zoom/default branch runs only when not sprinting |
| WebGL pointer lock gated by input gesture | initial pointer lock waits for first click |

### Three.js Port Notes

Unity is left-handed Y-up and Three.js is right-handed Y-up:

- Unity `+Z` forward maps to Three.js `-Z` forward.
- Yaw sign may need inversion.
- Keep the same split-axis contract (`root.y` for yaw, `camera.x` for pitch).

```javascript
const POINTER_DELTA_SCALE = 0.1;
const mouseSensitivity = 2.0;
const maxPitchRad = THREE.MathUtils.degToRad(50);

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;

  yaw += e.movementX * POINTER_DELTA_SCALE * mouseSensitivity * (Math.PI / 180);
  playerRoot.rotation.y = yaw;

  pitch -= e.movementY * POINTER_DELTA_SCALE * mouseSensitivity * (Math.PI / 180);
  pitch = THREE.MathUtils.clamp(pitch, -maxPitchRad, maxPitchRad);
  camera.rotation.set(pitch, 0, 0);
});
```

---

## Movement System

Movement runs in `FixedUpdate` (physics tick, default 50 Hz / 0.02s). Input is cached in `Update` and consumed in `FixedUpdate`.

### Movement Parameters

- `walkSpeed = 5.0`
- `sprintSpeed = 7.0`
- `maxVelocityChange` should match Unity inspector/script value

### Movement Algorithm

```csharp
// 1. Read cached WASD input (Vector2: x = strafe, y = forward/back)
Vector3 targetVelocity = new Vector3(cachedMoveInput.x, 0, cachedMoveInput.y);

// 2. Transform from local to world space, apply speed
float speed = isSprinting ? sprintSpeed : walkSpeed;
targetVelocity = transform.TransformDirection(targetVelocity) * speed;

// 3. Calculate velocity change needed
Vector3 velocity = rb.linearVelocity;
Vector3 velocityChange = targetVelocity - velocity;

// 4. Clamp horizontal axes, zero out vertical (gravity handles Y)
velocityChange.x = Mathf.Clamp(velocityChange.x, -maxVelocityChange, maxVelocityChange);
velocityChange.z = Mathf.Clamp(velocityChange.z, -maxVelocityChange, maxVelocityChange);
velocityChange.y = 0;

// 5. Apply as instantaneous velocity change
rb.AddForce(velocityChange, ForceMode.VelocityChange);
```

### Key Design Decisions

1. VelocityChange mode: The force is applied as an instantaneous velocity change (ignores mass). This means input-to-movement is 1:1 regardless of Rigidbody mass.
2. No acceleration curve: The clamped velocity change means the player reaches target speed within a single physics frame (effectively instant).
3. Y-axis zeroed: Vertical velocity is never modified by movement code. Gravity and jump handle the Y-axis independently.

### Three.js Equivalent (with Cannon.js)

```javascript
function fixedUpdate(body, inputVector, playerQuaternion, speed, maxVelocityChange) {
    // Transform input to world space using player's yaw rotation
    const worldDir = inputVector.clone().applyQuaternion(playerQuaternion).multiplyScalar(speed);

    // Calculate velocity change
    const currentVel = body.velocity;
    let dvx = THREE.MathUtils.clamp(worldDir.x - currentVel.x, -maxVelocityChange, maxVelocityChange);
    let dvz = THREE.MathUtils.clamp(worldDir.z - currentVel.z, -maxVelocityChange, maxVelocityChange);

    // Apply as velocity change (not force)
    body.velocity.x += dvx;
    body.velocity.z += dvz;
    // Y untouched -- gravity handles it
}
```

---

## Jump System

### Jump Algorithm

```csharp
if (isGrounded)
{
    rb.AddForce(0f, jumpPower, 0f, ForceMode.Impulse);
    isGrounded = false;
}
```

- `ForceMode.Impulse`: applies force factoring in mass (`force / mass`). Since mass = 1, the impulse equals the velocity directly.
- Jump velocity: `5.0 m/s` upward
- With default gravity `9.81 m/s^2`, max jump height: `v^2 / (2 * g)` = `25 / 19.62` = `~1.27 units`
- Time to apex: `v / g` = `5 / 9.81` = `~0.51 seconds`

### Jump uncrouches (toggle mode only)

```csharp
if (isCrouched && !holdToCrouch)
{
    Crouch(); // toggles back to standing
}
```

---

## Sprint System

### Sprint Parameters

- `sprintDuration`: drains/recharges at `1.0` per second
- `sprintCooldownReset = 0.5`
- `sprintFOV = 80`
- `sprintFOVStepTime = 10`

### Sprint State Machine

```text
                   ┌─────────────────────────────────────┐
                   │                                     │
                   v                                     │
    [Idle] ──(hold sprint + moving)──> [Sprinting] ──────┘
      ^                                    │           (release / stop)
      │                                    │
      │                         (sprintRemaining <= 0)
      │                                    │
      │                                    v
      └──────(cooldown expires)──── [Sprint Cooldown]
```

### Stamina Drain/Recovery

```csharp
// During sprint (per frame in Update):
sprintRemaining -= 1 * Time.deltaTime;   // Drains 1 second per second

// While not sprinting:
sprintRemaining = Clamp(sprintRemaining + 1 * Time.deltaTime, 0, sprintDuration);
// Recovers 1 second per second, capped at sprintDuration

// Cooldown timer (when stamina fully depleted):
sprintCooldown -= 1 * Time.deltaTime;    // Counts down from 0.5s
```

### Sprint FOV Effect

```csharp
// While sprinting:
camera.fieldOfView = Lerp(camera.fieldOfView, sprintFOV, sprintFOVStepTime * deltaTime);
// sprintFOV = 80, step = 10, so transition is fast (~0.1s to reach 90% of target)
```

### Sprint Bar UI

The stamina bar scales its X-axis based on remaining sprint percentage:

```csharp
float sprintRemainingPercent = sprintRemaining / sprintDuration;
sprintBar.transform.localScale = new Vector3(sprintRemainingPercent, 1f, 1f);
```

Bar dimensions are percentage-based:

- Width: `30%` of screen width
- Height: `2%` of screen height
- Auto-hides when stamina is full (alpha fades to 0)
- Fades in at sprint speed `alpha += 5 * deltaTime`
- Fades out at `alpha -= 3 * deltaTime`

---

## Crouch System

### Crouch Parameters

- `speedReduction = 0.5`
- `walkSpeed` transitions `5.0 <-> 2.5`
- `crouchHeight`: set via Y-scale override (use script/inspector value)

### Crouch Algorithm

Crouching is achieved by scaling the entire player Y-axis, which also scales the CapsuleCollider:

```csharp
// Crouch down
transform.localScale = new Vector3(originalScale.x, crouchHeight, originalScale.z);
walkSpeed *= speedReduction;  // 5.0 * 0.5 = 2.5

// Stand up
transform.localScale = new Vector3(originalScale.x, originalScale.y, originalScale.z);
walkSpeed /= speedReduction;  // 2.5 / 0.5 = 5.0
```

### Effective Dimensions When Crouched

`TODO`: add resulting effective collider height/radius if you want explicit physical dimensions.

### Three.js Port Note

In Three.js, instead of scaling the entire body, adjust:

1. The capsule collider half-height
2. The camera/joint Y-position
3. The movement speed

```javascript
function setCrouch(isCrouched) {
    const capsuleHalfHeight = isCrouched ? 0.75 : 1.0;
    const walkSpeed = isCrouched ? 2.5 : 5.0;
    // Update physics body shape and camera position accordingly
}
```

---

## Head Bob System

The head bob applies a sinusoidal oscillation to the `Joint` transform (parent of the camera).

### Head Bob Parameters

- `bobSpeed = 10.0`
- `sprintSpeed = 7.0` (for bob timer boost while sprinting)
- `speedReduction = 0.5` (for crouch bob slowdown)
- `bobAmount = (0, 0.1, 0)`
- `jointOriginalPos.y = 0.75`

### Head Bob Algorithm

```csharp
if (isWalking)
{
    // Timer speed varies by movement state:
    if (isSprinting)
        timer += deltaTime * (bobSpeed + sprintSpeed);  // 10 + 7 = 17
    else if (isCrouched)
        timer += deltaTime * (bobSpeed * speedReduction); // 10 * 0.5 = 5
    else
        timer += deltaTime * bobSpeed;                    // 10

    // Apply sine wave to joint position
    joint.localPosition = new Vector3(
        jointOriginalPos.x + sin(timer) * bobAmount.x,  // 0 (bobAmount.x = 0)
        jointOriginalPos.y + sin(timer) * bobAmount.y,  // 0.75 + sin(t) * 0.1
        jointOriginalPos.z + sin(timer) * bobAmount.z   // 0 (bobAmount.z = 0)
    );
}
else
{
    // Smoothly return to original position
    timer = 0;
    joint.localPosition = lerp(joint.localPosition, jointOriginalPos, deltaTime * bobSpeed);
}
```

### Effective Bob Frequencies

- Walking timer speed: `10`
- Sprinting timer speed: `17`
- Crouched timer speed: `5`

### Three.js Equivalent

```javascript
function updateHeadBob(joint, isWalking, isSprinting, isCrouched, deltaTime) {
    const bobSpeed = 10.0;
    const sprintSpeed = 7.0;
    const speedReduction = 0.5;
    const bobAmountY = 0.1;
    const jointOriginalY = 0.75;

    if (isWalking) {
        let speed = bobSpeed;
        if (isSprinting) speed = bobSpeed + sprintSpeed;
        else if (isCrouched) speed = bobSpeed * speedReduction;

        bobTimer += deltaTime * speed;
        joint.position.y = jointOriginalY + Math.sin(bobTimer) * bobAmountY;
    } else {
        bobTimer = 0;
        joint.position.y = THREE.MathUtils.lerp(joint.position.y, jointOriginalY, deltaTime * bobSpeed);
    }
}
```

---

## WebGL Pointer Lock Handling

The controller has special handling for browser environments:

```csharp
#if UNITY_WEBGL && !UNITY_EDITOR
    // Browser requires an explicit user gesture before pointer lock.
    // On first click, lock the cursor and begin accepting mouse look.
    if (awaitingInitialPointerLock && Pointer.current.press.wasPressedThisFrame)
    {
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
        awaitingInitialPointerLock = false;
    }
#endif
```

### Three.js Equivalent

```javascript
canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
    }
});
```

---

## Procedural Character Animation (BlockyCharacterAnimator)

The character model uses no animation clips. All movement is procedural, driven by the Rigidbody velocity.

### Bone References

- `leg-left`
- `leg-right`
- `arm-left`
- `arm-right`

### Animation Parameters

- `walkBobSpeed = 10.0`
- Leg swing amplitude: `30` degrees
- Arm swing amplitude: `20` degrees
- Arm forward offset: `45` degrees
- Idle return slerp speed: `5`

### Walk Animation Algorithm

Movement detection:

```csharp
bool isMoving = new Vector3(rb.linearVelocity.x, 0, rb.linearVelocity.z).magnitude > 0.1f;
```

Walk cycle (when moving):

```csharp
timer += deltaTime * walkBobSpeed;  // 10.0
float swing = sin(timer);

// Legs swing opposite to each other
leftLeg.localRotation  = leftLegStart  * Quaternion.Euler(swing * 30, 0, 0);   // +30 to -30 degrees
rightLeg.localRotation = rightLegStart * Quaternion.Euler(-swing * 30, 0, 0);  // Opposite phase

// Arms swing opposite to legs (natural walk cycle)
// armForwardOffset keeps arms slightly forward at all times
leftArm.localRotation  = leftArmStart  * Quaternion.Euler(-swing * 20 + 45, 0, 0);
rightArm.localRotation = rightArmStart * Quaternion.Euler(swing * 20 + 45, 0, 0);
```

Idle return (when not moving):

```csharp
timer = 0;
// Slerp back to rest pose at rate of 5 * deltaTime
leftLeg.localRotation  = Slerp(current, leftLegStart, deltaTime * 5);
rightLeg.localRotation = Slerp(current, rightLegStart, deltaTime * 5);
// Arms return to forward offset pose
leftArm.localRotation  = Slerp(current, leftArmStart * Euler(45, 0, 0), deltaTime * 5);
rightArm.localRotation = Slerp(current, rightArmStart * Euler(45, 0, 0), deltaTime * 5);
```

### Three.js Equivalent

```javascript
function updateWalkAnimation(bones, velocity, deltaTime) {
    const horizontalSpeed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
    const isMoving = horizontalSpeed > 0.1;

    if (isMoving) {
        animTimer += deltaTime * 10.0;
        const swing = Math.sin(animTimer);

        bones.leftLeg.rotation.x  = swing * THREE.MathUtils.degToRad(30);
        bones.rightLeg.rotation.x = -swing * THREE.MathUtils.degToRad(30);
        bones.leftArm.rotation.x  = (-swing * 20 + 45) * (Math.PI / 180);
        bones.rightArm.rotation.x = (swing * 20 + 45) * (Math.PI / 180);
    } else {
        animTimer = 0;
        const returnSpeed = 5 * deltaTime;
        bones.leftLeg.rotation.x  = THREE.MathUtils.lerp(bones.leftLeg.rotation.x, 0, returnSpeed);
        bones.rightLeg.rotation.x = THREE.MathUtils.lerp(bones.rightLeg.rotation.x, 0, returnSpeed);
        bones.leftArm.rotation.x  = THREE.MathUtils.lerp(bones.leftArm.rotation.x, Math.PI / 4, returnSpeed);
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, Math.PI / 4, returnSpeed);
    }
}
```

---

## Pickaxe Controller and Mine Animation

The pickaxe lives on the `tool-pickaxe` node and is hidden at startup. It becomes visible after `Equip()` is called.

### Pickaxe Animation Parameters

- Phase 1 load-back duration: `0.25s`
- Phase 2 swing-forward duration: `0.15s`
- Phase 3 recoil-bounce duration: `0.08s`
- Phase 4 return duration: `0.2s`

### Total Animation Duration

`0.25 + 0.15 + 0.08 + 0.2 = 0.68 seconds`

### Mine Animation Phases

The animation is a 4-phase coroutine that manipulates `arm-right.localRotation`:

```text
Phase 1: Load Back (0.25s)
  armIdleRotation -> armIdleRotation * Euler(-80, 0, 24)
  Easing: ease-out cubic: t = 1 - (1-t)^3

Phase 2: Swing Forward (0.15s)
  loadedRotation -> armIdleRotation * Euler(40, 0, -16)
  Easing: ease-in quadratic: t = t^2

Phase 3: Recoil Bounce (0.08s)
  hitRotation -> armIdleRotation * Euler(14, 0, 0)
  Easing: SmoothStep (Hermite interpolation)

Phase 4: Return to Idle (0.2s)
  recoilRotation -> armIdleRotation
  Easing: SmoothStep (Hermite interpolation)
```

### Easing Functions Reference

```csharp
// Ease-out cubic (Phase 1)
float t = elapsed / duration;
t = 1f - Mathf.Pow(1f - t, 3f);

// Ease-in quadratic (Phase 2)
float t = elapsed / duration;
t = t * t;

// SmoothStep / Hermite (Phases 3 & 4)
float t = elapsed / duration;
t = Mathf.SmoothStep(0f, 1f, t);  // = t * t * (3 - 2 * t)
```

### Three.js Equivalent

```javascript
const MINE_PHASES = [
    { target: { x: -80, z: 24 },  duration: 0.25, easing: (t) => 1 - Math.pow(1 - t, 3) },
    { target: { x: 40, z: -16 },  duration: 0.15, easing: (t) => t * t },
    { target: { x: 14, z: 0 },    duration: 0.08, easing: (t) => t * t * (3 - 2 * t) },
    { target: { x: 0, z: 0 },     duration: 0.20, easing: (t) => t * t * (3 - 2 * t) },
];

// Each phase Slerps arm-right.localRotation from the previous phase's final rotation
// to: armIdleRotation * Quaternion.Euler(target.x, 0, target.z)
```

### Impact Particles

On Phase 2 completion, optional impact particles spawn:

```csharp
Vector3 spawnPosition = impactPoint + impactNormal.normalized * impactParticleOffset; // offset = 5.35
Quaternion spawnRotation = Quaternion.LookRotation(impactNormal);
// Particle auto-destroys after impactParticleLifetime = 13.39s
```

---

## Block Highlight System (MineableBlockHighlight)

When the player has the pickaxe equipped, a hover outline appears on the looked-at block.

### Highlight Algorithm

1. Raycast forward from camera (`highlightRange = 8.0` units)
2. Use `Physics.RaycastAll` and sort by distance (closest first)
3. Filter: only direct children of the `MineableArea` root
4. Filter: check on-chain bitmap to verify the block is mineable
5. If a valid block is found and differs from the current highlight target:
   - Destroy the previous overlay
   - Create a new overlay child on the target block

### Overlay Creation

```csharp
// 1. Create a new empty child GameObject on the target block
GameObject overlay = new GameObject("__HoverOutline__");
overlay.transform.SetParent(block, worldPositionStays: false);
overlay.transform.localPosition = Vector3.zero;
overlay.transform.localRotation = Quaternion.identity;
overlay.transform.localScale    = Vector3.one;

// 2. Share the same mesh (no copy)
MeshFilter mf = overlay.AddComponent<MeshFilter>();
mf.sharedMesh = block.GetComponent<MeshFilter>().sharedMesh;

// 3. Render with outline-only material
MeshRenderer mr = overlay.AddComponent<MeshRenderer>();
mr.sharedMaterial = outlineMaterial;  // DIGGERS/Outline with _RenderMain=0
mr.shadowCastingMode = ShadowCastingMode.Off;
mr.receiveShadows = false;
```

---

## Outline Shader (DIGGERS/Outline)

The outline shader is a 2-pass URP shader:

### Pass 1: ForwardLit (Normal Rendering)

- Conditionally discarded when `_RenderMain < 0.5` (used for overlay-only mode)
- Simple N-dot-L diffuse lighting with ambient `(0.2, 0.2, 0.2)`

### Pass 2: Outline (Back-Face Extrusion)

- `Cull Front` - renders only back faces
- Vertices extruded along object-space normals by `_OutlineWidth`
- Depth offset applied to prevent Z-fighting

```hlsl
float3 posOS = positionOS.xyz + normalize(normalOS) * _OutlineWidth;
positionHCS = TransformObjectToHClip(posOS);

// Z-fighting prevention
#if UNITY_REVERSED_Z
    positionHCS.z -= 0.0001 * positionHCS.w;
#else
    positionHCS.z += 0.0001 * positionHCS.w;
#endif
```

### Corner-Only Mode

When `_CornerOnly > 0.5`, the fragment shader discards pixels that are not near cube corners:

```hlsl
float3 absPos = abs(positionOS);
float maxAxis = max(absPos.x, max(absPos.y, absPos.z));
float3 corner = absPos / max(maxAxis, 1e-5);
if (min(corner.x, min(corner.y, corner.z)) < _CornerThreshold)  // 0.82
    discard;
```

### Shader Parameters (MineableHoverOutline.mat)

- `_CornerThreshold = 0.82`
- `_RenderMain = 0` for overlay-only usage
- `_OutlineWidth` and outline color should match material inspector values

### Three.js Outline Equivalent

```javascript
// Option A: Back-face extrusion (matches Unity approach)
const outlineMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        uniform float outlineWidth;
        void main() {
            vec3 pos = position + normal * outlineWidth;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 outlineColor;
        void main() {
            gl_FragColor = vec4(outlineColor, 1.0);
        }
    `,
    uniforms: {
        outlineWidth: { value: 0.02 },
        outlineColor: { value: new THREE.Color(1.0, 0.8, 0.0) }
    },
    // To mimic Unity's "Cull Front", render only back faces.
    side: THREE.BackSide,
});

// Option B: Use Three.js OutlineEffect or EffectComposer with OutlinePass
```

---

## Input System Mapping

The controller uses Unity's New Input System with `InputActionReference` bindings.

### Action Map

`TODO`: add concrete action names/bindings from the Unity Input Actions asset.

### Input Reading Pattern

All input is read through helper methods that null-check the action reference:

```csharp
private Vector2 ReadMoveInput()
{
    if (moveAction != null && moveAction.action != null)
        return moveAction.action.ReadValue<Vector2>();
    return Vector2.zero;
}

private bool WasActionPressedThisFrame(InputActionReference actionRef)
{
    return actionRef != null && actionRef.action != null && actionRef.action.WasPressedThisFrame();
}
```

### Three.js Equivalent

```javascript
const keys = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

function getMoveInput() {
    let x = 0, y = 0;
    if (keys['KeyA'] || keys['ArrowLeft'])  x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) x += 1;
    if (keys['KeyW'] || keys['ArrowUp'])    y += 1;
    if (keys['KeyS'] || keys['ArrowDown'])  y -= 1;
    return { x, y };
}

const isSprinting = keys['ShiftLeft'];
const jumpPressed = keys['Space']; // Need edge detection for single-press
```

---

## Update Loop Timing

Understanding which logic runs where is critical for a faithful port:

### Unity Timing Model

- `Update`: input polling, camera look, sprint/zoom/head-bob state updates
- `FixedUpdate`: physics movement + velocity changes
- `LateUpdate` (if used): camera follow corrections after movement

### Three.js Mapping

```javascript
function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // "Update" equivalent -- runs every frame
    updateCamera(deltaTime);
    updateZoom(deltaTime);
    updateSprint(deltaTime);
    updateJump();
    updateCrouch();
    checkGround();
    updateHeadBob(deltaTime);

    // "FixedUpdate" equivalent -- ideally on a fixed timestep accumulator
    fixedTimeAccumulator += deltaTime;
    while (fixedTimeAccumulator >= FIXED_TIMESTEP) {
        updateMovementPhysics(FIXED_TIMESTEP);
        fixedTimeAccumulator -= FIXED_TIMESTEP;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}
```

---

## Notes

- This file captures Unity implementation behavior and direct Three.js mapping patterns.
- Fill remaining `TODO` fields from Unity inspector/export data if strict 1:1 parity is required.
