import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const HORIZONTAL_COLLISION_RAY_DIRECTIONS = Object.freeze([
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2),
  new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2),
  new THREE.Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2),
  new THREE.Vector3(-Math.SQRT1_2, 0, -Math.SQRT1_2)
]);

/**
 * First-person runtime rebuilt from scratch with explicit subsystem boundaries:
 * - look (yaw/pitch)
 * - zoom/sprint/crouch/head-bob state
 * - fixed-step movement, jump, gravity
 * - capsule-style horizontal collision + ground snap
 */
export function createFirstPersonControllerRuntime({
  camera,
  playerRig,
  colliders,
  config,
  inputState,
  sprintBar,
  sprintBarFill,
  resolveGroundY = null,
  onLookUpdated = null,
  onCrouchStateChanged = null
}) {
  const velocity = new THREE.Vector3();
  const spawnPosition = new THREE.Vector3().copy(playerRig.position);
  let spawnYaw = playerRig.rotation.y;

  let lookPitch = 0;
  let isCrouched = false;
  let crouchBlend = 0;
  let isZoomed = false;
  let isSprinting = false;
  let canJump = false;
  let isGrounded = false;
  let jumpRequested = false;

  let sprintRemaining = config.sprintDuration;
  let sprintCooldown = 0;
  let sprintBarAlpha = 0;
  let headBobTimer = 0;
  let headBobOffsetY = 0;
  let playerIsMovingHorizontally = false;
  let playerMovementSpeedNormalized = 0;

  const forwardDirection = new THREE.Vector3();
  const rightDirection = new THREE.Vector3();
  const moveDirection = new THREE.Vector3();
  const horizontalVelocity = new THREE.Vector3();

  const groundProbeOrigin = new THREE.Vector3();
  const groundRaycaster = new THREE.Raycaster(
    new THREE.Vector3(),
    new THREE.Vector3(0, -1, 0),
    0,
    config.groundProbeDistance
  );

  const bodyColliderBox = new THREE.Box3();
  const bodyColliderSample = new THREE.Vector3();
  const bodyColliderClosest = new THREE.Vector3();
  const bodyColliderPush = new THREE.Vector3();
  const bodyColliderRayOrigin = new THREE.Vector3();
  const bodyColliderRayDirection = new THREE.Vector3();
  const bodyColliderMeshPushDirection = new THREE.Vector3();
  const bodyColliderRaycaster = new THREE.Raycaster();

  function notifyLookUpdated() {
    if (typeof onLookUpdated === 'function') {
      onLookUpdated();
    }
  }

  function hasMoveInput() {
    return inputState.fwdPressed || inputState.bkdPressed || inputState.lftPressed || inputState.rgtPressed;
  }

  function getMoveInputAxes(out = moveDirection) {
    const x = (inputState.rgtPressed ? 1 : 0) - (inputState.lftPressed ? 1 : 0);
    const y = (inputState.fwdPressed ? 1 : 0) - (inputState.bkdPressed ? 1 : 0);
    out.set(x, 0, y);
    return out;
  }

  function clampLookPitchToBounds() {
    lookPitch = THREE.MathUtils.clamp(lookPitch, config.minPitch, config.maxPitch);
    return lookPitch;
  }

  function getLookPitch() {
    return lookPitch;
  }

  function setLookPitch(nextLookPitch, notify = true) {
    lookPitch = THREE.MathUtils.clamp(Number(nextLookPitch) || 0, config.minPitch, config.maxPitch);
    if (notify) {
      notifyLookUpdated();
    }
  }

  function setToward(dx, dy, speed) {
    playerRig.rotateY(-dx * speed * config.mouseSensitivity);
    lookPitch = THREE.MathUtils.clamp(
      lookPitch + (-dy * speed * config.mouseSensitivity),
      config.minPitch,
      config.maxPitch
    );
    notifyLookUpdated();
  }

  function getIsCrouched() {
    return isCrouched;
  }

  function setCrouched(nextValue) {
    const nextCrouched = Boolean(nextValue);
    if (isCrouched === nextCrouched) {
      return;
    }

    isCrouched = nextCrouched;
    if (typeof onCrouchStateChanged === 'function') {
      onCrouchStateChanged(isCrouched);
    }
  }

  function setZoomed(nextValue) {
    if (isSprinting && nextValue) {
      return;
    }
    isZoomed = Boolean(nextValue);
  }

  function handleGameplayInactive() {
    isZoomed = false;
    isSprinting = false;
  }

  function resetSprintState() {
    sprintRemaining = config.sprintDuration;
    sprintCooldown = 0;
    isSprinting = false;
  }

  function resetMovementState() {
    velocity.x = 0;
    velocity.z = 0;
    playerIsMovingHorizontally = false;
    playerMovementSpeedNormalized = 0;
  }

  function clearVelocity() {
    velocity.set(0, 0, 0);
    playerIsMovingHorizontally = false;
    playerMovementSpeedNormalized = 0;
  }

  function resetForSpawn() {
    handleGameplayInactive();
    clearVelocity();
    jumpRequested = false;
    canJump = false;
    isGrounded = false;
    headBobTimer = 0;
    headBobOffsetY = 0;
  }

  function updateCrouchState(deltaSeconds) {
    const crouchTarget = isCrouched ? 1 : 0;
    crouchBlend = THREE.MathUtils.lerp(
      crouchBlend,
      crouchTarget,
      Math.min(1, deltaSeconds * config.crouchTransitionSpeed)
    );
  }

  function updateSprintState(deltaSeconds, gameplayActive) {
    const moving = hasMoveInput();
    const canAttemptSprint = gameplayActive
      && moving
      && !isCrouched
      && inputState.shiftPressed
      && sprintCooldown <= 0
      && sprintRemaining > 0;

    isSprinting = canAttemptSprint;

    if (isSprinting) {
      isZoomed = false;
      sprintRemaining = Math.max(0, sprintRemaining - deltaSeconds);
      if (sprintRemaining <= 0) {
        isSprinting = false;
        sprintCooldown = config.sprintCooldownDuration;
      }
    } else if (sprintCooldown > 0) {
      sprintCooldown = Math.max(0, sprintCooldown - deltaSeconds);
    } else {
      sprintRemaining = Math.min(config.sprintDuration, sprintRemaining + deltaSeconds);
    }

    if (!sprintBar || !sprintBarFill) {
      return;
    }

    const sprintRemainingPercent = THREE.MathUtils.clamp(sprintRemaining / config.sprintDuration, 0, 1);
    sprintBarFill.style.transform = `scaleX(${sprintRemainingPercent})`;

    const shouldShowBar = gameplayActive && (isSprinting || sprintRemainingPercent < 0.999);
    if (shouldShowBar) {
      sprintBarAlpha = Math.min(1, sprintBarAlpha + 5 * deltaSeconds);
    } else {
      sprintBarAlpha = Math.max(0, sprintBarAlpha - 3 * deltaSeconds);
    }
    sprintBar.style.opacity = String(sprintBarAlpha);
  }

  function updateHeadBob(deltaSeconds, gameplayActive) {
    if (!gameplayActive) {
      headBobTimer = 0;
      headBobOffsetY = THREE.MathUtils.lerp(headBobOffsetY, 0, Math.min(1, deltaSeconds * config.bobSpeed));
      return;
    }

    const isWalking = playerIsMovingHorizontally && canJump;
    if (isWalking) {
      let bobSpeed = config.bobSpeed;
      if (isSprinting) {
        bobSpeed += config.bobSprintSpeedBoost;
      } else if (isCrouched) {
        bobSpeed *= config.crouchSpeedReduction;
      }
      headBobTimer += deltaSeconds * bobSpeed;
      headBobOffsetY = Math.sin(headBobTimer) * config.bobAmountY;
      return;
    }

    headBobTimer = 0;
    headBobOffsetY = THREE.MathUtils.lerp(headBobOffsetY, 0, Math.min(1, deltaSeconds * config.bobSpeed));
  }

  function updateCameraFov(deltaSeconds) {
    let targetFov = config.fovNormal;
    let fovStepTime = config.zoomStepTime;

    if (isSprinting) {
      targetFov = config.sprintFov;
      fovStepTime = config.sprintFovStepTime;
    } else if (isZoomed) {
      targetFov = config.zoomFov;
    }

    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, fovStepTime * deltaSeconds));
    camera.updateProjectionMatrix();
  }

  function update(deltaSeconds, { gameplayActive }) {
    updateCrouchState(deltaSeconds);
    updateSprintState(deltaSeconds, gameplayActive);
    updateHeadBob(deltaSeconds, gameplayActive);
    updateCameraFov(deltaSeconds);
  }

  function updateHorizontalMovement() {
    getMoveInputAxes(moveDirection);
    if (moveDirection.lengthSq() === 0) {
      horizontalVelocity.set(0, 0, 0);
    } else {
      camera.getWorldDirection(forwardDirection);
      forwardDirection.y = 0;
      if (forwardDirection.lengthSq() <= 1e-8) {
        forwardDirection.set(0, 0, -1);
      } else {
        forwardDirection.normalize();
      }

      rightDirection.crossVectors(forwardDirection, WORLD_UP);
      if (rightDirection.lengthSq() <= 1e-8) {
        rightDirection.set(1, 0, 0);
      } else {
        rightDirection.normalize();
      }

      moveDirection
        .set(0, 0, 0)
        .addScaledVector(rightDirection, (inputState.rgtPressed ? 1 : 0) - (inputState.lftPressed ? 1 : 0))
        .addScaledVector(forwardDirection, (inputState.fwdPressed ? 1 : 0) - (inputState.bkdPressed ? 1 : 0));

      if (moveDirection.lengthSq() > 1e-8) {
        moveDirection.normalize();
      }

      const walkSpeed = config.walkSpeed * (isCrouched ? config.crouchSpeedReduction : 1);
      const speed = isSprinting ? config.sprintSpeed : walkSpeed;
      horizontalVelocity.copy(moveDirection).multiplyScalar(speed);
    }

    const velocityChangeX = THREE.MathUtils.clamp(
      horizontalVelocity.x - velocity.x,
      -config.maxVelocityChange,
      config.maxVelocityChange
    );
    const velocityChangeZ = THREE.MathUtils.clamp(
      horizontalVelocity.z - velocity.z,
      -config.maxVelocityChange,
      config.maxVelocityChange
    );

    velocity.x += velocityChangeX;
    velocity.z += velocityChangeZ;

    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    playerIsMovingHorizontally = horizontalSpeed > 0.1;
    playerMovementSpeedNormalized = THREE.MathUtils.clamp(horizontalSpeed / config.sprintSpeed, 0, 1);
  }

  function resolveHorizontalPenetration(point, box, radius, outPush) {
    bodyColliderClosest.set(
      THREE.MathUtils.clamp(point.x, box.min.x, box.max.x),
      point.y,
      THREE.MathUtils.clamp(point.z, box.min.z, box.max.z)
    );

    const deltaX = point.x - bodyColliderClosest.x;
    const deltaZ = point.z - bodyColliderClosest.z;
    const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
    const radiusSq = radius * radius;

    if (distanceSq >= radiusSq) {
      return false;
    }

    if (distanceSq > 1e-10) {
      const distance = Math.sqrt(distanceSq);
      const penetration = radius - distance + 1e-4;
      outPush.set((deltaX / distance) * penetration, 0, (deltaZ / distance) * penetration);
      return true;
    }

    const toMinX = Math.abs(point.x - box.min.x);
    const toMaxX = Math.abs(box.max.x - point.x);
    const toMinZ = Math.abs(point.z - box.min.z);
    const toMaxZ = Math.abs(box.max.z - point.z);
    const minDistance = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
    const penetration = radius + minDistance + 1e-4;

    if (minDistance === toMinX) {
      outPush.set(-penetration, 0, 0);
    } else if (minDistance === toMaxX) {
      outPush.set(penetration, 0, 0);
    } else if (minDistance === toMinZ) {
      outPush.set(0, 0, -penetration);
    } else {
      outPush.set(0, 0, penetration);
    }

    return true;
  }

  function canSampleCollider(point, box, radius) {
    if (point.y < box.min.y || point.y > box.max.y) {
      return false;
    }

    return !(
      point.x < box.min.x - radius
      || point.x > box.max.x + radius
      || point.z < box.min.z - radius
      || point.z > box.max.z + radius
    );
  }

  function resolveHorizontalMeshPenetration(point, collider, radius, outPush) {
    outPush.set(0, 0, 0);
    bodyColliderRayOrigin.copy(point);

    let hasPenetration = false;
    let maxPenetration = 0;

    for (const direction of HORIZONTAL_COLLISION_RAY_DIRECTIONS) {
      bodyColliderRayDirection.copy(direction);
      bodyColliderRaycaster.set(bodyColliderRayOrigin, bodyColliderRayDirection);
      bodyColliderRaycaster.far = radius + 1e-3;

      const intersections = bodyColliderRaycaster.intersectObject(collider, true);
      if (intersections.length === 0) {
        continue;
      }

      const hit = intersections[0];
      const penetration = radius - hit.distance;
      if (penetration <= 0) {
        continue;
      }

      bodyColliderMeshPushDirection.copy(point).sub(hit.point);
      bodyColliderMeshPushDirection.y = 0;
      if (bodyColliderMeshPushDirection.lengthSq() <= 1e-10) {
        bodyColliderMeshPushDirection.copy(bodyColliderRayDirection).multiplyScalar(-1);
      } else {
        bodyColliderMeshPushDirection.normalize();
      }

      const pushAmount = penetration + 1e-4;
      outPush.addScaledVector(bodyColliderMeshPushDirection, pushAmount);
      maxPenetration = Math.max(maxPenetration, pushAmount);
      hasPenetration = true;
    }

    if (!hasPenetration || outPush.lengthSq() <= 1e-10) {
      return false;
    }

    const pushLength = outPush.length();
    if (pushLength > maxPenetration && maxPenetration > 0) {
      outPush.multiplyScalar(maxPenetration / pushLength);
    }
    outPush.y = 0;
    return true;
  }

  function resolvePlayerBodyCollisions() {
    const radius = config.playerColliderRadius;
    const crouchScale = isCrouched ? config.crouchHeight : 1;
    const height = Math.max(config.playerColliderHeight * crouchScale, radius * 2 + 0.01);

    for (let iteration = 0; iteration < config.playerCollisionIterations; iteration += 1) {
      let resolvedAny = false;
      const sampleMidY = playerRig.position.y + height * 0.5;
      const sampleTopY = playerRig.position.y + height - radius;
      const sampleYs = [sampleMidY, sampleTopY];

      for (const collider of colliders) {
        if (!collider) {
          continue;
        }
        if (collider?.userData?.colliderGroundOnly === true) {
          continue;
        }

        bodyColliderBox.setFromObject(collider);
        if (bodyColliderBox.isEmpty()) {
          continue;
        }

        const colliderShape = collider?.userData?.colliderShape === 'mesh' ? 'mesh' : 'bounds';
        const disableBoundsFallback = collider?.userData?.colliderDisableBoundsFallback === true;

        for (const sampleY of sampleYs) {
          const samplePoint = bodyColliderSample.set(playerRig.position.x, sampleY, playerRig.position.z);
          if (!canSampleCollider(samplePoint, bodyColliderBox, radius)) {
            continue;
          }

          const resolved = colliderShape === 'mesh'
            ? (
              resolveHorizontalMeshPenetration(samplePoint, collider, radius, bodyColliderPush)
              || (!disableBoundsFallback
                && resolveHorizontalPenetration(samplePoint, bodyColliderBox, radius, bodyColliderPush))
            )
            : resolveHorizontalPenetration(samplePoint, bodyColliderBox, radius, bodyColliderPush);

          if (!resolved) {
            continue;
          }

          playerRig.position.add(bodyColliderPush);
          if (bodyColliderPush.x !== 0 && Math.sign(bodyColliderPush.x) !== Math.sign(velocity.x)) {
            velocity.x = 0;
          }
          if (bodyColliderPush.z !== 0 && Math.sign(bodyColliderPush.z) !== Math.sign(velocity.z)) {
            velocity.z = 0;
          }
          resolvedAny = true;
        }
      }

      if (!resolvedAny) {
        break;
      }
    }
  }

  function resolveGrounding() {
    groundProbeOrigin.set(
      playerRig.position.x,
      playerRig.position.y + config.groundProbeLift,
      playerRig.position.z
    );
    groundRaycaster.ray.origin.copy(groundProbeOrigin);

    const intersections = groundRaycaster.intersectObjects(colliders, true);
    let resolvedGroundY = Number.isFinite(intersections[0]?.distance)
      ? groundProbeOrigin.y - intersections[0].distance
      : null;
    if (typeof resolveGroundY === 'function') {
      const customGroundY = resolveGroundY({
        x: playerRig.position.x,
        y: playerRig.position.y,
        z: playerRig.position.z,
        staticGroundY: Number.isFinite(resolvedGroundY) ? resolvedGroundY : null,
        hasStaticGroundHit: intersections.length > 0
      });
      if (Number.isFinite(customGroundY)) {
        resolvedGroundY = customGroundY;
      }
    }

    if (!Number.isFinite(resolvedGroundY)) {
      canJump = false;
      isGrounded = false;
      return;
    }

    const footDistance = playerRig.position.y - resolvedGroundY;
    const maxUpSnapDistance = 0.2;
    const groundedNow = (
      footDistance <= config.groundSnapDistance
      && footDistance >= -maxUpSnapDistance
      && velocity.y <= 0
    );

    if (groundedNow) {
      playerRig.position.y = resolvedGroundY;
      velocity.y = 0;
      canJump = true;
      isGrounded = true;
    } else {
      canJump = false;
      isGrounded = false;
    }
  }

  function requestJump() {
    jumpRequested = true;
  }

  function consumeJumpRequest() {
    if (!jumpRequested) {
      return;
    }

    jumpRequested = false;
    if (!canJump) {
      return;
    }

    if (isCrouched && !config.holdToCrouch) {
      setCrouched(false);
    }

    velocity.y = config.jumpVelocity;
    canJump = false;
    isGrounded = false;
  }

  function fixedUpdate(deltaSeconds, { gameplayActive } = { gameplayActive: true }) {
    if (!gameplayActive) {
      return;
    }

    consumeJumpRequest();
    updateHorizontalMovement();

    playerRig.position.x += velocity.x * deltaSeconds;
    playerRig.position.z += velocity.z * deltaSeconds;
    resolvePlayerBodyCollisions();

    velocity.y += config.gravity * deltaSeconds;
    playerRig.position.y += velocity.y * deltaSeconds;

    resolveGrounding();
    resolvePlayerBodyCollisions();

    if (playerRig.position.y < config.fallResetHeight) {
      resetToSpawn();
    }
  }

  function setSpawn(nextPosition, nextYaw = 0) {
    if (nextPosition?.isVector3) {
      spawnPosition.copy(nextPosition);
    } else if (nextPosition && Number.isFinite(nextPosition.x) && Number.isFinite(nextPosition.y) && Number.isFinite(nextPosition.z)) {
      spawnPosition.set(nextPosition.x, nextPosition.y, nextPosition.z);
    }
    if (Number.isFinite(nextYaw)) {
      spawnYaw = nextYaw;
    }
  }

  function resetToSpawn() {
    playerRig.position.copy(spawnPosition);
    playerRig.rotation.y = spawnYaw;
    resetForSpawn();
    resolveGrounding();
    resolvePlayerBodyCollisions();
  }

  function getCrouchBlend() {
    return crouchBlend;
  }

  function getHeadBobOffsetY() {
    return headBobOffsetY;
  }

  function getMovementState() {
    return {
      isMovingHorizontally: playerIsMovingHorizontally,
      speedNormalized: playerMovementSpeedNormalized
    };
  }

  function getVelocity() {
    return velocity;
  }

  function getCanJump() {
    return canJump;
  }

  function getIsGrounded() {
    return isGrounded;
  }

  return {
    clampLookPitchToBounds,
    getLookPitch,
    setLookPitch,
    setToward,
    getIsCrouched,
    setCrouched,
    setZoomed,
    handleGameplayInactive,
    resetSprintState,
    resetMovementState,
    clearVelocity,
    resetForSpawn,
    update,
    fixedUpdate,
    requestJump,
    setSpawn,
    resetToSpawn,
    getCrouchBlend,
    getHeadBobOffsetY,
    getMovementState,
    getVelocity,
    getCanJump,
    getIsGrounded
  };
}
