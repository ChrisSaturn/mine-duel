import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_SLOT_HASHES_PUBKEY,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { createSessionKeyRuntime } from './sessionKeyRuntime.js';

const TEXT_ENCODER = new TextEncoder();

const ROOM_SEED = TEXT_ENCODER.encode('room');
const VAULT_SEED = TEXT_ENCODER.encode('vault');
const WINNER_SEED = TEXT_ENCODER.encode('winner');
const REVEAL_SEED = TEXT_ENCODER.encode('reveal');
const BUFFER_SEED = TEXT_ENCODER.encode('buffer');
const DELEGATION_SEED = TEXT_ENCODER.encode('delegation');
const DELEGATION_METADATA_SEED = TEXT_ENCODER.encode('delegation-metadata');
const IDENTITY_SEED = TEXT_ENCODER.encode('identity');

const ROOM_STATUS_BY_INDEX = Object.freeze([
  'WaitingForOpponent',
  'WaitingForVrf',
  'Active',
  'Won',
  'Finalized',
  'Cancelled'
]);

const DISCRIMINATORS = Object.freeze({
  account: Object.freeze({
    PlayerReveal: Uint8Array.from([83, 49, 173, 3, 143, 29, 53, 150]),
    RoomShared: Uint8Array.from([25, 83, 102, 255, 68, 110, 74, 164]),
    WinnerState: Uint8Array.from([61, 174, 53, 217, 202, 173, 149, 22])
  }),
  instruction: Object.freeze({
    cancel_room_prejoin: Uint8Array.from([163, 206, 182, 64, 224, 70, 208, 5]),
    consume_winner_vrf: Uint8Array.from([224, 34, 36, 247, 88, 23, 87, 21]),
    create_room: Uint8Array.from([130, 166, 32, 2, 247, 120, 178, 53]),
    delegate_private_state: Uint8Array.from([144, 146, 123, 179, 191, 79, 155, 26]),
    finalize_win: Uint8Array.from([176, 153, 87, 154, 19, 37, 63, 167]),
    join_room: Uint8Array.from([95, 232, 188, 81, 124, 130, 78, 139]),
    mine: Uint8Array.from([59, 22, 178, 213, 139, 197, 160, 196]),
    process_undelegation: Uint8Array.from([196, 28, 41, 206, 48, 37, 51, 167]),
    request_winner_vrf: Uint8Array.from([164, 208, 87, 113, 208, 100, 189, 228]),
    settle_win_payout: Uint8Array.from([102, 188, 18, 66, 35, 67, 245, 203])
  })
});

const ADDRESSES = Object.freeze({
  delegationProgram: new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'),
  magicProgram: new PublicKey('Magic11111111111111111111111111111111111111'),
  magicContext: new PublicKey('MagicContext1111111111111111111111111111111'),
  vrfProgram: new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'),
  vrfOracleQueue: new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'),
  vrfCallbackSigner: new PublicKey('9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw')
});

function toErrorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeU64LE(value) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setBigUint64(0, BigInt(Math.max(0, Math.trunc(Number(value)))), true);
  return out;
}

function encodeU32LE(value) {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(0, Math.max(0, Math.trunc(Number(value))), true);
  return out;
}

function encodeVecBytes(seedParts) {
  const normalized = Array.isArray(seedParts) ? seedParts : [];
  const chunks = [encodeU32LE(normalized.length)];
  for (const part of normalized) {
    const bytes = part instanceof Uint8Array ? part : new Uint8Array(part || []);
    chunks.push(encodeU32LE(bytes.length), bytes);
  }
  return concatBytes(chunks);
}

function hasDiscriminator(bytes, discriminator) {
  if (!bytes || bytes.length < discriminator.length) {
    return false;
  }
  for (let i = 0; i < discriminator.length; i += 1) {
    if (bytes[i] !== discriminator[i]) {
      return false;
    }
  }
  return true;
}

function readPubkey(bytes, offset) {
  return new PublicKey(bytes.subarray(offset, offset + 32));
}

