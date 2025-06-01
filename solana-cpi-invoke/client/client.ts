import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const CLUSTER_URL = "http://127.0.0.1:8899";
const HELLO_WORLD_PROGRAM_ID = "7JL5oYxLowdhnd6fnDhD6tpXnBHZsPic6CbhRj4N2ZUh";
const CPI_INVOKE_PROGRAM_ID = "6V6Avvwk5ioT45USW9ziRJD6wSjNPPLYP2KkSnRmNnHH";

const connection = new Connection(CLUSTER_URL);

const helloWorldProgramId = new PublicKey(HELLO_WORLD_PROGRAM_ID);
const cpiInvokeProgramId = new PublicKey(CPI_INVOKE_PROGRAM_ID);

const payerKeypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");

const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
);

async function main() {
    const transaction = new Transaction();

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
            { pubkey: helloWorldProgramId, isSigner: false, isWritable: false },
        ],
        programId: cpiInvokeProgramId,
        data: Buffer.from([]),
    });

    transaction.add(instruction);

    console.log("Sending transaction...");

    try {
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
        console.log(`Transaction sent: ${signature}`);
    } catch (error) {
        console.error(error);
    }   
}

main();