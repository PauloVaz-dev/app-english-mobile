# Review: Task 6.0 - Desafio jogável

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 6_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A área reservada da tela do desafio deu lugar ao `PairBoard`. As regras do desafio não mudaram: prazo absoluto, sem pausa, pontuação, recorde e sorteio continuam os mesmos. `fixed-challenge.ts`, `scoring.ts`, o repositório e `pair-board-state.ts` não foram tocados.

- **`src/lib/presentation/challenge/challenge-screen.ts`**:
  - O estado `round` ganhou `words`, `halted` e `exhausted`. Ele agora é o tipo exportado `ChallengeRoundState`.
  - A porta ganhou `attempt(input, now)`, que devolve `accepted` (com `score`, `streak` e `correctAnswers` do `ChallengeRound`) ou `late`. O `opened` passou a trazer as `words`.
  - Foi criada a visão `challengeBoardDisabled(round, now)`. Ela bloqueia o tabuleiro no zero, com uma gravação pendente de "Tentar de novo" ou com o vocabulário esgotado.
  - O controlador ganhou `attempt(boardAttempt)`. Todas as gravações (`begin`, tentativas, expiração e saída) passam por uma fila única, na ordem do toque. A tentativa leva o `attemptId` do tabuleiro e o instante do toque. Pontos e sequência só mudam com a resposta da sessão.
  - A expiração e a saída esperam as tentativas já tocadas. Com isso, uma tentativa feita antes do zero não perde a corrida para `expire`.
  - Se uma gravação falhar, a rodada fica `halted`: o tabuleiro trava e aparece "Tentar de novo". O tempo não para. O reenvio usa o mesmo `attemptId` e o mesmo instante.
- **`src/composition/challenge.ts`**: `createChallengeScreenPort` agora repassa `words` e implementa `attempt`. `ChallengeTimeExpiredError` e `SessionEndedError` viram `late`, ou seja, a tentativa não entra.
- **`src/composition/installed-challenge.ts`**:
  - `import { randomUUID } from "expo-crypto"` passou a ser um import nomeado.
  - Novos exports: `createChallengeAttemptId` e `challengeBoardRandom`.
- **`src/components/challenge/challenge-screen.tsx`**:
  - A rodada ficou sem `ScrollView`, com margens seguras, como no treino. O cabeçalho continua com Sair, tempo, pontos e sequência.
  - O tabuleiro é `<PairBoard key={round.challengeId} ...>`:
    - `onReady` chama `controller.cardsReady()`;
    - `onAttempt` chama `controller.attempt`;
    - `onPairsEntered` não faz nada, porque o desafio não grava exposição.
  - Com o vocabulário esgotado, aparece uma mensagem própria, anunciada ao leitor de tela.
  - `CHALLENGE_BOARD_PENDING` e o texto "jogo de pareamento" foram removidos.

### Ordem TDD

1. O 6.1 falhou primeiro. Foram 12 testes, por falta de `words`, `attempt`, `challengeBoardDisabled`, `CHALLENGE_EXHAUSTED_MESSAGE` e `<PairBoard`.
2. O 6.2 falhou em seguida. Foram 3 testes, porque `state.words` não existia.
3. A implementação veio depois.

### Verificação

- vitest: 41 arquivos e 356 testes passando. Antes eram 342: são 11 testes novos de unidade e 3 de integração. Os testes antigos do desafio continuam passando, só com o formato novo do estado `round`.
- `tsc --noEmit`: sem erros.
- `expo lint`: só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.
- `expo export --platform android`: o bundle compila (Hermes, 4,4 MB). A pasta `dist/` foi apagada.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| src/lib/presentation/challenge/challenge-screen.ts | ⚠️ Observações | 2 (minor) |
| src/components/challenge/challenge-screen.tsx | ✅ OK | 0 |
| src/composition/challenge.ts | ✅ OK | 0 |
| src/composition/installed-challenge.ts | ✅ OK | 0 |
| tests/unit/presentation/challenge/challenge-screen.test.ts | ✅ OK | 0 |
| tests/integration/composition/challenge-screen.test.ts | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum.

### 🟡 Problemas Major

Nenhum problema de código. Há uma decisão de produto registrada em "Desvios e Decisões": o vocabulário esgotado espera o zero.

