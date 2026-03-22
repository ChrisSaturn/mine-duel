import * as THREE from 'three';

const SKY_VERTEX_SHADER = `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = `
varying vec3 vWorldPosition;

uniform float time;
uniform vec3 sunDirection;
uniform vec3 skyTopColor;
uniform vec3 skyHorizonColor;
uniform vec3 skyBottomColor;
uniform vec3 cloudColor;
uniform float cloudScale;
uniform float cloudCoverage;
uniform float cloudSoftness;
uniform float cloudSpeed;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.01 + vec2(31.43, -17.71);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vWorldPosition);
  float horizon = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 skyGradient = mix(skyBottomColor, skyHorizonColor, smoothstep(0.0, 0.45, horizon));
  skyGradient = mix(skyGradient, skyTopColor, smoothstep(0.35, 1.0, horizon));

  float cloudBand = smoothstep(0.05, 0.32, dir.y);
  vec2 cloudUv = dir.xz / max(dir.y + 0.28, 0.16);
  cloudUv = cloudUv * cloudScale + vec2(time * cloudSpeed, time * cloudSpeed * 0.35);

  float cloudNoise = fbm(cloudUv);
  float cloudMask = smoothstep(cloudCoverage, cloudCoverage + cloudSoftness, cloudNoise) * cloudBand;

  vec3 color = mix(skyGradient, cloudColor, cloudMask * 0.78);

  float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
  float sunDisk = pow(sunDot, 1800.0);
  float sunHalo = pow(sunDot, 34.0);

  color += vec3(1.0, 0.93, 0.75) * sunDisk * 1.25;
  color += vec3(1.0, 0.74, 0.38) * sunHalo * 0.42;

  gl_FragColor = vec4(color, 1.0);
}
`;

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDirection: { value: new THREE.Vector3(0.65, 0.58, 0.48).normalize() },
      skyTopColor: { value: new THREE.Color(0x78b6ff) },
      skyHorizonColor: { value: new THREE.Color(0xd8e8ff) },
      skyBottomColor: { value: new THREE.Color(0x84a2c7) },
      cloudColor: { value: new THREE.Color(0xf5f8ff) },
      cloudScale: { value: 2.2 },
      cloudCoverage: { value: 0.47 },
      cloudSoftness: { value: 0.21 },
      cloudSpeed: { value: 0.018 }
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
}

export function createAtmosphereRuntime({ scene, renderer }) {
  const root = new THREE.Group();
  root.name = 'atmosphere-runtime-root';
  scene.add(root);

  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.08;

  const fogColor = new THREE.Color(0x9bbfe1);
  scene.background = fogColor.clone();
  scene.fog = new THREE.Fog(fogColor.clone(), 35, 260);

  const hemi = new THREE.HemisphereLight(0xb9deff, 0x4d6840, 0.62);
  root.add(hemi);

  const ambientFill = new THREE.AmbientLight(0xb9c9e6, 0.17);
  root.add(ambientFill);

  const sunTarget = new THREE.Object3D();
  sunTarget.name = 'atmosphere-sun-target';
  root.add(sunTarget);

  const sunLight = new THREE.DirectionalLight(0xfff2c7, 2.45);
  sunLight.name = 'atmosphere-sun-light';
  sunLight.castShadow = true;
  sunLight.target = sunTarget;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.near = 1.0;
  sunLight.shadow.camera.far = 260;
  sunLight.shadow.camera.left = -78;
  sunLight.shadow.camera.right = 78;
  sunLight.shadow.camera.top = 78;
  sunLight.shadow.camera.bottom = -78;
  sunLight.shadow.bias = -0.00015;
  sunLight.shadow.normalBias = 0.03;
  sunLight.shadow.radius = 3.2;
  root.add(sunLight);

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 48, 28),
    createSkyMaterial()
  );
  skyDome.name = 'atmosphere-sky-dome';
  skyDome.frustumCulled = false;
  root.add(skyDome);

  const sunDisk = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xfff3be,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
      toneMapped: false
    })
  );
  sunDisk.name = 'atmosphere-sun-disk';
  sunDisk.frustumCulled = false;
  root.add(sunDisk);

  const sunDirection = new THREE.Vector3();
  const fogDayColor = new THREE.Color(0xbbd6ef);
  const fogSunsetColor = new THREE.Color(0x89a4c4);

  function update({ timeSeconds = 0, focusPosition = null } = {}) {
    const focus = focusPosition || root.position;
    const cycle = timeSeconds * 0.03;
    const elevation = Math.sin(cycle) * 0.3 + 0.42;
    const azimuth = cycle * 0.37 + Math.PI * 0.35;

    const cosElevation = Math.cos(elevation);
    sunDirection.set(
      Math.cos(azimuth) * cosElevation,
      Math.sin(elevation),
      Math.sin(azimuth) * cosElevation
    ).normalize();

    const lightAnchorDistance = 110;
    const skyRadius = 300;
    sunTarget.position.copy(focus);
    sunLight.position.copy(focus).addScaledVector(sunDirection, lightAnchorDistance);
    skyDome.position.copy(focus);
    sunDisk.position.copy(focus).addScaledVector(sunDirection, skyRadius);

    const daylight = THREE.MathUtils.clamp((sunDirection.y + 0.18) / 1.18, 0, 1);
    sunLight.intensity = THREE.MathUtils.lerp(1.6, 2.55, daylight);
    hemi.intensity = THREE.MathUtils.lerp(0.48, 0.7, daylight);
    ambientFill.intensity = THREE.MathUtils.lerp(0.11, 0.2, daylight);

    skyDome.material.uniforms.time.value = timeSeconds;
    skyDome.material.uniforms.sunDirection.value.copy(sunDirection);

    scene.fog.color.copy(fogSunsetColor).lerp(fogDayColor, daylight);
    scene.background.copy(scene.fog.color);
    sunTarget.updateMatrixWorld();
  }

  function dispose() {
    root.remove(skyDome);
    skyDome.geometry.dispose();
    skyDome.material.dispose();

    root.remove(sunDisk);
    sunDisk.geometry.dispose();
    sunDisk.material.dispose();

    scene.remove(root);
  }

  return {
    sunLight,
    update,
    dispose
  };
}
