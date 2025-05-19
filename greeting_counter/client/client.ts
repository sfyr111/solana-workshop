import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as path from "path";
import * as fs from "fs";
import * as borsh from "borsh";

class GreetingAccount {
    counter = 0;

    constructor(fields: { counter: number } | undefined = undefined) {
        if (fields && fields.counter) {
            this.counter = fields.counter;
        }
    }
}

// Define the borsh schema as a plain object
const GreetingSchema: borsh.Schema = new Map([
    [GreetingAccount, {
      kind: "struct",
      fields: [
        ["counter", "u32"]
      ]
    }]
  ]);

const KEYPAIR_PATH = path.resolve(process.env.HOME || "", ".config/solana/id.json");

const PROGRAM_ID = new PublicKey("Dh7rYh3oeoKKsTkDUM7otJuL9zFLus9WQ4kWeak3RL7b");

async function main() {
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");

    const secretKeyString = fs.readFileSync(KEYPAIR_PATH, { encoding: "utf-8" });
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    const payer = Keypair.fromSecretKey(secretKey);

    console.log(`Payer: ${payer.publicKey.toBase58()}`);

    const greetingAccount = Keypair.generate();
    console.log(`Greeting Account: ${greetingAccount.publicKey.toBase58()}`);

    // Cast the schema appropriately and specify the class name
    const GREETING_SIZE = borsh.serialize(
        GreetingSchema,
        new GreetingAccount(),
    ).length;
    console.log(`Greeting Account Size: ${GREETING_SIZE} bytes`);

    const lamports = await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);
    console.log(`Lamports: ${lamports}`);

    // Create account transaction
    const createAccountTransaction = new Transaction();
    
    // Get a recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    createAccountTransaction.recentBlockhash = blockhash;
    createAccountTransaction.feePayer = payer.publicKey;
    
    createAccountTransaction.add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: greetingAccount.publicKey,
            lamports,
            space: GREETING_SIZE,
            programId: PROGRAM_ID,
        })
    );

    console.log('Creating greeting account on chain...');
    const createAccountTxHash = await sendAndConfirmTransaction(
        connection, 
        createAccountTransaction, 
        [payer, greetingAccount]
    );
    console.log(`Account creation tx hash: ${createAccountTxHash}`);
    console.log(`View tx: https://explorer.solana.com/tx/${createAccountTxHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);
    
    for (let i = 0; i < 3; i++) {
        const instruction = new TransactionInstruction({
            keys: [{ pubkey: greetingAccount.publicKey, isSigner: false, isWritable: true }],
            programId: PROGRAM_ID,
            data: Buffer.from([]),
        });

        // Create a new transaction with a recent blockhash
        const transaction = new Transaction();
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = payer.publicKey;
        transaction.add(instruction);

        console.log(`Sending transaction ${i + 1} to increment the counter...`);
        const txHash = await sendAndConfirmTransaction(connection, transaction, [payer]);
        console.log(`Transaction ${i + 1} hash: ${txHash}`);
        console.log(`View tx: https://explorer.solana.com/tx/${txHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);

        const accountInfo = await connection.getAccountInfo(greetingAccount.publicKey);

        if (!accountInfo || !accountInfo.data) {
            throw new Error("Error: Failed to retrieve greeting account info");
        }

        const greeting = borsh.deserialize(GreetingSchema, GreetingAccount, accountInfo.data);
        console.log(`Greeting Counter: ${greeting.counter}`);
    }

    console.log("Success! The counter was incremented 3 times");
    console.log(`You can view the greeting account at: https://explorer.solana.com/address/${greetingAccount.publicKey.toBase58()}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);
}

main().catch(console.error);