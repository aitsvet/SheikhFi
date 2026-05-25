# SheikhFi v2 — Claude Code handoff (console layout)

Static HTML/JSX refactor of the SheikhFi web app
(github.com/aitsvet/SheikhFi), restructured into a **multi-screen
console** in the spirit of the CryptoSarf operator UI. Open
`SheikhFi.html` in any modern browser — Babel transpiles the JSX
in-page from CDN. No build step.

The original Vite/React/ethers app's single-page scroll has been
reshaped into a sidebar + main-column console with five screens. The
blue→pink gradient brand signature is preserved but treated as accent
on white surfaces, the way CryptoSarf uses its gold/green.

## Files

- `SheikhFi.html` — entry. Loads Amiri / Cormorant Garamond / Inter /
  JetBrains Mono, declares the full design-token set in `:root`,
  defines base CSS for the shell, then pulls in React 18, Babel
  standalone, and the JSX modules below in order.
- `bg.webp` — background texture (copied from the gh-pages branch).
- `app/ui.jsx` — primitives (Card, CardHead, Button, Field, Input,
  Select, Badge, **Kpi**, **SectionRule**, **Avatar**, **Progress**,
  Empty, TxStatus) plus `formatEther` / `parseEther` / `shortAddr` /
  `initials` helpers. The prototype is BigInt-accurate without pulling
  in `ethers`.
- `app/state.jsx` — mock store mirroring the contract surface
  (`addInvestor`, `addManager`, `depositFunds`, `submitProposal`,
  `approveProposal`, `receiveRevenue`, `distributeRevenue`,
  `withdraw`, `settle`). Adds a **`screen` router slot** for the
  five-screen console. Approval threshold is auto-evaluated to flip a
  proposal to `secured`. Seeded from the demo accounts in
  `deploy.js`.
- `app/sidebar.jsx` — left nav: brand block (`شيخ فاي`/SheikhFi),
  Workspace + Activity nav sections, identity card at the bottom with
  a "view as" prototype switcher (Council/Operator/Partner/Guest).
- `app/overview.jsx` — Overview screen. KPI strip + "top proposals"
  card + Musharaka/Mudaraba principles panel. Also defines
  `<PageHead>` and `<WithdrawPill>` reused by every screen.
- `app/proposals.jsx` — Proposals screen. Filterable card list
  (All / Pending / Secured / Settled) with gradient progress bars and
  a threshold tick. Exports `<ProposalCard>` for reuse on the desks.
- `app/treasury.jsx` — Treasury screen. Deployed / Free / Settled KPIs,
  contract card, revenue history. Owner gets a `<DistributePanel>`
  inline at the bottom.
- `app/members.jsx` — Members screen. Partners + Operators side-by-side
  with avatars and per-row stats.
- `app/desk.jsx` — role-aware first-screen workspace. Dispatches to
  `<CouncilDesk>` (owner — onboard partner / onboard operator),
  `<OperatorDesk>` (manager — propose project, deliver revenue, my
  projects), `<PartnerDesk>` (investor — deposit, my position,
  proposals awaiting my vote), or `<GuestDesk>` (no wallet).
- `app/main.jsx` — mounts `<App>` (Sidebar + screen dispatcher) into
  `#root`. Loaded last.

Script load order in `SheikhFi.html` matters: every module attaches
its exports to `window` because each `<script type="text/babel">` gets
its own scope when Babel transpiles in-browser.

## What changed vs v1

| v1 (single scroll)                   | v2 (console)                                       |
| ------------------------------------ | -------------------------------------------------- |
| One `<App>` with vertical sections   | Sidebar + main column, five screens                |
| AdminUI / ManagerUI / InvestorUI all stacked | Role-aware `Desk` screen — only your tools |
| ProposalsTable (wide table)          | Proposal cards w/ gradient progress + threshold tick |
| StatusDashboard k/v rows             | KPI strip across the top of each screen            |
| Owner+Investor stacked together      | Council vs Partner views are separate screens      |

## Mapping to the original repo

Refactor target: `aitsvet/SheikhFi` (branch `gh-pages`), folder
`webapp/src/`.

