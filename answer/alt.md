# Solana ALT (Address Lookup Tables) 交易详解

## 概述

地址查找表（Address Lookup Tables，简称 ALT）是 Solana 区块链上的一项重要功能，允许开发人员在单个交易中引用更多的账户地址。本文档将详细介绍 ALT 的工作原理、使用方法以及实际应用示例。

## 背景与问题

### 交易大小限制

传输到 Solana 验证器的消息不得超过 IPv6 MTU 大小，以确保通过 UDP 快速可靠地进行集群信息网络传输。Solana 的网络堆栈使用 1280 字节的保守 MTU 大小，在考虑标头后，为数据包数据（如序列化事务）留下 **1232 字节**。

### 账户数量限制

在 Solana 上构建应用程序的开发人员必须在上述交易大小限制约束内设计其链上程序接口。传统的解决方法是将状态临时存储在链上并在以后的交易中使用该状态。

然而，当开发人员在单个原子事务中编写许多链上程序时，这种解决方法效果不佳：
- 组合越多，帐户输入就越多
- 每个帐户输入占用 32 个字节
- 在考虑签名和其他交易元数据后，当前上限约为 **35 个账户**

## ALT 解决方案

地址查找表通常简称为"查找表"或简称"ALT"，允许开发人员创建相关地址的集合，以便在单个事务中有效地加载更多地址。

### 核心优势

- **突破账户限制**：从 32 个地址提升到 **256 个地址**
- **节省交易空间**：使用 1 字节 u8 索引代替 32 字节完整地址
- **原子性操作**：支持在单个交易中与大量账户交互

## ALT 技术原理

### 地址查找表结构

地址查找表是一个链上账户，存储相关地址的集合。其核心特性包括：

```rust
/// 查找表最大地址数量
pub const LOOKUP_TABLE_MAX_ADDRESSES: usize = 256;

/// 查找表元数据序列化大小
pub const LOOKUP_TABLE_META_SIZE: usize = 56;

pub struct LookupTableMeta {
    /// 停用槽位 - 查找表只有在停用槽位不再"最近"时才能关闭
    pub deactivation_slot: Slot,
    /// 表最后扩展的槽位 - 地址表只能查找在当前银行槽位之前扩展的地址
    pub last_extended_slot: Slot,
    /// 最后扩展时的起始索引
    pub last_extended_slot_start_index: u8,
    /// 权限地址 - 必须为每次修改签名
    pub authority: Option<Pubkey>,
    // 原始地址列表跟随此序列化结构，从 LOOKUP_TABLE_META_SIZE 开始
}
```

### 版本化交易

为了支持 ALT，Solana 引入了版本化交易（VersionedTransaction）：

```rust
#[derive(Serialize, Deserialize)]
pub struct VersionedTransaction {
    /// 签名列表
    #[serde(with = "short_vec")]
    pub signatures: Vec<Signature>,
    /// 要签名的消息
    pub message: VersionedMessage,
}

// 使用自定义序列化。如果第一位被设置，第一个字节的剩余位将编码版本号
pub enum VersionedMessage {
    Legacy(LegacyMessage),  // 传统消息
    V0(v0::Message),        // V0 版本消息
}
```

### V0 消息结构

```rust
#[derive(Serialize, Deserialize)]
pub struct Message {
    // 消息头（不变）
    pub header: MessageHeader,

    // 账户密钥列表（不变）
    #[serde(with = "short_vec")]
    pub account_keys: Vec<Pubkey>,

    // 最近区块哈希（不变）
    pub recent_blockhash: Hash,

    // 指令列表（不变）
    #[serde(with = "short_vec")]
    pub instructions: Vec<CompiledInstruction>,

    /// 地址表查找列表 - 用于为此交易加载额外账户
    #[serde(with = "short_vec")]
    pub address_table_lookups: Vec<MessageAddressTableLookup>,
}

/// 地址表查找描述了一个链上地址查找表
#[derive(Serialize, Deserialize)]
pub struct MessageAddressTableLookup {
    /// 地址查找表账户密钥
    pub account_key: Pubkey,
    /// 用于加载可写账户地址的索引列表
    #[serde(with = "short_vec")]
    pub writable_indexes: Vec<u8>,
    /// 用于加载只读账户地址的索引列表
    #[serde(with = "short_vec")]
    pub readonly_indexes: Vec<u8>,
}
```

