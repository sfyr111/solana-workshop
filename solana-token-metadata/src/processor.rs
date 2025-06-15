use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult, msg, program::invoke_signed, program_error::ProgramError, pubkey::Pubkey, rent::Rent, system_instruction, sysvar::Sysvar
};

use crate::{
    instruction::TokenMetadataInstruction,
    state::TokenMetadata,
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = TokenMetadataInstruction::try_from_slice(instruction_data)?;

        match instruction {
            TokenMetadataInstruction::RegisterMetadata { name, symbol, icon, home } => {
                Self::process_register_metadata(program_id, accounts, name, symbol, icon, home)
            }

            TokenMetadataInstruction::UpdateMetadata { name, symbol, icon, home } => {
                Self::process_update_metadata(program_id, accounts, name, symbol, icon, home)
            }
        }        
    }

    fn process_register_metadata(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        name: String,
        symbol: String,
        icon: String,
        home: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let metadata_account_info = next_account_info(account_info_iter)?;
        let mint_account_info = next_account_info(account_info_iter)?;
        let spl_token_program_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
    
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
    
        let (expected_metadata_key, bump_seed) = Pubkey::find_program_address(
            &[
                b"metadata",
                spl_token_program_info.key.as_ref(),
                mint_account_info.key.as_ref(),
            ],
            program_id,
        );
    
        if expected_metadata_key != *metadata_account_info.key {
            msg!("Metadata account does not match the derived address");
            return Err(ProgramError::InvalidArgument);
        }
    
        let token_metadata = TokenMetadata {
            mint: *mint_account_info.key,
            name,
            symbol,
            icon,
            home,
        };
    
        let metadata_serialized_size = token_metadata.try_to_vec()?.len();
    
        let rent = Rent::get()?;
        let rent_lamports = rent.minimum_balance(metadata_serialized_size);
    
        invoke_signed(
            &system_instruction::create_account(
                authority_info.key,
                metadata_account_info.key,
                rent_lamports,
                metadata_serialized_size as u64,
                program_id,
            ),
            &[
                authority_info.clone(),
                metadata_account_info.clone(),
                system_program_info.clone(),
            ],
            &[&[
                b"metadata",
                spl_token_program_info.key.as_ref(),
                mint_account_info.key.as_ref(),
                &[bump_seed],
            ]],
        )?;
    
        token_metadata.serialize(&mut *metadata_account_info.data.borrow_mut())?;
    
        msg!("Metadata account created successfully");
        Ok(())
    }
    
    fn process_update_metadata(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        name: String,
        symbol: String,
        icon: String,
        home: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let metadata_account_info = next_account_info(account_info_iter)?;
        let mint_account_info = next_account_info(account_info_iter)?;
        let spl_token_program_info = next_account_info(account_info_iter)?;
    
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
    
        let (expected_metadata_key, _) = Pubkey::find_program_address(
            &[
                b"metadata",
                spl_token_program_info.key.as_ref(),
                mint_account_info.key.as_ref(),
            ],
            program_id,
        );
    
        if expected_metadata_key != *metadata_account_info.key {
            msg!("Metadata account does not match the derived address");
            return Err(ProgramError::InvalidArgument);
        }
    
        if metadata_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

    
        let token_metadata = TokenMetadata {
            mint: *mint_account_info.key,
            name,
            symbol,
            icon,
            home,
        };
    
        token_metadata.serialize(&mut *metadata_account_info.data.borrow_mut())?;
    
        msg!("Token metadata updated successfully");
        Ok(())
    }
}

