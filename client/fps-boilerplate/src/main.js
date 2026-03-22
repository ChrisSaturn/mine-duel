import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DEFAULT_MAP_MANIFEST_PATH,
  applyMapData as applyMapManifestData,
  getMineZoneAabbs,
  loadMapManifest,
  normalizeMapData,
  worldPositionToGameplayCell
} from './runtime/mapRuntime.js';
import { createAtmosphereRuntime } from './runtime/atmosphereRuntime.js';
import {
  DEFAULT_BLOCKWORLD_BIOME,
  getBlockworldPostProcessStyle,
  normalizeBlockworldBiome
} from './runtime/blockworldStyleRuntime.js';
import { createFirstPersonControllerRuntime } from './runtime/firstPersonControllerRuntime.js';
import { createPostProcessRuntime } from './runtime/postProcessRuntime.js';
import { createVoxelRuntime } from './runtime/voxelRuntime.js';
import { createRoomRuntime } from './runtime/gameplay/roomRuntime.js';

function withBaseUrl(path) {
  const baseUrl = typeof import.meta?.env?.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

// ---------------------------------------------
// UI refs
// ---------------------------------------------
const app = document.getElementById('app');
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const fpsValue = document.getElementById('fps-value');
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const sprintBar = document.getElementById('sprint-bar');
const sprintBarFill = document.getElementById('sprint-bar-fill');
const walletSelect = document.getElementById('wallet-select');
const walletConnectButton = document.getElementById('wallet-connect');
const walletDisconnectButton = document.getElementById('wallet-disconnect');
const walletStatusValue = document.getElementById('wallet-status-value');
const walletAddressValue = document.getElementById('wallet-address-value');
const walletRpcValue = document.getElementById('wallet-rpc-value');
const streamStatusValue = document.getElementById('stream-status-value');
const notificationBopper = document.getElementById('notification-bopper');
const matchResultOverlay = document.getElementById('match-result-overlay');
const matchResultKicker = document.getElementById('match-result-kicker');
const matchResultTitle = document.getElementById('match-result-title');
const matchResultSubtitle = document.getElementById('match-result-subtitle');
const matchResultCountdownValueEl = document.getElementById('match-result-countdown-value');
const matchResultCaption = document.getElementById('match-result-caption');
const roomWaitOverlay = document.getElementById('room-wait-overlay');
const roomWaitStateLabel = document.getElementById('room-wait-state');
const roomWaitCode = document.getElementById('room-wait-code');
const roomWaitMeta = document.getElementById('room-wait-meta');
const roomWaitCancelButton = document.getElementById('room-wait-cancel');

// ---------------------------------------------
// Runtime config (single source of truth)
// ---------------------------------------------
const CONFIG = {
  mapManifestPath: DEFAULT_MAP_MANIFEST_PATH,
  mineDuelProgramId: String(import.meta.env.VITE_MINE_DUEL_PROGRAM_ID || '4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ'),
  erRpcUrl: String(import.meta.env.VITE_ER_RPC_URL || 'https://devnet.magicblock.app/').trim(),
  erWsUrl: String(import.meta.env.VITE_ER_WS_URL || '').trim(),
  playerHeight: 1.62,
  walkSpeed: 5,
  sprintSpeed: 7,
  maxVelocityChange: 10,
  gravity: -9.81,
  jumpVelocity: 6.2,
  mouseSensitivity: 2,
  mouseLookSpeed: Math.PI / 1800,
  playerModelScale: 1,
  cameraHeadForwardOffset: 0.12,
  cameraHeadVerticalOffset: 0.1,
  crouchCameraDrop: 0.34,
  minPitch: -THREE.MathUtils.degToRad(50),
  maxPitch: THREE.MathUtils.degToRad(50),
  maxPitchDownLimit: THREE.MathUtils.degToRad(75),
  playerColliderRadius: 0.35,
  playerColliderHeight: 1.7,
  playerCollisionIterations: 3,
  groundProbeLift: 1.2,
  groundProbeDistance: 5,
  groundSnapDistance: 0.12,
  fallResetHeight: -20,
  fixedTimeStep: 1 / 50,
  maxFixedStepsPerFrame: 5,
  fovNormal: 70,
  zoomFov: 30,
  zoomStepTime: 10,
  sprintFov: 80,
  sprintFovStepTime: 10,
  sprintDuration: 5,
  sprintCooldownDuration: 0.5,
  crouchHeight: 0.5,
  crouchSpeedReduction: 0.5,
  crouchTransitionSpeed: 12,
  holdToCrouch: false,
  bobSpeed: 10,
  bobSprintSpeedBoost: 7,
  bobAmountY: 0.1,
  maxDeltaSeconds: 0.05,
  fpsUpdateIntervalMs: 250
};
const DEFAULT_PLAYER_MODEL_PATH = withBaseUrl('models/characters/kenney-blocky/character-a.glb');
const FIRST_PERSON_PICKAXE_MODEL_PATH = withBaseUrl('models/kenney-survival/GLB format/tool-pickaxe.glb');
const WINNER_BLANK_BLOCK_MODEL_PATH = withBaseUrl('models/cube-world/Blocks/glTF/Block_Blank.gltf');
const MINE_BREAK_MAX_DISTANCE = 7.5;
const MINE_BREAK_COOLDOWN_MS = 120;
const MINE_BREAKABLE_NAME_PREFIX = 'cube-world-ground-';
const MINE_BREAKABLE_NAME_SUFFIX = '-cubes';
const MINE_DEBRIS_PARTICLE_COUNT = 14;
const MINE_DEBRIS_LIFETIME_MIN = 0.3;
const MINE_DEBRIS_LIFETIME_MAX = 0.56;
const MINE_DEBRIS_SIZE_MIN = 0.12;
const MINE_DEBRIS_SIZE_MAX = 0.24;
const MINE_DEBRIS_GRAVITY = 13.5;
const MINE_DEBRIS_LAUNCH_SPREAD = 1.8;
const MINE_DEBRIS_LAUNCH_VERTICAL = 1.35;
const MINE_DEBRIS_SPEED_MIN = 4.1;
const MINE_DEBRIS_SPEED_MAX = 8.4;
const MINE_DEBRIS_VERTICAL_BOOST = 1.9;
const MINE_DEBRIS_SPIN_MAX = 28;
const MINE_DEBRIS_DRAG = 1.7;
const MINE_SWING_PROGRESS_SPEED = 2.2;
const MINE_SWAY_X_BASE = 0.006;
const MINE_SWAY_X_MOVEMENT = 0.014;
const MINE_SWAY_Y_BASE = 0.004;
const MINE_SWAY_Y_MOVEMENT = 0.011;
const MINE_SWAY_X_FREQ_BASE = 6;
const MINE_SWAY_X_FREQ_MOVEMENT = 5.5;
const MINE_SWAY_Y_FREQ_BASE = 8;
const MINE_SWAY_Y_FREQ_MOVEMENT = 6;
const MINE_SWING_JITTER_FREQ = 92;
const MINE_SWING_JITTER_AMOUNT = 0.0024;
const MINE_CONFIRMATION_TIMEOUT_MS = 12000;
const MINE_VISUAL_EXPOSED_LAYER_Y = 0;
const MINE_PENDING_NOTIFICATION_TTL_MS = MINE_CONFIRMATION_TIMEOUT_MS + 1200;
const NOTIFICATION_STACK_LIMIT = 5;
const NOTIFICATION_LEAVE_MS = 220;
const ROOM_CONTEXT_STORAGE_KEY = 'mine-duel.active-room-context.v1';
let selectedPlayerModelPath = DEFAULT_PLAYER_MODEL_PATH;

// ---------------------------------------------
// Core three.js objects
// ---------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ea9c4);
scene.fog = new THREE.Fog(0x8ea9c4, 34, 240);
const mineBreakParticleRoot = new THREE.Group();
mineBreakParticleRoot.name = 'mine-break-particle-root';
scene.add(mineBreakParticleRoot);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = true;
app.prepend(renderer.domElement);

const playerSpawnPosition = new THREE.Vector3(0, 0, 10);
let playerSpawnYaw = 0;

const playerRig = new THREE.Object3D();
playerRig.position.copy(playerSpawnPosition);
scene.add(playerRig);
playerRig.add(camera);
camera.position.set(0, CONFIG.playerHeight, 0);

// ---------------------------------------------
// Movement state
// ---------------------------------------------
const inputState = {
  fwdPressed: false,
  bkdPressed: false,
  lftPressed: false,
  rgtPressed: false,
  spacePressed: false,
  shiftPressed: false
};

const mineHoverRaycaster = new THREE.Raycaster();
mineHoverRaycaster.near = 0;
mineHoverRaycaster.far = 7.5;
const mineHoverPointerNdc = new THREE.Vector2(0, 0);
const mineHoverInstanceMatrix = new THREE.Matrix4();
const mineHoverWorldMatrix = new THREE.Matrix4();
const mineBreakInstanceMatrix = new THREE.Matrix4();
const mineBreakWorldMatrix = new THREE.Matrix4();
const mineBreakLastInstanceMatrix = new THREE.Matrix4();
const mineBreakHitPosition = new THREE.Vector3();
const mineBreakHitNormal = new THREE.Vector3();
const mineBreakHitScale = new THREE.Vector3();
const mineBreakHitQuaternion = new THREE.Quaternion();
const gameplayCellWorldPosition = new THREE.Vector3();
const gameplayCellWorldNormal = new THREE.Vector3();
const gameplayCellWorldScale = new THREE.Vector3();
const mineBreakDebrisVelocity = new THREE.Vector3();
const mineBreakParticleGeometry = new THREE.BoxGeometry(1, 1, 1);
const mineBreakHiddenInstancePosition = new THREE.Vector3();
const mineBreakHiddenInstanceQuaternion = new THREE.Quaternion();
const mineBreakHiddenInstanceScale = new THREE.Vector3();
const winnerBlankBlockWorldMatrix = new THREE.Matrix4();
const winnerBlankBlockParentInverseMatrix = new THREE.Matrix4();
const winnerBlankBlockWorldPosition = new THREE.Vector3();
const winnerBlankBlockWorldQuaternion = new THREE.Quaternion();
const winnerBlankBlockWorldScale = new THREE.Vector3();
const playerModelBounds = new THREE.Box3();
const playerModelSize = new THREE.Vector3();
const playerModelCenter = new THREE.Vector3();
const playerModelMinPoint = new THREE.Vector3();
const playerModelCenterLocal = new THREE.Vector3();
const playerModelMinLocal = new THREE.Vector3();
const runtimeHeadPitchAxis = new THREE.Vector3(1, 0, 0);
const runtimeHeadPitchQuaternion = new THREE.Quaternion();
const runtimeHeadWorldPosition = new THREE.Vector3();
const runtimeHeadLocalAnchor = new THREE.Vector3();
const runtimeHeadBounds = new THREE.Box3();
const runtimeHeadBoundsCenter = new THREE.Vector3();
let runtimeHeadAnchorYOffset = 0;
let runtimeHeadAnchorZOffset = 0;
const FIRST_PERSON_EYE_HEIGHT_RATIO = 0.72;

const playerModelLoader = new GLTFLoader();
const playerVisualRoot = new THREE.Group();
playerVisualRoot.name = 'runtime-player-visual-root';
playerRig.add(playerVisualRoot);
let runtimePlayerModel = null;
let runtimeHeadNode = null;
const runtimeFirstPersonHiddenMeshes = [];
const runtimeHeadNeutralQuaternion = new THREE.Quaternion();
const runtimePlayerLimbState = {
  leftArm: null,
  rightArm: null,
  leftLeg: null,
  rightLeg: null,
  walkCycleSeconds: 0
};
const limbTargetRotation = new THREE.Quaternion();
const limbOffsetRotation = new THREE.Quaternion();
const limbOffsetEuler = new THREE.Euler();

const firstPersonToolRoot = new THREE.Group();
firstPersonToolRoot.name = 'first-person-tool-root';
camera.add(firstPersonToolRoot);
const firstPersonToolBasePosition = new THREE.Vector3(0.4, -0.2, -0.4);
const firstPersonToolBaseEuler = new THREE.Euler(
  THREE.MathUtils.degToRad(-20),
  THREE.MathUtils.degToRad(130),
  THREE.MathUtils.degToRad(-20),
  'YXZ'
);
const firstPersonToolAnimatedEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const firstPersonToolBaseScale = 0.22;
const firstPersonPickaxeWorldScale = 1;
const firstPersonArmBasePosition = new THREE.Vector3(-0.08, -0.06, 0.06);
const firstPersonArmBaseEuler = new THREE.Euler(
  THREE.MathUtils.degToRad(14),
  THREE.MathUtils.degToRad(8),
  THREE.MathUtils.degToRad(-8),
  'YXZ'
);
const firstPersonArmAnimatedEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const firstPersonArmPoseQuaternion = new THREE.Quaternion();
const firstPersonArmBounds = new THREE.Box3();
const firstPersonArmSize = new THREE.Vector3();
const firstPersonArmCenter = new THREE.Vector3();
const firstPersonArmTargetSize = 0.9;
let runtimeFirstPersonPickaxe = null;
let runtimeFirstPersonArm = null;
let runtimeFirstPersonArmRestQuaternion = null;
const firstPersonPickaxeEnergyMaterials = [];
let firstPersonPickaxeSwingProgress = 1;
let prevTimeMs = performance.now();
let fixedStepAccumulator = 0;

// ---------------------------------------------
// FPS counter state
// ---------------------------------------------
let fpsFrames = 0;
let fpsWindowMs = 0;

// ---------------------------------------------
// Runtime map/editor state
// ---------------------------------------------
const colliders = [];
let activeMapData = null;
let activeRuntimeState = null;
let editorBridge = null;
let editorModeEnabled = false;
let walletGateway = null;
let walletStateUnsubscribe = null;
let walletActionInFlight = false;
let voxelRuntime = null;
let roomRuntime = null;
let roomSubscriptionDispose = null;
let mineZones = [];
const mineHoverTargets = [];
const mineCellVisualEntries = [];
const mineCellVisualByIndex = new Map();
const optimisticMinedCellIndexes = new Set();
const optimisticMinePendingByBitIndex = new Map();
let winnerBlankBlockVisual = null;
let winnerBlankBlockLoadPromise = null;
const mineBreakParticles = [];
let lastMineAtMs = 0;
let atmosphereRuntime = null;
let postProcessRuntime = null;
const notificationStack = [];
let notificationAutoId = 0;
let matchResultCountdownTimer = 0;
let matchResultCountdown = 0;
let matchResultRedirectTimer = 0;
let gameRouter = null;
let activeRoomCode = '';
let latestRoomSharedState = null;
let latestWinnerState = null;
let latestPlayerRevealState = null;
let roomLifecycleState = 'Lobby';
let roomLifecycleActionInFlight = false;
let sessionEnsureInFlight = false;
let roomCancelInFlight = false;
let eventsBound = false;
let previousWalletConnected = null;
let previousWalletError = '';
const firstPersonController = createFirstPersonControllerRuntime({
  camera,
  playerRig,
  colliders,
  config: CONFIG,
  inputState,
  sprintBar,
  sprintBarFill,
  onLookUpdated: () => {
    updateRuntimeHeadFromCamera();
    syncCameraToHeadAnchor();
  },
  onCrouchStateChanged: (nextCrouched) => {
    playerVisualRoot.scale.set(1, nextCrouched ? CONFIG.crouchHeight : 1, 1);
  }
});

if (import.meta.env.DEV) {
  const editorHint = document.createElement('p');
  editorHint.id = 'editor-hint';
  editorHint.textContent = import.meta.env.VITE_ENABLE_EDITOR === '1'
    ? 'Dev editor enabled: press ` to toggle.'
    : 'Dev editor disabled. Set VITE_ENABLE_EDITOR=1 to enable.';
  hud?.appendChild(editorHint);
}

function getActiveBiomeLighting() {
  return normalizeBlockworldBiome(activeMapData?.biomeLighting ?? DEFAULT_BLOCKWORLD_BIOME);
}

function syncBlockworldVisualStyle() {
  const biomeLighting = getActiveBiomeLighting();
  atmosphereRuntime?.setBiome?.(biomeLighting);
  voxelRuntime?.setBiome?.(biomeLighting);
  postProcessRuntime?.setPeakStyle?.(getBlockworldPostProcessStyle(biomeLighting));
}

function isBreakableMineTargetObject(object) {
  if (!object || object.visible === false) {
    return false;
  }
  if (object.userData?.mineVisualRemoved === true) {
    return false;
  }
  if (typeof object.userData?.minePatchVariant === 'string') {
    return true;
  }
  const objectName = typeof object.name === 'string' ? object.name : '';
  return objectName.startsWith(MINE_BREAKABLE_NAME_PREFIX)
    && objectName.endsWith(MINE_BREAKABLE_NAME_SUFFIX);
}

function getMineCenterRaycastHit(cameraRef, maxDistance = MINE_BREAK_MAX_DISTANCE) {
  if (!cameraRef || mineHoverTargets.length === 0) {
    return null;
  }

  mineHoverRaycaster.far = maxDistance;
  mineHoverRaycaster.setFromCamera(mineHoverPointerNdc, cameraRef);
  const hits = mineHoverRaycaster.intersectObjects(mineHoverTargets, false);
  for (const hit of hits) {
    if (!isBreakableMineTargetObject(hit?.object)) {
      continue;
    }
    if (hit.object.isInstancedMesh && !Number.isInteger(hit.instanceId)) {
      continue;
    }
    return hit;
  }
  return null;
}

function resolveGameplayCellFromHit(hit) {
  if (!hit?.object) {
    return null;
  }

  if (hit.object.isInstancedMesh && Number.isInteger(hit.instanceId)) {
    const cellCoords = hit.object.userData?.minePatchCellCoords;
    if (Array.isArray(cellCoords) && cellCoords[hit.instanceId]) {
      const coord = cellCoords[hit.instanceId];
      return {
        x: Number(coord[0]) || 0,
        y: Number(coord[1]) || 0,
        z: Number(coord[2]) || 0,
        inBounds: true
      };
    }
  }

  const gameplayGrid = getActiveGameplayGrid();
  if (!gameplayGrid) {
    return null;
  }

  resolveMineHitPose(hit, gameplayCellWorldPosition, gameplayCellWorldNormal, gameplayCellWorldScale);
  const projected = worldPositionToGameplayCell({
    x: gameplayCellWorldPosition.x,
    y: gameplayCellWorldPosition.y,
    z: gameplayCellWorldPosition.z
  }, gameplayGrid);

  if (!projected.inBounds) {
    return null;
  }

  return {
    x: projected.x,
    y: projected.y,
    z: projected.z,
    inBounds: true
  };
}

function resolveHitMaterial(hit) {
  const objectMaterial = hit?.object?.material;
  if (!objectMaterial) {
    return null;
  }

  if (!Array.isArray(objectMaterial)) {
    return objectMaterial;
  }

  const materialIndex = Number.isInteger(hit?.face?.materialIndex)
    ? hit.face.materialIndex
    : 0;
  return objectMaterial[materialIndex] || objectMaterial[0] || null;
}

function resolveMineHitPose(hit, outPosition, outNormal, outScale) {
  const object = hit.object;
  outPosition.copy(hit.point || object.position);

  if (hit?.face?.normal) {
    outNormal.copy(hit.face.normal).transformDirection(object.matrixWorld).normalize();
  } else {
    outNormal.set(0, 1, 0);
  }

  if (object.isInstancedMesh && Number.isInteger(hit.instanceId)) {
    object.getMatrixAt(hit.instanceId, mineBreakInstanceMatrix);
    mineBreakWorldMatrix.multiplyMatrices(object.matrixWorld, mineBreakInstanceMatrix);
    mineBreakWorldMatrix.decompose(outPosition, mineBreakHitQuaternion, outScale);
  } else {
    object.getWorldScale(outScale);
  }
}

function removeInstancedMeshInstance(instancedMesh, instanceId) {
  if (!instancedMesh || !Number.isInteger(instanceId)) {
    return false;
  }

  const maxCount = Number(instancedMesh.count) || 0;
  if (instanceId < 0 || instanceId >= maxCount || maxCount <= 0) {
    return false;
  }

  // Keep the exact mined coordinate empty by tombstoning that instance
  // instead of swap-compacting to another live block matrix.
  instancedMesh.getMatrixAt(instanceId, mineBreakLastInstanceMatrix);
  mineBreakLastInstanceMatrix.decompose(
    mineBreakHiddenInstancePosition,
    mineBreakHiddenInstanceQuaternion,
    mineBreakHiddenInstanceScale
  );
  mineBreakHiddenInstancePosition.y -= 4096;
  mineBreakLastInstanceMatrix.compose(
    mineBreakHiddenInstancePosition,
    mineBreakHiddenInstanceQuaternion,
    mineBreakHiddenInstanceScale
  );
  instancedMesh.setMatrixAt(instanceId, mineBreakLastInstanceMatrix);
  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.computeBoundingSphere?.();
  instancedMesh.computeBoundingBox?.();
  return true;
}

function createMineDebrisMaterialTemplate(sourceMaterial) {
  const sourceMap = sourceMaterial && 'map' in sourceMaterial ? sourceMaterial.map || null : null;
  const sourceColor = sourceMaterial?.color?.isColor ? sourceMaterial.color : null;
  const sourceTransparent = Boolean(sourceMaterial?.transparent);
  const sourceAlphaTest = Number.isFinite(sourceMaterial?.alphaTest) ? sourceMaterial.alphaTest : 0;
  const template = new THREE.MeshLambertMaterial({
    map: sourceMap,
    color: sourceColor ? sourceColor.clone() : new THREE.Color(0xffffff),
    transparent: sourceTransparent || sourceAlphaTest > 0,
    alphaTest: sourceAlphaTest,
    depthWrite: true,
    side: THREE.DoubleSide
  });
  if (sourceMaterial?.emissive?.isColor) {
    template.emissive.copy(sourceMaterial.emissive);
  }
  if (Number.isFinite(sourceMaterial?.emissiveIntensity)) {
    template.emissiveIntensity = sourceMaterial.emissiveIntensity;
  }
  return template;
}

function spawnMineBreakDebris({ position, normal, scale, sourceMaterial }) {
  const blockScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 1);
  const particleCount = Math.max(8, Math.round(MINE_DEBRIS_PARTICLE_COUNT * THREE.MathUtils.clamp(blockScale, 0.75, 1.8)));
  const materialTemplate = createMineDebrisMaterialTemplate(sourceMaterial);

  for (let i = 0; i < particleCount; i += 1) {
    const particleMaterial = materialTemplate.clone();
    particleMaterial.transparent = true;
    particleMaterial.opacity = 1;

    const particleMesh = new THREE.Mesh(mineBreakParticleGeometry, particleMaterial);
    const size = THREE.MathUtils.lerp(MINE_DEBRIS_SIZE_MIN, MINE_DEBRIS_SIZE_MAX, Math.random()) * blockScale;
    particleMesh.scale.setScalar(size);
    particleMesh.position.copy(position);
    particleMesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    particleMesh.castShadow = true;
    particleMesh.receiveShadow = false;
    mineBreakParticleRoot.add(particleMesh);

    mineBreakDebrisVelocity.set(
      (Math.random() - 0.5) * MINE_DEBRIS_LAUNCH_SPREAD,
      Math.random() * MINE_DEBRIS_LAUNCH_VERTICAL,
      (Math.random() - 0.5) * MINE_DEBRIS_LAUNCH_SPREAD
    );
    mineBreakDebrisVelocity.add(normal).normalize();
    mineBreakDebrisVelocity.multiplyScalar(
      THREE.MathUtils.lerp(MINE_DEBRIS_SPEED_MIN, MINE_DEBRIS_SPEED_MAX, Math.random()) * blockScale
    );
    mineBreakDebrisVelocity.y += MINE_DEBRIS_VERTICAL_BOOST * blockScale;

    const maxLife = THREE.MathUtils.lerp(MINE_DEBRIS_LIFETIME_MIN, MINE_DEBRIS_LIFETIME_MAX, Math.random());
    mineBreakParticles.push({
      mesh: particleMesh,
      velocity: mineBreakDebrisVelocity.clone(),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * MINE_DEBRIS_SPIN_MAX,
        (Math.random() - 0.5) * MINE_DEBRIS_SPIN_MAX,
        (Math.random() - 0.5) * MINE_DEBRIS_SPIN_MAX
      ),
      life: maxLife,
      maxLife,
      baseScale: size
    });
  }

  materialTemplate.dispose();
}

