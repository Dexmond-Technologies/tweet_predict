# TweetPredict Solana Wallets

This folder contains the two distinct Solana wallets required to operate the TweetPredict prediction market. **Keep both of these `.json` files secure and DO NOT commit them to a public GitHub repository!**

## 1. Authority Wallet (`authority-keypair.json`)
*   **Public Key:** `3HPcFBPiMjK4KeJBW8cV8iK5meKZDxmZ5VUfGuss6kyp`
*   **Role:** The "Owner" or "Admin" of the protocol.
*   **Purpose:** 
    *   This wallet pays the Solana network fees to **deploy** the smart contract via `deploy.sh`.
    *   This wallet is set as the global `authority` of the protocol during initialization.
    *   Only this wallet can call the smart contract to **withdraw collected fees** from the protocol treasury.
*   **Next Steps:** You must fund this wallet with Devnet SOL (or Mainnet SOL eventually) before running `deploy.sh`.

## 2. Oracle Wallet (`oracle-keypair.json`)
*   **Public Key:** `77ULqhJ1wQeeaYCYK46kX1WEDs3qEQ5uRBWMZQTx1aJP`
*   **Role:** The automated data feed (the "Bot").
*   **Purpose:**
    *   During deployment, the smart contract saves this public key as the one and only trusted `oracle`.
    *   When your backend server (bot) detects that a tweet prediction has finished, your bot uses this private key to sign the `resolve_market` transaction on the blockchain.
    *   **No one else** can resolve markets except for whichever backend script holds this `oracle-keypair.json`.
*   **Next Steps:** You will need to write a backend script (e.g., using Node.js/TypeScript) that uses this `.json` file to sign resolution transactions automatically. You will also need to fund this wallet with a small amount of SOL so it can pay the transaction fee to resolve the markets.
