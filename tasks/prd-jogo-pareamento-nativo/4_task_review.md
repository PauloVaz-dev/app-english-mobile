# Review: Task 4.0 - Tabuleiro PairBoard

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 4_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A porta `PairBoard` foi criada em duas partes.

- **`src/lib/presentation/game/pair-board-state.ts`** é um módulo puro, sem React, React Native nem Expo. Ele tem:
  - transições puras: `createPairBoardState`, `markPairBoardReady`, `selectPairBoardCard`, `setPairBoardDisabled` e `clearPairBoardFeedback`;
  - visões para a tela: `pairBoardCardView` e `pairBoardFeedbackView`;
  - o `PairBoardController`, que guarda o estado fora do React e dispara os efeitos (`ready`, `pairs_entered`, `attempt`, `announce`) uma vez por toque, depois de atualizar o estado.
- **`src/components/game/pair-board.tsx`** é o componente fino. Ele desenha o feedback e as duas colunas e anuncia pelo `AccessibilityInfo.announceForAccessibility`. Também consulta `isReduceMotionEnabled` e escuta `reduceMotionChanged`, ambos por import estático nomeado de `react-native`. A entrada dos cartões usa `Animated` do React Native com 180 ms e não é animada quando a redução de movimento está ativa.

Acerto, erro e reposição vêm só de `createGameBoard` e `resolveBoardSelection`. O tabuleiro não conhece sessão, banco, pontuação nem cronômetro e ainda não entra em nenhuma tela.

A ordem TDD foi seguida:

1. Os dois arquivos de teste falharam primeiro com `Cannot find package '@/lib/presentation/game/pair-board-state'`.
2. Depois de criar o estado, só os testes de fronteira falharam (`ENOENT pair-board.tsx`).
3. Por último, o componente foi criado.

Verificação:

- vitest: 39 arquivos e 309 testes passando (eram 37 e 276; +31 de unidade e +2 de integração).
- `tsc --noEmit`: sem erros.
- `expo lint`: só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| src/lib/presentation/game/pair-board-state.ts | ⚠️ Observações | 2 (minor) |
| src/components/game/pair-board.tsx | ⚠️ Observações | 2 (minor) |
| tests/unit/presentation/game/pair-board-state.test.ts | ✅ OK | 0 |
| tests/integration/game/pair-board-sequence.test.ts | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema de código. Há uma **decisão de produto pendente**, registrada em "Desvios e Decisões": o tempo de resposta é medido desde a entrada do par, como a tarefa pede, mas isso é diferente da medição versão 2 do site.

### 🟢 Problemas Minor

1. **`pair-board.tsx`: o tabuleiro é montado uma vez.** O controlador é criado no `useState` inicial. Mudar `words`, `random`, `now` ou `createAttemptId` depois da montagem não refaz o tabuleiro. Só os callbacks (`onReady`, `onPairsEntered`, `onAttempt`) acompanham as props. Isso está documentado na interface. As telas 5.0 e 6.0 precisam usar `key={sessionId}` para uma partida nova.
2. **`pair-board.tsx`: `onReady` sai num `useEffect` depois da montagem**, não no `onLayout`. Na prática, os cartões já estão desenhados nesse momento. Se for preciso mais precisão, chamar `controller.ready()` no `onLayout` do contêiner.
3. **`pair-board-state.ts`: comentários de documentação curtos** no módulo, no controlador e em `onAttempt`. Eles explicam o contrato da porta e foram mantidos de propósito.
4. **`pair-board-state.ts`: `onAttempt` não é aguardado nem recebe `catch`.** Uma promessa rejeitada por quem usa o tabuleiro fica a cargo de quem a criou. A composição do treino já registra `practice.persist_failed`. Isso segue a techspec: o tabuleiro não grava.

## ✅ Destaques Positivos

