import {
    Connection,
    Keypair,
    PublicKey,
    TransactionInstruction,
    Transaction,
    SystemProgram,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as borsh from "borsh";
import fs from "fs";
import path from "path";


const CLUSTER_URL = "http://127.0.0.1:8899";
const PROGRAM_ID = "8n8w2dxogLdTJ3fcYoopN2DTQ6ZvmpRqJNdoxKK55tHz";

const connection = new Connection(CLUSTER_URL);
const programId = new PublicKey(PROGRAM_ID);
const payerKeypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
);

class TokenMetadata {
    mint: Uint8Array;
    name: string;
    symbol: string;
    icon: string;
    home: string;

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

    static schema = new Map([
        [
           TokenMetadata,
           {
                kind: 'struct',
                fields: [
                    ['mint', [32]],
                    ['name', 'string'],
                    ['symbol', 'string'],
                    ['icon', 'string'],
                    ['home', 'string'],
                ]
           }   
        ]
    ]);
}

// Instruction data structures that match the Rust enum
class TokenMetadataInstructionData {
    static createRegisterMetadata(name: string, symbol: string, icon: string, home: string): Buffer {
        const schema = new Map([
            [
                Object,
                {
                    kind: 'struct',
                    fields: [
                        ['variant', 'u8'],
                        ['name', 'string'],
                        ['symbol', 'string'],
                        ['icon', 'string'],
                        ['home', 'string'],
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

    static createUpdateMetadata(name: string, symbol: string, icon: string, home: string): Buffer {
        const schema = new Map([
            [
                Object,
                {
                    kind: 'struct',
                    fields: [
                        ['variant', 'u8'],
                        ['name', 'string'],
                        ['symbol', 'string'],
                        ['icon', 'string'],
                        ['home', 'string'],
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



// Helper function to derive metadata PDA
function getMetadataPDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        programId
    );
}

// Function to register token metadata
async function registerMetadata(
    mint: PublicKey,
    name: string,
    symbol: string,
    icon: string,
    home: string
): Promise<string> {
    const [metadataPDA] = getMetadataPDA(mint);

    const instructionData = TokenMetadataInstructionData.createRegisterMetadata(
        name,
        symbol,
        icon,
        home
    );

    const transactionInstruction = new TransactionInstruction({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
            { pubkey: metadataPDA, isSigner: false, isWritable: true },     // metadata account
            { pubkey: mint, isSigner: false, isWritable: false },           // mint account
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // SPL Token program
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
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

// Function to update token metadata
async function updateMetadata(
    mint: PublicKey,
    name: string,
    symbol: string,
    icon: string,
    home: string
): Promise<string> {
    const [metadataPDA] = getMetadataPDA(mint);

    const instructionData = TokenMetadataInstructionData.createUpdateMetadata(
        name,
        symbol,
        icon,
        home
    );

    const transactionInstruction = new TransactionInstruction({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
            { pubkey: metadataPDA, isSigner: false, isWritable: true },     // metadata account
            { pubkey: mint, isSigner: false, isWritable: false },           // mint account
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // SPL Token program
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

// Function to read token metadata
async function readMetadata(mint: PublicKey): Promise<TokenMetadata | null> {
    const [metadataPDA] = getMetadataPDA(mint);

    try {
        const accountInfo = await connection.getAccountInfo(metadataPDA);

        if (!accountInfo || !accountInfo.data) {
            console.log("Metadata account not found");
            return null;
        }

        // Deserialize the metadata
        // Note: If there are extra bytes due to account size being larger than needed,
        // we'll try to deserialize anyway and handle the error gracefully
        let metadata;
        try {
            metadata = borsh.deserialize(
                TokenMetadata.schema,
                TokenMetadata,
                accountInfo.data
            );
        } catch (error) {
            console.log("Warning: Could not deserialize metadata, possibly due to extra bytes in account");
            console.log("This can happen when updated data is shorter than original data");
            console.log("Error:", error instanceof Error ? error.message : String(error));
            return null;
        }

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

// Main function to demonstrate the functionality
async function main() {
    try {
        console.log("=== Solana Token Metadata Client ===");
        console.log(`Program ID: ${programId.toBase58()}`);
        console.log(`Payer: ${payer.publicKey.toBase58()}`);

        // For demonstration, we'll create a mock mint address
        // In a real scenario, you would use an actual SPL token mint
        const mockMint = Keypair.generate().publicKey;
        console.log(`\nUsing mock mint: ${mockMint.toBase58()}`);

        // Register metadata
        console.log("\n1. Registering metadata...");
        await registerMetadata(
            mockMint,
            "My Token",
            "MTK",
            "https://example.com/icon.png",
            "https://example.com"
        );

        // Read metadata
        console.log("\n2. Reading metadata...");
        await readMetadata(mockMint);

        // Update metadata (using shorter strings to fit in existing account)
        console.log("\n3. Updating metadata...");
        await updateMetadata(
            mockMint,
            "Updated Token",  // Shorter name
            "UTK",           // Shorter symbol
            "https://new.com/icon.png",  // Shorter URL
            "https://new.com"            // Shorter URL
        );

        // Read updated metadata
        console.log("\n4. Reading updated metadata...");
        await readMetadata(mockMint);

        console.log("\n=== Demo completed successfully! ===");

    } catch (error) {
        console.error("Error in main:", error);
    }
}

// Run the main function
if (require.main === module) {
    main().catch(console.error);
}