use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar
};

use crate::{
    instruction::TokenMetadataInstruction,
    state::TokenMetadata,
};

/// Main processor for handling token metadata instructions
pub struct Processor;

impl Processor {
    /// Main entry point for processing token metadata instructions
    ///
    /// # Arguments
    /// * `program_id` - The program ID of this token metadata program
    /// * `accounts` - Array of account infos required for the instruction
    /// * `instruction_data` - Serialized instruction data containing the instruction type and parameters
    ///
    /// # Returns
    /// * `ProgramResult` - Success or error result of the instruction processing
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        // Deserialize the instruction data to determine which operation to perform
        let instruction = TokenMetadataInstruction::try_from_slice(instruction_data)?;

        // Route to the appropriate instruction handler based on the instruction type
        match instruction {
            TokenMetadataInstruction::RegisterMetadata { name, symbol, icon, home } => {
                Self::process_register_metadata(program_id, accounts, name, symbol, icon, home)
            }

            TokenMetadataInstruction::UpdateMetadata { name, symbol, icon, home } => {
                Self::process_update_metadata(program_id, accounts, name, symbol, icon, home)
            }
        }
    }

    /// Processes the RegisterMetadata instruction to create a new metadata account for a token
    ///
    /// # Arguments
    /// * `program_id` - The program ID of this token metadata program
    /// * `accounts` - Array of account infos in the following order:
    ///   - [0] authority_info: [signer] The authority account (payer)
    ///   - [1] metadata_account_info: [writable] The metadata account (PDA)
    ///   - [2] mint_account_info: [] The mint account
    ///   - [3] spl_token_program_info: [] The SPL Token program
    ///   - [4] system_program_info: [] The system program
    /// * `name` - The name of the token
    /// * `symbol` - The symbol of the token
    /// * `icon` - The icon URL of the token
    /// * `home` - The home URL of the token
    ///
    /// # Returns
    /// * `ProgramResult` - Success or error result of the metadata registration
    fn process_register_metadata(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        name: String,
        symbol: String,
        icon: String,
        home: String,
    ) -> ProgramResult {
        // Parse the accounts in the expected order
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;           // [0] Authority (payer)
        let metadata_account_info = next_account_info(account_info_iter)?;    // [1] Metadata PDA
        let mint_account_info = next_account_info(account_info_iter)?;        // [2] Mint account
        let spl_token_program_info = next_account_info(account_info_iter)?;   // [3] SPL Token program
        let system_program_info = next_account_info(account_info_iter)?;      // [4] System program
    
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
    
    /// Processes the UpdateMetadata instruction to update existing metadata for a token
    /// This function handles account resizing if the new metadata requires different storage space
    ///
    /// # Arguments
    /// * `program_id` - The program ID of this token metadata program
    /// * `accounts` - Array of account infos in the following order:
    ///   - [0] authority_info: [signer] The authority account (must be same as original creator)
    ///   - [1] metadata_account_info: [writable] The metadata account (PDA)
    ///   - [2] mint_account_info: [] The mint account
    ///   - [3] spl_token_program_info: [] The SPL Token program
    ///   - [4] system_program_info: [] The system program (required for reallocation)
    /// * `name` - The new name of the token
    /// * `symbol` - The new symbol of the token
    /// * `icon` - The new icon URL of the token
    /// * `home` - The new home URL of the token
    ///
    /// # Returns
    /// * `ProgramResult` - Success or error result of the metadata update
    fn process_update_metadata(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        name: String,
        symbol: String,
        icon: String,
        home: String,
    ) -> ProgramResult {
        // Parse the accounts in the expected order
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;           // [0] Authority (must be signer)
        let metadata_account_info = next_account_info(account_info_iter)?;    // [1] Metadata PDA
        let mint_account_info = next_account_info(account_info_iter)?;        // [2] Mint account
        let spl_token_program_info = next_account_info(account_info_iter)?;   // [3] SPL Token program
        let system_program_info = next_account_info(account_info_iter)?;      // [4] System program

        // Verify that the authority is a signer
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Derive the expected metadata account address and verify it matches
        let (expected_metadata_key, _bump_seed) = Pubkey::find_program_address(
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

        // Verify that the metadata account is owned by this program
        if metadata_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // Create the new metadata structure
        let new_token_metadata = TokenMetadata {
            mint: *mint_account_info.key,
            name,
            symbol,
            icon,
            home,
        };

        // Calculate the required size for the new metadata
        let new_metadata_size = new_token_metadata.try_to_vec()?.len();
        let current_account_size = metadata_account_info.data_len();

        // Handle account resizing if needed
        if new_metadata_size != current_account_size {
            msg!("Resizing metadata account from {} to {} bytes", current_account_size, new_metadata_size);

            // Calculate the new rent requirement
            let rent = Rent::get()?;
            let new_rent_lamports = rent.minimum_balance(new_metadata_size);
            let current_lamports = metadata_account_info.lamports();

            // Handle lamport adjustments based on size change
            if new_rent_lamports > current_lamports {
                // Account is growing - need to add more lamports
                let lamports_diff = new_rent_lamports - current_lamports;

                // Transfer additional lamports from authority to metadata account
                let transfer_instruction = system_instruction::transfer(
                    authority_info.key,
                    metadata_account_info.key,
                    lamports_diff,
                );

                solana_program::program::invoke(
                    &transfer_instruction,
                    &[
                        authority_info.clone(),
                        metadata_account_info.clone(),
                        system_program_info.clone(),
                    ],
                )?;

                msg!("Transferred {} lamports for account expansion", lamports_diff);
            } else if new_rent_lamports < current_lamports {
                // Account is shrinking - return excess lamports to authority
                let lamports_diff = current_lamports - new_rent_lamports;

                // Safely transfer excess lamports back to authority
                **metadata_account_info.try_borrow_mut_lamports()? -= lamports_diff;
                **authority_info.try_borrow_mut_lamports()? += lamports_diff;

                msg!("Returned {} excess lamports to authority", lamports_diff);
            }

            // Reallocate the account to the exact new size
            metadata_account_info.realloc(new_metadata_size, false)?;
        }

        // Clear the account data to ensure no leftover bytes
        {
            let mut data = metadata_account_info.data.borrow_mut();
            for byte in data.iter_mut() {
                *byte = 0;
            }
        }

        // Serialize the new metadata into the clean account
        new_token_metadata.serialize(&mut *metadata_account_info.data.borrow_mut())?;

        msg!("Token metadata updated successfully");
        Ok(())
    }
}