- **Nenhuma regra nova de acerto.** Um teste de fronteira proíbe comparar `promptWordId` com `selectedWordId` ou as duas seleções no estado e no componente. Outro teste exige `createGameBoard` e `resolveBoardSelection` no estado.
- **Erro sem revelar.** A cópia do erro é "Não combina. Tente de novo.", sem o par certo. Os dois cartões errados ficam marcados com "✕" e borda até o feedback sumir ou até o próximo toque. O cartão certo continua "idle". Um teste cobre texto, anúncio e estado dos cartões.
- **Tempo desde a entrada do par.** Os primeiros pares recebem o instante de `ready`, e cada reposição recebe o instante do acerto que a trouxe. O erro intermediário não reinicia a contagem. Há testes para par inicial, par de reposição, depois de um erro, arredondamento e valor nunca negativo.
- **`onReady` uma vez, e só quando dá para tocar.** Ele não dispara com `disabled` ativo e dispara uma única vez ao liberar.
- **`attemptId` gerado no toque que forma o par**, por gerador injetado (`createAttemptId`). Um teste prova que o meio toque não gasta id.
- **`disabled`** bloqueia seleções, descarta uma seleção pela metade (o tempo acaba no meio da escolha) e mostra os cartões como "Indisponível".
- **Acessibilidade.** Os rótulos têm o formato "Português: casa. Selecionado.", "Inglês: house. Não selecionado.", "Não combinou." e "Indisponível.". Os cartões têm `accessibilityState` com `selected` e `disabled`, um hint, títulos das colunas como `header`, e os anúncios acompanham o feedback. Os alvos medem no mínimo 44 pt (`PAIR_BOARD_MIN_TOUCH_TARGET = HOME_ENTRY_METRICS.minTouchTarget`). Os cartões dividem a altura com `flex: 1` (até 5 por coluna), sem rolagem.
- **Visual da entrada.** O componente usa `HOME_ENTRY_PALETTE` e `HOME_ENTRY_METRICS`, com `StyleSheet` como no desafio. O acerto usa a cor `primary` e "✓". O erro usa a cor `emphasis` e "✕". A barra de feedback reserva altura fixa, então os cartões não pulam.
- **Integração.** 20 acertos com erros intercalados, a cada 3 rodadas, esvaziam a fila. `onReady` é chamado uma vez com 5 ids e `onPairsEntered` soma 15 ids, então as 20 palavras são expostas. `onAttempt` é chamado em ordem com os ids `attempt-1…n`, mesmo devolvendo uma promessa que nunca resolve.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ (máx. 3 parâmetros, funções curtas; `applyHit` recebe objeto) |
| TypeScript/Node.js | ✅ |
| REST/HTTP | N/A |
| Logging | N/A |
| React | ✅ (estado fora do React; efeitos fora do render; sem `import()`) |
| Testes | ✅ |

## Desvios e Decisões

- **Tempo de resposta (decisão de produto a confirmar).** A tarefa 4.0, a techspec, o PRD (item 24) e o PRD da revisão (item 35) pedem medir desde a entrada do par, e foi isso que se implementou. No site, a medição versão 2 (`prd-correcao-tempo-resposta`) mede da primeira seleção até a segunda e proíbe `pairEnteredAtMs` no cálculo, porque o tempo de observação deixava quase tudo "difícil". O repositório grava `responseTimeMeasurementVersion = 2` com outra semântica. Na prática, ficam mais difíceis "Mandou bem" (≤ 2 s), a classificação fácil/normal/difícil e as notas da revisão (< 2 s Fácil, > 5 s Difícil). Para trocar de medição, basta mudar `elapsedSinceEntry` e os testes de tempo. O componente e a porta não mudam.
- **Props além da techspec.** `createAttemptId` é obrigatório: o componente não importa `expo-crypto`, e a tela passa `randomUUID`. `now` é opcional e por padrão usa `performance.now()`, que é monotônico.
- **Tocar de novo no cartão selecionado desfaz a seleção.** Esse comportamento não estava na tarefa. É coberto por teste.
- **Feedback não trava o tabuleiro.** O site travava durante o feedback. Aqui o próximo toque já vale, para não atrasar a reposição nem o desafio de 60 s. O feedback some em 1,2 s, e só se ainda for o mesmo.
- **Animação.** Foi usado o `Animated` do React Native, que a doc de animação da Expo aceita, em vez do Reanimated. Até o sistema responder `isReduceMotionEnabled`, os cartões aparecem sem animação.

## Recomendações

1. Confirmar a medição do tempo de resposta (entrada do par ou primeira seleção) antes da 5.0 gravar partidas reais.
2. Nas tarefas 5.0 e 6.0, montar `PairBoard` com `key` da sessão e passar `createAttemptId={randomUUID}` pelo arquivo `installed-*`.
3. Opcional: disparar `ready` no `onLayout` do contêiner.

## Veredito

Aprovado com observações. Os critérios de sucesso valem:
- nenhum código do tabuleiro decide acerto fora de `resolveBoardSelection`;
- o tabuleiro nunca mostra mais de 5 pares;
- os rótulos dizem idioma, texto e estado.

A tarefa 5.0 pode começar depois que a medição do tempo de resposta for confirmada.
