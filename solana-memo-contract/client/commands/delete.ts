import { getConnection, loadAccountInfo, loadWallet, programId } from '../utils';
import { createInstructionData, MemoInstruction } from '../memo';
import { PublicKey, sendAndConfirmTransaction, Transaction, TransactionInstruction } from '@solana/web3.js';
import * as path from 'path';
import * as fs from 'fs';

async function deleteMemo(memoAccount: PublicKey) {
    try {
        const connection = getConnection();
        const authority = loadWallet();

        console.log('wallet:', authority.publicKey.toBase58());
        console.log('delete memo:', memoAccount.toBase58());
        
        const data = createInstructionData(MemoInstruction.Delete);

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
                { // reciver
                    pubkey: authority.publicKey,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            programId: programId,
            data: data,
        });

        const tx = new Transaction().add(instruction);
        const txHash = await sendAndConfirmTransaction(connection, tx, [authority]);
        console.log('Memo deleted successfully:', txHash);
        
        return true;
      } catch (error) {
        console.error('Failed to delete memo:', error);
        throw error;
    }
} 

const label = process.argv[2] || 'memo';

function removeAccountInfo(label: string): void {
  const accountsPath = path.resolve(__dirname, '../../accounts.json');
  
  if (fs.existsSync(accountsPath)) {
    const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
    
    if (accounts[label]) {
      delete accounts[label];
      fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2));
      console.log(`Account ${label} has been removed from records`);
    }
  }
}

try {
  const memoAccount = loadAccountInfo(label);
  
  deleteMemo(memoAccount).then(() => {
    removeAccountInfo(label);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}