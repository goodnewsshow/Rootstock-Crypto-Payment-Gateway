import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {},
    rskMainnet: {
      url: "https://public-node.rsk.co",
      chainId: 30,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    rskTestnet: {
      url: "https://public-node.testnet.rsk.co",
      chainId: 31,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      rskTestnet: "blockscout",
      rskMainnet: "blockscout",
    },
    customChains: [
      {
        network: "rskTestnet",
        chainId: 31,
        urls: {
          apiURL: "https://rootstock-testnet.blockscout.com/api",
          browserURL: "https://rootstock-testnet.blockscout.com",
        },
      },
      {
        network: "rskMainnet",
        chainId: 30,
        urls: {
          apiURL: "https://rootstock.blockscout.com/api",
          browserURL: "https://rootstock.blockscout.com",
        },
      },
    ],
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
