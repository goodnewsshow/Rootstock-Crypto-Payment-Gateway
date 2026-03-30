import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { RIFSubscription, MockERC20 } from "../typechain-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ONE_RIF = ethers.parseEther("1"); // 1 RIF  (1e18 units)
const FIVE_RIF = ethers.parseEther("5"); // 5 RIF
const THIRTY_DAYS = 30 * 24 * 60 * 60; // 30 days in seconds
const LARGE_ALLOWANCE = ethers.parseEther("1000"); // pre-approved amount for tests

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance the chain by 30 days + 1 second so a billing cycle is definitely due. */
async function advanceBillingCycle(): Promise<void> {
  await time.increase(THIRTY_DAYS + 1);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("RIFSubscription", function () {
  let rifToken: MockERC20;
  let subscription: RIFSubscription;

  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let keeper: SignerWithAddress; // third-party that triggers charges

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  beforeEach(async function () {
    [owner, alice, bob, carol, keeper] = await ethers.getSigners();

    // Deploy mock RIF token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    rifToken = (await MockERC20Factory.deploy("RIF Token", "RIF", 18)) as MockERC20;
    await rifToken.waitForDeployment();

    // Deploy subscription contract with 5 RIF/month
    const SubscriptionFactory = await ethers.getContractFactory("RIFSubscription");
    subscription = (await SubscriptionFactory.deploy(
      await rifToken.getAddress(),
      FIVE_RIF
    )) as RIFSubscription;
    await subscription.waitForDeployment();

    // Fund users with RIF tokens
    await rifToken.mint(alice.address, ethers.parseEther("200"));
    await rifToken.mint(bob.address, ethers.parseEther("200"));
    await rifToken.mint(carol.address, ethers.parseEther("200"));

    // Each user pre-approves the subscription contract
    const subAddress = await subscription.getAddress();
    await rifToken.connect(alice).approve(subAddress, LARGE_ALLOWANCE);
    await rifToken.connect(bob).approve(subAddress, LARGE_ALLOWANCE);
    await rifToken.connect(carol).approve(subAddress, LARGE_ALLOWANCE);
  });

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------

  describe("Deployment", function () {
    it("should set the RIF token address correctly", async function () {
      expect(await subscription.rifToken()).to.equal(await rifToken.getAddress());
    });

    it("should set the subscription price correctly", async function () {
      expect(await subscription.subscriptionPrice()).to.equal(FIVE_RIF);
    });

    it("should set the deployer as owner", async function () {
      expect(await subscription.owner()).to.equal(owner.address);
    });

    it("should set the billing cycle to 30 days", async function () {
      expect(await subscription.BILLING_CYCLE()).to.equal(THIRTY_DAYS);
    });

    it("should revert with zero address for RIF token", async function () {
      const Factory = await ethers.getContractFactory("RIFSubscription");
      await expect(Factory.deploy(ethers.ZeroAddress, FIVE_RIF)).to.be.revertedWith(
        "RIFSubscription: invalid token address"
      );
    });

    it("should revert with zero price", async function () {
      const Factory = await ethers.getContractFactory("RIFSubscription");
      await expect(Factory.deploy(await rifToken.getAddress(), 0)).to.be.revertedWith(
        "RIFSubscription: price must be greater than zero"
      );
    });
  });

  // -------------------------------------------------------------------------
  // subscribe()
  // -------------------------------------------------------------------------

  describe("subscribe()", function () {
    it("should create an active subscription", async function () {
      await subscription.connect(alice).subscribe();
      expect(await subscription.isSubscribed(alice.address)).to.be.true;
    });

    it("should charge the first payment immediately", async function () {
      const balanceBefore = await rifToken.balanceOf(alice.address);
      await subscription.connect(alice).subscribe();
      const balanceAfter = await rifToken.balanceOf(alice.address);
      expect(balanceBefore - balanceAfter).to.equal(FIVE_RIF);
    });

    it("should accumulate payment in the contract", async function () {
      await subscription.connect(alice).subscribe();
      expect(await subscription.contractBalance()).to.equal(FIVE_RIF);
    });

    it("should set nextPaymentTime to ~30 days from now", async function () {
      const tx = await subscription.connect(alice).subscribe();
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const { nextPaymentTime } = await subscription.getSubscription(alice.address);
      expect(nextPaymentTime).to.equal(BigInt(block!.timestamp) + BigInt(THIRTY_DAYS));
    });

    it("should emit Subscribed and PaymentCollected events", async function () {
      await expect(subscription.connect(alice).subscribe())
        .to.emit(subscription, "Subscribed")
        .withArgs(alice.address, anyValue)
        .and.to.emit(subscription, "PaymentCollected")
        .withArgs(alice.address, FIVE_RIF, anyValue);
    });

    it("should revert if already subscribed", async function () {
      await subscription.connect(alice).subscribe();
      await expect(subscription.connect(alice).subscribe()).to.be.revertedWith(
        "RIFSubscription: already subscribed"
      );
    });

    it("should revert if allowance is insufficient", async function () {
      // Revoke alice's allowance — MockERC20 reverts directly with its own message
      await rifToken.connect(alice).approve(await subscription.getAddress(), 0);
      await expect(subscription.connect(alice).subscribe()).to.be.revertedWith(
        "MockERC20: insufficient allowance"
      );
    });

    it("should revert if balance is insufficient", async function () {
      // Drain bob's balance — MockERC20 reverts directly with its own message
      await rifToken.connect(bob).transfer(owner.address, ethers.parseEther("200"));
      await expect(subscription.connect(bob).subscribe()).to.be.revertedWith(
        "MockERC20: insufficient balance"
      );
    });

    it("should add subscriber to the list", async function () {
      await subscription.connect(alice).subscribe();
      const list = await subscription.getSubscriberList();
      expect(list).to.include(alice.address);
    });
  });

  // -------------------------------------------------------------------------
  // cancelSubscription()
  // -------------------------------------------------------------------------

  describe("cancelSubscription()", function () {
    beforeEach(async function () {
      await subscription.connect(alice).subscribe();
    });

    it("should deactivate the subscription", async function () {
      await subscription.connect(alice).cancelSubscription();
      expect(await subscription.isSubscribed(alice.address)).to.be.false;
    });

    it("should emit SubscriptionCancelled", async function () {
      await expect(subscription.connect(alice).cancelSubscription())
        .to.emit(subscription, "SubscriptionCancelled")
        .withArgs(alice.address, anyValue);
    });

    it("should revert if not subscribed", async function () {
      await expect(subscription.connect(bob).cancelSubscription()).to.be.revertedWith(
        "RIFSubscription: no active subscription"
      );
    });

    it("should allow re-subscribing after cancellation", async function () {
      await subscription.connect(alice).cancelSubscription();
      await subscription.connect(alice).subscribe();
      expect(await subscription.isSubscribed(alice.address)).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // chargeSubscriber()
  // -------------------------------------------------------------------------

  describe("chargeSubscriber()", function () {
    beforeEach(async function () {
      await subscription.connect(alice).subscribe();
    });

    it("should revert if billing cycle is not yet due", async function () {
      await expect(subscription.connect(keeper).chargeSubscriber(alice.address)).to.be.revertedWith(
        "RIFSubscription: billing cycle not yet due"
      );
    });

    it("should collect payment after 30 days", async function () {
      await advanceBillingCycle();
      const balanceBefore = await rifToken.balanceOf(alice.address);
      await subscription.connect(keeper).chargeSubscriber(alice.address);
      const balanceAfter = await rifToken.balanceOf(alice.address);
      expect(balanceBefore - balanceAfter).to.equal(FIVE_RIF);
    });

    it("should update lastPaymentTime and nextPaymentTime", async function () {
      await advanceBillingCycle();
      const tx = await subscription.connect(keeper).chargeSubscriber(alice.address);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const { lastPaymentTime, nextPaymentTime } = await subscription.getSubscription(
        alice.address
      );

      expect(lastPaymentTime).to.equal(block!.timestamp);
      expect(nextPaymentTime).to.equal(BigInt(block!.timestamp) + BigInt(THIRTY_DAYS));
    });

    it("should emit PaymentCollected", async function () {
      await advanceBillingCycle();
      await expect(subscription.connect(keeper).chargeSubscriber(alice.address))
        .to.emit(subscription, "PaymentCollected")
        .withArgs(alice.address, FIVE_RIF, anyValue);
    });

    it("should auto-cancel and emit PaymentFailed when allowance is revoked", async function () {
      await advanceBillingCycle();
      await rifToken.connect(alice).approve(await subscription.getAddress(), 0);

      await expect(subscription.connect(keeper).chargeSubscriber(alice.address))
        .to.emit(subscription, "PaymentFailed")
        .withArgs(alice.address, anyValue)
        .and.to.emit(subscription, "SubscriptionCancelled")
        .withArgs(alice.address, anyValue);

      expect(await subscription.isSubscribed(alice.address)).to.be.false;
    });

    it("should auto-cancel when subscriber runs out of tokens", async function () {
      await advanceBillingCycle();
      // drain alice's balance
      await rifToken
        .connect(alice)
        .transfer(owner.address, await rifToken.balanceOf(alice.address));

      await expect(subscription.connect(keeper).chargeSubscriber(alice.address))
        .to.emit(subscription, "PaymentFailed")
        .and.to.emit(subscription, "SubscriptionCancelled");

      expect(await subscription.isSubscribed(alice.address)).to.be.false;
    });

    it("should revert if subscriber has no active subscription", async function () {
      await expect(subscription.connect(keeper).chargeSubscriber(bob.address)).to.be.revertedWith(
        "RIFSubscription: subscriber has no active subscription"
      );
    });

    it("should allow anyone (keeper) to trigger the charge", async function () {
      await advanceBillingCycle();
      // keeper is a random signer unrelated to the subscription
      await expect(subscription.connect(keeper).chargeSubscriber(alice.address)).to.emit(
        subscription,
        "PaymentCollected"
      );
    });

    it("should correctly charge over multiple consecutive billing cycles", async function () {
      const cycles = 3;
      for (let i = 0; i < cycles; i++) {
        await advanceBillingCycle();
        await subscription.connect(keeper).chargeSubscriber(alice.address);
      }
      // Total paid: first payment + 3 renewals = 4 × 5 RIF = 20 RIF
      const contractBalance = await subscription.contractBalance();
      expect(contractBalance).to.equal(FIVE_RIF * BigInt(4));
    });
  });

  // -------------------------------------------------------------------------
  // chargeSubscribers() — batch
  // -------------------------------------------------------------------------

  describe("chargeSubscribers()", function () {
    beforeEach(async function () {
      await subscription.connect(alice).subscribe();
      await subscription.connect(bob).subscribe();
      await subscription.connect(carol).subscribe();
    });

    it("should charge all due subscribers in one transaction", async function () {
      await advanceBillingCycle();
      const balanceBefore = await rifToken.balanceOf(alice.address);

      await subscription
        .connect(keeper)
        .chargeSubscribers([alice.address, bob.address, carol.address]);

      const balanceAfter = await rifToken.balanceOf(alice.address);
      expect(balanceBefore - balanceAfter).to.equal(FIVE_RIF);
      // Contract should now hold 6 payments (3 subscribe + 3 renewals)
      expect(await subscription.contractBalance()).to.equal(FIVE_RIF * 6n);
    });

    it("should skip subscribers whose cycle is not yet due", async function () {
      // Only advance half a billing cycle
      await time.increase(THIRTY_DAYS / 2);
      const balanceBefore = await rifToken.balanceOf(alice.address);

      await subscription
        .connect(keeper)
        .chargeSubscribers([alice.address, bob.address, carol.address]);

      expect(await rifToken.balanceOf(alice.address)).to.equal(balanceBefore);
    });

    it("should skip inactive subscribers", async function () {
      await subscription.connect(bob).cancelSubscription();
      await advanceBillingCycle();

      await subscription
        .connect(keeper)
        .chargeSubscribers([alice.address, bob.address, carol.address]);

      // Bob was cancelled — only alice and carol paid, so 2×initial + 2×renewal = 4 payments
      // But bob's initial was already in, so: 3 initial + 2 renewals (alice + carol) = 5 payments
      expect(await subscription.contractBalance()).to.equal(FIVE_RIF * 5n);
    });

    it("should cancel subscribers who cannot pay during batch charge", async function () {
      await advanceBillingCycle();
      // Drain alice's tokens
      await rifToken
        .connect(alice)
        .transfer(owner.address, await rifToken.balanceOf(alice.address));

      await subscription
        .connect(keeper)
        .chargeSubscribers([alice.address, bob.address, carol.address]);

      expect(await subscription.isSubscribed(alice.address)).to.be.false;
      expect(await subscription.isSubscribed(bob.address)).to.be.true;
      expect(await subscription.isSubscribed(carol.address)).to.be.true;
    });

    it("should emit PaymentFailed for failing subscribers in batch", async function () {
      await advanceBillingCycle();
      await rifToken.connect(alice).approve(await subscription.getAddress(), 0);

      await expect(subscription.connect(keeper).chargeSubscribers([alice.address, bob.address]))
        .to.emit(subscription, "PaymentFailed")
        .withArgs(alice.address, anyValue)
        .and.to.emit(subscription, "PaymentCollected")
        .withArgs(bob.address, FIVE_RIF, anyValue);
    });
  });

  // -------------------------------------------------------------------------
  // timeUntilNextPayment()
  // -------------------------------------------------------------------------

  describe("timeUntilNextPayment()", function () {
    it("should return ~30 days immediately after subscribing", async function () {
      await subscription.connect(alice).subscribe();
      const timeLeft = await subscription.timeUntilNextPayment(alice.address);
      expect(timeLeft).to.be.closeTo(BigInt(THIRTY_DAYS), 5n);
    });

    it("should return 0 once the billing cycle has elapsed", async function () {
      await subscription.connect(alice).subscribe();
      await advanceBillingCycle();
      expect(await subscription.timeUntilNextPayment(alice.address)).to.equal(0n);
    });

    it("should return 0 for non-subscribers", async function () {
      expect(await subscription.timeUntilNextPayment(bob.address)).to.equal(0n);
    });
  });

  // -------------------------------------------------------------------------
  // Owner — withdrawFunds()
  // -------------------------------------------------------------------------

  describe("withdrawFunds()", function () {
    beforeEach(async function () {
      await subscription.connect(alice).subscribe();
      await subscription.connect(bob).subscribe();
    });

    it("should transfer all RIF from the contract to the owner", async function () {
      const ownerBalanceBefore = await rifToken.balanceOf(owner.address);
      await subscription.connect(owner).withdrawFunds();
      const ownerBalanceAfter = await rifToken.balanceOf(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(FIVE_RIF * 2n);
      expect(await subscription.contractBalance()).to.equal(0n);
    });

    it("should emit FundsWithdrawn", async function () {
      await expect(subscription.connect(owner).withdrawFunds())
        .to.emit(subscription, "FundsWithdrawn")
        .withArgs(owner.address, FIVE_RIF * 2n, anyValue);
    });

    it("should revert if called by non-owner", async function () {
      await expect(subscription.connect(alice).withdrawFunds()).to.be.revertedWith(
        "RIFSubscription: caller is not the owner"
      );
    });

    it("should revert if contract has no funds", async function () {
      await subscription.connect(owner).withdrawFunds();
      await expect(subscription.connect(owner).withdrawFunds()).to.be.revertedWith(
        "RIFSubscription: no funds to withdraw"
      );
    });
  });

  // -------------------------------------------------------------------------
  // Owner — setSubscriptionPrice()
  // -------------------------------------------------------------------------

  describe("setSubscriptionPrice()", function () {
    it("should update the subscription price", async function () {
      await subscription.connect(owner).setSubscriptionPrice(ONE_RIF);
      expect(await subscription.subscriptionPrice()).to.equal(ONE_RIF);
    });

    it("should emit PriceUpdated", async function () {
      await expect(subscription.connect(owner).setSubscriptionPrice(ONE_RIF))
        .to.emit(subscription, "PriceUpdated")
        .withArgs(FIVE_RIF, ONE_RIF);
    });

    it("should revert if called by non-owner", async function () {
      await expect(subscription.connect(alice).setSubscriptionPrice(ONE_RIF)).to.be.revertedWith(
        "RIFSubscription: caller is not the owner"
      );
    });

    it("should revert with a zero price", async function () {
      await expect(subscription.connect(owner).setSubscriptionPrice(0)).to.be.revertedWith(
        "RIFSubscription: price must be greater than zero"
      );
    });

    it("should charge the new price on the next billing cycle", async function () {
      await subscription.connect(alice).subscribe();
      const newPrice = ethers.parseEther("10");
      await subscription.connect(owner).setSubscriptionPrice(newPrice);
      // Allow alice extra tokens to cover the new price
      await rifToken
        .connect(alice)
        .approve(await subscription.getAddress(), ethers.parseEther("1000"));
      await advanceBillingCycle();

      const balanceBefore = await rifToken.balanceOf(alice.address);
      await subscription.connect(keeper).chargeSubscriber(alice.address);
      const balanceAfter = await rifToken.balanceOf(alice.address);
      expect(balanceBefore - balanceAfter).to.equal(newPrice);
    });
  });

  // -------------------------------------------------------------------------
  // Owner — transferOwnership()
  // -------------------------------------------------------------------------

  describe("transferOwnership()", function () {
    it("should transfer ownership to a new address", async function () {
      await subscription.connect(owner).transferOwnership(alice.address);
      expect(await subscription.owner()).to.equal(alice.address);
    });

    it("should emit OwnershipTransferred", async function () {
      await expect(subscription.connect(owner).transferOwnership(alice.address))
        .to.emit(subscription, "OwnershipTransferred")
        .withArgs(owner.address, alice.address);
    });

    it("should revert if called by non-owner", async function () {
      await expect(subscription.connect(alice).transferOwnership(bob.address)).to.be.revertedWith(
        "RIFSubscription: caller is not the owner"
      );
    });

    it("should revert with zero address", async function () {
      await expect(
        subscription.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("RIFSubscription: new owner is the zero address");
    });

    it("new owner can withdraw funds", async function () {
      await subscription.connect(alice).subscribe();
      await subscription.connect(owner).transferOwnership(bob.address);
      const balanceBefore = await rifToken.balanceOf(bob.address);
      await subscription.connect(bob).withdrawFunds();
      expect(await rifToken.balanceOf(bob.address)).to.equal(balanceBefore + FIVE_RIF);
    });
  });

  // -------------------------------------------------------------------------
  // Owner — forceCancel()
  // -------------------------------------------------------------------------

  describe("forceCancel()", function () {
    beforeEach(async function () {
      await subscription.connect(alice).subscribe();
    });

    it("should cancel an active subscription", async function () {
      await subscription.connect(owner).forceCancel(alice.address);
      expect(await subscription.isSubscribed(alice.address)).to.be.false;
    });

    it("should emit SubscriptionCancelled", async function () {
      await expect(subscription.connect(owner).forceCancel(alice.address))
        .to.emit(subscription, "SubscriptionCancelled")
        .withArgs(alice.address, anyValue);
    });

    it("should revert if called by non-owner", async function () {
      await expect(subscription.connect(alice).forceCancel(alice.address)).to.be.revertedWith(
        "RIFSubscription: caller is not the owner"
      );
    });

    it("should revert if subscriber is not active", async function () {
      await expect(subscription.connect(owner).forceCancel(bob.address)).to.be.revertedWith(
        "RIFSubscription: subscriber is not active"
      );
    });
  });

  // -------------------------------------------------------------------------
  // getSubscriberList()
  // -------------------------------------------------------------------------

  describe("getSubscriberList()", function () {
    it("should return an empty list initially", async function () {
      expect(await subscription.getSubscriberList()).to.deep.equal([]);
    });

    it("should include all subscribers who ever subscribed", async function () {
      await subscription.connect(alice).subscribe();
      await subscription.connect(bob).subscribe();
      const list = await subscription.getSubscriberList();
      expect(list).to.include(alice.address);
      expect(list).to.include(bob.address);
    });

    it("should keep cancelled subscribers in the historical list", async function () {
      await subscription.connect(alice).subscribe();
      await subscription.connect(alice).cancelSubscription();
      const list = await subscription.getSubscriberList();
      expect(list).to.include(alice.address);
    });
  });

  // -------------------------------------------------------------------------
  // getSubscription()
  // -------------------------------------------------------------------------

  describe("getSubscription()", function () {
    it("should return correct fields for an active subscription", async function () {
      const tx = await subscription.connect(alice).subscribe();
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const { active, startTime, lastPaymentTime, nextPaymentTime } =
        await subscription.getSubscription(alice.address);

      expect(active).to.be.true;
      expect(startTime).to.equal(block!.timestamp);
      expect(lastPaymentTime).to.equal(block!.timestamp);
      expect(nextPaymentTime).to.equal(BigInt(block!.timestamp) + BigInt(THIRTY_DAYS));
    });

    it("should show active=false for a non-subscriber", async function () {
      const { active } = await subscription.getSubscription(bob.address);
      expect(active).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end scenario
  // -------------------------------------------------------------------------

  describe("End-to-end: 3 subscribers, 2 billing cycles", function () {
    it("should correctly handle the full lifecycle", async function () {
      // 1. All three subscribe
      await subscription.connect(alice).subscribe();
      await subscription.connect(bob).subscribe();
      await subscription.connect(carol).subscribe();

      // 2. First renewal — all three should be charged
      await advanceBillingCycle();
      await subscription
        .connect(keeper)
        .chargeSubscribers([alice.address, bob.address, carol.address]);

      expect(await subscription.contractBalance()).to.equal(FIVE_RIF * 6n);

      // 3. Bob cancels
      await subscription.connect(bob).cancelSubscription();

      // 4. Second renewal — only alice and carol should be charged
      await advanceBillingCycle();
      await subscription
        .connect(keeper)
        .chargeSubscribers([alice.address, bob.address, carol.address]);

      // Total: 3 initial + 3 first-renewal + 2 second-renewal = 8 payments
      expect(await subscription.contractBalance()).to.equal(FIVE_RIF * 8n);
      expect(await subscription.isSubscribed(bob.address)).to.be.false;

      // 5. Owner withdraws all funds
      const ownerBalanceBefore = await rifToken.balanceOf(owner.address);
      await subscription.connect(owner).withdrawFunds();
      expect(await rifToken.balanceOf(owner.address)).to.equal(ownerBalanceBefore + FIVE_RIF * 8n);
      expect(await subscription.contractBalance()).to.equal(0n);
    });
  });
});
