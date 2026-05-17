import { useEffect, useState } from 'react';

const EMPTY = {
  totalFunds: 0n,
  freeFunds: 0n,
  proposalCount: 0,
  investorAddresses: [],
  managerAddresses: [],
  proposals: [],
  approveShareThreshold: 0,
  myWithdrawable: 0n,
  myPending: 0n,
};

export function useContractStatus(contract, address) {
  const [status, setStatus] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    if (!contract) return;
    (async () => {
      setLoading(true);
      const s = { ...EMPTY };
      try {
        s.totalFunds = await contract.totalFunds();
        s.freeFunds = await contract.freeFunds();
        s.approveShareThreshold = await contract.approveShareThreshold();

        const invCount = Number(await contract.getInvestorCount());
        s.investorAddresses = await Promise.all(
          Array.from({ length: invCount }, (_, i) => contract.investorAddresses(i))
        );
        const mgrCount = Number(await contract.getManagerCount());
        s.managerAddresses = await Promise.all(
          Array.from({ length: mgrCount }, (_, i) => contract.managerAddresses(i))
        );
        const propCount = Number(await contract.getProposalCount());
        s.proposals = await Promise.all(
          Array.from({ length: propCount }, async (_, i) => {
            const p = await contract.proposals(i);
            let approvers = [];
            try { approvers = await contract.getApprovers(i); } catch {}
            return {
              manager: p[0],
              description: p[1],
              requiredFunds: p[2],
              secured: p[3],
              revenueReceived: p[4],
              revenuePaid: p[5],
              approvers,
            };
          })
        );
        s.proposalCount = propCount;
      } catch {}
      if (address) {
        try { s.myWithdrawable = await contract.withdrawable(address); } catch {}
        try {
          const [myPending] = await contract.pendingAccrual(address);
          s.myPending = myPending;
        } catch {}
      }
      setStatus(s);
      setLoading(false);
    })();
  }, [contract, refreshKey]);

  return { status, loading, refresh };
}
