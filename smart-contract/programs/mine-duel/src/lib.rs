use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;
use session_keys::SessionToken;

declare_id!("4b2q3K4cgr1P8FkjbcQ8nssDxLb9dhdVgVtrknvn5igJ");

const SEED_ROOM: &[u8] = b"room";
const SEED_VAULT: &[u8] = b"vault";
const SEED_WINNER: &[u8] = b"winner";
const SEED_REVEAL: &[u8] = b"reveal";

pub const MAP_WIDTH: u8 = 16;
pub const MAP_DEPTH: u8 = 16;
pub const MAP_HEIGHT: u8 = 8;
pub const EXPOSED_LAYER_Y: u8 = 1;
pub const TOTAL_CELLS: usize = (MAP_WIDTH as usize) * (MAP_DEPTH as usize) * (MAP_HEIGHT as usize);
pub const BITSET_BYTES: usize = TOTAL_CELLS / 8;

#[ephemeral]
#[program]
pub mod mine_duel {
    use super::*;

    pub fn create_room(ctx: Context<CreateRoom>, stake_lamports: u64) -> Result<()> {
        require!(stake_lamports > 0, MineDuelError::InvalidStake);

        let room = &mut ctx.accounts.room;
        room.creator = ctx.accounts.creator.key();
        room.player_one = ctx.accounts.creator.key();
        room.player_two = Pubkey::default();
        room.winner = Pubkey::default();
        room.stake_lamports = stake_lamports;
        room.total_escrow_lamports = stake_lamports;
        room.mine_actions = 0;
        room.checkpoint_seq = 0;
        room.checkpoint_hash = [0u8; 32];
        room.last_action_slot = Clock::get()?.slot;
        room.status = RoomStatus::WaitingForOpponent;
        room.bump = ctx.bumps.room;

        let vault = &mut ctx.accounts.vault;
        vault.room = room.key();
        vault.bump = ctx.bumps.vault;

        let winner_state = &mut ctx.accounts.winner_state;
        winner_state.room = room.key();
        winner_state.vrf_requested = false;
        winner_state.vrf_fulfilled = false;
        winner_state.winner_cell = [0u8; 3];
        winner_state.randomness = [0u8; 32];
        winner_state.mined_mask = [0u8; BITSET_BYTES];
        winner_state.bump = ctx.bumps.winner_state;

        let p1_reveal = &mut ctx.accounts.player_one_reveal;
        p1_reveal.room = room.key();
        p1_reveal.owner = room.player_one;
        p1_reveal.revealed_mask = [0u8; BITSET_BYTES];
        p1_reveal.bump = ctx.bumps.player_one_reveal;
        p1_reveal.reveal_exposed_layer();

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            stake_lamports,
        )?;