function removeMineBreakParticleAt(index) {
  const particle = mineBreakParticles[index];
  if (!particle) {
    return;
  }

  mineBreakParticleRoot.remove(particle.mesh);
  if (particle.mesh?.material) {
    if (Array.isArray(particle.mesh.material)) {
      for (const material of particle.mesh.material) {
        material?.dispose?.();
      }
    } else {
      particle.mesh.material.dispose?.();
    }
  }
  mineBreakParticles.splice(index, 1);
}

function clearMineBreakParticles() {
  for (let index = mineBreakParticles.length - 1; index >= 0; index -= 1) {
    removeMineBreakParticleAt(index);
  }
}

function updateMineBreakParticles(deltaSeconds) {
  if (mineBreakParticles.length === 0 || deltaSeconds <= 0) {
    return;
  }

  for (let index = mineBreakParticles.length - 1; index >= 0; index -= 1) {
    const particle = mineBreakParticles[index];
    particle.life -= deltaSeconds;
    if (particle.life <= 0) {
      removeMineBreakParticleAt(index);
      continue;
    }

    particle.velocity.y -= MINE_DEBRIS_GRAVITY * deltaSeconds;
    particle.mesh.position.addScaledVector(particle.velocity, deltaSeconds);
    particle.mesh.rotation.x += particle.spin.x * deltaSeconds;
    particle.mesh.rotation.y += particle.spin.y * deltaSeconds;
    particle.mesh.rotation.z += particle.spin.z * deltaSeconds;
    particle.velocity.multiplyScalar(Math.max(0, 1 - deltaSeconds * MINE_DEBRIS_DRAG));

    const alpha = THREE.MathUtils.clamp(particle.life / Math.max(particle.maxLife, 1e-4), 0, 1);
    const material = particle.mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        if (item && 'opacity' in item) {
          item.opacity = alpha;
        }
      }
    } else if (material && 'opacity' in material) {
      material.opacity = alpha;
    }

    const shrink = 0.45 + (alpha * 0.55);
    particle.mesh.scale.setScalar(particle.baseScale * shrink);
  }
}

function breakVisualMineTarget(hit) {
  if (!hit?.object || !isBreakableMineTargetObject(hit.object)) {
    return false;
  }

  const sourceMaterial = resolveHitMaterial(hit);
  resolveMineHitPose(hit, mineBreakHitPosition, mineBreakHitNormal, mineBreakHitScale);
  mineBreakHitPosition.addScaledVector(mineBreakHitNormal, 0.05);

  const removed = hit.object.isInstancedMesh
    ? removeInstancedMeshInstance(hit.object, hit.instanceId)
    : (() => {
      if (!hit.object.isMesh || hit.object.userData?.mineVisualRemoved === true) {
        return false;
      }
      hit.object.userData.mineVisualRemoved = true;
      hit.object.visible = false;
      return true;
    })();

  if (!removed) {
    return false;
  }

  spawnMineBreakDebris({
    position: mineBreakHitPosition,
    normal: mineBreakHitNormal,
    scale: mineBreakHitScale,
    sourceMaterial
  });
  voxelRuntime?.setHoveredVoxel?.(null);
  return true;
}

function isGameRouteActive() {
  return window.location.hash === '#/game';
}

function asErrorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function compactPublicKey(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return '';
  }
  if (text.length <= 12) {
    return text;
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function sanitizeBopperMeta(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return '';
  }
  if (text.length <= 64) {
    return text;
  }
  return `${text.slice(0, 61)}...`;
}

function createNotificationBopperKey(prefix = 'notification') {
  notificationAutoId += 1;
  return `${prefix}-${Date.now().toString(36)}-${notificationAutoId.toString(36)}`;
}

function loadStoredRoomContext() {
  try {
    const raw = sessionStorage.getItem(ROOM_CONTEXT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const roomCode = typeof parsed.roomCode === 'string' ? parsed.roomCode.trim() : '';
    if (!roomCode) {
      return null;
    }
    const selectedModelPath = typeof parsed.selectedModelPath === 'string'
      ? parsed.selectedModelPath.trim()
      : '';
    return {
      roomCode,
      selectedModelPath: selectedModelPath || DEFAULT_PLAYER_MODEL_PATH
    };
  } catch {
    return null;
  }
}

function saveRoomContext(context) {
  if (!context?.roomCode) {
    return;
  }
  const payload = {
    roomCode: context.roomCode,
    selectedModelPath: context.selectedModelPath || DEFAULT_PLAYER_MODEL_PATH
  };
  try {
    sessionStorage.setItem(ROOM_CONTEXT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Session storage is best-effort.
  }
}

function clearStoredRoomContext() {
  try {
    sessionStorage.removeItem(ROOM_CONTEXT_STORAGE_KEY);
  } catch {
    // No-op.
  }
}

function getActiveGameplayGrid() {
  return activeMapData?.gameplayGrid || null;
}

function resolveMinePatchDims() {
  for (const target of mineHoverTargets) {
    const dims = target?.userData?.minePatchDims;
    if (!Array.isArray(dims) || dims.length < 3) {
      continue;
    }

    return [
      Math.max(1, Math.floor(Math.abs(Number(dims[0]) || 16))),
      Math.max(1, Math.floor(Math.abs(Number(dims[1]) || 8))),
      Math.max(1, Math.floor(Math.abs(Number(dims[2]) || 16)))
    ];
  }
  return [16, 8, 16];
}

function getMineCellYFromBitIndex(cellIndex, dims = resolveMinePatchDims()) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || !Array.isArray(dims) || dims.length < 3) {
    return -1;
  }
  const width = Math.max(1, Math.floor(Math.abs(Number(dims[0]) || 16)));
  const depth = Math.max(1, Math.floor(Math.abs(Number(dims[2]) || 16)));
  const layerSize = width * depth;
  if (!Number.isFinite(layerSize) || layerSize <= 0) {
    return -1;
  }
  return Math.floor(cellIndex / layerSize);
}

