import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";

describe("Upgrade to Current Price", function () {
  it("Should allow upgrade to higher price", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    const newPrice = ethers.parseEther("150");
    
    await subscription.updateTier(1, "Standard", newPrice, true, 0);
    await subscription.connect(user1).upgradeToCurrentPrice();
    
    const details = await subscription.getSubscriptionDetails(user1.address);
    expect(details.agreedPrice).to.equal(newPrice);
  });

  it("Should prevent downgrade to lower price", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    const lowerPrice = ethers.parseEther("75");
    
    await subscription.updateTier(1, "Standard", lowerPrice, true, 0);
    
    await expect(
      subscription.connect(user1).upgradeToCurrentPrice()
    ).to.be.revertedWith("MonthlySubscription: Cannot downgrade price automatically");
  });

  it("Should prevent upgrade if already at current price", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await expect(
      subscription.connect(user1).upgradeToCurrentPrice()
    ).to.be.revertedWith("MonthlySubscription: Already at current price");
  });

  it("Should emit PriceChangeNotified event on upgrade", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    const oldPrice = ethers.parseEther("100");
    const newPrice = ethers.parseEther("150");
    
    await subscription.updateTier(1, "Standard", newPrice, true, 0);
    
    await expect(subscription.connect(user1).upgradeToCurrentPrice())
      .to.emit(subscription, "PriceChangeNotified")
      .withArgs(user1.address, oldPrice, newPrice, true);
  });
});