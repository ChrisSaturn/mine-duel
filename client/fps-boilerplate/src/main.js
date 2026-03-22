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
import { createPostProcessRuntime } from './runtime/postProcessRuntime.js';
import { createStreamRuntime } from './runtime/streamRuntime.js';
import { createVoxelRuntime } from './runtime/voxelRuntime.js';

// ---------------------------------------------
// UI refs
// ---------------------------------------------
const app = document.getElementById('app');
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const fpsValue = document.getElementById('fps-value');
const hud = document.getElementById('hud');
const walletSelect = document.getElementById('wallet-select');
const walletConnectButton = document.getElementById('wallet-connect');
const walletDisconnectButton = document.getElementById('wallet-disconnect');
const walletStatusValue = document.getElementById('wallet-status-value');
const walletAddressValue = document.getElementById('wallet-address-value');
const walletRpcValue = document.getElementById('wallet-rpc-value');
const streamStatusValue = document.getElementById('stream-status-value');

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
  playerSpeed: 6.8,
  runMultiplier: 1.85,
  gravity: -25,
  jumpVelocity: 7.2,
  mouseSensitivity: 5,
  mouseLookSpeed: 0.0001,
  playerModelScale: 1,
  cameraHeadForwardOffset: 0.44,
  cameraHeadVerticalOffset: 0.03,
  minPitch: -Math.PI / 2,
  maxPitch: Math.PI / 2,
  playerColliderRadius: 0.35,
  playerColliderHeight: 1.7,
  playerCollisionIterations: 3,
  groundProbeLift: 1.2,
  groundProbeDistance: 5,
  groundSnapDistance: 0.12,
  fallResetHeight: -20,
  maxDeltaSeconds: 0.05,
  fpsUpdateIntervalMs: 250
};
const PLAYER_MODEL_PATH = '/models/characters/kenney-blocky/character-a.glb';

// ---------------------------------------------
// Core three.js objects
// ---------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x93bee8);
scene.fog = new THREE.Fog(0x93bee8, 25, 160);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.prepend(renderer.domElement);

const playerRig = new THREE.Object3D();
playerRig.position.set(0, 0, 10);
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

const playerVelocity = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const upVector = new THREE.Vector3(0, 1, 0);
const groundProbeOrigin = new THREE.Vector3();
const groundRaycaster = new THREE.Raycaster(
  new THREE.Vector3(),
  new THREE.Vector3(0, -1, 0),
  0,
  CONFIG.groundProbeDistance
);

const DIR_FWD = new THREE.Vector3(0, 0, -1);
const DIR_BKD = new THREE.Vector3(0, 0, 1);
const DIR_LFT = new THREE.Vector3(-1, 0, 0);
const DIR_RGT = new THREE.Vector3(1, 0, 0);
const bodyColliderBox = new THREE.Box3();
const bodyColliderSample = new THREE.Vector3();
const bodyColliderClosest = new THREE.Vector3();
const bodyColliderPush = new THREE.Vector3();
const playerModelBounds = new THREE.Box3();
const playerModelSize = new THREE.Vector3();
const playerModelCenter = new THREE.Vector3();
const playerModelMinPoint = new THREE.Vector3();
const playerModelCenterLocal = new THREE.Vector3();
const playerModelMinLocal = new THREE.Vector3();
const runtimeHeadPitchAxis = new THREE.Vector3(1, 0, 0);
const runtimeHeadPitchQuaternion = new THREE.Quaternion();
const runtimeHeadWorldPosition = new THREE.Vector3();
const runtimeCameraAnchorWorldPosition = new THREE.Vector3();
const runtimeCameraForward = new THREE.Vector3();
const worldUpVector = new THREE.Vector3(0, 1, 0);

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

let canJump = true;
let prevTimeMs = performance.now();
let playerIsMovingHorizontally = false;
let playerMovementSpeedNormalized = 0;
let lookPitch = 0;

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
let lastMineAtMs = 0;
let streamRunning = false;
let streamResyncInFlight = false;
let atmosphereRuntime = null;
let postProcessRuntime = null;

