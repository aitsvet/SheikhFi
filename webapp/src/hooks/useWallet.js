import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

export function useWallet(deployment) {
  const [address, setAddress] = useState('');
  const [contract, setContract] = useState();

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
    await _build(provider);
  };

  const logout = () => { setAddress(''); setContract(undefined); };

  useEffect(() => {
    if (!window.ethereum) return;
    (async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length) await _build(new ethers.BrowserProvider(window.ethereum));
      } catch {}
    })();
    const handler = async (accounts) => {
      if (!accounts.length) logout();
      else await _build(new ethers.BrowserProvider(window.ethereum));
    };
    window.ethereum.on('accountsChanged', handler);
    return () => window.ethereum.removeListener?.('accountsChanged', handler);
  }, []);

  return { address, contract, connect, logout };
}
