import {
    Connection,
    Keypair,
    PublicKey,
    TransactionInstruction,
    SystemProgram,
    clusterApiUrl,
    LAMPORTS_PER_SOL,
    AddressLookupTableProgram,
    TransactionMessage,
    VersionedTransaction,
    sendAndConfirmTransaction,
    Transaction,
    MINT_SIZE,
    TOKEN_PROGRAM_ID,
} from '@solana/web3.js';
import {
    createMint,
    createInitializeMint2Instruction,
    getOrCreateAssociatedTokenAccount,
    mintTo,
} from '@solana/spl-token';

// 配置
const USE_DEVNET = true;
const connection = new Connection(
    USE_DEVNET ? clusterApiUrl('devnet') : 'http://localhost:8899',
    'confirmed'
);

/**
 * 优化的ALT演示类
 * 解决了原教程中的问题并添加了最佳实践
 */
class OptimizedALTDemo {
    private payer: Keypair;
    private lookupTableAddress: PublicKey | null = null;

    constructor() {
        // 生成付款人钱包
        this.payer = Keypair.generate();
    }

    /**
     * 请求空投SOL（仅限devnet）
     */
    async requestAirdrop(): Promise<void> {
        if (!USE_DEVNET) return;

        console.log("💰 Requesting airdrop...");
        const balance = await connection.getBalance(this.payer.publicKey);
        
        if (balance < 2 * LAMPORTS_PER_SOL) {
            const signature = await connection.requestAirdrop(
                this.payer.publicKey, 
                2 * LAMPORTS_PER_SOL
            );
            await connection.confirmTransaction(signature);
            console.log("✅ Airdrop completed");
        }
    }

    /**
     * 创建并扩展地址查找表
     * 修复了原教程中的时序问题
     */
    async createAndExtendLookupTable(addresses: PublicKey[]): Promise<void> {
        console.log("🔍 Creating Address Lookup Table...");
        
        // 获取当前槽位
        const slot = await connection.getSlot();
        console.log(`Current slot: ${slot}`);

        // 创建地址查找表
        const [createInstruction, lookupTableAddress] = 
            AddressLookupTableProgram.createLookupTable({
                authority: this.payer.publicKey,
                payer: this.payer.publicKey,
                recentSlot: slot,
            });

        this.lookupTableAddress = lookupTableAddress;
        console.log(`Lookup table address: ${lookupTableAddress.toBase58()}`);

        // 发送创建指令
        const createTx = new Transaction().add(createInstruction);
        const createSignature = await sendAndConfirmTransaction(
            connection, 
            createTx, 
            [this.payer]
        );
        console.log(`✅ Lookup table created: ${createSignature}`);

        // 等待一个槽位以确保表已激活
        console.log("⏳ Waiting for lookup table activation...");
        await this.waitForSlots(1);

        // 扩展地址查找表
        const extendInstruction = AddressLookupTableProgram.extendLookupTable({
            payer: this.payer.publicKey,
            authority: this.payer.publicKey,
            lookupTable: lookupTableAddress,
            addresses,
        });

        const extendTx = new Transaction().add(extendInstruction);
        const extendSignature = await sendAndConfirmTransaction(
            connection, 
            extendTx, 
            [this.payer]
        );
        console.log(`✅ Lookup table extended: ${extendSignature}`);

        // 再次等待以确保扩展生效
        await this.waitForSlots(1);
    }

    /**
     * 等待指定数量的槽位
     */
    private async waitForSlots(slots: number): Promise<void> {
        const startSlot = await connection.getSlot();
        let currentSlot = startSlot;
        
        while (currentSlot < startSlot + slots) {
            await new Promise(resolve => setTimeout(resolve, 400));
            currentSlot = await connection.getSlot();
        }
    }

