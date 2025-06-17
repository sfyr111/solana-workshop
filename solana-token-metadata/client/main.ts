// Import necessary Solana web3.js components for blockchain interaction
import {
    Connection,
    Keypair,
    PublicKey,
    TransactionInstruction,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction
} from "@solana/web3.js";
// Import SPL Token utilities for real token creation and management
import {
    TOKEN_PROGRAM_ID,
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    getAccount
} from "@solana/spl-token";
// Import borsh for data serialization/deserialization
import * as borsh from "borsh";
// Import Node.js modules for file system operations
import fs from "fs";
import path from "path";


// Configuration constants - you can switch between local and devnet
const USE_DEVNET = process.env.USE_DEVNET === 'true';  // Set USE_DEVNET=true to use devnet
const CLUSTER_URL = USE_DEVNET ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899";
const PROGRAM_ID = "CpW3JJUyddDpwv4gLRYsgx4EeChfqC1pjn5czF9UQX59";  // Deployed token metadata program ID

// Initialize connection to Solana cluster
const connection = new Connection(CLUSTER_URL);
const programId = new PublicKey(PROGRAM_ID);

// Load the payer keypair from the default Solana CLI location
const payerKeypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
);

/**
 * TokenMetadata class represents the structure of token metadata stored on-chain
 * This must match the TokenMetadata struct defined in the Rust program
 */
class TokenMetadata {
    mint: Uint8Array;    // 32-byte public key of the token mint
    name: string;        // Human-readable name of the token
    symbol: string;      // Short symbol/ticker for the token
    icon: string;        // URL to the token's icon image
    home: string;        // URL to the token's homepage or project website

    /**
     * Constructor for TokenMetadata
     * @param props - Object containing all metadata fields
     */
    constructor(props: {
        mint: Uint8Array;
        name: string;
        symbol: string;
        icon: string;
        home: string;
    }) {
        this.mint = props.mint;
        this.name = props.name;
        this.symbol = props.symbol;
        this.icon = props.icon;
        this.home = props.home;
    }

    /**
     * Borsh serialization schema for TokenMetadata
     * Defines how the data should be serialized/deserialized
     */
    static schema = new Map([
        [
           TokenMetadata,
           {
                kind: 'struct',
                fields: [
                    ['mint', [32]],      // Fixed 32-byte array for public key
                    ['name', 'string'],   // Variable-length string
                    ['symbol', 'string'], // Variable-length string
                    ['icon', 'string'],   // Variable-length string
                    ['home', 'string'],   // Variable-length string
                ]
           }
        ]
    ]);
}

/**
 * Instruction data structures that match the Rust enum TokenMetadataInstruction
 * This class provides static methods to create properly serialized instruction data
 * for the Solana token metadata program
 */
class TokenMetadataInstructionData {
    /**
     * Creates instruction data for registering new token metadata
     *
     * @param name - The name of the token
     * @param symbol - The symbol/ticker of the token
     * @param icon - URL to the token's icon image
     * @param home - URL to the token's homepage
     * @returns Buffer containing the serialized instruction data
     */
    static createRegisterMetadata(name: string, symbol: string, icon: string, home: string): Buffer {
        const schema = new Map([
            [
                Object,
                {
                    kind: 'struct',
                    fields: [
                        ['variant', 'u8'],      // Enum variant discriminator (0 for RegisterMetadata)
                        ['name', 'string'],     // Token name
                        ['symbol', 'string'],   // Token symbol
                        ['icon', 'string'],     // Icon URL
                        ['home', 'string'],     // Homepage URL
                    ]
                }
            ]
        ]);

        const data = borsh.serialize(schema, {
            variant: 0, // RegisterMetadata variant
            name,
            symbol,
            icon,
            home,
        });

        return Buffer.from(data);
    }

    /**
     * Creates instruction data for updating existing token metadata
     *
     * @param name - The new name of the token
     * @param symbol - The new symbol/ticker of the token
     * @param icon - New URL to the token's icon image
     * @param home - New URL to the token's homepage
     * @returns Buffer containing the serialized instruction data
     */
    static createUpdateMetadata(name: string, symbol: string, icon: string, home: string): Buffer {
        const schema = new Map([
            [
                Object,
                {
                    kind: 'struct',
                    fields: [
                        ['variant', 'u8'],      // Enum variant discriminator (1 for UpdateMetadata)
                        ['name', 'string'],     // New token name
                        ['symbol', 'string'],   // New token symbol
                        ['icon', 'string'],     // New icon URL
                        ['home', 'string'],     // New homepage URL
                    ]
                }
            ]
        ]);

        const data = borsh.serialize(schema, {
            variant: 1, // UpdateMetadata variant
            name,
            symbol,
            icon,
            home,
        });

        return Buffer.from(data);
    }
}



/**
 * Helper function to derive the Program Derived Address (PDA) for token metadata
 *
 * The PDA is calculated using:
 * - The string "metadata" as a seed
 * - The SPL Token program ID
 * - The mint public key
 *
 * This must match the PDA derivation logic in the Rust program
 *
 * @param mint - The public key of the token mint
 * @returns A tuple containing [PDA public key, bump seed]
 */
function getMetadataPDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),        // Static seed string
            TOKEN_PROGRAM_ID.toBuffer(),    // SPL Token program ID
            mint.toBuffer(),                // Token mint public key
        ],
        programId                           // Our token metadata program ID
    );
}

/**
 * Request airdrop if needed (for devnet)
 *
 * @returns Promise<void>
 */
async function ensureFunding(): Promise<void> {
    if (USE_DEVNET) {
        const balance = await connection.getBalance(payer.publicKey);
        const requiredBalance = 2 * 1000000000; // 2 SOL in lamports

        if (balance < requiredBalance) {
            console.log("💰 Requesting airdrop for devnet...");
            const signature = await connection.requestAirdrop(payer.publicKey, requiredBalance);
            await connection.confirmTransaction(signature);
            console.log("✅ Airdrop completed");
        }
    }
}

/**
 * Create a real SPL token mint
 *
 * @returns Promise<PublicKey> - The mint address of the created token
 */
async function createRealToken(): Promise<PublicKey> {
    console.log("🪙 Creating SPL token mint...");

    const mint = await createMint(
        connection,
        payer,                    // Payer for the transaction
        payer.publicKey,          // Mint authority (who can mint tokens)
        payer.publicKey,          // Freeze authority (who can freeze accounts)
        9                         // Number of decimals (9 is standard for most tokens)
    );

    console.log(`✅ Token mint created: ${mint.toBase58()}`);
    return mint;
}

/**
 * Create token account and mint some tokens to demonstrate real token functionality
 *
 * @param mint - The mint address of the token
 * @returns Promise<void>
 */
async function mintTokensToAccount(mint: PublicKey): Promise<void> {
    console.log("💳 Creating token account and minting tokens...");

    // Create an associated token account for the payer
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,                    // Payer for the transaction
        mint,                     // Token mint
        payer.publicKey           // Owner of the token account
    );

    console.log(`✅ Token account created: ${tokenAccount.address.toBase58()}`);

    // Mint 1000 tokens to the account
    const mintAmount = 1000 * Math.pow(10, 9); // 1000 tokens with 9 decimals
    await mintTo(
        connection,
        payer,                    // Payer for the transaction
        mint,                     // Token mint
        tokenAccount.address,     // Destination token account
        payer,                    // Mint authority
        mintAmount                // Amount to mint
    );

    console.log(`✅ Minted ${mintAmount / Math.pow(10, 9)} tokens to account`);

    // Verify the balance to confirm minting worked
    const accountInfo = await getAccount(connection, tokenAccount.address);
    console.log(`✅ Token account balance: ${Number(accountInfo.amount) / Math.pow(10, 9)} tokens`);
}

/**
 * Registers new metadata for a token mint
 *
 * This function creates a new metadata account (PDA) for the specified token mint
 * and stores the provided metadata information on-chain.
 *
 * @param mint - Public key of the token mint
 * @param name - Human-readable name of the token
 * @param symbol - Short symbol/ticker for the token (e.g., "BTC", "ETH")
 * @param icon - URL pointing to the token's icon image
 * @param home - URL pointing to the token's homepage or project website
 * @returns Promise<string> - Transaction signature of the registration
 */
async function registerMetadata(
    mint: PublicKey,
    name: string,
    symbol: string,
    icon: string,
    home: string
): Promise<string> {
    // Derive the metadata PDA address for this mint
    const [metadataPDA] = getMetadataPDA(mint);

    // Create the instruction data for registering metadata
    const instructionData = TokenMetadataInstructionData.createRegisterMetadata(
        name,
        symbol,
        icon,
        home
    );

    // Create the transaction instruction with all required accounts
    const transactionInstruction = new TransactionInstruction({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },           // [0] authority (payer)
            { pubkey: metadataPDA, isSigner: false, isWritable: true },               // [1] metadata account (PDA)
            { pubkey: mint, isSigner: false, isWritable: false },                     // [2] mint account
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },        // [3] SPL Token program
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // [4] system program
        ],
        programId,
        data: instructionData,
    });

    const transaction = new Transaction().add(transactionInstruction);

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer]
    );

    console.log(`Metadata registered successfully! Signature: ${signature}`);
    console.log(`Metadata PDA: ${metadataPDA.toBase58()}`);

    return signature;
}

/**
 * Updates existing token metadata
 * This function can handle account resizing if the new metadata requires different storage space
 *
 * @param mint - Public key of the token mint
 * @param name - New name for the token
 * @param symbol - New symbol for the token
 * @param icon - New icon URL for the token
 * @param home - New homepage URL for the token
 * @returns Promise<string> - Transaction signature
 */
