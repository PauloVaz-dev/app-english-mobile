# Tarefa 3.0: Pareamento que dá nota

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Fazer o repositório da partida aceitar o modo `REVIEW`: as palavras agendadas do pareamento recebem nota por `applyMatchingReview` e movem a agenda; as distratoras completam o tabuleiro sem nota. O treino livre e o desafio não mudam.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `SqliteGameSessionRepository.create` aceita `REVIEW` além de `FREE`. Em `REVIEW`, as distratoras entram com `graded = 0` e as agendadas com `graded = 1`.
- Numa sessão `REVIEW`, a tentativa de palavra avaliada passa por `applyMatchingReview` e grava a agenda na mesma transação da tentativa: no máximo Bom; o último par, no máximo Difícil; só a primeira tentativa da palavra dá nota.
- A distratora e a palavra que não vence hoje não alteram a agenda.
- O fuso usado é o da sessão de revisão.
- Exposição, contadores de progresso e `attemptId` repetido seguem como no treino livre.
- `FREE` continua sem escrever nenhuma coluna de agenda.
</requirements>

## Subtarefas

- [x] 3.1 Escrever os testes de integração que falham: acerto rápido no pareamento vira no máximo Bom, último par no máximo Difícil, erro seguido de acerto é Errei, distratora sem nota, tentativa repetida sem efeito, `FREE` intacto.
- [x] 3.2 Liberar o modo `REVIEW` em `create` e na leitura.
- [x] 3.3 Gravar a agenda por `applyMatchingReview` dentro da transação da tentativa.
- [x] 3.4 Ligar a criação da partida `REVIEW` ao repositório da sessão de revisão da tarefa 2.0.
- [x] 3.5 Refatorar até os testes do treino, do desafio e da revisão passarem.

## Detalhes de Implementação

Ver `techspec.md`: Visão Geral dos Componentes (modificados) e Decisões Principais (tempo versão 2 no pareamento).

Referência, somente leitura: `persistAttemptProgress` em `/home/psgvaz/Projetos/app-english/lib/infrastructure/persistence/prisma/repositories/game-session-repository.ts`.

## Critérios de Sucesso

- O treino livre e o desafio continuam com as tabelas de agenda iguais antes e depois.
- Uma partida `REVIEW` grava nota só nas palavras agendadas, e nunca acima de Bom.

## Testes da Tarefa

- [x] Testes de unidade: escolha do teto da nota e da palavra avaliada a partir das linhas da partida.
- [x] Testes de integração: partida `REVIEW` contra o `better-sqlite3`, ligada a uma sessão de revisão.
- [x] Testes E2E: não se aplicam. Não há tela.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/persistence/sqlite-game-session-repository.ts`
- `src/persistence/sqlite-review-session-repository.ts`
- `src/lib/domain/learning/matching-review.ts`
- `tests/integration/persistence/sqlite-review-matching.test.ts`
