# MINE DUEL V1 ON-CHAIN VERIFICATION (DEVNET)

Last updated: 2026-03-22

This is the step-by-step verification sequence for the current v1 smart contract.

## Preconditions

- Solana CLI and Anchor CLI installed.
- Wallet funded on devnet.
- `smart-contract/Anchor.toml` provider wallet path is valid.
- Client/runtime code uses dual-connection routing (L1 + MagicBlock ER).

## 1) Scaffold Sanity

Commands:

```bash
cd /Volumes/Personal\ Data/Mine\ Duel/smart-contract
cargo check -p mine-duel
```

Expected:

- Build succeeds.
- Constants are compile-time fixed in program:
  - `MAP_WIDTH=16`, `MAP_DEPTH=16`, `MAP_HEIGHT=8`, `EXPOSED_LAYER_Y=1`.

## 2) Escrow Lifecycle

Flow:

1. Call `create_room(stake_lamports)`.
2. Verify room status = `WaitingForOpponent`.
3. Verify vault lamports increased by at least `stake_lamports`.
4. Call `cancel_room_prejoin` as creator.

Expected:

- Cancel succeeds only before player 2 join.
- Vault/room/private accounts are closed and funds returned to creator.

## 3) Join + Lock

Flow:

1. Re-create room.
2. Player 2 calls `join_room()`.

Expected:

- Exact stake deposit enforced (uses room stake amount).
- `player_two` set.
- room status = `WaitingForVrf`.

## 4) Delegation Correctness

Flow:

1. Call `delegate_private_state`.
2. Read account owners for room/vault/winner/reveal accounts.

Expected:

- Owners are delegation program after successful delegation.
- Subsequent delegated ops are routed to ER endpoint.

## 5) TEE Access Path

Flow (client side):

1. Verify TEE endpoint integrity.
2. Request challenge/auth token.
3. Connect using `?token=...`.

Expected:

- Private ER connection succeeds only with valid attested token.

## 6) VRF Flow

Flow:

1. Call `request_winner_vrf(client_seed)`.
2. Observe callback into `consume_winner_vrf(randomness)`.

Expected:

- `vrf_requested=true`, then `vrf_fulfilled=true`.
- room status transitions from `WaitingForVrf` to `Active`.
- winner cell is initialized internally.

## 7) Session-Key Mining

Flow:

1. Create session token for active player.
2. Execute repeated `mine(x,y,z)` using session signer.

Expected:

- No wallet popup for each mine tx.
- Invalid/expired session token is rejected.
- Fallback signer path works without session token.

## 8) Fog-of-War Correctness

Flow:

1. Fetch player reveal masks before mine.
2. Mine a target coordinate.
3. Fetch both reveal masks.

Expected:

- Caller reveal includes mined cell + six neighbors.
- Opponent reveal mask is unchanged.
- `Y=1` cells are pre-revealed for both players from initialization.

## 9) Win + Finalization

Flow:

1. Mine winner coordinate first.
2. Verify room status = `Won` and winner pubkey set.
3. Call `finalize_win()` on ER router (commit + undelegate scheduling).
4. Wait for delegated account ownership to return from delegation program.
5. Winner calls `settle_win_payout()` on base RPC.

Expected:

- `finalize_win` succeeds on ER and schedules commit/undelegate.
- Room/vault/winner/reveal owners return from `DELeGG...` to the game program.
- `settle_win_payout` transfers full escrow to winner and sets room status to `Finalized`.

## 10) Negative + Security Cases

Execute and assert failures for:

- out-of-bounds mine coordinates
- duplicate mine coordinate
- unauthorized caller (not player one/two)
- invalid session token PDA or expired token
- VRF callback with incorrect signer identity
- invalid state transitions:
  - join on already joined room
  - mine before VRF fulfillment
  - finalize before `Won`

## Latest Full Devnet E2E (Executed 2026-03-22 UTC)

Program:
- Program ID: `4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ`
- Latest deploy/upgrade signature: `FxxPi53ZeCbZW4i5RTKtHocTQpdARN3Cx53nut3BMzynMvdivnGXK4o3cyNyQWUkyz4y1jX85qkbJCmcTmoQNEg`

Run metadata:
- Output artifact: `smart-contract/verification/devnet_e2e_latest.json`
- Run timestamp: `2026-03-22T17:12:42.026Z`
- Startup heads: `erSlot=285686607`, `baseSlot=450288113`

Core tx chain (passing run):
1. `create_room`  
   `3jkZnjd1prsy1jMDPu48bRj2Q1qjndo9XnT5oLWAZG8Kyh16ftXrg6PqkJpSsh4MnzmghumQUz3WA3HqA9d5dPPK`
2. `join_room`  
   `65FGWHXFMwPb35UAKsNgfGo6pnL6f2C4iJQ1fgmyXvxKEd5JwNucQD6jzGx9WtafaREokf7v2fdBYq5AkV8TkSKy`
3. `delegate_private_state`  
   `2UE5sDeGU79kT6RigUVTJ1BrZmbQebwBnRti9VzRvcsZZ2tWKhHEJbxubHxLvTrCdyKTJe92M2tQD4BbuXMiyS1n`
4. `request_winner_vrf`  
   `2voP6zWGba55E16rRNPYYawRMsbg6FShzKHWnQUgA1rfN6T6v5PyPLSy6SUBNAyjaPMf5Hb1MFf4iHyuMamdJqjQ`
