import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  getBlockworldBiomePreset,
  normalizeBlockworldBiome
} from './blockworldStyleRuntime.js';

function withBaseUrl(path) {
  const baseUrl = typeof import.meta?.env?.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

export const MAP_MANIFEST_VERSION = 1;
export const DEFAULT_MAP_MANIFEST_PATH = withBaseUrl('maps/default-map.v1.json');
export const CAMERA_PRESET_PITCH_MIN_FLOOR = -THREE.MathUtils.degToRad(85);
export const CAMERA_PRESET_PITCH_MAX_CEIL = Math.PI / 2;

const PRIMITIVE_PLANE_TEMPLATE = 'primitive-plane';
const CUBE_WORLD_BLOCK_GRASS_TEMPLATE = 'cube-world-block-grass';
const CUBE_WORLD_BLOCK_STONE_TEMPLATE = 'cube-world-block-stone';
const CUBE_WORLD_GROUND_TEMPLATE = 'cube-world-ground';
const DEMO_SCENE_TEMPLATE = 'demo-scene';
const CUBE_WORLD_GROUND_TILES_X = 48;
const CUBE_WORLD_GROUND_TILES_Z = 48;
const CUBE_WORLD_STONE_PATCH_TILES_X = 16;
const CUBE_WORLD_STONE_PATCH_TILES_Z = 16;
const CUBE_WORLD_STONE_PATCH_TILES_Y = 8;
const CUBE_WORLD_STONE_PATCH_START_X = 28;
const CUBE_WORLD_STONE_PATCH_START_Z = 28;
const NON_STYLIZED_WORLD_TEMPLATES = new Set([
  DEMO_SCENE_TEMPLATE,
  'character-male-a'
]);
const CHARACTER_TEMPLATE_PREFIX = 'blocky-character-';

const blockyCharacterTemplateEntries = Array.from('abcdefghijklmnopqr').map((letter) => ([
  `blocky-character-${letter}`,
  withBaseUrl(`models/characters/kenney-blocky/character-${letter}.glb`)
]));

export const MODEL_TEMPLATES = {
  [PRIMITIVE_PLANE_TEMPLATE]: '__procedural__/primitive-plane',
  [CUBE_WORLD_BLOCK_GRASS_TEMPLATE]: withBaseUrl('models/cube-world/Blocks/glTF/Block_Grass.gltf'),
  [CUBE_WORLD_BLOCK_STONE_TEMPLATE]: withBaseUrl('models/cube-world/Blocks/glTF/Block_Stone.gltf'),
  [CUBE_WORLD_GROUND_TEMPLATE]: '__procedural__/cube-world-ground',
  [DEMO_SCENE_TEMPLATE]: withBaseUrl('models/maps/demo-scene/Demo.gltf'),
  'cube-world-tree-1': withBaseUrl('models/cube-world/Environment/glTF/Tree_1.gltf'),
  'cube-world-tree-2': withBaseUrl('models/cube-world/Environment/glTF/Tree_2.gltf'),
  'cube-world-tree-3': withBaseUrl('models/cube-world/Environment/glTF/Tree_3.gltf'),
  'cube-world-rock-1': withBaseUrl('models/cube-world/Environment/glTF/Rock1.gltf'),
  'cube-world-rock-2': withBaseUrl('models/cube-world/Environment/glTF/Rock2.gltf'),
  'cube-world-mushroom': withBaseUrl('models/cube-world/Environment/glTF/Mushroom.gltf'),
  'cube-world-fence-center': withBaseUrl('models/cube-world/Environment/glTF/Fence_Center.gltf'),
  'cube-world-fence-corner': withBaseUrl('models/cube-world/Environment/glTF/Fence_Corner.gltf'),
  'cube-world-fence-end': withBaseUrl('models/cube-world/Environment/glTF/Fence_End.gltf'),
  'cube-world-sugarcane': withBaseUrl('models/cube-world/Environment/glTF/Bamboo.gltf'),
  'cube-world-flowers-1': withBaseUrl('models/cube-world/Environment/glTF/Flowers_1.gltf'),
  'cube-world-flowers-2': withBaseUrl('models/cube-world/Environment/glTF/Flowers_2.gltf'),
  'cube-world-grass-small': withBaseUrl('models/cube-world/Environment/glTF/Grass_Small.gltf'),
  'cube-world-grass-big': withBaseUrl('models/cube-world/Environment/glTF/Grass_Big.gltf'),
  'block-grass': withBaseUrl('models/platformer/block-grass.glb'),
  'block-grass-low': withBaseUrl('models/platformer/block-grass-low.glb'),
  'block-grass-large': withBaseUrl('models/platformer/block-grass-large.glb'),
  'block-grass-corner': withBaseUrl('models/platformer/block-grass-corner.glb'),
  'character-male-a': withBaseUrl('models/characters/character-male-a.glb'),
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
  const pitchFloor = CAMERA_PRESET_PITCH_MIN_FLOOR;
  const pitchCeil = CAMERA_PRESET_PITCH_MAX_CEIL;
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

function normalizeSpawnPreset(spawnPreset) {
  return {
    position: normalizeVector3(spawnPreset?.position, [0, 0, 10]),
    yaw: toFiniteNumber(spawnPreset?.yaw, 0)
  };
}

export function normalizeMapData(rawMapData) {
  const source = rawMapData && typeof rawMapData === 'object' ? rawMapData : {};

  return {
    version: MAP_MANIFEST_VERSION,
    biomeLighting: normalizeBlockworldBiome(source.biomeLighting ?? source.biome),
    objects: Array.isArray(source.objects)
      ? source.objects.map((entry, index) => normalizeObjectEntry(entry, index))
      : [],
    cameraPreset: normalizeCameraPreset(source.cameraPreset),
    playerPreset: normalizePlayerPreset(source.playerPreset),
    spawnPreset: normalizeSpawnPreset(source.spawnPreset),
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

function firstRenderableMesh(root) {
  let mesh = null;
  root?.traverse((node) => {
    if (mesh || !node?.isMesh || !node.geometry || !node.material) {
      return;
    }
    mesh = node;
  });
  return mesh;
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
    colliderVolume.userData.colliderShape = 'bounds';
    colliderVolume.userData.forceCastShadow = false;
    colliderVolume.userData.forceReceiveShadow = false;
    template.add(colliderVolume);

    return template;
  }

  if (templateName === CUBE_WORLD_GROUND_TEMPLATE) {
    if (templateCache.has(templateName)) {
      return templateCache.get(templateName);
    }

    const sourceGrassTemplate = await loadSceneTemplate(CUBE_WORLD_BLOCK_GRASS_TEMPLATE);
    const sourceStoneTemplate = await loadSceneTemplate(CUBE_WORLD_BLOCK_STONE_TEMPLATE);
    sourceGrassTemplate.updateMatrixWorld(true);
    sourceStoneTemplate.updateMatrixWorld(true);

    const sourceGrassMesh = firstRenderableMesh(sourceGrassTemplate);
    const sourceStoneMesh = firstRenderableMesh(sourceStoneTemplate);

    if (!sourceGrassMesh) {
      throw new Error(`Template \"${CUBE_WORLD_BLOCK_GRASS_TEMPLATE}\" has no mesh geometry.`);
    }
    if (!sourceStoneMesh) {
      throw new Error(`Template \"${CUBE_WORLD_BLOCK_STONE_TEMPLATE}\" has no mesh geometry.`);
    }

    const sourceGrassMaterial = Array.isArray(sourceGrassMesh.material)
      ? sourceGrassMesh.material[0]
      : sourceGrassMesh.material;
    const sourceStoneMaterial = Array.isArray(sourceStoneMesh.material)
      ? sourceStoneMesh.material[0]
      : sourceStoneMesh.material;
    const grassGeometry = sourceGrassMesh.geometry.clone();
    const stoneGeometry = sourceStoneMesh.geometry.clone();
    grassGeometry.computeBoundingBox();

    const bounds = grassGeometry.boundingBox?.clone();
    if (!bounds || bounds.isEmpty()) {
      throw new Error(`Template \"${CUBE_WORLD_BLOCK_GRASS_TEMPLATE}\" has an empty geometry bounds.`);
    }

    const cubeSize = new THREE.Vector3();
    bounds.getSize(cubeSize);

    const stepX = Math.max(cubeSize.x, 0.01);
    const stepY = Math.max(cubeSize.y, 0.01);
    const stepZ = Math.max(cubeSize.z, 0.01);
    const baseY = -bounds.max.y;
    const patchEndX = Math.min(CUBE_WORLD_STONE_PATCH_START_X + CUBE_WORLD_STONE_PATCH_TILES_X, CUBE_WORLD_GROUND_TILES_X);
    const patchEndZ = Math.min(CUBE_WORLD_STONE_PATCH_START_Z + CUBE_WORLD_STONE_PATCH_TILES_Z, CUBE_WORLD_GROUND_TILES_Z);
    const patchWidth = Math.max(patchEndX - CUBE_WORLD_STONE_PATCH_START_X, 0);
    const patchDepth = Math.max(patchEndZ - CUBE_WORLD_STONE_PATCH_START_Z, 0);
    const patchArea = patchWidth * patchDepth;

    const grassTileCount = CUBE_WORLD_GROUND_TILES_X * CUBE_WORLD_GROUND_TILES_Z - patchArea;
    const stoneTileCount = patchArea * CUBE_WORLD_STONE_PATCH_TILES_Y;

    const grassInstances = new THREE.InstancedMesh(grassGeometry, sourceGrassMaterial.clone(), grassTileCount);
    grassInstances.name = 'cube-world-ground-grass-cubes';
    grassInstances.castShadow = true;
    grassInstances.receiveShadow = true;
    grassInstances.frustumCulled = false;

    const stoneInstances = new THREE.InstancedMesh(stoneGeometry, sourceStoneMaterial.clone(), stoneTileCount);
    stoneInstances.name = 'cube-world-ground-stone-cubes';
    stoneInstances.castShadow = true;
    stoneInstances.receiveShadow = true;
    stoneInstances.frustumCulled = false;

    const minX = -((CUBE_WORLD_GROUND_TILES_X - 1) * stepX) * 0.5;
    const minZ = -((CUBE_WORLD_GROUND_TILES_Z - 1) * stepZ) * 0.5;
    const composePosition = new THREE.Vector3();
    const meshOrigin = new THREE.Vector3();
    const grassQuaternion = new THREE.Quaternion();
    const stoneQuaternion = new THREE.Quaternion();
    const grassScale = new THREE.Vector3();
    const stoneScale = new THREE.Vector3();
    const instanceMatrix = new THREE.Matrix4();

    sourceGrassMesh.matrixWorld.decompose(meshOrigin, grassQuaternion, grassScale);
    sourceStoneMesh.matrixWorld.decompose(meshOrigin, stoneQuaternion, stoneScale);
    let grassIndex = 0;
    let stoneIndex = 0;
    for (let z = 0; z < CUBE_WORLD_GROUND_TILES_Z; z += 1) {
      for (let x = 0; x < CUBE_WORLD_GROUND_TILES_X; x += 1) {
        const withinStonePatch = (
          x >= CUBE_WORLD_STONE_PATCH_START_X
          && x < patchEndX
          && z >= CUBE_WORLD_STONE_PATCH_START_Z
          && z < patchEndZ
        );

        if (withinStonePatch) {
          for (let yLayer = 0; yLayer < CUBE_WORLD_STONE_PATCH_TILES_Y; yLayer += 1) {
            composePosition.set(
              minX + x * stepX,
              baseY - yLayer * stepY,
              minZ + z * stepZ
            );
            instanceMatrix.compose(composePosition, stoneQuaternion, stoneScale);
            stoneInstances.setMatrixAt(stoneIndex, instanceMatrix);
            stoneIndex += 1;
          }
          continue;
        }

        composePosition.set(minX + x * stepX, baseY, minZ + z * stepZ);
        instanceMatrix.compose(composePosition, grassQuaternion, grassScale);
        grassInstances.setMatrixAt(grassIndex, instanceMatrix);
        grassIndex += 1;
      }
    }
    grassInstances.instanceMatrix.needsUpdate = true;
    grassInstances.raycast = () => {};
    stoneInstances.instanceMatrix.needsUpdate = true;
    stoneInstances.raycast = () => {};

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
    groundCollider.userData.colliderShape = 'bounds';
    groundCollider.userData.forceCastShadow = false;
    groundCollider.userData.forceReceiveShadow = false;

    const template = new THREE.Group();
    template.name = 'cube-world-ground-template';
    template.add(grassInstances);
    template.add(stoneInstances);
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
    const sceneBounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();
    let hasMeshBounds = false;

    sceneRoot.traverse((node) => {
      if (!node?.isMesh) {
        return;
      }

      const nodeBounds = meshBounds.setFromObject(node);
      if (nodeBounds.isEmpty()) {
        return;
      }

      if (!hasMeshBounds) {
        sceneBounds.copy(nodeBounds);
        hasMeshBounds = true;
        return;
      }

      sceneBounds.union(nodeBounds);
    });

    if (!hasMeshBounds) {
      sceneBounds.setFromObject(sceneRoot);
    }

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
        -colliderHeight * 0.5,
        sceneCenter.z
      );
      groundCollider.name = 'demo-scene-ground-collider';
      groundCollider.userData.mapCollider = true;
      groundCollider.userData.colliderShape = 'bounds';
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

function resolveStylizedSurfaceColor(templateName, biomePreset) {
  if (templateName === PRIMITIVE_PLANE_TEMPLATE) {
    return biomePreset.surface.planeColor;
  }
  return biomePreset.surface.grassColor;
}

function shouldApplyStylizedBlockworldMaterial(templateName) {
  if (typeof templateName !== 'string' || templateName.length === 0) {
    return false;
  }
  if (NON_STYLIZED_WORLD_TEMPLATES.has(templateName)) {
    return false;
  }
  if (templateName.startsWith(CHARACTER_TEMPLATE_PREFIX)) {
    return false;
  }
  if (templateName === PRIMITIVE_PLANE_TEMPLATE) {
    return true;
  }
  // Preserve authored Cube World textures (ground + props) and stylize only
  // locally-authored block/plane templates.
  return templateName.startsWith('block-grass');
}

function applyStylizedBlockworldMaterials(root, templateName, biomeLighting) {
  if (!shouldApplyStylizedBlockworldMaterial(templateName)) {
    return;
  }

  const biomePreset = getBlockworldBiomePreset(biomeLighting);
  const surfaceColor = resolveStylizedSurfaceColor(templateName, biomePreset);
  const emissiveColor = biomePreset.surface.grassEmissive;

  root.traverse((node) => {
    if (
      !node?.isMesh
      || node?.userData?.mapCollider === true
      || node?.userData?.skipStylizedBlockworldMaterial === true
    ) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }

      if ('map' in material && material.map) {
        material.map = null;
      }
      if ('normalMap' in material && material.normalMap) {
        material.normalMap = null;
      }
      if ('roughnessMap' in material && material.roughnessMap) {
        material.roughnessMap = null;
      }
      if ('metalnessMap' in material && material.metalnessMap) {
        material.metalnessMap = null;
      }
      if ('aoMap' in material && material.aoMap) {
        material.aoMap = null;
      }
      if ('emissiveMap' in material && material.emissiveMap) {
        material.emissiveMap = null;
      }

      if ('color' in material && material.color) {
        material.color.setHex(surfaceColor);
      }
      if ('emissive' in material && material.emissive) {
        material.emissive.setHex(emissiveColor);
      }
      if ('emissiveIntensity' in material) {
        material.emissiveIntensity = 0.05;
      }
      if ('roughness' in material) {
        material.roughness = 1;
      }
      if ('metalness' in material) {
        material.metalness = 0;
      }
      if ('envMapIntensity' in material) {
        material.envMapIntensity = 0;
      }

      material.needsUpdate = true;
    }
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
  mesh.userData.colliderShape = 'bounds';

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
      node.userData.colliderShape = 'bounds';
      explicitColliders.push(node);
    }
  });

  if (explicitColliders.length > 0) {
    return explicitColliders;
  }

  const implicitMeshColliders = [];
  objectNode.traverse((node) => {
    if (!node?.isMesh || !node.geometry) {
      return;
    }

    node.userData.colliderShape = 'mesh';
    implicitMeshColliders.push(node);
  });

  if (implicitMeshColliders.length > 0) {
    return implicitMeshColliders;
  }

  objectNode.userData.colliderShape = 'bounds';
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

    applyStylizedBlockworldMaterials(
      objectNode,
      objectEntry.template,
      runtimeState.mapData.biomeLighting
    );
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
