# Tarefa 1.0: Regras do jogo copiadas do site

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Trazer do site as regras do pareamento: tabuleiro, sessão, medição do tempo, progresso por tentativa e as listas "Precisa revisar" e "Mandou bem". Tudo em memória, com relógio e aleatoriedade falsos. Ainda não há banco, sorteio, composição nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Copiar sem mudar regra: `game-engine.ts`, `game-session.ts`, `response-time-measurement.ts`, `attempt-progress.ts`, `review-candidate.ts`, `review-priority.ts`, `praise-priority.ts` e `build-session-review.ts` (com o tipo `SessionResultLists`). O repositório `app-english` não é editado.
- Os tipos e erros já copiados em `src/lib/domain/game/types.ts`, `errors.ts` e `src/lib/domain/learning/` são reutilizados. Não duplicar.
- O tabuleiro mostra no máximo 5 pares, e a mesma palavra não ocupa dois pares.
- Acerto remove o par e repõe o próximo da fila. Erro mantém os cartões e não revela a resposta.
- Tentativa repetida pelo mesmo `attemptId` não conta de novo. Mesmo `attemptId` com conteúdo diferente falha.
- A vigésima associação correta conclui a sessão. Abandonar marca `ABANDONED`.
- Sessão `FREE` não avalia nenhuma palavra (`graded = false`).
- Exposição acontece uma vez por palavra na sessão.
- "Mandou bem": zero erros e até 2 segundos, ordem por menor tempo e depois inglês, no máximo 3. "Precisa revisar": no máximo 3.
- Nenhum arquivo desta tarefa importa Expo, React Native ou banco.
</requirements>

## Subtarefas

- [x] 1.1 Copiar os testes do site para o motor e a sessão (`game-engine.test.ts`, `game-session.test.ts`, `fixtures.ts`) e vê-los falhar por falta dos módulos.
- [x] 1.2 Copiar os testes de `attempt-progress`, `review-priority`, `praise-priority` e `build-session-review` e vê-los falhar.
- [x] 1.3 Copiar os módulos de domínio, ajustando só os caminhos de import para os deste repositório.
- [x] 1.4 Copiar `build-session-review.ts` e o tipo `SessionResultLists` para `src/lib/application/game/`.
- [x] 1.5 Acrescentar os testes de fronteira: nenhum arquivo copiado importa Expo, React Native ou banco, e o modo `FREE` não avalia palavra.
- [x] 1.6 Rodar a suíte inteira e refatorar só imports, sem tocar regra.

## Detalhes de Implementação

Ver `techspec.md`: Visão Geral dos Componentes (lista dos novos) e Decisões Principais (regras copiadas, não reescritas).

Origem da cópia, somente leitura:
- `/home/psgvaz/Projetos/app-english/lib/domain/game/game-engine.ts`, `game-session.ts`, `response-time-measurement.ts`
- `/home/psgvaz/Projetos/app-english/lib/domain/learning/attempt-progress.ts`, `review-candidate.ts`, `review-priority.ts`, `praise-priority.ts`
- `/home/psgvaz/Projetos/app-english/lib/application/game/build-session-review.ts` e `session-view.ts` (só `SessionResultLists`, `ReviewWordView` e `EMPTY_SESSION_RESULT_LISTS`)
- Testes: `/home/psgvaz/Projetos/app-english/tests/unit/domain/game/`, `/home/psgvaz/Projetos/app-english/tests/unit/domain/learning/{attempt-progress,review-priority,praise-priority}.test.ts`, `/home/psgvaz/Projetos/app-english/tests/unit/application/game/build-session-review.test.ts`

Se um tipo do site não existir aqui, comparar com o arquivo já copiado antes de criar outro.

## Critérios de Sucesso

- Os testes copiados do site passam sem edição de regra, só de caminho.
- `npx tsc --noEmit` sem erros e nenhum erro novo em `npx expo lint`.
- Nenhum arquivo de `src/lib/domain` ou `src/lib/application` importa Expo, React Native ou banco.

## Testes da Tarefa

- [x] Testes de unidade: motor, sessão, progresso por tentativa, listas do resultado e fronteira de imports.
- [x] Testes de integração: uma sessão `FREE` de 20 palavras em memória, do tabuleiro ao resultado, com exposições, erros e reposição, devolve as métricas e as listas esperadas.
- [x] Testes E2E: não se aplicam. Não há tela nem banco.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/lib/domain/game/game-engine.ts`
- `src/lib/domain/game/game-session.ts`
- `src/lib/domain/game/response-time-measurement.ts`
- `src/lib/domain/learning/attempt-progress.ts`
- `src/lib/domain/learning/review-candidate.ts`
- `src/lib/domain/learning/review-priority.ts`
- `src/lib/domain/learning/praise-priority.ts`
- `src/lib/application/game/build-session-review.ts`
- `src/lib/application/game/session-view.ts`
- `tests/unit/domain/game/`
- `tests/unit/domain/learning/`
- `tests/unit/application/game/`
