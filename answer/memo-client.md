# 完整的 Solana 备忘录合约客户端实现

下面我会提供完整的代码和命令行操作步骤，让你能够从零开始搭建客户端并与合约交互。

## 完整的目录结构

首先，完整的目录结构应该是这样的：

```
solana-memo-client/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── utils.ts
    ├── memo.ts
    └── commands/
        ├── create.ts
        ├── update.ts
        ├── read.ts
        └── delete.ts
```

## 步骤 1: 创建项目目录和文件

```bash
mkdir -p solana-memo-client/src/commands
cd solana-memo-client
touch package.json tsconfig.json
touch src/index.ts src/utils.ts src/memo.ts
touch src/commands/create.ts src/commands/update.ts src/commands/read.ts src/commands/delete.ts
```

## 步骤 2: 配置 package.json

```json
{
  "name": "solana-memo-client",
  "version": "1.0.0",
  "description": "Client for Solana Memo Contract",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "create": "ts-node src/commands/create.ts",
    "read": "ts-node src/commands/read.ts",
    "update": "ts-node src/commands/update.ts",
    "delete": "ts-node src/commands/delete.ts",
    "test": "ts-node src/index.ts"
  },
  "dependencies": {
    "@solana/web3.js": "^1.78.0",
    "@solana/spl-token": "^0.3.8",
    "borsh": "^0.7.0",
    "bs58": "^5.0.0",
    "commander": "^10.0.0",
    "dotenv": "^16.0.3"
  },
  "devDependencies": {
    "typescript": "^5.1.6",
    "ts-node": "^10.9.1",
    "@types/node": "^20.4.2"
  }
}
```

## 步骤 3: 配置 tsconfig.json

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
  "include": ["src/**/*"]
}
```

## 步骤 4: 创建 .env 文件

```bash
echo "PROGRAM_ID=9d3usNreTdyGoMmCmvnmg2J5jmvgLuQJmapEzdkZvKyy" > .env
```

## 步骤 5: 安装依赖

```bash
npm install
```

## 步骤 6: 实现 utils.ts

```typescript
// src/utils.ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// 设置程序 ID
export const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '9d3usNreTdyGoMmCmvnmg2J5jmvgLuQJmapEzdkZvKyy');

// 创建连接
export function getConnection(): Connection {
  // 默认连接到本地测试网
  return new Connection('http://localhost:8899', 'confirmed');
}

// 加载钱包
export function loadWallet(keyPath?: string): Keypair {
  const walletPath = keyPath || path.resolve(process.env.HOME!, '.config/solana/id.json');
  
  if (!fs.existsSync(walletPath)) {
    throw new Error(`钱包文件不存在: ${walletPath}`);
  }
  
  const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')));
  return Keypair.fromSecretKey(secretKey);
}

// 保存账户信息到文件
export function saveAccountInfo(label: string, pubkey: string): void {
  const accountsPath = path.resolve(__dirname, '../accounts.json');
  let accounts: Record<string, string> = {};
  
  if (fs.existsSync(accountsPath)) {
    accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
  }
  
  accounts[label] = pubkey;
  fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2));
  console.log(`保存账户 ${label}: ${pubkey}`);
}

// 加载账户信息
export function loadAccountInfo(label: string): PublicKey {
  const accountsPath = path.resolve(__dirname, '../accounts.json');
  
  if (!fs.existsSync(accountsPath)) {
    throw new Error('账户文件不存在，请先创建备忘录');
  }
  
  const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
  
  if (!accounts[label]) {
    throw new Error(`找不到账户: ${label}`);
  }
  
  return new PublicKey(accounts[label]);
}
```

## 步骤 7: 实现 memo.ts

```typescript
// src/memo.ts
import * as borsh from 'borsh';
import { PublicKey } from '@solana/web3.js';

// Memo 类定义
export class Memo {
  is_initialized: boolean;
  authority: Uint8Array;
  content: string;