function isMineCellVisuallyExposedByDefault(cellIndex, dims = resolveMinePatchDims()) {
  return getMineCellYFromBitIndex(cellIndex, dims) === MINE_VISUAL_EXPOSED_LAYER_Y;
}

function resolveWinnerCellBitIndex() {
  if (!roomRuntime || latestWinnerState?.vrfFulfilled !== true || !Array.isArray(latestWinnerState?.winnerCell)) {
    return -1;
  }
  return roomRuntime.getCellIndex(latestWinnerState.winnerCell, resolveMinePatchDims());
}

function hideWinnerBlankBlockVisual() {
  if (winnerBlankBlockVisual) {
    winnerBlankBlockVisual.visible = false;
  }
}

function attachWinnerBlankBlockVisual() {
  if (!winnerBlankBlockVisual || !activeRuntimeState?.worldRoot) {
    return;
  }
  if (winnerBlankBlockVisual.parent === activeRuntimeState.worldRoot) {
    return;
  }
  winnerBlankBlockVisual.parent?.remove(winnerBlankBlockVisual);
  activeRuntimeState.worldRoot.add(winnerBlankBlockVisual);
}

function updateWinnerBlankBlockVisualFromEntry(entry) {
  if (!winnerBlankBlockVisual || !entry?.mesh || !entry?.originalMatrix) {
    hideWinnerBlankBlockVisual();
    return;
  }

  attachWinnerBlankBlockVisual();
  winnerBlankBlockWorldMatrix.multiplyMatrices(entry.mesh.matrixWorld, entry.originalMatrix);
  if (winnerBlankBlockVisual.parent) {
    winnerBlankBlockParentInverseMatrix.copy(winnerBlankBlockVisual.parent.matrixWorld).invert();
    winnerBlankBlockWorldMatrix.premultiply(winnerBlankBlockParentInverseMatrix);
  }
  winnerBlankBlockWorldMatrix.decompose(
    winnerBlankBlockWorldPosition,
    winnerBlankBlockWorldQuaternion,
    winnerBlankBlockWorldScale
  );

  winnerBlankBlockVisual.position.copy(winnerBlankBlockWorldPosition);
  winnerBlankBlockVisual.quaternion.copy(winnerBlankBlockWorldQuaternion);
  winnerBlankBlockVisual.scale.copy(winnerBlankBlockWorldScale);
  winnerBlankBlockVisual.visible = true;
}

async function ensureWinnerBlankBlockVisual() {
  if (winnerBlankBlockVisual) {
    attachWinnerBlankBlockVisual();
    return winnerBlankBlockVisual;
  }
  if (!winnerBlankBlockLoadPromise) {
    winnerBlankBlockLoadPromise = new Promise((resolve, reject) => {
      playerModelLoader.load(WINNER_BLANK_BLOCK_MODEL_PATH, resolve, undefined, reject);
    })
      .then((gltf) => {
        const visual = gltf.scene;
        visual.name = 'mine-winner-blank-block';
        visual.visible = false;
        visual.userData.mineVisualRemoved = true;
        visual.traverse((node) => {
          if (!node?.isMesh) {
            return;
          }
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
        });
        winnerBlankBlockVisual = visual;
        attachWinnerBlankBlockVisual();
        return winnerBlankBlockVisual;
      })
      .catch((error) => {
        console.warn('Failed to load winner blank block model:', WINNER_BLANK_BLOCK_MODEL_PATH, error);
        return null;
      });
  }
  return winnerBlankBlockLoadPromise;
}

function setMineVisualEntryVisible(entry, visible) {
  if (!entry || entry.visible === visible) {
    return false;
  }

  if (visible) {
    entry.mesh.setMatrixAt(entry.instanceId, entry.originalMatrix);
    entry.visible = true;
    return true;
  }

  mineBreakLastInstanceMatrix.copy(entry.originalMatrix);
  mineBreakLastInstanceMatrix.decompose(
    mineBreakHiddenInstancePosition,
    mineBreakHiddenInstanceQuaternion,
    mineBreakHiddenInstanceScale
  );
  mineBreakHiddenInstancePosition.y -= 4096;
  mineBreakLastInstanceMatrix.compose(
    mineBreakHiddenInstancePosition,
    mineBreakHiddenInstanceQuaternion,
    mineBreakHiddenInstanceScale
  );
  entry.mesh.setMatrixAt(entry.instanceId, mineBreakLastInstanceMatrix);
  entry.visible = false;
  return true;
}

function rebuildMineCellVisualIndex() {
  mineCellVisualEntries.length = 0;
  mineCellVisualByIndex.clear();

  for (const target of mineHoverTargets) {
    if (!target?.isInstancedMesh) {
      continue;
    }
    const cellIndices = target.userData?.minePatchCellIndices;
    if (!Array.isArray(cellIndices) || cellIndices.length === 0) {
      continue;
    }
    const count = Math.min(target.count, cellIndices.length);
    for (let index = 0; index < count; index += 1) {
      const cellIndex = Number(cellIndices[index]);
      if (!Number.isInteger(cellIndex) || cellIndex < 0) {
        continue;
      }
      const originalMatrix = new THREE.Matrix4();
      target.getMatrixAt(index, originalMatrix);
      const entry = {
        mesh: target,
        instanceId: index,
        cellIndex,
        originalMatrix,
        visible: true
      };
      mineCellVisualEntries.push(entry);
      if (!mineCellVisualByIndex.has(cellIndex)) {
        mineCellVisualByIndex.set(cellIndex, []);
      }
      mineCellVisualByIndex.get(cellIndex).push(entry);
    }
  }
}

function applyMineMaskToVisuals() {
  if (!roomRuntime || mineCellVisualEntries.length === 0) {
    hideWinnerBlankBlockVisual();
    return;
  }
  const changedMeshes = new Set();
  const minedMask = latestWinnerState?.minedMask || null;
  const revealedMask = latestPlayerRevealState?.revealedMask || null;
  const minePatchDims = resolveMinePatchDims();
  const winnerCellBitIndex = resolveWinnerCellBitIndex();
  const canRenderWinnerBlank = Boolean(winnerBlankBlockVisual);
  let winnerVisualEntry = null;

  for (const entry of mineCellVisualEntries) {
    const idx = entry.cellIndex;
    const mined = minedMask ? roomRuntime.maskBitSet(minedMask, idx) : false;
    const revealedByMask = revealedMask ? roomRuntime.maskBitSet(revealedMask, idx) : true;
    const revealed = revealedByMask || isMineCellVisuallyExposedByDefault(idx, minePatchDims);
    const optimisticMined = optimisticMinedCellIndexes.has(idx);
    const shouldBeVisible = revealed && !mined && !optimisticMined;
    const renderAsWinnerBlank = canRenderWinnerBlank
      && winnerCellBitIndex >= 0
      && idx === winnerCellBitIndex
      && shouldBeVisible;
    if (renderAsWinnerBlank && !winnerVisualEntry) {
      winnerVisualEntry = entry;
    }
    const shouldRenderDefaultMesh = shouldBeVisible && !renderAsWinnerBlank;
    if (setMineVisualEntryVisible(entry, shouldRenderDefaultMesh)) {
      changedMeshes.add(entry.mesh);
    }
  }

  for (const mesh of changedMeshes) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox?.();
    mesh.computeBoundingSphere?.();
  }

  if (winnerVisualEntry && winnerBlankBlockVisual) {
    updateWinnerBlankBlockVisualFromEntry(winnerVisualEntry);
  } else {
    hideWinnerBlankBlockVisual();
  }
}

function markOptimisticMineCell(cellIndex, enabled) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0) {
    return;
  }
  if (enabled) {
    optimisticMinedCellIndexes.add(cellIndex);
  } else {
    optimisticMinedCellIndexes.delete(cellIndex);
  }
  applyMineMaskToVisuals();
}

function trackOptimisticMinePending(cellIndex, signature = '') {
  if (!Number.isInteger(cellIndex) || cellIndex < 0) {
    return;
  }
  optimisticMinePendingByBitIndex.set(cellIndex, {
    startedAtMs: performance.now(),
    signature: typeof signature === 'string' ? signature : ''
  });
}

function clearOptimisticMinePending(cellIndex) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0) {
    return;
  }
  optimisticMinePendingByBitIndex.delete(cellIndex);
}

function rollbackExpiredOptimisticMines(nowMs = performance.now()) {
  if (optimisticMinePendingByBitIndex.size === 0) {
    return;
  }

  const timedOutCellIndexes = [];
  for (const [cellIndex, pending] of optimisticMinePendingByBitIndex.entries()) {
    const startedAtMs = Number(pending?.startedAtMs);
    if (!Number.isFinite(startedAtMs)) {
      optimisticMinePendingByBitIndex.delete(cellIndex);
      continue;
    }
    if ((nowMs - startedAtMs) >= MINE_CONFIRMATION_TIMEOUT_MS) {
      timedOutCellIndexes.push(cellIndex);
    }
  }

  if (timedOutCellIndexes.length === 0) {
    return;
  }

  for (const cellIndex of timedOutCellIndexes) {
    clearOptimisticMinePending(cellIndex);
    markOptimisticMineCell(cellIndex, false);
  }

  const restoredCount = timedOutCellIndexes.length;
  queueNotificationBopper(
    restoredCount === 1 ? 'Mine confirmation timed out.' : 'Mine confirmations timed out.',
    {
      tone: 'warning',
      meta: restoredCount === 1
        ? 'Block restored for retry'
        : `${restoredCount} blocks restored for retry`,
      ttlMs: 3600
    }
  );
}

function clearNotificationEntryTimers(entry) {
  if (!entry) {
    return;
  }
  if (entry.hideTimerId) {
    window.clearTimeout(entry.hideTimerId);
    entry.hideTimerId = 0;
  }
  if (entry.leaveTimerId) {
    window.clearTimeout(entry.leaveTimerId);
    entry.leaveTimerId = 0;
  }
}

function clearNotificationTimers() {
  for (const entry of notificationStack) {
    clearNotificationEntryTimers(entry);
  }
}

function resetNotificationBopper() {
  clearNotificationTimers();
  notificationStack.length = 0;
  if (!notificationBopper) {
    return;
  }
  notificationBopper.replaceChildren();
  notificationBopper.hidden = true;
}

function removeNotificationEntryByIndex(index) {
  if (index < 0 || index >= notificationStack.length) {
    return;
  }
  const [removed] = notificationStack.splice(index, 1);
  clearNotificationEntryTimers(removed);
}

function renderNotificationBopperStack() {
  if (!notificationBopper) {
    return;
  }

  if (!isGameRouteActive() || notificationStack.length === 0) {
    notificationBopper.replaceChildren();
    notificationBopper.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < notificationStack.length; index += 1) {
    const entry = notificationStack[index];
    const pill = document.createElement('div');
    pill.className = 'notification-bopper-pill';
    pill.dataset.tone = entry.tone;
    if (entry.leaving) {
      pill.classList.add('is-leaving');
    } else {
      pill.classList.add('is-visible');
    }
    pill.style.setProperty('--stack-opacity', String(Math.max(0.28, 1 - (index * 0.16))));

    const dot = document.createElement('span');
    dot.className = 'notification-bopper-pill-dot';
    dot.setAttribute('aria-hidden', 'true');
    pill.appendChild(dot);

    const copy = document.createElement('div');
    copy.className = 'notification-bopper-pill-copy';

    const label = document.createElement('p');
    label.className = 'notification-bopper-pill-label';
    label.textContent = entry.message;
    copy.appendChild(label);

    if (entry.meta) {
      const meta = document.createElement('p');
      meta.className = 'notification-bopper-pill-meta';
      meta.textContent = entry.meta;
      copy.appendChild(meta);
    }

    pill.appendChild(copy);
    fragment.appendChild(pill);
  }

  notificationBopper.replaceChildren(fragment);
  notificationBopper.hidden = false;
}

/**
 * @param {string} message
 * @param {{ tone?: 'info' | 'success' | 'warning' | 'danger', meta?: string, ttlMs?: number, key?: string }} [opts]
 * @returns {string}
 */
function queueNotificationBopper(message, opts = {}) {
  if (!notificationBopper || !isGameRouteActive()) {
    return '';
  }

  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  if (!normalizedMessage) {
    return '';
  }

  const tone = opts.tone === 'success' || opts.tone === 'warning' || opts.tone === 'danger'
    ? opts.tone
    : 'info';
  const ttlMsRaw = Number(opts.ttlMs);
  const ttlMs = Number.isFinite(ttlMsRaw)
    ? Math.max(900, Math.min(20000, Math.round(ttlMsRaw)))
    : 2800;
  const keyCandidate = typeof opts.key === 'string' ? opts.key.trim() : '';
  const key = keyCandidate || createNotificationBopperKey();
  const meta = sanitizeBopperMeta(opts.meta);

  let entry = notificationStack.find((item) => item.key === key) ?? null;
  if (entry) {
    clearNotificationEntryTimers(entry);
    entry.message = normalizedMessage;
    entry.meta = meta;
    entry.tone = tone;
    entry.ttlMs = ttlMs;
    entry.leaving = false;
  } else {
    entry = {
      key,
      message: normalizedMessage,
      meta,
      tone,
      ttlMs,
      leaving: false,
      hideTimerId: 0,
      leaveTimerId: 0
    };
    notificationStack.unshift(entry);
  }

  while (notificationStack.length > NOTIFICATION_STACK_LIMIT) {
    removeNotificationEntryByIndex(notificationStack.length - 1);
  }

  renderNotificationBopperStack();

  entry.hideTimerId = window.setTimeout(() => {
    entry.hideTimerId = 0;
    const activeEntry = notificationStack.find((item) => item.key === key);
    if (!activeEntry || activeEntry.leaving) {
      return;
    }
    activeEntry.leaving = true;
    renderNotificationBopperStack();
    activeEntry.leaveTimerId = window.setTimeout(() => {
      activeEntry.leaveTimerId = 0;
      const removeIndex = notificationStack.findIndex((item) => item.key === key);
      if (removeIndex >= 0) {
        removeNotificationEntryByIndex(removeIndex);
      }
      renderNotificationBopperStack();
    }, NOTIFICATION_LEAVE_MS);
  }, ttlMs);

  return key;
}

