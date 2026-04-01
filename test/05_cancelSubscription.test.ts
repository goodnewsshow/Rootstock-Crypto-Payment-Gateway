import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";
import { increaseTime, MONTH } from "./helpers/time";

describe("Cancel Subscription", function () {
  it("Should cancel active subscription", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await subscription.connect(user1).cancelSubscription();
    expect(await subscription.isSubscriptionActive(user1.address)).to.be.false;
  });

  it("Should decrement subscriber count", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    const beforeCount = (await subscription.getTierDetails(1)).currentSubscribers;
    expect(beforeCount).to.equal(1);
    
    await subscription.connect(user1).cancelSubscription();
    
    const afterCount = (await subscription.getTierDetails(1)).currentSubscribers;
    expect(afterCount).to.equal(0);
  });

  it("Should clear pending payments on cancellation", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    expect(await subscription.pendingPayments(user1.address)).to.be.gt(0);
    
    await subscription.connect(user1).cancelSubscription();
    expect(await subscription.pendingPayments(user1.address)).to.equal(0);
  });

  it("Should revert if no active subscription", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await subscription.connect(user1).cancelSubscription();
    await expect(
      subscription.connect(user1).cancelSubscription()
    ).to.be.revertedWith("MonthlySubscription: No active subscription found");
  });

  it("Should emit SubscriptionCancelled and SubscriptionDeactivated events", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    const tx = await subscription.connect(user1).cancelSubscription();
    
    await expect(tx)
      .to.emit(subscription, "SubscriptionCancelled")
      .withArgs(user1.address, 1, "User cancelled subscription");
    
    await expect(tx)
      .to.emit(subscription, "SubscriptionDeactivated")
      .withArgs(user1.address, 1, "User cancelled subscription");
  });
});