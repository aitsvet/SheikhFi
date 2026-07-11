Презентация: [SheikhFiDApp.pdf](./SheikhFiDApp.pdf)

Видео: [20250720 Алексей Цветков Шейх-fi Singularity x БАШНЯ](https://vkvideo.ru/video-231417225_456239019)

Демо: [Шейх-Fi DApp в сети Base Sepolia](https://aitsvet.github.io/SheikhFi)

# SheikhFi - Исламская DeFi платформа

SheikhFi реализует принципы исламского финансирования (Islamic Finance) в децентрализованной среде. Основные принципы исламского финансирования воплощены в следующих механизмах:

### Партнёрство инвесторов (Musharaka)
- Инвесторы объединяют свои средства в общий фонд
- Каждый инвестор имеет право голоса при принятии решений об использовании общих средств
- Прибыль и убытки распределяются пропорционально вложенным средствам

### Доверительное управление (Mudaraba)
- Управляющие (менеджеры) получают средства от инвесторов для реализации инвестиционных проектов
- Управляющие несут ответственность за эффективное использование средств
- Прибыль от проектов распределяется между инвесторами и управляющими по заранее установленным ставкам

### Реальные активы как обеспечение
- Все инвестиционные сделки должны быть обеспечены реальными активами
- Управляющие должны предоставить описание проекта и требуемую сумму финансирования
- Проекты проходят процедуру одобрения инвесторами перед финансированием

### Механизм одобрения проектов
- Для финансирования проекта необходимо получить одобрение от инвесторов, владеющих определённой долей от общего фонда
- Порог одобрения (approval threshold) устанавливается при создании контракта и может быть изменён владельцем (`setApproveShareThreshold`)
- Вес голоса фиксируется в момент голосования — последующие депозиты или выходы не меняют уже поданные голоса
- Голосование ограничено дедлайном (`votingPeriod`, по умолчанию 30 дней); незасекьюренное предложение может отменить его автор или владелец (`cancelProposal`)
- Только после достижения порога одобрения средства зачисляются на счёт управляющего — он может получить их через функцию `withdraw()`

### Полный цикл капитала (v2)
- Тело инвестиции управляющий возвращает отдельно (`returnPrincipal`) — без комиссий, средства сразу пополняют свободный пул
- Прибыль (`receiveRevenue` → `distributeRevenue`) признаётся **только после полного возврата тела** — до этого распределение ревертится (`Principal outstanding`)
- Прибыль распределяется между:
  - Управляющим (по установленной ставке — теперь строго из прибыли, не из оборота)
  - Инвесторами (по их доле в общем фонде)
  - Владельцем контракта (операционные расходы)
- Невозвращённое тело провалившегося проекта владелец списывает (`writeOffProposal`) — убыток ложится на всех инвесторов строго пропорционально долям
- Инвестор может выйти из пула (`exit`) в пределах свободных средств; доля к выходу уже амортизирована списанными убытками
- Средства не отправляются автоматически — каждый участник вызывает `withdraw()` для получения своей доли. Доля инвестора фиксируется в момент вызова `withdraw()` или явного вызова `settle()`
- Владелец передаётся в два шага (`transferOwnership` → `acceptOwnership`); новый владелец обязан заранее быть инвестором

Трассировка этих механизмов на пункты стандартов AAOIFI — в [STANDARDS.md](./STANDARDS.md).

### Соответствие принципам Шариата
- Запрет на ростовщичество (риба) - нет гарантии возврата инвестиций с фиксированной надбавкой
- Запрет на спекуляцию (гарар) - все сделки основаны на реальных активах
- Запрет на азартные игры (майсир) - прибыль основана на реальной экономической деятельности
- Прозрачность и справедливость в распределении рисков и прибыли

## Архитектура веб-приложения

Консольный многоэкранный интерфейс (sidebar + main column), пять экранов:

| Экран | Содержимое |
| --- | --- |
| **Overview** | KPI-полоса (Total / Free / Revenue / Threshold), топ-3 предложения, панель принципов Musharaka/Mudaraba |
| **Desk** (роль-зависимый) | Council — онбординг партнёров и операторов · Operator — подача предложения и доставка выручки · Partner — депозит, моя позиция, предложения на голосование · Guest — приглашение подключить кошелёк |
| **Proposals** | Карточки предложений с фильтрами (All / Pending / Secured / Settled), прогресс-бар с отметкой порога одобрения, кнопка Approve |
| **Treasury** | Deployed / Free / Settled KPI, ссылка на контракт в обозревателе сети, история выручки, панель «Distribute revenue» (только для Council) |
| **Members** | Партнёры (Musharaka) и операторы (Mudaraba) с аватарами и статистикой |
| **Activity** | Хронологический фид всех событий контракта (InvestorAdded, ManagerAdded, FundsDeposited, ProposalSubmitted, ProposalApproved, ProposalFunded, RevenueReceived, RevenueDistributed, Withdrawn) с ссылками на транзакции в обозревателе |

Роль (Council / Operator / Partner / Guest) определяется по адресу подключённого MetaMask через `isManager`, `isInvestor` и сравнение с `owner()`. Адресу `owner` соответствует Council-роль; одобрение проектов доступно Council и Partner.

Метаданные сети (имя, обозреватель, RPC, native-токен) описаны в `webapp/src/networks.js`. При подключении кошелька веб-приложение автоматически переключает MetaMask на нужный chainId (или добавляет сеть, если её нет).

Поле `deployBlock` в `webapp/src/abi/deployment.json` — номер блока, в котором был размещён контракт. Экран **Activity** опирается на него, чтобы не сканировать всю историю сети: он перебирает блоки от `deployBlock` до `latest` чанками по 800 (лимит публичного RPC `eth_getLogs`) и декодирует все события контракта одним фильтром по адресу. `deploy.js` записывает это поле автоматически.

## Тестовая сеть

Контракт развёрнут в **Base Sepolia** (`chainId 84532`, RPC `https://sepolia.base.org`, обозреватель `https://sepolia.basescan.org`): на 2026 год это единственный публичный testnet с программным faucet без mainnet-gate — через Coinbase Developer Platform.

Текущий деплой:

| Поле | Значение |
| --- | --- |
| Адрес контракта | `0x3743aCa3d2ED36744703C36c6AfB27B8E3A444Db` |
| Владелец | `0xb853A9B863886F421204DcA86CB56dc3416Fc807` (`Ali`) |
| Approval threshold | 60% |

Архивный деплой в Polygon Amoy (`0x408f311ff021e4bba7a3088b6a1c4af1a9c23994`) больше не используется веб-приложением, но сохранён в `webapp/src/networks.js` как известная сеть для обратной совместимости.

## Как запустить (локально)

Тулчейн не ставится на хост — все команды идут через compose-тулбокс
(`docker-compose.yml`, node 20.19.0, репозиторий примонтирован):

```bash
docker compose run --rm node 'npm ci && npx hardhat test'
docker compose run --rm node 'cd webapp && npm ci && npm run lint && npm run build'

# локальный демо-режим: hardhat node + посев Bob+Charlie
docker compose run --rm node 'npx hardhat node'   # в другом терминале
docker compose run --rm node 'npx hardhat run deploy.js --network localhost'
docker compose run --rm node 'cd webapp && npm run dev'

# сквозной e2e: chain → deploy → webapp → playwright-смок, всё в контейнерах
docker compose --profile e2e up --abort-on-container-exit e2e
# локальный деплой переключает активную конфигурацию на 31337 — вернуть демо:
docker compose run --rm node 'node scripts/use-deployment.mjs 84532'
```

В режиме `localhost` `deploy.js` использует второй и третий signer hardhat-а как Bob (инвестор) и Charlie (управляющий) — демо-поток готов сразу.

## Как опубликовать в Base Sepolia

```bash
# 1. Создать кошелёк-деплойер (один раз) и положить ключ в .env
cp .env.example .env
# заполнить DEPLOYER_PRIVATE_KEY и DEPLOYER_ADDRESS
# (можно сгенерировать: node -e 'const {ethers}=require("ethers"); const w=ethers.Wallet.createRandom(); console.log(w.address, w.privateKey)')

# 2. Получить API-ключ CDP (Coinbase Developer Platform) и положить
#    CDP_API_KEY_ID / CDP_API_KEY_SECRET / CDP_WALLET_SECRET в .env
#    https://portal.cdp.coinbase.com/

# 3. Пополнить деплойер 0.0001 ETH через программный faucet
node scripts/faucet.mjs
# тот же скрипт принимает произвольные адреса и пополняет каждый:
# node scripts/faucet.mjs 0xPartner... 0xOperator...

# 4. Скомпилировать и развернуть контракт
npx hardhat compile
npx hardhat run deploy.js --network baseSepolia
# запишутся webapp/src/abi/deployments/<chainId>.json (пер-чейн снапшот)
# и webapp/src/abi/deployment.json (активная копия, её импортирует webapp);
# переключение активного деплоя: node scripts/use-deployment.mjs <chainId>

# 5. (опционально) верифицировать исходники на BaseScan
#    нужен ETHERSCAN_API_KEY (V2) в .env
npx hardhat verify --network baseSepolia <адрес> "Ali" 60
```

Публикация на GitHub Pages — автоматическая: workflow `pages.yml` на каждый
push в `main` гоняет тесты контракта и lint webapp, собирает `webapp/dist` и
force-пушит его orphan-коммитом в ветку `gh-pages` (или вручную через
workflow_dispatch). Руками ветку `gh-pages` трогать не нужно.

`deploy.js` понимает обе ситуации:
- если у сети несколько signer-ов (`hardhat`/`localhost`) — посев Bob + Charlie выполняется автоматически;
- если signer один (любой реальный testnet, включая `baseSepolia`) — посев пропускается, и онбординг участников делается отдельно через UI (Council desk) или через скрипт ниже.

## Добавление участников

В реальной сети развёрнутый контракт не знает ни про Bob-а, ни про Charlie-я. Council (владелец) добавляет адреса MetaMask пользователей через метод `addInvestor` или `addManager`. Два способа:

**Через UI.** Импортировать `DEPLOYER_PRIVATE_KEY` в MetaMask (или подключить уже существующий кошелёк, который является `owner`-ом контракта), открыть демо, переключиться на Base Sepolia — сайдбар покажет «Council desk», в нём поля «Onboard partner / operator».

**Через скрипт.** Деплойер остаётся серверным (ключ не уходит в MetaMask). Council вызывает контракт из CLI:

```bash
# партнёр (инвестор) с долей в прибыли 50%
node scripts/onboard.mjs investor 0xYour... "Имя" 50

# оператор (управляющий) с долей в выручке 20%
node scripts/onboard.mjs manager  0xYour... "Имя" 20
```

После подтверждения транзакции пользователь открывает демо, подключает свой MetaMask — роль определяется автоматически.

`profitRate` — это процент:
- для инвестора: доля валовой прибыли, которую он сохраняет до отчисления владельцу;
- для управляющего: доля выручки проекта, которую он удерживает до распределения между инвесторами.

## Мониторинг и отладка

`scripts/monitor.mjs` — фоновый «tail» состояния контракта. Опрашивает Base Sepolia каждые 5 секунд и пишет дифф к предыдущему снимку: новые предложения, новые голоса, флип `secured`, `revenueReceived` / `revenuePayed`, изменения балансов и `withdrawable` всех зарегистрированных участников.

```bash
node scripts/monitor.mjs                       # отслеживать всех инвесторов + менеджеров + владельца
node scripts/monitor.mjs 0xExtra...            # плюс произвольные адреса по CLI
```

Список отслеживаемых читается из контракта на старте (`getInvestorCount` / `getManagerCount`), так что после онбординга нового участника достаточно перезапустить скрипт — никаких правок кода.

## Структура репозитория

```
contracts/
  SheikhFi.sol            смарт-контракт пула + предложений + распределения
  BadReceiver.sol         тестовый «злой получатель»: контракт-инвестор, который реверт-ит при получении ETH
test/
  *.js                    hardhat-тесты (81 passing)
e2e/
  tests/smoke.spec.js     playwright-смок против контейнерного стека (read-only, без MetaMask)
deploy.js                 скрипт деплоя (поддерживает localhost и baseSepolia)
hardhat.config.js         сети: hardhat / localhost / baseSepolia / amoy; оптимизатор; ключи из .env
docker-compose.yml        compose-тулбокс: docker compose run --rm node '<cmd>' (node 20.19.0)
STANDARDS.md              трассировка механизмов контракта на пункты AAOIFI с цитатами
PLAN.md                   спецификации крупных изменений (жизненный цикл, ownership, экономика v2, e2e)
scripts/
  faucet.mjs              CDP-faucet → деплойер или указанные адреса на Base Sepolia (0.0001 ETH каждому)
  onboard.mjs             addInvestor / addManager от имени Council
  monitor.mjs             фоновый tail контракта: предложения, голоса, ревенью, балансы (5-секундный опрос)
  use-deployment.mjs      переключение активного деплоя на deployments/<chainId>.json
webapp/
  src/
    ui.jsx                примитивы интерфейса + formatEther/parseEther/shortAddr
    state.jsx             StoreProvider: подключение через ethers, чтение статуса контракта, обёртки мутаций
    networks.js           метаданные сетей (имя, обозреватель, RPC, native-токен)
    main.jsx              ReactDOM.createRoot + StoreProvider + App
    App.jsx               маршрутизатор экранов
    components/Sidebar.jsx
    screens/
      PageHead.jsx        заголовок страницы + WithdrawPill
      Overview.jsx        обзор
      Desk.jsx            Council / Operator / Partner / Guest
      Proposals.jsx       список + карточка предложения
      Treasury.jsx        состояние казны + Distribute (Council)
      Members.jsx         партнёры + операторы
      Activity.jsx        фид всех on-chain событий с timestamp и ссылками на tx
    hooks/
      useWallet.js        подключение MetaMask + auto-switch chain
      useContractStatus.js
      useDetails.js
      useRole.js
      useEvents.js        чтение и декодирование всех событий контракта от deployBlock (чанками по 800)
    abi/deployment.json   активный деплой: адрес, ABI, owner, chainId, network (пишется deploy.js)
    abi/deployments/      пер-чейн снапшоты деплоев (<chainId>.json)
    bg.webp               фон, бандлируется vite-ом как хешированный asset
assets/, index.html       артефакты сборки, опубликованные на gh-pages
.env.example              шаблон переменных окружения
```

## Безопасность ключей

- `.env` находится в `.gitignore`. Содержит приватный ключ деплойера и секреты CDP.
- Веб-приложение не имеет доступа к `DEPLOYER_PRIVATE_KEY` — оно подписывает транзакции через MetaMask пользователя.
- Серверные операции (faucet, onboarding) выполняются Node-скриптами в `scripts/`, которые читают ключ только из `.env`.
- Для продакшна рекомендуется заменить plaintext-ключ в `.env` на encrypted keystore (например, `cast wallet import`) или KMS.

## Дальнейшее развитие

Крупные изменения расписаны как исполняемые спецификации в [PLAN.md](./PLAN.md).
Разделы §1–§5 выполнены: жизненный цикл предложения (фиксированный вес голоса,
дедлайн, отмена), двухшаговая передача ownership, кэш Activity-скана,
экономика v2 (возврат тела, списание убытков, выход партнёра) и контейнерный
E2E. Открытая очередь — §6 «Расширения»: токенизация долей, стейблкоин,
milestone-транши, шариатский совет с IPFS-документами, индексер,
multi-chain UI, seed.mjs.

Соответствие механизмов контракта шариатским стандартам — с номерами пунктов
AAOIFI и дословными цитатами — в [STANDARDS.md](./STANDARDS.md); найденные
аудитом разрывы закрыты экономикой v2, единственная оставшаяся оговорка —
свободнотекстовое описание предмета сделки (гарар), её снимает §6 плана.
