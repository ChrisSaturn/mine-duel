# mine-duel

## Project Summary

Mine Duel is a two-player on-chain mining duel on Solana. Players stake into shared escrow, mine hidden coordinates on a fixed `16x16x8` map, and the winner takes the full pot. The design keeps public lifecycle/escrow state on base Solana while routing fast gameplay state through MagicBlock lanes.

### How we use MagicBlock, ER, VRF, and TEE

- MagicBlock:
  - Provides the runtime model we use for low-latency gameplay (`Ephemeral Rollups`), session-key UX for repeated actions, and VRF + TEE tooling in the same stack.
- ER (Ephemeral Rollup):
  - We delegate private match accounts (`RoomShared`, `VaultEscrow`, `WinnerState`, `PlayerReveal`) from base layer to ER, run gameplay actions there (`request_winner_vrf`, `mine`, `finalize_win`), then commit/undelegate back to base for payout settlement.
- VRF:
  - After both players join, `request_winner_vrf` is executed on ER and callback `consume_winner_vrf` derives the secret winning cell from randomness. This prevents either player from precomputing or biasing winner location.
- TEE:
  - We verify TEE RPC integrity and support token-authenticated TEE access for confidential/permissioned flows. In v1, canonical gameplay writes still go through the ER router; TEE is used for integrity/auth checks and private-access capability rather than the default write path.

## Architecture Docs

- [`MAGICBLOCK-PLAYBOOK.MD`](./MAGICBLOCK-PLAYBOOK.MD): Solana + MagicBlock implementation playbook.
- [`smart-contract/ARCHITECTURE.MD`](./smart-contract/ARCHITECTURE.MD): on-chain account model, instruction router split, state transitions, and security controls.
- [`smart-contract/ONCHAIN-VERIFICATION.MD`](./smart-contract/ONCHAIN-VERIFICATION.MD): v1 verification chain, evidence, and negative-case matrix.
- [`client/fps-boilerplate/CLIENT-GAMEPLAY-ARCHITECTURE.MD`](./client/fps-boilerplate/CLIENT-GAMEPLAY-ARCHITECTURE.MD): client control plane: room-code flow, ER/base routing, session key lifecycle, and gameplay state transitions.
- [`client/fps-boilerplate/README.md`](./client/fps-boilerplate/README.md): active client prototype architecture and runtime notes.
- [`client/fps-boilerplate/DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md`](./client/fps-boilerplate/DIGGERS_UNITY6_FIRST_PERSON_CONTROLLER_REFERENCE.md): Unity 6 first-person controller parity reference and Three.js port formulas for camera, movement, animation, mining, and shader behavior.