        Ok(())
    }

    pub fn cancel_room_prejoin(ctx: Context<CancelRoomPrejoin>) -> Result<()> {
        let room = &ctx.accounts.room;
        require!(
            room.status == RoomStatus::WaitingForOpponent,
            MineDuelError::InvalidStatus
        );
        require_keys_eq!(
            room.creator,
            ctx.accounts.creator.key(),
            MineDuelError::Unauthorized
        );
        require_keys_eq!(
            room.player_two,
            Pubkey::default(),
            MineDuelError::InvalidStatus
        );
        Ok(())
    }

    pub fn join_room(ctx: Context<JoinRoom>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let player = ctx.accounts.player.key();

        require!(
            room.status == RoomStatus::WaitingForOpponent,
            MineDuelError::InvalidStatus
        );
        require_keys_neq!(player, room.player_one, MineDuelError::Unauthorized);
        require_keys_eq!(
            room.player_two,
            Pubkey::default(),
            MineDuelError::AlreadyJoined
        );

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            room.stake_lamports,
        )?;

        room.player_two = player;
        room.total_escrow_lamports = room
            .total_escrow_lamports
            .checked_add(room.stake_lamports)
            .ok_or(MineDuelError::Overflow)?;
        room.status = RoomStatus::WaitingForVrf;
        room.last_action_slot = Clock::get()?.slot;

        let p2_reveal = &mut ctx.accounts.player_two_reveal;
        p2_reveal.room = room.key();
        p2_reveal.owner = player;
        p2_reveal.revealed_mask = [0u8; BITSET_BYTES];
        p2_reveal.bump = ctx.bumps.player_two_reveal;
        p2_reveal.reveal_exposed_layer();

        Ok(())
    }

    pub fn delegate_private_state(ctx: Context<DelegatePrivateState>) -> Result<()> {
        let room_state = {
            let room_data = ctx.accounts.room.try_borrow_data()?;
            let mut room_data_slice: &[u8] = &room_data;
            RoomShared::try_deserialize(&mut room_data_slice)?
        };
        require!(
            room_state.status == RoomStatus::WaitingForVrf
                || room_state.status == RoomStatus::Active,
            MineDuelError::InvalidStatus
        );
        require_keys_neq!(
            room_state.player_two,
            Pubkey::default(),
            MineDuelError::PlayerTwoMissing
        );
        require_keys_eq!(
            room_state.creator,
            ctx.accounts.room_creator.key(),
            MineDuelError::Unauthorized
        );
        require_keys_eq!(
            room_state.player_one,
            ctx.accounts.player_one.key(),
            MineDuelError::Unauthorized
        );
        require_keys_eq!(
            room_state.player_two,
            ctx.accounts.player_two.key(),
            MineDuelError::Unauthorized
        );

        let maybe_validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        let room_key = ctx.accounts.room.key();

        ctx.accounts.delegate_room(
            &ctx.accounts.payer,
            &[SEED_ROOM, room_state.creator.as_ref()],
            DelegateConfig {
                validator: maybe_validator,
                ..Default::default()
            },
        )?;

        ctx.accounts.delegate_vault(
            &ctx.accounts.payer,
            &[SEED_VAULT, room_key.as_ref()],
            DelegateConfig {
                validator: maybe_validator,
                ..Default::default()
            },
        )?;

        ctx.accounts.delegate_winner_state(
            &ctx.accounts.payer,
            &[SEED_WINNER, room_key.as_ref()],
            DelegateConfig {
                validator: maybe_validator,
                ..Default::default()
            },
        )?;

        ctx.accounts.delegate_player_one_reveal(
            &ctx.accounts.payer,
            &[
                SEED_REVEAL,
                room_key.as_ref(),
                room_state.player_one.as_ref(),
            ],
            DelegateConfig {
                validator: maybe_validator,
                ..Default::default()
            },
        )?;

        ctx.accounts.delegate_player_two_reveal(
            &ctx.accounts.payer,
            &[
                SEED_REVEAL,
                room_key.as_ref(),
                room_state.player_two.as_ref(),
            ],
            DelegateConfig {
                validator: maybe_validator,
                ..Default::default()
            },
        )?;

        Ok(())
    }

    pub fn request_winner_vrf(ctx: Context<RequestWinnerVrf>, client_seed: u8) -> Result<()> {
        {
            let room = &ctx.accounts.room;
            let winner_state = &ctx.accounts.winner_state;
            require!(
                room.status == RoomStatus::WaitingForVrf,
                MineDuelError::InvalidStatus
            );
            require!(
                room.player_one == ctx.accounts.payer.key()
                    || room.player_two == ctx.accounts.payer.key(),
                MineDuelError::Unauthorized
            );
            require!(
                !winner_state.vrf_requested,
                MineDuelError::AlreadyVrfRequested
            );
        }

        let request_ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::ConsumeWinnerVrf::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: ctx.accounts.room.key(),
                    is_signer: false,
                    is_writable: true,
                },
                SerializableAccountMeta {
                    pubkey: ctx.accounts.winner_state.key(),
                    is_signer: false,
                    is_writable: true,
                },
            ]),
            ..Default::default()
        });

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &request_ix)?;

        ctx.accounts.winner_state.vrf_requested = true;
        ctx.accounts.room.last_action_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn consume_winner_vrf(ctx: Context<ConsumeWinnerVrf>, randomness: [u8; 32]) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let winner_state = &mut ctx.accounts.winner_state;

        require!(
            room.status == RoomStatus::WaitingForVrf,
            MineDuelError::InvalidStatus
        );
        require!(winner_state.vrf_requested, MineDuelError::VrfNotReady);
        require!(!winner_state.vrf_fulfilled, MineDuelError::InvalidStatus);

        let x = randomness[0] % MAP_WIDTH;
        let y = 2 + (randomness[1] % (MAP_HEIGHT - 2));
        let z = randomness[2] % MAP_DEPTH;

        winner_state.randomness = randomness;
        winner_state.winner_cell = [x, y, z];
        winner_state.vrf_fulfilled = true;

        room.status = RoomStatus::Active;
        room.last_action_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn mine(ctx: Context<Mine>, x: u8, y: u8, z: u8) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let winner_state = &mut ctx.accounts.winner_state;

        require!(
            room.status == RoomStatus::Active,
            MineDuelError::InvalidStatus
        );
        require!(winner_state.vrf_fulfilled, MineDuelError::VrfNotReady);

        let authority =
            resolve_action_authority(&ctx.accounts.session_token, &ctx.accounts.payer.key())?;
        check_session_token(
            ctx.accounts.session_token.as_ref(),
            &ctx.accounts.payer.key(),
            &authority,
        )?;

        let is_player_one = if authority == room.player_one {
            true
        } else if authority == room.player_two {
            false
        } else {
            return err!(MineDuelError::Unauthorized);
        };

        let idx = cell_index(x, y, z)?;
        require!(
            !winner_state.bit_is_set(idx),
            MineDuelError::CellAlreadyMined
        );
        winner_state.set_bit(idx);

        if is_player_one {
            reveal_from_mine(&mut ctx.accounts.player_one_reveal, x, y, z)?;
        } else {
            reveal_from_mine(&mut ctx.accounts.player_two_reveal, x, y, z)?;
        }

        room.mine_actions = room
            .mine_actions
            .checked_add(1)
            .ok_or(MineDuelError::Overflow)?;
        room.last_action_slot = Clock::get()?.slot;

        if winner_state.winner_cell == [x, y, z] {
            room.status = RoomStatus::Won;
            room.winner = authority;
        }

        Ok(())
    }

    pub fn commit_checkpoint(
        ctx: Context<CommitCheckpoint>,
        checkpoint_hash: [u8; 32],
    ) -> Result<()> {
        let room = &mut ctx.accounts.room;
        require!(
            room.player_one == ctx.accounts.payer.key()
                || room.player_two == ctx.accounts.payer.key(),
            MineDuelError::Unauthorized
        );
        require!(
            room.status == RoomStatus::Active || room.status == RoomStatus::Won,
            MineDuelError::InvalidStatus
        );

        room.checkpoint_seq = room
            .checkpoint_seq
            .checked_add(1)
            .ok_or(MineDuelError::Overflow)?;
        room.checkpoint_hash = checkpoint_hash;
        room.last_action_slot = Clock::get()?.slot;

        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.room.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }

    pub fn finalize_win(ctx: Context<FinalizeWin>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let vault_info = ctx.accounts.vault.to_account_info();
        let winner_info = ctx.accounts.winner.to_account_info();

        require!(room.status == RoomStatus::Won, MineDuelError::InvalidStatus);
        require_keys_eq!(
            room.winner,
            ctx.accounts.winner.key(),
            MineDuelError::Unauthorized
        );
        require!(room.total_escrow_lamports > 0, MineDuelError::InvalidStatus);

        let payout = room.total_escrow_lamports;
        let new_vault_lamports = vault_info
            .lamports()
            .checked_sub(payout)
            .ok_or(MineDuelError::Overflow)?;
        let new_winner_lamports = winner_info
            .lamports()
            .checked_add(payout)
            .ok_or(MineDuelError::Overflow)?;

        **vault_info.try_borrow_mut_lamports()? = new_vault_lamports;
        **winner_info.try_borrow_mut_lamports()? = new_winner_lamports;

        room.total_escrow_lamports = 0;
        room.status = RoomStatus::Finalized;
        room.last_action_slot = Clock::get()?.slot;

        commit_and_undelegate_accounts(
            &ctx.accounts.winner,
            vec![
                &ctx.accounts.room.to_account_info(),
                &ctx.accounts.vault.to_account_info(),
                &ctx.accounts.winner_state.to_account_info(),
                &ctx.accounts.player_one_reveal.to_account_info(),
                &ctx.accounts.player_two_reveal.to_account_info(),
            ],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateRoom<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + RoomShared::LEN,
        seeds = [SEED_ROOM, creator.key().as_ref()],
        bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        init,
        payer = creator,
        space = 8 + VaultEscrow::LEN,
        seeds = [SEED_VAULT, room.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultEscrow>,
    #[account(
        init,
        payer = creator,
        space = 8 + WinnerState::LEN,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump
    )]
    pub winner_state: Account<'info, WinnerState>,
    #[account(
        init,
        payer = creator,
        space = 8 + PlayerReveal::LEN,
        seeds = [SEED_REVEAL, room.key().as_ref(), creator.key().as_ref()],
        bump
    )]
    pub player_one_reveal: Account<'info, PlayerReveal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelRoomPrejoin<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        close = creator,
        seeds = [SEED_ROOM, creator.key().as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        mut,
        close = creator,
        seeds = [SEED_VAULT, room.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultEscrow>,
    #[account(
        mut,
        close = creator,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump = winner_state.bump
    )]
    pub winner_state: Account<'info, WinnerState>,
    #[account(
        mut,
        close = creator,
        seeds = [SEED_REVEAL, room.key().as_ref(), creator.key().as_ref()],
        bump = player_one_reveal.bump
    )]
    pub player_one_reveal: Account<'info, PlayerReveal>,
}

