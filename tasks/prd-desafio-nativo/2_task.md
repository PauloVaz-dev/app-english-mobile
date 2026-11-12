# Tarefa 2.0: Banco e recorde

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Gravar a sessão, as palavras da sessão e as tentativas no `english.db` da fundação. O recorde é o maior score das sessões concluídas daquele aluno. Sessão abandonada não entra. Progresso de estudo e agenda não mudam. Ainda não há sorteio nem tela.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- Usar as tabelas `ChallengeSession`, `ChallengeSessionWord` e `ChallengeAttempt` da migração 1. Não criar migração nova.
- Gravar `level` como `1`. Esse número não desbloqueia outro modo.
- O recorde é `MAX(score)` das sessões `COMPLETED` do aluno. A sessão atual fica de fora da comparação.
- Empate com o recorde anterior não é recorde novo. A primeira sessão concluída é o recorde.
- Reabrir o mesmo arquivo devolve o mesmo resultado.
- Tentativas do desafio não alteram linhas de progresso nem de agenda.
- Depende da tarefa 1.0 e do banco da fundação.
</requirements>

## Subtarefas

- [x] 2.1 Escrever o teste de unidade que falha para empate, primeira conclusão e abandono fora do recorde.
- [x] 2.2 Escrever o teste de integração que falha enquanto o SQLite não guarda a sessão concluída e o recorde depois de fechar o arquivo.
- [x] 2.3 Implementar o repositório no executor SQL já usado pela fundação.
- [x] 2.4 Acrescentar o teste de que progresso e agenda permanecem iguais depois das tentativas.
- [x] 2.5 Refatorar até os testes passarem sem coluna extra de recorde e sem migração 2.

## Detalhes de Implementação

Ver `techspec.md`: Modelos de Dados, Pontos de Integração e a decisão de calcular o recorde pela consulta, não por uma coluna solta.

O prazo continua sendo `startedAt + 60_000`. Não gravar outra coluna de prazo.

## Critérios de Sucesso

- Uma sessão concluída sobrevive a fechar e abrir o arquivo, com a mesma pontuação.
- Uma sessão abandonada não altera o recorde.
- Score igual ao recorde anterior não é anunciado como recorde novo.
- As tabelas de progresso e de revisão ficam com as mesmas linhas de antes das tentativas.

## Testes da Tarefa

- [x] Testes de unidade: comparação de recorde com valores em memória.
- [x] Testes de integração: `better-sqlite3` grava, reabre, ignora abandono e não mexe no progresso.
- [x] Testes E2E: não se aplicam. A techspec cobre esse ciclo no SQLite, sem Playwright.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/persistence/sqlite-challenge-repository.ts`
- `src/lib/domain/challenge/fixed-challenge.ts`
- `tests/integration/persistence/sqlite-challenge.test.ts`
