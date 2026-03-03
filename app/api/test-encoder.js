const { BorshInstructionCoder, BN } = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const idl = require('./idl.json');

const coder = new BorshInstructionCoder(idl);
// Try encoding createMarket
try {
  const data = coder.encode('createMarket', {
      questionHash: Array.from(Buffer.alloc(32)),
      question: "Will BTC hit 200k?",
      description: "Description",
      endTimestamp: new BN(0),
      resolutionWindow: new BN(7 * 86400),
      oracleType: 0,
      oracleAccount: new PublicKey('11111111111111111111111111111111'),
      targetPrice: new BN(0),
      priceDirection: 0
  });
  console.log("Encoded successfully:", data.toString('hex'));
} catch (e) {
  console.error("Encoder error:", e);
}
