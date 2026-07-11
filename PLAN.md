# PLAN — крупные изменения SheikhFi

Спецификации для исполнителя. Каждый раздел самодостаточен: точные сигнатуры,
инварианты, требования к тестам и критерии приёмки. Выполнять по одному
разделу за раз, в указанном порядке; после каждого раздела — полный прогон.

Ссылки вида «SS 12 3/1/5/4» — пункты стандартов AAOIFI; дословные цитаты и
статус соответствия см. в `STANDARDS.md`.

## Правила для исполнителя (читать первым)

- Все команды — через compose-тулбокс, НЕ на хосте:
  `docker compose run --rm node '<команда>'`.
- Полный прогон = `npm ci && npx hardhat test` в корне; `cd webapp && npm ci
  && npm run lint && npm run build`. Всё должно быть зелёным до и после
  каждого раздела.
- Живой контракт в Base Sepolia (`webapp/src/abi/deployments/84532.json`)
  имеет СТАРЫЙ ABI. Webapp обязан не падать на старом ABI: новые поля/методы
  читать с fallback (`p[6] ?? undefined`, `try/catch` вокруг вызовов),
  как уже сделано для `getApprovers` в `useContractStatus.js`.
- В `Proposal` добавлять поля ТОЛЬКО в конец структуры — существующие индексы
  `p[0]..p[5]` в webapp и скриптах должны остаться валидными.
- Изменение сигнатуры `submitProposal`/`depositFunds`/конструктора запрещено —
  вместо этого добавлять новые функции или параметры контракта с сеттерами.
- Коммиты: одно слово, по компонентам (`contract`, `webapp`, `docs`, …),
  без trailer-ов. Не пушить.

## 1. Жизненный цикл предложения

**Цель:** голос с фиксированным весом, дедлайн голосования, отмена. Закрывает
«живой вес голоса» из аудита и снижает гарар по SS 31 4/2/1 (меньше
неопределённости в условиях сделки).

Контракт (`contracts/SheikhFi.sol`):

1. В `struct Proposal` добавить В КОНЕЦ: `uint approvalWeight;`,
   `uint deadline;`, `bool cancelled;`.
2. Добавить `uint public votingPeriod = 30 days;` и
   `function setVotingPeriod(uint p) external onlyOwner { require(p >= 1 days && p <= 365 days, "Bad period"); votingPeriod = p; emit VotingPeriodChanged(p); }`.
3. Добавить `function setApproveShareThreshold(uint t) external onlyOwner { require(t >= 1 && t <= 100, "Bad threshold"); approveShareThreshold = t; emit ThresholdChanged(t); }`.
4. `submitProposal`: заполнять новые поля
   `(…, 0, block.timestamp + votingPeriod, false)`.
5. Добавить `mapping(uint => mapping(address => bool)) public hasVoted;`.
6. Переписать `approveProposal`:
   - `require(!proposals[proposalId].cancelled, "Cancelled");`
   - `require(block.timestamp <= proposals[proposalId].deadline, "Voting closed");`
   - вместо цикла по `approvers[proposalId]` (удалить цикл целиком):
     `require(!hasVoted[proposalId][msg.sender], "Already voted");`
     `hasVoted[proposalId][msg.sender] = true;`
   - вес фиксируется в момент голоса:
     `proposals[proposalId].approvalWeight += investors[msg.sender].fundsInvested;`
   - порог: `if (proposals[proposalId].approvalWeight * 100 / totalFunds >= approveShareThreshold) { … }` — тело ветки без изменений.
   - `emit ProposalApproved(proposalId, msg.sender, proposals[proposalId].approvalWeight);` оставить (аргумент — накопленный вес).
7. Добавить
   `function cancelProposal(uint proposalId) external { Proposal storage p = proposals[proposalId]; require(msg.sender == p.manager || msg.sender == owner, "Not authorized"); require(!p.secured, "Already funded"); require(!p.cancelled, "Cancelled"); p.cancelled = true; emit ProposalCancelled(proposalId); }`.
8. События: `event ProposalCancelled(uint indexed proposalId);`,
   `event ThresholdChanged(uint threshold);`, `event VotingPeriodChanged(uint period);`.

Тесты (`test/SheikhFi.test.js`; для времени —
`const { time } = require("@nomicfoundation/hardhat-network-helpers");`):

