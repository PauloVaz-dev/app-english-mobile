# Especificação Técnica — Revisão diária no aplicativo

## Resumo Executivo

A revisão roda no aplicativo local, sobre o `english.db` da fundação, e substitui o aviso de atividade indisponível na rota `/revisar`. A agenda SM-2 (`review-schedule.ts`) e o plano do dia (`daily-review-plan.ts`) já estão no aplicativo, idênticos aos do site. Esta entrega copia do site o que falta, sem mudar regra: a sessão de revisão (`domain/review`), a correção da digitação com "quase" (`typing-answer.ts`, com `fastest-levenshtein`), a nota da digitação (`typing-review.ts`) e a nota do pareamento (`matching-review.ts`).

Uma sessão tem duas etapas. A digitação grava em `TypingAttempt` e move a agenda pela nota da primeira tentativa. O pareamento reutiliza o `PairBoard` e o `SqliteGameSessionRepository`, que passa a aceitar o modo `REVIEW`: as palavras agendadas são avaliadas por `applyMatchingReview` (no máximo Bom; o último par, no máximo Difícil) e as distratoras entram com `graded = 0`. Os repositórios Prisma do site viram repositórios SQLite sobre o executor e a transação da fundação. Fechar no meio deixa as notas gravadas; tocar "Revisar hoje" de novo abandona a sessão aberta e monta outra com o que ainda vence.

## Arquitetura do Sistema

### Visão Geral dos Componentes

Novos (cópia do site, sem mudança de regra):

- `src/lib/domain/review/review-session.ts`, `errors.ts`, `index.ts`: sessão com etapas, palavras por origem (vencida, nova, aprendendo), tentativas de digitação, reforço do erro ao fim da etapa, abandono e conclusão.
- `src/lib/domain/learning/typing-answer.ts`: certo, quase, errado e "não sei", ignorando maiúscula, acento e espaço.
- `src/lib/domain/learning/typing-review.ts` e `matching-review.ts`: nota de cada etapa.
- `src/lib/application/review/`: `start-daily-review.ts`, `record-typing-answer.ts`, `finish-review-session.ts`, `load-review-session.ts`, `build-review-result.ts`, `review-session-view.ts`, `resolve-time-zone.ts`, `errors.ts` e a porta `ports/review-session-repository.ts`. Cópia, ajustando só caminhos.

Novos (escritos aqui):

- `src/persistence/sqlite-review-session-repository.ts`: cria a sessão com as palavras e a partida ligada, grava a tentativa de digitação com a agenda numa transação, conclui, abandona e lê.
- `src/composition/review.ts` e `src/composition/installed-review.ts`: composição pura e ligação ao aparelho, com fila única de banco como no treino.
- `src/lib/presentation/review/typing-card.ts` e `src/components/review/typing-card.tsx`: cartão de digitação (português, campo, Enviar, Dica, Não sei, retorno de certo, quase e erro, frase de exemplo).
- `src/lib/presentation/review/review-screen.ts` e `src/components/review/review-screen.tsx`: etapa atual, progresso, pareamento, resultado e o estado "nada para revisar".

Modificados:

- `src/persistence/sqlite-daily-review-reader.ts`: implementa `loadPlanInputs`, `findActiveWords` e `listStudied`, que hoje lançam `DailyReviewCapabilityError`.
- `src/persistence/sqlite-game-session-repository.ts`: aceita `REVIEW`. Numa sessão `REVIEW`, o acerto e o erro de palavra avaliada passam por `applyMatchingReview` e gravam a agenda na mesma transação da tentativa.
- `src/app/revisar.tsx`: deixa de usar `UnavailableActivity`.
- `src/components/home/home-entry-screen.tsx`: relê o resumo do dia ao voltar ao foco, para os números mudarem depois da revisão.
- `package.json`: `fastest-levenshtein`.

Fluxo: a entrada abre `/revisar`. `start` abandona a sessão ativa do aluno, se houver, carrega o plano (vencidas da mais atrasada para a menos atrasada, até 20, mais novas até a cota do dia), monta as distratoras com `selectDistractorWordIds` quando o pareamento tiver menos de 3 palavras, e grava `ReviewSession`, `ReviewSessionWord` e, se houver pareamento, a `GameSession` ligada. A tela mostra a digitação; cada envio grava a tentativa e, na primeira tentativa da palavra, a agenda. Os erros voltam uma vez ao fim da etapa como reforço, sem nova nota. Depois vem o pareamento com o `PairBoard`, que grava pelo repositório da partida. O fim conclui a sessão e lê o resultado: acertos, erros, quantas ainda vencem hoje e a próxima revisão.

## Design de Implementação

### Interfaces Principais

```ts
// src/composition/review.ts
interface ReviewComposition {
  start(visitorId: string): Promise<ReviewOpening>;        // ou NothingToReview
  type(input: TypingSubmission): Promise<TypingFeedback>;  // idempotente por attemptId
  expose(sessionId: string, wordIds: readonly string[]): Promise<void>;
  match(input: PracticeAttemptInput): Promise<void>;       // tentativa do tabuleiro
  finish(sessionId: string): Promise<ReviewResult>;
  abandon(sessionId: string): Promise<void>;
}
interface TypingSubmission {
  sessionId: string; attemptId: string; wordId: string;
  kind: "answer" | "dont_know"; typed: string | null;
  usedHint: boolean; responseTimeMs: number;
}
```

