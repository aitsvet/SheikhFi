require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const {
  DEPLOYER_PRIVATE_KEY,
  BASE_SEPOLIA_RPC_URL,
  AMOY_RPC_URL,
  ETHERSCAN_API_KEY,
} = process.env;

const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // the 15-field Proposal getter blows the plain-codegen stack
      viaIR: true,
    },
  },
  // hardhat-verify ships with @nomicfoundation/hardhat-toolbox;
  // an Etherscan V2 key covers Base Sepolia as well.
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || '',
  },
  networks: {
    localhost: {
      url: process.env.LOCALHOST_RPC_URL || 'http://127.0.0.1:8545',
      chainId: 31337,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      chainId: 84532,
      accounts,
    },
    amoy: {
      url: AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
      chainId: 80002,
      accounts,
    },
  },
};
