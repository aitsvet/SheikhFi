import { useEffect, useState } from 'react';

export const ROLES = {
  NONE: 'none',
  INVESTOR: 'investor',
  MANAGER: 'manager',
  OWNER: 'owner',
};

export function useRole(contract, address, ownerAddress) {
  const [role, setRole] = useState(ROLES.NONE);

  useEffect(() => {
    if (!contract || !address) { setRole(ROLES.NONE); return; }
    (async () => {
      // live owner() survives an on-chain ownership transfer; the static
      // deployment.json value is only a fallback for an unreachable RPC
      let liveOwner = ownerAddress;
      try { liveOwner = await contract.owner(); } catch { /* keep fallback */ }
      if (address.toLowerCase() === liveOwner.toLowerCase()) {
        setRole(ROLES.OWNER); return;
      }
      let isManager = false, isInvestor = false;
      try { isManager = await contract.isManager(address); } catch { /* call reverted */ }
      try { isInvestor = await contract.isInvestor(address); } catch { /* call reverted */ }
      if (isManager) setRole(ROLES.MANAGER);
      else if (isInvestor) setRole(ROLES.INVESTOR);
      else setRole(ROLES.NONE);
    })();
  }, [contract, address, ownerAddress]);

  return role;
}