if (import.meta.env.DEV) {
  const editorHint = document.createElement('p');
  editorHint.id = 'editor-hint';
  editorHint.textContent = import.meta.env.VITE_ENABLE_EDITOR === '1'
    ? 'Dev editor enabled: press ` to toggle.'
    : 'Dev editor disabled. Set VITE_ENABLE_EDITOR=1 to enable.';
  hud?.appendChild(editorHint);
}

function setMeshShadowFlags(root, { castShadow, receiveShadow }) {
  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.castShadow = castShadow;
    node.receiveShadow = receiveShadow;
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
  lookPitch = THREE.MathUtils.clamp(lookPitch, CONFIG.minPitch, CONFIG.maxPitch);

  if (!runtimeHeadNode) {
    return;
  }

  const headPitch = -lookPitch;
  runtimeHeadPitchQuaternion.setFromAxisAngle(runtimeHeadPitchAxis, headPitch);
  runtimeHeadNode.quaternion.copy(runtimeHeadNeutralQuaternion).multiply(runtimeHeadPitchQuaternion);
  runtimeHeadNode.updateMatrixWorld(true);
}

function syncCameraToHeadAnchor() {
  camera.rotation.set(lookPitch, 0, 0);

  if (!runtimeHeadNode) {
    camera.position.set(0, CONFIG.playerHeight, 0);
    return;
  }

  runtimeHeadNode.updateWorldMatrix(true, false);
  runtimeHeadWorldPosition.setFromMatrixPosition(runtimeHeadNode.matrixWorld);
  camera.getWorldDirection(runtimeCameraForward);

  const forwardOffset = CONFIG.cameraHeadForwardOffset * CONFIG.playerModelScale;
  const verticalOffset = CONFIG.cameraHeadVerticalOffset * CONFIG.playerModelScale;
  runtimeCameraAnchorWorldPosition
    .copy(runtimeHeadWorldPosition)
    .addScaledVector(runtimeCameraForward, forwardOffset)
    .addScaledVector(worldUpVector, verticalOffset);

  playerRig.worldToLocal(runtimeCameraAnchorWorldPosition);
  camera.position.copy(runtimeCameraAnchorWorldPosition);
}

function bindCameraToRuntimeHead() {
  runtimeHeadNode = runtimePlayerModel ? findRuntimeHeadNode(runtimePlayerModel) : null;
  lookPitch = THREE.MathUtils.clamp(lookPitch, CONFIG.minPitch, CONFIG.maxPitch);

  if (!runtimeHeadNode) {
    syncCameraToHeadAnchor();
    return;
  }

  const headPitch = -lookPitch;
  runtimeHeadPitchQuaternion.setFromAxisAngle(runtimeHeadPitchAxis, headPitch);
  runtimeHeadNeutralQuaternion.copy(runtimeHeadNode.quaternion);
  runtimeHeadNeutralQuaternion.multiply(runtimeHeadPitchQuaternion.invert());

  updateRuntimeHeadFromCamera();
  syncCameraToHeadAnchor();
}

function applyRuntimePlayerScale(nextScale) {
  const clampedScale = THREE.MathUtils.clamp(Number(nextScale) || 1, 0.1, 8);
  CONFIG.playerModelScale = clampedScale;

  if (!runtimePlayerModel) {
    return;
  }

  runtimePlayerModel.scale.setScalar(CONFIG.playerModelScale);
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

  root.traverse((node) => {
    if (!node?.isMesh || !node?.name) {
      return;
    }

    const normalizedName = String(node.name).trim().toLowerCase();
    if (normalizedName.includes('head')) {
      runtimeFirstPersonHiddenMeshes.push(node);
    }
  });
}

