# Tarefa 6.0: Desafio jogável

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Trocar a área reservada da tela do desafio pelo `PairBoard`. Os primeiros cartões tocáveis iniciam o cronômetro de 60 segundos, cada associação passa pela sessão do desafio e o cabeçalho mostra pontos e sequência. As regras do desafio não mudam.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `onReady` chama `controller.cardsReady()`. `onAttempt` chama `composition.attempt` do desafio com o `attemptId` do tabuleiro.
- O controlador do desafio ganha a atualização de pontos e sequência a partir do `ChallengeRound` devolvido.
- No zero, o tabuleiro fica `disabled` e tentativa depois do prazo não entra.
- Com as 40 palavras esgotadas antes do zero, a tela mostra o estado de vocabulário esgotado do PRD do desafio.
- Tentativas do desafio continuam fora de `GameAnswer` e de `LearnerWordProgress`.
- O desafio não grava exposição.
- A explicação de "cartões entram com o jogo de pareamento" sai da tela.
</requirements>

## Subtarefas

- [x] 6.1 Escrever os testes de unidade que falham: `cardsReady` disparado pelo tabuleiro, pontos e sequência atualizados, tabuleiro bloqueado no zero, vocabulário esgotado.
- [x] 6.2 Escrever o teste de integração que falha: rodada pelo tabuleiro e pela composição do desafio grava só em `ChallengeAttempt`, e as tabelas de estudo ficam iguais.
- [x] 6.3 Ligar o `PairBoard` à tela do desafio.
- [x] 6.4 Remover a área reservada e o texto provisório.
- [x] 6.5 Refatorar até os testes do desafio e do treino passarem, e conferir que o bundle Android compila.

## Detalhes de Implementação

Ver `techspec.md`: fluxo do desafio em Visão Geral dos Componentes. Ver também `tasks/prd-desafio-nativo/techspec.md` (prazo absoluto, sem pausa) e `tasks/prd-desafio-nativo/5_task_review.md` (o que ficou pendente na tela do desafio).

## Critérios de Sucesso

- No aparelho, uma rodada de 60 segundos pode ser jogada do começo ao resultado.
- Nenhum arquivo do desafio cria regra de acerto, erro ou reposição.
- Os testes do desafio já existentes continuam passando.

## Testes da Tarefa

- [x] Testes de unidade: controlador e tela do desafio com o tabuleiro.
- [x] Testes de integração: rodada pela composição do desafio contra o SQLite de teste, com as tabelas de estudo intactas.
- [ ] Testes E2E: não se aplicam. A verificação no aparelho é manual, num development build.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/components/challenge/challenge-screen.tsx`
- `src/lib/presentation/challenge/challenge-screen.ts`
- `src/composition/challenge.ts`
- `src/components/game/pair-board.tsx`
- `tests/unit/presentation/challenge/challenge-screen.test.ts`
- `tests/integration/composition/challenge-screen.test.ts`
