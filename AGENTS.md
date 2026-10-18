# Seedshop Template: работа агента

## Контекст и действующая цель

Сначала прочитай `README.md`, `PRODUCT.md` и корневой `DESIGN.md`. Для работ по развитию прочитай `docs/IMPROVEMENT-GOAL.md`; запуск этой цели определяется текущим поручением пользователя, а не самим наличием файла. Процедуры и установленный инструментарий описаны в `docs/agent-setup.md`.

Это самостоятельный магазин семян и садовых товаров для многократной клиентской адаптации. Повышаем качество витрины, работы продавца и внедрения. Исследование рынка через LeadForge идёт отдельно. Текущий визуальный характер принят: улучшай его, сохраняя идентичность. Общий редизайн не входит в цель.

`EXTRACTION-BRIEF.md` — историческое задание извлечения. Его запрет новых функций относился к извлечению и не отменяет текущую задачу развития. Исторические отчёты не доказывают текущую готовность. `docs/arch-rules.md` помогает понять архитектуру; ссылка там на старый requirements.md не заменяет текущее поручение.

## Источники и границы

- Стек: Next.js App Router, React, TypeScript, PostgreSQL и Prisma; фактические версии — в package.json/lockfile. Документация установленного Next.js находится в node_modules/next/dist/docs/.
- Витрина и админка имеют разные типографические настройки. Корневой DESIGN.md описывает действующее направление; docs/design-evidence.md связывает его с кодом. Не возвращай старые шрифты из прежнего docs/DESIGN.md.
- Перед изменением проверь состояние файлов. Если .git отсутствует, зафиксируй исходные хеши/копии затронутых файлов в .codex-tmp/; отсутствие Git не разрешает его инициализацию.
- Схема и миграции находятся в prisma/. Для новой БД используй migrate deploy: db push не создаёт все служебные SQL-объекты. Изменение схемы — новая миграция, базовая 0001_template сохраняется.
- Не используй production исходного магазина. Реальные оплаты, отправка сообщений, публикация и изменение внешней инфраструктуры требуют поручения на эти действия. Работа над кодом сама по себе их не разрешает.
- Сохраняй существующие правила опта, предзаказов, резервов, оплаты и доставки, пока задача явно не меняет их. Настраиваемость не означает выбор новых коммерческих условий за клиента.
- Не выводи .env, строки подключения, пароли и токены. Проверки состояния показывают только безопасные признаки.

## Выбор навыков

Навыки выбираются по текущему шагу; не загружай весь набор перед каждой правкой. Используй путь из доступного каталога навыков. Общие навыки установлены глобально, две процедуры Seedshop — в .agents/skills/.

| Работа | Основной инструмент |
| --- | --- |
| Улучшение существующего UI/UX | Impeccable в режиме refinement; critique/audit для исследования, polish/harden/adapt/clarify для адресных изменений |
| Доступность, метаданные, движение | fixing-accessibility, fixing-metadata, emil-motion или fixing-motion-performance по задаче |
| React: загрузка и производительность | vercel-react-best-practices; проверять применимость к установленным версиям |
| Сложные API компонентов | vercel-composition-patterns при конкретной проблеме; не рефакторить всё приложение ради шаблона |
| PostgreSQL, индексы и блокировки | supabase-postgres-best-practices; общие Postgres-рекомендации, без внедрения Supabase/RLS без основания |
| Измеренная проблема скорости | performance-optimization: исходное измерение, изменение, сопоставимая повторная проверка |
| Коммерческий путь и регрессии | seedshop-commerce-qa |
| Адаптация под конкретного клиента | seedshop-client-adaptation |
| Проверка безопасности | Подходящий Codex Security skill по порученному объёму |

Авторские стили, генерация новых макетов, Brandkit и замена компонентной библиотеки нужны только при соответствующей задаче. improve-ui является навыком аудита/планирования и не заменяет исполнение цели. Текущий пользовательский бриф и разрешения приоритетнее общих рекомендаций навыков, включая советы о коммитах, публикации и изменении стиля. Модель, делегирование и способ доставки не выбираются установленным набором.

## Запуск и проверки

- Рабочий shell — PowerShell; команды npm вызывай как npm.cmd. Chrome установлен отдельно; Playwright использует channel: chrome.
- Сначала безопасный preflight: `node .agents/skills/seedshop-commerce-qa/scripts/preflight.mjs`. Он не подключается к БД и не подтверждает её доступность.
- `npm.cmd run dev` запускает predev с миграциями. До запуска установи целевую БД; не воспринимай команду как только чтение.
- `npm.cmd run test:e2e -- <spec>` запускает миграции и фикстуры в E2E_DATABASE_URL. Используй отдельную локальную одноразовую БД с самостоятельным маркером test/e2e; текущий seed требует также loopback-хост и маркер в имени БД.
- Для списка тестов без миграций: `node node_modules/@playwright/test/cli.js test --list`. Не используй npm run test:e2e -- --list для беззаписной разведки: wrapper сначала меняет БД.
- Команды качества: `npm.cmd run prisma:validate`, `npm.cmd run typecheck`, `npm.cmd run typecheck:e2e`, `npm.cmd run lint`, `npm.cmd run build`. Перед общим завершением продуктовой цели — полный применимый набор и E2E. Для изменений только документации проверяй документы и ссылки, не поднимай БД без необходимости.
- Визуальные изменения проверяй в Chrome на настольном и мобильном экране, включая длинные названия и ошибки. Работа общего компонента проверяется на разных потребителях.
- Отделяй статическую проверку, E2E mock, тест провайдера и production. Не называй синтетическую проверку подтверждением настоящей оплаты или роста конверсии.

## Сохранённые инструкции установки

Для playwright mcp не пытайся использовать chromium, он у меня не установлен, но есть google chrome, для тестов можешь использовать его
Для временных проверочных файлов, локальных Playwright-конфигов и одноразовых agent-файлов используй папку .codex-tmp/ в корне проекта. Если нужен совсем общий scratch-space внутри проекта, можно использовать tmp/. Обе папки локальные и игнорируются git. Не складывай временные файлы в C:\tmp без необходимости.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
