# Sentiment Market

A two-sided sentiment trading platform on Base Sepolia. Users deposit ETH to go long or short on a public figure's sentiment, and a custom AMM prices the market based on the weight of capital on each side.

## How it works

The core mechanic is a reserve-based AMM. Two pools — `longReserve` and `shortReserve` — hold ETH deposited by traders. The sentiment index is derived directly from the ratio:

```
price = longReserve / (longReserve + shortReserve)
```

This produces a value between 0 and 1, displayed as a 0–100 index. When more ETH flows into the long side, sentiment rises. When more flows into the short side, it falls. Every trade moves the price.

Positions are tracked per-address with a weighted average entry price. Exits use a midpoint approximation to account for slippage — the price before and after the reserve change are averaged to determine the exit price.

There is no oracle, no external data feed, and no admin key. The market is entirely self-contained: the price is whatever participants collectively make it.

## Architecture

**Smart contract** (`lib/contract.sol`) — A single Solidity contract (`SentimentAMM`) deployed on Base Sepolia. Handles deposits, withdrawals, reserve accounting, average entry tracking, and PnL calculation. All state lives on-chain.

**Frontend** (`app/page.tsx`) — A single-page Next.js app. Connects to the contract via wagmi/viem, reads state with polling, and streams price updates through contract event watching. Includes a live sentiment chart (Recharts), trade interface, position management, and social tabs (comments, holders, activity).

**Key files:**

```
app/
  page.tsx        -- UI: trading interface, chart, social tabs
  layout.tsx      -- root layout, providers
  providers.tsx   -- wagmi + react-query setup
  globals.css     -- Tailwind styles
lib/
  contract.sol    -- SentimentAMM Solidity source
  abi.ts          -- compiled ABI for the contract
  wagmi.ts        -- chain config + contract address
```

## Running locally

Requires Node.js 18+.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Connect a wallet on Base Sepolia. You will need testnet ETH — available from the [Base Sepolia faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet).

## Contract

Deployed on Base Sepolia at `0x7b0E6793b043C4fD8c848ED9E14B71a093c9Bb4d`.

Functions:

| Function | Description |
|---|---|
| `goLong()` | Deposit ETH to open/increase a long position |
| `goShort()` | Deposit ETH to open/increase a short position |
| `closeLong(amount)` | Withdraw ETH by closing long exposure |
| `closeShort(amount)` | Withdraw ETH by closing short exposure |
| `price()` | Current sentiment price (0 to 1e18) |
| `previewLongOpen(amount)` | Simulated price after a long deposit |
| `previewShortOpen(amount)` | Simulated price after a short deposit |

## Stack

- Next.js 16 / React 19
- wagmi 2 + viem 2 (contract interaction)
- Recharts (sentiment chart)
- Tailwind CSS 4
- Solidity 0.8.20

## Disclaimer

This is an experimental project on a testnet. The smart contract is unaudited and not intended for production use or real funds. Use at your own risk.
