# MAGICBLOCK PLAYBOOK

Practical implementation guide for MagicBlock patterns used in this workspace.

Last updated: 2026-03-22

## Why this file exists

This playbook consolidates common, repeatable implementations across:

- MagicBlock skill docs in [`SKILLS/magicblock-dev-skill-main/`](./SKILLS/magicblock-dev-skill-main/)
- Solana game examples in [`references/solana-game-examples-main/`](./references/solana-game-examples-main/)
- Official MagicBlock documentation (links at the end)

It is intended to be copy/paste-ready for:

- Session keys
- Delegation to Ephemeral Rollups (ER)
- Private ER (TEE) access flow
- Commit + undelegate patterns

## Architecture Quick Map

Use this routing model consistently:

| Operation | Where to send tx | Why |
| --- | --- | --- |
| Init account / create PDA | Base layer (Solana RPC) | Account is not delegated yet |
| Delegate account | Base layer (Solana RPC) | Ownership handoff happens on L1 |
| Mutate delegated state | ER / Router RPC | Low-latency execution |
| Commit state (keep delegated) | ER / Router RPC | Sync delegated state to L1 |
| Commit + undelegate | ER / Router RPC | Finalize + return ownership |
| TEE reads/writes (private) | TEE endpoint with auth token | Permissioned confidential access |

## 1) Session Keys

### 1.1 Program-side pattern (Anchor)

Reference implementations:

- [`references/solana-game-examples-main/lumberjack/program/programs/lumberjack/src/lib.rs`](./references/solana-game-examples-main/lumberjack/program/programs/lumberjack/src/lib.rs)
- [`references/solana-game-examples-main/lumberjack/program/programs/lumberjack/src/instructions/chop_tree.rs`](./references/solana-game-examples-main/lumberjack/program/programs/lumberjack/src/instructions/chop_tree.rs)
- [`references/solana-game-examples-main/city-builder/program/programs/lumberjack/src/lib.rs`](./references/solana-game-examples-main/city-builder/program/programs/lumberjack/src/lib.rs)

Core shape:

```rust
use session_keys::{session_auth_or, Session, SessionError, SessionToken};

#[session_auth_or(
    ctx.accounts.player.authority.key() == ctx.accounts.signer.key(),
    SessionError::InvalidToken
)]
pub fn game_action(ctx: Context<GameAction>) -> Result<()> {
    // ...
    Ok(())
}

#[derive(Accounts, Session)]
pub struct GameAction<'info> {
    #[session(
        signer = signer,
        authority = player.authority.key()
    )]
    pub session_token: Option<Account<'info, SessionToken>>,

    #[account(mut)]
    pub player: Account<'info, PlayerData>,

    #[account(mut)]
    pub signer: Signer<'info>,
}
```

What this gives you:

- If `session_token` is valid and in scope, ephemeral signer can execute.
- Otherwise fallback requires main-wallet authority match.
- UX improves for high-frequency actions (no wallet popup every move).

### 1.2 Client-side pattern (React)

Reference implementations:

- [`references/solana-game-examples-main/lumberjack/app/contexts/SessionProvider.tsx`](./references/solana-game-examples-main/lumberjack/app/contexts/SessionProvider.tsx)
- [`references/solana-game-examples-main/lumberjack/app/components/SessionKeyButton.tsx`](./references/solana-game-examples-main/lumberjack/app/components/SessionKeyButton.tsx)
- [`references/solana-game-examples-main/lumberjack/app/components/ChopTreeButton.tsx`](./references/solana-game-examples-main/lumberjack/app/components/ChopTreeButton.tsx)

Provider setup:

```ts
import { SessionWalletProvider, useSessionKeyManager } from "@magicblock-labs/gum-react-sdk";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";

const { connection } = useConnection();
const anchorWallet = useAnchorWallet();
const sessionWallet = useSessionKeyManager(anchorWallet, connection, "devnet");
```

Create / use / revoke:

```ts
// Create session (top-up enabled)
await sessionWallet.createSession(program.programId, true, 60);

// Sign and send with session signer
const txids = await sessionWallet.signAndSendTransaction(transaction);

// Revoke and return lamports
await sessionWallet.revokeSession();
```

Important notes:

- Top-up is typically small (docs describe 0.01 SOL default style flows).
- Session token is scoped and expires; it is not a burner wallet replacement.
- Program must enforce scope with `session_auth_or` and account constraints.

### 1.3 Session security model (operational)

