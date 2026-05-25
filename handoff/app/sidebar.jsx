// Left nav: brand block, role-aware screens, identity card at bottom
// with a tiny "view as" switcher (prototype-only).

function NavItem({ active, label, count, onClick }) {
  return (
    <button className={'nav-item' + (active ? ' active' : '')} onClick={onClick}>
      <span className="label">
        <span className="dot" />
        {label}
      </span>
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

function Sidebar() {
  const {
    identity, identities, setIdentity,
    screen, setScreen,
    proposals, investors, managers,
    getNickname,
  } = useStore();

  // Role-aware home label
  const deskLabel = identity.role === ROLES.OWNER    ? 'Council desk'
                  : identity.role === ROLES.MANAGER  ? 'Operator desk'
                  : identity.role === ROLES.INVESTOR ? 'Partner desk'
                  : 'Guest view';

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="ar-mark">شيخ فاي</span>
        <span className="latin">SheikhFi</span>
        <span className="sub">Islamic DeFi · Polygon Amoy</span>
      </div>

      <div className="nav-section">
        <div className="nav-section-label">Workspace</div>
        <NavItem
          active={screen === SCREENS.OVERVIEW}
          label="Overview"
          onClick={() => setScreen(SCREENS.OVERVIEW)}
        />
        <NavItem
          active={screen === SCREENS.DESK}
          label={deskLabel}
          onClick={() => setScreen(SCREENS.DESK)}
        />
      </div>

      <div className="nav-section">
        <div className="nav-section-label">Activity</div>
        <NavItem
          active={screen === SCREENS.PROPOSALS}
          label="Proposals"
          count={proposals.length}
          onClick={() => setScreen(SCREENS.PROPOSALS)}
        />
        <NavItem
          active={screen === SCREENS.TREASURY}
          label="Treasury"
          onClick={() => setScreen(SCREENS.TREASURY)}
        />
        <NavItem
          active={screen === SCREENS.MEMBERS}
          label="Members"
          count={investors.length + managers.length}
          onClick={() => setScreen(SCREENS.MEMBERS)}
        />
      </div>

      <div className="sidebar-footer">
        <div className="identity-card">
          <div className="who">
            <Avatar name={identity.who} />
            <div>
              <div className="name">{identity.who}</div>
              <div className="addr mono">
                {identity.addr ? shortAddr(identity.addr) : 'no wallet'}
              </div>
            </div>
          </div>
          <div className="switch">
            View as:
            <div className="switch-row">
              {identities.map(i => (
                <button
                  key={i.label}
                  className={identity.label === i.label ? 'active' : ''}
                  onClick={() => setIdentity(i)}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar, NavItem });
