import { Keypair, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getConnection, loadWallet, programId, saveAccountInfo } from '../utils';
import { MemoInstruction, createInstructionData } from '../memo';

async function createMemo(content: string, label: string = 'memo') {
    try {
        const connection = getConnection();
        const payer = loadWallet();
        
        console.log('use wallet', payer.publicKey.toBase58());

        const memoKeypair = Keypair.generate();

        const data = createInstructionData(MemoInstruction.Initialize, content);

        const instruction = new TransactionInstruction({
            keys: [
                {
                    pubkey: payer.publicKey,
                    isSigner: true,
                    isWritable: true,
                },
                {
                    pubkey: memoKeypair.publicKey,
                    isSigner: true,
                    isWritable: true,
                },
                {
                    pubkey: payer.publicKey,
                    isSigner: true,
                    isWritable: false,
                },
                {
                    pubkey: SystemProgram.programId,
                    isSigner: false,
                    isWritable: false,
                },
            ],
            programId: programId,
            data: data,
        });

        const tx = new Transaction().add(instruction);
        const txHash = await sendAndConfirmTransaction(connection, tx, [payer, memoKeypair]);
        console.log('tx hash', txHash);
        console.log('memo account', memoKeypair.publicKey.toBase58());

        saveAccountInfo(label, memoKeypair.publicKey.toBase58());

    } catch (error) {
        console.error('Error creating memo', error);
        throw error;
    }
}

const content = process.argv[2] || 'memo content';
const label = process.argv[3] || 'memo';

createMemo(content, label).catch(console.error);