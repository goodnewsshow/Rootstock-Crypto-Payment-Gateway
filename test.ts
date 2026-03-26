import { ethers } from "hardhat";

export async function increaseTime(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}

export async function setNextBlockTimestamp(timestamp: number) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine");
}

export async function getCurrentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

export const DAYS = 24 * 60 * 60;
export const MONTH = 30 * DAYS;
export const GRACE_PERIOD = 3 * DAYS;