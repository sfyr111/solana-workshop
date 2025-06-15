use borsh::{BorshDeserialize, BorshSerialize, BorshSchema};

#[derive(Clone,Debug, BorshSerialize, BorshDeserialize,PartialEq,BorshSchema)]
pub enum TokenMetadataInstruction {

    /// Accounts expected:
    /// 0. `[signer]` The authority account (payer)
    /// 1. `[writable]` The metadata account (PDA)
    /// 2. `[]` The mint account
    /// 3. `[]` The SPL Token program
    /// 4. `[]` The system program
    RegisterMetadata {
        name: String,
        symbol: String,
        icon: String,
        home: String,
    },

    /// Accounts expected:
    /// 0. `[signer]` The authority account (payer must be same as RegisterMetadata)
    /// 1. `[writable]` The metadata account (PDA)
    UpdateMetadata {
        name: String,
        symbol: String,
        icon: String,
        home: String,
    },
}


