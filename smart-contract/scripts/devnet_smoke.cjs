const fs = require('fs');
const path = require('path');
const anchor = require('@coral-xyz/anchor');

const { PublicKey, Keypair, SystemProgram, Connection, ComputeBudgetProgram } = anchor.web3;

const RPC_URL = 'https://api.devnet.solana.com';
const COMMITMENT = 'confirmed';
const DELEGATION_PROGRAM = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const TEE_VALIDATOR = new PublicKey('FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA');
const STAKE_LAMPORTS = Number(process.env.STAKE_LAMPORTS || 50_000_000); // default 0.05 SOL

function readKeypair(relPath) {
  const p = path.resolve(__dirname, '..', relPath);
  const secret = JSON.parse(fs.readFileSync(p, 'utf8'));
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

function enumKey(v) {
  if (v == null) return 'unknown';
  if (typeof v === 'string') return v;
  const ks = Object.keys(v);
  return ks.length ? ks[0] : 'unknown';
}

async function getBalance(connection, pubkey) {
  return (await connection.getBalance(pubkey, COMMITMENT)) / 1_000_000_000;
}

async function main() {
  const idlPath = path.resolve(__dirname, '..', 'target/idl/mine_duel.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const programId = new PublicKey(idl.address);

  const creatorPath = process.env.CREATOR_KEY || 'wallets/deployer.json';
  const player2Path = process.env.PLAYER2_KEY || 'wallets/player2.json';
  const creator = readKeypair(creatorPath);
  const player2 = readKeypair(player2Path);

  const connection = new Connection(RPC_URL, COMMITMENT);
  const providerCreator = new anchor.AnchorProvider(connection, new anchor.Wallet(creator), {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
  const providerP2 = new anchor.AnchorProvider(connection, new anchor.Wallet(player2), {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });

  const programCreator = new anchor.Program(idl, providerCreator);
  const programP2 = new anchor.Program(idl, providerP2);

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

  console.log('Program:', programId.toBase58());
  console.log('Creator keyfile:', creatorPath);
  console.log('Player2 keyfile:', player2Path);
  console.log('Creator:', creatorPk.toBase58());
  console.log('Player2:', player2Pk.toBase58());
  console.log('Room PDA:', room.toBase58());
  console.log('Vault PDA:', vault.toBase58());

  const existing = await connection.getAccountInfo(room, COMMITMENT);
  let didCreateJoin = false;
  if (existing) {
    const st = await programCreator.account.roomShared.fetch(room);
    const status = enumKey(st.status);
    console.log(`Existing room status: ${status}`);
    if (status === 'waitingForOpponent') {
      const joinSig = await programP2.methods
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
      console.log('join_room tx:', joinSig);
      didCreateJoin = true;
    } else if (status === 'waitingForVrf' || status === 'active') {
      console.log('Reusing existing room for delegation smoke step.');
    } else {
      throw new Error(`Room already exists in non-resettable state (${status}). Use a fresh creator wallet for smoke run.`);
    }
  } else {
    const createSig = await programCreator.methods
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
    console.log('create_room tx:', createSig);

    const afterCreate = await programCreator.account.roomShared.fetch(room);
    console.log('status after create:', enumKey(afterCreate.status));
    console.log('escrow after create (lamports):', afterCreate.totalEscrowLamports.toString());

    const joinSig = await programP2.methods
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
    console.log('join_room tx:', joinSig);
    didCreateJoin = true;
  }

  const creatorStart = await getBalance(connection, creatorPk);
  const p2Start = await getBalance(connection, player2Pk);

  const afterJoin = await programCreator.account.roomShared.fetch(room);
  console.log('status pre-delegate:', enumKey(afterJoin.status));
  console.log('player_two:', afterJoin.playerTwo.toBase58());
  console.log('escrow pre-delegate (lamports):', afterJoin.totalEscrowLamports.toString());

  try {
    const delegateSig = await programCreator.methods
      .delegatePrivateState()
      .accounts({
        payer: creatorPk,
        roomCreator: creatorPk,
        playerOne: creatorPk,
        playerTwo: player2Pk,
        validator: TEE_VALIDATOR,
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
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }),
      ])
      .rpc();
    console.log('delegate_private_state tx:', delegateSig);
  } catch (e) {
    console.log('delegate_private_state failed:', e?.message || e);
    if (e?.logs) console.log('delegate logs:', e.logs);
    if (e?.errorLogs) console.log('delegate errorLogs:', e.errorLogs);
    if (e?.transactionLogs) console.log('delegate transactionLogs:', e.transactionLogs);
    console.dir(e, { depth: 6 });
  }

  const creatorEnd = await getBalance(connection, creatorPk);
  const p2End = await getBalance(connection, player2Pk);

  console.log('balances SOL:');
  console.log('creator start/end:', creatorStart, creatorEnd);
  console.log('player2 start/end:', p2Start, p2End);
  console.log('create+join this run:', didCreateJoin);
  console.log('Smoke flow complete.');
}

main().catch((e) => {
  console.error('Smoke flow error:', e);
  process.exit(1);
});
