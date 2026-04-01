import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithMultipleSubscriptionsFixture } from "./helpers/fixtures";
import { increaseTime, MONTH } from "./helpers/time";

describe("View Functions", function () {
  describe("isSubscriptionActive", function () {
    it("Should return true for active subscription", async function () {
      const { subscription, user1 } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    });

    it("Should return true within grace period", async function () {
      const { subscription, user1 } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      
      await increaseTime(MONTH + 2 * 24 * 60 * 60);
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    });

    it("Should return false after grace period", async function () {
      const { subscription, user1 } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      
      await increaseTime(MONTH + 4 * 24 * 60 * 60);
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    });
  });

  describe("getSubscriptionDetails", function () {
    it("Should return correct details for active subscription", async function () {
      const { subscription, user1 } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      
      const details = await subscription.getSubscriptionDetails(user1.address);
      expect(details.tierId).to.equal(1);
      expect(details.isActive).to.be.true;
      expect(details.paymentCount).to.equal(1);
      expect(details.agreedPrice).to.equal(ethers.parseEther("100"));
      expect(details.currentPrice).to.equal(ethers.parseEther("100"));
      expect(details.tierName).to.equal("Standard");
    });
  });

  describe("getUpcomingPayment", function () {
    it("Should return correct upcoming payment details", async function () {
      const { subscription, user1 } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      
      const [amount, dueTime, requiredAllowance, gracePeriodEnd, agreedPrice, currentPrice] = 
        await subscription.getUpcomingPayment(user1.address);
      
      expect(amount).to.equal(ethers.parseEther("100"));
      expect(dueTime).to.be.gt(0);
      expect(agreedPrice).to.equal(ethers.parseEther("100"));
    });
  });

  describe("getRemainingGracePeriod", function () {
    it("Should return correct remaining grace period", async function () {
      const { subscription, user1 } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      
      await increaseTime(MONTH + 1 * 24 * 60 * 60);
      const remaining = await subscription.getRemainingGracePeriod(user1.address);
      expect(remaining).to.equal(2 * 24 * 60 * 60);
    });
  });

  describe("getTotalActiveSubscribers", function () {
    it("Should return correct total across all tiers", async function () {
      const { subscription } = await loadFixture(deployWithMultipleSubscriptionsFixture);
      expect(await subscription.getTotalActiveSubscribers()).to.equal(3);
    });
  });
});