# Review: Task 5 - Tela do desafio

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 5_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`src/app/desafio.tsx` não usa mais `UnavailableActivity`. A rota agora renderiza `ChallengeScreen`, que mostra introdução, rodada (cabeçalho com Sair, tempo, pontos e sequência, mais a área reservada do tabuleiro), tempo esgotado, resultado, catálogo insuficiente e falha com tentar de novo. Toda a lógica de estado fica em `src/lib/presentation/challenge/challenge-screen.ts`, um módulo puro com cópia, relógio (`deadline - now`), anúncios, resultado e o `ChallengeScreenController`. O controlador conversa com a composição pela porta `ChallengeScreenPort`. O adaptador `createChallengeScreenPort` (em `src/composition/challenge.ts`) liga essa porta à `ChallengeComposition`, e `src/composition/installed-challenge.ts` faz a ligação ao aparelho com `connectEnglishDatabase`, `expo-crypto`, `Math.random`, `console.error` e `createDeviceSpeech()`. Cada tela usa uma única composição. O `AppState` reaproveita `watchInstalledForeground`.

Resultado da suíte: 24 arquivos e 168 testes passando, 36 deles novos (31 de unidade e 5 de integração). `tsc --noEmit` passou sem erros. `expo lint` mostra só o erro que já existia em `src/hooks/use-color-scheme.web.ts`. `expo export --platform android` gerou o bundle sem avisos.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/app/desafio.tsx` | ✅ OK | 0 |
| `src/components/challenge/challenge-screen.tsx` (novo) | ⚠️ Observação | 1 |
| `src/lib/presentation/challenge/challenge-screen.ts` (novo) | ⚠️ Observação | 1 |
| `src/composition/challenge.ts` | ✅ OK | 0 |
| `src/composition/installed-challenge.ts` (novo) | ⚠️ Observação | 1 |
| `tests/unit/presentation/challenge/challenge-screen.test.ts` (novo) | ✅ OK | 0 |
| `tests/integration/composition/challenge-screen.test.ts` (novo) | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

1. **No aparelho, a rodada ainda não começa.** O tempo só começa quando o tabuleiro avisa que os cartões podem ser tocados (`controller.cardsReady()`, PRD 6). Como a porta `PairBoard` ainda não existe, nada chama esse método. Por isso, hoje "Começar" sorteia as palavras, grava a sessão `ACTIVE` e mostra a rodada parada em 1:00, com a área explicando que os cartões entram com o jogo de pareamento. Sair grava `ABANDONED`. Esse é o limite que a própria task define (5.5 e Sequenciamento da techspec). Expiração, segundo plano e resultado estão ligados e testados no controlador e contra o SQLite, mas só vão aparecer no aparelho quando o tabuleiro chamar `cardsReady` e `attempt`.

### 🟢 Problemas Minor

1. `src/lib/presentation/challenge/challenge-screen.ts`, `cardsReady`: o prazo exibido é calculado como `now + CHALLENGE_DURATION_MS`, porque `begin` da composição devolve `void`. O valor é o mesmo que a sessão grava, já que `begin` só é chamado uma vez por rodada. Se a porta do tabuleiro passar a reler a rodada, vale trocar isso por `deadline` vindo da composição.
2. `src/components/challenge/challenge-screen.tsx`: pontos e sequência do cabeçalho ficam no valor inicial (0), porque a única fonte de tentativas é o tabuleiro. Não foi criado nenhum caminho de acerto ou erro, como a task pede.
3. `src/composition/installed-challenge.ts` reaproveita `prepareHomeStudy` (migração, aluno local e seed, todos idempotentes) para obter o `visitorId`. Assim, uma falha nessa etapa registra `home.migration_failed` ou `home.seed_failed`, e não um evento `challenge.*`. A tela mostra o estado de falha com "Tentar de novo".

## ✅ Destaques Positivos

- O relógio nunca conta sozinho. `challengeClockView(deadline, now)` é a única fonte, e o `setInterval` (250 ms) e a volta para o primeiro plano só redesenham e chamam `refresh()`.
- Segundo plano não abandona nem pausa. O teste de integração confirma a sessão `ACTIVE` e o mesmo prazo depois de um salto de 50 s. A volta com o prazo vencido conclui no instante do prazo (`finishedAt` = prazo) e uma tentativa nova é rejeitada com `SessionEndedError`.
- Sair no meio grava `ABANDONED` com a pontuação parcial, e o recorde anterior (`bestCompletedScore`) continua igual. Sair depois do prazo conclui em vez de abandonar. Uma abertura que termina depois da saída também é abandonada.
- "Tempo esgotado" aparece antes do resultado (`timeUp`, com `CHALLENGE_TIME_UP_HOLD_MS`, alerta e `announceForAccessibility`). Expirar duas vezes ao mesmo tempo gera uma única chamada.
- Nos 10 s finais, o tempo aparece em número e em texto ("Faltam 9 segundos"), além da cor. O leitor de tela só ouve o tempo aos 30 s, aos 10 s e no zero.
- O empate aparece como "Você empatou com o seu recorde", não como recorde novo. Isso está coberto com a composição falsa e contra o SQLite.
- Os alvos usam `HOME_ENTRY_METRICS.minTouchTarget` (44), têm `accessibilityLabel` e seguem a paleta e as métricas da entrada.
- Os testes de fronteira garantem que a rota não usa `UnavailableActivity`, que nenhum arquivo da tela faz `attempt` ou trata palavras selecionadas, e que não há `import()` dinâmico.
- O 5.1 e o 5.2 falharam primeiro (módulo inexistente) e só passaram depois da implementação.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript | ✅ |
| REST/HTTP | N/A |
| Logging (só no aparelho) | ✅ |
| React | ✅ |
| Testes | ✅ |

## Recomendações

1. Quando `prd-jogo-pareamento-nativo` tiver especificação, o `PairBoard` deve chamar `controller.cardsReady()` quando os cartões puderem ser tocados e repassar as tentativas para `composition.attempt`. Para isso, o controlador precisa de um método que atualize pontos e sequência a partir do `ChallengeRound` devolvido.
2. `expo-speech` traz código nativo, então é preciso gerar um novo development build antes de testar a voz no aparelho.
3. `npx expo lint` continua com 1 erro que já existia (`react-hooks/set-state-in-effect`) em `src/hooks/use-color-scheme.web.ts`.

## Veredito

Aprovado com observações. Todos os critérios de sucesso valem no controlador e na composição contra o SQLite. A rodada visual com cartões depende da porta do jogo de pareamento.
