import { Connection, clusterApiUrl } from '@solana/web3.js';
import { WalletAdapterNetwork, WalletReadyState } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

const CONNECTABLE_STATES = new Set([WalletReadyState.Installed, WalletReadyState.Loadable]);
const READYSTATE_PRIORITY = new Map([
  [WalletReadyState.Installed, 0],
  [WalletReadyState.Loadable, 1],
  [WalletReadyState.NotDetected, 2],
  [WalletReadyState.Unsupported, 3]
]);
const DEFAULT_SELECTION_STORAGE_KEY = 'mine-duel.wallet.selection';

function normalizeNetwork(network) {
  if (network === WalletAdapterNetwork.Mainnet || network === 'mainnet-beta') {
    return WalletAdapterNetwork.Mainnet;
  }
  if (network === WalletAdapterNetwork.Testnet || network === 'testnet') {
    return WalletAdapterNetwork.Testnet;
  }
  return WalletAdapterNetwork.Devnet;
}

function resolveRpcEndpoint({ network, rpcEndpoint }) {
  if (typeof rpcEndpoint === 'string' && rpcEndpoint.trim()) {
    return rpcEndpoint.trim();
  }
  return clusterApiUrl(network);
}

function canConnect(readyState) {
  return CONNECTABLE_STATES.has(readyState);
}