function clearMatchResultTimers() {
  if (matchResultCountdownTimer) {
    window.clearInterval(matchResultCountdownTimer);
    matchResultCountdownTimer = 0;
  }
  if (matchResultRedirectTimer) {
    window.clearTimeout(matchResultRedirectTimer);
    matchResultRedirectTimer = 0;
  }
}

function hideMatchResultOverlay() {
  clearMatchResultTimers();
  if (!matchResultOverlay) {
    return;
  }
  matchResultOverlay.classList.remove('is-visible', 'is-win', 'is-lose');
  matchResultOverlay.setAttribute('aria-hidden', 'true');
}

function resolveMatchOutcomeLabel(value, defaultToWin = true) {
  if (typeof value === 'boolean') {
    return value ? 'win' : 'lose';
  }

  if (typeof value !== 'string') {
    return defaultToWin ? 'win' : null;
  }

  const normalized = value.trim().toLowerCase();
  if (['win', 'winner', 'won', 'victory'].includes(normalized)) {
    return 'win';
  }
  if (['lose', 'loser', 'lost', 'defeat', 'defeated'].includes(normalized)) {
    return 'lose';
  }
  return defaultToWin ? 'win' : null;
}

function resolveMatchResultFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload?.is_winner === true || payload?.did_win === true || payload?.you_won === true) {
    return 'win';
  }
  if (payload?.is_winner === false || payload?.did_win === false || payload?.you_won === false) {
    return 'lose';
  }

  const wallet = walletGateway?.getState?.().publicKey;
  if (wallet && typeof payload.winnerPubkey === 'string') {
    return payload.winnerPubkey === wallet ? 'win' : 'lose';
  }
  if (wallet && typeof payload.winner_pubkey === 'string') {
    return payload.winner_pubkey === wallet ? 'win' : 'lose';
  }

  const winnerText = payload?.winner || payload?.outcome || payload?.result || payload?.status;
  return resolveMatchOutcomeLabel(winnerText, false);
}

function navigateToLobby() {
  if (gameRouter?.goToLobby) {
    gameRouter.goToLobby();
    return;
  }
  window.location.hash = '#/lobby';
}

function showMatchResultOverlay({ winner }) {
  const outcome = resolveMatchOutcomeLabel(winner, false);
  if (!outcome || !matchResultOverlay || !matchResultTitle) {
    return;
  }

  clearMatchResultTimers();
  if (isPointerLocked() && document.exitPointerLock) {
    document.exitPointerLock();
  }

  const isWin = outcome === 'win';
  matchResultOverlay.classList.remove('is-win', 'is-lose');
  matchResultOverlay.classList.add(isWin ? 'is-win' : 'is-lose');
  matchResultOverlay.setAttribute('aria-hidden', 'false');
  if (matchResultKicker) {
    matchResultKicker.textContent = 'MATCH RESULT';
  }
  matchResultTitle.textContent = isWin ? 'YOU WIN' : 'YOU LOSE';
  if (matchResultSubtitle) {
    matchResultSubtitle.textContent = 'Returning to lobby in';
  }
  if (matchResultCaption) {
    matchResultCaption.textContent = 'Showdown complete';
  }
  if (matchResultCountdownValueEl) {
    matchResultCountdownValueEl.textContent = '3';
  }

  void matchResultOverlay.offsetWidth;
  matchResultOverlay.classList.add('is-visible');

  matchResultCountdown = 3;
  if (matchResultCountdownValueEl) {
    matchResultCountdownValueEl.textContent = String(matchResultCountdown);
  }

  matchResultCountdownTimer = window.setInterval(() => {
    matchResultCountdown -= 1;
    if (matchResultCountdown <= 0) {
      hideMatchResultOverlay();
      matchResultRedirectTimer = window.setTimeout(() => {
        matchResultRedirectTimer = 0;
        navigateToLobby();
      }, 220);
      return;
    }
    if (matchResultCountdownValueEl) {
      matchResultCountdownValueEl.textContent = String(matchResultCountdown);
    }
  }, 1000);
}

function tryShowMatchResultFromStreamEvent(eventName, payload) {
  const resultEvent = ['match_end', 'match_result', 'game_end', 'game_over', 'winner_declared', 'finalized'];
  if (!resultEvent.includes(String(eventName || '').toLowerCase())) {
    return false;
  }

  const outcome = resolveMatchResultFromPayload(payload);
  if (!outcome) {
    return false;
  }

  showMatchResultOverlay({ winner: outcome });
  return true;
}

function setMeshShadowFlags(root, { castShadow, receiveShadow }) {
  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const hasVisibleMaterial = materials.some((material) => {
      if (!material) {
        return false;
      }
      if (material.transparent && Number(material.opacity) <= 0.02) {
        return false;
      }
      return true;
    });

    if (!hasVisibleMaterial) {
      node.castShadow = false;
      node.receiveShadow = false;
      return;
    }

    const forceCastShadow = typeof node.userData.forceCastShadow === 'boolean'
      ? node.userData.forceCastShadow
      : null;
    const forceReceiveShadow = typeof node.userData.forceReceiveShadow === 'boolean'
      ? node.userData.forceReceiveShadow
      : null;

    let nextCastShadow = forceCastShadow ?? castShadow;
    const nextReceiveShadow = forceReceiveShadow ?? receiveShadow;

    if (nextCastShadow && node.geometry?.type === 'PlaneGeometry') {
      // Thin planes tend to self-shadow into dark artifacts when used as large floors.
      nextCastShadow = false;
    }

    node.castShadow = nextCastShadow;
    node.receiveShadow = nextReceiveShadow;
  });
}

function createFallbackWorld() {
  const fallbackGround = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.MeshStandardMaterial({ color: 0x55745d, roughness: 0.95, metalness: 0.02 })
  );

  fallbackGround.rotation.x = -Math.PI / 2;
  fallbackGround.receiveShadow = true;
  scene.add(fallbackGround);
  colliders.push(fallbackGround);
}

function centerAndGroundModel(root) {
  root.updateMatrixWorld(true);
  playerModelBounds.setFromObject(root);
  if (playerModelBounds.isEmpty()) {
    return;
  }

  playerModelBounds.getCenter(playerModelCenter);
  playerModelMinPoint.set(0, playerModelBounds.min.y, 0);

  if (root.parent) {
    playerModelCenterLocal.copy(playerModelCenter);
    root.parent.worldToLocal(playerModelCenterLocal);
    playerModelMinLocal.copy(playerModelMinPoint);
    root.parent.worldToLocal(playerModelMinLocal);
    root.position.x -= playerModelCenterLocal.x;
    root.position.z -= playerModelCenterLocal.z;
    root.position.y -= playerModelMinLocal.y;
  } else {
    root.position.x -= playerModelCenter.x;
    root.position.z -= playerModelCenter.z;
    root.position.y -= playerModelBounds.min.y;
  }

  root.updateMatrixWorld(true);
}

function syncColliderFromPlayerModel(root) {
  root.updateMatrixWorld(true);
  playerModelBounds.setFromObject(root);
  if (playerModelBounds.isEmpty()) {
    return;
  }

  playerModelBounds.getSize(playerModelSize);
  const derivedRadius = Math.max(playerModelSize.x, playerModelSize.z) * 0.5;
  const derivedHeight = Math.max(playerModelSize.y, derivedRadius * 2 + 0.01);

  CONFIG.playerColliderRadius = Number(derivedRadius.toFixed(4));
  CONFIG.playerColliderHeight = Number(derivedHeight.toFixed(4));
}

function findRuntimeHeadNode(root) {
  let bestMatch = null;
  let bestScore = -Infinity;

  root.traverse((node) => {
    if (!node?.name) {
      return;
    }

    const normalizedName = String(node.name).trim().toLowerCase();
    if (!normalizedName) {
      return;
    }

    let score = -Infinity;
    if (normalizedName === 'head') {
      score = 20;
    } else if (normalizedName.endsWith('head') || normalizedName.startsWith('head')) {
      score = 14;
    } else if (normalizedName.includes('head')) {
      score = 10;
    } else if (normalizedName === 'neck' || normalizedName.includes('neck')) {
      score = 6;
    }

    if (!Number.isFinite(score)) {
      return;
    }

    if (node.isBone) {
      score += 2;
    }
    if (node.isMesh) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = node;
    }
  });

  return bestMatch;
}

function updateRuntimeHeadFromCamera() {
  firstPersonController.clampLookPitchToBounds();

  if (!runtimeHeadNode) {
    return;
  }

  const headPitch = -firstPersonController.getLookPitch();
  runtimeHeadPitchQuaternion.setFromAxisAngle(runtimeHeadPitchAxis, headPitch);
  runtimeHeadNode.quaternion.copy(runtimeHeadNeutralQuaternion).multiply(runtimeHeadPitchQuaternion);
  runtimeHeadNode.updateMatrixWorld(true);
}

function syncCameraToHeadAnchor() {
  const lookPitch = firstPersonController.getLookPitch();
  const crouchBlend = firstPersonController.getCrouchBlend();
  const headBobOffsetY = firstPersonController.getHeadBobOffsetY();
  camera.rotation.set(lookPitch, 0, 0);
  const crouchYOffset = -CONFIG.crouchCameraDrop * crouchBlend;
  const forwardOffset = CONFIG.cameraHeadForwardOffset;
  const localVerticalOffset = CONFIG.cameraHeadVerticalOffset + crouchYOffset + headBobOffsetY;
  const maxCameraAnchorZ = Math.max(0.08, CONFIG.playerColliderRadius * 0.45);
  const clampedAnchorZ = THREE.MathUtils.clamp(runtimeHeadAnchorZOffset, -maxCameraAnchorZ, maxCameraAnchorZ);
  const desiredCameraLocalZ = clampedAnchorZ - forwardOffset;
  const minForwardPlacement = -Math.max(0.18, CONFIG.playerColliderRadius * 0.4);
  const cameraLocalZ = Math.min(desiredCameraLocalZ, minForwardPlacement);

  const baseHeight = CONFIG.playerHeight + runtimeHeadAnchorYOffset;
  camera.position.set(0, baseHeight + localVerticalOffset, cameraLocalZ);
}

function sampleRuntimeHeadAnchorWorldPosition(outPosition) {
  if (!runtimeHeadNode) {
    return false;
  }

  runtimeHeadBounds.makeEmpty();
  runtimeHeadNode.updateWorldMatrix(true, true);

  runtimeHeadNode.traverse((node) => {
    if (!node?.isMesh || !node.geometry) {
      return;
    }

    if (!node.geometry.boundingBox) {
      node.geometry.computeBoundingBox();
    }

    if (!node.geometry.boundingBox) {
      return;
    }

    const meshBounds = node.geometry.boundingBox.clone();
    meshBounds.applyMatrix4(node.matrixWorld);
    runtimeHeadBounds.union(meshBounds);
  });

  if (!runtimeHeadBounds.isEmpty()) {
    runtimeHeadBounds.getCenter(runtimeHeadBoundsCenter);
    outPosition.copy(runtimeHeadBoundsCenter);
    outPosition.y = THREE.MathUtils.lerp(
      runtimeHeadBounds.min.y,
      runtimeHeadBounds.max.y,
      FIRST_PERSON_EYE_HEIGHT_RATIO
    );
    return true;
  }

  outPosition.setFromMatrixPosition(runtimeHeadNode.matrixWorld);
  return true;
}

function bindCameraToRuntimeHead() {
  runtimeHeadNode = runtimePlayerModel ? findRuntimeHeadNode(runtimePlayerModel) : null;
  firstPersonController.clampLookPitchToBounds();
  runtimeHeadAnchorYOffset = 0;
  runtimeHeadAnchorZOffset = 0;

  if (!runtimeHeadNode) {
    syncCameraToHeadAnchor();
    return;
  }

  const headPitch = -firstPersonController.getLookPitch();
  runtimeHeadPitchQuaternion.setFromAxisAngle(runtimeHeadPitchAxis, headPitch);
  runtimeHeadNeutralQuaternion.copy(runtimeHeadNode.quaternion);
  runtimeHeadNeutralQuaternion.multiply(runtimeHeadPitchQuaternion.invert());

  updateRuntimeHeadFromCamera();
  sampleRuntimeHeadAnchorWorldPosition(runtimeHeadWorldPosition);
  runtimeHeadLocalAnchor.copy(runtimeHeadWorldPosition);
  playerRig.worldToLocal(runtimeHeadLocalAnchor);
  runtimeHeadAnchorYOffset = runtimeHeadLocalAnchor.y - CONFIG.playerHeight;
  const maxCameraAnchorZ = Math.max(0.08, CONFIG.playerColliderRadius * 0.45);
  runtimeHeadAnchorZOffset = THREE.MathUtils.clamp(runtimeHeadLocalAnchor.z, -maxCameraAnchorZ, maxCameraAnchorZ);
  syncCameraToHeadAnchor();
}

function applyRuntimePlayerScale(nextScale) {
  const clampedScale = THREE.MathUtils.clamp(Number(nextScale) || 1, 0.1, 8);
  CONFIG.playerModelScale = clampedScale;

  if (!runtimePlayerModel) {
    return;
  }

  runtimePlayerModel.scale.setScalar(CONFIG.playerModelScale);
  playerVisualRoot.scale.set(1, firstPersonController.getIsCrouched() ? CONFIG.crouchHeight : 1, 1);
  centerAndGroundModel(runtimePlayerModel);
  syncColliderFromPlayerModel(runtimePlayerModel);
  bindCameraToRuntimeHead();
  syncCameraToHeadAnchor();
}

function setRuntimePlayerModelVisibility(visible) {
  if (runtimePlayerModel) {
    runtimePlayerModel.visible = visible;
  }
}

function collectFirstPersonOccluderMeshes(root) {
  runtimeFirstPersonHiddenMeshes.length = 0;
  const headOccluderTokens = ['head', 'neck', 'hat', 'helmet', 'hair'];

  root.traverse((node) => {
    if (!node?.isMesh || !node?.name) {
      return;
    }

    const normalizedName = String(node.name).trim().toLowerCase();
    if (headOccluderTokens.some((token) => normalizedName.includes(token))) {
      runtimeFirstPersonHiddenMeshes.push(node);
    }
  });
}

function setFirstPersonOccluderVisibility(visible) {
  for (const mesh of runtimeFirstPersonHiddenMeshes) {
    mesh.visible = visible;
  }
}

function setFirstPersonToolVisibility(visible) {
  firstPersonToolRoot.visible = Boolean(visible) && Boolean(runtimeFirstPersonPickaxe);
}

