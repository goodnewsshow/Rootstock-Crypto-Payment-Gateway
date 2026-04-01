import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deploySubscriptionFixture } from "./helpers/fixtures";

describe("Tier Management", function () {
  describe("createTier", function () {
    it("Should create a new tier with correct parameters", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.createTier("Gold", ethers.parseEther("200"), 10);
      const tier = await subscription.tiers(2);
      
      expect(tier.name).to.equal("Gold");
      expect(tier.price).to.equal(ethers.parseEther("200"));
      expect(tier.isActive).to.be.true;
      expect(tier.maxSubscribers).to.equal(10);
    });

    it("Should revert if name is empty", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await expect(
        subscription.createTier("", ethers.parseEther("200"), 0)
      ).to.be.revertedWith("MonthlySubscription: Name cannot be empty");
    });

    it("Should revert if price is zero", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await expect(
        subscription.createTier("Gold", 0, 0)
      ).to.be.revertedWith("MonthlySubscription: Price must be greater than 0");
    });

    it("Should revert if non-owner tries to create tier", async function () {
      const { subscription, user1 } = await loadFixture(deploySubscriptionFixture);
      await expect(
        subscription.connect(user1).createTier("Gold", ethers.parseEther("200"), 0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should emit TierCreated event", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await expect(subscription.createTier("Gold", ethers.parseEther("200"), 10))
        .to.emit(subscription, "TierCreated")
        .withArgs(2, "Gold", ethers.parseEther("200"), 10);
    });
  });

  describe("updateTier", function () {
    beforeEach(async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await subscription.createTier("Gold", ethers.parseEther("200"), 10);
    });

    it("Should update tier name and price", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await subscription.updateTier(2, "Platinum", ethers.parseEther("300"), true, 20);
      const tier = await subscription.tiers(2);
      expect(tier.name).to.equal("Platinum");
      expect(tier.price).to.equal(ethers.parseEther("300"));
      expect(tier.maxSubscribers).to.equal(20);
    });

    it("Should deactivate tier when isActive = false", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await subscription.updateTier(2, "Gold", ethers.parseEther("200"), false, 10);
      const tier = await subscription.tiers(2);
      expect(tier.isActive).to.be.false;
    });

    it("Should revert if tier does not exist", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await expect(
        subscription.updateTier(99, "Invalid", 0, false, 0)
      ).to.be.revertedWith("MonthlySubscription: Tier does not exist");
    });

    it("Should emit TierUpdated event", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await expect(subscription.updateTier(2, "Platinum", ethers.parseEther("300"), true, 20))
        .to.emit(subscription, "TierUpdated")
        .withArgs(2, "Platinum", ethers.parseEther("300"), true, 20);
    });
  });

  describe("getTierDetails", function () {
    beforeEach(async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await subscription.createTier("Gold", ethers.parseEther("200"), 15);
    });

    it("Should return correct tier details", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      const details = await subscription.getTierDetails(2);
      expect(details.name).to.equal("Gold");
      expect(details.price).to.equal(ethers.parseEther("200"));
      expect(details.isActive).to.be.true;
      expect(details.maxSubscribers).to.equal(15);
      expect(details.currentSubscribers).to.equal(0);
    });

    it("Should revert if tier does not exist", async function () {
      const { subscription } = await loadFixture(deploySubscriptionFixture);
      await expect(
        subscription.getTierDetails(99)
      ).to.be.revertedWith("MonthlySubscription: Tier does not exist");
    });
  });
});