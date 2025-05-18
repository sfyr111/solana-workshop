import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmRawTransaction, sendAndConfirmTransaction, Transaction, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const CLUSTER_URL = "http://127.0.0.1:8899";
const PROGRAM_ID = "7JL5oYxLowdhnd6fnDhD6tpXnBHZsPic6CbhRj4N2ZUh";

const connection = new Connection(CLUSTER_URL);

const programId = new PublicKey(PROGRAM_ID);

const payerKeypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");

const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
);

async function main() {
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < LAMPORTS_PER_SOL * 0.01) {
        console.log("Insufficient balance");
    }

    const transaction = new Transaction();

    const instruction = new TransactionInstruction({
        keys: [],
        programId,
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