// Per-chain metadata used by the UI and the MetaMask switch-chain prompt.
// Keep keys numeric (chainId) for direct lookup.
export const NETWORKS = {
  84532: {
    chainId: 84532,
    chainIdHex: '0x14a34',
    name: 'Base Sepolia',
    sub: 'Islamic DeFi · Base Sepolia',
    explorer: 'https://sepolia.basescan.org',
    rpcUrls: ['https://sepolia.base.org'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  80002: {
    chainId: 80002,
    chainIdHex: '0x13882',
    name: 'Polygon Amoy',
    sub: 'Islamic DeFi · Polygon Amoy',
    explorer: 'https://amoy.polygonscan.com',
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  },
  31337: {
    chainId: 31337,
    chainIdHex: '0x7a69',
    name: 'Hardhat',
    sub: 'Islamic DeFi · Local hardhat',
    explorer: '',
    rpcUrls: ['http://127.0.0.1:8545'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
};

export function networkFor(deployment) {
  return NETWORKS[deployment.chainId] || {
    chainId: deployment.chainId,
    chainIdHex: deployment.chainId ? '0x' + deployment.chainId.toString(16) : '',
    name: deployment.network || 'Unknown network',
    sub: `Islamic DeFi · ${deployment.network || 'unknown'}`,
    explorer: '',
    rpcUrls: [],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  };
}
