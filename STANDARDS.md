# Трассировка SheikhFi на шариатские стандарты AAOIFI

Корпус: официальное английское издание AAOIFI Shari'ah Standards (aaoifi.com).
Формат ссылки: «AAOIFI SS <№>, п. <n/n/n>» — номер стандарта и пункта; цитаты
даны дословно по английскому изданию. Статусы: ✅ соответствует,
⚠️ соответствует с оговоркой.

## Механизмы контракта

### 1. Пул капитала с долями по вкладам — ✅

`depositFunds()` наращивает `fundsInvested` и `totalFunds`; прибыль делится
пропорционально `fundsInvested / totalFunds`.

> **AAOIFI SS 12, п. 3/1/5/3:** "In principle, the shares of profit may be in
> proportion to the percentage of each partner's contribution to the Sharikah
> capital."

### 2. Ставка прибыли фиксируется при вступлении — ✅

`addInvestor(…, profitRate)` задаёт долю до участия в прибыли; менять её
контракт не позволяет (изменение по обоюдному согласию стандарт допускает —
кандидат в расширения).

> **AAOIFI SS 12, п. 3/1/5/2:** "It is not permitted to defer the determination
> of the profit percentages due to each partner until the realisation of
> profit. The profit percentage for each partner must be determined at the
> conclusion of Sharikah contract."

### 3. Доля владельца-управляющего в прибыли партнёров — ⚠️

Owner получает `(100 − profitRate)%` от валовой прибыли каждого инвестора
(`_accrue`). Как **доля прибыли** работающему партнёру это допустимо; фиксом
(lump sum / % от капитала) быть не может, и повышенная доля не должна
доставаться «спящему» партнёру. Оговорка: роль Council должна оставаться
реально управляющей (онбординг, распределение), иначе повышенная доля
нарушает 3/1/5/3.

> **AAOIFI SS 12, п. 3/1/3/4:** "It is not permitted, in a Sharikah contract,
> to specify a fixed remuneration for a partner who contributes in managing
> the Sharikah funds […] However, it is permissible to give him a greater
> share of profit than he would receive solely on the basis of his share in
> the partnership capital."

> **AAOIFI SS 12, п. 3/1/5/3 (продолжение):** "…the partners may agree to make
> profit-sharing not proportionate to their contributions to capital, provided
> the additional percentage of profit over the percentage of contribution to
> the capital is not in favour of a sleeping partner."

### 4. Вознаграждение менеджера — только из прибыли — ✅

Тело инвестиции возвращается отдельным потоком `returnPrincipal()` — без
какой-либо комиссии, деньги идут обратно в `freeFunds`. `distributeRevenue()`
берёт `managerFee` только с выручки, которая признаётся после полного возврата
тела, то есть является прибылью. Менеджер, работающий за долю, по стандарту —
мудариб, и его доля считается **от прибыли**, а не от оборота.

> **AAOIFI SS 13, п. 8/1:** "The distribution of profit must be on the basis
> of an agreed percentage of the profit and not on the basis of a lump sum or
> a percentage of the capital."

> **AAOIFI SS 12, п. 3/1/3/3:** "…if the management is carried out from the
> outset for a percentage share in the profit earned, this action classifies
> the manager as a Mudarib and he is only entitled to a share in the profit,
> if any, and deserves no further remuneration for management services."

### 5. Прибыль — только при восстановленном капитале — ✅

`distributeRevenue()` ревертится с `Principal outstanding`, пока
`principalReturned` не сравняется с `fundsRequired` (или недостача не списана
как убыток через `writeOffProposal`). Признание прибыли до восстановления
капитала невозможно.

> **AAOIFI SS 13, п. 8/7:** "No profit can be recognised or claimed unless the
> capital of the Mudarabah is maintained intact. Whenever a Mudarabah
> operation incurs losses, such losses stand to be compensated by the profits
> of future operations…"

> **AAOIFI SS 12, п. 3/1/5/6:** "It is not permitted to start the allocation
> of profit between the partners unless the operating costs, expenses and
> taxes are deducted in calculating the profit and the capital of the Sharikah
> is maintained intact."

