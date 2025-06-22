import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorHelloWorld } from "../target/types/anchor_hello_world";
import { Puppet } from "../target/types/puppet";
import { expect } from "chai";

describe("anchor-hello-world-complete", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AnchorHelloWorld as Program<AnchorHelloWorld>;
  const puppetProgram = anchor.workspace.Puppet as Program<Puppet>;

  it("Basic functionality test", async () => {
    console.log("=== Testing Basic Functionality ===");

    // Generate a new keypair for the data account
    const myAccount = anchor.web3.Keypair.generate();

    // Call the initialize instruction
    const tx = await program.methods
        .initialize(new anchor.BN(42))
        .accounts({
          myAccount: myAccount.publicKey,
          user: program.provider.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([myAccount])
        .rpc();

    console.log("Initialize transaction signature:", tx);

    // Fetch and verify account data
    const account = await program.account.myAccount.fetch(myAccount.publicKey);
    console.log("Account data:", account.data.toString());
    expect(account.data.toNumber()).to.equal(42);

    // Test updating data
    await program.methods
      .setData(new anchor.BN(99))
      .accounts({
        myAccount: myAccount.publicKey,
      })
      .rpc();

    const updatedAccount = await program.account.myAccount.fetch(myAccount.publicKey);
    console.log("Updated account data:", updatedAccount.data.toString());
    expect(updatedAccount.data.toNumber()).to.equal(99);
  });

  it("Error handling test", async () => {
    console.log("=== Testing Error Handling ===");

    const myAccount = anchor.web3.Keypair.generate();

    try {
      // Try to use data that exceeds the limit (should fail)
      await program.methods
        .initialize(new anchor.BN(150)) // Greater than 100, should fail
        .accounts({
          myAccount: myAccount.publicKey,
          user: program.provider.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        } as any)
        .signers([myAccount])
        .rpc();

      // If we reach here, the test failed
      expect.fail("Expected transaction to fail");
    } catch (error) {
      console.log("Expected error caught:", error.message);
      expect(error.message).to.include("DataTooLarge");
    }
  });

  it("PDA functionality test", async () => {
    console.log("=== Testing PDA Functionality ===");

    const authority = anchor.web3.Keypair.generate();

    // Airdrop SOL to authority account
    const signature = await program.provider.connection.requestAirdrop(
      authority.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await program.provider.connection.confirmTransaction(signature);

    // Calculate PDA address
    const [userStatsPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user-stats"), authority.publicKey.toBuffer()],
      program.programId
    );

    console.log("User stats PDA:", userStatsPda.toString());

    // Initialize user statistics
    await program.methods
      .initializeUserStats("Alice")
      .accounts({
        userStats: userStatsPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([authority])
      .rpc();

    // Verify initial data
    let userStats = await program.account.userStats.fetch(userStatsPda);
    console.log("Initial user stats:", {
      name: userStats.name,
      level: userStats.level.toString(),
      points: userStats.points.toString(),
      authority: userStats.authority.toString(),
      bump: userStats.bump
    });

    expect(userStats.name).to.equal("Alice");
    expect(userStats.level.toNumber()).to.equal(1);
    expect(userStats.points.toNumber()).to.equal(0);

    // Update user statistics
    await program.methods
      .updateUserStats(new anchor.BN(150))
      .accounts({
        userStats: userStatsPda,
        authority: authority.publicKey,
      } as any)
      .signers([authority])
      .rpc();

    // Verify updated data
    userStats = await program.account.userStats.fetch(userStatsPda);
    console.log("Updated user stats:", {
      name: userStats.name,
      level: userStats.level.toString(),
      points: userStats.points.toString()
    });

    expect(userStats.points.toNumber()).to.equal(150);
    expect(userStats.level.toNumber()).to.equal(2); // 150 / 100 + 1 = 2
  });

  it("CPI functionality test", async () => {
    console.log("=== Testing CPI Functionality ===");

    const puppetAccount = anchor.web3.Keypair.generate();

    // Initialize puppet account
    await puppetProgram.methods
      .initialize()
      .accounts({
        puppet: puppetAccount.publicKey,
        user: program.provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([puppetAccount])
      .rpc();

    console.log("Puppet account initialized");

    // Verify initial data
    let puppetData = await puppetProgram.account.puppetData.fetch(puppetAccount.publicKey);
    console.log("Initial puppet data:", puppetData.data.toString());
    expect(puppetData.data.toNumber()).to.equal(0);

    // Call puppet program via CPI
    await program.methods
      .pullStrings(new anchor.BN(100))
      .accounts({
        puppet: puppetAccount.publicKey,
        puppetProgram: puppetProgram.programId,
      } as any)
      .rpc();

    // Verify CPI call result
    puppetData = await puppetProgram.account.puppetData.fetch(puppetAccount.publicKey);
    console.log("Puppet data after CPI:", puppetData.data.toString());
    expect(puppetData.data.toNumber()).to.equal(100);
  });

  it("CPI with PDA signer test", async () => {
    console.log("=== Testing CPI with PDA Signer ===");

    const puppetAccount = anchor.web3.Keypair.generate();

    // Initialize puppet account
    await puppetProgram.methods
      .initialize()
      .accounts({
        puppet: puppetAccount.publicKey,
        user: program.provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      } as any)
      .signers([puppetAccount])
      .rpc();

    // Calculate authority PDA
    const [authorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("authority")],
      program.programId
    );

    console.log("Authority PDA:", authorityPda.toString());

    // Call puppet program via CPI with PDA signer
    await program.methods
      .pullStringsWithPda(new anchor.BN(200))
      .accounts({
        puppet: puppetAccount.publicKey,
        puppetProgram: puppetProgram.programId,
        authority: authorityPda,
      } as any)
      .rpc();

    // Verify data
    const puppetData = await puppetProgram.account.puppetData.fetch(puppetAccount.publicKey);
    console.log("Puppet data after PDA CPI:", puppetData.data.toString());
    expect(puppetData.data.toNumber()).to.equal(200);
  });
});
