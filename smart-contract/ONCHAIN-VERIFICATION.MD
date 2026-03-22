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
3. Winner calls `finalize_win()`.

Expected:

- Winner receives `total_escrow_lamports`.
- Room status becomes `Finalized`.
- Commit + undelegate flow executes for room/vault/private state accounts.

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

## Latest Live Devnet Smoke (Executed 2026-03-22)

Program:
- Program ID: `4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ`
- Deploy/upgrade signature: `438oW572yf4FN9Qg4u7UgV5obwWTfCUwqRnQquSqWEJ3Kb6uZLSoBYu6dHwnUsy8ZACp9Fs3FtzhczJhijyyHny2`
- Deployed slot: `450239064`

Room used for successful smoke:
- creator: `68wkqQoW6niMuu3W1mM5ivo6PD7HzAfD9LHnkQarsM4J`
- player2: `2H1wZARcnhqVY5xuMxVzbkchu6aq1CNeFYK46NCexJMU`
- room PDA: `HbWn871R1UACipCM875Q1SbRMTBGSUKMdCQSsCTNUHi8`

Successful on-chain tx sequence:
1. `create_room`  
   `3D6H1fFqmGAss9pvZFY6z3iBp8qgCqERSCFddhbF5rS9HfLhQFcF58ciboqj4V1dDsEQH6FzhV6oW9t7YcKirSN4`
2. `join_room`  
   `5GK48q9ZYYNBNHxGK1iJvoP7AzNroFijvW6NCh7bEApniG1rrne9zNE7fHANoWwJ9VednHg6JQgTkXbYKXgcjbtQ`
3. `delegate_private_state`  
   `3UfdMdpCE8EXNPBppYDTrYVEqjyA2QF97E6uBrtcxZqiLPjLJzTetzXRYJYhN3kMRfRJSGSSSMkFXGd99ToJUEWM`

One-shot fresh-room smoke (all three in one run):
1. `create_room`  
   `4F4Z7mNrSVTuw6WJbEgGcjRhw99JMjkDyrE1b42Pxt7xBWkvBq1s12uvvpeYqGSkC2BfeesQymVpJTQxNqr5Bb6v`
2. `join_room`  
   `ExcupybfySbFoKXrz9QEH3RetcjQNW4Ns5N8afH2nLJkLHWSpaWSxFKMEZDdVrVfzNBcq4PP1KUEUTHRTxPdm5G`
3. `delegate_private_state`  
   `2fmKG5SX9Dv6heDKmvJmXLsLGWpkH8aumkf58WpqGNyKEuzSSfSygFLCU54uXQp8Cv39nmUWffUyws9V3GbgSDEM`

One-shot room owner checks:
- room `36Sha...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- vault `HX7Jf...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`

Delegation verification (`solana account` owner checks):
- room `HbWn...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- vault `Gzc6...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- winner `7ZC6...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- reveal1 `52hh...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- reveal2 `8poy...` owner -> `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`

Operational note:
- `delegate_private_state` for 5 accounts exceeded default `200,000` compute units.
- Smoke script now sends a compute-budget pre-instruction:
  - `ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 })`
