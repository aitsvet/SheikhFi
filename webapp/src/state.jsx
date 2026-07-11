/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from './hooks/useWallet';
import { useContractStatus } from './hooks/useContractStatus';
import { useRole, ROLES } from './hooks/useRole';
import { useDetails } from './hooks/useDetails';
import { useEvents } from './hooks/useEvents';
import { getActiveDeployment } from './deployments';
const deployment = getActiveDeployment();
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

// A proposal that can still be voted on. The v2/v3 lifecycle fields are
// undefined on the older deployed ABIs — such proposals count as open.
export function isOpenProposal(p) {
  if (p.secured || p.cancelled === true) return false;
  if (p.certified === false) return false; // v3: voting opens after board sign-off
  if (p.deadline !== undefined && Number(p.deadline) * 1000 < Date.now()) return false;
  return true;
}

// ABI generation of a function: undefined if absent, else its inputs count.
function fnInputs(abi, name) {
  const frag = abi.find(e => e.type === 'function' && e.name === name);
  return frag ? frag.inputs.length : undefined;
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

  // v3 signature detection: money-in functions carry an explicit amount arg
  const v3Money = fnInputs(deployment.abi, 'depositFunds') === 1;
  const v3Submit = fnInputs(deployment.abi, 'submitProposal') === 4;

  // pool denomination (v3): address(0)/absent = native; else an ERC-20
  const [assetAddr, setAssetAddr] = useState('');
  const [boardAddr, setBoardAddr] = useState('');
  useEffect(() => {
    if (!contract) { setAssetAddr(''); setBoardAddr(''); return; }
    (async () => {
      try { setAssetAddr(await contract.asset()); } catch { setAssetAddr(''); }
      try { setBoardAddr(await contract.board()); } catch { setBoardAddr(''); }
    })();
  }, [contract]);
  const tokenMode = !!assetAddr && assetAddr !== ethers.ZeroAddress;
  const isBoard = !!address && !!boardAddr
    && address.toLowerCase() === boardAddr.toLowerCase();

  // money-in helper: native attaches value; token mode approves first
  const payIn = useCallback(async (amountWei, call) => {
    if (!v3Money) return call({ value: amountWei }); // old ABI: payable only
    if (tokenMode) {
      const erc20 = new ethers.Contract(assetAddr,
        ['function approve(address,uint256) returns (bool)'], contract.runner);
      await (await erc20.approve(await contract.getAddress(), amountWei)).wait();
      return call(amountWei, {});
    }
    return call(amountWei, { value: amountWei });
  }, [v3Money, tokenMode, assetAddr, contract]);

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
    run('Deposit', () => payIn(amountWei, (...a) => contract.depositFunds(...a))),
    [contract, run, payIn]
  );
  const submitProposal = useCallback((description, requiredFundsWei, docsHash = '', tranches = 1) =>
    run('Submit proposal', () => v3Submit
      ? contract.submitProposal(description, requiredFundsWei, docsHash, Number(tranches) || 1)
      : contract.submitProposal(description, requiredFundsWei)),
    [contract, run, v3Submit]
  );
  const certifyProposal = useCallback((proposalId) =>
    run('Certify proposal', () => contract.certifyProposal(Number(proposalId))),
    [contract, run]
  );
  const releaseTranche = useCallback((proposalId) =>
    run('Release tranche', () => contract.releaseTranche(Number(proposalId))),
    [contract, run]
  );
  const postCollateral = useCallback((amountWei) =>
    run('Post collateral', () => payIn(amountWei, (...a) => contract.postCollateral(...a))),
    [contract, run, payIn]
  );
  const withdrawCollateral = useCallback((amountWei) =>
    run('Withdraw collateral', () => contract.withdrawCollateral(amountWei)),
    [contract, run]
  );
  const slashCollateral = useCallback((manager, proposalId, amountWei, reason) =>
    run('Slash collateral', () => contract.slashCollateral(manager, Number(proposalId), amountWei, reason)),
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
  const returnPrincipal = useCallback((proposalId, amountWei) =>
    run('Return principal', () => payIn(amountWei,
      (...a) => contract.returnPrincipal(Number(proposalId), ...a))),
    [contract, run, payIn]
  );
  const writeOffProposal = useCallback((proposalId) =>
    run('Write off', () => contract.writeOffProposal(Number(proposalId))),
    [contract, run]
  );
  const exitFunds = useCallback((amountWei) =>
    run('Exit', () => contract.exit(amountWei)),
    [contract, run]
  );
  const receiveRevenue = useCallback((proposalId, amountWei) => {
    // ABI on Polygon Amoy carries the original typo `recieveRevenue`; new
    // deployments use the fixed name. Use whichever the bound contract has.
    const fn = contract?.receiveRevenue ?? contract?.recieveRevenue;
    return run('Deliver revenue', () => payIn(amountWei,
      (...a) => fn(Number(proposalId), ...a)));
  }, [contract, run, payIn]);
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
    returnPrincipal, writeOffProposal, exitFunds,
    certifyProposal, releaseTranche,
    postCollateral, withdrawCollateral, slashCollateral,
    withdraw, settle,
    // v2 economy functions exist on this deployment's ABI
    hasEconomyV2: deployment.abi.some(e => e.name === 'returnPrincipal'),
    // v3: board certification, tranches, collateral, tokenized shares
    hasV3: deployment.abi.some(e => e.name === 'certifyProposal'),
    isBoard, boardAddr, tokenMode,
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