### 🟢 Problemas Minor

1. **Placar depois da gravação.** Pontos e sequência mudam quando a sessão responde, como a tarefa pede, e não no toque. No SQLite local essa espera é de milissegundos. O feedback de acerto e erro do tabuleiro continua imediato.
2. **"Tentar de novo" depois de falha no `begin`.** Esse comportamento já existia. O `retry` chama `cardsReady()` sem esperar o tabuleiro remontado. O `onReady` do tabuleiro chega uma renderização depois e não tem efeito. A diferença no início do prazo é de uma renderização.

## ✅ Destaques Positivos

- **Separação do estudo provada contra o SQLite.** Uma rodada de 6 toques pelo `PairBoardController` real (5 acertos e 1 erro, 540 pontos, sequência 3) grava só em `ChallengeAttempt`, com os `attemptId` do tabuleiro e na ordem. As linhas de `GameSession`, `GameSessionWord`, `GameAnswer` e `LearnerWordProgress` ficam idênticas antes e depois.
- **Tentativa depois do zero.** Num toque entre o zero e o próximo redesenho, a sessão recusa e o placar não muda. O tabuleiro fica `disabled` e o toque seguinte não gera tentativa. Só `tap-1` é gravado.
- **Nenhuma regra nova.** Um teste de fronteira proíbe `promptWordId ===`, `isCorrect`, `resolveBoardSelection`, `createGameBoard` e `game-engine` nos arquivos da tela. Acerto e erro continuam com o tabuleiro e com a sessão. Outro teste proíbe `expose`, `GameAnswer` e `LearnerWordProgress` nos arquivos do desafio.
- **Ordem garantida.** Tentativas tocadas antes de o `begin` terminar esperam por ele. Duas tentativas seguidas nunca carregam e salvam a sessão em paralelo, o que evita perder uma tentativa no `save`.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript | ✅ |
| Logging | ✅ (eventos só pela composição) |
| React | ✅ (callbacks estáveis com `useMemo`; `key` por desafio; sem `import()`) |
| Testes | ✅ |

## Desvios e Decisões

- **Vocabulário esgotado espera o zero.** O PRD do desafio (item 11) diz que a sessão termina e explica que o vocabulário acabou. O domínio, porém, só conclui (`COMPLETED`) no prazo: `expire` antes do prazo falha, e `restore` exige `finishedAt = deadline`. Concluir antes mudaria essa regra. A outra saída, abandonar, faria a rodada perder o recorde. Por isso, quando os acertos alcançam o número de palavras sorteadas, o tabuleiro dá lugar à mensagem "As palavras deste desafio acabaram: você acertou todas. O resultado aparece quando o tempo terminar.". O relógio segue, e no zero vem "Tempo esgotado" e depois o resultado com o recorde. Sair nesse intervalo grava `ABANDONED`, pela regra de saída voluntária. Com 40 palavras, esse caso exige menos de 1,5 s por acerto.
- **Falha de gravação de tentativa.** Esse caso não estava detalhado na tarefa. Segue o padrão do treino: o tabuleiro trava e aparece "Tentar de novo", sem pausa. Na expiração, as tentativas pendentes têm uma última chance antes de `expire`.
- **Arquivos fora da lista.** Só `src/composition/installed-challenge.ts` mudou fora da lista, para o gerador de id e o aleatório do tabuleiro.
- **Tempo de resposta.** `pair-board-state.ts` não foi tocado. O desafio não usa `responseTimeMs`.

## Recomendações

1. Verificar no aparelho, num development build: rodada completa até o resultado, um toque no zero, sair no meio e "Tentar de novo".
2. Confirmar com o produto a decisão sobre o vocabulário esgotado. Se ele deve encerrar na hora, é preciso decidir como o domínio conclui antes do prazo.

## Veredito

Aprovado com observações. Os critérios de sucesso valem:
- uma rodada de 60 segundos vai do começo ao resultado pelo tabuleiro, pelo controlador, pela composição e pelo SQLite;
- nenhum arquivo do desafio cria regra de acerto, erro ou reposição;
- os testes do desafio que já existiam continuam passando.

A verificação manual no aparelho ainda precisa ser feita.
