//! DataBard escrow — forked from solana_coralOS (Anchor 0.32.1).
//!
//! Buyer deposits SOL into a per-order escrow PDA. The seller commits a **manifest hash** of the
//! deliverable (the DataBard episode). The buyer releases funds only after commitment; refunds are
//! allowed after the deadline if the seller never committed / delivered.
//!
//! **DataBard delta vs. upstream:**
//! 1. `Escrow.deliverable_hash: Option<[u8; 32]>` — seller-committed proof of what was delivered.
//! 2. New instruction `commit_delivery(hash)` — signed by the seller.
//! 3. `release()` requires `deliverable_hash.is_some()` — funds don't move without proof.
//!
//! Security posture preserved from upstream:
//! - `init` (never `init_if_needed`) — no reinitialization attacks.
//! - PDA seeds bind (buyer, reference) — no shared-PDA "master key".
//! - `Signer` + `has_one` on every account — only real parties act.
//! - `close = buyer` on release/refund — rent returned safely, no revival.
//! - Checked math on every lamport move.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

// Program id of the devnet deployment. Run `anchor keys sync` after your first build to repoint.
declare_id!("ErwrNVN9DgGvPkHTm1KziXhHjWm6ehE2MUnsauYmfgdK");

#[program]
pub mod escrow {
    use super::*;

    /// Buyer deposits `amount` lamports into a per-order escrow, with a refund `deadline`.
    /// `reference` is the market Deal id (as a Pubkey) that ties this escrow to one WANT.
    pub fn initialize(
        ctx: Context<Initialize>,
        amount: u64,
        reference: Pubkey,
        deadline: i64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(deadline > Clock::get()?.unix_timestamp, EscrowError::DeadlineInPast);

        let escrow = &mut ctx.accounts.escrow;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.amount = amount;
        escrow.reference = reference;
        escrow.deadline = deadline;
        escrow.deliverable_hash = None;
        escrow.bump = ctx.bumps.escrow;

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    /// Seller commits the SHA-256 of the delivered episode manifest. The buyer's client verifies
    /// its downloaded audio matches this hash before calling `release`.
    ///
    /// This is DataBard's delta: settlement proves *what* was delivered, not just that it was paid.
    pub fn commit_delivery(ctx: Context<CommitDelivery>, hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.deliverable_hash.is_none(), EscrowError::AlreadyCommitted);
        escrow.deliverable_hash = Some(hash);
        Ok(())
    }

    /// Buyer confirms delivery → pay the seller. Requires the seller to have committed a hash.
    pub fn release(ctx: Context<Release>) -> Result<()> {
        require!(
            ctx.accounts.escrow.deliverable_hash.is_some(),
            EscrowError::NoDeliveryCommitment
        );

        let amount = ctx.accounts.escrow.amount;
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? = ctx
            .accounts
            .escrow
            .to_account_info()
            .lamports()
            .checked_sub(amount)
            .ok_or(EscrowError::Overflow)?;
        **ctx.accounts.seller.try_borrow_mut_lamports()? = ctx
            .accounts
            .seller
            .lamports()
            .checked_add(amount)
            .ok_or(EscrowError::Overflow)?;
        Ok(())
        // `close = buyer` (in the Accounts struct) returns remaining rent to the buyer.
    }

    /// Buyer reclaims the deposit after the deadline (seller never delivered).
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        require!(
            Clock::get()?.unix_timestamp >= ctx.accounts.escrow.deadline,
            EscrowError::BeforeDeadline
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, reference: Pubkey)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: only used as the payout destination on release; identity is bound into the escrow.
    pub seller: UncheckedAccount<'info>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", buyer.key().as_ref(), reference.as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitDelivery<'info> {
    /// The seller signs their delivery commitment — the buyer never sees a release without this.
    pub seller: Signer<'info>,
    #[account(
        mut,
        has_one = seller @ EscrowError::WrongSeller,
        seeds = [b"escrow", escrow.buyer.as_ref(), escrow.reference.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: must match the seller bound at initialize (enforced by `has_one`).
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        close = buyer,
        has_one = buyer @ EscrowError::WrongBuyer,
        has_one = seller @ EscrowError::WrongSeller,
        seeds = [b"escrow", buyer.key().as_ref(), escrow.reference.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        close = buyer,
        has_one = buyer @ EscrowError::WrongBuyer,
        seeds = [b"escrow", buyer.key().as_ref(), escrow.reference.as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub reference: Pubkey,
    pub deadline: i64,
    /// SHA-256 of the deliverable manifest — committed by the seller before release.
    /// `None` until `commit_delivery` is called. `release` requires `Some`.
    pub deliverable_hash: Option<[u8; 32]>,
    pub bump: u8,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Refund is only allowed at or after the deadline")]
    BeforeDeadline,
    #[msg("Buyer does not match the escrow")]
    WrongBuyer,
    #[msg("Seller does not match the escrow")]
    WrongSeller,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Seller has not yet committed a delivery hash")]
    NoDeliveryCommitment,
    #[msg("Delivery has already been committed for this escrow")]
    AlreadyCommitted,
}