`TypingFeedback` traz o resultado (certo, quase, errado, não sei), a grafia correta, a frase de exemplo e o próximo cartão. A nota não aparece na tela: ela sai do desempenho.

### Modelos de Dados

Não há migração. As tabelas da versão 1 já cobrem tudo:

- `ReviewSession`: `localDate` e `timeZone` do aparelho, `status`, `gameSessionId` da etapa de pareamento.
- `ReviewSessionWord`: `stage` (digitação ou pareamento) e `origin` (vencida, nova, aprendendo, distratora).
- `TypingAttempt`: `outcome`, `typedText`, `usedHint`, `responseTimeMs`, `grade` só na primeira tentativa, `isReinforcement` no retorno do erro.
- `GameSession` com `mode = 'REVIEW'`; `GameSessionWord.graded = 0` só nas distratoras.
- `LearnerWordProgress`: as colunas de agenda (`reviewState`, `reviewRepetitions`, `reviewLapses`, `reviewIntervalDays`, `reviewEaseFactor`, `lastReviewedAt`, `nextReviewAt`) passam a ser escritas por `scheduleReview`, sempre na mesma transação da tentativa que gerou a nota.

O histórico de tentativas nunca é apagado, para sustentar outro algoritmo no futuro.

### Endpoints de API

Não se aplica. Não há servidor nem rede.

## Pontos de Integração

- `expo-sqlite` pelo executor e pela transação da fundação. As consultas do plano usam o índice `LearnerWordProgress_visitorId_nextReviewAt_idx`.
- `fastest-levenshtein`: JavaScript puro, sem código nativo e sem novo development build.
- `expo-speech` por `createDeviceSpeech`, depois da resposta digitada e no acerto do pareamento. Falha registra `review.speech_failed` por `logDeviceEvent`.
- `expo-crypto` para ids de sessão e de tentativa.
- `TextInput` com `autoFocus` a cada cartão, `submitBehavior="submit"` para o teclado não fechar entre cartões, `returnKeyType="send"`, `autoCapitalize="none"`, `autoCorrect={false}` e `spellCheck={false}`, para o corretor não "acertar" pela pessoa. `KeyboardAvoidingView` com `behavior="padding"`, como no cadastro.
- `AccessibilityInfo.announceForAccessibility` para o resultado de cada resposta, com a grafia correta.
- Fuso do aparelho por `applyInstalledTimeZone`, já usado pela entrada.

## Abordagem de Testes

A ordem é TDD: teste que falha, implementação mínima, refatoração. Os testes das regras copiadas vêm junto com a cópia e passam sem edição de regra.

### Testes Unidade

- Copiados do site: `review-session.test.ts`, `typing-answer`, `typing-review`, `matching-review` e `review-use-cases.test.ts`.
- Casos do PRD: "quase" com uma letra trocada, faltando e sobrando; menos de 4 letras não vira quase; dica limita a Difícil; "não sei" é Errei; o reforço não muda a nota; no pareamento a nota máxima é Bom e o último par é no máximo Difícil; a distratora não recebe nota.
- `typing-card` e `review-screen` com composição falsa: foco a cada cartão, Enviar pelo teclado, Dica revela a primeira letra, feedback diferente para certo, quase e erro, etapa vazia pulada, progresso da sessão, nada para revisar com caminho para o treino livre.

Mocks só nas bordas: `expo-speech`, `expo-crypto`, `react-native`.

### Testes de Integração

No `better-sqlite3`, com o executor da fundação:

- Primeiro dia, só palavras novas: até 10 entram, todas no pareamento.
- Mais de 20 vencidas: entram as 20 mais atrasadas; uma segunda sessão pega o restante.
- Palavra com revisão futura não entra.
- Três acertos seguidos em dias diferentes deixam a palavra pelo menos 7 dias fora.
- Errei manda para o dia seguinte e reduz a facilidade, com o mínimo respeitado.
- Resposta repetida pelo mesmo `attemptId` não altera agenda nem contadores.
- Pareamento com menos de 3 agendadas recebe distratoras, e a agenda delas fica igual.
- Fechar no meio e começar de novo: a sessão antiga vira `ABANDONED`, as notas dadas ficam e as palavras já avaliadas não voltam.
- Treino livre e desafio continuam sem mexer na agenda.
- Começar a sessão com 5.000 palavras e progresso leva menos de 500 ms.

### Testes de E2E

Não se aplicam. Não há Playwright neste aplicativo. A verificação no aparelho é manual, num development build.

## Sequenciamento de Desenvolvimento

### Ordem de Construção

