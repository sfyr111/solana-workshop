use borsh::{BorshDeserialize, BorshSchema, BorshSerialize};

#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, PartialEq, BorshSchema)]
pub enum TokenMetadataInstruction {
    /// 注册代币元数据
    /// 
    /// 需要的账户:
    /// 0. `[signer]` 权限账户 (付款人)
    /// 1. `[writable]` 元数据账户 (PDA)
    /// 2. `[]` 代币铸造账户
    /// 3. `[]` SPL Token 程序
    /// 4. `[]` 系统程序
    RegisterMetadata {
        name: String,
        symbol: String,
        icon: String,
        home: String,
    },
    
    /// 更新代币元数据
    /// 
    /// 需要的账户:
    /// 0. `[signer]` 权限账户 (必须是注册时的同一个账户)
    /// 1. `[writable]` 元数据账户 (PDA)
    /// 2. `[]` 代币铸造账户
    /// 3. `[]` SPL Token 程序
    UpdateMetadata {
        name: String,
        symbol: String,
        icon: String,
        home: String,
    },
}


