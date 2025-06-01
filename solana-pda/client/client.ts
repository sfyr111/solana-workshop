import { Connection, PublicKey } from "@solana/web3.js";

async function main() {
    console.log("=== client generate pda ===");

    const connection = new Connection("http://127.0.0.1:8899");

    await demonstrateBasicPDA();
  
    await demonstrateATACalculation();
}

async function demonstrateBasicPDA() {
    console.log("=== demonstrateBasicPDA ===");

    const programId = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");

    const seeds = [
        Buffer.from("user123"),
        Buffer.from("profile"),
    ];

    const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programId);

    console.log("Program ID: ", programId);
    console.log("Seed 1 (user_id): ", seeds[0]);
    console.log("Seed 2 (account_type): ", seeds[1]);
    console.log("Generated PDA: ", pda);
    console.log("Bump seed: ", bump);

    const combinedSeed = `${seeds[0]}-${seeds[1]}`;
    const seedsCombined = [Buffer.from(combinedSeed)];
    const [pdaCombined, bumpCombined] = PublicKey.findProgramAddressSync(seedsCombined, programId);

    console.log("\nSeed Order Importance Demo:");
    console.log("Combined seed: ", combinedSeed);
    console.log("PDA with combined seed: ", pdaCombined);
    console.log("Combined seed bump: ", bumpCombined);
    console.log("Are PDAs identical: ", pda.equals(pdaCombined));
}

async function demonstrateATACalculation() {
    console.log("=== demonstrateATACalculation ===");

    const splTokenAddr = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const ataProgramAddr = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

    const solAddr = new PublicKey("5pWae6RxD3zrYzBmPTMYo1LZ5vef3vfWH6iV3s8n6ZRG");
    const tokenAddr = new PublicKey("EUGfLUCBAMFvEDk1MZ2SbcZQ54mdczFyFkWVYvVVUcdF");

    const seeds = [
        solAddr.toBuffer(),
        splTokenAddr.toBuffer(),
        tokenAddr.toBuffer(),
    ];

    const [ataAddr, bump] = PublicKey.findProgramAddressSync(seeds, ataProgramAddr);

    console.log("SOL Wallet Address: ", solAddr);
    console.log("Token Mint Address: ", tokenAddr);
    console.log("SPL Token Program ID: ", splTokenAddr);
    console.log("ATA Program ID: ", ataProgramAddr);
    console.log("Calculated ATA Address: ", ataAddr);
    console.log("ATA Bump: ", bump);
    
    // Verify if it matches the address created via command line
    const expectedAta = "7X8RKbXhxGATEHwXPVWvZFDL5yZwgf9YyActE93wyhku";
    console.log("\nVerification Results:");
    console.log("Expected ATA Address: ", expectedAta);
    console.log("Calculated ATA Address: ", ataAddr);
    console.log("Addresses Match: ", expectedAta == ataAddr.toString());
}

main();