1. Cópia do domínio da revisão e das notas, com os testes do site e `fastest-levenshtein`. Não depende de nada.
2. Leitura do plano (`sqlite-daily-review-reader`) e repositório da sessão de revisão, com a agenda gravada na digitação. Depende de 1.
3. Modo `REVIEW` no repositório da partida, com a nota do pareamento e as distratoras. Depende de 1.
4. Casos de uso e composição da revisão. Depende de 2 e 3.
5. Cartão de digitação, estado puro e componente. Depende de 1.
6. Tela da revisão em `/revisar`, com as duas etapas, o resultado e a entrada atualizada. Depende de 4 e 5.

### Dependências Técnicas

Fundação com `english.db` na versão 1, o aluno local e o fuso do aparelho. `PairBoard` e `SqliteGameSessionRepository` do pareamento. `fastest-levenshtein` por `npm install`, por não ser módulo Expo. Nenhum development build novo.

## Monitoramento e Observabilidade

Não há Prometheus nem Grafana. Nada sai do aparelho. Eventos por `logDeviceEvent`:

- `review.persist_failed`: falha ao gravar sessão, tentativa ou agenda. A tela mostra "Tentar de novo" e reenvia pelo mesmo `attemptId`.
- `review.speech_failed`: voz indisponível, aviso uma vez. A sessão segue.
- "Nada para revisar" não é log: é estado da tela.

## Considerações Técnicas

### Decisões Principais

As regras são copiadas, não reescritas: sessão, correção da digitação, notas e agenda. A agenda e o plano do dia já são cópia exata do site. Só os repositórios e a tela são escritos aqui.

`fastest-levenshtein` é instalado em vez de reescrever a distância de edição. É JavaScript puro, e a cópia de `typing-answer.ts` fica idêntica à do site.

Fechar no meio não retoma a mesma sessão. Tocar "Revisar hoje" de novo abandona a sessão aberta e monta outra com o que ainda vence. As palavras já avaliadas não voltam, porque a agenda delas foi para outro dia. Isso cumpre "as notas já dadas permanecem" sem reconstruir a tela a partir do banco. Decisão de 2026-11-12.

O treino livre continua sorteando entre todas as palavras ativas, com peso, e nunca mexe na agenda, como decidido no pareamento. O item 36 do PRD é atualizado para refletir isso. Decisão de 2026-11-12.

A nota do pareamento usa o tempo da medição versão 2 (da primeira à segunda seleção), já corrigido no `PairBoard`. A digitação mede do aparecimento do cartão até o envio, como pede o PRD.

A agenda é gravada na mesma transação da tentativa. Assim uma tentativa nunca fica gravada sem a nota correspondente, nem o contrário.

### Riscos Conhecidos

- Corretor ou autocompletar do teclado alterando a resposta. Mitigação: `autoCorrect`, `spellCheck` e sugestões desligados no campo; verificação manual em Android e iOS.
- O teclado cobrindo "Dica" e "Não sei". Mitigação: ações logo abaixo do campo, dentro do `KeyboardAvoidingView`; verificação manual.
- Mudança de fuso no meio da sessão. A sessão guarda o fuso em que começou; a próxima sessão usa o fuso novo.
- Consulta lenta com 5.000 palavras. Mitigação: índice existente e teste de tempo na integração.

### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica. `src/lib/domain` e `src/lib/application` continuam sem Expo, React Native e acesso ao banco.

### Arquivos relevantes e dependentes

Novos: `src/lib/domain/review/review-session.ts`, `src/lib/domain/review/errors.ts`, `src/lib/domain/review/index.ts`, `src/lib/domain/learning/typing-answer.ts`, `src/lib/domain/learning/typing-review.ts`, `src/lib/domain/learning/matching-review.ts`, `src/lib/application/review/` (casos de uso e porta), `src/persistence/sqlite-review-session-repository.ts`, `src/composition/review.ts`, `src/composition/installed-review.ts`, `src/lib/presentation/review/typing-card.ts`, `src/lib/presentation/review/review-screen.ts`, `src/components/review/typing-card.tsx`, `src/components/review/review-screen.tsx`.

Modificados: `src/persistence/sqlite-daily-review-reader.ts`, `src/persistence/sqlite-game-session-repository.ts`, `src/app/revisar.tsx`, `src/components/home/home-entry-screen.tsx`, `package.json`.

Origem da cópia, somente leitura: `/home/psgvaz/Projetos/app-english/lib/domain/review/`, `/home/psgvaz/Projetos/app-english/lib/domain/learning/{typing-answer,typing-review,matching-review}.ts`, `/home/psgvaz/Projetos/app-english/lib/application/review/`, os repositórios Prisma `review-session-repository.ts`, `game-session-repository.ts` e `due-review-query.ts` (referência) e os testes em `/home/psgvaz/Projetos/app-english/tests/unit/domain/review/`, `tests/unit/domain/learning/` e `tests/unit/application/review/`.

Reutilizados: `review-schedule.ts`, `daily-review-plan.ts`, `word-selection.ts` (`selectDistractorWordIds`), `PairBoard`, `SqliteGameSessionRepository`, `createDeviceSpeech`, `logDeviceEvent`, `applyInstalledTimeZone` e a paleta da entrada.

Fora deste repositório: `app-english` inteiro. Fora desta entrega: FSRS, outros tipos de exercício, autoavaliação e configuração de limites.
