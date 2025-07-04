# 备忘录合约程序实现

我将帮你实现一个备忘录合约程序，可以在链上存储内容并进行修改、删除，同时设置权限控制。我会按照你提供的项目结构来组织代码。

让我们一步步实现这个合约：

## 1. 首先定义 `lib.rs`

```rust:solana-memo-contract/src/lib.rs
pub mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

pub use solana_program;
```

## 2. 定义错误类型 `error.rs`

```rust:solana-memo-contract/src/error.rs
use solana_program::{
    decode_error::DecodeError,
    msg,
    program_error::ProgramError,
};
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum MemoError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    
    #[error("Not rent exempt")]
    NotRentExempt,
    
    #[error("Expected amount mismatch")]
    ExpectedAmountMismatch,
    
    #[error("Memo content too long")]
    MemoTooLong,
    
    #[error("Account not initialized")]
    UninitializedAccount,
    
    #[error("Unauthorized access")]
    Unauthorized,
}

impl From<MemoError> for ProgramError {
    fn from(e: MemoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for MemoError {
    fn type_of() -> &'static str {
        "Memo Error"
    }
}
```

## 3. 定义状态 `state.rs`

```rust:solana-memo-contract/src/state.rs
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Memo {
    pub is_initialized: bool,
    pub authority: Pubkey,  // 控制谁可以修改
    pub content: String,
}

impl Memo {
    pub const MAX_CONTENT_LENGTH: usize = 1000; // 设置一个合理的内容长度限制
}
```

## 4. 定义指令 `instruction.rs`

```rust:solana-memo-contract/src/instruction.rs
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::instruction::{AccountMeta, Instruction};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum MemoInstruction {
    /// 创建一个新的备忘录
    /// Accounts expected:
    /// 0. `[signer, writable]` 付款人账户，支付创建备忘录的费用
    /// 1. `[writable]` 新创建的备忘录账户
    /// 2. `[signer]` 备忘录的所有者/权限账户
    /// 3. `[]` 系统程序
    Initialize { content: String },

    /// 更新备忘录内容
    /// Accounts expected:
    /// 0. `[signer]` 备忘录的所有者/权限账户
    /// 1. `[writable]` 备忘录账户
    Update { content: String },

    /// 删除备忘录
    /// Accounts expected:
    /// 0. `[signer]` 备忘录的所有者/权限账户
    /// 1. `[writable]` 备忘录账户
    /// 2. `[writable]` 接收归还租金的账户
    Delete,
}

pub fn initialize(
    program_id: &Pubkey,
    payer: &Pubkey,
    memo_account: &Pubkey,
    authority: &Pubkey,
    content: String,
) -> Instruction {
    let data = MemoInstruction::Initialize { content }.try_to_vec().unwrap();
    let accounts = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new(*memo_account, true),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(solana_program::system_program::id(), false),
    ];
    Instruction::new_with_borsh(*program_id, &data, accounts)
}

pub fn update(
    program_id: &Pubkey,
    authority: &Pubkey,
    memo_account: &Pubkey,
    content: String,
) -> Instruction {
    let data = MemoInstruction::Update { content }.try_to_vec().unwrap();
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*memo_account, true),
    ];
    Instruction::new_with_borsh(*program_id, &data, accounts)
}

pub fn delete(
    program_id: &Pubkey,
    authority: &Pubkey,
    memo_account: &Pubkey,
    receiver: &Pubkey,
) -> Instruction {
    let data = MemoInstruction::Delete.try_to_vec().unwrap();
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*memo_account, true),
        AccountMeta::new(*receiver, false),
    ];
    Instruction::new_with_borsh(*program_id, &data, accounts)
}
```

## 5. 实现处理逻辑 `processor.rs`

