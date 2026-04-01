# Rootstock-Crypto-Payment-Gateway

# Rootstock is the longest running and leading Bitcoin L2.

Developing a Payment Gateway on Rootstock with recurring payment capability with buyer giving permission by using RIF token:

Creating a decentralized payment gateway using time-based smart contracts on Rootstock involves several key steps. As an EVM‑compatible sidechain, Rootstock connects Bitcoin with the broader smart‑contract ecosystem—without changing Bitcoin itself. Rootstock enables complex transactions and DeFi activity that drive network usage maintains an uncompromised security because they are anchored to Bitcoin’s PoW. Rootstock has a merged mining incentive to Bitcoin miners yet as an EVM-compatible sidechain, smart contracts can be deployed to its sidechain. Therefore, it uses the security of Bitcoin and allows deployment of EVM smart contracts for state changes. Rootstock is the longest running Bitcoin L2.

Understanding the Smart Contracts:
Smart contracts are self-executing contracts with the terms of the agreement directly written into code. They automate processes without intermediaries, ensuring transparency and trust. For a payment gateway, a time-based contract can automate payments based on specific conditions.

By following these steps, you can develop a decentralized payment gateway on Rootstock that utilizes time-based smart contracts for automated transactions. This decentralized payment gateway on Rootstock will utilize time-based smart contracts for automated transactions on 30 day  monthly recurring agreement with a merchant. For the purpose of this project, the buyer is purchasing a digital product. Refund after payment is not within the scope of this project.

------------
# Setup Instructions

1. Clone the repository and install dependencies:

bash
git clone <repository-url>
cd monthly-subscription-rootstock
npm install
Configure environment variables:

2. Create you .env

bash
cp .env.example .env

# Edit .env with your private key and RIF token address

3. Compile the contracts and run tests

Compile:

bash
npm run compile

Run tests:

bash
npm run test
npm run test:gas
npm run test:coverage
Deploy to Rootstock testnet:

4. If all tests pass, deploy to the testnet.

bash
npm run deploy:testnet

5. Verify on Rootstock Explorer:

bash
npm run verify -- --network rootstockTestnet <contract-address> <rif-token-address>

# Important Notes

Solidity Version: Uses Solidity 0.8.19 with optimizations enabled

Rootstock Compatibility: Configured for Rootstock testnet (chainId 31) and mainnet (chainId 30)

Gas Settings: Gas price set to 60 MGas (60,000,000 wei) which is typical for Rootstock

Testing: Uses Hardhat's local network with time manipulation helpers

TypeChain: Generates TypeScript typings for contract interactions

Gas Reporter: Optional gas reporting with REPORT_GAS=true npm run test

Coverage: Uses solidity-coverage for test coverage reports

These configuration files provide a complete development environment for the MonthlySubscription contract on Rootstock with RIF token support.


------------
# Careful
# Important Warning

Key Considerations:
1. Once testing on the Rootstock Testnet is complete, you could deploy the smart contract on the Rootstock mainnet.
2. Ensure that the payment gateway can handle transactions securely and efficiently before deploying to the Rootstock mainnet.

Other Key Considerations
Security: Implement security measures to protect against vulnerabilities in the smart contract.
User Experience: Design a user-friendly interface for merchants and customers to interact with the payment gateway. Check out Reown for this.
Compliance: Ensure that the payment gateway adheres to relevant regulations and standards.

Conclusion:

By following these steps, you can develop a decentralized payment gateway on Rootstock that utilizes time-based smart contracts for automated transactions. Enjoy!
