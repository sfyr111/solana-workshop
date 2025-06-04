use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{Clock, UnixTimestamp},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{
        self, clock, epoch_schedule::EpochSchedule, fees::Fees, instructions::Instructions,
        recent_blockhashes::RecentBlockhashes, rent, slot_hashes::SlotHashes,
        slot_history::SlotHistory, stake_history::StakeHistory, Sysvar,
    },
};

// Define instruction types
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum SysvarInstruction {
    // Basic sysvar access
    ShowClock,
    ShowRent,
    ShowEpochSchedule,
    ShowFees,
    
    // Access sysvars from accounts
    ShowClockFromAccount,
    ShowRentFromAccount,
    ShowEpochScheduleFromAccount,
    ShowFeesFromAccount,
    
    // Create an account and calculate minimum balance
    CalculateRent { size: u64 },
    
    // Create a PDA account
    CreatePdaAccount { space: u64, seed: String },
    
    // Get account creation time
    GetAccountCreationTime { account_seed: String },
    
    // Check if account needs to pay rent
    CheckRentExemption { account_seed: String },
    
    // Get multiple sysvars
    ShowMultipleSysvars,
}

// Define program entrypoint
entrypoint!(process_instruction);

// Process instruction
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Parse instruction data
    let instruction = SysvarInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        // Basic sysvar access
        SysvarInstruction::ShowClock => show_clock(),
        SysvarInstruction::ShowRent => show_rent(),
        SysvarInstruction::ShowEpochSchedule => show_epoch_schedule(),
        SysvarInstruction::ShowFees => show_fees(),
        
        // Access sysvars from accounts
        SysvarInstruction::ShowClockFromAccount => show_clock_from_account(accounts),
        SysvarInstruction::ShowRentFromAccount => show_rent_from_account(accounts),
        SysvarInstruction::ShowEpochScheduleFromAccount => show_epoch_schedule_from_account(accounts),
        SysvarInstruction::ShowFeesFromAccount => show_fees_from_account(accounts),
        
        // Create an account and calculate minimum balance
        SysvarInstruction::CalculateRent { size } => calculate_rent(size),
        
        // Create a PDA account
        SysvarInstruction::CreatePdaAccount { space, seed } => {
            create_pda_account(program_id, accounts, space, &seed)
        }
        
        // Get account creation time
        SysvarInstruction::GetAccountCreationTime { account_seed } => {
            get_account_creation_time(program_id, accounts, &account_seed)
        }
        
        // Check if account needs to pay rent
        SysvarInstruction::CheckRentExemption { account_seed } => {
            check_rent_exemption(program_id, accounts, &account_seed)
        }
        
        // Get multiple sysvars
        SysvarInstruction::ShowMultipleSysvars => show_multiple_sysvars(),
    }
}

// Get Clock sysvar directly
fn show_clock() -> ProgramResult {
    let clock = Clock::get()?;
    
    msg!("===== Clock Sysvar (direct) =====");
    msg!("Slot: {}", clock.slot);
    msg!("Epoch: {}", clock.epoch);
    msg!("Unix Timestamp: {}", clock.unix_timestamp);
    msg!("Epoch Start Timestamp: {}", clock.epoch_start_timestamp);
    msg!("Leader Schedule Epoch: {}", clock.leader_schedule_epoch);
    
    Ok(())
}

// Get Rent sysvar directly
fn show_rent() -> ProgramResult {
    let rent = Rent::get()?;
    
    msg!("===== Rent Sysvar (direct) =====");
    msg!("Lamports per byte year: {}", rent.lamports_per_byte_year);
    msg!("Exemption threshold: {}", rent.exemption_threshold);
    msg!("Burn percent: {}", rent.burn_percent);
    
    Ok(())
}

// Get EpochSchedule sysvar directly
fn show_epoch_schedule() -> ProgramResult {
    let epoch_schedule = EpochSchedule::get()?;
    
    msg!("===== EpochSchedule Sysvar (direct) =====");
    msg!("Slots per epoch: {}", epoch_schedule.slots_per_epoch);
    msg!("Leader schedule slot offset: {}", epoch_schedule.leader_schedule_slot_offset);
    msg!("Warmup: {}", epoch_schedule.warmup);
    msg!("First normal epoch: {}", epoch_schedule.first_normal_epoch);
    msg!("First normal slot: {}", epoch_schedule.first_normal_slot);
    
    Ok(())
}

// Get Fees sysvar directly
fn show_fees() -> ProgramResult {
    let fees = Fees::get()?;
    
    msg!("===== Fees Sysvar (direct) =====");
    msg!("Lamports per signature: {}", fees.fee_calculator.lamports_per_signature);
    
    Ok(())
}

