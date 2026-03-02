#!/usr/bin/env bash
# ============================================================
# TweetPredict — Deploy Script
# Run this once the devnet airdrop rate-limit clears
# ============================================================
set -e

PROGRAM_KEYPAIR="target/deploy/tweet-predict-keypair.json"
PROGRAM_ID="5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR"
AUTHORITY_KEYPAIR="Solana_wallett/authority-keypair.json"
AUTHORITY="3HPcFBPiMjK4KeJBW8cV8iK5meKZDxmZ5VUfGuss6kyp"
D3X_MINT="AGN8SrMCMEgiP1ghvPHa5VRf5rPFDSYVrGFyBGE1Cqpa"
NETWORK="${1:-devnet}"  # Pass "mainnet-beta" as $1 for mainnet

echo "🌐 Deploying to: $NETWORK"
echo "📦 Program ID:   $PROGRAM_ID"
echo "👛 Authority:    $AUTHORITY"
echo ""

# 1. Set network
solana config set --url "$NETWORK"
solana config set --keypair "$AUTHORITY_KEYPAIR"

# 2. Check/fund balance (devnet only)
if [ "$NETWORK" = "devnet" ]; then
  echo "💧 Requesting devnet airdrop..."
  solana airdrop 4 "$AUTHORITY" --url devnet || echo "⚠️  Airdrop rate-limited, continuing..."
  sleep 2
  BALANCE=$(solana balance "$AUTHORITY" --url devnet | awk '{print $1}')
  echo "💰 Authority balance: $BALANCE SOL"
fi

# 3. Deploy program
echo ""
echo "🚀 Deploying program..."
solana program deploy \
  target/deploy/tweet_predict.so \
  --program-id "$PROGRAM_KEYPAIR" \
  --url "$NETWORK"

echo ""
echo "✅ Program deployed! ID: $PROGRAM_ID"
echo ""

# 4. Initialize protocol (only run ONCE — will fail if already initialized)
echo "⚙️  To initialize the protocol, run this in Node.js:"
cat << 'EOF'
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
const idl = require("./app/api/idl.json");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("5pEnm6PoweBNFxjS8wTRUa63rn1ux8ab3ezsUjCV8UeR");
const D3X_MINT = new PublicKey("AGN8SrMCMEgiP1ghvPHa5VRf5rPFDSYVrGFyBGE1Cqpa");

// Load your authority keypair (the one with SOL)
const keypairFile = fs.readFileSync("Solana_wallett/authority-keypair.json");
const authority = Keypair.fromSecretKey(new Uint8Array(JSON.parse(keypairFile)));

// The Oracle Public Key (auto-generated for you)
const ORACLE_PUBKEY = new PublicKey("77ULqhJ1wQeeaYCYK46kX1WEDs3qEQ5uRBWMZQTx1aJP");

const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), "confirmed");
const wallet = new anchor.Wallet(authority);
const provider = new anchor.AnchorProvider(connection, wallet, {});
const program = new anchor.Program(idl, PROGRAM_ID, provider);

const [protocolPDA] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], PROGRAM_ID);
const [treasuryVault] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID);

(async () => {
  const tx = await program.methods
    .initializeProtocol(200, ORACLE_PUBKEY) // 200 bps = 2% fee, ORACLE_PUBKEY is the designated resolver
    .accounts({
      protocolState: protocolPDA,
      treasuryVault: treasuryVault,
      mint: D3X_MINT,
      authority: authority.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: require("@solana/spl-token").TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log("✅ Protocol initialized! TX:", tx);
  console.log("  Protocol state:", protocolPDA.toBase58());
  console.log("  Treasury vault:", treasuryVault.toBase58());
})();
EOF

echo ""
echo "🎉 Done! Next steps:"
echo "  1. Run the init script above (node init-protocol.js)"
echo "  2. Start API:      cd app/api && npm start"
echo "  3. Start frontend: cd app/frontend && npm run dev"
echo "  4. Open http://localhost:3000 and connect Phantom (set to $NETWORK)"
