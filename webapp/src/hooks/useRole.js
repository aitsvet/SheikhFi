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
      if (address.toLowerCase() === ownerAddress.toLowerCase()) {
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
