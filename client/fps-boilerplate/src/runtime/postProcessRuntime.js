import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const PEAK_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    saturation: { value: 1.04 },
    contrast: { value: 1.08 },
    warmth: { value: 0.28 },
    shadowLift: { value: 0.06 },
    highlightSoftness: { value: 0.4 },
    blackPoint: { value: 0.04 },
    vignetteStrength: { value: 0.2 },
    vignetteSoftness: { value: 0.62 },
    grainAmount: { value: 0.012 }
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float saturation;
    uniform float contrast;
    uniform float warmth;
    uniform float shadowLift;
    uniform float highlightSoftness;
    uniform float blackPoint;
    uniform float vignetteStrength;
    uniform float vignetteSoftness;
    uniform float grainAmount;
    varying vec2 vUv;

    float luma(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    float random(vec2 uv) {
      return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 graded = max(color.rgb, vec3(0.0));
      float luminance = luma(graded);

      float shadowMask = 1.0 - smoothstep(blackPoint, 0.62, luminance);
      graded += vec3(shadowLift * shadowMask);

      graded.r += warmth * 0.075;
      graded.b -= warmth * 0.052;

      float gray = (graded.r + graded.g + graded.b) / 3.0;
      graded = mix(vec3(gray), graded, saturation);
      graded = (graded - 0.5) * contrast + 0.5;

      vec3 compressedHighlights = graded / (graded + vec3(1.0));
      graded = mix(graded, compressedHighlights * 1.34, highlightSoftness);

      float coolShadow = 1.0 - smoothstep(0.22, 0.72, luma(graded));
      graded = mix(graded * vec3(0.92, 0.96, 1.02), graded, 1.0 - coolShadow * 0.2);

      vec2 centeredUv = vUv * 2.0 - 1.0;
      float vignette = smoothstep(vignetteSoftness, 1.0, length(centeredUv));
      graded *= 1.0 - vignette * vignetteStrength;

      float grain = random(vUv + vec2(fract(time * 0.017), fract(time * 0.031))) - 0.5;
      graded += grain * grainAmount;
      graded = clamp(graded, 0.0, 1.0);

      gl_FragColor = vec4(graded, color.a);
    }
  `
};

export function createPostProcessRuntime({ renderer, scene, camera }) {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.24,
    0.45,
    0.86
  );
  composer.addPass(bloomPass);

  const peakGradePass = new ShaderPass(PEAK_GRADE_SHADER);
  composer.addPass(peakGradePass);

  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (size.x * renderer.getPixelRatio()),
    1 / (size.y * renderer.getPixelRatio())
  );
  composer.addPass(fxaaPass);

  function setSize(width, height) {
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
    fxaaPass.material.uniforms.resolution.value.set(
      1 / (width * renderer.getPixelRatio()),
      1 / (height * renderer.getPixelRatio())
    );
  }

  function render(activeCamera = camera, { timeSeconds = performance.now() * 0.001 } = {}) {
    renderPass.camera = activeCamera;
    peakGradePass.uniforms.time.value = timeSeconds;
    composer.render();
  }

  function setPeakStyle({
    saturation,
    contrast,
    warmth,
    shadowLift,
    highlightSoftness,
    blackPoint,
    vignetteStrength,
    vignetteSoftness,
    grainAmount,
    bloomStrength,
    bloomRadius,
    bloomThreshold
  } = {}) {
    if (Number.isFinite(saturation)) {
      peakGradePass.uniforms.saturation.value = saturation;
    }
    if (Number.isFinite(contrast)) {
      peakGradePass.uniforms.contrast.value = contrast;
    }
    if (Number.isFinite(warmth)) {
      peakGradePass.uniforms.warmth.value = warmth;
    }
    if (Number.isFinite(shadowLift)) {
      peakGradePass.uniforms.shadowLift.value = shadowLift;
    }
    if (Number.isFinite(highlightSoftness)) {
      peakGradePass.uniforms.highlightSoftness.value = highlightSoftness;
    }
    if (Number.isFinite(blackPoint)) {
      peakGradePass.uniforms.blackPoint.value = blackPoint;
    }
    if (Number.isFinite(vignetteStrength)) {
      peakGradePass.uniforms.vignetteStrength.value = vignetteStrength;
    }
    if (Number.isFinite(vignetteSoftness)) {
      peakGradePass.uniforms.vignetteSoftness.value = vignetteSoftness;
    }
    if (Number.isFinite(grainAmount)) {
      peakGradePass.uniforms.grainAmount.value = grainAmount;
    }
    if (Number.isFinite(bloomStrength)) {
      bloomPass.strength = bloomStrength;
    }
    if (Number.isFinite(bloomRadius)) {
      bloomPass.radius = bloomRadius;
    }
    if (Number.isFinite(bloomThreshold)) {
      bloomPass.threshold = bloomThreshold;
    }
  }

  function setCartoonStyle(options = {}) {
    setPeakStyle(options);
  }

  function dispose() {
    composer.dispose();
  }

  return {
    setSize,
    setPeakStyle,
    setCartoonStyle,
    render,
    dispose
  };
}
