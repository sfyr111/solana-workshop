# Anchor Framework 开发实战指南

## 概述

Anchor 是 Solana 生态系统中最流行的开发框架，它简化了智能合约的开发过程。本指南将带你一步步实现 Anchor 框架的核心功能。

## 环境准备

### 1. 安装 Anchor CLI

```bash
# 安装 Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### 2. 验证安装

```bash
anchor --version
```

## 第一部分：创建基础 Anchor 项目

### 步骤 1：初始化项目

```bash
# 创建新的 Anchor 项目
anchor init anchor-hello-world
cd anchor-hello-world
```

项目结构说明：
- `programs/` - 存放智能合约代码
- `tests/` - 存放测试文件
- `app/` - 存放前端代码（可选）
- `Anchor.toml` - 项目配置文件

### 步骤 2：理解项目结构

查看生成的 `programs/anchor-hello-world/src/lib.rs`：

```rust
use anchor_lang::prelude::*;

// 声明程序 ID - 这是合约的唯一标识符
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod anchor_hello_world {
    use super::*;

    // 这是一个指令处理函数
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

// 定义指令所需的账户结构
#[derive(Accounts)]
pub struct Initialize {}
```

## 第二部分：实现数据存储功能

### 步骤 3：创建数据账户

修改 `lib.rs` 文件，添加数据存储功能：

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod anchor_hello_world {
    use super::*;

    // 初始化数据账户
    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        Ok(())
    }

    // 更新数据
    pub fn set_data(ctx: Context<SetData>, data: u64) -> Result<()> {
        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        Ok(())
    }
}

// 定义数据账户结构
#[account]
#[derive(Default)]
pub struct MyAccount {
    pub data: u64,
}

// 初始化指令的账户结构
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,                    // 创建新账户
        payer = user,           // 支付账户创建费用的账户
        space = 8 + 8           // 账户空间大小（8字节判别器 + 8字节数据）
    )]
    pub my_account: Account<'info, MyAccount>,
    #[account(mut)]             // 可变账户（用于支付费用）
    pub user: Signer<'info>,    // 签名者账户
    pub system_program: Program<'info, System>, // 系统程序
}

// 更新数据指令的账户结构
#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]             // 可变账户
    pub my_account: Account<'info, MyAccount>,
}
```

### 代码解释：

1. **`#[account]`** - 标记这是一个可序列化的账户数据结构
2. **`#[derive(Accounts)]`** - 自动生成账户验证代码
3. **`init`** - 表示这个账户需要被创建
4. **`payer`** - 指定谁来支付账户创建费用
5. **`space`** - 指定账户数据空间大小
6. **`mut`** - 表示账户是可变的
7. **`Signer<'info>`** - 表示这个账户必须签名

## 第三部分：添加数据验证

### 步骤 4：实现数据验证和错误处理

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod anchor_hello_world {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        // 数据验证
        require!(data < 100, MyError::DataTooLarge);
        
        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        Ok(())
    }

    pub fn set_data(ctx: Context<SetData>, data: u64) -> Result<()> {
        // 使用 require! 宏进行条件检查
        require!(data < 100, MyError::DataTooLarge);
        
        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        Ok(())
    }
}

#[account]
#[derive(Default)]
pub struct MyAccount {
    pub data: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 8
    )]
    pub my_account: Account<'info, MyAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]
    pub my_account: Account<'info, MyAccount>,
}

// 自定义错误类型
#[error_code]
pub enum MyError {
    #[msg("Data value must be less than 100")]
    DataTooLarge,
}
```

### 错误处理说明：

1. **`require!`** - Anchor 提供的断言宏，条件不满足时返回错误
2. **`#[error_code]`** - 定义自定义错误类型
3. **`#[msg("...")]`** - 为错误提供描述信息

## 第四部分：构建和部署

### 步骤 5：构建项目

```bash
# 构建项目
anchor build
```

### 步骤 6：生成程序 ID

```bash
# 生成新的密钥对
anchor keys list
# 如果需要生成新的密钥对
solana-keygen new -o target/deploy/anchor_hello_world-keypair.json
```

### 步骤 7：更新程序 ID

将生成的程序 ID 更新到：
1. `lib.rs` 中的 `declare_id!` 宏
2. `Anchor.toml` 中的程序配置

### 步骤 8：部署到本地网络

```bash
# 确保本地测试验证器正在运行
solana-test-validator

# 在另一个终端中部署
anchor deploy
```

## 第五部分：编写测试

### 步骤 9：创建测试文件

修改 `tests/anchor-hello-world.ts`：

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorHelloWorld } from "../target/types/anchor_hello_world";

