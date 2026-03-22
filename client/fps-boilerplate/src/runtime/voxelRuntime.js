import * as THREE from 'three';

const DEFAULT_CHUNK_SIZE = 16;
const DEFAULT_SUBCHUNK_HEIGHT = 16;
const EPSILON = 1e-4;

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

function resolveColor(value) {
  if (value === 4) {
    return [0.38, 0.78, 0.95];
  }
  if (value === 3) {
    return [0.95, 0.8, 0.38];
  }
  if (value === 2) {
    return [0.78, 0.78, 0.78];
  }
  return [0.47, 0.33, 0.24];
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
      voxel.x >= zone.min.x && voxel.x <= zone.max.x &&
      voxel.y >= zone.min.y && voxel.y <= zone.max.y &&
      voxel.z >= zone.min.z && voxel.z <= zone.max.z
    ) {
      return true;
    }
  }

  return false;
}

function buildChunkGeometry(chunk) {
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
          const color = resolveColor(cell.value);

          for (const corner of corners) {
            positions.push(corner[0], corner[1], corner[2]);
            normals.push(normal[0], normal[1], normal[2]);
            colors.push(color[0], color[1], color[2]);
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

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.04
  });

  const chunks = new Map();
  let mineZones = [];

  function getChunkRecord(chunkId) {
    return chunks.get(chunkId) || null;
  }

  function upsertChunk(chunkData) {
    const record = chunks.get(chunkData.chunkId) || {
      chunkId: chunkData.chunkId,
      chunkX: chunkData.chunkX,
      chunkY: chunkData.chunkY,
      chunkZ: chunkData.chunkZ,
      chunkSize: chunkData.chunk_size || chunkData.chunkSize || DEFAULT_CHUNK_SIZE,
      subchunkHeight: chunkData.subchunk_height || chunkData.subchunkHeight || DEFAULT_SUBCHUNK_HEIGHT,
      bytes: null,
      mesh: null
    };

    record.chunkX = chunkData.chunkX;
    record.chunkY = chunkData.chunkY;
    record.chunkZ = chunkData.chunkZ;
    record.chunkSize = chunkData.chunk_size || chunkData.chunkSize || record.chunkSize;
    record.subchunkHeight = chunkData.subchunk_height || chunkData.subchunkHeight || record.subchunkHeight;
    record.bytes = decodeChunkBytes(chunkData.voxelBytesBase64 || chunkData.voxel_bytes_base64);

    const geometry = buildChunkGeometry(record);
    if (!record.mesh) {
      record.mesh = new THREE.Mesh(geometry, material);
      record.mesh.castShadow = true;
      record.mesh.receiveShadow = true;
      record.mesh.frustumCulled = true;
      root.add(record.mesh);
    } else {
      record.mesh.geometry.dispose();
      record.mesh.geometry = geometry;
    }

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

    const geometry = buildChunkGeometry(record);
    record.mesh.geometry.dispose();
    record.mesh.geometry = geometry;
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
  }

  function getMineZones() {
    return [...mineZones];
  }

  function dispose() {
    for (const record of chunks.values()) {
      if (record.mesh) {
        record.mesh.geometry.dispose();
        root.remove(record.mesh);
      }
    }
    chunks.clear();
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
    dispose
  };
}