  constructor(fields: { is_initialized: boolean, authority: Uint8Array, content: string }) {
    this.is_initialized = fields.is_initialized;
    this.authority = fields.authority;
    this.content = fields.content;
  }

  static schema = new Map([
    [
      Memo,
      {
        kind: 'struct',
        fields: [
          ['is_initialized', 'u8'], // boolean as u8
          ['authority', [32]], // Pubkey as 32 bytes
          ['content', 'string'],
        ],
      },
    ],
  ]);
}

// 指令枚举
export enum MemoInstructionEnum {
  Initialize = 0,
  Update = 1,
  Delete = 2,
}

// 创建指令数据
export function createInstructionData(instruction: MemoInstructionEnum, content?: string): Buffer {
  let data;
  
  switch (instruction) {
    case MemoInstructionEnum.Initialize:
      // 初始化指令的结构
      const initLayout = new Map([
        [
          Object,
          {
            kind: 'struct',
            fields: [
              ['variant', 'u8'],
              ['content', 'string'],
            ],
          },
        ],
      ]);
      data = borsh.serialize(
        initLayout,
        {
          variant: 0, // Initialize variant
          content: content!,
        }
      );
      break;
      
    case MemoInstructionEnum.Update:
      // 更新指令的结构
      const updateLayout = new Map([
        [
          Object,
          {
            kind: 'struct',
            fields: [
              ['variant', 'u8'],
              ['content', 'string'],
            ],
          },
        ],
      ]);
      data = borsh.serialize(
        updateLayout,
        {
          variant: 1, // Update variant
          content: content!,
        }
      );
      break;
      
    case MemoInstructionEnum.Delete:
      // 删除指令的结构
      const deleteLayout = new Map([
        [
          Object,
          {
            kind: 'struct',
            fields: [
              ['variant', 'u8'],
            ],
          },
        ],
      ]);
      data = borsh.serialize(
        deleteLayout,
        {
          variant: 2, // Delete variant
        }
      );
      break;
      
    default:
      throw new Error(`未知指令: ${instruction}`);
  }
  
  return Buffer.from(data);
}

// 格式化 Memo 数据用于显示
export function formatMemoData(memo: Memo): any {
  return {
    is_initialized: memo.is_initialized ? true : false,
    authority: new PublicKey(memo.authority).toBase58(),
    content: memo.content,
  };
}
```

## 步骤 8: 实现创建命令 (create.ts)

```typescript
// src/commands/create.ts
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getConnection, loadWallet, PROGRAM_ID, saveAccountInfo } from '../utils';
import { createInstructionData, MemoInstructionEnum } from '../memo';

async function createMemo(content: string, label: string = 'memo') {
  try {
    const connection = getConnection();
    const payer = loadWallet();
    
    console.log('使用钱包:', payer.publicKey.toBase58());
    
    // 创建备忘录账户
    const memoKeypair = Keypair.generate();
    console.log('创建备忘录账户:', memoKeypair.publicKey.toBase58());
    
    // 创建指令数据
    const data = createInstructionData(MemoInstructionEnum.Initialize, content);
    
    // 创建交易指令
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: memoKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // authority
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: data,
    });
    
    // 创建并发送交易
    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [payer, memoKeypair]);
    
    console.log('备忘录创建成功!');
    console.log('备忘录地址:', memoKeypair.publicKey.toBase58());
    
    // 保存备忘录账户信息
    saveAccountInfo(label, memoKeypair.publicKey.toBase58());
    
    return memoKeypair.publicKey;
  } catch (error) {
    console.error('创建备忘录失败:', error);
    throw error;
  }
}

// 从命令行参数获取
const content = process.argv[2] || '这是默认备忘录内容';
const label = process.argv[3] || 'memo';

// 执行创建操作
createMemo(content, label).catch(err => {
  console.error(err);
  process.exit(1);
});
```

## 步骤 9: 实现读取命令 (read.ts)

```typescript
// src/commands/read.ts
import { PublicKey } from '@solana/web3.js';
import { getConnection, loadAccountInfo } from '../utils';
import { Memo, formatMemoData } from '../memo';
import * as borsh from 'borsh';

