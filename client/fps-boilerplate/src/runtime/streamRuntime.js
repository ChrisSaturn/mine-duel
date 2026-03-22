import { Transaction } from '@solana/web3.js';

function toBase64(bytes) {
  if (!bytes) {
    return '';
  }

  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    out += String.fromCharCode(source[i]);
  }
  return btoa(out);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `Request failed: ${response.status}`);
  }

  return body;
}

function resolveUrls(base) {
  const normalized = String(base || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return {
      httpBase: '',
      wsBase: ''
    };
  }

  const ws = normalized.replace(/^http/, 'ws');
  return {
    httpBase: normalized,
    wsBase: ws
  };
}

export function createStreamRuntime(options) {
  const {
    walletGateway,
    worldProfileId,
    runtimeBaseUrl,
    gatewayBaseUrl,
    programId,
    getPlayerPose,
    getMineZones,
    onEvent,
    onStatus
  } = options;

  const resolvedRuntimeBaseUrl = runtimeBaseUrl || gatewayBaseUrl || '';
  const { httpBase, wsBase } = resolveUrls(resolvedRuntimeBaseUrl);

  let session = null;
  let ws = null;
  let reconnectTimer = null;
  let stopped = false;
  let intentSeq = 0;
  let lastCursor = 0;
  let sessionKeypair = null;

  function buildMineIntentMessage(intentSeqValue, voxel) {
    return `mine_intent\\nwallet=${session?.walletPubkey || ''}\\nworld_profile_id=${worldProfileId}\\nintent_seq=${intentSeqValue}\\nvoxel=${voxel.x},${voxel.y},${voxel.z}`;
  }

  function updateStatus(status, detail = '') {
    if (typeof onStatus === 'function') {
      onStatus({ status, detail });
    }
  }

  function emit(event, payload, cursor) {
    if (Number.isFinite(cursor) && cursor > lastCursor) {
      lastCursor = cursor;
    }

    if (typeof onEvent === 'function') {
      onEvent({ event, payload, cursor: lastCursor });
    }

    if (ws && ws.readyState === WebSocket.OPEN && Number.isFinite(lastCursor)) {
      ws.send(JSON.stringify({
        op: 'ack_cursor',
        cursor: lastCursor
      }));
    }
  }

  async function ensureSession() {
    const state = walletGateway?.getState?.();
    if (!state?.connected || !state.publicKey) {
      throw new Error('Connect wallet before starting stream runtime.');
    }

    updateStatus('auth', 'Requesting session challenge');
    const challenge = await postJson(`${httpBase}/api/session/challenge`, {
      wallet_pubkey: state.publicKey
    });

    if (typeof walletGateway.signMessage !== 'function') {
      throw new Error('Connected wallet does not support signMessage().');
    }

    if (!globalThis.crypto?.subtle) {
      throw new Error('WebCrypto SubtleCrypto API is required for session-key signing.');
    }

    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );
    const exportedSessionPubkey = new Uint8Array(
      await globalThis.crypto.subtle.exportKey('raw', generated.publicKey)
    );
    sessionKeypair = {
      privateKey: generated.privateKey,
      publicKeyBase64: toBase64(exportedSessionPubkey)
    };
    const sessionPubkeyBase64 = sessionKeypair.publicKeyBase64;
    const walletChallengeMessage = `${challenge.challenge_message}\\nsession_pubkey=${sessionPubkeyBase64}`;
    const walletSignature = await walletGateway.signMessage(new TextEncoder().encode(walletChallengeMessage));
    const opened = await postJson(`${httpBase}/api/session/open`, {
      wallet_pubkey: state.publicKey,
      challenge_id: challenge.challenge_id,
      wallet_signature_base64: toBase64(walletSignature),
      session_pubkey_base64: sessionPubkeyBase64
    });

    updateStatus('setup', 'Preparing setup transactions');
    const prepared = await postJson(`${httpBase}/api/tx/prepare`, {
      wallet_pubkey: state.publicKey,
      world_profile_id: worldProfileId,
      session_id: opened.session_id,
      session_pubkey_base64: opened.session_pubkey,
      program_id: programId
    });

    for (const tx of prepared.txs || []) {
      if (typeof walletGateway.signTransaction !== 'function') {
        throw new Error('Connected wallet does not support signTransaction().');
      }

      const unsignedTxBytes = Uint8Array.from(atob(tx.unsigned_tx_base64), (char) => char.charCodeAt(0));
      const unsignedTx = Transaction.from(unsignedTxBytes);
      const signedTx = await walletGateway.signTransaction(unsignedTx);

      await postJson(`${httpBase}/api/tx/confirm`, {
        tx_id: tx.tx_id,
        tx_label: tx.tx_label,
        wallet_pubkey: state.publicKey,
        signed_tx_base64: toBase64(signedTx.serialize({ requireAllSignatures: false, verifySignatures: false }))
      });
    }

    session = {
      walletPubkey: state.publicKey,
      sessionId: opened.session_id,
      sessionPubkey: opened.session_pubkey,
      expiresAt: opened.expires_at
    };

    updateStatus('ready', 'Session active');
  }

  function subscribeWindow() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !session) {
      return;
    }

    const pose = typeof getPlayerPose === 'function' ? getPlayerPose() : null;
    const mineZones = typeof getMineZones === 'function' ? getMineZones() : [];
    ws.send(JSON.stringify({
      op: 'subscribe_world_window',
      session_id: session.sessionId,
      wallet_pubkey: session.walletPubkey,
      world_profile_id: worldProfileId,
      cursor: lastCursor,
      position: pose?.position || { x: 0, y: 0, z: 0 },
      velocity: pose?.velocity || { x: 0, y: 0, z: 0 },
      view_dir: pose?.viewDir || { x: 0, y: 0, z: -1 },
      mine_zones: mineZones
    }));
  }

  function connectWs() {
    if (!session) {
      return;
    }

    if (ws) {
      ws.close();
      ws = null;
    }

    updateStatus('stream_connecting', 'Opening WebSocket stream');
    ws = new WebSocket(wsBase);

    ws.addEventListener('open', () => {
      updateStatus('stream_live', 'Realtime stream connected');
      subscribeWindow();
    });

    ws.addEventListener('message', (message) => {
      let parsed = null;
      try {
        parsed = JSON.parse(String(message.data));
      } catch {
        return;
      }

      emit(parsed.event, parsed.payload, parsed.cursor);
    });

    ws.addEventListener('close', () => {
      if (stopped) {
        return;
      }
      updateStatus('stream_reconnecting', 'Socket closed, retrying');
      reconnectTimer = window.setTimeout(connectWs, 1000);
    });

    ws.addEventListener('error', () => {
      updateStatus('stream_error', 'WebSocket error');
    });
  }

  async function start() {
    if (!httpBase || !wsBase) {
      throw new Error(
        'Managed PER runtime is not configured. Set VITE_PER_RUNTIME_URL (or legacy VITE_WORLD_STREAM_GATEWAY_URL).',
      );
    }
    stopped = false;
    intentSeq = 0;
    await ensureSession();
    connectWs();
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    session = null;
    sessionKeypair = null;
    updateStatus('stopped', 'Stream runtime stopped');
  }

  async function sendMineIntent(voxel) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !session) {
      return false;
    }

    intentSeq += 1;
    if (!sessionKeypair?.privateKey) {
      intentSeq -= 1;
      return false;
    }

    const message = buildMineIntentMessage(intentSeq, voxel);
    const sigBytes = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        'Ed25519',
        sessionKeypair.privateKey,
        new TextEncoder().encode(message)
      )
    );

    if (!ws || ws.readyState !== WebSocket.OPEN || !session) {
      intentSeq -= 1;
      return false;
    }

    ws.send(JSON.stringify({
      op: 'mine_intent',
      session_id: session.sessionId,
      wallet_pubkey: session.walletPubkey,
      world_profile_id: worldProfileId,
      intent_seq: intentSeq,
      session_sig_base64: toBase64(sigBytes),
      voxel
    }));

    return true;
  }

  return {
    start,
    stop,
    sendMineIntent,
    setIntentSeq(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      intentSeq = Math.max(0, Math.floor(parsed));
    }
  };
}
