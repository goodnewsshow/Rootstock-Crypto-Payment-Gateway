import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithTiersFixture } from "./helpers/fixtures";
import { increaseTime, MONTH, GRACE_PERIOD } from "./helpers/time";

describe("Integration Tests - Complete Workflows", function () {
  it("Complete subscription lifecycle", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    
    // 1. Start subscription
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice * 12n);
    await subscription.connect(user1).startSubscription(1);
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    
    // 2. Process first recurring payment
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    let details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.paymentCount).to.equal(2);
    
    // 3. Miss a payment (insufficient allowance)
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    expect(await subscription.pendingPayments(user1.address)).to.be.gt(0);
    
    // 4. Increase allowance and process pending
    const pendingAmount = await subscription.pendingPayments(user1.address);
    await rifToken.connect(user1).approve(await subscription.getAddress(), pendingAmount);
    await subscription.connect(user1).processPendingPayments();
    details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.paymentCount).to.equal(4);
    
    // 5. Cancel subscription
    await subscription.connect(user1).cancelSubscription();
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
  });

  it("Multiple users with different tiers and price changes", async function () {
    const { subscription, user1, user2, rifToken } = await loadFixture(deployWithTiersFixture);
    
    // User1 subscribes at original price
    await rifToken.connect(user1).approve(await subscription.getAddress(), ethers.parseEther("100"));
    await subscription.connect(user1).startSubscription(1);
    
    // Update price
    await subscription.updateTier(1, "Standard", ethers.parseEther("150"), true, 0);
    
    // User2 subscribes at new price
    await rifToken.connect(user2).approve(await subscription.getAddress(), ethers.parseEther("150"));
    await subscription.connect(user2).startSubscription(1);
    
    // Verify different prices
    const details1 = await subscription.getSubscriptionDetails(user1.address);
    const details2 = await subscription.getSubscriptionDetails(user2.address);
    expect(details1.agreedPrice).to.equal(ethers.parseEther("100"));
    expect(details2.agreedPrice).to.equal(ethers.parseEther("150"));
  });

  it("Grace period and max failed attempts", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithTiersFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    await subscription.connect(user1).startSubscription(1);
    
    // Simulate 3 failed attempts within grace period
    for (let i = 0; i < 3; i++) {
      await increaseTime(MONTH);
      await subscription.connect(user1).processRecurringPayment();
    }
    
    // Should be deactivated after 3 failures
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    const tierDetails = await subscription.getTierDetails(1);
    expect(tierDetails.currentSubscribers).to.equal(0);
  });

  it("Admin controls and emergency pause", async function () {
    const { subscription, owner, user1, user2, rifToken } = await loadFixture(deployWithTiersFixture);
    
    // Setup subscriptions
    await rifToken.connect(user1).approve(await subscription.getAddress(), ethers.parseEther("100"));
    await rifToken.connect(user2).approve(await subscription.getAddress(), ethers.parseEther("500"));
    await subscription.connect(user1).startSubscription(1);
    await subscription.connect(user2).startSubscription(2);
    
    // Admin pauses contract
    await subscription.connect(owner).pause();
    
    // Users can still cancel
    await subscription.connect(user1).cancelSubscription();
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    
    // Admin can deactivate during pause
    await subscription.connect(owner).adminDeactivateSubscription(user2.address);
    expect(await subscription.isSubscriptionActive(user2.address)).to.be.false;
    
    // Admin unpauses
    await subscription.connect(owner).unpause();
    
    // New subscriptions work again
    await rifToken.connect(user1).approve(await subscription.getAddress(), ethers.parseEther("100"));
    await subscription.connect(user1).startSubscription(1);
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
  });

  it("Ownership transfer with contract state preservation", async function () {
    const { subscription, owner, user1, user2, rifToken } = await loadFixture(deployWithTiersFixture);
    
    // Setup initial state
    await rifToken.connect(user1).approve(await subscription.getAddress(), ethers.parseEther("100"));
    await subscription.connect(user1).startSubscription(1);
    
    // Transfer ownership
    await subscription.connect(owner).transferOwnership(user2.address);
    await increaseTime(2 * 24 * 60 * 60 + 1);
    await subscription.connect(user2).acceptOwnership();
    
    // New owner can perform admin functions
    await subscription.connect(user2).createTier("Gold", ethers.parseEther("200"), 0);
    const tier = await subscription.getTierDetails(2);
    expect(tier.name).to.equal("Gold");
    
    // Subscription state preserved
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.tierId).to.equal(1);
  });
});