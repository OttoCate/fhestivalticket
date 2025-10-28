# ChainFestival Site

## Setup
```bash
pnpm i
pnpm run genabi   # copy deployments/FestivalRegistry.json from hardhat project into ./abi
pnpm dev
```

On the home page:
- Connect wallet (MetaMask)
- Paste `FestivalRegistry` address (from `action/fhevm-hardhat-template/deployments/sepolia/FestivalRegistry.json`)
- On Sepolia, the page loads relayer-sdk UMD, initializes FHEVM instance, and allows:
  - Buy ticket (mint)
  - Assign encrypted seat (encrypt input via relayer instance)
  - Decrypt public seat (demo path)
