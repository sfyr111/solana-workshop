use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};


#[derive(Debug, BorshDeserialize, BorshSerialize)]
pub enum MemoInstruction {
    /// Create a new memo
    /// Accounts expected:
    /// 0. `[signer, writable]` Payer account to cover creation costs
    /// 1. `[writable]` New memo account
    /// 2. `[signer]` Memo owner/authority account
    /// 3. `[]` System program
    Initialize { content: String },

    /// Update memo content
    /// Accounts expected:
    /// 0. `[signer]` Memo owner/authority account
    /// 1. `[writable]` Memo account
    Update { content: String },

    /// Delete memo
    /// Accounts expected:
    /// 0. `[signer]` Memo owner/authority account
    /// 1. `[writable]` Memo account
    /// 2. `[writable]` Account to receive rent refund
    Delete,
}

pub fn initialize(
    program_id: &Pubkey,    // Program's public key
    payer: &Pubkey,        // Account that pays for the transaction
    memo_account: &Pubkey, // Account to store the memo data
    authority: &Pubkey,    // Account with permission to modify the memo
    content: String,       // Memo content to be stored
) -> Instruction {
   let data = MemoInstruction::Initialize { content }.try_to_vec().unwrap();
   let accounts = vec![
      AccountMeta::new(*payer, true),
      AccountMeta::new(*memo_account, false),
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
        AccountMeta::new(*authority, true),
        AccountMeta::new(*memo_account, false),
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
        AccountMeta::new(*authority, true),
        AccountMeta::new(*memo_account, false),
        AccountMeta::new_readonly(*receiver, false),
    ];
    Instruction::new_with_borsh(*program_id, &data, accounts)
}