function readU64(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function readBool(bytes, offset) {
  return bytes[offset] !== 0;
}

function bigIntToString(value) {
  return typeof value === 'bigint' ? value.toString() : String(value);
}

function decodeRoomShared(bytes) {
  if (!hasDiscriminator(bytes, DISCRIMINATORS.account.RoomShared)) {
    return null;
  }
  let offset = DISCRIMINATORS.account.RoomShared.length;
  const creator = readPubkey(bytes, offset);
  offset += 32;
  const playerOne = readPubkey(bytes, offset);
  offset += 32;
  const playerTwo = readPubkey(bytes, offset);
  offset += 32;
  const winner = readPubkey(bytes, offset);
  offset += 32;
  const stakeLamports = readU64(bytes, offset);
  offset += 8;
  const totalEscrowLamports = readU64(bytes, offset);
  offset += 8;
  const mineActions = readU64(bytes, offset);
  offset += 8;
  const checkpointSeq = readU64(bytes, offset);
  offset += 8;
  const checkpointHash = Uint8Array.from(bytes.subarray(offset, offset + 32));
  offset += 32;
  const lastActionSlot = readU64(bytes, offset);
  offset += 8;
  const statusIndex = bytes[offset];
  offset += 1;
  const bump = bytes[offset];

  return {
    creator,
    creatorBase58: creator.toBase58(),
    playerOne,
    playerOneBase58: playerOne.toBase58(),
    playerTwo,
    playerTwoBase58: playerTwo.toBase58(),
    winner,
    winnerBase58: winner.toBase58(),
    stakeLamports,
    stakeLamportsText: bigIntToString(stakeLamports),
    totalEscrowLamports,
    totalEscrowLamportsText: bigIntToString(totalEscrowLamports),
    mineActions,
    mineActionsText: bigIntToString(mineActions),
    checkpointSeq,
    checkpointSeqText: bigIntToString(checkpointSeq),
    checkpointHash,
    lastActionSlot,
    lastActionSlotText: bigIntToString(lastActionSlot),
    statusIndex,
    status: ROOM_STATUS_BY_INDEX[statusIndex] || 'Unknown',
    bump
  };
}

function decodeWinnerState(bytes) {
  if (!hasDiscriminator(bytes, DISCRIMINATORS.account.WinnerState)) {
    return null;
  }
  let offset = DISCRIMINATORS.account.WinnerState.length;
  const room = readPubkey(bytes, offset);
  offset += 32;
  const vrfRequested = readBool(bytes, offset);
  offset += 1;
  const vrfFulfilled = readBool(bytes, offset);
  offset += 1;
  const winnerCell = [
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2]
  ];
  offset += 3;
  const randomness = Uint8Array.from(bytes.subarray(offset, offset + 32));
  offset += 32;
  const minedMask = Uint8Array.from(bytes.subarray(offset, offset + 256));
  offset += 256;
  const bump = bytes[offset];

  return {
    room,
    roomBase58: room.toBase58(),
    vrfRequested,
    vrfFulfilled,
    winnerCell,
    randomness,
    minedMask,
    bump
  };
}

function decodePlayerReveal(bytes) {
  if (!hasDiscriminator(bytes, DISCRIMINATORS.account.PlayerReveal)) {
    return null;
  }
  let offset = DISCRIMINATORS.account.PlayerReveal.length;
  const room = readPubkey(bytes, offset);
  offset += 32;
  const owner = readPubkey(bytes, offset);
  offset += 32;
  const revealedMask = Uint8Array.from(bytes.subarray(offset, offset + 256));
  offset += 256;
  const bump = bytes[offset];

  return {
    room,
    roomBase58: room.toBase58(),
    owner,
    ownerBase58: owner.toBase58(),
    revealedMask,
    bump
  };
}

function parseRoomCode(roomCode) {
  const text = typeof roomCode === 'string' ? roomCode.trim() : '';
  if (!text) {
    throw new Error('Room code is required.');
  }
  try {
    return new PublicKey(text);
  } catch (error) {
    throw new Error(`Invalid room code: ${toErrorText(error)}`);
  }
}

function ensureWalletPublicKey(walletGateway) {
  const state = walletGateway?.getState?.();
  if (!state?.connected || !state.publicKey) {
    throw new Error('Connect wallet before sending gameplay instructions.');
  }
  return new PublicKey(state.publicKey);
}

function deriveRoomPdas({ creator, programId, playerOne, playerTwo }) {
  const room = PublicKey.findProgramAddressSync([ROOM_SEED, creator.toBuffer()], programId)[0];
  const vault = PublicKey.findProgramAddressSync([VAULT_SEED, room.toBuffer()], programId)[0];
  const winnerState = PublicKey.findProgramAddressSync([WINNER_SEED, room.toBuffer()], programId)[0];
  const playerOneReveal = playerOne
    ? PublicKey.findProgramAddressSync([REVEAL_SEED, room.toBuffer(), playerOne.toBuffer()], programId)[0]
    : null;
  const playerTwoReveal = playerTwo
    ? PublicKey.findProgramAddressSync([REVEAL_SEED, room.toBuffer(), playerTwo.toBuffer()], programId)[0]
    : null;

  return {
    room,
    vault,
    winnerState,
    playerOneReveal,
    playerTwoReveal
  };
}

function deriveDelegationSupportPdas(target, ownerProgramId) {
  const buffer = PublicKey.findProgramAddressSync([BUFFER_SEED, target.toBuffer()], ownerProgramId)[0];
  const delegationRecord = PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, target.toBuffer()],
    ADDRESSES.delegationProgram
  )[0];
  const delegationMetadata = PublicKey.findProgramAddressSync(
    [DELEGATION_METADATA_SEED, target.toBuffer()],
    ADDRESSES.delegationProgram
  )[0];
  return { buffer, delegationRecord, delegationMetadata };
}

