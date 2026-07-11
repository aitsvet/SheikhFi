# PLAN — расширения SheikhFi (v3)

Спецификации для исполнителя. Каждый раздел самодостаточен: точные сигнатуры,
инварианты, требования к тестам и критерии приёмки. Выполнять по одному
разделу за раз, в указанном порядке; после каждого раздела — полный прогон.

Базовая версия — «экономика v2» (возврат тела, списание убытков, выход,
жизненный цикл предложения, двухшаговый ownership): реализована, покрыта
тестами и описана в README.md; трассировка на стандарты — в STANDARDS.md.
Ссылки вида «SS 12 3/1/5/4» — пункты стандартов AAOIFI, цитаты в STANDARDS.md.

## Правила для исполнителя (читать первым)

- Все команды — через compose-тулбокс, НЕ на хосте:
  `docker compose run --rm node '<команда>'`.
- Полный прогон = `npm ci && npx hardhat test` в корне; `cd webapp && npm ci
  && npm run lint && npm run build`; сквозной
  `docker compose --profile e2e up --abort-on-container-exit e2e`.
- v3 — новый деплой с новым ABI: менять сигнатуры МОЖНО, но webapp обязан
  работать с любым из деплоев в `webapp/src/abi/deployments/` через
  feature-detect по ABI (наличие функции; число inputs у фрагмента), как уже
  сделано для `hasEconomyV2`.
- В структуры `Proposal`/`Investor`/`Manager` новые поля добавлять ТОЛЬКО в
  конец; webapp читает поля по именам.
- Коммиты: одно слово, по компонентам, без trailer-ов. Пушить только на шаге
  деплоя демо (§7).

## 1. Токенизация долей (ERC-20) — ✅ выполнено

**Цель:** доля Musharaka — передаваемый токен (SS 17 3/6, 5/2/16: торговля
сертификатами допустима после начала деятельности). Пул пермиссионный:
получатель обязан быть онборженным инвестором.

1. Контракт объявляет минимальный ERC-20 без внешних зависимостей:
   `name() = "SheikhFi Musharaka Share"`, `symbol() = "SHFI"`,
   `decimals() = 18`; `balanceOf(a) == investors[a].fundsInvested`;
   `totalSupply() == totalFunds`; `mapping(address => mapping(address => uint))
   public allowance;` события `Transfer`, `Approval`.
2. `transfer(to, amount)`: `require(isInvestor(msg.sender) && isInvestor(to))`;
   `_accrue` ОБОИМ сторонам ДО перемещения (прибыль кристаллизуется по старым
   долям); `fundsInvested` двигается, `totalFunds` не меняется;
   `emit Transfer`.
3. `approve` / `transferFrom` — стандартно, `allowance` уменьшается.
4. ERC-20-семантика существующих потоков: `depositFunds` эмитит
   `Transfer(address(0), инвестор, amount)` (mint); `exit` —
   `Transfer(инвестор, address(0), amount)` (burn); `writeOffProposal` — burn
   на каждое списание в цикле.
5. Тесты: метаданные; `balanceOf`/`totalSupply` синхронны с учётом; transfer
   двигает долю и кристаллизует прибыль обеих сторон по долям ДО перевода;
   transfer не-инвестору ревертится; `transferFrom` уважает allowance;
   mint/burn-события на deposit/exit.

## 2. Деноминация в стейблкоине (опция asset) — ✅ выполнено

**Цель:** пул может вестись в ERC-20 (USDC на Base) вместо нативного ETH —
меньше валютного гарара в учёте RWA. Демо остаётся на нативном ETH.

1. Конструктор: `constructor(string nickname, uint threshold, address asset)`;
   `asset == address(0)` — нативный режим (демо), иначе адрес ERC-20.
2. Внутренние помощники: `_pull(uint amount)` — нативный: `require(msg.value
   == amount)`; токенный: `require(msg.value == 0)` +
   `transferFrom(msg.sender, address(this), amount)` с проверкой возврата;
   `_pay(address to, uint amount)` в `withdraw()` — `call{value:}` или
   `transfer` с проверкой.
3. Сигнатуры денежных входов становятся явными по сумме (все `payable`, в
   нативном режиме сумма дублируется в `msg.value`):
   `depositFunds(uint amount)`, `receiveRevenue(uint id, uint amount)`,
   `returnPrincipal(uint id, uint amount)`, `postCollateral(uint amount)` (§5).
