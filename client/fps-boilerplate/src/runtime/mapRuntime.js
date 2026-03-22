import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MAP_MANIFEST_VERSION = 1;
export const DEFAULT_MAP_MANIFEST_PATH = '/maps/default-map.v1.json';

const PRIMITIVE_PLANE_TEMPLATE = 'primitive-plane';
const CUBE_WORLD_BLOCK_GRASS_TEMPLATE = 'cube-world-block-grass';
const CUBE_WORLD_GROUND_TEMPLATE = 'cube-world-ground';
const DEMO_SCENE_TEMPLATE = 'demo-scene';
const CUBE_WORLD_GROUND_TILES_X = 48;
const CUBE_WORLD_GROUND_TILES_Z = 48;

const blockyCharacterTemplateEntries = Array.from('abcdefghijklmnopqr').map((letter) => ([
  `blocky-character-${letter}`,
  `/models/characters/kenney-blocky/character-${letter}.glb`
]));

export const MODEL_TEMPLATES = {
  [PRIMITIVE_PLANE_TEMPLATE]: '__procedural__/primitive-plane',
  [CUBE_WORLD_BLOCK_GRASS_TEMPLATE]: '/models/cube-world/Blocks/glTF/Block_Grass.gltf',
  [CUBE_WORLD_GROUND_TEMPLATE]: '__procedural__/cube-world-ground',
  [DEMO_SCENE_TEMPLATE]: '/models/maps/demo-scene/Demo.gltf',
  'block-grass': '/models/platformer/block-grass.glb',
  'block-grass-low': '/models/platformer/block-grass-low.glb',
  'block-grass-large': '/models/platformer/block-grass-large.glb',
  'block-grass-corner': '/models/platformer/block-grass-corner.glb',
  'character-male-a': '/models/characters/character-male-a.glb',
  ...Object.fromEntries(blockyCharacterTemplateEntries)
};

const MIN_SCALE_COMPONENT = 0.0001;

const gltfLoader = new GLTFLoader();
const templateCache = new Map();

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, decimals = 6) {
  const number = toFiniteNumber(value, 0);
  const precision = 10 ** decimals;
  return Math.round(number * precision) / precision;
}

function toId(value, fallbackPrefix, index) {
  const source = typeof value === 'string' ? value.trim() : '';
  return source.length > 0 ? source : `${fallbackPrefix}-${index + 1}`;
}

function normalizeVector3(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }

  return [
    toFiniteNumber(value[0], fallback[0]),
    toFiniteNumber(value[1], fallback[1]),
    toFiniteNumber(value[2], fallback[2])
  ];
}

function normalizeScale(value) {
  const source = normalizeVector3(value, [1, 1, 1]);
  return source.map((component) => Math.max(Math.abs(component), MIN_SCALE_COMPONENT));
}

function cloneMapData(mapData) {
  return JSON.parse(JSON.stringify(mapData));
}

function normalizeObjectEntry(entry, index) {
  return {
    id: toId(entry?.id, 'object', index),
    template: typeof entry?.template === 'string' && MODEL_TEMPLATES[entry.template] ? entry.template : 'block-grass',
    position: normalizeVector3(entry?.position, [0, 0, 0]),
    rotation: normalizeVector3(entry?.rotation, [0, 0, 0]),
    scale: normalizeScale(entry?.scale)
  };
}

function normalizeHitboxEntry(entry, index) {
  const type = entry?.type === 'capsule' ? 'capsule' : 'box';
  const normalized = {
    id: toId(entry?.id, 'hitbox', index),
    type,
    position: normalizeVector3(entry?.position, [0, 0, 0]),
    rotation: normalizeVector3(entry?.rotation, [0, 0, 0]),
    attachToObjectId: typeof entry?.attachToObjectId === 'string' && entry.attachToObjectId.trim().length > 0
      ? entry.attachToObjectId.trim()
      : null,
    layer: typeof entry?.layer === 'string' && entry.layer.trim().length > 0
      ? entry.layer.trim()
      : 'default'
  };

  if (type === 'capsule') {
    normalized.radius = Math.max(toFiniteNumber(entry?.radius, 0.5), 0.01);
    normalized.height = Math.max(toFiniteNumber(entry?.height, 1.2), 0.01);
  } else {
    normalized.size = normalizeScale(entry?.size ?? [1, 1, 1]);
  }

  return normalized;
}

