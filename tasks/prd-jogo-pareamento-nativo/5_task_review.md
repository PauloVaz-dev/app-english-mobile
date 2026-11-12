# Review: Task 5.0 - Tela do treino livre

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 5_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`/treino-livre` deixou de ser o placeholder. A rota só monta `PracticeScreen`. A tela segue o padrão do desafio:

- **`src/lib/presentation/game/practice-screen.ts`** é um módulo puro, sem React, React Native nem Expo. Ele tem:
  - os textos da tela;
  - a porta `PracticeScreenPort`;
  - as visões `practiceHeaderView` (cronômetro, acertos, erros e progresso até 20) e `practiceResultView` (duração, acertos, erros, precisão e tempo médio, depois "Precisa revisar" e então "Mandou bem");
  - o `PracticeScreenController`, com os estados `intro`, `opening`, `match`, `result`, `insufficientCatalog` e `failed`.
- **`src/components/game/practice-screen.tsx`** é o componente fino. Ele usa a paleta e as métricas da entrada, `StyleSheet`, alvos de 44 pt e rótulos de acessibilidade. Monta `PairBoard` com `key={match.sessionId}`. Na partida não há `ScrollView`: o cabeçalho tem duas linhas compactas, e o tabuleiro fica com `flex: 1` dentro das margens seguras.
- **`src/composition/practice.ts`** ganhou `createPracticeScreenPort({ prepare })`, que adapta a composição à porta da tela e traduz `InsufficientPracticeCatalogError` para `insufficientCatalog`. O desenho é o mesmo de `createChallengeScreenPort`.
- **`src/composition/installed-practice.ts`** ganhou três exports:
  - `createInstalledPracticePort()`, com uma composição memorizada por rota;
  - `createPracticeAttemptId()`, que usa `randomUUID` de `expo-crypto`;
  - `practiceBoardRandom`.

  Todos os acessos ao aparelho usam imports estáticos nomeados.

### Fluxo de gravação

- O tabuleiro chama `onReady`, `onPairsEntered` e `onAttempt`, e o controlador põe cada operação numa lista `pending`, na ordem do toque.
- Cada operação é enviada na hora, sem bloquear o tabuleiro. Ela sai da lista quando a gravação termina.
- A primeira falha marca `halted`. A partir daí:
  - o tabuleiro fica desabilitado;
  - aparece o alerta "Não foi possível salvar a última resposta." com "Tentar de novo";
  - o leitor de tela anuncia a falha.
- As operações que a composição recusou com `PracticeWritesHaltedError` continuam na lista. Um toque que chega já com a partida pausada entra na lista e não é enviado.
- `retry()` espera as gravações em voo terminarem e reenvia a lista na ordem, com os mesmos `attemptId`.
- O 20º acerto para o cronômetro (`stoppedAt`) na hora. Quando a gravação devolve `COMPLETED`, a tela lê `result(sessionId)` e mostra o resultado. Se essa leitura falhar, aparece `failed/result` com "Tentar de novo".
- Ao desmontar, `leave()` abandona a partida ativa. Também abandona uma abertura que termina depois da saída. A introdução, o resultado e uma partida já concluída não geram abandono.

### Ordem TDD

1. Os dois arquivos de teste falharam primeiro, com `Cannot find package '@/lib/presentation/game/practice-screen'`.
2. Depois do módulo puro, só os testes de fronteira da rota e do componente falharam.
3. Por último vieram o componente e a rota.

Um teste falhou por erro do próprio teste: o campo `result` da porta falsa escondia o método `result()`. O campo foi renomeado. Nenhum código de produção mudou por causa disso.

### Verificação

- vitest: 41 arquivos e 342 testes passando (eram 39 e 309; +29 de unidade e +4 de integração).
- `tsc --noEmit`: sem erros.
- `expo lint`: só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.
- `expo export --platform android`: o bundle compila (Hermes, 4,4 MB). A pasta `dist/` gerada foi apagada, porque não existia antes.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| src/lib/presentation/game/practice-screen.ts | ⚠️ Observações | 2 (minor) |
| src/components/game/practice-screen.tsx | ✅ OK | 0 |
| src/composition/practice.ts | ✅ OK (só o adaptador da porta) | 0 |
| src/composition/installed-practice.ts | ✅ OK | 0 |
| src/app/treino-livre.tsx | ✅ OK | 0 |
| tests/unit/presentation/game/practice-screen.test.ts | ✅ OK | 0 |
| tests/integration/composition/practice-screen.test.ts | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema de código. Uma decisão de produto da 4.0 continua aberta e agora afeta dados reais (ver "Desvios e Decisões"): a medição do tempo de resposta.

### 🟢 Problemas Minor

