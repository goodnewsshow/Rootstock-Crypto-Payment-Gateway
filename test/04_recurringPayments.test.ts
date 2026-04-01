import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";
import { increaseTime, MONTH, GRACE_PERIOD, getCurrentTimestamp } from "./helpers/time";

describe("Recurring Payments", function () {
  it("Should process payment after 30 days", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice * 12n);
    const initialBalance = await rifToken.balanceOf(await subscription.getAddress());
    
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    
    const finalBalance = await rifToken.balanceOf(await subscription.getAddress());
    expect(finalBalance - initialBalance).to.equal(tierPrice);
    
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.paymentCount).to.equal(2);
  });

  it("Should handle multiple missed payments", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice * 12n);
    const initialBalance = await rifToken.balanceOf(await subscription.getAddress());
    
    await increaseTime(MONTH * 3);
    await subscription.connect(user1).processRecurringPayment();
    
    const finalBalance = await rifToken.balanceOf(await subscription.getAddress());
    expect(finalBalance - initialBalance).to.equal(tierPrice * 3);
    
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.paymentCount).to.equal(4);
  });

  it("Should use stored agreed price for payments", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    const originalPrice = ethers.parseEther("100");
    const newPrice = ethers.parseEther("150");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), originalPrice * 12n);
    await subscription.updateTier(1, "Standard", newPrice, true, 0);
    
    const initialBalance = await rifToken.balanceOf(await subscription.getAddress());
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    
    const finalBalance = await rifToken.balanceOf(await subscription.getAddress());
    expect(finalBalance - initialBalance).to.equal(originalPrice);
  });

  it("Should increment failed attempts when allowance insufficient", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.failedPaymentAttempts).to.equal(1);
    expect(await subscription.pendingPayments(user1.address)).to.equal(ethers.parseEther("100"));
  });

  it("Should deactivate after MAX_FAILED_PAYMENTS attempts", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    for (let i = 0; i < 3; i++) {
      await increaseTime(MONTH);
      await subscription.connect(user1).processRecurringPayment();
    }
    
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    const tierDetails = await subscription.getTierDetails(1);
    expect(tierDetails.currentSubscribers).to.equal(0);
  });

  it("Should process payment during grace period", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    const initialBalance = await rifToken.balanceOf(await subscription.getAddress());
    
    await increaseTime(MONTH + 2 * 24 * 60 * 60);
    await subscription.connect(user1).processRecurringPayment();
    
    const finalBalance = await rifToken.balanceOf(await subscription.getAddress());
    expect(finalBalance - initialBalance).to.equal(tierPrice);
  });

  it("Should deactivate after grace period ends", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await increaseTime(MONTH + GRACE_PERIOD + 1);
    await subscription.connect(user1).processRecurringPayment();
    
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
  });

  it("Should emit GracePeriodPaymentAttempt event", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    const tierPrice = ethers.parseEther("100");
    
    await rifToken.connect(user1).approve(await subscription.getAddress(), tierPrice);
    const details = await subscription.getSubscriptionDetails(user1.address);
    await increaseTime(MONTH + 2 * 24 * 60 * 60);
    
    await expect(subscription.connect(user1).processRecurringPayment())
      .to.emit(subscription, "GracePeriodPaymentAttempt")
      .withArgs(user1.address, details.nextPaymentDue, details.nextPaymentDue + GRACE_PERIOD);
  });
});