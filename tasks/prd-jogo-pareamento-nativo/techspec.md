# Especificação Técnica — Jogo de pareamento no aplicativo

## Resumo Executivo

O pareamento roda no aplicativo local, sobre o `english.db` da fundação, e entra pela rota `/treino-livre`. A partida tem 20 palavras sorteadas com peso entre todas as palavras ativas do aluno (fácil 1, normal 3, difícil 6; uniforme sem histórico). Ela grava sessão, exposições, tentativas e o progresso da palavra, e não altera a agenda de revisão (modo `FREE`).

As regras de jogo vêm do site `app-english`, copiadas sem mudança: tabuleiro, sessão, progresso por tentativa e as listas "Precisa revisar" e "Mandou bem". O que muda é a borda: o repositório Prisma vira um repositório SQLite sobre o executor da fundação, e o redutor do tabuleiro perde as fases de rede, porque o mesmo processo decide e grava. O tabuleiro é exposto como a porta `PairBoard`, que a tela do desafio de 60 segundos já espera. A última etapa liga essa porta ao desafio. A etapa 2 da revisão diária fica com o PRD da revisão e reutiliza a mesma porta.

## Arquitetura do Sistema

### Visão Geral dos Componentes

Novos:

- `src/lib/domain/game/game-engine.ts`: tabuleiro de até 5 pares, seleção, acerto, erro e reposição. Cópia do site.
- `src/lib/domain/game/game-session.ts`: sessão de 3 a 20 palavras, exposição, tentativa idempotente por `attemptId`, abandono, métricas e `restore`. Cópia do site.
- `src/lib/domain/game/response-time-measurement.ts`: versão 2 da medição do tempo. Cópia.
- `src/lib/domain/learning/attempt-progress.ts`, `review-candidate.ts`, `review-priority.ts`, `praise-priority.ts`: progresso por tentativa e as duas listas do resultado. Cópias.
- `src/lib/application/game/build-session-review.ts`: monta "Precisa revisar" e "Mandou bem" a partir dos fatos da sessão. Cópia, com `SessionResultLists` trazido junto.
- `src/lib/presentation/game/pair-board-state.ts`: redutor puro do tabuleiro (seleção, feedback, reposição, tempo da primeira à segunda seleção). Adaptado de `board-reducer.ts` do site, sem as fases `registering`, `submitting`, `retryable` e `leaving`.
- `src/components/game/pair-board.tsx`: a porta `PairBoard`. Desenha as duas colunas, avisa quando os primeiros cartões podem ser tocados e entrega cada tentativa a quem a usa. Não conhece sessão, banco nem pontuação.
- `src/persistence/sqlite-game-session-repository.ts`: cria, lê, registra exposições e tentativas, abandona e lê as listas do resultado em `GameSession`, `GameSessionWord`, `GameAnswer` e `LearnerWordProgress`.
- `src/composition/practice.ts` e `src/composition/installed-practice.ts`: composição do treino (pura) e ligação ao aparelho.
- `src/lib/presentation/game/practice-screen.ts` e `src/components/game/practice-screen.tsx`: estados da tela do treino (introdução, partida, resultado, catálogo insuficiente).

Modificados:

- `src/persistence/sqlite-word-catalog.ts`: ganha `drawPracticeWords`, que aplica `selectWeightedWords` sobre todas as ativas.
- `src/app/treino-livre.tsx`: deixa de ser o placeholder.
- `src/components/challenge/challenge-screen.tsx` e `src/lib/presentation/challenge/challenge-screen.ts`: a área reservada passa a renderizar `PairBoard`, e o controlador ganha a atualização de pontos e sequência.

Fluxo do treino: a entrada navega para `/treino-livre`. Começar sorteia 20 palavras, grava a sessão `FREE` e monta o tabuleiro. Cada par que entra no tabuleiro gera uma exposição. Cada associação vira uma tentativa gravada numa transação junto com o progresso da palavra. A vigésima associação correta conclui, e a tela lê as listas do resultado. Sair da rota abandona.

Fluxo do desafio: a tela do desafio passa as palavras sorteadas a `PairBoard`. `onReady` chama `controller.cardsReady()`. `onAttempt` chama `composition.attempt`. O tabuleiro aplica o feedback na hora, sem esperar a gravação.

## Design de Implementação

### Interfaces Principais

```ts
// src/components/game/pair-board.tsx
interface PairBoardProps {
  words: readonly Word[];            // fila da partida; o tabuleiro mostra até 5
  random: RandomSource;
  disabled: boolean;                 // tempo esgotado, resultado ou partida encerrada
  onReady(enteredWordIds: readonly string[]): void;      // primeiros cartões tocáveis
  onPairsEntered(wordIds: readonly string[]): void;      // reposição
  onAttempt(attempt: PairBoardAttempt): void;            // não aguardado
}
interface PairBoardAttempt {
  attemptId: string; promptWordId: string; selectedWordId: string;
  isCorrect: boolean; responseTimeMs: number;
}
```

