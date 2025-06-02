import * as borsh from 'borsh';
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const CLUSTER_URL = "http://127.0.0.1:8899";
const VAULT_PROGRAM_ID = "DARmuF4CNQuzesQgTu8VvJ9z8rnytHC2BaZrMHK6kBqA";

const connection = new Connection(CLUSTER_URL);
const vaultProgramId = new PublicKey(VAULT_PROGRAM_ID);
const payerKeypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
);

class InstructionData {
    vault_bump_seed: number;
    lamports: bigint;

    constructor(fields: { vault_bump_seed: number, lamports: number }) {
        this.vault_bump_seed = fields.vault_bump_seed;
        this.lamports = BigInt(fields.lamports);
    }
    
    static schema = new Map([
        [
            InstructionData, 
            {
                kind: 'struct',
                fields: [
                    ['vault_bump_seed', 'u8'],
                    ['lamports', 'u64'],
                ]
            }
        ]
    ]);
}

async function main() {
    console.log("Starting vault creation...");
    console.log("Payer public key:", payer.publicKey.toBase58());
    
    // Calculate PDA address
    const [vaultPda, bumpSeed] = await PublicKey.findProgramAddress(
        [
            Buffer.from("vault"),
            payer.publicKey.toBuffer(),
        ],
        vaultProgramId
    );
    
    console.log("Vault PDA:", vaultPda.toBase58());
    console.log("Bump seed:", bumpSeed);
    
    // Prepare instruction data
    const instructionData = new InstructionData({
        vault_bump_seed: bumpSeed,
        lamports: 100000000, // 0.1 SOL
    });
    
    // Serialize instruction data
    const serializedData = borsh.serialize(
        InstructionData.schema,
        instructionData
    );
    
    const transaction = new Transaction();

    // Create instruction
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: vaultProgramId,
        data: Buffer.from(serializedData),
    });

    transaction.add(instruction);

    console.log("Sending transaction...");

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
        console.log(`Transaction sent successfully!`);
        console.log(`Signature: ${signature}`);
        console.log(`View transaction: https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(CLUSTER_URL)}`);
    } catch (error) {
        console.error("Error sending transaction:", error);
    }   
}

main().catch(err => {
    console.error("Fatal error:", err);
});