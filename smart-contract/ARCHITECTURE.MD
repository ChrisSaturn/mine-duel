# MINE DUEL SMART CONTRACT ARCHITECTURE (V1)

Last updated: 2026-03-22

## 1) Product-Locked Decisions

- Framework: Anchor + MagicBlock SDKs.
- Fixed map: `16 x 16 x 8` (`x,z,y`) with no size parameters in room creation.
- Global visibility baseline: all cells at `Y=1` are revealed to both players by default.
- Gameplay action: coordinate mining only (`mine(x,y,z)`).
- Fog-of-war reveal rule: mine action reveals mined cell + six axis-adjacent neighbors for caller only.
- Match economics: winner takes all escrowed stake.
- Lifecycle policy:
  - Creator can cancel only before player 2 joins (`cancel_room_prejoin`).
  - No timeout/post-join recovery path in v1.

## 2) Account Model

### `RoomShared` (public/shared match state)
- PDA: `["room", creator]`
- Stores:
  - players (`player_one`, `player_two`), `creator`, `winner`
  - `stake_lamports`, `total_escrow_lamports`
  - status enum (`WaitingForOpponent`, `WaitingForVrf`, `Active`, `Won`, `Finalized`, `Cancelled`)
  - telemetry/checkpoint fields (`mine_actions`, `checkpoint_seq`, `checkpoint_hash`, `last_action_slot`)

### `VaultEscrow` (escrow lamports)
- PDA: `["vault", room]`
- Holds stake deposits from both players.
- Payout occurs in `finalize_win` (winner receives `total_escrow_lamports`).

### `WinnerState` (private match core state)
- PDA: `["winner", room]`
- Stores:
  - VRF lifecycle (`vrf_requested`, `vrf_fulfilled`)
  - secret winner coordinate (`winner_cell`)
  - VRF entropy snapshot (`randomness`)
  - global mined-cell bitset (`mined_mask`)

### `PlayerReveal` (private per-player fog state)
- PDA: `["reveal", room, player_pubkey]`
- One account per player.
- Stores player-specific revealed cell bitset (`revealed_mask`).
- Initialized with full exposure of `Y=1` layer.

## 3) Instruction Set

- `create_room(stake_lamports)`
  - Initializes `RoomShared`, `VaultEscrow`, `WinnerState`, creator `PlayerReveal`.
  - Escrows creator stake.
- `cancel_room_prejoin()`
  - Allowed only for creator while status is `WaitingForOpponent`.
  - Closes room/vault/private state accounts and returns funds/rent to creator.
- `join_room()`
  - Enforces exact stake match.
  - Initializes player two reveal account.
  - Transitions room to `WaitingForVrf`.
- `delegate_private_state()`
  - Delegates room, vault, winner state, and both reveal accounts for ER execution.
  - Uses explicit delegation support accounts (`buffer_*`, `delegation_record_*`, `delegation_metadata_*`) and validates all expected PDAs before CPI.
- `request_winner_vrf(client_seed)`
  - Requests VRF once player two has joined.
  - Registers callback to `consume_winner_vrf`.
- `consume_winner_vrf(randomness)`
  - Validates VRF callback identity signer.
  - Derives secret winner coordinate and sets room `Active`.
- `mine(x,y,z)`
  - Session-key compatible gameplay action.
  - Marks globally mined cells, updates caller-only fog reveal, sets `Won` if winner cell is found.
- `commit_checkpoint(checkpoint_hash)`
  - Updates non-sensitive checkpoint fields on shared room state.
  - Commits shared state to base layer from ER.
- `finalize_win()`
  - Winner-only final settlement.
  - Transfers escrow amount to winner.
  - Commit + undelegate path for final state.

## 4) Transaction Routing Contract

- Base layer (L1) instructions:
  - `create_room`
  - `cancel_room_prejoin`
  - `join_room`
  - initial `delegate_private_state`
- Private ER / TEE instructions:
  - `request_winner_vrf`
  - `consume_winner_vrf`
  - `mine`
  - `commit_checkpoint`
  - `finalize_win`

## 5) Security Controls in V1

- Session key validation:
  - validates authority, token PDA derivation, and expiry.
  - falls back to main signer if session token absent.
- VRF callback hard check:
  - `vrf_program_identity` must equal `ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY`.
- Coordinates:
  - strict bounds checks for all mine/reveal updates.
- Replay/spam resistance:
  - duplicate mine on already mined coordinate is rejected.

## 6) Known V1 Constraints

- One room PDA namespace per creator seed (`["room", creator]`).
- No post-join timeout/recovery path.
- Checkpoint commits are hash/metadata focused, while private reveal/winner internals stay in delegated private state.
- Delegating all 5 private-state accounts in one instruction requires elevated compute budget on the client tx (the default 200k CU is insufficient on devnet).