async function updateMetadata(
    mint: PublicKey,
    name: string,
    symbol: string,
    icon: string,
    home: string
): Promise<string> {
    // Derive the metadata PDA address
    const [metadataPDA] = getMetadataPDA(mint);

    // Create the instruction data for updating metadata
    const instructionData = TokenMetadataInstructionData.createUpdateMetadata(
        name,
        symbol,
        icon,
        home
    );

    // Create the transaction instruction with all required accounts
    const transactionInstruction = new TransactionInstruction({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },    // [0] authority (writable for potential lamport transfer)
            { pubkey: metadataPDA, isSigner: false, isWritable: true },       // [1] metadata account (writable)
            { pubkey: mint, isSigner: false, isWritable: false },             // [2] mint account
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // [3] SPL Token program
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // [4] system program (for reallocation)
        ],
        programId,
        data: instructionData,
    });

    const transaction = new Transaction().add(transactionInstruction);

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer]
    );

    console.log(`Metadata updated successfully! Signature: ${signature}`);

    return signature;
}

/**
 * Reads and deserializes token metadata from the blockchain
 *
 * This function fetches the metadata account for the specified token mint
 * and deserializes the stored metadata information.
 *
 * @param mint - Public key of the token mint
 * @returns Promise<TokenMetadata | null> - The metadata object or null if not found
 */
async function readMetadata(mint: PublicKey): Promise<TokenMetadata | null> {
    // Derive the metadata PDA address for this mint
    const [metadataPDA] = getMetadataPDA(mint);

    try {
        // Fetch the account data from the blockchain
        const accountInfo = await connection.getAccountInfo(metadataPDA);

        if (!accountInfo || !accountInfo.data) {
            console.log("Metadata account not found");
            return null;
        }

        // Deserialize the metadata from the account data
        // The account resizing fix in the contract ensures clean data without extra bytes
        const metadata = borsh.deserialize(
            TokenMetadata.schema,
            TokenMetadata,
            accountInfo.data
        );

        console.log("Token Metadata:");
        console.log(`  Mint: ${new PublicKey(metadata.mint).toBase58()}`);
        console.log(`  Name: ${metadata.name}`);
        console.log(`  Symbol: ${metadata.symbol}`);
        console.log(`  Icon: ${metadata.icon}`);
        console.log(`  Home: ${metadata.home}`);

        return metadata;
    } catch (error) {
        console.error("Error reading metadata:", error);
        return null;
    }
}

/**
 * Main demonstration function that showcases all token metadata operations with real SPL tokens
 *
 * This function demonstrates the complete workflow:
 * 1. Create a real SPL token mint
 * 2. Create token accounts and mint tokens
 * 3. Register metadata for the token
 * 4. Read the registered metadata
 * 5. Update the metadata with new information
 * 6. Read the updated metadata to verify changes
 *
 * This creates actual SPL tokens that can be used in the real Solana ecosystem.
 */
async function main() {
    try {
        console.log("🚀 === Solana Token Metadata Client with Real SPL Tokens ===");
        console.log(`🌐 Network: ${USE_DEVNET ? 'Devnet' : 'Local'}`);
        console.log(`📋 Program ID: ${programId.toBase58()}`);
        console.log(`👤 Payer: ${payer.publicKey.toBase58()}`);

        // Step 1: Ensure funding (for devnet)
        await ensureFunding();

        // Step 2: Create a real SPL token mint
        console.log("\n🪙 === Creating Real SPL Token ===");
        const mint = await createRealToken();

        // Step 3: Create token account and mint tokens to demonstrate real functionality
        await mintTokensToAccount(mint);

        // Step 4: Register metadata for the token
        console.log("\n📝 === Registering Token Metadata ===");
        await registerMetadata(
            mint,
            "Awesome Demo Token",                        // Token name
            "ADT",                                       // Token symbol
            "https://example.com/awesome-token-icon.png", // Icon URL
            "https://awesome-token.example.com"          // Homepage URL
        );

        // Step 5: Read and display the registered metadata
        console.log("\n📖 === Reading Token Metadata ===");
        await readMetadata(mint);

        // Step 6: Update the metadata with new information
        console.log("\n🔄 === Updating Token Metadata ===");
        await updateMetadata(
            mint,
            "Super Awesome Token",                       // New token name
            "SAT",                                       // New token symbol
            "https://new.com/super-awesome-icon.png",    // New icon URL
            "https://super-awesome.example.com"          // New homepage URL
        );

        // Step 7: Read and display the updated metadata
        console.log("\n📖 === Reading Updated Metadata ===");
        await readMetadata(mint);

        console.log("\n🎉 === Demo completed successfully! ===");
        console.log(`\n💡 Your real SPL token mint address: ${mint.toBase58()}`);
        console.log("💡 You can use this mint address to interact with your token in wallets and dApps!");
        console.log(`💡 Network: ${USE_DEVNET ? 'Devnet' : 'Local testnet'}`);

    } catch (error) {
        console.error("❌ Error in main:", error);
    }
}

/**
 * Entry point: Run the main function if this file is executed directly
 * This allows the file to be imported as a module without automatically running the demo
 */
if (require.main === module) {
    main().catch(console.error);
}