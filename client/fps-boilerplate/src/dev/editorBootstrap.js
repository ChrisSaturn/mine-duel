import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CAMERA_PRESET_PITCH_MAX_CEIL,
  CAMERA_PRESET_PITCH_MIN_FLOOR,
  MAP_MANIFEST_VERSION,
  createHitboxMesh,
  normalizeMapData,
  serializeEuler,
  serializeVector3,
  setHitboxMeshDebug
} from '../runtime/mapRuntime.js';

const EDITOR_STYLE_ID = 'mine-duel-dev-editor-style';

function withBaseUrl(path) {
  const baseUrl = typeof import.meta?.env?.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

const PLAYER_PREVIEW_MODEL_PATH = withBaseUrl('models/characters/kenney-blocky/character-a.glb');

function ensureEditorStyles() {
  if (document.getElementById(EDITOR_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = EDITOR_STYLE_ID;
  style.textContent = `
    .mine-duel-dev-editor {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 60;
      width: min(360px, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      overflow: auto;
      padding: 0.85rem;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 0.65rem;
      background: rgba(8, 10, 16, 0.92);
      color: #eaf1ff;
      font: 12px/1.4 "Minecraft", "IBM Plex Sans", "Segoe UI", sans-serif;
      backdrop-filter: blur(10px);
    }

    .mine-duel-dev-editor button,
    .mine-duel-dev-editor input,
    .mine-duel-dev-editor select {
      font: inherit;
    }

    .mine-duel-dev-editor h2 {
      margin: 0;
      font-size: 14px;
      letter-spacing: 0.04em;
    }

    .mine-duel-dev-editor p {
      margin: 0;
    }

    .mine-duel-dev-editor .row {
      display: flex;
      gap: 0.45rem;
      align-items: center;
      margin-top: 0.45rem;
      flex-wrap: wrap;
    }

    .mine-duel-dev-editor .row > label {
      display: inline-flex;
      gap: 0.25rem;
      align-items: center;
    }

    .mine-duel-dev-editor .split {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
      margin-top: 0.45rem;
    }

    .mine-duel-dev-editor .split-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
      margin-top: 0.45rem;
    }

    .mine-duel-dev-editor input,
    .mine-duel-dev-editor select,
    .mine-duel-dev-editor button {
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 0.4rem;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      padding: 0.3rem 0.45rem;
    }

    .mine-duel-dev-editor button {
      cursor: pointer;
    }

    .mine-duel-dev-editor button[data-active='true'] {
      background: rgba(88, 204, 255, 0.23);
      border-color: rgba(88, 204, 255, 0.85);
    }

    .mine-duel-dev-editor .section {
      margin-top: 0.8rem;
      padding-top: 0.7rem;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }

    .mine-duel-dev-editor .hint {
      margin-top: 0.45rem;
      color: #bed2ff;
      opacity: 0.9;
    }

    .mine-duel-dev-editor .status {
      margin-top: 0.45rem;
      color: #9ce39c;
      min-height: 1.2em;
    }

    .mine-duel-dev-editor-launch {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 59;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 999px;
      background: rgba(8, 10, 16, 0.88);
      color: #eaf1ff;
      padding: 0.45rem 0.65rem;
      font: 12px/1 "Minecraft", "IBM Plex Sans", "Segoe UI", sans-serif;
      cursor: pointer;
    }
  `;

  document.head.appendChild(style);
}

function isTypingIntoInput(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

function removeFirstFromArray(array, value) {
  const index = array.indexOf(value);
  if (index !== -1) {
    array.splice(index, 1);
  }
}

function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function round(value, decimals = 6) {
  const precision = 10 ** decimals;
  return Math.round(Number(value) * precision) / precision;
}

function resolveSelectableRoot(object, kind) {
  let current = object;
  while (current) {
    if (kind === 'world' && current.userData.mapObjectId) {
      return current;
    }

    if (kind === 'hitbox' && current.userData.mapHitboxId) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

function pickFromMap(entriesMap, id) {
  return entriesMap.get(id) ?? null;
}

function entryFromList(list, id) {
  return list.find((entry) => entry.id === id) ?? null;
}

export function mountEditor(context) {
  ensureEditorStyles();

  const {
    scene,
    camera,
    playerRig,
    renderer,
    colliders,
    mapData,
    getRuntimeState,
    applyImportedMap,
    setEditorActive,
    getConfig,
    setPlayerScale
  } = context;

  if (!scene || !camera || !playerRig || !renderer || !colliders) {
    throw new Error('mountEditor requires scene, camera, playerRig, renderer, colliders, and mapData.');
  }

  let runtimeState = getRuntimeState ? getRuntimeState() : context.runtimeState;
  let workingMapData = normalizeMapData(mapData);
  let editorEnabled = false;
  let mode = 'world';
  let selectedNode = null;
  let selectedKind = null;

  let translationSnapEnabled = true;
  let rotationSnapEnabled = true;
  let translationSnap = 0.5;
  let rotationSnapDegrees = 15;
  let nudgeStep = 0.2;
  const undoStack = [];
  const maxUndoDepth = 80;
  let transformSnapshotBeforeDrag = null;
  let sidePanActive = false;
  let sidePanLastX = 0;
  let sidePanLastY = 0;
  const panRight = new THREE.Vector3();
  const panUp = new THREE.Vector3();
  const panOffset = new THREE.Vector3();
  const previewBounds = new THREE.Box3();
  const previewCenter = new THREE.Vector3();
  const previewSize = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const sceneCenter = new THREE.Vector3();
  const sceneSize = new THREE.Vector3();
  const sceneOffset = new THREE.Vector3();
  const playerMarkerPosition = new THREE.Vector3();
  const cameraMarkerPosition = new THREE.Vector3();
  const cameraMarkerQuaternion = new THREE.Quaternion();
  let playerColliderRadius = 0.35;
  let configuredColliderHeight = 1.7;
  let playerColliderShaftHeight = Math.max(configuredColliderHeight - playerColliderRadius * 2, 0.01);
  let playerPreviewScale = 1;

  const editorCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 900);
  editorCamera.position.set(12, 12, 12);
  editorCamera.lookAt(playerRig.position);
  editorCamera.updateProjectionMatrix();

  const orbitControls = new OrbitControls(editorCamera, renderer.domElement);
  orbitControls.enabled = false;
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.12;
  orbitControls.screenSpacePanning = true;
  orbitControls.mouseButtons.LEFT = null;
  orbitControls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  orbitControls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  orbitControls.minDistance = 0.5;
  orbitControls.maxDistance = 700;
  orbitControls.target.copy(playerRig.position);
  orbitControls.update();

  const transformControls = new TransformControls(editorCamera, renderer.domElement);
  transformControls.setSize(1.35);
  transformControls.setSpace('world');
  transformControls.showX = true;
  transformControls.showY = true;
  transformControls.showZ = true;
  transformControls.visible = false;
  transformControls.enabled = false;
  const transformControlsHelper = transformControls.getHelper();
  scene.add(transformControlsHelper);

  // Keep editor gizmo readable like Unity handles: visible above geometry and unaffected by scene fog.
  transformControlsHelper.traverse((node) => {
    if (!node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.depthTest = false;
      material.depthWrite = false;
      material.fog = false;
      material.toneMapped = false;
      material.transparent = true;
      material.opacity = 1;
      material.needsUpdate = true;
    }
  });

  const selectionHelper = new THREE.BoxHelper(undefined, 0xfff057);
  selectionHelper.visible = false;
  scene.add(selectionHelper);

  const playerMarker = new THREE.Group();
  playerMarker.name = 'editor-player-marker';
  playerMarker.visible = false;

  const playerBodyMarker = new THREE.Mesh(
    new THREE.CapsuleGeometry(playerColliderRadius, playerColliderShaftHeight, 8, 12),
    new THREE.MeshBasicMaterial({
      color: 0x9ce39c,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
  );
  playerBodyMarker.position.y = configuredColliderHeight * 0.5;
  playerBodyMarker.renderOrder = 5;
  playerMarker.add(playerBodyMarker);

  function syncPlayerCapsuleMarkerFromConfig() {
    const runtimeConfig = getConfig ? getConfig() : null;
    const nextRadius = Math.max(Number(runtimeConfig?.playerColliderRadius) || 0.35, 0.05);
    const nextHeight = Math.max(Number(runtimeConfig?.playerColliderHeight) || 1.7, nextRadius * 2 + 0.01);
    const nextShaft = Math.max(nextHeight - nextRadius * 2, 0.01);
    const nextPlayerScale = THREE.MathUtils.clamp(Number(runtimeConfig?.playerModelScale) || 1, 0.1, 8);

    if (
      Math.abs(nextRadius - playerColliderRadius) < 1e-4
      && Math.abs(nextHeight - configuredColliderHeight) < 1e-4
      && Math.abs(nextPlayerScale - playerPreviewScale) < 1e-4
    ) {
      return;
    }

    playerColliderRadius = nextRadius;
    configuredColliderHeight = nextHeight;
    playerColliderShaftHeight = nextShaft;
    playerPreviewScale = nextPlayerScale;

    const nextGeometry = new THREE.CapsuleGeometry(playerColliderRadius, playerColliderShaftHeight, 8, 12);
    playerBodyMarker.geometry.dispose();
    playerBodyMarker.geometry = nextGeometry;
    playerBodyMarker.position.y = configuredColliderHeight * 0.5;
    playerPreviewAnchor.scale.setScalar(playerPreviewScale);
  }

  const playerAxesMarker = new THREE.AxesHelper(1.6);
  playerMarker.add(playerAxesMarker);

  const playerPreviewAnchor = new THREE.Group();
  playerPreviewAnchor.name = 'editor-player-preview-anchor';
  playerMarker.add(playerPreviewAnchor);

  const previewLoader = new GLTFLoader();
  previewLoader.load(
    PLAYER_PREVIEW_MODEL_PATH,
    (gltf) => {
      const previewModel = gltf.scene;
      previewModel.name = 'editor-player-preview-model';
      previewModel.position.set(0, 0, 0);
      previewModel.rotation.set(0, Math.PI, 0);
      previewModel.traverse((node) => {
        if (!node.isMesh) {
          return;
        }

        node.castShadow = false;
        node.receiveShadow = false;
      });

      previewModel.updateMatrixWorld(true);
      previewBounds.setFromObject(previewModel);
      if (!previewBounds.isEmpty()) {
        previewBounds.getCenter(previewCenter);
        previewBounds.getSize(previewSize);
        previewModel.position.x -= previewCenter.x;
        previewModel.position.z -= previewCenter.z;
        previewModel.position.y -= previewBounds.min.y;
      }

      playerPreviewAnchor.add(previewModel);
    },
    undefined,
    () => {
      // Keep capsule fallback marker visible if model cannot load.
    }
  );
  scene.add(playerMarker);

  const cameraMarker = new THREE.Group();
  cameraMarker.name = 'editor-camera-marker';
  cameraMarker.visible = false;

  const cameraMarkerBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff6f91,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false
    })
  );
  cameraMarkerBody.renderOrder = 3;
  cameraMarker.add(cameraMarkerBody);

  const cameraForwardMarker = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, 0),
    0.9,
    0xff6f91,
    0.25,
    0.12
  );
  cameraMarker.add(cameraForwardMarker);
  scene.add(cameraMarker);

  const launcher = document.createElement('button');
  launcher.className = 'mine-duel-dev-editor-launch';
  launcher.type = 'button';
  launcher.textContent = 'Editor (`)';
  document.body.appendChild(launcher);

  const panel = document.createElement('aside');
  panel.className = 'mine-duel-dev-editor';
  panel.hidden = true;
  panel.innerHTML = `
    <h2>MINE-DUEL Dev Editor</h2>
    <p class="hint">Toggle: <code>\`</code> | Modes: <code>1</code>/<code>2</code>/<code>3</code></p>

    <div class="row" id="editor-mode-row">
      <button type="button" data-mode="world">1 World</button>
      <button type="button" data-mode="camera">2 Camera</button>
      <button type="button" data-mode="hitbox">3 Hitbox</button>
    </div>

    <p class="hint" id="editor-selected">Selected: none</p>

    <div class="section" id="world-section">
      <p><strong>World</strong></p>
      <div class="row">
        <button type="button" id="transform-translate">Move</button>
        <button type="button" id="transform-rotate">Rotate</button>
        <button type="button" id="transform-scale">Scale</button>
      </div>

      <div class="row">
        <button type="button" id="duplicate-selected">Duplicate</button>
        <button type="button" id="delete-selected">Delete</button>
      </div>

      <div class="row">
        <label><input id="translation-snap-enabled" type="checkbox" checked /> Grid snap</label>
        <label><input id="rotation-snap-enabled" type="checkbox" checked /> Angle snap</label>
      </div>

      <div class="split-2">
        <label>Grid
          <input id="translation-snap" type="number" value="0.5" step="0.05" />
        </label>
        <label>Angle
          <input id="rotation-snap" type="number" value="15" step="1" />
        </label>
      </div>

      <div class="split-2">
        <label>Nudge
          <input id="nudge-step" type="number" value="0.2" step="0.05" />
        </label>
        <p class="hint">LMB drag empty space pan, LMB select/gizmo, RMB orbit, wheel zoom</p>
      </div>
    </div>

    <div class="section" id="camera-section">
      <p><strong>Camera (player-relative)</strong></p>
      <div class="split">
        <label>X<input id="cam-x" type="number" step="0.05" /></label>
        <label>Y<input id="cam-y" type="number" step="0.05" /></label>
        <label>Z<input id="cam-z" type="number" step="0.05" /></label>
      </div>

      <div class="split">
        <label>Pitch Min<input id="cam-pitch-min" type="number" step="0.01" /></label>
        <label>Pitch Max<input id="cam-pitch-max" type="number" step="0.01" /></label>
        <label>FOV<input id="cam-fov" type="number" min="20" max="120" step="1" /></label>
      </div>

      <div class="row">
        <label>Player Scale<input id="player-scale" type="number" min="0.1" max="8" step="0.05" /></label>
      </div>

      <div class="row">
        <button type="button" id="camera-refresh">Read current</button>
      </div>
    </div>

    <div class="section" id="hitbox-section">
      <p><strong>Hitbox</strong></p>
      <div class="row">
        <button type="button" id="add-hitbox-box">Add Box</button>
        <button type="button" id="add-hitbox-capsule">Add Capsule</button>
      </div>

      <div class="row">
        <label>Attach
          <select id="attach-object-select">
            <option value="">World space</option>
          </select>
        </label>
        <button type="button" id="attach-hitbox">Apply Attach</button>
      </div>

      <div class="row">
        <label>Layer
          <input id="hitbox-layer" type="text" value="default" />
        </label>
      </div>

      <div class="row">
        <label><input id="show-colliders" type="checkbox" checked /> Show Colliders</label>
      </div>
    </div>

    <div class="section">
      <p><strong>Map IO</strong></p>
      <div class="row">
        <button type="button" id="export-map">Export JSON</button>
        <button type="button" id="import-map">Import JSON</button>
        <input id="import-map-file" type="file" accept="application/json" hidden />
      </div>
      <p id="editor-status" class="status"></p>
    </div>
  `;

  document.body.appendChild(panel);

  const modeButtons = Array.from(panel.querySelectorAll('button[data-mode]'));
  const selectedLabel = panel.querySelector('#editor-selected');
  const statusLabel = panel.querySelector('#editor-status');

  const worldSection = panel.querySelector('#world-section');
  const cameraSection = panel.querySelector('#camera-section');
  const hitboxSection = panel.querySelector('#hitbox-section');

  const transformTranslateButton = panel.querySelector('#transform-translate');
  const transformRotateButton = panel.querySelector('#transform-rotate');
  const transformScaleButton = panel.querySelector('#transform-scale');
  const duplicateButton = panel.querySelector('#duplicate-selected');
  const deleteButton = panel.querySelector('#delete-selected');

  const translationSnapEnabledInput = panel.querySelector('#translation-snap-enabled');
  const rotationSnapEnabledInput = panel.querySelector('#rotation-snap-enabled');
  const translationSnapInput = panel.querySelector('#translation-snap');
  const rotationSnapInput = panel.querySelector('#rotation-snap');
  const nudgeStepInput = panel.querySelector('#nudge-step');

  const cameraXInput = panel.querySelector('#cam-x');
  const cameraYInput = panel.querySelector('#cam-y');
  const cameraZInput = panel.querySelector('#cam-z');
  const cameraPitchMinInput = panel.querySelector('#cam-pitch-min');
  const cameraPitchMaxInput = panel.querySelector('#cam-pitch-max');
  const cameraFovInput = panel.querySelector('#cam-fov');
  const playerScaleInput = panel.querySelector('#player-scale');
  const cameraRefreshButton = panel.querySelector('#camera-refresh');

  const addBoxHitboxButton = panel.querySelector('#add-hitbox-box');
  const addCapsuleHitboxButton = panel.querySelector('#add-hitbox-capsule');
  const attachSelect = panel.querySelector('#attach-object-select');
  const attachHitboxButton = panel.querySelector('#attach-hitbox');
  const hitboxLayerInput = panel.querySelector('#hitbox-layer');
  const showCollidersInput = panel.querySelector('#show-colliders');

  const exportMapButton = panel.querySelector('#export-map');
  const importMapButton = panel.querySelector('#import-map');
  const importMapFileInput = panel.querySelector('#import-map-file');
  let showColliders = true;

  function setStatus(message, isError = false) {
    statusLabel.textContent = message;
    statusLabel.style.color = isError ? '#ff9e9e' : '#9ce39c';
  }

  function beginSidePan(event) {
    sidePanActive = true;
    sidePanLastX = event.clientX;
    sidePanLastY = event.clientY;
    renderer.domElement.style.cursor = 'grabbing';
  }

  function stopSidePan() {
    sidePanActive = false;
    renderer.domElement.style.cursor = '';
  }

  function onPointerMove(event) {
    if (!editorEnabled || !sidePanActive || transformControls.dragging) {
      return;
    }

    const deltaX = event.clientX - sidePanLastX;
    const deltaY = event.clientY - sidePanLastY;
    sidePanLastX = event.clientX;
    sidePanLastY = event.clientY;

    const distanceToTarget = Math.max(editorCamera.position.distanceTo(orbitControls.target), 1);
    const panFactor = distanceToTarget * 0.0018;

    panRight.setFromMatrixColumn(editorCamera.matrix, 0).normalize();
    panUp.setFromMatrixColumn(editorCamera.matrix, 1).normalize();

    panOffset.copy(panRight).multiplyScalar(-deltaX * panFactor);
    panOffset.addScaledVector(panUp, deltaY * panFactor);

    editorCamera.position.add(panOffset);
    orbitControls.target.add(panOffset);
    orbitControls.update();
  }

  function onPointerUp() {
    if (!sidePanActive) {
      return;
    }

    stopSidePan();
  }

  function cloneMapSnapshot(sourceMapData) {
    return normalizeMapData(JSON.parse(JSON.stringify(sourceMapData)));
  }

  function snapshotsEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function pushUndoSnapshot(snapshot) {
    const normalized = cloneMapSnapshot(snapshot);
    const last = undoStack[undoStack.length - 1];
    if (last && snapshotsEqual(last, normalized)) {
      return;
    }

    undoStack.push(normalized);
    if (undoStack.length > maxUndoDepth) {
      undoStack.shift();
    }
  }

  function frameEditorCameraToContent() {
    const bounds = new THREE.Box3();
    let hasBounds = false;
    const fogFar = Number.isFinite(scene.fog?.far) ? scene.fog.far : null;

    for (const objectNode of runtimeState.objectEntries.values()) {
      bounds.expandByObject(objectNode);
      hasBounds = true;
    }

    if (hasBounds) {
      bounds.getCenter(sceneCenter);
      bounds.getSize(sceneSize);
    } else {
      sceneCenter.copy(playerRig.position);
      sceneSize.set(12, 12, 12);
    }

    const rawRadius = Math.max(sceneSize.x, sceneSize.y, sceneSize.z, 10);
    const maxRadius = fogFar ? Math.max(18, fogFar * 0.35) : 140;
    const radius = Math.min(rawRadius, maxRadius);
    sceneOffset.set(radius * 0.85, radius * 0.72, radius * 0.85);

    editorCamera.position.copy(sceneCenter).add(sceneOffset);
    editorCamera.near = Math.max(0.1, radius / 500);
    editorCamera.far = fogFar ? Math.max(120, fogFar * 1.1) : Math.max(900, radius * 30);
    editorCamera.updateProjectionMatrix();

    orbitControls.maxDistance = fogFar ? Math.max(40, fogFar * 0.8) : 700;
    orbitControls.target.copy(sceneCenter);
    orbitControls.update();
  }

  function updateAttachOptions() {
    const previousValue = attachSelect.value;
    attachSelect.innerHTML = '<option value="">World space</option>';

    const objectIds = Array.from(runtimeState.objectEntries.keys()).sort((a, b) => a.localeCompare(b));
    for (const objectId of objectIds) {
      const option = document.createElement('option');
      option.value = objectId;
      option.textContent = objectId;
      attachSelect.appendChild(option);
    }

    if (objectIds.includes(previousValue)) {
      attachSelect.value = previousValue;
    }
  }

  function setMode(nextMode) {
    mode = nextMode;

    for (const modeButton of modeButtons) {
      modeButton.dataset.active = String(modeButton.dataset.mode === nextMode);
    }

    worldSection.hidden = mode !== 'world';
    cameraSection.hidden = mode !== 'camera';
    hitboxSection.hidden = mode !== 'hitbox';

    if (mode === 'camera') {
      transformControls.detach();
      transformControls.enabled = false;
      transformControls.visible = false;
      clearSelection();
      refreshCameraFields();
    } else if (selectedNode) {
      attachTransformControls();
    }

    refreshHitboxDebug();
    autoSelectFirstEditableInMode();
  }

  function refreshCameraFields() {
    const cameraPreset = workingMapData.cameraPreset;
    const playerPreset = workingMapData.playerPreset;
    cameraXInput.value = String(cameraPreset.localOffset[0]);
    cameraYInput.value = String(cameraPreset.localOffset[1]);
    cameraZInput.value = String(cameraPreset.localOffset[2]);
    cameraPitchMinInput.value = String(cameraPreset.pitchMin);
    cameraPitchMaxInput.value = String(cameraPreset.pitchMax);
    cameraFovInput.value = String(cameraPreset.fov);
    playerScaleInput.value = String(round(playerPreset.scale, 3));
  }

  function applyCameraFields() {
    const previousCameraPreset = { ...workingMapData.cameraPreset };
    const previousPlayerPreset = { ...workingMapData.playerPreset };

    const offset = [
      Number(cameraXInput.value),
      Number(cameraYInput.value),
      Number(cameraZInput.value)
    ].map((value) => (Number.isFinite(value) ? value : 0));

    let pitchMin = Number(cameraPitchMinInput.value);
    let pitchMax = Number(cameraPitchMaxInput.value);
    const fov = THREE.MathUtils.clamp(Number(cameraFovInput.value), 20, 120);
    const requestedPlayerScale = THREE.MathUtils.clamp(Number(playerScaleInput.value), 0.1, 8);
    const playerScale = Number.isFinite(requestedPlayerScale) ? requestedPlayerScale : 1;

    if (!Number.isFinite(pitchMin)) {
      pitchMin = CAMERA_PRESET_PITCH_MIN_FLOOR;
    }

    if (!Number.isFinite(pitchMax)) {
      pitchMax = CAMERA_PRESET_PITCH_MAX_CEIL;
    }

    pitchMin = THREE.MathUtils.clamp(pitchMin, CAMERA_PRESET_PITCH_MIN_FLOOR, CAMERA_PRESET_PITCH_MAX_CEIL);
    pitchMax = THREE.MathUtils.clamp(pitchMax, CAMERA_PRESET_PITCH_MIN_FLOOR, CAMERA_PRESET_PITCH_MAX_CEIL);

    if (pitchMin > pitchMax) {
      const temp = pitchMin;
      pitchMin = pitchMax;
      pitchMax = temp;
    }

    camera.position.set(offset[0], offset[1], offset[2]);
    camera.fov = fov;
    camera.updateProjectionMatrix();

    const config = getConfig ? getConfig() : null;
    if (config) {
      config.minPitch = pitchMin;
      config.maxPitch = pitchMax;
      config.playerHeight = offset[1];
    }

    if (setPlayerScale) {
      setPlayerScale(playerScale);
    } else if (config) {
      config.playerModelScale = playerScale;
    }

    workingMapData.cameraPreset = {
      localOffset: [round(offset[0]), round(offset[1]), round(offset[2])],
      pitchMin: round(pitchMin),
      pitchMax: round(pitchMax),
      fov: round(fov, 3)
    };
    workingMapData.playerPreset = {
      scale: round(playerScale, 3)
    };

    if (
      !snapshotsEqual(previousCameraPreset, workingMapData.cameraPreset)
      || !snapshotsEqual(previousPlayerPreset, workingMapData.playerPreset)
    ) {
      pushUndoSnapshot({
        ...workingMapData,
        cameraPreset: previousCameraPreset,
        playerPreset: previousPlayerPreset
      });
    }

    refreshCameraFields();
  }

  function updateSelectionLabel() {
    if (!selectedNode || !selectedKind) {
      selectedLabel.textContent = 'Selected: none';
      return;
    }

    if (selectedKind === 'world-object') {
      selectedLabel.textContent = `Selected: object ${selectedNode.userData.mapObjectId}`;
      return;
    }

    selectedLabel.textContent = `Selected: hitbox ${selectedNode.userData.mapHitboxId}`;
  }

  function setTransformMode(nextMode) {
    if (!['translate', 'rotate', 'scale'].includes(nextMode)) {
      return;
    }

    transformControls.setMode(nextMode);
    transformTranslateButton.dataset.active = String(nextMode === 'translate');
    transformRotateButton.dataset.active = String(nextMode === 'rotate');
    transformScaleButton.dataset.active = String(nextMode === 'scale');
  }

  function attachTransformControls() {
    if (!selectedNode || mode === 'camera') {
      transformControls.detach();
      transformControls.enabled = false;
      transformControls.visible = false;
      return;
    }

    transformControls.attach(selectedNode);
    transformControls.enabled = true;
    transformControls.visible = true;
    setTransformMode(transformControls.mode || 'translate');
  }

  function updateSelectionHelper() {
    if (!selectedNode || selectedKind !== 'world-object') {
      selectionHelper.visible = false;
      return;
    }

    selectionHelper.setFromObject(selectedNode);
    selectionHelper.visible = true;
  }

  function clearSelection() {
    selectedNode = null;
    selectedKind = null;
    transformControls.detach();
    transformControls.enabled = false;
    transformControls.visible = false;
    selectionHelper.visible = false;
    updateSelectionLabel();
    refreshHitboxDebug();
  }

  function autoSelectFirstEditableInMode() {
    if (!editorEnabled || selectedNode || mode === 'camera') {
      return;
    }

    if (mode === 'world') {
      const firstObject = runtimeState.objectEntries.values().next().value ?? null;
      if (firstObject) {
        selectNode(firstObject, 'world-object');
        setStatus(`Selected object ${firstObject.userData.mapObjectId}`);
      }
      return;
    }

    if (mode === 'hitbox') {
      const firstHitbox = runtimeState.hitboxEntries.values().next().value ?? null;
      if (firstHitbox) {
        selectNode(firstHitbox, 'hitbox');
        setStatus(`Selected hitbox ${firstHitbox.userData.mapHitboxId}`);
      }
    }
  }

  function selectNode(node, kind) {
    selectedNode = node;
    selectedKind = kind;

    attachTransformControls();
    updateSelectionHelper();
    updateSelectionLabel();

    if (selectedKind === 'hitbox') {
      const hitboxEntry = entryFromList(workingMapData.hitboxes, selectedNode.userData.mapHitboxId);
      if (hitboxEntry) {
        attachSelect.value = hitboxEntry.attachToObjectId ?? '';
        hitboxLayerInput.value = hitboxEntry.layer ?? 'default';
      }
    }

    refreshHitboxDebug();
  }

  function refreshHitboxDebug() {
    const debugVisible = editorEnabled && (showColliders || mode === 'hitbox' || selectedKind === 'hitbox');
    for (const hitboxMesh of runtimeState.hitboxEntries.values()) {
      const isSelected = selectedKind === 'hitbox' && selectedNode === hitboxMesh;
      setHitboxMeshDebug(hitboxMesh, debugVisible, isSelected);
    }
  }

  function updateSnapSettings() {
    transformControls.setTranslationSnap(translationSnapEnabled ? translationSnap : null);
    transformControls.setRotationSnap(rotationSnapEnabled ? THREE.MathUtils.degToRad(rotationSnapDegrees) : null);
    transformControls.setScaleSnap(translationSnapEnabled ? Math.max(translationSnap * 0.5, 0.05) : null);
  }

  function setEditorVisibility(enabled) {
    editorEnabled = enabled;
    panel.hidden = !enabled;
    launcher.textContent = enabled ? 'Close Editor (`)' : 'Editor (`)';
    orbitControls.enabled = enabled;
    playerMarker.visible = enabled;
    cameraMarker.visible = enabled;

    if (!enabled) {
      stopSidePan();
      clearSelection();
    } else {
      frameEditorCameraToContent();
      refreshHitboxDebug();
      if (mode === 'camera') {
        refreshCameraFields();
      }
      autoSelectFirstEditableInMode();
    }

    if (setEditorActive) {
      setEditorActive(enabled);
    }
  }

  function updateObjectEntryFromNode(objectId) {
    const objectNode = pickFromMap(runtimeState.objectEntries, objectId);
    if (!objectNode) {
      return;
    }

    let objectEntry = entryFromList(workingMapData.objects, objectId);
    if (!objectEntry) {
      objectEntry = {
        id: objectId,
        template: objectNode.userData.mapObjectTemplate ?? 'block-grass',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      };
      workingMapData.objects.push(objectEntry);
    }

    objectEntry.position = serializeVector3(objectNode.position);
    objectEntry.rotation = serializeEuler(objectNode.rotation);
    objectEntry.scale = serializeVector3(objectNode.scale);
  }

  function updateHitboxEntryFromNode(hitboxId) {
    const hitboxNode = pickFromMap(runtimeState.hitboxEntries, hitboxId);
    if (!hitboxNode) {
      return;
    }

    let hitboxEntry = entryFromList(workingMapData.hitboxes, hitboxId);
    if (!hitboxEntry) {
      hitboxEntry = {
        id: hitboxId,
        type: hitboxNode.userData.mapHitboxType === 'capsule' ? 'capsule' : 'box',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        layer: 'default',
        attachToObjectId: null
      };
      workingMapData.hitboxes.push(hitboxEntry);
    }

    hitboxEntry.position = serializeVector3(hitboxNode.position);
    hitboxEntry.rotation = serializeEuler(hitboxNode.rotation);

    if (hitboxEntry.type === 'capsule') {
      const base = hitboxNode.userData.hitboxBase;
      hitboxEntry.radius = round(base.radius * Math.max(Math.abs(hitboxNode.scale.x), Math.abs(hitboxNode.scale.z)));
      hitboxEntry.height = round(base.height * Math.abs(hitboxNode.scale.y));
    } else {
      const base = hitboxNode.userData.hitboxBase;
      hitboxEntry.size = [
        round(base.size[0] * Math.abs(hitboxNode.scale.x)),
        round(base.size[1] * Math.abs(hitboxNode.scale.y)),
        round(base.size[2] * Math.abs(hitboxNode.scale.z))
      ];
    }
  }

  function duplicateSelected() {
    if (!selectedNode || !selectedKind) {
      return;
    }

    pushUndoSnapshot(workingMapData);

    if (selectedKind === 'world-object') {
      const sourceId = selectedNode.userData.mapObjectId;
      const sourceEntry = entryFromList(workingMapData.objects, sourceId);
      if (!sourceEntry) {
        return;
      }

      const duplicateId = createId('object');
      const duplicateNode = selectedNode.clone(true);
      duplicateNode.position.x += translationSnapEnabled ? translationSnap : 0.5;
      duplicateNode.userData.mapObjectId = duplicateId;
      duplicateNode.userData.mapObjectTemplate = sourceEntry.template;
      duplicateNode.userData.mapEntryKind = 'world-object';

      runtimeState.worldRoot.add(duplicateNode);
      runtimeState.objectEntries.set(duplicateId, duplicateNode);
      colliders.push(duplicateNode);

      workingMapData.objects.push({
        id: duplicateId,
        template: sourceEntry.template,
        position: serializeVector3(duplicateNode.position),
        rotation: serializeEuler(duplicateNode.rotation),
        scale: serializeVector3(duplicateNode.scale)
      });

      updateAttachOptions();
      selectNode(duplicateNode, 'world-object');
      setStatus(`Duplicated object ${sourceId} -> ${duplicateId}`);
      return;
    }

    const sourceHitboxId = selectedNode.userData.mapHitboxId;
    const sourceEntry = entryFromList(workingMapData.hitboxes, sourceHitboxId);
    if (!sourceEntry) {
      return;
    }

    const duplicateId = createId('hitbox');
    const duplicateEntry = {
      ...sourceEntry,
      id: duplicateId,
      position: [...sourceEntry.position],
      rotation: [...sourceEntry.rotation],
      size: sourceEntry.size ? [...sourceEntry.size] : undefined
    };

    const duplicateNode = createHitboxMesh(duplicateEntry, editorEnabled);
    duplicateNode.position.copy(selectedNode.position);
    duplicateNode.rotation.copy(selectedNode.rotation);
    duplicateNode.scale.copy(selectedNode.scale);

    duplicateNode.position.x += translationSnapEnabled ? translationSnap : 0.5;

    if (duplicateEntry.attachToObjectId) {
      const attachTarget = runtimeState.objectEntries.get(duplicateEntry.attachToObjectId);
      if (attachTarget) {
        attachTarget.add(duplicateNode);
      } else {
        duplicateEntry.attachToObjectId = null;
        runtimeState.hitboxRoot.add(duplicateNode);
      }
    } else {
      runtimeState.hitboxRoot.add(duplicateNode);
    }

    runtimeState.hitboxEntries.set(duplicateId, duplicateNode);
    colliders.push(duplicateNode);
    workingMapData.hitboxes.push(duplicateEntry);

    selectNode(duplicateNode, 'hitbox');
    setStatus(`Duplicated hitbox ${sourceHitboxId} -> ${duplicateId}`);
  }

  function deleteSelected() {
    if (!selectedNode || !selectedKind) {
      return;
    }

    pushUndoSnapshot(workingMapData);

    if (selectedKind === 'world-object') {
      const objectId = selectedNode.userData.mapObjectId;
      runtimeState.objectEntries.delete(objectId);
      removeFirstFromArray(workingMapData.objects, entryFromList(workingMapData.objects, objectId));
      removeFirstFromArray(colliders, selectedNode);

      selectedNode.removeFromParent();

      for (const hitboxEntry of workingMapData.hitboxes) {
        if (hitboxEntry.attachToObjectId !== objectId) {
          continue;
        }

        hitboxEntry.attachToObjectId = null;
        const hitboxNode = runtimeState.hitboxEntries.get(hitboxEntry.id);
        if (hitboxNode) {
          runtimeState.hitboxRoot.attach(hitboxNode);
        }
      }

      clearSelection();
      updateAttachOptions();
      setStatus(`Deleted object ${objectId}`);
      return;
    }

    const hitboxId = selectedNode.userData.mapHitboxId;
    runtimeState.hitboxEntries.delete(hitboxId);
    removeFirstFromArray(workingMapData.hitboxes, entryFromList(workingMapData.hitboxes, hitboxId));
    removeFirstFromArray(colliders, selectedNode);
    selectedNode.removeFromParent();

    clearSelection();
    setStatus(`Deleted hitbox ${hitboxId}`);
  }

  function addHitbox(type) {
    pushUndoSnapshot(workingMapData);

    const hitboxId = createId('hitbox');
    const basePosition = [
      round(playerRig.position.x),
      round(playerRig.position.y + 1),
      round(playerRig.position.z)
    ];

    const hitboxEntry = type === 'capsule'
      ? {
          id: hitboxId,
          type: 'capsule',
          position: basePosition,
          rotation: [0, 0, 0],
          radius: 0.5,
          height: 1.2,
          layer: 'default',
          attachToObjectId: null
        }
      : {
          id: hitboxId,
          type: 'box',
          position: basePosition,
          rotation: [0, 0, 0],
          size: [2, 2, 2],
          layer: 'default',
          attachToObjectId: null
        };

    const hitboxNode = createHitboxMesh(hitboxEntry, editorEnabled);
    hitboxNode.position.set(basePosition[0], basePosition[1], basePosition[2]);

    runtimeState.hitboxRoot.add(hitboxNode);
    runtimeState.hitboxEntries.set(hitboxEntry.id, hitboxNode);
    colliders.push(hitboxNode);
    workingMapData.hitboxes.push(hitboxEntry);

    selectNode(hitboxNode, 'hitbox');
    setStatus(`Added ${type} hitbox ${hitboxEntry.id}`);
  }

  function applyHitboxAttach() {
    if (!selectedNode || selectedKind !== 'hitbox') {
      return;
    }

    pushUndoSnapshot(workingMapData);

    const hitboxId = selectedNode.userData.mapHitboxId;
    const hitboxEntry = entryFromList(workingMapData.hitboxes, hitboxId);
    if (!hitboxEntry) {
      return;
    }

    const attachToObjectId = attachSelect.value || null;
    hitboxEntry.attachToObjectId = attachToObjectId;

    if (!attachToObjectId) {
      runtimeState.hitboxRoot.attach(selectedNode);
      setStatus(`Hitbox ${hitboxId} set to world space.`);
      return;
    }

    const attachTarget = runtimeState.objectEntries.get(attachToObjectId);
    if (!attachTarget) {
      hitboxEntry.attachToObjectId = null;
      runtimeState.hitboxRoot.attach(selectedNode);
      setStatus(`Attach target ${attachToObjectId} not found.`, true);
      return;
    }

    attachTarget.attach(selectedNode);
    setStatus(`Hitbox ${hitboxId} attached to ${attachToObjectId}`);
  }

  function applyHitboxLayer() {
    if (!selectedNode || selectedKind !== 'hitbox') {
      return;
    }

    pushUndoSnapshot(workingMapData);

    const hitboxEntry = entryFromList(workingMapData.hitboxes, selectedNode.userData.mapHitboxId);
    if (!hitboxEntry) {
      return;
    }

    hitboxEntry.layer = hitboxLayerInput.value.trim().length > 0 ? hitboxLayerInput.value.trim() : 'default';
    setStatus(`Hitbox layer set to ${hitboxEntry.layer}`);
  }

  function nudgeSelected(event) {
    if (!selectedNode || mode === 'camera') {
      return false;
    }

    pushUndoSnapshot(workingMapData);

    const step = event.shiftKey ? Math.max(1, nudgeStep * 5) : nudgeStep;

    switch (event.code) {
      case 'ArrowUp':
        selectedNode.position.z -= step;
        break;
      case 'ArrowDown':
        selectedNode.position.z += step;
        break;
      case 'ArrowLeft':
        selectedNode.position.x -= step;
        break;
      case 'ArrowRight':
        selectedNode.position.x += step;
        break;
      case 'PageUp':
        selectedNode.position.y += step;
        break;
      case 'PageDown':
        selectedNode.position.y -= step;
        break;
      default:
        return false;
    }

    if (selectedKind === 'world-object') {
      updateObjectEntryFromNode(selectedNode.userData.mapObjectId);
    }

    if (selectedKind === 'hitbox') {
      updateHitboxEntryFromNode(selectedNode.userData.mapHitboxId);
    }

    updateSelectionHelper();
    return true;
  }

  function serializeMapData() {
    applyCameraFields();

    const objects = [];
    for (const [objectId, objectNode] of runtimeState.objectEntries.entries()) {
      updateObjectEntryFromNode(objectId);
      const objectEntry = entryFromList(workingMapData.objects, objectId);
      if (objectEntry) {
        objects.push({
          id: objectEntry.id,
          template: objectEntry.template,
          position: [...objectEntry.position],
          rotation: [...objectEntry.rotation],
          scale: [...objectEntry.scale]
        });
      }
    }

    const hitboxes = [];
    for (const [hitboxId] of runtimeState.hitboxEntries.entries()) {
      updateHitboxEntryFromNode(hitboxId);
      const hitboxEntry = entryFromList(workingMapData.hitboxes, hitboxId);
      if (!hitboxEntry) {
        continue;
      }

      const serializedHitbox = {
        id: hitboxEntry.id,
        type: hitboxEntry.type,
        position: [...hitboxEntry.position],
        rotation: [...hitboxEntry.rotation],
        layer: hitboxEntry.layer ?? 'default'
      };

      if (hitboxEntry.attachToObjectId) {
        serializedHitbox.attachToObjectId = hitboxEntry.attachToObjectId;
      }

      if (hitboxEntry.type === 'capsule') {
        serializedHitbox.radius = hitboxEntry.radius;
        serializedHitbox.height = hitboxEntry.height;
      } else {
        serializedHitbox.size = [...hitboxEntry.size];
      }

      hitboxes.push(serializedHitbox);
    }

    const serialized = normalizeMapData({
      version: MAP_MANIFEST_VERSION,
      objects,
      cameraPreset: { ...workingMapData.cameraPreset },
      playerPreset: { ...workingMapData.playerPreset },
      spawnPreset: { ...workingMapData.spawnPreset },
      hitboxes
    });

    workingMapData = normalizeMapData(serialized);
    updateAttachOptions();
    refreshCameraFields();

    return JSON.parse(JSON.stringify(serialized));
  }

  async function importMapFromFile(file) {
    try {
      pushUndoSnapshot(workingMapData);

      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeMapData(parsed);

      if (!applyImportedMap) {
        throw new Error('No import callback wired in main runtime.');
      }

      const result = await applyImportedMap(normalized);
      runtimeState = result.runtimeState;
      workingMapData = normalizeMapData(result.mapData);

      clearSelection();
      updateAttachOptions();
      refreshCameraFields();
      refreshHitboxDebug();

      setStatus(`Imported map \"${file.name}\".`);
    } catch (error) {
      console.error('Map import failed:', error);
      setStatus(`Import failed: ${error.message}`, true);
    }
  }

  async function undoLastChange() {
    const previous = undoStack.pop();
    if (!previous) {
      setStatus('Undo stack is empty.');
      return;
    }

    if (!applyImportedMap) {
      setStatus('Undo unavailable: map import callback missing.', true);
      return;
    }

    const result = await applyImportedMap(previous);
    runtimeState = result.runtimeState;
    workingMapData = normalizeMapData(result.mapData);
    clearSelection();
    updateAttachOptions();
    refreshCameraFields();
    refreshHitboxDebug();

    if (editorEnabled) {
      frameEditorCameraToContent();
      autoSelectFirstEditableInMode();
    }

    setStatus('Undo applied.');
  }

  function exportMapToFile() {
    try {
      const serialized = serializeMapData();
      const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `map-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setStatus('Map exported.');
    } catch (error) {
      console.error('Map export failed:', error);
      setStatus(`Export failed: ${error.message}`, true);
    }
  }

  function onPointerDown(event) {
    if (
      !editorEnabled
      || event.button !== 0
      || transformControls.dragging
    ) {
      return;
    }

    // When hovering the transform gizmo axis, let TransformControls handle the pointer flow.
    if (transformControls.axis) {
      return;
    }

    if (mode === 'camera') {
      beginSidePan(event);
      return;
    }

    const canvasRect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
    pointer.y = -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, editorCamera);

    const candidates = mode === 'world'
      ? Array.from(runtimeState.objectEntries.values())
      : Array.from(runtimeState.hitboxEntries.values());

    const hits = raycaster.intersectObjects(candidates, true);
    if (hits.length === 0) {
      beginSidePan(event);
      return;
    }

    const root = resolveSelectableRoot(hits[0].object, mode);
    if (!root) {
      beginSidePan(event);
      return;
    }

    selectNode(root, mode === 'world' ? 'world-object' : 'hitbox');
    setStatus(
      mode === 'world'
        ? `Selected object ${root.userData.mapObjectId}`
        : `Selected hitbox ${root.userData.mapHitboxId}`
    );
  }

  function onDocumentKeyDown(event) {
    if (event.code === 'Backquote' && !isTypingIntoInput(event.target)) {
      event.preventDefault();
      setEditorVisibility(!editorEnabled);
      return;
    }

    if (!editorEnabled || isTypingIntoInput(event.target)) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.code === 'KeyZ') {
      event.preventDefault();
      void undoLastChange();
      return;
    }

    if (event.code === 'Digit1') {
      event.preventDefault();
      setMode('world');
      return;
    }

    if (event.code === 'Digit2') {
      event.preventDefault();
      setMode('camera');
      return;
    }

    if (event.code === 'Digit3') {
      event.preventDefault();
      setMode('hitbox');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyD') {
      event.preventDefault();
      duplicateSelected();
      return;
    }

    if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      deleteSelected();
      return;
    }

    if (event.code === 'KeyW') {
      event.preventDefault();
      setTransformMode('translate');
      return;
    }

    if (event.code === 'KeyE') {
      event.preventDefault();
      setTransformMode('rotate');
      return;
    }

    if (event.code === 'KeyR') {
      event.preventDefault();
      setTransformMode('scale');
      return;
    }

    if (event.code === 'KeyG') {
      event.preventDefault();
      translationSnapEnabled = !translationSnapEnabled;
      translationSnapEnabledInput.checked = translationSnapEnabled;
      updateSnapSettings();
      return;
    }

    if (event.code === 'KeyT') {
      event.preventDefault();
      rotationSnapEnabled = !rotationSnapEnabled;
      rotationSnapEnabledInput.checked = rotationSnapEnabled;
      updateSnapSettings();
      return;
    }

    if (nudgeSelected(event)) {
      event.preventDefault();
      setStatus('Nudged selected transform.');
    }
  }

  transformControls.addEventListener('change', () => {
    updateSelectionHelper();
    if (selectedNode && selectedKind === 'world-object') {
      updateObjectEntryFromNode(selectedNode.userData.mapObjectId);
    }

    if (selectedNode && selectedKind === 'hitbox') {
      updateHitboxEntryFromNode(selectedNode.userData.mapHitboxId);
    }
  });

  transformControls.addEventListener('mouseDown', () => {
    transformSnapshotBeforeDrag = selectedNode ? cloneMapSnapshot(workingMapData) : null;
  });

  transformControls.addEventListener('mouseUp', () => {
    if (!transformSnapshotBeforeDrag) {
      return;
    }

    if (!snapshotsEqual(transformSnapshotBeforeDrag, workingMapData)) {
      pushUndoSnapshot(transformSnapshotBeforeDrag);
    }

    transformSnapshotBeforeDrag = null;
  });

  transformControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = editorEnabled && !event.value;
  });

  modeButtons.forEach((modeButton) => {
    modeButton.addEventListener('click', () => setMode(modeButton.dataset.mode));
  });

  launcher.addEventListener('click', () => setEditorVisibility(!editorEnabled));
  transformTranslateButton.addEventListener('click', () => setTransformMode('translate'));
  transformRotateButton.addEventListener('click', () => setTransformMode('rotate'));
  transformScaleButton.addEventListener('click', () => setTransformMode('scale'));
  duplicateButton.addEventListener('click', duplicateSelected);
  deleteButton.addEventListener('click', deleteSelected);

  translationSnapEnabledInput.addEventListener('change', () => {
    translationSnapEnabled = translationSnapEnabledInput.checked;
    updateSnapSettings();
  });

  rotationSnapEnabledInput.addEventListener('change', () => {
    rotationSnapEnabled = rotationSnapEnabledInput.checked;
    updateSnapSettings();
  });

  translationSnapInput.addEventListener('change', () => {
    const value = Number(translationSnapInput.value);
    translationSnap = Number.isFinite(value) && value > 0 ? value : 0.5;
    translationSnapInput.value = String(translationSnap);
    updateSnapSettings();
  });

  rotationSnapInput.addEventListener('change', () => {
    const value = Number(rotationSnapInput.value);
    rotationSnapDegrees = Number.isFinite(value) && value > 0 ? value : 15;
    rotationSnapInput.value = String(rotationSnapDegrees);
    updateSnapSettings();
  });

  nudgeStepInput.addEventListener('change', () => {
    const value = Number(nudgeStepInput.value);
    nudgeStep = Number.isFinite(value) && value > 0 ? value : 0.2;
    nudgeStepInput.value = String(nudgeStep);
  });

  [cameraXInput, cameraYInput, cameraZInput, cameraPitchMinInput, cameraPitchMaxInput, cameraFovInput, playerScaleInput].forEach((input) => {
    input.addEventListener('change', applyCameraFields);
  });

  cameraRefreshButton.addEventListener('click', () => {
    const config = getConfig ? getConfig() : null;

    cameraXInput.value = String(round(camera.position.x));
    cameraYInput.value = String(round(camera.position.y));
    cameraZInput.value = String(round(camera.position.z));

    cameraPitchMinInput.value = String(round(config?.minPitch ?? workingMapData.cameraPreset.pitchMin));
    cameraPitchMaxInput.value = String(round(config?.maxPitch ?? workingMapData.cameraPreset.pitchMax));
    cameraFovInput.value = String(round(camera.fov, 3));
    playerScaleInput.value = String(round(config?.playerModelScale ?? workingMapData.playerPreset.scale, 3));

    applyCameraFields();
    setStatus('Camera fields refreshed from runtime.');
  });

  addBoxHitboxButton.addEventListener('click', () => addHitbox('box'));
  addCapsuleHitboxButton.addEventListener('click', () => addHitbox('capsule'));

  attachHitboxButton.addEventListener('click', applyHitboxAttach);
  hitboxLayerInput.addEventListener('change', applyHitboxLayer);
  showCollidersInput.addEventListener('change', () => {
    showColliders = showCollidersInput.checked;
    refreshHitboxDebug();
  });

  exportMapButton.addEventListener('click', exportMapToFile);
  importMapButton.addEventListener('click', () => importMapFileInput.click());
  importMapFileInput.addEventListener('change', () => {
    const file = importMapFileInput.files?.[0];
    if (!file) {
      return;
    }

    importMapFromFile(file).finally(() => {
      importMapFileInput.value = '';
    });
  });

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onDocumentKeyDown);

  updateAttachOptions();
  setMode('world');
  setTransformMode('translate');
  updateSnapSettings();
  refreshCameraFields();
  syncPlayerCapsuleMarkerFromConfig();
  refreshHitboxDebug();
  setStatus('Editor ready.');

  return {
    isActive: () => editorEnabled,
    getRenderCamera: () => (editorEnabled ? editorCamera : camera),
    update() {
      if (!editorEnabled) {
        return;
      }

      playerMarkerPosition.copy(playerRig.position);
      playerMarker.position.copy(playerMarkerPosition);
      playerMarker.rotation.y = playerRig.rotation.y;
      syncPlayerCapsuleMarkerFromConfig();

      camera.getWorldPosition(cameraMarkerPosition);
      camera.getWorldQuaternion(cameraMarkerQuaternion);
      cameraMarker.position.copy(cameraMarkerPosition);
      cameraMarker.quaternion.copy(cameraMarkerQuaternion);

      if (transformControls.visible && selectedNode) {
        const distance = editorCamera.position.distanceTo(transformControls.worldPosition);
        const dynamicSize = THREE.MathUtils.clamp(distance / 8, 1.2, 8);
        transformControls.setSize(dynamicSize);
      }

      orbitControls.update();
    },
    onResize(width, height) {
      editorCamera.aspect = width / height;
      editorCamera.updateProjectionMatrix();
    },
    setContext(nextMapData, nextRuntimeState) {
      runtimeState = nextRuntimeState;
      workingMapData = normalizeMapData(nextMapData);
      clearSelection();
      updateAttachOptions();
      refreshCameraFields();
      refreshHitboxDebug();

      if (editorEnabled) {
        frameEditorCameraToContent();
        autoSelectFirstEditableInMode();
      }
    },
    setActive: (enabled) => setEditorVisibility(Boolean(enabled)),
    serializeMapData,
    destroy() {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('keydown', onDocumentKeyDown);

      transformControls.detach();
      orbitControls.dispose();
      scene.remove(transformControlsHelper);
      scene.remove(selectionHelper);
      scene.remove(playerMarker);
      scene.remove(cameraMarker);

      panel.remove();
      launcher.remove();
    }
  };
}
