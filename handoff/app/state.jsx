// Mock state store — same surface area as v1, plus a current "screen"
// router slot for the multi-screen console.

const { useState, useMemo, useCallback, createContext, useContext } = React;

const ROLES = {
  NONE: 'none',
  INVESTOR: 'investor',   // "Partner"
  MANAGER: 'manager',     // "Operator"
  OWNER: 'owner',         // "Council"
};

const SCREENS = {
  OVERVIEW:  'overview',
  PROPOSALS: 'proposals',
  TREASURY:  'treasury',
  MEMBERS:   'members',
  DESK:      'desk',       // role-specific workspace
};

const SEED = {
  contractAddress: '0x408f311ff021e4bba7a3088b6a1c4af1a9c23994',
  owner:           '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  ownerNickname:   'Ali',
  approveShareThreshold: 60,
  investors: [
    { addr: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', nickname: 'Bob',
      fundsInvested: 5n * WEI, profit: 12n * WEI / 100n, profitRate: 35 },
    { addr: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', nickname: 'Charlie',
      fundsInvested: 3n * WEI, profit: 7n * WEI / 100n, profitRate: 35 },
    { addr: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', nickname: 'Dana',
      fundsInvested: 2n * WEI, profit: 4n * WEI / 100n, profitRate: 35 },
  ],
  managers: [
    { addr: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', nickname: 'Karim',
      fundsSecured: 4n * WEI, profit: 25n * WEI / 100n, profitRate: 50 },
    { addr: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', nickname: 'Layla',
      fundsSecured: 2n * WEI, profit: 0n, profitRate: 50 },
  ],
  proposals: [
    {
      manager: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      description: 'Solar microgrid — Tashkent suburb',
      requiredFunds: 4n * WEI,
      secured: true,
      revenueReceived: 5n * WEI / 10n,
      revenuePaid: 5n * WEI / 10n,
      approvers: [
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      ],
    },
    {
      manager: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
      description: 'Halal logistics fleet — phase II',
      requiredFunds: 2n * WEI,
      secured: false,
      revenueReceived: 0n,
      revenuePaid: 0n,
      approvers: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8'],
    },
    {
      manager: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
      description: 'Agro-cooperative working capital',
      requiredFunds: 3n * WEI,
      secured: false,
      revenueReceived: 0n,
      revenuePaid: 0n,
      approvers: [],
    },
  ],
};

const IDENTITIES = [
  { role: ROLES.OWNER,    addr: SEED.owner,             label: 'Council',  who: 'Ali' },
  { role: ROLES.MANAGER,  addr: SEED.managers[0].addr,  label: 'Operator', who: 'Karim' },
  { role: ROLES.INVESTOR, addr: SEED.investors[0].addr, label: 'Partner',  who: 'Bob' },
  { role: ROLES.NONE,     addr: '',                     label: 'Guest',    who: 'Disconnected' },
];

const StoreCtx = createContext(null);