### 6. Разделение убытков — ✅

`writeOffProposal()` списывает невозвращённое тело проекта со **всех**
инвесторов строго пропорционально долям (`fundsInvested * loss / totalFunds`),
предварительно кристаллизовав каждому прибыль по доле до убытка. Инвариант
`totalFunds == Σ fundsInvested` сохраняется точно. Менеджер за коммерческий
убыток не отвечает (см. п. 11 — yad amanah).

> **AAOIFI SS 12, п. 3/1/5/4:** "It is a requirement that the proportions of
> losses borne by partners be commensurate with the proportions of their
> contributions to the Sharikah capital. It is not permitted, therefore, to
> agree on holding one partner or a group of partners liable for the entire
> loss or liable for a percentage of loss that does not match their share of
> ownership in the partnership."

> **AAOIFI SS 13, п. 8/7:** "If losses are greater than profits at the time of
> liquidation, the balance (net loss) must be deducted from the capital."

### 7. Нет гарантированного дохода — ✅

Контракт не обещает фиксированного возврата: выплаты возникают только из
фактически доставленной выручки (`receiveRevenue` → `distributeRevenue`), при
нулевой выручке ни один участник ничего не получает.

> **AAOIFI SS 12, п. 3/1/5/7:** "It is not permitted that the conditions or
> modes of profit allocation in a Sharikah contract include any clause or
> condition that may result in the probable violation of the principle of
> sharing profit. For example, if a predetermined amount of profit or
> a specific percentage of capital is assigned to one of the partners, this
> assignment will be rendered void."

### 8. Выход партнёра — ✅

`exit(amount)` возвращает инвестору часть доли из свободных средств пула:
доля уже амортизирована списанными убытками, а `freeFunds` — фактически
реализованная стоимость, т.е. выход идёт по конструктивной оценке, не по
номиналу вклада. Капитал, вложенный в живые проекты, выйти не может до
возврата тела или списания.

> **AAOIFI SS 12, п. 3/1/6/2:** "It is permissible for a partner to issue
> a binding promise to buy […] all the assets of the Sharikah as per their
> market value or as per agreement at the date of buying. It is not
> permissible, however, to promise to buy the assets of the Sharikah on the
> basis of face value."

> **AAOIFI SS 12, п. 3/1/5/9:** "The profit may be finally distributed on the
> basis of the proceeds of selling all the existing assets, known as actual
> valuation, or on the basis of constructive valuation of assets which means
> valuation of the assets of the Sharikah at fair value."

### 9. Предмет сделки: документы + сертификация совета — ✅

`submitProposal(…, docsHash, …)` несёт IPFS-хэш документов реального актива,
а голосование не открывается, пока шариатский совет (`board`) не выполнит
`certifyProposal` — неопределённость предмета сделки снята обязательной
внешней проверкой. Дедлайн голосования и отмена предложения убирают
неопределённость сроков. Хэш документов опционален технически; его наличие —
предмет проверки совета при сертификации.

> **AAOIFI SS 31, п. 4/1:** "This includes, for instance, sale, lease and
> partnership contracts, whereas Gharar does not affect donation contracts…"

> **AAOIFI SS 31, п. 4/2/1:** "Gharar is excessive when it becomes a dominating
> and distinctive aspect of the contract, and is capable of leading to
> dispute."

### 10. Управление ограничено кругом лиц — ✅

Онбординг и распределение — только owner (Council), финансирование — по
голосованию партнёров с порогом. Ограничение управления частью партнёров
стандарт допускает явно.

> **AAOIFI SS 12, п. 3/1/3/2:** "It is permissible for the partners to agree
> that the management of the partnership will be restricted to certain
> partners or to a single partner."

### 11. Менеджер — доверенное лицо; залог только под вердикт — ✅

