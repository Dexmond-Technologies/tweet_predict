const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const idl = require('./idl.json');

const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
const AUTHORITY = new PublicKey('436RdD2mVZQedoe9yQUwyzorJrjSWqbQHtmWrhducnUe');
const PROGRAM_ID = new PublicKey('5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR');

const provider = new anchor.AnchorProvider(connection, {
    publicKey: AUTHORITY,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
}, { commitment: 'confirmed' });

try {
    const program = new anchor.Program(idl, PROGRAM_ID, provider);
    
    // Test creating an instruction
    const ix = program.methods.createMarket(
        Array.from(Buffer.alloc(32)),
        "Question",
        "Desc",
        new anchor.BN(0),
        new anchor.BN(0),
        0,
        AUTHORITY,
        new anchor.BN(0),
        0
    ).accounts({
        protocolState: AUTHORITY,
        market: AUTHORITY,
        yesVault: AUTHORITY,
        noVault: AUTHORITY,
        mint: AUTHORITY,
        creator: AUTHORITY,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    }).instruction();
    
    ix.then(() => console.log("Instruction created successfully!"))
      .catch(e => console.error("Instruction error", e));
      
} catch(e) {
    console.error("Error loading program:", e);
}
