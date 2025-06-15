use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TokenMetadata {
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub icon: String,
    pub home: String,
}
