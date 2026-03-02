use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR");

// ═══════════════════════════════════════════════════════
//  CONSTANTS — Your D3x Coin mint & protocol authority
// ═══════════════════════════════════════════════════════
pub const D3X_MINT: &str = "AGN8SrMCMEgiP1ghvPHa5VRf5rPFDSYVrGFyBGE1Cqpa";
pub const MAX_FEE_BPS: u16 = 500; // Max 5% fee to prevent abuse

#[program]
pub mod tweet_predict {
    use super::*;

    // ─────────────────────────────────────────────────
    //  INITIALIZE PROTOCOL — one-time setup by owner
    //  Creates the global treasury vault that collects
    //  all protocol fees across every market.
    // ─────────────────────────────────────────────────
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, fee_bps: u16, oracle: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, ErrorCode::FeeTooHigh);

        let protocol = &mut ctx.accounts.protocol_state;
        protocol.authority = ctx.accounts.authority.key();
        protocol.oracle = oracle;
        protocol.treasury_vault = ctx.accounts.treasury_vault.key();
        protocol.fee_bps = fee_bps;
        protocol.total_fees_collected = 0;
        protocol.total_markets_created = 0;
        protocol.total_volume = 0;

        Ok(())
    }

    // ─────────────────────────────────────────────────
    //  UPDATE FEE — owner can adjust the protocol fee
    // ─────────────────────────────────────────────────
    pub fn update_fee(ctx: Context<UpdateProtocol>, new_fee_bps: u16) -> Result<()> {
        require!(new_fee_bps <= MAX_FEE_BPS, ErrorCode::FeeTooHigh);
        ctx.accounts.protocol_state.fee_bps = new_fee_bps;
        Ok(())
    }

    // ─────────────────────────────────────────────────
    //  WITHDRAW TREASURY — owner pulls collected fees
    // ─────────────────────────────────────────────────
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
        let seeds = &[b"protocol" as &[u8], &[ctx.bumps.protocol_state]];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_vault.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.protocol_state.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        Ok(())
    }

    // ─────────────────────────────────────────────────
    //  CREATE MARKET
    //  question_hash: sha256(question) — used for PDA
    //  question, description: stored in account data
    // ─────────────────────────────────────────────────
    pub fn create_market(
        ctx: Context<CreateMarket>,
        _question_hash: [u8; 32],   // used by #[instruction] for PDA seeds only
        question: String,
        description: String,
        end_timestamp: i64,
        resolution_window: i64,
    ) -> Result<()> {
        require!(question.len() <= 280, ErrorCode::QuestionTooLong);

        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.resolver = ctx.accounts.protocol_state.oracle;
        market.question = question;
        market.description = description;
        market.end_timestamp = end_timestamp;
        market.resolution_timestamp = end_timestamp + resolution_window;
        market.status = MarketStatus::Active;
        market.total_yes = 0;
        market.total_no = 0;
        market.total_fees_collected = 0;
        market.yes_vault = ctx.accounts.yes_vault.key();
        market.no_vault = ctx.accounts.no_vault.key();
        market.mint = ctx.accounts.mint.key();
        // Store bump so claim_winnings can reconstruct signer without re-computing hash
        market.bump = ctx.bumps.market;

        // Increment global counter
        let protocol = &mut ctx.accounts.protocol_state;
        protocol.total_markets_created += 1;

        Ok(())
    }

    // ─────────────────────────────────────────────────
    //  PLACE BET — with automatic fee deduction
    //
    //  Flow: User sends `amount` of D3X
    //    → half of fee (1%) goes to Treasury Vault (protocol)
    //    → other half (1%) goes to the market creator's wallet
    //    → `net_amount` goes to YES/NO Vault
    // ─────────────────────────────────────────────────
    pub fn place_bet(ctx: Context<PlaceBet>, side: bool, amount: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let protocol = &mut ctx.accounts.protocol_state;
        let clock = Clock::get()?;

        require!(market.status == MarketStatus::Active, ErrorCode::MarketNotActive);
        require!(clock.unix_timestamp < market.end_timestamp, ErrorCode::BettingClosed);
        require!(amount > 0, ErrorCode::ZeroAmount);

        // ── Calculate fees — total fee split 50/50 between protocol & creator ──
        let total_fee = (amount as u128)
            .checked_mul(protocol.fee_bps as u128).unwrap()
            .checked_div(10_000).unwrap() as u64;
        let protocol_fee = total_fee / 2;
        let creator_fee = total_fee - protocol_fee; // handles odd numbers correctly
        let net_amount = amount.checked_sub(total_fee).unwrap();

        // ── Step 1a: Transfer PROTOCOL FEE to Treasury Vault ──
        if protocol_fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_token_account.to_account_info(),
                        to: ctx.accounts.treasury_vault.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                protocol_fee,
            )?;
            protocol.total_fees_collected += protocol_fee;
            market.total_fees_collected += protocol_fee;
        }

        // ── Step 1b: Transfer CREATOR FEE directly to creator's token account ──
        if creator_fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.user_token_account.to_account_info(),
                        to: ctx.accounts.creator_vault.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                creator_fee,
            )?;
            market.creator_fee_earned += creator_fee;
        }

        // ── Step 2: Transfer NET AMOUNT to the bet vault ──
        let destination_vault = if side {
            ctx.accounts.yes_vault.to_account_info()
        } else {
            ctx.accounts.no_vault.to_account_info()
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: destination_vault,
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            net_amount,
        )?;

        // ── Step 3: Update position & market totals ──
        let position = &mut ctx.accounts.position;
        if position.market == Pubkey::default() {
            position.market = market.key();
            position.user = ctx.accounts.user.key();
        }

        if side {
            market.total_yes += net_amount;
            position.yes_amount += net_amount;
        } else {
            market.total_no += net_amount;
            position.no_amount += net_amount;
        }

        // Track global volume (gross amount including fee)
        protocol.total_volume += amount;

        Ok(())
    }

    // ─────────────────────────────────────────────────
    //  RESOLVE MARKET
    // ─────────────────────────────────────────────────
    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: bool) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;

        require!(market.status == MarketStatus::Active, ErrorCode::MarketNotActive);
        require!(clock.unix_timestamp >= market.end_timestamp, ErrorCode::EndTimestampNotReached);

        market.status = MarketStatus::Resolved { outcome };

        Ok(())
    }

    // ─────────────────────────────────────────────────
    //  CLAIM WINNINGS — proportional payout from
    //  the losing side's vault (fees already taken)
    // ─────────────────────────────────────────────────
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;

        let outcome = match market.status {
            MarketStatus::Resolved { outcome } => outcome,
            _ => return Err(ErrorCode::MarketNotResolved.into()),
        };

        let winnings = if outcome {
            // YES won — winner gets stake + share of NO pool
            require!(position.yes_amount > 0, ErrorCode::NoWinnings);
            let share = (position.yes_amount as u128)
                .checked_mul(market.total_no as u128).unwrap()
                .checked_div(market.total_yes as u128).unwrap();
            position.yes_amount + (share as u64)
        } else {
            // NO won — winner gets stake + share of YES pool
            require!(position.no_amount > 0, ErrorCode::NoWinnings);
            let share = (position.no_amount as u128)
                .checked_mul(market.total_yes as u128).unwrap()
                .checked_div(market.total_no as u128).unwrap();
            position.no_amount + (share as u64)
        };

        let market_key = ctx.accounts.market.key();
        let market_bump = ctx.accounts.market.bump;
        let q_hash = anchor_lang::solana_program::hash::hash(ctx.accounts.market.question.as_bytes());
        let q_hash_bytes = q_hash.to_bytes();
        let seeds = &[
            b"market" as &[u8],
            q_hash_bytes.as_ref(),
            &[market_bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer winnings from the losing side's vault
        let from_vault = if outcome {
            ctx.accounts.no_vault.to_account_info()
        } else {
            ctx.accounts.yes_vault.to_account_info()
        };

        // Also transfer the user's original stake from the winning vault
        let winning_vault = if outcome {
            ctx.accounts.yes_vault.to_account_info()
        } else {
            ctx.accounts.no_vault.to_account_info()
        };

        let user_stake = if outcome { position.yes_amount } else { position.no_amount };
        let loser_share = winnings - user_stake;

        // Transfer 1: Return user's original stake from winning vault
        if user_stake > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: winning_vault.clone(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.market.to_account_info(),
                    },
                    signer,
                ),
                user_stake,
            )?;
        }

        // Transfer 2: Send share of loser pool from losing vault
        if loser_share > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: from_vault,
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.market.to_account_info(),
                    },
                    signer,
                ),
                loser_share,
            )?;
        }

        position.yes_amount = 0;
        position.no_amount = 0;

        Ok(())
    }
}

