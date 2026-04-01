import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";
import { increaseTime, MONTH } from "./helpers/time";

describe("Blacklist Functionality", function () {
  describe("Blacklist Management", function () {
    it("Should allow owner to blacklist address", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).setBlacklist(user1.address, true);
      expect(await subscription.isUserBlacklisted(user1.address)).to.be.true;
    });

    it("Should allow owner to unblacklist address", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).setBlacklist(user1.address, true);
      await subscription.connect(owner).setBlacklist(user1.address, false);
      expect(await subscription.isUserBlacklisted(user1.address)).to.be.false;
    });

    it("Should emit BlacklistUpdated event", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await expect(subscription.connect(owner).setBlacklist(user1.address, true))
        .to.emit(subscription, "BlacklistUpdated")
        .withArgs(user1.address, true);
    });
  });

  describe("Blacklisted User Restrictions", function () {
    it("Should prevent blacklisted user from starting subscription", async function () {
      const { subscription, owner, user2, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).setBlacklist(user2.address, true);
      await rifToken.connect(user2).approve(await subscription.getAddress(), ethers.parseEther("100"));
      
      await expect(
        subscription.connect(user2).startSubscription(1)
      ).to.be.revertedWith("MonthlySubscription: Address is blacklisted");
    });

    it("Should prevent blacklisted user from processing payments", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).setBlacklist(user1.address, true);
      await increaseTime(MONTH);
      
      await expect(
        subscription.connect(user1).processRecurringPayment()
      ).to.be.revertedWith("MonthlySubscription: Address is blacklisted");
    });

    it("Should allow blacklisted user to cancel subscription", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).setBlacklist(user1.address, true);
      await subscription.connect(user1).cancelSubscription();
      
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    });

    it("Should emit BlacklistedUserCancelled event", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).setBlacklist(user1.address, true);
      
      await expect(subscription.connect(user1).cancelSubscription())
        .to.emit(subscription, "BlacklistedUserCancelled")
        .withArgs(user1.address, 1);
    });
  });
});