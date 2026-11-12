# Review: Task 3 - Composição e sorteio

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 3_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`createChallengeComposition` liga o começo da rodada ao catálogo e implementa `start`, `begin`, `attempt`, `expire`, `abandon` e `result` sobre `FixedChallenge` (tarefa 1.0) e `SqliteChallengeRepository` (tarefa 2.0). `SqliteWordCatalog` lê as palavras ativas e o progresso do aluno sem gravar nada e chama `drawChallengeSelection`, copiada sem mudança de regra de `app-english/lib/infrastructure/persistence/studied-word-draw.ts`. Essa função usa `selectChallengeWords` e `selectWeightedWords`, que já existiam em `src/lib/domain/learning`, então nenhum peso novo foi criado. Um catálogo vazio falha com `InsufficientChallengeCatalogError` (`state = "INSUFFICIENT_CATALOG"`) antes de qualquer escrita. Resultado da suíte: 20 arquivos e 116 testes passando, 11 deles novos. `tsc --noEmit` passou sem erros, e `expo lint` mostra só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/composition/challenge.ts` | ⚠️ Problemas | 2 |
| `src/persistence/sqlite-word-catalog.ts` | ⚠️ Problemas | 1 |
| `tests/unit/composition/challenge-composition.test.ts` | ✅ OK | 0 |
| `tests/integration/composition/challenge-composition.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

1. **Catálogo insuficiente quer dizer "nenhuma palavra ativa estudada".** A função de sorteio do site, copiada como a tarefa pede, só sorteia palavras ativas que têm agenda (`nextReviewAt` não nulo) para o aluno. Ela falha quando esse número é zero. Por isso, zero palavras ativas resulta em catálogo insuficiente, como a tarefa exige. Mas um aluno que acabou de instalar, com palavras ativas e nenhuma estudada, também cai nesse estado. Hoje a revisão diária do aplicativo ainda não grava agenda (`SqliteDailyReviewReader.loadPlanInputs` rejeita), então o desafio fica indisponível no aparelho até existir estudo gravado. A regra foi mantida porque a techspec manda reutilizar a seleção vigente sem pesos novos (PRD 9 e 31). Ficou registrado como divergência entre o texto "zero palavras ativas" e o comportamento copiado, e quem decide é o produto. O teste de integração cobre os dois casos: nenhuma palavra ativa e o histórico de outro aluno.

### 🟢 Problemas Minor

1. `start` devolve `ChallengeOpening`, que estende `ChallengeRound` e acrescenta `words`. Assim a tela recebe o inglês e o português sem uma segunda leitura do catálogo. O tipo continua compatível com a assinatura `Promise<ChallengeRound>` da techspec.
2. `expire` e `abandon` são idempotentes quando a sessão já está encerrada: `expire` devolve o resultado gravado e `abandon` não faz nada. Isso evita erro numa repetição vinda da tela (desmontagem dupla, por exemplo) e não muda o recorde.
3. `sqlite-word-catalog.ts` contém a cópia de `drawChallengeSelection` e o mapeamento de linhas para progresso e agenda, que no site ficava em `learner-word-progress-mapper.ts`. Não foi criado nenhum arquivo fora dos "Arquivos relevantes".

## ✅ Destaques Positivos

- O catálogo só executa `SELECT`. O teste compara todas as linhas de `LearnerWordProgress`, `GameSession`, `GameSessionWord`, `GameAnswer`, `ReviewSession`, `ReviewSessionWord` e `TypingAttempt` antes e depois do sorteio, das tentativas, da expiração e do abandono.
- Com 44 palavras estudadas, o sorteio grava exatamente 40 ids distintos. A palavra inativa e as não estudadas ficam de fora. Com 5 estudadas, grava as 5.
- A composição recusa um sorteio com palavra repetida ou com mais de 40 palavras antes de gravar.
- O resultado da composição bate com `recordFor` do repositório. O empate não conta como recorde novo e a sessão abandonada fica fora do recorde.
- `begin` grava `startedAt` uma vez: uma segunda chamada não muda o valor gravado. A tentativa no instante do prazo entra, a tentativa 1 ms depois é rejeitada, e o `attemptId` repetido não pontua duas vezes.
- Uma falha ao gravar registra `challenge.persist_failed` e repassa o erro. Expiração e abandono não geram log de sucesso.
- Não há import de Expo nem de React Native, e nenhum import dinâmico.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | N/A |
| Logging | ✅ |
| React | N/A |
| Testes | ✅ |

## Recomendações

1. Decidir com o produto se o desafio deve aceitar palavras ativas ainda não estudadas, enquanto a revisão diária do aplicativo não grava agenda. Mudar isso significa alterar a política de seleção copiada e precisa de uma nova decisão na techspec.
2. A ligação com `expo-sqlite` (catálogo com `Math.random`, ids com `expo-crypto`, `console.error` para o evento) fica para a tarefa 5.0, junto com a tela.
3. `npx expo lint` continua com 1 erro que já existia (`react-hooks/set-state-in-effect`) em `src/hooks/use-color-scheme.web.ts`.

## Veredito

Aprovado com observações. Todos os critérios de sucesso valem. A próxima é a tarefa 4.0, pronúncia.
