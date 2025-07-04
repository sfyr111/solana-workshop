# Anchor Token Metadata 教程

## 项目概述

本教程将指导你将现有的 Solana 原生 Token Metadata 程序改写为使用 Anchor 框架实现。原项目功能包括：

- 为 SPL Token 注册元数据（名称、符号、图标、主页）
- 更新已存在的 Token 元数据
- 使用 PDA (Program Derived Address) 存储元数据
- 支持账户大小调整

## 第一步：创建 Anchor 项目

### 1.1 初始化项目

```bash
# 在 solana-workshop 目录下创建新的 Anchor 项目
anchor init anchor-token-metadata --template multiple
cd anchor-token-metadata
```

### 1.2 项目结构

Anchor 项目将包含以下结构：
```
anchor-token-metadata/
├── Anchor.toml           # Anchor 配置文件
├── Cargo.toml           # Rust 工作空间配置
├── package.json         # Node.js 依赖
├── programs/
│   └── anchor-token-metadata/
│       ├── Cargo.toml   # 程序依赖
│       └── src/
│           └── lib.rs   # 主程序文件
├── tests/
│   └── anchor-token-metadata.ts  # TypeScript 测试
└── migrations/
    └── deploy.js        # 部署脚本
```

## 第二步：配置依赖

### 2.1 修改程序的 Cargo.toml

编辑 `programs/anchor-token-metadata/Cargo.toml`：

```toml
[package]
name = "anchor-token-metadata"
version = "0.1.0"
description = "Created with Anchor"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "anchor_token_metadata"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.29.0"
anchor-spl = "0.29.0"
spl-token = { version = "4.0.0", features = ["no-entrypoint"] }
```

### 2.2 修改根目录 Cargo.toml

```toml
[workspace]
members = [
    "programs/*"
]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1

[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
```

## 第三步：实现 Anchor 程序

### 3.1 定义数据结构

在 `programs/anchor-token-metadata/src/lib.rs` 中：

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod anchor_token_metadata {
    use super::*;

    /// 注册新的 Token 元数据
    pub fn register_metadata(
        ctx: Context<RegisterMetadata>,
        name: String,
        symbol: String,
        icon: String,
        home: String,
    ) -> Result<()> {
        let metadata = &mut ctx.accounts.metadata;
        
        // 设置元数据字段
        metadata.mint = ctx.accounts.mint.key();
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.icon = icon;
        metadata.home = home;
        metadata.authority = ctx.accounts.authority.key();
        
        msg!("Token metadata registered successfully");
        Ok(())
    }

    /// 更新现有的 Token 元数据
    pub fn update_metadata(
        ctx: Context<UpdateMetadata>,
        name: String,
        symbol: String,
        icon: String,
        home: String,
    ) -> Result<()> {
        let metadata = &mut ctx.accounts.metadata;
        
        // 更新元数据字段
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.icon = icon;
        metadata.home = home;
        
        msg!("Token metadata updated successfully");
        Ok(())
    }
}

/// Token 元数据账户结构
#[account]
pub struct TokenMetadata {
    pub mint: Pubkey,        // Token mint 地址 (32 bytes)
    pub authority: Pubkey,   // 权限账户 (32 bytes)
    pub name: String,        // Token 名称 (4 + len bytes)
    pub symbol: String,      // Token 符号 (4 + len bytes)
    pub icon: String,        // 图标 URL (4 + len bytes)
    pub home: String,        // 主页 URL (4 + len bytes)
}

impl TokenMetadata {
    // 计算账户所需空间
    // 8 (discriminator) + 32 (mint) + 32 (authority) + 4*4 (string lengths) + string contents
    pub const MAX_SIZE: usize = 8 + 32 + 32 + 16 + 200; // 预留 200 字节给字符串
}
```

## 第四步：定义指令上下文

### 4.1 RegisterMetadata 上下文

继续在 `lib.rs` 中添加：

```rust
#[derive(Accounts)]
pub struct RegisterMetadata<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = TokenMetadata::MAX_SIZE,
        seeds = [
            b"metadata",
            token_program.key().as_ref(),
            mint.key().as_ref()
        ],
        bump
    )]
    pub metadata: Account<'info, TokenMetadata>,
    
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMetadata<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [
            b"metadata",
            token_program.key().as_ref(),
            mint.key().as_ref()
        ],
        bump,
        has_one = authority @ ErrorCode::UnauthorizedUpdate
    )]
    pub metadata: Account<'info, TokenMetadata>,
    
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized to update metadata")]
    UnauthorizedUpdate,
}
```

## 第五步：配置 Anchor.toml

编辑 `Anchor.toml`：

```toml
[features]
seeds = false
skip-lint = false

[programs.localnet]
anchor_token_metadata = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

## 第六步：实现测试

### 6.1 安装测试依赖

```bash
npm install --save-dev @solana/web3.js @solana/spl-token @coral-xyz/anchor mocha chai
```

### 6.2 创建测试文件

在 `tests/anchor-token-metadata.ts` 中：

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorTokenMetadata } from "../target/types/anchor_token_metadata";
import { 
  createMint, 
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE
} from "@solana/spl-token";
import { expect } from "chai";

describe("anchor-token-metadata", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorTokenMetadata as Program<AnchorTokenMetadata>;
  const payer = provider.wallet as anchor.Wallet;
  
  let mint: anchor.web3.PublicKey;
  let metadataPda: anchor.web3.PublicKey;
  let bump: number;

  before(async () => {
    // 创建测试用的 mint
    mint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      9
    );

    // 计算 metadata PDA
    [metadataPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
      program.programId
    );
  });

  it("Register metadata", async () => {
    const tx = await program.methods
      .registerMetadata(
        "Test Token",
        "TEST",
        "https://example.com/icon.png",
        "https://example.com"
      )
      .accounts({
        authority: payer.publicKey,
        metadata: metadataPda,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Register metadata transaction signature", tx);

    // 验证元数据
    const metadata = await program.account.tokenMetadata.fetch(metadataPda);
    expect(metadata.name).to.equal("Test Token");
    expect(metadata.symbol).to.equal("TEST");
    expect(metadata.mint.toString()).to.equal(mint.toString());
  });

  it("Update metadata", async () => {
    const tx = await program.methods
      .updateMetadata(
        "Updated Token",
        "UPD",
        "https://new.com/icon.png",
        "https://new.com"
      )
      .accounts({
        authority: payer.publicKey,
        metadata: metadataPda,
        mint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Update metadata transaction signature", tx);

    // 验证更新后的元数据
    const metadata = await program.account.tokenMetadata.fetch(metadataPda);
    expect(metadata.name).to.equal("Updated Token");
    expect(metadata.symbol).to.equal("UPD");
  });
});
```

## 第七步：构建和测试

### 7.1 构建程序

```bash
anchor build
```

### 7.2 运行测试

```bash
# 确保 solana-test-validator 正在运行
anchor test --skip-local-validator
```

### 7.3 部署程序

```bash
anchor deploy
```

## 下一步

在下一部分教程中，我们将：
1. 创建客户端 SDK
2. 实现更复杂的功能（如权限管理）
3. 添加事件日志
4. 优化账户大小和性能

这个基础实现已经包含了原项目的核心功能，使用 Anchor 框架大大简化了代码复杂度。
