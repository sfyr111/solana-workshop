use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshDeserialize, BorshSerialize)]
pub struct Memo {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub content: String,
}

impl Memo {
    pub const MAX_CONTENT_LENGTH: usize = 1000;
}