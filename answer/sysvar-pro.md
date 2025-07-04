# Solana 系统变量学习项目（增强版）

我将为您创建一个更完善的Solana系统变量示例项目，包括额外的系统变量访问方法和更多实用功能。

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

```toml
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
test-bpf = []
```

## 3. 创建程序文件

现在创建一个更全面的主程序文件，演示如何访问和使用Solana系统变量：

```rust
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{Clock, UnixTimestamp},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{
        self, clock, epoch_schedule::EpochSchedule, fees::Fees, instructions::Instructions,
        recent_blockhashes::RecentBlockhashes, rent, slot_hashes::SlotHashes,
        slot_history::SlotHistory, stake_history::StakeHistory, Sysvar,
    },
};

// 定义指令类型
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum SysvarInstruction {
    // 基本系统变量访问
    ShowClock,
    ShowRent,
    ShowEpochSchedule,
    ShowFees,
    
    // 从账户访问系统变量
    ShowClockFromAccount,
    ShowRentFromAccount,
    ShowEpochScheduleFromAccount,
    ShowFeesFromAccount,
    
    // 创建一个账户并计算所需的最小余额
    CalculateRent { size: u64 },
    
    // 创建一个PDA账户
    CreatePdaAccount { space: u64, seed: String },
    
    // 获取账户创建时间
    GetAccountCreationTime { account_seed: String },
    
    // 检查账户是否需要支付租金
    CheckRentExemption { account_seed: String },
    
    // 获取多个系统变量
    ShowMultipleSysvars,
}

// 定义程序入口点
entrypoint!(process_instruction);

// 处理指令
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // 解析指令数据
    let instruction = SysvarInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        // 基本系统变量访问
        SysvarInstruction::ShowClock => show_clock(),
        SysvarInstruction::ShowRent => show_rent(),
        SysvarInstruction::ShowEpochSchedule => show_epoch_schedule(),
        SysvarInstruction::ShowFees => show_fees(),
        
        // 从账户访问系统变量
        SysvarInstruction::ShowClockFromAccount => show_clock_from_account(accounts),
        SysvarInstruction::ShowRentFromAccount => show_rent_from_account(accounts),
        SysvarInstruction::ShowEpochScheduleFromAccount => show_epoch_schedule_from_account(accounts),
        SysvarInstruction::ShowFeesFromAccount => show_fees_from_account(accounts),
        
        // 创建一个账户并计算所需的最小余额
        SysvarInstruction::CalculateRent { size } => calculate_rent(size),
        
        // 创建一个PDA账户
        SysvarInstruction::CreatePdaAccount { space, seed } => {
            create_pda_account(program_id, accounts, space, &seed)
        }
        
        // 获取账户创建时间
        SysvarInstruction::GetAccountCreationTime { account_seed } => {
            get_account_creation_time(program_id, accounts, &account_seed)
        }
        
        // 检查账户是否需要支付租金
        SysvarInstruction::CheckRentExemption { account_seed } => {
            check_rent_exemption(program_id, accounts, &account_seed)
        }
        
        // 获取多个系统变量
        SysvarInstruction::ShowMultipleSysvars => show_multiple_sysvars(),
    }
}

// 直接获取Clock系统变量
fn show_clock() -> ProgramResult {
    let clock = Clock::get()?;
    
    msg!("===== Clock Sysvar (direct) =====");
    msg!("Slot: {}", clock.slot);
    msg!("Epoch: {}", clock.epoch);
    msg!("Unix Timestamp: {}", clock.unix_timestamp);
    msg!("Epoch Start Timestamp: {}", clock.epoch_start_timestamp);
    msg!("Leader Schedule Epoch: {}", clock.leader_schedule_epoch);
    
    Ok(())
}

// 直接获取Rent系统变量
fn show_rent() -> ProgramResult {
    let rent = Rent::get()?;
    
    msg!("===== Rent Sysvar (direct) =====");
    msg!("Lamports per byte year: {}", rent.lamports_per_byte_year);
    msg!("Exemption threshold: {}", rent.exemption_threshold);
    msg!("Burn percent: {}", rent.burn_percent);
    
    Ok(())
}

// 直接获取EpochSchedule系统变量
fn show_epoch_schedule() -> ProgramResult {
    let epoch_schedule = EpochSchedule::get()?;
    
    msg!("===== EpochSchedule Sysvar (direct) =====");
    msg!("Slots per epoch: {}", epoch_schedule.slots_per_epoch);
    msg!("Leader schedule slot offset: {}", epoch_schedule.leader_schedule_slot_offset);
    msg!("Warmup: {}", epoch_schedule.warmup);
    msg!("First normal epoch: {}", epoch_schedule.first_normal_epoch);
    msg!("First normal slot: {}", epoch_schedule.first_normal_slot);
    
    Ok(())
}

// 直接获取Fees系统变量
fn show_fees() -> ProgramResult {
    let fees = Fees::get()?;
    
    msg!("===== Fees Sysvar (direct) =====");
    msg!("Lamports per signature: {}", fees.fee_calculator.lamports_per_signature);
    
    Ok(())
}

// 从账户获取Clock系统变量
fn show_clock_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let clock_sysvar_info = next_account_info(account_info_iter)?;
    
    // 验证账户是否为Clock系统变量账户
    if clock_sysvar_info.key != &clock::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let clock = Clock::from_account_info(clock_sysvar_info)?;
    
    msg!("===== Clock Sysvar (from account) =====");
    msg!("Slot: {}", clock.slot);
    msg!("Epoch: {}", clock.epoch);
    msg!("Unix Timestamp: {}", clock.unix_timestamp);
    msg!("Epoch Start Timestamp: {}", clock.epoch_start_timestamp);
    msg!("Leader Schedule Epoch: {}", clock.leader_schedule_epoch);
    
    Ok(())
}

// 从账户获取Rent系统变量
fn show_rent_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let rent_sysvar_info = next_account_info(account_info_iter)?;
    
    // 验证账户是否为Rent系统变量账户
    if rent_sysvar_info.key != &rent::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let rent = Rent::from_account_info(rent_sysvar_info)?;
    
    msg!("===== Rent Sysvar (from account) =====");
    msg!("Lamports per byte year: {}", rent.lamports_per_byte_year);
    msg!("Exemption threshold: {}", rent.exemption_threshold);
    msg!("Burn percent: {}", rent.burn_percent);
    
    Ok(())
}

// 从账户获取EpochSchedule系统变量
fn show_epoch_schedule_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let epoch_schedule_sysvar_info = next_account_info(account_info_iter)?;
    
    // 验证账户是否为EpochSchedule系统变量账户
    if epoch_schedule_sysvar_info.key != &sysvar::epoch_schedule::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let epoch_schedule = EpochSchedule::from_account_info(epoch_schedule_sysvar_info)?;
    
    msg!("===== EpochSchedule Sysvar (from account) =====");
    msg!("Slots per epoch: {}", epoch_schedule.slots_per_epoch);
    msg!("Leader schedule slot offset: {}", epoch_schedule.leader_schedule_slot_offset);
    msg!("Warmup: {}", epoch_schedule.warmup);
    msg!("First normal epoch: {}", epoch_schedule.first_normal_epoch);
    msg!("First normal slot: {}", epoch_schedule.first_normal_slot);
    
    Ok(())
}

// 从账户获取Fees系统变量
fn show_fees_from_account(accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let fees_sysvar_info = next_account_info(account_info_iter)?;
    
    // 验证账户是否为Fees系统变量账户
    if fees_sysvar_info.key != &sysvar::fees::id() {
        return Err(ProgramError::InvalidArgument);
    }
    
    let fees = Fees::from_account_info(fees_sysvar_info)?;
    
    msg!("===== Fees Sysvar (from account) =====");
    msg!("Lamports per signature: {}", fees.fee_calculator.lamports_per_signature);
    
    Ok(())
}

// 计算账户所需的最小余额
fn calculate_rent(size: u64) -> ProgramResult {
    let rent = Rent::get()?;
    
    let minimum_balance = rent.minimum_balance(size as usize);
    let yearly_rent = rent.lamports_per_byte_year * size;
    
    msg!("===== Rent Calculation =====");
    msg!("Account size: {} bytes", size);
    msg!("Minimum balance for rent exemption: {} lamports", minimum_balance);
    msg!("Yearly rent: {} lamports", yearly_rent);
    
    // 计算不同大小账户的租金
    let sizes = [0, 10, 100, 1000, 10000];
    msg!("\nRent for different account sizes:");
    
    for &s in sizes.iter() {
        let min_balance = rent.minimum_balance(s as usize);
        msg!("Size: {} bytes, Minimum balance: {} lamports", s, min_balance);
    }
    
    Ok(())
}

// 创建PDA账户
fn create_pda_account(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    space: u64,
    seed: &str,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let pda_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    
    // 验证系统程序
    if system_program.key != &solana_program::system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }
    
    // 计算PDA和bump seed
    let seeds = &[seed.as_bytes()];
    let (expected_pda, bump_seed) = Pubkey::find_program_address(seeds, program_id);
    
    // 验证提供的PDA账户是否匹配计算出的PDA
    if expected_pda != *pda_account.key {
        msg!("Error: PDA account does not match the derived address");
        msg!("Expected: {}", expected_pda);
        msg!("Provided: {}", pda_account.key);
        return Err(ProgramError::InvalidArgument);
    }
    
    // 获取Rent系统变量
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space as usize);
    
    msg!("Creating PDA account with:");
    msg!("Seed: {}", seed);
    msg!("Bump seed: {}", bump_seed);
    msg!("Space: {} bytes", space);
    msg!("Lamports: {}", lamports);
    
    // 创建PDA账户
    let seeds_with_bump = &[seed.as_bytes(), &[bump_seed]];
    
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            pda_account.key,
            lamports,
            space,
            program_id,
        ),
        &[
            payer.clone(),
            pda_account.clone(),
            system_program.clone(),
        ],
        &[seeds_with_bump],
    )?;
    
    // 获取当前时间并存储在账户数据中
    let clock = Clock::get()?;
    let timestamp = clock.unix_timestamp;
    
    // 将时间戳存储在账户数据的前8个字节中
    let mut data = pda_account.try_borrow_mut_data()?;
    let timestamp_bytes = timestamp.to_le_bytes();
    data[0..8].copy_from_slice(&timestamp_bytes);
    
    msg!("PDA account created successfully at timestamp: {}", timestamp);
    
    Ok(())
}

// 获取账户创建时间
fn get_account_creation_time(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    account_seed: &str,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pda_account = next_account_info(account_info_iter)?;
    
    // 计算PDA
    let seeds = &[account_seed.as_bytes()];
    let (expected_pda, _) = Pubkey::find_program_address(seeds, program_id);
    
    // 验证提供的PDA账户是否匹配计算出的PDA
    if expected_pda != *pda_account.key {
        return Err(ProgramError::InvalidArgument);
    }
    
    // 从账户数据中读取时间戳
    let data = pda_account.try_borrow_data()?;
    if data.len() < 8 {
        return Err(ProgramError::InvalidAccountData);
    }
    
    let timestamp_bytes = [data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7]];
    let creation_timestamp = i64::from_le_bytes(timestamp_bytes);
    
    // 获取当前时间
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    
    // 计算账户年龄
    let account_age_seconds = current_timestamp - creation_timestamp;
    let account_age_days = account_age_seconds / (24 * 60 * 60);
    
    msg!("===== Account Creation Time =====");
    msg!("Account: {}", pda_account.key);
    msg!("Creation timestamp: {}", creation_timestamp);
    msg!("Current timestamp: {}", current_timestamp);
    msg!("Account age: {} seconds ({} days)", account_age_seconds, account_age_days);
    
    Ok(())
}

// 检查账户是否需要支付租金
fn check_rent_exemption(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    account_seed: &str,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pda_account = next_account_info(account_info_iter)?;
    
    // 计算PDA
    let seeds = &[account_seed.as_bytes()];
    let (expected_pda, _) = Pubkey::find_program_address(seeds, program_id);
    
    // 验证提供的PDA账户是否匹配计算出的PDA
    if expected_pda != *pda_account.key {
        return Err(ProgramError::InvalidArgument);
    }
    
    // 获取Rent系统变量
    let rent = Rent::get()?;
    
    // 检查账户是否免除租金
    let is_exempt = rent.is_exempt(pda_account.lamports(), pda_account.data_len());
    
    msg!("===== Rent Exemption Check =====");
    msg!("Account: {}", pda_account.key);
    msg!("Account size: {} bytes", pda_account.data_len());
    msg!("Account balance: {} lamports", pda_account.lamports());
    msg!("Minimum required for exemption: {} lamports", 
         rent.minimum_balance(pda_account.data_len()));
    
    if is_exempt {
        msg!("Account IS exempt from rent");
    } else {
        msg!("Account is NOT exempt from rent");
        
        // 计算还需要多少lamports才能免除租金
        let required_lamports = rent.minimum_balance(pda_account.data_len())
            .saturating_sub(pda_account.lamports());
        
        msg!("Additional lamports needed for exemption: {}", required_lamports);
    }
    
    Ok(())
}

// 获取多个系统变量
fn show_multiple_sysvars() -> ProgramResult {
    // 获取Clock
    let clock = Clock::get()?;
    
    // 获取Rent
    let rent = Rent::get()?;
    
    // 获取EpochSchedule
    let epoch_schedule = EpochSchedule::get()?;
    
    // 尝试获取其他系统变量
    let fees_result = Fees::get();
    let slot_hashes_result = SlotHashes::get();
    let slot_history_result = SlotHistory::get();
    let stake_history_result = StakeHistory::get();
    
    msg!("===== Multiple Sysvars =====");
    
    // Clock信息
    msg!("\nClock:");
    msg!("  Slot: {}", clock.slot);
    msg!("  Epoch: {}", clock.epoch);
    msg!("  Unix Timestamp: {}", clock.unix_timestamp);
    
    // Rent信息
    msg!("\nRent:");
    msg!("  Lamports per byte year: {}", rent.lamports_per_byte_year);
    msg!("  Exemption threshold: {}", rent.exemption_threshold);
    
    // EpochSchedule信息
    msg!("\nEpochSchedule:");
    msg!("  Slots per epoch: {}", epoch_schedule.slots_per_epoch);
    
    // 其他系统变量的可用性
    msg!("\nOther Sysvars Availability:");
    msg!("  Fees: {}", if fees_result.is_ok() { "Available" } else { "Not available" });
    msg!("  SlotHashes: {}", if slot_hashes_result.is_ok() { "Available" } else { "Not available" });
    msg!("  SlotHistory: {}", if slot_history_result.is_ok() { "Available" } else { "Not available" });
    msg!("  StakeHistory: {}", if stake_history_result.is_ok() { "Available" } else { "Not available" });
    
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

现在，让我们创建一个更全面的客户端来调用我们的程序：

```bash
mkdir -p client
```

创建客户端的`package.json`文件：

```json
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

