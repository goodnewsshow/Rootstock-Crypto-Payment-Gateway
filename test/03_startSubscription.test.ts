import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithTiersFixture } from "./helpers/fixtures";
import { getCurrentTimestamp, MONTH } from "./helpers/time";

describe("Start Subscription", function () {
  it("Should start subscription with correct payment and store agreed price", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    await subscription.connect(user1).startSubscription(1);
    
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.tierId).to.equal(1);
    expect(details.agreedPrice).to.equal(tierPrice);
    expect(details.paymentCount).to.equal(1);
  });

  it("Should increment subscriber count", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    
    const beforeCount = (await subscription.getTierDetails(1)).currentSubscribers;
    expect(beforeCount).to.equal(0);
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    await subscription.connect(user1).startSubscription(1);
    
    const afterCount = (await subscription.getTierDetails(1)).currentSubscribers;
    expect(afterCount).to.equal(1);
  });

  it("Should revert if user already has active subscription", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    await subscription.connect(user1).startSubscription(1);
    
    await expect(
      subscription.connect(user1).startSubscription(2)
    ).to.be.revertedWith("MonthlySubscription: Already have active subscription");
  });

  it("Should revert if tier is inactive", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    await subscription.updateTier(2, "Premium", ethers.parseEther("500"), false, 0);
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), ethers.parseEther("500"));
    await expect(
      subscription.connect(user1).startSubscription(2)
    ).to.be.revertedWith("MonthlySubscription: Tier is not active");
  });

  it("Should enforce subscriber limits", async function () {
    const { subscription, user1, user2, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("5000");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    await subscription.connect(user1).startSubscription(4);
    
    await rifToken.connect(user2).approve(await subscription.getAddress(), tierPrice);
    await expect(
      subscription.connect(user2).startSubscription(4)
    ).to.be.revertedWith("MonthlySubscription: Tier has reached maximum subscribers");
  });

  it("Should set correct nextPaymentDue (startTime + 30 days)", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    const currentTime = await getCurrentTimestamp();
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    const tx = await subscription.connect(user1).startSubscription(1);
    const block = await ethers.provider.getBlock(tx.blockNumber!);
    
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.nextPaymentDue).to.equal(block!.timestamp + MONTH);
  });

  it("Should emit SubscriptionStarted and PaymentProcessed events", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    const tx = await subscription.connect(user1).startSubscription(1);
    const block = await ethers.provider.getBlock(tx.blockNumber!);
    
    await expect(tx)
      .to.emit(subscription, "SubscriptionStarted")
      .withArgs(user1.address, 1, tierPrice, block!.timestamp, tierPrice);
    
    await expect(tx)
      .to.emit(subscription, "PaymentProcessed")
      .withArgs(user1.address, tierPrice, 1, block!.timestamp + MONTH, tierPrice);
  });
});