const express = require('express');
const cors = require('cors');
const {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
  SystemProgram,
  ComputeBudgetProgram,
} = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const { createActionHeaders } = { createActionHeaders: () => ({}) }; // unused stub
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const idl = require('./idl.json');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ─── CORS with Solana Blinks headers ───────────────────────────────────────
const ACTIONS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'X-Action-Version': '2.1.3',
  'X-Blockchain-Ids': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
};
app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
  Object.entries(ACTIONS_CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  next();
});
app.options('*', (req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3001;
const PROGRAM_ID = new PublicKey('5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR');
const D3X_MINT = new PublicKey('AGN8SrMCMEgiP1ghvPHa5VRf5rPFDSYVrGFyBGE1Cqpa');
const AUTHORITY = new PublicKey('436RdD2mVZQedoe9yQUwyzorJrjSWqbQHtmWrhducnUe');
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

// ─── UTILS ────────────────────────────────────────────────────────────────────
function getConnection() {
  return new Connection(
    process.env.SOLANA_NETWORK === 'mainnet-beta' ? (process.env.RPC_URL || "https://solana-mainnet.rpc.extnode.com") : clusterApiUrl('devnet'),
    'confirmed'
  );
}

/** Read-only Anchor provider (no wallet needed for fetching) */
function getReadProvider() {
  const connection = getConnection();
  const dummyWallet = {
    publicKey: AUTHORITY,
    signTransaction: async () => { throw new Error('Ready only'); },
    signAllTransactions: async () => { throw new Error('Ready only'); },
  };
  return new anchor.AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
}

/** Derive market PDA from question hash (sha256) — matches the on-chain derivation */
function deriveMarketPDA(question) {
  const hash = crypto.createHash('sha256').update(question).digest();
  return PublicKey.findProgramAddressSync([Buffer.from('market'), hash], PROGRAM_ID);
}

/** Derive protocol state PDA */
function deriveProtocolPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('protocol')], PROGRAM_ID);
}

/** Derive yes/no vault PDAs from market pubkey */
function deriveVaultPDAs(marketPubkey) {
  const [yesVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('yes_vault'), marketPubkey.toBuffer()], PROGRAM_ID
  );
  const [noVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('no_vault'), marketPubkey.toBuffer()], PROGRAM_ID
  );
  return { yesVault, noVault };
}

/** Derive position PDA for user+market */
function derivePositionPDA(marketPubkey, userPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), marketPubkey.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  );
}

/** Derive treasury vault PDA */
function deriveTreasuryPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
}

// ─── actions.json ────────────────────────────────────────────────────────────
app.get('/actions.json', (req, res) => {
  res.json({
    rules: [
      { pathPattern: '/create', apiPath: '/api/action/create' },
      { pathPattern: '/bet/**', apiPath: '/api/action/bet' },
      { pathPattern: '/claim/**', apiPath: '/api/action/claim' },
    ],
  });
});