function setFirstPersonPickaxeEnergyPulse(intensity) {
  const clampedIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
  for (const material of firstPersonPickaxeEnergyMaterials) {
    if (!material || !('emissive' in material)) {
      continue;
    }

    material.emissive.setRGB(1, 0.58, 0.18);
    material.emissiveIntensity = clampedIntensity * 1.45;
  }
}

function smoothFirstPersonToolTexture(texture) {
  if (!texture) {
    return;
  }

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
}

function getNamedChild(root, includes, excludes = []) {
  let match = null;

  root.traverse((node) => {
    if (match || !node?.name) {
      return;
    }

    const normalized = node.name.toLowerCase();
    const hasAllIncludes = includes.every((segment) => normalized.includes(segment));
    const hasExcludedSegment = excludes.some((segment) => normalized.includes(segment));
    if (hasAllIncludes && !hasExcludedSegment) {
      match = node;
    }
  });

  return match;
}

function toLimbReference(node) {
  if (!node) {
    return null;
  }

  return {
    node,
    restRotation: node.quaternion.clone()
  };
}

function initializeRuntimePlayerLimbState(root) {
  runtimePlayerLimbState.leftArm = toLimbReference(getNamedChild(root, ['arm', 'left']));
  runtimePlayerLimbState.rightArm = toLimbReference(getNamedChild(root, ['arm', 'right']));
  runtimePlayerLimbState.leftLeg = toLimbReference(getNamedChild(root, ['leg', 'left']));
  runtimePlayerLimbState.rightLeg = toLimbReference(getNamedChild(root, ['leg', 'right']));
  runtimePlayerLimbState.walkCycleSeconds = 0;
}

function blendLimbSwing(limb, xRadians, deltaSeconds, blendSpeed = 12) {
  if (!limb?.node || !limb?.restRotation) {
    return;
  }

  limbOffsetEuler.set(xRadians, 0, 0);
  limbOffsetRotation.setFromEuler(limbOffsetEuler);
  limbTargetRotation.copy(limb.restRotation).multiply(limbOffsetRotation);

  const blendFactor = 1 - Math.exp(-Math.max(1, blendSpeed) * deltaSeconds);
  limb.node.quaternion.slerp(limbTargetRotation, blendFactor);
}

function updateRuntimePlayerWalkAnimation(deltaSeconds) {
  if (!runtimePlayerModel) {
    return;
  }

  const isMovingOnGround = firstPersonController.getMovementState().isMovingHorizontally
    && firstPersonController.getCanJump()
    && !editorModeEnabled;
  if (isMovingOnGround) {
    runtimePlayerLimbState.walkCycleSeconds += deltaSeconds * 10;
    const swing = Math.sin(runtimePlayerLimbState.walkCycleSeconds);
    const armForwardBias = THREE.MathUtils.degToRad(-30);

    blendLimbSwing(runtimePlayerLimbState.leftLeg, swing * THREE.MathUtils.degToRad(60), deltaSeconds, 20);
    blendLimbSwing(runtimePlayerLimbState.rightLeg, -swing * THREE.MathUtils.degToRad(60), deltaSeconds, 20);
    blendLimbSwing(
      runtimePlayerLimbState.leftArm,
      (-swing * THREE.MathUtils.degToRad(40)) + armForwardBias,
      deltaSeconds,
      20
    );
    blendLimbSwing(
      runtimePlayerLimbState.rightArm,
      (swing * THREE.MathUtils.degToRad(40)) + armForwardBias,
      deltaSeconds,
      20
    );
    return;
  }

  runtimePlayerLimbState.walkCycleSeconds = 0;
  blendLimbSwing(runtimePlayerLimbState.leftLeg, 0, deltaSeconds, 5);
  blendLimbSwing(runtimePlayerLimbState.rightLeg, 0, deltaSeconds, 5);
  blendLimbSwing(runtimePlayerLimbState.leftArm, THREE.MathUtils.degToRad(45), deltaSeconds, 5);
  blendLimbSwing(runtimePlayerLimbState.rightArm, THREE.MathUtils.degToRad(45), deltaSeconds, 5);
}

async function initializeRuntimePlayerModel() {
  try {
    const modelPath = selectedPlayerModelPath || DEFAULT_PLAYER_MODEL_PATH;
    const gltf = await new Promise((resolve, reject) => {
      playerModelLoader.load(modelPath, resolve, undefined, reject);
    });

    const model = gltf.scene;
    model.name = 'runtime-player-model';

    model.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      node.castShadow = true;
      node.receiveShadow = false;
      node.frustumCulled = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material) {
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        }
      }
    });

    playerVisualRoot.add(model);
    runtimePlayerModel = model;
    collectFirstPersonOccluderMeshes(runtimePlayerModel);
    initializeRuntimePlayerLimbState(runtimePlayerModel);
    applyRuntimePlayerScale(CONFIG.playerModelScale);
    setRuntimePlayerModelVisibility(false);
    setFirstPersonOccluderVisibility(false);
  } catch (error) {
    console.warn('Failed to load runtime player model:', selectedPlayerModelPath, error);
  }
}

function triggerFirstPersonPickaxeSwing() {
  firstPersonPickaxeSwingProgress = 0;
}

function initializeFirstPersonRightArmViewModelFromRuntimeModel() {
  if (runtimeFirstPersonArm?.parent) {
    runtimeFirstPersonArm.parent.remove(runtimeFirstPersonArm);
  }
  runtimeFirstPersonArm = null;
  runtimeFirstPersonArmRestQuaternion = null;

  if (!runtimePlayerModel) {
    return;
  }

  const sourceRightArm = getNamedChild(runtimePlayerModel, ['arm', 'right']);
  if (!sourceRightArm) {
    return;
  }

  const rightArm = sourceRightArm.clone(true);
  rightArm.name = 'runtime-first-person-right-arm';
  const rightArmRestQuaternion = rightArm.quaternion.clone();

  const detachedNodes = [];
  rightArm.traverse((node) => {
    const normalizedName = String(node?.name || '').trim().toLowerCase();
    if (
      node !== rightArm
      && normalizedName
      && (normalizedName.includes('tool') || normalizedName.includes('pickaxe') || normalizedName.includes('weapon'))
    ) {
      detachedNodes.push(node);
      return;
    }

    if (!node?.isMesh) {
      return;
    }

    node.castShadow = false;
    node.receiveShadow = false;
    node.frustumCulled = false;
    node.renderOrder = 1002;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }
      material.side = THREE.DoubleSide;
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  });
  for (const node of detachedNodes) {
    node.parent?.remove(node);
  }

  rightArm.position.set(0, 0, 0);
  rightArm.rotation.set(0, 0, 0);
  rightArm.scale.set(1, 1, 1);
  rightArm.updateMatrixWorld(true);

  firstPersonArmBounds.setFromObject(rightArm);
  if (!firstPersonArmBounds.isEmpty()) {
    firstPersonArmBounds.getCenter(firstPersonArmCenter);
    firstPersonArmBounds.getSize(firstPersonArmSize);

    rightArm.position.sub(firstPersonArmCenter);
    const largestDimension = Math.max(firstPersonArmSize.x, firstPersonArmSize.y, firstPersonArmSize.z, 1e-4);
    const normalizedScale = firstPersonArmTargetSize / largestDimension;
    rightArm.scale.setScalar(normalizedScale);
  }

  rightArm.position.add(firstPersonArmBasePosition);
  firstPersonArmAnimatedEuler.set(
    firstPersonArmBaseEuler.x,
    firstPersonArmBaseEuler.y,
    firstPersonArmBaseEuler.z,
    firstPersonArmBaseEuler.order
  );
  firstPersonArmPoseQuaternion.setFromEuler(firstPersonArmAnimatedEuler);
  rightArm.quaternion.copy(firstPersonArmPoseQuaternion).multiply(rightArmRestQuaternion);

  runtimeFirstPersonArm = rightArm;
  runtimeFirstPersonArmRestQuaternion = rightArmRestQuaternion.clone();
  firstPersonToolRoot.add(runtimeFirstPersonArm);
}

function getAggressiveMineSwingMotion(progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let offsetX = 0;
  let offsetY = 0;
  let offsetZ = 0;
  let energy = 0;

  if (t < 0.38) {
    // Wind-up: readable raise phase before impact.
    const phase = t / 0.38;
    const eased = THREE.MathUtils.smootherstep(phase, 0, 1);
    pitch = THREE.MathUtils.lerp(0, THREE.MathUtils.degToRad(66), eased);
    yaw = THREE.MathUtils.lerp(0, THREE.MathUtils.degToRad(-30), eased);
    roll = THREE.MathUtils.lerp(0, THREE.MathUtils.degToRad(30), eased);
    offsetX = THREE.MathUtils.lerp(0, -0.052, eased);
    offsetY = THREE.MathUtils.lerp(0, 0.212, eased);
    offsetZ = THREE.MathUtils.lerp(0, 0.108, eased);
  } else if (t < 0.72) {
    // Strike: big downward chop with stronger follow-through.
    const phase = (t - 0.38) / (0.72 - 0.38);
    const eased = phase ** 1.85;
    pitch = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(66), THREE.MathUtils.degToRad(-132), eased);
    yaw = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(-30), THREE.MathUtils.degToRad(36), eased);
    roll = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(-72), eased);
    offsetX = THREE.MathUtils.lerp(-0.052, 0.076, eased);
    offsetY = THREE.MathUtils.lerp(0.212, -0.246, eased);
    offsetZ = THREE.MathUtils.lerp(0.108, -0.176, eased);
    energy = THREE.MathUtils.smoothstep(phase, 0.08, 1);
  } else {
    // Recovery: settle back to idle.
    const phase = (t - 0.72) / (1 - 0.72);
    const eased = THREE.MathUtils.smootherstep(phase, 0, 1);
    pitch = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(-132), 0, eased);
    yaw = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(36), 0, eased);
    roll = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(-72), 0, eased);
    offsetX = THREE.MathUtils.lerp(0.076, 0, eased);
    offsetY = THREE.MathUtils.lerp(-0.246, 0, eased);
    offsetZ = THREE.MathUtils.lerp(-0.176, 0, eased);
    energy = THREE.MathUtils.lerp(1, 0, phase);
  }

  return { pitch, yaw, roll, offsetX, offsetY, offsetZ, energy };
}

function updateFirstPersonPickaxeViewModel(deltaSeconds, nowSeconds, gameplayActive) {
  if (!runtimeFirstPersonPickaxe) {
    setFirstPersonPickaxeEnergyPulse(0);
    return;
  }

  setFirstPersonToolVisibility(gameplayActive && !editorModeEnabled);
  if (!firstPersonToolRoot.visible) {
    setFirstPersonPickaxeEnergyPulse(0);
    return;
  }

  if (firstPersonPickaxeSwingProgress < 1) {
    const clampedDeltaSeconds = Math.min(deltaSeconds, 1 / 24);
    firstPersonPickaxeSwingProgress = Math.min(
      1,
      firstPersonPickaxeSwingProgress + (clampedDeltaSeconds * MINE_SWING_PROGRESS_SPEED)
    );
  }

  const moveState = firstPersonController.getMovementState();
  const movementAmplitude = THREE.MathUtils.clamp(moveState.speedNormalized, 0, 1);
  const swayX = Math.sin(
    nowSeconds * (MINE_SWAY_X_FREQ_BASE + movementAmplitude * MINE_SWAY_X_FREQ_MOVEMENT)
  ) * (MINE_SWAY_X_BASE + movementAmplitude * MINE_SWAY_X_MOVEMENT);
  const swayY = Math.cos(
    nowSeconds * (MINE_SWAY_Y_FREQ_BASE + movementAmplitude * MINE_SWAY_Y_FREQ_MOVEMENT)
  ) * (MINE_SWAY_Y_BASE + movementAmplitude * MINE_SWAY_Y_MOVEMENT);
  const swing = getAggressiveMineSwingMotion(firstPersonPickaxeSwingProgress);
  const energyJitter = swing.energy * Math.sin(nowSeconds * MINE_SWING_JITTER_FREQ) * MINE_SWING_JITTER_AMOUNT;

  firstPersonToolRoot.position.set(
    firstPersonToolBasePosition.x + swayX + swing.offsetX + energyJitter,
    firstPersonToolBasePosition.y + swayY + swing.offsetY - Math.abs(energyJitter * 0.8),
    firstPersonToolBasePosition.z + swing.offsetZ
  );

  firstPersonToolAnimatedEuler.set(
    firstPersonToolBaseEuler.x + swing.pitch,
    firstPersonToolBaseEuler.y + swing.yaw,
    firstPersonToolBaseEuler.z + swing.roll + (energyJitter * 12),
    firstPersonToolBaseEuler.order
  );
  firstPersonToolRoot.rotation.set(
    firstPersonToolAnimatedEuler.x,
    firstPersonToolAnimatedEuler.y,
    firstPersonToolAnimatedEuler.z,
    firstPersonToolAnimatedEuler.order
  );

  if (runtimeFirstPersonArm) {
    runtimeFirstPersonArm.position.set(
      firstPersonArmBasePosition.x + (swing.offsetX * 0.46),
      firstPersonArmBasePosition.y + (swing.offsetY * 0.34),
      firstPersonArmBasePosition.z + (swing.offsetZ * 0.3)
    );
    firstPersonArmAnimatedEuler.set(
      firstPersonArmBaseEuler.x + (swing.pitch * 0.34),
      firstPersonArmBaseEuler.y + (swing.yaw * 0.28),
      firstPersonArmBaseEuler.z + (swing.roll * 0.22),
      firstPersonArmBaseEuler.order
    );
    firstPersonArmPoseQuaternion.setFromEuler(firstPersonArmAnimatedEuler);
    if (runtimeFirstPersonArmRestQuaternion) {
      runtimeFirstPersonArm.quaternion
        .copy(firstPersonArmPoseQuaternion)
        .multiply(runtimeFirstPersonArmRestQuaternion);
    } else {
      runtimeFirstPersonArm.quaternion.copy(firstPersonArmPoseQuaternion);
    }
  }

  setFirstPersonPickaxeEnergyPulse(swing.energy);
}