При списании убытка (`writeOffProposal`) потеря ложится на капитал
инвесторов, не на менеджера — статус мудариба как доверенного лица
(yad amanah) соблюдён. Залог (`postCollateral`) добровольный, и изъять его
можно только вердиктом совета (`slashCollateral` с фиксацией основания
on-chain) — за недобросовестность, небрежность или нарушение условий, никогда
автоматически за коммерческий убыток. Milestone-транши (`releaseTranche`)
дополнительно сокращают аванс доверенному лицу.

> **AAOIFI SS 13, разд. 6:** "The capital provider is permitted to obtain
> guarantees from the Mudarib that are adequate and enforceable. This is
> circumscribed by a condition that the capital provider will not enforce
> these guarantees except in cases of misconduct, negligence or breach of
> contract on the part of Mudarib."

> **AAOIFI SS 13, п. 8/7:** "…as he is a trustee the Mudarib is not liable for
> the amount of this loss, unless there is negligence or misconduct on his
> part."

### 12. Токенизация долей — ✅

Доля Musharaka — это ERC-20 «SheikhFi Musharaka Share» (SHFI):
`balanceOf == fundsInvested`, `totalSupply == totalFunds`, перевод доступен
только между онборженными инвесторами (пермиссионный пул), прибыль обеих
сторон кристаллизуется по долям до перевода. Торговля сертификатами разрешена
после закрытия подписки и начала деятельности — условие соблюдается: токен
существует только внутри действующего пула.

> **AAOIFI SS 17, п. 3/6:** "These are certificates of equal value issued with
> the aim of using the mobilised funds for establishing a new project […] so
> that the certificate holders become the owners of the project or the assets
> of the activity as per their respective shares…"

> **AAOIFI SS 17, п. 5/2/16:** "It is permissible to trade in Mudarabah,
> Musharakah and investment agency certificates after closing of subscription,
> allotment of the certificates and commencement of activity with respect to
> the assets and usufructs."

## Трассировка: требование → пункт → реализация → тесты

Несущие функции контракта цитируют свой пункт стандарта в NatSpec
(`grep "AAOIFI" contracts/SheikhFi.sol`). Инварианты I1–I6 непрерывно
проверяются на случайной последовательности операций —
`test/Invariants.test.js` (детерминированный seed, воспроизводимо). Четыре из
них вдобавок **доказаны для всех входов** символьным исполнением самого
контракта — см. «Формальная верификация (Halmos)» в конце файла.

| § | Требование | Пункты AAOIFI | Реализация | Тесты |
| --- | --- | --- | --- | --- |
| 1 | Доли пропорциональны вкладам | SS 12 3/1/5/3 | `depositFunds`, `_accrue` | «Happy path»; I2 |
| 2 | Ставка прибыли зафиксирована при вступлении | SS 12 3/1/5/2 | `addInvestor(profitRate)` | «personalized profit rates respected» |
| 3 | Доля владельца — доля прибыли, не фикс | SS 12 3/1/3/4, 3/1/5/3 | `_accrue` (owner cut) | «personalized…»; «ownership: transfer…» |
| 4 | Fee менеджера — только из прибыли | SS 13 8/1; SS 12 3/1/3/3 | `returnPrincipal` без комиссий | «returnPrincipal restores freeFunds fee-free» |
| 5 | Прибыль после восстановления капитала | SS 13 8/7; SS 12 3/1/5/6 | гейт `Principal outstanding` | «profit is not recognised until the capital is home»; I4 |
| 6 | Убытки строго пропорционально вкладам | SS 12 3/1/5/4; SS 13 8/7 | `writeOffProposal` | «write-off reduces stakes pro-rata…»; I6 |
| 7 | Нет гарантированного дохода | SS 12 3/1/5/7 | выплаты только из фактической выручки | «distribute reverts cleanly when every stake has exited»; I3 |
| 8 | Выход по конструктивной оценке | SS 12 3/1/6/2, 3/1/5/9 | `exit` из свободных средств | «exit pays out of free funds…»; I1, I2 |
| 9 | Гарар: документы + сертификация совета | SS 31 4/1, 4/2/1 | `docsHash`, `certifyProposal` | describe «Sharia board (PLAN v3 §3)» |
| 10 | Управление ограничено кругом лиц | SS 12 3/1/3/2 | `onlyOwner`/`onlyBoard` + голосование | describe «Access control» |
| 11 | Yad amanah; залог — только под вердикт | SS 13 разд. 6, 8/7 | убыток на капитал; `slashCollateral(reason)` | describe «Collateral (PLAN v3 §5)» |
| 12 | Доли торгуемы после начала деятельности | SS 17 3/6, 5/2/16 | ERC-20 SHFI, `_transferShares` | describe «Tokenized shares (PLAN v3 §1)»; I2 |