#[derive(Accounts)]
pub struct JoinRoom<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ROOM, room.creator.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        mut,
        seeds = [SEED_VAULT, room.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultEscrow>,
    #[account(
        mut,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump = winner_state.bump
    )]
    pub winner_state: Account<'info, WinnerState>,
    #[account(
        init,
        payer = player,
        space = 8 + PlayerReveal::LEN,
        seeds = [SEED_REVEAL, room.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_two_reveal: Account<'info, PlayerReveal>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePrivateState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: room creator key used as PDA seed authority check input.
    pub room_creator: UncheckedAccount<'info>,
    /// CHECK: player one key used as PDA seed authority check input.
    pub player_one: UncheckedAccount<'info>,
    /// CHECK: player two key used as PDA seed authority check input.
    pub player_two: UncheckedAccount<'info>,
    /// CHECK: Optional target validator for delegation.
    pub validator: Option<AccountInfo<'info>>,
    /// CHECK: Delegated shared room state.
    #[account(
        mut,
        del,
        seeds = [SEED_ROOM, room_creator.key().as_ref()],
        bump
    )]
    pub room: AccountInfo<'info>,
    /// CHECK: Delegated escrow account.
    #[account(
        mut,
        del,
        seeds = [SEED_VAULT, room.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,
    /// CHECK: Delegated private winner state.
    #[account(
        mut,
        del,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump
    )]
    pub winner_state: AccountInfo<'info>,
    /// CHECK: Delegated private reveal map for player one.
    #[account(
        mut,
        del,
        seeds = [SEED_REVEAL, room.key().as_ref(), player_one.key().as_ref()],
        bump
    )]
    pub player_one_reveal: AccountInfo<'info>,
    /// CHECK: Delegated private reveal map for player two.
    #[account(
        mut,
        del,
        seeds = [SEED_REVEAL, room.key().as_ref(), player_two.key().as_ref()],
        bump
    )]
    pub player_two_reveal: AccountInfo<'info>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestWinnerVrf<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ROOM, room.creator.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        mut,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump = winner_state.bump
    )]
    pub winner_state: Account<'info, WinnerState>,
    /// CHECK: VRF queue account validated by address.
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_EPHEMERAL_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ConsumeWinnerVrf<'info> {
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ROOM, room.creator.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        mut,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump = winner_state.bump
    )]
    pub winner_state: Account<'info, WinnerState>,
}

