import { Avatar, Button, shortAddr } from '../ui';
import { ROLES, SCREENS, useStore } from '../state';
import deployment from '../abi/deployment.json';
import { networkFor } from '../networks';

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

export default function Sidebar() {
  const { identity, connect, screen, setScreen,
          proposals, investors, managers, events } = useStore();
  const net = networkFor(deployment);

  const deskLabel = identity.role === ROLES.OWNER    ? 'Council desk'
                  : identity.role === ROLES.MANAGER  ? 'Operator desk'
                  : identity.role === ROLES.INVESTOR ? 'Partner desk'
                  : 'Guest view';

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="ar-mark">شيخ فاي</span>
        <span className="latin">SheikhFi</span>
        <span className="sub">{net.sub}</span>
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
        <NavItem
          active={screen === SCREENS.ACTIVITY}
          label="Activity"
          count={events?.length}
          onClick={() => setScreen(SCREENS.ACTIVITY)}
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
          {!identity.addr && (
            <div className="connect-row">
              <Button size="sm" variant="primary" onClick={connect}>
                Connect MetaMask
              </Button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
