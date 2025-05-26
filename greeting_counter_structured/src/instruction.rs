use borsh::{BorshSerialize, BorshDeserialize};

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum GreetingCounterInstruction {
    // Increment the counter by 1
    Increment,
    // Set the counter to a specific value
    SetCounter {
        value: u32,
    },
}