5. session mines  
   `66G5BPSuSFhkTWFSQN6HwSR4SKxDzwSqbc4dvKYrVgbzy4TExuzxq7EKseFpCs5AS4inYvVeqFGkE5BJUs5SDCMC`  
   `3TzEpFMn3aCYwUtdTG5h16ZZzRkrnVVmpuKCsxJzih5eTwhDa18yXRaegPKNvJb17sqYCaKznmrrpirxA4R4KPtZ`
6. winning mine  
   `5p3u4kDXhcZu9fN2kvpfN5h99ez1TmEJr2w8D4ZPxDTz2wPqDdqCNDX4VcykybKY8J4znWwapjMGFC5LPgfc8VKv`
7. `finalize_win`  
   `XhJG89EFEePM4GAu7X5FZaMz3jXEHuoDVgsD7dPHDN12jkHQCxzKHzJRxAfhsQhrEWqS6jmHpFmTTmhCzEAJYem`
8. `settle_win_payout`  
   `Q8xdzyf5KmEsVmSsA5svvdjJpBiRuaogzuXwJ8S6h3vzMrJ76zwCk9FinGsVs5F1mNTcBLYDX4xnzknesHyXqh8`

State transition evidence:
- `WaitingForOpponent -> WaitingForVrf -> Active -> Won -> Finalized`
- VRF result in passing run:
  - `vrfRequested=true`
  - `vrfFulfilled=true`
  - winner cell: `[3,2,15]`

Ownership evidence:
- After delegate:
  - room/vault/winner/reveal owners: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- After finalize + settlement:
  - room/vault/winner/reveal owners: `4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ`

Settlement evidence:
- Payout: `100000000` lamports
- Winner net received (fees-adjusted): `100000000` lamports
- Vault lamports: `101176240 -> 1176240`

Negative/security outcomes (all expected rejections):
- invalid coordinate -> `Custom:6006`
- duplicate mine -> `Custom:6007`
- unauthorized session -> `Custom:6010`
- expired session -> `Custom:6010`
- wrong routing endpoint (base RPC on delegated accounts) -> account owner mismatch (`3007`)
- invalid VRF signer direct callback -> address constraint (`2012`)
- replay VRF request after active -> invalid status (`6000`)
- replay finalize on delegated room -> account owner mismatch (`3007`)

Operational notes from this run:
- Delegation tx still requires elevated CU budget (`1_200_000`).
- TEE integrity check passed (`verifyTeeRpcIntegrity=true`), but gameplay writes were routed via ER router (`https://devnet.magicblock.app/`).
- `process_undelegation` helper attempts logged missing required signature during simulation; ownership still returned by commit+undelegate scheduling path and settlement completed.

## Legacy Deploy Rent Reclaim (Executed 2026-03-22)

Discovery summary:
- Checked upgradeable-program authorities used in this workspace (`~/.config/solana/id.json`, `smart-contract/wallets/deployer.json`, and test wallets).
- No open upgrade buffer accounts were found for these authorities on devnet.
- Historical `Anchor.toml` placeholder program id `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgPq9G8t6xQ9` does not exist on devnet.

Fee funding step:
- Sent `0.01 SOL` from deployer authority `7QA5...` to `Fmy...` to cover close fees.
- Signature: `uMuRU94ESLx2Q3p8PqDXPAbznknudgZMbxyNWYCjTzDH5SzfaatX9YePLf6uZwx47GXVkjwArKtaUkyR8i5N7hz`

Closed legacy programs (authority `Fmy2333qSLZj98Q5k8Hn6vJukiEiJWX1YCMNtvnmNQgX`):
1. Program `6G9rnzKuQKNnq4irwfGfL7uoswAohb1XD5Hsf4L33Vsk`  
   ProgramData `D3k4CrbtaoLemGSdLdSxgp5EnoqzQ6rTgckJaCMRGtc8`  
   Reclaimed `3.7280892 SOL`  
   Close tx: `5c86SDqzmHUgyZEh9DKhvcvrHP1BRv5mzqExZ7RF6zVC2JZBSDtZWAQTYY6vSEYLZ9o8N3WgiPybEyyDyWKA9yDX`
2. Program `68DhM4yjATYMMCvNeRndjoxPbo7NzSnaNq1J9diXFucQ`  
   ProgramData `HC3BR6LmH9eJDBNheeXC6HvDLnoEzcgYLGtBa97YkZ3b`  
   Reclaimed `5.04620184 SOL`  
   Close tx: `4AwDRy6X85Cz5fbRE9kffhD2RgTjvfuXTatbbCazc99LBGugK5WSxMeSRZ9nmj2ZCgzYGV2DYwREcFb15RjLSGt9`
3. Program `HFmWxe7HufHuygGS5j9ZRKdHwZtXdWWz6iDccH6x4VBq`  
   ProgramData `CN3GA3t2ytfX9n9V2uGwewjGYwvdRKQoq2dLsCUTZe9f`  
   Reclaimed `4.17397464 SOL`  
   Close tx: `5LMXJ3Z59kVzfr3YZbK5ZpXV1VnmQzJrrnbyP2wQ4xSDVHDsqRPWGjChpAEzQPiCKW4zdHVRu6Yv4zdqFR5yTd9U`

Total reclaimed from legacy programs: `12.94826568 SOL`.

Post-reclaim state:
- `Fmy...` balance: `12.95825068 SOL` (includes reclaimed rent and minus tx fees).
- Deployer `7QA5...` balance: `2.49338496 SOL`.
- Current active program remains deployed:
  - `4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ`
  - ProgramData `2NmAFHdxrLPuEhegdnpBRpFLTZQtGhGLeNQYMAvZbMMf`
  - Authority `7QA5Gqmq2CWdu585eQFqN2BobwzBWuYhuPMHih1t12bJ`
  - Balance `3.5209596 SOL`
