# Review: Task 4.0 - Casos de uso e composição da revisão

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 4_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A tarefa monta a revisão sem tela. Os oito casos de uso e o gerador de id foram copiados de `app-english` e o `diff` contra o site está vazio. `createReviewComposition` abandona a sessão ativa, devolve "nada para revisar", mede o tempo digitado, fala o inglês sem `await`, registra falha de voz e de gravação e serializa o banco numa fila. `installed-review.ts` liga banco, fuso, `randomUUID`, voz e log. A suíte, `npx tsc --noEmit` e `npx expo lint` passaram. Não há issue crítica nem major.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/lib/application/review/start-daily-review.ts` | ✅ OK | 0 |
| `src/lib/application/review/record-typing-answer.ts` | ✅ OK | 0 |
| `src/lib/application/review/finish-review-session.ts` | ✅ OK | 0 |
| `src/lib/application/review/load-review-session.ts` | ✅ OK | 0 |
| `src/lib/application/review/build-review-result.ts` | ✅ OK | 0 |
| `src/lib/application/review/review-session-view.ts` | ✅ OK | 0 |
| `src/lib/application/review/resolve-time-zone.ts` | ✅ OK | 0 |
| `src/lib/application/review/errors.ts` | ✅ OK | 0 |
| `src/lib/application/shared/id-generator.ts` | ✅ OK | 0 |
| `src/lib/application/game/session-view.ts` | ✅ OK | 0 |
| `src/composition/review.ts` | ⚠️ Problemas | 3 |
| `src/composition/installed-review.ts` | ⚠️ Problemas | 1 |
| `tests/support/review-memory.ts` | ⚠️ Problemas | 1 |
| `tests/unit/application/review/review-use-cases.test.ts` | ✅ OK | 0 |
| `tests/unit/application/review/review-composition.test.ts` | ✅ OK | 0 |
| `tests/integration/composition/review-composition.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **Comentários na composição** em `src/composition/review.ts`, linhas 89, 96-100 e 418, e em `src/composition/installed-review.ts`, linhas 33-37. O padrão pede código sem comentário. Os blocos explicam o gravador da voz, a fila parada depois de uma falha e a abertura única por rota. São o mesmo tipo de nota já presente em `practice.ts`, que esta tarefa manda seguir. Apagá-los não muda comportamento. Nenhuma correção.

2. **Consulta que também conclui** em `src/composition/review.ts`, método `readResult` (linhas 265-281). `finish` completa a sessão quando a etapa já acabou e devolve acertos, erros, vencidas de hoje e a próxima data. Separar a gravação da leitura mudaria o contrato pedido pela tarefa. Nenhuma correção.

3. **Leitura que também guarda o aluno** em `src/composition/review.ts`, método `visitorOf` (linhas 298-309). A primeira digitação lê a sessão e memoriza o `visitorId` para a próxima. O cache evita outra ida ao banco no reenvio do mesmo `attemptId`. Nenhuma correção.

4. **Comentário do dublê** em `tests/support/review-memory.ts`, linhas 44-46. Explica por que cada chamada espera alguns milissegundos: sem a fila, `maxActive` sobe. É apoio de teste, não regra de produto. Nenhuma correção.

## ✅ Destaques Positivos

- Os testes de unidade e de integração falharam primeiro pela ausência da composição. A implementação veio depois.
- `diff` dos oito casos de uso e de `id-generator.ts` contra `app-english` não mostra diferença. A regra de nota não foi reescrita.
- Três acertos em dias diferentes, pela composição e pelo SQLite, deixam a palavra pelo menos 7 dias fora. Fechar no meio e começar de novo preserva a nota e não repete a palavra já avaliada.
- Distratora entra com `graded = 0` e a agenda dela não muda. Treino livre e desafio também não escrevem agenda.
- `review.ts` não importa Expo nem React Native. `installed-review.ts` usa imports estáticos nomeados de `randomUUID`, `applyInstalledTimeZone`, `createDeviceSpeech` e `logDeviceEvent`.
- A voz só é chamada depois da gravação, sem `await`. Falha de voz vira `review.speech_failed`; falha de disco vira `review.persist_failed`, rejeita e o reenvio usa o mesmo `attemptId`.
- `ReviewRuntime` tem 244 linhas e `ReviewMemory` 292, ambas abaixo de 300. Nenhum método novo passa de 50 linhas. Não há `any`.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | ✅ (não se aplica) |
| Logging | ✅ |
| React | ✅ (não se aplica) |
| Testes | ✅ |

Os avisos de padrão são os quatro itens minor. Nomes, fila e eventos seguem `practice.ts`. O log cobre `review.persist_failed` e `review.speech_failed`.

## Recomendações

1. Manter os casos de uso copiados idênticos ao site. Abandono ao começar, "nada para revisar", voz e fila ficam na composição.
2. Não importar Expo nem React Native em `src/composition/review.ts`.
3. Na tarefa 6, usar esta composição: a mensagem "nada para revisar", o mesmo `attemptId` no reenvio e a voz já disparada aqui.

## Veredito

**APROVADO COM OBSERVAÇÕES** (APPROVED WITH OBSERVATIONS). Sem issue crítica ou major. A tarefa 4.0 pode ser considerada fechada. As observações não pedem alteração. As tarefas 5.0 e 6.0 continuam abertas.

Validação desta revisão, com os scripts do repositório (`package-lock.json`; não há Yarn):

- `npx vitest run tests/unit/application/review/review-use-cases.test.ts tests/unit/application/review/review-composition.test.ts tests/integration/composition/review-composition.test.ts`: 3 arquivos, 24 testes, todos passando.
- `npx vitest run`: 68 arquivos, 569 testes, todos passando.
- `npx tsc --noEmit`: saída vazia, código de saída 0.
- `npx expo lint`: código de saída 0, sem erro.