function setFirstPersonOccluderVisibility(visible) {
  for (const mesh of runtimeFirstPersonHiddenMeshes) {
    mesh.visible = visible;
  }
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

function blendLimbSwing(limb, xRadians, deltaSeconds) {
  if (!limb?.node || !limb?.restRotation) {
    return;
  }

  limbOffsetEuler.set(xRadians, 0, 0);
  limbOffsetRotation.setFromEuler(limbOffsetEuler);
  limbTargetRotation.copy(limb.restRotation).multiply(limbOffsetRotation);

  const blendFactor = 1 - Math.exp(-12 * deltaSeconds);
  limb.node.quaternion.slerp(limbTargetRotation, blendFactor);
}

function updateRuntimePlayerWalkAnimation(deltaSeconds) {
  if (!runtimePlayerModel) {
    return;
  }

  const isMovingOnGround = playerIsMovingHorizontally && canJump && !editorModeEnabled;
  let leftArmSwing = 0;
  let rightArmSwing = 0;
  let leftLegSwing = 0;
  let rightLegSwing = 0;

  if (isMovingOnGround) {
    const cycleHz = THREE.MathUtils.lerp(2.1, 4.1, playerMovementSpeedNormalized);
    runtimePlayerLimbState.walkCycleSeconds += deltaSeconds * cycleHz;
    const phase = runtimePlayerLimbState.walkCycleSeconds * Math.PI * 2;
    const armAmplitude = THREE.MathUtils.lerp(0.64, 1.84, playerMovementSpeedNormalized);
    const legAmplitude = THREE.MathUtils.lerp(0.88, 2.36, playerMovementSpeedNormalized);

    leftArmSwing = -Math.sin(phase) * armAmplitude;
    rightArmSwing = Math.sin(phase) * armAmplitude;
    leftLegSwing = Math.sin(phase) * legAmplitude;
    rightLegSwing = -Math.sin(phase) * legAmplitude;
  }

  blendLimbSwing(runtimePlayerLimbState.leftArm, leftArmSwing, deltaSeconds);
  blendLimbSwing(runtimePlayerLimbState.rightArm, rightArmSwing, deltaSeconds);
  blendLimbSwing(runtimePlayerLimbState.leftLeg, leftLegSwing, deltaSeconds);
  blendLimbSwing(runtimePlayerLimbState.rightLeg, rightLegSwing, deltaSeconds);
}

async function initializeRuntimePlayerModel() {
  try {
    const gltf = await new Promise((resolve, reject) => {
      playerModelLoader.load(PLAYER_MODEL_PATH, resolve, undefined, reject);
    });

    const model = gltf.scene;
    model.name = 'runtime-player-model';
    model.rotation.y = Math.PI;

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
    setRuntimePlayerModelVisibility(!editorModeEnabled);
    setFirstPersonOccluderVisibility(true);
  } catch (error) {
    console.warn('Failed to load runtime player model:', error);
  }
}

async function applyMap(nextMapData) {
  activeMapData = normalizeMapData(nextMapData);
  applyRuntimePlayerScale(activeMapData.playerPreset?.scale ?? 1);

  activeRuntimeState = await applyMapManifestData(scene, playerRig, colliders, {
    mapData: activeMapData,
    camera,
    config: CONFIG,
    setMeshShadowFlags,
    runtimeState: activeRuntimeState
  });

  if (editorBridge?.setContext) {
    editorBridge.setContext(activeMapData, activeRuntimeState);
  }

  mineZones = getMineZoneAabbs(activeRuntimeState);
  if (voxelRuntime) {
    voxelRuntime.setMineZones(mineZones);
  }

  resolveGrounding();
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
  voxelRuntime = createVoxelRuntime({ scene });

  try {
    const manifest = await loadMapManifest(CONFIG.mapManifestPath);
    await applyMap(manifest);
  } catch (error) {
    console.error('Failed to load map manifest. Falling back to debug world:', error);
    createFallbackWorld();
  }

  await initializeRuntimePlayerModel();
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
  setRuntimePlayerModelVisibility(!enabled);
  setFirstPersonOccluderVisibility(true);

  if (enabled) {
    if (isPointerLocked() && document.exitPointerLock) {
      document.exitPointerLock();
    }

    resetInputState();
    playerVelocity.set(0, 0, 0);
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
      walletStatusValue.textContent = 'Connecting...';
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
    walletConnectButton.textContent = walletState.connecting ? 'Connecting...' : 'Connect';
  }

  if (walletDisconnectButton) {
    walletDisconnectButton.disabled = walletActionInFlight || walletState.connecting || !walletState.connected;
  }
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
        } finally {
          setWalletActionInFlight(false);
        }
      });
    }
  } catch (error) {
    console.error('Wallet connector bootstrap failed:', error);
    if (walletStatusValue) {
      walletStatusValue.textContent = 'Connector bootstrap failed';
    }
  }
}