```json
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

```typescript
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
  SYSVAR_EPOCH_SCHEDULE_PUBKEY,
  SYSVAR_FEES_PUBKEY,
  SystemProgram,
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
  ShowEpochSchedule,
  ShowFees,
  ShowClockFromAccount,
  ShowRentFromAccount,
  ShowEpochScheduleFromAccount,
  ShowFeesFromAccount,
  CalculateRent,
  CreatePdaAccount,
  GetAccountCreationTime,
  CheckRentExemption,
  ShowMultipleSysvars,
}

// 定义指令类
class CalculateRentInstruction {
  size: number;
  constructor(size: number) {
    this.size = size;
  }
}

class CreatePdaAccountInstruction {
  space: number;
  seed: string;
  constructor(space: number, seed: string) {
    this.space = space;
    this.seed = seed;
  }
}

class GetAccountCreationTimeInstruction {
  account_seed: string;
  constructor(account_seed: string) {
    this.account_seed = account_seed;
  }
}

class CheckRentExemptionInstruction {
  account_seed: string;
  constructor(account_seed: string) {
    this.account_seed = account_seed;
  }
}

// 定义序列化架构
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
  [
    CreatePdaAccountInstruction,
    {
      kind: 'struct',
      fields: [
        ['space', 'u64'],
        ['seed', 'string'],
      ],
    },
  ],
  [
    GetAccountCreationTimeInstruction,
    {
      kind: 'struct',
      fields: [
        ['account_seed', 'string'],
      ],
    },
  ],
  [
    CheckRentExemptionInstruction,
    {
      kind: 'struct',
      fields: [
        ['account_seed', 'string'],
      ],
    },
  ],
]);