async function initializeFirstPersonPickaxeViewModel() {
  try {
    const gltf = await new Promise((resolve, reject) => {
      playerModelLoader.load(FIRST_PERSON_PICKAXE_MODEL_PATH, resolve, undefined, reject);
    });

    const pickaxe = gltf.scene;
    pickaxe.name = 'runtime-first-person-pickaxe';
    firstPersonPickaxeEnergyMaterials.length = 0;
    pickaxe.traverse((node) => {
      if (!node?.isMesh) {
        return;
      }

      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
      node.renderOrder = 1000;

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) {
          continue;
        }

        // Preserve correct self-occlusion on the viewmodel mesh.
        material.depthTest = true;
        material.depthWrite = false;
        if ('map' in material && material.map) {
          smoothFirstPersonToolTexture(material.map);
        }
        if ('emissiveMap' in material && material.emissiveMap) {
          smoothFirstPersonToolTexture(material.emissiveMap);
        }
        if ('normalMap' in material && material.normalMap) {
          smoothFirstPersonToolTexture(material.normalMap);
        }
        if ('emissive' in material) {
          material.emissive.setRGB(1, 0.58, 0.18);
          material.emissiveIntensity = 0;
          if (!firstPersonPickaxeEnergyMaterials.includes(material)) {
            firstPersonPickaxeEnergyMaterials.push(material);
          }
        }
        material.needsUpdate = true;
      }
    });

    firstPersonToolRoot.clear();
    runtimeFirstPersonArm = null;
    runtimeFirstPersonArmRestQuaternion = null;
    runtimeFirstPersonPickaxe = pickaxe;
    firstPersonToolRoot.add(runtimeFirstPersonPickaxe);
    const pickaxeRelativeScale = firstPersonPickaxeWorldScale / Math.max(firstPersonToolBaseScale, 1e-4);
    runtimeFirstPersonPickaxe.scale.setScalar(pickaxeRelativeScale);
    initializeFirstPersonRightArmViewModelFromRuntimeModel();
    firstPersonToolRoot.position.copy(firstPersonToolBasePosition);
    firstPersonToolRoot.rotation.set(
      firstPersonToolBaseEuler.x,
      firstPersonToolBaseEuler.y,
      firstPersonToolBaseEuler.z,
      firstPersonToolBaseEuler.order
    );
    firstPersonToolRoot.scale.setScalar(firstPersonToolBaseScale);
    setFirstPersonPickaxeEnergyPulse(0);
    setFirstPersonToolVisibility(!editorModeEnabled);
  } catch (error) {
    console.warn('Failed to load first-person pickaxe model:', FIRST_PERSON_PICKAXE_MODEL_PATH, error);
  }
}

function refreshMineHoverTargets() {
  mineHoverTargets.length = 0;
  mineCellVisualEntries.length = 0;
  mineCellVisualByIndex.clear();
  if (!activeRuntimeState?.worldRoot) {
    hideWinnerBlankBlockVisual();
    return;
  }

  attachWinnerBlankBlockVisual();
  activeRuntimeState.worldRoot.traverse((node) => {
    if (
      (!node?.isInstancedMesh && !node?.isMesh)
      || node?.userData?.minePatchHoverTarget !== true
      || node?.userData?.mineVisualRemoved === true
      || node?.visible === false
    ) {
      return;
    }
    mineHoverTargets.push(node);
  });

  rebuildMineCellVisualIndex();
  applyMineMaskToVisuals();
}

async function applyMap(nextMapData) {
  activeMapData = normalizeMapData(nextMapData);
  clearMineBreakParticles();
  const spawnPosition = activeMapData.spawnPreset?.position;
  if (Array.isArray(spawnPosition) && spawnPosition.length >= 3) {
    playerSpawnPosition.set(
      Number(spawnPosition[0]) || 0,
      Number(spawnPosition[1]) || 0,
      Number(spawnPosition[2]) || 0
    );
  }
  playerSpawnYaw = Number(activeMapData.spawnPreset?.yaw) || 0;
  applyRuntimePlayerScale(activeMapData.playerPreset?.scale ?? 1);

  activeRuntimeState = await applyMapManifestData(scene, playerRig, colliders, {
    mapData: activeMapData,
    camera,
    config: CONFIG,
    setMeshShadowFlags,
    runtimeState: activeRuntimeState
  });
  CONFIG.maxPitch = Math.min(CONFIG.maxPitch, CONFIG.maxPitchDownLimit);
  firstPersonController.clampLookPitchToBounds();

  syncBlockworldVisualStyle();

  if (editorBridge?.setContext) {
    editorBridge.setContext(activeMapData, activeRuntimeState);
  }

  CONFIG.fovNormal = camera.fov;

  mineZones = getMineZoneAabbs(activeRuntimeState);
  if (voxelRuntime) {
    voxelRuntime.setMineZones(mineZones);
  }
  void ensureWinnerBlankBlockVisual().then(() => {
    applyMineMaskToVisuals();
  });
  refreshMineHoverTargets();

  firstPersonController.setSpawn(playerSpawnPosition, playerSpawnYaw);
  firstPersonController.resetToSpawn();
  firstPersonController.resetSprintState();
  bindCameraToRuntimeHead();
  updateRuntimeHeadFromCamera();
  syncCameraToHeadAnchor();
  return {
    mapData: activeMapData,
    runtimeState: activeRuntimeState
  };
}

async function initializeWorld() {
  if (atmosphereRuntime?.dispose) {
    atmosphereRuntime.dispose();
  }
  atmosphereRuntime = createAtmosphereRuntime({ scene, renderer });
  atmosphereRuntime.setViewportSize?.(window.innerWidth, window.innerHeight);
  voxelRuntime = createVoxelRuntime({ scene });
  syncBlockworldVisualStyle();

  try {
    const manifest = await loadMapManifest(CONFIG.mapManifestPath);
    await applyMap(manifest);
  } catch (error) {
    console.error('Failed to load map manifest. Falling back to debug world:', error);
    createFallbackWorld();
  }

  await initializeRuntimePlayerModel();
  await initializeFirstPersonPickaxeViewModel();
  createOrUpdateRoomRuntime();
  if (walletGateway?.getState?.().connected) {
    subscribeToActiveRoom();
  } else {
    renderStreamStatus('Disconnected');
  }
}

function resetInputState() {
  inputState.fwdPressed = false;
  inputState.bkdPressed = false;
  inputState.lftPressed = false;
  inputState.rgtPressed = false;
  inputState.spacePressed = false;
  inputState.shiftPressed = false;
}

function setEditorModeActive(enabled) {
  editorModeEnabled = enabled;
  setRuntimePlayerModelVisibility(false);
  setFirstPersonOccluderVisibility(false);
  setFirstPersonToolVisibility(!enabled);

  if (enabled) {
    if (isPointerLocked() && document.exitPointerLock) {
      document.exitPointerLock();
    }

    resetInputState();
    firstPersonController.handleGameplayInactive();
    firstPersonController.clearVelocity();
  }

  if (!enabled) {
    bindCameraToRuntimeHead();
    updateRuntimeHeadFromCamera();
    syncCameraToHeadAnchor();
  }

  onPointerLockChange();
}

async function mountDevEditorIfEnabled() {
  if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_EDITOR === '1')) {
    return;
  }

  if (!activeRuntimeState || !activeMapData) {
    console.warn('Skipping dev editor mount because map runtime state is unavailable.');
    return;
  }

  try {
    const { mountEditor } = await import('./dev/editorBootstrap.js');

    editorBridge = mountEditor({
      scene,
      camera,
      playerRig,
      renderer,
      colliders,
      mapData: activeMapData,
      getRuntimeState: () => activeRuntimeState,
      setEditorActive: setEditorModeActive,
      getConfig: () => CONFIG,
      setPlayerScale: (nextScale) => applyRuntimePlayerScale(nextScale),
      applyImportedMap: async (nextMapData) => applyMap(nextMapData)
    });
  } catch (error) {
    console.error('Dev editor bootstrap failed:', error);
  }
}

// ---------------------------------------------
// Wallet connector (IC-001 surface implementation)
// ---------------------------------------------
function setWalletActionInFlight(inFlight) {
  walletActionInFlight = inFlight;

  if (walletConnectButton) {
    walletConnectButton.disabled = inFlight;
  }
  if (walletDisconnectButton) {
    walletDisconnectButton.disabled = inFlight;
  }
  if (walletSelect) {
    walletSelect.disabled = inFlight;
  }
}

function renderWalletOptions(walletState) {
  if (!walletSelect || !walletState) {
    return;
  }

  const selectedBefore = walletSelect.value;
  walletSelect.innerHTML = '';

  for (const wallet of walletState.wallets) {
    const option = document.createElement('option');
    option.value = wallet.name;

    let suffix = '';
    if (wallet.connectable) {
      suffix = wallet.installed ? 'Installed' : 'Loadable';
    } else if (wallet.readyState) {
      suffix = wallet.readyState;
    }

    option.textContent = suffix ? `${wallet.name} (${suffix})` : wallet.name;
    option.disabled = !wallet.connectable;
    option.selected = wallet.name === walletState.selectedWalletName;
    walletSelect.appendChild(option);
  }

  if (!walletState.selectedWalletName && selectedBefore) {
    walletSelect.value = selectedBefore;
  }
}

function renderWalletState(walletState) {
  if (!walletState) {
    return;
  }

  renderWalletOptions(walletState);

  if (walletRpcValue) {
    walletRpcValue.textContent = walletState.rpcEndpoint || '--';
  }

  if (walletAddressValue) {
    walletAddressValue.textContent = walletState.connected ? walletState.publicKey : '--';
    walletAddressValue.title = walletState.connected ? walletState.publicKey : '';
  }

  if (walletStatusValue) {
    if (walletState.connecting) {
      walletStatusValue.textContent = walletState.disconnecting ? 'Disconnecting...' : 'Connecting...';
    } else if (walletState.connected) {
      walletStatusValue.textContent = `Connected (${walletState.connectedWalletName})`;
    } else if (walletState.error) {
      walletStatusValue.textContent = walletState.error;
    } else {
      walletStatusValue.textContent = 'Disconnected';
    }
  }

  const noConnectableWallets = walletState.wallets.every((wallet) => !wallet.connectable);

  if (walletConnectButton) {
    walletConnectButton.disabled =
      walletActionInFlight || walletState.connecting || walletState.connected || noConnectableWallets;
    walletConnectButton.textContent = walletState.connecting
      ? (walletState.disconnecting ? 'Disconnecting...' : 'Connecting...')
      : 'Connect';
  }

  if (walletDisconnectButton) {
    walletDisconnectButton.disabled = walletActionInFlight || walletState.connecting || !walletState.connected;
  }

  if (walletState.error && walletState.error !== previousWalletError) {
    queueNotificationBopper('Wallet error.', {
      tone: 'danger',
      meta: walletState.error,
      ttlMs: 4200
    });
  }

  if (previousWalletConnected !== null && previousWalletConnected !== walletState.connected) {
    if (walletState.connected) {
      queueNotificationBopper('Wallet connected.', {
        tone: 'success',
        meta: walletState.publicKeyShort || compactPublicKey(walletState.publicKey)
      });
    } else {
      queueNotificationBopper('Wallet disconnected.', {
        tone: 'warning',
        meta: 'Session signed out'
      });
    }
  }

  previousWalletConnected = Boolean(walletState.connected);
  previousWalletError = walletState.error || '';
}

function resolveWalletNetwork() {
  const raw = String(import.meta.env.VITE_SOLANA_NETWORK || 'devnet').trim().toLowerCase();
  if (raw === 'mainnet' || raw === 'mainnet-beta') {
    return 'mainnet-beta';
  }
  if (raw === 'testnet') {
    return 'testnet';
  }
  return 'devnet';
}

function resolveWalletRpcEndpoint() {
  const raw = String(import.meta.env.VITE_SOLANA_RPC_URL || '').trim();
  return raw || undefined;
}

async function initializeWalletConnector() {
  if (walletStatusValue) {
    walletStatusValue.textContent = 'Loading connectors...';
  }

  try {
    const { createWalletGateway } = await import('./wallet/walletGateway.js');

    walletGateway = createWalletGateway({
      network: resolveWalletNetwork(),
      rpcEndpoint: resolveWalletRpcEndpoint(),
      persistSelection: true
    });

    walletStateUnsubscribe = walletGateway.onChange((walletState) => {
      renderWalletState(walletState);
      if (walletState.connected) {
        createOrUpdateRoomRuntime();
        subscribeToActiveRoom();
      } else {
        stopRoomSubscriptions();
      }
    });

    if (walletSelect) {
      walletSelect.addEventListener('change', (event) => {
        const nextSelection = event.target.value;
        walletGateway?.setSelectedWallet(nextSelection);
      });
    }

    if (walletConnectButton) {
      walletConnectButton.addEventListener('click', async () => {
        if (!walletGateway || walletActionInFlight) {
          return;
        }

        const requestedWallet = walletSelect?.value || undefined;

        setWalletActionInFlight(true);
        try {
          if (isPointerLocked() && document.exitPointerLock) {
            document.exitPointerLock();
          }

          await walletGateway.connect(requestedWallet);
        } catch (error) {
          console.error('Wallet connect failed:', error);
          queueNotificationBopper('Wallet connect failed.', {
            tone: 'danger',
            meta: asErrorText(error),
            ttlMs: 4200
          });
        } finally {
          setWalletActionInFlight(false);
        }
      });
    }

    if (walletDisconnectButton) {
      walletDisconnectButton.addEventListener('click', async () => {
        if (!walletGateway || walletActionInFlight) {
          return;
        }

        setWalletActionInFlight(true);
        try {
          await walletGateway.disconnect();
        } catch (error) {
          console.error('Wallet disconnect failed:', error);
          queueNotificationBopper('Wallet disconnect failed.', {
            tone: 'danger',
            meta: asErrorText(error),
            ttlMs: 4200
          });
        } finally {
          setWalletActionInFlight(false);
        }
      });
    }
  } catch (error) {
    console.error('Wallet connector bootstrap failed:', error);
    queueNotificationBopper('Wallet connector failed.', {
      tone: 'danger',
      meta: asErrorText(error),
      ttlMs: 4200
    });
    if (walletStatusValue) {
      walletStatusValue.textContent = 'Connector bootstrap failed';
    }
  }
}

function teardownWalletConnector() {
  stopRoomSubscriptions();
  resetNotificationBopper();
  if (walletStateUnsubscribe) {
    walletStateUnsubscribe();
    walletStateUnsubscribe = null;
  }

  if (walletGateway) {
    walletGateway.destroy().catch((error) => {
      console.warn('Wallet connector teardown failed:', error);
    });
    walletGateway = null;
  }
}

function renderStreamStatus(text) {
  if (streamStatusValue) {
    streamStatusValue.textContent = text;
  }
}

function deriveRoomLifecycleStatusText() {
  if (!activeRoomCode) {
    return 'No room selected';
  }
  const shortCode = compactPublicKey(activeRoomCode);
  return `${roomLifecycleState} (${shortCode})`;
}

function isGameplayLifecycleActive() {
  return roomLifecycleState === 'Active';
}

function isRoomWaitLifecycleState(state) {
  return state === 'Lobby' || state === 'WaitingForOpponent' || state === 'WaitingForVrf';
}