function teardownWalletConnector() {
  stopStreamRuntime();
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
  return {
    position: {
      x: playerRig.position.x,
      y: playerRig.position.y,
      z: playerRig.position.z
    },
    velocity: {
      x: playerVelocity.x,
      y: playerVelocity.y,
      z: playerVelocity.z
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
      if (Number.isFinite(message.payload?.expected_intent_seq)) {
        streamRuntime?.setIntentSeq(Math.max(0, Number(message.payload.expected_intent_seq) - 1));
      }
      void forceResyncStreamRuntime();
      break;

    case 'desynced':
      renderStreamStatus(`Desynced: ${message.payload?.reason || 'unknown'}`);
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
  } catch (error) {
    streamRunning = false;
    renderStreamStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
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
  blocker.style.display = isPointerLocked() || editorModeEnabled ? 'none' : 'flex';
}

function requestPointerLock() {
  if (document.body.requestPointerLock) {
    document.body.requestPointerLock();
  }
}

function setToward(dx, dy, speed) {
  playerRig.rotateY(-dx * speed * CONFIG.mouseSensitivity);
  lookPitch = THREE.MathUtils.clamp(
    lookPitch + (-dy * speed * CONFIG.mouseSensitivity),
    CONFIG.minPitch,
    CONFIG.maxPitch
  );
  updateRuntimeHeadFromCamera();
  syncCameraToHeadAnchor();
}

function onMouseMove(event) {
  if (!isPointerLocked()) {
    return;
  }

  setToward(event.movementX, event.movementY, CONFIG.mouseLookSpeed);
}

function onMouseDown(event) {
  if (!isPointerLocked() || editorModeEnabled) {
    return;
  }
  if (event.button !== 0) {
    return;
  }
  if (!voxelRuntime || !streamRuntime) {
    return;
  }

  const nowMs = performance.now();
  if (nowMs - lastMineAtMs < 120) {
    return;
  }
  lastMineAtMs = nowMs;

  const voxel = voxelRuntime.raycastMine(camera, 7.5);
  if (!voxel) {
    return;
  }

  const previousValue = voxelRuntime.getVoxelValue(voxel);
  const changed = voxelRuntime.setVoxelValue(voxel, 0);
  void Promise.resolve(streamRuntime.sendMineIntent(voxel)).then((sent) => {
    if (changed && !sent) {
      voxelRuntime.setVoxelValue(voxel, previousValue);
    }
  });
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

    case 'Space':
      inputState.spacePressed = true;
      if (canJump) {
        playerVelocity.y = CONFIG.jumpVelocity;
        canJump = false;
      }
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

function updateHorizontalMovement(deltaSeconds) {
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
    playerIsMovingHorizontally = false;
    playerMovementSpeedNormalized = 0;
    return;
  }

  const runSpeed = CONFIG.playerSpeed * CONFIG.runMultiplier;
  const speed = inputState.shiftPressed ? runSpeed : CONFIG.playerSpeed;
  playerIsMovingHorizontally = true;
  playerMovementSpeedNormalized = THREE.MathUtils.clamp(speed / runSpeed, 0, 1);
  moveDirection.normalize().applyAxisAngle(upVector, angle);
  playerRig.position.addScaledVector(moveDirection, speed * deltaSeconds);
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

function resolvePlayerBodyCollisions() {
  const radius = CONFIG.playerColliderRadius;
  const height = Math.max(CONFIG.playerColliderHeight, radius * 2 + 0.01);

  for (let iteration = 0; iteration < CONFIG.playerCollisionIterations; iteration += 1) {
    let resolvedAny = false;
    const sampleMidY = playerRig.position.y + height * 0.5;
    const sampleTopY = playerRig.position.y + height - radius;
    const sampleYs = [sampleMidY, sampleTopY];

    for (const collider of colliders) {
      if (!collider) {
        continue;
      }

      bodyColliderBox.setFromObject(collider);
      if (bodyColliderBox.isEmpty()) {
        continue;
      }

      for (const sampleY of sampleYs) {
        if (sampleY < bodyColliderBox.min.y || sampleY > bodyColliderBox.max.y) {
          continue;
        }

        const samplePoint = bodyColliderSample.set(playerRig.position.x, sampleY, playerRig.position.z);
        if (!resolveHorizontalPenetration(samplePoint, bodyColliderBox, radius, bodyColliderPush)) {
          continue;
        }

        playerRig.position.add(bodyColliderPush);
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
    playerRig.position.y + CONFIG.groundProbeLift,
    playerRig.position.z
  );
  groundRaycaster.ray.origin.copy(groundProbeOrigin);

  const intersections = groundRaycaster.intersectObjects(colliders, true);
  if (intersections.length === 0) {
    canJump = false;
    return;
  }

  const groundY = groundProbeOrigin.y - intersections[0].distance;
  const footDistance = playerRig.position.y - groundY;
  const isGrounded = footDistance <= CONFIG.groundSnapDistance && playerVelocity.y <= 0;

  if (isGrounded) {
    playerRig.position.y = groundY;
    playerVelocity.y = 0;
    canJump = true;
  } else {
    canJump = false;
  }
}

function updatePlayer(deltaSeconds) {
  updateHorizontalMovement(deltaSeconds);
  resolvePlayerBodyCollisions();

  playerVelocity.y += CONFIG.gravity * deltaSeconds;
  playerRig.position.y += playerVelocity.y * deltaSeconds;

  resolveGrounding();
  resolvePlayerBodyCollisions();

  if (playerRig.position.y < CONFIG.fallResetHeight) {
    playerRig.position.set(0, 0, 10);
    playerVelocity.set(0, 0, 0);
    canJump = true;
  }
}

function animate() {
  const nowMs = performance.now();
  const rawDeltaSeconds = (nowMs - prevTimeMs) / 1000;
  const deltaSeconds = Math.min(rawDeltaSeconds, CONFIG.maxDeltaSeconds);

  updateFpsCounter(deltaSeconds * 1000);

  if (isPointerLocked()) {
    updatePlayer(deltaSeconds);
  }

  if (editorBridge?.update) {
    editorBridge.update(deltaSeconds);
  }
  updateRuntimePlayerWalkAnimation(deltaSeconds);
  updateRuntimeHeadFromCamera();
  syncCameraToHeadAnchor();
  atmosphereRuntime?.update({
    timeSeconds: nowMs * 0.001,
    focusPosition: playerRig.position
  });

  const renderCamera = editorBridge?.getRenderCamera ? editorBridge.getRenderCamera() : camera;

  prevTimeMs = nowMs;
  if (postProcessRuntime?.render) {
    postProcessRuntime.render(renderCamera);
  } else {
    renderer.render(scene, renderCamera);
  }
}

async function startGame() {
  bindEvents();
  await initializeWorld();
  if (postProcessRuntime?.dispose) {
    postProcessRuntime.dispose();
  }
  postProcessRuntime = createPostProcessRuntime({ renderer, scene, camera });
  postProcessRuntime.setSize(window.innerWidth, window.innerHeight);
  await mountDevEditorIfEnabled();
  resolveGrounding();
  onPointerLockChange();
  renderer.setAnimationLoop(animate);
}

async function bootstrap() {
  const { initRouter } = await import('./router.js');
  const { mountLobby } = await import('./views/lobby.js');

  await initializeWalletConnector();

  const router = initRouter({
    onLobby() {
      mountLobby({
        walletGateway,
        onEnterGame() {
          router.goToGame();
        }
      });
    },
    onGame() {
      void startGame();
    }
  });
}

bootstrap();
