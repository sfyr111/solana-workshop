你说得对，既然我们已经有了hello world合约，我们只需要创建两个新的目录来实现CPI示例：一个用于基本的`invoke`调用，另一个用于使用`invoke_signed`的PDA vault示例。

让我们调整一下计划，基于你已有的`solana_hello_world`项目：

## 1. 创建项目目录结构

```bash
# 假设我们在solana-workshop目录下
mkdir -p solana-cpi-invoke
mkdir -p solana-pda-vault
```

## 2. 创建基本的CPI Invoke项目

首先，让我们创建使用`invoke`调用Hello World程序的项目：

```bash
cd solana-cpi-invoke
cargo init --lib
```

编辑`Cargo.toml`文件：

```toml:solana-cpi-invoke/Cargo.toml
[package]
name = "solana-cpi-invoke"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-program = "1.18.3"
borsh = "0.10.3"

[lib]
crate-type = ["cdylib", "lib"]
```

现在实现调用Hello World程序的代码：

```rust:solana-cpi-invoke/src/lib.rs
use solana_program::{
    account_info::{AccountInfo, next_account_info},
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    instruction,
    msg, program::invoke,
};

// 声明并导出程序入口点
entrypoint!(process_instruction);

// 程序入口点实现
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    // 迭代账户
    let accounts_iter = &mut accounts.iter();

    // 获取账户
    let account = next_account_info(accounts_iter)?;
    let helloworld = next_account_info(accounts_iter)?;

    msg!("CPI invoke program calling hello world from {}", account.key);

    // 创建要传递给hello world程序的账户元数据
    let account_metas = vec![
        instruction::AccountMeta::new_readonly(*account.key, false),
    ];

    // 创建指令
    let instruction = instruction::Instruction::new_with_bytes(
        *helloworld.key,
        &[],  // 空指令数据
        account_metas,
    );

    // 准备要传递的账户信息
    let account_infos = [
        account.clone(),
    ];

    // 调用hello world程序
    invoke(&instruction, &account_infos[..])?;
    
    msg!("CPI invoke completed successfully!");
    
    Ok(())
}
```

## 3. 创建PDA Vault项目

接下来，创建使用`invoke_signed`的PDA Vault项目：

```bash
cd ../solana-pda-vault
cargo init --lib
```

编辑`Cargo.toml`文件：

```toml:solana-pda-vault/Cargo.toml
[package]
name = "solana-pda-vault"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-program = "1.18.3"
borsh = "0.10.3"
thiserror = "1.0.56"

[lib]
crate-type = ["cdylib", "lib"]
```

实现PDA Vault程序：

```rust:solana-pda-vault/src/lib.rs
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    system_program,
};

// 定义指令数据结构
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct InstructionData {
    pub vault_bump_seed: u8,
    pub lamports: u64,
}

// 定义Vault账户大小
pub const VAULT_ACCOUNT_SIZE: u64 = 1024;

// 声明程序入口点
entrypoint!(process_instruction);

// 程序入口点实现
fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // 解析指令数据
    let instruction = InstructionData::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    
    // 获取账户
    let account_info_iter = &mut accounts.iter();
    let payer = next_account_info(account_info_iter)?;
    let vault = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;
    
    // 验证系统程序
    if system_program.key != &system_program::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    
    // 提取参数
    let vault_bump_seed = instruction.vault_bump_seed;
    let lamports = instruction.lamports;
    
    msg!("Creating vault account...");
    msg!("Payer: {}", payer.key);
    msg!("Vault: {}", vault.key);
    msg!("Bump seed: {}", vault_bump_seed);
    msg!("Lamports: {}", lamports);
    
    // 使用PDA签名创建vault账户
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            vault.key,
            lamports,
            VAULT_ACCOUNT_SIZE,
            program_id,
        ),
        &[
            payer.clone(),
            vault.clone(),
            system_program.clone(),
        ],
        &[
            &[
                b"vault",
                payer.key.as_ref(),
                &[vault_bump_seed],
            ],
        ],
    )?;
    
    msg!("Vault account created successfully!");
    
    Ok(())
}
```

## 4. 创建客户端代码

现在，让我们在项目根目录创建一个客户端目录，并添加两个客户端脚本：

```bash
cd ..
mkdir -p client
```

创建一个用于调用`invoke`示例的客户端：

```javascript:client/invoke-client.js
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} = require('@solana/web3.js');

async function main() {
  // 连接到Solana开发网
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // 替换为你的密钥对
  // 你可以使用: const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('/path/to/keypair.json'))));
  const payer = Keypair.generate(); // 仅用于演示，实际使用时应替换
  
  // 替换为你的程序ID（部署后获得）
  const helloWorldProgramId = new PublicKey('YOUR_HELLO_WORLD_PROGRAM_ID');
  const cpiInvokeProgramId = new PublicKey('YOUR_CPI_INVOKE_PROGRAM_ID');
  
  console.log('Requesting airdrop...');
  const airdropSignature = await connection.requestAirdrop(
    payer.publicKey,
    2 * 10 ** 9 // 2 SOL
  );
  await connection.confirmTransaction(airdropSignature);
  
  console.log('Creating instruction...');
  // 创建调用指令
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: helloWorldProgramId, isSigner: false, isWritable: false },
    ],
    programId: cpiInvokeProgramId,
    data: Buffer.from([]),
  });
  
  // 创建并发送交易
  const transaction = new Transaction().add(instruction);
  
  console.log('Sending transaction...');
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer]
  );
  
  console.log('Transaction signature:', signature);
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  }
);
```

