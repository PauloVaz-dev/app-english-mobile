# Review: Task 4 - Pronúncia que não trava a rodada

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 4_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`expo-speech` (~58.0.4) foi instalado com `npx expo install`. A documentação versionada v58 confirma que `Speech.speak(text, options)` devolve `void` e informa a falha por `onError`. O novo `src/speech/device-speech.ts` expõe `createDeviceSpeech(recordEvent?)`, que chama `speak(english, { language: "en-US", onError })` por import estático nomeado. O adaptador nunca lança: tanto o `onError` quanto uma exceção síncrona de `speak` apenas registram `challenge.speech_failed` no aparelho (`console.error`). Ele não chama `getAvailableVoicesAsync`. `createChallengeComposition` ganhou a dependência opcional `speech: ChallengePronunciation` e só pronuncia depois que a tentativa foi aceita pela sessão e gravada, e somente quando é um acerto novo. A chamada não é esperada, e uma exceção vinda do adaptador é contida e registrada sem chegar à sessão. Resultado da suíte: 21 arquivos e 127 testes passando (11 novos). `tsc --noEmit` passou sem erros. `expo lint` mostra só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| `src/speech/device-speech.ts` (novo) | ✅ OK | 0 |
| `src/composition/challenge.ts` | ⚠️ Observação | 1 |
| `package.json` / `package-lock.json` | ✅ OK | 0 |
| `tests/unit/speech/device-speech.test.ts` (novo) | ✅ OK | 0 |
| `tests/integration/composition/challenge-composition.test.ts` | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum.

### 🟡 Problemas Major

Nenhum.

### 🟢 Problemas Minor

1. **De onde vem o inglês pronunciado.** O repositório guarda só os ids das palavras da sessão. Por isso a composição memoriza em memória o mapa id→inglês das palavras devolvidas por `start` e o descarta em `expire` e `abandon`. Se a composição for recriada no meio de uma rodada, os acertos seguintes ficam sem voz, mas a pontuação não muda. Como a voz é opcional (PRD 13), esse comportamento é aceitável. Para a tela da tarefa 5.0, o ideal é manter uma única instância da composição por rodada.
2. `speech` é opcional na composição. Sem ela, que é o caso de um aparelho sem voz ou dos testes anteriores, a rodada segue igual.
3. O evento `challenge.speech_failed` foi definido em `src/composition/challenge.ts`, ao lado de `challenge.persist_failed`, e o union `ChallengeEvent` passou a incluir os dois. O adaptador importa a constante dali. A composição não importa `expo-speech`.

## ✅ Destaques Positivos

- Teste de unidade com `expo-speech` simulado: o texto vai com `en-US`, `getAvailableVoicesAsync` nunca é chamado, e `onError`, exceção síncrona e falha do próprio log não lançam.
- Teste de integração no `better-sqlite3` com o adaptador real e a voz simulada falhando (`onError` e exceção): os acertos continuam gravados, a pontuação fica em 100/210, o recorde é calculado e o evento é registrado uma vez por acerto.
- O erro de associação e a tentativa repetida pelo mesmo `attemptId` não disparam fala.
- Com uma voz que nunca chama `onDone` nem `onError`, a rodada joga três acertos e expira normalmente.
- Um teste de fronteira garante que nem `src/lib/domain/challenge` nem `src/composition/challenge.ts` mencionam `expo-speech`.
- Não há import dinâmico. `react-native` não é importado.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript | ✅ |
| Logging (só no aparelho) | ✅ |
| React | N/A |
| Testes (TDD: os testes falharam antes da implementação) | ✅ |

## Recomendações

1. Na tarefa 5.0, passar `speech: createDeviceSpeech()` ao montar a composição na tela.
2. O `expo-speech` traz código nativo. É preciso gerar um novo development build (`npx expo run:android|ios` ou `eas build --profile development`) antes de testar a voz no aparelho.
3. A decisão de produto pendente sobre o sorteio (`sqlite-word-catalog.ts`) segue em aberto. Esta tarefa não mexeu nele.

## Veredito

Aprovado com observações. Todos os critérios de sucesso valem. A próxima é a tarefa 5.0, a tela.
