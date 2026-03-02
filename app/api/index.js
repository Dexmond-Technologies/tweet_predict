const express = require('express');
const cors = require('cors');
const {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
  SystemProgram,
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
const RPC_URL = process.env.RPC_URL || clusterApiUrl(NETWORK);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

/** Read-only Anchor provider (no wallet needed for fetching) */
function getReadProvider() {
  const connection = getConnection();
  return new anchor.AnchorProvider(connection, {
    publicKey: AUTHORITY,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }, { commitment: 'confirmed' });
}

function getProgram(provider) {
  return new anchor.Program(idl, PROGRAM_ID, provider);
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
    const provider = getReadProvider();
    const program = getProgram(provider);
    const markets = await program.account.market.all();
    const result = markets.map((m) => ({
      pubkey: m.publicKey.toBase58(),
      creator: m.account.creator.toBase58(),
      question: m.account.question,
      description: m.account.description,
      endTimestamp: m.account.endTimestamp.toNumber(),
      status: m.account.status,
      totalYes: m.account.totalYes.toString(),
      totalNo: m.account.totalNo.toString(),
      totalFeesCollected: m.account.totalFeesCollected.toString(),
      creatorFeeEarned: m.account.creatorFeeEarned.toString(),
      yesVault: m.account.yesVault.toBase58(),
      noVault: m.account.noVault.toBase58(),
      oracleType: m.account.oracleType,
      targetPrice: m.account.targetPrice.toString(),
      priceDirection: m.account.priceDirection,
    }));
    res.json(result);
  } catch (err) {
    console.error('GET /api/markets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/market/:pubkey ──────────────────────────────────────────────────
app.get('/api/market/:pubkey', async (req, res) => {
  try {
    const provider = getReadProvider();
    const program = getProgram(provider);
    const marketPubkey = new PublicKey(req.params.pubkey);
    const m = await program.account.market.fetch(marketPubkey);

    let statusStr = "Active";
    if (m.status.resolved) {
      statusStr = "Resolved";
    } else if (m.status.closed) {
      statusStr = "Closed";
    }

    res.json({
      pubkey: marketPubkey.toBase58(),
      question: m.question,
      description: m.description,
      endTimestamp: m.endTimestamp.toNumber(),
      status: statusStr,
      totalYes: m.totalYes.toString(),
      totalNo: m.totalNo.toString(),
      yesVault: m.yesVault.toBase58(),
      noVault: m.noVault.toBase58(),
      oracleType: m.oracleType,
      targetPrice: m.targetPrice.toString(),
      priceDirection: m.priceDirection,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/protocol ────────────────────────────────────────────────────────
app.get('/api/protocol', async (req, res) => {
  try {
    const provider = getReadProvider();
    const program = getProgram(provider);
    const [protocolPDA] = deriveProtocolPDA();
    const state = await program.account.protocolState.fetch(protocolPDA);
    res.json({
      authority: state.authority.toBase58(),
      treasuryVault: state.treasuryVault.toBase58(),
      feeBps: state.feeBps,
      totalFeesCollected: state.totalFeesCollected.toString(),
      totalMarketsCreated: state.totalMarketsCreated.toNumber(),
      totalVolume: state.totalVolume.toString(),
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
    const targetPrice = new anchor.BN(req.query.targetPrice || '0');
    const priceDirection = parseInt(req.query.priceDirection || '0', 10);

    if (!account || !question) {
      return res.status(400).json({ error: 'Missing account or question' });
    }

    const user = new PublicKey(account);
    const connection = getConnection();
    const provider = new anchor.AnchorProvider(connection, {
      publicKey: user,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    }, { commitment: 'confirmed' });
    const program = getProgram(provider);

    const endTimestamp = new anchor.BN(
      Math.floor(Date.now() / 1000) + parseInt(endDays) * 86400
    );
    const resolutionWindow = new anchor.BN(7 * 86400); // 7 days to resolve

    const [protocolPDA] = deriveProtocolPDA();
    const [marketPDA] = deriveMarketPDA(question);
    const { yesVault, noVault } = deriveVaultPDAs(marketPDA);

    const questionHash = Array.from(crypto.createHash('sha256').update(question).digest());

    const ix = await program.methods
      .createMarket(questionHash, question, description, endTimestamp, resolutionWindow, oracleType, oracleAccount, targetPrice, priceDirection)
      .accounts({
        protocolState: protocolPDA,
        market: marketPDA,
        yesVault,
        noVault,
        mint: D3X_MINT,
        creator: user,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    transaction.feePayer = user;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const serialized = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    res.json({
      transaction: serialized,
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
    const provider = new anchor.AnchorProvider(connection, {
      publicKey: user,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    }, { commitment: 'confirmed' });
    const program = getProgram(provider);

    const betSide = side.toLowerCase() === 'yes';
    const betAmount = new anchor.BN(Math.floor(parseFloat(amount) * 1_000_000)); // 6 decimals

    const [protocolPDA] = deriveProtocolPDA();
    const [treasuryVault] = deriveTreasuryPDA();
    const { yesVault, noVault } = deriveVaultPDAs(marketPubkey);
    const [positionPDA] = derivePositionPDA(marketPubkey, user);
    const userTokenAccount = await getAssociatedTokenAddress(D3X_MINT, user);

    // Fetch market to get creator pubkey, then derive creator's ATA for the fee split
    const marketAccount = await program.account.market.fetch(marketPubkey);
    const creatorVault = await getAssociatedTokenAddress(D3X_MINT, marketAccount.creator);

    const ix = await program.methods
      .placeBet(betSide, betAmount)
      .accounts({
        protocolState: protocolPDA,
        market: marketPubkey,
        treasuryVault,
        creatorVault,
        position: positionPDA,
        userTokenAccount,
        yesVault,
        noVault,
        user,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    transaction.feePayer = user;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
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
    const provider = new anchor.AnchorProvider(connection, {
      publicKey: user,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    }, { commitment: 'confirmed' });
    const program = getProgram(provider);

    const { yesVault, noVault } = deriveVaultPDAs(marketPubkey);
    const [positionPDA] = derivePositionPDA(marketPubkey, user);
    const userTokenAccount = await getAssociatedTokenAddress(D3X_MINT, user);

    const ix = await program.methods
      .claimWinnings()
      .accounts({
        market: marketPubkey,
        position: positionPDA,
        userTokenAccount,
        yesVault,
        noVault,
        user,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    transaction.feePayer = user;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
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
    const provider = getReadProvider();
    const program = getProgram(provider);
    const creatorPubkey = new PublicKey(req.params.wallet);

    const markets = await program.account.market.all([
      {
        memcmp: {
          offset: 8, // skip discriminator (8 bytes), creator is first field
          bytes: creatorPubkey.toBase58(),
        },
      },
    ]);

    const totalEarned = markets.reduce(
      (sum, m) => sum + BigInt(m.account.creatorFeeEarned.toString()),
      BigInt(0)
    );

    const result = markets.map((m) => ({
      pubkey: m.publicKey.toBase58(),
      question: m.account.question,
      endTimestamp: m.account.endTimestamp.toNumber(),
      status: m.account.status,
      totalYes: m.account.totalYes.toString(),
      totalNo: m.account.totalNo.toString(),
      totalFeesCollected: m.account.totalFeesCollected.toString(),
      creatorFeeEarned: m.account.creatorFeeEarned.toString(),
    }));

    res.json({
      creator: creatorPubkey.toBase58(),
      totalEarned: totalEarned.toString(),
      marketsCount: markets.length,
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
    const provider = new anchor.AnchorProvider(connection, {
      publicKey: user,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    }, { commitment: 'confirmed' });
    const program = getProgram(provider);

    const [protocolPDA] = deriveProtocolPDA();
    const [treasuryVault] = deriveTreasuryPDA();
    const ownerTokenAccount = await getAssociatedTokenAddress(D3X_MINT, user);
    const withdrawAmount = new anchor.BN(Math.floor(parseFloat(amount) * 1_000_000));

    const ix = await program.methods
      .withdrawTreasury(withdrawAmount)
      .accounts({
        protocolState: protocolPDA,
        treasuryVault,
        ownerTokenAccount,
        authority: user,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const transaction = new Transaction().add(ix);
    transaction.feePayer = user;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    res.json({
      transaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
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
