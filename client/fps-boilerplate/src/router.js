/**
 * Minimal hash router.
 *
 * Routes:
 *   #/lobby  (default) – lobby view
 *   #/game            – in-game view
 */

const ROUTE_LOBBY = '#/lobby';
const ROUTE_GAME  = '#/game';

/**
 * @param {{ onLobby: () => void, onGame: () => void }} handlers
 * @returns {{ goToGame: () => void, goToLobby: () => void }}
 */
export function initRouter({ onLobby, onGame }) {
  function dispatch() {
    const hash = window.location.hash;
    if (hash === ROUTE_GAME) {
      onGame();
    } else {
      // Default to lobby for any unrecognised or empty hash
      if (hash !== ROUTE_LOBBY) {
        window.location.replace(ROUTE_LOBBY);
      }
      onLobby();
    }
  }

  window.addEventListener('hashchange', dispatch);
  dispatch();

  return {
    goToGame()  { window.location.hash = ROUTE_GAME; },
    goToLobby() { window.location.hash = ROUTE_LOBBY; }
  };
}