async function readMemo(memoAccount: PublicKey) {
  try {
    const connection = getConnection();
    
    // 获取账户信息
    const accountInfo = await connection.getAccountInfo(memoAccount);
    
    if (!accountInfo) {
      throw new Error('备忘录账户不存在');
    }
    
    // 解码账户数据
    const memo = borsh.deserialize(
      Memo.schema, 
      Memo, 
      accountInfo.data
    );
    
    // 格式化并返回数据
    return formatMemoData(memo);
  } catch (error) {
    console.error('读取备忘录失败:', error);
    throw error;
  }
}

// 从命令行参数获取
const label = process.argv[2] || 'memo';

// 加载账户并读取数据
try {
  const memoAccount = loadAccountInfo(label);
  console.log(`读取备忘录 (${label}): ${memoAccount.toBase58()}`);
  
  readMemo(memoAccount).then(data => {
    console.log('备忘录内容:');
    console.log(JSON.stringify(data, null, 2));
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
```

## 步骤 10: 实现更新命令 (update.ts)

```typescript
// src/commands/update.ts
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getConnection, loadWallet, PROGRAM_ID, loadAccountInfo } from '../utils';
import { createInstructionData, MemoInstructionEnum } from '../memo';

async function updateMemo(memoAccount: PublicKey, content: string) {
  try {
    const connection = getConnection();
    const authority = loadWallet();
    
    console.log('使用钱包:', authority.publicKey.toBase58());
    console.log('更新备忘录:', memoAccount.toBase58());
    
    // 创建指令数据
    const data = createInstructionData(MemoInstructionEnum.Update, content);
    
    // 创建交易指令
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: memoAccount, isSigner: false, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: data,
    });
    
    // 创建并发送交易
    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [authority]);
    
    console.log('备忘录更新成功!');
    
    return true;
  } catch (error) {
    console.error('更新备忘录失败:', error);
    throw error;
  }
}

// 从命令行参数获取
const content = process.argv[2];
const label = process.argv[3] || 'memo';

if (!content) {
  console.error('请提供备忘录内容');
  process.exit(1);
}

// 加载账户并更新
try {
  const memoAccount = loadAccountInfo(label);
  
  updateMemo(memoAccount, content).catch(err => {
    console.error(err);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
```

## 步骤 11: 实现删除命令 (delete.ts)

```typescript
// src/commands/delete.ts
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getConnection, loadWallet, PROGRAM_ID, loadAccountInfo } from '../utils';
import { createInstructionData, MemoInstructionEnum } from '../memo';
import fs from 'fs';
import path from 'path';

async function deleteMemo(memoAccount: PublicKey) {
  try {
    const connection = getConnection();
    const authority = loadWallet();
    
    console.log('使用钱包:', authority.publicKey.toBase58());
    console.log('删除备忘录:', memoAccount.toBase58());
    
    // 创建指令数据
    const data = createInstructionData(MemoInstructionEnum.Delete);
    
    // 创建交易指令
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: memoAccount, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: false, isWritable: true }, // receiver
      ],
      programId: PROGRAM_ID,
      data: data,
    });
    
    // 创建并发送交易
    const transaction = new Transaction().add(instruction);
    await sendAndConfirmTransaction(connection, transaction, [authority]);
    
    console.log('备忘录删除成功!');
    
    return true;
  } catch (error) {
    console.error('删除备忘录失败:', error);
    throw error;
  }
}

// 从命令行参数获取
const label = process.argv[2] || 'memo';

// 移除账户记录
function removeAccountInfo(label: string): void {
  const accountsPath = path.resolve(__dirname, '../../accounts.json');
  
  if (fs.existsSync(accountsPath)) {
    const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
    
    if (accounts[label]) {
      delete accounts[label];
      fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 2));
      console.log(`账户 ${label} 已从记录中删除`);
    }
  }
}

