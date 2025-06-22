use anchor_lang::prelude::*;

declare_id!("AGnEXNeEkkUk6yxKgUr19Q4CVTnHaMDo4RUGSq5vS6kf");

#[program]
pub mod puppet {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let puppet_account = &mut ctx.accounts.puppet;
        puppet_account.data = 0;
        msg!("Puppet account initialized with data: 0");
        Ok(())
    }

    pub fn set_data(ctx: Context<SetData>, data: u64) -> Result<u64> {
        let puppet_account = &mut ctx.accounts.puppet;
        puppet_account.data = data;

        msg!("Puppet data set to: {}", data);

        Ok(data)
    }

    pub fn get_data(ctx: Context<GetData>) -> Result<u64> {
        let puppet_account = &ctx.accounts.puppet;
        msg!("Puppet data is: {}", puppet_account.data);
        Ok(puppet_account.data)
    }
}

#[account]
#[derive(Default)]
pub struct PuppetData {
    pub data: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 8  // 8 bytes for discriminator + 8 bytes for data
    )]
    pub puppet: Account<'info, PuppetData>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]
    pub puppet: Account<'info, PuppetData>,
}

#[derive(Accounts)]
pub struct GetData<'info> {
    pub puppet: Account<'info, PuppetData>,
}
