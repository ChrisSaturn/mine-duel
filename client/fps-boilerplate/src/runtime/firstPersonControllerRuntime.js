import * as THREE from 'three';

const DIR_FWD = new THREE.Vector3(0, 0, -1);
const DIR_BKD = new THREE.Vector3(0, 0, 1);
const DIR_LFT = new THREE.Vector3(-1, 0, 0);
const DIR_RGT = new THREE.Vector3(1, 0, 0);

/**
 * Modular runtime controller aligned with DIGGERS Unity FirstPersonController sections:
 * camera/look, zoom, sprint, crouch, head-bob, and horizontal velocity-change movement.
 */
export function createFirstPersonControllerRuntime({
  camera,
  playerRig,
  config,
  inputState,
  sprintBar,
  sprintBarFill,
  onLookUpdated = null,
  onCrouchStateChanged = null
}) {
  let lookPitch = 0;
  let isCrouched = false;
  let crouchBlend = 0;
  let isZoomed = false;
  let isSprinting = false;
  let sprintRemaining = config.sprintDuration;
  let sprintCooldown = 0;
  let sprintBarAlpha = 0;
  let headBobTimer = 0;
  let headBobOffsetY = 0;
  let playerIsMovingHorizontally = false;
  let playerMovementSpeedNormalized = 0;

  const cameraDirection = new THREE.Vector3();
  const moveDirection = new THREE.Vector3();
  const upVector = new THREE.Vector3(0, 1, 0);
  const horizontalVelocity = new THREE.Vector3();

  function notifyLookUpdated() {
    if (typeof onLookUpdated === 'function') {
      onLookUpdated();
    }
  }

  function hasMoveInput() {
    return inputState.fwdPressed || inputState.bkdPressed || inputState.lftPressed || inputState.rgtPressed;
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
    playerIsMovingHorizontally = false;
    playerMovementSpeedNormalized = 0;
  }

  function resetForSpawn() {
    handleGameplayInactive();
    resetMovementState();
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

  function updateHeadBob(deltaSeconds, gameplayActive, canJump) {
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

  function update(deltaSeconds, { gameplayActive, canJump }) {
    updateCrouchState(deltaSeconds);
    updateSprintState(deltaSeconds, gameplayActive);
    updateHeadBob(deltaSeconds, gameplayActive, canJump);
    updateCameraFov(deltaSeconds);
  }

  function updateHorizontalMovement(playerVelocity) {
    camera.getWorldDirection(cameraDirection);
    const angle = 2 * Math.PI - (Math.atan2(cameraDirection.z, cameraDirection.x) + Math.PI / 2);

    moveDirection.set(0, 0, 0);
    if (inputState.fwdPressed) {
      moveDirection.add(DIR_FWD);
    }
    if (inputState.bkdPressed) {
      moveDirection.add(DIR_BKD);
    }
    if (inputState.lftPressed) {
      moveDirection.add(DIR_LFT);
    }
    if (inputState.rgtPressed) {
      moveDirection.add(DIR_RGT);
    }

    if (moveDirection.lengthSq() === 0) {
      horizontalVelocity.set(0, 0, 0);
    } else {
      moveDirection.normalize().applyAxisAngle(upVector, angle);
      const walkSpeed = config.walkSpeed * (isCrouched ? config.crouchSpeedReduction : 1);
      const speed = isSprinting ? config.sprintSpeed : walkSpeed;
      horizontalVelocity.copy(moveDirection).multiplyScalar(speed);
    }

    const velocityChangeX = THREE.MathUtils.clamp(
      horizontalVelocity.x - playerVelocity.x,
      -config.maxVelocityChange,
      config.maxVelocityChange
    );
    const velocityChangeZ = THREE.MathUtils.clamp(
      horizontalVelocity.z - playerVelocity.z,
      -config.maxVelocityChange,
      config.maxVelocityChange
    );

    playerVelocity.x += velocityChangeX;
    playerVelocity.z += velocityChangeZ;

    const horizontalSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    playerIsMovingHorizontally = horizontalSpeed > 0.1;
    playerMovementSpeedNormalized = THREE.MathUtils.clamp(horizontalSpeed / config.sprintSpeed, 0, 1);
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
    resetForSpawn,
    update,
    updateHorizontalMovement,
    getCrouchBlend,
    getHeadBobOffsetY,
    getMovementState
  };
}
