import Sidebar from './components/Sidebar';
import OverviewScreen from './screens/Overview';
import ProposalsScreen from './screens/Proposals';
import TreasuryScreen from './screens/Treasury';
import MembersScreen from './screens/Members';
import ActivityScreen from './screens/Activity';
import Desk from './screens/Desk';
import { SCREENS, useStore } from './state';

export default function App() {
  const { screen } = useStore();
  let body = null;
  if      (screen === SCREENS.OVERVIEW)  body = <OverviewScreen />;
  else if (screen === SCREENS.PROPOSALS) body = <ProposalsScreen />;
  else if (screen === SCREENS.TREASURY)  body = <TreasuryScreen />;
  else if (screen === SCREENS.MEMBERS)   body = <MembersScreen />;
  else if (screen === SCREENS.ACTIVITY)  body = <ActivityScreen />;
  else if (screen === SCREENS.DESK)      body = <Desk />;
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{body}</main>
    </div>
  );
}
