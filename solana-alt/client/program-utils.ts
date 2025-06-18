// Import necessary Solana Web3.js modules for program interaction
import {
  PublicKey,                // Represents addresses on Solana
  Keypair,                  // Public/private key pairs
  TransactionInstruction,   // Individual instruction for transactions
  SystemProgram,           // Built-in Solana system program
  Connection,              // RPC connection to Solana cluster
  LAMPORTS_PER_SOL,       // Conversion constant (1 SOL = 1,000,000,000 lamports)
} from '@solana/web3.js';
import { serialize, deserialize } from 'borsh';  // Borsh serialization/deserialization library

/**
 * Instruction enum that matches our Rust program's instruction types
 * These values must exactly match the enum variants in our Rust program
 *
 * The discriminator (number) tells the program which instruction to execute:
 * - 0: CreateCounter - Initialize a new counter account
 * - 1: IncrementCounter - Increment a single counter by 1
 * - 2: BatchIncrement - Increment multiple counters (showcases ALT power)
 */
export enum TutorialInstruction {
  CreateCounter = 0,      // Creates a new counter with initial value 0
  IncrementCounter = 1,   // Increments a single counter by 1
  BatchIncrement = 2,     // Batch increment multiple counters (ALT showcase)
}

/**
 * Counter data structure that mirrors our Rust program's Counter struct
 * This represents the data stored in each counter account on-chain
 *
 * The structure must exactly match the Rust definition:
 * - count: u64 (8 bytes) - the current counter value
 * - authority: Pubkey (32 bytes) - who owns/can modify this counter
 */
export class Counter {
  count: number;          // Current count value
  authority: PublicKey;   // Owner of this counter

  constructor(fields?: { count?: number; authority?: PublicKey }) {
    if (fields) {
      this.count = fields.count || 0;
      this.authority = fields.authority || PublicKey.default;
    } else {
      this.count = 0;
      this.authority = PublicKey.default;
    }
  }

  // Borsh schema for serialization/deserialization
  // This defines how to convert between JavaScript objects and binary data
  static schema = new Map([
    [Counter, {
      kind: 'struct',
      fields: [
        ['count', 'u64'],      // 64-bit unsigned integer
        ['authority', [32]],   // 32-byte array (Pubkey)
      ],
    }],
  ]);

  // Total space required for this account: 8 bytes (u64) + 32 bytes (Pubkey)
  static LEN = 8 + 32;

  /**
   * Deserialize Counter data from a buffer using Borsh
   * This is the proper way to read data that was serialized by our Rust program
   *
   * @param buffer - Raw account data from Solana
   * @returns Counter instance with deserialized data
   */
  static fromBuffer(buffer: Buffer): Counter {
    try {
      // Use Borsh deserialize with our schema
      const decoded = deserialize(Counter.schema, Counter, buffer);

      // Convert the authority bytes to PublicKey
      const authority = new PublicKey(decoded.authority);

      return new Counter({
        count: Number(decoded.count),
        authority: authority,
      });
    } catch (error) {
      throw new Error(`Failed to deserialize Counter: ${error}`);
    }
  }
}

/**
 * ProgramUtils: Utility class for interacting with our deployed Solana program
 *
 * This class provides high-level methods to:
 * - Create transaction instructions for our program
 * - Read and deserialize account data
 * - Handle common operations like airdrops and balance checks
 *
 * Each method corresponds to a specific instruction in our Rust program
 */
export class ProgramUtils {
  constructor(
    private connection: Connection,  // RPC connection to Solana cluster
    private programId: PublicKey    // Address of our deployed program
  ) {}

