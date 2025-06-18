// Import all necessary Solana Web3.js modules for ALT operations
import {
  Connection,                    // Manages RPC connection to Solana cluster
  PublicKey,                    // Represents public keys/addresses
  Keypair,                      // Public/private key pairs
  Transaction,                  // Legacy transaction format
  TransactionInstruction,       // Individual instruction within a transaction
  sendAndConfirmTransaction,    // Helper to send and wait for confirmation
  AddressLookupTableProgram,    // Built-in program for ALT operations
  TransactionMessage,           // New transaction message format for v0 transactions
  VersionedTransaction,         // New transaction format that supports ALT
  AddressLookupTableAccount,    // Represents an ALT account
} from '@solana/web3.js';

/**
 * ALTManager: A comprehensive utility class for managing Address Lookup Tables
 *
 * This class encapsulates all ALT-related operations including:
 * - Creating and extending lookup tables
 * - Sending versioned transactions with ALT
 * - Managing ALT lifecycle (activation, deactivation)
 * - Comparing legacy vs ALT transaction approaches
 */
export class ALTManager {
  // Private fields to store connection and payer information
  constructor(
    private connection: Connection,  // RPC connection to Solana cluster
    private payer: Keypair          // Keypair that pays for transactions
  ) {}

  /**
   * Creates an Address Lookup Table and populates it with the provided addresses
   *
   * This is the core function that enables batch operations beyond the 35-account limit.
   * The process involves:
   * 1. Creating an empty ALT account
   * 2. Extending it with all required addresses
   * 3. Waiting for activation (addresses need 1 slot to "warm up")
   *
   * @param addresses - Array of PublicKeys to include in the lookup table
   * @returns Object containing the ALT address and account data
   */
  async createLookupTable(addresses: PublicKey[]): Promise<{
    lookupTableAddress: PublicKey;
    lookupTableAccount: AddressLookupTableAccount;
  }> {
    console.log('🚀 Starting Address Lookup Table creation...');

    // Get the current slot number - ALTs are created relative to a recent slot
    // This ensures the ALT address is unique and prevents conflicts
    // We subtract 1 to ensure we use a "recent" slot that's already confirmed
    const currentSlot = await this.connection.getSlot();
    const slot = Math.max(0, currentSlot - 1); // Use previous slot to ensure it's "recent"
    console.log(`📍 Current slot: ${currentSlot}, using slot: ${slot}`);

    // Create the instruction to initialize a new Address Lookup Table
    // This returns both the instruction and the deterministic ALT address
    const [createInstruction, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: this.payer.publicKey,  // Who can modify this ALT
        payer: this.payer.publicKey,      // Who pays for the ALT creation
        recentSlot: slot,                 // Recent slot for address derivation
      });

    console.log(`📋 Lookup table address: ${lookupTableAddress.toBase58()}`);

    // Create the instruction to add addresses to the lookup table
    // This populates the ALT with all addresses we want to reference efficiently
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: this.payer.publicKey,        // Who pays for the extension
      authority: this.payer.publicKey,    // Authority that can modify the ALT
      lookupTable: lookupTableAddress,    // The ALT to extend
      addresses,                          // Array of addresses to add
    });

    const transaction = new Transaction()
    .add(createInstruction)
    .add(extendInstruction);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer]
    );

    console.log(`✅ Lookup table created successfully: ${signature}`);
    console.log(`🔗 View transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Wait for address lookup table activation
    console.log('⏳ Waiting for address lookup table activation...');
    await this.waitForActivation(lookupTableAddress);

    // Get address lookup table account
    const lookupTableAccount = await this.connection.getAddressLookupTable(
      lookupTableAddress
    );

    if (!lookupTableAccount.value) {
      throw new Error('Failed to get address lookup table account');
    }

    console.log(`📊 Lookup table contains ${lookupTableAccount.value.state.addresses.length} addresses`);

    return {
      lookupTableAddress,
      lookupTableAccount: lookupTableAccount.value,
    };
  }

  /**
   * 等待地址查找表激活
   */
  private async waitForActivation(lookupTableAddress: PublicKey): Promise<void> {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        const lookupTableAccount = await this.connection.getAddressLookupTable(
          lookupTableAddress
        );

        if (lookupTableAccount.value && lookupTableAccount.value.state.addresses.length > 0) {
          console.log('✅ Address lookup table activated');
          return;
        }
      } catch (error) {
        // Continue waiting
      }

      attempts++;
      console.log(`⏳ Waiting for activation... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Address lookup table activation timeout');
  }

  /**
   * use ALT send versioned transaction
   */
  async sendVersionedTransaction(
    instructions: TransactionInstruction[],
    lookupTableAccount: AddressLookupTableAccount,
    signers: Keypair[] = []
  ): Promise<string> {
    console.log('📤 Sending versioned transaction...');

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: this.payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([lookupTableAccount]);

    const transaction = new VersionedTransaction(messageV0);

    transaction.sign([this.payer, ...signers]);

    const signature = await this.connection.sendTransaction(transaction);

    await this.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    console.log(`✅ Versioned transaction successful: ${signature}`);
    console.log(`🔗 View transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return signature;
  }

  /**
   * Send legacy transaction (for comparison purposes)
   *
   * This method sends traditional Solana transactions without ALT.
   * Used to demonstrate the difference in efficiency and capabilities
   * compared to versioned transactions with ALT.
   *
   * @param instructions - Array of transaction instructions
   * @param signers - Additional signers beyond the payer
   * @returns Transaction signature
   */
  async sendLegacyTransaction(
    instructions: TransactionInstruction[],
    signers: Keypair[] = []
  ): Promise<string> {
    console.log('📤 Sending legacy transaction...');

    const transaction = new Transaction().add(...instructions);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer, ...signers]
    );

    console.log(`✅ Legacy transaction successful: ${signature}`);
    console.log(`🔗 View transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return signature;
  }
}