#[derive(Accounts)]
pub struct Mine<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ROOM, room.creator.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        mut,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump = winner_state.bump
    )]
    pub winner_state: Account<'info, WinnerState>,
    #[account(
        mut,
        seeds = [SEED_REVEAL, room.key().as_ref(), room.player_one.as_ref()],
        bump = player_one_reveal.bump
    )]
    pub player_one_reveal: Account<'info, PlayerReveal>,
    #[account(
        mut,
        seeds = [SEED_REVEAL, room.key().as_ref(), room.player_two.as_ref()],
        bump = player_two_reveal.bump
    )]
    pub player_two_reveal: Account<'info, PlayerReveal>,
    pub session_token: Option<Account<'info, SessionToken>>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitCheckpoint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ROOM, room.creator.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
}

#[commit]
#[derive(Accounts)]
pub struct FinalizeWin<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_ROOM, room.creator.as_ref()],
        bump = room.bump
    )]
    pub room: Account<'info, RoomShared>,
    #[account(
        mut,
        seeds = [SEED_VAULT, room.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultEscrow>,
    #[account(
        mut,
        seeds = [SEED_WINNER, room.key().as_ref()],
        bump = winner_state.bump
    )]
    pub winner_state: Account<'info, WinnerState>,
    #[account(
        mut,
        seeds = [SEED_REVEAL, room.key().as_ref(), room.player_one.as_ref()],
        bump = player_one_reveal.bump
    )]
    pub player_one_reveal: Account<'info, PlayerReveal>,
    #[account(
        mut,
        seeds = [SEED_REVEAL, room.key().as_ref(), room.player_two.as_ref()],
        bump = player_two_reveal.bump
    )]
    pub player_two_reveal: Account<'info, PlayerReveal>,
}