```ts
// src/composition/practice.ts
interface PracticeComposition {
  start(visitorId: string): Promise<PracticeOpening>;               // sessão FREE + palavras
  expose(sessionId: string, wordIds: readonly string[]): Promise<void>;
  attempt(input: PracticeAttemptInput): Promise<PracticeProgress>;  // idempotente
  abandon(sessionId: string): Promise<void>;
  result(sessionId: string): Promise<PracticeResult>;               // métricas + listas
}
```

`PracticeComposition` recebe catálogo, repositório, relógio, gerador de id, `ChallengePronunciation` já existente e o registro de eventos. A fala acontece depois da tentativa correta gravada, sem `await`, como no desafio.

### Modelos de Dados

Não há migração. As tabelas da versão 1 já cobrem tudo:

- `GameSession`: `mode = 'FREE'`, `targetWords = 20`, `status` em `ACTIVE`, `COMPLETED` ou `ABANDONED`, `durationMs` ao encerrar.
- `GameSessionWord`: `sequence`, `presentedAt` na primeira exposição, `completedAt` no acerto, `graded = 0` em toda palavra do modo `FREE`.
- `GameAnswer`: uma linha por `attemptId`, com `responseTimeMs` e `responseTimeMeasurementVersion = 2`.
- `LearnerWordProgress`: `timesShown` sobe uma vez por palavra e sessão. `correctCount`, `wrongCount` e `totalCorrectResponseTimeMs` seguem `applyAttemptToProgress`. As colunas de agenda (`nextReviewAt`, `reviewState` e afins) não são escritas pelo modo `FREE`.

O resultado é lido do banco (`GameSession.restore` + `buildSessionReview`), então fechar e abrir o aplicativo mostra o mesmo.

### Endpoints de API

Não se aplica. Não há servidor nem rede.

## Pontos de Integração

- `expo-sqlite` pelo executor e pela abertura da fundação (`connectEnglishDatabase`, `prepareHomeStudy`).
- `expo-speech` pelo `createDeviceSpeech` da tarefa 4.0 do desafio. Falha de voz registra `practice.speech_failed` e não interrompe.
- `expo-crypto` para ids de sessão e de tentativa.
- `AccessibilityInfo` do React Native (import estático nomeado): `announceForAccessibility` para acerto e erro, `isReduceMotionEnabled` para reduzir animação.
- Sem `expo-haptics`. Sem rede.

## Abordagem de Testes

A ordem é TDD: teste que falha, implementação mínima, refatoração. Os testes das regras copiadas vêm junto com a cópia e passam sem edição de regra.

### Testes Unidade

- `game-engine` e `game-session`: no máximo 5 pares, nenhuma palavra em dois pares, acerto repõe, erro mantém os cartões, `attemptId` repetido não conta de novo, 20º acerto conclui, sessão `FREE` não marca palavra como avaliada.
- Sorteio do treino: 20 palavras distintas, peso 1/3/6 pela classificação do aluno, uniforme sem histórico, falha com menos de 20 ativas, inativas fora.
- `pair-board-state`: seleção por idioma, troca de seleção, limpeza após erro, feedback distinto por texto, `onReady` uma vez, tempo de resposta da primeira seleção até a que fecha o par, sem contar o tempo de observação.
- Listas do resultado: até três em "Precisa revisar"; "Mandou bem" com zero erros e até 2 segundos, ordenado por tempo e depois inglês; texto de "sem destaque" quando vazio.
- Tela do treino e controlador do desafio com composição falsa.

Mocks só nas bordas do aparelho: `expo-speech`, `expo-crypto`, `react-native` (`AccessibilityInfo`, `AppState`).

### Testes de Integração

No `better-sqlite3`, com o executor da fundação:

- Partida completa de 20 grava sessão, palavras, tentativas e progresso; reabrir o arquivo devolve as mesmas métricas e listas.
- Exposição repetida e tentativa repetida não alteram os consolidados.
- Palavra exposta e não acertada guarda exposição e erros, sem tempo de acerto.
- Colunas de agenda de `LearnerWordProgress` iguais antes e depois de uma partida `FREE`.
- Catálogo com menos de 20 ativas não cria sessão.
- Abandono grava `ABANDONED` e mantém os consolidados das tentativas já feitas.
- Desafio com `PairBoard`: tentativas do desafio continuam fora de `GameAnswer` e de `LearnerWordProgress`.

### Testes de E2E

Não se aplicam. Não há Playwright neste aplicativo. A verificação no aparelho é manual, num development build.

## Sequenciamento de Desenvolvimento

### Ordem de Construção

1. Cópia do domínio (motor, sessão, medição, progresso e listas) com os testes do site. Não depende de nada.
2. Repositório SQLite da sessão e sorteio ponderado do treino. Depende de 1.
3. Composição do treino com voz e eventos. Depende de 2.
4. `pair-board-state` e `PairBoard` como componente sem sessão. Depende de 1.
5. Tela do treino em `/treino-livre`. Depende de 3 e 4.
6. `PairBoard` na tela do desafio, com pontos e sequência no cabeçalho. Depende de 4 e das tarefas do desafio.

