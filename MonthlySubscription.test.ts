import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { MonthlySubscription } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Helper functions for time manipulation
async function increaseTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}

const DAYS = 24 * 60 * 60;
const MONTH = 30 * DAYS;

describe("MonthlySubscription", function () {
  let subscription: MonthlySubscription;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  async function deploySubscriptionFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();
    const SubscriptionFactory = await ethers.getContractFactory("MonthlySubscription");
    const subscription = await SubscriptionFactory.deploy();
    await subscription.waitForDeployment();
    
    return { subscription, owner, user1, user2, user3 };
  }

  async function setupActiveSubscriptionFixture() {
    const { subscription, owner, user1, user2, user3 } = await deploySubscriptionFixture();
    
    // Create additional tiers
    await subscription.createTier("Premium", ethers.parseEther("0.05"), 0);
    await subscription.createTier("Pro", ethers.parseEther("0.1"), 5);
    
    const tierPrice = ethers.parseEther("0.01");
    await subscription.connect(user1).startSubscription(1, { value: tierPrice });
    
    return { subscription, owner, user1, user2, user3 };
  }

  describe("Deployment", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(deploySubscriptionFixture);
      subscription = fixture.subscription;
      owner = fixture.owner;
    });

    it("Should set the correct owner", async function () {
      expect(await subscription.owner()).to.equal(owner.address);
    });

    it("Should create a default tier", async function () {
      const tier = await subscription.tiers(1);
      expect(tier.name).to.equal("Standard");
      expect(tier.price).to.equal(ethers.parseEther("0.01"));
      expect(tier.isActive).to.be.true;
      expect(tier.maxSubscribers).to.equal(0);
    });

    it("Should have correct payment interval", async function () {
      expect(await subscription.PAYMENT_INTERVAL()).to.equal(MONTH);
    });

    it("Should have correct grace period", async function () {
      expect(await subscription.gracePeriod()).to.equal(3 * DAYS);
    });

    it("Should start unpaused", async function () {
      expect(await subscription.paused()).to.be.false;
    });
  });

  describe("Tier Management", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(deploySubscriptionFixture);
      subscription = fixture.subscription;
      owner = fixture.owner;
      user1 = fixture.user1;
    });

    it("Should allow owner to create a new tier with subscriber limit", async function () {
      await subscription.createTier("Gold", ethers.parseEther("0.02"), 10);
      const tier = await subscription.tiers(2);
      expect(tier.name).to.equal("Gold");
      expect(tier.price).to.equal(ethers.parseEther("0.02"));
      expect(tier.isActive).to.be.true;
      expect(tier.maxSubscribers).to.equal(10);
    });

    it("Should revert if non-owner tries to create tier", async function () {
      await expect(
        subscription.connect(user1).createTier("Gold", ethers.parseEther("0.02"), 0)
      ).to.be.revertedWith("MonthlySubscription: Only owner can call this function");
    });

    it("Should allow owner to update tier", async function () {
      await subscription.createTier("Gold", ethers.parseEther("0.02"), 0);
      await subscription.updateTier(2, "Platinum", ethers.parseEther("0.03"), true, 20);
      
      const tier = await subscription.tiers(2);
      expect(tier.name).to.equal("Platinum");
      expect(tier.price).to.equal(ethers.parseEther("0.03"));
      expect(tier.maxSubscribers).to.equal(20);
    });
  });

  describe("Start Subscription", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(deploySubscriptionFixture);
      subscription = fixture.subscription;
      owner = fixture.owner;
      user1 = fixture.user1;
    });

    it("Should allow user to start subscription with correct payment", async function () {
      const tierPrice = ethers.parseEther("0.01");
      await subscription.connect(user1).startSubscription(1, { value: tierPrice });
      
      const details = await subscription.getSubscriptionDetails(user1.address);
      expect(details.isActive).to.be.true;
      expect(details.paymentCount).to.equal(1);
      expect(details.price).to.equal(tierPrice);
    });

    it("Should revert if user already has active subscription", async function () {
      const tierPrice = ethers.parseEther("0.01");
      await subscription.connect(user1).startSubscription(1, { value: tierPrice });
      
      await expect(
        subscription.connect(user1).startSubscription(1, { value: tierPrice })
      ).to.be.revertedWith("MonthlySubscription: Already have active subscription");
    });

    it("Should revert if payment amount is incorrect", async function () {
      await expect(
        subscription.connect(user1).startSubscription(1, { value: ethers.parseEther("0.02") })
      ).to.be.revertedWith("MonthlySubscription: Incorrect payment amount");
    });

    it("Should enforce subscriber limits", async function () {
      await subscription.createTier("Limited", ethers.parseEther("0.01"), 1);
      
      await subscription.connect(user1).startSubscription(2, { value: ethers.parseEther("0.01") });
      
      await expect(
        subscription.connect(user2).startSubscription(2, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWith("MonthlySubscription: Tier has reached maximum subscribers");
    });

    it("Should emit SubscriptionStarted event", async function () {
      const tierPrice = ethers.parseEther("0.01");
      await expect(subscription.connect(user1).startSubscription(1, { value: tierPrice }))
        .to.emit(subscription, "SubscriptionStarted")
        .withArgs(user1.address, 1, await ethers.provider.getBlock("latest").then(b => b!.timestamp), tierPrice);
    });
  });

  describe("Recurring Payments", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(setupActiveSubscriptionFixture);
      subscription = fixture.subscription;
      user1 = fixture.user1;
    });

    it("Should process recurring payment after 30 days", async function () {
      const tierPrice = ethers.parseEther("0.01");
      const initialBalance = await ethers.provider.getBalance(await subscription.getAddress());
      
      await increaseTime(MONTH);
      await subscription.connect(user1).processRecurringPayment();
      
      const finalBalance = await ethers.provider.getBalance(await subscription.getAddress());
      expect(finalBalance - initialBalance).to.equal(tierPrice);
      
      const details = await subscription.getSubscriptionDetails(user1.address);
      expect(details.paymentCount).to.equal(2);
    });

    it("Should handle multiple missed payments", async function () {
      const tierPrice = ethers.parseEther("0.01");
      const initialBalance = await ethers.provider.getBalance(await subscription.getAddress());
      
      await increaseTime(MONTH * 3);
      await subscription.connect(user1).processRecurringPayment();
      
      const finalBalance = await ethers.provider.getBalance(await subscription.getAddress());
      expect(finalBalance - initialBalance).to.equal(tierPrice * 3);
      
      const details = await subscription.getSubscriptionDetails(user1.address);
      expect(details.paymentCount).to.equal(4);
    });

    it("Should revert if payment is not due yet", async function () {
      await expect(
        subscription.connect(user1).processRecurringPayment()
      ).to.be.revertedWith("MonthlySubscription: Payment is not due yet");
    });

    it("Should deactivate subscription if insufficient funds", async function () {
      // Send almost all rBTC away to make balance insufficient
      const balance = await ethers.provider.getBalance(user1.address);
      const sendAmount = balance - ethers.parseEther("0.001");
      
      await user1.sendTransaction({
        to: owner.address,
        value: sendAmount
      });
      
      await increaseTime(MONTH);
      await subscription.connect(user1).processRecurringPayment();
      
      const isActive = await subscription.isSubscriptionActive(user1.address);
      expect(isActive).to.be.false;
      
      await expect(
        subscription.getSubscriptionDetails(user1.address)
      ).to.be.revertedWith("MonthlySubscription: No active subscription");
    });

    it("Should emit PaymentProcessed event", async function () {
      await increaseTime(MONTH);
      
      const tierPrice = ethers.parseEther("0.01");
      await expect(subscription.connect(user1).processRecurringPayment())
        .to.emit(subscription, "PaymentProcessed")
        .withArgs(user1.address, tierPrice, 2, await subscription.getSubscriptionDetails(user1.address).then(d => d.nextPaymentDue));
    });
  });

  describe("Cancel Subscription", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(setupActiveSubscriptionFixture);
      subscription = fixture.subscription;
      user1 = fixture.user1;
    });

    it("Should allow user to cancel active subscription", async function () {
      await subscription.connect(user1).cancelSubscription();
      
      const isActive = await subscription.isSubscriptionActive(user1.address);
      expect(isActive).to.be.false;
    });

    it("Should decrement subscriber count on cancel", async function () {
      const tierDetailsBefore = await subscription.getTierDetails(1);
      expect(tierDetailsBefore.currentSubscribers).to.equal(1);
      
      await subscription.connect(user1).cancelSubscription();
      
      const tierDetailsAfter = await subscription.getTierDetails(1);
      expect(tierDetailsAfter.currentSubscribers).to.equal(0);
    });

    it("Should emit SubscriptionDeactivated event", async function () {
      await expect(subscription.connect(user1).cancelSubscription())
        .to.emit(subscription, "SubscriptionDeactivated")
        .withArgs(user1.address, 1, "User cancelled subscription");
    });
  });

  describe("Blacklist Functionality", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(deploySubscriptionFixture);
      subscription = fixture.subscription;
      owner = fixture.owner;
      user1 = fixture.user1;
    });

    it("Should prevent blacklisted user from starting subscription", async function () {
      await subscription.setBlacklist(user1.address, true);
      
      await expect(
        subscription.connect(user1).startSubscription(1, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWith("MonthlySubscription: Address is blacklisted");
    });

    it("Should allow unblacklisting", async function () {
      await subscription.setBlacklist(user1.address, true);
      await subscription.setBlacklist(user1.address, false);
      
      await subscription.connect(user1).startSubscription(1, { value: ethers.parseEther("0.01") });
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    });
  });

  describe("Pause Functionality", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(deploySubscriptionFixture);
      subscription = fixture.subscription;
      owner = fixture.owner;
      user1 = fixture.user1;
    });

    it("Should prevent operations when paused", async function () {
      await subscription.pause();
      
      await expect(
        subscription.connect(user1).startSubscription(1, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWith("MonthlySubscription: Contract is paused");
    });

    it("Should allow operations after unpause", async function () {
      await subscription.pause();
      await subscription.unpause();
      
      await subscription.connect(user1).startSubscription(1, { value: ethers.parseEther("0.01") });
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(setupActiveSubscriptionFixture);
      subscription = fixture.subscription;
      owner = fixture.owner;
      user1 = fixture.user1;
    });

    it("Should allow owner to withdraw contract balance", async function () {
      const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
      const contractBalance = await subscription.getContractBalance();
      
      const tx = await subscription.connect(owner).withdrawBalance();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice!;
      
      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance + gasUsed - initialOwnerBalance).to.equal(contractBalance);
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await expect(
        subscription.connect(user1).withdrawBalance()
      ).to.be.revertedWith("MonthlySubscription: Only owner can call this function");
    });
  });

  describe("Grace Period", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(setupActiveSubscriptionFixture);
      subscription = fixture.subscription;
      user1 = fixture.user1;
    });

    it("Should allow owner to update grace period", async function () {
      await subscription.setGracePeriod(5 * DAYS);
      expect(await subscription.gracePeriod()).to.equal(5 * DAYS);
    });

    it("Should not allow grace period exceeding 30 days", async function () {
      await expect(
        subscription.setGracePeriod(31 * DAYS)
      ).to.be.revertedWith("MonthlySubscription: Grace period cannot exceed 30 days");
    });

    it("Should keep subscription active within grace period", async function () {
      await increaseTime(MONTH + 2 * DAYS); // Within 3-day grace period
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.true;
    });

    it("Should deactivate after grace period", async function () {
      await increaseTime(MONTH + 4 * DAYS); // Beyond 3-day grace period
      expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const fixture = await loadFixture(setupActiveSubscriptionFixture);
      subscription = fixture.subscription;
      user1 = fixture.user1;
    });

    it("Should return correct subscription details", async function () {
      const details = await subscription.getSubscriptionDetails(user1.address);
      
      expect(details.tierId).to.equal(1);
      expect(details.isActive).to.be.true;
      expect(details.paymentCount).to.equal(1);
      expect(details.price).to.equal(ethers.parseEther("0.01"));
      expect(details.tierName).to.equal("Standard");
    });

    it("Should return correct upcoming payment details", async function () {
      const [amount, dueTime] = await subscription.getUpcomingPayment(user1.address);
      expect(amount).to.equal(ethers.parseEther("0.01"));
      expect(dueTime).to.be.gt(0);
    });

    it("Should return correct tier details", async function () {
      const details = await subscription.getTierDetails(1);
      expect(details.name).to.equal("Standard");
      expect(details.price).to.equal(ethers.parseEther("0.01"));
      expect(details.isActive).to.be.true;
      expect(details.currentSubscribers).to.equal(1);
    });
  });

  describe("Receive Function", function () {
    it("Should reject direct ETH transfers", async function () {
      await expect(
        owner.sendTransaction({
          to: await subscription.getAddress(),
          value: ethers.parseEther("1")
        })
      ).to.be.revertedWith("MonthlySubscription: Direct payments not accepted");
    });
  });
});