#[account]
pub struct RoomShared {
    pub creator: Pubkey,
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub winner: Pubkey,
    pub stake_lamports: u64,
    pub total_escrow_lamports: u64,
    pub mine_actions: u64,
    pub checkpoint_seq: u64,
    pub checkpoint_hash: [u8; 32],
    pub last_action_slot: u64,
    pub status: RoomStatus,
    pub bump: u8,
}

impl RoomShared {
    pub const LEN: usize = (32 * 4) + (8 * 5) + 32 + 1 + 1;
}

#[account]
pub struct VaultEscrow {
    pub room: Pubkey,
    pub bump: u8,
}

impl VaultEscrow {
    pub const LEN: usize = 32 + 1;
}

#[account]
pub struct WinnerState {
    pub room: Pubkey,
    pub vrf_requested: bool,
    pub vrf_fulfilled: bool,
    pub winner_cell: [u8; 3],
    pub randomness: [u8; 32],
    pub mined_mask: [u8; BITSET_BYTES],
    pub bump: u8,
}

impl WinnerState {
    pub const LEN: usize = 32 + 1 + 1 + 3 + 32 + BITSET_BYTES + 1;

    pub fn bit_is_set(&self, idx: usize) -> bool {
        let byte = idx / 8;
        let shift = idx % 8;
        (self.mined_mask[byte] & (1u8 << shift)) != 0
    }

    pub fn set_bit(&mut self, idx: usize) {
        let byte = idx / 8;
        let shift = idx % 8;
        self.mined_mask[byte] |= 1u8 << shift;
    }
}

#[account]
pub struct PlayerReveal {
    pub room: Pubkey,
    pub owner: Pubkey,
    pub revealed_mask: [u8; BITSET_BYTES],
    pub bump: u8,
}

impl PlayerReveal {
    pub const LEN: usize = 32 + 32 + BITSET_BYTES + 1;

