// Import necessary dependencies for Borsh serialization and Solana program development
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    program::invoke,
    system_program,
    sysvar::Sysvar,
};

// Define the program entry point - this macro sets up the main function for the Solana program
entrypoint!(process_instruction);

// Instruction enum that defines all possible operations this program can perform
// This demonstrates the power of ALT (Address Lookup Tables) for batch operations
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum TutorialInstruction {
    /// 0. [signer, writable] payer
    /// 1. [writable] counter_account
    /// 2. [] system_program
    CreateCounter,
    /// 0. [writable] counter_account
    /// 1. [] system_program
    IncrementCounter,
    /// 0...n. [writable] counter_accounts
    /// n+1. [] system_program
    BatchIncrement,
}

// Counter data structure that will be stored on-chain
// Each counter account will contain this data
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Counter {
    /// The current count value
    pub count: u64,
    /// The authority (owner) of this counter - who can modify it
    pub authority: Pubkey,
}

impl Counter {
    /// Total space required for this account: 8 bytes (u64) + 32 bytes (Pubkey)
    pub const LEN: usize = 8 + 32;
}

/// Main instruction processing function - the heart of our Solana program
/// This function is called for every transaction sent to this program
///
/// # Arguments
/// * `program_id` - The public key of this program
/// * `accounts` - Array of accounts involved in this transaction
/// * `instruction_data` - Serialized instruction data containing the operation to perform
///
/// # Returns
/// * `ProgramResult` - Success or error result
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Deserialize the instruction data to determine which operation to perform
    let instruction = TutorialInstruction::try_from_slice(instruction_data)?;

    // Route to the appropriate handler function based on instruction type
    match instruction {
        TutorialInstruction::CreateCounter => create_counter(program_id, accounts),
        TutorialInstruction::IncrementCounter => increment_counter(program_id, accounts),
        TutorialInstruction::BatchIncrement => batch_increment(program_id, accounts),
    }
}

/// Creates a new counter account with initial value of 0
/// This function demonstrates basic account creation in Solana
///
/// # Expected Accounts
/// 0. [signer, writable] payer - Account that pays for the transaction and rent
/// 1. [signer, writable] counter_account - New counter account to be created
/// 2. [] system_program - Solana's system program for account creation
///
/// # Returns
/// * `ProgramResult` - Success or error result
fn create_counter(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    // Create an iterator to safely access accounts in order
    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let counter_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // Security check: Ensure the payer has signed this transaction
    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Security check: Ensure the counter account has signed (new account creation)
    if !counter_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Security check: Verify that the system program is actually the system program
    if *system_program.key != system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Calculate the minimum rent required for this account size
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(Counter::LEN);

    // Create the account using Cross-Program Invocation (CPI) to the system program
    // This allocates space and assigns ownership to our program
    invoke(
        &system_instruction::create_account(
            payer.key,           // Who pays for the account
            counter_account.key, // The new account being created
            lamports,           // Rent payment
            Counter::LEN as u64, // Space allocation
            program_id,         // Owner of the new account (our program)
        ),
        &[payer.clone(), counter_account.clone(), system_program.clone()],
    )?;

    // Initialize the counter data structure with default values
    let counter = Counter {
        count: 0,              // Start counting from 0
        authority: *payer.key, // Set the payer as the authority
    };

    // Serialize and store the counter data in the account
    let mut data = counter_account.data.borrow_mut();
    counter.serialize(&mut &mut data[..])?;

    msg!("Counter created successfully with initial value: 0");
    Ok(())
}

/// Increments a single counter by 1
/// This function demonstrates basic account data modification
///
/// # Expected Accounts
/// 0. [writable] counter_account - The counter account to increment
///
/// # Returns
/// * `ProgramResult` - Success or error result
fn increment_counter(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    // Get the counter account from the accounts array
    let account_info_iter = &mut accounts.iter();
    let counter_account = next_account_info(account_info_iter)?;

    // Security check: Verify that our program owns this account
    // This prevents other programs from modifying our data
    if counter_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Read the current counter data from the account
    // We borrow immutably first to read the data
    let data = counter_account.data.borrow();
    let mut counter = Counter::try_from_slice(&data)?;
    drop(data); // Explicitly drop the immutable borrow before mutable borrow

    // Increment the counter value
    counter.count += 1;

    // Write the updated data back to the account
    // Now we borrow mutably to write the data
    let mut data = counter_account.data.borrow_mut();
    counter.serialize(&mut &mut data[..])?;

    msg!("Counter incremented to: {}", counter.count);
    Ok(())
}

/// Batch increment multiple counters - THIS IS WHERE ALT SHINES!
/// This function demonstrates the power of Address Lookup Tables (ALT)
///
/// Without ALT: Limited to ~35 accounts per transaction
/// With ALT: Can handle up to 256 accounts per transaction!
///
/// This is the key advantage of ALT - enabling complex batch operations
/// that would otherwise require multiple transactions.
///
/// # Expected Accounts
/// 0...n. [writable] counter_accounts - Array of counter accounts to increment
///
/// # Returns
/// * `ProgramResult` - Success or error result
fn batch_increment(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    msg!("Starting batch increment of {} counters", accounts.len());

    // Iterate through all provided counter accounts
    for (index, counter_account) in accounts.iter().enumerate() {
        // Security check: Verify that our program owns this account
        // Skip invalid accounts instead of failing the entire transaction
        if counter_account.owner != program_id {
            msg!("Skipping invalid account at index {}", index);
            continue;
        }

        // Read the current counter data
        let data = counter_account.data.borrow();
        let mut counter = Counter::try_from_slice(&data)?;
        drop(data); // Release immutable borrow

        // Increment the counter
        counter.count += 1;

        // Write the updated data back
        let mut data = counter_account.data.borrow_mut();
        counter.serialize(&mut &mut data[..])?;

        msg!("Counter {} incremented to: {}", index, counter.count);
    }

    msg!("Batch operation completed successfully!");
    Ok(())
}
