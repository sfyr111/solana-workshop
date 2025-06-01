use solana_program::{
    account_info::{AccountInfo, next_account_info},
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    instruction,
    msg,
    program::invoke,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    let account = next_account_info(accounts_iter)?;
    let helloworld = next_account_info(accounts_iter)?;

    msg!("CPI invoke program calling hello world from {}", account.key);

    let account_metas = vec![
        instruction::AccountMeta::new_readonly(*account.key, false),
    ];

    let instruction = instruction::Instruction::new_with_bytes(
        *helloworld.key,
        &[],
        account_metas,
    );

    let account_infos = [
        account.clone(),
    ];

    invoke(&instruction, &account_infos[..])?;

    msg!("CPI invoke program finished");

    Ok(())
}