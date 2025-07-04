I'll guide you through creating a new project to learn about Solana system variables. Let's create a step-by-step implementation that demonstrates how to access and use these variables in a Solana program.

# Solana 系统变量学习项目

## 1. 创建项目目录

```bash
# 创建项目目录
mkdir -p solana-sysvar-demo
cd solana-sysvar-demo

# 初始化Rust项目
cargo init --lib
```

## 2. 配置项目依赖

编辑`Cargo.toml`文件：

```toml:Cargo.toml
[package]
name = "solana-sysvar-demo"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-program = "1.16.0"
borsh = { version = "0.10.3", features = ["derive"] }
thiserror = "1.0.56"

[lib]
crate-type = ["cdylib", "lib"]

[features]
no-entrypoint = []
```

## 3. 创建程序文件

现在创建主程序文件，演示如何访问和使用Solana系统变量：

```rust:src/lib.rs
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{clock::Clock, rent::Rent, Sysvar},
};

// 定义指令类型
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum SysvarInstruction {
    // 获取并显示Clock系统变量
    ShowClock,
    // 获取并显示Rent系统变量
    ShowRent,
    // 创建一个账户并计算所需的最小余额
    CalculateRent { size: u64 },
    // 使用传入的系统变量账户
    ShowClockFromAccount,
}

// 定义程序入口点
entrypoint!(process_instruction);

// 处理指令
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // 解析指令数据
    let instruction = SysvarInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        SysvarInstruction::ShowClock => {
            // 直接获取Clock系统变量
            let clock = Clock::get()?;
            
            msg!("===== Clock Sysvar =====");
            msg!("Slot: {}", clock.slot);
            msg!("Epoch: {}", clock.epoch);
            msg!("Unix Timestamp: {}", clock.unix_timestamp);
            msg!("Epoch Start Timestamp: {}", clock.epoch_start_timestamp);
            msg!("Leader Schedule Epoch: {}", clock.leader_schedule_epoch);
        }
        SysvarInstruction::ShowRent => {
            // 直接获取Rent系统变量
            let rent = Rent::get()?;
            
            msg!("===== Rent Sysvar =====");
            msg!("Lamports per byte year: {}", rent.lamports_per_byte_year);
            msg!("Exemption threshold: {}", rent.exemption_threshold);
            msg!("Burn percent: {}", rent.burn_percent);
        }
        SysvarInstruction::CalculateRent { size } => {
            // 获取Rent系统变量并计算所需的最小余额
            let rent = Rent::get()?;
            let minimum_balance = rent.minimum_balance(size as usize);
            
            msg!("===== Rent Calculation =====");
            msg!("Account size: {} bytes", size);
            msg!("Minimum balance for rent exemption: {} lamports", minimum_balance);
            msg!("Yearly rent: {} lamports", rent.lamports_per_byte_year * size);
        }
        SysvarInstruction::ShowClockFromAccount => {
            // 从传入的账户获取Clock系统变量
            let account_info_iter = &mut accounts.iter();
            let clock_sysvar_info = next_account_info(account_info_iter)?;
            
            // 验证账户是否为Clock系统变量账户
            if clock_sysvar_info.key != &solana_program::sysvar::clock::id() {
                return Err(ProgramError::InvalidArgument);
            }
            
            let clock = Clock::from_account_info(clock_sysvar_info)?;
            
            msg!("===== Clock Sysvar (from account) =====");
            msg!("Slot: {}", clock.slot);
            msg!("Epoch: {}", clock.epoch);
            msg!("Unix Timestamp: {}", clock.unix_timestamp);
        }
    }

    Ok(())
}

// 单元测试
#[cfg(test)]
mod test {
    use super::*;
    use solana_program::clock::Epoch;

    #[test]
    fn test_instruction_serialization() {
        let instruction = SysvarInstruction::CalculateRent { size: 1024 };
        let serialized = borsh::to_vec(&instruction).unwrap();
        let deserialized = SysvarInstruction::try_from_slice(&serialized).unwrap();
        
        match deserialized {
            SysvarInstruction::CalculateRent { size } => {
                assert_eq!(size, 1024);
            }
            _ => panic!("Unexpected instruction variant"),
        }
    }
}
```

## 4. 创建客户端代码

现在，让我们创建一个客户端来调用我们的程序：

```bash
mkdir -p client
```

创建客户端的`package.json`文件：

```json:client/package.json
{
  "name": "solana-sysvar-client",
  "version": "1.0.0",
  "description": "Client for Solana Sysvar Demo",
  "main": "client.js",
  "scripts": {
    "build": "tsc",
    "start": "ts-node client.ts"
  },
  "dependencies": {
    "@solana/web3.js": "^1.78.0",
    "borsh": "^0.7.0"
  },
  "devDependencies": {
    "@types/node": "^18.11.18",
    "ts-node": "^10.9.1",
    "typescript": "^4.9.4"
  }
}
```

创建TypeScript配置文件：

```json:client/tsconfig.json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["*.ts"]
}
```

创建客户端代码：