// ═══════════════════════════════════════════════════════
//  ACCOUNT CONTEXTS
// ═══════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 2 + 8 + 8 + 8,
        seeds = [b"protocol"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = protocol_state,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury_vault: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateProtocol<'info> {
    #[account(mut, seeds = [b"protocol"], bump, has_one = authority)]
    pub protocol_state: Account<'info, ProtocolState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(mut, seeds = [b"protocol"], bump, has_one = authority)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(mut, address = protocol_state.treasury_vault)]
    pub treasury_vault: Account<'info, TokenAccount>,
    /// The owner's personal D3X token account where fees are sent
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(question_hash: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(mut, seeds = [b"protocol"], bump)]
    pub protocol_state: Box<Account<'info, ProtocolState>>,
    #[account(
        init,
        payer = creator,
        // +1 for bump field added to Market struct
        // +8 for creator_fee_earned field added to Market struct
        // +32 for resolver Pubkey
        space = 8 + 32 + 32 + (4 + 280) + (4 + 500) + 8 + 8 + 1 + 8 + 8 + 8 + 8 + 32 + 32 + 32 + 1,
        seeds = [b"market", question_hash.as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = market,
        seeds = [b"yes_vault", market.key().as_ref()],
        bump
    )]
    pub yes_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = market,
        seeds = [b"no_vault", market.key().as_ref()],
        bump
    )]
    pub no_vault: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}


