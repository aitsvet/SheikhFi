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
- Порог одобрения (approval threshold) устанавливается при создании контракта
- Только после достижения порога одобрения средства зачисляются на счёт управляющего — он может получить их через функцию `withdraw()`

### Распределение прибыли
- При получении дохода от проекта, управляющий переводит средства в контракт
- Владелец контракта запускает распределение прибыли
- Прибыль распределяется между:
  - Управляющим (по установленной ставке)
  - Инвесторами (по их доле в общем фонде)
  - Владельцем контракта (операционные расходы)
- Средства не отправляются автоматически — каждый участник вызывает `withdraw()` для получения своей доли. Доля инвестора фиксируется в момент вызова `withdraw()` или явного вызова `settle()`

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

Роль (Council / Operator / Partner / Guest) определяется по адресу подключённого MetaMask через `isManager`, `isInvestor` и сравнение с `owner()`. Адресу `owner` соответствует Council-роль; одобрение проектов доступно Council и Partner.

Метаданные сети (имя, обозреватель, RPC, native-токен) описаны в `webapp/src/networks.js`. При подключении кошелька веб-приложение автоматически переключает MetaMask на нужный chainId (или добавляет сеть, если её нет).

## Тестовая сеть

Контракт развёрнут в **Base Sepolia** (`chainId 84532`, RPC `https://sepolia.base.org`, обозреватель `https://sepolia.basescan.org`). Это рекомендация из `~/papers/cryptosarf/TESTNETS.md`: единственный публичный testnet в 2026 году с программным faucet без mainnet-gate — Coinbase Developer Platform.

Текущий деплой:

| Поле | Значение |
| --- | --- |
| Адрес контракта | `0x3743aCa3d2ED36744703C36c6AfB27B8E3A444Db` |
| Владелец | `0xb853A9B863886F421204DcA86CB56dc3416Fc807` (`Ali`) |
| Approval threshold | 60% |

Архивный деплой в Polygon Amoy (`0x408f311ff021e4bba7a3088b6a1c4af1a9c23994`) больше не используется веб-приложением, но сохранён в `webapp/src/networks.js` как известная сеть для обратной совместимости.

## Как запустить (локально)

```bash
nvm use v20.19.0

npm install

npx hardhat compile

npx hardhat test

# локальный демо-режим: hardhat node + посев Bob+Charlie
npx hardhat node                                  # в другом терминале
npx hardhat run deploy.js --network localhost
cd webapp && npm run dev
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

# 4. Скомпилировать и развернуть контракт
npx hardhat compile
npx hardhat run deploy.js --network baseSepolia
# обновится webapp/src/abi/deployment.json: contractAddress, abi, owner, chainId, network

# 5. Собрать веб-приложение и положить артефакты в корень gh-pages
cd webapp && npm run build && cd - && rm -rf assets && cp -r webapp/dist/* .

# 6. Зафиксировать и запушить ветку gh-pages
git add -A && git commit -m "deploy" && git push origin gh-pages
```

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

## Структура репозитория

```
contracts/
  SheikhFi.sol            смарт-контракт пула + предложений + распределения
  BadReceiver.sol         тестовый «злой получатель»: контракт-инвестор, который реверт-ит при получении ETH
test/
  *.js                    hardhat-тесты (59 passing)
deploy.js                 скрипт деплоя (поддерживает localhost и baseSepolia)
hardhat.config.js         сети: hardhat / localhost / baseSepolia / amoy; ключ из .env
scripts/
  faucet.mjs              CDP-faucet → деплойер на Base Sepolia (0.0001 ETH)
  onboard.mjs             addInvestor / addManager от имени Council
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
    hooks/
      useWallet.js        подключение MetaMask + auto-switch chain
      useContractStatus.js
      useDetails.js
      useRole.js
    abi/deployment.json   адрес контракта, ABI, owner, chainId, network (пишется deploy.js)
    bg.png                фон, бандлируется vite-ом как хешированный asset
assets/, index.html       артефакты сборки, опубликованные на gh-pages
.env.example              шаблон переменных окружения
```

## Безопасность ключей

- `.env` находится в `.gitignore`. Содержит приватный ключ деплойера и секреты CDP.
- Веб-приложение не имеет доступа к `DEPLOYER_PRIVATE_KEY` — оно подписывает транзакции через MetaMask пользователя.
- Серверные операции (faucet, onboarding) выполняются Node-скриптами в `scripts/`, которые читают ключ только из `.env`.
- Для продакшна рекомендуется заменить plaintext-ключ в `.env` на encrypted keystore (`cast wallet import`) или KMS (см. `~/papers/cryptosarf/TESTNETS.md §3.7`).

## Дальнейшее развитие

- **Etherscan-верификация** контракта в Base Sepolia: добавить `@nomicfoundation/hardhat-verify` и `ETHERSCAN_API_KEY` (V2-ключ покрывает все сети, включая Base).
- **Multi-chain UI**: `webapp/src/networks.js` уже структурирован под N сетей; добавить селектор сети и хранить `deployments/<chainId>.json` отдельно.
- **Programmatic onboarding для демо**: расширить `faucet.mjs` так, чтобы он одновременно пополнял адрес пользователя и звал `addInvestor` от имени Council — один шаг для нового тестового участника.
- **Доступ для регулятора**: read-only маршрут с `viem.createPublicClient` без wagmi/MetaMask, индексатор событий (Ponder) — паттерн из `cryptosarf/TESTNETS.md §2.7`.
