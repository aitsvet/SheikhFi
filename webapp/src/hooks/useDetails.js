import { useEffect, useState } from 'react';

export function useDetails(contract, status, deployment) {
  const [investorDetails, setInvestorDetails] = useState([]);
  const [managerDetails, setManagerDetails] = useState([]);

  useEffect(() => {
    if (!contract) return;
    (async () => {
      try {
        const details = await Promise.all(
          status.investorAddresses.map(async (addr) => {
            const inv = await contract.investors(addr);
            return { addr, nickname: inv.nickname, fundsInvested: inv.fundsInvested, profit: inv.profit, profitRate: inv.profitRate };
          })
        );
        setInvestorDetails(details);
      } catch { setInvestorDetails([]); }
    })();
  }, [contract, status.investorAddresses]);

  useEffect(() => {
    if (!contract) return;
    (async () => {
      try {
        const details = await Promise.all(
          status.managerAddresses.map(async (addr) => {
            const mgr = await contract.managers(addr);
            return {
              addr, nickname: mgr.nickname, fundsSecured: mgr.fundsSecured,
              profit: mgr.profit, profitRate: mgr.profitRate,
              // v3 fields — undefined on the older deployed ABIs
              collateral: mgr.collateral, activeProjects: mgr.activeProjects,
            };
          })
        );
        setManagerDetails(details);
      } catch { setManagerDetails([]); }
    })();
  }, [contract, status.managerAddresses]);

  function getNickname(addr) {
    if (!addr) return '';
    const mgr = managerDetails.find(m => m.addr.toLowerCase() === addr.toLowerCase());
    if (mgr?.nickname) return mgr.nickname;
    const inv = investorDetails.find(i => i.addr.toLowerCase() === addr.toLowerCase());
    if (inv?.nickname) return inv.nickname;
    if (addr.toLowerCase() === deployment.owner.toLowerCase()) return deployment.ownerNickname;
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  return { investorDetails, managerDetails, getNickname };
}
