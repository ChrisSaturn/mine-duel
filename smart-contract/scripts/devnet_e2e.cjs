const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const anchor = require('@coral-xyz/anchor');
const {
  ConnectionMagicRouter,
  verifyTeeRpcIntegrity,
} = require('@magicblock-labs/ephemeral-rollups-sdk');

const {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  ComputeBudgetProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_SLOT_HASHES_PUBKEY,
} = anchor.web3;

const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://api.devnet.solana.com';
const ER_RPC_URL = process.env.ER_RPC_URL || 'https://devnet.magicblock.app/';
const ER_WS_URL = process.env.ER_WS_URL || 'wss://devnet.magicblock.app/';
const TEE_RPC_URL = process.env.TEE_RPC_URL || 'https://tee.magicblock.app';
const COMMITMENT = 'confirmed';

const DELEGATION_PROGRAM = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const DELEGATION_VALIDATOR = process.env.DELEGATION_VALIDATOR
  ? new PublicKey(process.env.DELEGATION_VALIDATOR)
  : null;
const SESSION_KEYS_PROGRAM = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');
const MAGIC_PROGRAM = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT = new PublicKey('MagicContext1111111111111111111111111111111');

const MAP_WIDTH = 16;
const MAP_DEPTH = 16;
const MAP_HEIGHT = 8;
const EXPOSED_LAYER_Y = 1;

const STAKE_LAMPORTS = Number(process.env.STAKE_LAMPORTS || 50_000_000);
const FUNDING_LAMPORTS = Number(process.env.FUNDING_LAMPORTS || 400_000_000);
const SESSION_TOPUP_LAMPORTS = Number(process.env.SESSION_TOPUP_LAMPORTS || 2_000_000);
const SESSION_VALIDITY_SECONDS = Number(process.env.SESSION_VALIDITY_SECONDS || 1800);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 180_000);