- вес голоса зафиксирован: ali голосует при 10/30, докладывает +50 ETH,
  bob голосует (20) → `approvalWeight == 30`, предложение НЕ засекьюрено
  (30*100/80 = 37.5 < 60);
- `time.increase(30*24*3600 + 1)` → голос ревертится `Voting closed`;
- отмена менеджером и owner-ом проходит; посторонним — `Not authorized`;
  голос по отменённому — `Cancelled`; отмена засекьюренного — `Already funded`;
- сеттеры: не-owner ревертится `Not owner`; границы (`0`, `101`, `> 365 days`)
  ревертятся; события эмитятся;
- газ голосования не растёт с числом голосов (замерить 2-й и 10-й голос,
  разница < 10%).

Webapp:

- `useContractStatus.js`: в объект предложения добавить
  `approvalWeight: p[6]`, `deadline: p[7]`, `cancelled: p[8]`
  (все — с `?? undefined` — старый ABI вернёт 6 полей).
- `state.jsx` `approvalShareFor`: если `p.approvalWeight !== undefined` —
  `Number(p.approvalWeight * 1000n / totalFunds) / 10`, иначе старый расчёт.
- `state.jsx`: добавить мутацию `cancelProposal` через `run(…)`.
- `Proposals.jsx` `ProposalCard`: бейдж `Cancelled` (tone="") при
  `p.cancelled === true`; бейдж `Expired` (tone="warn") при
  `!p.secured && p.deadline && Number(p.deadline) * 1000 < Date.now()`;
  кнопку Approve скрывать для cancelled/expired; кнопку Cancel показывать
  менеджеру предложения и owner-у, пока `!secured && !cancelled`.
- `Activity.jsx`: EVENT_META + describe для `ProposalCancelled`,
  `ThresholdChanged`, `VotingPeriodChanged`.

Приёмка: полный прогон зелёный; в UI против СТАРОГО деплоя (84532) экраны
работают, новых бейджей нет, ошибок в консоли нет.

## 2. Передача ownership (двухшаговая)

**Цель:** потеря ключа owner-а не должна навсегда блокировать распределение
и онбординг.

Контракт:

1. `address public pendingOwner;`
2. `function transferOwnership(address n) external onlyOwner { require(isInvestor(n), "Not investor"); pendingOwner = n; emit OwnershipTransferStarted(owner, n); }`
   — новый owner обязан заранее быть онборженным инвестором, иначе учёт
   owner-доли в `_accrue` пишет в пустую запись.
3. `function acceptOwnership() external { require(msg.sender == pendingOwner, "Not pending owner"); _accrue(msg.sender); investors[msg.sender].profitRate = 100; address old = owner; owner = msg.sender; ownerNickname = investors[msg.sender].nickname; pendingOwner = address(0); emit OwnershipTransferred(old, msg.sender); }`
   ВАЖНО: `_accrue(msg.sender)` строго ДО смены `profitRate` и ДО смены
   `owner` — иначе накопленное до передачи будет пересчитано по новой ставке.
4. Ставку старого owner-а не трогать (остаётся 100 — «эмерит» ничего не отдаёт
   новому owner-у; это осознанное решение, зафиксировать комментарием).
5. События: `event OwnershipTransferStarted(address indexed from, address indexed to);`,
   `event OwnershipTransferred(address indexed from, address indexed to);`.

Тесты: transfer на не-инвестора ревертится; accept не-pending ревертится;
после accept: `owner()` сменился, у нового owner-а `profitRate == 100`,
прибыль, начисленная ДО передачи, зачислена по его старой ставке (проверить
числом); `onlyOwner`-функции работают у нового и ревертятся у старого.

Webapp: `useRole.js` — определять owner-а по живому `await contract.owner()`
в `try/catch`, fallback на `deployment.owner` (старый ABI имеет `owner()`,
так что fallback сработает только при недоступном RPC).

## 3. Activity: кэш сканирования + индикация ошибок RPC

**Цель:** убрать полный рескан истории при каждом открытии (сейчас — тысячи
`eth_getLogs` спустя месяцы после деплоя) и перестать молча глотать ошибки.

`webapp/src/hooks/useEvents.js`:

