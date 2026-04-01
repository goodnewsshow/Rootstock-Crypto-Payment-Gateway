import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";
import { increaseTime, MONTH } from "./helpers/time";

describe("Pause Functionality", function () {
  describe("Pause Control", function () {
    it("Should allow owner to pause contract", async function () {
      const { subscription, owner } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      expect(await subscription.paused()).to.be.true;
    });

    it("Should allow owner to unpause contract", async function () {
      const { subscription, owner } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      await subscription.connect(owner).unpause();
      expect(await subscription.paused()).to.be.false;
    });

    it("Should emit EmergencyPaused and EmergencyUnpaused events", async function () {
      const { subscription, owner } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await expect(subscription.connect(owner).pause())
        .to.emit(subscription, "EmergencyPaused")
        .withArgs(owner.address);
      
      await expect(subscription.connect(owner).unpause())
        .to.emit(subscription, "EmergencyUnpaused")
        .withArgs(owner.address);
    });
  });

  describe("Operations Blocked During Pause", function () {
    it("Should prevent starting new subscription", async function () {
      const { subscription, owner, user2, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      await rifToken.connect(user2).approve(await subscription.getAddress(), ethers.parseEther("100"));
      
      await expect(
        subscription.connect(user2).startSubscription(1)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should prevent processing recurring payments", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      await increaseTime(MONTH);
      
      await expect(
        subscription.connect(user1).processRecurringPayment()
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should prevent processing pending payments", async function () {
      const { subscription, owner, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await increaseTime(MONTH);
      await subscription.connect(user1).processRecurringPayment();
      
      const pendingAmount = await subscription.pendingPayments(user1.address);
      await rifToken.connect(user1).approve(await subscription.getAddress(), pendingAmount);
      
      await subscription.connect(owner).pause();
      
      await expect(
        subscription.connect(user1).processPendingPayments()
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Operations Allowed During Pause", function () {
    it("Should allow user to cancel subscription during pause", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      await subscription.connect(user1).cancelSubscription();
      
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    });

    it("Should emit CancellationDuringPause event", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      
      await expect(subscription.connect(user1).cancelSubscription())
        .to.emit(subscription, "CancellationDuringPause")
        .withArgs(user1.address, 1);
    });

    it("Should allow admin to deactivate subscription during pause", async function () {
      const { subscription, owner, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
      
      await subscription.connect(owner).pause();
      await subscription.connect(owner).adminDeactivateSubscription(user1.address);
      
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    });
  });
});