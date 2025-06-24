use anchor_lang::prelude::*;

declare_id!("CU6rekujN2XpAqGsdpEmYgWZb5YDbb4cuBHJki6oTdJQ");

#[program]
pub mod anchor_note {
    use super::*;

    pub fn initialize_user_index(ctx: Context<InitializeUserIndex>) -> Result<()> {
        let user_index = &mut ctx.accounts.user_index;
        user_index.authority = ctx.accounts.user.key();
        user_index.note_count = 0;
        user_index.note_ids = Vec::new();

        msg!("User note index initialized for {}", ctx.accounts.user.key());
        Ok(())
    }

    pub fn create_note(ctx: Context<CreateNote>, note_id: u64, message: String) -> Result<()> {
        require!(message.len() <= 1000, NoteError::MessageTooLong);

        let user_index = &mut ctx.accounts.user_index;
        let now = Clock::get()?.unix_timestamp;

        require!(note_id == user_index.note_count, NoteError::InvalidNoteId);

        let note = &mut ctx.accounts.note;
        note.authority = ctx.accounts.user.key();
        note.note_id = note_id;
        note.message = message;
        note.create_at = now;
        note.update_at = now;

        user_index.note_ids.push(note_id);
        user_index.note_count += 1;

        msg!("Note {} created successfully", note_id);
        Ok(())
    }

    pub fn delete_note(ctx: Context<DeleteNote>, note_id: u64) -> Result<()> {
        let user_index = &mut ctx.accounts.user_index;
        let note = &ctx.accounts.note;

        user_index.note_ids.retain(|&id| id != note_id);

        msg!("Note {} deleted successfully", note.note_id);
        Ok(())
    }

    pub fn get_user_note_ids(ctx: Context<GetUserNoteIds>) -> Result<Vec<u64>> {
        let user_index = &ctx.accounts.user_index;
        Ok(user_index.note_ids.clone())
    }

    pub fn create(ctx: Context<Create>, note_id: u64, message: String) -> Result<()> {
        require!(message.len() <= 1000, NoteError::MessageTooLong);

        let note = &mut ctx.accounts.note;
        let now = Clock::get()?.unix_timestamp;

        note.authority = ctx.accounts.user.key();
        note.note_id = note_id;
        note.message = message;
        note.create_at = now;
        note.update_at = now;

        msg!("Note {} created successfully", note.note_id);
        Ok(())
    }

    pub fn update(ctx: Context<Update>, _note_id: u64, message: String) -> Result<()> {
        require!(message.len() <= 1000, NoteError::MessageTooLong);

        let note = &mut ctx.accounts.note;
        note.message = message;
        note.update_at = Clock::get()?.unix_timestamp;

        msg!("Note {} updated successfully", note.note_id);
        Ok(())
    }

    pub fn delete(ctx: Context<Delete>, _note_id: u64) -> Result<()> {
        let note = &ctx.accounts.note;
        msg!("Note {} deleted successfully", note.note_id);
        Ok(())
    }
}

#[account]
pub struct Note {
    pub authority: Pubkey,
    pub note_id: u64,
    pub message: String,
    pub create_at: i64,
    pub update_at: i64,
}

impl Note {
    // 8(discriminator) + 32(authority) + 8(note_id) + 4 + 1000(message) + 8(create_at) + 8(update_at)
    pub const MAX_SIZE: usize = 8 + 32 + 8 + 4 + 1000 + 8 + 8;
}

/// 用户笔记索引
#[account]
pub struct UserNoteIndex {
    pub authority: Pubkey,    // 32 bytes
    pub note_count: u64,      // 8 bytes
    pub note_ids: Vec<u64>,   // 4 + (8 * max_notes)
}

impl UserNoteIndex {
    // max 100 notes
    pub const MAX_SIZE: usize = 8 + 32 + 8 + 4 + (8 * 100);
}

#[derive(Accounts)]
pub struct InitializeUserIndex<'info> {
    #[account(
        init,
        payer = user,
        space = UserNoteIndex::MAX_SIZE,
        seeds = [user.key().as_ref(), b"index"],
        bump
    )]
    pub user_index: Account<'info, UserNoteIndex>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(note_id: u64)]
pub struct CreateNote<'info> {
    #[account(
        init,
        payer = user,
        space = Note::MAX_SIZE,
        seeds = [user.key().as_ref(), b"note", note_id.to_le_bytes().as_ref()],  // 使用传入的note_id
        bump
    )]
    pub note: Account<'info, Note>,
    #[account(
        mut,
        seeds = [user.key().as_ref(), b"index"],
        bump
    )]
    pub user_index: Account<'info, UserNoteIndex>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(note_id: u64)]
pub struct DeleteNote<'info> {
    #[account(
        mut,
        seeds = [authority.key().as_ref(), b"note", note_id.to_le_bytes().as_ref()],
        bump,
        has_one = authority @ NoteError::Unauthorized,
        close = authority
    )]
    pub note: Account<'info, Note>,
    #[account(
        mut,
        seeds = [authority.key().as_ref(), b"index"],
        bump,
        has_one = authority @ NoteError::Unauthorized
    )]
    pub user_index: Account<'info, UserNoteIndex>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetUserNoteIds<'info> {
    #[account(
        seeds = [user.key().as_ref(), b"index"],
        bump
    )]
    pub user_index: Account<'info, UserNoteIndex>,
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(note_id: u64)]
pub struct Create<'info> {
   #[account(
        init,
        payer = user,
        space = Note::MAX_SIZE,
        seeds = [user.key().as_ref(), b"note", note_id.to_le_bytes().as_ref()],
        bump,
   )]
   pub note: Account<'info, Note>,
   #[account(mut)]
   pub user: Signer<'info>,
   pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(note_id: u64)]
pub struct Update<'info> {
    #[account(
        mut,
        seeds = [authority.key().as_ref(), b"note", note_id.to_le_bytes().as_ref()],
        bump,
        has_one = authority,
    )]
    pub note: Account<'info, Note>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(note_id: u64)]
pub struct Delete<'info> {
    #[account(
        mut,
        seeds = [authority.key().as_ref(), b"note", note_id.to_le_bytes().as_ref()],
        bump,
        has_one = authority,
        close = authority,
    )]
    pub note: Account<'info, Note>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[error_code]
pub enum NoteError {
    #[msg("Message too long")]
    MessageTooLong,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid note ID")]
    InvalidNoteId,
}
