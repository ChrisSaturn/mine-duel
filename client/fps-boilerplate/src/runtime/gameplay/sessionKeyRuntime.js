import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';

const TEXT_ENCODER = new TextEncoder();

export const SESSION_KEYS_PROGRAM_ID = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');
const SESSION_TOKEN_SEED = TEXT_ENCODER.encode('session_token');
const CREATE_SESSION_DISCRIMINATOR = Uint8Array.from([242, 193, 143, 179, 150, 25, 122, 227]);

function toErrorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, bytes) => sum + bytes.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeI64LE(value) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setBigInt64(0, BigInt(Math.trunc(Number(value))), true);
  return out;
}

function encodeU64LE(value) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const big = BigInt(Math.max(0, Math.trunc(Number(value))));
  view.setBigUint64(0, big, true);
  return out;
}

function encodeOptionBool(value) {
  if (value == null) {
    return Uint8Array.of(0);
  }
  return Uint8Array.of(1, value ? 1 : 0);
}

function encodeOptionI64(value) {
  if (value == null) {
    return Uint8Array.of(0);
  }
  return concatBytes([Uint8Array.of(1), encodeI64LE(value)]);
}

function encodeOptionU64(value) {
  if (value == null) {
    return Uint8Array.of(0);
  }
  return concatBytes([Uint8Array.of(1), encodeU64LE(value)]);
}

function requireWalletConnection(walletGateway) {
  const state = walletGateway?.getState?.();
  if (!state?.connected || !state.publicKey) {
    throw new Error('Connect wallet before creating a gameplay session key.');
  }
  return new PublicKey(state.publicKey);
}

function deriveSessionTokenPda({ targetProgram, sessionSigner, authority }) {
  return PublicKey.findProgramAddressSync(
    [
      SESSION_TOKEN_SEED,
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer()
    ],
    SESSION_KEYS_PROGRAM_ID
  )[0];
}

function buildCreateSessionInstruction({
  authority,
  sessionSigner,
  targetProgram,
  validUntil,
  topUp,
  lamports
}) {
  const sessionToken = deriveSessionTokenPda({ targetProgram, sessionSigner, authority });
  const data = concatBytes([
    CREATE_SESSION_DISCRIMINATOR,
    encodeOptionBool(topUp),
    encodeOptionI64(validUntil),
    encodeOptionU64(lamports)
  ]);

  return {
    sessionToken,
    instruction: new TransactionInstruction({
      programId: SESSION_KEYS_PROGRAM_ID,
      keys: [
        { pubkey: sessionToken, isSigner: false, isWritable: true },
        { pubkey: sessionSigner, isSigner: true, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: targetProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      data
    })
  };
}

async function sendWalletTransaction({
  connection,
  walletGateway,
  transaction,
  partialSigners = [],
  commitment = 'confirmed'
}) {
  const latest = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = latest.blockhash;

  if (!transaction.feePayer) {
    transaction.feePayer = requireWalletConnection(walletGateway);
  }

  for (const signer of partialSigners) {
    transaction.partialSign(signer);
  }

  const signed = await walletGateway.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: commitment,
    maxRetries: 5
  });

  const confirmation = connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    },
    commitment
  );

  return {
    signature,
    confirmation
  };
}

export function createSessionKeyRuntime({
  walletGateway,
  baseConnection,
  targetProgramId,
  validitySeconds = 30 * 60,
  topUpLamports = 2_000_000
}) {
  const targetProgram = new PublicKey(targetProgramId);
  let activeSession = null;

  function getSession() {
    return activeSession;
  }

  function clearSession() {
    activeSession = null;
  }

  function isSessionExpired(session, nowUnixSeconds = Math.floor(Date.now() / 1000)) {
    if (!session) {
      return true;
    }
    const graceWindowSeconds = 20;
    return nowUnixSeconds >= (session.validUntil - graceWindowSeconds);
  }

  async function createSession({
    validitySecondsOverride,
    lamportsOverride,
    topUp = true
  } = {}) {
    const authority = requireWalletConnection(walletGateway);
    const sessionSigner = Keypair.generate();
    const validFor = Number.isFinite(validitySecondsOverride)
      ? Math.max(60, Math.floor(validitySecondsOverride))
      : validitySeconds;
    const validUntil = Math.floor(Date.now() / 1000) + validFor;
    const topUpAmount = Number.isFinite(lamportsOverride)
      ? Math.max(0, Math.floor(lamportsOverride))
      : topUpLamports;

    const { sessionToken, instruction } = buildCreateSessionInstruction({
      authority,
      sessionSigner: sessionSigner.publicKey,
      targetProgram,
      validUntil,
      topUp,
      lamports: topUpAmount
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = authority;

    const sent = await sendWalletTransaction({
      connection: baseConnection,
      walletGateway,
      transaction,
      partialSigners: [sessionSigner]
    });
    const confirmation = await sent.confirmation;
    if (confirmation?.value?.err) {
      throw new Error(`Session key creation failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    activeSession = {
      authority,
      sessionSigner,
      sessionToken,
      validUntil,
      createdAt: Math.floor(Date.now() / 1000),
      createSignature: sent.signature
    };

    return activeSession;
  }

  async function ensureSession(options = {}) {
    if (!options.forceRefresh && activeSession && !isSessionExpired(activeSession)) {
      return activeSession;
    }
    try {
      return await createSession(options);
    } catch (error) {
      throw new Error(`Failed to create mining session key: ${toErrorText(error)}`);
    }
  }

  return {
    getSession,
    clearSession,
    isSessionExpired,
    createSession,
    ensureSession,
    requireWalletConnection: () => requireWalletConnection(walletGateway)
  };
}
