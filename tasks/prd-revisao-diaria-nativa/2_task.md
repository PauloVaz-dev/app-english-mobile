# Tarefa 2.0: Plano do dia e sessão de revisão no banco

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Ler o plano do dia do `english.db` e gravar a sessão de revisão: palavras por etapa, tentativas de digitação e a agenda que cada nota move. Ainda não há pareamento com nota, composição nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Implementar em `SqliteDailyReviewReader` os métodos `loadPlanInputs`, `findActiveWords` e `listStudied`, que hoje lançam `DailyReviewCapabilityError`. Só palavras ativas.
- Vencida é `nextReviewAt` no dia local atual ou antes, no fuso do aparelho. Ordem da mais atrasada para a menos atrasada. Palavra com revisão futura não entra.
- Novas respeitam a cota de 10 por aluno por dia (`DAILY_NEW_WORD_LIMIT`), contando as já introduzidas hoje.
- O repositório cria `ReviewSession` e `ReviewSessionWord` (com etapa e origem) numa transação, e a `GameSession` ligada quando houver pareamento. A criação da partida `REVIEW` pode ficar como ponto de extensão para a tarefa 3.0.
- Gravar a tentativa de digitação em `TypingAttempt` e, na primeira tentativa da palavra, a agenda por `scheduleReview` em `LearnerWordProgress`, na mesma transação. O reforço grava com `isReinforcement = 1` e sem nota.
- Repetir o mesmo `attemptId` não altera agenda nem contadores.
- Concluir e abandonar gravam `status` e `finishedAt`. Listar a sessão ativa do aluno, para a tarefa 4.0 abandoná-la antes de abrir outra.
- Ler o plano com 5.000 palavras e progresso leva menos de 500 ms.
</requirements>

## Subtarefas

- [x] 2.1 Escrever os testes de integração que falham para o leitor do plano: primeiro dia só com novas, mais de 20 vencidas, revisão futura fora, cota de novas já usada, palavra inativa fora, tempo com 5.000 palavras.
- [x] 2.2 Escrever os testes de integração que falham para o repositório: criar e reabrir, tentativa com agenda, reforço sem nota, `attemptId` repetido, abandono preservando as notas, sessão ativa do aluno.
- [x] 2.3 Implementar os três métodos do leitor.
- [x] 2.4 Implementar `SqliteReviewSessionRepository` e a porta copiada do site.
- [x] 2.5 Refatorar até os testes passarem, sem mudar regra copiada.

## Detalhes de Implementação

Ver `techspec.md`: Modelos de Dados, Decisões Principais (agenda na mesma transação da tentativa) e Testes de Integração.

Referência, somente leitura: `/home/psgvaz/Projetos/app-english/lib/infrastructure/persistence/prisma/repositories/review-session-repository.ts`, `daily-review-reader.ts`, `due-review-query.ts` e `/home/psgvaz/Projetos/app-english/lib/application/review/ports/review-session-repository.ts`. Padrões deste app: `src/persistence/sqlite-game-session-repository.ts` e `src/persistence/sqlite-daily-review-reader.ts`.

## Critérios de Sucesso

- Nenhuma palavra com revisão futura entra no plano.
- No máximo 10 novas por dia, contando as já introduzidas.
- Uma resposta repetida não muda a agenda.
- O plano com 5.000 palavras sai em menos de 500 ms no teste.
- O resumo da entrada continua com os mesmos números para os mesmos dados.

## Testes da Tarefa

- [x] Testes de unidade: conversão de linhas para snapshot da sessão e da agenda.
- [x] Testes de integração: leitor e repositório no `better-sqlite3` com arquivo de verdade.
- [x] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/persistence/sqlite-daily-review-reader.ts`
- `src/persistence/sqlite-review-session-repository.ts`
- `src/lib/application/review/ports/review-session-repository.ts`
- `src/lib/application/review/ports/daily-review-reader.ts`
- `tests/integration/persistence/sqlite-review-plan.test.ts`
- `tests/integration/persistence/sqlite-review-session.test.ts`