1. Ключ кэша: `sheikhfi:events:v1:<contractAddress в lowercase>`.
2. Структура в localStorage (только JSON-безопасные типы, БЕЗ BigInt):
   `{ lastBlock: number, logs: [{ topics: string[], data: string, blockNumber: number, txHash: string, logIndex: number, timestamp: number }] }`.
3. Алгоритм: прочитать кэш → сканировать чанками по 800 только
   `[cache.lastBlock + 1, latest]` (при пустом кэше — от `deployBlock`) →
   для новых логов получить timestamps → дописать в кэш,
   `lastBlock = latest` записывать ТОЛЬКО если ни один чанк не упал →
   декодировать ВСЕ логи (кэш + новые) через `contract.interface.parseLog`
   на каждом рендере списка (декод дешёвый, кэшировать его не нужно).
4. Ошибки: счётчик упавших чанков; вернуть из хука
   `{ events, loading, failedChunks }`. При `failedChunks > 0` НЕ обновлять
   `lastBlock` (иначе дыра в истории зафиксируется навсегда).
5. `Activity.jsx`: при `failedChunks > 0` в sub карточки —
   `"${events.length} events · ${failedChunks} range(s) failed — log may be incomplete"`.
6. Кэш инвалидировать при несовпадении сохранённого адреса контракта с
   текущим (ключ уже содержит адрес — достаточно).

Тест руками (нет юнит-тестов webapp): открыть Activity против 84532 дважды;
во второй раз — мгновенная загрузка, в Network-панели нет getLogs по старым
диапазонам.

## 4. Экономика v2 — полный цикл капитала

**Цель:** закрыть разрывы ❌ из STANDARDS.md: fee менеджера от прибыли, а не
от выручки (SS 13 8/1; SS 12 3/1/3/3); прибыль только после восстановления
капитала (SS 13 8/7; SS 12 3/1/5/6); распределение убытков (SS 12 3/1/5/4);
выход партнёра по NAV, не по номиналу (SS 12 3/1/6/2, 3/1/5/9).

Это НОВЫЙ контракт (v2) и новый деплой; обратная совместимость ABI не
требуется, но webapp должен продолжать работать со старым деплоем 84532
(feature-detect по наличию методов).

Семантика:

1. **Возврат тела.** В `Proposal` добавить `uint principalReturned;`.
   Новая функция `returnPrincipal(uint proposalId) external payable`:
   только менеджер предложения; `principalReturned += msg.value`;
   `freeFunds += msg.value`; БЕЗ комиссий (SS 13 8/1 — fee только с прибыли);
   `require(principalReturned <= fundsRequired… )` — излишек сверх тела
   отправлять через `receiveRevenue`. Событие
   `PrincipalReturned(proposalId, amount)`.
2. **Прибыль = выручка, признанная только после возврата тела.**
   `distributeRevenue`: распределять можно только когда
   `principalReturned == fundsRequired` ИЛИ предложение закрыто списанием
   (см. п. 3); `managerFee` считать как прежде, но от выручки, которая теперь
   по построению является прибылью (тело вернулось отдельным потоком).
3. **Списание убытка.** `writeOffProposal(uint proposalId)` — только owner,
   только для secured-предложения; невозвращённое тело
   `loss = fundsRequired − principalReturned` списывается со ВСЕХ инвесторов
   пропорционально: `lossPerShare += loss * SCALE / totalFunds`, у каждого
   инвестора при следующем `_accrue` уменьшить `fundsInvested` на
   `lossPerShare-дельту * fundsInvested / SCALE` (зеркально механике
   `cumulativePerShare`; хранить у инвестора `lossCheckpoint`);
   `totalFunds -= loss`. Менеджер по умолчанию НЕ отвечает (SS 13 8/7 —
   yad amanah); его ответственность — оффчейн-процедура (см. §6 «Расширения»,
   слэшинг только за taddi/taqsir по SS 13 разд. 6).
4. **Выход партнёра.** `exit(uint amount)` — инвестор забирает из
   `freeFunds` не больше своей текущей доли: `require(amount <= fundsInvested
   после применения убытков)`; `fundsInvested -= amount; totalFunds -= amount;
   freeFunds -= amount;` выплата через `withdrawable` (pull). Перед изменением
   доли — обязательный `_accrue(msg.sender)`. Это выход по факту
   восстановленного капитала (конструктивная оценка по SS 12 3/1/5/9:
   свободные средства = уже реализованная стоимость; вложенное в живые
   проекты выйти не может до возврата/списания).