4. `BadReceiver` (тест-хелпер) обновить на новую сигнатуру депозита.
5. Тесты: `MockERC20` (mint всем участникам) + полный цикл в токенном режиме
   (deposit → proposal → certify → vote → returnPrincipal → revenue →
   distribute → withdraw), баланс токена сходится; нативные reverts
   (`msg.value != amount`, `msg.value != 0` в токенном режиме).
6. Webapp: адаптер в `state.jsx` — по ABI-фрагменту `depositFunds` определить
   старую (0 inputs) или новую (1 input) сигнатуру; в токенном режиме перед
   денежным входом вызывать `asset.approve` (две последовательные транзакции
   в том же `run()`); режим определять по `contract.asset()` с fallback на
   нативный.

## 3. Шариатский совет и документы актива — ✅ выполнено

**Цель:** предмет сделки перестаёт быть только свободным текстом — снимает
оговорку ⚠️ по гарару (SS 31 4/1, 4/2/1); совет — обязательный сертификатор
предложений. Слэшинг (§5) тоже проходит только через вердикт совета
(SS 13 разд. 6).

1. `address public board;` — в конструкторе `board = msg.sender`;
   `setBoard(address)` onlyOwner, ненулевой адрес, событие `BoardChanged`.
2. `submitProposal(string description, uint requiredFunds, string docsHash,
   uint tranches)` — `docsHash` (IPFS CID, опционально пустой; UI поощряет),
   `tranches` см. §4. Поля в конец `Proposal`: `string docsHash;
   uint tranches; uint tranchesReleased; bool certified;`.
3. `certifyProposal(uint id)` — только board; `!cancelled`, `!certified`;
   событие `ProposalCertified(id)`.
4. `approveProposal` дополнительно требует `p.certified` («Not certified») —
   голосование не открывается до сертификации.
5. Тесты: голос до сертификации ревертится; certify не-board ревертится;
   после certify цикл идёт как раньше; setBoard — права/границы/событие.
6. Webapp: роль Board (адрес == `board()`, feature-detect) — desk с очередью
   несертифицированных предложений и кнопкой Certify; в карточке предложения
   бейдж «Awaiting certification» и ссылка на `https://ipfs.io/ipfs/<CID>`
   при непустом docsHash; форма подачи — поля Docs CID и Tranches.

## 4. Milestone-транши — ✅ выполнено

**Цель:** аванс доверенному лицу уменьшается — капитал выдаётся частями по
мере подтверждения вех. Вехи подтверждает совет (сертификация исполнения —
его компетенция; партнёры уже одобрили проект целиком при голосовании).

1. `submitProposal(…, uint tranches)`: `require(tranches >= 1 && tranches <=
   12)`. При секьюринге: `freeFunds -= fundsRequired` (резервируется всё),
   но менеджеру зачисляется только транш №1 = `fundsRequired / tranches`;
   `tranchesReleased = 1`.
2. `_releasedAmount(p)`: `tranchesReleased == tranches ? fundsRequired :
   fundsRequired / tranches * tranchesReleased` — остаток от деления уходит
   последним траншем.
3. `releaseTranche(uint id)` — только board; `secured && !writtenOff &&
   tranchesReleased < tranches`; менеджеру зачисляется дельта
   `_releasedAmount`; событие `TrancheReleased(id, index, amount)`.
4. `returnPrincipal` капится не `fundsRequired`, а `_releasedAmount(p)` —
   менеджер не может «вернуть» то, чего не получал.
5. `distributeRevenue` гейт: `principalReturned == _releasedAmount(p) ||
   writtenOff` — прибыль по завершённым вехам распределима до конца проекта.
6. `writeOffProposal`: нераскрытые транши (`fundsRequired − _releasedAmount`)
   возвращаются в `freeFunds` (снятие резерва), убыток = `_releasedAmount −
   principalReturned` (только по фактически выданному); допускается нулевой
   убыток (досрочное закрытие проекта) — тогда цикл списания пропускается,
   но резерв снимается; «Nothing to write off» — только когда всё выдано и
   всё возвращено.
7. Существующее поведение (tranches = 1) обязано совпасть с v2 бит-в-бит —
   старые тесты не переписываются по числам.
8. Тесты: транш №1 при секьюринге; release по порядку с остатком в последнем;
   кап returnPrincipal по выданному; distribute при полностью возвращённых
   выданных траншах mid-project; write-off частично выданного: freeFunds
   получает нераскрытое, убыток — только по выданному; release не-board /
   сверх лимита ревертится.

## 5. Залог менеджера и слэшинг по вердикту — ✅ выполнено