// 创建基本指令
function createBasicInstruction(instructionType: SysvarInstructionEnum): TransactionInstruction {
  const data = Buffer.from([instructionType]);
  
  return new TransactionInstruction({
    keys: [],
    programId,
    data,
  });
}

// 创建需要系统变量账户的指令
function createSysvarAccountInstruction(
  instructionType: SysvarInstructionEnum,
  sysvarPubkey: PublicKey
): TransactionInstruction {
  const data = Buffer.from([instructionType]);
  
  return new TransactionInstruction({
    keys: [
      { pubkey: sysvarPubkey, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

// 创建CalculateRent指令
function createCalculateRentInstruction(size: number): TransactionInstruction {
  const instruction = new CalculateRentInstruction(size);
  
  const instructionBuffer = Buffer.from([SysvarInstructionEnum.CalculateRent]);
  const dataBuffer = Buffer.from(borsh.serialize(instructionSchema, instruction));
  const data = Buffer.concat([instructionBuffer, dataBuffer]);
  
  return new TransactionInstruction({
    keys: [],
    programId,
    data,
  });
}

// 创建CreatePdaAccount指令
async function createCreatePdaAccountInstruction(
  space: number,
  seed: string
): Promise<[TransactionInstruction, PublicKey]> {
  const instruction = new CreatePdaAccountInstruction(space, seed);
  
  const instructionBuffer = Buffer.from([SysvarInstructionEnum.CreatePdaAccount]);
  const dataBuffer = Buffer.from(borsh.serialize(instructionSchema, instruction));
  const data = Buffer.concat([instructionBuffer, dataBuffer]);
  
  // 计算PDA地址
  const [pdaAddress] = await PublicKey.findProgramAddress(
    [Buffer.from(seed)],
    programId
  );
  
  return [
    new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: pdaAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    }),
    pdaAddress
  ];
}

// 创建GetAccountCreationTime指令
async function createGetAccountCreationTimeInstruction(
  accountSeed: string
): Promise<[TransactionInstruction, PublicKey]> {
  const instruction = new GetAccountCreationTimeInstruction(accountSeed);
  
  const instructionBuffer = Buffer.from([SysvarInstructionEnum.GetAccountCreationTime]);
  const dataBuffer = Buffer.from(borsh.serialize(instructionSchema, instruction));
  const data = Buffer.concat([instructionBuffer, dataBuffer]);
  
  // 计算PDA地址
  const [pdaAddress] = await PublicKey.findProgramAddress(
    [Buffer.from(accountSeed)],
    programId
  );
  
  return [
    new TransactionInstruction({
      keys: [
        { pubkey: pdaAddress, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    }),
    pdaAddress
  ];
}

// 创建CheckRentExemption指令
async function createCheckRentExemptionInstruction(
  accountSeed: string
): Promise<[TransactionInstruction, PublicKey]> {
  const instruction = new CheckRentExemptionInstruction(accountSeed);
  
  const instructionBuffer = Buffer.from([SysvarInstructionEnum.CheckRentExemption]);
  const dataBuffer = Buffer.from(borsh.serialize(instructionSchema, instruction));
  const data = Buffer.concat([instructionBuffer, dataBuffer]);
  
  // 计算PDA地址
  const [pdaAddress] = await PublicKey.findProgramAddress(
    [Buffer.from(accountSeed)],
    programId
  );
  
  return [
    new TransactionInstruction({
      keys: [
        { pubkey: pdaAddress, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    }),
    pdaAddress
  ];
}

// 发送交易并显示结果
async function sendTransactionWithInstruction(
  instruction: TransactionInstruction,
  description: string
): Promise<string> {
  console.log(`\n${description}...`);
  
  const transaction = new Transaction().add(instruction);
  
  try {
    const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
    console.log("Transaction signature:", signature);
    return signature;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

async function main() {
  console.log("Solana Sysvar Demo Client");
  console.log("Payer public key:", payer.publicKey.toBase58());
  console.log("Program ID:", programId.toBase58());
  console.log("Cluster URL:", CLUSTER_URL);
  
  const command = process.argv[2] || "help";
  
  try {
    switch (command) {
      case "clock":
        // 直接获取Clock系统变量
        await sendTransactionWithInstruction(
          createBasicInstruction(SysvarInstructionEnum.ShowClock),
          "Demonstrating direct Clock sysvar access"
        );
        break;
        
      case "rent":
        // 直接获取Rent系统变量
        await sendTransactionWithInstruction(
          createBasicInstruction(SysvarInstructionEnum.ShowRent),
          "Demonstrating direct Rent sysvar access"
        );
        break;
        
      case "epoch-schedule":
        // 直接获取EpochSchedule系统变量
        await sendTransactionWithInstruction(
          createBasicInstruction(SysvarInstructionEnum.ShowEpochSchedule),
          "Demonstrating direct EpochSchedule sysvar access"
        );
        break;
        
      case "fees":
        // 直接获取Fees系统变量
        await sendTransactionWithInstruction(
          createBasicInstruction(SysvarInstructionEnum.ShowFees),
          "Demonstrating direct Fees sysvar access"
        );
        break;
        
      case "clock-account":
        // 从账户获取Clock系统变量
        await sendTransactionWithInstruction(
          createSysvarAccountInstruction(
            SysvarInstructionEnum.ShowClockFromAccount,
            SYSVAR_CLOCK_PUBKEY
          ),
          "Accessing Clock sysvar from account"
        );
        break;
        
      case "rent-account":
        // 从账户获取Rent系统变量
        await sendTransactionWithInstruction(
          createSysvarAccountInstruction(
            SysvarInstructionEnum.ShowRentFromAccount,
            SYSVAR_RENT_PUBKEY
          ),
          "Accessing Rent sysvar from account"
        );
        break;
        
      case "epoch-schedule-account":
        // 从账户获取EpochSchedule系统变量
        await sendTransactionWithInstruction(
          createSysvarAccountInstruction(
            SysvarInstructionEnum.ShowEpochScheduleFromAccount,
            SYSVAR_EPOCH_SCHEDULE_PUBKEY
          ),
          "Accessing EpochSchedule sysvar from account"
        );
        break;
        
      case "fees-account":
        // 从账户获取Fees系统变量
        await sendTransactionWithInstruction(
          createSysvarAccountInstruction(
            SysvarInstructionEnum.ShowFeesFromAccount,
            SYSVAR_FEES_PUBKEY
          ),
          "Accessing Fees sysvar from account"
        );
        break;
        
      case "calculate-rent":
        // 计算账户的最小余额
        const size = parseInt(process.argv[3] || "1024");
        await sendTransactionWithInstruction(
          createCalculateRentInstruction(size),
          `Calculating minimum rent for an account of size ${size} bytes`
        );
        break;
        
      case "create-account":
        // 创建PDA账户
        const createSpace = parseInt(process.argv[3] || "100");
        const createSeed = process.argv[4] || `account-${Date.now()}`;
        
        console.log(`\nCreating PDA account with seed "${createSeed}" and space ${createSpace} bytes...`);
        
        const [createInstruction, pdaAddress] = await createCreatePdaAccountInstruction(
          createSpace,
          createSeed
        );
        
        console.log("PDA address:", pdaAddress.toBase58());
        
        const transaction = new Transaction().add(createInstruction);
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
        
        console.log("Transaction signature:", signature);
        console.log("Account created successfully!");
        console.log(`To check this account later, use: npm run start get-creation-time ${createSeed}`);
        break;
        
      case "get-creation-time":
        // 获取账户创建时间
        const timeSeed = process.argv[3];
        if (!timeSeed) {
          console.error("Error: Account seed is required");
          console.log("Usage: npm run start get-creation-time <account-seed>");
          process.exit(1);
        }
        
        const [timeInstruction, timeAddress] = await createGetAccountCreationTimeInstruction(timeSeed);
        
        console.log(`\nGetting creation time for account with seed "${timeSeed}"...`);
        console.log("PDA address:", timeAddress.toBase58());
        
        await sendTransactionWithInstruction(
          timeInstruction,
          "Getting account creation time"
        );
        break;
        
      case "check-rent":
        // 检查账户是否需要支付租金
        const rentSeed = process.argv[3];
        if (!rentSeed) {
          console.error("Error: Account seed is required");
          console.log("Usage: npm run start check-rent <account-seed>");
          process.exit(1);
        }
        
        const [rentInstruction, rentAddress] = await createCheckRentExemptionInstruction(rentSeed);
        
        console.log(`\nChecking rent exemption for account with seed "${rentSeed}"...`);
        console.log("PDA address:", rentAddress.toBase58());
        
        await sendTransactionWithInstruction(
          rentInstruction,
          "Checking rent exemption"
        );
        break;
        
      case "all-sysvars":
        // 获取多个系统变量
        await sendTransactionWithInstruction(
          createBasicInstruction(SysvarInstructionEnum.ShowMultipleSysvars),
          "Demonstrating access to multiple sysvars"
        );
        break;
        
      case "help":
      default:
        console.log("\nAvailable commands:");
        console.log("  clock                - Show Clock sysvar");
        console.log("  rent                 - Show Rent sysvar");
        console.log("  epoch-schedule       - Show EpochSchedule sysvar");
        console.log("  fees                 - Show Fees sysvar");
        console.log("  clock-account        - Show Clock sysvar from account");
        console.log("  rent-account         - Show Rent sysvar from account");
        console.log("  epoch-schedule-account - Show EpochSchedule sysvar from account");
        console.log("  fees-account         - Show Fees sysvar from account");
        console.log("  calculate-rent [size] - Calculate rent for account size (default: 1024)");
        console.log("  create-account [size] [seed] - Create PDA account");
        console.log("  get-creation-time <seed> - Get account creation time");
        console.log("  check-rent <seed>    - Check if account is rent exempt");
        console.log("  all-sysvars         - Show multiple sysvars");
        console.log("  help                - Show this help message");
        break;
    }
  } catch (error) {
    console.error("Error executing command:", error);
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

# 运行客户端的不同命令
npm run start clock
npm run start rent
npm run start calculate-rent 1024
npm run start create-account 100 my-test-account
npm run start get-creation-time my-test-account
npm run start check-rent my-test-account
npm run start all-sysvars
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

## 7. 系统变量总结与高级用法

### 7.1 系统变量访问方法

在Solana程序中，有两种主要方式访问系统变量：

1. **直接访问**：使用`Sysvar::get()`方法，如`Clock::get()`。这是最简单的方式，适用于`Clock`、`EpochSchedule`、`Fees`和`Rent`。

2. **通过账户访问**：通过传递系统变量账户，使用`from_account_info`方法，如`Clock::from_account_info(clock_sysvar_info)`。这种方式适用于所有系统变量，但需要在指令中传递相应的系统变量账户。

### 7.2 系统变量的高级用法

1. **账户创建时间记录**：
   - 在本项目中，我们演示了如何在创建PDA账户时记录当前时间戳
   - 这可以用于跟踪账户的创建时间，计算账户年龄，或实现基于时间的逻辑

2. **租金豁免检查**：
   - 使用`Rent::is_exempt`方法检查账户是否免除租金
   - 计算账户需要多少额外的lamports才能免除租金

3. **多个系统变量的组合使用**：
   - 同时使用多个系统变量来实现复杂的逻辑
   - 例如，结合`Clock`和`Rent`来实现基于时间的租金计算

4. **PDA账户创建与系统变量**：
   - 使用`Rent`系统变量计算创建PDA账户所需的最小余额
   - 确保账户有足够的lamports以免除租金

### 7.3 系统变量的实际应用场景

1. **时间锁定功能**：
   - 使用`Clock`系统变量实现基于时间的锁定/解锁功能
   - 例如，质押锁定期、投票冷却期等

2. **租金优化**：
   - 使用`Rent`系统变量优化账户大小和余额
   - 确保账户有足够的余额以免除租金，避免被清理

3. **纪元相关逻辑**：
   - 使用`EpochSchedule`和`Clock`实现基于纪元的逻辑
   - 例如，每个纪元分发奖励、更新状态等

4. **费用估算**：
   - 使用`Fees`系统变量估算交易费用
   - 在程序中根据当前费率调整行为

通过这个增强版的项目，你不仅可以学习如何访问和使用Solana的系统变量，还可以了解如何将它们应用于实际场景，例如账户创建时间记录、租金检查和PDA账户管理。这些知识对于开发高效、安全的Solana程序非常重要。

# PDA账户创建与系统变量的关系

创建PDA账户与系统变量之间有几个重要的关联点，特别是与`Rent`系统变量的关系非常密切。让我来解释这些关系：

## 1. 计算所需的最小余额 (Rent豁免)

创建PDA账户时，需要给账户分配足够的lamports以确保它不会因为租金不足而被清理。这个金额是通过`Rent`系统变量计算的：

```rust
// 获取Rent系统变量
let rent = Rent::get()?;
// 计算账户需要的最小余额以免除租金
let lamports = rent.minimum_balance(space as usize);
```

这里使用了`Rent`系统变量的`minimum_balance`方法，它根据账户大小计算出免除租金所需的最小余额。这确保了PDA账户在创建后不会因为租金不足而被系统清理。

## 2. 记录创建时间

在示例代码中，PDA账户创建后，我们使用`Clock`系统变量获取当前时间戳并将其存储在账户数据中：

```rust
// 获取当前时间并存储在账户数据中
let clock = Clock::get()?;
let timestamp = clock.unix_timestamp;

// 将时间戳存储在账户数据的前8个字节中
let mut data = pda_account.try_borrow_mut_data()?;
let timestamp_bytes = timestamp.to_le_bytes();
data[0..8].copy_from_slice(&timestamp_bytes);
```

这样，我们就可以追踪账户的创建时间，这在很多应用场景中非常有用，比如时间锁定功能、账户有效期等。

## 3. 账户大小与租金计算

创建PDA账户时，我们需要指定账户的大小(`space`)。账户大小直接影响到所需的租金金额：

```rust
invoke_signed(
    &system_instruction::create_account(
        payer.key,
        pda_account.key,
        lamports,  // 这个值是通过Rent系统变量计算的
        space,     // 账户大小
        program_id,
    ),
    // ...
);
```

账户越大，所需的最小余额就越多。这是因为Solana的租金模型是基于存储空间的 - 占用越多的链上存储，就需要支付越多的租金。

## 4. 租金豁免状态检查

创建账户后，我们可以使用`Rent`系统变量检查账户是否真的免除了租金：

```rust
let rent = Rent::get()?;
let is_exempt = rent.is_exempt(pda_account.lamports(), pda_account.data_len());
```

这对于确保账户安全非常重要，因为非租金豁免的账户可能会在未来被系统清理。

## 5. 纪元和时间相关的账户逻辑

在某些应用中，PDA账户可能需要与特定的纪元或时间点相关联。这时，`Clock`和`EpochSchedule`系统变量可以提供必要的时间信息：

```rust
let clock = Clock::get()?;
let current_epoch = clock.epoch;
let current_timestamp = clock.unix_timestamp;
```

## 总结

创建PDA账户与系统变量的关系主要体现在：

1. 使用`Rent`系统变量计算所需的最小余额
2. 使用`Clock`系统变量记录账户创建时间
3. 账户大小与租金计算的直接关系
4. 使用`Rent`系统变量验证租金豁免状态
5. 使用`Clock`和`EpochSchedule`系统变量实现时间和纪元相关的账户逻辑

这些关系使得系统变量成为创建和管理PDA账户过程中不可或缺的部分，特别是在需要考虑账户持久性、时间相关逻辑和资源优化的情况下。