function normalizeCameraPreset(cameraPreset) {
  const pitchFloor = -Math.PI / 2;
  const pitchCeil = Math.PI / 2;
  const requestedPitchMin = THREE.MathUtils.clamp(toFiniteNumber(cameraPreset?.pitchMin, pitchFloor), pitchFloor, pitchCeil);
  const requestedPitchMax = THREE.MathUtils.clamp(toFiniteNumber(cameraPreset?.pitchMax, pitchCeil), pitchFloor, pitchCeil);
  const pitchMin = Math.min(requestedPitchMin, requestedPitchMax);
  const pitchMax = Math.max(requestedPitchMin, requestedPitchMax);

  return {
    localOffset: normalizeVector3(cameraPreset?.localOffset, [0, 1.62, 0]),
    pitchMin,
    pitchMax,
    fov: THREE.MathUtils.clamp(toFiniteNumber(cameraPreset?.fov, 70), 20, 120)
  };
}

function normalizePlayerPreset(playerPreset) {
  return {
    scale: THREE.MathUtils.clamp(toFiniteNumber(playerPreset?.scale, 1), 0.1, 8)
  };
}

export function normalizeMapData(rawMapData) {
  const source = rawMapData && typeof rawMapData === 'object' ? rawMapData : {};

  return {
    version: MAP_MANIFEST_VERSION,
    objects: Array.isArray(source.objects)
      ? source.objects.map((entry, index) => normalizeObjectEntry(entry, index))
      : [],
    cameraPreset: normalizeCameraPreset(source.cameraPreset),
    playerPreset: normalizePlayerPreset(source.playerPreset),
    hitboxes: Array.isArray(source.hitboxes)
      ? source.hitboxes.map((entry, index) => normalizeHitboxEntry(entry, index))
      : []
  };
}

