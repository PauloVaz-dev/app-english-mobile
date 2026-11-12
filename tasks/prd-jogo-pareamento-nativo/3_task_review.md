# Review: Task 3.0 - Composição do treino

**Revisor**: AI Code Reviewer
**Data**: 2026-11-12
**Arquivo da task**: 3_task.md
**Status**: APROVADO COM OBSERVAÇÕES

## Resumo

`createPracticeComposition` (`src/composition/practice.ts`) liga sorteio, sessão `FREE`, repositório SQLite, voz e eventos em cinco operações: `start`, `expose`, `attempt`, `abandon` e `result`. O arquivo é puro: não importa Expo nem React Native, e não usa `import()`. `src/composition/installed-practice.ts` liga a composição ao aparelho com imports estáticos nomeados:

- `connectEnglishDatabase` e `createEnglishDatabaseSession`, que abrem o banco;
- `prepareHomeStudy`, que prepara a migração, a semente e o aluno;
- `randomUUID` de `expo-crypto`;
- `Math.random`;
- `console.error`;
- `createDeviceSpeech`.

A ordem TDD foi seguida. Os dois arquivos de teste falharam primeiro, com `Cannot find package '@/composition/practice'`, e o teste de fronteira falhou com `ENOENT installed-practice.ts`. Depois todos passaram. Uma expectativa do teste estava errada: o tempo médio do domínio usa todas as tentativas, não só os acertos. O teste foi corrigido para 1.600 ms. Nenhuma regra mudou.

Verificação:

- vitest: 37 arquivos e 276 testes passando (eram 35 e 259).
- `tsc --noEmit`: sem erros.
- `expo lint`: só o erro que já existia em `src/hooks/use-color-scheme.web.ts`.

## Arquivos Revisados

| Arquivo | Status | Problemas |
|---------|--------|-----------|
| src/composition/practice.ts | ⚠️ Observações | 3 (minor) |
| src/composition/installed-practice.ts | ✅ OK | 0 |
| src/speech/device-speech.ts | ✅ OK (só o comentário) | 0 |
| tests/unit/composition/practice-composition.test.ts | ✅ OK | 0 |
| tests/integration/composition/practice-composition.test.ts | ✅ OK | 0 |

## Problemas Encontrados

### 🔴 Problemas Críticos

Nenhum problema crítico encontrado.

### 🟡 Problemas Major

Nenhum problema major encontrado.

### 🟢 Problemas Minor

1. **"Acerto novo" é decidido na memória da composição.** O repositório devolve o mesmo `AttemptResult` para uma tentativa nova e para uma repetida. Por isso a composição guarda os `attemptId` já respondidos. Depois de reabrir o aplicativo, reenviar um acerto já gravado falaria a palavra de novo, mas não contaria de novo. Hoje a tela não reenvia depois de reabrir. Se isso for necessário, o repositório pode devolver `isNew`.
2. **Memória por sessão.** Os mapas de pronúncia, de respostas e de falhas só são limpos em `abandon`. Uma partida concluída mantém no máximo 20 palavras e 20 ids na memória enquanto a rota existir. Isso é desprezível.
3. **Bloqueio após falha.** Uma falha de exposição também bloqueia as tentativas que já estavam na fila atrás dela. A tela (tarefa 5.0) precisa reenviar a operação que falhou e depois as seguintes, na ordem.

## ✅ Destaques Positivos

- **Fila única para todas as operações de banco.** A techspec pedia uma fila por sessão. A fila implementada é única e serializa tudo, na ordem das chamadas: o sorteio e a criação em `start`, as exposições, as tentativas, o abandono e as duas leituras de `result`. Isso responde ao alerta da revisão 2.0 sobre `withTransactionAsync`. Uma leitura em paralelo não cai dentro de uma transação aberta.
  - **Teste de unidade:** um repositório falso atrasa mais as primeiras chamadas. O teste prova que nenhuma chamada se sobrepõe (`maxActive = 1`) e que a ordem é a das chamadas, inclusive para `result` e `abandon`.
  - **Teste de integração:** os toques de cada rodada são disparados sem `await` contra o `BEGIN`/`COMMIT` real do `better-sqlite3`. Sem a fila, esse transporte recusaria transações aninhadas.
- **Ordem preservada após falha.** Quando uma gravação da partida falha, o comportamento é este:
  - registra `practice.persist_failed`;
  - repassa o erro original;
  - recusa as chamadas que já estavam na fila atrás dela com `PracticeWritesHaltedError`, sem tocar no banco.

  O reenvio do mesmo `attemptId` grava uma vez só, e a ordem das tentativas continua a do toque.
- **Voz depois da gravação.** A voz fala só depois de um acerto novo gravado, sem `await`. Uma falha síncrona registra `practice.speech_failed`. A falha do aparelho (`onError`) passa por `createDeviceSpeech` com `recordPracticeSpeechFailure`, que registra o mesmo evento. `createDeviceSpeech` não mudou de assinatura e o desafio continua igual.
- **Partida completa.** O teste de integração compara a gravação com o que uma `GameSession` em memória calcula com os mesmos passos. Snapshot, métricas e listas do resultado são iguais, as 20 falas falham e a partida segue. Reabrir o arquivo devolve o mesmo resultado.
- **Abandono.** Grava `ABANDONED` com a duração correta e mantém as tentativas que já estavam na fila. Um segundo abandono não muda nada.
- **Catálogo insuficiente.** Com menos de 20 palavras ativas, `InsufficientPracticeCatalogError` (`state = INSUFFICIENT_CATALOG`) é lançado sem criar sessão e sem registrar evento.

## Conformidade com Padrões

| Padrão | Status |
|--------|--------|
| Padrões de Código | ✅ |
| TypeScript/Node.js | ✅ |
| REST/HTTP | N/A |
| Logging | ✅ (`console.error` só em `installed-practice.ts`) |
| React | N/A |
| Testes | ✅ |

## Desvios e Decisões

- **Fila única em vez de fila por sessão.** A fila única é estritamente mais segura no aparelho. Para um aluno com uma partida por vez, o efeito é o mesmo.
- **`PracticeWritesHaltedError`.** É um erro novo, criado para manter a ordem das tentativas depois de uma falha. A tela deve tratá-lo como "Tentar de novo".
- **`recordPracticeSpeechFailure`.** É um auxiliar puro em `practice.ts`. Ele adapta o recorder de `createDeviceSpeech` ao evento do treino sem mudar a voz do desafio.
- **`createInstalledPractice()`.** Devolve uma preparação memorizada (`() => Promise<PreparedPractice>`), como a do desafio. A porta da tela fica para a tarefa 5.0.

## Veredito

Aprovado com observações. Todos os critérios de sucesso valem:
- uma partida completa pela composição grava o mesmo que a sessão em memória;
- uma falha de voz não muda o acerto, o registro nem a reposição;
- `practice.ts` não importa Expo nem React Native.

A tarefa 4.0 pode começar.