function readKeypair(relPath) {
  const keypairPath = path.resolve(__dirname, '..', relPath);
  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function delegationBufferPda(target, ownerProgramId) {
  return pda([Buffer.from('buffer'), target.toBuffer()], ownerProgramId);
}

function delegationRecordPda(target) {
  return pda([Buffer.from('delegation'), target.toBuffer()], DELEGATION_PROGRAM);
}

function delegationMetadataPda(target) {
  return pda([Buffer.from('delegation-metadata'), target.toBuffer()], DELEGATION_PROGRAM);
}

function enumKey(value) {
  if (value == null) return 'unknown';
  if (typeof value === 'string') return value;
  const keys = Object.keys(value);
  return keys.length > 0 ? keys[0] : 'unknown';
}

function accountSeedBytes(parts) {
  return parts.map((part) => Buffer.from(part));
}

function assertOrThrow(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error) {
  const message =
    error?.error?.errorMessage ||
    error?.message ||
    error?.toString?.() ||
    String(error);
  const signature = error?.signature || error?.txSignature || null;
  const logs =
    error?.logs || error?.errorLogs || error?.transactionLogs || error?.error?.logs || [];
  return { message, signature, logs };
}

function cellIndex(x, y, z) {
  if (
    x < 0 ||
    y < 0 ||
    z < 0 ||
    x >= MAP_WIDTH ||
    y >= MAP_HEIGHT ||
    z >= MAP_DEPTH
  ) {
    throw new Error(`Invalid coordinate (${x},${y},${z})`);
  }
  return (y * MAP_DEPTH + z) * MAP_WIDTH + x;
}

function bitIsSet(mask, idx) {
  const byte = Math.floor(idx / 8);
  const shift = idx % 8;
  return (mask[byte] & (1 << shift)) !== 0;
}

function bitDiffCount(beforeMask, afterMask) {
  let count = 0;
  for (let i = 0; i < beforeMask.length; i += 1) {
    let v = beforeMask[i] ^ afterMask[i];
    while (v) {
      v &= v - 1;
      count += 1;
    }
  }
  return count;
}

function getInstructionAddress(idl, instructionName, accountName) {
  const instruction = idl.instructions.find((ix) => ix.name === instructionName);
  if (!instruction) {
    throw new Error(`Instruction not found in IDL: ${instructionName}`);
  }
  const account = instruction.accounts.find((acc) => acc.name === accountName);
  if (!account?.address) {
    throw new Error(`Instruction account address missing for ${instructionName}.${accountName}`);
  }
  return new PublicKey(account.address);
}

function anchorDiscriminator(name) {
  return crypto
    .createHash('sha256')
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function encodeOptionBool(value) {
  if (value == null) {
    return Buffer.from([0]);
  }
  return Buffer.from([1, value ? 1 : 0]);
}

function encodeOptionI64(value) {
  if (value == null) {
    return Buffer.from([0]);
  }
  const buf = Buffer.alloc(9);
  buf[0] = 1;
  buf.writeBigInt64LE(BigInt(value), 1);
  return buf;
}

function encodeOptionU64(value) {
  if (value == null) {
    return Buffer.from([0]);
  }
  const buf = Buffer.alloc(9);
  buf[0] = 1;
  buf.writeBigUInt64LE(BigInt(value), 1);
  return buf;
}

function buildCreateSessionIx({
  authority,
  sessionSigner,
  targetProgram,
  validUntil,
  topUp,
  lamports,
}) {
  const sessionToken = pda(
    [
      Buffer.from('session_token'),
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_KEYS_PROGRAM
  );

  const data = Buffer.concat([
    anchorDiscriminator('create_session'),
    encodeOptionBool(topUp),
    encodeOptionI64(validUntil),
    encodeOptionU64(lamports),
  ]);

  const instruction = new TransactionInstruction({
    programId: SESSION_KEYS_PROGRAM,
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: sessionSigner, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: targetProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { sessionToken, instruction };
}

async function fetchAndDecode(program, connection, accountName, pubkey, attempts = 20) {
  let accountInfo = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    accountInfo = await connection.getAccountInfo(pubkey, COMMITMENT);
    if (accountInfo) {
      break;
    }
    await sleep(500);
  }
  if (!accountInfo) {
    throw new Error(`Account not found: ${accountName} ${pubkey.toBase58()}`);
  }
  let decoded = null;
  let decodeError = null;
  const decodeNames = [accountName, `${accountName.charAt(0).toLowerCase()}${accountName.slice(1)}`];
  for (const decodeName of decodeNames) {
    try {
      decoded = program.coder.accounts.decode(decodeName, accountInfo.data);
      break;
    } catch (error) {
      decodeError = error;
    }
  }
  if (!decoded) {
    throw decodeError || new Error(`Unable to decode account ${accountName}`);
  }
  return {
    decoded,
    owner: accountInfo.owner,
    lamports: accountInfo.lamports,
  };
}

async function fetchAndDecodeAny(program, connections, accountName, pubkey) {
  let lastError = null;
  for (const connection of connections) {
    try {
      const result = await fetchAndDecode(program, connection, accountName, pubkey);
      return {
        ...result,
        endpoint: connection.rpcEndpoint,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Unable to decode ${accountName} ${pubkey.toBase58()}`);
}

async function getOwner(connection, pubkey) {
  const accountInfo = await connection.getAccountInfo(pubkey, COMMITMENT);
  return accountInfo ? accountInfo.owner : null;
}

async function ensureBalance(connection, funder, targetPubkey, minLamports) {
  const current = await connection.getBalance(targetPubkey, COMMITMENT);
  if (current >= minLamports) {
    return null;
  }

  const amount = minLamports - current;
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: targetPubkey,
      lamports: amount,
    })
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [funder], {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  return { amount, signature };
}

async function waitForCondition(label, timeoutMs, intervalMs, fn) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const result = await fn();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for condition: ${label}`);
}

async function expectFailure(label, fn, negativeResults) {
  try {
    const maybeSignature = await fn();
    negativeResults.push({
      label,
      outcome: 'unexpected_success',
      signature: maybeSignature || null,
    });
    console.log(`[NEGATIVE][UNEXPECTED PASS] ${label}`, maybeSignature || '');
  } catch (error) {
    const parsed = formatError(error);
    negativeResults.push({
      label,
      outcome: 'expected_failure',
      signature: parsed.signature,
      message: parsed.message,
      logs: parsed.logs,
    });
    console.log(`[NEGATIVE][OK] ${label}: ${parsed.message}`);
  }
}

function toMaskBuffer(maskLike) {
  if (Buffer.isBuffer(maskLike)) {
    return maskLike;
  }
  return Buffer.from(maskLike);
}

function revealDiffSummary(beforeReveal, afterReveal) {
  const beforeMask = toMaskBuffer(beforeReveal.revealedMask);
  const afterMask = toMaskBuffer(afterReveal.revealedMask);
  return {
    changedBits: bitDiffCount(beforeMask, afterMask),
  };
}

function ensureExposedLayer(reveal, label) {
  const mask = toMaskBuffer(reveal.revealedMask);
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    for (let z = 0; z < MAP_DEPTH; z += 1) {
      const idx = cellIndex(x, EXPOSED_LAYER_Y, z);
      assertOrThrow(bitIsSet(mask, idx), `${label} missing exposed Y=1 cell at (${x},1,${z})`);
    }
  }
}

function pickMineCoord(exclusions, winnerCell, startX) {
  const excluded = new Set(exclusions.map((item) => item.join(',')));
  for (let y = 2; y < MAP_HEIGHT; y += 1) {
    for (let z = 0; z < MAP_DEPTH; z += 1) {
      for (let xOffset = 0; xOffset < MAP_WIDTH; xOffset += 1) {
        const x = (startX + xOffset) % MAP_WIDTH;
        const candidate = [x, y, z];
        const key = candidate.join(',');
        if (candidate.join(',') === winnerCell.join(',')) {
          continue;
        }
        if (!excluded.has(key)) {
          return candidate;
        }
      }
    }
  }
  throw new Error('Unable to find non-winning coordinate to mine');
}

async function maybeFetchTx(connection, signature) {
  try {
    return await connection.getTransaction(signature, {
      commitment: COMMITMENT,
      maxSupportedTransactionVersion: 0,
    });
  } catch (_error) {
    return null;
  }
}

async function sendErTransaction(erConnection, transaction, signers) {
  if (!transaction.feePayer) {
    transaction.feePayer = signers[0].publicKey;
  }
  let latestBlockhashResponse;
  if (typeof erConnection.getLatestBlockhashForTransaction === 'function') {
    latestBlockhashResponse = await erConnection.getLatestBlockhashForTransaction(transaction, {
      commitment: COMMITMENT,
    });
  } else {
    latestBlockhashResponse = await erConnection.getLatestBlockhash(COMMITMENT);
  }
  const latestBlockhash = latestBlockhashResponse?.value || latestBlockhashResponse;
  if (!latestBlockhash?.blockhash || !latestBlockhash?.lastValidBlockHeight) {
    throw new Error(`Invalid ER blockhash response: ${JSON.stringify(latestBlockhashResponse)}`);
  }
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
  transaction.sign(...signers);

  const signature = await erConnection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
  });
  const confirmation = await erConnection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    COMMITMENT
  );
  if (confirmation.value.err) {
    const failedTx = await maybeFetchTx(erConnection, signature);
    const logs = failedTx?.meta?.logMessages || null;
    throw new Error(
      `ER transaction failed: ${JSON.stringify(confirmation.value.err)}; signature=${signature}; logs=${JSON.stringify(logs)}`
    );
  }
  return signature;
}

async function main() {
  const idlPath = path.resolve(__dirname, '..', 'target/idl/mine_duel.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const programId = new PublicKey(idl.address);

  const funderPath = process.env.FUNDER_KEY || 'wallets/deployer.json';
  const creatorPath = process.env.CREATOR_KEY || null;
  const player2Path = process.env.PLAYER2_KEY || null;
  const funder = readKeypair(funderPath);

  const creator = creatorPath ? readKeypair(creatorPath) : Keypair.generate();
  const player2 = player2Path ? readKeypair(player2Path) : Keypair.generate();

  const baseConnection = new Connection(BASE_RPC_URL, COMMITMENT);
  const erConnection = new ConnectionMagicRouter(ER_RPC_URL, {
    commitment: COMMITMENT,
    wsEndpoint: ER_WS_URL,
  });

  const baseProviderCreator = new anchor.AnchorProvider(
    baseConnection,
    new anchor.Wallet(creator),
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  const baseProviderPlayer2 = new anchor.AnchorProvider(
    baseConnection,
    new anchor.Wallet(player2),
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  const erProviderCreator = new anchor.AnchorProvider(erConnection, new anchor.Wallet(creator), {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });

  const baseProgramCreator = new anchor.Program(idl, baseProviderCreator);
  const baseProgramPlayer2 = new anchor.Program(idl, baseProviderPlayer2);
  const erProgramCreator = new anchor.Program(idl, erProviderCreator);

  const creatorPk = creator.publicKey;
  const player2Pk = player2.publicKey;

  const room = pda([Buffer.from('room'), creatorPk.toBuffer()], programId);
  const vault = pda([Buffer.from('vault'), room.toBuffer()], programId);
  const winnerState = pda([Buffer.from('winner'), room.toBuffer()], programId);
  const playerOneReveal = pda([Buffer.from('reveal'), room.toBuffer(), creatorPk.toBuffer()], programId);
  const playerTwoReveal = pda([Buffer.from('reveal'), room.toBuffer(), player2Pk.toBuffer()], programId);

  const bufferRoom = delegationBufferPda(room, programId);
  const delegationRecordRoom = delegationRecordPda(room);
  const delegationMetadataRoom = delegationMetadataPda(room);
  const bufferVault = delegationBufferPda(vault, programId);
  const delegationRecordVault = delegationRecordPda(vault);
  const delegationMetadataVault = delegationMetadataPda(vault);
  const bufferWinnerState = delegationBufferPda(winnerState, programId);
  const delegationRecordWinnerState = delegationRecordPda(winnerState);
  const delegationMetadataWinnerState = delegationMetadataPda(winnerState);
  const bufferPlayerOneReveal = delegationBufferPda(playerOneReveal, programId);
  const delegationRecordPlayerOneReveal = delegationRecordPda(playerOneReveal);
  const delegationMetadataPlayerOneReveal = delegationMetadataPda(playerOneReveal);
  const bufferPlayerTwoReveal = delegationBufferPda(playerTwoReveal, programId);
  const delegationRecordPlayerTwoReveal = delegationRecordPda(playerTwoReveal);
  const delegationMetadataPlayerTwoReveal = delegationMetadataPda(playerTwoReveal);

  const vrfOracleQueue = getInstructionAddress(idl, 'request_winner_vrf', 'oracle_queue');
  const vrfProgram = getInstructionAddress(idl, 'request_winner_vrf', 'vrf_program');
  const vrfProgramIdentity = getInstructionAddress(idl, 'consume_winner_vrf', 'vrf_program_identity');
  const requestProgramIdentity = pda([Buffer.from('identity')], programId);
  const [erSlot, baseSlot] = await Promise.all([
    erConnection.getSlot(COMMITMENT),
    baseConnection.getSlot(COMMITMENT),
  ]);

  const results = {
    timestamp: new Date().toISOString(),
    config: {
      baseRpc: BASE_RPC_URL,
      erRpc: ER_RPC_URL,
      teeRpc: TEE_RPC_URL,
      delegationValidator: DELEGATION_VALIDATOR ? DELEGATION_VALIDATOR.toBase58() : null,
      stakeLamports: STAKE_LAMPORTS,
      sessionTopupLamports: SESSION_TOPUP_LAMPORTS,
      creatorKeyPath: creatorPath,
      player2KeyPath: player2Path,
    },
    programId: programId.toBase58(),
    actors: {
      funder: funder.publicKey.toBase58(),
      creator: creatorPk.toBase58(),
      player2: player2Pk.toBase58(),
    },
    pdas: {
      room: room.toBase58(),
      vault: vault.toBase58(),
      winnerState: winnerState.toBase58(),
      playerOneReveal: playerOneReveal.toBase58(),
      playerTwoReveal: playerTwoReveal.toBase58(),
      bufferRoom: bufferRoom.toBase58(),
      bufferVault: bufferVault.toBase58(),
      bufferWinnerState: bufferWinnerState.toBase58(),
      bufferPlayerOneReveal: bufferPlayerOneReveal.toBase58(),
      bufferPlayerTwoReveal: bufferPlayerTwoReveal.toBase58(),
    },
    signatures: {},
    states: {},
    ownerChecks: {},
    negativeTests: [],
    notes: [],
  };

  console.log('Program ID:', programId.toBase58());
  console.log('Funder:', results.actors.funder);
  console.log(`Creator (${creatorPath ? 'provided' : 'fresh'}):`, results.actors.creator);
  console.log(`Player2 (${player2Path ? 'provided' : 'fresh'}):`, results.actors.player2);
  console.log('Room PDA:', results.pdas.room);
  console.log(`Startup slot heads -> er: ${erSlot}, base: ${baseSlot}`);

  assertOrThrow(
    programId.toBase58() === '4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ',
    `IDL program mismatch: expected deployed program id 4b2q... got ${programId.toBase58()}`
  );

  const shouldFundCreator = !creatorPath;
  const shouldFundPlayer2 = !player2Path;
  if (shouldFundCreator || shouldFundPlayer2) {
    const funderBalance = await baseConnection.getBalance(funder.publicKey, COMMITMENT);
    const requiredFunding =
      (shouldFundCreator ? FUNDING_LAMPORTS : 0) +
      (shouldFundPlayer2 ? FUNDING_LAMPORTS : 0) +
      20_000_000;
    assertOrThrow(
      funderBalance >= requiredFunding,
      `Insufficient funder balance: ${funderBalance} lamports, need at least ${requiredFunding}`
    );
  }

  const fundCreator = shouldFundCreator
    ? await ensureBalance(baseConnection, funder, creatorPk, FUNDING_LAMPORTS)
    : null;
  const fundPlayer2 = shouldFundPlayer2
    ? await ensureBalance(baseConnection, funder, player2Pk, FUNDING_LAMPORTS)
    : null;
  results.signatures.fundCreator = fundCreator?.signature || null;
  results.signatures.fundPlayer2 = fundPlayer2?.signature || null;

  const createRoomSignature = await baseProgramCreator.methods
    .createRoom(new anchor.BN(STAKE_LAMPORTS))
    .accounts({
      creator: creatorPk,
      room,
      vault,
      winnerState,
      playerOneReveal,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  results.signatures.createRoom = createRoomSignature;
  console.log('create_room tx:', createRoomSignature);

  const roomAfterCreate = await fetchAndDecode(baseProgramCreator, baseConnection, 'RoomShared', room);
  const statusAfterCreate = enumKey(roomAfterCreate.decoded.status);
  assertOrThrow(
    statusAfterCreate === 'waitingForOpponent',
    `Expected waitingForOpponent after create, got ${statusAfterCreate}`
  );
  results.states.afterCreate = {
    status: statusAfterCreate,
    totalEscrowLamports: roomAfterCreate.decoded.totalEscrowLamports.toString(),
  };

  const joinRoomSignature = await baseProgramPlayer2.methods
    .joinRoom()
    .accounts({
      player: player2Pk,
      room,
      vault,
      winnerState,
      playerTwoReveal,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  results.signatures.joinRoom = joinRoomSignature;
  console.log('join_room tx:', joinRoomSignature);

  const roomAfterJoin = await waitForCondition(
    'room transitions to waitingForVrf after join',
    20_000,
    1000,
    async () => {
      try {
        const candidate = await fetchAndDecode(baseProgramCreator, baseConnection, 'RoomShared', room);
        const status = enumKey(candidate.decoded.status);
        if (status === 'waitingForVrf') {
          return candidate;
        }
        return null;
      } catch (_error) {
        return null;
      }
    }
  );
  const statusAfterJoin = enumKey(roomAfterJoin.decoded.status);
  assertOrThrow(statusAfterJoin === 'waitingForVrf', `Expected waitingForVrf, got ${statusAfterJoin}`);
  results.states.afterJoin = {
    status: statusAfterJoin,
    playerTwo: roomAfterJoin.decoded.playerTwo.toBase58(),
    totalEscrowLamports: roomAfterJoin.decoded.totalEscrowLamports.toString(),
  };

  const delegateSignature = await baseProgramCreator.methods
    .delegatePrivateState()
    .accounts({
      payer: creatorPk,
      roomCreator: creatorPk,
      playerOne: creatorPk,
      playerTwo: player2Pk,
      validator: DELEGATION_VALIDATOR,
      room,
      vault,
      winnerState,
      playerOneReveal,
      playerTwoReveal,
      ownerProgram: programId,
      delegationProgram: DELEGATION_PROGRAM,
      systemProgram: SystemProgram.programId,
      bufferRoom,
      delegationRecordRoom,
      delegationMetadataRoom,
      bufferVault,
      delegationRecordVault,
      delegationMetadataVault,
      bufferWinnerState,
      delegationRecordWinnerState,
      delegationMetadataWinnerState,
      bufferPlayerOneReveal,
      delegationRecordPlayerOneReveal,
      delegationMetadataPlayerOneReveal,
      bufferPlayerTwoReveal,
      delegationRecordPlayerTwoReveal,
      delegationMetadataPlayerTwoReveal,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 })])
    .rpc();
  results.signatures.delegatePrivateState = delegateSignature;
  console.log('delegate_private_state tx:', delegateSignature);

  const delegatedOwners = {
    room: (await getOwner(baseConnection, room))?.toBase58() || null,
    vault: (await getOwner(baseConnection, vault))?.toBase58() || null,
    winnerState: (await getOwner(baseConnection, winnerState))?.toBase58() || null,
    playerOneReveal: (await getOwner(baseConnection, playerOneReveal))?.toBase58() || null,
    playerTwoReveal: (await getOwner(baseConnection, playerTwoReveal))?.toBase58() || null,
  };
  results.ownerChecks.afterDelegate = delegatedOwners;
  for (const [name, owner] of Object.entries(delegatedOwners)) {
    assertOrThrow(owner === DELEGATION_PROGRAM.toBase58(), `${name} not delegated: owner=${owner}`);
  }

  const teeIntegrityOk = await verifyTeeRpcIntegrity(TEE_RPC_URL);
  assertOrThrow(teeIntegrityOk === true, `TEE integrity verification failed for ${TEE_RPC_URL}`);
  results.states.teeIntegrity = {
    endpoint: TEE_RPC_URL,
    ok: teeIntegrityOk,
  };
  results.states.startupSlots = { erSlot, baseSlot };

  const requestSeed = Number(process.env.VRF_CLIENT_SEED || 17);
  const requestVrfTx = await erProgramCreator.methods
    .requestWinnerVrf(requestSeed)
    .accounts({
      payer: creatorPk,
      room,
      oracleQueue: vrfOracleQueue,
      programIdentity: requestProgramIdentity,
      vrfProgram,
      slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const requestVrfSignature = await sendErTransaction(erConnection, requestVrfTx, [creator]);
  results.signatures.requestWinnerVrf = requestVrfSignature;
  console.log('request_winner_vrf tx:', requestVrfSignature);

  const activated = await waitForCondition('VRF callback to Active', POLL_TIMEOUT_MS, 2500, async () => {
    try {
      const roomResult = await fetchAndDecodeAny(
        erProgramCreator,
        [erConnection, baseConnection],
        'RoomShared',
        room
      );
      const winnerResult = await fetchAndDecodeAny(
        erProgramCreator,
        [erConnection, baseConnection],
        'WinnerState',
        winnerState
      );
      const status = enumKey(roomResult.decoded.status);
      if (status === 'active' && winnerResult.decoded.vrfFulfilled === true) {
        return {
          roomResult,
          winnerResult,
        };
      }
      return null;
    } catch (_error) {
      return null;
    }
  });

  const winnerCell = Array.from(activated.winnerResult.decoded.winnerCell);
  results.states.afterVrf = {
    status: enumKey(activated.roomResult.decoded.status),
    vrfRequested: activated.winnerResult.decoded.vrfRequested,
    vrfFulfilled: activated.winnerResult.decoded.vrfFulfilled,
    winnerCell,
    observedOn: activated.roomResult.endpoint,
  };
  console.log('VRF callback active; winner cell:', winnerCell.join(','));

  const p1RevealBaseline = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'PlayerReveal',
    playerOneReveal
  );
  const p2RevealBaseline = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'PlayerReveal',
    playerTwoReveal
  );
  ensureExposedLayer(p1RevealBaseline.decoded, 'player one reveal baseline');
  ensureExposedLayer(p2RevealBaseline.decoded, 'player two reveal baseline');
  results.states.exposedLayerCheck = {
    y: EXPOSED_LAYER_Y,
    status: 'passed',
  };

  const sessionSigner = Keypair.generate();
  const sessionSignerPk = sessionSigner.publicKey;
  const validUntil = Math.floor(Date.now() / 1000) + SESSION_VALIDITY_SECONDS;
  const { sessionToken, instruction: createSessionInstruction } = buildCreateSessionIx({
    authority: player2Pk,
    sessionSigner: sessionSignerPk,
    targetProgram: programId,
    validUntil,
    topUp: true,
    lamports: SESSION_TOPUP_LAMPORTS,
  });

  const createSessionTransaction = new Transaction().add(createSessionInstruction);
  const createSessionSignature = await sendAndConfirmTransaction(
    baseConnection,
    createSessionTransaction,
    [player2, sessionSigner],
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  results.signatures.createSession = createSessionSignature;
  results.pdas.sessionToken = sessionToken.toBase58();
  results.actors.sessionSigner = sessionSignerPk.toBase58();
  results.states.session = {
    authority: player2Pk.toBase58(),
    validUntil,
  };
  console.log('create_session tx:', createSessionSignature);

  const sessionErProvider = new anchor.AnchorProvider(
    erConnection,
    new anchor.Wallet(sessionSigner),
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  const baseProviderSession = new anchor.AnchorProvider(baseConnection, new anchor.Wallet(sessionSigner), {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  const sessionErProgram = new anchor.Program(idl, sessionErProvider);
  const baseProgramSession = new anchor.Program(idl, baseProviderSession);

  const minedCoords = [];
  const firstMineCoord = pickMineCoord(minedCoords, winnerCell, 0);
  minedCoords.push(firstMineCoord);
  const secondMineCoord = pickMineCoord(minedCoords, winnerCell, firstMineCoord[0] + 1);
  minedCoords.push(secondMineCoord);

  const p1BeforeMine1 = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'PlayerReveal',
    playerOneReveal
  );
  const p2BeforeMine1 = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'PlayerReveal',
    playerTwoReveal
  );

  const mineOneTx = await sessionErProgram.methods
    .mine(firstMineCoord[0], firstMineCoord[1], firstMineCoord[2])
    .accounts({
      payer: sessionSignerPk,
      room,
      winnerState,
      playerOneReveal,
      playerTwoReveal,
      sessionToken,
    })
    .transaction();
  const mineOneSignature = await sendErTransaction(erConnection, mineOneTx, [sessionSigner]);
  results.signatures.mineSessionOne = mineOneSignature;
  console.log('mine #1 (session) tx:', mineOneSignature, firstMineCoord.join(','));

  const p1AfterMine1 = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'PlayerReveal',
    playerOneReveal
  );
  const p2AfterMine1 = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'PlayerReveal',
    playerTwoReveal
  );

  const p1Diff = revealDiffSummary(p1BeforeMine1.decoded, p1AfterMine1.decoded);
  const p2Diff = revealDiffSummary(p2BeforeMine1.decoded, p2AfterMine1.decoded);

  assertOrThrow(
    p2Diff.changedBits > 0,
    `Expected caller (player2) reveal to change after mine; changedBits=${p2Diff.changedBits}`
  );
  assertOrThrow(
    p1Diff.changedBits === 0,
    `Expected opponent (player1) reveal unchanged; changedBits=${p1Diff.changedBits}`
  );

  results.states.fogAfterMineOne = {
    caller: 'player2',
    mineCoord: firstMineCoord,
    playerOneChangedBits: p1Diff.changedBits,
    playerTwoChangedBits: p2Diff.changedBits,
  };

  const mineTwoTx = await sessionErProgram.methods
    .mine(secondMineCoord[0], secondMineCoord[1], secondMineCoord[2])
    .accounts({
      payer: sessionSignerPk,
      room,
      winnerState,
      playerOneReveal,
      playerTwoReveal,
      sessionToken,
    })
    .transaction();
  const mineTwoSignature = await sendErTransaction(erConnection, mineTwoTx, [sessionSigner]);
  results.signatures.mineSessionTwo = mineTwoSignature;
  console.log('mine #2 (session) tx:', mineTwoSignature, secondMineCoord.join(','));

  await expectFailure(
    'invalid coords mine(16,2,0)',
    async () => {
      const transaction = await sessionErProgram.methods
        .mine(16, 2, 0)
        .accounts({
          payer: sessionSignerPk,
          room,
          winnerState,
          playerOneReveal,
          playerTwoReveal,
          sessionToken,
        })
        .transaction();
      return sendErTransaction(erConnection, transaction, [sessionSigner]);
    },
    results.negativeTests
  );

  await expectFailure(
    'duplicate mine on already mined coord',
    async () => {
      const transaction = await sessionErProgram.methods
        .mine(firstMineCoord[0], firstMineCoord[1], firstMineCoord[2])
        .accounts({
          payer: sessionSignerPk,
          room,
          winnerState,
          playerOneReveal,
          playerTwoReveal,
          sessionToken,
        })
        .transaction();
      return sendErTransaction(erConnection, transaction, [sessionSigner]);
    },
    results.negativeTests
  );

  const unauthorizedCoord = pickMineCoord(minedCoords, winnerCell, secondMineCoord[0] + 1);
  await expectFailure(
    'unauthorized session token usage by creator payer',
    async () => {
      const transaction = await erProgramCreator.methods
        .mine(unauthorizedCoord[0], unauthorizedCoord[1], unauthorizedCoord[2])
        .accounts({
          payer: creatorPk,
          room,
          winnerState,
          playerOneReveal,
          playerTwoReveal,
          sessionToken,
        })
        .transaction();
      return sendErTransaction(erConnection, transaction, [creator]);
    },
    results.negativeTests
  );

  const expiredSigner = Keypair.generate();
  const expiredValidUntil = Math.floor(Date.now() / 1000) - 60;
  const { sessionToken: expiredSessionToken, instruction: expiredSessionInstruction } =
    buildCreateSessionIx({
      authority: player2Pk,
      sessionSigner: expiredSigner.publicKey,
      targetProgram: programId,
      validUntil: expiredValidUntil,
      topUp: true,
      lamports: SESSION_TOPUP_LAMPORTS,
    });

  const expiredSessionTx = new Transaction().add(expiredSessionInstruction);
  const expiredSessionCreateSig = await sendAndConfirmTransaction(
    baseConnection,
    expiredSessionTx,
    [player2, expiredSigner],
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  results.signatures.createExpiredSession = expiredSessionCreateSig;

  const expiredErProvider = new anchor.AnchorProvider(
    erConnection,
    new anchor.Wallet(expiredSigner),
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  const expiredErProgram = new anchor.Program(idl, expiredErProvider);

  const expiredMineCoord = pickMineCoord(minedCoords, winnerCell, unauthorizedCoord[0] + 1);
  await expectFailure(
    'expired session token rejected',
    async () => {
      const transaction = await expiredErProgram.methods
        .mine(expiredMineCoord[0], expiredMineCoord[1], expiredMineCoord[2])
        .accounts({
          payer: expiredSigner.publicKey,
          room,
          winnerState,
          playerOneReveal,
          playerTwoReveal,
          sessionToken: expiredSessionToken,
        })
        .transaction();
      return sendErTransaction(erConnection, transaction, [expiredSigner]);
    },
    results.negativeTests
  );

  const wrongRoutingCoord = pickMineCoord(minedCoords, winnerCell, expiredMineCoord[0] + 1);
  await expectFailure(
    'wrong routing endpoint (base RPC for delegated mine)',
    async () =>
      baseProgramSession.methods
        .mine(wrongRoutingCoord[0], wrongRoutingCoord[1], wrongRoutingCoord[2])
        .accounts({
          payer: sessionSignerPk,
          room,
          winnerState,
          playerOneReveal,
          playerTwoReveal,
          sessionToken,
        })
        .rpc(),
    results.negativeTests
  );

  await expectFailure(
    'invalid VRF signer consume_winner_vrf direct call',
    async () => {
      const transaction = await erProgramCreator.methods
        .consumeWinnerVrf(Array(32).fill(9))
        .accounts({
          vrfProgramIdentity: creatorPk,
          room,
          winnerState,
        })
        .transaction();
      return sendErTransaction(erConnection, transaction, [creator]);
    },
    results.negativeTests
  );

  await expectFailure(
    'replay request_winner_vrf after already requested/active',
    async () => {
      const transaction = await erProgramCreator.methods
        .requestWinnerVrf(19)
        .accounts({
          payer: creatorPk,
          room,
          oracleQueue: vrfOracleQueue,
          programIdentity: requestProgramIdentity,
          vrfProgram,
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      return sendErTransaction(erConnection, transaction, [creator]);
    },
    results.negativeTests
  );

  const winnerBalanceBefore = await baseConnection.getBalance(player2Pk, COMMITMENT);
  const vaultBeforeFinalize = await fetchAndDecode(baseProgramCreator, baseConnection, 'VaultEscrow', vault);
  const roomBeforeFinalize = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'RoomShared',
    room
  );

  const winningMineTx = await sessionErProgram.methods
    .mine(winnerCell[0], winnerCell[1], winnerCell[2])
    .accounts({
      payer: sessionSignerPk,
      room,
      winnerState,
      playerOneReveal,
      playerTwoReveal,
      sessionToken,
    })
    .transaction();
  const winningMineSignature = await sendErTransaction(erConnection, winningMineTx, [sessionSigner]);
  results.signatures.mineWinningCell = winningMineSignature;
  console.log('mine winning cell tx:', winningMineSignature, winnerCell.join(','));

  const roomAfterWin = await fetchAndDecodeAny(
    erProgramCreator,
    [erConnection, baseConnection],
    'RoomShared',
    room
  );
  const statusAfterWin = enumKey(roomAfterWin.decoded.status);
  assertOrThrow(statusAfterWin === 'won', `Expected won status, got ${statusAfterWin}`);
  assertOrThrow(
    roomAfterWin.decoded.winner.toBase58() === player2Pk.toBase58(),
    `Winner mismatch, expected ${player2Pk.toBase58()}, got ${roomAfterWin.decoded.winner.toBase58()}`
  );
  results.states.afterWin = {
    status: statusAfterWin,
    winner: roomAfterWin.decoded.winner.toBase58(),
    mineActions: roomAfterWin.decoded.mineActions.toString(),
  };

  const player2ErProvider = new anchor.AnchorProvider(
    erConnection,
    new anchor.Wallet(player2),
    {
      commitment: COMMITMENT,
      preflightCommitment: COMMITMENT,
    }
  );
  const player2ErProgram = new anchor.Program(idl, player2ErProvider);

  const finalizeWinTransaction = await player2ErProgram.methods
    .finalizeWin()
    .accounts({
      payer: player2Pk,
      room,
      vault,
      winnerState,
      playerOneReveal,
      playerTwoReveal,
      magicProgram: MAGIC_PROGRAM,
      magicContext: MAGIC_CONTEXT,
    })
    .transaction();
  finalizeWinTransaction.feePayer = player2Pk;
  const finalizeSignature = await sendErTransaction(erConnection, finalizeWinTransaction, [player2]);
  results.signatures.finalizeWin = finalizeSignature;
  console.log('finalize_win tx:', finalizeSignature);

  await expectFailure(
    'replay finalize_win after finalized',
    async () => {
      const transaction = await player2ErProgram.methods
        .finalizeWin()
        .accounts({
          payer: player2Pk,
          room,
          vault,
          winnerState,
          playerOneReveal,
          playerTwoReveal,
          magicProgram: MAGIC_PROGRAM,
          magicContext: MAGIC_CONTEXT,
        })
        .transaction();
      transaction.feePayer = player2Pk;
      return sendErTransaction(erConnection, transaction, [player2]);
    },
    results.negativeTests
  );

  const finalizeTx =
    (await maybeFetchTx(erConnection, finalizeSignature)) ||
    (await maybeFetchTx(baseConnection, finalizeSignature));
  const finalizeFee = finalizeTx?.meta?.fee || 0;

  await sleep(3000);

  const targetAccounts = [
    {
      name: 'room',
      pubkey: room,
      seedParts: accountSeedBytes([Buffer.from('room'), creatorPk.toBuffer()]),
      buffer: bufferRoom,
    },
    {
      name: 'vault',
      pubkey: vault,
      seedParts: accountSeedBytes([Buffer.from('vault'), room.toBuffer()]),
      buffer: bufferVault,
    },
    {
      name: 'winnerState',
      pubkey: winnerState,
      seedParts: accountSeedBytes([Buffer.from('winner'), room.toBuffer()]),
      buffer: bufferWinnerState,
    },
    {
      name: 'playerOneReveal',
      pubkey: playerOneReveal,
      seedParts: accountSeedBytes([
        Buffer.from('reveal'),
        room.toBuffer(),
        creatorPk.toBuffer(),
      ]),
      buffer: bufferPlayerOneReveal,
    },
    {
      name: 'playerTwoReveal',
      pubkey: playerTwoReveal,
      seedParts: accountSeedBytes([
        Buffer.from('reveal'),
        room.toBuffer(),
        player2Pk.toBuffer(),
      ]),
      buffer: bufferPlayerTwoReveal,
    },
  ];

  let postFinalizeOwners = {};
  const undelegationDeadline = Date.now() + Math.max(POLL_TIMEOUT_MS, 120_000);
  let undelegationAttempt = 0;
  while (true) {
    postFinalizeOwners = {};
    for (const account of targetAccounts) {
      const owner = await getOwner(baseConnection, account.pubkey);
      postFinalizeOwners[account.name] = owner?.toBase58() || null;
    }

    const stillDelegated = targetAccounts.filter(
      (account) => postFinalizeOwners[account.name] === DELEGATION_PROGRAM.toBase58()
    );
    if (stillDelegated.length === 0) {
      break;
    }
    if (Date.now() > undelegationDeadline) {
      throw new Error(
        `Timed out waiting for undelegation; still delegated: ${stillDelegated
          .map((item) => item.name)
          .join(', ')}`
      );
    }

    undelegationAttempt += 1;
    console.log(
      `Processing undelegation attempt #${undelegationAttempt} for:`,
      stillDelegated.map((item) => item.name).join(', ')
    );
    for (const account of stillDelegated) {
      try {
        const processUndelegationSignature = await baseProgramCreator.methods
          .processUndelegation(account.seedParts)
          .accounts({
            baseAccount: account.pubkey,
            buffer: account.buffer,
            payer: creatorPk,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        results.signatures[`processUndelegation_${account.name}_attempt${undelegationAttempt}`] =
          processUndelegationSignature;
      } catch (error) {
        const parsed = formatError(error);
        results.notes.push(
          `process_undelegation attempt ${undelegationAttempt} failed for ${account.name}: ${parsed.message}`
        );
      }
    }
    await sleep(5000);
  }

  results.ownerChecks.afterFinalize = postFinalizeOwners;

  const settleWinPayoutSignature = await baseProgramPlayer2.methods
    .settleWinPayout()
    .accounts({
      winner: player2Pk,
      room,
      vault,
    })
    .rpc();
  results.signatures.settleWinPayout = settleWinPayoutSignature;
  console.log('settle_win_payout tx:', settleWinPayoutSignature);

  const settleTx =
    (await maybeFetchTx(baseConnection, settleWinPayoutSignature)) ||
    (await maybeFetchTx(erConnection, settleWinPayoutSignature));
  const settleFee = settleTx?.meta?.fee || 0;

  const roomFinal = await fetchAndDecodeAny(
    baseProgramCreator,
    [baseConnection, erConnection],
    'RoomShared',
    room
  );
  const vaultFinal = await fetchAndDecode(baseProgramCreator, baseConnection, 'VaultEscrow', vault);

  const winnerBalanceAfter = await baseConnection.getBalance(player2Pk, COMMITMENT);

  const payoutLamports = Number(roomBeforeFinalize.decoded.totalEscrowLamports.toString());
  const winnerNetReceived = winnerBalanceAfter - winnerBalanceBefore + finalizeFee + settleFee;

  assertOrThrow(
    enumKey(roomFinal.decoded.status) === 'finalized',
    `Expected finalized status after finalize_win, got ${enumKey(roomFinal.decoded.status)}`
  );
  assertOrThrow(
    roomFinal.decoded.totalEscrowLamports.toString() === '0',
    `Expected totalEscrowLamports=0, got ${roomFinal.decoded.totalEscrowLamports.toString()}`
  );

  results.states.afterFinalize = {
    status: enumKey(roomFinal.decoded.status),
    totalEscrowLamports: roomFinal.decoded.totalEscrowLamports.toString(),
    payoutLamports,
    winnerBalanceBefore,
    winnerBalanceAfter,
    finalizeFeeLamports: finalizeFee,
    settleFeeLamports: settleFee,
    winnerNetReceived,
    vaultLamportsBefore: vaultBeforeFinalize.lamports,
    vaultLamportsAfter: vaultFinal.lamports,
  };

  if (winnerNetReceived !== payoutLamports) {
    results.notes.push(
      `Winner net received (${winnerNetReceived}) does not exactly match payout (${payoutLamports}); verify additional fees or settlement timing.`
    );
  }

  const finalOutputPath = path.resolve(__dirname, '..', 'verification');
  if (!fs.existsSync(finalOutputPath)) {
    fs.mkdirSync(finalOutputPath, { recursive: true });
  }
  const outputFile = path.join(finalOutputPath, 'devnet_e2e_latest.json');
  fs.writeFileSync(outputFile, `${JSON.stringify(results, null, 2)}\n`);

  console.log('E2E verification complete.');
  console.log('Output JSON:', outputFile);
  console.log('Summary signatures:');
  console.log(JSON.stringify(results.signatures, null, 2));
}

main().catch((error) => {
  const parsed = formatError(error);
  console.error('E2E verification failed:', parsed.message);
  if (parsed.signature) {
    console.error('Failing signature:', parsed.signature);
  }
  if (parsed.logs && parsed.logs.length > 0) {
    console.error('Logs:');
    for (const line of parsed.logs) {
      console.error(line);
    }
  }
  process.exit(1);
});