From official docs:

- Ephemeral keypair is encrypted and stored in browser IndexedDB.
- Token has scope + expiry, and is revokable.
- Threat model assumes browser is adversarial; keep session balances small.

Operational policy recommendation:

- Keep sessions short-lived (e.g., 30-120 minutes for active play).
- Restrict high-value instructions to main wallet signer only.
- Keep session top-up minimal if you are not using a gasless relay.

## 2) Delegating to Ephemeral Rollups (ER)

### 2.1 Program-side delegation hooks

Source references:

- [`SKILLS/magicblock-dev-skill-main/skill/delegation.md`](./SKILLS/magicblock-dev-skill-main/skill/delegation.md)
- [`SKILLS/magicblock-dev-skill-main/skill/typescript-setup.md`](./SKILLS/magicblock-dev-skill-main/skill/typescript-setup.md)

Canonical imports/macros:

```rust
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};

#[ephemeral]
#[program]
pub mod my_program { /* ... */ }
```

Delegate instruction pattern:

```rust
#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: checked by delegation program
    pub validator: Option<AccountInfo<'info>>,
    /// CHECK: delegated account
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
    ctx.accounts.delegate_pda(
        &ctx.accounts.payer,
        &[b"seed"],
        DelegateConfig {
            validator: ctx.accounts.validator.as_ref().map(|v| v.key()),
            ..Default::default()
        },
    )?;
    Ok(())
}
```

Commit / undelegate patterns:

```rust
// Commit only
commit_accounts(
    &ctx.accounts.payer,
    vec![&ctx.accounts.my_account.to_account_info()],
    &ctx.accounts.magic_context,
    &ctx.accounts.magic_program,
)?;

// Commit + undelegate
commit_and_undelegate_accounts(
    &ctx.accounts.payer,
    vec![&ctx.accounts.my_account.to_account_info()],
    &ctx.accounts.magic_context,
    &ctx.accounts.magic_program,
)?;
```

### 2.2 Client-side routing and transaction sending

Use explicit dual connections:

```ts
const baseConnection = new Connection("https://api.devnet.solana.com");
const erConnection = new Connection("https://devnet.magicblock.app/", {
  wsEndpoint: "wss://devnet.magicblock.app/",
});
```

Routing policy:

- Delegate -> send via base connection.
- Delegated account operations -> send via ER/router connection.
- Commit/undelegate -> send via ER connection.

For on-curve account delegation, include:

1. Assign to delegation program.
2. Delegate instruction.

Use `skipPreflight: true` on ER paths per MagicBlock examples.

### 2.3 Validator targeting

When delegating, set the specific validator for your region/environment.

Known IDs from MagicBlock docs include:

- Devnet TEE validator: `FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA`
- Mainnet TEE validator: `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`
- Local ER validator: `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`

## 3) Private ER (TEE) - How it works

This is the practical flow for confidential account access:

1. Define permissioned accounts on L1 using Permission Program.
2. Delegate both permission accounts and permissioned accounts to ER validator.
3. Client attests TEE RPC integrity.
4. Client requests challenge + signs it to get auth token.
5. Client connects to TEE RPC using `?token=...`.
6. Execute private operations, then commit + undelegate back to base layer.

### 3.1 Attestation and auth token

From official client implementation:

```ts
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
} from "@magicblock-labs/ephemeral-rollups-sdk";

const ok = await verifyTeeRpcIntegrity(PRIVATE_ER_URL);
if (!ok) throw new Error("TEE attestation failed");

const token = await getAuthToken(PRIVATE_ER_URL, publicKey, signMessage);
const teeConnection = new Connection(`${PRIVATE_ER_URL}?token=${token}`, "confirmed");
```

### 3.2 Permission lifecycle (minimum)

From Access Control / PER docs:

1. Create permission/group for target account(s).
2. Delegate permission + permissioned account to ER.
3. Update members/flags as needed.
4. Verify TEE + obtain token before access.
5. Commit & undelegate.
6. Optionally close permission accounts.

### 3.3 Member flags concept

Permission flags are bitmasks (examples include authority/logs/balances/message/signatures visibility).
Use these to shape who can see or operate on private state.

## 4) Compatibility notes from local examples

The `solana-game-examples` references here are useful patterns but versions are older:

- `lumberjack` program uses `anchor-lang = 0.29.0` and `session-keys = 2.0.3`.
- `city-builder` program uses `anchor-lang = 0.28.0` and `gpl-session = 2.0.0`.

