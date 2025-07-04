# Anchor Token Metadata 客户端实现教程

## 第八步：创建客户端 SDK

### 8.1 创建客户端目录结构

```bash
mkdir -p client
cd client
npm init -y
```

### 8.2 安装客户端依赖

```bash
npm install @solana/web3.js @solana/spl-token @coral-xyz/anchor
npm install --save-dev typescript @types/node ts-node
```

### 8.3 配置 TypeScript

创建 `client/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "lib": ["es2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 8.4 创建客户端主文件

创建 `client/src/main.ts`：

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { 
  Connection, 
  Keypair, 
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { 
  createMint, 
  TOKEN_PROGRAM_ID,
  mintTo,
  createAccount,
  getAccount
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// 导入生成的 IDL 类型
import { AnchorTokenMetadata } from "../../target/types/anchor_token_metadata";

// 配置常量
const CLUSTER_URL = "http://127.0.0.1:8899";
const PROGRAM_ID = "11111111111111111111111111111111"; // 替换为实际的程序 ID

/**
 * TokenMetadataClient 类封装了与 Token Metadata 程序的所有交互
 */
export class TokenMetadataClient {
  private connection: Connection;
  private provider: AnchorProvider;
  private program: Program<AnchorTokenMetadata>;
  private payer: Keypair;

  constructor(payerKeypair: Keypair, clusterUrl: string = CLUSTER_URL) {
    this.connection = new Connection(clusterUrl, "confirmed");
    this.payer = payerKeypair;
    
    // 创建 Anchor provider
    const wallet = new Wallet(this.payer);
    this.provider = new AnchorProvider(this.connection, wallet, {
      commitment: "confirmed",
    });
    
    // 初始化程序
    const programId = new PublicKey(PROGRAM_ID);
    this.program = new Program<AnchorTokenMetadata>(
      require("../../target/idl/anchor_token_metadata.json"),
      programId,
      this.provider
    );
  }

  /**
   * 获取元数据 PDA 地址
   */
  getMetadataPDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
      this.program.programId
    );
  }

  /**
   * 注册 Token 元数据
   */
  async registerMetadata(
    mint: PublicKey,
    name: string,
    symbol: string,
    icon: string,
    home: string
  ): Promise<string> {
    const [metadataPda] = this.getMetadataPDA(mint);

    const tx = await this.program.methods
      .registerMetadata(name, symbol, icon, home)
      .accounts({
        authority: this.payer.publicKey,
        metadata: metadataPda,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Metadata registered. Transaction: ${tx}`);
    return tx;
  }

  /**
   * 更新 Token 元数据
   */
  async updateMetadata(
    mint: PublicKey,
    name: string,
    symbol: string,
    icon: string,
    home: string
  ): Promise<string> {
    const [metadataPda] = this.getMetadataPDA(mint);

    const tx = await this.program.methods
      .updateMetadata(name, symbol, icon, home)
      .accounts({
        authority: this.payer.publicKey,
        metadata: metadataPda,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✅ Metadata updated. Transaction: ${tx}`);
    return tx;
  }

  /**
   * 读取 Token 元数据
   */
  async getMetadata(mint: PublicKey) {
    const [metadataPda] = this.getMetadataPDA(mint);
    
    try {
      const metadata = await this.program.account.tokenMetadata.fetch(metadataPda);
      return {
        mint: metadata.mint,
        authority: metadata.authority,
        name: metadata.name,
        symbol: metadata.symbol,
        icon: metadata.icon,
        home: metadata.home,
        address: metadataPda
      };
    } catch (error) {
      console.log("Metadata not found for mint:", mint.toBase58());
      return null;
    }
  }

  /**
   * 创建新的 SPL Token
   */
  async createToken(decimals: number = 9): Promise<PublicKey> {
    const mint = await createMint(
      this.connection,
      this.payer,
      this.payer.publicKey,
      null,
      decimals
    );

    console.log(`✅ Token created: ${mint.toBase58()}`);
    return mint;
  }

  /**
   * 为账户铸造代币
   */
  async mintTokens(
    mint: PublicKey,
    amount: number,
    decimals: number = 9
  ): Promise<PublicKey> {
    // 创建代币账户
    const tokenAccount = await createAccount(
      this.connection,
      this.payer,
      mint,
      this.payer.publicKey
    );

    // 铸造代币
    const mintAmount = amount * Math.pow(10, decimals);
    await mintTo(
      this.connection,
      this.payer,
      mint,
      tokenAccount,
      this.payer,
      mintAmount
    );

    console.log(`✅ Minted ${amount} tokens to ${tokenAccount.toBase58()}`);
    return tokenAccount;
  }

  /**
   * 检查账户余额
   */
  async getTokenBalance(tokenAccount: PublicKey): Promise<number> {
    const accountInfo = await getAccount(this.connection, tokenAccount);
    return Number(accountInfo.amount);
  }

  /**
   * 确保账户有足够的 SOL
   */
  async ensureFunding(minBalance: number = 1): Promise<void> {
    const balance = await this.connection.getBalance(this.payer.publicKey);
    const minLamports = minBalance * LAMPORTS_PER_SOL;

    if (balance < minLamports) {
      console.log(`💰 Requesting airdrop of ${minBalance} SOL...`);
      const signature = await this.connection.requestAirdrop(
        this.payer.publicKey,
        minLamports
      );
      await this.connection.confirmTransaction(signature);
      console.log(`✅ Airdrop completed`);
    }
  }
}

/**
 * 主演示函数
 */
async function main() {
  try {
    console.log("🚀 === Anchor Token Metadata Client Demo ===");

    // 加载付款人密钥对
    const payerKeypairPath = path.resolve(
      process.env.HOME || "", 
      ".config/solana/id.json"
    );
    const payer = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
    );

    // 创建客户端
    const client = new TokenMetadataClient(payer);
    
    console.log(`👤 Payer: ${payer.publicKey.toBase58()}`);

    // 确保有足够的 SOL
    await client.ensureFunding();

    // 步骤 1: 创建新的 SPL Token
    console.log("\n🪙 === Creating SPL Token ===");
    const mint = await client.createToken(9);

    // 步骤 2: 铸造一些代币
    console.log("\n💰 === Minting Tokens ===");
    const tokenAccount = await client.mintTokens(mint, 1000);
    const balance = await client.getTokenBalance(tokenAccount);
    console.log(`Token balance: ${balance / Math.pow(10, 9)} tokens`);

    // 步骤 3: 注册元数据
    console.log("\n📝 === Registering Metadata ===");
    await client.registerMetadata(
      mint,
      "Awesome Anchor Token",
      "AAT",
      "https://example.com/awesome-anchor-icon.png",
      "https://awesome-anchor-token.com"
    );

    // 步骤 4: 读取元数据
    console.log("\n📖 === Reading Metadata ===");
    let metadata = await client.getMetadata(mint);
    if (metadata) {
      console.log("Metadata:", {
        name: metadata.name,
        symbol: metadata.symbol,
        icon: metadata.icon,
        home: metadata.home,
        mint: metadata.mint.toBase58(),
        authority: metadata.authority.toBase58()
      });
    }

    // 步骤 5: 更新元数据
    console.log("\n🔄 === Updating Metadata ===");
    await client.updateMetadata(
      mint,
      "Super Awesome Anchor Token",
      "SAAT",
      "https://new.com/super-awesome-icon.png",
      "https://super-awesome-anchor.com"
    );

    // 步骤 6: 读取更新后的元数据
    console.log("\n📖 === Reading Updated Metadata ===");
    metadata = await client.getMetadata(mint);
    if (metadata) {
      console.log("Updated Metadata:", {
        name: metadata.name,
        symbol: metadata.symbol,
        icon: metadata.icon,
        home: metadata.home
      });
    }

    console.log("\n🎉 === Demo completed successfully! ===");
    console.log(`💡 Token mint: ${mint.toBase58()}`);
    console.log(`💡 Metadata PDA: ${metadata?.address.toBase58()}`);

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// 运行演示
if (require.main === module) {
  main().catch(console.error);
}
```

### 8.5 添加 package.json 脚本

在 `client/package.json` 中添加：

```json
{
  "scripts": {
    "start": "ts-node src/main.ts",
    "build": "tsc",
    "dev": "ts-node --watch src/main.ts"
  }
}
```

## 第九步：运行客户端

### 9.1 构建和生成 IDL

```bash
# 在项目根目录
anchor build
```

### 9.2 运行客户端

```bash
cd client
npm run start
```

## 第十步：与原项目对比

### 10.1 代码简化对比

**原生 Solana 程序 (约 200+ 行)**：
- 手动处理账户验证
- 手动 PDA 推导和验证
- 手动序列化/反序列化
- 复杂的错误处理

**Anchor 版本 (约 80 行)**：
- 自动账户验证
- 声明式 PDA 定义
- 自动序列化/反序列化
- 简化的错误处理

### 10.2 功能对等性

✅ **已实现的功能**：
- Token 元数据注册
- 元数据更新
- PDA 地址推导
- 权限验证
- 账户大小管理

✅ **Anchor 额外优势**：
- 类型安全的客户端
- 自动生成的 IDL
- 更好的开发体验
- 内置测试框架

## 总结

通过使用 Anchor 框架，我们成功地将原生 Solana 程序转换为更简洁、更安全的实现。主要改进包括：

1. **代码量减少 60%**
2. **类型安全增强**
3. **开发体验改善**
4. **测试更容易编写**
5. **客户端集成更简单**

这个实现保持了原项目的所有核心功能，同时提供了更好的开发者体验和代码维护性。