// Get Clock sysvar from account
fn show_clock_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let clock_sysvar_info = next_account_info(account_info_iter)?;
    
    // Verify account is Clock sysvar account
    if clock_sysvar_info.key != &clock::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let clock = Clock::from_account_info(clock_sysvar_info)?;
    
    msg!("===== Clock Sysvar (from account) =====");
    msg!("Slot: {}", clock.slot);
    msg!("Epoch: {}", clock.epoch);
    msg!("Unix Timestamp: {}", clock.unix_timestamp);
    msg!("Epoch Start Timestamp: {}", clock.epoch_start_timestamp);
    msg!("Leader Schedule Epoch: {}", clock.leader_schedule_epoch);
    
    Ok(())
}

// Get Rent sysvar from account
fn show_rent_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let rent_sysvar_info = next_account_info(account_info_iter)?;
    
    // Verify account is Rent sysvar account
    if rent_sysvar_info.key != &rent::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let rent = Rent::from_account_info(rent_sysvar_info)?;
    
    msg!("===== Rent Sysvar (from account) =====");
    msg!("Lamports per byte year: {}", rent.lamports_per_byte_year);
    msg!("Exemption threshold: {}", rent.exemption_threshold);
    msg!("Burn percent: {}", rent.burn_percent);
    
    Ok(())
}

// Get EpochSchedule sysvar from account
fn show_epoch_schedule_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let epoch_schedule_sysvar_info = next_account_info(account_info_iter)?;
    
    // Verify account is EpochSchedule sysvar account
    if epoch_schedule_sysvar_info.key != &sysvar::epoch_schedule::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let epoch_schedule = EpochSchedule::from_account_info(epoch_schedule_sysvar_info)?;
    
    msg!("===== EpochSchedule Sysvar (from account) =====");
    msg!("Slots per epoch: {}", epoch_schedule.slots_per_epoch);
    msg!("Leader schedule slot offset: {}", epoch_schedule.leader_schedule_slot_offset);
    msg!("Warmup: {}", epoch_schedule.warmup);
    msg!("First normal epoch: {}", epoch_schedule.first_normal_epoch);
    msg!("First normal slot: {}", epoch_schedule.first_normal_slot);
    
    Ok(())
}

// Get Fees sysvar from account
fn show_fees_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let fees_sysvar_info = next_account_info(account_info_iter)?;
    
    // Verify account is Fees sysvar account
    if fees_sysvar_info.key != &sysvar::fees::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let fees = Fees::from_account_info(fees_sysvar_info)?;
    
    msg!("===== Fees Sysvar (from account) =====");
    msg!("Lamports per signature: {}", fees.fee_calculator.lamports_per_signature);
    
    Ok(())
}

// Calculate minimum balance for an account
fn calculate_rent(size: u64) -> ProgramResult {
    let rent = Rent::get()?;
    
    let minimum_balance = rent.minimum_balance(size as usize);
    let yearly_rent = rent.lamports_per_byte_year * size;
    
    msg!("===== Rent Calculation =====");
    msg!("Account size: {} bytes", size);
    msg!("Minimum balance for rent exemption: {} lamports", minimum_balance);
    msg!("Yearly rent: {} lamports", yearly_rent);
    
    // Calculate rent for different account sizes
    let sizes = [0, 10, 100, 1000, 10000];
    msg!("\nRent for different account sizes:");
    
    for &s in sizes.iter() {
        let min_balance = rent.minimum_balance(s as usize);
        msg!("Size: {} bytes, Minimum balance: {} lamports", s, min_balance);
    }
    
    Ok(())
}

// Create PDA account
fn create_pda_account(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    space: u64,
    seed: &str,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    
    // Verify system program
    if system_program.key != &solana_program::system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    
    // Calculate PDA and bump seed
    let seeds = &[seed.as_bytes()];
    let (expected_pda, bump_seed) = Pubkey::find_program_address(seeds, program_id);
    
    // Verify provided PDA account matches calculated PDA
    if expected_pda != *pda_account.key {
        msg!("Error: PDA account does not match the derived address");
        msg!("Expected: {}", expected_pda);
        msg!("Provided: {}", pda_account.key);
        return Err(ProgramError::InvalidArgument);
    }
    
    // Get Rent sysvar
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space as usize);
    
    msg!("Creating PDA account with:");
    msg!("Seed: {}", seed);
    msg!("Bump seed: {}", bump_seed);
    msg!("Space: {} bytes", space);
    msg!("Lamports: {}", lamports);
    
    // Create PDA account
    let seeds_with_bump = &[seed.as_bytes(), &[bump_seed]];
    
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            pda_account.key,
            lamports,
            space,
            program_id,
        ),
        &[
            payer.clone(),
            pda_account.clone(),
            system_program.clone(),
        ],
        &[seeds_with_bump],
    )?;
    
    // Get current time and store in account data
    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;
    
    // Store timestamp in first 8 bytes of account data
    let mut data = pda_account.try_borrow_mut_data()?;
    let timestamp_bytes = timestamp.to_le_bytes();
    data[0..8].copy_from_slice(&timestamp_bytes);
    
    msg!("PDA account created successfully at timestamp: {}", timestamp);
    
    Ok(())
}