MagicBlock skill references newer stack examples:

- Anchor `0.32.1`
- `ephemeral-rollups-sdk` `0.6.5`

Recommendation:

- Treat game-example code as implementation patterns.
- Align final project dependencies to a single modern version set before production.

## 5) Common gotchas checklist

- Missing `#[ephemeral]` macro on program module.
- Seeds mismatch between account definition and delegate call.
- Sending delegate tx to ER instead of base layer.
- Sending delegated-account ops to base layer instead of ER.
- Forgetting to pass `session_token` optional account in session-enabled ix.
- Not revoking sessions on logout/session end.
- Not verifying TEE integrity before requesting PER auth token.
- Forgetting to append `?token=...` to TEE RPC URL.
- Delegating permissioned account but not permission account (PER access fails).
- Multi-account delegation can exceed default `200,000` CU; include `ComputeBudgetProgram.setComputeUnitLimit(...)` on the delegation tx.

## 6) Project docs chain

This playbook is intended to sit alongside existing architecture docs:

- [`client/fps-boilerplate/README.md`](./client/fps-boilerplate/README.md)
- [`client/fps-boilerplate/ASSET_FLOW.md`](./client/fps-boilerplate/ASSET_FLOW.md)
- [`client/fps-boilerplate/EDITOR_WORKFLOW.md`](./client/fps-boilerplate/EDITOR_WORKFLOW.md)
- [`client/fps-boilerplate/FIRST_PERSON_CONTROLLER_ALIGNMENT.md`](./client/fps-boilerplate/FIRST_PERSON_CONTROLLER_ALIGNMENT.md)

## 7) Primary references

Local references reviewed:

- [`SKILLS/magicblock-dev-skill-main/skill/SKILL.md`](./SKILLS/magicblock-dev-skill-main/skill/SKILL.md)
- [`SKILLS/magicblock-dev-skill-main/skill/delegation.md`](./SKILLS/magicblock-dev-skill-main/skill/delegation.md)
- [`SKILLS/magicblock-dev-skill-main/skill/typescript-setup.md`](./SKILLS/magicblock-dev-skill-main/skill/typescript-setup.md)
- [`SKILLS/magicblock-dev-skill-main/skill/cranks.md`](./SKILLS/magicblock-dev-skill-main/skill/cranks.md)
- [`SKILLS/magicblock-dev-skill-main/skill/vrf.md`](./SKILLS/magicblock-dev-skill-main/skill/vrf.md)
- [`SKILLS/magicblock-dev-skill-main/skill/resources.md`](./SKILLS/magicblock-dev-skill-main/skill/resources.md)
- [`references/solana-game-examples-main/README.md`](./references/solana-game-examples-main/README.md)
- [`references/solana-game-examples-main/lumberjack/README.md`](./references/solana-game-examples-main/lumberjack/README.md)
- [`references/solana-game-examples-main/city-builder/README.md`](./references/solana-game-examples-main/city-builder/README.md)

Official references reviewed:

- https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart
- https://docs.magicblock.gg/pages/tools/session-keys/integrating-sessions-in-your-program
- https://docs.magicblock.gg/pages/tools/session-keys/session-provider-and-context
- https://docs.magicblock.gg/pages/tools/session-keys/usage-examples
- https://docs.magicblock.gg/pages/tools/session-keys/security
- https://docs.magicblock.gg/pages/tools/tee/client-implementation
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/access-control
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/onchain-privacy
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/authorization
- https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/compliance-framework

## 8) Mine Duel Architecture + Tx Routing

This workspace now includes a v1 on-chain Mine Duel program at:

- [`smart-contract/programs/mine-duel/src/lib.rs`](./smart-contract/programs/mine-duel/src/lib.rs)

Related architecture docs:

- [`smart-contract/ARCHITECTURE.MD`](./smart-contract/ARCHITECTURE.MD)
- [`smart-contract/ONCHAIN-VERIFICATION.MD`](./smart-contract/ONCHAIN-VERIFICATION.MD)

### 8.1 Locked gameplay constraints

- Fixed mine volume is compile-time constant (`16x16x8`), not an instruction parameter.
- `Y=1` layer is globally exposed to both players.
- Gameplay action is coordinate mining (`mine(x,y,z)`), no movement state in v1.
- Fog-of-war reveal is caller-only and reveals mined cell + six axis neighbors.

### 8.2 State split used by Mine Duel