function roomStatusToLifecycleState(roomShared) {
  if (!roomShared) {
    return 'Lobby';
  }
  switch (roomShared.status) {
    case 'WaitingForOpponent':
      return 'WaitingForOpponent';
    case 'WaitingForVrf':
      return 'WaitingForVrf';
    case 'Active':
      return 'Active';
    case 'Won':
      return 'Won';
    case 'Finalized':
      return roomShared.totalEscrowLamports === 0n ? 'PayoutSettled' : 'Finalized';
    default:
      return roomShared.status || 'Lobby';
  }
}

function isDelegationOwner(owner) {
  return owner instanceof PublicKey
    && owner.equals(ADDRESSES.delegationProgram);
}

function pickPreferredAccountSnapshot({ erSnapshot = null, baseSnapshot = null } = {}) {
  if (isDelegationOwner(baseSnapshot?.owner)) {
    return erSnapshot || baseSnapshot || null;
  }
  if (baseSnapshot) {
    return baseSnapshot;
  }
  return erSnapshot || null;
}

function getCellIndex(cell, dims) {
  if (!cell || !Array.isArray(dims) || dims.length < 3) {
    return -1;
  }
  const width = dims[0];
  const height = dims[1];
  const depth = dims[2];
  const x = Number(cell[0]);
  const y = Number(cell[1]);
  const z = Number(cell[2]);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return -1;
  }
  if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) {
    return -1;
  }
  return (y * depth + z) * width + x;
}

function maskBitSet(mask, idx) {
  if (!(mask instanceof Uint8Array) || idx < 0) {
    return false;
  }
  const byte = Math.floor(idx / 8);
  const shift = idx % 8;
  if (byte < 0 || byte >= mask.length) {
    return false;
  }
  return (mask[byte] & (1 << shift)) !== 0;
}

async function sendWalletSignedTransaction({
  connection,
  walletGateway,
  transaction,
  feePayer,
  partialSigners = [],
  commitment = 'confirmed'
}) {
  const latest = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = feePayer || ensureWalletPublicKey(walletGateway);

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
  return { signature, confirmation };
}

async function sendSignerTransaction({
  connection,
  transaction,
  signers,
  feePayer,
  commitment = 'confirmed'
}) {
  const latest = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = latest.blockhash;
  transaction.feePayer = feePayer;
  transaction.sign(...signers);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
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
  return { signature, confirmation };
}

async function requireConfirmed(resultPromise, errorPrefix) {
  const result = await resultPromise;
  if (result?.value?.err) {
    throw new Error(`${errorPrefix}: ${JSON.stringify(result.value.err)}`);
  }
  return result;
}

function instructionData(name, argsBytes = null) {
  const discriminator = DISCRIMINATORS.instruction[name];
  if (!discriminator) {
    throw new Error(`Unsupported instruction: ${name}`);
  }
  if (!argsBytes || argsBytes.length === 0) {
    return discriminator;
  }
  return concatBytes([discriminator, argsBytes]);
}

function isInvalidSessionTokenError(error) {
  const text = toErrorText(error).toLowerCase();
  return text.includes('invalidsessiontoken')
    || text.includes('invalid session token')
    || text.includes('custom program error: 0x177a');
}