export async function loadMapManifest(path = DEFAULT_MAP_MANIFEST_PATH) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Map manifest request failed (${response.status}) for ${path}`);
  }

  const json = await response.json();
  return normalizeMapData(json);
}

async function loadSceneTemplate(templateName) {
  const modelPath = MODEL_TEMPLATES[templateName];
  if (!modelPath) {
    throw new Error(`Unknown map template \"${templateName}\".`);
  }

  if (templateName === PRIMITIVE_PLANE_TEMPLATE) {
    const template = new THREE.Group();
    template.name = 'primitive-plane-template';

    const visiblePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x55745d, roughness: 0.95, metalness: 0.02 })
    );
    visiblePlane.rotation.x = -Math.PI / 2;
    visiblePlane.position.y = 0.001;
    visiblePlane.name = 'primitive-plane-surface';
    visiblePlane.userData.forceCastShadow = false;
    visiblePlane.userData.forceReceiveShadow = true;
    template.add(visiblePlane);

    const colliderVolume = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.2, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    colliderVolume.position.y = -0.1;
    colliderVolume.name = 'primitive-plane-collider';
    colliderVolume.userData.mapCollider = true;
    colliderVolume.userData.forceCastShadow = false;
    colliderVolume.userData.forceReceiveShadow = false;
    template.add(colliderVolume);

    return template;
  }

  if (templateName === CUBE_WORLD_GROUND_TEMPLATE) {
    if (templateCache.has(templateName)) {
      return templateCache.get(templateName);
    }

    const sourceBlockTemplate = await loadSceneTemplate(CUBE_WORLD_BLOCK_GRASS_TEMPLATE);
    sourceBlockTemplate.updateMatrixWorld(true);

    let sourceMesh = null;
    sourceBlockTemplate.traverse((node) => {
      if (sourceMesh || !node?.isMesh || !node.geometry || !node.material) {
        return;
      }
      sourceMesh = node;
    });

    if (!sourceMesh) {
      throw new Error(`Template \"${CUBE_WORLD_BLOCK_GRASS_TEMPLATE}\" has no mesh geometry.`);
    }

    const sourceMaterial = Array.isArray(sourceMesh.material) ? sourceMesh.material[0] : sourceMesh.material;
    const cubeGeometry = sourceMesh.geometry.clone();
    cubeGeometry.computeBoundingBox();

    const bounds = cubeGeometry.boundingBox?.clone();
    if (!bounds || bounds.isEmpty()) {
      throw new Error(`Template \"${CUBE_WORLD_BLOCK_GRASS_TEMPLATE}\" has an empty geometry bounds.`);
    }

    const cubeSize = new THREE.Vector3();
    bounds.getSize(cubeSize);

    const stepX = Math.max(cubeSize.x, 0.01);
    const stepZ = Math.max(cubeSize.z, 0.01);
    const baseY = -bounds.max.y;

    const tileCount = CUBE_WORLD_GROUND_TILES_X * CUBE_WORLD_GROUND_TILES_Z;
    const cubeInstances = new THREE.InstancedMesh(cubeGeometry, sourceMaterial.clone(), tileCount);
    cubeInstances.name = 'cube-world-ground-cubes';
    cubeInstances.castShadow = true;
    cubeInstances.receiveShadow = true;
    cubeInstances.frustumCulled = false;

    const minX = -((CUBE_WORLD_GROUND_TILES_X - 1) * stepX) * 0.5;
    const minZ = -((CUBE_WORLD_GROUND_TILES_Z - 1) * stepZ) * 0.5;
    const composePosition = new THREE.Vector3();
    const composeQuaternion = new THREE.Quaternion();
    const composeScale = new THREE.Vector3();
    const instanceMatrix = new THREE.Matrix4();

    sourceMesh.matrixWorld.decompose(composePosition, composeQuaternion, composeScale);
    let instanceIndex = 0;
    for (let z = 0; z < CUBE_WORLD_GROUND_TILES_Z; z += 1) {
      for (let x = 0; x < CUBE_WORLD_GROUND_TILES_X; x += 1) {
        composePosition.set(
          minX + x * stepX,
          baseY,
          minZ + z * stepZ
        );
        instanceMatrix.compose(composePosition, composeQuaternion, composeScale);
        cubeInstances.setMatrixAt(instanceIndex, instanceMatrix);
        instanceIndex += 1;
      }
    }
    cubeInstances.instanceMatrix.needsUpdate = true;
    cubeInstances.raycast = () => {};

    const colliderWidth = CUBE_WORLD_GROUND_TILES_X * stepX;
    const colliderDepth = CUBE_WORLD_GROUND_TILES_Z * stepZ;
    const colliderHeight = 0.25;

    const groundCollider = new THREE.Mesh(
      new THREE.BoxGeometry(colliderWidth, colliderHeight, colliderDepth),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    groundCollider.position.y = -colliderHeight * 0.5;
    groundCollider.name = 'cube-world-ground-mesh-collider';
    groundCollider.userData.mapCollider = true;
    groundCollider.userData.forceCastShadow = false;
    groundCollider.userData.forceReceiveShadow = false;

    const template = new THREE.Group();
    template.name = 'cube-world-ground-template';
    template.add(cubeInstances);
    template.add(groundCollider);

    templateCache.set(templateName, template);
    return template;
  }

  if (templateName === DEMO_SCENE_TEMPLATE) {
    if (templateCache.has(templateName)) {
      return templateCache.get(templateName);
    }

    const sceneRoot = await new Promise((resolve, reject) => {
      gltfLoader.load(
        modelPath,
        (gltf) => resolve(gltf.scene),
        undefined,
        reject
      );
    });

    const template = new THREE.Group();
    template.name = 'demo-scene-template';

    sceneRoot.name = 'demo-scene-visual';
    template.add(sceneRoot);

    sceneRoot.updateMatrixWorld(true);
    const sceneBounds = new THREE.Box3().setFromObject(sceneRoot);
    if (!sceneBounds.isEmpty()) {
      const sceneSize = new THREE.Vector3();
      const sceneCenter = new THREE.Vector3();
      sceneBounds.getSize(sceneSize);
      sceneBounds.getCenter(sceneCenter);

      const colliderHeight = 0.6;
      const groundCollider = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(sceneSize.x + 2, 2),
          colliderHeight,
          Math.max(sceneSize.z + 2, 2)
        ),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      groundCollider.position.set(
        sceneCenter.x,
        sceneBounds.min.y - colliderHeight * 0.5,
        sceneCenter.z
      );
      groundCollider.name = 'demo-scene-ground-collider';
      groundCollider.userData.mapCollider = true;
      groundCollider.userData.forceCastShadow = false;
      groundCollider.userData.forceReceiveShadow = false;
      template.add(groundCollider);
    }

    templateCache.set(templateName, template);
    return template;
  }

  if (templateCache.has(templateName)) {
    return templateCache.get(templateName);
  }

  const template = await new Promise((resolve, reject) => {
    gltfLoader.load(
      modelPath,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject
    );
  });

  templateCache.set(templateName, template);
  return template;
}

