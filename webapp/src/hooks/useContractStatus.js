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
            try { approvers = await contract.getApprovers(i); } catch { /* method missing on older ABI */ }
            return {
              manager: p[0],
              description: p[1],
              requiredFunds: p[2],
              secured: p[3],
              revenueReceived: p[4],
              revenuePaid: p[5],
              // v2 fields — undefined on the older deployed ABI
              approvalWeight: p.approvalWeight,
              deadline: p.deadline,
              cancelled: p.cancelled,
              principalReturned: p.principalReturned,
              writtenOff: p.writtenOff,
              approvers,
            };
          })
        );
        s.proposalCount = propCount;
      } catch { /* method missing on older ABI */ }
      if (address) {
        try { s.myWithdrawable = await contract.withdrawable(address); } catch { /* method missing on older ABI */ }
        try {
          const [myPending] = await contract.pendingAccrual(address);
          s.myPending = myPending;
        } catch { /* method missing on older ABI */ }
      }
      setStatus(s);
      setLoading(false);
    })();
  // address intentionally excluded — refresh() bumps refreshKey on connect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, refreshKey]);

  return { status, loading, refresh };
}
