require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const {
  DEPLOYER_PRIVATE_KEY,
  BASE_SEPOLIA_RPC_URL,
  AMOY_RPC_URL,
} = process.env;

const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.30",
  networks: {
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
