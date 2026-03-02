const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const idl = require('./idl.json');

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const provider = new anchor.AnchorProvider(connection, {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }, { commitment: 'confirmed' });
  const programId = new PublicKey('5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR');
  
  const program = new anchor.Program(idl, programId, provider);
  console.log("Fetching markets...");
  try {
    const markets = await program.account.market.all();
    console.log(`Found ${markets.length} markets!`);
  } catch (err) {
    console.log("Error fetching markets:", err);
  }
}

main().catch(console.error);
