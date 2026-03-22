import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export function createPostProcessRuntime({ renderer, scene, camera }) {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.8, 0.84);
  composer.addPass(bloomPass);

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

  function render(activeCamera = camera) {
    renderPass.camera = activeCamera;
    composer.render();
  }

  function dispose() {
    composer.dispose();
  }

  return {
    setSize,
    render,
    dispose
  };
}