#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut, seeds = [b"protocol"], bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    /// The global treasury vault — receives the protocol's half of the fee
    #[account(mut, address = protocol_state.treasury_vault)]
    pub treasury_vault: Account<'info, TokenAccount>,
    /// The market creator's D3X token account — receives the creator's half of the fee
    #[account(mut)]
    pub creator_vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 8 + 8,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub yes_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub no_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut, has_one = resolver)]
    pub market: Account<'info, Market>,
    pub resolver: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    // Market identified by pubkey passed from client; seeds check removed to avoid stack overflow
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump,
        close = user
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub yes_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub no_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ═══════════════════════════════════════════════════════
//  STATE ACCOUNTS
// ═══════════════════════════════════════════════════════

/// Global protocol state — stores YOUR treasury config
#[account]
pub struct ProtocolState {
    /// The wallet that can withdraw fees & update settings (YOU)
    pub authority: Pubkey,
    /// The public key of the Oracle responsible for resolving all markets
    pub oracle: Pubkey,
    /// The D3X token account that collects all fees
    pub treasury_vault: Pubkey,
    /// Protocol fee in basis points (150 = 1.5%)
    pub fee_bps: u16,
    /// Running total of all fees collected (in D3X smallest unit)
    pub total_fees_collected: u64,
    /// Number of markets created on the platform
    pub total_markets_created: u64,
    /// Total betting volume in D3X
    pub total_volume: u64,
}

#[account]
pub struct Market {
    pub creator: Pubkey,
    pub resolver: Pubkey,
    pub question: String,
    pub description: String,
    pub end_timestamp: i64,
    pub resolution_timestamp: i64,
    pub status: MarketStatus,
    pub total_yes: u64,
    pub total_no: u64,
    pub total_fees_collected: u64,
    /// Cumulative D3X fees earned by the market creator (half of protocol fee)
    pub creator_fee_earned: u64,
    pub yes_vault: Pubkey,
    pub no_vault: Pubkey,
    pub mint: Pubkey,
    /// PDA bump stored at creation for use in claim_winnings signer seeds
    pub bump: u8,
}

#[account]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub yes_amount: u64,
    pub no_amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Active,
    Resolved { outcome: bool },
    Challenged,
}

// ═══════════════════════════════════════════════════════
//  ERRORS
// ═══════════════════════════════════════════════════════

#[error_code]
pub enum ErrorCode {
    #[msg("Market is not active")]
    MarketNotActive,
    #[msg("Betting period has closed")]
    BettingClosed,
    #[msg("End timestamp has not been reached yet")]
    EndTimestampNotReached,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("No winnings to claim")]
    NoWinnings,
    #[msg("Fee exceeds maximum allowed (5%)")]
    FeeTooHigh,
    #[msg("Question exceeds 280 characters")]
    QuestionTooLong,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
