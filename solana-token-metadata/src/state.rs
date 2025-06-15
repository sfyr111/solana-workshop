use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TokenMetadata {
    /// 代币铸造地址
    pub mint: Pubkey,
    /// 代币名称
    pub name: String,
    /// 代币符号
    pub symbol: String,
    /// 代币图标的 URL
    pub icon: String,
    /// 代币主页的 URL
    pub home: String,
}
