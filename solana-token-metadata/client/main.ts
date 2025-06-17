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
// Import SPL Token program ID for PDA derivation
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
// Import borsh for data serialization/deserialization
import * as borsh from "borsh";
// Import Node.js modules for file system operations
import fs from "fs";
import path from "path";


// Configuration constants
const CLUSTER_URL = "http://127.0.0.1:8899";  // Local Solana test validator URL
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
 * Main demonstration function that showcases all token metadata operations
 *
 * This function demonstrates the complete workflow:
 * 1. Register new metadata for a token
 * 2. Read the registered metadata
 * 3. Update the metadata with new information
 * 4. Read the updated metadata to verify changes
 *
 * Note: This uses a mock mint address for demonstration purposes.
 * In a real application, you would use an actual SPL token mint address.
 */
async function main() {
    try {
        console.log("=== Solana Token Metadata Client ===");
        console.log(`Program ID: ${programId.toBase58()}`);
        console.log(`Payer: ${payer.publicKey.toBase58()}`);

        // For demonstration, we'll create a mock mint address
        // In a real scenario, you would use an actual SPL token mint
        const mockMint = Keypair.generate().publicKey;
        console.log(`\nUsing mock mint: ${mockMint.toBase58()}`);

        // Step 1: Register metadata for the token
        console.log("\n1. Registering metadata...");
        await registerMetadata(
            mockMint,
            "My Token",                          // Token name
            "MTK",                               // Token symbol
            "https://example.com/icon.png",      // Icon URL
            "https://example.com"                // Homepage URL
        );

        // Step 2: Read and display the registered metadata
        console.log("\n2. Reading metadata...");
        await readMetadata(mockMint);

        // Step 3: Update the metadata with new information
        console.log("\n3. Updating metadata...");
        await updateMetadata(
            mockMint,
            "Updated Token",                     // New token name
            "UTK",                               // New token symbol
            "https://new.com/icon.png",          // New icon URL
            "https://new.com"                    // New homepage URL
        );

        // Step 4: Read and display the updated metadata
        console.log("\n4. Reading updated metadata...");
        await readMetadata(mockMint);

        console.log("\n=== Demo completed successfully! ===");

    } catch (error) {
        console.error("Error in main:", error);
    }
}

/**
 * Entry point: Run the main function if this file is executed directly
 * This allows the file to be imported as a module without automatically running the demo
 */
if (require.main === module) {
    main().catch(console.error);
}