```typescript:client/client.ts
import * as borsh from 'borsh';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

// 连接到本地网络或开发网
const CLUSTER_URL = process.env.CLUSTER_URL || clusterApiUrl('devnet');
// 替换为你部署的程序ID
const PROGRAM_ID = process.env.PROGRAM_ID || "YOUR_DEPLOYED_PROGRAM_ID";

const connection = new Connection(CLUSTER_URL);
const programId = new PublicKey(PROGRAM_ID);

// 加载支付者密钥对
const payerKeypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
const payer = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync(payerKeypairPath, "utf8")))
);

// 定义指令枚举
enum SysvarInstructionEnum {
  ShowClock,
  ShowRent,
  CalculateRent,
  ShowClockFromAccount,
}

// 定义指令类
class CalculateRentInstruction {
  size: number;
  constructor(size: number) {
    this.size = size;
  }
}

// 定义指令序列化架构
const instructionSchema = new Map([
  [
    CalculateRentInstruction,
    {
      kind: 'struct',
      fields: [
        ['size', 'u64'],
      ],
    },
  ],
]);

// 创建ShowClock指令
async function createShowClockInstruction(): Promise<TransactionInstruction> {
  const data = Buffer.from([SysvarInstructionEnum.ShowClock]);
  
  return new TransactionInstruction({
    keys: [],
    programId,
    data,
  });
}

// 创建ShowRent指令
async function createShowRentInstruction(): Promise<TransactionInstruction> {
  const data = Buffer.from([SysvarInstructionEnum.ShowRent]);
  
  return new TransactionInstruction({
    keys: [],
    programId,
    data,
  });
}

// 创建CalculateRent指令
async function createCalculateRentInstruction(size: number): Promise<TransactionInstruction> {
  // 创建指令数据
  const instruction = new CalculateRentInstruction(size);
  
  // 序列化指令类型和数据
  const instructionBuffer = Buffer.from([SysvarInstructionEnum.CalculateRent]);
  const dataBuffer = Buffer.from(borsh.serialize(instructionSchema, instruction));
  const data = Buffer.concat([instructionBuffer, dataBuffer]);
  
  return new TransactionInstruction({
    keys: [],
    programId,
    data,
  });
}

// 创建ShowClockFromAccount指令
async function createShowClockFromAccountInstruction(): Promise<TransactionInstruction> {
  const data = Buffer.from([SysvarInstructionEnum.ShowClockFromAccount]);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

async function main() {
  console.log("Solana Sysvar Demo Client");
  console.log("Payer public key:", payer.publicKey.toBase58());
  console.log("Program ID:", programId.toBase58());
  console.log("Cluster URL:", CLUSTER_URL);
  
  // 演示1: 直接获取Clock系统变量
  console.log("\n1. Demonstrating direct Clock sysvar access...");
  try {
    const instruction = await createShowClockInstruction();
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Transaction signature:", signature);
  } catch (error) {
    console.error("Error:", error);
  }
  
  // 演示2: 直接获取Rent系统变量
  console.log("\n2. Demonstrating direct Rent sysvar access...");
  try {
    const instruction = await createShowRentInstruction();
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Transaction signature:", signature);
  } catch (error) {
    console.error("Error:", error);
  }
  
  // 演示3: 计算账户的最小余额
  console.log("\n3. Calculating minimum rent for an account...");
  try {
    const accountSize = 1024; // 1KB
    const instruction = await createCalculateRentInstruction(accountSize);
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Transaction signature:", signature);
  } catch (error) {
    console.error("Error:", error);
  }
  
  // 演示4: 从账户获取Clock系统变量
  console.log("\n4. Accessing Clock sysvar from account...");
  try {
    const instruction = await createShowClockFromAccountInstruction();
    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Transaction signature:", signature);
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
});
```

## 5. 编译和部署步骤

### 5.1 编译程序

```bash
cd solana-sysvar-demo
cargo build-bpf
```

### 5.2 部署程序

```bash
solana program deploy target/deploy/solana_sysvar_demo.so
```

记下部署后得到的程序ID，并更新客户端代码中的`PROGRAM_ID`变量。

### 5.3 安装客户端依赖并运行

```bash
cd client
npm install
# 设置环境变量
export PROGRAM_ID=<你的程序ID>
# 运行客户端
npm run start
```

## 6. 项目结构总结

```
solana-sysvar-demo/
├── src/
│   └── lib.rs           # 主程序代码
├── client/
│   ├── client.ts        # 客户端代码
│   ├── package.json     # 客户端依赖
│   └── tsconfig.json    # TypeScript配置
└── Cargo.toml           # Rust项目配置
```

## 7. 系统变量总结

在这个项目中，我们演示了如何访问和使用Solana的系统变量：

1. **直接获取系统变量**：使用`Sysvar::get()`方法直接获取系统变量，如`Clock::get()`和`Rent::get()`。

2. **从账户获取系统变量**：通过传递系统变量账户，使用`from_account_info`方法获取系统变量，如`Clock::from_account_info(clock_sysvar_info)`。

3. **使用Rent计算账户最小余额**：使用`Rent::minimum_balance(size)`计算账户所需的最小余额以免除租金。

这个项目涵盖了Solana中最常用的系统变量，特别是`Clock`和`Rent`，它们在实际开发中非常重要。通过这个项目，你可以了解如何在Solana程序中访问和使用这些系统变量。
