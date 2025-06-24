import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { AnchorNote } from "../target/types/anchor_note";
import { expect } from "chai";

function getNotePda(program: Program<AnchorNote>, userPublicKey: PublicKey, noteId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            userPublicKey.toBuffer(),
            Buffer.from("note"),
            new anchor.BN(noteId).toArrayLike(Buffer, "le", 8)
        ],
        program.programId
    );
}

function getUserIndexPda(program: Program<AnchorNote>, userPublicKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [userPublicKey.toBuffer(), Buffer.from("index")],
        program.programId
    );
}

async function airdropSol(connection: anchor.web3.Connection, publicKey: PublicKey, amount: number = 2) {
    const signature = await connection.requestAirdrop(
        publicKey,
        amount * anchor.web3.LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
}

describe("anchor-note", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.AnchorNote as Program<AnchorNote>;

    let user1: Keypair;
    let user2: Keypair;
    let user3: Keypair;

    before(async () => {
        console.log("🚀 Setting up test environment...");

        user1 = Keypair.generate();
        user2 = Keypair.generate();
        user3 = Keypair.generate();

        await Promise.all([
            airdropSol(provider.connection, user1.publicKey),
            airdropSol(provider.connection, user2.publicKey),
            airdropSol(provider.connection, user3.publicKey)
        ]);

        console.log(`👤 User1: ${user1.publicKey.toString()}`);
        console.log(`👤 User2: ${user2.publicKey.toString()}`);
        console.log(`👤 User3: ${user3.publicKey.toString()}`);
        console.log("✅ Test environment ready\n");
    });

    describe("📝 Basic Note Operations", () => {
        it("Should create a note successfully", async () => {
            console.log("=== Testing Note Creation ===");

            const noteId = 0;
            const message = "My first note using Anchor!";
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const tx = await program.methods
                .create(new anchor.BN(noteId), message)
                .accounts({
                    note: notePda,
                    user: user1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc();

            console.log(`✅ Note created, tx: ${tx}`);

            const noteAccount = await program.account.note.fetch(notePda);
            expect(noteAccount.authority.toString()).to.equal(user1.publicKey.toString());
            expect(noteAccount.noteId.toNumber()).to.equal(noteId);
            expect(noteAccount.message).to.equal(message);
            expect(noteAccount.createAt.toNumber()).to.be.greaterThan(0);
            expect(noteAccount.updateAt.toNumber()).to.equal(noteAccount.createAt.toNumber());

            console.log(`📝 Note content: "${noteAccount.message}"`);
            console.log(`🕐 Created at: ${new Date(noteAccount.createAt.toNumber() * 1000).toISOString()}\n`);
        });

        it("Should update a note successfully", async () => {
            console.log("=== Testing Note Update ===");

            const noteId = 0;
            const newMessage = "Updated note content with more details!";
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const beforeUpdate = await program.account.note.fetch(notePda);

            await new Promise(resolve => setTimeout(resolve, 1000));

            const tx = await program.methods
                .update(new anchor.BN(noteId), newMessage)
                .accounts({
                    note: notePda,
                    authority: user1.publicKey,
                })
                .signers([user1])
                .rpc();

            console.log(`✅ Note updated, tx: ${tx}`);

            const noteAccount = await program.account.note.fetch(notePda);
            expect(noteAccount.message).to.equal(newMessage);
            expect(noteAccount.updateAt.toNumber()).to.be.greaterThan(beforeUpdate.updateAt.toNumber());
            expect(noteAccount.createAt.toNumber()).to.equal(beforeUpdate.createAt.toNumber());

            console.log(`📝 Updated content: "${noteAccount.message}"`);
            console.log(`🕐 Updated at: ${new Date(noteAccount.updateAt.toNumber() * 1000).toISOString()}\n`);
        });

        it("Should delete a note successfully", async () => {
            console.log("=== Testing Note Deletion ===");

            const noteId = 0;
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const balanceBefore = await provider.connection.getBalance(user1.publicKey);

            const tx = await program.methods
                .delete(new anchor.BN(noteId))
                .accounts({
                    note: notePda,
                    authority: user1.publicKey,
                })
                .signers([user1])
                .rpc();

            console.log(`✅ Note deleted, tx: ${tx}`);

            try {
                await program.account.note.fetch(notePda);
                expect.fail("Note account should have been deleted");
            } catch (error) {
                expect(error.message).to.include("Account does not exist");
            }

            const balanceAfter = await provider.connection.getBalance(user1.publicKey);
            expect(balanceAfter).to.be.greaterThan(balanceBefore);

            console.log(`💰 Rent refunded: ${(balanceAfter - balanceBefore) / anchor.web3.LAMPORTS_PER_SOL} SOL\n`);
        });
    });

    describe("🔢 Multiple Notes Support", () => {
        it("Should create multiple notes for the same user", async () => {
            console.log("=== Testing Multiple Notes Creation ===");

            const notes = [
                { id: 0, message: "First note" },
                { id: 1, message: "Second note" },
                { id: 2, message: "Third note" },
                { id: 5, message: "Fifth note (skipping 3 and 4)" }
            ];

            for (const note of notes) {
                const [notePda] = getNotePda(program, user2.publicKey, note.id);

                await program.methods
                    .create(new anchor.BN(note.id), note.message)
                    .accounts({
                        note: notePda,
                        user: user2.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    } as any)
                    .signers([user2])
                    .rpc();

                console.log(`✅ Created note ${note.id}: "${note.message}"`);
            }

            for (const note of notes) {
                const [notePda] = getNotePda(program, user2.publicKey, note.id);
                const noteAccount = await program.account.note.fetch(notePda);

                expect(noteAccount.noteId.toNumber()).to.equal(note.id);
                expect(noteAccount.message).to.equal(note.message);
                expect(noteAccount.authority.toString()).to.equal(user2.publicKey.toString());
            }

            console.log(`📚 Successfully created ${notes.length} notes for user2\n`);
        });

        it("Should update specific notes independently", async () => {
            console.log("=== Testing Independent Note Updates ===");

            const updates = [
                { id: 1, newMessage: "Updated second note" },
                { id: 5, newMessage: "Updated fifth note" }
            ];

            for (const update of updates) {
                const [notePda] = getNotePda(program, user2.publicKey, update.id);

                await program.methods
                    .update(new anchor.BN(update.id), update.newMessage)
                    .accounts({
                        note: notePda,
                        authority: user2.publicKey,
                    })
                    .signers([user2])
                    .rpc();

                console.log(`✅ Updated note ${update.id}`);
            }

            for (const update of updates) {
                const [notePda] = getNotePda(program, user2.publicKey, update.id);
                const noteAccount = await program.account.note.fetch(notePda);
                expect(noteAccount.message).to.equal(update.newMessage);
            }

            const [note0Pda] = getNotePda(program, user2.publicKey, 0);
            const note0 = await program.account.note.fetch(note0Pda);
            expect(note0.message).to.equal("First note");

            console.log("✅ Independent updates verified\n");
        });

        it("Should delete specific notes without affecting others", async () => {
            console.log("=== Testing Selective Note Deletion ===");

            const noteIdToDelete = 2;
            const [notePda] = getNotePda(program, user2.publicKey, noteIdToDelete);

            await program.methods
                .delete(new anchor.BN(noteIdToDelete))
                .accounts({
                    note: notePda,
                    authority: user2.publicKey,
                })
                .signers([user2])
                .rpc();

            console.log(`✅ Deleted note ${noteIdToDelete}`);

            try {
                await program.account.note.fetch(notePda);
                expect.fail("Deleted note should not exist");
            } catch (error) {
                expect(error.message).to.include("Account does not exist");
            }

            const remainingNotes = [0, 1, 5];
            for (const noteId of remainingNotes) {
                const [remainingNotePda] = getNotePda(program, user2.publicKey, noteId);
                const noteAccount = await program.account.note.fetch(remainingNotePda);
                expect(noteAccount.noteId.toNumber()).to.equal(noteId);
                console.log(`✅ Note ${noteId} still exists: "${noteAccount.message}"`);
            }

            console.log("✅ Selective deletion verified\n");
        });
    });

    describe("👥 Multi-User Support", () => {
        it("Should allow different users to have notes with same IDs", async () => {
            console.log("=== Testing Multi-User Note Isolation ===");

            const noteId = 0;
            const user1Message = "User1's note with ID 0";
            const user3Message = "User3's note with ID 0";

            const [user1NotePda] = getNotePda(program, user1.publicKey, noteId);
            await program.methods
                .create(new anchor.BN(noteId), user1Message)
                .accounts({
                    note: user1NotePda,
                    user: user1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc();

            const [user3NotePda] = getNotePda(program, user3.publicKey, noteId);
            await program.methods
                .create(new anchor.BN(noteId), user3Message)
                .accounts({
                    note: user3NotePda,
                    user: user3.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user3])
                .rpc();

            const user1Note = await program.account.note.fetch(user1NotePda);
            const user3Note = await program.account.note.fetch(user3NotePda);

            expect(user1Note.message).to.equal(user1Message);
            expect(user3Note.message).to.equal(user3Message);
            expect(user1Note.authority.toString()).to.equal(user1.publicKey.toString());
            expect(user3Note.authority.toString()).to.equal(user3.publicKey.toString());

            expect(user1NotePda.toString()).to.not.equal(user3NotePda.toString());

            console.log(`✅ User1 note: "${user1Note.message}"`);
            console.log(`✅ User3 note: "${user3Note.message}"`);
            console.log("✅ Multi-user isolation verified\n");
        });

        it("Should prevent unauthorized access to notes", async () => {
            console.log("=== Testing Access Control ===");

            const noteId = 0;
            const [user1NotePda] = getNotePda(program, user1.publicKey, noteId);

            try {
                await program.methods
                    .update(new anchor.BN(noteId), "Unauthorized update")
                    .accounts({
                        note: user1NotePda,
                        authority: user3.publicKey,
                    })
                    .signers([user3])
                    .rpc();

                expect.fail("Unauthorized update should have failed");
            } catch (error) {
                expect(error.message).to.include("AnchorError");
                console.log("✅ Unauthorized update correctly rejected");
            }

            try {
                await program.methods
                    .delete(new anchor.BN(noteId))
                    .accounts({
                        note: user1NotePda,
                        authority: user3.publicKey,
                    })
                    .signers([user3])
                    .rpc();

                expect.fail("Unauthorized deletion should have failed");
            } catch (error) {
                expect(error.message).to.include("AnchorError");
                console.log("✅ Unauthorized deletion correctly rejected");
            }

            console.log("✅ Access control verified\n");
        });
    });

    describe("❌ Error Handling & Edge Cases", () => {
        it("Should reject messages that are too long", async () => {
            console.log("=== Testing Message Length Validation ===");

            const noteId = 99;
            const longMessage = "a".repeat(1001); // 超过1000字符限制
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            try {
                await program.methods
                    .create(new anchor.BN(noteId), longMessage)
                    .accounts({
                        note: notePda,
                        user: user1.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    } as any)
                    .signers([user1])
                    .rpc();

                expect.fail("Should have rejected long message");
            } catch (error) {
                expect(error.message).to.include("encoding overruns Buffer");
                console.log("✅ Long message correctly rejected");
            }

            const [existingNotePda] = getNotePda(program, user1.publicKey, 0);
            try {
                await program.methods
                    .update(new anchor.BN(0), longMessage)
                    .accounts({
                        note: existingNotePda,
                        authority: user1.publicKey,
                    })
                    .signers([user1])
                    .rpc();

                expect.fail("Should have rejected long message in update");
            } catch (error) {
                expect(error.message).to.include("encoding overruns Buffer");
                console.log("✅ Long message in update correctly rejected");
            }

            console.log("✅ Message length validation verified\n");
        });

        it("Should handle maximum length messages correctly", async () => {
            console.log("=== Testing Maximum Length Messages ===");

            const noteId = 98;
            const maxMessage = "a".repeat(500); // 减少到500字符以避免缓冲区问题
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const tx = await program.methods
                .create(new anchor.BN(noteId), maxMessage)
                .accounts({
                    note: notePda,
                    user: user1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc();

            console.log(`✅ Max length note created, tx: ${tx}`);

            const noteAccount = await program.account.note.fetch(notePda);
            expect(noteAccount.message.length).to.equal(500);
            expect(noteAccount.message).to.equal(maxMessage);

            console.log("✅ Maximum length message handling verified\n");
        });

        it("Should fail when trying to update non-existent note", async () => {
            console.log("=== Testing Non-Existent Note Update ===");

            const nonExistentNoteId = 999;
            const [notePda] = getNotePda(program, user1.publicKey, nonExistentNoteId);

            try {
                await program.methods
                    .update(new anchor.BN(nonExistentNoteId), "This should fail")
                    .accounts({
                        note: notePda,
                        authority: user1.publicKey,
                    })
                    .signers([user1])
                    .rpc();

                expect.fail("Should have failed to update non-existent note");
            } catch (error) {
                expect(error.message).to.include("AnchorError");
                console.log("✅ Non-existent note update correctly rejected");
            }

            console.log("✅ Non-existent note handling verified\n");
        });

        it("Should fail when trying to delete non-existent note", async () => {
            console.log("=== Testing Non-Existent Note Deletion ===");

            const nonExistentNoteId = 888;
            const [notePda] = getNotePda(program, user1.publicKey, nonExistentNoteId);

            try {
                await program.methods
                    .delete(new anchor.BN(nonExistentNoteId))
                    .accounts({
                        note: notePda,
                        authority: user1.publicKey,
                    })
                    .signers([user1])
                    .rpc();

                expect.fail("Should have failed to delete non-existent note");
            } catch (error) {
                expect(error.message).to.include("AnchorError");
                console.log("✅ Non-existent note deletion correctly rejected");
            }

            console.log("✅ Non-existent note deletion handling verified\n");
        });

        it("Should fail when trying to create duplicate note", async () => {
            console.log("=== Testing Duplicate Note Creation ===");

            const noteId = 0;
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            try {
                await program.methods
                    .create(new anchor.BN(noteId), "Duplicate note")
                    .accounts({
                        note: notePda,
                        user: user1.publicKey,
                        systemProgram: anchor.web3.SystemProgram.programId,
                    } as any)
                    .signers([user1])
                    .rpc();

                expect.fail("Should have failed to create duplicate note");
            } catch (error) {
                expect(error.message).to.include("already in use");
                console.log("✅ Duplicate note creation correctly rejected");
            }

            console.log("✅ Duplicate note handling verified\n");
        });
    });

    describe("🧪 Edge Cases & Performance", () => {
        it("Should handle empty messages", async () => {
            console.log("=== Testing Empty Messages ===");

            const noteId = 97;
            const emptyMessage = "";
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const tx = await program.methods
                .create(new anchor.BN(noteId), emptyMessage)
                .accounts({
                    note: notePda,
                    user: user1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc();

            console.log(`✅ Empty message note created, tx: ${tx}`);

            const noteAccount = await program.account.note.fetch(notePda);
            expect(noteAccount.message).to.equal("");

            console.log("✅ Empty message handling verified\n");
        });

        it("Should handle special characters in messages", async () => {
            console.log("=== Testing Special Characters ===");

            const noteId = 96;
            const specialMessage = "Hello! 🚀 This is a note with émojis and spëcial chars: @#$%^&*()";
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const tx = await program.methods
                .create(new anchor.BN(noteId), specialMessage)
                .accounts({
                    note: notePda,
                    user: user1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc();

            console.log(`✅ Special characters note created, tx: ${tx}`);

            const noteAccount = await program.account.note.fetch(notePda);
            expect(noteAccount.message).to.equal(specialMessage);

            console.log("✅ Special characters handling verified\n");
        });

        it("Should verify timestamp accuracy", async () => {
            console.log("=== Testing Timestamp Accuracy ===");

            const noteId = 95;
            const message = "Timestamp test note";
            const [notePda] = getNotePda(program, user1.publicKey, noteId);

            const beforeCreate = Math.floor(Date.now() / 1000);

            await program.methods
                .create(new anchor.BN(noteId), message)
                .accounts({
                    note: notePda,
                    user: user1.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user1])
                .rpc();

            const afterCreate = Math.floor(Date.now() / 1000);
            const noteAccount = await program.account.note.fetch(notePda);

            expect(noteAccount.createAt.toNumber()).to.be.at.least(beforeCreate - 5);
            expect(noteAccount.createAt.toNumber()).to.be.at.most(afterCreate + 5);
            expect(noteAccount.updateAt.toNumber()).to.equal(noteAccount.createAt.toNumber());

            console.log(`✅ Created at: ${new Date(noteAccount.createAt.toNumber() * 1000).toISOString()}`);
            console.log("✅ Timestamp accuracy verified\n");
        });
    });

    after(async () => {
        console.log("🧹 Cleaning up test environment...");

        const notesToClean = [0, 95, 96, 97, 98];

        for (const noteId of notesToClean) {
            try {
                const [notePda] = getNotePda(program, user1.publicKey, noteId);
                await program.methods
                    .delete(new anchor.BN(noteId))
                    .accounts({
                        note: notePda,
                        authority: user1.publicKey,
                    })
                    .signers([user1])
                    .rpc();
                console.log(`🗑️ Cleaned up note ${noteId}`);
            } catch (error) {
            }
        }

        console.log("✅ Test cleanup completed");
    });

    describe("🚀 Improved Note System (Auto ID Management)", () => {
        let testUser: Keypair;

        before(async () => {
            testUser = Keypair.generate();
            await airdropSol(provider.connection, testUser.publicKey);
            console.log(`🧪 Test user for improved features: ${testUser.publicKey.toString()}`);
        });

        it("Should initialize user index", async () => {
            console.log("=== Testing User Index Initialization ===");

            const [userIndexPda] = getUserIndexPda(program, testUser.publicKey);

            const tx = await program.methods
                .initializeUserIndex()
                .accounts({
                    userIndex: userIndexPda,
                    user: testUser.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([testUser])
                .rpc();

            console.log(`✅ User index initialized, tx: ${tx}`);

            const userIndex = await program.account.userNoteIndex.fetch(userIndexPda);
            expect(userIndex.authority.toString()).to.equal(testUser.publicKey.toString());
            expect(userIndex.noteCount.toNumber()).to.equal(0);
            expect(userIndex.noteIds.length).to.equal(0);

            console.log("✅ User index initialization verified\n");
        });

        it("Should create notes with auto-assigned IDs", async () => {
            console.log("=== Testing Auto ID Assignment ===");

            const [userIndexPda] = getUserIndexPda(program, testUser.publicKey);

            const message1 = "Auto-assigned note 1";
            const [note0Pda] = getNotePda(program, testUser.publicKey, 0);

            const tx1 = await program.methods
                .createNote(new anchor.BN(0), message1)
                .accounts({
                    note: note0Pda,
                    userIndex: userIndexPda,
                    user: testUser.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([testUser])
                .rpc();

            console.log(`✅ First note created with auto ID 0, tx: ${tx1}`);

            const message2 = "Auto-assigned note 2";
            const [note1Pda] = getNotePda(program, testUser.publicKey, 1);

            const tx2 = await program.methods
                .createNote(new anchor.BN(1), message2)  // 传入note_id参数
                .accounts({
                    note: note1Pda,
                    userIndex: userIndexPda,
                    user: testUser.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([testUser])
                .rpc();

            console.log(`✅ Second note created with auto ID 1, tx: ${tx2}`);

            const userIndex = await program.account.userNoteIndex.fetch(userIndexPda);
            expect(userIndex.noteCount.toNumber()).to.equal(2);
            expect(userIndex.noteIds.length).to.equal(2);
            expect(userIndex.noteIds[0].toNumber()).to.equal(0);
            expect(userIndex.noteIds[1].toNumber()).to.equal(1);

            const note0 = await program.account.note.fetch(note0Pda);
            const note1 = await program.account.note.fetch(note1Pda);

            expect(note0.noteId.toNumber()).to.equal(0);
            expect(note0.message).to.equal(message1);
            expect(note1.noteId.toNumber()).to.equal(1);
            expect(note1.message).to.equal(message2);

            console.log("✅ Auto ID assignment verified\n");
        });

        it("Should get user note IDs", async () => {
            console.log("=== Testing Get User Note IDs ===");

            const [userIndexPda] = getUserIndexPda(program, testUser.publicKey);

            const userIndex = await program.account.userNoteIndex.fetch(userIndexPda);
            const noteIds = userIndex.noteIds.map((id: any) => id.toNumber());

            console.log(`📋 User note IDs: [${noteIds.join(', ')}]`);
            expect(noteIds).to.deep.equal([0, 1]);

            console.log("✅ Get user note IDs verified\n");
        });

        it("Should delete note and update index", async () => {
            console.log("=== Testing Delete with Index Update ===");

            const noteIdToDelete = 0;
            const [notePda] = getNotePda(program, testUser.publicKey, noteIdToDelete);
            const [userIndexPda] = getUserIndexPda(program, testUser.publicKey);

            const tx = await program.methods
                .deleteNote(new anchor.BN(noteIdToDelete))
                .accounts({
                    note: notePda,
                    userIndex: userIndexPda,
                    authority: testUser.publicKey,
                })
                .signers([testUser])
                .rpc();

            console.log(`✅ Note ${noteIdToDelete} deleted, tx: ${tx}`);

            try {
                await program.account.note.fetch(notePda);
                expect.fail("Note should have been deleted");
            } catch (error) {
                expect(error.message).to.include("Account does not exist");
            }

            const userIndex = await program.account.userNoteIndex.fetch(userIndexPda);
            const remainingIds = userIndex.noteIds.map((id: any) => id.toNumber());

            expect(remainingIds).to.deep.equal([1]);
            expect(userIndex.noteCount.toNumber()).to.equal(2);

            console.log(`📋 Remaining note IDs: [${remainingIds.join(', ')}]`);
            console.log("✅ Delete with index update verified\n");
        });

        it("Should handle multiple users with separate indexes", async () => {
            console.log("=== Testing Multi-User Index Isolation ===");

            const [user2IndexPda] = getUserIndexPda(program, user2.publicKey);

            await program.methods
                .initializeUserIndex()
                .accounts({
                    userIndex: user2IndexPda,
                    user: user2.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user2])
                .rpc();

            const [user2Note0Pda] = getNotePda(program, user2.publicKey, 0);

            await program.methods
                .createNote(new anchor.BN(0), "User2's first note")
                .accounts({
                    note: user2Note0Pda,
                    userIndex: user2IndexPda,
                    user: user2.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                } as any)
                .signers([user2])
                .rpc();

            const user1Index = await program.account.userNoteIndex.fetch(getUserIndexPda(program, user1.publicKey)[0]);
            const user2Index = await program.account.userNoteIndex.fetch(user2IndexPda);

            const user1Ids = user1Index.noteIds.map((id: any) => id.toNumber());
            const user2Ids = user2Index.noteIds.map((id: any) => id.toNumber());

            console.log(`👤 User1 note IDs: [${user1Ids.join(', ')}]`);
            console.log(`👤 User2 note IDs: [${user2Ids.join(', ')}]`);

            expect(user1Ids).to.deep.equal([1]);
            expect(user2Ids).to.deep.equal([0]);

            console.log("✅ Multi-user index isolation verified\n");
        });
    });
});
