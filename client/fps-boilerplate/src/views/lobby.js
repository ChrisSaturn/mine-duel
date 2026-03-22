import './lobby.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function withBaseUrl(path) {
  const baseUrl = typeof import.meta?.env?.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

/** @type {(() => void) | null} */
let _unsubWallet = null;
/** @type {(() => void) | null} */
let _disposeCharacterPreview = null;
/** @type {(() => void) | null} */
let _disposeLobbyVideoAudio = null;
/** @type {(() => void) | null} */
let _disposeLobbyClickEffects = null;
/** @type {(() => void) | null} */
let _disposeLobbyWalletMenu = null;

const SKIN_STORAGE_KEY = 'mine-duel.lobby.selected-skin';
const CHARACTER_SKINS = Array.from('abcdefghijklmnopqr').map((letter) => ({
  id: letter,
  label: `Skin ${letter.toUpperCase()}`,
  modelPath: withBaseUrl(`models/characters/kenney-blocky/character-${letter}.glb`)
}));
const LOBBY_CLICK_SHAKE_CLASSES = ['lobby-click-shake-x-pos', 'lobby-click-shake-x-neg', 'lobby-click-shake-y-pos', 'lobby-click-shake-y-neg'];
const LOBBY_CONFETTI_COLORS = ['#8cf6ff', '#ffd95e', '#81f1a4', '#fca0ff', '#f9f9ff'];

/**
 * @param {string} value
 * @returns {string}
 */
function getInitialSkinPath(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const match = CHARACTER_SKINS.find((skin) => skin.modelPath === normalized);
  return match ? match.modelPath : CHARACTER_SKINS[0].modelPath;
}

/**
 * @param {string} modelPath
 */
function persistSelectedSkin(modelPath) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, modelPath);
  } catch {
    // Storage is best-effort only.
  }
}

/**
 * @returns {string}
 */
