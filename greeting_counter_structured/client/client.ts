import * as path from "path";
import * as fs from "fs";
import * as borsh from "borsh";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

class GreetingAccount {
    counter = 0;

    constructor(fields: { counter: number } | undefined = undefined) {
        if (fields && fields.counter) {
            this.counter = fields.counter;
        }
    }
}

const GreetingAccountSchema = new Map([
    [GreetingAccount, {
        kind: "struct",
        fields: [
            ["counter", "u32"]
        ]
    }]
]);

enum GreetingCounterInstruction {
    Increment = 0,
    SetCounter = 1,
}

class SetCounterInstructionData {
    value = 0;

    constructor(fields: { value: number } | undefined = undefined) {
        if (fields && fields.value) {
            this.value = fields.value;
        }
    }
}

const SetCounterInstructionDataSchema = new Map([
    [SetCounterInstructionData, {
        kind: "struct",
        fields: [
            ["value", "u32"]
        ]
    }]
]);

const KEYPAIR_PATH = path.resolve(process.env.HOME || "", ".config/solana/id.json");

const PROGRAM_ID = new PublicKey("9gsvY6Rju9rrDJexYhK3sggiVtY9gDxZDVcCtA5A2vtE");

async function main() {
    const connection = new Connection("http://127.0.0.1:8899", "confirmed");

    const secretKeyString = fs.readFileSync(KEYPAIR_PATH, { encoding: "utf-8" });
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    const payer = Keypair.fromSecretKey(secretKey);

    console.log(`Payer: ${payer.publicKey.toBase58()}`);

    const greetingAccount = Keypair.generate();
    console.log(`Greeting Account: ${greetingAccount.publicKey.toBase58()}`);

    const GREETING_SIZE = borsh.serialize(
        GreetingAccountSchema,
        new GreetingAccount(),
    ).length;
    console.log(`Greeting Account Size: ${GREETING_SIZE} bytes`);

    const lamports = await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);
    console.log(`Lamports for rent exemption: ${lamports}`);

    const createAccountTransaction = new Transaction();

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

    console.log("Creating greeting account on chain...");
    const createAccountTxHash = await sendAndConfirmTransaction(
        connection,
        createAccountTransaction,
        [payer, greetingAccount],
    );
    console.log(`Greeting account created: https://explorer.solana.com/tx/${createAccountTxHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);

    await getAndLogCounter(connection, greetingAccount.publicKey, "Initial");

    for (let i = 0; i < 2; i++) {
        console.log(`Sending transaction ${i + 1} to increment the counter...`);

        const incrementInstructionData = Buffer.from([GreetingCounterInstruction.Increment]);

        const incrementInstruction = new TransactionInstruction({
            keys: [{ pubkey: greetingAccount.publicKey, isSigner: false, isWritable: true }],
            programId: PROGRAM_ID,
            data: incrementInstructionData,        
        })

        const incrementTransaction = new Transaction();
        const { blockhash: incrementBlockhash } = await connection.getLatestBlockhash();
        incrementTransaction.recentBlockhash = incrementBlockhash;
        incrementTransaction.feePayer = payer.publicKey;

        incrementTransaction.add(incrementInstruction);

        const incrementTxHash = await sendAndConfirmTransaction(connection, incrementTransaction, [payer]);
        console.log(`Transaction ${i + 1} completed: https://explorer.solana.com/tx/${incrementTxHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);

        await getAndLogCounter(connection, greetingAccount.publicKey, `After increment ${i + 1}`);
    }

    // Send SetCounter transaction
    const newValue = 10;
    console.log(`Sending transaction to set the counter to ${newValue}...`);

    const setCounterPayload = new SetCounterInstructionData({ value: newValue });
    const serializedSetCounterPayload = borsh.serialize(SetCounterInstructionDataSchema, setCounterPayload);
    const setCounterInstructionData = Buffer.concat([
        Buffer.from([GreetingCounterInstruction.SetCounter]),
        Buffer.from(serializedSetCounterPayload),
    ]);

    const setCounterInstruction = new TransactionInstruction({
        keys: [{ pubkey: greetingAccount.publicKey, isSigner: false, isWritable: true }],
        programId: PROGRAM_ID,
        data: setCounterInstructionData,
    });
    
    const setCounterTransaction = new Transaction();
    const { blockhash: setCounterBlockhash } = await connection.getLatestBlockhash();
    setCounterTransaction.recentBlockhash = setCounterBlockhash;
    setCounterTransaction.feePayer = payer.publicKey;

    setCounterTransaction.add(setCounterInstruction);

    const setCounterTxHash = await sendAndConfirmTransaction(connection, setCounterTransaction, [payer]);
    console.log(`Transaction completed: https://explorer.solana.com/tx/${setCounterTxHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`);

    await getAndLogCounter(connection, greetingAccount.publicKey, `After setting counter to ${newValue}`);

    console.log("\nSuccess! All instructions tested.");
    console.log(`You can view the greeting account at: https://explorer.solana.com/address/${greetingAccount.publicKey.toBase58()}?cluster=custom&customUrl=${encodeURIComponent("http://127.0.0.1:8899")}`);
}

async function getAndLogCounter(connection: Connection, accountPubKey: PublicKey, label: string) {
    const accountInfo = await connection.getAccountInfo(accountPubKey);

    if (!accountInfo || !accountInfo.data) {
        console.error(`Error: Failed to retrieve account info for ${label}`);
        return;
    }

    try {
        const greeting = borsh.deserialize(GreetingAccountSchema, GreetingAccount, accountInfo.data);
        console.log(`${label} Greeting Counter: ${greeting.counter}`);
    } catch (error) {
        console.error(`Error: Failed to deserialize ${label} account data`, error);
    }
}

main().catch(console.error);