// ─── GET /api/markets ─────────────────────────────────────────────────────────
app.get('/api/markets', async (req, res) => {
  try {
    const connection = getConnection();
    const MARKET_DISCRIMINATOR = [219, 190, 213, 55, 0, 227, 198, 154];
    const filters = [{ memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(Buffer.from(MARKET_DISCRIMINATOR)) } }];
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });

    const result = accounts.map(account => {
        let data = account.account.data;
        let offset = 8;
        
        const creator = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const oracleType = data.readUInt8(offset); offset += 1;
        const oracleAccount = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const targetPrice = data.readBigInt64LE(offset); offset += 8;
        const priceDirection = data.readUInt8(offset); offset += 1;
        
        const questionLen = data.readUInt32LE(offset); offset += 4;
        const question = data.slice(offset, offset + questionLen).toString('utf8'); offset += questionLen;
        
        const descLen = data.readUInt32LE(offset); offset += 4;
        const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
        
        const endTimestamp = data.readBigInt64LE(offset); offset += 8;
        const resolutionTimestamp = data.readBigInt64LE(offset); offset += 8;
        
        const statusType = data.readUInt8(offset); offset += 1;
        let statusObj = { active: {} };
        if (statusType === 1) {
             const outcome = data.readUInt8(offset) === 1; offset += 1;
             statusObj = { resolved: { outcome } };
        } else if (statusType === 2) {
             statusObj = { closed: {} };
        }
        
        const totalYes = data.readBigUInt64LE(offset); offset += 8;
        const totalNo = data.readBigUInt64LE(offset); offset += 8;
        const totalFeesCollected = data.readBigUInt64LE(offset); offset += 8;
        const creatorFeeEarned = data.readBigUInt64LE(offset); offset += 8;
        
        const yesVault = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const noVault = new PublicKey(data.slice(offset, offset + 32)); offset += 32;

        return {
          pubkey: account.pubkey.toBase58(),
          creator: creator.toBase58(),
          question,
          description,
          endTimestamp: Number(endTimestamp),
          status: statusObj,
          totalYes: totalYes.toString(),
          totalNo: totalNo.toString(),
          totalFeesCollected: totalFeesCollected.toString(),
          creatorFeeEarned: creatorFeeEarned.toString(),
          yesVault: yesVault.toBase58(),
          noVault: noVault.toBase58(),
          oracleType,
          targetPrice: targetPrice.toString(),
          priceDirection
        };
    });
    
    res.json(result);
  } catch (err) {
    console.error('GET /api/markets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/market/:pubkey ──────────────────────────────────────────────────
app.get('/api/market/:pubkey', async (req, res) => {
  try {
    const connection = getConnection();
    const marketPubkey = new PublicKey(req.params.pubkey);
    const info = await connection.getAccountInfo(marketPubkey);
    if (!info) return res.status(404).json({ error: "Market not found" });

    let data = info.data;
    let offset = 8;
        
    const creator = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const oracleType = data.readUInt8(offset); offset += 1;
    const oracleAccount = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const targetPrice = data.readBigInt64LE(offset); offset += 8;
    const priceDirection = data.readUInt8(offset); offset += 1;
        
    const questionLen = data.readUInt32LE(offset); offset += 4;
    const question = data.slice(offset, offset + questionLen).toString('utf8'); offset += questionLen;
        
    const descLen = data.readUInt32LE(offset); offset += 4;
    const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
        
    const endTimestamp = data.readBigInt64LE(offset); offset += 8;
    const resolutionTimestamp = data.readBigInt64LE(offset); offset += 8;
        
    const statusType = data.readUInt8(offset); offset += 1;
    let statusStr = "Active";
    if (statusType === 1) statusStr = "Resolved";
    else if (statusType === 2) statusStr = "Closed";
        
    const totalYes = data.readBigUInt64LE(offset); offset += 8;
    const totalNo = data.readBigUInt64LE(offset); offset += 8;
    
    // vault read logic:
    offset += 16; // skip totalFeesCollected and creatorFeeEarned
    const yesVault = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const noVault = new PublicKey(data.slice(offset, offset + 32)); offset += 32;

    res.json({
      pubkey: marketPubkey.toBase58(),
      question,
      description,
      endTimestamp: Number(endTimestamp),
      status: statusStr,
      totalYes: totalYes.toString(),
      totalNo: totalNo.toString(),
      yesVault: yesVault.toBase58(),
      noVault: noVault.toBase58(),
      oracleType,
      targetPrice: targetPrice.toString(),
      priceDirection,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/protocol ────────────────────────────────────────────────────────
app.get('/api/protocol', async (req, res) => {
  try {
    const connection = getConnection();
    const [protocolPDA] = deriveProtocolPDA();
    const info = await connection.getAccountInfo(protocolPDA);
    if (!info) {
      return res.json({
         authority: AUTHORITY.toBase58(),
         treasuryVault: AUTHORITY.toBase58(),
         feeBps: 200,
         totalFeesCollected: "0",
         totalMarketsCreated: 0,
         totalVolume: "0",
      });
    }

    const data = info.data;
    let offset = 8;
    const authority = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const treasuryVault = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const feeBps = data.readUInt16LE(offset); offset += 2;
    const totalFeesCollected = data.readBigUInt64LE(offset); offset += 8;
    const totalMarketsCreated = data.readBigUInt64LE(offset); offset += 8;
    const totalVolume = data.readBigUInt64LE(offset);

    res.json({
      authority: authority.toBase58(),
      treasuryVault: treasuryVault.toBase58(),
      feeBps,
      totalFeesCollected: totalFeesCollected.toString(),
      totalMarketsCreated: Number(totalMarketsCreated),
      totalVolume: totalVolume.toString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/action/create ───────────────────────────────────────────────────
app.get('/api/action/create', (req, res) => {
  res.json({
    title: 'Create Prediction Market',
    icon: 'https://ucarecdn.com/7aa7621c-5353-4f24-9134-2e9ea156a05e/-/preview/880x880/-/quality/smart/-/format/auto/',
    description: 'Launch a new yes/no prediction market on TweetPredict. Bet with D3X tokens. Fully decentralized.',
    label: 'Create Market',
    links: {
      actions: [
        {
          label: 'Create Market',
          href: '/api/action/create?question={question}&description={description}&endDays={endDays}&oracleType=0&oracleAccount=11111111111111111111111111111111&targetPrice=0&priceDirection=0',
          parameters: [
            { name: 'question', label: 'Question (e.g. Will BTC hit $200k?)', required: true },
            { name: 'description', label: 'Description (optional)', required: false },
            { name: 'endDays', label: 'Market duration in days (e.g. 30)', required: true },
          ],
        },
      ],
    },
  });
});

// ─── POST /api/action/create ──────────────────────────────────────────────────
app.post('/api/action/create', async (req, res) => {
  try {
    const { account } = req.body;
    const { question, description = '', endDays = 30 } = req.query;
    
    const oracleType = parseInt(req.query.oracleType || '0', 10);
    const oracleAccount = new PublicKey(req.query.oracleAccount || '11111111111111111111111111111111');
    
    let targetPriceFloat = parseFloat(req.query.targetPrice || '0');
    if (oracleType === 1) {
        targetPriceFloat = targetPriceFloat * 100000000;
    }
    // Floor it to avoid any lingering decimal residue and convert to string for BN
    const targetPrice = new anchor.BN(Math.floor(targetPriceFloat).toString());
    const priceDirection = parseInt(req.query.priceDirection || '0', 10);

    if (!account || !question) {
      return res.status(400).json({ error: 'Missing account or question' });
    }

    const user = new PublicKey(account);
    const connection = getConnection();

    const endTimestamp = new anchor.BN(
      Math.floor(Date.now() / 1000) + parseInt(endDays) * 86400
    );
    const resolutionWindow = new anchor.BN(7 * 86400); // 7 days to resolve

    const [protocolPDA] = deriveProtocolPDA();
    const [marketPDA] = deriveMarketPDA(question);
    const { yesVault, noVault } = deriveVaultPDAs(marketPDA);

    const questionHash = Array.from(crypto.createHash('sha256').update(question).digest());

    const coder = new anchor.BorshInstructionCoder(idl);
    const data = coder.encode('createMarket', {
      questionHash,
      question,
      description,
      endTimestamp,
      resolutionWindow,
      oracleType,
      oracleAccount,
      targetPrice,
      priceDirection
    });

    const ix = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: protocolPDA, isSigner: false, isWritable: true },
        { pubkey: marketPDA, isSigner: false, isWritable: true },
        { pubkey: yesVault, isSigner: false, isWritable: true },
        { pubkey: noVault, isSigner: false, isWritable: true },
        { pubkey: D3X_MINT, isSigner: false, isWritable: false },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: anchor.web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data
    });

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 });
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 });
    const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(ix);
    transaction.feePayer = user;
    
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;

    const serialized = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    res.json({
      transaction: serialized,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      marketPubkey: marketPDA.toBase58(),
      message: `Creating market: "${question}" — closes in ${endDays} days`,
    });
  } catch (err) {
    console.error('POST /api/action/create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/action/bet ──────────────────────────────────────────────────────
app.get('/api/action/bet', (req, res) => {
  const marketId = req.query.market || '';
  const question = req.query.question || 'this prediction';
  res.json({
    title: `Bet on: ${question}`,
    icon: 'https://ucarecdn.com/d3b66479-7dd2-473d-8e65-c3577d61b6c7/-/preview/880x880/-/quality/smart/-/format/auto/',
    description: `Place a YES or NO bet using your D3X tokens. 2% protocol fee applies. Market: ${question}`,
    label: 'Bet with D3X',
    links: {
      actions: [
        {
          label: '✅ Bet YES with D3X',
          href: `/api/action/bet?market=${marketId}&question=${encodeURIComponent(question)}&side=yes&amount={amount}`,
          parameters: [{ name: 'amount', label: 'Amount of D3X tokens', required: true }],
        },
        {
          label: '❌ Bet NO with D3X',
          href: `/api/action/bet?market=${marketId}&question=${encodeURIComponent(question)}&side=no&amount={amount}`,
          parameters: [{ name: 'amount', label: 'Amount of D3X tokens', required: true }],
        },
      ],
    },
  });
});

// ─── POST /api/action/bet ─────────────────────────────────────────────────────
app.post('/api/action/bet', async (req, res) => {
  try {
    const { account } = req.body;
    const { market: marketPubkeyStr, side, amount } = req.query;

    if (!account || !marketPubkeyStr || !side || !amount) {
      return res.status(400).json({ error: 'Missing required params' });
    }

    const user = new PublicKey(account);
    const marketPubkey = new PublicKey(marketPubkeyStr);
    const connection = getConnection();

    const betSide = side.toLowerCase() === 'yes';
    const betAmount = new anchor.BN(Math.floor(parseFloat(amount) * 1_000_000)); // 6 decimals

    const [protocolPDA] = deriveProtocolPDA();
    const [treasuryVault] = deriveTreasuryPDA();
    const { yesVault, noVault } = deriveVaultPDAs(marketPubkey);
    const [positionPDA] = derivePositionPDA(marketPubkey, user);
    const userTokenAccount = await getAssociatedTokenAddress(D3X_MINT, user);

    // Fetch market to get creator pubkey directly from buffer
    const marketInfo = await connection.getAccountInfo(marketPubkey);
    if (!marketInfo) return res.status(404).json({ error: "Market not found" });
    const creatorPubkey = new PublicKey(marketInfo.data.slice(8, 40));
    
    const creatorVault = await getAssociatedTokenAddress(D3X_MINT, creatorPubkey);

    const coder = new anchor.BorshInstructionCoder(idl);
    const data = coder.encode('placeBet', { side: betSide, amount: betAmount });

    const ix = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: protocolPDA, isSigner: false, isWritable: true },
        { pubkey: marketPubkey, isSigner: false, isWritable: true },
        { pubkey: treasuryVault, isSigner: false, isWritable: true },
        { pubkey: creatorVault, isSigner: false, isWritable: true },
        { pubkey: positionPDA, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: yesVault, isSigner: false, isWritable: true },
        { pubkey: noVault, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data
    });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 });
    const transaction = new Transaction().add(addPriorityFee).add(ix);
    transaction.feePayer = user;
    
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      message: `Betting ${amount} D3X on ${side.toUpperCase()}`,
    });
  } catch (err) {
    console.error('POST /api/action/bet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/action/claim ────────────────────────────────────────────────────
app.get('/api/action/claim', (req, res) => {
  const marketId = req.query.market || '';
  res.json({
    title: 'Claim Your Winnings',
    icon: 'https://ucarecdn.com/7aa7621c-5353-4f24-9134-2e9ea156a05e/-/preview/880x880/-/quality/smart/-/format/auto/',
    description: 'Claim your D3X winnings from a resolved prediction market.',
    label: 'Claim Winnings',
    links: {
      actions: [
        {
          label: 'Claim D3X Winnings',
          href: `/api/action/claim?market=${marketId}`,
        },
      ],
    },
  });
});

// ─── POST /api/action/claim ───────────────────────────────────────────────────
app.post('/api/action/claim', async (req, res) => {
  try {
    const { account } = req.body;
    const { market: marketPubkeyStr } = req.query;

    if (!account || !marketPubkeyStr) {
      return res.status(400).json({ error: 'Missing account or market' });
    }

    const user = new PublicKey(account);
    const marketPubkey = new PublicKey(marketPubkeyStr);
    const connection = getConnection();

    const { yesVault, noVault } = deriveVaultPDAs(marketPubkey);
    const [positionPDA] = derivePositionPDA(marketPubkey, user);
    const userTokenAccount = await getAssociatedTokenAddress(D3X_MINT, user);

    const coder = new anchor.BorshInstructionCoder(idl);
    const data = coder.encode('claimWinnings', {});

    const ix = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: marketPubkey, isSigner: false, isWritable: true },
        { pubkey: positionPDA, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: yesVault, isSigner: false, isWritable: true },
        { pubkey: noVault, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data
    });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 });
    const transaction = new Transaction().add(addPriorityFee).add(ix);
    transaction.feePayer = user;
    
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      message: 'Claiming your D3X winnings',
    });
  } catch (err) {
    console.error('POST /api/action/claim error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/creator/:wallet ─────────────────────────────────────────────────
// Returns all markets created by a given wallet, including earnings per market.
app.get('/api/creator/:wallet', async (req, res) => {
  try {
    const connection = getConnection();
    const creatorPubkey = new PublicKey(req.params.wallet);

    const MARKET_DISCRIMINATOR = [219, 190, 213, 55, 0, 227, 198, 154];
    const filters = [
      { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(Buffer.from(MARKET_DISCRIMINATOR)) } },
      { memcmp: { offset: 8, bytes: creatorPubkey.toBase58() } }
    ];

    const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters });

    let totalEarned = BigInt(0);
    const result = accounts.map(account => {
        let data = account.account.data;
        let offset = 8 + 32; // skip discriminator + creator pubkey
        
        const oracleType = data.readUInt8(offset); offset += 1;
        const oracleAccount = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
        const targetPrice = data.readBigInt64LE(offset); offset += 8;
        const priceDirection = data.readUInt8(offset); offset += 1;
        
        const questionLen = data.readUInt32LE(offset); offset += 4;
        const question = data.slice(offset, offset + questionLen).toString('utf8'); offset += questionLen;
        
        const descLen = data.readUInt32LE(offset); offset += 4;
        const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
        
        const endTimestamp = data.readBigInt64LE(offset); offset += 8;
        const resolutionTimestamp = data.readBigInt64LE(offset); offset += 8;
        
        const statusType = data.readUInt8(offset); offset += 1;
        let statusObj = { active: {} };
        if (statusType === 1) {
             const outcome = data.readUInt8(offset) === 1; offset += 1;
             statusObj = { resolved: { outcome } };
        } else if (statusType === 2) {
             statusObj = { closed: {} };
        }
        
        const totalYes = data.readBigUInt64LE(offset); offset += 8;
        const totalNo = data.readBigUInt64LE(offset); offset += 8;
        const totalFeesCollected = data.readBigUInt64LE(offset); offset += 8;
        const creatorFeeEarned = data.readBigUInt64LE(offset); offset += 8;

        totalEarned += creatorFeeEarned;

        return {
          pubkey: account.pubkey.toBase58(),
          question,
          endTimestamp: Number(endTimestamp),
          status: statusObj,
          totalYes: totalYes.toString(),
          totalNo: totalNo.toString(),
          totalFeesCollected: totalFeesCollected.toString(),
          creatorFeeEarned: creatorFeeEarned.toString(),
        };
    });

    res.json({
      creator: creatorPubkey.toBase58(),
      totalEarned: totalEarned.toString(),
      marketsCount: accounts.length,
      markets: result,
    });
  } catch (err) {
    console.error('GET /api/creator error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/action/withdraw (admin only) ────────────────────────────────────
app.post('/api/action/withdraw', async (req, res) => {
  try {
    const { account, amount } = req.body;
    if (!account || !amount) return res.status(400).json({ error: 'Missing account or amount' });

    const user = new PublicKey(account);
    if (!user.equals(AUTHORITY)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const connection = getConnection();

    const [protocolPDA] = deriveProtocolPDA();
    const [treasuryVault] = deriveTreasuryPDA();
    const ownerTokenAccount = await getAssociatedTokenAddress(D3X_MINT, user);
    const withdrawAmount = new anchor.BN(Math.floor(parseFloat(amount) * 1_000_000));

    const coder = new anchor.BorshInstructionCoder(idl);
    const data = coder.encode('withdrawTreasury', { amount: withdrawAmount });

    const ix = new anchor.web3.TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: protocolPDA, isSigner: false, isWritable: true },
        { pubkey: treasuryVault, isSigner: false, isWritable: true },
        { pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: user, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data
    });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 });
    const transaction = new Transaction().add(addPriorityFee).add(ix);
    transaction.feePayer = user;
    
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhash.blockhash;

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      message: `Withdrawing ${amount} D3X from treasury to your wallet`,
    });
  } catch (err) {
    console.error('POST /api/action/withdraw error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`TweetPredict API running on port ${PORT} (${NETWORK})`);
  console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`D3X Mint:   ${D3X_MINT.toBase58()}`);
});
