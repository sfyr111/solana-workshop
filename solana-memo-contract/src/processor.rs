use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program::invoke, program_error::ProgramError, pubkey::Pubkey, rent::Rent, system_instruction, sysvar::Sysvar
};

use crate::{instruction::MemoInstruction, state::Memo, error::MemoError};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = MemoInstruction::try_from_slice(instruction_data)
            .map_err(|_| MemoError::InvalidInstruction)?;
        
        match instruction {
            MemoInstruction::Initialize { content} => {
                Self::process_initialize(program_id, accounts, content)
            }
            MemoInstruction::Update { content } => {
                Self::process_update(program_id, accounts, content)
            }
            MemoInstruction::Delete => Self::process_delete(program_id, accounts),
        }
    }

    fn process_initialize(program_id: &Pubkey, accounts: &[AccountInfo], content: String) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer_info = next_account_info(account_info_iter)?;
        let memo_account_info = next_account_info(account_info_iter)?;
        let authority_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // check content length
        if content.len() > Memo::MAX_CONTENT_LENGTH {
            return Err(MemoError::MemoContentTooLong.into());
        }

        // check payer is signer
        if !payer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // check authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // create memo account
        let rent = Rent::get()?; // get current sysvar rent configuration
        let memo = Memo {
            is_initialized: true,
            authority: *authority_info.key,
            content,
        };

        let space = memo.try_to_vec()?.len(); // calculate memo account size
        let rent_lamports = rent.minimum_balance(space); // calculate rent

        invoke(
            &system_instruction::create_account(
                payer_info.key,           // who pays for the account creation
                memo_account_info.key,    // the new memo account to be created
                rent_lamports,            // lamports for rent
                space as u64,             // the size of the account data
                program_id,               // the owner program of the account
            ),
            &[
                payer_info.clone(),
                memo_account_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        memo.serialize(&mut *memo_account_info.data.borrow_mut())?; // memo struct to bytes and write to RefCell of memo account
        
        msg!("Memo account initialized successfully");
        Ok(())
    }

    fn process_update(program_id: &Pubkey, accounts: &[AccountInfo], content: String) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let memo_account_info = next_account_info(account_info_iter)?;

        // check authority is signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // check memo account is owned by program
        if memo_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // check content length
        if content.len() > Memo::MAX_CONTENT_LENGTH {
            return Err(MemoError::MemoContentTooLong.into());
        }
        
        let mut memo = Memo::try_from_slice(&memo_account_info.data.borrow())?;

        if !memo.is_initialized {
            return Err(MemoError::AccountNotInitialized.into());
        }

        if memo.authority != *authority_info.key {
            return Err(MemoError::Unauthorized.into());
        }

        memo.content = content;

        memo.serialize(&mut *memo_account_info.data.borrow_mut())?;

        msg!("Memo updated successfully");

        Ok(())
    }

    fn process_delete(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let memo_account_info = next_account_info(account_info_iter)?;
        let receiver_info = next_account_info(account_info_iter)?;
    
        // check memo account is owned by program
        if memo_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
    
        // check authority is singer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
    
        let memo = Memo::try_from_slice(&memo_account_info.data.borrow())?;
        
        // check memo account is initialized
        if !memo.is_initialized {
            return Err(MemoError::AccountNotInitialized.into());
        }
    
        // check authority is the owner of the memo
        if memo.authority != *authority_info.key {
            return Err(MemoError::Unauthorized.into());
        }
    
        let receiver_lamports = receiver_info.lamports(); // Get receiver's current balance
        let memo_lamports = memo_account_info.lamports(); // Get memo account's full balance (rent-exempt deposit)
    
        // Add memo account balance to receiver's balance
        **receiver_info.lamports.borrow_mut() = 
            receiver_lamports
            .checked_add(memo_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?; 
    
        // Set memo account's balance to 0
        **memo_account_info.lamports.borrow_mut() = 0;
    
        // Clear memo account data
        let mut data = memo_account_info.data.borrow_mut();
        for byte in data.iter_mut() {
            *byte = 0;
        }
    
        msg!("Memo account deleted successfully");
        Ok(())
    }
}

