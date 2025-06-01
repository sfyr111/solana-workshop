import { PublicKey, sendAndConfirmTransaction, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getConnection, loadAccountInfo, loadWallet, programId } from '../utils';
import { createInstructionData, MemoInstruction } from '../memo';

async function updateMemo(memoAccount: PublicKey, content: string) {
    try {
        const connection = getConnection();
        const authority = loadWallet();
        
        console.log('wallet: ', authority.publicKey.toBase58());
        console.log('update memo: ', memoAccount.toBase58());

        const data = createInstructionData(MemoInstruction.Update, content);

        const instruction = new TransactionInstruction({
            keys: [
                {
                    pubkey: authority.publicKey, 
                    isSigner: true,
                    isWritable: true,
                },
                {
                    pubkey: memoAccount,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            programId: programId,
            data: data,
        });

        const tx = new Transaction().add(instruction);
        const txHash = await sendAndConfirmTransaction(connection, tx, [authority]);

        console.log('update memo successful: ', txHash);

        return true;
        } catch (error) {
        console.error('update memo fail: ', error);
        throw error;
    }
}

const content = process.argv[2];
const label = process.argv[3] || 'memo';

if (!content) {
  console.error('Please provide memo content');
  process.exit(1);
}

try {
  const memoAccount = loadAccountInfo(label);
  
  updateMemo(memoAccount, content).catch(err => {
    console.error(err);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}