Инварианты (`test/Invariants.test.js`): **I1** платёжеспособность (баланс ≥
freeFunds + Σ withdrawable + Σ collateral), **I2** книги = токен (totalFunds =
Σ вкладов = totalSupply), **I3** монотонность аккумулятора прибыли, **I4**
распределение только при целом капитале, **I5** вес голоса заморожен, **I6**
списание сохраняет относительные доли.

## Формальная верификация (Halmos)

`test/Invariants.test.js` проверяет инварианты на **одной** псевдослучайной
траектории (seed 20260711, 200 шагов): он может лишь не найти контрпример.
`test/verify/Verify.t.sol` **доказывает** те же инварианты символьным
исполнением — [Halmos](https://github.com/a16z/halmos) (a16z) прогоняет
функцию с символьными аргументами и либо доказывает утверждение **для всех
входов**, либо выдаёт конкретный контрпример:

```
docker compose run --rm halmos      # 5 passed
```

| Доказано | Пункт AAOIFI | Что именно доказано |
| --- | --- | --- |
| `check_I2_transferPreservesBook` | SS 17 3/6, 5/2/16 | перевод доли не создаёт и не уничтожает пай: при **любой** сумме `totalSupply` неизменен и книги равны токену |
| `check_I2_exitPreservesBook` | SS 12 3/1/6/1 | выход сжигает ровно столько, сколько выплачивает, и не трогает доли остальных — при любой сумме |
| `check_I2_depositPreservesBook` | SS 12 3/1/5/3 | вклад чеканит пай один-к-одному при любой сумме |
| `check_I3_accrualMonotone` | SS 12 3/1/5/7 | `cumulativePerShare` не убывает ни при какой выручке (прибыль только добавляется) |
| `check_I6_writeOffProRata` | **SS 12 3/1/5/4** | при **любом** частичном возврате списание урезает долю каждого партнёра ровно на `доля × убыток / капитал` — равенством, а не оценкой: равное деление убытка или дрейф в пользу пула были бы контрпримером |

**Что доказательство не покрывает (честные границы).** Halmos разворачивает
циклы до заданной границы: пул в `setUp` состоит из трёх инвесторов, поэтому
`--loop 4` — это доказательство для всех входов **при такой форме пула**, а не
для пулов любого размера. Аргумент `repaid` объявлен `uint64`: это не сужение —
`returnPrincipal` отвергает всё сверх выданных 10 ether (1e19 < 2^64), так что
покрыт весь диапазон, который контракт вообще принимает. I1 (платёжеспособность),
I4 и I5 остаются на фаззере — они завязаны на баланс контракта и на историю
голосований, а не на арифметику одной операции.

**Проверка самих доказательств.** Зелёная галка ничего не значит, если тест
ничего не утверждает; поэтому доказательства проверены мутациями — они ловят
подсадку:

| Мутация в контракте | Результат |
| --- | --- |
| списание делит убыток поровну (`loss / investorAddresses.length`) вместо пропорции | `check_I6` **FAIL**, контрпримеры `repaid = 3 wei` и `≈10 ether − 4 wei` |
| `transfer` начисляет получателю, не списывая с отправителя | `check_I2_transferPreservesBook` **FAIL**, контрпример `amount = 1` |

Почему Halmos, а не TLA+: он проверяет **сам контракт**, а не написанную
руками модель — между `.tla` и `.sol` нет связи, которая помешала бы им
разойтись. Разбор альтернатив (Quint, Kontrol, Certora, SMTChecker, hevm) —
в `PLAN.md`, «Волна v4 §1».
