import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection, loadWallet } from './utils';
import fs from 'fs';
import path from 'path';

async function main() {
  try {
    const connection = getConnection();
    const wallet = loadWallet();
    
    console.log('Successfully connected to Solana network');
    console.log('Wallet address:', wallet.publicKey.toBase58());
    
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('Wallet balance:', balance / LAMPORTS_PER_SOL, 'SOL');
    
    console.log('\nAvailable commands:');
    console.log('  npm run create [content] [label]  - Create new memo');
    console.log('  npm run read [label]             - Read memo content');
    console.log('  npm run update [content] [label] - Update memo content');
    console.log('  npm run delete [label]           - Delete memo');
    
    // Display saved memos
    const accountsPath = path.resolve(__dirname, '../accounts.json');
    if (fs.existsSync(accountsPath)) {
      const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
      
      if (Object.keys(accounts).length > 0) {
        console.log('\nSaved memos:');
        for (const [label, address] of Object.entries(accounts)) {
          console.log(`  ${label}: ${address}`);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);