function StoreProvider({ children }) {
  const [identity, setIdentity] = useState(IDENTITIES[0]);
  const [screen, setScreen]     = useState(SCREENS.OVERVIEW);
  const [investors, setInvestors] = useState(SEED.investors);
  const [managers, setManagers]   = useState(SEED.managers);
  const [proposals, setProposals] = useState(SEED.proposals);
  const [approveShareThreshold]   = useState(SEED.approveShareThreshold);
  const [withdrawable, setWithdrawable] = useState({});
  const [pending, setPending]           = useState({});

  useMemo(() => {
    setWithdrawable({
      [SEED.investors[0].addr.toLowerCase()]: 8n * WEI / 100n,
      [SEED.managers[0].addr.toLowerCase()]:  25n * WEI / 100n,
    });
    setPending({
      [SEED.investors[0].addr.toLowerCase()]: 2n * WEI / 100n,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalFunds = useMemo(
    () => investors.reduce((s, i) => s + i.fundsInvested, 0n),
    [investors]
  );
  const freeFunds = useMemo(() => {
    const securedOut = proposals
      .filter(p => p.secured)
      .reduce((s, p) => s + (p.requiredFunds - p.revenuePaid), 0n);
    return totalFunds - securedOut;
  }, [proposals, totalFunds]);

  const totalRevenue = useMemo(
    () => proposals.reduce((s, p) => s + p.revenueReceived, 0n),
    [proposals]
  );

  // Approval share (%) per proposal, for the progress bar + secured flip.
  const approvalShareFor = useCallback((p) => {
    if (totalFunds === 0n) return 0;
    const approveShare = p.approvers.reduce((s, a) => {
      const inv = investors.find(i => i.addr.toLowerCase() === a.toLowerCase());
      return s + (inv?.fundsInvested ?? 0n);
    }, 0n);
    return Number((approveShare * 1000n) / totalFunds) / 10;
  }, [investors, totalFunds]);

  // --- mutations -------------------------------------------------------
  const addInvestor = useCallback((addr, nickname, profitRate) => {
    setInvestors(list => [...list, { addr, nickname, profitRate: Number(profitRate),
      fundsInvested: 0n, profit: 0n }]);
  }, []);
  const addManager = useCallback((addr, nickname, profitRate) => {
    setManagers(list => [...list, { addr, nickname, profitRate: Number(profitRate),
      fundsSecured: 0n, profit: 0n }]);
  }, []);
  const depositFunds = useCallback((addr, amountWei) => {
    setInvestors(list => list.map(i =>
      i.addr.toLowerCase() === addr.toLowerCase()
        ? { ...i, fundsInvested: i.fundsInvested + amountWei }
        : i
    ));
  }, []);
  const submitProposal = useCallback((manager, description, requiredFunds) => {
    setProposals(list => [...list, {
      manager, description, requiredFunds,
      secured: false, revenueReceived: 0n, revenuePaid: 0n, approvers: [],
    }]);
  }, []);
  const approveProposal = useCallback((proposalId, voterAddr) => {
    setProposals(list => list.map((p, i) => {
      if (i !== proposalId) return p;
      if (p.approvers.some(a => a.toLowerCase() === voterAddr.toLowerCase())) return p;
      return { ...p, approvers: [...p.approvers, voterAddr] };
    }));
  }, []);
  const receiveRevenue = useCallback((proposalId, amountWei) => {
    setProposals(list => list.map((p, i) =>
      i === proposalId ? { ...p, revenueReceived: p.revenueReceived + amountWei } : p
    ));
  }, []);
  const distributeRevenue = useCallback((proposalId) => {
    setProposals(list => list.map((p, i) =>
      i === proposalId ? { ...p, revenuePaid: p.revenueReceived } : p
    ));
  }, []);
  const withdraw = useCallback((addr) => {
    setWithdrawable(w => ({ ...w, [addr.toLowerCase()]: 0n }));
  }, []);
  const settle = useCallback((addr) => {
    const key = addr.toLowerCase();
    setWithdrawable(w => ({ ...w, [key]: (w[key] || 0n) + (pending[key] || 0n) }));
    setPending(p => ({ ...p, [key]: 0n }));
  }, [pending]);

  const getNickname = useCallback((addr) => {
    if (!addr) return '';
    const m = managers.find(x => x.addr.toLowerCase() === addr.toLowerCase());
    if (m?.nickname) return m.nickname;
    const i = investors.find(x => x.addr.toLowerCase() === addr.toLowerCase());
    if (i?.nickname) return i.nickname;
    if (addr.toLowerCase() === SEED.owner.toLowerCase()) return SEED.ownerNickname;
    return shortAddr(addr);
  }, [managers, investors]);

  // Auto-flip secured once threshold passed.
  useMemo(() => {
    setProposals(list => list.map(p => {
      if (p.secured) return p;
      return approvalShareFor(p) >= approveShareThreshold ? { ...p, secured: true } : p;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals.map(p => p.approvers.length).join(','), totalFunds]);

  const value = {
    identity, setIdentity, identities: IDENTITIES,
    screen, setScreen,
    deployment: { contractAddress: SEED.contractAddress, owner: SEED.owner },
    investors, managers, proposals,
    totalFunds, freeFunds, totalRevenue, approveShareThreshold,
    withdrawable: withdrawable[identity.addr?.toLowerCase()] || 0n,
    pending:      pending[identity.addr?.toLowerCase()]      || 0n,
    addInvestor, addManager, depositFunds, submitProposal,
    approveProposal, receiveRevenue, distributeRevenue,
    withdraw, settle,
    getNickname, approvalShareFor,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be inside <StoreProvider>');
  return v;
}

Object.assign(window, { ROLES, SCREENS, StoreProvider, useStore });
