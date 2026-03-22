import * as THREE from 'three';
import {
  DEFAULT_BLOCKWORLD_BIOME,
  getBlockworldBiomePreset,
  normalizeBlockworldBiome
} from './blockworldStyleRuntime.js';

const DEFAULT_CHUNK_SIZE = 16;
const DEFAULT_SUBCHUNK_HEIGHT = 16;
const EPSILON = 1e-4;
const HOVER_OVERLAY_THICKNESS = 0.018;

function createHoverOutlineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uThickness: { value: HOVER_OVERLAY_THICKNESS },
      uOpacity: { value: 0.92 }
    },
    vertexShader: `
      uniform float uThickness;

      void main() {
        vec3 expandedPosition = position + (normal * uThickness);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(expandedPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;

      void main() {
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false
  });
}

function cloneVoxel(voxel) {
  if (!voxel) {
    return null;
  }
  return {
    x: voxel.x,
    y: voxel.y,
    z: voxel.z
  };
}

function areVoxelsEqual(a, b) {
  return Boolean(a) && Boolean(b)
    && a.x === b.x
    && a.y === b.y
    && a.z === b.z;
}

function parseChunkId(chunkId) {
  const parts = String(chunkId || '').split(':').map((value) => Number(value));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return { chunkX: 0, chunkY: 0, chunkZ: 0 };
  }
  return {
    chunkX: parts[0],
    chunkY: parts[1],
    chunkZ: parts[2]
  };
}

function voxelIndex(x, y, z, size, height) {
  return y * size * size + z * size + x;
}

function worldToChunk(x, y, z, chunkSize, subchunkHeight) {
  const chunkX = Math.floor(x / chunkSize);
  const chunkY = Math.floor(y / subchunkHeight);
  const chunkZ = Math.floor(z / chunkSize);

  const localX = ((x % chunkSize) + chunkSize) % chunkSize;
  const localY = ((y % subchunkHeight) + subchunkHeight) % subchunkHeight;
  const localZ = ((z % chunkSize) + chunkSize) % chunkSize;

  return {
    chunkX,
    chunkY,
    chunkZ,
    localX,
    localY,
    localZ,
    chunkId: `${chunkX}:${chunkY}:${chunkZ}`
  };
}

function decodeChunkBytes(base64) {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function clamp01(value) {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function hexToRgbArray(hex) {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
}

function createVoxelStyleState(biomePreset) {
  const style = biomePreset?.voxel || {};
  const palette = {};

  for (const [key, value] of Object.entries(style.palette || {})) {
    palette[String(key)] = hexToRgbArray(value);
  }

  const rawDirection = Array.isArray(style.sunDirection) ? style.sunDirection : [0.58, 0.0, -0.44];
  const sunDirection = [
    Number(rawDirection[0]) || 0,
    Number(rawDirection[1]) || 0,
    Number(rawDirection[2]) || 0
  ];
  const directionLength = Math.hypot(sunDirection[0], sunDirection[1], sunDirection[2]) || 1;

  return {
    palette,
    topWarmTint: hexToRgbArray(style.topWarmTint ?? 0xffdfad),
    sideCoolTint: hexToRgbArray(style.sideCoolTint ?? 0x7a9eb8),
    bottomShadowTint: hexToRgbArray(style.bottomShadowTint ?? 0x4f6777),
    heightHighTint: hexToRgbArray(style.heightHighTint ?? 0xc3dd9f),
    heightLowTint: hexToRgbArray(style.heightLowTint ?? 0x556070),
    topBrightness: Number.isFinite(style.topBrightness) ? style.topBrightness : 1.16,
    sideBrightness: Number.isFinite(style.sideBrightness) ? style.sideBrightness : 0.86,
    bottomBrightness: Number.isFinite(style.bottomBrightness) ? style.bottomBrightness : 0.62,
    sideSunBoost: Number.isFinite(style.sideSunBoost) ? style.sideSunBoost : 0.2,
    sideShadowTint: Number.isFinite(style.sideShadowTint) ? style.sideShadowTint : 0.28,
    topWarmTintAmount: Number.isFinite(style.topWarmTintAmount) ? style.topWarmTintAmount : 0.18,
    bottomTintAmount: Number.isFinite(style.bottomTintAmount) ? style.bottomTintAmount : 0.34,
    heightHighAmount: Number.isFinite(style.heightHighAmount) ? style.heightHighAmount : 0.08,
    heightLowAmount: Number.isFinite(style.heightLowAmount) ? style.heightLowAmount : 0.06,
    heightOffset: Number.isFinite(style.heightOffset) ? style.heightOffset : 8,
    heightRange: Number.isFinite(style.heightRange) ? style.heightRange : 32,
    sunDirection: [
      sunDirection[0] / directionLength,
      sunDirection[1] / directionLength,
      sunDirection[2] / directionLength
    ],
    emissive: Number.isFinite(style.emissive) ? style.emissive : 0x17221f,
    emissiveIntensity: Number.isFinite(style.emissiveIntensity) ? style.emissiveIntensity : 0.04
  };
}

function resolveColor(value, styleState) {
  return styleState.palette[String(value)]
    || styleState.palette.default
    || [0.47, 0.33, 0.24];
}

function shadeVoxelCornerColor(baseColor, normal, y, styleState) {
  const isTop = normal[1] > 0.5;
  const isBottom = normal[1] < -0.5;

  const sunInfluence = clamp01(
    normal[0] * styleState.sunDirection[0]
    + normal[1] * styleState.sunDirection[1]
    + normal[2] * styleState.sunDirection[2]
  );

  let brightness = styleState.sideBrightness;
  if (isTop) {
    brightness = styleState.topBrightness;
  } else if (isBottom) {
    brightness = styleState.bottomBrightness;
  } else {
    brightness += sunInfluence * styleState.sideSunBoost;
  }

  let r = baseColor[0] * brightness;
  let g = baseColor[1] * brightness;
  let b = baseColor[2] * brightness;

  if (isTop) {
    const tintAmount = styleState.topWarmTintAmount;
    r += (styleState.topWarmTint[0] - r) * tintAmount;
    g += (styleState.topWarmTint[1] - g) * tintAmount;
    b += (styleState.topWarmTint[2] - b) * tintAmount;
  } else if (isBottom) {
    const tintAmount = styleState.bottomTintAmount;
    r += (styleState.bottomShadowTint[0] - r) * tintAmount;
    g += (styleState.bottomShadowTint[1] - g) * tintAmount;
    b += (styleState.bottomShadowTint[2] - b) * tintAmount;
  } else {
    const tintAmount = (1 - sunInfluence) * styleState.sideShadowTint;
    r += (styleState.sideCoolTint[0] - r) * tintAmount;
    g += (styleState.sideCoolTint[1] - g) * tintAmount;
    b += (styleState.sideCoolTint[2] - b) * tintAmount;
  }

  const heightNorm = clamp01((y + styleState.heightOffset) / Math.max(styleState.heightRange, 1e-4));
  const highAmount = heightNorm * styleState.heightHighAmount;
  const lowAmount = (1 - heightNorm) * styleState.heightLowAmount;

  r += (styleState.heightHighTint[0] - r) * highAmount;
  g += (styleState.heightHighTint[1] - g) * highAmount;
  b += (styleState.heightHighTint[2] - b) * highAmount;

  r += (styleState.heightLowTint[0] - r) * lowAmount;
  g += (styleState.heightLowTint[1] - g) * lowAmount;
  b += (styleState.heightLowTint[2] - b) * lowAmount;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

function inMineZone(mineZones, voxel) {
  if (!Array.isArray(mineZones) || mineZones.length === 0) {
    return false;
  }

  for (const zone of mineZones) {
    if (!zone?.min || !zone?.max) {
      continue;
    }
    if (
      voxel.x >= zone.min.x && voxel.x <= zone.max.x
      && voxel.y >= zone.min.y && voxel.y <= zone.max.y
      && voxel.z >= zone.min.z && voxel.z <= zone.max.z
    ) {
      return true;
    }
  }

  return false;
}

function buildChunkGeometry(chunk, styleState) {
  const { chunkX, chunkY, chunkZ, chunkSize, subchunkHeight, bytes } = chunk;
  const dims = [chunkSize, subchunkHeight, chunkSize];

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  let vertexOffset = 0;

  const valueAt = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= chunkSize || y >= subchunkHeight || z >= chunkSize) {
      return 0;
    }
    return bytes[voxelIndex(x, y, z, chunkSize, subchunkHeight)] || 0;
  };

  for (let d = 0; d < 3; d += 1) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;

    const q = [0, 0, 0];
    q[d] = 1;

    const x = [0, 0, 0];
    const dimsU = dims[u];
    const dimsV = dims[v];
    const mask = new Array(dimsU * dimsV);

    for (x[d] = -1; x[d] < dims[d];) {
      let n = 0;

      for (x[v] = 0; x[v] < dimsV; x[v] += 1) {
        for (x[u] = 0; x[u] < dimsU; x[u] += 1) {
          const a = x[d] >= 0 ? valueAt(x[0], x[1], x[2]) : 0;
          const b = x[d] < dims[d] - 1 ? valueAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;

          if (!!a === !!b) {
            mask[n++] = null;
          } else if (a) {
            mask[n++] = { value: a, sign: 1 };
          } else {
            mask[n++] = { value: b, sign: -1 };
          }
        }
      }

      x[d] += 1;
      n = 0;

      for (let j = 0; j < dimsV; j += 1) {
        for (let i = 0; i < dimsU;) {
          const cell = mask[n];
          if (!cell) {
            i += 1;
            n += 1;
            continue;
          }

          let w = 1;
          while (i + w < dimsU) {
            const next = mask[n + w];
            if (!next || next.value !== cell.value || next.sign !== cell.sign) {
              break;
            }
            w += 1;
          }

          let h = 1;
          let done = false;
          while (j + h < dimsV && !done) {
            for (let k = 0; k < w; k += 1) {
              const next = mask[n + k + h * dimsU];
              if (!next || next.value !== cell.value || next.sign !== cell.sign) {
                done = true;
                break;
              }
            }
            if (!done) {
              h += 1;
            }
          }

          x[u] = i;
          x[v] = j;

          const du = [0, 0, 0];
          const dv = [0, 0, 0];
          du[u] = w;
          dv[v] = h;

          const worldBase = [
            x[0] + chunkX * chunkSize,
            x[1] + chunkY * subchunkHeight,
            x[2] + chunkZ * chunkSize
          ];

          const corners = cell.sign > 0
            ? [
              [worldBase[0], worldBase[1], worldBase[2]],
              [worldBase[0] + du[0], worldBase[1] + du[1], worldBase[2] + du[2]],
              [worldBase[0] + du[0] + dv[0], worldBase[1] + du[1] + dv[1], worldBase[2] + du[2] + dv[2]],
              [worldBase[0] + dv[0], worldBase[1] + dv[1], worldBase[2] + dv[2]]
            ]
            : [
              [worldBase[0], worldBase[1], worldBase[2]],
              [worldBase[0] + dv[0], worldBase[1] + dv[1], worldBase[2] + dv[2]],
              [worldBase[0] + du[0] + dv[0], worldBase[1] + du[1] + dv[1], worldBase[2] + du[2] + dv[2]],
              [worldBase[0] + du[0], worldBase[1] + du[1], worldBase[2] + du[2]]
            ];

          const normal = [0, 0, 0];
          normal[d] = cell.sign;
          const baseColor = resolveColor(cell.value, styleState);

          for (const corner of corners) {
            const shadedColor = shadeVoxelCornerColor(baseColor, normal, corner[1], styleState);
            positions.push(corner[0], corner[1], corner[2]);
            normals.push(normal[0], normal[1], normal[2]);
            colors.push(shadedColor[0], shadedColor[1], shadedColor[2]);
          }

          indices.push(
            vertexOffset,
            vertexOffset + 1,
            vertexOffset + 2,
            vertexOffset,
            vertexOffset + 2,
            vertexOffset + 3
          );
          vertexOffset += 4;

          for (let dy = 0; dy < h; dy += 1) {
            for (let dx = 0; dx < w; dx += 1) {
              mask[n + dx + dy * dimsU] = null;
            }
          }

          i += w;
          n += w;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createVoxelRuntime({ scene }) {
  const root = new THREE.Group();
  root.name = 'voxel-runtime-root';
  scene.add(root);

  let activeBiome = DEFAULT_BLOCKWORLD_BIOME;
  let styleState = createVoxelStyleState(getBlockworldBiomePreset(activeBiome));

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: new THREE.Color(styleState.emissive),
    emissiveIntensity: styleState.emissiveIntensity
  });
  const hoverOutlineGeometry = new THREE.BoxGeometry(1, 1, 1);
  const hoverOutlineMaterial = createHoverOutlineMaterial();
  const hoverOutlineMesh = new THREE.Mesh(hoverOutlineGeometry, hoverOutlineMaterial);
  hoverOutlineMesh.name = 'voxel-hover-outline';
  hoverOutlineMesh.visible = false;
  hoverOutlineMesh.frustumCulled = false;
  hoverOutlineMesh.renderOrder = 1100;
  root.add(hoverOutlineMesh);

  const chunks = new Map();
  let mineZones = [];
  let hoveredVoxel = null;

  function enableOutlineAutoTransform() {
    if (!hoverOutlineMesh.matrixAutoUpdate) {
      hoverOutlineMesh.matrixAutoUpdate = true;
      hoverOutlineMesh.matrix.identity();
      hoverOutlineMesh.matrixWorldNeedsUpdate = true;
    }
  }

  function applyMaterialStyle() {
    material.emissive.setHex(styleState.emissive);
    material.emissiveIntensity = styleState.emissiveIntensity;
    material.needsUpdate = true;
  }

  function getChunkRecord(chunkId) {
    return chunks.get(chunkId) || null;
  }

  function rebuildChunkMesh(record) {
    const geometry = buildChunkGeometry(record, styleState);
    if (!record.mesh) {
      record.mesh = new THREE.Mesh(geometry, material);
      record.mesh.castShadow = true;
      record.mesh.receiveShadow = true;
      record.mesh.frustumCulled = true;
      root.add(record.mesh);
      return;
    }

    record.mesh.geometry.dispose();
    record.mesh.geometry = geometry;
  }

  function upsertChunk(chunkData) {
    const fallbackChunkCoords = parseChunkId(chunkData.chunkId);
    const record = chunks.get(chunkData.chunkId) || {
      chunkId: chunkData.chunkId,
      chunkX: fallbackChunkCoords.chunkX,
      chunkY: fallbackChunkCoords.chunkY,
      chunkZ: fallbackChunkCoords.chunkZ,
      chunkSize: chunkData.chunk_size || chunkData.chunkSize || DEFAULT_CHUNK_SIZE,
      subchunkHeight: chunkData.subchunk_height || chunkData.subchunkHeight || DEFAULT_SUBCHUNK_HEIGHT,
      bytes: null,
      mesh: null
    };

    record.chunkX = Number.isFinite(chunkData.chunkX) ? chunkData.chunkX : record.chunkX;
    record.chunkY = Number.isFinite(chunkData.chunkY) ? chunkData.chunkY : record.chunkY;
    record.chunkZ = Number.isFinite(chunkData.chunkZ) ? chunkData.chunkZ : record.chunkZ;
    record.chunkSize = chunkData.chunk_size || chunkData.chunkSize || record.chunkSize;
    record.subchunkHeight = chunkData.subchunk_height || chunkData.subchunkHeight || record.subchunkHeight;
    record.bytes = decodeChunkBytes(chunkData.voxelBytesBase64 || chunkData.voxel_bytes_base64);

    rebuildChunkMesh(record);
    chunks.set(record.chunkId, record);
  }

  function applyWorldSnapshot(snapshot) {
    mineZones = Array.isArray(snapshot.mine_zones) ? snapshot.mine_zones : mineZones;
    for (const chunk of snapshot.chunks || []) {
      upsertChunk(chunk);
    }
  }

  function setVoxelValue(worldVoxel, value) {
    const chunkCoords = worldToChunk(
      worldVoxel.x,
      worldVoxel.y,
      worldVoxel.z,
      DEFAULT_CHUNK_SIZE,
      DEFAULT_SUBCHUNK_HEIGHT
    );

    const record = getChunkRecord(chunkCoords.chunkId);
    if (!record || !record.bytes) {
      return false;
    }

    const index = voxelIndex(
      chunkCoords.localX,
      chunkCoords.localY,
      chunkCoords.localZ,
      record.chunkSize,
      record.subchunkHeight
    );

    if (record.bytes[index] === value) {
      return false;
    }

    record.bytes[index] = value;
    rebuildChunkMesh(record);
    return true;
  }

  function applyRevealBundle(bundle) {
    for (const delta of bundle?.voxel_deltas || []) {
      setVoxelValue(delta.voxel, Number(delta.value) || 0);
    }
  }

  function getVoxelValue(worldVoxel) {
    const chunkCoords = worldToChunk(
      worldVoxel.x,
      worldVoxel.y,
      worldVoxel.z,
      DEFAULT_CHUNK_SIZE,
      DEFAULT_SUBCHUNK_HEIGHT
    );
    const record = getChunkRecord(chunkCoords.chunkId);
    if (!record || !record.bytes) {
      return 0;
    }

    return record.bytes[
      voxelIndex(
        chunkCoords.localX,
        chunkCoords.localY,
        chunkCoords.localZ,
        record.chunkSize,
        record.subchunkHeight
      )
    ] || 0;
  }

  function raycastMine(camera, maxDistance = 8) {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    camera.getWorldPosition(origin);
    camera.getWorldDirection(direction);

    const step = 0.05;
    for (let t = 0; t <= maxDistance; t += step) {
      const px = origin.x + direction.x * t;
      const py = origin.y + direction.y * t;
      const pz = origin.z + direction.z * t;

      const voxel = {
        x: Math.floor(px + EPSILON),
        y: Math.floor(py + EPSILON),
        z: Math.floor(pz + EPSILON)
      };

      if (!inMineZone(mineZones, voxel)) {
        continue;
      }

      if (getVoxelValue(voxel) > 0) {
        return voxel;
      }
    }

    return null;
  }

  function setMineZones(nextMineZones) {
    mineZones = Array.isArray(nextMineZones) ? nextMineZones : [];
    if (hoveredVoxel && !inMineZone(mineZones, hoveredVoxel)) {
      setHoveredVoxel(null);
    }
  }

  function getMineZones() {
    return [...mineZones];
  }

  function setHoveredVoxel(worldVoxel) {
    if (!worldVoxel || !inMineZone(mineZones, worldVoxel) || getVoxelValue(worldVoxel) <= 0) {
      hoveredVoxel = null;
      hoverOutlineMesh.visible = false;
      return;
    }

    if (areVoxelsEqual(hoveredVoxel, worldVoxel)) {
      return;
    }

    enableOutlineAutoTransform();
    hoveredVoxel = cloneVoxel(worldVoxel);
    hoverOutlineMesh.geometry = hoverOutlineGeometry;
    hoverOutlineMesh.position.set(
      hoveredVoxel.x + 0.5,
      hoveredVoxel.y + 0.5,
      hoveredVoxel.z + 0.5
    );
    hoverOutlineMesh.quaternion.identity();
    hoverOutlineMesh.scale.set(1, 1, 1);
    hoverOutlineMesh.visible = true;
  }

  /**
   * @param {{ position: THREE.Vector3, quaternion?: THREE.Quaternion, scale?: THREE.Vector3 } | null} transform
   */
  function setHoveredBlockTransform(transform) {
    if (!transform?.position) {
      hoveredVoxel = null;
      hoverOutlineMesh.visible = false;
      return;
    }

    enableOutlineAutoTransform();
    hoveredVoxel = null;
    hoverOutlineMesh.geometry = hoverOutlineGeometry;
    hoverOutlineMesh.position.copy(transform.position);
    if (transform.quaternion) {
      hoverOutlineMesh.quaternion.copy(transform.quaternion);
    } else {
      hoverOutlineMesh.quaternion.identity();
    }
    if (transform.scale) {
      hoverOutlineMesh.scale.copy(transform.scale);
    } else {
      hoverOutlineMesh.scale.set(1, 1, 1);
    }
    hoverOutlineMesh.visible = true;
  }

  /**
   * @param {{ geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4 } | null} target
   */
  function setHoveredBlockMeshTarget(target) {
    if (!target?.geometry || !target?.matrixWorld) {
      hoveredVoxel = null;
      hoverOutlineMesh.visible = false;
      return;
    }

    hoveredVoxel = null;
    hoverOutlineMesh.geometry = target.geometry;
    hoverOutlineMesh.matrixAutoUpdate = false;
    hoverOutlineMesh.matrix.copy(target.matrixWorld);
    hoverOutlineMesh.matrixWorldNeedsUpdate = true;
    hoverOutlineMesh.visible = true;
  }

  function setBiome(nextBiome) {
    const normalized = normalizeBlockworldBiome(nextBiome);
    if (normalized === activeBiome) {
      return;
    }

    activeBiome = normalized;
    styleState = createVoxelStyleState(getBlockworldBiomePreset(activeBiome));
    applyMaterialStyle();

    for (const record of chunks.values()) {
      if (!record?.bytes) {
        continue;
      }
      rebuildChunkMesh(record);
    }
  }

  function dispose() {
    for (const record of chunks.values()) {
      if (record.mesh) {
        record.mesh.geometry.dispose();
        root.remove(record.mesh);
      }
    }
    chunks.clear();
    hoverOutlineGeometry.dispose();
    hoverOutlineMaterial.dispose();
    material.dispose();
    scene.remove(root);
  }

  return {
    applyWorldSnapshot,
    applyRevealBundle,
    getVoxelValue,
    setVoxelValue,
    raycastMine,
    setMineZones,
    getMineZones,
    setHoveredVoxel,
    setHoveredBlockTransform,
    setHoveredBlockMeshTarget,
    setBiome,
    getBiome: () => activeBiome,
    dispose
  };
}
