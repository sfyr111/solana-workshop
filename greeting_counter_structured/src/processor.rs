use crate::{
    instruction::GreetingCounterInstruction,
    state::GreetingAccount,
};
use borsh::{BorshDeserialize, BorshSerialize};

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

pub struct Processor {}

impl Processor {
    pub fn process(
        program_id: &Pubkey,      // This program's ID
        accounts: &[AccountInfo], // Accounts passed to the instruction
        instruction_data: &[u8],  // Raw instruction data bytes
    ) -> ProgramResult {
        // Attempt to deserialize instruction data into a GreetingCounterInstruction
        // try_from_slice: Converts byte slice to a defined struct (GreetingCounterInstruction here).
        // Returns a Result, hence the .map_err and ? for error handling.
        let instruction = GreetingCounterInstruction::try_from_slice(instruction_data)
            // Map any Borsh deserialization error to a standard Solana program error.
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        // Route to specific handler based on the deserialized instruction
        match instruction {
            GreetingCounterInstruction::Increment => {
                msg!("Instruction: Increment");
                Self::process_increment(program_id, accounts)
            }
            GreetingCounterInstruction::SetCounter { value } => {
                msg!("Instruction: SetCounter to {}", value);
                Self::process_set_counter(program_id, accounts, value)
            }
            _ => {
                msg!("Error: Invalid instruction received");
                Err(ProgramError::InvalidInstructionData)
            }
        }
    }

    // Handles the Increment instruction
    fn process_increment(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        // Get an iterator for accounts
        let accounts_iter = &mut accounts.iter();
        // Get the first account, expected to be the greeting account
        let account = next_account_info(accounts_iter)?;

        // Security check: Ensure this program owns the account to be modified.
        // This is crucial to prevent unauthorized writes to accounts owned by other programs.
        if account.owner != program_id {
            msg!("Error: Greeting account not owned by program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Deserialize account data into GreetingAccount struct
        // account.data.borrow(): Immutably borrows the RefCell<[u8]> data for reading.
        // try_from_slice: Attempts to convert the byte slice from account data to GreetingAccount.
        let mut greeting_account = GreetingAccount::try_from_slice(&account.data.borrow())?;

        // Increment counter
        greeting_account.counter += 1;

        // Serialize the updated GreetingAccount back into the account's data buffer.
        // account.data.borrow_mut(): Mutably borrows the RefCell<[u8]> data for writing.
        // serialize: Converts the GreetingAccount struct back to a byte slice.
        greeting_account.serialize(&mut *account.data.borrow_mut())?;

        msg!("Counter incremented to: {}", greeting_account.counter);
        Ok(())
    }

    // Handles the SetCounter instruction
    fn process_set_counter(program_id: &Pubkey, accounts: &[AccountInfo], value: u32) -> ProgramResult {
        let accounts_iter = &mut accounts.iter();
        let account = next_account_info(accounts_iter)?;

        // Security check: Ensure this program owns the account.
        if account.owner != program_id {
            msg!("Error: Greeting account not owned by program");
            return Err(ProgramError::IncorrectProgramId);
        }

        // Deserialize account data
        let mut greeting_account = GreetingAccount::try_from_slice(&account.data.borrow())?;

        // Set counter to the new value
        greeting_account.counter = value;

        // Serialize updated data back to the account
        greeting_account.serialize(&mut *account.data.borrow_mut())?;

        msg!("Counter set to: {}", value);
        Ok(())
    }
}