创建一个用于调用`invoke_signed` PDA Vault示例的客户端：

```javascript:client/pda-vault-client.js
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} = require('@solana/web3.js');
const borsh = require('borsh');

// 定义指令数据类
class InstructionData {
  constructor(props) {
    this.vault_bump_seed = props.vault_bump_seed;
    this.lamports = props.lamports;
  }
}

// 定义序列化架构
const schema = new Map([
  [
    InstructionData,
    {
      kind: 'struct',
      fields: [
        ['vault_bump_seed', 'u8'],
        ['lamports', 'u64'],
      ],
    },
  ],
]);

async function main() {
  // 连接到Solana开发网
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // 替换为你的密钥对
  // 你可以使用: const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(require('fs').readFileSync('/path/to/keypair.json'))));
  const payer = Keypair.generate(); // 仅用于演示，实际使用时应替换
  
  // 替换为你的程序ID（部署后获得）
  const pdaVaultProgramId = new PublicKey('YOUR_PDA_VAULT_PROGRAM_ID');
  
  console.log('Requesting airdrop...');
  const airdropSignature = await connection.requestAirdrop(
    payer.publicKey,
    2 * 10 ** 9 // 2 SOL
  );
  await connection.confirmTransaction(airdropSignature);
  
  // 计算PDA地址
  const [vaultPda, bumpSeed] = await PublicKey.findProgramAddress(
    [
      Buffer.from('vault'),
      payer.publicKey.toBuffer(),
    ],
    pdaVaultProgramId
  );
  
  console.log('Vault PDA:', vaultPda.toString());
  console.log('Bump seed:', bumpSeed);
  
  // 准备指令数据
  const instructionData = new InstructionData({
    vault_bump_seed: bumpSeed,
    lamports: 100000000, // 0.1 SOL
  });
  
  // 序列化指令数据
  const serializedData = borsh.serialize(schema, instructionData);
  const data = Buffer.from(serializedData);
  
  // 创建指令
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: pdaVaultProgramId,
    data,
  });
  
  // 创建并发送交易
  const transaction = new Transaction().add(instruction);
  
  console.log('Sending transaction...');
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer]
  );
  
  console.log('Transaction signature:', signature);
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  }
);
```

## 5. 创建项目README

在根目录创建一个README文件：

```markdown:README.md
# Solana 合约间调用 (CPI) 演示

这个项目演示了Solana上的合约间调用(CPI)机制，包括使用`invoke`和`invoke_signed`方法。

## 项目结构

```
solana-workshop/
├── solana_hello_world/     # 已有的Hello World程序
├── solana-cpi-invoke/      # 使用invoke调用Hello World的程序
├── solana-pda-vault/       # 使用invoke_signed的PDA Vault程序
└── client/                 # 客户端代码
    ├── invoke-client.js    # 调用invoke示例的客户端
    └── pda-vault-client.js # 调用PDA Vault的客户端
```

## 程序说明

1. **Hello World程序**：一个简单的程序，打印"Hello, world!"消息。
2. **CPI Invoke程序**：使用`invoke`方法调用Hello World程序。
3. **PDA Vault程序**：使用`invoke_signed`方法创建一个PDA账户作为金库。

## 使用方法

### 构建程序

```bash
# 构建CPI Invoke程序
cd solana-cpi-invoke
cargo build-bpf

# 构建PDA Vault程序
cd ../solana-pda-vault
cargo build-bpf
```

### 部署程序

```bash
# 确保Hello World程序已部署
solana program deploy ../solana_hello_world/target/deploy/solana_hello_world.so

# 部署CPI Invoke程序
solana program deploy target/deploy/solana_cpi_invoke.so

# 部署PDA Vault程序
cd ../solana-pda-vault
solana program deploy target/deploy/solana_pda_vault.so
```

记下部署后得到的程序ID，并更新客户端代码中的程序ID。

### 运行客户端

```bash
cd ../client
npm install # 安装依赖
node invoke-client.js
node pda-vault-client.js
```

## 学习内容

通过这个项目，你可以学习到：

1. Solana上的合约间调用(CPI)机制
2. 如何使用`invoke`调用其他程序
3. 如何使用`invoke_signed`让程序代表PDA账户签名
4. 如何在客户端生成PDA地址并与程序交互
```

## 6. 编译和部署步骤

要完成这个项目，你需要编译和部署这些程序到Solana开发网：

1. 确保已安装Solana CLI工具
2. 确保已配置Solana CLI连接到开发网
3. 确保有足够的SOL进行部署

```bash
# 编译和部署CPI Invoke程序
cd solana-cpi-invoke
cargo build-bpf
solana program deploy target/deploy/solana_cpi_invoke.so

# 编译和部署PDA Vault程序
cd ../solana-pda-vault
cargo build-bpf
solana program deploy target/deploy/solana_pda_vault.so
```

4. 记下部署后得到的程序ID，并更新客户端代码中的程序ID。

5. 安装客户端依赖并运行：
```bash
cd ../client
npm install
node invoke-client.js
node pda-vault-client.js
```

这样，我们就创建了两个新的项目目录，一个用于基本的CPI `invoke`调用，另一个用于使用`invoke_signed`的PDA vault示例，并复用了你已有的Hello World合约。