describe("anchor-hello-world", () => {
  // 配置客户端使用本地集群
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AnchorHelloWorld as Program<AnchorHelloWorld>;

  it("Is initialized!", async () => {
    // 生成新的密钥对作为数据账户
    const myAccount = anchor.web3.Keypair.generate();

    // 调用初始化指令
    const tx = await program.methods
      .initialize(new anchor.BN(42))
      .accounts({
        myAccount: myAccount.publicKey,
        user: program.provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([myAccount])
      .rpc();

    console.log("Your transaction signature", tx);

    // 获取账户数据并验证
    const account = await program.account.myAccount.fetch(myAccount.publicKey);
    console.log("Account data:", account.data.toString());
  });
});
```

### 步骤 10：运行测试

```bash
# 运行测试
anchor test
```

## 第六部分：PDA（程序派生地址）实现

### 步骤 11：添加 PDA 功能

PDA 是 Solana 中的重要概念，允许程序控制特定地址。让我们添加 PDA 功能：

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod anchor_hello_world {
    use super::*;

    // 使用 PDA 初始化用户统计账户
    pub fn initialize_user_stats(ctx: Context<InitializeUserStats>, name: String) -> Result<()> {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.name = name;
        user_stats.level = 1;
        user_stats.points = 0;
        user_stats.authority = ctx.accounts.authority.key();
        user_stats.bump = ctx.bumps.user_stats; // 存储 bump 值
        Ok(())
    }

    // 更新用户统计
    pub fn update_user_stats(ctx: Context<UpdateUserStats>, points: u64) -> Result<()> {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.points += points;

        // 根据积分更新等级
        user_stats.level = (user_stats.points / 100) + 1;
        Ok(())
    }

    // 原有的基础功能保持不变
    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        require!(data < 100, MyError::DataTooLarge);
        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        Ok(())
    }

    pub fn set_data(ctx: Context<SetData>, data: u64) -> Result<()> {
        require!(data < 100, MyError::DataTooLarge);
        let my_account = &mut ctx.accounts.my_account;
        my_account.data = data;
        Ok(())
    }
}

// 用户统计数据结构
#[account]
#[derive(Default)]
pub struct UserStats {
    pub name: String,        // 用户名
    pub level: u64,          // 等级
    pub points: u64,         // 积分
    pub authority: Pubkey,   // 权限账户
    pub bump: u8,            // PDA bump 值
}

// 原有的数据账户结构
#[account]
#[derive(Default)]
pub struct MyAccount {
    pub data: u64,
}

// PDA 初始化指令的账户结构
#[derive(Accounts)]
#[instruction(name: String)] // 指令参数，用于 seeds
pub struct InitializeUserStats<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 32 + 1 + 4 + name.len(), // 计算所需空间
        seeds = [b"user-stats", authority.key().as_ref()],   // PDA seeds
        bump                                                  // 自动查找 bump
    )]
    pub user_stats: Account<'info, UserStats>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// PDA 更新指令的账户结构
#[derive(Accounts)]
pub struct UpdateUserStats<'info> {
    #[account(
        mut,
        seeds = [b"user-stats", authority.key().as_ref()],
        bump = user_stats.bump,  // 使用存储的 bump 值
        has_one = authority      // 验证 authority 字段
    )]
    pub user_stats: Account<'info, UserStats>,
    pub authority: Signer<'info>,
}

// 原有的账户结构保持不变
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub my_account: Account<'info, MyAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]
    pub my_account: Account<'info, MyAccount>,
}

#[error_code]
pub enum MyError {
    #[msg("Data value must be less than 100")]
    DataTooLarge,
}
```

### PDA 关键概念解释：

1. **`seeds`** - 用于生成 PDA 的种子，通常包含程序特定的前缀和用户相关数据
2. **`bump`** - PDA 生成过程中的随机数，确保地址不在椭圆曲线上
3. **`has_one`** - 验证账户中的字段与传入的账户匹配
4. **`#[instruction(name: String)]`** - 声明指令参数，用于计算账户空间

## 第七部分：CPI（跨程序调用）实现

### 步骤 12：创建被调用的程序（Puppet Program）

首先创建一个简单的被调用程序：

```bash
# 在项目根目录创建新程序
mkdir programs/puppet
```

创建 `programs/puppet/src/lib.rs`：

```rust
use anchor_lang::prelude::*;

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L");

#[program]
pub mod puppet {
    use super::*;

    pub fn set_data(ctx: Context<SetData>, data: u64) -> Result<u64> {
        let puppet_account = &mut ctx.accounts.puppet;
        puppet_account.data = data;

        // 返回设置的数据值
        Ok(data)
    }
}

#[account]
#[derive(Default)]
pub struct Data {
    pub data: u64,
}

#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]
    pub puppet: Account<'info, Data>,
}
```

### 步骤 13：在主程序中实现 CPI 调用

修改主程序的 `Cargo.toml`，添加 puppet 依赖：

```toml
[dependencies]
anchor-lang = "0.29.0"
puppet = { path = "../puppet", features = ["cpi"] }
```

在主程序中添加 CPI 功能：

```rust
use anchor_lang::prelude::*;
use puppet::program::Puppet;
use puppet::{self, Data as PuppetData, SetData as PuppetSetData};

// ... 其他代码保持不变 ...

#[program]
pub mod anchor_hello_world {
    use super::*;

    // 新增：通过 CPI 调用 puppet 程序
    pub fn pull_strings(ctx: Context<PullStrings>, data: u64) -> Result<()> {
        let cpi_program = ctx.accounts.puppet_program.to_account_info();
        let cpi_accounts = PuppetSetData {
            puppet: ctx.accounts.puppet.to_account_info(),
        };

        // 创建 CPI 上下文
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // 调用 puppet 程序的 set_data 指令
        let result = puppet::cpi::set_data(cpi_ctx, data)?;

        msg!("Puppet program returned: {}", result);
        Ok(())
    }

    // 使用 PDA 签名的 CPI 调用
    pub fn pull_strings_with_pda(ctx: Context<PullStringsWithPda>, data: u64) -> Result<()> {
        let cpi_program = ctx.accounts.puppet_program.to_account_info();
        let cpi_accounts = PuppetSetData {
            puppet: ctx.accounts.puppet.to_account_info(),
        };

        // 使用 PDA 签名
        let authority_bump = ctx.bumps.authority;
        let authority_seeds = &[
            b"authority",
            &[authority_bump],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        puppet::cpi::set_data(cpi_ctx, data)?;

        Ok(())
    }

    // ... 其他函数保持不变 ...
}

// CPI 调用的账户结构
#[derive(Accounts)]
pub struct PullStrings<'info> {
    #[account(mut)]
    pub puppet: Account<'info, PuppetData>,
    pub puppet_program: Program<'info, Puppet>,
}

// 使用 PDA 签名的 CPI 调用账户结构
#[derive(Accounts)]
pub struct PullStringsWithPda<'info> {
    #[account(mut)]
    pub puppet: Account<'info, PuppetData>,
    pub puppet_program: Program<'info, Puppet>,
    #[account(
        seeds = [b"authority"],
        bump
    )]
    /// CHECK: This is safe because we're using it as a PDA signer
    pub authority: UncheckedAccount<'info>,
}
```

### CPI 关键概念解释：

1. **`CpiContext::new()`** - 创建普通的 CPI 上下文
2. **`CpiContext::new_with_signer()`** - 创建带签名者的 CPI 上下文，用于 PDA 签名
3. **`features = ["cpi"]`** - 在 Cargo.toml 中启用 CPI 功能
4. **`UncheckedAccount`** - 不进行类型检查的账户，通常用于 PDA

## 第八部分：完整测试

### 步骤 14：编写完整的测试文件

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorHelloWorld } from "../target/types/anchor_hello_world";
import { Puppet } from "../target/types/puppet";

describe("anchor-hello-world-advanced", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AnchorHelloWorld as Program<AnchorHelloWorld>;
  const puppetProgram = anchor.workspace.Puppet as Program<Puppet>;

  it("Test PDA functionality", async () => {
    const authority = anchor.web3.Keypair.generate();

    // 为 authority 账户充值
    const signature = await program.provider.connection.requestAirdrop(
      authority.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await program.provider.connection.confirmTransaction(signature);

    // 计算 PDA 地址
    const [userStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user-stats"), authority.publicKey.toBuffer()],
      program.programId
    );

    // 初始化用户统计
    await program.methods
      .initializeUserStats("Alice")
      .accounts({
        userStats: userStatsPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // 更新用户统计
    await program.methods
      .updateUserStats(new anchor.BN(150))
      .accounts({
        userStats: userStatsPda,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    // 验证数据
    const userStats = await program.account.userStats.fetch(userStatsPda);
    console.log("User stats:", userStats);
  });

  it("Test CPI functionality", async () => {
    const puppetAccount = anchor.web3.Keypair.generate();

    // 初始化 puppet 账户
    await puppetProgram.methods
      .setData(new anchor.BN(42))
      .accounts({
        puppet: puppetAccount.publicKey,
      })
      .signers([puppetAccount])
      .preInstructions([
        await puppetProgram.account.data.createInstruction(puppetAccount)
      ])
      .rpc();

    // 通过 CPI 调用 puppet 程序
    await program.methods
      .pullStrings(new anchor.BN(100))
      .accounts({
        puppet: puppetAccount.publicKey,
        puppetProgram: puppetProgram.programId,
      })
      .rpc();

    // 验证数据
    const puppetData = await puppetProgram.account.data.fetch(puppetAccount.publicKey);
    console.log("Puppet data:", puppetData.data.toString());
  });
});
```

## 总结

通过这个完整的实战指南，你已经学会了：

1. **基础 Anchor 开发** - 项目创建、数据结构、指令处理
2. **数据验证和错误处理** - 使用 `require!` 和自定义错误
3. **PDA 实现** - 程序派生地址的创建和使用
4. **CPI 实现** - 跨程序调用的基本和高级用法
5. **完整测试** - TypeScript 测试的编写和执行

这些技能涵盖了 Anchor 框架的核心功能，为开发复杂的 Solana 应用程序奠定了坚实基础。你现在可以开始构建更复杂的 DeFi、NFT 或其他区块链应用了。
