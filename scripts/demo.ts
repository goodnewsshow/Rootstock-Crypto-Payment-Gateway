import { ethers } from "hardhat";

/**
 * Full end-to-end demo script — Rootstock Testnet
 *
 * What this script does:
 *   1. Deploys a DemoToken (ERC-20, same interface as RIF) to use for payment
 *   2. Deploys RIFSubscription wired to that token, price = 1 token / 30 days
 *   3. Mints 10 tokens to the deployer wallet
 *   4. Approves the subscription contract to spend 1 token
 *   5. Calls subscribe() — triggers the first payment on-chain
 *   6. Reads back subscription state to confirm it is active
 *
 * The token transfer that happens during subscribe() is a real on-chain ERC-20
 * transferFrom — visible in the explorer under "Token transfers".
 *
 * Run with:
 *   npx hardhat run scripts/demo.ts --network rskTestnet
 */

const PRICE = ethers.parseEther("1"); // 1 token per cycle

function sep(label = "") {
  const line = "━".repeat(54);
  console.log(label ? `\n${line}\n  ${label}\n${line}` : `\n${line}`);
}

async function main() {
  sep("RIFSubscription — Live Testnet Demo");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`\n  Wallet   : ${deployer.address}`);
  console.log(`  RBTC bal : ${ethers.formatEther(balance)} RBTC`);

  // ── 1. Deploy DemoToken ───────────────────────────────────────────────────
  sep("Step 1 — Deploy DemoToken (ERC-20)");
  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const token = await TokenFactory.deploy("Demo Token", "DEMO", 18);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  const tokenTx = token.deploymentTransaction()?.hash;
  console.log(`\n  Token address : ${tokenAddr}`);
  console.log(`  Deploy tx     : ${tokenTx}`);
  console.log(
    `  Explorer      : https://rootstock-testnet.blockscout.com/address/${tokenAddr}`
  );

  // ── 2. Deploy RIFSubscription ─────────────────────────────────────────────
  sep("Step 2 — Deploy RIFSubscription");
  const SubFactory = await ethers.getContractFactory("RIFSubscription");
  const sub = await SubFactory.deploy(tokenAddr, PRICE);
  await sub.waitForDeployment();
  const subAddr = await sub.getAddress();
  const subTx = sub.deploymentTransaction()?.hash;
  console.log(`\n  Contract address : ${subAddr}`);
  console.log(`  Deploy tx        : ${subTx}`);
  console.log(
    `  Explorer         : https://rootstock-testnet.blockscout.com/address/${subAddr}`
  );

  // ── 3. Mint 10 tokens to deployer ─────────────────────────────────────────
  sep("Step 3 — Mint 10 DEMO tokens to wallet");
  const mintAmount = ethers.parseEther("10");
  const mintTx = await token.mint(deployer.address, mintAmount);
  await mintTx.wait();
  const tokenBal = await token.balanceOf(deployer.address);
  console.log(
    `\n  Minted     : ${ethers.formatEther(mintAmount)} DEMO`
  );
  console.log(
    `  Wallet bal : ${ethers.formatEther(tokenBal)} DEMO`
  );
  console.log(`  Mint tx    : ${mintTx.hash}`);

  // ── 4. Approve subscription contract ─────────────────────────────────────
  sep("Step 4 — Approve contract to spend 1 DEMO");
  const approveTx = await token.approve(subAddr, PRICE);
  await approveTx.wait();
  const allowance = await token.allowance(deployer.address, subAddr);
  console.log(
    `\n  Approved   : ${ethers.formatEther(allowance)} DEMO`
  );
  console.log(`  Approve tx : ${approveTx.hash}`);

  // ── 5. Subscribe — first payment ─────────────────────────────────────────
  sep("Step 5 — Call subscribe() — 1 DEMO transferred on-chain");
  const subscribeTx = await sub.subscribe();
  const receipt = await subscribeTx.wait();
  console.log(`\n  Subscribe tx  : ${subscribeTx.hash}`);
  console.log(`  Gas used      : ${receipt?.gasUsed.toLocaleString()}`);
  console.log(
    `  Tx Explorer   : https://rootstock-testnet.blockscout.com/tx/${subscribeTx.hash}`
  );

  // ── 6. Read back subscription state ──────────────────────────────────────
  sep("Step 6 — Verify subscription state");
  const [active, startTime, lastPayment, nextPayment] =
    await sub.getSubscription(deployer.address);
  const contractBal = await token.balanceOf(subAddr);
  const walletBalAfter = await token.balanceOf(deployer.address);

  console.log(`\n  Active             : ${active}`);
  console.log(
    `  Started at         : ${new Date(Number(startTime) * 1000).toISOString()}`
  );
  console.log(
    `  Last payment       : ${new Date(Number(lastPayment) * 1000).toISOString()}`
  );
  console.log(
    `  Next payment due   : ${new Date(Number(nextPayment) * 1000).toISOString()}`
  );
  console.log(`  Contract holds     : ${ethers.formatEther(contractBal)} DEMO`);
  console.log(
    `  Wallet bal after   : ${ethers.formatEther(walletBalAfter)} DEMO (was 10, paid 1)`
  );

  sep("Demo Complete");
  console.log("\n  Summary of deployed contracts:");
  console.log(`  DemoToken (ERC-20)  : ${tokenAddr}`);
  console.log(`  RIFSubscription     : ${subAddr}`);
  console.log(
    `\n  The subscription is ACTIVE. 1 DEMO was transferred from`
  );
  console.log(
    `  the wallet to the contract as the first monthly payment.`
  );
  console.log(
    `\n  After 30 days, anyone can call chargeSubscriber(${deployer.address})`
  );
  console.log(`  to trigger the next payment cycle.\n`);

  return subAddr;
}

main().catch((err) => {
  console.error("\n  Demo FAILED:", err.message ?? err);
  process.exitCode = 1;
});