export function createRoomRuntime({
  walletGateway,
  programId,
  baseRpcUrl,
  erRpcUrl,
  erWsUrl,
  commitment = 'confirmed'
}) {
  const resolvedProgramId = new PublicKey(programId);
  const baseConnection = walletGateway?.connection
    || new Connection(baseRpcUrl, { commitment });
  const resolvedErRpcUrl = String(erRpcUrl || import.meta.env.VITE_ER_RPC_URL || 'https://devnet.magicblock.app/').trim();
  const resolvedErWsUrl = String(erWsUrl || import.meta.env.VITE_ER_WS_URL || '').trim();
  const erConnection = new Connection(resolvedErRpcUrl, {
    commitment,
    wsEndpoint: resolvedErWsUrl || undefined
  });
  const validatorAddressRaw = String(import.meta.env.VITE_DELEGATION_VALIDATOR || '').trim();
  const delegationValidator = validatorAddressRaw ? new PublicKey(validatorAddressRaw) : null;

  const sessionRuntime = createSessionKeyRuntime({
    walletGateway,
    baseConnection,
    targetProgramId: resolvedProgramId
  });

  function buildContextFromCreator(creator, playerOne = creator, playerTwo = null) {
    const pdas = deriveRoomPdas({
      creator,
      playerOne,
      playerTwo,
      programId: resolvedProgramId
    });
    return {
      creator,
      creatorBase58: creator.toBase58(),
      playerOne,
      playerOneBase58: playerOne?.toBase58() || '',
      playerTwo,
      playerTwoBase58: playerTwo?.toBase58() || '',
      ...pdas
    };
  }

  function decodeAccountSnapshot(accountInfo, decoder, source) {
    if (!accountInfo?.data) {
      return null;
    }
    const decoded = decoder(accountInfo.data);
    if (!decoded) {
      return null;
    }
    return {
      decoded,
      source,
      owner: accountInfo.owner,
      lamports: accountInfo.lamports
    };
  }

  async function fetchAccountSnapshots(pubkey, decoder) {
    const [erInfo, baseInfo] = await Promise.all([
      erConnection.getAccountInfo(pubkey, commitment),
      baseConnection.getAccountInfo(pubkey, commitment)
    ]);
    const erSnapshot = decodeAccountSnapshot(erInfo, decoder, 'er');
    const baseSnapshot = decodeAccountSnapshot(baseInfo, decoder, 'base');
    return {
      erSnapshot,
      baseSnapshot,
      preferredSnapshot: pickPreferredAccountSnapshot({ erSnapshot, baseSnapshot })
    };
  }

  async function fetchRoomState(creatorPubkey, localPlayerPubkey = null) {
    const creator = creatorPubkey instanceof PublicKey ? creatorPubkey : parseRoomCode(creatorPubkey);
    const localPlayer = localPlayerPubkey instanceof PublicKey
      ? localPlayerPubkey
      : (localPlayerPubkey ? new PublicKey(localPlayerPubkey) : null);
    const context = buildContextFromCreator(creator, creator, localPlayer || null);
    const roomSnapshots = await fetchAccountSnapshots(context.room, decodeRoomShared);
    if (!roomSnapshots.preferredSnapshot) {
      return {
        context,
        roomShared: null,
        winnerState: null,
        playerReveal: null,
        lifecycleState: 'Lobby'
      };
    }

    const roomShared = roomSnapshots.preferredSnapshot.decoded;
    const fullContext = buildContextFromCreator(
      creator,
      roomShared.playerOne,
      roomShared.playerTwo
    );
    const winnerSnapshots = await fetchAccountSnapshots(fullContext.winnerState, decodeWinnerState);

    let playerReveal = null;
    if (localPlayer) {
      const localRevealPda = PublicKey.findProgramAddressSync(
        [REVEAL_SEED, fullContext.room.toBuffer(), localPlayer.toBuffer()],
        resolvedProgramId
      )[0];
      const revealSnapshots = await fetchAccountSnapshots(localRevealPda, decodePlayerReveal);
      playerReveal = revealSnapshots.preferredSnapshot?.decoded || null;
      fullContext.localReveal = localRevealPda;
      fullContext.localRevealBase58 = localRevealPda.toBase58();
    }

    return {
      context: fullContext,
      roomShared,
      winnerState: winnerSnapshots.preferredSnapshot?.decoded || null,
      playerReveal,
      lifecycleState: roomStatusToLifecycleState(roomShared)
    };
  }

  function createInstruction(name, keys, argsBytes = null) {
    return new TransactionInstruction({
      programId: resolvedProgramId,
      keys,
      data: instructionData(name, argsBytes)
    });
  }

  async function createRoom(stakeLamports) {
    const creator = ensureWalletPublicKey(walletGateway);
    const context = buildContextFromCreator(creator, creator, null);
    const keys = [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: context.room, isSigner: false, isWritable: true },
      { pubkey: context.vault, isSigner: false, isWritable: true },
      { pubkey: context.winnerState, isSigner: false, isWritable: true },
      { pubkey: context.playerOneReveal, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ];
    const tx = new Transaction().add(
      createInstruction('create_room', keys, encodeU64LE(stakeLamports))
    );
    const sent = await sendWalletSignedTransaction({
      connection: baseConnection,
      walletGateway,
      transaction: tx,
      feePayer: creator,
      commitment
    });
    await requireConfirmed(sent.confirmation, 'create_room failed');
    return {
      signature: sent.signature,
      roomCode: creator.toBase58(),
      context
    };
  }

  async function joinRoom(roomCode) {
    const player = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    const context = buildContextFromCreator(creator, creator, player);
    const keys = [
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: context.room, isSigner: false, isWritable: true },
      { pubkey: context.vault, isSigner: false, isWritable: true },
      { pubkey: context.winnerState, isSigner: false, isWritable: true },
      { pubkey: context.playerTwoReveal, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ];
    const tx = new Transaction().add(createInstruction('join_room', keys));
    const sent = await sendWalletSignedTransaction({
      connection: baseConnection,
      walletGateway,
      transaction: tx,
      feePayer: player,
      commitment
    });
    await requireConfirmed(sent.confirmation, 'join_room failed');
    return {
      signature: sent.signature,
      context
    };
  }

  async function cancelRoomPrejoin(roomCode) {
    const creatorWallet = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    if (!creator.equals(creatorWallet)) {
      throw new Error('Only the creator wallet can cancel this room.');
    }
    const context = buildContextFromCreator(creator, creator, null);
    const keys = [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: context.room, isSigner: false, isWritable: true },
      { pubkey: context.vault, isSigner: false, isWritable: true },
      { pubkey: context.winnerState, isSigner: false, isWritable: true },
      { pubkey: context.playerOneReveal, isSigner: false, isWritable: true }
    ];
    const tx = new Transaction().add(createInstruction('cancel_room_prejoin', keys));
    const sent = await sendWalletSignedTransaction({
      connection: baseConnection,
      walletGateway,
      transaction: tx,
      feePayer: creator,
      commitment
    });
    await requireConfirmed(sent.confirmation, 'cancel_room_prejoin failed');
    return { signature: sent.signature, context };
  }

  async function delegatePrivateState(roomCode) {
    const payer = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    const current = await fetchRoomState(creator, payer);
    const roomShared = current.roomShared;
    if (!roomShared) {
      throw new Error('Room is missing on chain.');
    }
    if (!roomShared.playerTwo || roomShared.playerTwo.equals(SystemProgram.programId)) {
      throw new Error('Cannot delegate before player two has joined.');
    }

    const context = buildContextFromCreator(creator, roomShared.playerOne, roomShared.playerTwo);
    const supportRoom = deriveDelegationSupportPdas(context.room, resolvedProgramId);
    const supportVault = deriveDelegationSupportPdas(context.vault, resolvedProgramId);
    const supportWinner = deriveDelegationSupportPdas(context.winnerState, resolvedProgramId);
    const supportP1 = deriveDelegationSupportPdas(context.playerOneReveal, resolvedProgramId);
    const supportP2 = deriveDelegationSupportPdas(context.playerTwoReveal, resolvedProgramId);

    const validator = delegationValidator || resolvedProgramId;
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: creator, isSigner: false, isWritable: false },
      { pubkey: roomShared.playerOne, isSigner: false, isWritable: false },
      { pubkey: roomShared.playerTwo, isSigner: false, isWritable: false },
      { pubkey: validator, isSigner: false, isWritable: false },
      { pubkey: context.room, isSigner: false, isWritable: true },
      { pubkey: context.vault, isSigner: false, isWritable: true },
      { pubkey: context.winnerState, isSigner: false, isWritable: true },
      { pubkey: context.playerOneReveal, isSigner: false, isWritable: true },
      { pubkey: context.playerTwoReveal, isSigner: false, isWritable: true },
      { pubkey: resolvedProgramId, isSigner: false, isWritable: false },
      { pubkey: ADDRESSES.delegationProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: supportRoom.buffer, isSigner: false, isWritable: true },
      { pubkey: supportRoom.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: supportRoom.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: supportVault.buffer, isSigner: false, isWritable: true },
      { pubkey: supportVault.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: supportVault.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: supportWinner.buffer, isSigner: false, isWritable: true },
      { pubkey: supportWinner.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: supportWinner.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: supportP1.buffer, isSigner: false, isWritable: true },
      { pubkey: supportP1.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: supportP1.delegationMetadata, isSigner: false, isWritable: true },
      { pubkey: supportP2.buffer, isSigner: false, isWritable: true },
      { pubkey: supportP2.delegationRecord, isSigner: false, isWritable: true },
      { pubkey: supportP2.delegationMetadata, isSigner: false, isWritable: true }
    ];
    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }))
      .add(createInstruction('delegate_private_state', keys));

    const sent = await sendWalletSignedTransaction({
      connection: baseConnection,
      walletGateway,
      transaction: tx,
      feePayer: payer,
      commitment
    });
    await requireConfirmed(sent.confirmation, 'delegate_private_state failed');
    return { signature: sent.signature, context };
  }

  async function requestWinnerVrf(roomCode, clientSeed = null) {
    const authority = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    const context = buildContextFromCreator(creator, creator, null);
    const seed = Number.isFinite(clientSeed)
      ? Math.max(0, Math.min(255, Math.floor(clientSeed)))
      : Math.floor(Math.random() * 255);
    const programIdentity = PublicKey.findProgramAddressSync([IDENTITY_SEED], resolvedProgramId)[0];

    async function sendRequestWithSession(forceRefresh = false) {
      const session = await sessionRuntime.ensureSession({ forceRefresh });
      const keys = [
        { pubkey: session.sessionSigner.publicKey, isSigner: true, isWritable: true },
        { pubkey: context.room, isSigner: false, isWritable: false },
        { pubkey: ADDRESSES.vrfOracleQueue, isSigner: false, isWritable: true },
        { pubkey: programIdentity, isSigner: false, isWritable: false },
        { pubkey: ADDRESSES.vrfProgram, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: session.sessionToken, isSigner: false, isWritable: false }
      ];
      const tx = new Transaction().add(
        createInstruction('request_winner_vrf', keys, Uint8Array.of(seed))
      );
      const sent = await sendSignerTransaction({
        connection: erConnection,
        transaction: tx,
        signers: [session.sessionSigner],
        feePayer: session.sessionSigner.publicKey,
        commitment
      });
      return {
        ...sent,
        session
      };
    }

    try {
      const sent = await sendRequestWithSession(false);
      await requireConfirmed(sent.confirmation, 'request_winner_vrf failed');
      return {
        signature: sent.signature,
        clientSeed: seed,
        context,
        usedSessionToken: sent.session.sessionToken.toBase58(),
        authority: authority.toBase58()
      };
    } catch (error) {
      if (!isInvalidSessionTokenError(error)) {
        throw error;
      }
      sessionRuntime.clearSession();
      const retry = await sendRequestWithSession(true);
      await requireConfirmed(retry.confirmation, 'request_winner_vrf failed');
      return {
        signature: retry.signature,
        clientSeed: seed,
        context,
        usedSessionToken: retry.session.sessionToken.toBase58(),
        authority: authority.toBase58(),
        refreshedSession: true
      };
    }
  }

  async function consumeWinnerVrf(roomCode, randomnessBytes) {
    void roomCode;
    void randomnessBytes;
    throw new Error('consume_winner_vrf is a protocol callback path and is not callable from client runtime.');
  }

  async function mine(roomCode, cell) {
    const creator = parseRoomCode(roomCode);
    const walletPubkey = ensureWalletPublicKey(walletGateway);
    const roomState = await fetchRoomState(creator, walletPubkey);
    if (!roomState.roomShared) {
      throw new Error('Room not found on chain.');
    }
    const roomShared = roomState.roomShared;
    if (roomShared.status !== 'Active') {
      throw new Error(`Cannot mine before room is Active (current status: ${roomShared.status}).`);
    }
    if (!roomShared.playerOne.equals(walletPubkey) && !roomShared.playerTwo.equals(walletPubkey)) {
      throw new Error('Only room participants can mine.');
    }
    const context = buildContextFromCreator(creator, roomShared.playerOne, roomShared.playerTwo);

    async function sendMineWithSession(forceRefresh = false) {
      const session = await sessionRuntime.ensureSession({ forceRefresh });
      const coords = [Number(cell.x), Number(cell.y), Number(cell.z)];
      const args = Uint8Array.of(
        Math.max(0, Math.min(255, Math.floor(coords[0]))),
        Math.max(0, Math.min(255, Math.floor(coords[1]))),
        Math.max(0, Math.min(255, Math.floor(coords[2])))
      );
      const keys = [
        { pubkey: session.sessionSigner.publicKey, isSigner: true, isWritable: true },
        { pubkey: context.room, isSigner: false, isWritable: true },
        { pubkey: context.winnerState, isSigner: false, isWritable: true },
        { pubkey: context.playerOneReveal, isSigner: false, isWritable: true },
        { pubkey: context.playerTwoReveal, isSigner: false, isWritable: true },
        { pubkey: session.sessionToken, isSigner: false, isWritable: false }
      ];
      const tx = new Transaction().add(createInstruction('mine', keys, args));
      const sent = await sendSignerTransaction({
        connection: erConnection,
        transaction: tx,
        signers: [session.sessionSigner],
        feePayer: session.sessionSigner.publicKey,
        commitment
      });
      return {
        ...sent,
        session
      };
    }

    try {
      const sent = await sendMineWithSession(false);
      return {
        signature: sent.signature,
        confirmation: sent.confirmation,
        roomContext: context,
        lifecycleState: roomStatusToLifecycleState(roomShared),
        usedSessionToken: sent.session.sessionToken.toBase58(),
        bitIndex: getCellIndex([cell.x, cell.y, cell.z], [16, 8, 16])
      };
    } catch (error) {
      if (!isInvalidSessionTokenError(error)) {
        throw error;
      }
      sessionRuntime.clearSession();
      const retry = await sendMineWithSession(true);
      return {
        signature: retry.signature,
        confirmation: retry.confirmation,
        roomContext: context,
        lifecycleState: roomStatusToLifecycleState(roomShared),
        usedSessionToken: retry.session.sessionToken.toBase58(),
        bitIndex: getCellIndex([cell.x, cell.y, cell.z], [16, 8, 16]),
        refreshedSession: true
      };
    }
  }

  async function finalizeWin(roomCode) {
    const winnerWallet = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    const current = await fetchRoomState(creator, winnerWallet);
    if (!current.roomShared) {
      throw new Error('Room not found on chain.');
    }
    if (!current.roomShared.winner.equals(winnerWallet)) {
      throw new Error('Only the winning wallet can finalize this match.');
    }
    const context = buildContextFromCreator(
      creator,
      current.roomShared.playerOne,
      current.roomShared.playerTwo
    );

    async function sendFinalizeWithSession(forceRefresh = false) {
      const session = await sessionRuntime.ensureSession({ forceRefresh });
      const keys = [
        { pubkey: session.sessionSigner.publicKey, isSigner: true, isWritable: true },
        { pubkey: context.room, isSigner: false, isWritable: true },
        { pubkey: context.vault, isSigner: false, isWritable: true },
        { pubkey: context.winnerState, isSigner: false, isWritable: true },
        { pubkey: context.playerOneReveal, isSigner: false, isWritable: true },
        { pubkey: context.playerTwoReveal, isSigner: false, isWritable: true },
        { pubkey: session.sessionToken, isSigner: false, isWritable: false },
        { pubkey: ADDRESSES.magicProgram, isSigner: false, isWritable: false },
        { pubkey: ADDRESSES.magicContext, isSigner: false, isWritable: true }
      ];
      const tx = new Transaction().add(createInstruction('finalize_win', keys));
      const sent = await sendSignerTransaction({
        connection: erConnection,
        transaction: tx,
        signers: [session.sessionSigner],
        feePayer: session.sessionSigner.publicKey,
        commitment
      });
      return {
        ...sent,
        session
      };
    }

    try {
      const sent = await sendFinalizeWithSession(false);
      await requireConfirmed(sent.confirmation, 'finalize_win failed');
      return {
        signature: sent.signature,
        context,
        usedSessionToken: sent.session.sessionToken.toBase58()
      };
    } catch (error) {
      if (!isInvalidSessionTokenError(error)) {
        throw error;
      }
      sessionRuntime.clearSession();
      const retry = await sendFinalizeWithSession(true);
      await requireConfirmed(retry.confirmation, 'finalize_win failed');
      return {
        signature: retry.signature,
        context,
        usedSessionToken: retry.session.sessionToken.toBase58(),
        refreshedSession: true
      };
    }
  }

  async function processUndelegation(roomCode) {
    const payer = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    const current = await fetchRoomState(creator, payer);
    if (!current.roomShared) {
      throw new Error('Room not found on chain.');
    }
    const context = buildContextFromCreator(
      creator,
      current.roomShared.playerOne,
      current.roomShared.playerTwo
    );
    const accountTargets = [
      {
        name: 'room',
        pubkey: context.room,
        seeds: [ROOM_SEED, creator.toBuffer()]
      },
      {
        name: 'vault',
        pubkey: context.vault,
        seeds: [VAULT_SEED, context.room.toBuffer()]
      },
      {
        name: 'winnerState',
        pubkey: context.winnerState,
        seeds: [WINNER_SEED, context.room.toBuffer()]
      },
      {
        name: 'playerOneReveal',
        pubkey: context.playerOneReveal,
        seeds: [REVEAL_SEED, context.room.toBuffer(), current.roomShared.playerOne.toBuffer()]
      },
      {
        name: 'playerTwoReveal',
        pubkey: context.playerTwoReveal,
        seeds: [REVEAL_SEED, context.room.toBuffer(), current.roomShared.playerTwo.toBuffer()]
      }
    ];

    const signatures = [];
    for (const target of accountTargets) {
      if (!target.pubkey) {
        continue;
      }
      const accountInfo = await baseConnection.getAccountInfo(target.pubkey, commitment);
      if (!accountInfo || !accountInfo.owner.equals(ADDRESSES.delegationProgram)) {
        continue;
      }
      const support = deriveDelegationSupportPdas(target.pubkey, resolvedProgramId);
      const keys = [
        { pubkey: target.pubkey, isSigner: false, isWritable: true },
        { pubkey: support.buffer, isSigner: false, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];
      const data = concatBytes([
        DISCRIMINATORS.instruction.process_undelegation,
        encodeVecBytes(target.seeds)
      ]);
      const tx = new Transaction().add(new TransactionInstruction({
        programId: resolvedProgramId,
        keys,
        data
      }));
      const sent = await sendWalletSignedTransaction({
        connection: baseConnection,
        walletGateway,
        transaction: tx,
        feePayer: payer,
        commitment
      });
      await requireConfirmed(sent.confirmation, `process_undelegation failed for ${target.name}`);
      signatures.push(sent.signature);
    }

    return {
      signatures,
      processedCount: signatures.length,
      context
    };
  }

  async function settleWinPayout(roomCode) {
    const winner = ensureWalletPublicKey(walletGateway);
    const creator = parseRoomCode(roomCode);
    const context = buildContextFromCreator(creator, creator, winner);
    const keys = [
      { pubkey: winner, isSigner: true, isWritable: true },
      { pubkey: context.room, isSigner: false, isWritable: true },
      { pubkey: context.vault, isSigner: false, isWritable: true }
    ];
    const tx = new Transaction().add(createInstruction('settle_win_payout', keys));
    const sent = await sendWalletSignedTransaction({
      connection: baseConnection,
      walletGateway,
      transaction: tx,
      feePayer: winner,
      commitment
    });
    await requireConfirmed(sent.confirmation, 'settle_win_payout failed');
    return { signature: sent.signature, context };
  }

  function subscribeRoom({
    roomCode,
    localPlayer,
    onState
  }) {
    const creator = parseRoomCode(roomCode);
    const local = localPlayer instanceof PublicKey ? localPlayer : new PublicKey(localPlayer);
    const context = buildContextFromCreator(creator, creator, local);

    const roomPda = context.room;
    const winnerPda = context.winnerState;
    const localRevealPda = PublicKey.findProgramAddressSync(
      [REVEAL_SEED, roomPda.toBuffer(), local.toBuffer()],
      resolvedProgramId
    )[0];

    const latestSlots = new Map();
    const latestBySource = {
      room: { er: null, base: null },
      winner: { er: null, base: null },
      reveal: { er: null, base: null }
    };
    let current = {
      roomShared: null,
      winnerState: null,
      playerReveal: null,
      lifecycleState: 'Lobby'
    };

    function emit() {
      if (typeof onState === 'function') {
        onState({
          ...current,
          context: {
            ...context,
            localReveal: localRevealPda,
            localRevealBase58: localRevealPda.toBase58()
          },
          lifecycleState: roomStatusToLifecycleState(current.roomShared)
        });
      }
    }

    function applyPreferredSnapshot(tag) {
      const snapshots = latestBySource[tag] || {};
      const preferredSnapshot = pickPreferredAccountSnapshot({
        erSnapshot: snapshots.er,
        baseSnapshot: snapshots.base
      });
      const decoded = preferredSnapshot?.decoded || null;
      if (tag === 'room') {
        current = { ...current, roomShared: decoded };
      } else if (tag === 'winner') {
        current = { ...current, winnerState: decoded };
      } else if (tag === 'reveal') {
        current = { ...current, playerReveal: decoded };
      }
    }

    function applyUpdate(tag, source, slot, accountInfo, decoded) {
      const key = `${tag}:${source}`;
      const prevSlot = latestSlots.get(key) || 0;
      if (slot < prevSlot) {
        return;
      }
      latestSlots.set(key, slot);
      latestBySource[tag][source] = {
        decoded,
        source,
        owner: accountInfo.owner,
        lamports: accountInfo.lamports
      };
      applyPreferredSnapshot(tag);
      emit();
    }

    const subscriptions = [];
    const targets = [
      { tag: 'room', pubkey: roomPda, decoder: decodeRoomShared },
      { tag: 'winner', pubkey: winnerPda, decoder: decodeWinnerState },
      { tag: 'reveal', pubkey: localRevealPda, decoder: decodePlayerReveal }
    ];

    for (const target of targets) {
      for (const source of ['er', 'base']) {
        const connection = source === 'er' ? erConnection : baseConnection;
        const id = connection.onAccountChange(
          target.pubkey,
          (accountInfo, ctx) => {
            const decoded = target.decoder(accountInfo.data);
            if (!decoded) {
              return;
            }
            applyUpdate(target.tag, source, Number(ctx?.slot) || 0, accountInfo, decoded);
          },
          commitment
        );
        subscriptions.push({ connection, id });
      }
    }

    Promise.all([
      fetchAccountSnapshots(roomPda, decodeRoomShared),
      fetchAccountSnapshots(winnerPda, decodeWinnerState),
      fetchAccountSnapshots(localRevealPda, decodePlayerReveal)
    ])
      .then(([roomSnapshots, winnerSnapshots, revealSnapshots]) => {
        latestBySource.room.er = roomSnapshots.erSnapshot;
        latestBySource.room.base = roomSnapshots.baseSnapshot;
        latestBySource.winner.er = winnerSnapshots.erSnapshot;
        latestBySource.winner.base = winnerSnapshots.baseSnapshot;
        latestBySource.reveal.er = revealSnapshots.erSnapshot;
        latestBySource.reveal.base = revealSnapshots.baseSnapshot;
        applyPreferredSnapshot('room');
        applyPreferredSnapshot('winner');
        applyPreferredSnapshot('reveal');
        emit();
      })
      .catch((error) => {
        if (typeof onState === 'function') {
          onState({
            ...current,
            context,
            lifecycleState: current.lifecycleState,
            error: toErrorText(error)
          });
        }
      });

    return () => {
      for (const sub of subscriptions) {
        sub.connection.removeAccountChangeListener(sub.id).catch(() => {});
      }
    };
  }

  function clearSession() {
    sessionRuntime.clearSession();
  }

  async function ensureMiningSession() {
    return sessionRuntime.ensureSession();
  }

  function hasActiveSession() {
    const session = sessionRuntime.getSession();
    return Boolean(session && !sessionRuntime.isSessionExpired(session));
  }

  return {
    baseConnection,
    erConnection,
    programId: resolvedProgramId,
    parseRoomCode,
    deriveRoomPdas: (roomCode) => {
      const creator = parseRoomCode(roomCode);
      return buildContextFromCreator(creator, creator, null);
    },
    fetchRoomState,
    subscribeRoom,
    createRoom,
    joinRoom,
    cancelRoomPrejoin,
    delegatePrivateState,
    requestWinnerVrf,
    consumeWinnerVrf,
    mine,
    finalizeWin,
    processUndelegation,
    settleWinPayout,
    ensureMiningSession,
    hasActiveSession,
    clearSession,
    roomStatusToLifecycleState,
    maskBitSet,
    getCellIndex
  };
}