## ALT 使用流程

### 1. 创建地址查找表

首先需要通过 `createLookupTable` 创建 ALT 的表账户：

```javascript
const web3 = require("@solana/web3.js");

// 连接到集群并获取当前槽位
const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
const slot = await connection.getSlot();

// 假设：payer 是一个有效的 Keypair，有足够的 SOL 支付执行费用
const [lookupTableInst, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey,
        payer: payer.publicKey,
        recentSlot: slot,
    });

console.log("lookup table address:", lookupTableAddress.toBase58());

// 要在链上创建地址查找表：
// 在交易中发送 lookupTableInst 指令
```

### 2. 扩展地址查找表

将要用到的账户地址存入查找表：

```javascript
// 通过 extend 指令向 lookupTableAddress 表添加地址
const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
        payer.publicKey,
        web3.SystemProgram.programId,
        // 在此处列出更多 publicKey 地址
    ],
});

// 在交易中发送此 extendInstruction 到集群
// 将 addresses 列表插入到地址为 lookupTableAddress 的查找表中
```

### 3. 发起版本化交易

使用地址查找表发送交易：

```javascript
// 假设：
// - arrayOfInstructions 已创建为 TransactionInstruction 数组
// - 我们使用上面获得的 lookupTableAccount

// 构造 v0 兼容的交易消息
const messageV0 = new web3.TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: arrayOfInstructions, // 注意这是指令数组
}).compileToV0Message([lookupTableAccount]);

// 从 v0 消息创建 v0 交易
const transactionV0 = new web3.VersionedTransaction(messageV0);

// 使用名为 payer 的文件系统钱包签名 v0 交易
transactionV0.sign([payer]);

// 发送并确认交易
// （注意：这里没有签名者数组；请参见下面的注释...）
const txid = await web3.sendAndConfirmTransaction(connection, transactionV0);

console.log(
    `Transaction: https://explorer.solana.com/tx/${txidV0}?cluster=devnet`,
);
```

## 实际应用示例：创建 Token Mint

以下是使用 ALT 方式组合实现 Mint Token 创建的完整示例：

```javascript
const slot = await connection.getSlot();
const [lookupTableIx, lookupTableAddress] =
    await AddressLookupTableProgram.createLookupTable({
        authority: publicKey,
        payer: publicKey,
        recentSlot: slot,
    });

const extendIx = await AddressLookupTableProgram.extendLookupTable({
    payer: publicKey,
    authority: publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
        publicKey,
        SystemProgram.programId,
        mintKeypair.publicKey,
        TOKEN_PROGRAM_ID
    ],
});

const txInstructions = [
    lookupTableIx,
    extendIx,
    SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: lamports,
        programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
        mintKeypair.publicKey,
        9,
        publicKey,
        publicKey,
        TOKEN_PROGRAM_ID
    )
];

console.log("txi : ", txInstructions);
const {
    context: { slot: minContextSlot },
    value: { blockhash, lastValidBlockHeight },
} = await connection.getLatestBlockhashAndContext();

enqueueSnackbar(
    `✅ - Fetched latest blockhash. Last Valid Height: ${lastValidBlockHeight}`
);
console.log("slot:", minContextSlot);
console.log("latestBlockhash:", blockhash);

const messageV0 = new TransactionMessage({
    payerKey: publicKey,
    recentBlockhash: blockhash,
    instructions: txInstructions,
}).compileToV0Message();

