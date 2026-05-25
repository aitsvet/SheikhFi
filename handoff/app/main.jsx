// Entry point — mounts the console shell.

function App() {
  const { screen } = useStore();
  let body = null;
  if      (screen === SCREENS.OVERVIEW)  body = <OverviewScreen />;
  else if (screen === SCREENS.PROPOSALS) body = <ProposalsScreen />;
  else if (screen === SCREENS.TREASURY)  body = <TreasuryScreen />;
  else if (screen === SCREENS.MEMBERS)   body = <MembersScreen />;
  else if (screen === SCREENS.DESK)      body = <Desk />;
  return (
    <div className="app">
      <Sidebar />
      <main className="main">{body}</main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
);