### Dependências Técnicas

Fundação com `english.db` na versão 1 e o aluno local. `expo-speech` já instalado. Um development build novo para testar a voz no aparelho. Nenhum pacote novo.

## Monitoramento e Observabilidade

Não há Prometheus nem Grafana. Nada sai do aparelho. Eventos por `console.error`, como na entrada e no desafio:

- `practice.persist_failed`: falha ao gravar sessão, exposição ou tentativa. A tela mostra "Tentar de novo".
- `practice.speech_failed`: voz indisponível. A partida segue.
- `practice.insufficient_catalog` não é log: é estado da tela.

## Considerações Técnicas

### Decisões Principais

O treino livre usa o sorteio ponderado sobre todas as ativas, não só as estudadas. A agenda ainda não é gravada no aplicativo, e a regra do site deixaria a rota sempre vazia, o mesmo problema já decidido no desafio. O modo continua `FREE`, então a agenda não muda. Decisão de 2026-11-12.

As regras de jogo são copiadas, não reescritas. `game-engine.ts`, `game-session.ts`, `attempt-progress.ts`, `review-candidate.ts`, `review-priority.ts`, `praise-priority.ts` e `build-session-review.ts` entram sem mudança de regra. O repositório e o redutor são reescritos porque o Prisma e as fases de rede não existem aqui.

O tabuleiro não grava nada. Ele decide acerto e erro na hora com `resolveBoardSelection`, e quem o usa grava. Assim o mesmo componente serve ao treino (sessão `FREE`), ao desafio (`FixedChallenge`) e, depois, à revisão. Gravar dentro do tabuleiro prenderia a porta a um só tipo de sessão.

O feedback não espera o banco. A gravação é enfileirada por sessão, na ordem das tentativas. Uma falha de gravação para a partida e mostra "Tentar de novo", e o `attemptId` idempotente permite reenviar sem contar duas vezes.

O tempo de resposta segue a medição versão 2 do site (`app-english/tasks/prd-correcao-tempo-resposta`): começa na primeira seleção com o tabuleiro livre, continua na troca de cartão do mesmo idioma e termina na seleção que fecha o par. A entrada do par no tabuleiro só serve à exposição. Medir desde a entrada incluía o tempo de observação e empurrava as palavras para "difícil", com os limiares de "Mandou bem" e da classificação calibrados para a versão 2. Decisão de 2026-11-12, depois da tarefa 4.0.

Sem vibração nesta entrega. O feedback é texto, ícone, cor e anúncio ao leitor de tela.

### Riscos Conhecidos

- Toques rápidos antes de a gravação anterior terminar. Mitigação: fila por sessão e ids gerados no toque.
- `restore` do site valida o histórico inteiro e pode ficar lento em sessões grandes. São no máximo 20 palavras; aceitável.
- Diferença entre o relógio da tela e o da sessão no tempo de resposta. O tempo vem do redutor, e a sessão só valida limites (`MAX_RESPONSE_TIME_MS`).
- Import dinâmico de `react-native` dispara avisos de depreciação no Metro. Todo acesso ao aparelho usa import estático nomeado e fica em arquivos `installed-*`.

### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica. `src/lib/domain` continua sem Expo, React Native e acesso ao banco.

### Arquivos relevantes e dependentes

Novos: `src/lib/domain/game/game-engine.ts`, `src/lib/domain/game/game-session.ts`, `src/lib/domain/game/response-time-measurement.ts`, `src/lib/domain/learning/attempt-progress.ts`, `src/lib/domain/learning/review-candidate.ts`, `src/lib/domain/learning/review-priority.ts`, `src/lib/domain/learning/praise-priority.ts`, `src/lib/application/game/build-session-review.ts`, `src/lib/presentation/game/pair-board-state.ts`, `src/lib/presentation/game/practice-screen.ts`, `src/components/game/pair-board.tsx`, `src/components/game/practice-screen.tsx`, `src/persistence/sqlite-game-session-repository.ts`, `src/composition/practice.ts`, `src/composition/installed-practice.ts`.

Modificados: `src/persistence/sqlite-word-catalog.ts`, `src/app/treino-livre.tsx`, `src/components/challenge/challenge-screen.tsx`, `src/lib/presentation/challenge/challenge-screen.ts`.

Origem da cópia, somente leitura: `/home/psgvaz/Projetos/app-english/lib/domain/game/`, `/home/psgvaz/Projetos/app-english/lib/domain/learning/`, `/home/psgvaz/Projetos/app-english/lib/application/game/build-session-review.ts`, `/home/psgvaz/Projetos/app-english/lib/presentation/game/board-reducer.ts` (referência) e `/home/psgvaz/Projetos/app-english/components/game/game-board.tsx` (referência visual).

Reutilizados: `english.db`, migração 1, aluno local, executor SQL, `createDeviceSpeech`, `watchInstalledForeground` e a paleta da entrada.

Fora deste repositório: `app-english` inteiro. Fora desta entrega: a etapa 2 da revisão diária, com notas limitadas, que fica com `prd-revisao-diaria-nativa`.
