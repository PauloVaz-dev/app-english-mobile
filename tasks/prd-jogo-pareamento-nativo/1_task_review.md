# Review: Task 1.0 - Regras do jogo copiadas do site

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 1_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

As regras de pareamento do site `app-english` foram copiadas para `src/lib/domain/game/`, `src/lib/domain/learning/` e `src/lib/application/game/`. Nenhuma regra mudou: os 8 módulos de domínio e aplicação são idênticos byte a byte à origem (`cmp`). Como o alias `@/` aponta para a raiz no site e para `src/` aqui, nenhum caminho de import precisou mudar. `session-view.ts` traz só `ReviewWordView`, `SessionResultLists` e `EMPTY_SESSION_RESULT_LISTS`, como a tarefa pede.

Os tipos e erros que já existiam (`game/types.ts`, `game/errors.ts`, `learning/types.ts`, `learning/errors.ts`, `difficulty-policy.ts`, `progress-metrics.ts`) já eram idênticos aos do site. Por isso foram reutilizados e nada foi duplicado.

Os 7 arquivos de teste do site também foram copiados sem nenhuma edição. A sequência TDD foi seguida: primeiro os testes falharam com `Cannot find package '@/lib/...'` nos 6 arquivos de teste, depois passaram. A tarefa ganhou um teste de fronteira de imports e um teste de integração de uma sessão `FREE` de 20 palavras em memória.

Verificação: vitest com 32 arquivos e 237 testes passando, `tsc --noEmit` sem erros, e `expo lint` com só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| src/lib/domain/game/game-engine.ts | ✅ OK (cópia idêntica) | 0 |
| src/lib/domain/game/game-session.ts | ⚠️ Cópia idêntica, fora de alguns padrões | 1 (minor) |
| src/lib/domain/game/response-time-measurement.ts | ✅ OK (cópia idêntica) | 0 |
| src/lib/domain/learning/attempt-progress.ts | ⚠️ Cópia idêntica | 1 (minor) |
| src/lib/domain/learning/review-candidate.ts | ✅ OK (cópia idêntica) | 0 |
| src/lib/domain/learning/review-priority.ts | ✅ OK (cópia idêntica) | 0 |
| src/lib/domain/learning/praise-priority.ts | ✅ OK (cópia idêntica) | 0 |
| src/lib/application/game/build-session-review.ts | ✅ OK (cópia idêntica) | 0 |
| src/lib/application/game/session-view.ts | ✅ OK (recorte do site) | 0 |
| tests/unit/domain/game/{fixtures,game-engine.test,game-session.test}.ts | ✅ OK (cópia idêntica) | 0 |
| tests/unit/domain/learning/{attempt-progress,review-priority,praise-priority}.test.ts | ✅ OK (cópia idêntica) | 0 |
| tests/unit/application/game/build-session-review.test.ts | ✅ OK (cópia idêntica) | 0 |
| tests/unit/domain/game/rules-boundary.test.ts | ✅ OK | 0 |
| tests/integration/game/free-practice-session.test.ts | ⚠️ Problemas | 2 (minor) |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **`src/lib/domain/game/game-session.ts`** tem 727 linhas, e algumas funções e métodos ficam fora do checklist de padrões (tamanho e linhas em branco). Como a tarefa exige cópia sem mudança de regra, a refatoração fica fora do escopo. Nenhuma correção nesta tarefa.
2. **`src/lib/domain/learning/attempt-progress.ts`**, em `assertAttemptProgressAllowed`: o segundo `if` (`!input.isCorrect && timesShown === 0`) nunca é alcançado, porque o primeiro já lança o erro quando `timesShown === 0`. O código veio assim do site. Fica registrado para corrigir na origem, não aqui.
3. **`tests/integration/game/free-practice-session.test.ts`**: o primeiro `it` passa de 50 linhas, e os auxiliares `expose` e `attempt` mutam estado local e também devolvem resultado. Para um cenário de ponta a ponta em memória, isso é aceitável. Uma melhoria possível é extrair um pequeno `playFreeSession(plan)` que devolva `{ session, progress, newExposures }`.
4. **`tests/integration/game/free-practice-session.test.ts`** usa asserções não nulas (`wrongCard!`) depois de `expect(wrongCard).toBeDefined()`. Uma melhoria possível é usar `if (!wrongCard) throw new Error(...)` para estreitar o tipo sem `!`.

## ✅ Destaques Positivos

- A cópia é fiel e foi verificada com `cmp` contra a origem: 8 módulos e 7 arquivos de teste idênticos. O repositório `app-english` não foi editado.
- Os tipos e erros já existentes foram reutilizados, sem duplicação.
- O teste de fronteira (`rules-boundary.test.ts`) usa uma lista do que é permitido. Arquivos de `src/lib/domain` e `src/lib/application` só podem importar caminhos dentro dessas duas pastas, o que exclui Expo, React Native, `expo-sqlite`, `better-sqlite3` e `@/persistence`, inclusive por caminho relativo. O próprio teste prova que o detector recusa esses casos.
- O teste de integração cobre todos os requisitos da tarefa em uma partida:
  - no máximo 5 pares, sem palavra repetida;
  - o par acertado sai e o próximo da fila entra;
  - o erro mantém o tabuleiro igual e não revela a resposta;
  - uma exposição por palavra, mesmo com reexposição repetida;
  - tentativa repetida pelo mesmo `attemptId` não conta de novo, e conteúdo diferente com o mesmo `attemptId` gera `AttemptConflictError`;
  - a 20ª associação correta conclui a sessão;
  - `graded = false` e `gradesWord = false` nas 20 palavras, também depois de `restore`;
  - métricas exatas: 25 tentativas, 80% de precisão, tempo médio e duração;
  - "Precisa revisar" limitada a 3, ordenada por erros e depois por tempo;
  - "Mandou bem" limitada a 3, ordenada por tempo e, no empate, pelo inglês (`bird` antes de `cat`); palavra rápida com erro fica fora;
  - abandono grava `ABANDONED` e bloqueia novas tentativas.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ (só no código copiado, sem mudança por exigência da tarefa) |
| TypeScript/Node.js | ✅ |
| REST/HTTP | N/A |
| Logging | N/A |
| React | N/A |
| Testes | ✅ |

## Recomendações

1. Corrigir no site o `if` que nunca é alcançado em `assertAttemptProgressAllowed` e depois trazer a correção para cá.
2. Na tarefa 2.0, manter o repositório SQLite fora de `src/lib` para que `rules-boundary.test.ts` continue valendo.
3. Opcional: extrair o loop da partida do teste de integração para um auxiliar reutilizável.

## Veredito

Aprovado com observações. Todos os critérios de sucesso valem:
- os testes do site passam sem nenhuma edição;
- `tsc` não tem erros;
- o lint não tem erro novo;
- `src/lib/domain` e `src/lib/application` não importam Expo, React Native nem banco.

As observações minor não bloqueiam a tarefa. A tarefa 2.0 pode começar.
