# Test Results — RIFSubscription Smart Contract

## Summary

**60 tests passing, 0 failing** (run on Hardhat local network)

```
  RIFSubscription
    Deployment                                      6 tests  ✔
    subscribe()                                     8 tests  ✔
    cancelSubscription()                            4 tests  ✔
    chargeSubscriber()                              8 tests  ✔
    chargeSubscribers() — batch                     5 tests  ✔
    timeUntilNextPayment()                          3 tests  ✔
    withdrawFunds()                                 4 tests  ✔
    setSubscriptionPrice()                          5 tests  ✔
    transferOwnership()                             5 tests  ✔
    forceCancel()                                   4 tests  ✔
    getSubscriberList()                             3 tests  ✔
    getSubscription()                               2 tests  ✔
    End-to-end: 3 subscribers, 2 billing cycles     1 test   ✔

  60 passing (5s)
```

---

## Security Scan Results

### Dependency Audit (npm audit)

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 0     | No critical vulnerabilities |
| High     | 6     | Dev-only Hardhat toolchain (serialize-javascript, undici, mocha) — not in production |
| Moderate | 13    | Dev-only toolchain (lodash, hardhat internals) |
| Low      | 1     | Dev-only |

> All high/moderate findings are in **devDependencies** (Hardhat testing toolchain only).
> None of these packages are deployed on-chain or used in the smart contract runtime.

### SAST Scan

| Severity | Finding | Location |
|----------|---------|----------|
| Medium   | `unsafe-dynamic-method` | `artifacts/mockup-sandbox/src/App.tsx` (Replit canvas sandbox — unrelated to smart contracts) |

> **No SAST findings in any Solidity contract file.**

### HoundDog (Privacy / Data Flow Scan)

| Result |
|--------|
| No vulnerabilities found |

### Prettier (Code Formatting)

All Solidity contracts formatted with `prettier-plugin-solidity@1.4.3`:

- `src/interfaces/IERC20.sol` — formatted
- `src/RIFSubscription.sol` — formatted
- `src/test/MockERC20.sol` — formatted (unchanged)

TypeScript files formatted with `prettier@3`:

- `test/RIFSubscription.ts` — formatted
- `scripts/deploy.ts` — formatted
- `hardhat.config.ts` — formatted

---

## Deployed Contract

| Field | Value |
|-------|-------|
| Network | Rootstock Testnet (chainId 31) |
| Contract Address | `0x678018400f55463992dc7ff9dBaD7f0DA3dDDa6F` |
| Transaction Hash | `0x92ee7bcfa154af0d784b8a51228a17a58836c3e236809ee5455104cbf4df2eef` |
| RIF Token (Testnet) | `0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE` |
| Subscription Price | 1 RIF / 30 days |
| Deployer | `0x54Ce5879fBE1618536359B18Fa64fD7875F110A2` |

Explorer links:
- Contract: https://explorer.testnet.rsk.co/address/0x678018400f55463992dc7ff9dBaD7f0DA3dDDa6F
- Transaction: https://explorer.testnet.rsk.co/tx/0x92ee7bcfa154af0d784b8a51228a17a58836c3e236809ee5455104cbf4df2eef