// Get account creation time
fn get_account_creation_time(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    account_seed: &str,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pda_account = next_account_info(account_info_iter)?;
    
    // Calculate PDA
    let seeds = &[account_seed.as_bytes()];
    let (expected_pda, _) = Pubkey::find_program_address(seeds, program_id);
    
    // Verify provided PDA account matches calculated PDA
    if expected_pda != *pda_account.key {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Read timestamp from account data
    let data = pda_account.try_borrow_data()?;
    if data.len() < 8 {
        return Err(ProgramError::InvalidAccountData);
    }
    
    let timestamp_bytes = [data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]];
    let creation_timestamp = i64::from_le_bytes(timestamp_bytes);
    
    // Get current time
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    
    // Calculate account age
    let account_age_seconds = current_timestamp - creation_timestamp;
    let account_age_days = account_age_seconds / (24 * 60 * 60);
    
    msg!("===== Account Creation Time =====");
    msg!("Account: {}", pda_account.key);
    msg!("Creation timestamp: {}", creation_timestamp);
    msg!("Current timestamp: {}", current_timestamp);
    msg!("Account age: {} seconds ({} days)", account_age_seconds, account_age_days);
    
    Ok(())
}

// Check if account needs to pay rent
fn check_rent_exemption(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    account_seed: &str,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pda_account = next_account_info(account_info_iter)?;
    
    // Calculate PDA
    let seeds = &[account_seed.as_bytes()];
    let (expected_pda, _) = Pubkey::find_program_address(seeds, program_id);
    
    // Verify provided PDA account matches calculated PDA
    if expected_pda != *pda_account.key {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Get Rent sysvar
    let rent = Rent::get()?;
    
    // Check if account is exempt from rent
    let is_exempt = rent.is_exempt(pda_account.lamports(), pda_account.data_len());
    
    msg!("===== Rent Exemption Check =====");
    msg!("Account: {}", pda_account.key);
    msg!("Account size: {} bytes", pda_account.data_len());
    msg!("Account balance: {} lamports", pda_account.lamports());
    msg!("Minimum required for exemption: {} lamports", 
         rent.minimum_balance(pda_account.data_len()));
    
    if is_exempt {
        msg!("Account IS exempt from rent");
    } else {
        msg!("Account is NOT exempt from rent");
        
        // Calculate additional lamports needed for exemption
        let required_lamports = rent.minimum_balance(pda_account.data_len())
            .saturating_sub(pda_account.lamports());
        
        msg!("Additional lamports needed for exemption: {}", required_lamports);
    }
    
    Ok(())
}

// Get multiple sysvars
fn show_multiple_sysvars() -> ProgramResult {
    // Get Clock
    let clock = Clock::get()?;
    
    // Get Rent
    let rent = Rent::get()?;
    
    // Get EpochSchedule
    let epoch_schedule = EpochSchedule::get()?;
    
    // Try to get other sysvars
    let fees_result = Fees::get();
    let slot_hashes_result = <SlotHashes as Sysvar>::get();   
    let slot_history_result = SlotHistory::get();
    let stake_history_result = <StakeHistory as Sysvar>::get();
    
    msg!("===== Multiple Sysvars =====");
    
    // Clock info
    msg!("\nClock:");
    msg!("  Slot: {}", clock.slot);
    msg!("  Epoch: {}", clock.epoch);
    msg!("  Unix Timestamp: {}", clock.unix_timestamp);
    
    // Rent info
    msg!("\nRent:");
    msg!("  Lamports per byte year: {}", rent.lamports_per_byte_year);
    msg!("  Exemption threshold: {}", rent.exemption_threshold);
    
    // EpochSchedule info
    msg!("\nEpochSchedule:");
    msg!("  Slots per epoch: {}", epoch_schedule.slots_per_epoch);
    
    // Other sysvars availability
    msg!("\nOther Sysvars Availability:");
    msg!("  Fees: {}", if fees_result.is_ok() { "Available" } else { "Not available" });
    msg!("  SlotHashes: {}", if slot_hashes_result.is_ok() { "Available" } else { "Not available" });
    msg!("  SlotHistory: {}", if slot_history_result.is_ok() { "Available" } else { "Not available" });
    msg!("  StakeHistory: {}", if stake_history_result.is_ok() { "Available" } else { "Not available" });
    
    Ok(())
}