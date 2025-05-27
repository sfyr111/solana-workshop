// Solana program error utilities
use solana_program::{
    decode_error::DecodeError,
    msg,
    program_error::{ProgramError, PrintProgramError},
};

// Support enum <-> u32 conversions
use num_derive::FromPrimitive;
use num_traits::FromPrimitive as FromPrimitiveTrait;

/// Custom errors for the Greeting program.
/// The #[derive(FromPrimitive)] enables decoding from ProgramError::Custom(u32).
#[derive(Clone, Debug, Eq, FromPrimitive, PartialEq)]
pub enum GreetingError {
    IncorrectOwner,
    InvalidCounterValue,
    CounterMaximumLimitReached,
}

/// Allow automatic conversion to ProgramError using `.into()`.
impl From<GreetingError> for ProgramError {
    fn from(e: GreetingError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

/// Enable human-readable error logs on-chain.
impl PrintProgramError for GreetingError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitiveTrait,
    {
        match self {
            GreetingError::IncorrectOwner => {
                msg!("Error: Account owner is not the expected program ID.");
            }
            GreetingError::InvalidCounterValue => {
                msg!("Error: Invalid counter value.");
            }
            GreetingError::CounterMaximumLimitReached => {
                msg!("Error: Counter has reached its maximum limit.");
            }
        }
    }
}

/// Provide error type name for decoding/logging.
impl<T> DecodeError<T> for GreetingError {
    fn type_of() -> &'static str {
        "GreetingError"
    }
}