```rust:solana-memo-contract/src/processor.rs
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

use crate::{
    error::MemoError,
    instruction::MemoInstruction,
    state::Memo,
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = MemoInstruction::try_from_slice(instruction_data)
            .map_err(|_| MemoError::InvalidInstruction)?;

        match instruction {
            MemoInstruction::Initialize { content } => {
                Self::process_initialize(program_id, accounts, content)
            }
            MemoInstruction::Update { content } => {
                Self::process_update(program_id, accounts, content)
            }
            MemoInstruction::Delete => Self::process_delete(program_id, accounts),
        }
    }

    fn process_initialize(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        content: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer_info = next_account_info(account_info_iter)?;
        let memo_account_info = next_account_info(account_info_iter)?;
        let authority_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;

        // 检查内容长度
        if content.len() > Memo::MAX_CONTENT_LENGTH {
            return Err(MemoError::MemoTooLong.into());
        }

        // 确保付款人已签名
        if !payer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // 确保权限账户已签名
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // 创建备忘录账户
        let rent = Rent::get()?;
        let memo = Memo {
            is_initialized: true,
            authority: *authority_info.key,
            content,
        };

        let space = memo.try_to_vec()?.len();
        let rent_lamports = rent.minimum_balance(space);

        // 创建账户
        invoke(
            &system_instruction::create_account(
                payer_info.key,
                memo_account_info.key,
                rent_lamports,
                space as u64,
                program_id,
            ),
            &[payer_info.clone(), memo_account_info.clone(), system_program_info.clone()],
        )?;

        // 保存备忘录数据
        memo.serialize(&mut *memo_account_info.data.borrow_mut())?;

        msg!("Memo initialized successfully");
        Ok(())
    }

    fn process_update(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        content: String,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let memo_account_info = next_account_info(account_info_iter)?;

        // 检查内容长度
        if content.len() > Memo::MAX_CONTENT_LENGTH {
            return Err(MemoError::MemoTooLong.into());
        }

        // 检查账户所有权
        if memo_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // 确保权限账户已签名
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // 反序列化备忘录数据
        let mut memo_data = Memo::try_from_slice(&memo_account_info.data.borrow())?;

        // 检查是否已初始化
        if !memo_data.is_initialized {
            return Err(MemoError::UninitializedAccount.into());
        }

        // 检查权限
        if memo_data.authority != *authority_info.key {
            return Err(MemoError::Unauthorized.into());
        }

        // 更新内容
        memo_data.content = content;

        // 保存更新后的数据
        memo_data.serialize(&mut *memo_account_info.data.borrow_mut())?;

        msg!("Memo updated successfully");
        Ok(())
    }

    fn process_delete(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority_info = next_account_info(account_info_iter)?;
        let memo_account_info = next_account_info(account_info_iter)?;
        let receiver_info = next_account_info(account_info_iter)?;

        // 检查账户所有权
        if memo_account_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }

        // 确保权限账户已签名
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // 反序列化备忘录数据
        let memo_data = Memo::try_from_slice(&memo_account_info.data.borrow())?;

        // 检查是否已初始化
        if !memo_data.is_initialized {
            return Err(MemoError::UninitializedAccount.into());
        }

        // 检查权限
        if memo_data.authority != *authority_info.key {
            return Err(MemoError::Unauthorized.into());
        }

        // 将租金返还给接收者
        let receiver_starting_lamports = receiver_info.lamports();
        let memo_lamports = memo_account_info.lamports();
        
        **receiver_info.lamports.borrow_mut() = receiver_starting_lamports.checked_add(memo_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        **memo_account_info.lamports.borrow_mut() = 0;

        // 清空数据
        let mut data = memo_account_info.data.borrow_mut();
        for byte in data.iter_mut() {
            *byte = 0;
        }

        msg!("Memo deleted successfully");
        Ok(())
    }
}
```

## 6. 最后实现程序入口点 `entrypoint.rs`

```rust:solana-memo-contract/src/entrypoint.rs
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

use crate::processor::Processor;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    Processor::process(program_id, accounts, instruction_data)
}
```

## 项目依赖

你需要在 `Cargo.toml` 文件中添加以下依赖：

```toml
[package]
name = "solana-memo-contract"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-program = "1.14"
thiserror = "1.0"
borsh = "0.9"
borsh-derive = "0.9"

[lib]
crate-type = ["cdylib", "lib"]
```

## 功能说明

这个备忘录合约实现了三个主要功能：

1. **初始化备忘录**：创建一个新的备忘录，并设置权限账户（authority）
2. **更新备忘录**：允许权限账户更新备忘录内容
3. **删除备忘录**：允许权限账户删除备忘录并收回租金

权限控制通过在备忘录数据中存储 `authority` 字段实现，只有与该字段匹配的签名者才能修改或删除备忘录。

这个实现参考了 Solana 的 memo 合约的思路，但增加了权限控制和更多功能，使它成为一个完整的备忘录应用程序。

你可以按照这个结构逐步实现，然后使用 Solana CLI 或客户端库来测试这个合约。
