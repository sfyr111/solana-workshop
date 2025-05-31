import dotenv from "dotenv";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as path from "path";
import * as fs from 'fs';

dotenv.config();

export const programId = new PublicKey(process.env.PROGRAM_ID!);

export function getConnection(): Connection {
    return new Connection(process.env.RPC_URL!, "confirmed");
}

export function loadWallet(keyPath?: string): Keypair {
    const walletPath = keyPath || path.resolve(process.env.HOME!, '.config/solana/id.json')

    if (!fs.existsSync(walletPath)) {
        throw new Error(`Wallet file does not exist: ${walletPath}`)
    }

    try {
        const secretKeyString = fs.readFileSync(walletPath, 'utf8');
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        return Keypair.fromSecretKey(secretKey);
    } catch (jsonError: any) {
        try {
            const secretKey = fs.readFileSync(walletPath);
            return Keypair.fromSecretKey(secretKey);
        } catch (binaryError: any) {
            throw new Error(`Failed to load wallet: ${jsonError.message}, also tried binary format: ${binaryError.message}`);
        }
    }
}

// save account info to file
export function saveAccountInfo(label: string, pubkey: string): void {
    const accountsPath = path.resolve(__dirname, '../accounts.json');
    let accounts: Record<string, string> = {};
    
    if (fs.existsSync(accountsPath)) {
      accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
    }
    accounts[label] = pubkey;
    fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2));
    console.log(`Saved account ${label}: ${pubkey}`);
  }
  
  // load account info from file
  export function loadAccountInfo(label: string): PublicKey {
    const accountsPath = path.resolve(__dirname, '../accounts.json');
    
    if (!fs.existsSync(accountsPath)) {
      throw new Error('Account file does not exist, please create a memo first');
    }
    
    const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
    
    if (!accounts[label]) {
      throw new Error(`Account not found: ${label}`);
    }
    
    return new PublicKey(accounts[label]);
  }
