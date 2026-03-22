# MINE DUEL CLIENT GAMEPLAY ARCHITECTURE (V1)

Last updated: 2026-03-23

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
- While in `WaitingForVrf`, either participant may trigger lifecycle activation (`delegate_private_state` + `request_winner_vrf`) to avoid creator-only deadlock.
- ER-side `request_winner_vrf` and `finalize_win` are session-authorized in client/runtime to avoid extension-wallet cluster mismatch prompts on ER-specific blockhash domains.
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

- Session keys are created automatically for ER-authorized actions (`request_winner_vrf`, `mine`, `finalize_win`) and refreshed on expiry.
- Session-signed instructions are used for ER gameplay/lifecycle actions to avoid repetitive wallet prompts and wallet-extension network-mismatch failures on ER routes.
- `mine(...)` is pre-gated to `Active` status before any session-key creation/signature prompt.
- Re-sign only on token-refresh edges: short expiry or on authority/session errors.
- Session context is revoked on room cancellation, room exit, or final payout path completion.
- Failed/expired session tokens trigger session recreation and retry before surfacing an error.

## On-chain data -> client subscriptions

- Client subscribes to:
  - `RoomShared`
  - `WinnerState`
  - local-player `PlayerReveal`
- Cross-RPC state reconciliation policy:
  - If base-layer account owner is delegation program (`DELeGG...`), base snapshots are treated as delegated/stale and ER snapshots are authoritative.
  - After undelegation (base owner returns to the Mine Duel program), base snapshots become authoritative for lifecycle and payout settlement.
  - ER/base slot numbers are not compared against each other for authority; ownership determines the active source.
- Mine patch visibility/fog is rebuilt directly from `mined_mask` + local `revealed_mask` account data.
- Client render baseline: mine patch `y=0` (top visual layer) is forced visible on load for UX parity; deeper layers still follow `revealed_mask` + mined-state gating.
- Winner-cell visual policy: when `winner_cell` is visible to the local player (revealed + not mined), the default mined-patch variant mesh is suppressed and replaced with `Block_Blank` (`blank_block`) rendering.
- Winner-cell targeting policy: the replacement `Block_Blank` visual is registered as a mine hover/raycast target and carries explicit gameplay-cell coordinates so clicking it routes to the same `mine(x,y,z)` cell as the hidden default mesh.
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
- Mine instruction UX uses stacked tx lifecycle boppers (max `5`, with recency opacity falloff): each mine action keeps one keyed pill that starts at `Sending mine tx…` and updates in place to `Mine tx approved.` or `Mine failed.`/`Mine rejected.`.
- Optimistic mined-cell hides are rollback-safe: if mine confirmation does not land within client timeout (`12s`), the cell is restored in view and can be re-mined.

## Failure and recovery policy

- `create_room` or `join_room` failures remain local retryable with same room code.
- Re-enter flow fetches room state before join; if wallet is already `player_one`/`player_two`, client skips `join_room` to avoid delegated-owner join simulation failures (`3007`).
- Room cancel in `WaitingForOpponent` is terminal for that room and clears local active-room context before returning to lobby.
- On `won`/`finalize_win` path, client holds in UI `Finalized` until base confirms `PayoutSettled`.
- On reload, room state is reconstructed from subscriptions only and any in-flight mining state is re-rendered from chain state.
- If a mine tx stalls (no timely confirmation), the client automatically rolls back the optimistic hide and re-shows that block for retry; if chain state later confirms the same cell as mined, subscription state will hide it again deterministically.
