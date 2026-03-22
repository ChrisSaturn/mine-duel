import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  DEFAULT_MAP_MANIFEST_PATH,
  applyMapData as applyMapManifestData,
  getMineZoneAabbs,
  loadMapManifest,
  normalizeMapData
} from './runtime/mapRuntime.js';
import { createAtmosphereRuntime } from './runtime/atmosphereRuntime.js';
import {
  DEFAULT_BLOCKWORLD_BIOME,
  getBlockworldPostProcessStyle,
  normalizeBlockworldBiome
} from './runtime/blockworldStyleRuntime.js';
import { createFirstPersonControllerRuntime } from './runtime/firstPersonControllerRuntime.js';
import { createPostProcessRuntime } from './runtime/postProcessRuntime.js';
import { createStreamRuntime } from './runtime/streamRuntime.js';
import { createVoxelRuntime } from './runtime/voxelRuntime.js';

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
const notificationBopperLabel = document.getElementById('notification-bopper-label');
const notificationBopperMeta = document.getElementById('notification-bopper-meta');
const matchResultOverlay = document.getElementById('match-result-overlay');
const matchResultKicker = document.getElementById('match-result-kicker');
const matchResultTitle = document.getElementById('match-result-title');
const matchResultSubtitle = document.getElementById('match-result-subtitle');
const matchResultCountdownValueEl = document.getElementById('match-result-countdown-value');
const matchResultCaption = document.getElementById('match-result-caption');

// ---------------------------------------------
// Runtime config (single source of truth)
// ---------------------------------------------
const perRuntimeEnabledByEnv =
  String(import.meta.env.VITE_ENABLE_MANAGED_PER || '').trim() === '1'
  || String(import.meta.env.VITE_ENABLE_WORLD_STREAM_GATEWAY || '').trim() === '1';
const perRuntimeUrlOverride = String(
  import.meta.env.VITE_PER_RUNTIME_URL
  || import.meta.env.VITE_WORLD_STREAM_GATEWAY_URL
  || '',
).trim();
const streamRuntimeEnabled = perRuntimeEnabledByEnv || perRuntimeUrlOverride.length > 0;
const resolvedRuntimeBaseUrl = perRuntimeUrlOverride;