const trx = new VersionedTransaction(messageV0);
const signature = await sendTransaction(trx, connection, {
    minContextSlot,
    signers: [mintKeypair],
});
console.log("signature:", signature);
```

运行后，我们创建 Token，并得到交易记录：
[示例交易链接](https://explorer.solana.com/tx/4DFETLv7bExTESy4cGtJ1A7Vd4G8WK2f48hCAhB33i2bc9Kuofbw9y5KeLqBW4gbFHFMA4RnUgDuzAkcsbrszQRp?cluster=devnet)

## ALT 生命周期管理

### 预热期（Warmup Period）

新添加的地址需要一个槽位进行预热，然后才能供交易进行查找。这确保了地址在使用前已经正确存储在链上。

### 停用与关闭

- **停用**：地址查找表可以随时停用，但可以继续被事务使用，直到停用槽不再出现在槽哈希 sysvar 中
- **关闭**：只有在停用槽位不再"最近"（不可在 SlotHashes sysvar 中访问）时，查找表才能关闭
- **冷却期**：此冷却期确保正在进行的事务无法被审查，并且地址查找表无法关闭并为同一槽重新创建

### 免租要求

地址查找表在以下情况下必须免租：
- 初始化时
- 每次添加新地址后

## 技术优势与限制

### 优势

1. **突破账户限制**：从传统的 35 个账户提升到 256 个账户
2. **节省交易空间**：使用 1 字节索引替代 32 字节完整地址
3. **支持复杂组合**：允许在单个原子交易中与大量账户交互
4. **向后兼容**：支持传统交易和版本化交易

### 限制

1. **最大地址数量**：每个查找表最多 256 个地址
2. **预热期要求**：新地址需要一个槽位预热
3. **额外复杂性**：需要管理查找表的生命周期
4. **存储成本**：查找表需要支付租金

## 适用场景

ALT 特别适用于以下场景：

1. **DeFi 协议**：需要在单个交易中与多个流动性池交互
2. **游戏应用**：批量更新多个游戏状态
3. **批量操作**：需要同时处理大量账户的应用
4. **复杂组合**：需要调用多个程序的复合操作

## 最佳实践

1. **提前规划**：在设计应用时考虑 ALT 的使用
2. **地址分组**：将相关地址组织到同一个查找表中
3. **生命周期管理**：合理管理查找表的创建、扩展和关闭
4. **错误处理**：处理查找表不存在或地址未预热的情况
5. **成本优化**：平衡查找表数量和交易复杂性

## 总结

地址查找表（ALT）是 Solana 生态系统中的一项重要创新，它有效解决了交易中账户数量限制的问题。通过使用 ALT，开发者可以：

- 在单个交易中处理多达 256 个账户
- 显著减少交易大小
- 实现更复杂的原子操作
- 提升应用的可组合性

ALT 的引入为 Solana 上的复杂应用开发提供了强大的工具，特别是在 DeFi、游戏和需要批量操作的场景中具有重要价值。开发者应该根据应用需求合理使用 ALT，以实现最佳的性能和用户体验。

---

# ALT 实践教学代码

## 项目结构

让我们创建一个完整的 ALT 实践项目：

```
solana-alt-tutorial/
├── program/                 # Solana 程序
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
├── client/                  # 客户端代码
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts         # 主程序
│       ├── alt-utils.ts     # ALT 工具函数
│       └── program-utils.ts # 程序交互工具
└── README.md
```

## 步骤 1: 创建项目目录

首先创建项目结构：

```bash
mkdir solana-alt-tutorial
cd solana-alt-tutorial
mkdir -p program/src
mkdir -p client/src
```

## 步骤 2: 创建 Solana 程序

### 2.1 创建 Cargo.toml

创建 `program/Cargo.toml`：

```toml
[package]
name = "alt-tutorial"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-program = "1.16.0"
borsh = "0.10.3"
thiserror = "1.0"

[lib]
crate-type = ["cdylib", "lib"]

