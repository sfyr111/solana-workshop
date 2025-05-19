use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{AccountInfo, next_account_info},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GreetingAccount {
    pub counter: u32,
}

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Greeting Counter program started");

    let accounts_iter = &mut accounts.iter(); // Create an iterator for the accounts

    let account = next_account_info(accounts_iter)?; // Get the first account

    // Check if the account is the correct type
    if account.owner != program_id {
        msg!("Greeting Account does not have the correct program id");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Deserialize the account data
    let mut greeting_account = GreetingAccount::try_from_slice(&account.data.borrow_mut())?;

    // Increment the counter
    greeting_account.counter += 1;

    // Serialize the updated account data
    greeting_account.serialize(&mut *account.data.borrow_mut())?;

    msg!("Greeting Account updated");

    Ok(())
}