function toErrorMessage(error) {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toPublicKeyShort(base58) {
  if (!base58 || base58.length < 10) {
    return base58 || '';
  }
  return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
}

function compareWallets(left, right) {
  const leftRank = READYSTATE_PRIORITY.get(left.readyState) ?? 99;
  const rightRank = READYSTATE_PRIORITY.get(right.readyState) ?? 99;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.name.localeCompare(right.name);
}

export function createWalletGateway(options = {}) {
  const network = normalizeNetwork(options.network);
  const rpcEndpoint = resolveRpcEndpoint({
    network,
    rpcEndpoint: options.rpcEndpoint
  });
  const connection = new Connection(rpcEndpoint, {
    commitment: 'confirmed'
  });

  const adapters = [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })];
  const listeners = new Set();
  const disposeCallbacks = [];

  const persistSelection = options.persistSelection !== false;
  const storageKey = options.storageKey || DEFAULT_SELECTION_STORAGE_KEY;
  let selectedWalletName = typeof options.selectedWalletName === 'string' ? options.selectedWalletName : '';
  let activeAdapter = null;
  let connecting = false;
  let disconnecting = false;
  let ignoreConnectEvents = false;
  let lastErrorMessage = '';

  if (persistSelection && !selectedWalletName) {
    try {
      selectedWalletName = localStorage.getItem(storageKey) || '';
    } catch {
      selectedWalletName = '';
    }
  }

  function persistSelectionName(nextSelection) {
    if (!persistSelection) {
      return;
    }
    try {
      if (nextSelection) {
        localStorage.setItem(storageKey, nextSelection);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage access is best-effort only.
    }
  }

  function findAdapterByName(walletName) {
    return adapters.find((adapter) => String(adapter.name) === walletName) || null;
  }

  function walletDescriptor(adapter) {
    const name = String(adapter.name);
    return {
      name,
      readyState: adapter.readyState,
      connectable: canConnect(adapter.readyState),
      installed: adapter.readyState === WalletReadyState.Installed,
      connected: adapter.connected,
      selected: name === selectedWalletName
    };
  }

  function getWallets() {
    return adapters.map(walletDescriptor).sort(compareWallets);
  }

  function getBestConnectableAdapter() {
    const sorted = getWallets().filter((wallet) => wallet.connectable);
    if (sorted.length === 0) {
      return null;
    }
    return findAdapterByName(sorted[0].name);
  }

  function syncSelectedWallet() {
    if (findAdapterByName(selectedWalletName)) {
      return;
    }
    const fallback = getBestConnectableAdapter();
    selectedWalletName = fallback ? String(fallback.name) : '';
    persistSelectionName(selectedWalletName);
  }

  function getState() {
    const connectedPublicKey = activeAdapter?.publicKey ? activeAdapter.publicKey.toBase58() : '';
    return {
      network,
      rpcEndpoint,
      wallets: getWallets(),
      selectedWalletName,
      connected: Boolean(activeAdapter?.publicKey),
      connecting,
      disconnecting,
      connectedWalletName: activeAdapter ? String(activeAdapter.name) : '',
      publicKey: connectedPublicKey,
      publicKeyShort: toPublicKeyShort(connectedPublicKey),
      error: lastErrorMessage
    };
  }

  function notify() {
    const snapshot = getState();
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  for (const adapter of adapters) {
    const onConnect = () => {
      if (ignoreConnectEvents) {
        return;
      }
      activeAdapter = adapter;
      selectedWalletName = String(adapter.name);
      persistSelectionName(selectedWalletName);
      connecting = false;
      disconnecting = false;
      lastErrorMessage = '';
      notify();
    };

    const onDisconnect = () => {
      if (activeAdapter === adapter) {
        activeAdapter = null;
      }
      connecting = false;
      disconnecting = false;
      notify();
    };

    const onError = (error) => {
      lastErrorMessage = toErrorMessage(error);
      connecting = false;
      disconnecting = false;
      notify();
    };

    const onReadyStateChange = () => {
      notify();
    };

    adapter.on('connect', onConnect);
    adapter.on('disconnect', onDisconnect);
    adapter.on('error', onError);
    adapter.on('readyStateChange', onReadyStateChange);

    disposeCallbacks.push(() => {
      adapter.off('connect', onConnect);
      adapter.off('disconnect', onDisconnect);
      adapter.off('error', onError);
      adapter.off('readyStateChange', onReadyStateChange);
    });
  }

  syncSelectedWallet();

  function setSelectedWallet(walletName) {
    const adapter = findAdapterByName(walletName);
    if (!adapter) {
      return;
    }
    selectedWalletName = String(adapter.name);
    persistSelectionName(selectedWalletName);
    lastErrorMessage = '';
    notify();
  }

  function resolveConnectTarget(walletName) {
    if (walletName) {
      const requested = findAdapterByName(walletName);
      if (!requested) {
        throw new Error(`Unknown wallet connector: ${walletName}`);
      }
      if (!canConnect(requested.readyState)) {
        throw new Error(`${walletName} is not available in this browser session.`);
      }
      return requested;
    }

    const selected = findAdapterByName(selectedWalletName);
    if (selected && canConnect(selected.readyState)) {
      return selected;
    }

    const fallback = getBestConnectableAdapter();
    if (fallback) {
      return fallback;
    }

    throw new Error('No supported Solana wallet connector is available.');
  }

  async function connect(walletName) {
    const target = resolveConnectTarget(walletName);
    ignoreConnectEvents = false;
    disconnecting = false;

    if (activeAdapter && activeAdapter !== target && activeAdapter.connected) {
      await activeAdapter.disconnect();
      activeAdapter = null;
    }

    selectedWalletName = String(target.name);
    persistSelectionName(selectedWalletName);

    connecting = true;
    lastErrorMessage = '';
    notify();

    try {
      await target.connect();
      activeAdapter = target;
      return target.publicKey;
    } catch (error) {
      lastErrorMessage = toErrorMessage(error);
      throw error;
    } finally {
      connecting = false;
      notify();
    }
  }

  async function disconnect() {
    ignoreConnectEvents = true;
    const adaptersToDisconnect = adapters.filter((adapter) => adapter.connected || adapter === activeAdapter);
    if (adaptersToDisconnect.length === 0) {
      lastErrorMessage = '';
      activeAdapter = null;
      connecting = false;
      disconnecting = false;
      notify();
      return;
    }

    // Reflect disconnected UI state immediately instead of waiting for wallet-adapter events.
    activeAdapter = null;
    connecting = true;
    disconnecting = true;
    lastErrorMessage = '';
    notify();

    /** @type {unknown} */
    let firstError = null;

    try {
      for (const adapter of adaptersToDisconnect) {
        try {
          await adapter.disconnect();
        } catch (error) {
          if (!firstError) {
            firstError = error;
          }
        }
      }

      if (firstError) {
        throw firstError;
      }
    } catch (error) {
      lastErrorMessage = toErrorMessage(error);
      throw error;
    } finally {
      activeAdapter = null;
      connecting = false;
      disconnecting = false;
      notify();
    }
  }

  function requireConnectedAdapter(featureName) {
    if (!activeAdapter || !activeAdapter.connected || !activeAdapter.publicKey) {
      throw new Error('Wallet is not connected.');
    }

    if (featureName && typeof activeAdapter[featureName] !== 'function') {
      throw new Error(`Connected wallet does not support ${featureName}().`);
    }

    return activeAdapter;
  }

  async function signTransaction(transaction) {
    const adapter = requireConnectedAdapter('signTransaction');
    return adapter.signTransaction(transaction);
  }

  async function signAllTransactions(transactions) {
    const adapter = requireConnectedAdapter('signAllTransactions');
    return adapter.signAllTransactions(transactions);
  }

  async function signMessage(bytes) {
    const adapter = requireConnectedAdapter('signMessage');
    return adapter.signMessage(bytes);
  }

  async function sendTransaction(transaction, options) {
    const adapter = requireConnectedAdapter('sendTransaction');
    return adapter.sendTransaction(transaction, connection, options);
  }

  async function getBalanceSol() {
    const adapter = requireConnectedAdapter();
    const lamports = await connection.getBalance(adapter.publicKey, 'confirmed');
    return lamports / 1_000_000_000;
  }

  function onChange(listener) {
    listeners.add(listener);
    listener(getState());
    return () => {
      listeners.delete(listener);
    };
  }

  async function destroy() {
    for (const dispose of disposeCallbacks) {
      dispose();
    }
    listeners.clear();
    await disconnect();
  }

  return {
    network,
    rpcEndpoint,
    connection,
    getState,
    getWallets,
    setSelectedWallet,
    connect,
    disconnect,
    signTransaction,
    signAllTransactions,
    signMessage,
    sendTransaction,
    getBalanceSol,
    onChange,
    destroy
  };
}