- Shared/public: `RoomShared`
  - players, status, escrow totals, checkpoint hash/seq, mine count.
- Private: `WinnerState`
  - VRF lifecycle, winner cell, randomness snapshot, global mined-cell bitset.
- Private (per-player): `PlayerReveal`
  - per-player reveal masks for fog-of-war.

### 8.3 Instruction map (implemented)

- `create_room`
- `cancel_room_prejoin`
- `join_room`
- `delegate_private_state`
- `request_winner_vrf`
- `consume_winner_vrf`
- `mine`
- `commit_checkpoint`
- `finalize_win`
- `settle_win_payout`

### 8.4 Routing policy for Mine Duel

| Action | Route |
| --- | --- |
| `create_room` / `cancel_room_prejoin` / `join_room` | Base layer RPC |
| `delegate_private_state` | Base layer RPC |
| `request_winner_vrf` / `consume_winner_vrf` | ER Router (`https://devnet.magicblock.app/`) |
| `mine` / `commit_checkpoint` / `finalize_win` | ER Router (`https://devnet.magicblock.app/`) |
| `settle_win_payout` | Base layer RPC (after ownership returns from delegation) |

### 8.5 Session + privacy policy

- `mine` accepts optional `SessionToken` and validates:
  - authority binding,
  - token PDA derivation,
  - token expiry.
- Without a token, signer must be the authority.
- Winner location is only set after VRF callback and is kept in private delegated state.

### 8.6 Latest Full Devnet E2E (2026-03-22 UTC)

Program + deploy:
- Program id: `4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ`
- Latest successful deploy: `FxxPi53ZeCbZW4i5RTKtHocTQpdARN3Cx53nut3BMzynMvdivnGXK4o3cyNyQWUkyz4y1jX85qkbJCmcTmoQNEg`

Primary signatures:
- `create_room`: `3jkZnjd1prsy1jMDPu48bRj2Q1qjndo9XnT5oLWAZG8Kyh16ftXrg6PqkJpSsh4MnzmghumQUz3WA3HqA9d5dPPK`
- `join_room`: `65FGWHXFMwPb35UAKsNgfGo6pnL6f2C4iJQ1fgmyXvxKEd5JwNucQD6jzGx9WtafaREokf7v2fdBYq5AkV8TkSKy`
- `delegate_private_state`: `2UE5sDeGU79kT6RigUVTJ1BrZmbQebwBnRti9VzRvcsZZ2tWKhHEJbxubHxLvTrCdyKTJe92M2tQD4BbuXMiyS1n`
- `request_winner_vrf`: `2voP6zWGba55E16rRNPYYawRMsbg6FShzKHWnQUgA1rfN6T6v5PyPLSy6SUBNAyjaPMf5Hb1MFf4iHyuMamdJqjQ`
- `mine` (first two): `66G5BPSuSFhkTWFSQN6HwSR4SKxDzwSqbc4dvKYrVgbzy4TExuzxq7EKseFpCs5AS4inYvVeqFGkE5BJUs5SDCMC`, `3TzEpFMn3aCYwUtdTG5h16ZZzRkrnVVmpuKCsxJzih5eTwhDa18yXRaegPKNvJb17sqYCaKznmrrpirxA4R4KPtZ`
- winning mine: `5p3u4kDXhcZu9fN2kvpfN5h99ez1TmEJr2w8D4ZPxDTz2wPqDdqCNDX4VcykybKY8J4znWwapjMGFC5LPgfc8VKv`
- `finalize_win`: `XhJG89EFEePM4GAu7X5FZaMz3jXEHuoDVgsD7dPHDN12jkHQCxzKHzJRxAfhsQhrEWqS6jmHpFmTTmhCzEAJYem`
- `settle_win_payout`: `Q8xdzyf5KmEsVmSsA5svvdjJpBiRuaogzuXwJ8S6h3vzMrJ76zwCk9FinGsVs5F1mNTcBLYDX4xnzknesHyXqh8`

Observed state transitions:
- `WaitingForOpponent -> WaitingForVrf -> Active -> Won -> Finalized`

Owner checks:
- After delegate: room/vault/winner/reveal owners were all `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`.
- After finalize + settlement: those owners returned to `4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ`.

Routing notes:
- Startup lane heads in the passing run: `erSlot=285686607`, `baseSlot=450288113` (expected lane divergence).
- TEE endpoint was attested (`verifyTeeRpcIntegrity=true`) but gameplay writes were routed through ER router, not direct TEE RPC.
