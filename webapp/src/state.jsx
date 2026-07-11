/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContractStatus } from './hooks/useContractStatus';
import { useRole, ROLES } from './hooks/useRole';
import { useDetails } from './hooks/useDetails';
import { useEvents } from './hooks/useEvents';
import deployment from './abi/deployment.json';
import { shortAddr } from './ui';

export { ROLES };

export const SCREENS = {
  OVERVIEW:  'overview',
  PROPOSALS: 'proposals',
  TREASURY:  'treasury',
  MEMBERS:   'members',
  ACTIVITY:  'activity',
  DESK:      'desk',
};

const ROLE_LABEL = {
  [ROLES.OWNER]:    'Council',
  [ROLES.MANAGER]:  'Operator',
  [ROLES.INVESTOR]: 'Partner',
  [ROLES.NONE]:     'Guest',
};

// A proposal that can still be voted on. The v2 lifecycle fields are
// undefined on the older deployed ABI — such proposals count as open.
export function isOpenProposal(p) {
  if (p.secured || p.cancelled === true) return false;
  if (p.deadline !== undefined && Number(p.deadline) * 1000 < Date.now()) return false;
  return true;
}

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const { address, contract, connect } = useWallet(deployment);
  const { status, loading, refresh } = useContractStatus(contract, address);
  const role = useRole(contract, address, deployment.owner);
  const { investorDetails, managerDetails, getNickname } = useDetails(contract, status, deployment);

  const [screen, setScreen] = useState(SCREENS.OVERVIEW);
  const [busy, setBusy]     = useState(false);
  const [tx, setTx]         = useState({ msg: '', tone: '' });
  const [eventsKey, setEventsKey] = useState(0);
  const { events, loading: eventsLoading, failedChunks: eventsFailedChunks } = useEvents(
    contract, deployment.deployBlock, eventsKey
  );

  const identity = useMemo(() => ({
    role,
    addr: address || '',
    label: ROLE_LABEL[role] || 'Guest',
    who: address ? (getNickname(address) || shortAddr(address)) : 'Disconnected',
  }), [role, address, getNickname]);

  const investors = investorDetails;
  const managers  = managerDetails;
  const proposals = status.proposals;
  const totalFunds = status.totalFunds;
  const freeFunds  = status.freeFunds;
  const approveShareThreshold = Number(status.approveShareThreshold || 0);

  const totalRevenue = useMemo(
    () => proposals.reduce((s, p) => s + (p.revenueReceived ?? 0n), 0n),
    [proposals]
  );

  const approvalShareFor = useCallback((p) => {
    if (!totalFunds || totalFunds === 0n) return 0;
    // v2 contract stores the frozen vote weight; fall back to a live
    // recomputation for the older deployed ABI
    const approveShare = p.approvalWeight !== undefined
      ? p.approvalWeight
      : (p.approvers || []).reduce((s, a) => {
          const inv = investors.find(i => i.addr.toLowerCase() === a.toLowerCase());
          return s + (inv?.fundsInvested ?? 0n);
        }, 0n);
    return Number((approveShare * 1000n) / totalFunds) / 10;
  }, [investors, totalFunds]);

  const run = useCallback(async (label, fn) => {
    if (!contract) {
      setTx({ msg: 'Connect a wallet first.', tone: 'err' });
      return;
    }
    setBusy(true);
    setTx({ msg: `${label}…`, tone: '' });
    try {
      const txResp = await fn();
      if (txResp?.wait) await txResp.wait();
      setTx({ msg: `${label} — done.`, tone: 'ok' });
      refresh();
      setEventsKey(k => k + 1);
    } catch (e) {
      setTx({ msg: `${label} failed: ${e.shortMessage || e.message || e}`, tone: 'err' });
    } finally {
      setBusy(false);
    }
  }, [contract, refresh]);

  const addInvestor = useCallback((addr, nickname, profitRate) =>
    run('Add partner', () => contract.addInvestor(addr, nickname, Number(profitRate))),
    [contract, run]
  );
  const addManager = useCallback((addr, nickname, profitRate) =>
    run('Add operator', () => contract.addManager(addr, nickname, Number(profitRate))),
    [contract, run]
  );
  const depositFunds = useCallback((amountWei) =>
    run('Deposit', () => contract.depositFunds({ value: amountWei })),
    [contract, run]
  );
  const submitProposal = useCallback((description, requiredFundsWei) =>
    run('Submit proposal', () => contract.submitProposal(description, requiredFundsWei)),
    [contract, run]
  );
  const approveProposal = useCallback((proposalId) =>
    run('Approve proposal', () => contract.approveProposal(Number(proposalId))),
    [contract, run]
  );
  const cancelProposal = useCallback((proposalId) =>
    run('Cancel proposal', () => contract.cancelProposal(Number(proposalId))),
    [contract, run]
  );
  const receiveRevenue = useCallback((proposalId, amountWei) => {
    // ABI on Polygon Amoy carries the original typo `recieveRevenue`; new
    // deployments use the fixed name. Use whichever the bound contract has.
    const fn = contract?.receiveRevenue ?? contract?.recieveRevenue;
    return run('Deliver revenue', () => fn(Number(proposalId), { value: amountWei }));
  }, [contract, run]);
  const distributeRevenue = useCallback((proposalId) =>
    run('Distribute revenue', () => contract.distributeRevenue(Number(proposalId))),
    [contract, run]
  );
  const withdraw = useCallback(() =>
    run('Withdraw', () => contract.withdraw()),
    [contract, run]
  );
  const settle = useCallback((addr) =>
    run('Settle', () => contract.settle(addr)),
    [contract, run]
  );

  const value = {
    identity, connect,
    screen, setScreen,
    deployment: { contractAddress: deployment.contractAddress, owner: deployment.owner },
    investors, managers, proposals,
    totalFunds, freeFunds, totalRevenue, approveShareThreshold,
    withdrawable: status.myWithdrawable || 0n,
    pending:      status.myPending      || 0n,
    addInvestor, addManager, depositFunds, submitProposal,
    approveProposal, cancelProposal, receiveRevenue, distributeRevenue,
    withdraw, settle,
    getNickname, approvalShareFor,
    busy, loading, tx, setTx, refresh,
    events, eventsLoading, eventsFailedChunks,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be inside <StoreProvider>');
  return v;
}
