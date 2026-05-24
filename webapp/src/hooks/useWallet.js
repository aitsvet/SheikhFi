import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { networkFor } from '../networks';

async function ensureChain(net) {
  if (!net.chainIdHex) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: net.chainIdHex }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: net.chainIdHex,
          chainName: net.name,
          rpcUrls: net.rpcUrls,
          nativeCurrency: net.nativeCurrency,
          blockExplorerUrls: net.explorer ? [net.explorer] : [],
        }],
      });
    } else {
      throw err;
    }
  }
}

export function useWallet(deployment) {
  const [address, setAddress] = useState('');
  const [contract, setContract] = useState();
  const net = networkFor(deployment);

  const _build = async (provider) => {
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    setAddress(addr);
    setContract(new ethers.Contract(deployment.contractAddress, deployment.abi, signer));
  };

  const connect = async () => {
    if (!window.ethereum) { alert('MetaMask is required!'); return; }
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    try { await ensureChain(net); } catch (e) { alert(`Switch network: ${e.message || e}`); return; }
    await _build(new ethers.BrowserProvider(window.ethereum));
  };

  const logout = () => { setAddress(''); setContract(undefined); };

  useEffect(() => {
    if (!window.ethereum) return;
    (async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length) await _build(new ethers.BrowserProvider(window.ethereum));
      } catch { /* not connected */ }
    })();
    const onAccounts = async (accounts) => {
      if (!accounts.length) logout();
      else await _build(new ethers.BrowserProvider(window.ethereum));
    };
    const onChain = () => {
      if (window.ethereum?.selectedAddress) {
        _build(new ethers.BrowserProvider(window.ethereum));
      }
    };
    window.ethereum.on('accountsChanged', onAccounts);
    window.ethereum.on('chainChanged', onChain);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccounts);
      window.ethereum.removeListener?.('chainChanged', onChain);
    };
  // _build closes over `deployment` (stable for life of app); listeners
  // installed once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { address, contract, connect, logout };
}
