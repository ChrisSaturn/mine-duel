import * as THREE from 'three';

const PEAK_SHADOW_MIN_ASPECT = 1.1;
const PEAK_SHADOW_HALF_HEIGHT_DESKTOP = 52;
const PEAK_SHADOW_HALF_HEIGHT_MOBILE = 64;
const PEAK_SHADOW_MAP_DESKTOP = 4096;
const PEAK_SHADOW_MAP_MOBILE = 2048;

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
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 nadirColor;
uniform vec3 cloudBrightColor;
uniform vec3 cloudShadowColor;
uniform vec3 sunColor;
uniform vec3 sunDirection;
uniform float cloudScale;
uniform float cloudCoverage;
uniform float cloudSoftness;
uniform float cloudSpeed;
uniform float stylizedBands;

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
    p = p * 2.03 + vec2(19.1, -13.7);
    amplitude *= 0.5;
  }
  return value;
}

float warpedFbm(vec2 p) {
  float warpX = fbm(p + vec2(0.0, 12.4));
  float warpY = fbm(p + vec2(7.8, -5.2));
  return fbm(p + vec2(warpX, warpY) * 0.9);
}

void main() {
  vec3 dir = normalize(vWorldPosition);
  vec3 sunDir = normalize(sunDirection);

  float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float bandedUp = floor(up * stylizedBands + 0.5) / stylizedBands;
  float stylizedUp = mix(up, bandedUp, 0.28);

  vec3 sky = mix(nadirColor, horizonColor, smoothstep(0.0, 0.54, stylizedUp));
  sky = mix(sky, zenithColor, smoothstep(0.4, 1.0, stylizedUp));

  vec2 cloudUv = dir.xz / max(dir.y + 0.24, 0.18);
  cloudUv = cloudUv * cloudScale + vec2(time * cloudSpeed, time * cloudSpeed * 0.37);

  float cloudLayerA = warpedFbm(cloudUv);
  float cloudLayerB = warpedFbm(cloudUv * 1.9 + vec2(6.4, -3.7));
  float cloudNoise = mix(cloudLayerA, cloudLayerB, 0.35);

  float cloudMask = smoothstep(
    cloudCoverage - cloudSoftness,
    cloudCoverage + cloudSoftness,
    cloudNoise
  ) * smoothstep(0.02, 0.34, dir.y);

  vec3 cloudColor = mix(cloudShadowColor, cloudBrightColor, cloudNoise);
  sky = mix(sky, cloudColor, cloudMask * 0.82);

  float sunDot = max(dot(dir, sunDir), 0.0);
  float sunDisk = smoothstep(0.994, 0.9994, sunDot);
  float sunHalo = pow(sunDot, 18.0);
  sky += sunColor * (sunDisk * 1.45 + sunHalo * 0.36);

  float horizonHaze = clamp(1.0 - smoothstep(0.02, 0.4, dir.y), 0.0, 1.0);
  sky = mix(sky, horizonColor, horizonHaze * 0.18);

  gl_FragColor = vec4(sky, 1.0);
}
`;

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      zenithColor: { value: new THREE.Color(0x6e9fd7) },
      horizonColor: { value: new THREE.Color(0xd9b69a) },
      nadirColor: { value: new THREE.Color(0x7484a2) },
      cloudBrightColor: { value: new THREE.Color(0xfbe9d4) },
      cloudShadowColor: { value: new THREE.Color(0xbdc7d8) },
      sunColor: { value: new THREE.Color(0xffdca2) },
      sunDirection: { value: new THREE.Vector3(0.38, 0.78, -0.5) },
      cloudScale: { value: 2.45 },
      cloudCoverage: { value: 0.56 },
      cloudSoftness: { value: 0.09 },
      cloudSpeed: { value: 0.013 },
      stylizedBands: { value: 14.0 }
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
}

function snapToStep(value, step) {
  if (!(step > 0)) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function createAtmosphereRuntime({ scene, renderer }) {
  const root = new THREE.Group();
  root.name = 'atmosphere-runtime-root';
  scene.add(root);

  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = true;
  renderer.toneMappingExposure = 1.04;

  const fogColor = new THREE.Color(0x8ea5c0);
  scene.background = fogColor.clone();
  scene.fog = new THREE.Fog(fogColor.clone(), 44, 250);

  const hemi = new THREE.HemisphereLight(0x8eb6f0, 0x4b5871, 0.34);
  root.add(hemi);

  const ambientFill = new THREE.AmbientLight(0xe7dbcc, 0.4);
  root.add(ambientFill);

  const fillTarget = new THREE.Object3D();
  fillTarget.name = 'atmosphere-fill-target';
  root.add(fillTarget);

  const fillLight = new THREE.DirectionalLight(0x8eadde, 0.2);
  fillLight.name = 'atmosphere-fill-light';
  fillLight.castShadow = false;
  fillLight.target = fillTarget;
  root.add(fillLight);

  const sunTarget = new THREE.Object3D();
  sunTarget.name = 'atmosphere-sun-target';
  root.add(sunTarget);

  const sunLight = new THREE.DirectionalLight(0xffe7bc, 1.72);
  sunLight.name = 'atmosphere-sun-light';
  sunLight.castShadow = true;
  sunLight.target = sunTarget;
  sunLight.shadow.camera.near = 8;
  sunLight.shadow.camera.far = 290;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.024;
  sunLight.shadow.radius = 2.0;
  root.add(sunLight);

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(460, 56, 32),
    createSkyMaterial()
  );
  skyDome.name = 'atmosphere-sky-dome';
  skyDome.frustumCulled = false;
  root.add(skyDome);

  const sunDirection = new THREE.Vector3();
  const anchoredFocus = new THREE.Vector3();
  const skyDirection = new THREE.Vector3();
  const sunColor = new THREE.Color();
  const fogMixColor = new THREE.Color();
  const skyZenithMix = new THREE.Color();
  const skyHorizonMix = new THREE.Color();
  const skyNadirMix = new THREE.Color();
  const viewportSize = new THREE.Vector2(window.innerWidth, window.innerHeight);

  const sunDayColor = new THREE.Color(0xfff1d4);
  const sunSunsetColor = new THREE.Color(0xffbd8f);
  const sunNightColor = new THREE.Color(0x8ea1c5);

  const fogDayColor = new THREE.Color(0x95b3cd);
  const fogSunsetColor = new THREE.Color(0x7d81ab);
  const fogNightColor = new THREE.Color(0x324768);

  const zenithDayColor = new THREE.Color(0x6f9fd6);
  const zenithSunsetColor = new THREE.Color(0x8e6ea8);
  const zenithNightColor = new THREE.Color(0x1f2f4f);

  const horizonDayColor = new THREE.Color(0xd8bd9f);
  const horizonSunsetColor = new THREE.Color(0xf09f71);
  const horizonNightColor = new THREE.Color(0x4a5478);

  const nadirDayColor = new THREE.Color(0x7484a1);
  const nadirSunsetColor = new THREE.Color(0x76648d);
  const nadirNightColor = new THREE.Color(0x1f2f47);

  const cloudDayColor = new THREE.Color(0xfde9d3);
  const cloudSunsetColor = new THREE.Color(0xffc7a3);
  const cloudNightColor = new THREE.Color(0x7686aa);

  let shadowTexelWorldSize = 0;
  let shadowHalfSpan = PEAK_SHADOW_HALF_HEIGHT_DESKTOP;

  function applyShadowViewport(width = viewportSize.x, height = viewportSize.y) {
    viewportSize.set(Math.max(1, width), Math.max(1, height));

    const compactViewport = Math.min(viewportSize.x, viewportSize.y) <= 900;
    const mapSize = compactViewport ? PEAK_SHADOW_MAP_MOBILE : PEAK_SHADOW_MAP_DESKTOP;
    const baseHalfHeight = compactViewport
      ? PEAK_SHADOW_HALF_HEIGHT_MOBILE
      : PEAK_SHADOW_HALF_HEIGHT_DESKTOP;
    const projectedAspect = Math.max(
      viewportSize.x / Math.max(viewportSize.y, 1),
      PEAK_SHADOW_MIN_ASPECT
    );

    shadowHalfSpan = baseHalfHeight * projectedAspect;
    shadowTexelWorldSize = (shadowHalfSpan * 2) / mapSize;

    sunLight.shadow.mapSize.set(mapSize, mapSize);
    sunLight.shadow.camera.left = -shadowHalfSpan;
    sunLight.shadow.camera.right = shadowHalfSpan;
    sunLight.shadow.camera.top = shadowHalfSpan;
    sunLight.shadow.camera.bottom = -shadowHalfSpan;
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.shadow.needsUpdate = true;
  }

  applyShadowViewport();

  function update({ timeSeconds = 0, focusPosition = null } = {}) {
    const focus = focusPosition || root.position;
    const cycle = timeSeconds * 0.018;
    const elevation = Math.sin(cycle) * 0.46 + 0.2;
    const azimuth = cycle * 0.41 + Math.PI * 0.22;

    const cosElevation = Math.cos(elevation);
    sunDirection.set(
      Math.cos(azimuth) * cosElevation,
      Math.sin(elevation),
      Math.sin(azimuth) * cosElevation
    ).normalize();

    const daylight = THREE.MathUtils.smoothstep(sunDirection.y, -0.08, 0.7);
    const night = THREE.MathUtils.smoothstep(-sunDirection.y, 0.08, 0.72);
    const dayFactor = daylight * (1 - night);
    const nightFactor = night * (1 - daylight);
    const sunsetFactor = THREE.MathUtils.clamp(1 - dayFactor - nightFactor, 0, 1);

    anchoredFocus.copy(focus);
    anchoredFocus.x = snapToStep(anchoredFocus.x, shadowTexelWorldSize);
    anchoredFocus.z = snapToStep(anchoredFocus.z, shadowTexelWorldSize);

    const lightAnchorDistance = shadowHalfSpan + 72;
    sunTarget.position.copy(anchoredFocus);
    sunLight.position.copy(anchoredFocus).addScaledVector(sunDirection, lightAnchorDistance);

    skyDirection.copy(sunDirection).multiplyScalar(-1);
    skyDirection.y = Math.max(0.24, skyDirection.y + 0.16);
    skyDirection.normalize();
    fillTarget.position.copy(anchoredFocus);
    fillLight.position.copy(anchoredFocus).addScaledVector(skyDirection, lightAnchorDistance * 0.74);

    skyDome.position.copy(anchoredFocus);

    sunColor
      .copy(sunNightColor)
      .lerp(sunSunsetColor, sunsetFactor)
      .lerp(sunDayColor, dayFactor);
    sunLight.color.copy(sunColor);

    sunLight.intensity = THREE.MathUtils.lerp(0.22, 2.08, dayFactor) + sunsetFactor * 0.56;
    hemi.intensity = THREE.MathUtils.lerp(0.14, 0.48, dayFactor) + sunsetFactor * 0.14;
    ambientFill.intensity = THREE.MathUtils.lerp(0.18, 0.58, dayFactor) + sunsetFactor * 0.1;
    fillLight.intensity = THREE.MathUtils.lerp(0.05, 0.36, dayFactor) + sunsetFactor * 0.08;

    skyDome.material.uniforms.time.value = timeSeconds;
    skyDome.material.uniforms.sunDirection.value.copy(sunDirection);
    skyDome.material.uniforms.sunColor.value.copy(sunColor).multiplyScalar(1.08);

    skyZenithMix
      .copy(zenithNightColor)
      .lerp(zenithSunsetColor, sunsetFactor)
      .lerp(zenithDayColor, dayFactor);
    skyHorizonMix
      .copy(horizonNightColor)
      .lerp(horizonSunsetColor, sunsetFactor)
      .lerp(horizonDayColor, dayFactor);
    skyNadirMix
      .copy(nadirNightColor)
      .lerp(nadirSunsetColor, sunsetFactor)
      .lerp(nadirDayColor, dayFactor);

    skyDome.material.uniforms.zenithColor.value.copy(skyZenithMix);
    skyDome.material.uniforms.horizonColor.value.copy(skyHorizonMix);
    skyDome.material.uniforms.nadirColor.value.copy(skyNadirMix);
    skyDome.material.uniforms.cloudBrightColor.value
      .copy(cloudNightColor)
      .lerp(cloudSunsetColor, sunsetFactor)
      .lerp(cloudDayColor, dayFactor);

    fogMixColor
      .copy(fogNightColor)
      .lerp(fogSunsetColor, sunsetFactor)
      .lerp(fogDayColor, dayFactor);
    scene.fog.color.copy(fogMixColor);
    scene.background.copy(fogMixColor);
    scene.fog.near = THREE.MathUtils.lerp(34, 58, dayFactor);
    scene.fog.far = THREE.MathUtils.lerp(170, 305, dayFactor) + sunsetFactor * 24;

    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.84, 1.18, dayFactor) + sunsetFactor * 0.06;

    sunTarget.updateMatrixWorld(true);
    fillTarget.updateMatrixWorld(true);
  }

  function dispose() {
    root.remove(skyDome);
    skyDome.geometry.dispose();
    skyDome.material.dispose();
    scene.remove(root);
  }

  return {
    sunLight,
    setViewportSize: applyShadowViewport,
    update,
    dispose
  };
}
