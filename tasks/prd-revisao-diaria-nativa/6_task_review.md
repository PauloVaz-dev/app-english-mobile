# Review: Task 6.0 - Tela da revisão

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 6_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

A rota `/revisar` abre a sessão no lugar do aviso de atividade indisponível. A tela mostra a etapa e o progresso, usa o cartão de digitação e o `PairBoard`, grava pela composição já existente, oferece "Tentar de novo" com o mesmo `attemptId`, mostra o resultado e o dia vazio com o treino livre. Sair abandona a sessão aberta e conserva as notas. A entrada relê o resumo ao ganhar foco. Os 19 testes da tarefa, a suíte (606), `npx tsc --noEmit` e `npx expo lint` passaram. O bundle Android compilou. Não há issue crítica nem major.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/lib/presentation/review/review-screen.ts` | ⚠️ Problemas | 3 |
| `src/components/review/review-screen.tsx` | ⚠️ Problemas | 1 |
| `src/app/revisar.tsx` | ✅ OK | 0 |
| `src/components/home/home-entry-screen.tsx` | ✅ OK | 0 |
| `src/composition/review.ts` | ✅ OK | 0 |
| `src/composition/installed-review.ts` | ✅ OK | 0 |
| `tests/unit/presentation/review/review-screen.test.ts` | ✅ OK | 0 |
| `tests/integration/composition/review-screen.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **Nome acima de 30 caracteres** em `src/lib/presentation/review/review-screen.ts`, linha 180. `ReviewScreenControllerDependencies` tem 34 caracteres. O treino livre já usa `PracticeScreenControllerDependencies`, no mesmo papel. Renomear só a revisão afastaria as duas telas. Nenhuma correção.

2. **Comentário no erro engolido** em `src/lib/presentation/review/review-screen.ts`, linha 837, função `quietly`. O `catch` vazio explica que a tela já saiu e a composição já registrou a falha. É o mesmo desenho de `recordQuietly` na composição. Nenhuma correção.

3. **`recordAttempt` altera o progresso e devolve a escrita** em `src/lib/presentation/review/review-screen.ts`, linhas 396-420. A contagem sobe antes da gravação, e a escrita segue com o mesmo `attemptId`. Separar os dois mudaria a ordem que o teste da partida exige. Nenhuma correção.

4. **Número solto no `hitSlop`** em `src/components/review/review-screen.tsx`, linha 330. O valor `4` amplia o toque do botão de sair. O alvo já tem 44 pontos. Um nome `LEAVE_HIT_SLOP` deixaria o número explícito. Nenhuma correção obrigatória.

## ✅ Destaques Positivos

- Os testes da tarefa falharam primeiro porque o módulo não existia. A implementação veio depois.
- A rota só monta `ReviewScreen`. A lógica fica no módulo puro, sem React, React Native nem Expo.
- A digitação usa o cartão da tarefa 5.0. O pareamento usa o `PairBoard` com `key={session.gameSessionId}` e grava exposição e tentativa pela porta da composição.
- Etapa vazia é pulada. "Tentar de novo" reenvia o mesmo `attemptId`. O resultado só oferece continuar quando ainda há palavra que vence hoje.
- Sair no meio grava `ABANDONED` e preserva a nota. Uma sessão completa grava as agendas e o resultado bate com o SQLite. Sair depois de o resultado falhar também abandona a sessão ainda ativa.
- A entrada chama `retry()` no `useFocusEffect`, então o resumo é lido no primeiro foco e de novo ao voltar. As quatro ações continuam as mesmas.
- Uma chamada a `createInstalledReviewPort()` por montagem da tela, e `createInstalledReview()` memoiza a composição.
- `ReviewWriteLane` tem 77 linhas, `ReviewSessionPlan` tem 296 e `ReviewScreenController` tem 188. Nenhum método passa de 50 linhas. Não há `any`.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ⚠️ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | ✅ (não se aplica) |
| Logging | ✅ (não se aplica) |
| React | ✅ |
| Testes | ✅ |

O aviso de padrão cobre o nome longo, o comentário do `catch`, o `recordAttempt` e o `hitSlop`. `npx tsc --noEmit` passou. `npx expo lint` passou. A suíte ficou em 71 arquivos e 606 testes. O comando do projeto é `npx vitest run`, não `yarn test`.

## Recomendações

1. A verificação no aparelho continua manual, num development build. Esta tarefa não cobre teclado real nem o fluxo tocado na tela.
2. Ao voltar do resultado com "Continuar", a composição abre outra sessão com o que ainda vence hoje. O botão só aparece quando `remainingDueToday` é maior que zero.
3. Se o nome longo for encurtado no futuro, o do treino livre deve mudar junto.

## Veredito

Aprovado com observações. Não há issue crítica nem major. A tarefa 6.0 está concluída e a PRD de revisão diária não tem tarefa seguinte neste arquivo.
