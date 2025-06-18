// Import necessary Solana Web3.js modules for blockchain interaction
import {
  Connection,        // Manages connection to Solana cluster
  Keypair,          // Represents a public/private key pair
  PublicKey,        // Represents a public key on Solana
  clusterApiUrl,    // Helper to get cluster URLs
} from '@solana/web3.js';
import { ALTManager } from './alt-utils';      // Our custom ALT management utilities
import { ProgramUtils } from './program-utils'; // Our custom program interaction utilities

// Program ID - This is the deployed program's address on the blockchain
// Replace this with your actual deployed program ID: BavjK6k6s69hxzWrV8wB6HMg5Zuf4Ws2E6SfH73sCAkH
const PROGRAM_ID = new PublicKey('BavjK6k6s69hxzWrV8wB6HMg5Zuf4Ws2E6SfH73sCAkH');

/**
 * Main tutorial class that demonstrates ALT (Address Lookup Tables) functionality
 * This class orchestrates different demonstrations showing the power of ALT
 */
class ALTTutorial {
  private connection: Connection;    // Connection to Solana cluster
  private payer: Keypair;           // Wallet that pays for transactions
  private altManager: ALTManager;   // Manages ALT operations
  private programUtils: ProgramUtils; // Handles program-specific operations

  constructor() {
    // Connect to localnet instead of devnet since you're running solana-test-validator
    // 'http://localhost:8899' is the default localnet RPC endpoint
    this.connection = new Connection('http://localhost:8899', 'confirmed');

    // Generate a new keypair to act as the transaction payer
    // In a real application, you would load an existing wallet
    this.payer = Keypair.generate();

    // Initialize utility classes with the connection and payer
    this.altManager = new ALTManager(this.connection, this.payer);
    this.programUtils = new ProgramUtils(this.connection, PROGRAM_ID);
  }

  /**
   * Basic Demo: Create and operate on a single counter
   * This demonstrates traditional Solana transactions without ALT
   *
   * Learning objectives:
   * - Understand basic Solana account creation
   * - Learn how to interact with custom programs
   * - See the limitations of traditional transactions
   */
  async basicDemo(): Promise<void> {
    console.log('\n🎯 === Basic Demo: Single Counter Operations ===\n');

    // Request SOL airdrop to fund our operations
    // On localnet, this gives us free SOL for testing
    await this.programUtils.requestAirdrop(this.payer.publicKey);

    // Generate a new keypair for the counter account
    // Each counter needs its own unique account on the blockchain
    const counterKeypair = Keypair.generate();
    console.log(`📝 Counter Account: ${counterKeypair.publicKey.toBase58()}`);

    // Create instruction to initialize a new counter
    // This instruction tells our program to create a counter with initial value 0
    const createInstruction = this.programUtils.createCounterInstruction(
      this.payer.publicKey,      // Who pays for the account creation
      counterKeypair.publicKey   // The new counter account address
    );

    // Send a legacy (traditional) transaction to create the counter
    // Legacy transactions are limited to ~35 accounts
    await this.altManager.sendLegacyTransaction(
      [createInstruction],       // Array of instructions to execute
      [counterKeypair]          // Additional signers (counter account must sign its creation)
    );

    // Read the initial counter value from the blockchain
    // This demonstrates how to fetch and deserialize account data
    let counterData = await this.programUtils.getCounterData(counterKeypair.publicKey);
    console.log(`📊 Initial count value: ${counterData?.count || 0}`);

    // Create instruction to increment the counter by 1
    const incrementInstruction = this.programUtils.incrementCounterInstruction(
      counterKeypair.publicKey   // The counter account to increment
    );

    // Send another legacy transaction to increment the counter
    await this.altManager.sendLegacyTransaction([incrementInstruction]);

    // Read the updated counter value to verify the increment worked
    counterData = await this.programUtils.getCounterData(counterKeypair.publicKey);
    console.log(`📊 Updated count value: ${counterData?.count || 0}`);
  }