**Цель:** обеспечение исполнения БЕЗ переноса коммерческого риска на
мудариба: залог изымается только вердиктом совета за недобросовестность /
небрежность / нарушение условий (SS 13 разд. 6; yad amanah — SS 13 8/7).
Автоматический слэшинг за убыток ЗАПРЕЩЁН.

1. Поля в конец `Manager`: `uint collateral; uint activeProjects;`.
   `activeProjects` ++ при секьюринге, −− при `principalReturned ==
   fundsRequired` (полный возврат) и при `writeOffProposal`.
2. `postCollateral(uint amount) payable` — только менеджер; `_pull`;
   `CollateralPosted(manager, amount)`.
3. `withdrawCollateral(uint amount)` — только менеджер;
   `require(activeProjects == 0)`; зачисляется в `withdrawable` (pull);
   `CollateralWithdrawn(manager, amount)`.
4. `slashCollateral(address manager, uint proposalId, uint amount, string
   reason)` — только board (вердикт = сам вызов, `reason` фиксирует
   основание); require: менеджер предложения, `secured`, `!writtenOff`,
   `amount <= collateral`, `amount <= _releasedAmount(p) −
   principalReturned` (компенсация не выше недостачи). Эффект: залог ↓,
   `principalReturned` ↑, `freeFunds` ↑ — компенсация капитала;
   `CollateralSlashed(manager, proposalId, amount, reason)`.
5. Тесты: пост/вывод залога; вывод при активном проекте ревертится; слэш
   не-board ревертится; слэш капится залогом и недостачей; слэш уменьшает
   будущий убыток write-off ровно на сумму компенсации; activeProjects
   корректен на возврате и списании.

## 6. Multi-chain UI — ✅ выполнено

**Цель:** селектор сети поверх `webapp/src/abi/deployments/*.json`.

1. Модуль `webapp/src/deployments.js`: `import.meta.glob('./abi/deployments/
   *.json', { eager: true })` → карта chainId → деплой; активный выбор — из
   `localStorage['sheikhfi:chain']`, иначе бандлированный
   `abi/deployment.json`.
2. Все импорты `abi/deployment.json` в webapp заменить на
   `getActiveDeployment()` из этого модуля (state, Sidebar, Desk, Treasury,
   Overview, Activity).
3. Селектор сети в сайдбаре (список — пересечение карты деплоев и
   `networks.js`); смена: записать выбор в localStorage и `location.reload()`
   (полная пересборка хуков — осознанно простое решение).
4. Приёмка: билд зелёный; переключение 84532 ↔ 31337 меняет адрес контракта
   в Treasury; e2e-смок проходит (его деплой пишет 31337 и активную копию).

## 7. Деплой v3 в Base Sepolia и обновление демо — ⏳ заблокировано секретами

1. Секреты (нет на машине — нужен ввод пользователя): `DEPLOYER_PRIVATE_KEY`
   (можно свежий: `node -e 'const {ethers}=require("ethers"); const
   w=ethers.Wallet.createRandom(); console.log(w.address, w.privateKey)'`) и
   `CDP_API_KEY_ID/SECRET`, `CDP_WALLET_SECRET` для крана; `ETHERSCAN_API_KEY`
   для верификации. Всё в `.env` (gitignored).
2. `node scripts/faucet.mjs` — пополнить деплойер (0.0001 ETH хватает при
   базовой цене газа Base Sepolia; деплой v3 ≈ 4–5M газа).
3. `npx hardhat run deploy.js --network baseSepolia` — конструктор
   `("Ali", 60, address(0))`; скрипт пишет `deployments/84532.json` + активную
   копию; board = деплойер (сменить потом `setBoard`).
4. `npx hardhat verify --network baseSepolia <адрес> "Ali" 60
   0x0000000000000000000000000000000000000000` (при наличии ключа).
5. Обновить в README таблицу «Текущий деплой» (адрес, блок; старый адрес — в
   строку «архив»); онбординг Bob/Charlie — `node scripts/onboard.mjs`.
6. Коммит + push в `main`: CI (pages.yml) прогонит тесты и опубликует демо на
   gh-pages автоматически.

## 8. Бэкенд-очередь (СЕЙЧАС НЕ ВЫПОЛНЯТЬ)

- **Индексер** (Ponder/subgraph) вместо клиентского скана логов; read-only
  режим для регулятора уже работает (браузер без кошелька читает контракт
  через публичный RPC).
- **seed.mjs** — кран + онбординг одной командой (CDP-кран, нужны секреты).
- **Слэшинг-арбитраж как процесс**: несколько членов совета, мультиподпись
  вердикта, тайм-лок на слэш.