function defaultSetMeshShadowFlags(root, { castShadow, receiveShadow }) {
  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const forceCastShadow = typeof node.userData.forceCastShadow === 'boolean'
      ? node.userData.forceCastShadow
      : castShadow;
    const forceReceiveShadow = typeof node.userData.forceReceiveShadow === 'boolean'
      ? node.userData.forceReceiveShadow
      : receiveShadow;

    node.castShadow = forceCastShadow;
    node.receiveShadow = forceReceiveShadow;
  });
}

function clearGroup(group) {
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
}

export function createRuntimeState(scene) {
  const worldRoot = new THREE.Group();
  worldRoot.name = 'map-world-root';

  const hitboxRoot = new THREE.Group();
  hitboxRoot.name = 'map-hitbox-root';

  scene.add(worldRoot);
  scene.add(hitboxRoot);

  return {
    worldRoot,
    hitboxRoot,
    objectEntries: new Map(),
    hitboxEntries: new Map(),
    mapData: normalizeMapData({})
  };
}

export function createHitboxMesh(hitboxEntry, debugVisible = false) {
  const isCapsule = hitboxEntry.type === 'capsule';
  const geometry = isCapsule
    ? new THREE.CapsuleGeometry(hitboxEntry.radius, hitboxEntry.height, 8, 12)
    : new THREE.BoxGeometry(hitboxEntry.size[0], hitboxEntry.size[1], hitboxEntry.size[2]);

  const color = isCapsule ? 0xffac56 : 0x58ccff;
  const material = new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: debugVisible ? 0.28 : 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.name = `hitbox-${hitboxEntry.id}`;
  mesh.userData.mapHitboxId = hitboxEntry.id;
  mesh.userData.mapHitboxType = hitboxEntry.type;
  mesh.userData.mapEntryKind = 'hitbox';

  if (isCapsule) {
    mesh.userData.hitboxBase = {
      radius: hitboxEntry.radius,
      height: hitboxEntry.height
    };
  } else {
    mesh.userData.hitboxBase = {
      size: [...hitboxEntry.size]
    };
  }

  return mesh;
}

export function setHitboxMeshDebug(mesh, debugVisible, selected = false) {
  if (!(mesh?.material instanceof THREE.MeshBasicMaterial)) {
    return;
  }

  const isCapsule = mesh.userData.mapHitboxType === 'capsule';
  const baseColor = isCapsule ? 0xffac56 : 0x58ccff;
  mesh.material.color.setHex(selected ? 0xfff057 : baseColor);
  mesh.material.opacity = debugVisible ? (selected ? 0.45 : 0.28) : 0;
  mesh.material.needsUpdate = true;
}

function applyCameraPreset(camera, config, cameraPreset) {
  if (camera) {
    camera.position.set(
      cameraPreset.localOffset[0],
      cameraPreset.localOffset[1],
      cameraPreset.localOffset[2]
    );

    camera.fov = cameraPreset.fov;
    camera.updateProjectionMatrix();
  }

  if (config) {
    config.minPitch = cameraPreset.pitchMin;
    config.maxPitch = cameraPreset.pitchMax;
    config.playerHeight = cameraPreset.localOffset[1];
  }
}

function collectObjectColliders(objectNode) {
  const explicitColliders = [];
  objectNode.traverse((node) => {
    if (node?.userData?.mapCollider === true) {
      explicitColliders.push(node);
    }
  });

  if (explicitColliders.length > 0) {
    return explicitColliders;
  }

  return [objectNode];
}