  /**
   * Creates a transaction instruction to initialize a new counter
   *
   * This instruction tells our program to:
   * 1. Create a new account with space for Counter data
   * 2. Initialize it with count = 0 and authority = payer
   *
   * @param payer - Who pays for the account creation and becomes the authority
   * @param counterAccount - The new account address for the counter
   * @returns TransactionInstruction ready to be included in a transaction
   */
  createCounterInstruction(
    payer: PublicKey,
    counterAccount: PublicKey
  ): TransactionInstruction {
    // Create instruction data: just the instruction discriminator (0 for CreateCounter)
    const data = Buffer.from([TutorialInstruction.CreateCounter]);

    return new TransactionInstruction({
      keys: [
        // Account 0: Payer (must sign, will be modified for rent payment)
        { pubkey: payer, isSigner: true, isWritable: true },
        // Account 1: Counter account (must sign as it's being created, will be modified)
        { pubkey: counterAccount, isSigner: true, isWritable: true },
        // Account 2: System program (needed for account creation, read-only)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,  // Our deployed program
      data,                       // Instruction data (just the discriminator)
    });
  }

  /**
   * Creates a transaction instruction to increment a single counter
   *
   * This instruction tells our program to increment the specified counter by 1.
   * It's used in the basic demo to show traditional single-account operations.
   *
   * @param counterAccount - The counter account to increment
   * @returns TransactionInstruction ready to be included in a transaction
   */
  incrementCounterInstruction(counterAccount: PublicKey): TransactionInstruction {
    // Create instruction data: just the instruction discriminator (1 for IncrementCounter)
    const data = Buffer.from([TutorialInstruction.IncrementCounter]);

    return new TransactionInstruction({
      keys: [
        // Account 0: Counter account (will be modified, no signature required)
        { pubkey: counterAccount, isSigner: false, isWritable: true },
      ],
      programId: this.programId,  // Our deployed program
      data,                       // Instruction data (just the discriminator)
    });
  }

  /**
   * Creates a transaction instruction to batch increment multiple counters
   *
   * This is the showcase instruction for ALT! It can increment many counters
   * in a single transaction, demonstrating the power of Address Lookup Tables.
   *
   * @param counterAccounts - Array of counter accounts to increment
   * @returns TransactionInstruction that can handle up to 256 counters with ALT
   */
  batchIncrementInstruction(counterAccounts: PublicKey[]): TransactionInstruction {
    // Create instruction data: just the instruction discriminator (2 for BatchIncrement)
    const data = Buffer.from([TutorialInstruction.BatchIncrement]);

    // Map each counter account to the required account meta format
    const keys = counterAccounts.map(account => ({
      pubkey: account,           // The counter account address
      isSigner: false,          // No signature required for existing accounts
      isWritable: true,         // Will be modified (incremented)
    }));

    return new TransactionInstruction({
      keys,                     // Array of all counter accounts
      programId: this.programId, // Our deployed program
      data,                     // Instruction data (just the discriminator)
    });
  }

  /**
   * Reads and deserializes counter data from a counter account
   *
   * This function fetches the account data from the blockchain and
   * properly deserializes it using Borsh to match our Rust program's data layout.
   *
   * @param counterAccount - The counter account to read from
   * @returns Counter object with current state, or null if account doesn't exist
   */
  async getCounterData(counterAccount: PublicKey): Promise<Counter | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(counterAccount);
      if (!accountInfo) {
        return null;
      }

      // Primary method: Use Borsh deserialization to properly parse the account data
      // This is the recommended way to handle data serialized by Rust programs
      try {
        // Use our Counter.fromBuffer method which handles Borsh deserialization
        const buffer = Buffer.from(accountInfo.data);
        const counter = Counter.fromBuffer(buffer);

        console.log(`✅ Successfully deserialized counter using Borsh: count=${counter.count}, authority=${counter.authority.toBase58()}`);
        return counter;

      } catch (borshError) {
        console.warn('⚠️ Borsh deserialization failed, falling back to manual parsing:', borshError);

        // Fallback method: Manual parsing that matches our Rust Counter struct layout exactly
        // This is kept as a backup method for debugging purposes and educational comparison

        // Our Rust Counter struct layout (for reference):
        // #[derive(BorshSerialize, BorshDeserialize)]
        // pub struct Counter {
        //     pub count: u64,        // 8 bytes at offset 0
        //     pub authority: Pubkey, // 32 bytes at offset 8
        // }

        try {
          // Manual parsing - read raw bytes directly
          // Read count (u64) from bytes 0-7 using little-endian format
          const count = accountInfo.data.readBigUInt64LE(0);

          // Read authority (Pubkey) from bytes 8-39 (32 bytes total)
          // slice(8, 40) means: start at byte 8, end before byte 40 (so bytes 8-39 inclusive)
          const authority = new PublicKey(accountInfo.data.slice(8, 40));

          console.log(`✅ Successfully parsed counter manually: count=${Number(count)}, authority=${authority.toBase58()}`);
          return new Counter({ count: Number(count), authority });

        } catch (manualError) {
          console.error('❌ Manual parsing also failed:', manualError);
          throw manualError;
        }
      }

    } catch (error) {
      console.error('Failed to read counter data:', error);
      return null;
    }
  }

  /**
   * Requests SOL airdrop for testing purposes
   *
   * This function requests free SOL from the localnet faucet to fund
   * our operations. Only works on localnet and devnet for testing.
   *
   * @param publicKey - The account to receive the airdrop
   * @param amount - Amount of SOL to request (default: 2 SOL)
   */
  async requestAirdrop(publicKey: PublicKey, amount: number = 2): Promise<void> {
    console.log(`💰 Requesting airdrop of ${amount} SOL to ${publicKey.toBase58()}`);

    const signature = await this.connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );

    await this.connection.confirmTransaction(signature);
    console.log(`✅ Airdrop successful: ${signature}`);
  }

  /**
   * Gets the SOL balance of an account
   *
   * @param publicKey - The account to check balance for
   * @returns Balance in SOL (converted from lamports)
   */
  async getBalance(publicKey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  }
}