const CONFIG = {
  mapManifestPath: DEFAULT_MAP_MANIFEST_PATH,
  streamRuntimeEnabled,
  runtimeBaseUrl: resolvedRuntimeBaseUrl,
  worldProfileId: String(
    import.meta.env.VITE_WORLD_PROFILE_ID
    || '82584d6e51c64b90caafbfc1e59b95fade51ba8e1ed606604064d2366bd88f11',
  ),
  mineDuelProgramId: String(import.meta.env.VITE_MINE_DUEL_PROGRAM_ID || 'HFmWxe7HufHuygGS5j9ZRKdHwZtXdWWz6iDccH6x4VBq'),
  playerHeight: 1.62,
  walkSpeed: 5,
  sprintSpeed: 7,
  maxVelocityChange: 10,
  gravity: -9.81,
  jumpVelocity: 5,
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

const cameraDirection = new THREE.Vector3();
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
const mineBreakDebrisVelocity = new THREE.Vector3();
const mineBreakParticleGeometry = new THREE.BoxGeometry(1, 1, 1);
const mineBreakHiddenInstancePosition = new THREE.Vector3();
const mineBreakHiddenInstanceQuaternion = new THREE.Quaternion();
const mineBreakHiddenInstanceScale = new THREE.Vector3();
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
let streamRuntime = null;
let mineZones = [];
const mineHoverTargets = [];
const mineBreakParticles = [];
let lastMineAtMs = 0;
let streamRunning = false;
let streamResyncInFlight = false;
let atmosphereRuntime = null;
let postProcessRuntime = null;
const notificationQueue = [];
let notificationHideTimerId = 0;
let notificationLeaveTimerId = 0;
let notificationBopperShowing = false;
let matchResultCountdownTimer = 0;
let matchResultCountdown = 0;
let matchResultRedirectTimer = 0;
let gameRouter = null;
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

function clearNotificationTimers() {
  if (notificationHideTimerId) {
    window.clearTimeout(notificationHideTimerId);
    notificationHideTimerId = 0;
  }
  if (notificationLeaveTimerId) {
    window.clearTimeout(notificationLeaveTimerId);
    notificationLeaveTimerId = 0;
  }
}

function resetNotificationBopper() {
  notificationQueue.length = 0;
  notificationBopperShowing = false;
  clearNotificationTimers();
  if (!notificationBopper) {
    return;
  }
  notificationBopper.hidden = true;
  notificationBopper.classList.remove('is-visible', 'is-leaving');
  notificationBopper.dataset.tone = 'info';
}

function dismissNotificationBopper() {
  if (!notificationBopper || !notificationBopperShowing) {
    return;
  }

  notificationBopperShowing = false;
  if (notificationHideTimerId) {
    window.clearTimeout(notificationHideTimerId);
    notificationHideTimerId = 0;
  }

  notificationBopper.classList.remove('is-visible');
  notificationBopper.classList.add('is-leaving');
  notificationLeaveTimerId = window.setTimeout(() => {
    notificationLeaveTimerId = 0;
    if (!notificationBopper) {
      return;
    }
    notificationBopper.hidden = true;
    notificationBopper.classList.remove('is-leaving');
    maybeShowNextNotificationBopper();
  }, 220);
}

function maybeShowNextNotificationBopper() {
  if (!notificationBopper || !notificationBopperLabel) {
    return;
  }
  if (notificationBopperShowing || notificationLeaveTimerId || notificationQueue.length === 0) {
    return;
  }
  if (!isGameRouteActive()) {
    notificationQueue.length = 0;
    return;
  }

  const next = notificationQueue.shift();
  if (!next) {
    return;
  }

  notificationBopperShowing = true;
  notificationBopper.dataset.tone = next.tone;
  notificationBopperLabel.textContent = next.message;
  if (notificationBopperMeta) {
    notificationBopperMeta.textContent = next.meta;
  }

  notificationBopper.classList.remove('is-leaving', 'is-visible');
  notificationBopper.hidden = false;
  void notificationBopper.offsetWidth;
  notificationBopper.classList.add('is-visible');
  notificationHideTimerId = window.setTimeout(() => {
    notificationHideTimerId = 0;
    dismissNotificationBopper();
  }, next.ttlMs);
}

/**
 * @param {string} message
 * @param {{ tone?: 'info' | 'success' | 'warning' | 'danger', meta?: string, ttlMs?: number }} [opts]
 */
function queueNotificationBopper(message, opts = {}) {
  if (!notificationBopper || !notificationBopperLabel) {
    return;
  }

  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  if (!normalizedMessage) {
    return;
  }

  const tone = opts.tone === 'success' || opts.tone === 'warning' || opts.tone === 'danger'
    ? opts.tone
    : 'info';
  const ttlMsRaw = Number(opts.ttlMs);
  const ttlMs = Number.isFinite(ttlMsRaw)
    ? Math.max(900, Math.min(10000, Math.round(ttlMsRaw)))
    : 2800;

  notificationQueue.push({
    message: normalizedMessage,
    meta: sanitizeBopperMeta(opts.meta),
    tone,
    ttlMs
  });

  if (notificationQueue.length > 8) {
    notificationQueue.shift();
  }

  maybeShowNextNotificationBopper();
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
  if (!activeRuntimeState?.worldRoot) {
    return;
  }

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
  createOrUpdateStreamRuntime();
  if (walletGateway?.getState?.().connected) {
    await startStreamRuntimeIfReady();
  } else if (!CONFIG.streamRuntimeEnabled) {
    renderStreamStatus('Disabled (on-chain only mode)');
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
        void startStreamRuntimeIfReady();
      } else {
        stopStreamRuntime();
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
  stopStreamRuntime();
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

function getPlayerPose() {
  camera.getWorldDirection(cameraDirection);
  const velocity = firstPersonController.getVelocity();
  return {
    position: {
      x: playerRig.position.x,
      y: playerRig.position.y,
      z: playerRig.position.z
    },
    velocity: {
      x: velocity.x,
      y: velocity.y,
      z: velocity.z
    },
    viewDir: {
      x: cameraDirection.x,
      y: cameraDirection.y,
      z: cameraDirection.z
    }
  };
}

function handleStreamEvent(message) {
  if (!message?.event || !voxelRuntime) {
    return;
  }

  if (tryShowMatchResultFromStreamEvent(message.event, message.payload)) {
    return;
  }

  switch (message.event) {
    case 'world_snapshot':
      voxelRuntime.applyWorldSnapshot(message.payload);
      voxelRuntime.setMineZones(mineZones);
      if (Number.isFinite(message.payload?.intent_seq)) {
        streamRuntime?.setIntentSeq(Number(message.payload.intent_seq));
      }
      break;

    case 'reveal_ahead_bundle':
      voxelRuntime.applyRevealBundle(message.payload);
      break;

    case 'commit_result':
      renderStreamStatus(`Live (batch ${message.payload?.batch_seq || 0})`);
      if (Number.isFinite(message.payload?.intent_seq)) {
        streamRuntime?.setIntentSeq(Number(message.payload.intent_seq));
      }
      break;

    case 'rollback_patch':
      renderStreamStatus(`Rollback: ${message.payload?.reason || 'unspecified'}`);
      queueNotificationBopper('Stream rollback patch.', {
        tone: 'warning',
        meta: String(message.payload?.reason || 'resyncing runtime'),
        ttlMs: 3600
      });
      if (Number.isFinite(message.payload?.expected_intent_seq)) {
        streamRuntime?.setIntentSeq(Math.max(0, Number(message.payload.expected_intent_seq) - 1));
      }
      void forceResyncStreamRuntime();
      break;

    case 'desynced':
      renderStreamStatus(`Desynced: ${message.payload?.reason || 'unknown'}`);
      queueNotificationBopper('Stream desynced.', {
        tone: 'warning',
        meta: String(message.payload?.reason || 'resyncing runtime'),
        ttlMs: 3600
      });
      void forceResyncStreamRuntime();
      break;

    default:
      break;
  }
}

function createOrUpdateStreamRuntime() {
  if (!walletGateway || !voxelRuntime) {
    return;
  }

  if (!CONFIG.streamRuntimeEnabled) {
    if (streamRuntime) {
      streamRuntime.stop();
      streamRuntime = null;
    }
    renderStreamStatus('Disabled (on-chain only mode)');
    return;
  }

  if (streamRuntime) {
    streamRuntime.stop();
  }

  streamRuntime = createStreamRuntime({
    walletGateway,
    worldProfileId: CONFIG.worldProfileId,
    runtimeBaseUrl: CONFIG.runtimeBaseUrl,
    programId: CONFIG.mineDuelProgramId,
    getPlayerPose,
    getMineZones: () => mineZones,
    onEvent: handleStreamEvent,
    onStatus: (status) => {
      const detail = status?.detail ? ` (${status.detail})` : '';
      renderStreamStatus(`${status?.status || 'unknown'}${detail}`);
    }
  });
}

async function startStreamRuntimeIfReady() {
  if (!streamRuntime || streamRunning) {
    return;
  }

  try {
    await streamRuntime.start();
    streamRunning = true;
    queueNotificationBopper('Managed runtime live.', {
      tone: 'info',
      meta: 'Realtime sync online'
    });
  } catch (error) {
    streamRunning = false;
    const reason = asErrorText(error);
    renderStreamStatus(`Error: ${reason}`);
    queueNotificationBopper('Managed runtime failed.', {
      tone: 'danger',
      meta: reason,
      ttlMs: 4200
    });
  }
}

function stopStreamRuntime() {
  streamRunning = false;
  if (streamRuntime) {
    streamRuntime.stop();
  }
}

async function forceResyncStreamRuntime() {
  if (streamResyncInFlight || !streamRuntime) {
    return;
  }

  streamResyncInFlight = true;
  queueNotificationBopper('Resync requested.', {
    tone: 'warning',
    meta: 'Reconnecting managed runtime'
  });
  stopStreamRuntime();
  await startStreamRuntimeIfReady();
  streamResyncInFlight = false;
}

// ---------------------------------------------
// Controls and input
// ---------------------------------------------
function isPointerLocked() {
  return document.pointerLockElement === document.body;
}

function onPointerLockChange() {
  const gameplayActive = isPointerLocked() && !editorModeEnabled;
  blocker.style.display = gameplayActive || editorModeEnabled ? 'none' : 'flex';
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

function onMouseDown(event) {
  if (!isPointerLocked() || editorModeEnabled) {
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
  if (visualHit && breakVisualMineTarget(visualHit)) {
    return;
  }

  if (!voxelRuntime) {
    return;
  }

  const voxel = voxelRuntime.raycastMine(camera, MINE_BREAK_MAX_DISTANCE);
  if (!voxel) {
    return;
  }

  voxelRuntime.setVoxelValue(voxel, 0);
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
  instructions.addEventListener('click', requestPointerLock);
  instructions.addEventListener('keydown', onInstructionsKeydown);

  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', onResize);
  window.addEventListener('beforeunload', teardownWalletConnector);
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
  const gameplayActive = isPointerLocked() && !editorModeEnabled;

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
  updateRuntimeHeadFromCamera();
  syncCameraToHeadAnchor();
  atmosphereRuntime?.update({
    timeSeconds: nowMs * 0.001,
    focusPosition: playerRig.position
  });

  const renderCamera = editorBridge?.getRenderCamera ? editorBridge.getRenderCamera() : camera;
  updateHoveredMineVoxel(renderCamera, !editorModeEnabled);

  prevTimeMs = nowMs;
  if (postProcessRuntime?.render) {
    postProcessRuntime.render(renderCamera, { timeSeconds: nowMs * 0.001 });
  } else {
    renderer.render(scene, renderCamera);
  }
}

async function startGame() {
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
  onPointerLockChange();
  queueNotificationBopper('Notification bopper online.', {
    tone: 'info',
    meta: 'Bottom-right game alerts ready'
  });
  renderer.setAnimationLoop(animate);
}

async function bootstrap() {
  const { initRouter } = await import('./router.js');
  const { mountLobby } = await import('./views/lobby.js');

  await initializeWalletConnector();

  /**
   * @param {string | undefined} nextModelPath
   */
  function setSelectedPlayerModelPath(nextModelPath) {
    const normalized = typeof nextModelPath === 'string' ? nextModelPath.trim() : '';
    selectedPlayerModelPath = normalized || DEFAULT_PLAYER_MODEL_PATH;
  }

  const router = initRouter({
    onLobby() {
      hideMatchResultOverlay();
      resetNotificationBopper();
      mountLobby({
        walletGateway,
        initialSelectedModelPath: selectedPlayerModelPath,
        onEnterGame(nextModelPath) {
          setSelectedPlayerModelPath(nextModelPath);
          gameRouter?.goToGame?.();
        }
      });
    },
    onGame() {
      hideMatchResultOverlay();
      if (!walletGateway?.getState?.().connected) {
        window.location.hash = '#/lobby';
        return;
      }
      void startGame();
    }
  });
  gameRouter = router;
}

bootstrap();