function getPersistedSkin() {
  try {
    return localStorage.getItem(SKIN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * @template T
 * @param {T[]} items
 * @returns {T | null}
 */
function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

/**
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {HTMLElement | null} screenEl
 */
function triggerLobbyClickShake(screenEl) {
  if (!screenEl || prefersReducedMotion()) {
    return;
  }

  const shakeClass = pickRandom(LOBBY_CLICK_SHAKE_CLASSES);
  if (!shakeClass) {
    return;
  }

  screenEl.style.setProperty('--lobby-click-shake-distance', `${(2.2 + Math.random() * 1.8).toFixed(2)}px`);
  for (const className of LOBBY_CLICK_SHAKE_CLASSES) {
    screenEl.classList.remove(className);
  }

  void screenEl.offsetWidth;
  screenEl.classList.add(shakeClass);

  const onAnimationEnd = (event) => {
    if (event.target !== screenEl) return;
    screenEl.classList.remove(shakeClass);
    screenEl.removeEventListener('animationend', onAnimationEnd);
  };
  screenEl.addEventListener('animationend', onAnimationEnd);
}

/**
 * @param {HTMLButtonElement} buttonEl
 */
function triggerLobbyButtonConfetti(buttonEl) {
  if (prefersReducedMotion()) {
    return;
  }

  const confettiLayer = buttonEl.querySelector('.lobby-click-confetti-layer');
  if (!(confettiLayer instanceof HTMLElement)) {
    return;
  }

  const particleCount = 9 + Math.floor(Math.random() * 4);
  const particles = [];

  for (let i = 0; i < particleCount; i += 1) {
    const angle = (i / particleCount) * (Math.PI * 2) + ((Math.random() - 0.5) * 0.35);
    const speed = 34 + Math.random() * 54;
    const x = Math.cos(angle) * speed;
    const y = -Math.abs(Math.sin(angle) * speed) - (6 + Math.random() * 12);

    const particle = document.createElement('span');
    particle.className = 'lobby-click-confetti-particle';
    particle.style.setProperty('--lobby-confetti-x', `${x.toFixed(2)}px`);
    particle.style.setProperty('--lobby-confetti-y', `${y.toFixed(2)}px`);
    particle.style.setProperty('--lobby-confetti-rotate', `${(-180 + Math.random() * 360).toFixed(1)}deg`);
    particle.style.setProperty('--lobby-confetti-size', `${(4 + Math.random() * 4).toFixed(2)}px`);
    particle.style.setProperty('--lobby-confetti-duration', `${(360 + Math.random() * 220).toFixed(0)}ms`);
    particle.style.setProperty('--lobby-confetti-color', pickRandom(LOBBY_CONFETTI_COLORS) || '#f9f9ff');
    confettiLayer.appendChild(particle);
    particles.push(particle);
  }

  window.setTimeout(() => {
    for (const particle of particles) {
      particle.remove();
    }
  }, 680);
}

/**
 * @param {{ screenEl: HTMLElement | null, buttons: HTMLButtonElement[] }} opts
 * @returns {() => void}
 */
function setupLobbyClickEffects({ screenEl, buttons }) {
  const cleanups = [];

  for (const buttonEl of buttons) {
    if (!(buttonEl instanceof HTMLButtonElement)) {
      continue;
    }

    const confettiLayer = document.createElement('span');
    confettiLayer.className = 'lobby-click-confetti-layer';
    confettiLayer.setAttribute('aria-hidden', 'true');
    buttonEl.appendChild(confettiLayer);

    const onPointerDown = () => {
      buttonEl.classList.add('lobby-click-btn--pressed');
    };
    const onPointerUp = () => {
      buttonEl.classList.remove('lobby-click-btn--pressed');
    };
    const onPointerLeave = () => {
      buttonEl.classList.remove('lobby-click-btn--pressed');
    };
    const onClick = () => {
      if (buttonEl.disabled) return;
      triggerLobbyClickShake(screenEl);
      triggerLobbyButtonConfetti(buttonEl);
    };

    buttonEl.addEventListener('pointerdown', onPointerDown);
    buttonEl.addEventListener('pointerup', onPointerUp);
    buttonEl.addEventListener('pointercancel', onPointerLeave);
    buttonEl.addEventListener('pointerleave', onPointerLeave);
    buttonEl.addEventListener('click', onClick);

    cleanups.push(() => {
      buttonEl.classList.remove('lobby-click-btn--pressed');
      buttonEl.removeEventListener('pointerdown', onPointerDown);
      buttonEl.removeEventListener('pointerup', onPointerUp);
      buttonEl.removeEventListener('pointercancel', onPointerLeave);
      buttonEl.removeEventListener('pointerleave', onPointerLeave);
      buttonEl.removeEventListener('click', onClick);
      confettiLayer.remove();
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

// ── Mount / unmount ─────────────────────────────────────────────────────────

/**
 * @param {{ walletGateway: object, onEnterGame: (selectedModelPath: string) => void, initialSelectedModelPath?: string }} opts
 */
export function mountLobby({ walletGateway, onEnterGame, initialSelectedModelPath }) {
  const root = document.getElementById('lobby');
  if (!root) return;
  _disposeLobbyClickEffects?.();
  _disposeLobbyClickEffects = null;

  const selectedInitialModelPath = getInitialSkinPath(initialSelectedModelPath || getPersistedSkin());

  root.innerHTML = `
    <video class="lobby-bg-video" id="lobby-bg-video" autoplay loop playsinline preload="auto">
      <source src="${withBaseUrl('background.mp4')}" type="video/mp4" />
    </video>
    <div class="lobby-screen">
      <header class="lobby-top" aria-label="Lobby top navigation">
        <div class="lobby-top-brand">
          <div class="lobby-card lobby-profile-card">
            <div class="lobby-avatar" aria-hidden="true">MD</div>
            <div class="lobby-profile-copy">
              <p class="lobby-profile-title">Mine Duel</p>
              <p class="lobby-profile-subtitle">Lobby</p>
            </div>
          </div>
        </div>

        <div class="lobby-top-metrics" aria-label="Resource counters">
          <div class="lobby-top-resources">
            <div class="lobby-resource-pill lobby-resource-pill--sol">
              <span class="lobby-solana-coin" aria-hidden="true">
                <svg viewBox="0 0 398 311" role="img" focusable="false">
                  <defs>
                    <linearGradient id="solana-badge-g" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stop-color="#14f195"></stop>
                      <stop offset="100%" stop-color="#9945ff"></stop>
                    </linearGradient>
                  </defs>
                  <path fill="url(#solana-badge-g)" d="M64 0h316c10 0 15 12 8 19l-54 54c-4 4-9 6-14 6H4C-6 79-11 67-4 60L50 6c4-4 9-6 14-6z"></path>
                  <path fill="url(#solana-badge-g)" d="M64 116h316c10 0 15 12 8 19l-54 54c-4 4-9 6-14 6H4c-10 0-15-12-8-19l54-54c4-4 9-6 14-6z"></path>
                  <path fill="url(#solana-badge-g)" d="M334 232H18c-10 0-15 12-8 19l54 54c4 4 9 6 14 6h316c10 0 15-12 8-19l-54-54c-4-4-9-6-14-6z"></path>
                </svg>
              </span>
              <span class="lobby-resource-value lobby-resource-value--sol" id="lobby-sol-balance">0</span>
            </div>
          </div>
        </div>

        <div class="lobby-top-actions">
          <div class="lobby-wallet-dropdown" id="lobby-wallet-dropdown">
            <button
              class="lobby-menu-chip"
              id="lobby-connect-btn"
              type="button"
              aria-haspopup="menu"
              aria-expanded="false"
            ><span class="lobby-btn-label">Connect Wallet</span></button>
            <div class="lobby-wallet-menu" id="lobby-wallet-menu" role="menu" hidden>
              <button
                class="lobby-wallet-menu-item"
                id="lobby-disconnect-btn"
                type="button"
                role="menuitem"
              >Disconnect</button>
            </div>
          </div>
        </div>
      </header>

      <div class="lobby-main">
        <section class="lobby-stage-zone" aria-label="Character preview area">
          <div class="lobby-character-row">
            <div class="lobby-character-stage-shell">
              <div class="lobby-skin-strip" aria-label="Current skin">
                <span class="lobby-skin-tag">SKIN</span>
                <p class="lobby-skin-label" id="lobby-skin-label"></p>
              </div>
              <div class="lobby-character-glow" aria-hidden="true"></div>
              <div class="lobby-character-stage-wrap">
                <button
                  class="lobby-arrow-btn lobby-arrow-btn--prev"
                  id="lobby-skin-prev-btn"
                  type="button"
                  aria-label="Previous skin"
                >&lt;</button>
                <div
                  class="lobby-character-stage"
                  id="lobby-character-stage"
                  aria-label="Selected character preview"
                ></div>
                <button
                  class="lobby-arrow-btn lobby-arrow-btn--next"
                  id="lobby-skin-next-btn"
                  type="button"
                  aria-label="Next skin"
                >&gt;</button>
              </div>
              <p class="lobby-address" id="lobby-address" hidden></p>
            </div>
          </div>

        </section>
      </div>

      <footer class="lobby-bottom">
        <div class="lobby-event-card" aria-hidden="true">
          <p class="lobby-event-timer">NOW LIVE</p>
          <p class="lobby-event-title">BLITZ V2</p>
          <p class="lobby-event-subtitle">MAGICBLOCK</p>
        </div>

        <div class="lobby-action-stack">
          <p class="lobby-status" id="lobby-status" aria-live="polite"></p>

          <button
            class="lobby-action-btn lobby-action-btn--primary"
            id="lobby-enter-btn"
            type="button"
            disabled
          ><span class="lobby-btn-label">Enter Game</span></button>
        </div>
      </footer>
    </div>
  `;

  const connectBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-connect-btn'));
  const disconnectBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-disconnect-btn'));
  const enterBtn   = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-enter-btn'));
  const statusEl   = /** @type {HTMLElement} */       (root.querySelector('#lobby-status'));
  const addressEl  = /** @type {HTMLElement} */       (root.querySelector('#lobby-address'));
  const walletDropdownEl = /** @type {HTMLElement} */ (root.querySelector('#lobby-wallet-dropdown'));
  const walletMenuEl = /** @type {HTMLElement} */     (root.querySelector('#lobby-wallet-menu'));
  const solBalanceEl = /** @type {HTMLElement} */     (root.querySelector('#lobby-sol-balance'));
  const skinPrevBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-skin-prev-btn'));
  const skinNextBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-skin-next-btn'));
  const skinLabelEl = /** @type {HTMLElement} */       (root.querySelector('#lobby-skin-label'));
  const stageEl = /** @type {HTMLElement} */           (root.querySelector('#lobby-character-stage'));
  const backgroundVideoEl = /** @type {HTMLVideoElement | null} */ (root.querySelector('#lobby-bg-video'));
  const lobbyScreenEl = /** @type {HTMLElement | null} */ (root.querySelector('.lobby-screen'));
  /** @type {{ connected: boolean } | null} */
  let lastWalletState = null;
  let solBalanceRequestId = 0;
  let walletMenuOpen = false;

  /**
   * @param {boolean} open
   */
  function setWalletMenuOpen(open) {
    const shouldOpen = Boolean(open && lastWalletState?.connected);
    walletMenuOpen = shouldOpen;
    if (walletMenuEl) {
      walletMenuEl.hidden = !shouldOpen;
    }
    if (walletDropdownEl) {
      walletDropdownEl.classList.toggle('is-open', shouldOpen);
    }
    connectBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  /**
   * @param {number} value
   * @returns {string}
   */
  function formatSolBalance(value) {
    if (!Number.isFinite(value)) {
      return '0';
    }
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value);
  }

  async function refreshSolBalance() {
    if (!solBalanceEl) return;
    const activeRequestId = ++solBalanceRequestId;
    solBalanceEl.textContent = '...';
    try {
      const balance = await walletGateway.getBalanceSol();
      if (activeRequestId !== solBalanceRequestId) return;
      solBalanceEl.textContent = formatSolBalance(balance);
    } catch {
      if (activeRequestId !== solBalanceRequestId) return;
      solBalanceEl.textContent = '0';
    }
  }

  if (backgroundVideoEl) {
    _disposeLobbyVideoAudio = setupLobbyBackgroundVideo(backgroundVideoEl);
  }

  let selectedSkinIndex = CHARACTER_SKINS.findIndex((skin) => skin.modelPath === selectedInitialModelPath);
  if (selectedSkinIndex < 0) {
    selectedSkinIndex = 0;
  }

  const previewRuntime = createCharacterPreview(stageEl, CHARACTER_SKINS[selectedSkinIndex].modelPath);
  _disposeCharacterPreview = previewRuntime.dispose;

  /**
   * @param {number} nextIndex
   */
  function setSkinIndex(nextIndex) {
    const total = CHARACTER_SKINS.length;
    selectedSkinIndex = ((nextIndex % total) + total) % total;
    const selectedSkin = CHARACTER_SKINS[selectedSkinIndex];
    skinLabelEl.textContent = selectedSkin.label;
    previewRuntime.setSkin(selectedSkin.modelPath);
    persistSelectedSkin(selectedSkin.modelPath);
  }

  setSkinIndex(selectedSkinIndex);

  _disposeLobbyClickEffects = setupLobbyClickEffects({
    screenEl: lobbyScreenEl,
    buttons: [connectBtn, disconnectBtn, enterBtn, skinPrevBtn, skinNextBtn]
  });

  skinPrevBtn.addEventListener('click', () => {
    setSkinIndex(selectedSkinIndex - 1);
  });

  skinNextBtn.addEventListener('click', () => {
    setSkinIndex(selectedSkinIndex + 1);
  });

  // ── Wallet state ──────────────────────────────────────────────────────────
  _unsubWallet = walletGateway.onChange((state) => {
    lastWalletState = state;
    if (!state.connected) {
      setWalletMenuOpen(false);
    }
    _renderWalletState(state, { connectBtn, disconnectBtn, enterBtn, statusEl, addressEl });
    if (state.connected) {
      void refreshSolBalance();
      return;
    }
    solBalanceRequestId += 1;
    if (solBalanceEl) {
      solBalanceEl.textContent = '0';
    }
  });

  // ── Connect ───────────────────────────────────────────────────────────────
  connectBtn.addEventListener('click', async () => {
    if (connectBtn.disabled) return;
    if (lastWalletState?.connected) {
      setWalletMenuOpen(!walletMenuOpen);
      return;
    }
    connectBtn.disabled = true;
    try {
      await walletGateway.connect();
    } catch (err) {
      console.error('[Lobby] connect failed:', err);
    }
  });

  disconnectBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (disconnectBtn.disabled) return;
    disconnectBtn.disabled = true;
    setWalletMenuOpen(false);
    try {
      await walletGateway.disconnect();
    } catch (err) {
      console.error('[Lobby] disconnect failed:', err);
    }
  });

  const onWindowClick = (event) => {
    if (!walletMenuOpen) return;
    if (!walletDropdownEl) return;
    if (!(event.target instanceof Node)) return;
    if (walletDropdownEl.contains(event.target)) return;
    setWalletMenuOpen(false);
  };
  const onWindowKeyDown = (event) => {
    if (event.key === 'Escape') {
      setWalletMenuOpen(false);
    }
  };
  window.addEventListener('click', onWindowClick);
  window.addEventListener('keydown', onWindowKeyDown);
  _disposeLobbyWalletMenu = () => {
    window.removeEventListener('click', onWindowClick);
    window.removeEventListener('keydown', onWindowKeyDown);
    setWalletMenuOpen(false);
  };

  // ── Enter game ────────────────────────────────────────────────────────────
  enterBtn.addEventListener('click', () => {
    if (enterBtn.disabled) return;
    if (!lastWalletState?.connected) {
      connectBtn.click();
      return;
    }
    const selectedSkin = CHARACTER_SKINS[selectedSkinIndex];
    unmountLobby();
    onEnterGame(selectedSkin.modelPath);
  });

  root.removeAttribute('hidden');
}

export function unmountLobby() {
  if (_unsubWallet) {
    _unsubWallet();
    _unsubWallet = null;
  }
  if (_disposeLobbyVideoAudio) {
    _disposeLobbyVideoAudio();
    _disposeLobbyVideoAudio = null;
  }
  if (_disposeCharacterPreview) {
    _disposeCharacterPreview();
    _disposeCharacterPreview = null;
  }
  if (_disposeLobbyClickEffects) {
    _disposeLobbyClickEffects();
    _disposeLobbyClickEffects = null;
  }
  if (_disposeLobbyWalletMenu) {
    _disposeLobbyWalletMenu();
    _disposeLobbyWalletMenu = null;
  }
  const root = document.getElementById('lobby');
  if (root) root.setAttribute('hidden', '');
}

/**
 * @param {HTMLVideoElement} videoEl
 * @returns {() => void}
 */
function setupLobbyBackgroundVideo(videoEl) {
  videoEl.defaultMuted = false;
  videoEl.muted = false;
  videoEl.volume = 1;

  function tryPlay() {
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Browsers can block audible autoplay until the first user interaction.
      });
    }
  }

  function resumeWithAudio() {
    videoEl.muted = false;
    tryPlay();
    window.removeEventListener('pointerdown', resumeWithAudio);
    window.removeEventListener('keydown', resumeWithAudio);
  }

  tryPlay();
  window.addEventListener('pointerdown', resumeWithAudio);
  window.addEventListener('keydown', resumeWithAudio);

  return () => {
    window.removeEventListener('pointerdown', resumeWithAudio);
    window.removeEventListener('keydown', resumeWithAudio);
    videoEl.pause();
  };
}

// ── Wallet state renderer ────────────────────────────────────────────────────

function _renderWalletState(state, { connectBtn, disconnectBtn, enterBtn, statusEl, addressEl }) {
  const noWallets = state.wallets.every((w) => !w.connectable);
  const connectLabel = connectBtn.querySelector('.lobby-btn-label');
  const enterLabel = enterBtn.querySelector('.lobby-btn-label');

  if (state.connecting) {
    connectBtn.disabled = true;
    disconnectBtn.disabled = true;
    if (connectLabel) connectLabel.textContent = state.disconnecting ? 'Disconnecting...' : 'Connecting...';
    if (enterLabel) enterLabel.textContent = 'Connect Wallet';
    enterBtn.disabled = true;
    statusEl.textContent = '';
    statusEl.classList.remove('lobby-status--error');
    addressEl.textContent = '';
    addressEl.hidden = true;
    return;
  }

  if (state.connected) {
    connectBtn.disabled = false;
    disconnectBtn.disabled = false;
    if (connectLabel) connectLabel.textContent = state.publicKeyShort || 'Connected';
    statusEl.textContent = 'Wallet connected';
    statusEl.classList.remove('lobby-status--error');
    addressEl.textContent = '';
    addressEl.hidden = true;
    enterBtn.disabled = false;
    if (enterLabel) enterLabel.textContent = 'Enter Game';
    return;
  }

  if (enterLabel) enterLabel.textContent = 'Connect Wallet';
  enterBtn.disabled = true;
  disconnectBtn.disabled = true;
  addressEl.textContent = '';
  addressEl.hidden  = true;

  connectBtn.disabled = noWallets;
  if (connectLabel) connectLabel.textContent = 'Connect Wallet';

  if (state.error) {
    statusEl.textContent = state.error;
    statusEl.classList.add('lobby-status--error');
  } else if (noWallets) {
    statusEl.textContent = 'No wallet found - install Phantom or Solflare.';
    statusEl.classList.remove('lobby-status--error');
  } else {
    statusEl.textContent = '';
    statusEl.classList.remove('lobby-status--error');
  }
}

/**
 * @param {HTMLElement} mountEl
 * @param {string} initialModelPath
 * @returns {{ setSkin: (modelPath: string) => void, dispose: () => void }}
 */
function createCharacterPreview(mountEl, initialModelPath) {
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 30);
  camera.position.set(0, 1.5, 4);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'lobby-character-canvas';
  mountEl.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xe8ecff, 0x3d4655, 0.95);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2.3, 3.1, 2.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x98b8ff, 0.65);
  rim.position.set(-2.1, 2.4, -1.5);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 28),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.36, 0.3, 0.16),
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.92;
  scene.add(floor);

  const loader = new GLTFLoader();
  const modelBounds = new THREE.Box3();
  const modelCenter = new THREE.Vector3();
  const modelSize = new THREE.Vector3();
  const fitBounds = new THREE.Box3();
  const fitSize = new THREE.Vector3();
  const fitCenter = new THREE.Vector3();
  const floorProbePoint = new THREE.Vector3();
  const floorProbeNdc = new THREE.Vector3();
  const topProbePoint = new THREE.Vector3();
  const topProbeNdc = new THREE.Vector3();
  const bottomProbePoint = new THREE.Vector3();
  const bottomProbeNdc = new THREE.Vector3();

  /** @type {THREE.Object3D | null} */
  let activeModel = null;
  let disposed = false;
  let requestId = 0;
  let frameId = 0;

  /**
   * @param {THREE.Object3D | null} modelRoot
   */
  function disposeModelResources(modelRoot) {
    if (!modelRoot) {
      return;
    }

    modelRoot.traverse((node) => {
      if (!node?.isMesh) {
        return;
      }

      if (node.geometry?.dispose) {
        node.geometry.dispose();
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material?.dispose) {
          material.dispose();
        }
      }
    });
  }

  /**
   * @param {THREE.Object3D} modelRoot
   */
  function prepareModel(modelRoot) {
    modelBounds.setFromObject(modelRoot);
    if (!modelBounds.isEmpty()) {
      modelBounds.getCenter(modelCenter);
      modelBounds.getSize(modelSize);
      modelRoot.position.x -= modelCenter.x;
      modelRoot.position.z -= modelCenter.z;
      modelRoot.position.y -= modelBounds.min.y;

      const height = Math.max(modelSize.y, 0.001);
      const scale = 2.42 / height;
      modelRoot.scale.setScalar(scale);
    }

    // Keep spawn orientation facing the lobby camera before idle spin begins.
    modelRoot.rotation.y = 0;
    modelRoot.traverse((node) => {
      if (!node?.isMesh) {
        return;
      }
      node.castShadow = false;
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
  }

  /**
   * Keep the full character visible inside the stage regardless of skin proportions.
   *
   * @param {THREE.Object3D} modelRoot
   */
  function fitCameraToModel(modelRoot) {
    fitBounds.setFromObject(modelRoot);
    if (fitBounds.isEmpty()) {
      return;
    }

    fitBounds.getSize(fitSize);
    fitBounds.getCenter(fitCenter);

    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const usableHorizontalFov = 2 * Math.atan(Math.tan(horizontalFov / 2) * 0.84);

    const halfHeight = Math.max(fitSize.y * 0.5, 0.001);
    // Use radius to avoid clipping while the model rotates.
    const halfWidth = Math.max(Math.hypot(fitSize.x * 0.5, fitSize.z * 0.5), 0.001);

    const distanceV = halfHeight / Math.tan(verticalFov / 2);
    const distanceH = halfWidth / Math.tan(Math.max(usableHorizontalFov / 2, 0.01));
    const previewZoom = 1.68;
    let distance = (Math.max(distanceV, distanceH) * 0.96 + fitSize.z * 0.52) / previewZoom;

    // Move character slightly lower in frame while preserving full head + shadow visibility.
    let lookY = fitCenter.y + fitSize.y * 0.165;
    const cameraYOffset = fitSize.y * 0.115;
    const topVisibilityMaxNdcY = 0.84;
    const floorVisibilityMinNdcY = -0.52;
    const modelBottomMinNdcY = -0.56;

    const floorOffsetBelowFeet = Math.max(0.012, fitSize.y * 0.006);
    floor.position.y = fitBounds.min.y - floorOffsetBelowFeet;
    let floorScale = Math.max(0.82, (fitSize.x + fitSize.z) * 0.34);
    floor.scale.setScalar(floorScale);

    const applyCamera = () => {
      camera.position.set(fitCenter.x, lookY + cameraYOffset, fitCenter.z + distance);
      camera.near = Math.max(0.01, distance / 150);
      camera.far = Math.max(20, distance + fitSize.z * 6 + fitSize.y * 2);
      camera.updateProjectionMatrix();
      camera.lookAt(fitCenter.x, lookY, fitCenter.z);
      camera.updateMatrixWorld(true);
    };

    /**
     * @returns {number}
     */
    const measureFloorMinNdcY = () => {
      floor.updateMatrixWorld(true);
      const floorRadius = 1.25 * floor.scale.x;
      let minY = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2;
        floorProbePoint.set(
          floor.position.x + Math.cos(angle) * floorRadius,
          floor.position.y,
          floor.position.z + Math.sin(angle) * floorRadius
        );
        floorProbeNdc.copy(floorProbePoint).project(camera);
        minY = Math.min(minY, floorProbeNdc.y);
      }
      return minY;
    };

    /**
     * @returns {number}
     */
    const measureTopNdcY = () => {
      topProbePoint.set(fitCenter.x, fitBounds.max.y + fitSize.y * 0.03, fitCenter.z);
      topProbeNdc.copy(topProbePoint).project(camera);
      return topProbeNdc.y;
    };

    /**
     * @returns {number}
     */
    const measureModelBottomNdcY = () => {
      bottomProbePoint.set(fitCenter.x, fitBounds.min.y, fitCenter.z);
      bottomProbeNdc.copy(bottomProbePoint).project(camera);
      return bottomProbeNdc.y;
    };

    applyCamera();

    for (let i = 0; i < 12; i += 1) {
      const topNdcY = measureTopNdcY();
      const floorNdcY = measureFloorMinNdcY();
      const modelBottomNdcY = measureModelBottomNdcY();

      if (
        topNdcY <= topVisibilityMaxNdcY
        && floorNdcY >= floorVisibilityMinNdcY
        && modelBottomNdcY >= modelBottomMinNdcY
      ) {
        break;
      }

      if (topNdcY > topVisibilityMaxNdcY) {
        distance *= 1.06;
        applyCamera();
        continue;
      }

      if (modelBottomNdcY < modelBottomMinNdcY) {
        lookY -= fitSize.y * 0.02;
        applyCamera();
        if (measureModelBottomNdcY() < modelBottomMinNdcY) {
          distance *= 1.04;
          applyCamera();
        }
        continue;
      }

      floorScale = Math.max(0.56, floorScale * 0.9);
      floor.scale.setScalar(floorScale);

      if (measureFloorMinNdcY() < floorVisibilityMinNdcY) {
        distance *= 1.03;
        applyCamera();
      }
    }

    // Final guarantee pass: keep the full shadow disc inside the frame bottom margin.
    for (let i = 0; i < 6 && measureFloorMinNdcY() < floorVisibilityMinNdcY; i += 1) {
      floorScale = Math.max(0.5, floorScale * 0.92);
      floor.scale.setScalar(floorScale);
      if (measureFloorMinNdcY() < floorVisibilityMinNdcY) {
        distance *= 1.04;
        applyCamera();
      }
    }
  }

  function setRendererSize() {
    const width = Math.max(120, Math.floor(mountEl.clientWidth));
    const height = Math.max(160, Math.floor(mountEl.clientHeight));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (activeModel) {
      fitCameraToModel(activeModel);
    }
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      setRendererSize();
    })
    : null;
  resizeObserver?.observe(mountEl);
  window.addEventListener('resize', setRendererSize);
  setRendererSize();

  function animate() {
    if (disposed) return;
    if (activeModel) {
      activeModel.rotation.y += 0.007;
    }
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animate);
  }

  /**
   * @param {string} modelPath
   */
  function setSkin(modelPath) {
    requestId += 1;
    const currentRequest = requestId;

    loader.load(
      modelPath,
      (gltf) => {
        if (disposed || currentRequest !== requestId) {
          return;
        }

        const model = gltf.scene;
        prepareModel(model);

        if (activeModel) {
          scene.remove(activeModel);
          disposeModelResources(activeModel);
        }
        activeModel = model;
        scene.add(activeModel);
        fitCameraToModel(activeModel);
      },
      undefined,
      (error) => {
        console.warn('[Lobby] failed to load skin preview model:', modelPath, error);
      }
    );
  }

  frameId = window.requestAnimationFrame(animate);
  setSkin(initialModelPath);

  return {
    setSkin,
    dispose() {
      disposed = true;
      requestId += 1;
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', setRendererSize);
      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (activeModel) {
        scene.remove(activeModel);
        disposeModelResources(activeModel);
      }
    }
  };
}
