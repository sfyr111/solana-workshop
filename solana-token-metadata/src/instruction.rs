use borsh::{BorshDeserialize, BorshSerialize, BorshSchema};

/// Instruction enum for the Token Metadata program
///
/// This enum defines all possible instructions that can be sent to the program.
/// Each variant contains the data needed for that specific operation.
///
/// The enum is automatically serialized/deserialized using Borsh, which means
/// each variant gets a discriminator byte (0 for RegisterMetadata, 1 for UpdateMetadata)
#[derive(Clone, Debug, BorshSerialize, BorshDeserialize, PartialEq, BorshSchema)]
pub enum TokenMetadataInstruction {
    /// Registers new metadata for a token mint
    ///
    /// This instruction creates a new metadata account (PDA) and stores the provided
    /// token information on-chain. The metadata account is derived using the mint
    /// address and will be owned by this program.
    ///
    /// Accounts expected:
    /// 0. `[signer]` The authority account (payer) - must sign the transaction
    /// 1. `[writable]` The metadata account (PDA) - will be created by this instruction
    /// 2. `[]` The mint account - the SPL token mint this metadata is for
    /// 3. `[]` The SPL Token program - used for PDA derivation
    /// 4. `[]` The system program - used for account creation
    RegisterMetadata {
        name: String,    // Human-readable name of the token
        symbol: String,  // Short symbol/ticker (e.g., "BTC", "ETH")
        icon: String,    // URL pointing to the token's icon image
        home: String,    // URL pointing to the token's homepage
    },

    /// Updates existing metadata for a token mint
    ///
    /// This instruction modifies the metadata stored in an existing metadata account.
    /// The account will be resized if necessary to accommodate the new data.
    /// Only the original authority (creator) can update the metadata.
    ///
    /// Accounts expected:
    /// 0. `[signer]` The authority account - must be the same as the original creator
    /// 1. `[writable]` The metadata account (PDA) - existing metadata account to update
    /// 2. `[]` The mint account - the SPL token mint this metadata is for
    /// 3. `[]` The SPL Token program - used for PDA derivation and validation
    /// 4. `[]` The system program - used for account reallocation if needed
    UpdateMetadata {
        name: String,    // New human-readable name of the token
        symbol: String,  // New short symbol/ticker
        icon: String,    // New URL pointing to the token's icon image
        home: String,    // New URL pointing to the token's homepage
    },
}


