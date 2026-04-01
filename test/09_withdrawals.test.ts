import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployWithActiveSubscriptionFixture } from "./helpers/fixtures";

describe("Withdrawals", function () {
  it("Should allow owner to withdraw RIF tokens", async function () {
    const { subscription, owner, rifToken } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    const initialOwnerBalance = await rifToken.balanceOf(owner.address);
    const contractBalance = await subscription.getContractBalance();
    
    await subscription.connect(owner).withdrawTokens();
    
    const finalOwnerBalance = await rifToken.balanceOf(owner.address);
    expect(finalOwnerBalance - initialOwnerBalance).to.equal(contractBalance);
    expect(await subscription.getContractBalance()).to.equal(0);
  });

  it("Should revert if non-owner tries to withdraw", async function () {
    const { subscription, user1 } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await expect(
      subscription.connect(user1).withdrawTokens()
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should revert if no balance to withdraw", async function () {
    const { subscription, owner } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    await subscription.connect(owner).withdrawTokens();
    
    await expect(
      subscription.connect(owner).withdrawTokens()
    ).to.be.revertedWith("MonthlySubscription: No balance to withdraw");
  });

  it("Should emit FundsWithdrawn event", async function () {
    const { subscription, owner } = await loadFixture(deployWithActiveSubscriptionFixture);
    
    const balance = await subscription.getContractBalance();
    await expect(subscription.connect(owner).withdrawTokens())
      .to.emit(subscription, "FundsWithdrawn")
      .withArgs(owner.address, balance);
  });
});