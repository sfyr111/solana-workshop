use solana_program::{
    decode_error::DecodeError, 
    program_error::{PrintProgramError, ProgramError},
    msg,
};
use num_derive::FromPrimitive;
use num_traits::FromPrimitive as FromPrimitiveTrait;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone, FromPrimitive)]
pub enum MemoError {
    #[error("Invalid instruction")]
    InvalidInstruction,

    #[error("Not rent exempt")]
    NotRentExempt,

    #[error("Expected amount mismatch")]
    ExpectedAmountMismatch,
    
    #[error("Memo Content Too Long")]
    MemoContentTooLong,

    #[error("Account not initialized")]
    AccountNotInitialized,

    #[error("Unauthorized access")]     
    Unauthorized,
}

impl From<MemoError> for ProgramError {
    fn from(e: MemoError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for MemoError {
    fn type_of() -> &'static str {
        "MemoError"
    }
}

impl PrintProgramError for MemoError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitiveTrait,
    {
        match self {
            MemoError::InvalidInstruction => {
                msg!("Error: Invalid instruction");
            }
            MemoError::NotRentExempt => {
                msg!("Error: Not rent exempt");
            }
            MemoError::ExpectedAmountMismatch => {
                msg!("Error: Expected amount mismatch");
            }
            MemoError::MemoContentTooLong => {
                msg!("Error: Memo content too long");
            }
            MemoError::AccountNotInitialized => {
                msg!("Error: Account not initialized");
            }
            MemoError::Unauthorized => {
                msg!("Error: Unauthorized access");
            }
        }
    }
}