[[bin]]
name = "alt-tutorial"
path = "src/lib.rs"
```

### 2.2 创建程序代码

创建 `program/src/lib.rs`：

```rust
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    program::invoke,
    system_program,
    sysvar::Sysvar,
};
use borsh::{BorshDeserialize, BorshSerialize};

// 程序入口点
entrypoint!(process_instruction);

// 指令枚举
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum TutorialInstruction {
    /// 创建计数器账户
    /// 账户:
    /// 0. [signer, writable] 付款人
    /// 1. [signer, writable] 计数器账户
    /// 2. [] 系统程序
    CreateCounter,

    /// 增加计数器
    /// 账户:
    /// 0. [writable] 计数器账户
    IncrementCounter,

    /// 批量增加多个计数器
    /// 账户:
    /// 0..n. [writable] 计数器账户列表
    BatchIncrement,
}

// 计数器数据结构
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

impl Counter {
    pub const LEN: usize = 8 + 32; // u64 + Pubkey
}

// 主处理函数
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = TutorialInstruction::try_from_slice(instruction_data)?;

    match instruction {
        TutorialInstruction::CreateCounter => create_counter(program_id, accounts),
        TutorialInstruction::IncrementCounter => increment_counter(program_id, accounts),
        TutorialInstruction::BatchIncrement => batch_increment(program_id, accounts),
    }
}

// 创建计数器
fn create_counter(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let counter_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // 验证签名
    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    if !counter_account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // 验证系统程序
    if *system_program.key != system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }

    // 计算租金
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(Counter::LEN);

    // 创建账户
    invoke(
        &system_instruction::create_account(
            payer.key,
            counter_account.key,
            lamports,
            Counter::LEN as u64,
            program_id,
        ),
        &[payer.clone(), counter_account.clone(), system_program.clone()],
    )?;

    // 初始化计数器数据
    let counter = Counter {
        count: 0,
        authority: *payer.key,
    };

    counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

    msg!("计数器创建成功，初始值: 0");
    Ok(())
}

// 增加单个计数器
fn increment_counter(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let counter_account = next_account_info(account_info_iter)?;

    // 验证账户所有者
    if counter_account.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    // 读取并更新计数器
    let mut counter = Counter::try_from_slice(&counter_account.data.borrow())?;
    counter.count += 1;

    // 保存更新后的数据
    counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

    msg!("计数器增加到: {}", counter.count);
    Ok(())
}

// 批量增加计数器 - 这里展示 ALT 的优势
fn batch_increment(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    msg!("开始批量增加 {} 个计数器", accounts.len());

    for (index, counter_account) in accounts.iter().enumerate() {
        // 验证账户所有者
        if counter_account.owner != program_id {
            msg!("跳过无效账户 {}", index);
            continue;
        }

        // 读取并更新计数器
        let mut counter = Counter::try_from_slice(&counter_account.data.borrow())?;
        counter.count += 1;

        // 保存更新后的数据
        counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

        msg!("计数器 {} 增加到: {}", index, counter.count);
    }

    msg!("批量操作完成");
    Ok(())
}
```

## 步骤 3: 创建客户端代码

### 3.1 创建 package.json

创建 `client/package.json`：

```json
{
  "name": "alt-tutorial-client",
  "version": "1.0.0",
  "description": "ALT Tutorial Client",
  "main": "dist/index.js",
  "scripts": {
    "start": "ts-node src/index.ts",
    "build": "tsc",
    "demo:basic": "ts-node src/index.ts basic",
    "demo:alt": "ts-node src/index.ts alt",
    "demo:compare": "ts-node src/index.ts compare"
  },
  "dependencies": {
    "@solana/web3.js": "^1.78.0",
    "borsh": "^0.7.0"
  },
  "devDependencies": {
    "typescript": "^5.0.4",
    "ts-node": "^10.9.1",
    "@types/node": "^20.0.0"
  }
}
```

### 3.2 创建 tsconfig.json

创建 `client/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "outDir": "dist",
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

