import './lobby.css';

/** @type {(() => void) | null} */
let _unsubWallet = null;

// ── 9-patch helper ──────────────────────────────────────────────────────────

/**
 * Build the 9 inner child spans/divs for a nine-patch element.
 * The center cell uses a <div>; the eight border cells use <span aria-hidden>.
 *
 * @param {string} centerHtml  innerHTML for the center (.np__mc) cell
 * @returns {string}
 */
function npInner(centerHtml) {
  return `
    <span class="np__tl" aria-hidden="true"></span>
    <span class="np__tc" aria-hidden="true"></span>
    <span class="np__tr" aria-hidden="true"></span>
    <span class="np__ml" aria-hidden="true"></span>
    <div  class="np__mc">${centerHtml}</div>
    <span class="np__mr" aria-hidden="true"></span>
    <span class="np__bl" aria-hidden="true"></span>
    <span class="np__bc" aria-hidden="true"></span>
    <span class="np__br" aria-hidden="true"></span>
  `;
}

// ── Mount / unmount ─────────────────────────────────────────────────────────

/**
 * @param {{ walletGateway: object, onEnterGame: () => void }} opts
 */
export function mountLobby({ walletGateway, onEnterGame }) {
  const root = document.getElementById('lobby');
  if (!root) return;

  // ── DOM ──────────────────────────────────────────────────────────────────
  root.innerHTML = `
    <div class="lobby-inner">

      <img
        class="lobby-title-logo"
        src="/ui/lobby-logo.png"
        alt="Mine Duel"
      />

      <!-- Panel: tile_0000/ (plain warm-tan border) -->
      <div class="np np--s0 lobby-panel">
        ${npInner(`
          <div class="lobby-panel-content">

            <!-- Connect Wallet: tile_0007/ (inner bevel) -->
            <button
              class="np np--s1 lobby-btn"
              id="lobby-connect-btn"
              type="button"
            >${npInner('Connect Wallet')}</button>

            <p class="lobby-status" id="lobby-status" aria-live="polite"></p>
            <p class="lobby-address" id="lobby-address" hidden></p>

            <!-- Enter Game: tile_0031/ (alternate corner) -->
            <button
              class="np np--s2 lobby-btn"
              id="lobby-enter-btn"
              type="button"
              hidden
            >${npInner('Enter Game')}</button>

          </div>
        `)}
      </div>

    </div>
  `;

  const connectBtn = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-connect-btn'));
  const enterBtn   = /** @type {HTMLButtonElement} */ (root.querySelector('#lobby-enter-btn'));
  const statusEl   = /** @type {HTMLElement} */       (root.querySelector('#lobby-status'));
  const addressEl  = /** @type {HTMLElement} */       (root.querySelector('#lobby-address'));

  // ── Wallet state ──────────────────────────────────────────────────────────
  _unsubWallet = walletGateway.onChange((state) => {
    _renderWalletState(state, { connectBtn, enterBtn, statusEl, addressEl });
  });

  // ── Connect ───────────────────────────────────────────────────────────────
  connectBtn.addEventListener('click', async () => {
    if (connectBtn.disabled) return;
    connectBtn.disabled = true;
    try {
      await walletGateway.connect();
    } catch (err) {
      console.error('[Lobby] connect failed:', err);
    }
  });

  // ── Enter game ────────────────────────────────────────────────────────────
  enterBtn.addEventListener('click', () => {
    unmountLobby();
    onEnterGame();
  });

  root.removeAttribute('hidden');
}

export function unmountLobby() {
  if (_unsubWallet) {
    _unsubWallet();
    _unsubWallet = null;
  }
  const root = document.getElementById('lobby');
  if (root) root.setAttribute('hidden', '');
}

// ── Wallet state renderer ────────────────────────────────────────────────────

function _renderWalletState(state, { connectBtn, enterBtn, statusEl, addressEl }) {
  const noWallets = state.wallets.every((w) => !w.connectable);

  if (state.connected) {
    connectBtn.hidden = true;
    statusEl.textContent = 'Wallet connected';
    statusEl.classList.remove('lobby-status--error');
    addressEl.textContent = state.publicKeyShort;
    addressEl.hidden = false;
    enterBtn.hidden = false;
    return;
  }

  connectBtn.hidden = false;
  enterBtn.hidden   = true;
  addressEl.hidden  = true;

  if (state.connecting) {
    connectBtn.disabled = true;
    // Update the center cell text
    const mc = connectBtn.querySelector('.np__mc');
    if (mc) mc.textContent = 'Connecting…';
    statusEl.textContent = '';
    statusEl.classList.remove('lobby-status--error');
    return;
  }

  connectBtn.disabled = noWallets;
  const mc = connectBtn.querySelector('.np__mc');
  if (mc) mc.textContent = 'Connect Wallet';

  if (state.error) {
    statusEl.textContent = state.error;
    statusEl.classList.add('lobby-status--error');
  } else if (noWallets) {
    statusEl.textContent = 'No wallet found — install Phantom or Solflare.';
    statusEl.classList.remove('lobby-status--error');
  } else {
    statusEl.textContent = '';
    statusEl.classList.remove('lobby-status--error');
  }
}