| Original                              | v2 prototype                                   |
| ------------------------------------- | ---------------------------------------------- |
| `webapp/src/App.jsx`                  | `app/main.jsx` + `app/sidebar.jsx`             |
| `webapp/src/App.css` + `index.css`    | `<style>` block in `SheikhFi.html`             |
| `components/ConnectBar.jsx`           | identity card in `sidebar.jsx`                 |
| `components/WithdrawPanel.jsx`        | `WithdrawPill` in `overview.jsx` (appears in `<PageHead>` actions) |
| `components/AdminUI.jsx`              | `CouncilDesk` in `desk.jsx` + `DistributePanel` in `treasury.jsx` |
| `components/ManagerUI.jsx`            | `OperatorDesk` in `desk.jsx`                   |
| `components/InvestorUI.jsx`           | `PartnerDesk` in `desk.jsx`                    |
| `components/StatusDashboard.jsx`      | `OverviewKpis` + `TreasuryScreen` KPIs/cards   |
| `components/InvestorTable.jsx`        | `MembersScreen` (Partners column)              |
| `components/ManagersTable.jsx`        | `MembersScreen` (Operators column)             |
| `components/ProposalsTable.jsx`       | `ProposalsScreen` + `ProposalCard`             |
| `hooks/useWallet.js`                  | replaced by `IDENTITIES` + identity card switcher (mock) |
| `hooks/useContractStatus.js`          | `StoreProvider` state in `state.jsx`           |
| `hooks/useDetails.js`                 | `getNickname()` in `state.jsx`                 |
| `hooks/useRole.js`                    | `identity.role` in `state.jsx`                 |
| `abi/deployment.json`                 | `SEED` + `deployment` in `state.jsx` (subset)  |

## Implementation notes for the production refactor

1. **Toolchain.** Replace Babel-in-browser with the existing Vite
   build (`webapp/`). Each `app/*.jsx` becomes an ES module with
   `import`/`export` — drop the `Object.assign(window, …)` shims.
2. **Router.** v2 uses a `screen` field on the store (`SCREENS`
   enum) instead of real routing. Wire to `react-router` for
   bookmarkable URLs: `/`, `/desk`, `/proposals`, `/treasury`,
   `/members`. The screen dispatcher in `main.jsx` becomes
   `<Routes>`.
3. **State.** `state.jsx`'s `StoreProvider` is where real hooks plug
   back in. Wire `useWallet` → `identity`, `useContractStatus` +
   `useDetails` → snapshot fields, role-derivation → `useRole`.
   Everything below the provider should not change.
4. **Money math.** `formatEther`/`parseEther` in `app/ui.jsx` are
   byte-compatible with `ethers.formatEther` / `parseEther`. Swap to
   `ethers` in real components without touching call sites.
5. **Design tokens.** All colors / radii / shadows live in `:root` of
   `SheikhFi.html`. Lift them into `tokens.css` (or a JS theme) when
   integrating into the real `webapp/`. The brand gradient
   (`--grad`, `--grad-soft`, `--grad-faint`) is the signature — keep
   all three forms.
6. **Typography.** v1 was system fonts. v2 standardises on **Inter**
   (UI), **Cormorant Garamond** (display headings, h1/h3/section
   rules — Islamic-finance gravitas), **Amiri** (Arabic brand mark
   only), **JetBrains Mono** with tabular-nums (every amount and
   address). Decide whether to ship these bundled or via Google
   Fonts.
7. **Role switcher.** Delete the "View as" sub-block from
   `sidebar.jsx`'s identity card before shipping — it only exists so
   reviewers can flip identities without a wallet.
8. **Auto-secure logic.** `state.jsx` evaluates the approval threshold
   client-side to flip a proposal to `secured` for demo flow. The
   real contract decides this on-chain; the UI just reflects
   `p.secured`.
9. **Progress bars.** `<Progress value threshold>` in `ui.jsx` draws
   the brand gradient fill with a vertical tick at the threshold
   percentage. Reusable everywhere — e.g. partner share-of-pool on
   `PartnerDesk`.
10. **No backend changes implied.** This is a UI-only refactor; the
    Solidity contracts in the repo's `contracts/` folder are untouched.

## Running the prototype

Just open `SheikhFi.html` in any modern browser. Everything is static;
no server, no wallet, no Hardhat needed. Use the identity card in the
sidebar's "View as" row to flip between Council / Operator / Partner /
Guest and watch each desk screen update accordingly.