  /**
   * ALT Demo: Batch operations on multiple counters
   * This is where Address Lookup Tables truly shine!
   *
   * Learning objectives:
   * - Understand how ALT breaks the 35-account limit
   * - Learn to create and use Address Lookup Tables
   * - See the power of batch operations in a single transaction
   * - Compare efficiency vs traditional approach
   */
  async altDemo(): Promise<void> {
    console.log('\n🚀 === ALT Demo: Batch Counter Operations ===\n');

    // Request SOL airdrop for funding operations
    await this.programUtils.requestAirdrop(this.payer.publicKey);

    // Create multiple counter accounts to demonstrate batch operations
    // With ALT, we can handle up to 256 accounts in a single transaction!
    // However, we're limited by transaction size, so we'll use a smaller number for creation
    const counterCount = 5; // Creating 5 counters for demonstration (creation is expensive)
    const counterKeypairs: Keypair[] = [];

    // Generate keypairs for all counter accounts
    for (let i = 0; i < counterCount; i++) {
      counterKeypairs.push(Keypair.generate());
    }

    console.log(`📝 Generated ${counterCount} counter account keypairs`);

    // Collect all addresses that will be used in our transactions
    // ALT allows us to reference these addresses with 1-byte indices instead of 32-byte addresses
    const allAddresses = [
      this.payer.publicKey,                           // The transaction payer
      PROGRAM_ID,                                     // Our deployed program
      ...counterKeypairs.map(kp => kp.publicKey),   // All counter account addresses
    ];

    // Create the Address Lookup Table with all our addresses
    // This is the magic that enables batch operations!
    const { lookupTableAccount } = await this.altManager.createLookupTable(allAddresses);

    // Step 1: Batch create all counters in a single transaction
    console.log('\n📋 Step 1: Batch Counter Creation');

    // Create an array of instructions, one for each counter
    // Without ALT, this would require 20 separate transactions
    const createInstructions = counterKeypairs.map(kp =>
      this.programUtils.createCounterInstruction(
        this.payer.publicKey,    // Payer for each counter
        kp.publicKey            // Each counter's unique address
      )
    );

    // Send all creation instructions in a single versioned transaction using ALT
    // This demonstrates the power of ALT: 20 account creations in 1 transaction!
    await this.altManager.sendVersionedTransaction(
      createInstructions,      // Array of 20 creation instructions
      lookupTableAccount,      // The ALT that contains our addresses
      counterKeypairs         // All counter keypairs must sign their creation
    );

    // Verify creation results
    console.log('\n🔍 Verifying creation results:');
    for (let i = 0; i < Math.min(5, counterCount); i++) {
      const counterData = await this.programUtils.getCounterData(
        counterKeypairs[i].publicKey
      );
      console.log(`Counter ${i}: ${counterData?.count ?? 'N/A'}`);
    }

    // Step 2: Batch increment counters
    console.log('\n📈 Step 2: Batch Counter Increments');
    const batchIncrementInstruction = this.programUtils.batchIncrementInstruction(
      counterKeypairs.map(kp => kp.publicKey)
    );

    await this.altManager.sendVersionedTransaction(
      [batchIncrementInstruction],
      lookupTableAccount
    );

    // Verify increment results
    console.log('\n🔍 Verifying increment results:');
    for (let i = 0; i < Math.min(5, counterCount); i++) {
      const counterData = await this.programUtils.getCounterData(
        counterKeypairs[i].publicKey
      );
      console.log(`Counter ${i}: ${counterData?.count ?? 'N/A'}`);
    }

    console.log(`\n✅ Successfully batch operated ${counterCount} counters!`);
  }

  /**
   * Comparison Demo: Traditional transactions vs ALT transactions
   * This demonstrates the performance difference between approaches
   *
   * Learning objectives:
   * - Quantify the performance benefits of ALT
   * - Understand the trade-offs between approaches
   * - See real-world efficiency improvements
   */
  async compareDemo(): Promise<void> {
    console.log('\n⚖️ === Comparison Demo: Traditional vs ALT Transactions ===\n');

    // Request SOL airdrop for funding operations
    await this.programUtils.requestAirdrop(this.payer.publicKey);

    const counterCount = 10;
    const counterKeypairs: Keypair[] = [];

    for (let i = 0; i < counterCount; i++) {
      counterKeypairs.push(Keypair.generate());
    }

    // Method 1: Traditional transactions (one by one creation)
    console.log('📊 Method 1: Traditional Transactions (Individual Operations)');
    const startTime1 = Date.now();

    for (let i = 0; i < counterCount; i++) {
      const createInstruction = this.programUtils.createCounterInstruction(
        this.payer.publicKey,
        counterKeypairs[i].publicKey
      );

      await this.altManager.sendLegacyTransaction(
        [createInstruction],
        [counterKeypairs[i]]
      );

      console.log(`✅ Created counter ${i + 1}/${counterCount}`);
    }

    const time1 = Date.now() - startTime1;
    console.log(`⏱️ Traditional method time: ${time1}ms`);

    // Create new counters for ALT demonstration
    const altCounterKeypairs: Keypair[] = [];
    for (let i = 0; i < counterCount; i++) {
      altCounterKeypairs.push(Keypair.generate());
    }

    // Method 2: ALT transactions (batch creation)
    console.log('\n📊 Method 2: ALT Transactions (Batch Operations)');
    const startTime2 = Date.now();

    // Create address lookup table
    const allAddresses = [
      this.payer.publicKey,
      PROGRAM_ID,
      ...altCounterKeypairs.map(kp => kp.publicKey),
    ];

    const { lookupTableAccount } = await this.altManager.createLookupTable(allAddresses);

    // Batch creation
    const createInstructions = altCounterKeypairs.map(kp =>
      this.programUtils.createCounterInstruction(
        this.payer.publicKey,
        kp.publicKey
      )
    );

    await this.altManager.sendVersionedTransaction(
      createInstructions,
      lookupTableAccount,
      altCounterKeypairs
    );

    const time2 = Date.now() - startTime2;
    console.log(`⏱️ ALT method time: ${time2}ms`);

    // Performance comparison
    console.log('\n📈 Performance Comparison Results:');
    console.log(`Traditional method: ${time1}ms (${counterCount} transactions)`);
    console.log(`ALT method: ${time2}ms (1 transaction + ALT creation)`);
    console.log(`Efficiency improvement: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
  }

  /**
   * 运行演示
   */
  async run(): Promise<void> {
    const args = process.argv.slice(2);
    const demo = args[0] || 'basic';

    console.log('🎓 ALT Tutorial Demo Program');
    console.log(`💰 Payer Address: ${this.payer.publicKey.toBase58()}`);
    console.log(`🔗 Program ID: ${PROGRAM_ID.toBase58()}`);

    try {
      switch (demo) {
        case 'basic':
          await this.basicDemo();
          break;
        case 'alt':
          await this.altDemo();
          break;
        case 'compare':
          await this.compareDemo();
          break;
        default:
          console.log('❌ Unknown demo type');
          console.log('Available options: basic, alt, compare');
          break;
      }
    } catch (error) {
      console.error('❌ Error occurred during demonstration:', error);
    }
  }
}

async function main() {
  const tutorial = new ALTTutorial();
  await tutorial.run();
}

if (require.main === module) {
  main().catch(console.error);
}
