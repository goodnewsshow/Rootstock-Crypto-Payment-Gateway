import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deploySubscriptionFixture } from "./helpers/fixtures";
import { MONTH, GRACE_PERIOD, OWNERSHIP_TRANSFER_DELAY } from "./helpers/time";

describe("MonthlySubscription - Deployment", function () {
  it("Should set the correct owner", async function () {
    const { subscription, owner } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.owner()).to.equal(owner.address);
  });

  it("Should create a default tier with ID 1", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    const tier = await subscription.tiers(1);
    expect(tier.name).to.equal("Standard");
    expect(tier.price).to.equal(ethers.parseEther("100"));
    expect(tier.isActive).to.be.true;
    expect(tier.maxSubscribers).to.equal(0);
    expect(tier.currentSubscribers).to.equal(0);
  });

  it("Should set correct PAYMENT_INTERVAL constant", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.PAYMENT_INTERVAL()).to.equal(MONTH);
  });

  it("Should set correct MAX_FAILED_PAYMENTS constant", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.MAX_FAILED_PAYMENTS()).to.equal(3);
  });

  it("Should set correct initial grace period", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.gracePeriod()).to.equal(GRACE_PERIOD);
  });

  it("Should start with paused = false", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.paused()).to.be.false;
  });

  it("Should have zero contract balance initially", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.getContractBalance()).to.equal(0);
  });

  it("Should have no pending ownership transfer", async function () {
    const { subscription } = await loadFixture(deploySubscriptionFixture);
    expect(await subscription.getPendingOwner()).to.equal(ethers.ZeroAddress);
    expect(await subscription.getPendingOwnerEffectiveTime()).to.equal(0);
  });
});