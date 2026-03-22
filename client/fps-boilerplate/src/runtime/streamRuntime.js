import { createRoomRuntime } from './gameplay/roomRuntime.js';

/**
 * Compatibility wrapper for legacy call sites.
 *
 * The managed PER/world_profile stream runtime has been removed from the
 * default gameplay path. This adapter now uses direct on-chain account
 * subscriptions (`RoomShared`, `WinnerState`, local `PlayerReveal`) and
 * session-key signed mining via `roomRuntime`.
 */
export function createStreamRuntime(options) {
  const {
    walletGateway,
    programId,
    roomCode,
    erRpcUrl,
    erWsUrl,
    onEvent,
    onStatus
  } = options || {};

  if (!walletGateway) {
    throw new Error('createStreamRuntime requires walletGateway.');
  }
  if (!programId) {
    throw new Error('createStreamRuntime requires programId.');
  }
  if (!roomCode) {
    throw new Error('createStreamRuntime requires roomCode.');
  }

  const roomRuntime = createRoomRuntime({
    walletGateway,
    programId,
    erRpcUrl,
    erWsUrl
  });

  let unsubscribe = null;

  function emitStatus(status, detail = '') {
    if (typeof onStatus === 'function') {
      onStatus({ status, detail });
    }
  }

  async function start() {
    const state = walletGateway.getState();
    if (!state?.connected || !state.publicKey) {
      throw new Error('Connect wallet before starting gameplay runtime.');
    }

    emitStatus('subscribing', 'Opening on-chain account subscriptions');
    unsubscribe = roomRuntime.subscribeRoom({
      roomCode,
      localPlayer: state.publicKey,
      onState: (payload) => {
        if (typeof onEvent === 'function') {
          onEvent({
            event: 'room_state',
            payload
          });
        }
      }
    });
    emitStatus('live', 'On-chain subscriptions active');
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    roomRuntime.clearSession();
    emitStatus('stopped', 'Runtime stopped');
  }

  async function sendMineIntent(voxel) {
    if (!voxel || !Number.isFinite(voxel.x) || !Number.isFinite(voxel.y) || !Number.isFinite(voxel.z)) {
      return false;
    }
    await roomRuntime.mine(roomCode, voxel);
    return true;
  }

  return {
    start,
    stop,
    sendMineIntent,
    setIntentSeq() {
      // Legacy no-op retained for backward compatibility.
    }
  };
}
