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
- Коммиты: одно слово, по компонентам, без trailer-ов. Push не выполнять —
  его делает пользователь (демо на gh-pages пересобирается CI при push в main).

## Выполнено

Выполненные разделы схлопнуты до записей: спецификация исполнена, её
живое описание — README.md (механика), STANDARDS.md (трассировка на пункты
и тесты) и сами тесты. Метод написания спецификаций — AGENTS.md.

| Раздел | Итог | Где смотреть |
| --- | --- | --- |
| Токенизация долей (ERC-20) | SHFI: balanceOf = вклад, пермиссионные переводы, mint/burn на deposit/exit/write-off | STANDARDS §12; describe «Tokenized shares» |
| Деноминация в стейблкоине | `constructor(…, asset)`; `_pull`/`_pay`; полный цикл в токенах | describe «Token denomination» |
| Шариатский совет + документы | `board`, `certifyProposal`, `docsHash`; голос только после сертификации | STANDARDS §9; describe «Sharia board» |
| Milestone-транши | резерв целиком, выдача по вехам советом; `_releasedAmount` ограничивает возврат/прибыль/списание | describe «Tranches» |
| Залог + слэшинг по вердикту | `postCollateral`/`withdrawCollateral`/`slashCollateral(reason)`; только за нарушение | STANDARDS §11; describe «Collateral» |
| Multi-chain UI | `webapp/src/deployments.js` + селектор в сайдбаре; активный деплой в localStorage | README «Структура» |
| Деплой v3 в Base Sepolia | `0xE0b29B49Af548a7cBAf7CaAc999197D895d8D0E0`, участники перенесены | README «Тестовая сеть» |
| Волна v5 — шариатский аудит 2026-07-17 | неттинг выручки при списании (без фии/owner-cut, Halmos-доказано); notice на выход; гейт переводов до первого проекта; слэш после списания восстанавливает доли; сертификация только при board ≠ owner | STANDARDS §8, §9, §11–§13; describe «Волна v5»; `check_writeOffNetsRevenue` |
| Волна v4 — верификация | Halmos: 6 доказательств самого контракта, мутационно проверены; Foundry-кампания 256×64, fail_on_revert, Reverts=0; SMTChecker (CHC+Eldarica): 0 нарушений assert, 51 unproved overflow (ревёрты ≥0.8); машинная трассировка STANDARDS; выбор инструментов и сравнение — в истории git этого файла | STANDARDS «Формальная верификация», «SMTChecker», «Машинная проверка трассировки»; `.verify/` |
| Волна v6 — выбор совета партнёрами | GS 19 ¶12 реализован: `nominateBoard(candidate, cvHash)` (кандидат не owner/менеджер) → взвешенное `approveBoard` (порог пула) → двухшаговый `acceptBoardSeat`; `setBoard` — только бутстрап до первого разделения; перевыборы = процедура отзыва | STANDARDS §9 (✅); describe-тесты «board election…»; Members → карточка «Sharia board — elected by the partners» |
| E2E v5-потоков | `e2e/tests/v5-flows.spec.js`: injected-wallet shim (анлокнутые аккаунты hardhat), notice → warp 48h → exit глазами партнёра; Treasury показывает нетто-прогноз «3 ETH net loss (revenue nets first)» и списание — глазами owner | `docker compose --profile e2e up` — 2 passed |
| Аудит-волна 2026-07-18 | деплой v5 в Base Sepolia + Basescan-верификация; UI: метки notice-событий, чистый нетто-прогноз списания в Treasury, чипы v5-состояния в Overview; guard «Owner is board»; машинная трассировка `check-traceability.mjs` (в verify.sh, отриц. контроль пройден); SMTChecker-базлайн `scripts/smtcheck.sh` | README «Тестовая сеть»; STANDARDS «Машинная проверка трассировки»; `.verify/smtchecker.out` |

Ранее выполненные волны (экономика v2, жизненный цикл, ownership, кэш
Activity, контейнерный E2E) описаны там же: README — механика,
STANDARDS.md — соответствие, тесты — поведение.

## Очередь (бэкенд; по отдельному запуску)

Пополнение по аудиту 2026-07-18; выполненное схлопнуто в
«Выполнено» (UI-мелочи v5, guard `acceptOwnership`, Basescan-верификация,
машинная трассировка, SMTChecker):



- **Индексер** (Ponder/subgraph) вместо клиентского скана логов; read-only
  режим для регулятора уже работает (браузер без кошелька читает контракт
  через публичный RPC).
- **seed.mjs** — кран + онбординг одной командой (CDP-кран, нужны секреты).
- **Слэшинг-арбитраж как процесс**: несколько членов совета, мультиподпись
  вердикта, тайм-лок на слэш.