    pub fn set_revealed(&mut self, idx: usize) {
        let byte = idx / 8;
        let shift = idx % 8;
        self.revealed_mask[byte] |= 1u8 << shift;
    }

    pub fn reveal_exposed_layer(&mut self) {
        let y = EXPOSED_LAYER_Y as i16;
        for x in 0..(MAP_WIDTH as i16) {
            for z in 0..(MAP_DEPTH as i16) {
                if let Ok(idx) = cell_index_i16(x, y, z) {
                    self.set_revealed(idx);
                }
            }
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RoomStatus {
    WaitingForOpponent,
    WaitingForVrf,
    Active,
    Won,
    Finalized,
    Cancelled,
}

fn resolve_action_authority(
    session_token: &Option<Account<SessionToken>>,
    payer: &Pubkey,
) -> Result<Pubkey> {
    if let Some(token) = session_token {
        Ok(token.authority)
    } else {
        Ok(*payer)
    }
}

fn check_session_token(
    session_token: Option<&Account<SessionToken>>,
    payer: &Pubkey,
    authority: &Pubkey,
) -> Result<()> {
    if let Some(token) = session_token {
        require_keys_eq!(
            token.authority,
            *authority,
            MineDuelError::InvalidSessionToken
        );

        let expected_seeds = &[
            SessionToken::SEED_PREFIX.as_bytes(),
            ID.as_ref(),
            payer.as_ref(),
            authority.as_ref(),
        ];
        let (expected_pda, _) = Pubkey::find_program_address(expected_seeds, &session_keys::id());
        require_keys_eq!(
            expected_pda,
            token.key(),
            MineDuelError::InvalidSessionToken
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now < token.valid_until, MineDuelError::InvalidSessionToken);
    } else {
        require_keys_eq!(*authority, *payer, MineDuelError::InvalidSessionToken);
    }
    Ok(())
}

fn reveal_from_mine(reveal: &mut Account<PlayerReveal>, x: u8, y: u8, z: u8) -> Result<()> {
    let x = x as i16;
    let y = y as i16;
    let z = z as i16;
    let offsets: [(i16, i16, i16); 7] = [
        (0, 0, 0),
        (1, 0, 0),
        (-1, 0, 0),
        (0, 1, 0),
        (0, -1, 0),
        (0, 0, 1),
        (0, 0, -1),
    ];

    for (dx, dy, dz) in offsets {
        if let Ok(idx) = cell_index_i16(x + dx, y + dy, z + dz) {
            reveal.set_revealed(idx);
        }
    }

    Ok(())
}

fn cell_index(x: u8, y: u8, z: u8) -> Result<usize> {
    cell_index_i16(x as i16, y as i16, z as i16)
}

fn cell_index_i16(x: i16, y: i16, z: i16) -> Result<usize> {
    if x < 0
        || y < 0
        || z < 0
        || x >= MAP_WIDTH as i16
        || y >= MAP_HEIGHT as i16
        || z >= MAP_DEPTH as i16
    {
        return err!(MineDuelError::InvalidCoordinate);
    }
    let idx =
        ((y as usize) * (MAP_DEPTH as usize) + (z as usize)) * (MAP_WIDTH as usize) + (x as usize);
    Ok(idx)
}

#[error_code]
pub enum MineDuelError {
    #[msg("Invalid status transition for this instruction.")]
    InvalidStatus,
    #[msg("Stake must be greater than zero.")]
    InvalidStake,
    #[msg("Unauthorized caller for this action.")]
    Unauthorized,
    #[msg("Overflow while updating state.")]
    Overflow,
    #[msg("Second player is required for this operation.")]
    PlayerTwoMissing,
    #[msg("Room already has two players.")]
    AlreadyJoined,
    #[msg("Invalid coordinate.")]
    InvalidCoordinate,
    #[msg("Cell was already mined.")]
    CellAlreadyMined,
    #[msg("VRF has already been requested.")]
    AlreadyVrfRequested,
    #[msg("VRF winner cell is not ready.")]
    VrfNotReady,
    #[msg("Invalid or expired session token.")]
    InvalidSessionToken,
}
