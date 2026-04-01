import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";
import { increaseTime, MONTH } from "./helpers/time";

describe("Pending Payments", function () {
  it("Should store pending payment when allowance insufficient", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    
    expect(await subscription.pendingPayments(user1.address)).to.equal(ethers.parseEther("100"));
  });

  it("Should process pending payments after increasing allowance", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    
    const pendingAmount = await subscription.pendingPayments(user1.address);
    await rifToken.connect(user1).approve(await subscription.getAddress(), pendingAmount);
    
    const initialBalance = await rifToken.balanceOf(await subscription.getAddress());
    await subscription.connect(user1).processPendingPayments();
    const finalBalance = await rifToken.balanceOf(await subscription.getAddress());
    
    expect(finalBalance - initialBalance).to.equal(pendingAmount);
    expect(await subscription.pendingPayments(user1.address)).to.equal(0);
  });

  it("Should emit ManualPaymentProcessed event", async function () {
    const { subscription, user1, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await increaseTime(MONTH);
    await subscription.connect(user1).processRecurringPayment();
    
    const pendingAmount = await subscription.pendingPayments(user1.address);
    await rifToken.connect(user1).approve(await subscription.getAddress(), pendingAmount);
    
    await expect(subscription.connect(user1).processPendingPayments())
      .to.emit(subscription, "ManualPaymentProcessed")
      .withArgs(user1.address, pendingAmount, 2);
  });
});