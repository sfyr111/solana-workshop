use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    system_program,
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct InstructionData {
    pub vault_bump_seed: u8,
    pub lamports: u64,
}

pub const VAULT_ACCOUNT_SIZE: u64 = 1024;

entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = InstructionData::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let vault = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if system_program.key != &system_program::ID {
        return Err(ProgramError::IncorrectProgramId);
    }

    let vault_bump_seed = instruction.vault_bump_seed;
    let lamports = instruction.lamports;

    msg!("Creating vault account...");
    msg!("Payer: {}", payer.key);
    msg!("Vault: {}", vault.key);
    msg!("Bump seed: {}", vault_bump_seed);
    msg!("Lamports: {}", lamports);

    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            vault.key,
            lamports,
            VAULT_ACCOUNT_SIZE,
            program_id,
        ),
        &[
            payer.clone(),
            vault.clone(),
            system_program.clone(),
        ],
        &[
            &[
                b"vault",
                payer.key.as_ref(),
                &[vault_bump_seed],
            ],
        ],
    )?;

    msg!("Vault account created successfully.");

    Ok(())
}