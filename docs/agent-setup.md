# Подготовка рабочего окружения агента

Подготовлено 2026-10-16 для цели в [IMPROVEMENT-GOAL.md](IMPROVEMENT-GOAL.md). Это инструкции и инструментарий; улучшения магазина ещё не реализованы этой подготовкой.

## Как начать

Открой рабочий чат в папке seedshop-template и поручай выполнить docs/IMPROVEMENT-GOAL.md. Укажи выбранную модель в интерфейсе. AGENTS.md направляет к документации и процедурам; файл цели сам ничего не запускает.

Два проектных навыка находятся в .agents/skills/: seedshop-commerce-qa и seedshop-client-adaptation. Общие навыки остаются глобальными. Новые навыки проверяй в каталоге следующего хода/нового чата; если не появились, перезапусти приложение. Наличие файлов и валидный frontmatter не доказывают автоматический выбор моделью.

## Установленные дополнения

Путь этой установки: C:/Users/admin/.codex/skills/<имя>. Каталог конкретного сеанса является источником доступного пути. На другой машине навыки устанавливаются отдельно; секреты, кеши и пользовательские настройки вместе с проектом не переносятся.

| Навык | Источник | Закреплённая ревизия |
| --- | --- | --- |
| vercel-react-best-practices | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| vercel-composition-patterns | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns) | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| supabase-postgres-best-practices | [supabase/agent-skills](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | `c9be0e931b7930f7d02126d04774d904c381e7d7` |
| performance-optimization | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/aeac41d4d005999432bb7312f7ff06383a91d59d/skills/performance-optimization) | `aeac41d4d005999432bb7312f7ff06383a91d59d` |

Каждый навык установлен целиком со справочными файлами. Для performance-optimization дополнительно включён references/performance-checklist.md из той же ревизии; относительные ссылки на общий справочник перенаправлены внутрь навыка. Сведения о происхождении и контрольные суммы находятся в INSTALLATION.json каждого установленного дополнения.

React Composition Patterns применяется только к конкретным проблемам композиции. Performance Optimization — к измеренной проблеме скорости. PostgreSQL-навык не требует внедрения Supabase. Общие рекомендации о коммитах и внешних действиях не расширяют поручение пользователя.

Impeccable остаётся основным навыком развития текущего дизайна; его переустановка и очистка глобальных дублей не выполнялись. Product Design, инструменты доступности, Playwright и Codex Security уже доступны в этой установке. Их наличие не является проверкой всех runtime-подключений.

## Документы и проверки

- [DESIGN.md](../DESIGN.md) — действующее оформление; [design-evidence.md](design-evidence.md) — источники и различия со старым описанием.
- [QA skill](../.agents/skills/seedshop-commerce-qa/SKILL.md) — изолированная БД, команды и карта тестов.
- [Adaptation skill](../.agents/skills/seedshop-client-adaptation/SKILL.md) — данные клиента, настройки и проверка сдачи.
- Безопасный preflight: `node .agents/skills/seedshop-commerce-qa/scripts/preflight.mjs`.
- Список тестов без миграций: `node node_modules/@playwright/test/cli.js test --list`.

Документ дизайна подготовлен из исходников, проверяется через @google/design.md lint и экспорт css-tailwind. Это не означает, что предложенные здесь правила прошли новый пользовательский тест или визуальный аудит всего магазина.

## Сохранение и перенос

На момент подготовки в папке нет .git. Репозиторий не инициализируется автоматически. В .gitignore сделаны исключения для AGENTS.md и .agents/skills/, чтобы при последующей разрешённой публикации правила и процедуры могли храниться с проектом. Остальная .agents-конфигурация, .codex, секреты и runtime-артефакты остаются игнорируемыми.

Перед применением подготовленных документов сохраняются исходные версии и manifest.json в .codex-tmp/agent-setup-backup-20261016/. При восстановлении сначала сравни текущие хеши с manifest: не перезаписывай более поздние изменения. Для вновь созданных файлов записи before=null; их удаление не является частью текущей подготовки.

Состав и результаты подготовки фиксируются в agent-setup-validation.md. Готовность инструментария не равна production-готовности магазина.