function setRoomWaitOverlayVisible(visible) {
  if (!roomWaitOverlay) {
    return;
  }
  roomWaitOverlay.classList.toggle('is-visible', visible);
  roomWaitOverlay.hidden = !visible;
  roomWaitOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function syncRoomWaitOverlay() {
  if (!roomWaitOverlay) {
    return;
  }

  const shouldShow = isGameRouteActive()
    && Boolean(activeRoomCode)
    && isRoomWaitLifecycleState(roomLifecycleState);
  if (!shouldShow) {
    setRoomWaitOverlayVisible(false);
    return;
  }

  const walletPubkey = walletGateway?.getState?.().publicKey || '';
  const roomCreator = latestRoomSharedState?.creatorBase58 || activeRoomCode;
  const isCreator = walletPubkey && roomCreator && walletPubkey === roomCreator;
  const canCancel = roomLifecycleState === 'WaitingForOpponent' && isCreator;

  if (roomLifecycleState === 'WaitingForOpponent') {
    if (roomWaitStateLabel) {
      roomWaitStateLabel.textContent = 'WAITING FOR PLAYER';
    }
    if (roomWaitMeta) {
      roomWaitMeta.textContent = 'Share this room code with your opponent to begin.';
    }
  } else if (roomLifecycleState === 'WaitingForVrf') {
    if (roomWaitStateLabel) {
      roomWaitStateLabel.textContent = 'WAITING FOR VRF';
    }
    if (roomWaitMeta) {
      roomWaitMeta.textContent = 'Opponent joined. Finalizing winner cell and match activation.';
    }
  } else {
    if (roomWaitStateLabel) {
      roomWaitStateLabel.textContent = 'SYNCING ROOM';
    }
    if (roomWaitMeta) {
      roomWaitMeta.textContent = 'Loading current on-chain room state...';
    }
  }

  if (roomWaitCode) {
    roomWaitCode.textContent = activeRoomCode;
  }

  if (roomWaitCancelButton) {
    roomWaitCancelButton.hidden = !canCancel;
    roomWaitCancelButton.disabled = roomCancelInFlight;
    roomWaitCancelButton.textContent = roomCancelInFlight ? 'Cancelling...' : 'Cancel Room';
  }

  setRoomWaitOverlayVisible(true);
}

async function onRoomWaitCancelClick() {
  if (roomCancelInFlight || !roomRuntime || !activeRoomCode) {
    return;
  }

  if (roomLifecycleState !== 'WaitingForOpponent') {
    return;
  }

  const walletPubkey = walletGateway?.getState?.().publicKey || '';
  const roomCreator = latestRoomSharedState?.creatorBase58 || activeRoomCode;
  if (!walletPubkey || walletPubkey !== roomCreator) {
    queueNotificationBopper('Only the creator can cancel this room.', {
      tone: 'warning'
    });
    return;
  }

  roomCancelInFlight = true;
  syncRoomWaitOverlay();
  try {
    await roomRuntime.cancelRoomPrejoin(activeRoomCode);
    if (isPointerLocked() && document.exitPointerLock) {
      document.exitPointerLock();
    }
    queueNotificationBopper('Room cancelled.', {
      tone: 'success',
      meta: 'Returned to lobby'
    });
    activeRoomCode = '';
    clearStoredRoomContext();
    stopRoomSubscriptions();
    navigateToLobby();
  } catch (error) {
    queueNotificationBopper('Cancel room failed.', {
      tone: 'danger',
      meta: asErrorText(error),
      ttlMs: 4200
    });
  } finally {
    roomCancelInFlight = false;
    syncRoomWaitOverlay();
    onPointerLockChange();
  }
}

function stopRoomSubscriptions() {
  if (roomSubscriptionDispose) {
    roomSubscriptionDispose();
    roomSubscriptionDispose = null;
  }
  latestRoomSharedState = null;
  latestWinnerState = null;
  latestPlayerRevealState = null;
  optimisticMinedCellIndexes.clear();
  optimisticMinePendingByBitIndex.clear();
  roomLifecycleState = 'Lobby';
  roomLifecycleActionInFlight = false;
  sessionEnsureInFlight = false;
  roomCancelInFlight = false;
  hideWinnerBlankBlockVisual();
  applyMineMaskToVisuals();
  syncRoomWaitOverlay();
  renderStreamStatus(activeRoomCode ? deriveRoomLifecycleStatusText() : 'Disconnected');
  roomRuntime?.clearSession?.();
}

function parseMineFailure(error) {
  const text = asErrorText(error);
  const normalized = text.toLowerCase();
  if (normalized.includes('cannot mine before room is active')
    || normalized.includes('invalidstatus')
    || normalized.includes('0x1770')) {
    return 'Mine rejected: room is not Active yet.';
  }
  if (normalized.includes('invalidcoordinate') || normalized.includes('0x1776')) {
    return 'Mine rejected: coordinate out of range.';
  }
  if (normalized.includes('cellalreadymined') || normalized.includes('0x1777')) {
    return 'Mine rejected: coordinate already mined.';
  }
  if (normalized.includes('unauthorized') || normalized.includes('0x1772')) {
    return 'Mine rejected: unauthorized caller/session.';
  }
  if (normalized.includes('invalidsessiontoken') || normalized.includes('0x177a')) {
    return 'Mine rejected: session expired, retrying.';
  }
  return text;
}

function isAlreadyJoinedError(error) {
  const normalized = asErrorText(error).toLowerCase();
  return normalized.includes('alreadyjoined') || normalized.includes('0x1775');
}

function parseLifecycleFailure(error) {
  const text = asErrorText(error);
  const normalized = text.toLowerCase();
  if (normalized.includes('network mismatch')
    || normalized.includes('wrong network')
    || normalized.includes('chain mismatch')) {
    return 'Wallet network mismatch. Ensure wallet and app are both on Devnet.';
  }
  return text;
}

async function runLifecycleAutomationIfNeeded() {
  if (roomLifecycleActionInFlight || !roomRuntime || !activeRoomCode || !latestRoomSharedState) {
    return;
  }
  const wallet = walletGateway?.getState?.().publicKey;
  if (!wallet) {
    return;
  }
  const room = latestRoomSharedState;
  const isWinner = room.winnerBase58 === wallet;
  const isParticipant = room.playerOneBase58 === wallet || room.playerTwoBase58 === wallet;

  if (room.status === 'WaitingForVrf' && isParticipant) {
    roomLifecycleActionInFlight = true;
    try {
      queueNotificationBopper('Delegating room state…', { tone: 'info', meta: 'base layer' });
      await roomRuntime.delegatePrivateState(activeRoomCode);
      queueNotificationBopper('Requesting winner VRF…', { tone: 'info', meta: 'ER router' });
      await roomRuntime.requestWinnerVrf(activeRoomCode);
      queueNotificationBopper('VRF request submitted.', { tone: 'success' });
    } catch (error) {
      queueNotificationBopper('Room activation failed.', {
        tone: 'danger',
        meta: parseLifecycleFailure(error),
        ttlMs: 4200
      });
    } finally {
      roomLifecycleActionInFlight = false;
    }
    return;
  }

  if (room.status === 'Won' && isWinner) {
    roomLifecycleActionInFlight = true;
    try {
      queueNotificationBopper('Finalizing win…', { tone: 'info', meta: 'ER finalize' });
      await roomRuntime.finalizeWin(activeRoomCode);
      await roomRuntime.processUndelegation(activeRoomCode);
      await roomRuntime.settleWinPayout(activeRoomCode);
      queueNotificationBopper('Payout settled on base layer.', {
        tone: 'success',
        meta: 'two-phase flow complete'
      });
      roomRuntime.clearSession();
    } catch (error) {
      queueNotificationBopper('Settlement step failed.', {
        tone: 'danger',
        meta: parseLifecycleFailure(error),
        ttlMs: 4200
      });
    } finally {
      roomLifecycleActionInFlight = false;
    }
  }
}

function handleRoomStateUpdate(nextState) {
  if (!nextState || typeof nextState !== 'object') {
    return;
  }
  if (nextState.error) {
    renderStreamStatus(`Error: ${nextState.error}`);
    syncRoomWaitOverlay();
    onPointerLockChange();
    return;
  }

  latestRoomSharedState = nextState.roomShared || latestRoomSharedState;
  latestWinnerState = nextState.winnerState || latestWinnerState;
  latestPlayerRevealState = nextState.playerReveal || latestPlayerRevealState;
  roomLifecycleState = nextState.lifecycleState || roomLifecycleState;

  if (latestWinnerState?.minedMask) {
    for (const idx of [...optimisticMinedCellIndexes]) {
      if (roomRuntime.maskBitSet(latestWinnerState.minedMask, idx)) {
        optimisticMinedCellIndexes.delete(idx);
        optimisticMinePendingByBitIndex.delete(idx);
      }
    }
  }

  applyMineMaskToVisuals();
  syncRoomWaitOverlay();
  onPointerLockChange();
  renderStreamStatus(deriveRoomLifecycleStatusText());

  if (
    roomLifecycleState === 'Active'
    && latestRoomSharedState
    && roomRuntime
    && !sessionEnsureInFlight
    && !roomRuntime.hasActiveSession()
  ) {
    const wallet = walletGateway?.getState?.().publicKey;
    const isParticipant = wallet
      && (latestRoomSharedState.playerOneBase58 === wallet
      || latestRoomSharedState.playerTwoBase58 === wallet);
    if (isParticipant) {
      sessionEnsureInFlight = true;
      roomRuntime.ensureMiningSession()
        .then(() => {
          queueNotificationBopper('Session key ready.', {
            tone: 'success',
            meta: 'Wallet-free mining enabled'
          });
        })
        .catch((error) => {
          queueNotificationBopper('Session key setup failed.', {
            tone: 'danger',
            meta: asErrorText(error),
            ttlMs: 3600
          });
        })
        .finally(() => {
          sessionEnsureInFlight = false;
        });
    }
  }

  if (roomLifecycleState === 'PayoutSettled' && latestRoomSharedState) {
    const wallet = walletGateway?.getState?.().publicKey;
    const winnerOutcome = wallet && latestRoomSharedState.winnerBase58 === wallet ? 'win' : 'lose';
    showMatchResultOverlay({ winner: winnerOutcome });
    activeRoomCode = '';
    clearStoredRoomContext();
    roomRuntime?.clearSession?.();
  }

  void runLifecycleAutomationIfNeeded();
}

function createOrUpdateRoomRuntime() {
  if (!walletGateway) {
    return;
  }

  roomRuntime = createRoomRuntime({
    walletGateway,
    programId: CONFIG.mineDuelProgramId,
    erRpcUrl: CONFIG.erRpcUrl,
    erWsUrl: CONFIG.erWsUrl
  });
}

function subscribeToActiveRoom() {
  if (!roomRuntime || !activeRoomCode) {
    renderStreamStatus('No room selected');
    syncRoomWaitOverlay();
    onPointerLockChange();
    return;
  }

  const wallet = walletGateway?.getState?.();
  if (!wallet?.connected || !wallet.publicKey) {
    renderStreamStatus('Connect wallet to subscribe');
    syncRoomWaitOverlay();
    onPointerLockChange();
    return;
  }

  stopRoomSubscriptions();
  roomSubscriptionDispose = roomRuntime.subscribeRoom({
    roomCode: activeRoomCode,
    localPlayer: wallet.publicKey,
    onState: handleRoomStateUpdate
  });
  syncRoomWaitOverlay();
  onPointerLockChange();
  renderStreamStatus(`Subscribing (${compactPublicKey(activeRoomCode)})`);
}

// ---------------------------------------------
// Controls and input
// ---------------------------------------------
function isPointerLocked() {
  return document.pointerLockElement === document.body;
}

function onPointerLockChange() {
  if (isPointerLocked() && !editorModeEnabled && !isGameplayLifecycleActive() && document.exitPointerLock) {
    document.exitPointerLock();
    return;
  }

  const gameplayActive = isPointerLocked() && !editorModeEnabled && isGameplayLifecycleActive();
  const roomWaitVisible = Boolean(roomWaitOverlay?.classList.contains('is-visible'));
  blocker.style.display = gameplayActive || editorModeEnabled || roomWaitVisible ? 'none' : 'flex';
  if (crosshair) {
    crosshair.hidden = !gameplayActive;
  }
  if (!gameplayActive) {
    voxelRuntime?.setHoveredVoxel?.(null);
  }
  if (!gameplayActive) {
    firstPersonController.handleGameplayInactive();
  }
}

function requestPointerLock() {
  if (!editorModeEnabled && !isGameplayLifecycleActive()) {
    syncRoomWaitOverlay();
    return;
  }
  if (document.body.requestPointerLock) {
    document.body.requestPointerLock();
  }
}

function onMouseMove(event) {
  if (!isPointerLocked()) {
    return;
  }

  firstPersonController.setToward(event.movementX, event.movementY, CONFIG.mouseLookSpeed);
}

async function submitOnChainMineFromHit(visualHit) {
  if (!roomRuntime || !activeRoomCode) {
    queueNotificationBopper('Mine unavailable.', {
      tone: 'warning',
      meta: 'Create or join a room first'
    });
    return;
  }

  const gameplayCell = resolveGameplayCellFromHit(visualHit);
  if (!gameplayCell?.inBounds) {
    queueNotificationBopper('Mine rejected.', {
      tone: 'warning',
      meta: 'Target is outside gameplay grid'
    });
    return;
  }

  const sourceMaterial = resolveHitMaterial(visualHit);
  resolveMineHitPose(visualHit, mineBreakHitPosition, mineBreakHitNormal, mineBreakHitScale);
  mineBreakHitPosition.addScaledVector(mineBreakHitNormal, 0.05);
  const mineNotificationKey = createNotificationBopperKey('mine');

  queueNotificationBopper('Sending mine tx…', {
    key: mineNotificationKey,
    tone: 'info',
    meta: 'ER router',
    ttlMs: MINE_PENDING_NOTIFICATION_TTL_MS
  });

  let mineResult = null;
  try {
    mineResult = await roomRuntime.mine(activeRoomCode, gameplayCell);
  } catch (error) {
    queueNotificationBopper('Mine failed.', {
      key: mineNotificationKey,
      tone: 'danger',
      meta: parseMineFailure(error),
      ttlMs: 3600
    });
    return;
  }

  const bitIndex = Number(mineResult?.bitIndex);
  if (Number.isInteger(bitIndex) && bitIndex >= 0) {
    markOptimisticMineCell(bitIndex, true);
    trackOptimisticMinePending(bitIndex, mineResult?.signature || '');
  }

  spawnMineBreakDebris({
    position: mineBreakHitPosition,
    normal: mineBreakHitNormal,
    scale: mineBreakHitScale,
    sourceMaterial
  });

  try {
    const confirmation = await mineResult.confirmation;
    if (confirmation?.value?.err) {
      throw new Error(JSON.stringify(confirmation.value.err));
    }
    clearOptimisticMinePending(bitIndex);
    queueNotificationBopper('Mine tx approved.', {
      key: mineNotificationKey,
      tone: 'success',
      ttlMs: 2800,
      meta: mineResult?.signature ? compactPublicKey(mineResult.signature) : 'confirmed'
    });
  } catch (error) {
    clearOptimisticMinePending(bitIndex);
    if (Number.isInteger(bitIndex) && bitIndex >= 0) {
      markOptimisticMineCell(bitIndex, false);
    }
    queueNotificationBopper('Mine rejected.', {
      key: mineNotificationKey,
      tone: 'danger',
      meta: parseMineFailure(error),
      ttlMs: 3600
    });
  }
}

function onMouseDown(event) {
  if (!isPointerLocked() || editorModeEnabled || !isGameplayLifecycleActive()) {
    return;
  }

  if (event.button === 2) {
    firstPersonController.setZoomed(true);
    return;
  }

  if (event.button !== 0) {
    return;
  }

  triggerFirstPersonPickaxeSwing();

  const nowMs = performance.now();
  if (nowMs - lastMineAtMs < MINE_BREAK_COOLDOWN_MS) {
    return;
  }
  lastMineAtMs = nowMs;

  const visualHit = getMineCenterRaycastHit(camera, MINE_BREAK_MAX_DISTANCE);
  if (!visualHit) {
    return;
  }

  void submitOnChainMineFromHit(visualHit);
}

function onMouseUp(event) {
  if (event.button === 2) {
    firstPersonController.setZoomed(false);
  }
}

function onContextMenu(event) {
  if (isPointerLocked()) {
    event.preventDefault();
  }
}

function onInstructionsKeydown(event) {
  if (event.code === 'Enter' || event.code === 'Space') {
    event.preventDefault();
    requestPointerLock();
  }
}

function onKeyDown(event) {
  if (editorModeEnabled && !isPointerLocked()) {
    return;
  }

  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      inputState.fwdPressed = true;
      break;

    case 'ArrowLeft':
    case 'KeyA':
      inputState.lftPressed = true;
      break;

    case 'ArrowDown':
    case 'KeyS':
      inputState.bkdPressed = true;
      break;

    case 'ArrowRight':
    case 'KeyD':
      inputState.rgtPressed = true;
      break;

    case 'ShiftLeft':
    case 'ShiftRight':
      inputState.shiftPressed = true;
      break;

    case 'KeyC':
    case 'ControlLeft':
    case 'ControlRight':
      if (CONFIG.holdToCrouch) {
        firstPersonController.setCrouched(true);
      } else if (event.repeat !== true) {
        firstPersonController.setCrouched(!firstPersonController.getIsCrouched());
      }
      break;

    case 'Space':
      inputState.spacePressed = true;
      firstPersonController.requestJump();
      event.preventDefault();
      break;

    default:
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      inputState.fwdPressed = false;
      break;

    case 'ArrowLeft':
    case 'KeyA':
      inputState.lftPressed = false;
      break;

    case 'ArrowDown':
    case 'KeyS':
      inputState.bkdPressed = false;
      break;

    case 'ArrowRight':
    case 'KeyD':
      inputState.rgtPressed = false;
      break;

    case 'ShiftLeft':
    case 'ShiftRight':
      inputState.shiftPressed = false;
      break;

    case 'KeyC':
    case 'ControlLeft':
    case 'ControlRight':
      if (CONFIG.holdToCrouch) {
        firstPersonController.setCrouched(false);
      }
      break;

    case 'Space':
      inputState.spacePressed = false;
      break;

    default:
      break;
  }
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (postProcessRuntime?.setSize) {
    postProcessRuntime.setSize(width, height);
  }
  if (atmosphereRuntime?.setViewportSize) {
    atmosphereRuntime.setViewportSize(width, height);
  }

  if (editorBridge?.onResize) {
    editorBridge.onResize(width, height);
  }
}

