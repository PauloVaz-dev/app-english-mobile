# Tarefa 5.0: Resumo do dia no banco

<critical>Ler os arquivos de prd.md e techspec.md desta pasta, se você não ler esses arquivos sua tarefa será invalidada</critical>

## Visão Geral

Calcular, a partir do SQLite, quantas palavras estão vencidas, quantas novas ainda cabem hoje e qual é a próxima revisão. As contas são as do caso de uso já copiado. A tela que mostra esses números é a tarefa 6.0.

<skills>
### Conformidade com Skills Padrões

Não há `.agents/skills` neste repositório. Nenhuma skill de projeto se aplica.
</skills>

<requirements>
- `SqliteDailyReviewReader.summary` reproduz as contas do reader do site: vencidas, candidatas novas, cota diária menos palavras de origem `NEW` na data local, e a próxima revisão futura.
- Os outros métodos da porta lançam erro explícito até o PRD da revisão.
- A contagem não carrega o catálogo inteiro para o JavaScript.
- Com as 32 palavras novas e nenhum progresso, o resumo tem zero vencidas e no máximo 10 novas.
- Uma linha vencida aumenta a contagem de vencidas. Uma palavra `NEW` na data local reduz as novas disponíveis.
- Com 5.000 palavras ativas, o resumo ainda é calculado por consulta.
- Depende das tarefas 2.0, 3.0 e 4.0.
</requirements>

## Subtarefas

- [x] 5.1 Escrever os testes de integração que falham para o primeiro resumo, a palavra vencida, a palavra nova do dia e as 5.000 palavras.
- [x] 5.2 Escrever o teste de unidade que falha quando um método da porta ainda não suportado é chamado e espera o erro explícito.
- [x] 5.3 Implementar as consultas no executor compartilhado e o reader.
- [x] 5.4 Ligar o reader a `GetDailyReviewSummary` com o fuso da tarefa 4.0, ainda sem tela.
- [x] 5.5 Refatorar até os testes passarem sem duplicar a regra que já está no domínio.

## Detalhes de Implementação

Ver `techspec.md`: Interfaces Principais (`SqliteDailyReviewReader.summary`), Abordagem de Testes (integração do resumo) e a decisão do executor único para `expo-sqlite` e `better-sqlite3`.

O caso de uso `GetDailyReviewSummary` não muda. O teste observa o resultado dele, não uma conta reescrita na tela.

## Critérios de Sucesso

- Primeira abertura: `dueCount` 0 e `newAvailable` no máximo 10.
- Reabrir o mesmo arquivo no mesmo instante devolve os mesmos números.
- Palavra com `nextReviewAt` no passado aumenta `dueCount`.
- Palavra de origem `NEW` na data local reduz `newAvailable`.
- Catálogo de 5.000 palavras ativas não exige trazer todas as linhas para a memória para obter o resumo.
- Chamar método de sessão ainda não implementado falha com erro explícito.

## Testes da Tarefa

- [x] Testes de unidade: métodos da porta fora do resumo lançam erro explícito.
- [x] Testes de integração: contagens no `better-sqlite3`, inclusive 5.000 palavras e reabertura do mesmo arquivo.
- [x] Testes E2E: não se aplicam. Playwright não cobre este aplicativo, conforme a techspec.

<critical>SEMPRE CRIE E EXECUTE OS TESTES DA TAREFA ANTES DE CONSIDERÁ-LA FINALIZADA</critical>

## Arquivos relevantes

- `src/persistence/sqlite-daily-review-reader.ts`
- `src/lib/application/review/get-daily-review-summary.ts`
- `src/lib/application/review/ports/daily-review-reader.ts`
- `tests/integration/persistence/sqlite-daily-summary.test.ts`
