# Tarefa 3.0: Composição e sorteio

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Ligar o começo da rodada ao catálogo. A composição sorteia até 40 palavras ativas, sem repetir, usando a seleção de desafio do site só para ler. Catálogo vazio não cria sessão. A tela ainda não existe.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `start` sorteia pela função de seleção de desafio já existente, com limite 40, sem gravar progresso nem agenda.
- Nenhuma palavra se repete na sessão.
- Zero palavras ativas devolve o estado de catálogo insuficiente e não insere sessão.
- `begin` grava `startedAt` uma vez, quando os cartões puderem ser tocados.
- `attempt`, `expire` e `abandon` delegam à sessão da tarefa 1.0 e ao repositório da tarefa 2.0.
- `result` informa acertos, erros, precisão, maior sequência e se o score superou o recorde anterior.
- Depende das tarefas 1.0 e 2.0.
</requirements>

## Subtarefas

- [x] 3.1 Escrever o teste de unidade que falha quando o catálogo vazio ainda cria sessão.
- [x] 3.2 Escrever o teste de integração que falha enquanto `start` não grava palavras distintas e deixa o progresso intocado.
- [x] 3.3 Copiar a função de sorteio do desafio e implementar o catálogo SQLite somente leitura.
- [x] 3.4 Implementar `ChallengeComposition` com `start`, `begin`, `attempt`, `expire`, `abandon` e `result`.
- [x] 3.5 Refatorar até os testes passarem sem pesos novos e sem escrita em progresso ou agenda.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`ChallengeComposition`), a decisão de não reimplementar o tabuleiro e Arquivos relevantes.

A função de sorteio vem de `app-english`. Não copiar os casos de uso que listam níveis. `app-english` não é editado.

## Critérios de Sucesso

- Uma abertura com catálogo vazio não cria linha em `ChallengeSession`.
- Uma abertura com palavras ativas grava no máximo 40 ids distintos.
- Depois do sorteio e de uma tentativa, progresso e agenda seguem iguais.
- O resultado da composição coincide com o recorde da tarefa 2.0.

## Testes da Tarefa

- [x] Testes de unidade: catálogo vazio, com catálogo falso.
- [x] Testes de integração: sorteio e `start` no `better-sqlite3`, sem alterar progresso nem agenda.
- [x] Testes E2E: não se aplicam. A rodada visual é a tarefa 5.0.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/composition/challenge.ts`
- `src/persistence/sqlite-word-catalog.ts`
- `src/persistence/sqlite-challenge-repository.ts`
- `src/lib/domain/challenge/fixed-challenge.ts`
