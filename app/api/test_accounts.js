const { Connection, PublicKey } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const idl = require('./idl.json');

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const programId = new PublicKey('5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR');
  
  const crypto = require('crypto');
  const coder = new anchor.BorshCoder(idl);
  const discriminator = crypto.createHash('sha256').update('account:Market').digest().slice(0, 8);

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(discriminator) } }
    ]
  });

  console.log(`Found ${accounts.length} market accounts.`);
  
  let success = 0;
  let fail = 0;
  
  for (const acc of accounts) {
    try {
      coder.accounts.decode("market", acc.account.data);
      success++;
    } catch (e) {
      console.log(`Failed to decode account ${acc.pubkey.toBase58()} of size ${acc.account.data.length}: ${e.message}`);
      fail++;
    }
  }
  
  console.log(`Successfully decoded: ${success}`);
  console.log(`Failed to decode: ${fail}`);
}

main().catch(console.error);
