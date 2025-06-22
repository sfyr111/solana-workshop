// Import Anchor framework and required types
use anchor_lang::prelude::*;
use puppet::program::Puppet;
use puppet::{self, PuppetData};

// Declare the program ID - this is the unique identifier for our smart contract
declare_id!("9rXmvPf4YXyrGUuG4NvW2WiGTiDFUSf2hjMYvifgLtkQ");

// Main program module - contains all instruction handlers
#[program]
pub mod anchor_hello_world {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        require!(data < 100, MyError::DataTooLarge);

        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        msg!("Initialized account with data: {}", data);
        Ok(())
    }

    pub fn set_data(ctx: Context<SetData>, data: u64) -> Result<()> {
        require!(data < 100, MyError::DataTooLarge);

        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        msg!("Updated account data to: {}", data);
        Ok(())
    }

    // PDA Feature: Initialize user statistics account using Program Derived Address
    pub fn initialize_user_stats(ctx: Context<InitializeUserStats>, name: String) -> Result<()> {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.name = name.clone();
        user_stats.level = 1;                                    // Start at level 1
        user_stats.points = 0;                                   // Start with 0 points
        user_stats.authority = ctx.accounts.authority.key();     // Set the owner
        user_stats.bump = ctx.bumps.user_stats;                  // Store bump for future use

        msg!("Initialized user stats for: {}", name);
        Ok(())
    }

    // PDA Feature: Update user statistics (add points and recalculate level)
    pub fn update_user_stats(ctx: Context<UpdateUserStats>, points: u64) -> Result<()> {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.points += points;                             // Add new points

        // Calculate new level based on points (every 100 points = 1 level)
        let old_level = user_stats.level;
        user_stats.level = (user_stats.points / 100) + 1;

        msg!("Updated user {} points: +{}, total: {}, level: {} -> {}",
             user_stats.name, points, user_stats.points, old_level, user_stats.level);
        Ok(())
    }

    // CPI Feature: Call puppet program through Cross-Program Invocation
    pub fn pull_strings(ctx: Context<PullStrings>, data: u64) -> Result<()> {
        // Get the puppet program account info
        let cpi_program = ctx.accounts.puppet_program.to_account_info();

        // Prepare the accounts needed for the puppet program's set_data instruction
        let cpi_accounts = puppet::cpi::accounts::SetData {
            puppet: ctx.accounts.puppet.to_account_info(),
        };

        // Create CPI context (like preparing a phone call to another program)
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Actually call the puppet program's set_data instruction
        let result = puppet::cpi::set_data(cpi_ctx, data)?;

        msg!("Called puppet program via CPI, returned: {}", result.get());
        Ok(())
    }

    // CPI Feature: Call puppet program using PDA as signer (advanced CPI)
    pub fn pull_strings_with_pda(ctx: Context<PullStringsWithPda>, data: u64) -> Result<()> {
        // Get the puppet program account info
        let cpi_program = ctx.accounts.puppet_program.to_account_info();

        // Prepare the accounts needed for the puppet program's set_data instruction
        let cpi_accounts = puppet::cpi::accounts::SetData {
            puppet: ctx.accounts.puppet.to_account_info(),
        };

        // Create PDA signature seeds (this allows our program to "sign" on behalf of the PDA)
        let authority_bump = ctx.bumps.authority;
        let authority_seeds = &[
            b"authority".as_ref(),  // Fixed string seed
            &[authority_bump],      // Bump value as bytes
        ];
        let signer_seeds = &[&authority_seeds[..]];  // Format for Anchor

        // Create CPI context with PDA signer (like making a call with special authorization)
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        puppet::cpi::set_data(cpi_ctx, data)?;

        msg!("Called puppet program via CPI with PDA signer");
        Ok(())
    }
}

// Basic data account structure - stores simple data
#[account]
#[derive(Default)]
pub struct MyAccount {
    pub data: u64,  // A simple number that we can read and write
}

// User statistics data structure (PDA example) - stores user game data
#[account]
#[derive(Default)]
pub struct UserStats {
    pub name: String,        // User's name
    pub level: u64,          // User's current level
    pub points: u64,         // User's accumulated points
    pub authority: Pubkey,   // The account that owns this user stats
    pub bump: u8,            // PDA bump value for address generation
}

// initialize account instruction
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,           // create new account
        payer = user,   // payer account
        space = 8 + 8   // accout space size (8 bytes for discriminator + 8 bytes for data)
    )]
    pub my_account: Account<'info, MyAccount>,
    #[account(mut)]     // mutable account
    pub user: Signer<'info>,  // signer account
    pub system_program: Program<'info, System>,
}

// 基础更新数据指令的账户结构
#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]             // 可变账户
    pub my_account: Account<'info, MyAccount>,
}

// Account validation structure for PDA initialization instruction
#[derive(Accounts)]
#[instruction(name: String)] // Instruction parameter used in seeds calculation
pub struct InitializeUserStats<'info> {
    #[account(
        init,                                                 // Create new account
        payer = authority,                                    // Who pays for account creation
        space = 8 + 32 + 8 + 8 + 32 + 1 + 4 + name.len(),   // Calculate required space
        seeds = [b"user-stats", authority.key().as_ref()],   // PDA seeds for deterministic address
        bump                                                  // Auto-find bump value
    )]
    pub user_stats: Account<'info, UserStats>,
    #[account(mut)]                                          // Mutable (for paying fees)
    pub authority: Signer<'info>,                            // Must sign the transaction
    pub system_program: Program<'info, System>,              // Required for account creation
}

// Account validation structure for PDA update instruction
#[derive(Accounts)]
pub struct UpdateUserStats<'info> {
    #[account(
        mut,                                                 // Account will be modified
        seeds = [b"user-stats", authority.key().as_ref()],  // Same seeds as initialization
        bump = user_stats.bump,                             // Use stored bump value
        has_one = authority                                  // Verify authority field matches
    )]
    pub user_stats: Account<'info, UserStats>,
    pub authority: Signer<'info>,                           // Must be the owner
}

// Account validation structure for basic CPI call
#[derive(Accounts)]
pub struct PullStrings<'info> {
    #[account(mut)]                              // The puppet account we want to modify
    pub puppet: Account<'info, PuppetData>,
    pub puppet_program: Program<'info, Puppet>,  // The puppet program we're calling
}

// Account validation structure for CPI call with PDA signer
#[derive(Accounts)]
pub struct PullStringsWithPda<'info> {
    #[account(mut)]                              // The puppet account we want to modify
    pub puppet: Account<'info, PuppetData>,
    pub puppet_program: Program<'info, Puppet>,  // The puppet program we're calling
    #[account(
        seeds = [b"authority"],                  // PDA seeds for authority account
        bump                                     // Auto-find bump value
    )]
    /// CHECK: This is safe because we're using it as a PDA signer
    pub authority: UncheckedAccount<'info>,      // PDA that will "sign" the CPI call
}

#[error_code]
pub enum MyError {
    #[msg("Data value must be less than 100")]
    DataTooLarge,
}
