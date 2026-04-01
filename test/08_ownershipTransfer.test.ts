import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deploySubscriptionFixture } from "./helpers/fixtures";
import { increaseTime, OWNERSHIP_TRANSFER_DELAY } from "./helpers/time";

describe("Two-Step Ownership Transfer", function () {
  describe("Initiating Transfer", function () {
    it("Should allow owner to initiate transfer", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      
      expect(await subscription.getPendingOwner()).to.equal(user1.address);
      const effectiveTime = await subscription.getPendingOwnerEffectiveTime();
      expect(effectiveTime).to.be.gt(0);
    });

    it("Should revert if new owner is zero address", async function () {
      const { subscription, owner } = await loadFixture(deploySubscriptionFixture);
      
      await expect(
        subscription.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("MonthlySubscription: New owner cannot be zero address");
    });

    it("Should emit OwnershipTransferStarted event", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      const tx = await subscription.connect(owner).transferOwnership(user1.address);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      
      await expect(tx)
        .to.emit(subscription, "OwnershipTransferStarted")
        .withArgs(owner.address, user1.address, block!.timestamp + OWNERSHIP_TRANSFER_DELAY);
    });
  });

  describe("Cancelling Transfer", function () {
    it("Should allow owner to cancel pending transfer", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      await subscription.connect(owner).cancelOwnershipTransfer();
      
      expect(await subscription.getPendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("Should revert if no pending transfer", async function () {
      const { subscription, owner } = await loadFixture(deploySubscriptionFixture);
      
      await expect(
        subscription.connect(owner).cancelOwnershipTransfer()
      ).to.be.revertedWith("MonthlySubscription: No pending ownership transfer");
    });

    it("Should emit OwnershipTransferCancelled event", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      
      await expect(subscription.connect(owner).cancelOwnershipTransfer())
        .to.emit(subscription, "OwnershipTransferCancelled")
        .withArgs(owner.address, user1.address);
    });
  });

  describe("Accepting Transfer", function () {
    it("Should allow pending owner to accept after delay", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      await increaseTime(OWNERSHIP_TRANSFER_DELAY + 1);
      await subscription.connect(user1).acceptOwnership();
      
      expect(await subscription.owner()).to.equal(user1.address);
      expect(await subscription.getPendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("Should prevent acceptance before delay", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      
      await expect(
        subscription.connect(user1).acceptOwnership()
      ).to.be.revertedWith("MonthlySubscription: Transfer delay period not yet elapsed");
    });

    it("Should prevent acceptance by non-pending owner", async function () {
      const { subscription, owner, user1, user2 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      await increaseTime(OWNERSHIP_TRANSFER_DELAY + 1);
      
      await expect(
        subscription.connect(user2).acceptOwnership()
      ).to.be.revertedWith("MonthlySubscription: Only pending owner can accept ownership");
    });

    it("Should emit OwnershipTransferred event", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      await increaseTime(OWNERSHIP_TRANSFER_DELAY + 1);
      
      await expect(subscription.connect(user1).acceptOwnership())
        .to.emit(subscription, "OwnershipTransferred")
        .withArgs(owner.address, user1.address);
    });
  });

  describe("Admin Functions After Transfer", function () {
    it("Should allow new owner to perform admin functions", async function () {
      const { subscription, owner, user1, rifToken } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      await increaseTime(OWNERSHIP_TRANSFER_DELAY + 1);
      await subscription.connect(user1).acceptOwnership();
      
      await subscription.connect(user1).createTier("Premium", ethers.parseEther("500"), 0);
      const tier = await subscription.getTierDetails(2);
      expect(tier.name).to.equal("Premium");
      
      await subscription.connect(user1).pause();
      expect(await subscription.paused()).to.be.true;
    });

    it("Should prevent old owner from performing admin functions", async function () {
      const { subscription, owner, user1 } = await loadFixture(deploySubscriptionFixture);
      
      await subscription.connect(owner).transferOwnership(user1.address);
      await increaseTime(OWNERSHIP_TRANSFER_DELAY + 1);
      await subscription.connect(user1).acceptOwnership();
      
      await expect(
        subscription.connect(owner).createTier("Premium", ethers.parseEther("500"), 0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});