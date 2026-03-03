const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

// Test if we can construct the create instruction without the Anchor builder natively
// The simplest way to bypass Anchor `accounts` initialization crash is to NOT initialize anchor.Program with accounts!
// If we set `idl.accounts = []` the `IdlCoder` won't crash on account layout parsing!
// But wait, my previous test with `test-instruction.js` DID HAVE `idl.accounts = []` 
// and it failed with `TypeError: Cannot read properties of undefined (reading 'encode')` in instruction.js!

// Why did instruction.js fail?
// Let's look at `node_modules/@coral-xyz/anchor/dist/cjs/coder/borsh/instruction.js:58`