export async function applyMapData(scene, playerRig, colliders, options = {}) {
  const mapData = normalizeMapData(options.mapData);
  const camera = options.camera ?? null;
  const config = options.config ?? null;
  const setMeshShadowFlags = options.setMeshShadowFlags ?? defaultSetMeshShadowFlags;
  const runtimeState = options.runtimeState ?? createRuntimeState(scene);

  clearGroup(runtimeState.worldRoot);
  clearGroup(runtimeState.hitboxRoot);
  runtimeState.objectEntries.clear();
  runtimeState.hitboxEntries.clear();

  colliders.length = 0;
  runtimeState.mapData = cloneMapData(mapData);

  for (const objectEntry of runtimeState.mapData.objects) {
    const template = await loadSceneTemplate(objectEntry.template);
    const objectNode = template.clone(true);

    objectNode.position.set(
      objectEntry.position[0],
      objectEntry.position[1],
      objectEntry.position[2]
    );

    objectNode.rotation.set(
      objectEntry.rotation[0],
      objectEntry.rotation[1],
      objectEntry.rotation[2]
    );

    objectNode.scale.set(
      objectEntry.scale[0],
      objectEntry.scale[1],
      objectEntry.scale[2]
    );

    objectNode.userData.mapObjectId = objectEntry.id;
    objectNode.userData.mapObjectTemplate = objectEntry.template;
    objectNode.userData.mapEntryKind = 'world-object';

    setMeshShadowFlags(objectNode, { castShadow: true, receiveShadow: true });
    runtimeState.worldRoot.add(objectNode);
    runtimeState.objectEntries.set(objectEntry.id, objectNode);

    const objectColliders = collectObjectColliders(objectNode);
    for (const colliderNode of objectColliders) {
      colliders.push(colliderNode);
    }
  }

  applyCameraPreset(camera, config, runtimeState.mapData.cameraPreset);

  for (const hitboxEntry of runtimeState.mapData.hitboxes) {
    const hitboxMesh = createHitboxMesh(hitboxEntry, false);

    hitboxMesh.position.set(
      hitboxEntry.position[0],
      hitboxEntry.position[1],
      hitboxEntry.position[2]
    );

    hitboxMesh.rotation.set(
      hitboxEntry.rotation[0],
      hitboxEntry.rotation[1],
      hitboxEntry.rotation[2]
    );

    const attachTarget = hitboxEntry.attachToObjectId
      ? runtimeState.objectEntries.get(hitboxEntry.attachToObjectId)
      : null;

    if (attachTarget) {
      attachTarget.add(hitboxMesh);
    } else {
      runtimeState.hitboxRoot.add(hitboxMesh);
    }

    runtimeState.hitboxEntries.set(hitboxEntry.id, hitboxMesh);
    colliders.push(hitboxMesh);
  }

  if (runtimeState.mapData.hitboxes.length === 0) {
    const implicitGround = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );

    implicitGround.rotation.x = -Math.PI / 2;
    implicitGround.name = 'implicit-ground-hitbox';
    runtimeState.hitboxRoot.add(implicitGround);
    colliders.push(implicitGround);
  }

  playerRig.updateMatrixWorld(true);
  return runtimeState;
}

export function serializeVector3(vector) {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

export function serializeEuler(euler) {
  return [round(euler.x), round(euler.y), round(euler.z)];
}

export function getMineZoneAabbs(runtimeState) {
  if (!runtimeState?.mapData?.hitboxes || !runtimeState?.hitboxEntries) {
    return [];
  }

  const hitboxById = new Map();
  for (const entry of runtimeState.mapData.hitboxes) {
    hitboxById.set(entry.id, entry);
  }

  const mineZones = [];
  for (const [hitboxId, mesh] of runtimeState.hitboxEntries.entries()) {
    const entry = hitboxById.get(hitboxId);
    if (!entry || entry.layer !== 'mine-zone' || entry.type !== 'box') {
      continue;
    }

    mesh.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) {
      continue;
    }

    mineZones.push({
      id: hitboxId,
      min: {
        x: box.min.x,
        y: box.min.y,
        z: box.min.z
      },
      max: {
        x: box.max.x,
        y: box.max.y,
        z: box.max.z
      }
    });
  }

  return mineZones;
}
