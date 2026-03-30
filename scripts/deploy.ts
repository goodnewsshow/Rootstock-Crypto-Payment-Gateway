import { ethers } from "hardhat";

// ─── Configuration ────────────────────────────────────────────────────────────

// RIF Token address on Rootstock Testnet
const RIF_TOKEN_TESTNET = "0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE";

// RIF Token address on Rootstock Mainnet
const RIF_TOKEN_MAINNET = "0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D";

// Monthly subscription price: 1 RIF (change this to your desired price)
const SUBSCRIPTION_PRICE = ethers.parseEther("1");

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  RIFSubscription — Deployment Script");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(`  Network  : ${network.name} (chainId ${chainId})`);

  // Resolve the correct RIF token address based on the network
  let rifTokenAddress: string;
  if (chainId === 30) {
    rifTokenAddress = RIF_TOKEN_MAINNET;
    console.log("  Target   : Rootstock MAINNET");
  } else if (chainId === 31) {
    rifTokenAddress = RIF_TOKEN_TESTNET;
    console.log("  Target   : Rootstock TESTNET");
  } else {
    throw new Error(
      `Unsupported network (chainId ${chainId}). Use --network rskMainnet or --network rskTestnet.`
    );
  }

  // Deployer info
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account found.\n\n" +
        "  Set your private key as a Replit Secret:\n" +
        "    Key name : PRIVATE_KEY\n" +
        "    Value    : 0x<your-private-key>\n\n" +
        "  Then re-run: npx hardhat run scripts/deploy.ts --network rskTestnet\n\n" +
        "  Need testnet RBTC? Get some at: https://faucet.rootstock.io"
    );
  }
  const [deployer] = signers;
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(balance)} RBTC`);
  console.log(`  RIF Token: ${rifTokenAddress}`);
  console.log(`  Price    : ${ethers.formatEther(SUBSCRIPTION_PRICE)} RIF / 30 days\n`);

  if (balance === 0n) {
    throw new Error(
      "Deployer has 0 RBTC. Please fund the wallet before deploying.\n" +
        "Testnet faucet: https://faucet.rootstock.io"
    );
  }

  // Deploy
  console.log("  Deploying RIFSubscription...");
  const Factory = await ethers.getContractFactory("RIFSubscription");
  const contract = await Factory.deploy(rifTokenAddress, SUBSCRIPTION_PRICE);

  console.log("  Waiting for transaction to be mined...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deployment successful!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(`  Contract address : ${address}`);
  console.log(`  Transaction hash : ${deployTx?.hash}`);

  const explorerBase =
    chainId === 30 ? "https://explorer.rsk.co" : "https://explorer.testnet.rsk.co";

  console.log(`  Explorer         : ${explorerBase}/address/${address}`);
  console.log(`  Tx Explorer      : ${explorerBase}/tx/${deployTx?.hash}`);

  console.log("\n  Next steps:");
  console.log("  1. Subscribers call RIF.approve(<contract>, <amount>) first");
  console.log("  2. Subscribers call RIFSubscription.subscribe()");
  console.log("  3. After 30 days, anyone calls chargeSubscriber(<address>)");
  console.log("  4. Owner calls withdrawFunds() to collect RIF tokens\n");
}

main().catch((err) => {
  console.error("\n  Deployment FAILED:", err.message ?? err);
  process.exitCode = 1;
});