    /**
     * 获取地址查找表账户
     */
    async getLookupTableAccount() {
        if (!this.lookupTableAddress) {
            throw new Error("Lookup table not created yet");
        }

        const lookupTableAccount = await connection.getAddressLookupTable(
            this.lookupTableAddress
        );
        
        if (!lookupTableAccount.value) {
            throw new Error("Failed to fetch lookup table account");
        }

        return lookupTableAccount.value;
    }

    /**
     * 使用ALT发送版本化交易
     * 修复了原教程中的签名问题
     */
    async sendVersionedTransaction(
        instructions: TransactionInstruction[],
        additionalSigners: Keypair[] = []
    ): Promise<string> {
        const lookupTableAccount = await this.getLookupTableAccount();
        
        // 获取最新区块哈希
        const { blockhash, lastValidBlockHeight } = 
            await connection.getLatestBlockhash();

        // 创建版本化交易消息
        const messageV0 = new TransactionMessage({
            payerKey: this.payer.publicKey,
            recentBlockhash: blockhash,
            instructions,
        }).compileToV0Message([lookupTableAccount]);

        // 创建版本化交易
        const transaction = new VersionedTransaction(messageV0);
        
        // 签名交易
        transaction.sign([this.payer, ...additionalSigners]);

        // 发送并确认交易
        const signature = await connection.sendTransaction(transaction);
        
        await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
        });

        return signature;
    }

    /**
     * 演示创建多个SPL代币的ALT交易
     * 这是一个更实际的用例
     */
    async demonstrateTokenCreation(): Promise<void> {
        console.log("\n🪙 === Creating Multiple SPL Tokens with ALT ===");
        
        // 创建多个mint keypairs
        const mintKeypairs = Array.from({ length: 5 }, () => Keypair.generate());
        
        // 收集所有需要的地址
        const allAddresses = [
            this.payer.publicKey,
            SystemProgram.programId,
            TOKEN_PROGRAM_ID,
            ...mintKeypairs.map(kp => kp.publicKey)
        ];

        // 创建并扩展地址查找表
        await this.createAndExtendLookupTable(allAddresses);

        // 创建所有mint账户的指令
        const instructions: TransactionInstruction[] = [];
        
        for (const mintKeypair of mintKeypairs) {
            // 计算租金
            const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
            
            // 创建账户指令
            instructions.push(
                SystemProgram.createAccount({
                    fromPubkey: this.payer.publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                })
            );
            
            // 初始化mint指令
            instructions.push(
                createInitializeMint2Instruction(
                    mintKeypair.publicKey,
                    9, // decimals
                    this.payer.publicKey, // mint authority
                    this.payer.publicKey, // freeze authority
                    TOKEN_PROGRAM_ID
                )
            );
        }

        // 使用ALT发送交易
        const signature = await this.sendVersionedTransaction(
            instructions,
            mintKeypairs
        );

        console.log(`✅ Created ${mintKeypairs.length} tokens in one transaction!`);
        console.log(`Transaction: https://explorer.solana.com/tx/${signature}?cluster=${USE_DEVNET ? 'devnet' : 'custom'}`);
        
        // 输出所有创建的mint地址
        mintKeypairs.forEach((kp, index) => {
            console.log(`Token ${index + 1}: ${kp.publicKey.toBase58()}`);
        });
    }

    /**
     * 获取付款人公钥
     */
    getPayerPublicKey(): PublicKey {
        return this.payer.publicKey;
    }
}

/**
 * 主演示函数
 */
async function main() {
    try {
        console.log("🚀 === Optimized ALT Demo ===");
        console.log(`🌐 Network: ${USE_DEVNET ? 'Devnet' : 'Local'}`);
        
        const demo = new OptimizedALTDemo();
        console.log(`👤 Payer: ${demo.getPayerPublicKey().toBase58()}`);

        // 请求空投
        await demo.requestAirdrop();

        // 演示代币创建
        await demo.demonstrateTokenCreation();

        console.log("\n🎉 === Demo completed successfully! ===");
        
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

// 运行演示
if (require.main === module) {
    main().catch(console.error);
}

export { OptimizedALTDemo };