1. **Placar otimista.** Acertos, erros e progresso no cabeçalho vêm de `attempt.isCorrect` do tabuleiro, no toque, para o feedback ser imediato. O valor gravado vem da sessão. Os dois só divergiriam se o tabuleiro repetisse um `attemptId`, e ele não repete. O resultado final é sempre lido do banco.
2. **Reabrir mostra a introdução.** O critério "fechar e abrir mostra o mesmo resultado" vale no nível dos dados. O resultado vem de `GameSession.restore` e `buildSessionReview`, e o teste de integração compara a visão antes e depois de reabrir o arquivo. A rota não reabre a última partida encerrada sozinha: depois de reabrir, `/treino-livre` começa na introdução. Mostrar o último resultado ao reabrir exigiria uma leitura de "última sessão concluída" que a tarefa não pede.

## ✅ Destaques Positivos

- **Uma composição por rota e por partida.** `createInstalledPracticePort()` é criado uma vez no `useState` inicial do controlador. Todas as chamadas da partida passam pela mesma fila da composição.
- **O reenvio foi provado contra o SQLite real.** O teste de integração faz um repositório falhar uma vez na tentativa `miss-x`, enquanto `hit-x` e uma exposição já estão na fila. O resultado:
  - `practice.persist_failed` é registrado uma vez;
  - a partida pausa;
  - "Tentar de novo" grava `miss-x` e depois `hit-x`, nessa ordem de `sequence`;
  - o `attemptId` repetido (`hit-y`) conta uma vez só.
- **O abandono foi provado contra o SQLite real.** Sair no meio grava `ABANDONED`, `durationMs` e as tentativas já feitas.
- **Os dados sobrevivem a reabrir o arquivo.** A partida de 20 palavras, com erros intercalados, chega ao resultado. Reabrir o arquivo devolve a mesma `PracticeResultView`.
- **Catálogo insuficiente.** Com 19 palavras ativas, a tela mostra a mensagem própria e nenhuma `GameSession` é criada.
- **Nenhuma regra nova.** Os testes de fronteira proíbem decidir acerto na tela (`promptWordId ===`, `resolveBoardSelection`), `import(` e `expo-crypto` no componente. O módulo puro não importa React, React Native nem Expo. `pair-board-state.ts` não foi alterado.
- **O resultado não mostra fórmulas.** Não aparece dificuldade, peso nem amostra. "Precisa revisar" mostra erros e o tempo até o acerto, ou "não concluída". "Mandou bem" mostra 100% e o tempo. Uma lista sem itens mostra uma frase no lugar: "Nenhuma palavra se destacou nesta partida." ou "Nenhuma palavra precisa de revisão agora.".
- **A entrada não mudou.** Um teste confirma as mesmas quatro ações: `/revisar`, `/treino-livre`, `/desafio` e `/palavras`.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | N/A |
| Logging | ✅ (eventos só pela composição) |
| React | ✅ (estado no controlador; callbacks do tabuleiro estáveis com `useMemo`; sem `import()`) |
| Testes | ✅ |

## Desvios e Decisões

- **Tempo de resposta.** A pendência da revisão 4.0 continua aberta. O tabuleiro mede o tempo desde a entrada do par, enquanto a versão 2 do site mede da primeira à segunda seleção. Agora as partidas reais gravam esse valor com `responseTimeMeasurementVersion = 2`. `pair-board-state.ts` não foi tocado, conforme pedido, e a correção está agendada. Até lá, "Mandou bem" (≤ 2 s) e a classificação fácil, normal e difícil tendem a ficar mais severas.
- **Formato dos números.** A precisão, o tempo médio e o tempo por palavra usam o formato do site: inteiro ou uma casa decimal com ponto (`1.6 s`, `80%`). A duração usa `mm:ss`, também como no site.
- **Cronômetro.** Ele começa quando a partida abre, que é o instante em que a sessão é criada, e para no 20º acerto ou ao sair. Em segundo plano o relógio continua contando, como `durationMs` da sessão.
- **`createPracticeScreenPort` em `practice.ts`.** O arquivo não estava na lista da tarefa, mas o adaptador segue o padrão `createChallengeScreenPort` e mantém `installed-practice.ts` só com a ligação ao aparelho.
- **Sem verificação no aparelho nesta sessão.** O critério "uma partida de 20 palavras vai da introdução ao resultado no aparelho" foi coberto pela integração (controlador, porta, composição e SQLite) e pelo bundle Android. O teste manual num development build ainda precisa ser feito.

## Recomendações

1. Decidir a medição do tempo de resposta antes de muitas partidas reais serem gravadas.
2. Fazer a passada manual num development build: partida completa, "Tentar de novo" e sair no meio.
3. Opcional: ao abrir `/treino-livre`, oferecer o último resultado concluído.

## Veredito

Aprovado com observações. Os critérios de sucesso valem, com a ressalva de que a partida no aparelho ainda depende do teste manual:

- `/treino-livre` não mostra mais o texto de atividade indisponível;
- uma partida de 20 palavras vai da introdução ao resultado pelo controlador, pela composição e pelo SQLite;
- o resultado é o mesmo depois de reabrir o banco;
- a entrada continua com as mesmas quatro ações.

A tarefa 6.0 pode começar.
