use solana_program::pubkey::Pubkey;
use std::str::FromStr;

fn main() {
    println!("=== Solana PDA ===");
    demonstrate_basic_pda();
    demonstrate_ata_calculation();
}

fn demonstrate_basic_pda() {
    println!("=== Basic PDA ===");

    let program_id = Pubkey::from_str("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8").unwrap();

    let user_id = "user123";
    let account_type = "profile";

    let seeds = &[
        user_id.as_bytes(),
        account_type.as_bytes(),
    ];

    let (pda, bump) = Pubkey::find_program_address(seeds, &program_id);

    println!("Program ID: {}", program_id);
    println!("Seed 1 (user_id): {}", user_id);
    println!("Seed 2 (account_type): {}", account_type);
    println!("Generated PDA: {}", pda);
    println!("Bump seed: {}", bump);

    let combined_seed = format!("{}-{}", user_id, account_type);
    let seeds_combined = &[combined_seed.as_bytes()];
    let (pda_combined, bump_combined) = Pubkey::find_program_address(seeds_combined, &program_id);

    println!("\nSeed Order Importance Demo:");
    println!("Combined seed: {}", combined_seed);
    println!("PDA with combined seed: {}", pda_combined);
    println!("Combined seed bump: {}", bump_combined);
    println!("Are PDAs identical: {}", pda == pda_combined);
}

fn demonstrate_ata_calculation() {
    println!("=== ATA Calculation ===");

    let spl_token_addr = Pubkey::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap(); // spl token address
    let ata_program_addr = Pubkey::from_str("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL").unwrap(); // ata program address

    let sol_addr = Pubkey::from_str("5pWae6RxD3zrYzBmPTMYo1LZ5vef3vfWH6iV3s8n6ZRG").unwrap(); // user's wallet sol address
    let token_addr = Pubkey::from_str("EUGfLUCBAMFvEDk1MZ2SbcZQ54mdczFyFkWVYvVVUcdF").unwrap(); // spl token mint address

    // seeds rule: 
    // 1. wallet address
    // 2. spl token program address
    // 3. token mint address
    let seeds = [
        &sol_addr.to_bytes()[..], // wallet address
        &spl_token_addr.to_bytes()[..], // spl token program address
        &token_addr.to_bytes()[..], // token mint address
    ];

    let (ata_addr, bump) = Pubkey::find_program_address(&seeds[..], &ata_program_addr);
    println!("SOL Wallet Address: {}", sol_addr);
    println!("Token Mint Address: {}", token_addr);
    println!("SPL Token Program ID: {}", spl_token_addr);
    println!("ATA Program ID: {}", ata_program_addr);
    println!("Calculated ATA Address: {}", ata_addr);
    println!("ATA Bump: {}", bump);
    
    // Verify if it matches the address created via command line
    let expected_ata = "7X8RKbXhxGATEHwXPVWvZFDL5yZwgf9YyActE93wyhku";
    println!("\nVerification Results:");
    println!("Expected ATA Address: {}", expected_ata);
    println!("Calculated ATA Address: {}", ata_addr);
    println!("Addresses Match: {}", expected_ata == ata_addr.to_string());
}