// 加载账户并删除
try {
  const memoAccount = loadAccountInfo(label);
  
  deleteMemo(memoAccount).then(() => {
    // 删除成功后移除账户记录
    removeAccountInfo(label);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
```

## 步骤 12: 实现主入口 (index.ts)

```typescript
// src/index.ts
import { getConnection, loadWallet } from './utils';
import fs from 'fs';
import path from 'path';

async function main() {
  try {
    const connection = getConnection();
    const wallet = loadWallet();
    
    console.log('连接到 Solana 网络成功');
    console.log('钱包地址:', wallet.publicKey.toBase58());
    
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('钱包余额:', balance / 1000000000, 'SOL');
    
    console.log('\n可用命令:');
    console.log('  npm run create [内容] [标签]  - 创建新的备忘录');
    console.log('  npm run read [标签]          - 读取备忘录内容');
    console.log('  npm run update [内容] [标签]  - 更新备忘录内容');
    console.log('  npm run delete [标签]        - 删除备忘录');
    
    // 显示已保存的备忘录
    const accountsPath = path.resolve(__dirname, '../accounts.json');
    if (fs.existsSync(accountsPath)) {
      const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
      
      if (Object.keys(accounts).length > 0) {
        console.log('\n已保存的备忘录:');
        for (const [label, address] of Object.entries(accounts)) {
          console.log(`  ${label}: ${address}`);
        }
      }
    }
  } catch (error) {
    console.error('错误:', error);
  }
}

main().catch(console.error);
```

## 步骤 13: 安装依赖并设置脚本权限

```bash
npm install
chmod +x node_modules/.bin/ts-node
```

## 完整的命令行操作流程

### 1. 初始化项目并检查环境

```bash
# 首次使用，初始化项目
cd solana-memo-client
npm install
npm test
```

这将显示当前连接状态、钱包信息和可用命令。

### 2. 创建新的备忘录

```bash
# 创建新的备忘录
npm run create "这是我的第一个备忘录" "memo1"
```

这会创建一个新的备忘录，内容为"这是我的第一个备忘录"，标签为"memo1"。

### 3. 读取备忘录内容

```bash
# 读取备忘录
npm run read "memo1"
```

这会显示备忘录的内容、所有者和初始化状态。

### 4. 更新备忘录内容

```bash
# 更新备忘录
npm run update "更新后的备忘录内容" "memo1"
```

这会更新指定备忘录的内容。

### 5. 删除备忘录

```bash
# 删除备忘录
npm run delete "memo1"
```

这会删除指定的备忘录，并将其从本地记录中移除。

### 6. 创建多个备忘录进行测试

```bash
# 创建多个备忘录
npm run create "工作备忘录" "work"
npm run create "个人备忘录" "personal"
npm run create "购物清单" "shopping"

# 查看所有备忘录
npm test
```

## 常见问题解决方案

1. **连接错误**：
   ```
   Error: Failed to fetch RPC
   ```
   解决方案：确保本地 Solana 测试节点正在运行
   ```bash
   solana-test-validator
   ```

2. **钱包不存在**：
   ```
   Error: 钱包文件不存在
   ```
   解决方案：检查钱包路径是否正确，或使用指定路径
   ```bash
   solana-keygen new -o ./wallet.json
   ```
   然后修改 `utils.ts` 中的钱包路径。

3. **余额不足**：
   ```
   Error: Transaction simulation failed: Insufficient funds
   ```
   解决方案：向钱包充值 SOL
   ```bash
   solana airdrop 2 $(solana address)
   ```

4. **序列化错误**：
   ```
   Error: Serialization failed
   ```
   解决方案：确保 `memo.ts` 中的序列化逻辑与合约匹配。

这个完整的实现允许你通过命令行与你的备忘录合约进行交互，并提供了创建、读取、更新和删除备忘录的功能。每个操作都有单独的命令，使用起来更加方便。
