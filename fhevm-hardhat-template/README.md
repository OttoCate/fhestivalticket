# ChainFestival FHEVM Hardhat Template

## Prerequisites
- Node.js LTS
- pnpm or npm
- Sepolia RPC endpoint and a funded deployer private key

## Setup
```bash
pnpm i
cp .env.example .env
# Edit .env and set SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY (optional)
```

## Build & Test
```bash
pnpm build
pnpm test
```

## Local node
```bash
pnpm node
# in another terminal
pnpm deploy:localhost
```

## Deploy to Sepolia
```bash
pnpm deploy:sepolia
```

The script writes deployments to `deployments/<network>/FestivalRegistry.json` including `address`, `chainId`, and `abi`, which the frontend will consume.
