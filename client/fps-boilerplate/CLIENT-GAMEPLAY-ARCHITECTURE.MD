# MINE DUEL CLIENT GAMEPLAY ARCHITECTURE (V1)

Last updated: 2026-03-22

## Scope

This document defines the browser-client control plane for v1 gameplay only.

- No backend/matchmaking service.
- Strictly serverless, on-chain first control.
- Room matching is room-code-only.
- One-room-per-creator PDA namespace is enforced by protocol constraints.
- Gameplay instructions are split across Base RPC and ER/router paths.

## Runtime state machine

- State flow: `Lobby` -> `WaitingForOpponent` -> `WaitingForVrf` -> `Active` -> `Won` -> `Finalized` -> `PayoutSettled`.

- `Lobby` is local pre-chain UI state before any instruction is sent.
- `WaitingForOpponent` is entered after `create_room(stake_lamports)` (creator signed).
- `WaitingForVrf` is entered after `join_room` and pre-commit to random winner.
- `Active` is entered after winner VRF consume callback is acknowledged on-chain.
- `Won` is entered when the miner account reports `winner_cell` hit.
- `Finalized` is entered once `finalize_win` + delegated-state undelegation are committed.
- `PayoutSettled` is entered when base-layer `settle_win_payout` completes and escrow is zero.

Client game-start gate:
- Pointer-lock gameplay is allowed only in `Active`.
- `WaitingForOpponent` / `WaitingForVrf` render a blocking wait overlay that shows the room code.
- Creator-only cancel control is exposed in `WaitingForOpponent` and maps to `cancel_room_prejoin`.

## Instruction routing contract (canonical)

### Base layer
- `create_room(stake_lamports)`
- `join_room()`
- `cancel_room_prejoin()`
- `delegate_private_state(...)`
- `settle_win_payout()`

### ER/router layer
- `request_winner_vrf(client_seed)`
- `mine(x, y, z)`
- `finalize_win()`

Settlement support:
- `process_undelegation(account_seeds)` is executed on base during post-finalize ownership return.
- `consume_winner_vrf(randomness)` is VRF callback-path/internal and not a primary client action.

Routing summary:
- Gameplay writes and reveal updates happen through ER once private accounts are delegated.
- Base layer is only used for lifecycle + escrow settlement transitions.
- `request_winner_vrf` and ER-validated `consume_winner_vrf` remain a two-step path to `Active`.

## Session-key lifecycle

- Session keys are created automatically when a signed player enters `Active`.
- Session-signed instructions are used for `mine(...)` to avoid wallet popup per shot.
- Re-sign only on token-refresh edges: short expiry or on authority/session errors.
- Session context is revoked on room cancellation, room exit, or final payout path completion.
- Failed/expired session tokens fall back to wallet signer only where supported by protocol rules.

## On-chain data -> client subscriptions

- Client subscribes to:
  - `RoomShared`
  - `WinnerState`
  - local-player `PlayerReveal`
- Mine patch visibility/fog is rebuilt directly from `mined_mask` + local `revealed_mask` account data.
- No world-profile stream dependency and no managed PER room snapshot ingestion in v1.

## Runtime modules

- `src/runtime/gameplay/roomRuntime.js`
  - direct instruction builders + PDA derivation for room lifecycle and settlement.
  - base/ER websocket account subscriptions (`RoomShared`, `WinnerState`, local `PlayerReveal`).
- `src/runtime/gameplay/sessionKeyRuntime.js`
  - in-browser session signer creation and `session_token` setup.
  - session refresh/recreate flow for repeated `mine(...)` submissions without wallet prompts.

## Map and coordinate mapping

- Gameplay coordinates are deterministic and derived from map manifest metadata:
  - `gameplayGrid.origin`
  - `gameplayGrid.cellSize`
  - `gameplayGrid.axes`
  - `gameplayGrid.dims`
- Mining zone authority is map-driven and no longer inferred from empty `hitboxes` only.
- Client-side ray hit positions are projected through `gameplayGrid` before instruction dispatch to avoid authoring drift.

## Error model expected in UI

- Duplicate mine coordinate rejects.
- Out-of-range mine coordinate rejects.
- Unauthorized mine/callback/settlement reject.
- Wrong routing (base-vs-ER mismatch) reject due to account ownership guard.
- Stale/expired session token requires user-visible re-auth path.

## Failure and recovery policy

- `create_room` or `join_room` failures remain local retryable with same room code.
- Room cancel in `WaitingForOpponent` is terminal for that room and clears local active-room context before returning to lobby.
- On `won`/`finalize_win` path, client holds in UI `Finalized` until base confirms `PayoutSettled`.
- On reload, room state is reconstructed from subscriptions only and any in-flight mining state is re-rendered from chain state.