5. Инварианты (закрепить тестами):
   - `address(this).balance >= freeFunds + Σ withdrawable` после каждой операции;
   - `totalFunds == Σ fundsInvested` (после применения lossPerShare ко всем);
   - повторный `writeOffProposal` ревертится; `returnPrincipal` после
     списания ревертится;
   - выход при пустом `freeFunds` ревертится; выход не трогает чужие доли.
6. Тесты писать ПЕРВЫМИ (сценарии: полный цикл с возвратом тела и прибылью;
   проект с частичным возвратом + списание; выход до/после списания;
   fee менеджера не начисляется на возвращённое тело — сравнить с v1-числами).

Webapp: Operator desk — форма «Return principal» рядом с «Deliver revenue»;
Treasury — колонка `principalReturned`; Partner desk — форма Exit
(max = моя доля, доступно при `freeFunds > 0`); все — feature-detect
(`if (!contract.returnPrincipal) скрыть`).

## 5. Контейнерный E2E

**Цель:** сквозной прогон «deploy → webapp → сценарий» в compose, без ручных
шагов. Референс уже есть в этом репо: тулбокс-сервис в `docker-compose.yml`.

1. Сервис `chain`: image `node:20.19.0`, команда
   `npx hardhat node --hostname 0.0.0.0`, healthcheck — JSON-RPC
   `eth_blockNumber` на `:8545`.
2. Сервис `deploy`: зависит от healthy `chain`;
   `npx hardhat run deploy.js --network localhost` с RPC `http://chain:8545`
   (добавить в `hardhat.config.js` сеть `localhost` с
   `url: process.env.LOCALHOST_RPC_URL || 'http://127.0.0.1:8545'`).
3. Сервис `webapp`: `cd webapp && npm ci && npm run build && npm run preview
   -- --host 0.0.0.0 --port 5173`; healthcheck — fetch `/`.
4. Сервис `e2e`: playwright-образ
   (`mcr.microsoft.com/playwright:v1.x-jammy`), сценарий: открыть webapp,
   проверить Overview KPI, список предложений, Members. Без MetaMask
   (read-only достаточно для смок-теста; кошельковые сценарии — вне объёма).
5. Все новые сервисы — под `profiles: ["e2e"]`, чтобы не мешали тулбоксу.
   Запуск: `docker compose --profile e2e up --abort-on-container-exit e2e`.

Приёмка: один вызов команды выше проходит зелёным на чистой машине.

## 6. Расширения (после v2, по одному, каждое — отдельное согласование)

- **Токенизация долей** (ERC-20/ERC-4626 поверх учёта v2) — допустимо по
  SS 17 3/6 и 5/2/16 (торговля после начала деятельности); `fundsInvested` →
  баланс токена, `cumulativePerShare`/`lossPerShare` — как в v2.
- **Стейблкоин вместо ETH** (USDC на Base): все `msg.value` → `transferFrom`,
  `withdraw` → `transfer`; меньше валютного гарара в учёте RWA.
- **Milestone-транши**: `fundsRequired` разбивается на транши, каждый
  открывается отдельным голосованием; уменьшает аванс доверенному лицу.
- **Слэшинг менеджера — только за нарушение** (SS 13 разд. 6: гарантии
  изымаются только при «misconduct, negligence or breach of contract»):
  залог + арбитражная роль (шариатский совет) с ончейн-вердиктом; НЕ
  автоматический слэшинг за убыток.
- **Шариатский совет**: роль `board`, обязательная подпись на предложении до
  начала голосования + IPFS-хэш документов актива в `Proposal` (снижение
  гарара, SS 31 4/2/1).
- **Индексер** (Ponder/subgraph) вместо клиентского скана логов + read-only
  маршрут для регулятора (viem `createPublicClient`, без MetaMask).
- **Multi-chain UI**: селектор сети поверх `webapp/src/abi/deployments/*.json`
  (файлы уже пишутся per-chain, см. `scripts/use-deployment.mjs`).
- **`seed.mjs`**: faucet + onboard одной командой для нового участника демо.