### 3.3 创建 ALT 工具函数

创建 `client/src/alt-utils.ts`：

```typescript
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js';

export class ALTManager {
  constructor(
    private connection: Connection,
    private payer: Keypair
  ) {}

  /**
   * 创建地址查找表
   */
  async createLookupTable(addresses: PublicKey[]): Promise<{
    lookupTableAddress: PublicKey;
    lookupTableAccount: AddressLookupTableAccount;
  }> {
    console.log('🚀 开始创建地址查找表...');

    // 获取当前槽位
    const slot = await this.connection.getSlot();
    console.log(`📍 当前槽位: ${slot}`);

    // 创建地址查找表指令
    const [createInstruction, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: this.payer.publicKey,
        payer: this.payer.publicKey,
        recentSlot: slot,
      });

    console.log(`📋 查找表地址: ${lookupTableAddress.toBase58()}`);

    // 扩展地址查找表指令
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
      payer: this.payer.publicKey,
      authority: this.payer.publicKey,
      lookupTable: lookupTableAddress,
      addresses,
    });

    // 创建并发送交易
    const transaction = new Transaction()
      .add(createInstruction)
      .add(extendInstruction);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer]
    );

    console.log(`✅ 查找表创建成功: ${signature}`);
    console.log(`🔗 查看交易: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // 等待地址查找表激活
    console.log('⏳ 等待地址查找表激活...');
    await this.waitForActivation(lookupTableAddress);

    // 获取地址查找表账户
    const lookupTableAccount = await this.connection.getAddressLookupTable(
      lookupTableAddress
    );

    if (!lookupTableAccount.value) {
      throw new Error('无法获取地址查找表账户');
    }

    console.log(`📊 查找表包含 ${lookupTableAccount.value.state.addresses.length} 个地址`);

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
          console.log('✅ 地址查找表已激活');
          return;
        }
      } catch (error) {
        // 继续等待
      }

      attempts++;
      console.log(`⏳ 等待激活... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('地址查找表激活超时');
  }

  /**
   * 使用地址查找表发送版本化交易
   */
  async sendVersionedTransaction(
    instructions: TransactionInstruction[],
    lookupTableAccount: AddressLookupTableAccount,
    signers: Keypair[] = []
  ): Promise<string> {
    console.log('📤 发送版本化交易...');

    // 获取最新区块哈希
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();

    // 创建版本化交易消息
    const messageV0 = new TransactionMessage({
      payerKey: this.payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([lookupTableAccount]);

    // 创建版本化交易
    const transaction = new VersionedTransaction(messageV0);

    // 添加签名
    transaction.sign([this.payer, ...signers]);

    // 发送交易
    const signature = await this.connection.sendTransaction(transaction);

    // 确认交易
    await this.connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    console.log(`✅ 版本化交易成功: ${signature}`);
    console.log(`🔗 查看交易: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return signature;
  }

  /**
   * 发送传统交易（用于对比）
   */
  async sendLegacyTransaction(
    instructions: TransactionInstruction[],
    signers: Keypair[] = []
  ): Promise<string> {
    console.log('📤 发送传统交易...');

    const transaction = new Transaction().add(...instructions);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer, ...signers]
    );

    console.log(`✅ 传统交易成功: ${signature}`);
    console.log(`🔗 查看交易: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    return signature;
  }
}
```

### 3.4 创建程序交互工具

创建 `client/src/program-utils.ts`：

```typescript
import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { serialize } from 'borsh';

// 指令枚举
export enum TutorialInstruction {
  CreateCounter = 0,
  IncrementCounter = 1,
  BatchIncrement = 2,
}

// 计数器数据结构
export class Counter {
  count: number;
  authority: PublicKey;

  constructor(count: number, authority: PublicKey) {
    this.count = count;
    this.authority = authority;
  }

  static schema = new Map([
    [Counter, {
      kind: 'struct',
      fields: [
        ['count', 'u64'],
        ['authority', [32]],
      ],
    }],
  ]);

  static LEN = 8 + 32; // u64 + Pubkey
}

export class ProgramUtils {
  constructor(
    private connection: Connection,
    private programId: PublicKey
  ) {}

  /**
   * 创建计数器指令
   */
  createCounterInstruction(
    payer: PublicKey,
    counterAccount: PublicKey
  ): TransactionInstruction {
    const data = Buffer.from([TutorialInstruction.CreateCounter]);

    return new TransactionInstruction({
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: counterAccount, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * 增加计数器指令
   */
  incrementCounterInstruction(counterAccount: PublicKey): TransactionInstruction {
    const data = Buffer.from([TutorialInstruction.IncrementCounter]);

    return new TransactionInstruction({
      keys: [
        { pubkey: counterAccount, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data,
    });
  }

  /**
   * 批量增加计数器指令
   */
  batchIncrementInstruction(counterAccounts: PublicKey[]): TransactionInstruction {
    const data = Buffer.from([TutorialInstruction.BatchIncrement]);

    const keys = counterAccounts.map(account => ({
      pubkey: account,
      isSigner: false,
      isWritable: true,
    }));

    return new TransactionInstruction({
      keys,
      programId: this.programId,
      data,
    });
  }

  /**
   * 读取计数器数据
   */
  async getCounterData(counterAccount: PublicKey): Promise<Counter | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(counterAccount);
      if (!accountInfo) {
        return null;
      }

      // 简单的反序列化（实际项目中应该使用 borsh）
      const count = accountInfo.data.readBigUInt64LE(0);
      const authority = new PublicKey(accountInfo.data.slice(8, 40));

      return new Counter(Number(count), authority);
    } catch (error) {
      console.error('读取计数器数据失败:', error);
      return null;
    }
  }

  /**
   * 请求空投
   */
  async requestAirdrop(publicKey: PublicKey, amount: number = 2): Promise<void> {
    console.log(`💰 请求空投 ${amount} SOL 到 ${publicKey.toBase58()}`);

    const signature = await this.connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );

    await this.connection.confirmTransaction(signature);
    console.log(`✅ 空投成功: ${signature}`);
  }

  /**
   * 获取账户余额
   */
  async getBalance(publicKey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  }
}
```

### 3.5 创建主程序

创建 `client/src/index.ts`：

```typescript
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from '@solana/web3.js';
import { ALTManager } from './alt-utils';
import { ProgramUtils } from './program-utils';

// 程序 ID - 请替换为您部署的程序 ID
const PROGRAM_ID = new PublicKey('YourProgramIdHere111111111111111111111111111');

class ALTTutorial {
  private connection: Connection;
  private payer: Keypair;
  private altManager: ALTManager;
  private programUtils: ProgramUtils;

  constructor() {
    // 连接到 devnet
    this.connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // 创建付款人钱包
    this.payer = Keypair.generate();

    // 初始化工具类
    this.altManager = new ALTManager(this.connection, this.payer);
    this.programUtils = new ProgramUtils(this.connection, PROGRAM_ID);
  }

  /**
   * 基础演示：创建和操作单个计数器
   */
  async basicDemo(): Promise<void> {
    console.log('\n🎯 === 基础演示：单个计数器操作 ===\n');

    // 请求空投
    await this.programUtils.requestAirdrop(this.payer.publicKey);

    // 创建计数器账户
    const counterKeypair = Keypair.generate();
    console.log(`📝 计数器账户: ${counterKeypair.publicKey.toBase58()}`);

    // 创建计数器
    const createInstruction = this.programUtils.createCounterInstruction(
      this.payer.publicKey,
      counterKeypair.publicKey
    );

    await this.altManager.sendLegacyTransaction(
      [createInstruction],
      [counterKeypair]
    );

    // 读取初始值
    let counterData = await this.programUtils.getCounterData(counterKeypair.publicKey);
    console.log(`📊 初始计数值: ${counterData?.count || 0}`);

    // 增加计数器
    const incrementInstruction = this.programUtils.incrementCounterInstruction(
      counterKeypair.publicKey
    );

    await this.altManager.sendLegacyTransaction([incrementInstruction]);

    // 读取更新后的值
    counterData = await this.programUtils.getCounterData(counterKeypair.publicKey);
    console.log(`📊 更新后计数值: ${counterData?.count || 0}`);
  }

  /**
   * ALT 演示：批量操作多个计数器
   */
  async altDemo(): Promise<void> {
    console.log('\n🚀 === ALT 演示：批量计数器操作 ===\n');

    // 请求空投
    await this.programUtils.requestAirdrop(this.payer.publicKey);

    // 创建多个计数器账户
    const counterCount = 20; // 创建 20 个计数器
    const counterKeypairs: Keypair[] = [];

    for (let i = 0; i < counterCount; i++) {
      counterKeypairs.push(Keypair.generate());
    }

    console.log(`📝 创建了 ${counterCount} 个计数器账户`);

    // 收集所有地址用于 ALT
    const allAddresses = [
      this.payer.publicKey,
      PROGRAM_ID,
      ...counterKeypairs.map(kp => kp.publicKey),
    ];

    // 创建地址查找表
    const { lookupTableAccount } = await this.altManager.createLookupTable(allAddresses);

    // 第一步：批量创建计数器
    console.log('\n📋 第一步：批量创建计数器');
    const createInstructions = counterKeypairs.map(kp =>
      this.programUtils.createCounterInstruction(
        this.payer.publicKey,
        kp.publicKey
      )
    );

    await this.altManager.sendVersionedTransaction(
      createInstructions,
      lookupTableAccount,
      counterKeypairs
    );

    // 验证创建结果
    console.log('\n🔍 验证创建结果:');
    for (let i = 0; i < Math.min(5, counterCount); i++) {
      const counterData = await this.programUtils.getCounterData(
        counterKeypairs[i].publicKey
      );
      console.log(`计数器 ${i}: ${counterData?.count || 'N/A'}`);
    }

    // 第二步：批量增加计数器
    console.log('\n📈 第二步：批量增加计数器');
    const batchIncrementInstruction = this.programUtils.batchIncrementInstruction(
      counterKeypairs.map(kp => kp.publicKey)
    );

    await this.altManager.sendVersionedTransaction(
      [batchIncrementInstruction],
      lookupTableAccount
    );

    // 验证增加结果
    console.log('\n🔍 验证增加结果:');
    for (let i = 0; i < Math.min(5, counterCount); i++) {
      const counterData = await this.programUtils.getCounterData(
        counterKeypairs[i].publicKey
      );
      console.log(`计数器 ${i}: ${counterData?.count || 'N/A'}`);
    }

    console.log(`\n✅ 成功批量操作了 ${counterCount} 个计数器！`);
  }

  /**
   * 对比演示：传统交易 vs ALT 交易
   */
  async compareDemo(): Promise<void> {
    console.log('\n⚖️ === 对比演示：传统交易 vs ALT 交易 ===\n');

    // 请求空投
    await this.programUtils.requestAirdrop(this.payer.publicKey);

    const counterCount = 10;
    const counterKeypairs: Keypair[] = [];

    for (let i = 0; i < counterCount; i++) {
      counterKeypairs.push(Keypair.generate());
    }

    // 方法1：传统交易（逐个创建）
    console.log('📊 方法1：传统交易（逐个操作）');
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

      console.log(`✅ 创建计数器 ${i + 1}/${counterCount}`);
    }

    const time1 = Date.now() - startTime1;
    console.log(`⏱️ 传统方法耗时: ${time1}ms`);

    // 创建新的计数器用于 ALT 演示
    const altCounterKeypairs: Keypair[] = [];
    for (let i = 0; i < counterCount; i++) {
      altCounterKeypairs.push(Keypair.generate());
    }

    // 方法2：ALT 交易（批量创建）
    console.log('\n📊 方法2：ALT 交易（批量操作）');
    const startTime2 = Date.now();

    // 创建地址查找表
    const allAddresses = [
      this.payer.publicKey,
      PROGRAM_ID,
      ...altCounterKeypairs.map(kp => kp.publicKey),
    ];

    const { lookupTableAccount } = await this.altManager.createLookupTable(allAddresses);

    // 批量创建
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
    console.log(`⏱️ ALT 方法耗时: ${time2}ms`);

    // 性能对比
    console.log('\n📈 性能对比结果:');
    console.log(`传统方法: ${time1}ms (${counterCount} 个交易)`);
    console.log(`ALT 方法: ${time2}ms (1 个交易 + ALT 创建)`);
    console.log(`效率提升: ${((time1 - time2) / time1 * 100).toFixed(1)}%`);
  }

  /**
   * 运行演示
   */
  async run(): Promise<void> {
    const args = process.argv.slice(2);
    const demo = args[0] || 'basic';

    console.log('🎓 ALT 教学演示程序');
    console.log(`💰 付款人地址: ${this.payer.publicKey.toBase58()}`);
    console.log(`🔗 程序 ID: ${PROGRAM_ID.toBase58()}`);

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
          console.log('❌ 未知的演示类型');
          console.log('可用选项: basic, alt, compare');
          break;
      }
    } catch (error) {
      console.error('❌ 演示过程中发生错误:', error);
    }
  }
}

// 主函数
async function main() {
  const tutorial = new ALTTutorial();
  await tutorial.run();
}

// 运行程序
if (require.main === module) {
  main().catch(console.error);
}
```

## 步骤 4: 构建和部署

### 4.1 构建程序

```bash
cd program
cargo build-bpf
```

### 4.2 部署程序

```bash
# 设置 Solana 配置到 devnet
solana config set --url devnet

# 创建钱包（如果没有）
solana-keygen new --outfile ~/.config/solana/id.json

# 请求空投
solana airdrop 2

# 部署程序
solana program deploy target/deploy/alt_tutorial.so
```

**重要**: 记下部署后的程序 ID，并在 `client/src/index.ts` 中更新 `PROGRAM_ID`。

### 4.3 安装客户端依赖

```bash
cd ../client
npm install
```

## 步骤 5: 运行演示

### 5.1 基础演示

```bash
npm run demo:basic
```

这个演示展示：
- 创建单个计数器
- 使用传统交易操作

### 5.2 ALT 演示

```bash
npm run demo:alt
```

这个演示展示：
- 创建地址查找表
- 批量创建多个计数器
- 使用版本化交易

### 5.3 性能对比演示

```bash
npm run demo:compare
```

这个演示展示：
- 传统交易 vs ALT 交易的性能对比
- 时间和效率的差异

## 学习要点

### 1. 地址查找表的优势
- **突破限制**: 从 35 个账户提升到 256 个
- **节省空间**: 1 字节索引 vs 32 字节地址
- **批量操作**: 单个交易处理多个账户

### 2. 版本化交易
- 使用 `TransactionMessage` 和 `compileToV0Message`
- 支持地址查找表
- 向后兼容传统交易

### 3. 实际应用场景
- DeFi 协议的批量操作
- 游戏中的批量状态更新
- NFT 的批量铸造
- 任何需要大量账户交互的场景

### 4. 最佳实践
- 提前规划地址查找表
- 合理管理查找表生命周期
- 处理预热期要求
- 优化交易大小和成本

通过这个完整的教学代码，您可以：
1. 理解 ALT 的工作原理
2. 学会创建和使用地址查找表
3. 对比传统交易和 ALT 交易的差异
4. 掌握在实际项目中应用 ALT 的技巧


