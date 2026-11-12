# Review: Task 5.0 - Resumo do dia no banco

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 5_task.md
**Status**: APROVADO

## Resumo

O resumo do dia passa a ser calculado no SQLite e devolvido por `GetDailyReviewSummary`, com o fuso já gravado na tarefa 4.0. `SqliteDailyReviewReader.summary` conta vencidas, candidatas novas e palavras de origem `NEW` na data local, e lê só a próxima revisão futura. A cota usa `DAILY_NEW_WORD_LIMIT` e o dia usa `localDateOf`. O caso de uso e `local-day.ts` não foram reescritos. Os outros métodos da porta falham com `DailyReviewCapabilityError` antes de tocar o banco. A tela não foi desenhada.

O repositório ainda não tem commits, então não há diff contra uma base. A revisão cobriu os arquivos desta task, sem desfazer migração, aluno, semente ou fuso.

Não há problema crítico, major nem minor no código final.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/persistence/sqlite-daily-review-reader.ts` | ✅ OK | 0 |
| `tests/unit/persistence/sqlite-daily-review-reader.test.ts` | ✅ OK | 0 |
| `tests/integration/persistence/sqlite-daily-summary.test.ts` | ✅ OK | 0 |
| `src/lib/application/review/get-daily-review-summary.ts` | ✅ OK | 0 |
| `src/lib/domain/learning/local-day.ts` | ✅ OK | 0 |
| `src/persistence/schema-version-one.ts` | ✅ OK | 0 |
| `src/persistence/sqlite-visitor-preferences.ts` | ✅ OK | 0 |

`get-daily-review-summary.ts`, `local-day.ts`, `schema-version-one.ts` e `sqlite-visitor-preferences.ts` foram lidos e não foram alterados. `src/app` não ganhou tela. `src/composition/home.ts` continua para a task 6.

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

Nenhum problema minor encontrado.

## ✅ Destaques Positivos

- `summary` (linhas 77–90) pede quatro consultas ao executor compartilhado: `COUNT` de vencidas com `nextReviewAt <= now` e palavra ativa, `COUNT` de candidatas sem progresso agendado, `COUNT(DISTINCT wordId)` de origem `NEW` na data local, e `LIMIT 1` da próxima revisão futura. Nenhuma dessas consultas devolve o catálogo.
- A cota é `DAILY_NEW_WORD_LIMIT` menos as palavras já introduzidas hoje. O dia local continua em `localDateOf`. `GetDailyReviewSummary` não mudou.
- `createDailySummaryUseCase` liga o reader ao `SqliteVisitorPreferences` da tarefa 4.0. Sem fuso gravado, o caso de uso segue `America/Sao_Paulo`. Com `Asia/Tokyo` gravado, a mesma introdução `NEW` reduz as novas disponíveis.
- `loadPlanInputs`, `findActiveWords` e `listStudied` rejeitam com `DailyReviewCapabilityError` e não chamam o executor.
- A primeira abertura com as 32 palavras devolve `dueCount` 0 e `newAvailable` igual ao limite diário. Fechar e abrir o mesmo arquivo no mesmo instante devolve os mesmos números.
- Uma revisão no passado ou exatamente agora aumenta `dueCount`. A próxima data é a revisão futura mais cedo do mesmo aluno, em palavra ativa. Palavra inativa e outro aluno não entram na conta.
- Duas sessões da mesma palavra `NEW` no dia local reduzem a cota uma vez. Origem `DUE` não reduz.
- O teste de 5.000 palavras ativas confere os números e exige que cada `getAll` devolva no máximo uma linha, com o total de linhas abaixo do catálogo.
- A migração 1 permanece congelada. Não há `any`. `src/lib` continua sem Expo, Prisma Client, React Native e Next.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | Não se aplica |
| Logging | Não se aplica |
| React | Não se aplica |
| Testes | ✅ |

Não há `CLAUDE.md` neste repositório. A restrição aplicada é a de `AGENTS.md` e a da techspec: `src/lib` continua sem Expo, Prisma Client, React Native e Next. As consultas ficam no executor já compartilhado entre `expo-sqlite` e `better-sqlite3`. O log `home.summary_failed` continua na task 6.

`npx tsc --noEmit` passou. `npx vitest run` passou com 13 arquivos e 54 testes. Os 49 testes anteriores, das tasks 1 a 4, continuam nesse total e passaram.

## Recomendações

1. A task 6 deve usar `createDailySummaryUseCase` dentro de `HomeComposition.load`, depois de migração, aluno, semente e fuso, e transformar o resultado com `toHomeReviewSummaryView`. Esta task não desenha a entrada.
2. Não editar `src/persistence/schema-version-one.ts`. Mudança de coluna continua a ser versão 2.
3. `npx expo lint` ainda falha em `src/hooks/use-color-scheme.web.ts`, arquivo que esta task não altera. O erro é `react-hooks/set-state-in-effect`. Fica fora do escopo da task 5.

## Veredito

APROVADO. O resumo do dia sai do SQLite pelas consultas, respeita o fuso gravado e não carrega o catálogo. `npx tsc --noEmit` e `npx vitest run` passaram.