function bindEvents() {
  if (eventsBound) {
    return;
  }
  instructions.addEventListener('click', requestPointerLock);
  instructions.addEventListener('keydown', onInstructionsKeydown);
  roomWaitCancelButton?.addEventListener('click', onRoomWaitCancelClick);

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', onResize);
  window.addEventListener('beforeunload', teardownWalletConnector);
  eventsBound = true;
}

// ---------------------------------------------
// Per-frame update
// ---------------------------------------------
function updateFpsCounter(deltaMs) {
  fpsFrames += 1;
  fpsWindowMs += deltaMs;

  if (fpsWindowMs >= CONFIG.fpsUpdateIntervalMs) {
    const fps = Math.round((fpsFrames * 1000) / fpsWindowMs);
    fpsValue.textContent = String(fps);
    fpsFrames = 0;
    fpsWindowMs = 0;
  }
}

function updateHoveredMineVoxel(cameraRef, gameplayActive) {
  if (!voxelRuntime?.setHoveredVoxel) {
    return;
  }

  if (!gameplayActive) {
    voxelRuntime.setHoveredVoxel(null);
    return;
  }

  const hoveredVoxel = voxelRuntime.raycastMine(cameraRef, MINE_BREAK_MAX_DISTANCE);
  if (hoveredVoxel) {
    voxelRuntime.setHoveredVoxel(hoveredVoxel);
    return;
  }

  if (!voxelRuntime.setHoveredBlockMeshTarget || mineHoverTargets.length === 0) {
    voxelRuntime.setHoveredVoxel(null);
    return;
  }

  mineHoverRaycaster.far = MINE_BREAK_MAX_DISTANCE;
  mineHoverRaycaster.setFromCamera(mineHoverPointerNdc, cameraRef);
  const hits = mineHoverRaycaster.intersectObjects(mineHoverTargets, false);
  const firstHit = hits[0];
  if (!firstHit?.object) {
    voxelRuntime.setHoveredVoxel(null);
    return;
  }
  if (!firstHit.object.geometry) {
    voxelRuntime.setHoveredVoxel(null);
    return;
  }

  if (firstHit.object.isInstancedMesh && Number.isInteger(firstHit.instanceId)) {
    firstHit.object.getMatrixAt(firstHit.instanceId, mineHoverInstanceMatrix);
    mineHoverWorldMatrix.multiplyMatrices(firstHit.object.matrixWorld, mineHoverInstanceMatrix);
  } else {
    mineHoverWorldMatrix.copy(firstHit.object.matrixWorld);
  }

  voxelRuntime.setHoveredBlockMeshTarget({
    geometry: firstHit.object.geometry,
    matrixWorld: mineHoverWorldMatrix
  });
}

function animate() {
  const nowMs = performance.now();
  const rawDeltaSeconds = (nowMs - prevTimeMs) / 1000;
  const deltaSeconds = Math.min(rawDeltaSeconds, CONFIG.maxDeltaSeconds);
  const gameplayActive = isPointerLocked() && !editorModeEnabled && isGameplayLifecycleActive();

  updateFpsCounter(deltaSeconds * 1000);
  firstPersonController.update(deltaSeconds, { gameplayActive });

  if (gameplayActive) {
    fixedStepAccumulator = Math.min(fixedStepAccumulator + deltaSeconds, CONFIG.fixedTimeStep * CONFIG.maxFixedStepsPerFrame);
    let steps = 0;
    while (fixedStepAccumulator >= CONFIG.fixedTimeStep && steps < CONFIG.maxFixedStepsPerFrame) {
      firstPersonController.fixedUpdate(CONFIG.fixedTimeStep, { gameplayActive: true });
      fixedStepAccumulator -= CONFIG.fixedTimeStep;
      steps += 1;
    }
  } else {
    fixedStepAccumulator = 0;
    firstPersonController.resetMovementState();
  }

  if (editorBridge?.update) {
    editorBridge.update(deltaSeconds);
  }
  updateRuntimePlayerWalkAnimation(deltaSeconds);
  updateFirstPersonPickaxeViewModel(deltaSeconds, nowMs * 0.001, gameplayActive);
  updateMineBreakParticles(deltaSeconds);
  rollbackExpiredOptimisticMines(nowMs);
  updateRuntimeHeadFromCamera();
  syncCameraToHeadAnchor();
  atmosphereRuntime?.update({
    timeSeconds: nowMs * 0.001,
    focusPosition: playerRig.position
  });

  const renderCamera = editorBridge?.getRenderCamera ? editorBridge.getRenderCamera() : camera;
  updateHoveredMineVoxel(renderCamera, gameplayActive);

  prevTimeMs = nowMs;
  if (postProcessRuntime?.render) {
    postProcessRuntime.render(renderCamera, { timeSeconds: nowMs * 0.001 });
  } else {
    renderer.render(scene, renderCamera);
  }
}

async function startGame() {
  if (!activeRoomCode) {
    renderStreamStatus('No room selected');
    syncRoomWaitOverlay();
    return;
  }
  resetNotificationBopper();
  bindEvents();
  await initializeWorld();
  if (postProcessRuntime?.dispose) {
    postProcessRuntime.dispose();
  }
  postProcessRuntime = createPostProcessRuntime({ renderer, scene, camera });
  postProcessRuntime.setSize(window.innerWidth, window.innerHeight);
  syncBlockworldVisualStyle();
  await mountDevEditorIfEnabled();
  firstPersonController.setSpawn(playerSpawnPosition, playerSpawnYaw);
  firstPersonController.resetToSpawn();
  syncRoomWaitOverlay();
  onPointerLockChange();
  queueNotificationBopper('Notification bopper online.', {
    tone: 'info',
    meta: 'Bottom-right game alerts ready'
  });
  renderStreamStatus(deriveRoomLifecycleStatusText());
  renderer.setAnimationLoop(animate);
}

async function bootstrap() {
  const { initRouter } = await import('./router.js');
  const { mountLobby } = await import('./views/lobby.js');
  const storedRoomContext = loadStoredRoomContext();
  if (storedRoomContext) {
    activeRoomCode = storedRoomContext.roomCode;
    selectedPlayerModelPath = storedRoomContext.selectedModelPath;
  }

  await initializeWalletConnector();
  createOrUpdateRoomRuntime();

  /**
   * @param {string | undefined} nextModelPath
   */
  function setSelectedPlayerModelPath(nextModelPath) {
    const normalized = typeof nextModelPath === 'string' ? nextModelPath.trim() : '';
    selectedPlayerModelPath = normalized || DEFAULT_PLAYER_MODEL_PATH;
  }

  async function handleCreateRoom({ stakeSol, selectedModelPath }) {
    if (!walletGateway?.getState?.().connected) {
      throw new Error('Connect wallet first.');
    }
    setSelectedPlayerModelPath(selectedModelPath);
    createOrUpdateRoomRuntime();
    if (!roomRuntime) {
      throw new Error('Gameplay runtime unavailable.');
    }

    const stakeValue = Number(stakeSol);
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      throw new Error('Stake must be greater than zero.');
    }
    const stakeLamports = Math.max(1, Math.round(stakeValue * 1_000_000_000));
    const created = await roomRuntime.createRoom(stakeLamports);
    activeRoomCode = created.roomCode;
    saveRoomContext({
      roomCode: activeRoomCode,
      selectedModelPath
    });

    queueNotificationBopper('Room created on chain.', {
      tone: 'success',
      meta: compactPublicKey(activeRoomCode)
    });

    return {
      roomCode: activeRoomCode
    };
  }

  async function handleEnterGame({ roomCode, selectedModelPath }) {
    const roomCodeText = typeof roomCode === 'string' ? roomCode.trim() : '';
    if (!roomCodeText) {
      throw new Error('Room code is required.');
    }
    if (!walletGateway?.getState?.().connected) {
      throw new Error('Connect wallet first.');
    }

    setSelectedPlayerModelPath(selectedModelPath);
    createOrUpdateRoomRuntime();
    if (!roomRuntime) {
      throw new Error('Gameplay runtime unavailable.');
    }

    const walletPubkey = walletGateway.getState().publicKey;
    const preJoinState = await roomRuntime.fetchRoomState(roomCodeText, walletPubkey);
    if (!preJoinState.roomShared) {
      throw new Error('Room not found on chain.');
    }

    const isParticipantBeforeJoin = preJoinState.roomShared.playerOneBase58 === walletPubkey
      || preJoinState.roomShared.playerTwoBase58 === walletPubkey;
    const roomHasOpponent = preJoinState.roomShared.playerTwoBase58
      && preJoinState.roomShared.playerTwoBase58 !== '11111111111111111111111111111111';

    if (walletPubkey !== roomCodeText && !isParticipantBeforeJoin) {
      if (roomHasOpponent) {
        throw new Error('Wallet is not a participant in this room.');
      }
      try {
        await roomRuntime.joinRoom(roomCodeText);
      } catch (error) {
        if (!isAlreadyJoinedError(error)) {
          const existing = await roomRuntime.fetchRoomState(roomCodeText, walletPubkey);
          const isParticipantOnRetry = existing.roomShared
            && (existing.roomShared.playerOneBase58 === walletPubkey
              || existing.roomShared.playerTwoBase58 === walletPubkey);
          if (!isParticipantOnRetry) {
            throw error;
          }
        } else {
          const existing = await roomRuntime.fetchRoomState(roomCodeText, walletPubkey);
          if (existing.roomShared?.playerTwoBase58 !== walletPubkey) {
            throw error;
          }
        }
      }
    }

    const state = await roomRuntime.fetchRoomState(roomCodeText, walletPubkey);
    if (!state.roomShared) {
      throw new Error('Room not found on chain.');
    }
    const isParticipant = state.roomShared.playerOneBase58 === walletPubkey
      || state.roomShared.playerTwoBase58 === walletPubkey;
    if (!isParticipant) {
      throw new Error('Wallet is not a participant in this room.');
    }

    activeRoomCode = roomCodeText;
    saveRoomContext({
      roomCode: activeRoomCode,
      selectedModelPath
    });
  }

  const router = initRouter({
    onLobby() {
      hideMatchResultOverlay();
      setRoomWaitOverlayVisible(false);
      resetNotificationBopper();
      stopRoomSubscriptions();
      mountLobby({
        walletGateway,
        initialRoomCode: activeRoomCode,
        initialSelectedModelPath: selectedPlayerModelPath,
        async onCreateRoom(payload) {
          const created = await handleCreateRoom(payload);
          return created;
        },
        async onEnterGame(payload) {
          await handleEnterGame(payload);
          gameRouter?.goToGame?.();
        }
      });
    },
    onGame() {
      hideMatchResultOverlay();
      syncRoomWaitOverlay();
      if (!walletGateway?.getState?.().connected) {
        window.location.hash = '#/lobby';
        return;
      }
      if (!activeRoomCode) {
        const restored = loadStoredRoomContext();
        if (restored?.roomCode) {
          activeRoomCode = restored.roomCode;
          setSelectedPlayerModelPath(restored.selectedModelPath);
        } else {
          window.location.hash = '#/lobby';
          return;
        }
      }
      void startGame();
    }
  });
  gameRouter = router;
}

bootstrap();
